import { useSyncExternalStore } from 'react';

// The API server and the scheduler behind it sleep when idle on their free hosts and take up to a minute or so
// to start. startWaking() runs once when the app opens: it calls /api/wake (no login needed) until the server
// answers and says the scheduler is up too. Pages read the state to show a loading bar instead of a slow request.

const API_URL = import.meta.env.VITE_API_URL;
const REQUEST_TIMEOUT_MS = 40_000;
const RETRY_DELAY_MS = 2_000;
// After this long, stop waiting and let requests go through; they show their own error if it's still down.
const GIVE_UP_AFTER_MS = 3 * 60_000;

export type WakeState = 'waking' | 'awake' | 'gave-up';

let state: WakeState = 'waking';
let startedAt = Date.now();
let started = false;
const listeners = new Set<() => void>();

function setState(next: WakeState) {
  state = next;
  listeners.forEach((listener) => listener());
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function schedulerIsUp() {
  try {
    const res = await fetch(`${API_URL}/api/wake`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) return false; // the host's 502/503 while the server starts
    const body = await res.json();
    return body?.scheduler === 'ok';
  } catch {
    return false; // no answer yet
  }
}

// Runs once on app open. After it gave up, calling it again starts a fresh round (the next "Suggest a plan").
export function startWaking() {
  if (started && state !== 'gave-up') return;
  started = true;
  startedAt = Date.now();
  if (state !== 'waking') setState('waking');
  (async () => {
    while (Date.now() - startedAt < GIVE_UP_AFTER_MS) {
      if (await schedulerIsUp()) return setState('awake');
      await wait(RETRY_DELAY_MS);
    }
    setState('gave-up');
  })();
}

/** Resolves with 'awake' once the server and scheduler are up, or 'gave-up' once we've stopped waiting. */
export function untilAwake(): Promise<Exclude<WakeState, 'waking'>> {
  if (state !== 'waking') return Promise.resolve(state);
  return new Promise((resolve) => {
    const listener = () => {
      if (state === 'waking') return;
      listeners.delete(listener);
      resolve(state);
    };
    listeners.add(listener);
  });
}

/** When the app started waking the services, for estimating progress. */
export const wakeStartedAt = () => startedAt;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWakeState(): WakeState {
  return useSyncExternalStore(subscribe, () => state);
}
