// The preference model on its Hugging Face Space (ml/serve/app.py, a Gradio app on ZeroGPU). Gradio's API is
// two requests: POST /gradio_api/call/prefs starts a job and returns its event_id, then GET
// /gradio_api/call/prefs/<event_id> streams server-sent events until "complete" (with the result) or "error".

// Waiting in the GPU queue and a cold start can add minutes on top of the reply itself.
export const MODEL_TIMEOUT_MS = 10 * 60_000;

// The result from a Gradio event stream, or { error } when the job failed or the stream ended without one.
export function parseGradioEvents(text) {
  let event = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:') && event === 'complete') return { result: JSON.parse(line.slice(5))[0] };
    else if (line.startsWith('data:') && event === 'error') return { error: line.slice(5).trim() || 'error' };
  }
  return { error: 'the stream ended without a result' };
}

// { prefs, problems, parsed, fallback, seconds, version } from the model, or null after logging why not.
export async function askModel(bundle, survey) {
  const base = `${process.env.MODEL_URL}/gradio_api/call/prefs`;
  // The Space is private, so Hugging Face wants a token; the token's (PRO) account pays the GPU quota.
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.MODEL_HF_TOKEN) headers.Authorization = `Bearer ${process.env.MODEL_HF_TOKEN}`;
  const key = process.env.MODEL_API_KEY ?? process.env.SERVICE_API_KEY ?? '';
  const signal = AbortSignal.timeout(MODEL_TIMEOUT_MS);

  const started = await fetch(base, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data: [bundle, JSON.stringify(survey ?? {}), key] }),
    signal,
  });
  if (!started.ok) {
    console.error('Model said', started.status, await started.text());
    return null;
  }
  const { event_id: eventId } = await started.json();
  const stream = await fetch(`${base}/${eventId}`, { headers, signal });
  if (!stream.ok) {
    console.error('Model stream said', stream.status, await stream.text());
    return null;
  }
  const { result, error } = parseGradioEvents(await stream.text());
  if (error) {
    console.error('Model failed:', error);
    return null;
  }
  return result;
}
