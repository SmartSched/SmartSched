"""Ranks valid calendars by the preference JSON, then picks 3 that are good and different.

score(cal) = -(base + sum over preferences of STRENGTH x CONFIDENCE x penalty)

Every penalty is 0 (fully satisfied) to 1 (badly broken), so the preference JSON's words alone decide
how much each one counts. base covers what every user wants: all the work fits (high priority
counts double), routines get their sessions, no tiny fragments.

The sleep item is scored too, as a large penalty for any block inside the sleep window or its buffers.
The pipeline's own calendars can't have one (it's a hard rule there), but when a calendar built from
one preference JSON is judged against another (the true one in evaluate.py), a wrong bedtime shows up.

Also here:
- guide_weight: steers the solver's sampling toward preferred windows (still only valid calendars).
- improve: local search that moves one block at a time while every hard rule still holds.
- top3: best score first, then each next pick trades score against similarity to the ones already
  chosen, so the three options aren't the same week shifted by 15 minutes.
- explain: one or two sentences per pick from the preferences it satisfies, with their evidence.
"""

import random
import statistics
from collections import defaultdict
from datetime import datetime

from hard import DAY, MEAL_GAP, WAKE_BUFFER, WIND_DOWN, _has_gap, meal_windows, week_days
from schema import CONFIDENCE, DAY_NAMES, STRENGTH, bed_minutes, hhmm, tmin

SLEEP_WEIGHT = 6.0
DAY_SETS = {"all": set(range(7)), "weekdays": set(range(5)), "weekends": {5, 6}}


class View:
    """A calendar in the shape the penalties need: blocks as (day, weekday, start, end, task, activity)."""

    def __init__(self, inp, cal):
        self.inp = inp
        self.days = week_days(inp)
        index = {d.isoformat(): i for i, d in enumerate(self.days)}
        self.tasks = {t["id"]: t for t in inp["tasks"]}
        self.blocks = []
        for b in cal["blocks"]:
            t = self.tasks[b["task"]]
            i = index[b["date"]]
            self.blocks.append((i, self.days[i].weekday(), tmin(b["start"]), tmin(b["end"]), b["task"],
                                t.get("activity", "exercise") if t.get("routine") else "study"))
        self.study = [b for b in self.blocks if b[5] == "study"]
        self.fixed = defaultdict(list)
        for f in inp["fixed"]:
            if f["date"] in index:
                self.fixed[index[f["date"]]].append((tmin(f["start"]), tmin(f["end"])))


def _overlap(s, e, lo, hi):
    return max(0, min(e, hi) - max(s, lo))


def _b2b(view, blocks, gap=10):
    """Blocks that start within `gap` minutes of the end of another block or commitment that day."""
    count = 0
    for b in blocks:
        ends = [e for s, e in view.fixed[b[0]]] + [o[3] for o in view.blocks if o[0] == b[0] and o is not b]
        count += any(0 <= b[2] - e < gap for e in ends)
    return count


def _days(view):
    now = datetime.fromisoformat(view.inp["now"]).date()
    return [i for i, d in enumerate(view.days) if d >= now and d.isoformat() != view.inp.get("day_off")]


def pen_activity_window(view, p):
    days = DAY_SETS[p["days"]]
    blocks = [b for b in view.blocks if b[5] == p["activity"] and b[1] in days]
    total = sum(b[3] - b[2] for b in blocks)
    if not total:
        return 0.0
    lo, hi = tmin(p["start"]), tmin(p["end"])
    inside = sum(_overlap(b[2], b[3], lo, hi) for b in blocks)
    if p["direction"] == "avoid":
        return inside / total
    away = sum((b[3] - b[2]) * max(0, lo - b[3], b[2] - hi) for b in blocks) / total / 60
    return 0.6 * (1 - inside / total) + 0.4 * min(1.0, away / 3)


def pen_session_length(view, p):
    """Only matters when judging against someone else's JSON: the pipeline already cuts sessions to fit."""
    if not view.study:
        return 0.0
    ideal = p["ideal"]
    long_ = sum(b[3] - b[2] for b in view.study if b[3] - b[2] > ideal + 15)
    short = sum(1 for b in view.study if b[3] - b[2] < ideal / 2)
    return 0.7 * long_ / sum(b[3] - b[2] for b in view.study) + 0.3 * short / len(view.study)


