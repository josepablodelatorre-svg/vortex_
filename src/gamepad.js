// VORTEX - Game controllers (the browser Gamepad API, standard mapping).
// Plain script, loaded in order by index.html; shares globals with the others.

// ---------- Gamepad ----------
// In play: either stick aims (like pointing at the screen), A or RT fires
// (held = auto-fire), X or LT drops a bomb, Y or RB starts lock-in, START
// pauses. In menus and overlays: d-pad / left stick moves between buttons,
// A presses, B goes back, left/right nudge a focused slider.
const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const PAD_DEAD = 0.35;          // stick deflection that counts as aiming
const PAD_FIRE_EVERY = 0.16;    // auto-fire while A/RT is held (non-interceptor)
let padPrev = [];               // last frame's pressed buttons
let padFireTimer = 0;
let padNavTimer = 0;            // menu navigation repeat
let padFocus = null;            // the button the controller has selected
let padActive = false;          // a controller has been used: show focus rings

window.addEventListener('gamepadconnected', (e) => {
  showToast('CONTROLLER CONNECTED\n' + (e.gamepad.id.split('(')[0].trim().slice(0, 28) || 'GAMEPAD').toUpperCase());
});

function padPressed(gp, i) {
  const b = gp.buttons[i];
  return !!b && (b.pressed || b.value > 0.5);
}

// the buttons a controller can reach right now, in screen order
function padTargets() {
  const visible = (el) => el.offsetParent !== null && !el.disabled;
  let root = null;
  if (document.getElementById('flashwarn').classList.contains('on')) root = document.getElementById('flashwarn');
  else if (paused) root = document.getElementById('pause');
  else if (state === 'gameover') root = document.getElementById('gameover');
  else if (state === 'cleared') root = document.getElementById('cleared');
  else if (state === 'title') root = document.querySelector('#title .screen.active');
  if (!root) return [];
  return [...root.querySelectorAll('button, input[type=range], a[href]')].filter(visible);
}

function setPadFocus(el) {
  if (padFocus) padFocus.classList.remove('padfocus');
  padFocus = el;
  if (el) {
    el.classList.add('padfocus');
    if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }
}

function padMenu(gp, dt, pressedNow) {
  // the splash screen has no buttons: A or START starts
  if (state === 'title' && titleScreen === 'splash') {
    if (pressedNow(PAD.A) || pressedNow(PAD.START)) titleTap();
    return;
  }
  const targets = padTargets();
  if (!targets.length) { setPadFocus(null); return; }
  if (!targets.includes(padFocus)) setPadFocus(targets[0]);
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  const down = padPressed(gp, PAD.DOWN) || ay > 0.6, up = padPressed(gp, PAD.UP) || ay < -0.6;
  const right = padPressed(gp, PAD.RIGHT) || ax > 0.6, left = padPressed(gp, PAD.LEFT) || ax < -0.6;
  padNavTimer -= dt;
  if ((down || up || left || right) && padNavTimer <= 0) {
    padNavTimer = 0.22;
    if (padFocus.type === 'range' && (left || right)) {
      padFocus.value = Math.max(0, Math.min(100, +padFocus.value + (right ? 5 : -5)));
      padFocus.dispatchEvent(new Event('input', { bubbles: true }));
      padFocus.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      const i = targets.indexOf(padFocus);
      const step = down || right ? 1 : -1;
      setPadFocus(targets[(i + step + targets.length) % targets.length]);
    }
  }
  if (!down && !up && !left && !right) padNavTimer = 0;
  if (pressedNow(PAD.A) && padFocus && padFocus.type !== 'range') padFocus.click();
  if (pressedNow(PAD.B)) {
    const back = targets.find(el => el.classList.contains('back'));
    if (back) back.click();
    else if (paused) resumeGame();
  }
}

function pollGamepad(dt) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = [...pads].find(p => p && p.connected);
  if (!gp) return;
  const now = gp.buttons.map((b, i) => padPressed(gp, i));
  const pressedNow = (i) => now[i] && !padPrev[i];
  if (now.some(Boolean) && !padActive) { padActive = true; document.body.classList.add('padmode'); }
  const playing = state === 'playing' && !paused && !document.getElementById('flashwarn').classList.contains('on');

  if (pressedNow(PAD.START) && state === 'playing') { if (paused) resumeGame(); else pauseGame(); }
  if (!playing) {
    padMenu(gp, dt, pressedNow);
    padPrev = now;
    return;
  }
  setPadFocus(null);
  // aim with whichever stick is pushed further
  const sticks = [[gp.axes[0] || 0, gp.axes[1] || 0], [gp.axes[2] || 0, gp.axes[3] || 0]];
  const [sx, sy] = sticks.sort((a, b) => Math.hypot(b[0], b[1]) - Math.hypot(a[0], a[1]))[0];
  if (Math.hypot(sx, sy) > PAD_DEAD) aimAngle = normalizeAngle(Math.atan2(sx, -sy));
  // fire: a press shoots at once, holding keeps shooting
  const firing = now[PAD.A] || now[PAD.RT];
  if (firing) {
    const every = shipClass().holdFire || PAD_FIRE_EVERY;
    padFireTimer -= dt;
    if (pressedNow(PAD.A) || pressedNow(PAD.RT) || padFireTimer <= 0) {
      initAudio();
      fire();
      padFireTimer = every;
    }
  } else padFireTimer = 0;
  if (pressedNow(PAD.X) || pressedNow(PAD.LT)) superzap();
  if (pressedNow(PAD.Y) || pressedNow(PAD.RB)) lockIn();
  padPrev = now;
}
