"""The two tiers the solver can never break: fixed requirements and hard constraints.

Fixed requirements are the week's "fixed" list (classes, work, commutes, standing commitments). They are
never moved. If one lands inside the sleep window or its buffers it still wins, and build() adds a note.

Hard constraints, on top of the solver's own (no overlaps, deadlines, day off, not before now):
- Sleep. The user's sleep length is a hard number (survey sleep_hours; 8 if sleep is a non-negotiable,
  else 7.5). When they sleep is a soft input: the preference JSON's sleep.bedtime, else the survey's
  wake time, else a default from their focus time. It is always pulled into a sane band: bedtime
  21:30-01:00 and waking 05:30-10:00, so no preference can make 8 hours of sleep impossible.
- Wind-down: nothing productive in the WIND_DOWN minutes before bed. Wake-up buffer: nothing in the
  WAKE_BUFFER minutes after waking. Together these become the solver's daily available hours (capped
  at 23:59, since blocks can't cross midnight).
- Meals: at least MEAL_GAP free minutes somewhere in each meal window, on every day where the fixed
  commitments leave that possible. This one needs the placed blocks, so it is a per-day check
  that the solver runs at every placement (meal_check).

build() turns a week + survey + preference JSON into the solver's input. That is also where the
preference JSON's adjustments land: session_length sets the chunk size and estimate_multiplier
stretches task estimates.
"""

import copy
from datetime import date, datetime, timedelta

from schema import SESSIONS, bed_minutes, hhmm, tmin

DAY = 24 * 60
WIND_DOWN = 60
WAKE_BUFFER = 45
BED_BAND = (tmin("21:30"), tmin("25:00"))   # minutes after the previous midnight
WAKE_BAND = (tmin("05:30"), tmin("10:00"))
MEALS = [("lunch", tmin("11:30"), tmin("14:00")), ("dinner", tmin("17:30"), tmin("20:00"))]
MEAL_GAP = 30
DEFAULT_BED = {"early_morning": "22:00", "morning": "23:00", "afternoon": "23:30", "evening": "23:30",
               "late_night": "00:30"}


