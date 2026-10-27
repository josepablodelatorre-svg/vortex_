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
