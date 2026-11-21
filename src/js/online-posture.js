// Pose and hit volumes use the same local coordinates. Forward is negative Z.
(() => {
  'use strict';

  const sizes = { head: .121, chest: .196, hips: .153, upperArm: .068, forearm: .055, thigh: .095, shin: .076 };
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function elbow(shoulder, hand, side) {
    const [x, y, z] = hand.map((v, i) => v - shoulder[i]);
    const distance = Math.hypot(x, y, z);
    const dir = [x / distance, y / distance, z / distance];
    const pole = [side * .72, -1, .18];
    const align = pole.reduce((dot, v, i) => dot + v * dir[i], 0);
    const bend = pole.map((v, i) => v - dir[i] * align);
    const depth = Math.sqrt(Math.max(.001, .29 ** 2 - (distance * .53) ** 2)) / Math.hypot(...bend);
    return shoulder.map((v, i) => v + (hand[i] - v) * .53 + bend[i] * depth);
  }

  function pose(state, recoil = 0) {
    const crouch = clamp((1.8 - state.height) / .92, 0, 1);
    const stride = Math.min(1, state.speed / 5);
    const phase = state.stride * 5.1;
    const hurry = stride * (state.ads ? .35 : 1);
    const dip = Math.abs(Math.cos(phase)) * hurry * .038;
    const head = [state.ads ? .021 : 0, state.height - sizes.head - dip, -.10 * crouch - .075 * stride];
    const chest = [0, head[1] - .28, head[2] + .043];
    const hips = [0, chest[1] - (.38 - .14 * crouch), .04 + crouch * .14];
    const pistol = state.weapon === 'pistol';
    const ready = state.ads || recoil > .1;
    const angle = clamp(state.pitch, -1.18, 1.18) - (ready ? .02 : .24 + hurry * .15) + recoil * .11;
    const gun = [pistol ? .047 : ready ? .108 : .161, chest[1] + (ready ? .115 : .05), chest[2] - .255 + recoil * .044];
    const forward = (distance, height = 0) => [gun[0], gun[1] + Math.sin(angle) * distance + Math.cos(angle) * height, gun[2] - Math.cos(angle) * distance + Math.sin(angle) * height];
    const arms = [-1, 1].map((side) => {
      const shoulder = [side * .19, chest[1] + .105, chest[2] + .02];
      const support = side < 0;
      const hand = forward(support ? pistol ? -.005 : .19 : -.036, support && !pistol ? -.026 : -.066);
      if (support && pistol) hand[0] -= .043;
      return [shoulder, elbow(shoulder, hand, side), hand];
    });
    const legs = [-1, 1].map((side) => {
      const wave = Math.sin(phase + (side > 0 ? Math.PI : 0));
      const hip = [side * .104, hips[1] - .032, hips[2]];
      const ankle = [side * (.116 + crouch * .027), .082 + Math.max(0, -wave) * hurry * .18, wave * hurry * .38 + side * .05];
      const knee = [hip[0] * 1.13, (hip[1] + ankle[1]) / 2 + crouch * .02, (hip[2] + ankle[2]) / 2 - .045 - crouch * .22 - Math.max(0, -wave) * hurry * .12];
      return [hip, knee, ankle];
    });
    return { head, chest, hips, arms, legs, gun, angle, muzzle: forward(pistol ? .18 : state.weapon === 'sniper' ? .66 : .49, .014) };
  }

  function hitDistance(state, origin, direction, range) {
    const body = pose(state);
    const c = Math.cos(state.yaw), s = Math.sin(state.yaw);
    const local = ([x, y, z]) => [c * x - s * z, y, s * x + c * z];
    const start = local(origin.map((v, i) => v - state.pos[i]));
    const ray = local(direction);
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const subtract = (a, b) => a.map((v, i) => v - b[i]);
    let closest = range;

    function sphere(point, radius) {
      const offset = subtract(start, point);
      const b = dot(offset, ray);
      const d = dot(offset, offset) - radius * radius;
      if (d <= 0) closest = 0;
      else if (b < 0 && b * b >= d) closest = Math.min(closest, -b - Math.sqrt(b * b - d));
    }

    function capsule(a, b, radius) {
      sphere(a, radius);
      sphere(b, radius);
      const axis = subtract(b, a), offset = subtract(start, a);
      const aa = dot(axis, axis), ar = dot(axis, ray), ao = dot(axis, offset);
      const qa = aa - ar * ar, qb = aa * dot(offset, ray) - ao * ar;
      const qc = aa * (dot(offset, offset) - radius * radius) - ao * ao;
      if (qc <= 0 && ao >= 0 && ao <= aa) closest = 0;
      if (qa <= 1e-8 || qb * qb < qa * qc) return;
      const t = (-qb - Math.sqrt(qb * qb - qa * qc)) / qa;
      const axial = ao + t * ar;
      if (t >= 0 && axial >= 0 && axial <= aa) closest = Math.min(closest, t);
    }

    sphere(body.head, sizes.head);
    capsule(body.hips, body.chest, sizes.chest);
    for (const [shoulder, joint, hand] of body.arms) {
      capsule(shoulder, joint, sizes.upperArm);
      capsule(joint, hand, sizes.forearm);
    }
    for (const [hip, knee, ankle] of body.legs) {
      capsule(hip, knee, sizes.thigh);
      capsule(knee, ankle, sizes.shin);
    }
    return closest;
  }

  const posture = { pose, hitDistance, sizes };
  if (typeof module === 'object') module.exports = posture;
  else window.SaltlinePosture = posture;
})();
