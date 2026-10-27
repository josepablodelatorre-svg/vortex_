// Balance simulator: a bot pilot plays whole campaigns in a headless browser,
// faster than real time, and reports how far runs get and what each level
// costs. It drives the game through simulate(dt) (no drawing), aiming at the
// nearest threat with a human-ish reaction time, aim error and click rate.
//
//   node tools/balance.js                 every difficulty x skill, 6 runs each
//   node tools/balance.js normal average 20
//
// Needs the tests' dependencies (cd tests && npm install) and serves the
// repo itself on 127.0.0.1:8765 unless something already listens there.
const path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [path.join(__dirname, '../tests')] }));

// reaction: seconds between decisions; aimErr: radians of aim noise;
// aimSpeed: how fast the hand can sweep the aim round the ring (rad/s);
// distracted: chance of chasing some other target than the most urgent;
// clicks: shots per second; dodge: chance of noticing incoming fire
const SKILLS = {
  novicenl: { reaction: 0.45, aimErr: 0.22, aimSpeed: 4,  distracted: 0.5,  clicks: 3, dodge: 0.25, bombAt: 99, noLock: true },
  novice:  { reaction: 0.45, aimErr: 0.22, aimSpeed: 4,  distracted: 0.5,  clicks: 3, dodge: 0.25, bombAt: 6 },
  average: { reaction: 0.3,  aimErr: 0.13, aimSpeed: 7,  distracted: 0.3,  clicks: 5, dodge: 0.55, bombAt: 5 },
  good:    { reaction: 0.18, aimErr: 0.06, aimSpeed: 12, distracted: 0.1,  clicks: 7, dodge: 0.85, bombAt: 4 },
  // diagnostics: an instant, perfect aimer, and one that never fires
  perfect: { reaction: 0.12, aimErr: 0,    aimSpeed: 99, distracted: 0,    clicks: 8, dodge: 1,    bombAt: 4, cheat: true },
  idle:    { reaction: 1,    aimErr: 0,    aimSpeed: 1,  distracted: 0,    clicks: 0, dodge: 0,    bombAt: 99 }
};
const MAX_GAME_SECONDS = 1500;

// runs inside the page: one whole campaign, returns per-level stats
function playRun({ skill, difficulty, maxSeconds }) {
  const S = skill;
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
  // a person points at where a thing is drawn on screen, not at its hidden
  // lane angle: the swirl, bend and banking all move it
  const seen = (o) => {
    const v = pointOnRing(o.angle, o.z);
    return normalizeAngle(Math.atan2(v.x - CX, -(v.y - CY)) + camRoll);
  };
  difficultySetting = difficulty;
  startGame(false, 'campaign');
  briefingTimer = 0;
  const levels = [];
  let lvl = { level: 1, time: 0, damage: 0, bossTime: 0, shots: 0, kills: 0 };
  let lastLevel = 1, lastHealth = hull + plasma, lastKills = killCount;
  let nextDecide = 0, aimTarget = Math.PI, nextShot = 0, hasTarget = false, simT = 0;
  const dt = 1 / 60;
  while (simT < maxSeconds && state === 'playing') {
    simT += dt;
    if (simT >= nextDecide) {
      nextDecide = simT + S.reaction * (0.7 + 0.6 * Math.random());
      // incoming enemy fire about to reach the ship's lane: maybe dodge
      const danger = enemyBolts.some(b => b.z < 0.35 && inShipLane(b.angle, 0.45)) ||
                     enemies.some(e => e.alive && e.z < 0.12 && inShipLane(e.angle, 0.45));
      if (danger && Math.random() < S.dodge) {
        aimTarget = normalizeAngle(shipLane + (Math.random() < 0.5 ? 1 : -1) * (0.9 + Math.random() * 0.5));
        if (Math.abs(aimTarget) < Math.PI / 2) aimTarget = normalizeAngle(Math.PI - aimTarget);
        hasTarget = false;
      } else {
        const targets = enemies.filter(e => e.alive && e.z < 0.95);
        if (boss && boss.alive) targets.push(boss);
        for (const c of cores) if (c.alive) targets.push(c);
        targets.sort((a, b) => a.z - b.z);
        hasTarget = targets.length > 0;
        const pick = Math.random() < S.distracted ? targets[Math.floor(Math.random() * targets.length)] : targets[0];
        if (hasTarget) aimTarget = normalizeAngle((S.cheat ? pick.angle : seen(pick)) + gauss() * S.aimErr);
      }
      if (zapperCharges > 0 && enemies.filter(e => e.alive && e.z < 0.4).length >= S.bombAt) superzap();
      if (!S.noLock && power >= 100 && lockinTimer <= 0) lockIn();
    }
    // the hand sweeps toward the chosen angle at a limited speed
    const gap = normalizeAngle(aimTarget - aimAngle);
    aimAngle = normalizeAngle(aimAngle + Math.sign(gap) * Math.min(Math.abs(gap), S.aimSpeed * dt));
    if (S.clicks > 0 && hasTarget && simT >= nextShot && warpTimer <= 0) {
      fire();
      nextShot = simT + (1 / S.clicks) * (0.8 + 0.4 * Math.random());
    }
    simulate(dt);
    // bookkeeping
    lvl.time += dt;
    if (bossActive && boss && boss.kind !== 'mini') lvl.bossTime += dt;
    const health = hull + plasma;
    if (health < lastHealth) lvl.damage += lastHealth - health;
    lastHealth = health;
    if (killCount > lastKills) lvl.kills += killCount - lastKills;
    lastKills = killCount;
    if (currentLevel !== lastLevel) {
      levels.push(lvl);
      lvl = { level: currentLevel, time: 0, damage: 0, bossTime: 0, shots: 0, kills: 0 };
      lastLevel = currentLevel;
      lastKills = killCount;
    }
  }
  const won = state === 'cleared';
  lvl.died = state === 'gameover';
  levels.push(lvl);
  const result = { won, died: state === 'gameover', reached: currentLevel, levels, accuracy: runShots ? runHits / runShots : 0, seconds: simT };
  // leave the page ready for the next run
  if (state === 'playing') { hull = 0; plasma = 0; damageShip(1); }
  return result;
}

