const { chromium } = require('playwright');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  await p.addInitScript(() => localStorage.setItem('vortex-tutorial', '1')); // skip the first-run tutorial
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (x) => p.evaluate(x);
  await p.goto('http://127.0.0.1:8765/index.html'); await ev('localStorage.clear()'); await p.reload(); await p.waitForTimeout(300);
  await ((await p.evaluate("state === 'title'")) ? p.evaluate('startGame(false)') : p.mouse.click(500, 680)); await p.waitForTimeout(200);
  await ev('briefingTimer = 0; hull = hullMax; enemies = []');
  for (let i = 0; i < 4; i++) await ev(`spawnEnemy(${i * 0.4 - 0.6}, '${['drone','weaver','shooter','pentagram'][i]}'); enemies.at(-1).z = 0.3; enemies.at(-1).hp = 0;`);
  await p.mouse.move(560, 300);
  await ev('triggerNova()'); await p.waitForTimeout(250);
  ok(await ev('voxels.length') > 20, 'kills shatter into voxels (' + await ev('voxels.length') + ')');
  ok(await ev('circuitPulses.length') > 0, 'circuit pulses running');
  for (let x = 300; x < 700; x += 40) { await p.mouse.move(x, 250); await p.waitForTimeout(30); }
  ok(await ev('aimTrail.length') > 3, 'aim trail recorded');
  await p.screenshot({ path: process.argv[2] + '/shatter1.png' });
  await ev('damageShip(99999)'); await p.waitForTimeout(350);
  ok(await ev('shipShattered && voxels.length > 100'), 'ship shatters on death');
  await p.screenshot({ path: process.argv[2] + '/shatter2.png' });
  await p.waitForTimeout(2000);
  ok(await ev('voxels.length') === 0, 'voxels fade out on the game over screen');
  await ((await p.evaluate("state === 'title'")) ? p.evaluate('startGame(false)') : p.mouse.click(500, 650)); await p.waitForTimeout(150);
  ok(await ev('!shipShattered && state === "playing"'), 'ship back on retry');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
