/** Source observations stay separate; intervals are never averaged. */
export const moduleId='module.vehicle.prototype-comparison',moduleVersion='0.1.0';
export function contextKey(m){return JSON.stringify([m.metric,m.unit,m.procedure,m.cycleClass??null,m.phase,m.mode,m.meterPoint,m.ratingBasis??'unspecified',m.market||'unspecified']);}
export function comparePrototypes(records,ids,{metric='acceleration_0_100_s',context=null}={}){
 const selected=[...new Set(ids.filter(Boolean))].map(id=>records.find(r=>r.id===id));
 if(selected.some(r=>!r))return {status:'invalid-input',reason:'unknown-prototype',rows:[],groups:[]};
 const groups=new Map(),rows=[];
 for(const r of selected){
  for(const m of r.referenceMeasurements||[]){
   if(m.metric!==metric)continue;
   const key=contextKey(m);if(!groups.has(key))groups.set(key,{key,metric,unit:m.unit,procedure:m.procedure,cycleClass:m.cycleClass,phase:m.phase,mode:m.mode,meterPoint:m.meterPoint,ratingBasis:m.ratingBasis,market:m.market});
   if(context!==null&&context!==key)continue;
   if(![m.min,m.max].every(Number.isFinite)||m.min<0||m.max<m.min)continue;
   rows.push({prototypeId:r.id,label:[r.make,r.model,r.modelYear,r.variant].filter(Boolean).join(' '),min:m.min,max:m.max,statistic:m.statistic,unit:m.unit,contextKey:key,observation:structuredClone(m)});
  }
 }
 return {status:rows.length?'ok':'missing-data',moduleId,moduleVersion,metric,context,groups:[...groups.values()],rows,missing:selected.filter(r=>!rows.some(v=>v.prototypeId===r.id)).map(r=>r.id),limitations:['Different procedures, phases, charge modes, energy boundaries, rating bases or markets form separate groups.','Wheel and temperature conditions are retained on each observation; matching groups do not imply identical tests.','0–60 mph values are not converted to 0–100 km/h.']};
}
export function compareProperty(records,ids,property){
 const units={curbMass:'kg',grossMass:'kg',wheelbaseMm:'mm',batteryGrossKwh:'kWh',batteryUsableKwh:'kWh',motorPowerKw:'kW'};
 if(!units[property])return {status:'invalid-input',rows:[],reason:'unsupported-property'};
 return {moduleId,moduleVersion,status:'ok',property,unit:units[property],rows:ids.filter(Boolean).map(id=>records.find(r=>r.id===id)).filter(Boolean).map(r=>({prototypeId:r.id,label:[r.make,r.model,r.modelYear,r.variant].filter(Boolean).join(' '),value:Number.isFinite(r[property])?r[property]:null,sourceFile:r.sourceFile,sourceUrl:r.sourceUrl,limitations:r.limitations||[],massPairStatus:r.massPairStatus}))};
}
