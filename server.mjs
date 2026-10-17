import http from 'node:http';
import https from 'node:https';
import { readFile, mkdir, writeFile, stat, unlink } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { renderFormula } from './lib/render.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.SLIDETEX_PORT || 32178);
const tlsPort = Number(process.env.SLIDETEX_TLS_PORT || 32179);
const cache = join('/tmp', `slidetex-${process.getuid()}`);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
let rendering = false;

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function body(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 96000) throw new Error('请求过大。');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function handler(req, res) {
  try {
    const allowedHosts = [`localhost:${port}`, `127.0.0.1:${port}`, `localhost:${tlsPort}`, `127.0.0.1:${tlsPort}`];
    if (!allowedHosts.includes(req.headers.host)) return json(res, 403, { error: 'Localhost only' });
    const origin = req.headers.origin;
    if (origin && !allowedHosts.some(h => origin === `http://${h}` || origin === `https://${h}`)) {
      return json(res, 403, { error: 'Origin not allowed' });
    }
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/health' && req.method === 'GET') return json(res, 200, { name: 'SlideTeX', version: '0.1.0' });
    if (/^\/api\/images\/[a-f0-9]{64}\.png$/.test(url.pathname) && req.method === 'GET') {
      const png = await readFile(join(cache, url.pathname.split('/').pop()));
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store',
        ...(url.searchParams.get('download') === '1' ? { 'Content-Disposition': 'attachment; filename="SlideTeX.png"' } : {}) });
      return res.end(png);
    }
    if (url.pathname === '/api/render' && req.method === 'POST') {
      if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'JSON required' });
      if (rendering) return json(res, 429, { error: '正在生成上一条公式，请稍后重试。' });
      const input = await body(req);
      rendering = true;
      try {
        const result = await renderFormula(input);
        const id = createHash('sha256').update(result.png).digest('hex');
        await mkdir(cache, { recursive: true, mode: 0o700 });
        const path = join(cache, `${id}.png`);
        await writeFile(path, result.png, { mode: 0o600 });
        const { png, ...rest } = result;
        return json(res, 200, { ...rest, base64: png.toString('base64'), path, id });
      } finally { rendering = false; }
    }
    if (url.pathname === '/api/diagnostic' && req.method === 'POST') {
      // Records only add-in errors/host feature flags, never formula contents.
      const item = await body(req);
      console.log(JSON.stringify({ time: new Date().toISOString(), host: String(item.host).slice(0, 20), event: String(item.event).slice(0, 100), message: String(item.message || '').slice(0, 1000) }));
      return json(res, 200, { ok: true });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' });
    const relative = decodeURIComponent(['/', '/wps/taskpane.html'].includes(url.pathname) ? '/taskpane.html' : url.pathname);
    if (relative.includes('\0')) return json(res, 404, { error: 'Not found' });
    const base = join(root, 'web');
    const path = resolve(base, `.${relative}`);
    if (!path.startsWith(`${base}/`)) return json(res, 403, { error: 'Not allowed' });
    const content = await readFile(path);
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') return json(res, 404, { error: 'Not found' });
    return json(res, 400, { error: error.message });
  }
}

const server = http.createServer(handler);
server.on('error', error => { console.error(error.message); process.exit(1); });
server.listen(port, '127.0.0.1', () => console.log(`SlideTeX http://localhost:${port}`));
// HTTPS is enabled only when an explicitly provisioned local certificate exists.
const certDir = process.env.SLIDETEX_CERT_DIR || join(homedir(), 'Library/Application Support/SlideTeX/tls');
if (existsSync(join(certDir, 'localhost.crt')) && existsSync(join(certDir, 'localhost.key'))) {
  const tls = https.createServer({ cert: readFileSync(join(certDir, 'localhost.crt')), key: readFileSync(join(certDir, 'localhost.key')) }, handler);
  tls.on('error', error => console.error(`HTTPS: ${error.message}`));
  tls.listen(tlsPort, '127.0.0.1', () => console.log(`SlideTeX https://localhost:${tlsPort}`));
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(0));
