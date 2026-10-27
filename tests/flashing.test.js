const { chromium } = require('playwright');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  await p.addInitScript(() => localStorage.setItem('vortex-tutorial', '1')); // skip the first-run tutorial
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (x) => p.evaluate(x);
  await p.goto('http://127.0.0.1:8765/index.html'); await ev('localStorage.clear()'); await p.reload(); await p.waitForTimeout(300);
  // the title comes first; the warning appears when a game is about to start
  ok(!(await p.isVisible('#flashwarn')) && await ev('state') === 'title', 'the title screen shows first, no warning yet');
  await ev(`showScreen('menu')`); await p.click('#playBtn');
  ok(await p.isVisible('#flashwarn') && await ev('state') === 'title', 'pressing PLAY shows the photosensitivity warning before any gameplay');
  await p.screenshot({ path: process.argv[2] + '/flashwarn.png' });
  await p.click('#warnReduce');
  ok(!(await p.isVisible('#flashwarn')) && await ev(`settings.flash`) === 'reduced', 'REDUCED FLASHING closes it and turns the option on');
  ok(await ev('state') === 'playing', 'and the game then starts');
  await ev('backToMenu()');
  ok(await ev(`document.body.classList.contains('calm')`), 'calm mode stops the CRT and title flicker');
  await p.reload(); await p.waitForTimeout(300);
  await ev('startGame(false)');
  ok(!(await p.isVisible('#flashwarn')) && await ev('state') === 'playing', 'the warning only shows once');
  await ev('backToMenu()');
  // reduced: the warp greys out instead of inverting, flashes and shake are toned down
  await ev(`startGame(false); briefingTimer = 0; startWarp('TEST')`); await p.waitForTimeout(600);
  const f = await ev('canvas.style.filter');
  ok(f.includes('grayscale') && !f.includes('invert'), 'warp fades to grey, no inversion (' + f + ')');
  await ev(`shakeMag = 0; triggerShake(20, 0.3)`);
  ok(await ev('shakeMag') <= 7.01, 'shake is toned down');
  await ev(`tripTimer = 2; inkTimer = 0; warpTimer = 0`); await p.waitForTimeout(150);
  ok((await ev('canvas.style.filter')).includes('saturate(1.25)'), 'hoop trip is a slow, gentle colour drift');
  // and back to full from SETTINGS
  await ev(`backToMenu(); showScreen('settings')`); await p.waitForTimeout(150);
  await p.click('#flashToggle');
  ok(await ev(`settings.flash`) === 'full' && !(await ev(`document.body.classList.contains('calm')`)) && (await ev(`document.getElementById('flashToggle').textContent`)) === 'FLASHING: FULL', 'SETTINGS toggles flashing back to full');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
