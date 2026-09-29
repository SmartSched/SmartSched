import { supabase } from './supabaseClient';

const API_URL = import.meta.env.VITE_API_URL;

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return { Authorization: `Bearer ${token}` };
}

// Messages shown on screen, for when the server doesn't send one (or can't be reached at all).
const STATUS_MESSAGES: Record<number, string> = {
  401: 'Your session has expired. Log in again.',
  404: "That couldn't be found. Try refreshing the page.",
};
const FALLBACK_MESSAGE = 'Something went wrong. Try again in a moment.';

// The server sends { error } with a readable message. Other responses (a proxy's HTML error page, a
// server that's down) fall back to a plain message instead of a status code or JSON parse error.
async function requestError(res: Response) {
  const body = await res.json().catch(() => null);
  if (res.status === 401) return new Error(STATUS_MESSAGES[401]);
  return new Error(body?.error || STATUS_MESSAGES[res.status] || FALLBACK_MESSAGE);
}

// fetch only throws when there's no response at all: offline, or the server isn't running.
async function send(path: string, init?: RequestInit) {
  try {
    return await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new Error("Can't reach the server. Check your connection and try again.");
  }
}

export async function apiGet(path: string) {
  const res = await send(path, { headers: await authHeaders() });
  if (!res.ok) throw await requestError(res);
  return res.json();
}

export async function apiPost(path: string, body: unknown) {
  const res = await send(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await requestError(res);
  return res.json();
}

export async function apiPatch(path: string, body: unknown) {
  const res = await send(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await requestError(res);
  return res.json();
}

export async function apiPut(path: string, body: unknown) {
  const res = await send(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await requestError(res);
  return res.json();
}

export async function apiDelete(path: string) {
  const res = await send(path, { method: 'DELETE', headers: await authHeaders() });
  if (!res.ok) throw await requestError(res);
}
