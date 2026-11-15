import { getBounties, getBounty, getLeaderboard, getProfile } from './api.js';
import { board, bounty, leaderboard, profile } from './views.js';

const app = document.getElementById('app');
let boardState = { page: 1, sort: 'deadline', filter: 'all' };
let serial = 0;

async function render() {
  const ticket = ++serial;
  window.__shotReady = false;
  app.innerHTML = '<p class="loading" role="status">Loading make.fun data…</p>';
  const hash = location.hash || '#/';
  try {
    let html, title;
    const lb = hash.match(/^#\/bounty\/([^/]+)\/leaderboard(?:\?(.*))?$/);
    const bp = hash.match(/^#\/bounty\/([^/]+)$/);
    const pr = hash.match(/^#\/profile\/([^/]+)$/);
    const page = Number(new URLSearchParams(lb?.[2] || '').get('page') || 1);
    if (lb) { const slug=decodeURIComponent(lb[1]); const d=await getLeaderboard(slug,page); html=leaderboard(d,slug,page); title='Leaderboard'; }
    else if (bp) { const b=await getBounty(decodeURIComponent(bp[1])); html=bounty(b); title=`${b.title} | make.fun`; }
    else if (pr) { const handle=decodeURIComponent(pr[1]); const d=await getProfile(handle); html=profile(d,handle); title=`@${handle} | make.fun`; }
    else { const d=await getBounties(); html=board(d,boardState.page,boardState.sort,boardState.filter); title='Live bounties | make.fun'; }
    if (ticket !== serial) return;
    app.innerHTML=html; document.title=title;
    window.scrollTo(0,0); window.__shotReady=true;
  } catch (e) {
    if (ticket !== serial) return;
    app.innerHTML=`<section class="error" role="alert"><h1>Data could not load</h1><p>${e.message}</p><button id="retry">Try again</button></section>`;
    window.__shotReady=true;
  }
}

app.addEventListener('change', (event) => {
  if (event.target.id==='sort') boardState.sort=event.target.value;
  if (event.target.id==='filter') boardState.filter=event.target.value;
  if (event.target.id==='sort' || event.target.id==='filter') render();
});
app.addEventListener('click', event => {
  if (event.target.id==='retry') render();
  const button=event.target.closest('[data-page]');
  if (!button || button.disabled) return;
  if (location.hash.startsWith('#/bounty/') && location.hash.includes('/leaderboard')) {
    const slug=location.hash.match(/^#\/bounty\/([^/]+)/)?.[1];
    if (slug) location.hash=`#/bounty/${slug}/leaderboard?page=${button.dataset.page}`;
  } else { boardState.page=Number(button.dataset.page); render(); }
});
window.addEventListener('hashchange',render);
render();
