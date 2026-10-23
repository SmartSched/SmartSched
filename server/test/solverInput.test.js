import { describe, expect, it } from 'vitest';
import { buildSolverInput, preferencesOutOfDate, savedPreferences } from '../solverInput.js';

describe('buildSolverInput', () => {
  it('leaves study hours and session length to the scheduler', () => {
    const input = buildSolverInput({ now: '2026-10-22T20:30', weekStart: '2026-10-19', tasks: [], blocks: [], reflections: [] });
    expect(input.week).toEqual({ start: '2026-10-19', end: '2026-10-25' });
    expect(input).not.toHaveProperty('available');
    expect(input).not.toHaveProperty('prefs');
  });

  it('plans from 30 minutes after now, so the first session is still ahead when a plan is chosen', () => {
    const tasks = [
      { id: 'soon', title: 'Due soon', due_date: '2026-10-23T06:50:00+00:00', estimated_time: 30, completed: false },
      { id: 'later', title: 'Due later', due_date: '2026-10-25', estimated_time: 30, completed: false },
    ];
    const input = buildSolverInput({ now: '2026-10-22T23:45', weekStart: '2026-10-19', tzOffset: 420, tasks, blocks: [], reflections: [] });
    expect(input.now).toBe('2026-10-23T00:15');
    // "Due soon" is due at 23:50 local, before plans can start.
    expect(input.tasks.map((t) => t.id)).toEqual(['later']);
  });
});

describe('buildSolverInput fixed blocks', () => {
  const tasks = [{ id: 'open', title: 'Essay', due_date: '2026-10-25', estimated_time: 60, completed: false }];
  const block = (id, date, start_time, extra) => ({ id, date, start_time, end_time: '23:00:00', activity: id, ...extra });

  it('keeps classes, done tasks and started task blocks fixed, and leaves the rest to be replaced', () => {
    const blocks = [
      block('class', '2026-10-23', '09:00:00', { type: 'class' }),
      block('started', '2026-10-22', '20:00:00', { type: 'task', task_id: 'open' }),
      block('later', '2026-10-23', '14:00:00', { type: 'task', task_id: 'open' }),
      block('done', '2026-10-24', '10:00:00', { type: 'task', task_id: 'finished' }),
    ];
    const input = buildSolverInput({ now: '2026-10-22T20:30', weekStart: '2026-10-19', tasks, blocks, reflections: [] });
    expect(input.fixed.map((f) => f.label)).toEqual(['class', 'started', 'done']);
  });
});

describe('savedPreferences', () => {
  const prefs = { summary: 'x', preferences: [], adjustments: [] };
  const profile = (extra) => ({ survey_updated_at: '2026-10-20T10:00:00Z', scheduler_preferences: prefs, preferences_updated_at: '2026-10-21T10:00:00Z', ...extra });

  it('uses preferences saved after the survey', () => {
    expect(savedPreferences(profile())).toBe(prefs);
    expect(savedPreferences(profile({ survey_updated_at: null }))).toBe(prefs);
  });

  it('skips preferences older than the survey, so new answers count right away', () => {
    expect(savedPreferences(profile({ survey_updated_at: '2026-10-22T10:00:00Z' }))).toBeNull();
  });

  it('is null with nothing saved, no timestamp, or not an object', () => {
    expect(savedPreferences(profile({ scheduler_preferences: null }))).toBeNull();
    expect(savedPreferences(profile({ preferences_updated_at: null }))).toBeNull();
    expect(savedPreferences(profile({ scheduler_preferences: [] }))).toBeNull();
    expect(savedPreferences(null)).toBeNull();
  });
});

describe('preferencesOutOfDate', () => {
  const NOW = Date.parse('2026-10-22T12:00:00Z');
  const profile = (extra) => ({
    survey: { focus_time: 'morning' }, survey_updated_at: '2026-10-20T10:00:00Z',
    scheduler_preferences: { preferences: [] }, preferences_updated_at: '2026-10-21T10:00:00Z', ...extra,
  });

  it('is false for preferences saved after the survey, under a week ago', () => {
    expect(preferencesOutOfDate(profile(), NOW)).toBe(false);
  });

  it('is true with none saved, older than the survey, or a week old', () => {
    expect(preferencesOutOfDate(profile({ scheduler_preferences: null }), NOW)).toBe(true);
    expect(preferencesOutOfDate(profile({ survey_updated_at: '2026-10-22T10:00:00Z' }), NOW)).toBe(true);
    expect(preferencesOutOfDate(profile({ survey_updated_at: null, preferences_updated_at: '2026-10-14T10:00:00Z' }), NOW)).toBe(true);
  });

  it('is false without a survey, since there is nothing to work from', () => {
    expect(preferencesOutOfDate(profile({ survey: null, scheduler_preferences: null }), NOW)).toBe(false);
  });
});
