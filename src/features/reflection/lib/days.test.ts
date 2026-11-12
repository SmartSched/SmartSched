import { describe, expect, it } from 'vitest';
import { monthDates, summarizeDay } from './days';
import type { TimeBlock } from '../../../app/lib/planner';
import type { Task } from '../../../app/lib/tasks';

const block = (date: string, type: TimeBlock['type'], start: string, end: string) =>
  ({ id: `${date}${start}`, date, type, start_time: start, end_time: end, activity: type, task_id: null }) as TimeBlock;

describe('summarizeDay', () => {
  it('picks the pattern from the kind of block with the most time, ignoring commutes', () => {
    const blocks = [
      block('2026-11-03', 'class', '09:00', '12:00'),
      block('2026-11-03', 'study', '13:00', '14:00'),
      block('2026-11-03', 'commute', '06:00', '12:00'),
      block('2026-11-04', 'work', '09:00', '17:00'),
    ];
    const day = summarizeDay('2026-11-03', blocks, [], []);
    expect(day.mainType).toBe('class');
    expect(day.pattern).toBe('stripes');
    expect(day.blocks).toHaveLength(3);
    expect(day.classMinutes).toBe(180);
    expect(day.ratings).toBeNull();
  });

  it('lists tasks finished that day and the reflection ratings', () => {
    const tasks = [
      { title: 'Essay', completed: true, completed_at: '2026-11-03T15:00:00' },
      { title: 'Lab', completed: true, completed_at: '2026-11-04T15:00:00' },
      { title: 'Open', completed: false, completed_at: null },
    ] as Task[];
    const reflections = [{ date: '2026-11-03', ratings: { mood: 4 }, bed_time: null, wake_time: null }];
    const day = summarizeDay('2026-11-03', [], reflections, tasks);
    expect(day.finished).toEqual(['Essay']);
    expect(day.ratings).toEqual({ mood: 4 });
    expect(day.pattern).toBe('plain');
  });
});

describe('monthDates', () => {
  it('lists every day of the month', () => {
    expect(monthDates('2026-11')).toHaveLength(30);
    expect(monthDates('2026-12')[30]).toBe('2026-12-31');
    expect(monthDates('2027-02')).toHaveLength(28);
  });
});
