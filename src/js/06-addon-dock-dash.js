/* Dock Dash: a checkpoint time trial through the terminal. */
(function () {
  'use strict';

  const MODE = 'dock-dash';
  const KEY = 'saltline.dock-dash.v1';
  const RADIUS = 1.5;
  const COURSE = [
    ['Gate Lane', -25.5, 7],
    ['Fence Corner', -25.8, 14.8],
    ['Stack Row', -17, 16.3],
    ['Crane Alley', -7.8, 10.8],
    ['Apron', -3.3, 6.8],
    ['Quay Approach', 15, 6.3],
    ['Waterfront', 26.8, 16.3],
    ['Finish', 29, 20],
  ];

  function formatTime(ms) {
    const ticks = Math.floor(ms / 10);
    const seconds = Math.floor(ticks / 100);
    const pad = (value) => String(value).padStart(2, '0');
    return pad(Math.floor(seconds / 60)) + ':' + pad(seconds % 60) + '.' + pad(ticks % 100);
  }

  function formatDelta(ms) {
    const ticks = Math.floor(Math.abs(ms) / 10);
    const sign = ticks === 0 ? '±' : ms < 0 ? '−' : '+';
    return sign + (ticks / 100).toFixed(2) + 's';
  }

  function boot() {
    if (window.__fatal || window.__G?.showcase) return;
    if (!window.__ready) {
      requestAnimationFrame(boot);
      return;
    }
    const G = window.__G;
    if (G?.game?.finishDockDash) init(G);
  }

  function init(G) {
    const { THREE: T, player, weapon, game, hud, physics, events } = G;
    const ui = document.getElementById('ui');
    const menu = game.menus.root;
    const lighting = window.__SL_NIGHT ? 'Night' : 'Dusk';
    const recordKey = KEY + '.' + lighting.toLowerCase();
    const gates = COURSE.map(([name, x, z], index) => ({
      name, pos: new T.Vector3(x, 0, z), short: index === COURSE.length - 1 ? 'FIN' : String(index + 1),
    }));
    function readBest() {
      try {
        const saved = JSON.parse(localStorage.getItem(recordKey));
        if (Array.isArray(saved) && saved.length === gates.length &&
            saved.every((ms, i) => Number.isSafeInteger(ms) && ms > (i ? saved[i - 1] : 0))) {
          return saved;
        }
      } catch {}
      return null;
    }
    let best = readBest();

    const menuBest = document.createElement('p');
    menuBest.className = 'dash-menu-best';
    menu.querySelector('.m-pick').append(menuBest);
    const premise = menu.querySelector('.m-premise');
    const originalPremise = premise.textContent;
    function updatePremise() {
      premise.textContent = menu.dataset.mode === MODE
        ? 'Race from the entry gate to the quay through eight checkpoints.'
        : originalPremise;
    }
    new MutationObserver(updatePremise).observe(menu, { attributes: true, attributeFilter: ['data-mode'] });
    updatePremise();

    const tracker = document.querySelector('.h-obj');
    const clock = document.createElement('div');
    clock.className = 'dash-clock';
    clock.hidden = true;
    clock.innerHTML = '<span class="dash-time"></span><span class="dash-split" role="status" hidden></span>';
    tracker.append(clock);
    const elapsedLabel = clock.querySelector('.dash-time');
    const splitLabel = clock.querySelector('.dash-split');

    const debrief = menu.querySelector('.m-debrief');
    const restart = menu.querySelector('[data-act="restart"]');
    const replay = debrief.querySelector('[data-act="redeploy"]');
    const restartLabel = restart.textContent;
    const replayLabel = replay.textContent;
    const result = document.createElement('div');
    result.className = 'dash-result';
    result.hidden = true;
    result.innerHTML = `
      <p class="m-k"></p>
      <h2 class="m-h">Course complete</h2>
      <div class="m-rating"><span>Finish time</span><b class="dash-finish"></b></div>
      <p class="dash-record"></p>
      <div class="dash-split-list" tabindex="0" role="region" aria-label="Checkpoint splits">
        <table class="dash-splits">
          <thead><tr><th scope="col">Gate</th><th scope="col">Elapsed</th><th scope="col">vs best</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>`;
    debrief.prepend(result);
    result.querySelector('.m-k').textContent = 'Dock Dash · ' + lighting;
    const splitList = result.querySelector('.dash-split-list');
    const rows = gates.map(({ name }, index) => {
      const row = result.querySelector('tbody').insertRow();
      const heading = document.createElement('th');
      heading.scope = 'row';
      heading.textContent = (index + 1) + '  ' + name;
      row.append(heading);
      return { time: row.insertCell(), delta: row.insertCell() };
    });

    const root = new T.Group();
    root.name = 'dock-dash-course';
    root.visible = false;
    G.scene.add(root);
    const beacon = new T.Group();
    root.add(beacon);
    const ring = new T.Mesh(
      new T.RingGeometry(RADIUS - .12, RADIUS, 48),
      new T.MeshBasicMaterial({ color: 0x66f7e6, side: T.DoubleSide, toneMapped: false, fog: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = .09;
    const diamond = new T.Mesh(
      new T.OctahedronGeometry(.4),
      new T.MeshBasicMaterial({ color: 0x66f7e6, toneMapped: false, fog: false })
    );
    diamond.scale.y = 1.45;
    diamond.position.y = 1.35;
    beacon.add(ring, diamond);
    const arrow = new T.Shape();
    arrow.moveTo(-.23, -.14);
    arrow.lineTo(0, .22);
    arrow.lineTo(.23, -.14);
    arrow.lineTo(0, -.02);
    arrow.closePath();
    const arrowGeo = new T.ShapeGeometry(arrow).rotateX(-Math.PI / 2);
    const arrowMat = new T.MeshBasicMaterial({
      color: 0x66f7e6, side: T.DoubleSide, toneMapped: false, fog: false,
    });
    const legGuides = gates.map(({ pos }, index) => {
      const group = new T.Group();
      group.visible = false;
      root.add(group);
      let from = index === 0 ? G.level.playerStart.pos : gates[index - 1].pos;
      for (const to of physics.nav.findPath(from, pos) || [pos]) {
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        const length = Math.hypot(dx, dz);
        const steps = Math.ceil(length / 2.1);
        for (let step = 0; step < steps; step++) {
          const part = step / steps;
          const x = from.x + dx * part;
          const z = from.z + dz * part;
          if (Math.hypot(x - pos.x, z - pos.z) < RADIUS) continue;
          const marker = new T.Mesh(arrowGeo, arrowMat);
          marker.position.set(x, .08, z);
          marker.rotation.y = Math.atan2(-dx, -dz);
          group.add(marker);
        }
        from = to;
      }
      return group;
    });

    let run = null;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

    function showBest() {
      menuBest.hidden = !best;
      menuBest.textContent = best ? lighting + ' best · ' + formatTime(best.at(-1)) : '';
    }

    function refreshBest() {
      const saved = readBest();
      if (saved && (!best || saved.at(-1) < best.at(-1))) {
        best = saved;
        showBest();
      }
    }

    function showGate(index) {
      const gate = gates[index];
      beacon.position.copy(gate.pos);
      legGuides.forEach((guide, i) => { guide.visible = index === i; });
      hud.setObjective((index + 1) + '/' + gates.length + ' · ' + gate.name);
      hud.setMarkers([{ id: MODE, ...gate, label: gate.name, kind: 'dash' }]);
    }

    function reset() {
      root.visible = false;
      clock.hidden = true;
      result.hidden = true;
      restart.textContent = restartLabel;
      replay.textContent = replayLabel;
      ui.classList.remove('dash-running');
      tracker.classList.remove('dash-active');
      hud.setMarkers([]);
      run = null;
    }

    function elapsed(now) {
      return run.accumulated + (run.startedAt === null ? 0 : now - run.startedAt);
    }

    function freeze(now) {
      run.accumulated = elapsed(now);
      run.startedAt = null;
    }

    function updateClock(ms) {
      const value = formatTime(ms);
      if (elapsedLabel.textContent !== value) elapsedLabel.textContent = value;
    }

    function renderDelta(element, delta) {
      element.textContent = delta === null ? '—' : formatDelta(delta);
      element.classList.toggle('ahead', delta !== null && delta <= -10);
      element.classList.toggle('behind', delta !== null && delta >= 10);
    }

    function finish(ms) {
      refreshBest();
      const reference = run.reference;
      const isBest = !best || ms < best.at(-1);
      if (isBest) {
        best = run.splits.slice();
        try { localStorage.setItem(recordKey, JSON.stringify(best)); } catch {}
      }
      result.querySelector('.dash-finish').textContent = formatTime(ms);
      result.querySelector('.dash-record').textContent = isBest
        ? 'New personal best'
        : 'Personal best · ' + formatTime(best.at(-1));
      rows.forEach(({ time, delta }, index) => {
        const split = run.splits[index];
        time.textContent = formatTime(split);
        renderDelta(delta, reference ? split - reference[index] : null);
      });
      root.visible = false;
      clock.hidden = true;
      hud.setMarkers([]);
      replay.textContent = 'Run again';
      result.hidden = false;
      showBest();
      game.finishDockDash();
      debrief.scrollTop = 0;
      splitList.scrollTop = 0;
    }

    function tick() {
      if (!run || run.startedAt === null || game.state !== 'playing' || !player.alive) return;
      const now = performance.now();
      const ms = Math.round(elapsed(now));
      updateClock(ms);
      if (!reducedMotion.matches) diamond.rotation.y = ms * .002;
      if (!splitLabel.hidden && ms >= run.splitUntil) splitLabel.hidden = true;

      const gate = gates[run.splits.length];
      const dx = player.pos.x - gate.pos.x;
      const dz = player.pos.z - gate.pos.z;
      if (dx * dx + dz * dz > RADIUS * RADIUS || Math.abs(player.pos.y - gate.pos.y) > 2) return;

      run.splits.push(ms);
      G.audio?.play?.('ui_click', { gain: .8, pitch: 1.4 });
      if (run.splits.length === gates.length) {
        freeze(now);
        finish(ms);
        return;
      }
      if (run.reference) {
        renderDelta(splitLabel, ms - run.reference[run.splits.length - 1]);
        splitLabel.hidden = false;
        run.splitUntil = ms + 2700;
      }
      showGate(run.splits.length);
    }

    function startOrResume() {
      if (!run) {
        refreshBest();
        run = { accumulated: 0, startedAt: null, splits: [], splitUntil: 0, reference: best };
        ui.classList.add('dash-running');
        tracker.classList.add('dash-active');
        restart.textContent = 'Restart run';
        clock.hidden = false;
        splitLabel.hidden = true;
        weapon.setVisible(false);
        player.invulnerable = true;
        updateClock(0);
        showGate(0);
      }
      root.visible = true;
      run.startedAt = performance.now();
    }

    const baseReset = player.reset;
    player.reset = function () {
      if (run) reset();
      return baseReset.apply(this, arguments);
    };
    const baseUpdate = player.update;
    player.update = function (dt) {
      if (run && game.state === 'playing') G.input.fire = false;
      baseUpdate.call(this, dt);
      tick();
    };
    const updateWeapon = weapon.update;
    weapon.update = function (dt) {
      if (!run) updateWeapon.call(this, dt);
    };
    events.on('game:state', ({ state }) => {
      if (state === 'title' && run) reset();
      if (game.run.mode !== MODE) return;
      if (state === 'playing') startOrResume();
      if (state === 'paused' && run) freeze(performance.now());
      if (state === 'dead' && run) reset();
    });
    window.addEventListener('storage', ({ key }) => {
      if (key === recordKey) refreshBest();
    });

    showBest();
    if (game.run.mode === MODE && game.state === 'playing') startOrResume();
  }

  boot();
})();
