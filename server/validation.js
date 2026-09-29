// Request validation, kept apart from the routes so it can be unit-tested without a server or database.

// Keys must match src/app/lib/survey.ts.
export const SURVEY_OPTIONS = {
  commitments: ['classes', 'work', 'commute', 'standing'],
  focus_time: ['early_morning', 'morning', 'afternoon', 'evening', 'late_night'],
  work_session: ['25', '45', '90', '120_plus'],
  non_negotiables: ['sleep', 'meals', 'exercise', 'friends', 'family', 'day_off', 'hobby'],
  deadline_style: ['steady', 'day_before', 'night_before', 'depends'],
  calendar_style: ['calendar1', 'calendar2', 'calendar3', 'calendar4'],
};

// Returns { survey } with only known fields, or { error } describing the first problem.
export function validateSurvey(input) {
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

export const TIME_BLOCK_TYPES = ['class', 'study', 'break', 'personal', 'commute', 'meal', 'work'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

// "09:30" and "09:30:00" both become "09:30:00" so times compare correctly as strings.
export function normalizeTime(value) {
  return value.length === 5 ? `${value}:00` : value;
}

// Returns { block } with only known fields, or { error } describing the first problem.
export function validateTimeBlock(input) {
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

export const REFLECTION_KEYS = ['productivity', 'mood', 'energy', 'sleep'];

// Returns { ratings } with exactly the four known keys, or { error } for the first one that isn't rated 1-5.
export function validateRatings(input) {
  if (!input || typeof input !== 'object') return { error: 'Ratings are required' };
  const ratings = {};
  for (const key of REFLECTION_KEYS) {
    const value = input[key];
    if (!Number.isInteger(value) || value < 1 || value > 5) return { error: `Rate ${key} from 1 to 5` };
    ratings[key] = value;
  }
  return { ratings };
}
