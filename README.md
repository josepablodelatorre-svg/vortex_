# VORTEX — project handoff

A browser-based vector tunnel rail-shooter, built for the Claude for Games
build-day at Platzi México (Oct 26, 2026). Tempest / Polybius / Tubeway /
Space Invaders Infinity Gene inspired. Single-evening scope: no build step,
no bundler, no external JS frameworks — plain HTML5 Canvas2D + Web Audio.

## Running it

Just open `index.html` directly in a browser (double-click it, or
`file://` it). No server, no npm install, nothing to build. The `audio/`
folder must sit next to `index.html` — the game loads the soundtrack by
relative path (`audio/garden.m4a`, `audio/destruction.m4a`).

## File layout

```
index.html   — everything: HTML, CSS, game logic, all in one file
audio/
  garden.m4a       — calm theme, plays on title/results screens
  destruction.m4a  — aggressive theme, plays during gameplay
```

The NEMO INC. logo on the title screen is embedded directly in
`index.html` as a base64 PNG (no separate asset file) — that's why the
HTML file itself is large (~100KB+ of that is the inlined logo).

## Core concept

The player aims and fires from the center of an auto-scrolling neon
polygon tunnel (nonagon by default). Firing pulses light up the tunnel in
sync with procedural WebAudio sound effects. The camera "flies" through a
banked, swirling path toward an accelerating event horizon — real
left/right/up/down turns, not just a static tube.

## Architecture (all inside the one `<script>` tag in index.html)

**Camera / tunnel geometry**
- `pointOnRing(angle, z, opts)` — projects polar coords (angle around the
  ring, z = depth 0..1) into screen x/y. Depth-based radius via
  `ringRadius(z)`.
- `PATH_SEGMENTS_DEF` — alternating straight/curve path segments the
  camera flies through, with `PATH_LOOKAHEAD` controlling how far ahead
  the far wall previews upcoming bends. Derived `camRoll` banks the whole
  scene via canvas transform.
- `swirlAngle(z)` — the vortex twist, zero at the near wall (so aim stays
  true), increasing with depth and with run time.
- `effectiveTunnelSpeed()` — tunnel scroll speed accelerates over time
  (the "event horizon" pull).
- **Polygon morphing**: `tunnelSides` (current, eased) and
  `tunnelSidesTarget` (goal) — the tunnel's cross-section shape slowly
  morphs between regular polygons via `polygonRadiusFactor(angle, sides)`,
  a continuous regular-polygon polar equation that works for fractional
  `sides` too (so the morph looks like melting/reforming, not a hard cut).
  `SHAPE_STAGES = [9, 8, 7, 6, 5, 4, 3, 42]` — steps down one shape per
  level (and loops across New-Game-Plus run tiers), the `42` being a
  near-circle. `computeShapeStage()` picks the target from
  `(runTier * LEVEL_COUNT + currentLevel - 1) % SHAPE_STAGES.length`.

**Levels & bosses**
- 3 levels per run (`LEVEL_COUNT = 3`). Each level has its **own**
  `killCount`, resetting to 0 whenever a level is cleared — this is a
  per-level target, not a run-total one.
- Each level's path to its boss has two non-gating **miniboss** detours
  (`MINIBOSS_THRESHOLDS = [7, 13]`, local per-level kill counts): a quick,
  flat-hp (`MINIBOSS_HP = 3` + `runTier`) side fight that, once beaten,
  just lets play resume — no level change, no reset of `killCount` or the
  miniboss schedule (`nextMinibossIndex`).
- Only reaching `KILL_TARGET = 20` kills **within that level** arms the
  level's real boss (`spawnBoss('level')`, or `spawnBoss('final')` on
  level 3), hp scaled `BOSS_HP_BASE + (currentLevel-1)*BOSS_HP_PER_LEVEL +
  runTier*2`. Beating *that* boss is what actually advances the level
  (resetting `killCount`/`nextMinibossIndex` to 0 for the new level, plus
  updating the tunnel-shape morph target); beating the level-3 boss calls
  `winGame()`. `boss.kind` (`'mini' | 'level' | 'final'`) is what the
  defeat branch in `update()` checks to tell these apart — a miniboss
  defeat is a no-op for level/kill-count state, the others aren't.
