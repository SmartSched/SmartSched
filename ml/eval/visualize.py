"""Draws a model's output as a week calendar so it can be read at a glance.

In Colab:
    import sys; sys.path.insert(0, "eval")
    from visualize import show, show_all
    show(4)                      # scenario 4, from outputs/cuda
    show(4, "outputs/cpu")
    show_all()                   # all 10, one after another

From the terminal (writes an HTML file and prints its path):
    python visualize.py --outputs outputs/cuda --html week.html
    python visualize.py --outputs outputs/cuda --prompt 4 --html week.html

Grey blocks are the student's fixed commitments, coloured blocks are what the model planned,
and a red dashed border means that block breaks a hard constraint. Hover a block for details.
"""

import argparse
import html
import json
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

from check import HERE, check_constraints, check_soft, minutes, overlaps, parse

SLOT = 15  # minutes per calendar row
TASK_COLORS = ["#cfe3ff", "#d6f5d6", "#ffe3c2", "#f2d9f7", "#fff3b0", "#c9f0ef", "#ffd6d6", "#e2e0ff"]
FIXED_COLOR = "#e4e4e7"
DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

CSS = """
<style>
.sched { font: 13px -apple-system, Segoe UI, sans-serif; color: #18181b; margin-bottom: 28px; }
.sched h3 { margin: 0 0 2px; font-size: 16px; }
.sched .meta { color: #52525b; margin-bottom: 10px; }
.sched table { border-collapse: collapse; }
.sched th, .sched td { border: 1px solid #d4d4d8; padding: 0; }
.sched th { background: #fafafa; font-weight: 600; padding: 3px 6px; font-size: 12px; }
.sched td.time { width: 54px; color: #71717a; font-size: 11px; text-align: right;
                 padding: 0 5px; vertical-align: top; border-right: 1px solid #a1a1aa; }
.sched td.hour { border-top: 1px solid #a1a1aa; }
.sched td.lane { width: 88px; height: 15px; }
.sched td.off { background: repeating-linear-gradient(45deg, #fafafa, #fafafa 5px, #ececf0 5px, #ececf0 10px); }
.sched .blk { height: 100%; border-radius: 3px; padding: 1px 4px; font-size: 11px;
              line-height: 1.25; overflow: hidden; box-sizing: border-box; }
.sched .bad { border: 2px dashed #dc2626; }
.sched .sum { margin-top: 10px; border-collapse: collapse; }
.sched .sum th, .sched .sum td { border: 1px solid #d4d4d8; padding: 3px 7px; text-align: left; font-size: 12px; }
.sched .ok { color: #15803d; } .sched .no { color: #b91c1c; }
.sched ul { margin: 8px 0 0; padding-left: 18px; color: #b91c1c; font-size: 12px; }
.sched ul li { margin-bottom: 2px; }
</style>
"""


def hhmm(total):
    return f"{total // 60:02d}:{total % 60:02d}"


def week_dates(inp):
    start = date.fromisoformat(inp["week"]["start"])
    end = date.fromisoformat(inp["week"]["end"])
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def lanes_for(items):
    """Packs items into lanes so overlapping ones sit side by side. Returns a list of lanes."""
    lanes = []
    for item in sorted(items, key=lambda x: (x["start"], x["end"])):
        for lane in lanes:
            if all(not overlaps(item["start"], item["end"], other["start"], other["end"]) for other in lane):
                lane.append(item)
                break
        else:
            lanes.append([item])
    return lanes


