const { chromium } = require('playwright');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  await p.addInitScript(() => { localStorage.setItem('vortex-tutorial', '1'); localStorage.setItem('vortex-flash-warned', '1'); }); // skip the first-run tutorial
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (x) => p.evaluate(x);
  await p.goto('http://127.0.0.1:8765/index.html'); await p.waitForTimeout(300);
  const run = (lvl) => ev(`(() => {
    startGame(false); currentLevel = ${lvl}; onLevelStart(); briefingTimer = 0; spawnTimer = 99; enemies = []; trackTimer = 99;
    let most = 0, tracers = 0;
    for (let i = 0; i < 60 * 12; i++) { hull = hullMax; plasma = plasmaMax; simulate(1 / 60); most = Math.max(most, turrets.length); tracers += enemyBolts.some(e => e.tracer) ? 1 : 0; }
    return { env, most, kind: turrets[0] && turrets[0].kind, fired: tracers > 0 };
  })()`);
  const trench = await run(4);
  ok(trench.env === 'trench' && trench.most > 0 && trench.kind === 'wall', 'the trench has wall turrets (' + JSON.stringify(trench) + ')');
  ok(trench.fired, 'trench turrets fire tracers');
  const planet = await run(5);
  ok(planet.env === 'surface' && planet.most > 0 && planet.kind === 'ground' && planet.fired, 'the planet has ground turrets that fire');
  const tube = await run(1);
  ok(tube.most === 0, 'none in the plain tunnel');
  // tracers bend toward where the ship was
  await ev(`enemyBolts = [{ angle: Math.PI / 2, z: 0.6, targetAngle: Math.PI, tracer: true }]; for (let i = 0; i < 30; i++) simulate(1 / 60)`);
  ok(await ev('enemyBolts.length ? Math.abs(normalizeAngle(enemyBolts[0].angle - Math.PI)) < 1.2 : true'), 'tracers swing toward the ship lane');
  // two hits destroy one
  await ev(`turrets = [{ angle: 2.5, z: 0.5, hp: 2, fireTimer: 99, flash: 0, kind: 'ground' }]; killCount = 0; bolts.push({ angle: 2.5, z: 0.5 }); simulate(1 / 60); bolts.push({ angle: 2.5, z: 0.5 }); simulate(1 / 60)`);
  ok(await ev('turrets.length === 0 && killCount === 1'), 'two hits destroy a turret');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
