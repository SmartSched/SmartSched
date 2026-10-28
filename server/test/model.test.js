import { describe, expect, it } from 'vitest';
import { parseGradioEvents } from '../model.js';

describe('parseGradioEvents', () => {
  it('returns the result of a completed job', () => {
    const text = 'event: heartbeat\ndata: null\n\nevent: complete\ndata: [{"parsed": true, "version": "qwen-lora-v1"}]\n\n';
    expect(parseGradioEvents(text)).toEqual({ result: { parsed: true, version: 'qwen-lora-v1' } });
  });

  it('returns the error of a failed job, like a wrong key', () => {
    expect(parseGradioEvents('event: error\ndata: "Unauthorized"\n\n')).toEqual({ error: '"Unauthorized"' });
  });

  it('says so when the stream ends without either', () => {
    expect(parseGradioEvents('event: heartbeat\ndata: null\n\n')).toEqual({ error: 'the stream ended without a result' });
  });
});
