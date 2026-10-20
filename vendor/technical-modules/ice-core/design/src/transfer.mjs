/** Versioned, explicit transfer of model-generated characteristics; never a silent write to Automobile. */
import {validateConfig} from '../../powertrain/src/vehicle.mjs';
import {fingerprint} from './graph.mjs';
export function calculatedEngineRecord(r){
 const p=r.params,suffix=(r.calculationRevision??r.inputRevision).slice(-12),x=r.ice;
 if(!x)throw Error('The current calculation has no engine');
 return {id:'design-engine-'+suffix,name:(p.fuelType==='diesel'?'Дизельний':'Бензиновий')+' ДВЗ — розрахунок '+r.version,kind:'calculated',sourceClass:'model-estimated',source:'ICE Design '+r.inputRevision,
 rpm:x.speed.map(q=>q.rpm),torqueNm:x.speed.map(q=>Math.max(0,q.meanTorque)),fuelCurves:x.fuelCurves,lhvJkg:p.lhv,fuelDensityKgL:p.fuelDensity/1000,
 minRpm:x.speed[0].rpm,maxRpm:x.speed.at(-1).rpm,maxPowerKW:Math.max(...x.speed.map(q=>q.Pe))/1000,maxTorqueNm:Math.max(...x.speed.map(q=>q.meanTorque)),status:'model-estimated',boundary:'crankshaft',assumptions:x.loadMethod};
}
export function makeTransfer(r){
 const p=r.params,suffix=(r.calculationRevision??r.inputRevision).slice(-12);let engine=null,motor=null;
 if(r.ice)engine=calculatedEngineRecord(r);
 if(r.electric)motor={...r.electric.motor,id:'design-motor-'+suffix};
 const packet={format:'power-source-transfer/1',version:r.version,inputRevision:r.inputRevision,sourceRevision:r.sourceRevision,calculationRevision:r.calculationRevision,status:'model-estimated',system:p.system,topology:p.topology,engine,motor,
 parameters:{...(r.electric?{...r.electric.battery,inverterEfficiency:p.inverterEfficiency,inverterPeakArms:p.phaseCurrent,inverterContinuousArms:p.phaseCurrent,inverterMaxKW:p.inverterCurrent*p.voltageMin/1000,peakDurationS:p.peakDuration,auxKW:p.auxPower/1000}:{}),
 mass:p.mass,cd:p.cdArea/2.3,area:2.3,crr:p.rolling,wheelRadius:p.wheelRadius,designSpeed:p.vehicleSpeed*3.6,designGrade:p.grade*100,motorRatio:p.driveRatio,transmissionEfficiency:p.driveEfficiency,
 ...(p.system==='hybrid'?{generatorEfficiency:p.generatorEfficiency,generatorMaxKW:p.generatorLimit/1000,preferredEngineKW:Math.min(p.hybridEngineTarget/1000,45)}:{})},
 limitations:['Розраховані, не виміряні характеристики; не EPA-карти.','У Powertrain діє його власна спрощена коробка/стратегія керування. Порівняння потребує узгодженого циклу й SOC.','Результати 0D моделі й еквівалентних електричних компонентів не є готовим серійним комплектом.']};
 packet.contentHash=fingerprint(packet);return packet;
}
export function importTransfer(packet,original){
 if(!packet||packet.format!=='power-source-transfer/1'||!['0.5.0','0.6.0','0.7.0','0.8.0','0.8.1','0.8.2','0.8.3','0.8.4','0.8.5','0.8.6'].includes(packet.version)||!/^sha256:[a-f0-9]{64}$/.test(packet.inputRevision??'')||!['ice','hybrid','electric'].includes(packet.system))throw Error('Непідтримуваний пакет силової установки.');
 const copy=structuredClone(packet),hash=copy.contentHash;delete copy.contentHash;if(fingerprint(copy)!==hash)throw Error('Контрольна сума пакета не збігається.');
 const finite=(x,name,min=0,max=1e9)=>{if(!Number.isFinite(x)||x<min||x>max)throw Error('Некоректне значення '+name);};
 const engine=packet.engine??{id:'unused-engine',name:'ДВЗ не застосовується',kind:'manual',minRpm:1000,maxRpm:5000,maxPowerKW:1,maxTorqueNm:1,lhvJkg:44e6,fuelDensityKgL:.745,source:'Неактивний службовий запис',sourceClass:'not-applicable'};
 if(packet.system!=='electric'){
  if(!packet.engine||engine.kind!=='calculated'||!Array.isArray(engine.rpm)||engine.rpm.length<2||engine.rpm.length>100||engine.torqueNm?.length!==engine.rpm.length||engine.fuelCurves?.length!==engine.rpm.length)throw Error('Некоректна обчислена карта ДВЗ.');
  engine.rpm.forEach((n,i)=>{finite(n,'rpm',1,30000);finite(engine.torqueNm[i],'torque',0,50000);if(i&&n<=engine.rpm[i-1])throw Error('Частоти не зростають.');const row=engine.fuelCurves[i];if(row.rpm!==n||!Array.isArray(row.points)||row.points.length>50)throw Error('Некоректні паливні рядки.');row.points.forEach((q,j)=>{finite(q.torqueNm,'fuel torque',0,50000);finite(q.fuelKgS,'fuel flow',0,10);if(j&&q.torqueNm<=row.points[j-1].torqueNm)throw Error('Моменти не зростають.');});});
 }
 const motor=packet.motor??{id:'unused-motor',name:'Електромотор не застосовується',continuousKW:1,peakKW:1,continuousNm:1,peakNm:1,continuousPhaseArms:1,peakPhaseArms:1,torqueConstantNmArms:1,phaseResistanceOhm25:.01,baseRpm:3000,maxRpm:6000,voltageRequired:0,peakDutySeconds:1,rotationLossBaseW:0,lossModel:'generic-quadratic',boundary:'motor',source:'Неактивний службовий запис'};
 if(packet.system!=='ice'){if(!packet.motor||motor.lossModel!=='generic-quadratic'||motor.boundary!=='motor')throw Error('Некоректна еквівалентна машина.');for(const k of ['continuousKW','peakKW','continuousNm','peakNm','maxRpm','baseRpm','torqueConstantNmArms','phaseResistanceOhm25','rotationLossBaseW'])finite(motor[k],k,k==='rotationLossBaseW'?0:1e-9);}
 const b=structuredClone(original);b.engines=[engine];b.motors=[motor];delete b.importedFuel;delete b.importedMotor;
 for(const f of b.parameters){if(f.key==='engineId')f.options=[{value:engine.id,label:engine.name}];if(f.key==='motorId')f.options=[{value:motor.id,label:motor.name}];}
 // Generic calculated machines are not constrained to an old catalogue's 5000 rpm lower-limit field.
 const minN=b.parameters.find(f=>f.key==='engineLowerRpm');minN.min=100;minN.max=15000;const maxN=b.parameters.find(f=>f.key==='engineUpperRpm');maxN.max=30000;
 const p={...b.defaults,...packet.parameters,architecture:packet.system==='ice'?'ice':packet.system==='electric'?'bev':packet.topology,engineId:engine.id,motorId:motor.id,motorCount:1,
 engineLowerRpm:engine.minRpm,engineUpperRpm:engine.maxRpm,engineLimitKW:engine.maxPowerKW,engineLimitNm:engine.maxTorqueNm};
 p.targetSoc=(p.socMin+p.socMax)/2;p.initialSoc=Math.max(p.socMin,Math.min(p.socMax,p.initialSoc));
 validateConfig(p,b);b.defaults=p;b.transferProvenance={inputRevision:packet.inputRevision,status:packet.status,limitations:packet.limitations};
 b.chapters=b.chapters.map(c=>c.id==='pt02'?{...c,title:'2. Походження розрахованих компонентів',paragraphs:[...packet.limitations]}:c.id==='pt04'?{...c,title:'4. Розраховані електричні компоненти',paragraphs:['Характеристики перенесено з поточного ICE Design. Еквівалентні компоненти не є готовим серійним комплектом.']}:c);
 return {bundle:b,params:p,origins:Object.fromEntries(Object.keys(p).map(k=>[k,{kind:'calculated-transfer',source:'ICE Design '+packet.inputRevision}]))};
}
