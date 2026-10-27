const { chromium } = require('playwright');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  await p.addInitScript(() => { localStorage.setItem('vortex-tutorial', '1'); localStorage.setItem('vortex-flash-warned', '1'); }); // skip the first-run tutorial
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (x) => p.evaluate(x);
  await p.goto('http://127.0.0.1:8765/index.html'); await p.waitForTimeout(300);
  await ((await p.evaluate("state === 'title'")) ? p.evaluate('startGame(false)') : p.mouse.click(500, 600)); await p.waitForTimeout(100);
  ok(await ev('HULL_MAX === 150 && hull === 150'), 'hull 150');
  // shield pickup overcharges plasma: a second full layer, then hull
  await ev('plasma = plasmaMax');
  const pm = await ev('plasmaMax');
  await ev(`collectPowerup({angle: 0, z: 0.02, alive: true, kind: 'shield'})`);
  ok(await ev('plasma') === pm * 2 && await ev(`document.getElementById('plasmafill').classList.contains('over')`), 'shield pickup overcharges plasma to 2x (' + await ev('plasma') + ')');
  await ev(`damageShip(${pm} + 10)`);
  ok(await ev('hull === 150') && await ev('plasma') === pm - 10, 'overcharge soaks hits before the hull');
  await ev('plasma = 0; damageShip(16)');
  ok(await ev('hull === 134'), 'with plasma gone, hits reach the hull');
  // bomb pickup: one more bomb, capped
  await ev('zapperCharges = 1');
  await ev(`collectPowerup({angle: 0, z: 0.02, alive: true, kind: 'bomb'})`);
  ok(await ev('zapperCharges') === 2 && (await ev(`document.getElementById('hudzap').textContent`)).startsWith('BOMB x2'), 'bomb pickup adds a bomb');
  for (let i = 0; i < 8; i++) await ev(`collectPowerup({angle: 0, z: 0.02, alive: true, kind: 'bomb'})`);
  ok(await ev('zapperCharges === BOMB_MAX'), 'bombs cap at BOMB_MAX');
  // a bomb still clears the screen and scores the kills
  await ev(`enemies = []; for (let i=0;i<5;i++) spawnEnemy(i, 'drone'); enemyBolts.push({angle:0,z:0.5}); killCount = 0; score = 0;`);
  await ev('superzap()');
  ok(await ev('enemies.length === 0 && enemyBolts.length === 0 && killCount === 5 && score === 50'), 'bomb clears enemies + bolts and scores them');
  // ship rides its arc toward the aim
  await p.mouse.move(950, 600); await p.waitForFunction('shipScreenPos(shipLane).x > 600', null, { timeout: 4000 }).catch(() => {});
  const x1 = await ev('shipScreenPos(shipLane).x');
  await p.mouse.move(50, 600); await p.waitForFunction('shipScreenPos(shipLane).x < 400', null, { timeout: 4000 }).catch(() => {});
  const x2 = await ev('shipScreenPos(shipLane).x');
  ok(x1 > 600 && x2 < 400, 'ship slides right/left with aim: ' + x1.toFixed(0) + ' / ' + x2.toFixed(0));
  // lock-on finds an enemy in line
  await ev(`enemies = []; spawnEnemy(0.55, 'drone'); enemies[0].z = 0.5; aimAngle = seenAngle(enemies[0]) + 0.05;`);
  ok(await ev('findAimTarget() === enemies[0]'), 'bullseye locks onto the enemy where it is drawn');
  await ev('bolts = []; fire()');
  ok(await ev('bolts[0].angle === enemies[0].angle'), 'and the shot goes down that enemy\'s lane');
  await ev('aimAngle = -2');
  ok(await ev('findAimTarget() === null'), 'no lock when nothing in line');
  // spawn distribution
  const kinds = await ev(`(() => { powerups = []; const c = {}; for (let i=0;i<4000;i++) spawnPowerup(); for (const q of powerups) c[q.kind]=(c[q.kind]||0)+1; powerups = []; return c; })()`);
  const KINDS = ['hull', 'shield', 'star', 'bomb', 'echo', 'disc'];
  ok(KINDS.every(k => kinds[k] > 0) && Object.keys(kinds).length === KINDS.length, 'every pickup kind spawns: ' + JSON.stringify(kinds));
  // screenshot with overcharge + lock + every pickup
  await ev(`enemies = []; aimAngle = 0.3; spawnEnemy(0.3, 'drone'); enemies[0].z = 0.4; enemies[0].speed = 0; collectPowerup({angle: 0, z: 0.02, alive: true, kind: 'shield'}); for (const k of ['shield','bomb','echo','disc','star','hull']) powerups.push({angle: Math.random()*6, z: 0.3 + Math.random()*0.5, alive: true, kind: k});`);
  await p.mouse.move(620, 200); await p.waitForTimeout(400);
  await p.screenshot({ path: process.argv[2] + '/powerups.png' });
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
