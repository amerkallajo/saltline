/* Saltline Online: match UI and player replication for the terminal arena. */
(() => {
  'use strict';
  const mode = 'online-ffa';

  function boot() {
    if (window.__fatal || window.__G?.showcase) return;
    if (!window.__ready) return requestAnimationFrame(boot);
    init(window.__G);
  }

  function init({ THREE: T, player, weapon, game, input, scene, hud, events, fx, audio }) {
    if (!game?.menus?.root || !player?.recallTo) return;
    const menu = game.menus.root;
    const rooms = window.SaltlineRooms;
    const hostsRoom = rooms && !rooms.room;
    const joinButton = document.createElement('button');
    joinButton.type = 'button';
    joinButton.className = 'btn sl-online-button';
    joinButton.textContent = 'Online Free-for-All';
    menu.querySelector('.m-title-main .m-actions').after(joinButton);

    const dialog = document.createElement('dialog');
    dialog.className = 'sl-online-dialog';
    dialog.setAttribute('aria-labelledby', 'sl-online-title');
    dialog.innerHTML = `<form>
      <h2 id="sl-online-title">Online Free-for-All</h2>
      <p>Fight up to 11 other players on Saltline Terminal with the rifle and pistol. Respawns are automatic.</p>
      <label for="sl-online-name">Display name</label>
      <input id="sl-online-name" name="name" maxlength="18" placeholder="Player" autocomplete="nickname">
      <p role="status"></p>
      <div class="m-actions">
        <button type="submit" class="btn primary">${hostsRoom ? 'Host arena' : 'Join arena'}</button>
        <button type="button" class="btn" data-close>Back</button>
      </div>
    </form>`;
    document.body.append(dialog);
    const form = dialog.querySelector('form');
    const status = dialog.querySelector('[role="status"]');
    const name = form.elements.namedItem('name');
    const submit = form.querySelector('[type="submit"]');
    const webPage = ['http:', 'https:'].includes(location.protocol);
    if (hostsRoom) {
      dialog.querySelector('p').textContent = 'Host a free-for-all for up to 12 players. Share your invite link from the pause menu and keep this tab open during the match.';
    }

    const inviteButton = document.createElement('button');
    inviteButton.type = 'button';
    inviteButton.className = 'btn sl-online-invite';
    inviteButton.textContent = 'Copy invite link';
    inviteButton.hidden = true;
    menu.querySelector('[data-s="paused"] [data-act="resume"]').after(inviteButton);
    inviteButton.addEventListener('click', async () => {
      const link = socket?.invite?.href;
      if (!link) return;
      try {
        await navigator.clipboard.writeText(link);
        inviteButton.textContent = 'Invite link copied';
      } catch {
        window.prompt('Copy your Saltline invite link', link);
      }
    });

    const display = document.createElement('aside');
    display.className = 'sl-online-hud';
    display.setAttribute('aria-label', 'Online match scores');
    display.hidden = true;
    display.innerHTML = `<div class="sl-online-score">
      <div class="sl-online-header"><strong>FREE-FOR-ALL</strong><span data-count title="Players in arena"></span></div>
      <ol aria-label="Kills and deaths"></ol>
    </div><p class="sl-online-feed" aria-live="polite"></p>
    <div class="sl-online-notice" aria-live="polite"></div>`;
    document.getElementById('ui').append(display);
    const count = display.querySelector('[data-count]');
    const scores = display.querySelector('ol');
    const feed = display.querySelector('.sl-online-feed');
    const notice = display.querySelector('.sl-online-notice');

    let socket, joinTimer, me, id, capacity, nextMove, scoreKey, feedUntil;
    const avatars = new Map();
    const names = new Map();
    const point = new T.Vector3();
    const delta = new T.Vector3();
    const bodyGeo = new T.BoxGeometry(.48, .55, .31);
    const headGeo = new T.SphereGeometry(.17, 10, 8);
    const limbGeo = new T.BoxGeometry(.16, .62, .17).translate(0, -.24, 0);
    const packGeo = new T.BoxGeometry(.32, .37, .13);
    const barrelGeo = new T.BoxGeometry(.10, .10, .57);
    const visorGeo = new T.BoxGeometry(.24, .055, .08);
    const uniform = new T.MeshStandardMaterial({ color: 0x3a4449, roughness: .88 });
    const armor = new T.MeshStandardMaterial({ color: 0xc67e4c, roughness: .68, emissive: 0x382011 });
    const visor = new T.MeshBasicMaterial({ color: 0xffc98d });
    const protectedVisor = new T.MeshBasicMaterial({ color: 0x9cffe6 });

    function buildAvatar() {
      const group = new T.Group();
      group.name = 'online-player';
      function part(geo, material, x, y, z) {
        const mesh = new T.Mesh(geo, material);
        mesh.position.set(x, y, z);
        group.add(mesh);
        return mesh;
      }
      part(bodyGeo, armor, 0, 1.16, 0);
      part(headGeo, uniform, 0, 1.61, 0);
      const face = part(visorGeo, visor, 0, 1.63, -.146);
      part(packGeo, uniform, 0, 1.19, .19);
      const legs = [-.14, .14].map((x) => part(limbGeo, uniform, x, .78, 0));
      part(limbGeo, uniform, -.29, 1.36, 0).rotation.x = .8;
      part(limbGeo, uniform, .29, 1.36, 0).rotation.x = 1.05;
      part(barrelGeo, uniform, .24, 1.23, -.37);
      scene.add(group);
      return { group, legs, face, target: new T.Vector3(), yaw: 0, stride: 0, life: -1 };
    }

    function send(message) {
      if (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 8192) {
        socket.send(JSON.stringify(message));
      }
    }

    function move(now) {
      if (!me?.hp || game.state !== 'playing') return;
      nextMove = now + 66;
      send({
        type: 'move', life: me.life, pos: player.pos.toArray(), yaw: player.yaw,
        height: player.sliding ? .88 : player.crouching ? 1.15 : 1.8,
      });
    }

    const originalDamage = player.damage.bind(player);
    player.damage = function (...args) {
      if (!socket) return originalDamage(...args);
    };
    const originalPressed = input.pressed.bind(input);
    input.pressed = function (action) {
      if (socket && ['weapon3', 'grenade'].includes(action)) return false;
      return originalPressed(action);
    };

    function updateLocal(state, from) {
      if (!me || state.life !== me.life) {
        player.reset({ pos: point.fromArray(state.pos), yaw: state.yaw });
        weapon.reset();
        weapon.setVisible(true);
        nextMove = 0;
      } else if (state.hp < me.hp) {
        player.health = me.hp;
        originalDamage(me.hp - state.hp, from ? point.fromArray(from) : null);
      }
      player.health = state.hp;
      player.enabled = state.hp > 0;
      if (!state.hp) weapon.setVisible(false);
      me = state;
    }

    function renderState(list) {
      const present = new Set();
      for (const state of list) {
        names.set(state.id, state.name);
        if (state.id === id) {
          updateLocal(state);
          continue;
        }
        present.add(state.id);
        const avatar = avatars.get(state.id) || buildAvatar();
        avatar.target.fromArray(state.pos);
        avatar.yaw = state.yaw;
        if (avatar.life !== state.life) {
          avatar.group.position.copy(avatar.target);
          avatar.group.rotation.y = state.yaw;
        }
        avatar.life = state.life;
        avatar.group.visible = state.hp > 0;
        avatar.group.scale.y = state.height / 1.8;
        avatar.face.material = state.protected ? protectedVisor : visor;
        avatars.set(state.id, avatar);
      }
      for (const [other, avatar] of avatars) {
        if (!present.has(other)) {
          scene.remove(avatar.group);
          avatars.delete(other);
          names.delete(other);
        }
      }

      count.textContent = list.length + '/' + capacity;
      const ranking = [...list].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.id - b.id);
      const nextKey = ranking.map(({ id, kills, deaths }) => [id, kills, deaths].join('/')).join(',');
      if (scoreKey !== nextKey) {
        scoreKey = nextKey;
        scores.replaceChildren(...ranking.map((entry) => {
          const row = document.createElement('li');
          const label = document.createElement('span');
          const tally = document.createElement('span');
          label.textContent = entry.name + (entry.id === id ? ' (you)' : '');
          tally.textContent = entry.kills + 'K · ' + entry.deaths + 'D';
          row.toggleAttribute('data-local', entry.id === id);
          row.append(label, tally);
          return row;
        }));
      }
      const text = !me?.hp ? 'Respawning in ' + Math.max(1, Math.ceil(me.livesIn / 1000)) + '…'
        : me.protected ? 'Spawn protection' : list.length === 1
          ? (hostsRoom ? 'Waiting for opponents · Pause to copy invite link' : 'Waiting for opponents') : '';
      setNotice(text);
    }

    function setNotice(text) {
      if (notice.textContent !== text) notice.textContent = text;
      notice.hidden = !text;
    }

    function receive(message) {
      switch (message.type) {
        case 'welcome':
          clearTimeout(joinTimer);
          id = message.id;
          capacity = message.capacity;
          inviteButton.hidden = !socket.invite;
          renderState([message.player]);
          break;
        case 'state':
          renderState(message.players);
          break;
        case 'damage':
          if (me?.life === message.life) updateLocal({ ...me, hp: message.hp, livesIn: 2500 }, message.from);
          break;
        case 'correct':
          if (me?.life === message.life && me.hp) player.recallTo(point.fromArray(message.pos));
          break;
        case 'shot':
          if (message.id === id) {
            if (message.hit) hud.hitmarker(message.kill ? 'kill' : 'hit');
          } else {
            const origin = new T.Vector3().fromArray(message.origin);
            const end = new T.Vector3().fromArray(message.end);
            fx.tracer?.(origin, end, { color: 0xffc27a, speed: 245, width: .026 });
            audio.play?.(message.weapon + '_shot', { pos: origin, gain: .65 });
          }
          break;
        case 'elimination': {
          const victim = names.get(message.victim) || 'A player';
          const attacker = names.get(message.attacker) || 'A player';
          feed.textContent = message.attacker === null ? victim + ' fell into the harbor' : attacker + ' eliminated ' + victim;
          feedUntil = performance.now() + 3800;
          break;
        }
        case 'error':
          leave(message.message);
          break;
      }
    }

    function leave(reason) {
      if (!socket) return;
      const old = socket;
      socket = null;
      clearTimeout(joinTimer);
      old.close();
      for (const { group } of avatars.values()) scene.remove(group);
      avatars.clear();
      names.clear();
      scores.replaceChildren();
      feed.textContent = '';
      scoreKey = me = id = null;
      display.hidden = true;
      inviteButton.hidden = true;
      inviteButton.textContent = 'Copy invite link';
      document.body.classList.remove('sl-online-live');
      if (reason) {
        game.toTitle();
        status.textContent = reason;
        dialog.showModal();
      }
    }

    function join() {
      const url = new URL('/online', location.href);
      url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const connection = rooms ? rooms.create(rooms.room) : new WebSocket(url);
      socket = connection;
      joinTimer = setTimeout(() => leave('Could not reach the arena. Try again.'), rooms ? 18000 : 6500);
      connection.addEventListener('open', () => {
        if (socket === connection) send({ type: 'join', name: name.value });
      });
      connection.addEventListener('message', (event) => {
        if (socket === connection) receive(JSON.parse(event.data));
      });
      connection.addEventListener('close', (event) => {
        if (socket === connection) leave(event.reason || (id ? 'Connection lost. Join again to return to the arena.' : 'Arena unavailable at this address.'));
      });
      dialog.close();
      document.body.classList.add('sl-online-live');
      audio.resume?.();
      game.start({ mode, skipIntro: true });
      player.enabled = false;
      weapon.setVisible(false);
      input.requestLock();
      showMatch();
      setNotice('Connecting to arena…');
    }

    function showMatch() {
      display.hidden = !socket || game.state !== 'playing';
    }

    function showLobby() {
      status.textContent = webPage ? '' : 'Open Saltline using the online server address to join.';
      submit.disabled = !webPage;
      dialog.showModal();
    }
    joinButton.addEventListener('click', showLobby);
    if (rooms?.room && game.state === 'title') showLobby();
    dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    form.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') event.stopPropagation();
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (webPage && !socket) join();
    });
    events.on('game:state', ({ state }) => {
      if (state === 'title') leave();
      showMatch();
    });
    events.on('weapon:fire', ({ dir, origin, weapon: fired }) => {
      if (!socket || !me?.hp || game.state !== 'playing') return;
      if (performance.now() >= nextMove) move(performance.now());
      send({ type: 'fire', life: me.life, weapon: fired, direction: dir.toArray(), eye: origin.y - player.pos.y });
    });

    const update = game.update.bind(game);
    game.update = function (dt) {
      const result = update(dt);
      if (!socket) return result;
      if (me) player.health = me.hp;
      const now = performance.now();
      if (now >= nextMove) move(now);
      if (feedUntil && now >= feedUntil) {
        feed.textContent = '';
        feedUntil = 0;
      }
      const blend = 1 - Math.exp(-18 * dt);
      for (const { group, target, yaw, legs } of avatars.values()) {
        if (!group.visible) continue;
        delta.copy(target).sub(group.position);
        group.position.lerp(target, blend);
        const angle = yaw - group.rotation.y;
        group.rotation.y += Math.atan2(Math.sin(angle), Math.cos(angle)) * blend;
        const swing = Math.sin(now * .013) * Math.min(.6, Math.hypot(delta.x, delta.z) * 3);
        legs[0].rotation.x = swing;
        legs[1].rotation.x = -swing;
      }
      return result;
    };
  }

  boot();
})();
