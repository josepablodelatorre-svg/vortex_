// VORTEX service worker: lets the installed game open and play offline.
// The game's own files are kept in a cache and served network-first, so a
// new version is picked up whenever there's a connection and the cached one
// is used when there isn't. The soundtrack (large, streamed with range
// requests) is cached once fully downloaded; until then offline play is
// silent music-wise. Multiplayer always needs the network.
const CACHE = 'vortex-v2';
const SHELL = [
  './', 'index.html', 'pad.html', 'privacy.html', 'style.css', 'manifest.webmanifest',
  'img/nemo-logo.png', 'img/icons/icon-192.png', 'img/icons/icon-512.png', 'fonts/press-start-2p.woff2',
  'lib/peerjs.min.js', 'lib/qrcode.js',
  'src/save.js', 'src/i18n.js', 'src/audio.js', 'src/progression.js', 'src/world.js', 'src/environments.js', 'src/turrets.js',
  'src/input.js', 'src/meta.js', 'src/flow.js', 'src/pilot.js', 'src/update.js',
  'src/draw.js', 'src/multiplayer.js', 'src/screens.js', 'src/online.js', 'src/gamepad.js', 'src/main.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // music: whole files from the cache when we have them; range requests
  // (streaming) go to the network, and a full copy is fetched in the
  // background the first time so the next offline session has it
  if (url.pathname.includes('/audio/')) {
    e.respondWith(caches.match(url.pathname, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      if (!req.headers.get('range')) return fetch(req);
      fetch(url.pathname).then(res => { if (res.ok) caches.open(CACHE).then(c => c.put(url.pathname, res)); }).catch(() => {});
      return fetch(req);
    }));
    return;
  }
  e.respondWith(fetch(req).then(res => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('index.html'))));
});
