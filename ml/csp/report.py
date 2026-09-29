"""HTML report: the model's 3 picks as full week calendars, then every solver calendar as a small card.

The full calendars reuse eval/visualize.py. The cards are a compact week (one column per day, grey
for fixed commitments, task colours for study blocks) so a few hundred of them still load quickly.
"""

import html
import json

from check import minutes  # eval/check.py
from visualize import CSS, FIXED_COLOR, TASK_COLORS, calendar_html, summary_html, week_dates

EXTRA_CSS = """
<style>
body { font: 13px -apple-system, Segoe UI, sans-serif; color: #18181b; margin: 24px; background: #fff; }
h1 { font-size: 20px; margin: 0 0 4px; } h2 { font-size: 17px; margin: 28px 0 10px; }
.meta { color: #52525b; }
.pick { border: 2px solid #6366f1; border-radius: 8px; padding: 12px 14px; margin-bottom: 18px; overflow-x: auto; }
.pick.score { border-color: #a1a1aa; }
.rank { display: inline-block; background: #6366f1; color: #fff; border-radius: 10px; padding: 1px 8px;
        font-weight: 600; margin-right: 6px; }
.pick.score .rank { background: #71717a; }
.feats { color: #3f3f46; font-size: 12px; margin: 4px 0 10px; }
.legend span { display: inline-block; padding: 1px 6px; border-radius: 3px; margin-right: 6px; font-size: 12px; }
.controls { margin: 6px 0 12px; } .controls select, .controls label { margin-right: 10px; font-size: 13px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
.card { border: 1px solid #d4d4d8; border-radius: 6px; padding: 6px 8px; }
.card.picked { border: 2px solid #6366f1; background: #f5f5ff; }
.card .top { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 3px; }
.card .f { font-size: 11px; color: #52525b; margin-bottom: 4px; }
.mini { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.mini .d { position: relative; height: 120px; background: #fafafa; border-radius: 2px; }
.mini .d.off { background: repeating-linear-gradient(45deg, #fafafa, #fafafa 4px, #ececf0 4px, #ececf0 8px); }
.mini .h { font-size: 9px; color: #71717a; text-align: center; }
.mini .b { position: absolute; left: 1px; right: 1px; border-radius: 2px; min-height: 2px; }
.mini .b.fx { background: #e4e4e7; }
pre { background: #f4f4f5; padding: 8px; white-space: pre-wrap; font-size: 12px; }
</style>
"""

SORT_JS = """
<script>
function sortCards(by) {
  const grid = document.getElementById('grid');
  const cards = [...grid.children];
  cards.sort((a, b) => by === 'id' ? a.dataset.id.localeCompare(b.dataset.id)
                                   : Number(b.dataset[by]) - Number(a.dataset[by]));
  cards.forEach(c => grid.appendChild(c));
}
function onlyShortlist(on) {
  document.querySelectorAll('#grid .card').forEach(c => {
    c.style.display = on && c.dataset.short !== '1' ? 'none' : '';
  });
}
</script>
"""


def feat_text(f, score, fit):
    return (f"focus {f['focus']}% · {f['off_focus']:g}h off focus · slack {f['slack']}h · front {f['front']}% · "
            f"max day {f['max_day']}m · spread {f['spread']} · {f['days']} days · b2b {f['b2b']} · "
            f"short {f['short']} · late {f['late']} · latest {f['latest']} · meal {f['meal']} · "
            f"Fri/Sat eve {f['fri_sat_eve']}m · Sun {f['sunday']}m · unscheduled {f['unscheduled']}m · "
            f"calendar score {score} · student fit {fit}")


def survey_text(survey):
    if not survey:
        return "none"
    commitments = ", ".join(f"{k} {v}h/week" for k, v in survey.get("commitments", {}).items()) or "none"
    musts = ", ".join(survey.get("non_negotiables", [])) or "none"
    return (f"commitments {commitments} · non-negotiables {musts} · focus {survey.get('focus_time')} · "
            f"sessions {survey.get('work_session')} · {survey.get('deadline_style')} · {survey.get('calendar_style')}")


def mini_week(inp, cal, colors, first, last):
    span = max(1, last - first)
    dates = week_dates(inp)
    cols = []
    for d in dates:
        key = d.isoformat()
        bars = []
        items = [(f, FIXED_COLOR, True) for f in inp["fixed"] if f["date"] == key]
        items += [(b, colors.get(b["task"], "#fecaca"), False) for b in cal["blocks"] if b["date"] == key]
        for item, color, fixed in items:
            s, e = minutes(item["start"]), minutes(item["end"])
            top, height = 100 * (s - first) / span, 100 * (e - s) / span
            label = item.get("label") or item["task"]
            style = f"top:{top:.1f}%;height:{height:.1f}%" + ("" if fixed else f";background:{color}")
            bars.append(f'<div class="b{" fx" if fixed else ""}" style="{style}" '
                        f'title="{html.escape(label)} {item["start"]}-{item["end"]}"></div>')
        off = " off" if inp["day_off"] == key else ""
        cols.append(f'<div><div class="h">{d.strftime("%a")[:2]}</div><div class="d{off}">{"".join(bars)}</div></div>')
    return f'<div class="mini">{"".join(cols)}</div>'


