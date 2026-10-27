// VORTEX - Co-op, versus and Daemons over PeerJS.
// Plain script, loaded in order by index.html; shares globals with the others.

// ---------- Co-op link (multiplayer stage 1) ----------
// The host screen opens a PeerJS peer and shows a QR code for
// pad.html?host=<its id>. Each phone that connects becomes an extra gunner
// on this screen: it sends aim / fire / zap, and gets state back. The game
// runs entirely here; phones only send input. Team play: shared hull,
// score, zapper and power-ups (except the disc and echo, which stay with
// the main ship).
const COOP_COLORS = ['#3f6', '#ff8c28', '#22ddff'];
const COOP_MAX = 3;
let netPeer = null;
let netId = '';
let coPlayers = []; // { conn, slot, name, color, aim, x, vx, lastFireMsg, fireCd }
let netStateTimer = 0;

// ?peerhost=host:port: use a self-hosted PeerJS server (local testing).
// Otherwise PeerJS's free public server introduces the devices, with a few
// public STUN servers so phones on mobile networks can find a route.
function peerOptions() {
  const m = /[?&]peerhost=([^&]+)/.exec(location.search);
  if (!m) return { debug: 0, config: { iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ] } };
  const [host, port] = decodeURIComponent(m[1]).split(':');
  return { host, port: parseInt(port, 10) || 9000, path: '/', secure: false, debug: 0, config: { iceServers: [] } };
}

// The free link server can drop or stall. Errors of these kinds are worth
// another try (with growing gaps); anything else (a game that's gone, a
// browser without WebRTC) is reported straight away.
const NET_RETRYABLE = ['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected'];
const NET_RETRY_DELAYS = [1500, 3000, 6000, 12000];
let netRetry = 0;
function netRetryDelay(err) {
  if (!NET_RETRYABLE.includes(err.type) || netRetry >= NET_RETRY_DELAYS.length) return 0;
  return NET_RETRY_DELAYS[netRetry++];
}
// a host whose link-server connection drops keeps its open links, but needs
// its id back so new players can still find it: reconnect, same id/QR code
function keepPeerReachable(peer, status) {
  peer.on('disconnected', () => {
    let n = 0;
    const retry = () => {
      if (peer.destroyed || !peer.disconnected) return;
      status('RECONNECTING TO THE LINK SERVER...');
      try { peer.reconnect(); } catch (e) { /* ignore */ }
      if (++n < NET_RETRY_DELAYS.length) setTimeout(retry, NET_RETRY_DELAYS[n]);
    };
    setTimeout(retry, NET_RETRY_DELAYS[0]);
  });
  peer.on('open', () => { netRetry = 0; status(''); });
}

function padUrl() {
  const url = new URL('pad.html', location.href);
  url.search = '';
  url.searchParams.set('host', netId);
  const ph = /[?&]peerhost=([^&]+)/.exec(location.search);
  if (ph) url.searchParams.set('peerhost', decodeURIComponent(ph[1]));
  return url.toString();
}

function openLobby() {
  document.getElementById('lobby').style.display = 'block';
  const titles = {
    coop: ['CO-OP LINK', 'SCAN WITH A PHONE TO JOIN AS AN EXTRA GUNNER (UP TO 3)'],
    versus: ['VERSUS LINK', 'SCAN WITH ANOTHER DEVICE TO CHALLENGE IT. EACH SCREEN FLIES ITS OWN TUNNEL - LAST ONE FLYING WINS'],
    join: ['VERSUS CHALLENGE', 'SOMEONE CHALLENGED YOU! TYPE YOUR NAME ON THE TITLE SCREEN OR JUST ACCEPT'],
    cycles: ['DAEMONS', 'RACE AS A DAEMON ON THE BUS. START NOW AGAINST SYSTEM DAEMONS, OR SCAN WITH ANOTHER DEVICE TO RACE A FRIEND'],
    cyjoin: ['DAEMONS', 'YOU WERE INVITED ONTO THE BUS. JOIN, THEN WAIT FOR THE HOST TO START THE ROUND']
  };
  document.querySelector('#lobby h2').textContent = titles[lobbyKind][0];
  document.querySelector('#lobby p').textContent = titles[lobbyKind][1];
  const joining = lobbyKind === 'join' || lobbyKind === 'cyjoin';
  document.getElementById('qrbox').style.display = joining ? 'none' : 'inline-block';
  document.getElementById('lobbyAccept').style.display = joining ? 'block' : 'none';
  document.getElementById('lobbyAccept').textContent = lobbyKind === 'cyjoin' ? 'JOIN THE BUS' : 'ACCEPT CHALLENGE';
  document.getElementById('lobbyStart').style.display = lobbyKind === 'cycles' ? 'block' : 'none';
  renderLobby();
  if (joining) return;
  if (netPeer || typeof Peer === 'undefined') {
    if (typeof Peer === 'undefined') document.getElementById('qrbox').textContent = 'LINK UNAVAILABLE';
    return;
  }
  const code = Math.random().toString(36).slice(2, 7);
  netPeer = new Peer('vortex-' + code, peerOptions());
  netPeer.on('open', (id) => {
    netId = id;
    renderLobby();
  });
  netPeer.on('connection', onPadConnection);
  keepPeerReachable(netPeer, (msg) => { if (msg) document.getElementById('lobbylink').textContent = msg; else renderLobby(); });
  netPeer.on('error', (err) => {
    if (err.type === 'unavailable-id') { netPeer.destroy(); netPeer = null; openLobby(); return; }
    const wait = netRetryDelay(err);
    if (wait && !netId) {
      // never got a link at all: start over with a fresh one
      document.getElementById('lobbylink').textContent = 'LINK SERVER BUSY, RETRYING (' + netRetry + '/' + NET_RETRY_DELAYS.length + ')...';
      netPeer.destroy();
      netPeer = null;
      setTimeout(() => { if (document.getElementById('lobby').style.display !== 'none') openLobby(); }, wait);
      return;
    }
    if (wait) return; // a dropped link server: keepPeerReachable is on it
    document.getElementById('qrbox').textContent = 'LINK ERROR';
    document.getElementById('lobbylink').textContent = 'COULD NOT REACH THE LINK SERVER (' + err.type + ')';
  });
}

