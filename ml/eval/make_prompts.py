"""Writes the 10 pre-training check prompts to prompts/. Rerun after editing a scenario.

Every scenario uses the week of Mon 2026-09-21 to Sun 2026-09-27, starting Monday 08:00.
Keep these prompts out of the training data.
"""

import json
from pathlib import Path

WEEK = {"start": "2026-09-21", "end": "2026-09-27"}
NOW = "2026-09-21T08:00"
MON, TUE, WED, THU, FRI, SAT, SUN = (f"2026-09-{d}" for d in range(21, 28))
DAYS = [MON, TUE, WED, THU, FRI, SAT, SUN]


def block(date, start, end, type_, label):
    return {"date": date, "start": start, "end": end, "type": type_, "label": label}


def task(id_, title, type_, priority, due, minutes):
    return {"id": id_, "title": title, "type": type_, "priority": priority, "due": due, "minutes": minutes}


# Two classes most scenarios share: MWF CSC 101 and TTh MATH 220.
CLASSES = [block(d, "10:00", "11:15", "class", "CSC 101") for d in (MON, WED, FRI)] + [
    block(d, "13:00", "14:15", "class", "MATH 220") for d in (TUE, THU)
]

GOOD_RATINGS = [
    {"date": "2026-09-19", "productivity": 4, "mood": 4, "energy": 4, "sleep": 4},
    {"date": "2026-09-20", "productivity": 3, "mood": 4, "energy": 4, "sleep": 4},
]


def make_input(tasks, fixed=CLASSES, focus_time="afternoon", session_minutes=45,
               deadline_style="steady", calendar_style="calendar2",
               available=("08:00", "23:00"), day_off=None, ratings=GOOD_RATINGS):
    return {
        "now": NOW,
        "week": WEEK,
        "available": {"start": available[0], "end": available[1]},
        "day_off": day_off,
        "prefs": {
            "focus_time": focus_time,
            "session_minutes": session_minutes,
            "deadline_style": deadline_style,
            "calendar_style": calendar_style,
        },
        "fixed": fixed,
        "tasks": tasks,
        "recent_ratings": ratings,
    }


