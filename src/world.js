// VORTEX - Difficulty, the tunnel and its camera path, entity lists, projection.
// Plain script, loaded in order by index.html; shares globals with the others.

// Difficulty presets, chosen on the title screen before a run starts.
let difficultySetting = 'normal';
const DIFFICULTY_PARAMS = {
  easy:   { spawnBase: 2.6, spawnMin: 1.2, spawnDecay: 0.004, speedBase: 0.055, speedVar: 0.02,  rampRate: 0.008 },
  normal: { spawnBase: 2.0, spawnMin: 0.8, spawnDecay: 0.006, speedBase: 0.07,  speedVar: 0.03,  rampRate: 0.012 },
  hard:   { spawnBase: 1.3, spawnMin: 0.45,spawnDecay: 0.01,  speedBase: 0.09,  speedVar: 0.045, rampRate: 0.02 },
};

// Scales the chosen difficulty preset up by the current run tier, so each
// New-Game-Plus continuation after a win spawns faster/denser/quicker than
// the last, without a separate full preset table to maintain.
function getDiffParams() {
  const base = DIFFICULTY_PARAMS[difficultySetting];
  const tier = runTier + riftTier();
  const spawnMul = Math.max(0.5, 1 - tier * 0.08);
  const speedMul = 1 + tier * 0.12;
  const rampMul = 1 + tier * 0.15;
  return {
    spawnBase: base.spawnBase * spawnMul,
    spawnMin: base.spawnMin * spawnMul,
    spawnDecay: base.spawnDecay,
    speedBase: base.speedBase * speedMul,
    speedVar: base.speedVar * speedMul,
    rampRate: base.rampRate * rampMul
  };
}

// Aim angle around the tunnel ring (0 = up, clockwise)
let aimAngle = 0;

// Tunnel rings: each ring has a z depth (distance from camera), rings recede as z decreases... 
// we'll model it as z going from FAR to 0 (player), wrapping back to FAR.
const RING_COUNT = 14;
const RING_SPACING = 1.0 / RING_COUNT;
let rings = [];
for (let i = 0; i < RING_COUNT; i++) {
  rings.push({ z: i / RING_COUNT });
}
const TUNNEL_SPEED = 0.2; // z units per second (base; ramps up over time, see effectiveTunnelSpeed)

const SIDES = 9; // fixed count for the background radial guide spokes
const RING_SAMPLES = 36; // sample density for the tunnel's cross-section outline

// The tunnel's cross-section shape itself slowly morphs as you advance: each
// level (and each New-Game-Plus run after a win) steps to the next shape in
// this list, looping back around once it reaches "circle". tunnelSides eases
// toward tunnelSidesTarget over several seconds rather than snapping.
const SHAPE_STAGES = [9, 8, 7, 6, 5, 4, 3, 42];
function computeShapeStage() {
  const stage = (runTier * LEVEL_COUNT + (currentLevel - 1)) % SHAPE_STAGES.length;
  return SHAPE_STAGES[stage];
}
let tunnelSides = 9;
let tunnelSidesTarget = 9;

// How far ahead (in virtual seconds) the camera path "sees" at the far wall.
// Higher = more dramatic banking through turns, like a pipe or trench run.
// Kept shorter than the straight segment durations below so there's real
// dead-straight tunnel to fly through, not a constant preview of the next bend.
const PATH_LOOKAHEAD = 2.4;

function effectiveTunnelSpeed() {
  // being sucked toward the event horizon: speed creeps up over the run
  return TUNNEL_SPEED * (1 + Math.min(runT * 0.012, 1.8));
}

