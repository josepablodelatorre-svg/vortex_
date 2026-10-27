const { chromium } = require('playwright');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  await p.addInitScript(() => localStorage.setItem('vortex-tutorial', '1')); // skip the first-run tutorial
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (x) => p.evaluate(x);
  const wait = (ms) => p.waitForTimeout(ms);
  await p.goto('http://127.0.0.1:8765/index.html'); await ev('localStorage.clear()'); await p.reload(); await wait(300);
  await ((await p.evaluate("state === 'title'")) ? p.evaluate('startGame(false)') : p.mouse.click(500, 680)); await wait(200);
  await ev('briefingTimer = 0; hull = hullMax; enemies = []; spawnTimer = 99'); // no fresh spawns mid-sweep
  // enemies spread all around the ring at the sweep depth
  await ev(`for (let i = 0; i < 6; i++) { spawnEnemy(-Math.PI + i * Math.PI / 3 + 0.2, 'drone'); enemies.at(-1).z = 0.5; enemies.at(-1).speed = 0; }`);
  await ev(`collectPowerup({angle: 0, z: 0.02, alive: true, kind: 'disc'})`);
  ok(await ev('discCharges') === 3, 'disc pickup gives 3 throws');
  await p.mouse.move(500, 200); await ((await p.evaluate("state === 'title'")) ? p.evaluate('startGame(false)') : p.mouse.click(500, 200)); await wait(50);
  ok(await ev('!!disc && discCharges === 2'), 'clicking throws the disc');
  await wait(500);
  await p.screenshot({ path: process.argv[2] + '/disc.png' });
  for (let i = 0; i < 40 && await ev('!!disc'); i++) { await ev('hull = hullMax'); await wait(100); }
  const left = await ev('enemies.length');
  ok(left <= 1, 'one throw sweeps the ring: ' + (6 - left) + '/6 enemies sliced');
  ok(await ev('!disc'), 'disc returns and is caught');
  // watchdog + overseer on level 2
  await ev(`currentLevel = 2; missionType = 'destroy'; enemies = []; killCount = 20; nextMinibossIndex = 2; comms = null`);
  await wait(400);
  ok(await ev('bossActive && boss.form === "watchdog"'), 'level 2 boss is a Warden');
  await wait(900);
  console.log('  comms:', await ev(`document.getElementById('commslabel').textContent + ' ' + document.getElementById('commstext').textContent`));
  ok(await ev(`document.getElementById('comms').classList.contains('hacked')`), 'OVERSEER hacks the channel');
  const a0 = await ev('boss.angle'); await ev('hull = hullMax'); await wait(1200); await ev('hull = hullMax');
  ok(Math.abs((await ev('boss.angle')) - a0) > 0.05, 'Watchdog sways around the tube');
  await ev('boss.z = 0.6; boss.stompTimer = 0.5'); await wait(500);
  await p.screenshot({ path: process.argv[2] + '/watchdog.png' });
  ok(await ev('boss.lunge > 0 || boss.z < 0.6'), 'Watchdog stomps forward');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
