import {ensureStation,validateStation} from './station-data.js';
import {VERSION} from './version.js';
export {VERSION};
import {CLASS_IDS,VEHICLE_CHOICES,WORKSHOPS,addProfileDefaults,PLANNING_FIELDS} from './presets.js';
export const SCENARIOS={baseline:'Базовий',improved:'Поліпшений',manual:'Ручна вправа'};
export function initialState(data,extras) {
 return ensureStation(addProfileDefaults({profile:'tea-project/2',applicationVersion:VERSION,student:'',group:'',variant:'Навчальний приклад',scenario:'baseline',day:0,selectedOrder:'O01',partsReady:34,assignments:structuredClone(data.reference_schedules.improved.assignments),operationEdits:{},abs:{radius:.3,z:48,limit:5,dr:.003,df:1,frequency:140,frequencies:{}},adas:structuredClone(extras.adas),pilot:structuredClone(extras.pilot),parking:structuredClone(extras.parking),months:structuredClone(data.monthly_activity.months),notes:{hypotheses:'',decision:'',verification:'',conclusion:'',equipment:''}},data));
}
export function validateState(s,data){
 if(s?.profile==='tea-project/1'){
  s=structuredClone(s);const months=s.months,hours=s.annualHours;addProfileDefaults(s,data);s.months=months;if(hours)s.classData.M1.hours=structuredClone(hours);delete s.annualHours;s.profile='tea-project/2';s.applicationVersion=VERSION;
 }
 if(!s||s.profile!=='tea-project/2'||!Object.hasOwn(SCENARIOS,s.scenario))throw new Error('Невідомий формат проєкту TEA.');
 for(const key of ['student','group','variant'])if(typeof s[key]!=='string'||s[key].length>300)throw new Error('Некоректні дані автора.');
 if(!Number.isInteger(s.day)||s.day<0||s.day>7||!data.orders.some(o=>o.id===s.selectedOrder))throw new Error('Некоректний день або замовлення.');
 if(!Array.isArray(s.assignments)||s.assignments.length!==57||new Set(s.assignments.map(a=>a.operation_id)).size!==57||s.assignments.some(a=>!data.operations.some(o=>o.id===a.operation_id)))throw new Error('Потрібні призначення всіх 57 операцій.');
 if(!s.abs||!s.adas||!s.notes||!s.operationEdits||!Array.isArray(s.pilot)||s.pilot.length>20||!Array.isArray(s.parking)||s.parking.length>40||!Array.isArray(s.months)||s.months.length!==12)throw new Error('Неповні дані проєкту.');
 for(const v of Object.values(s.notes))if(typeof v!=='string'||v.length>12000)throw new Error('Завеликий або некоректний запис.');
 const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 const numeric=v=>v===null||Number.isFinite(v);
 const text=v=>typeof v==='string'&&v.length<=12000;
 const requireShape=ok=>{if(!ok)throw new Error('Некоректна структура вхідних полів проєкту.');};
 requireShape(numeric(s.partsReady)&&obj(s.operationEdits)&&obj(s.abs)&&obj(s.abs.frequencies)&&obj(s.adas)&&obj(s.notes));
 requireShape(s.assignments.every(a=>obj(a)&&numeric(a.start_slot)&&text(a.staff_id)&&text(a.bay_id)));
 requireShape(Object.entries(s.operationEdits).every(([id,e])=>data.operations.some(o=>o.id===id)&&obj(e)&&numeric(e.duration)));
 requireShape(['radius','z','limit','dr','df','frequency'].every(k=>numeric(s.abs[k]))&&Object.values(s.abs.frequencies).every(numeric));
 requireShape(['required','oem','equipment','access','trained'].every(k=>typeof s.adas[k]==='boolean')&&['own','outside'].includes(s.adas.mode));
 requireShape(['start','due','available'].every(k=>text(s.adas[k]))&&['alignment','procedure','wait'].every(k=>numeric(s.adas[k])));
 requireShape(s.pilot.every(r=>obj(r)&&['id','reason','arrival','due','start','ready','issued','note'].every(k=>text(r[k]))&&typeof r.accepted==='boolean'&&['labour','bay','wait'].every(k=>numeric(r[k]))));
 requireShape(s.parking.every(r=>obj(r)&&['orderId','start','end','reason'].every(k=>text(r[k]))));
 requireShape(s.months.every(r=>obj(r)&&obj(r.counts)&&data.job_types.every(j=>numeric(r.counts[j.id]))));
 requireShape(['hypotheses','decision','verification','conclusion','equipment'].every(k=>text(s.notes[k])));
 requireShape(Object.hasOwn(VEHICLE_CHOICES,s.vehiclePreset)&&Object.hasOwn(WORKSHOPS,s.workshopPreset)&&obj(s.vehicleMix)&&obj(s.classData)&&obj(s.planning)&&obj(s.bayShare)&&CLASS_IDS.includes(s.diagnosticClass));
 requireShape(CLASS_IDS.every(id=>numeric(s.vehicleMix[id])&&obj(s.classData[id])&&['length','width','mass','radius'].every(k=>numeric(s.classData[id][k]))&&obj(s.classData[id].hours)&&data.job_types.every(j=>numeric(s.classData[id].hours[j.id]))));
 requireShape(PLANNING_FIELDS.every(([k])=>numeric(s.planning[k]))&&data.job_types.every(j=>numeric(s.bayShare[j.id])));
 s.applicationVersion=VERSION;
 ensureStation(s);
 // Numeric feasibility is reported by the station calculation, not silently corrected on import.
 if(typeof s.design!=='object'||s.design===null||Array.isArray(s.design))throw Error('Невірний проєкт станції.');
 validateStation(s);
 return s;
}