function renderLobby() {
  const box = document.getElementById('qrbox');
  if (lobbyKind === 'join' || lobbyKind === 'cyjoin') {
    document.getElementById('lobbylink').textContent = '';
    if (vsName) document.getElementById('lobbyplayers').textContent = 'LINKED WITH ' + vsName + '. GET READY...';
    return;
  }
  const link = lobbyKind === 'versus' ? versusUrl() : lobbyKind === 'cycles' ? cyclesUrl() : padUrl();
  if (netId && typeof qrcode !== 'undefined') {
    const qr = qrcode(0, 'M');
    qr.addData(link);
    qr.make();
    box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0 });
    box.style.lineHeight = '0';
    document.getElementById('lobbylink').textContent = link;
  }
  if (lobbyKind === 'versus') {
    document.getElementById('lobbyplayers').textContent = vsName ? vsName + ' ACCEPTED! STARTING...' : 'WAITING FOR A CHALLENGER...';
    return;
  }
  if (lobbyKind === 'cycles') {
    document.getElementById('lobbyplayers').textContent = cyConn ? cyGuestName + ' IS ON THE BUS' : 'NO FRIEND YET - SYSTEM DAEMONS WILL RACE';
    return;
  }
  document.getElementById('lobbyplayers').innerHTML = coPlayers.length
    ? coPlayers.map(cp => `<span style="color:${cp.color}">P${cp.slot + 2} ${cp.name}</span>`).join('<br>')
    : 'NO GUNNERS YET';
}

function onPadConnection(conn) {
  conn.on('data', (msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'vs-hello') { hostVersus(conn, msg); return; }
    if (msg.t === 'cy-hello') { hostCycles(conn, msg); return; }
    if (conn === vsConn || conn === cyConn) return; // handled by their own listeners
    let cp = coPlayers.find(c => c.conn === conn);
    if (msg.t === 'hello' && !cp) {
      const used = coPlayers.map(c => c.slot);
      const slot = [0, 1, 2].find(i => !used.includes(i));
      if (slot === undefined || coPlayers.length >= COOP_MAX) { conn.send({ t: 'full' }); return; }
      const name = String(msg.name || 'GUNNER').toUpperCase().replace(/[^A-Z0-9 ÑÜ_-]/g, '').slice(0, 10) || 'GUNNER';
      cp = { conn, slot, name, color: COOP_COLORS[slot], aim: 0, x: 0, vx: 0, lastFireMsg: -9, fireCd: 0, lastSeen: t };
      coPlayers.push(cp);
      conn.send({ t: 'welcome', slot, color: cp.color, name });
      showToast('P' + (slot + 2) + ' ' + name + ' JACKED IN');
      say('coopJoin', { en: name + ' IS ON THE GUNS. WELCOME, ' + name + '!', es: name + ' ESTA EN LOS CAÑONES. ¡BIENVENIDO, ' + name + '!' }, 2, 0);
      renderLobby();
      return;
    }
    if (!cp) return;
    cp.lastSeen = t;
    if (msg.t === 'bye') { conn.close(); dropCoPlayer(cp); return; }
    if (msg.t === 'aim' && typeof msg.a === 'number') cp.aim = normalizeAngle(msg.a);
    else if (msg.t === 'fire') cp.lastFireMsg = t;
    else if (msg.t === 'zap') superzap();
  });
  conn.on('close', () => {
    const cp = coPlayers.find(c => c.conn === conn);
    if (cp) dropCoPlayer(cp);
  });
}

