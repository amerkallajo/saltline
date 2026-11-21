/* The Breakwater keeps Saltline's shared hand rig and weapon animation state. */
(() => {
  'use strict';

  window.SaltlineSniper = function (G, rig, parts) {
    const { THREE: T } = G;
    const { body, magazine, receiverBolt, round } = parts;
    const rule = window.SaltlineWeaponRules.sniper;
    const name = 'PAC-12 Breakwater';
    const { root, flash } = rig;
    root.name = 'viewmodel-pac12';
    root.remove(...body);
    magazine.remove(...magazine.children.filter((child) => child !== round));
    round.position.y -= .006;

    const steel = new T.MeshStandardMaterial({ color: 0x373c41, metalness: .48, roughness: .46 });
    const black = new T.MeshStandardMaterial({ color: 0x1e2327, metalness: .15, roughness: .74 });
    const stock = new T.MeshStandardMaterial({ color: 0x746951, roughness: .82 });
    const optic = new T.MeshStandardMaterial({ color: 0x254d4a, metalness: .58, roughness: .18 });
    function mesh(geometry, material, x, y, z, parent = root) {
      const part = new T.Mesh(geometry, material);
      parent.add(part);
      part.position.set(x, y, z);
      return part;
    }
    function box(w, h, d, x, y, z, material = steel, parent) {
      return mesh(new T.BoxGeometry(w, h, d), material, x, y, z, parent);
    }
    function tube(a, b, length, x, y, z, material = steel) {
      return mesh(new T.CylinderGeometry(a, b, length, 16).rotateX(Math.PI / 2), material, x, y, z);
    }

    box(.042, .046, .225, 0, .003, .014);
    box(.043, .016, .25, 0, .034, -.004, black);
    box(.051, .036, .24, 0, -.012, -.238, stock);
    box(.031, .022, .23, 0, .013, -.235, black);
    for (const x of [-.026, .026]) {
      for (let i = 0; i < 6; i++) box(.002, .008, .019, x, -.007, -.163 - i * .031, black);
    }
    tube(.016, .014, .24, 0, .01, -.413);
    tube(.011, .012, .17, 0, .01, -.602);
    tube(.019, .016, .048, 0, .01, -.704, black);
    for (const x of [-.016, .016]) {
      for (let i = 0; i < 3; i++) box(.006, .01, .006, x, .01, -.692 - i * .011);
    }

    box(.031, .082, .03, 0, -.058, .071, black).rotation.x = -.3;
    box(.026, .008, .055, 0, -.053, .023, black);
    box(.026, .033, .008, 0, -.038, -.002, black);
    box(.043, .045, .163, 0, -.018, .184, stock);
    box(.041, .025, .079, 0, .015, .179, black);
    box(.045, .066, .018, 0, -.022, .271, black);
    box(.035, .065, .058, 0, -.036, 0, black, magazine);
    box(.041, .01, .064, 0, -.067, 0, stock, magazine);

    receiverBolt.visible = false;
    const bolt = box(.038, .018, .103, 0, .009, -.048);
    const handle = box(.035, .012, .012, -.023, -.006, .032, black, bolt);
    mesh(new T.SphereGeometry(.009, 12, 8), steel, -.018, -.008, 0, handle);

    const scopeY = .071;
    for (const z of [-.043, .045]) box(.037, .039, .018, 0, .052, z, black);
    tube(.017, .017, .153, 0, scopeY, -.006, black);
    tube(.024, .017, .047, 0, scopeY, -.103);
    tube(.023, .022, .045, 0, scopeY, .088, black);
    tube(.020, .020, .002, 0, scopeY, .111, optic);
    tube(.021, .021, .002, 0, scopeY, -.128, optic);
    mesh(new T.CylinderGeometry(.011, .011, .011, 14), steel, 0, .093, -.006);

    const baseReload = rig.reload;
    const baseRecoil = rig.recoil;
    const baseParts = rig.parts;
    const baseShot = rig.shot;
    const baseReset = rig.reset;
    const baseCancel = rig.cancelReload;
    let cycle = 2;
    Object.assign(rig, {
      id: 'sniper', name, sight: [0, scopeY, .111], muzzle: [0, .01, -.727], eject: [-.027, .011, -.055],
      reloadTime: (empty) => (empty ? rule.emptyReload : rule.reload) / 1000,
      reload(state, elapsed) {
        const baseTime = G.weapon.rigs.rifle.reloadTime(state.empty);
        const originalTime = state.T;
        state.T = baseTime;
        state.t = elapsed * baseTime / originalTime;
        baseReload(state, state.t);
        state.t = elapsed;
        state.T = originalTime;
      },
      recoil(burst, strength, player) { baseRecoil(burst, strength * 2.7, player); },
      shot(empty) { baseShot(empty); cycle = 0; },
      reset() { baseReset(); cycle = 2; },
      cancelReload(seated) { baseCancel(seated); cycle = 2; },
      parts(dt, finger, reloading) {
        baseParts(dt, finger, reloading);
        cycle += dt;
        const travel = Math.max(0, Math.sin(Math.PI * T.MathUtils.clamp((cycle - .16) / .58, 0, 1)));
        bolt.position.z = -.048 + (reloading ? receiverBolt.position.z : .06 * travel);
        handle.rotation.z = reloading ? Math.min(.7, receiverBolt.position.z * 10) : travel * .8;
        if (cycle >= .28 && cycle - dt < .28 && !reloading) G.audio.play('reload_boltback', { gain: .52, pitch: .76 });
        if (cycle >= .66 && cycle - dt < .66 && !reloading) G.audio.play('reload_bolt', { gain: .55, pitch: .77 });
      },
    });
    Object.assign(rig.slot, { id: 'sniper', name, magSize: rule.magSize, ammo: rule.magSize, reserve: rule.reserve });
    Object.assign(rig.def, rule, { auto: false, adsTime: .32, inspect: false, flashLight: 68, flashScale: 1.28 });
    Object.assign(rig.def.spread, { hip: .028, ads: .00024, moveHip: .019, moveAds: .0024, air: .025, shot: .12 });
    flash.position.fromArray(rig.muzzle);
    return rig;
  };

  function attachScope() {
    if (window.__fatal || window.__G?.showcase) return;
    if (!window.__ready) return requestAnimationFrame(attachScope);
    const G = window.__G;
    const scope = document.createElement('div');
    scope.className = 'sl-scope';
    scope.hidden = true;
    scope.setAttribute('aria-hidden', 'true');
    scope.innerHTML = '<div class="sl-scope-lens"><div class="sl-scope-mark"></div></div>';
    document.querySelector('.hud').prepend(scope);
    const update = G.game.update.bind(G.game);
    G.game.update = function (dt) {
      const result = update(dt);
      const scoped = G.game.state === 'playing' && G.player.alive && G.player.enabled && G.input.ads && G.weapon.current === 'sniper'
        && G.weapon.root.visible && !G.weapon.pending && G.weapon.state !== 'reloading' && G.weapon.ads > .94;
      if (scope.hidden === scoped) {
        scope.hidden = !scoped;
        document.body.classList.toggle('sl-scoped', scoped);
        if (scoped) G.viewCamera.layers.disable(1);
        else G.viewCamera.layers.enable(1);
      }
      return result;
    };
  }
  attachScope();
})();
