import {syntaxSegments} from '../integrations/link-preview/graphic.mjs';
import {slackFixture} from './slack-fixtures.mjs';
import {bindDisclosure} from '../src/list-options.mjs';
import {icon} from './repository-shell.mjs';
const element=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
const svgButton=(label,glyph)=>{const b=element('button','wo-icon-button');b.type='button';b.setAttribute('aria-label',label);b.innerHTML=icon(glyph,16);return b;};
export function renderSlackCard(options={}){
 const {model,entity}=slackFixture(options),payload=entity.entity_payload;
 const root=element('section','wo-demo');root.dataset.surface=options.surface||'light';root.dataset.density=model.density;root.dataset.visuals='auto';root.dataset.format='native';root.style.maxWidth=(options.width||560)+'px';
 const note=element('p','wo-note','Interactive model of the production Slack payload · synthetic data');root.append(note);
 const message=element('div','wo-message');message.append(element('strong','','Alex'),element('time','','10:22 AM'));root.append(message);
 const inline=element('a','wo-inline',model.reference);inline.href=model.url;const small=element('img');small.src=model.icon;small.alt='';inline.prepend(small);root.append(inline);
 const card=element('article','wo-card');card.setAttribute('aria-label',model.reference+' preview');
 const header=element('header','wo-card-header'),img=element('img','wo-product-icon');img.src=model.icon;img.alt='';
 const heading=element('div','wo-heading'),title=element('a','wo-title',payload.attributes.title.text);title.href=model.url;heading.append(title,element('p','wo-subtitle',payload.attributes.display_type+' '+model.reference+' in Forgejo'));
 header.append(img,heading);card.append(header);
 const contents=element('div','wo-content');
 if(options.state){
  const variants={connect:['Connect Forgejo','Use your account to preview this protected link. Public repositories do not require a personal connection.'],denied:['Access unavailable','The linked account cannot access this resource. Open the source to request access.'],loading:['Loading preview…','Checking the latest source data.'],expired:['Preview needs refresh','Refresh the card to obtain current details.']};
  const [label,description]=variants[options.state];contents.append(element('strong','wo-state-label',label),element('p','wo-state-description',description));
 }else{
  const fields=new Map(Object.entries(payload.fields||{}).map(([key,value])=>[key,{key,label:({description:'Summary',created_by:'Author',status:'Status',file_size:'Size'})[key]||key,...value}]));
  for(const field of payload.custom_fields||[])fields.set(field.key,field);
  const grid=element('div','wo-fields');
  for(const key of payload.display_order){const field=fields.get(key);if(!field)continue;
   const cell=element('div','wo-field');if(field.long)cell.classList.add('wo-wide');cell.dataset.key=key;
   cell.append(element('div','wo-field-label',field.label));
   const value=field.type==='slack#/types/user'?field.user.text:field.value;
   if(key==='code_excerpt'){
    const pre=element('pre','wo-code');pre.dataset.language=model.codeLanguage;
    for(const source of model.code){const row=element('span','wo-code-line');for(const token of syntaxSegments(source)){const span=element('span','',token.text);span.dataset.tone=token.tone;row.append(span);}pre.append(row);}
    cell.append(pre);grid.append(cell);continue;
   }

   if(field.type==='slack#/types/image'){const image=element('img','wo-additional-chart');image.src=field.image_url;image.alt=field.alt_text;cell.classList.add('wo-wide');cell.append(image);grid.append(cell);continue;}
   const text=element(field.link?'a':'div','wo-field-value',value);if(field.link)text.href=field.link;if(field.tag_color){text.classList.add('wo-tag');text.dataset.color=field.tag_color;}
   cell.append(text);grid.append(cell);
  }
  contents.append(grid);
  if(model.limited)contents.append(element('p','wo-privacy','Use … → Connect my account to see the details available to you.'));
 }
 card.append(contents);
 const footer=element('footer','wo-card-footer'),status=element('span','wo-timestamp','As of 10:00 AM');footer.append(status);
 const refresh=svgButton('Refresh preview','sync');refresh.onclick=()=>{status.textContent='Just refreshed';announce('Preview refreshed from the synthetic source.');};footer.append(refresh);
 const action=(item)=>{const el=element(item.url?'a':'button','wo-action',item.text);if(item.url)el.href=item.url;else el.type='button';el.dataset.actionId=item.action_id;if(item.action_id==='forgejo_settings')el.onclick=()=>openSettings(el);if(item.action_id==='forgejo_account')el.onclick=()=>openAccount(el);if(item.action_id==='forgejo_personal')el.onclick=()=>{root.replaceWith(renderSlackCard({...options,personal:true,account:false,actionsOpen:false}));};return el;};
 const primary=element('div','wo-primary');for(const item of payload.actions.primary_actions)primary.append(action(item));
 const more=element('details','wo-more'),summary=element('summary','wo-icon-button');summary.setAttribute('aria-label','More actions');summary.innerHTML=icon('kebab-horizontal',16);
 const menu=element('div','wo-menu');menu.setAttribute('role','group');menu.setAttribute('aria-label','More actions');
 for(const item of payload.actions.overflow_actions)menu.append(action(item));
 const copy=element('button','wo-action','Copy link');copy.type='button';copy.onclick=async()=>{try{await navigator.clipboard.writeText(model.url);announce('Link copied.');}catch{announce('Link: '+model.url);}more.open=false;summary.focus();};menu.append(copy);
 more.append(summary,menu);bindDisclosure(more);primary.append(more);footer.append(primary);card.append(footer);root.append(card);
 const live=element('p','wo-result');live.setAttribute('role','status');root.append(live);
 function announce(text){live.textContent=text;}
 root.addEventListener('click',event=>{const anchor=event.target.closest('a');if(anchor&&root.contains(anchor)){event.preventDefault();announce('Opens directly: '+anchor.href);}});
 function openAccount(trigger){
  more.open=false;const dialog=element('dialog','wo-settings');dialog.setAttribute('aria-label','My Forgejo account');
  dialog.append(element('h2','','My Forgejo account'),element('p','',options.connected?'Your own Forgejo account is connected.':'Connect your own Forgejo account to view the details available to you.'),element('p','','Your permissions are checked for each personal view. Private details are not posted to the channel.'));
  const connect=element('button','wo-action',options.connected?'Reconnect my account':'Connect my account');connect.onclick=()=>announce('Starts browser sign-in for the clicking person; this fixture never issues real credentials.');
  const close=element('button','wo-action','Close');close.onclick=()=>dialog.close();dialog.append(connect,close);root.append(dialog);
  dialog.addEventListener('close',()=>{trigger?.focus();dialog.remove();});dialog.showModal();
 }
 function openSettings(trigger){
  more.open=false;let dialog=root.querySelector('dialog');if(dialog)dialog.remove();dialog=element('dialog','wo-settings');dialog.setAttribute('aria-label','Preview settings');
  const form=element('form');form.method='dialog';form.append(element('h2','','Preview settings'),element('p','','Preferences apply to links you share next.'));
  for(const [name,label,choices] of [['density','Information density',[['compact','Compact'],['detailed','Detailed']]],['visuals','Supplemental charts',[['auto','When they add information'],['off','Text only']]],['format','Slack presentation',[['native','Work Objects'],['blocks','Block Kit']]]]){
   const field=element('label','wo-setting-field',label),select=element('select');select.name=name;select.setAttribute('aria-label',label);
   for(const [value,text]of choices){const opt=element('option','',text);opt.value=value;select.append(opt);}select.value=root.dataset[name]||choices[0][0];field.append(select);form.append(field);
  }
  const controls=element('div','wo-setting-buttons'),cancel=element('button','','Cancel'),save=element('button','wo-save','Save');cancel.value='cancel';save.value='save';controls.append(cancel,save);form.append(controls);dialog.append(form);root.append(dialog);
  dialog.addEventListener('close',()=>{if(dialog.returnValue==='save'){for(const select of form.querySelectorAll('select'))root.dataset[select.name]=select.value;announce('Preferences saved for the next shared link.');}trigger?.focus();});dialog.showModal();
 }
 if(options.account)queueMicrotask(()=>openAccount(summary));
 if(options.actionsOpen)more.open=true;if(options.settings)queueMicrotask(()=>openSettings(summary));
 return root;
}
