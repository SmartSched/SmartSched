// Turns a repeat rule into the dates it happens on. Dates are YYYY-MM-DD and worked out as whole days in
// UTC, so time zones and daylight saving can't shift them.

const DAY_MS = 86_400_000;

function dayNumber(date) {
  return Date.parse(`${date}T00:00:00Z`) / DAY_MS;
}

function dateOf(day) {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

// Day 0 (1970-01-01) was a Thursday, so +4 makes weekday 0 Sunday and weeks start on Sunday,
// the same as the planner's week view.
const weekday = (day) => (day + 4) % 7;
const week = (day) => Math.floor((day + 4) / 7);

// Every date from start_date to end_date on one of days_of_week, in every week (interval_weeks 1) or every
// other week counting from the week start_date is in (interval_weeks 2).
export function expandSeries({ days_of_week, interval_weeks = 1, start_date, end_date }) {
  const first = dayNumber(start_date);
  const last = dayNumber(end_date);
  const dates = [];
  for (let day = first; day <= last; day++) {
    if (days_of_week.includes(weekday(day)) && (week(day) - week(first)) % interval_weeks === 0) {
      dates.push(dateOf(day));
    }
  }
  return dates;
}
