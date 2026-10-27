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
  ok(await ev('checkpoint') === null, 'no checkpoint on a fresh start');
  await ev('startGame(false)'); await wait(200);
  // jump to level 2 the normal way: level-1 boss down -> warp -> level 2
  await ev('briefingTimer = 0; score = 1234; currentLevel = 2; startLevelMission(); onLevelStart()'); await wait(100);
  ok(await ev('checkpoint && checkpoint.level === 2 && !checkpoint.mid && checkpoint.score === 1234'), 'level 2 start saves a checkpoint');
  await ev('briefingTimer = 0; hull = 99999; coresGot = 4; score = 2000'); await wait(2500);
  console.log('  env', await ev('env'), 'checkpoint', JSON.stringify(await ev('checkpoint')));
  ok(await ev('checkpoint.mid === true && checkpoint.coresGot >= 3'), 'the route change midway saves a midway checkpoint');
  await ev('hull = 1; plasma = 0; damageShip(99999)'); await wait(300);
  ok(await ev(`getComputedStyle(document.getElementById('contFromLost')).display`) === 'block', 'SIGNAL LOST offers CONTINUE');
  console.log('  ', await ev(`document.getElementById('contFromLost').textContent`));
  await p.click('#contFromLost'); await wait(300);
  ok(await ev('state === "playing" && currentLevel === 2 && score === 2000 && coresGot >= 3'), 'CONTINUE resumes level 2 midway with the checkpoint score');
  // persists across reloads, shown in the menu
  await p.reload(); await wait(300);
  await ev('showScreen("menu")'); await wait(100);
  ok(await ev(`getComputedStyle(document.getElementById('continueBtn')).display`) === 'block', 'menu shows CONTINUE after a reload');
  console.log('  ', await ev(`document.getElementById('continueBtn').textContent`));
  await p.click('#continueBtn'); await wait(200);
  ok(await ev('currentLevel') === 2, 'menu CONTINUE resumes too');
  // daily runs don't checkpoint
  await ev('clearCheckpoint(); startGame(false, "daily"); currentLevel = 3; onLevelStart()');
  ok(await ev('checkpoint') === null, 'daily runs do not save checkpoints');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
