"""Choosing step: measures each calendar, scores it two ways, and asks the model for 3.

Two scores, on purpose:
- calendar_score uses only the prefs in the scheduling input (focus time, deadline style, calendar
  style, recent ratings) plus general quality. It picks the shortlist the model sees.
- student_fit also uses the whole onboarding survey (non-negotiables like sleep, meals, friends).
  It is the teacher for fine-tuning: training examples label its top 3 as the right answer, so the
  model learns to read the survey instead of copying calendar_score.

The model sees each candidate as one line of measures plus its blocks. Its reply is checked: any
pick that is not a real, distinct candidate id is replaced by the next best calendar by
calendar_score, and the report says so.
"""

import json
import statistics
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

from check import minutes, parse  # eval/check.py
from solver import FOCUS_WINDOWS

HERE = Path(__file__).parent
PICK_PROMPT = (HERE / "pick_prompt.txt").read_text()

LATE = minutes("22:00")
MEALS = [(minutes("12:00"), minutes("13:00")), (minutes("18:00"), minutes("19:00"))]
FOCUS_LABELS = {"early_morning": "early-morning", "morning": "morning", "afternoon": "afternoon",
                "evening": "evening", "late_night": "late-night"}


def tired(inp):
    """True when recent sleep or energy averages 2 or lower."""
    ratings = inp.get("recent_ratings") or []
    if not ratings:
        return False
    return min(statistics.mean(r["sleep"] for r in ratings), statistics.mean(r["energy"] for r in ratings)) <= 2


def features(inp, cal):
    tasks = {t["id"]: t for t in inp["tasks"]}
    week_start = date.fromisoformat(inp["week"]["start"])
    blocks = [(b, minutes(b["start"]), minutes(b["end"]), date.fromisoformat(b["date"])) for b in cal["blocks"]]
    total = sum(e - s for _, s, e, _ in blocks) or 1
    session = inp["prefs"]["session_minutes"]

    window = FOCUS_WINDOWS.get(inp["prefs"]["focus_time"])
    lo, hi = (minutes(x) for x in window) if window else (0, 0)
    in_focus = sum(max(0, min(e, hi) - max(s, lo)) for _, s, e, _ in blocks)
    # Minutes-weighted hours from the focus window: 0 inside it, 6 for a block 6 hours away.
    off = sum((e - s) * (max(0, lo - s) + max(0, e - hi)) / 2 for _, s, e, _ in blocks) / total / 60

    per_day = defaultdict(int)
    for b, s, e, _ in blocks:
        per_day[b["date"]] += e - s
    n_days = (date.fromisoformat(inp["week"]["end"]) - week_start).days + 1
    all_days = [date.fromordinal(week_start.toordinal() + i).isoformat() for i in range(n_days)]
    daily = [per_day.get(d, 0) for d in all_days if d != inp["day_off"]]
    front = sum(e - s for _, s, e, d in blocks if (d - week_start).days < 3)

    last_end = {}
    for b, s, e, _ in blocks:
        end = datetime.fromisoformat(f"{b['date']}T{b['end']}")
        last_end[b["task"]] = max(last_end.get(b["task"], end), end)
    slack = [(datetime.fromisoformat(tasks[t]["due"]) - end).total_seconds() / 3600 for t, end in last_end.items()]

    # Back-to-back: a block that starts within 10 minutes of the end of another block or commitment.
    b2b = 0
    for b, s, _, _ in blocks:
        others = [minutes(f["end"]) for f in inp["fixed"] if f["date"] == b["date"]]
        others += [minutes(o["end"]) for o in cal["blocks"] if o["date"] == b["date"] and o is not b]
        b2b += any(0 <= s - end < 10 for end in others)

    dropped = {u["task"]: u["minutes"] for u in cal["unscheduled"]}
    return {
        "focus": round(100 * in_focus / total),
        "off_focus": round(off, 1),
        "slack": round(statistics.mean(slack)) if slack else 0,
        "front": round(100 * front / total),
        "max_day": max(daily, default=0),
        "spread": round(statistics.pstdev(daily)) if daily else 0,
        "days": sum(1 for m in daily if m),
        "free_days": sum(1 for m in daily if not m),
        "b2b": b2b,
        "short": sum(1 for _, s, e, _ in blocks if e - s < min(30, session)),
        "late": sum(1 for _, _, e, _ in blocks if e > LATE),
        "latest": max((b["end"] for b, _, _, _ in blocks), default="--:--"),
        "meal": sum(1 for _, s, e, _ in blocks if any(s < me and ms < e for ms, me in MEALS)),
        "fri_sat_eve": sum(max(0, e - max(s, minutes("18:00"))) for _, s, e, d in blocks if d.weekday() in (4, 5)),
        "sunday": sum(e - s for _, s, e, d in blocks if d.weekday() == 6),
        "unscheduled": sum(dropped.values()),
        "high": sum(m for t, m in dropped.items() if tasks[t]["priority"] == "high"),
    }


