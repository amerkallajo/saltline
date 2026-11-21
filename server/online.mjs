import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { WebSocket, WebSocketServer } from 'ws';
import createArena from '../src/js/online-arena.js';

const terminal = JSON.parse(await readFile(new URL('./terminal.json', import.meta.url), 'utf8'));
const page = await readFile(new URL('../dist/saltline.html', import.meta.url));
const compressed = gzipSync(page);
const etag = '"' + createHash('sha256').update(page).digest('hex') + '"';
const arena = createArena(terminal);

const http = createServer((req, res) => {
  const path = req.url?.split('?')[0];
  if ((req.method !== 'GET' && req.method !== 'HEAD') || !['/', '/saltline.html', '/dist/saltline.html'].includes(path)) {
    res.writeHead(404).end();
    return;
  }
  const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  const body = gzip ? compressed : page;
  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('ETag', etag);
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304).end();
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Length', body.length);
  if (gzip) res.setHeader('Content-Encoding', 'gzip');
  res.end(req.method === 'HEAD' ? undefined : body);
});

const sockets = new WebSocketServer({ noServer: true, maxPayload: 512 });
http.on('upgrade', (req, socket, head) => {
  let sameOrigin = false;
  try {
    const origin = new URL(req.headers.origin);
    sameOrigin = ['https:', 'http:'].includes(origin.protocol) && origin.host === req.headers.host;
  } catch {}
  if (req.url !== '/online' || !sameOrigin || sockets.clients.size >= 32) {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    return;
  }
  sockets.handleUpgrade(req, socket, head, (ws) => sockets.emit('connection', ws));
});

sockets.on('connection', (socket) => {
  const match = arena.attach({
    send(message) {
      if (socket.readyState === WebSocket.OPEN && socket.bufferedAmount < 32768) {
        socket.send(JSON.stringify(message));
      }
    },
    close(reason) {
      socket.close(1008, reason);
    },
  });
  socket.on('error', () => socket.terminate());
  socket.on('close', match.close);
  socket.on('message', (data, binary) => {
    if (binary) {
      socket.close(1008, 'Text messages required');
      return;
    }
    let message;
    try { message = JSON.parse(data); } catch { return; }
    match.receive(message);
  });
});
setInterval(arena.tick, 1000 / 15);

const port = Number(process.env.PORT || 8080);
http.listen(port, process.env.HOST || '0.0.0.0', () => {
  console.log('Saltline Online listening on port ' + http.address().port);
});
