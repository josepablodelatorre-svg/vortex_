const { chromium } = require('playwright');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const A = await (await b.newContext({ viewport: { width: 900, height: 700 } })).newPage();
  const B = await (await b.newContext({ viewport: { width: 900, height: 700 } })).newPage();
  const errs = [];
  A.on('pageerror', e => errs.push('A: ' + e.message)); B.on('pageerror', e => errs.push('B: ' + e.message));
  const a = (x) => A.evaluate(x), bb = (x) => B.evaluate(x);
  const waitFor = async (pg, expr, ms = 10000) => { for (let i = 0; i < ms / 100; i++) { if (await pg.evaluate(expr)) return true; await pg.waitForTimeout(100); } return false; };
  await A.goto('http://127.0.0.1:8765/index.html?peerhost=127.0.0.1:9000'); await a('localStorage.clear()'); await A.reload(); await A.waitForTimeout(300);
  await A.evaluate(v => { document.getElementById('pilotname').value = v; }, 'ada');
  await A.evaluate(sel => document.querySelector(sel).click(), '#versusBtn');
  await waitFor(A, 'netId');
  const url = await a('versusUrl()');
  console.log('  versus url:', url);
  ok((await a(`document.querySelector('#lobby h2').textContent`)) === 'VERSUS LINK', 'challenger sees the VERSUS LINK QR');
  await B.goto(url); await B.waitForTimeout(400);
  ok((await bb(`document.querySelector('#lobby h2').textContent`)) === 'VERSUS CHALLENGE', 'opening the link shows the challenge');
  await B.evaluate(v => { document.getElementById('pilotname').value = v; }, 'grace');
  await B.click('#lobbyAccept');
  ok(await waitFor(A, 'state === "playing" && versus') && await waitFor(B, 'state === "playing" && versus'), 'both screens count down and start the match');
  ok(await a('vsName') === 'GRACE' && await bb('vsName') === 'PILOT' || await bb('vsName') === 'ADA', 'each side knows its rival (' + await a('vsName') + ' / ' + await bb('vsName') + ')');
  ok(await a('vsSeed') === await bb('vsSeed'), 'same seed on both screens');
  await a('briefingTimer = 0'); await bb('briefingTimer = 0');
  await A.waitForTimeout(800);
  ok(await a(`getComputedStyle(document.getElementById('vspanel')).display`) === 'flex' && (await a(`document.getElementById('vsname').textContent`)).includes('GRACE'), 'opponent panel shows GRACE live');
  // A kills 3 -> B gets an intruder
  await a(`for (let i = 0; i < 3; i++) { spawnEnemy(0.2 * i, 'drone'); enemies.at(-1).z = 0.3; } ; for (const e of enemies) bolts.push({angle: e.angle, z: e.z})`);
  ok(await waitFor(B, `enemies.some(e => e.type === 'intruder') || vsIncoming > 0`, 5000), 'three kills on A send an intruder into B tunnel');
  await B.waitForTimeout(600);
  await B.screenshot({ path: process.argv[2] + '/vs-b.png' });
  // B dies -> A wins
  await a('hull = hullMax'); await bb('damageShip(99999)');
  ok(await waitFor(A, `state === 'cleared' && document.getElementById('wontitle').textContent === 'VICTORY'`), 'B dies, A gets VICTORY');
  ok((await bb(`document.getElementById('losttitle').textContent`)) === 'DEFEATED', 'B sees DEFEATED');
  await A.screenshot({ path: process.argv[2] + '/vs-a.png' });
  // rematch: both click
  await A.mouse.click(450, 650); await B.mouse.click(450, 650);
  ok(await waitFor(A, 'state === "playing"') && await waitFor(B, 'state === "playing"'), 'both click -> rematch starts on both');
  // disconnect -> win by forfeit
  await a('briefingTimer = 0'); await bb('briefingTimer = 0');
  await B.close();
  ok(await waitFor(A, `state === 'cleared'`, 15000), 'closing B gives A the win by forfeit');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
