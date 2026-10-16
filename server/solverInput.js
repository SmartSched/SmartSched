const SESSION_MINUTES = { '25': 25, '45': 45, '90': 90, '120_plus': 120 };

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

export function buildSolverInput({ now, weekStart, survey, tasks, blocks, reflections, tzOffset = 0 }) {
  const weekEnd = addDays(weekStart, 6);

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
    .filter((b) => b.type !== 'task' && b.date >= weekStart && b.date <= weekEnd)
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
    available: { start: '08:00', end: '23:00' },
    day_off: null,
    prefs: {
      focus_time: survey.focus_time,
      session_minutes: SESSION_MINUTES[survey.work_session],
      deadline_style: survey.deadline_style,
      calendar_style: survey.calendar_style,
    },
    fixed,
    tasks: solverTasks,
    recent_ratings,
  };
}
