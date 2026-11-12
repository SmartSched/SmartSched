import { describe, expect, it } from 'vitest';
import { celestial, skyColors, skyTime, sunTimes } from './sky';

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

describe('sunTimes', () => {
  it('matches New York in mid-November (sunrise about 6:40, sunset about 4:40)', () => {
    const { rise, set } = sunTimes('2026-11-11', 40.7, -74, -300);
    expect(Math.abs(rise - (6 * 60 + 40))).toBeLessThan(10);
    expect(Math.abs(set - (16 * 60 + 40))).toBeLessThan(10);
  });

  it('gives longer days in June', () => {
    const june = sunTimes('2026-06-21', 40.7, -74, -240);
    expect(june.set - june.rise).toBeGreaterThan(14 * 60);
  });

  it('falls back where the sun never sets', () => {
    expect(sunTimes('2026-06-21', 80, 0, 0)).toEqual({ rise: 360, set: 1200 });
  });
});

describe('skyTime', () => {
  const sun = { rise: 400, set: 1000 };
  it('puts the real sunrise and sunset at the sky colours\' dawn and dusk', () => {
    expect(skyTime(400, sun)).toBe(6 * 60 + 30);
    expect(skyTime(1000, sun)).toBe(19 * 60 + 30);
    expect(skyTime(0, sun)).toBe(0);
  });

  it('shows the moon after a 4:40 PM sunset', () => {
    expect(celestial(19 * 60, sun).body).toBe('moon');
    expect(celestial(12 * 60, sun).body).toBe('sun');
  });
});
