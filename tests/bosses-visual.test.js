const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 760 } });
  await p.addInitScript(() => { localStorage.setItem('vortex-tutorial', '1'); localStorage.setItem('vortex-flash-warned', '1'); }); // skip the first-run tutorial
  await p.goto('http://127.0.0.1:8765/index.html'); await p.waitForTimeout(300);
  await p.evaluate('startGame(false)'); await p.waitForTimeout(200);
  const shots = [];
  for (const [kind, lvl] of [['mini', 1], ['level', 1], ['final', 3], ['level', 2]]) {
    await p.evaluate(`briefingTimer = 0; enemies = []; spawnTimer = 999; formationTimer = 999; clusterTimer = 999; hull = hullMax; currentLevel = ${lvl}; spawnBoss('${kind}'); boss.z = 0.5; boss.angle = 0.35; document.getElementById('briefing').style.display = 'none'; document.getElementById('levelbanner').style.display = 'none'; boss.fireTimer = 99; boss.stompTimer = 99;`);
    await p.evaluate(`for (let i = 0; i < 3; i++) { spawnEnemy(-1.2 + i * 0.5, 'weaver'); enemies.at(-1).z = 0.5; enemies.at(-1).speed = 0; }`);
    await p.waitForTimeout(400);
    const f = process.argv[2] + '/boss-' + kind + lvl + '.png';
    await p.screenshot({ path: f, clip: { x: 380, y: 0, width: 500, height: 420 } });
    shots.push(f);
  }
  await b.close();
})();
