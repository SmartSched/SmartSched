import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isValidPreferenceJson, summarizeLearningEvents } from "../learning.js";

describe("behavior-learning aggregation", () => {
  it("turns structured events into aggregate features without task text", () => {
    const summary = summarizeLearningEvents([
      {
        event_type: "schedule_accepted",
        occurred_at: "2026-11-10T12:00:00Z",
        data: {
          planned_blocks: [
            { date: "2026-11-11", start: "19:00", end: "20:00" },
          ],
        },
      },
      {
        event_type: "study_block_moved",
        occurred_at: "2026-11-10T13:00:00Z",
        data: { to: { date: "2026-11-12", start: "18:00", end: "19:30" } },
      },
      {
        event_type: "task_completed",
        occurred_at: "2026-11-10T14:00:00Z",
        data: {
          task_type: "homework",
          estimated_minutes: 60,
          actual_minutes: 90,
          due_date: "2026-11-11T14:00:00Z",
        },
      },
    ]);
    expect(summary.preferred_study_hours).toEqual({ 18: 1, 19: 1 });
    expect(summary.average_session_minutes).toBe(75);
    expect(
      summary.estimate_vs_actual_by_task_type.homework
        .actual_to_estimated_ratio,
    ).toBe(1.5);
    expect(JSON.stringify(summary)).not.toContain("task description");
  });

  it("rejects malformed model preferences so callers can keep their prior value", () => {
    expect(
      isValidPreferenceJson({ summary: "x", preferences: [], adjustments: [] }),
    ).toBe(true);
    expect(
      isValidPreferenceJson({
        summary: "x",
        preferences: [{ kind: "session_length", ideal: 1000 }],
        adjustments: [],
      }),
    ).toBe(false);
    expect(
      isValidPreferenceJson({
        summary: "x",
        preferences: [],
        adjustments: [
          { kind: "estimate_multiplier", task_type: "unknown", factor: 1 },
        ],
      }),
    ).toBe(false);
    expect(
      isValidPreferenceJson({
        summary: "x",
        sleep: { bedtime: "not-a-time" },
        preferences: [],
        adjustments: [],
      }),
    ).toBe(false);
  });
});

describe("user_learning_events RLS", () => {
  it("restricts both reads and writes to the authenticated event owner", () => {
    const migration = readFileSync(
      new URL(
        "../../supabase/migrations/20261111140000_user_learning_events.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(migration).toMatch(/enable row level security/i);
    expect(migration).toMatch(/for select using \(auth\.uid\(\) = user_id\)/i);
    expect(migration).toMatch(
      /for insert with check \(auth\.uid\(\) = user_id\)/i,
    );
  });
});
