const { chromium } = require('playwright');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  await p.addInitScript(() => localStorage.setItem('vortex-flash-warned', '1'));
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (x) => p.evaluate(x);
  const until = (expr, ms = 8000) => p.waitForFunction(expr, null, { timeout: ms }).then(() => true).catch(() => false);
  const step = () => ev('tutorial ? TUTORIAL_STEPS[tutorial.step].id : null');
  await p.goto('http://127.0.0.1:8765/index.html'); await ev('localStorage.clear()'); await p.reload(); await p.waitForTimeout(300);
  await ev('startGame(false)'); await p.waitForTimeout(300);
  ok(await step() === 'aim' && await p.isVisible('#coach') && await ev('calmPhase()'), 'first campaign run opens the tutorial (no regular spawns)');
  ok(await ev(`document.getElementById('briefing').style.opacity`) === '0', 'mission briefing waits');
  await p.screenshot({ path: process.argv[2] + '/tutorial.png' });
  // aim
  await p.mouse.move(150, 600); 
  ok(await until(`tutorial && TUTORIAL_STEPS[tutorial.step].id === 'fire'`), 'moving the aim completes step 1');
  for (let i = 0; i < 3; i++) { await p.mouse.click(500, 300); await p.waitForTimeout(80); }
  ok(await until(`tutorial && TUTORIAL_STEPS[tutorial.step].id === 'kill'`), 'three shots complete step 2');
  ok(await ev('enemies.length') === 3, 'three training hostiles appear');
  await ev('enemies.forEach(e => { e.alive = false; }); enemies = []');
  ok(await until(`tutorial && TUTORIAL_STEPS[tutorial.step].id === 'dodge'`), 'clearing them completes step 3');
  ok(await ev('enemies.length') === 1, 'one hostile comes down the ship lane');
  await ev('enemies[0].z = 0.02; enemies[0].angle = normalizeAngle(shipLane + 1.2)');
  ok(await until(`tutorial && TUTORIAL_STEPS[tutorial.step].id === 'pickup'`), 'letting it pass outside the lane completes step 4');
  await ev('collectPowerup(powerups[0]); powerups = []');
  ok(await until(`tutorial && TUTORIAL_STEPS[tutorial.step].id === 'coins'`), 'collecting the pickup completes step 5');
  ok(await ev(`trackItems.filter(i => i.kind === 'coin').length`) === 5, 'a row of five coins comes down a lane');
  await ev(`aimAngle = tutorial.coinAngle`);
  ok(await until(`tutorial && TUTORIAL_STEPS[tutorial.step].id === 'bomb'`, 15000), 'steering into the coin lane and collecting completes step 6');
  ok(await ev('runCoins') >= 3, 'coins were collected (' + await ev('runCoins') + ')');
  ok(await ev('zapperCharges >= 1 && enemies.length === 6'), 'six hostiles and a bomb ready');
  await p.keyboard.press('Space');
  ok(await until(`tutorial && TUTORIAL_STEPS[tutorial.step].id === 'lockin'`), 'bombing completes step 7');
  ok(await ev('power') === 100, 'power bar is filled for the lock-in lesson');
  await p.keyboard.press('KeyL');
  ok(await until('!tutorial'), 'lock-in finishes the tutorial');
  ok(await ev(`killCount === 0 && score === 0 && zapperCharges >= 1 && hull === hullMax && missionType === 'destroy' && briefingTimer > 0`), 'level 1 then starts clean with its briefing');
  ok(await ev(`store.getItem('vortex-tutorial')`) === '1' && !(await p.isVisible('#coach')), 'tutorial is remembered and hidden');
  // second run: no tutorial
  await ev('damageShip(99999); plasma = 0; damageShip(99999)'); await p.waitForTimeout(200);
  await ev('startGame(false)'); await p.waitForTimeout(200);
  ok(await ev('tutorial') === null, 'it runs only once');
  // replay from settings, then skip
  await ev(`backToMenu(); showScreen('settings')`); await p.waitForTimeout(150);
  await p.click('#tutorialBtn'); await p.waitForTimeout(200);
  ok(await step() === 'aim', 'PLAY TUTORIAL in settings replays it');
  await p.click('#coachskip'); await p.waitForTimeout(100);
  ok(await ev('tutorial') === null && await ev('briefingTimer > 0') && await ev(`state`) === 'playing', 'SKIP drops straight into level 1');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
