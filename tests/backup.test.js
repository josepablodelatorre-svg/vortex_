const { chromium } = require('playwright');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1000, height: 800 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  await p.addInitScript(() => { localStorage.setItem('vortex-tutorial', '1'); localStorage.setItem('vortex-flash-warned', '1'); }); // skip the first-run tutorial
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const ev = (x) => p.evaluate(x);
  await p.goto('http://127.0.0.1:8765/index.html'); await ev('localStorage.clear()'); await p.reload(); await p.waitForTimeout(300);
  await ev('addCoins(123)');
  // credits
  await ev(`showScreen('settings')`); await p.click('#settingslinks [data-go="credits"]');
  ok((await ev(`document.getElementById('creditlist').textContent`)).includes('NEMO INC') && (await ev(`document.getElementById('versiontag').textContent`)) === 'V' + await ev('GAME_VERSION'), 'credits show Nemo Inc and the version');
  ok(!(await ev(`document.getElementById('creditlist').textContent`)).includes('INC.'), 'no period after Nemo Inc');
  await p.screenshot({ path: process.argv[2] + '/credits.png' });
  // export
  await ev(`showScreen('settings')`); await p.click('#settingslinks [data-go="backup"]');
  const code = await ev(`document.getElementById('backupcode').value`);
  ok(code.startsWith('VTX1:') && code.length > 20, 'backup code shown');
  await p.click('#backupCopy');
  ok((await ev('navigator.clipboard.readText()')) === code, 'COPY CODE copies it');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#backupFile')]);
  const fileText = require('fs').readFileSync(await dl.path(), 'utf8');
  ok(fileText === code && dl.suggestedFilename().startsWith('vortex-save-'), 'SAVE FILE downloads the same code');
  await p.screenshot({ path: process.argv[2] + '/backup.png' });
  // wipe, then restore on a "new device"
  await ev('localStorage.clear()'); await p.reload(); await p.waitForTimeout(300);
  ok(await ev('coins') === 0, 'fresh device has no coins');
  await ev(`showScreen('backup')`);
  await p.fill('#restorecode', 'not a backup'); await p.click('#restoreBtn');
  ok((await ev(`document.getElementById('backupmsg').textContent`)).includes("DOESN'T"), 'junk is rejected');
  await p.fill('#restorecode', code); await p.click('#restoreBtn');
  ok((await ev(`document.getElementById('restoreBtn').textContent`)) === 'TAP AGAIN TO REPLACE' && await ev('coins') === 0, 'first tap asks to confirm');
  await Promise.all([p.waitForNavigation(), p.click('#restoreBtn')]);
  await p.waitForTimeout(300);
  ok(await ev('coins') === 123, 'second tap restores the save (coins back: ' + await ev('coins') + ')');
  // restore from the file too
  await ev('localStorage.clear()'); await p.reload(); await p.waitForTimeout(300);
  await ev(`showScreen('backup')`);
  await p.setInputFiles('#restoreFile', await dl.path());
  await Promise.all([p.waitForNavigation(), p.click('#restoreBtn')]);
  await p.waitForTimeout(300);
  ok(await ev('coins') === 123, 'opening the backup file restores it too');
  console.log('errors', JSON.stringify(errs));
  await b.close();
})();
