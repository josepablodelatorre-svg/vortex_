// VORTEX - Jack-in intro, level start, bombs, warp, pickups.
// Plain script, loaded in order by index.html; shares globals with the others.

// ---------- Jack in: the player is digitized into the game ----------
// Optional camera: the face is shown only as a Rutt-Etra wireframe drawn
// from a tiny 64x48 sample, on this device only. Without a camera (or if
// it's refused) a procedural wireframe mask stands in. The name the player
// types replaces "PILOT" in the commander's lines.
const JACKIN_TIME = 4.2;
let pilotName = '';
let jackedIn = false;
let jackinTimer = 0;
let camVideo = null;      // <video> fed by the camera, when allowed
const faceSample = document.createElement('canvas');
faceSample.width = 64;
faceSample.height = 48;
const faceCtx = faceSample.getContext('2d', { willReadFrequently: true });
let faceLum = new Float32Array(64 * 48);
let faceSampledAt = -1;
try { pilotName = (store.getItem('vortex-pilot') || '').slice(0, 10); } catch (e) { /* ignore */ }
document.getElementById('pilotname').value = pilotName;

// refresh the 64x48 brightness map from the camera, or from the mask
function sampleFace() {
  if (faceSampledAt === t) return;
  faceSampledAt = t;
  if (camVideo && camVideo.readyState >= 2) {
    faceCtx.save();
    faceCtx.scale(-1, 1); // mirror, like looking into a screen
    faceCtx.drawImage(camVideo, -64, 0, 64, 48);
    faceCtx.restore();
    const d = faceCtx.getImageData(0, 0, 64, 48).data;
    for (let i = 0; i < 64 * 48; i++) {
      faceLum[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
    }
    return;
  }
  // procedural mask: an oval head with eye sockets and a mouth, breathing
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 64; x++) {
      const nx = (x - 32) / 17, ny = (y - 25) / 21;
      const head = 1 - (nx * nx + ny * ny);
      let v = head > 0 ? 0.35 + head * 0.6 : 0.05;
      for (const ex of [-0.38, 0.38]) {
        const dx = nx - ex, dy = ny + 0.18;
        if (dx * dx * 6 + dy * dy * 14 < 0.12) v = 0.08;
      }
      if (Math.abs(ny - 0.42) < 0.06 && Math.abs(nx) < 0.32 + Math.sin(t * 3) * 0.04) v = 0.1;
      faceLum[y * 64 + x] = Math.max(0, v);
    }
  }
}

