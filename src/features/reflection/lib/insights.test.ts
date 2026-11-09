import { describe, expect, it } from 'vitest';
import { averageRatings, sleepPerNight, taskTimes, typicalWeek } from './insights';
import type { TimeBlock } from '../../../app/lib/planner';
import type { Task } from '../../../app/lib/tasks';

const block = (date: string, type: TimeBlock['type'], start: string, end: string) =>
  ({ id: `${date}-${start}`, date, type, start_time: start, end_time: end, activity: type, task_id: null }) as TimeBlock;

const task = (fields: Partial<Task>) =>
  ({ id: 't', title: 't', description: null, completed: true, priority: 'medium', type: 'homework', due_date: null,
    estimated_time: null, completed_at: null, created_at: '2026-11-01', time_spent: 0, ...fields }) as Task;

describe('typicalWeek', () => {
  it('averages hours a week over the weeks that had anything planned', () => {
    const blocks = [
      block('2026-11-09', 'class', '09:00', '12:00'), // this week: 3 h of class
      block('2026-11-08', 'study', '13:00', '15:00'), // this week: 2 h study
      block('2026-11-01', 'class', '09:00', '10:00'), // last week: 1 h class
      block('2026-11-01', 'task', '10:00', '11:00'), // last week: 1 h task
    ];
    const { rows, weeks } = typicalWeek(blocks, '2026-11-09');
    expect(weeks).toBe(2);
    expect(rows.find((r) => r.key === 'classes')?.hours).toBe(2); // (3 + 1) / 2
    expect(rows.find((r) => r.key === 'schoolwork')?.hours).toBe(1.5); // (2 + 1) / 2
    expect(rows.find((r) => r.key === 'work')?.hours).toBe(0);
  });

  it('ignores blocks in the future or more than four weeks back', () => {
    const { weeks } = typicalWeek([block('2026-11-10', 'class', '09:00', '10:00'), block('2026-10-01', 'class', '09:00', '10:00')], '2026-11-09');
    expect(weeks).toBe(0);
  });
});

describe('sleepPerNight', () => {
  const night = (bed: string, wake: string) => ({ date: '2026-11-01', ratings: {}, bed_time: bed, wake_time: wake });

  it('uses reflections once there are three nights with both times, across midnight', () => {
    const result = sleepPerNight([night('23:00', '07:00'), night('00:00', '07:00'), night('22:30', '06:30')], null);
    expect(result).toEqual({ hours: 7.7, source: 'reflections', nights: 3 });
  });

  it('falls back to the survey, then to nothing', () => {
    expect(sleepPerNight([night('23:00', '07:00')], { sleep_hours: 8, wake_time: '07:00' })).toEqual({ hours: 8, source: 'survey', nights: 0 });
    expect(sleepPerNight([], null)).toBeNull();
  });
});

describe('taskTimes', () => {
  it('gives the usual time per type and how it compares with the estimates', () => {
    const rows = taskTimes([
      task({ type: 'homework', time_spent: 60, estimated_time: 40 }),
      task({ type: 'homework', time_spent: 90, estimated_time: 60 }),
      task({ type: 'exam', time_spent: 120 }),
      task({ type: 'exam', completed: false, time_spent: 500 }),
    ]);
    expect(rows).toEqual([
      { type: 'homework', count: 2, averageMinutes: 75, ratio: 1.5 },
      { type: 'exam', count: 1, averageMinutes: 120, ratio: null },
    ]);
  });
});

describe('averageRatings', () => {
  it('averages each rating and leaves out ones never given', () => {
    const rows = averageRatings(
      [
        { date: 'a', ratings: { mood: 4, energy: 2 }, bed_time: null, wake_time: null },
        { date: 'b', ratings: { mood: 3 }, bed_time: null, wake_time: null },
      ],
      ['mood', 'energy', 'sleep'],
    );
    expect(rows).toEqual([
      { key: 'mood', average: 3.5 },
      { key: 'energy', average: 2 },
      { key: 'sleep', average: null },
    ]);
  });
});
