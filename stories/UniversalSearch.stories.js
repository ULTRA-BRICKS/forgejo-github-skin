// Production search with captured responses; theme sheets belong to this story's lifetime.
import {enhanceUniversalSearch,openUniversalSearch,restoreUniversalSearch} from '../src/universal-search.mjs';
import coverageFixtures from './search-coverage-fixtures.json';
import {flattenTokens,resolveToken,cssValue} from '../src/tokens.mjs';
import tokenDocument from '../tokens.json';

const themeTokens=flattenTokens(tokenDocument);
const themeSheets=['light','dark'].map(mode=>{
  const palette=[...themeTokens.keys()].filter(name=>name.startsWith(`color.${mode}.`))
    .map(name=>`--hgh-color-${name.split('.').at(-1)}:${cssValue(resolveToken(name,themeTokens))}`).join(';');
  return `:root[data-theme="hypergithub-${mode}"]{${palette};color-scheme:${mode}}`;
}).join('');

// Exact disposable-backend captures plus explicitly controlled engine/version variants.
function engineFixture(status){
  const payload=structuredClone(coverageFixtures.unavailable);
  payload.coverage.ast.status=status;
  if(status==='not_requested')payload.coverage.limits.ast_files.state='not_applicable';
  return payload;
}

const fixtures={
  ...coverageFixtures,
  timeout:engineFixture('timeout'),
  failed:engineFixture('failed'),
  notRequested:{...engineFixture('not_requested'),query:'needle',mode:'text',inferred:'text'},
  unsupported:{...coverageFixtures.enabled,coverage:{...coverageFixtures.enabled.coverage,version:2}},
  malformed:{...coverageFixtures.enabled,coverage:{...coverageFixtures.enabled.coverage,ast:{status:'<img src=x onerror=alert(1)>'}}},
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
function shell(owner='ultrabricks',lang='en',organization=false){
  const root=document.createElement('div');root.className='hgh-search-story';
  root.innerHTML='<style>.hgh-search-story #navbar,.hgh-search-story .navbar-left,.hgh-search-story .navbar-right,.hgh-search-story .navbar-mobile-right{display:flex;align-items:center;gap:8px}.hgh-search-story .navbar-right{margin-left:auto}.hgh-search-story .navbar-mobile-right{display:none}@media(max-width:767px){.hgh-search-story .navbar-left{width:100%}.hgh-search-story .navbar-mobile-right{display:flex;margin-left:auto}.hgh-search-story .navbar-right,.hgh-search-story .navbar-left>a[href$="/explore/repos"]{display:none}}</style><nav id="navbar"><div class="navbar-left ui menu"><a id="navbar-logo" href="/">F</a><div class="navbar-mobile-right"><button type="button" class="hgh-control hgh-icon-control hgh-native-search" aria-label="'+(lang==='ru'?'Поиск репозиториев':'Search repositories')+'">⌕</button></div><a href="/explore/repos">Explore</a></div><div class="navbar-right">A</div></nav><div class="repo-header"><div class="flex-item-title"><a href="/ultrabricks">ultrabricks</a> / <a href="/ultrabricks/forgejo-github-skin">forgejo-github-skin</a></div></div><form class="code-search"><input type="search" placeholder="Search code"></form><main><h1>Repository content</h1><p>Use the header to search files, symbols, structure and text.</p></main>';
  root.querySelector('.flex-item-title a').textContent=owner;
  if(organization){
    root.querySelector('.hgh-native-search').remove();
    root.querySelector('.repo-header').outerHTML='<div class="secondary-nav"><div class="right menu"><a class="ui basic button" href="/ultrabricks">View home</a></div></div>';
    root.querySelector('.code-search').outerHTML='<div class="page-content organization profile"><form id="repo-search-form"><input type="search" placeholder="Search repos…"></form></div>';
    root.querySelector('h1').textContent='Organization repositories';
  }
  return root;
}
function render({seed='focusBestSearch',mode='symbol',dark=false,error=false,auth=false,owner='ultrabricks',lang='en',organization=false,open=true,mount=true}={}){
  restoreUniversalSearch(document);
  document.documentElement.lang=lang;
  document.documentElement.dataset.theme=dark?'hypergithub-dark':'hypergithub-light';
  const root=shell(owner,lang,organization);
  const themeStyle=document.createElement('style');
  themeStyle.textContent=themeSheets;
  root.prepend(themeStyle);
  queueMicrotask(()=>{
    const fetchImpl=auth?async()=>new Response('{}',{status:401}):error?async()=>new Response('{}',{status:503}):fakeFetch(mode);
    if(mount)enhanceUniversalSearch(document,{fetchImpl});
    if(mount&&open)openUniversalSearch(document,{seed});
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
export const HeaderRepository={render:()=>render({open:false})};
export const HeaderOrganization={render:()=>render({organization:true,open:false})};
export const OrganizationScope={render:()=>render({organization:true})};
export const NativeFallback={render:()=>render({mount:false,open:false})};

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

export const CoverageEnabled={render:()=>render({seed:coverageFixtures.enabled.query,mode:'enabled'})};
export const CoverageUnavailable={render:()=>render({seed:coverageFixtures.unavailable.query,mode:'unavailable'})};
export const CoverageTimeout={render:()=>render({seed:coverageFixtures.unavailable.query,mode:'timeout'})};
export const CoverageFailed={render:()=>render({seed:coverageFixtures.unavailable.query,mode:'failed'})};
export const CoverageNoCandidates={render:()=>render({seed:coverageFixtures.denied.query,mode:'denied'})};
export const CoverageTruncated={render:()=>render({seed:coverageFixtures.truncated.query,mode:'truncated'})};
export const CoverageNotRequested={render:()=>render({seed:'needle',mode:'notRequested'})};
export const CoverageUnsupported={render:()=>render({seed:'needle',mode:'unsupported'})};
export const CoverageMalformed={render:()=>render({seed:'needle',mode:'malformed'})};
export const EmptyQuery={render:()=>render({seed:'',mode:'enabled'})};
export const CoverageTruncatedDark={render:()=>render({seed:coverageFixtures.truncated.query,mode:'truncated',dark:true})};
