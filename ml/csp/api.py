
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

import os
import secrets
from fastapi import Header

SERVICE_API_KEY = os.environ.get("SERVICE_API_KEY")

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CSP_DIR = PROJECT_ROOT / "ml" / "csp"
EVAL_DIR = PROJECT_ROOT / "ml" / "eval"

sys.path.insert(0, str(CSP_DIR))
sys.path.insert(0, str(EVAL_DIR))

from solver import solve  # noqa: E402
from check import check_constraints  # noqa: E402
import picker  # noqa: E402

app = FastAPI(title="SmartSched Scheduler API")


class ScheduleRequest(BaseModel):
    input: dict
    survey: dict | None = None
    limit: int = Field(default=50, ge=1, le=200)
    step: int = Field(default=15, ge=5, le=60)


@app.get("/health")
def health():
    return {"status": "ok", "service": "smartsched-scheduler"}


@app.post("/schedule")
def schedule(request: ScheduleRequest, x_api_key: str | None = Header(default=None)):
    if SERVICE_API_KEY and not secrets.compare_digest(x_api_key or "", SERVICE_API_KEY):
        raise HTTPException(status_code=401, detail="Unauthorized")
    inp = request.input

    try:
        result = solve(inp, limit=request.limit, step=request.step)

        if not result.calendars:
            raise HTTPException(
                status_code=422,
                detail="No valid calendars could be generated for this week.",
            )

        calendars = []
        for index, calendar in enumerate(result.calendars, start=1):
            problems = check_constraints(inp, {**calendar, "note": ""})
            if problems:
                raise HTTPException(
                    status_code=500,
                    detail="The scheduler generated an invalid calendar.",
                )

            features = picker.features(inp, calendar)
            calendars.append({
                "id": f"c{index:03d}",
                "kind": result.kinds[index - 1],
                "calendar": calendar,
                "features": features,
            })

        scores = picker.calendar_score(
            inp, [item["features"] for item in calendars]
        )
        fits = picker.student_fit(
            inp, request.survey, [item["features"] for item in calendars]
        )

        for item, score, fit in zip(calendars, scores, fits):
            item["score"] = score
            item["fit"] = fit

        calendars.sort(key=lambda item: item["score"], reverse=True)

        return {
            "status": "ok",
            "solver": result.note,
            "exhaustive": result.exhaustive,
            "unscheduled_chunks": result.unscheduled_chunks,
            "chunks": result.chunks,
            "calendars": calendars,
        }

    except HTTPException:
        raise
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid scheduling input: {exc}",
        ) from exc
    except Exception as exc:
        print(f"Scheduler error: {exc}", flush=True)
        raise HTTPException(
            status_code=500,
            detail="Schedule generation failed. Check server logs.",
        ) from exc
