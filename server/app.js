import express from 'express';
import cors from 'cors';
import ws from 'ws';
import { createClient } from '@supabase/supabase-js';
import {
  isUuid,
  isValidDate,
  isValidTimeSpent,
  validateRatings,
  validateSeries,
  validateSurvey,
  validateTimeBlock,
  validateTravel,
} from './validation.js';
import { expandSeries } from './series.js';
import { planCommutes } from './commute.js';

// The Express app with every route. index.js starts it; the tests use it directly.
export const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

function getUserClient(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    realtime: { transport: ws },
  });
}

async function requireAuth(req, res, next) {
  if (!req.headers.authorization?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const client = getUserClient(req);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  req.supabase = client;
  req.userId = data.user.id;
  next();
}

// Database errors are raw Postgres text ("violates check constraint ..."), so log the details for us
// and send the user a plain message.
function serverError(res, error) {
  console.error(error);
  res.status(500).json({ error: 'Something went wrong on our end. Try again in a moment.' });
}

const PROFILE_COLUMNS = 'id, name, survey, survey_updated_at, travel';

app.get('/api/profile', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', req.userId)
    .maybeSingle();
  if (error) return serverError(res, error);
  res.json(data);
});

app.put('/api/profile/survey', requireAuth, async (req, res) => {
  const { survey, error: validationError } = validateSurvey(req.body.survey);
  if (validationError) return res.status(400).json({ error: validationError });
  // Upsert so a student whose profile row was never created at sign-up can still save.
  const { data, error } = await req.supabase
    .from('profiles')
    .upsert({ id: req.userId, survey, survey_updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select(PROFILE_COLUMNS);
  if (error) return serverError(res, error);
  res.json(data[0]);
});

// Saving travel times also rebuilds the automatic commutes for the next eight weeks, so they show up
// without having to touch each day.
app.put('/api/profile/travel', requireAuth, async (req, res) => {
  const { travel, error: validationError } = validateTravel(req.body.travel);
  if (validationError) return res.status(400).json({ error: validationError });
  const { data, error } = await req.supabase
    .from('profiles')
    .update({ travel })
    .eq('id', req.userId)
    .select(PROFILE_COLUMNS);
  if (error) return serverError(res, error);
  if (data.length === 0) return res.status(404).json({ error: 'Profile not found' });

  // From yesterday (UTC), so the user's own "today" is covered in any time zone.
  const today = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const until = new Date(Date.now() + 56 * 86_400_000).toISOString().slice(0, 10);
  const { data: upcoming } = await req.supabase
    .from('time_blocks')
    .select('date')
    .gte('date', today)
    .lte('date', until)
    .not('location', 'is', null);
  await recalcCommutes(req, (upcoming ?? []).map((b) => b.date));
  res.json(data[0]);
});

app.get('/api/tasks', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase.from('tasks').select('*').order('created_at', { ascending: false });
  if (error) return serverError(res, error);
  res.json(data);
});

app.post('/api/tasks', requireAuth, async (req, res) => {
  const { title, description, type, priority, due_date, estimated_time } = req.body;
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  const { data, error } = await req.supabase
    .from('tasks')
    .insert({ user_id: req.userId, title: title.trim(), description, type, priority, due_date, estimated_time })
    .select();
  if (error) return serverError(res, error);
  res.status(201).json(data[0]);
});

const EDITABLE_TASK_FIELDS = ['title', 'description', 'type', 'priority', 'due_date', 'estimated_time', 'completed', 'time_spent'];

app.patch('/api/tasks/:id', requireAuth, async (req, res) => {
  const updates = {};
  for (const field of EDITABLE_TASK_FIELDS) {
    if (field in req.body) updates[field] = req.body[field];
  }
  if ('title' in updates) {
    if (typeof updates.title !== 'string' || !updates.title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    updates.title = updates.title.trim();
  }
  if ('time_spent' in updates && !isValidTimeSpent(updates.time_spent)) {
    return res.status(400).json({ error: 'Time spent must be a whole number of minutes' });
  }
  if ('completed' in updates) {
    updates.completed_at = updates.completed ? new Date().toISOString() : null;
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  const { data, error } = await req.supabase
    .from('tasks')
    .update(updates)
    .eq('id', req.params.id)
    .select();
  if (error) return serverError(res, error);
  if (data.length === 0) return res.status(404).json({ error: 'Task not found' });
  res.json(data[0]);
});

app.delete('/api/tasks/:id', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase
    .from('tasks')
    .delete()
    .eq('id', req.params.id)
    .select();
  if (error) return serverError(res, error);
  if (data.length === 0) return res.status(404).json({ error: 'Task not found' });
  res.status(204).end();
});

// Task blocks come back with their task, so the planner can show its title, priority and checkbox.
const BLOCK_COLUMNS =
  '*, task:tasks(id, title, priority, type, completed, due_date, estimated_time, time_spent), ' +
  'series:time_block_series(id, days_of_week, interval_weeks, start_date, end_date)';

// A task block has to point at one of the user's own tasks. Row-level security hides everyone else's,
// so "not found" covers both a deleted task and someone else's.
async function checkTask(req, res, taskId) {
  const { data, error } = await req.supabase.from('tasks').select('id').eq('id', taskId).maybeSingle();
  if (error) {
    serverError(res, error);
    return false;
  }
  if (!data) {
    res.status(400).json({ error: 'That task no longer exists' });
    return false;
  }
  return true;
}

app.get('/api/time-blocks', requireAuth, async (req, res) => {
  let query = req.supabase.from('time_blocks').select(BLOCK_COLUMNS);

  if (req.query.task_id !== undefined) {
    if (!isUuid(req.query.task_id)) return res.status(400).json({ error: 'task_id must be a task id' });
    query = query.eq('task_id', req.query.task_id);
  }
  if (req.query.date !== undefined) {
    if (!isValidDate(req.query.date)) return res.status(400).json({ error: 'Date must be a valid YYYY-MM-DD date' });
    query = query.eq('date', req.query.date);
  } else if (req.query.start !== undefined || req.query.end !== undefined) {
    if (!isValidDate(req.query.start) || !isValidDate(req.query.end)) {
      return res.status(400).json({ error: 'start and end must both be valid YYYY-MM-DD dates' });
    }
    if (req.query.end < req.query.start) {
      return res.status(400).json({ error: 'end must be on or after start' });
    }
    query = query.gte('date', req.query.start).lte('date', req.query.end);
  }

  const { data, error } = await query.order('date', { ascending: true }).order('start_time', { ascending: true });
  if (error) return serverError(res, error);
  res.json(data);
});

// Rebuilds the automatic commutes on the given dates (the user's own blocks never change) and reports
// what it added and where a trip doesn't fit. A failure here doesn't undo the save that triggered it.
async function recalcCommutes(req, dates) {
  const days = [...new Set(dates)];
  if (days.length === 0) return { added: [], tight: [] };
  try {
    const { data: profile, error: profileError } = await req.supabase
      .from('profiles')
      .select('travel')
      .eq('id', req.userId)
      .maybeSingle();
    if (profileError) throw profileError;
    const { data: blocks, error } = await req.supabase.from('time_blocks').select('*').in('date', days);
    if (error) throw error;

    const add = [];
    const tight = [];
    for (const date of days) {
      const plan = planCommutes(blocks.filter((b) => b.date === date), profile?.travel?.minutes ?? {});
      add.push(...plan.add);
      tight.push(...plan.tight);
    }
    const stale = blocks.filter((b) => b.auto).map((b) => b.id);
    if (stale.length) {
      const { error: deleteError } = await req.supabase.from('time_blocks').delete().in('id', stale);
      if (deleteError) throw deleteError;
    }
    if (add.length) {
      const { error: insertError } = await req.supabase
        .from('time_blocks')
        .insert(add.map((row) => ({ user_id: req.userId, ...row })));
      if (insertError) throw insertError;
    }
    // "added" is only what's new, so a save that leaves an existing commute in place doesn't announce it again.
    const existed = (row) =>
      blocks.some(
        (b) => b.auto && b.date === row.date && b.start_time === row.start_time && b.end_time === row.end_time && b.activity === row.activity,
      );
    return { added: add.filter((row) => !existed(row)), tight };
  } catch (error) {
    console.error(error);
    return { added: [], tight: [], failed: true };
  }
}

app.post('/api/time-blocks', requireAuth, async (req, res) => {
  const { block, error: validationError } = validateTimeBlock(req.body);
  if (validationError) return res.status(400).json({ error: validationError });
  if (block.task_id && !(await checkTask(req, res, block.task_id))) return;
  const { data, error } = await req.supabase
    .from('time_blocks')
    .insert({ user_id: req.userId, ...block })
    .select(BLOCK_COLUMNS);
  if (error) return serverError(res, error);
  const commutes = await recalcCommutes(req, [block.date]);
  res.status(201).json({ block: data[0], commutes });
});

// Edits one block. A block from a repeat is detached from it (editing every block in a repeat goes through
// /api/block-series), and a commute the app added becomes the user's own once they change it.
app.patch('/api/time-blocks/:id', requireAuth, async (req, res) => {
  // Merge onto the saved row so the start/end check still works when only one of them is sent.
  const { data: existing, error: fetchError } = await req.supabase
    .from('time_blocks')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();
  if (fetchError) return serverError(res, fetchError);
  if (!existing) return res.status(404).json({ error: 'Time block not found' });

  const { block, error: validationError } = validateTimeBlock({ ...existing, ...req.body });
  if (validationError) return res.status(400).json({ error: validationError });
  if (block.task_id && block.task_id !== existing.task_id && !(await checkTask(req, res, block.task_id))) return;
  const { data, error } = await req.supabase
    .from('time_blocks')
    .update({ ...block, series_id: null, auto: false })
    .eq('id', req.params.id)
    .select(BLOCK_COLUMNS);
  if (error) return serverError(res, error);
  if (data.length === 0) return res.status(404).json({ error: 'Time block not found' });
  const commutes = await recalcCommutes(req, [existing.date, block.date]);
  res.json({ block: data[0], commutes });
});

app.delete('/api/time-blocks/:id', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase
    .from('time_blocks')
    .delete()
    .eq('id', req.params.id)
    .select();
  if (error) return serverError(res, error);
  if (data.length === 0) return res.status(404).json({ error: 'Time block not found' });
  await recalcCommutes(req, [data[0].date]);
  res.status(204).end();
});

// Writes out one block per date of a repeat.
async function insertOccurrences(req, series) {
  const { id, user_id, days_of_week, interval_weeks, start_date, end_date, created_at, ...fields } = series;
  const rows = expandSeries(series).map((date) => ({ user_id: req.userId, ...fields, date, task_id: null, series_id: id }));
  return req.supabase.from('time_blocks').insert(rows).select(BLOCK_COLUMNS);
}

app.post('/api/block-series', requireAuth, async (req, res) => {
  const { series, error: validationError } = validateSeries(req.body);
  if (validationError) return res.status(400).json({ error: validationError });
  if (expandSeries(series).length === 0) {
    return res.status(400).json({ error: 'None of those days fall between the start and end dates' });
  }
  const { data, error } = await req.supabase
    .from('time_block_series')
    .insert({ user_id: req.userId, ...series })
    .select();
  if (error) return serverError(res, error);
  const { data: blocks, error: blocksError } = await insertOccurrences(req, data[0]);
  if (blocksError) return serverError(res, blocksError);
  const commutes = await recalcCommutes(req, blocks.map((b) => b.date));
  res.status(201).json({ series: data[0], blocks, commutes });
});

// Changes every block in a repeat: the rule is updated and its blocks are written out again. Blocks
// edited on their own ("just this one") were detached earlier, so they stay as they are.
app.put('/api/block-series/:id', requireAuth, async (req, res) => {
  const { series, error: validationError } = validateSeries(req.body);
  if (validationError) return res.status(400).json({ error: validationError });
  if (expandSeries(series).length === 0) {
    return res.status(400).json({ error: 'None of those days fall between the start and end dates' });
  }
  const { data, error } = await req.supabase
    .from('time_block_series')
    .update(series)
    .eq('id', req.params.id)
    .select();
  if (error) return serverError(res, error);
  if (data.length === 0) return res.status(404).json({ error: 'Repeat not found' });

  const { data: old, error: deleteError } = await req.supabase
    .from('time_blocks')
    .delete()
    .eq('series_id', req.params.id)
    .select('date');
  if (deleteError) return serverError(res, deleteError);
  const { data: blocks, error: blocksError } = await insertOccurrences(req, data[0]);
  if (blocksError) return serverError(res, blocksError);
  const commutes = await recalcCommutes(req, [...old.map((b) => b.date), ...blocks.map((b) => b.date)]);
  res.json({ series: data[0], blocks, commutes });
});

app.delete('/api/block-series/:id', requireAuth, async (req, res) => {
  const { data: old, error: fetchError } = await req.supabase
    .from('time_blocks')
    .select('date')
    .eq('series_id', req.params.id);
  if (fetchError) return serverError(res, fetchError);
  const { data, error } = await req.supabase.from('time_block_series').delete().eq('id', req.params.id).select();
  if (error) return serverError(res, error);
  if (data.length === 0) return res.status(404).json({ error: 'Repeat not found' });
  await recalcCommutes(req, old.map((b) => b.date));
  res.status(204).end();
});

app.get('/api/reflections/:date', requireAuth, async (req, res) => {
  if (!isValidDate(req.params.date)) return res.status(400).json({ error: 'Date must be a valid YYYY-MM-DD date' });
  const { data, error } = await req.supabase
    .from('reflections')
    .select('*')
    .eq('date', req.params.date)
    .maybeSingle();
  if (error) return serverError(res, error);
  res.json(data);
});

app.post('/api/reflections', requireAuth, async (req, res) => {
  const { date } = req.body;
  if (!isValidDate(date)) return res.status(400).json({ error: 'Date must be a valid YYYY-MM-DD date' });
  const { ratings, error: validationError } = validateRatings(req.body.ratings);
  if (validationError) return res.status(400).json({ error: validationError });
  const { data, error } = await req.supabase
    .from('reflections')
    .upsert({ user_id: req.userId, date, ratings }, { onConflict: 'user_id,date' })
    .select();
  if (error) return serverError(res, error);
  res.status(201).json(data[0]);
});

// Unknown API routes and anything thrown (like a request body that isn't valid JSON) get a JSON error
// instead of Express's default HTML page.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request was not valid JSON' });
  serverError(res, err);
});
