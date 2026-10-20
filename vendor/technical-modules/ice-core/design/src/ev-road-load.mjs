/** Adapted from Automobile cycle-energy.js wheelPowerAt and interval integration.
 * One equivalent final-drive ratio, constant rolling coefficient; no gearbox model.
 * Sources and copied data: docs/ELECTRIC-MODEL-2026-09-30.md.
 */
export function parseElectricCycle(csv){
 const lines=String(csv).split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#'));
 if(lines.length<3||lines.length>20002)throw Error('CSV циклу: потрібно 2–20000 точок.');
 const sep=lines[0].includes(';')?';':lines[0].includes('\t')?'\t':',';
 const keys=lines.shift().split(sep).map(x=>x.trim());
 if(!keys.includes('time_s')||!keys.includes('speed_kmh'))throw Error('CSV: потрібні time_s,speed_kmh; grade_ratio необов’язковий.');
 const rows=lines.map(line=>{const cells=line.split(sep);if(cells.length!==keys.length)throw Error('CSV: кількість стовпців не збігається.');const v=Object.fromEntries(keys.map((k,i)=>[k,Number(cells[i].trim())]));if(cells.some(x=>!x.trim())||!Number.isFinite(v.time_s)||!Number.isFinite(v.speed_kmh)||v.time_s<0||v.speed_kmh<0||v.speed_kmh>350||!Number.isFinite(v.grade_ratio??0)||Math.abs(v.grade_ratio??0)>1)throw Error('CSV: некоректний час, швидкість або ухил.');return {time_s:v.time_s,speed_kmh:v.speed_kmh,grade_ratio:v.grade_ratio??0};});
 for(let j=1;j<rows.length;j++)if(rows[j].time_s<=rows[j-1].time_s)throw Error('Час CSV має строго зростати.');
 return rows;
}
import {evaluateRoadLoad} from '../../../road-load/index.mjs';
export function roadLoadAt(p,mass,speed,acceleration,grade=0){
 const result=evaluateRoadLoad({modelId:'ice-constant-coefficient/1',inputs:{operatingMassKg:mass,
  rotatingMassFactor:p.evRotatingFactor,vehicleSpeedMPerS:speed,accelerationMPerS2:acceleration,
  gradeRatio:grade,rollingResistanceCoefficient:p.rolling,dragAreaM2:p.cdArea}});
 if(result.status!=='ok')throw Error('Invalid road-load input');
 const x=result.outputs;
 return {rollingW:x.rollingForceN*speed,aeroW:x.aerodynamicForceN*speed,gradeW:x.gradeForceN*speed,
  inertiaW:x.inertiaForceN*speed,wheelW:x.wheelPowerW};
}
import {isWLTC,wltcProfile} from './wltc.mjs';
export function electricCycle(p,b){
 if(p.evRangeMode==='constant')return [{time_s:0,speed_kmh:p.vehicleSpeed*3.6,grade_ratio:p.grade},{time_s:3600,speed_kmh:p.vehicleSpeed*3.6,grade_ratio:p.grade}];
 if(isWLTC(p.missionCycle))return wltcProfile(p,b).rows;
 if(p.missionCycle==='custom')return parseElectricCycle(p.evCustomCycle);
 const c=b.componentBundle?.cycleCatalog?.find(x=>x.id===p.missionCycle);
 if(!c?.rows?.length)throw Error('Немає CSV вибраного циклу.');
 return c.rows.map(q=>({time_s:q.time_s,speed_kmh:q.speed_kmh,grade_ratio:q.grade_ratio??q.grade??p.grade}));
}

export function electricCycleInfo(p,b,cycle=electricCycle(p,b)){
 const names={wltc3:'WLTC Class 3b',udds:'EPA UDDS — міський',hwfet:'EPA HWFET — заміський',us06:'EPA US06 — інтенсивний',custom:'Власний CSV'};
 const profile=p.evRangeMode==='cycle'&&isWLTC(p.missionCycle)?wltcProfile(p,b):null;
 const name=profile?profile.name:p.evRangeMode==='constant'?'Стала швидкість '+(p.vehicleSpeed*3.6).toFixed(1)+' км/год':names[p.missionCycle]??p.missionCycle;
 const distance=cycle.slice(1).reduce((a,z,j)=>a+(z.speed_kmh+cycle[j].speed_kmh)/7.2*(z.time_s-cycle[j].time_s),0),duration=cycle.at(-1).time_s-cycle[0].time_s;
 return {name,duration,distance,maxSpeed:Math.max(...cycle.map(q=>q.speed_kmh)),meanSpeed:distance/duration*3.6,selection:profile?profile.name+'; '+(profile.automatic?'автоматично за I-192; ':'вибір у I-120; ')+(profile.capped?'компенсація відстані '+profile.phases.reduce((s,q)=>s+q.added_s,0)+' с; ':'без cap; ')+'4 фази. WLTP: окремий критерій завершення BEV у I-193. Проєктний пробіг використовує SOC_initial → SOC_min.':p.missionCycle==='wltc3'?'WLTC 3b — профіль швидкості (low, medium, high, extra-high), спільний для застосовних ДВЗ, BEV та PHEV. WLTP — повна процедура; для BEV (PEV) і PHEV (OVC-HEV) є окремі енергетичні випробування. Тут — модельна оцінка за циклом, без сертифікаційного визначення класу та поправок.':'Режим обрано користувачем у I-120 або I-165.'};
}
