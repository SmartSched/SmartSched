"""10-prompt check: runs a model on prompts/*.json and prints one table row per prompt.

  python check.py --model Qwen/Qwen2.5-1.5B-Instruct --device cuda
  python check.py --model Qwen/Qwen2.5-1.5B-Instruct --device cuda --adapter path/to/lora
  python check.py --recheck outputs/cuda      # re-score saved outputs, no model needed

Raw outputs go to outputs/<device>/NN.txt and the full results to outputs/<device>/results.json.
"""

import argparse
import json
import re
import time
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path


HERE = Path(__file__).parent
SCHEMA = json.loads((HERE / "schema.json").read_text())
SYSTEM_PROMPT = (HERE / "system_prompt.txt").read_text()
FENCE = re.compile(r"^```[a-zA-Z]*\s*\n(.*?)\n?```$", re.DOTALL)


def load_prompts():
    return [(p.stem, json.loads(p.read_text())) for p in sorted((HERE / "prompts").glob("*.json"))]


def parse(text):
    """Returns the parsed object, or None. A single ```json fence around the object is allowed."""
    text = text.strip()
    match = FENCE.match(text)
    if match:
        text = match.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def minutes(hhmm):
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def at(date, hhmm):
    return datetime.fromisoformat(f"{date}T{hhmm}")


def overlaps(a_start, a_end, b_start, b_end):
    return a_start < b_end and b_start < a_end


def check_constraints(inp, out):
    """Returns a list of (rule, block index or None, message) for every hard-constraint violation."""
    violations = []
    tasks = {t["id"]: t for t in inp["tasks"]}
    now = datetime.fromisoformat(inp["now"])
    avail_start, avail_end = minutes(inp["available"]["start"]), minutes(inp["available"]["end"])
    session = inp["prefs"]["session_minutes"]
    fixed = [(f["date"], minutes(f["start"]), minutes(f["end"]), f["label"]) for f in inp["fixed"]]

    valid_blocks = []
    for i, b in enumerate(out["blocks"]):
        name = f"block {i + 1} ({b['task']} {b['date']} {b['start']}-{b['end']})"
        try:
            start_dt, end_dt = at(b["date"], b["start"]), at(b["date"], b["end"])
        except ValueError:
            violations.append(("H1", i, f"{name}: not a real date or time"))
            continue
        start, end = minutes(b["start"]), minutes(b["end"])

        # H1: date in the week, inside available hours, end after start
        if not inp["week"]["start"] <= b["date"] <= inp["week"]["end"]:
            violations.append(("H1", i, f"{name}: date outside the week"))
        if end <= start:
            violations.append(("H1", i, f"{name}: end is not after start"))
        elif start < avail_start or end > avail_end:
            violations.append(("H1", i, f"{name}: outside available hours"))
        # H2: no overlap with fixed commitments
        for f_date, f_start, f_end, label in fixed:
            if f_date == b["date"] and overlaps(start, end, f_start, f_end):
                violations.append(("H2", i, f"{name}: overlaps {label}"))
        # H4: ends by the task's due time
        if b["task"] in tasks and end_dt > datetime.fromisoformat(tasks[b["task"]]["due"]):
            violations.append(("H4", i, f"{name}: ends after the task is due"))
        # H5: starts after now
        if start_dt < now:
            violations.append(("H5", i, f"{name}: starts before now"))
        # H6: task id exists
        if b["task"] not in tasks:
            violations.append(("H6", i, f"{name}: unknown task id"))
        # H8: no longer than the session length
        if end - start > session:
            violations.append(("H8", i, f"{name}: {end - start} min is longer than {session}"))
        # H9: nothing on the day off
        if inp["day_off"] and b["date"] == inp["day_off"]:
            violations.append(("H9", i, f"{name}: on the day off"))
        if end > start:
            valid_blocks.append((b["date"], start, end, name, i))

    # H3: blocks don't overlap each other
    for j, (d1, s1, e1, n1, i1) in enumerate(valid_blocks):
        for d2, s2, e2, n2, i2 in valid_blocks[j + 1:]:
            if d1 == d2 and overlaps(s1, e1, s2, e2):
                violations.append(("H3", i1, f"{n1} overlaps {n2}"))
                violations.append(("H3", i2, f"{n2} overlaps {n1}"))

    # H6 for unscheduled, then H7: scheduled + unscheduled equals the task's minutes
    accounted = defaultdict(int)
    for b in out["blocks"]:
        if re.fullmatch(r"\d\d:\d\d", b["start"]) and re.fullmatch(r"\d\d:\d\d", b["end"]):
            accounted[b["task"]] += max(0, minutes(b["end"]) - minutes(b["start"]))
    for u in out["unscheduled"]:
        if u["task"] not in tasks:
            violations.append(("H6", None, f"unscheduled {u['task']}: unknown task id"))
        accounted[u["task"]] += u["minutes"]
    for task_id, t in tasks.items():
        if accounted[task_id] != t["minutes"]:
            violations.append(("H7", None, f"{task_id}: {accounted[task_id]} min accounted for, needs {t['minutes']}"))

    return violations


