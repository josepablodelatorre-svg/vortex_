const { chromium } = require('playwright');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 760 } });
  await p.addInitScript(() => { localStorage.setItem('vortex-tutorial', '1'); localStorage.setItem('vortex-flash-warned', '1'); }); // skip the first-run tutorial
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (x) => p.evaluate(x);
  await fetch('http://127.0.0.1:8790/__reset');
  await p.goto('http://127.0.0.1:8765/index.html?scores=http://127.0.0.1:8790'); await ev('localStorage.clear()'); await p.reload(); await p.waitForTimeout(300);
  const die = async (sc, name) => {
    await ev(`pilotName = '${name}'; startGame(false, 'campaign'); briefingTimer = 0; score = ${sc}`);
    for (let i = 0; i < 20 && await ev(`state === 'playing'`); i++) { await ev('plasma = 0; damageShip(99999)'); await p.waitForTimeout(50); }
  };
  await die(500, 'ADA');
  ok((await ev(`document.getElementById('boardLost').textContent`)).startsWith('NEW #1 ON THE LEADERBOARD!'), 'first run tops the board');
  await p.waitForFunction(() => document.getElementById('boardLost').textContent.includes('WORLD #1'), null, { timeout: 4000 }).catch(() => {});
  ok((await ev(`document.getElementById('boardLost').textContent`)).includes('WORLD #1'), 'and it is sent to the world board: WORLD #1');
  await die(1200, 'LINUS');
  await die(300, 'GRACE');
  ok((await ev(`document.getElementById('boardLost').textContent`)).startsWith('LEADERBOARD #3'), 'a lower score lands at its place');
  await p.waitForFunction(() => document.getElementById('boardLost').textContent.includes('WORLD #'), null, { timeout: 4000 }).catch(() => {});
  ok((await ev(`document.getElementById('boardLost').textContent`)).endsWith('WORLD #3'), 'world place counts the better scores (WORLD #3)');
  const names = await ev(`boards.campaign.map(e => e.name + ':' + e.score).join(' ')`);
  ok(names === 'LINUS:1200 ADA:500 GRACE:300', 'board sorted by score (' + names + ')');
  for (let i = 0; i < 9; i++) await die(2000 + i, 'BOT' + i);
  ok(await ev('boards.campaign.length') === 10 && !(await ev(`boards.campaign.some(e => e.name === 'GRACE')`)), 'keeps only the top 10');
  await die(1, 'LOW');
  ok(!(await ev(`document.getElementById('boardLost').textContent`)).includes('LEADERBOARD'), 'a score off the local board gets no local place');
  // rift has its own board
  await ev(`pilotName = 'ADA'; startGame(false, 'rift'); score = 777`);
  for (let i = 0; i < 20 && await ev(`state === 'playing'`); i++) { await ev('plasma = 0; damageShip(99999)'); await p.waitForTimeout(50); }
  ok(await ev(`boards.rift.length === 1 && boards.rift[0].reach.startsWith('D')`), 'the Rift keeps its own board, with depth');
  // the screen
  await ev(`backToMenu(); showScreen('board')`); await p.waitForTimeout(150);
  ok(await ev(`document.querySelectorAll('#boardlist .boardrow').length`) === 1 && await ev(`document.querySelector('#boardtabs .selected').dataset.board`) === 'rift', 'board screen opens on the mode just played');
  await p.click('#boardtabs [data-board="campaign"]');
  ok(await ev(`document.querySelectorAll('#boardlist .boardrow').length`) === 10, 'campaign tab lists 10');
  await p.screenshot({ path: process.argv[2] + '/leaderboard.png' });
  // the world board
  await p.click('#boardscope [data-scope="world"]');
  await p.waitForFunction(() => document.querySelectorAll('#boardlist .boardrow').length > 0, null, { timeout: 5000 }).catch(() => {});
  const world = await ev(`[...document.querySelectorAll('#boardlist .boardrow')].map(r => r.children[1].textContent + ':' + r.children[2].textContent)`);
  ok(world.length === 10 && world[0] === 'BOT8:2008' && (await ev(`document.getElementById('boardnote').textContent`)) === 'TOP 10 IN THE WORLD', 'WORLD tab lists the online top 10 (' + world.slice(0, 2).join(' ') + ')');
  await p.screenshot({ path: process.argv[2] + '/leaderboard-world.png' });
  // offline: the score waits and is sent later
  await ev(`ONLINE.url = 'http://127.0.0.1:1'`);
  await ev(`backToMenu(); pilotName = 'LATE'; startGame(false, 'campaign'); score = 5000`);
  for (let i = 0; i < 20 && await ev(`state === 'playing'`); i++) { await ev('plasma = 0; damageShip(99999)'); await p.waitForTimeout(50); }
  await p.waitForFunction(() => pendingScores().length === 1, null, { timeout: 5000 }).catch(() => {});
  ok(await ev('pendingScores().length') === 1, 'with no connection the score is kept for later');
  await ev(`ONLINE.url = 'http://127.0.0.1:8790'`);
  await ev(`backToMenu(); pilotName = 'NEXT'; startGame(false, 'campaign'); score = 10`);
  for (let i = 0; i < 20 && await ev(`state === 'playing'`); i++) { await ev('plasma = 0; damageShip(99999)'); await p.waitForTimeout(50); }
  await p.waitForFunction(() => pendingScores().length === 0, null, { timeout: 5000 }).catch(() => {});
  const late = await (await fetch('http://127.0.0.1:8790/rest/v1/scores?mode=eq.campaign&score=eq.5000', { headers: { apikey: 'x' } })).json();
  ok(await ev('pendingScores().length') === 0 && late.length === 1 && late[0].name === 'LATE', 'and sent once the connection is back');
  await p.reload(); await p.waitForTimeout(300);
  ok(await ev('boards.campaign.length') === 10, 'board survives a reload');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
