"""The preference JSON: what the model writes after reading a user's history, and what the scorer reads.

{
  "summary": "one sentence",
  "sleep": {"evidence", "bedtime": "23:30", "source", "overrides"?, "confidence"},      (optional)
  "preferences": [{"kind", "evidence", ...kind fields..., "source", "overrides"?, "strength", "confidence"}],
  "adjustments": [{"kind": "estimate_multiplier", "evidence", "task_type", "factor", "source", "confidence"}]
}

Kinds and their fields:
  activity_window  activity (study | exercise), direction (prefer | avoid), start, end, days (all | weekdays | weekends)
  session_length   ideal (minutes per study session)
  daily_load       max_minutes (study per day)
  min_gap          minutes (break before a block that follows another)
  protect_time     days (["fri", "sat"]), start, end   (no study or routines in this window)
  deadline_buffer  hours_before (finish each task this long before it's due; 0 = no buffer)
  distribution     style (front_loaded | even | spaced | clustered)

"evidence" comes first on purpose: the model writes what it saw before it commits to values.
strength = how much the user cares, confidence = how sure the data makes us; both low | medium | high,
because a small model picks one of three words far more consistently than it invents a number.
source = stated (survey or notes), observed (the log), or both. "overrides" names the stated answer
an observed preference replaces, when they disagree.

clean() is the gate between the model and the solver: whatever the model writes, it returns something
the scorer can use, plus a list of what it had to fix or drop.
"""

import json
import re

KINDS = ["activity_window", "session_length", "daily_load", "min_gap", "protect_time", "deadline_buffer",
         "distribution"]
ACTIVITIES = ["study", "exercise"]
DIRECTIONS = ["prefer", "avoid"]
DAY_SETS = ["all", "weekdays", "weekends"]
DAY_NAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
STYLES = ["front_loaded", "even", "spaced", "clustered"]
TASK_TYPES = ["homework", "exam", "project", "study", "work"]
LEVELS = ["low", "medium", "high"]
SOURCES = ["stated", "observed", "both"]

# Scorer weights for the three levels.
STRENGTH = {"low": 1.0, "medium": 2.0, "high": 3.0}
CONFIDENCE = {"low": 0.4, "medium": 0.7, "high": 1.0}

# Survey answers as time windows. FOCUS matches FOCUS_TIMES in src/app/lib/survey.ts (and FOCUS_WINDOWS in
# csp/solver.py); ROUTINE_WHEN is the new survey question "when do you usually do it?".
FOCUS = {"early_morning": ("05:00", "09:00"), "morning": ("09:00", "12:00"), "afternoon": ("12:00", "17:00"),
         "evening": ("17:00", "22:00"), "late_night": ("22:00", "24:00")}
ROUTINE_WHEN = {"early_morning": ("06:00", "09:00"), "midday": ("11:00", "14:00"), "afternoon": ("14:00", "17:00"),
                "evening": ("17:00", "20:00"), "night": ("20:00", "22:00")}
SESSIONS = {"25": 25, "45": 45, "90": 90, "120_plus": 120}
DEADLINE_HOURS = {"steady": 48, "day_before": 24, "night_before": 0}
CALENDAR_STYLES = {"calendar1": "clustered", "calendar2": "spaced", "calendar3": "front_loaded", "calendar4": "even"}

TIME = re.compile(r"^([01]?\d|2[0-4]):([0-5]\d)$")


def tmin(hhmm):
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def hhmm(total):
    return f"{total // 60:02d}:{total % 60:02d}"


def bed_minutes(hhmm_):
    """Bedtime as minutes after the previous midnight: "00:30" is 1470, "23:00" is 1380."""
    m = tmin(hhmm_)
    return m + 24 * 60 if m < 12 * 60 else m


def _time(value):
    if not isinstance(value, str) or not TIME.match(value.strip()):
        return None
    value = value.strip()
    h, m = value.split(":")
    total = int(h) * 60 + int(m)
    return hhmm(total) if total <= 24 * 60 else None


def _level(value):
    value = str(value).strip().lower() if value is not None else ""
    return value if value in LEVELS else None


def _int(value, low, high):
    try:
        return max(low, min(high, int(round(float(value)))))
    except (TypeError, ValueError):
        return None


def _window(item, problems, where):
    start, end = _time(item.get("start")), _time(item.get("end"))
    if not start or not end:
        problems.append(f"{where}: bad start/end")
        return None
    if tmin(end) <= tmin(start):
        problems.append(f"{where}: end is not after start")
        return None
    return start, end


def _common(item, raw, problems, where, levels=("strength", "confidence")):
    """strength, confidence, source, overrides, evidence, with defaults for anything missing."""
    evidence = raw.get("evidence")
    if not isinstance(evidence, str) or not evidence.strip():
        problems.append(f"{where}: no evidence")
        evidence = ""
    out = {"kind": item["kind"], "evidence": evidence.strip()}
    out.update({k: v for k, v in item.items() if k != "kind"})
    source = str(raw.get("source", "")).strip().lower()
    if source not in SOURCES:
        problems.append(f"{where}: bad source")
        source = "stated"
    out["source"] = source
    if isinstance(raw.get("overrides"), str) and raw["overrides"].strip():
        out["overrides"] = raw["overrides"].strip()
    for field in levels:
        level = _level(raw.get(field))
        if not level:
            problems.append(f"{where}: bad {field}")
            level = "medium"
        out[field] = level
    return out


