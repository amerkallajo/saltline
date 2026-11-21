
/* Firefight mode: humanoid soldiers, instant respawns, kill counter, streaks, radar, health drops. */
(function () {
  'use strict';
  function boot() {
    var G = window.__G;
    if (!G || !G.game || !G.game.run || !G.player || !G.physics || !G.physics.nav || !G.enemies || G.enemies.stub || !G.combat || !window.__addon || !document.querySelector('.menu .m-pick') || !document.querySelector('.hud')) { setTimeout(boot, 250); return; }
    try { init(G); } catch (e) { console.error('[soldiers] init failed', e); }
  }

  function init(G) {
    var T = G.THREE, P = G.player, game = G.game, hud = G.hud, ev = G.events, phys = G.physics, nav = phys.nav, A = window.__addon;
    var V3 = function (x, y, z) { return new T.Vector3(x || 0, y || 0, z || 0); };
    var rnd = Math.random, clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
    var lerp = function (a, b, t) { return a + (b - a) * t; };
    var angDiff = function (a, b) { var d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
    var damp = function (a, b, k, dt) { return lerp(a, b, 1 - Math.exp(-k * dt)); };
    function snd(name, opt) { try { G.audio && G.audio.play && G.audio.play(name, opt || {}); } catch (e) {} }

    /* =========================================================== settings + title UI */
    var KEY = 'saltline.ff.v1', cfg = { count: 6 };
    try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv && Number.isFinite(sv.count)) cfg.count = clamp(Math.round(sv.count), 1, 20); } catch (e) {}
    function saveCfg() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} }
    var BEST_KEY = 'saltline.ff.best';
    function getBest() {
      var best;
      try { best = JSON.parse(localStorage.getItem(BEST_KEY)); } catch (e) {}
      if (!best || !Number.isFinite(best.kills) || !Number.isFinite(best.score)) best = { kills: 0, score: 0 };
      if (!best.setups || typeof best.setups !== 'object' || Array.isArray(best.setups)) best.setups = {};
      return best;
    }
    function setupKey() {
      return [window.__SL_NIGHT ? 'night' : 'dusk', game.difficulty, cfg.count].join('/');
    }
    function beatsBest(score, best) {
      if (!best) return score.kills > 0;
      return score.kills > best.kills || (score.kills === best.kills && score.score > best.score);
    }
    function formatKills(kills) { return kills + (kills === 1 ? ' kill' : ' kills'); }
    var pick = document.querySelector('.menu .m-pick'), note = pick.querySelector('.m-pick-note');
    var lab = document.createElement('label'); lab.className = 'x-ffr'; lab.id = 'l-ff'; lab.textContent = 'Soldiers';
    var row = document.createElement('div'); row.className = 'x-ffr slider';
    row.innerHTML = '<input type="range" min="1" max="20" step="1" aria-labelledby="l-ff"><output></output>';
    var bestEl = document.createElement('div'); bestEl.className = 'x-ffr x-ffbest';
    pick.insertBefore(lab, note); pick.insertBefore(row, note); pick.insertBefore(bestEl, note);
    var rng = row.querySelector('input'), out = row.querySelector('output');
    function showCfg() {
      rng.value = cfg.count; out.textContent = cfg.count;
      var records = getBest(), setupBest = records.setups[setupKey()], best = setupBest || records;
      bestEl.textContent = best.kills ? (setupBest ? 'Setup best · ' : 'Overall best · ') + formatKills(best.kills) + ' · ' + Math.round(best.score).toLocaleString('en-US') + ' points' : '';
    }
    rng.addEventListener('input', function () { cfg.count = clamp(+rng.value | 0, 1, 20); saveCfg(); showCfg(); });
    rng.addEventListener('keydown', function (e) { e.stopPropagation(); });
    showCfg();

    /* =========================================================== materials + geometry */
    function std(c, r, m, em) { return new T.MeshStandardMaterial({ color: c, roughness: r == null ? .8 : r, metalness: m || 0, emissive: em || 0x000000 }); }
    // a warm rim light and a little lift keep soldiers readable against bright sky and dark steel alike
    var NIGHTX = !!window.__SL_NIGHT;
    var RIM = { value: new T.Color(NIGHTX ? .62 : .42, NIGHTX ? .2 : .15, NIGHTX ? .12 : .09) }, LIFT = { value: NIGHTX ? .2 : .1 };
    function rimify(m) {
      m.onBeforeCompile = function (sh) {
        sh.uniforms.uRim = RIM; sh.uniforms.uLift = LIFT;
        sh.fragmentShader = 'uniform vec3 uRim;\nuniform float uLift;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n  { float fr = 1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0); totalEmissiveRadiance += uRim * pow(fr, 2.0) * 1.7 + diffuseColor.rgb * uLift; }');
      };
      m.customProgramCacheKey = function () { return 'sl-soldier-rim-1'; };
      return m;
    }
    var MAT = {
      cloth: [rimify(std(0x5d6450, .9)), rimify(std(0x7f7055, .9)), rimify(std(0x55606c, .9))],
      vest: rimify(std(0x3a3f33, .75)), dark: rimify(std(0x202224, .7)), helmet: rimify(std(0x4c533f, .6, .1)),
      helmetHeavy: rimify(std(0x7a2c20, .55, .15)), helmetRush: rimify(std(0x1c1e20, .5, .2)),
      gun: std(0x1a1b1d, .45, .55, 0x050505), skin: rimify(std(0x26282a, .85)),
      visor: new T.MeshBasicMaterial({ color: 0xff3a1e, toneMapped: false }), band: std(0xc02a1e, .7, 0, 0x4a0805)
    };
    var Y_UP = V3(0, 1, 0);
    function matrixFor(x, y, z, rx, ry, rz, sx, sy, sz) {
      var m = new T.Matrix4(), q = new T.Quaternion().setFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0));
      return m.compose(V3(x, y, z), q, V3(sx || 1, sy || 1, sz || 1));
    }
    function between(a, b) { // matrix that places a Y-aligned unit-length geometry from a to b
      var d = b.clone().sub(a), len = d.length(), q = new T.Quaternion().setFromUnitVectors(Y_UP, d.clone().normalize());
      return { m: new T.Matrix4().compose(a.clone().add(b).multiplyScalar(.5), q, V3(1, 1, 1)), len: len };
    }
    function ik(S, H, a, b, pole) {
      var d = H.clone().sub(S), dist = clamp(d.length(), .05, a + b - .005); d.normalize();
      var along = (a * a - b * b + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, a * a - along * along));
      var po = pole.clone().sub(d.clone().multiplyScalar(pole.dot(d))).normalize();
      return S.clone().addScaledVector(d, along).addScaledVector(po, h);
    }
    function mergeGeos(list) {
      var pos = [], nor = [];
      for (var i = 0; i < list.length; i++) {
        var g = list[i].g.index ? list[i].g.toNonIndexed() : list[i].g.clone();
        g.applyMatrix4(list[i].m);
        pos.push(g.attributes.position.array); nor.push(g.attributes.normal.array);
      }
      var n = 0; pos.forEach(function (a) { n += a.length; });
      var P1 = new Float32Array(n), N1 = new Float32Array(n), o = 0;
      for (var j = 0; j < pos.length; j++) { P1.set(pos[j], o); N1.set(nor[j], o); o += pos[j].length; }
      var out = new T.BufferGeometry(); out.setAttribute('position', new T.BufferAttribute(P1, 3)); out.setAttribute('normal', new T.BufferAttribute(N1, 3));
      out.computeBoundingSphere(); return out;
    }
    var B = {
      box: function (x, y, z) { return new T.BoxGeometry(x, y, z); },
      cap: function (r, len) { return new T.CapsuleGeometry(r, Math.max(.01, len), 3, 8); },
      sph: function (r) { return new T.SphereGeometry(r, 12, 9); },
      cyl: function (r, h) { return new T.CylinderGeometry(r, r, h, 10); }
    };

    // ---- rig recipe, merged once per (bone, material) and shared by every soldier
    var RECIPE = (function () {
      var parts = {};
      function add(bone, mat, g, m) { var k = bone + '|' + mat; (parts[k] = parts[k] || { bone: bone, mat: mat, list: [] }).list.push({ g: g, m: m }); }
      function at(bone, mat, g, x, y, z, rx, ry, rz) { add(bone, mat, g, matrixFor(x, y, z, rx, ry, rz)); }
      function limb(bone, mat, a, b, r) { var bt = between(a, b); add(bone, mat, B.cap(r, bt.len - r * .6), bt.m); }
      // hips (origin at pelvis)
      at('hips', 'cloth', B.box(.32, .17, .2), 0, 0, 0);
      at('hips', 'dark', B.box(.34, .05, .22), 0, .075, 0);
      at('hips', 'vest', B.box(.09, .1, .05), .13, -.02, .1);
      // legs (thigh origin at hip joint, shin origin at knee)
      ['L', 'R'].forEach(function (s) {
        limb('thigh' + s, 'cloth', V3(0, .02, 0), V3(0, -.43, 0), .08);
        at('thigh' + s, 'vest', B.box(.1, .12, .05), 0, -.42, .065);
        limb('shin' + s, 'cloth', V3(0, 0, 0), V3(0, -.38, 0), .066);
        at('shin' + s, 'dark', B.box(.115, .11, .26), 0, -.44, .045);
      });
      // spine (origin at waist)
      at('spine', 'cloth', B.box(.33, .44, .2), 0, .24, 0);
      at('spine', 'vest', B.box(.37, .33, .255), 0, .28, .005);
      at('spine', 'vest', B.box(.085, .095, .055), -.105, .2, .145);
      at('spine', 'vest', B.box(.085, .095, .055), 0, .2, .145);
      at('spine', 'vest', B.box(.085, .095, .055), .105, .2, .145);
      at('spine', 'dark', B.box(.27, .32, .13), 0, .31, -.18);
      at('spine', 'dark', B.cyl(.05, .1), 0, .5, 0);
      // rifle held at the shoulder (spine space)
      var R0 = V3(.1, .38, .14);
      at('spine', 'gun', B.box(.055, .085, .36), R0.x, R0.y, R0.z + .06);
      at('spine', 'gun', B.box(.062, .062, .19), R0.x, R0.y + .005, R0.z + .28);
      at('spine', 'gun', B.cyl(.014, .2), R0.x, R0.y + .015, R0.z + .46, Math.PI / 2);
      at('spine', 'gun', B.box(.036, .13, .06), R0.x, R0.y - .1, R0.z + .1, .25);
      at('spine', 'gun', B.box(.046, .1, .2), R0.x, R0.y - .01, R0.z - .2);
      at('spine', 'gun', B.box(.034, .09, .04), R0.x, R0.y - .085, R0.z - .02, -.3);
      at('spine', 'gun', B.box(.03, .04, .08), R0.x, R0.y + .066, R0.z + .04);
      // arms by IK onto the rifle
      var SR = V3(.2, .44, 0), HR = V3(.1, .29, .11), SL = V3(-.2, .44, 0), HL = V3(.1, .345, .41);
      var ER = ik(SR, HR, .27, .25, V3(1, -1, -.6)), EL = ik(SL, HL, .27, .27, V3(-.4, -1, 0));
      limb('spine', 'cloth', SR, ER, .06); limb('spine', 'cloth', ER, HR, .052);
      limb('spine', 'cloth', SL, EL, .06); limb('spine', 'cloth', EL, HL, .052);
      var bandA = SL.clone().lerp(EL, .3), bandB = SL.clone().lerp(EL, .5); limb('spine', 'band', bandA, bandB, .066);
      at('spine', 'dark', B.sph(.046), HR.x, HR.y, HR.z); at('spine', 'dark', B.sph(.046), HL.x, HL.y, HL.z);
      at('spine', 'vest', B.sph(.075), SR.x, SR.y, SR.z); at('spine', 'vest', B.sph(.075), SL.x, SL.y, SL.z);
      // head (origin at neck top)
      at('head', 'skin', B.sph(.105), 0, .11, .005);
      add('head', 'helmet', new T.SphereGeometry(.13, 14, 8, 0, Math.PI * 2, 0, Math.PI * .56), matrixFor(0, .135, -.005, 0, 0, 0, 1, .88, 1.1));
      at('head', 'helmet', B.box(.26, .025, .05), 0, .155, .11, -.2);
      at('head', 'visor', B.box(.17, .042, .05), 0, .118, .088);
      at('head', 'dark', B.box(.04, .07, .06), -.115, .1, 0);
      at('head', 'dark', B.box(.04, .07, .06), .115, .1, 0);
      var merged = [];
      for (var k in parts) merged.push({ bone: parts[k].bone, mat: parts[k].mat, geo: mergeGeos(parts[k].list) });
      return { merged: merged, muzzle: V3(R0.x, R0.y + .015, R0.z + .57) };
    })();

    var BEAM = (function () {
      if (!window.__SL_NIGHT) return null;
      var g = new T.CylinderGeometry(.03, 1.25, 8, 16, 1, true); g.translate(0, -4, 0); g.rotateX(-Math.PI / 2);
      var m = new T.ShaderMaterial({
        transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false, toneMapped: false,
        uniforms: { uCol: { value: new T.Color(1, .93, .8) } },
        vertexShader: 'varying float vT; varying vec3 vN; varying vec3 vV; void main(){ vT = uv.y; vec4 wp = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }',
        fragmentShader: 'uniform vec3 uCol; varying float vT; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(normalize(vN), vV)), 1.4); float a = .16 * edge * vT * vT; gl_FragColor = vec4(uCol * a, a); }'
      });
      return { geo: g, mat: m, dotGeo: new T.SphereGeometry(.022, 8, 6), dotMat: new T.MeshBasicMaterial({ color: 0xfff4dc, toneMapped: false }) };
    })();

    /* =========================================================== tuning */
    var DIFF = {
      standard: { hp: 100, dmg: 4, burst: [3, 5], cool: [1.3, 2.2], tokens: 2, react: .7, acc: 1.35, nade: 28 },
      hard: { hp: 110, dmg: 5, burst: [3, 5], cool: [1.1, 1.8], tokens: 2, react: .52, acc: 1.1, nade: 20 },
      brutal: { hp: 125, dmg: 7, burst: [4, 6], cool: [.8, 1.4], tokens: 3, react: .4, acc: .9, nade: 14 }
    };
    function tune() { return DIFF[game.difficulty] || DIFF.hard; }
    var RUN = 4.3, WALK = 2.3, STAND_H = 1.75, CROUCH_H = 1.2, RADIUS = .3;

    /* =========================================================== soldier factory */
    var pool = [], list = [], nextId = 1;
    function makeSoldier() {
      var s = { type: 'soldier', isSoldier: true, alive: false, active: false };
      var root = new T.Group(), body = new T.Group(), hips = new T.Group(), spine = new T.Group(), head = new T.Group();
      var bones = { hips: hips, spine: spine, head: head };
      root.add(body); body.add(hips); hips.add(spine); spine.add(head);
      spine.position.y = .07; head.position.y = .53;
      ['L', 'R'].forEach(function (sd) {
        var th = new T.Group(), sh = new T.Group();
        th.position.set(sd === 'L' ? -.1 : .1, -.04, 0); sh.position.y = -.44;
        hips.add(th); th.add(sh); bones['thigh' + sd] = th; bones['shin' + sd] = sh;
      });
      s.meshes = [];
      RECIPE.merged.forEach(function (p) {
        var mat = p.mat === 'cloth' ? MAT.cloth[0] : MAT[p.mat];
        var m = new T.Mesh(p.geo, mat); m.castShadow = p.mat !== 'visor'; m.receiveShadow = false; m.userData.part = p.mat;
        bones[p.bone].add(m); s.meshes.push(m);
      });
      var muzzle = new T.Object3D(); muzzle.position.copy(RECIPE.muzzle); spine.add(muzzle);
      if (window.__SL_NIGHT) { var beam = new T.Mesh(BEAM.geo, BEAM.mat); beam.position.copy(RECIPE.muzzle); beam.position.y += .03; beam.frustumCulled = false; beam.renderOrder = 6; spine.add(beam); var dot = new T.Mesh(BEAM.dotGeo, BEAM.dotMat); dot.position.copy(beam.position); spine.add(dot); }
      root.visible = false; G.scene.add(root);
      s.root = root; s.body = body; s.bones = bones; s.muzzleObj = muzzle;
      s.pos = V3(); s.vel = V3(); s.lastKnown = V3(); s.goal = V3(); s.headW = V3(); s.muzzle = V3(); s.flank = V3(); s.prevPos = V3(); s.deathDir = V3();
      s.damage = function (amount, point, dir, part, src) { return hurt(s, amount, point, dir, part, src); };
      return s;
    }
    var KIND = {
      rifle: { hp: 1, speed: 1, scale: 1, dmg: 1, rate: .11, name: 'Soldier', pts: 100, helmet: 'helmet' },
      heavy: { hp: 2.1, speed: .7, scale: 1.08, dmg: .8, rate: .085, burst: [7, 11], name: 'Heavy', pts: 150, helmet: 'helmetHeavy' },
      rusher: { hp: .8, speed: 1.28, scale: .97, dmg: 1.2, rate: .13, burst: [2, 4], name: 'Rusher', pts: 120, helmet: 'helmetRush' }
    };
    function dress(s) {
      var c = s.kind === 'rusher' ? MAT.cloth[1] : s.kind === 'heavy' ? MAT.cloth[0] : MAT.cloth[(rnd() * MAT.cloth.length) | 0];
      var h = MAT[KIND[s.kind].helmet];
      s.meshes.forEach(function (m) { if (m.userData.part === 'cloth') m.material = c; else if (m.userData.part === 'helmet' || m.userData.part === 'helmetHeavy' || m.userData.part === 'helmetRush') m.material = h; });
    }
    function activate(s, pos) {
      var D = tune();
      var kr = rnd(); s.kind = kr < .17 ? 'heavy' : kr < .37 ? 'rusher' : 'rifle'; s.K = KIND[s.kind];
      s.id = nextId++; s.alive = true; s.active = true; s.hp = s.maxHp = Math.round(D.hp * s.K.hp);
      s.pos.copy(pos); s.vel.set(0, 0, 0); s.prevPos.copy(pos); s.onGround = true;
      s.yaw = Math.atan2(P.pos.x - pos.x, P.pos.z - pos.z) + (rnd() - .5); s.aimPitch = 0; s.headYaw = 0;
      s.state = 'hunt'; s.canSee = false; s.seeT = 0; s.reactT = D.react; s.lastSeenAt = -99; s.thinkT = rnd() * .2;
      s.tac = 'strafe'; s.tacT = 0; s.strafeDir = rnd() < .5 ? -1 : 1; s.crouch = false; s.crouchK = 0;
      s.path = null; s.pathI = 0; s.replanT = 0; s.stuckT = 0;
      s.burst = 0; s.shotT = 0; s.coolT = 1 + rnd() * 1.5; s.hasToken = false; s.firedAt = -99;
      s.nadeT = 8 + rnd() * 10; s.fleeT = 0; s.wanderT = 0; s.stuckN = 0; s.flinch = 0; s.phase = rnd() * 6; s.stepPh = 0;
      s.speedMul = (.9 + rnd() * .22) * s.K.speed; s.root.scale.setScalar(s.K.scale); s.flank.set((rnd() - .5) * 14, 0, (rnd() - .5) * 14); s.flankT = 4 + rnd() * 4;
      s.dyingT = 0; s.sinkT = 0;
      s.root.visible = true; s.root.position.copy(pos); s.root.rotation.set(0, s.yaw, 0);
      s.body.rotation.set(0, 0, 0); s.body.position.set(0, 0, 0);
      dress(s);
      list.push(s);
      return s;
    }
    function release(s) {
      s.active = false; s.alive = false; s.root.visible = false;
      var i = list.indexOf(s); if (i >= 0) list.splice(i, 1);
      if (s.hasToken) { s.hasToken = false; tokens--; }
      pool.push(s);
    }
    function obtain() { return pool.pop() || makeSoldier(); }

    /* =========================================================== spawning */
    var spawnPts = [];
    (function () {
      var L = G.level || {};
      (L.enemySpawns || []).forEach(function (sp) { if (sp.type !== 'air' && sp.pos.y < .5) spawnPts.push(sp.pos.clone()); });
      (L.coverPoints || []).forEach(function (c) { if ((c.y || 0) < .5) spawnPts.push(V3(c.x, 0, c.z)); });
      if (!spawnPts.length) for (var i = 0; i < 12; i++) spawnPts.push(V3((rnd() - .5) * 60, 0, (rnd() - .5) * 50));
    })();
    var usedAt = new Map(), tmpA = V3(), tmpB = V3(), tmpC = V3();
    function pickSpawn() {
      var best = null, bestScore = -1e9, now = clock;
      for (var i = 0; i < spawnPts.length; i++) {
        var p = spawnPts[i], d = Math.hypot(p.x - P.pos.x, p.z - P.pos.z), sc = rnd() * 2;
        sc += d < 18 ? -12 + d * .3 : d < 45 ? 4 : 4 - (d - 45) * .15;
        tmpA.set(p.x, 1.5, p.z); var vis = true; try { vis = phys.lineOfSight(tmpA, P.eye); } catch (e) {}
        if (!vis) sc += 5; else if (d < 30) sc -= 6;
        for (var j = 0; j < list.length; j++) if (list[j].alive && list[j].pos.distanceTo(p) < 3) sc -= 4;
        var u = usedAt.get(p); if (u !== undefined && now - u < 5) sc -= 5;
        if (sc > bestScore) { bestScore = sc; best = p; }
      }
      usedAt.set(best, now);
      var out = best.clone();
      try { for (var tr = 0; tr < 6; tr++) { var rp = nav.randomPoint(best, 2.2 + tr); if (rp && nav.isWalkable(rp.x, rp.z)) { out.x = rp.x; out.z = rp.z; break; } } } catch (e) {}
      out.y = 0;
      try { var gh = phys.groundHeight ? phys.groundHeight(out.x, out.z, .6) : 0; if (Number.isFinite(gh) && gh < .6) out.y = Math.max(0, gh); } catch (e) {}
      return out;
    }
    var pending = [];
    function spawnOne() { var s = obtain(); activate(s, pickSpawn()); }

    /* =========================================================== hit detection */
    function raySphere(o, d, c, r, maxD) {
      var ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z, b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r, h = b * b - cc;
      if (h < 0) return -1; var t = -b - Math.sqrt(h); return t >= 0 && t <= maxD ? t : -1;
    }
    function rayCyl(o, d, cx, cz, r, y0, y1, maxD) {
      var ox = o.x - cx, oz = o.z - cz, a = d.x * d.x + d.z * d.z;
      if (a < 1e-8) return -1;
      var b = ox * d.x + oz * d.z, c = ox * ox + oz * oz - r * r, h = b * b - a * c;
      if (h < 0) return -1;
      var t = (-b - Math.sqrt(h)) / a; if (t < 0 || t > maxD) return -1;
      var y = o.y + d.y * t; return y >= y0 && y <= y1 ? t : -1;
    }
    function rayHit(o, d, maxD) {
      var best = null;
      for (var i = 0; i < list.length; i++) {
        var s = list[i]; if (!s.alive) continue;
        var cx = s.pos.x - o.x, cy = s.pos.y + .9 - o.y, cz = s.pos.z - o.z, t = cx * d.x + cy * d.y + cz * d.z;
        if (t < -1 || t > maxD + 1 || cx * cx + cy * cy + cz * cz - t * t > 1.6) continue;
        var lim = best ? best.dist : maxD;
        var th = raySphere(o, d, s.headW, .15, lim);
        var top = s.pos.y + lerp(1.5, 1.08, s.crouchK);
        var tb = rayCyl(o, d, s.pos.x + Math.sin(s.yaw) * .04, s.pos.z + Math.cos(s.yaw) * .04, .27, s.pos.y + .05, top, lim);
        var t2 = -1, part = 'body';
        if (th >= 0 && (tb < 0 || th <= tb + .05)) { t2 = th; part = 'weak'; } else if (tb >= 0) t2 = tb;
        if (t2 < 0) continue;
        var pt = o.clone().addScaledVector(d, t2);
        var nrm = part === 'weak' ? pt.clone().sub(s.headW).normalize() : V3(pt.x - s.pos.x, 0, pt.z - s.pos.z).normalize();
        best = { dist: t2, point: pt, normal: nrm, enemy: s, part: part };
      }
      return best;
    }
    var origRaycast = G.enemies.raycast.bind(G.enemies);
    G.enemies.raycast = function (o, d, r) {
      if (r == null) r = 300;
      var a = origRaycast(o, d, r);
      if (!list.length) return a;
      var b = rayHit(o, d, a ? a.dist : r);
      return b || a;
    };
    var origExplode = G.combat.explode.bind(G.combat);
    G.combat.explode = function (pos, r, dmg, src) {
      if (r == null) r = 5; if (dmg == null) dmg = 80; if (src == null) src = 'player';
      origExplode(pos, r, dmg, src);
      for (var i = list.length - 1; i >= 0; i--) {
        var s = list[i]; if (!s.alive) continue;
        tmpA.set(s.pos.x, s.pos.y + 1, s.pos.z);
        var d = tmpA.distanceTo(pos); if (d >= r) continue;
        var los = true; try { los = phys.lineOfSight(pos, tmpA); } catch (e) {}
        if (!los) continue;
        hurt(s, dmg * (1 - d / r) * 1.25, tmpA.clone(), tmpA.clone().sub(pos).normalize(), 'blast', src);
      }
    };

    /* =========================================================== stats + feedback */
    var run = null;
    function newRun() { return { setup: setupKey(), kills: 0, heads: 0, score: 0, multi: 0, multiBest: 0, multiT: 0, streakMark: 0, uavT: 0, t: 0, nadeKills: 0, strikes: 0, strikeMark: 0, odT: 0, knives: 0 }; }
    function recordRun() {
      if (run.record) return run.record;
      var records = getBest(), score = { kills: run.kills, score: run.score };
      var setup = run.setup, setupRecord = setup && beatsBest(score, records.setups[setup]);
      var overallRecord = beatsBest(score, records);
      if (setupRecord) records.setups[setup] = score;
      if (overallRecord) {
        records.kills = score.kills;
        records.score = score.score;
      }
      if (setupRecord || overallRecord) {
        try { localStorage.setItem(BEST_KEY, JSON.stringify(records)); } catch (e) {}
      }
      var best = setup ? records.setups[setup] : records;
      run.record = { kills: best ? best.kills : 0, isNew: setup ? setupRecord : overallRecord };
      return run.record;
    }
    function credit(src) { return !(src === 'enemy' || src === 'enemy-grenade'); }
    function hurt(s, amount, point, dir, part, src) {
      if (!s.alive) return false;
      s.hp -= amount; s.flinch = Math.min(1, s.flinch + .5 + amount / 60);
      s.lastKnown.copy(P.pos); s.lastSeenAt = clock; if (s.state !== 'fight') s.state = 'search';
      s.seeT = Math.max(s.seeT, s.reactT * .6);
      try { if (point && G.fx && G.fx.smoke) G.fx.smoke(point, { size: .22, life: .45, rise: .3, count: 1, color: 0x3a3430 }); } catch (e) {}
      if (s.hp > 0) return false;
      die(s, dir, part, src);
      return true;
    }
    function die(s, dir, part, src) {
      s.alive = false; s.dyingT = 0;
      if (s.hasToken) { s.hasToken = false; tokens--; }
      var fwdX = Math.sin(s.yaw), fwdZ = Math.cos(s.yaw);
      var fx = dir ? dir.x : -fwdX, fz = dir ? dir.z : -fwdZ;
      s.fallSign = (fx * fwdX + fz * fwdZ) > 0 ? 1 : -1; // shot from behind → fall forward
      s.fallTwist = (rnd() - .5) * .8;
      snd('weapon_holster', { pos: s.pos.clone(), gain: .7, pitch: .8 });
      setTimeout(function () { snd('land', { pos: s.pos.clone(), gain: .8, pitch: .85 }); }, 420);
      if (G.fx && G.fx.dust) try { G.fx.dust(s.pos.clone(), { count: 6 }); } catch (e) {}
      var head = part === 'weak', byPlayer = credit(src);
      if (active && run) {
        if (byPlayer) {
          run.kills++; if (head) run.heads++;
          if (src === 'grenade') run.nadeKills++;
          var pts = s.K.pts + (head ? 50 : 0) + (src === 'grenade' || src === 'knife' ? 50 : 0);
          if (src === 'knife') run.knives = (run.knives || 0) + 1;
          run.multi = run.multiT > 0 ? run.multi + 1 : 1; run.multiT = 2.6;
          run.multiBest = Math.max(run.multiBest, run.multi);
          if (run.multi >= 2) pts += 50 * Math.min(run.multi - 1, 4);
          run.score += pts;
          pop('+' + pts, false); if (head) pop('HEADSHOT', true); if (src === 'grenade') pop('GRENADE KILL', true); if (src === 'knife') pop('KNIFE KILL', true); if (src === 'airstrike') pop('AIRSTRIKE', true); if (s.kind === 'heavy') pop('HEAVY DOWN', true);
          if (run.multi === 2) banner('Double kill', '+50');
          else if (run.multi === 3) banner('Triple kill', '+100');
          else if (run.multi === 4 || run.multi === 6 || run.multi === 8 || (run.multi >= 10 && run.multi % 5 === 0)) banner(run.multi >= 6 ? 'Massacre ×' + run.multi : 'Multi kill', '+' + 50 * Math.min(run.multi - 1, 4));
          var milestones = { 5: 'Killing spree', 10: 'Rampage', 15: 'Dominating', 20: 'Unstoppable', 30: 'Godlike', 50: 'Legendary' };
          if (milestones[run.kills] && run.multi < 2) banner(milestones[run.kills], run.kills + ' kills');
          if (run.kills - run.streakMark >= 4) { run.streakMark = run.kills; run.uavT = 20; setTimeout(function () { banner('UAV online', 'Every hostile on your radar for 20 seconds', 'uav'); }, run.multi >= 2 ? 1300 : 0); }
          if (run.kills - (run.strikeMark || 0) >= 8) { run.strikeMark = run.kills; run.strikes = (run.strikes || 0) + 1; setTimeout(function () { banner('Airstrike ready', (G.input.touch ? 'Tap STRIKE' : 'Press B') + ' to drop it on your crosshair', 'strike'); snd('objective', { gain: .7 }); }, 900); }
          if (src !== undefined && src !== 'player') try { hud.hitmarker && hud.hitmarker('kill'); } catch (e) {}
          try { hud.feed && hud.feed('<b>' + s.K.name + '</b> down' + (head ? '<em>Headshot</em>' : src === 'grenade' ? '<em>Grenade</em>' : src === 'knife' ? '<em>Knife</em>' : src === 'airstrike' ? '<em>Airstrike</em>' : '')); } catch (e) {}
          try { if (G.combat.stats) G.combat.stats.kills++; } catch (e) {}
          updKC(true);
        } else {
          try { hud.feed && hud.feed('<b>Soldier</b> caught in his own blast'); } catch (e) {}
        }
        var dr = rnd(); if (dr < .27) dropMedkit(s.pos); else if (dr < .37 || (s.kind === 'heavy' && dr < .6)) dropOverdrive(s.pos);
        pending.push(.6 + rnd() * .5); // replacement arrives right away
      }
      return true;
    }

    /* =========================================================== AI */
    var tokens = 0, clock = 0, active = false, nadeGlobalT = 6, engagedAt = -99, whizAt = -9;
    var nadeWarn = null;
    function setTokenCap() { return tune().tokens; }
    function eyePos(s, out) { return out.set(s.pos.x, s.pos.y + lerp(1.6, 1.12, s.crouchK), s.pos.z); }
    function planTo(s, goal) {
      s.goal.copy(goal); s.path = null; s.pathI = 0;
      try { s.path = nav.findPath(s.pos, goal); } catch (e) { s.path = null; }
    }
    function steer(s, out) { // direction toward next waypoint (or goal)
      var tgt = s.goal;
      if (s.path && s.path.length) {
        while (s.pathI < s.path.length - 1 && Math.hypot(s.path[s.pathI].x - s.pos.x, s.path[s.pathI].z - s.pos.z) < 1.1) s.pathI++;
        tgt = s.path[Math.min(s.pathI, s.path.length - 1)];
      }
      out.set(tgt.x - s.pos.x, 0, tgt.z - s.pos.z);
      var l = out.length(); if (l > 1e-4) out.multiplyScalar(1 / l);
      // report the distance left to the end of the route, not to the next corner
      var fin = s.path && s.path.length ? s.path[s.path.length - 1] : s.goal;
      return Math.max(l, Math.hypot(fin.x - s.pos.x, fin.z - s.pos.z));
    }
    function walkable(x, z) { try { return nav.isWalkable(x, z); } catch (e) { return true; } }
    function nearestDanger(s) {
      var best = null, bd = 6;
      for (var i = 0; i < A.nades.length; i++) { var n = A.nades[i], d = n.pos.distanceTo(s.pos); if (d < bd && n.fuse - n.t < 2) { bd = d; best = n; } }
      return best;
    }
    function throwAt(s, target) {
      eyePos(s, tmpA); tmpA.y += .1;
      var dx = target.x - tmpA.x, dz = target.z - tmpA.z, dist = Math.hypot(dx, dz), Tt = clamp(dist / 13, .7, 1.5), g = A.NADE.g;
      var vel = V3(dx / Tt, ((target.y + .1) - tmpA.y + .5 * g * Tt * Tt) / Tt, dz / Tt);
      A.throwNade({ pos: tmpA.clone(), vel: vel, owner: 'enemy', fuse: Tt + .9 + rnd() * .4 });
      s.nadeT = tune().nade + rnd() * 10; nadeGlobalT = 7 + rnd() * 5; s.flinch = .3;
    }
    var dirV = V3(), want = V3(), aim = V3(), endP = V3();
    function think(s) {
      eyePos(s, tmpA);
      var d = Math.hypot(P.pos.x - s.pos.x, P.pos.z - s.pos.z), see = false;
      var sightMax = window.__slSight ? window.__slSight() : 80; if (s.state === 'fight' && clock - s.lastSeenAt < 1.5) sightMax = Math.max(sightMax, 45);
      if (P.alive && d < sightMax) { try { see = phys.lineOfSight(tmpA, P.eye); } catch (e) {} }
      if (see && d > 14 && s.state === 'hunt') { // facing check while unaware
        var yawTo = Math.atan2(P.pos.x - s.pos.x, P.pos.z - s.pos.z);
        if (Math.abs(angDiff(yawTo, s.yaw)) > 1.9 && d > 22) see = false;
      }
      if (see) {
        if (!s.canSee) { s.seeT = 0; s.reactT = tune().react * (.75 + rnd() * .6) * (s.state === 'fight' ? .6 : 1); }
        s.state = 'fight'; s.lastKnown.copy(P.pos); s.lastSeenAt = clock; engagedAt = clock;
      } else if (s.state === 'fight') { s.state = 'search'; }
      if (s.state === 'search' && clock - s.lastSeenAt > 5) s.state = 'hunt';
      s.canSee = see; s.dist = d;
    }
    function shoot(s, D) {
      eyePos(s, tmpB);
      s.muzzleObj.getWorldPosition(s.muzzle);
      if (s.muzzle.distanceTo(tmpB) > 1.5) s.muzzle.copy(tmpB);
      aim.set(P.pos.x, P.pos.y + (P.crouching ? .78 : 1.12), P.pos.z).sub(s.muzzle);
      var dist = aim.length(); aim.multiplyScalar(1 / dist);
      var moving = Math.hypot(s.vel.x, s.vel.z) > 1;
      var spread = (.042 + dist * .0014) * D.acc * (s.kind === 'rusher' ? (dist > 12 ? 1.6 : .85) : s.kind === 'heavy' ? 1.15 : 1) * (1 + P.speed * .09) * (moving ? 1.35 : 1) * lerp(1.9, 1, clamp(s.seeT / 2.2, 0, 1)) * (P.sliding ? 1.5 : 1) * (s.flinch > .3 ? 1.6 : 1);
      aim.x += (rnd() - .5) * 2 * spread; aim.y += (rnd() - .5) * 2 * spread * .7; aim.z += (rnd() - .5) * 2 * spread; aim.normalize();
      var hitP = false, wall = null;
      try { wall = phys.raycast(s.muzzle, aim, 160); } catch (e) {}
      try { hitP = G.combat.enemyShot(s.muzzle.clone(), aim.clone(), { damage: D.dmg * s.K.dmg, range: 160 }); } catch (e) {}
      var L = hitP ? dist : wall ? wall.dist : 90;
      endP.copy(s.muzzle).addScaledVector(aim, L);
      try { G.fx.tracer(s.muzzle, endP, { color: 0xffc070, speed: 230, width: .03 }); } catch (e) {}
      try { G.fx.muzzleFlash(s.muzzle, aim, { scale: .95 }); } catch (e) {}
      try { G.render.lightPool.flash(s.muzzle, 0xffc070, 24, 7, .05); } catch (e) {}
      if (!hitP) { // near miss: let the player hear it go past
        var tt = (P.eye.x - s.muzzle.x) * aim.x + (P.eye.y - s.muzzle.y) * aim.y + (P.eye.z - s.muzzle.z) * aim.z;
        if (tt > 0 && tt < L && clock - whizAt > .14) {
          tmpB.copy(s.muzzle).addScaledVector(aim, tt);
          if (tmpB.distanceTo(P.eye) < 1.7) { whizAt = clock; snd('whiz', { pos: tmpB.clone(), gain: .9, jitter: .1 }); }
        }
      }
      try { ev.emit('enemy:fire', { pos: s.muzzle.clone(), dir: aim.clone(), type: 'hound' }); } catch (e) {}
      s.firedAt = clock; s.flinch = Math.min(1, s.flinch + .05);
    }

    function updateSoldier(s, dt) {
      var D = tune();
      if (!s.alive) { animateDeath(s, dt); return; }
      s.thinkT -= dt; if (s.thinkT <= 0) { s.thinkT = .16 + rnd() * .1; think(s); }
      s.flinch = Math.max(0, s.flinch - dt * 2.5);
      var spd = 0, faceYaw = null, crouch = false;
      want.set(0, 0, 0);
      var danger = nearestDanger(s);
      if (danger) {
        dirV.set(s.pos.x - danger.pos.x, 0, s.pos.z - danger.pos.z).normalize();
        if (!walkable(s.pos.x + dirV.x, s.pos.z + dirV.z)) dirV.set(-dirV.z, 0, dirV.x);
        want.copy(dirV); spd = RUN * 1.05; s.fleeT = .6;
      } else if (s.fleeT > 0) { s.fleeT -= dt; want.copy(dirV); spd = RUN; }
      else if (s.state === 'fight' && P.alive) {
        var d = s.dist || 20;
        s.tacT -= dt;
        if (s.tacT <= 0) {
          var r = rnd(); s.tacT = 1 + rnd() * 1.8;
          if (s.kind === 'rusher') s.tac = d > 6 ? (r < .8 ? 'push' : 'strafe') : 'strafe';
          else if (s.kind === 'heavy') s.tac = d > 30 ? 'push' : r < .55 ? 'hold' : 'strafe';
          else if (d > 24) s.tac = r < .6 ? 'push' : 'strafe';
          else if (d < 10) s.tac = r < .6 ? 'back' : 'strafe';
          else s.tac = r < .5 ? 'strafe' : r < .82 ? 'hold' : 'push';
          if (rnd() < .45) s.strafeDir *= -1;
          s.crouchPick = s.tac === 'hold' && rnd() < .55;
        }
        tmpC.set(P.pos.x - s.pos.x, 0, P.pos.z - s.pos.z).normalize();
        if (s.tac === 'push') { if (s.replanT <= 0) { planTo(s, P.pos); s.replanT = 1; } steer(s, want); spd = s.kind === 'rusher' ? RUN * 1.05 : d > 18 ? RUN * .8 : WALK * 1.15; }
        else if (s.tac === 'back') { want.copy(tmpC).negate(); spd = WALK; }
        else if (s.tac === 'strafe') { want.set(-tmpC.z * s.strafeDir, 0, tmpC.x * s.strafeDir); spd = WALK; }
        else { crouch = s.crouchPick; }
        if (spd > 0 && s.tac !== 'push' && !walkable(s.pos.x + want.x * .9, s.pos.z + want.z * .9)) {
          if (s.tac === 'strafe') { s.strafeDir *= -1; want.negate(); if (!walkable(s.pos.x + want.x * .9, s.pos.z + want.z * .9)) spd = 0; } else spd = 0;
        }
        faceYaw = Math.atan2(P.pos.x - s.pos.x, P.pos.z - s.pos.z);
        // shooting
        s.seeT += dt;
        if (s.burst > 0) {
          s.shotT -= dt;
          if (s.shotT <= 0) { s.shotT = s.K.rate + rnd() * .03; s.burst--; shoot(s, D); if (s.burst <= 0) { s.coolT = lerp(D.cool[0], D.cool[1], rnd()); if (s.hasToken) { s.hasToken = false; tokens--; } } }
        } else {
          s.coolT -= dt;
          var aligned = Math.abs(angDiff(faceYaw, s.yaw)) < .3;
          var inRange = d < (s.kind === 'rusher' ? 24 : 58);
          if (inRange && s.coolT <= 0 && s.seeT > s.reactT && aligned && tokens < setTokenCap()) {
            s.hasToken = true; tokens++;
            var BR = s.K.burst || D.burst; s.burst = BR[0] + ((rnd() * (BR[1] - BR[0] + 1)) | 0); s.shotT = 0;
          }
        }
      } else if (s.wanderT > 0) { s.wanderT -= dt; steer(s, want); spd = RUN * .8;
      } else if (s.state === 'search') {
        if (s.replanT <= 0) { planTo(s, s.lastKnown); s.replanT = 1.2; }
        var rem = steer(s, want); spd = rem > 1.2 ? RUN * .85 : 0;
        if (rem <= 1.2) s.lastSeenAt = Math.min(s.lastSeenAt, clock - 4);
        // grenade the last known spot when the player ducks out of sight
        var dl = Math.hypot(s.lastKnown.x - s.pos.x, s.lastKnown.z - s.pos.z);
        s.nadeT -= dt;
        if (s.nadeT <= 0 && nadeGlobalT <= 0 && clock - s.lastSeenAt > .8 && clock - s.lastSeenAt < 4 && dl > 7 && dl < 24 && P.alive) throwAt(s, s.lastKnown);
      } else { // hunt: everyone knows roughly where the player is
        s.flankT -= dt; if (s.flankT <= 0) { s.flankT = 4 + rnd() * 4; s.flank.set((rnd() - .5) * 14, 0, (rnd() - .5) * 14); }
        if (s.replanT <= 0) { tmpB.copy(P.pos).add(s.flank); if (!walkable(tmpB.x, tmpB.z)) tmpB.copy(P.pos); planTo(s, tmpB); s.replanT = 1.4 + rnd() * .8; }
        var rem2 = steer(s, want); spd = rem2 > 1 ? RUN : 0; if (rem2 <= 1.5) { s.flankT = 0; s.replanT = 0; }
      }
      s.replanT -= dt;
      if (s.state !== 'fight' && s.burst > 0) { s.burst = 0; if (s.hasToken) { s.hasToken = false; tokens--; } }
      // separation
      for (var i = 0; i < list.length; i++) {
        var o = list[i]; if (o === s || !o.alive) continue;
        var sx = s.pos.x - o.pos.x, sz = s.pos.z - o.pos.z, dd = sx * sx + sz * sz;
        if (dd < 1.4 && dd > 1e-4) { var k = (1.4 - dd) * 1.6 / Math.sqrt(dd); want.x += sx * k; want.z += sz * k; if (spd < 1) spd = 1.2; }
      }
      var wl = Math.hypot(want.x, want.z); if (wl > 1e-4) { want.x /= wl; want.z /= wl; }
      spd *= s.speedMul * (s.flinch > .5 ? .5 : 1) * (crouch ? 0 : 1);
      // movement with the level's own capsule collision
      s.vel.x = damp(s.vel.x, want.x * spd, 10, dt); s.vel.z = damp(s.vel.z, want.z * spd, 10, dt);
      s.vel.y -= 21 * dt; if (s.vel.y < -30) s.vel.y = -30;
      s.prevPos.copy(s.pos);
      var res = null; try { res = phys.moveCapsule(s.pos, s.vel, dt, RADIUS, crouch ? CROUCH_H : STAND_H, s.onGround) || {}; } catch (e) { res = {}; s.pos.addScaledVector(s.vel, dt); }
      s.onGround = !!res.onGround; if (s.onGround && s.vel.y < 0) s.vel.y = 0;
      var bd = phys.bounds; if (bd) { s.pos.x = clamp(s.pos.x, bd.min.x + .5, bd.max.x - .5); s.pos.z = clamp(s.pos.z, bd.min.z + .5, bd.max.z - .5); }
      var moved = Math.hypot(s.pos.x - s.prevPos.x, s.pos.z - s.prevPos.z) / Math.max(dt, 1e-4);
      if (spd > 1 && moved < spd * .25) {
        s.stuckT += dt;
        if (s.stuckT > .6) {
          s.stuckT = 0; s.stuckN = (s.stuckN || 0) + 1; s.replanT = 0; s.strafeDir *= -1; s.flank.set((rnd() - .5) * 16, 0, (rnd() - .5) * 16); s.tacT = 0;
          if (s.stuckN >= 2) { // still wedged: walk somewhere else for a moment
            var wp = null; try { wp = nav.randomPoint(s.pos, 7); } catch (e) {}
            if (wp) { planTo(s, wp); s.wanderT = 1.6; s.replanT = 1.6; }
            if (s.stuckN >= 5) { var np = null; try { np = nav.randomPoint(s.pos, 1.5); } catch (e) {} if (np) { s.pos.x = np.x; s.pos.z = np.z; } s.stuckN = 0; }
          }
        }
      } else { s.stuckT = 0; if (moved > 1) s.stuckN = Math.max(0, (s.stuckN || 0) - dt * .5); }
      if (s.pos.y < -2.5 || s.pos.y > 1.6) { release(s); pending.push(.3); return; } // fell in the sea or ended up on a roof: replace him
      // facing
      if (faceYaw == null) { if (moved > .5) faceYaw = Math.atan2(s.vel.x, s.vel.z); else faceYaw = s.yaw; }
      s.yaw += clamp(angDiff(faceYaw, s.yaw), -7 * dt, 7 * dt);
      s.crouchK = damp(s.crouchK, crouch ? 1 : 0, 9, dt);
      s.moveSpeed = moved;
      animate(s, dt);
    }

    /* =========================================================== animation */
    function animate(s, dt) {
      var b = s.bones, sp = Math.min(s.moveSpeed, 6);
      s.root.position.copy(s.pos); s.root.rotation.y = s.yaw;
      var fX = Math.sin(s.yaw), fZ = Math.cos(s.yaw), rX = -fZ, rZ = fX;
      var vf = sp > .05 ? (s.vel.x * fX + s.vel.z * fZ) / Math.max(.5, Math.hypot(s.vel.x, s.vel.z)) : 0;
      var vs = sp > .05 ? (s.vel.x * rX + s.vel.z * rZ) / Math.max(.5, Math.hypot(s.vel.x, s.vel.z)) : 0;
      var prev = s.phase;
      s.phase += sp / 1.45 * Math.PI * 2 * dt * .5;
      var amp = clamp(sp / 4.5, 0, 1) * .62, ph = s.phase, ck = s.crouchK;
      var swL = Math.sin(ph), swR = Math.sin(ph + Math.PI);
      b.thighL.rotation.x = -swL * amp * vf + ck * -1.25; b.thighR.rotation.x = -swR * amp * vf + ck * -1.05;
      b.thighL.rotation.z = -swL * amp * vs * .55 - ck * .12; b.thighR.rotation.z = -swR * amp * vs * .55 + ck * .12;
      b.shinL.rotation.x = (.12 + Math.max(0, -Math.cos(ph)) * .95) * amp * 1.4 + ck * 1.95;
      b.shinR.rotation.x = (.12 + Math.max(0, -Math.cos(ph + Math.PI)) * .95) * amp * 1.4 + ck * 1.35;
      var bob = Math.abs(Math.cos(ph)) * .04 * amp;
      b.hips.position.y = lerp(.95, .58, ck) - bob + (amp > .01 ? .02 : 0);
      b.hips.rotation.y = Math.sin(ph) * .12 * amp;
      // aim pitch toward the player while fighting
      var tp = 0;
      if (s.state === 'fight' && P.alive) { var dy = (P.pos.y + 1.1) - (s.pos.y + lerp(1.45, 1.0, ck)); tp = Math.atan2(dy, Math.max(1, s.dist || 10)); }
      s.aimPitch = damp(s.aimPitch, tp, 8, dt);
      var run = s.state !== 'fight' && sp > 3;
      b.spine.rotation.x = -s.aimPitch * .9 + (run ? .22 : .06) + ck * .18 - s.flinch * .3;
      b.spine.rotation.y = -Math.sin(ph) * .1 * amp + (run ? -.35 : 0);
      b.spine.rotation.z = s.flinch * Math.sin(clock * 30) * .06;
      b.head.rotation.x = (run ? -.2 : 0) - s.aimPitch * .1; b.head.rotation.y = run ? .3 : 0;
      b.head.getWorldPosition(s.headW); s.headW.y += .12;
      // footsteps
      if (amp > .15 && Math.floor(prev / Math.PI) !== Math.floor(s.phase / Math.PI)) {
        var dd = s.pos.distanceTo(P.pos);
        if (dd < 30) snd('step_concrete', { pos: s.pos.clone(), gain: clamp(.6 - dd / 60, .1, .55), jitter: .08, pitch: .9 + rnd() * .15 });
      }
    }
    function animateDeath(s, dt) {
      s.dyingT += dt;
      var k = clamp(s.dyingT / .6, 0, 1), e = k * k * (3 - 2 * k), b = s.bones;
      s.body.rotation.x = s.fallSign * e * 1.5; s.body.rotation.z = s.fallTwist * e;
      s.body.position.y = -e * .05;
      var kb = clamp(s.dyingT / .3, 0, 1);
      b.thighL.rotation.x = lerp(b.thighL.rotation.x, -.4 * s.fallSign, kb * .2); b.thighR.rotation.x = lerp(b.thighR.rotation.x, .1, kb * .2);
      b.shinL.rotation.x = lerp(b.shinL.rotation.x, .6, kb * .2); b.shinR.rotation.x = lerp(b.shinR.rotation.x, .3, kb * .2);
      b.spine.rotation.x = lerp(b.spine.rotation.x, -.2 * s.fallSign, .1); b.head.rotation.x = lerp(b.head.rotation.x, -.4 * s.fallSign, .1);
      b.hips.position.y = lerp(b.hips.position.y, .9, .1);
      if (s.dyingT > 7) { s.root.position.y -= dt * .35; if (s.dyingT > 9.5) release(s); }
    }

    /* =========================================================== medkits */
    var kits = [];
    var kitGeo = new T.BoxGeometry(.36, .2, .26), kitMat = std(0xd9d6cc, .5), crossMat = new T.MeshBasicMaterial({ color: 0x46ff7a, toneMapped: false });
    var crossA = new T.BoxGeometry(.16, .03, .05), crossB = new T.BoxGeometry(.05, .03, .16);
    function dropMedkit(p) {
      if (kits.length > 6) return;
      var g = new T.Group(), b = new T.Mesh(kitGeo, kitMat), c1 = new T.Mesh(crossA, crossMat), c2 = new T.Mesh(crossB, crossMat);
      c1.position.y = c2.position.y = .11; b.castShadow = true; g.add(b, c1, c2);
      g.position.set(p.x, p.y + .35, p.z); G.scene.add(g);
      kits.push({ g: g, t: 0, base: p.y + .35 });
    }
    function updKits(dt) {
      for (var i = kits.length - 1; i >= 0; i--) {
        var k = kits[i]; k.t += dt;
        k.g.rotation.y += dt * 1.6; k.g.position.y = k.base + Math.sin(k.t * 3) * .06;
        var d = Math.hypot(k.g.position.x - P.pos.x, k.g.position.z - P.pos.z);
        if (P.alive && d < 1.3 && Math.abs(k.base - P.pos.y) < 1.6 && P.health < P.maxHealth) {
          P.heal(50); pop('+50 HEALTH', true); snd('weapon_draw', { gain: .8, pitch: 1.2 });
          G.scene.remove(k.g); kits.splice(i, 1); continue;
        }
        if (k.t > 30) { G.scene.remove(k.g); kits.splice(i, 1); }
      }
    }
    function clearKits() { kits.forEach(function (k) { G.scene.remove(k.g); }); kits.length = 0; ods.forEach(function (k) { G.scene.remove(k.g); }); ods.length = 0; }

    /* =========================================================== overdrive pickup: double damage */
    var ods = [];
    var odGeo = new T.CylinderGeometry(.12, .12, .34, 14), odMat = new T.MeshBasicMaterial({ color: 0xff8a2a, toneMapped: false }), odCap = std(0x2a2b2d, .4, .6);
    var odCapGeo = new T.CylinderGeometry(.135, .135, .06, 14);
    function dropOverdrive(p) {
      if (ods.length > 2) return;
      var g = new T.Group(), b = new T.Mesh(odGeo, odMat), c1 = new T.Mesh(odCapGeo, odCap), c2 = new T.Mesh(odCapGeo, odCap);
      c1.position.y = .18; c2.position.y = -.18; g.add(b, c1, c2);
      g.position.set(p.x, p.y + .45, p.z); G.scene.add(g);
      ods.push({ g: g, t: 0, base: p.y + .45 });
    }
    function updOverdrive(dt) {
      for (var i = ods.length - 1; i >= 0; i--) {
        var k = ods[i]; k.t += dt;
        k.g.rotation.y += dt * 2.4; k.g.rotation.z = Math.sin(k.t * 2) * .2; k.g.position.y = k.base + Math.sin(k.t * 3.4) * .08;
        if (((k.t * 4) | 0) % 2 === 0 && k.t % .5 < dt) try { G.render.lightPool.flash(k.g.position, 0xff8a2a, 4, 3, .3); } catch (e) {}
        var d = Math.hypot(k.g.position.x - P.pos.x, k.g.position.z - P.pos.z);
        if (P.alive && d < 1.4 && Math.abs(k.base - P.pos.y) < 1.8) {
          run.odT = 15; banner('Overdrive', 'Double damage for 15 seconds', 'od'); snd('mus_hit', { gain: .8 }); snd('weapon_draw', { gain: .8, pitch: .8 });
          G.scene.remove(k.g); ods.splice(i, 1); continue;
        }
        if (k.t > 30) { G.scene.remove(k.g); ods.splice(i, 1); }
      }
    }
    var origShot = G.combat.playerShot.bind(G.combat);
    G.combat.playerShot = function (o, d, opt) {
      if (active && run && run.odT > 0) { opt = Object.assign({}, opt || {}); opt.damage = (opt.damage || 28) * 2; }
      return origShot(o, d, opt);
    };

    /* =========================================================== knife */
    var knifeCd = 0;
    function knife() {
      if (knifeCd > 0 || !P.alive || !P.enabled) return;
      knifeCd = .6;
      snd('gear_rustle', { gain: 1, pitch: 1.5 });
      try { P.addRecoil(-.015, .02); P.addShake(.08); } catch (e) {}
      var fx = P.forward.x, fz = P.forward.z, fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      var best = null, bd = 2.5;
      for (var i = 0; i < list.length; i++) {
        var s = list[i]; if (!s.alive) continue;
        var dx = s.pos.x - P.pos.x, dz = s.pos.z - P.pos.z, d = Math.hypot(dx, dz);
        if (d > bd || Math.abs(s.pos.y - P.pos.y) > 1.6) continue;
        if ((dx * fx + dz * fz) / Math.max(d, .01) < .55 && d > .9) continue;
        best = s; bd = d;
      }
      if (!best) return;
      P.vel.x += fx * 2.5; P.vel.z += fz * 2.5;
      snd('impact_enemy', { pos: best.pos.clone(), gain: 1 });
      hurt(best, 9999, best.headW.clone(), V3(fx, 0, fz), 'body', 'knife');
      try { G.events.emit('player:hitEnemy', { enemy: best, part: 'body', killed: true }); } catch (e) {}
    }

    /* =========================================================== airstrike */
    var strike = null;
    function callStrike() {
      if (!run || !(run.strikes > 0) || strike || !P.alive) return;
      var o = P.eye.clone(), d = P.forward.clone(), h = null;
      try { h = phys.raycast(o, d, 160); } catch (e) {}
      var tgt = h ? h.point.clone() : o.clone().addScaledVector(d, 60);
      try { var gh = phys.groundHeight(tgt.x, tgt.z, Math.max(.6, tgt.y + .2)); if (Number.isFinite(gh)) tgt.y = gh; } catch (e) { tgt.y = 0; }
      var bd = phys.bounds; if (bd) { tgt.x = clamp(tgt.x, bd.min.x + 1, bd.max.x - 1); tgt.z = clamp(tgt.z, bd.min.z + 1, bd.max.z - 1); }
      run.strikes--;
      var dir = V3(P.forward.x, 0, P.forward.z); if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0); dir.normalize();
      strike = { t: 0, tgt: tgt, dir: dir, side: V3(-dir.z, 0, dir.x), i: 0, smoke: 0 };
      var close = tgt.distanceTo(P.pos) < 9;
      banner('Airstrike inbound', close ? 'Danger close: get clear!' : 'Marked on your crosshair', 'strike');
      snd('alert', { gain: .9 }); snd('mus_riser', { gain: .7 });
      updKC(false);
    }
    function updStrike(dt) {
      if (!strike) return;
      strike.t += dt; strike.smoke -= dt;
      if (strike.t < 1.9 && strike.smoke <= 0) { strike.smoke = .18; try { G.fx.smoke(strike.tgt, { size: 1.1, life: 2.2, rise: 2.4, count: 2, color: 0xd8331f }); G.render.lightPool.flash(strike.tgt, 0xff3020, 8, 6, .15); } catch (e) {} }
      while (strike.i < 9 && strike.t > 1.9 + strike.i * .15) {
        var k = strike.i++, p = strike.tgt.clone().addScaledVector(strike.dir, (k - 4) * 3.1).addScaledVector(strike.side, (rnd() - .5) * 4);
        try { var gh = phys.groundHeight(p.x, p.z, strike.tgt.y + 1); if (Number.isFinite(gh)) p.y = gh; } catch (e) {}
        p.y += .2;
        try { G.fx.explosion(p, 1.75); } catch (e) {}
        try { G.fx.debris && G.fx.debris(p, { count: 10, color: 0x2a2a2a, size: .09, speed: 10, spread: 1.5 }); } catch (e) {}
        try { G.render.lightPool.flash(p, 0xffa040, 70, 18, .14); } catch (e) {}
        try { G.combat.explode(p, 6.8, 280, 'airstrike'); } catch (e) {}
        var dd = P.pos.distanceTo(p); if (dd < 40) try { P.addShake(.15 + .55 * Math.max(0, 1 - dd / 40)); } catch (e) {}
      }
      if (strike.i >= 9) strike = null;
    }

    /* =========================================================== enemy markers (who is shooting at you) */
    var mkRoot = document.createElement('div'); mkRoot.className = 'x-mk'; document.querySelector('.hud').appendChild(mkRoot);
    var mks = [];
    for (var mi = 0; mi < 14; mi++) { var e = document.createElement('i'); mkRoot.appendChild(e); mks.push(e); }
    var mkV = V3();
    function updMarkers() {
      var n = 0, W2 = innerWidth / 2, H2 = innerHeight / 2;
      if (G.game.state === 'playing' && P.alive) for (var i = 0; i < list.length && n < mks.length; i++) {
        var s = list[i]; if (!s.alive) continue;
        var fired = clock - s.firedAt, d = s.pos.distanceTo(P.pos);
        var show = (s.canSee && d > 5) || fired < 2.4 || (run && run.uavT > 0 && s.canSee);
        if (!show) continue;
        mkV.copy(s.headW); mkV.y += .38 * s.K.scale; mkV.project(G.camera);
        if (mkV.z > 1 || mkV.x < -1.05 || mkV.x > 1.05 || mkV.y < -1.05 || mkV.y > 1.1) continue;
        var el = mks[n++];
        el.style.display = 'block';
        el.className = s.kind === 'heavy' ? 'hv' : '';
        el.style.opacity = (fired < 2.4 ? 1 : .55).toFixed(2);
        var sc = clamp(1.25 - d / 70, .7, 1.2);
        el.style.transform = 'translate(' + (W2 + mkV.x * W2).toFixed(1) + 'px,' + (H2 - mkV.y * H2).toFixed(1) + 'px) scale(' + sc.toFixed(2) + ')';
      }
      for (; n < mks.length; n++) if (mks[n].style.display !== 'none') mks[n].style.display = 'none';
    }
    function hideMarkers() { mks.forEach(function (m) { m.style.display = 'none'; }); }

    /* =========================================================== HUD */
    var hudRoot = document.querySelector('.hud');
    var kc = document.createElement('div'); kc.className = 'x-kc';
    kc.innerHTML = '<div class="h-k">Kills</div><b>0</b><div class="x-kc-sub"><em data-k="score">0</em> pts · <em data-k="hs">0</em> HS · <em data-k="alive">0</em> active</div><div class="x-kc-uav">UAV <span data-k="uav">20</span>s</div><div class="x-kc-od">Overdrive <span data-k="od">15</span>s</div><div class="x-kc-st"><kbd>B</kbd> Airstrike <span data-k="st">1</span></div>';
    hudRoot.appendChild(kc);
    var kcOd = kc.querySelector('.x-kc-od'), kcOdN = kc.querySelector('[data-k="od"]'), kcSt = kc.querySelector('.x-kc-st'), kcStN = kc.querySelector('[data-k="st"]'), odVeil = document.createElement('div'); odVeil.className = 'x-odv'; document.querySelector('.hud').appendChild(odVeil);
    var kcN = kc.querySelector('b'), kcScore = kc.querySelector('[data-k="score"]'), kcHs = kc.querySelector('[data-k="hs"]'), kcAlive = kc.querySelector('[data-k="alive"]'), kcUav = kc.querySelector('.x-kc-uav'), kcUavN = kc.querySelector('[data-k="uav"]');
    var shownAlive = -1;
    function updKC(bump) {
      if (!run) return;
      kcSt.classList.toggle('on', run.strikes > 0); kcStN.textContent = run.strikes > 1 ? '\u00D7' + run.strikes : ''; var tb = document.querySelector('.t-strike'); if (tb) tb.classList.toggle('ready', run.strikes > 0);
      kcN.textContent = run.kills; kcScore.textContent = Math.round(run.score).toLocaleString('en-US'); kcHs.textContent = run.heads;
      if (bump) { kcN.classList.remove('bump'); void kcN.offsetWidth; kcN.classList.add('bump'); }
    }
    var ban = document.createElement('div'); ban.className = 'x-banner'; ban.innerHTML = '<b></b><span></span>'; hudRoot.appendChild(ban);
    var banQ = [], banT = 0;
    function banner(t, sub, cls) { banQ.push([t, sub || '', cls || '']); }
    function updBanner(dt) {
      banT -= dt;
      if (banT <= 0 && banQ.length) {
        var b = banQ.shift(); ban.querySelector('b').textContent = b[0]; ban.querySelector('span').textContent = b[1];
        ban.className = 'x-banner ' + b[2]; void ban.offsetWidth; ban.classList.add('on'); banT = 1.5;
        snd('ui_click', { gain: .5 });
      }
    }
    var pops = document.createElement('div'); pops.className = 'x-pops'; hudRoot.appendChild(pops);
    function pop(t, hs) {
      var e = document.createElement('div'); e.className = 'x-pop' + (hs ? ' hs' : ''); e.textContent = t; pops.appendChild(e);
      setTimeout(function () { e.remove(); }, 1150);
      while (pops.children.length > 4) pops.firstChild.remove();
    }
    var gw = document.createElement('div'); gw.className = 'x-gw';
    gw.innerHTML = '<div><svg viewBox="0 0 14 16"><rect x="4" y="0" width="6" height="3" fill="currentColor"/><circle cx="7" cy="9.5" r="5.5" fill="currentColor"/></svg><span></span></div>';
    hudRoot.appendChild(gw);
    var gwD = gw.querySelector('div'), gwS = gw.querySelector('span');
    function updGrenadeWarn() {
      var best = null, bd = 9;
      if (P.alive) for (var i = 0; i < A.nades.length; i++) { var n = A.nades[i]; if (n.owner === 'player') continue; var d = n.pos.distanceTo(P.pos); if (d < bd) { bd = d; best = n; } }
      if (!best) { gw.classList.remove('on'); return; }
      gw.classList.add('on');
      var dx = best.pos.x - P.pos.x, dz = best.pos.z - P.pos.z;
      var ang = Math.atan2(dx, dz), rel = angDiff(ang, Math.atan2(-Math.sin(P.yaw), -Math.cos(P.yaw)));
      var R = 92; gwD.style.transform = 'translate(' + (Math.sin(-rel) * R).toFixed(1) + 'px,' + (-Math.cos(rel) * R).toFixed(1) + 'px)';
      gwS.textContent = bd.toFixed(0) + 'm';
    }

    // ---- radar
    var radar = document.createElement('div'); radar.className = 'x-radar'; radar.innerHTML = '<canvas width="300" height="300"></canvas>'; hudRoot.appendChild(radar);
    var rc = radar.querySelector('canvas'), rx = rc.getContext('2d'), mapC = document.createElement('canvas');
    var PX = 5, bnd = phys.bounds || { min: { x: -40, z: -30 }, max: { x: 40, z: 30 } };
    mapC.width = (bnd.max.x - bnd.min.x) * PX; mapC.height = (bnd.max.z - bnd.min.z) * PX;
    (function () {
      var c = mapC.getContext('2d');
      c.fillStyle = 'rgba(232,228,218,.06)'; c.fillRect(0, 0, mapC.width, mapC.height);
      c.fillStyle = 'rgba(232,228,218,.34)';
      (phys.boxes || []).forEach(function (b) {
        if (b.bulletOnly || b.max.y < .9 || b.min.y > 2.2) return;
        var w = (b.max.x - b.min.x) * PX, h = (b.max.z - b.min.z) * PX; if (w * h > mapC.width * mapC.height * .3) return;
        c.fillRect((b.min.x - bnd.min.x) * PX, (b.min.z - bnd.min.z) * PX, w, h);
      });
    })();
    var RR = 34; // metres from centre to edge
    var RADAR_INTERVAL = 1 / 30, radarT = 0;
    function drawRadar() {
      var W = rc.width, H = rc.height, cx = W / 2, cy = H / 2, sc = (W / 2) / RR;
      rx.setTransform(1, 0, 0, 1, 0, 0); rx.clearRect(0, 0, W, H);
      rx.save(); rx.beginPath(); rx.arc(cx, cy, W / 2 - 1, 0, Math.PI * 2); rx.clip();
      rx.translate(cx, cy); rx.rotate(P.yaw); rx.scale(sc / PX, sc / PX);
      rx.translate(-(P.pos.x - bnd.min.x) * PX, -(P.pos.z - bnd.min.z) * PX);
      rx.drawImage(mapC, 0, 0);
      rx.setTransform(1, 0, 0, 1, 0, 0);
      // range rings
      rx.strokeStyle = 'rgba(232,228,218,.14)'; rx.lineWidth = 1.5;
      rx.beginPath(); rx.arc(cx, cy, W / 4, 0, Math.PI * 2); rx.stroke();
      var uav = run && run.uavT > 0;
      if (uav) { var a = clock * 3 % (Math.PI * 2); var g = rx.createConicGradient ? rx.createConicGradient(a - 1.2, cx, cy) : null; if (g) { g.addColorStop(0, 'rgba(64,232,255,0)'); g.addColorStop(.19, 'rgba(64,232,255,.22)'); g.addColorStop(.2, 'rgba(64,232,255,0)'); rx.fillStyle = g; rx.fillRect(0, 0, W, H); } }
      var cs = Math.cos(P.yaw), sn = Math.sin(P.yaw);
      function plot(wx, wz, col, r) {
        var dx = (wx - P.pos.x) * sc, dz = (wz - P.pos.z) * sc;
        var x = dx * cs - dz * sn, y = dx * sn + dz * cs;
        var m = Math.hypot(x, y), lim = W / 2 - 8; if (m > lim) { x *= lim / m; y *= lim / m; r *= .75; }
        rx.fillStyle = col; rx.beginPath(); rx.arc(cx + x, cy + y, r, 0, Math.PI * 2); rx.fill();
      }
      kits.forEach(function (k) { plot(k.g.position.x, k.g.position.z, '#46ff7a', 5); });
      ods.forEach(function (k) { plot(k.g.position.x, k.g.position.z, '#ff9a30', 6); });
      A.nades.forEach(function (n) { if (n.owner !== 'player') plot(n.pos.x, n.pos.z, '#ffb347', 5); });
      list.forEach(function (s) {
        if (!s.alive) return;
        var recent = clock - s.firedAt < 2.2, near = s.pos.distanceTo(P.pos) < 7;
        if (uav || recent || near) plot(s.pos.x, s.pos.z, recent ? '#ff5a40' : 'rgba(255,90,64,.75)', recent ? 7 : 6);
      });
      rx.restore();
      // player chevron
      rx.fillStyle = '#ffb347'; rx.beginPath(); rx.moveTo(cx, cy - 11); rx.lineTo(cx + 8, cy + 8); rx.lineTo(cx, cy + 3); rx.lineTo(cx - 8, cy + 8); rx.closePath(); rx.fill();
    }

    /* =========================================================== lifecycle */
    var needStart = false, origReset = P.reset;
    P.reset = function () { var r = origReset.apply(P, arguments); needStart = true; return r; };
    function clearAll() {
      while (list.length) release(list[0]);
      pending.length = 0; tokens = 0; clearKits();
    }
    function begin() {
      if (run) recordRun();
      clearAll(); run = newRun(); active = true; nadeGlobalT = 8; clock = 0; engagedAt = -99; strike = null; knifeCd = 0;
      radarT = 0;
      for (var i = 0; i < cfg.count; i++) spawnOne();
      kc.classList.add('on'); radar.classList.add('on'); updKC(false);
      try { hud.setTally && hud.setTally(cfg.count + ' hostiles · respawning'); } catch (e) {}
    }
    function end() {
      if (run) recordRun();
      active = false; clearAll(); if (feedEl) feedEl.style.top = ''; kc.classList.remove('on'); radar.classList.remove('on'); gw.classList.remove('on'); run = null; strike = null; hideMarkers(); odVeil.classList.remove('on'); var tb = document.querySelector('.t-strike'); if (tb) tb.classList.remove('ready');
      showCfg();
    }
    function isFF() { return game.run && game.run.mode === 'firefight'; }
    var menuEl = document.querySelector('.menu');
    if (menuEl) menuEl.addEventListener('click', function (event) { if (event.target.closest('[data-d]')) showCfg(); });
    ev.on('game:state', function (e) {
      if (menuEl) menuEl.classList.toggle('x-ff', isFF() && e.state !== 'title');
      if (e.state === 'title') { if (active) end(); needStart = false; }
      if (e.state === 'playing' && run && !needStart && run.setup !== setupKey()) run.setup = null;
      if (e.state === 'dead' && active && run) {
        var st = (G.combat && G.combat.stats) || { shots: 0, hits: 0 };
        var best = recordRun();
        var q = function (k) { return document.querySelector('[data-x="' + k + '"]'); };
        q('ff-kills').textContent = run.kills; q('ff-heads').textContent = run.heads;
        q('ff-multi').textContent = run.multiBest > 1 ? run.multiBest + '×' : '—';
        q('ff-acc').textContent = st.shots ? Math.round(100 * st.hits / st.shots) + '%' : '—';
        q('ff-score').textContent = Math.round(run.score).toLocaleString('en-US');
        var bestField = q('ff-best');
        bestField.previousElementSibling.textContent = run.setup ? 'Setup best' : 'Overall best';
        bestField.textContent = formatKills(best.kills) + (best.isNew ? '  NEW' : '');
        showCfg();
      }
    });

    var musicT = 0, lastInt = -1, feedT = 0, feedEl = document.querySelector('.h-feed'), touchRoot = document.querySelector('.is-touch');
    function placeFeed() { // keep the kill feed clear of the kill counter, whatever lines it is showing
      if (!feedEl) feedEl = document.querySelector('.h-feed'); if (!feedEl) return;
      if (!kc.classList.contains('on') || kc.closest('.is-touch')) { feedEl.style.top = ''; return; }
      var r = kc.getBoundingClientRect(); if (r.height > 0) feedEl.style.top = Math.max(r.bottom + 14, innerHeight * .31) + 'px';
    }
    function tick(dt) {
      if (!isFF()) { if (active) end(); return; }
      if (needStart) { needStart = false; begin(); }
      if (!active) return;
      clock += dt; run.t += dt;
      var st = game.state, live = st === 'playing';
      nadeGlobalT -= dt;
      run.multiT = Math.max(0, run.multiT - dt);
      if (run.uavT > 0) { run.uavT -= dt; kcUav.classList.add('on'); kcUavN.textContent = Math.ceil(run.uavT); } else kcUav.classList.remove('on');
      if (run.odT > 0) { run.odT -= dt; kcOd.classList.add('on'); kcOdN.textContent = Math.ceil(run.odT); odVeil.classList.add('on'); if (run.odT <= 0) pop('OVERDRIVE ENDED', false); } else { kcOd.classList.remove('on'); odVeil.classList.remove('on'); }
      knifeCd = Math.max(0, knifeCd - dt);
      if (live && G.input.pressed) {
        if (G.input.pressed('melee')) knife();
        if (G.input.pressed('airstrike')) callStrike();
      }
      updStrike(dt); updOverdrive(dt);
      // keep the headcount: every kill is replaced straight away
      var alive = 0; for (var i = 0; i < list.length; i++) if (list[i].alive) alive++;
      for (var j = pending.length - 1; j >= 0; j--) { pending[j] -= dt; if (pending[j] <= 0) { pending.splice(j, 1); if (alive < cfg.count) { spawnOne(); alive++; } } }
      if (alive + pending.length < cfg.count) pending.push(.8);
      if (alive !== shownAlive) {
        shownAlive = alive;
        kcAlive.textContent = alive;
      }
      for (var k = list.length - 1; k >= 0; k--) {
        var s = list[k];
        if ((!live || window.__ffFreeze) && s.alive) { animate(s, dt); continue; }
        updateSoldier(s, dt);
      }
      updKits(dt); updBanner(dt); updGrenadeWarn(); updMarkers();
      radarT -= dt;
      if (radarT <= 0) {
        drawRadar();
        radarT = Math.max(0, radarT + RADAR_INTERVAL);
      }
      feedT -= dt; if (feedT <= 0) { feedT = .3; placeFeed(); }
      musicT -= dt;
      if (musicT <= 0 && live) {
        musicT = 1; var want = clock - engagedAt < 6 ? 1 : .6;
        if (want !== lastInt) { lastInt = want; try { G.audio.setIntensity && G.audio.setIntensity(want); } catch (e) {} }
      }
    }

    // compile every soldier material up front so the first one you meet appears straight away (no shader stall)
    (function prewarm() {
      try {
        var R = G.render && G.render.renderer; if (!R || !R.compile) return;
        var tmp = [];
        ['rifle', 'heavy', 'rusher'].forEach(function (k, i) {
          var s = makeSoldier(); s.kind = k; s.K = KIND[k]; dress(s);
          if (i === 0) s.meshes.forEach(function (m) { if (m.userData.part === 'cloth') m.material = MAT.cloth[2]; });
          s.root.visible = true; s.root.position.set(P.pos.x, -60, P.pos.z); tmp.push(s);
        });
        var extra = makeSoldier(); extra.kind = 'rifle'; extra.K = KIND.rifle; dress(extra); extra.meshes.forEach(function (m) { if (m.userData.part === 'cloth') m.material = MAT.cloth[0]; });
        extra.root.visible = true; extra.root.position.set(P.pos.x, -60, P.pos.z); tmp.push(extra);
        var od = new T.Mesh(odGeo, odMat), kt = new T.Mesh(kitGeo, kitMat); od.position.set(0, -60, 0); kt.position.set(0, -60, 0); G.scene.add(od, kt);
        R.compile(G.scene, G.camera);
        G.scene.remove(od, kt);
        tmp.forEach(function (s) { s.root.visible = false; pool.push(s); });
      } catch (e) { console.warn('[soldiers] prewarm skipped', e); }
    })();

    window.__soldiers = { tick: tick, list: list, cfg: cfg, get run() { return run; }, spawnOne: spawnOne, rayHit: rayHit, begin: begin, dropOverdrive: dropOverdrive, dropMedkit: dropMedkit, callStrike: callStrike };
  }
  boot();
})();