def check_soft(soft, out):
    """Preference checks for scenarios 5 and 7. Not counted as hard violations."""
    if not soft:
        return None
    blocks = [b for b in out["blocks"] if minutes(b["end"]) > minutes(b["start"])]
    if "end_by" in soft:
        late = [b for b in blocks if minutes(b["end"]) > minutes(soft["end_by"])]
        return f"{'pass' if not late else 'fail'}: {len(late)} block(s) end after {soft['end_by']}"
    if "focus_after" in soft:
        total = sum(minutes(b["end"]) - minutes(b["start"]) for b in blocks)
        late = sum(minutes(b["end"]) - minutes(b["start"]) for b in blocks
                   if minutes(b["start"]) >= minutes(soft["focus_after"]))
        share = late / total if total else 0
        return f"{'pass' if share >= 0.5 else 'fail'}: {share:.0%} of minutes start at or after {soft['focus_after']}"


def score(prompt, text):
    out = parse(text)
    result = {"valid_json": out is not None, "matches_schema": False, "violations": None, "soft": None}
    if out is None:
        return result
    import jsonschema  # here, not at the top, so the rest of this file imports without it

    try:
        jsonschema.validate(out, SCHEMA)
    except jsonschema.ValidationError as e:
        result["schema_error"] = e.message
        return result
    result["matches_schema"] = True
    result["violations"] = check_constraints(prompt["input"], out)
    result["soft"] = check_soft(prompt["soft"], out)
    return result


def generate_all(args, prompts, out_dir):
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    dtype = torch.float16 if args.device == "cuda" else torch.float32
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForCausalLM.from_pretrained(args.model, dtype=dtype).to(args.device)
    if args.adapter:
        from peft import PeftModel
        model = PeftModel.from_pretrained(model, args.adapter)
    model.eval()

    runs = {}
    for name, prompt in prompts:
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(prompt["input"], separators=(",", ":"))},
        ]
        ids = tokenizer.apply_chat_template(messages, add_generation_prompt=True, return_tensors="pt",
                                            return_dict=True).to(args.device)
        if args.device == "cuda":
            torch.cuda.synchronize()
        started = time.perf_counter()
        with torch.no_grad():
            generated = model.generate(**ids, max_new_tokens=args.max_new_tokens, do_sample=False,
                                       temperature=None, top_p=None, top_k=None,
                                       pad_token_id=tokenizer.eos_token_id)
        if args.device == "cuda":
            torch.cuda.synchronize()
        seconds = time.perf_counter() - started

        new_tokens = generated[0][ids["input_ids"].shape[1]:]
        text = tokenizer.decode(new_tokens, skip_special_tokens=True)
        (out_dir / f"{name}.txt").write_text(text)
        runs[name] = {"input_tokens": ids["input_ids"].shape[1], "output_tokens": len(new_tokens),
                      "seconds": round(seconds, 1), "hit_token_limit": len(new_tokens) >= args.max_new_tokens}
        print(f"  {name}: {len(new_tokens)} tokens in {seconds:.1f}s", flush=True)
    return runs