def pen_daily_load(view, p):
    per_day = defaultdict(int)
    for b in view.study:
        per_day[b[0]] += b[3] - b[2]
    over = sum(max(0, m - p["max_minutes"]) for m in per_day.values())
    return min(1.0, over / p["max_minutes"])


def pen_min_gap(view, p):
    if not view.blocks:
        return 0.0
    return _b2b(view, view.blocks, p["minutes"]) / len(view.blocks)


def pen_protect_time(view, p):
    days = {DAY_NAMES.index(d) for d in p["days"]}
    lo, hi = tmin(p["start"]), tmin(p["end"])
    inside = sum(_overlap(b[2], b[3], lo, hi) for b in view.blocks if b[1] in days)
    return min(1.0, inside / 120)


def pen_deadline_buffer(view, p):
    hours = p["hours_before"]
    if not hours:
        return 0.0
    last = {}
    for b in view.study:
        end = datetime.combine(view.days[b[0]], datetime.min.time()).timestamp() + b[3] * 60
        last[b[4]] = max(last.get(b[4], 0), end)
    pens = []
    for task, end in last.items():
        slack = (datetime.fromisoformat(view.tasks[task]["due"]).timestamp() - end) / 3600
        pens.append(max(0.0, hours - slack) / hours)
    return statistics.mean(pens) if pens else 0.0


def pen_distribution(view, p):
    blocks = view.study
    if not blocks:
        return 0.0
    style = p["style"]
    if style == "front_loaded":
        # How far along the way to its deadline each minute of work happens: 0 = right away, 1 = at the due time.
        now = datetime.fromisoformat(view.inp["now"]).timestamp()
        total, pos = 0, 0.0
        for b in blocks:
            start = datetime.combine(view.days[b[0]], datetime.min.time()).timestamp() + b[2] * 60
            due = datetime.fromisoformat(view.tasks[b[4]]["due"]).timestamp()
            pos += (b[3] - b[2]) * min(1.0, max(0.0, (start - now) / max(1, due - now)))
            total += b[3] - b[2]
        return pos / total
    per_day = defaultdict(int)
    for b in blocks:
        per_day[b[0]] += b[3] - b[2]
    days = _days(view) or [0]
    if style == "even":
        daily = [per_day.get(i, 0) for i in days]
        mean = statistics.mean(daily)
        return min(1.0, statistics.pstdev(daily) / mean / 1.5) if mean else 0.0
    b2b = _b2b(view, blocks) / len(blocks)
    spread = min(len(days), len(blocks))
    used = len(per_day)
    if style == "spaced":
        return 0.5 * b2b + 0.5 * (1 - used / spread)
    return 0.5 * (1 - b2b) + 0.5 * (used - 1) / max(1, spread - 1)  # clustered


PENALTIES = {"activity_window": pen_activity_window, "session_length": pen_session_length,
             "daily_load": pen_daily_load, "min_gap": pen_min_gap, "protect_time": pen_protect_time,
             "deadline_buffer": pen_deadline_buffer, "distribution": pen_distribution}


def pen_sleep(view, sleep):
    bed = bed_minutes(sleep["bedtime"])
    # Waking time isn't in the JSON; assume the user's hours from the calendar's own input.
    wake = bed + int(view.inp["sleep"]["hours"] * 60) - DAY
    inside = sum(_overlap(b[2], b[3], 0, wake + WAKE_BUFFER) + _overlap(b[2], b[3], min(DAY, bed - WIND_DOWN), DAY)
                 for b in view.blocks)
    return min(1.0, inside / 60)


def base(view):
    need = done = 0.0
    scheduled = defaultdict(int)
    sessions = defaultdict(int)
    for b in view.blocks:
        scheduled[b[4]] += b[3] - b[2]
        sessions[b[4]] += 1
    routine_need = routine_missing = 0
    for t in view.tasks.values():
        if t.get("routine"):
            routine_need += t["times"]
            routine_missing += max(0, t["times"] - sessions[t["id"]])
            continue
        w = 2 if t["priority"] == "high" else 1
        need += w * t["minutes"]
        done += w * min(t["minutes"], scheduled[t["id"]])
    fragments = sum(1 for b in view.study if b[3] - b[2] < 25)
    return (6 * (need - done) / need if need else 0) + (2 * routine_missing / routine_need if routine_need else 0) \
        + 0.2 * fragments


