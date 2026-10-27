// A tiny stand-in for the Supabase REST API (just what src/online.js uses),
// on 127.0.0.1:8790, so tests never touch the real world leaderboard.
// Pages use it via ?scores=http://127.0.0.1:8790. Keeps rows in memory.
const http = require('http');

function start(port = 8790) {
  let rows = [];
  let nextId = 1;
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'apikey, content-type, prefer, range',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Expose-Headers': 'content-range'
  };
  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/__reset') { rows = []; res.writeHead(204, cors); res.end(); return; }
    if (url.pathname !== '/rest/v1/scores' || !req.headers.apikey) { res.writeHead(401, cors); res.end(); return; }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', d => { body += d; });
      req.on('end', () => {
        const r = JSON.parse(body);
        // the same rules as supabase/schema.sql
        const valid = ['campaign', 'rift', 'daily'].includes(r.mode) && /^[A-Z0-9 _.!?-]{1,10}$/.test(r.name) &&
          r.score > 0 && r.score < 10000000 && ['S', 'A', 'B', 'C', 'D'].includes(r.rank) && r.reach && r.ship && r.day;
        if (!valid) { res.writeHead(400, cors); res.end('{"message":"check violation"}'); return; }
        rows.push({ ...r, id: nextId++, created_at: new Date().toISOString() });
        res.writeHead(201, cors); res.end();
      });
      return;
    }
    // GET: eq / gt filters, order, limit, exact count
    let list = rows.slice();
    for (const [k, v] of url.searchParams) {
      const m = /^(eq|gt)\.(.*)$/.exec(v);
      if (!m || ['select', 'order', 'limit'].includes(k)) continue;
      list = list.filter(r => m[1] === 'eq' ? String(r[k]) === m[2] : r[k] > Number(m[2]));
    }
    if (url.searchParams.get('order')) list.sort((a, b) => b.score - a.score || a.id - b.id);
    const total = list.length;
    const limit = parseInt(url.searchParams.get('limit'), 10);
    if (limit) list = list.slice(0, limit);
    const headers = { ...cors, 'Content-Type': 'application/json' };
    if ((req.headers.prefer || '').includes('count=exact')) headers['Content-Range'] = (total ? '0-0' : '*') + '/' + total;
    res.writeHead(200, headers);
    res.end(JSON.stringify(list));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { start };
if (require.main === module) start().then(() => console.log('scores stand-in on 127.0.0.1:8790'));
