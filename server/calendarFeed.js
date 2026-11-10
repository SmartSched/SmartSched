import ICAL from 'ical.js';

// Google Calendar and Outlook calendars, linked through their private iCal (.ics) address. The server fetches
// the file and turns its events into time blocks in the user's own time zone (see the calendar_feeds migration).
//
// Only Google's and Microsoft's calendar hosts are fetched: the server mustn't be pointed at any address a
// user types (its own network, other services).
const PROVIDER_HOSTS = {
  'calendar.google.com': 'google',
  'outlook.office365.com': 'outlook',
  'outlook.office.com': 'outlook',
  'outlook.live.com': 'outlook',
};

const FETCH_TIMEOUT_MS = 15_000;
const MAX_FEED_BYTES = 5_000_000;
const MAX_REDIRECTS = 3;
const MAX_BLOCKS = 3000;
const MAX_EVENT_DAYS = 14; // a timed event longer than this is cut off (a "busy all fortnight" placeholder)
const MAX_OCCURRENCES = 20_000; // per repeating event, counted from its first one

export const FEED_ERRORS = {
  link: "That doesn't look like a calendar link. Paste the secret iCal address from Google Calendar, or the ICS link from Outlook's Publish calendar.",
  fetch: "Couldn't load that calendar. Check the link is still valid (resetting it in Google or Outlook makes a new one).",
  parse: "That link didn't return a calendar. Check it's the iCal / ICS link, not the HTML one.",
  large: 'That calendar is too large to import.',
};

// Returns { url, provider } for a Google or Outlook .ics link, or { error }.
export function checkFeedUrl(input) {
  if (typeof input !== 'string') return { error: FEED_ERRORS.link };
  let text = input.trim();
  if (text.toLowerCase().startsWith('webcal://')) text = `https://${text.slice('webcal://'.length)}`;
  if (text.length > 2000) return { error: FEED_ERRORS.link };
  let url;
  try {
    url = new URL(text);
  } catch {
    return { error: FEED_ERRORS.link };
  }
  const provider = PROVIDER_HOSTS[url.hostname.toLowerCase()];
  if (url.protocol !== 'https:' || !provider || url.username || url.password || url.port) return { error: FEED_ERRORS.link };
  if (!url.pathname.toLowerCase().endsWith('.ics')) return { error: FEED_ERRORS.link };
  return { url: url.toString(), provider };
}

// What the browser is shown instead of the secret link: the host and the file name.
export function maskFeedUrl(link) {
  const url = new URL(link);
  return `${url.hostname}/…/${url.pathname.split('/').pop()}`;
}

