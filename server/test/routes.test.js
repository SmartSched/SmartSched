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
const TASK_ID = '3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b';

// Every call made on queries sent to `table`, in order, e.g. [['insert', {...}], ['select'], ['in', ...]].
function callsOn(table) {
  const queries = fake.state.queries.filter((q) => q.table === table);
  expect(queries.length).toBeGreaterThan(0);
  return queries.flatMap((q) => q.calls);
}

// The rows passed to each insert on `table`.
function inserted(table) {
  return callsOn(table)
    .filter(([method]) => method === 'insert')
    .map(([, rows]) => rows);
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

  it('records how long a finished task took, in whole minutes', async () => {
    fake.state.results = [{ data: [{ id: 't1', time_spent: 95 }], error: null }];
    const res = await request(app).patch('/api/tasks/t1').set(AUTH).send({ completed: true, time_spent: 95 });
    expect(res.status).toBe(200);
    const [, updates] = callsOn('tasks').find(([method]) => method === 'update');
    expect(updates.time_spent).toBe(95);

    fake.state.queries = [];
    const bad = await request(app).patch('/api/tasks/t1').set(AUTH).send({ time_spent: -10 });
    expect(bad.status).toBe(400);
    expect(fake.state.queries).toHaveLength(0);
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
    expect(row).toEqual({ user_id: 'user-1', ...block, start_time: '17:00:00', end_time: '18:00:00', task_id: null, location: null });
  });

  it('returns each block with its task attached', async () => {
    await request(app).get('/api/time-blocks?date=2026-09-29').set(AUTH);
    const [, columns] = callsOn('time_blocks').find(([method]) => method === 'select');
    expect(columns).toMatch(/task:tasks\(/);
  });

  it('filters by task, for adding up the time planned for one', async () => {
    await request(app).get(`/api/time-blocks?task_id=${TASK_ID}`).set(AUTH);
    expect(callsOn('time_blocks')).toContainEqual(['eq', 'task_id', TASK_ID]);
    expect((await request(app).get('/api/time-blocks?task_id=nope').set(AUTH)).status).toBe(400);
  });

  it('saves a task block only for one of your own tasks', async () => {
    const taskBlock = { ...block, type: 'task', task_id: TASK_ID };
    fake.state.results = [{ data: { id: TASK_ID }, error: null }, { data: [{ id: 'b1' }], error: null }];
    const res = await request(app).post('/api/time-blocks').set(AUTH).send(taskBlock);
    expect(res.status).toBe(201);
    expect(callsOn('tasks')).toContainEqual(['eq', 'id', TASK_ID]);
    const [, row] = callsOn('time_blocks').find(([method]) => method === 'insert');
    expect(row.task_id).toBe(TASK_ID);

    fake.state.queries = [];
    fake.state.results = [{ data: null, error: null }];
    const missing = await request(app).post('/api/time-blocks').set(AUTH).send(taskBlock);
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe('That task no longer exists');
    expect(fake.state.queries.some((q) => q.table === 'time_blocks')).toBe(false);
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

describe('commutes', () => {
  const campus = { id: 'c', date: '2026-09-29', start_time: '09:00:00', end_time: '12:00:00', activity: 'Class', type: 'class', location: 'campus', auto: false };
  const work = { id: 'w', date: '2026-09-29', start_time: '13:00:00', end_time: '17:00:00', activity: 'Shift', type: 'work', location: 'work', auto: false };
  const travel = { data: { travel: { places: [], minutes: { 'campus|work': 20 } } }, error: null };

  it('adds a commute before the next block when a saved block is somewhere else', async () => {
    // insert the work block, then: the profile's travel times, the day's blocks, the commute insert
    fake.state.results = [{ data: [work], error: null }, travel, { data: [campus, work], error: null }];
    const res = await request(app)
      .post('/api/time-blocks')
      .set(AUTH)
      .send({ activity: 'Shift', date: '2026-09-29', start_time: '13:00', end_time: '17:00', type: 'work', location: 'Work' });
    expect(res.status).toBe(201);
    expect(res.body.block).toEqual(work);
    const commute = { date: '2026-09-29', start_time: '12:40:00', end_time: '13:00:00', activity: 'Commute: Campus → Work', type: 'commute', location: null, task_id: null, series_id: null, auto: true };
    expect(res.body.commutes).toEqual({ added: [commute], tight: [] });
    expect(inserted('time_blocks')).toContainEqual([{ user_id: 'user-1', ...commute }]);
  });

  it('reports a gap too short for the trip instead of squeezing a commute in', async () => {
    const tightWork = { ...work, start_time: '12:10:00' };
    fake.state.results = [{ data: [tightWork], error: null }, travel, { data: [campus, tightWork], error: null }];
    const res = await request(app)
      .post('/api/time-blocks')
      .set(AUTH)
      .send({ activity: 'Shift', date: '2026-09-29', start_time: '12:10', end_time: '17:00', type: 'work', location: 'work' });
    expect(res.body.commutes).toEqual({
      added: [],
      tight: [{ date: '2026-09-29', from: 'campus', to: 'work', gap: 10, needed: 20, after: 'Class', before: 'Shift' }],
    });
    expect(inserted('time_blocks')).toHaveLength(1); // just the block itself
  });

  it('clears the day\'s old automatic commutes before working them out again', async () => {
    const oldCommute = { id: 'old', date: '2026-09-29', start_time: '12:30:00', end_time: '12:50:00', activity: 'Commute: Campus → Work', type: 'commute', location: null, auto: true };
    fake.state.results = [{ data: [work], error: null }, travel, { data: [campus, work, oldCommute], error: null }];
    await request(app)
      .post('/api/time-blocks')
      .set(AUTH)
      .send({ activity: 'Shift', date: '2026-09-29', start_time: '13:00', end_time: '17:00', type: 'work', location: 'work' });
    expect(callsOn('time_blocks')).toContainEqual(['in', 'id', ['old']]);
  });

  it('editing one block from a repeat detaches it, and an edited automatic commute becomes the user\'s own', async () => {
    fake.state.results = [{ data: { ...campus, series_id: 's1', auto: true }, error: null }, { data: [campus], error: null }];
    const res = await request(app).patch('/api/time-blocks/c').set(AUTH).send({ end_time: '12:30' });
    expect(res.status).toBe(200);
    const [, updates] = callsOn('time_blocks').find(([method]) => method === 'update');
    expect(updates).toMatchObject({ series_id: null, auto: false, end_time: '12:30:00' });
  });

  it('saves travel times', async () => {
    fake.state.results = [{ data: [{ id: 'user-1', travel: { places: [], minutes: { 'campus|work': 20 } } }], error: null }];
    const res = await request(app).put('/api/profile/travel').set(AUTH).send({ travel: { places: [], minutes: { 'work|campus': 20 } } });
    expect(res.status).toBe(200);
    const [, updates] = callsOn('profiles').find(([method]) => method === 'update');
    expect(updates).toEqual({ travel: { places: [], minutes: { 'campus|work': 20 } } });

    const bad = await request(app).put('/api/profile/travel').set(AUTH).send({ travel: { minutes: { 'home|mars': 5 } } });
    expect(bad.status).toBe(400);
  });
});

describe('repeating blocks', () => {
  const rule = {
    activity: 'CSC 453', type: 'class', location: 'campus', start_time: '10:00', end_time: '11:15',
    days_of_week: [1, 3], interval_weeks: 1, start_date: '2026-09-28', end_date: '2026-10-09',
  };

  it('saves the rule once and writes out a block for each date', async () => {
    fake.state.results = [{ data: [{ id: 's1', user_id: 'user-1', ...rule }], error: null }];
    const res = await request(app).post('/api/block-series').set(AUTH).send(rule);
    expect(res.status).toBe(201);
    const [rows] = inserted('time_blocks');
    expect(rows.map((r) => r.date)).toEqual(['2026-09-28', '2026-09-30', '2026-10-05', '2026-10-07']);
    expect(rows[0]).toMatchObject({ user_id: 'user-1', series_id: 's1', activity: 'CSC 453', location: 'campus', task_id: null });
  });

  it('rejects a rule that never happens, or can\'t be saved', async () => {
    const never = await request(app).post('/api/block-series').set(AUTH).send({ ...rule, days_of_week: [6], end_date: '2026-10-02' });
    expect(never.status).toBe(400);
    expect(never.body.error).toMatch(/None of those days/);
    expect((await request(app).post('/api/block-series').set(AUTH).send({ ...rule, days_of_week: [] })).status).toBe(400);
    expect(fake.state.queries).toHaveLength(0);
  });

  it('changing all of them rewrites the blocks from the new rule', async () => {
    fake.state.results = [
      { data: [{ id: 's1', user_id: 'user-1', ...rule, days_of_week: [2] }], error: null }, // update the rule
      { data: [{ date: '2026-09-28' }, { date: '2026-09-30' }], error: null }, // delete the old blocks
    ];
    const res = await request(app).put('/api/block-series/s1').set(AUTH).send({ ...rule, days_of_week: [2] });
    expect(res.status).toBe(200);
    expect(callsOn('time_blocks')).toContainEqual(['eq', 'series_id', 's1']);
    const [rows] = inserted('time_blocks');
    expect(rows.map((r) => r.date)).toEqual(['2026-09-29', '2026-10-06']);
  });

  it('deleting all of them removes the rule (its blocks go with it)', async () => {
    fake.state.results = [{ data: [{ date: '2026-09-28' }], error: null }, { data: [{ id: 's1' }], error: null }];
    const res = await request(app).delete('/api/block-series/s1').set(AUTH);
    expect(res.status).toBe(204);
    expect(callsOn('time_block_series')).toContainEqual(['eq', 'id', 's1']);
  });

  it('says 404 for a repeat that isn\'t there', async () => {
    fake.state.results = [{ data: [], error: null }];
    expect((await request(app).put('/api/block-series/nope').set(AUTH).send(rule)).status).toBe(404);
  });
});