SCENARIOS = [
    # 1
    ("Light week, 2 tasks", None, make_input([
        task("t1", "Read chapter 4", "study", "medium", f"{THU}T23:59", 60),
        task("t2", "Problem set 2", "homework", "high", f"{FRI}T23:59", 90),
    ])),
    # 2
    ("Heavy week, 8 tasks, 3 deadlines", None, make_input([
        task("t1", "Problem set 3", "homework", "high", f"{WED}T23:59", 120),
        task("t2", "Lab report", "homework", "high", f"{WED}T23:59", 150),
        task("t3", "Reading response", "homework", "medium", f"{WED}T23:59", 60),
        task("t4", "Project milestone", "project", "high", f"{FRI}T23:59", 240),
        task("t5", "Quiz review", "study", "medium", f"{FRI}T23:59", 90),
        task("t6", "Essay draft", "homework", "high", f"{SUN}T23:59", 180),
        task("t7", "Vocab practice", "study", "low", f"{SUN}T23:59", 45),
        task("t8", "Discussion post", "homework", "low", f"{SUN}T23:59", 30),
    ], session_minutes=90, calendar_style="calendar3")),
    # 3
    ("Exam tomorrow + homework due Friday", None, make_input([
        task("t1", "Study for MATH 220 midterm", "exam", "high", f"{TUE}T13:00", 240),
        task("t2", "CSC 101 homework", "homework", "medium", f"{FRI}T23:59", 120),
    ], fixed=CLASSES, session_minutes=90, deadline_style="day_before")),
    # 4
    ("Work shifts every evening", None, make_input([
        task("t1", "Problem set 3", "homework", "high", f"{WED}T23:59", 120),
        task("t2", "Lab report", "homework", "high", f"{THU}T23:59", 150),
        task("t3", "Reading", "study", "medium", f"{FRI}T23:59", 90),
        task("t4", "Essay outline", "homework", "medium", f"{SUN}T23:59", 60),
    ], fixed=CLASSES + [block(d, "17:00", "22:00", "work", "Shift at cafe") for d in DAYS],
        focus_time="evening")),
    # 5 (soft: sleep is poor, so the last block should end by 22:00)
    ("Low sleep ratings in recent reflections", {"end_by": "22:00"}, make_input([
        task("t1", "Problem set 3", "homework", "high", f"{WED}T23:59", 120),
        task("t2", "Lab report", "homework", "medium", f"{FRI}T23:59", 150),
        task("t3", "Reading", "study", "low", f"{SUN}T23:59", 60),
    ], focus_time="evening", ratings=[
        {"date": "2026-09-18", "productivity": 2, "mood": 2, "energy": 2, "sleep": 1},
        {"date": "2026-09-19", "productivity": 2, "mood": 3, "energy": 1, "sleep": 2},
        {"date": "2026-09-20", "productivity": 3, "mood": 2, "energy": 2, "sleep": 1},
    ])),
    # 6 (tasks due Monday next week tempt the model to use Sunday)
    ('"Full day off" non-negotiable', None, make_input([
        task("t1", "Problem set 3", "homework", "high", f"{WED}T23:59", 120),
        task("t2", "Essay draft", "homework", "high", "2026-09-28T09:00", 180),
        task("t3", "Project work", "project", "medium", "2026-09-28T23:59", 150),
        task("t4", "Reading", "study", "low", f"{SAT}T23:59", 60),
    ], day_off=SUN)),
    # 7 (soft: most study minutes should start at or after 20:00)
    ("Prefers late-night focus", {"focus_after": "20:00"}, make_input([
        task("t1", "Problem set 3", "homework", "high", f"{WED}T23:59", 120),
        task("t2", "Lab report", "homework", "medium", f"{FRI}T23:59", 150),
        task("t3", "Reading", "study", "low", f"{SUN}T23:59", 90),
    ], focus_time="late_night", session_minutes=90, deadline_style="night_before",
        available=("11:00", "23:59"))),
    # 8
    ("25-minute work sessions", None, make_input([
        task("t1", "Problem set 3", "homework", "high", f"{WED}T23:59", 100),
        task("t2", "Reading", "study", "medium", f"{THU}T23:59", 75),
        task("t3", "Flashcards", "study", "low", f"{FRI}T23:59", 50),
    ], session_minutes=25, calendar_style="calendar4")),
    # 9 (18:00-21:00 Mon-Wed minus a Tue meeting = 480 free minutes, 900 minutes of tasks)
    ("More task time than free time (can't all fit)", None, make_input([
        task("t1", "Project milestone", "project", "high", f"{WED}T23:59", 360),
        task("t2", "Lab report", "homework", "high", f"{WED}T23:59", 240),
        task("t3", "Problem set 3", "homework", "medium", f"{WED}T23:59", 180),
        task("t4", "Reading", "study", "low", f"{WED}T23:59", 120),
    ], fixed=[block(TUE, "18:00", "19:00", "personal", "Club meeting")], session_minutes=90,
        available=("18:00", "21:00"))),
    # 10
    ("Commute between class and work", None, make_input([
        task("t1", "Problem set 3", "homework", "high", f"{WED}T23:59", 120),
        task("t2", "Lab report", "homework", "high", f"{FRI}T23:59", 150),
        task("t3", "Reading", "study", "medium", f"{SUN}T23:59", 60),
    ], fixed=[x for d in (MON, WED, FRI) for x in (
        block(d, "09:00", "12:00", "class", "Morning classes"),
        block(d, "12:00", "12:45", "commute", "Bus to work"),
        block(d, "12:45", "17:00", "work", "Shift at library"),
        block(d, "17:00", "17:45", "commute", "Bus home"),
    )] + [x for d in (TUE, THU) for x in (
        block(d, "13:00", "14:15", "class", "MATH 220"),
        block(d, "14:15", "15:00", "commute", "Bus to work"),
        block(d, "15:00", "19:00", "work", "Shift at library"),
        block(d, "19:00", "19:45", "commute", "Bus home"),
    )])),
]


def main():
    out = Path(__file__).parent / "prompts"
    out.mkdir(exist_ok=True)
    for old in out.glob("*.json"):
        old.unlink()
    for n, (scenario, soft, input_) in enumerate(SCENARIOS, start=1):
        path = out / f"{n:02d}.json"
        path.write_text(json.dumps({"scenario": scenario, "soft": soft, "input": input_}, indent=2) + "\n")
    print(f"Wrote {len(SCENARIOS)} prompts to {out}")


if __name__ == "__main__":
    main()