def build(inp, survey, scenario, result, ids, cals, kinds, feats, score, fit, shortlist, picks, ai):
    colors = {t["id"]: TASK_COLORS[i % len(TASK_COLORS)] for i, t in enumerate(inp["tasks"])}
    rank_of = {p["id"]: n for n, p in enumerate(picks, start=1)}

    starts = [minutes(inp["available"]["start"])] + [minutes(f["start"]) for f in inp["fixed"]]
    ends = [minutes(inp["available"]["end"])] + [minutes(f["end"]) for f in inp["fixed"]]
    first, last = min(starts) // 60 * 60, -(-max(ends) // 60) * 60

    p = inp["prefs"]
    legend = "".join(f'<span style="background:{colors[t["id"]]}">{t["id"]} {html.escape(t["title"])}</span>'
                     for t in inp["tasks"]) + f'<span style="background:{FIXED_COLOR}">fixed</span>'
    head = (f"<h1>{html.escape(scenario)}</h1>"
            f'<div class="meta">focus {p["focus_time"]} · sessions up to {p["session_minutes"]} min · '
            f'{p["deadline_style"]} · {p["calendar_style"]} · available {inp["available"]["start"]}–'
            f'{inp["available"]["end"]}{" · day off " + inp["day_off"] if inp["day_off"] else ""}</div>'
            f'<div class="meta">Solver: {html.escape(result.note)} · {result.chunks} chunks, '
            f'{result.unscheduled_chunks} left unscheduled · {result.nodes:,} search nodes</div>'
            f'<div class="meta">Survey: {html.escape(survey_text(survey))}</div>'
            f'<div class="meta">Picker: {html.escape(ai["label"])} · saw {len(shortlist)} of {len(ids)} calendars</div>'
            f'<div class="legend" style="margin-top:8px">{legend}</div>')

    pick_html = ["<h2>The 3 picks</h2>"]
    for n, pk in enumerate(picks, start=1):
        cid = pk["id"]
        cal = {**cals[cid], "note": ""}
        tag = "" if pk["source"] == "ai" else " (filled in by score: the model's reply didn't give a usable pick)"
        pick_html.append(
            f'<div class="pick{" score" if pk["source"] != "ai" else ""}"><div><span class="rank">#{n}</span>'
            f'<b>{cid}</b>{tag} — {html.escape(pk["reason"])}</div>'
            f'<div class="feats">Ranks {pk["fit_rank"]} of {len(shortlist)} by student fit and '
            f'{pk["score_rank"]} by calendar score. {feat_text(feats[cid], score[cid], fit[cid])}</div>'
            f'<div class="sched">{calendar_html(inp, cal, [])}{summary_html(inp, cal, [], None)}</div></div>')

    cards = []
    short = set(shortlist)
    for cid in ids:
        f = feats[cid]
        badge = f'<span class="rank">#{rank_of[cid]}</span>' if cid in rank_of else ""
        cards.append(
            f'<div class="card{" picked" if cid in rank_of else ""}" data-id="{cid}" data-score="{score[cid]}" '
            f'data-fit="{fit[cid]}" data-focus="{f["focus"]}" data-slack="{f["slack"]}" data-short="{int(cid in short)}">'
            f'<div class="top"><span>{badge}<b>{cid}</b> · {kinds[cid]}{" · shortlisted" if cid in short else ""}</span>'
            f'<span>score {score[cid]} · fit {fit[cid]}</span></div>'
            f'<div class="f">focus {f["focus"]}% · slack {f["slack"]}h · max {f["max_day"]}m · late {f["late"]} · short {f["short"]}'
            f'{" · unsched " + str(f["unscheduled"]) + "m" if f["unscheduled"] else ""}</div>'
            f'{mini_week(inp, cals[cid], colors, first, last)}</div>')

    all_html = (f"<h2>All {len(ids)} calendars from the solver</h2>"
                f'<div class="meta">{html.escape(result.note)}. Every one passes the hard constraints '
                f'(checked with eval/check.py). "guided" calendars were sampled leaning toward the focus hours, '
                f'"random" ones uniformly. Calendar score uses the scheduling prefs; student fit also uses the '
                f'survey. Hover a block for its time.</div>'
                '<div class="controls">Sort by <select onchange="sortCards(this.value)">'
                '<option value="id">solver order</option><option value="score">calendar score</option>'
                '<option value="fit">student fit</option>'
                '<option value="focus">focus %</option><option value="slack">slack</option></select>'
                '<label><input type="checkbox" onchange="onlyShortlist(this.checked)"> only what the model saw</label>'
                f'</div><div class="grid" id="grid">{"".join(cards)}</div>')

    raw = (f'<h2>Model reply</h2><pre>{html.escape(ai["text"] or "(model not run)")}</pre>'
           f'<details><summary>Prompt sent to the model</summary><pre>'
           f'{html.escape(json.dumps(ai["messages"], indent=1))}</pre></details>')

    return (f"<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'>"
            f"<title>SmartSched calendars</title>{CSS}{EXTRA_CSS}{SORT_JS}"
            f"{head}{''.join(pick_html)}{all_html}{raw}")
