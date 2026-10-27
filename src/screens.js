// VORTEX - Start screens, tutorial and pause.
// Plain script, loaded in order by index.html; shares globals with the others.

// ---------- Touch vs mouse wording ----------
const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.getElementById('presshint').textContent = isTouch ? 'TAP TO START' : 'PRESS START';
if (isTouch) document.getElementById('hudzap').style.display = 'none';
// ---------- Start screens: splash -> menu -> hangar / multiplayer / settings ----------
let titleScreen = 'splash';
function showScreen(name) {
  titleScreen = name;
  document.querySelectorAll('#title .screen').forEach(sc => sc.classList.toggle('active', sc.dataset.screen === name));
  if (name === 'menu') {
    updateLoadout();
    const cb = document.getElementById('continueBtn');
    cb.style.display = checkpoint ? 'block' : 'none';
    cb.textContent = 'CONTINUE: ' + checkpointLabel();
    document.getElementById('playBtn').classList.toggle('primary', !checkpoint);
  }
  if (name === 'shop') renderShop();
  if (name === 'missions') renderMissions();
  if (name === 'board') renderBoard();
  const doneCount = missionState.active.filter(m => m.p >= m.n).length;
  document.getElementById('missionsBtn').textContent = 'MISSIONS (' + doneCount + '/3) >';
  document.getElementById('shopBtn').textContent = 'UPGRADES (' + coins + ' C) >';
  document.getElementById('title').scrollTop = 0;
}
function updateLoadout() {
  document.getElementById('loadout').textContent =
    playerName() + ' - ' + shipClass().name + ' - ' + SHIP_PALETTES[shipPaletteIndex].name.toUpperCase() + ' - ' + difficultySetting.toUpperCase();
}
// any tap on the splash (or on the canvas behind it) moves on to the menu
function titleTap() {
  initAudio();
  if (titleScreen === 'splash') {
    showScreen('menu');
    playZap();
    setMusicTrack('garden'); // first tap: the title theme starts streaming
  }
}
document.querySelectorAll('#title [data-go]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    readPilotName();
    showScreen(btn.dataset.go);
    playZap();
  });
});
document.getElementById('continueBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  continueFromCheckpoint();
});
document.getElementById('contFromLost').addEventListener('click', (e) => {
  e.stopPropagation();
  continueFromCheckpoint();
});
document.getElementById('playBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  initAudio();
  startGame(false, 'campaign');
});
// back to the menu from a results screen
// ---- first-run tutorial ----
// The first campaign run starts with a short guided warm-up on level 1: one
// instruction at a time, each waiting for the pilot to actually do it (no
// regular spawns meanwhile, and the hull can't drop below half). Skippable,
// shown once (vortex-tutorial), replayable from SETTINGS.
const TUTORIAL_STEPS = [
  { id: 'aim',
    en: () => isTouch ? 'DRAG TO AIM. YOUR SHIP SLIDES ALONG THE BOTTOM OF THE TUNNEL.' : 'MOVE THE MOUSE TO AIM. YOUR SHIP SLIDES ALONG THE BOTTOM OF THE TUNNEL.',
    es: () => isTouch ? 'ARRASTRA PARA APUNTAR. TU NAVE SE DESLIZA POR LA PARTE BAJA DEL TUNEL.' : 'MUEVE EL MOUSE PARA APUNTAR. TU NAVE SE DESLIZA POR LA PARTE BAJA DEL TUNEL.' },
  { id: 'fire',
    en: () => isTouch ? 'TAP TO FIRE ALONG THE YELLOW AIM LINE.' : 'CLICK TO FIRE ALONG THE YELLOW AIM LINE.',
    es: () => isTouch ? 'TOCA PARA DISPARAR SOBRE LA LINEA AMARILLA.' : 'HAZ CLIC PARA DISPARAR SOBRE LA LINEA AMARILLA.' },
  { id: 'kill',
    en: () => 'THREE HOSTILES INCOMING. SHOOT THEM DOWN.',
    es: () => 'TRES HOSTILES EN CAMINO. DERRIBALOS.' },
  { id: 'dodge',
    en: () => 'ONLY WHAT REACHES YOUR LANE HURTS YOU. SLIDE OUT OF THE WAY OF THIS ONE.',
    es: () => 'SOLO TE DANA LO QUE LLEGA A TU CARRIL. QUITATE DEL CAMINO DE ESTE.' },
  { id: 'pickup',
    en: () => 'PICKUPS GIVE YOU POWERS. SHOOT IT OR FLY INTO IT.',
    es: () => 'LOS OBJETOS TE DAN PODERES. DISPARALE O VUELA HACIA EL.' },
  { id: 'coins',
    en: () => 'COINS! STEER INTO THEIR LANE AND FLY THROUGH THEM. THEY LIGHT UP WHEN YOU ARE LINED UP.',
    es: () => '¡MONEDAS! PONTE EN SU CARRIL Y ATRAVIESALAS. SE ILUMINAN CUANDO ESTAS ALINEADO.' },
  { id: 'bomb',
    en: () => isTouch ? 'SURROUNDED? TAP BOMB TO CLEAR THE SCREEN.' : 'SURROUNDED? PRESS SPACE (OR RIGHT-CLICK) TO DROP A BOMB.',
    es: () => isTouch ? '¿RODEADO? TOCA BOMB PARA LIMPIAR LA PANTALLA.' : '¿RODEADO? PRESIONA ESPACIO (O CLIC DERECHO) PARA SOLTAR UNA BOMBA.' },
  { id: 'lockin',
    en: () => isTouch ? 'KILLS FILL YOUR POWER BAR. IT IS FULL: TAP LOCK FOR LOCK-IN.' : 'KILLS FILL YOUR POWER BAR. IT IS FULL: PRESS L FOR LOCK-IN.',
    es: () => isTouch ? 'LAS BAJAS LLENAN TU BARRA DE PODER. ESTA LLENA: TOCA LOCK.' : 'LAS BAJAS LLENAN TU BARRA DE PODER. ESTA LLENA: PRESIONA L.' }
];
let tutorial = null; // { step, t, aimFrom, shots, kills, done }
let tutorialDone = false;
try {
  // pilots who already have a best score have played: don't make them sit it
  tutorialDone = !!store.getItem('vortex-tutorial') || !!store.getItem('vortex-best-score');
} catch (e) { /* ignore */ }

