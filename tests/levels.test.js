const { chromium } = require('playwright');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 640 } });
  await p.addInitScript(() => { localStorage.setItem('vortex-tutorial', '1'); localStorage.setItem('vortex-flash-warned', '1'); }); // skip the first-run tutorial
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (x) => p.evaluate(x);
  await p.goto('http://127.0.0.1:8765/index.html'); await p.waitForTimeout(300);
  await ev('localStorage.clear()');
  await ev('startGame(false)'); await p.waitForTimeout(200);
  await ev(`briefingTimer = 0; document.getElementById('briefing').style.display = 'none'; hull = 9999; hullMax = 9999`);
  ok(await ev('env') === 'tube', 'level 1 is the tunnel');
  await ev('nextMinibossIndex = 9; killCount = Math.ceil(currentKillTarget() * 0.6); coresGot = 99; missionTime = 999'); await p.waitForTimeout(800);
  ok(await ev('env') === 'tube', 'still the tunnel past halfway (no mid-level switch)');
  ok(await ev('midSaved') && JSON.parse(await ev('store.getItem("vortex-checkpoint")') || '{}').mid === true, 'midway checkpoint stored at 50%');
  // levels 2-5 via the real boss-kill path
  for (const want of ['asteroid', 'space', 'trench', 'surface']) {
    if (want === 'surface') {
      await ev('nextMinibossIndex = 9; killCount = Math.ceil(currentKillTarget() * 0.9); coresGot = 99; missionTime = 999; missionType = "kill"'); await p.waitForTimeout(500);
      ok(await ev('ventSpawned && !bossActive') && await ev(`trackItems.some(i => i.kind === 'vent')`), 'trench level sends its vent before the boss');
    }
    await ev('killCount = 999; coresGot = 999; missionTime = 9999'); await p.waitForTimeout(600);
    await ev('if (boss) { boss.hp = 0; }'); 
    await ev('if (boss) { const b0 = boss; b0.hp = 1; }');
    // kill it through the normal hit path: easier, set hp tiny and fire a lot
    for (let i = 0; i < 80 && await ev('!!boss'); i++) { await ev('if (boss) { boss.hp = 0.0001; aimAngle = boss.angle; fire && fire(); }'); await p.waitForTimeout(100); }
    await p.waitForFunction('warpTimer <= 0 && state === "playing"', null, { timeout: 30000 }); await p.waitForTimeout(300);
    await ev(`briefingTimer = 0; document.getElementById('briefing').style.display = 'none'`);
    console.log('  level', await ev('currentLevel'), 'env', await ev('env'), 'boss', await ev('!!boss'));
    ok(await ev('env') === want, 'level ' + await ev('currentLevel') + ' is ' + want);
  }
  // rift: env per boss gate
  await ev(`gameMode = 'rift'; riftDepth = 1`);
  const r = await ev(`[1,2,3,4,6,7].map(d => { riftDepth = d; return routeEnv(); })`);
  ok(JSON.stringify(r) === JSON.stringify(['tube','tube','tube','trench','trench','asteroid']), 'rift changes map only at boss gates ' + r);
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
