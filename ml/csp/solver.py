"""Constraint-satisfaction step: turns one SmartSched input into the valid calendars for that week.

Each task is cut into the fewest chunks no longer than prefs.session_minutes, as even as possible
(75 + 75 for 150 minutes at 90, 30 + 30 for 60 at 45).
A chunk is one CSP variable. Its domain is every start time on a STEP-minute grid that passes the
rules that only involve that chunk: inside the week and the available hours, not on the day off,
not before now, ending by the task's due time, and clear of every fixed commitment. The search adds
the rules between chunks: no two blocks overlap, and a task's chunks happen in order (which also
stops the same calendar showing up twice with two equal chunks swapped).

The search is backtracking with MRV (fill the chunk with the fewest options left first), forward
checking (after each placement, remove the options it rules out for every other chunk), and a
capacity bound (stop early when the free minutes left before a deadline can't hold the chunks due
by then).

If the tasks can't all fit, the solver leaves as few chunks unscheduled as it can. It tries 0
unscheduled chunks, then 1, and so on. Only the last chunks of a task can be dropped.

The number of valid calendars grows exponentially with tasks and free time (two tasks in an open
week already have millions at a 15-minute grid), so "all" is only reachable for small, tight weeks.
The solver first runs a plain depth-first search. If that finishes with at most `limit` calendars,
the list is complete. Otherwise it samples: many short randomized searches, each keeping its first
calendar, until it has `limit` different ones. Half of those searches try start times near the
student's focus hours first (still only valid calendars); the other half are uniformly random, so
the picker sees both.

Routines (a task with "routine": true, like the gym 3 times a week) are placed by the same search:
one chunk per session, each exactly "minutes" long, at most one a day, due by the end of the week.
The caller can pass its own sampling weight (weight(start, chunk)) and a per-day check that every
placement must pass (check(day, [(start, end, chunk), ...]) with minutes of the day), which
ml/prefs/ uses for guidance from the preference JSON and for the meal rule.
"""

import random
from dataclasses import dataclass
from datetime import date, datetime, timedelta

DAY = 24 * 60

# Matches FOCUS_TIMES in src/app/lib/survey.ts. Late night stops at 24:00 because blocks can't
# cross midnight.
FOCUS_WINDOWS = {
    "early_morning": ("05:00", "09:00"),
    "morning": ("09:00", "12:00"),
    "afternoon": ("12:00", "17:00"),
    "evening": ("17:00", "22:00"),
    "late_night": ("22:00", "24:00"),
}


def minutes(hhmm):
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


@dataclass(frozen=True)
class Chunk:
    index: int   # position in the variable list
    task: str
    part: int    # 0 for the task's first chunk
    length: int
    due: int     # minutes from the start of the week
    routine: bool = False  # a routine session: its siblings go on later days, not just later times


@dataclass
class Result:
    calendars: list      # each one is {"blocks": [...], "unscheduled": [...]}, the model output format
    kinds: list          # per calendar: "listed", "guided" or "random" (how the solver found it)
    exhaustive: bool     # True when calendars is every valid calendar on the grid
    unscheduled_chunks: int
    chunks: int
    nodes: int
    note: str


class OutOfNodes(Exception):
    pass


