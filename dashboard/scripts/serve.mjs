import http from 'node:http';
import { readFile } from 'node:fs/promises';
const root = new URL('../dist/', import.meta.url);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const allowed = new Set(['index.html', 'styles.css', 'app.js', 'data.js']);
const server = http.createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const name = path === '/' ? 'index.html' : path.slice(1);
  if (!allowed.has(name)) { response.writeHead(404); response.end('Not found'); return; }
  try {
    const body = await readFile(new URL(name, root));
    response.writeHead(200, { 'Content-Type': types[name.slice(name.lastIndexOf('.'))], 'X-Content-Type-Options': 'nosniff' }); response.end(body);
  } catch { response.writeHead(500); response.end('Build the dashboard first.'); }
});
server.listen(Number(process.env.PORT ?? 4173), '127.0.0.1', () => console.log('Local: http://127.0.0.1:' + server.address().port));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close());
