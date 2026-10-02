from __future__ import annotations
from dataclasses import asdict
from pathlib import Path
from subprocess import PIPE, Popen, check_output
import os, re, sqlite3, threading, time
from query import SearchQuery, classify, fts_and, fts_phrase, tokens

MAX_FILE_BYTES = 512 * 1024
TEXT_EXTENSIONS = {'.c','.cc','.cpp','.css','.go','.h','.hpp','.html','.java','.js','.jsx','.json','.jsonc','.kt','.md','.mjs','.cjs','.nix','.py','.rb','.rs','.sh','.sql','.swift','.toml','.ts','.tsx','.txt','.xml','.yaml','.yml'}
LANGUAGES = {'.js':'javascript','.mjs':'javascript','.cjs':'javascript','.jsx':'javascript','.ts':'typescript','.tsx':'typescript','.py':'python','.go':'go','.rs':'rust','.java':'java','.kt':'kotlin','.swift':'swift','.css':'css','.html':'html','.md':'markdown','.nix':'nix','.sh':'shell','.sql':'sql','.json':'json','.yaml':'yaml','.yml':'yaml','.toml':'toml'}
SKIP_NAMES = {'package-lock.json','pnpm-lock.yaml','yarn.lock','Cargo.lock','uv.lock'}
SKIP_PREFIXES = ('dist/','storybook-static/','node_modules/','coverage/','test-results/','.cache/')
SYMBOL_PATTERNS = {
 'python': [(re.compile(r'^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\('),'function'),(re.compile(r'^\s*class\s+([A-Za-z_]\w*)\b'),'class')],
 'javascript': [(re.compile(r'^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\('),'function'),(re.compile(r'^\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)\b'),'class'),(re.compile(r'^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>'),'function')],
 'typescript': [(re.compile(r'^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\('),'function'),(re.compile(r'^\s*(?:export\s+)?(?:class|interface|enum|type)\s+([A-Za-z_$][\w$]*)\b'),'type'),(re.compile(r'^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>'),'function')],
 'go': [(re.compile(r'^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\('),'function'),(re.compile(r'^\s*type\s+([A-Za-z_]\w*)\s+'),'type')],
 'rust': [(re.compile(r'^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)\s*\('),'function'),(re.compile(r'^\s*(?:pub\s+)?(?:struct|enum|trait|type)\s+([A-Za-z_]\w*)\b'),'type')],
}
def language_for(path: str) -> str:
    name = Path(path).name
    if name == 'Dockerfile': return 'dockerfile'
    return LANGUAGES.get(Path(path).suffix.lower(), 'text')

def extract_symbols(path: str, content: str):
    lang = language_for(path); patterns = SYMBOL_PATTERNS.get(lang, ())
    for number, line in enumerate(content.splitlines(), 1):
        if len(line) > 1000: continue
        for pattern, kind in patterns:
            match = pattern.search(line)
            if match:
                yield (match.group(1), kind, number, line.strip()[:500]); break

def discover_repositories(root: Path):
    if not root.exists(): return []
    repos=[]
    for path in root.rglob('*.git'):
        if not path.is_dir(): continue
        rel=path.relative_to(root).as_posix()
        slug=rel[:-4]
        if slug.count('/') == 1 and all(re.fullmatch(r'[A-Za-z0-9_.-]+', part) for part in slug.split('/')):
            repos.append((slug,path))
    return sorted(repos)

def repo_head(git_dir: Path) -> str | None:
    try: return check_output(['git','--git-dir',str(git_dir),'rev-parse','HEAD'],text=True,timeout=10).strip()
    except Exception: return None

def tree_entries(git_dir: Path):
    raw=check_output(['git','--git-dir',str(git_dir),'ls-tree','-r','-l','-z','HEAD'],timeout=30)
    for row in raw.split(b'\0'):
        if not row: continue
        meta,raw_path=row.split(b'\t',1); parts=meta.split()
        if len(parts)!=4 or parts[1]!=b'blob': continue
        try: size=int(parts[3])
        except ValueError: continue
        yield parts[2].decode(),size,raw_path.decode('utf-8','replace')

