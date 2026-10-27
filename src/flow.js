// VORTEX - Starting and ending runs, spawning, commander transmissions.
// Plain script, loaded in order by index.html; shares globals with the others.

// ---------- Game Flow ----------
// continuing = true means this run follows a win (New-Game-Plus escalation
// stays/steps up); false means a fresh start or a retry after a loss, which
// drops the escalation back to the base difficulty.
// mode: 'campaign' | 'rift'. When omitted, retrying from the game-over
// screen replays whichever mode was just lost; anything else is campaign.
function startGame(continuing, mode) {
  // first game ever: the photosensitivity notice comes first (not in a
  // versus match, which the other player has already started)
  if (needsFlashWarning() && mode !== 'versus') { askFlashWarning(() => startGame(continuing, mode)); return; }
  // a daily run is a seeded campaign; retrying from its game over stays daily
  // in a versus match, clicking the results screen asks for a rematch instead
  if (versus && mode === undefined && (state === 'gameover' || state === 'cleared')) {
    if (requestRematch()) return;
  }
  versus = mode === 'versus';
  if (versus) { mode = 'rift'; vsKills = 0; vsIncoming = 0; }
  daily = mode === 'daily' || (mode === undefined && state === 'gameover' && daily);
  if (mode === 'daily') mode = 'campaign';
  if (mode === undefined) mode = state === 'gameover' ? gameMode : 'campaign';
  if (daily || versus) seedDaily();
  runT = 0;
  env = 'tube';
  Object.assign(envK, ENV.tube);
  // results screens back to their normal wording
  document.getElementById('wontitle').textContent = 'SIGNAL SECURED';
  document.getElementById('wonhint').textContent = 'CLICK TO PUSH DEEPER';
  document.getElementById('riftFromCleared').style.display = '';
  document.getElementById('losttitle').textContent = 'SIGNAL LOST';
  document.getElementById('losthint').textContent = 'CLICK TO RETRY';
  document.getElementById('vspanel').style.display = versus ? 'flex' : 'none';
  stopClipRecorders();
  for (const btn of document.querySelectorAll('.clipBtn')) { btn.disabled = !clipSupported; btn.textContent = 'SAVE CLIP'; }
  for (const btn of document.querySelectorAll('.shareBtn')) btn.textContent = 'SHARE';
  gameMode = mode;
  riftDepth = 1;
  runTier = continuing && mode === 'campaign' ? runTier + 1 : 0;
  score = 0;
  killCount = 0;
  nextMinibossIndex = 0;
  hullMax = shipClass().hull;
  hull = hullMax;
  plasmaMax = Math.round(hullMax * PLASMA_FRACTION * (1 + 0.15 * up('plasma')));
  plasma = plasmaMax;
  plasmaHitAt = -99;
  power = 0;
  if (!continuing) runCoins = 0;
  checkStreak();
  document.getElementById('hudcoins').textContent = runCoins ? 'COINS ' + runCoins : '';
  lockinTimer = 0;
  lockinBlend = 0;
  trackItems = [];
  trackTimer = 6;
  boostTimer = 0; brakeTimer = 0; tripTimer = 0; inkTimer = 0; teleportHold = 0; x2Timer = 0; passRings = [];
  lockinAnnounced = false;
  shipLane = Math.PI;
  shipLaneVel = 0;
  aimAngle = Math.PI; // start aimed down the floor, so the ship sits bottom-centre
  // a continued (New Game Plus) run keeps its stats so the rank covers it all
  if (!continuing) { runShots = 0; runHits = 0; runDamage = 0; }
  damageFlash = 0;
  currentLevel = 1;
  bossActive = false;
  boss = null;
  tunnelSidesTarget = computeShapeStage();
  tunnelSides = tunnelSidesTarget;
  document.getElementById('score').textContent = score;
  updateObjectiveUI();
  document.getElementById('levelnum').textContent = currentLevel;
  document.getElementById('levellabel').textContent = gameMode === 'rift' ? 'DEPTH' : 'LVL';
  tripleLaserTimer = 0;
  novaFlash = 0;
  shipX = 0;
  shipVX = 0;
  shipRecoil = 0;
  shipHitWobble = 0;
  echoTimer = 0;
  echoQueue = [];
  discCharges = 0;
  disc = null;
  echoTrail = [];
  warpTimer = 0;
  spikes = [];
  pointerHeld = false;
  briefingTimer = 0;
  cores = [];
  missionType = 'destroy';
  updateHullUI();
  updatePlasmaUI();
  updateBossUI();
  updateRunUI();
  updateTripleUI();
  bolts = [];
  enemies = [];
  enemyBolts = [];
  powerups = [];
  particles = [];
  swellRings = [];
  ruttHistory = [];
  bitBursts = [];
  voxels = [];
  shipShattered = false;
  hitLabels = [];
  pulses = [];
  spawnTimer = 0;
  clusterTimer = 8 + rng('enemy') * 6;
  formationTimer = 14 + rng('enemy') * 6;
  powerupTimer = 6 + rng('powerup') * 4;
  difficulty = 1;
  state = 'playing';
  document.getElementById('hud').style.display = '';
  document.getElementById('title').style.display = 'none';
  document.getElementById('gameover').style.display = 'none';
  document.getElementById('cleared').style.display = 'none';
  showLevelBanner(runTier > 0 ? 'RUN ' + (runTier + 1) : 'LEVEL 1');
  if (gameMode === 'rift') enterRiftSector();
  onLevelStart();
  tutorial = null;
  document.getElementById('coach').style.display = 'none';
  if (!continuing) maybeStartTutorial();
  for (const key in commsCooldowns) delete commsCooldowns[key];
  comms = null;
  lastShotTime = t;
  killStreak = 0;
  if (versus) {
    say('vsStart', { en: 'VERSUS ' + vsName + '. LAST PROGRAM FLYING WINS.', es: 'CONTRA ' + vsName + '. GANA EL ULTIMO PROGRAMA EN PIE.' }, 3, 0);
  } else if (gameMode === 'rift') {
    hack('riftHack', { en: 'WELCOME TO MY RIFT, PILOT. NOBODY LEAVES.', es: 'BIENVENIDO A MI GRIETA, PILOTO. NADIE SALE.' }, 3, 0);
  } else say('start', gameMode === 'rift'
    ? ["YOU'RE ON YOUR OWN OUT HERE, PILOT.", 'NO WAY BACK FROM THE RIFT. GOOD LUCK.']
    : runTier > 0
      ? ['AGAIN, PILOT. THEY KNOW YOU NOW.', 'DEEPER THIS TIME. THEY WILL BE READY.']
      : ['STAY SHARP, PILOT. HERE THEY COME.', 'ENTERING THE VORTEX. WEAPONS FREE!', 'ENGAGE.', 'I HAVE A VERY BAD FEELING ABOUT THIS ONE.'], 2, 0);
  setMusicTrack(gameplayTrack());
}

