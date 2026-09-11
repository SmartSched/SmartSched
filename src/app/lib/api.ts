import { supabase } from './supabaseClient';

const API_URL = import.meta.env.VITE_API_URL;

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return { Authorization: `Bearer ${token}` };
}

export async function apiGet(path: string) {
  const res = await fetch(`${API_URL}${path}`, { headers: await authHeaders() });
  if (!res.ok) throw new Error((await res.json()).error || 'Request failed');
  return res.json();
}

export async function apiPost(path: string, body: unknown) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Request failed');
  return res.json();
}

export async function apiPatch(path: string, body: unknown) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Request failed');
  return res.json();
}

export async function apiDelete(path: string) {
  const res = await fetch(`${API_URL}${path}`, { method: 'DELETE', headers: await authHeaders() });
  if (!res.ok) throw new Error((await res.json()).error || 'Request failed');
}
