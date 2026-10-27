// VORTEX - Mouse/touch/keyboard input and the cockpit view.
// Plain script, loaded in order by index.html; shares globals with the others.

// ---------- Input ----------
let pointerX = CX, pointerY = CY - 1;

function updateAimFromPointer(x, y) {
  const dx = x - CX;
  const dy = y - CY;
  // 0 = up; in cockpit view the world is turned by viewRot, so add it back
  aimAngle = normalizeAngle(Math.atan2(dx, -dy) + viewRot);
}

// ---------- Cockpit view (SETTINGS: VIEW) ----------
// Chase view shows the ship riding its arc. Cockpit view hides it and puts
// you inside: the world turns so your lane stays under the nose
// (viewRot = COCKPIT_TURN of the ship's offset from the bottom; below 1, so
// aim and lane settle instead of chasing each other), and a canopy frame +
// dashboard with live gauges is drawn over everything.
const COCKPIT_TURN = 0.6;
let viewMode = 'chase';
let viewRot = 0;
try { if (store.getItem('vortex-view') === 'cockpit') viewMode = 'cockpit'; } catch (e) { /* ignore */ }

function updateView(dt) {
  const target = viewMode === 'cockpit' && state === 'playing' ? COCKPIT_TURN * normalizeAngle(shipLane - Math.PI) : 0;
  viewRot += (target - viewRot) * Math.min(1, dt * 8);
  // the world keeps turning under a still pointer, so keep the aim in step
  if (viewMode === 'cockpit' && state === 'playing') updateAimFromPointer(pointerX, pointerY);
}

// The cockpit (after the Game Boy era's flight sims, in VORTEX neon): a
// heavy bezel round the view with dithered corners, a mission clock on top,
// a speed ladder on the left and hull/plasma cells on the right, a compass
// strip under the glass, and a dashboard: LOCK ON panel + power cells, the
// radar scope with the flight mode, a sector map of the level's progress
// and the weapon slots.
let ditherPattern = null;
function cockpitDither(color) {
  if (!ditherPattern || ditherPattern.color !== color) {
    const c = document.createElement('canvas');
    c.width = c.height = 4;
    const g = c.getContext('2d');
    g.fillStyle = color;
    g.fillRect(0, 0, 2, 2);
    g.fillRect(2, 2, 2, 2);
    ditherPattern = { color, pattern: ctx.createPattern(c, 'repeat') };
  }
  return ditherPattern.pattern;
}

function cockpitLayout() {
  const m = Math.max(8, Math.min(W, H) * 0.02);
  const side = Math.max(26, Math.min(48, W * 0.045));
  const top = Math.max(30, Math.min(46, H * 0.06));
  const dash = Math.max(104, Math.min(176, H * 0.24));
  const strip = 18;
  return { m, side, top, dash, strip,
    vx0: m + side, vy0: top, vx1: W - m - side, vy1: H - dash - strip };
}

