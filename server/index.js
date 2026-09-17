import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import ws from 'ws';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = process.env.PORT || 3001;

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

// Keys must match src/app/lib/survey.ts.
const SURVEY_OPTIONS = {
  commitments: ['classes', 'work', 'commute', 'standing'],
  focus_time: ['early_morning', 'morning', 'afternoon', 'evening', 'late_night'],
  work_session: ['25', '45', '90', '120_plus'],
  non_negotiables: ['sleep', 'meals', 'exercise', 'friends', 'family', 'day_off', 'hobby'],
  deadline_style: ['steady', 'day_before', 'night_before', 'depends'],
  calendar_style: ['calendar1', 'calendar2', 'calendar3', 'calendar4'],
};

// Returns { survey } with only known fields, or { error } describing the first problem.
function validateSurvey(input) {
  if (!input || typeof input !== 'object') return { error: 'Survey answers are required' };

  const commitments = {};
  for (const [key, hours] of Object.entries(input.commitments ?? {})) {
    if (!SURVEY_OPTIONS.commitments.includes(key)) return { error: `Unknown commitment: ${key}` };
    if (typeof hours !== 'number' || !(hours > 0) || hours > 168) {
      return { error: 'Commitment hours must be between 0 and 168 per week' };
    }
    commitments[key] = hours;
  }
  if (Object.keys(commitments).length === 0) return { error: 'Pick at least one weekly commitment' };

  for (const field of ['focus_time', 'work_session', 'deadline_style', 'calendar_style']) {
    if (!SURVEY_OPTIONS[field].includes(input[field])) return { error: `Invalid answer for ${field}` };
  }

  const nonNegotiables = input.non_negotiables;
  if (!Array.isArray(nonNegotiables) || nonNegotiables.length === 0) {
    return { error: 'Pick at least one thing that has to stay in your week' };
  }
  if (!nonNegotiables.every((item) => SURVEY_OPTIONS.non_negotiables.includes(item))) {
    return { error: 'Invalid answer for non_negotiables' };
  }

  return {
    survey: {
      commitments,
      focus_time: input.focus_time,
      work_session: input.work_session,
      non_negotiables: [...new Set(nonNegotiables)],
      deadline_style: input.deadline_style,
      calendar_style: input.calendar_style,
    },
  };
}

const PROFILE_COLUMNS = 'id, name, survey, survey_updated_at';

app.get('/api/profile', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', req.userId)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
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
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

app.get('/api/tasks', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase.from('tasks').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
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
  if (error) return res.status(500).json({ error: error.message });
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
  if (error) return res.status(500).json({ error: error.message });
  if (data.length === 0) return res.status(404).json({ error: 'Task not found' });
  res.json(data[0]);
});

app.delete('/api/tasks/:id', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase
    .from('tasks')
    .delete()
    .eq('id', req.params.id)
    .select();
  if (error) return res.status(500).json({ error: error.message });
  if (data.length === 0) return res.status(404).json({ error: 'Task not found' });
  res.status(204).end();
});

app.get('/api/habits', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase.from('habits').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/habits', requireAuth, async (req, res) => {
  const { name, icon, goal } = req.body;
  const { data, error } = await req.supabase
    .from('habits')
    .insert({ user_id: req.userId, name, icon, goal })
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

const TIME_BLOCK_TYPES = ['class', 'study', 'break', 'personal', 'commute', 'meal', 'work'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

// "09:30" and "09:30:00" both become "09:30:00" so times compare correctly as strings.
function normalizeTime(value) {
  return value.length === 5 ? `${value}:00` : value;
}

// Returns { block } with only known fields, or { error } describing the first problem.
function validateTimeBlock(input) {
  const activity = typeof input.activity === 'string' ? input.activity.trim() : '';
  if (!activity) return { error: 'Activity is required' };
  if (!isValidDate(input.date)) return { error: 'Date must be a valid YYYY-MM-DD date' };
  if (typeof input.start_time !== 'string' || !TIME_PATTERN.test(input.start_time)) {
    return { error: 'Start time must be HH:MM' };
  }
  if (typeof input.end_time !== 'string' || !TIME_PATTERN.test(input.end_time)) {
    return { error: 'End time must be HH:MM' };
  }
  const start_time = normalizeTime(input.start_time);
  const end_time = normalizeTime(input.end_time);
  if (end_time <= start_time) return { error: 'End time must be after start time' };
  if (!TIME_BLOCK_TYPES.includes(input.type)) return { error: 'Invalid block type' };
  return { block: { activity, date: input.date, start_time, end_time, type: input.type } };
}

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
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/time-blocks', requireAuth, async (req, res) => {
  const { block, error: validationError } = validateTimeBlock(req.body);
  if (validationError) return res.status(400).json({ error: validationError });
  const { data, error } = await req.supabase
    .from('time_blocks')
    .insert({ user_id: req.userId, ...block })
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

app.patch('/api/time-blocks/:id', requireAuth, async (req, res) => {
  // Merge onto the saved row so the start/end check still works when only one of them is sent.
  const { data: existing, error: fetchError } = await req.supabase
    .from('time_blocks')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();
  if (fetchError) return res.status(500).json({ error: fetchError.message });
  if (!existing) return res.status(404).json({ error: 'Time block not found' });

  const { block, error: validationError } = validateTimeBlock({ ...existing, ...req.body });
  if (validationError) return res.status(400).json({ error: validationError });
  const { data, error } = await req.supabase
    .from('time_blocks')
    .update(block)
    .eq('id', req.params.id)
    .select();
  if (error) return res.status(500).json({ error: error.message });
  if (data.length === 0) return res.status(404).json({ error: 'Time block not found' });
  res.json(data[0]);
});

app.delete('/api/time-blocks/:id', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase
    .from('time_blocks')
    .delete()
    .eq('id', req.params.id)
    .select();
  if (error) return res.status(500).json({ error: error.message });
  if (data.length === 0) return res.status(404).json({ error: 'Time block not found' });
  res.status(204).end();
});

app.get('/api/reflections/:date', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase
    .from('reflections')
    .select('*')
    .eq('date', req.params.date)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/reflections', requireAuth, async (req, res) => {
  const { date, ratings } = req.body;
  const { data, error } = await req.supabase
    .from('reflections')
    .upsert({ user_id: req.userId, date, ratings }, { onConflict: 'user_id,date' })
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

app.listen(PORT, () => {
  console.log(`SmartSched server listening on port ${PORT}`);
});
