"""Checks history.py on one hand-made week of app rows: every rule in its docstring has a line to look for.

  python check_history.py
"""

import history

TASK_A, TASK_B, TASK_C = "aaaaaaaa-0000-0000-0000-000000000001", "aaaaaaaa-0000-0000-0000-000000000002", \
    "aaaaaaaa-0000-0000-0000-000000000003"


def block(id_, date, start, end, type_="task", activity="Essay", task_id=TASK_A, auto=False):
    return {"id": id_, "date": date, "start_time": f"{start}:00", "end_time": f"{end}:00", "type": type_,
            "activity": activity, "task_id": task_id, "auto": auto}


ROWS = {
    "now": "2026-10-22T12:00",   # a Thursday
    "tz_offset": 420,            # Pacific daylight time
    "survey": {"focus_time": "evening", "work_session": "45", "sleep_hours": 8, "wake_time": "07:30",
               "deadline_style": "steady", "calendar_style": "calendar2", "non_negotiables": ["sleep"]},
    "tasks": [
        # Essay: finished Tue 21:30 local, 100 of 90 minutes.
        {"id": TASK_A, "title": "Essay", "type": "homework", "estimated_time": 90, "time_spent": 100,
         "due_date": "2026-10-23T06:59:00+00:00", "completed": True, "completed_at": "2026-10-22T04:30:00+00:00"},
        # Lab: open, with a block on Monday and another next week.
        {"id": TASK_B, "title": "Lab", "type": "homework", "estimated_time": 120, "time_spent": 0,
         "due_date": "2026-10-28", "completed": False, "completed_at": None},
        # Reading: open, its only block was Tuesday, so it was missed.
        {"id": TASK_C, "title": "Reading", "type": "study", "estimated_time": 45, "time_spent": 0,
         "due_date": "2026-10-30", "completed": False, "completed_at": None},
    ],
    "blocks": [
        block("c1", "2026-10-19", "08:00", "10:00", "class", "CSC 3001", None),
        block("m1", "2026-10-19", "11:00", "11:30", "commute", "Commute: Home → Campus", None, auto=True),
        block("s1", "2026-10-19", "20:00", "21:00", "study", "flashcards", None),
        block("a1", "2026-10-19", "18:00", "18:45"),                         # done: Essay finished later
        block("a2", "2026-10-20", "19:30", "20:15"),                         # moved from 10:00-10:45
        block("b1", "2026-10-19", "16:30", "17:15", activity="Lab", task_id=TASK_B),   # done: Lab has a later block
        block("b2", "2026-10-27", "17:00", "17:45", activity="Lab", task_id=TASK_B),
        block("r1", "2026-10-20", "21:00", "21:45", activity="Reading", task_id=TASK_C),  # missed: skipped
        block("t1", "2026-10-22", "18:00", "18:45", activity="Lab", task_id=TASK_B),   # today: not in the log
    ],
    "reflections": [
        {"date": "2026-10-19", "ratings": {"productivity": 4, "mood": 3, "energy": 3, "sleep": 4},
         "bed_time": "23:40:00", "wake_time": "07:20:00"},
        {"date": "2026-10-21", "ratings": {"productivity": 2, "mood": 3, "energy": 2, "sleep": 2},
         "bed_time": "00:30:00", "wake_time": None},
    ],
    "events": [
        {"created_at": "2026-10-20T15:00:00+00:00", "kind": "block_moved", "block_id": "a2", "task_id": TASK_A,
         "details": {"label": "Essay", "from": {"date": "2026-10-20", "start": "10:00", "end": "10:45"},
                     "to": {"date": "2026-10-20", "start": "12:00", "end": "12:45"}}},
        {"created_at": "2026-10-20T17:00:00+00:00", "kind": "block_moved", "block_id": "a2", "task_id": TASK_A,
         "details": {"label": "Essay", "from": {"date": "2026-10-20", "start": "12:00", "end": "12:45"},
                     "to": {"date": "2026-10-20", "start": "19:30", "end": "20:15"}}},
        # Deleted Wednesday's Lab session: skipped.
        {"created_at": "2026-10-21T16:00:00+00:00", "kind": "block_deleted", "block_id": "b9", "task_id": TASK_B,
         "details": {"label": "Lab", "date": "2026-10-21", "start": "14:00", "end": "14:45"}},
        # Deleted an Essay session planned after the Essay was done: not a skip.
        {"created_at": "2026-10-22T05:00:00+00:00", "kind": "block_deleted", "block_id": "a9", "task_id": TASK_A,
         "details": {"label": "Essay", "date": "2026-10-21", "start": "22:00", "end": "22:45"}},
        # Three options of one style: no choice to learn from, so left out.
        {"created_at": "2026-10-20T04:00:00+00:00", "kind": "plan_accepted", "block_id": None, "task_id": None,
         "details": {"week_start": "2026-10-19", "chosen": 0, "options": ["even", "even", "even"]}},
        # Sunday night 9 PM local: chose the spaced-out option.
        {"created_at": "2026-10-19T04:00:00+00:00", "kind": "plan_accepted", "block_id": None, "task_id": None,
         "details": {"week_start": "2026-10-19", "chosen": 1, "options": ["clustered", "spaced", "even"]}},
    ],
}

EXPECT = [
    "TODAY: 2026-10-22 Thu",
    "SURVEY: sleep_hours=8, wake_time=07:30, focus_time=evening",
    "LOG (3 days):",
    "  08:00-10:00 class \"CSC 3001\"",
    "  16:30-17:15 study \"Lab\" (planned, done)",
    "  18:00-18:45 study \"Essay\" (planned, done)",
    "  20:00-21:00 study \"flashcards\"",
    "  reflection: productivity 4, mood 3, energy 3, sleep 4; bed 23:40, up 07:20",
    "  19:30-20:15 study \"Essay\" (planned 10:00-10:45, moved)",
    "  21:00-21:45 study \"Reading\" (planned, skipped)",
    "  14:00-14:45 study \"Lab\" (planned, skipped)",
    "  reflection: productivity 2, mood 3, energy 2, sleep 2",
    "  \"Essay\" homework: est 90m, spent 100m, due 10-22 23:59, done 10-21 21:30",
    "  10-18: options [grouped into long stretches | spaced out | evenly spread] -> chose \"spaced out\"",
]
ABSENT = ["Commute", "22:00-22:45", "18:00-18:45 study \"Lab\"", "\"Lab\" homework", "10-19: options"]


def main():
    text = history.bundle(ROWS)
    print(text, "\n")
    failed = [f"missing: {line}" for line in EXPECT if line not in text]
    failed += [f"should not be there: {bit}" for bit in ABSENT if bit in text]
    for line in failed:
        print("FAIL", line)
    print("All passed." if not failed else f"{len(failed)} failed.")
    raise SystemExit(1 if failed else 0)


if __name__ == "__main__":
    main()
