// VORTEX - Game state, track items, coins, missions, checkpoints, the Rift, level objectives.
// Plain script, loaded in order by index.html; shares globals with the others.

// ---------- Game State ----------
let state = 'title'; // title | playing | gameover | cleared
let score = 0;
let killCount = 0;
let t = 0;
let runT = 0; // seconds into the current run: difficulty, tunnel pull and swirl ramp with this, not page time

// Hull integrity: the ship takes damage from enemy contact rather than
// dying outright, SIGNAL LOST only fires once hull hits zero.
const HULL_MAX = 150; // raised from 100: runs were ending too early
const HULL_DAMAGE_PER_HIT = 16;
const HULL_REPAIR_PER_POWERUP = 45;
// plasma shield: a second, recharging layer that takes hits first
const PLASMA_FRACTION = 0.4;      // of the hull's max
const PLASMA_REGEN = 7;           // per second...
const PLASMA_REGEN_DELAY = 2.5;   // ...once this long has passed since the last hit
let plasma = 0, plasmaMax = 0, plasmaHitAt = -99;
// ---------- Track objects: pads, hoops and portals on the tunnel floor ----------
// They ride in with the tunnel in lanes the ship can reach (the lower half)
// and trigger when they reach the rim inside the ship's lane:
//   boost  (yellow arrow pad)  everything rushes for PAD_TIME, +100 points
//   brake  (zebra pad)         everything slows for PAD_TIME, a breather
//   hoop   (psychedelic ring)  a random ability + a hue-shifting trip
//   portal (purple swirl)      teleports the ship to the mirror lane
const PAD_TIME = 3;
const TRACK_HIT = 0.34;
let trackItems = [];   // { kind, angle, z }
let trackTimer = 6;
let boostTimer = 0, brakeTimer = 0, tripTimer = 0;
let teleportFlash = 0;
// warp ink: hitting warp speed drains the colour and inverts the screen, so
// the speed lines turn into black ink strokes on white, for INK_TIME
const INK_TIME = 7;
let inkTimer = 0;

// speed multipliers from pads: tunnel scroll, and how hard enemies are pulled in
function padSpeed() {
  return boostTimer > 0 ? 2.2 : brakeTimer > 0 ? 0.5 : 1;
}
function padPull() {
  return boostTimer > 0 ? 1.35 : brakeTimer > 0 ? 0.6 : 1;
}

function spawnTrackItem() {
  const r = Math.random();
  // coin rows are the most common thing on the floor
  if (r < 0.4) { spawnCoinRow(); return; }
  const r2 = Math.random();
  const kind = r2 < 0.33 ? 'boost' : r2 < 0.58 ? 'brake' : r2 < 0.8 ? 'hoop' : 'portal';
  // somewhere on the ship's arc: 3 to 9 o'clock (anywhere during lock-in)
  const angle = lockinTimer > 0 ? normalizeAngle(Math.random() * Math.PI * 2)
    : normalizeAngle(Math.PI + (Math.random() - 0.5) * Math.PI * 0.95);
  trackItems.push({ kind, angle, z: 1 });
}

function triggerTrackItem(it) {
  if (it.kind === 'boost' || it.kind === 'hoop' || it.kind === 'portal') missionEvent(it.kind);
  if (it.kind === 'boost') {
    boostTimer = PAD_TIME; brakeTimer = 0;
    score += 100;
    document.getElementById('score').textContent = score;
    shipCallout('BOOST +100', '#ffe14d');
    playBass(140, 0.3);
    triggerShake(5, 0.4);
    say('boost', { en: ['IN THE PIPE, FIVE BY FIVE!', 'HANG ON, PILOT, WE ARE FLYING!'], es: ['¡EN EL TUBO, CINCO POR CINCO!', '¡AGARRATE, PILOTO, VAMOS VOLANDO!'] }, 1, 10);
  } else if (it.kind === 'brake') {
    brakeTimer = PAD_TIME; boostTimer = 0;
    shipCallout('SLOW-MO', '#ffffff');
    playBass(50, 0.4);
    say('brake', { en: ['EASY. KEEP YOUR VELOCITY DOWN.', 'BREATHE, PILOT. LINE UP YOUR SHOTS.'], es: ['CALMA. BAJA LA VELOCIDAD.', 'RESPIRA, PILOTO. APUNTA BIEN.'] }, 1, 10);
  } else if (it.kind === 'hoop') {
    tripTimer = 2.8;
    const gifts = ['star', 'echo', 'shield', 'disc'];
    collectPowerup({ angle: it.angle, z: 0.02, alive: true, kind: gifts[Math.floor(Math.random() * gifts.length)] });
    say('hoop', { en: ['WHAT WAS THAT?! YOU ARE GLOWING, PILOT!', 'WHOA. EVERYTHING IS... COLOURS.'], es: ['¡¿QUE FUE ESO?! ¡ESTAS BRILLANDO, PILOTO!', 'UF. TODO ES... COLORES.'] }, 2, 10);
  } else if (it.kind === 'portal') {
    // the mirror lane: across the screen (or straight across the ring in lock-in)
    shipLane = normalizeAngle(lockinTimer > 0 ? shipLane + Math.PI : -shipLane);
    shipX = shipScreenPos(shipLane).x - CX;
    teleportFlash = 1;
    const pos = shipScreenPos(shipLane);
    shatter(pos.x, pos.y, '200,120,255', 40, 1.4);
    playHack();
    shipCallout('TELEPORT!', '#c878ff');
    say('portal', { en: ['ROLL, PILOT, ROLL!', 'WHERE DID YOU... OH. NICE.'], es: ['¡GIRA, PILOTO, GIRA!', '¿A DONDE TE... AH. BIEN.'] }, 1, 10);
  }
}

