// VORTEX - CRT, achievements, ship palettes and classes, clips, daily tunnel, ranks, best scores.
// Plain script, loaded in order by index.html; shares globals with the others.

// ---------- CRT overlay toggle (pure CSS scanlines/vignette/flicker) ----------
let crtOn = true;
try {
  const saved = store.getItem('vortex-crt');
  if (saved !== null) crtOn = saved === '1';
} catch (e) { /* storage unavailable, keep the default */ }

function applyCrtState() {
  document.getElementById('crtOverlay').classList.toggle('on', crtOn);
  const btn = document.getElementById('crtToggle');
  btn.textContent = 'CRT: ' + (crtOn ? 'ON' : 'OFF');
  btn.classList.toggle('selected', crtOn);
}
applyCrtState();

// commander + briefing language (HUD and banners stay in arcade English)
try { if (store.getItem('vortex-lang') === 'es') lang = 'es'; } catch (e) { /* ignore */ }
function applyLang() {
  document.getElementById('langToggle').textContent = 'COMMS: ' + lang.toUpperCase();
  document.getElementById('viewToggle').textContent = 'VIEW: ' + viewMode.toUpperCase();
}
applyLang();
document.getElementById('viewToggle').addEventListener('click', (e) => {
  e.stopPropagation();
  viewMode = viewMode === 'chase' ? 'cockpit' : 'chase';
  applyLang();
  try { store.setItem('vortex-view', viewMode); } catch (err) { /* ignore */ }
});
document.getElementById('langToggle').addEventListener('click', (e) => {
  e.stopPropagation();
  lang = lang === 'en' ? 'es' : 'en';
  applyLang();
  try { store.setItem('vortex-lang', lang); } catch (err) { /* ignore */ }
});

document.getElementById('crtToggle').addEventListener('click', (e) => {
  e.stopPropagation();
  crtOn = !crtOn;
  applyCrtState();
  try { store.setItem('vortex-crt', crtOn ? '1' : '0'); } catch (err) { /* ignore */ }
});

function applySettingsUI() {
  document.getElementById('flashToggle').textContent = 'FLASHING: ' + (settings.flash === 'reduced' ? 'REDUCED' : 'FULL');
  document.body.classList.toggle('calm', settings.flash === 'reduced');
  document.getElementById('glowToggle').textContent = 'GLOW: ' + settings.glow.toUpperCase();
  document.getElementById('vibeToggle').textContent = 'VIBRATION: ' + (settings.vibrate ? 'ON' : 'OFF');
  document.getElementById('musicVol').value = Math.round(settings.music * 100);
  document.getElementById('sfxVol').value = Math.round(settings.sfx * 100);
}
applySettingsUI();
document.getElementById('glowToggle').addEventListener('click', (e) => {
  e.stopPropagation();
  settings.glow = { auto: 'on', on: 'off', off: 'auto' }[settings.glow] || 'auto';
  glowActive = settings.glow !== 'off';
  lowFpsTime = 0; highFpsTime = 0;
  applySettingsUI();
  saveSettings();
});
document.getElementById('flashToggle').addEventListener('click', (e) => {
  e.stopPropagation();
  settings.flash = settings.flash === 'reduced' ? 'full' : 'reduced';
  applySettingsUI();
  saveSettings();
});
// the photosensitivity notice: shown once, after the title screens, the
// first time a game is about to start (before anything in play flashes).
// askFlashWarning(then) shows it and runs `then` once it's answered.
let afterFlashWarning = null;
function needsFlashWarning() {
  return !store.getItem('vortex-flash-warned');
}
function askFlashWarning(then) {
  afterFlashWarning = then;
  document.getElementById('flashwarn').classList.add('on');
}
function closeFlashWarning(reduce) {
  if (reduce) settings.flash = 'reduced';
  saveSettings();
  try { store.setItem('vortex-flash-warned', '1'); } catch (err) { /* ignore */ }
  applySettingsUI();
  document.getElementById('flashwarn').classList.remove('on');
  const then = afterFlashWarning;
  afterFlashWarning = null;
  if (then) then();
}
for (const [id, reduce] of [['warnOk', false], ['warnReduce', true]]) {
  document.getElementById(id).addEventListener('click', (e) => { e.stopPropagation(); closeFlashWarning(reduce); });
}
document.getElementById('flashwarn').addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
document.getElementById('vibeToggle').addEventListener('click', (e) => {
  e.stopPropagation();
  settings.vibrate = !settings.vibrate;
  applySettingsUI();
  saveSettings();
  vibrate(40); // a taste of it when switched on
});
document.getElementById('musicVol').addEventListener('input', (e) => {
  settings.music = e.target.value / 100;
  if (activeMusic) MUSIC_TRACKS[activeMusic].volume = MUSIC_VOLUME * settings.music;
  saveSettings();
});
document.getElementById('sfxVol').addEventListener('input', (e) => {
  settings.sfx = e.target.value / 100;
  if (sfxBus) sfxBus.gain.value = settings.sfx;
  saveSettings();
});
document.getElementById('sfxVol').addEventListener('change', () => { initAudio(); playZap(); }); // hear the new level
for (const el of document.querySelectorAll('#sliders input')) {
  el.addEventListener('click', (e) => e.stopPropagation());
  el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
}

