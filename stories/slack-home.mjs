import {homeView} from '../integrations/link-preview/slack-home.mjs';
import {settingsView} from '../integrations/link-preview/slack-settings.mjs';
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
/** Renders the exact production Home and settings payload with local synthetic state. */
export function renderSlackHome({connected=true,connectionError=false,surface='light',settings=false}={}){
 const root=el('section','wo-demo wo-home');root.dataset.surface=surface;root.style.maxWidth='760px';
 const state={density:'compact',visuals:'auto',format:'native'},source={origin:'https://forge.example',connected,connectionError,connectUrl:'https://links.example/connect/synthetic'};
 const live=el('p','wo-result');live.setAttribute('role','status');
 function render(){
  root.replaceChildren(el('p','wo-note','App Home model · production Block Kit payload · synthetic connection'),live);
  const view=homeView(state,source);
  for(const block of view.blocks){
   if(block.type==='header')root.append(el('h1','',block.text.text));
   if(block.type==='divider')root.append(el('hr'));
   if(block.type==='section'&&block.text)root.append(el('p','wo-home-description',block.text.text));
   if(block.type==='section'&&block.fields){const grid=el('div','wo-home-fields');for(const f of block.fields){const cell=el('div'),parts=f.text.split('\n');cell.append(el('div','wo-field-label',parts[0]),el('div','wo-field-value',parts.slice(1).join('\n')));grid.append(cell);}root.append(grid);}
   if(block.type==='context')root.append(el('p','wo-note',block.elements.map(e=>e.text).join(' ')));
   if(block.type==='actions'){const row=el('div','wo-home-actions');for(const action of block.elements){const b=el('button',action.style==='primary'?'wo-home-primary':'wo-action',action.text.text);b.type='button';b.dataset.actionId=action.action_id;b.onclick=()=>{if(action.action_id==='forgejo_home_settings')openSettings(b);else if(action.action_id==='forgejo_home_refresh'){render();live.textContent='Connection status refreshed from the synthetic source.';}else live.textContent='Opens directly: '+action.url;};row.append(b);}root.append(row);}
  }
 }
 function openSettings(trigger){
  const dialog=el('dialog','wo-settings');dialog.setAttribute('aria-label','Preview settings');const form=el('form');form.method='dialog';
  const view=settingsView('fixture',state,{url:source.origin,connect:null});form.append(el('h2','',view.title.text));
  for(const block of view.blocks.filter(b=>b.type==='input')){const label=el('label','wo-setting-field',block.label.text),select=el('select');select.name=block.element.action_id;select.setAttribute('aria-label',block.label.text);for(const item of block.element.options){const option=el('option','',item.text.text);option.value=item.value;select.append(option);}select.value=block.element.initial_option.value;label.append(select);form.append(label);}
  const buttons=el('div','wo-setting-buttons');for(const value of ['cancel','save']){const b=el('button',value==='save'?'wo-save':'',value==='save'?'Save':'Cancel');b.value=value;buttons.append(b);}form.append(buttons);dialog.append(form);root.append(dialog);
  dialog.addEventListener('close',()=>{if(dialog.returnValue==='save'){for(const select of form.querySelectorAll('select'))state[select.name]=select.value;render();live.textContent='Your settings were saved.';root.querySelector('[data-action-id=forgejo_home_settings]').focus();}else trigger.focus();dialog.remove();});dialog.showModal();
 }
 render();if(settings)queueMicrotask(()=>openSettings(root.querySelector('[data-action-id=forgejo_home_settings]')));return root;
}
