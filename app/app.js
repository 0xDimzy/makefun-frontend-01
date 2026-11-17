// make.fun frontend — board, bounty, leaderboard and profile on hash routes.
// Static files, no build step, no dependencies. Reads only make.fun's public
// API (https://make.fun/api), GET, no key. API answers are cached in memory
// and revalidated with ETags, so a second visit to a view costs one 304
// instead of a full download; lists paginate and update in place instead of
// rebuilding the page.
//
//   #/                              the board of open bounties
//   #/bounty/<slug>                one bounty
//   #/bounty/<slug>/leaderboard    that bounty's leaderboard
//   #/profile/<handle>             an account's public profile
//
// window.__shotReady is false while a route loads and true once its data is
// on screen, so a screenshot script knows when to capture.

const API = 'https://make.fun/api';
const app = document.getElementById('app');
window.__shotReady = false;

/* ---------- text helpers ---------- */

/** Text made safe to put inside HTML. */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** A dollar amount ('725.50' or 0.5) as '$725.50' or '$100'. */
function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: Number.isInteger(n) ? 0 : 2 });
}

/** An ISO date as a UTC date + time. */
function fmtDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC`;
}

/** The time until a deadline: '2d 4h left', '35m left', or 'ended'. */
function timeLeft(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'ended';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

/** Whether a bounty still takes entries: by its deadline, not its status. */
function accepting(b) {
  return new Date(b.deadline).getTime() > Date.now();
}

/** The reward as it stands now: the prize plus entry fees paid into it. */
function pot(b) {
  return money(b.potUsd ?? b.rewardAmount);
}

/* ---------- API: in-memory cache with ETag revalidation ---------- */

// path -> { etag, data }. A repeat visit sends If-None-Match and gets a 304
// with an empty body instead of the whole answer again.
const cache = new Map();

async function apiGet(path) {
  const hit = cache.get(path);
  const headers = {};
  if (hit && hit.etag) headers['If-None-Match'] = hit.etag;
  let res;
  try {
    res = await fetch(API + path, { headers, cache: 'no-store' });
  } catch {
    const err = new Error('The make.fun API did not answer.');
    err.status = 0;
    throw err;
  }
  if (res.status === 304 && hit) return hit.data;
  if (!res.ok) {
    const err = new Error(`make.fun API answered ${res.status} for ${path}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  cache.set(path, { etag: res.headers.get('ETag'), data });
  return data;
}

/* ---------- router ---------- */

let seq = 0;

