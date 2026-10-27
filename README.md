# VORTEX — project handoff

A browser-based vector tunnel rail-shooter, built for the Claude for Games
build-day at Platzi México (Oct 26, 2026). Tempest / Polybius / Tubeway /
Space Invaders Infinity Gene inspired. Single-evening scope: no build step,
no bundler, no external JS frameworks — plain HTML5 Canvas2D + Web Audio.

## Running it

Just open `index.html` directly in a browser (double-click it, or
`file://` it). No server, no npm install, nothing to build. Everything it
loads is by relative path, so `style.css`, `src/`, `lib/`, `img/` and
`audio/` must sit next to it.

## File layout

```
index.html       — the page: HUD, title screens, overlays (markup only)
style.css        — all styles
src/             — the game, as plain scripts loaded in this order:
  save.js          the one versioned save entry (store), flickering title
  i18n.js          Spanish for the interface (T(), UI_ES)
  audio.js         settings (volume, glow, vibration), SFX, music, analyser
  progression.js   game state, track items, coins, missions, checkpoints,
                   the Rift, level objectives
  world.js         difficulty, tunnel + camera path, entity lists, projection
  environments.js  tube / trench / asteroids / space / planet surface
  input.js         mouse, touch, keyboard, cockpit view
  meta.js          CRT, achievements, palettes, ship classes, clips, daily
                   tunnel, ranks, best scores, screen shake
  flow.js          starting/ending runs, spawning, commander comms
  pilot.js         jack-in intro, level start, bombs, warp, pickups
  update.js        update(dt), the per-frame simulation
  draw.js          all canvas rendering
  multiplayer.js   co-op, versus, Daemons (PeerJS)
  screens.js       start screens, tutorial, pause, save backup
  online.js        world leaderboard (Supabase REST)
  gamepad.js       game controllers (Gamepad API)
  main.js          the requestAnimationFrame loop
pad.html         — the phone controller for co-op
privacy.html     — privacy policy (linked from CREDITS)
lib/             — PeerJS + qrcode-generator (MIT, see LICENSES.txt)
fonts/           — Press Start 2P (SIL Open Font License, fonts/OFL.txt)
img/nemo-logo.png
audio/
  garden.mp3       — calm theme, plays on title/results screens
  destruction.mp3  — aggressive theme, plays during gameplay
  nocherandom.mp3  — THE RIFT
  cuerpoacido.mp3  — boss fights
supabase/        — world leaderboard schema + setup guide
tests/           — headless browser tests (see tests/README.md)
```

The scripts are classic `<script src>` files, not modules: they share one
global scope, exactly as when they were one inline script, so a top-level
`let` in one file is visible in the others. Order matters only for code
that runs at load time; everything else runs after all files have loaded.

## Core concept

The player aims and fires from the center of an auto-scrolling neon
polygon tunnel (nonagon by default). Firing pulses light up the tunnel in
sync with procedural WebAudio sound effects. The camera "flies" through a
banked, swirling path toward an accelerating event horizon — real
left/right/up/down turns, not just a static tube.

## Architecture (the scripts in `src/`)

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

**Extra power-ups** — kept to six, each doing one clear thing. Besides
`hull` and `star`, `spawnPowerup()` rolls `shield` (cyan hexagon:
OVERCHARGE, refills the plasma layer and stacks one more full layer on
top — `plasmaMax × (1 + chargeMul())` — which lasts until it is shot
away; the bar turns white while overcharged), `echo`, `disc` and `bomb`
(magenta burst: +1 bomb, up to `BOMB_MAX`; the bomb's blast is
`triggerNova()`, which kills every enemy and enemy bolt on screen, scoring
them; the boss only loses its incoming fire). Mix: hull 40%, star 16%,
shield 15%, echo 11%, disc 10%, bomb 8%. `#hudtriple` lists every active
timer. (Overdrive was cut: it overlapped the interceptor's auto-fire and
lock-in.)

**Ship motion** — cosmetic only (shots always leave from the centre):
`shipX`/`shipVX` is a damped spring toward `sin(aimAngle)`, so the ship
glides along the bottom and banks into the slide; plus idle bob,
`shipRecoil` kick per shot, `shipHitWobble` shudder on damage, flickering
thruster flames (flaring on a boost pad) and a hex cage while plasma is
overcharged.

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

