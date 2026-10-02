/** Progressive header search, called by skin refresh and Storybook.
 * Native controls stay intact; visibility follows a mounted action, never backend readiness.
 */
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
    signIn:'Войдите, чтобы искать в доступных вам репозиториях.',
    unavailable:'Поиск временно недоступен. Повторите попытку позже.',
    clearFilter:'Сбросить фильтр репозиториев',
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
    signIn:'Sign in to search repositories you can access.',
    unavailable:'Search is temporarily unavailable. Please try again later.',
    clearFilter:'Clear repository filter',
    noResults:'No results. Try fewer scope filters or a symbol/file name.',
    understands:'Search understands intent',
    files:'→ files',
    symbols:'→ symbols + usages',
    ast:'→ AST/structure',
    openRepo:'Open repository',
    jump:'Search or jump to…'
  };
}

/** Safe coverage view model reached through universal search in production and Storybook.
 * Only the version 1 allowlist becomes display text; stage completeness is never global.
 * Contract: forgejo-search 0018d4b6, docs/search-coverage.schema.json.
 */
const stageKeys=['repository_hits','file_hits','symbol_hits','lexical_candidates','ast_files','results'];
const stageStates=['not_applicable','complete','truncated','unknown'];
const astStates=['not_requested','no_candidates','ran','unavailable','timeout','failed'];
function exactKeys(value,keys){
  return value!==null&&typeof value==='object'&&!Array.isArray(value)&&
    Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
}
function validCoverage(value){
  if(!exactKeys(value,['version','scope','completeness','semantics','ast','limits'])||
    value.version!==1||value.scope!=='authorized_indexed_default_branch'||value.completeness!=='bounded'||
    !exactKeys(value.semantics,['definitions','references'])||
    value.semantics.definitions!=='pattern_based'||value.semantics.references!=='lexical'||
    !exactKeys(value.ast,['status'])||!astStates.includes(value.ast.status)||
    !exactKeys(value.limits,stageKeys))return false;
  for(const key of stageKeys){
    const stage=value.limits[key];
    if(!exactKeys(stage,['limit','state'])||!Number.isInteger(stage.limit)||
      stage.limit<1||stage.limit>100||!stageStates.includes(stage.state))return false;
  }
  return value.limits.repository_hits.limit<=12&&value.limits.lexical_candidates.limit>=40&&value.limits.ast_files.limit===20;
}
const english={
  title:'Search details',partialLabel:'Partial results',
  scope:'Search covers authorized, indexed default branches. It is bounded, not exhaustive.',
  semantics:'Definitions are pattern-based. References are lexical, not semantic.',
  labels:['Repository hits','File hits','Symbol hits','Lexical candidates','Structural candidate files','Results'],
  states:{complete:'Within limit',truncated:'Limit reached; more candidates exist',unknown:'Coverage unknown'},
  engines:{
    not_requested:'Structural refinement was not requested.',
    no_candidates:'No eligible candidates for structural refinement; engine availability was not checked.',
    ran:'Structural refinement ran within the listed bounds.',
    unavailable:'Structural refinement is unavailable.',
    timeout:'Structural refinement timed out.',
    failed:'Structural refinement failed.'
  },
  fallback:'Showing lexical/token fallback matches, not exhaustive structural results.',
  noFallback:'No fallback matches; this is not an exhaustive no-match result.'
};
const russian={
  title:'Подробности поиска',partialLabel:'Неполные результаты',
  scope:'Поиск по доступным вам индексированным веткам по умолчанию. Охват ограничен и не является исчерпывающим.',
  semantics:'Определения найдены по шаблонам. Ссылки — лексические, а не семантические.',
  labels:['Репозитории','Файлы','Символы','Лексические кандидаты','Файлы для структурного поиска','Результаты'],
  states:{complete:'В пределах лимита',truncated:'Лимит достигнут; есть ещё кандидаты',unknown:'Полнота охвата неизвестна'},
  engines:{
    not_requested:'Структурный поиск не запрашивался.',
    no_candidates:'Нет подходящих кандидатов для структурного поиска; доступность движка не проверялась.',
    ran:'Структурный поиск выполнен в указанных пределах.',
    unavailable:'Структурный поиск недоступен.',
    timeout:'Время структурного поиска истекло.',
    failed:'Структурный поиск завершился с ошибкой.'
  },
  fallback:'Показаны лексические/токеновые совпадения, а не исчерпывающие структурные результаты.',
  noFallback:'Резервный поиск не дал совпадений; это не означает исчерпывающего отсутствия результатов.'
};
const isRussian=lang=>String(lang).toLowerCase().startsWith('ru');
export function describeSearchCoverage(coverage,{query='',mode='',hasResults=false,lang='en'}={}){
  if(!query.trim()||!validCoverage(coverage))return null;
  const c=isRussian(lang)?russian:english;
  const stages=stageKeys.flatMap((key,index)=>{
    const {limit,state}=coverage.limits[key];
    return state==='not_applicable'?[]:[{key,label:c.labels[index],limit,state,description:c.states[state]}];
  });
  let engine=c.engines[coverage.ast.status];
  if(['unavailable','timeout','failed'].includes(coverage.ast.status))engine+=' '+(hasResults?c.fallback:c.noFallback);
  const semanticQuery=['symbol','reference'].includes(mode)||/(^|\s)(?:def|ref):/i.test(query)||coverage.limits.symbol_hits.state!=='not_applicable';
  return {
    title:c.title,partialLabel:c.partialLabel,scope:c.scope,engine,
    semantics:semanticQuery?c.semantics:null,stages,
    partial:stages.some(stage=>stage.state==='truncated'||stage.state==='unknown')
  };
}
export function searchTiming(totalMs,lang='en'){
  return typeof totalMs==='number'&&Number.isFinite(totalMs)&&totalMs>=0
    ? totalMs+(isRussian(lang)?' мс всего':' ms total'):'';
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
  dialog.innerHTML='<form method="dialog" class="hgh-search-box"><div class="hgh-search-input-row">'+SEARCH_ICON+'<input type="search" autocomplete="off" spellcheck="false"><button type="button" class="hgh-search-close">×</button></div><div class="hgh-search-scopes" role="radiogroup"></div><div class="hgh-search-status" role="status" aria-live="polite"></div><div class="hgh-search-coverage" hidden></div><div class="hgh-search-results" role="listbox">'+emptyHelp(doc)+'</div></form>';
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

function clearResults(state,help=false){
  state.hits=[];
  state.selected=-1;
  state.dialog.querySelector('.hgh-search-results').innerHTML=help?emptyHelp(state.doc):'';
  state.dialog.querySelector('.hgh-search-status').replaceChildren();
  const coverage=state.dialog.querySelector('.hgh-search-coverage');
  coverage.hidden=true;
  coverage.replaceChildren();
}
function renderCoverage(state,payload,mode){
  const host=state.dialog.querySelector('.hgh-search-coverage');
  const lang=state.doc.documentElement.lang;
  const view=describeSearchCoverage(payload.coverage,{query:state.query,mode,hasResults:state.hits.length>0,lang});
  host.replaceChildren();
  host.hidden=!view;
  if(!view)return;
  const details=state.doc.createElement('details'),summary=state.doc.createElement('summary');
  summary.textContent=view.title;
  details.append(summary);
  const body=state.doc.createElement('div');
  body.className='hgh-search-details-body';
  for(const [kind,text] of [['scope',view.scope],['engine',view.engine],['semantics',view.semantics]]){
    if(!text)continue;
    const paragraph=state.doc.createElement('p');
    paragraph.className='hgh-search-'+kind;
    paragraph.textContent=text;
    body.append(paragraph);
  }
  const stages=state.doc.createElement('ul');
  for(const stage of view.stages){
    const row=state.doc.createElement('li');
    row.dataset.state=stage.state;
    row.textContent=stage.label+' · '+(isRussian(lang)?'лимит ':'limit ')+stage.limit+' — '+stage.description;
    stages.append(row);
  }
  if(view.stages.length)body.append(stages);
  details.append(body);
  host.append(details);
  if(view.partial){
    const indicator=state.doc.createElement('span');
    indicator.className='hgh-search-partial';
    indicator.textContent=view.partialLabel;
    state.dialog.querySelector('.hgh-search-status').append(' · ',indicator);
  }
}

function render(state,payload){
  const host=state.dialog.querySelector('.hgh-search-results');
  const status=state.dialog.querySelector('.hgh-search-status');
  const raw=Array.isArray(payload.results)?payload.results:[];
  state.hits=raw.filter(hit=>hit&&typeof hit==='object'&&resultHref(hit,state.doc));
  state.selected=state.hits.length?0:-1;
  const rawMode=payload.inferred||payload.mode;
  const mode=typeof rawMode==='string'?rawMode:'text',c=copy(state.doc);
  const timing=searchTiming(payload.total_ms,state.doc.documentElement.lang);
  status.textContent=state.query
    ? mode.toUpperCase()+' · '+state.hits.length+' '+c.results+(timing?' · '+timing:'')
    : '';
  renderCoverage(state,payload,mode);
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
function cancelSearch(state){
  clearTimeout(state.timer);
  state.timer=null;
  state.controller?.abort();
  state.controller=null;
}
async function run(state){
  state.timer=null;
  const controller=new AbortController();
  state.controller=controller;
  try{
    const url='/api/hypersearch?q='+encodeURIComponent(scopeQuery(state.query.trim(),state.scope,state.ctx))+'&limit=30';
    const response=await state.fetchImpl(url,{
      signal:controller.signal,
      headers:{Accept:'application/json'}
    });
    if(state.destroyed||state.controller!==controller)return;
    if(response.status===401){
      delete state.doc.documentElement.dataset.hghSearchReady;
      clearResults(state);
      state.dialog.querySelector('.hgh-search-status').textContent=copy(state.doc).signIn;
      return;
    }
    if(!response.ok)throw new Error('Search unavailable');
    const payload=await response.json();
    if(state.destroyed||state.controller!==controller)return;
    state.doc.documentElement.dataset.hghSearchReady='true';
    render(state,payload&&typeof payload==='object'?payload:{});
  }catch(error){
    if(state.destroyed||state.controller!==controller)return;
    clearResults(state);
    if(error?.name==='AbortError')return;
    delete state.doc.documentElement.dataset.hghSearchReady;
    state.dialog.querySelector('.hgh-search-status').textContent=copy(state.doc).unavailable;
  }
}
function schedule(state,immediate=false){
  cancelSearch(state);
  clearResults(state,!state.query.trim());
  if(!state.query.trim())return;
  state.dialog.querySelector('.hgh-search-status').textContent=copy(state.doc).searching;
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
  schedule(state,true);
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
function syncNativeFilterReset(state,mounted){
  const {doc}=state;
  const field=doc.querySelector('#dashboard-repo-list .repos-search input[type="search"]');
  if(mounted&&field?.value){
    const reset=state.dashboardFilterReset ||= doc.createElement('button');
    reset.type='button';
    reset.className='ui tiny basic button hgh-native-filter-reset';
    const label=copy(doc).clearFilter+': '+field.value;
    if(reset.textContent!==label)reset.textContent=label;
    reset.onclick=()=>{
      field.value='';
      field.dispatchEvent(new doc.defaultView.Event('input',{bubbles:true}));
      syncNativeFilterReset(state,mounted);
    };
    const host=field.closest('.repos-search');
    if(reset.nextSibling!==host)host.before(reset);
  }else state.dashboardFilterReset?.remove();
  const form=doc.querySelector('.page-content.organization.profile #repo-search-form');
  const url=new URL(doc.defaultView.location.href);
  const query=url.searchParams.get('q');
  if(!mounted||!form||!query){
    state.filterReset?.remove();
    return;
  }
  const reset=state.filterReset ||= doc.createElement('a');
  reset.className='hgh-native-filter-reset';
  url.searchParams.delete('q');
  url.searchParams.delete('page');
  if(reset.href!==url.href)reset.href=url.href;
  const label=copy(doc).clearFilter+': '+query;
  if(reset.textContent!==label)reset.textContent=label;
  const host=form.closest('.filter.menu')||form;
  if(reset.nextSibling!==host)host.before(reset);
}
export function enhanceUniversalSearch(doc=document,{fetchImpl}={}){
  let state=states.get(doc);
  if(!state){
    const dialog=create(doc);
    state={doc,dialog,ctx:parseSearchContext(doc),scope:'repo',query:'',hits:[],selected:-1,
      fetchImpl:fetchImpl||doc.defaultView.fetch.bind(doc.defaultView),timer:null,controller:null,lastTrigger:null,probe:null,mobileOriginals:new Map(),destroyed:false};
    states.set(doc,state);
    state.media=doc.defaultView.matchMedia('(max-width:767px)');
    state.placeTrigger=()=>{
      const nav=doc.querySelector('#navbar');
      const host=state.media.matches
        ? nav?.querySelector('.navbar-mobile-right')||nav?.querySelector('.navbar-left')
        : nav?.querySelector('.navbar-right');
      if(host&&state.desktopTrigger&&state.desktopTrigger.parentNode!==host)host.prepend(state.desktopTrigger);
      const mounted=state.desktopTrigger?.isConnected;
      if(mounted)doc.documentElement.dataset.hghSearchMounted='true';
      else delete doc.documentElement.dataset.hghSearchMounted;
      syncNativeFilterReset(state,mounted);
    };
    state.media.addEventListener('change',state.placeTrigger);
    doc.defaultView.addEventListener('hashchange',state.placeTrigger);
    // Vue mounts the field asynchronously and changing its value need not add DOM.
    state.onNativeFilterInput=event=>{
      if(event.target.matches?.('#dashboard-repo-list .repos-search input[type="search"]'))
        syncNativeFilterReset(state,state.desktopTrigger?.isConnected);
    };
    doc.addEventListener('input',state.onNativeFilterInput);
    dialog.querySelector('.hgh-search-close').onclick=()=>dialog.close();
    dialog.querySelector('form').addEventListener('submit',event=>event.preventDefault());
    dialog.addEventListener('close',()=>{
      if(dialog.open)return;
      cancelSearch(state);
      clearResults(state);
      state.lastTrigger?.focus?.();
    });
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
    const host=nav.querySelector('.navbar-right');
    host?.prepend(trigger);
    state.desktopTrigger=trigger;
  }
  for(const node of doc.querySelectorAll('.hgh-native-search'))bindMobile(state,node);
  state.placeTrigger();
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
  state.media.removeEventListener('change',state.placeTrigger);
  doc.defaultView.removeEventListener('hashchange',state.placeTrigger);
  doc.removeEventListener('input',state.onNativeFilterInput);
  cancelSearch(state);
  state.desktopTrigger?.remove();
  state.filterReset?.remove();
  state.dashboardFilterReset?.remove();
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
  delete doc.documentElement.dataset.hghSearchMounted;
  states.delete(doc);
}