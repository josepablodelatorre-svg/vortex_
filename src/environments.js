// VORTEX - Environments: tube, trench, asteroids, open space, planet surface.
// Plain script, loaded in order by index.html; shares globals with the others.

// ---------- Environments + routes ----------
// The lane gameplay never changes; the world around it does. Each campaign
// level is a route of environments, switched as the mission progresses;
// the Rift cycles through all of them by depth. The numeric look of each
// environment (envK) eases toward its target so transitions blend.
//   swirl/bend: how much the vortex twists and the path curves
//   sx/sy/rot:  the cross-section's stretch and rotation (trench = wide box)
//   rough:      rocky ring noise (asteroids)
//   tunnel:     how visible the tube itself is (0 in open space / on a planet)
const ENV = {
  tube:     { swirl: 1,   bend: 1,   sx: 1,   sy: 1,    rot: 0,           rough: 0, tunnel: 1, spawn: 1,   name: 'TUNNEL' },
  trench:   { swirl: 0,   bend: 0,   sx: 1.3, sy: 0.85, rot: Math.PI / 4, rough: 0, tunnel: 1, spawn: 0.9, name: 'TRENCH RUN' },
  asteroid: { swirl: 0.4, bend: 1,   sx: 1,   sy: 1,    rot: 0,           rough: 1, tunnel: 1, spawn: 1,   name: 'ASTEROID FIELD' },
  space:    { swirl: 0.3, bend: 0.4, sx: 1,   sy: 1,    rot: 0,           rough: 0, tunnel: 0, spawn: 1.7, name: 'OPEN SPACE' },
  surface:  { swirl: 0,   bend: 0.3, sx: 1,   sy: 1,    rot: 0,           rough: 0, tunnel: 0, spawn: 1.15, name: 'PLANET SURFACE' }
};
// one map per level: the scenery only changes when a boss goes down
const LEVEL_ENVS = ['tube', 'asteroid', 'space', 'trench', 'surface'];
const RIFT_ENVS = ['tube', 'trench', 'asteroid', 'space', 'surface'];
let midSaved = false;    // this level's midway checkpoint is already stored
let ventSpawned = false; // this level's trench vent is already on its way
let env = 'tube';
const envK = { ...ENV.tube };
let envFlash = 0;

function routeEnv() {
  // the Rift moves on to the next map at each boss gate
  if (gameMode === 'rift') return RIFT_ENVS[Math.floor((riftDepth - 1) / RIFT_BOSS_EVERY) % RIFT_ENVS.length];
  return LEVEL_ENVS[(currentLevel - 1) % LEVEL_ENVS.length];
}

const ENV_LINES = {
  space: { en: ['WE ARE OUT! ENJOY THE VIEW, PILOT.', 'OPEN SPACE. CATCH YOUR BREATH.'], es: ['¡SALIMOS! DISFRUTA LA VISTA, PILOTO.', 'ESPACIO ABIERTO. RECUPERA EL ALIENTO.'] },
  trench: { en: ['TRENCH RUN. HOLD YOUR LINE... HOLD YOUR LINE!', 'STAY IN THE TRENCH, PILOT. THE VENT IS AT THE END.'], es: ['CORRIDA EN LA ZANJA. MANTEN TU LINEA... ¡MANTENLA!', 'QUEDATE EN LA ZANJA, PILOTO. EL CONDUCTO ESTA AL FINAL.'] },
  asteroid: { en: ['ROCKS AHEAD! YOU KNOW I DON\'T BELIEVE IN THE ODDS.', 'ASTEROID FIELD. SHOOT THROUGH OR SLIDE AROUND.'], es: ['¡ROCAS ADELANTE! YA SABES QUE NO CREO EN LAS PROBABILIDADES.', 'CAMPO DE ASTEROIDES. DISPARA O ESQUIVA.'] },
  surface: { en: ['ATMOSPHERE ENTRY. KEEP IT LOW.', 'PLANETFALL. STAY OVER THE VALLEY.'], es: ['ENTRADA ATMOSFERICA. VUELA BAJO.', 'ATERRIZAJE PLANETARIO. MANTENTE EN EL VALLE.'] },
  tube: { en: ['BACK IN THE PIPE.', 'INTO THE VORTEX AGAIN.'], es: ['DE VUELTA EN EL TUBO.', 'OTRA VEZ AL VORTICE.'] }
};