def round_up(m, step=15):
    return -(-m // step) * step


def sleep_hours(survey):
    survey = survey or {}
    if survey.get("sleep_hours"):
        return max(6.0, min(10.0, float(survey["sleep_hours"])))
    return 8.0 if "sleep" in survey.get("non_negotiables", []) else 7.5


def sleep_plan(survey, prefs):
    """{"bedtime", "wake"} in minutes (bedtime after the previous midnight, so 00:30 is 1470), plus
    hours, where the bedtime came from, and whether it had to be moved into the band."""
    survey = survey or {}
    hours = sleep_hours(survey)
    length = int(hours * 60)
    if (prefs or {}).get("sleep"):
        bed, source = bed_minutes(prefs["sleep"]["bedtime"]), "preferences"
    elif survey.get("wake_time"):
        bed, source = tmin(survey["wake_time"]) + DAY - length, "survey wake time"
    else:
        bed, source = bed_minutes(DEFAULT_BED.get(survey.get("focus_time"), "23:30")), "default"
    low = max(BED_BAND[0], WAKE_BAND[0] + DAY - length)
    high = min(BED_BAND[1], WAKE_BAND[1] + DAY - length)
    clamped = max(low, min(high, bed))
    return {"bedtime": clamped, "wake": clamped + length - DAY, "hours": hours, "source": source,
            "moved": clamped != bed}


def available(sleep):
    start = round_up(sleep["wake"] + WAKE_BUFFER)
    end = min(DAY - 1, sleep["bedtime"] - WIND_DOWN)
    return {"start": hhmm(start), "end": hhmm(end)}


def routines_for(week, survey):
    """The week's routines, else the survey's, as [{"id", "activity", "label", "times", "minutes"}]."""
    if week.get("routines") is not None:
        return week["routines"]
    out = []
    for i, r in enumerate((survey or {}).get("routines", []), start=1):
        if r.get("times") and r.get("minutes"):
            out.append({"id": f"r{i}", "activity": r.get("activity", "exercise"), "label": r.get("label", "Routine"),
                        "times": int(r["times"]), "minutes": int(r["minutes"])})
    return out


def session_minutes(survey, prefs):
    for p in (prefs or {}).get("preferences", []):
        if p["kind"] == "session_length":
            return max(25, min(180, p["ideal"]))
    return SESSIONS.get((survey or {}).get("work_session"), 45)


def build(week, survey, prefs):
    """The solver input for this week: available hours from the sleep plan, session length and task
    minutes from the preference JSON, and routines as tasks the solver knows how to place."""
    survey = survey or {}
    inp = copy.deepcopy({k: v for k, v in week.items() if k != "routines"})
    sleep = sleep_plan(survey, prefs)
    inp["available"] = available(sleep)
    inp["sleep"] = sleep
    inp["prefs"] = {"focus_time": survey.get("focus_time"), "session_minutes": session_minutes(survey, prefs),
                    "deadline_style": survey.get("deadline_style"), "calendar_style": survey.get("calendar_style")}
    inp.setdefault("recent_ratings", [])

    factors = {a["task_type"]: a["factor"] for a in (prefs or {}).get("adjustments", [])
               if a["kind"] == "estimate_multiplier"}
    for t in inp["tasks"]:
        t["estimate"] = t["minutes"]
        if factors.get(t["type"], 1) != 1:
            t["minutes"] = round_up(int(t["minutes"] * factors[t["type"]]))

    routines = routines_for(week, survey)
    inp["routines"] = routines
    for r in routines:
        inp["tasks"].append({"id": r["id"], "title": r["label"], "type": "routine", "activity": r["activity"],
                             "priority": "medium", "due": f"{week['week']['end']}T23:59",
                             "minutes": r["minutes"], "times": r["times"], "routine": True})

    notes = []
    if sleep["moved"]:
        notes.append(f"bedtime moved to {hhmm(sleep['bedtime'] % DAY)} to fit {sleep['hours']:g} hours of sleep "
                     "in normal hours")
    a_start, a_end = tmin(inp["available"]["start"]), tmin(inp["available"]["end"])
    for f in inp["fixed"]:
        if tmin(f["start"]) < a_start or tmin(f["end"]) > a_end:
            notes.append(f"{f['label']} on {f['date']} ({f['start']}-{f['end']}) is inside the sleep window or "
                         "its buffers; fixed commitments win")
    inp["notes"] = notes
    return inp


def week_days(inp):
    start = date.fromisoformat(inp["week"]["start"])
    return [start + timedelta(days=i) for i in range((date.fromisoformat(inp["week"]["end"]) - start).days + 1)]


def _has_gap(lo, hi, busy, need):
    cur = lo
    for s, e in sorted(busy):
        if e <= cur or s >= hi:
            continue
        if s - cur >= need:
            return True
        cur = max(cur, e)
    return hi - cur >= need


def meal_windows(inp):
    """Per day index, the meal windows that must keep a free gap: clipped to available hours and to
    after now, and only where the fixed commitments alone still leave the gap."""
    days = week_days(inp)
    now = datetime.fromisoformat(inp["now"])
    a_start, a_end = tmin(inp["available"]["start"]), tmin(inp["available"]["end"])
    out = []
    for d in days:
        busy = [(tmin(f["start"]), tmin(f["end"])) for f in inp["fixed"] if f["date"] == d.isoformat()]
        after = now.hour * 60 + now.minute if d == now.date() else (DAY if d < now.date() else 0)
        windows = []
        for name, lo, hi in MEALS:
            lo, hi = max(lo, a_start, after), min(hi, a_end)
            if hi - lo >= MEAL_GAP and _has_gap(lo, hi, busy, MEAL_GAP):
                windows.append((name, lo, hi))
        out.append((busy, windows))
    return out


def meal_check(inp):
    """check(day, placed) for the solver: every meal window that day still has a free gap."""
    per_day = meal_windows(inp)

    def check(day, placed):
        busy, windows = per_day[day]
        if not windows:
            return True
        busy = busy + [(s, e) for s, e, _ in placed]
        return all(_has_gap(lo, hi, busy, MEAL_GAP) for _, lo, hi in windows)
    return check


def validate(inp, cal):
    """Every hard rule, checked from scratch on a finished calendar. Returns a list of problems."""
    problems = []
    tasks = {t["id"]: t for t in inp["tasks"]}
    days = [d.isoformat() for d in week_days(inp)]
    now = datetime.fromisoformat(inp["now"])
    a_start, a_end = tmin(inp["available"]["start"]), tmin(inp["available"]["end"])
    session = inp["prefs"]["session_minutes"]
    by_day = {d: [(tmin(f["start"]), tmin(f["end"]), f["label"]) for f in inp["fixed"] if f["date"] == d]
              for d in days}
    scheduled, routine_days = {}, set()
    for b in cal["blocks"]:
        name = f"{b['task']} {b['date']} {b['start']}-{b['end']}"
        t = tasks.get(b["task"])
        s, e = tmin(b["start"]), tmin(b["end"])
        if t is None:
            problems.append(f"{name}: unknown task")
            continue
        if b["date"] not in days or b["date"] == inp.get("day_off"):
            problems.append(f"{name}: not a schedulable day")
        if not (a_start <= s < e <= a_end):
            problems.append(f"{name}: outside available hours (sleep window or buffers)")
        if datetime.fromisoformat(f"{b['date']}T{b['start']}") < now:
            problems.append(f"{name}: before now")
        if datetime.fromisoformat(f"{b['date']}T{b['end']}") > datetime.fromisoformat(t["due"]):
            problems.append(f"{name}: after the due time")
        if t.get("routine"):
            if e - s != t["minutes"]:
                problems.append(f"{name}: routine session is not {t['minutes']} minutes")
            if (t["id"], b["date"]) in routine_days:
                problems.append(f"{name}: second session of a routine on one day")
            routine_days.add((t["id"], b["date"]))
        elif e - s > session:
            problems.append(f"{name}: longer than the {session}-minute session")
        for os_, oe, label in by_day.get(b["date"], []):
            if s < oe and os_ < e:
                problems.append(f"{name}: overlaps {label}")
        if b["date"] in by_day:
            by_day[b["date"]].append((s, e, name))
        scheduled[t["id"]] = scheduled.get(t["id"], 0) + e - s
    for t in tasks.values():
        need = t["minutes"] * (t["times"] if t.get("routine") else 1)
        if scheduled.get(t["id"], 0) > need:
            problems.append(f"{t['id']}: more minutes scheduled than needed")
    for i, (busy, windows) in enumerate(meal_windows(inp)):
        placed = [(tmin(b["start"]), tmin(b["end"])) for b in cal["blocks"] if b["date"] == days[i]]
        for name, lo, hi in windows:
            if not _has_gap(lo, hi, busy + placed, MEAL_GAP):
                problems.append(f"{days[i]}: no {MEAL_GAP}-minute gap for {name} between {hhmm(lo)} and {hhmm(hi)}")
    return problems