function drawCockpit() {
  const pal = SHIP_PALETTES[shipPaletteIndex];
  const accent = pal.glow;
  const L = cockpitLayout();
  const small = W < 600;
  const font = (px) => `${small ? Math.max(6, px - 2) : px}px 'Press Start 2P', 'Courier New', monospace`;
  const jolt = shipHitWobble * 8;
  const ox = (Math.random() - 0.5) * jolt, oy = (Math.random() - 0.5) * jolt + shipRecoil * 2;
  ctx.save();
  ctx.translate(ox, oy);

  // bezel: everything but the viewport (a rounded window), then its edges
  const r = 18;
  ctx.beginPath();
  ctx.rect(-30, -30, W + 60, H + 60);
  ctx.roundRect(L.vx0, L.vy0, L.vx1 - L.vx0, L.vy1 - L.vy0, r);
  ctx.fillStyle = 'rgb(14, 6, 30)';
  ctx.fill('evenodd');
  // dithered corner plates, like the old handheld bezels
  ctx.fillStyle = cockpitDither('rgba(168, 85, 255, 0.35)');
  const cs = Math.min(70, W * 0.08);
  for (const [x, y, sx, sy] of [[0, 0, 1, 1], [W, 0, -1, 1], [0, L.vy1 + L.strip, 1, -1], [W, L.vy1 + L.strip, -1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + sx * cs * 1.6, y); ctx.lineTo(x, y + sy * cs);
    ctx.closePath();
    ctx.fill();
  }
  ctx.lineWidth = 3;
  ctx.strokeStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.roundRect(L.vx0, L.vy0, L.vx1 - L.vx0, L.vy1 - L.vy0, r);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(232, 214, 255, 0.35)';
  ctx.beginPath();
  ctx.roundRect(L.vx0 - 6, L.vy0 - 6, L.vx1 - L.vx0 + 12, L.vy1 - L.vy0 + 12, r + 5);
  ctx.stroke();

  // mission clock plate, notched into the top edge
  const secs = missionType === 'survive' && gameMode === 'campaign' ? Math.max(0, SURVIVE_TIME - missionTime) : runT;
  const clock = String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(Math.floor(secs % 60)).padStart(2, '0');
  const pw = small ? 96 : 140, ph = L.top + 8;
  ctx.beginPath();
  ctx.moveTo(W / 2 - pw / 2 - 14, 0); ctx.lineTo(W / 2 + pw / 2 + 14, 0);
  ctx.lineTo(W / 2 + pw / 2, ph); ctx.lineTo(W / 2 - pw / 2, ph);
  ctx.closePath();
  ctx.fillStyle = 'rgb(24, 10, 48)';
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#fff6c8';
  ctx.shadowColor = '#ffe14d';
  ctx.shadowBlur = 10;
  ctx.font = font(small ? 14 : 20);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(clock, W / 2, ph / 2 + 2);
  ctx.shadowBlur = 0;
  // score and level ride on the bezel either side of the clock
  ctx.font = font(9);
  ctx.fillStyle = '#c9a0ff';
  ctx.textAlign = 'left';
  ctx.fillText('SC ' + score, L.vx0 + 4, L.top / 2);
  ctx.textAlign = 'right';
  ctx.fillText((gameMode === 'rift' ? 'DEPTH ' + riftDepth : 'LVL ' + currentLevel), L.vx1 - 4, L.top / 2);

  // speed ladder (left): ticks stream past with the tunnel, a marker shows speed
  const lx = L.m + 4, lw = L.side - 10, ly0 = L.vy0 + 10, ly1 = L.vy1 - 10;
  ctx.strokeStyle = 'rgba(232, 214, 255, 0.4)';
  ctx.strokeRect(lx, ly0, lw, ly1 - ly0);
  const flow = (runT * effectiveTunnelSpeed() * warpBoost() * 600) % 12;
  ctx.fillStyle = 'rgba(201, 160, 255, 0.75)';
  for (let y = ly0 + flow; y < ly1; y += 12) ctx.fillRect(lx + lw * 0.55, y, lw * 0.35, 1.5);
  const spd = Math.min(1, (effectiveTunnelSpeed() * warpBoost() * padSpeed()) / (TUNNEL_SPEED * 3));
  const my = ly1 - spd * (ly1 - ly0);
  ctx.fillStyle = '#ffe14d';
  ctx.beginPath();
  ctx.moveTo(lx - 2, my - 6); ctx.lineTo(lx + lw * 0.5, my); ctx.lineTo(lx - 2, my + 6);
  ctx.closePath();
  ctx.fill();
  ctx.font = font(7);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#c9a0ff';
  ctx.fillText('SPD', lx + lw / 2, ly1 + 10);

  // hull + plasma cells (right): hull from the bottom, plasma cells on top
  const cells = 10, rx = L.vx1 + 8, rw = L.side - 10;
  const ch = (ly1 - ly0) / cells;
  const hullCells = Math.ceil(Math.max(0, hull) / hullMax * 7);
  const plasmaCells = plasmaMax ? Math.ceil(Math.min(plasma, plasmaMax * 2) / plasmaMax * 1.5) : 0;
  const hf = hull / hullMax;
  for (let i = 0; i < cells; i++) {
    const y = ly1 - (i + 1) * ch + 2;
    let color = 'rgba(255,255,255,0.07)';
    if (i < 7 && i < hullCells) color = hf > 0.5 ? '#3f6' : hf > 0.25 ? '#ffcc33' : '#f33';
    if (i >= 7 && i - 7 < plasmaCells) color = plasma > plasmaMax ? '#e8fdff' : '#22ddff';
    ctx.fillStyle = color;
    ctx.fillRect(rx, y, rw, ch - 4);
  }
  ctx.fillStyle = '#c9a0ff';
  ctx.fillText('HP', rx + rw / 2, ly1 + 10);

  // compass strip under the glass: hazard stripes and the heading
  const sy = L.vy1 + 4, sh = L.strip - 4;
  ctx.save();
  ctx.beginPath();
  ctx.rect(L.vx0, sy, L.vx1 - L.vx0, sh);
  ctx.clip();
  ctx.fillStyle = 'rgba(255, 225, 77, 0.55)';
  for (let x = L.vx0 - 20; x < L.vx1 + 20; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, sy + sh); ctx.lineTo(x + 7, sy); ctx.lineTo(x + 13, sy); ctx.lineTo(x + 6, sy + sh);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  const cw = Math.min(180, W * 0.3);
  ctx.fillStyle = 'rgb(14, 6, 30)';
  ctx.fillRect(W / 2 - cw / 2, sy - 2, cw, sh + 4);
  ctx.strokeStyle = accent;
  ctx.strokeRect(W / 2 - cw / 2, sy - 2, cw, sh + 4);
  ctx.save();
  ctx.beginPath();
  ctx.rect(W / 2 - cw / 2, sy - 2, cw, sh + 4);
  ctx.clip();
  const heading = shipLane; // 0 = N (top of the ring), clockwise
  const pxPerRad = cw / 2.4;
  const marks = ['N', 'E', 'S', 'W'];
  ctx.font = font(9);
  ctx.textAlign = 'center';
  for (let k = -8; k <= 8; k++) {
    const a = Math.round(heading / (Math.PI / 4)) * (Math.PI / 4) + k * Math.PI / 4;
    const x = W / 2 + normalizeAngle(a - heading) * pxPerRad;
    const idx = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
    if (idx % 2 === 0) {
      ctx.fillStyle = '#e8d6ff';
      ctx.fillText(marks[idx / 2], x, sy + sh / 2 + 1);
    } else {
      ctx.fillStyle = 'rgba(232, 214, 255, 0.5)';
      ctx.fillRect(x - 0.5, sy + 2, 1, sh - 4);
    }
  }
  ctx.restore();
  ctx.fillStyle = '#ffe14d';
  ctx.fillRect(W / 2 - 1, sy - 4, 2, sh + 8);

  // dashboard
  const dy0 = L.vy1 + L.strip + 6, dy1 = H - L.m;
  const dh = dy1 - dy0;
  const panel = (x, y, w, h) => {
    ctx.fillStyle = 'rgb(24, 10, 48)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(232, 214, 255, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeRect(x + 3.5, y + 3.5, w - 7, h - 7);
  };
  // LOCK ON + power cells
  const lw0 = W * 0.3;
  const target = findAimTarget();
  panel(L.m, dy0, lw0, dh * 0.52);
  ctx.font = font(small ? 11 : 16);
  ctx.textAlign = 'center';
  let status, statusColor;
  if (warpTimer > 0) { status = 'WARP'; statusColor = '#ffffff'; }
  else if (lockinTimer > 0) { status = 'LOCK-IN'; statusColor = '#ffe14d'; }
  else if (target) { status = 'LOCK ON'; statusColor = '#ffe14d'; }
  else { status = 'SCAN'; statusColor = 'rgba(201, 160, 255, 0.6)'; }
  const blink = target && Math.sin(t * 14) < -0.2;
  ctx.fillStyle = blink ? 'rgba(255, 225, 77, 0.35)' : statusColor;
  ctx.shadowColor = statusColor;
  ctx.shadowBlur = target || lockinTimer > 0 ? 10 : 0;
  ctx.fillText(status, L.m + lw0 / 2, dy0 + dh * 0.26 + 1);
  ctx.shadowBlur = 0;
  panel(L.m, dy0 + dh * 0.58, lw0, dh * 0.42);
  ctx.font = font(9);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#c9a0ff';
  const py = dy0 + dh * 0.79;
  ctx.fillText('PWR', L.m + 10, py + 1);
  const cellsX = L.m + (small ? 42 : 52), cellW = (lw0 - (cellsX - L.m) - 12) / 5;
  for (let i = 0; i < 5; i++) {
    const lit = power >= (i + 1) * 20;
    const full = power >= 100 && Math.sin(t * 12) > 0;
    ctx.fillStyle = lit ? (full ? '#ffffff' : '#ffe14d') : 'rgba(255,255,255,0.08)';
    ctx.fillRect(cellsX + i * cellW, py - dh * 0.1, cellW - 4, dh * 0.2);
  }

  // radar scope + flight mode plate
  const rr = Math.min(dh * 0.4, W * 0.1);
  const rcx = W * 0.465, rcy = dy0 + rr + 2;
  drawRadar(rcx, rcy, rr, true);
  const mode = warpTimer > 0 ? 'WARP' : lockinTimer > 0 ? 'ORBIT' : bossActive ? 'COMBAT' : 'FLIGHT';
  ctx.font = font(8);
  const mw = small ? 64 : 84;
  ctx.fillStyle = 'rgb(24, 10, 48)';
  ctx.fillRect(rcx - mw / 2, dy1 - 18, mw, 16);
  ctx.strokeStyle = accent;
  ctx.strokeRect(rcx - mw / 2 + 0.5, dy1 - 17.5, mw - 1, 15);
  ctx.fillStyle = '#e8d6ff';
  ctx.textAlign = 'center';
  ctx.fillText(mode, rcx, dy1 - 9);

  // sector map: the level's objective as a 4x4 grid filling up; the last
  // cell is the boss and flashes once it's out
  const gx = W * 0.62, gw = W * 0.24, gh = dh;
  panel(gx, dy0, gw, gh);
  const progress = gameMode === 'campaign' ? missionProgress() : Math.min(1, killCount / currentKillTarget());
  const filled = Math.floor(progress * 15);
  for (let i = 0; i < 16; i++) {
    const cxl = gx + 6 + (i % 4) * (gw - 12) / 4, cyl = dy0 + 6 + Math.floor(i / 4) * (gh - 12) / 4;
    const cwl = (gw - 12) / 4 - 3, chl = (gh - 12) / 4 - 3;
    if (i === 15) {
      ctx.fillStyle = bossActive && Math.sin(t * 10) > 0 ? '#ff3355' : 'rgba(255, 51, 85, 0.25)';
    } else {
      ctx.fillStyle = i < filled ? 'rgba(63, 255, 102, 0.75)' : 'rgba(255,255,255,0.06)';
    }
    ctx.fillRect(cxl, cyl, cwl, chl);
    if (i < filled || i === 15) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(cxl + cwl / 2 - 1, cyl + chl / 2 - 3, 2, 6);
      ctx.fillRect(cxl + cwl / 2 - 3, cyl + chl / 2 - 1, 6, 2);
    }
  }

  // weapon slots: lit while you have them
  const wx = W * 0.875, ww = W - L.m - wx;
  const slots = [
    ['3X', tripleLaserTimer > 0, '#fff6c8'],
    ['ECH', echoTimer > 0, '#b4ff5a'],
    ['DSC', discCharges > 0, '#e8fdff'],
    ['B' + zapperCharges, zapperCharges > 0, '#ff78ff']
  ];
  const sh2 = dh / slots.length;
  ctx.font = font(7);
  slots.forEach(([label, on, color], i) => {
    const y = dy0 + i * sh2;
    ctx.fillStyle = on ? 'rgb(30, 14, 58)' : 'rgb(18, 8, 36)';
    ctx.fillRect(wx, y, ww, sh2 - 3);
    ctx.strokeStyle = on ? color : 'rgba(255,255,255,0.12)';
    ctx.strokeRect(wx + 0.5, y + 0.5, ww - 1, sh2 - 4);
    ctx.fillStyle = on ? color : 'rgba(255,255,255,0.2)';
    ctx.textAlign = 'center';
    ctx.fillText(label, wx + ww / 2, y + sh2 / 2);
  });
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

canvas.addEventListener('mousemove', (e) => {
  pointerX = e.clientX;
  pointerY = e.clientY;
  updateAimFromPointer(pointerX, pointerY);
});

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  pointerX = touch.clientX;
  pointerY = touch.clientY;
  updateAimFromPointer(pointerX, pointerY);
}, { passive: false });

