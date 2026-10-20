/** Explicit input proposals and migration; no changes without Apply. */
import {validateConfig} from './vehicle.mjs';
export function engineDefaults(bundle,id){
 const e=bundle.engines.find(x=>x.id===id);if(!e)throw Error('Невідомий двигун.');
 return {engineId:id,engineLimitKW:e.maxPowerKW,engineLimitNm:e.maxTorqueNm,engineLowerRpm:e.minRpm,engineUpperRpm:e.maxRpm};
}
export function motorDefaults(bundle,id){
 const m=bundle.motors.find(x=>x.id===id);if(!m)throw Error('Невідомий електродвигун.');
 const voltage=Math.min(830,Math.ceil((m.voltageRequired+50)/10)*10);
 return {motorId:id,voltage,voltageMin:Math.min(voltage-40,m.voltageRequired),voltageMax:Math.min(900,voltage+80),
  inverterPeakArms:m.peakPhaseArms,inverterContinuousArms:m.continuousPhaseArms,inverterMaxKW:Math.ceil(m.peakKW/0.85),
  dischargeA:Math.ceil(m.peakKW*1000/.85/voltage),chargeA:Math.ceil(m.continuousKW*1000/voltage),peakDurationS:m.peakDutySeconds};
}
export function makePatch(current,proposed,lockedKeys=[],source='Профіль'){
 const locks=new Set(lockedKeys),params={...current},changes=[],skipped=[];
 // A protected identity also protects the dependent default set of another identity.
 if(locks.has('engineId')&&proposed.engineId&&proposed.engineId!==current.engineId)
  for(const k of ['engineLimitKW','engineLimitNm','engineLowerRpm','engineUpperRpm'])locks.add(k);
 if(locks.has('motorId')&&proposed.motorId&&proposed.motorId!==current.motorId)
  for(const k of ['voltage','voltageMin','voltageMax','inverterPeakArms','inverterContinuousArms','inverterMaxKW','dischargeA','chargeA','peakDurationS'])locks.add(k);
 for(const [key,value] of Object.entries(proposed)){
  if(!Object.hasOwn(current,key))throw Error('Невідоме поле підстановки: '+key);
  if(value===current[key])continue;
  if(locks.has(key)){skipped.push({key,before:current[key],proposed:value});continue;}
  params[key]=value;changes.push({key,before:current[key],after:value});
 }
 return {source,params,changes,skipped};
}
export function validatePatch(patch,bundle){
 validateConfig(patch.params,bundle);
 if(bundle.importedFuel&&bundle.importedFuel.componentId!==patch.params.engineId)throw Error('Імпортована паливна карта не відповідає новому ДВЗ. Спочатку явно скиньте її.');
 if(bundle.importedMotor&&bundle.importedMotor.componentId!==patch.params.motorId)throw Error('Імпортована карта втрат не відповідає новому мотору. Спочатку явно скиньте її.');
 return patch;
}
export function presetDefaults(bundle,id){
 const d={...bundle.defaults};
 if(id==='ice')return {...d,...engineDefaults(bundle,'1zr-aligned'),architecture:'ice'};
 if(!['bev','parallel','series'].includes(id))throw Error('Невідомий приклад.');
 const e=engineDefaults(bundle,id==='bev'?'1zr-aligned':'gg2w-willans');
 return {...d,...e,architecture:id,batteryKWh:id==='bev'?48:12,reqElectricRange:id==='bev'?180:0,
  initialSoc:id==='bev'?.85:.65,targetSoc:.6};
}
export function migrateWorkspace(data,bundle){
 if(data?.format!=='powertrain-workspace/1'||!['0.3.0','0.4.0','0.5.0','0.6.0','0.7.0'].includes(data.version))throw Error('Очікується powertrain-workspace/1.');
 let params={...data.params},migrated=false;
 if(data.version==='0.3.0'){
  params={...bundle.defaults,...engineDefaults(bundle,params.engineId),...params};migrated=true;
 }
 validateConfig(params,bundle);
 const allowed=new Set(bundle.parameters.map(m=>m.key));
 const locked=Array.isArray(data.locked)?data.locked.filter(x=>typeof x==='string'&&allowed.has(x)):[];
 return {params,locked,migrated};
}
