"""Compares runs of plan.py side by side, e.g. the base model against the fine-tuned one.

  python compare.py runs/base runs/tuned

Each folder holds one plan.py output folder per week (01/, 02/, ...). For every week and run it prints:
how many of the 3 picks were usable model picks, where the picks rank by student fit among the
shortlist (1 = what this student would want most), and whether the model found the best-fit calendar.
"""

import argparse
import json
from pathlib import Path


def summarize(folder):
    p = json.loads((folder / "picks.json").read_text())
    picks = p["picks"]
    ai = [x for x in picks if x["source"] == "ai"]
    return {
        "scenario": p["scenario"],
        "shortlist": p["shortlist"],
        "usable": len(ai),
        "fit_ranks": [x["fit_rank"] for x in picks],
        "avg_fit_rank": sum(x["fit_rank"] for x in picks) / len(picks),
        "found_best": any(x["fit_rank"] == 1 for x in ai),
        "top3_overlap": sum(1 for x in ai if x["fit_rank"] <= 3),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("runs", nargs="+", help="folders of plan.py outputs, one subfolder per week")
    args = parser.parse_args()

    runs = [Path(r) for r in args.runs]
    weeks = sorted({w.name for r in runs for w in r.iterdir() if (w / "picks.json").exists()})
    header = ["Week", "Run", "Usable picks", "Fit ranks of picks", "Avg fit rank", "Found best fit?", "Picks in fit top 3"]
    rows, totals = [], {r.name: [] for r in runs}
    for week in weeks:
        for r in runs:
            if not (r / week / "picks.json").exists():
                continue
            s = summarize(r / week)
            totals[r.name].append(s)
            rows.append([f"{week} {s['scenario']}", r.name, f"{s['usable']}/3",
                         ", ".join(map(str, s["fit_ranks"])) + f" (of {s['shortlist']})",
                         f"{s['avg_fit_rank']:.1f}", "yes" if s["found_best"] else "no", f"{s['top3_overlap']}/3"])
    for name, ss in totals.items():
        if ss:
            rows.append(["All weeks", name, f"{sum(s['usable'] for s in ss)}/{3 * len(ss)}", "",
                         f"{sum(s['avg_fit_rank'] for s in ss) / len(ss):.1f}",
                         f"{sum(s['found_best'] for s in ss)}/{len(ss)}",
                         f"{sum(s['top3_overlap'] for s in ss)}/{3 * len(ss)}"])

    print("| " + " | ".join(header) + " |")
    print("|" + "---|" * len(header))
    for row in rows:
        print("| " + " | ".join(row) + " |")
    shortlist = totals[runs[0].name][0]["shortlist"] if totals[runs[0].name] else 12
    print(f"\nPicking at random would average a fit rank of {(shortlist + 1) / 2:.1f} and put 0.75 of 3 picks in the top 3.")


if __name__ == "__main__":
    main()
