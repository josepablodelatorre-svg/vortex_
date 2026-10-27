// VORTEX - The online (world) leaderboard, on Supabase.
// Plain script, loaded in order by index.html; shares globals with the others.

// ---------- World leaderboard ----------
// Talks to Supabase's REST API with plain fetch (no library). The table and
// its rules are in supabase/schema.sql. The key below is Supabase's
// *publishable* key: it's meant to sit in a public page, and the table's
// row-level security only lets it read scores and add new ones.
// Leave ONLINE.url empty to switch the world board off.
const ONLINE = {
  url: 'https://szwwqpfkaxrkgubjbtms.supabase.co',
  key: 'sb_publishable_aXwZYMniNQFoy7VfcazFRQ_-8VexTwZ'
};
// tests point the game at a local stand-in: ?scores=http://127.0.0.1:8790.
// A copy running locally (tests, development, opened from disk) never
// posts to the real board unless pointed at it like that.
{
  const m = /[?&]scores=([^&]+)/.exec(location.search);
  if (m) ONLINE.url = decodeURIComponent(m[1]);
  else if (!/^https:$/.test(location.protocol) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) ONLINE.url = '';
}
const onlineEnabled = () => !!(ONLINE.url && ONLINE.key);
const worldCache = {}; // mode -> { at, rows }
let worldStatus = '';

function onlineHeaders(extra) {
  return Object.assign({ apikey: ONLINE.key, 'Content-Type': 'application/json' }, extra || {});
}

// names on the world board: the game's pixel font letters only
function cleanName(name) {
  return (name || 'PILOT').toUpperCase().replace(/[^A-Z0-9 _.!?-]/g, '').trim().slice(0, 10) || 'PILOT';
}

// scores that couldn't be sent (offline, server down) wait in the save
function pendingScores() {
  try { return JSON.parse(store.getItem('vortex-pending-scores') || '[]'); } catch (e) { return []; }
}
function setPendingScores(list) {
  try { store.setItem('vortex-pending-scores', JSON.stringify(list.slice(-20))); } catch (e) { /* ignore */ }
}

function postScore(row) {
  return fetch(ONLINE.url + '/rest/v1/scores', {
    method: 'POST',
    headers: onlineHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(row)
  }).then(res => {
    if (!res.ok) throw new Error('HTTP ' + res.status);
  });
}

// how many scores on that board beat this one: the world place is that + 1
function worldPlace(row) {
  let q = '/rest/v1/scores?select=id&mode=eq.' + row.mode + '&score=gt.' + row.score;
  if (row.mode === 'daily') q += '&day=eq.' + row.day;
  return fetch(ONLINE.url + q, { headers: onlineHeaders({ Prefer: 'count=exact', Range: '0-0' }) })
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const total = /\/(\d+)$/.exec(res.headers.get('content-range') || '');
      return total ? parseInt(total[1], 10) + 1 : 0;
    });
}

// called with each finished run's board entry; resolves to the world place
// (or 0 when offline / switched off). Earlier unsent scores go first.
function submitOnline(entry, mode) {
  if (!onlineEnabled()) return Promise.resolve(0);
  const row = {
    mode, day: entry.date, name: cleanName(entry.name), score: entry.score,
    reach: entry.reach.slice(0, 8), rank: entry.rank, ship: entry.cls.slice(0, 12), version: GAME_VERSION
  };
  const queue = pendingScores();
  return queue.reduce((chain, old) => chain.then(() => postScore(old)), Promise.resolve())
    .then(() => { setPendingScores([]); return postScore(row); })
    .then(() => { delete worldCache[mode]; return worldPlace(row); })
    .catch(() => {
      // keep it (and anything already waiting) for next time
      const waiting = pendingScores();
      if (!waiting.some(r => r.score === row.score && r.day === row.day && r.name === row.name)) waiting.push(row);
      setPendingScores(waiting);
      return 0;
    });
}

// the top 10 for a board, cached for half a minute
function fetchWorldBoard(mode) {
  const cached = worldCache[mode];
  if (cached && Date.now() - cached.at < 30000) return Promise.resolve(cached.rows);
  let q = '/rest/v1/scores?select=name,score,reach,rank,ship,created_at&mode=eq.' + mode + '&order=score.desc,created_at.asc&limit=' + BOARD_SIZE;
  if (mode === 'daily') q += '&day=eq.' + todayKey();
  return fetch(ONLINE.url + q, { headers: onlineHeaders() })
    .then(res => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
    .then(rows => {
      const list = rows.map(r => ({ name: r.name, score: r.score, reach: r.reach, rank: r.rank, cls: r.ship, at: Date.parse(r.created_at) }));
      worldCache[mode] = { at: Date.now(), rows: list };
      return list;
    });
}

// a moment after the game opens, send anything left over from last time
setTimeout(() => {
  const queue = pendingScores();
  if (!onlineEnabled() || !queue.length || !navigator.onLine) return;
  queue.reduce((chain, row) => chain.then(() => postScore(row)), Promise.resolve())
    .then(() => setPendingScores([]))
    .catch(() => {});
}, 4000);
