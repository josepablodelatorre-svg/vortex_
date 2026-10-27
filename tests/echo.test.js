const { chromium } = require('playwright');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 760 } });
  await p.addInitScript(() => { localStorage.setItem('vortex-tutorial', '1'); localStorage.setItem('vortex-flash-warned', '1'); }); // skip the first-run tutorial
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (x) => p.evaluate(x);
  await p.goto('http://127.0.0.1:8765/index.html'); await ev('localStorage.clear()'); await p.reload(); await p.waitForTimeout(400);
  // hangar previews of each ship class
  await ev(`showScreen('hangar')`); await p.waitForTimeout(150);
  for (let i = 0; i < 4; i++) {
    await p.click(`#shipclass button[data-class="${i}"]`); await p.waitForTimeout(150);
    await p.locator('#shippreview').screenshot({ path: `${process.argv[2]}/prev${i}.png` });
  }
  await p.click('#shipclass button[data-class="0"]');
  await ev('startGame(false)'); await p.waitForTimeout(200);
  await ev('briefingTimer = 0; hull = 9999; hullMax = 9999');
  await ev(`collectPowerup({angle: 0, z: 0.02, alive: true, kind: 'echo'})`);
  ok(await ev('echoTimer > 9'), 'echo pickup active');
  await ev('bolts = []'); await p.mouse.move(650, 250); await p.waitForTimeout(100);
  await p.mouse.click(650, 250); await p.waitForTimeout(80);
  const n0 = await ev('bolts.length');
  await p.waitForFunction('echoQueue.length === 0', null, { timeout: 6000 }).catch(() => {});
  const r = await ev('JSON.stringify({echoes: bolts.filter(q => q.echo).length, real: bolts.filter(q => !q.echo).length, queue: echoQueue.length})');
  console.log('  ', r);
  ok(JSON.parse(r).echoes === 2 && n0 >= 1, 'one shot -> two echo shots later');
  await p.screenshot({ path: process.argv[2] + '/echo.png' });
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
