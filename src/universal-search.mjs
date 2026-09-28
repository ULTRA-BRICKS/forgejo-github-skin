import {normalizeLine,safeHref} from './core.mjs';
const states=new WeakMap();
const SEARCH_ICON='<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M10.68 11.74a6 6 0 1 1 1.06-1.06l3.04 3.04a.75.75 0 0 1-1.06 1.06ZM11.5 7a4.5 4.5 0 1 0-9 0 4.5 4.5 0 0 0 9 0Z"/></svg>';


function copy(doc){
  const ru=String(doc.documentElement.lang||'').toLowerCase().startsWith('ru');
  return ru ? {
    search:'Поиск кода, символов и файлов',
    placeholder:'Искать код, символы, файлы…',
    close:'Закрыть',
    scope:'Область поиска',
    resultsLabel:'Результаты поиска',
    repo:'Этот репозиторий',
    everywhere:'Везде',
    searching:'Ищу…',
    results:'результатов',
    signIn:'Войдите, чтобы искать в доступных вам приватных репозиториях. Штатный поиск Forgejo остаётся доступен.',
    unavailable:'Поиск временно недоступен. Ниже остаётся штатный поиск Forgejo.',
    noResults:'Ничего не найдено. Попробуйте убрать фильтры или искать имя символа/файла.',
    understands:'Поиск понимает намерение',
    files:'→ файлы',
    symbols:'→ символы + использования',
    ast:'→ AST/структура',
    openRepo:'Открыть репозиторий',
    jump:'Искать или перейти…'
  } : {
    search:'Search code, symbols and files',
    placeholder:'Search code, symbols, files…',
    close:'Close',
    scope:'Search scope',
    resultsLabel:'Search results',
    repo:'This repository',
    everywhere:'Everywhere',
    searching:'Searching…',
    results:'results',
    signIn:'Sign in to search repositories you can access. Native Forgejo search remains available.',
    unavailable:'Search is temporarily unavailable. Native Forgejo search is available below.',
    noResults:'No results. Try fewer scope filters or a symbol/file name.',
    understands:'Search understands intent',
    files:'→ files',
    symbols:'→ symbols + usages',
    ast:'→ AST/structure',
    openRepo:'Open repository',
    jump:'Search or jump to…'
  };
}

