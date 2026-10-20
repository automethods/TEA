import {access} from './access.js';
import {accountLanguage} from './account-language.js';
import {timeToInterval} from './calendar.js';
import {STATION_NAV} from './station-view.js';
import {VEHICLE_MODELS} from './station-data.js';
import {initialState,validateState,VERSION} from './state.js';
import {renderPages} from './views.js';
import {printDocument} from './print.js';
import {esc} from './format.js';
import {setVehicleChoice,setWorkshopChoice,restoreVehicleDefaults,balanceVehicleMix,repairVehicleMix} from './presets.js';

const key=`tea-project-${VERSION}`,content=document.querySelector('#content'),status=document.querySelector('#save-status');
const exerciseNav=document.querySelector('.sidebar nav').innerHTML;
let state,model,data,diagnostic,extras,sources,pending=false,requestId=0,worker,profileUndo,logoViewport,accountRestored=false;
const toast=message=>{const el=document.querySelector('#toast');el.textContent=accountLanguage.t(message);el.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.hidden=true,4500);};
function persist(){if(!access.canEdit){status.textContent=accountLanguage.t('Навчальний приклад — режим перегляду');return;}try{localStorage.setItem(key,JSON.stringify(state));status.textContent=accountLanguage.t('Варіант збережено локально у браузері');}catch{status.textContent=accountLanguage.t('Автозбереження недоступне — збережіть проєкт у файл');}}
function render(){
 const focused=document.activeElement?.dataset?.field,scrollY=window.scrollY;
 document.querySelector('.sidebar nav').innerHTML=state.design.workspace==='design'?STATION_NAV.map(([id,n,t])=>`<a href="#${id}"><b>${n}</b>${t}</a>`).join('')+'<a class="workspace-link" href="#intro" data-action="workspace-exercises">Окремі навчальні вправи →</a>':exerciseNav+'<a class="workspace-link" href="#intro" data-action="workspace-design">← Проєкт станції</a>';
 content.innerHTML=renderPages(data,diagnostic,state,model,sources);
 const logoPlaceholder=content.querySelector('.station-logo-viewer');
 if(logoPlaceholder){
  // Reuse the canvas and camera when calculation results rebuild the page.
  if(logoViewport)logoPlaceholder.replaceWith(logoViewport);
  else{
   logoViewport=logoPlaceholder;
   import('./logo-viewer.js').then(({startLogoViewer})=>startLogoViewer(logoViewport)).catch(error=>{
    logoViewport.setAttribute('aria-busy','false');
    logoViewport.querySelector('[role="status"]').textContent=accountLanguage.t('3D емблема недоступна.');
    console.error('Logo viewer:',error);
   });
  }
 }
 accountLanguage.apply();access.apply();
 if(focused){const el=[...content.querySelectorAll('[data-field]')].find(x=>x.dataset.field===focused);el?.focus({preventScroll:true});}
 window.scrollTo({top:scrollY,behavior:'instant'});
 document.querySelectorAll('.sidebar nav a').forEach(a=>a.classList.toggle('active',!a.dataset.action&&a.hash===(location.hash||'#intro')));
}
function calculate(){pending=true;document.body.dataset.calculating='true';status.textContent=accountLanguage.t('Оновлюємо розрахунок…');for(const b of document.querySelectorAll('[data-action="report"],[data-action="schemes"],[data-action="save"]'))b.disabled=true;worker.postMessage({id:++requestId,state});}
function cloneActive(){
 if(state.scenario!=='manual')state.assignments=structuredClone(data.reference_schedules[state.scenario].assignments);
 state.scenario='manual';
}
function setField(path,value){
 const parts=path.split('.');
 if(path==='vehiclePreset'){profileUndo=structuredClone(state);setVehicleChoice(state,value);return;}
 if(path==='workshopPreset'){profileUndo=structuredClone(state);setWorkshopChoice(state,value,data);return;}
 if(path==='diagnosticClass'){state.diagnosticClass=value;state.abs.radius=state.classData[value].radius;return;}
 if(path.startsWith('design.equipmentOverrides.')){const eq=model.station.equipment.find(e=>e.key===parts[2]);state.design.equipmentOverrides[parts[2]]??={x:eq.x,y:eq.y};}
 if(path.startsWith('design.bayOverrides.')){const bay=model.station.layout.bays.find(b=>b.id===parts[2]);state.design.bayOverrides[parts[2]]??={x:bay.x,y:bay.y,rotation:bay.rotation};}
 if(parts[0]==='vehicleMix'){balanceVehicleMix(state,parts[1],value);return;}
 if(parts[0]==='assignment'){cloneActive();state.assignments.find(a=>a.operation_id===parts[1])[parts[2]]=value;}
 else if(parts[0]==='op'){state.operationEdits[parts[1]]??={};state.operationEdits[parts[1]][parts[2]]=value;}
 else if(parts[0]==='months'){state.months[Number(parts[1])].counts[parts[2]]=value;}
 else {let target=state;for(const p of parts.slice(0,-1))target=target[p];target[parts.at(-1)]=value;}
}
function download(text,name){const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
async function handleChange(e){
 const el=e.target,path=el.dataset.field;if(!path)return;
 if(!await access.requireSession()){render();return;}
 let value=el.type==='checkbox'?el.checked:el.value;
 if(el.type==='number')value=el.value.trim()===''?null:Number(el.value);
 if(['day','design.selectedBay'].includes(path)||path.endsWith('.rotation'))value=Number(value);
 if(path.endsWith('.accepted'))value=value==='true';
 try{if(path==='partsReady'||path.startsWith('assignment.')&&path.endsWith('.start_slot'))value=timeToInterval(value);if(path.startsWith('op.')&&path.endsWith('.duration')&&value!==null)value=value*2;setField(path,value);}catch(error){toast(error.message);render();return;}
 if(path==='day'||path==='selectedOrder'){persist();render();return;}
 if(['student','group','variant'].includes(path)||(path.startsWith('notes.')||path==='design.notes')){persist();return;}
 calculate();
}
content.addEventListener('change',handleChange);
// Keep prose immediately, without rebuilding the focused input or recalculating.
content.addEventListener('input',e=>{if(!access.canEdit)return;const path=e.target.dataset.field;if(path&&(['student','group','variant'].includes(path)||(path.startsWith('notes.')||path==='design.notes'))){setField(path,e.target.value);persist();}});
document.addEventListener('click',async e=>{
 const control=e.target.closest('[data-action],[data-remove-pilot],[data-remove-parking]');
 if(control&&access.protectedAction(control)){e.preventDefault();if(!await access.requireSession()){access.apply();return;}}
 const order=e.target.closest('[data-order]');if(order){state.selectedOrder=order.dataset.order;persist();render();document.querySelector('#schedule').scrollIntoView();return;}
 const removePilot=e.target.closest('[data-remove-pilot]');
 if(removePilot){const index=Number(removePilot.dataset.removePilot),id=state.pilot[index].id;state.pilot.splice(index,1);state.parking=state.parking.filter(p=>p.orderId!==id);calculate();return;}
 const removeParking=e.target.closest('[data-remove-parking]');if(removeParking){state.parking.splice(Number(removeParking.dataset.removeParking),1);calculate();return;}
 const action=e.target.closest('[data-action]')?.dataset.action;if(!action)return;
 if(action==='workspace-design'||action==='workspace-exercises'){e.preventDefault();state.design.workspace=action==='workspace-design'?'design':'exercises';persist();render();location.hash='#intro';return;}
 if(action==='restore-station-vehicles'){profileUndo=structuredClone(state);restoreVehicleDefaults(state);state.design.vehicles=structuredClone(VEHICLE_MODELS);calculate();}
 if(action==='reset-layout'){state.design.bayOverrides={};state.design.equipmentOverrides={};calculate();}
 if(action==='restore-classes'){profileUndo=structuredClone(state);restoreVehicleDefaults(state);calculate();}
 if(action==='restore-mix'){profileUndo=structuredClone(state);setVehicleChoice(state,state.vehiclePreset);calculate();}
 if(action==='restore-workshop'){profileUndo=structuredClone(state);setWorkshopChoice(state,state.workshopPreset,data);calculate();}
 if(action==='undo-profile'){if(!profileUndo)return toast('Немає попередньої зміни набору.');state=profileUndo;profileUndo=null;calculate();}
 if(action==='save'){if(pending)return toast('Зачекайте завершення розрахунку.');download(JSON.stringify({format:'tea-project-file/2',savedAt:new Date().toISOString(),state,engineering:{technicalModules:model.technicalModules,modules:model.modules.map(m=>({document:m.document,evidence:m.evidence,annotations:m.annotations})),sources}},null,2),`TEA-${state.scenario}-${new Date().toISOString().slice(0,10)}.json`);toast('Проєкт підготовлено для завантаження.');}
 if(action==='open')document.querySelector('#open-file').click();
 if(action==='reset'){if(!confirm(accountLanguage.t('Почати новий приклад? Поточний варіант буде замінено. Спочатку збережіть його у файл.')))return;state=initialState(data,extras);profileUndo=null;calculate();}
 if(action==='report'||action==='schemes'){if(pending)return toast('Зачекайте завершення розрахунку.');printDocument(action,data,diagnostic,state,model,sources);}
 if(action==='add-pilot'){if(state.pilot.length>=20)return toast('У цьому випуску доступно до 20 звернень.');let i=state.pilot.length+1;while(state.pilot.some(r=>r.id==='RQ'+String(i).padStart(2,'0')))i++;state.pilot.push({id:'RQ'+String(i).padStart(2,'0'),accepted:true,reason:'',arrival:'',due:'',start:'',ready:'',issued:'',labour:null,bay:null,wait:null,note:''});calculate();}
 if(action==='add-parking'){if(state.parking.length>=40)return toast('У цьому випуску доступно до 40 інтервалів.');state.parking.push({orderId:state.pilot[0]?.id??'',start:'',end:'',reason:''});calculate();}
});
document.querySelector('#open-file').addEventListener('change',async e=>{
 const file=e.target.files[0];e.target.value='';if(!file||!await access.requireSession())return;
 try{
  if(file.size>8_000_000)throw new Error('Файл перевищує 8 MB.');
  const record=JSON.parse(await file.text());if(!['tea-project-file/1','tea-project-file/2'].includes(record.format))throw new Error('Це не файл проєкту TEA.');
  const candidate=validateState(record.state,data);
  if(repairVehicleMix(candidate))toast('Частки відкритого проєкту скориговано до 100%; перевірте таблицю 2.1.');
  // Evaluated evidence in the saved file is never trusted as current results.
  const old=state;state=structuredClone(candidate);worker.importRollback=old;calculate();
 }catch(err){toast('Проєкт не відкрито: '+err.message);}
});
window.addEventListener('hashchange',()=>{document.querySelectorAll('.sidebar nav a').forEach(a=>a.classList.toggle('active',!a.dataset.action&&a.hash===location.hash));});
function restoreSavedProject(){
 try{const saved=localStorage.getItem(key)||localStorage.getItem('tea-project-0.5.1')||localStorage.getItem('tea-project-0.4.0')||localStorage.getItem('tea-project-0.3.2')||localStorage.getItem('tea-project-0.3.1')||localStorage.getItem('tea-project-0.3.0')||localStorage.getItem('tea-project-0.2.1')||localStorage.getItem('tea-project-0.2.0')||localStorage.getItem('tea-project-0.1.0');if(saved)state=validateState(JSON.parse(saved),data);}catch{toast('Автозбереження не прочитано; відкрито початковий приклад.');}
 accountRestored=true;
}
document.addEventListener('teaaccesschange',()=>{if(!model)return;if(access.canEdit&&!accountRestored){restoreSavedProject();repairVehicleMix(state);calculate();}else{render();status.textContent=accountLanguage.t(access.canEdit?'Варіант збережено локально у браузері':'Навчальний приклад — режим перегляду');}});
document.addEventListener('accountlanguagechange',()=>{if(model){render();persist();}});
async function start(){
 await access.ready;
 const load=async name=>{const r=await fetch('data/'+name+'.json');if(!r.ok)throw new Error('Не завантажено '+name);return r.json();};
 [data,diagnostic,extras,sources]=await Promise.all([load('case_data'),load('diagnostic_module'),load('extras-v1.2'),load('sources')]);sources=sources.sources;

 state=initialState(data,extras);
 if(access.canEdit)restoreSavedProject();
 if(repairVehicleMix(state))toast('Частки збереженого варіанта скориговано до 100%; перевірте таблицю 2.1.');
 worker=new Worker(new URL('./model-worker.js',import.meta.url),{type:'module'});
 worker.onerror=e=>{pending=false;document.body.dataset.calculating='false';access.apply();document.querySelector('#fatal').innerHTML=`<p class="error">Не вдалося запустити розрахунок. Перезавантажте сторінку через адресу, надруковану bash run.sh.</p>`;console.error(e);};
 worker.onmessage=({data:r})=>{
  if(r.id!==requestId)return;
  pending=false;document.body.dataset.calculating='false';
  if(r.error){if(worker.importRollback){state=worker.importRollback;worker.importRollback=null;toast('Імпорт відхилено: '+r.error);calculate();return;}document.querySelector('#fatal').innerHTML=`<p class="error">${esc(accountLanguage.t(r.error))}</p>`;status.textContent=accountLanguage.t('Розрахунок не завершено');return;}
  model=r.model;document.querySelector('#fatal').textContent='';render();persist();if(worker.importRollback){worker.importRollback=null;toast('Проєкт відкрито й перераховано.');}
 };
 worker.postMessage({type:'init',data,diagnostic});calculate();
}
start().catch(e=>{document.querySelector('#fatal').innerHTML=`<p class="error">${esc(accountLanguage.t(e.message))}. Запустіть повну папку командою bash run.sh.</p>`;});
