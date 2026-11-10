import express from 'express';
import cors from 'cors';
import ws from 'ws';
import { createClient } from '@supabase/supabase-js';
import {
  isUuid,
  isValidDate,
  isValidTimeSpent,
  validateRatings,
  validateSleepTimes,
  validateSeries,
  validateSurvey,
  validateTimeBlock,
  validateTravel,
  validateAppearance,
  validateAvatar,
} from './validation.js';
import { expandSeries } from './series.js';
import { planCommutes } from './commute.js';
import { buildSolverInput, preferencesOutOfDate, savedPreferences, startsBefore } from './solverInput.js';
import { askModel } from './model.js';
import { addDays, checkFeedUrl, feedBlocks, fetchFeed, isTimeZone, localToday, maskFeedUrl, FEED_ERRORS } from './calendarFeed.js';

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

const PROFILE_COLUMNS =
  'id, name, survey, survey_updated_at, travel, consented_at, consent_version, theme_mode, accent, avatar';

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
  // New answers, new preferences. Needs the browser's clock; without it the next plan refreshes them.
  const clock = localClock(req.body);
  if (clock) await refreshPreferences(req, clock);
  res.json(data[0]);
});

// #31 The tester agreed to the consent text. The text lives in the app, so the app sends the version it
// showed; when the text changes the app asks again.
app.put('/api/profile/consent', requireAuth, async (req, res) => {
  const version = req.body.version;
  if (typeof version !== 'string' || !/^[\w.-]{1,40}$/.test(version)) {
    return res.status(400).json({ error: 'Consent version is required' });
  }
  const { data, error } = await req.supabase
    .from('profiles')
    .upsert({ id: req.userId, consented_at: new Date().toISOString(), consent_version: version }, { onConflict: 'id' })
    .select(PROFILE_COLUMNS);
  if (error) return serverError(res, error);
  res.json(data[0]);
});

// Light/dark/system and the accent colour. Saved per account so they follow the user to other devices.
app.put('/api/profile/appearance', requireAuth, async (req, res) => {
  const { appearance, error: validationError } = validateAppearance(req.body);
  if (validationError) return res.status(400).json({ error: validationError });
  const { data, error } = await req.supabase
    .from('profiles')
    .upsert({ id: req.userId, ...appearance }, { onConflict: 'id' })
    .select(PROFILE_COLUMNS);
  if (error) return serverError(res, error);
  res.json(data[0]);
});

// The profile picture, already shrunk by the browser, or null to remove it.
app.put('/api/profile/avatar', requireAuth, async (req, res) => {
  const { avatar, error: validationError } = validateAvatar(req.body.avatar);
  if (validationError) return res.status(400).json({ error: validationError });
  const { data, error } = await req.supabase
    .from('profiles')
    .upsert({ id: req.userId, avatar }, { onConflict: 'id' })
    .select(PROFILE_COLUMNS);
  if (error) return serverError(res, error);
  res.json(data[0]);
});

// #31 Deletes the account and, through the cascades, all of the user's data (see the consent migration).
app.delete('/api/account', requireAuth, async (req, res) => {
  const { error } = await req.supabase.rpc('delete_my_account');
  if (error) return serverError(res, error);
  res.status(204).end();
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
  'series:time_block_series(id, days_of_week, interval_weeks, start_date, end_date), ' +
  'feed:calendar_feeds(provider)';

// Blocks copied from a linked Google or Outlook calendar are changed there, not here.
const FEED_BLOCK_MESSAGE = 'This comes from your linked calendar. Change it there, and SmartSched picks it up on the next sync.';

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

// Records what the user did with a plan, for the preference model (schedule_events; ml/prefs/history.py reads
// it). Best effort: the user's change already succeeded, so a failure is logged, not returned.
async function logEvent(req, kind, fields) {
  const { error } = await req.supabase.from('schedule_events').insert({ user_id: req.userId, kind, ...fields });
  if (error) console.error(`Could not record ${kind}`, error);
}

const blockTime = (b) => ({ date: b.date, start: b.start_time.slice(0, 5), end: b.end_time.slice(0, 5) });

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
  if (existing.feed_id) return res.status(409).json({ error: FEED_BLOCK_MESSAGE });

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
  const from = blockTime(existing);
  const to = blockTime(data[0]);
  if (existing.type === 'task' && data[0].type === 'task' && JSON.stringify(from) !== JSON.stringify(to)) {
    await logEvent(req, 'block_moved', { block_id: existing.id, task_id: existing.task_id, details: { label: existing.activity, from, to } });
  }
  res.json({ block: data[0], commutes });
});

