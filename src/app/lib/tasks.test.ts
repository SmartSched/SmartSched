import { describe, expect, it } from 'vitest';
import { sortTasks, type Task } from './tasks';

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