function updateRunUI() {
  const el = document.getElementById('hudrun');
  if (versus) {
    el.textContent = 'VERSUS  x' + riftMultiplier();
    el.style.display = 'block';
  } else if (gameMode === 'rift') {
    el.textContent = 'THE RIFT  x' + riftMultiplier();
    el.style.display = 'block';
  } else if (daily) {
    el.textContent = 'DAILY ' + todayKey();
    el.style.display = 'block';
  } else if (runTier > 0) {
    el.textContent = 'RUN ' + (runTier + 1);
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

function endGame() {
  if (versus) {
    vsSend({ t: 'vs-dead', score });
  }
  // the ship shatters into a big cloud of its own colour
  const deathPos = shipScreenPos(shipLane);
  shatter(deathPos.x, deathPos.y, hexToRgb(SHIP_PALETTES[shipPaletteIndex].main), 160, 2.5);
  shipShattered = true;
  state = 'gameover';
  document.getElementById('briefing').style.opacity = '0';
  updateZapUI();
  recordRunResult();
  showRank('rankLost', false);
  document.getElementById('contFromLost').style.display = (gameMode === 'campaign' && !daily && !versus && checkpoint) ? 'block' : 'none';
  document.getElementById('contFromLost').textContent = 'CONTINUE FROM ' + checkpointLabel();
  if (versus) {
    document.getElementById('losttitle').textContent = 'DEFEATED';
    document.getElementById('losthint').textContent = vsConn ? 'CLICK FOR A REMATCH' : 'CLICK TO RETRY';
  }
  recordDaily();
  updateDailyBtn();
  document.getElementById('finalscore').textContent = versus
    ? vsName + ' OUTLASTED YOU.  YOU ' + score
    : gameMode === 'rift'
    ? 'SCORE: ' + score + '   DEPTH: ' + riftDepth
    : 'SCORE: ' + score + '   ' + objectiveParts()[0] + ': ' + objectiveParts()[1] + '/' + objectiveParts()[2];
  document.getElementById('gameover').style.display = 'block';
  setMusicTrack('garden');
}

function winGame() {
  state = 'cleared';
  document.getElementById('briefing').style.opacity = '0';
  updateZapUI();
  recordRunResult();
  unlockRift();
  unlockAchievement('user');
  clearCheckpoint();
  showRank('rankWon', true);
  recordDaily();
  updateDailyBtn();
  document.getElementById('clearedscore').textContent = 'SCORE: ' + score + '   NEXT: RUN ' + (runTier + 2) + ' (HARDER)';
  document.getElementById('cleared').style.display = 'block';
  setMusicTrack('garden');
}

// ---------- Update ----------
let lastTime = performance.now();

function pickEnemyType() {
  if (gameMode === 'rift' && riftMix) {
    if (env === 'asteroid' && rng('enemy') < 0.3) return 'rock';
    let roll = rng('enemy') * (riftMix.drone + riftMix.weaver + riftMix.shooter + riftMix.pentagram);
    for (const type of ['drone', 'weaver', 'shooter', 'pentagram']) {
      roll -= riftMix[type];
      if (roll < 0) return type;
    }
    return 'drone';
  }
  const roll = rng('enemy');
  // the environment tilts the mix: trenches are lined with turrets
  // (shooters), asteroid fields are full of tumbling rocks
  if (env === 'trench' && roll < 0.45) return 'shooter';
  if (env === 'asteroid' && roll < 0.35) return 'rock';
  if (currentLevel === 1) return 'drone';
  if (currentLevel === 2) return roll < 0.65 ? 'drone' : 'weaver';
  // level 3+: the galaxy's getting pulled apart out here, and something
  // hellish is riding the current in with everything else
  if (roll < 0.42) return 'drone';
  if (roll < 0.68) return 'weaver';
  if (roll < 0.88) return 'shooter';
  return 'pentagram';
}

function spawnEnemy(angleOverride, typeOverride) {
  const params = getDiffParams();
  const type = typeOverride || pickEnemyType();
  const angle = angleOverride !== undefined ? angleOverride : rng('enemy') * Math.PI * 2;
  const droneShapes = ['tri', 'hex', 'ring'];
  const shape = type === 'shooter' ? 'square' : type === 'weaver' ? 'squid' : type === 'rock' ? 'rock'
    : type === 'pentagram' ? 'pentagram'
    : droneShapes[Math.floor(rng('enemy') * droneShapes.length)];
  // shooters hang back and fire instead; pentagrams are slow, deliberate, unstoppable-feeling
  const speedMul = type === 'shooter' ? 0.65 : type === 'pentagram' ? 0.8 : type === 'rock' ? 0.7 : 1;
  const e = {
    angle, z: 1.0, shape, type, alive: true,
    baseAngle: angle, phase: rng('enemy') * Math.PI * 2,
    speed: (params.speedBase + rng('enemy') * params.speedVar * difficulty) * speedMul
  };
  if (type === 'shooter') e.fireTimer = 1.6 + rng('enemy') * 1.4;
  if (type === 'pentagram') e.hp = 2; // takes two hits, a real threat to clear
  if (type === 'rock') e.hp = 3;      // asteroids take a few hits to break
  enemies.push(e);
}

function spawnCluster() {
  const center = rng('enemy') * Math.PI * 2;
  for (const off of [-0.3, 0, 0.3]) spawnEnemy(center + off, 'drone');
}

// Classic Space-Invaders-style grid wave: a block of enemies that holds
// formation and sways side to side together as it marches inward.
function spawnFormation() {
  const params = getDiffParams();
  const center = rng('enemy') * Math.PI * 2;
  const formSeed = rng('enemy') * Math.PI * 2;
  const speed = params.speedBase * 0.8 + rng('enemy') * params.speedVar * difficulty * 0.4;
  const cols = 3, rows = 2;
  const colSpacing = 0.26, rowSpacing = 0.09;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const baseAngle = normalizeAngle(center + (c - (cols - 1) / 2) * colSpacing);
      enemies.push({
        angle: baseAngle, z: 1.0 + r * rowSpacing, shape: 'invader', type: 'grid',
        alive: true, baseAngle, phase: 0, formSeed, speed
      });
    }
  }
}

