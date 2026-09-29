"""Before/after scorecard for the preference reader, on the frozen test set (data/test.jsonl).

  python evaluate.py                                          # built-in methods only (no model needed)
  python evaluate.py preds/base_zero.jsonl preds/base_few.jsonl preds/tuned.jsonl
  python evaluate.py preds/*.jsonl --end-to-end --reports 6

Methods: every predictions file from llm.py (named after the file), plus three built in:
  survey_rules  baseline.from_survey: the survey alone, no model (the bar to beat)
  label         what the rules infer from the data (the training target; 100% on understanding)
  oracle        the hidden truth (the best any reader could do)

1. Understanding, against the label: does the JSON parse, which preferences it found (precision,
   recall, F1 by match key), whether their values are right (window overlap, exact numbers, bedtime
   within 30 minutes), source/strength/confidence, whether survey-vs-log conflicts were resolved
   toward the log, and how many "observed" preferences it made up. Also F1 per persona tag.

2. End to end (--end-to-end), against the hidden truth: each method's JSON goes through the whole
   scheduler (schedule.plan_week). All calendars any method produced for a persona form one pool, and
   each is scored with the truth (score.score with the oracle JSON and the true task minutes). A method
   is judged by where its picks land in that pool (percentile, 100 = best), by regret (true score of the
   oracle's #1 minus its #1), and by how many picks put work inside the true sleep window.

--reports N writes side-by-side HTML (outputs/compare/<id>.html) for N personas, hard cases first.
"""

import argparse
import html
import json
import statistics
import sys
import time
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent / "csp"))
sys.path.insert(0, str(HERE.parent / "eval"))

import baseline  # noqa: E402
import hard  # noqa: E402
import llm  # noqa: E402
import schedule  # noqa: E402
import score  # noqa: E402
from schema import bed_minutes, match_key, tmin  # noqa: E402

VALUE_FIELDS = ["ideal", "max_minutes", "minutes", "hours_before", "style", "factor"]


def items(prefs):
    out = list(prefs.get("preferences", [])) + list(prefs.get("adjustments", []))
    if prefs.get("sleep"):
        out.append({"kind": "sleep", **prefs["sleep"]})
    return out


def same(a, b):
    """Same preference? Protected time matches on any shared day, everything else on the match key."""
    if a["kind"] == b["kind"] == "protect_time":
        return bool(set(a["days"]) & set(b["days"]))
    return match_key(a) == match_key(b)


def iou(a, b):
    a0, a1, b0, b1 = tmin(a["start"]), tmin(a["end"]), tmin(b["start"]), tmin(b["end"])
    inter = max(0, min(a1, b1) - max(a0, b0))
    return inter / ((a1 - a0) + (b1 - b0) - inter)


def value_ok(p, q):
    if p["kind"] == "sleep":
        return abs(bed_minutes(p["bedtime"]) - bed_minutes(q["bedtime"])) <= 30
    if "start" in p:
        return iou(p, q) >= 0.5
    field = next(f for f in VALUE_FIELDS if f in q)
    return p.get(field) == q[field]


def compare(pred, gold):
    """Per-persona understanding numbers for one predicted JSON against the label."""
    p_items, g_items = items(pred), items(gold)
    pairs, used = [], set()
    for g in g_items:
        for i, p in enumerate(p_items):
            if i not in used and same(p, g):
                pairs.append((p, g))
                used.add(i)
                break
    extra = [p for i, p in enumerate(p_items) if i not in used]
    out = {"tp": len(pairs), "fp": len(extra), "fn": len(g_items) - len(pairs),
           "value": [value_ok(p, g) for p, g in pairs],
           "iou": [iou(p, g) for p, g in pairs if "start" in g],
           "source": [p["source"] == g["source"] for p, g in pairs],
           "confidence": [p["confidence"] == g["confidence"] for p, g in pairs],
           "strength": [p.get("strength") == g.get("strength") for p, g in pairs if "strength" in g],
           "conflicts": 0, "resolved": 0}
    for g in g_items:
        if g.get("overrides"):
            out["conflicts"] += 1
            p = next((p for p, gg in pairs if gg is g), None)
            out["resolved"] += bool(p and p["source"] == "observed" and value_ok(p, g))
    # "Observed" items with nothing observed behind them in the label: made up from thin air.
    observed = {match_key(g) for g in g_items if g["source"] != "stated"}
    out["made_up"] = sum(1 for p in p_items if p["source"] != "stated" and match_key(p) not in observed
                         and not any(same(p, g) and g["source"] != "stated" for g in g_items))
    return out


def mean(xs):
    return sum(xs) / len(xs) if xs else float("nan")


def pct(xs):
    return f"{100 * mean(xs):.0f}%" if xs else "–"


