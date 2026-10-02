import { describe, expect, it } from 'vitest';
import {
  isValidDate,
  isValidTimeSpent,
  pairKey,
  validateRatings,
  validateSeries,
  validateSurvey,
  validateTimeBlock,
  validateTravel,
} from '../validation.js';

describe('isValidDate', () => {
  it('accepts real YYYY-MM-DD dates', () => {
    expect(isValidDate('2026-09-29')).toBe(true);
    expect(isValidDate('2028-02-29')).toBe(true); // leap year
  });

  it('rejects impossible dates and other formats', () => {
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('2027-02-29')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('9/29/2026')).toBe(false);
    expect(isValidDate('2026-9-29')).toBe(false);
    expect(isValidDate(20260929)).toBe(false);
    expect(isValidDate(undefined)).toBe(false);
  });
});

describe('validateTimeBlock', () => {
  const valid = { activity: 'CSC 453 Lecture', date: '2026-09-29', start_time: '09:30', end_time: '10:45', type: 'class' };

  it('returns a clean block with times as HH:MM:SS', () => {
    expect(validateTimeBlock(valid)).toEqual({
      block: {
        activity: 'CSC 453 Lecture',
        date: '2026-09-29',
        start_time: '09:30:00',
        end_time: '10:45:00',
        type: 'class',
        task_id: null,
        location: null,
      },
    });
  });

  it('trims the activity and drops fields it doesn\'t know', () => {
    const { block } = validateTimeBlock({ ...valid, activity: '  Gym  ', user_id: 'someone-else', id: 'x' });
    expect(block.activity).toBe('Gym');
    expect(block).not.toHaveProperty('user_id');
    expect(block).not.toHaveProperty('id');
  });

  it('accepts every block type the planner offers, including work', () => {
    for (const type of ['class', 'study', 'break', 'personal', 'commute', 'meal', 'work']) {
      expect(validateTimeBlock({ ...valid, type }).block?.type).toBe(type);
    }
  });

  it('needs a task id on a task block, and drops one from any other type', () => {
    const taskId = '3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b';
    expect(validateTimeBlock({ ...valid, type: 'task', task_id: taskId }).block?.task_id).toBe(taskId);
    expect(validateTimeBlock({ ...valid, type: 'task' })).toEqual({ error: 'Pick a task for this block' });
    expect(validateTimeBlock({ ...valid, type: 'task', task_id: 'not-an-id' })).toEqual({ error: 'Pick a task for this block' });
    // Changing a task block to study: the merged row still has the old task_id, which must go.
    expect(validateTimeBlock({ ...valid, type: 'study', task_id: taskId }).block?.task_id).toBeNull();
  });

  it('explains the first problem', () => {
    expect(validateTimeBlock({ ...valid, activity: '   ' })).toEqual({ error: 'Activity is required' });
    expect(validateTimeBlock({ ...valid, date: '2026-02-30' })).toEqual({ error: 'Date must be a valid YYYY-MM-DD date' });
    expect(validateTimeBlock({ ...valid, start_time: '9:30' })).toEqual({ error: 'Start time must be HH:MM' });
    expect(validateTimeBlock({ ...valid, end_time: '24:00' })).toEqual({ error: 'End time must be HH:MM' });
    expect(validateTimeBlock({ ...valid, type: 'nap' })).toEqual({ error: 'Invalid block type' });
  });

  it('needs the end after the start, comparing HH:MM with HH:MM:SS correctly', () => {
    expect(validateTimeBlock({ ...valid, end_time: '09:30' }).error).toBe('End time must be after start time');
    expect(validateTimeBlock({ ...valid, end_time: '09:00' }).error).toBe('End time must be after start time');
    expect(validateTimeBlock({ ...valid, start_time: '09:30:00', end_time: '09:31' }).block).toBeDefined();
  });
});

describe('validateSurvey', () => {
  const valid = {
    commitments: { classes: 15, work: 10 },
    focus_time: 'morning',
    work_session: '45',
    non_negotiables: ['sleep', 'friends', 'sleep'],
    deadline_style: 'steady',
    calendar_style: 'calendar2',
  };

  it('keeps known answers and removes duplicate non-negotiables', () => {
    const { survey } = validateSurvey({ ...valid, extra: 'ignored' });
    expect(survey).toEqual({ ...valid, non_negotiables: ['sleep', 'friends'] });
  });

  it('needs at least one commitment, with sensible hours', () => {
    expect(validateSurvey({ ...valid, commitments: {} }).error).toBe('Pick at least one weekly commitment');
    expect(validateSurvey({ ...valid, commitments: { classes: 0 } }).error).toMatch(/between 0 and 168/);
    expect(validateSurvey({ ...valid, commitments: { classes: 200 } }).error).toMatch(/between 0 and 168/);
    expect(validateSurvey({ ...valid, commitments: { chores: 5 } }).error).toBe('Unknown commitment: chores');
  });

  it('rejects answers that aren\'t options', () => {
    expect(validateSurvey({ ...valid, focus_time: 'noon' }).error).toBe('Invalid answer for focus_time');
    expect(validateSurvey({ ...valid, calendar_style: 'calendar9' }).error).toBe('Invalid answer for calendar_style');
    expect(validateSurvey({ ...valid, non_negotiables: [] }).error).toMatch(/at least one thing/);
    expect(validateSurvey({ ...valid, non_negotiables: ['sleep', 'naps'] }).error).toBe('Invalid answer for non_negotiables');
  });

  it('needs an object', () => {
    expect(validateSurvey(null).error).toBe('Survey answers are required');
  });
});