// How long a star pickup's triple-laser spread lasts.
const TRIPLE_LASER_DURATION = 9;
const BOMB_MAX = 5; // bomb pickups stack up to this many

// ---------- Commander transmissions ----------
// say(key, lines, priority, cooldown): one radio line, typed out in the
// bottom-left box with a blip. `lines` can be an array to pick from at
// random. Each key has its own cooldown so situational nags can't spam, and
// a lower-priority line never cuts off a higher one still being read.
const COMMS_HOLD = 2.4;
let comms = null; // { text, chars, priority, life }
const commsCooldowns = {};
let lastShotTime = 0;
let killStreak = 0;       // kills since the ship last took damage
let spikeWarned = false;

// Spanish versions of the commander's English lines, looked up by the
// English text (lines written as { en, es } objects carry their own).
const COMMS_ES = {
  "DON'T JUST SIT THERE, SHOOT!": "¡NO TE QUEDES AHÍ, DISPARA!",
  "WE'RE HIT!": "¡NOS DIERON!",
  "YOU'RE BREAKING UP, PILOT! GRAB A REPAIR!": "¡TE ESTÁS DESARMANDO, PILOTO! ¡BUSCA UNA REPARACIÓN!",
  "BOSS DOWN! HOLD ON, WE ARE JUMPING!": "¡JEFE ABATIDO! ¡AGÁRRATE, VAMOS A SALTAR!",
  "BRACE!": "¡PREPÁRATE!",
  "GATE GUARDIAN AHEAD! TAKE COVER AND FIGHT!": "¡GUARDIÁN DE LA PUERTA AL FRENTE! ¡CÚBRETE Y PELEA!",
  "HOSTILE INTERCEPTOR! LIGHT IT UP!": "¡INTERCEPTOR HOSTIL! ¡ACÁBALO!",
  "HULL BREACH!": "¡BRECHA EN EL CASCO!",
  "HULL CRITICAL! FIND A REPAIR!": "¡CASCO CRÍTICO! ¡BUSCA UNA REPARACIÓN!",
  "INCOMING! CLOSE RANGE!": "¡AHÍ VIENEN! ¡CORTO ALCANCE!",
  "KEEP IT UP, PILOT!": "¡SIGUE ASÍ, PILOTO!",
  "MASSIVE SIGNAL! BRACE YOURSELF!": "¡SEÑAL MASIVA! ¡PREPÁRATE!",
  "NICE SHOOTING!": "¡BUENOS TIROS!",
  "OUCH. STAY FOCUSED!": "AUCH. ¡CONCÉNTRATE!",
  "OUTSTANDING! WARP NOW!": "¡EXCELENTE! ¡SALTO AHORA!",
  "OUTSTANDING!": "¡EXCELENTE!",
  "SHOOT, PILOT! THEY ARE CLOSING IN!": "¡DISPARA, PILOTO! ¡SE ACERCAN!",
  "SOMETHING BIG ON THE SCOPE! TAKE IT DOWN!": "¡ALGO GRANDE EN EL RADAR! ¡DERRÍBALO!",
  "SPIKES ON THE WALLS! MOVE YOUR AIM!": "¡PÚAS EN LAS PAREDES! ¡MUEVE TU MIRA!",
  "SPIKES! STEER CLEAR OF THEM!": "¡PÚAS! ¡ESQUÍVALAS!",
  "SWARM DETECTED! DROP THE BOMB!": "¡ENJAMBRE DETECTADO! ¡SUELTA LA BOMBA!",
 "WE PLAY THE HAND WE ARE DEALT. BOMB THEM!": "JUGAMOS CON LAS CARTAS QUE NOS TOCARON. ¡BOMBARDEALOS!",
 "THEY'RE ALL OVER ME!": "¡LOS TENGO ENCIMA!",
 "WHERE DID THAT ONE COME FROM?!": "¡¿DE DONDE SALIO ESE?!",
 "ENGAGE.": "ADELANTE.",
 "I HAVE A VERY BAD FEELING ABOUT THIS ONE.": "TENGO UN MUY MAL PRESENTIMIENTO DE ESTO.",
 "EXPRESS LIFT TO THE BOTTOM OF THE VORTEX, GOING DOWN!": "¡ELEVADOR EXPRESS AL FONDO DEL VORTICE, BAJANDO!",
 "IF IT MOVES, SHOOT IT. IF IT DOESN'T, SHOOT IT ANYWAY.": "SI SE MUEVE, DISPARALE. SI NO, DISPARALE IGUAL.",
 "IMPOSSIBLE? NO, PILOT. NECESSARY.": "¿IMPOSIBLE? NO, PILOTO. NECESARIO.",
  "TAKE COVER! THEY ARE ON TOP OF YOU!": "¡CÚBRETE! ¡LOS TIENES ENCIMA!",
  "TAKING DAMAGE!": "¡RECIBIENDO DAÑO!",
  "TARGET DOWN. NICE WORK!": "OBJETIVO ABATIDO. ¡BUEN TRABAJO!",
  "THEY CANNOT TOUCH YOU!": "¡NO PUEDEN TOCARTE!",
  "TOO MANY OF THEM! USE THE BOMB!": "¡SON DEMASIADOS! ¡USA LA BOMBA!",
  "WEAPONS FREE! OPEN FIRE!": "¡ARMAS LIBRES! ¡FUEGO!",
  "WELL DONE! BACK ON COURSE.": "¡BIEN HECHO! DE VUELTA AL CURSO.",
  "WELL DONE, PILOT! PUNCH IT!": "¡BIEN HECHO, PILOTO! ¡A FONDO!",
  "REPAIRS ONLINE.": "REPARACIONES EN LÍNEA.",
  "PATCHED UP. KEEP GOING!": "PARCHADO. ¡SIGUE!",
  "TRIPLE LASER! SPREAD 'EM OUT!": "¡LÁSER TRIPLE! ¡REPÁRTELES!",
  "FIREPOWER TRIPLED!": "¡POTENCIA DE FUEGO TRIPLICADA!",
  "PLASMA OVERCHARGED. GO LOUD!": "PLASMA SOBRECARGADO. ¡CON TODO!",
  "YOU'RE COVERED. PUSH IN!": "ESTÁS CUBIERTO. ¡AVANZA!",
  "GUNS HOT! FULL AUTO!": "¡CAÑONES CALIENTES! ¡AUTOMÁTICO!",
  "ONE MORE BOMB IN THE RACK.": "UNA BOMBA MAS EN EL ARSENAL.",
  "EXTRA BOMB! SAVE IT FOR A BAD MOMENT.": "¡BOMBA EXTRA! GUARDALA PARA UN MAL MOMENTO.",
  "ECHO ONLINE! YOUR SHOTS HAVE GHOSTS!": "¡ECO EN LÍNEA! ¡TUS DISPAROS TIENEN FANTASMAS!",
  "ECHO! EVERY SHOT TWICE MORE!": "¡ECO! ¡CADA DISPARO, DOS VECES MÁS!",
  "DISC ARMED! THROW IT, IT COMES BACK!": "¡DISCO ARMADO! ¡LÁNZALO, REGRESA!",
  "LAMBDA DISC! SLICE THE WHOLE RING!": "¡DISCO LAMBDA! ¡CORTA TODO EL ANILLO!",
  "YOU'RE ON YOUR OWN OUT HERE, PILOT.": "AQUÍ ESTÁS SOLO, PILOTO.",
  "NO WAY BACK FROM THE RIFT. GOOD LUCK.": "NO HAY REGRESO DE LA GRIETA. SUERTE.",
  "AGAIN, PILOT. THEY KNOW YOU NOW.": "OTRA VEZ, PILOTO. YA TE CONOCEN.",
  "DEEPER THIS TIME. THEY WILL BE READY.": "MÁS PROFUNDO ESTA VEZ. ESTARÁN LISTOS.",
  "STAY SHARP, PILOT. HERE THEY COME.": "ATENTO, PILOTO. AHÍ VIENEN.",
  "ENTERING THE VORTEX. WEAPONS FREE!": "ENTRANDO AL VÓRTICE. ¡ARMAS LIBRES!",
  "DEEPER IN. IT ONLY GETS WORSE.": "MÁS ADENTRO. SOLO EMPEORA.",
  "NEW SECTOR. STAY SHARP.": "NUEVO SECTOR. ATENTO.",
  "NEW SECTOR. EYES OPEN.": "NUEVO SECTOR. OJOS ABIERTOS.",
  "WE MADE IT. HOSTILES AHEAD.": "LO LOGRAMOS. HOSTILES AL FRENTE.",
  "STAY SHARP, PILOT.": "ATENTO, PILOTO.",
  "BIG SIGNAL INBOUND! TAKE COVER!": "¡SEÑAL GRANDE ENTRANDO! ¡CÚBRETE!",
  "BOSS ON THE SCOPE! WATCH ITS VOLLEYS!": "¡JEFE EN EL RADAR! ¡CUIDADO CON SUS RÁFAGAS!",
  "THIS IS IT, PILOT! EVERYTHING YOU HAVE!": "¡ES AHORA, PILOTO! ¡CON TODO LO QUE TIENES!",
  "THE HEART OF THE VORTEX! END THIS!": "¡EL CORAZÓN DEL VÓRTICE! ¡TERMINA CON ESTO!"
};

