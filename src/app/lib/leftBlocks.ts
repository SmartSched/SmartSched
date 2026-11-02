const LEFT_KEY = 'smartsched.leftMissedBlocks';

// Missed blocks the user chose to leave where they are, remembered in this browser and shared by Today
// and the planner. Storage can be unavailable (private windows, blocked site data), so every access is guarded.
export function readLeftBlocks(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(LEFT_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

export function saveLeftBlocks(ids: Set<string>) {
  try {
    localStorage.setItem(LEFT_KEY, JSON.stringify([...ids]));
  } catch {
    // Not remembered past this visit; the prompt just comes back next time.
  }
}
