import express from 'express';
import cors from 'cors';
import ws from 'ws';
import { createClient } from '@supabase/supabase-js';
import { isValidDate, validateRatings, validateSurvey, validateTimeBlock } from './validation.js';

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

const PROFILE_COLUMNS = 'id, name, survey, survey_updated_at';

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

const EDITABLE_TASK_FIELDS = ['title', 'description', 'type', 'priority', 'due_date', 'estimated_time', 'completed'];

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

app.get('/api/time-blocks', requireAuth, async (req, res) => {
  let query = req.supabase.from('time_blocks').select('*');

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

app.post('/api/time-blocks', requireAuth, async (req, res) => {
  const { block, error: validationError } = validateTimeBlock(req.body);
  if (validationError) return res.status(400).json({ error: validationError });
  const { data, error } = await req.supabase
    .from('time_blocks')
    .insert({ user_id: req.userId, ...block })
    .select();
  if (error) return serverError(res, error);
  res.status(201).json(data[0]);
});

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
  const { data, error } = await req.supabase
    .from('time_blocks')
    .update(block)
    .eq('id', req.params.id)
    .select();
  if (error) return serverError(res, error);
  if (data.length === 0) return res.status(404).json({ error: 'Time block not found' });
  res.json(data[0]);
});

app.delete('/api/time-blocks/:id', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase
    .from('time_blocks')
    .delete()
    .eq('id', req.params.id)
    .select();
  if (error) return serverError(res, error);
  if (data.length === 0) return res.status(404).json({ error: 'Time block not found' });
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
