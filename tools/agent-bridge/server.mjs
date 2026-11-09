#!/usr/bin/env node
// Agent bridge (ADR 0013): local HTTP server on 127.0.0.1 only. Started by hand: npm run bridge.
//   POST /hook     redacted hook payload from hook.mjs (redacted again here), stored in a ring buffer
//   GET  /events   Server-Sent Events; resumes after Last-Event-ID (header or ?lastEventId=)
//   GET  /replay   harness/runs/agent-room-replay.json (written by replay.mjs), if present
//   GET  /registry agent id -> specialist records (harness/runs/agent-registry.json, see registry.mjs)
//   GET  /health   { ok, seq, clients }
// CORS allows the Vite dev origins only. No dependencies, no commands from the room (decision 5).
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ring, readTuning, redact, sseFrame } from './lib.mjs';
import { readRegistry } from './registry.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { port, ring: ringSize } = readTuning(ROOT);
const ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']);
const MAX_BODY = 64 * 1024;
const ring = new Ring(ringSize);
const clients = new Set();

function cors(req, res) {
  const o = req.headers.origin;
  if (o && ORIGINS.has(o)) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, last-event-id');
  }
}

const server = createServer((req, res) => {
  cors(req, res);
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (req.method === 'OPTIONS') return void res.writeHead(204).end();
  if (req.method === 'POST' && url.pathname === '/hook') {
    let body = '';
    let tooBig = false;
    req.on('data', (c) => {
      body += c;
      if (body.length > MAX_BODY) tooBig = true;
    });
    req.on('end', () => {
      if (tooBig) return void res.writeHead(413).end();
      try {
        const entry = ring.push({ t: Date.now(), payload: redact(JSON.parse(body), ROOT) });
        const frame = sseFrame(entry);
        for (const c of clients) c.write(frame);
        res.writeHead(204).end();
      } catch {
        res.writeHead(400).end();
      }
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write('retry: 2000\n\n');
    const last = req.headers['last-event-id'] ?? url.searchParams.get('lastEventId');
    for (const e of ring.since(last)) res.write(sseFrame(e));
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => {
      clearInterval(ping);
      clients.delete(res);
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/replay') {
    const file = join(ROOT, 'harness', 'runs', 'agent-room-replay.json');
    if (!existsSync(file)) return void res.writeHead(404).end();
    return void res.writeHead(200, { 'content-type': 'application/json' }).end(readFileSync(file));
  }
  if (req.method === 'GET' && url.pathname === '/registry') {
    return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(readRegistry(ROOT)));
  }
  if (req.method === 'GET' && url.pathname === '/health') {
    return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, seq: ring.seq, clients: clients.size }));
  }
  res.writeHead(404).end();
});

server.listen(port, '127.0.0.1', () => process.stdout.write(`agent bridge on http://127.0.0.1:${port} (ring ${ringSize})\n`));