function fire() {
  if (state !== 'playing') return;
  if (discCharges > 0 && !disc) { throwDisc(); return; }
  // the shot goes down the lane of whatever the pointer is on, as drawn
  const target = findAimTarget();
  const aim = target ? target.angle : aimAngle;
  const angles = tripleLaserTimer > 0
    ? [-0.16, 0, 0.16].map(off => normalizeAngle(aim + off))
    : [aim];
  for (const angle of angles) bolts.push({ angle, z: 0.04 });
  runShots += angles.length;
  levelShots += angles.length;
  if (echoTimer > 0) {
    for (const delay of ECHO_DELAYS) {
      for (const angle of angles) echoQueue.push({ at: t + delay, angle });
    }
  }
  pulses.push({ startTime: t, angle: aim });
  shipRecoil = 1;
  lastShotTime = t;
  playZap();
  playBass(70 + Math.random() * 20, 0.2);
}

canvas.addEventListener('mousedown', (e) => {
  initAudio();
  // daemons: left button turns left, right button turns right
  if (cyTurn(e.button === 2 ? 1 : -1)) return;
  // a click landing on the canvas itself (rather than the centered overlay
  // text) still needs to carry the "continuing" flag, or winning and then
  // clicking slightly off-center would silently drop the harder next run
  if (state === 'title') { titleTap(); return; }
  if (state === 'gameover' || state === 'cleared') { startGame(state === 'cleared'); return; }
  if (e.button === 2) { superzap(); return; } // right-click: superzapper
  pointerHeld = true;
  holdFireTimer = shipClass().holdFire;
  fire();
});
window.addEventListener('mouseup', () => { pointerHeld = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
for (const ev of ['click', 'mousedown', 'touchstart']) {
  document.getElementById('jackin').addEventListener(ev, (e) => e.stopPropagation());
}
document.getElementById('pilotname').addEventListener('keydown', (e) => {
  e.stopPropagation(); // typing a space in the name must not fire the zapper
  if (e.key === 'Enter') jackIn();
});
document.getElementById('jackinBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  jackIn();
});

window.addEventListener('keydown', (e) => {
  if (state === 'cycles' || state === 'cyclesover') {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); cyTurn(-1); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); cyTurn(1); }
    else if (e.code === 'Space' && state === 'cyclesover') { e.preventDefault(); cyNextRound(); }
    else if (e.code === 'Escape') cyQuit();
    return;
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    e.preventDefault();
    if (paused) resumeGame(); else pauseGame();
    return;
  }
  if (paused) return;
  if (e.code === 'Space') {
    e.preventDefault();
    superzap();
  } else if (e.code === 'KeyL') {
    lockIn();
  }
});
document.getElementById('lockBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  lockIn();
});
document.getElementById('zapBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  superzap();
});
window.addEventListener('touchend', (e) => { if (!e.touches.length) pointerHeld = false; });

