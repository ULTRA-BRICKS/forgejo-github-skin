from __future__ import annotations
from dataclasses import asdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Event, Thread
from urllib.parse import parse_qs, quote, urlsplit
import json, os, signal, time
from access import AccessChecker
from index import SearchIndex
from query import validate

HOST=os.environ.get('HYPERSEARCH_HOST','127.0.0.1')
PORT=int(os.environ.get('HYPERSEARCH_PORT','3191'))
PUBLIC_ORIGIN=os.environ.get('HYPERSEARCH_ORIGIN','https://git.hyperide.ai').rstrip('/')
REPO_ROOT=os.environ.get('HYPERSEARCH_REPO_ROOT','/var/lib/forgejo/repositories')
STATE=os.environ.get('HYPERSEARCH_STATE','/var/lib/forgejo-search/index.sqlite3')
REFRESH=max(5,int(os.environ.get('HYPERSEARCH_REFRESH_SECONDS','20')))
FORGEJO_HOST=os.environ.get('HYPERSEARCH_FORGEJO_HOST','127.0.0.1')
FORGEJO_PORT=int(os.environ.get('HYPERSEARCH_FORGEJO_PORT','3000'))
PUBLIC_HOST=urlsplit(PUBLIC_ORIGIN).hostname or 'git.hyperide.ai'
BUILD=os.environ.get('HYPERSEARCH_BUILD','dev')
index=SearchIndex(STATE,REPO_ROOT)
access=AccessChecker(FORGEJO_HOST,FORGEJO_PORT,PUBLIC_HOST)
stopping=Event()

def result_url(item):
    repo=item['repo'];base=PUBLIC_ORIGIN+'/'+ '/'.join(quote(part,safe='') for part in repo.split('/'))
    if item['kind']=='repository': return base
    revision=item.get('revision') or 'HEAD';path='/'.join(quote(part,safe='') for part in item.get('path','').split('/') if part)
    url=base+'/src/commit/'+quote(revision,safe='')+'/'+path
    if item.get('line'): url+='#L'+str(item['line'])
    return url

def refresh_loop():
    while not stopping.is_set():
        try: index.refresh()
        except Exception as error: print('hypersearch refresh failed:',type(error).__name__,flush=True)
        stopping.wait(REFRESH)
class Handler(BaseHTTPRequestHandler):
    server_version='HyperSearch/1'
    def log_message(self,format,*args):
        print('%s %s'%(self.command,urlsplit(self.path).path),flush=True)
    def send_json(self,status,payload):
        body=json.dumps(payload,separators=(',',':'),ensure_ascii=False).encode()
        self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','private, no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Referrer-Policy','no-referrer');self.end_headers();self.wfile.write(body)
    def do_GET(self):
        url=urlsplit(self.path);path=url.path
        if path=='/health':
            stats=index.stats();return self.send_json(200,{'service':'hypersearch','build':BUILD,'ready':stats.get('repos',0)>0,**stats})
        if path=='/__hypersearch/health':
            if not self.headers.get('Cookie',''):return self.send_json(401,{'error':'authentication_required'})
            return self.send_json(200,{'service':'hypersearch','ready':index.stats().get('repos',0)>0})
        if path not in {'/query','/__hypersearch/query'}: return self.send_json(404,{'error':'not_found'})
        cookie=self.headers.get('Cookie','')
        if not cookie: return self.send_json(401,{'error':'authentication_required'})
        params={key:values[-1] for key,values in parse_qs(url.query,keep_blank_values=True).items()}
        try: query=validate(params)
        except ValueError as error: return self.send_json(400,{'error':'invalid_query','message':str(error)})
        if not query.text: return self.send_json(200,{'query':asdict(query),'results':[],'took_ms':0})
        started=time.perf_counter()
        if query.scope=='repo' and not access.can_read(cookie,query.repo): return self.send_json(403,{'error':'forbidden'})
        candidates=index.search(query);heads=index.heads()
        for item in candidates:item['revision']=heads.get(item['repo'])
        if query.scope=='repo': visible=candidates[:query.limit]
        else: visible=access.filter(cookie,candidates,query.limit)
        results=[]
        for item in visible:
            result={key:value for key,value in item.items() if key not in {'rrf','revision'}};result['url']=result_url(item);results.append(result)
        elapsed=round((time.perf_counter()-started)*1000,2)
        return self.send_json(200,{'query':asdict(query),'results':results,'took_ms':elapsed})

def main():
    index.refresh();thread=Thread(target=refresh_loop,name='hypersearch-index',daemon=True);thread.start();server=ThreadingHTTPServer((HOST,PORT),Handler)
    def stop(*_):stopping.set();Thread(target=server.shutdown,daemon=True).start()
    signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
    print('HyperSearch %s listening on %s:%d with %d repositories'%(BUILD,HOST,PORT,index.stats().get('repos',0)),flush=True)
    try:server.serve_forever(poll_interval=.25)
    finally:stopping.set();server.server_close()
if __name__=='__main__':main()
