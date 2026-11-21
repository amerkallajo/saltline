/* Frag grenades and the Firefight soldier tick. */
(function () {
  'use strict';
  function boot() {
    var G = window.__G;
    if (!G || !G.player || !G.weapon || G.weapon.stub || !G.scene || !G.THREE || !G.input || !G.physics || !document.querySelector('.h-ammo')) { setTimeout(boot, 250); return; }
    try { init(G); } catch (e) { console.error('[addon] grenade init failed', e); }
  }
  function init(G) {
    var T = G.THREE, P = G.player, I = G.input;
    var V3 = function (x, y, z) { return new T.Vector3(x || 0, y || 0, z || 0); };
    var nadeCd = 0;
    var dark = new T.MeshStandardMaterial({ color: 0x15181b, roughness: .7, metalness: .2, emissive: 0x050607 });
    var nadeEl = document.createElement('div'); nadeEl.className = 'x-nade';
    nadeEl.innerHTML = '<svg viewBox="0 0 14 16"><rect x="4" y="0" width="6" height="3" fill="currentColor"/><circle cx="7" cy="9.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg><kbd>G</kbd> Frag ∞';
    document.querySelector(".h-ammo").parentNode.appendChild(nadeEl);

    function snd(name, gain, pos, pitch) {
      G.audio.play(name, { gain: gain, pos: pos, pitch: pitch || 1, jitter: .05 });
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

    var origUpdate = P.update, origReset = P.reset;
    P.reset = function () {
      var result = origReset.apply(P, arguments);
      clearNades();
      nadeCd = 0;
      return result;
    };
    P.update = function (dt) {
      origUpdate.call(P, dt);
      nadeCd = Math.max(0, nadeCd - dt);
      if (P.alive && P.enabled && G.weapon.root?.visible && I.pressed('grenade') && nadeCd <= 0) throwNade();
      if (window.__soldiers) window.__soldiers.tick(dt);
      nadeEl.classList.toggle('cool', nadeCd > 0);
      for (var i = nades.length - 1; i >= 0; i--) {
        if (stepNade(nades[i], dt)) { boom(nades[i]); nades.splice(i, 1); }
      }
    };
    G.events.on('game:state', function (event) { if (event.state === 'title') clearNades(); });
    window.__addon = { throwNade: throwNade, nades: nades, NADE: NADE };
  }
  boot();
})();