def table(header, rows):
    lines = ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
    lines += ["| " + " | ".join(str(c) for c in row) + " |" for row in rows]
    return "\n".join(lines)


def understanding(rows, methods):
    results, by_tag = {}, defaultdict(dict)
    for name, preds in methods.items():
        per = {r["id"]: compare(preds[r["id"]][0], r["label"]) for r in rows}
        infos = [preds[r["id"]][1] for r in rows]
        tp, fp, fn = (sum(x[k] for x in per.values()) for k in ("tp", "fp", "fn"))
        precision, recall = tp / max(1, tp + fp), tp / max(1, tp + fn)
        flat = lambda k: [v for x in per.values() for v in x[k]]  # noqa: E731
        results[name] = {
            "parsed": mean([i["parsed"] for i in infos]), "problems": mean([len(i["problems"]) for i in infos]),
            "precision": precision, "recall": recall, "f1": 2 * precision * recall / max(1e-9, precision + recall),
            "value": mean(flat("value")), "iou": mean(flat("iou")), "source": mean(flat("source")),
            "confidence": mean(flat("confidence")), "strength": mean(flat("strength")),
            "conflicts": sum(x["conflicts"] for x in per.values()), "resolved": sum(x["resolved"] for x in per.values()),
            "made_up": mean([x["made_up"] for x in per.values()]), "per_persona": per}
        tags = defaultdict(list)
        for r in rows:
            for tag in r["tags"] + ["all"] + (["hard"] if not r["id"].startswith("random") else []):
                tags[tag].append(per[r["id"]])
        for tag, xs in tags.items():
            tp, fp, fn = (sum(x[k] for x in xs) for k in ("tp", "fp", "fn"))
            p, rc = tp / max(1, tp + fp), tp / max(1, tp + fn)
            ok = sum(sum(x["value"]) for x in xs) / max(1, sum(len(x["value"]) for x in xs))
            by_tag[tag][name] = (2 * p * rc / max(1e-9, p + rc), ok, len(xs))
    return results, by_tag


def end_to_end(rows, methods, limit):
    per, started = defaultdict(dict), time.perf_counter()
    for n, r in enumerate(rows, start=1):
        true_inp = hard.build(r["week"], r["survey"], r["oracle"])
        plans = {name: schedule.plan_week(r["week"], r["survey"], preds[r["id"]][0], limit=limit)
                 for name, preds in methods.items()}
        pool, seen = [], set()
        for plan in plans.values():
            for cal in plan["calendars"]:
                if schedule.cal_key(cal) not in seen:
                    seen.add(schedule.cal_key(cal))
                    pool.append(score.score(true_inp, r["oracle"], cal))
        pool.sort()
        best_oracle = None
        for name, plan in plans.items():
            picks = [plan["calendars"][p["index"]] for p in plan["picks"]]
            truth = [score.score(true_inp, r["oracle"], c) for c in picks]
            sleep = [score.pen_sleep(score.View(true_inp, c), r["oracle"]["sleep"]) > 0 for c in picks]
            below = [sum(1 for v in pool if v <= t) / len(pool) for t in truth]
            per[r["id"]][name] = {"true": truth, "pct1": below[0], "pct3": mean(below), "sleep": sleep,
                                  "plan": plan}
            if name == "oracle":
                best_oracle = truth[0]
        for name in plans:
            per[r["id"]][name]["regret"] = best_oracle - per[r["id"]][name]["true"][0]
        if n % 8 == 0:
            print(f"  end to end: {n}/{len(rows)}  {(time.perf_counter() - started) / 60:.1f} min", flush=True)
    return per


