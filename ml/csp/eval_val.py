"""Phase 1 check: does the model pick the best calendars by the numbers, for students it never trained on?

  python eval_val.py --n 30                     # base model
  python eval_val.py --n 30 --adapter adapter   # fine-tuned

Runs the model on validation examples from make_train.py and compares its picks with the shortlist's
student_fit ranking. Phase 1 is done when picks are 100% usable, the #1 pick matches the best by
student fit at least 60% of the time, and the average fit rank of the picks is 2.5 or better
(2.0 = exactly the top 3; random is 6.5 with a 12-calendar shortlist).
"""

import argparse
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent / "eval"))

import picker  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--val", default=str(HERE / "train" / "val.jsonl"))
    parser.add_argument("--n", type=int, default=30)
    parser.add_argument("--model", default="Qwen/Qwen2.5-1.5B-Instruct")
    parser.add_argument("--adapter")
    parser.add_argument("--device", choices=["auto", "cuda", "mps", "cpu"], default="auto")
    parser.add_argument("--out", help="write per-example results to this JSON file")
    args = parser.parse_args()

    rows = [json.loads(line) for line in Path(args.val).read_text().splitlines() if line.strip()][:args.n]
    tokenizer, model, device = picker.load_model(args.model, args.device, args.adapter)
    name = "fine-tuned" if args.adapter else "base"

    results, started = [], time.perf_counter()
    for i, row in enumerate(rows, start=1):
        order = row["fit_order"]
        text, _, _ = picker.generate(tokenizer, model, device, row["messages"][:-1])
        picks = [p for p in picker.read_picks(text, set(order), ranked=[]) if p["source"] == "ai"]
        ranks = [order.index(p["id"]) + 1 for p in picks]
        results.append({"usable": len(picks), "ranks": ranks, "reply": text,
                        "answer": row["messages"][-1]["content"]})
        if i % 10 == 0:
            print(f"  {i}/{len(rows)}  {(time.perf_counter() - started) / 60:.1f} min", flush=True)

    n = len(results)
    usable = sum(r["usable"] for r in results)
    top1 = sum(1 for r in results if r["ranks"][:1] == [1])
    # Missing picks count as the worst rank, so a model can't look good by answering less.
    worst = len(rows[0]["fit_order"])
    avg_rank = sum(sum(r["ranks"]) + worst * (3 - len(r["ranks"])) for r in results) / (3 * n)
    in_top3 = sum(sum(1 for x in r["ranks"] if x <= 3) for r in results)

    passed = usable == 3 * n and top1 / n >= 0.6 and avg_rank <= 2.5
    print(f"\n{name} model on {n} held-out students:")
    print(f"| Usable picks | #1 is the best by fit | Avg fit rank of picks | Picks in fit top 3 |")
    print(f"|---|---|---|---|")
    print(f"| {usable}/{3 * n} ({100 * usable // (3 * n)}%) | {top1}/{n} ({100 * top1 // n}%) | "
          f"{avg_rank:.2f} | {in_top3}/{3 * n} |")
    print(f"Phase 1 target (100% usable, #1 right 60%+, avg rank 2.5 or better): {'MET' if passed else 'not yet'}")
    print(f"Random picks would average {(worst + 1) / 2:.1f} and get #1 right {100 // worst}% of the time.")
    if args.out:
        Path(args.out).write_text(json.dumps(results, indent=1) + "\n")


if __name__ == "__main__":
    main()
