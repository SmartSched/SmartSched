import { describe, expect, it } from 'vitest';
import { isSleepTime, restingMood } from './blobMood';

// Waking at 07:00 after 8 hours puts bedtime at 23:00.
const survey = { wake_time: '07:00', sleep_hours: 8 };

describe('isSleepTime', () => {
  it('is asleep after bedtime and before waking, across midnight', () => {
    expect(isSleepTime(23 * 60 + 30, survey)).toBe(true);
    expect(isSleepTime(3 * 60, survey)).toBe(true);
    expect(isSleepTime(7 * 60, survey)).toBe(false);
    expect(isSleepTime(22 * 60, survey)).toBe(false);
  });
});

describe('restingMood', () => {
  it('sleeps at night whatever the page', () => {
    expect(restingMood(2 * 60, survey, '/reflection')).toBe('sleep');
  });

  it('yawns on the evening check-in and idles elsewhere', () => {
    expect(restingMood(21 * 60, survey, '/reflection')).toBe('yawn');
    expect(restingMood(14 * 60, survey, '/')).toBe('idle');
  });
});