**Cyber layer** — `shatter()`/`shatterAt()` burst wireframe voxel cubes
(`voxels`, updated on every screen so the ship's own `endGame()` shatter
plays out under SIGNAL LOST; `shipShattered` hides the ship). Enemies,
nova kills and bosses all shatter. `CIRCUIT_TRACES` are fixed seeded
circuit traces on the walls in (angle, z) space, with `circuitPulses`
racing along them toward the horizon (more often as `musicSwell` rises,
faster in a warp). `drawAimTrail()` draws the last 0.5s of the aim's path
as a light-racer ribbon around the tunnel.

**Jack in** — title-screen name field (`#pilotname`, saved as
`vortex-pilot`) + `#jackinBtn`. `jackIn()` asks for the camera (optional;
refusal or no camera falls back to a procedural mask), then runs the
`'jackin'` state: `updateJackIn()` draws a red laser sweeping down the
full-screen `#digitize` canvas, revealing the player as a Rutt-Etra
wireframe (`drawRuttFace()`: scan lines lifted by brightness from a
64×48 mirrored sample in `sampleFace()`), then starts a campaign run.
While playing, `drawPortrait()` shows the live wireframe in `#portrait`
(red glitch when hit). The camera image never leaves the device. The
commander's lines swap PILOT/PILOTO for the name.

**Lambda disc** — `disc` pickup sets `discCharges = DISC_THROWS` (3);
while charged, `fire()` calls `throwDisc()` instead of shooting (when no
disc is in flight). `updateDisc()` flies it out to z 0.5, sweeps one full
turn of the ring, then flies it back; every enemy (and the boss) it
touches gets one hit per throw by spawning a `hidden` bolt on it, so all
hit/kill/score logic stays in the normal bolt collision code.

**Watchdog** — `spawnBoss()` sets `boss.form = 'watchdog'` for level
2's boss and every 6th Rift depth: drawn by `drawWatchdog()` (legs, bar,
head, slit eye), it sways around the tube and stomps forward
(`stompTimer`/`lunge`), its eye flaring white just before.

**OVERSEER** — the rival AI. `hack(key, lines, …)` sends a line through
`say()` and marks it `comms.hack`: the box turns red, signs as
`> OVERSEER`, glitches characters and plays `playHack()`. Breaks in for
Watchdogs, the final boss, the Rift, very low hull and (half the time)
on arriving in a new level, where it replaces the commander's line.

**Ranks** — `runRank(won)` grades each run S–D from progress (55),
accuracy `runHits/runShots` of real bolts (25) and damage taken (20);
`showRank()` puts the letter on SIGNAL LOST / SIGNAL SECURED.

**Achievements** — `ACHIEVEMENTS` (8), saved in `vortex-achievements`;
`unlockAchievement(id)` shows a `#toast`. Four unlock extra
`SHIP_PALETTES` (4–7: Ice, Toxic, Sunset, Inferno); `paletteLock(i)` keeps
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

