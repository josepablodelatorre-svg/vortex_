const { chromium, devices } = require('playwright');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ ...devices['iPhone 13'] });
  const p = await c.newPage();
  await p.addInitScript(() => { localStorage.setItem('vortex-tutorial', '1'); localStorage.setItem('vortex-flash-warned', '1'); }); // skip the first-run tutorial
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (x) => p.evaluate(x);
  const text = (sel) => ev(`document.querySelector('${sel}').textContent.trim()`);
  await p.goto('http://127.0.0.1:8765/index.html'); await ev('localStorage.clear()'); await p.reload(); await p.waitForTimeout(400);
  await ev(`showScreen('settings')`);
  ok(await text('#langToggle') === 'LANGUAGE: EN', 'English by default');
  await p.tap('#langToggle'); await p.waitForTimeout(150);
  ok(await text('#langToggle') === 'IDIOMA: ES', 'LANGUAGE toggles to IDIOMA: ES');
  ok(await text('[data-screen="settings"] h2') === 'AJUSTES' && await text('[data-diff="hard"]') === 'DIFICIL', 'settings screen in Spanish');
  await ev(`showScreen('menu')`); await p.waitForTimeout(150);
  ok(await text('#playBtn') === 'JUGAR' && (await text('#boardBtn')) === 'CLASIFICACION >', 'menu in Spanish');
  await p.screenshot({ path: process.argv[2] + '/es-menu.png' });
  await ev(`showScreen('board')`); await p.waitForTimeout(100);
  ok(await text('[data-board="campaign"]') === 'CAMPAÑA', 'leaderboard tabs in Spanish');
  // a run: HUD, banner, results
  await ev('startGame(false)'); await p.waitForTimeout(300);
  ok(await text('#levellabel') === 'NIV' && (await ev(`document.getElementById('hullrow').textContent`)).includes('CASCO'), 'HUD in Spanish');
  ok((await text('#levelbanner')).startsWith('NIVEL 1'), 'level banner in Spanish (' + await text('#levelbanner') + ')');
  ok((await text('#hudzap')).startsWith('BOMBA x'), 'bomb counter in Spanish');
  await ev('score = 120');
  for (let i = 0; i < 20 && await ev(`state === 'playing'`); i++) { await ev('plasma = 0; damageShip(99999)'); await p.waitForTimeout(50); }
  await p.waitForTimeout(200);
  ok(await text('#losttitle') === 'SEÑAL PERDIDA' && (await text('#finalscore')).startsWith('PUNTOS: 120') && (await text('#finalscore')).includes('BAJAS:') && (await text('#rankLost')).includes('PUNTERIA'), 'results in Spanish (' + await text('#finalscore') + ')');
  await p.screenshot({ path: process.argv[2] + '/es-results.png' });
  // and back to English
  await ev(`backToMenu(); showScreen('settings')`); await p.tap('#langToggle'); await p.waitForTimeout(150);
  await ev(`showScreen('menu')`);
  ok(await text('#playBtn') === 'PLAY' && await text('#langToggle') === 'LANGUAGE: EN', 'switching back restores English');
  await p.reload(); await p.waitForTimeout(300);
  ok(await text('#playBtn') === 'PLAY', 'and it stays English after a reload');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