- **New Game Plus**: beating the final boss shows "SIGNAL SECURED" /
  "CLICK TO PUSH DEEPER". Clicking continues into a harder "RUN 2" (then
  3, 4...) via `startGame(true)` — `runTier` increments, scaling spawn
  rate/enemy speed/ramp rate (`getDiffParams()`) and boss hp up each time.
  Dying (`startGame(false)`) or a fresh title-screen start resets
  `runTier` to 0. **Gotcha already fixed once**: both the DOM overlay
  click handlers *and* the canvas's own mousedown/touchstart listeners can
  trigger a restart — both must pass `continuing` correctly or clicking
  off-center on the win screen silently drops the escalation.

**THE RIFT (endless mode)** — unlocked the first time the campaign is
beaten (`unlockRift()` from `winGame()`, saved as `vortex-rift-unlocked`).
Entered from `#riftStart` on the title screen or `#riftFromCleared` on the
win screen, both calling `startGame(false, 'rift')`. `gameMode` is
`'campaign' | 'rift'`; `startGame(continuing, mode)` with `mode` omitted
replays the mode just lost when retrying from game over, and is campaign
otherwise, so all the existing `startGame(...)` call sites keep working.
Endless sectors of `RIFT_SECTOR_KILLS = 12` kills each; every
`RIFT_BOSS_EVERY = 3`rd sector ends in a boss whose defeat goes to the next
sector instead of `winGame()`. `enterRiftSector()` rolls a new enemy mix
(`rollRiftMix()`, weights used by `pickEnemyType()`) and a new tunnel shape
(`pickRiftShape()`, never the current one). Escalation is `riftTier()` (half
a run tier per sector) added to `runTier` in `getDiffParams()` and boss hp;
`riftMultiplier()` (×1, ×1.5, ×2...) scales kill points. HUD label switches
LVL→DEPTH. Rift records (`vortex-best-rift-depth`, `vortex-best-rift-score`)
are kept separate from the campaign best score.

**Enemies** (`enemies` array, each `{angle, z, shape, type, speed, alive,
baseAngle, phase, fireTimer?, formSeed?, hp?}`)
- `drone` — basic, straight in, level 1+.
- `weaver` — oscillates side to side, level 2+.
- `shooter` — slower, holds back and fires `enemyBolts` at the ship,
  level 3+.
- `grid` — classic Space-Invaders-style marching formation wave
  (`spawnFormation()`): a 3×2 block that sways in lockstep (shared
  `formSeed`, not spinning like the others), blocky "invader" silhouette.
- `pentagram` — level 3+, inverted five-pointed star in a ritual-circle
  ring, crimson, slow deliberate spin, **takes 2 hits** (`e.hp = 2`,
  cracks visibly after the first hit), worth 30 points instead of 10.
  The "something hellish came through the event horizon with everything
  else" enemy (Star Wars meets Event Horizon direction).

**Extra power-ups** — besides `hull` and `star`, `spawnPowerup()` rolls
`shield` (cyan hexagon: `shieldTimer = 8`s, `damageShip()` returns early
and shows BLOCKED), `overdrive` (orange chevrons: `overdriveTimer = 7`s of
automatic fire every `OVERDRIVE_FIRE_INTERVAL`) and `nova` (magenta burst:
`triggerNova()` kills every enemy and enemy bolt on screen, scoring them;
the boss only loses its incoming fire). Mix: hull 45%, star 18%, shield
15%, overdrive 13%, nova 9%. `#hudtriple` lists every active timer.

**Ship motion** — cosmetic only (shots always leave from the centre):
`shipX`/`shipVX` is a damped spring toward `sin(aimAngle)`, so the ship
glides along the bottom and banks into the slide; plus idle bob,
`shipRecoil` kick per shot, `shipHitWobble` shudder on damage, flickering
thruster flames (orange under overdrive) and the shield cage.

**Bullseye** — `findAimTarget()` picks the nearest enemy (or the boss)
within the bolt hit tolerance of the aim; `drawBullseye()` puts a rotating
red lock-on on it, or a faint purple bullseye out along the dotted firing
line when nothing is in line.

**Ship classes (from Spectre)** — `SHIP_CLASSES` (VIPER balanced 150
hull; INTERCEPTOR 110 hull, faster bolts, hold-to-fire via `pointerHeld`;
TANK 230 hull, slow bolts, bigger; GUNNER 130 hull, triple laser at every
level start and 1.5× triple pickups), picked on the title screen
(`#shipclass`, saved as `vortex-ship-class`). `hullMax` replaces the old
fixed `HULL_MAX` everywhere the hull is filled or drawn; `HULL_MAX` is now
just the VIPER default.