def collect(inp, out, violations):
    """Returns {date: {"fixed": [...], "plan": [...]}} with one entry per block."""
    by_block = defaultdict(list)
    for rule, index, _ in violations:
        if index is not None:
            by_block[index].append(rule)
    tasks = {t["id"]: t for t in inp["tasks"]}
    colors = {t["id"]: TASK_COLORS[i % len(TASK_COLORS)] for i, t in enumerate(inp["tasks"])}

    days = defaultdict(lambda: {"fixed": [], "plan": []})
    for f in inp["fixed"]:
        days[f["date"]]["fixed"].append({
            "start": minutes(f["start"]), "end": minutes(f["end"]), "label": f["label"],
            "sub": f["type"], "color": FIXED_COLOR, "rules": [],
        })
    for i, b in enumerate(out["blocks"]):
        try:
            start, end = minutes(b["start"]), minutes(b["end"])
        except ValueError:
            continue
        task = tasks.get(b["task"])
        days[b["date"]]["plan"].append({
            "start": start, "end": max(end, start + SLOT), "real_end": end,
            "label": task["title"] if task else f"{b['task']}?",
            "sub": f"{b['task']} · {max(0, end - start)}m", "color": colors.get(b["task"], "#fecaca"),
            "rules": sorted(set(by_block.get(i, []))),
        })
    return days


