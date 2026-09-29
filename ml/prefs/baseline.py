"""Baseline A: preferences from the survey alone, by fixed rules. No model, no history.

It's the fallback when the model's reply can't be used, and the bar the fine-tuned model has to beat.
personas.label() starts from this too, so "stated only" items are written the same way everywhere.
"""

from schema import CALENDAR_STYLES, DEADLINE_HOURS, FOCUS, ROUTINE_WHEN, SESSIONS, canonical, hhmm, tmin

SLEEP_LENGTH_DEFAULT = {True: 8.0, False: 7.5}
FRIENDS = {"days": ["fri", "sat"], "start": "18:00", "end": "23:59"}
FAMILY = {"days": ["sun"], "start": "10:00", "end": "18:00"}


def stated_bedtime(survey):
    """wake_time minus sleep hours, as HH:MM, or None."""
    if not survey.get("wake_time"):
        return None
    hours = survey.get("sleep_hours") or SLEEP_LENGTH_DEFAULT["sleep" in survey.get("non_negotiables", [])]
    return hhmm((tmin(survey["wake_time"]) - int(hours * 60)) % (24 * 60))


def _item(kind, evidence, strength="medium", confidence="medium", **fields):
    return {"kind": kind, "evidence": evidence, **fields, "source": "stated", "strength": strength,
            "confidence": confidence}


def from_survey(survey):
    survey = survey or {}
    musts = set(survey.get("non_negotiables", []))
    out = {"summary": "Preferences from the survey only.", "preferences": [], "adjustments": []}
    prefs = out["preferences"]

    bed = stated_bedtime(survey)
    if bed:
        out["sleep"] = {"evidence": f"survey: wake {survey['wake_time']}, {survey.get('sleep_hours', 8):g}h sleep",
                        "bedtime": bed, "source": "stated", "confidence": "medium"}
    if survey.get("focus_time") in FOCUS:
        start, end = FOCUS[survey["focus_time"]]
        prefs.append(_item("activity_window", f"survey focus_time={survey['focus_time']}",
                           activity="study", direction="prefer", days="all", start=start, end=end))
    for r in survey.get("routines", []):
        if r.get("activity") == "exercise" and r.get("when") in ROUTINE_WHEN:
            start, end = ROUTINE_WHEN[r["when"]]
            prefs.append(_item("activity_window", f"survey routine when={r['when']}",
                               "high" if "exercise" in musts else "medium",
                               activity="exercise", direction="prefer", days="all", start=start, end=end))
            break
    if survey.get("work_session") in SESSIONS:
        prefs.append(_item("session_length", f"survey work_session={survey['work_session']}",
                           ideal=SESSIONS[survey["work_session"]]))
    if "friends" in musts:
        prefs.append(_item("protect_time", "survey non_negotiables has friends", "high", **FRIENDS))
    if "family" in musts:
        prefs.append(_item("protect_time", "survey non_negotiables has family", "high", **FAMILY))
    if survey.get("deadline_style") in DEADLINE_HOURS:
        prefs.append(_item("deadline_buffer", f"survey deadline_style={survey['deadline_style']}",
                           hours_before=DEADLINE_HOURS[survey["deadline_style"]]))
    if survey.get("calendar_style") in CALENDAR_STYLES:
        prefs.append(_item("distribution", f"survey calendar_style={survey['calendar_style']}",
                           style=CALENDAR_STYLES[survey["calendar_style"]]))
    return canonical(out)