def read_blobs(git_dir: Path, entries):
    proc=Popen(['git','--git-dir',str(git_dir),'cat-file','--batch'],stdin=PIPE,stdout=PIPE,stderr=PIPE)
    try:
        for oid,size,path in entries:
            assert proc.stdin and proc.stdout
            proc.stdin.write((oid+'\n').encode());proc.stdin.flush(); header=proc.stdout.readline().decode('ascii','replace').strip().split()
            if len(header)!=3 or header[1]!='blob': continue
            actual=int(header[2]); data=proc.stdout.read(actual);proc.stdout.read(1)
            yield oid,size,path,data
    finally:
        proc.stdin.close() if proc.stdin else None; proc.terminate(); proc.wait(timeout=5)
        if proc.stdout: proc.stdout.close()
        if proc.stderr: proc.stderr.close()
SCHEMA = """
PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
CREATE TABLE IF NOT EXISTS repos(repo TEXT PRIMARY KEY, head TEXT NOT NULL, indexed_at REAL NOT NULL, file_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS files(id INTEGER PRIMARY KEY, repo TEXT NOT NULL, path TEXT NOT NULL, filename TEXT NOT NULL, language TEXT NOT NULL, size INTEGER NOT NULL, oid TEXT NOT NULL, UNIQUE(repo,path));
CREATE INDEX IF NOT EXISTS files_repo_path ON files(repo,path); CREATE INDEX IF NOT EXISTS files_name ON files(filename);
CREATE TABLE IF NOT EXISTS symbols(id INTEGER PRIMARY KEY, repo TEXT NOT NULL, path TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, line INTEGER NOT NULL, signature TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS symbols_repo_name ON symbols(repo,name); CREATE INDEX IF NOT EXISTS symbols_name ON symbols(name);
CREATE VIRTUAL TABLE IF NOT EXISTS content_fts USING fts5(repo UNINDEXED,path,filename,language UNINDEXED,content,tokenize='unicode61 remove_diacritics 2 tokenchars ''_''');
"""

