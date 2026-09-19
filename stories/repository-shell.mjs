import octicons from '@primer/octicons';
import { forgejoMark } from './brand.js';
import { bindDisclosure } from '../src/list-options.mjs';
export const icon = (name, size = 16) => octicons[name]?.toSVG({width:size,height:size,'aria-hidden':'true'}) || '';
export const escape = (value) => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const control = (text, glyph, extra = '') => `<button type="button" class="hgh-control ${extra}">${glyph ? icon(glyph) : ''}<span>${text}</span></button>`;
export function disclosure(label, glyph, contents, extra = '') {
  return `<details class="hgh-disclosure ${extra}"><summary class="hgh-control ${label ? '' : 'hgh-icon-control'}" aria-label="${escape(label || 'More actions')}">${glyph ? icon(glyph) : ''}${label ? `<span>${escape(label)}</span>` : ''}${label ? icon('triangle-down',12) : ''}</summary><div class="hgh-options-panel">${contents}</div></details>`;
}
export function shell(content, {active='code', signedIn=true, privateRepo=false, name='react', owner='primer'}={}) {
  const root=document.createElement('div'); root.className='gh-canvas hgh-reference-shell';
  const nav=[['code','Code','screens-repository--desktop'],['pulls','Pull requests','screens-workflows--pull-requests',46],['issues','Issues','screens-workflows--issues',18]];
  root.innerHTML=`<header class="hgh-app-header">
    ${disclosure('Global navigation','three-bars','<a target="_top" href="/?path=/story/screens-repository--desktop">Repositories</a><a target="_top" href="/?path=/story/screens-workflows--pull-requests">Pull requests</a><a target="_top" href="/?path=/story/screens-workflows--issues">Issues</a>','hgh-global-nav')}
    <button class="hgh-context" type="button" aria-label="Repository context: ${owner}/${name}">${privateRepo ? icon('lock') : icon('repo')}<span>${escape(name)}</span>${icon('triangle-down',12)}</button>
    <div class="hgh-app-actions"><button class="hgh-control hgh-icon-control hgh-search-trigger" aria-label="Search repositories">${icon('search',16)}</button>
    ${signedIn ? `<button class="hgh-control hgh-icon-control" aria-label="Notifications">${icon('inbox',16)}</button>${disclosure('Account',null,'<p>Signed-in preview account</p><a target="_top" href="/?path=/story/screens-repository--signed-out">Show signed-out layout</a>','hgh-account')}` : '<button class="hgh-control hgh-signin">Sign in</button>'}</div>
    <form class="hgh-header-search" hidden><label>Search repositories<input name="q" type="search" placeholder="Find a repository…"></label><button class="hgh-control" type="submit">Search</button></form>
  </header><nav class="hgh-repo-nav" aria-label="Repository navigation">${nav.map(([key,label,id,count])=>`<a ${key===active?'aria-current="page"':''} target="_top" href="/?path=/story/${id}">${label}${count ? `<span class="hgh-count">${count}</span>` : ''}</a>`).join('')}${disclosure('More',null,'<a target="_top" href="/?path=/story/screens-workflows--commits">Commits</a><a target="_top" href="/?path=/story/screens-workflows--branches">Branches</a>','hgh-more-nav')}</nav><div class="hgh-page">${content}</div><footer class="hgh-site-footer"><a target="_top" href="/?path=/story/screens-repository--desktop" aria-label="Forgejo home">${forgejoMark(20)}<span>Powered by Forgejo</span></a></footer><div class="hgh-live-status" role="status" aria-live="polite"></div>`;
  root.querySelectorAll('.hgh-disclosure').forEach(bindDisclosure);
  const globalTrigger=root.querySelector('.hgh-global-nav>summary');
  globalTrigger.classList.add('hgh-icon-control'); globalTrigger.setAttribute('aria-label','Global navigation');
  globalTrigger.innerHTML=icon('three-bars',16);
  const account=root.querySelector('.hgh-account>summary');
  if(account) { account.className='hgh-avatar'; account.innerHTML='<span aria-hidden="true">A</span>'; account.setAttribute('aria-label','Account'); }
  const search=root.querySelector('.hgh-header-search');
  root.querySelector('.hgh-search-trigger').onclick=()=>{search.hidden=!search.hidden;if(!search.hidden) search.querySelector('input').focus();};
  search.onsubmit=e=>{e.preventDefault();root.querySelector('.hgh-live-status').textContent='Repository search: '+search.elements.namedItem('q').value;};
  root.querySelector('.hgh-context').onclick=()=>{const menu=root.querySelector('.hgh-global-nav');menu.open=!menu.open;};
  return root;
}
