const { chromium } = require('playwright');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 760 } });
  await p.addInitScript(() => {
    localStorage.setItem('vortex-tutorial', '1'); localStorage.setItem('vortex-flash-warned', '1');
    // a fake standard-mapping controller the test can press
    window.__pad = { connected: true, id: 'Test Pad (STANDARD GAMEPAD)', mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    navigator.getGamepads = () => [window.__pad];
  });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (x) => p.evaluate(x);
  const press = async (i, ms = 120) => { await ev(`__pad.buttons[${i}].pressed = true`); await p.waitForTimeout(ms); await ev(`__pad.buttons[${i}].pressed = false`); await p.waitForTimeout(120); };
  await p.goto('http://127.0.0.1:8765/index.html'); await ev('localStorage.clear()'); await p.reload(); await p.waitForTimeout(400);
  // splash -> menu with A, then navigate down and back
  await press(0);
  ok(await ev('titleScreen') === 'menu', 'A on the splash opens the menu');
  ok(await ev(`document.querySelector('.padfocus') && document.querySelector('.padfocus').offsetParent !== null`), 'a menu button is highlighted');
  const first = await ev(`document.querySelector('.padfocus').textContent`);
  await press(13);
  const second = await ev(`document.querySelector('.padfocus').textContent`);
  ok(first !== second, 'd-pad down moves the highlight (' + first + ' -> ' + second + ')');
  // go to settings with the d-pad, then B back
  for (let i = 0; i < 12 && !(await ev(`document.querySelector('.padfocus').textContent.startsWith('SETTINGS')`)); i++) await press(13);
  await press(0);
  ok(await ev('titleScreen') === 'settings', 'A on SETTINGS opens it');
  await press(1);
  ok(await ev('titleScreen') === 'menu', 'B goes back');
  // play: the stick aims, A fires, X bombs, START pauses
  await ev('startGame(false); briefingTimer = 0; spawnTimer = 99; enemies = []');
  await ev('__pad.axes[0] = 1; __pad.axes[1] = 0'); await p.waitForTimeout(150);
  ok(Math.abs(await ev('aimAngle') - Math.PI / 2) < 0.05, 'stick right aims right');
  await ev('__pad.axes[0] = 0; __pad.axes[2] = -0.9; __pad.axes[3] = 0.4'); await p.waitForTimeout(150);
  ok(await ev('aimAngle') < -1.5, 'the right stick aims too');
  await ev('__pad.axes = [0, 0, 0, 0]; runShots = 0');
  await ev('__pad.buttons[0].pressed = true');
  await p.waitForFunction('runShots >= 3', null, { timeout: 5000 }).catch(() => {});
  await ev('__pad.buttons[0].pressed = false'); await p.waitForTimeout(120);
  ok(await ev('runShots') >= 3, 'holding A keeps firing (' + await ev('runShots') + ' shots)');
  await ev(`for (let i = 0; i < 3; i++) spawnEnemy(i, 'drone'); zapperCharges = 1`);
  await press(2);
  ok(await ev('zapperCharges === 0 && enemies.length === 0'), 'X drops a bomb');
  await press(9);
  ok(await ev('paused'), 'START pauses');
  ok(await ev(`document.querySelector('.padfocus') && document.querySelector('.padfocus').id`) === 'resumeBtn', 'pause menu is controller-navigable');
  await press(0);
  ok(!(await ev('paused')), 'A on RESUME resumes');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
