const hhmm = (t) => t.slice(0, 5);

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// tzOffset is the browser's new Date().getTimezoneOffset() (420 for Pacific daylight time).
function toLocal(iso, tzOffset) {
  if (iso.length === 10) return `${iso}T23:59`;
  return new Date(Date.parse(iso) - tzOffset * 60000).toISOString().slice(0, 16);
}

// now is the browser's local YYYY-MM-DDTHH:MM, like the block's date and start_time.
export function startsBefore(block, now) {
  return `${block.date}T${hhmm(block.start_time)}` < now.slice(0, 16);
}

// The preference JSON saved on the profile, or null to let the scheduler use the survey alone. Preferences
// older than the survey are skipped: they were read from answers the user has since changed (a new wake-up
// time would otherwise lose to the old bedtime) and wait for the next model refresh.
export function savedPreferences(profile) {
  const prefs = profile?.scheduler_preferences;
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) return null;
  const savedAt = Date.parse(profile.preferences_updated_at);
  const surveyAt = Date.parse(profile.survey_updated_at);
  if (Number.isNaN(savedAt) || savedAt < surveyAt) return null;
  return prefs;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// True when the saved preferences should be worked out again before planning: none yet, older than the
// survey, or a week old. (Enough new events since is checked by the route, which needs a query.)
export function preferencesOutOfDate(profile, nowMs) {
  if (!profile?.survey) return false; // nothing to work from
  if (!savedPreferences(profile)) return true;
  return nowMs - Date.parse(profile.preferences_updated_at) > WEEK_MS;
}

// The week the Python scheduler plans. Study hours (from sleep) and session length come from the survey and
// preference JSON on the Python side (ml/prefs/hard.py build), so they aren't set here.
export function buildSolverInput({ now, weekStart, tasks, blocks, reflections, tzOffset = 0 }) {
  const weekEnd = addDays(weekStart, 6);
  // Task blocks that accepting a plan won't replace (see /api/schedule/accept) are fixed like classes:
  // ones for tasks that are done, and ones that already started.
  const unfinished = new Set(tasks.filter((t) => !t.completed).map((t) => t.id));
  const stays = (b) => b.type !== 'task' || !unfinished.has(b.task_id) || startsBefore(b, now);

  const solverTasks = tasks
    .filter((t) => !t.completed && t.due_date && t.estimated_time > 0)
    .map((t) => ({
        id: t.id,
        title: t.title,
        type: t.type,
        priority: t.priority,
        due: toLocal(t.due_date, tzOffset),
        minutes: t.estimated_time - (t.time_spent ?? 0),
    }))
    .filter((t) => t.minutes > 0 && t.due > now);

  const fixed = blocks
    .filter((b) => stays(b) && b.date >= weekStart && b.date <= weekEnd)
    .map((b) => ({
      date: b.date,
      start: hhmm(b.start_time),
      end: hhmm(b.end_time),
      type: b.type,
      label: b.activity,
    }));

  const recent_ratings = reflections.map((r) => ({ date: r.date, ...r.ratings }));

  return {
    now,
    week: { start: weekStart, end: weekEnd },
    day_off: null,
    fixed,
    tasks: solverTasks,
    recent_ratings,
  };
}