// The pixel font draws accented capitals at lowercase height, so all-caps
// text drops those accents (as arcade games did); Ñ, Ü, ¡ and ¿ render fine.
function arcadeCaps(text) {
  return text.replace(/[ÁÉÍÓÚ]/g, ch => ({ Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U' })[ch]);
}

function say(key, lines, priority, cooldown) {
  if (state !== 'playing') return false;
  if (lines && typeof lines === 'object' && !Array.isArray(lines)) lines = L(lines);
  priority = priority || 1;
  if (commsCooldowns[key] && t < commsCooldowns[key]) return false;
  if (comms && comms.priority > priority && comms.life > 0.8) return false;
  commsCooldowns[key] = t + (cooldown === undefined ? 8 : cooldown);
  let text = Array.isArray(lines) ? lines[Math.floor(Math.random() * lines.length)] : lines;
  if (lang === 'es' && COMMS_ES[text]) text = COMMS_ES[text];
  if (pilotName) text = text.replace(/\bPILOTO\b/g, pilotName).replace(/\bPILOT\b/g, pilotName);
  text = arcadeCaps(text);
  comms = { text, chars: 0, priority, life: COMMS_HOLD + text.length * 0.035 };
  playComms();
  return true;
}

// The rival AI, OVERSEER, breaks into the channel: same box, but red, a
// different signature and glitching characters.
function hack(key, lines, priority, cooldown) {
  if (say(key, lines, priority, cooldown)) {
    comms.hack = true;
    playHack();
  }
}

function updateComms(dt) {
  const el = document.getElementById('comms');
  if (!comms || state !== 'playing') {
    comms = state === 'playing' ? comms : null;
    el.style.opacity = '0';
    return;
  }
  comms.chars = Math.min(comms.text.length, comms.chars + dt * 45);
  comms.life -= dt;
  const shown = Math.floor(comms.chars);
  let text = comms.text.slice(0, shown);
  if (comms.hack) {
    // corrupt a few characters each frame
    text = text.replace(/[A-Z]/g, ch => Math.random() < 0.07 ? '#%&@$!'[Math.floor(Math.random() * 6)] : ch);
  }
  el.classList.toggle('hacked', !!comms.hack);
  document.getElementById('commslabel').textContent = comms.hack ? '> OVERSEER' : '> COMMAND';
  document.getElementById('commstext').textContent = text + (shown < comms.text.length ? '_' : '');
  el.style.opacity = String(Math.max(0, Math.min(1, comms.life / 0.3)));
  if (comms.life <= 0) comms = null;
}

// situational chatter, checked every frame while playing
function commsWatch() {
  if (warpTimer > 0) {
    if (!spikeWarned && spikes.some(sp => sp.z < 0.6)) {
      spikeWarned = true;
      say('spikes', ['SPIKES! STEER CLEAR OF THEM!', 'SPIKES ON THE WALLS! MOVE YOUR AIM!'], 3, 0);
    }
    return;
  }
  if (hull / hullMax < 0.25) {
    hack('lowhullHack', { en: 'YOUR HULL IS FAILING, PILOT. THE ODDS ARE AGAINST YOU.', es: 'TU CASCO ESTA FALLANDO, PILOTO. LAS PROBABILIDADES ESTAN EN TU CONTRA.' }, 3, 40);
  }
  if (hull / hullMax < 0.35) {
    say('lowhull', ['HULL CRITICAL! FIND A REPAIR!', "YOU'RE BREAKING UP, PILOT! GRAB A REPAIR!"], 3, 18);
  }
  // the pilot's answer when it's really bad: said last so it gets the line
  if (hull / hullMax < 0.18) {
    say('odds', { en: 'YOU KNOW I DON\'T BELIEVE IN THE ODDS.', es: 'YA SABES QUE NO CREO EN LAS PROBABILIDADES.' }, 3, 45);
  }

  if (enemies.length >= 6 && zapperCharges > 0) {
    say('zaphint', ['SWARM DETECTED! DROP THE BOMB!', 'TOO MANY OF THEM! USE THE BOMB!', 'WE PLAY THE HAND WE ARE DEALT. BOMB THEM!'], 2, 25);
  }
  if (enemies.some(e => e.alive && e.z < 0.18)) {
    say('close', ['INCOMING! CLOSE RANGE!', 'TAKE COVER! THEY ARE ON TOP OF YOU!', 'BRACE!'], 1, 14);
  }
  if (t - lastShotTime > 6 && enemies.length >= 2) {
    say('idle', ['SHOOT, PILOT! THEY ARE CLOSING IN!', 'WEAPONS FREE! OPEN FIRE!', "DON'T JUST SIT THERE, SHOOT!"], 1, 15);
  }
}