def _norm(feats, name):
    values = [f[name] for f in feats]
    low, high = min(values), max(values)
    return [(v - low) / (high - low) if high > low else 0.5 for v in values]


def _style(prefs, parts, i, strength):
    s = 0
    if prefs["deadline_style"] == "steady":
        s += 2 * parts["slack"][i]
    elif prefs["deadline_style"] in ("day_before", "night_before"):
        s += 1.5 * (1 - parts["slack"][i])
    style = prefs["calendar_style"]
    if style == "calendar1":
        s += 1.5 * parts["b2b"][i]
    elif style == "calendar2":
        s += parts["days"][i] + (1 - parts["b2b"][i])
    elif style == "calendar3":
        s += 2 * parts["front"][i]
    elif style == "calendar4":
        s += (1 - parts["max_day"][i]) + (1 - parts["spread"][i])
    return strength * s


def calendar_score(inp, feats):
    """Score from the scheduling prefs only. Picks the shortlist, and fills in bad model picks."""
    prefs = inp["prefs"]
    total = sum(t["minutes"] for t in inp["tasks"]) or 1
    parts = {n: _norm(feats, n) for n in ("slack", "front", "max_day", "spread", "days", "b2b")}
    night_owl = prefs["focus_time"] == "late_night"
    out = []
    for i, f in enumerate(feats):
        s = 3 * f["focus"] / 100 - f["off_focus"] - 0.4 * f["short"]
        s -= 6 * (f["unscheduled"] + f["high"]) / total
        s -= (0 if night_owl else 0.3) * f["late"] + (0.7 * f["late"] if tired(inp) else 0)
        s += _style(prefs, parts, i, 1)
        out.append(round(s, 2))
    return out


def student_fit(inp, survey, feats):
    """Score from the prefs and the whole survey. The fine-tuning teacher: it knows things
    calendar_score doesn't (sleep, meals, exercise, friends, family, hobby)."""
    prefs = inp["prefs"]
    musts = set((survey or {}).get("non_negotiables", []))
    total = sum(t["minutes"] for t in inp["tasks"]) or 1
    parts = {n: _norm(feats, n) for n in ("slack", "front", "max_day", "spread", "days", "b2b")}
    out = []
    for i, f in enumerate(feats):
        s = 3 * f["focus"] / 100 - 1.5 * f["off_focus"] - 0.5 * f["short"]
        s -= 6 * (f["unscheduled"] + f["high"]) / total
        s += _style(prefs, parts, i, 1.5)
        if "sleep" in musts or tired(inp):
            s -= 1.0 * f["late"]
        if "meals" in musts:
            s -= 0.6 * f["meal"]
        if "exercise" in musts:
            s -= max(0, f["max_day"] - 240) / 60
        if "friends" in musts:
            s -= f["fri_sat_eve"] / 60
        if "family" in musts:
            s -= f["sunday"] / 90
        if "hobby" in musts:
            s += 0.5 * min(f["free_days"], 2)
        out.append(round(s, 2))
    return out


def plural(n, word):
    return f"{n} {word}" + ("" if n == 1 else "s")


def reason(inp, survey, f, others):
    """One sentence built from the calendar's real measures: the training target for each pick."""
    prefs = inp["prefs"]
    musts = set((survey or {}).get("non_negotiables", []))
    label = FOCUS_LABELS.get(prefs["focus_time"], prefs["focus_time"])
    goods, bads = [], []

    if f["focus"] >= 50:
        goods.append(f"{f['focus']}% of study is in your {label} focus hours")
    elif max(o["focus"] for o in others) == 0:
        goods.append(f"no option can use your {label} hours, and this one stays about "
                     f"{f['off_focus']:g} hours from them on average")
    if ("sleep" in musts or tired(inp)) and prefs["focus_time"] != "late_night":
        (goods if f["late"] == 0 else bads).append(
            "nothing runs past 10 pm, which protects your sleep" if f["late"] == 0
            else f"{plural(f['late'], 'block')} run{'s' if f['late'] == 1 else ''} past 10 pm")
    if "meals" in musts:
        (goods if f["meal"] == 0 else bads).append(
            "lunch and dinner stay free" if f["meal"] == 0
            else f"{plural(f['meal'], 'block')} overlap{'s' if f['meal'] == 1 else ''} a meal time")
    if "friends" in musts and f["fri_sat_eve"] == 0:
        goods.append("Friday and Saturday evenings stay free for friends")
    if "family" in musts and f["sunday"] == 0:
        goods.append("Sunday stays free for family")
    if "hobby" in musts and f["free_days"]:
        goods.append(f"{plural(f['free_days'], 'day')} with no study leave{'s' if f['free_days'] == 1 else ''} room "
                     "for your hobby")
    if "exercise" in musts and f["max_day"] <= 240:
        goods.append(f"no day has more than {f['max_day']} minutes of study, so there is time to exercise")
    if prefs["deadline_style"] == "steady" and f["slack"] >= 24:
        goods.append(f"work finishes about {plural(f['slack'] // 24, 'day')} before each deadline")
    if prefs["deadline_style"] in ("day_before", "night_before") and f["slack"] < 24:
        goods.append("work lands close to the deadlines, the way you like")
    style = prefs["calendar_style"]
    if style == "calendar2" and f["b2b"] == 0:
        goods.append("sessions are spaced out with breaks")
    if style == "calendar3" and f["front"] >= 70:
        goods.append(f"{f['front']}% of the work is done in the first three days")
    if style == "calendar4":
        goods.append(f"the heaviest day is {f['max_day']} minutes")
    if style == "calendar1" and f["b2b"] >= 2:
        goods.append("sessions run back to back in longer stretches")
    if f["unscheduled"] == 0 and any(o["unscheduled"] for o in others):
        goods.append("everything fits")
    if f["focus"] < 50 and max(o["focus"] for o in others) >= 50:
        bads.append(f"only {f['focus']}% of study is in your {label} hours")
    elif f["off_focus"] >= 2 and f["focus"] < 50:
        bads.append(f"study is on average {f['off_focus']:g} hours outside your focus time")

    text = " and ".join(goods[:2]) if goods else "it is the best balance of your preferences among these options"
    text = text[0].upper() + text[1:]
    if bads:
        text += f"; the trade-off is that {bads[0]}"
    return text + "."


