import { date, esc, money, timeLeft } from './format.js';

const amount = (b) => Number(b.potUsd ?? b.rewardAmount ?? b.prizeAmount ?? 0);
const pot = (b) => money(amount(b));
const fee = (b) => Number(b.entryFeeUsd ?? b.entryFee ?? 0);
const slugLink = (b) => `#/bounty/${encodeURIComponent(b.slug)}`;
const feePill = (b) => `<span class="fee-pill ${fee(b) ? '' : 'free'}">${fee(b) ? money(fee(b)) : 'Free'}</span>`;

export function board(data, page = 1, sort = 'deadline', filter = 'all') {
  const now = Date.now();
  const open = [...(data.items || data.competitions || [])].filter(b => new Date(b.deadline).getTime() > now);
  let items = open.filter(b => filter === 'all' || (filter === 'free' ? !fee(b) : fee(b) > 0));
  items.sort((a,b) => sort === 'reward' ? amount(b)-amount(a) : sort === 'entries' ? Number(b.submissionCount||0)-Number(a.submissionCount||0) : new Date(a.deadline)-new Date(b.deadline));
  const pageSize = 10, pages = Math.max(1, Math.ceil(items.length/pageSize));
  const rows = items.slice((page-1)*pageSize,page*pageSize).map(b => {
    const urgent = new Date(b.deadline).getTime() - now <= 86400000;
    return `<article class="card bounty-card">
      <div class="card-top"><h2><a href="${slugLink(b)}">${esc(b.title)}</a></h2><span class="badge ${urgent?'urgent':''}">${timeLeft(b.deadline)}</span></div>
      <div class="stats card-stats"><div class="pot-stat"><small>Live pot</small><strong>${pot(b)}</strong></div><div><small>Entry fee</small>${feePill(b)}</div><div class="entries-stat"><small>Entries</small><strong>${Number(b.submissionCount||0)}</strong></div></div>
      <div class="card-bottom"><p class="deadline">Deadline · ${date(b.deadline)}</p><a class="text-link" href="${slugLink(b)}/leaderboard">View leaderboard →</a></div>
    </article>`;
  }).join('');
  const totalPot = open.reduce((sum,b)=>sum+amount(b),0);
  const totalEntries = open.reduce((sum,b)=>sum+Number(b.submissionCount||0),0);
  return `<section class="hero"><p class="eyebrow">MAKE.FUN · LIVE BOUNTIES</p><h1>Find your next challenge.</h1><p>Open competitions, live prize pools, and time remaining.</p><div class="hero-stats"><div><strong>${money(totalPot)}</strong><small>Live pot</small></div><div><strong>${open.length}</strong><small>Open competitions</small></div><div><strong>${totalEntries.toLocaleString('en-US')}</strong><small>Total entries</small></div></div></section>
    <div class="toolbar"><label>Entry <select id="filter"><option value="all" ${filter==='all'?'selected':''}>Any fee</option><option value="free" ${filter==='free'?'selected':''}>Free only</option><option value="paid" ${filter==='paid'?'selected':''}>Paid only</option></select></label><label>Sort <select id="sort"><option value="deadline" ${sort==='deadline'?'selected':''}>Ending soon</option><option value="reward" ${sort==='reward'?'selected':''}>Largest pot</option><option value="entries" ${sort==='entries'?'selected':''}>Most entries</option></select></label><span class="count">${items.length} competitions</span></div>
    <section class="cards" aria-label="Open bounties">${rows || '<p>No matching bounties.</p>'}</section>
    <nav class="pagination" aria-label="Bounty pages"><button data-page="${Math.max(1,page-1)}" ${page<=1?'disabled':''}>← Previous</button><span>Page ${page} of ${pages}</span><button data-page="${Math.min(pages,page+1)}" ${page>=pages?'disabled':''}>Next →</button></nav>`;
}

export function bounty(b) {
  const desc = b.description || b.summary || 'No description provided.';
  const urgent = new Date(b.deadline).getTime() - Date.now() <= 86400000;
  const organizerHandle = String(b.creatorHandle || b.ownerHandle || '').trim();
  const organizer = organizerHandle ? `<a class="organizer-chip" href="#/profile/${encodeURIComponent(organizerHandle)}">Organizer · @${esc(organizerHandle)} →</a>` : '';
  return `<p class="crumb"><a href="#/">← All bounties</a></p><section class="detail card"><p class="eyebrow">BOUNTY DETAILS</p><h1>${esc(b.title)}</h1><p class="lede">${esc(b.summary || '')}</p><div class="stats large"><div class="pot-stat"><small>Live pot</small><strong>${pot(b)}</strong></div><div><small>Entry fee</small>${feePill(b)}</div><div><small>Entries</small><strong>${Number(b.submissionCount||0)}</strong></div></div><dl><dt>Deadline</dt><dd class="deadline-block"><span class="badge ${urgent?'urgent':''}">${timeLeft(b.deadline)}</span><time>${date(b.deadline)}</time></dd><dt>Entry info</dt><dd>${esc(b.entryInstructions || b.entryInfo || 'Submit your entry through make.fun before the deadline.')}</dd></dl><p class="actions"><a class="button" href="${slugLink(b)}/leaderboard">View leaderboard</a>${organizer}</p></section><section class="description-wrap"><h2>About this bounty</h2><div class="description">${esc(desc)}</div></section>`;
}

