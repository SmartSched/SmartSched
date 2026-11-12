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

// Where the sun (6 AM to 8 PM) or moon (the rest) sits on its arc, as 0..1 across and 0..1 up.
export function celestial(minutes: number) {
  const m = ((minutes % 1440) + 1440) % 1440;
  const sunrise = 6 * 60;
  const sunset = 20 * 60;
  const isSun = m >= sunrise && m < sunset;
  const progress = isSun ? (m - sunrise) / (sunset - sunrise) : ((m - sunset + 1440) % 1440) / (1440 - (sunset - sunrise));
  return { body: isSun ? ('sun' as const) : ('moon' as const), x: progress, y: Math.sin(progress * Math.PI) };
}