def breakdown(inp, prefs, cal):
    """[(item, penalty, weight)] for every preference, plus sleep when the JSON has one."""
    view = View(inp, cal)
    parts = []
    for p in prefs.get("preferences", []):
        parts.append((p, PENALTIES[p["kind"]](view, p), STRENGTH[p["strength"]] * CONFIDENCE[p["confidence"]]))
    if prefs.get("sleep"):
        parts.append(({"kind": "sleep", **prefs["sleep"]}, pen_sleep(view, prefs["sleep"]), SLEEP_WEIGHT))
    return view, parts


def score(inp, prefs, cal):
    view, parts = breakdown(inp, prefs, cal)
    return round(-(base(view) + sum(pen * w for _, pen, w in parts)), 4)


# ---- steering the solver ----

def guide_weight(inp, prefs):
    """weight(start, chunk) for the solver's guided samples: 1 is neutral, lower is less likely first."""
    week_start = week_days(inp)[0].weekday()
    activity = {t["id"]: (t.get("activity", "exercise") if t.get("routine") else "study") for t in inp["tasks"]}
    windows = [p for p in prefs.get("preferences", []) if p["kind"] in ("activity_window", "protect_time")]
    if not windows:
        return None

    def weight(start, chunk):
        s, e = start % DAY, start % DAY + chunk.length
        weekday = (week_start + start // DAY) % 7
        w = 1.0
        for p in windows:
            k = STRENGTH[p["strength"]] * CONFIDENCE[p["confidence"]] / 3
            lo, hi = tmin(p["start"]), tmin(p["end"])
            share = _overlap(s, e, lo, hi) / chunk.length
            if p["kind"] == "protect_time":
                if DAY_NAMES[weekday] in p["days"]:
                    w *= 0.2 ** (k * share)
            elif activity[chunk.task] == p["activity"] and weekday in DAY_SETS[p["days"]]:
                if p["direction"] == "avoid":
                    w *= 0.25 ** (k * share)
                else:
                    away = max(0, lo - e, s - hi) / 60
                    w *= 0.5 ** (k * (2 * (1 - share) + away / 1.5))
        return w
    return weight


# ---- local improvement ----

def improve(inp, prefs, cal, step=30, passes=3, seed=0):
    """Hill climbing: move one block to the best other valid start, repeat until nothing helps.
    Returns (calendar, score). Every move keeps every hard rule (see hard.validate)."""
    days = [d.isoformat() for d in week_days(inp)]
    now = datetime.fromisoformat(inp["now"])
    a_start, a_end = tmin(inp["available"]["start"]), tmin(inp["available"]["end"])
    tasks = {t["id"]: t for t in inp["tasks"]}
    fixed = defaultdict(list)
    for f in inp["fixed"]:
        fixed[f["date"]].append((tmin(f["start"]), tmin(f["end"])))
    meals = {days[i]: w for i, (_, w) in enumerate(meal_windows(inp))}
    grid = range(-(-a_start // step) * step, a_end, step)

    blocks = [dict(b) for b in cal["blocks"]]
    unscheduled = cal["unscheduled"]
    best = score(inp, prefs, {"blocks": blocks, "unscheduled": unscheduled})
    rng = random.Random(seed)

    def fits(i, d, s, e):
        t = tasks[blocks[i]["task"]]
        if d == inp.get("day_off") or datetime.fromisoformat(f"{d}T{hhmm(s)}") < now:
            return False
        if datetime.fromisoformat(f"{d}T{hhmm(e)}") > datetime.fromisoformat(t["due"]):
            return False
        others = [(tmin(b["start"]), tmin(b["end"])) for j, b in enumerate(blocks) if j != i and b["date"] == d]
        if any(s < oe and os_ < e for os_, oe in fixed[d] + others):
            return False
        if t.get("routine") and any(b["task"] == t["id"] and b["date"] == d for j, b in enumerate(blocks) if j != i):
            return False
        busy = fixed[d] + others + [(s, e)]
        return all(_has_gap(lo, hi, busy, MEAL_GAP) for _, lo, hi in meals[d])

    for _ in range(passes):
        moved = False
        for i in rng.sample(range(len(blocks)), len(blocks)):
            b = blocks[i]
            length = tmin(b["end"]) - tmin(b["start"])
            here = (b["date"], b["start"])
            choice = None
            for d in days:
                for s in grid:
                    if s + length > a_end or (d, hhmm(s)) == here or not fits(i, d, s, s + length):
                        continue
                    blocks[i] = {**b, "date": d, "start": hhmm(s), "end": hhmm(s + length)}
                    value = score(inp, prefs, {"blocks": blocks, "unscheduled": unscheduled})
                    if value > best + 1e-6:
                        best, choice = value, blocks[i]
                    blocks[i] = b
            if choice:
                blocks[i] = choice
                moved = True
        if not moved:
            break
    blocks.sort(key=lambda b: (b["date"], b["start"]))
    return {"blocks": blocks, "unscheduled": unscheduled}, best


# ---- picking 3 ----

def similarity(a, b):
    """Share of minutes where both calendars have the same task at the same time (0 to 1)."""
    def spans(cal):
        return [(x["task"], x["date"], tmin(x["start"]), tmin(x["end"])) for x in cal["blocks"]]
    sa, sb = spans(a), spans(b)
    same = sum(_overlap(s1, e1, s2, e2) for t1, d1, s1, e1 in sa for t2, d2, s2, e2 in sb if t1 == t2 and d1 == d2)
    total = max(sum(e - s for *_, s, e in sa), sum(e - s for *_, s, e in sb), 1)
    return same / total


def top3(cals, scores, n=3, trade=1.0):
    """Indexes of n calendars: the best, then each next one maximizing score - trade * spread * similarity
    to the closest one already chosen (spread = the scores' standard deviation, so trade is unitless)."""
    order = sorted(range(len(cals)), key=lambda i: -scores[i])
    if not order:
        return []
    spread = statistics.pstdev(scores) if len(scores) > 1 else 1.0
    spread = spread or 1.0
    chosen = [order[0]]
    pool = order[1:200]
    while len(chosen) < n and pool:
        def value(i):
            return scores[i] - trade * spread * max(similarity(cals[i], cals[j]) for j in chosen)
        pick = max(pool, key=value)
        chosen.append(pick)
        pool.remove(pick)
    return chosen


# ---- explanations ----

def _days_text(p):
    return {"all": "", "weekdays": " on weekdays", "weekends": " on weekends"}[p["days"]]


def _phrase(p, good, inp):
    k = p["kind"]
    if k == "activity_window":
        what = "study" if p["activity"] == "study" else next(
            (r["label"] for r in inp.get("routines", []) if r["activity"] == p["activity"]), p["activity"])
        span = f"{p['start']}-{p['end']}{_days_text(p)}"
        if p["direction"] == "avoid":
            return f"no {what} during {span}" if good else f"some {what} falls in {span}, which you avoid"
        return f"{what} sits in {span}" if good else f"some {what} is outside {span}"
    if k == "daily_load":
        return (f"no day has more than {p['max_minutes']} minutes of study" if good
                else f"one or more days go over {p['max_minutes']} minutes of study")
    if k == "min_gap":
        return (f"back-to-back sessions get a {p['minutes']}-minute break" if good
                else "some sessions start right after something else")
    if k == "protect_time":
        days = "/".join(d.capitalize() for d in p["days"])
        return f"{days} {p['start']}-{p['end']} stays free" if good else f"{days} {p['start']}-{p['end']} isn't fully free"
    if k == "deadline_buffer":
        return (f"work finishes at least {p['hours_before']} hours before each deadline" if good
                else f"some work finishes less than {p['hours_before']} hours before its deadline")
    if k == "distribution":
        text = {"front_loaded": "work is done early", "even": "work is spread evenly across the week",
                "spaced": "sessions are spread out with breaks", "clustered": "work is grouped into longer stretches"}
        return text[p["style"]] if good else "the weekly shape isn't quite " + p["style"].replace("_", "-")
    if k == "session_length":
        return f"sessions stay around {p['ideal']} minutes" if good else f"some sessions are far from {p['ideal']} minutes"
    return None


def explain(inp, prefs, cal):
    _, parts = breakdown(inp, prefs, cal)
    parts = [x for x in parts if x[0]["kind"] not in ("sleep", "session_length")]
    goods = sorted([x for x in parts if x[1] <= 0.15], key=lambda x: -x[2])
    bads = sorted([x for x in parts if x[1] >= 0.4], key=lambda x: -x[1] * x[2])
    text = []
    for p, _, _ in goods[:2]:
        phrase = _phrase(p, True, inp)
        if p["source"] != "stated" and p.get("evidence"):
            phrase += f" ({p['evidence'].rstrip('.')})"
        text.append(phrase)
    sentence = ("; ".join(text) if text else "the best balance of your preferences among the options")
    sentence = sentence[0].upper() + sentence[1:] + "."
    if bads:
        sentence += f" Trade-off: {_phrase(bads[0][0], False, inp)}."
    return sentence
