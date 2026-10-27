// VORTEX - The per-frame simulation: update(dt).
// Plain script, loaded in order by index.html; shares globals with the others.

function update(dt) {
  t += dt;
  for (const v of voxels) {
    v.x += v.vx * dt;
    v.y += v.vy * dt;
    v.vx *= Math.pow(0.35, dt);
    v.vy = v.vy * Math.pow(0.35, dt) + 260 * dt; // gravity: the bits fall away
    v.life -= dt;
  }
  voxels = voxels.filter(v => v.life > 0);
  circuitPulseTimer -= dt;
  if (circuitPulseTimer <= 0) {
    circuitPulses.push({ trace: Math.floor(Math.random() * CIRCUIT_TRACES.length), u: 0, speed: 0.35 + Math.random() * 0.35 });
    circuitPulseTimer = 0.5 - 0.38 * musicSwell;
  }
  for (const cp of circuitPulses) cp.u += cp.speed * dt * (1 + (warpBoost() - 1) * 0.5);
  circuitPulses = circuitPulses.filter(cp => cp.u < 1);
  aimTrail.push({ t, angle: aimAngle });
  while (aimTrail.length && aimTrail[0].t < t - 0.5) aimTrail.shift();
  updateComms(dt);
  tunnelTravel += effectiveTunnelSpeed() * warpBoost() * padSpeed() * dt;
  updateMusicMood(dt);

  // camera bank, from how fast the path is sliding sideways right now
  const velX = (pathX(t + 0.05) - pathX(t - 0.05)) / 0.1;
  const targetRoll = Math.max(-0.5, Math.min(0.5, -velX * 0.0022));
  camRoll += (targetRoll - camRoll) * Math.min(1, dt * 4);

  // tunnel cross-section slowly morphs toward whatever shape the current
  // level/run calls for, rather than snapping
  tunnelSides += (tunnelSidesTarget - tunnelSides) * Math.min(1, dt * 0.6);

  // ship glides along the bottom toward where it's aiming (a damped spring,
  // so it overshoots a touch and settles), and its recoil/wobble decay
  const laneTarget = laneFromAim(aimAngle);
  const laneDiff = normalizeAngle(laneTarget - shipLane);
  const prevX = shipX;
  // a turn-rate limited slide (dodging takes a moment), eased at the end
  const laneSpeed = LANE_SPEED * (lockinTimer > 0 ? 2 : 1);
  teleportHold = Math.max(0, teleportHold - dt);
  const step = teleportHold > 0 ? 0 : Math.sign(laneDiff) * Math.min(Math.abs(laneDiff), laneSpeed * dt, Math.abs(laneDiff) * 12 * dt + 0.002);
  shipLane = normalizeAngle(shipLane + step);
  shipLaneVel = step / Math.max(dt, 1e-4);
  shipX = shipScreenPos(shipLane).x - CX;
  shipVX = (shipX - prevX) / Math.max(dt, 1e-4);
  // plasma recharges after a short quiet spell
  if (plasma < plasmaMax && t - plasmaHitAt > PLASMA_REGEN_DELAY) {
    plasma = Math.min(plasmaMax, plasma + PLASMA_REGEN * dt);
    updatePlasmaUI();
  }
  shipRecoil = Math.max(0, shipRecoil - dt * 7);
  shipHitWobble = Math.max(0, shipHitWobble - dt * 2.5);

  // level banner fades on its own timer regardless of what else is happening
  if (levelBannerTimer > 0) {
    levelBannerTimer -= dt;
    if (levelBannerTimer <= 0) document.getElementById('levelbanner').style.opacity = '0';
  }

  if (state === 'playing') {
    runT += dt;
    // difficulty ramps over time, plus a step up each level
    const diffParams = getDiffParams();
    difficulty = 1 + runT * diffParams.rampRate + (currentLevel - 1) * 0.25;

    const pullFactor = (1 + (effectiveTunnelSpeed() / TUNNEL_SPEED - 1) * 0.4) * padPull();

    if (!bossActive && !calmPhase()) {
      // spawn enemies, starting easy and loosening up gradually
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnEnemy();
        spawnTimer = Math.max(diffParams.spawnMin, diffParams.spawnBase - runT * diffParams.spawnDecay)
          * (missionType === 'survive' ? 0.55 : 1) // survive missions are a denser swarm
          * ENV[env].spawn;                          // open space is a breather
      }

      // clusters of enemies, once the run has eased the player in
      if (currentLevel >= 2) {
        clusterTimer -= dt;
        if (clusterTimer <= 0) {
          spawnCluster();
          clusterTimer = 9 + rng('enemy') * 7;
        }
      }

      // classic grid-formation wave, marching side to side as one block
      formationTimer -= dt;
      if (formationTimer <= 0) {
        spawnFormation();
        formationTimer = 18 + rng('enemy') * 10;
      }
    }

    // power-ups keep spawning through the boss fight too, faster and more
    // often while it's going on since the boss hits hard
    if (!calmPhase()) powerupTimer -= dt;
    if (powerupTimer <= 0) {
      spawnPowerup();
      powerupTimer = (bossActive ? (4.5 + rng('powerup') * 3.5) : (8 + rng('powerup') * 6)) * (env === 'space' ? 0.55 : 1);
    }

    // move enemies toward player (z -> 0), pulled in a little faster as the vortex accelerates
    for (const e of enemies) {
      e.z -= e.speed * pullFactor * dt;
      if (e.targetAngle !== undefined) {
        e.angle = normalizeAngle(e.angle + normalizeAngle(e.targetAngle - e.angle) * Math.min(1, dt * 3));
      }
      if (e.type === 'weaver') {
        e.angle = normalizeAngle(e.baseAngle + Math.sin(t * 2.0 + e.phase) * 0.45);
      }
      if (e.type === 'grid') {
        // shared seed + current time means every member of a formation
        // sways in lockstep, keeping its spacing from the rest of the block
        e.angle = normalizeAngle(e.baseAngle + Math.sin(t * 1.1 + e.formSeed) * 0.5);
      }
      if (e.type === 'shooter' && e.alive) {
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && e.z > 0.12 && e.z < 0.92) {
          enemyBolts.push({ angle: e.angle, z: e.z });
          e.fireTimer = (1.9 + rng('fire') * 1.3) * diffParams.fire;
          playEnemyShot();
        }
      }
    }
    for (const p of powerups) {
      p.z -= 0.055 * pullFactor * dt;
    }
    for (const eb of enemyBolts) {
      eb.z -= 0.4 * pullFactor * dt;
      if (eb.targetAngle !== undefined) eb.angle = normalizeAngle(eb.angle + normalizeAngle(eb.targetAngle - eb.angle) * Math.min(1, dt * 2.2));
    }

    // enemy reaches the rim: it only hurts if it's in the ship's lane,
    // otherwise it streaks past (a dodge)
    for (const e of enemies) {
      if (e.alive && e.z <= 0.03) {
        e.alive = false;
        // big asteroids are wide and hit hard; their chunks are lighter
        const width = e.type === 'rock' && !e.chunk ? LANE_HIT * 1.4 : LANE_HIT;
        const dmg = e.type === 'rock' ? (e.chunk ? 12 : 24) : HULL_DAMAGE_PER_HIT;
        if (inShipLane(e.angle, width)) damageShip(dmg);
        else { missionEvent('dodge'); tutorialEvent('dodge'); }
        if (!inShipLane(e.angle, width) && inShipLane(e.angle, LANE_HIT * 2.2)) {
          shipCallout('DODGED!', '#9fffb0');
          say('dodge', { en: ['CLOSE ONE!', 'WATCH YOUR SIX, HOTSHOT!', 'NICE MOVES!'], es: ['¡POR POCO!', '¡CUIDA TU RETAGUARDIA!', '¡BUENOS REFLEJOS!'] }, 1, 12);
        }
      }
    }
    enemies = enemies.filter(e => e.alive);

    // enemy bolt reaches the ship
    for (const eb of enemyBolts) {
      if (eb.z <= 0.03) {
        eb.z = -1; // mark for removal
        if (inShipLane(eb.angle)) damageShip(10);
      }
    }
    enemyBolts = enemyBolts.filter(eb => eb.z > -0.5 && eb.z < 1.1);

    // power-up drifts into the ship: auto-collect, no penalty for missing one
    for (const p of powerups) {
      if (p.alive && p.z <= 0.04) {
        collectPowerup(p);
      }
    }
    powerups = powerups.filter(p => p.alive);

    // boss: moves in slowly, fires volleys, bounces back on contact instead
    // of ending the fight outright
    if (boss && boss.alive) {
      boss.z -= 0.025 * dt;
      if (boss.form !== 'watchdog') {
        // warships hunt the ship in bursts: hold position (a window to land
        // hits), then swing round to where the ship is now, so their volleys
        // still have to be dodged. Holds shorten each level.
        boss.holdTimer = (boss.holdTimer === undefined ? 2.5 : boss.holdTimer) - dt;
        if (boss.holdTimer <= 0 && boss.moveTo === undefined) boss.moveTo = shipLane;
        if (boss.moveTo !== undefined) {
          const gap = normalizeAngle(boss.moveTo - boss.angle);
          const step = 1.6 * dt;
          boss.angle = normalizeAngle(boss.angle + Math.sign(gap) * Math.min(Math.abs(gap), step));
          if (Math.abs(gap) <= step) {
            boss.moveTo = undefined;
            boss.holdTimer = (boss.kind === 'mini' ? 2.2 : 3.4 - 0.25 * currentLevel) + Math.random();
          }
        }
      }
      if (boss.form === 'watchdog') {
        // sways across the bottom of the tunnel, where the ship flies
        boss.angle = normalizeAngle(Math.PI + Math.sin(t * 0.5 + boss.seed) * 1.3);
        boss.stompTimer -= dt;
        if (boss.stompTimer <= 0) {
          boss.lunge = 0.45;
          boss.stompTimer = 4 + Math.random() * 2;
          triggerShake(7, 0.3);
          playBass(42, 0.45);
        }
        if (boss.lunge > 0) {
          boss.lunge -= dt;
          boss.z -= 0.55 * dt;
        }
      }
      boss.fireTimer -= dt;
      if (boss.fireTimer <= 0 && boss.z < 0.9) {
        for (const off of [-0.38, 0, 0.38]) { // wider than a shot can cancel: move or eat it
          enemyBolts.push({ angle: boss.angle + off, z: boss.z });
        }
        boss.fireTimer = (1.6 + Math.random() * 0.8) * getDiffParams().fire;
        playEnemyShot();
      }
      if (boss.z <= 0.12) {
        boss.z = BOSS_RESET_Z;
        // the boss is wide: it catches anything within a broad lane
        if (inShipLane(boss.angle, 1.0)) damageShip(BOSS_CONTACT_DAMAGE);
      }
    }

    // damage flash fades quickly
    damageFlash = Math.max(0, damageFlash - dt * 3.2);
    document.getElementById('damageflash').style.opacity = (damageFlash * 0.6 * flashScale()).toFixed(2);

    // screen shake decays to nothing over `shakeTimer` seconds
    if (shakeTimer > 0) {
      shakeTimer = Math.max(0, shakeTimer - dt);
      if (shakeTimer <= 0) shakeMag = 0;
    }

    // pickup timers count down to nothing
    if (tripleLaserTimer > 0 || boostTimer > 0 || brakeTimer > 0 || x2Timer > 0) {
      tripleLaserTimer = Math.max(0, tripleLaserTimer - dt);
      updateTripleUI();
    }
    novaFlash = Math.max(0, novaFlash - dt * 1.6);
    updateLockIn(dt);
    commsWatch();

    // echo: remember the ship's path for the ghosts, replay queued shots
    echoTrail.push({ t, x: shipX, lane: shipLane });
    while (echoTrail.length && echoTrail[0].t < t - 1) echoTrail.shift();
    if (echoTimer > 0) {
      echoTimer = Math.max(0, echoTimer - dt);
      updateTripleUI();
    }
    while (echoQueue.length && echoQueue[0].at <= t) {
      bolts.push({ angle: echoQueue.shift().angle, z: 0.04, echo: true });
    }

    if (briefingTimer > 0) {
      briefingTimer -= dt;
      if (briefingTimer <= 0) document.getElementById('briefing').style.opacity = '0';
    }
    if (missionType === 'survive' && !bossActive && !calmPhase() && missionTime < SURVIVE_TIME) {
      const before = Math.floor(missionTime);
      missionTime += dt;
      if (Math.floor(missionTime) !== before) updateObjectiveUI();
      if (SURVIVE_TIME - missionTime < 10) say('surviveEnd', { en: 'TEN SECONDS! HANG ON!', es: '¡DIEZ SEGUNDOS! ¡AGUANTA!' }, 2, 60);
    }
    if (missionType === 'recover') {
      if (!bossActive && !calmPhase() && coresGot < RECOVER_TARGET) {
        coreTimer -= dt;
        if (coreTimer <= 0) {
          cores.push({ angle: normalizeAngle(rng('core') * Math.PI * 2), z: 1, alive: true });
          coreTimer = 2.6 + rng('core') * 2;
        }
      }
      for (const c of cores) {
        c.z -= 0.16 * dt;
        if (c.alive && c.z <= 0.04) {
          c.alive = false;
          coresLost += 1;
          say('coreLost', { en: ['CORE LOST! GRAB THE NEXT ONE!', 'WE MISSED ONE! STAY ON THEM!'], es: ['¡NÚCLEO PERDIDO! ¡VA EL SIGUIENTE!', '¡SE ESCAPÓ UNO! ¡ATENTO!'] }, 1, 8);
        }
      }
      // shoot a core to beam it aboard
      for (const b of bolts) {
        for (const c of cores) {
          if (!c.alive) continue;
          if (Math.abs(normalizeAngle(b.angle - c.angle)) < 0.4 && Math.abs(b.z - c.z) < 0.14) {
            b.z = 2;
            c.alive = false;
            coresGot += 1;
            playPowerUp();
            burst(c.angle, c.z, { color: '80,230,255', bitColor: '#50e6ff', label: 'CORE!', labelColor: '#b8f6ff' });
            updateObjectiveUI();
            if (coresGot < RECOVER_TARGET) say('coreGot', { en: ['CORE SECURED!', 'GOT IT! ' + (RECOVER_TARGET - coresGot) + ' TO GO.'], es: ['¡NÚCLEO ASEGURADO!', '¡LO TENEMOS! FALTAN ' + (RECOVER_TARGET - coresGot) + '.'] }, 1, 4);
          }
        }
      }
      cores = cores.filter(c => c.alive);
    }

    // interceptor: holding the button keeps firing
    const cls = shipClass();
    if (cls.holdFire > 0 && pointerHeld) {
      holdFireTimer -= dt;
      if (holdFireTimer <= 0) {
        fire();
        holdFireTimer = cls.holdFire;
      }
    }

    // warp dive: spikes rush in along the walls; one reaching the near rim
    // in the aim's lane hits the ship
    if (warpTimer > 0) {
      warpTimer -= dt;
      spikeTimer -= dt;
      if (spikeTimer <= 0 && warpTimer > 0.9) {
        spikes.push({ angle: normalizeAngle(Math.random() * Math.PI * 2), z: 1 });
        spikeTimer = 0.16 + Math.random() * 0.14;
      }
      for (const sp of spikes) {
        sp.z -= 0.85 * dt;
        if (sp.z <= 0.04 && sp.z > -1) {
          if (inShipLane(sp.angle, 0.35)) damageShip(SPIKE_DAMAGE);
          sp.z = -2;
        }
      }
      spikes = spikes.filter(sp => sp.z > -1);
      if (warpTimer <= 0) {
        warpTimer = 0;
        finishWarp();
      }
    }

    // move bolts outward
    for (const b of bolts) {
      b.z += shipClass().boltSpeed * dt;
    }
    bolts = bolts.filter(b => b.z < 1.1);

    updateDisc(dt);

    // bolts can shoot spikes down during a warp
    for (const b of bolts) {
      for (const sp of spikes) {
        if (sp.z < 0) continue;
        if (Math.abs(normalizeAngle(b.angle - sp.angle)) < 0.3 && Math.abs(b.z - sp.z) < 0.12) {
          burst(sp.angle, Math.max(0.02, sp.z), { color: '60,255,102', bitColor: '#3f6', label: 'SPIKE!', labelColor: '#9f9' });
          b.z = 2;
          sp.z = -2;
          score += 5;
          document.getElementById('score').textContent = score;
        }
      }
    }
    spikes = spikes.filter(sp => sp.z > -1);

    // bolt-enemy collision (angle proximity + z proximity). Most enemies die
    // in one hit; a pentagram has hp and needs a second to actually go down.
    for (const b of bolts) {
      for (const e of enemies) {
        if (!e.alive) continue;
        let da = Math.abs(normalizeAngle(b.angle - e.angle));
        if (da < (e.scale > 1.5 ? 0.55 : 0.4) && Math.abs(b.z - e.z) < 0.14) {
          if (!b.hidden && !b.echo) { runHits += 1; levelHits += 1; }
          b.z = 2; // remove
          if (e.hp) {
            e.hp -= 1;
            if (e.hp > 0) {
              playBossHit();
              burst(e.angle, e.z, { color: '255,30,60', bitColor: '#ff1e3c', label: 'HIT!', labelColor: '#ff6680' });
              continue;
            }
          }
          e.alive = false;
          score += Math.round((e.type === 'pentagram' ? 30 : 10) * (gameMode === 'rift' ? riftMultiplier() : 1) * missionMult() * (x2Timer > 0 ? 2 : 1));
          killCount += 1;
          killStreak += 1;
          versusKill();
          missionEvent('kill');
          if (e.type === 'rock') missionEvent('rock');
          // a big asteroid breaks into chunks that tumble apart into the
          // neighbouring lanes: shoot them or get out of their way
          if (e.type === 'rock' && !e.chunk && e.z > 0.12) splitAsteroid(e);
          power = Math.min(100, power + POWER_PER_KILL * (1 + 0.15 * up('core')));
          updatePlasmaUI();
          if (killStreak > 0 && killStreak % 10 === 0) {
            shipCallout(killStreak + ' STREAK!', '#3f6');
            say('streak', ['NICE SHOOTING!', 'KEEP IT UP, PILOT!', 'THEY CANNOT TOUCH YOU!', 'OUTSTANDING!'], 2, 0);
          }
          document.getElementById('score').textContent = score;
          updateObjectiveUI();
          playHit();
          triggerShake(e.type === 'pentagram' ? 6 : 3, 0.12);
          burst(e.angle, e.z, e.type === 'pentagram' ? { color: '255,30,60', bitColor: '#ff1e3c', label: 'BANISHED!', labelColor: '#ff6680' } : undefined);
          shatterAt(e.angle, e.z, (ENEMY_COLORS[e.type] || ENEMY_COLORS.drone).rgb, e.type === 'pentagram' ? 26 : 14, 1 - e.z * 0.6);
        }
      }
    }
    enemies = enemies.filter(e => e.alive);

    // bolt-powerup collision: shoot one early to grab it right away
    for (const b of bolts) {
      for (const p of powerups) {
        if (!p.alive) continue;
        let da = Math.abs(normalizeAngle(b.angle - p.angle));
        if (da < 0.4 && Math.abs(b.z - p.z) < 0.14) {
          b.z = 2; // remove
          collectPowerup(p);
        }
      }
    }
    powerups = powerups.filter(p => p.alive);

    // bolt vs enemy bolt: shoot down an incoming shot before it lands
    for (const b of bolts) {
      for (const eb of enemyBolts) {
        if (eb.z < -0.4) continue;
        let da = Math.abs(normalizeAngle(b.angle - eb.angle));
        if (da < 0.25 && Math.abs(b.z - eb.z) < 0.12) {
          b.z = 2;
          eb.z = -1;
        }
      }
    }
    enemyBolts = enemyBolts.filter(eb => eb.z > -0.5 && eb.z < 1.1);

    // bolt-boss collision: takes several hits to bring down. Several bolts
    // can land in the same frame, so stop the moment the boss goes down
    // instead of letting the next bolt check against a now-null boss.
    if (boss && boss.alive) {
      for (const b of bolts) {
        if (!boss) break;
        let da = Math.abs(normalizeAngle(b.angle - boss.angle));
        if (da < 0.5 && Math.abs(b.z - boss.z) < 0.16) {
          if (!b.hidden && !b.echo) { runHits += 1; levelHits += 1; }
          b.z = 2;
          boss.hp -= 1;
          playBossHit();
          triggerShake(10, 0.15);
          burst(boss.angle, boss.z, { color: '255,85,51', bitColor: '#ff5533', label: 'HIT!', labelColor: '#ff8866' });
          updateBossUI();
          if (boss.hp <= 0) {
            const wasMini = boss.kind === 'mini';
            shatterAt(boss.angle, boss.z, '255,85,51', wasMini ? 60 : 140, 2.2);
            triggerShake(wasMini ? 16 : 26, wasMini ? 0.3 : 0.5);
            boss.alive = false;
            bossActive = false;
            boss = null;
            updateBossUI();
            addCoins(wasMini ? 10 : 25);
            if (!wasMini) missionEvent('boss');
            vibrate(wasMini ? 60 : [80, 60, 160]);
            if (!wasMini) {
              setMusicTrack(gameplayTrack());
              if (bossFightDamage === 0) unlockAchievement('untouchable');
              if (gameMode === 'campaign' && levelShots >= 15 && levelHits / levelShots >= 0.7) unlockAchievement('sharpshooter');
            }
            if (wasMini) {
              // a miniboss is a side fight: beating it doesn't advance the
              // level or reset progress, play just resumes.
              showLevelBanner('CLEAR');
              say('miniDown', ['WELL DONE! BACK ON COURSE.', 'TARGET DOWN. NICE WORK!'], 2, 0);
            } else if (gameMode === 'rift') {
              // Rift bosses are gates between sectors, never an ending
              riftDepth += 1;
              enterRiftSector();
              startWarp('DEPTH ' + riftDepth);
            } else if (currentLevel < LEVEL_COUNT) {
              // beating a level's real boss is what actually advances the
              // level; each level's kill count (and miniboss schedule)
              // starts over fresh.
              currentLevel += 1;
              killCount = 0;
              nextMinibossIndex = 0;
              updateObjectiveUI();
              document.getElementById('levelnum').textContent = currentLevel;
              tunnelSidesTarget = computeShapeStage();
              startWarp('LEVEL ' + currentLevel);
            } else {
              winGame();
            }
            break;
          }
        }
      }
    }

    // each level has its own 0..KILL_TARGET kill count. Two non-gating
    // miniboss detours punctuate the way there; the level's real boss only
    // arms once that level's full kill count is reached.
    if (!bossActive && !boss && !calmPhase()) {
      if (nextMinibossIndex < MINIBOSS_THRESHOLDS.length && missionProgress() >= MINIBOSS_THRESHOLDS[nextMinibossIndex]) {
        nextMinibossIndex += 1;
        showLevelBanner('INCOMING');
        say('mini', ['HOSTILE INTERCEPTOR! LIGHT IT UP!', 'SOMETHING BIG ON THE SCOPE! TAKE IT DOWN!', "IF IT MOVES, SHOOT IT. IF IT DOESN'T, SHOOT IT ANYWAY."], 2, 0);
        spawnBoss('mini');
      } else if (gameMode === 'rift' && killCount >= RIFT_SECTOR_KILLS) {
        if (riftDepth % RIFT_BOSS_EVERY === 0) {
          enemies = [];
          showLevelBanner('WARNING');
          say('boss', ['GATE GUARDIAN AHEAD! TAKE COVER AND FIGHT!', 'MASSIVE SIGNAL! BRACE YOURSELF!'], 3, 0);
          spawnBoss('level');
        } else {
          riftDepth += 1;
          enterRiftSector();
        }
      } else if (gameMode === 'campaign' && missionProgress() >= 1) {
        enemies = [];
        cores = [];
        shipCallout('OBJECTIVE COMPLETE', '#3f6');
        if (missionType === 'survive') unlockAchievement('survivor');
        if (missionType === 'recover' && coresLost === 0) unlockAchievement('collector');
        showLevelBanner(currentLevel < LEVEL_COUNT ? 'WARNING' : 'FINAL WARNING');
        say('boss', currentLevel < LEVEL_COUNT
          ? ['BIG SIGNAL INBOUND! TAKE COVER!', 'BOSS ON THE SCOPE! WATCH ITS VOLLEYS!']
          : ['THIS IS IT, PILOT! EVERYTHING YOU HAVE!', 'THE HEART OF THE VORTEX! END THIS!', 'IMPOSSIBLE? NO, PILOT. NECESSARY.'], 3, 0);
        spawnBoss(currentLevel < LEVEL_COUNT ? 'level' : 'final');
      }
    }

    // particles
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // air drag so sparks burst fast then hang, instead of flying off linearly
      const drag = Math.pow(0.08, dt);
      p.vx *= drag;
      p.vy *= drag;
      p.life -= dt;
    }
    particles = particles.filter(p => p.life > 0);
    swellRings = swellRings.filter(br => t - br.startTime < 1 / SWELL_RING_SPEED);

    // flickering bit scatter
    for (const bb of bitBursts) {
      bb.x += bb.vx * dt;
      bb.y += bb.vy * dt;
      bb.vx *= 0.92;
      bb.vy *= 0.92;
      bb.life -= dt;
    }
    bitBursts = bitBursts.filter(bb => bb.life > 0);

    // "HIT!" labels float up and fade
    for (const hl of hitLabels) {
      hl.y += hl.vy * dt;
      hl.vy *= 0.9;
      hl.life -= dt;
    }
    hitLabels = hitLabels.filter(hl => hl.life > 0);

    // pulses fade out after ~0.6s
    pulses = pulses.filter(p => t - p.startTime < 0.6);
  }
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// big asteroid -> 2 or 3 chunks fanning out, a little faster than it was
function splitAsteroid(rock) {
  const offsets = Math.random() < 0.5 ? [-0.38, 0.38] : [-0.45, 0, 0.45];
  for (const off of offsets) {
    enemies.push({
      angle: normalizeAngle(rock.angle + off * 0.3), targetAngle: normalizeAngle(rock.angle + off), z: rock.z,
      shape: 'rock', type: 'rock', chunk: true, scale: 1.35, hp: 1, alive: true,
      baseAngle: rock.angle + off, phase: Math.random() * Math.PI * 2, speed: rock.speed * 1.3
    });
  }
  triggerShake(5, 0.2);
}

function burst(angle, z, opts) {
  const color = (opts && opts.color) || '180,100,255';
  const bitColor = (opts && opts.bitColor) || '#3f6';
  const label = (opts && opts.label) || 'HIT!';
  const labelColor = (opts && opts.labelColor) || '#fff';

  const pt = pointOnRing(angle, z);
  for (let i = 0; i < 14; i++) {
    const ang = Math.random() * Math.PI * 2;
    const speed = 120 + Math.random() * 260;
    particles.push({
      x: pt.x, y: pt.y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      life: 0.4 + Math.random() * 0.3,
      color
    });
  }

  // scatter of flickering 0/1 bits
  for (let i = 0; i < 7; i++) {
    const ang = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 100;
    const life = 0.45 + Math.random() * 0.45;
    bitBursts.push({
      x: pt.x, y: pt.y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      life, maxLife: life,
      char: Math.random() < 0.5 ? '0' : '1',
      color: bitColor
    });
  }

  // callout text
  hitLabels.push({ x: pt.x, y: pt.y, vy: -34, life: 0.55, maxLife: 0.55, text: label, color: labelColor });
}
