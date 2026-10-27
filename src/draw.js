// VORTEX - Rendering: tunnel, ship, enemies, bosses, HUD on canvas.
// Plain script, loaded in order by index.html; shares globals with the others.

// ---------- Draw ----------
function pulseBrightness(angle, z) {
  let b = 0;
  for (const p of pulses) {
    const age = t - p.startTime;
    const pulseZ = age * 1.8; // how far the pulse ring has traveled outward
    const distZ = Math.abs(z - pulseZ);
    const da = Math.abs(normalizeAngle(angle - p.angle));
    const angularFalloff = Math.max(0, 1 - da / 1.2);
    const zFalloff = Math.max(0, 1 - distZ / 0.15);
    const fade = Math.max(0, 1 - age / 0.6);
    b = Math.max(b, angularFalloff * zFalloff * fade);
  }
  return b;
}

function draw() {
  // background breathes between deep purple and true black, clearly visible
  const cycle = (Math.sin(t * 0.35) + 1) / 2; // 0..1, ~18s period
  // the music's swell deepens the tint on top of the slow breathing cycle
  const r = Math.floor(40 * cycle + 30 * musicSwell);
  const g = 0;
  const b = Math.floor(60 * cycle + 55 * musicSwell);
  ctx.fillStyle = `rgba(${r},${g},${b},0.5)`;
  ctx.fillRect(0, 0, W, H);
  if (state === 'cycles' || state === 'cyclesover') {
    drawTunnel();
    drawCycles();
    drawVoxels();
  }

  if (state === 'playing' || state === 'gameover' || state === 'cleared') {
    // bank the whole scene with the camera's lateral motion, like a cockpit
    // rolling through a turn, then restore so HUD/reticle math stays simple
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(camRoll - viewRot);
    ctx.translate(-CX, -CY);
    // impact shake: a small random jitter that decays with shakeTimer, so
    // hits/boss-kills read as physical punches rather than silent hp loss
    if (shakeTimer > 0 && shakeMag > 0) {
      const falloff = shakeTimer; // fades out as the timer runs down
      ctx.translate((Math.random() - 0.5) * shakeMag * falloff, (Math.random() - 0.5) * shakeMag * falloff);
    }
    // open environments draw their own world where the tube fades out
    drawSpace(env === 'space' ? 1 - envK.tunnel : 0);
    drawSurface(env === 'surface' ? 1 - envK.tunnel : 0);
    drawTunnel();
    drawTrackItems();
    drawWarp();
    drawNova();
    drawEnemies();
    drawBoss();
    drawPowerups();
    drawCores();
    drawDisc();
    drawBolts();
    drawEnemyBolts();
    drawParticles();
    drawBitBursts();
    drawHitLabels();
    drawAimTrail();
    drawAimLine();
    drawEchoGhosts();
    drawCoPlayers();
    if (!shipShattered && viewMode !== 'cockpit') drawShip();
    drawVoxels();
    if (envFlash > 0) {
      ctx.fillStyle = `rgba(220,240,255,${0.45 * envFlash * envFlash})`;
      ctx.fillRect(-W, -H, W * 3, H * 3);
    }
    ctx.restore();
    if (viewMode === 'cockpit' && state === 'playing') drawCockpit();
    if (state === 'playing') drawRadar();
  }
}

// Radar (from X, 1992): a top-down scope of the tunnel's true lanes.
// Angle around the scope = angle around the tunnel (0 = up, like the aim),
// distance from the centre = how close the thing is (rim = at the ship).
// Unlike the screen, it ignores the vortex swirl and camera bank, so it
// shows exactly which lane every threat is really in.
function drawRadar() {
  const R = Math.max(38, Math.min(62, Math.min(W, H) * 0.09));
  const cx = W - R - 18, cy = R + 18;
  const at = (angle, z) => {
    const d = (1 - Math.max(0, Math.min(1, z))) * R * 0.92;
    return [cx + Math.sin(angle) * d, cy - Math.cos(angle) * d];
  };
  ctx.save();
  ctx.fillStyle = 'rgba(10,0,24,0.6)';
  ctx.strokeStyle = 'rgba(63,255,102,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(63,255,102,0.18)';
  for (const f of [0.33, 0.66]) {
    ctx.beginPath();
    ctx.arc(cx, cy, R * f, 0, Math.PI * 2);
    ctx.stroke();
  }
  // aim wedge: the lane a shot will hit (same tolerance as the bolt hit test)
  ctx.fillStyle = 'rgba(168,85,255,0.22)';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, R, aimAngle - 0.4 - Math.PI / 2, aimAngle + 0.4 - Math.PI / 2);
  ctx.closePath();
  ctx.fill();
  // rotating sweep line
  const sweep = t * 2.2;
  ctx.strokeStyle = 'rgba(63,255,102,0.45)';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.sin(sweep) * R, cy - Math.cos(sweep) * R);
  ctx.stroke();

  const dot = (angle, z, color, size) => {
    const [x, y] = at(angle, z);
    ctx.fillStyle = color;
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
  };
  for (const p of powerups) if (p.alive) dot(p.angle, p.z, '#ffd23f', 3);
  if (typeof cores !== 'undefined') for (const c of cores) if (c.alive) dot(c.angle, c.z, '#50e6ff', 4);
  for (const sp of spikes) if (sp.z >= 0) dot(sp.angle, sp.z, '#3f6', 3);
  for (const eb of enemyBolts) dot(eb.angle, eb.z, '#ff6680', 2);
  for (const e of enemies) {
    if (!e.alive) continue;
    // anything about to reach the ship blinks
    if (e.z < 0.2 && Math.sin(t * 20) < 0) continue;
    dot(e.angle, e.z, e.type === 'pentagram' ? '#ff1e3c' : '#ff9f43', 4);
  }
  if (boss && boss.alive) dot(boss.angle, boss.z, '#ff5533', 8);
  ctx.fillStyle = 'rgba(63,255,102,0.7)';
  ctx.font = "7px 'Press Start 2P', 'Courier New', monospace";
  ctx.textAlign = 'center';
  ctx.fillText('RADAR', cx, cy + R + 11);
  ctx.restore();
}

function drawTunnel() {
  if (envK.tunnel < 0.02) return;
  ctx.save();
  ctx.globalAlpha = envK.tunnel;
  drawTunnelInner();
  ctx.restore();
}

