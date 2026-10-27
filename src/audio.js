// VORTEX - Player settings (volume, glow, vibration), sound effects and music.
// Plain script, loaded in order by index.html; shares globals with the others.

// ---------- Player settings (volume, glow, vibration) ----------
// glow: 'auto' turns canvas glow (shadowBlur, the costliest effect) off
// while the frame rate is struggling and back on when it recovers.
const settings = { music: 1, sfx: 1, glow: 'auto', vibrate: true };
try { Object.assign(settings, JSON.parse(store.getItem('vortex-settings') || '{}')); } catch (e) { /* ignore */ }
function saveSettings() {
  try { store.setItem('vortex-settings', JSON.stringify(settings)); } catch (e) { /* ignore */ }
}
let glowActive = settings.glow !== 'off';
// every 2D context's shadowBlur goes through this, so glow can be cut in one place
const nativeBlur = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'shadowBlur');
Object.defineProperty(CanvasRenderingContext2D.prototype, 'shadowBlur', {
  configurable: true,
  get() { return nativeBlur.get.call(this); },
  set(v) { nativeBlur.set.call(this, glowActive ? v : 0); }
});
// frame-rate watch for GLOW: AUTO (an average of recent frame times)
let fpsAvg = 60, lowFpsTime = 0, highFpsTime = 0;
function watchFrameRate(rawDt) {
  if (settings.glow !== 'auto' || rawDt <= 0 || rawDt > 0.25) return; // ignore hiccups and hidden tabs
  fpsAvg += (1 / rawDt - fpsAvg) * 0.05;
  if (glowActive) {
    lowFpsTime = fpsAvg < 40 ? lowFpsTime + rawDt : 0;
    if (lowFpsTime > 2) { glowActive = false; highFpsTime = 0; }
  } else {
    highFpsTime = fpsAvg > 56 ? highFpsTime + rawDt : 0;
    if (highFpsTime > 8) { glowActive = true; lowFpsTime = 0; }
  }
}
function vibrate(pattern) {
  if (settings.vibrate && navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
  }
}

// ---------- Audio ----------
let actx = null;
// Every sound (SFX and music) goes through masterOut, which feeds both the
// speakers and clipAudioDest, the audio track that saved clips record.
let masterOut = null;
let clipAudioDest = null;
function audioOut() {
  if (!masterOut) {
    masterOut = actx.createGain();
    masterOut.connect(actx.destination);
    if (actx.createMediaStreamDestination) {
      clipAudioDest = actx.createMediaStreamDestination();
      masterOut.connect(clipAudioDest);
    }
  }
  return masterOut;
}

// sound effects go through their own gain (the SFX slider) into masterOut
let sfxBus = null;
function sfxOut() {
  if (!sfxBus) {
    sfxBus = actx.createGain();
    sfxBus.gain.value = settings.sfx;
    sfxBus.connect(audioOut());
  }
  return sfxBus;
}

function initAudio() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  initMusicAnalyser();
}

// ---------- Music (background soundtrack, separate from the WebAudio SFX) ----------
// Mastered loud (about -10 LUFS, peak-limited) so they sit at commercial
// loudness alongside the procedural sound effects.
// All four tracks are 160 kbps MP3s (about 33 MB together) and nothing is
// fetched at page load: browsers won't play music before the first tap
// anyway, so the title and gameplay themes start streaming on that tap
// (startMusic) and the other two only when first needed.
const musicGarden = new Audio('audio/garden.mp3');       // calm, title/results theme
const musicDestruction = new Audio('audio/destruction.mp3'); // aggressive, gameplay theme
musicGarden.loop = true;
musicDestruction.loop = true;
musicGarden.preload = 'none';
musicDestruction.preload = 'none';
musicGarden.volume = 0;
musicDestruction.volume = 0;
// Extra tracks (mastered to match): Noche Random scores THE RIFT, Cuerpo
// Ácido scores real boss fights. preload 'none' so they only download once
// they're first needed, and they pause again whenever they fade out.
const musicRift = new Audio('audio/nocherandom.mp3');
const musicBoss = new Audio('audio/cuerpoacido.mp3');
for (const el of [musicRift, musicBoss]) {
  el.loop = true;
  el.preload = 'none';
  el.volume = 0;
}
const MUSIC_TRACKS = { garden: musicGarden, destruction: musicDestruction, rift: musicRift, boss: musicBoss };
const MUSIC_VOLUME = 0.55;
let musicStarted = false;