function setEnv(name, quiet) {
  if (name === env) return;
  const leaving = env;
  env = name;
  envFlash = quiet ? 0 : 1;
  tunnelSidesTarget = name === 'trench' ? 4 : (gameMode === 'rift' ? pickRiftShape() : computeShapeStage());
  if (!quiet) {
    showLevelBanner(ENV[name].name);
    say('env-' + name, ENV_LINES[name], 2, 20);
  }
}

function updateEnv(dt) {
  const target = ENV[env];
  const k = Math.min(1, dt * 1.4);
  for (const key of ['swirl', 'bend', 'sx', 'sy', 'rot', 'rough', 'tunnel']) envK[key] += (target[key] - envK[key]) * k;
  envFlash = Math.max(0, envFlash - dt * 1.5);
  if (state !== 'playing' || calmPhase()) return;
  // halfway through a campaign level: store the midway checkpoint
  // (a miniboss fight can be under way: continuing just skips that miniboss)
  if (gameMode === 'campaign' && !midSaved && missionProgress() >= 0.5) {
    midSaved = true;
    saveCheckpoint(true);
  }
  // the trench ends at its vent, just before the boss
  const nearEnd = gameMode === 'rift'
    ? riftDepth % RIFT_BOSS_EVERY === 0 && killCount >= RIFT_SECTOR_KILLS * 0.8
    : missionProgress() >= 0.85;
  if (env === 'trench' && !ventSpawned && !bossActive && nearEnd) {
    ventSpawned = true;
    spawnVent();
  }
}

// the trench ends at a vent: one clean hit for a big bonus
function spawnVent() {
  trackItems.push({ kind: 'vent', angle: normalizeAngle(Math.PI + (Math.random() - 0.5) * 0.8), z: 1 });
}