// ---------- Achievements (saved as vortex-achievements) ----------
// Some unlock an extra ship colour (`unlocks` = SHIP_PALETTES index).
const ACHIEVEMENTS = {
  untouchable:  { name: 'NO EXCEPTIONS',  how: 'BEAT A BOSS WITHOUT TAKING DAMAGE', unlocks: 4 },
  sharpshooter: { name: 'O(1)', how: 'CLEAR A LEVEL WITH 70% ACCURACY', unlocks: 5 },
  survivor:     { name: 'UPTIME',     how: 'COMPLETE A SURVIVE MISSION', unlocks: 6 },
  rankS:        { name: 'SUDO',       how: 'FINISH A RUN WITH AN S RANK', unlocks: 7 },
  collector:    { name: 'GARBAGE COLLECTOR',    how: 'RECOVER ALL CORES WITHOUT LOSING ONE' },
  discmaster:   { name: 'TAIL CALL',  how: 'HIT 5 TARGETS WITH ONE DISC THROW' },
  riftwalker:   { name: 'STACK OVERFLOW',  how: 'REACH DEPTH 5 IN THE RIFT' },
  user:         { name: 'ROOT ACCESS',    how: 'BEAT THE CAMPAIGN' }
};
let achieved = {};
try { achieved = JSON.parse(store.getItem('vortex-achievements') || '{}') || {}; } catch (e) { achieved = {}; }

// ship accent colours (cosmetic, picked in the hangar): `main` is the hull
// line colour, `glow` the shadow/engine accent drawShip() and the swatch
// buttons both key off of
const SHIP_PALETTES = [
  { name: 'Violet',  main: '#e8d6ff', glow: '#a855ff' },
  { name: 'Crimson', main: '#ffd6e0', glow: '#ff3355' },
  { name: 'Cyan',    main: '#d6faff', glow: '#22ddff' },
  { name: 'Gold',    main: '#fff3d6', glow: '#ffbb22' },
  // unlockable
  { name: 'Ice',     main: '#ffffff', glow: '#bfe9ff' },
  { name: 'Toxic',   main: '#eaffd6', glow: '#7dff22' },
  { name: 'Sunset',  main: '#ffe3d6', glow: '#ff6a3d' },
  { name: 'Inferno', main: '#ffd6d6', glow: '#ff1a1a' },
];

// which achievement (if any) a palette is still locked behind
function paletteLock(i) {
  for (const [id, a] of Object.entries(ACHIEVEMENTS)) {
    if (a.unlocks === i && !achieved[id]) return a;
  }
  return null;
}
let shipPaletteIndex = 0;
try {
  const savedP = store.getItem('vortex-ship-palette');
  if (savedP !== null) {
    const idx = parseInt(savedP, 10);
    if (idx >= 0 && idx < SHIP_PALETTES.length && !paletteLock(idx)) shipPaletteIndex = idx;
  }
} catch (e) { /* storage unavailable, keep the default */ }

function shipArc() {
  // during lock-in the ship flies a tighter ring, further into the tunnel
  const k = 1 - 0.2 * lockinBlend;
  return { rx: Math.min(W * 0.42, H * 0.55) * k, ry: H * 0.4 * k };
}
function shipScreenPos(lane) {
  const { rx, ry } = shipArc();
  return { x: CX + Math.sin(lane) * rx, y: CY - Math.cos(lane) * ry };
}
// clamp an aim angle onto the lower half (the ship's arc)
function laneFromAim(a) {
  if (lockinTimer > 0) return a;
  if (Math.abs(a) >= Math.PI / 2) return a;
  return a >= 0 ? Math.PI / 2 : -Math.PI / 2;
}
function inShipLane(angle, width) {
  return Math.abs(normalizeAngle(angle - shipLane)) < (width || LANE_HIT);
}

