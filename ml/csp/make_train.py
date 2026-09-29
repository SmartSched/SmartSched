"""Makes fine-tuning data: random students, each with a random week and survey, run through the same
solver and shortlist as plan.py. The right answer for each is the top 3 of the shortlist by
student_fit (which reads the survey), with a reason built from that calendar's real measures.

  python make_train.py                 # 800 train + 60 validation examples into train/
  python make_train.py --n 200 --val 20

The weeks never use the eval week (2026-09-21), so the 4 test students stay out of training.
"""

import argparse
import json
import random
import sys
from datetime import date, timedelta
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent / "eval"))

import picker  # noqa: E402
from solver import solve  # noqa: E402

FOCUS = ["early_morning", "morning", "afternoon", "evening", "late_night"]
SESSIONS = {"25": 25, "45": 45, "90": 90, "120_plus": 120}
DEADLINES = ["steady", "day_before", "night_before", "depends"]
STYLES = ["calendar1", "calendar2", "calendar3", "calendar4"]
MUSTS = ["sleep", "meals", "exercise", "friends", "family", "hobby"]
COURSES = ["CSC 101", "MATH 220", "BIO 150", "HIST 210", "ECON 101", "PHYS 201", "ENG 110", "PSY 100"]
TASK_KINDS = [("Problem set", "homework"), ("Reading", "study"), ("Lab report", "homework"),
              ("Essay draft", "homework"), ("Project work", "project"), ("Exam review", "exam"),
              ("Flashcards", "study"), ("Discussion post", "homework")]
FIRST_WEEK = date(2026, 10, 5)  # a Monday, after the eval week


def hm(total):
    return f"{total // 60:02d}:{total % 60:02d}"


def overlaps_any(fixed, d, s, e):
    return any(f["date"] == d and s < picker.minutes(f["end"]) and picker.minutes(f["start"]) < e for f in fixed)


def random_student(rng):
    start = FIRST_WEEK + timedelta(weeks=rng.randrange(40))
    days = [(start + timedelta(days=i)).isoformat() for i in range(7)]
    focus = rng.choice(FOCUS)
    a_start = rng.choice([7, 8, 8, 9, 10]) * 60
    a_end = rng.choice([21 * 60, 22 * 60, 23 * 60, 23 * 60 + 59])
    if focus == "late_night":
        a_end = max(a_end, 23 * 60)
    if focus == "early_morning":
        a_start = min(a_start, 7 * 60)
    work_session = rng.choice(list(SESSIONS))

    fixed = []
    for label in rng.sample(COURSES, rng.randint(2, 4)):
        pattern, length = rng.choice([((0, 2, 4), 50), ((1, 3), 75), ((0, 2), 75)])
        s = rng.randrange(8 * 60, 17 * 60, 30)
        if all(not overlaps_any(fixed, days[i], s, s + length) for i in pattern):
            fixed += [{"date": days[i], "start": hm(s), "end": hm(s + length), "type": "class", "label": label}
                      for i in pattern]
    work_hours = 0
    if rng.random() < 0.4:
        for i in rng.sample(range(7), rng.randint(2, 5)):
            s, length = rng.randrange(9 * 60, 18 * 60, 60), rng.choice([180, 240, 300])
            e = min(s + length, 23 * 60)
            if not overlaps_any(fixed, days[i], s, e):
                fixed.append({"date": days[i], "start": hm(s), "end": hm(e), "type": "work", "label": "Shift"})
                work_hours += (e - s) / 60
    standing_hours = 0
    if rng.random() < 0.3:
        i, s = rng.randrange(7), rng.randrange(17 * 60, 20 * 60, 30)
        if not overlaps_any(fixed, days[i], s, s + 90):
            fixed.append({"date": days[i], "start": hm(s), "end": hm(s + 90), "type": "personal", "label": "Club"})
            standing_hours = 1.5
    fixed.sort(key=lambda f: (f["date"], f["start"]))

    day_off = rng.choice([days[5], days[6], days[rng.randrange(7)]]) if rng.random() < 0.25 else None
    tasks = []
    for n in range(rng.randint(2, 7)):
        title, kind = rng.choice(TASK_KINDS)
        due_day = rng.randint(1, 7)
        due = (start + timedelta(days=due_day)).isoformat() + "T" + rng.choice(["23:59", "23:59", "09:00", "13:00"])
        tasks.append({"id": f"t{n + 1}", "title": f"{title} {n + 1}", "type": kind,
                      "priority": rng.choice(["high", "medium", "low"]), "due": due,
                      "minutes": rng.choice(range(30, 301, 15))})

    tired = rng.random() < 0.2
    ratings = [{"date": (start - timedelta(days=k)).isoformat(),
                "productivity": rng.randint(1, 5), "mood": rng.randint(1, 5),
                "energy": rng.randint(1, 2) if tired else rng.randint(3, 5),
                "sleep": rng.randint(1, 2) if tired else rng.randint(3, 5)} for k in (2, 1)]

    prefs = {"focus_time": focus, "session_minutes": SESSIONS[work_session],
             "deadline_style": rng.choice(DEADLINES), "calendar_style": rng.choice(STYLES)}
    inp = {"now": f"{days[0]}T{hm(rng.choice([7, 8, 9]) * 60)}", "week": {"start": days[0], "end": days[6]},
           "available": {"start": hm(a_start), "end": hm(a_end)}, "day_off": day_off, "prefs": prefs,
           "fixed": fixed, "tasks": tasks, "recent_ratings": ratings}

    commitments = {"classes": round(sum(picker.minutes(f["end"]) - picker.minutes(f["start"])
                                        for f in fixed if f["type"] == "class") / 60)}
    if work_hours:
        commitments["work"] = round(work_hours)
    if standing_hours:
        commitments["standing"] = 2
    musts = rng.sample(MUSTS, rng.choice([0, 1, 1, 2, 2, 3]))
    if day_off:
        musts.append("day_off")
    survey = {"commitments": commitments, "focus_time": focus, "work_session": work_session,
              "non_negotiables": musts, "deadline_style": prefs["deadline_style"],
              "calendar_style": prefs["calendar_style"]}
    return inp, survey


