
/* Laser gun (3) + frag grenades (G). Rides on the game's own systems via window.__G. */
(function () {
  'use strict';
  function boot() {
    var G = window.__G;
    if (!G || !G.player || !G.weapon || G.weapon.stub || !G.camera || !G.scene || !G.THREE || !G.input || !G.physics || !document.querySelector('.h-ammo')) { setTimeout(boot, 250); return; }
    try { init(G); } catch (e) { console.error('[addon] laser/grenade init failed', e); }
  }
  function init(G) {
    var T = G.THREE, cam = G.camera, P = G.player, W = G.weapon, I = G.input;
    var V3 = function (x, y, z) { return new T.Vector3(x || 0, y || 0, z || 0); };
    var VM_LAYER = 1, VM_FOV = 54;

    /* ---------------- laser viewmodel ---------------- */
    var metal = new T.MeshStandardMaterial({ color: 0x1a1e23, roughness: .38, metalness: .75, emissive: 0x06080a });
    var dark = new T.MeshStandardMaterial({ color: 0x15181b, roughness: .7, metalness: .2, emissive: 0x050607 });
    var glow = new T.MeshBasicMaterial({ color: 0x5cf0ff, toneMapped: false });
    var cellMat = new T.MeshBasicMaterial({ color: 0x40e8ff, toneMapped: false, transparent: true, opacity: .75 });
    var gun = new T.Group(); gun.name = 'laser-gun';
    function part(geo, mat, x, y, z, rx) { var m = new T.Mesh(geo, mat); m.position.set(x, y, z); if (rx) m.rotation.x = rx; gun.add(m); return m; }
    part(new T.BoxGeometry(.075, .095, .34), metal, 0, 0, 0);
    part(new T.BoxGeometry(.03, .02, .26), dark, 0, .057, -.02);
    part(new T.BoxGeometry(.065, .075, .09), dark, 0, -.005, .2);
    part(new T.CylinderGeometry(.03, .034, .22, 16), metal, 0, .01, -.27, Math.PI / 2);
    part(new T.CylinderGeometry(.017, .017, .05, 12), glow, 0, .01, -.395, Math.PI / 2);
    var coils = [];
    for (var c = 0; c < 3; c++) coils.push(part(new T.TorusGeometry(.037, .006, 8, 24), glow, 0, .01, -.2 - c * .06));
    part(new T.BoxGeometry(.004, .012, .22), glow, .039, .012, -.03);
    part(new T.BoxGeometry(.004, .012, .22), glow, -.039, .012, -.03);
    var cell = part(new T.BoxGeometry(.05, .06, .1), cellMat, 0, -.076, .03);
    part(new T.BoxGeometry(.046, .115, .056), dark, 0, -.095, .13, -.28);
    part(new T.TorusGeometry(.013, .0025, 6, 20), glow, 0, .086, .03);
    part(new T.BoxGeometry(.004, .02, .004), dark, 0, .07, .03);
    gun.traverse(function (o) { o.layers.set(VM_LAYER); o.frustumCulled = false; o.renderOrder = 10; });
    gun.visible = false; cam.add(gun);
    gun.scale.setScalar(.72);
    var HIP = V3(.15, -.16, -.5), ADS = V3(0, -.064, -.36), LOW = V3(.12, -.27, -.44);
    var MUZZLE = V3(0, .01, -.42);

    /* ---------------- beam ---------------- */
    var beamGeo = new T.CylinderGeometry(1, .2, 1, 10, 1, true); beamGeo.translate(0, .5, 0); beamGeo.rotateX(Math.PI / 2); // along +Z, 0..1
    function beamMat(col, op) { return new T.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }); }
    var beam = new T.Group(), core = new T.Mesh(beamGeo, beamMat(0xe8ffff, 1)), halo = new T.Mesh(beamGeo, beamMat(0x30d8ff, .32));
    core.scale.set(.012, .012, 1); halo.scale.set(.05, .05, 1); beam.add(halo, core);
    beam.traverse(function (o) { o.frustumCulled = false; }); beam.visible = false; G.scene.add(beam);
    var hitGlow = new T.Mesh(new T.SphereGeometry(1, 12, 8), beamMat(0x7ff3ff, .7)); hitGlow.visible = false; hitGlow.frustumCulled = false; G.scene.add(hitGlow);

    /* ---------------- state ---------------- */
    var laserOn = false, wantWeaponVisible = true, firing = false, fireAcc = 0, fxAcc = 0, t = 0, kick = 0, raise = 0;
    var pose = HIP.clone(), sway = V3(), lastYaw = P.yaw, lastPitch = P.pitch, nadeCd = 0;
    var origSetVisible = W.setVisible.bind(W);
    W.setVisible = function (v) { wantWeaponVisible = !!v; origSetVisible(laserOn ? false : v); };

    /* ---------------- HUD ---------------- */
    var ammoEl = document.querySelector('.h-ammo');
    var lp = document.createElement('div'); lp.className = 'h-ammo x-laser';
    lp.innerHTML = '<div class="h-cue">Overcharge</div><div class="h-ammo-row"><b class="h-ammo-n">∞</b></div><div class="x-heat"><i><b></b></i></div><div class="h-wname">LZ-9 Arc Laser</div><div class="h-alt"><kbd>1</kbd><b>Rifle</b></div>';
    ammoEl.parentNode.appendChild(lp);
    var heatBar = lp.querySelector('.x-heat b'), cue = lp.querySelector('.h-cue');
    var nadeEl = document.createElement('div'); nadeEl.className = 'x-nade';
    nadeEl.innerHTML = '<svg viewBox="0 0 14 16"><rect x="4" y="0" width="6" height="3" fill="currentColor"/><circle cx="7" cy="9.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg><kbd>G</kbd> Frag ∞';
    ammoEl.parentNode.appendChild(nadeEl);

    function setLaser(on) {
      if (on === laserOn) return;
      laserOn = on; raise = 0;
      origSetVisible(on ? false : wantWeaponVisible);
      ammoEl.classList.toggle('x-hide', on); lp.classList.toggle('on', on);
      if (on) { snd('weapon_draw', .8); pose.copy(LOW); } else { stopHum(); beam.visible = hitGlow.visible = false; firing = false; }
    }

    /* ---------------- sound ---------------- */
    var A = G.audio && G.audio.ctx ? G.audio : null, hum = null;
    function snd(name, gain, pos, pitch) { try { A && A.play && A.play(name, { gain: gain, pos: pos, pitch: pitch || 1, jitter: .05 }); } catch (e) {} }
    function startHum() {
      if (!A || hum) return;
      try {
        var ctx = A.ctx, out = ctx.createGain(); out.gain.value = 0; out.connect(ctx.destination);
        var lpF = ctx.createBiquadFilter(); lpF.type = 'lowpass'; lpF.frequency.value = 1800; lpF.Q.value = 6; lpF.connect(out);
        var o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 160;
        var o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 323;
        var lfo = ctx.createOscillator(); lfo.frequency.value = 22; var lg = ctx.createGain(); lg.gain.value = 700; lfo.connect(lg); lg.connect(lpF.frequency);
        var g2 = ctx.createGain(); g2.gain.value = .35; o1.connect(lpF); o2.connect(g2); g2.connect(lpF);
        o1.start(); o2.start(); lfo.start();
        out.gain.setTargetAtTime(.075, ctx.currentTime, .02);
        o1.frequency.setValueAtTime(420, ctx.currentTime); o1.frequency.exponentialRampToValueAtTime(160, ctx.currentTime + .12);
        hum = { out: out, nodes: [o1, o2, lfo], ctx: ctx };
      } catch (e) { hum = null; }
    }
    function stopHum() {
      if (!hum) return; var h = hum; hum = null;
      try { h.out.gain.setTargetAtTime(0, h.ctx.currentTime, .04); setTimeout(function () { h.nodes.forEach(function (n) { try { n.stop(); } catch (e) {} }); h.out.disconnect(); }, 300); } catch (e) {}
    }

    /* ---------------- grenades ---------------- */
    var nades = [], NADE = { speed: 17, up: 3.5, fuse: 2.1, radius: 7.5, damage: 165, cooldown: .9, g: 21 };
    var nadeGeo = new T.SphereGeometry(.05, 12, 10), capGeo = new T.CylinderGeometry(.018, .022, .035, 8), spoonGeo = new T.BoxGeometry(.012, .07, .006);
    var nadeMat = new T.MeshStandardMaterial({ color: 0x3f4b2c, roughness: .6, metalness: .2, emissive: 0x0a0c06 });
    var ledMat = new T.MeshBasicMaterial({ color: 0xff3a24, toneMapped: false });
    var ledGeo = new T.SphereGeometry(.009, 6, 4);
    function throwNade(opt) {
      opt = opt || {};
      var m = new T.Group(), body = new T.Mesh(nadeGeo, nadeMat), cap = new T.Mesh(capGeo, dark), spoon = new T.Mesh(spoonGeo, dark), led = new T.Mesh(ledGeo, ledMat);
      cap.position.y = .055; spoon.position.set(.03, .03, 0); spoon.rotation.z = -.3; led.position.set(0, .075, 0);
      m.add(body, cap, spoon, led);
      var pos, vel, owner = opt.owner || 'player';
      if (opt.pos) { pos = opt.pos.clone(); vel = opt.vel.clone(); }
      else {
        var right = V3(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
        pos = P.eye.clone().addScaledVector(P.forward, .45).addScaledVector(right, .18); pos.y -= .12;
        vel = P.forward.clone().multiplyScalar(NADE.speed); vel.y += NADE.up; vel.x += P.vel.x * .6; vel.z += P.vel.z * .6;
      }
      m.position.copy(pos); G.scene.add(m);
      var nd = { m: m, led: led, pos: pos, vel: vel, t: 0, rest: false, wet: false, owner: owner, fuse: opt.fuse || NADE.fuse, spin: V3(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6), lastBounce: -1 };
      nades.push(nd);
      if (owner === 'player') {
        snd('gear_rustle', .9); snd('pistol_dry', .5, undefined, 1.4);
        kick = Math.max(kick, .6);
        nadeCd = NADE.cooldown;
        G.events && G.events.emit && G.events.emit('player:grenade', {});
      } else snd('gear_rustle', .8, pos);
      return nd;
    }
    var tmpD = V3(), tmpN = V3();
    function stepNade(n, dt) {
      n.t += dt;
      if (!n.rest) {
        var steps = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / steps;
        for (var k = 0; k < steps; k++) {
          n.vel.y -= NADE.g * h * (n.wet ? .15 : 1);
          if (n.wet) n.vel.multiplyScalar(Math.pow(.05, h));
          var len = n.vel.length() * h; if (len < 1e-6) continue;
          tmpD.copy(n.vel).normalize();
          var hit = null; try { hit = n.wet ? null : G.physics.raycast(n.pos, tmpD, len + .05); } catch (e) {}
          if (hit && hit.dist <= len + .05) {
            if (hit.surface === 'water' && hit.normal.y > .9 && !hit.box) { n.pos.copy(hit.point); n.pos.y -= .06; n.wet = true; n.vel.multiplyScalar(.2); snd('step_water', .9, n.pos); continue; }
            tmpN.copy(hit.normal);
            n.pos.copy(hit.point).addScaledVector(tmpN, .052);
            var vn = n.vel.dot(tmpN), sp = n.vel.length();
            var vnv = tmpN.clone().multiplyScalar(vn);
            n.vel.sub(vnv).multiplyScalar(.62).addScaledVector(vnv, -.38);
            n.spin.multiplyScalar(.6);
            if (sp > 2.2 && n.t - n.lastBounce > .08) { snd('shell_bounce_metal', Math.min(1, .3 + sp / 14), n.pos, .7); n.lastBounce = n.t; }
            if (tmpN.y > .6 && n.vel.length() < .7) { n.vel.set(0, 0, 0); n.rest = true; break; }
          } else n.pos.addScaledVector(n.vel, h);
        }
        n.m.rotation.x += n.spin.x * dt; n.m.rotation.y += n.spin.y * dt; n.m.rotation.z += n.spin.z * dt;
      }
      n.m.position.copy(n.pos);
      var left = n.fuse - n.t, rate = left < .6 ? 18 : left < 1.2 ? 9 : 4;
      n.led.visible = Math.sin(n.t * rate * Math.PI) > 0;
      return left <= 0;
    }
    function boom(n) {
      var p = n.pos.clone(); if (!n.wet) p.y += .05;
      try { G.fx && G.fx.explosion(p, n.wet ? 1 : 1.45); } catch (e) {}
      try { G.fx && G.fx.debris && G.fx.debris(p, { count: 12, color: 0x303030, size: .08, speed: 9, spread: 1.4 }); } catch (e) {}
      try { G.render && G.render.lightPool && G.render.lightPool.flash(p, 0xffa040, 60, 16, .12); } catch (e) {}
      try { G.combat && G.combat.explode(p, NADE.radius, n.owner === 'player' ? NADE.damage : NADE.damage * .62, n.owner === 'player' ? 'grenade' : 'enemy-grenade'); } catch (e) {}
      try { G.enemies && G.enemies.alert && G.enemies.alert(p, 45); } catch (e) {}
      var d = P.pos.distanceTo(p), s = Math.max(0, 1 - d / 26); if (s > 0 && P.addShake) P.addShake(.12 + .8 * s * s);
      G.scene.remove(n.m);
    }
    function clearNades() { nades.forEach(function (n) { G.scene.remove(n.m); }); nades.length = 0; }

    /* ---------------- laser fire ---------------- */
    var ray = V3(), endP = V3(), mzW = V3(), tmp = V3(), q = new T.Quaternion(), fwdZ = V3(0, 0, 1), ndc = V3();
    function muzzleWorld(out) {
      // place the beam start where the viewmodel muzzle appears on screen
      tmp.copy(MUZZLE).multiplyScalar(gun.scale.x).applyQuaternion(gun.quaternion).add(gun.position); // camera space (viewmodel)
      var asp = cam.aspect || 1.77, tv = Math.tan(VM_FOV * Math.PI / 360), tm = Math.tan(cam.fov * Math.PI / 360);
      var nx = tmp.x / -tmp.z / (tv * asp), ny = tmp.y / -tmp.z / tv, d = .55;
      out.set(nx * tm * asp * d, ny * tm * d, -d);
      return cam.localToWorld(out);
    }
    function traceLaser() {
      ray.copy(P.forward);
      var o = P.eye, ph = null, en = null, range = 220;
      try { ph = G.physics.raycast(o, ray, range); } catch (e) {}
      try { en = G.enemies && G.enemies.raycast ? G.enemies.raycast(o, ray, ph ? ph.dist : range) : null; } catch (e) {}
      var h = en || ph;
      if (h) endP.copy(h.point); else endP.copy(o).addScaledVector(ray, range);
      return h;
    }
    function fireTick() {
      ray.copy(P.forward);
      try { G.combat.playerShot(P.eye.clone(), ray.clone(), { damage: 15, range: 220, impulse: .25 }); } catch (e) {}
    }

    /* ---------------- per-frame ---------------- */
    var origUpdate = P.update, origReset = P.reset;
    P.reset = function () { var r = origReset.apply(P, arguments); setLaser(false); clearNades(); nadeCd = 0; return r; };
    P.update = function (dt) {
      origUpdate.call(P, dt);
      try { frame(dt); } catch (e) { if (!frame.err) { frame.err = 1; console.error('[addon] frame', e); } }
    };
    G.events && G.events.on && G.events.on('player:dead', function () { setLaser(false); });
    G.events && G.events.on && G.events.on('game:state', function (e) { if (e.state === 'title') { setLaser(false); gun.visible = false; beam.visible = hitGlow.visible = false; stopHum(); clearNades(); } });

    function frame(dt) {
      t += dt;
      var live = P.alive && P.enabled && wantWeaponVisible;
      if (I.pressed) {
        if (I.pressed('weapon3') && live) setLaser(!laserOn);
        else if (laserOn && (I.pressed('weapon1') || I.pressed('weapon2') || I.pressed('swap'))) setLaser(false);
        nadeCd = Math.max(0, nadeCd - dt);
        if (I.pressed('grenade') && live && nadeCd <= 0) throwNade();
        if (window.__soldiers && window.__soldiers.tick) { try { window.__soldiers.tick(dt); } catch (e) { if (!frame.serr || frame.serr < 3) { frame.serr = (frame.serr || 0) + 1; console.error('[soldiers] tick', e); } } }
      }
      nadeEl.classList.toggle('cool', nadeCd > 0);
      for (var i = nades.length - 1; i >= 0; i--) if (stepNade(nades[i], dt)) { boom(nades[i]); nades.splice(i, 1); }

      gun.visible = laserOn && wantWeaponVisible && P.alive;
      if (!gun.visible) { beam.visible = hitGlow.visible = false; stopHum(); firing = false; return; }

      var wantFire = !!I.fire && P.enabled && P.alive && raise > .7;
      if (wantFire && !firing) { startHum(); fireAcc = .05; }
      if (!wantFire && firing) { stopHum(); snd('pistol_dry', .35, undefined, .6); }
      firing = wantFire;

      // pose: raise from low, ADS, sprint, sway, bob, kick
      raise = Math.min(1, raise + dt * 4);
      var target = tmp.copy(HIP).lerp(ADS, P.ads || 0);
      if (P.sprinting) target.copy(LOW);
      if (raise < 1) target.lerp(LOW, 1 - raise);
      pose.lerp(target, 1 - Math.exp(-14 * dt));
      var dy = P.yaw - lastYaw, dp = P.pitch - lastPitch; lastYaw = P.yaw; lastPitch = P.pitch;
      if (Math.abs(dy) > 1) dy = 0;
      var sw = 1 - (P.ads || 0) * .8;
      sway.x += (-dy * .9 * sw - sway.x) * Math.min(1, dt * 10); sway.y += (dp * .9 * sw - sway.y) * Math.min(1, dt * 10);
      sway.x = Math.max(-.05, Math.min(.05, sway.x)); sway.y = Math.max(-.05, Math.min(.05, sway.y));
      var bobA = P.onGround ? Math.min(1, P.speed / 4) * (1 - (P.ads || 0) * .85) : 0, ph = t * (P.sprinting ? 11 : 8);
      kick = Math.max(0, kick - dt * 6);
      var jitter = firing ? .0016 : 0;
      gun.position.set(pose.x + sway.x + Math.sin(ph) * .008 * bobA + (Math.random() - .5) * jitter, pose.y + sway.y - Math.abs(Math.cos(ph)) * .007 * bobA + (Math.random() - .5) * jitter - kick * .03, pose.z + (firing ? .008 : 0) + kick * .02);
      gun.rotation.set(sway.y * 1.5 + kick * .25 + (P.sprinting ? -.35 : 0), sway.x * 1.5 + (P.sprinting ? .55 : 0), (P.sprinting ? .25 : 0) + (P.sliding ? -.18 : 0));

      // glow pulse
      var pulse = firing ? .75 + .25 * Math.sin(t * 60) : .55 + .15 * Math.sin(t * 3);
      glow.color.setRGB(.36 * (.6 + pulse), .94 * (.6 + pulse * .6), 1);
      for (var c = 0; c < coils.length; c++) coils[c].rotation.z += dt * (firing ? 18 : 1.5) * (c % 2 ? -1 : 1);
      cellMat.opacity = .5 + .4 * pulse;
      heatBar.style.width = (firing ? 70 + 30 * Math.abs(Math.sin(t * 9)) : 0) + '%';
      cue.classList.toggle('on', firing);

      if (firing) {
        var h = traceLaser();
        fireAcc += dt;
        while (fireAcc >= .05) { fireAcc -= .05; fireTick(); }
        muzzleWorld(mzW);
        tmp.copy(endP).sub(mzW); var L = tmp.length();
        beam.position.copy(mzW); q.setFromUnitVectors(fwdZ, tmp.normalize()); beam.quaternion.copy(q);
        var flick = .85 + Math.random() * .3;
        core.scale.set(.008 * flick, .008 * flick, L); halo.scale.set(.03 * flick, .03 * flick, L);
        halo.material.opacity = .26 + Math.random() * .12;
        beam.visible = true;
        if (h) { hitGlow.visible = true; hitGlow.position.copy(endP); hitGlow.scale.setScalar(.09 + Math.random() * .07); }
        else hitGlow.visible = false;
        fxAcc -= dt;
        if (fxAcc <= 0) {
          fxAcc = .045;
          try { if (h && G.fx && G.fx.sparks) G.fx.sparks(endP, h.normal || tmp.copy(ray).negate(), 3); } catch (e) {}
          try { G.render && G.render.lightPool && G.render.lightPool.flash(h ? endP : mzW, 0x40e8ff, 14, 6, .06); } catch (e) {}
          try { G.render && G.render.lightPool && G.render.lightPool.flash(mzW, 0x60f0ff, 10, 3, .05); } catch (e) {}
        }
      } else { beam.visible = false; hitGlow.visible = false; }
    }
    window.__addon = { setLaser: setLaser, throwNade: throwNade, nades: nades, NADE: NADE, get laserOn() { return laserOn; } };
  }
  boot();
})();
