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

function drawCockpit() {
  const pal = SHIP_PALETTES[shipPaletteIndex];
  const jolt = shipHitWobble * 8;
  const ox = (Math.random() - 0.5) * jolt, oy = (Math.random() - 0.5) * jolt + shipRecoil * 3;
  const dashTop = H * (1 - Math.min(0.24, 120 / H + 0.08));
  ctx.save();
  ctx.translate(ox, oy);
  ctx.fillStyle = 'rgba(6, 2, 14, 0.94)';
  ctx.strokeStyle = pal.glow;
  ctx.shadowColor = pal.glow;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 2;
  // canopy frame: a top bar and two struts angling in from the dashboard
  ctx.beginPath();
  ctx.moveTo(-20, -20); ctx.lineTo(W + 20, -20); ctx.lineTo(W + 20, H * 0.05);
  ctx.lineTo(W * 0.62, H * 0.085); ctx.lineTo(W * 0.38, H * 0.085); ctx.lineTo(-20, H * 0.05);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? 0 : W, inner = side < 0 ? W * 0.16 : W * 0.84;
    ctx.beginPath();
    ctx.moveTo(x0 - side * 20, dashTop);
    ctx.lineTo(inner, dashTop);
    ctx.lineTo(side < 0 ? W * 0.05 : W * 0.95, H * 0.045);
    ctx.lineTo(x0 - side * 20, H * 0.045);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  // dashboard
  ctx.beginPath();
  ctx.moveTo(-20, H + 20); ctx.lineTo(-20, dashTop); ctx.lineTo(W * 0.3, dashTop - H * 0.03);
  ctx.lineTo(W * 0.7, dashTop - H * 0.03); ctx.lineTo(W + 20, dashTop); ctx.lineTo(W + 20, H + 20);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  // gauges: hull (left) and plasma (right) as arc dials, power bar centre
  const gr = Math.min(W, H) * 0.06;
  const gy = dashTop + (H - dashTop) * 0.5;
  const dial = (x, frac, color, label) => {
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.arc(x, gy, gr, Math.PI * 0.8, Math.PI * 2.2); ctx.stroke();
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(x, gy, gr, Math.PI * 0.8, Math.PI * (0.8 + 1.4 * Math.max(0, Math.min(1, frac)))); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.font = "8px 'Press Start 2P', 'Courier New', monospace";
    ctx.textAlign = 'center';
    ctx.fillText(label, x, gy + gr * 0.35);
  };
  const hf = hull / hullMax;
  dial(W * 0.18, hf, hf > 0.5 ? '#3f6' : hf > 0.25 ? '#ffcc33' : '#f33', 'HULL');
  dial(W * 0.82, plasmaMax ? plasma / plasmaMax : 0, '#22ddff', 'PLSM');
  const bw = W * 0.22, bx = W / 2 - bw / 2, by = gy - 4;
  ctx.strokeStyle = '#ffe14d';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx, by, bw, 8);
  ctx.fillStyle = power >= 100 && Math.sin(t * 12) > 0 ? '#ffffff' : '#ffe14d';
  ctx.fillRect(bx + 2, by + 2, (bw - 4) * power / 100, 4);
  ctx.fillStyle = 'rgba(255,225,77,0.7)';
  ctx.font = "7px 'Press Start 2P', 'Courier New', monospace";
  ctx.textAlign = 'center';
  ctx.fillText(lockinTimer > 0 ? 'LOCK-IN' : power >= 100 ? 'LOCK-IN READY' : 'POWER', W / 2, by - 8);
  // blinking console lights
  for (let i = 0; i < 6; i++) {
    const on = Math.sin(t * (2 + i) + i) > 0.3;
    ctx.fillStyle = on ? ['#ff3355', '#3f6', '#ffd23f'][i % 3] : 'rgba(255,255,255,0.08)';
    ctx.fillRect(W / 2 - 50 + i * 18, gy + 16, 8, 4);
  }
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
  const angles = tripleLaserTimer > 0
    ? [-0.16, 0, 0.16].map(off => normalizeAngle(aimAngle + off))
    : [aimAngle];
  for (const angle of angles) bolts.push({ angle, z: 0.04 });
  runShots += angles.length;
  levelShots += angles.length;
  if (echoTimer > 0) {
    for (const delay of ECHO_DELAYS) {
      for (const angle of angles) echoQueue.push({ at: t + delay, angle });
    }
  }
  pulses.push({ startTime: t, angle: aimAngle });
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
