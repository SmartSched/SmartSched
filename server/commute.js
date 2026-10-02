// Works out the commute blocks a day needs. A day starts and ends at home, so with travel times set:
// - a commute from home right before the day's first block somewhere else,
// - a commute between two blocks in a row that are in different places, right before the second one,
// - a commute back home right after the day's last block somewhere else.
// When a trip between two blocks doesn't fit (the gap is too short, they overlap, or something else is in
// the way), nothing is added and it's reported as tight instead. Trips from and to home that don't fit are
// just skipped: there's no "next block" to warn about.
import { pairKey } from './validation.js';

const HOME = 'home';
const DAY_END = 24 * 60;

function minutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function time(total) {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}:00`;
}

function title(place) {
  return place.charAt(0).toUpperCase() + place.slice(1);
}

// dayBlocks: every block on one date. Automatic commutes already there are ignored: they're rebuilt from
// scratch each time. travelMinutes: { "campus|work": 20, ... }.
// Returns { add: [block rows without user_id], tight: [{ date, from, to, gap, needed, after, before }] }.
export function planCommutes(dayBlocks, travelMinutes) {
  const blocks = dayBlocks.filter((b) => !b.auto);
  const located = blocks.filter((b) => b.location).sort((a, b) => minutes(a.start_time) - minutes(b.start_time));
  const add = [];
  const tight = [];
  if (located.length === 0) return { add, tight };
  const date = located[0].date;

  // A commute from `from` to `to` in [start, end), as long as it stays inside [gapStart, gapEnd) and doesn't
  // run into another block. Returns false when it doesn't fit.
  const trip = (from, to, start, end, gapStart, gapEnd, ends) => {
    // A commute the user put there themselves already covers this trip.
    if (blocks.some((b) => b.type === 'commute' && minutes(b.start_time) < gapEnd && gapStart < minutes(b.end_time))) {
      return true;
    }
    const inTheWay = blocks.some(
      (b) => !ends.includes(b) && minutes(b.start_time) < end && start < minutes(b.end_time),
    );
    if (start < gapStart || end > gapEnd || inTheWay) return false;
    add.push({
      date,
      start_time: time(start),
      end_time: time(end),
      activity: `Commute: ${title(from)} → ${title(to)}`,
      type: 'commute',
      location: null,
      task_id: null,
      series_id: null,
      auto: true,
    });
    return true;
  };

  const first = located[0];
  const fromHome = first.location !== HOME && travelMinutes[pairKey(HOME, first.location)];
  if (fromHome) {
    const arrive = minutes(first.start_time);
    trip(HOME, first.location, arrive - fromHome, arrive, 0, arrive, [first]);
  }

  for (let i = 0; i + 1 < located.length; i++) {
    const from = located[i];
    const to = located[i + 1];
    const needed = travelMinutes[pairKey(from.location, to.location)];
    if (from.location === to.location || !needed) continue;
    const gapStart = minutes(from.end_time);
    const gapEnd = minutes(to.start_time);
    if (!trip(from.location, to.location, gapEnd - needed, gapEnd, gapStart, gapEnd, [from, to])) {
      // gap is 0 or less when the blocks touch or overlap.
      tight.push({
        date,
        from: from.location,
        to: to.location,
        gap: gapEnd - gapStart,
        needed,
        after: from.activity,
        before: to.activity,
      });
    }
  }

  // Whichever block ends last (with overlapping blocks that isn't always the one that starts last).
  const last = located.reduce((latest, b) => (minutes(b.end_time) > minutes(latest.end_time) ? b : latest));
  const toHome = last.location !== HOME && travelMinutes[pairKey(last.location, HOME)];
  if (toHome) {
    const leave = minutes(last.end_time);
    trip(last.location, HOME, leave, leave + toHome, leave, DAY_END, [last]);
  }

  return { add, tight };
}
