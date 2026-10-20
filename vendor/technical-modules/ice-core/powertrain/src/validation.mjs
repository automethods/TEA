/** Canonical data adapters. They do not execute MATLAB, infer units, or manufacture EPA measurements. */
import {parseCSV,validateMap} from './maps.mjs';
const required=(v,label)=>{if(typeof v!=='string'||!v.trim())throw Error('Потрібне поле '+label);return v;};
export function mapFromLongCSV(text,meta){
 if(!meta||typeof meta!=='object')throw Error('Потрібні метадані карти.');
 for(const k of ['id','source','componentId','conditions'])required(meta[k],k);
 if(meta.inputUnits?.rpm!=='1/min'||meta.inputUnits?.torque!=='N*m'||meta.inputUnits?.value!==(meta.quantity==='loss_w'?'W':'g/s'))throw Error('Явно задайте 1/min, N*m та W або g/s. Автоматична конвертація не виконується.');
 const rows=parseCSV(text),rpm=[],torque=[],points=new Map();
 for(const r of rows){
  if(!r.rpm?.trim()||!r.torque_nm?.trim()||!Object.hasOwn(r,'value'))throw Error('Потрібні колонки rpm,torque_nm,value.');
  const n=Number(r.rpm),t=Number(r.torque_nm),v=r.value===''?null:Number(r.value);
  if(!Number.isFinite(n)||!Number.isFinite(t)||v!==null&&!Number.isFinite(v))throw Error('Некоректне число CSV.');
  const key=JSON.stringify([n,t]);if(points.has(key))throw Error('Дублікат координат карти.');points.set(key,v);rpm.push(n);torque.push(t);
 }
 const ns=[...new Set(rpm)].sort((a,b)=>a-b),ts=[...new Set(torque)].sort((a,b)=>a-b);
 return validateMap({...meta,format:'powertrain-grid/1',rpm:ns,torqueNm:ts,values:ns.map(n=>ts.map(t=>points.get(JSON.stringify([n,t]))??null)),
  conversion:{kind:'explicit-long-CSV-to-grid',missingCells:'null',extrapolation:'rejected',sourceRows:rows.length}});
}
export function compareTrips(rows,meta){
 if(!meta||meta.format!=='powertrain-trip-comparison/1')throw Error('Потрібні метадані powertrain-trip-comparison/1.');
 required(meta.source,'source');required(meta.fuelReference,'fuelReference');required(meta.batteryReference,'batteryReference');
 if(!['discharge-positive','charge-positive'].includes(meta.currentSign))throw Error('Невідомий знак струму.');
 if(!Array.isArray(meta.validationTrips)||!meta.validationTrips.length||!Array.isArray(meta.trainingTrips))throw Error('Явно задайте навчальні та контрольні поїздки.');
 if([...meta.validationTrips,...meta.trainingTrips].some(x=>typeof x!=='string'||!x.trim())||new Set(meta.validationTrips).size!==meta.validationTrips.length||new Set(meta.trainingTrips).size!==meta.trainingTrips.length)throw Error('Ідентифікатори поїздок мають бути непорожніми та унікальними.');
 if(meta.validationTrips.some(x=>meta.trainingTrips.includes(x)))throw Error('Перетин навчальних і контрольних поїздок.');
 const maxGap=meta.maxGapS;if(!(maxGap>0&&maxGap<=60))throw Error('Потрібний maxGapS у межах 0–60 с.');
 const selected=new Set(meta.validationTrips),trips=new Map(),sign=meta.currentSign==='discharge-positive'?1:-1;
 for(const row of rows){
  if(!selected.has(row.trip_id))continue;
  const r={trip:row.trip_id};
  for(const key of ['time_s','reference_fuel_g_s','model_fuel_g_s','voltage_v','current_a','model_battery_w','soc','model_soc']){
   if(row[key]===undefined||row[key]===null||String(row[key]).trim()==='')throw Error('Неповний контрольний рядок: '+key);
   r[key]=Number(row[key]);if(!Number.isFinite(r[key]))throw Error('Нескінченне або нечислове поле '+key);
  }
  if(r.time_s<0||r.reference_fuel_g_s<0||r.model_fuel_g_s<0||r.voltage_v<=0||r.soc<0||r.soc>1||r.model_soc<0||r.model_soc>1)throw Error('Контрольні одиниці/межі: час ≥0, паливо ≥0, напруга >0, SOC 0–1.');
  r.referenceW=r.voltage_v*r.current_a*sign;
  const a=trips.get(r.trip)??[];if(a.length&&r.time_s<=a.at(-1).time_s)throw Error('Час у межах поїздки повинен зростати без дублікатів.');a.push(r);trips.set(r.trip,a);
 }
 const missing=meta.validationTrips.filter(x=>!trips.has(x));if(missing.length)throw Error('Відсутні контрольні поїздки: '+missing.join(', '));
 const reports=[];
 for(const [id,a] of trips){
  if(a.length<2)throw Error('Поїздка має менше двох точок.');let fuelReferenceG=0,fuelModelG=0,dcReferenceJ=0,dcModelJ=0,coveredS=0,gapS=0,squaredFuel=0;
  for(let i=1;i<a.length;i++){
   const x=a[i-1],y=a[i],dt=y.time_s-x.time_s;if(dt>maxGap){gapS+=dt;continue;}coveredS+=dt;
   fuelReferenceG+=(x.reference_fuel_g_s+y.reference_fuel_g_s)*dt/2;fuelModelG+=(x.model_fuel_g_s+y.model_fuel_g_s)*dt/2;
   dcReferenceJ+=(x.referenceW+y.referenceW)*dt/2;dcModelJ+=(x.model_battery_w+y.model_battery_w)*dt/2;
   squaredFuel+=((x.model_fuel_g_s-x.reference_fuel_g_s)**2+(y.model_fuel_g_s-y.reference_fuel_g_s)**2)*dt/2;
  }
  reports.push({id,rows:a.length,coveredS,gapS,fuelReferenceG:coveredS?fuelReferenceG:null,fuelModelG:coveredS?fuelModelG:null,fuelBiasG:coveredS?fuelModelG-fuelReferenceG:null,
   fuelErrorPct:fuelReferenceG>0?100*(fuelModelG-fuelReferenceG)/fuelReferenceG:null,
   fuelRMSE_g_s:coveredS>0?Math.sqrt(squaredFuel/coveredS):null,
   dcReferenceKWh:coveredS?dcReferenceJ/3.6e6:null,dcModelKWh:coveredS?dcModelJ/3.6e6:null,dcErrorKWh:coveredS?(dcModelJ-dcReferenceJ)/3.6e6:null,
   socChangeObserved:a.at(-1).soc-a[0].soc,socChangeModel:a.at(-1).model_soc-a[0].model_soc,
   socEndpointErrorPP:100*(a.at(-1).model_soc-a.at(-1).soc)});
 }
 return {format:'powertrain-trip-report/1',source:meta.source,fuelReference:meta.fuelReference,batteryReference:meta.batteryReference,
  independence:meta.independence??'not-demonstrated',trainingTrips:meta.trainingTrips,validationTrips:meta.validationTrips,reports,
  scope:'Comparison of supplied aligned model/reference columns; no refitting or proof of independent instrumentation. Gaps are excluded, not filled.'};
}
