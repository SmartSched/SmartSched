import { describe, expect, it } from 'vitest';
import { celestial, skyColors } from './sky';

describe('skyColors', () => {
  it('uses the stop colours exactly at a stop', () => {
    expect(skyColors(12 * 60, 'light')).toEqual({ top: '#e3f0fc', bottom: '#f7fbff' });
  });

  it('blends between stops', () => {
    const { top } = skyColors(10 * 60 + 15, 'light'); // halfway from morning to midday
    expect(top).not.toBe('#fff3d9');
    expect(top).not.toBe('#e3f0fc');
  });

  it('wraps around midnight', () => {
    expect(skyColors(24 * 60, 'dark')).toEqual(skyColors(0, 'dark'));
    expect(skyColors(-60, 'light')).toEqual(skyColors(23 * 60, 'light'));
  });
});

describe('celestial', () => {
  it('puts the sun at the top of its arc at 1 PM', () => {
    const c = celestial(13 * 60);
    expect(c.body).toBe('sun');
    expect(c.x).toBeCloseTo(0.5);
    expect(c.y).toBeCloseTo(1);
  });

  it('shows the moon at night, rising after sunset', () => {
    expect(celestial(20 * 60).body).toBe('moon');
    expect(celestial(20 * 60).x).toBe(0);
    expect(celestial(3 * 60).body).toBe('moon');
  });
});