function drawTunnelInner() {
  // radial spokes, sampled along z so they bend through the camera's turns
  // and twist with the vortex swirl instead of staying ruler straight
  const SPOKE_STEPS = 10;
  ctx.strokeStyle = `rgba(60,110,255,${0.18 + 0.22 * musicSwell})`;
  ctx.lineWidth = 1;
  for (let s = 0; s < SIDES; s++) {
    const angle = (s / SIDES) * Math.PI * 2;
    ctx.beginPath();
    for (let k = 0; k <= SPOKE_STEPS; k++) {
      const z = k / SPOKE_STEPS;
      const pt = pointOnRing(angle, z);
      if (k === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();
  }

  // concentric rings, scrolling, accelerating toward the event horizon.
  // With music analysis live they double as Rutt-Etra scan lines, pushed
  // outward by the spectrum history rolling down the tunnel.
  const offset = tunnelTravel % RING_SPACING;
  const rutt = ruttHistory.length >= 2;
  const samples = rutt ? RUTT_SAMPLES : RING_SAMPLES;
  for (let i = -1; i <= RING_COUNT; i++) {
    let z = i / RING_COUNT + offset;
    if (z > 1 || z < 0) continue;
    // this ring's own centre (it shifts with the path bend), for pushing outward
    let c = null;
    const rough = envK.rough > 0.02;
    const ringId = i - Math.floor(tunnelTravel / RING_SPACING);
    if (rutt || rough) {
      const top = pointOnRing(0, z), bottom = pointOnRing(Math.PI, z);
      c = { x: (top.x + bottom.x) / 2, y: (top.y + bottom.y) / 2 };
    }
    ctx.beginPath();
    for (let s = 0; s <= samples; s++) {
      const angle = (s / samples) * Math.PI * 2;
      const pt = pointOnRing(angle, z);
      if (rutt) {
        // push the point away from the ring's centre, scaled to its size
        const d = ruttDisplacement(angle, z) * pt.r * 0.22;
        const dx = pt.x - c.x, dy = pt.y - c.y;
        const len = Math.hypot(dx, dy) || 1;
        pt.x += dx / len * d;
        pt.y += dy / len * d;
      }
      if (rough) {
        // asteroid walls: lumpy rock, stable per ring as it scrolls
        const n = noise2(angle * 2.2, ringId * 0.7) - 0.5;
        const d = n * pt.r * 0.28 * envK.rough;
        const dx = pt.x - c.x, dy = pt.y - c.y;
        const len = Math.hypot(dx, dy) || 1;
        pt.x += dx / len * d;
        pt.y += dy / len * d;
      }
      if (s === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    // swell lifts the rings' brightness; shimmer washes them toward cyan-white
    const alpha = 0.12 + 0.25 * (1 - z) + 0.25 * musicSwell * (1 - z);
    const sh = musicShimmer;
    ctx.strokeStyle = `rgba(${Math.round(60 + 120 * sh)},${Math.round(130 + 100 * sh)},255,${Math.min(1, alpha)})`;
    ctx.lineWidth = 1.5 + musicSwell;
    ctx.stroke();
  }

  // swell rings drift in from the event horizon at a pace set by the music,
  // fading in from the dark and out as they reach the player
  if (swellRings.length) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const br of swellRings) {
      const age = t - br.startTime;
      const z = 1 - age * SWELL_RING_SPEED;
      if (z <= 0) continue;
      ctx.beginPath();
      for (let s = 0; s <= RING_SAMPLES; s++) {
        const angle = (s / RING_SAMPLES) * Math.PI * 2;
        const pt = pointOnRing(angle, z);
        if (s === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      const fade = Math.sin(Math.PI * (1 - z)); // 0 at both ends, 1 midway
      ctx.strokeStyle = `rgba(80,230,255,${(0.2 + 0.35 * musicSwell) * fade})`;
      ctx.lineWidth = 2;
      ctx.shadowColor = '#50e6ff';
      ctx.shadowBlur = 10 + 12 * musicShimmer;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  drawCircuits();

  // pulse glow overlay on spokes (sample brightness at a few angles per pulse)
  if (pulses.length) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of pulses) {
      const age = t - p.startTime;
      const z = Math.min(1, age * 1.8);
      const fade = Math.max(0, 1 - age / 0.6);
      if (fade <= 0) continue;
      ctx.beginPath();
      for (let s = 0; s <= RING_SAMPLES; s++) {
        const angle = (s / RING_SAMPLES) * Math.PI * 2;
        const pt2 = pointOnRing(angle, z);
        if (s === 0) ctx.moveTo(pt2.x, pt2.y);
        else ctx.lineTo(pt2.x, pt2.y);
      }
      ctx.strokeStyle = `rgba(255,40,180,${0.6 * fade})`;
      ctx.lineWidth = 3;
      ctx.shadowColor = '#ff2db4';
      ctx.shadowBlur = 20;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }
}

const ENEMY_COLORS = {
  drone:     { rgb: '60,255,140', hex: '#3f6' },
  weaver:    { rgb: '255,120,60', hex: '#ff783c' },
  shooter:   { rgb: '60,190,255', hex: '#3cbeff' },
  grid:      { rgb: '220,255,60', hex: '#dcff3c' },
  pentagram: { rgb: '255,20,50',  hex: '#ff1432' },
  intruder:  { rgb: '255,60,220', hex: '#ff3cdc' }, // sent by a versus opponent
  rock:      { rgb: '200,150,100', hex: '#c8966a' }
};

function drawEnemies() {
  for (const e of enemies) {
    const pt = pointOnRing(e.angle, e.z);
    const size = Math.max(3, 18 * (1 - e.z) + 4);
    const bright = pulseBrightness(e.angle, e.z);
    const glow = 10 + bright * 30;
    const col = ENEMY_COLORS[e.type] || ENEMY_COLORS.drone;
    // shooters hold still and aim, grid marchers stay flat and upright like
    // the classics, pentagrams turn slow and deliberate like they're not in
    // any hurry, everyone else tumbles
    const spin = e.type === 'shooter' ? e.angle : e.type === 'grid' || e.type === 'weaver' ? 0
      : e.type === 'rock' ? t * 0.6 + e.phase
      : e.type === 'pentagram' ? t * 0.4 + e.angle
      : t * 1.5 + e.angle;
    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.rotate(spin);
    ctx.strokeStyle = bright > 0.1
      ? `rgba(${Math.floor(255 - bright*180)},255,${Math.floor(180 + bright*75)},1)`
      : `rgba(${col.rgb},0.85)`;
    ctx.shadowColor = bright > 0.1 ? '#fff' : col.hex;
    ctx.shadowBlur = glow;
    ctx.lineWidth = 2;

    ctx.beginPath();
    if (e.shape === 'tri') {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const x = Math.cos(a) * size, y = Math.sin(a) * size;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    } else if (e.shape === 'hex') {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const x = Math.cos(a) * size, y = Math.sin(a) * size;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    } else if (e.shape === 'square') {
      ctx.rect(-size * 0.8, -size * 0.8, size * 1.6, size * 1.6);
    } else if (e.shape === 'invader') {
      // blocky, stepped-edge silhouette — a throwback to the classic marching grid
      const ip = [
        [-0.3, -1], [0.3, -1], [0.3, -0.6], [0.6, -0.6], [0.6, -0.2], [1, -0.2], [1, 0.2],
        [0.6, 0.2], [0.6, 0.6], [0.3, 0.6], [0.3, 1], [-0.3, 1], [-0.3, 0.6], [-0.6, 0.6],
        [-0.6, 0.2], [-1, 0.2], [-1, -0.2], [-0.6, -0.2], [-0.6, -0.6], [-0.3, -0.6]
      ];
      ip.forEach(([x, y], i) => {
        const px = x * size * 0.75, py = y * size * 0.75;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.closePath();
    } else if (e.shape === 'rock') {
      // a lumpy asteroid, its outline fixed per rock (seeded by its phase)
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const rr = size * (0.85 + 0.45 * hash2(e.phase * 10, i));
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
    } else if (e.shape === 'squid') {
      // the weaver: an alien jellyfish (a dome with trailing tentacles), so
      // nothing hostile reads as one of the player's own interceptors
      ctx.arc(0, 0, size * 0.85, Math.PI, 0);
      ctx.lineTo(size * 0.85, size * 0.15);
      ctx.lineTo(-size * 0.85, size * 0.15);
      ctx.closePath();
      for (let k = -2; k <= 2; k++) {
        const x0 = k * size * 0.36;
        ctx.moveTo(x0, size * 0.15);
        for (let j = 1; j <= 3; j++) {
          const wig = Math.sin(t * 6 + k + j) * size * 0.16;
          ctx.lineTo(x0 + wig, size * (0.15 + j * 0.33));
        }
      }
    } else if (e.shape === 'pentagram') {
      // inverted five-pointed star — something hellish riding the current in
      const outerR = size * 1.15, innerR = size * 0.44;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + Math.PI; // point-down
        const rr = i % 2 === 0 ? outerR : innerR;
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    } else {
      ctx.arc(0, 0, size, 0, Math.PI * 2);
    }
    ctx.stroke();
    if (e.shape === 'pentagram') {
      // the ritual-circle ring that reads as "occult emblem" rather than
      // just a star outline
      ctx.beginPath();
      ctx.arc(0, 0, size * 1.45, 0, Math.PI * 2);
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.25;
      ctx.stroke();
      ctx.globalAlpha = 1;
      // second hit left it cracked/bleeding out instead of unharmed-looking
      if (e.hp === 1) {
        ctx.beginPath();
        ctx.moveTo(-size * 0.3, -size * 0.2);
        ctx.lineTo(size * 0.2, size * 0.5);
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

function drawEnemyBolts() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const eb of enemyBolts) {
    if (eb.z < -0.4 || eb.z > 1.1) continue;
    const p1 = pointOnRing(eb.angle, Math.min(1, eb.z + 0.04));
    const p2 = pointOnRing(eb.angle, Math.max(0, eb.z - 0.015));
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = '#3cbeff';
    ctx.shadowColor = '#3cbeff';
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

function drawWatchdog(pt, size) {
  // the Watchdog: two legs, a heavy top bar and a head with a slit
  // eye that flares just before it stomps
  const S = size * 1.1;
  const warn = boss.stompTimer < 0.9 || boss.lunge > 0;
  ctx.save();
  ctx.translate(pt.x, pt.y + Math.sin(t * 3) * S * 0.03);
  ctx.strokeStyle = '#ff2a2a';
  ctx.shadowColor = '#ff2a2a';
  ctx.shadowBlur = 22;
  ctx.lineWidth = 3;
  ctx.beginPath();
  // left leg, top bar, right leg (one outline)
  ctx.moveTo(-S * 1.0, S * 0.95);
  ctx.lineTo(-S * 1.0, -S * 0.25);
  ctx.lineTo(-S * 0.75, -S * 0.6);
  ctx.lineTo(S * 0.75, -S * 0.6);
  ctx.lineTo(S * 1.0, -S * 0.25);
  ctx.lineTo(S * 1.0, S * 0.95);
  ctx.lineTo(S * 0.7, S * 0.95);
  ctx.lineTo(S * 0.7, -S * 0.15);
  ctx.lineTo(-S * 0.7, -S * 0.15);
  ctx.lineTo(-S * 0.7, S * 0.95);
  ctx.closePath();
  ctx.stroke();
  // head hanging under the bar
  ctx.beginPath();
  ctx.moveTo(-S * 0.3, -S * 0.15);
  ctx.lineTo(-S * 0.22, S * 0.22);
  ctx.lineTo(S * 0.22, S * 0.22);
  ctx.lineTo(S * 0.3, -S * 0.15);
  ctx.stroke();
  // facet lines on the bar and legs
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.6;
  for (const x of [-0.85, 0.85]) {
    ctx.beginPath();
    ctx.moveTo(x * S, -S * 0.2);
    ctx.lineTo(x * S, S * 0.95);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-S * 0.75, -S * 0.38);
  ctx.lineTo(S * 0.75, -S * 0.38);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // eye
  ctx.fillStyle = warn ? '#ffffff' : '#ffd23f';
  ctx.shadowColor = warn ? '#ffffff' : '#ffd23f';
  ctx.shadowBlur = warn ? 30 : 14;
  ctx.fillRect(-S * 0.16, S * 0.02, S * 0.32, S * (warn ? 0.09 : 0.05));
  ctx.restore();
}

// Bosses are warships seen head-on as they come down the tunnel: a twin-
// boom gunship (miniboss), a dreadnought (level boss) and a mothership
// (final boss). Coordinates are in units of S, +y down.
function bossLine(pts, close) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (close) ctx.closePath();
  ctx.stroke();
}

function drawGunship(S) {
  const u = (pts) => pts.map(([x, y]) => [x * S, y * S]);
  bossLine(u([[-1.2, -0.5], [-0.8, -0.5], [-0.8, 0.7], [-1.2, 0.7]]), true);  // left boom
  bossLine(u([[0.8, -0.5], [1.2, -0.5], [1.2, 0.7], [0.8, 0.7]]), true);      // right boom
  bossLine(u([[-0.8, 0.05], [0.8, 0.05]]));                                  // wing spar
  bossLine(u([[-0.35, -0.35], [0.35, -0.35], [0.5, 0.3], [0, 0.55], [-0.5, 0.3]]), true); // pod
  ctx.fillStyle = '#ffd23f';
  ctx.shadowColor = '#ffd23f';
  ctx.fillRect(-0.2 * S, -0.22 * S, 0.4 * S, 0.12 * S); // lit cockpit
  for (const x of [-1, 1]) {                                                 // guns
    bossLine(u([[x, -0.5], [x, -0.95]]));
  }
}

function drawDreadnought(S) {
  const u = (pts) => pts.map(([x, y]) => [x * S, y * S]);
  // wedge hull
  bossLine(u([[-1.45, 0.1], [-0.9, -0.35], [-0.3, -0.5], [0, -0.62], [0.3, -0.5], [0.9, -0.35],
              [1.45, 0.1], [0.9, 0.45], [0.3, 0.56], [-0.3, 0.56], [-0.9, 0.45]]), true);
  // bridge tower with a window slit
  bossLine(u([[-0.2, -0.55], [-0.2, -1.0], [0.2, -1.0], [0.2, -0.55]]));
  ctx.save();
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.6;
  bossLine(u([[-0.12, -0.86], [0.12, -0.86]]));
  // hull panel lines
  bossLine(u([[-1.45, 0.1], [1.45, 0.1]]));
  bossLine(u([[-0.9, -0.35], [-0.9, 0.45]]));
  bossLine(u([[0.9, -0.35], [0.9, 0.45]]));
  bossLine(u([[-0.3, -0.5], [-0.3, 0.56]]));
  bossLine(u([[0.3, -0.5], [0.3, 0.56]]));
  ctx.restore();
  // turrets
  for (const [x, y] of [[-0.6, -0.12], [0.6, -0.12], [0, 0.3]]) {
    ctx.beginPath();
    ctx.arc(x * S, y * S, 0.1 * S, 0, Math.PI * 2);
    ctx.stroke();
    bossLine(u([[x, y], [x + 0.05, y - 0.28]]));
  }
  // glowing engines
  ctx.fillStyle = `rgba(255,170,60,${0.6 + Math.sin(t * 9) * 0.25})`;
  ctx.shadowColor = '#ffaa3c';
  for (const x of [-1.15, 1.15]) {
    ctx.beginPath();
    ctx.arc(x * S, 0.28 * S, 0.16 * S, 0, Math.PI * 2);
    ctx.fill();
  }
  // blinking running lights at the wing tips
  if (Math.sin(t * 5) > 0) {
    ctx.fillStyle = '#ff2a2a';
    for (const x of [-1.45, 1.45]) ctx.fillRect(x * S - 3, 0.1 * S - 3, 6, 6);
  }
}

function drawMothership(S) {
  // a huge saucer with a rotating crown of spikes and a glowing reactor eye
  ctx.beginPath();
  ctx.ellipse(0, 0, 1.6 * S, 0.55 * S, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, -0.1 * S, 0.9 * S, 0.3 * S, 0, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.save();
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.55;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 + t * 0.4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 0.95 * S, Math.sin(a) * 0.33 * S);
    ctx.lineTo(Math.cos(a) * 1.6 * S, Math.sin(a) * 0.55 * S);
    ctx.stroke();
  }
  ctx.restore();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + t * 0.4;
    const x = Math.cos(a) * 1.6 * S, y = Math.sin(a) * 0.55 * S;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x * 1.18, y * 1.18 - 0.08 * S);
    ctx.stroke();
  }
  const pulse = 0.6 + Math.sin(t * 6) * 0.3;
  ctx.fillStyle = `rgba(255,60,40,${pulse})`;
  ctx.shadowColor = '#ff3c28';
  ctx.shadowBlur = 40;
  ctx.beginPath();
  ctx.arc(0, 0.05 * S, 0.28 * S, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, 0.05 * S, 0.09 * S, 0, Math.PI * 2);
  ctx.fill();
}

function drawBoss() {
  if (!boss || !boss.alive) return;
  const pt = pointOnRing(boss.angle, boss.z);
  const size = Math.max(10, 50 * (1 - boss.z) + 14);
  if (boss.form === 'watchdog') { drawWatchdog(pt, size); return; }
  ctx.save();
  ctx.translate(pt.x, pt.y);
  ctx.rotate(Math.sin(t * 0.8) * 0.08); // a heavy, slow bank
  ctx.strokeStyle = '#ff5533';
  ctx.shadowColor = '#ff5533';
  ctx.shadowBlur = 20 + Math.sin(t * 4) * 6;
  ctx.lineWidth = 2.5;
  if (boss.kind === 'mini') drawGunship(size * 0.9);
  else if (boss.kind === 'final') drawMothership(size * 0.95);
  else drawDreadnought(size);
  ctx.restore();
}

function drawPowerups() {
  for (const p of powerups) {
    const pt = pointOnRing(p.angle, p.z);
    const size = Math.max(4, 17 * (1 - p.z) + 5);
    ctx.save();
    ctx.translate(pt.x, pt.y);
    if (p.kind === 'disc') {
      // a small lambda disc, edge-on and spinning
      ctx.scale(1, 0.55 + Math.sin(t * 5) * 0.35);
      ctx.strokeStyle = '#e8fdff';
      ctx.shadowColor = '#50e6ff';
      ctx.shadowBlur = 18;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, size, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.kind === 'echo') {
      // lime ripples: three rings drifting apart and back, like a reverb
      ctx.strokeStyle = '#b4ff5a';
      ctx.shadowColor = '#b4ff5a';
      ctx.shadowBlur = 16;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const off = Math.sin(t * 4 + i) * size * 0.25;
        ctx.beginPath();
        ctx.arc(off * (i - 1), 0, size * (0.45 + i * 0.25), 0, Math.PI * 2);
        ctx.globalAlpha = 1 - i * 0.28;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (p.kind === 'shield') {
      // cyan hexagon with an inner ring: reads as a force field
      ctx.rotate(t * 1.2);
      ctx.strokeStyle = '#50e6ff';
      ctx.shadowColor = '#50e6ff';
      ctx.shadowBlur = 16 + Math.sin(t * 6) * 4;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        if (i === 0) ctx.moveTo(Math.cos(a) * size, Math.sin(a) * size);
        else ctx.lineTo(Math.cos(a) * size, Math.sin(a) * size);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.45, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.kind === 'bomb') {
      // magenta burst (the bomb's blast): eight spikes around a core, throbbing
      ctx.rotate(-t * 3);
      const throb = 1 + Math.sin(t * 12) * 0.15;
      ctx.strokeStyle = '#ff78ff';
      ctx.shadowColor = '#ff78ff';
      ctx.shadowBlur = 22;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const rr = (i % 2 === 0 ? size * 1.15 : size * 0.4) * throb;
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.stroke();
    } else if (p.kind === 'star') {
      // a Mario-star-like pickup: spins faster, flickers white/gold, unmissable
      ctx.rotate(t * 2.4);
      const flicker = Math.sin(t * 14) > 0;
      ctx.strokeStyle = flicker ? '#ffffff' : '#ffd23f';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 20 + Math.sin(t * 10) * 8;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const outerR = size * 1.1, innerR = size * 0.44;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 === 0 ? outerR : innerR;
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    } else {
      ctx.rotate(t * 0.9);
      ctx.strokeStyle = '#ffd23f';
      ctx.shadowColor = '#ffd23f';
      ctx.shadowBlur = 16 + Math.sin(t * 6) * 4;
      ctx.lineWidth = 2;
      // outlined triangle
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(a) * size, y = Math.sin(a) * size;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      // plus sign: reads as a repair pickup
      ctx.beginPath();
      ctx.moveTo(-size * 0.32, 0.08 * size);
      ctx.lineTo(size * 0.32, 0.08 * size);
      ctx.moveTo(0, -size * 0.22);
      ctx.lineTo(0, size * 0.38);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Per-class silhouettes, in hull units (multiplied by the ship size s).
// hull: outline polygon; facets: faint cut lines; struts: brighter fins or
// barrels; pods: [x0, y0, x1, y1] grilled boxes; engines: [x, y, halfWidth]
// flame mouths; cores: white engine glows; knotY: where the valknut sits.
const SHIP_SHAPES = [
  { // VIPER: the original blocky gem-cut hull with stub fins and pods
    hull: [[0, -0.95], [0.55, -0.5], [0.78, 0.05], [0.42, 0.6], [0, 0.82], [-0.42, 0.6], [-0.78, 0.05], [-0.55, -0.5]],
    facets: [[[0, -0.95], [0.78, 0.05]], [[0, -0.95], [-0.78, 0.05]], [[0, 0.82], [0.78, 0.05]], [[0, 0.82], [-0.78, 0.05]],
             [[-0.78, 0.05], [0.78, 0.05]], [[0.55, -0.5], [0.42, 0.6]], [[-0.55, -0.5], [-0.42, 0.6]]],
    struts: [[[0.78, 0.05], [1.25, 0.12]], [[-0.78, 0.05], [-1.25, 0.12]]],
    pods: [[1.05, -0.08, 1.5, 0.3], [-1.5, -0.08, -1.05, 0.3]],
    engines: [[1.275, 0.3, 0.155], [-1.275, 0.3, 0.155]],
    cores: [[1.5, 0.11], [-1.5, 0.11]],
    knotY: -0.15
  },
  { // INTERCEPTOR: a long, narrow dart with swept-back wings and one engine
    hull: [[0, -1.3], [0.2, -0.55], [0.3, 0.05], [1.2, 0.6], [1.0, 0.7], [0.28, 0.48], [0.14, 0.78], [-0.14, 0.78],
           [-0.28, 0.48], [-1.0, 0.7], [-1.2, 0.6], [-0.3, 0.05], [-0.2, -0.55]],
    facets: [[[0, -1.3], [0, 0.78]], [[0.3, 0.05], [1.0, 0.7]], [[-0.3, 0.05], [-1.0, 0.7]], [[-0.2, -0.55], [0.2, -0.55]]],
    struts: [[[1.2, 0.6], [1.2, 0.05]], [[-1.2, 0.6], [-1.2, 0.05]]],
    pods: [],
    engines: [[0, 0.78, 0.14]],
    cores: [[1.2, 0.05], [-1.2, 0.05]],
    knotY: -0.25
  },
  { // TANK: a wide armoured slab with heavy tread pods and a turret barrel
    hull: [[-0.7, -0.72], [0.7, -0.72], [1.02, -0.35], [1.02, 0.55], [0.7, 0.82], [-0.7, 0.82], [-1.02, 0.55], [-1.02, -0.35]],
    facets: [[[-1.02, -0.05], [1.02, -0.05]], [[-1.02, 0.3], [1.02, 0.3]], [[-0.7, -0.72], [-0.7, 0.82]], [[0.7, -0.72], [0.7, 0.82]]],
    struts: [[[0, -0.45], [0, -1.2]], [[0.08, -0.45], [0.08, -1.12]], [[-0.08, -0.45], [-0.08, -1.12]]],
    pods: [[1.08, -0.55, 1.55, 0.7], [-1.55, -0.55, -1.08, 0.7]],
    engines: [[1.315, 0.7, 0.17], [-1.315, 0.7, 0.17]],
    cores: [[1.315, 0.62], [-1.315, 0.62]],
    knotY: 0.12,
    turret: 0.32
  },
  { // GUNNER: broad delta wings and a three-barrel cannon up front
    hull: [[0, -0.72], [0.55, -0.45], [1.35, 0.28], [0.62, 0.42], [0, 0.78], [-0.62, 0.42], [-1.35, 0.28], [-0.55, -0.45]],
    facets: [[[0, -0.72], [0, 0.78]], [[0.55, -0.45], [0.62, 0.42]], [[-0.55, -0.45], [-0.62, 0.42]]],
    struts: [[[0, -0.72], [0, -1.32]], [[0.32, -0.56], [0.32, -1.12]], [[-0.32, -0.56], [-0.32, -1.12]]],
    pods: [[1.25, 0.1, 1.6, 0.4], [-1.6, 0.1, -1.25, 0.4]],
    engines: [[0.42, 0.55, 0.13], [-0.42, 0.55, 0.13]],
    cores: [[1.6, 0.25], [-1.6, 0.25]],
    knotY: 0.05
  }
];

// Draws a ship. With no options: the player's ship at its live position
// (sliding, bobbing, recoil, hit wobble, shield). Options draw elsewhere:
// { g: canvas context, x, y, s: size, lean, alpha, classIndex, ghost, palette }.
function drawShip(opts) {
  opts = opts || {};
  const g = opts.g || ctx;
  const cls = opts.classIndex !== undefined ? opts.classIndex : shipClassIndex;
  const shape = SHIP_SHAPES[cls];
  const live = !opts.g && !opts.ghost;
  const s = opts.s || Math.min(W, H) * 0.095 * SHIP_CLASSES[cls].scale;
  let sx, sy, lean;
  if (opts.x !== undefined) {
    sx = opts.x; sy = opts.y; lean = opts.lean || 0;
  } else {
    // slides along the bottom with the aim, bobs gently, kicks back on each
    // shot and shudders when hit
    const pos = shipScreenPos(shipLane);
    // recoil pushes it back out toward the screen edge
    const out = Math.sin(t * 2.6) * s * 0.06 + shipRecoil * s * 0.12;
    sx = pos.x + Math.sin(shipLane) * out + Math.sin(t * 40) * 6 * shipHitWobble;
    sy = pos.y - Math.cos(shipLane) * out;
    // nose toward the tunnel's centre, banking into the slide
    lean = shipLane - Math.PI + Math.max(-0.35, Math.min(0.35, -shipLaneVel * 0.06)) + Math.sin(t * 33) * 0.08 * shipHitWobble;
  }
  const pal = opts.palette || SHIP_PALETTES[shipPaletteIndex];

  g.save();
  g.globalAlpha = opts.alpha !== undefined ? opts.alpha : 1;
  g.translate(sx, sy);
  g.rotate(lean);
  g.scale(1, 0.82); // looking slightly down onto the hull

  const P = (x, y) => [x * s, y * s];
  const strokeShape = (pts, close) => {
    g.beginPath();
    pts.forEach((pt, i) => {
      const [x, y] = P(pt[0], pt[1]);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    });
    if (close) g.closePath();
    g.stroke();
  };
  const strokeLine = (a, b) => {
    g.beginPath();
    g.moveTo(...P(a[0], a[1]));
    g.lineTo(...P(b[0], b[1]));
    g.stroke();
  };

  // thruster flames: flicker constantly, flare on recoil and on a boost pad
  const hot = live && boostTimer > 0;
  const flare = 1 + (live ? shipRecoil * 0.8 : 0) + (hot ? 0.6 : 0);
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (const [ex, ey, ew] of shape.engines) {
    const len = (0.35 + Math.random() * 0.25) * flare;
    g.beginPath();
    g.moveTo((ex - ew) * s, ey * s);
    g.lineTo(ex * s, (ey + len) * s);
    g.lineTo((ex + ew) * s, ey * s);
    g.strokeStyle = hot ? 'rgba(255,150,60,0.9)' : hexToRgba(pal.glow, 0.85);
    g.shadowColor = hot ? '#ff8c28' : pal.glow;
    g.shadowBlur = 14;
    g.lineWidth = 1.6;
    g.stroke();
    g.beginPath();
    g.moveTo((ex - ew * 0.5) * s, ey * s);
    g.lineTo(ex * s, (ey + len * 0.55) * s);
    g.lineTo((ex + ew * 0.5) * s, ey * s);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 1;
    g.stroke();
  }
  g.restore();

  // hull outline
  g.strokeStyle = pal.main;
  g.shadowColor = pal.glow;
  g.shadowBlur = 16;
  g.lineWidth = 2.2;
  strokeShape(shape.hull, true);
  if (shape.turret) {
    g.beginPath();
    g.arc(0, -0.2 * s, shape.turret * s, 0, Math.PI * 2);
    g.stroke();
  }

  // internal facet lines
  g.lineWidth = 1;
  g.shadowBlur = 6;
  g.strokeStyle = hexToRgba(pal.main, 0.5);
  for (const [a, b] of shape.facets) strokeLine(a, b);

  // fins / barrels
  g.strokeStyle = hexToRgba(pal.main, 0.85);
  g.shadowColor = pal.glow;
  g.shadowBlur = 10;
  g.lineWidth = 1.8;
  for (const [a, b] of shape.struts) strokeLine(a, b);

  // pods with grille stripes
  g.lineWidth = 1.6;
  for (const [x0, y0, x1, y1] of shape.pods) {
    strokeShape([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true);
    g.lineWidth = 0.8;
    const rows = Math.max(3, Math.round((y1 - y0) / 0.12));
    for (let r = 1; r < rows; r++) {
      const y = y0 + (y1 - y0) * r / rows;
      strokeLine([x0, y], [x1, y]);
    }
    g.lineWidth = 1.6;
  }

  // bright engine glows
  g.fillStyle = '#fff';
  g.shadowColor = '#fff';
  g.shadowBlur = 10;
  for (const [cx0, cy0] of shape.cores) {
    const [x, y] = P(cx0, cy0);
    g.beginPath();
    g.arc(x, y, 0.04 * s, 0, Math.PI * 2);
    g.fill();
  }

  // valknut emblem
  g.strokeStyle = pal.glow;
  g.shadowColor = pal.glow;
  g.shadowBlur = 8;
  g.lineWidth = 1;
  const knotR = 0.15, knotY = shape.knotY;
  for (let k = 0; k < 3; k++) {
    const rot = (k / 3) * Math.PI * 2;
    g.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = rot + (i / 3) * Math.PI * 2 - Math.PI / 2;
      const [x, y] = P(Math.cos(a) * knotR, knotY + Math.sin(a) * knotR);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    g.stroke();
  }

  // overcharged plasma: a pulsing hex cage, flickering when nearly spent
  const over = plasmaMax ? (plasma - plasmaMax) / plasmaMax : 0;
  if (live && over > 0 && (over > 0.2 || Math.sin(t * 30) > 0)) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.rotate(t * 0.8);
    const r = s * (1.75 + Math.sin(t * 6) * 0.05);
    g.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.strokeStyle = 'rgba(80,230,255,0.75)';
    g.shadowColor = '#50e6ff';
    g.shadowBlur = 18;
    g.lineWidth = 2;
    g.stroke();
    g.restore();
  }

  g.restore();
}

// Echo ghosts: two faded copies of the ship riding above it, each replaying
// where the real ship was ECHO_DELAYS[i] seconds ago.
function drawEchoGhosts() {
  if (echoTimer <= 0) return;
  const base = Math.min(W, H) * 0.095 * shipClass().scale;
  const sy = H - Math.min(W, H) * 0.11;
  const fade = echoTimer < 1.5 && Math.sin(t * 30) < 0 ? 0.15 : 1;
  ECHO_DELAYS.forEach((delay, i) => {
    const past = echoSample(t - delay);
    // ride the arc where the ship was, a little further in toward the centre
    const pos = shipScreenPos(past.lane);
    const inward = 0.16 + 0.1 * i;
    drawShip({
      ghost: true,
      x: pos.x + (CX - pos.x) * inward,
      y: pos.y + (CY - pos.y) * inward,
      s: base * (0.55 - 0.08 * i),
      lean: past.lane - Math.PI,
      alpha: (0.75 - 0.15 * i) * fade,
      palette: { main: '#b4ff5a', glow: '#b4ff5a' } // lime, like their echo shots
    });
  });
}

function drawBolts() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of bolts) {
    if (b.hidden) continue;
    const p1 = pointOnRing(b.angle, Math.max(0, b.z - 0.05));
    const p2 = pointOnRing(b.angle, Math.min(1, b.z + 0.02));
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    const boltColor = b.owner !== undefined ? COOP_COLORS[b.owner] : b.echo ? '#b4ff5a' : '#a855ff';
    ctx.strokeStyle = boltColor;
    ctx.shadowColor = boltColor;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

function drawParticles() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const p of particles) {
    // streak back along the velocity: long while fast, shrinking to a dot
    const a = Math.max(0, Math.min(1, p.life * 1.6));
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
    ctx.strokeStyle = `rgba(${p.color || '180,100,255'},${a})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

function drawBitBursts() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.font = "bold 13px 'Press Start 2P', 'Courier New', monospace";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const bb of bitBursts) {
    // genuinely random flicker: skip some frames entirely for a glitchy feel
    if (Math.random() < 0.25) continue;
    const fade = Math.max(0, bb.life / bb.maxLife);
    ctx.globalAlpha = fade;
    ctx.fillStyle = bb.color || '#3f6';
    ctx.shadowColor = bb.color || '#3f6';
    ctx.shadowBlur = Math.random() < 0.5 ? 10 : 2;
    ctx.fillText(bb.char, bb.x, bb.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawHitLabels() {
  ctx.save();
  ctx.font = "10px 'Press Start 2P', 'Courier New', monospace";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const hl of hitLabels) {
    const fade = Math.max(0, hl.life / hl.maxLife);
    ctx.globalAlpha = fade;
    ctx.fillStyle = hl.color || '#fff';
    ctx.shadowColor = hl.color || '#fff';
    ctx.shadowBlur = 8;
    ctx.font = `${hl.size || 10}px 'Press Start 2P', 'Courier New', monospace`;
    ctx.fillText(hl.text || 'HIT!', hl.x, hl.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawWarp() {
  if (warpTimer <= 0 && !spikes.length) return;
  const intensity = Math.max(0, (warpBoost() - 1) / 6);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // star streaks racing past along the walls
  for (let i = 0; i < 48; i++) {
    const angle = (i * 2.399963) % (Math.PI * 2); // golden-angle spread
    const z = 1 - ((tunnelTravel * 2.2 + i * 0.137) % 1);
    const a = pointOnRing(angle, Math.min(1, z + 0.16));
    const b = pointOnRing(angle, z);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = `rgba(200,220,255,${0.6 * intensity * (1 - z)})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // spikes: jagged green barbs along the wall, like Tempest's
  for (const sp of spikes) {
    if (sp.z < 0) continue;
    ctx.beginPath();
    const steps = 6;
    for (let k = 0; k <= steps; k++) {
      const z = Math.min(1, sp.z + (k / steps) * 0.2);
      const jag = (k % 2 === 0 ? 0.05 : -0.05);
      const pt = pointOnRing(sp.angle + jag, z);
      if (k === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
    }
    const danger = inShipLane(sp.angle, 0.35); // red when it's coming down your lane
    ctx.strokeStyle = danger ? '#ff3355' : '#3f6';
    ctx.shadowColor = danger ? '#ff3355' : '#3f6';
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  ctx.restore();
}

function drawCores() {
  for (const c of cores) {
    const pt = pointOnRing(c.angle, c.z);
    const size = Math.max(5, 16 * (1 - c.z) + 5);
    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.rotate(t * 1.8);
    // cyan data core: a spinning diamond around a bright, pulsing centre
    ctx.strokeStyle = '#50e6ff';
    ctx.shadowColor = '#50e6ff';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.7, 0);
    ctx.lineTo(0, size);
    ctx.lineTo(-size * 0.7, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = '#e8fdff';
    ctx.beginPath();
    ctx.arc(0, 0, size * (0.18 + Math.sin(t * 9) * 0.06), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawCircuits() {
  ctx.save();
  // the etched traces, faint, with a solder pad at every jog
  ctx.strokeStyle = 'rgba(80,230,255,0.13)';
  ctx.fillStyle = 'rgba(80,230,255,0.22)';
  ctx.lineWidth = 1;
  for (const pts of CIRCUIT_TRACES) {
    ctx.beginPath();
    pts.forEach(([a, z], i) => {
      const pt = pointOnRing(a, z);
      if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();
    for (let i = 1; i < pts.length - 1; i++) {
      const pt = pointOnRing(pts[i][0], pts[i][1]);
      const d = 4 * (1 - pts[i][1]) + 1;
      ctx.fillRect(pt.x - d / 2, pt.y - d / 2, d, d);
    }
  }
  // light packets racing along them toward the horizon, with a short tail
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const cp of circuitPulses) {
    const pts = CIRCUIT_TRACES[cp.trace];
    ctx.beginPath();
    for (let k = 0; k <= 6; k++) {
      const [a, z] = tracePoint(pts, cp.u - k * 0.012);
      const pt = pointOnRing(a, z);
      if (k === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
    }
    const [, zHead] = tracePoint(pts, cp.u);
    ctx.strokeStyle = `rgba(150,245,255,${0.85 * (1 - zHead) + 0.15})`;
    ctx.shadowColor = '#50e6ff';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 3 * (1 - zHead) + 1;
    ctx.stroke();
  }
  ctx.restore();
}

function drawAimTrail() {
  if (state !== 'playing' || aimTrail.length < 2) return;
  // a light-racer wall around the tunnel, just inside the screen edge,
  // fading out behind the aim line
  const pal = SHIP_PALETTES[shipPaletteIndex];
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.shadowColor = pal.glow;
  ctx.shadowBlur = 14;
  for (let i = 1; i < aimTrail.length; i++) {
    const a0 = aimTrail[i - 1].angle, a1 = aimTrail[i].angle;
    if (Math.abs(normalizeAngle(a1 - a0)) > 1) continue; // skip a wrap-around jump
    const age = (t - aimTrail[i].t) / 0.5;
    const p0 = pointOnRing(a0, 0.1, { visual: false });
    const p1 = pointOnRing(a1, 0.1, { visual: false });
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.strokeStyle = hexToRgba(pal.glow, 0.9 * (1 - age));
    ctx.lineWidth = 8 * (1 - age) + 1;
    ctx.stroke();
  }
  ctx.restore();
}

function drawVoxels() {
  if (!voxels.length) return;
  // wireframe cubes: a front square plus an offset back square and joins
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 1;
  for (const v of voxels) {
    const a = Math.max(0, v.life / v.maxLife);
    const s = v.size;
    const d = s * 0.45; // depth offset for the back face
    ctx.strokeStyle = `rgba(${v.color},${a})`;
    ctx.fillStyle = `rgba(${v.color},${a * 0.25})`;
    ctx.beginPath();
    ctx.rect(v.x - s / 2, v.y - s / 2, s, s);
    ctx.fill();
    ctx.moveTo(v.x - s / 2 + d, v.y - s / 2 - d);
    ctx.lineTo(v.x + s / 2 + d, v.y - s / 2 - d);
    ctx.lineTo(v.x + s / 2 + d, v.y + s / 2 - d);
    ctx.moveTo(v.x - s / 2, v.y - s / 2); ctx.lineTo(v.x - s / 2 + d, v.y - s / 2 - d);
    ctx.moveTo(v.x + s / 2, v.y - s / 2); ctx.lineTo(v.x + s / 2 + d, v.y - s / 2 - d);
    ctx.moveTo(v.x + s / 2, v.y + s / 2); ctx.lineTo(v.x + s / 2 + d, v.y + s / 2 - d);
    ctx.stroke();
  }
  ctx.restore();
}

function drawNova() {
  if (novaFlash <= 0) return;
  // a magenta ring blasting outward from the event horizon to the player
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const z = novaFlash; // 1 (far) -> 0 (at the player)
  ctx.beginPath();
  for (let s = 0; s <= RING_SAMPLES; s++) {
    const pt = pointOnRing((s / RING_SAMPLES) * Math.PI * 2, z);
    if (s === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
  }
  ctx.strokeStyle = `rgba(255,120,255,${0.9 * Math.sin(Math.PI * novaFlash)})`;
  ctx.shadowColor = '#ff78ff';
  ctx.shadowBlur = 30;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = `rgba(255,120,255,${0.18 * novaFlash})`;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// Bullseye: whatever the shot will hit next (nearest enemy, or the boss, in
// line with the aim) gets a rotating lock-on reticle. With nothing in line,
// a faint bullseye sits out along the firing line so the aim always reads.
function findAimTarget() {
  let best = null;
  for (const e of enemies) {
    if (!e.alive || e.z > 0.95) continue;
    if (Math.abs(normalizeAngle(aimAngle - e.angle)) < 0.4 && (!best || e.z < best.z)) best = e;
  }
  if (boss && boss.alive && Math.abs(normalizeAngle(aimAngle - boss.angle)) < 0.4 && (!best || boss.z < best.z)) best = boss;
  for (const c of cores) {
    if (c.alive && Math.abs(normalizeAngle(aimAngle - c.angle)) < 0.4 && (!best || c.z < best.z)) best = c;
  }
  return best;
}

function drawLockBrackets(x, y, r) {
  const k = r * 0.35;
  const pulse = 1 + Math.sin(t * 10) * 0.05;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pulse, pulse);
  ctx.strokeStyle = '#fff27a';
  ctx.shadowColor = '#ffe14d';
  ctx.shadowBlur = 14;
  ctx.lineWidth = 3;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    ctx.beginPath();
    ctx.moveTo(sx * r, sy * r + -sy * k);
    ctx.lineTo(sx * r, sy * r);
    ctx.lineTo(sx * r + -sx * k, sy * r);
    ctx.stroke();
  }
  ctx.font = "9px 'Press Start 2P', 'Courier New', monospace";
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff3355';
  ctx.fillText('LOCK', 0, -r - 8);
  ctx.restore();
}

function drawBullseye(x, y, r, locked, color) {
  // yellow bullseye; a lock turns it white-hot with a red centre and ticks
  // (co-op gunners pass their own colour)
  const col = color || (locked ? '#fff27a' : 'rgba(255,225,77,0.9)');
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = col;
  ctx.shadowColor = '#ffe14d';
  ctx.shadowBlur = locked ? 18 : 10;
  ctx.lineWidth = locked ? 3.5 : 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(2, r * 0.1), 0, Math.PI * 2);
  ctx.fillStyle = locked ? '#ff3355' : col;
  ctx.fill();
  if (locked) ctx.strokeStyle = '#ff3355';
  // four rotating tick marks; a locked target's ticks spin in and pulse
  ctx.rotate(locked ? t * 3 : t * 0.6);
  const inner = r * (locked ? 1.1 + Math.sin(t * 10) * 0.08 : 1.15);
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(inner, 0);
    ctx.lineTo(inner + r * 0.45, 0);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAimLine() {
  // kept straight and unswirled: this is the player's own fixed reticle, not world geometry
  const outer = pointOnRing(aimAngle, 0.0, { visual: false });
  const inner = pointOnRing(aimAngle, 0.12, { visual: false });
  // all targeting reads in bright yellow so it pops against the purple tunnel
  ctx.beginPath();
  ctx.moveTo(inner.x, inner.y);
  ctx.lineTo(outer.x, outer.y);
  ctx.strokeStyle = 'rgba(255,225,77,0.9)';
  ctx.shadowColor = '#ffe14d';
  ctx.shadowBlur = 10;
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // reticle
  ctx.beginPath();
  ctx.arc(outer.x, outer.y, 12, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffe14d';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.shadowBlur = 0;

  if (state !== 'playing') return;
  // dotted firing line: the path a bolt will actually take down the tunnel
  ctx.fillStyle = 'rgba(255,225,77,0.85)';
  for (let z = 0.06; z < 0.6; z += 0.04) {
    const pt = pointOnRing(aimAngle, z);
    const d = 5 - z * 4; // dots shrink with distance
    ctx.fillRect(pt.x - d / 2, pt.y - d / 2, d, d);
  }
  const target = findAimTarget();
  if (target && target === boss) {
    // bosses get corner brackets framing the whole ship, not a bullseye over it
    const pt = pointOnRing(boss.angle, boss.z);
    drawLockBrackets(pt.x, pt.y, Math.max(16, 50 * (1 - boss.z) + 14) * 1.7);
  } else if (target) {
    const pt = pointOnRing(target.angle, target.z);
    const size = Math.max(10, 26 * (1 - target.z) + 8);
    drawBullseye(pt.x, pt.y, size, true);
  } else {
    const pt = pointOnRing(aimAngle, 0.45);
    drawBullseye(pt.x, pt.y, 14, false);
  }
}