def describe(cid, cal, f):
    blocks = "; ".join(f"{date.fromisoformat(b['date']).strftime('%a')} {b['start']}-{b['end']} {b['task']}"
                       for b in cal["blocks"])
    return (f"{cid} | focus {f['focus']}% | off_focus {f['off_focus']:g}h | slack {f['slack']}h | front {f['front']}%"
            f" | max_day {f['max_day']}m | spread {f['spread']} | days {f['days']} | free_days {f['free_days']}"
            f" | b2b {f['b2b']} | short {f['short']} | late {f['late']} | latest {f['latest']} | meal {f['meal']}"
            f" | fri_sat_eve {f['fri_sat_eve']}m | sunday {f['sunday']}m"
            f" | unscheduled {f['unscheduled']}m (high {f['high']}m) | {blocks}")


def build_messages(inp, survey, ids, cals, feats):
    student = {
        "prefs": inp["prefs"],
        "survey": survey,
        "day_off": inp["day_off"],
        "available": inp["available"],
        "tired": tired(inp),
        "tasks": [{k: t[k] for k in ("id", "title", "priority", "due", "minutes")} for t in inp["tasks"]],
    }
    lines = [describe(cid, cals[cid], feats[cid]) for cid in ids]
    user = ("Student:\n" + json.dumps(student, separators=(",", ":"))
            + f"\n\nCandidates ({len(ids)}):\n" + "\n".join(lines))
    return [{"role": "system", "content": PICK_PROMPT}, {"role": "user", "content": user}]


def target(picks):
    """The assistant reply for a training example."""
    return json.dumps({"picks": [{"id": cid, "reason": r} for cid, r in picks]})


def load_model(model_name, device, adapter=None):
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    dtype = torch.float32 if device == "cpu" else torch.float16
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForCausalLM.from_pretrained(model_name, dtype=dtype).to(device)
    if adapter:
        from peft import PeftModel
        model = PeftModel.from_pretrained(model, adapter)
    model.eval()
    return tokenizer, model, device


def generate(tokenizer, model, device, messages, max_new_tokens=400):
    import torch

    ids = tokenizer.apply_chat_template(messages, add_generation_prompt=True, return_tensors="pt",
                                        return_dict=True).to(device)
    with torch.no_grad():
        out = model.generate(**ids, max_new_tokens=max_new_tokens, do_sample=False,
                             temperature=None, top_p=None, top_k=None, pad_token_id=tokenizer.eos_token_id)
    new_tokens = out[0][ids["input_ids"].shape[1]:]
    return tokenizer.decode(new_tokens, skip_special_tokens=True), ids["input_ids"].shape[1], len(new_tokens)


def read_picks(text, allowed, ranked, n=3):
    """Returns [{"id", "reason", "source"}] with n distinct picks. "source" is "ai" or "score" (filled in)."""
    picks = []
    reply = parse(text) if text else None
    raw = reply.get("picks", []) if isinstance(reply, dict) else []
    for p in raw if isinstance(raw, list) else []:
        if not isinstance(p, dict):
            continue
        cid = str(p.get("id", "")).strip()
        if cid in allowed and cid not in {x["id"] for x in picks}:
            picks.append({"id": cid, "reason": str(p.get("reason", "")), "source": "ai"})
        if len(picks) == n:
            break
    for cid in ranked:
        if len(picks) == n:
            break
        if cid not in {x["id"] for x in picks}:
            picks.append({"id": cid, "reason": "Next best by calendar score.", "source": "score"})
    return picks
