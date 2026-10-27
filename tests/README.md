# VORTEX tests

Headless browser tests (Playwright + Chromium). Each `*.test.js` opens the
game, drives it through `page.evaluate` (the game's globals are reachable
from the page) and prints `PASS` / `FAIL` lines. A test file fails if any
line fails, it crashes, or the page throws an error.

## Run

```sh
cd tests
npm install                 # playwright, plus express + peer for multiplayer
npx playwright install chromium   # first time only
npm test                    # every test file
node run.js coop pause      # only files whose name contains a word
```

`run.js` serves the repo on `http://127.0.0.1:8765` (`static-server.js`)
and, for the multiplayer tests, starts a local PeerJS server on
`127.0.0.1:9000` (`peer-server.js`; the game uses it through
`?peerhost=127.0.0.1:9000`). If something is already listening on either
port it is reused. Screenshots land in `tests/shots/` (not committed).

## Files

| File | Covers |
| --- | --- |
| `levels` | one map per level, change after the boss; midway checkpoint; trench vent; Rift gates |
| `campaign` | mission types, briefing, boss/level music, final boss, radar, Spanish comms |
| `checkpoints` | checkpoint save and CONTINUE |
| `tutorial` | first-run guided warm-up, once only, replay and skip |
| `settings` | glow modes and AUTO, volume sliders, vibration, saved settings |
| `save` | old keys folded into the one versioned save, reload, corrupt save, pad |
| `flashing` | photosensitivity warning, reduced flashing effects, settings toggle |
| `install` | manifest + icons, service worker caching, loads and plays offline |
| `leaderboard` | top-10 boards per mode, results tag, board screen, saved |
| `gamepad` | fake controller: menus, aiming, auto-fire, bomb, pause |
| `backup` | credits, save code copy/file, restore from code and file |
| `pause` | P / Esc / button, auto-pause when hidden, MENU, no pause in versus |
| `ship-classes` | class choice, hulls, bombs, warp spikes, gunner + interceptor perks |
| `powerups` | shield, nova, ship movement, bullseye lock, pickup mix |
| `echo` | echo pickup, hangar previews |
| `disc-watchdog` | Lambda Disc and the Watchdog boss |
| `dodging` | lower-half arc, lane hits, plasma shield |
| `track-items` | boost/brake pads, hoops, portals |
| `coins`, `missions` | coins, upgrades, missions, daily streak |
| `achievements` | unlocks, palette rewards, ranks |
| `comms` | commander lines and callouts |
| `screens`, `cockpit`, `jack-in`, `shatter`, `rift` | start screens, cockpit view, camera intro, ship shatter, THE RIFT |
| `coop`, `versus`, `daemons` | multiplayer over the local PeerJS server |
| `bosses-visual`, `iphone-visual` | screenshots (and layout checks at iPhone size) |

Every test except `tutorial` marks the tutorial as done through
`addInitScript`, so runs start straight into level 1.

Many checks depend on frame timing in a headless browser; where a test
waits for something to happen it polls (`waitForFunction`) rather than
sleeping a fixed time, so a slow machine only makes it slower.
