// Planner logic with no React in it, so it can be unit-tested.

export interface TimeBlock {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  activity: string;
  type: 'class' | 'study' | 'break' | 'personal' | 'commute' | 'meal' | 'work';
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
