const { chromium } = require('playwright');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (x) => p.evaluate(x);
  await p.goto('http://127.0.0.1:8765/index.html');
  await ev('localStorage.clear()'); await p.reload(); await p.waitForTimeout(300);
  await p.screenshot({ path: process.argv[2] + '/title2.png' });
  // ship class selection persists and sets hull
  await p.evaluate(sel => document.querySelector(sel).click(), '#shipclass button[data-class="2"]');
  ok(await ev('state') === 'title', 'class button does not start the game');
  ok((await ev(`document.getElementById('shipclassdesc').textContent`)).includes('230'), 'tank desc shows hull 230');
  await p.reload(); await p.waitForTimeout(200);
  ok(await ev('shipClassIndex') === 2, 'class choice saved');
  await ((await p.evaluate("state === 'title'")) ? p.evaluate('startGame(false)') : p.mouse.click(500, 680)); await p.waitForTimeout(100);
  ok(await ev('state === "playing" && hullMax === 230 && hull === 230'), 'tank starts with 230 hull');
  ok(await ev('zapperCharges') === 1 && await vis(p, 'zapBtn'), 'zapper ready + ZAP button shown');
  // superzapper via space
  await ev(`enemies = []; for (let i=0;i<4;i++) spawnEnemy(i, 'drone'); killCount = 0;`);
  await p.keyboard.press('Space'); await p.waitForTimeout(50);
  ok(await ev('enemies.length === 0 && killCount === 4 && zapperCharges === 0'), 'SPACE zaps all enemies, uses the charge');
  await ev(`spawnEnemy(0, 'drone')`); await p.keyboard.press('Space');
  ok(await ev('enemies.length') === 1, 'second zap in same level does nothing');
  ok((await ev(`document.getElementById('hudzap').textContent`)) === 'BOMB x0', 'HUD shows used');
  // warp after the level boss
  await ev('briefingTimer = 0; enemies = []; killCount = 20; nextMinibossIndex = 2'); await p.waitForTimeout(250);
  ok(await ev('bossActive && boss.kind === "level"'), 'level boss arms');
  for (let i = 0; i < 60 && await ev('!!boss'); i++) { await ev('hull = hullMax; if (boss) { boss.z = 0.5; bolts.push({angle: boss.angle, z: 0.5}); }'); await p.waitForTimeout(50); }
  ok(await ev('warpTimer > 0 && currentLevel === 2'), 'beating boss starts the warp into level 2');
  await p.waitForFunction('spikes.length > 0', null, { timeout: 8000 }).catch(() => {});
  ok(await ev('spikes.length > 0 && enemies.length === 0'), 'spikes during warp, no enemies (' + await ev('spikes.length') + ' spikes)');
  ok(await ev('warpBoost() > 3'), 'tunnel is racing (boost ' + (await ev('warpBoost()')).toFixed(1) + ')');
  await p.screenshot({ path: process.argv[2] + '/warp.png' });
  // spike in aim lane hurts, off-lane doesn't
  await ev('hull = hullMax; plasma = 0; plasmaHitAt = t; spikes = [{angle: shipLane, z: 0.05}, {angle: shipLane + 2, z: 0.05}]'); await p.waitForTimeout(150);
  ok(await ev('hull === hullMax - SPIKE_DAMAGE'), 'only the spike in the aim lane did damage');
  await ev('warpTimer = 0.05; hull = hullMax'); await p.waitForTimeout(200);
  ok(await ev('warpTimer === 0 && zapperCharges === 1 && spikes.length === 0'), 'warp ends, zapper refilled for level 2');
  // gunner perk + interceptor hold-to-fire
  await ev('damageShip(9999)'); await p.waitForTimeout(100);
  ok(!(await vis(p, 'zapBtn')), 'ZAP button hidden on game over');
  await ev(`shipClassIndex = 3; startGame(false, 'campaign')`);
  ok(await ev('tripleLaserTimer >= 8 && hullMax === 130'), 'gunner starts with triple laser');
  await ev(`shipClassIndex = 1; startGame(false, 'campaign'); bolts = []`);
  await p.mouse.move(500, 200); await p.mouse.down();
  await p.waitForFunction('bolts.length >= 3', null, { timeout: 5000 }).catch(() => {});
  const held = await ev('bolts.length'); await p.mouse.up();
  await p.waitForTimeout(400);
  await p.waitForFunction('pulses.every(q => t - q.startTime >= 0.2)', null, { timeout: 3000 }).catch(() => {});
  const after = await ev('pulses.filter(q => t - q.startTime < 0.2).length');
  ok(held >= 3 && after === 0, 'interceptor auto-fires while held (' + held + '), stops on release');
  // right-click zaps
  await ev(`spawnEnemy(0, 'drone')`); await p.mouse.click(500, 200, { button: 'right' });
  ok(await ev('zapperCharges === 0 && enemies.length === 0'), 'right-click zaps');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
async function vis(p, id) { return p.evaluate(`getComputedStyle(document.getElementById('${id}')).display !== 'none'`); }
