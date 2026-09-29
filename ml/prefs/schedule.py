"""The scheduling pipeline: fixed requirements + hard constraints + preference JSON -> the 3 calendars.

  python schedule.py week.json --survey survey.json --prefs prefs.json
  python schedule.py week.json --survey survey.json              # survey-only preferences (baseline.py)

1. hard.build: sleep window and buffers -> available hours; session length and estimate adjustments;
   routines become things the solver places.
2. Solver (csp/solver.py): only valid calendars, half of the samples steered toward the preferred
   windows, every placement checked against the meal rule.
3. score.score ranks them; the best few get a local-improvement pass (score.improve).
4. score.top3 picks the best plus two good, different alternatives; score.explain says why.

The week JSON has now, week, day_off, fixed, tasks, and optionally routines (else they come from the
survey). Writes report.html and picks.json to --out (default outputs/<week name>).
"""

import argparse
import html
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent / "csp"))
sys.path.insert(0, str(HERE.parent / "eval"))

import baseline  # noqa: E402
import hard  # noqa: E402
import score  # noqa: E402
from schema import clean, hhmm  # noqa: E402
from solver import solve  # noqa: E402


def cal_key(cal):
    return tuple(sorted((b["task"], b["date"], b["start"]) for b in cal["blocks"]))


def plan_week(week, survey, prefs, limit=150, seed=0, improve_top=4, step=15):
    """Returns {"inp", "note", "calendars", "scores", "picks": [{"index", "score", "rank", "why"}]}."""
    inp = hard.build(week, survey, prefs)
    weight = score.guide_weight(inp, prefs)
    result = solve(inp, limit=limit, step=step, seed=seed, guided=weight is not None, weight=weight,
                   check=hard.meal_check(inp))
    cals = list(result.calendars)
    scores = [score.score(inp, prefs, c) for c in cals]

    seen = {cal_key(c) for c in cals}
    improved = 0
    for n, i in enumerate(sorted(range(len(cals)), key=lambda i: -scores[i])[:improve_top]):
        better, value = score.improve(inp, prefs, cals[i], seed=seed + n)
        if cal_key(better) not in seen:
            seen.add(cal_key(better))
            cals.append(better)
            scores.append(value)
            improved += 1

    order = sorted(range(len(cals)), key=lambda i: -scores[i])
    picks = []
    for i in score.top3(cals, scores):
        problems = hard.validate(inp, cals[i])
        assert not problems, f"pipeline produced an invalid calendar: {problems[:3]}"
        picks.append({"index": i, "score": scores[i], "rank": order.index(i) + 1,
                      "why": score.explain(inp, prefs, cals[i])})
    note = f"{result.note}; {improved} more from local improvement"
    return {"inp": inp, "note": note, "calendars": cals, "scores": scores, "picks": picks,
            "unscheduled_chunks": result.unscheduled_chunks}


# ---- report ----

CSS = """<style>
body { font: 14px -apple-system, Segoe UI, sans-serif; color: #18181b; margin: 24px; max-width: 1400px; }
h1 { font-size: 20px; margin: 0 0 4px; } h2 { font-size: 17px; margin: 28px 0 6px; }
.meta { color: #52525b; }
table.prefs { border-collapse: collapse; margin-top: 8px; }
table.prefs th, table.prefs td { border: 1px solid #d4d4d8; padding: 4px 8px; text-align: left; font-size: 13px;
  vertical-align: top; }
.why { background: #f4f4f5; padding: 8px 10px; border-radius: 6px; margin: 6px 0 10px; }
</style>"""


def pref_text(p):
    k = p["kind"]
    if k == "activity_window":
        return f"{p['direction']} {p['activity']} {p['start']}-{p['end']} ({p['days']})"
    if k == "protect_time":
        return f"keep {'/'.join(p['days'])} {p['start']}-{p['end']} free"
    fields = {"session_length": "ideal", "daily_load": "max_minutes", "min_gap": "minutes",
              "deadline_buffer": "hours_before", "distribution": "style", "estimate_multiplier": "factor"}
    extra = f" {p['task_type']}" if k == "estimate_multiplier" else ""
    return f"{k}{extra}: {p[fields[k]]}"


