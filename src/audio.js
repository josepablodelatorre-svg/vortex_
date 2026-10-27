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

// ---------- Sound effects: a small 80s/early-90s synth ----------
// Every effect is a few synth voices, not samples: detuned saws and pulses
// through a resonant low-pass (Moog-style squelch), DX7-style FM for bells
// and metallic hits, filtered noise for snaps. They play into one effects
// chain (sfxOut): a soft tape/analog drive, a Juno-style stereo chorus, and
// an echo some voices send to. Sound only, so it's all fire-and-forget.
let sfxBus = null;   // input of the effects chain; its gain is the SFX slider
let echoBus = null;
let noiseBuffer = null;

function makeDriveCurve(amount) {
  const n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}

function sfxOut() {
  if (!sfxBus) {
    const out = audioOut();
    sfxBus = actx.createGain();
    sfxBus.gain.value = settings.sfx;
    // gentle saturation: rounds the peaks like an analog desk
    const drive = actx.createWaveShaper();
    drive.curve = makeDriveCurve(1.6);
    drive.oversample = '2x';
    sfxBus.connect(drive);
    drive.connect(out);
    // Juno-style chorus: two short delays swept by slow LFOs, panned apart
    for (const [rate, pan] of [[0.6, -0.7], [0.83, 0.7]]) {
      const d = actx.createDelay(0.05);
      d.delayTime.value = 0.012;
      const lfo = actx.createOscillator();
      const depth = actx.createGain();
      lfo.frequency.value = rate;
      depth.gain.value = 0.004;
      lfo.connect(depth);
      depth.connect(d.delayTime);
      lfo.start();
      const wet = actx.createGain();
      wet.gain.value = 0.35;
      const p = actx.createStereoPanner ? actx.createStereoPanner() : null;
      drive.connect(d);
      d.connect(wet);
      if (p) { p.pan.value = pan; wet.connect(p); p.connect(out); } else wet.connect(out);
    }
    // echo send: a dark feedback delay, like a tape or BBD unit
    echoBus = actx.createGain();
    echoBus.gain.value = 1;
    const echo = actx.createDelay(1);
    echo.delayTime.value = 0.27;
    const fb = actx.createGain();
    fb.gain.value = 0.32;
    const tone = actx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2400;
    echoBus.connect(echo);
    echo.connect(tone);
    tone.connect(fb);
    fb.connect(echo);
    const echoOut = actx.createGain();
    echoOut.gain.value = 0.28;
    tone.connect(echoOut);
    echoOut.connect(sfxBus);
  }
  return sfxBus;
}

function noise() {
  if (!noiseBuffer) {
    noiseBuffer = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = actx.createBufferSource();
  src.buffer = noiseBuffer;
  return src;
}

// One synth voice. o: wave ('sawtooth' | 'square' | 'triangle' | 'sine' |
// 'noise'), freq -> freqEnd over glide s, detune: cents for extra detuned
// copies (a fat unison), attack/decay envelope to vol, an optional filter
// { type, freq, freqEnd, q } swept over the decay, delay start, echo send.
function voice(o) {
  const at = actx.currentTime + (o.delay || 0);
  const dur = (o.attack || 0.002) + o.decay;
  const amp = actx.createGain();
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(o.vol, at + (o.attack || 0.002));
  amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  let head = amp;
  if (o.filter) {
    const f = actx.createBiquadFilter();
    f.type = o.filter.type || 'lowpass';
    f.Q.value = o.filter.q || 1;
    f.frequency.setValueAtTime(o.filter.freq, at);
    if (o.filter.freqEnd) f.frequency.exponentialRampToValueAtTime(o.filter.freqEnd, at + dur);
    f.connect(amp);
    head = f;
  }
  amp.connect(sfxOut());
  if (o.echo) {
    const send = actx.createGain();
    send.gain.value = o.echo;
    amp.connect(send);
    send.connect(echoBus);
  }
  const copies = o.wave === 'noise' ? [0] : (o.detune || [0]);
  for (const cents of copies) {
    const src = o.wave === 'noise' ? noise() : actx.createOscillator();
    if (o.wave !== 'noise') {
      src.type = o.wave;
      src.detune.value = cents;
      src.frequency.setValueAtTime(o.freq, at);
      if (o.freqEnd) src.frequency.exponentialRampToValueAtTime(o.freqEnd, at + (o.glide || dur));
    }
    const g = actx.createGain();
    g.gain.value = 1 / Math.sqrt(copies.length);
    src.connect(g);
    g.connect(head);
    src.start(at);
    src.stop(at + dur + 0.02);
  }
}

// DX7-style two-operator FM: a sine modulator (ratio x carrier) whose depth
// decays faster than the note, so it starts bright and metallic and melts
// into a pure tone. Bells, clangs, electric-piano blips.
function fm(o) {
  const at = actx.currentTime + (o.delay || 0);
  const car = actx.createOscillator();
  const mod = actx.createOscillator();
  const modGain = actx.createGain();
  const amp = actx.createGain();
  car.type = 'sine';
  mod.type = 'sine';
  car.frequency.setValueAtTime(o.freq, at);
  mod.frequency.setValueAtTime(o.freq * o.ratio, at);
  if (o.freqEnd) {
    car.frequency.exponentialRampToValueAtTime(o.freqEnd, at + o.decay);
    mod.frequency.exponentialRampToValueAtTime(o.freqEnd * o.ratio, at + o.decay);
  }
  modGain.gain.setValueAtTime(o.freq * o.index, at);
  modGain.gain.exponentialRampToValueAtTime(o.freq * 0.05 + 1, at + o.decay * (o.brightFor || 0.4));
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(o.vol, at + 0.003);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + o.decay);
  mod.connect(modGain);
  modGain.connect(car.frequency);
  car.connect(amp);
  amp.connect(sfxOut());
  if (o.echo) {
    const send = actx.createGain();
    send.gain.value = o.echo;
    amp.connect(send);
    send.connect(echoBus);
  }
  for (const n of [car, mod]) { n.start(at); n.stop(at + o.decay + 0.02); }
}