function updatePlasmaUI() {
  const fill = document.getElementById('plasmafill');
  fill.style.width = (plasmaMax ? Math.min(1, plasma / plasmaMax) * 100 : 0) + '%';
  fill.classList.toggle('over', plasma > plasmaMax);
  const pf = document.getElementById('powerfill');
  pf.style.width = power + '%';
  pf.classList.toggle('full', power >= 100);
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
}

function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

// ---------- Ship classes (Spectre-style loadouts, picked on the title screen) ----------
// hull: max hull; boltSpeed: z units/s; holdFire: seconds between automatic
// shots while the button is held (0 = click to fire only); startTriple:
// seconds of triple laser at the start of every level; tripleMul scales
// triple-laser pickups; scale: drawn ship size.
const SHIP_CLASSES = [
  { name: 'VIPER', desc: 'BALANCED ALL-ROUNDER', hull: 150, boltSpeed: 0.9, holdFire: 0, startTriple: 0, tripleMul: 1, scale: 1 },
  { name: 'INTERCEPTOR', desc: 'HOLD TO AUTO-FIRE - FAST SHOTS - LIGHT HULL', hull: 110, boltSpeed: 1.35, holdFire: 0.14, startTriple: 0, tripleMul: 1, scale: 0.85 },
  { name: 'TANK', desc: 'HEAVY HULL - SLOW SHOTS', hull: 230, boltSpeed: 0.65, holdFire: 0, startTriple: 0, tripleMul: 1, scale: 1.18 },
  { name: 'GUNNER', desc: 'TRIPLE LASER AT EVERY LEVEL START', hull: 130, boltSpeed: 0.9, holdFire: 0, startTriple: 8, tripleMul: 1.5, scale: 1 }
];
let shipClassIndex = 0;
try {
  const savedClass = parseInt(store.getItem('vortex-ship-class'), 10);
  if (savedClass >= 0 && savedClass < SHIP_CLASSES.length) shipClassIndex = savedClass;
} catch (e) { /* storage unavailable, keep default */ }
function shipClass() {
  return SHIP_CLASSES[shipClassIndex];
}
function applyShipClass() {
  document.querySelectorAll('#shipclass button').forEach((btn, i) => {
    btn.classList.toggle('selected', i === shipClassIndex);
  });
  const cls = shipClass();
  document.getElementById('shipclassdesc').textContent = cls.desc + ' - HULL ' + cls.hull;
}

function applyShipPalette() {
  document.querySelectorAll('#shipcolor button').forEach((btn, i) => {
    const pal = SHIP_PALETTES[i];
    const lock = paletteLock(i);
    btn.style.color = pal.glow;
    btn.style.background = (i === shipPaletteIndex) ? pal.glow : 'transparent';
    btn.classList.toggle('selected', i === shipPaletteIndex);
    btn.classList.toggle('locked', !!lock);
    btn.title = lock ? 'LOCKED: ' + lock.how : pal.name.toUpperCase();
  });
  const got = Object.keys(ACHIEVEMENTS).filter(id => achieved[id]).length;
  document.getElementById('achievetag').textContent = 'ACHIEVEMENTS ' + got + '/' + Object.keys(ACHIEVEMENTS).length;
}
applyShipPalette();

applyShipClass();
document.querySelectorAll('#shipclass button').forEach((btn, i) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    shipClassIndex = i;
    applyShipClass();
    try { store.setItem('vortex-ship-class', String(i)); } catch (err) { /* ignore */ }
  });
});

document.querySelectorAll('#shipcolor button').forEach((btn, i) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const lock = paletteLock(i);
    if (lock) {
      document.getElementById('shipclassdesc').textContent = 'LOCKED - ' + lock.how;
      return;
    }
    shipPaletteIndex = i;
    applyShipPalette();
    try { store.setItem('vortex-ship-palette', String(i)); } catch (err) { /* ignore */ }
  });
});

// toasts queue up, so a mission, a streak and an achievement landing
// together are each shown in turn rather than overwriting one another
let toastQueue = [];
let toastBusy = false;
function showToast(text) {
  if (toastQueue[toastQueue.length - 1] === text) return;
  toastQueue.push(text);
  if (!toastBusy) nextToast();
}
function nextToast() {
  const el = document.getElementById('toast');
  const text = toastQueue.shift();
  if (text === undefined) { toastBusy = false; el.style.opacity = '0'; return; }
  toastBusy = true;
  el.textContent = text;
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; setTimeout(nextToast, 300); }, 2600);
}

function unlockAchievement(id) {
  if (achieved[id] || !ACHIEVEMENTS[id]) return;
  achieved[id] = true;
  try { store.setItem('vortex-achievements', JSON.stringify(achieved)); } catch (e) { /* ignore */ }
  const a = ACHIEVEMENTS[id];
  showToast('ACHIEVEMENT: ' + a.name + (a.unlocks !== undefined ? '\nNEW SHIP COLOR: ' + SHIP_PALETTES[a.unlocks].name.toUpperCase() : ''));
  playPowerUp();
  applyShipPalette();
}