function dropCoPlayer(cp) {
  if (!coPlayers.includes(cp)) return;
  coPlayers = coPlayers.filter(c => c !== cp);
  showToast('P' + (cp.slot + 2) + ' ' + cp.name + ' DISCONNECTED');
  renderLobby();
}

function netBroadcast(msg) {
  for (const cp of coPlayers) { if (cp.conn.open) cp.conn.send(msg); }
}

// per frame: co-gunners slide to their aim and fire while their pad is held
function updateCoPlayers(dt) {
  if (!coPlayers.length) return;
  // pads ping every second; a silent one (closed tab, lost signal) drops out
  for (const cp of coPlayers.slice()) { if (t - cp.lastSeen > 6) dropCoPlayer(cp); }
  netStateTimer -= dt;
  if (netStateTimer <= 0) {
    netStateTimer = 0.25;
    netBroadcast({ t: 'state', hull: Math.max(0, hull / hullMax), score, st: state, zap: zapperCharges });
  }
  if (state !== 'playing') return;
  for (const cp of coPlayers) {
    const target = Math.sin(cp.aim) * Math.min(W * 0.3, H * 0.45);
    cp.vx += ((target - cp.x) * 38 - cp.vx * 9) * dt;
    cp.x += cp.vx * dt;
    cp.fireCd -= dt;
    if (t - cp.lastFireMsg < 0.3 && cp.fireCd <= 0) {
      cp.fireCd = 0.16;
      const angles = tripleLaserTimer > 0 ? [-0.16, 0, 0.16].map(off => normalizeAngle(cp.aim + off)) : [cp.aim];
      for (const angle of angles) bolts.push({ angle, z: 0.04, owner: cp.slot });
      pulses.push({ startTime: t, angle: cp.aim });
      playZap();
    }
  }
}

function drawCoPlayers() {
  if (!coPlayers.length || state !== 'playing') return;
  const base = Math.min(W, H) * 0.095;
  for (const cp of coPlayers) {
    // their firing line + bullseye, in their colour
    ctx.fillStyle = hexToRgba(cp.color, 0.8);
    for (let z = 0.06; z < 0.5; z += 0.05) {
      const pt = pointOnRing(cp.aim, z);
      const d = 4 - z * 4;
      ctx.fillRect(pt.x - d / 2, pt.y - d / 2, d, d);
    }
    const bp = pointOnRing(cp.aim, 0.45);
    drawBullseye(bp.x, bp.y, 12, false, cp.color);
    // their ship: an interceptor flying in formation above the main ship
    const sx = CX + cp.x;
    const sy = H - Math.min(W, H) * 0.11 - base * (1.25 + cp.slot * 0.55);
    drawShip({ ghost: true, classIndex: 1, x: sx, y: sy, s: base * 0.6, lean: Math.max(-0.35, Math.min(0.35, cp.vx * 0.0011)),
               palette: { main: cp.color, glow: cp.color } });
    ctx.save();
    ctx.font = "8px 'Press Start 2P', 'Courier New', monospace";
    ctx.textAlign = 'center';
    ctx.fillStyle = cp.color;
    ctx.fillText('P' + (cp.slot + 2) + ' ' + cp.name, sx, sy - base * 0.75);
    ctx.restore();
  }
}

// ---------- Versus (multiplayer stage 2) ----------
// Two devices, each running its own tunnel. The challenger's screen shows a
// QR code for index.html?versus=<id>; the other device opens it, accepts,
// and both start the same seeded Rift-style endless run together. Every
// VS_KILLS_PER_ATTACK kills sends a magenta intruder into the opponent's
// tunnel; each side sees the other's hull and score live. Whoever
// survives longer wins; then either side can call a rematch.
const VS_KILLS_PER_ATTACK = 3;
let versus = false;        // this run is a versus match
let vsConn = null;
let vsName = '';
let vsKills = 0;
let vsIncoming = 0;        // intruders still to spawn
let vsIncomingTimer = 0;
let vsLastSeen = 0;
let vsStatusTimer = 0;
let vsSeed = 0;
let vsReady = { me: false, them: false };
let vsCountdown = 0;
let lobbyKind = 'coop';    // what the open lobby is for: 'coop' | 'versus' | 'join'
const vsJoinId = (/[?&]versus=([^&]+)/.exec(location.search) || [])[1];

function versusUrl() {
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('versus', netId);
  const ph = /[?&]peerhost=([^&]+)/.exec(location.search);
  if (ph) url.searchParams.set('peerhost', decodeURIComponent(ph[1]));
  return url.toString();
}

function vsSend(msg) {
  if (vsConn && vsConn.open) vsConn.send(msg);
}

