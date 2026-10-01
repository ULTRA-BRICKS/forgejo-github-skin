/** One disclosure for list filters, sort order and density. Existing controls keep their listeners. */
import {usable} from './core.mjs';

export function createListOptions(doc, label = 'List options') {
  const details = doc.createElement('details');
  details.className = 'hgh-list-options hgh-disclosure';
  const trigger = doc.createElement('summary');
  trigger.className = 'hgh-control hgh-icon-control';
  trigger.setAttribute('aria-label', label);
  trigger.setAttribute('title', label);
  trigger.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="13" cy="8" r="1.5"/></svg>';
  const panel = doc.createElement('div');
  panel.className = 'hgh-options-panel';
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', label);
  details.append(trigger, panel);
  const destroy = bindDisclosure(details);
  return { details, trigger, panel, destroy };
}
const disclosureCleanup = new WeakMap();
export function bindDisclosure(details) {
  if (disclosureCleanup.has(details)) return disclosureCleanup.get(details);
  details.dataset.disclosureBound = 'true';
  const doc = details.ownerDocument;
  const trigger = details.querySelector('summary');
  let disposed=false;
  const close = (restore) => { details.open = false; if (restore) trigger?.focus(); };
  const outside = (event) => { if (!details.contains(event.target)) close(false); };
  const innerEscapes = new WeakSet();
  const rememberInnerEscape = (event) => {
    if (event.key !== 'Escape') return;
    const dropdown = event.target.closest?.('.dropdown');
    if (!dropdown || !details.contains(dropdown)) return;
    for (const menu of dropdown.querySelectorAll('.menu.visible')) {
      if (usable(menu)) { innerEscapes.add(event); return; }
    }
  };
  const escape = (event) => {
    if (event.key !== 'Escape' || !details.open || event.defaultPrevented || event.isComposing || event.repeat || event.ctrlKey || event.metaKey || event.altKey || innerEscapes.has(event)) return;
    if (event.target.closest?.('dialog[open], [role="dialog"][aria-modal="true"]')) return;
    event.preventDefault();
    event.stopPropagation();
    close(true);
  };
  // A key press may arrive before the asynchronous toggle event.
  details.addEventListener('keydown', rememberInnerEscape, true);
  details.addEventListener('keydown', escape);
  const onToggle=() => {
    if(disposed)return;
    trigger?.setAttribute('aria-expanded', String(details.open));
    doc.removeEventListener('pointerdown', outside, true);
    doc.removeEventListener('keydown', escape);
    if (details.open) { doc.addEventListener('pointerdown', outside, true); doc.addEventListener('keydown', escape); }
  };
  details.addEventListener('toggle',onToggle);
  trigger?.setAttribute('aria-expanded', String(details.open));
  const cleanup=()=>{disposed=true;details.removeEventListener('toggle',onToggle);disclosureCleanup.delete(details);delete details.dataset.disclosureBound;doc.removeEventListener('pointerdown',outside,true);doc.removeEventListener('keydown',escape);details.removeEventListener('keydown',escape);details.removeEventListener('keydown',rememberInnerEscape,true);};
  disclosureCleanup.set(details,cleanup);
  return cleanup;
}
const nativeStates = new Map();
function releaseState(host,state){
  state.media.removeEventListener('change',state.update);
  state.destroy();state.details.open=false;
  // parentNode, never isConnected: an htmx-style swap can detach the whole host (marker
  // included) before cleanup runs, and isConnected is false there even though the marker's
  // parent still exists — checking it would silently strand every relocated control instead
  // of restoring it (same fix as pagination.mjs's relocate()/organization.mjs's restoreSlot).
  for(const {node,marker} of state.slots)if(marker.parentNode)marker.replaceWith(node);
  state.details.remove();delete host.dataset.hghDensity;nativeStates.delete(host);
}
function cleanupDisconnected(doc){
  for(const [host,state] of nativeStates)if(host.ownerDocument===doc&&(!host.isConnected||!state.header.isConnected||!state.details.isConnected))releaseState(host,state);
}
/** Move the actual Forgejo dropdown nodes, rather than reimplementing their API or permissions. */
export function enhanceNativeListOptions(doc = document) {
  cleanupDisconnected(doc);
  const ru=doc.documentElement.lang.startsWith('ru');
  for (const host of doc.querySelectorAll('.page-content.repository.issue-list')) {
    if (nativeStates.has(host)) continue;
    const header = host.querySelector('#issue-filters .issue-list-toolbar-right') || host.querySelector('.list-header');
    if (!header) continue;
    const selectors = ['.filter.menu > .dropdown','.list-header-sort','.list-header-author','.label-filter','.list-header-milestone','.list-header-assignee'];
    const controls = selectors.flatMap(selector => [...header.querySelectorAll(selector)])
      .filter((node, index, all) => all.indexOf(node) === index && !all.some(other => other !== node && other.contains(node)));
    if (controls.length < 2) continue;
    const { details, trigger, panel, destroy } = createListOptions(doc, ru ? 'Фильтры, сортировка и вид' : 'Filters, sorting and view');
    details.dataset.hghNativeOptions = 'true';
    const heading = doc.createElement('strong'); heading.textContent = ru ? 'Параметры списка' : 'List options';
    panel.append(heading);
    const density=doc.createElement('label');density.className='hgh-field';density.textContent=ru?'Плотность строк':'List view';
    const select=doc.createElement('select');select.name='hgh-density';
    for(const [value,en,russian] of [['comfortable','Comfortable','Обычный'],['compact','Compact','Компактный']]){const option=doc.createElement('option');option.value=value;option.textContent=ru?russian:en;select.append(option);}
    try{select.value=doc.defaultView.localStorage.getItem('hypergithub.listDensity')||'comfortable';}catch{}
    const densityChange=()=>{host.dataset.hghDensity=select.value;const params=new URLSearchParams(doc.defaultView.location.search);trigger.dataset.active=String(select.value==='compact'||['labels','assignee','poster','milestone','project','sort'].some(key=>params.has(key)&&!['','0','-1','newest'].includes(params.get(key))));try{doc.defaultView.localStorage.setItem('hypergithub.listDensity',select.value);}catch{}};
    select.addEventListener('change',densityChange);density.append(select);panel.append(density);densityChange();
    const container=header.querySelector(':scope > .filter.menu');
    const moving=container && controls.every(node=>container.contains(node)) ? [container] : controls;
    const slots = moving.map(node => { const marker = doc.createComment('hgh-control-position'); node.before(marker); return {node, marker}; });
    header.append(details);
    const media = doc.defaultView.matchMedia('(max-width: 767px)');
    const update = () => {
      if(!host.isConnected||!header.isConnected){const state=nativeStates.get(host);if(state)releaseState(host,state);return;}
      details.open = false;
      if (media.matches) { for (const {node} of slots) panel.append(node); details.hidden = false; }
      else { for (const {node,marker} of slots) if(marker.isConnected)marker.after(node); details.hidden = true; }
    };
    media.addEventListener('change', update);
    nativeStates.set(host, {slots, details, media, update, destroy, header}); update();
  }
}
export function restoreNativeListOptions(doc = document) {
  for(const [host,state] of nativeStates)if(host.ownerDocument===doc)releaseState(host,state);
}
