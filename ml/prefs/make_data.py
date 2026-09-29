"""Makes the preference reader's data from synthetic personas (personas.py).

  python make_data.py                      # 1200 train, 100 val, 64 test into data/
  python make_data.py --train 3000

- train.jsonl / val.jsonl: {"messages": [system, user = context bundle, assistant = label JSON]} for
  csp/finetune.py (loss on the reply only).
- test.jsonl: the frozen test set. 40 random personas plus 24 hand-picked hard cases (2 of each
  kind in HARD), with everything evaluate.py needs: bundle, survey, label, oracle (the hidden truth),
  the upcoming week and tags.
- shots.jsonl: 2 training personas used as worked examples for the few-shot baseline.

Seed ranges never overlap, so no test persona is in training. Takes a few seconds.
"""

import argparse
import json
from pathlib import Path

import llm
import personas
from schema import dumps

HERE = Path(__file__).parent

HARD = {
    "gym_conflict": {"exercise": True, "exercise_when_wrong": True, "n_days": 21, "drift": False},
    "drift": {"exercise": True, "drift": True, "n_days": 21},
    "crunch": {"crunch": True, "n_days": 21},
    "sparse": {"n_days": 3},
    "no_history": {"n_days": 0},
    "noisy": {"noise": 0.3, "n_days": 21},
    "focus_wrong_avoid": {"focus_wrong": True, "avoid": True, "n_days": 21},
    "daily_max": {"daily_max": 90, "n_days": 21},
    "min_gap": {"min_gap": 30, "n_days": 21},
    "friends": {"protect": ["friends"], "n_days": 21},
    "aspirational": {"aspirational": True, "n_days": 14},
    "few_reflections": {"missing": 0.8, "n_days": 21},
}


def test_row(ex, name):
    return {"id": name, "seed": ex["seed"], "spec": ex["spec"], "tags": ex["tags"], "bundle": ex["bundle"],
            "survey": ex["survey"], "label": ex["label"], "oracle": ex["oracle"], "week": ex["week"]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--train", type=int, default=1200)
    parser.add_argument("--val", type=int, default=100)
    parser.add_argument("--test", type=int, default=40, help="random test personas (plus 2 of each HARD case)")
    parser.add_argument("--out", default=str(HERE / "data"))
    args = parser.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    def training(seed):
        ex = personas.make(seed)
        return {"messages": llm.messages(ex["bundle"]) + [{"role": "assistant", "content": dumps(ex["label"])}]}

    for name, first, n in (("train", 1, args.train), ("val", 100_001, args.val)):
        rows = [training(seed) for seed in range(first, first + n)]
        (out / f"{name}.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows))

    test = [test_row(personas.make(seed), f"random_{seed - 200_000:02d}") for seed in range(200_001, 200_001 + args.test)]
    for i, (name, spec) in enumerate(HARD.items()):
        for k in range(2):
            test.append(test_row(personas.make(300_001 + 10 * i + k, spec), f"{name}_{k + 1}"))
    (out / "test.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False, default=str) + "\n" for r in test))

    # Worked examples for the few-shot baseline: one with 2+ weeks of history where the log overrides the
    # survey, and one new user. Kept short so the prompt still fits.
    shots, seed = [], 1
    wanted = [lambda ex: "conflict" in ex["tags"] and ex["history"]["n_days"] >= 14 and len(ex["bundle"]) < 4500,
              lambda ex: ex["history"]["n_days"] == 3]
    for want in wanted:
        while not want(ex := personas.make(seed)):
            seed += 1
        shots.append({"seed": seed, "bundle": ex["bundle"], "label": ex["label"]})
        seed += 1
    (out / "shots.jsonl").write_text("".join(json.dumps(s, ensure_ascii=False) + "\n" for s in shots))

    chars = sorted(len(json.dumps(json.loads(line)["messages"])) for line in (out / "train.jsonl").read_text().splitlines())
    print(f"Wrote {args.train} train, {args.val} val, {len(test)} test personas and {len(shots)} few-shot examples "
          f"to {out}")
    print(f"Training example length: median {chars[len(chars) // 2]:,} characters (about "
          f"{chars[len(chars) // 2] // 3:,} tokens), longest {chars[-1]:,}")


if __name__ == "__main__":
    main()