// wire up a versus connection (either side) once it's open
function attachVersus(conn) {
  vsConn = conn;
  vsLastSeen = t;
  conn.on('data', (msg) => {
    if (!msg || typeof msg !== 'object' || conn !== vsConn) return;
    vsLastSeen = t;
    if (msg.t === 'vs-welcome') {
      vsName = msg.name;
      vsSeed = msg.seed;
      renderLobby();
    } else if (msg.t === 'vs-go') {
      vsSeed = msg.seed;
      beginVersusCountdown();
    } else if (msg.t === 'vs-status') {
      updateVsPanel(msg);
    } else if (msg.t === 'vs-attack') {
      vsIncoming += msg.n;
      say('vsAttack', { en: 'INCOMING FROM ' + vsName + '! INTRUDERS IN THE TUNNEL!', es: '¡ATAQUE DE ' + vsName + '! ¡INTRUSOS EN EL TUNEL!' }, 2, 6);
    } else if (msg.t === 'vs-dead') {
      if (state === 'playing' && versus) versusWin(msg.score);
    } else if (msg.t === 'vs-rematch') {
      vsReady.them = true;
      document.getElementById(state === 'cleared' ? 'wonhint' : 'losthint').textContent =
        vsReady.me ? 'STARTING...' : vsName + ' WANTS A REMATCH - CLICK!';
      maybeRematch();
    }
  });
  conn.on('close', () => { if (conn === vsConn) versusOpponentGone(); });
}

// take the name typed on the title screen (also used without jacking in)
function readPilotName() {
  const typed = document.getElementById('pilotname').value.trim().toUpperCase().replace(/[^A-Z0-9 ÑÜ_-]/g, '').slice(0, 10);
  if (typed) {
    pilotName = typed;
    try { store.setItem('vortex-pilot', pilotName); } catch (e) { /* ignore */ }
  }
  return playerName();
}

function openVersusLobby() {
  readPilotName();
  lobbyKind = 'versus';
  openLobby();
}

// a guest who opened a ?versus= link: accept, then connect to the challenger
function acceptVersus(e) {
  if (e) netRetry = 0; // a fresh tap, not a retry
  const name = readPilotName();
  initAudio();
  document.getElementById('lobbyAccept').style.display = 'none';
  document.getElementById('lobbyplayers').textContent = 'CONNECTING...';
  const peer = new Peer(peerOptions());
  netPeer = peer;
  peer.on('open', () => {
    const conn = peer.connect(vsJoinId, { reliable: true });
    conn.on('open', () => {
      attachVersus(conn);
      conn.send({ t: 'vs-hello', name });
    });
  });
  peer.on('error', (err) => {
    const wait = netRetryDelay(err);
    if (wait && !vsConn) {
      document.getElementById('lobbyplayers').textContent = 'LINK SERVER BUSY, RETRYING (' + netRetry + '/' + NET_RETRY_DELAYS.length + ')...';
      peer.destroy();
      setTimeout(() => acceptVersus(), wait);
      return;
    }
    document.getElementById('lobbyplayers').textContent = err.type === 'peer-unavailable'
      ? 'CHALLENGE NOT FOUND - IS THE OTHER SCREEN STILL OPEN?' : 'CONNECTION FAILED (' + err.type + ')';
  });
}

// the challenger's side of a new versus connection
function hostVersus(conn, msg) {
  if (vsConn && vsConn.open) { conn.send({ t: 'vs-busy' }); return; }
  vsName = String(msg.name || 'RIVAL').toUpperCase().replace(/[^A-Z0-9 ÑÜ_-]/g, '').slice(0, 10) || 'RIVAL';
  attachVersus(conn);
  vsSeed = (Math.random() * 4294967296) >>> 0;
  conn.send({ t: 'vs-welcome', name: playerName(), seed: vsSeed });
  showToast(vsName + ' ACCEPTED YOUR CHALLENGE');
  renderLobby();
  // give both screens a moment, then start together
  setTimeout(() => {
    vsSend({ t: 'vs-go', seed: vsSeed });
    beginVersusCountdown();
  }, 1200);
}

function beginVersusCountdown() {
  document.getElementById('lobby').style.display = 'none';
  vsReady = { me: false, them: false };
  vsCountdown = 3.5;
  document.getElementById('title').style.display = 'none';
  document.getElementById('gameover').style.display = 'none';
  document.getElementById('cleared').style.display = 'none';
  state = 'countdown';
}

