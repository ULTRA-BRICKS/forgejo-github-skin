import {shell,icon} from './repository-shell.mjs';
import './organization-page.css';
const seed=[{name:'component-library',visibility:'Public',language:'TypeScript',description:'Accessible components and interaction patterns.',stars:48,forks:8,issues:12,pulls:4,updated:1,activity:[1,3,2,7,3,4,2,2,8,3,5,2]}, {name:'calendar-tools',visibility:'Private',language:'TypeScript',description:'Shared calendar workflows and useful automations.',stars:6,forks:1,issues:3,pulls:2,updated:2,activity:[0,2,1,3,4,2,1,5,3,8,2,4]}, {name:'workspace-archive',visibility:'Private',language:'Go',description:'Reliable workspace archiving and restore tools.',stars:3,forks:0,issues:2,pulls:1,updated:3,activity:[0,0,0,1,0,3,0,2,0,1,0,0]}, {name:'design-tokens',visibility:'Public',language:'CSS',description:'Shared color, spacing and typography primitives.',stars:19,forks:2,issues:0,pulls:0,updated:5,activity:[1,0,0,0,2,0,0,0,1,0,0,0]}];
const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const glyph=(name)=>{const n=node('span','org-glyph');n.innerHTML=icon(name);return n;};
function chart(values){const n=node('div','org-activity');const max=Math.max(1,...values);const points=values.map((v,i)=>(i*220/(values.length-1))+','+(28-v/max*25)).join(' ');n.innerHTML='<svg viewBox="0 0 220 32" aria-label="Recent activity" role="img"><polyline fill="none" stroke="currentColor" stroke-width="2" points="'+points+'"/></svg>';return n;}
export function organizationPage({surface='light',empty=false,member=true,loading=false}={}){
 const root=shell('',{name:'ultrabricks',owner:'ultrabricks'});root.classList.add('org-root');root.dataset.surface=surface;
 root.querySelector('.hgh-context').replaceChildren(node('span','','Ultrabricks'));
 const nav=root.querySelector('.hgh-repo-nav');nav.replaceChildren();
 for(const [label,id] of [['Overview','overview'],['Repositories','repositories'],['People','people']]){const a=node('a','',label);a.href='#org-'+id;if(id==='overview')a.setAttribute('aria-current','page');nav.append(a);a.onclick=e=>{e.preventDefault();root.querySelector('#org-'+id)?.scrollIntoView({behavior:'smooth'});};}
 const page=root.querySelector('.hgh-page');page.classList.add('org-page');
 const header=node('header','org-identity');header.id='org-overview';const logo=node('span','org-monogram','UB');logo.setAttribute('aria-hidden','true');
 const intro=node('div');intro.append(node('h1','','Ultrabricks'),node('p','','Open tools for focused teamwork.'));
 const follow=node('button','hgh-control','Follow');follow.type='button';follow.setAttribute('aria-pressed','false');follow.onclick=()=>{const on=follow.getAttribute('aria-pressed')!=='true';follow.setAttribute('aria-pressed',String(on));follow.textContent=on?'Following':'Follow';};header.append(logo,intro,follow);page.append(header);
 if(!member)page.append(node('p','org-notice','Public view · private repositories are not listed.'));
 const pinned=node('section','org-pinned');pinned.append(node('h2','','Pinned'),card(seed[0],true));page.append(pinned);
 const repositories=node('section','org-repositories');repositories.id='org-repositories';repositories.append(node('h2','','Repositories'));
 const tools=node('form','org-filters');tools.setAttribute('role','search');const search=node('input');search.type='search';search.placeholder='Find a repository…';search.setAttribute('aria-label','Find a repository');tools.append(search);
 const selects={};for(const [name,label,options] of [['visibility','Type',['All','Public','Private']],['language','Language',['All','TypeScript','Go','CSS']],['sort','Sort',['Recently updated','Name','Stars']]]){const field=node('label','org-select'),select=node('select');select.name=name;select.setAttribute('aria-label',label);for(const value of options){const opt=node('option','',value==='All'?label:value==='Recently updated'?'Updated':value);opt.value=value;select.append(opt);}field.append(node('span','hgh-sr-only',label),select);tools.append(field);selects[name]=select;}
 const reset=node('button','hgh-control','Clear filters');reset.type='button';tools.append(reset);repositories.append(tools);
 const list=node('div','org-repo-list'),result=node('p','org-result');result.setAttribute('role','status');repositories.append(result,list);page.append(repositories);
 const people=node('section','org-people');people.id='org-people';people.append(node('h2','','People'),node('p','','Contributors across the shared tools.'));
 const avatars=node('div','org-people-icons');for(const name of ['Alex','Morgan','Casey','Taylor']){const avatar=node('span','hgh-avatar',name[0]);avatar.title=name;avatars.append(avatar);}people.append(avatars);page.append(people);
 function card(repo,pinned=false){
  const article=node('article','org-repo-card');article.dataset.repo=repo.name;
  const heading=node('div','org-card-title'),link=node('a','',repo.name);link.href='/?path=/story/screens-repository--desktop';link.target='_top';link.title='Open the example repository screen';heading.append(glyph('repo'),link,node('span','hgh-visibility-badge',repo.visibility));article.append(heading,node('p','org-card-description',repo.description));
  if(!pinned)article.append(chart(repo.activity));const facts=node('div','org-card-facts');
  for(const [name,value] of [['dot-fill',repo.language],['star',repo.stars],['repo-forked',repo.forks],...(!pinned?[['issue-opened',repo.issues],['git-pull-request',repo.pulls]]:[])]){const f=node('span');f.append(glyph(name),node('span','',String(value)));facts.append(f);}article.append(facts);if(!pinned)article.append(node('small','org-updated','Updated '+(repo.updated===1?'yesterday':repo.updated+' days ago')));return article;
 }
 function update(){
  let data=empty?[]:seed.filter(r=>(member||r.visibility==='Public')&&(!search.value||r.name.includes(search.value.toLowerCase()))&&(selects.visibility.value==='All'||r.visibility===selects.visibility.value)&&(selects.language.value==='All'||r.language===selects.language.value));
  data=data.toSorted((a,b)=>selects.sort.value==='Stars'?b.stars-a.stars:selects.sort.value==='Name'?a.name.localeCompare(b.name):a.updated-b.updated);list.replaceChildren();
  if(loading){result.textContent='Loading repositories…';list.setAttribute('aria-busy','true');for(let i=0;i<3;i++)list.append(node('div','org-skeleton'));return;}
  result.textContent=data.length+' repositories';list.setAttribute('aria-busy','false');
  if(!data.length){const blank=node('div','org-empty');blank.append(node('h3','','No repositories match'),node('p','','Try a different name or clear the filters.'));list.append(blank);}else data.forEach(r=>list.append(card(r)));
 }
 search.oninput=update;tools.onsubmit=e=>{e.preventDefault();update();};Object.values(selects).forEach(s=>s.onchange=update);reset.onclick=()=>{search.value='';Object.values(selects).forEach(s=>s.selectedIndex=0);update();};
 update();return root;
}