export function leaderboard(data, slug, page = 1) {
  const rows = data.entries || [];
  const columns = data.columns || [];
  const size = 20, pages = Math.max(1, Number(data.totalPages || Math.ceil((data.total || rows.length)/size)));
  const sliced = rows.length > size ? rows.slice((page-1)*size,page*size) : rows;
  const topScore = rows[0] ? (rows[0].display?.[columns[0]?.key] ?? rows[0].values?.[columns[0]?.key] ?? '—') : '—';
  return `<p class="crumb"><a href="#/bounty/${encodeURIComponent(slug)}">← Bounty details</a></p><section class="hero compact"><p class="eyebrow">COMPETITION RANKINGS</p><h1>Leaderboard</h1><p>${esc(data.competition?.title || 'Entries ranked by score')} · ${esc(data.phase?.title || '')}</p><p class="summary-line">${Number(data.total ?? rows.length).toLocaleString('en-US')} entries shown <span aria-hidden="true">·</span> Top score ${esc(topScore)}</p></section><div class="table-wrap"><table><caption class="sr-only">Leaderboard ranked entries and scores</caption><thead><tr><th scope="col">Rank</th><th scope="col">Handle</th>${columns.map(c=>`<th scope="col">${esc(c.title)}</th>`).join('')}</tr></thead><tbody>${sliced.map((r,i)=>{const rank=Number(r.rank ?? ((page-1)*size+i+1));return `<tr class="${rank<=3?`rank-${rank}`:''}"><td><span class="rank-medal">${rank}</span></td><td><a class="handle-link" href="#/profile/${encodeURIComponent(r.handle || '')}">@${esc(r.handle || 'unknown')}</a></td>${columns.map(c=>{const value=r.display?.[c.key] ?? r.values?.[c.key] ?? '—';const win=/win.?rate/i.test(`${c.key} ${c.title}`);return `<td class="${win?'win-rate':''}">${esc(value)}</td>`}).join('')}</tr>`}).join('') || `<tr><td colspan="${columns.length+2}">No entries yet.</td></tr>`}</tbody></table></div><nav class="pagination" aria-label="Leaderboard pages"><button data-page="${Math.max(1,page-1)}" ${page<=1?'disabled':''}>← Previous</button><span>Page ${page} of ${pages}</span><button data-page="${Math.min(pages,page+1)}" ${page>=pages?'disabled':''}>Next →</button></nav>`;
}

export function profile(data, handle) {
  const p = data;
  const solutions = p.solutions || [];
  const record = p.record || {};
  return `<p class="crumb"><a href="#/">← Bounty board</a></p><section class="hero compact"><p class="eyebrow">PUBLIC PROFILE</p><h1>@${esc(p.handle || handle)}</h1>${p.display_name ? `<p>${esc(p.display_name)}</p>`:''}${p.bio ? `<p>${esc(p.bio)}</p>`:''}<div class="profile-stats"><div class="stat-chip"><strong>${record.competitions_entered ?? 0}</strong><small>Entered</small></div><div class="stat-chip"><strong>${record.competitions_placed ?? 0}</strong><small>Placed</small></div><div class="stat-chip"><strong>${record.competitions_won ?? 0}</strong><small>Won</small></div><div class="stat-chip"><strong>${record.best_placement ?? '—'}</strong><small>Best</small></div><div class="stat-chip"><strong>${money(record.prize_usd ?? 0)}</strong><small>Prizes</small></div></div></section><section class="profile-grid"><div class="card"><h2>Solutions <span class="subtle">${solutions.length}</span></h2>${solutions.length ? `<ul class="link-list">${solutions.map(e=>`<li><a class="solution-title" href="#/bounty/${encodeURIComponent(e.competition?.slug || '')}">${esc(e.title || e.competition?.title || 'Solution')}</a><span class="solution-meta"><b class="solution-rank">${e.placement ? `Rank ${e.placement}` : 'Pending'}</b> · ${esc(e.competition?.status || '')} · ${e.score?.display ?? '—'} · <b class="solution-prize">${money(e.prize_usd ?? 0)}</b></span></li>`).join('')}</ul>` : '<p>No public solutions.</p>'}</div></section>`;
}