class SearchIndex:
    def __init__(self, db_path: str, repo_root: str):
        self.db_path=Path(db_path);self.repo_root=Path(repo_root);self.db_path.parent.mkdir(parents=True,exist_ok=True);self._setup();self._refresh_lock=threading.Lock()
    def connect(self):
        db=sqlite3.connect(self.db_path,timeout=15);db.row_factory=sqlite3.Row;db.execute('PRAGMA journal_mode=WAL');db.execute('PRAGMA busy_timeout=15000');return db
    def _setup(self):
        with self.connect() as db: db.executescript(SCHEMA)
    def heads(self):
        with self.connect() as db: return {r['repo']:r['head'] for r in db.execute('SELECT repo,head FROM repos')}
    def refresh(self):
        if not self._refresh_lock.acquire(blocking=False): return {'changed':0,'skipped':True}
        changed=0
        try:
            known=self.heads(); discovered=discover_repositories(self.repo_root); names={slug for slug,_ in discovered}
            for slug,path in discovered:
                head=repo_head(path)
                if head and known.get(slug)!=head: self.index_repository(slug,path,head);changed+=1
            with self.connect() as db:
                for stale in set(known)-names:
                    db.execute('DELETE FROM files WHERE repo=?',(stale,));db.execute('DELETE FROM symbols WHERE repo=?',(stale,));db.execute('DELETE FROM content_fts WHERE repo=?',(stale,));db.execute('DELETE FROM repos WHERE repo=?',(stale,));changed+=1
                db.commit()
            return {'changed':changed,'repositories':len(discovered)}
        finally: self._refresh_lock.release()
    def index_repository(self, slug: str, git_dir: Path, head: str):
        candidates=[]
        for oid,size,path in tree_entries(git_dir):
            suffix=Path(path).suffix.lower()
            if path.startswith(SKIP_PREFIXES): continue
            if size<0 or size>MAX_FILE_BYTES or Path(path).name in SKIP_NAMES: continue
            if suffix not in TEXT_EXTENSIONS and Path(path).name!='Dockerfile': continue
            candidates.append((oid,size,path))
        files=[];symbols=[];contents=[]
        for oid,size,path,data in read_blobs(git_dir,candidates):
            if b'\0' in data[:8192]: continue
            try: content=data.decode('utf-8')
            except UnicodeDecodeError: content=data.decode('utf-8','replace')
            lang=language_for(path); files.append((slug,path,Path(path).name,lang,size,oid));contents.append((slug,path,Path(path).name,lang,content))
            for name,kind,line,signature in extract_symbols(path,content): symbols.append((slug,path,name,kind,line,signature))
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE');db.execute('DELETE FROM files WHERE repo=?',(slug,));db.execute('DELETE FROM symbols WHERE repo=?',(slug,));db.execute('DELETE FROM content_fts WHERE repo=?',(slug,))
            db.executemany('INSERT INTO files(repo,path,filename,language,size,oid) VALUES(?,?,?,?,?,?)',files);db.executemany('INSERT INTO symbols(repo,path,name,kind,line,signature) VALUES(?,?,?,?,?,?)',symbols);db.executemany('INSERT INTO content_fts(repo,path,filename,language,content) VALUES(?,?,?,?,?)',contents)
            db.execute('INSERT INTO repos(repo,head,indexed_at,file_count) VALUES(?,?,?,?) ON CONFLICT(repo) DO UPDATE SET head=excluded.head,indexed_at=excluded.indexed_at,file_count=excluded.file_count',(slug,head,time.time(),len(files)));db.commit()
    def stats(self):
        with self.connect() as db:
            row=db.execute('SELECT count(*) repos,coalesce(sum(file_count),0) files,max(indexed_at) indexed_at FROM repos').fetchone();return dict(row)
    def _scope_sql(self, query: SearchQuery, column='repo'):
        if query.scope=='repo': return f' AND {column}=?', [query.repo]
        if query.scope=='org': return f' AND {column} LIKE ?', [query.org+'/%']
        return '', []
    def _file_hits(self, db, query: SearchQuery, maximum=80):
        term=query.text.lower().replace('*','').replace('?','').strip()
        if not term: return []
        scope,args=self._scope_sql(query); path_clause='';params=['%'+term+'%','%'+term+'%']+args
        if query.path: path_clause=' AND path LIKE ?';params.append(query.path.rstrip('/')+'%')
        if query.language: path_clause+=' AND language=?';params.append(query.language)
        rows=db.execute('SELECT repo,path,filename,language,size FROM files WHERE (lower(filename) LIKE ? OR lower(path) LIKE ?)'+scope+path_clause+' LIMIT ?',params+[maximum]).fetchall()
        out=[]
        for row in rows:
            name=row['filename'].lower();path=row['path'].lower();score=130 if name==term else 105 if name.startswith(term) else 85 if term in name else 60
            if path.endswith('/'+term): score+=10
            out.append({'kind':'file','title':row['filename'],'repo':row['repo'],'path':row['path'],'line':None,'snippet':row['path'],'score':score,'language':row['language']})
        return sorted(out,key=lambda x:(-x['score'],x['path']))
    def _symbol_hits(self, db, query: SearchQuery, maximum=80):
        term=query.text.strip();
        if not term: return []
        scope,args=self._scope_sql(query); params=[term,term+'%','%'+term+'%']+args
        rows=db.execute('SELECT repo,path,name,kind,line,signature FROM symbols WHERE (name=? COLLATE NOCASE OR name LIKE ? COLLATE NOCASE OR name LIKE ? COLLATE NOCASE)'+scope+' LIMIT ?',params+[maximum]).fetchall()
        out=[]
        for row in rows:
            name=row['name'];score=160 if name.casefold()==term.casefold() else 120 if name.casefold().startswith(term.casefold()) else 80
            out.append({'kind':'symbol','title':name,'repo':row['repo'],'path':row['path'],'line':row['line'],'snippet':row['signature'],'score':score,'symbol_kind':row['kind']})
        return sorted(out,key=lambda x:(-x['score'],x['repo'],x['path'],x['line']))
    def _content_hits(self, db, query: SearchQuery, maximum=120):
        expression=fts_phrase(query.text) if query.mode=='ast' else fts_and(query.text)
        if not expression: return []
        scope,args=self._scope_sql(query);extra='';params=[expression]+args
        if query.path: extra+=' AND path LIKE ?';params.append(query.path.rstrip('/')+'%')
        if query.language: extra+=' AND language=?';params.append(query.language)
        sql="SELECT rowid,repo,path,filename,language,snippet(content_fts,4,'','', ' … ',18) snippet,bm25(content_fts,0.1,0.3,0.8,0.1,1.0) rank FROM content_fts WHERE content_fts MATCH ?"+scope+extra+' ORDER BY rank LIMIT ?'
        try: rows=db.execute(sql,params+[maximum]).fetchall()
        except sqlite3.OperationalError: return []
        out=[]
        first=tokens(query.text)[0].casefold() if tokens(query.text) else ''
        for row in rows:
            line=None
            if first:
                content_row=db.execute('SELECT content FROM content_fts WHERE rowid=?',(row['rowid'],)).fetchone()
                if content_row:
                    content=content_row['content'];position=content.casefold().find(first);line=content.count('\n',0,max(0,position))+1 if position>=0 else None
                    if position>=0:
                        lines=content.splitlines();start=max(0,(line or 1)-2);row_snippet=' '.join(x.strip() for x in lines[start:min(len(lines),start+3)] if x.strip())[:500]
                    else: row_snippet=row['snippet']
                else: row_snippet=row['snippet']
            else: row_snippet=row['snippet']
            if query.intent=='references' and line is not None:
                definition=db.execute('SELECT 1 FROM symbols WHERE repo=? AND path=? AND line=? AND name=? COLLATE NOCASE LIMIT 1',(row['repo'],row['path'],line,query.text.strip())).fetchone()
                if definition: continue
            score=70+max(0,min(30,-float(row['rank'] or 0)))
            out.append({'kind':'code','title':row['filename'],'repo':row['repo'],'path':row['path'],'line':line,'snippet':row_snippet,'score':score,'language':row['language']})
        return out
    def _repo_hits(self, db, query: SearchQuery, maximum=40):
        term=query.text.casefold().strip();
        if not term: return []
        rows=db.execute('SELECT repo,file_count,indexed_at FROM repos WHERE lower(repo) LIKE ? LIMIT ?',('%'+term+'%',maximum)).fetchall();out=[]
        for row in rows:
            if query.scope=='repo' and row['repo']!=query.repo: continue
            if query.scope=='org' and not row['repo'].startswith(query.org+'/'): continue
            name=row['repo'].split('/')[-1].casefold();score=150 if name==term else 110 if name.startswith(term) else 70
            out.append({'kind':'repository','title':row['repo'],'repo':row['repo'],'path':'','line':None,'snippet':str(row['file_count'])+' indexed files','score':score})
        return sorted(out,key=lambda x:-x['score'])
    def search(self, query: SearchQuery):
        if not query.text: return []
        with self.connect() as db:
            groups=[]
            if query.mode in {'smart','symbol'}:
                groups.append(self._symbol_hits(db,query))
                if query.intent=='references': groups=[]
            if query.mode in {'smart','file'}: groups.append(self._file_hits(db,query))
            if query.mode in {'smart','text','ast','symbol'} and query.intent!='definition': groups.append(self._content_hits(db,query))
            if query.mode in {'smart','repo'}: groups.append(self._repo_hits(db,query))
        merged={};
        for group in groups:
            for rank,item in enumerate(group):
                key=(item['kind'],item['repo'],item['path'],item.get('line'),item['title'])
                if key not in merged: merged[key]=dict(item,rrf=0.0)
                weight=1.8 if item['kind']=='symbol' else 1.5 if item['kind']=='file' else 1.2 if item['kind']=='repository' else 1.0
                merged[key]['rrf'] += weight/(60+rank+1)+item['score']/10000
        return sorted(merged.values(),key=lambda x:(-x['rrf'],-x['score'],x['repo'],x['path']))[:max(query.limit*4,query.limit)]
