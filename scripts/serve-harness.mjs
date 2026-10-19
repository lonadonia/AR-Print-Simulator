#!/usr/bin/env node
/**
 * Local integration harness (development only).
 *
 *   http://localhost:4174/  — "Wix page" simulator (wix/harness/host.html) + demo media with CORS
 *   http://localhost:4175/  — the editor built with `npm run build:harness` (dist-harness/)
 *
 * The two ports are different origins, so the editor/page messaging runs through the browser's
 * real cross-origin postMessage path with the origin allow-list from .env.harness.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.map': 'application/json', '.svg': 'image/svg+xml' };

function serveFile(res, file, headers = {}) {
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain', ...headers });
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', ...headers });
  createReadStream(file).pipe(res);
}

function safeJoin(base, urlPath) {
  const p = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const full = join(base, p);
  return full.startsWith(base) ? full : null;
}

const host = createServer((req, res) => {
  const url = req.url ?? '/';
  if (url === '/' || url.startsWith('/?')) return serveFile(res, join(ROOT, 'wix', 'harness', 'host.html'));
  if (url.startsWith('/geometry.json')) return serveFile(res, join(ROOT, 'src', 'catalog', 'demoGeometry.json'));
  if (url.startsWith('/media/')) {
    const file = safeJoin(join(ROOT, 'public', 'demo'), url.slice('/media'.length));
    // Media is served with CORS like a CDN that allows cross-origin image use (required for WebGL).
    return file ? serveFile(res, file, { 'Access-Control-Allow-Origin': '*' }) : serveFile(res, '');
  }
  serveFile(res, '');
});

const editorRoot = join(ROOT, 'dist-harness');
const editor = createServer((req, res) => {
  const url = req.url ?? '/';
  const file = safeJoin(editorRoot, url === '/' || url.startsWith('/?') ? '/index.html' : url);
  serveFile(res, file ?? '');
});

if (!existsSync(editorRoot)) console.warn('dist-harness/ not found — run `npm run build:harness` first.');
host.listen(4174, () => console.log('Wix page simulator: http://localhost:4174/'));
editor.listen(4175, () => console.log('Editor (harness build): http://localhost:4175/'));