function updateVersus(dt) {
  if (state === 'countdown') {
    const before = Math.ceil(vsCountdown);
    vsCountdown -= dt;
    if (Math.ceil(vsCountdown) !== before && vsCountdown > 0) {
      showLevelBanner(String(Math.ceil(vsCountdown)) + ' - VS ' + vsName);
      playBass(90, 0.15);
    }
    if (vsCountdown <= 0) {
      state = 'title';
      startGame(false, 'versus');
    }
    return;
  }
  if (!vsConn) return;
  // silence for 6s (closed tab, lost signal) counts as leaving
  if (t - vsLastSeen > 6 && vsConn.open) { vsSend({ t: 'vs-ping' }); }
  if (t - vsLastSeen > 8) { versusOpponentGone(); return; }
  vsStatusTimer -= dt;
  if (vsStatusTimer <= 0) {
    vsStatusTimer = 0.25;
    vsSend({ t: 'vs-status', hull: Math.max(0, hull / hullMax), score, depth: riftDepth, st: state });
  }
  if (state === 'playing' && versus && vsIncoming > 0) {
    vsIncomingTimer -= dt;
    if (vsIncomingTimer <= 0) {
      vsIncoming -= 1;
      vsIncomingTimer = 0.45;
      const angle = normalizeAngle(Math.random() * Math.PI * 2);
      enemies.push({ angle, z: 1, shape: 'ring', type: 'intruder', alive: true, baseAngle: angle, phase: 0,
                     speed: getDiffParams().speedBase * 1.6 });
    }
  }
}

function updateVsPanel(msg) {
  document.getElementById('vsname').textContent = 'VS ' + vsName;
  document.getElementById('vsscore').textContent = msg.score;
  document.getElementById('vshullfill').style.width = Math.max(0, msg.hull * 100) + '%';
}

// called on every kill during a versus run
function versusKill() {
  if (!versus) return;
  vsKills += 1;
  if (vsKills % VS_KILLS_PER_ATTACK === 0) {
    vsSend({ t: 'vs-attack', n: 1 });
    shipCallout('ATTACK SENT!', '#ff8c28');
  }
}

function versusWin(theirScore) {
  versus = true;
  state = 'cleared';
  updateZapUI();
  document.getElementById('briefing').style.opacity = '0';
  document.getElementById('wontitle').textContent = 'VICTORY';
  document.getElementById('clearedscore').textContent = 'YOU ' + score + '  -  ' + vsName + ' ' + (theirScore || 0);
  document.getElementById('wonhint').textContent = 'CLICK FOR A REMATCH';
  document.getElementById('riftFromCleared').style.display = 'none';
  showRank('rankWon', true);
  document.getElementById('cleared').style.display = 'block';
  setMusicTrack('garden');
}

function versusOpponentGone() {
  const wasPlaying = state === 'playing' && versus;
  vsConn = null;
  document.getElementById('vspanel').style.display = 'none';
  showToast((vsName || 'OPPONENT') + ' DISCONNECTED');
  if (wasPlaying) versusWin(0);
  versus = false;
}

function requestRematch() {
  if (!vsConn || !vsConn.open) { versus = false; return false; }
  vsReady.me = true;
  vsSend({ t: 'vs-rematch' });
  document.getElementById(state === 'cleared' ? 'wonhint' : 'losthint').textContent =
    vsReady.them ? 'STARTING...' : 'WAITING FOR ' + vsName + '...';
  maybeRematch();
  return true;
}

function maybeRematch() {
  if (!vsReady.me || !vsReady.them) return;
  // the challenger picks the new seed
  if (!vsJoinId) {
    vsSeed = (Math.random() * 4294967296) >>> 0;
    vsSend({ t: 'vs-go', seed: vsSeed });
    beginVersusCountdown();
  }
}

// ---------- Daemons (multiplayer stage 3) ----------
// The visible stretch of tunnel becomes the bus: a racing grid wrapped round the
// inside of the tube: CY_N cells around by CY_M cells deep. Riders move one
// cell per CY_TICK, turn 90° left or right (in the rider's own frame) and
// leave a solid light wall; hitting any wall, or the rim or far edge,
// shatters you. Last rider alive wins the round. Up to 4 riders: you, a
// friend on another device, and AI riders filling the empty slots.
// Networked games are host-authoritative: the host simulates every tick and
// broadcasts positions; the guest only sends its turns.
const CY_N = 96, CY_M = 40;
const CY_Z0 = 0.05, CY_Z1 = 0.88;
const CY_TICK = 1 / 15;
const CY_COLORS = ['#22ddff', '#ff8c28', '#3f6', '#ff3cdc'];
// the AI riders are named after the system daemons they'd be on a real box
const DAEMON_NAMES = ['INIT', 'CRON', 'SYSLOGD', 'SSHD'];
const CY_DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // +around, deeper, -around, toward the rim
let cyRiders = [];   // { name, color, i, j, dir, alive, trail: [[i, j]...], ai, turn, fadeAt }
let cyGrid = new Int8Array(CY_N * CY_M);
let cyTickTimer = 0;
let cyMe = 0;        // which rider this screen controls
let cyHosting = true;
let cyConn = null;   // host: the guest's connection / guest: the host's
let cyGuestName = '';
let cyRoundOver = false;
let cyEndTimer = 0;
const cyJoinId = (/[?&]cycles=([^&]+)/.exec(location.search) || [])[1];