// ---------- Save clip ----------
// The canvas (plus all game audio) is recorded by two overlapping
// MediaRecorders restarted every CLIP_SEGMENT seconds, so there's always
// one holding the last CLIP_SEGMENT..2*CLIP_SEGMENT seconds: SAVE CLIP
// stops the older one and downloads it. Only the canvas is captured, so
// the HTML HUD and CRT overlay aren't in the clip.
const CLIP_SEGMENT = 8;
let clipRecorders = []; // { rec, chunks, startedAt }
let clipSegmentTimer = 0;
const clipSupported = typeof MediaRecorder !== 'undefined' && !!canvas.captureStream;

function clipMime() {
  for (const m of ['video/webm;codecs=vp8', 'video/webm', 'video/mp4']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

function startClipRecorder() {
  try {
    const stream = canvas.captureStream(30);
    if (clipAudioDest) for (const track of clipAudioDest.stream.getAudioTracks()) stream.addTrack(track);
    const mimeType = clipMime();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 3000000 } : undefined);
    const entry = { rec, chunks: [], startedAt: performance.now() };
    rec.ondataavailable = (e) => { if (e.data && e.data.size) entry.chunks.push(e.data); };
    rec.start(1000);
    clipRecorders.push(entry);
  } catch (e) { /* recording unavailable: SAVE CLIP stays disabled */ }
}

function stopClipRecorders() {
  for (const entry of clipRecorders) { try { entry.rec.stop(); } catch (e) { /* ignore */ } }
  clipRecorders = [];
}

// keep the rolling pair going while a run (or its results screen) is up
function updateClipRecording(dt) {
  if (!clipSupported) return;
  const active = state === 'playing' || state === 'gameover' || state === 'cleared';
  if (!active) { if (clipRecorders.length) stopClipRecorders(); return; }
  clipSegmentTimer -= dt;
  if (clipSegmentTimer <= 0 || !clipRecorders.length) {
    clipSegmentTimer = CLIP_SEGMENT;
    startClipRecorder();
    while (clipRecorders.length > 2) {
      const old = clipRecorders.shift();
      try { old.rec.stop(); } catch (e) { /* ignore */ }
    }
  }
}