(async () => {
  const [onlyDiff, onlySkill, runsArg] = process.argv.slice(2);
  const runs = parseInt(runsArg, 10) || 6;
  const diffs = onlyDiff ? [onlyDiff] : ['easy', 'normal', 'hard'];
  const skills = onlySkill ? [onlySkill] : ['novice', 'average', 'good'];
  let server = null;
  const busy = await new Promise((resolve) => {
    const sock = require('net').connect(8765, '127.0.0.1');
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => resolve(false));
  });
  if (!busy) server = await require('../tests/static-server').start();
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 640 } });
  await p.addInitScript(() => { localStorage.setItem('vortex-tutorial', '1'); localStorage.setItem('vortex-flash-warned', '1'); });
  await p.goto('http://127.0.0.1:8765/index.html');
  await p.evaluate('localStorage.clear()');
  await p.reload();
  await p.waitForTimeout(300);
  const fmt = (x) => x.toFixed(0).padStart(4);
  for (const difficulty of diffs) {
    for (const skillName of skills) {
      const results = [];
      for (let i = 0; i < runs; i++) {
        // fresh save each run: no upgrades or mission bonuses carried over
        await p.evaluate('localStorage.clear()');
        results.push(await p.evaluate(playRun, { skill: SKILLS[skillName], difficulty, maxSeconds: MAX_GAME_SECONDS }));
      }
      const wins = results.filter(r => r.won).length;
      console.log(`\n${difficulty.toUpperCase()} / ${skillName}: ${wins}/${runs} cleared the campaign, accuracy ${(100 * results.reduce((a, r) => a + r.accuracy, 0) / runs).toFixed(0)}%`);
      console.log('  level  reached  died-here  avg-time  avg-boss  avg-damage');
      for (let L = 1; L <= 5; L++) {
        const rows = results.map(r => r.levels.find(l => l.level === L)).filter(Boolean);
        const died = results.filter(r => r.died && r.reached === L).length;
        if (!rows.length) { console.log(`  ${L}        0`); continue; }
        const avg = (k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
        console.log(`  ${L}     ${String(rows.length).padStart(4)}  ${String(died).padStart(9)}     ${fmt(avg('time'))}s     ${fmt(avg('bossTime'))}s    ${fmt(avg('damage'))}`);
      }
    }
  }
  await b.close();
  if (server) server.close();
})();