function parseRoute() {
  try {
    const h = location.hash || '#/';
    let m = h.match(/^#\/bounty\/([^/]+)\/leaderboard\/?$/);
    if (m && m[1]) return { view: 'leaderboard', slug: decodeURIComponent(m[1]) };
    m = h.match(/^#\/bounty\/([^/]+)\/?$/);
    if (m && m[1]) return { view: 'bounty', slug: decodeURIComponent(m[1]) };
    m = h.match(/^#\/profile\/([^/]+)\/?$/);
    if (m && m[1]) return { view: 'profile', handle: decodeURIComponent(m[1]) };
  } catch {
    // A malformed hash falls through to the board.
  }
  return { view: 'board' };
}

async function render() {
  const mine = ++seq;
  window.__shotReady = false;
  const r = parseRoute();
  try {
    if (r.view === 'bounty') await renderBounty(r.slug);
    else if (r.view === 'leaderboard') await renderLeaderboard(r.slug);
    else if (r.view === 'profile') await renderProfile(r.handle);
    else await renderBoard();
  } catch (err) {
    app.innerHTML = errorHtml(err);
  }
  if (mine !== seq) return; // a newer navigation already started
  window.scrollTo(0, 0);
  window.__shotReady = true;
}

function errorHtml(err) {
  const missing = err && err.status === 404;
  const offline = err && err.status === 0;
  return `<div class="error"><h2>${missing ? 'Not found' : 'Could not load this page'}</h2>
  <p>${missing ? 'make.fun has no bounty, leaderboard or profile by that name.'
    : offline ? 'The make.fun API did not answer. Check your connection and try again.'
    : 'make.fun answered with an error. Try again in a moment.'}</p>
  <p><button data-action="retry">Retry</button> <a href="#/">Back to the board</a></p></div>`;
}

function loadingHtml(title) {
  return `<h1>${esc(title)}</h1><p class="muted">Loading live data…</p>`;
}

/* ---------- board ---------- */

let boardItems = null;
let boardFilter = 'all';

function boardRow(b) {
  const open = accepting(b);
  const slug = encodeURIComponent(b.slug);
  return `<li><a class="t" href="#/bounty/${slug}">${esc(b.title)}</a>
  <div class="meta">
  <span class="pot">${pot(b)}</span>
  <span>${b.entryFeeUsd ? `${money(b.entryFeeUsd)} entry fee` : 'Free entry'}</span>
  <span class="pill ${open ? 'open' : 'closed'}">${open ? timeLeft(b.deadline) : 'Entries closed'}</span>
  <span>${Number(b.submissionCount ?? 0).toLocaleString('en-US')} entries</span>
  ${b.category ? `<span>${esc(b.category)}</span>` : ''}
  <a href="#/bounty/${slug}/leaderboard">Leaderboard</a>
  </div></li>`;
}

function paintBoardList() {
  const list = document.getElementById('board-list');
  if (!list) return;
  const now = Date.now();
  const shown = boardItems.filter((b) =>
    boardFilter === 'open' ? new Date(b.deadline).getTime() > now
    : boardFilter === 'closed' ? new Date(b.deadline).getTime() <= now
    : true);
  // Taking entries first (soonest deadline), then closed (latest first).
  shown.sort((a, c) => {
    const ao = accepting(a) ? 0 : 1, co = accepting(c) ? 0 : 1;
    if (ao !== co) return ao - co;
    const d = new Date(a.deadline) - new Date(c.deadline);
    return ao === 0 ? d : -d;
  });
  list.innerHTML = shown.length ? shown.map(boardRow).join('') : '<li class="muted">No bounties in this filter.</li>';
  document.querySelectorAll('.filters button').forEach((btn) =>
    btn.setAttribute('aria-pressed', btn.dataset.filter === boardFilter ? 'true' : 'false'));
  const count = document.getElementById('board-count');
  if (count) count.textContent = `${shown.length} of ${boardItems.length} shown`;
}

async function renderBoard() {
  document.title = 'Open bounties · make.fun';
  app.innerHTML = `<h1>Open bounties</h1>
  <p class="muted" id="board-count">Loading live board…</p>
  <div class="filters">
  <button data-action="board-filter" data-filter="all" aria-pressed="true">All</button>
  <button data-action="board-filter" data-filter="open" aria-pressed="false">Taking entries</button>
  <button data-action="board-filter" data-filter="closed" aria-pressed="false">Entries closed</button>
  </div>
  <ul class="board" id="board-list"></ul>
  <p class="muted">A bounty past its deadline reads open until its results are published — whether it still takes entries is judged by the deadline, not the status.</p>`;
  const data = await apiGet('/competitions?status=open&activity=times&limit=100');
  boardItems = data.items || [];
  paintBoardList();
}

/* ---------- one bounty ---------- */

function rewardsTable(rewards) {
  if (!rewards) return '<p class="muted">No rewards table published.</p>';
  const rows = Object.keys(rewards)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
    .map((place) => `<tr><td>${place}</td><td class="num">${money(rewards[String(place)])}</td></tr>`)
    .join('');
  return rows ? `<table><thead><tr><th>Place</th><th class="num">Reward</th></tr></thead><tbody>${rows}</tbody></table>`
    : '<p class="muted">No rewards table published.</p>';
}

async function renderBounty(slug) {
  app.innerHTML = loadingHtml('Loading bounty…');
  const b = await apiGet(`/competitions/${encodeURIComponent(slug)}`);
  const open = accepting(b);
  document.title = `${b.title} · make.fun`;
  app.innerHTML = `<p><a href="#/">← All bounties</a></p>
  <h1>${esc(b.title)}</h1>
  <p>${esc(b.summary)}</p>
  <dl class="facts">
  <dt>Live pot</dt><dd><b>${pot(b)}</b></dd>
  <dt>Reward</dt><dd>${money(b.rewardAmount)}</dd>
  <dt>Entry fee</dt><dd>${b.entryFeeUsd ? money(b.entryFeeUsd) : 'Free'}</dd>
  <dt>Deadline</dt><dd>${fmtDate(b.deadline)} (${timeLeft(b.deadline)})</dd>
  <dt>Opens</dt><dd>${fmtDate(b.opensAt)}</dd>
  <dt>Status</dt><dd><span class="pill ${open ? 'open' : 'closed'}">${open ? 'Taking entries' : 'Entries closed'}</span> · ${esc(b.status)}</dd>
  <dt>Entries</dt><dd>${Number(b.submissionCount ?? 0).toLocaleString('en-US')}</dd>
  ${b.sponsor && b.sponsor.name ? `<dt>Sponsor</dt><dd>${esc(b.sponsor.name)}</dd>` : ''}
  ${b.category ? `<dt>Category</dt><dd>${esc(b.category)}</dd>` : ''}
  </dl>
  <p><a class="btn" href="#/bounty/${encodeURIComponent(b.slug)}/leaderboard">Leaderboard →</a>
  <a class="btn ghost" href="https://make.fun/bounty/${encodeURIComponent(b.slug)}">Open on make.fun ↗</a></p>
  <h2>Rewards</h2>
  ${rewardsTable(b.rewards)}
  <h2>Description</h2>
  <div class="description">${esc(b.description)}</div>
  ${b.rules ? `<details><summary>Rules</summary><div class="description">${esc(b.rules)}</div></details>` : ''}`;
}

/* ---------- leaderboard ---------- */

// The leaderboard answer is big (thousands of entries), so the first load
// shows the top 10 and the full board loads only on request, then paginates.
const lb = { slug: '', key: 'judge', keyTitle: 'Score', entries: [], page: 0, full: false, total: 0 };

function scoreCell(e, key) {
  const v = e.values ? e.values[key] : null;
  if (v == null) return '—';
  if (key === 'judge') return `${(v / 10000).toFixed(2)}%`;
  const d = e.display ? e.display[key] : null;
  return d ?? String(v);
}

function intervalCell(e, key) {
  if (key !== 'judge' || !e.values || e.values.judge_low == null) return '—';
  return `${(e.values.judge_low / 10000).toFixed(2)}–${(e.values.judge_high / 10000).toFixed(2)}%`;
}

function lbRowsHtml(entries, key) {
  return entries.map((e) => `<tr>
  <td class="num">${e.rank ?? '—'}</td>
  <td><a href="#/profile/${encodeURIComponent(e.handle)}">${esc(e.handle)}</a></td>
  <td>${esc(e.title)}</td>
  <td class="num"><b>${scoreCell(e, key)}</b></td>
  <td class="num">${intervalCell(e, key)}</td>
  </tr>`).join('');
}

function paintLbTable() {
  const body = document.getElementById('lb-rows');
  if (!body) return;
  const pageSize = 50;
  const start = lb.page * pageSize;
  const slice = lb.entries.slice(start, start + pageSize);
  body.innerHTML = slice.length ? lbRowsHtml(slice, lb.key) : '<tr><td colspan="5" class="muted">No entries yet.</td></tr>';
  const pager = document.getElementById('lb-pager');
  if (pager) {
    const pages = Math.max(1, Math.ceil(lb.entries.length / pageSize));
    pager.innerHTML = lb.full
      ? `<button data-action="lb-prev" ${lb.page === 0 ? 'disabled' : ''}>← Prev</button>
         <span>Page ${lb.page + 1} of ${pages} · ${lb.total.toLocaleString('en-US')} entries</span>
         <button data-action="lb-next" ${lb.page >= pages - 1 ? 'disabled' : ''}>Next →</button>`
      : `<span>Top ${lb.entries.length} of ${lb.total.toLocaleString('en-US')} entries</span>
         <button data-action="lb-full">Load full leaderboard</button>`;
  }
}

async function renderLeaderboard(slug) {
  app.innerHTML = loadingHtml('Loading leaderboard…');
  const data = await apiGet(`/competitions/${encodeURIComponent(slug)}/leaderboard?rows=first`);
  lb.slug = slug;
  lb.key = data.rank_key || 'judge';
  const col = (data.columns || []).find((c) => c.key === lb.key);
  lb.keyTitle = col ? col.title : 'Score';
  lb.entries = data.entries || [];
  lb.total = lb.entries.length;
  lb.page = 0;
  lb.full = false;
  document.title = `${data.competition ? data.competition.title : slug} leaderboard · make.fun`;
  app.innerHTML = `<p><a href="#/bounty/${encodeURIComponent(slug)}">← ${esc(data.competition ? data.competition.title : slug)}</a></p>
  <h1>Leaderboard</h1>
  <p class="muted">${esc(data.title || 'Results')} · ranked by ${esc(lb.keyTitle)}</p>
  <table><thead><tr><th class="num">#</th><th>Handle</th><th>Entry</th><th class="num">${esc(lb.keyTitle)}</th><th class="num">90% interval</th></tr></thead>
  <tbody id="lb-rows"></tbody></table>
  <div class="pager" id="lb-pager"></div>`;
  paintLbTable();
}

async function loadFullLeaderboard(btn) {
  btn.disabled = true;
  btn.textContent = 'Loading full leaderboard…';
  try {
    const data = await apiGet(`/competitions/${encodeURIComponent(lb.slug)}/leaderboard?rows=all`);
    lb.entries = data.entries || [];
    lb.total = lb.entries.length;
    lb.page = 0;
    lb.full = true;
    paintLbTable();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Load full leaderboard';
    const pager = document.getElementById('lb-pager');
    if (pager) pager.insertAdjacentHTML('beforeend', `<p class="error">${esc(err.message || 'Could not load the full board.')}</p>`);
  }
}

/* ---------- profile ---------- */

let prof = null;
const profRanks = new Map();

function profileSolutionRow(s, i) {
  const c = s.competition || {};
  const slug = c.slug ? encodeURIComponent(c.slug) : '';
  const score = s.score && s.score.display != null ? esc(s.score.display) : '—';
  const scoreTitle = s.score && s.score.column ? esc(s.score.column.title) : 'Score';
  return `<tr>
  <td><a href="#/bounty/${slug}">${esc(c.title || c.slug || '—')}</a><br><span class="muted">${esc(c.category || '')} · ${c.status ? esc(c.status) : ''}</span></td>
  <td>${esc(s.title || '')}</td>
  <td class="num" id="rank-${i}">—</td>
  <td class="num">${score}<br><span class="muted">${scoreTitle}</span></td>
  <td class="num">${s.placement != null ? `#${s.placement}` : '—'}</td>
  <td class="num">${s.prize_usd != null ? money(s.prize_usd) : '—'}</td>
  <td class="num">${s.entered_at ? fmtDate(s.entered_at) : '—'}</td>
  </tr>`;
}

async function renderProfile(handle) {
  app.innerHTML = loadingHtml('Loading profile…');
  const p = await apiGet(`/profiles/${encodeURIComponent(handle)}`);
  prof = p;
  profRanks.clear();
  const r = p.record || {};
  document.title = `${p.handle} · make.fun`;
  const solutions = p.solutions || [];
  app.innerHTML = `<h1>${esc(p.display_name || p.handle)}</h1>
  <p class="muted">@${esc(p.handle)}${p.github_login ? ` · GitHub ${esc(p.github_login)}` : ''}${p.x ? ` · X ${esc(p.x)}` : ''} · joined ${fmtDate(p.joined_at)}</p>
  ${p.bio ? `<p>${esc(p.bio)}</p>` : ''}
  <div class="stats">
  <span><b>${r.competitions_entered ?? 0}</b>entered</span>
  <span><b>${r.competitions_placed ?? 0}</b>placed</span>
  <span><b>${r.competitions_won ?? 0}</b>won</span>
  <span><b>${r.best_placement != null ? `#${r.best_placement}` : '—'}</b>best placement</span>
  <span><b>${money(r.prize_usd ?? 0)}</b>prize money</span>
  </div>
  <h2>Entries (${solutions.length})</h2>
  <p><button data-action="load-ranks">Load live ranks</button> <span class="muted" id="rank-progress">Ranks come from each bounty's leaderboard, loaded on request.</span></p>
  ${solutions.length ? `<table><thead><tr><th>Bounty</th><th>Entry</th><th class="num">Rank</th><th class="num">Score</th><th class="num">Place</th><th class="num">Prize</th><th class="num">Entered</th></tr></thead>
  <tbody>${solutions.map(profileSolutionRow).join('')}</tbody></table>`
  : '<p class="muted">No entries yet.</p>'}`;
}

// Ranks live in the leaderboards, one big answer per bounty, so they load
// on request — sequentially, in place, cached by apiGet — instead of
// downloading every board before the profile can render.
async function loadLiveRanks(btn) {
  btn.disabled = true;
  const progress = document.getElementById('rank-progress');
  const solutions = (prof && prof.solutions) || [];
  for (let i = 0; i < solutions.length; i++) {
    const slug = solutions[i].competition && solutions[i].competition.slug;
    if (!slug) continue;
    if (progress) progress.textContent = `Loading ranks… ${i + 1}/${solutions.length}`;
    try {
      const data = await apiGet(`/competitions/${encodeURIComponent(slug)}/leaderboard?rows=all`);
      const found = (data.entries || []).find((e) => e.handle === prof.handle);
      const cell = document.getElementById(`rank-${i}`);
      if (cell) cell.textContent = found && found.rank != null ? `#${found.rank}` : '—';
    } catch {
      const cell = document.getElementById(`rank-${i}`);
      if (cell) cell.textContent = '—';
    }
  }
  if (progress) progress.textContent = 'Live ranks loaded.';
}

/* ---------- events and boot ---------- */

app.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  if (action === 'retry') render();
  else if (action === 'board-filter') { boardFilter = el.dataset.filter; paintBoardList(); }
  else if (action === 'lb-prev' && lb.page > 0) { lb.page -= 1; paintLbTable(); }
  else if (action === 'lb-next') { lb.page += 1; paintLbTable(); }
  else if (action === 'lb-full') loadFullLeaderboard(el);
  else if (action === 'load-ranks') loadLiveRanks(el);
});

document.getElementById('profile-search').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const handle = new FormData(ev.target).get('handle');
  const h = String(handle || '').trim();
  if (h) location.hash = `#/profile/${encodeURIComponent(h)}`;
});

window.addEventListener('hashchange', render);
render();
