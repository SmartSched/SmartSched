import { describe, expect, it } from 'vitest';
import { checkInTime, downtimeRanges, sleepPlan } from './downtime';

describe('sleepPlan', () => {
  it('works bedtime back from the wake time and sleep hours', () => {
    // 07:00 wake, 8 hours: bed at 23:00
    expect(sleepPlan({ wake_time: '07:00', sleep_hours: 8 })).toEqual({ bedtime: 23 * 60, wake: 7 * 60 });
  });

  it('keeps a past-midnight bedtime as minutes after the previous midnight', () => {
    expect(sleepPlan({ wake_time: '09:00', sleep_hours: 8 })).toEqual({ bedtime: 25 * 60, wake: 9 * 60 });
  });

  it('moves a bedtime outside the band into it', () => {
    // 04:00 wake with 8 hours would mean 20:00; the band starts at 21:30
    expect(sleepPlan({ wake_time: '04:00', sleep_hours: 8 }).bedtime).toBe(21 * 60 + 30);
  });

  it('falls back to the focus-time default without a wake time', () => {
    expect(sleepPlan({ focus_time: 'morning' }).bedtime).toBe(23 * 60);
  });
});

describe('downtimeRanges', () => {
  it('greys out until 45 minutes after waking and from an hour before bed', () => {
    expect(downtimeRanges({ wake_time: '07:00', sleep_hours: 8 }).map(({ start, end }) => [start, end])).toEqual([
      [0, 7 * 60 + 45],
      [22 * 60, 24 * 60],
    ]);
  });

  it('has no evening range when wind-down starts after midnight', () => {
    expect(downtimeRanges({ wake_time: '10:00', sleep_hours: 8 })).toHaveLength(1);
  });
});

describe('checkInTime', () => {
  it('sits at the start of the wind-down hour', () => {
    expect(checkInTime({ wake_time: '07:00', sleep_hours: 8 })).toEqual({ start: 22 * 60, end: 22 * 60 + 15 });
  });

  it('stays on the same day when bedtime is after midnight', () => {
    expect(checkInTime({ wake_time: '09:00', sleep_hours: 8 })).toEqual({ start: 23 * 60 + 30, end: 23 * 60 + 45 });
  });
});
