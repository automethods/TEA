/** Forward acceleration and finite-duration grade screening; no OEM control or thermal validation. */
import {components,solvePoint} from './simulation.mjs';
import {roadLoad,validateConfig} from './vehicle.mjs';

export function accelerate(params,bundle,{step=.1,maxTime=120,targetKMH=params.reqAccelSpeed,gradePct=0}={}){
 const p=validateConfig(params,bundle),c=components(p,bundle);
 if(!(step>=.01&&step<=1&&maxTime>0&&maxTime<=180&&targetKMH>0&&targetKMH<=200))throw Error('Неприпустимі умови прямого розгону.');
 const target=targetKMH/3.6,mass=p.mass*p.rotatingMassFactor;
 const peakUntil=p.architecture==='ice'?maxTime:Math.min(p.peakDurationS,c.motor.peakDutySeconds??0);
 let temperatureK=c.batteryModel?.thermal.initialK;
 let t=0,v=0,x=0,soc=p.initialSoc,on=true,chemicalJ=0,forceWorkJ=0,residual=0,stalled=0;
 let flags=new Set(),rows=[{time_s:0,speed_kmh:0,distance_m:0,soc,acceleration:0,tractiveN:0,rating:'start'}];
 while(t<maxTime-1e-9&&v<target-1e-7){
  let h=Math.min(step,maxTime-t,peakUntil>t+1e-9?peakUntil-t:Infinity),q,a,vmid;
  const rating=t<peakUntil-1e-9?'peak':'continuous';
  // Midpoint force iteration. Crossing the target reduces the step, not the achieved force.
  for(let cut=0;cut<4;cut++){
   vmid=v;
   for(let j=0;j<5;j++){
    q=solvePoint(p,c,{v:Math.max(0,vmid),force:1e7,soc,dt:h,engineOn:on,gradePct,rating,temperatureK});
    a=(q.deliveredForce-roadLoad(p,Math.max(0,vmid),0,gradePct).force)/mass;
    if(v===0&&a<0)a=0;
    vmid=Math.max(0,v+a*h/2);
   }
   const dv=Math.max(0,v+a*h)-v;
   if(v+dv<=target+1e-8||dv<=0)break;
   h*=Math.min(1,(target-v)/dv);
  }
  const next=Math.max(0,v+a*h),nextX=x+(v+next)/2*h;
  chemicalJ+=q.battery.chemicalW*h;
  forceWorkJ+=(q.deliveredForce-roadLoad(p,vmid,0,gradePct).force)*vmid*h;
  soc=q.battery.soc;on=q.engineOn;temperatureK=q.battery.temperatureK??temperatureK;
  residual=Math.max(residual,Math.abs(q.electricalResidual),Math.abs(q.mechanicalResidual));
  if(q.mapFailure)flags.add(q.mapFailure);
  if(q.voltageBelowReference)flags.add('voltage-below-catalogue-reference');
  if(q.motorExtrapolated)flags.add('motor-fit-extrapolation-or-generation-assumption');
  if(q.auxiliaryUnservedW>1)flags.add('auxiliary-power-unserved');
  stalled=next-v<1e-5?stalled+h:0;
  t+=h;v=next;x=nextX;
  rows.push({time_s:t,speed_kmh:v*3.6,distance_m:x,soc,acceleration:a,tractiveN:q.deliveredForce,
   batteryKW:q.battery.terminalW/1000,motorKW:q.motorPowerW/1000,engineKW:q.enginePowerW/1000,rating});
  if(stalled>3)break;
 }
 const reached=v>=target-1e-5;
 return {rows,targetKMH,reached,timeS:reached?t:null,elapsedS:t,reachedKMH:v*3.6,distanceM:x,finalSoc:soc,
  peakUntilS:peakUntil,batteryChemicalKWh:chemicalJ/3.6e6,energyResidualJ:.5*mass*v*v-forceWorkJ,
  maxPowerResidualW:residual,flags:[...flags],stepS:step,
  model:'forward-midpoint; instantaneous gears; fixed driven-axle load; one S2 event then S1'};
}
export function steadyRange(params,bundle){
 if(params.architecture==='ice')return {km:null,status:'not-electric'};
 const p={...params,architecture:'bev'},c=components(p,bundle),v=p.designSpeed/3.6;
 if(c.batteryModel)return integratedRange(p,bundle);
 const q=solvePoint(p,c,{v,force:roadLoad(p,v,0,0).force,soc:p.initialSoc,dt:1,engineOn:false});
 if(q.unmetW>10||q.auxiliaryUnservedW>1||q.mapFailure)return {km:null,status:'power-or-data-limited'};
 if(q.battery.chemicalW<=0)return {km:null,status:'nonpositive-consumption'};
 const chemicalKWh=p.batteryKWh*(p.initialSoc-p.socMin);
 return {km:chemicalKWh/(q.battery.chemicalW/1000)*p.designSpeed,status:'constant-speed-fixed-Voc-R-estimate',chemicalKWh};
}
export function assessRequirements(params,bundle,{accelerationStep=.1}={}){
 const p=validateConfig(params,bundle),c=components(p,bundle),acc=accelerate(p,bundle,{step:accelerationStep});
 const v=p.reqTopSpeed/3.6,load=roadLoad(p,v,0,0);
 const top=solvePoint(p,c,{v,force:load.force,soc:p.initialSoc,dt:1,engineOn:true,rating:'continuous'});
 let temperatureK=c.batteryModel?.thermal.initialK;
 let soc=p.initialSoc,on=true,gradeUnmetJ=0,gradeSeconds=0,gradeMapFailure=false,voltageBelow=false;
 for(let t=0;t<p.reqGradeDuration;){
  const h=Math.min(2,p.reqGradeDuration-t),vg=p.reqGradeSpeed/3.6;
  const q=solvePoint(p,c,{v:vg,force:roadLoad(p,vg,0,p.reqGrade).force,soc,dt:h,engineOn:on,gradePct:p.reqGrade,rating:'continuous',temperatureK});
  soc=q.battery.soc;on=q.engineOn;temperatureK=q.battery.temperatureK??temperatureK;gradeUnmetJ+=q.unmetW*h;
  if(q.unmetW>10||q.auxiliaryUnservedW>1)gradeSeconds+=h;
  gradeMapFailure ||= !!q.mapFailure;voltageBelow ||= q.voltageBelowReference;t+=h;
 }
 const range=p.reqElectricRange>0?steadyRange(p,bundle):{km:null,status:'not-requested'};
 const voltageValid=!voltageBelow&&!top.voltageBelowReference&&!acc.flags.includes('voltage-below-catalogue-reference');
 const checks=[{id:'voltage',label:'Напруга під навантаженням не нижча за табличну опору',pass:voltageValid,actual:voltageValid?1:0,target:1,unit:'так=1'},
  {id:'topSpeed',label:`Стала швидкість ${p.reqTopSpeed} км/год при початковому SOC`,pass:top.unmetW<=10&&top.auxiliaryUnservedW<=1&&!top.mapFailure,actual:top.wheelDeliveredW/1000,target:load.powerW/1000,unit:'кВт на колесах'},
  {id:'acceleration',label:`Розгін 0–${p.reqAccelSpeed} км/год`,pass:acc.reached&&acc.timeS<=p.reqAccelTime,actual:acc.timeS,target:p.reqAccelTime,unit:'с'},
  {id:'grade',label:`Ухил ${p.reqGrade}% / ${p.reqGradeSpeed} км/год / ${p.reqGradeDuration} с`,pass:gradeSeconds===0&&!gradeMapFailure,actual:gradeSeconds,target:0,unit:'с дефіциту'},
  {id:'range',label:`Електричний запас ходу при ${p.designSpeed} км/год`,pass:p.reqElectricRange===0||(range.km!==null&&range.km>=p.reqElectricRange),actual:range.km,target:p.reqElectricRange,unit:'км',skipped:p.reqElectricRange===0}
 ];
 const warnings=[...acc.flags];
 if(voltageBelow||top.voltageBelowReference)warnings.push('Напруга під навантаженням нижча за табличну опору: потрібна карта напруги/послаблення поля.');
 if(p.architecture!=='ice')warnings.push('Батарея та інвертор — проєктні параметри, не серійний комплект.');
 if(p.architecture!=='bev'&&c.engine.kind==='curve')warnings.push('Витрата палива не визначена: немає паливної карти цього ДВЗ.');
 return {checks,passed:checks.every(c=>c.pass),acceleration:acc,gradeFinalSoc:soc,gradeFinalTemperatureK:temperatureK??null,gradeUnmetKWh:gradeUnmetJ/3.6e6,range,warnings,
  note:'Модельний відбір; без температурної валідації, OEM-керування й сертифікації.'};
}