canvas.addEventListener('touchstart', (e) => {
  initAudio();
  const touch = e.touches[0];
  // daemons: tap the left or right half of the screen to turn
  if (cyTurn(touch.clientX < W / 2 ? -1 : 1)) { e.preventDefault(); return; }
  pointerX = touch.clientX;
  pointerY = touch.clientY;
  updateAimFromPointer(pointerX, pointerY);
  if (state === 'title') { titleTap(); return; }
  if (state === 'gameover' || state === 'cleared') { startGame(state === 'cleared'); return; }
  pointerHeld = true;
  holdFireTimer = shipClass().holdFire;
  fire();
}, { passive: false });

document.getElementById('title').addEventListener('click', () => titleTap());
document.getElementById('gameover').addEventListener('click', () => { initAudio(); startGame(false); });
document.getElementById('cleared').addEventListener('click', () => { initAudio(); startGame(true); });
for (const id of ['riftStart', 'riftFromCleared']) {
  document.getElementById(id).addEventListener('click', (e) => {
    e.stopPropagation(); // don't also trigger the overlay's own start/continue
    initAudio();
    startGame(false, 'rift');
  });
}
applyRiftUnlock();


document.querySelectorAll('#difficulty button').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    difficultySetting = btn.dataset.diff;
    document.querySelectorAll('#difficulty button').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
});
