// Match rules shared by the Node server and browser-hosted rooms.
(function () {
  'use strict';

  function createArena(terminal) {
    const capacity = 12;
    const respawnDelay = 2500;
    const spawnProtection = 1400;
    const weapons = new Map([
      ['rifle', { damage: 26, range: 300, interval: 78 }],
      ['pistol', { damage: 34, range: 120, interval: 130 }],
    ]);
    const players = new Map();
    let nextId = 1;

    function broadcast(message) {
      for (const player of players.values()) player.channel.send(message);
    }

    function snapshot(player, now) {
      const { id, name, pos, yaw, height, hp, kills, deaths, life } = player;
      return {
        id, name, pos, yaw, height, hp, kills, deaths, life,
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
      player.height = 1.8;
      player.hp = 100;
      player.respawnAt = 0;
      player.protectedUntil = now + spawnProtection;
      player.lastMove = now;
      player.lastShot = now;
      player.travel = 1.35;
      player.climb = 1.1;
    }

    function eliminate(victim, attacker, now) {
      victim.hp = 0;
      victim.deaths++;
      victim.respawnAt = now + respawnDelay;
      if (attacker) attacker.kills++;
      broadcast({ type: 'elimination', victim: victim.id, attacker: attacker?.id ?? null });
    }

    function vector(value) {
      return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
    }

    function updatePosition(player, message, now) {
      const { pos, yaw, height } = message;
      if (!vector(pos) || !Number.isFinite(yaw) || !Number.isFinite(height)) return;
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
      player.height = Math.max(.85, Math.min(1.8, height));
      if (y < -1.55) eliminate(player, null, now);
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
      const weapon = weapons.get(message.weapon);
      if (!weapon || now < player.protectedUntil || now - player.lastShot < weapon.interval) return;
      if (!vector(message.direction) || !Number.isFinite(message.eye)) return;
      const length = Math.hypot(...message.direction);
      if (length < .99 || length > 1.01) return;
      const direction = message.direction.map((value) => value / length);
      const [x, y, z] = player.pos;
      const origin = [x, y + Math.max(.65, Math.min(1.85, message.eye)), z];
      player.lastShot = now;

      let range = weapon.range;
      for (const box of terminal.boxes) range = Math.min(range, distanceToBox(origin, direction, box, range));
      let target;
      for (const opponent of players.values()) {
        if (opponent === player || opponent.hp <= 0) continue;
        const [tx, ty, tz] = opponent.pos;
        const radius = .37;
        const box = [tx - radius, ty, tz - radius, tx + radius, ty + opponent.height, tz + radius];
        const distance = distanceToBox(origin, direction, box, range);
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
          channel.send({ type: 'welcome', id, capacity, player: snapshot(player, now) });
          return;
        }
        if (!player || player.hp <= 0 || message.life !== player.life) return;
        if (message.type === 'move') updatePosition(player, message, now);
        if (message.type === 'fire') fire(player, message, now);
      }

      return { receive, close };
    }

    function tick() {
      if (!players.size) return;
      const now = Date.now();
      for (const player of players.values()) {
        if (player.respawnAt && now >= player.respawnAt) spawn(player, now);
      }
      broadcast({ type: 'state', players: [...players.values()].map((player) => snapshot(player, now)) });
    }

    return { attach, tick };
  }

  if (typeof module === 'object') module.exports = createArena;
  else window.SaltlineArena = createArena;
})();
