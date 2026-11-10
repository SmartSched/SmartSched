// Where times go on the planner grid. The grid is one or more stretches of hours stacked top to bottom, with a
// small gap where hours are left out (compact view never shows 2–6 AM). No React, so it can be tested.

export const HIDDEN_FROM_HOUR = 2; // compact view hides 2 AM...
export const HIDDEN_TO_HOUR = 6; // ...to 6 AM, whatever is planned there
export const GAP_PX = 16;

export interface Segment {
  from: number; // hour the stretch starts
  to: number; // hour it ends
}

export interface GridScale {
  segments: Segment[];
  hourHeight: number;
  gap: number;
  height: number;
  // Minutes after midnight to px from the top. A time in a hidden stretch goes to the edge of the stretch it
  // borders: the start of the next one for a block's start, the end of the one before for its end.
  toY: (minutes: number, edge?: 'start' | 'end') => number;
  // px from the top to minutes after midnight; a click in a gap counts as the start of the next stretch.
  fromY: (y: number) => number;
  // Whether any of start..end (minutes) is on the grid.
  shows: (start: number, end: number) => boolean;
}

export function makeScale(segments: Segment[], hourHeight: number, gap = GAP_PX): GridScale {
  const segmentHeight = (s: Segment) => (s.to - s.from) * hourHeight;
  const tops = segments.map((_, i) => segments.slice(0, i).reduce((sum, s) => sum + segmentHeight(s) + gap, 0));
  const height = segments.reduce((sum, s) => sum + segmentHeight(s), 0) + gap * Math.max(0, segments.length - 1);

  const toY = (minutes: number, edge: 'start' | 'end' = 'start') => {
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      if (minutes < s.from * 60) {
        if (i === 0) return 0;
        return edge === 'start' ? tops[i] : tops[i - 1] + segmentHeight(segments[i - 1]);
      }
      if (minutes <= s.to * 60) return tops[i] + ((minutes - s.from * 60) / 60) * hourHeight;
    }
    return height;
  };

  const fromY = (y: number) => {
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      if (y < tops[i]) return s.from * 60;
      if (y < tops[i] + segmentHeight(s)) return s.from * 60 + ((y - tops[i]) / hourHeight) * 60;
    }
    const last = segments[segments.length - 1];
    return last ? last.to * 60 : 0;
  };

  const shows = (start: number, end: number) => segments.some((s) => start < s.to * 60 && end > s.from * 60);

  return { segments, hourHeight, gap, height, toY, fromY, shows };
}

// The stretches of hours a day or week shows. Normal view: one stretch, earliest to latest. Compact view never
// shows 2–6 AM: a 12–2 AM stretch only when something starts then, and the day itself from 6 AM at the earliest.
export function gridSegments({
  compact,
  defaultStart,
  defaultEnd,
  starts,
  ends,
}: {
  compact: boolean;
  defaultStart: number;
  defaultEnd: number;
  starts: number[]; // minutes after midnight that blocks (and anything else on the grid) start
  ends: number[];
}): Segment[] {
  const end = Math.min(24, Math.max(defaultEnd, ...ends.map((m) => Math.ceil(m / 60))));
  if (!compact) {
    return [{ from: Math.min(defaultStart, ...starts.map((m) => Math.floor(m / 60))), to: end }];
  }
  const dayStarts = starts.filter((m) => m >= HIDDEN_TO_HOUR * 60).map((m) => Math.floor(m / 60));
  const day = { from: Math.max(HIDDEN_TO_HOUR, Math.min(defaultStart, ...dayStarts)), to: end };
  const lateNight = starts.some((m) => m < HIDDEN_FROM_HOUR * 60);
  return lateNight ? [{ from: 0, to: HIDDEN_FROM_HOUR }, day] : [day];
}
