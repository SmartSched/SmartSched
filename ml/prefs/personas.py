"""Synthetic users for training and testing the preference reader.

Each persona has a hidden truth (when they really study, sleep, exercise, how much they can take in a
day, ...), a survey that may disagree with it, and up to 21 days of messy history simulated from it:
planned study blocks that get moved, skipped or cut short, gym sessions under a dozen different
names, social plans, errands, reflections with bed and wake times, finished tasks with estimated
vs. actual time, and which option they chose from past schedules.

Three JSONs come out of every persona:
- label(): what a careful reader can infer from the history and survey, by the fixed rules in
  system_prompt.txt. This is the training target. It only claims what the data supports: 2 gym logs
  give nothing, 5 give a window, and a stated answer the log contradicts gets overridden.
- oracle(): the hidden truth itself. evaluate.py judges calendars against it, so we can say how much
  a better reading of the data improves the actual week.
- baseline.from_survey(): the survey alone (in baseline.py).

render() writes the history the way the model sees it (the "context bundle"). Messiness is on purpose:
too little data, noise, survey answers that disagree with behaviour, a switch in habits two weeks ago,
a cram night before an exam that shouldn't count as a preference, inconsistent labels, irrelevant
entries, missing reflections, free-text notes with slang, and plans ("want to start ...") that aren't
preferences yet.
"""

import random
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from statistics import median

import baseline
from schema import (CALENDAR_STYLES, DAY_NAMES, FOCUS, ROUTINE_WHEN, SESSIONS, STYLES, canonical, hhmm, tmin)

DAY = 24 * 60
FIRST_TODAY = date(2026, 10, 5)  # a Monday after the eval week; each persona's "today" is a Monday after it
STYLE_TEXT = {"front_loaded": "front-loaded", "even": "evenly spread", "spaced": "spaced out",
              "clustered": "grouped into long stretches"}
TEXT_STYLE = {v: k for k, v in STYLE_TEXT.items()}
NOTE_WINDOWS = {"mornings": ("06:00", "10:00"), "late": ("21:00", "24:00")}
FRIENDS, FAMILY = baseline.FRIENDS, baseline.FAMILY

EXERCISE_LABELS = ["gym", "Gym", "GYM", "lift", "lifting", "workout", "run", "gym w/ sam", "leg day", "push day",
                   "swim", "climbing gym", "gym 💪", "cardio", "pilates", "yoga class", "5k run", "spin class"]
FRIEND_LABELS = ["dinner w/ friends", "movie night", "party at jess's", "bowling", "hangout", "game night",
                 "drinks w/ roommates", "concert"]
FAMILY_LABELS = ["family lunch", "call w/ mom", "visiting grandma", "family dinner", "brunch w/ parents"]
CLUB_LABELS = ["club meeting", "choir rehearsal", "robotics club", "ultimate practice", "improv club"]
ERRANDS = ["laundry", "groceries", "dentist", "errands", "haircut", "nap", "meal prep", "call bank", "pharmacy",
           "clean room", "post office", "doctor appt"]
COURSES = ["CSC 101", "MATH 220", "BIO 150", "HIST 210", "ECON 101", "PHYS 201", "ENG 110", "PSY 100", "CHEM 121"]
TASK_NAMES = {"homework": ["PSET {n}", "Lab {n} writeup", "Essay {n}", "HW {n}", "Worksheet {n}", "Response paper {n}"],
              "project": ["Project milestone {n}", "Group project part {n}", "Final project draft {n}"],
              "study": ["Ch {n} reading", "Reading week {n}", "Flashcards set {n}", "Lecture {n} notes"],
              "exam": ["Midterm {n}", "Quiz {n}", "Exam {n}"]}

NOTES = {
    "avoid_mornings": ["cant do mornings anymore lol", "mornings are NOT my thing", "8am me is useless tbh",
                       "i'm basically dead before 10am", "pls no studying first thing in the morning"],
    "avoid_late": ["i crash hard after 9pm", "no brain after dinner honestly", "cant focus late at night at all",
                   "past 9 i'm useless"],
    "friends": ["fridays + saturdays are for friends", "weekend nights = social life, dont touch pls",
                "fri/sat nights i'm out w friends"],
    "family": ["sunday is family day", "sundays i'm with my family, no work"],
    "irrelevant": ["trying to drink more water", "my roommate is so loud lol", "need to call the bank at some point",
                   "new laptop finally!!", "the library wifi is terrible"],
    "aspirational": ["want to start waking up at 6am", "trying to get into running in the mornings",
                     "i should really study more in the mornings", "hoping to go to bed earlier this month"],
}


def floor_to(m, step):
    return m // step * step