function maybeStartTutorial() {
  if (tutorialDone || gameMode !== 'campaign' || daily || versus || runTier > 0) return;
  tutorial = { step: -1 };
  briefingTimer = 0;
  document.getElementById('briefing').style.opacity = '0';
  document.getElementById('coach').style.display = 'block';
  nextTutorialStep();
}

function nextTutorialStep() {
  tutorial.step += 1;
  tutorial.t = 0;
  tutorial.done = false;
  const step = TUTORIAL_STEPS[tutorial.step];
  if (!step) { stopTutorial(false); return; }
  document.getElementById('coachstep').textContent = (lang === 'es' ? 'ENTRENAMIENTO ' : 'TRAINING ') + (tutorial.step + 1) + '/' + TUTORIAL_STEPS.length;
  document.getElementById('coachtext').textContent = arcadeCaps(lang === 'es' ? step.es() : step.en());
  tutorial.aimFrom = shipLane;
  tutorial.shots = levelShots;
  tutorial.kills = killCount;
  if (step.id === 'kill') {
    for (const off of [-0.5, 0, 0.5]) {
      spawnEnemy(normalizeAngle(Math.PI + off), 'drone');
      enemies.at(-1).z = 0.95;
      enemies.at(-1).speed *= 0.6;
    }
  } else if (step.id === 'dodge') {
    // one drone straight down the ship's own lane
    spawnEnemy(shipLane, 'drone');
    enemies.at(-1).z = 0.9;
    enemies.at(-1).fireTimer = 99;
  } else if (step.id === 'pickup') {
    powerups.push({ angle: normalizeAngle(shipLane + 0.3), z: 0.9, alive: true, kind: 'star' });
  } else if (step.id === 'coins') {
    // a row off to one side, so you have to steer to it
    const angle = normalizeAngle(shipLane + (shipLane > Math.PI / 2 || shipLane < -Math.PI / 2 ? 0.9 : -0.9));
    tutorial.coins = runCoins;
    tutorial.coinAngle = Math.abs(angle) < Math.PI / 2 ? normalizeAngle(Math.PI - 0.9) : angle;
    for (let k = 0; k < 5; k++) trackItems.push({ kind: 'coin', angle: tutorial.coinAngle, z: 0.8 + k * 0.05 });
  } else if (step.id === 'bomb') {
    zapperCharges = Math.max(1, zapperCharges);
    updateZapUI();
    for (let i = 0; i < 6; i++) {
      spawnEnemy(normalizeAngle(Math.PI + (i - 2.5) * 0.45), 'drone');
      enemies.at(-1).z = 0.75 + i * 0.03;
      enemies.at(-1).speed *= 0.4;
    }
  } else if (step.id === 'lockin') {
    power = 100;
    updatePlasmaUI();
  }
}

