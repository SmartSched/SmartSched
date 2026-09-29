import { describe, expect, it } from 'vitest';
import { QUOTES, quoteFor } from './quotes';

describe('quoteFor', () => {
  it('gives the same line all day', () => {
    expect(quoteFor('2026-09-29')).toBe(quoteFor('2026-09-29'));
  });

  it('gives a different line the next day, across month and year ends too', () => {
    expect(quoteFor('2026-09-30')).not.toBe(quoteFor('2026-09-29'));
    expect(quoteFor('2026-10-01')).not.toBe(quoteFor('2026-09-30'));
    expect(quoteFor('2027-01-01')).not.toBe(quoteFor('2026-12-31'));
  });

  it('shows every line once before any repeats', () => {
    const start = Date.UTC(2026, 8, 29);
    const days = Array.from({ length: QUOTES.length }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));
    const shown = days.map(quoteFor);
    expect(new Set(shown).size).toBe(QUOTES.length);
    const nextCycle = new Date(start + QUOTES.length * 86_400_000).toISOString().slice(0, 10);
    expect(quoteFor(nextCycle)).toBe(shown[0]);
  });
});
