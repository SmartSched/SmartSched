import { afterEach, describe, expect, it, vi } from "vitest";
import { askModel, parseGradioEvents } from "../model.js";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.MODEL_URL;
  delete process.env.MODEL_HF_TOKEN;
});

describe("parseGradioEvents", () => {
  it("returns the result of a completed job", () => {
    const text =
      'event: heartbeat\ndata: null\n\nevent: complete\ndata: [{"parsed": true, "version": "qwen-lora-v1"}]\n\n';
    expect(parseGradioEvents(text)).toEqual({
      result: { parsed: true, version: "qwen-lora-v1" },
    });
  });

  it("returns the error of a failed job, like a wrong key", () => {
    expect(parseGradioEvents('event: error\ndata: "Unauthorized"\n\n')).toEqual(
      { error: '"Unauthorized"' },
    );
  });

  it("says so when the stream ends without either", () => {
    expect(parseGradioEvents("event: heartbeat\ndata: null\n\n")).toEqual({
      error: "the stream ended without a result",
    });
  });
});

describe("askModel", () => {
  it("sends aggregate behavior in the server-side model bundle, not a separate frontend request", async () => {
    process.env.MODEL_URL = "https://model.test";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url) => {
        if (url.endsWith("/prefs"))
          return new Response(JSON.stringify({ event_id: "event-1" }), {
            status: 200,
          });
        return new Response('event: complete\ndata: [{"prefs":{}}]\n\n', {
          status: 200,
        });
      });
    await askModel(
      "HISTORY",
      { focus_time: "evening" },
      { sample_size: 2, average_session_minutes: 60 },
    );
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.data[0]).toContain("BEHAVIOR_SUMMARY");
    expect(body.data[0]).toContain('"sample_size":2');
    expect(body.data[1]).toBe(JSON.stringify({ focus_time: "evening" }));
  });
});