function tutorialEvent(kind) {
  if (!tutorial || tutorial.done) return;
  const id = TUTORIAL_STEPS[tutorial.step].id;
  if (kind === id || (id === 'kill' && kind === 'bomb')) completeTutorialStep();
}

function completeTutorialStep() {
  tutorial.done = true;
  tutorial.t = 0;
  shipCallout(lang === 'es' ? '¡BIEN!' : 'NICE!', '#ffe14d');
  playPowerUp();
}

function updateTutorial(dt) {
  if (!tutorial) return;
  if (state !== 'playing') { stopTutorial(true); return; }
  if (paused) return;
  tutorial.t += dt;
  // a short beat after each success before the next instruction
  if (tutorial.done) { if (tutorial.t > 1.1) nextTutorialStep(); return; }
  hull = Math.max(hull, hullMax * 0.5);
  const id = TUTORIAL_STEPS[tutorial.step].id;
  if (id === 'aim' && Math.abs(normalizeAngle(shipLane - tutorial.aimFrom)) > 0.6) completeTutorialStep();
  else if (id === 'fire' && levelShots - tutorial.shots >= 3) completeTutorialStep();
  else if (id === 'kill' && !enemies.length) completeTutorialStep();
  else if (id === 'dodge' && !enemies.length) {
    // got hit instead: that's the lesson too, move on
    completeTutorialStep();
  } else if (id === 'pickup' && !powerups.length) completeTutorialStep();
  else if (id === 'coins' && (runCoins - tutorial.coins >= 3 || !trackItems.some(i => i.kind === 'coin' && !i.done))) completeTutorialStep();
  else if (id === 'bomb' && !enemies.length) completeTutorialStep();
  else if (id === 'lockin' && tutorial.t > 12) completeTutorialStep();
}

// quiet: leave without the hand-off (game over, menu, continue)
function stopTutorial(quiet) {
  if (!tutorial) return;
  tutorial = null;
  tutorialDone = true;
  try { store.setItem('vortex-tutorial', '1'); } catch (e) { /* ignore */ }
  document.getElementById('coach').style.display = 'none';
  if (quiet || state !== 'playing') return;
  // the real level 1 starts clean: count, bomb and power back to normal
  enemies = [];
  enemyBolts = [];
  killCount = 0;
  score = 0;
  document.getElementById('score').textContent = score;
  hull = hullMax;
  plasma = plasmaMax;
  power = Math.min(power, 99);
  zapperCharges = 1 + up('bomb');
  levelShots = 0;
  levelHits = 0;
  updateHullUI();
  updatePlasmaUI();
  updateZapUI();
  startLevelMission();
  say('tutorialDone', { en: ['TRAINING COMPLETE. NOW FOR REAL, PILOT.', 'THAT IS ALL YOU NEED. GOOD HUNTING.'], es: ['ENTRENAMIENTO COMPLETO. AHORA EN SERIO, PILOTO.', 'ES TODO LO QUE NECESITAS. BUENA CACERIA.'] }, 3, 0);
}

document.getElementById('coachskip').addEventListener('click', (e) => { e.stopPropagation(); stopTutorial(false); });
document.getElementById('coachskip').addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
document.getElementById('coachskip').addEventListener('mousedown', (e) => e.stopPropagation());
document.getElementById('tutorialBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  initAudio();
  tutorialDone = false;
  startGame(false, 'campaign');
});

// ---- pause ----
// P / Esc / the II button, and automatically whenever the app is hidden
// (phone lock, tab switch, notification shade). Not in versus: the other
// player's run keeps going, so a pause there would just hand them the win.
let paused = false;
let pausedTracks = [];
function canPause() {
  return state === 'playing' && !versus;
}
function pauseGame() {
  if (paused || !canPause()) return;
  paused = true;
  pointerHeld = false;
  document.body.classList.add('paused');
  pausedTracks = Object.values(MUSIC_TRACKS).filter(el => !el.paused);
  for (const el of pausedTracks) el.pause();
  if (actx && actx.state === 'running') actx.suspend().catch(() => {});
}
function resumeGame() {
  if (!paused) return;
  paused = false;
  pointerHeld = false;
  document.body.classList.remove('paused');
  if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
  for (const el of pausedTracks) el.play().catch(() => {});
  pausedTracks = [];
  lastTime = performance.now(); // no giant frame step after the break
}
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
window.addEventListener('blur', pauseGame);
document.getElementById('pauseBtn').addEventListener('click', (e) => { e.stopPropagation(); pauseGame(); });
document.getElementById('resumeBtn').addEventListener('click', (e) => { e.stopPropagation(); resumeGame(); });
document.getElementById('pauseMenuBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  resumeGame();
  backToMenu();
});
for (const id of ['pause', 'pauseBtn']) {
  document.getElementById(id).addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
}

