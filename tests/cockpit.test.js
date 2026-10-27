const { chromium, devices } = require('playwright');
const normalizeAngleNode = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 720 } });
  await p.addInitScript(() => localStorage.setItem('vortex-tutorial', '1')); // skip the first-run tutorial
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (x) => p.evaluate(x);
  await p.goto('http://127.0.0.1:8765/index.html'); await ev('localStorage.clear()'); await p.reload(); await p.waitForTimeout(300);
  await ev('showScreen("settings")'); await p.click('#viewToggle');
  ok(await ev('viewMode') === 'cockpit' && await ev(`store.getItem('vortex-view')`) === 'cockpit', 'VIEW toggles to COCKPIT and is saved');
  await ev('startGame(false)'); await ev('briefingTimer = 0; hull = 99999'); await p.waitForTimeout(200);
  await p.mouse.move(800, 600); await p.waitForTimeout(1500);
  const a = await ev('[shipLane, aimAngle].map(v => v.toFixed(2)).join(" ")');
  await p.waitForTimeout(700);
  const b2 = await ev('[shipLane, aimAngle].map(v => v.toFixed(2)).join(" ")');
  console.log('  lane/aim', a, '->', b2);
  ok(a === b2, 'aim and lane settle');
  ok(Math.abs(normalizeAngleNode(await ev('shipLane') - Math.PI)) > 0.3, 'the ship has moved off the bottom toward the pointer');
  // lock-in sends the ship all round the ring; the view must stay steady
  await ev('power = 100; lockIn()'); await p.mouse.move(640, 20);
  await p.waitForFunction('Math.abs(shipLane) < 1', null, { timeout: 5000 }).catch(() => {});
  ok(Math.abs(await ev('shipLane')) < 1 && await ev('typeof viewRot') === 'undefined', 'lock-in carries the ship to the top, and nothing turns the view');
  ok(await ev(`getComputedStyle(document.getElementById('hud')).display`) === 'none', 'cockpit hides the HTML HUD (the dashboard shows it all)');
  const dashTop = await ev('cockpitLayout().vy1');
  const zapBottom = await ev(`document.getElementById('zapBtn').getBoundingClientRect().bottom`);
  ok(zapBottom <= dashTop + 1, 'overlay buttons sit inside the glass, clear of the dashboard');
  for (let i = 0; i < 5; i++) await ev(`spawnEnemy(${-0.8 + i * 0.4}, 'drone'); enemies.at(-1).z = 0.4 + ${i} * 0.1;`);
  await ev('damageShip(5)'); await p.waitForTimeout(150);
  await p.screenshot({ path: process.argv[2] + '/cockpit.png' });
  console.log('errors', JSON.stringify(errs));
  const q = await (await b.newContext({ ...devices['iPhone 13'] })).newPage();
  await q.addInitScript(() => localStorage.setItem('vortex-tutorial', '1')); // skip the first-run tutorial
  await q.goto('http://127.0.0.1:8765/index.html'); await q.evaluate(`localStorage.setItem('vortex-view', 'cockpit')`); await q.reload(); await q.waitForTimeout(300);
  await q.evaluate('startGame(false); briefingTimer = 0; document.getElementById("briefing").style.display = "none"; for (let i = 0; i < 4; i++) spawnEnemy();'); await q.waitForTimeout(900);
  await q.screenshot({ path: process.argv[2] + '/cockpit-ip.png' });
  await b.close();
})();
