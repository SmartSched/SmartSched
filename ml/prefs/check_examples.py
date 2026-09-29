"""Checkpoint before any ML: can a hand-written preference JSON express what we mean, and does it move
the calendars the way a person would expect?

  python check_examples.py          # runs every example, asserts, writes outputs/examples/<name>.html

Each example is one week, one survey, and one or two preference JSONs with a check on the picks. The
"(control)" cases run the survey-only preferences and check that the behaviour is NOT there without
the preference, so a pass means the preference is what moved the calendar.
Every pick also has to pass hard.validate (sleep window and buffers, meals, overlaps, deadlines).
"""

import copy
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

import baseline  # noqa: E402
import schedule  # noqa: E402
from schema import canonical, tmin  # noqa: E402

BASE_WEEK = json.loads((HERE.parent / "eval" / "prompts" / "01.json").read_text())["input"]
BASE_WEEK = {k: BASE_WEEK[k] for k in ("now", "week", "day_off", "fixed", "tasks")}
BASE_SURVEY = {"commitments": {"classes": 6}, "focus_time": "afternoon", "work_session": "45",
               "non_negotiables": ["sleep", "exercise"], "deadline_style": "steady", "calendar_style": "calendar2",
               "sleep_hours": 8, "wake_time": "07:00",
               "routines": [{"activity": "exercise", "label": "Gym", "times": 3, "minutes": 60,
                             "when": "early_morning"}]}


def pref(kind, evidence, source="observed", strength="high", confidence="high", **fields):
    return {"kind": kind, "evidence": evidence, **fields, "source": source, "strength": strength,
            "confidence": confidence}


def with_prefs(survey, *, drop=(), add=(), sleep=None, adjustments=()):
    """The survey baseline with some items replaced: drop by (kind, activity) and add new ones."""
    p = baseline.from_survey(survey)
    p["preferences"] = [x for x in p["preferences"] if (x["kind"], x.get("activity")) not in drop] + list(add)
    p["adjustments"] = list(adjustments)
    if sleep:
        p["sleep"] = sleep
    return canonical(p)


def blocks(plan, n=0, task=None):
    cal = plan["calendars"][plan["picks"][n]["index"]]
    return [b for b in cal["blocks"] if task is None or b["task"] == task]


def study(plan, n=0):
    return [b for b in blocks(plan, n) if not b["task"].startswith("r")]


def ex_gym():
    """The advisor's example: survey says morning gym, the log says evenings."""
    observed = with_prefs(BASE_SURVEY, drop=[("activity_window", "exercise")], add=[pref(
        "activity_window", "gym logged 9 of the last 11 times between 17:30 and 19:05", activity="exercise",
        direction="prefer", days="all", start="17:00", end="19:30", overrides="survey routine when=early_morning")])
    return BASE_WEEK, BASE_SURVEY, [
        ("survey only", baseline.from_survey(BASE_SURVEY),
         lambda p: all(tmin(b["end"]) <= tmin("10:00") for b in blocks(p, task="r1")),
         "every gym session ends by 10:00"),
        ("observed evening gym", observed,
         lambda p: all(tmin("17:00") <= tmin(b["start"]) and tmin(b["end"]) <= tmin("19:30") for b in blocks(p, task="r1")),
         "every gym session is inside 17:00-19:30"),
    ]


def ex_sleep():
    """Early bird vs night owl: bedtime moves the whole productive day."""
    survey = {**BASE_SURVEY, "wake_time": None, "routines": []}
    early = with_prefs(survey, sleep={"evidence": "in bed by 22:30 on 6 of 7 nights", "bedtime": "22:30",
                                      "source": "observed", "confidence": "high"})
    owl = with_prefs(survey, drop=[("activity_window", "study")], sleep={
        "evidence": "in bed around 01:00 most nights", "bedtime": "01:00", "source": "observed", "confidence": "high"},
        add=[pref("activity_window", "most study sessions start after 20:00", activity="study", direction="prefer",
                  days="all", start="20:00", end="23:59")])
    return BASE_WEEK, survey, [
        ("bed 22:30", early, lambda p: all(tmin(b["end"]) <= tmin("21:30") for b in blocks(p)),
         "nothing ends after 21:30 (bedtime minus the 60-minute wind-down)"),
        ("bed 01:00, studies late", owl, lambda p: all(tmin(b["start"]) >= tmin("20:00") for b in study(p)),
         "all study starts at 20:00 or later"),
    ]


def ex_sleep_clamp():
    """A preference can't break the sleep rule: 03:00 with 8 hours is pulled back to 01:00."""
    survey = {**BASE_SURVEY, "routines": []}
    late = with_prefs(survey, sleep={"evidence": "in bed around 03:00", "bedtime": "03:00", "source": "observed",
                                     "confidence": "high"})
    return BASE_WEEK, survey, [
        ("bed 03:00 asked", late, lambda p: p["inp"]["sleep"]["moved"] and p["inp"]["available"]["end"] == "23:59"
         and p["inp"]["available"]["start"] == "09:45",
         "bedtime clamped to 01:00: productive hours 09:45-23:59"),
    ]