def week_days(inp):
    start = date.fromisoformat(inp["week"]["start"])
    end = date.fromisoformat(inp["week"]["end"])
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def since_week_start(inp, when):
    start = datetime.fromisoformat(inp["week"]["start"] + "T00:00")
    return int((datetime.fromisoformat(when) - start).total_seconds() // 60)


def split(total, session):
    """Splits a task into the fewest sessions, as even as possible: 60 at 45 is 30 + 30, not 45 + 15.
    Lengths are multiples of 15 minutes (5 when the session length isn't), longest first."""
    n = -(-total // session)
    unit = 15 if session % 15 == 0 else 5
    units, extra = divmod(total, unit)
    base, bigger = divmod(units, n)
    parts = [(base + (i < bigger)) * unit for i in range(n)]
    parts[-1] += extra
    return parts


def make_chunks(inp):
    session = inp["prefs"]["session_minutes"]
    chunks = []
    for t in inp["tasks"]:
        if t.get("routine"):
            for part in range(t["times"]):
                chunks.append(Chunk(len(chunks), t["id"], part, t["minutes"], since_week_start(inp, t["due"]), True))
            continue
        for part, length in enumerate(split(t["minutes"], session)):
            chunks.append(Chunk(len(chunks), t["id"], part, length, since_week_start(inp, t["due"])))
    return chunks


def focus_weight(inp):
    """For guided sampling: how much to favour a start time, 1 inside the student's focus window and
    halving for every 1.5 hours outside it."""
    window = FOCUS_WINDOWS.get(inp["prefs"]["focus_time"])
    if not window:
        return None
    lo, hi = (minutes(x) for x in window)

    def weight(start, chunk):
        s = start % DAY
        e = s + chunk.length
        outside = max(0, lo - s) + max(0, e - hi)
        return 0.5 ** (outside / 90)
    return weight


def free_minutes(inp):
    """Per day, the minute-of-day values that are inside available hours, after now, and not fixed."""
    days = week_days(inp)
    now = since_week_start(inp, inp["now"])
    a_start, a_end = minutes(inp["available"]["start"]), minutes(inp["available"]["end"])
    free = []
    for i, d in enumerate(days):
        if inp["day_off"] == d.isoformat():
            free.append(set())
            continue
        open_ = {m for m in range(a_start, a_end) if i * DAY + m >= now}
        for f in inp["fixed"]:
            if f["date"] == d.isoformat():
                open_ -= set(range(minutes(f["start"]), minutes(f["end"])))
        free.append(open_)
    return free


def domains(inp, chunks, free, step):
    """Start times (minutes from the start of the week) where each chunk fits on its own."""
    a_start, a_end = minutes(inp["available"]["start"]), minutes(inp["available"]["end"])
    first = -(-a_start // step) * step
    doms = []
    for c in chunks:
        values = []
        for i, open_ in enumerate(free):
            for s in range(first, a_end - c.length + 1, step):
                if i * DAY + s + c.length <= c.due and all(m in open_ for m in range(s, s + c.length)):
                    values.append(i * DAY + s)
        doms.append(values)
    return doms


class Search:
    def __init__(self, chunks, doms, free_by_day, budget, max_nodes, rng=None, weight=None, check=None):
        self.chunks = chunks
        self.doms = doms
        self.budget = budget          # how many chunks may still be left unscheduled
        self.max_nodes = max_nodes
        self.rng = rng                # None = deterministic order, else randomized (for sampling)
        self.weight = weight          # with rng: favour start times by weight(start, chunk)
        self.check = check            # None, or check(day, [(start, end, chunk), ...]) -> bool
        self.nodes = 0
        self.siblings = {}
        for c in chunks:
            self.siblings.setdefault(c.task, []).append(c)
        # Free minutes per day, kept up to date as chunks are placed, for the capacity bound.
        self.free = [len(f) for f in free_by_day]
        self.dues = sorted({c.due for c in chunks})

    def run(self):
        yield from self._search({}, [list(d) for d in self.doms], self.budget)

    def _fits(self, assigned, budget):
        """False when the free time before some deadline can't hold the chunks due by then."""
        for due in self.dues:
            need = sorted(c.length for c in self.chunks if c.index not in assigned and c.due <= due)
            if not need:
                continue
            if budget:
                need = need[:-budget]  # be optimistic: assume the biggest ones get dropped
            last_day = (due - 1) // DAY
            room = sum(self.free[: last_day + 1])
            if sum(need) > room:
                return False
        return True

    def _search(self, assigned, doms, budget):
        self.nodes += 1
        if self.nodes > self.max_nodes:
            raise OutOfNodes
        open_ = [c for c in self.chunks if c.index not in assigned]
        if not open_:
            yield dict(assigned)
            return
        if not self._fits(assigned, budget):
            return

        tiebreak = (lambda c: self.rng.random()) if self.rng else (lambda c: c.index)
        var = min(open_, key=lambda c: (len(doms[c.index]), tiebreak(c)))
        values = list(doms[var.index])
        if self.rng and self.weight:
            # Weighted random order: a start with twice the weight tends to come up first twice as often.
            values.sort(key=lambda s: -self.rng.random() ** (1 / max(1e-6, self.weight(s, var))))
        elif self.rng:
            self.rng.shuffle(values)

        for start in values:
            end = start + var.length
            if self.check and not self._day_ok(assigned, var, start):
                continue
            new = self._forward_check(var, start, end, doms, open_)
            assigned[var.index] = start
            self.free[start // DAY] -= var.length
            yield from self._search(assigned, new, budget)
            self.free[start // DAY] += var.length
            del assigned[var.index]

        # Last resort: leave this chunk and the rest of its task unscheduled. Two orders of dropping
        # can reach the same calendar, so solve() removes duplicates.
        later = [c for c in self.siblings[var.task] if c.part >= var.part]
        newly = [c for c in later if c.index not in assigned]
        if len(newly) <= budget and all(assigned.get(c.index) is None for c in later):
            for c in newly:
                assigned[c.index] = None
            yield from self._search(assigned, doms, budget - len(newly))
            for c in newly:
                del assigned[c.index]

    def _day_ok(self, assigned, var, start):
        day = start // DAY
        placed = [(s % DAY, s % DAY + self.chunks[i].length, self.chunks[i])
                  for i, s in assigned.items() if s is not None and s // DAY == day]
        placed.append((start % DAY, start % DAY + var.length, var))
        return self.check(day, placed)

    def _forward_check(self, var, start, end, doms, open_):
        new = list(doms)
        day_start = start // DAY * DAY
        for c in open_:
            if c is var:
                continue
            if c.task == var.task and var.routine:
                # One session a day, in order: later sessions on later days, earlier ones on earlier days.
                if c.part > var.part:
                    keep = [s for s in doms[c.index] if s >= day_start + DAY]
                else:
                    keep = [s for s in doms[c.index] if s + c.length <= day_start]
            elif c.task == var.task and c.part > var.part:
                keep = [s for s in doms[c.index] if s >= end]
            elif c.task == var.task:
                keep = [s for s in doms[c.index] if s + c.length <= start]
            else:
                keep = [s for s in doms[c.index] if s + c.length <= start or s >= end]
            new[c.index] = keep
        return new


def to_calendar(inp, chunks, assignment):
    days = week_days(inp)
    blocks, dropped = [], {}
    for c in chunks:
        start = assignment[c.index]
        if start is None:
            dropped[c.task] = dropped.get(c.task, 0) + c.length
            continue
        day, s = divmod(start, DAY)
        e = s + c.length
        blocks.append({"task": c.task, "date": days[day].isoformat(),
                       "start": f"{s // 60:02d}:{s % 60:02d}", "end": f"{e // 60:02d}:{e % 60:02d}"})
    blocks.sort(key=lambda b: (b["date"], b["start"]))
    return {"blocks": blocks, "unscheduled": [{"task": t, "minutes": m} for t, m in dropped.items()]}


def key(assignment):
    return tuple(sorted(assignment.items()))


def solve(inp, limit=200, step=15, max_nodes=300_000, attempt_nodes=20_000, seed=0, guided=True,
          weight=None, check=None):
    """guided=True makes every other sampled calendar favour the student's focus hours (see
    focus_weight), or `weight` when it's given; the rest stay uniformly random. Either way every
    calendar obeys the hard rules, plus `check` when it's given (see Search)."""
    chunks = make_chunks(inp)
    weight = (weight or focus_weight(inp)) if guided else None
    free = free_minutes(inp)
    doms = domains(inp, chunks, free, step)
    total_nodes = 0

    for budget in range(len(chunks) + 1):
        # 1. Plain depth-first search. If it finishes under the limit, this is every calendar.
        search = Search(chunks, doms, free, budget, max_nodes, check=check)
        found, seen, complete = [], set(), True
        try:
            for a in search.run():
                if key(a) in seen:
                    continue
                seen.add(key(a))
                found.append(a)
                if len(found) > limit:
                    complete = False
                    break
        except OutOfNodes:
            complete = False
        total_nodes += search.nodes

        if complete and not found:
            continue  # proven: no calendar leaves only `budget` chunks unscheduled
        if complete:
            cals = [to_calendar(inp, chunks, a) for a in found]
            return Result(cals, ["listed"] * len(cals), True, budget, len(chunks), total_nodes,
                          f"all {len(cals)} valid calendars on a {step}-minute grid")

        # 2. Too many to list (or too slow to finish): sample with randomized restarts.
        seen, sampled, kinds = set(), [], []
        for attempt in range(limit * 5):
            w = weight if attempt % 2 == 0 else None
            search = Search(chunks, doms, free, budget, attempt_nodes, random.Random(seed + attempt), w, check)
            try:
                a = next(search.run(), None)
            except OutOfNodes:
                a = None
            total_nodes += search.nodes
            if a is not None and key(a) not in seen:
                seen.add(key(a))
                sampled.append(a)
                kinds.append("guided" if w else "random")
                if len(sampled) == limit:
                    break
            if attempt >= 30 and not sampled:
                break  # nothing in 30 tries: this budget is probably infeasible, allow one more dropped chunk
        if not sampled:
            sampled, kinds = found[:limit], ["listed"] * len(found[:limit])
        if sampled:
            why = "more than" if len(found) > limit else "search budget ran out before listing all of"
            n_guided = kinds.count("guided")
            how = f", {n_guided} guided toward focus hours" if n_guided else ""
            cals = [to_calendar(inp, chunks, a) for a in sampled]
            return Result(cals, kinds, False, budget, len(chunks), total_nodes,
                          f"{len(cals)} sampled calendars{how} ({why} {limit} exist on a {step}-minute grid)")
        # Ran out of nodes without finding or ruling out this budget: allow one more dropped chunk.

    return Result([], [], True, len(chunks), len(chunks), total_nodes, "no valid calendar")
