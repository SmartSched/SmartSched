// Aggregates the small, structured behavior log before it is sent to the preference model.  Keeping this
// here (rather than in the browser) makes the input consistent across devices and avoids sending task text.

const TASK_TYPES = new Set(["homework", "exam", "project", "work", "study"]);
const TIME = /^(\d{2}):(\d{2})/;
const TIME_OF_DAY = /^(?:[01]\d|2[0-4]):[0-5]\d$/;
const DAY_NAMES = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

function minutesBetween(start, end) {
  const a = TIME.exec(start ?? "");
  const b = TIME.exec(end ?? "");
  if (!a || !b) return null;
  const from = Number(a[1]) * 60 + Number(a[2]);
  const to = Number(b[1]) * 60 + Number(b[2]);
  return to > from ? to - from : null;
}

function slotFeatures(slot, hours, days, sessions) {
  if (!slot || typeof slot.date !== "string" || !TIME.test(slot.start ?? ""))
    return;
  const match = TIME.exec(slot.start);
  const hour = Number(match[1]);
  hours[hour] = (hours[hour] ?? 0) + 1;
  const date = new Date(`${slot.date}T00:00:00Z`);
  if (!Number.isNaN(date.getTime()))
    days[date.getUTCDay()] = (days[date.getUTCDay()] ?? 0) + 1;
  const duration = minutesBetween(slot.start, slot.end);
  if (duration) sessions.push(duration);
}

const rounded = (value, digits = 1) =>
  Math.round(value * 10 ** digits) / 10 ** digits;
const average = (values) =>
  values.length
    ? rounded(values.reduce((sum, value) => sum + value, 0) / values.length)
    : null;

// Returns aggregate-only model features. `data` is intentionally never copied wholesale into this result.
export function summarizeLearningEvents(events = []) {
  const preferredHours = {};
  const preferredDays = {};
  const sessionLengths = [];
  const estimates = {};
  const counts = {
    task_created: 0,
    task_edited: 0,
    task_completed: 0,
    schedule_accepted: 0,
    study_block_moved: 0,
    study_block_deleted: 0,
  };
  let completionsWithDueDate = 0;
  let totalHoursBeforeDue = 0;

  for (const event of events) {
    if (!event || typeof event.event_type !== "string") continue;
    if (event.event_type in counts) counts[event.event_type] += 1;
    const data = event.data && typeof event.data === "object" ? event.data : {};
    if (event.event_type === "schedule_accepted") {
      for (const block of Array.isArray(data.planned_blocks)
        ? data.planned_blocks
        : []) {
        slotFeatures(block, preferredHours, preferredDays, sessionLengths);
      }
    }
    if (event.event_type === "study_block_moved")
      slotFeatures(data.to, preferredHours, preferredDays, sessionLengths);
    if (event.event_type === "task_completed") {
      const type = data.task_type;
      const estimated = Number(data.estimated_minutes);
      const actual = Number(data.actual_minutes);
      if (
        TASK_TYPES.has(type) &&
        Number.isFinite(estimated) &&
        estimated > 0 &&
        Number.isFinite(actual) &&
        actual >= 0
      ) {
        const value = estimates[type] ?? { estimated: 0, actual: 0, count: 0 };
        value.estimated += estimated;
        value.actual += actual;
        value.count += 1;
        estimates[type] = value;
      }
      if (
        typeof data.due_date === "string" &&
        typeof event.occurred_at === "string"
      ) {
        const due = Date.parse(data.due_date);
        const completed = Date.parse(event.occurred_at);
        if (!Number.isNaN(due) && !Number.isNaN(completed)) {
          completionsWithDueDate += 1;
          totalHoursBeforeDue += (due - completed) / 3_600_000;
        }
      }
    }
  }

  const estimateVsActualByTaskType = Object.fromEntries(
    Object.entries(estimates).map(([type, value]) => [
      type,
      {
        completed_tasks: value.count,
        estimated_minutes: value.estimated,
        actual_minutes: value.actual,
        actual_to_estimated_ratio: rounded(value.actual / value.estimated, 2),
      },
    ]),
  );
  const scheduled = counts.schedule_accepted;
  return {
    sample_size: events.length,
    preferred_study_hours: preferredHours,
    preferred_days_of_week: preferredDays,
    average_session_minutes: average(sessionLengths),
    estimate_vs_actual_by_task_type: estimateVsActualByTaskType,
    // We do not record rejected suggestions, so an acceptance rate would be fabricated. The count is useful
    // evidence; a rate can be added when a future `schedule_suggested` event supplies a denominator.
    schedule_acceptance: {
      accepted_plans: scheduled,
      observed_decisions: scheduled,
      acceptance_rate: null,
    },
    rescheduling: {
      moved_blocks: counts.study_block_moved,
      deleted_or_skipped_blocks: counts.study_block_deleted,
      rescheduled_block_rate: scheduled
        ? rounded(
            (counts.study_block_moved + counts.study_block_deleted) / scheduled,
            2,
          )
        : null,
    },
    completion_timing: {
      completed_tasks: counts.task_completed,
      tasks_with_due_date: completionsWithDueDate,
      average_hours_before_due: completionsWithDueDate
        ? rounded(totalHoursBeforeDue / completionsWithDueDate)
        : null,
    },
    event_counts: counts,
  };
}