function saveClip(btn) {
  const entry = clipRecorders.shift(); // the oldest = longest clip
  if (!entry) return;
  btn.disabled = true;
  btn.textContent = 'SAVING...';
  entry.rec.onstop = () => {
    const type = entry.rec.mimeType || 'video/webm';
    const blob = new Blob(entry.chunks, { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'vortex-clip.' + (type.includes('mp4') ? 'mp4' : 'webm');
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    btn.textContent = 'SAVED!';
  };
  try { entry.rec.stop(); } catch (e) { btn.textContent = 'FAILED'; }
}

// ---------- Daily tunnel ----------
// Everyone gets the same seeded campaign each calendar day: enemy types,
// angles, waves, timers and pickups all draw from rng(), which is a
// date-seeded mulberry32 during a daily run (Math.random otherwise).
// Effects (sparks, voxels) keep Math.random. Best score per day is saved.
let daily = false;
// one independent stream per spawner, so frame-timing differences in when
// one spawner fires can't shift another's sequence
let rngStates = {};
function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function seedDaily() {
  rngStates = {};
}
function rng(stream) {
  if (!daily && !versus) return Math.random();
  stream = stream || 'misc';
  if (rngStates[stream] === undefined) {
    // seed = today's date mixed with the stream name
    let h = versus ? vsSeed >>> 0 : parseInt(todayKey().replace(/-/g, ''), 10) >>> 0;
    for (const ch of stream) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0;
    rngStates[stream] = h;
  }
  rngStates[stream] = (rngStates[stream] + 0x6D2B79F5) >>> 0;
  let x = rngStates[stream];
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}
function dailyBest() {
  try { return parseInt(store.getItem('vortex-daily-' + todayKey()), 10) || 0; } catch (e) { return 0; }
}
function recordDaily() {
  if (!daily || score <= dailyBest()) return;
  try { store.setItem('vortex-daily-' + todayKey(), String(score)); } catch (e) { /* ignore */ }
}
function updateDailyBtn() {
  const best = dailyBest();
  document.getElementById('dailyBtn').textContent = 'DAILY TUNNEL ' + todayKey() + (best ? '   BEST ' + best : '');
}

function shareResult(btn) {
  const r = runRank(state === 'cleared');
  const url = location.origin + location.pathname + (daily ? '?daily' : '');
  const what = daily ? 'VORTEX DAILY TUNNEL ' + todayKey() : gameMode === 'rift' ? 'VORTEX: THE RIFT, DEPTH ' + riftDepth : 'VORTEX';
  const text = what + ': ' + score + ' PTS, RANK ' + r.letter + '. CAN YOU BEAT IT?';
  if (navigator.share) {
    navigator.share({ title: 'VORTEX', text, url }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text + ' ' + url).then(() => { btn.textContent = 'COPIED!'; }, () => {});
  }
}

// ---------- Run stats + rank ----------
let runShots = 0, runHits = 0, runDamage = 0;
let levelShots = 0, levelHits = 0;
let bossFightDamage = 0;
let coresLost = 0;

function runRank(won) {
  const progress = gameMode === 'rift'
    ? Math.min(1, (riftDepth - 1) / 9)
    : Math.min(1, (currentLevel - 1 + (won ? 1 : missionProgress())) / LEVEL_COUNT);
  const accuracy = runShots ? Math.min(1, runHits / runShots) : 0;
  const clean = 1 - Math.min(1, runDamage / (hullMax * 1.5));
  const points = progress * 55 + accuracy * 25 + clean * 20;
  const letter = points >= 85 ? 'S' : points >= 70 ? 'A' : points >= 50 ? 'B' : points >= 30 ? 'C' : 'D';
  return { letter, accuracy, points };
}

const RANK_COLORS = { S: '#ffe14d', A: '#3f6', B: '#22ddff', C: '#a855ff', D: '#ff3355' };
function showRank(elId, won) {
  const r = runRank(won);
  const el = document.getElementById(elId);
  el.style.color = RANK_COLORS[r.letter];
  el.style.textShadow = '0 0 24px ' + RANK_COLORS[r.letter];
  el.innerHTML = r.letter + '<small>ACCURACY ' + Math.round(r.accuracy * 100) + '%   DAMAGE TAKEN ' + Math.round(runDamage)
    + '<br>+' + runCoins + ' COINS (' + coins + ' TOTAL)</small>';
  if (r.letter === 'S') unlockAchievement('rankS');
  return r;
}

// ---------- Best score / furthest run tracker (saved, title screen) ----------
let bestScore = 0;
let bestRunTier = 0; // highest New-Game-Plus depth ever reached (0 = run 1)
try {
  const savedScore = store.getItem('vortex-best-score');
  if (savedScore !== null) bestScore = parseInt(savedScore, 10) || 0;
  const savedRun = store.getItem('vortex-best-run');
  if (savedRun !== null) bestRunTier = parseInt(savedRun, 10) || 0;
} catch (e) { /* storage unavailable, keep defaults */ }

function updateBestTag() {
  const el = document.getElementById('besttag');
  if (!el) return;
  el.textContent = bestScore > 0
    ? 'BEST ' + bestScore + '   FURTHEST: RUN ' + (bestRunTier + 1)
    : '';
  if (bestRiftDepth > 0) el.textContent = (el.textContent + '\nRIFT: DEPTH ' + bestRiftDepth + '   BEST ' + bestRiftScore).trim();
}
updateBestTag();

function recordRunResult() {
  if (versus) return; // versus scores don't count toward the solo records
  if (gameMode === 'rift') {
    // the Rift keeps its own records: its multiplied scores would swamp
    // the campaign's best score otherwise
    if (riftDepth > bestRiftDepth) bestRiftDepth = riftDepth;
    if (score > bestRiftScore) bestRiftScore = score;
    try {
      store.setItem('vortex-best-rift-depth', String(bestRiftDepth));
      store.setItem('vortex-best-rift-score', String(bestRiftScore));
    } catch (err) { /* ignore */ }
    updateBestTag();
    return;
  }
  let changed = false;
  if (score > bestScore) { bestScore = score; changed = true; }
  if (runTier > bestRunTier) { bestRunTier = runTier; changed = true; }
  if (changed) {
    try {
      store.setItem('vortex-best-score', String(bestScore));
      store.setItem('vortex-best-run', String(bestRunTier));
    } catch (err) { /* ignore */ }
    updateBestTag();
  }
}

// ---------- Screen shake (impact juice on hits/damage/boss kills) ----------
let shakeTimer = 0;
let shakeMag = 0;
function triggerShake(magnitude, duration) {
  if (settings.flash === 'reduced') magnitude *= 0.35;
  shakeMag = Math.max(shakeMag, magnitude);
  shakeTimer = Math.max(shakeTimer, duration);
}
