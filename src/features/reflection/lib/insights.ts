// What the app has learned about someone, worked out from data it already has. No React, so it can be tested.
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { toMinutes, type TimeBlock } from '../../../app/lib/planner';
import type { Task } from '../../../app/lib/tasks';
import type { SurveyAnswers } from '../../../app/lib/survey';
import { sleepPlan } from '../../../app/lib/downtime';

export const LOOKBACK_DAYS = 28;

const GROUPS: { key: string; label: string; types: TimeBlock['type'][] }[] = [
  { key: 'classes', label: 'Classes', types: ['class'] },
  { key: 'schoolwork', label: 'Homework and study', types: ['study', 'task'] },
  { key: 'work', label: 'Work', types: ['work'] },
  { key: 'commute', label: 'Getting around', types: ['commute'] },
  { key: 'rest', label: 'Meals and breaks', types: ['meal', 'break'] },
  { key: 'personal', label: 'Personal time', types: ['personal'] },
];

export interface WeekRow {
  key: string;
  label: string;
  hours: number; // a typical week, to one decimal
}

// Hours a week in each kind of block, averaged over the 7-day stretches (counting back from today) that had
// anything planned, so a week before someone started using the app doesn't drag the average down.
export function typicalWeek(blocks: TimeBlock[], today: string): { rows: WeekRow[]; weeks: number } {
  const minutesByWeek = new Map<number, Map<string, number>>();
  for (const block of blocks) {
    const daysAgo = differenceInCalendarDays(parseISO(today), parseISO(block.date));
    if (daysAgo < 0 || daysAgo >= LOOKBACK_DAYS) continue;
    const group = GROUPS.find((g) => g.types.includes(block.type));
    if (!group) continue;
    const week = Math.floor(daysAgo / 7);
    const totals = minutesByWeek.get(week) ?? new Map<string, number>();
    totals.set(group.key, (totals.get(group.key) ?? 0) + toMinutes(block.end_time) - toMinutes(block.start_time));
    minutesByWeek.set(week, totals);
  }
  const weeks = minutesByWeek.size;
  const rows = GROUPS.map(({ key, label }) => {
    const total = [...minutesByWeek.values()].reduce((sum, totals) => sum + (totals.get(key) ?? 0), 0);
    return { key, label, hours: weeks ? Math.round((total / weeks / 60) * 10) / 10 : 0 };
  });
  return { rows, weeks };
}

export interface ReflectionRow {
  date: string;
  ratings: Record<string, number>;
  bed_time: string | null;
  wake_time: string | null;
}

// Sleep a night: from reflections that have both times when there are at least 3 of them, else what the survey
// plans for. null when there's nothing to go on.
export function sleepPerNight(reflections: ReflectionRow[], survey: Partial<SurveyAnswers> | null | undefined) {
  const nights = reflections
    .filter((r) => r.bed_time && r.wake_time)
    .map((r) => {
      const minutes = toMinutes(r.wake_time!) - toMinutes(r.bed_time!);
      return minutes <= 0 ? minutes + 24 * 60 : minutes;
    });
  if (nights.length >= 3) {
    const hours = nights.reduce((a, b) => a + b, 0) / nights.length / 60;
    return { hours: Math.round(hours * 10) / 10, source: 'reflections' as const, nights: nights.length };
  }
  if (survey?.sleep_hours || survey?.wake_time) {
    const { bedtime, wake } = sleepPlan(survey);
    return { hours: Math.round(((wake + 24 * 60 - bedtime) / 60) * 10) / 10, source: 'survey' as const, nights: 0 };
  }
  return null;
}

export interface TaskTimeRow {
  type: Task['type'];
  count: number;
  averageMinutes: number;
  ratio: number | null; // actual ÷ estimate, when the finished tasks had estimates
}

// For each task type: how long a finished one usually took, and how that compares with the estimates.
export function taskTimes(tasks: Task[]): TaskTimeRow[] {
  const byType = new Map<Task['type'], { minutes: number; count: number; actual: number; estimated: number }>();
  for (const task of tasks) {
    if (!task.completed || task.time_spent <= 0) continue;
    const totals = byType.get(task.type) ?? { minutes: 0, count: 0, actual: 0, estimated: 0 };
    totals.minutes += task.time_spent;
    totals.count += 1;
    if (task.estimated_time) {
      totals.actual += task.time_spent;
      totals.estimated += task.estimated_time;
    }
    byType.set(task.type, totals);
  }
  return [...byType.entries()]
    .map(([type, t]) => ({
      type,
      count: t.count,
      averageMinutes: Math.round(t.minutes / t.count),
      ratio: t.estimated ? Math.round((t.actual / t.estimated) * 10) / 10 : null,
    }))
    .sort((a, b) => b.count - a.count);
}

// Average of each rating over the reflections given, to one decimal.
export function averageRatings(reflections: ReflectionRow[], keys: readonly string[]) {
  return keys.map((key) => {
    const values = reflections.map((r) => r.ratings?.[key]).filter((v): v is number => typeof v === 'number' && v > 0);
    return { key, average: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null };
  });
}
