import {currentSearchContext,describeSearch,parseSearchQuery,searchSyntax} from './search-language.mjs';
const states=new Map();
const searchSvg='<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="m11.5 10.5 3 3-1 1-3-3a5.5 5.5 0 1 1 1-1ZM2 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z" fill="currentColor"/></svg>';
const closeSvg='<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" fill="currentColor"/></svg>';
function el(doc,tag,cls,text){const node=doc.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
function iconButton(doc,label,html){const b=el(doc,'button','hgh-control hgh-icon-control');b.type='button';b.setAttribute('aria-label',label);b.innerHTML=html;return b;}
function editable(target){return !!target?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]');}
function sanitizeResult(result){return {kind:String(result?.kind||'code').slice(0,32),title:String(result?.title||result?.path||'Result').slice(0,240),path:String(result?.path||'').slice(0,600),repo:String(result?.repo||'').slice(0,240),line:Number.isSafeInteger(result?.line)?result.line:null,url:String(result?.url||'').slice(0,3000),snippet:String(result?.snippet||'').slice(0,1200),score:Number(result?.score)||0};}
function contextFor(doc){return currentSearchContext(doc.defaultView.location);}
function endpointUrl(doc,parsed){const url=new URL('/__hypersearch/query',doc.defaultView.location.origin);url.searchParams.set('q',parsed.text);url.searchParams.set('scope',parsed.scope);url.searchParams.set('mode',parsed.mode);if(parsed.repo)url.searchParams.set('repo',parsed.repo);if(parsed.org)url.searchParams.set('org',parsed.org);if(parsed.path)url.searchParams.set('path',parsed.path);if(parsed.language)url.searchParams.set('lang',parsed.language);if(parsed.symbolIntent)url.searchParams.set('intent',parsed.symbolIntent);url.searchParams.set('limit','30');return url;}
function fallbackResults(doc,parsed){const out=[];if(parsed.scope==='repo'&&parsed.repo&&parsed.text){const [owner,repo]=parsed.repo.split('/');const native=new URL('/'+encodeURIComponent(owner)+'/'+encodeURIComponent(repo)+'/search/branch/main',doc.defaultView.location.origin);native.searchParams.set('q',parsed.text);native.searchParams.set('mode',parsed.mode==='ast'?'union':'exact');out.push({kind:'fallback',title:'Search with Forgejo code search',repo:parsed.repo,url:native.href,snippet:'Advanced index is temporarily unavailable.'});}if(parsed.text){const repos=new URL('/explore/repos',doc.defaultView.location.origin);repos.searchParams.set('q',parsed.text);out.push({kind:'fallback',title:'Search repository names',url:repos.href,snippet:'Fallback repository search'});}return out;}
function clear(node){while(node.firstChild)node.firstChild.remove();}
function resultIcon(kind){
 const body=kind==='repository'?'<path d="M2 2.75A1.75 1.75 0 0 1 3.75 1h8.5A1.75 1.75 0 0 1 14 2.75v10.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25Zm2-.25a.5.5 0 0 0-.5.5v7.25c.38-.16.8-.25 1.25-.25h7.75V3a.5.5 0 0 0-.5-.5Z"/>':kind==='file'?'<path d="M3 1.75C3 1.34 3.34 1 3.75 1h5.5L13 4.75v9.5c0 .41-.34.75-.75.75h-8.5a.75.75 0 0 1-.75-.75Zm6 .75v3h3l-3-3Z"/>':kind==='symbol'?'<path d="M6.75 1.5h2.5v3h-2.5ZM2 6.75h3v2.5H2Zm9 0h3v2.5h-3ZM6.75 11h2.5v3h-2.5ZM5 8h6v.75H8.75V11H8V8.75H5Zm3-3.5h.75V6H8Z"/>':'<path d="m5.5 4-4 4 4 4 1-1-3-3 3-3Zm5 0-1 1 3 3-3 3 1 1 4-4Z"/>';
 return '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">'+body+'</svg>';
}
function escapeRegExp(value){return value.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&');}
function markSnippet(doc,text,terms){
 const box=el(doc,'div','hgh-search-snippet'),source=String(text||'');
 if(!source)return box;
 const tokens=[...new Set(terms.filter(Boolean).map(x=>x.toLowerCase()))].sort((a,b)=>b.length-a.length).slice(0,8);
 if(!tokens.length){box.textContent=source;return box;}
 const pattern=new RegExp('('+tokens.map(escapeRegExp).join('|')+')','ig');let index=0;
 for(const match of source.matchAll(pattern)){if(match.index>index)box.append(doc.createTextNode(source.slice(index,match.index)));box.append(el(doc,'mark','',match[0]));index=match.index+match[0].length;}
 if(index<source.length)box.append(doc.createTextNode(source.slice(index)));return box;
}
function buildDialog(doc,context){
 const dialog=el(doc,'dialog','hgh-search-dialog');dialog.setAttribute('aria-label','Search');
 const shell=el(doc,'div','hgh-search-shell'),head=el(doc,'div','hgh-search-head'),magnify=el(doc,'span','hgh-search-leading');magnify.innerHTML=searchSvg;
 const input=el(doc,'input','hgh-search-input');input.type='search';input.autocomplete='off';input.spellcheck=false;input.placeholder='Search code, symbols, files, repositories…';input.setAttribute('aria-label','Search code, symbols, files and repositories');
 const close=iconButton(doc,'Close search',closeSvg);head.append(magnify,input,close);
 const meta=el(doc,'div','hgh-search-meta'),scopeRow=el(doc,'div','hgh-search-scopes'),mode=el(doc,'span','hgh-search-mode','Smart');meta.append(scopeRow,mode);
 const results=el(doc,'div','hgh-search-results');results.setAttribute('role','listbox');results.setAttribute('aria-label','Search results');
 const footer=el(doc,'div','hgh-search-footer');footer.append(el(doc,'span','','↑↓ Navigate · Enter Open · Esc Close'),el(doc,'span','hgh-search-latency',''));
 shell.append(head,meta,results,footer);dialog.append(shell);doc.body.append(dialog);
 const scopes=[['repo',context.repo?'This repository':'Repository'],['org',context.org?'Organization':'Organization'],['global','Everywhere']];
 for(const [value,label]of scopes){const b=el(doc,'button','hgh-search-scope',label);b.type='button';b.dataset.scope=value;if(value==='repo'&&!context.repo)b.disabled=true;if(value==='org'&&!context.org)b.disabled=true;scopeRow.append(b);}
 return {dialog,shell,input,close,scopeRow,mode,results,footer,latency:footer.querySelector('.hgh-search-latency')};
}
function renderEmpty(state){
 const {doc,ui}=state;clear(ui.results);
 const hero=el(doc,'div','hgh-search-empty');hero.append(el(doc,'strong','','Smart search'),el(doc,'p','','Type code, a symbol, a file name, or ordinary words. Search mode is inferred automatically.'));
 const syntax=el(doc,'div','hgh-search-syntax');
 for(const [token,description]of searchSyntax.slice(0,7)){const row=el(doc,'button','hgh-search-syntax-row');row.type='button';row.append(el(doc,'code','',token),el(doc,'span','',description));row.onclick=()=>{ui.input.value=token+' ';ui.input.focus();ui.input.dispatchEvent(new Event('input',{bubbles:true}));};syntax.append(row);}
 hero.append(syntax);ui.results.append(hero);ui.latency.textContent='';
}
function renderResults(state,data,parsed){
 const {doc,ui}=state;clear(ui.results);state.items=[];const terms=parsed.text.match(/[A-Za-z0-9_$.-]+/g)||[];
 const rows=(data?.results||[]).map(sanitizeResult);
 if(!rows.length){const empty=el(doc,'div','hgh-search-empty');empty.append(el(doc,'strong','','No results'),el(doc,'p','',data?.message||'Try a symbol, file name, or a broader scope.'));ui.results.append(empty);return;}
 let current='';
 for(const result of rows){
  if(result.kind!==current){current=result.kind;ui.results.append(el(doc,'div','hgh-search-group',current==='symbol'?'Symbols':current==='file'?'Files':current==='repository'?'Repositories':current==='fallback'?'Fallback':'Code'));}
  const a=el(doc,'a','hgh-search-result');a.href=result.url||'#';a.setAttribute('role','option');a.dataset.index=String(state.items.length);
  const glyph=el(doc,'span','hgh-search-result-icon');glyph.innerHTML=resultIcon(result.kind);const body=el(doc,'span','hgh-search-result-body'),title=el(doc,'span','hgh-search-result-title',result.title),where=el(doc,'span','hgh-search-result-where',[result.repo,result.path,result.line?':'+result.line:''].filter(Boolean).join(' · '));
  body.append(title,where);if(result.snippet)body.append(markSnippet(doc,result.snippet,terms));a.append(glyph,body);ui.results.append(a);state.items.push(a);
 }
 state.selected=state.items.length?0:-1;selectItem(state,state.selected);
}
function selectItem(state,index){
 if(!state.items.length){state.selected=-1;return;}
 const next=(index+state.items.length)%state.items.length;state.selected=next;
 state.items.forEach((item,i)=>{item.dataset.selected=String(i===next);item.setAttribute('aria-selected',String(i===next));});
 state.items[next].scrollIntoView({block:'nearest'});
}
function release(state){
 clearTimeout(state.timer);state.abort?.abort();state.media.removeEventListener('change',state.position);state.trigger.remove();state.ui.dialog.remove();state.doc.removeEventListener('keydown',state.hotkey,true);
 if(state.doc.defaultView.__hyperSearchOpen===state.open)delete state.doc.defaultView.__hyperSearchOpen;states.delete(state.doc);
}
export function enhanceUniversalSearch(doc=document,options={}){
 const old=states.get(doc);if(old){if(old.trigger.isConnected&&old.ui.dialog.isConnected)return old;release(old);}
 const nav=doc.querySelector('#navbar'),left=nav?.querySelector('.navbar-left'),right=nav?.querySelector('.navbar-right');if(!nav||!left||!right)return null;
 const context=contextFor(doc),ui=buildDialog(doc,context),trigger=iconButton(doc,'Search',searchSvg);trigger.classList.add('hgh-universal-search-trigger');
 const state={doc,context,ui,trigger,items:[],selected:-1,abort:null,timer:null,forcedScope:null,lastTrigger:null};
 const updateScope=parsed=>{for(const b of ui.scopeRow.querySelectorAll('button'))b.dataset.active=String(b.dataset.scope===parsed.scope);ui.mode.textContent=describeSearch(parsed).mode;};
 const search=async()=>{
  const raw=ui.input.value.trim();if(!raw){renderEmpty(state);return;}
  const base={...state.context,...(state.forcedScope?{scope:state.forcedScope}:{})},parsed=parseSearchQuery(raw,base);updateScope(parsed);state.abort?.abort();
  const abort=new AbortController();state.abort=abort;ui.results.dataset.loading='true';const started=performance.now();
  try{let data;if(options.provider)data=await options.provider(parsed,abort.signal);else{const response=await fetch(endpointUrl(doc,parsed),{credentials:'same-origin',headers:{Accept:'application/json'},signal:abort.signal});if(!response.ok)throw new Error('HTTP '+response.status);data=await response.json();}if(abort.signal.aborted)return;renderResults(state,data,parsed);ui.latency.textContent=Math.round(data.took_ms??(performance.now()-started))+' ms';}
  catch(error){if(error.name==='AbortError')return;renderResults(state,{results:fallbackResults(doc,parsed),message:'Advanced search is temporarily unavailable.'},parsed);ui.latency.textContent='Fallback';}
  finally{if(state.abort===abort)ui.results.dataset.loading='false';}
 };
 const queue=()=>{clearTimeout(state.timer);state.timer=setTimeout(search,70);};ui.input.addEventListener('input',queue);
 for(const b of ui.scopeRow.querySelectorAll('button'))b.addEventListener('click',()=>{state.forcedScope=b.dataset.scope;queue();ui.input.focus();});
 state.open=()=>{
  state.context=contextFor(doc);state.lastTrigger=trigger;
  if(!ui.dialog.open)ui.dialog.showModal();
  requestAnimationFrame(()=>{ui.input.focus();ui.input.select();});
  const parsed=parseSearchQuery(ui.input.value,{...state.context,...(state.forcedScope?{scope:state.forcedScope}:{})});updateScope(parsed);if(!ui.input.value)renderEmpty(state);
 };
 ui.close.onclick=()=>ui.dialog.close();
 ui.dialog.addEventListener('close',()=>state.lastTrigger?.focus?.());
 trigger.onclick=state.open;
 ui.input.addEventListener('keydown',event=>{
  if(event.key==='ArrowDown'){event.preventDefault();selectItem(state,state.selected+1);}
  else if(event.key==='ArrowUp'){event.preventDefault();selectItem(state,state.selected-1);}
  else if(event.key==='Enter'&&state.selected>=0){event.preventDefault();state.items[state.selected].click();}
  else if(event.key==='Escape'){event.preventDefault();ui.dialog.close();}
 });
 state.hotkey=event=>{if(event.defaultPrevented||editable(event.target))return;if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();state.open();}};
 doc.addEventListener('keydown',state.hotkey,true);
 const media=doc.defaultView.matchMedia('(max-width:767px)');state.media=media;
 state.position=()=>{
  const contextLink=doc.querySelector('.hgh-native-context');
  if(media.matches){const target=contextLink?.parentElement||left;if(contextLink?.isConnected)contextLink.after(trigger);else target.append(trigger);}
  else right.prepend(trigger);
 };
 media.addEventListener('change',state.position);state.position();
 doc.defaultView.__hyperSearchOpen=state.open;states.set(doc,state);return state;
}
export function restoreUniversalSearch(doc=document){const state=states.get(doc);if(state)release(state);}
