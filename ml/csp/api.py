"""The scheduler service the Node server calls (POST /schedule). It runs the ml/prefs pipeline
(schedule.plan_week): hard rules from the survey (sleep and its buffers, meals) on top of the solver's
own, calendars ranked by the preference JSON, and three good, different picks with a reason each.

The preference JSON comes from the request (what's saved on the user's profile) and goes through
schema.clean first, whatever wrote it. Without one, the survey alone gives the preferences
(baseline.from_survey), so scheduling works before any model has run.

  python3 -m uvicorn api:app --app-dir ml/csp --port 8000
"""

import os
import secrets
import sys
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

SERVICE_API_KEY = os.environ.get("SERVICE_API_KEY")
# Seconds the solver may search before returning what it has, so a full week can't outlast the host's
# request timeout. Scoring and picking the calendars come on top of this.
TIME_LIMIT = float(os.environ.get("SOLVER_TIME_LIMIT", "8"))

ML_DIR = Path(__file__).resolve().parents[1]
for folder in ("csp", "eval", "prefs"):
    sys.path.insert(0, str(ML_DIR / folder))

import baseline  # noqa: E402
import history  # noqa: E402
from schedule import plan_week  # noqa: E402
from score import style_of  # noqa: E402
from schema import clean  # noqa: E402

app = FastAPI(title="SmartSched Scheduler API")


class ScheduleRequest(BaseModel):
    input: dict                  # the week: now, week, day_off, fixed, tasks (see server/solverInput.js)
    survey: dict | None = None
    prefs: dict | None = None    # the saved preference JSON, or None to use the survey's
    limit: int = Field(default=150, ge=1, le=300)
    step: int = Field(default=15, ge=5, le=60)


class HistoryRequest(BaseModel):
    rows: dict                   # now, tz_offset, survey, blocks, tasks, reflections, events (see history.py)


def check_key(x_api_key):
    if SERVICE_API_KEY and not secrets.compare_digest(x_api_key or "", SERVICE_API_KEY):
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
def health():
    return {"status": "ok", "service": "smartsched-scheduler"}


@app.post("/schedule")
def schedule(request: ScheduleRequest, x_api_key: str | None = Header(default=None)):
    check_key(x_api_key)

    if request.prefs is None:
        prefs, prefs_problems, prefs_source = baseline.from_survey(request.survey), [], "survey"
    else:
        prefs, prefs_problems = clean(request.prefs)
        prefs_source = "saved"

    try:
        plan = plan_week(request.input, request.survey, prefs, limit=request.limit, step=request.step,
                         time_limit=TIME_LIMIT)
    except AssertionError as exc:  # plan_week checks every pick against the hard rules
        print(f"Scheduler produced an invalid calendar: {exc}", flush=True)
        raise HTTPException(status_code=500, detail="The scheduler generated an invalid calendar.") from exc
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid scheduling input: {exc}") from exc
    except Exception as exc:
        print(f"Scheduler error: {exc!r}", flush=True)
        raise HTTPException(status_code=500, detail="Schedule generation failed. Check server logs.") from exc

    if not plan["picks"]:
        raise HTTPException(status_code=422, detail="No valid calendars could be generated for this week.")

    inp = plan["inp"]
    return {
        "status": "ok",
        "solver": plan["note"],
        "unscheduled_chunks": plan["unscheduled_chunks"],
        "available": inp["available"],   # the day's study hours after sleep and its buffers
        "notes": inp["notes"],           # e.g. a class inside the sleep window
        "prefs_source": prefs_source,
        "prefs_problems": prefs_problems,
        # The three picks, best first.
        "calendars": [{"id": f"c{p['index'] + 1:03d}", "rank": p["rank"], "score": p["score"], "why": p["why"],
                       "style": style_of(inp, plan["calendars"][p["index"]]),
                       "calendar": plan["calendars"][p["index"]]} for p in plan["picks"]],
    }


@app.post("/history")
def user_history(request: HistoryRequest, x_api_key: str | None = Header(default=None)):
    """The user's history as the preference model reads it, and what the fixed rules infer from it (cleaned
    like any preference JSON, since the app saves it as the user's preferences)."""
    check_key(x_api_key)
    try:
        rules, _ = clean(history.rules(request.rows))
        return {"bundle": history.bundle(request.rows), "rules": rules}
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid history rows: {exc!r}") from exc
