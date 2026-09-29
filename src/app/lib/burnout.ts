import { addDays, format, parseISO } from 'date-fns';
import { toMinutes, type TimeBlock } from './planner';
import type { Task } from './tasks';

// Thresholds, in one place so they're easy to tune.
export const LONG_DAY_HOURS = 10; // scheduled hours of classes, work, study and commuting in one day
export const NO_BREAK_HOURS = 4; // back-to-back scheduled time with no real gap
export const BREAK_MINUTES = 15; // a gap at least this long counts as a break
export const NIGHT_HOURS = 8; // time between the last block of one day and the first of the next
export const DUE_SAME_DAY = 3; // unfinished tasks due on one day

// Personal time, breaks and meals don't count toward a long day; breaks and meals also end a stretch.
const BUSY_TYPES = new Set<TimeBlock['type']>(['class', 'study', 'work', 'task', 'commute']);
const REST_TYPES = new Set<TimeBlock['type']>(['break', 'meal']);

export interface BurnoutWarning {
  kind: 'long_day' | 'no_break' | 'short_night' | 'due_pileup';
  date: string; // YYYY-MM-DD the warning is about
  message: string;
}

function dayName(date: string) {
  return format(parseISO(date), 'EEEE');
}

function clock(minutes: number) {
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  return `${hours % 12 || 12}${mins ? `:${String(mins).padStart(2, '0')}` : ''} ${hours < 12 ? 'AM' : 'PM'}`;
}

function hours(minutes: number) {
  const value = Math.round((minutes / 60) * 2) / 2; // nearest half hour
  return `${value} ${value === 1 ? 'hour' : 'hours'}`;
}

// Stretches of busy blocks with no break between them, as [start, end] minutes of the day.
function stretches(dayBlocks: TimeBlock[]) {
  const busy = dayBlocks
    .filter((b) => BUSY_TYPES.has(b.type))
    .map((b) => [toMinutes(b.start_time), toMinutes(b.end_time)] as const)
    .sort((a, b) => a[0] - b[0]);
  const rests = dayBlocks.filter((b) => REST_TYPES.has(b.type)).map((b) => toMinutes(b.start_time));
  const out: [number, number][] = [];
  for (const [start, end] of busy) {
    const last = out[out.length - 1];
    const restInGap = last && rests.some((r) => r >= last[1] && r <= start);
    if (last && start - last[1] < BREAK_MINUTES && !restInGap) {
      last[1] = Math.max(last[1], end);
    } else {
      out.push([start, end]);
    }
  }
  return out;
}

// Warnings for one week. weekDates are the days to check (YYYY-MM-DD); blocks and tasks can include
// others, which are ignored (except the next day's blocks for the last night of the week).
export function burnoutWarnings(blocks: TimeBlock[], tasks: Task[], weekDates: string[]): BurnoutWarning[] {
  const warnings: BurnoutWarning[] = [];
  const byDate = new Map<string, TimeBlock[]>();
  for (const block of blocks) byDate.set(block.date, [...(byDate.get(block.date) ?? []), block]);

  weekDates.forEach((date, i) => {
    const dayBlocks = byDate.get(date) ?? [];

    const busyMinutes = dayBlocks
      .filter((b) => BUSY_TYPES.has(b.type))
      .reduce((sum, b) => sum + toMinutes(b.end_time) - toMinutes(b.start_time), 0);
    if (busyMinutes > LONG_DAY_HOURS * 60) {
      warnings.push({
        kind: 'long_day',
        date,
        message: `${dayName(date)}: ${hours(busyMinutes)} of classes, work and study`,
      });
    }

    for (const [start, end] of stretches(dayBlocks)) {
      if (end - start > NO_BREAK_HOURS * 60) {
        warnings.push({
          kind: 'no_break',
          date,
          message: `${dayName(date)}: ${hours(end - start)} in a row without a break (${clock(start)}–${clock(end)})`,
        });
      }
    }

    // The night after this day: from its last block to the next day's first. Days with nothing
    // scheduled on either side don't say anything about sleep, so they're skipped.
    const nextDate = weekDates[i + 1] ?? format(addDays(parseISO(date), 1), 'yyyy-MM-dd');
    const nextBlocks = byDate.get(nextDate) ?? [];
    if (dayBlocks.length && nextBlocks.length) {
      const lastEnd = Math.max(...dayBlocks.map((b) => toMinutes(b.end_time)));
      const firstStart = Math.min(...nextBlocks.map((b) => toMinutes(b.start_time)));
      const night = 24 * 60 - lastEnd + firstStart;
      if (night < NIGHT_HOURS * 60) {
        warnings.push({
          kind: 'short_night',
          date,
          message: `${dayName(date)} night: ${hours(night)} between your last block (${clock(lastEnd)}) and the next one (${clock(firstStart)})`,
        });
      }
    }

    const due = tasks.filter(
      (t) => !t.completed && t.due_date && format(new Date(t.due_date), 'yyyy-MM-dd') === date,
    ).length;
    if (due >= DUE_SAME_DAY) {
      warnings.push({ kind: 'due_pileup', date, message: `${dayName(date)}: ${due} tasks due` });
    }
  });

  return warnings;
}
