const { chromium } = require('playwright');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1000, height: 760 } });
  await p.addInitScript(() => localStorage.setItem('vortex-tutorial', '1')); // skip the first-run tutorial
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (x) => p.evaluate(x);
  await p.goto('http://127.0.0.1:8765/index.html'); await ev('localStorage.clear()'); await p.reload(); await p.waitForTimeout(300);
  await p.mouse.click(500, 400); await p.waitForTimeout(200); // first tap: menu + title music
  await ev(`showScreen('settings')`); await p.waitForTimeout(150);
  await p.screenshot({ path: process.argv[2] + '/settings.png' });
  // glow cycles AUTO -> ON -> OFF and really zeroes shadowBlur when off
  ok(await ev(`document.getElementById('glowToggle').textContent`) === 'GLOW: AUTO', 'glow starts on AUTO');
  await p.click('#glowToggle'); await p.click('#glowToggle');
  ok(await ev(`settings.glow === 'off' && !glowActive`), 'GLOW: OFF');
  ok(await ev(`(() => { ctx.shadowBlur = 20; const v = ctx.shadowBlur; ctx.shadowBlur = 0; return v; })()`) === 0, 'glow off forces shadowBlur to 0');
  await p.click('#glowToggle');
  ok(await ev(`settings.glow === 'auto' && glowActive`), 'back to AUTO');
  ok(await ev(`(() => { ctx.shadowBlur = 20; const v = ctx.shadowBlur; ctx.shadowBlur = 0; return v; })()`) === 20, 'glow on keeps shadowBlur');
  // auto drops glow when frames are slow, restores it when they recover
  await ev(`for (let i = 0; i < 200; i++) watchFrameRate(1 / 25)`);
  ok(await ev('glowActive') === false, 'AUTO turns glow off at 25 fps');
  await ev(`for (let i = 0; i < 700; i++) watchFrameRate(1 / 60)`);
  ok(await ev('glowActive') === true, 'AUTO turns it back on at 60 fps');
  // volume sliders
  await p.locator('#musicVol').fill('40');
  await p.waitForTimeout(1200);
  ok(Math.abs(await ev('settings.music') - 0.4) < 0.01 && Math.abs(await ev('musicGarden.volume') - 0.55 * 0.4) < 0.05, 'music slider sets the music level (' + (await ev('musicGarden.volume')).toFixed(2) + ')');
  await p.locator('#sfxVol').fill('0');
  ok(await ev('settings.sfx') === 0 && await ev('!sfxBus || sfxBus.gain.value === 0'), 'sfx slider mutes effects');
  // vibration
  await ev(`window.__buzz = []; navigator.vibrate = (pat) => { __buzz.push(pat); return true; }`);
  await p.click('#vibeToggle');
  ok(await ev('settings.vibrate') === false, 'VIBRATION: OFF');
  await ev(`startGame(false); briefingTimer = 0; plasma = 0; damageShip(5)`);
  ok(await ev('__buzz.length') === 0, 'no buzz when off');
  await ev(`settings.vibrate = true; plasma = 0; damageShip(5)`);
  ok(await ev('__buzz.length') === 1, 'a hit buzzes when on');
  // everything is saved
  await p.reload(); await p.waitForTimeout(300);
  ok(await ev(`settings.music === 0.4 && settings.sfx === 0 && settings.glow === 'auto' && settings.vibrate === false`), 'settings survive a reload');
  ok(await ev(`document.getElementById('musicVol').value`) === '40', 'slider shows the saved level');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
