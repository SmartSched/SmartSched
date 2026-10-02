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

export const TIME_BLOCK_TYPES = ['class', 'study', 'break', 'personal', 'commute', 'meal', 'work', 'task'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

// "09:30" and "09:30:00" both become "09:30:00" so times compare correctly as strings.
export function normalizeTime(value) {
  return value.length === 5 ? `${value}:00` : value;
}

export const BUILT_IN_PLACES = ['home', 'campus', 'work', 'gym'];
const MAX_PLACE_LENGTH = 40;

// Places are compared and stored lowercase ("Campus" and "campus" are the same place).
function normalizePlace(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
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
  // Task blocks point at their task; any other type drops a leftover task_id (e.g. after changing the type).
  if (input.type === 'task' && !isUuid(input.task_id)) return { error: 'Pick a task for this block' };
  const task_id = input.type === 'task' ? input.task_id : null;
  const location = input.location == null ? '' : normalizePlace(input.location);
  if (typeof input.location === 'number' || location.length > MAX_PLACE_LENGTH) {
    return { error: 'Location must be a short place name' };
  }
  return {
    block: { activity, date: input.date, start_time, end_time, type: input.type, task_id, location: location || null },
  };
}

const MAX_SERIES_DAYS = 366;

function daysBetween(start, end) {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
}

// A repeating block: the block's own fields plus which weekdays (0 = Sunday), every 1 or 2 weeks, and the
// first and last dates. Returns { series } or { error }.
export function validateSeries(input) {
  if (!input || typeof input !== 'object') return { error: 'Repeat details are required' };
  if (input.type === 'task') return { error: 'Task blocks can\'t repeat' };
  if (!isValidDate(input.start_date)) return { error: 'Start date must be a valid YYYY-MM-DD date' };
  if (!isValidDate(input.end_date)) return { error: 'End date must be a valid YYYY-MM-DD date' };
  if (input.end_date < input.start_date) return { error: 'The repeat has to end on or after the day it starts' };
  if (daysBetween(input.start_date, input.end_date) > MAX_SERIES_DAYS) return { error: 'A repeat can last up to a year' };
  const { block, error } = validateTimeBlock({ ...input, date: input.start_date });
  if (error) return { error };
  const days = input.days_of_week;
  if (!Array.isArray(days) || days.length === 0 || !days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    return { error: 'Pick at least one day of the week' };
  }
  const interval = input.interval_weeks ?? 1;
  if (interval !== 1 && interval !== 2) return { error: 'Repeat every week or every other week' };
  const { date, task_id, ...fields } = block;
  return {
    series: {
      ...fields,
      days_of_week: [...new Set(days)].sort((a, b) => a - b),
      interval_weeks: interval,
      start_date: input.start_date,
      end_date: input.end_date,
    },
  };
}

// Pair keys put the two place names in sorted order, so campus|work and work|campus are the same trip.
export function pairKey(a, b) {
  return [a, b].sort().join('|');
}

// The user's own places and minutes between pairs of places. Returns { travel } or { error }.
export function validateTravel(input) {
  if (!input || typeof input !== 'object') return { error: 'Travel times are required' };
  const places = [];
  for (const raw of input.places ?? []) {
    const place = normalizePlace(raw);
    if (!place || place.length > MAX_PLACE_LENGTH || place.includes('|')) return { error: 'Place names must be short, without |' };
    if (!BUILT_IN_PLACES.includes(place) && !places.includes(place)) places.push(place);
  }
  if (places.length > 12) return { error: 'Add up to 12 of your own places' };
  const known = [...BUILT_IN_PLACES, ...places];
  const minutes = {};
  for (const [key, value] of Object.entries(input.minutes ?? {})) {
    const [a, b, extra] = key.split('|');
    if (extra !== undefined || !known.includes(a) || !known.includes(b) || a === b) return { error: `Unknown trip: ${key}` };
    if (!Number.isInteger(value) || value < 1 || value > 240) return { error: 'Travel times must be 1 to 240 minutes' };
    minutes[pairKey(a, b)] = value;
  }
  return { travel: { places, minutes } };
}

// Minutes a finished task actually took: a whole number from 0 up to a week.
export function isValidTimeSpent(value) {
  return Number.isInteger(value) && value >= 0 && value <= 7 * 24 * 60;
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
