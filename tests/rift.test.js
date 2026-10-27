const { chromium } = require('playwright');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  await p.addInitScript(() => localStorage.setItem('vortex-tutorial', '1')); // skip the first-run tutorial
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const ev = (x) => p.evaluate(x);
  const vis = (id) => ev(`getComputedStyle(document.getElementById('${id}')).display !== 'none'`);
  await p.goto('http://127.0.0.1:8765/index.html');
  await ev('localStorage.clear()'); await p.reload(); await p.waitForTimeout(300);
  ok(!(await vis('riftStart')), 'rift button hidden on title before unlocking');

  // beat the campaign -> cleared screen offers the rift
  await ((await p.evaluate("state === 'title'")) ? p.evaluate('startGame(false)') : p.mouse.click(500, 600)); await p.waitForTimeout(100);
  ok(await ev('state') === 'playing' && await ev('gameMode') === 'campaign', 'title click starts campaign');
  await ev('winGame()');
  ok(await ev('riftUnlocked') && await ev(`localStorage.getItem('vortex-rift-unlocked')`) === '1', 'winning unlocks + saves rift');
  ok(await vis('riftFromCleared'), 'cleared screen shows rift button');
  await p.click('#riftFromCleared'); await p.waitForTimeout(100);
  ok(await ev('state === "playing" && gameMode === "rift" && riftDepth === 1 && runTier === 0'), 'cleared rift button enters rift at depth 1, no NGP bump');
  ok(await ev(`document.getElementById('levellabel').textContent`) === 'DEPTH', 'HUD label says DEPTH');
  ok(await ev(`document.getElementById('killTarget').textContent`) === '12', 'kill target 12');
  ok((await ev(`document.getElementById('hudrun').textContent`)).includes('RIFT'), 'HUD shows THE RIFT');

  // sector advance without boss
  const shapes = [await ev('tunnelSidesTarget')];
  await ev('hull = HULL_MAX; killCount = 12'); await p.waitForTimeout(150);
  ok(await ev('riftDepth') === 2 && await ev('killCount') === 0 && !(await ev('bossActive')), 'depth 1 -> 2 on 12 kills, no boss');
  shapes.push(await ev('tunnelSidesTarget'));
  ok(shapes[0] !== shapes[1], 'tunnel shape changed: ' + shapes.join('->'));
  ok((await ev(`document.getElementById('hudrun').textContent`)).includes('x1.5'), 'multiplier x1.5 at depth 2');
  const s0 = await ev('score');
  await ev('enemies = []; spawnEnemy(aimAngle, "drone"); enemies[0].z = 0.3; bolts.push({angle: aimAngle, z: 0.3})');
  await p.waitForTimeout(150);
  const gained = (await ev('score')) - s0;
  ok(gained === 15, 'drone kill worth 15 at x1.5 (got ' + gained + ')');
  await ev('hull = HULL_MAX; killCount = 12'); await p.waitForTimeout(150);
  ok(await ev('riftDepth') === 3, 'depth 3');
  ok(await ev('riftMix.pentagram > 0 && riftMix.shooter > 0'), 'depth 3 mix includes shooters + pentagrams');

  // boss gate at depth 3
  await ev('hull = HULL_MAX; killCount = 12'); await p.waitForTimeout(150);
  ok(await ev('bossActive && boss.kind === "level" && riftDepth === 3'), 'depth 3 ends in a boss, hp ' + await ev('boss && boss.hpMax'));
  for (let i = 0; i < 40 && await ev('!!boss'); i++) {
    await ev('hull = HULL_MAX; if (boss) { boss.z = 0.5; bolts.push({angle: boss.angle, z: 0.5}); }');
    await p.waitForTimeout(60);
  }
  ok(await ev('!boss && riftDepth === 4 && state === "playing"'), 'beating rift boss advances to depth 4, no win screen');

  // die in the rift
  await ev('hull = 1; damageShip(99999)'); await p.waitForTimeout(150);
  ok(await ev('state') === 'gameover', 'dying ends the rift');
  ok((await ev(`document.getElementById('finalscore').textContent`)).includes('DEPTH: 4'), 'game over shows depth');
  ok(await ev('bestRiftDepth === 4') && await ev(`localStorage.getItem('vortex-best-rift-depth')`) === '4', 'best rift depth saved');
  ok(await ev('bestScore === 0'), 'rift score kept out of campaign best');
  await ((await p.evaluate("state === 'title'")) ? p.evaluate('startGame(false)') : p.mouse.click(900, 650)); await p.waitForTimeout(100); // off-center canvas click
  ok(await ev('state === "playing" && gameMode === "rift" && riftDepth === 1'), 'retry (canvas click) restarts the rift');

  // back to title-free campaign path: reload, title button visible
  await p.reload(); await p.waitForTimeout(300);
  ok(await vis('riftStart'), 'rift button visible on title after unlock');
  ok((await ev(`document.getElementById('besttag').textContent`)).includes('RIFT: DEPTH 4'), 'title shows best rift: ' + await ev(`document.getElementById('besttag').textContent`));
  await p.evaluate(sel => document.querySelector(sel).click(), '#riftStart'); await p.waitForTimeout(100);
  ok(await ev('gameMode === "rift" && state === "playing"'), 'title rift button starts rift');
  await ev('damageShip(500)'); await p.waitForTimeout(100);
  await p.click('#gameover'); await p.waitForTimeout(100);
  ok(await ev('gameMode') === 'rift', 'gameover overlay click retries rift');

  // campaign regression: NGP via off-center canvas click on cleared
  await p.reload(); await p.waitForTimeout(300);
  await ((await p.evaluate("state === 'title'")) ? p.evaluate('startGame(false)') : p.mouse.click(500, 650)); await p.waitForTimeout(100);
  ok(await ev('gameMode === "campaign" && runTier === 0'), 'title click (off-center) = campaign');
  await ev('briefingTimer = 0; hull = HULL_MAX; killCount = 7'); await p.waitForTimeout(150);
  ok(await ev('bossActive && boss.kind === "mini"'), 'campaign miniboss at 7 still works');
  await ev('winGame()'); await ((await p.evaluate("state === 'title'")) ? p.evaluate('startGame(false)') : p.mouse.click(900, 650)); await p.waitForTimeout(100);
  ok(await ev('gameMode === "campaign" && runTier === 1'), 'cleared canvas click = NGP run 2');
  ok(await ev(`document.getElementById('levellabel').textContent`) === 'LVL', 'HUD label back to LVL');
  await ev('damageShip(500)'); await p.waitForTimeout(100);
  await ((await p.evaluate("state === 'title'")) ? p.evaluate('startGame(false)') : p.mouse.click(900, 650)); await p.waitForTimeout(100);
  ok(await ev('gameMode === "campaign" && runTier === 0'), 'campaign retry stays campaign');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