def ceil_to(m, step):
    return -(-m // step) * step


def overlap(s, e, lo, hi):
    return max(0, min(e, hi) - max(s, lo))


def bucket(window, table):
    """The key in table whose window overlaps this one the most."""
    lo, hi = tmin(window[0]), tmin(window[1])
    return max(table, key=lambda k: overlap(lo, hi, tmin(table[k][0]), tmin(table[k][1])))


def _other(rng, options, avoid):
    return rng.choice([o for o in options if o != avoid])


# ---- the hidden truth and the survey ----

def make_persona(rng, spec=None):
    """spec forces parts of the persona, for the hand-picked hard cases in the test set (see make_data.py)."""
    spec = spec or {}
    truth = {}
    truth["sleep_hours"] = rng.choice([7, 7.5, 8, 8, 8.5, 9])
    truth["bedtime"] = spec.get("bedtime", rng.choice(range(tmin("22:00"), tmin("25:30"), 30)))
    wake = truth["bedtime"] + int(truth["sleep_hours"] * 60) - DAY
    avail = (ceil_to(wake + 45, 15), min(DAY, truth["bedtime"] - 60))
    truth["available"] = avail

    starts = [s for s in range(tmin("07:00"), tmin("22:00"), 60) if s >= avail[0] and s + 180 <= avail[1]]
    weights = [3 if tmin("12:00") <= s <= tmin("19:00") else 1 for s in starts]
    peak = spec.get("peak") or rng.choices(starts, weights)[0]
    truth["study_peak"] = (peak, peak + 180)

    truth["study_avoid"] = None
    if spec.get("avoid", rng.random() < 0.35):
        options = [k for k, (lo, hi) in NOTE_WINDOWS.items() if not overlap(peak, peak + 180, tmin(lo), tmin(hi))
                   and overlap(avail[0], avail[1], tmin(lo), tmin(hi)) >= 90]
        if options:
            truth["study_avoid"] = rng.choice(options)

    truth["exercise"] = None
    if spec.get("exercise", rng.random() < 0.6):
        minutes = rng.choice([45, 60, 60, 90])
        starts = [s for s in range(tmin("06:30"), tmin("21:00"), 30) if s >= avail[0] and s + minutes <= avail[1]]
        start = rng.choice(starts)
        old = None
        far = [s for s in starts if abs(s - start) >= 180]
        if far and spec.get("drift", rng.random() < 0.25):
            old = rng.choice(far)
        truth["exercise"] = {"times": rng.choice([2, 3, 3, 4, 5]), "minutes": minutes, "start": start, "old_start": old,
                             "days": "weekdays" if rng.random() < 0.3 else "all",
                             "label": rng.choice(["Gym", "Workout", "Run", "Swim", "Climbing", "Yoga"])}

    truth["session_ideal"] = rng.choices([25, 45, 60, 90], [1, 3, 3, 2])[0]
    truth["daily_max"] = spec.get("daily_max", rng.choice([90, 120, 150, 180]) if rng.random() < 0.35 else None)
    truth["min_gap"] = spec.get("min_gap", rng.choice([15, 30]) if rng.random() < 0.3 else None)
    protect = spec.get("protect")
    if protect is None:
        protect = [k for k, p in (("friends", 0.3), ("family", 0.15), ("club", 0.1)) if rng.random() < p]
    truth["protect"] = []
    for kind in protect:
        if kind == "friends":
            truth["protect"].append({"kind": kind, "days": ["fri", "sat"], "start": rng.choice([17, 18, 19]) * 60,
                                     "end": DAY - 1})
        elif kind == "family":
            truth["protect"].append({"kind": kind, "days": ["sun"], "start": rng.choice([10, 11]) * 60,
                                     "end": rng.choice([16, 17, 18]) * 60})
        else:
            truth["protect"].append({"kind": kind, "days": [rng.choice(DAY_NAMES[:4])], "start": 18 * 60,
                                     "end": 21 * 60})
    truth["deadline_hours"] = rng.choice([0, 24, 48])
    truth["distribution"] = rng.choice(STYLES)
    truth["estimate"] = {}
    if rng.random() < 0.5:
        truth["estimate"][rng.choice(["homework", "project", "study"])] = rng.choice([1.3, 1.4, 1.5, 1.6, 1.8])
    if rng.random() < 0.1:
        rest = [t for t in ("homework", "project", "study") if t not in truth["estimate"]]
        truth["estimate"][rng.choice(rest)] = 0.7

    survey = make_survey(rng, truth, spec)
    return truth, survey


def make_survey(rng, truth, spec):
    peak = truth["study_peak"]
    true_focus = bucket((hhmm(peak[0]), hhmm(peak[1])), FOCUS)
    wrong = spec.get("focus_wrong", rng.random() < 0.35)
    focus = _other(rng, list(FOCUS), true_focus) if wrong else true_focus
    true_session = min(SESSIONS, key=lambda k: abs(SESSIONS[k] - truth["session_ideal"]))
    session = true_session if rng.random() < 0.65 else _other(rng, list(SESSIONS), true_session)
    deadline = {48: "steady", 24: "day_before", 0: "night_before"}[truth["deadline_hours"]]
    if rng.random() >= 0.65:
        deadline = _other(rng, ["steady", "day_before", "night_before", "depends"], deadline)
    style = {v: k for k, v in CALENDAR_STYLES.items()}[truth["distribution"]]
    if rng.random() >= 0.6:
        style = _other(rng, list(CALENDAR_STYLES), style)

    musts = []
    if rng.random() < 0.5:
        musts.append("sleep")
    if rng.random() < 0.3:
        musts.append("meals")
    ex = truth["exercise"]
    if ex and rng.random() < 0.7:
        musts.append("exercise")
    kinds = {p["kind"] for p in truth["protect"]}
    if "friends" in kinds and rng.random() < 0.75:
        musts.append("friends")
    if "family" in kinds and rng.random() < 0.75:
        musts.append("family")
    if rng.random() < 0.15:
        musts.append("hobby")

    survey = {"commitments": {}, "focus_time": focus, "work_session": session, "non_negotiables": musts,
              "deadline_style": deadline, "calendar_style": style, "sleep_hours": truth["sleep_hours"],
              "wake_time": None, "routines": [], "notes": ""}
    if rng.random() < 0.55:
        wake = truth["bedtime"] + int(truth["sleep_hours"] * 60) - DAY
        if rng.random() < 0.3:
            wake += rng.choice([-120, -90, 90, 120])  # people misreport
        survey["wake_time"] = hhmm(floor_to(wake, 15))
    if ex:
        start = ex["old_start"] if ex["old_start"] is not None and rng.random() < 0.6 else ex["start"]
        true_when = bucket((hhmm(start), hhmm(start + ex["minutes"])), ROUTINE_WHEN)
        roll = rng.random()
        if spec.get("exercise_when_wrong"):
            roll = 0.6
        when = true_when if roll < 0.5 else _other(rng, list(ROUTINE_WHEN), true_when) if roll < 0.8 else None
        survey["routines"] = [{"activity": "exercise", "label": ex["label"], "times": ex["times"],
                               "minutes": ex["minutes"], "when": when}]
    return survey


# ---- the messy history ----

def class_schedule(rng, truth):
    """Weekly classes as (weekday, start, end, label), plus sometimes work shifts."""
    out = []
    for label in rng.sample(COURSES, rng.randint(2, 4)):
        pattern, length = rng.choice([((0, 2, 4), 50), ((1, 3), 75), ((0, 2), 75)])
        s = rng.randrange(8 * 60, 17 * 60, 30)
        if all(not any(w == d and s < e2 and s2 < s + length for d, s2, e2, _, _ in out) for w in pattern):
            out += [(w, s, s + length, label, "class") for w in pattern]
    if rng.random() < 0.25:
        for w in rng.sample(range(7), rng.randint(2, 3)):
            s = rng.randrange(10 * 60, 18 * 60, 60)
            if not any(d == w and s < e2 and s2 < s + 240 for d, s2, e2, _, _ in out):
                out.append((w, s, min(s + 240, 22 * 60), "Shift", "work"))
    return out


def _free(busy, s, e):
    return all(not (s < e2 and s2 < e) for s2, e2 in busy)


def _place_in(rng, busy, lo, hi, length, tries=8):
    for _ in range(tries):
        if hi - length < lo:
            return None
        s = rng.randrange(lo, hi - length + 1, 5)
        if _free(busy, s, s + length):
            return s
    return None


def simulate(rng, truth, survey, spec=None):
    spec = spec or {}
    n_days = spec.get("n_days", rng.choices([0, 3, 7, 14, 21], [8, 12, 20, 25, 35])[0])
    noise = spec.get("noise", rng.uniform(0.03, 0.22))
    crunch_on = spec.get("crunch", rng.random() < 0.35)
    today = FIRST_TODAY + timedelta(weeks=rng.randrange(0, 30))
    days = [today - timedelta(days=n_days - i) for i in range(n_days)]
    classes = class_schedule(rng, truth)
    avail = truth["available"]
    peak_lo, peak_hi = truth["study_peak"]
    avoid = NOTE_WINDOWS.get(truth["study_avoid"])
    ex = truth["exercise"]
    stated_session = SESSIONS.get(survey["work_session"], 45)
    stated_focus = FOCUS.get(survey["focus_time"], ("12:00", "17:00"))

    # Finished tasks, with due dates inside the history.
    tasks = []
    counter = Counter()
    for _ in range(round(n_days * rng.uniform(0.35, 0.6))):
        kind = rng.choices(["homework", "project", "study", "exam"], [5, 2, 3, 1])[0]
        counter[kind] += 1
        title = rng.choice(TASK_NAMES[kind]).format(n=counter[kind] + rng.randint(1, 6))
        due_day = rng.choice(days[1:]) if len(days) > 1 else days[0]
        due = datetime.combine(due_day, datetime.min.time()) + timedelta(
            minutes=tmin("23:59") if kind != "exam" else rng.choice([600, 780, 840]))
        est = rng.randrange(30, 241, 15)
        spent = round(est * truth["estimate"].get(kind, 1.0) * rng.uniform(0.92, 1.08) / 5) * 5
        if truth["deadline_hours"]:
            before = truth["deadline_hours"] + rng.gauss(0, 5)
        else:
            before = rng.uniform(0.5, 6)
        if rng.random() < noise:
            before = rng.uniform(-6, 72)
        done = due - timedelta(hours=before)
        done = done.replace(minute=done.minute // 5 * 5, second=0, microsecond=0)
        tasks.append({"title": title, "type": kind, "est": est, "spent": spent, "due": due, "done": done})
    if crunch_on and len(days) > 2 and not any(t["type"] == "exam" for t in tasks):
        due = datetime.combine(rng.choice(days[2:]), datetime.min.time()) + timedelta(minutes=600)
        tasks.append({"title": f"Midterm {rng.randint(1, 3)}", "type": "exam", "est": 120, "spent": 150, "due": due,
                      "done": due - timedelta(hours=1)})
    exam_days = {t["due"].date() - timedelta(days=1) for t in tasks if t["type"] == "exam"}
    titles = [t["title"] for t in tasks if t["type"] != "exam"] or ["Reading", "PSET", "Essay"]

    # Exercise days, week by week.
    ex_days = set()
    if ex:
        allowed = [d for d in days if ex["days"] == "all" or d.weekday() < 5]
        by_week = defaultdict(list)
        for d in allowed:
            by_week[d.isocalendar()[1]].append(d)
        for week in by_week.values():
            ex_days.update(rng.sample(week, min(len(week), max(1, round(ex["times"] * len(week) / 7)))))

    log = []
    reflections = {}
    tired_yesterday = False
    for i, d in enumerate(days):
        ago = n_days - i
        busy = [(s, e) for w, s, e, _, _ in classes if w == d.weekday()]
        events = [{"s": s, "e": e, "cat": kind, "label": label} for w, s, e, label, kind in classes if w == d.weekday()]

        if d in ex_days:
            start = ex["old_start"] if ex["old_start"] is not None and ago > 10 else ex["start"]
            start = floor_to(start + round(rng.gauss(0, 18)), 5)
            if rng.random() < noise:
                start = rng.randrange(avail[0], max(avail[0] + 1, avail[1] - ex["minutes"]), 15)
            length = ex["minutes"] + rng.choice([-10, -5, 0, 0, 5, 10])
            # A class in the way pushes the session a little earlier or later, not off the day.
            start = next((start + shift for shift in (0, 30, -30, 60, -60, 90, -90)
                          if avail[0] <= start + shift and start + shift + length <= avail[1]
                          and _free(busy, start + shift, start + shift + length)), None)
            if start is not None:
                busy.append((start, start + length))
                events.append({"s": start, "e": start + length, "cat": "exercise", "label": rng.choice(EXERCISE_LABELS)})

        for p in truth["protect"]:
            if DAY_NAMES[d.weekday()] in p["days"] and rng.random() < 0.75:
                labels = {"friends": FRIEND_LABELS, "family": FAMILY_LABELS, "club": CLUB_LABELS}[p["kind"]]
                length = rng.choice([90, 120, 150, 180]) if p["kind"] != "club" else 120
                s = _place_in(rng, busy, p["start"], min(p["end"], avail[1]), min(length, p["end"] - p["start"]))
                if s is not None:
                    e = s + min(length, p["end"] - p["start"])
                    busy.append((s, e))
                    events.append({"s": s, "e": e, "cat": "social", "label": rng.choice(labels)})
        if rng.random() < noise / 3:
            s = _place_in(rng, busy, 12 * 60, 22 * 60, 120)
            if s is not None:
                busy.append((s, s + 120))
                events.append({"s": s, "e": s + 120, "cat": "social", "label": rng.choice(FRIEND_LABELS)})
        if rng.random() < 0.4:
            s = _place_in(rng, busy, 9 * 60, 21 * 60, 60)
            if s is not None:
                length = rng.choice([30, 45, 60])
                busy.append((s, s + length))
                events.append({"s": s, "e": s + length, "cat": "errand", "label": rng.choice(ERRANDS)})

        # Study the old app planned (from the survey, not the truth), and what really happened. It knew
        # nothing about limits: on busy weeks it stacked 3-4 blocks a day, often right after a class or
        # another block.
        planned = []
        count = rng.choice([1, 2, 2, 3]) if d.weekday() < 5 else rng.choice([0, 1, 2])
        if rng.random() < 0.4:
            count += 2
        for _ in range(count):
            lo, hi = ((tmin(stated_focus[0]), tmin(stated_focus[1])) if rng.random() < 0.5
                      else (8 * 60, 22 * 60))
            s = None
            if rng.random() < 0.35:
                after = [e for _, e in busy + planned if 8 * 60 <= e <= 22 * 60 and _free(busy + planned, e, e + stated_session)]
                s = rng.choice(after) if after else None
            if s is None:
                s = _place_in(rng, busy + planned, max(lo, 8 * 60), min(hi, 23 * 60), stated_session)
            if s is not None:
                planned.append((s, s + stated_session))
        planned.sort()
        done_minutes = 0
        tired_today = False
        for ps, pe in planned:
            ev = {"cat": "study", "label": rng.choice(titles), "planned": (ps, pe), "s": ps, "e": pe}
            in_protect = any(DAY_NAMES[d.weekday()] in p["days"] and overlap(ps, pe, p["start"], p["end"])
                             for p in truth["protect"])
            in_avoid = avoid and overlap(ps, pe, tmin(avoid[0]), tmin(avoid[1])) * 2 >= pe - ps
            outside = not overlap(ps, pe, peak_lo, peak_hi)
            if truth["daily_max"] and done_minutes >= truth["daily_max"] and rng.random() < 0.9:
                outcome = "tired"
            elif in_protect and rng.random() < 0.85:
                outcome = rng.choice(["skipped", "moved"])
            elif in_avoid and rng.random() < 0.8:
                outcome = "moved" if rng.random() < 0.7 else "skipped"
            elif outside and rng.random() < 0.5:
                outcome = "moved"
            else:
                outcome = "done"
            if rng.random() < noise:
                outcome = rng.choice(["done", "skipped", "moved"])
            others = [(x["s"], x["e"]) for x in events if x.get("outcome") not in ("skipped", "tired")]
            if outcome == "moved":
                length = pe - ps
                s = _place_in(rng, others, peak_lo, min(peak_hi, avail[1]), length)
                if s is None:
                    outcome = "skipped"
                else:
                    ev["s"], ev["e"] = s, s + length
            if outcome in ("done", "moved"):
                ends = [e for _, e in others]
                if truth["min_gap"] and any(0 <= ev["s"] - e < 5 for e in ends) and rng.random() < 0.85:
                    late = truth["min_gap"] + rng.choice([-5, 0, 0, 5])
                    ev["s"] += late
                    ev["late"] = late
                if ev["e"] - ev["s"] > truth["session_ideal"] + 10 and rng.random() < 0.8:
                    stop = max(15, truth["session_ideal"] + rng.choice([-5, 0, 0, 5]))
                    ev["e"] = ev["s"] + stop
                    ev["stopped"] = stop
                elif ev["e"] - ev["s"] < truth["session_ideal"] - 15 and rng.random() < 0.6:
                    more = truth["session_ideal"] - (ev["e"] - ev["s"]) + rng.choice([-5, 0, 0, 5])
                    if _free([x for x in others if x != (ev["s"], ev["e"])], ev["e"], ev["e"] + more):
                        ev["e"] += more
                        ev["extended"] = more
                done_minutes += ev["e"] - ev["s"]
            if outcome == "tired":
                tired_today = True
            ev["outcome"] = outcome
            events.append(ev)

        if rng.random() < 0.5:
            length = max(20, truth["session_ideal"] + rng.choice([-10, -5, 0, 5, 10]))
            s = _place_in(rng, [(x["s"], x["e"]) for x in events if x.get("outcome") not in ("skipped", "tired")],
                          peak_lo, min(peak_hi, avail[1]), length)
            if s is not None:
                events.append({"s": s, "e": s + length, "cat": "study", "label": rng.choice(titles)})
                done_minutes += length

        crunch = crunch_on and d in exam_days
        if crunch:
            exam = next(t for t in tasks if t["type"] == "exam" and t["due"].date() - timedelta(days=1) == d)
            events.append({"s": tmin("22:30"), "e": DAY + rng.choice([60, 90, 120]), "cat": "study",
                           "label": f"cram {exam['title']}"})

        if rng.random() > spec.get("missing", 0.25):
            bed = truth["bedtime"] + round(rng.gauss(0, 20)) + (30 if d.weekday() >= 4 else 0)
            if crunch:
                bed = DAY + tmin("02:30")
            up = bed + int(truth["sleep_hours"] * 60) + round(rng.gauss(0, 20)) - DAY
            r = {"productivity": rng.randint(2, 5), "mood": rng.randint(2, 5),
                 "energy": rng.randint(1, 2) if tired_yesterday else rng.randint(3, 5),
                 "sleep": 1 if crunch else max(1, min(5, 4 - abs(bed - truth["bedtime"]) // 45 + rng.randint(0, 1)))}
            if rng.random() < 0.8:
                r["bed"], r["up"] = floor_to(bed, 5), floor_to(up, 5)
            reflections[d] = r
        tired_yesterday = tired_today
        events.sort(key=lambda x: x["s"])
        log.append({"date": d, "ago": ago, "events": events, "crunch": crunch})

    picks = []
    for w in range(n_days // 7):
        shown = rng.sample(STYLES, 3)
        if truth["distribution"] not in shown and rng.random() < 0.85:
            shown[rng.randrange(3)] = truth["distribution"]
        chosen = truth["distribution"] if truth["distribution"] in shown and rng.random() < 0.8 else rng.choice(shown)
        picks.append({"date": today - timedelta(days=7 * (n_days // 7 - w)), "shown": shown, "chosen": chosen})

    notes = []
    if truth["study_avoid"] and rng.random() < 0.45:
        notes.append(("avoid_" + truth["study_avoid"], rng.choice(NOTES["avoid_" + truth["study_avoid"]])))
    for p in truth["protect"]:
        if p["kind"] in ("friends", "family") and rng.random() < 0.35:
            notes.append((p["kind"], rng.choice(NOTES[p["kind"]])))
    if rng.random() < 0.3:
        notes.append(("irrelevant", rng.choice(NOTES["irrelevant"])))
    if spec.get("aspirational", rng.random() < 0.15):
        notes.append(("aspirational", rng.choice(NOTES["aspirational"])))
    rng.shuffle(notes)
    survey["notes"] = ". ".join(text for _, text in notes)

    return {"today": today, "n_days": n_days, "noise": round(noise, 2), "classes": classes, "log": log,
            "reflections": reflections, "tasks": tasks, "picks": picks, "notes": notes}


# ---- what the model reads ----

def _t(m):
    return hhmm(m % DAY)


def _event_line(ev):
    kind = {"class": "class", "work": "work", "study": "study"}.get(ev["cat"], "personal")
    line = f"  {_t(ev['s'])}-{_t(ev['e'])} {kind} \"{ev['label']}\""
    if "planned" not in ev:
        return line
    ps, pe = ev["planned"]
    plan = f"{_t(ps)}-{_t(pe)}"
    if ev["outcome"] in ("skipped", "tired"):
        why = "skipped: too tired" if ev["outcome"] == "tired" else "skipped"
        return f"  {plan} study \"{ev['label']}\" (planned, {why})"
    notes = []
    if ev["outcome"] == "moved":
        notes.append(f"planned {plan}, moved")
    else:
        notes.append("planned" if (ps, pe) == (ev["s"], ev["e"]) else f"planned {plan}")
    if ev.get("late"):
        notes.append(f"started {ev['late']}m late")
    if ev.get("stopped"):
        notes.append(f"stopped after {ev['stopped']}m")
    if ev.get("extended"):
        notes.append(f"kept going {ev['extended']}m longer")
    if (ps, pe) == (ev["s"], ev["e"]) and ev["outcome"] == "done":
        notes = ["planned, done"]
    return line + f" ({', '.join(notes)})"


def survey_line(survey):
    parts = [f"sleep_hours={survey.get('sleep_hours')}", f"wake_time={survey.get('wake_time') or 'not given'}",
             f"focus_time={survey.get('focus_time')}", f"work_session={survey.get('work_session')}",
             f"deadline_style={survey.get('deadline_style')}", f"calendar_style={survey.get('calendar_style')}",
             f"non_negotiables=[{', '.join(survey.get('non_negotiables', []))}]"]
    for r in survey.get("routines", []):
        parts.append(f"routine={r['activity']} \"{r['label']}\" {r['times']}x{r['minutes']}m when={r['when'] or 'not given'}")
    return "SURVEY: " + ", ".join(parts)


def render(survey, history):
    today = history["today"]
    lines = [f"TODAY: {today.isoformat()} {today.strftime('%a')}", survey_line(survey),
             f"NOTES: {survey['notes']}" if survey.get("notes") else "NOTES: none",
             f"LOG ({history['n_days']} days):" if history["n_days"] else "LOG: nothing logged yet"]
    for day in history["log"]:
        lines.append(f"{day['date'].strftime('%m-%d %a')} ({day['ago']}d ago)")
        for ev in day["events"]:
            lines.append(_event_line(ev))
        r = history["reflections"].get(day["date"])
        if r:
            sleep = f"; bed {_t(r['bed'])}, up {_t(r['up'])}" if "bed" in r else ""
            lines.append(f"  reflection: productivity {r['productivity']}, mood {r['mood']}, energy {r['energy']}, "
                         f"sleep {r['sleep']}{sleep}")
    if history["tasks"]:
        lines.append("TASKS DONE:")
        for t in sorted(history["tasks"], key=lambda t: t["due"]):
            lines.append(f"  \"{t['title']}\" {t['type']}: est {t['est']}m, spent {t['spent']}m, "
                         f"due {t['due'].strftime('%m-%d %H:%M')}, done {t['done'].strftime('%m-%d %H:%M')}")
    if history["picks"]:
        lines.append("PAST PICKS:")
        for p in history["picks"]:
            shown = " | ".join(STYLE_TEXT[s] for s in p["shown"])
            lines.append(f"  {p['date'].strftime('%m-%d')}: options [{shown}] -> chose \"{STYLE_TEXT[p['chosen']]}\"")
    return "\n".join(lines)


# ---- the label: what the data supports ----

def best_window(spans, width, lo=300, hi=DAY):
    """The width-minute window (on a 30-minute grid) holding the most span midpoints, tightened to the
    spans inside it and rounded out to 30 minutes. Returns (count, start, end)."""
    best = (0, None)
    for s in range(lo, hi - width + 1, 30):
        n = sum(1 for a, b in spans if s <= (a + b) / 2 < s + width)
        if n > best[0]:
            best = (n, s)
    if not best[0]:
        return 0, None, None
    inside = [(a, b) for a, b in spans if best[1] <= (a + b) / 2 < best[1] + width]
    return best[0], floor_to(min(a for a, _ in inside), 30), min(DAY, ceil_to(max(b for _, b in inside), 30))


def _w(lo, hi):
    return hhmm(lo), hhmm(hi) if hi < DAY else "24:00"


def item(kind, evidence, source, strength, confidence, overrides=None, **fields):
    out = {"kind": kind, "evidence": evidence, **fields, "source": source, "strength": strength,
           "confidence": confidence}
    if overrides:
        out["overrides"] = overrides
    return out


def _agree(a, b, need=60):
    return overlap(tmin(a[0]), tmin(a[1]), tmin(b[0]), tmin(b[1])) >= need


def label(survey, history):
    """The rules, in the order system_prompt.txt states them."""
    stated = {(p["kind"], p.get("activity"), p.get("direction")): p for p in baseline.from_survey(survey)["preferences"]}
    musts = set(survey.get("non_negotiables", []))
    note_kinds = {k for k, _ in history["notes"]}
    log = history["log"]
    recent = [day for day in log if day["ago"] <= 14]
    out = {"preferences": [], "adjustments": []}
    prefs = out["preferences"]

    # The day before an exam is cram time, not a preference: its study and its bedtime don't count.
    eves = {t["due"].date() - timedelta(days=1) for t in history["tasks"] if t["type"] == "exam"}

    def pairs(days, cat):
        return [(day, ev) for day in days for ev in day["events"]
                if ev["cat"] == cat and not (cat == "study" and day["date"] in eves)]

    def events(days, cat):
        return [ev for _, ev in pairs(days, cat)]

    # Sleep
    beds = [r["bed"] for d, r in history["reflections"].items() if "bed" in r and d not in eves]
    stated_bed = baseline.stated_bedtime(survey)
    if len(beds) >= 4:
        bed = floor_to(round(median(b if b >= 12 * 60 else b + DAY for b in beds)) + 15, 30)
        text = f"median bedtime {_t(bed)} over {len(beds)} nights"
        if stated_bed and abs(bed - (tmin(stated_bed) + (DAY if tmin(stated_bed) < 720 else 0))) <= 60:
            out["sleep"] = {"evidence": text + f"; survey wake {survey['wake_time']} agrees", "bedtime": _t(bed),
                            "source": "both", "confidence": "high"}
        else:
            out["sleep"] = {"evidence": text, "bedtime": _t(bed), "source": "observed",
                            "confidence": "high" if len(beds) >= 7 else "medium"}
            if stated_bed:
                out["sleep"]["overrides"] = f"survey wake_time={survey['wake_time']}"
    elif stated_bed:
        out["sleep"] = baseline.from_survey(survey)["sleep"]

    # Study: when it happens
    sessions = [ev for ev in events(log, "study") if ev.get("outcome") not in ("skipped", "tired")]
    spans = [(ev["s"], ev["e"]) for ev in sessions]
    st = stated.get(("activity_window", "study", "prefer"))
    n, lo, hi = best_window(spans, 180) if len(spans) >= 5 else (0, None, None)
    if n and n / len(spans) >= 0.6:
        window = _w(lo, hi)
        moved_in = sum(1 for ev in sessions if ev.get("outcome") == "moved" and lo <= ev["s"] and ev["e"] <= hi)
        text = f"{n} of {len(spans)} study sessions were between {window[0]} and {window[1]}"
        if moved_in >= 3:
            text += f"; {moved_in} planned blocks were moved there"
        strength = "high" if moved_in >= 3 else "medium"
        if st and _agree(window, (st["start"], st["end"])):
            prefs.append(item("activity_window", text + f"; survey focus_time={survey['focus_time']} agrees", "both",
                              strength, "high", activity="study", direction="prefer", days="all",
                              start=window[0], end=window[1]))
        else:
            prefs.append(item("activity_window", text, "observed", strength, "high" if len(spans) >= 8 else "medium",
                              f"survey focus_time={survey['focus_time']}" if st else None, activity="study",
                              direction="prefer", days="all", start=window[0], end=window[1]))
    elif st:
        if len(spans) >= 5:
            prefs.append({**st, "evidence": st["evidence"] + f"; {len(spans)} logged sessions show no clear pattern",
                          "confidence": "low"})
        else:
            prefs.append(st)

    # Study: when it doesn't
    planned = [(day, ev) for day, ev in pairs(log, "study") if "planned" in ev]
    bad = [(day, ev) for day, ev in planned if ev["outcome"] in ("moved", "skipped")]
    note = next((k for k in ("avoid_mornings", "avoid_late") if k in note_kinds), None)
    n, lo, hi = best_window([ev["planned"] for _, ev in bad], 180) if len(bad) >= 3 else (0, None, None)
    observed = None
    if n >= 3:
        in_window = [ev for _, ev in planned if lo <= sum(ev["planned"]) / 2 < hi]
        hit = [(day, ev) for day, ev in bad if lo <= sum(ev["planned"]) / 2 < hi]
        # On 3+ different weekdays, so one protected evening doesn't look like a time of day to avoid.
        if len(hit) / len(in_window) >= 0.7 and len({day["date"].weekday() for day, _ in hit}) >= 3:
            observed = (floor_to(lo, 60), ceil_to(hi, 60), len(hit), len(in_window))
    if observed:
        window = _w(observed[0], min(DAY, observed[1]))
        text = f"{observed[2]} of {observed[3]} blocks planned {window[0]}-{window[1]} were moved or skipped"
        if note:
            prefs.append(item("activity_window", text + "; the notes say so too", "both", "high", "high",
                              activity="study", direction="avoid", days="all", start=window[0], end=window[1]))
        else:
            prefs.append(item("activity_window", text, "observed", "medium",
                              "high" if observed[2] >= 5 else "medium", activity="study", direction="avoid",
                              days="all", start=window[0], end=window[1]))
    elif note:
        window = NOTE_WINDOWS[note[6:]]
        quote = next(text for k, text in history["notes"] if k == note)
        prefs.append(item("activity_window", f"note: '{quote}'", "stated", "medium", "medium", activity="study",
                          direction="avoid", days="all", start=window[0], end=window[1]))

    # Exercise
    found = pairs(recent, "exercise")
    drift = len(found) >= 3 and len(pairs(log, "exercise")) > len(found)
    if len(found) < 3:
        found = pairs(log, "exercise")
    sessions = [ev for _, ev in found]
    spans = [(ev["s"], ev["e"]) for ev in sessions]
    st = stated.get(("activity_window", "exercise", "prefer"))
    n, lo, hi = best_window(spans, 150) if len(spans) >= 4 else (0, None, None)
    strength = "high" if "exercise" in musts else "medium"
    if n and n / len(spans) >= 0.7:
        window = _w(lo, hi)
        weekdays_only = len(spans) >= 5 and all(day["date"].weekday() < 5 for day, _ in found)
        text = f"exercise logged {n} of {len(spans)} times between {window[0]} and {window[1]}"
        if drift:
            text += " in the last 14 days"
            old = [(ev["s"], ev["e"]) for day, ev in pairs(log, "exercise") if day["ago"] > 14]
            n_old, lo_old, hi_old = best_window(old, 150) if len(old) >= 2 else (0, None, None)
            if n_old and not overlap(lo, hi, lo_old, hi_old):
                text += f" (before that {_w(lo_old, hi_old)[0]}-{_w(lo_old, hi_old)[1]})"
        days = "weekdays" if weekdays_only else "all"
        if st and _agree(window, (st["start"], st["end"])):
            when = survey["routines"][0]["when"]
            prefs.append(item("activity_window", text + f"; survey when={when} agrees", "both", strength, "high",
                              activity="exercise", direction="prefer", days=days, start=window[0], end=window[1]))
        else:
            overrides = f"survey routine when={survey['routines'][0]['when']}" if st else None
            prefs.append(item("activity_window", text, "observed", strength, "high" if len(spans) >= 6 else "medium",
                              overrides, activity="exercise", direction="prefer", days=days, start=window[0],
                              end=window[1]))
    elif st:
        prefs.append(st if len(spans) < 4 else {**st, "confidence": "low",
                                                "evidence": st["evidence"] + "; logged sessions are scattered"})

    # Session length
    lengths = [ev["stopped"] if ev.get("stopped") else ev["e"] - ev["s"] for ev in events(log, "study")
               if ev.get("outcome") not in ("skipped", "tired")]
    st = stated.get(("session_length", None, None))
    if len(lengths) >= 5:
        ideal = min((25, 45, 60, 90, 120), key=lambda x: abs(x - median(lengths)))
        stops = sum(1 for ev in events(log, "study") if ev.get("stopped"))
        text = f"median study session {round(median(lengths))} min over {len(lengths)} sessions"
        longer = sum(1 for ev in events(log, "study") if ev.get("extended"))
        if stops >= 2:
            text += f"; {stops} planned blocks were cut short"
        if longer >= 2:
            text += f"; {longer} planned blocks ran longer"
        if st and st["ideal"] == ideal:
            prefs.append(item("session_length", text + f"; survey work_session={survey['work_session']} agrees", "both",
                              "medium", "high", ideal=ideal))
        else:
            prefs.append(item("session_length", text, "observed", "medium",
                              "high" if len(lengths) >= 8 else "medium",
                              f"survey work_session={survey['work_session']}" if st else None, ideal=ideal))
    elif st:
        prefs.append(st)

    # Daily load
    tired_days = [day for day in log if day["date"] not in eves
                  and any(ev.get("outcome") == "tired" for ev in day["events"])]
    if len(tired_days) >= 2:
        totals = [sum(ev["e"] - ev["s"] for ev in day["events"] if ev["cat"] == "study"
                      and ev.get("outcome") not in ("skipped", "tired")) for day in tired_days]
        cap = max(60, floor_to(round(median(totals)), 30))
        prefs.append(item("daily_load", f"on {len(tired_days)} days, blocks were skipped as too tired after about "
                          f"{cap} min of study", "observed", "high", "high" if len(tired_days) >= 4 else "medium",
                          max_minutes=cap))

    # Breaks
    lates = [ev["late"] for ev in events(log, "study") if ev.get("late")]
    if len(lates) >= 3:
        gap = max(15, round(median(lates) / 15) * 15)
        prefs.append(item("min_gap", f"{len(lates)} sessions right after something else started {round(median(lates))}m "
                          "late on average", "observed", "medium", "high" if len(lates) >= 5 else "medium", minutes=gap))

    # Protected time
    social = defaultdict(list)
    for day in log:
        for ev in day["events"]:
            if ev["cat"] == "social":
                social[day["date"].weekday()].append((ev["s"], ev["e"]))
    groups = []
    for wd in sorted(social):
        spans = social[wd]
        if len(spans) < 2:
            continue
        lo, hi = floor_to(min(s for s, _ in spans), 60), min(DAY - 1, ceil_to(max(e for _, e in spans), 60))
        for g in groups:
            if overlap(lo, hi, g["lo"], g["hi"]) >= 60 and abs(wd - g["days"][-1]) == 1:
                g["days"].append(wd)
                g["lo"], g["hi"], g["n"] = min(lo, g["lo"]), max(hi, g["hi"]), g["n"] + len(spans)
                break
        else:
            groups.append({"days": [wd], "lo": lo, "hi": hi, "n": len(spans)})
    stated_protect = [p for p in baseline.from_survey(survey)["preferences"] if p["kind"] == "protect_time"]
    for kind, window in (("friends", FRIENDS), ("family", FAMILY)):
        if kind in note_kinds and not any(p["days"] == window["days"] for p in stated_protect):
            quote = next(text for k, text in history["notes"] if k == kind)
            stated_protect.append(item("protect_time", f"note: '{quote}'", "stated", "high", "medium", **window))
    used = set()
    for g in groups:
        days = [DAY_NAMES[d] for d in g["days"]]
        skipped = sum(1 for day in log for ev in day["events"] if day["date"].weekday() in g["days"]
                      and "planned" in ev and ev["outcome"] in ("skipped", "moved")
                      and overlap(*ev["planned"], g["lo"], g["hi"]))
        text = f"{g['n']} social plans on {'/'.join(d.capitalize() for d in days)} {hhmm(g['lo'])}-{hhmm(g['hi'])}"
        if skipped:
            text += f"; {skipped} study blocks there were skipped or moved"
        confidence = "high" if g["n"] >= 3 * len(days) or skipped >= 2 else "medium"
        match = next((i for i, p in enumerate(stated_protect) if set(p["days"]) & set(days)), None)
        if match is not None:
            used.add(match)
            prefs.append(item("protect_time", text + "; the survey or notes say so too", "both", "high", "high",
                              days=days, start=hhmm(g["lo"]), end=hhmm(g["hi"])))
        else:
            prefs.append(item("protect_time", text, "observed", "medium", confidence, days=days,
                              start=hhmm(g["lo"]), end=hhmm(g["hi"])))
    prefs += [p for i, p in enumerate(stated_protect) if i not in used]

    # Deadlines
    done = [t for t in history["tasks"] if t["type"] in ("homework", "project")]
    st = stated.get(("deadline_buffer", None, None))
    if len(done) >= 3:
        hours = median((t["due"] - t["done"]).total_seconds() / 3600 for t in done)
        bucket_ = 0 if hours < 12 else 24 if hours < 36 else 48
        text = f"homework and projects finished a median {round(hours)}h before the deadline ({len(done)} tasks)"
        if st and st["hours_before"] == bucket_:
            prefs.append(item("deadline_buffer", text + f"; survey deadline_style={survey['deadline_style']} agrees",
                              "both", "medium", "high", hours_before=bucket_))
        else:
            prefs.append(item("deadline_buffer", text, "observed", "medium", "high" if len(done) >= 5 else "medium",
                              f"survey deadline_style={survey['deadline_style']}" if st else None,
                              hours_before=bucket_))
    elif st:
        prefs.append(st)

    # Weekly shape
    picks = history["picks"]
    st = stated.get(("distribution", None, None))
    common = Counter(p["chosen"] for p in picks).most_common(1)
    if len(picks) >= 2 and common[0][1] >= 2 and common[0][1] * 2 > len(picks):
        style, count = common[0]
        text = f"chose the {STYLE_TEXT[style]} option {count} of {len(picks)} times"
        if st and st["style"] == style:
            prefs.append(item("distribution", text + f"; survey calendar_style={survey['calendar_style']} agrees",
                              "both", "medium", "high", style=style))
        else:
            prefs.append(item("distribution", text, "observed", "medium", "medium",
                              f"survey calendar_style={survey['calendar_style']}" if st else None, style=style))
    elif st:
        prefs.append(st)

    # Time estimates
    by_type = defaultdict(list)
    for t in history["tasks"]:
        if t["type"] != "exam":
            by_type[t["type"]].append(t["spent"] / t["est"])
    for kind, ratios in sorted(by_type.items()):
        if len(ratios) >= 2:
            factor = round(median(ratios), 1)
            if factor >= 1.25 or factor <= 0.8:
                out["adjustments"].append({
                    "kind": "estimate_multiplier",
                    "evidence": f"{len(ratios)} {kind} tasks took a median {factor}x their estimate",
                    "task_type": kind, "factor": factor, "source": "observed",
                    "confidence": "high" if len(ratios) >= 4 else "medium"})

    out["summary"] = summary(out, history)
    return canonical(out)


def summary(prefs, history):
    if not history["n_days"]:
        return "No history yet, so everything comes from the survey."
    parts = []
    for p in prefs["preferences"]:
        if p["source"] == "stated":
            continue
        if p["kind"] == "activity_window":
            verb = {"prefer": "studies best", "avoid": "avoids studying"}[p["direction"]] if p["activity"] == "study" \
                else "exercises"
            parts.append(f"{verb} {p['start']}-{p['end']}")
        elif p["kind"] == "daily_load":
            parts.append(f"tires after about {p['max_minutes']} min of study a day")
        elif p["kind"] == "protect_time":
            parts.append(f"keeps {'/'.join(p['days'])} {p['start']}-{p['end']} free")
    if not parts:
        return "Some history, but no clear patterns yet, so most preferences come from the survey."
    text = ", ".join(parts[:3])
    return text[0].upper() + text[1:] + "."


# ---- the hidden truth as a preference JSON ----

def oracle(truth):
    """The truth, written as a preference JSON with every item certain (for judging calendars)."""
    def it(kind, **fields):
        return {"kind": kind, "evidence": "ground truth", **fields, "source": "observed", "strength": "medium",
                "confidence": "high"}
    prefs = [it("activity_window", activity="study", direction="prefer", days="all",
                start=_w(*truth["study_peak"])[0], end=_w(*truth["study_peak"])[1])]
    if truth["study_avoid"]:
        lo, hi = NOTE_WINDOWS[truth["study_avoid"]]
        prefs.append(it("activity_window", activity="study", direction="avoid", days="all", start=lo, end=hi))
    ex = truth["exercise"]
    if ex:
        lo, hi = max(0, ex["start"] - 30), min(DAY, ex["start"] + ex["minutes"] + 30)
        prefs.append(it("activity_window", activity="exercise", direction="prefer", days=ex["days"],
                        start=_w(lo, hi)[0], end=_w(lo, hi)[1]))
    prefs.append(it("session_length", ideal=truth["session_ideal"]))
    if truth["daily_max"]:
        prefs.append(it("daily_load", max_minutes=truth["daily_max"]))
    if truth["min_gap"]:
        prefs.append(it("min_gap", minutes=truth["min_gap"]))
    for p in truth["protect"]:
        prefs.append(it("protect_time", days=p["days"], start=hhmm(p["start"]), end=hhmm(p["end"])))
    prefs.append(it("deadline_buffer", hours_before=truth["deadline_hours"]))
    prefs.append(it("distribution", style=truth["distribution"]))
    adjustments = [{"kind": "estimate_multiplier", "evidence": "ground truth", "task_type": k, "factor": v,
                    "source": "observed", "confidence": "high"} for k, v in truth["estimate"].items()]
    return canonical({"summary": "ground truth", "preferences": prefs, "adjustments": adjustments,
                      "sleep": {"evidence": "ground truth", "bedtime": _t(truth["bedtime"]), "source": "observed",
                                "confidence": "high"}})


# ---- the week to schedule next ----

def upcoming_week(rng, truth, history):
    today = history["today"]
    days = [today + timedelta(days=i) for i in range(7)]
    fixed = [{"date": d.isoformat(), "start": hhmm(s), "end": hhmm(e), "type": kind, "label": label}
             for d in days for w, s, e, label, kind in history["classes"] if w == d.weekday()]
    fixed.sort(key=lambda f: (f["date"], f["start"]))
    tasks = []
    for n in range(rng.randint(2, 5)):
        kind = rng.choices(["homework", "project", "study", "exam"], [5, 2, 3, 1])[0]
        due_day = days[rng.randint(1, 6)]
        tasks.append({"id": f"t{n + 1}", "title": rng.choice(TASK_NAMES[kind]).format(n=n + 7), "type": kind,
                      "priority": rng.choice(["high", "medium", "low"]),
                      "due": f"{due_day.isoformat()}T{'23:59' if kind != 'exam' else '10:00'}",
                      "minutes": rng.choice(range(45, 241, 15))})
    ex = truth["exercise"]
    routines = [{"id": "r1", "activity": "exercise", "label": ex["label"], "times": ex["times"],
                 "minutes": ex["minutes"]}] if ex else []
    return {"now": f"{today.isoformat()}T08:00", "week": {"start": days[0].isoformat(), "end": days[-1].isoformat()},
            "day_off": None, "fixed": fixed, "tasks": tasks, "routines": routines}


def tags(survey, history, lab):
    """What makes this persona hard, for the per-category breakdown in evaluate.py."""
    out = []
    if history["n_days"] == 0:
        out.append("no_history")
    elif history["n_days"] <= 3:
        out.append("sparse")
    if any(p.get("overrides") for p in lab["preferences"]) or (lab.get("sleep") or {}).get("overrides"):
        out.append("conflict")
    if any("before that" in p["evidence"] for p in lab["preferences"]):
        out.append("drift")
    if any(day["crunch"] for day in history["log"]):
        out.append("crunch")
    if any(k == "aspirational" for k, _ in history["notes"]):
        out.append("aspirational_note")
    if history["noise"] >= 0.15:
        out.append("noisy")
    return out


def make(seed, spec=None):
    """One complete example: persona, survey, history, what the model sees, and the three JSONs."""
    rng = random.Random(seed)
    truth, survey = make_persona(rng, spec)
    history = simulate(rng, truth, survey, spec)
    lab = label(survey, history)
    return {"seed": seed, "spec": spec or {}, "truth": truth, "survey": survey, "history": history,
            "bundle": render(survey, history), "label": lab, "oracle": oracle(truth),
            "week": upcoming_week(rng, truth, history), "tags": tags(survey, history, lab)}
