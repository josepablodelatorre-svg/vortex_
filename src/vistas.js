// VORTEX - Scenery variety: several looks ("vistas") for each environment.
// Plain script, loaded in order by index.html; shares globals with the others.

// ---------- Vistas ----------
// Each visit to open space, the planet, the trench or the asteroid field
// picks one of several looks, and halfway through a level it crossfades to
// another (rollVista), so long stretches don't repeat. vista holds the
// current pick per environment, vistaPrev the one fading out.
const SPACE_VISTAS = ['blackhole', 'nebula', 'giant', 'binary', 'fleet'];
const SURFACE_VISTAS = [
  { name: 'sunset',  line: '255,120,60',  terrain: 'mountains', sky: 'sun' },
  { name: 'moonlit', line: '225,235,255', terrain: 'mountains', sky: 'moon' },
  { name: 'toxic',   line: '120,255,140', terrain: 'canyon',    sky: 'twinmoons' },
  { name: 'crimson', line: '255,70,110',  terrain: 'dunes',     sky: 'ringed' },
  { name: 'ice',     line: '120,220,255', terrain: 'peaks',     sky: 'aurora' }
];
const TRENCH_VISTAS = [
  { name: 'classic', panel: '140,170,255', light: '#9fd0ff' },
  { name: 'amber',   panel: '255,170,60',  light: '#ffd27a' },
  { name: 'alert',   panel: '255,70,90',   light: '#ff3355', strobe: true },
  { name: 'circuit', panel: '80,255,160',  light: '#7dffc0' }
];
let vista = { space: 0, surface: 0, trench: 0 };
let vistaPrev = null;
let vistaFade = 1; // 0..1: how far the crossfade from vistaPrev has gone

function pickOther(n, current) {
  if (n < 2) return 0;
  const k = Math.floor(Math.random() * (n - 1));
  return k >= current ? k + 1 : k;
}
// quiet: switch straight away (a new level); otherwise crossfade
function rollVista(quiet) {
  vistaPrev = quiet ? null : { ...vista };
  vistaFade = quiet ? 1 : 0;
  vista = {
    space: pickOther(SPACE_VISTAS.length, vista.space),
    surface: pickOther(SURFACE_VISTAS.length, vista.surface),
    trench: pickOther(TRENCH_VISTAS.length, vista.trench)
  };
}
function updateVistas(dt) {
  if (vistaFade < 1) vistaFade = Math.min(1, vistaFade + dt / 2.5);
  if (vistaFade >= 1) vistaPrev = null;
}
// draw a look at the crossfaded strength: fn(index, alpha)
function withVistas(key, alpha, fn) {
  if (vistaPrev && vistaFade < 1) fn(vistaPrev[key], alpha * (1 - vistaFade));
  fn(vista[key], alpha * (vistaPrev ? vistaFade : 1));
}