export function isTimeZone(value) {
  if (typeof value !== 'string' || !value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// Fetches the .ics text, following redirects only to the same calendar hosts. Throws an Error whose message
// is one of FEED_ERRORS.
export async function fetchFeed(link) {
  let current = link;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res;
    try {
      res = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch {
      throw new Error(FEED_ERRORS.fetch);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = checkFeedHost(new URL(res.headers.get('location'), current));
      if (!next) throw new Error(FEED_ERRORS.fetch);
      current = next;
      continue;
    }
    if (!res.ok) throw new Error(FEED_ERRORS.fetch);
    if (Number(res.headers.get('content-length')) > MAX_FEED_BYTES) throw new Error(FEED_ERRORS.large);
    const text = await res.text();
    if (text.length > MAX_FEED_BYTES) throw new Error(FEED_ERRORS.large);
    return text;
  }
  throw new Error(FEED_ERRORS.fetch);
}

function checkFeedHost(url) {
  return url.protocol === 'https:' && PROVIDER_HOSTS[url.hostname.toLowerCase()] ? url.toString() : null;
}

// ---- Turning events into blocks ----

const pad = (n) => String(n).padStart(2, '0');

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Today's date where the user is.
export function localToday(timeZone, nowMs = Date.now()) {
  return localParts(new Date(nowMs), timeZone).date;
}

const formatters = new Map();
function localParts(jsDate, timeZone) {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, fmt);
  }
  const p = Object.fromEntries(fmt.formatToParts(jsDate).map((part) => [part.type, part.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

// An ICAL.Time as the user's local date and minutes after midnight. A "floating" time (no zone, or a zone the
// file didn't describe) is already wall-clock time, so it's taken as it is.
function toLocal(time, timeZone) {
  if (time.zone === ICAL.Timezone.localTimezone || !time.zone) {
    return { date: `${time.year}-${pad(time.month)}-${pad(time.day)}`, minutes: time.hour * 60 + time.minute };
  }
  return localParts(time.toJSDate(), timeZone);
}

const clock = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00`;

// One event as blocks, split at midnight when it runs into the next day.
function eventBlocks(activity, start, end) {
  const blocks = [];
  let date = start.date;
  for (let day = 0; day <= MAX_EVENT_DAYS && date <= end.date; day++, date = addDays(date, 1)) {
    const from = date === start.date ? start.minutes : 0;
    const to = date === end.date ? end.minutes : 24 * 60 - 1; // ends 23:59, the last time a block can
    if (to > from) blocks.push({ activity, date, start_time: clock(from), end_time: clock(to), type: 'personal' });
  }
  return blocks;
}

// Events that don't take up the user's time: cancelled ones, ones marked "free", and all-day ones (birthdays,
// holidays, "on leave"), which would otherwise fill the whole day.
function skipped(component, startDate) {
  if (startDate.isDate) return true;
  if (String(component.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED') return true;
  return String(component.getFirstPropertyValue('transp') ?? '').toUpperCase() === 'TRANSPARENT';
}

function title(component) {
  const summary = String(component.getFirstPropertyValue('summary') ?? '').trim();
  return (summary || 'Busy').slice(0, 200);
}

// The .ics text's events as time blocks (type 'personal') dated from..to (YYYY-MM-DD, both included) in the
// user's time zone. Repeating events are expanded, with their moved and cancelled occurrences. Throws on text
// that isn't a calendar.
export function feedBlocks(icsText, { from, to, timeZone }) {
  let calendar;
  try {
    calendar = new ICAL.Component(ICAL.parse(icsText));
  } catch {
    throw new Error(FEED_ERRORS.parse);
  }
  if (calendar.name !== 'vcalendar') throw new Error(FEED_ERRORS.parse);
  for (const zone of calendar.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(zone);

  // A repeating event comes as its rule plus one VEVENT per changed occurrence (same UID, with RECURRENCE-ID).
  const masters = new Map();
  const exceptions = [];
  for (const component of calendar.getAllSubcomponents('vevent')) {
    const uid = component.getFirstPropertyValue('uid') ?? Symbol('no uid');
    if (component.hasProperty('recurrence-id')) exceptions.push([uid, component]);
    else masters.set(uid, new ICAL.Event(component));
  }
  const standalone = [];
  for (const [uid, component] of exceptions) {
    const master = masters.get(uid);
    if (master) master.relateException(component);
    else standalone.push(new ICAL.Event(component)); // the rule isn't in the file; keep the occurrence
  }

  // Stop expanding a day after the window, whatever the event's time zone.
  const stopMs = Date.parse(`${addDays(to, 2)}T00:00:00Z`);
  const startMs = Date.parse(`${addDays(from, -2)}T00:00:00Z`);
  const blocks = [];
  const add = (component, startDate, endDate) => {
    if (!startDate || !endDate || skipped(component, startDate)) return;
    const endMs = endDate.toJSDate().getTime();
    if (endMs < startMs || startDate.toJSDate().getTime() > stopMs) return;
    const start = toLocal(startDate, timeZone);
    const end = toLocal(endDate, timeZone);
    for (const block of eventBlocks(title(component), start, end)) {
      if (block.date >= from && block.date <= to) blocks.push(block);
    }
  };

  for (const event of [...masters.values(), ...standalone]) {
    if (!event.isRecurring()) {
      add(event.component, event.startDate, event.endDate);
      continue;
    }
    const iterator = event.iterator();
    for (let i = 0, next; i < MAX_OCCURRENCES && (next = iterator.next()); i++) {
      if (next.toJSDate().getTime() > stopMs) break;
      const details = event.getOccurrenceDetails(next);
      add(details.item.component, details.startDate, details.endDate);
    }
    if (blocks.length > MAX_BLOCKS) throw new Error(FEED_ERRORS.large);
  }
  if (blocks.length > MAX_BLOCKS) throw new Error(FEED_ERRORS.large);
  return blocks.sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
}

export { addDays };
