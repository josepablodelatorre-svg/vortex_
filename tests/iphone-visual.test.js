// iPhone-sized walk through the start screens and a run; checks nothing
// overflows the screen and leaves screenshots in tests/shots/.
const { chromium, devices } = require('playwright');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ ...devices['iPhone 13'] });
  const p = await c.newPage();
  await p.addInitScript(() => localStorage.setItem('vortex-tutorial', '1')); // skip the first-run tutorial
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (x) => p.evaluate(x);
  const fits = () => ev(`document.documentElement.scrollWidth <= innerWidth + 1`);
  await p.goto('http://127.0.0.1:8765/index.html'); await ev('localStorage.clear()'); await p.reload(); await p.waitForTimeout(800);
  await p.screenshot({ path: process.argv[2] + '/ip-splash.png' });
  ok(await ev(`getComputedStyle(document.getElementById('hud')).display`) === 'none', 'no HUD on the title');
  for (const screen of ['menu', 'hangar', 'multi', 'missions', 'shop', 'settings']) {
    await ev(`showScreen('${screen}')`); await p.waitForTimeout(150);
    const h = await ev(`document.querySelector('.screen[data-screen="${screen}"]').scrollHeight`);
    ok(await fits() && h <= await ev('innerHeight'), `${screen} screen fits (${h}px)`);
    await p.screenshot({ path: `${process.argv[2]}/ip-${screen}.png` });
  }
  await ev('startGame(false)'); await p.waitForTimeout(600);
  ok(await ev('state') === 'playing', 'run starts');
  await ev('hull = hullMax; briefingTimer = 0.01; for (let i = 0; i < 4; i++) spawnEnemy()');
  await p.waitForTimeout(1200);
  await p.screenshot({ path: process.argv[2] + '/ip-play.png' });
  for (let i = 0; i < 20 && await ev(`state === 'playing'`); i++) { await ev('plasma = 0; damageShip(99999)'); await p.waitForTimeout(100); }
  await p.waitForTimeout(400);
  ok(await ev('state') === 'gameover', 'game over shows');
  await p.screenshot({ path: process.argv[2] + '/ip-over.png' });
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
