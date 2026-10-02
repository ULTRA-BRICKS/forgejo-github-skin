from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from http.client import HTTPConnection
import os, re, threading, time
from urllib.parse import quote
from query import REPO_RE

class AccessChecker:
    def __init__(self, host='127.0.0.1', port=3000, public_host='git.hyperide.ai', ttl=2):
        self.host=host;self.port=port;self.public_host=public_host;self.ttl=ttl;self.cache={};self.lock=threading.Lock();self.pool=ThreadPoolExecutor(max_workers=8,thread_name_prefix='search-access')
    def _key(self,cookie,repo): return sha256(cookie.encode('utf-8','ignore')).hexdigest()[:24]+':'+repo
    def can_read(self,cookie: str,repo: str) -> bool:
        if not cookie or not REPO_RE.fullmatch(repo): return False
        key=self._key(cookie,repo);now=time.monotonic()
        with self.lock:
            hit=self.cache.get(key)
            if hit and hit[0]>now: return hit[1]
        owner,name=repo.split('/',1);path='/'+quote(owner,safe='')+'/'+quote(name,safe='')
        allowed=False;conn=HTTPConnection(self.host,self.port,timeout=4)
        try:
            conn.request('GET',path,headers={'Cookie':cookie,'Host':self.public_host,'X-Forwarded-Proto':'https','User-Agent':'hypersearch-access/1'})
            response=conn.getresponse();body=response.read(65536);allowed=response.status==200 and not response.getheader('Location','').startswith('/user/login') and re.search(br'class=\"[^\"]*\brepository\b[^\"]*\"',body) is not None
        except OSError: allowed=False
        finally: conn.close()
        with self.lock:
            if len(self.cache)>4096:self.cache={k:v for k,v in self.cache.items() if v[0]>now}
            self.cache[key]=(now+self.ttl,allowed)
        return allowed
    def filter(self,cookie: str,items: list[dict],limit: int) -> list[dict]:
        repos=list(dict.fromkeys(item['repo'] for item in items if item.get('repo')))
        futures={repo:self.pool.submit(self.can_read,cookie,repo) for repo in repos[:80]}
        allowed={repo for repo,future in futures.items() if future.result()}
        return [item for item in items if item.get('repo') in allowed][:limit]
