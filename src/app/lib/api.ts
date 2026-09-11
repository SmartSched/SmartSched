import { supabase } from './supabaseClient';

const API_URL = import.meta.env.VITE_API_URL;

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return { Authorization: `Bearer ${token}` };
}

// Error responses aren't always JSON (e.g. Express's default HTML 404 for a route the running
// server doesn't have), so fall back to the status instead of a JSON parse error.
async function requestError(res: Response) {
  const body = await res.json().catch(() => null);
  return new Error(body?.error || `Request failed (${res.status} ${res.statusText})`);
}

export async function apiGet(path: string) {
  const res = await fetch(`${API_URL}${path}`, { headers: await authHeaders() });
  if (!res.ok) throw await requestError(res);
  return res.json();
}

export async function apiPost(path: string, body: unknown) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await requestError(res);
  return res.json();
}

export async function apiPatch(path: string, body: unknown) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await requestError(res);
  return res.json();
}

export async function apiPut(path: string, body: unknown) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await requestError(res);
  return res.json();
}

export async function apiDelete(path: string) {
  const res = await fetch(`${API_URL}${path}`, { method: 'DELETE', headers: await authHeaders() });
  if (!res.ok) throw await requestError(res);
}