function cyCell(i, j) {
  return cyGrid[j * CY_N + ((i % CY_N) + CY_N) % CY_N];
}
function cyPoint(i, j) {
  return pointOnRing(((i + 0.5) / CY_N) * Math.PI * 2, CY_Z0 + ((j + 0.5) / CY_M) * (CY_Z1 - CY_Z0), { visual: false });
}

function cyclesUrl() {
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('cycles', netId);
  const ph = /[?&]peerhost=([^&]+)/.exec(location.search);
  if (ph) url.searchParams.set('peerhost', decodeURIComponent(ph[1]));
  return url.toString();
}

function cySend(msg) {
  if (cyConn && cyConn.open) cyConn.send(msg);
}

// host: lay out a fresh round (2 starting at the rim heading deeper, the
// others from the far edge heading out, spread around the ring)
function cyNewRound() {
  cyGrid = new Int8Array(CY_N * CY_M);
  const names = [readPilotName(), cyConn ? cyGuestName : null];
  cyRiders = [];
  for (let k = 0; k < 4; k++) {
    const human = k === 0 || (k === 1 && cyConn);
    const i = Math.floor((k * CY_N) / 4 + CY_N / 8);
    const j = k % 2 === 0 ? 2 : CY_M - 3;
    cyRiders.push({ name: human ? names[k] : DAEMON_NAMES[k], color: CY_COLORS[k], i, j, dir: k % 2 === 0 ? 1 : 3,
                    alive: true, trail: [[i, j]], ai: !human, turn: 0, fadeAt: 0 });
    cyGrid[j * CY_N + i] = k + 1;
  }
  cyMe = 0;
  cyStartLocal();
  cySend({ t: 'cy-start', you: 1, riders: cyRiders.map(r => ({ name: r.name, color: r.color, i: r.i, j: r.j, dir: r.dir })) });
}

function cyStartLocal() {
  env = 'tube';
  Object.assign(envK, ENV.tube);
  cyRoundOver = false;
  cyEndTimer = 0;
  cyTickTimer = 0.9; // a beat before the riders launch
  voxels = [];
  state = 'cycles';
  for (const id of ['title', 'gameover', 'cleared', 'lobby', 'hud']) document.getElementById(id).style.display = 'none';
  showLevelBanner(cyRiders[cyMe].name + ' - ' + (lang === 'es' ? 'GIRA CON IZQ / DER' : 'TURN WITH LEFT / RIGHT'));
  setMusicTrack('boss');
}

// START ROUND in the lobby: any friend who joined rides as rider 2
function startCycles() {
  initAudio();
  cyHosting = true;
  cyNewRound();
}

// simple AI: keep going if the next few cells are clear, else turn toward
// the side with more open space; now and then turn just to be unpredictable
function cyAiTurn(r) {
  const clear = (dir, steps) => {
    let i = r.i, j = r.j;
    for (let k = 0; k < steps; k++) {
      i += CY_DIRS[dir][0]; j += CY_DIRS[dir][1];
      if (j < 0 || j >= CY_M || cyCell(i, j)) return k;
    }
    return steps;
  };
  const left = (r.dir + 3) % 4, right = (r.dir + 1) % 4;
  const ahead = clear(r.dir, 4);
  if (ahead >= 4 && Math.random() > 0.03) return 0;
  const l = clear(left, 12), rr = clear(right, 12);
  if (ahead >= 4 && l < 3 && rr < 3) return 0;
  if (l === rr) return Math.random() < 0.5 ? -1 : 1;
  return l > rr ? -1 : 1;
}

function cyCrash(r, k) {
  r.alive = false;
  r.fadeAt = t + 1.2; // its wall clears a moment later, freeing the space
  const pt = cyPoint(r.i, r.j);
  shatter(pt.x, pt.y, hexToRgb(r.color), 70, 1.6);
  triggerShake(k === cyMe ? 14 : 6, 0.3);
  playDamage();
}