// The camera's path through the tunnel alternates straight runs (no drift) with
// banked curves (smooth turn to a new heading), like a pipe with real straightaways.
// Each curve's dx/dy sums to zero across the cycle so the loop closes cleanly.
const PATH_SEGMENTS_DEF = [
  { type: 'straight', dur: 6.5 },
  { type: 'curve',    dur: 4.0, dx: 1.0,  dy: 0.3 },
  { type: 'straight', dur: 7.0 },
  { type: 'curve',    dur: 4.0, dx: -0.6, dy: -0.9 },
  { type: 'straight', dur: 5.5 },
  { type: 'curve',    dur: 4.0, dx: 0.9,  dy: 0.4 },
  { type: 'straight', dur: 6.0 },
  { type: 'curve',    dur: 4.0, dx: -1.3, dy: 0.2 },
];
const PATH_SEGMENTS = (() => {
  let cumT = 0, curX = 0, curY = 0;
  return PATH_SEGMENTS_DEF.map(s => {
    const startT = cumT, endT = cumT + s.dur;
    const toX = s.type === 'curve' ? curX + s.dx : curX;
    const toY = s.type === 'curve' ? curY + s.dy : curY;
    const seg = { type: s.type, startT, endT, fromX: curX, fromY: curY, toX, toY };
    curX = toX; curY = toY; cumT = endT;
    return seg;
  });
})();
const PATH_CYCLE = PATH_SEGMENTS[PATH_SEGMENTS.length - 1].endT;

function smoothstep01(x) {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
}

function pathOffsetUnits(vt) {
  let lt = vt % PATH_CYCLE;
  if (lt < 0) lt += PATH_CYCLE;
  for (const seg of PATH_SEGMENTS) {
    if (lt >= seg.startT && lt < seg.endT) {
      if (seg.type === 'straight') return { x: seg.fromX, y: seg.fromY };
      const frac = smoothstep01((lt - seg.startT) / (seg.endT - seg.startT));
      return {
        x: seg.fromX + (seg.toX - seg.fromX) * frac,
        y: seg.fromY + (seg.toY - seg.fromY) * frac
      };
    }
  }
  return { x: 0, y: 0 };
}

function pathX(vt) {
  return pathOffsetUnits(vt).x * Math.min(W, H) * 0.42;
}
function pathY(vt) {
  return pathOffsetUnits(vt).y * Math.min(W, H) * 0.3;
}

let camRoll = 0; // banking angle, derived from lateral path velocity

// Pulses: expanding rings triggered by firing, brighten things near their z/time
let pulses = []; // { startTime, }

// Bolts fired by the player, travel from z=0 outward to z=1
let bolts = []; // { angle, z }

// Enemies: emerge from tunnel wall at some z, drift toward player.
// type: 'drone' (basic, straight in), 'weaver' (oscillates side to side),
// 'shooter' (slower, fires enemyBolts at the ship), 'grid' (classic marching
// formation wave, moves in lockstep with the rest of its formation)
let enemies = []; // { angle, z, shape, type, speed, alive, baseAngle, phase, fireTimer?, formSeed? }
let spawnTimer = 0;
let clusterTimer = 0;
let formationTimer = 0;
let difficulty = 1;

// Enemy bolts fired by 'shooter' enemies and the boss, travel inward (z -> 0)
let enemyBolts = []; // { angle, z }

// Power-ups: gold triangles (hull repair) or rarer white stars (triple
// laser) drifting down the tunnel, grabbed by shooting or reaching them.
// Not hostile, missing one costs nothing.
let powerups = []; // { angle, z, alive, kind: 'hull' | 'star' }
let powerupTimer = 0;
let tripleLaserTimer = 0; // seconds remaining on an active triple-laser pickup
let novaFlash = 0;        // 1..0, the screen-clearing nova shockwave animation

// Echo pickup (Gradius-style options): for ECHO_DURATION, every shot is
// repeated by two ghost ships ECHO_DELAYS later, down the same lane, so
// fire "reverberates" and catches whatever drifts into the lane after it.
// Lambda disc: a pickup worth DISC_THROWS throws. A throw
// flies out along the aim, sweeps once all the way round the tunnel at
// that depth slicing through every lane, then comes back. Each enemy it
// crosses takes a hit (once per throw) through the normal bolt hit code.
const DISC_THROWS = 3;
let discCharges = 0;
let disc = null; // { id, phase: 'out' | 'sweep' | 'back', angle, z, swept, dir }
let discId = 0;