function backToMenu() {
  if (versus && vsConn) { try { vsConn.close(); } catch (err) { /* ignore */ } }
  versus = false;
  state = 'title';
  for (const id of ['gameover', 'cleared']) document.getElementById(id).style.display = 'none';
  // leaving mid-run: clear the run's banner and briefing off the menu
  document.getElementById('levelbanner').style.opacity = '0';
  document.getElementById('briefing').style.opacity = '0';
  briefingTimer = 0;
  document.getElementById('title').style.display = '';
  showScreen('menu');
  setMusicTrack('garden');
}
// the HUD only shows while a run (or its results) is on screen
const pauseBtnEl = document.getElementById('pauseBtn');
function syncRunClass() {
  document.body.classList.toggle('inrun', state === 'playing' || state === 'gameover' || state === 'cleared');
  document.body.classList.toggle('playing', canPause());
  document.body.classList.toggle('cockpitview', viewMode === 'cockpit' && state === 'playing');
  if (viewMode === 'cockpit') {
    const L = cockpitLayout();
    const vars = { '--cp-dash': (H - L.vy1) + 'px', '--cp-side': (L.m + L.side) + 'px', '--cp-top': L.top + 'px' };
    for (const k in vars) if (document.body.style.getPropertyValue(k) !== vars[k]) document.body.style.setProperty(k, vars[k]);
  }
  // the pause button sits just under the radar, whose size follows the screen
  const top = Math.round(2 * Math.max(38, Math.min(62, Math.min(W, H) * 0.09)) + 30) + 'px';
  if (pauseBtnEl.style.top !== top) pauseBtnEl.style.top = top;
}

// a first visit (or a broken save) gets its first three missions; this
// runs here because dealing them needs LEVEL_COUNT, declared further up
if (!missionState.active || missionState.active.length !== 3) dealMissions();

// daily tunnel, clip and share buttons (wired last: they use the sections above)
updateDailyBtn();
document.getElementById('dailyBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  initAudio();
  startGame(false, 'daily');
});
// a shared ?daily link highlights the daily tunnel on the title screen
if (/[?&]daily\b/.test(location.search)) {
  document.getElementById('dailyBtn').classList.add('challenged');
}
for (const btn of document.querySelectorAll('.clipBtn')) {
  btn.disabled = !clipSupported;
  btn.addEventListener('click', (e) => { e.stopPropagation(); saveClip(btn); });
}
for (const btn of document.querySelectorAll('.shareBtn')) {
  btn.addEventListener('click', (e) => { e.stopPropagation(); shareResult(btn); });
}
for (const btn of document.querySelectorAll('.menuBtn')) {
  btn.addEventListener('click', (e) => { e.stopPropagation(); backToMenu(); });
}
document.getElementById('coopBtn').addEventListener('click', (e) => { e.stopPropagation(); lobbyKind = 'coop'; openLobby(); });
document.getElementById('versusBtn').addEventListener('click', (e) => { e.stopPropagation(); openVersusLobby(); });
document.getElementById('lobbyAccept').addEventListener('click', (e) => {
  e.stopPropagation();
  if (lobbyKind === 'cyjoin') joinCycles(e); else acceptVersus(e);
});
document.getElementById('cyclesBtn').addEventListener('click', (e) => { e.stopPropagation(); readPilotName(); lobbyKind = 'cycles'; openLobby(); });
document.getElementById('lobbyStart').addEventListener('click', (e) => { e.stopPropagation(); startCycles(); });
if (cyJoinId) {
  lobbyKind = 'cyjoin';
  openLobby();
}
// opened from a versus QR code: go straight to the challenge screen
if (vsJoinId || cyJoinId || /[?&]daily\b/.test(location.search)) showScreen('menu');
if (vsJoinId) {
  lobbyKind = 'join';
  openLobby();
}
for (const ev of ['click', 'mousedown', 'touchstart']) {
  document.getElementById('lobby').addEventListener(ev, (e) => e.stopPropagation());
}
document.getElementById('lobbyClose').addEventListener('click', () => {
  document.getElementById('lobby').style.display = 'none';
});