**Dodging** — the ship rides an arc around the lower half of the screen
(`shipLane`, 3 to 9 o'clock, `shipScreenPos()`), following the aim at up
to `LANE_SPEED` and parking at an end when you aim upward; its nose points
at the centre. Enemies, enemy bolts and boss contact only hurt inside the
ship's lane (`inShipLane()`, `LANE_HIT`); near misses call out DODGED!.

**Three bars** — HULL; PLSM, a plasma shield (`PLASMA_FRACTION` of the
hull) that takes hits first and recharges after `PLASMA_REGEN_DELAY`; PWR,
charged `POWER_PER_KILL` per kill. The bomb (zapper) shows as `BOMB x1`.
In cockpit view these bars hide (`body.cockpitview`): the dashboard dials
show them instead.

**Lock-in** — with PWR full, L or the LOCK button: for `LOCKIN_DURATION`
the ship flies a tighter ring further in, can ride the whole 360°, slides
twice as fast and auto-fires; power drains as it runs.

**Track objects** — `trackItems` spawn every few seconds in lanes on the
ship's arc and ride in with the tunnel; reaching the rim inside the ship's
lane (`TRACK_HIT`) triggers them (`triggerTrackItem()`): `boost` arrow pad
(`padSpeed()`/`padPull()` ×2.2/×1.35 for `PAD_TIME`, +100), `brake` zebra
pad (×0.5/×0.6), psychedelic `hoop` (a random pickup + `tripTimer`, a
hue-rotate CSS filter on the canvas) and `portal` (teleports the ship to
the mirror lane, or straight across the ring during lock-in).

**Warship bosses** — `drawBoss()` draws bosses head-on as ships:
`drawGunship()` (miniboss), `drawDreadnought()` (level boss) and
`drawMothership()` (final boss); the level-2 Watchdog keeps its own shape.
A locked boss gets corner brackets (`drawLockBrackets()`) instead of a
bullseye over it. Weavers are alien jellyfish (`squid` shape), so nothing
hostile resembles the player's interceptors.

**Environments + routes** — `ENV` defines five looks (tube, trench,
asteroid, space, surface) as numbers `envK` eases toward: vortex swirl,
path bend, cross-section stretch/rotation (the trench is a wide flat-
floored box), rocky ring noise, and how visible the tube is. They only
change drawing (`pointOnRing` visual mode); hit tests are untouched.
`LEVEL_ENVS` gives each of the 5 campaign levels (`LEVEL_COUNT = 5`) one
map — tunnel, asteroids, open space, trench, planet surface — and the
scenery only changes when a level's boss goes down and you warp
(`routeEnv()` / `setEnv()` from `onLevelStart`). Level 3, open space, is
the breather (`ENV.space.spawn` = fewer enemies, faster pickups). The Rift
moves through `RIFT_ENVS` one map per boss gate (every `RIFT_BOSS_EVERY`
depths). `drawSpace()` = streaming stars, a spiral
galaxy and a black hole at the vanishing point; `drawSurface()` = sky,
sun (or moon) and scrolling wireframe mountains (`noise2()`) with a flat
valley down the middle. Trenches favour shooters (wall turrets) and end
with a `vent` track item you must shoot (+500), sent at 85% of the level
just before the boss (`ventSpawned`); asteroid fields add `rock`
enemies (3 hp).

**Tutorial** — the first campaign run opens with a guided warm-up on
level 1 (`TUTORIAL_STEPS`: aim, fire, kill three, dodge one, grab a
pickup, bomb, lock-in), one instruction at a time in the `#coach` panel,
each waiting for the pilot to do it (`tutorialEvent()` hooks plus checks
in `updateTutorial()`). Regular spawns pause (`calmPhase()`), the hull
can't drop below half, and level 1 then starts clean with its briefing.
SKIP TUTORIAL leaves at any point; it runs once (`vortex-tutorial`, and
pilots with a best score never see it) and SETTINGS has PLAY TUTORIAL.
The panel lets taps through, so firing works under it.

**Save data** — everything the game remembers is one versioned
localStorage entry, `vortex-save` = `{ v, data }` (`store`, at the top of
the script). `data` keeps the old item names (`vortex-coins`,
`vortex-checkpoint`, `vortex-settings`, ...) and `store.getItem/setItem/
removeItem` mirror localStorage, string values included. On load, any
separate `vortex-*` keys from older builds are folded in and removed;
`migrate()` is where future format changes go (bump `SAVE_VERSION`). A
corrupt entry just starts fresh; a `storage` listener keeps two open tabs
from writing stale data over each other. `pad.html` reads and writes the
pilot name inside the same entry.

**Settings** — SETTINGS also has GLOW (AUTO/ON/OFF), VIBRATION and
MUSIC / SFX sliders, saved in `vortex-settings` (`settings`). Glow is the
canvas `shadowBlur`, the most expensive effect: the prototype setter is
wrapped so one flag (`glowActive`) zeroes it everywhere, and on AUTO
`watchFrameRate()` turns it off after 2 s under 40 fps and back on after
8 s over 56. Music volume scales `MUSIC_VOLUME`; effects go through their
own gain node (`sfxOut()`). `vibrate()` buzzes on hits, bombs and boss
kills (Android; iPhones have no web vibration).

**Flashing / photosensitivity** — the first time a game is about to start
(after the title screens, before any gameplay) a photosensitivity warning
appears (`#flashwarn`, EN + ES) with REDUCED FLASHING or CONTINUE;
`startGame()` / `continueFromCheckpoint()` call `askFlashWarning(then)` and
carry on once it's answered. Not in versus (the other player already
started). Remembered as `vortex-flash-warned`. SETTINGS → FLASHING: FULL / REDUCED
(`settings.flash`, `flashScale()`). Reduced: the warp fades to grey instead
of inverting, the hoop trip is a slow gentle colour drift, screen flashes
(level change, damage, teleport) are a quarter strength, shake is cut to a
third, and the CRT and title flicker stop (`body.calm`).

