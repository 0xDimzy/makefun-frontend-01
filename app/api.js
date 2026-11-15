// Read-only make.fun API client. Cache bodies and validators in localStorage.
const API = 'https://make.fun/api';
const cacheKey = (path) => `mf:${path}`;

async function get(path) {
  const key = cacheKey(path);
  let old;
  try { old = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
  const headers = old?.etag ? { 'If-None-Match': old.etag } : {};
  const res = await fetch(API + path, { headers });
  if (res.status === 304 && old) return old.body;
  if (!res.ok) throw new Error(`make.fun API returned ${res.status}`);
  const body = await res.json();
  try { localStorage.setItem(key, JSON.stringify({ etag: res.headers.get('ETag'), body })); } catch {}
  return body;
}

export const getBounties = () => get('/competitions?status=open&activity=times');
export const getBounty = (slug) => get(`/competitions/${encodeURIComponent(slug)}`);
export const getLeaderboard = (slug, page = 1, limit = 20) =>
  get(`/competitions/${encodeURIComponent(slug)}/leaderboard?page=${page}&limit=${limit}`);
export const getProfile = (handle) => get(`/profiles/${encodeURIComponent(handle)}`);
