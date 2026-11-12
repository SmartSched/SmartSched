// The Today header's sky: two colours for each point in the day, blended smoothly between them by the minute.
// Pale in light mode so the greeting keeps its contrast; deep in dark mode. No React, so it can be tested.
import type { ColorMode } from '../../app/theme';

type Stop = { at: number; top: string; bottom: string }; // at: minutes after midnight

const STOPS: Record<ColorMode, Stop[]> = {
  light: [
    { at: 0, top: '#e6e4f6', bottom: '#f3f0fb' }, // night
    { at: 5 * 60, top: '#e9e3f5', bottom: '#f6eef6' }, // before dawn
    { at: 6 * 60 + 30, top: '#fde1e3', bottom: '#fff1e4' }, // dawn
    { at: 8 * 60 + 30, top: '#fff3d9', bottom: '#fefbf2' }, // morning
    { at: 12 * 60, top: '#e3f0fc', bottom: '#f7fbff' }, // midday
    { at: 15 * 60 + 30, top: '#eaf3fb', bottom: '#fdf7ea' }, // afternoon
    { at: 18 * 60, top: '#ffe5c7', bottom: '#fde3ea' }, // golden hour
    { at: 19 * 60 + 45, top: '#e7dcf8', bottom: '#fae2ea' }, // dusk
    { at: 21 * 60 + 30, top: '#e3e1f5', bottom: '#f1eefa' }, // night
    { at: 24 * 60, top: '#e6e4f6', bottom: '#f3f0fb' },
  ],
  dark: [
    { at: 0, top: '#0e1126', bottom: '#17151c' },
    { at: 5 * 60, top: '#1a1630', bottom: '#1a1720' },
    { at: 6 * 60 + 30, top: '#3a1f2c', bottom: '#241a1e' },
    { at: 8 * 60 + 30, top: '#33291a', bottom: '#1f1c18' },
    { at: 12 * 60, top: '#132640', bottom: '#181c25' },
    { at: 15 * 60 + 30, top: '#172536', bottom: '#201d1a' },
    { at: 18 * 60, top: '#40260f', bottom: '#2c1726' },
    { at: 19 * 60 + 45, top: '#28183f', bottom: '#2a1528' },
    { at: 21 * 60 + 30, top: '#11142b', bottom: '#17151c' },
    { at: 24 * 60, top: '#0e1126', bottom: '#17151c' },
  ],
};

function lerpHex(a: string, b: string, t: number) {
  const ch = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [ca, cb] = [ch(a), ch(b)];
  return `#${ca.map((v, i) => Math.round(v + (cb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

export function skyColors(minutes: number, mode: ColorMode) {
  const m = ((minutes % 1440) + 1440) % 1440;
  const stops = STOPS[mode];
  const i = stops.findIndex((s) => s.at > m) - 1;
  const [from, to] = [stops[i], stops[i + 1]];
  const t = (m - from.at) / (to.at - from.at);
  return { top: lerpHex(from.top, to.top, t), bottom: lerpHex(from.bottom, to.bottom, t) };
}

export interface SunTimes {
  rise: number; // local minutes after midnight
  set: number;
}

// The fallback when sunrise and sunset can't be worked out.
export const DEFAULT_SUN: SunTimes = { rise: 6 * 60, set: 20 * 60 };

// Sunrise and sunset for a day ('yyyy-MM-dd') at a latitude and longitude (degrees, east positive), in local
// minutes after midnight for a UTC offset in minutes (EST is -300). NOAA's simple solar formula: within a few
// minutes. Where the sun doesn't rise or set that day (polar), the fallback times are used.
export function sunTimes(date: string, lat: number, lon: number, utcOffset: number): SunTimes {
  const [y, mo, d] = date.split('-').map(Number);
  const dayOfYear = Math.round((Date.UTC(y, mo - 1, d) - Date.UTC(y, 0, 0)) / 86_400_000);
  const g = ((2 * Math.PI) / 365) * (dayOfYear - 1);
  const eqTime =
    229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const rad = Math.PI / 180;
  const cosHa = Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl);
  if (cosHa < -1 || cosHa > 1) return DEFAULT_SUN;
  const ha = Math.acos(cosHa) / rad;
  return {
    rise: Math.round(720 - 4 * (lon + ha) - eqTime + utcOffset),
    set: Math.round(720 - 4 * (lon - ha) - eqTime + utcOffset),
  };
}

// The sky colours are drawn for a day with sunrise at 6:30 and sunset at 7:30 PM. This stretches the real day onto
// that one, so dawn colours come at the real sunrise and dusk at the real sunset.
export function skyTime(minutes: number, sun: SunTimes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  const [rise, set] = [6 * 60 + 30, 19 * 60 + 30];
  if (m < sun.rise) return (m / sun.rise) * rise;
  if (m < sun.set) return rise + ((m - sun.rise) / (sun.set - sun.rise)) * (set - rise);
  return set + ((m - sun.set) / (1440 - sun.set)) * (1440 - set);
}

// Where the sun (sunrise to sunset) or moon (the rest) sits on its arc, as 0..1 across and 0..1 up.
export function celestial(minutes: number, sun: SunTimes = DEFAULT_SUN) {
  const m = ((minutes % 1440) + 1440) % 1440;
  const isSun = m >= sun.rise && m < sun.set;
  const day = sun.set - sun.rise;
  const progress = isSun ? (m - sun.rise) / day : ((m - sun.set + 1440) % 1440) / (1440 - day);
  return { body: isSun ? ('sun' as const) : ('moon' as const), x: progress, y: Math.sin(progress * Math.PI) };
}