def yes_no(value):
    return "yes" if value else "no"


def table(header, rows, style):
    """Renders the results as a markdown table, or as plain text with +---+ borders."""
    if style == "md":
        return "\n".join(["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
                          + ["| " + " | ".join(r) + " |" for r in rows])
    widths = [max(len(r[i]) for r in [header] + rows) for i in range(len(header))]
    rule = "+" + "+".join("-" * (w + 2) for w in widths) + "+"
    line = lambda cells: "| " + " | ".join(c.ljust(w) for c, w in zip(cells, widths)) + " |"
    return "\n".join([rule, line(header), rule] + [line(r) for r in rows] + [rule])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="Qwen/Qwen2.5-1.5B-Instruct")
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cuda")
    parser.add_argument("--adapter", help="LoRA adapter folder, for the post-training run")
    parser.add_argument("--max-new-tokens", type=int, default=1024)
    parser.add_argument("--recheck", help="Score saved outputs in this folder instead of running a model")
    parser.add_argument("--format", choices=["md", "text"], default="md", help="table style to print")
    args = parser.parse_args()

    prompts = load_prompts()
    if args.recheck:
        out_dir = Path(args.recheck)
        old = out_dir / "results.json"
        runs = {r["prompt"]: r for r in json.loads(old.read_text())["results"]} if old.exists() else {}
    else:
        out_dir = HERE / "outputs" / (args.device + ("-adapter" if args.adapter else ""))
        out_dir.mkdir(parents=True, exist_ok=True)
        print(f"Running {args.model} on {args.device}{' with ' + args.adapter if args.adapter else ''}")
        runs = generate_all(args, prompts, out_dir)

    results, rows = [], []
    for name, prompt in prompts:
        text = (out_dir / f"{name}.txt").read_text()
        run = runs.get(name, {})
        result = {"prompt": name, "scenario": prompt["scenario"], **{k: run.get(k) for k in
                  ("input_tokens", "output_tokens", "seconds", "hit_token_limit")}, **score(prompt, text)}
        results.append(result)

        if result["violations"] is None:
            violations = "n/a"
        else:
            counts = Counter(rule for rule, _, _ in result["violations"])
            violations = str(len(result["violations"]))
            if counts:
                violations += " (" + ", ".join(f"{r}x{c}" if c > 1 else r for r, c in sorted(counts.items())) + ")"
        if result["soft"]:
            violations += f"; soft {result['soft']}"
        rows.append([str(int(name)), prompt["scenario"], yes_no(result["valid_json"]),
                     yes_no(result["matches_schema"]), violations,
                     str(run.get("output_tokens", "")), str(run.get("seconds", ""))])

    (out_dir / "results.json").write_text(json.dumps({"results": results}, indent=2) + "\n")

    seconds_col = "Seconds (CPU)" if "cpu" in out_dir.name else "Seconds (T4)"
    header = ["#", "Scenario", "Valid JSON?", "Matches schema?", "Hard-constraint violations",
              "Output tokens", seconds_col]
    print()
    print(table(header, rows, args.format))

    valid = sum(r["valid_json"] for r in results)
    print(f"\nValid JSON: {valid}/10. Matches schema: {sum(r['matches_schema'] for r in results)}/10.")
    if any(r.get("hit_token_limit") for r in results):
        print("Some outputs hit the token limit and were cut off. See outputs/ for the raw text.")
    for r in results:
        for rule, _, message in r["violations"] or []:
            print(f"  {r['prompt']} {rule}: {message}")
        if r.get("schema_error"):
            print(f"  {r['prompt']} schema: {r['schema_error']}")


if __name__ == "__main__":
    main()
