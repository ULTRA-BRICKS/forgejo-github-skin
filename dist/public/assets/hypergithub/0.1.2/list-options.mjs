/** One disclosure for list filters, sort order and density. Existing controls keep their listeners. */
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
  const close = (restore) => { details.open = false; if (restore) trigger?.focus(); };
  const outside = (event) => { if (!details.contains(event.target)) close(false); };
  const escape = (event) => {
    if (event.key === 'Escape' && details.open) { event.preventDefault(); event.stopPropagation(); close(true); }
  };
  // A key press may arrive before the asynchronous toggle event.
  details.addEventListener('keydown', escape);
  details.addEventListener('toggle', () => {
    trigger?.setAttribute('aria-expanded', String(details.open));
    doc.removeEventListener('pointerdown', outside, true);
    doc.removeEventListener('keydown', escape, true);
    if (details.open) { doc.addEventListener('pointerdown', outside, true); doc.addEventListener('keydown', escape, true); }
  });
  trigger?.setAttribute('aria-expanded', String(details.open));
  const cleanup=()=>{doc.removeEventListener('pointerdown',outside,true);doc.removeEventListener('keydown',escape,true);details.removeEventListener('keydown',escape);};
  disclosureCleanup.set(details,cleanup);
  return cleanup;
}
const nativeStates = new WeakMap();
/** Move the actual Forgejo dropdown nodes, rather than reimplementing their API or permissions. */
export function enhanceNativeListOptions(doc = document) {
  for (const host of doc.querySelectorAll('.page-content.repository.issue-list')) {
    if (nativeStates.has(host)) continue;
    const header = host.querySelector('#issue-filters .issue-list-toolbar-right') || host.querySelector('.list-header');
    if (!header) continue;
    const selectors = ['.filter.menu > .dropdown','.list-header-sort','.list-header-author','.label-filter','.list-header-milestone','.list-header-assignee'];
    const controls = selectors.flatMap(selector => [...header.querySelectorAll(selector)])
      .filter((node, index, all) => all.indexOf(node) === index && !all.some(other => other !== node && other.contains(node)));
    if (controls.length < 2) continue;
    const { details, panel, destroy } = createListOptions(doc, doc.documentElement.lang.startsWith('ru') ? 'Фильтры, сортировка и вид' : 'Filters, sorting and view');
    details.dataset.hghNativeOptions = 'true';
    const heading = doc.createElement('strong'); heading.textContent = doc.documentElement.lang.startsWith('ru') ? 'Параметры списка' : 'List options';
    panel.append(heading);
    const density=doc.createElement('label');density.className='hgh-field';density.textContent=doc.documentElement.lang.startsWith('ru')?'Плотность строк':'List view';
    const select=doc.createElement('select');select.name='hgh-density';
    for(const [value,en,ru] of [['comfortable','Comfortable','Обычный'],['compact','Compact','Компактный']]){const option=doc.createElement('option');option.value=value;option.textContent=doc.documentElement.lang.startsWith('ru')?ru:en;select.append(option);}
    try{select.value=doc.defaultView.localStorage.getItem('hypergithub.listDensity')||'comfortable';}catch{}
    const densityChange=()=>{host.dataset.hghDensity=select.value;try{doc.defaultView.localStorage.setItem('hypergithub.listDensity',select.value);}catch{}};
    select.addEventListener('change',densityChange);density.append(select);panel.append(density);densityChange();
    const container=header.querySelector(':scope > .filter.menu');
    const moving=container && controls.every(node=>container.contains(node)) ? [container] : controls;
    const slots = moving.map(node => { const marker = doc.createComment('hgh-control-position'); node.before(marker); return {node, marker}; });
    header.append(details);
    const media = doc.defaultView.matchMedia('(max-width: 767px)');
    const update = () => {
      details.open = false;
      if (media.matches) { for (const {node} of slots) panel.append(node); details.hidden = false; }
      else { for (const {node,marker} of slots) marker.after(node); details.hidden = true; }
    };
    media.addEventListener('change', update);
    nativeStates.set(host, {slots, details, media, update, destroy}); update();
  }
}
export function restoreNativeListOptions(doc = document) {
  for (const host of doc.querySelectorAll('.page-content.repository.issue-list')) {
    const state = nativeStates.get(host); if (!state) continue;
    state.media.removeEventListener('change', state.update); state.details.open = false;
    for (const {node,marker} of state.slots) { if (marker.isConnected) marker.replaceWith(node); }
    state.destroy();state.details.remove();delete host.dataset.hghDensity;nativeStates.delete(host);
  }
}
