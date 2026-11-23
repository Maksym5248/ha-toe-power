import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const allowed = new Set(['pw_cities', 'pw_streets', 'pw-accounts/building-names', 'pw-accounts/building-groups', 'a_gpv_g']);
const root = resolve('dist/client');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.yaml':'text/yaml; charset=utf-8'};
const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    if (url.pathname.startsWith('/toe-api/')) {
      const endpoint = url.pathname.slice('/toe-api/'.length);
      if (!allowed.has(endpoint)) { res.writeHead(404); return res.end(); }
      const upstream = new URL(`https://api-poweron.toe.com.ua/api/${endpoint}`); upstream.search = url.search;
      const headers = { Accept: 'application/json' };
      if (req.headers['x-debug-key']) headers['X-debug-key'] = req.headers['x-debug-key'];
      const response = await fetch(upstream, {headers, signal: AbortSignal.timeout(20000), redirect:'error'});
      res.writeHead(response.status, {'Content-Type': response.headers.get('content-type') || 'application/json', 'Cache-Control':'no-store'});
      return res.end(req.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
    }
    const file = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (file !== root && !file.startsWith(root + '/')) { res.writeHead(403); return res.end(); }
    let content, type;
    try { content = await readFile(file); type = types[extname(file)]; }
    catch { if (extname(file) && extname(file) !== '.html') {res.writeHead(404);return res.end();} content = await readFile(resolve(root, 'index.html')); type = types['.html']; }
    res.writeHead(200, {'Content-Type':type || 'application/octet-stream'}); res.end(req.method === 'HEAD' ? undefined : content);
  } catch { res.writeHead(502, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'TOE unavailable'})); }
});
server.listen(Number(process.env.PORT || 4173), process.env.HOST || '127.0.0.1', () => console.log(`ТОЕ: http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 4173}`));
