import { DurableObject } from 'cloudflare:workers';
import createArena from '../src/js/online-arena.js';
import terminal from './terminal.json';

const roomPath = /^\/online\/([0-9a-f]{32})$/;

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ service: 'saltline-rooms', version: 1 });
    }
    const match = url.pathname.match(roomPath);
    if (!match || request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Not found', { status: 404 });
    }
    if (request.headers.get('Origin') !== env.SALTLINE_GAME_ORIGIN) {
      return new Response('Forbidden', { status: 403 });
    }
    return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(request);
  },
};

export class SaltlineRoom extends DurableObject {
  arena;
  host;
  timer;
  connections = new Map();

  fetch(request) {
    const hosting = new URL(request.url).searchParams.get('host') === '1';
    const [browser, socket] = Object.values(new WebSocketPair());
    socket.accept();
    const error = hosting && this.host ? 'This room already has a host.'
      : !hosting && !this.host ? 'This room has ended or its host is offline.'
      : this.connections.size >= 24 ? 'Too many connections. Try again shortly.' : '';
    if (error) {
      socket.send(JSON.stringify({ type: 'error', message: error }));
      socket.close(1008, error);
    } else {
      if (hosting) {
        this.arena = createArena(terminal);
        this.host = socket;
        this.timer = setInterval(this.arena.tick, 1000 / 15);
      }
      const session = this.arena.attach({
        send(message) {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
        },
        close: (reason) => this.disconnect(socket, 1008, reason),
      });
      this.connections.set(socket, session);
      socket.addEventListener('message', ({ data }) => {
        if (typeof data !== 'string' || data.length > 512) {
          this.disconnect(socket, 1008, 'Invalid match message.');
          return;
        }
        let message;
        try { message = JSON.parse(data); } catch { return; }
        session.receive(message);
      });
      socket.addEventListener('close', () => this.disconnect(socket));
      socket.addEventListener('error', () => this.disconnect(socket));
    }
    return new Response(null, { status: 101, webSocket: browser });
  }

  disconnect(socket, code = 1000, reason = '') {
    const connection = this.connections.get(socket);
    if (!connection) return;
    this.connections.delete(socket);
    connection.close();
    if (socket.readyState === WebSocket.OPEN) socket.close(code, reason);
    if (this.host === socket) {
      this.host = null;
      clearInterval(this.timer);
      for (const guest of this.connections.keys()) {
        this.disconnect(guest, 1000, 'The arena host disconnected.');
      }
      this.arena = null;
    }
  }
}