def _preference(raw, problems, where):
    kind = raw.get("kind")
    if kind not in KINDS:
        problems.append(f"{where}: unknown kind {kind!r}, dropped")
        return None
    item = {"kind": kind}
    if kind == "activity_window":
        activity, direction = raw.get("activity"), raw.get("direction", "prefer")
        if activity not in ACTIVITIES or direction not in DIRECTIONS:
            problems.append(f"{where}: bad activity or direction, dropped")
            return None
        window = _window(raw, problems, where)
        if not window:
            return None
        days = raw.get("days", "all")
        if days not in DAY_SETS:
            problems.append(f"{where}: bad days, using all")
            days = "all"
        item.update(activity=activity, direction=direction, start=window[0], end=window[1], days=days)
    elif kind == "protect_time":
        days = raw.get("days")
        days = [d for d in days if d in DAY_NAMES] if isinstance(days, list) else []
        window = _window(raw, problems, where)
        if not days or not window:
            problems.append(f"{where}: bad days or window, dropped")
            return None
        item.update(days=sorted(set(days), key=DAY_NAMES.index), start=window[0], end=window[1])
    elif kind == "distribution":
        if raw.get("style") not in STYLES:
            problems.append(f"{where}: bad style, dropped")
            return None
        item["style"] = raw["style"]
    else:
        field, low, high = {"session_length": ("ideal", 15, 180), "daily_load": ("max_minutes", 30, 720),
                            "min_gap": ("minutes", 5, 90), "deadline_buffer": ("hours_before", 0, 168)}[kind]
        value = _int(raw.get(field), low, high)
        if value is None:
            problems.append(f"{where}: bad {field}, dropped")
            return None
        item[field] = value
    return _common(item, raw, problems, where)


def _sleep(raw, problems):
    bedtime = _time(raw.get("bedtime")) if isinstance(raw, dict) else None
    if not bedtime:
        problems.append("sleep: bad bedtime, dropped")
        return None
    # No strength: how long someone sleeps is a hard rule; only the timing is a preference.
    out = _common({"kind": "sleep", "bedtime": bedtime}, raw, problems, "sleep", levels=("confidence",))
    out.pop("kind")
    return out


def _adjustment(raw, problems, where):
    if raw.get("kind") != "estimate_multiplier" or raw.get("task_type") not in TASK_TYPES:
        problems.append(f"{where}: unknown adjustment, dropped")
        return None
    try:
        factor = round(max(0.5, min(3.0, float(raw.get("factor")))), 1)
    except (TypeError, ValueError):
        problems.append(f"{where}: bad factor, dropped")
        return None
    return _common({"kind": "estimate_multiplier", "task_type": raw["task_type"], "factor": factor},
                   raw, problems, where, levels=("confidence",))


def empty():
    return {"summary": "", "preferences": [], "adjustments": []}


def clean(raw):
    """Returns (prefs, problems). prefs always has summary, preferences and adjustments, and sleep when
    the input had a usable one. Duplicates (same match key) keep the first."""
    problems = []
    if not isinstance(raw, dict):
        return empty(), ["not a JSON object"]
    out = empty()
    if isinstance(raw.get("summary"), str):
        out["summary"] = raw["summary"].strip()
    if raw.get("sleep") is not None:
        sleep = _sleep(raw["sleep"], problems)
        if sleep:
            out["sleep"] = sleep
    seen = set()
    for section, parse_one in (("preferences", _preference), ("adjustments", _adjustment)):
        items = raw.get(section, [])
        if not isinstance(items, list):
            problems.append(f"{section} is not a list")
            continue
        for i, item in enumerate(items):
            if not isinstance(item, dict):
                problems.append(f"{section}[{i}] is not an object")
                continue
            parsed = parse_one(item, problems, f"{section}[{i}]")
            if not parsed:
                continue
            key = match_key(parsed)
            if key in seen:
                problems.append(f"{section}[{i}]: duplicate {key}, dropped")
                continue
            seen.add(key)
            out[section].append(parsed)
    for key in raw:
        if key not in ("summary", "sleep", "preferences", "adjustments"):
            problems.append(f"unknown top-level key {key!r}")
    return canonical(out), problems


def match_key(item):
    """Two items with the same key describe the same preference (for de-duplication and evaluation)."""
    kind = item.get("kind", "sleep")
    if kind == "activity_window":
        return (kind, item["activity"], item["direction"])
    if kind == "protect_time":
        return (kind, tuple(item["days"]))
    if kind == "estimate_multiplier":
        return (kind, item["task_type"])
    return (kind,)


def _order(item):
    key = match_key(item)
    rank = KINDS.index(key[0]) if key[0] in KINDS else len(KINDS)
    return (rank, [str(k) for k in key[1:]])


FIELD_ORDER = ["kind", "evidence", "activity", "direction", "days", "start", "end", "bedtime", "ideal",
               "max_minutes", "minutes", "hours_before", "style", "task_type", "factor", "source", "overrides",
               "strength", "confidence"]


def _fields(item):
    return {k: item[k] for k in FIELD_ORDER if k in item}


def canonical(prefs):
    """Fixed item order and field order, so every training label is written the same way."""
    out = {"summary": prefs.get("summary", "")}
    if prefs.get("sleep"):
        out["sleep"] = _fields(prefs["sleep"])
    out["preferences"] = [_fields(p) for p in sorted(prefs.get("preferences", []), key=_order)]
    out["adjustments"] = [_fields(a) for a in sorted(prefs.get("adjustments", []), key=_order)]
    return out


def dumps(prefs):
    return json.dumps(canonical(prefs), ensure_ascii=False)