// host: one simulation step for every rider
function cyStep() {
  const moves = [];
  cyRiders.forEach((r, k) => {
    if (!r.alive) return;
    if (r.ai) r.turn = cyAiTurn(r);
    if (r.turn) { r.dir = (r.dir + (r.turn > 0 ? 1 : 3)) % 4; r.turn = 0; }
    const ni = ((r.i + CY_DIRS[r.dir][0]) % CY_N + CY_N) % CY_N;
    const nj = r.j + CY_DIRS[r.dir][1];
    moves.push({ k, ni, nj });
  });
  for (const m of moves) {
    const r = cyRiders[m.k];
    const head = moves.filter(o => o.ni === m.ni && o.nj === m.nj).length > 1; // two riders, one cell
    if (m.nj < 0 || m.nj >= CY_M || cyCell(m.ni, m.nj) || head) { m.crash = true; }
  }
  for (const m of moves) {
    const r = cyRiders[m.k];
    if (m.crash) { cyCrash(r, m.k); continue; }
    r.i = m.ni; r.j = m.nj;
    r.trail.push([r.i, r.j]);
    cyGrid[r.j * CY_N + r.i] = m.k + 1;
  }
  cySend({ t: 'cy-tick', r: cyRiders.map(r => [r.i, r.j, r.dir, r.alive ? 1 : 0]) });
}

// remove a crashed rider's wall from the grid
function cyClearTrail(k) {
  const r = cyRiders[k];
  for (const [i, j] of r.trail) { if (cyGrid[j * CY_N + i] === k + 1) cyGrid[j * CY_N + i] = 0; }
  r.trail = [];
}

function updateCycles(dt) {
  if (state !== 'cycles' && state !== 'cyclesover') return;
  cyRiders.forEach((r, k) => { if (!r.alive && r.fadeAt && t > r.fadeAt) { r.fadeAt = 0; cyClearTrail(k); } });
  if (state === 'cyclesover') return;
  if (!cyHosting) return; // the guest just renders what the host sends
  cyTickTimer -= dt;
  while (cyTickTimer <= 0 && !cyRoundOver) {
    cyTickTimer += CY_TICK;
    cyStep();
    const alive = cyRiders.filter(r => r.alive);
    if (alive.length <= 1) {
      cyRoundOver = true;
      cyEndRound(alive.length ? cyRiders.indexOf(alive[0]) : -1);
      cySend({ t: 'cy-end', w: alive.length ? cyRiders.indexOf(alive[0]) : -1 });
    }
  }
}

function cyEndRound(w) {
  state = 'cyclesover';
  const winner = w >= 0 ? cyRiders[w] : null;
  const text = !winner ? 'NO SURVIVORS' : w === cyMe ? (lang === 'es' ? '¡GANASTE!' : 'YOU WIN!') : winner.name + (lang === 'es' ? ' GANA' : ' WINS');
  showLevelBanner(text);
  levelBannerTimer = 999;
  showToast(lang === 'es' ? 'CLIC: OTRA RONDA   ESC: MENU' : 'CLICK: NEXT ROUND   ESC: MENU');
  if (winner && w === cyMe) playPowerUp();
  setMusicTrack('garden');
}

function cyNextRound() {
  if (cyHosting) cyNewRound();
  else cySend({ t: 'cy-again' });
}

function cyQuit() {
  state = 'title';
  document.getElementById('levelbanner').style.opacity = '0';
  levelBannerTimer = 0;
  document.getElementById('title').style.display = '';
  document.getElementById('hud').style.display = '';
  showScreen('menu');
  setMusicTrack('garden');
}

// input: returns true when it handled the event
function cyTurn(d) {
  if (state === 'cyclesover') { cyNextRound(); return true; }
  if (state !== 'cycles') return false;
  const me = cyRiders[cyMe];
  if (!me || !me.alive) return true;
  if (cyHosting) me.turn = d;
  else cySend({ t: 'cy-turn', d });
  playZap();
  return true;
}

