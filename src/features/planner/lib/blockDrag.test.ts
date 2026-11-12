import { describe, expect, it } from 'vitest';
import { canDrag, hhmm, snapStart } from './blockDrag';
import type { TimeBlock } from '../../../app/lib/planner';

describe('snapStart', () => {
  it('rounds to the nearest 15 minutes, keeping where the block was grabbed', () => {
    // Grabbed 20 minutes into the block, pointer at 10:07 -> block would start 9:47 -> 9:45.
    expect(snapStart(10 * 60 + 7, 20, 60)).toBe(9 * 60 + 45);
    expect(snapStart(10 * 60 + 8, 0, 60)).toBe(10 * 60 + 15);
  });

  it('keeps the block inside the day', () => {
    expect(snapStart(-30, 0, 60)).toBe(0);
    expect(snapStart(23 * 60 + 50, 0, 60)).toBe(22 * 60 + 59);
  });
});

describe('hhmm', () => {
  it('formats minutes as a 24-hour time', () => {
    expect(hhmm(9 * 60 + 5)).toBe('09:05');
    expect(hhmm(22 * 60 + 59)).toBe('22:59');
  });
});

describe('canDrag', () => {
  const block = { id: '1', feed_id: null, auto: false } as unknown as TimeBlock;
  it('leaves calendar and automatic blocks alone', () => {
    expect(canDrag(block)).toBe(true);
    expect(canDrag({ ...block, feed_id: 'f' } as TimeBlock)).toBe(false);
    expect(canDrag({ ...block, auto: true } as TimeBlock)).toBe(false);
  });
});
