
/* Night: moonlight, floodlit masts with light shafts, stars, a weapon flashlight, and a Dusk/Night picker on the title screen. */
(function () {
  'use strict';
  var NIGHT = !!window.__SL_NIGHT;

  /* ---- title picker (works for both times) ---- */
  function picker() {
    var pick = document.querySelector('.menu .m-pick');
    if (!pick) { setTimeout(picker, 250); return; }
    var lab = document.createElement('label'); lab.textContent = 'Time'; lab.id = 'l-time';
    var seg = document.createElement('div'); seg.className = 'seg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-labelledby', 'l-time');
    seg.innerHTML = '<button data-time="dusk">Dusk</button><button data-time="night">Night</button>';
    var wrapL = lab, wrapS = seg; wrapS.classList.add('x-time-seg');
    var before = pick.querySelector('.x-ffr') || pick.querySelector('.m-pick-note');
    pick.insertBefore(wrapL, before); pick.insertBefore(wrapS, before);
    pick.classList.add('x-time');
    [].forEach.call(seg.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.time === window.__SL_TIME));
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var t = b.dataset.time; if (t === window.__SL_TIME) return;
        try { localStorage.setItem('saltline.time', t); } catch (er) {}
        var u = location.href.replace(/([?&])time=(night|dusk)&?/, '$1');
        document.body.style.transition = 'opacity .3s'; document.body.style.opacity = '0';
        setTimeout(function () { location.replace(u); }, 280);
      });
    });
  }
  picker();
  if (!NIGHT) return;

  function boot() {
    var G = window.__G;
    if (!G || !G.render || !G.render.tune || !G.scene || !G.camera || !G.player || !G.input || !document.querySelector('.hud')) { setTimeout(boot, 250); return; }
    try { init(G); } catch (e) { console.error('[night] init failed', e); }
  }
  function init(G) {
    var T = G.THREE, scene = G.scene, cam = G.camera, P = G.player, I = G.input;
    var V3 = function (x, y, z) { return new T.Vector3(x || 0, y || 0, z || 0); };

    /* ---- exposure + clouds tuned for night ---- */
    var tune = G.render.tune;
    tune.maxExposure = .5; tune.minExposure = .25; tune.key = .062; tune.flare = .04; tune.volSunScale = .5; tune.volAmbient = .32; tune.bloom = .085;
    scene.traverse(function (o) { var m = o.material; if (m && m.uniforms && m.uniforms.uBright) m.uniforms.uBright.value = 1.05; });

    /* ---- floodlit masts ---- */
    var MASTS = [[26.6, -28.7], [26.6, 26.7], [-23.4, .5], [-23.4, 21.4], [17, -8.7], [17, 18.6], [-20.6, -11.6], [-27.6, -.9], [-36.3, 12.4]];
    var shaftMat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false, toneMapped: false,
      uniforms: { uCol: { value: new T.Color(1, .82, .56) }, uI: { value: .55 } },
      vertexShader: 'varying float vT; varying vec3 vN; varying vec3 vV; void main(){ vT = uv.y; vec4 wp = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }',
      fragmentShader: 'uniform vec3 uCol; uniform float uI; varying float vT; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(normalize(vN), vV)), 1.6); float a = uI * edge * smoothstep(0.0, .35, vT) * (0.35 + 0.65 * vT); gl_FragColor = vec4(uCol * a, a); }'
    });
    var shaftGeo = new T.CylinderGeometry(.35, 5.2, 13, 24, 1, true); shaftGeo.translate(0, -6.5, 0);
    var glowMat = new T.MeshBasicMaterial({ color: 0xffe2b0, toneMapped: false });
    var glowGeo = new T.BoxGeometry(1.2, .18, .5);
    MASTS.forEach(function (m) {
      var sp = new T.SpotLight(0xffd7a2, 780, 46, .98, .75, 1.8);
      sp.position.set(m[0], 13.1, m[1]); sp.target.position.set(m[0] * .97, 0, m[1] * .97);
      scene.add(sp, sp.target);
      var shaft = new T.Mesh(shaftGeo, shaftMat); shaft.position.set(m[0], 13.1, m[1]); shaft.frustumCulled = false; shaft.renderOrder = 5; scene.add(shaft);
      var g = new T.Mesh(glowGeo, glowMat); g.position.set(m[0], 13.15, m[1]); scene.add(g);
    });
    // the two work floodlights near the gate and the generator
    [[16.4, -23.6, .3], [-31.4, 12.7, .55]].forEach(function (f) {
      var a = f[2], dx = .976 * Math.cos(a), dz = -.976 * Math.sin(a);
      var sp = new T.SpotLight(0xfff1d6, 160, 26, .62, .55, 1.8);
      sp.position.set(f[0] + dx * .14, 2.03, f[1] + dz * .14); sp.target.position.set(f[0] + dx * 10, 0, f[1] + dz * 10);
      scene.add(sp, sp.target);
    });

    /* ---- stars ---- */
    var N = 1400, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      var u = Math.random() * Math.PI * 2, v = Math.acos(1 - Math.random() * .92), r = 600;
      pos[i * 3] = Math.sin(v) * Math.cos(u) * r; pos[i * 3 + 1] = Math.cos(v) * r; pos[i * 3 + 2] = Math.sin(v) * Math.sin(u) * r;
      var b = .35 + Math.pow(Math.random(), 3) * 1.4, t = Math.random();
      col[i * 3] = b * (t < .2 ? 1 : .82); col[i * 3 + 1] = b * .9; col[i * 3 + 2] = b * (t > .8 ? .8 : 1.05);
    }
    var sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(pos, 3)); sg.setAttribute('color', new T.BufferAttribute(col, 3));
    var stars = new T.Points(sg, new T.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: .9, depthWrite: false, fog: false, toneMapped: false }));
    stars.frustumCulled = false; stars.renderOrder = -1; scene.add(stars);

    /* ---- weapon flashlight (T) ---- */
    var fl = new T.SpotLight(0xfff0d8, 0, 48, .36, .55, 1.7);
    var flTarget = new T.Object3D(); cam.add(fl); cam.add(flTarget);
    fl.position.set(.12, -.1, -.2); flTarget.position.set(.02, -.05, -6); fl.target = flTarget;
    var flOn = true, flK = 0, lightButton = null;
    var hudEl = document.createElement('div'); hudEl.className = 'x-fl'; document.querySelector('.hud').appendChild(hudEl);
    function setHud() {
      hudEl.innerHTML = '<kbd>T</kbd> Flashlight <b>' + (flOn ? 'on' : 'off') + '</b>';
      if (lightButton) {
        lightButton.classList.toggle('active', flOn);
        lightButton.setAttribute('aria-pressed', String(flOn));
      }
    }
    function toggleFlashlight() {
      if (!P.alive || !P.enabled) return;
      flOn = !flOn;
      setHud();
      try { G.audio && G.audio.play && G.audio.play('pistol_dry', { gain: .5, pitch: 1.6 }); } catch (e) {}
    }
    function addTouchLight() {
      if (lightButton) return;
      var touch = document.querySelector('.touch');
      if (!touch) return;
      lightButton = document.createElement('button');
      lightButton.type = 'button';
      lightButton.className = 't-btn t-flashlight';
      lightButton.setAttribute('aria-label', 'Flashlight');
      lightButton.innerHTML = '<span>LIGHT</span>';
      lightButton.addEventListener('click', function (event) {
        toggleFlashlight();
        if (event.detail) lightButton.blur();
      });
      touch.appendChild(lightButton);
      setHud();
    }
    setHud();
    addTouchLight();
    if (I.onModeChange) I.onModeChange(function (mode) { if (mode === 'touch') addTouchLight(); });
    var lastShot = -99, clock = 0;
    G.events && G.events.on && G.events.on('weapon:fire', function () { lastShot = clock; });
    G.events && G.events.on && G.events.on('player:grenade', function () { lastShot = clock; });
    // soldiers see you from far away only when your light is on or you are shooting
    window.__slSight = function () { return (flOn || clock - lastShot < 2.5) ? 80 : 26; };

    var origUpdate = P.update;
    P.update = function (dt) {
      origUpdate.call(P, dt);
      clock += dt;
      try {
        if (I.pressed && I.pressed('flashlight')) toggleFlashlight();
        var want = flOn && P.alive && P.enabled ? 1 : 0;
        flK += (want - flK) * Math.min(1, dt * 18);
        fl.intensity = flK * 340 * (.97 + Math.random() * .03);
        hudEl.classList.toggle('on', G.game && (G.game.state === 'playing' || G.game.state === 'intro'));
      } catch (e) {}
    };
    // stars follow the camera so they stay at infinity
    var lastFrame = -1;
    (function follow() {
      requestAnimationFrame(follow);
      if (window.__frames === lastFrame) return; lastFrame = window.__frames;
      stars.position.copy(cam.position);
      if (!P.enabled && fl.intensity > 0 && (!G.game || G.game.state === 'title')) fl.intensity = 0;
    })();
  }
  boot();
})();