def calendar_html(inp, out, violations):
    days = collect(inp, out, violations)
    dates = week_dates(inp)
    day_lanes = {}
    for d in dates:
        key = d.isoformat()
        day_lanes[key] = {kind: lanes_for(days[key][kind]) or [[]] for kind in ("fixed", "plan")}

    starts = [minutes(inp["available"]["start"])]
    ends = [minutes(inp["available"]["end"])]
    for key in day_lanes:
        for kind in ("fixed", "plan"):
            for lane in day_lanes[key][kind]:
                starts += [item["start"] for item in lane]
                ends += [item["end"] for item in lane]
    first = min(starts) // SLOT * SLOT
    last = -(-max(ends) // SLOT) * SLOT
    slots = list(range(first, last, SLOT))

    # grid[slot][(date, kind, lane)] is a block to open, "covered", or None
    grid = defaultdict(dict)
    columns = []
    for d in dates:
        key = d.isoformat()
        for kind in ("fixed", "plan"):
            for lane_index, lane in enumerate(day_lanes[key][kind]):
                columns.append((key, kind, lane_index))
                for item in lane:
                    top = item["start"] // SLOT * SLOT
                    span = max(1, -(-(item["end"] - top) // SLOT))
                    grid[top][(key, kind, lane_index)] = (item, span)
                    for covered in range(1, span):
                        grid[top + covered * SLOT][(key, kind, lane_index)] = "covered"

    head1 = ['<th rowspan="2" class="time"></th>']
    head2 = []
    for d in dates:
        key = d.isoformat()
        width = len(day_lanes[key]["fixed"]) + len(day_lanes[key]["plan"])
        head1.append(f'<th colspan="{width}">{DAY_NAMES[d.weekday()]} {d.strftime("%b %-d")}'
                     + (" · day off" if inp["day_off"] == key else "") + "</th>")
        head2.append(f'<th colspan="{len(day_lanes[key]["fixed"])}">fixed</th>')
        head2.append(f'<th colspan="{len(day_lanes[key]["plan"])}">plan</th>')

    avail_start, avail_end = minutes(inp["available"]["start"]), minutes(inp["available"]["end"])
    rows = []
    for slot in slots:
        on_hour = slot % 60 == 0
        cells = [f'<td class="time{" hour" if on_hour else ""}">{hhmm(slot) if on_hour else ""}</td>']
        for column in columns:
            cell = grid[slot].get(column)
            if cell == "covered":
                continue
            classes = "lane" + (" hour" if on_hour else "")
            if cell is None:
                outside = slot < avail_start or slot + SLOT > avail_end
                cells.append(f'<td class="{classes}{" off" if outside else ""}"></td>')
                continue
            item, span = cell
            tip = html.escape(f"{item['label']} {hhmm(item['start'])}-{hhmm(item.get('real_end', item['end']))}"
                              + (" | breaks " + ", ".join(item["rules"]) if item["rules"] else ""))
            flag = " " + " ".join(item["rules"]) if item["rules"] else ""
            cells.append(
                f'<td class="{classes}" rowspan="{span}" title="{tip}">'
                f'<div class="blk{" bad" if item["rules"] else ""}" style="background:{item["color"]}">'
                f'<b>{html.escape(item["label"])}</b><br>{html.escape(item["sub"])}'
                f'<span class="no">{html.escape(flag)}</span></div></td>')
        rows.append("<tr>" + "".join(cells) + "</tr>")

    return (f'<table><tr>{"".join(head1)}</tr><tr>{"".join(head2)}</tr>' + "".join(rows) + "</table>")


def summary_html(inp, out, violations, soft):
    scheduled = defaultdict(int)
    for b in out["blocks"]:
        try:
            scheduled[b["task"]] += max(0, minutes(b["end"]) - minutes(b["start"]))
        except ValueError:
            pass
    unscheduled = defaultdict(int)
    for u in out["unscheduled"]:
        unscheduled[u["task"]] += u["minutes"]

    rows = []
    for t in inp["tasks"]:
        done, left = scheduled[t["id"]], unscheduled[t["id"]]
        short = t["minutes"] - done - left
        state = ('<span class="ok">accounted for</span>' if short == 0 else
                 f'<span class="no">{short} min missing</span>' if short > 0 else
                 f'<span class="no">{-short} min too many</span>')
        rows.append(f"<tr><td>{t['id']}</td><td>{html.escape(t['title'])}</td><td>{t['due'].replace('T', ' ')}</td>"
                    f"<td>{t['minutes']}</td><td>{done}</td><td>{left}</td><td>{state}</td></tr>")

    table = ('<table class="sum"><tr><th>id</th><th>task</th><th>due</th><th>needs</th>'
             '<th>scheduled</th><th>unscheduled</th><th></th></tr>' + "".join(rows) + "</table>")
    if violations:
        table += "<ul>" + "".join(f"<li>{html.escape(rule + ': ' + message)}</li>"
                                  for rule, _, message in violations) + "</ul>"
    if soft:
        table += f'<div class="meta" style="margin-top:6px">soft check — {html.escape(soft)}</div>'
    return table


def render(n, outputs="outputs/cuda"):
    """Returns the HTML for one scenario."""
    name = f"{int(n):02d}"
    prompt = json.loads((HERE / "prompts" / f"{name}.json").read_text())
    path = Path(outputs)
    if not path.is_absolute() and not path.exists():
        path = HERE / outputs
    text = (path / f"{name}.txt").read_text()
    inp = prompt["input"]

    header = (f'<div class="sched"><h3>{name}. {html.escape(prompt["scenario"])}</h3>'
              f'<div class="meta">{outputs} · focus {inp["prefs"]["focus_time"]} · '
              f'sessions up to {inp["prefs"]["session_minutes"]} min · '
              f'available {inp["available"]["start"]}–{inp["available"]["end"]}</div>')
    out = parse(text)
    if out is None:
        return header + '<div class="no">Output was not valid JSON.</div><pre>' + html.escape(text) + "</pre></div>"

    violations = check_constraints(inp, out)
    soft = check_soft(prompt["soft"], out)
    count = f'<span class="ok">no hard-constraint violations</span>' if not violations \
        else f'<span class="no">{len(violations)} hard-constraint violation(s)</span>'
    note = html.escape(out.get("note", ""))
    return (header + f'<div class="meta">{count} · note: {note}</div>'
            + calendar_html(inp, out, violations) + summary_html(inp, out, violations, soft) + "</div>")


def show(n, outputs="outputs/cuda"):
    """Displays one scenario in a notebook."""
    from IPython.display import HTML, display
    display(HTML(CSS + render(n, outputs)))


def show_all(outputs="outputs/cuda"):
    from IPython.display import HTML, display
    display(HTML(CSS + "".join(render(n, outputs) for n in range(1, 11))))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--outputs", default="outputs/cuda")
    parser.add_argument("--prompt", type=int, help="one scenario (1-10); all of them by default")
    parser.add_argument("--html", default="week.html")
    args = parser.parse_args()

    scenarios = [args.prompt] if args.prompt else range(1, 11)
    body = "".join(render(n, args.outputs) for n in scenarios)
    out = Path(args.html)
    out.write_text(f"<!doctype html><meta charset=utf-8><title>SmartSched outputs</title>{CSS}{body}")
    print(f"Wrote {out.resolve()}")


if __name__ == "__main__":
    main()
