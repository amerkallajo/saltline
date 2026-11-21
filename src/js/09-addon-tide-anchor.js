/* Tide Anchor: a temporary return point for the three terminal combat modes. */
(() => {
  'use strict';
  const combatModes = new Set(['mission', 'holdout', 'firefight']);
  const lifetime = 12;
  const recharge = 16;
  const sampleInterval = .10;
  const capacity = Math.ceil(lifetime / sampleInterval) + 3;

  function boot() {
    if (window.__fatal || window.__G?.showcase) return;
    if (!window.__ready) return requestAnimationFrame(boot);
    const G = window.__G;
    if (G.player?.recallTo) init(G);
  }

  function init({ THREE: T, player, game, input, hud, scene, audio, events }) {
    const menu = game.menus.root;
    const controls = menu.querySelector('[data-pane="controls"] .keys');
    const row = document.createElement('div');
    row.innerHTML = '<dt>Plant / recall Tide Anchor</dt><dd><kbd>X</kbd> or controller View / Back</dd>';
    controls.append(row);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ta-control';
    button.title = 'Set a return point for 12 seconds. Activate again to recall.';
    button.innerHTML = '<span class="ta-glyph" aria-hidden="true">◇</span><span class="ta-detail"><small>Tide anchor</small><strong></strong></span><kbd>X</kbd><i></i>';
    document.getElementById('ui').append(button);
    const label = button.querySelector('strong'), key = button.querySelector('kbd');
    const progress = button.querySelector('i');

    const field = new T.Group();
    field.name = 'tide-anchor';
    const beacon = new T.Group();
    const color = 0x8df7d0;
    const glow = new T.MeshBasicMaterial({color, toneMapped:false});
    function ring(radius, thickness, material) {
      const mesh = new T.Mesh(new T.TorusGeometry(radius, thickness, 6, 40), material);
      mesh.rotation.x = Math.PI / 2;
      return mesh;
    }
    const outer = ring(.74, .025, glow), inner = ring(.47, .014, glow);
    outer.position.y = .045;
    inner.position.y = .055;
    const spindle = new T.Mesh(new T.OctahedronGeometry(.18), new T.MeshBasicMaterial({
      color:0xceffe2, wireframe:true, toneMapped:false,
    }));
    spindle.scale.y = 1.7;
    beacon.add(outer, inner, spindle);
    field.add(beacon);

    const trace = new Float32Array(capacity * 3);
    const geometry = new T.BufferGeometry();
    const positions = new T.BufferAttribute(trace, 3).setUsage(T.DynamicDrawUsage);
    geometry.setAttribute('position', positions);
    geometry.setDrawRange(0, 0);
    const ink = new T.LineBasicMaterial({color, transparent:true, depthWrite:false, toneMapped:false});
    const line = new T.Line(geometry, ink);
    line.frustumCulled = false;
    const dust = new T.PointsMaterial({color:0xe6ffbf,size:.11,transparent:true,depthWrite:false,toneMapped:false});
    const dots = new T.Points(geometry, dust);
    dots.frustumCulled = false;
    field.add(line, dots);

    let active = false, anchored = false, remaining = 0, cooldown = 0;
    let lastPercent = -1;
    let echo = 0, samples = 0, sampleIn = 0, feedback = 0, queuedTap = false;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const origin = new T.Vector3();

    function sample() {
      if (samples >= capacity) return;
      positions.setXYZ(samples++, player.pos.x, player.pos.y + .38, player.pos.z);
      positions.needsUpdate = true;
      geometry.setDrawRange(0, samples);
    }
    function display() {
      const ready = cooldown <= 0;
      const text = feedback > 0 ? 'Stand on solid ground' : anchored ? 'Recall · ' + Math.ceil(remaining) + 's'
        : ready ? 'Plant anchor' : 'Recharging · ' + Math.ceil(cooldown) + 's';
      if (label.textContent !== text) {
        label.textContent = text;
        button.setAttribute('aria-label', text + ' · Tide Anchor');
      }
      const shortcut = input.touch ? '' : input.device === 'pad' ? 'View' : 'X';
      if (key.textContent !== shortcut) key.textContent = shortcut;
      const state = anchored ? 'armed' : ready ? 'ready' : 'charging';
      if (button.dataset.state !== state) button.dataset.state = state;
      const percent = Math.round(100 * (anchored ? remaining / lifetime : ready ? 1 : 1 - cooldown / recharge));
      if (percent !== lastPercent) {
        progress.style.transform = 'scaleX(' + percent / 100 + ')';
        lastPercent = percent;
      }
    }
    function activate() {
      if (cooldown > 0) return;
      if (!anchored) {
        if (!player.onGround || player.crouching || player.sliding) { feedback = 1.3; return; }
        origin.copy(player.pos);
        beacon.position.copy(origin);
        beacon.visible = true;
        anchored = true;
        remaining = lifetime;
        sampleIn = 0;
        samples = 0;
        sample();
        feedback = 0;
        audio?.play?.('relay_cut', {gain:.38, pitch:1.6, pos:origin});
        return;
      }
      sample();
      player.recallTo(origin);
      anchored = false;
      beacon.visible = false;
      cooldown = recharge;
      echo = reducedMotion.matches ? 0 : 1.15;
      line.visible = dots.visible = echo > 0;
      hud.message('Recalled to Tide Anchor', 1.35);
      audio?.play?.('relay_cut', {gain:.52, pitch:.72, pos:origin});
    }
    function end() {
      scene.remove(field);
      button.hidden = true;
      active = anchored = queuedTap = false;
      beacon.visible = line.visible = dots.visible = false;
      remaining = cooldown = echo = feedback = 0;
    }
    function stateChanged({state}) {
      if (state === 'playing' && combatModes.has(game.run.mode)) {
        if (!active) {active = true;scene.add(field);}
        button.hidden = false;
        display();
      } else if (state === 'paused' && active) {
        button.hidden = true;
        queuedTap = false;
      } else end();
    }
    button.addEventListener('pointerdown', event => {
      event.stopPropagation();
      event.preventDefault();
      if (active && game.state === 'playing') queuedTap = true;
    });
    button.addEventListener('click', event => {
      // Keyboard and accessibility activation have no preceding pointer event.
      if (!event.detail && active && game.state === 'playing') queuedTap = true;
    });

    const update = player.update;
    player.update = function(dt) {
      if (active && game.state === 'playing' && player.alive) {
        cooldown = Math.max(0, cooldown - dt);
        feedback = Math.max(0, feedback - dt);
        if (anchored) {
          remaining = Math.max(0, remaining - dt);
          if (!remaining) {
            anchored = false;
            beacon.visible = false;
            cooldown = recharge;
            hud.message('Tide Anchor expired', 1.3);
          } else {
            sampleIn -= dt;
            if (sampleIn <= 0) {sample();sampleIn += sampleInterval;}
            spindle.position.y = .56 + .07 * Math.sin(remaining * 2.7);
            spindle.rotation.y = remaining * 1.6;
            outer.scale.setScalar(.93 + .07 * Math.cos(remaining * 3.1));
          }
        }
        if (input.pressed('anchor') || queuedTap) activate();
        queuedTap = false;
        if (echo > 0) {
          echo = Math.max(0, echo - dt);
          ink.opacity = echo / 1.15 * .64;
          dust.opacity = echo / 1.15;
          line.visible = dots.visible = echo > 0;
        }
        display();
      }
      return update.call(this, dt);
    };
    const reset = player.reset;
    player.reset = function(point) {end();return reset.call(this, point);};
    end();
    events.on('game:state', stateChanged);
    stateChanged({state:game.state});
  }
  boot();
})();