def prefs_table(prefs):
    rows = []
    if prefs.get("sleep"):
        s = prefs["sleep"]
        rows.append(("sleep", f"bedtime {s['bedtime']}", s["source"], "", s["confidence"], s.get("overrides", ""),
                     s["evidence"]))
    for p in prefs.get("preferences", []) + prefs.get("adjustments", []):
        rows.append((p["kind"], pref_text(p), p["source"], p.get("strength", ""), p["confidence"],
                     p.get("overrides", ""), p["evidence"]))
    head = "".join(f"<th>{h}</th>" for h in ("kind", "preference", "source", "strength", "confidence", "overrides",
                                              "evidence"))
    body = "".join("<tr>" + "".join(f"<td>{html.escape(str(c))}</td>" for c in row) + "</tr>" for row in rows)
    return f'<table class="prefs"><tr>{head}</tr>{body}</table>'


def report(title, plan, prefs):
    from visualize import CSS as CAL_CSS, calendar_html  # eval/visualize.py

    inp = plan["inp"]
    sleep = inp["sleep"]
    parts = [f"<h1>{html.escape(title)}</h1>",
             f'<div class="meta">Sleep {hhmm(sleep["bedtime"] % 1440)}-{hhmm(sleep["wake"])} '
             f'({sleep["hours"]:g}h, bedtime from {sleep["source"]}); productive hours '
             f'{inp["available"]["start"]}-{inp["available"]["end"]} after the {hard.WIND_DOWN}-minute wind-down and '
             f'{hard.WAKE_BUFFER}-minute wake-up buffers. Session length {inp["prefs"]["session_minutes"]} min. '
             f'Solver: {html.escape(plan["note"])}.</div>']
    for note in inp["notes"]:
        parts.append(f'<div class="meta">Note: {html.escape(note)}</div>')
    parts.append("<h2>Preferences used</h2>" + prefs_table(prefs))
    for n, p in enumerate(plan["picks"], start=1):
        cal = plan["calendars"][p["index"]]
        parts.append(f"<h2>Option {n}: score {p['score']:.2f} (rank {p['rank']} of {len(plan['calendars'])})</h2>"
                     f'<div class="why">{html.escape(p["why"])}</div>'
                     f'<div class="sched">{calendar_html(inp, cal, [])}</div>')
    return f"<!doctype html><meta charset='utf-8'><title>{html.escape(title)}</title>{CSS}{CAL_CSS}" + "".join(parts)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("week", help="week JSON (now, week, day_off, fixed, tasks, routines?)")
    parser.add_argument("--survey", help="survey JSON (the app's answers plus sleep_hours, wake_time, routines)")
    parser.add_argument("--prefs", help="preference JSON (default: survey-only baseline)")
    parser.add_argument("--limit", type=int, default=150)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--out")
    args = parser.parse_args()

    path = Path(args.week)
    data = json.loads(path.read_text())
    week = data.get("input", data)
    survey = json.loads(Path(args.survey).read_text()) if args.survey else {}
    if args.prefs:
        prefs, problems = clean(json.loads(Path(args.prefs).read_text()))
        for p in problems:
            print(f"  prefs: {p}")
    else:
        prefs = baseline.from_survey(survey)

    started = time.perf_counter()
    plan = plan_week(week, survey, prefs, limit=args.limit, seed=args.seed)
    print(f"{plan['note']} in {time.perf_counter() - started:.1f}s")
    for n, p in enumerate(plan["picks"], start=1):
        print(f"  #{n} score {p['score']:.2f}: {p['why']}")
    out = Path(args.out) if args.out else HERE / "outputs" / path.stem
    out.mkdir(parents=True, exist_ok=True)
    (out / "report.html").write_text(report(path.stem, plan, prefs))
    (out / "picks.json").write_text(json.dumps({
        "prefs": prefs, "note": plan["note"],
        "picks": [{**p, **plan["calendars"][p["index"]]} for p in plan["picks"]]}, indent=1) + "\n")
    print(f"Wrote {(out / 'report.html').resolve()}")


if __name__ == "__main__":
    main()