// Rutt-Etra render of the face map: horizontal scan lines pushed upward
// by brightness, each line as bright as what it crosses. `glitch` jolts
// lines sideways (damage); `reveal` (0..1) only draws lines above it.
function drawRuttFace(g, x0, y0, w, h, opts) {
  opts = opts || {};
  sampleFace();
  const lines = opts.lines || 26;
  const amp = h * (opts.amp || 0.16);
  const reveal = opts.reveal === undefined ? 1 : opts.reveal;
  const rgb = opts.rgb || '63,255,102';
  g.save();
  g.lineWidth = opts.lineWidth || 1;
  g.shadowColor = `rgb(${rgb})`;
  g.shadowBlur = opts.blur || 4;
  for (let li = 0; li < lines; li++) {
    const v = li / (lines - 1);
    if (v > reveal) break;
    const sy = Math.min(47, Math.floor(v * 47));
    const jolt = opts.glitch ? (Math.random() < opts.glitch ? (Math.random() - 0.5) * w * 0.3 : 0) : 0;
    g.beginPath();
    let avg = 0;
    for (let sx = 0; sx < 64; sx++) {
      const lum = faceLum[sy * 64 + sx];
      avg += lum;
      const px = x0 + (sx / 63) * w + jolt;
      const py = y0 + v * h - lum * amp;
      if (sx === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.strokeStyle = `rgba(${rgb},${0.25 + 0.75 * (avg / 64)})`;
    g.stroke();
  }
  g.restore();
}

function playerName() {
  return pilotName || (lang === 'es' ? 'PILOTO' : 'PILOT');
}

async function jackIn() {
  const input = document.getElementById('pilotname');
  pilotName = input.value.trim().toUpperCase().replace(/[^A-Z0-9 ÑÜ_-]/g, '').slice(0, 10);
  try { store.setItem('vortex-pilot', pilotName); } catch (e) { /* ignore */ }
  initAudio();
  if (!camVideo && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' }, audio: false });
      camVideo = document.createElement('video');
      camVideo.muted = true;
      camVideo.playsInline = true;
      camVideo.srcObject = stream;
      await camVideo.play();
    } catch (e) {
      camVideo = null; // refused or unavailable: the procedural mask takes over
    }
  }
  jackedIn = true;
  jackinTimer = JACKIN_TIME;
  state = 'jackin';
  document.getElementById('title').style.display = 'none';
  const dc = document.getElementById('digitize');
  dc.width = window.innerWidth;
  dc.height = window.innerHeight;
  dc.style.display = 'block';
  setMusicTrack('garden');
  playComms();
}

// the digitizing sequence: a laser sweeps down, leaving a wireframe of
// the player behind it, then the program comes online and the run starts
function updateJackIn(dt) {
  if (state !== 'jackin') return;
  jackinTimer -= dt;
  const dc = document.getElementById('digitize');
  const g = dc.getContext('2d');
  const w = dc.width, h = dc.height;
  const progress = Math.min(1, (JACKIN_TIME - jackinTimer) / (JACKIN_TIME * 0.7));
  g.fillStyle = 'rgba(0,0,8,0.85)';
  g.fillRect(0, 0, w, h);
  const fw = Math.min(w * 0.6, h * 0.55 * 4 / 3), fh = fw * 0.75;
  // lines lift by up to 20% of the face height, so leave that room above
  const fx = (w - fw) / 2, fy = (h - fh) / 2 + fh * 0.06;
  drawRuttFace(g, fx, fy, fw, fh, { lines: 48, amp: 0.2, reveal: progress, lineWidth: 1.6, blur: 8, rgb: '80,230,255' });
  // the laser
  if (progress < 1) {
    const ly = fy + progress * fh;
    g.save();
    g.strokeStyle = '#ff3355';
    g.shadowColor = '#ff3355';
    g.shadowBlur = 24;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(fx - 40, ly);
    g.lineTo(fx + fw + 40, ly);
    g.stroke();
    g.restore();
  }
  g.save();
  g.font = `${Math.max(12, Math.round(w / 60))}px 'Press Start 2P', 'Courier New', monospace`;
  g.textAlign = 'center';
  g.fillStyle = '#3f6';
  g.shadowColor = '#3f6';
  g.shadowBlur = 10;
  const label = progress < 1
    ? (lang === 'es' ? 'DIGITALIZANDO USUARIO ' : 'DIGITIZING USER ') + Math.floor(progress * 100) + '%'
    : (lang === 'es' ? 'PROGRAMA ' : 'PROGRAM ') + playerName() + (lang === 'es' ? ' EN LINEA' : ' ONLINE');
  g.fillText(label, w / 2, fy + fh + Math.max(40, h * 0.08));
  if (!camVideo) {
    g.font = `${Math.max(8, Math.round(w / 110))}px 'Press Start 2P', 'Courier New', monospace`;
    g.globalAlpha = 0.6;
    g.fillText(lang === 'es' ? 'SIN CAMARA: USANDO AVATAR' : 'NO CAMERA: USING AVATAR', w / 2, fy + fh + Math.max(70, h * 0.13));
  }
  g.restore();
  if (jackinTimer <= 0) {
    dc.style.display = 'none';
    state = 'title'; // so startGame treats this as a fresh campaign start
    startGame(false, 'campaign');
  }
}

// live wireframe portrait in the HUD; glitches red when the ship is hit
const portraitCanvas = document.getElementById('portrait');
const portraitCtx = portraitCanvas.getContext('2d');
let portraitFrame = 0;
function drawPortrait() {
  const show = jackedIn && state === 'playing';
  portraitCanvas.style.display = show ? 'block' : 'none';
  if (!show || (portraitFrame++ % 2)) return; // ~30fps is plenty
  const g = portraitCtx;
  g.clearRect(0, 0, 132, 100);
  const hit = shipHitWobble > 0.05;
  drawRuttFace(g, 8, 10, 116, 72, { lines: 18, amp: 0.22, rgb: hit ? '255,51,85' : '63,255,102', glitch: hit ? 0.5 : 0.02 });
  g.font = "7px 'Press Start 2P', 'Courier New', monospace";
  g.fillStyle = hit ? '#ff3355' : '#3f6';
  g.textAlign = 'left';
  g.fillText('PROGRAM: ' + playerName(), 6, 95);
}

// a big callout floating up from the ship itself
function shipCallout(text, color) {
  const pos = shipScreenPos(shipLane);
  hitLabels.push({ x: pos.x + (CX - pos.x) * 0.25, y: pos.y + (CY - pos.y) * 0.25, vy: -46, life: 1.0, maxLife: 1.0, text, color, size: 15 });
}

// Called whenever a level (or a Rift boss gate) begins: refills the
// superzapper and applies the ship class's level-start perks.
function onLevelStart() {
  zapperCharges = 1 + up('bomb');
  if (currentLevel > 1) saveCheckpoint(false);
  midSaved = false;
  ventSpawned = false;
  if (gameMode === 'campaign') missionEvent('level', currentLevel);
  setEnv(routeEnv(), true);
  // the level banner names where this level starts
  const lb = document.getElementById('levelbanner');
  if (lb.textContent && !lb.textContent.includes(' - ') && lb.textContent !== ENV[env].name) lb.textContent += ' - ' + ENV[env].name;
  levelShots = 0;
  levelHits = 0;
  coresLost = 0;
  if (gameMode === 'campaign') startLevelMission();
  else { missionType = 'destroy'; updateObjectiveUI(); }
  const cls = shipClass();
  if (cls.startTriple > 0) tripleLaserTimer = Math.max(tripleLaserTimer, cls.startTriple);
  updateTripleUI();
  updateZapUI();
}

function updateZapUI() {
  const el = document.getElementById('hudzap');
  // the one screen-clearing bomb per level (the pixel font has no dot glyphs)
  el.textContent = 'BOMB x' + Math.max(0, zapperCharges) + (zapperCharges > 0 && !isTouch ? ' [SPACE]' : '');
  el.style.opacity = zapperCharges > 0 ? '1' : '0.4';
  const btn = document.getElementById('zapBtn');
  btn.style.display = state === 'playing' ? 'block' : 'none';
  btn.classList.toggle('spent', zapperCharges <= 0);
}

function superzap() {
  if (state !== 'playing' || zapperCharges <= 0 || warpTimer > 0) return;
  zapperCharges -= 1;
  vibrate(90);
  triggerNova();
  tutorialEvent('bomb');
  // the boss can't be zapped away, but it's blasted back down the tunnel
  if (boss && boss.alive) boss.z = Math.max(boss.z, BOSS_RESET_Z);
  updateZapUI();
}

function warpBoost() {
  if (warpTimer <= 0) return 1;
  const progress = 1 - warpTimer / WARP_DURATION; // 0..1
  return 1 + 6 * Math.sin(Math.PI * progress);
}

function startWarp(banner) {
  warpTimer = WARP_DURATION;
  warpBanner = banner;
  spikes = [];
  spikeTimer = 0.5;
  enemies = [];
  enemyBolts = [];
  showLevelBanner('WARP');
  triggerShake(8, 0.4);
  inkTimer = INK_TIME;
  spikeWarned = false;
  say('warp', ['WELL DONE, PILOT! PUNCH IT!', 'BOSS DOWN! HOLD ON, WE ARE JUMPING!', 'OUTSTANDING! WARP NOW!', 'EXPRESS LIFT TO THE BOTTOM OF THE VORTEX, GOING DOWN!'], 3, 0);
}

function finishWarp() {
  spikes = [];
  showLevelBanner(warpBanner);
  if (Math.random() < 0.5) {
    hack('arriveHack', { en: [camVideo ? 'I CAN SEE YOU, PILOT.' : 'I KNOW YOUR NAME, PILOT.', 'YOUR PROGRAM WILL BE DELETED.', 'DEEPER INTO MY SYSTEM. GOOD.'],
                         es: [camVideo ? 'PUEDO VERTE, PILOTO.' : 'SE TU NOMBRE, PILOTO.', 'TU PROGRAMA SERA BORRADO.', 'MAS ADENTRO DE MI SISTEMA. BIEN.'] }, 3, 0);
    return onLevelStart();
  }
  say('arrive', gameMode === 'rift'
    ? ['DEEPER IN. IT ONLY GETS WORSE.', 'NEW SECTOR. STAY SHARP.']
    : ['NEW SECTOR. EYES OPEN.', 'WE MADE IT. HOSTILES AHEAD.', 'STAY SHARP, PILOT.'], 2, 0);
  onLevelStart();
}

// The bomb's blast (nova): every enemy and enemy bolt on screen is wiped
// out at once. Kills count and score as normal; the boss only gets its
// incoming fire cleared.
function triggerNova() {
  novaFlash = 1;
  triggerShake(18, 0.4);
  playBossHit();
  for (const e of enemies) {
    if (!e.alive) continue;
    e.alive = false;
    score += Math.round((e.type === 'pentagram' ? 30 : 10) * (gameMode === 'rift' ? riftMultiplier() : 1) * missionMult());
    killCount += 1;
    versusKill();
    missionEvent('kill');
    burst(e.angle, e.z, { color: '255,120,255', bitColor: '#ff78ff', label: 'NOVA!', labelColor: '#ffb3ff' });
    shatterAt(e.angle, e.z, (ENEMY_COLORS[e.type] || ENEMY_COLORS.drone).rgb, 10, 1 - e.z * 0.6);
  }
  enemies = [];
  enemyBolts = [];
  document.getElementById('score').textContent = score;
  updateObjectiveUI();
}

function spawnPowerup() {
  const angle = rng('powerup') * Math.PI * 2;
  // hull repair is still the most common; the star is a Mario-style power
  // moment; plasma overcharge, echo, disc and a spare bomb are the extras
  const roll = rng('powerup');
  const kind = roll < 0.4 ? 'hull'
    : roll < 0.56 ? 'star'
    : roll < 0.71 ? 'shield'
    : roll < 0.82 ? 'echo'
    : roll < 0.92 ? 'disc'
    : 'bomb';
  powerups.push({ angle, z: 1.0, alive: true, kind });
}

function collectPowerup(p) {
  p.alive = false;
  tutorialEvent('pickup');
  playPowerUp();
  const pickupCallouts = {
    hull: ['+' + HULL_REPAIR_PER_POWERUP + ' HULL', '#ffd23f', ['REPAIRS ONLINE.', 'PATCHED UP. KEEP GOING!']],
    star: ['TRIPLE LASER!', '#fff6c8', ["TRIPLE LASER! SPREAD 'EM OUT!", 'FIREPOWER TRIPLED!']],
    shield: ['OVERCHARGE!', '#50e6ff', ['PLASMA OVERCHARGED. GO LOUD!', "YOU'RE COVERED. PUSH IN!"]],
    bomb: ['+1 BOMB', '#ff78ff', ['ONE MORE BOMB IN THE RACK.', 'EXTRA BOMB! SAVE IT FOR A BAD MOMENT.']],
    echo: ['ECHO!', '#b4ff5a', ['ECHO ONLINE! YOUR SHOTS HAVE GHOSTS!', 'ECHO! EVERY SHOT TWICE MORE!']],
    disc: ['LAMBDA DISC!', '#e8fdff', ['DISC ARMED! THROW IT, IT COMES BACK!', 'LAMBDA DISC! SLICE THE WHOLE RING!']]
  };
  const callout = pickupCallouts[p.kind];
  if (callout) {
    shipCallout(callout[0], callout[1]);
    say('pickup-' + p.kind, callout[2], 1, 10);
  }
  if (p.kind === 'disc') {
    discCharges = DISC_THROWS;
    updateTripleUI();
    burst(p.angle, p.z, { color: '232,253,255', bitColor: '#e8fdff', label: 'DISC!', labelColor: '#ffffff' });
  } else if (p.kind === 'echo') {
    echoTimer = ECHO_DURATION * chargeMul();
    updateTripleUI();
    burst(p.angle, p.z, { color: '180,255,90', bitColor: '#b4ff5a', label: 'ECHO!', labelColor: '#e2ffb8' });
  } else if (p.kind === 'shield') {
    // overcharge: the plasma layer refills and stacks one more full layer
    // on top (more with the LONG CHARGE upgrade); it lasts until it's hit
    plasma = Math.max(plasma, plasmaMax * (1 + chargeMul()));
    updatePlasmaUI();
    burst(p.angle, p.z, { color: '80,230,255', bitColor: '#50e6ff', label: 'OVERCHARGE!', labelColor: '#b8f6ff' });
  } else if (p.kind === 'bomb') {
    zapperCharges = Math.min(BOMB_MAX, zapperCharges + 1);
    updateZapUI();
    burst(p.angle, p.z, { color: '255,120,255', bitColor: '#ff78ff', label: '+1 BOMB', labelColor: '#ffb3ff' });
  } else if (p.kind === 'star') {
    tripleLaserTimer = TRIPLE_LASER_DURATION * shipClass().tripleMul * chargeMul();
    updateTripleUI();
    burst(p.angle, p.z, {
      color: '255,255,255',
      bitColor: '#ffffff',
      label: 'TRIPLE LASER!',
      labelColor: '#fff6c8'
    });
  } else {
    hull = Math.min(hullMax, hull + HULL_REPAIR_PER_POWERUP);
    updateHullUI();
    burst(p.angle, p.z, {
      color: '255,210,63',
      bitColor: '#ffd23f',
      label: '+HULL',
      labelColor: '#ffd23f'
    });
  }
}

function updateTripleUI() {
  // one line per active pickup timer
  const el = document.getElementById('hudtriple');
  const lines = [];
  if (tripleLaserTimer > 0) lines.push('TRIPLE LASER ' + tripleLaserTimer.toFixed(1) + 's');
  if (echoTimer > 0) lines.push('ECHO ' + echoTimer.toFixed(1) + 's');
  if (discCharges > 0) lines.push('DISC x' + discCharges);
  if (boostTimer > 0) lines.push('BOOST ' + boostTimer.toFixed(1) + 's');
  if (brakeTimer > 0) lines.push('SLOW-MO ' + brakeTimer.toFixed(1) + 's');
  el.textContent = lines.join('\n');
  el.style.display = lines.length ? 'block' : 'none';
}