function throwDisc() {
  discCharges -= 1;
  disc = { id: ++discId, phase: 'out', angle: aimAngle, z: 0.05, swept: 0, dir: Math.random() < 0.5 ? -1 : 1 };
  playZap();
  playBass(110, 0.3);
  updateTripleUI();
}

function updateDisc(dt) {
  // hidden bolts from last frame's contacts have had their chance to hit
  bolts = bolts.filter(b => !b.hidden);
  if (!disc) return;
  if (disc.phase === 'out') {
    disc.z += 1.5 * dt;
    if (disc.z >= 0.5) disc.phase = 'sweep';
  } else if (disc.phase === 'sweep') {
    const step = 5.5 * dt;
    disc.angle = normalizeAngle(disc.angle + disc.dir * step);
    disc.swept += step;
    if (disc.swept >= Math.PI * 2) disc.phase = 'back';
  } else {
    disc.z -= 1.7 * dt;
    if (disc.z <= 0.04) {
      disc = null; // caught
      playPowerUp();
      return;
    }
  }
  const touches = (angle, z) => Math.abs(normalizeAngle(angle - disc.angle)) < 0.32 && Math.abs(z - disc.z) < 0.17;
  for (const e of enemies) {
    if (e.alive && e.discThrow !== disc.id && touches(e.angle, e.z)) {
      e.discThrow = disc.id;
      bolts.push({ angle: e.angle, z: e.z, hidden: true });
      disc.hits = (disc.hits || 0) + 1;
      missionEvent('disc');
      if (disc.hits >= 5) unlockAchievement('discmaster');
    }
  }
  if (boss && boss.alive && boss.discThrow !== disc.id && touches(boss.angle, boss.z)) {
    boss.discThrow = disc.id;
    bolts.push({ angle: boss.angle, z: boss.z, hidden: true });
  }
}

function drawDisc() {
  if (!disc) return;
  const pt = pointOnRing(disc.angle, disc.z);
  const r = Math.max(6, 22 * (1 - disc.z) + 6);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(pt.x, pt.y);
  ctx.rotate(t * 18);
  ctx.strokeStyle = '#e8fdff';
  ctx.shadowColor = '#50e6ff';
  ctx.shadowBlur = 24;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(r * 0.55, 0);
    ctx.lineTo(r, 0);
    ctx.stroke();
  }
  ctx.restore();
}

const ECHO_DURATION = 10;
const ECHO_DELAYS = [0.2, 0.4];
let echoTimer = 0;
let echoQueue = [];       // { at, angle } shots waiting to be replayed
let echoTrail = [];       // { t, x, lean } recent ship positions for the ghosts

// where the ship was at time `when` (nearest recorded sample)
function echoSample(when) {
  for (let i = echoTrail.length - 1; i >= 0; i--) {
    if (echoTrail[i].t <= when) return echoTrail[i];
  }
  return echoTrail[0] || { x: shipX, lane: shipLane };
}
let pointerHeld = false;  // mouse button / finger down (interceptor hold-to-fire)
let holdFireTimer = 0;

// Superzapper (from Tempest): one on-demand screen clear per level, fired
// with SPACE, right-click or the ZAP button. Refilled at each level start.
let zapperCharges = 1;

// Warp (from Tempest): after a boss, the camera dives down the tunnel at
// high speed for WARP_DURATION seconds while spikes rush in along the walls.
// Slide the ship off a spike's lane (or shoot it) before it reaches you.
const WARP_DURATION = 3.4;
const SPIKE_DAMAGE = 12;
let warpTimer = 0;
let warpBanner = '';      // shown once the warp finishes, e.g. 'LEVEL 2'
let spikes = [];          // { angle, z }
let spikeTimer = 0;
let tunnelTravel = 0;     // integrated ring scroll, so speed changes don't make the rings jump

