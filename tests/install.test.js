const { chromium } = require('playwright');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1000, height: 700 } });
  const p = await c.newPage();
  await p.addInitScript(() => { localStorage.setItem('vortex-tutorial', '1'); localStorage.setItem('vortex-flash-warned', '1'); }); // skip the first-run tutorial
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const external = []; p.on('request', r => { if (!r.url().startsWith('http://127.0.0.1')) external.push(r.url()); });
  const ev = (x) => p.evaluate(x);
  await p.goto('http://127.0.0.1:8765/index.html');
  // installable: a manifest with icons
  const man = await ev(`fetch(document.querySelector('link[rel=manifest]').href).then(r => r.json())`);
  ok(man.name === 'VORTEX' && man.display === 'fullscreen' && man.icons.some(i => i.sizes === '512x512'), 'manifest names the app, runs fullscreen, has a 512px icon');
  const iconOk = await ev(`fetch('img/icons/icon-192.png').then(r => r.ok)`);
  ok(iconOk, 'icons load');
  await p.waitForTimeout(400);
  ok(await ev(`document.fonts.ready.then(() => document.fonts.check('12px "Press Start 2P"'))`), 'the pixel font is bundled and loads');
  ok(!external.length, 'nothing is fetched from other sites (' + external.slice(0, 3).join(' ') + ')');
  // the service worker installs and caches the game
  await ev(`navigator.serviceWorker.ready.then(() => true)`);
  await p.waitForTimeout(500);
  const cached = await ev(`caches.keys().then(ks => caches.open(ks.find(k => k.startsWith('vortex-')))).then(c => c.keys()).then(k => k.length)`);
  ok(cached >= 20, 'service worker cached the game (' + cached + ' files)');
  // offline: reload with no network, and it still boots and plays
  await c.setOffline(true);
  await p.reload(); await p.waitForTimeout(800);
  ok(await ev('state') === 'title' && await ev('typeof startGame') === 'function', 'loads offline');
  await ev('startGame(false); briefingTimer = 0'); await p.waitForTimeout(500);
  ok(await ev('state') === 'playing', 'plays offline');
  await c.setOffline(false);
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
