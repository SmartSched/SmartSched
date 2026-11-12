// One summary per day, for the month blanket. No React, so it can be tested.
import { eachDayOfInterval, endOfMonth, format, parseISO, startOfMonth } from 'date-fns';
import { toMinutes, type TimeBlock } from '../../../app/lib/planner';
import type { Task } from '../../../app/lib/tasks';
import type { ReflectionRow } from './insights';

export type Pattern = 'stripes' | 'dots' | 'checks' | 'waves' | 'rings' | 'plain';

// Which pattern a day's patch gets from the kind of block it had most of.
const PATTERN_FOR: Record<TimeBlock['type'], Pattern> = {
  class: 'stripes',
  study: 'dots',
  task: 'dots',
  work: 'checks',
  personal: 'waves',
  break: 'rings',
  meal: 'rings',
  commute: 'plain',
};

export interface DaySummary {
  date: string;
  ratings: Record<string, number> | null; // null when the day has no reflection
  pattern: Pattern;
  mainType: TimeBlock['type'] | null;
  blocks: TimeBlock[]; // sorted by start time
  finished: string[]; // titles of tasks finished that day
  classMinutes: number;
}

export function summarizeDay(date: string, blocks: TimeBlock[], reflections: ReflectionRow[], tasks: Task[]): DaySummary {
  const dayBlocks = blocks
    .filter((b) => b.date === date)
    .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));
  const minutes = new Map<TimeBlock['type'], number>();
  for (const b of dayBlocks) {
    if (b.type === 'commute') continue;
    minutes.set(b.type, (minutes.get(b.type) ?? 0) + toMinutes(b.end_time) - toMinutes(b.start_time));
  }
  const mainType = [...minutes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const reflection = reflections.find((r) => r.date === date);
  const finished = tasks
    .filter((t) => t.completed && t.completed_at && format(new Date(t.completed_at), 'yyyy-MM-dd') === date)
    .map((t) => t.title);
  return {
    date,
    ratings: reflection ? (reflection.ratings as Record<string, number>) : null,
    pattern: mainType ? PATTERN_FOR[mainType] : 'plain',
    mainType,
    blocks: dayBlocks,
    finished,
    classMinutes: minutes.get('class') ?? 0,
  };
}

// Every day of a month ('yyyy-MM').
export function monthDates(month: string) {
  const first = parseISO(`${month}-01`);
  return eachDayOfInterval({ start: startOfMonth(first), end: endOfMonth(first) }).map((d) => format(d, 'yyyy-MM-dd'));
}