function stripSubUrl(pathname,subUrl){
  const prefix=String(subUrl||'').replace(/\/+$/,'');
  if(!prefix)return pathname;
  if(pathname===prefix)return '/';
  return pathname.startsWith(prefix+'/')?pathname.slice(prefix.length):pathname;
}
function segment(value){
  if(typeof value!=='string')return null;
  try{return decodeURIComponent(value);}catch{return null;}
}
// A hostile *path segment* (attacker-crafted link, e.g. `/org/%20owner%3Aevil/dashboard`) must
// never inject/alter a `repo:`/`owner:` query qualifier — that is the actual, attacker-reachable
// injection surface this fix closes. Native, already server-rendered DOM text (the repo header,
// the org context switcher) is a different trust class — Forgejo's own backend already
// constrains what it renders there — and is used as-is, matching this codebase's established
// "render hostile text inertly via textContent, never validate it away" contract (see the
// malicious-payload story/test).
const NAME=/^[\w.-]{1,100}$/;
function safeName(value){
  return typeof value==='string'&&NAME.test(value)&&value!=='.'&&value!=='..'?value:null;
}
// The org context switcher's `.right.menu` "View home" button (`organization.mjs`'s own
// `homeLink` selector) links to the bare `/<login>` org home — the canonical, URL-safe identity.
// Its sibling `.truncated-item-name` text is NOT safe to read instead: Forgejo renders
// `ContextUser.ShortName`, which is the org's FullName (free text, may contain spaces/unicode,
// truncated with `…`) when one is set, and only falls back to the login otherwise. This switcher
// is shared across every /org/<name>/* page — the dashboard, and the bare `/<name>/issues` /
// `/<name>/pulls` cross-repo aggregate hand-off pages — so reading the button href, not the
// pathname shape, is what makes trusting it here safe.
function orgNavName(doc){
  const win=doc.defaultView;
  for(const nav of doc.querySelectorAll('.secondary-nav')){
    const home=nav.querySelector('.right.menu a.ui.basic.button[href]');
    if(!home)continue;
    try{
      const pathname=stripSubUrl(new URL(home.getAttribute('href'),win?.location?.href).pathname,win?.config?.appSubUrl);
      const parts=pathname.split('/').filter(Boolean);
      const name=parts.length===1?safeName(segment(parts[0])):null;
      if(name)return name;
    }catch{/* malformed href: fall through to the next nav, then the pathname fallback */}
  }
  return null;
}
// Owner/repo scope must come from native, already-access-controlled DOM state — `.repo-header`,
// the org secondary-nav switcher, or `.page-content.organization.profile` (public org profile at
// bare `/<name>`) — never from guessing arbitrary pathname segments (that previously mis-scoped
// /org/<name>/dashboard, /explore/repos, /user/login, /notifications… as repo/owner hits). The
// one pathname fallback kept is `/org/:owner/dashboard` exactly (mirrors
// ops/handoff/slack/preview-core.mjs's own org-dashboard route shape) — a defense-in-depth net for
// that one specific, unambiguous native route, should the DOM markers above ever miss it. Any
// other `/org/<segment>` shape (e.g. the `/org/create` org-creation form) is deliberately left
// global rather than guessed.
export function parseSearchContext(doc){
  const title=doc.querySelector('.repo-header .flex-item-title');
  const links=title?[...title.querySelectorAll('a[href]')]:[];
  if(links.length>=2){
    const owner=links.at(-2).textContent.trim(),name=links.at(-1).textContent.trim();
    if(owner&&name)return {repo:owner+'/'+name,owner};
    return {repo:null,owner:null};
  }
  const navOwner=orgNavName(doc);
  if(navOwner)return {repo:null,owner:navOwner};
  const win=doc.defaultView;
  const pathname=stripSubUrl(win?.location?.pathname||'/',win?.config?.appSubUrl);
  const parts=pathname.split('/').filter(Boolean);
  if(parts.length===1&&doc.querySelector('.page-content.organization.profile'))return {repo:null,owner:safeName(segment(parts[0]))};
  if(parts.length===3&&parts[0]==='org'&&parts[2]==='dashboard')return {repo:null,owner:safeName(segment(parts[1]))};
  return {repo:null,owner:null};
}
function scopeQuery(value,scope,ctx){
  if(/(^|\s)(?:repo|owner):\S+/i.test(value))return value;
  if(scope==='repo'&&ctx.repo)return 'repo:'+ctx.repo+' '+value;
  if(scope==='owner'&&ctx.owner)return 'owner:'+ctx.owner+' '+value;
  return value;
}
function resultHref(hit,doc){
  let candidate=hit.url;
  if(!candidate){
    const ref=String(hit.ref||'refs/heads/main').replace(/^refs\/heads\//,'');
    const line=normalizeLine(hit.line);
    candidate='/'+String(hit.repo||'').split('/').map(encodeURIComponent).join('/')+
      '/src/branch/'+encodeURIComponent(ref)+'/'+
      String(hit.path||'').split('/').map(encodeURIComponent).join('/')+
      (line?'#L'+line:'');
  }
  return safeHref(candidate,doc.defaultView.location.href);
}

const escapeHtml=value=>String(value??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const safeSnippet=value=>escapeHtml(value).replaceAll('&lt;mark&gt;','<mark>').replaceAll('&lt;/mark&gt;','</mark>');
function emptyHelp(doc){
  const c=copy(doc);
  return '<div class="hgh-search-help"><b>'+c.understands+'</b><span><code>focus.ts</code> '+c.files+'</span><span><code>restoreFocus</code> '+c.symbols+'</span><span><code>foo(a, b)</code> '+c.ast+'</span><span><code>def:name</code>, <code>ref:name</code>, <code>path:</code>, <code>lang:</code></span></div>';
}
function create(doc){
  const c=copy(doc),dialog=doc.createElement('dialog');
  dialog.id='hgh-universal-search';
  dialog.className='hgh-search-dialog';
  dialog.innerHTML='<form method="dialog" class="hgh-search-box"><div class="hgh-search-input-row">'+SEARCH_ICON+'<input type="search" autocomplete="off" spellcheck="false"><button type="button" class="hgh-search-close">×</button></div><div class="hgh-search-scopes" role="radiogroup"></div><div class="hgh-search-status" role="status" aria-live="polite"></div><div class="hgh-search-results" role="listbox">'+emptyHelp(doc)+'</div></form>';
  const input=dialog.querySelector('input');
  input.setAttribute('aria-label',c.search); input.placeholder=c.placeholder;
  dialog.querySelector('.hgh-search-close').setAttribute('aria-label',c.close);
  dialog.querySelector('.hgh-search-scopes').setAttribute('aria-label',c.scope);
  dialog.querySelector('.hgh-search-results').setAttribute('aria-label',c.resultsLabel);
  doc.body.append(dialog);
  return dialog;
}
function setScopes(state){
  const {dialog,ctx}=state,c=copy(state.doc),host=dialog.querySelector('.hgh-search-scopes');
  const choices=[
    ctx.repo&&['repo',c.repo],
    ctx.owner&&['owner',ctx.owner],
    ['global',c.everywhere]
  ].filter(Boolean);
  host.replaceChildren();
  for(const [value,label] of choices){
    const button=state.doc.createElement('button');
    button.type='button';
    button.role='radio';
    button.dataset.scope=value;
    button.setAttribute('aria-checked',String(state.scope===value));
    button.textContent=label;
    button.onclick=()=>{
      state.scope=value;
      setScopes(state);
      schedule(state,true);
    };
    host.append(button);
  }
}

function render(state,payload){
  const host=state.dialog.querySelector('.hgh-search-results');
  const status=state.dialog.querySelector('.hgh-search-status');
  const raw=Array.isArray(payload.results)?payload.results:[];
  state.hits=raw.filter(hit=>resultHref(hit,state.doc));
  state.selected=state.hits.length?0:-1;
  const mode=payload.inferred||payload.mode||'text',c=copy(state.doc);
  status.textContent=state.query
    ? mode.toUpperCase()+' · '+state.hits.length+' '+c.results+' · '+(payload.elapsed_ms??'—')+' ms'
    : '';
  if(!state.hits.length){
    host.innerHTML=state.query
      ? '<div class="hgh-search-empty">'+c.noResults+'</div>'+emptyHelp(state.doc)
      : emptyHelp(state.doc);
    return;
  }
  host.replaceChildren();
  state.hits.forEach((hit,index)=>{
    const repository=hit.kind==='repository';
    const title=repository?hit.repo:hit.path;
    const line=normalizeLine(hit.line);
    const detail=repository
      ? 'Repository · '+String(hit.ref||'main').replace(/^refs\/heads\//,'')
      : String(hit.repo||'')+' · '+String(hit.language||'')+(line?' · line '+line:'');
    const anchor=state.doc.createElement('a');
    anchor.role='option';
    anchor.dataset.index=String(index);
    anchor.setAttribute('aria-selected',String(index===0));
    anchor.href=resultHref(hit,state.doc);

    const kind=state.doc.createElement('span');
    kind.className='hgh-search-kind';
    kind.textContent=String(hit.kind||'result');

    const main=state.doc.createElement('span');
    main.className='hgh-search-main';
    const heading=state.doc.createElement('b');
    heading.textContent=String(title||'');
    const small=state.doc.createElement('small');
    small.textContent=detail;
    const snippet=state.doc.createElement('span');
    if(repository)snippet.textContent=c.openRepo;
    else snippet.innerHTML=safeSnippet(hit.snippet);
    main.append(heading,small,snippet);
    anchor.append(kind,main);
    host.append(anchor);
  });
  host.onpointermove=event=>{
    const target=event.target.closest?.('[data-index]');
    if(target&&host.contains(target))select(state,Number(target.dataset.index),false);
  };
}

function select(state,index,scroll=true){
  if(!state.hits.length)return;
  const next=(index+state.hits.length)%state.hits.length;
  if(next===state.selected)return;
  const previous=state.dialog.querySelector('[data-index="'+state.selected+'"]');
  const current=state.dialog.querySelector('[data-index="'+next+'"]');
  previous?.setAttribute('aria-selected','false');
  current?.setAttribute('aria-selected','true');
  state.selected=next;
  if(scroll)current?.scrollIntoView({block:'nearest'});
}
async function run(state){
  state.timer=null;
  const query=state.query.trim();
  if(!query){render(state,{results:[]});return;}
  state.controller?.abort();
  state.controller=new AbortController();
  state.dialog.querySelector('.hgh-search-status').textContent=copy(state.doc).searching;
  try{
    const url='/api/hypersearch?q='+encodeURIComponent(scopeQuery(query,state.scope,state.ctx))+'&limit=30';
    const response=await state.fetchImpl(url,{
      signal:state.controller.signal,
      headers:{Accept:'application/json'}
    });
    if(response.status===401){
      delete state.doc.documentElement.dataset.hghSearchReady;
      state.dialog.querySelector('.hgh-search-status').textContent=copy(state.doc).signIn;
      return;
    }
    if(!response.ok)throw new Error('Search unavailable');
    state.doc.documentElement.dataset.hghSearchReady='true';
    render(state,await response.json());
  }catch(error){
    if(error.name==='AbortError')return;
    delete state.doc.documentElement.dataset.hghSearchReady;
    state.dialog.querySelector('.hgh-search-status').textContent=copy(state.doc).unavailable;
  }
}
function schedule(state,immediate=false){
  clearTimeout(state.timer);
  state.timer=setTimeout(()=>run(state),immediate?0:120);
}
export function openUniversalSearch(doc=document,{seed=''}={}){
  let state=states.get(doc);
  if(!state){enhanceUniversalSearch(doc);state=states.get(doc);}
  if(!state)return false;
  state.ctx=parseSearchContext(doc);
  state.scope=state.ctx.repo?'repo':state.ctx.owner?'owner':'global';
  state.query=seed;
  setScopes(state);
  const input=state.dialog.querySelector('input[type="search"]');
  input.value=seed;
  if(!state.dialog.open)state.dialog.showModal();
  requestAnimationFrame(()=>{input.focus();input.select();});
  if(seed)schedule(state,true);else render(state,{results:[]});
  return true;
}
function bindMobile(state,node){
  if(!node||node.dataset.hghUniversalSearch)return;
  const onClick=event=>{
    event.preventDefault();
    state.lastTrigger=node;
    openUniversalSearch(state.doc);
  };
  state.mobileOriginals.set(node,{
    label:node.getAttribute('aria-label'),
    title:node.getAttribute('title'),
    onClick
  });
  node.dataset.hghUniversalSearch='true';
  const c=copy(state.doc);
  node.setAttribute('aria-label',c.search);
  node.title=c.search;
  node.addEventListener('click',onClick);
}
export function enhanceUniversalSearch(doc=document,{fetchImpl}={}){
  let state=states.get(doc);
  if(!state){
    const dialog=create(doc);
    state={doc,dialog,ctx:parseSearchContext(doc),scope:'repo',query:'',hits:[],selected:-1,
      fetchImpl:fetchImpl||doc.defaultView.fetch.bind(doc.defaultView),timer:null,controller:null,lastTrigger:null,probe:null,mobileOriginals:new Map(),destroyed:false};
    states.set(doc,state);
    dialog.querySelector('.hgh-search-close').onclick=()=>dialog.close();
    dialog.querySelector('form').addEventListener('submit',event=>event.preventDefault());
    dialog.addEventListener('close',()=>state.lastTrigger?.focus?.());
    const input=dialog.querySelector('input[type="search"]');
    input.addEventListener('input',()=>{state.query=input.value;schedule(state);});
    input.addEventListener('keydown',event=>{
      if(event.key==='Escape'){
        event.preventDefault();
        dialog.close();
      }else if(event.key==='ArrowDown'){event.preventDefault();select(state,state.selected+1);}
      else if(event.key==='ArrowUp'){event.preventDefault();select(state,state.selected-1);}
      else if(event.key==='Enter'&&state.selected>=0){
        event.preventDefault();
        const target=dialog.querySelector('[data-index="'+state.selected+'"]');
        if(target)doc.defaultView.location.assign(target.href);
      }
    });
  }else if(fetchImpl)state.fetchImpl=fetchImpl;

  const nav=doc.querySelector('#navbar');
  if(state.desktopTrigger&&!state.desktopTrigger.isConnected)state.desktopTrigger=null;
  if(nav&&!state.desktopTrigger){
    const trigger=doc.createElement('button');
    trigger.type='button';
    trigger.className='hgh-global-search-trigger';
    const c=copy(doc);
    trigger.innerHTML=SEARCH_ICON+'<span>'+c.jump+'</span><kbd>/</kbd>';
    trigger.setAttribute('aria-label',c.search);
    trigger.onclick=()=>{state.lastTrigger=trigger;openUniversalSearch(doc);};
    const explore=nav.querySelector('.navbar-left > a[href$="/explore/repos"]');
    (explore?.parentNode||nav.querySelector('.navbar-left'))?.insertBefore(trigger,explore||null);
    state.desktopTrigger=trigger;
  }
  for(const node of doc.querySelectorAll('.hgh-native-search'))bindMobile(state,node);
  if(!state.probe){
    state.probe=state.fetchImpl('/api/hypersearch?q=',{headers:{Accept:'application/json'}})
      .then(response=>{
        if(state.destroyed)return;
        if(response.ok)doc.documentElement.dataset.hghSearchReady='true';
        else delete doc.documentElement.dataset.hghSearchReady;
      })
      .catch(()=>{if(!state.destroyed)delete doc.documentElement.dataset.hghSearchReady;});
  }
  return state;
}
export function restoreUniversalSearch(doc=document){
  const state=states.get(doc);
  if(!state)return;
  state.destroyed=true;
  state.controller?.abort();
  clearTimeout(state.timer);
  state.desktopTrigger?.remove();
  if(state.dialog.open)state.dialog.close();
  state.dialog.remove();
  for(const [node,original] of state.mobileOriginals){
    node.removeEventListener('click',original.onClick);
    delete node.dataset.hghUniversalSearch;
    if(original.label===null)node.removeAttribute('aria-label');
    else node.setAttribute('aria-label',original.label);
    if(original.title===null)node.removeAttribute('title');
    else node.setAttribute('title',original.title);
  }
  state.mobileOriginals.clear();
  delete doc.documentElement.dataset.hghSearchReady;
  states.delete(doc);
}