def ex_protect():
    """Friday and Saturday evenings stay free, even with work due Sunday."""
    week = copy.deepcopy(BASE_WEEK)
    week["tasks"].append({"id": "t3", "title": "Essay draft", "type": "homework", "priority": "high",
                          "due": "2026-09-27T23:59", "minutes": 240})
    survey = {**BASE_SURVEY, "routines": [], "focus_time": "evening"}
    protect = with_prefs(survey, add=[pref("protect_time", "planned study on Fri/Sat evenings was skipped 5 of 6 "
                                           "times; dinner with friends logged 4 times", days=["fri", "sat"],
                                           start="18:00", end="23:59")])

    def free(p):
        for n in range(len(p["picks"])):
            for b in blocks(p, n):
                if b["date"] in ("2026-09-25", "2026-09-26") and tmin(b["end"]) > tmin("18:00"):
                    return False
        return True
    return week, survey, [
        ("survey only (control)", baseline.from_survey(survey), lambda p: not free(p),
         "without the preference, some option uses Fri/Sat evenings"),
        ("protect Fri/Sat evenings", protect, free, "no option has anything Fri/Sat after 18:00"),
    ]


def ex_avoid_mornings():
    survey = {**BASE_SURVEY, "routines": [], "focus_time": "morning"}
    avoid = with_prefs(survey, drop=[("activity_window", "study")], add=[pref(
        "activity_window", "note: 'cant do mornings anymore lol'; 4 of 5 morning blocks moved to afternoon",
        source="both", activity="study", direction="avoid", days="all", start="07:00", end="12:00",
        overrides="survey focus_time=morning")])
    return BASE_WEEK, survey, [
        ("survey: morning", baseline.from_survey(survey),
         lambda p: all(tmin(b["start"]) < tmin("12:00") for b in study(p)), "all study starts before 12:00"),
        ("avoid mornings", avoid, lambda p: all(tmin(b["start"]) >= tmin("12:00") for b in study(p)),
         "no study starts before 12:00"),
    ]


def ex_estimate():
    survey = {**BASE_SURVEY, "routines": []}
    stretched = with_prefs(survey, adjustments=[{
        "kind": "estimate_multiplier", "evidence": "last 4 homework tasks took 1.4-1.6x the estimate",
        "task_type": "homework", "factor": 1.5, "source": "observed", "confidence": "high"}])
    return BASE_WEEK, survey, [
        ("survey only (control)", baseline.from_survey(survey),
         lambda p: sum(tmin(b["end"]) - tmin(b["start"]) for b in blocks(p, task="t2")) == 90,
         "without the adjustment, Problem set 2 gets its estimated 90 minutes"),
        ("homework x1.5", stretched,
         lambda p: sum(tmin(b["end"]) - tmin(b["start"]) for b in blocks(p, task="t2")) == 135,
         "Problem set 2 gets 135 minutes (90 x 1.5)"),
    ]


def ex_daily_load():
    week = copy.deepcopy(BASE_WEEK)
    for i, (title, due, m) in enumerate([("Lab report", "2026-09-26T23:59", 180), ("Reading", "2026-09-27T23:59", 180)]):
        week["tasks"].append({"id": f"t{i + 3}", "title": title, "type": "homework", "priority": "medium",
                              "due": due, "minutes": m})
    survey = {**BASE_SURVEY, "routines": []}
    capped = with_prefs(survey, add=[pref("daily_load", "on the 3 days with 3h+ of study, the last session was "
                                          "skipped (too tired)", max_minutes=120)])

    def most(p):
        per = {}
        for b in study(p):
            per[b["date"]] = per.get(b["date"], 0) + tmin(b["end"]) - tmin(b["start"])
        return max(per.values())
    return week, survey, [
        ("survey only (control)", baseline.from_survey(survey), lambda p: most(p) > 120,
         "without the preference, some day has more than 120 minutes"),
        ("max 120 min a day", capped, lambda p: most(p) <= 120, "no day has more than 120 minutes"),
    ]


EXAMPLES = {"gym": ex_gym, "sleep": ex_sleep, "sleep_clamp": ex_sleep_clamp, "protect": ex_protect,
            "avoid_mornings": ex_avoid_mornings, "estimate": ex_estimate, "daily_load": ex_daily_load}


def main():
    out = HERE / "outputs" / "examples"
    out.mkdir(parents=True, exist_ok=True)
    failed = 0
    for name, make in EXAMPLES.items():
        if len(sys.argv) > 1 and name not in sys.argv[1:]:
            continue
        week, survey, cases = make()
        for label, prefs, check, expect in cases:
            started = time.perf_counter()
            plan = schedule.plan_week(week, survey, prefs, limit=100)
            ok = check(plan)
            failed += not ok
            print(f"{'PASS' if ok else 'FAIL'}  {name} / {label}: {expect}  ({time.perf_counter() - started:.1f}s)")
            print(f"      #1: {plan['picks'][0]['why']}")
            slug = f"{name}__{label.replace(' ', '_').replace('/', '-').replace(':', '').replace(',', '')}"
            (out / f"{slug}.html").write_text(schedule.report(f"{name}: {label}", plan, prefs))
    print(f"\n{'All passed' if not failed else f'{failed} failed'}. Reports in {out.resolve()}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
