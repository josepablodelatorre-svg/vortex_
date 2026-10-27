const { chromium, devices } = require('playwright');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 720 } });
  await p.addInitScript(() => { localStorage.setItem('vortex-tutorial', '1'); localStorage.setItem('vortex-flash-warned', '1'); }); // skip the first-run tutorial
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (x) => p.evaluate(x);
  const wait = (ms) => p.waitForTimeout(ms);
  await p.goto('http://127.0.0.1:8765/index.html'); await ev('localStorage.clear()'); await p.reload(); await wait(300);
  await ((await p.evaluate("state === 'title'")) ? p.evaluate('startGame(false)') : p.mouse.click(500, 700)); await wait(200);
  await ev('briefingTimer = 0; spawnTimer = 999; formationTimer = 999; clusterTimer = 999; enemies = []');
  // aim straight down: ship at the bottom
  await p.mouse.move(500, 700); await wait(500);
  ok(Math.abs(Math.abs(await ev('shipLane')) - Math.PI) < 0.2, 'aiming down puts the ship at the bottom of its arc');
  await p.mouse.move(995, 360); await wait(800); console.log('  lane', (await ev('shipLane')).toFixed(2), 'aim', (await ev('aimAngle')).toFixed(2));
  ok(Math.abs((await ev('shipLane')) - Math.PI / 2) < 0.15, 'aiming right slides the ship up to 3 o\'clock');
  await p.mouse.move(700, 50); await wait(500);
  ok(Math.abs((await ev('shipLane')) - Math.PI / 2) < 0.15, 'aiming up-right parks it at the end of the arc');
  await p.mouse.move(500, 700); await wait(900);
  // enemy in another lane reaches the rim: no damage
  const h0 = await ev('hull + plasma');
  await ev(`spawnEnemy(0, 'drone'); enemies.at(-1).z = 0.02;`); await wait(150);
  ok(await ev('hull + plasma') === h0, 'an enemy reaching the rim outside your lane flies past');
  await ev(`spawnEnemy(shipLane, 'drone'); enemies.at(-1).z = 0.02;`); await wait(150);
  ok(await ev('plasma') < await ev('plasmaMax') && await ev('hull') === await ev('hullMax'), 'a hit in your lane drains PLASMA first');
  await ev('plasma = 0; updatePlasmaUI()');
  await ev(`spawnEnemy(shipLane, 'drone'); enemies.at(-1).z = 0.02;`); await wait(150);
  ok(await ev('hull') < await ev('hullMax'), 'with plasma gone, hits reach the hull');
  await ev('plasmaHitAt = t - 10'); await wait(600);
  ok(await ev('plasma') > 0, 'plasma recharges after a quiet spell');
  // power + lock-in
  await ev('power = 100; updatePlasmaUI()'); await wait(150);
  ok(await ev(`getComputedStyle(document.getElementById('lockBtn')).display`) === 'block', 'LOCK button appears when power is full');
  await p.keyboard.press('KeyL'); await wait(200);
  ok(await ev('lockinTimer > 7'), 'L activates lock-in');
  await p.mouse.move(500, 20); await p.waitForFunction('Math.abs(shipLane) < 0.3', null, { timeout: 5000 }).catch(() => {});
  ok(Math.abs(await ev('shipLane')) < 0.3, 'during lock-in the ship can ride to the top of the ring');
  ok(await ev('bolts.length') > 3, 'lock-in auto-fires');
  await p.screenshot({ path: process.argv[2] + '/lockin.png' });
  await ev('lockinTimer = 0.01'); await wait(1500); console.log('  after lock-in lane', (await ev('shipLane')).toFixed(2), 'aim', (await ev('aimAngle')).toFixed(2), 'lockin', await ev('lockinTimer'));
  ok(Math.abs(Math.abs(await ev('shipLane')) - Math.PI / 2) < 0.2 || Math.abs(await ev('shipLane')) >= Math.PI / 2 - 0.2, 'after lock-in the ship returns to the lower half');
  ok((await ev(`document.getElementById('hudzap').textContent`)).startsWith('BOMB'), 'HUD says BOMB instead of ZAPPER READY');
  console.log('errors', JSON.stringify(errs));
  // phone look
  const c = await b.newContext({ ...devices['iPhone 13'] });
  const q = await c.newPage();
  await q.addInitScript(() => { localStorage.setItem('vortex-tutorial', '1'); localStorage.setItem('vortex-flash-warned', '1'); }); // skip the first-run tutorial
  await q.goto('http://127.0.0.1:8765/index.html'); await q.waitForTimeout(400);
  await q.evaluate(() => startGame(false)); await q.waitForTimeout(400);
  await q.evaluate('briefingTimer = 0; power = 100; updatePlasmaUI()');
  await q.touchscreen.tap(330, 500); await q.waitForTimeout(900);
  await q.screenshot({ path: process.argv[2] + '/ip3-play.png' });
  await b.close();
})();
