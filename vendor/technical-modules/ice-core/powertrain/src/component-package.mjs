/** Explicit identity-preserving installation into an in-memory catalogue. No source substitution by brand. */
import {validateMap,linear} from './maps.mjs';
import {sha256Text} from '../../vendor/engdoc/runtime.js';
export function makeComponentPackage(map,profile=null){
 validateMap(map);let component;
 if(map.quantity==='fuel_g_s'){
  const minRpm=map.operatingMinRpm,maxRpm=map.operatingMaxRpm;
  if(!(minRpm>0&&maxRpm>minRpm))throw Error('Пакет потребує робочих min/max rpm, не нульової осі таблиці.');
  const e=map.operatingEnvelope??{rpm:map.rpm,maxTorqueNm:map.maxTorqueNm};
  const knots=[minRpm,...e.rpm.filter(x=>x>minRpm&&x<maxRpm),maxRpm];let maxW=0,maxNm=0;
  for(let i=0;i<knots.length;i++){const n=knots[i],t=linear(e.rpm,e.maxTorqueNm,n);if(t===null)throw Error('Немає огинаючої робочого діапазону.');maxNm=Math.max(maxNm,t);maxW=Math.max(maxW,n*t*Math.PI/30);
   if(i){const a=knots[i-1],ta=linear(e.rpm,e.maxTorqueNm,a),slope=(t-ta)/(n-a),intercept=ta-slope*a,critical=slope<0?-intercept/(2*slope):NaN;if(critical>a&&critical<n)maxW=Math.max(maxW,critical*(intercept+slope*critical)*Math.PI/30);}}
  component={id:map.componentId,name:map.id,kind:'grid',source:map.source,sourceClass:map.evidence,minRpm,maxRpm,maxPowerKW:maxW/1000,maxTorqueNm:maxNm,lhvJkg:map.lhvJkg,fuelDensityKgL:map.fuelDensityKgL,map};
 }else{
  if(!profile||profile.id!==map.componentId)throw Error('Електропакет потребує окремого паспортного профілю з тим самим ID.');
  for(const k of ['maxRpm','peakNm','continuousNm','peakKW','continuousKW','peakPhaseArms','continuousPhaseArms','torqueConstantNmArms','voltageRequired','peakDutySeconds'])if(!Number.isFinite(profile[k])||profile[k]<=0)throw Error('Немає підтвердженого поля електропрофілю '+k);
  if(profile.peakNm<profile.continuousNm||profile.peakKW<profile.continuousKW||profile.peakPhaseArms<profile.continuousPhaseArms)throw Error('Пікові/тривалі межі несумісні.');
  component={...profile,id:map.componentId,name:profile.name??map.id,source:map.source,sourceClass:map.evidence,boundary:map.boundary,lossModel:'numeric-map',map};
 }
 const packet={format:'powertrain-component-package/1',componentType:map.quantity==='fuel_g_s'?'engine':'motor',component};packet.sha256=sha256Text(JSON.stringify(packet));return packet;
}
export function installComponent(packet,original){
 if(!packet||packet.format!=='powertrain-component-package/1'||!['engine','motor'].includes(packet.componentType))throw Error('Непідтриманий пакет компонента.');
 const unsigned=structuredClone(packet);delete unsigned.sha256;if(sha256Text(JSON.stringify(unsigned))!==packet.sha256)throw Error('Вміст пакета змінено після формування.');
 const canonical=makeComponentPackage(packet.component.map,packet.componentType==='motor'?packet.component:null);
 if(canonical.componentType!==packet.componentType||JSON.stringify(canonical.component)!==JSON.stringify(packet.component))throw Error('Метадані компонента не узгоджені з картою.');
 const b=structuredClone(original),key=packet.componentType==='engine'?'engines':'motors',id=packet.component.id;
 const existing=b[key].find(e=>e.id===id);if(existing&&JSON.stringify(existing)!==JSON.stringify(packet.component))throw Error('ID уже належить іншому компоненту. Не замінюйте його картою іншого двигуна.');
 if(!existing)b[key].push(structuredClone(packet.component));const param=b.parameters.find(p=>p.key===(key==='engines'?'engineId':'motorId'));
 if(!param.options.some(o=>o.value===id))param.options.push({value:id,label:packet.component.name+' — '+packet.component.sourceClass});
 b.sourcePackages=[...(b.sourcePackages??[]).filter(p=>p.component.id!==id),structuredClone(packet)];return b;
}
