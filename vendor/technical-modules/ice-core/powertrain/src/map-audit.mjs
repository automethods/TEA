/** Compare to explicitly paired numerical references. Nulls are exclusions, not zero errors. */
import {validateMap,lookup,parseCSV} from './maps.mjs';
export function auditMapCSV(map,text,evidence){
 validateMap(map);if(!evidence||evidence.format!=='map-validation-evidence/1'||!['source-reproduction','independent-holdout'].includes(evidence.role)||!Array.isArray(evidence.trainingGroups)||!Array.isArray(evidence.validationGroups)||!evidence.validationGroups.length||typeof evidence.referenceSource!=='string'||!evidence.referenceSource)throw Error('Потрібне походження еталона, роль і розділені групи.');
 if([...evidence.trainingGroups,...evidence.validationGroups].some(x=>typeof x!=='string'||!x.trim())||new Set(evidence.trainingGroups).size!==evidence.trainingGroups.length||new Set(evidence.validationGroups).size!==evidence.validationGroups.length)throw Error('Некоректні або повторні назви груп.');
 const train=new Set(evidence.trainingGroups),valid=new Set(evidence.validationGroups);if([...train].some(x=>valid.has(x)))throw Error('Навчальні й контрольні групи перетинаються.');
 if(map.provenance?.trainingGroups?.some(x=>valid.has(x))&&evidence.role==='independent-holdout')throw Error('Контрольна група вже використовувалась у навчанні карти.');
 if(evidence.quantity!==map.quantity)throw Error('Одиниці еталона не збігаються з величиною карти.');
 const samples=[],errors=[];for(const row of parseCSV(text)){
  if(!valid.has(row.group))throw Error('Невідома контрольна група '+row.group);
  const numeric=x=>typeof x==='string'&&x.trim()!==''&&Number.isFinite(Number(x))?Number(x):null;
  const rpm=numeric(row.rpm),torqueNm=numeric(row.torque_nm),reference=numeric(row.observed);if(reference!==null&&reference<0)throw Error('Від’ємна витрата/втрати еталона.');if(rpm===null||torqueNm===null)throw Error('Потрібні числові rpm і torque_nm.');
  const predicted=lookup(map,rpm,torqueNm);if(reference===null||!predicted.ok){samples.push({group:row.group,rpm,torqueNm,reference,predicted:null,reason:reference===null?'missing-reference':predicted.reason});continue;}
  const error=predicted.value-reference;errors.push(error);samples.push({group:row.group,rpm,torqueNm,reference,predicted:predicted.value,error});
 }
 const stats=a=>a.length?{count:a.length,bias:a.reduce((s,x)=>s+x,0)/a.length,rmse:Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length),maxAbs:Math.max(...a.map(Math.abs))}:{count:0,bias:null,rmse:null,maxAbs:null};
 return {format:'map-validation-audit/1',mapId:map.id,quantity:map.quantity,evidence,metrics:stats(errors),total:samples.length,excluded:samples.length-errors.length,coverage:samples.length?errors.length/samples.length:null,groups:[...valid].map(group=>({group,...stats(samples.filter(x=>x.group===group&&Number.isFinite(x.error)).map(x=>x.error))})),samples,
  independentStatus:evidence.role==='independent-holdout'?'Declared by supplied evidence; source authenticity/independence needs review':'Source-map reproduction only; not independent validation'};
}
