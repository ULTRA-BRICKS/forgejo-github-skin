/** Local HTTP harness for the streaming search consumer: a real server writing NDJSON over chunked HTTP, so
 * Chromium and WebKit exercise genuine fetch streaming (headers, partial chunks, disconnects, client aborts).
 * It serves the real src/ modules and built theme sheets, plus a native-shaped Forgejo repository page.
 * Not a spec file: imported by tests/mobile/*stream*.spec.mjs only.
 */
import http from 'node:http';
import fs from 'node:fs/promises';

const root=new URL('../../',import.meta.url);
export const started={v:1,type:'started'};
export const heartbeat={v:1,type:'heartbeat'};
export const done={v:1,type:'done'};
export const result=data=>({v:1,type:'result',data});
export const failure=(code='search_unavailable',status=503)=>({v:1,type:'error',code,status});
export const ndjson=(...items)=>items.map(item=>typeof item==='string'?item:JSON.stringify(item)).join('\n')+'\n';
export const STREAM_TYPE='application/x-ndjson';
export const TEXT={
  searching:'Searching…',
  signIn:'Sign in to search repositories you can access.',
  unavailable:'Search is temporarily unavailable. Please try again later.'
};

const page=({theme,lang})=>`<!doctype html><html lang="${lang}" data-theme="hypergithub-${theme}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/css/theme-hypergithub-${theme}.css"><link rel="stylesheet" href="/src/universal-search.css"><style>body{margin:0;background:var(--hgh-color-canvas)}#navbar,.navbar-left,.navbar-right,.navbar-mobile-right{display:flex;align-items:center;gap:8px}.navbar-right{margin-left:auto}.navbar-mobile-right{display:none}@media(max-width:767px){.navbar-left{width:100%}.navbar-mobile-right{display:flex;margin-left:auto}.navbar-right{display:none}}</style></head><body><nav id="navbar"><div class="navbar-left"><a id="navbar-logo" href="/">Forgejo</a><div class="navbar-mobile-right"></div></div><div class="navbar-right"><a href="/user/login">Sign in</a></div></nav><div class="repo-header"><div class="flex-item-title"><a href="/acme">acme</a> / <a href="/acme/project">project</a></div></div><form class="code-search"><input type="search" placeholder="Search code" aria-label="Native code search"></form><main>Native page content</main></body></html>`;

const types={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css'};
const typeOf=pathname=>types[pathname.slice(pathname.lastIndexOf('.'))]||'text/plain';

/** One `entry` per non-empty search request, in arrival order; readiness probes (empty q) are answered as JSON. */
export async function startSearchServer(){
  const searches=[],probes=[],sockets=new Set();
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://localhost');
      if(url.pathname==='/api/hypersearch'){
        const entry={
          url:req.url,q:url.searchParams.get('q'),accept:req.headers.accept,res,closed:false,finished:false,
          start(contentType=STREAM_TYPE,status=200){res.writeHead(status,{'Content-Type':contentType,'Cache-Control':'no-store','X-Accel-Buffering':'no'});res.flushHeaders();return entry;},
          write(chunk){res.write(chunk);return entry;},
          end(){res.end();return entry;},
          drop(){res.socket?.destroy();return entry;},
          json(body,status=200,contentType='application/json'){res.writeHead(status,{'Content-Type':contentType});res.end(JSON.stringify(body));return entry;}
        };
        res.on('close',()=>{entry.closed=true;entry.finished=res.writableFinished;});
        res.on('error',()=>{});
        if(!entry.q){probes.push(entry);entry.json({});return;}
        searches.push(entry);
        return;
      }
      if(url.pathname.startsWith('/src/')){
        res.writeHead(200,{'Content-Type':typeOf(url.pathname)}).end(await fs.readFile(new URL(url.pathname.slice(1),root)));
        return;
      }
      if(url.pathname.startsWith('/assets/css/theme-forgejo-')){res.writeHead(200,{'Content-Type':'text/css'}).end('');return;}
      if(url.pathname.startsWith('/assets/')){
        res.writeHead(200,{'Content-Type':typeOf(url.pathname)}).end(await fs.readFile(new URL('dist/public'+url.pathname,root)));
        return;
      }
      res.writeHead(200,{'Content-Type':'text/html'}).end(page({theme:url.searchParams.get('theme')==='dark'?'dark':'light',lang:url.searchParams.get('lang')||'en'}));
    }catch(error){res.writeHead(500).end(String(error));}
  });
  server.on('connection',socket=>{socket.setNoDelay(true);sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  return {
    origin,searches,probes,
    reset(){searches.length=0;probes.length=0;},
    close(){for(const socket of sockets)socket.destroy();return new Promise(resolve=>server.close(resolve));}
  };
}