def report(r, methods, per, out):
    parts = [f"<h1>{html.escape(r['id'])}</h1><div class='meta'>tags: {', '.join(r['tags']) or 'none'}</div>"
             f"<details><summary>What the model read</summary><pre>{html.escape(r['bundle'])}</pre></details>"]
    for name in methods:
        info = per[r["id"]][name]
        plan = info["plan"]
        prefs = methods[name][r["id"]][0]
        cal = plan["calendars"][plan["picks"][0]["index"]]
        from visualize import calendar_html  # eval/visualize.py
        parts.append(f"<h2>{html.escape(name)}: #1 pick is at the {100 * info['pct1']:.0f}th percentile by the truth "
                     f"(regret {info['regret']:.2f})</h2><div class='why'>{html.escape(plan['picks'][0]['why'])}</div>"
                     + schedule.prefs_table(prefs) + f"<div class='sched'>{calendar_html(plan['inp'], cal, [])}</div>")
    from visualize import CSS as CAL_CSS
    page = (f"<!doctype html><meta charset='utf-8'><title>{html.escape(r['id'])}</title>{schedule.CSS}{CAL_CSS}"
            "<style>pre{white-space:pre-wrap;font-size:12px}</style>" + "".join(parts))
    (out / f"{r['id']}.html").write_text(page)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("preds", nargs="*", help="llm.py outputs; each file is one method named after the file")
    parser.add_argument("--data", default=str(HERE / "data"))
    parser.add_argument("--end-to-end", action="store_true", help="also schedule a week with every method's JSON")
    parser.add_argument("--limit", type=int, default=100, help="calendars the solver samples per method")
    parser.add_argument("--n", type=int, help="only the first n test personas")
    parser.add_argument("--reports", type=int, default=0, help="write side-by-side HTML for this many personas")
    parser.add_argument("--out", default=str(HERE / "outputs" / "results.json"))
    args = parser.parse_args()

    rows = [json.loads(line) for line in (Path(args.data) / "test.jsonl").read_text().splitlines() if line.strip()]
    rows = rows[:args.n]
    ok = {"parsed": True, "problems": [], "fallback": False}
    methods = {"survey_rules": {r["id"]: (baseline.from_survey(r["survey"]), ok) for r in rows}}
    for path in map(Path, args.preds):
        replies = {x["id"]: x["text"] for x in map(json.loads, path.read_text().splitlines()) if x}
        missing = [r["id"] for r in rows if r["id"] not in replies]
        if missing:
            sys.exit(f"{path} has no reply for {len(missing)} personas (e.g. {missing[0]})")
        methods[path.stem] = {r["id"]: llm.read(replies[r["id"]], r["survey"]) for r in rows}
    methods["label"] = {r["id"]: (r["label"], ok) for r in rows}
    methods["oracle"] = {r["id"]: (r["oracle"], ok) for r in rows}

    results, by_tag = understanding(rows, methods)
    print(f"\n## Understanding: {len(rows)} test personas, compared with the label\n")
    print(table(["Method", "Parsed", "Fixes/reply", "Precision", "Recall", "F1", "Right value", "Window IoU",
                 "Source", "Confidence", "Strength", "Conflicts resolved", "Made-up obs/persona"],
                [[name, pct([x["parsed"]]), f"{x['problems']:.1f}", f"{x['precision']:.2f}", f"{x['recall']:.2f}",
                  f"{x['f1']:.2f}", f"{100 * x['value']:.0f}%", f"{x['iou']:.2f}", f"{100 * x['source']:.0f}%",
                  f"{100 * x['confidence']:.0f}%", f"{100 * x['strength']:.0f}%",
                  f"{x['resolved']}/{x['conflicts']}", f"{x['made_up']:.2f}"] for name, x in results.items()]))
    print("\n### F1 (and share of matched items with the right value) by persona tag\n")
    names = list(methods)
    print(table(["Tag", "n"] + names, [[tag, next(iter(v.values()))[2]] +
                                        [f"{v[n][0]:.2f} ({100 * v[n][1]:.0f}%)" for n in names]
                                        for tag, v in sorted(by_tag.items(), key=lambda kv: kv[0] != "all")]))

    summary = {name: {k: v for k, v in x.items() if k != "per_persona"} for name, x in results.items()}
    if args.end_to_end:
        per = end_to_end(rows, methods, args.limit)
        print(f"\n## End to end: calendars judged by the hidden truth\n")
        rows_out = []
        for name in methods:
            xs = [per[r["id"]][name] for r in rows]
            e2e = {"pct1": mean([x["pct1"] for x in xs]), "pct3": mean([x["pct3"] for x in xs]),
                   "regret": mean([x["regret"] for x in xs]),
                   "regret_median": statistics.median(x["regret"] for x in xs),
                   "sleep": mean([v for x in xs for v in x["sleep"]])}
            summary[name]["end_to_end"] = e2e
            rows_out.append([name, f"{100 * e2e['pct1']:.0f}", f"{100 * e2e['pct3']:.0f}", f"{e2e['regret']:.2f}",
                             f"{e2e['regret_median']:.2f}", f"{100 * e2e['sleep']:.0f}%"])
        print(table(["Method", "#1 pick percentile", "Top-3 percentile", "Regret (mean)", "Regret (median)",
                     "Picks in the true sleep window"], rows_out))
        if args.reports:
            out = HERE / "outputs" / "compare"
            out.mkdir(parents=True, exist_ok=True)
            for r in sorted(rows, key=lambda r: r["id"].startswith("random"))[:args.reports]:
                report(r, methods, per, out)
            print(f"\nWrote {args.reports} side-by-side reports to {out}")

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(summary, indent=1) + "\n")
    print(f"\nWrote {args.out}")


if __name__ == "__main__":
    main()
