import { useSyncExternalStore } from 'react';

// Per-device toggles for the little extras: the tick sound and the blob in the corner. Kept in this browser
// only (they're about this screen and these speakers, not the account). Storage can be unavailable, so every
// access is guarded and the defaults apply.

// Which buddy sits in the corner. The blob takes the accent colour; the others keep their own colours.
export const BUDDIES = ['blob', 'cloud', 'sunflower', 'sun', 'moon'] as const;
export type Buddy = (typeof BUDDIES)[number];
export const BUDDY_LABELS: Record<Buddy, string> = {
  blob: 'Blob',
  cloud: 'Cloud',
  sunflower: 'Sunflower',
  sun: 'Sun',
  moon: 'Moon',
};

export interface JuicePrefs {
  sound: boolean;
  blob: boolean; // whether the corner buddy shows at all
  buddy: Buddy;
}

const KEY = 'smartsched.juice';
const DEFAULTS: JuicePrefs = { sound: true, blob: true, buddy: 'blob' };
const listeners = new Set<() => void>();

function read(): JuicePrefs {
  try {
    const stored = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    return BUDDIES.includes(stored.buddy) ? stored : { ...stored, buddy: 'blob' };
  } catch {
    return DEFAULTS;
  }
}

let current = read();

export function getJuicePrefs() {
  return current;
}

export function setJuicePref<K extends keyof JuicePrefs>(key: K, value: JuicePrefs[K]) {
  current = { ...current, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Applies for this visit only.
  }
  listeners.forEach((listener) => listener());
}

export function useJuicePrefs() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getJuicePrefs,
  );
}
