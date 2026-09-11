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

app.get('/api/time-blocks', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase.from('time_blocks').select('*').order('start_time', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/time-blocks', requireAuth, async (req, res) => {
  const { date, start_time, end_time, activity, type } = req.body;
  const { data, error } = await req.supabase
    .from('time_blocks')
    .insert({ user_id: req.userId, date, start_time, end_time, activity, type })
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
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
