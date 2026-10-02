import { describe, expect, it } from 'vitest';
import { planCommutes } from '../commute.js';

let n = 0;
function block(start_time, end_time, location, extra = {}) {
  return { id: String(n++), date: '2026-09-29', start_time, end_time, activity: location ?? 'block', type: 'class', location, auto: false, ...extra };
}

function commute(start_time, end_time, from, to) {
  return {
    date: '2026-09-29', start_time, end_time, activity: `Commute: ${from} → ${to}`,
    type: 'commute', location: null, task_id: null, series_id: null, auto: true,
  };
}

// Between places only; the home trips have their own tests below.
const BETWEEN = { 'campus|work': 20 };

describe('planCommutes between blocks', () => {
  it('adds a commute that ends when the next block starts', () => {
    const { add, tight } = planCommutes([block('09:00:00', '12:00:00', 'campus'), block('13:00:00', '17:00:00', 'work')], BETWEEN);
    expect(tight).toEqual([]);
    expect(add).toEqual([commute('12:40:00', '13:00:00', 'Campus', 'Work')]);
  });

  it('handles several trips in a day, in time order whatever order the blocks come in', () => {
    const blocks = [block('18:00:00', '19:00:00', 'gym'), block('09:00:00', '12:00:00', 'work'), block('13:00:00', '17:00:00', 'campus')];
    const add = planCommutes(blocks, { ...BETWEEN, 'campus|gym': 15 }).add;
    expect(add.map((c) => c.activity)).toEqual(['Commute: Work → Campus', 'Commute: Campus → Gym']);
  });

  it('adds nothing between blocks in the same place, or for a trip with no travel time set', () => {
    expect(planCommutes([block('09:00:00', '10:00:00', 'campus'), block('11:00:00', '12:00:00', 'campus')], BETWEEN).add).toEqual([]);
    expect(planCommutes([block('09:00:00', '10:00:00', 'gym'), block('11:00:00', '12:00:00', 'campus')], BETWEEN).add).toEqual([]);
  });

  it('ignores blocks without a location', () => {
    const blocks = [block('09:00:00', '12:00:00', 'campus'), block('12:00:00', '12:30:00', null), block('14:00:00', '15:00:00', 'work')];
    expect(planCommutes(blocks, BETWEEN).add.map((c) => c.start_time)).toEqual(['13:40:00']);
  });

  it('reports a gap shorter than the trip instead of adding a commute', () => {
    const blocks = [block('09:00:00', '12:00:00', 'campus', { activity: 'Class' }), block('12:10:00', '17:00:00', 'work', { activity: 'Shift' })];
    const { add, tight } = planCommutes(blocks, BETWEEN);
    expect(add).toEqual([]);
    expect(tight).toEqual([{ date: '2026-09-29', from: 'campus', to: 'work', gap: 10, needed: 20, after: 'Class', before: 'Shift' }]);
  });

  it('reports overlapping blocks in different places, with a gap of 0 or less', () => {
    const blocks = [block('09:00:00', '11:00:00', 'campus'), block('10:00:00', '11:00:00', 'work')];
    const { add, tight } = planCommutes(blocks, BETWEEN);
    expect(add).toEqual([]);
    expect(tight).toHaveLength(1);
    expect(tight[0].gap).toBeLessThanOrEqual(0);
  });

  it('reports it as tight when something else sits where the commute would go', () => {
    const blocks = [block('09:00:00', '12:00:00', 'campus'), block('12:30:00', '12:55:00', null, { type: 'meal' }), block('13:00:00', '17:00:00', 'work')];
    const { add, tight } = planCommutes(blocks, BETWEEN);
    expect(add).toEqual([]);
    expect(tight).toHaveLength(1);
  });

  it('leaves the trip alone when the user already put a commute there', () => {
    const blocks = [block('09:00:00', '12:00:00', 'campus'), block('12:15:00', '12:45:00', null, { type: 'commute' }), block('13:00:00', '17:00:00', 'work')];
    expect(planCommutes(blocks, BETWEEN)).toEqual({ add: [], tight: [] });
  });

  it('works the day out again from scratch, ignoring commutes it added before', () => {
    const blocks = [
      block('09:00:00', '12:00:00', 'campus'),
      block('12:00:00', '12:20:00', null, { type: 'commute', auto: true }),
      block('13:00:00', '17:00:00', 'work'),
    ];
    expect(planCommutes(blocks, BETWEEN).add.map((c) => c.start_time)).toEqual(['12:40:00']);
  });
});

describe('planCommutes from and to home', () => {
  const HOME_TRIPS = { 'campus|home': 30, 'home|work': 15, 'campus|work': 20 };

  it('goes from home to a single block and back again', () => {
    const { add, tight } = planCommutes([block('10:00:00', '11:15:00', 'campus')], HOME_TRIPS);
    expect(tight).toEqual([]);
    expect(add).toEqual([commute('09:30:00', '10:00:00', 'Home', 'Campus'), commute('11:15:00', '11:45:00', 'Campus', 'Home')]);
  });

  it('only goes home at the start and end of the day, with the trips between blocks in the middle', () => {
    const add = planCommutes([block('09:00:00', '12:00:00', 'campus'), block('13:00:00', '17:00:00', 'work')], HOME_TRIPS).add;
    expect(add.map((c) => [c.activity, c.start_time])).toEqual([
      ['Commute: Home → Campus', '08:30:00'],
      ['Commute: Campus → Work', '12:40:00'],
      ['Commute: Work → Home', '17:00:00'],
    ]);
  });

  it('adds nothing for blocks at home, or when there\'s no travel time from home', () => {
    expect(planCommutes([block('10:00:00', '11:00:00', 'home')], HOME_TRIPS).add).toEqual([]);
    expect(planCommutes([block('10:00:00', '11:00:00', 'gym')], HOME_TRIPS).add).toEqual([]);
  });

  it('leaves home trips out quietly when they don\'t fit', () => {
    // Too early to have come from home, and something already right after the class.
    const blocks = [block('00:10:00', '01:00:00', 'campus'), block('01:00:00', '02:00:00', null)];
    expect(planCommutes(blocks, HOME_TRIPS)).toEqual({ add: [], tight: [] });
  });

  it('heads home after whichever block ends last', () => {
    const blocks = [block('09:00:00', '12:00:00', 'campus'), block('10:00:00', '11:00:00', 'campus')];
    expect(planCommutes(blocks, HOME_TRIPS).add.map((c) => c.start_time)).toEqual(['08:30:00', '12:00:00']);
  });
});
