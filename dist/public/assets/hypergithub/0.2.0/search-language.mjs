const qualifierNames=new Set(['repo','org','owner','scope','mode','symbol','def','refs','file','path','lang','language','type']);
const modes=new Set(['smart','text','ast','symbol','file','repo']);
function words(value){return String(value??'').match(/"[^"]*"|'[^']*'|\S+/g)||[];}
function unquote(value){const v=String(value??'');return v.length>1&&((v[0]==='"'&&v.at(-1)==='"')||(v[0]==="'"&&v.at(-1)==="'"))?v.slice(1,-1):v;}
function qualifier(token){const match=/^([a-z][a-z0-9_-]*):(.*)$/i.exec(token);if(!match||!qualifierNames.has(match[1].toLowerCase()))return null;return [match[1].toLowerCase(),unquote(match[2])];}
export function currentSearchContext(locationLike=globalThis.location){
 const path=String(locationLike?.pathname||'/').split('/').filter(Boolean);
 const reserved=new Set(['issues','pulls','milestones','explore','notifications','user','admin','repo','org','assets','api']);
 if(path.length>=2&&!reserved.has(path[0]))return {scope:'repo',repo:path[0]+'/'+path[1],org:path[0]};
 if(path.length===1&&!reserved.has(path[0]))return {scope:'org',org:path[0],repo:null};
 return {scope:'global',repo:null,org:null};
}
export function classifySearchText(text){
 const q=String(text??'').trim();
 if(!q)return {mode:'smart',reason:'empty'};
 if(/[(){}[\];]|=>|::|(?:^|\s)(?:function|class|def|fn|const|let|var|return|import|from|SELECT|MATCH)\b/i.test(q))return {mode:'ast',reason:'syntax'};
 if(/^[-\w./]+\.[a-z0-9]{1,8}(?::\d+)?$/i.test(q)||q.includes('/')&&!/\s/.test(q))return {mode:'file',reason:'path'};
 if(/^[A-Za-z_$][A-Za-z0-9_$]*(?:(?:\.|::)[A-Za-z_$][A-Za-z0-9_$]*)?$/.test(q))return {mode:'symbol',reason:'identifier'};
 return {mode:'text',reason:'words'};
}
export function parseSearchQuery(raw,context={scope:'global',repo:null,org:null}){
 const source=String(raw??'').slice(0,1024),free=[],filters={};
 for(const token of words(source)){
  const pair=qualifier(token);
  if(!pair){free.push(unquote(token));continue;}
  const [key,value]=pair;if(value)filters[key]=value;
 }
 let text=free.join(' ').trim(),scope=filters.scope||context.scope||'global';
 if(filters.repo){scope='repo';context={...context,repo:filters.repo,org:filters.repo.split('/')[0]};}
 if(filters.org||filters.owner){scope='org';context={...context,org:filters.org||filters.owner};}
 if(!['repo','org','global'].includes(scope))scope=context.scope||'global';
 let mode=filters.mode&&modes.has(filters.mode)?filters.mode:null,symbolIntent=null;
 if(filters.symbol){mode='symbol';text=filters.symbol;symbolIntent='any';}
 if(filters.def){mode='symbol';text=filters.def;symbolIntent='definition';}
 if(filters.refs){mode='symbol';text=filters.refs;symbolIntent='references';}
 if(filters.file||filters.path){mode='file';text=filters.file||filters.path;}
 const classified=classifySearchText(text);mode||=classified.mode;
 return {raw:source,text,mode,reason:filters.mode?'explicit':classified.reason,scope,repo:context.repo||null,org:context.org||null,path:filters.path||null,language:filters.lang||filters.language||null,type:filters.type||null,symbolIntent,filters};
}
export function describeSearch(parsed){
 const scope=parsed.scope==='repo'?(parsed.repo?'Repository · '+parsed.repo:'Repository'):parsed.scope==='org'?(parsed.org?'Organization · '+parsed.org:'Organization'):'Everywhere';
 const mode={smart:'Smart',text:'Text',ast:'Structure',symbol:parsed.symbolIntent==='definition'?'Definitions':parsed.symbolIntent==='references'?'References':'Symbols',file:'Files',repo:'Repositories'}[parsed.mode]||'Smart';
 return {scope,mode,label:scope+' · '+mode};
}
export const searchSyntax=[
 ['repo:owner/name','Limit to a repository'],['org:name','Limit to an organization'],['symbol:Name','Symbols, definitions and uses'],['def:Name','Definitions only'],['refs:Name','References only'],['file:*.ts','File names and paths'],['path:src/','Path prefix'],['lang:typescript','Language filter'],['mode:ast','Structural token search'],['mode:text','Text/BM25 search']
];
