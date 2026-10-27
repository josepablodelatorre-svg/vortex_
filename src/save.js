// VORTEX - The one versioned save entry (store) and the flickering title.
// Plain script, loaded in order by index.html; shares globals with the others.

// ---------- Save data ----------
// Everything VORTEX remembers lives in ONE versioned localStorage entry,
// 'vortex-save' = { v, data }, where data is keyed by the item names older
// builds used as separate keys ('vortex-coins', 'vortex-checkpoint', ...).
// On load, any of those old separate keys are folded in once and removed.
// store.getItem / setItem / removeItem mirror localStorage's API (string
// values), so the rest of the code reads like before.
const SAVE_KEY = 'vortex-save';
const SAVE_VERSION = 1;
const store = (() => {
  let save = { v: SAVE_VERSION, data: {} };
  // future format changes go here, one step per version
  function migrate(sv) {
    if (!sv.v || sv.v < 1) sv.v = 1;
    return sv;
  }
  function write() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* storage full or blocked: play on */ }
  }
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.data === 'object' && parsed.data) save = parsed;
    }
    const legacy = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('vortex-') && k !== SAVE_KEY) legacy.push(k);
    }
    for (const k of legacy) {
      save.data[k] = localStorage.getItem(k); // a fresh old-style write wins
      localStorage.removeItem(k);
    }
    const before = save.v;
    migrate(save);
    if (legacy.length || save.v !== before) write();
  } catch (e) { /* storage unavailable: everything stays in memory */ }
  // another tab saved: pick up its data so this tab doesn't write it back over
  window.addEventListener('storage', (e) => {
    if (e.key !== SAVE_KEY || !e.newValue) return;
    try { save = migrate(JSON.parse(e.newValue)); } catch (err) { /* ignore */ }
  });
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(save.data, k) ? save.data[k] : null; },
    setItem(k, v) { save.data[k] = String(v); write(); },
    removeItem(k) { delete save.data[k]; write(); },
    version() { return save.v; },
    dump() { return JSON.stringify(save); }
  };
})();

// Build the title out of individually flickering characters, bookended by
// blinking terminal-style underscores, like an old CRT losing sync.
(function buildFlickerTitle() {
  const h1 = document.querySelector('#title h1');
  const text = h1.textContent.trim();
  h1.innerHTML = '';
  const makeSpan = (ch, extraClass) => {
    const span = document.createElement('span');
    span.className = 'flicker-char' + (extraClass ? ' ' + extraClass : '');
    span.textContent = ch;
    span.style.animationDuration = (1.6 + Math.random() * 2.2).toFixed(2) + 's';
    span.style.animationDelay = (Math.random() * 2).toFixed(2) + 's';
    return span;
  };
  h1.appendChild(makeSpan('_', 'underscore'));
  for (const ch of text) h1.appendChild(makeSpan(ch));
  h1.appendChild(makeSpan('_', 'underscore'));
})();

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let W, H, CX, CY;

function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  CX = W / 2;
  CY = H / 2;
}
window.addEventListener('resize', resize);
resize();
