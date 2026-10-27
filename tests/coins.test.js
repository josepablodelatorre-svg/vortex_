const { chromium, devices } = require('playwright');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 720 } });
  await p.addInitScript(() => { localStorage.setItem('vortex-tutorial', '1'); localStorage.setItem('vortex-flash-warned', '1'); }); // skip the first-run tutorial
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (x) => p.evaluate(x);
  await p.goto('http://127.0.0.1:8765/index.html'); await ev('localStorage.clear()'); await p.reload(); await p.waitForTimeout(300);
  await ev('startGame(false)'); await p.waitForTimeout(200);
  await ev('briefingTimer = 0; trackTimer = 999; spawnTimer = 999');
  await ev(`for (let k = 0; k < 5; k++) trackItems.push({ kind: 'coin', angle: shipLane, z: 0.05 + k * 0.03 })`);
  await p.waitForFunction('runCoins >= 5', null, { timeout: 5000 }).catch(() => {});
  ok(await ev('runCoins') === 5 && await ev('coins') === 25, 'flying over a coin row collects 5 coins');
  ok((await ev(`document.getElementById('hudcoins').textContent`)) === 'COINS 5', 'HUD shows run coins');
  await ev(`for (let k = 0; k < 5; k++) trackItems.push({ kind: 'coin', angle: shipLane + 1.5, z: 0.05 + k * 0.03 })`);
  await p.waitForTimeout(800);
  ok(await ev('runCoins') === 5, 'coins outside your lane are missed');
  ok(await ev(`store.getItem('vortex-coins')`) === '25', 'coins are saved');
  // steering toward where a row is drawn (swirl and all) collects it
  const steer = await ev(`(() => {
    let got = 0;
    for (const off of [-1.1, -0.6, 0.6, 1.1]) {
      trackItems = []; enemies = []; spawnTimer = 99; trackTimer = 99; runT = 80;
      const before = runCoins, A = normalizeAngle(Math.PI + off);
      for (let k = 0; k < 5; k++) trackItems.push({ kind: 'coin', angle: A, z: 0.9 + k * 0.05 });
      for (let i = 0; i < 480; i++) {
        const c = trackItems.find(it => it.kind === 'coin' && !it.done);
        if (c) { const v = pointOnRing(c.angle, c.z); aimAngle = normalizeAngle(Math.atan2(v.x - CX, -(v.y - CY)) + camRoll); }
        hull = hullMax; simulate(1 / 60);
      }
      got += runCoins - before;
    }
    return got;
  })()`);
  ok(steer === 20, 'steering at where coins are drawn collects every coin (' + steer + '/20)');
  // shop
  await ev('coins = 500; saveWallet(); damageShip(99999)'); await p.waitForTimeout(300);
  ok((await ev(`document.getElementById('rankLost').textContent`)).includes('COINS'), 'results show coins earned');
  await ev('backToMenu(); showScreen("shop")'); await p.waitForTimeout(200);
  const buttons = await ev(`[...document.querySelectorAll('#shoplist button')].map(x => x.textContent).join(',')`);
  console.log('  shop:', buttons);
  await ev(`document.querySelectorAll('#shoplist button')[0].click()`); await ev(`document.querySelectorAll('#shoplist .shoprow button')[3].click()`);
  ok(await ev('up("plasma")') === 1 && await ev('up("bomb")') === 1 && await ev('coins') === 500 - 60 - 150, 'buying PLASMA CELLS and EXTRA BOMB spends coins');
  await ev('startGame(false, "campaign")'); await p.waitForTimeout(200);
  ok(await ev('zapperCharges') === 2 && await ev('plasmaMax') === Math.round(150 * 0.4 * 1.15), 'upgrades apply: 2 bombs, bigger plasma');
  console.log('errors', JSON.stringify(errs));
  const q = await (await b.newContext({ ...devices['iPhone 13'] })).newPage();
  await q.addInitScript(() => { localStorage.setItem('vortex-tutorial', '1'); localStorage.setItem('vortex-flash-warned', '1'); }); // skip the first-run tutorial
  await q.goto('http://127.0.0.1:8765/index.html'); await q.evaluate('coins = 230; upgrades = {plasma: 2, magnet: 1}; saveWallet(); showScreen("shop")'); await q.waitForTimeout(400);
  await q.screenshot({ path: process.argv[2] + '/shop.png' });
  await q.evaluate('startGame(false)'); await q.waitForTimeout(200);
  await q.evaluate(`briefingTimer = 0; document.getElementById('briefing').style.display = 'none'; trackTimer = 999; for (let r = 0; r < 3; r++) for (let k = 0; k < 5; k++) trackItems.push({ kind: 'coin', angle: Math.PI + (r - 1) * 0.6, z: 0.3 + r * 0.15 + k * 0.05 })`);
  await q.waitForTimeout(300);
  await q.screenshot({ path: process.argv[2] + '/coins-play.png' });
  await b.close();
})();
