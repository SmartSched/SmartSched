import { getJuicePrefs } from './prefs';

// Tiny synthesised sounds (no audio files to load). All quiet, all skipped when sounds are off in settings.
let ctx: AudioContext | null = null;

function audio() {
  if (!getJuicePrefs().sound) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// One soft blip that slides from `from` Hz to `to` Hz.
function blip(from: number, to: number, duration: number, volume: number, delay = 0, type: OscillatorType = 'sine') {
  const ac = audio();
  if (!ac) return;
  const start = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(to, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

// Checking a task off.
export function playTick() {
  blip(1900, 1300, 0.07, 0.05);
}

// Clearing a whole group: two soft notes going up.
export function playChime() {
  blip(1319, 1319, 0.22, 0.04, 0, 'triangle');
  blip(1976, 1976, 0.3, 0.035, 0.09, 'triangle');
}

// Bopping the blob: a rubbery boing, a little different each time.
export function playBoop() {
  const base = 320 + Math.random() * 120;
  blip(base, base * 1.9, 0.12, 0.06, 0, 'sine');
}

// Dropping a planner block into place.
export function playThunk() {
  blip(220, 140, 0.09, 0.05, 0, 'sine');
}