function startMusic() {
  if (musicStarted) return;
  musicStarted = true;
  musicGarden.play().catch(() => {});
  musicDestruction.play().catch(() => {});
}

// ---------- Music analysis (lets the tunnel breathe with the soundtrack) ----------
// The soundtrack is ambient: the low end is a near-constant drone with no
// real kick to lock onto, so instead of beat detection this follows the
// music's slow swells (mid band) and its brighter shimmering layers (high
// band). Each band is normalised against its own adaptive floor/ceiling, so
// the visuals track the track's dynamics rather than its absolute loudness.
// Only when served over http(s): on file:// the browser treats the audio
// files as cross-origin and a MediaElementSource would output pure silence,
// muting the music. There musicSwell/musicShimmer just stay 0 and every
// visual that reads them looks exactly like it did before.
let musicAnalyser = null;
let musicFreq = null;
let musicSwell = 0;    // 0..1, slow: how "open"/full the music is right now
let musicShimmer = 0;  // 0..1, quicker: bright high-end texture
let swellRings = [];   // { startTime } rings drifting in from the far wall
let swellRingTimer = 0;
const SWELL_RING_SPEED = 0.5; // z units per second: a slow, ambient drift
// Rutt-Etra history: the analog video synth displaced each scan line by
// the signal. Here the tunnel rings are the scan lines: every
// RUTT_ROW_INTERVAL a downsampled spectrum row is pushed onto the far end
// of the tunnel and rolls toward the player, so the soundtrack becomes a
// moving topography. Empty (and invisible) without the analyser.
const RUTT_BINS = 48;
const RUTT_ROWS = 24;
const RUTT_ROW_INTERVAL = 0.055;
const RUTT_SAMPLES = 64; // ring sample density while the effect is live
let ruttHistory = []; // newest first: [0] is at the event horizon
let ruttRowTimer = 0;
const musicBands = {
  mid: { lo: 0, hi: 0, primed: false },
  high: { lo: 0, hi: 0, primed: false }
};

function initMusicAnalyser() {
  if (musicAnalyser || !actx) return;
  if (!/^https?:$/.test(location.protocol)) return;
  try {
    const analyser = actx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.8;
    // connect to the speakers first, so a failure part-way through can't
    // leave a track routed into a dead end
    analyser.connect(audioOut());
    actx.createMediaElementSource(musicGarden).connect(analyser);
    actx.createMediaElementSource(musicDestruction).connect(analyser);
    actx.createMediaElementSource(musicRift).connect(analyser);
    actx.createMediaElementSource(musicBoss).connect(analyser);
    musicAnalyser = analyser;
    musicFreq = new Uint8Array(analyser.frequencyBinCount);
  } catch (e) {
    musicAnalyser = null;
  }
}

function bandAverage(from, to) {
  let sum = 0;
  for (let k = from; k < to; k++) sum += musicFreq[k];
  return sum / ((to - from) * 255);
}

// Maps a raw band level to 0..1 within the range it has recently covered:
// the floor/ceiling snap outward quickly and relax back inward slowly.
function normaliseBand(band, x, dt) {
  if (!band.primed) { band.lo = x; band.hi = x + 0.1; band.primed = true; }
  band.lo = x < band.lo ? x : band.lo + (x - band.lo) * Math.min(1, dt * 0.05);
  band.hi = x > band.hi ? x : band.hi + (x - band.hi) * Math.min(1, dt * 0.05);
  return Math.max(0, Math.min(1, (x - band.lo) / Math.max(0.12, band.hi - band.lo)));
}

