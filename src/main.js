// VORTEX - The main loop.
// Plain script, loaded in order by index.html; shares globals with the others.

// ---------- Loop ----------
// live preview of the selected ship (class + colour) on the title screen
const previewCanvas = document.getElementById('shippreview');
const previewCtx = previewCanvas.getContext('2d');
function drawShipPreview() {
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  drawShip({
    g: previewCtx,
    x: previewCanvas.width / 2,
    y: previewCanvas.height / 2 + 4 + Math.sin(t * 2.6) * 2,
    s: 34 * SHIP_CLASSES[shipClassIndex].scale,
    lean: Math.sin(t * 0.9) * 0.12
  });
}

function loop(now) {
  const rawDt = (now - lastTime) / 1000;
  const dt = Math.min(0.05, rawDt);
  lastTime = now;
  if (state === 'playing' && !paused) watchFrameRate(rawDt);
  pollGamepad(dt);
  if (paused) {
    // the world holds still behind the overlay; nothing ticks
    if (state !== 'playing') resumeGame();
    requestAnimationFrame(loop);
    return;
  }
  simulate(dt);
  draw();
  syncRunClass();
  drawPortrait();
  updateClipRecording(dt);
  if (state === 'title') drawShipPreview();
  requestAnimationFrame(loop);
}

// one step of the game world, without any drawing (the balance simulator
// in tools/ calls this directly to play whole runs faster than real time)
function simulate(dt) {
  update(dt);
  updateJackIn(dt);
  updateCoPlayers(dt);
  updateVersus(dt);
  updateCycles(dt);
  updateTrack(dt);
  updateEnv(dt);
  updateTutorial(dt);
}
requestAnimationFrame(loop);
