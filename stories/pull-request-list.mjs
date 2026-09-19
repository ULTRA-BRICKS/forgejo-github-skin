import { shell, icon, escape } from './repository-shell.mjs';
import { createListOptions } from '../src/list-options.mjs';
const rows = [
  {id:8414,title:'Fix Autocomplete dropping the last typed character',author:'alex',label:'bug',comments:1,age:'13 hours ago',draft:false},
  {id:8413,title:'SelectPanel: announce filter input name on initial focus',author:'morgan',label:'accessibility',comments:3,age:'15 hours ago',draft:false},
  {id:8412,title:'Apply disabled styles while loading',author:'alex',label:'bug',comments:2,age:'yesterday',draft:true},
  {id:8411,title:'Handle Fragment triggers safely in Tooltip',author:'morgan',label:'accessibility',comments:8,age:'2 days ago',draft:false},
  {id:8410,title:'Release tracking and component documentation',author:'alex',label:'docs',comments:0,age:'2 days ago',draft:false},
  {id:8409,title:'Preserve focus when nested menus close',author:'casey',label:'accessibility',comments:5,age:'3 days ago',draft:false},
];
export function pullRequests({menuOpen=false,compact=false}={}) {
  const root=shell(`<main class="hgh-pull-page"><div class="hgh-list-heading"><h1>Pull requests</h1><button class="hgh-control hgh-new-pr">New pull request</button></div><form class="hgh-list-search" role="search"><label class="hgh-sr-only" for="hgh-pr-query">Search pull requests</label><input id="hgh-pr-query" type="search" placeholder="is:pr state:open" aria-label="Search pull requests"><button class="hgh-control hgh-icon-control" type="submit" aria-label="Search">${icon('search',20)}</button></form><section class="hgh-pr-table" aria-label="Pull requests"><div class="hgh-list-head"><label class="hgh-select-all"><input type="checkbox" aria-label="Select all pull requests"></label><div class="hgh-list-counts"><button class="hgh-state-open" type="button" aria-pressed="true">Open <span class="hgh-count" data-visible-count>6</span></button><button class="hgh-state-closed" type="button" aria-pressed="false">Closed <span class="hgh-count">780</span></button></div><div class="hgh-toolbar-spacer"></div><span class="hgh-active-options" aria-live="polite"></span></div><ol class="hgh-pr-rows"></ol><p class="hgh-empty-list" hidden>No pull requests match these filters.</p></section></main>`,{active:'pulls'});
  const {details, panel, trigger}=createListOptions(document,'Filters, sorting and view');
  const field=(label,name,options)=>`<label class="hgh-field">${label}<select name="${name}" aria-label="${label}">${options.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></label>`;
  panel.innerHTML='<strong>List options</strong>'+field('Sort by','sort',[['newest','Newest'],['oldest','Oldest'],['comments','Most comments']])+'<hr>'+field('Author','author',[['','Any author'],['alex','alex'],['morgan','morgan'],['casey','casey']])+field('Label','label',[['','Any label'],['bug','bug'],['accessibility','accessibility'],['docs','docs']])+'<fieldset><legend>List view</legend><label class="hgh-radio"><input type="radio" name="density" value="comfortable" checked> Comfortable</label><label class="hgh-radio"><input type="radio" name="density" value="compact"> Compact</label></fieldset><button class="hgh-control hgh-reset" type="button">Reset options</button>';
  root.querySelector('.hgh-list-head').append(details);
  const list=root.querySelector('.hgh-pr-rows'), query=root.querySelector('[type=search]');
  let closed=false; const selected=new Set();
  const render=()=>{
    const sort=panel.querySelector('[name=sort]').value, author=panel.querySelector('[name=author]').value, label=panel.querySelector('[name=label]').value;
    const term=query.value.toLowerCase().replace(/is:pr|state:open/g,'').trim();
    const visible=closed?[]:rows.filter(row=>(!author||row.author===author)&&(!label||row.label===label)&&(!term||row.title.toLowerCase().includes(term)));
    visible.sort((a,b)=>sort==='oldest'?a.id-b.id:sort==='comments'?b.comments-a.comments:b.id-a.id);
    list.innerHTML=visible.map(row=>`<li data-pr-id="${row.id}" class="hgh-pr-row"><input type="checkbox" aria-label="Select pull request ${row.id}" ${selected.has(row.id)?'checked':''}><span class="hgh-pr-state ${row.draft?'hgh-draft':''}" title="${row.draft?'Draft':'Open'}">${icon(row.draft?'git-pull-request-draft':'git-pull-request',18)}</span><div class="hgh-pr-row-main"><a class="hgh-pr-title" target="_top" href="/?path=/story/screens-workflows--pull-request-detail">${escape(row.title)}</a><div class="hgh-pr-meta">#${row.id} · ${row.author} opened ${row.age}<span class="hgh-check-status">${icon('check')} Checks passed</span></div>${row.comments?`<span class="hgh-pr-comments">${icon('comment-discussion')} ${row.comments}</span>`:''}</div></li>`).join('');
    root.querySelector('[data-visible-count]').textContent=String(visible.length);
    root.querySelector('.hgh-empty-list').hidden=visible.length>0;
    const density=panel.querySelector('[name=density]:checked').value;
    root.dataset.density=density;
    const active=[author&&'Author: '+author,label&&'Label: '+label,sort!=='newest'&&'Sorted',density==='compact'&&'Compact'].filter(Boolean);
    root.querySelector('.hgh-active-options').textContent=active.length?active.length+' active':'';
    trigger.dataset.active=String(active.length>0);
    root.querySelector('[role=status]').textContent=`${visible.length} pull requests; ${sort}; ${density}`;
    const all=root.querySelector('[aria-label="Select all pull requests"]');all.checked=visible.length>0&&visible.every(row=>selected.has(row.id));all.indeterminate=visible.some(row=>selected.has(row.id))&&!all.checked;
    list.querySelectorAll('input').forEach(check=>check.onchange=()=>{const id=Number(check.closest('[data-pr-id]').dataset.prId);check.checked?selected.add(id):selected.delete(id);render();});
  };
  panel.onchange=render;query.oninput=render;
  root.querySelector('form').onsubmit=e=>{e.preventDefault();render();};
  root.querySelector('[aria-label="Select all pull requests"]').onchange=e=>{list.querySelectorAll('[data-pr-id]').forEach(li=>{const id=Number(li.dataset.prId);e.target.checked?selected.add(id):selected.delete(id);});render();};
  panel.querySelector('.hgh-reset').onclick=()=>{panel.querySelectorAll('select').forEach(el=>el.selectedIndex=0);panel.querySelector('[value=comfortable]').checked=true;render();};
  for(const [selector,value] of [['.hgh-state-open',false],['.hgh-state-closed',true]])root.querySelector(selector).onclick=()=>{closed=value;root.querySelector('.hgh-state-open').setAttribute('aria-pressed',String(!closed));root.querySelector('.hgh-state-closed').setAttribute('aria-pressed',String(closed));render();};
  root.querySelector('.hgh-new-pr').onclick=()=>{root.querySelector('[role=status]').textContent='This interactive layout uses synthetic data; creating a pull request is performed in Forgejo.';};
  if(compact)panel.querySelector('[value=compact]').checked=true;
  render();details.open=menuOpen;return root;
}
