// When we assume someone is asleep or getting in and out of bed, from their survey. Mirrors sleep_plan in
// ml/prefs/hard.py so the planner greys out the same time the scheduler keeps free. No React, so it can be tested.
import type { SurveyAnswers } from './survey';

const DAY = 24 * 60;
export const WIND_DOWN = 60; // minutes before bed
export const WAKE_BUFFER = 45; // minutes after waking
const BED_BAND = [21 * 60 + 30, 25 * 60]; // bedtime, minutes after the previous midnight
const WAKE_BAND = [5 * 60 + 30, 10 * 60];
const DEFAULT_BED: Record<string, number> = {
  early_morning: 22 * 60,
  morning: 23 * 60,
  afternoon: 23 * 60 + 30,
  evening: 23 * 60 + 30,
  late_night: 24 * 60 + 30,
};

function toMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function sleepHours(survey: Partial<SurveyAnswers>) {
  if (survey.sleep_hours) return Math.max(6, Math.min(10, survey.sleep_hours));
  return survey.non_negotiables?.includes('sleep') ? 8 : 7.5;
}

// Bedtime in minutes after the previous midnight (00:30 is 1470) and wake time in minutes after midnight.
export function sleepPlan(survey: Partial<SurveyAnswers> | null | undefined) {
  const s = survey ?? {};
  const length = Math.round(sleepHours(s) * 60);
  const bed = s.wake_time
    ? toMinutes(s.wake_time) + DAY - length
    : (DEFAULT_BED[s.focus_time ?? ''] ?? 23 * 60 + 30);
  const low = Math.max(BED_BAND[0], WAKE_BAND[0] + DAY - length);
  const high = Math.min(BED_BAND[1], WAKE_BAND[1] + DAY - length);
  const bedtime = Math.max(low, Math.min(high, bed));
  return { bedtime, wake: bedtime + length - DAY };
}

export interface DowntimeRange {
  start: number; // minutes after midnight
  end: number;
  label: string;
}

// The parts of any one day that are downtime: from midnight until the wake-up buffer ends, and from the
// wind-down before bed until midnight.
export function downtimeRanges(survey: Partial<SurveyAnswers> | null | undefined): DowntimeRange[] {
  const { bedtime, wake } = sleepPlan(survey);
  const ranges: DowntimeRange[] = [{ start: 0, end: wake + WAKE_BUFFER, label: 'Sleep and getting up' }];
  const windDown = bedtime - WIND_DOWN;
  if (windDown < DAY) ranges.push({ start: windDown, end: DAY, label: 'Winding down and sleep' });
  return ranges;
}

export const CHECK_IN_MINUTES = 15;

// When the planner shows the "reflect on your day" check-in: the start of the wind-down hour, so it comes
// before bed. A wind-down that starts after midnight puts it at 11:30 PM instead, on the same day.
export function checkInTime(survey: Partial<SurveyAnswers> | null | undefined) {
  const { bedtime } = sleepPlan(survey);
  const start = Math.min(bedtime - WIND_DOWN, DAY - 30);
  return { start, end: start + CHECK_IN_MINUTES };
}
