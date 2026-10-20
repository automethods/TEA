import {translate,setLanguage,localize} from './locale.js';
// Shared AutoMethods language preference; translation is applied only to presentation.
const storageKey='motion-lab-language';
let language;
try{language=localStorage.getItem(storageKey);}catch{}
if(!['uk','en'].includes(language))language=(navigator.languages||[navigator.language]).map(value=>value.split('-')[0]).find(value=>['uk','en'].includes(value))||'en';
setLanguage(language);
const labels={
 'Увійти':'Sign in',
 'Обліковий запис':'Account',
 'Режим перегляду. Увійдіть, щоб змінювати дані та створювати або завантажувати документи.':'View mode. Sign in to change values and create or download documents.',
 'Ви увійшли. Редагування та експорт доступні.':'Signed in. Editing and exports are available.',
 'Увійдіть, щоб змінювати дані та експортувати документи.':'Sign in to change values and export documents.',
 'Навчальний приклад — режим перегляду':'Example calculation — view mode',
 'Оновлюємо розрахунок…':'Updating calculation…',
 'Варіант збережено локально у браузері':'Project saved locally in this browser',
 'Завдання і режим':'Task and design mode',
 'Вихідні дані':'Input data',
 'Виробнича програма':'Production programme',
 'Пости і працівники':'Work bays and staff',
 'Оснащення':'Equipment',
 'План корпусу і поста':'Building and bay layout',
 'Витрати і результат':'Costs and result',
 'Список джерел':'References',
 'Звіт A4 · креслення A1':'A4 report · A1 drawings',
 'Окремі навчальні вправи →':'Separate learning exercises →',
 '← Проєкт станції':'← Workshop design',
 'Проєкт і вихідні дані':'Project and inputs',
 'Класи та профіль СТО':'Vehicle classes and workshop profile',
 'Усі вихідні дані':'All input data',
 'Розрахунок СТО':'Workshop calculation',
 'Розрахунок ресурсів СТО':'Workshop resources',
 'Контрольний кейс: розклад':'Reference case: schedule',
 'Очікування на посту':'Waiting in a bay',
 'Практичні модулі':'Practical modules',
 'Діагностування ABS':'ABS diagnostics',
 'Річна програма':'Annual programme',
 'Геометрія коліс і ADAS':'Wheel alignment and ADAS',
 'Пілот СТО та стоянка':'Workshop pilot and parking',
 'Оснащення та висновок':'Equipment and conclusions',
 'Додатки':'Appendices',
 'Звіт і аркуш схем':'Report and diagrams'
};
const originalText=new WeakMap();
export const accountLanguage={
 get language(){return language;},
 t(text){return language==='en'?(labels[text]||translate(text)):text;},
 apply(){
  document.documentElement.lang=language;
  document.documentElement.dataset.accountLanguage=language;
  for(const node of document.querySelectorAll('button[data-language]'))node.setAttribute('aria-pressed',String(node.dataset.language===language));
  const notice=document.querySelector('#languageNotice');
  if(notice)notice.hidden=true;
  const walker=document.createTreeWalker(document.querySelector('.sidebar nav'),NodeFilter.SHOW_TEXT);
  for(let node=walker.nextNode();node;node=walker.nextNode()){
   if(!originalText.has(node))originalText.set(node,node.textContent);
   node.textContent=this.t(originalText.get(node));
  }
  localize();
  document.querySelector('.sidebar nav').lang=language;
  document.querySelector('.account-controls').lang=language;
 },
 setLanguage(value){
  if(!['uk','en'].includes(value))return;
  language=value;setLanguage(value);
  try{localStorage.setItem(storageKey,value);localStorage.removeItem('motion-lab-language-auto');}catch{}
  this.apply();document.dispatchEvent(new CustomEvent('accountlanguagechange'));
 }
};
document.addEventListener('click',event=>{const choice=event.target.closest('button[data-language]');if(choice)accountLanguage.setLanguage(choice.dataset.language);});
accountLanguage.apply();