// ---- cheap 2D value noise for terrain and rocks ----
function hash2(x, y) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function noise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// ---- open space: streaming stars, a distant galaxy, and the black hole ----
const SPACE_STARS = Array.from({ length: 170 }, () => ({ a: Math.random() * Math.PI * 2, d: Math.random(), s: 0.5 + Math.random() }));
function drawSpace(alpha) {
  if (alpha <= 0.01) return;
  const far = pointOnRing(0, 1);
  const maxR = Math.hypot(W, H) * 0.6;
  ctx.save();
  ctx.globalAlpha = alpha;
  // a faint spiral galaxy off to one side
  ctx.save();
  ctx.translate(W * 0.2, H * 0.24);
  ctx.rotate(t * 0.03);
  for (let i = 0; i < 260; i++) {
    const arm = i % 2, k = i / 260;
    const a = arm * Math.PI + k * 9, r = k * Math.min(W, H) * 0.16;
    ctx.fillStyle = `rgba(${180 + arm * 60},${150 + k * 80},255,${0.5 * (1 - k)})`;
    ctx.fillRect(Math.cos(a) * r, Math.sin(a) * r * 0.45, 2, 2);
  }
  ctx.restore();
  // stars streaming outward from the vanishing point
  ctx.lineCap = 'round';
  const speed = 0.25 * padSpeed() * warpBoost();
  for (const st of SPACE_STARS) {
    st.d += speed * (0.15 + st.d) * st.s * 0.016;
    if (st.d > 1) { st.d = 0.02; st.a = Math.random() * Math.PI * 2; }
    const r0 = st.d * maxR, r1 = r0 * (1 - 0.06 * st.s);
    ctx.strokeStyle = `rgba(220,230,255,${Math.min(1, st.d * 1.6)})`;
    ctx.lineWidth = 1 + st.d * 1.5;
    ctx.beginPath();
    ctx.moveTo(far.x + Math.cos(st.a) * r1, far.y + Math.sin(st.a) * r1);
    ctx.lineTo(far.x + Math.cos(st.a) * r0, far.y + Math.sin(st.a) * r0);
    ctx.stroke();
  }
  // the black hole at the vanishing point: accretion disc, photon ring, void
  const R = Math.min(W, H) * 0.05;
  ctx.save();
  ctx.translate(far.x, far.y);
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    ctx.ellipse(0, 0, R * (3.2 - k * 0.45), R * (0.62 - k * 0.08), -0.25, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,${140 + k * 25},60,${0.35 + k * 0.12})`;
    ctx.lineWidth = 2 + k;
    ctx.shadowColor = '#ff9a3c';
    ctx.shadowBlur = 18;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, R * 1.12, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,240,210,0.9)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(far.x, far.y, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---- planet surface: a sun (or moon) over scrolling wireframe mountains ----
const SKY_STARS = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random() * 0.5, b: Math.random() }));
function drawSurface(alpha) {
  if (alpha <= 0.01) return;
  // even Rift depths and later campaign runs get the cold moonlit version
  const moon = gameMode === 'rift' ? riftDepth % 2 === 0 : runTier % 2 === 1;
  const lineRGB = moon ? '225,235,255' : '255,120,60';
  const horizon = CY;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const st of SKY_STARS) {
    ctx.fillStyle = `rgba(255,255,230,${0.3 + 0.6 * st.b * (0.6 + 0.4 * Math.sin(t * 2 + st.x * 40))})`;
    ctx.fillRect(st.x * W, st.y * H, 2, 2);
  }
  const sr = Math.min(W, H) * 0.12;
  const sx = CX + W * 0.22, sy = horizon - H * 0.2;
  const grad = ctx.createRadialGradient(sx, sy, sr * 0.2, sx, sy, sr);
  grad.addColorStop(0, moon ? '#ffffff' : '#ffd36b');
  grad.addColorStop(1, moon ? 'rgba(170,190,220,0.85)' : 'rgba(255,140,30,0.9)');
  ctx.fillStyle = grad;
  ctx.shadowColor = moon ? '#cfe2ff' : '#ff9a2c';
  ctx.shadowBlur = 50;
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  // the terrain: rows rolling toward the player, mountains rising toward the
  // sides so the middle stays a flyable valley
  const ROWS = 22, COLS = 34;
  const scroll = tunnelTravel * 4;
  const frac = scroll % 1, base = Math.floor(scroll);
  const pts = [];
  for (let k = 0; k <= ROWS; k++) {
    const zz = Math.max(0, (k + 1 - frac) / (ROWS + 1)); // 1 = horizon, 0 = at the player
    const near = Math.pow(1 - zz, 2.2);
    const row = [];
    for (let c = 0; c <= COLS; c++) {
      const u = (c / COLS) * 3.4 - 1.7;
      const mount = Math.min(1, Math.max(0, (Math.abs(u) - 0.3) / 1.0));
      const h = noise2(u * 2.2, (k + base) * 0.35) * mount * mount;
      row.push([CX + u * W * (0.05 + near * 0.95), horizon + (H - horizon) * near - h * H * 0.42 * (0.25 + near * 0.75)]);
    }
    pts.push({ row, zz });
  }
  ctx.lineWidth = 1;
  for (const { row, zz } of pts) {
    ctx.strokeStyle = `rgba(${lineRGB},${0.15 + 0.6 * (1 - zz)})`;
    ctx.beginPath();
    row.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
  for (let c = 0; c <= COLS; c++) {
    ctx.strokeStyle = `rgba(${lineRGB},0.35)`;
    ctx.beginPath();
    pts.forEach(({ row }, i) => (i ? ctx.lineTo(row[c][0], row[c][1]) : ctx.moveTo(row[c][0], row[c][1])));
    ctx.stroke();
  }
  ctx.restore();
}

function swirlAngle(z) {
  // zero at z=0 so the near wall (and the player's aim) never drifts,
  // growing with depth and with run time so the far tunnel spirals harder
  return z * 0.9 * Math.min(1 + runT * 0.015, 2.2);
}

// Regular-polygon polar equation: how much to scale a point's radius, given
// its angle around the ring, so instead of a circle you get a straight-edged
// N-sided shape. Works for fractional N too (an in-between "almost-N-gon"
// blob), which is what makes tunnelSides easing toward its target look like
// a smooth morph between shapes rather than a hard cut.
function polygonRadiusFactor(angle, sides) {
  const seg = (Math.PI * 2) / sides;
  let a = ((angle % seg) + seg) % seg;
  a -= seg / 2;
  return Math.cos(seg / 2) / Math.cos(a);
}

function pointOnRing(angle, z, opts) {
  const visual = !opts || opts.visual !== false;
  const swirl = visual ? swirlAngle(z) * envK.swirl : 0;
  const r = ringRadius(z) * polygonRadiusFactor(angle + swirl + (visual ? envK.rot : 0), tunnelSides);
  // camera path bend: distant geometry shows where the path is heading,
  // near geometry (z=0) always resolves to zero offset, same as the player
  const dx = visual ? (pathX(t + z * PATH_LOOKAHEAD) - pathX(t)) * envK.bend : 0;
  const dy = visual ? (pathY(t + z * PATH_LOOKAHEAD) - pathY(t)) * envK.bend : 0;
  const a = angle + swirl - Math.PI / 2;
  return {
    x: CX + Math.cos(a) * r * (visual ? envK.sx : 1) + dx * z,
    y: CY + Math.sin(a) * r * (visual ? envK.sy : 1) + dy * z,
    r
  };
}
