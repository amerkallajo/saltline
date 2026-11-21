/* Rift Siege: defend the containment yard with a dedicated energy loadout. */
(function () {
  'use strict';

  const MODE = 'rift-siege';
  const WAVES = [
    ['wisp', 'wisp', 'siphon'],
    ['wisp', 'bulwark', 'siphon', 'wisp', 'wisp'],
    ['bulwark', 'siphon', 'wisp', 'siphon', 'bulwark', 'wisp', 'wisp'],
    ['siphon', 'wisp', 'bulwark', 'siphon', 'bulwark', 'wisp', 'wisp', 'siphon', 'bulwark'],
  ];
  const TYPES = {
    wisp: { color: 0xff9359, health: 42, speed: 3.7, range: 2.5, radius: .54, windup: .56, damage: 10 },
    bulwark: { color: 0xffcd64, health: 90, speed: 2, range: 2.7, radius: .76, windup: .95, damage: 15 },
    siphon: { color: 0xdca0ff, health: 60, speed: 2.55, range: 5, radius: .63, windup: 1.25, damage: 9 },
  };
  const LOADOUT = [
    { name: 'Prism Lance', color: 0x78f8e7, cooldown: .25, tip: 'Direct energy fire' },
    { name: 'Grav Bloom', color: 0xe99aff, cooldown: 4.8, tip: 'Pulls enemies and drops shields' },
  ];

  function boot() {
    if (window.__fatal || window.__G?.showcase) return;
    if (!window.__ready) {
      requestAnimationFrame(boot);
      return;
    }
    const G = window.__G;
    if (G?.game?.finishRiftSiege) init(G);
  }

  function init(G) {
    const { THREE: T, player, weapon, physics, input, camera, game, hud, events } = G;
    const v = (x, y, z) => new T.Vector3(x, y, z);
    const ui = document.getElementById('ui');
    const menu = game.menus.root;
    const restart = menu.querySelector('[data-act="restart"]');
    const restartLabel = restart.textContent;
    const start = { pos: v(-35.5, 0, -6.1), yaw: -Math.PI / 2 };
    const reactor = v(-30, 0, -5.9);
    const receiver = reactor.clone().add(v(0, 1.65, 0));
    const coolant = v(-34.55, 0, -2.75);
    const lift = v(-30, 0, -2.8);
    const padRadius = 1;
    const fieldRadius = 4.6;
    const ports = [v(-34.7, 0, -11), v(-23.3, 0, -9.2), v(-24.4, 0, -2.7)];
    const cover = [
      { center: v(-31.4, .52, -9), size: v(2.15, 1.04, .62) },
      { center: v(-25.85, .52, -5.45), size: v(.62, 1.04, 2.1) },
    ];
    const arena = new T.Group();
    arena.name = 'rift-siege-yard';
    const enemies = new T.Group();
    enemies.name = 'rift-constructs';
    arena.add(enemies);
    const armory = new T.Group();
    armory.name = 'rift-siege-loadout';
    armory.visible = false;
    camera.add(armory);
    let run = null;

    const unlit = (color, options = {}) => new T.MeshBasicMaterial({ color, toneMapped: false, ...options });
    const steel = new T.MeshStandardMaterial({ color: 0x323b43, metalness: .57, roughness: .54, emissive: 0x12171c });
    const graphite = new T.MeshStandardMaterial({ color: 0x171a25, metalness: .25, roughness: .74, emissive: 0x090b12 });
    const aqua = unlit(LOADOUT[0].color);
    const violet = unlit(LOADOUT[1].color);
    const amber = unlit(0xfbc16b);
    const coreGlow = aqua.clone();
    const readyGlow = aqua.clone();
    const signal = unlit(0xe9aaff, { transparent: true, opacity: .3, depthWrite: false, side: T.DoubleSide });
    const coreLow = new T.Color(0xff654b);
    const coreHigh = new T.Color(0x78f8e7);
    const beamGeo = new T.CylinderGeometry(1, 1, 1, 7);
    const up = v(0, 1, 0);
    const delta = v(0, 0, 0);
    const aim = v(0, 0, 0);
    const impact = v(0, 0, 0);
    const candidate = v(0, 0, 0);
    const axis = v(0, 0, 0);
    const ray = new T.Ray();
    const hitSphere = new T.Sphere();
    const flatDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const play = (name, gain, pitch, pos) => G.audio?.play?.(name, { gain, pitch, pos });

    function part(group, geometry, material, x, y, z) {
      const obj = new T.Mesh(geometry, material);
      obj.position.set(x, y, z);
      group.add(obj);
      return obj;
    }

    function box(group, material, x, y, z, w, h, d) {
      return part(group, new T.BoxGeometry(w, h, d), material, x, y, z);
    }

    function casing(group, x, y, z, w, h, d) {
      const outline = new T.Shape();
      outline.moveTo(-w / 2, -h / 2);
      outline.lineTo(w / 2, -h / 2);
      outline.lineTo(w / 2, h / 2);
      outline.lineTo(-w / 2, h / 2);
      outline.closePath();
      const geo = new T.ExtrudeGeometry(outline, { depth: d, bevelSegments: 1, bevelThickness: .009, bevelSize: .007 });
      geo.translate(0, 0, -d / 2);
      return part(group, geo, steel, x, y, z);
    }

    function halo(group, material, x, y, z, radius, thickness) {
      const ring = part(group, new T.TorusGeometry(radius, thickness, 6, 40), material, x, y, z);
      ring.rotation.x = -Math.PI / 2;
      return ring;
    }

    function connect(mesh, from, to, width) {
      axis.subVectors(to, from);
      const distance = axis.length();
      mesh.position.copy(from).addScaledVector(axis, .5);
      if (distance > .001) mesh.quaternion.setFromUnitVectors(up, axis.multiplyScalar(1 / distance));
      mesh.scale.set(width, distance, width);
    }

    const housing = new T.Group();
    housing.name = 'containment-reactor';
    housing.position.copy(reactor);
    arena.add(housing);
    part(housing, new T.CylinderGeometry(1.18, 1.26, .14, 8), graphite, 0, .07, 0);
    part(housing, new T.CylinderGeometry(.69, .79, .58, 8), steel, 0, .34, 0);
    halo(housing, coreGlow, 0, .62, 0, .68, .038);
    halo(housing, steel, 0, 2.28, 0, .63, .075);
    for (const x of [-.56, .56]) {
      box(housing, steel, x, 1.38, 0, .12, 1.72, .18);
      box(housing, coreGlow, x, 1.39, .096, .033, 1.12, .018);
    }
    const crystal = part(housing, new T.OctahedronGeometry(.61), coreGlow, 0, 1.52, 0);
    crystal.scale.y = 1.25;
    const coreRing = halo(housing, coreGlow, 0, 1.5, 0, .87, .022);
    const yardLight = new T.PointLight(0x82fcea, 6.5, 11, 2);
    yardLight.position.copy(receiver);
    arena.add(yardLight);

    const gates = ports.map((position, index) => {
      const group = new T.Group();
      group.name = 'containment-gate-' + (index + 1);
      group.position.copy(position);
      group.rotation.y = Math.atan2(reactor.x - position.x, reactor.z - position.z);
      arena.add(group);
      box(group, graphite, 0, .09, 0, 2.32, .18, .94);
      const frame = part(group, new T.TorusGeometry(1.07, .12, 6, 8), steel, 0, 1.28, 0);
      frame.rotation.z = Math.PI / 8;
      const rim = part(group, new T.TorusGeometry(.9, .035, 7, 32), violet, 0, 1.28, .06);
      const veil = part(group, new T.CircleGeometry(.91, 32), signal.clone(), 0, 1.28, .02);
      const aperture = part(group, new T.IcosahedronGeometry(.3, 0), violet, 0, 1.28, .13);
      for (const x of [-.82, .82]) {
        box(group, graphite, x, .39, .14, .2, .49, .32);
        box(group, violet, x, .37, .308, .096, .21, .02);
      }
      return { rim, veil, aperture };
    });

    function pad(name, pos, material) {
      const group = new T.Group();
      group.name = name;
      group.position.copy(pos);
      arena.add(group);
      part(group, new T.CylinderGeometry(1, 1.04, .065, 8), graphite, 0, .04, 0);
      halo(group, material, 0, .085, 0, .82, .034);
      return group;
    }

    const repairPad = pad('reactor-service-pad', coolant, readyGlow);
    box(repairPad, readyGlow, 0, .088, 0, .68, .028, .16);
    box(repairPad, readyGlow, 0, .089, 0, .16, .028, .68);
    const launchPad = pad('magnetic-launch-pad', lift, amber);
    for (const offset of [-.38, 0, .38]) {
      box(launchPad, amber, 0, .084, offset, .74 - Math.abs(offset), .036, .115);
    }
    for (const { center, size } of cover) {
      box(arena, steel, center.x, center.y, center.z, size.x, size.y, size.z);
      box(arena, graphite, center.x, 1.02, center.z, size.x + .08, .1, size.z + .08);
      box(arena, amber, center.x, .89, center.z, size.x + .018, .065, size.z + .018);
    }
    for (const point of [coolant, lift, ...ports]) {
      const from = reactor.clone().lerp(point, .18);
      const to = reactor.clone().lerp(point, .85);
      from.y = to.y = .045;
      const cable = part(arena, beamGeo, graphite, 0, 0, 0);
      connect(cable, from, to, .035);
    }

    const loadout = LOADOUT.map((data, i) => {
      const gun = new T.Group();
      gun.name = i === 0 ? 'prism-lance' : 'grav-bloom';
      gun.scale.setScalar(.82);
      const emissive = i === 0 ? aqua : violet;
      box(gun, graphite, 0, -.08, .06, .059, .14, .065).rotation.x = -.21;
      casing(gun, 0, 0, 0, .091, .085, i === 0 ? .33 : .26);
      box(gun, graphite, 0, .054, -.04, .048, .019, .19);
      box(gun, emissive, 0, .066, .029, .022, .006, .048);
      for (const x of [-.052, .052]) {
        box(gun, graphite, x, -.004, .004, .013, .042, .177);
        for (let vent = 0; vent < 4; vent++) {
          box(gun, emissive, x * 1.17, -.004, -.049 + vent * .035, .004, .018, .012).rotation.x = -.23;
        }
      }
      if (i === 0) {
        for (const x of [-.04, .04]) {
          casing(gun, x, .016, -.214, .016, .044, .213);
          box(gun, emissive, x, .024, -.241, .012, .023, .175);
        }
        const focus = part(gun, new T.OctahedronGeometry(.029), aqua, 0, .02, -.345);
        focus.scale.z = 2.2;
      } else {
        const chamber = part(gun, new T.CylinderGeometry(.068, .074, .17, 8), graphite, 0, .02, -.16);
        chamber.rotation.x = Math.PI / 2;
        for (const z of [-.16, -.215, -.252]) {
          part(gun, new T.TorusGeometry(.065, .009, 7, 22), violet, 0, .02, z);
        }
        for (const x of [-.067, .067]) {
          box(gun, steel, x, .02, -.191, .02, .021, .152);
          box(gun, graphite, x, -.019, -.214, .021, .02, .1);
        }
        part(gun, new T.IcosahedronGeometry(.04, 0), violet, 0, .02, -.276);
      }
      gun.traverse((node) => { node.layers.set(1); node.frustumCulled = false; });
      armory.add(gun);
      return { ...data, gun, muzzle: v(0, .022, i === 0 ? -.365 : -.3) };
    });

    const tracer = part(arena, beamGeo, unlit(0x78f8e7, { transparent: true, depthWrite: false }), 0, 0, 0);
    tracer.visible = false;
    const bloom = new T.Group();
    bloom.name = 'grav-bloom-field';
    bloom.visible = false;
    arena.add(bloom);
    const field = part(bloom, new T.SphereGeometry(1, 24, 16), signal.clone(), 0, 0, 0);
    const fieldRing = halo(bloom, violet, 0, .03, 0, fieldRadius, .028);
    const vortex = part(bloom, new T.IcosahedronGeometry(.28, 0), violet, 0, 0, 0);

    const templates = Object.fromEntries(Object.entries(TYPES).map(([type, data]) => {
      const group = new T.Group();
      const light = unlit(data.color);
      const core = part(group, new T.IcosahedronGeometry(type === 'bulwark' ? .43 : .32, 0), light, 0, 0, 0);
      core.name = 'construct-crystal';
      if (type === 'wisp') {
        for (const x of [-.38, .38]) {
          const fin = part(group, new T.TetrahedronGeometry(.32), steel, x, .04, -.11);
          fin.scale.set(1.4, .72, 1.45);
          box(group, light, x, .02, .12, .16, .024, .033);
        }
      } else if (type === 'bulwark') {
        for (const x of [-.45, .45]) box(group, steel, x, 0, 0, .38, .5, .43).rotation.z = x * -.5;
        const shield = new T.Group();
        shield.name = 'construct-shield';
        shield.position.z = .45;
        part(shield, new T.CircleGeometry(.69, 6),
          unlit(data.color, { transparent: true, depthWrite: false, opacity: .18, side: T.DoubleSide }), 0, 0, 0);
        part(shield, new T.TorusGeometry(.69, .025, 6, 6), light, 0, 0, 0);
        group.add(shield);
      } else {
        const spindle = part(group, new T.TorusGeometry(.48, .06, 6, 14), steel, 0, 0, 0);
        spindle.rotation.x = .44;
        for (const x of [-.42, .42]) {
          const jet = part(group, new T.ConeGeometry(.135, .67, 4), light, x, -.18, 0);
          jet.rotation.z = x * 1.2 + Math.PI;
        }
      }
      return [type, group];
    }));
    const pools = { wisp: [], bulwark: [], siphon: [] };
    const links = Object.fromEntries(Object.entries(TYPES).map(([type, data]) => [type,
      unlit(data.color, { transparent: true, opacity: .73, depthWrite: false }),
    ]));

    const tracker = ui.querySelector('.h-obj');
    const status = document.createElement('div');
    status.className = 'rs-status';
    status.innerHTML = '<p class="rs-wave"></p><label class="rs-core">Reactor <span></span><progress max="100"></progress></label>';
    tracker.append(status);
    const waveLabel = status.querySelector('.rs-wave');
    const coreText = status.querySelector('.rs-core span');
    const coreBar = status.querySelector('progress');
    const ammo = document.createElement('div');
    ammo.className = 'h-ammo rs-weapon';
    ammo.innerHTML = '<b class="rs-charge"></b><div class="h-wname"></div><p class="rs-tip"></p><div class="rs-keys"><kbd>1</kbd> Lance <kbd>2</kbd> Bloom</div>';
    ui.querySelector('.hud').append(ammo);
    const charge = ammo.querySelector('.rs-charge');
    const weaponName = ammo.querySelector('.h-wname');
    const tip = ammo.querySelector('.rs-tip');
    const report = Object.fromEntries(['complete', 'dead'].map((state) => {
      const card = menu.querySelector('[data-s="' + state + '"]');
      const text = document.createElement('div');
      text.className = 'rs-report';
      text.innerHTML = '<p class="m-k">Rift Siege</p><h2 class="m-h"></h2><dl class="m-stats">' +
        '<div><dt>Surges cleared</dt><dd></dd></div><div><dt>Constructs destroyed</dt><dd></dd></div>' +
        '<div><dt>Reactor integrity</dt><dd></dd></div></dl>';
      card.prepend(text);
      return [state, { card, heading: text.querySelector('h2'), values: text.querySelectorAll('dd') }];
    }));

    function updateIntegrity(value) {
      run.integrity = Math.max(0, Math.min(100, value));
      coreText.textContent = run.integrity + '%';
      coreBar.value = run.integrity;
      coreGlow.color.copy(coreLow).lerp(coreHigh, run.integrity / 100);
      yardLight.color.copy(coreGlow.color);
      tracker.classList.toggle('rs-critical', run.integrity <= 30);
    }

    function select(index) {
      run.selected = index;
      const data = loadout[index];
      loadout.forEach(({ gun }, i) => { gun.visible = index === i; });
      ammo.dataset.weapon = String(index);
      weaponName.textContent = data.name;
      tip.textContent = data.tip;
      run.pose = .84;
    }

    function showReport(state) {
      const { card, heading, values } = report[state];
      heading.textContent = state === 'complete' ? 'Rifts sealed' : run.integrity === 0 ? 'Reactor lost' : 'Suit disabled';
      values[0].textContent = run.cleared + '/' + WAVES.length;
      values[1].textContent = run.kills;
      values[2].textContent = run.integrity + '%';
      card.classList.add('rs-report-active');
      run.ended = true;
      armory.visible = false;
      tracer.visible = bloom.visible = false;
      hud.setMarkers([]);
    }

    function release(enemy) {
      enemies.remove(enemy.root, enemy.tether);
      pools[enemy.type].push(enemy);
    }

    function reset() {
      run.enemies.forEach(release);
      run.colliders.forEach((entry) => physics.removeBox(entry));
      G.scene.remove(arena);
      armory.visible = false;
      tracer.visible = bloom.visible = false;
      ui.classList.remove('rs-active');
      tracker.classList.remove('rs-critical');
      restart.textContent = restartLabel;
      for (const { card } of Object.values(report)) card.classList.remove('rs-report-active');
      hud.setMarkers([]);
      run = null;
    }

    function begin() {
      run = {
        wave: 0, cleared: 0, queue: [], next: 0, wait: 4, kills: 0, time: 0, ended: false,
        enemies: [], colliders: [], charges: [0, 0], selected: 0, pose: 0, recoil: 0, traceLife: 0,
        fieldLife: 0, repairTime: 0, launchTime: 0,
        pressure: { standard: .78, hard: 1, brutal: 1.24 }[game.difficulty] || 1,
      };
      G.scene.add(arena);
      for (const { center, size } of [...cover, { center: reactor.clone().add(v(0, .37, 0)), size: v(1.38, .74, 1.38) }]) {
        const extent = size.clone().multiplyScalar(.5);
        run.colliders.push(physics.addBox(center.clone().sub(extent), center.clone().add(extent), { surface: 'metal' }));
      }
      weapon.setVisible(false);
      ui.classList.add('rs-active');
      armory.visible = true;
      restart.textContent = 'Restart siege';
      select(0);
      updateIntegrity(100);
      hud.setObjective('Keep the reactor online');
      hud.setMarkers([{ id: MODE, short: 'CORE', label: 'Containment reactor', pos: reactor, kind: 'siege' }]);
      hud.message('Cyan service pad repairs the reactor and your suit', 3.8);
      play('weapon_draw', .8, .95);
    }

    function spawn(entry) {
      const { type, port } = entry;
      let enemy = pools[type].pop();
      if (!enemy) {
        const root = templates[type].clone();
        root.name = 'rift-' + type;
        const tether = new T.Mesh(beamGeo, links[type]);
        enemy = { root, tether, type, data: TYPES[type], crystal: root.getObjectByName('construct-crystal'), shield: root.getObjectByName('construct-shield') };
      }
      const { root, data, tether } = enemy;
      Object.assign(enemy, {
        health: data.health, alive: true, path: [], repath: 0, windup: 0, recovery: .5,
        shieldDown: 0, stun: 0, phase: Math.random() * Math.PI * 2, target: receiver,
      });
      root.position.copy(ports[port]);
      root.position.y = type === 'wisp' ? 1.47 : 1.25;
      root.rotation.y = Math.atan2(reactor.x - root.position.x, reactor.z - root.position.z);
      tether.visible = false;
      if (enemy.shield) enemy.shield.visible = true;
      enemies.add(root, tether);
      run.enemies.push(enemy);
      play('container_bang', .32, 1.55, root.position);
    }

    function hurt(enemy, amount, stagger) {
      if (!enemy.alive) return;
      enemy.health -= amount;
      if (stagger) {
        enemy.windup = 0;
        enemy.stun = Math.max(enemy.stun, stagger);
      }
      if (enemy.health > 0) return;
      enemy.alive = false;
      run.kills++;
      G.fx?.explosion?.(enemy.root.position, .43);
      play('relay_cut', .34, 1.6, enemy.root.position);
    }

    function advanceEnemy(enemy, target, dt) {
      const pos = enemy.root.position;
      enemy.repath -= dt;
      if (enemy.repath <= 0) {
        enemy.repath = .32;
        enemy.path = physics.nav.clearLine(pos, target) ? [target] : physics.nav.findPath(pos, target) || [];
      }
      const next = enemy.path[0];
      if (!next) return;
      delta.set(next.x - pos.x, 0, next.z - pos.z);
      const length = delta.length();
      if (length < .25) {
        enemy.path.shift();
        return;
      }
      pos.addScaledVector(delta, Math.min(length, enemy.data.speed * dt) / length);
    }

    function enemyAttack(enemy, target) {
      const hitPlayer = target === player.eye;
      const amount = Math.round(enemy.data.damage * run.pressure);
      if (hitPlayer) {
        player.damage(amount, enemy.root.position);
      } else {
        updateIntegrity(run.integrity - amount);
        if (run.integrity === 0) player.damage(player.health + 1, receiver);
        else if (run.integrity <= 30 && run.integrity + amount > 30) hud.warn('Reactor integrity critical', 3.4);
      }
      play('impact_metal', .5, .68, target);
    }

    function stepEnemy(enemy, dt) {
      const { root, data, type, crystal, shield, tether } = enemy;
      const pos = root.position;
      pos.y = (type === 'wisp' ? 1.47 : 1.25) + Math.sin(run.time * 3.5 + enemy.phase) * .12;
      crystal.rotation.y += dt * 2;
      enemy.shieldDown = Math.max(0, enemy.shieldDown - dt);
      if (shield) shield.visible = enemy.shieldDown === 0;
      tether.visible = false;
      if (enemy.stun > 0) {
        enemy.stun -= dt;
        enemy.windup = 0;
        return;
      }
      const huntPlayer = type === 'wisp' && flatDist(player.pos, reactor) < 13 && flatDist(pos, player.pos) < 9;
      const target = enemy.windup > 0 ? enemy.target : huntPlayer ? player.eye : receiver;
      const inRange = pos.distanceTo(target) <= data.range && physics.lineOfSight(pos, target);
      root.rotation.y = Math.atan2(target.x - pos.x, target.z - pos.z);
      if (!inRange) {
        enemy.windup = 0;
        advanceEnemy(enemy, target, dt);
      } else if (enemy.recovery > 0) {
        enemy.recovery -= dt;
      } else {
        if (enemy.windup === 0) play('gear_rustle', .4, 1.55, pos);
        enemy.windup += dt;
        enemy.target = target;
        tether.visible = true;
        connect(tether, pos, target, .021 + .041 * enemy.windup / data.windup);
        if (enemy.windup >= data.windup) {
          enemy.windup = 0;
          enemy.recovery = type === 'siphon' ? 1.45 : 1.1;
          enemyAttack(enemy, target);
        }
      }
    }

    function trace(range) {
      ray.set(player.eye, player.forward);
      const wall = physics.raycast(ray.origin, ray.direction, range);
      let limit = wall ? wall.dist : range;
      let target = null;
      for (const enemy of run.enemies) {
        if (!enemy.alive) continue;
        hitSphere.set(enemy.root.position, enemy.data.radius);
        if (!ray.intersectSphere(hitSphere, candidate)) continue;
        const distance = candidate.distanceTo(ray.origin);
        if (distance > limit) continue;
        limit = distance;
        target = enemy;
      }
      ray.at(limit, impact);
      return target;
    }

    function fire() {
      const index = run.selected;
      const data = loadout[index];
      run.charges[index] = data.cooldown;
      run.recoil = index === 0 ? .065 : .105;
      const enemy = trace(index === 0 ? 52 : 30);
      if (index === 0) {
        // Use the same camera-space viewmodel offset as the port's existing laser.
        const muzzle = aim.copy(data.muzzle).multiply(data.gun.scale).applyQuaternion(data.gun.quaternion).add(data.gun.position);
        const scale = Math.tan(camera.fov * Math.PI / 360) / Math.tan(54 * Math.PI / 360);
        muzzle.x *= scale;
        muzzle.y *= scale;
        camera.localToWorld(muzzle);
        connect(tracer, muzzle, impact, .027);
        tracer.visible = true;
        run.traceLife = .092;
        play('pistol_dry', .8, .64);
        G.fx?.sparks?.(impact, delta.copy(player.forward).negate(), 4);
        if (enemy) {
          const face = Math.atan2(player.pos.x - enemy.root.position.x, player.pos.z - enemy.root.position.z);
          const guarded = enemy.shield?.visible && Math.cos(face - enemy.root.rotation.y) > .25;
          hurt(enemy, guarded ? 12 : 45, guarded ? 0 : .29);
          hud.hitmarker(enemy.alive ? guarded ? 'hit' : 'weak' : 'kill');
          if (guarded) play('impact_metal', .4, 1.4, impact);
        }
      } else {
        // Keep additional pulls and damage on the visible side of an impact surface.
        bloom.position.copy(impact).addScaledVector(player.forward, -.32);
        bloom.position.y = Math.max(.55, bloom.position.y);
        bloom.visible = true;
        run.fieldLife = 1.65;
        play('relay_cut', .65, .62, bloom.position);
      }
    }

    function stepField(dt) {
      if (!bloom.visible) return;
      run.fieldLife -= dt;
      const remaining = Math.max(0, run.fieldLife / 1.65);
      field.scale.setScalar(fieldRadius * (.9 + .085 * Math.sin(remaining * 10)));
      field.material.opacity = .04 + .08 * (1 - remaining);
      fieldRing.rotation.y += dt;
      vortex.rotation.y += dt * 4;
      for (const enemy of run.enemies) {
        const pos = enemy.root.position;
        if (!enemy.alive || pos.distanceTo(bloom.position) > fieldRadius || !physics.lineOfSight(pos, bloom.position)) continue;
        enemy.stun = .23;
        enemy.shieldDown = 2.4;
        delta.set(bloom.position.x - pos.x, 0, bloom.position.z - pos.z);
        const distance = delta.length();
        if (distance > .12) {
          candidate.copy(pos).addScaledVector(delta, Math.min(distance, dt * 4.5) / distance);
          if (physics.nav.isWalkable(candidate.x, candidate.z)) pos.copy(candidate);
        }
        if (remaining === 0) hurt(enemy, 60, .5);
      }
      if (remaining === 0) {
        bloom.visible = false;
        G.fx?.sparks?.(bloom.position, up, 15);
        play('container_bang', .58, 1.6, bloom.position);
      }
    }

    function stepPads(dt) {
      run.repairTime = Math.max(0, run.repairTime - dt);
      run.launchTime = Math.max(0, run.launchTime - dt);
      if (player.onGround && player.pos.y < .25) {
        if (run.repairTime === 0 && flatDist(player.pos, coolant) < padRadius &&
            (player.health < player.maxHealth || run.integrity < 100)) {
          player.heal(36);
          updateIntegrity(run.integrity + 16);
          run.repairTime = 18;
          hud.message('Service pad restored suit and reactor integrity', 2.25);
          play('ui_click', .8, .8);
        }
        if (run.launchTime === 0 && flatDist(player.pos, lift) < padRadius) {
          player.vel.y = 9.4;
          run.launchTime = 3.2;
          play('container_bang', .48, 1.65, lift);
        }
      }
      readyGlow.color.setHex(run.repairTime > 0 ? 0x49646b : LOADOUT[0].color);
    }

    function surge(dt) {
      if (run.queue.length > 0) {
        run.next -= dt;
        if (run.next <= 0) {
          spawn(run.queue.shift());
          run.next = .85;
        }
      } else if (run.enemies.length === 0) {
        if (run.cleared < run.wave) {
          run.cleared = run.wave;
          if (run.cleared === WAVES.length) {
            showReport('complete');
            game.finishRiftSiege();
            return;
          }
          updateIntegrity(run.integrity + 8);
          player.heal(12);
          run.wait = 4.4;
          hud.warn('Surge cleared', 3.4);
        }
        run.wait -= dt;
        if (run.wait <= 0) {
          const wave = run.wave++;
          run.queue = WAVES[wave].map((type, i) => ({ type, port: (wave + i) % ports.length }));
          run.next = .75;
          hud.warn('Surge ' + run.wave + ' incoming', 3.4);
        }
      }
      const remaining = run.enemies.length + run.queue.length;
      const text = remaining > 0
        ? 'Surge ' + run.wave + '/' + WAVES.length + ' · ' + remaining + ' hostile' + (remaining === 1 ? '' : 's')
        : 'Surge ' + (run.wave + 1) + ' in ' + Math.max(1, Math.ceil(run.wait)) + 's';
      if (text !== waveLabel.textContent) waveLabel.textContent = text;
    }

    function stepWeapon(dt) {
      if (input.pressed('weapon1') && run.selected !== 0) select(0);
      else if (input.pressed('weapon2') && run.selected !== 1) select(1);
      else if (input.pressed('swap')) select(1 - run.selected);
      for (let i = 0; i < loadout.length; i++) run.charges[i] = Math.max(0, run.charges[i] - dt);
      if (input.fire && run.charges[run.selected] === 0 && run.pose < .45) fire();
      const readyIn = run.charges[run.selected];
      const readout = readyIn === 0 ? 'Ready' : run.selected === 0 ? 'Cycling' : readyIn.toFixed(1) + 's';
      if (readout !== charge.textContent) charge.textContent = readout;
      run.pose *= Math.exp(-10 * dt);
      run.recoil *= Math.exp(-14 * dt);
      const pace = Math.min(1, player.speed / 6);
      const sway = Math.sin(run.time * 12) * pace;
      const gun = loadout[run.selected].gun;
      gun.position.set(.145 + .009 * sway, -.132 - run.pose * .20 - (player.sprinting ? .06 : 0), -.44 + run.recoil);
      gun.rotation.set(-run.recoil - run.pose * .4, sway * .018, (player.sliding ? -.17 : 0) + sway * .024);
      if (run.traceLife > 0) {
        run.traceLife = Math.max(0, run.traceLife - dt);
        tracer.material.opacity = run.traceLife / .092;
        tracer.visible = run.traceLife > 0;
      }
    }

    function tick(dt) {
      run.time += dt;
      stepWeapon(dt);
      stepField(dt);
      stepPads(dt);
      for (let i = run.enemies.length - 1; i >= 0; i--) {
        const enemy = run.enemies[i];
        if (enemy.alive) {
          stepEnemy(enemy, dt);
          if (run.ended) return;
        } else {
          release(enemy);
          run.enemies.splice(i, 1);
        }
      }
      surge(dt);
      if (run.ended) return;
      crystal.rotation.y = run.time * .85;
      coreRing.rotation.y = .25 * Math.sin(run.time * 1.7);
      gates.forEach(({ rim, veil, aperture }, index) => {
        const opening = run.queue[0]?.port === index;
        const pulse = Math.sin(run.time * (opening ? 12 : 2) + index);
        rim.scale.setScalar(1 + pulse * (opening ? .09 : .026));
        veil.material.opacity = ((opening ? .24 : .055) + pulse * .038);
        aperture.rotation.y = run.time * (opening ? 2.3 : .67);
      });
    }

    const baseReset = player.reset;
    player.reset = function (point) {
      if (run) reset();
      return baseReset.call(this, game.run.mode === MODE ? start : point);
    };
    const baseWeaponUpdate = weapon.update;
    weapon.update = function (dt) {
      if (!run) return baseWeaponUpdate.call(this, dt);
      if (game.state === 'playing' && !run.ended) tick(dt);
    };
    events.on('game:state', ({ state }) => {
      if (state === 'title' && run) reset();
      if (game.run.mode !== MODE) return;
      if (state === 'playing' && !run) begin();
      if (state === 'dead' && run) showReport(state);
    });
    if (game.run.mode === MODE && game.state === 'playing') {
      baseReset.call(player, start);
      begin();
    }
  }

  boot();
})();
