/** Progressive enhancements only: existing Forgejo links/forms remain authoritative. */
import {themeEnabled,acceptKey,safeHref,navigationAction,normalizeLine} from './core.mjs';
const BOOT=Symbol.for('hypergithub.bootstrap');
if(!window[BOOT]) {window[BOOT]=true;boot();}
function boot() {
  const root=document.documentElement;
  let sequence='',sequenceTimer,queued=false,bodyObserver=null;
  const locale=document.documentElement.lang?.startsWith('ru')?'ru':'en';
  const t=(en,ru)=>locale==='ru'?ru:en;
  let shortcuts=true;
  try {shortcuts=localStorage.getItem('hypergithub.shortcuts')!=='off';}catch{}
  function enabled(){return themeEnabled(root.dataset.theme);}
  function navigate(anchor){if(!anchor||anchor.matches('[aria-disabled="true"],.disabled'))return false;const href=safeHref(anchor.href,location.href);if(!href)return false;location.assign(href);return true;}
  function visible(el){return !!el&&el.getClientRects().length>0&&!el.closest('[hidden]');}
  function nav(action){
    const links=[...document.querySelectorAll('.secondary-nav .overflow-menu-items a.item')];
    const icon=action==='code'?'octicon-code':action==='issues'?'octicon-issue-opened':action==='pulls'?'octicon-git-pull-request':'octicon-play';
    return links.find(a=>a.querySelector(`.${icon}`))??(action==='code'?null:links.find(a=>new URL(a.href).pathname.endsWith('/'+action)));
  }
  function closeMenus(restore=false){
    for(const menu of document.querySelectorAll('details.hgh-clone[open]')){menu.open=false;if(restore)menu.querySelector('summary')?.focus();}
  }
  function makeDialog(id,title){
    let dialog=document.getElementById(id);if(dialog)return dialog;
    dialog=document.createElement('dialog');dialog.id=id;dialog.className='hgh-dialog';
    const h=document.createElement('h2');h.id=id+'-title';h.textContent=title;dialog.setAttribute('aria-labelledby',h.id);
    const close=document.createElement('button');close.type='button';close.className='hgh-close';close.textContent='×';close.setAttribute('aria-label',t('Close','Закрыть'));close.addEventListener('click',()=>dialog.close());
    dialog.append(h,close);document.body.append(dialog);return dialog;
  }
  function help(){
    const d=makeDialog('hgh-help',t('Repository keyboard shortcuts','Горячие клавиши репозитория'));
    if(!d.querySelector('dl')){
      const list=document.createElement('dl');
      for(const [keys,description] of [['g c',t('Code','Код')],['g i',t('Issues','Задачи')],['g p',t('Pull requests','Pull requests')],['g a',t('Actions, when available','Actions, если доступны')],['t',t('Go to file','Перейти к файлу')],['w',t('Switch branch','Переключить ветку')],['b',t('Blame, in a file','Blame, в файле')],['e',t('Edit, when permitted','Редактировать, при наличии прав')],['l',t('Go to line','Перейти к строке')],['?',t('This help','Эта справка')]]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=keys;dd.textContent=description;list.append(dt,dd);}
      const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=shortcuts;
      check.addEventListener('change',()=>{shortcuts=check.checked;try{localStorage.setItem('hypergithub.shortcuts',shortcuts?'on':'off');}catch{}});
      label.append(check,document.createTextNode(t(' Enable single-character shortcuts',' Включить символьные горячие клавиши')));d.append(list,label);
    }
    if(!d.open)d.showModal();
  }
  function goToLine(){
    if(!document.querySelector('[data-line-number]'))return false;
    const d=makeDialog('hgh-line',t('Go to line','Перейти к строке'));
    if(!d.querySelector('form')){
      const form=document.createElement('form'),input=document.createElement('input'),button=document.createElement('button'),message=document.createElement('p');
      input.type='text';input.inputMode='numeric';input.pattern='[1-9][0-9]*';input.required=true;input.setAttribute('aria-label',t('Line number','Номер строки'));button.textContent=t('Go','Перейти');message.setAttribute('role','status');
      form.append(input,button,message);d.append(form);
      form.addEventListener('submit',event=>{event.preventDefault();const n=normalizeLine(input.value),line=n&&document.getElementById('L'+n);if(!line){message.textContent=t('That line does not exist.','Такой строки нет.');return;}d.close();location.hash='L'+n;line.scrollIntoView({block:'center'});});
    }
    if(!d.open)d.showModal();d.querySelector('input').focus();return true;
  }
  function enhance(){
    queued=false;if(!enabled())return;
    // Prevent our own wrapper/help insertions from scheduling a redundant enhancement frame.
    bodyObserver?.disconnect();
    try {
      for(const panel of document.querySelectorAll('.repository .repo-button-row .clone-panel')){
        if(panel.closest('.hgh-clone'))continue;
        const details=document.createElement('details');details.className='hgh-clone';
        const summary=document.createElement('summary');summary.textContent='‹› '+t('Code','Код')+' ▾';
        panel.before(details);details.append(summary,panel);
        details.addEventListener('toggle',()=>{summary.setAttribute('aria-expanded',String(details.open));if(details.open)for(const other of document.querySelectorAll('details.hgh-clone[open]'))if(other!==details)other.open=false;});
      }
      // Accessible help remains available even after character keys are disabled.
      if(!document.querySelector('[data-hgh-help]')){
        const host=document.querySelector('.repository .repo-button-row');
        if(host){const button=document.createElement('button');button.type='button';button.dataset.hghHelp='';button.className='ui basic compact button hgh-help-button';button.textContent='?';button.setAttribute('aria-label',t('Keyboard shortcuts','Горячие клавиши'));button.addEventListener('click',help);host.append(button);}
      }
      root.dataset.hghReady='true';
    } finally {
      if(bodyObserver&&enabled())bodyObserver.observe(document.body,{childList:true,subtree:true});
    }
  }
  function schedule(){if(!queued){queued=true;requestAnimationFrame(enhance);}}
  document.addEventListener('keydown',event=>{
    if(!enabled())return;
    if(event.key==='Escape'){closeMenus(true);return;}
    if(!acceptKey(event))return;
    if([...document.querySelectorAll('dialog[open], [role="dialog"][aria-modal="true"]')].some(visible))return;
    const key=event.key.toLowerCase();
    if(key==='?'){event.preventDefault();help();return;}
    if(!shortcuts)return;
    if(event.shiftKey)return;
    const action=navigationAction(sequence,key);sequence='';clearTimeout(sequenceTimer);
    if(action){if(navigate(nav(action)))event.preventDefault();return;}
    if(key==='g'){sequence='g';sequenceTimer=setTimeout(()=>{sequence='';},1000);return;}
    if(key==='w'){const buttons=[...document.querySelectorAll('.js-branch-tag-selector .branch-dropdown-button')].filter(visible);const focused=buttons.find(b=>b.closest('.js-branch-tag-selector')?.matches(':focus-within'));const button=focused??(buttons.length===1?buttons[0]:null);if(button){event.preventDefault();button.click();}return;}
    if(key==='l'){if(goToLine())event.preventDefault();return;}
    const selectors={t:'.repository .repo-button-row a[href*="/find/"]',b:'.non-diff-file-content a[href*="/blame/"]',e:'.non-diff-file-content a[href*="/_edit/"]'};
    if(selectors[key] && navigate(document.querySelector(selectors[key])))event.preventDefault();
  });
  document.addEventListener('click',event=>{if(enabled()&&!event.target.closest('.hgh-clone'))closeMenus();});
  document.addEventListener('htmx:afterSwap',schedule);
  // Watch child insertion only, not attributes/layout: bounded and frame-coalesced.
  bodyObserver=new MutationObserver(mutations=>{for(const m of mutations)for(const n of m.addedNodes)if(n.nodeType===1){schedule();return;}});
  const syncBodyObserver=()=>{bodyObserver.disconnect();if(enabled())bodyObserver.observe(document.body,{childList:true,subtree:true});};
  syncBodyObserver();
  new MutationObserver(()=>{syncBodyObserver();if(!enabled()){closeMenus();for(const menu of document.querySelectorAll('details.hgh-clone')){const panel=menu.querySelector('.clone-panel');if(panel)menu.before(panel);menu.remove();}for(const d of document.querySelectorAll('.hgh-dialog')){if(d.open)d.close();d.remove();}for(const button of document.querySelectorAll('[data-hgh-help]'))button.remove();delete root.dataset.hghReady;sequence='';clearTimeout(sequenceTimer);}schedule();}).observe(root,{attributes:true,attributeFilter:['data-theme']});
  enhance();
}
