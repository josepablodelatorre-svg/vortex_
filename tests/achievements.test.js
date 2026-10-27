const { chromium } = require('playwright');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctxB = await b.newContext({ viewport: { width: 1000, height: 760 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctxB.newPage();
  await p.addInitScript(() => localStorage.setItem('vortex-tutorial', '1')); // skip the first-run tutorial
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (x) => p.evaluate(x);
  const wait = (ms) => p.waitForTimeout(ms);
  await p.goto('http://127.0.0.1:8765/index.html'); await ev('localStorage.clear()'); await p.reload(); await wait(300);
  ok(await ev(`document.querySelectorAll('#shipcolor button.locked').length`) === 4, '4 ship colours start locked');
  ok((await ev(`document.getElementById('achievetag').textContent`)) === 'ACHIEVEMENTS 0/8', 'achievement counter');
  await p.evaluate(sel => document.querySelector(sel).click(), '#shipcolor button[data-palette="4"]');
  ok(await ev('shipPaletteIndex') === 0 && (await ev(`document.getElementById('shipclassdesc').textContent`)).includes('LOCKED'), 'locked colour cannot be picked, shows how to unlock');
  // untouchable: beat a boss without damage
  await ((await p.evaluate("state === 'title'")) ? p.evaluate('startGame(false)') : p.mouse.click(500, 740)); await wait(200);
  await ev('briefingTimer = 0; enemies = []; killCount = 20; nextMinibossIndex = 2'); await wait(300);
  for (let i = 0; i < 60 && await ev('!!boss'); i++) { await ev('if (boss) { boss.z = 0.5; boss.fireTimer = 9; bolts.push({angle: boss.angle, z: 0.5}); } enemyBolts = []'); await wait(50); }
  ok(await ev('achieved.untouchable === true'), 'beating a boss untouched unlocks UNTOUCHABLE');
  ok((await ev(`document.getElementById('toast').textContent + toastQueue.join(' ')`)).includes('ICE'), 'toast announces the new colour');
  // rank on death
  await ev('runShots = 40; runHits = 36; damageShip(99999)'); await wait(300);
  const rank = await ev(`document.getElementById('rankLost').textContent`);
  console.log('  rank:', rank);
  ok(/^[SABCD]ACCURACY/.test(rank), 'rank shown on SIGNAL LOST');
  // save clip
  await wait(1500);
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }).catch(() => null), p.click('#gameover .clipBtn')]);
  if (dl) { const path = await dl.path(); const fs = require('fs'); console.log('  clip bytes:', fs.statSync(path).size, dl.suggestedFilename()); ok(fs.statSync(path).size > 10000, 'SAVE CLIP downloads a video'); }
  else ok(false, 'SAVE CLIP downloads a video');
  // daily determinism: two daily runs spawn the same first enemies
  const runDaily = async () => {
    await p.goto('http://127.0.0.1:8765/index.html'); await wait(300);
    await ev(`window.__spawned = []; const orig = spawnEnemy; spawnEnemy = function (a, ty) { orig(a, ty); const e = enemies.at(-1); __spawned.push(e.type + ':' + e.angle.toFixed(3)); };`);
    await p.evaluate(sel => document.querySelector(sel).click(), '#dailyBtn');
    for (let i = 0; i < 250 && await ev('__spawned.length') < 5; i++) { await ev('hull = hullMax'); await wait(100); }
    return ev(`__spawned.slice(0, 5).join(' ')`);
  };
  const d1 = await runDaily(), d2 = await runDaily();
  if (d1 !== d2) console.log('  d1', d1, '\n  d2', d2);
  ok(d1 === d2 && await ev('daily'), 'daily tunnel is the same every time today');
  ok((await ev(`document.getElementById('hudrun').textContent`)).startsWith('DAILY'), 'HUD shows DAILY');
  await ev('score = 1234; damageShip(99999)'); await wait(300);
  ok(await ev('dailyBest()') === 1234, 'daily best saved');
  await p.click('#gameover .shareBtn'); await wait(300);
  console.log('  share:', await ev('navigator.clipboard.readText()').catch(() => '(clipboard unavailable)'));
  await p.screenshot({ path: process.argv[2] + '/results.png' });
  await ((await p.evaluate("state === 'title'")) ? p.evaluate('startGame(false)') : p.mouse.click(500, 700)); await wait(150);
  ok(await ev('daily && state === "playing"'), 'retry stays on the daily tunnel');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