function drawCycles() {
  if (state !== 'cycles' && state !== 'cyclesover') return;
  // the arena edges: the rim and the far wall
  ctx.save();
  ctx.lineWidth = 2;
  for (const z of [CY_Z0, CY_Z1]) {
    ctx.beginPath();
    for (let s = 0; s <= 72; s++) {
      const pt = pointOnRing((s / 72) * Math.PI * 2, z, { visual: false });
      if (s === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
    }
    ctx.strokeStyle = 'rgba(80,230,255,0.6)';
    ctx.shadowColor = '#50e6ff';
    ctx.shadowBlur = 12;
    ctx.stroke();
  }
  // the grid itself, faint
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(80,230,255,0.12)';
  for (let i = 0; i < CY_N; i += 4) {
    const a = cyPoint(i - 0.5, -0.5), b = cyPoint(i - 0.5, CY_M - 0.5);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  for (let j = 0; j <= CY_M; j += 4) {
    ctx.beginPath();
    for (let i = 0; i <= CY_N; i += 2) {
      const pt = cyPoint(i - 0.5, j - 0.5);
      if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();
  }
  // light walls + riders
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  cyRiders.forEach((r, k) => {
    if (!r.trail.length) return;
    const fading = !r.alive;
    ctx.strokeStyle = fading ? hexToRgba(r.color, 0.35 + 0.3 * Math.sin(t * 30)) : r.color;
    ctx.shadowColor = r.color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    let prev = null;
    for (const [i, j] of r.trail) {
      const pt = cyPoint(i, j);
      // don't draw a line across the seam where the ring wraps round
      if (!prev || Math.abs(i - prev[0]) > 1) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
      prev = [i, j];
    }
    ctx.lineWidth = 3;
    ctx.stroke();
    if (r.alive) {
      const pt = cyPoint(r.i, r.j);
      const sz = 5 + 10 * (1 - r.j / CY_M);
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, sz * 0.6, 0, Math.PI * 2);
      ctx.fill();
      if (k === cyMe) {
        ctx.strokeStyle = '#ffe14d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, sz * 1.6 + Math.sin(t * 8) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  });
  ctx.restore();
  // roster
  ctx.save();
  ctx.font = "9px 'Press Start 2P', 'Courier New', monospace";
  ctx.textAlign = 'left';
  cyRiders.forEach((r, k) => {
    ctx.fillStyle = r.alive ? r.color : 'rgba(255,255,255,0.3)';
    ctx.fillText((k === cyMe ? '> ' : '  ') + r.name + (r.alive ? '' : '  SEGFAULT'), 20, 30 + k * 18);
  });
  ctx.restore();
}

// network: host side
function hostCycles(conn, msg) {
  if (cyConn && cyConn.open) { conn.send({ t: 'cy-busy' }); return; }
  cyConn = conn;
  cyHosting = true;
  cyGuestName = String(msg.name || 'USER').toUpperCase().replace(/[^A-Z0-9 ÑÜ_-]/g, '').slice(0, 10) || 'USER';
  showToast(cyGuestName + ' JOINED THE BUS');
  renderLobby();
  conn.on('data', (m) => {
    if (!m || conn !== cyConn) return;
    if (m.t === 'cy-turn' && cyRiders[1] && cyRiders[1].alive && !cyRiders[1].ai) cyRiders[1].turn = m.d > 0 ? 1 : -1;
    else if (m.t === 'cy-again' && state === 'cyclesover') cyNewRound();
  });
  conn.on('close', () => { if (conn === cyConn) { cyConn = null; showToast(cyGuestName + ' LEFT THE BUS'); if (cyRiders[1]) cyRiders[1].ai = true; } });
}

// network: guest side
function joinCycles(e) {
  if (e) netRetry = 0; // a fresh tap, not a retry
  const name = readPilotName();
  initAudio();
  document.getElementById('lobbyAccept').style.display = 'none';
  document.getElementById('lobbyplayers').textContent = 'CONNECTING...';
  const peer = new Peer(peerOptions());
  netPeer = peer;
  cyHosting = false;
  peer.on('open', () => {
    const conn = peer.connect(cyJoinId, { reliable: true });
    conn.on('open', () => {
      cyConn = conn;
      conn.send({ t: 'cy-hello', name });
      document.getElementById('lobbyplayers').textContent = 'ON THE BUS. WAITING FOR THE HOST TO START...';
    });
    conn.on('data', (m) => {
      if (!m) return;
      if (m.t === 'cy-start') {
        cyGrid = new Int8Array(CY_N * CY_M);
        cyRiders = m.riders.map((r, k) => ({ ...r, alive: true, trail: [[r.i, r.j]], ai: false, turn: 0, fadeAt: 0 }));
        cyRiders.forEach((r, k) => { cyGrid[r.j * CY_N + r.i] = k + 1; });
        cyMe = m.you;
        cyStartLocal();
      } else if (m.t === 'cy-tick') {
        m.r.forEach(([i, j, dir, alive], k) => {
          const r = cyRiders[k];
          if (!r) return;
          if (r.alive && !alive) { cyCrash(r, k); return; }
          if (!r.alive) return;
          if (i !== r.i || j !== r.j) { r.trail.push([i, j]); cyGrid[j * CY_N + i] = k + 1; }
          r.i = i; r.j = j; r.dir = dir;
        });
      } else if (m.t === 'cy-end') {
        cyEndRound(m.w);
      }
    });
    conn.on('close', () => { showToast('HOST LEFT THE BUS'); cyQuit(); });
  });
  peer.on('error', (err) => {
    const wait = netRetryDelay(err);
    if (wait && !cyConn) {
      document.getElementById('lobbyplayers').textContent = 'LINK SERVER BUSY, RETRYING (' + netRetry + '/' + NET_RETRY_DELAYS.length + ')...';
      peer.destroy();
      setTimeout(() => joinCycles(), wait);
      return;
    }
    document.getElementById('lobbyplayers').textContent = err.type === 'peer-unavailable'
      ? 'BUS NOT FOUND - IS THE OTHER SCREEN STILL OPEN?' : 'CONNECTION FAILED (' + err.type + ')';
  });
}
