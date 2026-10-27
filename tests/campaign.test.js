const { chromium } = require('playwright');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  await p.addInitScript(() => localStorage.setItem('vortex-tutorial', '1')); // skip the first-run tutorial
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (x) => p.evaluate(x);
  const wait = (ms) => p.waitForTimeout(ms);
  await p.goto('http://127.0.0.1:8765/index.html'); await ev('localStorage.clear()'); await p.reload(); await wait(300);
  await ((await p.evaluate("state === 'title'")) ? p.evaluate('startGame(false)') : p.mouse.click(500, 680)); await wait(300);
  ok(await ev('missionType') === 'destroy' && await ev('briefingTimer > 0'), 'level 1 = destroy, briefing showing');
  ok((await ev(`document.getElementById('briefingtitle').textContent`)) === 'MISSION: DESTROY', 'briefing title');
  ok(await ev('activeMusic') === 'destruction', 'campaign music = destruction');
  await ev('enemies = []; spawnTimer = 0'); await wait(300);
  ok(await ev('enemies.length') === 0, 'no spawns during the briefing');
  await ev('briefingTimer = 0.01'); await wait(300);
  ok(await ev(`document.getElementById('briefing').style.opacity`) === '0', 'briefing hides');
  // boss music
  await ev('hull = hullMax; killCount = 20; nextMinibossIndex = 2'); await wait(300);
  ok(await ev('bossActive && activeMusic === "boss"'), 'level boss switches to boss music (Cuerpo Ácido)');
  for (let i = 0; i < 60 && await ev('!!boss'); i++) { await ev('hull = hullMax; if (boss) { boss.z = 0.5; bolts.push({angle: boss.angle, z: 0.5}); }'); await wait(50); }
  ok(await ev('activeMusic') === 'destruction', 'music returns after the boss');
  await ev('warpTimer = 0.01'); await wait(300);
  ok(await ev('currentLevel === 2 && missionType === "recover"'), 'level 2 = recover');
  ok((await ev(`document.getElementById('objlabel').textContent`)) === 'CORES', 'HUD says CORES');
  await ev('briefingTimer = 0.01; coreTimer = 0'); await wait(400);
  ok(await ev('cores.length') >= 1, 'a data core spawns');
  await ev('hull = hullMax; cores[0].z = 0.4; bolts.push({angle: cores[0].angle, z: 0.4})'); await wait(200);
  ok(await ev('coresGot') === 1, 'shooting a core recovers it');
  await ev('enemies = []; coresGot = 6; updateObjectiveUI()'); await wait(300);
  ok(await ev('bossActive'), '6 cores arms the boss');
  // jump to level 3 directly: survive
  await ev(`boss = null; bossActive = false; currentLevel = 3; startLevelMission(); briefingTimer = 0`);
  ok(await ev('missionType') === 'survive', 'level 3 = survive');
  const t0 = await ev('missionTime'); await ev('hull = hullMax'); await wait(1500); await ev('hull = hullMax');
  ok(await ev('missionTime') > t0 + 0.3, 'survive clock runs (' + (await ev('missionTime')).toFixed(1) + 's)');
  await ev('missionTime = 45; enemies = []; nextMinibossIndex = 2'); await wait(300);
  ok(await ev('bossActive && boss.kind === "level"'), 'surviving 45s arms the level boss');
  await ev(`boss = null; bossActive = false; currentLevel = LEVEL_COUNT; startLevelMission(); briefingTimer = 0; nextMinibossIndex = 2; killCount = 999; coresGot = 999; missionTime = 999; enemies = []`); await wait(300);
  ok(await ev('bossActive && boss.kind === "final"'), 'the last level ends in the final boss');
  // rift music + no briefing
  await ev(`startGame(false, 'rift')`); await wait(200);
  ok(await ev('activeMusic === "rift" && briefingTimer === 0 && missionType === "destroy"'), 'rift: Noche Random, no briefing, destroy');
  // radar drawn (pixel check top-right)
  const px = await ev(`(() => { const d = ctx.getImageData(W - 80, 80, 1, 1).data; return d[0] + d[1] + d[2]; })()`);
  ok(px > 0, 'radar area is drawn');
  // spanish
  await ev('damageShip(9999)'); await wait(200);
  await p.goto('http://127.0.0.1:8765/index.html'); await wait(300);
  await p.evaluate(sel => document.querySelector(sel).click(), '#langToggle');
  ok(await ev('lang') === 'es' && await ev(`localStorage.getItem('vortex-lang')`) === 'es', 'COMMS toggle switches to ES and saves');
  await ((await p.evaluate("state === 'title'")) ? p.evaluate('startGame(false)') : p.mouse.click(500, 680)); await wait(1500);
  const line = await ev(`document.getElementById('commstext').textContent`);
  const brief = await ev(`document.getElementById('briefingtitle').textContent + ' | ' + document.getElementById('briefingtext').textContent`);
  console.log('  ES comms:', line, '\n  ES briefing:', brief);
  // the opening line is random: it must be a Spanish line, not an English one
  const enLines = await ev('JSON.stringify(Object.keys(COMMS_ES))');
  ok(line.trim().length > 8 && !enLines.includes(JSON.stringify(line.trim())) && brief.includes('MISION'), 'Spanish commander + briefing');
  await p.screenshot({ path: process.argv[2] + '/es.png' });
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
