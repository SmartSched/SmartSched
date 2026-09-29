// Smoke tests for every API route, with Supabase replaced by a fake so no database or network is needed.
// The fake records each query (table + chained calls like insert/eq/select) and answers with the next
// queued result, or { data: [], error: null }.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const fake = vi.hoisted(() => {
  const state = { user: { id: 'user-1' }, results: [], queries: [] };

  function from(table) {
    const query = { table, calls: [] };
    state.queries.push(query);
    const builder = new Proxy(
      {},
      {
        get(_, method) {
          // Awaiting the chain runs the "query".
          if (method === 'then') {
            const result = state.results.shift() ?? { data: [], error: null };
            return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
          }
          return (...args) => {
            query.calls.push([method, ...args]);
            return builder;
          };
        },
      },
    );
    return builder;
  }

  const client = {
    auth: {
      getUser: async () =>
        state.user ? { data: { user: state.user }, error: null } : { data: { user: null }, error: new Error('bad token') },
    },
    from,
  };
  return { state, client };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake.client }));

const { app } = await import('../app.js');
const AUTH = { Authorization: 'Bearer test-token' };

// The calls made on the one query sent to `table`, e.g. [['insert', {...}], ['select']].
function callsOn(table) {
  const queries = fake.state.queries.filter((q) => q.table === table);
  expect(queries).toHaveLength(1);
  return queries[0].calls;
}

beforeEach(() => {
  fake.state.user = { id: 'user-1' };
  fake.state.results = [];
  fake.state.queries = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

const ROUTES = [
  ['get', '/api/profile'],
  ['put', '/api/profile/survey'],
  ['get', '/api/tasks'],
  ['post', '/api/tasks'],
  ['patch', '/api/tasks/abc'],
  ['delete', '/api/tasks/abc'],
  ['get', '/api/time-blocks'],
  ['post', '/api/time-blocks'],
  ['patch', '/api/time-blocks/abc'],
  ['delete', '/api/time-blocks/abc'],
  ['get', '/api/reflections/2026-09-29'],
  ['post', '/api/reflections'],
];

describe('every route', () => {
  it('health check answers without logging in', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it.each(ROUTES)('%s %s needs a login', async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(fake.state.queries).toHaveLength(0);
  });

  it.each(ROUTES)('%s %s turns away a token Supabase rejects', async (method, path) => {
    fake.state.user = null;
    const res = await request(app)[method](path).set(AUTH);
    expect(res.status).toBe(401);
  });

  it('unknown API routes, including the removed habits ones, get a JSON 404', async () => {
    for (const path of ['/api/nope', '/api/habits']) {
      const res = await request(app).get(path);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Not found' });
    }
  });

  it('a body that isn\'t JSON gets a JSON 400, not an HTML page', async () => {
    const res = await request(app).post('/api/tasks').set(AUTH).set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'The request was not valid JSON' });
  });

  it('database errors are logged, and the user gets a plain message instead of Postgres text', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    fake.state.results = [{ data: null, error: { message: 'new row violates check constraint "time_blocks_type_check"' } }];
    const res = await request(app).get('/api/tasks').set(AUTH);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Something went wrong on our end. Try again in a moment.');
    expect(JSON.stringify(res.body)).not.toMatch(/constraint/);
    expect(log).toHaveBeenCalled();
  });
});

describe('tasks', () => {
  it('lists tasks newest first', async () => {
    fake.state.results = [{ data: [{ id: 't1', title: 'Essay' }], error: null }];
    const res = await request(app).get('/api/tasks').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 't1', title: 'Essay' }]);
    expect(callsOn('tasks')).toContainEqual(['order', 'created_at', { ascending: false }]);
  });

  it('creates a task for the logged-in user with a trimmed title', async () => {
    fake.state.results = [{ data: [{ id: 't1' }], error: null }];
    const res = await request(app).post('/api/tasks').set(AUTH).send({ title: '  Essay  ', type: 'homework', priority: 'high' });
    expect(res.status).toBe(201);
    const [, row] = callsOn('tasks').find(([method]) => method === 'insert');
    expect(row).toMatchObject({ user_id: 'user-1', title: 'Essay', type: 'homework', priority: 'high' });
  });

  it('needs a title', async () => {
    const res = await request(app).post('/api/tasks').set(AUTH).send({ title: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Title is required');
    expect(fake.state.queries).toHaveLength(0);
  });

  it('sets completed_at when a task is checked off', async () => {
    fake.state.results = [{ data: [{ id: 't1', completed: true }], error: null }];
    const res = await request(app).patch('/api/tasks/t1').set(AUTH).send({ completed: true });
    expect(res.status).toBe(200);
    const [, updates] = callsOn('tasks').find(([method]) => method === 'update');
    expect(updates.completed).toBe(true);
    expect(typeof updates.completed_at).toBe('string');
  });

  it('says 404 when the task isn\'t there (or isn\'t yours)', async () => {
    const res = await request(app).delete('/api/tasks/missing').set(AUTH);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Task not found');
  });
});

