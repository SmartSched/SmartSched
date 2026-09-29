"""LoRA fine-tuning of the picker model on train/train.jsonl (made by make_train.py).

  python finetune.py                                  # Qwen2.5-1.5B-Instruct, 1 epoch, saves adapter/
  python finetune.py --epochs 2 --out adapter2
  python plan.py ../eval/prompts/04.json --adapter adapter   # then use it
  python finetune.py --train ../prefs/data/train.jsonl --val ../prefs/data/val.jsonl --out adapter_prefs
                                                      # the preference reader (see prefs/colab_prefs.ipynb)

Only the reply (the 3 picks and reasons) is trained on; the prompt is context. The model only computes
logits for the reply tokens, because a prompt can be 7k tokens and Qwen's vocabulary has 152k entries,
so full logits would not fit on a T4.
"""

import argparse
import json
import math
import random
import time
from pathlib import Path

import torch
from peft import LoraConfig, get_peft_model
from transformers import AutoModelForCausalLM, AutoTokenizer

HERE = Path(__file__).parent


def encode(tokenizer, messages, max_len):
    """Returns (token ids, where the reply starts), or None when the example is longer than max_len."""
    prompt = tokenizer.apply_chat_template(messages[:-1], add_generation_prompt=True, tokenize=True,
                                           return_dict=True)["input_ids"]
    full = tokenizer.apply_chat_template(messages, tokenize=True, return_dict=True)["input_ids"]
    assert full[:len(prompt)] == prompt, "chat template doesn't extend the prompt with the reply"
    return (full, len(prompt)) if len(full) <= max_len else None


def load(path, tokenizer, max_len):
    rows = [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]
    encoded = [encode(tokenizer, r["messages"], max_len) for r in rows]
    kept = [e for e in encoded if e]
    if len(kept) < len(rows):
        print(f"  skipped {len(rows) - len(kept)} of {len(rows)} examples in {path} longer than {max_len} tokens")
    return kept


def reply_loss(model, ids, start, device, autocast):
    """Cross-entropy on the reply tokens only."""
    x = torch.tensor([ids], device=device)
    with torch.autocast(device_type=device, dtype=torch.float16, enabled=autocast):
        # logits_to_keep keeps the last k positions; position i predicts token i + 1.
        logits = model(input_ids=x, logits_to_keep=len(ids) - start + 1).logits[0, :-1]
    return torch.nn.functional.cross_entropy(logits.float(), x[0, start:])


def evaluate(model, data, device, autocast):
    model.eval()
    with torch.no_grad():
        losses = [reply_loss(model, ids, start, device, autocast).item() for ids, start in data]
    model.train()
    return sum(losses) / len(losses)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="Qwen/Qwen2.5-1.5B-Instruct")
    parser.add_argument("--train", default=str(HERE / "train" / "train.jsonl"))
    parser.add_argument("--val", default=str(HERE / "train" / "val.jsonl"))
    parser.add_argument("--out", default="adapter")
    parser.add_argument("--epochs", type=float, default=1)
    parser.add_argument("--lr", type=float, default=2e-4)
    parser.add_argument("--accum", type=int, default=8, help="examples per optimizer step")
    parser.add_argument("--rank", type=int, default=16, help="LoRA rank")
    parser.add_argument("--max-len", type=int, default=8192)
    parser.add_argument("--limit", type=int, help="use only this many training examples (for a quick test)")
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    torch.manual_seed(args.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    autocast = device == "cuda"  # fp16 weights and autocast on the GPU; plain fp32 on CPU
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForCausalLM.from_pretrained(
        args.model, dtype=torch.float16 if autocast else torch.float32).to(device)
    model.config.use_cache = False
    model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
    model = get_peft_model(model, LoraConfig(
        r=args.rank, lora_alpha=2 * args.rank, lora_dropout=0.05, task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]))
    model.print_trainable_parameters()

    train = load(args.train, tokenizer, args.max_len)[:args.limit]
    val = load(args.val, tokenizer, args.max_len)[:args.limit]
    tokens = sum(len(ids) for ids, _ in train)
    print(f"{len(train)} training examples ({tokens:,} tokens), {len(val)} validation examples on {device}")

    params = [p for p in model.parameters() if p.requires_grad]
    optimizer = torch.optim.AdamW(params, lr=args.lr, weight_decay=0.0)
    total_steps = max(1, math.ceil(len(train) * args.epochs / args.accum))
    warmup = max(1, total_steps // 10)
    # Linear warmup for the first 10% of steps, then cosine decay to 0.
    progress = lambda step: min(1.0, max(0.0, (step - warmup) / max(1, total_steps - warmup)))  # noqa: E731
    schedule = torch.optim.lr_scheduler.LambdaLR(optimizer, lambda step: min(
        (step + 1) / warmup, 0.5 * (1 + math.cos(math.pi * progress(step)))))
    scaler = torch.amp.GradScaler(device, enabled=autocast)

    log = {"model": args.model, "examples": len(train), "epochs": args.epochs, "lr": args.lr, "rank": args.rank,
           "val_loss_before": evaluate(model, val, device, autocast), "steps": []}
    print(f"validation loss before: {log['val_loss_before']:.3f}")

    rng = random.Random(args.seed)
    order = []
    while len(order) < len(train) * args.epochs:
        order += rng.sample(range(len(train)), len(train))
    order = order[:int(len(train) * args.epochs)]

    model.train()
    started, running = time.perf_counter(), []
    for i, index in enumerate(order, start=1):
        ids, start = train[index]
        loss = reply_loss(model, ids, start, device, autocast)
        scaler.scale(loss / args.accum).backward()
        running.append(loss.item())
        if i % args.accum == 0 or i == len(order):
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(params, 1.0)
            scaler.step(optimizer)
            scaler.update()
            optimizer.zero_grad(set_to_none=True)
            schedule.step()
            step = len(log["steps"]) + 1
            mean = sum(running) / len(running)
            log["steps"].append(round(mean, 4))
            running = []
            if step % 10 == 0 or step == total_steps:
                elapsed = time.perf_counter() - started
                print(f"  step {step}/{total_steps}  loss {mean:.3f}  {elapsed / 60:.1f} min", flush=True)

    log["val_loss_after"] = evaluate(model, val, device, autocast)
    log["minutes"] = round((time.perf_counter() - started) / 60, 1)
    print(f"validation loss after: {log['val_loss_after']:.3f} (was {log['val_loss_before']:.3f})")
    out = Path(args.out)
    model.save_pretrained(out)
    (out / "train_log.json").write_text(json.dumps(log, indent=1) + "\n")
    print(f"Saved adapter to {out.resolve()}")


if __name__ == "__main__":
    main()