function updateTrack(dt) {
  boostTimer = Math.max(0, boostTimer - dt);
  brakeTimer = Math.max(0, brakeTimer - dt);
  tripTimer = Math.max(0, tripTimer - dt);
  teleportFlash = Math.max(0, teleportFlash - dt * 3);
  inkTimer = Math.max(0, inkTimer - dt);
  // screen-wide looks are CSS filters on the canvas: the warp's black-and-
  // white ink (easing in and out) wins over the psychedelic hue trip
  if (inkTimer > 0) {
    const k = Math.min(1, inkTimer / 0.6, (INK_TIME - inkTimer) / 0.3);
    canvas.style.filter = `grayscale(${k}) invert(${k}) contrast(${1 + k})`;
  } else {
    canvas.style.filter = tripTimer > 0 ? `hue-rotate(${Math.round(t * 400) % 360}deg) saturate(1.8)` : '';
  }
  if (state !== 'playing') return;
  if (!calmPhase()) {
    trackTimer -= dt;
    if (trackTimer <= 0) {
      spawnTrackItem();
      trackTimer = (env === 'space' ? 1.8 : 2.6) + Math.random() * 2.4;
    }
  }
  const speed = effectiveTunnelSpeed() * warpBoost() * padSpeed();
  for (const it of trackItems) {
    it.z -= speed * dt;
    if (it.kind === 'vent' && !it.done) {
      for (const b of bolts) {
        if (b.hidden || Math.abs(normalizeAngle(b.angle - it.angle)) > 0.3 || Math.abs(b.z - it.z) > 0.12) continue;
        it.done = true;
        b.z = 2;
        score += 500;
        missionEvent('vent');
        document.getElementById('score').textContent = score;
        shatterAt(it.angle, it.z, '255,160,60', 90, 2);
        triggerShake(16, 0.5);
        playBossHit();
        shipCallout('DIRECT HIT! +500', '#ffaa3c');
        say('vent', { en: ['DIRECT HIT! GREAT SHOT, KID. DON\'T LET IT GO TO YOUR HEAD.', 'THAT\'S A HIT! THE WHOLE TRENCH IS GOING UP!'],
                      es: ['¡IMPACTO DIRECTO! BUEN TIRO, CHICO. QUE NO SE TE SUBA.', '¡LE DIMOS! ¡TODA LA ZANJA VUELA!'] }, 3, 0);
        break;
      }
      if (!it.done && it.z <= 0.03) { it.done = true; shipCallout('VENT MISSED', '#ff8866'); }
      continue;
    }
    if (it.kind === 'coin') {
      if (!it.done && it.z <= 0.04) {
        it.done = true;
        if (inShipLane(it.angle, TRACK_HIT + 0.08 * up('magnet'))) {
          addCoins(1);
          missionEvent('coin');
          it.got = true;
          playCoin();
          // a gold sparkle and a +1 where it was grabbed
          burst(it.angle, 0.04, { color: '255,210,63', bitColor: '#ffd23f', label: '+1', labelColor: '#ffe680' });
        }
      }
      continue;
    }
    if (it.z <= 0.03 && !it.done) {
      it.done = true;
      if (inShipLane(it.angle, TRACK_HIT)) triggerTrackItem(it);
    }
  }
  trackItems = trackItems.filter(it => it.z > -0.05);
}

// a flat patch on the tunnel wall: four corners at angle ± half, z .. z + len
function wallPatch(angle, half, z, len) {
  return [pointOnRing(angle - half, z), pointOnRing(angle + half, z),
          pointOnRing(angle + half, Math.min(1, z + len)), pointOnRing(angle - half, Math.min(1, z + len))];
}