def make_example(seed, limit=200, shortlist=12):
    """Same steps as plan.py up to the model call, then the answer from student_fit."""
    rng = random.Random(seed)
    inp, survey = random_student(rng)
    result = solve(inp, limit=limit, seed=seed)
    if len(result.calendars) < 3:
        return None
    ids = [f"c{i:03d}" for i in range(1, len(result.calendars) + 1)]
    cals = dict(zip(ids, result.calendars))
    feats = {cid: picker.features(inp, cals[cid]) for cid in ids}
    score = dict(zip(ids, picker.calendar_score(inp, [feats[cid] for cid in ids])))
    fit = dict(zip(ids, picker.student_fit(inp, survey, [feats[cid] for cid in ids])))
    short = sorted(sorted(ids, key=lambda cid: -score[cid])[:shortlist])
    fit_order = sorted(short, key=lambda cid: -fit[cid])
    best = fit_order[:3]
    others = [feats[cid] for cid in short]
    answer = picker.target([(cid, picker.reason(inp, survey, feats[cid], others)) for cid in best])
    messages = picker.build_messages(inp, survey, short, cals, feats)
    return {"messages": messages + [{"role": "assistant", "content": answer}],
            "fit_order": fit_order,  # the shortlist best-first by student_fit, for eval_val.py
            "agrees_with_score": best[0] == max(short, key=lambda cid: score[cid])}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=800, help="training examples")
    parser.add_argument("--val", type=int, default=60, help="validation examples")
    parser.add_argument("--out", default=str(HERE / "train"))
    args = parser.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    want = args.n + args.val
    examples, seed = [], 1
    with Pool() as pool:
        while len(examples) < want:
            count = want - len(examples) + 20
            for e in pool.imap(make_example, range(seed, seed + count)):
                examples += [e] if e else []
                if len(examples) % 50 == 0 and e:
                    print(f"  {len(examples)}/{want}", flush=True)
            seed += count
    examples = examples[:want]

    agree = sum(e.pop("agrees_with_score") for e in examples)
    for name, part in (("train.jsonl", examples[:args.n]), ("val.jsonl", examples[args.n:])):
        (out / name).write_text("".join(json.dumps(e) + "\n" for e in part))
    chars = sorted(sum(len(m["content"]) for m in e["messages"]) for e in examples)
    print(f"Wrote {args.n} train and {args.val} validation examples to {out}")
    print(f"student_fit's #1 matches calendar_score's #1 in {agree}/{want} "
          f"({100 * agree // want}%), so the model can't just copy the calendar score")
    print(f"Length: median {chars[len(chars) // 2]:,} characters (about {chars[len(chars) // 2] // 3:,} tokens), "
          f"longest {chars[-1]:,}")


if __name__ == "__main__":
    main()