// ---- open space features (the streaming stars are in drawSpace) ----
function drawSpaceFeature(i, alpha) {
  if (alpha <= 0.01) return;
  const kind = SPACE_VISTAS[i];
  const far = pointOnRing(0, 1);
  const M = Math.min(W, H);
  ctx.save();
  ctx.globalAlpha = alpha;
  if (kind === 'blackhole') {
    // a faint spiral galaxy off to one side, and the black hole ahead
    ctx.save();
    ctx.translate(W * 0.22, H * 0.62);
    ctx.rotate(t * 0.03);
    for (let k = 0; k < 260; k++) {
      const arm = k % 2, f = k / 260;
      const a = arm * Math.PI + f * 9, r = f * M * 0.16;
      ctx.fillStyle = `rgba(${180 + arm * 60},${150 + f * 80},255,${0.5 * (1 - f)})`;
      ctx.fillRect(Math.cos(a) * r, Math.sin(a) * r * 0.45, 2, 2);
    }
    ctx.restore();
    drawBlackHole(far, M * 0.05);
  } else if (kind === 'nebula') {
    // big soft clouds of glowing gas, slowly breathing
    const blobs = [[0.18, 0.3, 0.32, '255,60,200'], [0.78, 0.22, 0.28, '60,220,255'], [0.6, 0.62, 0.36, '150,80,255'], [0.3, 0.7, 0.24, '255,140,60'], [0.5, 0.4, 0.2, '255,255,255']];
    ctx.globalCompositeOperation = 'lighter';
    blobs.forEach(([x, y, r, rgb], k) => {
      const R = r * M * (1 + 0.06 * Math.sin(t * 0.4 + k));
      const g = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, R);
      g.addColorStop(0, `rgba(${rgb},0.22)`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x * W - R, y * H - R, R * 2, R * 2);
    });
    for (let k = 0; k < 40; k++) {
      const a = hash2(k, 3) * Math.PI * 2, d = hash2(k, 9) * M * 0.12;
      ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.6 * hash2(k, 5)})`;
      ctx.fillRect(W * 0.62 + Math.cos(a) * d, H * 0.35 + Math.sin(a) * d, 2, 2);
    }
  } else if (kind === 'giant') {
    // a banded gas giant filling one corner, with rings and two moons
    const px = W * 0.86, py = H * 0.3, pr = M * 0.34;
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.clip();
    const g = ctx.createLinearGradient(px - pr, py - pr, px + pr, py + pr);
    g.addColorStop(0, '#5a2a7a'); g.addColorStop(0.5, '#c8608a'); g.addColorStop(1, '#2a1240');
    ctx.fillStyle = g;
    ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    for (let b = -6; b <= 6; b++) {
      ctx.fillStyle = `rgba(255,200,230,${0.05 + 0.05 * (b % 2 === 0)})`;
      ctx.fillRect(px - pr, py + b * pr * 0.14 + Math.sin(t * 0.2 + b) * 3, pr * 2, pr * 0.07);
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,220,240,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(px, py, pr * 1.6, pr * 0.32, -0.35, 0, Math.PI * 2);
    ctx.stroke();
    for (const [mx, my, mr] of [[0.6, 0.12, 0.025], [0.7, 0.55, 0.018]]) {
      ctx.fillStyle = '#cfc8e8';
      ctx.beginPath();
      ctx.arc(mx * W, my * H, mr * M, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'binary') {
    // two suns: a hot blue-white and an orange, with a dust lane between
    for (const [x, y, r, inner, outer] of [[0.22, 0.2, 0.07, '#ffffff', '80,170,255'], [0.36, 0.3, 0.045, '#ffe0a0', '255,140,40']]) {
      const g = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, r * M * 4);
      g.addColorStop(0, inner);
      g.addColorStop(0.25, `rgba(${outer},0.6)`);
      g.addColorStop(1, `rgba(${outer},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x * W, y * H, r * M * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,200,160,0.12)';
    ctx.lineWidth = M * 0.04;
    ctx.beginPath();
    ctx.moveTo(-20, H * 0.75);
    ctx.quadraticCurveTo(W * 0.5, H * 0.45, W + 20, H * 0.62);
    ctx.stroke();
  } else if (kind === 'fleet') {
    // a distant battle fleet: wireframe capital ships drifting across
    ctx.strokeStyle = 'rgba(150,200,255,0.55)';
    ctx.lineWidth = 1.2;
    for (let k = 0; k < 4; k++) {
      const s = M * (0.05 + 0.025 * k);
      const x = ((k * 0.27 + t * (0.004 + k * 0.002)) % 1.3 - 0.15) * W, y = H * (0.18 + 0.13 * k);
      ctx.beginPath();
      ctx.moveTo(x - s * 2, y); ctx.lineTo(x + s * 1.6, y - s * 0.35); ctx.lineTo(x + s * 2.2, y);
      ctx.lineTo(x + s * 1.6, y + s * 0.3); ctx.closePath();
      ctx.moveTo(x - s * 0.4, y - s * 0.2); ctx.lineTo(x - s * 0.1, y - s * 0.6); ctx.lineTo(x + s * 0.5, y - s * 0.6); ctx.lineTo(x + s * 0.6, y - s * 0.25);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,200,120,0.8)';
      ctx.fillRect(x - s * 2.1, y - 1, 3, 3); // engine glow
    }
    drawBlackHole(far, M * 0.025);
  }
  ctx.restore();
}