**Superzapper (from Tempest)** — one per level (`zapperCharges`, refilled
by `onLevelStart()`), fired with SPACE, right-click or `#zapBtn`
(bottom-right, for touch). `superzap()` reuses `triggerNova()` and knocks
the boss back to `BOSS_RESET_Z`. HUD line `#hudzap`.

**Warp (from Tempest)** — beating a level boss (or a Rift boss gate)
calls `startWarp(banner)` instead of showing the level banner: for
`WARP_DURATION` the tunnel speeds up (`warpBoost()`, ×7 at peak; ring
scroll now integrates `tunnelTravel` so speed changes don't jump), enemy
and power-up spawns pause, star streaks race past and green `spikes`
rush in along the walls. A spike reaching the rim within 0.35 rad of the
aim hits for `SPIKE_DAMAGE`; bolts can shoot them. `finishWarp()` shows
the next level's banner and calls `onLevelStart()`.

**Commander transmissions** — `say(key, lines, priority, cooldown)` types
a radio line into `#comms` (bottom-left) with a `playComms()` blip;
`lines` may be an array picked at random, each key has its own cooldown,
and a lower-priority line never cuts off a higher one mid-read.
Event lines: run start, hits, pickups, 10-kill streaks (`killStreak`,
reset by damage), miniboss/boss warnings, boss kills, warp start/arrival,
spikes. `commsWatch()` adds situational nags each frame: low hull, swarm
with the zapper still ready, enemies at close range, and not shooting for
6s. `shipCallout()` floats big text from the ship (pickup names, "-16
HULL"). Hidden whenever not playing.

**Missions (from X, 1992)** — each campaign level has a `missionType`
from `MISSION_TYPES` (rotating with `runTier`): `destroy` (KILL_TARGET
kills), `recover` (shoot `RECOVER_TARGET` cyan data `cores` before they
reach the rim) or `survive` (`SURVIVE_TIME` seconds against a swarm that
spawns ~2× faster). `missionProgress()` 0..1 drives everything: minibosses
at `MINIBOSS_THRESHOLDS` (now fractions 0.35/0.65), the boss once it hits 1,
and the HUD row via `updateObjectiveUI()` (the one place that writes
`#objlabel`/`#kills`/`#killTarget`). `startLevelMission()` (from
`onLevelStart()`) shows the `#briefing` box for `BRIEFING_TIME`;
`calmPhase()` (briefing or warp) pauses spawns and boss arming. The Rift
is always destroy, with no briefing.

**Radar (from X)** — `drawRadar()`, top-right: true lanes (no swirl/bank),
centre = far, rim = at the ship; aim wedge, sweep, enemies (blink when
close), boss, pickups, cores, bolts, spikes.

**Music per situation** — `MUSIC_TRACKS` crossfaded by `setMusicTrack()`:
garden (menus), destruction (campaign), rift (`nocherandom.mp3`), boss
(`cuerpoacido.mp3`, restarted per fight, real bosses only).
`gameplayTrack()` picks the mode's track. The two new files load lazily
(`preload='none'`) and pause when faded out.

**Comms language** — `#langToggle` (saved as `vortex-lang`) switches the
commander and briefings to Spanish: `COMMS_ES` maps each English line to
its Spanish one; newer lines are `{ en, es }` objects read via `L()`.
`arcadeCaps()` drops accents on capitals because the pixel font draws
them at lowercase height.

**Ship shapes** — `SHIP_SHAPES[i]` gives each class its own silhouette
(hull polygon, facets, struts/barrels, pods, engine mouths, cores);
`drawShip(opts)` draws any of them, live by default or into another
context (the title's `#shippreview`, redrawn every frame on the title).

**Echo pickup** — lime ripples: for `ECHO_DURATION` every shot is queued in
`echoQueue` and replayed `ECHO_DELAYS` (0.2s, 0.4s) later down the same
lane as lime `echo` bolts, fired by two lime ghost ships
(`drawEchoGhosts()`) that trail the ship's recorded path (`echoTrail`).

**Targeting** — aim line, rim reticle, dotted firing line and bullseye are
bright yellow and thicker; a lock turns the bullseye white-hot with a red
centre and ticks.

**Tron layer** — `derez()`/`derezAt()` burst wireframe voxel cubes
(`voxels`, updated on every screen so the ship's own `endGame()` de-rez
plays out under SIGNAL LOST; `shipDerezzed` hides the ship). Enemies,
nova kills and bosses all de-rez. `CIRCUIT_TRACES` are fixed seeded
circuit traces on the walls in (angle, z) space, with `circuitPulses`
racing along them toward the horizon (more often as `musicSwell` rises,
faster in a warp). `drawAimTrail()` draws the last 0.5s of the aim's path
as a light-cycle ribbon around the tunnel.

**Jack in (from Tron)** — title-screen name field (`#pilotname`, saved as
`vortex-pilot`) + `#jackinBtn`. `jackIn()` asks for the camera (optional;
refusal or no camera falls back to a procedural mask), then runs the
`'jackin'` state: `updateJackIn()` draws a red laser sweeping down the
full-screen `#digitize` canvas, revealing the player as a Rutt-Etra
wireframe (`drawRuttFace()`: scan lines lifted by brightness from a
64×48 mirrored sample in `sampleFace()`), then starts a campaign run.
While playing, `drawPortrait()` shows the live wireframe in `#portrait`
(red glitch when hit). The camera image never leaves the device. The
commander's lines swap PILOT/PILOTO for the name.

**Identity disc** — `disc` pickup sets `discCharges = DISC_THROWS` (3);
while charged, `fire()` calls `throwDisc()` instead of shooting (when no
disc is in flight). `updateDisc()` flies it out to z 0.5, sweeps one full
turn of the ring, then flies it back; every enemy (and the boss) it
touches gets one hit per throw by spawning a `hidden` bolt on it, so all
hit/kill/score logic stays in the normal bolt collision code.

**Recognizer** — `spawnBoss()` sets `boss.form = 'recognizer'` for level
2's boss and every 6th Rift depth: drawn by `drawRecognizer()` (legs, bar,
head, slit eye), it sways around the tube and stomps forward
(`stompTimer`/`lunge`), its eye flaring white just before.

**OVERSEER** — the rival AI. `hack(key, lines, …)` sends a line through
`say()` and marks it `comms.hack`: the box turns red, signs as
`> OVERSEER`, glitches characters and plays `playHack()`. Breaks in for
Recognizers, the final boss, the Rift, very low hull and (half the time)
on arriving in a new level, where it replaces the commander's line.

**Ranks** — `runRank(won)` grades each run S–D from progress (55),
accuracy `runHits/runShots` of real bolts (25) and damage taken (20);
`showRank()` puts the letter on SIGNAL LOST / SIGNAL SECURED.

**Achievements** — `ACHIEVEMENTS` (8), saved in `vortex-achievements`;
`unlockAchievement(id)` shows a `#toast`. Four unlock extra
`SHIP_PALETTES` (4–7: Ice, Toxic, Sunset, Sark); `paletteLock(i)` keeps
them dashed and unselectable until earned. Counter under the ship picker.

**Save clip** — all audio now goes through `audioOut()` (one master gain
feeding the speakers and `clipAudioDest`). `updateClipRecording()` keeps
two overlapping `MediaRecorder`s on `canvas.captureStream()` + that audio,
restarted every `CLIP_SEGMENT` s while a run or its results are up;
SAVE CLIP stops the older one and downloads `vortex-clip.webm` (the
last 8–16s). Canvas only: the HTML HUD/CRT overlay aren't in the clip.

**Daily tunnel** — `#dailyBtn` starts a campaign with `daily = true`:
`rng(stream)` is then a date-seeded mulberry32 with one independent
stream per spawner (`enemy`, `powerup`, `fire`, `core`), used by every
gameplay spawn and timer; effects still use `Math.random`. Best per day
in `vortex-daily-YYYY-MM-DD`. SHARE uses `navigator.share` or copies a
line with a `?daily` link, which highlights the daily button.

**Run clock** — `runT` (reset in `startGame`) drives difficulty, spawn
decay, tunnel pull and swirl. These used to read `t` (time since the page
loaded), so a second run in the same session started harder.

**Hull / damage** — `damageShip(amount)` is the one shared path for
enemy contact (16), enemy bolts (10), boss contact (22) — tuned down
once already from original harsher values so runs last longer. Power-ups
heal 45 (of `HULL_MAX = 150`, raised from 100 to make runs last).

**Power-ups** (`powerups` array, `{angle, z, alive, kind}`)
- `kind: 'hull'` (~78% of spawns) — gold triangle, repairs hull.
- `kind: 'star'` (~22%) — white/gold spinning 5-point star, Mario-star
  style. Grants `tripleLaserTimer = 9` seconds of 3-bolt spread fire
  (`fire()` branches on `tripleLaserTimer > 0`). HUD shows a countdown
  (`#hudtriple`) while active.
- Power-ups keep spawning through boss fights too (faster cadence while
  `bossActive`), so there's a way to heal during the hardest parts.

**Audio**
- WebAudio procedural SFX (`playBass`, `playZap`, `playHit`, `playDamage`,
  `playPowerUp`, `playEnemyShot`, `playBossHit`) — no audio files, pure
  oscillators.
- Background music is two `<audio>` elements (`musicGarden`,
  `musicDestruction`), mastered to -9 LUFS / -1 dBTP so they sit at
  commercial loudness, crossfaded via `setMusicTrack('garden'|
  'destruction')` on every state change (title/results vs gameplay).

**Music-reactive visuals** — `initMusicAnalyser()` routes both music
tracks through an `AnalyserNode`; `updateMusicMood(dt)` (called from
`update()`) reads the mid band (pads/chords) into `musicSwell` and the high
band (shimmer) into `musicShimmer`, each 0..1 against its own adaptive
floor/ceiling (`normaliseBand`). The soundtrack is ambient with a constant
bass drone, so this deliberately follows swells, not beats. Swell deepens
the background tint and brightens spokes/rings; shimmer washes the rings
toward cyan-white; `swellRings` drift in from the far wall more often the
fuller the music is. **Only works over http(s)** (e.g. GitHub Pages or
`python3 -m http.server`): on `file://` the analyser is skipped on purpose,
because a cross-origin MediaElementSource outputs silence and would mute the
music. The values then stay 0 and the game looks as it did before.

**Rutt-Etra rings** — named after the analog video synth that displaced
each scan line by the signal. `pushRuttRow()` (from `updateMusicMood`)
pushes a log-spaced, squared 48-bin spectrum row every 55ms onto
`ruttHistory` (newest = far end); `ruttDisplacement(angle, z)` reads it
back by depth (so sound rolls down the tunnel toward the player) and by
angle (mirrored: lows at the top of each ring, highs at the bottom).
`drawTunnel()` pushes each ring point outward from the ring's centre by
that amount while the history is live, at `RUTT_SAMPLES` density. Visual
only; aim and hits never read it. Off on `file://` like the rest of the
music analysis.

**Sparks** — `burst()` particles start faster and slow down with drag in
`update()`, drawn as streaks along their velocity instead of dots.

**HUD** (`#hud`) — boxed panel, LVL/SCORE row, KILLS x/target, optional
RUN n indicator (`#hudrun`, shown once `runTier > 0`), optional TRIPLE
LASER countdown (`#hudtriple`), then HULL/BOSS bars on a shared label
column.

**Visuals** — Atari-style flickering pixel title (Press Start 2P font,
`buildFlickerTitle()`), "HIT!" callout labels, bit-burst particles on
kills, low-poly gem-cut player ship (`drawShip()`) with Valknut emblem,
CRT overlay (`#crtOverlay`, pure CSS scanlines + vignette + flicker,
toggle button on title screen, preference saved to `localStorage`).

**Screen shake** — `triggerShake(magnitude, duration)` sets `shakeMag`/
`shakeTimer` (always keeping the larger of a repeated call, never
stacking); `update(dt)` decays `shakeTimer` toward 0, and `draw()` adds a
small random jitter translate (scaled by both `shakeMag` and the
remaining `shakeTimer`) inside the same `ctx.save()`/`camRoll` block used
for camera banking. Wired into ship damage (`damageShip`), enemy/
pentagram kills, boss hits, and boss/miniboss kills (biggest shake on a
real boss kill, smallest on a regular enemy).

**Ship accent color** — `SHIP_PALETTES` (Violet/Crimson/Cyan/Gold, each a
`{main, glow}` hex pair) and `shipPaletteIndex`, picked via swatch
buttons on the title screen (`#shipcolor`), persisted to `localStorage`
(`vortex-ship-palette`). `drawShip()` reads the active palette instead of
hardcoded hex, using `hexToRgba()` for the translucent facet/fin lines.

**Best score / furthest run** — `bestScore`/`bestRunTier`, loaded from
`localStorage` (`vortex-best-score`, `vortex-best-run`) on startup and
updated by `recordRunResult()` (called from both `endGame()` and
`winGame()`, so a win and a loss both count). Shown on the title screen
(`#besttag`) as "BEST n   FURTHEST: RUN n" once a run has been played.

**Branding** — NEMO INC. logo + wordmark shown only on the title screen
(`#titlebrand`), embedded as base64 PNG with real transparency (the first
version used a JPEG with a black background and a `mix-blend-mode:
screen` hack — replaced once a proper transparent PNG was supplied).

## Verifying changes

There's no test suite, but this session's workflow for every change was:
1. Extract the `<script>` contents and run `new Function(code)` in Node
   to catch syntax errors before sending.
2. For logic changes (level-up thresholds, boss hp, power-up timers,
   run-tier escalation), stub out `document`/`window`/`Audio`/etc. in
   Node and call `update(dt)` / `spawnEnemy()` / `startGame()` directly
   in a loop to simulate many frames and assert on the resulting state
   (`currentLevel`, `killCount`, `tunnelSides`, etc.) rather than trusting
   static reading alone. Caught at least one real bug this way (a
   finishing-blow race condition where two bolts killing the boss in the
   same frame caused a null-dereference).

## Multiplayer

**Co-op link (stage 1)** — CO-OP: ADD PLAYERS opens `#lobby`: the game
creates a PeerJS peer `vortex-xxxxx` and shows a QR code (`lib/qrcode.js`)
for `pad.html?host=<id>`. `pad.html` is the phone controller (drag to aim,
hold to fire, ZAP) and only sends input; the host runs everything.
Up to 3 `coPlayers` (P2–P4, `COOP_COLORS`) fly interceptors in formation
above the main ship with their own firing line and bullseye; shared hull,
score, zapper and power-ups. Host → pad: `welcome`, `state` (4/s), `hit`
(vibrate). Pads ping every second and are dropped after 6s of silence.

Libraries are bundled in `lib/` (PeerJS 1.5.5, qrcode-generator 2.0.4,
both MIT, see `lib/LICENSES.txt`) so nothing loads from a CDN. PeerJS's
free public server introduces the devices; after that they talk directly
(WebRTC). Networks that block peer-to-peer (some venue/office Wi-Fi) need
a TURN relay. For local testing, add `?peerhost=127.0.0.1:9000` to point at
a self-hosted `peer` server (it's passed on to the pad link).

**Versus (stage 2)** — VERSUS: CHALLENGE A FRIEND opens the lobby with a
QR code for `index.html?versus=<id>`; opening it shows ACCEPT CHALLENGE
(`acceptVersus()`), the challenger replies (`hostVersus()`) with its name
and a random `vsSeed`, then both screens run a 3s `'countdown'` state and
`startGame(false, 'versus')`: a Rift-style endless run (`gameMode
'rift'` + `versus = true`) seeded with `vsSeed` through `rng()`, so both
start on the same waves. Every `VS_KILLS_PER_ATTACK` kills (`versusKill()`)
sends `vs-attack`, which spawns a fast magenta `intruder` on the other
side. `#vspanel` shows the rival's hull/score from `vs-status` (4/s, which
doubles as the heartbeat: 8s of silence = forfeit). Dying sends `vs-dead`;
the survivor gets VICTORY (`versusWin()`), the other DEFEATED, and clicking
either asks for a rematch (both must click). Versus scores don't touch the
solo records.

**Light cycles (stage 3)** — LIGHT CYCLES opens a lobby (QR for
`index.html?cycles=<id>`) with START ROUND. The visible tunnel becomes a
`CY_N`×`CY_M` grid on the tube wall (`cyPoint()` maps cells through
`pointOnRing(..., { visual: false })`). Up to 4 riders (you, a joined
friend, AI `PROGRAM`s for the rest) move one cell per `CY_TICK`, turn 90°
in their own frame (left/right arrows or A/D, mouse buttons, tap screen
halves) and leave walls in `cyGrid`; walls, the rim and the far edge
de-rez you, and a crashed rider's wall clears 1.2s later. Last one alive
wins; click for the next round, ESC for the menu. Host-authoritative: the
host runs `cyStep()` and sends `cy-start` / `cy-tick` / `cy-end`; the
guest only sends `cy-turn` / `cy-again`.

## Ideas discussed but not yet built

From comparing notes against Vecter (Steam), linefire/VectorSwarm, and a
couple of GitHub resource lists:
- Procedurally generated / seedable camera path (currently a fixed
  8-segment straight/curve loop defined in `PATH_SEGMENTS_DEF`).
- A classic Space-Invaders-style full grid wave was floated as a
  throwback idea beyond the current `grid` formation enemy — the
  formation enemy shipped, a larger set-piece wave did not.

Shipped since the last export: ship/accent color customization, local
high score + furthest-run tracking, and screen shake — all three were on
this list before and are now built (see Architecture above).
