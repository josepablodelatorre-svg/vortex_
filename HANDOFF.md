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
- Power-ups (hull, triple, shield, overdrive, echo, lambda disc, nova),
  floor pads, hoops, portals, warp with black-and-white ink.
- Warship bosses, Watchdog, OVERSEER rival AI, missions, coins +
  upgrades, daily streak, checkpoints, achievements, ranks, save clip.
- Multiplayer over QR (bundled PeerJS): phone co-op, versus, Daemons.
- Cockpit view.

Parked for later: monetisation (ideas: cosmetics only, optional rewarded
"revive once" ads, supporter pack) and the iPhone / Android / Steam ports.

## How changes were verified in this session (recommend continuing this)
No test suite — instead:
1. Extract the `<script>` tag's contents to a standalone `.js` file.
2. `new Function(code)` in Node to catch syntax errors before ever
   opening the file in a browser.
3. For logic changes, stub `document`/`window`/`Audio`/`AudioContext`/
   `requestAnimationFrame`/`localStorage`/timers in a Node `vm` context
   (important: use `vm.createContext` + `vm.runInContext`, NOT a bare
   `eval` — top-level `let`/`const` declared inside a direct `eval()` do
   not leak out to later calls, but they DO persist across multiple
   `vm.runInContext` calls against the same context, which is what makes
   it possible to drive the game state step by step and assert on it).
   This caught the original boss-null-dereference bug and would catch
   similar races again.

## Open ideas, not started (see README's last section)
- Procedurally generated/seedable camera path.
- A larger Space-Invaders-style set-piece wave beyond the current small
  `grid` formation enemy.

## Gotchas worth knowing before touching things
- The embedded base64 NEMO logo makes `index.html` large enough that
  Claude's own `Read` tool can choke on it ("exceeds maximum allowed
  tokens") even with offset/limit. Use `sed -n 'X,Yp' index.html` via
  shell instead for viewing, and extract the `<script>` body to a
  separate file (see above) rather than reading the whole HTML file.
- Both the DOM overlay click handlers AND the canvas's own mousedown/
  touchstart listeners can trigger `startGame()` — if you add new state
  transitions, make sure both paths agree on the `continuing` argument,
  or clicking off-center silently drops New-Game-Plus escalation (this
  exact bug happened once already).
- `audio/garden.m4a` and `audio/destruction.m4a` must stay next to
  `index.html` (relative path) — don't let a repackage step leave them
  behind.
