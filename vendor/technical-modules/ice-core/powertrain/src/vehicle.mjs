export const G=9.80665;
export function roadLoad(p,speedMps,acceleration,gradePct=0){
 const theta=Math.atan(gradePct/100),vAir=speedMps+p.headwind;
 const rolling=p.mass*G*p.crr*Math.cos(theta),aero=.5*p.rho*p.cd*p.area*vAir*Math.abs(vAir);
 const grade=p.mass*G*Math.sin(theta),inertia=p.mass*p.rotatingMassFactor*acceleration;
 const force=rolling+aero+grade+inertia;
 return {force,rolling,aero,grade,inertia,powerW:force*speedMps};
}
export function validateConfig(p,bundle){
 if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Потрібні параметри силової установки.');
 const allowed=new Set(bundle.parameters.map(x=>x.key));for(const key of Object.keys(p))if(!allowed.has(key))throw Error('Невідомий параметр: '+key);
 for(const m of bundle.parameters){const v=p[m.key];if(m.options){if(!m.options.some(o=>o.value===v))throw Error('Неприпустимий вибір: '+m.key);}else if(!Number.isFinite(v)||v<m.min||v>m.max||(m.integer&&!Number.isInteger(v)))throw Error(`${m.label}: допустимо ${m.min}–${m.max}.`);}
 if(p.socMin>=p.socMax||p.initialSoc<p.socMin||p.initialSoc>p.socMax||p.targetSoc<p.socMin||p.targetSoc>p.socMax)throw Error('Перевірте межі, початковий і цільовий SOC.');
 if(p.voltageMin>p.voltage||p.voltageMax<p.voltage)throw Error('Номінальна напруга повинна лежати між Umin та Umax.');
 const e=bundle.engines.find(e=>e.id===p.engineId);if(!e)throw Error('Невідомий ДВЗ.');
 if(p.engineLowerRpm>=p.engineUpperRpm||Math.max(p.engineLowerRpm,e.minRpm)>=Math.min(p.engineUpperRpm,e.maxRpm))throw Error('Немає спільної робочої області частоти ДВЗ.');
 if(p.inverterContinuousArms>p.inverterPeakArms)throw Error('Тривалий струм інвертора не може перевищувати піковий.');
 if(p.architecture!=='ice') {const m=bundle.motors.find(m=>m.id===p.motorId);if(p.voltage<m.voltageRequired)throw Error(`Для обраного MV/LC прикладу потрібно ${m.voltageRequired} В за паспортом. Автоматичне зниження напруги не моделюється.`);}
 return {...p};
}
export function validateCycle(rows){
 if(!Array.isArray(rows)||rows.length<2||rows.length>20000)throw Error('Цикл має містити 2–20000 точок.');
 for(let i=0;i<rows.length;i++){const r=rows[i];if(!Number.isFinite(r.time_s)||r.time_s<0||!Number.isFinite(r.speed_kmh)||r.speed_kmh<0||r.speed_kmh>250||!Number.isFinite(r.grade_pct)||Math.abs(r.grade_pct)>30||(i&&r.time_s<=rows[i-1].time_s))throw Error('Некоректні час, швидкість або ухил циклу.');}
 if(rows.at(-1).time_s-rows[0].time_s>86400)throw Error('Цикл довший за 24 години.');return rows;
}
export function expandCycle(keyframes,step=1){
 validateCycle(keyframes);const rows=[];
 for(let i=0;i<keyframes.length-1;i++){const a=keyframes[i],b=keyframes[i+1],segments=Math.ceil((b.time_s-a.time_s)/step);
  for(let j=0;j<segments;j++){const f=j/segments;rows.push({time_s:a.time_s+(b.time_s-a.time_s)*f,speed_kmh:a.speed_kmh+(b.speed_kmh-a.speed_kmh)*f,grade_pct:a.grade_pct+(b.grade_pct-a.grade_pct)*f});}}
 rows.push({...keyframes.at(-1)});return rows;
}
