"""A real user's history, as the preference model reads it.

The app sends its rows (POST /history on the scheduler API; server/app.js collects them), and this turns
them into the same history objects personas.simulate() makes, then personas.render() writes the text.
So a real user looks exactly like the synthetic ones the model was tested on.

Where each part comes from:
- Classes, work and the user's own study blocks: time_blocks as they are (auto commutes left out).
- Planned study: task blocks (the app's suggestions and the ones users add for a task). A block that was
  moved shows at its new time with the first planned time ("planned 10:00-10:45, moved"), from the
  block_moved events. A deleted one is "skipped" at its planned time, unless the task was already done
  by then. Any other past block counts as done when its task was finished or has a later block (a split
  task carries on), else skipped. That's the planner's own "missed" rule (src/app/lib/reschedule.ts).
- Reflections: ratings, plus bed and wake-up times when both were filled in.
- TASKS DONE: tasks finished in the window with an estimate and a recorded time spent.
- PAST PICKS: the plan_accepted events, by style, when the options shown weren't all the same style.
Not tracked by the app yet, so never in a real log: "started late", "stopped after", "kept going",
"too tired", routines, and survey notes.

Days run up to yesterday, at most WINDOW of them, and only days with something on them. Times are the
user's local times: rows give dates and times as typed, timestamps are moved by tz_offset (the browser's
getTimezoneOffset(), 420 for Pacific daylight time).
"""

from datetime import date, datetime, timedelta, timezone

import personas
from schema import tmin

WINDOW = 21


def _local(ts, tz_offset):
    """A Supabase timestamp ("2026-10-20T15:04:05.123+00:00") as a naive local datetime."""
    when = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    if when.tzinfo:
        when = when.astimezone(timezone.utc).replace(tzinfo=None)
    return when - timedelta(minutes=tz_offset)


def _minutes(t):
    return tmin(t[:5])


def build(rows):
    """rows: {now, tz_offset, survey, blocks, tasks, reflections, events} -> (survey, history) for render()."""
    now = datetime.fromisoformat(rows["now"])
    today = now.date()
    first = today - timedelta(days=WINDOW)
    tz = rows.get("tz_offset", 0)
    tasks = {t["id"]: t for t in rows.get("tasks", [])}
    done_at = {t["id"]: _local(t["completed_at"], tz) for t in tasks.values() if t.get("completed") and t.get("completed_at")}
    events = sorted(rows.get("events", []), key=lambda e: e["created_at"])

    planned = {}  # block id -> its first planned (date, start, end), from the first time it moved
    for ev in events:
        if ev["kind"] == "block_moved" and ev.get("block_id") not in planned:
            f = ev["details"]["from"]
            planned[ev["block_id"]] = (f["date"], f["start"], f["end"])

    blocks = [b for b in rows.get("blocks", []) if not b.get("auto")]
    task_starts = {}
    for b in blocks:
        if b["type"] == "task":
            task_starts.setdefault(b.get("task_id"), []).append(f"{b['date']}T{b['start_time'][:5]}")

    by_day = {}

    def add(day, ev):
        if first <= day < today:
            by_day.setdefault(day, []).append(ev)

    for b in blocks:
        day = date.fromisoformat(b["date"])
        s, e = _minutes(b["start_time"]), _minutes(b["end_time"])
        if b["type"] != "task":
            cat = b["type"] if b["type"] in ("class", "work", "study") else "personal"
            add(day, {"s": s, "e": e, "cat": cat, "label": b["activity"]})
            continue
        if b.get("task_id") not in tasks:
            continue  # its task is gone
        start = f"{b['date']}T{b['start_time'][:5]}"
        first_plan = planned.get(b["id"])
        if first_plan and first_plan != (b["date"], b["start_time"][:5], b["end_time"][:5]):
            ev = {"s": s, "e": e, "cat": "study", "label": b["activity"],
                  "planned": (tmin(first_plan[1]), tmin(first_plan[2])), "outcome": "moved"}
        else:
            later = any(other > start for other in task_starts.get(b["task_id"], []))
            outcome = "done" if b["task_id"] in done_at or later else "skipped"
            ev = {"s": s, "e": e, "cat": "study", "label": b["activity"], "planned": (s, e), "outcome": outcome}
        add(day, ev)

    for ev in events:
        if ev["kind"] != "block_deleted" or ev.get("task_id") not in tasks:
            continue
        d = ev["details"]
        when = planned.get(ev.get("block_id"), (d["date"], d["start"], d["end"]))
        start = datetime.fromisoformat(f"{when[0]}T{when[1]}")
        if ev.get("task_id") in done_at and done_at[ev["task_id"]] <= start:
            continue  # the task was finished before this session came up
        s, e = tmin(when[1]), tmin(when[2])
        add(date.fromisoformat(when[0]), {"s": s, "e": e, "cat": "study", "label": d["label"], "planned": (s, e),
                                          "outcome": "skipped"})

    reflections = {}
    for r in rows.get("reflections", []):
        day = date.fromisoformat(r["date"])
        if not first <= day < today:
            continue
        entry = {k: r["ratings"][k] for k in ("productivity", "mood", "energy", "sleep")}
        if r.get("bed_time") and r.get("wake_time"):
            entry.update(bed=_minutes(r["bed_time"]), up=_minutes(r["wake_time"]))
        reflections[day] = entry
        by_day.setdefault(day, [])

    # The day before an exam is cram time, which personas.label() leaves out.
    exam_days = set()
    for t in tasks.values():
        if t.get("type") == "exam" and t.get("due_date"):
            due = date.fromisoformat(t["due_date"]) if len(t["due_date"]) == 10 else _local(t["due_date"], tz).date()
            exam_days.add(due - timedelta(days=1))
    log = [{"date": day, "ago": (today - day).days, "events": sorted(evs, key=lambda ev: ev["s"]),
            "crunch": day in exam_days} for day, evs in sorted(by_day.items())]

    done = []
    for t in tasks.values():
        finished = done_at.get(t["id"])
        if finished and first <= finished.date() < today and t.get("estimated_time") and t.get("time_spent") \
                and t.get("due_date"):
            due = (datetime.fromisoformat(f"{t['due_date']}T23:59") if len(t["due_date"]) == 10
                   else _local(t["due_date"], tz))
            done.append({"title": t["title"], "type": t["type"], "est": t["estimated_time"], "spent": t["time_spent"],
                         "due": due, "done": finished})

    picks = []
    for ev in events:
        if ev["kind"] == "plan_accepted":
            when = _local(ev["created_at"], tz).date()
            options = ev["details"]["options"]
            # Options that all look the same say nothing about what the user prefers.
            if first <= when < today and 0 <= ev["details"]["chosen"] < len(options) and len(set(options)) > 1:
                picks.append({"date": when, "shown": options, "chosen": options[ev["details"]["chosen"]]})

    n_days = (today - log[0]["date"]).days if log else 0
    history = {"today": today, "n_days": n_days, "log": log, "reflections": reflections, "tasks": done,
               "picks": picks, "notes": []}
    return rows.get("survey") or {}, history


def rules(rows):
    """The preference JSON the fixed rules in system_prompt.txt infer from this history (personas.label):
    the model's training target, and a model-free reader for real users."""
    survey, history = build(rows)
    return personas.label(survey, history)


def bundle(rows):
    """The text the preference model reads for this user."""
    survey, history = build(rows)
    return personas.render(survey, history)
