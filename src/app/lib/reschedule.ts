import { addDays, format, startOfDay } from 'date-fns';
import { blockTimes, toMinutes, type TimeBlock } from './planner';

// Where a moved block may go: waking hours only, on a 15-minute grid, up to two weeks ahead.
export const DAY_START = '08:00';
export const DAY_END = '22:00';
export const SLOT_STEP_MINUTES = 15;
export const SEARCH_DAYS = 14;

export interface Slot {
  date: string;
  start_time: string; // HH:MM
  end_time: string;
}

function hhmm(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

// Task blocks whose time has passed while the task is still unchecked, one per task (its latest).
// A task that still has a block coming up isn't missed yet: it may just be split over several sessions.
export function missedTaskBlocks(blocks: TimeBlock[], now: Date): TimeBlock[] {
  const byTask = new Map<string, TimeBlock[]>();
  for (const block of blocks) {
    if (block.type !== 'task' || !block.task_id || !block.task || block.task.completed) continue;
    byTask.set(block.task_id, [...(byTask.get(block.task_id) ?? []), block]);
  }
  const missed: TimeBlock[] = [];
  for (const taskBlocks of byTask.values()) {
    if (taskBlocks.some((b) => blockTimes(b).end > now)) continue;
    missed.push(taskBlocks.reduce((latest, b) => (blockTimes(b).end > blockTimes(latest).end ? b : latest)));
  }
  return missed.sort((a, b) => blockTimes(a).end.getTime() - blockTimes(b).end.getTime());
}

// The earliest open slot as long as `block`, starting from now, that ends by `due` (if there is one)
// and doesn't overlap any other block. null means nothing fits: the task is at risk.
export function findOpenSlot(block: TimeBlock, blocks: TimeBlock[], now: Date, due: Date | null): Slot | null {
  const length = toMinutes(block.end_time) - toMinutes(block.start_time);
  const dayStart = toMinutes(DAY_START);
  const dayEnd = toMinutes(DAY_END);
  const nowMinutes = Math.ceil((now.getHours() * 60 + now.getMinutes() + (now.getSeconds() ? 1 : 0)) / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES;

  for (let i = 0; i < SEARCH_DAYS; i++) {
    const date = format(addDays(startOfDay(now), i), 'yyyy-MM-dd');
    const busy = blocks
      .filter((b) => b.date === date && b.id !== block.id)
      .map((b) => [toMinutes(b.start_time), toMinutes(b.end_time)] as const);
    const first = i === 0 ? Math.max(dayStart, nowMinutes) : dayStart;
    for (let start = first; start + length <= dayEnd; start += SLOT_STEP_MINUTES) {
      const end = start + length;
      // Slots only get later from here, so once one ends after the due time, none will fit.
      if (due && new Date(`${date}T${hhmm(end)}`) > due) return null;
      if (busy.some(([s, e]) => start < e && s < end)) continue;
      return { date, start_time: hhmm(start), end_time: hhmm(end) };
    }
  }
  return null;
}
