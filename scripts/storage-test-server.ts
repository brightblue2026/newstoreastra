/** Isolated Storage protocol fixture. Never connects to a real Supabase project. */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
if (process.env.SUPABASE_URL !== 'http://localhost:54322' || !process.env.DATABASE_URL?.includes('_test')) throw new Error('Isolated test configuration required');
const files = new Map<string, { bytes: Buffer; type: string }>();
const tickets = new Map<string, string>();
createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, GET, DELETE, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,x-upsert');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  const url = new URL(req.url ?? '/', 'http://localhost:54322');
  const prefix = '/storage/v1/object/';
  const relative = url.pathname.slice(prefix.length);
  const authorised = req.headers.authorization === 'Bearer isolated-storage-only';
  if (req.method === 'POST' && relative.startsWith('upload/sign/') && authorised) {
    const key = relative.slice('upload/sign/'.length); const token = randomUUID(); tickets.set(token, key);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ url: `/object/upload/sign/${key}?token=${token}` })); return;
  }
  if (req.method === 'PUT' && relative.startsWith('upload/sign/')) {
    const key = relative.slice('upload/sign/'.length);
    if (tickets.get(url.searchParams.get('token') ?? '') !== key) { res.writeHead(403).end(); return; }
    if (files.has(key)) { res.writeHead(409).end(); return; }
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 20 * 1024 * 1024) { res.writeHead(413).end(); return; }
      chunks.push(Buffer.from(chunk));
    }
    files.set(key, { bytes: Buffer.concat(chunks), type: String(req.headers['content-type'] ?? '') });
    res.writeHead(200).end('{}'); return;
  }
  if (req.method === 'GET' && relative.startsWith('public/')) {
    const file = files.get(relative.slice('public/'.length));
    if (!file) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', file.type);
    const match = /^bytes=0-(\d+)$/.exec(req.headers.range ?? '');
    if (match) {
      const end = Math.min(Number(match[1]), file.bytes.length - 1);
      res.setHeader('Content-Range', `bytes 0-${end}/${file.bytes.length}`);
      res.writeHead(206).end(file.bytes.subarray(0, end + 1)); return;
    }
    res.writeHead(200, { 'Content-Length': file.bytes.length }).end(file.bytes); return;
  }
  if (req.method === 'DELETE' && authorised) { files.delete(relative); res.writeHead(200).end('{}'); return; }
  res.writeHead(404).end();
}).listen(54322, '127.0.0.1', () => console.log('Isolated Storage fixture ready'));