function drawBlackHole(far, R) {
  ctx.save();
  ctx.translate(far.x, far.y);
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    ctx.ellipse(0, 0, R * (3.2 - k * 0.45), R * (0.62 - k * 0.08), -0.25, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,${140 + k * 25},60,${0.35 + k * 0.12})`;
    ctx.lineWidth = 2 + k;
    ctx.shadowColor = '#ff9a3c';
    ctx.shadowBlur = 18;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, R * 1.12, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,240,210,0.9)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(far.x, far.y, R, 0, Math.PI * 2);
  ctx.fill();
}

// ---- planet skies ----
function drawSky(look, horizon) {
  const M = Math.min(W, H);
  const disc = (x, y, r, inner, outer, glow) => {
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 50;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  };
  const sx = CX + W * 0.22, sy = horizon - H * 0.2;
  if (look.sky === 'sun') disc(sx, sy, M * 0.12, '#ffd36b', 'rgba(255,140,30,0.9)', '#ff9a2c');
  else if (look.sky === 'moon') disc(sx, sy, M * 0.1, '#ffffff', 'rgba(170,190,220,0.85)', '#cfe2ff');
  else if (look.sky === 'twinmoons') {
    disc(CX - W * 0.25, horizon - H * 0.28, M * 0.06, '#eaffd8', 'rgba(140,220,120,0.8)', '#9fff9a');
    disc(CX + W * 0.18, horizon - H * 0.16, M * 0.035, '#ffffff', 'rgba(180,255,200,0.8)', '#c8ffd0');
  } else if (look.sky === 'ringed') {
    disc(CX + W * 0.2, horizon - H * 0.22, M * 0.13, '#ffb0c8', 'rgba(160,40,90,0.9)', '#ff6090');
    ctx.strokeStyle = 'rgba(255,200,220,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(CX + W * 0.2, horizon - H * 0.22, M * 0.24, M * 0.05, -0.2, 0, Math.PI * 2);
    ctx.stroke();
  } else if (look.sky === 'aurora') {
    // curtains of light rippling across the sky
    ctx.globalCompositeOperation = 'lighter';
    for (let band = 0; band < 3; band++) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 12) {
        const y = horizon * (0.25 + band * 0.12) + Math.sin(x * 0.008 + t * 0.6 + band) * H * 0.05;
        x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = band % 2 ? 'rgba(120,255,200,0.22)' : 'rgba(150,120,255,0.22)';
      ctx.lineWidth = H * 0.06;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    disc(CX - W * 0.2, horizon - H * 0.3, M * 0.04, '#ffffff', 'rgba(190,230,255,0.85)', '#d8f0ff');
  }
}

// terrain height at a column (u: -1.7..1.7 across) and row, per terrain style
function terrainHeight(style, u, row) {
  const side = Math.abs(u);
  if (style === 'canyon') {
    // sheer walls close in on a narrow floor
    const wall = Math.min(1, Math.max(0, (side - 0.18) / 0.35));
    return wall * (0.8 + 0.5 * noise2(u * 3, row * 0.3)) * 1.25;
  }
  if (style === 'dunes') {
    // low rolling sand everywhere, a little higher at the sides
    return (0.25 + 0.35 * Math.min(1, side)) * (0.5 + 0.5 * Math.sin(u * 3 + row * 0.5 + noise2(u, row * 0.2) * 3));
  }
  const mount = Math.min(1, Math.max(0, (side - 0.3) / 1.0));
  if (style === 'peaks') {
    // ridged, jagged ice peaks
    const n = 1 - Math.abs(noise2(u * 2.6, row * 0.4) * 2 - 1);
    return n * n * mount * 1.3;
  }
  const h = noise2(u * 2.2, row * 0.35);
  return h * mount * mount;
}

// ---- the trench: wall panels, pipes and running lights ----
function drawTrenchDetails(alpha) {
  if (alpha <= 0.01) return;
  withVistas('trench', alpha, (i, a) => {
    if (a <= 0.01) return;
    const look = TRENCH_VISTAS[i];
    ctx.save();
    ctx.globalAlpha = a;
    ctx.lineWidth = 1;
    for (let k = 0; k < 14; k++) {
      const z = 1 - ((tunnelTravel * 2.2 + k * 0.0714) % 1);
      if (z < 0.02) continue;
      const seed = Math.floor(tunnelTravel * 2.2 + k * 0.0714) * 14 + k;
      // a panel on each wall and the floor, varied per row
      for (const [side, half] of [[Math.PI / 2, 0.22], [-Math.PI / 2, 0.22], [Math.PI, 0.28]]) {
        const off = (hash2(seed, side * 3) - 0.5) * 0.3;
        const quad = wallPatch(side + off, half * (0.4 + 0.6 * hash2(seed, side)), z, 0.04);
        ctx.strokeStyle = `rgba(${look.panel},${0.25 + 0.45 * (1 - z)})`;
        ctx.beginPath();
        quad.forEach((pt, n) => n ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
        ctx.closePath();
        ctx.stroke();
      }
      // a running light on the wall tops
      const lit = look.strobe ? Math.sin(t * 14 + k) > 0.3 : (seed % 3 === 0);
      if (lit) {
        for (const side of [Math.PI * 0.32, -Math.PI * 0.32]) {
          const p = pointOnRing(side, z);
          ctx.fillStyle = look.light;
          ctx.shadowColor = look.light;
          ctx.shadowBlur = 8;
          const s = 2 + 4 * (1 - z);
          ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
        }
        ctx.shadowBlur = 0;
      }
    }
    // pipes running along both walls
    for (const side of [Math.PI * 0.62, -Math.PI * 0.62]) {
      ctx.strokeStyle = `rgba(${look.panel},0.35)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let z = 0.02; z <= 1; z += 0.07) {
        const p = pointOnRing(side, z);
        z === 0.02 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  });
}

// ---- the asteroid field: big boulders drifting far off ----
const FAR_ROCKS = Array.from({ length: 9 }, (_, k) => ({ a: (k / 9) * Math.PI * 2 + Math.random(), d: 0.55 + Math.random() * 0.45, s: 0.6 + Math.random() * 0.8, seed: Math.random() * 50 }));
function drawRockField(alpha) {
  if (alpha <= 0.01) return;
  const M = Math.min(W, H);
  ctx.save();
  ctx.globalAlpha = alpha * 0.7;
  for (const r of FAR_ROCKS) {
    r.d += 0.01 * 0.016 * padSpeed();
    if (r.d > 1.15) { r.d = 0.5; r.a = Math.random() * Math.PI * 2; }
    const x = CX + Math.cos(r.a + t * 0.01) * r.d * W * 0.55, y = CY + Math.sin(r.a + t * 0.01) * r.d * H * 0.55;
    const size = r.s * M * 0.08 * r.d;
    ctx.beginPath();
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + t * 0.05 * r.s;
      const rr = size * (0.75 + 0.4 * hash2(r.seed, i));
      i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(30,20,14,0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,150,100,0.45)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();
}
