import { describe, expect, it } from 'vitest';
import { gridSegments, makeScale } from './gridScale';

const h = (hours: number) => hours * 60;

describe('gridSegments', () => {
  it('normal view runs from the earliest start to the latest end', () => {
    expect(gridSegments({ compact: false, defaultStart: 7, defaultEnd: 22, starts: [h(4)], ends: [h(23)] })).toEqual([{ from: 4, to: 23 }]);
  });

  it('compact view never starts before 6 AM, however early something is', () => {
    expect(gridSegments({ compact: true, defaultStart: 7, defaultEnd: 22, starts: [h(3), h(6.5)], ends: [h(8)] })).toEqual([{ from: 6, to: 22 }]);
  });

  it('compact view adds 12–2 AM only when something starts then', () => {
    expect(gridSegments({ compact: true, defaultStart: 7, defaultEnd: 22, starts: [h(1)], ends: [h(2)] })).toEqual([
      { from: 0, to: 2 },
      { from: 7, to: 22 },
    ]);
  });
});

describe('makeScale', () => {
  // 12–2 AM, a 10 px gap, then 6 AM–10 PM, at 30 px an hour.
  const scale = makeScale([{ from: 0, to: 2 }, { from: 6, to: 22 }], 30, 10);

  it('places times in each stretch, with the gap between them', () => {
    expect(scale.toY(h(1))).toBe(30);
    expect(scale.toY(h(6))).toBe(70); // 60 for 12–2 AM, then the 10 px gap
    expect(scale.toY(h(7))).toBe(100);
    expect(scale.height).toBe(60 + 10 + 16 * 30);
  });

  it('puts a hidden time at the edge it borders', () => {
    expect(scale.toY(h(4), 'start')).toBe(70); // a block starting at 4 AM shows from 6 AM
    expect(scale.toY(h(4), 'end')).toBe(60); // one ending at 4 AM stops at 2 AM
  });

  it('turns a click back into a time, and a click in the gap into 6 AM', () => {
    expect(scale.fromY(100)).toBe(h(7));
    expect(scale.fromY(65)).toBe(h(6));
  });

  it('knows a block entirely in 2–6 AM is not on the grid', () => {
    expect(scale.shows(h(3), h(5))).toBe(false);
    expect(scale.shows(h(1), h(7))).toBe(true);
  });
});
