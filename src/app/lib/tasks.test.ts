import { describe, expect, it } from 'vitest';
import { estimateRatios, sortTasks, type Task } from './tasks';

function task(id: string, fields: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    description: null,
    completed: false,
    priority: 'medium',
    type: 'homework',
    due_date: null,
    estimated_time: null,
    completed_at: null,
    created_at: '2026-09-01T12:00:00Z',
    time_spent: 0,
    ...fields,
  };
}

const ids = (tasks: Task[]) => sortTasks(tasks).map((t) => t.id);

describe('sortTasks', () => {
  it('puts unfinished tasks above finished ones', () => {
    expect(ids([task('done', { completed: true, completed_at: '2026-09-28T10:00:00Z' }), task('open')])).toEqual(['open', 'done']);
  });

  it('orders unfinished tasks by soonest due, with undated ones last', () => {
    const tasks = [
      task('undated'),
      task('friday', { due_date: '2026-10-02T23:59:00Z' }),
      task('tomorrow', { due_date: '2026-09-30T23:59:00Z' }),
    ];
    expect(ids(tasks)).toEqual(['tomorrow', 'friday', 'undated']);
  });

  it('breaks a due-date tie by priority, then by newest', () => {
    const due = '2026-09-30T23:59:00Z';
    const tasks = [
      task('low', { due_date: due, priority: 'low' }),
      task('high-older', { due_date: due, priority: 'high', created_at: '2026-09-01T12:00:00Z' }),
      task('high-newer', { due_date: due, priority: 'high', created_at: '2026-09-10T12:00:00Z' }),
    ];
    expect(ids(tasks)).toEqual(['high-newer', 'high-older', 'low']);
  });

  it('orders undated tasks by priority too', () => {
    expect(ids([task('low', { priority: 'low' }), task('high', { priority: 'high' })])).toEqual(['high', 'low']);
  });

  it('shows the most recently finished task first among finished ones', () => {
    const tasks = [
      task('monday', { completed: true, completed_at: '2026-09-28T10:00:00Z' }),
      task('tuesday', { completed: true, completed_at: '2026-09-29T10:00:00Z' }),
    ];
    expect(ids(tasks)).toEqual(['tuesday', 'monday']);
  });

  it('returns a new list and leaves the original alone', () => {
    const tasks = [task('b', { priority: 'low' }), task('a', { priority: 'high' })];
    sortTasks(tasks);
    expect(tasks.map((t) => t.id)).toEqual(['b', 'a']);
  });
});

describe('estimateRatios', () => {
  const done = (id: string, type: Task['type'], estimated_time: number, time_spent: number) =>
    task(id, { type, estimated_time, time_spent, completed: true, completed_at: '2026-09-28T10:00:00Z' });

  it('compares total time spent with total estimated, per type', () => {
    const tasks = [done('a', 'homework', 60, 90), done('b', 'homework', 120, 150), done('c', 'study', 30, 30), done('d', 'study', 60, 45)];
    expect(estimateRatios(tasks)).toEqual({ homework: { ratio: 1.3, count: 2 }, study: { ratio: 0.8, count: 2 } });
  });

  it('needs at least two finished tasks of a type', () => {
    expect(estimateRatios([done('a', 'exam', 60, 120)])).toEqual({});
  });

  it('skips unfinished tasks and ones without an estimate or a recorded time', () => {
    const tasks = [
      done('a', 'homework', 60, 90),
      done('b', 'homework', 60, 90),
      task('open', { type: 'homework', estimated_time: 60, time_spent: 600 }),
      done('no-estimate', 'homework', 0, 600),
      done('no-time', 'homework', 60, 0),
    ];
    expect(estimateRatios(tasks)).toEqual({ homework: { ratio: 1.5, count: 2 } });
  });
});