function pushRuttRow(dt) {
  ruttRowTimer -= dt;
  if (ruttRowTimer > 0) return;
  ruttRowTimer = RUTT_ROW_INTERVAL;
  // log-spaced bins from ~280Hz to ~11kHz, squared for contrast so quiet
  // frequencies lie flat and the strong ones stand up as ridges
  const row = new Float32Array(RUTT_BINS);
  const lo = 6, hi = 240;
  for (let i = 0; i < RUTT_BINS; i++) {
    const a = Math.floor(lo * Math.pow(hi / lo, i / RUTT_BINS));
    const b = Math.max(a + 1, Math.floor(lo * Math.pow(hi / lo, (i + 1) / RUTT_BINS)));
    let sum = 0;
    for (let k = a; k < b; k++) sum += musicFreq[k];
    const v = sum / ((b - a) * 255);
    row[i] = v * v;
  }
  ruttHistory.unshift(row);
  if (ruttHistory.length > RUTT_ROWS) ruttHistory.pop();
}

// How far (0..~1) the Rutt-Etra signal pushes the ring at this depth and
// angle out from the tunnel's centre. Mirrored left/right: low frequencies
// at the top of the ring, highs at the bottom.
function ruttDisplacement(angle, z) {
  if (ruttHistory.length < 2) return 0;
  const rowPos = (1 - z) * (RUTT_ROWS - 1);
  const r0 = Math.min(ruttHistory.length - 1, Math.floor(rowPos));
  const r1 = Math.min(ruttHistory.length - 1, r0 + 1);
  const rf = rowPos - Math.floor(rowPos);
  const u = Math.abs(normalizeAngle(angle)) / Math.PI * (RUTT_BINS - 1);
  const b0 = Math.floor(u), b1 = Math.min(RUTT_BINS - 1, b0 + 1), bf = u - b0;
  const v0 = ruttHistory[r0][b0] * (1 - bf) + ruttHistory[r0][b1] * bf;
  const v1 = ruttHistory[r1][b0] * (1 - bf) + ruttHistory[r1][b1] * bf;
  return v0 * (1 - rf) + v1 * rf;
}

function updateMusicMood(dt) {
  if (!musicAnalyser) return;
  musicAnalyser.getByteFrequencyData(musicFreq);
  // bins at ~47Hz each: 6..60 = ~280Hz-2.8kHz pads/chords, 60..250 = air/shimmer
  const mid = normaliseBand(musicBands.mid, bandAverage(6, 60), dt);
  const high = normaliseBand(musicBands.high, bandAverage(60, 250), dt);
  musicSwell += (mid - musicSwell) * Math.min(1, dt * 1.2);
  pushRuttRow(dt);
  musicShimmer += (high - musicShimmer) * Math.min(1, dt * 4);

  // the fuller the music, the more often a soft ring drifts in from the
  // event horizon: a slow tide in quiet passages, a steady flow at peaks
  if (state === 'playing') {
    swellRingTimer -= dt;
    if (swellRingTimer <= 0) {
      if (musicSwell > 0.2 && swellRings.length < 6) swellRings.push({ startTime: t });
      swellRingTimer = 2.6 - 1.9 * musicSwell;
    }
  }
}

// Crossfades both tracks' volume toward whichever one should be active,
// so switching between title/results and gameplay feels like one mix
// instead of a hard cut.
let musicFadeHandle = null;
let activeMusic = null;
function setMusicTrack(active) {
  startMusic();
  const el = MUSIC_TRACKS[active];
  if (active !== activeMusic && (el === musicRift || el === musicBoss)) {
    // the boss theme starts from the top every fight, for the build-up
    if (el === musicBoss) el.currentTime = 0;
    if (el.paused) el.play().catch(() => {});
  }
  activeMusic = active;
  if (musicFadeHandle) clearInterval(musicFadeHandle);
  musicFadeHandle = setInterval(() => {
    const step = 0.035;
    let done = true;
    for (const [name, track] of Object.entries(MUSIC_TRACKS)) {
      const target = name === active ? MUSIC_VOLUME * settings.music : 0;
      if (Math.abs(track.volume - target) > step) {
        track.volume += Math.sign(target - track.volume) * step;
        done = false;
      } else {
        track.volume = target;
        // the lazily loaded extras stop entirely once silent
        if (target === 0 && (track === musicRift || track === musicBoss) && !track.paused) track.pause();
      }
    }
    if (done) clearInterval(musicFadeHandle);
  }, 50);
}

