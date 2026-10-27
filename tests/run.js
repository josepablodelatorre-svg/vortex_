// Runs every *.test.js in this folder, one after another, against a fresh
// static server (and a local PeerJS server for the multiplayer tests).
//   node tests/run.js            all tests
//   node tests/run.js coop pause only tests whose name contains a word
// Each test prints PASS/FAIL lines and gets the screenshot folder
// (tests/shots/) as its first argument.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const MULTIPLAYER = ['coop', 'versus', 'daemons'];
const filters = process.argv.slice(2);
const shots = path.join(__dirname, 'shots');
fs.mkdirSync(shots, { recursive: true });

const files = fs.readdirSync(__dirname)
  .filter(f => f.endsWith('.test.js'))
  .filter(f => !filters.length || filters.some(w => f.includes(w)))
  .sort();

function runOne(file) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [path.join(__dirname, file), shots], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    const timer = setTimeout(() => { out += '\nFAIL timed out\n'; child.kill(); }, 240000);
    child.on('close', (code) => {
      clearTimeout(timer);
      const fails = out.split('\n').filter(l => l.startsWith('FAIL'));
      const errs = /^errors (.*)$/m.exec(out);
      const pageErrors = errs && errs[1] !== '[]' ? errs[1] : '';
      const passed = code === 0 && !fails.length && !pageErrors;
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`${passed ? 'ok  ' : 'FAIL'} ${file} (${secs}s)`);
      if (!passed) console.log(out.split('\n').map(l => '     ' + l).join('\n'));
      resolve(passed);
    });
  });
}

// true when something already listens on the port (a server left running
// by hand is simply reused)
function portBusy(port) {
  return new Promise((resolve) => {
    const sock = require('net').connect(port, '127.0.0.1');
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => resolve(false));
  });
}

(async () => {
  const servers = [];
  if (!(await portBusy(8765))) servers.push(await require('./static-server').start());
  if (files.some(f => MULTIPLAYER.some(m => f.includes(m))) && !(await portBusy(9000))) {
    try { servers.push(await require('./peer-server').start()); }
    catch (err) { console.log('(no local peer server: ' + err.message + ' - run npm install in tests/)'); }
  }
  let failed = 0;
  for (const f of files) if (!(await runOne(f))) failed++;
  console.log(`\n${files.length - failed}/${files.length} test files passed`);
  for (const s of servers) s.close();
  process.exit(failed ? 1 : 0);
})();
