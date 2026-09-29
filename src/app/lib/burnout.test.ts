import { describe, expect, it } from 'vitest';
import { burnoutWarnings } from './burnout';
import type { TimeBlock } from './planner';
import type { Task } from './tasks';

// Sun Sep 27 – Sat Oct 3, 2026
const WEEK = ['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'];

let nextId = 0;
function block(date: string, start_time: string, end_time: string, type: TimeBlock['type'] = 'study'): TimeBlock {
  return { id: String(nextId++), date, start_time, end_time, activity: type, type, task_id: null };
}

function task(due_date: string | null, completed = false): Task {
  return {
    id: String(nextId++), title: 't', description: null, completed, priority: 'medium', type: 'homework',
    due_date, estimated_time: null, completed_at: null, created_at: '2026-09-01T12:00:00Z', time_spent: 0,
  };
}

const kinds = (blocks: TimeBlock[], tasks: Task[] = []) => burnoutWarnings(blocks, tasks, WEEK).map((w) => w.kind);

describe('burnoutWarnings', () => {
  it('says nothing about an ordinary week', () => {
    const blocks = [
      block('2026-09-28', '09:00', '10:15', 'class'),
      block('2026-09-28', '11:00', '12:30'),
      block('2026-09-28', '17:00', '18:00', 'personal'),
      block('2026-09-29', '09:00', '10:15', 'class'),
    ];
    expect(burnoutWarnings(blocks, [task('2026-09-30T23:59')], WEEK)).toEqual([]);
  });

  it('flags a day with more than 10 hours of classes, work and study', () => {
    const blocks = [
      block('2026-09-28', '08:00', '12:00', 'class'),
      block('2026-09-28', '12:30', '16:30', 'work'),
      block('2026-09-28', '17:00', '19:30'),
    ];
    const [warning] = burnoutWarnings(blocks, [], WEEK).filter((w) => w.kind === 'long_day');
    expect(warning).toEqual({ kind: 'long_day', date: '2026-09-28', message: 'Monday: 10.5 hours of classes, work and study' });
  });

  it('doesn\'t count personal time, meals or breaks toward a long day', () => {
    const blocks = [
      block('2026-09-28', '08:00', '14:00', 'class'),
      block('2026-09-28', '14:30', '19:00', 'personal'),
      block('2026-09-28', '19:00', '20:00', 'meal'),
    ];
    expect(kinds(blocks)).not.toContain('long_day');
  });

  it('flags more than 4 hours in a row, treating short gaps as no break', () => {
    const blocks = [
      block('2026-09-29', '09:00', '11:00', 'class'),
      block('2026-09-29', '11:10', '12:30', 'commute'),
      block('2026-09-29', '12:30', '14:00', 'work'),
    ];
    const [warning] = burnoutWarnings(blocks, [], WEEK).filter((w) => w.kind === 'no_break');
    expect(warning.message).toBe('Tuesday: 5 hours in a row without a break (9 AM–2 PM)');
  });

  it('counts a 15-minute gap, or a break or meal block, as a break', () => {
    const gap = [block('2026-09-29', '09:00', '11:30', 'class'), block('2026-09-29', '11:45', '14:00', 'work')];
    expect(kinds(gap)).not.toContain('no_break');
    const lunch = [
      block('2026-09-29', '09:00', '11:30', 'class'),
      block('2026-09-29', '11:30', '11:40', 'meal'),
      block('2026-09-29', '11:40', '14:00', 'work'),
    ];
    expect(kinds(lunch)).not.toContain('no_break');
  });

  it('flags a night with less than 8 hours between the last and first blocks', () => {
    const blocks = [block('2026-09-30', '21:00', '23:30'), block('2026-10-01', '06:30', '07:30', 'personal')];
    const [warning] = burnoutWarnings(blocks, [], WEEK).filter((w) => w.kind === 'short_night');
    expect(warning).toEqual({
      kind: 'short_night',
      date: '2026-09-30',
      message: 'Wednesday night: 7 hours between your last block (11:30 PM) and the next one (6:30 AM)',
    });
  });

  it('says nothing about nights next to an empty day', () => {
    expect(kinds([block('2026-09-30', '21:00', '23:30')])).toEqual([]);
  });

  it('flags three or more unfinished tasks due on the same day', () => {
    const tasks = [task('2026-10-02T09:00'), task('2026-10-02T17:00'), task('2026-10-02T23:59'), task('2026-10-03T23:59')];
    expect(burnoutWarnings([], tasks, WEEK)).toEqual([{ kind: 'due_pileup', date: '2026-10-02', message: 'Friday: 3 tasks due' }]);
  });

  it('doesn\'t count finished tasks or ones due outside the week', () => {
    const tasks = [task('2026-10-02T09:00'), task('2026-10-02T17:00'), task('2026-10-02T23:59', true), task('2026-10-05T23:59')];
    expect(burnoutWarnings([], tasks, WEEK)).toEqual([]);
  });
});
