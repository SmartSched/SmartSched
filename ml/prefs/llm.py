"""The model step: context bundle in, preference JSON out.

  python llm.py --mode zero --out preds/base_zero.jsonl                        # base model, rules only
  python llm.py --mode few --out preds/base_few.jsonl                          # + 2 worked examples
  python llm.py --mode zero --adapter adapter_prefs --out preds/tuned.jsonl    # fine-tuned

Runs on data/test.jsonl (made by make_data.py) and writes one {"id", "text", "seconds"} line per
persona. evaluate.py reads these. Generation is greedy (same output every run) and batched, with
left padding, so 64 personas take minutes instead of half an hour.

read() is what the app would call: it parses the reply, cleans it with schema.clean, and falls back
to the survey-only preferences when nothing usable comes back.
"""

import argparse
import json
import re
import time
from pathlib import Path

import baseline
from schema import clean, dumps

HERE = Path(__file__).parent
SYSTEM_PROMPT = (HERE / "system_prompt.txt").read_text()
FENCE = re.compile(r"^```[a-zA-Z]*\s*\n(.*?)\n?```$", re.DOTALL)


def messages(bundle, shots=()):
    """shots: [(bundle, label JSON)] worked examples, shown as earlier turns of the conversation."""
    out = [{"role": "system", "content": SYSTEM_PROMPT}]
    for shot_bundle, shot_label in shots:
        out += [{"role": "user", "content": shot_bundle}, {"role": "assistant", "content": dumps(shot_label)}]
    return out + [{"role": "user", "content": bundle}]


def parse(text):
    """The first JSON object in the reply (a ```json fence or text around it is tolerated), or None."""
    text = text.strip()
    match = FENCE.match(text)
    if match:
        text = match.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                return None
    return None


def read(text, survey):
    """Returns (prefs, info). info says whether the reply parsed and what clean() had to fix."""
    raw = parse(text) if text else None
    if raw is None:
        return baseline.from_survey(survey), {"parsed": False, "problems": ["reply is not JSON"], "fallback": True}
    prefs, problems = clean(raw)
    return prefs, {"parsed": True, "problems": problems, "fallback": False}


def load_model(name, adapter=None):
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    tokenizer = AutoTokenizer.from_pretrained(name, padding_side="left")
    model = AutoModelForCausalLM.from_pretrained(
        name, dtype=torch.float32 if device == "cpu" else torch.float16).to(device)
    if adapter:
        from peft import PeftModel
        model = PeftModel.from_pretrained(model, adapter)
    model.eval()
    return tokenizer, model, device


def generate(tokenizer, model, device, batch, max_new_tokens=1024):
    """Greedy replies for a list of message lists."""
    import torch

    texts = [tokenizer.apply_chat_template(m, add_generation_prompt=True, tokenize=False) for m in batch]
    enc = tokenizer(texts, return_tensors="pt", padding=True).to(device)
    with torch.no_grad():
        out = model.generate(**enc, max_new_tokens=max_new_tokens, do_sample=False, temperature=None, top_p=None,
                             top_k=None, pad_token_id=tokenizer.pad_token_id or tokenizer.eos_token_id)
    return [tokenizer.decode(row[enc["input_ids"].shape[1]:], skip_special_tokens=True) for row in out]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["zero", "few"], default="zero")
    parser.add_argument("--data", default=str(HERE / "data"))
    parser.add_argument("--model", default="Qwen/Qwen2.5-1.5B-Instruct")
    parser.add_argument("--adapter")
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--n", type=int, help="only the first n test personas")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    data = Path(args.data)
    rows = [json.loads(line) for line in (data / "test.jsonl").read_text().splitlines() if line.strip()][:args.n]
    shots = []
    if args.mode == "few":
        shots = [(s["bundle"], s["label"]) for s in map(json.loads, (data / "shots.jsonl").read_text().splitlines())]
    # Longest first, so padding inside each batch stays small.
    rows.sort(key=lambda r: -len(r["bundle"]))

    tokenizer, model, device = load_model(args.model, args.adapter)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()
    with out.open("w") as f:
        for i in range(0, len(rows), args.batch):
            batch = rows[i:i + args.batch]
            t = time.perf_counter()
            replies = generate(tokenizer, model, device, [messages(r["bundle"], shots) for r in batch])
            seconds = (time.perf_counter() - t) / len(batch)
            for r, text in zip(batch, replies):
                f.write(json.dumps({"id": r["id"], "text": text, "seconds": round(seconds, 1)}) + "\n")
            print(f"  {min(i + args.batch, len(rows))}/{len(rows)}  {(time.perf_counter() - started) / 60:.1f} min",
                  flush=True)
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