describe('time blocks', () => {
  const block = { activity: 'Gym', date: '2026-09-29', start_time: '17:00', end_time: '18:00', type: 'personal' };

  it('filters by a day, or by a date range for the week view', async () => {
    await request(app).get('/api/time-blocks?date=2026-09-29').set(AUTH);
    expect(callsOn('time_blocks')).toContainEqual(['eq', 'date', '2026-09-29']);

    fake.state.queries = [];
    await request(app).get('/api/time-blocks?start=2026-09-27&end=2026-10-03').set(AUTH);
    expect(callsOn('time_blocks')).toEqual(expect.arrayContaining([['gte', 'date', '2026-09-27'], ['lte', 'date', '2026-10-03']]));
  });

  it('rejects bad dates and backwards ranges', async () => {
    expect((await request(app).get('/api/time-blocks?date=2026-02-30').set(AUTH)).status).toBe(400);
    expect((await request(app).get('/api/time-blocks?start=2026-10-03&end=2026-09-27').set(AUTH)).status).toBe(400);
  });

  it('saves a valid block with normalized times', async () => {
    fake.state.results = [{ data: [{ id: 'b1' }], error: null }];
    const res = await request(app).post('/api/time-blocks').set(AUTH).send(block);
    expect(res.status).toBe(201);
    const [, row] = callsOn('time_blocks').find(([method]) => method === 'insert');
    expect(row).toEqual({ user_id: 'user-1', ...block, start_time: '17:00:00', end_time: '18:00:00' });
  });

  it('never reaches the database with an invalid block', async () => {
    const res = await request(app).post('/api/time-blocks').set(AUTH).send({ ...block, end_time: '16:00' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('End time must be after start time');
    expect(fake.state.queries).toHaveLength(0);
  });

  it('checks an edit against the saved block, so sending only a new end time still works', async () => {
    const saved = { id: 'b1', user_id: 'user-1', ...block, start_time: '17:00:00', end_time: '18:00:00' };
    fake.state.results = [{ data: saved, error: null }, { data: [{ ...saved, end_time: '18:30:00' }], error: null }];
    const res = await request(app).patch('/api/time-blocks/b1').set(AUTH).send({ end_time: '18:30' });
    expect(res.status).toBe(200);

    fake.state.results = [{ data: saved, error: null }];
    const bad = await request(app).patch('/api/time-blocks/b1').set(AUTH).send({ end_time: '16:30' });
    expect(bad.status).toBe(400);
  });

  it('says 404 when editing a block that isn\'t there', async () => {
    fake.state.results = [{ data: null, error: null }];
    const res = await request(app).patch('/api/time-blocks/missing').set(AUTH).send({ end_time: '18:30' });
    expect(res.status).toBe(404);
  });
});

describe('profile survey', () => {
  it('saves valid answers and rejects invalid ones', async () => {
    const survey = {
      commitments: { classes: 15 },
      focus_time: 'morning',
      work_session: '45',
      non_negotiables: ['sleep'],
      deadline_style: 'steady',
      calendar_style: 'calendar2',
    };
    fake.state.results = [{ data: [{ id: 'user-1', survey }], error: null }];
    expect((await request(app).put('/api/profile/survey').set(AUTH).send({ survey })).status).toBe(200);

    const res = await request(app).put('/api/profile/survey').set(AUTH).send({ survey: { ...survey, focus_time: 'noon' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid answer for focus_time');
  });
});

describe('reflections', () => {
  const ratings = { productivity: 4, mood: 3, energy: 2, sleep: 5 };

  it('saves one reflection per day, all four ratings required', async () => {
    fake.state.results = [{ data: [{ date: '2026-09-29', ratings }], error: null }];
    const res = await request(app).post('/api/reflections').set(AUTH).send({ date: '2026-09-29', ratings });
    expect(res.status).toBe(201);
    const [, row, options] = callsOn('reflections').find(([method]) => method === 'upsert');
    expect(row).toEqual({ user_id: 'user-1', date: '2026-09-29', ratings });
    expect(options).toEqual({ onConflict: 'user_id,date' });

    fake.state.queries = [];
    const missing = await request(app).post('/api/reflections').set(AUTH).send({ date: '2026-09-29', ratings: { ...ratings, mood: 0 } });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe('Rate mood from 1 to 5');
    expect(fake.state.queries).toHaveLength(0);
  });

  it('rejects a bad date', async () => {
    expect((await request(app).get('/api/reflections/yesterday').set(AUTH)).status).toBe(400);
    expect((await request(app).post('/api/reflections').set(AUTH).send({ date: '2026-02-30', ratings })).status).toBe(400);
  });
});
