"""Solve, then pick: builds the valid calendars for a week with a constraint solver, has the model
choose the 3 this student would most want, and writes an HTML report of all of them.

  python plan.py ../eval/prompts/04.json                    # model on cuda / mps / cpu, whichever exists
  python plan.py ../eval/prompts/04.json --adapter adapter  # the fine-tuned model (see finetune.py)
  python plan.py ../eval/prompts/04.json --no-ai            # calendar-score picks, no torch needed
  python plan.py my_week.json --survey my_survey.json --limit 500

The input is the same JSON the model gets in eval/ (now, week, available, day_off, prefs, fixed, tasks,
recent_ratings), either bare or wrapped as {"scenario": ..., "input": {...}} like eval/prompts/*.json.
The survey (the app's onboarding answers) comes from --survey, or from surveys/<input name>.json.

Writes to outputs/<input name>/: report.html, calendars.json (every calendar with its measures and
both scores), picks.json, and model.txt (the raw model reply).
"""

import argparse
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent / "eval"))

from check import check_constraints  # noqa: E402  (eval/check.py)
import picker  # noqa: E402
import report  # noqa: E402
from solver import solve  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input", help="week JSON")
    parser.add_argument("--survey", help="onboarding survey JSON (default surveys/<input name>.json)")
    parser.add_argument("--limit", type=int, default=200, help="most calendars the solver returns")
    parser.add_argument("--step", type=int, default=15, help="start-time grid in minutes")
    parser.add_argument("--seed", type=int, default=0, help="changes which calendars get sampled")
    parser.add_argument("--uniform", action="store_true", help="sample uniformly, never toward focus hours")
    parser.add_argument("--shortlist", type=int, default=12,
                        help="best calendars by calendar score that the model sees; 0 = all of them")
    parser.add_argument("--model", default="Qwen/Qwen2.5-1.5B-Instruct")
    parser.add_argument("--adapter", help="LoRA adapter folder from finetune.py")
    parser.add_argument("--device", choices=["auto", "cuda", "mps", "cpu"], default="auto")
    parser.add_argument("--no-ai", action="store_true", help="pick the top 3 by calendar score instead")
    parser.add_argument("--out", help="output folder (default outputs/<input name>)")
    args = parser.parse_args()

    path = Path(args.input)
    data = json.loads(path.read_text())
    inp = data.get("input", data)
    scenario = data.get("scenario", path.stem)
    survey_path = Path(args.survey) if args.survey else HERE / "surveys" / f"{path.stem}.json"
    survey = json.loads(survey_path.read_text()) if survey_path.exists() else None
    print(f"Survey: {survey_path if survey else 'none'}")
    out_dir = Path(args.out) if args.out else HERE / "outputs" / path.stem
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1. Constraint satisfaction
    started = time.perf_counter()
    result = solve(inp, limit=args.limit, step=args.step, seed=args.seed, guided=not args.uniform)
    print(f"Solver: {result.note} in {time.perf_counter() - started:.1f}s "
          f"({result.unscheduled_chunks} of {result.chunks} chunks unscheduled)")
    if not result.calendars:
        sys.exit("No valid calendar. Check that the week, available hours and fixed commitments leave any time.")
    for cal in result.calendars:
        problems = check_constraints(inp, {**cal, "note": ""})
        assert not problems, f"solver produced an invalid calendar: {problems[:3]}"

    ids = [f"c{i:03d}" for i in range(1, len(result.calendars) + 1)]
    cals = dict(zip(ids, result.calendars))
    kinds = dict(zip(ids, result.kinds))
    feats = {cid: picker.features(inp, cals[cid]) for cid in ids}
    score = dict(zip(ids, picker.calendar_score(inp, [feats[cid] for cid in ids])))
    fit = dict(zip(ids, picker.student_fit(inp, survey, [feats[cid] for cid in ids])))
    ranked = sorted(ids, key=lambda cid: -score[cid])
    shortlist = sorted(ranked[:args.shortlist] if args.shortlist else ids)

    # 2. The model picks 3
    messages = picker.build_messages(inp, survey, shortlist, cals, feats)
    ai = {"text": "", "messages": messages, "label": "top 3 by calendar score (--no-ai)"}
    if not args.no_ai:
        try:
            tokenizer, model, device = picker.load_model(args.model, args.device, args.adapter)
        except ImportError as e:
            sys.exit(f"{e}. The model needs torch and transformers (and peft for --adapter). "
                     "Run with --no-ai to pick by calendar score only.")
        started = time.perf_counter()
        text, in_tokens, out_tokens = picker.generate(tokenizer, model, device, messages)
        seconds = time.perf_counter() - started
        name = args.model + (f" + {args.adapter}" if args.adapter else "")
        ai.update(text=text, label=f"{name} on {device}, {in_tokens} prompt tokens, {seconds:.1f}s")
        print(f"Model: {in_tokens} prompt tokens, {out_tokens} reply tokens, {seconds:.1f}s")
    picks = picker.read_picks(ai["text"], set(shortlist), ranked)

    # Where each pick ranks among the shortlist by both scores (1 = best).
    by_score = sorted(shortlist, key=lambda cid: -score[cid])
    by_fit = sorted(shortlist, key=lambda cid: -fit[cid])
    for n, p in enumerate(picks, start=1):
        p["score_rank"], p["fit_rank"] = by_score.index(p["id"]) + 1, by_fit.index(p["id"]) + 1
        print(f"  #{n} {p['id']} ({p['source']}, fit rank {p['fit_rank']}/{len(shortlist)}): {p['reason']}")

    # 3. Outputs
    (out_dir / "model.txt").write_text(ai["text"])
    (out_dir / "picks.json").write_text(json.dumps({
        "scenario": scenario, "model": ai["label"], "shortlist": len(shortlist),
        "best_by_fit": by_fit[:3], "picks": picks}, indent=2) + "\n")
    (out_dir / "calendars.json").write_text(json.dumps({
        "scenario": scenario, "solver": result.note, "exhaustive": result.exhaustive, "survey": survey,
        "calendars": [{"id": cid, "kind": kinds[cid], "score": score[cid], "fit": fit[cid],
                       "features": feats[cid], **cals[cid]} for cid in ids],
    }, indent=1) + "\n")
    page = out_dir / "report.html"
    page.write_text(report.build(inp, survey, scenario, result, ids, cals, kinds, feats, score, fit,
                                 shortlist, picks, ai))
    print(f"Wrote {page.resolve()}")


if __name__ == "__main__":
    main()
