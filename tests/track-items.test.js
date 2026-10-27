const { chromium } = require('playwright');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 720 } });
  await p.addInitScript(() => { localStorage.setItem('vortex-tutorial', '1'); localStorage.setItem('vortex-flash-warned', '1'); }); // skip the first-run tutorial
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (x) => p.evaluate(x);
  const wait = (ms) => p.waitForTimeout(ms);
  await p.goto('http://127.0.0.1:8765/index.html'); await ev('localStorage.clear()'); await p.reload(); await wait(300);
  await ((await p.evaluate("state === 'title'")) ? p.evaluate('startGame(false)') : p.mouse.click(500, 700)); await wait(200);
  await p.mouse.move(500, 715); await wait(500);
  await ev('briefingTimer = 0; spawnTimer = 999; formationTimer = 999; clusterTimer = 999; enemies = []; trackTimer = 999');
  const put = (kind, off) => ev(`trackItems.push({ kind: '${kind}', angle: normalizeAngle(shipLane + ${off}), z: 0.02 })`);
  await put('boost', 0); await wait(150);
  ok(await ev('boostTimer > 2'), 'driving over an arrow pad boosts');
  await put('brake', 0); await wait(150);
  ok(await ev('brakeTimer > 2 && boostTimer === 0'), 'a zebra pad slows everything');
  await put('boost', 1.5); await wait(150);
  ok(await ev('brakeTimer > 0 && boostTimer === 0'), 'a pad outside your lane does nothing');
  await put('hoop', 0); await p.waitForFunction(() => tripTimer > 2 && canvas.style.filter.includes('hue-rotate'), null, { timeout: 4000 }).catch(() => {});
  ok(await ev('tripTimer > 2') && (await ev('canvas.style.filter')).includes('hue-rotate'), 'a hoop starts the psychedelic trip');
  ok(await ev('tripleLaserTimer > 0 || echoTimer > 0 || plasma > plasmaMax || discCharges > 0'), 'a hoop grants an ability');
  // zebra: score x2 while it runs
  await put('zebra', 0); await p.waitForFunction('x2Timer > 0', null, { timeout: 3000 }).catch(() => {});
  ok(await ev('x2Timer > 5'), 'the zebra pad starts SCORE x2');
  await ev(`score = 0; enemies = []; spawnEnemy(aimAngle, 'drone'); enemies[0].z = 0.3; enemies[0].speed = 0; bolts.push({ angle: enemies[0].angle, z: 0.3 })`);
  await p.waitForFunction('score > 0', null, { timeout: 3000 }).catch(() => {});
  ok(await ev('score') === Math.round(20 * await ev('missionMult()')), 'kills score double under x2 (' + await ev('score') + ')');
  // a pad path triggers once, however many segments you cross
  await ev(`x2Timer = 0; boostTimer = 0; brakeTimer = 0; missionState.active = []; const row = ++padRowId; for (let k = 0; k < PAD_SEGMENTS; k++) trackItems.push({ kind: 'boost', angle: shipLane, z: 0.02 + k * 0.05, row, seg: k })`);
  let boosts = 0, last = 0;
  for (let i = 0; i < 30; i++) { const b = await ev('boostTimer'); if (b > last + 0.5) boosts++; last = b; await p.waitForTimeout(40); }
  ok(boosts === 1, 'a pad path of ' + await ev('PAD_SEGMENTS') + ' segments triggers once (' + boosts + ')');
  const lane0 = await ev('shipLane');
  await p.mouse.move(800, 715); await wait(500);
  const laneBefore = await ev('shipLane');
  await put('portal', 0); await wait(120);
  const laneAfter = await ev('shipLane');
  console.log('  lane before', laneBefore.toFixed(2), 'after', laneAfter.toFixed(2));
  ok(Math.abs(laneAfter + laneBefore) < 0.35, 'a portal teleports the ship to the mirror side');
  // spawned items look right
  await ev('trackTimer = 0'); for (let i = 0; i < 4; i++) { await ev('spawnTrackItem()'); }
  await ev(`for (const [k, it] of trackItems.entries()) { it.z = 0.25 + k * 0.12; it.kind = ['boost','brake','hoop','portal'][k % 4]; }`);
  await wait(100);
  await p.screenshot({ path: process.argv[2] + '/pads.png' });
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
