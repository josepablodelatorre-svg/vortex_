# Handoff — continuing VORTEX in a different Claude session

This folder is a full export of the game as of this point in the build.
Open `index.html` directly in a browser to play it right now — nothing
needs building. If you're picking this up in a fresh Claude Code session
to keep building with separate credits, read `README.md` first (full
architecture map), then this file for where things stand.

## State as of this export
Everything below is built, tested in a headless browser and live on GitHub
Pages (https://josepablodelatorre-svg.github.io/vortex_/). README.md has
the architecture of each piece.
- Start screens (splash, menu, hangar, multiplayer, upgrades, missions,
  settings), phone layout, EN/ES commander.
- 5-level campaign, one environment per level, changing after each boss
  (tunnel, asteroids, open space, trench, planet surface); THE RIFT; daily tunnel.
- Dodging on a lower-half arc, plasma shield, power + lock-in, bombs.
- Power-ups (hull, triple, plasma overcharge, echo, lambda disc, +1 bomb),
  floor pads, hoops, portals, warp with black-and-white ink.
- Warship bosses, Watchdog, OVERSEER rival AI, missions, coins +
  upgrades, daily streak, checkpoints, achievements, ranks, save clip.
- Multiplayer over QR (bundled PeerJS): phone co-op, versus, Daemons.
- Cockpit view.

Parked for later: monetisation (ideas: cosmetics only, optional rewarded
"revive once" ads, supporter pack) and the iPhone / Android / Steam ports.

## How changes are verified
`cd tests && npm install && npm test` runs the headless browser suite
(Playwright, 27 files, about 6 minutes) against a local server; see
`tests/README.md`. `node --check src/<file>.js` catches syntax errors
first.

## Open ideas, not started (see README's last section)
- Procedurally generated/seedable camera path.
- A larger Space-Invaders-style set-piece wave beyond the current small
  `grid` formation enemy.

## Gotchas worth knowing before touching things
- The game is split into plain scripts in `src/` sharing one global
  scope. Code that runs at load time can only use what earlier files (or
  its own file) declared; functions called from events and the loop can
  live anywhere.
- Both the DOM overlay click handlers AND the canvas's own mousedown/
  touchstart listeners can trigger `startGame()` — if you add new state
  transitions, make sure both paths agree on the `continuing` argument,
  or clicking off-center silently drops New-Game-Plus escalation (this
  exact bug happened once already).
- `style.css`, `src/`, `lib/`, `img/` and `audio/` must stay next to
  `index.html` (relative paths) — don't let a repackage step leave them
  behind.
