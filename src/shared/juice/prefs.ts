import { useSyncExternalStore } from 'react';

// Per-device toggles for the little extras: the tick sound and the blob in the corner. Kept in this browser
// only (they're about this screen and these speakers, not the account). Storage can be unavailable, so every
// access is guarded and the defaults apply.
export interface JuicePrefs {
  sound: boolean;
  blob: boolean;
}

const KEY = 'smartsched.juice';
const DEFAULTS: JuicePrefs = { sound: true, blob: true };
const listeners = new Set<() => void>();

function read(): JuicePrefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
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
