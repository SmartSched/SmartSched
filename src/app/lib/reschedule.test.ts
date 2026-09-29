import { describe, expect, it } from 'vitest';
import type { TimeBlock } from './planner';
import { findOpenSlot, missedTaskBlocks } from './reschedule';

function block(id: string, date: string, start_time: string, end_time: string, extra: Partial<TimeBlock> = {}): TimeBlock {
  return { id, date, start_time, end_time, activity: id, type: 'study', task_id: null, ...extra };
}

function taskBlock(id: string, date: string, start_time: string, end_time: string, taskId: string, completed = false) {
  return block(id, date, start_time, end_time, {
    type: 'task',
    task_id: taskId,
    task: {
      id: taskId, title: taskId, priority: 'medium', type: 'homework', completed,
      due_date: null, estimated_time: null, time_spent: 0,
    },
  });
}

// Tuesday Sep 29, 2026, 1:07 PM local
const NOW = new Date(2026, 8, 29, 13, 7);

describe('missedTaskBlocks', () => {
  it('finds a task block that has passed while its task is unchecked', () => {
    const missed = taskBlock('essay-mon', '2026-09-28', '14:00', '15:00', 'essay');
    expect(missedTaskBlocks([missed], NOW)).toEqual([missed]);
  });

  it('ignores finished tasks, ordinary blocks, and blocks still going or coming up', () => {
    const blocks = [
      taskBlock('done', '2026-09-28', '14:00', '15:00', 'reading', true),
      block('class', '2026-09-28', '09:00', '10:00'),
      taskBlock('now', '2026-09-29', '13:00', '14:00', 'lab'),
      taskBlock('later', '2026-09-30', '10:00', '11:00', 'quiz'),
    ];
    expect(missedTaskBlocks(blocks, NOW)).toEqual([]);
  });

  it('waits while the same task still has a block coming up', () => {
    const blocks = [taskBlock('part1', '2026-09-28', '14:00', '15:00', 'essay'), taskBlock('part2', '2026-09-30', '14:00', '15:00', 'essay')];
    expect(missedTaskBlocks(blocks, NOW)).toEqual([]);
  });

  it('gives one block per task, the latest', () => {
    const blocks = [taskBlock('part1', '2026-09-27', '14:00', '15:00', 'essay'), taskBlock('part2', '2026-09-28', '14:00', '15:00', 'essay')];
    expect(missedTaskBlocks(blocks, NOW).map((b) => b.id)).toEqual(['part2']);
  });
});

describe('findOpenSlot', () => {
  const missed = taskBlock('essay', '2026-09-28', '14:00', '15:00', 'essay');

  it('takes the next open slot today, on the 15-minute grid after now', () => {
    expect(findOpenSlot(missed, [missed], NOW, null)).toEqual({ date: '2026-09-29', start_time: '13:15', end_time: '14:15' });
  });

  it('steps around other blocks', () => {
    const blocks = [missed, block('lab', '2026-09-29', '13:00', '16:00'), block('gym', '2026-09-29', '16:30', '17:30')];
    expect(findOpenSlot(missed, blocks, NOW, null)).toEqual({ date: '2026-09-29', start_time: '17:30', end_time: '18:30' });
  });

  it('moves to the next morning when today is full, staying inside 8 AM–10 PM', () => {
    const blocks = [missed, block('busy', '2026-09-29', '13:00', '21:30')];
    expect(findOpenSlot(missed, blocks, NOW, null)).toEqual({ date: '2026-09-30', start_time: '08:00', end_time: '09:00' });
    const lateNight = new Date(2026, 8, 29, 21, 30);
    expect(findOpenSlot(missed, [missed], lateNight, null)?.date).toBe('2026-09-30');
  });

  it('has to finish by the due time, or it returns null (at risk)', () => {
    const blocks = [missed, block('busy', '2026-09-29', '13:00', '22:00')];
    expect(findOpenSlot(missed, blocks, NOW, new Date(2026, 8, 30, 9, 0))).toEqual({ date: '2026-09-30', start_time: '08:00', end_time: '09:00' });
    expect(findOpenSlot(missed, blocks, NOW, new Date(2026, 8, 30, 8, 30))).toBeNull();
    expect(findOpenSlot(missed, blocks, NOW, new Date(2026, 8, 29, 23, 59))).toBeNull();
  });
});