// ship motion (purely cosmetic: shots always leave from the tunnel's centre)
// Dodging: the ship rides an arc around the lower half of the screen (3 to
// 9 o'clock) at shipLane, following the aim with a turn-rate limit. Only
// things reaching the rim inside the ship's lane (LANE_HIT) hurt it; the
// rest fly past. shipX stays as the ship's screen offset from centre for
// everything that just needs "where the ship is".
const LANE_HIT = 0.42;
const LANE_SPEED = 5.5; // rad/s the ship can slide around its arc
let shipLane = Math.PI;
let shipLaneVel = 0;
let shipX = 0;            // horizontal offset from centre (derived from shipLane)
let shipVX = 0;
let shipRecoil = 0;       // 1..0 kick back on each shot
let shipHitWobble = 0;    // 1..0 shudder after taking damage

// Particles for hit bursts
let particles = []; // { x, y, vx, vy, life }

// Flickering 0/1 bit characters that scatter when an enemy is destroyed
let bitBursts = []; // { x, y, vx, vy, life, maxLife, char }

// Shatter: destroyed things break into wireframe voxel cubes
// that tumble apart, fall and fade, instead of just sparking out.
let voxels = []; // { x, y, vx, vy, size, life, maxLife, color, spin }
let shipShattered = false;

function shatter(x, y, color, count, spread) {
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const speed = (40 + Math.random() * 160) * (spread || 1);
    const life = 0.7 + Math.random() * 0.7;
    voxels.push({
      x: x + (Math.random() - 0.5) * 14 * (spread || 1),
      y: y + (Math.random() - 0.5) * 14 * (spread || 1),
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed - 40,
      size: 3 + Math.random() * 6 * (spread || 1),
      life, maxLife: life, color,
      spin: (Math.random() - 0.5) * 6
    });
  }
  if (voxels.length > 900) voxels.splice(0, voxels.length - 900);
}

function shatterAt(angle, z, color, count, spread) {
  const pt = pointOnRing(angle, z);
  shatter(pt.x, pt.y, color, count, spread);
}

// Circuit traces: fixed circuit traces etched along the tunnel
// wall, in (angle, depth) space, with packets of light racing along them
// toward the event horizon, more often the fuller the music is.
const CIRCUIT_TRACES = (() => {
  // deterministic pseudo-random, so the board looks the same every run
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const traces = [];
  const LANES = 16;
  for (let i = 0; i < LANES; i++) {
    let angle = (i + 0.5) / LANES * Math.PI * 2;
    let z = 0;
    const pts = [[angle, z]];
    while (z < 1) {
      z = Math.min(1, z + 0.08 + rnd() * 0.16);   // straight run down the tube
      pts.push([angle, z]);
      if (z < 1 && rnd() < 0.6) {                  // a right-angle jog sideways
        angle += (rnd() < 0.5 ? -1 : 1) * (0.06 + rnd() * 0.1);
        pts.push([angle, z]);
      }
    }
    traces.push(pts);
  }
  return traces;
})();
let circuitPulses = []; // { trace, u (0..1 along it), speed }
let circuitPulseTimer = 0;

// point a fraction u of the way along a trace polyline, in (angle, z)
function tracePoint(pts, u) {
  const segs = pts.length - 1;
  const f = Math.max(0, Math.min(0.9999, u)) * segs;
  const i = Math.floor(f), k = f - i;
  return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
}

// light trail: the last stretch of the aim's path, drawn as a ribbon of
// light around the tunnel behind the aim line, like a racer's light wall
let aimTrail = []; // { t, angle }

// "HIT!" callouts that pop up and fade at the kill location
let hitLabels = []; // { x, y, vy, life, maxLife }

// projection: perspective-ish falloff
function ringRadius(z) {
  // z: 0 (close to player, big) -> 1 (far, near vanishing point)
  // near ring reaches past the corners so the tunnel fills the whole screen
  const minR = 6;
  const maxR = Math.sqrt(W * W + H * H) / 2 * 1.08;
  const tt = 1 - z; // 0 at far, 1 at close
  return minR + (maxR - minR) * Math.pow(tt, 1.25);
}

// Vortex swirl: the tunnel geometry itself slowly twists, faster with depth and
// faster as the run goes on, like being pulled toward an event horizon.
