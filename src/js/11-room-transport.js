/* Host a Saltline arena in the creator's browser on GitHub Pages. */
(() => {
  'use strict';
  const terminal = JSON.parse(document.getElementById('sl-online-terminal').textContent);
  const roomKey = /^[0-9a-f]{32}$/;
  const peerId = (key) => 'saltline-v1-' + key;

  function create(room) {
    const host = !room;
    const key = room || crypto.randomUUID().replaceAll('-', '');
    const Peer = window.peerjs.Peer;
    const peer = host ? new Peer(peerId(key)) : new Peer();
    const transport = new EventTarget();
    const channels = new Set();
    let remote, local, timer, reconnect;
    transport.readyState = 0;
    Object.defineProperty(transport, 'bufferedAmount', {
      get: () => remote?.dataChannel?.bufferedAmount || 0,
    });
    transport.invite = host ? new URL(location.href) : null;
    transport.invite?.searchParams.set('room', key);

    const open = () => {
      if (transport.readyState !== 0) return;
      transport.readyState = 1;
      transport.dispatchEvent(new Event('open'));
    };
    const receive = (data) => {
      if (transport.readyState === 1 && typeof data === 'string' && data.length <= 8192) {
        transport.dispatchEvent(new MessageEvent('message', { data }));
      }
    };

    transport.close = (reason = '') => {
      if (transport.readyState === 3) return;
      transport.readyState = 3;
      clearInterval(timer);
      clearTimeout(reconnect);
      window.removeEventListener('pagehide', closeTab);
      local?.close();
      peer.destroy();
      transport.dispatchEvent(new CloseEvent('close', { reason }));
    };
    const closeTab = () => transport.close();
    window.addEventListener('pagehide', closeTab);

    transport.send = (data) => {
      if (transport.readyState !== 1) return;
      if (host) local.receive(JSON.parse(data));
      else remote.send(data);
    };

    if (host) {
      const arena = window.SaltlineArena(terminal);
      peer.on('open', () => {
        if (transport.readyState !== 0) return;
        local = arena.attach({
          send: (message) => queueMicrotask(() => receive(JSON.stringify(message))),
          close: (reason) => queueMicrotask(() => transport.close(reason)),
        });
        timer = setInterval(arena.tick, 1000 / 15);
        open();
      });
      peer.on('connection', (channel) => {
        if (channels.size >= 24) {
          channel.close();
          return;
        }
        channels.add(channel);
        let match;
        const deadline = setTimeout(disconnect, 10000);
        function release() {
          clearTimeout(deadline);
          channels.delete(channel);
          match?.close();
        }
        function disconnect() {
          release();
          channel.close();
        }
        channel.on('open', () => {
          clearTimeout(deadline);
          match = arena.attach({
            send(message) {
              if (channel.open && channel.dataChannel.bufferedAmount < 32768) {
                channel.send(JSON.stringify(message));
              }
            },
            close: () => setTimeout(disconnect, 350),
          });
        });
        channel.on('data', (data) => {
          if (typeof data !== 'string' || data.length > 512) {
            disconnect();
            return;
          }
          let message;
          try { message = JSON.parse(data); } catch { return; }
          match?.receive(message);
        });
        channel.on('close', release);
        channel.on('error', disconnect);
      });
      peer.on('disconnected', () => {
        if (transport.readyState === 1 && !peer.destroyed) {
          reconnect = setTimeout(() => {
            if (peer.disconnected && !peer.destroyed) peer.reconnect();
          }, 1500);
        }
      });
    } else {
      peer.on('open', () => {
        remote = peer.connect(peerId(room), { serialization: 'raw', reliable: true });
        remote.on('open', open);
        remote.on('data', receive);
        remote.on('close', () => transport.close('The arena host disconnected.'));
        remote.on('error', () => transport.close('Could not connect to the host.'));
      });
    }
    peer.on('error', (error) => {
      if (error.type === 'peer-unavailable') {
        transport.close('That arena has ended or the host is offline.');
      } else if (transport.readyState === 0 || peer.destroyed) {
        transport.close('Could not reach the multiplayer connection service. Try again.');
      }
    });
    return transport;
  }

  const url = new URL(location.href);
  const room = url.searchParams.get('room');
  window.SaltlineRooms = { create, room: roomKey.test(room || '') ? room : null };
})();
