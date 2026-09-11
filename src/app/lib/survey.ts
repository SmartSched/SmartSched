// Onboarding survey definitions. Keys here must match SURVEY_OPTIONS in server/index.js.

export const COMMITMENTS = [
  { key: 'classes', label: 'Classes' },
  { key: 'work', label: 'Work shifts' },
  { key: 'commute', label: 'Commute' },
  { key: 'standing', label: 'Standing commitments (team, club, family)' },
] as const;

export const FOCUS_TIMES = [
  { key: 'early_morning', label: 'Early morning (before 9)' },
  { key: 'morning', label: 'Morning (9–12)' },
  { key: 'afternoon', label: 'Afternoon (12–5)' },
  { key: 'evening', label: 'Evening (5–10)' },
  { key: 'late_night', label: 'Late night (after 10)' },
] as const;

export const WORK_SESSIONS = [
  { key: '25', label: 'About 25 minutes' },
  { key: '45', label: 'About 45 minutes' },
  { key: '90', label: 'An hour and a half' },
  { key: '120_plus', label: 'Two or more hours' },
] as const;

export const NON_NEGOTIABLES = [
  { key: 'sleep', label: 'Sleeping 7+ hours' },
  { key: 'meals', label: 'Regular meals' },
  { key: 'exercise', label: 'Gym or exercise' },
  { key: 'friends', label: 'Time with friends' },
  { key: 'family', label: 'Family contact' },
  { key: 'day_off', label: 'A full day off' },
  { key: 'hobby', label: 'A specific hobby' },
] as const;

export const DEADLINE_STYLES = [
  { key: 'steady', label: 'I work steadily and finish on time' },
  { key: 'day_before', label: 'I do most of it the day or two before' },
  { key: 'night_before', label: "I'm up the night before" },
  { key: 'depends', label: 'It depends entirely on the class' },
] as const;

export const CALENDAR_STYLES = [
  { key: 'calendar1', label: 'Continuous', image: '/images/calendar1.png' },
  { key: 'calendar2', label: 'Spaced', image: '/images/calendar2.png' },
  { key: 'calendar3', label: 'Front-loaded', image: '/images/calendar3.png' },
  { key: 'calendar4', label: 'Light and even', image: '/images/calendar4.png' },
] as const;

type Key<T extends readonly { key: string }[]> = T[number]['key'];

export interface SurveyAnswers {
  // Only checked commitments appear; the value is rough hours per week.
  commitments: Partial<Record<Key<typeof COMMITMENTS>, number>>;
  focus_time: Key<typeof FOCUS_TIMES> | null;
  work_session: Key<typeof WORK_SESSIONS> | null;
  non_negotiables: Key<typeof NON_NEGOTIABLES>[];
  deadline_style: Key<typeof DEADLINE_STYLES> | null;
  calendar_style: Key<typeof CALENDAR_STYLES> | null;
}

export const EMPTY_SURVEY: SurveyAnswers = {
  commitments: {},
  focus_time: null,
  work_session: null,
  non_negotiables: [],
  deadline_style: null,
  calendar_style: null,
};

export function labelFor(options: readonly { key: string; label: string }[], key: string | null) {
  return options.find((o) => o.key === key)?.label ?? '—';
}
