const { chromium } = require('playwright');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (x) => p.evaluate(x);
  await p.goto('http://127.0.0.1:8765/index.html');
  // an older build's separate keys...
  await ev(`localStorage.clear();
    localStorage.setItem('vortex-coins', '77');
    localStorage.setItem('vortex-best-score', '1234');
    localStorage.setItem('vortex-lang', 'es');
    localStorage.setItem('vortex-upgrades', JSON.stringify({ plasma: 2 }));
    localStorage.setItem('unrelated-key', 'keep me');`);
  await p.reload(); await p.waitForTimeout(300);
  // ...are folded into the one save entry and removed
  const keys = await ev('Object.keys(localStorage).sort().join(",")');
  ok(keys === 'unrelated-key,vortex-save', 'old keys folded into vortex-save (' + keys + ')');
  const save = JSON.parse(await ev(`localStorage.getItem('vortex-save')`));
  ok(save.v === 1 && save.data['vortex-coins'] === '77', 'save is versioned and holds the data');
  ok(await ev('coins') === 77 && await ev('bestScore') === 1234 && await ev('lang') === 'es' && await ev('up("plasma")') === 2, 'game state comes back from the migrated save');
  // new writes land in the same entry
  await ev('addCoins(3)');
  ok(JSON.parse(await ev(`localStorage.getItem('vortex-save')`)).data['vortex-coins'] === '80', 'new progress is written into vortex-save');
  await p.reload(); await p.waitForTimeout(300);
  ok(await ev('coins') === 80, 'and survives a reload');
  // a broken save doesn't stop the game
  await ev(`localStorage.setItem('vortex-save', '{not json')`);
  await p.reload(); await p.waitForTimeout(300);
  ok(await ev('state') === 'title' && await ev('coins') === 0, 'a corrupt save starts fresh instead of crashing');
  // the phone pad reads the pilot name from the same save
  await ev(`store.setItem('vortex-pilot', 'ADA')`);
  await p.goto('http://127.0.0.1:8765/pad.html'); await p.waitForTimeout(300);
  ok(await ev(`document.getElementById('name').value`) === 'ADA', 'pad.html reads the pilot name from vortex-save');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
