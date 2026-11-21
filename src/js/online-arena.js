// Match rules shared by the hosted worker, Node server and browser-hosted rooms.
(function (weapons, posture) {
  'use strict';

  const protocol = 2;
  const weaponIds = Object.keys(weapons);
  const heights = { stand: 1.8, crouch: 1.22, slide: .92 };

  function createArena(terminal) {
    const capacity = 12;
    const respawnDelay = 2500;
    const spawnProtection = 1400;
    const players = new Map();
    let nextId = 1;

    function broadcast(message) {
      for (const player of players.values()) player.channel.send(message);
    }

    function snapshot(player, now) {
      const { id, name, pos, yaw, pitch, ads, height, stride, weapon, hp, kills, deaths, life } = player;
      return {
        id, name, pos, yaw, pitch, ads, height, stride, weapon, hp, kills, deaths, life,
        speed: now - player.lastMove < 240 ? player.speed : 0,
        livesIn: Math.max(0, player.respawnAt - now),
        protected: now < player.protectedUntil,
      };
    }

    function spawn(player, now) {
      const opponents = [...players.values()].filter((other) => other !== player && other.hp > 0);
      let best = -Infinity;
      for (const point of terminal.spawns) {
        const distance = Math.min(30, ...opponents.map(({ pos }) => Math.hypot(point[0] - pos[0], point[2] - pos[2])));
        const score = distance + Math.random() * 5;
        if (score > best) {
          best = score;
          player.pos = point;
        }
      }
      player.life++;
      player.yaw = Math.atan2(player.pos[0], player.pos[2]);
      Object.assign(player, { pitch: 0, ads: false, height: heights.stand, speed: 0, stride: 0, weapon: 'rifle', reload: null, ammoSeq: 0 });
      player.loadout = Object.fromEntries(weaponIds.map((id) => [id, {
        ammo: weapons[id].magSize, reserve: weapons[id].reserve, readyAt: 0,
      }]));
      player.hp = 100;
      player.respawnAt = 0;
      player.protectedUntil = now + spawnProtection;
      player.lastMove = now;
      player.readyAt = now;
      player.travel = 1.35;
      player.climb = 1.1;
    }

    function eliminate(victim, attacker, now) {
      victim.hp = 0;
      victim.reload = null;
      victim.deaths++;
      victim.respawnAt = now + respawnDelay;
      if (attacker) attacker.kills++;
      broadcast({ type: 'elimination', victim: victim.id, attacker: attacker?.id ?? null });
    }

    function vector(value) {
      return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
    }

    function updatePosition(player, message, now) {
      const { pos, yaw, pitch, stance } = message;
      if (!vector(pos) || !Number.isFinite(yaw) || !Number.isFinite(pitch) || !Object.hasOwn(heights, stance)) return;
      const [x, y, z] = pos;
      const [minX, , minZ, maxX, maxY, maxZ] = terminal.bounds;
      if (x < minX || x > maxX || z < minZ || z > maxZ || y < -8 || y > maxY) return;

      const elapsed = (now - player.lastMove) / 1000;
      player.lastMove = now;
      player.travel = Math.min(1.35, player.travel + elapsed * 9);
      player.climb = Math.min(1.1, player.climb + elapsed * 7);
      const travel = Math.hypot(x - player.pos[0], z - player.pos[2]);
      const climb = Math.max(0, y - player.pos[1]);
      if (travel > player.travel || climb > player.climb) {
        player.channel.send({ type: 'correct', life: player.life, pos: player.pos });
        return;
      }
      player.travel -= travel;
      player.climb -= climb;
      player.pos = pos;
      player.yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
      player.pitch = Math.max(-1.55, Math.min(1.55, pitch));
      player.height = heights[stance];
      player.ads = message.ads === true;
      player.speed = .48 * player.speed + .52 * Math.min(9, travel / Math.max(.025, elapsed));
      player.stride = (player.stride + travel) % (2 * Math.PI / 5.1);
      if (y < -1.55) eliminate(player, null, now);
    }

    function inventory(player) {
      return weaponIds.map((id) => {
        const { ammo, reserve } = player.loadout[id];
        return [id, ammo, reserve];
      });
    }

    function sendAmmo(player) {
      player.channel.send({ type: 'ammo', life: player.life, seq: player.ammoSeq, inventory: inventory(player) });
    }

    function finishReload(player, now) {
      if (!player.reload || now < player.reload.readyAt) return;
      const id = player.reload.id;
      const slot = player.loadout[id];
      const loaded = Math.min(weapons[id].magSize - slot.ammo, slot.reserve);
      slot.ammo += loaded;
      slot.reserve -= loaded;
      player.reload = null;
      sendAmmo(player);
    }

    function startReload(player, now) {
      const id = player.weapon;
      const slot = player.loadout[id];
      const rule = weapons[id];
      if (player.reload || !slot.reserve || slot.ammo === rule.magSize) return;
      player.reload = { id, readyAt: now + (slot.ammo ? rule.reload : rule.emptyReload) };
    }

    // Slab intersection with the same axis-aligned cover used by the terminal.
    function distanceToBox(origin, direction, box, range) {
      let near = 0;
      let far = range;
      for (let axis = 0; axis < 3; axis++) {
        const offset = origin[axis];
        const speed = direction[axis];
        if (Math.abs(speed) < 1e-8) {
          if (offset < box[axis] || offset > box[axis + 3]) return Infinity;
          continue;
        }
        const a = (box[axis] - offset) / speed;
        const b = (box[axis + 3] - offset) / speed;
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
        if (near > far) return Infinity;
      }
      return near;
    }

    function fire(player, message, now) {
      const id = player.weapon;
      const weapon = weapons[id];
      const slot = player.loadout[id];
      if (id !== message.weapon || !slot.ammo || player.reload || now < player.protectedUntil
        || now < slot.readyAt || now < player.readyAt || !vector(message.direction)) return;
      const length = Math.hypot(...message.direction);
      if (length < .99 || length > 1.01) return;
      const direction = message.direction.map((value) => value / length);
      const [x, y, z] = player.pos;
      const origin = [x, y + player.height - .14, z];
      player.readyAt = now + Math.min(weapon.interval, 130);
      slot.readyAt = now + weapon.interval;
      slot.ammo--;

      let range = weapon.range;
      for (const box of terminal.boxes) range = Math.min(range, distanceToBox(origin, direction, box, range));
      let target;
      for (const opponent of players.values()) {
        if (opponent === player || opponent.hp <= 0) continue;
        const distance = posture.hitDistance(opponent, origin, direction, range);
        if (distance < range) {
          target = opponent;
          range = distance;
        }
      }

      const hit = target && now >= target.protectedUntil;
      if (hit) {
        target.hp = Math.max(0, target.hp - weapon.damage);
        target.channel.send({ type: 'damage', hp: target.hp, from: origin, life: target.life });
        if (target.hp === 0) eliminate(target, player, now);
      }
      const end = origin.map((value, axis) => value + direction[axis] * range);
      broadcast({ type: 'shot', id: player.id, weapon: message.weapon, origin, end, hit: !!hit, kill: !!hit && target.hp === 0 });
    }

    function attach(channel) {
      let player;
      let closed = false;
      let lastMessage = Date.now();
      let allowance = 60;
      const joinTimeout = setTimeout(() => terminate('Join timed out'), 5000);

      function close() {
        if (closed) return;
        closed = true;
        clearTimeout(joinTimeout);
        if (player) players.delete(player.id);
      }

      function terminate(reason) {
        close();
        channel.close(reason);
      }

      function receive(message) {
        if (closed) return;
        const now = Date.now();
        allowance = Math.min(60, allowance + (now - lastMessage) * .045);
        lastMessage = now;
        if (--allowance < 0) {
          terminate('Too many messages');
          return;
        }
        if (!message || typeof message !== 'object') return;
        if (message.type === 'join' && !player) {
          clearTimeout(joinTimeout);
          if (message.protocol !== protocol) {
            channel.send({ type: 'error', message: 'Reload Saltline to join this arena with the latest game version.' });
            terminate('Update required');
            return;
          }
          if (players.size >= capacity) {
            channel.send({ type: 'error', message: 'Arena full. Try again when a player leaves.' });
            terminate('Arena full');
            return;
          }
          const name = typeof message.name === 'string' ? message.name.trim().replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 18).trim() : '';
          const id = nextId++;
          player = { channel, id, name: name || 'Player ' + id, kills: 0, deaths: 0, life: 0 };
          spawn(player, now);
          players.set(id, player);
          channel.send({ type: 'welcome', protocol, id, capacity, inventory: inventory(player), player: snapshot(player, now) });
          return;
        }
        if (!player || player.hp <= 0 || message.life !== player.life) return;
        finishReload(player, now);
        if (message.type === 'move') updatePosition(player, message, now);
        if (message.type === 'equip' && weaponIds.includes(message.weapon)) {
          if (message.weapon !== player.weapon) player.reload = null;
          player.weapon = message.weapon;
        }
        if (message.type === 'reload' && message.weapon === player.weapon) startReload(player, now);
        if (message.type === 'cancelReload') player.reload = null;
        if (message.type === 'fire' && Number.isSafeInteger(message.seq) && message.seq > player.ammoSeq) {
          player.ammoSeq = message.seq;
          fire(player, message, now);
          sendAmmo(player);
        }
      }

      return { receive, close };
    }

    function tick() {
      if (!players.size) return;
      const now = Date.now();
      const respawned = [];
      for (const player of players.values()) {
        if (player.respawnAt && now >= player.respawnAt) {
          spawn(player, now);
          respawned.push(player);
        }
        finishReload(player, now);
      }
      broadcast({ type: 'state', players: [...players.values()].map((player) => snapshot(player, now)) });
      for (const player of respawned) sendAmmo(player);
    }

    return { attach, tick };
  }

  if (typeof module === 'object') module.exports = createArena;
  else window.SaltlineArena = createArena;
})(
  typeof module === 'object' ? require('./weapon-rules.js') : window.SaltlineWeaponRules,
  typeof module === 'object' ? require('./online-posture.js') : window.SaltlinePosture,
);