/** Constant-speed endurance with the optional battery SOC/T model; a model estimate, not a driving-cycle range. */
export function integratedRange(params,bundle,{step=5,maxTime=36000}={}){
 const p={...params,architecture:'bev'},c=components(p,bundle),v=p.designSpeed/3.6;
 if(!(step>=.1&&step<=10&&maxTime>0&&maxTime<=86400))throw Error('Межі інтегрованого запасу ходу.');
 let soc=p.initialSoc,temperatureK=c.batteryModel?.thermal.initialK,t=0,km=0,chemicalJ=0;
 while(t<maxTime&&soc>p.socMin+1e-7){const h=Math.min(step,maxTime-t),q=solvePoint(p,c,{v,force:roadLoad(p,v,0,0).force,soc,temperatureK,dt:h,engineOn:false});
  if(q.unmetW>10||q.auxiliaryUnservedW>1||q.mapFailure)return {km,status:'state-integrated-power-or-data-limit',completed:false,elapsedS:t,finalSoc:soc,temperatureK};
  soc=q.battery.soc;temperatureK=q.battery.temperatureK??temperatureK;t+=h;km+=v*h/1000;chemicalJ+=q.battery.chemicalW*h;}
 return {km,status:soc<=p.socMin+1e-7?'state-integrated-SOC-limit':'state-integrated-time-limit',completed:soc<=p.socMin+1e-7,elapsedS:t,finalSoc:soc,temperatureK,chemicalKWh:chemicalJ/3.6e6};
}
