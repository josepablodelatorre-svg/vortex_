// VORTEX - Gun turrets fixed to the trench walls and the planet's ground.
// Plain script, loaded in order by index.html; shares globals with the others.

// ---------- Turrets ----------
// Unlike enemies, turrets don't fly at you: they're bolted to the scenery
// and scroll past with it. In the trench they sit on the walls and floor;
// on the planet they're domes on the ground. Each fires a tracer that bends
// toward the lane the ship was in when it fired (so you dodge by moving),
// with a muzzle flash first. Two hits destroy one.
let turrets = [];       // { angle, z, hp, fireTimer, flash, kind: 'wall' | 'ground' }
let turretTimer = 3;

function turretEnv() {
  return env === 'trench' ? 'wall' : env === 'surface' ? 'ground' : null;
}

function spawnTurret(kind) {
  // trench: on either wall or the floor; planet: along the ground ahead
  const angle = kind === 'wall'
    ? normalizeAngle([Math.PI / 2, -Math.PI / 2, Math.PI * 0.75, -Math.PI * 0.75][Math.floor(Math.random() * 4)] + (Math.random() - 0.5) * 0.2)
    : normalizeAngle(Math.PI + (Math.random() - 0.5) * Math.PI * 0.9);
  turrets.push({ angle, z: 1, hp: 2, fireTimer: 0.8 + Math.random() * 1.2, flash: 0, kind });
}

function updateTurrets(dt) {
  if (state !== 'playing') return;
  const kind = turretEnv();
  if (kind && !calmPhase() && !bossActive) {
    turretTimer -= dt;
    if (turretTimer <= 0) {
      spawnTurret(kind);
      turretTimer = (kind === 'wall' ? 2.2 : 3.2) + Math.random() * 2;
    }
  }
  const speed = effectiveTunnelSpeed() * warpBoost() * padSpeed();
  const fireMul = getDiffParams().fire;
  for (const tu of turrets) {
    tu.z -= speed * dt;
    tu.flash = Math.max(0, tu.flash - dt * 4);
    if (tu.hp <= 0 || tu.z < 0.18 || tu.z > 0.9) continue;
    tu.fireTimer -= dt;
    if (tu.fireTimer <= 0) {
      // a tracer that swings over to where the ship is right now
      enemyBolts.push({ angle: tu.angle, z: tu.z, targetAngle: shipLane, tracer: true });
      tu.flash = 1;
      tu.fireTimer = (1.5 + Math.random() * 1.1) * fireMul;
      playEnemyShot();
    }
  }
  // the player's shots knock them out
  for (const b of bolts) {
    for (const tu of turrets) {
      if (tu.hp <= 0) continue;
      if (Math.abs(normalizeAngle(b.angle - tu.angle)) < 0.35 && Math.abs(b.z - tu.z) < 0.12) {
        b.z = 2;
        tu.hp -= 1;
        playHit();
        if (tu.hp > 0) { burst(tu.angle, tu.z, { color: '255,140,40', bitColor: '#ff8c28', label: 'HIT!', labelColor: '#ffc080' }); continue; }
        score += Math.round(20 * missionMult() * (x2Timer > 0 ? 2 : 1));
        document.getElementById('score').textContent = score;
        killCount += 1;
        missionEvent('kill');
        updateObjectiveUI();
        triggerShake(5, 0.2);
        shatterAt(tu.angle, tu.z, '255,140,40', 30, 1 - tu.z * 0.6);
        burst(tu.angle, tu.z, { color: '255,140,40', bitColor: '#ff8c28', label: 'TURRET DOWN', labelColor: '#ffc080' });
      }
    }
  }
  turrets = turrets.filter(tu => tu.z > -0.05 && tu.hp > 0);
}

function drawTurrets() {
  if (!turrets.length) return;
  ctx.save();
  for (const tu of turrets) {
    if (tu.z < 0 || tu.z > 1) continue;
    const near = 1 - tu.z;
    const base = pointOnRing(tu.angle, tu.z);
    // the barrel points off the wall toward the tunnel's middle
    const inward = { x: CX - base.x, y: CY - base.y };
    const len = Math.hypot(inward.x, inward.y) || 1;
    const ux = inward.x / len, uy = inward.y / len;
    const s = 5 + 22 * near;
    ctx.lineWidth = 1.5 + 2 * near;
    ctx.strokeStyle = '#ff8c28';
    ctx.shadowColor = '#ff8c28';
    ctx.shadowBlur = 10 + 20 * tu.flash;
    ctx.fillStyle = 'rgba(40, 14, 4, 0.85)';
    ctx.beginPath();
    if (tu.kind === 'wall') {
      // a boxy emplacement set into the trench wall
      const quad = wallPatch(tu.angle, 0.15, tu.z, 0.07);
      quad.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
      ctx.closePath();
    } else {
      // a dome on the ground
      ctx.arc(base.x + ux * s * 0.2, base.y + uy * s * 0.2, s * 0.7, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
    // barrel
    const bx = base.x + ux * s * 0.4, by = base.y + uy * s * 0.4;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + ux * s * 1.1, by + uy * s * 1.1);
    ctx.lineWidth = 2 + 3 * near;
    ctx.stroke();
    // warning light, and a muzzle flash when it fires
    ctx.fillStyle = Math.sin(t * 10 + tu.angle * 5) > 0 ? '#ff3355' : '#551122';
    ctx.fillRect(base.x - 2, base.y - 2, 4, 4);
    if (tu.flash > 0) {
      ctx.globalAlpha = tu.flash;
      ctx.fillStyle = '#fff2c0';
      ctx.beginPath();
      ctx.arc(bx + ux * s * 1.2, by + uy * s * 1.2, s * 0.5 * tu.flash + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}