// the gameplay theme for the current mode (outside boss fights)
function gameplayTrack() {
  return gameMode === 'rift' ? 'rift' : 'destruction';
}

function playBass(freq = 80, dur = 0.25) {
  if (!actx) return;
  const osc = actx.createOscillator();
  const gain = actx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, actx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.5, actx.currentTime + dur);
  gain.gain.setValueAtTime(0.4, actx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
  osc.connect(gain);
  gain.connect(sfxOut());
  osc.start();
  osc.stop(actx.currentTime + dur);
}

function playZap() {
  if (!actx) return;
  const osc = actx.createOscillator();
  const gain = actx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(900, actx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(120, actx.currentTime + 0.12);
  gain.gain.setValueAtTime(0.25, actx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.12);
  osc.connect(gain);
  gain.connect(sfxOut());
  osc.start();
  osc.stop(actx.currentTime + 0.12);
}

function playHit() {
  if (!actx) return;
  const osc = actx.createOscillator();
  const gain = actx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(220, actx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(60, actx.currentTime + 0.2);
  gain.gain.setValueAtTime(0.3, actx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.2);
  osc.connect(gain);
  gain.connect(sfxOut());
  osc.start();
  osc.stop(actx.currentTime + 0.2);
}

function playDamage() {
  if (!actx) return;
  const osc = actx.createOscillator();
  const gain = actx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(140, actx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, actx.currentTime + 0.35);
  gain.gain.setValueAtTime(0.35, actx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.35);
  osc.connect(gain);
  gain.connect(sfxOut());
  osc.start();
  osc.stop(actx.currentTime + 0.35);
}

function playPowerUp() {
  if (!actx) return;
  const osc = actx.createOscillator();
  const gain = actx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(440, actx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(880, actx.currentTime + 0.2);
  gain.gain.setValueAtTime(0.3, actx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.25);
  osc.connect(gain);
  gain.connect(sfxOut());
  osc.start();
  osc.stop(actx.currentTime + 0.25);
}

// the rival's signature: a falling, buzzing sawtooth
function playHack() {
  if (!actx) return;
  const osc = actx.createOscillator();
  const gain = actx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(420, actx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(60, actx.currentTime + 0.35);
  gain.gain.setValueAtTime(0.07, actx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.38);
  osc.connect(gain);
  gain.connect(sfxOut());
  osc.start();
  osc.stop(actx.currentTime + 0.4);
}

// radio blip: two short square chirps ahead of each transmission
function playComms() {
  if (!actx) return;
  [[1320, 0], [990, 0.07]].forEach(([freq, delay]) => {
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    const at = actx.currentTime + delay;
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, at);
    gain.gain.setValueAtTime(0.05, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.06);
    osc.connect(gain);
    gain.connect(sfxOut());
    osc.start(at);
    osc.stop(at + 0.07);
  });
}

function playEnemyShot() {
  if (!actx) return;
  const osc = actx.createOscillator();
  const gain = actx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(500, actx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(220, actx.currentTime + 0.18);
  gain.gain.setValueAtTime(0.2, actx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.18);
  osc.connect(gain);
  gain.connect(sfxOut());
  osc.start();
  osc.stop(actx.currentTime + 0.18);
}

function playBossHit() {
  if (!actx) return;
  const osc = actx.createOscillator();
  const gain = actx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(160, actx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(50, actx.currentTime + 0.3);
  gain.gain.setValueAtTime(0.35, actx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.3);
  osc.connect(gain);
  gain.connect(sfxOut());
  osc.start();
  osc.stop(actx.currentTime + 0.3);
}
