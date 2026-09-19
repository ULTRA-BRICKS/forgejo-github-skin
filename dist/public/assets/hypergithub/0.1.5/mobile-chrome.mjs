/** Reuse server-rendered navigation/account controls; never infer login state or permissions. */
const states=new Map();
function releaseChrome(nav,state){
 state.media.removeEventListener('change',state.update);
 for(const {node,marker} of state.moving){if(marker.isConnected)marker.replaceWith(node);node.classList.remove('hgh-native-toggle','hgh-native-profile');}
 state.context.remove();state.search?.remove();state.footerMark?.remove();
 delete nav.ownerDocument.documentElement.dataset.hghRepositoryChrome;delete nav.ownerDocument.documentElement.dataset.hghMobileChrome;
 states.delete(nav);
}
function stripIds(node){node.removeAttribute('id');node.removeAttribute('aria-labelledby');for(const el of node.querySelectorAll('[id]'))el.removeAttribute('id');return node;}
export function enhanceNativeChrome(doc=document){
 for(const [nav,state] of states)if(nav.ownerDocument===doc&&(!nav.isConnected||(state.footerMark&&!state.footerMark.isConnected)))releaseChrome(nav,state);
 const ru=doc.documentElement.lang.startsWith('ru');
 const nav=doc.querySelector('#navbar'),left=nav?.querySelector('.navbar-left'),logo=nav?.querySelector('#navbar-logo');
 const repository=doc.querySelector('.repo-header .flex-item-title a:last-of-type');
 if(!nav||!left||!logo)return;
 if(!repository){restoreNativeChrome(doc);return;}
 const prior=states.get(nav);
 if(prior){if(prior.context.textContent!==repository.textContent.trim())prior.context.textContent=repository.textContent.trim();prior.context.href=repository.href;return;}
 const footer=doc.querySelector('body > footer.page-footer')||doc.querySelector('body > footer');
 const footerMark=footer?logo.cloneNode(true):null;
 if(footerMark){footerMark.removeAttribute('id');footerMark.className='hgh-footer-brand';footerMark.setAttribute('aria-label',ru?'Главная Forgejo':'Forgejo home');for(const el of footerMark.querySelectorAll('[id]'))el.removeAttribute('id');const image=footerMark.querySelector('img');if(image){image.width=20;image.height=20;}footer.append(footerMark);}
 if(footerMark)doc.documentElement.dataset.hghRepositoryChrome='true';
 const context=doc.createElement('a');context.className='hgh-native-context';context.textContent=repository.textContent.trim();context.href=repository.href;context.title=doc.querySelector('.repo-header .flex-item-title')?.textContent.trim()||context.textContent;context.setAttribute('aria-label',(ru?'Репозиторий: ':'Repository: ')+context.title);
 const toggle=nav.querySelector('#navbar-expand-toggle');
 const profile=[...nav.querySelectorAll('.navbar-right>details')].find(el=>el.querySelector('summary img.avatar'));
 const moving=[toggle,profile].filter(Boolean).map(node=>{const marker=doc.createComment('hgh-navbar-position');node.before(marker);return {node,marker};});
 const explore=nav.querySelector('a[href$="/explore/repos"]');const search=explore?doc.createElement('a'):null;
 if(search){search.href=explore.href;search.className='hgh-control hgh-icon-control hgh-native-search';search.setAttribute('aria-label',ru?'Поиск репозиториев':'Search repositories');const icon=doc.querySelector('svg.octicon-search');if(icon)search.append(stripIds(icon.cloneNode(true)));else search.textContent='⌕';}
 const media=doc.defaultView.matchMedia('(max-width:767px)');
 const update=()=>{
  if(!nav.isConnected){const state=states.get(nav);if(state)releaseChrome(nav,state);return;}
  if(media.matches){
   if(toggle){logo.before(toggle);toggle.classList.add('hgh-native-toggle');}
   logo.after(context);if(search)context.after(search);
   if(profile){left.append(profile);profile.classList.add('hgh-native-profile');}
   doc.documentElement.dataset.hghMobileChrome='true';
  }else{
   for(const {node,marker} of moving){if(marker.isConnected)marker.after(node);node.classList.remove('hgh-native-toggle','hgh-native-profile');}
   context.remove();search?.remove();delete doc.documentElement.dataset.hghMobileChrome;
  }
 };
 media.addEventListener('change',update);states.set(nav,{moving,media,update,context,search,footerMark});update();
}
export function restoreNativeChrome(doc=document){
 for(const [nav,state] of states)if(nav.ownerDocument===doc)releaseChrome(nav,state);
}
