// Planner logic with no React in it, so it can be unit-tested.

// The task a 'task' block is for, as the server attaches it.
export interface BlockTask {
  id: string;
  title: string;
  priority: 'low' | 'medium' | 'high';
  type: 'homework' | 'exam' | 'project' | 'work' | 'study';
  completed: boolean;
  due_date: string | null;
  estimated_time: number | null;
  time_spent: number;
}

export interface TimeBlock {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  activity: string;
  type: 'class' | 'study' | 'break' | 'personal' | 'commute' | 'meal' | 'work' | 'task';
  task_id: string | null;
  task?: BlockTask | null;
  location?: string | null; // lowercase place name, see places.ts
  series_id?: string | null; // set when the block is one of a repeat
  series?: BlockSeries | null;
  auto?: boolean; // a commute the app added (it's recalculated when the day changes)
}

// The repeat rule a block came from, as the server attaches it.
export interface BlockSeries {
  id: string;
  days_of_week: number[]; // 0 = Sunday
  interval_weeks: 1 | 2;
  start_date: string;
  end_date: string;
}

export interface PlacedBlock {
  block: TimeBlock;
  column: number;
  columns: number;
}

// "09:30" or "09:30:00" -> minutes since midnight
export function toMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

// Overlapping blocks share the row side by side: each gets the first free column, and every
// block in a group of overlapping blocks is as wide as that group's column count allows.
// minVisualMinutes: the shortest a block is drawn, so a 5-minute block still counts as taking up that much room.
export function layoutBlocks(blocks: TimeBlock[], minVisualMinutes = 0): PlacedBlock[] {
  const sorted = [...blocks].sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time) || toMinutes(a.end_time) - toMinutes(b.end_time));
  const placed: PlacedBlock[] = [];
  let group: PlacedBlock[] = [];
  let columnEnds: number[] = [];
  let groupEnd = -1;

  const closeGroup = () => group.forEach((item) => (item.columns = columnEnds.length));

  for (const block of sorted) {
    const start = toMinutes(block.start_time);
    const end = Math.max(toMinutes(block.end_time), start + minVisualMinutes);
    if (start >= groupEnd) {
      closeGroup();
      group = [];
      columnEnds = [];
    }
    let column = columnEnds.findIndex((columnEnd) => columnEnd <= start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(end);
    } else {
      columnEnds[column] = end;
    }
    const item = { block, column, columns: 1 };
    group.push(item);
    placed.push(item);
    groupEnd = Math.max(groupEnd, end);
  }
  closeGroup();
  return placed;
}

// When a block starts and ends, as local Date objects.
export function blockTimes(block: Pick<TimeBlock, 'date' | 'start_time' | 'end_time'>) {
  return {
    start: new Date(`${block.date}T${block.start_time.slice(0, 5)}`),
    end: new Date(`${block.date}T${block.end_time.slice(0, 5)}`),
  };
}

// Minutes of a task's blocks that have already happened by `now` (a block still going counts up to now).
// This is the starting guess for "how long did it actually take?".
export function minutesSoFar(blocks: TimeBlock[], taskId: string, now: Date) {
  let total = 0;
  for (const block of blocks) {
    if (block.task_id !== taskId) continue;
    const { start, end } = blockTimes(block);
    const until = Math.min(end.getTime(), now.getTime());
    if (until > start.getTime()) total += Math.round((until - start.getTime()) / 60_000);
  }
  return total;
}