describe('isValidTimeSpent', () => {
  it('takes whole minutes from 0 up to a week', () => {
    expect(isValidTimeSpent(0)).toBe(true);
    expect(isValidTimeSpent(95)).toBe(true);
    expect(isValidTimeSpent(10080)).toBe(true);
    expect(isValidTimeSpent(10081)).toBe(false);
    expect(isValidTimeSpent(-5)).toBe(false);
    expect(isValidTimeSpent(12.5)).toBe(false);
    expect(isValidTimeSpent('60')).toBe(false);
  });
});

describe('validateRatings', () => {
  const valid = { productivity: 4, mood: 3, energy: 2, sleep: 5 };

  it('keeps exactly the four ratings', () => {
    expect(validateRatings({ ...valid, stress: 5 })).toEqual({ ratings: valid });
  });

  it('needs every rating to be a whole number from 1 to 5', () => {
    expect(validateRatings({ ...valid, mood: 0 }).error).toBe('Rate mood from 1 to 5');
    expect(validateRatings({ ...valid, energy: 6 }).error).toBe('Rate energy from 1 to 5');
    expect(validateRatings({ ...valid, sleep: 3.5 }).error).toBe('Rate sleep from 1 to 5');
    expect(validateRatings({ ...valid, productivity: '4' }).error).toBe('Rate productivity from 1 to 5');
    const { sleep, ...missing } = valid;
    expect(validateRatings(missing).error).toBe('Rate sleep from 1 to 5');
    expect(validateRatings(undefined).error).toBe('Ratings are required');
  });
});

describe('block locations', () => {
  const valid = { activity: 'Lecture', date: '2026-09-29', start_time: '09:30', end_time: '10:45', type: 'class' };

  it('stores places lowercase and trimmed, and treats blank as none', () => {
    expect(validateTimeBlock({ ...valid, location: '  Campus ' }).block?.location).toBe('campus');
    expect(validateTimeBlock({ ...valid, location: 'Library 2nd floor' }).block?.location).toBe('library 2nd floor');
    expect(validateTimeBlock({ ...valid, location: '' }).block?.location).toBeNull();
    expect(validateTimeBlock({ ...valid, location: null }).block?.location).toBeNull();
  });

  it('rejects something that isn\'t a short place name', () => {
    expect(validateTimeBlock({ ...valid, location: 42 }).error).toBe('Location must be a short place name');
    expect(validateTimeBlock({ ...valid, location: 'x'.repeat(41) }).error).toBe('Location must be a short place name');
  });
});

describe('validateSeries', () => {
  const valid = {
    activity: 'CSC 453', type: 'class', location: 'Campus', start_time: '10:00', end_time: '11:15',
    days_of_week: [3, 1, 1, 5], interval_weeks: 1, start_date: '2026-09-28', end_date: '2026-12-11',
  };

  it('returns a clean rule with days sorted and deduplicated', () => {
    expect(validateSeries(valid)).toEqual({
      series: {
        activity: 'CSC 453', type: 'class', location: 'campus', start_time: '10:00:00', end_time: '11:15:00',
        days_of_week: [1, 3, 5], interval_weeks: 1, start_date: '2026-09-28', end_date: '2026-12-11',
      },
    });
  });

  it('defaults to every week', () => {
    const { interval_weeks, ...rest } = valid;
    expect(validateSeries(rest).series?.interval_weeks).toBe(1);
  });

  it('explains what\'s wrong', () => {
    expect(validateSeries({ ...valid, days_of_week: [] }).error).toBe('Pick at least one day of the week');
    expect(validateSeries({ ...valid, days_of_week: [7] }).error).toBe('Pick at least one day of the week');
    expect(validateSeries({ ...valid, interval_weeks: 3 }).error).toBe('Repeat every week or every other week');
    expect(validateSeries({ ...valid, end_date: '2026-09-01' }).error).toMatch(/end on or after/);
    expect(validateSeries({ ...valid, end_date: '2027-12-01' }).error).toBe('A repeat can last up to a year');
    expect(validateSeries({ ...valid, type: 'task', task_id: 'x' }).error).toBe('Task blocks can\'t repeat');
    expect(validateSeries({ ...valid, end_time: '09:00' }).error).toBe('End time must be after start time');
  });
});

describe('validateTravel', () => {
  it('keeps custom places and minutes between known places, with pair keys sorted', () => {
    expect(validateTravel({ places: ['Library', 'campus', 'library'], minutes: { 'work|campus': 20, 'home|library': 15 } })).toEqual({
      travel: { places: ['library'], minutes: { 'campus|work': 20, 'home|library': 15 } },
    });
  });

  it('rejects unknown places and silly times', () => {
    expect(validateTravel({ places: [], minutes: { 'home|mars': 10 } }).error).toBe('Unknown trip: home|mars');
    expect(validateTravel({ places: [], minutes: { 'home|home': 10 } }).error).toBe('Unknown trip: home|home');
    expect(validateTravel({ places: [], minutes: { 'home|work': 0 } }).error).toMatch(/1 to 240/);
    expect(validateTravel({ places: [], minutes: { 'home|work': 300 } }).error).toMatch(/1 to 240/);
    expect(validateTravel({ places: ['a|b'], minutes: {} }).error).toMatch(/without \|/);
  });

  it('pairKey is the same both ways', () => {
    expect(pairKey('work', 'campus')).toBe(pairKey('campus', 'work'));
  });
});