app.delete('/api/time-blocks/:id', requireAuth, async (req, res) => {
  const { data: existing, error: fetchError } = await req.supabase
    .from('time_blocks')
    .select('feed_id')
    .eq('id', req.params.id)
    .maybeSingle();
  if (fetchError) return serverError(res, fetchError);
  if (existing?.feed_id) return res.status(409).json({ error: FEED_BLOCK_MESSAGE });
  const { data, error } = await req.supabase
    .from('time_blocks')
    .delete()
    .eq('id', req.params.id)
    .select();
  if (error) return serverError(res, error);
  if (data.length === 0) return res.status(404).json({ error: 'Time block not found' });
  await recalcCommutes(req, [data[0].date]);
  const deleted = data[0];
  if (deleted.type === 'task') {
    await logEvent(req, 'block_deleted', { block_id: deleted.id, task_id: deleted.task_id, details: { label: deleted.activity, ...blockTime(deleted) } });
  }
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

// Reflections between two dates, oldest first, for the Reflect page's summary and the planner's bedtime check-in.
app.get('/api/reflections', requireAuth, async (req, res) => {
  const { start, end } = req.query;
  if (!isValidDate(start) || !isValidDate(end) || start > end) {
    return res.status(400).json({ error: 'start and end must be YYYY-MM-DD dates, start first' });
  }
  const { data, error } = await req.supabase
    .from('reflections')
    .select('date, ratings, bed_time, wake_time')
    .gte('date', start)
    .lte('date', end)
    .order('date');
  if (error) return serverError(res, error);
  res.json(data);
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
  const { times, error: timesError } = validateSleepTimes(req.body);
  if (timesError) return res.status(400).json({ error: timesError });
  const { data, error } = await req.supabase
    .from('reflections')
    .upsert({ user_id: req.userId, date, ratings, ...times }, { onConflict: 'user_id,date' })
    .select();
  if (error) return serverError(res, error);
  res.status(201).json(data[0]);
});
const SCHEDULER_URL = process.env.SCHEDULER_URL || 'http://localhost:8000';

// The scheduler service sleeps when idle on the free host and takes up to a minute to wake. Each call gets
// SCHEDULER_TIMEOUT_MS, and one more try after a short wait when it's waking up (the host's 502/503/504, a
// timeout, or no answer at all).
const SCHEDULER_TIMEOUT_MS = 60_000;
const WAKING_STATUSES = [502, 503, 504];
const retryDelay = () => Number(process.env.SCHEDULER_RETRY_DELAY_MS ?? 3000);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// POSTs to the Python scheduler service (ml/csp/api.py). Returns its JSON, or null after logging what it said.
// Throws when it can't be reached even on the second try.
async function askScheduler(path, body) {
  for (let attempt = 1; ; attempt++) {
    const last = attempt === 2;
    let r;
    try {
      r = await fetch(`${SCHEDULER_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.SERVICE_API_KEY || '' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(SCHEDULER_TIMEOUT_MS),
      });
    } catch (err) {
      if (last) throw err;
      console.warn(`Scheduler ${path} unreachable (${err.name}), trying again`);
      await wait(retryDelay());
      continue;
    }
    if (r.ok) return r.json();
    if (!last && WAKING_STATUSES.includes(r.status)) {
      console.warn(`Scheduler ${path} said ${r.status} while waking up, trying again`);
      await wait(retryDelay());
      continue;
    }
    console.error('Scheduler said', r.status, await r.text());
    return null;
  }
}

// The browser calls this as soon as the app opens: the request itself wakes this server, and it waits for the
// scheduler service's health check so that wakes too. No login needed (the app pings it before auth has loaded).
// scheduler is 'ok' once it answered, 'waking' if it didn't answer in time; the browser asks again until it's 'ok'.
const WAKE_TIMEOUT_MS = 25_000;
app.get('/api/wake', async (req, res) => {
  let scheduler = 'waking';
  try {
    const r = await fetch(`${SCHEDULER_URL}/health`, { signal: AbortSignal.timeout(WAKE_TIMEOUT_MS) });
    if (r.ok) scheduler = 'ok';
  } catch {
    // still starting up
  }
  res.json({ server: 'ok', scheduler });
});

// How a suggested plan spreads its work (ml/prefs/score.py style_of).
const PLAN_STYLES = ['front_loaded', 'even', 'spaced', 'clustered'];

// The browser's local time. The server doesn't know the user's time zone, so "now" comes from them.
const isLocalNow = (now) => typeof now === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(now);

app.post('/api/schedule/suggest', requireAuth, async (req, res) => {
  const { now, weekStart } = req.body;
  const tzOffset = Number.isInteger(req.body.tzOffset) ? req.body.tzOffset : 0;
  if (!isLocalNow(now)) return res.status(400).json({ error: 'now must be YYYY-MM-DDTHH:MM' });
  if (!isValidDate(weekStart)) return res.status(400).json({ error: 'weekStart must be a valid YYYY-MM-DD date' });

  const endDate = new Date(`${weekStart}T00:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  const weekEnd = endDate.toISOString().slice(0, 10);
  const sinceDate = new Date(`${weekStart}T00:00:00Z`);
  sinceDate.setUTCDate(sinceDate.getUTCDate() - 7);
  const since = sinceDate.toISOString().slice(0, 10);

  // Plan around the linked calendars as they are now. A calendar that can't be reached keeps its last copy.
  await syncFeeds(req, { onlyStale: true });

  const [tasks, blocks, profile, reflections] = await Promise.all([
    req.supabase.from('tasks').select('*').eq('completed', false),
    req.supabase.from('time_blocks').select('*').gte('date', weekStart).lte('date', weekEnd),
    req.supabase
      .from('profiles')
      .select('survey, survey_updated_at, scheduler_preferences, preferences_updated_at')
      .eq('id', req.userId)
      .maybeSingle(),
    req.supabase.from('reflections').select('date, ratings').gte('date', since).lte('date', weekEnd),
  ]);
  const failed = [tasks, blocks, profile, reflections].find((r) => r.error);
  if (failed) return serverError(res, failed.error);

  const survey = profile.data?.survey;
  if (!survey) return res.status(409).json({ error: 'Finish the onboarding survey first' });
  let saved = profile.data;
  if (await preferencesNeedRefresh(req, saved)) saved = (await refreshPreferences(req, { now, tzOffset })) ?? saved;

  const input = buildSolverInput({
    now,
    weekStart,
    tzOffset,
    tasks: tasks.data,
    blocks: blocks.data,
    reflections: reflections.data,
  });
  if (input.tasks.length === 0) return res.json({ suggestions: [] });

  let result;
  try {
    // prefs null: the scheduler derives them from the survey (ml/prefs/baseline.py).
    result = await askScheduler('/schedule', { input, survey, prefs: savedPreferences(saved) });
  } catch (err) {
    console.error('Scheduler unreachable', err);
    return res.status(503).json({ error: 'The planner is starting up. Try again in a minute.' });
  }
  if (!result) return res.status(502).json({ error: 'The scheduler could not build a plan' });

  // Suggest only: nothing is saved until the user picks one. The scheduler sends its three picks, best first.
  const suggestions = result.calendars.map((c) => ({
    id: c.id,
    why: c.why,
    style: c.style,
    blocks: c.calendar.blocks.map((b) => ({
      activity: input.tasks.find((t) => t.id === b.task)?.title ?? 'Study',
      date: b.date,
      start_time: `${b.start}:00`,
      end_time: `${b.end}:00`,
      type: 'task',
      task_id: b.task,
    })),
    unscheduled: c.calendar.unscheduled,
  }));
  res.json({ suggestions });
});

app.post('/api/schedule/accept', requireAuth, async (req, res) => {
  const { now, weekStart, blocks } = req.body;
  if (!isLocalNow(now)) return res.status(400).json({ error: 'now must be YYYY-MM-DDTHH:MM' });
  if (!isValidDate(weekStart)) return res.status(400).json({ error: 'weekStart must be a valid YYYY-MM-DD date' });
  if (!Array.isArray(blocks) || blocks.length === 0 || blocks.length > 100) {
    return res.status(400).json({ error: 'Pick a plan with at least one block' });
  }

  const endDate = new Date(`${weekStart}T00:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  const weekEnd = endDate.toISOString().slice(0, 10);

  // Validate every block first, so nothing is deleted if one is bad.
  const rows = [];
  for (const input of blocks) {
    const { block, error: validationError } = validateTimeBlock({ ...input, type: 'task' });
    if (validationError) return res.status(400).json({ error: validationError });
    if (block.date < weekStart || block.date > weekEnd) {
      return res.status(400).json({ error: 'Every block has to fall inside the week' });
    }
    // Options can sit on screen for a while; don't save a session that has already started.
    if (startsBefore(block, now)) {
      return res.status(409).json({ error: 'Part of this plan has already started. Suggest a new plan.' });
    }
    rows.push(block);
  }

  // Every task referenced must belong to this user (row-level security hides the rest).
  const taskIds = [...new Set(rows.map((b) => b.task_id))];
  const { data: ownTasks, error: tasksError } = await req.supabase.from('tasks').select('id').in('id', taskIds);
  if (tasksError) return serverError(res, tasksError);
  if (ownTasks.length !== taskIds.length) return res.status(400).json({ error: 'A task in this plan no longer exists' });

  // Replace the week's unfinished task blocks from now on with the chosen plan. Blocks on completed tasks
  // and blocks that already started stay: they're the record of what was planned (time spent, history).
  const { data: old, error: oldError } = await req.supabase
    .from('time_blocks')
    .select('id, date, start_time, task:tasks(completed)')
    .eq('type', 'task')
    .gte('date', weekStart)
    .lte('date', weekEnd);
  if (oldError) return serverError(res, oldError);
  const stale = old.filter((b) => !b.task?.completed && !startsBefore(b, now));
  const staleIds = stale.map((b) => b.id);
  if (staleIds.length) {
    const { error: deleteError } = await req.supabase.from('time_blocks').delete().in('id', staleIds);
    if (deleteError) return serverError(res, deleteError);
  }

  const { data, error } = await req.supabase
    .from('time_blocks')
    .insert(rows.map((b) => ({ user_id: req.userId, ...b })))
    .select(BLOCK_COLUMNS);
  if (error) return serverError(res, error);

  const commutes = await recalcCommutes(req, [...stale.map((b) => b.date), ...rows.map((b) => b.date)]);
  // Which option was chosen out of which, by style, for the model's PAST PICKS.
  // Also how many of the option's sessions they removed before choosing it.
  const { options, chosen } = req.body;
  const removed = Number.isInteger(req.body.removed) && req.body.removed >= 0 ? req.body.removed : 0;
  if (Array.isArray(options) && options.length <= 3 && options.every((o) => PLAN_STYLES.includes(o)) && Number.isInteger(chosen) && options[chosen]) {
    await logEvent(req, 'plan_accepted', { details: { week_start: weekStart, chosen, options, removed } });
  }
  res.status(201).json({ blocks: data, commutes });
});

// ---- Preferences: the JSON the scheduler ranks calendars by (profiles.scheduler_preferences) ----
//
// The fixed rules in ml/prefs/system_prompt.txt write it first, applied to the user's history (history.rules
// on the scheduler service), and the model replaces it in the background when MODEL_URL is set (see
// preferencesFromModel). It's refreshed when the survey is saved, and when "Suggest a plan" finds it
// missing, a week old, or behind enough new events. Never on every request.
const PREFERENCES_VERSION = 'rules-v1';
const HISTORY_DAYS = 21;
const REFRESH_AFTER_EVENTS = 10;

async function preferencesNeedRefresh(req, profile) {
  if (preferencesOutOfDate(profile, Date.now())) return true;
  if (!profile?.survey) return false;
  const { count, error } = await req.supabase
    .from('schedule_events')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', profile.preferences_updated_at);
  if (error) {
    console.error('Could not count new events', error);
    return false;
  }
  return (count ?? 0) >= REFRESH_AFTER_EVENTS;
}

// The browser's local time and getTimezoneOffset() from a body or query, or null.
function localClock(source) {
  const tzOffset = Number.parseInt(source?.tzOffset, 10);
  return isLocalNow(source?.now) && Number.isInteger(tzOffset) ? { now: source.now, tzOffset } : null;
}

// The user's last HISTORY_DAYS days as the scheduler service reads them: { bundle, rules }, or null when the
// service said no. Database errors are thrown.
async function readHistory(req, { now, tzOffset }) {
  const sinceDate = new Date(`${now.slice(0, 10)}T00:00:00Z`);
  sinceDate.setUTCDate(sinceDate.getUTCDate() - HISTORY_DAYS);
  const since = sinceDate.toISOString().slice(0, 10);
  // Moves logged a week before the window can still be about blocks inside it.
  sinceDate.setUTCDate(sinceDate.getUTCDate() - 7);

  const [profile, tasks, blocks, reflections, events] = await Promise.all([
    req.supabase.from('profiles').select('survey').eq('id', req.userId).maybeSingle(),
    req.supabase.from('tasks').select('id, title, type, estimated_time, time_spent, due_date, completed, completed_at'),
    req.supabase.from('time_blocks').select('id, date, start_time, end_time, type, activity, task_id, auto').gte('date', since),
    req.supabase.from('reflections').select('date, ratings, bed_time, wake_time').gte('date', since),
    req.supabase
      .from('schedule_events')
      .select('created_at, kind, block_id, task_id, details')
      .gte('created_at', sinceDate.toISOString()),
  ]);
  const failed = [profile, tasks, blocks, reflections, events].find((r) => r.error);
  if (failed) throw failed.error;

  return askScheduler('/history', {
    rows: {
      now,
      tz_offset: tzOffset,
      survey: profile.data?.survey ?? null,
      tasks: tasks.data,
      blocks: blocks.data,
      reflections: reflections.data,
      events: events.data,
    },
  });
}

// Works out the preferences again and saves them. Returns the saved profile fields, or null when it
// couldn't (logged): the user's own request should still go ahead with whatever was saved before.
async function refreshPreferences(req, clock) {
  try {
    const result = await readHistory(req, clock);
    if (!result) return null;
    const { data, error } = await req.supabase
      .from('profiles')
      .update({
        scheduler_preferences: result.rules,
        preferences_updated_at: new Date().toISOString(),
        preference_model_version: PREFERENCES_VERSION,
      })
      .eq('id', req.userId)
      .select('survey, survey_updated_at, scheduler_preferences, preferences_updated_at');
    if (error) throw error;
    if (process.env.MODEL_URL && data[0]) {
      preferencesFromModel(req, result.bundle, data[0].survey).catch((err) => console.error('Model refresh failed', err));
    }
    return data[0] ?? null;
  } catch (err) {
    console.error('Could not refresh preferences', err);
    return null;
  }
}

// The preference model (server/model.js; ml/serve on a Hugging Face Space at MODEL_URL). It's asked after the
// rules' JSON is saved and the user's request has gone ahead, and its JSON replaces the rules' only when the
// reply was usable. A plan never waits on the model.
async function preferencesFromModel(req, bundle, survey) {
  const reply = await askModel(bundle, survey);
  if (!reply) return;
  if (!reply.parsed || reply.fallback) {
    console.warn('Model reply not usable, keeping the rules', reply.problems);
    return;
  }
  const { error } = await req.supabase
    .from('profiles')
    .update({
      scheduler_preferences: reply.prefs,
      preferences_updated_at: new Date().toISOString(),
      preference_model_version: reply.version,
    })
    .eq('id', req.userId);
  if (error) console.error('Could not save the model preferences', error);
  else console.log(`Model preferences saved (${reply.version}, ${reply.seconds}s)`);
}

// What the preferences are read from, for checking the data.
app.get('/api/preferences/history', requireAuth, async (req, res) => {
  const clock = localClock(req.query);
  if (!clock) return res.status(400).json({ error: 'now (YYYY-MM-DDTHH:MM) and tzOffset (minutes) are required' });
  let result;
  try {
    result = await readHistory(req, clock);
  } catch (err) {
    return serverError(res, err);
  }
  if (!result) return res.status(502).json({ error: 'The scheduler could not read the history' });
  res.json(result);
});

// Refresh now, instead of waiting for the next survey save or the weekly one.
app.post('/api/preferences/refresh', requireAuth, async (req, res) => {
  const clock = localClock(req.body);
  if (!clock) return res.status(400).json({ error: 'now (YYYY-MM-DDTHH:MM) and tzOffset (minutes) are required' });
  const saved = await refreshPreferences(req, clock);
  if (!saved) return res.status(502).json({ error: "Couldn't update your preferences. Try again." });
  res.json({ preferences: saved.scheduler_preferences, updatedAt: saved.preferences_updated_at, version: PREFERENCES_VERSION });
});

// ---- Linked calendars (Google Calendar, Outlook) through their private iCal link ----
//
// Each sync copies the calendar's timed events from a week back to eight weeks ahead into time_blocks
// (feed_id set, type 'personal'), replacing the last copy. The planner asks for a sync when it opens and
// "Suggest a plan" does before planning; either way a calendar synced in the last FEED_FRESH_MS is left alone.
const FEED_FRESH_MS = 15 * 60_000;
const FEED_DAYS_BACK = 7;
const FEED_DAYS_AHEAD = 56;
const FEED_COLUMNS = 'id, provider, url, time_zone, last_synced_at, last_error, created_at';
const MAX_FEEDS = 5;

const feedForBrowser = (feed) => ({
  id: feed.id,
  provider: feed.provider,
  link: maskFeedUrl(feed.url),
  last_synced_at: feed.last_synced_at,
  last_error: feed.last_error,
});

// Replaces a feed's blocks with what its calendar has now. icsText is passed when it was just fetched.
// Returns the dates whose blocks changed. Fetch and parse problems are saved on the feed (the old blocks
// stay); database errors are thrown.
async function syncFeed(req, feed, icsText) {
  const today = localToday(feed.time_zone);
  const window = { from: addDays(today, -FEED_DAYS_BACK), to: addDays(today, FEED_DAYS_AHEAD), timeZone: feed.time_zone };
  let rows;
  try {
    rows = feedBlocks(icsText ?? (await fetchFeed(feed.url)), window);
  } catch (err) {
    const message = Object.values(FEED_ERRORS).includes(err.message) ? err.message : FEED_ERRORS.parse;
    if (!Object.values(FEED_ERRORS).includes(err.message)) console.error('Calendar sync failed', err);
    await req.supabase.from('calendar_feeds').update({ last_error: message }).eq('id', feed.id);
    return [];
  }

  const { data: old, error: deleteError } = await req.supabase
    .from('time_blocks')
    .delete()
    .eq('feed_id', feed.id)
    .select('date');
  if (deleteError) throw deleteError;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await req.supabase
      .from('time_blocks')
      .insert(rows.slice(i, i + 500).map((row) => ({ user_id: req.userId, feed_id: feed.id, ...row })));
    if (error) throw error;
  }
  const { error: updateError } = await req.supabase
    .from('calendar_feeds')
    .update({ last_synced_at: new Date().toISOString(), last_error: null })
    .eq('id', feed.id);
  if (updateError) throw updateError;
  return [...old.map((b) => b.date), ...rows.map((b) => b.date)];
}

// Syncs the user's calendars (only the ones not synced lately, when onlyStale), then rebuilds commutes on the
// days that changed. Never throws: a failed sync shouldn't stop the request that asked for it.
async function syncFeeds(req, { onlyStale }) {
  try {
    const { data: feeds, error } = await req.supabase.from('calendar_feeds').select(FEED_COLUMNS);
    if (error) throw error;
    const due = feeds.filter((f) => !onlyStale || !f.last_synced_at || Date.now() - Date.parse(f.last_synced_at) > FEED_FRESH_MS);
    const dates = (await Promise.all(due.map((feed) => syncFeed(req, feed)))).flat();
    if (dates.length) await recalcCommutes(req, dates);
    return { synced: due.length };
  } catch (err) {
    console.error('Could not sync calendars', err);
    return { synced: 0, failed: true };
  }
}

app.get('/api/calendar-feeds', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase.from('calendar_feeds').select(FEED_COLUMNS).order('created_at');
  if (error) return serverError(res, error);
  res.json(data.map(feedForBrowser));
});

// Links a calendar: { url, timeZone }. The link is fetched first so a wrong one is reported before it's saved.
app.post('/api/calendar-feeds', requireAuth, async (req, res) => {
  const { url, provider, error: linkError } = checkFeedUrl(req.body.url);
  if (linkError) return res.status(400).json({ error: linkError });
  if (!isTimeZone(req.body.timeZone)) return res.status(400).json({ error: 'Time zone is required' });

  const { data: existing, error: listError } = await req.supabase.from('calendar_feeds').select('id, url');
  if (listError) return serverError(res, listError);
  if (existing.some((f) => f.url === url)) return res.status(409).json({ error: 'That calendar is already linked.' });
  if (existing.length >= MAX_FEEDS) return res.status(400).json({ error: `You can link up to ${MAX_FEEDS} calendars.` });

  let icsText;
  try {
    icsText = await fetchFeed(url);
    feedBlocks(icsText, { from: '2000-01-01', to: '2000-01-01', timeZone: req.body.timeZone }); // is it a calendar?
  } catch (err) {
    return res.status(400).json({ error: Object.values(FEED_ERRORS).includes(err.message) ? err.message : FEED_ERRORS.parse });
  }

  const { data, error } = await req.supabase
    .from('calendar_feeds')
    .insert({ user_id: req.userId, provider, url, time_zone: req.body.timeZone })
    .select(FEED_COLUMNS);
  if (error) return serverError(res, error);
  const feed = data[0];
  try {
    const dates = await syncFeed(req, feed, icsText);
    await recalcCommutes(req, dates);
  } catch (err) {
    return serverError(res, err);
  }
  const { data: synced } = await req.supabase.from('calendar_feeds').select(FEED_COLUMNS).eq('id', feed.id).maybeSingle();
  res.status(201).json(feedForBrowser(synced?.url ? synced : feed));
});

// Syncs now. { force: true } syncs every calendar; otherwise only ones not synced in the last few minutes.
app.post('/api/calendar-feeds/sync', requireAuth, async (req, res) => {
  const result = await syncFeeds(req, { onlyStale: req.body?.force !== true });
  if (result.failed) return res.status(502).json({ error: "Couldn't sync your calendars. Try again in a moment." });
  const { data, error } = await req.supabase.from('calendar_feeds').select(FEED_COLUMNS).order('created_at');
  if (error) return serverError(res, error);
  res.json({ synced: result.synced, feeds: data.map(feedForBrowser) });
});

// Unlinks a calendar. Its blocks go with it (on delete cascade).
app.delete('/api/calendar-feeds/:id', requireAuth, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Calendar not found' });
  const { data: old, error: fetchError } = await req.supabase.from('time_blocks').select('date').eq('feed_id', req.params.id);
  if (fetchError) return serverError(res, fetchError);
  const { data, error } = await req.supabase.from('calendar_feeds').delete().eq('id', req.params.id).select('id');
  if (error) return serverError(res, error);
  if (data.length === 0) return res.status(404).json({ error: 'Calendar not found' });
  await recalcCommutes(req, old.map((b) => b.date));
  res.status(204).end();
});

// Unknown API routes and anything thrown (like a request body that isn't valid JSON) get a JSON error
// instead of Express's default HTML page.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request was not valid JSON' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That is too large to save. Try something smaller.' });
  serverError(res, err);
});