**Multiplayer reliability** — PeerJS's free public server introduces the
devices (`peerOptions()` adds Google + Cloudflare STUN servers for mobile
networks). Network/server errors are retried with growing gaps
(`NET_RETRYABLE`, `NET_RETRY_DELAYS`, `netRetryDelay()`): a host that never
got a link starts over, a host whose link-server connection drops
reconnects with the same id so the QR code stays valid
(`keepPeerReachable()`), and versus/Daemons guests retry joining.
`pad.html` rejoins by itself when its link drops (`retryLater()`, up to
five tries), ignoring events from connections it has replaced. For a
public launch, run our own PeerJS server (and a TURN server for phones
behind strict networks) and point `peerOptions()` at it.

**Language** — SETTINGS → LANGUAGE: EN / ES switches the commander,
briefings and now the whole interface (`src/i18n.js`). The code writes
English; with Spanish on, `T()` translates any text that reaches the page
(exact matches in `UI_ES`, then `UI_ES_PATTERNS` for texts with numbers
or names, then piece by piece), applied by a MutationObserver
(`applyUiLang()`), and canvas labels call `T()` directly. Switching back
restores the English. Spanish is in the arcade style the commander uses:
capitals without accents, Ñ ¡ ¿ kept.

**Controllers** — `src/gamepad.js` polls the Gamepad API every frame
(`pollGamepad()` from the loop), standard mapping (Xbox / PlayStation /
most pads). In play: either stick aims, A or RT fires (held = auto-fire,
`PAD_FIRE_EVERY`, or the interceptor's own rate), X or LT bombs, Y or RB
lock-in, START pauses. Everywhere else (title screens, pause, results,
the photosensitivity notice) the d-pad / left stick moves a highlight
between buttons (`padTargets()`, `.padfocus`, shown once a pad is used),
A presses, B is back, left/right nudge a slider.

**Save backup** — SETTINGS → SAVE BACKUP shows the whole save as a code
(`VTX1:` + base64 of the save JSON) to copy or download as a file; pasting
a code or opening a file restores it (second tap confirms, then reload).

**Leaderboard** — top 10 per mode on this device (`boards`, saved as
`vortex-leaderboard`): CAMPAIGN, RIFT and DAILY (today's tunnel only).
Every finished run goes through `addToBoard()` from `recordRunResult()`
(not versus), with pilot name, score, how far (`L3`, `WIN`, `+1` for a
New-Game-Plus run, `D7` in the Rift), rank letter and ship class; results
screens say `NEW #1 ON THE LEADERBOARD!` / `LEADERBOARD #n`. Menu →
LEADERBOARD (`renderBoard()`) opens on the mode just played and highlights
the latest entry. Its THIS DEVICE / WORLD switch shows the online board.

**World leaderboard** — `src/online.js` posts every counted run to a
Supabase table (`supabase/schema.sql`, setup in `supabase/README.md`) with
plain `fetch` against the REST API and Supabase's publishable key
(`ONLINE`); row-level security allows reading and adding only. Results add
`WORLD #n` (a count of better scores) to the leaderboard line. Runs that
can't be sent wait in the save (`vortex-pending-scores`) and go out with
the next run or the next launch. Names are cleaned to the pixel font's
characters (`cleanName()`). Local copies (localhost, file://) don't post
to the real board; tests point at `tests/scores-server.js` with
`?scores=`.

**Install + offline** — `manifest.webmanifest` (fullscreen, icons in
`img/icons/`, drawn by script in the game's style) makes VORTEX installable
to a phone's home screen ("Add to Home Screen" on iPhone, the install
prompt on Android/desktop Chrome). `sw.js` caches the game's files and
serves them network-first (so new versions arrive whenever online, the
cached copy when not). Music is streamed; each track is cached in the
background the first time it plays, so offline sessions have whatever has
been heard before. Multiplayer needs the network. Registered only over
http(s); opening `index.html` from disk still works without it.

**Pause** — P / Esc / the II button under the radar (`pauseGame()` /
`resumeGame()`); the game also pauses itself on `visibilitychange` and
window `blur` (phone lock, tab switch). While paused the loop skips every
update, the music elements pause and the AudioContext is suspended.
Not available in versus. MENU on the overlay leaves the run (the
checkpoint is kept).

**Warp ink** — `startWarp()` sets `inkTimer = INK_TIME` (7s): a CSS
grayscale + invert + contrast filter on the canvas turns everything into
black ink on white, easing in and out (it overrides the hoop hue trip).

**Coins + upgrades** — `coin` track items come in rows of 5 down one lane
(`spawnCoinRow()`, the most common floor item); fly over them (lane widened
by the magnet upgrade) for `addCoins(1)`; bosses pay 10/25. Coins are
saved (`vortex-coins`) and spent on the UPGRADES screen (`renderShop()`,
`UPGRADES`, saved as `vortex-upgrades`): PLASMA CELLS, LONG CHARGE
(`chargeMul()` on timed pickups), COIN MAGNET, EXTRA BOMB, POWER CORE.
Results show the run's coins. Coins are only ever earned by playing.

**Missions + daily streak** — three active missions from `MISSION_POOL`
(saved as `vortex-missions`), fed by `missionEvent(key, amount)` calls
(kills, dodges, coins, bosses, portals, pads, hoops, lock-ins, disc hits,
asteroids, vents, level reached). Each pays coins; finishing all three
deals a bigger set and raises `missionMult()` (+0.1 to every kill score,
for good). `checkStreak()` on the first run of each day extends or
restarts `vortex-streak` and pays 20 × days (max 7). MISSIONS screen in
the menu. Toasts now queue (`showToast` → `nextToast`) so several at
once are each shown.

**Checkpoints** — campaign only (not daily/Rift/versus). `saveCheckpoint()`
at every level start from level 2 (`onLevelStart`) and once at 50% of the
level's objective (`midSaved`, checked in `updateEnv`), into `vortex-checkpoint` with level,
run tier, score and the mission progress. CONTINUE on SIGNAL LOST
(`#contFromLost`) and in the menu (`#continueBtn`) call
`continueFromCheckpoint()`. Beating the campaign clears it.

**Cockpit view** — SETTINGS → VIEW: CHASE / COCKPIT (`viewMode`, saved as
`vortex-view`). In cockpit the ship isn't drawn and the view stays steady
(the world doesn't turn with your lane, only banks with the camera path);
a glowing chevron on the window's edge marks the ship's lane, and
`shipCallout()` pops text low in the window instead of at the ship.
`drawCockpit()` frames it like an early-90s
handheld flight sim in VORTEX neon (`cockpitLayout()` sizes it): a heavy
bezel with dithered corners round a rounded window, a mission clock plate
(counting down on survive missions), score and level on the bezel, a speed
ladder (left), hull + plasma cells (right), a compass strip with hazard
stripes, and a dashboard with a LOCK ON / SCAN / LOCK-IN panel, power
cells, the radar scope (`drawRadar(cx, cy, r, true)`) over the flight mode,
a 4×4 sector map filling with the objective (boss cell last), and weapon
slots (triple, echo, disc, bombs). It all jolts on hits. The HTML HUD hides
in cockpit and the comms box and BOMB / LOCK / pause buttons move inside
the glass (`--cp-*` CSS variables set in `syncRunClass()`).

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
- Sound effects are a small 80s/early-90s synth built on WebAudio, no
  samples: `voice()` (detuned saw/square/noise unison through a resonant
  filter sweep, Moog-style) and `fm()` (two-operator FM, DX7-style bells,
  clangs and e-piano blips) feed one effects chain in `sfxOut()`: SFX-slider
  gain → soft analog drive (`makeDriveCurve`) → Juno-style stereo chorus,
  plus an echo send (`echoBus`, dark feedback delay). Voices can also run
  through `crusher(bits, drive)` (a stepped, overdriven waveshaper: lo-fi
  bitcrush) and `phaser()` (four swept all-pass stages). Effects: `playZap`
  (laser: a fast high-to-low dive through a swept phaser, faint echo), `playBass` (its thump), `playHit` (kill: FM snap + noise crack,
  bitcrushed),
  `playEnemyShot`, `playDamage` (crushed, driven growl), `playPowerUp` (chorused arpeggio),
  `playBossHit` (FM clang + sub), `playComms`, `playHack`, and `playCoin`:
  each coin of a run plays the next note up a pentatonic scale
  (`COIN_SCALE`), so a row of five rings out as a rising arpeggio.
- Coins are collected by flying through them (in your lane as they reach
  you); a coin lined up with your lane glows and pulses, and each one pops
  a gold sparkle and `+1`. The tutorial has a coins step.
- Background music is four `<audio>` elements (`MUSIC_TRACKS`: garden,
  destruction, rift, boss) crossfaded by `setMusicTrack()` on every state
  change. All are 160 kbps MP3 at about -10 LUFS, peak-limited (4x
  oversampled `alimiter`) so nothing clips — about 33 MB in total, down
  from 43 MB. Nothing preloads: garden and destruction start streaming on
  the first tap (`startMusic()`), rift and boss when first needed.
  Re-encode command, from the masters:
  `ffmpeg -i in.wav -af "aresample=176400,alimiter=limit=0.84:attack=1:release=60:level=disabled,aresample=44100" -c:a libmp3lame -b:a 160k out.mp3`

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

**Branding** — Nemo Inc logo + wordmark shown only on the title screen
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

**Start screens** — `#title` holds `.screen` sections switched by
`showScreen(name)`: `splash` (logo, INFINITE SPACE. INFINITE WAR., any tap
→ `titleTap()` → menu), `menu` (PLAY, DAILY TUNNEL, THE RIFT once
unlocked, MULTIPLAYER / HANGAR / SETTINGS via `data-go`, plus a loadout
line), `hangar` (ship preview, class, colour, achievements, name + JACK
IN), `multi` (co-op, versus, Daemons) and `settings` (difficulty, CRT,
comms language). Runs only start from PLAY/DAILY/RIFT/mode buttons;
results screens have a MENU button (`backToMenu()`). `body.inrun` hides
the HUD outside runs. A `max-width: 600px / max-height: 500px` media
query compacts everything for phones, moves the comms box to the top so
it never covers the ship, and keeps HUD/buttons clear of the notch
(`viewport-fit=cover` + `env(safe-area-inset-*)`).

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

**Daemons (stage 3)** — DAEMONS opens a lobby (QR for
`index.html?cycles=<id>`) with START ROUND. The visible tunnel becomes a
`CY_N`×`CY_M` grid on the tube wall (`cyPoint()` maps cells through
`pointOnRing(..., { visual: false })`). Up to 4 riders (you, a joined
friend, AI daemons from `DAEMON_NAMES` for the rest) move one cell per `CY_TICK`, turn 90°
in their own frame (left/right arrows or A/D, mouse buttons, tap screen
halves) and leave walls in `cyGrid`; walls, the rim and the far edge
shatter you, and a crashed rider's wall clears 1.2s later. Last one alive
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

## Balance simulator

`node tools/balance.js [difficulty] [skill] [runs]` has a bot pilot play
whole campaigns through `simulate(dt)` (the loop minus drawing), far
faster than real time, and prints per level: how many runs reached it,
deaths, time, boss-fight time and damage taken. The bot points at where
things are drawn (like a person), with a reaction time, aim error, limited
hand speed, distraction, click rate and dodge chance per skill (`novice`,
`average`, `good`; plus `perfect` and `idle` for diagnostics).

What the first pass found and changed:
- Aim didn't match the picture: far enemies are drawn swirled, bent and
  banked, but shots used the raw pointer angle, so pointing at a distant
  enemy missed (by over 0.6 rad on level 1). Now `findAimTarget()` locks
  whatever the pointer is on *as drawn* (`seenAngle()`, `AIM_GRAB`) and
  `fire()` sends the bolt down that target's lane.
- Bosses couldn't hurt the ship: they sat at the top of the ring while the
  ship rides the bottom half. Warships now drift toward the ship's lane
  (faster each level), the Watchdog sways across the bottom, and volleys
  are spread wider (±0.38) than one shot can cancel (`da < 0.25`).
- Boss fights lasted 1–5 s: `BOSS_HP_BASE` 30, `+8` per level, minibosses
  12. Lock-in comes about once a level (`POWER_PER_KILL` 5).
- Difficulties barely differed: denser spawns all round, and each preset
  now scales damage taken and enemy fire rate (`damage`, `fire` in
  `DIFFICULTY_PARAMS`: easy 0.75/1.25, normal 1/1, hard 1.4/0.7).

## Tests

Headless browser tests live in `tests/` (Playwright). `cd tests && npm
install && npm test` runs them all against a local server; see
`tests/README.md`.
