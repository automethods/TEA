import {parseCSV} from '../../powertrain/src/maps.mjs';
import {fingerprint} from './graph.mjs';
export function validatePairsCSV(text,{label='Надані парні дані',provenance='Походження й незалежність потребують перевірки'}={}){
 if(typeof text!=='string'||text.length>5000000)throw Error('CSV до 5 MB.');const rows=parseCSV(text);if(rows.length<2||rows.length>20000)throw Error('CSV: потрібно 2–20000 рядків.');
 const defs=[['power_w','pred_power_w','Потужність, Вт'],['fuel_g_s','pred_fuel_g_s','Паливо, г/с'],['voltage_v','pred_voltage_v','Напруга, В'],['current_a','pred_current_a','Струм, А'],['soc','pred_soc','SOC, частка']];let prev=-Infinity;
 for(const row of rows){if(!row.time_s?.trim()||!Number.isFinite(+row.time_s)||+row.time_s<=prev)throw Error('time_s має строго зростати.');prev=+row.time_s;}
 const channels=defs.map(([a,b,name])=>{const diffs=[];for(const row of rows){if(!row[a]?.trim()||!row[b]?.trim())continue;const x=+row[a],y=+row[b];if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Нескінченне/нечислове значення '+a);if(a==='soc'&&(x<0||x>1||y<0||y>1))throw Error('SOC має бути часткою 0–1.');diffs.push(y-x);}return {name,observedColumn:a,predictedColumn:b,count:diffs.length,bias:diffs.length?diffs.reduce((x,y)=>x+y,0)/diffs.length:null,rmse:diffs.length?Math.sqrt(diffs.reduce((x,y)=>x+y*y,0)/diffs.length):null,maxAbs:diffs.length?Math.max(...diffs.map(Math.abs)):null};}).filter(c=>c.count);
 if(!channels.length)throw Error('Немає придатних пар observed / pred_*.');return {format:'paired-first-order-validation/1',label,provenance,independentExperimentVerified:false,sourceHash:fingerprint(text),rows:rows.length,channels};
}
