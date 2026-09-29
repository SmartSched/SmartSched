import { describe, expect, it } from 'vitest';
import { layoutBlocks, minutesSoFar, toMinutes, type TimeBlock } from './planner';

function block(id: string, start_time: string, end_time: string): TimeBlock {
  return { id, date: '2026-09-29', start_time, end_time, activity: id, type: 'study', task_id: null };
}

// id -> [column, columns], easier to read than the full objects.
function layout(blocks: TimeBlock[], minVisualMinutes = 0) {
  return Object.fromEntries(layoutBlocks(blocks, minVisualMinutes).map((p) => [p.block.id, [p.column, p.columns]]));
}

describe('toMinutes', () => {
  it('reads HH:MM and HH:MM:SS', () => {
    expect(toMinutes('09:30')).toBe(570);
    expect(toMinutes('09:30:00')).toBe(570);
    expect(toMinutes('00:00')).toBe(0);
    expect(toMinutes('23:59:00')).toBe(1439);
  });
});

describe('layoutBlocks', () => {
  it('gives blocks that don\'t overlap the full width', () => {
    expect(layout([block('a', '09:00', '10:00'), block('b', '11:00', '12:00')])).toEqual({ a: [0, 1], b: [0, 1] });
  });

  it('treats a block ending exactly when the next starts as not overlapping', () => {
    expect(layout([block('a', '09:00', '10:00'), block('b', '10:00', '11:00')])).toEqual({ a: [0, 1], b: [0, 1] });
  });

  it('puts overlapping blocks side by side at half width', () => {
    expect(layout([block('a', '09:00', '10:30'), block('b', '10:00', '11:00')])).toEqual({ a: [0, 2], b: [1, 2] });
  });

  it('reuses a column once it frees up, so a chain of three needs only two', () => {
    // a overlaps b and b overlaps c, but a ends before c starts.
    const blocks = [block('a', '09:00', '10:00'), block('b', '09:30', '11:00'), block('c', '10:00', '11:30')];
    expect(layout(blocks)).toEqual({ a: [0, 2], b: [1, 2], c: [0, 2] });
  });

  it('starts a new group after a gap, so later blocks get the full width back', () => {
    const blocks = [block('a', '09:00', '10:00'), block('b', '09:30', '10:30'), block('c', '13:00', '14:00')];
    expect(layout(blocks)).toEqual({ a: [0, 2], b: [1, 2], c: [0, 1] });
  });

  it('gives three blocks at the same time a column each', () => {
    const blocks = [block('a', '09:00', '10:00'), block('b', '09:00', '10:00'), block('c', '09:00', '10:00')];
    expect(Object.values(layout(blocks)).map(([, columns]) => columns)).toEqual([3, 3, 3]);
  });

  it('counts a very short block as its drawn height, so it doesn\'t overlap the next one on screen', () => {
    const blocks = [block('a', '09:00', '09:05'), block('b', '09:15', '10:00')];
    expect(layout(blocks)).toEqual({ a: [0, 1], b: [0, 1] });
    expect(layout(blocks, 25)).toEqual({ a: [0, 2], b: [1, 2] });
  });

  it('doesn\'t depend on the order blocks arrive in', () => {
    const blocks = [block('c', '10:00', '11:30'), block('a', '09:00', '10:00'), block('b', '09:30', '11:00')];
    expect(layout(blocks)).toEqual({ a: [0, 2], b: [1, 2], c: [0, 2] });
  });
});

describe('minutesSoFar', () => {
  const taskBlock = (id: string, date: string, start_time: string, end_time: string, task_id = 'essay'): TimeBlock => ({
    id, date, start_time, end_time, activity: 'Essay', type: 'task', task_id,
  });
  const blocks = [
    taskBlock('mon', '2026-09-28', '14:00', '15:00'),
    taskBlock('tue', '2026-09-29', '10:00', '11:30'),
    taskBlock('wed', '2026-09-30', '10:00', '11:00'),
    taskBlock('other', '2026-09-28', '09:00', '10:00', 'reading'),
  ];

  it('adds up the task\'s blocks that have happened, counting one in progress up to now', () => {
    expect(minutesSoFar(blocks, 'essay', new Date(2026, 8, 29, 11, 0))).toBe(60 + 60);
    expect(minutesSoFar(blocks, 'essay', new Date(2026, 8, 29, 12, 0))).toBe(60 + 90);
    expect(minutesSoFar(blocks, 'essay', new Date(2026, 9, 1, 9, 0))).toBe(60 + 90 + 60);
  });

  it('is 0 before anything has started, and ignores other tasks', () => {
    expect(minutesSoFar(blocks, 'essay', new Date(2026, 8, 27, 9, 0))).toBe(0);
    expect(minutesSoFar(blocks, 'reading', new Date(2026, 9, 1, 9, 0))).toBe(60);
  });
});