// the shot's low thump: a Minimoog-style bass blip, saw + sub through a
// resonant low-pass that snaps shut
function playBass(freq = 80, dur = 0.25) {
  if (!actx) return;
  voice({ wave: 'sawtooth', freq, freqEnd: freq * 0.5, decay: dur, vol: 0.22, detune: [-7, 7],
          filter: { freq: 1400, freqEnd: 90, q: 7 } });
  voice({ wave: 'square', freq: freq / 2, freqEnd: freq / 4, decay: dur * 0.8, vol: 0.12,
          filter: { freq: 400, q: 1 } });
}

// player laser: detuned saws diving in pitch through a squelchy filter sweep
function playZap() {
  if (!actx) return;
  voice({ wave: 'sawtooth', freq: 1250, freqEnd: 260, glide: 0.11, decay: 0.12, vol: 0.13, detune: [-10, 0, 10],
          filter: { freq: 7000, freqEnd: 500, q: 9 }, echo: 0.15 });
}

// enemy destroyed: an FM metallic snap over a filtered noise crack, like an
// early drum machine's tom and clap mashed together
function playHit() {
  if (!actx) return;
  fm({ freq: 330, freqEnd: 70, ratio: 1.41, index: 6, decay: 0.22, vol: 0.2 });
  voice({ wave: 'noise', decay: 0.12, vol: 0.18, filter: { type: 'bandpass', freq: 3200, freqEnd: 700, q: 2 } });
}

// taking damage: a growling detuned saw falling through a closing filter
function playDamage() {
  if (!actx) return;
  voice({ wave: 'sawtooth', freq: 150, freqEnd: 38, decay: 0.42, vol: 0.17, detune: [-22, 0, 19],
          filter: { freq: 2200, freqEnd: 120, q: 12 } });
  voice({ wave: 'noise', decay: 0.18, vol: 0.14, filter: { freq: 1800, freqEnd: 200, q: 1 } });
}

// pickup: a quick Juno arpeggio up a major chord, chorused and echoed
function playPowerUp() {
  if (!actx) return;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    voice({ wave: 'square', freq: f, decay: 0.12, vol: 0.075, detune: [-6, 6], delay: i * 0.055,
            filter: { freq: 5000, freqEnd: 1200, q: 3 }, echo: 0.35 });
  });
}

// the rival's signature: a ring-mod-ish clash of two saws, falling
function playHack() {
  if (!actx) return;
  voice({ wave: 'sawtooth', freq: 420, freqEnd: 55, decay: 0.4, vol: 0.06, detune: [0, 433],
          filter: { freq: 3000, freqEnd: 300, q: 14 }, echo: 0.4 });
}

// radio blip: two DX electric-piano chirps ahead of each transmission
function playComms() {
  if (!actx) return;
  fm({ freq: 1320, ratio: 1, index: 2.5, decay: 0.08, vol: 0.13 });
  fm({ freq: 990, ratio: 1, index: 2.5, decay: 0.08, vol: 0.13, delay: 0.07 });
}

// enemy shot: a resonant pulse "peww"
function playEnemyShot() {
  if (!actx) return;
  voice({ wave: 'square', freq: 620, freqEnd: 190, decay: 0.2, vol: 0.08,
          filter: { freq: 2600, freqEnd: 400, q: 10 } });
}

// boss hit: a heavy FM clang over a sub thump
function playBossHit() {
  if (!actx) return;
  fm({ freq: 110, freqEnd: 55, ratio: 3.5, index: 9, decay: 0.4, vol: 0.22, brightFor: 0.25 });
  voice({ wave: 'sine', freq: 90, freqEnd: 40, decay: 0.3, vol: 0.3 });
}

// coin: each coin of a run plays the next note up a pentatonic scale (a
// DX bell with a soft square under it), so a row of five rings out as a
// rising arpeggio; a pause of over a second starts the scale again
const COIN_SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
let coinNote = 0, lastCoinAt = -9;
function playCoin() {
  if (!actx) return;
  if (t - lastCoinAt > 1.1) coinNote = 0;
  lastCoinAt = t;
  const f = 880 * Math.pow(2, COIN_SCALE[Math.min(coinNote, COIN_SCALE.length - 1)] / 12);
  coinNote += 1;
  fm({ freq: f, ratio: 3.5, index: 1.8, decay: 0.32, vol: 0.12, echo: 0.3 });
  voice({ wave: 'square', freq: f / 2, decay: 0.09, vol: 0.04, filter: { freq: 3000, q: 1 } });
}