function drawTrackItems() {
  if (!trackItems.length) return;
  ctx.save();
  for (const it of trackItems) {
    if (it.z < 0 || it.z > 1) continue;
    const near = 1 - it.z;
    if (it.kind === 'coin') {
      if (it.done) continue;
      // a spinning gold coin standing just off the floor
      const pt = pointOnRing(it.angle, it.z);
      const x = pt.x + (CX - pt.x) * 0.05, y = pt.y + (CY - pt.y) * 0.05;
      // lined up with the ship's lane: brighter, bigger, pulsing, so you
      // can see you're on course to collect it
      const onCourse = inShipLane(it.angle, TRACK_HIT + 0.08 * up('magnet'));
      const r = (3 + 12 * near) * (onCourse ? 1.25 + Math.sin(t * 12) * 0.08 : 1);
      ctx.beginPath();
      ctx.ellipse(x, y, r * Math.abs(Math.cos(t * 4 + it.z * 20)) + 1, r, 0, 0, Math.PI * 2);
      ctx.fillStyle = onCourse ? 'rgba(255,240,150,0.7)' : 'rgba(255,210,63,0.3)';
      ctx.fill();
      ctx.strokeStyle = onCourse ? '#fff6c8' : '#ffd23f';
      ctx.shadowColor = '#ffd23f';
      ctx.shadowBlur = onCourse ? 20 : 8;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;
      continue;
    }
    if (it.kind === 'vent') {
      if (it.done) continue;
      // a glowing exhaust vent set into the trench floor, with a target ring
      const quad = wallPatch(it.angle, 0.12, it.z, 0.07);
      ctx.beginPath();
      quad.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
      ctx.closePath();
      ctx.fillStyle = `rgba(255,150,40,${0.3 + 0.3 * Math.sin(t * 10)})`;
      ctx.fill();
      ctx.strokeStyle = '#ffaa3c';
      ctx.shadowColor = '#ffaa3c';
      ctx.shadowBlur = 16;
      ctx.lineWidth = 2;
      ctx.stroke();
      const c = pointOnRing(it.angle, it.z + 0.035);
      ctx.beginPath();
      ctx.arc(c.x, c.y, 6 + 18 * near, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      continue;
    }
    if (it.kind === 'boost' || it.kind === 'brake') {
      const quad = wallPatch(it.angle, 0.17, it.z, 0.09);
      ctx.beginPath();
      quad.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
      ctx.closePath();
      ctx.fillStyle = it.kind === 'boost' ? `rgba(255,225,77,${0.25 + 0.3 * near})` : `rgba(255,255,255,${0.12 + 0.2 * near})`;
      ctx.fill();
      ctx.lineWidth = 1 + 2 * near;
      if (it.kind === 'boost') {
        // three chevrons pointing toward the player
        ctx.strokeStyle = '#ffe14d';
        ctx.shadowColor = '#ffe14d';
        ctx.shadowBlur = 12;
        for (let k = 0; k < 3; k++) {
          const zz = it.z + 0.015 + k * 0.025;
          const l = pointOnRing(it.angle - 0.13, zz + 0.02), m = pointOnRing(it.angle, zz), r = pointOnRing(it.angle + 0.13, zz + 0.02);
          ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(m.x, m.y); ctx.lineTo(r.x, r.y); ctx.stroke();
        }
      } else {
        // zebra stripes across the pad
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2 + 4 * near;
        for (let k = 0; k < 4; k++) {
          const zz = it.z + 0.01 + k * 0.022;
          const a = pointOnRing(it.angle - 0.17, zz), b = pointOnRing(it.angle + 0.17, zz);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        quad.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
        ctx.closePath();
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    } else {
      const pt = pointOnRing(it.angle, it.z);
      // hovering a little off the wall, toward the centre
      const x = pt.x + (CX - pt.x) * 0.08, y = pt.y + (CY - pt.y) * 0.08;
      const r = 6 + 34 * near;
      if (it.kind === 'hoop') {
        ctx.lineWidth = 2 + 4 * near;
        for (let k = 0; k < 12; k++) {
          ctx.beginPath();
          ctx.ellipse(x, y, r, r * 0.6, 0, (k / 12) * Math.PI * 2, ((k + 1) / 12) * Math.PI * 2);
          ctx.strokeStyle = `hsl(${(k * 30 + t * 300) % 360}, 100%, 60%)`;
          ctx.shadowColor = ctx.strokeStyle;
          ctx.shadowBlur = 14;
          ctx.stroke();
        }
      } else {
        // portal: a purple swirl spinning into itself
        ctx.strokeStyle = '#c878ff';
        ctx.shadowColor = '#c878ff';
        ctx.shadowBlur = 18;
        ctx.lineWidth = 1.5 + 2 * near;
        ctx.beginPath();
        for (let k = 0; k <= 40; k++) {
          const a = k * 0.45 + t * 6, rr = r * (k / 40);
          const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.6;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }
  }
  ctx.restore();
  if (teleportFlash > 0) {
    ctx.fillStyle = `rgba(200,120,255,${0.25 * teleportFlash})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// ---------- Coins + upgrades (saved as vortex-coins / vortex-upgrades) ----------
// Coins come in short rows along a lane (fly over them), plus bonuses for
// bosses and cleared levels. They're spent on permanent upgrades in the
// UPGRADES screen; nothing here can be bought with real money.
const UPGRADES = {
  plasma:  { name: 'PLASMA CELLS', what: '+15% PLASMA SHIELD PER LEVEL', max: 5, cost: 60 },
  charge:  { name: 'LONG CHARGE',  what: 'POWER-UPS LAST 12% LONGER PER LEVEL', max: 5, cost: 50 },
  magnet:  { name: 'COIN MAGNET',  what: 'COLLECT COINS FROM A WIDER LANE', max: 5, cost: 40 },
  bomb:    { name: 'EXTRA BOMB',   what: '+1 BOMB PER LEVEL', max: 2, cost: 150 },
  core:    { name: 'POWER CORE',   what: 'LOCK-IN CHARGES 15% FASTER PER LEVEL', max: 5, cost: 70 }
};
let coins = 0;
let upgrades = {};
let runCoins = 0;
try {
  coins = parseInt(store.getItem('vortex-coins'), 10) || 0;
  upgrades = JSON.parse(store.getItem('vortex-upgrades') || '{}') || {};
} catch (e) { /* storage unavailable */ }
function up(id) { return upgrades[id] || 0; }
function upgradeCost(id) { return UPGRADES[id].cost * (up(id) + 1); }
function saveWallet() {
  try {
    store.setItem('vortex-coins', String(coins));
    store.setItem('vortex-upgrades', JSON.stringify(upgrades));
  } catch (e) { /* ignore */ }
}
function addCoins(n) {
  coins += n;
  runCoins += n;
  saveWallet();
  document.getElementById('hudcoins').textContent = 'COINS ' + runCoins;
}
// how much longer timed power-ups last
function chargeMul() { return 1 + 0.12 * up('charge'); }

function renderShop() {
  document.getElementById('wallet').textContent = 'COINS ' + coins;
  const list = document.getElementById('shoplist');
  list.innerHTML = '';
  for (const [id, u] of Object.entries(UPGRADES)) {
    const lvl = up(id), maxed = lvl >= u.max, cost = upgradeCost(id);
    const row = document.createElement('div');
    row.className = 'shoprow';
    row.innerHTML = `<span>${u.name}</span><span class="pips">${'#'.repeat(lvl)}${'-'.repeat(u.max - lvl)}</span><span class="what">${u.what}</span>`;
    const btn = document.createElement('button');
    btn.textContent = maxed ? 'MAX' : cost + ' C';
    btn.disabled = maxed || coins < cost;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (coins < cost || maxed) return;
      coins -= cost;
      upgrades[id] = lvl + 1;
      saveWallet();
      playPowerUp();
      renderShop();
    });
    row.appendChild(btn);
    list.appendChild(row);
  }
}

// coin rows: 5 coins in one lane, spaced down the tunnel
function spawnCoinRow() {
  const angle = lockinTimer > 0 ? normalizeAngle(Math.random() * Math.PI * 2)
    : normalizeAngle(Math.PI + (Math.random() - 0.5) * Math.PI * 0.95);
  for (let k = 0; k < 5; k++) trackItems.push({ kind: 'coin', angle, z: 1 + k * 0.05 });
}

// ---------- Missions + daily streak (saved as vortex-missions / vortex-streak) ----------
// Three missions at a time from MISSION_POOL; each pays coins when done.
// Finishing all three starts the next, slightly harder set and raises the
// permanent score multiplier (missionMult). Progress is fed by
// missionEvent(key, amount) calls at the matching moments in play.
const MISSION_POOL = [
  { id: 'kill',   text: 'DESTROY {n} ENEMIES', n: 150 },
  { id: 'dodge',  text: 'DODGE {n} ENEMIES', n: 30 },
  { id: 'coin',   text: 'COLLECT {n} COINS', n: 60 },
  { id: 'boss',   text: 'DEFEAT {n} BOSSES', n: 3 },
  { id: 'portal', text: 'USE {n} PORTALS', n: 4 },
  { id: 'boost',  text: 'HIT {n} ARROW PADS', n: 6 },
  { id: 'hoop',   text: 'FLY THROUGH {n} HOOPS', n: 4 },
  { id: 'lockin', text: 'USE LOCK-IN {n} TIMES', n: 3 },
  { id: 'disc',   text: 'HIT {n} TARGETS WITH DISCS', n: 10 },
  { id: 'rock',   text: 'BREAK {n} ASTEROIDS', n: 10 },
  { id: 'vent',   text: 'HIT {n} TRENCH VENTS', n: 1 },
  { id: 'level',  text: 'REACH LEVEL {n}', n: 3, max: true }
];
let missionState = { set: 0, active: [] };
let streak = { days: 0, last: '' };
try {
  missionState = JSON.parse(store.getItem('vortex-missions') || 'null') || missionState;
  streak = JSON.parse(store.getItem('vortex-streak') || 'null') || streak;
} catch (e) { /* storage unavailable */ }

function missionMult() { return 1 + 0.1 * missionState.set; }
function saveMissions() {
  try { store.setItem('vortex-missions', JSON.stringify(missionState)); } catch (e) { /* ignore */ }
}
function dealMissions() {
  const pool = MISSION_POOL.slice().sort(() => Math.random() - 0.5).slice(0, 3);
  const scale = 1 + 0.25 * missionState.set;
  missionState.active = pool.map(m => ({ id: m.id, n: m.max ? Math.min(LEVEL_COUNT, m.n + Math.floor(missionState.set / 2)) : Math.ceil(m.n * scale), p: 0 }));
  saveMissions();
}

function missionText(m) {
  return MISSION_POOL.find(x => x.id === m.id).text.replace('{n}', m.n);
}

function missionEvent(key, amount) {
  let changed = false;
  for (const m of missionState.active) {
    if (m.id !== key || m.p >= m.n) continue;
    const def = MISSION_POOL.find(x => x.id === key);
    m.p = def.max ? Math.max(m.p, amount) : m.p + (amount === undefined ? 1 : amount);
    changed = true;
    if (m.p >= m.n) {
      m.p = m.n;
      const reward = Math.round(30 * (1 + 0.2 * missionState.set));
      coins += reward;
      saveWallet();
      showToast('MISSION COMPLETE: ' + missionText(m) + '\n+' + reward + ' COINS');
      playPowerUp();
    }
  }
  if (!changed) return;
  if (missionState.active.every(m => m.p >= m.n)) {
    missionState.set += 1;
    dealMissions();
    setTimeout(() => showToast('ALL MISSIONS DONE!\nSCORE MULTIPLIER x' + missionMult().toFixed(1)), 1800);
  }
  saveMissions();
}

function renderMissions() {
  document.getElementById('missionmult').textContent = 'SET ' + (missionState.set + 1) + '   SCORE x' + missionMult().toFixed(1);
  document.getElementById('missionlist').innerHTML = missionState.active.map(m => {
    const done = m.p >= m.n;
    return `<div class="missionrow${done ? ' done' : ''}">${done ? 'DONE: ' : ''}${missionText(m)}<span style="float:right">${m.p}/${m.n}</span>`
      + `<div class="missionbar"><div style="width:${Math.round(m.p / m.n * 100)}%"></div></div></div>`;
  }).join('');
  document.getElementById('streaktag').textContent = streak.days > 0 ? 'DAILY STREAK: ' + streak.days + (streak.days === 1 ? ' DAY' : ' DAYS') : 'PLAY TODAY TO START A STREAK';
}

// first run of each day: extend (or restart) the streak and pay out
function checkStreak() {
  const today = todayKey();
  if (streak.last === today) return;
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yesterday = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
  streak.days = streak.last === yesterday ? streak.days + 1 : 1;
  streak.last = today;
  try { store.setItem('vortex-streak', JSON.stringify(streak)); } catch (e) { /* ignore */ }
  const reward = 20 * Math.min(7, streak.days);
  coins += reward;
  saveWallet();
  setTimeout(() => showToast('DAY ' + streak.days + ' STREAK!\n+' + reward + ' COINS'), 600);
}

// ---------- Checkpoints (saved as vortex-checkpoint) ----------
// Campaign runs save a checkpoint at the start of every level from level 2
// and again halfway through a level, when its route changes scenery. It
// survives closing the game: CONTINUE (on SIGNAL LOST and in the menu)
// restarts from there with the score you had. Not for daily / Rift /
// versus runs, which are about one clean run.
let checkpoint = null;
try { checkpoint = JSON.parse(store.getItem('vortex-checkpoint') || 'null'); } catch (e) { checkpoint = null; }

function saveCheckpoint(mid) {
  if (gameMode !== 'campaign' || daily || versus) return;
  checkpoint = {
    level: currentLevel, runTier, score, mid,
    killCount, coresGot, missionTime, nextMinibossIndex, missionType
  };
  try { store.setItem('vortex-checkpoint', JSON.stringify(checkpoint)); } catch (e) { /* ignore */ }
  shipCallout('CHECKPOINT', '#3f6');
}

function clearCheckpoint() {
  checkpoint = null;
  try { store.removeItem('vortex-checkpoint'); } catch (e) { /* ignore */ }
}

function checkpointLabel() {
  return checkpoint ? 'LEVEL ' + checkpoint.level + (checkpoint.mid ? ' (MIDWAY)' : '') : '';
}

function continueFromCheckpoint() {
  if (!checkpoint) return;
  const cp = checkpoint;
  initAudio();
  startGame(false, 'campaign');
  stopTutorial(true); // a checkpoint means this pilot has flown before
  runTier = cp.runTier;
  currentLevel = cp.level;
  score = cp.score;
  document.getElementById('score').textContent = score;
  document.getElementById('levelnum').textContent = currentLevel;
  tunnelSidesTarget = computeShapeStage();
  tunnelSides = tunnelSidesTarget;
  updateRunUI();
  showLevelBanner('CHECKPOINT - LEVEL ' + currentLevel);
  onLevelStart();
  if (cp.mid && cp.missionType === missionType) {
    killCount = cp.killCount;
    coresGot = cp.coresGot;
    missionTime = cp.missionTime;
    nextMinibossIndex = cp.nextMinibossIndex;
    updateObjectiveUI();
    midSaved = true;
    saveCheckpoint(true); // keep the midway point, not just the level start
  }
}

// power: charged by kills, spent on lock-in mode
const POWER_PER_KILL = 5; // about one lock-in per level
let power = 0;
// Lock-in: with POWER full, L (or the LOCK button) locks the wings in
// attack position for LOCKIN_DURATION: the ship advances into the tunnel,
// can ride the whole ring instead of just the lower half, slides twice as
// fast and auto-fires. Power drains as it runs.
const LOCKIN_DURATION = 8;
const LOCKIN_FIRE_INTERVAL = 0.09;
let lockinTimer = 0;
let lockinBlend = 0;   // 0..1 eased, for the ship moving inward
let lockinFireTimer = 0;
let lockinAnnounced = false;

function lockIn() {
  if (state !== 'playing' || power < 100 || lockinTimer > 0) return;
  lockinTimer = LOCKIN_DURATION;
  missionEvent('lockin');
  tutorialEvent('lockin');
  lockinFireTimer = 0;
  triggerShake(6, 0.3);
  playPowerUp();
  playBass(55, 0.5);
  shipCallout('LOCK-IN!', '#ffe14d');
  say('lockin', { en: ['LOCK BLASTERS IN ATTACK POSITION!', 'BLASTERS LOCKED! THE WHOLE RING IS YOURS!', 'NOW THIS IS WHERE IT GETS FUN.'],
                  es: ['¡BLASTERS EN POSICION DE ATAQUE!', '¡BLASTERS FIJOS! ¡TODO EL ANILLO ES TUYO!', 'AHORA SI SE PONE DIVERTIDO.'] }, 3, 0);
}

function updateLockIn(dt) {
  if (power >= 100 && lockinTimer <= 0 && !lockinAnnounced) {
    lockinAnnounced = true;
    shipCallout(isTouch ? 'LOCK-IN READY' : 'LOCK-IN READY [L]', '#ffe14d');
  }
  document.getElementById('lockBtn').style.display = (state === 'playing' && power >= 100 && lockinTimer <= 0) ? 'block' : 'none';
  lockinBlend += ((lockinTimer > 0 ? 1 : 0) - lockinBlend) * Math.min(1, dt * 4);
  if (lockinTimer <= 0) return;
  lockinTimer = Math.max(0, lockinTimer - dt);
  power = 100 * lockinTimer / LOCKIN_DURATION;
  lockinAnnounced = false;
  updatePlasmaUI();
  lockinFireTimer -= dt;
  if (lockinFireTimer <= 0) {
    fire();
    lockinFireTimer = LOCKIN_FIRE_INTERVAL;
  }
}
let hullMax = HULL_MAX; // per ship class, set at the start of each run
let hull = HULL_MAX;
let damageFlash = 0; // 0..1, decays each frame

function updateHullUI() {
  const pct = Math.max(0, hull) / hullMax * 100;
  const fill = document.getElementById('hullfill');
  fill.style.width = pct + '%';
  fill.style.background = pct > 50 ? '#3f6' : pct > 25 ? '#ffcc33' : '#f33';
}

// Shared damage path for anything that hurts the ship: enemy contact,
// enemy bolts, boss contact. Keeps the flash/sound/lose-check in one place.
function damageShip(amount) {
  amount = Math.round(amount * getDiffParams().damage);
  plasmaHitAt = t;
  if (plasma > 0) {
    const soak = Math.min(plasma, amount);
    plasma -= soak;
    amount -= soak;
    updatePlasmaUI();
    if (amount <= 0) {
      shipCallout('PLASMA -' + Math.round(soak), '#22ddff');
      triggerShake(5, 0.15);
      playBossHit();
      return;
    }
  }
  hull -= amount;
  vibrate(40);
  netBroadcast({ t: 'hit' });
  runDamage += amount;
  bossFightDamage += amount;
  shipHitWobble = 1;
  killStreak = 0;
  shipCallout('-' + amount + ' HULL', '#ff4455');
  if (hull > 0) say('hit', ["WE'RE HIT!", 'HULL BREACH!', 'TAKING DAMAGE!', 'OUCH. STAY FOCUSED!', "THEY'RE ALL OVER ME!", 'WHERE DID THAT ONE COME FROM?!'], 1, 6);
  updateHullUI();
  playDamage();
  damageFlash = 1;
  triggerShake(amount >= 20 ? 14 : 8, 0.3);
  if (hull <= 0) {
    hull = 0;
    updateHullUI();
    endGame();
  }
}

// Objective: destroy this many regular enemies WITHIN THE CURRENT LEVEL to
// summon that level's boss. killCount resets to 0 at the start of each
// level, so this is a per-level target, not a run-total one.
const KILL_TARGET = 20;

// Two quick miniboss detours happen along the way to each level's full kill
// count, at these local (per-level) kill counts. Beating a miniboss doesn't
// advance the level or reset progress — it's a side fight, not a gate.
// minibosses arrive at these fractions of the level's mission progress
// (7 and 13 kills of 20 in a destroy mission, as before)
const MINIBOSS_THRESHOLDS = [0.35, 0.65];
let nextMinibossIndex = 0; // resets to 0 each level, alongside killCount

// The run is split into levels, each unlocking tougher enemy variety and
// ending in its own boss fight once that level's kill target is reached.
const LEVEL_COUNT = 5;
let currentLevel = 1;
let levelBannerTimer = 0;

function showLevelBanner(text) {
  const el = document.getElementById('levelbanner');
  el.textContent = text;
  el.style.opacity = '1';
  levelBannerTimer = 2.0;
}

// Boss: each level's full kill count ends in that level's boss fight; two
// quicker minibosses punctuate the way there. All take several hits and
// deal heavy contact damage without ending the fight on contact. Later
// levels (and New-Game-Plus runs) field a tougher boss.
const BOSS_HP_BASE = 30;
const BOSS_HP_PER_LEVEL = 8;
const MINIBOSS_HP = 12; // flat and quick — a detour, not the main event
const BOSS_CONTACT_DAMAGE = 22;
const BOSS_RESET_Z = 0.55;
let bossActive = false;
let boss = null; // { angle, z, hp, hpMax, fireTimer, alive, kind: 'mini'|'level'|'final' }

function updateBossUI() {
  const row = document.getElementById('bossrow');
  if (!boss) { row.style.opacity = '0'; return; }
  row.style.opacity = '1';
  const pct = Math.max(0, boss.hp) / boss.hpMax * 100;
  document.getElementById('bossfill').style.width = pct + '%';
}

function spawnBoss(kind) {
  const hpMax = kind === 'mini'
    ? MINIBOSS_HP + runTier
    : BOSS_HP_BASE + (currentLevel - 1) * BOSS_HP_PER_LEVEL + runTier * 2 + Math.floor(riftTier() * 2);
  // Watchdog: level 2's boss, and every 6th Rift depth.
  // It sways around the tube and stomps forward every few seconds.
  const watchdog = kind === 'level' && (gameMode === 'rift' ? riftDepth % 6 === 0 : currentLevel === 2);
  boss = { angle: Math.PI, z: 1.0, hp: hpMax, hpMax, fireTimer: 2.0, alive: true, kind,
           form: watchdog ? 'watchdog' : 'core', seed: Math.random() * 6, stompTimer: 4, lunge: 0 };
  bossActive = true;
  if (kind !== 'mini') setMusicTrack('boss');
  bossFightDamage = 0;
  if (watchdog) {
    hack('watchdog', { en: ['WATCHDOG DISPATCHED. TRANSMISSION ENDS.', 'THE WATCHDOG HAS YOUR SCENT, PILOT.'],
                         es: ['WATCHDOG ENVIADO. FIN DE LA TRANSMISION.', 'EL WATCHDOG TE TIENE EN LA MIRA, PILOTO.'] }, 4, 0);
  } else if (kind === 'final') {
    hack('final', { en: ['YOU WILL NEVER EXIT(0), PILOT.', 'THIS SYSTEM IS MINE. TRANSMISSION ENDS.'],
                    es: ['NUNCA HARAS EXIT(0), PILOTO.', 'ESTE SISTEMA ES MIO. FIN DE LA TRANSMISION.'] }, 4, 0);
  }
  updateBossUI();
}

// New-Game-Plus escalation: beating the boss doesn't just reset to Level 1,
// it bumps this and the next run comes back meaner. Resets to 0 on a fresh
// start or a loss, so dying doesn't carry the escalation forward.
let runTier = 0;

// ---------- THE RIFT (endless post-campaign mode) ----------
// Unlocked by beating the campaign once. Instead of 3 fixed levels it's an
// endless chain of sectors: each one rolls a new tunnel shape and a new
// enemy mix, every RIFT_BOSS_EVERY-th sector ends in a boss, difficulty
// keeps creeping up and so does the score multiplier. Played purely for
// score/depth; it only ends when the hull does.
let gameMode = 'campaign'; // 'campaign' | 'rift'
let riftDepth = 1;
let riftMix = null; // { drone, weaver, shooter, pentagram } spawn weights for this sector
const RIFT_SECTOR_KILLS = 12;
const RIFT_BOSS_EVERY = 3;
let riftUnlocked = false;
let bestRiftDepth = 0;
let bestRiftScore = 0;
try {
  riftUnlocked = store.getItem('vortex-rift-unlocked') === '1';
  bestRiftDepth = parseInt(store.getItem('vortex-best-rift-depth'), 10) || 0;
  bestRiftScore = parseInt(store.getItem('vortex-best-rift-score'), 10) || 0;
} catch (e) { /* storage unavailable, keep defaults */ }

// extra escalation the Rift layers on top of runTier, half a run tier per sector
function riftTier() {
  return gameMode === 'rift' ? (riftDepth - 1) * 0.5 : 0;
}

function riftMultiplier() {
  return 1 + (riftDepth - 1) * 0.5;
}

// ---------- Missions (from X, 1992): each campaign level has an objective ----------
// destroy: kill KILL_TARGET; recover: shoot RECOVER_TARGET data cores before
// they slip past; survive: hold out SURVIVE_TIME seconds against a denser
// swarm. Finishing the objective is what arms the level's boss. The Rift
// is always destroy. The order rotates with each New-Game-Plus run.
const MISSION_TYPES = ['destroy', 'recover', 'survive'];
const RECOVER_TARGET = 6;
const SURVIVE_TIME = 45;
const BRIEFING_TIME = 3.6;
let missionType = 'destroy';
let coresGot = 0;
let missionTime = 0;
let cores = [];           // { angle, z, alive } data cores for recover missions
let coreTimer = 0;
let briefingTimer = 0;
let lang = 'en';          // commander/briefing language: 'en' | 'es'
function L(texts) {
  return texts[lang] || texts.en;
}
const BRIEFINGS = {
  destroy: {
    title: 'MISSION: DESTROY', titleEs: 'MISIÓN: DESTRUIR',
    en: 'Destroy ' + KILL_TARGET + ' hostiles to draw out the gate guardian.',
    es: 'Destruye ' + KILL_TARGET + ' hostiles para hacer salir al guardián.'
  },
  recover: {
    title: 'MISSION: RECOVER', titleEs: 'MISIÓN: RECUPERAR',
    en: 'Data cores are drifting down the tunnel. Shoot ' + RECOVER_TARGET + ' of them to beam them aboard before they slip past.',
    es: 'Hay núcleos de datos flotando por el túnel. Dispara a ' + RECOVER_TARGET + ' para recuperarlos antes de que se escapen.'
  },
  survive: {
    title: 'MISSION: SURVIVE', titleEs: 'MISIÓN: SOBREVIVIR',
    en: 'A swarm is pouring through the horizon. Hold out for ' + SURVIVE_TIME + ' seconds.',
    es: 'Un enjambre cruza el horizonte. Resiste ' + SURVIVE_TIME + ' segundos.'
  }
};

function missionFor(level) {
  return gameMode === 'rift' ? 'destroy' : MISSION_TYPES[(level - 1 + runTier) % MISSION_TYPES.length];
}

function missionProgress() {
  if (missionType === 'recover') return Math.min(1, coresGot / RECOVER_TARGET);
  if (missionType === 'survive') return Math.min(1, missionTime / SURVIVE_TIME);
  return Math.min(1, killCount / currentKillTarget());
}

function objectiveParts() {
  if (missionType === 'recover') return ['CORES', coresGot, RECOVER_TARGET];
  if (missionType === 'survive') return ['SURVIVE', Math.floor(missionTime), SURVIVE_TIME + 's'];
  return ['KILLS', killCount, currentKillTarget()];
}

function updateObjectiveUI() {
  const [label, value, target] = objectiveParts();
  document.getElementById('objlabel').textContent = label;
  document.getElementById('kills').textContent = value;
  document.getElementById('killTarget').textContent = target;
}

// campaign levels open with a briefing; spawns hold off until it's read
function startLevelMission() {
  missionType = missionFor(currentLevel);
  coresGot = 0;
  missionTime = 0;
  cores = [];
  coreTimer = 2.5;
  const brief = BRIEFINGS[missionType];
  document.getElementById('briefingtitle').textContent = arcadeCaps(lang === 'es' ? brief.titleEs : brief.title);
  document.getElementById('briefingtext').textContent = L(brief);
  document.getElementById('briefing').style.opacity = '1';
  briefingTimer = BRIEFING_TIME;
  updateObjectiveUI();
}

// quiet stretches where nothing new spawns: the warp, and reading a briefing
function calmPhase() {
  return warpTimer > 0 || briefingTimer > 0 || !!tutorial;
}

function currentKillTarget() {
  return gameMode === 'rift' ? RIFT_SECTOR_KILLS : KILL_TARGET;
}

// a fresh random enemy mix per sector: drones always, the nastier types
// unlock with depth and get a random share each time, so no two sectors
// play quite the same
function rollRiftMix() {
  const w = () => 0.3 + Math.random() * 1.2;
  return {
    drone: 1,
    weaver: w(),
    shooter: riftDepth >= 2 ? w() : 0,
    pentagram: riftDepth >= 3 ? w() * 0.6 : 0
  };
}

function pickRiftShape() {
  // never repeat the current shape, so every sector visibly morphs
  const options = SHAPE_STAGES.filter(sides => sides !== tunnelSidesTarget);
  return options[Math.floor(Math.random() * options.length)];
}

function enterRiftSector() {
  killCount = 0;
  nextMinibossIndex = MINIBOSS_THRESHOLDS.length; // no minibosses in the Rift
  currentLevel = Math.min(LEVEL_COUNT, riftDepth); // enables clusters etc. like the later levels
  riftMix = rollRiftMix();
  tunnelSidesTarget = pickRiftShape();
  updateObjectiveUI();
  document.getElementById('levelnum').textContent = riftDepth;
  updateRunUI();
  showLevelBanner(riftDepth === 1 ? (versus ? 'VERSUS' : 'THE RIFT') : 'DEPTH ' + riftDepth);
  setEnv(routeEnv(), riftDepth === 1);
  if (riftDepth >= 5) unlockAchievement('riftwalker');
}

function unlockRift() {
  if (riftUnlocked) return;
  riftUnlocked = true;
  try { store.setItem('vortex-rift-unlocked', '1'); } catch (e) { /* ignore */ }
  applyRiftUnlock();
}

function applyRiftUnlock() {
  document.getElementById('riftStart').style.display = riftUnlocked ? 'block' : 'none';
}
