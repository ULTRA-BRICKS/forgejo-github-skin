import '../src/repository-ui.css';
import '../src/universal-search.css';
import {enhanceUniversalSearch,restoreUniversalSearch} from '../src/universal-search.mjs';
const repo='ultrabricks/forgejo-github-skin';
const fixtures={
 symbol:[{kind:'symbol',title:'restoreRepositoryControls',repo,path:'src/repository-controls.mjs',line:38,url:'#symbol',snippet:'export function restoreRepositoryControls(doc=document)'}],
 ast:[{kind:'code',title:'repository-controls.mjs',repo,path:'src/repository-controls.mjs',line:3,url:'#ast',snippet:'function restore(row,state) { state.media.removeEventListener(...) }'}],
 file:[{kind:'file',title:'universal-search.mjs',repo,path:'src/universal-search.mjs',url:'#file',snippet:'src/universal-search.mjs'}],
 repositories:[{kind:'repository',title:'ultrabricks/forgejo-github-skin',repo,path:'',url:'#repo',snippet:'GitHub-familiar UI/UX overlay for Forgejo'}],
 mixed:[
  {kind:'symbol',title:'enhanceUniversalSearch',repo,path:'src/universal-search.mjs',line:82,url:'#one',snippet:'export function enhanceUniversalSearch(doc=document,options={})'},
  {kind:'file',title:'universal-search.mjs',repo,path:'src/universal-search.mjs',url:'#two',snippet:'Universal search UI'},
  {kind:'code',title:'skin.mjs',repo,path:'src/skin.mjs',line:376,url:'#three',snippet:'enhanceUniversalSearch(document);'},
 ]
};
function page(surface='light'){
 const root=document.createElement('div');root.className='hgh-reference-shell hgh-search-story';root.dataset.surface=surface;
 root.innerHTML='<nav id="navbar" class="hgh-app-header"><div class="navbar-left"><button class="hgh-control hgh-icon-control">☰</button><a id="navbar-logo" href="#">F</a><a class="hgh-native-context" href="#">forgejo-github-skin</a></div><div class="navbar-right hgh-app-actions"><a href="/explore/repos">Explore</a><button class="hgh-control hgh-icon-control">♢</button></div></nav><main class="repository"><div class="repo-header"><div class="flex-item-title"><a href="#">ultrabricks</a> / <a href="#">forgejo-github-skin</a></div></div><div class="ui container"><form class="code-search"><input type="search" placeholder="Search code…"></form><div class="hgh-search-story-files">Repository content continues here. The local search is replaced by the header search.</div></div></main>';
 return root;
}
function render({query='',fixture='mixed',surface='light',delay=20,error=false,scope=null}={}){
 const root=page(surface);queueMicrotask(()=>{
  document.documentElement.dataset.theme=surface==='dark'?'hypergithub-dark':'hypergithub-light';document.documentElement.dataset.hghReady='true';
  const palette=surface==='dark'?{'--hgh-color-canvas':'#0d1117','--hgh-color-subtle':'#161b22','--hgh-color-text':'#e6edf3','--hgh-color-muted':'#9da7b3','--hgh-color-border':'#30363d','--hgh-color-counter':'#21262d','--hgh-color-link':'#58a6ff'}:{'--hgh-color-canvas':'#fff','--hgh-color-subtle':'#f6f8fa','--hgh-color-text':'#1f2328','--hgh-color-muted':'#59636e','--hgh-color-border':'#d1d9e0','--hgh-color-counter':'#eaeef2','--hgh-color-link':'#0969da'};
  for(const [name,value] of Object.entries(palette))document.documentElement.style.setProperty(name,value);
  restoreUniversalSearch(document);
  const provider=async(parsed,signal)=>{await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,delay);signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));},{once:true});});if(error)throw new Error('Fixture backend unavailable');return {took_ms:delay,results:fixtures[fixture]||[]};};
  const state=enhanceUniversalSearch(document,{provider});state?.open();
  if(scope)state?.ui.scopeRow.querySelector('[data-scope="'+scope+'"]')?.click();
  if(query){state.ui.input.value=query;state.ui.input.dispatchEvent(new Event('input',{bubbles:true}));}
 });return root;
}
export default {title:'Search/Universal search',parameters:{layout:'fullscreen'}};
export const Empty={render:()=>render()};
export const Symbol={render:()=>render({query:'restoreRepositoryControls',fixture:'symbol'})};
export const Structural={render:()=>render({query:'function restore ( row , state ) {',fixture:'ast'})};
export const FileName={render:()=>render({query:'universal-search.mjs',fixture:'file'})};
export const RepositoryGlobal={render:()=>render({query:'forgejo',fixture:'repositories',scope:'global'})};
export const OrganizationScope={render:()=>render({query:'search',fixture:'mixed',scope:'org'})};
export const MixedResults={render:()=>render({query:'enhance search',fixture:'mixed'})};
export const NoResults={render:()=>render({query:'nothing-like-this',fixture:'none'})};
export const Loading={render:()=>render({query:'restoreFocus',fixture:'symbol',delay:30000})};
export const BackendFallback={render:()=>render({query:'restoreFocus',error:true})};
export const Dark={render:()=>render({query:'function restoreFocus(trigger)',fixture:'ast',surface:'dark'})};
export const Mobile={render:()=>render({query:'restoreRepositoryControls',fixture:'symbol'}),parameters:{viewport:{defaultViewport:'mobile2'}}};
