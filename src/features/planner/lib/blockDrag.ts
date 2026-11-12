// Dragging a block to a new time (and, in week view, a new day). The block follows the pointer in 15-minute
// steps; on release it's saved there. Mouse and pen only: on touch screens a drag would fight scrolling.
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { toMinutes, type TimeBlock } from '../../../app/lib/planner';
import type { GridScale } from './gridScale';

export const SNAP_MINUTES = 15;
const DAY = 24 * 60;
const THRESHOLD_PX = 5; // less movement than this is a click, not a drag

export interface DragPreview {
  id: string;
  date: string;
  start: number; // minutes after midnight
  end: number;
}

// Where a block of `duration` starts when the pointer is at `pointerMinutes` and was grabbed `grabOffset`
// minutes below the block's start: rounded to the nearest 15 minutes and kept inside the day.
export function snapStart(pointerMinutes: number, grabOffset: number, duration: number) {
  const snapped = Math.round((pointerMinutes - grabOffset) / SNAP_MINUTES) * SNAP_MINUTES;
  return Math.max(0, Math.min(snapped, DAY - 1 - duration));
}

export function hhmm(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

// Blocks that come from a linked calendar or were added automatically (commutes) aren't moved by hand.
export function canDrag(block: TimeBlock) {
  return !block.feed_id && !block.auto;
}

// Swallows the click that follows a drag, wherever it lands, so dropping a block doesn't open it or start a new one.
function swallowNextClick() {
  const stop = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener('click', stop, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
}

// Day columns mark themselves with data-day-column="yyyy-MM-dd".
function columnAt(x: number, fallback: HTMLElement) {
  const columns = Array.from(document.querySelectorAll<HTMLElement>('[data-day-column]'));
  return (
    columns.find((c) => {
      const r = c.getBoundingClientRect();
      return x >= r.left && x < r.right;
    }) ?? fallback
  );
}

export function useBlockDrag(scale: GridScale, onDrop: (block: TimeBlock, to: DragPreview) => void) {
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const [landedId, setLandedId] = useState<string | null>(null);
  const landTimer = useRef<number>();

  const startDrag = (block: TimeBlock, e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || e.pointerType === 'touch' || !canDrag(block)) return;
    if ((e.target as HTMLElement).closest('.MuiCheckbox-root')) return;
    const home = e.currentTarget.closest<HTMLElement>('[data-day-column]');
    if (!home) return;

    const start = toMinutes(block.start_time);
    const duration = toMinutes(block.end_time) - start;
    const grab = scale.fromY(e.clientY - home.getBoundingClientRect().top) - start;
    const origin = { x: e.clientX, y: e.clientY };
    let latest: DragPreview | null = null;
    let lastColumn = home;

    const move = (ev: PointerEvent) => {
      if (!latest && Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) < THRESHOLD_PX) return;
      if (!latest) {
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
      }
      lastColumn = columnAt(ev.clientX, lastColumn);
      const date = lastColumn.dataset.dayColumn ?? block.date;
      const at = snapStart(scale.fromY(ev.clientY - lastColumn.getBoundingClientRect().top), grab, duration);
      if (!latest || latest.date !== date || latest.start !== at) {
        latest = { id: block.id, date, start: at, end: at + duration };
        setPreview(latest);
      }
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!latest) return; // just a click
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      swallowNextClick();
      setPreview(null);
      if (latest.date !== block.date || latest.start !== start) onDrop(block, latest);
      window.clearTimeout(landTimer.current);
      setLandedId(block.id);
      landTimer.current = window.setTimeout(() => setLandedId(null), 500);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  return { preview, landedId, startDrag };
}
