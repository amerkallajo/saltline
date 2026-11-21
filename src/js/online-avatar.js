/* Saltline Terminal operator. Geometry is baked per joint and shared by the room. */
(() => {
  'use strict';

  window.SaltlineAvatars = function ({ THREE: T, scene }) {
    const { pose } = window.SaltlinePosture;
    const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
    const up = v(0, 1, 0);
    const material = (color, roughness, metalness = 0) => new T.MeshStandardMaterial({
      color, roughness, metalness, emissive: new T.Color(color).multiplyScalar(.27),
    });
    const fabric = material(0x565e50, .91);
    const trim = material(0x3a3e38, .89);
    const armor = material(0x827159, .82);
    const canvas = material(0xa89472, .94);
    const rubber = material(0x282c2d, .83);
    const alloy = material(0x3a4248, .5, .45);
    const glass = material(0x3d6563, .28, .37);
    const faceColor = material(0xb18468, .86);
    const tape = material(0xd59a5b, .64);
    const patch = material(0xd4c1a0, .87);
    const muzzleMaterial = new T.MeshBasicMaterial({ color: 0xffd18a, toneMapped: false });
    const muzzleGeometry = new T.SphereGeometry(.062, 9, 6).scale(.64, .64, 1.65);
    const shieldMaterial = new T.MeshBasicMaterial({ color: 0xa4d4bd });
    const shieldGeometry = new T.BoxGeometry(.055, .013, .009);

    function bake(make) {
      const source = [];
      const add = (geometry, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
        geometry.rotateX(rx).rotateY(ry).rotateZ(rz).translate(x, y, z);
        source.push([geometry, mat]);
      };
      const box = (mat, xyz, dims, rot = []) => add(new T.BoxGeometry(...dims), mat, ...xyz, ...rot);
      const oval = (mat, xyz, dims) => add(new T.SphereGeometry(1, 12, 8).scale(...dims), mat, ...xyz);
      const tube = (mat, xyz, a, b, length, rx = 0) => add(new T.CylinderGeometry(a, b, length, 12), mat, ...xyz, rx);
      make(box, oval, tube);
      const group = new T.Group();
      for (const mat of new Set(source.map(([, m]) => m))) {
        const points = [], normals = [];
        for (const [geo, m] of source) {
          if (m !== mat) continue;
          const flat = geo.index ? geo.toNonIndexed() : geo;
          points.push(...flat.attributes.position.array);
          normals.push(...flat.attributes.normal.array);
          flat.dispose();
          if (flat !== geo) geo.dispose();
        }
        const data = new T.BufferGeometry();
        data.setAttribute('position', new T.Float32BufferAttribute(points, 3));
        data.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
        group.add(new T.Mesh(data, mat));
      }
      return group;
    }

    const helmet = bake((box, oval, tube) => {
      oval(faceColor, [0, -.017, -.013], [.088, .10, .088]);
      oval(trim, [0, -.049, -.04], [.092, .064, .081]);
      oval(armor, [0, .037, .007], [.119, .087, .126]);
      box(trim, [0, .037, -.102], [.184, .027, .044]);
      box(rubber, [0, .001, -.107], [.173, .055, .026]);
      for (const x of [-.046, .046]) {
        box(glass, [x, .001, -.122], [.074, .04, .014], [0, x * -3, 0]);
        box(rubber, [x * 2.13, -.016, .028], [.039, .085, .068]);
        box(alloy, [x * 2.44, .040, .016], [.019, .031, .112]);
      }
      tube(trim, [0, -.116, .014], .058, .064, .092);
      box(patch, [0, .041, .125], [.076, .027, .008]);
    });

    const torso = bake((box, oval, tube) => {
      oval(fabric, [0, -.118, .014], [.224, .26, .126]);
      box(armor, [0, -.100, -.049], [.355, .341, .163]);
      box(trim, [0, -.082, -.135], [.299, .282, .026]);
      for (const side of [-1, 1]) {
        box(canvas, [side * .132, .065, -.055], [.048, .11, .16], [.26, 0, side * .16]);
        box(armor, [side * .119, -.107, -.172], [.096, .139, .061]);
        box(canvas, [side * .119, -.042, -.185], [.101, .044, .049]);
        box(rubber, [side * .119, -.111, -.205], [.014, .105, .007]);
        box(armor, [side * .18, -.177, .006], [.035, .125, .148]);
      }
      box(canvas, [0, -.145, -.17], [.119, .151, .054]);
      box(tape, [0, .002, -.151], [.124, .037, .009]);
      box(trim, [0, -.004, -.157], [.092, .012, .004]);
      box(trim, [0, -.063, .134], [.253, .248, .139]);
      box(armor, [0, -.043, .211], [.213, .176, .027]);
      box(canvas, [0, -.146, .207], [.229, .061, .036]);
      box(tape, [0, -.007, .231], [.093, .038, .008]);
      box(alloy, [.115, .102, .173], [.035, .113, .032]);
      tube(rubber, [.117, .187, .174], .007, .009, .153, -.17);
    });

    const belt = bake((box, oval) => {
      oval(fabric, [0, -.039, 0], [.168, .123, .116]);
      box(trim, [0, .015, 0], [.338, .047, .219]);
      box(alloy, [0, .015, -.115], [.059, .039, .02]);
      box(armor, [-.16, -.037, -.043], [.073, .119, .122]);
      box(rubber, [.162, -.048, .039], [.062, .124, .091]);
    });

    const upperArm = bake((box, oval) => {
      oval(fabric, [0, .47, 0], [.069, .66, .067]);
      oval(armor, [0, .18, .012], [.074, .27, .072]);
      box(tape, [0, .30, -.064], [.071, .091, .012]);
    });
    const forearm = bake((box, oval) => {
      oval(fabric, [0, .35, 0], [.057, .55, .055]);
      oval(rubber, [0, .94, 0], [.047, .19, .053]);
      box(trim, [0, .72, .013], [.091, .109, .084]);
    });
    const thigh = bake((box, oval) => {
      oval(fabric, [0, .42, 0], [.096, .64, .094]);
      box(armor, [.037, .39, .04], [.109, .255, .107]);
      box(canvas, [.034, .29, .052], [.107, .102, .112]);
    });
    const shin = bake((box, oval) => {
      oval(fabric, [0, .49, 0], [.076, .58, .073]);
      oval(trim, [0, .096, .036], [.083, .20, .066]);
      box(armor, [0, .12, .088], [.094, .128, .020]);
    });
    const boot = bake((box, oval) => {
      box(rubber, [0, -.046, -.056], [.134, .048, .253]);
      oval(trim, [0, -.006, -.060], [.065, .066, .115]);
      box(rubber, [0, .036, .022], [.114, .095, .114]);
      for (let z = -.12; z < .06; z += .035) box(armor, [0, .041, z], [.062, .008, .012]);
    });

    const guns = Object.fromEntries(['rifle', 'pistol', 'sniper'].map((id) => [id, bake((box, oval, tube) => {
      const pistol = id === 'pistol', sniper = id === 'sniper';
      box(alloy, [0, 0, -.04], [pistol ? .038 : .053, .056, pistol ? .25 : .32]);
      box(rubber, [0, -.063, .036], [.048, .103, .065], [-.26, 0, 0]);
      box(trim, [0, -.005, .015], [.037, .051, .068]);
      if (pistol) {
        box(alloy, [0, -.005, -.14], [.036, .045, .081]);
        box(canvas, [0, .035, -.15], [.015, .012, .01]);
        return;
      }
      box(sniper ? armor : trim, [0, -.008, .168], [.055, .059, .236]);
      box(rubber, [0, -.018, .29], [.068, .09, .027]);
      box(alloy, [0, .003, -.245], [.062, .054, .203]);
      tube(alloy, [0, .01, sniper ? -.476 : -.398], .016, .014, sniper ? .32 : .17, Math.PI / 2);
      box(rubber, [0, -.062, -.108], [.044, sniper ? .065 : .126, .071], [.11, 0, 0]);
      tube(rubber, [0, .066, -.01], sniper ? .036 : .024, .024, sniper ? .246 : .078, Math.PI / 2);
    })]));

    function create() {
      const group = new T.Group();
      group.name = 'online-player';
      const copy = (template) => {
        const joint = template.clone();
        group.add(joint);
        return joint;
      };
      const head = copy(helmet), chest = copy(torso), hips = copy(belt);
      const arms = [-1, 1].map(() => [copy(upperArm), copy(forearm)]);
      const legs = [-1, 1].map(() => [copy(thigh), copy(shin), copy(boot)]);
      const weapons = Object.fromEntries(Object.entries(guns).map(([id, gun]) => [id, copy(gun)]));
      const muzzle = new T.Mesh(muzzleGeometry, muzzleMaterial);
      const shield = new T.Mesh(shieldGeometry, shieldMaterial);
      shield.position.set(0, .045, -.126);
      head.add(shield);
      group.add(muzzle);
      scene.add(group);
      return { group, target: v(), head, chest, hips, arms, legs, weapons, shield, muzzle, shotAt: -Infinity, state: null };
    }

    const delta = v();
    function limb(part, start, end) {
      part.position.fromArray(start);
      delta.fromArray(end).sub(part.position);
      part.scale.y = delta.length();
      part.quaternion.setFromUnitVectors(up, delta.normalize());
    }

    function update(avatar, dt, now) {
      const { group, state, head, chest, hips, arms, legs, weapons, shield, muzzle } = avatar;
      const blend = 1 - Math.exp(-18 * dt);
      group.position.lerp(avatar.target, blend);
      const yaw = state.yaw - group.rotation.y;
      group.rotation.y += Math.atan2(Math.sin(yaw), Math.cos(yaw)) * blend;
      const elapsed = now - avatar.shotAt;
      const recoil = Math.max(0, 1 - elapsed / (state.weapon === 'sniper' ? 190 : 105));
      const body = pose(state, recoil);
      head.position.fromArray(body.head);
      head.rotation.x = state.pitch * .53;
      chest.position.fromArray(body.chest);
      chest.rotation.x = -.08 - state.speed * .013 - (1.8 - state.height) * .27;
      hips.position.fromArray(body.hips);
      for (let i = 0; i < 2; i++) {
        const [shoulder, elbow, hand] = body.arms[i];
        limb(arms[i][0], shoulder, elbow);
        limb(arms[i][1], elbow, hand);
        const [hip, knee, ankle] = body.legs[i];
        limb(legs[i][0], hip, knee);
        limb(legs[i][1], knee, ankle);
        legs[i][2].position.fromArray(ankle);
      }
      for (const [id, gun] of Object.entries(weapons)) {
        gun.visible = id === state.weapon;
        if (!gun.visible) continue;
        gun.position.fromArray(body.gun);
        gun.rotation.x = body.angle;
      }
      shield.visible = state.protected;
      muzzle.visible = elapsed < 45;
      muzzle.position.fromArray(body.muzzle);
      muzzle.rotation.x = body.angle;
    }

    return { create, update };
  };
})();