// Defense in depth for the model boundary. Python also cleans outputs, but the scheduler must never receive
// arbitrary JSON if that service changes or is unavailable.
export function isValidPreferenceJson(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (
    typeof value.summary !== "string" ||
    value.summary.length > 1000 ||
    !Array.isArray(value.preferences) ||
    !Array.isArray(value.adjustments)
  )
    return false;
  if (
    value.sleep !== undefined &&
    (!value.sleep ||
      typeof value.sleep !== "object" ||
      !TIME_OF_DAY.test(value.sleep.bedtime ?? ""))
  )
    return false;
  const preferenceKinds = new Set([
    "activity_window",
    "session_length",
    "daily_load",
    "min_gap",
    "protect_time",
    "deadline_buffer",
    "distribution",
  ]);
  for (const item of value.preferences) {
    if (!item || typeof item !== "object" || !preferenceKinds.has(item.kind))
      return false;
    if (
      item.kind === "session_length" &&
      (!Number.isFinite(item.ideal) || item.ideal < 15 || item.ideal > 180)
    )
      return false;
    if (
      item.kind === "daily_load" &&
      (!Number.isFinite(item.max_minutes) ||
        item.max_minutes < 30 ||
        item.max_minutes > 720)
    )
      return false;
    if (
      item.kind === "min_gap" &&
      (!Number.isFinite(item.minutes) || item.minutes < 5 || item.minutes > 90)
    )
      return false;
    if (
      item.kind === "deadline_buffer" &&
      (!Number.isFinite(item.hours_before) ||
        item.hours_before < 0 ||
        item.hours_before > 168)
    )
      return false;
    if (
      item.kind === "distribution" &&
      !["front_loaded", "even", "spaced", "clustered"].includes(item.style)
    )
      return false;
    if (
      item.kind === "activity_window" &&
      (!["study", "exercise"].includes(item.activity) ||
        !["prefer", "avoid"].includes(item.direction) ||
        !TIME_OF_DAY.test(item.start ?? "") ||
        !TIME_OF_DAY.test(item.end ?? ""))
    )
      return false;
    if (
      item.kind === "protect_time" &&
      (!Array.isArray(item.days) ||
        !item.days.every((day) => DAY_NAMES.has(day)) ||
        !TIME_OF_DAY.test(item.start ?? "") ||
        !TIME_OF_DAY.test(item.end ?? ""))
    )
      return false;
  }
  return value.adjustments.every(
    (item) =>
      item &&
      typeof item === "object" &&
      item.kind === "estimate_multiplier" &&
      TASK_TYPES.has(item.task_type) &&
      Number.isFinite(item.factor) &&
      item.factor >= 0.25 &&
      item.factor <= 4,
  );
}
