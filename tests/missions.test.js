const { chromium, devices } = require('playwright');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (x) => p.evaluate(x);
  await p.goto('http://127.0.0.1:8765/index.html'); await ev('localStorage.clear()'); await p.reload(); await p.waitForTimeout(300);
  ok(await ev('missionState.active.length') === 3, 'three missions dealt');
  // force a known set
  await ev(`missionState = { set: 0, active: [{ id: 'dodge', n: 3, p: 0 }, { id: 'coin', n: 2, p: 0 }, { id: 'level', n: 2, p: 0 }] }; saveMissions();`);
  await ev('startGame(false)'); await p.waitForTimeout(300);
  ok(await ev('streak.days') === 1 && await ev('coins') === 20, 'first run of the day starts a streak (+20 coins)');
  await ev('briefingTimer = 0; spawnTimer = 999; trackTimer = 999; enemies = []');
  await ev(`for (let i = 0; i < 3; i++) { spawnEnemy(normalizeAngle(shipLane + 2), 'drone'); enemies.at(-1).z = 0.02; }`); await p.waitForTimeout(200);
  ok(await ev('missionState.active[0].p') === 3, 'dodging 3 enemies completes the dodge mission');
  ok((await ev(`document.getElementById('toast').textContent`)).includes('MISSION COMPLETE'), 'toast announces it');
  await ev(`for (let k = 0; k < 2; k++) trackItems.push({ kind: 'coin', angle: shipLane, z: 0.05 + k * 0.03 })`); await p.waitForTimeout(500);
  ok(await ev('missionState.active[1].p') === 2, 'coins count toward the coin mission');
  await ev('missionEvent("level", 2)'); await p.waitForTimeout(100);
  ok(await ev('missionState.set') === 1 && await ev('missionMult()') === 1.1 && await ev('missionState.active.every(m => m.p === 0)'), 'all three done: next set dealt, multiplier x1.1');
  const s0 = await ev('score');
  await ev(`enemies = []; spawnEnemy(aimAngle, 'drone'); enemies[0].z = 0.3; enemies[0].speed = 0; bolts.push({ angle: aimAngle, z: 0.3 })`); await p.waitForTimeout(150);
  ok((await ev('score')) - s0 === 11, 'kills score x1.1 (got ' + ((await ev('score')) - s0) + ')');
  // streak continuation
  await ev(`streak = { days: 4, last: (() => { const y = new Date(); y.setDate(y.getDate() - 1); return y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0'); })() }; coins = 0; checkStreak();`);
  ok(await ev('streak.days') === 5 && await ev('coins') === 100, 'a streak from yesterday continues (day 5: +100)');
  await ev(`streak = { days: 9, last: '2000-01-01' }; checkStreak();`);
  ok(await ev('streak.days') === 1, 'a missed day restarts the streak');
  console.log('errors', JSON.stringify(errs));
  const q = await (await b.newContext({ ...devices['iPhone 13'] })).newPage();
  await q.goto('http://127.0.0.1:8765/index.html');
  await q.evaluate(`missionState = { set: 2, active: [{ id: 'dodge', n: 45, p: 45 }, { id: 'rock', n: 15, p: 6 }, { id: 'portal', n: 6, p: 1 }] }; streak = { days: 3, last: todayKey() }; showScreen('missions')`);
  await q.waitForTimeout(400);
  await q.screenshot({ path: process.argv[2] + '/missions.png' });
  await b.close();
})();
