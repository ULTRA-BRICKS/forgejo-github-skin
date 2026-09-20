import {createListOptions} from './list-options.mjs';
const states=new Map();
function restore(row,state){
 state.media.removeEventListener('change',state.update);state.destroy();state.details.open=false;
 for(const {node,marker}of state.slots){if(marker.isConnected){if(node.isConnected)marker.replaceWith(node);else marker.remove();}}
 for(const label of row.querySelectorAll('.hgh-control-label'))label.remove();
 state.details.remove();delete row.dataset.hghRepoControls;states.delete(row);
}
/** Compact the real native controls on mobile; native forms and listeners retain ownership. */
export function enhanceRepositoryControls(doc=document){
 for(const [row,state]of states)if(row.ownerDocument===doc&&(!row.isConnected||!state.details.isConnected))restore(row,state);
 for(const row of doc.querySelectorAll('.repository .repo-button-row')){
  if(states.has(row))continue;
  const branch=row.querySelector('.js-branch-tag-selector'),clone=row.querySelector('.hgh-clone');
  if(!branch||!clone)continue;
  const ru=doc.documentElement.lang.startsWith('ru');
  const {details,panel,destroy}=createListOptions(doc,ru?'Действия с файлами':'File actions');
  details.classList.remove('hgh-list-options');details.classList.add('hgh-repo-more');
  const controls=[...row.querySelectorAll(':scope > .button-sequence > a, :scope > .button-sequence > button, :scope > [data-hgh-help]')];
  const slots=controls.map(node=>{const marker=doc.createComment('hgh-repo-control-slot');node.before(marker);return {node,marker};});
  for(const node of controls)if(node.id==='new-pull-request'&&!node.querySelector('.hgh-control-label')){const label=doc.createElement('span');label.className='hgh-control-label';label.textContent=ru?'Новый pull request':'New pull request';node.append(label);}
  row.append(details);row.dataset.hghRepoControls='true';
  const social=doc.querySelector('.repository .repo-header .repo-buttons'),main=row.parentElement;
  if(social&&main.querySelector(':scope > .repo-description')){const marker=doc.createComment('hgh-social-slot');social.before(marker);slots.push({node:social,marker,social:true});}
  const media=doc.defaultView.matchMedia('(max-width:767px)');
  const update=()=>{
   if(!row.isConnected){const state=states.get(row);if(state)restore(row,state);return;}
   details.open=false;details.hidden=!media.matches;
   for(const slot of slots){
    if(!slot.node.isConnected)continue;
    if(media.matches){if(slot.social){const description=main.querySelector(':scope > .repo-description');if(description)description.before(slot.node);else if(slot.marker.isConnected)slot.marker.after(slot.node);}else panel.append(slot.node);}
    else if(slot.marker.isConnected)slot.marker.after(slot.node);
   }
  };
  media.addEventListener('change',update);states.set(row,{media,update,slots,details,destroy});update();
 }
}
export function restoreRepositoryControls(doc=document){for(const [row,state]of states)if(row.ownerDocument===doc)restore(row,state);}
