import { describe, expect, it } from "vitest";
import {
  checkFeedUrl,
  feedBlocks,
  isTimeZone,
  maskFeedUrl,
} from "../calendarFeed.js";

const ics = (events) =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    "BEGIN:VTIMEZONE",
    "TZID:America/New_York",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:-0500",
    "TZOFFSETTO:-0400",
    "DTSTART:19700308T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:-0400",
    "TZOFFSETTO:-0500",
    "DTSTART:19701101T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
    ...events.flatMap((lines) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"]),
    "END:VCALENDAR",
  ].join("\r\n");

const window = {
  from: "2026-11-09",
  to: "2026-11-15",
  timeZone: "America/New_York",
};

describe("checkFeedUrl", () => {
  it("accepts Google and Outlook ics links, and webcal ones", () => {
    expect(
      checkFeedUrl(
        "https://calendar.google.com/calendar/ical/me%40gmail.com/private-abc/basic.ics",
      ).provider,
    ).toBe("google");
    expect(
      checkFeedUrl(
        " webcal://outlook.office365.com/owa/calendar/x@y.com/abc/calendar.ics",
      ).url,
    ).toMatch(/^https:\/\/outlook/);
  });

  it("rejects other hosts, http, and non-ics pages", () => {
    expect(checkFeedUrl("https://localhost/calendar.ics").error).toBeTruthy();
    expect(
      checkFeedUrl("http://calendar.google.com/calendar/ical/x/basic.ics")
        .error,
    ).toBeTruthy();
    expect(
      checkFeedUrl("https://calendar.google.com/calendar/embed?src=x").error,
    ).toBeTruthy();
    expect(
      checkFeedUrl("https://calendar.google.com.evil.com/x.ics").error,
    ).toBeTruthy();
    expect(checkFeedUrl(42).error).toBeTruthy();
  });

  it("masks the secret part", () => {
    expect(
      maskFeedUrl(
        "https://calendar.google.com/calendar/ical/me/private-abc/basic.ics",
      ),
    ).toBe("calendar.google.com/…/basic.ics");
  });
});

describe("isTimeZone", () => {
  it("checks IANA names", () => {
    expect(isTimeZone("Europe/London")).toBe(true);
    expect(isTimeZone("Not/AZone")).toBe(false);
    expect(isTimeZone("")).toBe(false);
  });
});

describe("feedBlocks", () => {
  it("turns a zoned event into local blocks", () => {
    const blocks = feedBlocks(
      ics([
        [
          "UID:1",
          "SUMMARY:Dentist",
          "DTSTART;TZID=America/New_York:20261110T090000",
          "DTEND;TZID=America/New_York:20261110T100000",
        ],
      ]),
      window,
    );
    expect(blocks).toEqual([
      {
        activity: "Dentist",
        date: "2026-11-10",
        start_time: "09:00:00",
        end_time: "10:00:00",
        type: "personal",
      },
    ]);
  });

  it("converts UTC times into the user time zone", () => {
    const blocks = feedBlocks(
      ics([
        [
          "UID:1",
          "SUMMARY:Call",
          "DTSTART:20261110T150000Z",
          "DTEND:20261110T153000Z",
        ],
      ]),
      {
        ...window,
        timeZone: "America/Los_Angeles",
      },
    );
    expect(blocks[0]).toMatchObject({
      date: "2026-11-10",
      start_time: "07:00:00",
      end_time: "07:30:00",
    });
  });

  it("expands weekly repeats, leaving out excluded and cancelled ones and moving changed ones", () => {
    const blocks = feedBlocks(
      ics([
        [
          "UID:r",
          "SUMMARY:Lecture",
          "DTSTART;TZID=America/New_York:20261005T100000",
          "DTEND;TZID=America/New_York:20261005T110000",
          "RRULE:FREQ=DAILY",
          "EXDATE;TZID=America/New_York:20261111T100000",
        ],
        [
          "UID:r",
          "RECURRENCE-ID;TZID=America/New_York:20261112T100000",
          "SUMMARY:Lecture",
          "STATUS:CANCELLED",
          "DTSTART;TZID=America/New_York:20261112T100000",
          "DTEND;TZID=America/New_York:20261112T110000",
        ],
        [
          "UID:r",
          "RECURRENCE-ID;TZID=America/New_York:20261113T100000",
          "SUMMARY:Lecture (moved)",
          "DTSTART;TZID=America/New_York:20261113T140000",
          "DTEND;TZID=America/New_York:20261113T150000",
        ],
      ]),
      window,
    );
    expect(
      blocks.map((b) => `${b.date} ${b.start_time} ${b.activity}`),
    ).toEqual([
      "2026-11-09 10:00:00 Lecture",
      "2026-11-10 10:00:00 Lecture",
      "2026-11-13 14:00:00 Lecture (moved)",
      "2026-11-14 10:00:00 Lecture",
      "2026-11-15 10:00:00 Lecture",
    ]);
  });

  it("skips all-day and free events, and splits ones past midnight", () => {
    const blocks = feedBlocks(
      ics([
        [
          "UID:a",
          "SUMMARY:Holiday",
          "DTSTART;VALUE=DATE:20261111",
          "DTEND;VALUE=DATE:20261112",
        ],
        [
          "UID:f",
          "SUMMARY:Maybe",
          "TRANSP:TRANSPARENT",
          "DTSTART:20261110T150000Z",
          "DTEND:20261110T160000Z",
        ],
        [
          "UID:n",
          "DTSTART;TZID=America/New_York:20261110T220000",
          "DTEND;TZID=America/New_York:20261111T010000",
        ],
      ]),
      window,
    );
    expect(blocks).toEqual([
      {
        activity: "Busy",
        date: "2026-11-10",
        start_time: "22:00:00",
        end_time: "23:59:00",
        type: "personal",
      },
      {
        activity: "Busy",
        date: "2026-11-11",
        start_time: "00:00:00",
        end_time: "01:00:00",
        type: "personal",
      },
    ]);
  });

  it("leaves out events outside the window", () => {
    expect(
      feedBlocks(
        ics([["UID:1", "DTSTART:20270110T150000Z", "DTEND:20270110T160000Z"]]),
        window,
      ),
    ).toEqual([]);
  });

  it("throws on text that is not a calendar", () => {
    expect(() => feedBlocks("<html>nope</html>", window)).toThrow(
      /didn't return a calendar/,
    );
  });
});
