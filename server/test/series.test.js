import { describe, expect, it } from 'vitest';
import { expandSeries } from '../series.js';

describe('expandSeries', () => {
  it('lists every chosen weekday between the start and end dates', () => {
    // Mon/Wed/Fri classes for two weeks; Sep 28, 2026 is a Monday.
    expect(expandSeries({ days_of_week: [1, 3, 5], interval_weeks: 1, start_date: '2026-09-28', end_date: '2026-10-09' })).toEqual([
      '2026-09-28', '2026-09-30', '2026-10-02', '2026-10-05', '2026-10-07', '2026-10-09',
    ]);
  });

  it('includes the start and end dates themselves when they match', () => {
    expect(expandSeries({ days_of_week: [2], start_date: '2026-09-29', end_date: '2026-10-06' })).toEqual(['2026-09-29', '2026-10-06']);
  });

  it('skips every other week, counting from the week the repeat starts in', () => {
    // Starts on a Wednesday; Tuesdays in the same (Sun-Sat) week are already past, so the first is two weeks on.
    expect(expandSeries({ days_of_week: [2, 4], interval_weeks: 2, start_date: '2026-09-30', end_date: '2026-10-31' })).toEqual([
      '2026-10-01', '2026-10-13', '2026-10-15', '2026-10-27', '2026-10-29',
    ]);
  });

  it('keeps the same weekdays across a daylight saving change', () => {
    // US clocks change on Nov 1, 2026.
    expect(expandSeries({ days_of_week: [0], start_date: '2026-10-25', end_date: '2026-11-15' })).toEqual([
      '2026-10-25', '2026-11-01', '2026-11-08', '2026-11-15',
    ]);
  });

  it('gives nothing when no chosen day falls in the range', () => {
    expect(expandSeries({ days_of_week: [6], start_date: '2026-09-28', end_date: '2026-10-02' })).toEqual([]);
  });

  it('can be every day', () => {
    expect(expandSeries({ days_of_week: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-09-28', end_date: '2026-10-04' })).toHaveLength(7);
  });
});
