import {accountLanguage as language} from './account-language.js';
const fields='[data-field],#open-file';
const protectedControls='[data-action]:not([data-action="workspace-design"]):not([data-action="workspace-exercises"]),[data-remove-pilot],[data-remove-parking],a[download],a[href^="docs/"],a[href^="examples/"]';
let user=null,checked=0,pending;
const originalDisabled=new WeakMap(),originalTitles=new WeakMap();
function apply(){
 document.body.dataset.access=user?'member':'readonly';
 for(const node of document.querySelectorAll(fields+','+protectedControls)){
  const isField=node.matches(fields);
  if(!originalDisabled.has(node))originalDisabled.set(node,isField&&node.disabled||false);
  const calculating=document.body.dataset.calculating==='true'&&node.matches('[data-action="report"],[data-action="schemes"],[data-action="save"]');
  const disabled=!user||originalDisabled.get(node)||calculating;
  if('disabled' in node)node.disabled=disabled;
  node.setAttribute('aria-disabled',String(disabled));
  if(!originalTitles.has(node))originalTitles.set(node,node.getAttribute('title'));
  if(!user)node.title=language.t('Увійдіть, щоб змінювати дані та експортувати документи.');
  else if(originalTitles.get(node)===null)node.removeAttribute('title');else node.title=originalTitles.get(node);
  const description=(node.getAttribute('aria-describedby')||'').split(/\s+/).filter(id=>id&&id!=='accessNotice');
  if(!user)description.push('accessNotice');
  if(description.length)node.setAttribute('aria-describedby',description.join(' '));else node.removeAttribute('aria-describedby');
 }
 const notice=document.querySelector('#accessNotice'),link=document.querySelector('[data-account-link]');
 if(notice){notice.lang=language.language;notice.textContent=language.t(user?'Ви увійшли. Редагування та експорт доступні.':'Режим перегляду. Увійдіть, щоб змінювати дані та створювати або завантажувати документи.');}
 if(link){link.textContent=language.t(user?'Обліковий запис':'Увійти');link.href=new URL(user?'/':'/?account=signin',location.pathname.startsWith('/projects/')||location.hostname==='automethods.com'?location.origin:'https://automethods.com').href;}
}
async function refresh(){
 if(pending)return pending;
 const previous=Boolean(user);
 pending=(async()=>{
  try{
   const response=await fetch('/api/session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
   const data=response.ok?await response.json():null;
   user=data?.configured===true&&typeof data.user?.id==='string'&&data.user.id?data.user:null;
  }catch{user=null;}
  finally{checked=Date.now();apply();pending=null;if(previous!==Boolean(user))document.dispatchEvent(new CustomEvent('teaaccesschange',{detail:{member:Boolean(user)}}));}
  return Boolean(user);
 })();
 return pending;
}
export const access={
 get canEdit(){return Boolean(user);},apply,refresh,ready:null,
 protectedAction:node=>node.matches(protectedControls),
 async requireSession(){if(Date.now()-checked>60000)await refresh();return Boolean(user);}
};
document.addEventListener('click',event=>{const link=event.target.closest('a[download],a[href^="docs/"],a[href^="examples/"]');if(link&&!user){event.preventDefault();apply();}},true);
window.addEventListener('focus',()=>{void refresh();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
document.addEventListener('accountlanguagechange',apply);
access.ready=refresh();
apply();
