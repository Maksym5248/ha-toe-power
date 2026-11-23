import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NotificationService, clientKey } from './notifications.mjs';
import { haUser } from './ha-users.mjs';
function json(res,status,body) {res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
async function readBody(req) {
 if (!String(req.headers['content-type']).startsWith('application/json')) throw new Error('Потрібен JSON запит.');
 let body='';for await (const chunk of req) {body+=chunk;if(Buffer.byteLength(body)>16384) throw new Error('Завеликий запит.');}return JSON.parse(body);
}
const allowed = new Set(['pw_cities', 'pw_streets', 'pw-accounts/building-names', 'pw-accounts/building-groups', 'a_gpv_g']);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.yaml':'text/yaml; charset=utf-8'};
export function createAppServer({notifications=null,addon=false,root=resolve('dist/client'),trustedProxy='172.30.32.2',profileFor=user=>haUser(process.env.SUPERVISOR_TOKEN,user),fetcher=fetch}={}) {
return http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const ip = req.socket.remoteAddress?.replace(/^::ffff:/,'');
    if (addon && ip !== trustedProxy) return json(res,403,{error:'Access through Home Assistant Ingress only.'});
    if (url.pathname.startsWith('/app-api/')) {
      if (!notifications && !addon && url.pathname==='/app-api/context' && req.method==='GET') return json(res,200,{available:false,userId:'standalone',isAdmin:true});
      if (!notifications) return json(res,503,{error:'Сповіщення доступні у встановленому add-on Home Assistant.'});
      const user = req.headers['x-remote-user-id'];
      if (typeof user!=='string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(user)) return json(res,401,{error:'Відкрийте застосунок через Home Assistant зі свого облікового запису.'});
      if (url.pathname==='/app-api/context' && req.method==='GET') {
        try {return json(res,200,{...await profileFor(user),home:notifications.home,available:true});}
        catch {return json(res,503,{error:'Не вдалося визначити права користувача Home Assistant.'});}
      }
      const key=clientKey(user);
      try {
        if(url.pathname==='/app-api/home' && req.method==='GET') return json(res,200,{home:notifications.home});
        if(url.pathname==='/app-api/notifications' && req.method==='GET') return json(res,200,{...notifications.state(key),devices:await notifications.devices()});
        if(req.method!=='POST') return json(res,405,{error:'Method not allowed'});
        const body=await readBody(req);
        if(url.pathname==='/app-api/home') {
          const profile=await profileFor(user);
          if(!profile.isAdmin) return json(res,403,{error:'Адресу дому може змінити лише адміністратор Home Assistant.'});
          return json(res,200,{home:await notifications.saveHome(body.address)});
        }
        if(url.pathname==='/app-api/pair/start') {await notifications.startPairing(key,body.device);return json(res,200,{sent:true});}
        if(url.pathname==='/app-api/pair/confirm') return json(res,200,await notifications.confirmPairing(key,body.code));
        if(url.pathname==='/app-api/notifications') return json(res,200,await notifications.save(key,body));
        if(url.pathname==='/app-api/notifications/test') {await notifications.test(key);return json(res,200,{sent:true});}
        return json(res,404,{error:'Not found'});
      } catch(error) { return json(res,400,{error:error instanceof SyntaxError?'Некоректний запит.':error.message}); }
    }
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    if (url.pathname.startsWith('/toe-api/')) {
      const endpoint = url.pathname.slice('/toe-api/'.length);
      if (!allowed.has(endpoint)) { res.writeHead(404); return res.end(); }
      const upstream = new URL(`https://api-poweron.toe.com.ua/api/${endpoint}`); upstream.search = url.search;
      const headers = { Accept: 'application/json' };
      if (req.headers['x-debug-key']) headers['X-debug-key'] = req.headers['x-debug-key'];
      const response = await fetcher(upstream, {headers, signal: AbortSignal.timeout(20000), redirect:'error'});
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
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const addon=process.env.TOE_ADDON==='true';
  const notifications=addon&&process.env.SUPERVISOR_TOKEN?new NotificationService({directory:process.env.DATA_DIR||'/data/toe',token:process.env.SUPERVISOR_TOKEN}):null;
  if(notifications){await notifications.init();setInterval(()=>notifications.tick().catch(()=>console.error('Notification scheduler failed.')),30000).unref();notifications.tick().catch(()=>console.error('Notification scheduler unavailable.'));}
  createAppServer({addon,notifications}).listen(Number(process.env.PORT||4173),process.env.HOST||'127.0.0.1',()=>console.log(`ТОЕ server on port ${process.env.PORT||4173}`));
}
