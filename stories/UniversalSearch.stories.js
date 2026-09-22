import {enhanceUniversalSearch,openUniversalSearch,restoreUniversalSearch} from '../src/universal-search.mjs';

const fixtures={
  symbol:{inferred:'symbol',elapsed_ms:8.4,results:[
    {repo:'ultrabricks/forgejo-github-skin',path:'src/skin.mjs',language:'javascript',line:136,kind:'definition',snippet:'function <mark>focusBestSearch</mark>() { … }',ref:'refs/heads/main'},
    {repo:'ultrabricks/forgejo-github-skin',path:'src/skin.mjs',language:'javascript',line:466,kind:'code',snippet:'if (<mark>focusBestSearch</mark>()) event.preventDefault()',ref:'refs/heads/main'}]},
  ast:{inferred:'ast',elapsed_ms:18.9,results:[
    {repo:'ultrabricks/forgejo-github-skin',path:'src/mobile-chrome.mjs',language:'javascript',line:13,kind:'structure',snippet:'if (!nav || !left || !logo) return;',ref:'refs/heads/main'}]},
  file:{inferred:'file',elapsed_ms:3.1,results:[
    {repo:'ultrabricks/forgejo-github-skin',path:'src/universal-search.mjs',language:'javascript',line:1,kind:'file',snippet:'src/universal-search.mjs',ref:'refs/heads/main'}]},
  repository:{inferred:'text',elapsed_ms:2.1,results:[
    {repo:'ultrabricks/forgejo-search',path:'',language:'repository',line:0,kind:'repository',snippet:'ultrabricks/forgejo-search',ref:'refs/heads/main',url:'/ultrabricks/forgejo-search'}]},
  text:{inferred:'text',elapsed_ms:12.7,results:[
    {repo:'ultrabricks/forgejo-github-skin',path:'README.md',language:'markdown',line:15,kind:'code',snippet:'GitHub-familiar UI/UX overlay for <mark>Forgejo</mark>',ref:'refs/heads/main'}]},
  malicious:{inferred:'text',elapsed_ms:1,results:[
    {repo:'evil/repo',path:'x.js',language:'javascript',line:'1"><img src=x onerror=alert(1)>',kind:'code',snippet:'<img src=x onerror=alert(1)>',url:'javascript:alert(1)'},
    {repo:'evil/repo',path:'y.js',language:'javascript',line:1,kind:'code',snippet:'safe',url:'https://evil.example/x'}
  ]},
  markSafety:{inferred:'text',elapsed_ms:1,results:[
    {repo:'ultrabricks/forgejo-github-skin',path:'safe.js',language:'javascript',line:1,kind:'code',snippet:'</mark><script>alert(1)</script><mark>safe</mark>',url:'/ultrabricks/forgejo-github-skin/src/branch/main/safe.js'}
  ]}
};
function fakeFetch(mode='symbol'){
  return async url=>{
    document.body.dataset.lastSearchUrl=String(url);
    return new Response(JSON.stringify(fixtures[mode]),{status:200,headers:{'Content-Type':'application/json'}});
  };
}
function shell(owner='ultrabricks',lang='en'){
  const root=document.createElement('div');root.className='hgh-search-story repository';
  root.innerHTML='<nav id="navbar"><div class="navbar-left ui menu"><a id="navbar-logo" href="/">F</a><button type="button" class="hgh-control hgh-icon-control hgh-native-search" aria-label="'+(lang==='ru'?'Поиск репозиториев':'Search repositories')+'">⌕</button><a href="/explore/repos">Explore</a></div><div class="navbar-right">A</div></nav><div class="repo-header"><div class="flex-item-title"><a href="/ultrabricks">ultrabricks</a> / <a href="/ultrabricks/forgejo-github-skin">forgejo-github-skin</a></div></div><div class="code-search">Legacy repository search is hidden when universal search is ready.</div><main><h1>Repository content</h1><p>Press / to search files, symbols, structure and text.</p></main>';
  root.querySelector('.flex-item-title a').textContent=owner;
  return root;
}
function render({seed='focusBestSearch',mode='symbol',dark=false,error=false,auth=false,owner='ultrabricks',lang='en'}={}){
  restoreUniversalSearch(document);
  document.documentElement.lang=lang;
  document.documentElement.dataset.theme=dark?'hypergithub-dark':'hypergithub-light';
  const root=shell(owner,lang);
  queueMicrotask(()=>{
    const fetchImpl=auth?async()=>new Response('{}',{status:401}):error?async()=>new Response('{}',{status:503}):fakeFetch(mode);
    enhanceUniversalSearch(document,{fetchImpl});
    openUniversalSearch(document,{seed});
  });
  return root;
}
export default {title:'Search/Universal search'};
export const Symbol={render:()=>render()};
export const ASTStructure={render:()=>render({seed:'if (nav) { return; }',mode:'ast'})};
export const FileName={render:()=>render({seed:'universal-search.mjs',mode:'file'})};
export const RepositoryName={render:()=>render({seed:'forgejo-search',mode:'repository'})};
export const FullText={render:()=>render({seed:'Forgejo',mode:'text'})};
export const GlobalScope={render:()=>render({seed:'owner:ultrabricks restoreFocus',mode:'symbol'})};
export const Error={render:()=>render({seed:'restoreFocus',error:true})};
export const Dark={render:()=>render({dark:true,seed:'focusBestSearch'})};

export const MaliciousPayload={render:()=>render({seed:'attack',mode:'malicious',owner:'<img src=x onerror=alert(1)>'})};

export const AuthRequired={render:()=>render({seed:'restoreFocus',auth:true})};
export const Russian={render:()=>render({seed:'restoreFocus',lang:'ru'})};
export const RestoredRussian={render:()=>{
  restoreUniversalSearch(document);
  document.documentElement.lang='ru';
  const root=shell('ultrabricks','ru');
  queueMicrotask(()=>{
    enhanceUniversalSearch(document,{fetchImpl:fakeFetch('symbol')});
    restoreUniversalSearch(document);
  });
  return root;
}};

export const MarkSafety={render:()=>render({seed:'safe',mode:'markSafety'})};
