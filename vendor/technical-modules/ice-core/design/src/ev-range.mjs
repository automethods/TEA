import {electricAcceleration} from './ev-performance.mjs';
import {designElectrical,batteryConfig,boundedMotorSI,motorPoint,currentForPower} from './electric.mjs';
import {batteryLimits} from '../../powertrain/src/battery.mjs';
import {electricCycle,roadLoadAt,electricCycleInfo} from './ev-road-load.mjs';
import {bevProcedureCases} from './bev-procedures.mjs';

export function batteryPackProposal(p,b){
 const q=b.evBatteryPacks?.find(x=>x.id===p.evPack);if(!q)return {};
 return {evPackEnergy:+q.energy_kwh*3.6e6,evSpecificEnergy:+q.specific_energy_whkg*3600,evSpecificPower:+q.specific_power_wkg,evSpecificPeakPower:+q.specific_peak_power_wkg,evSpecificChargePower:+q.specific_charge_power_wkg,evPackPeakDuration:+q.peak_seconds};
}
export function electricClassProposal(p,b){
 const q=b.evVehicleClasses?.find(x=>x.id===p.evVehicleClass);if(!q)return {};
 return {evTareRatio:+q.q_curb_payload_reference,evReferencePayload:+q.rated_payload_reference_kg,evReferenceBatteryEnergy:+q.reference_battery_kwh*3.6e6,evReferenceSpecificEnergy:+q.reference_battery_specific_whkg*3600,evGrip:.6,mass:+q.mass_kg,cdArea:+q.cd_area_m2,rolling:+q.rolling,wheelRadius:+q.wheel_radius_m,evMassMode:p.evMassMode==='q'?'q':'total',evPayload:+q.payload_default_kg,evGrossMass:+q.gross_mass_kg};
}
export function electricMassBasis(p,referenceEnergy){
 const referenceBatteryMass=p.evMassMode==='q'?p.evReferenceBatteryEnergy/p.evReferenceSpecificEnergy:p.evMassMode==='total'?referenceEnergy/p.evSpecificEnergy:0;
 const referenceCurbMass=p.evMassMode==='q'?p.evTareRatio*p.evReferencePayload:p.mass;
 const baseMass=referenceCurbMass-referenceBatteryMass;
 return {mode:p.evMassMode,baseMass,referenceBatteryMass,referenceCurbMass,q:p.evMassMode==='q'?p.evTareRatio:null,ratedPayload:p.evMassMode==='q'?p.evReferencePayload:null,maxBatteryMass:Math.max(0,p.evGrossMass-baseMass-p.evPayload)};
}
export function electricDriveRatio(p){return p.evRatioMode==='target'?2*Math.PI*p.wheelRadius*p.motorMaxSpeed/p.evMaxSpeed:p.driveRatio;}
/** Two independent requirements; no optimum is inferred from crossing unlike axes. */
export function refinedBatteryParams(p,{payload,range,batteryMass,mode},baseMass){
 if(!['range','mass'].includes(mode)||![payload,range,batteryMass,baseMass].every(Number.isFinite)||payload<0||range<=0||batteryMass<=0||baseMass<=0)throw Error('Перевірте вантаж, пробіг і масу батареї.');
 const energy=batteryMass*p.evSpecificEnergy;
 return {...p,evPayload:payload,evTargetRange:range,batteryEnergy:energy,evSizing:mode==='range'?'range':'energy',...(p.evMassMode==='total'?{mass:baseMass+batteryMass}:{})};
}
export function voltageArchitectureProposal(voltage){
 if(![400,800].includes(voltage))throw Error('Оберіть шаблон 400 або 800 В.');
 return {voltage,voltageMin:voltage*.8,voltageMax:voltage*1.125,inverterVoltage:voltage*1.25};
}
function pack(p,energy){const mass=energy/p.evSpecificEnergy;return {energy,mass,continuousW:mass*p.evSpecificPower,peakW:mass*p.evSpecificPeakPower,chargeW:mass*p.evSpecificChargePower,peakSeconds:Math.min(p.peakDuration,p.evPackPeakDuration)};}
function batteryBudget(p,e,pk,rating='continuous'){
 const lim=batteryLimits(e.battery,p.socInitial,1);
 return {minDC:Math.max(lim.minW,-pk.chargeW)-p.auxPower,maxDC:Math.min(lim.maxW,rating==='peak'?pk.peakW:pk.continuousW)-p.auxPower};
}
export function roadEnergy(p,e,pk,mass,cycle,{rows=true,peakUsedSeconds=0}={}){
 const count=p.evMotorCount,m=e.motor,budget=batteryBudget(p,e,pk),peakBudget=batteryBudget(p,e,pk,'peak');
 let distance=0,chemical=0,terminal=0,heat=0,positive=0,recovered=0,friction=0,unmet=0,peakSeconds=peakUsedSeconds,speedSeconds=0,rollingJ=0,aeroJ=0,auxJ=0,positiveMotorDC=0,positiveShaft=0,maxDeficitW=0,deficitSeconds=0;
 let electricalInvalid=false;let minSoc=p.socInitial;const out=[];
 for(let j=1;j<cycle.length;j++){
  const a=cycle[j-1],z=cycle[j],dt=z.time_s-a.time_s,v=(a.speed_kmh+z.speed_kmh)/7.2,acc=(z.speed_kmh-a.speed_kmh)/3.6/dt,grade=((a.grade_ratio??0)+(z.grade_ratio??0))/2;
  const road=roadLoadAt(p,mass,v,acc,grade),rpm=v/p.wheelRadius*p.driveRatio*30/Math.PI,rpmMax=Math.max(a.speed_kmh,z.speed_kmh)/3.6/p.wheelRadius*p.driveRatio*30/Math.PI,w=rpm*Math.PI/30;
  const shaft=road.wheelW>=0?road.wheelW/p.driveEfficiency:road.wheelW*p.driveEfficiency*p.evRegenFraction;
  const chargeSoc=Math.max(p.socMin,Math.min(p.socMax,p.socInitial-chemical/pk.energy)),chargeLimit=batteryLimits(e.battery,chargeSoc,dt).minW;
  const tq=w>0?shaft/w/count:0,hi=Math.min(budget.maxDC,count*m.maxDcW)/count,lo=Math.max(budget.minDC,chargeLimit-p.auxPower,-count*m.maxDcW)/count;
  const cont=boundedMotorSI(m,rpm,tq,p.inverterEfficiency,lo,hi),pkq=boundedMotorSI(m,rpm,tq,p.inverterEfficiency,Math.max(peakBudget.minDC,chargeLimit-p.auxPower,-count*m.maxDcW)/count,Math.min(peakBudget.maxDC,count*m.maxDcW)/count,'peak');
  const needPeak=shaft>0&&(!cont.ok||cont.mechanicalW*count<shaft-1),usePeak=needPeak&&peakSeconds+dt<=pk.peakSeconds+1e-9,q=usePeak?pkq:cont;
  if(needPeak)peakSeconds+=dt;
  if(rpmMax>m.maxRpm+1e-8)speedSeconds+=dt;
  const delivered=q.ok?q.mechanicalW*count:0;
  // A backward calculation: consumption follows the requested trace. Feasibility
  // is evaluated separately; range is suppressed if the trace cannot be followed.
  const demand=shaft>=0?motorPoint(m,rpm,tq,p.inverterEfficiency).dcW*count:Math.min(0,(q.ok?q.dcW*count:0));
  const dc=demand+p.auxPower,current=currentForPower(p,dc),chem=current===null?null:p.voltage*current,loss=current===null?0:p.resistance*current*current;
  if(current===null)electricalInvalid=true;
  const rawShortfall=shaft>0?Math.max(0,shaft-delivered):0,shortfall=rawShortfall<1?0:rawShortfall;
  positiveShaft+=Math.max(0,shaft)*dt;positiveMotorDC+=Math.max(0,demand)*dt;maxDeficitW=Math.max(maxDeficitW,shortfall);if(shortfall>0)deficitSeconds+=dt;
  unmet+=shortfall*dt;
  distance+=v*dt;terminal+=dc*dt;heat+=loss*dt;chemical+=(chem??dc)*dt;
  positive+=Math.max(0,road.wheelW)*dt;recovered+=Math.max(0,-demand)*dt;friction+=Math.max(0,-road.wheelW+Math.min(0,delivered/p.driveEfficiency))*dt;
  rollingJ+=road.rollingW*dt;aeroJ+=road.aeroW*dt;auxJ+=p.auxPower*dt;
  const rawSoc=p.socInitial-chemical/pk.energy;minSoc=Math.min(minSoc,rawSoc);
  if(rows){const remaining=pk.energy*(p.socInitial-p.socMin)-chemical;out.push({time_s:z.time_s,speed_kmh:z.speed_kmh,distance_km:distance/1000,wheel_kw:road.wheelW/1000,dc_kw:dc/1000,delivered_kw:delivered/1000,deficit_kw:shortfall*p.driveEfficiency/1000,deficit_pct:shaft>0?100*shortfall/shaft:0,energy_kwh:chemical/3.6e6,remaining_kwh:Math.max(0,remaining)/3.6e6,energy_shortfall_kwh:Math.max(0,-remaining)/3.6e6,soc:Math.max(p.socMin,Math.min(p.socMax,rawSoc)),raw_soc:rawSoc,current_a:current,terminal_v:current===null?null:p.voltage-current*p.resistance});}
 }
 const feasible=!electricalInvalid&&unmet<Math.max(1,positive*1e-6)&&speedSeconds===0,energyPerM=distance>0?chemical/distance:null,usable=pk.energy*(p.socInitial-p.socMin),range=feasible&&energyPerM>0?usable/energyPerM:null;
 return {rows:out,mass,feasible,distance,chemicalJ:chemical,terminalJ:terminal,heatJ:heat,positiveWheelJ:positive,recoveredJ:recovered,frictionJ:friction,rollingJ,aeroJ,auxJ,unmetJ:unmet,deficitPercent:positiveShaft>0?100*unmet/positiveShaft:0,maxDeficitW:maxDeficitW*p.driveEfficiency,deficitSeconds,tractionEfficiency:positiveMotorDC>0?positive/positiveMotorDC:null,gridConsumptionKWh100:energyPerM===null?null:energyPerM/36/p.evChargeEfficiency,peakSeconds,speedSeconds,energyPerM,range,usableJ:usable,minSoc,balanceResidual:chemical-terminal-heat,consumptionKWh100:energyPerM===null?null:energyPerM/36};
}
export function designElectricVehicle(p,b,enginePower=0){
 if(p.evEnabled!=='yes')return designElectrical(p,enginePower);
 p={...p,driveRatio:electricDriveRatio(p)};
 const cycle=electricCycle(p,b),referenceEnergy=p.evSizing==='packs'?p.evPackCount*p.evPackEnergy:p.batteryEnergy;
 const massBasis=electricMassBasis(p,referenceEnergy),baseMass=massBasis.baseMass;
 if(baseMass<=0)throw Error('Маса без батареї ≤ 0. Перевірте I-112 або q·Q_nom, енергію початкової батареї та режим маси.');
 const cache=new Map();
 function evaluate(energy,keepRows=false){if(!keepRows&&cache.has(energy))return cache.get(energy);const pk=pack(p,energy),mass=baseMass+pk.mass+p.evPayload,e=designElectrical(p,enginePower,{energyOverride:energy,powerLimits:pk,skipMission:!keepRows});const road=roadEnergy(p,e,pk,mass,cycle,{rows:keepRows});const value={e,pk,road};if(!keepRows)cache.set(energy,value);return value;}
 let energy=referenceEnergy,iterations=[];
 if(p.evSizing==='range'){
  const cap=Math.min(3000*3.6e6,massBasis.maxBatteryMass*p.evSpecificEnergy);
  if(cap<.5*3.6e6)throw Error('Після резервування потрібного вантажу залишається менше 0,5 кВт·год батареї. Перевірте базову масу, вантаж і допустиму повну масу.');
  let lo=.5*3.6e6,hi=Math.min(cap,Math.max(energy,3.6e6)),q=evaluate(hi);
  const meets=x=>x.road.range!==null&&x.road.range>=p.evTargetRange;
  hi=Math.min(hi,cap);q=evaluate(hi);
  while(!meets(q)&&hi<cap){hi=Math.min(cap,hi*1.6);q=evaluate(hi);iterations.push({energy_kwh:hi/3.6e6,range_km:q.road.range===null?null:q.road.range/1000,mass_kg:q.road.mass});}
  if(meets(q))for(let j=0;j<24;j++){const mid=(lo+hi)/2,x=evaluate(mid);if(meets(x))hi=mid;else lo=mid;}
  energy=Math.min(cap,Math.ceil(hi/3.6e6)*3.6e6);
 }
 const {e,pk,road}=evaluate(energy,true),sweep=[];
 const maxEnergy=Math.min(3000*3.6e6,Math.max(energy*2,p.evTargetRange*(road.energyPerM??500)*2,60*3.6e6));
 const massCapEnergy=massBasis.maxBatteryMass*p.evSpecificEnergy;
 const sample=new Set([energy,...(massCapEnergy>0&&massCapEnergy<=3000*3.6e6?[massCapEnergy]:[]),...Array.from({length:30},(_,j)=>(.05+.95*j/29)*maxEnergy)]);
 for(const E of [...sample].sort((a,b)=>a-b)){const x=evaluate(E);sweep.push({energy_kwh:E/3.6e6,battery_mass_kg:x.pk.mass,total_mass_kg:x.road.mass,range_km:x.road.range===null?null:x.road.range/1000,consumption_kwh100:x.road.consumptionKWh100,payload_available_kg:Math.max(0,p.evGrossMass-baseMass-x.pk.mass),range_valid_km:x.road.mass<=p.evGrossMass&&x.road.range!==null?x.road.range/1000:null,range_overweight_km:x.road.mass>p.evGrossMass&&x.road.range!==null?x.road.range/1000:null,payload_required_kg:p.evPayload,mass_ok:x.road.mass<=p.evGrossMass,feasible:x.road.feasible,target_km:p.evTargetRange/1000});}
 // Discrete design map: only payload and battery mass vary; base, motor, route and SOC are fixed.
 const budget=Math.max(0,p.evGrossMass-baseMass),mapBatteryMax=Math.max(1,pk.mass*1.05,Math.min(budget*1.05,Math.max(pk.mass*1.5,massBasis.maxBatteryMass*1.08))),mapPayloadMax=Math.max(1,p.evPayload*1.05,Math.min(budget*1.05,Math.max(p.evPayload*2,budget*.6))),payloadMap=[];
 const nx=12,ny=9;
 for(let j=0;j<nx;j++){
  const batteryMass=(j+.5)*mapBatteryMax/nx,E=batteryMass*p.evSpecificEnergy,variant=evaluate(E);
  for(let k=0;k<ny;k++){
   const payload=(k+.5)*mapPayloadMax/ny,mass=baseMass+batteryMass+payload,massOK=mass<=p.evGrossMass;
   const z=massOK?roadEnergy(p,variant.e,variant.pk,mass,cycle,{rows:false}):null;
   payloadMap.push({battery_mass_kg:batteryMass,battery_energy_kwh:E/3.6e6,payload_kg:payload,total_mass_kg:mass,mass_ok:massOK,feasible:z?.feasible??false,range_km:z?.range===null||!z?null:z.range/1000,consumption_kwh100:z?.consumptionKWh100??null,target_met:!!z&&z.range!==null&&z.range>=p.evTargetRange,ix:j,iy:k});
  }
 }
 const validSamples=sweep.filter(z=>z.range_valid_km!==null),maxSampleRange=validSamples.length?validSamples.reduce((a,z)=>z.range_valid_km>a.range_valid_km?z:a):null;
 // Refine the first sampled interval meeting the target; the maximum is a checked-grid result.
 const first=sweep.find(q=>q.mass_ok&&q.feasible&&q.range_km>=p.evTargetRange/1000);
 let minimum=null;
 if(first){let hi=first.energy_kwh*3.6e6,lo=Math.max(.5*3.6e6,(sweep[sweep.indexOf(first)-1]?.energy_kwh??.5)*3.6e6);
  for(let j=0;j<20&&hi-lo>360;j++){const mid=(lo+hi)/2,z=evaluate(mid);if(z.road.feasible&&z.road.range>=p.evTargetRange&&z.road.mass<=p.evGrossMass)hi=mid;else lo=mid;}
  const rounded=Math.min(massCapEnergy,Math.ceil(hi/3.6e6)*3.6e6),z=evaluate(rounded);
  if(z.road.feasible&&z.road.range>=p.evTargetRange-1&&z.road.mass<=p.evGrossMass+1e-9)minimum={energy_kwh:rounded/3.6e6,battery_mass_kg:z.pk.mass,range_km:z.road.range/1000,total_mass_kg:z.road.mass,payload_kg:p.evPayload,payload_available_kg:Math.max(0,p.evGrossMass-baseMass-z.pk.mass)};
 }
 // Case A holds battery and target range fixed; case C uses the current pair.
 const payloadCapacity=p.evGrossMass-baseMass-pk.mass,payloadCache=new Map();
 function evaluatePayload(payload){
  if(!payloadCache.has(payload)){
   const z=payload===p.evPayload?road:roadEnergy(p,e,pk,baseMass+pk.mass+payload,cycle,{rows:false});
   payloadCache.set(payload,{energy_kwh:pk.energy/3.6e6,battery_mass_kg:pk.mass,payload_kg:payload,payload_available_kg:Math.max(0,payloadCapacity),total_mass_kg:z.mass,range_km:z.range===null?null:z.range/1000,feasible:z.feasible,mass_ok:payload<=payloadCapacity+1e-9});
  }
  return payloadCache.get(payload);
 }
 const payloadSamples=payloadCapacity>=0?Array.from({length:33},(_,j)=>evaluatePayload(payloadCapacity*j/32)):[];
 const meetsPayload=q=>q.mass_ok&&q.feasible&&q.range_km!==null&&q.range_km>=p.evTargetRange/1000;
 let maximumPayload=null;
 const last=payloadSamples.findLast(meetsPayload);
 if(last){
  let lo=last.payload_kg,hi=payloadSamples[payloadSamples.indexOf(last)+1]?.payload_kg??lo;
  for(let j=0;j<24&&hi-lo>.001;j++){const mid=(lo+hi)/2;if(meetsPayload(evaluatePayload(mid)))lo=mid;else hi=mid;}
  const accepted=Math.floor((lo+1e-7));const q=evaluatePayload(accepted);
  if(meetsPayload(q))maximumPayload=q;
 }
 const payloadSweep=[...payloadSamples,evaluatePayload(p.evPayload),...(maximumPayload?[maximumPayload]:[])].filter((q,i,a)=>a.findIndex(z=>z.payload_kg===q.payload_kg)===i).sort((a,b)=>a.payload_kg-b.payload_kg);
 // Case B holds trip payload fixed and finds the largest feasible battery.
 const energyField=b.fields.find(f=>f.key==='batteryEnergy'),batteryCap=Math.min(massCapEnergy,energyField.max),batteryCache=new Map();
 function evaluateBattery(E){
  if(!batteryCache.has(E)){
   const z=evaluate(E);batteryCache.set(E,{energy_kwh:E/3.6e6,battery_mass_kg:z.pk.mass,payload_kg:p.evPayload,payload_available_kg:Math.max(0,p.evGrossMass-baseMass-z.pk.mass),total_mass_kg:z.road.mass,range_km:z.road.range===null?null:z.road.range/1000,feasible:z.road.feasible,mass_ok:z.road.mass<=p.evGrossMass+1e-9});
  }
  return batteryCache.get(E);
 }
 const batterySamples=batteryCap>=energyField.min?Array.from({length:33},(_,j)=>evaluateBattery(energyField.min+(batteryCap-energyField.min)*j/32)):[];
 const feasibleBattery=q=>q.mass_ok&&q.feasible&&q.range_km!==null;
 let maximumBattery=null;
 const lastBattery=batterySamples.findLast(feasibleBattery);
 if(lastBattery){
  let lo=lastBattery.energy_kwh*3.6e6,hi=(batterySamples[batterySamples.indexOf(lastBattery)+1]?.energy_kwh??lastBattery.energy_kwh)*3.6e6;
  const atCap=batterySamples.indexOf(lastBattery)===batterySamples.length-1;
  for(let j=0;j<24&&hi-lo>36;j++){const mid=(lo+hi)/2;if(feasibleBattery(evaluateBattery(mid)))lo=mid;else hi=mid;}
  const accepted=atCap?batteryCap:Math.floor(lo/3.6e6*100)/100*3.6e6,q=evaluateBattery(accepted);
  if(feasibleBattery(q))maximumBattery={...q,limit:atCap?(massCapEnergy<=energyField.max?'gross-mass':'energy-input'):'performance'};
 }
 const batterySweep=[...batterySamples,evaluateBattery(energy),...(maximumBattery?[maximumBattery]:[])].filter((q,i,a)=>a.findIndex(z=>z.energy_kwh===q.energy_kwh)===i).sort((a,b)=>a.energy_kwh-b.energy_kwh);
 const current=evaluatePayload(p.evPayload),cases={A:maximumPayload,B:maximumBattery,C:{...current,range_km:current.mass_ok&&current.feasible?current.range_km:null}};
 const designChoices={minimum,maximum:maxSampleRange?{...maxSampleRange,payload_kg:p.evPayload}:null,maximumPayload,maximumBattery,cases,batteryMassCeilingKg:Math.max(0,batteryCap/p.evSpecificEnergy),batteryEnergyCeilingKWh:Math.max(0,batteryCap/3.6e6),payloadCeilingKg:Math.max(0,payloadCapacity),requiredRangeKm:p.evTargetRange/1000,checkedSamples:sweep.length,payloadSamples:payloadSweep.length,batterySamples:batterySweep.length,method:'A: fixed installed battery and target range; greatest feasible payload bracket refined and rounded down to 1 kg. B: fixed payload; largest feasible battery bracket refined, rounded down to 0.01 kWh if performance-limited, or exact mass/input ceiling. C: range for the current battery and payload. All cases check route traction and gross mass; extrema are refined from checked intervals.'};

 const kinematicMax=p.motorMaxSpeed*2*Math.PI*p.wheelRadius/p.driveRatio*3.6;
 const speedRows=[];for(let k=5;k<=Math.min(350,Math.ceil(kinematicMax/5)*5);k+=5){const trace=[{time_s:0,speed_kmh:k,grade_ratio:p.grade},{time_s:3600,speed_kmh:k,grade_ratio:p.grade}],x=roadEnergy(p,e,pk,road.mass,trace,{rows:false});const rpm=k/3.6/p.wheelRadius*p.driveRatio*30/Math.PI,budget=batteryBudget(p,e,pk),q=boundedMotorSI(e.motor,rpm,1e6,p.inverterEfficiency,0,Math.min(budget.maxDC,p.evMotorCount*e.motor.maxDcW)/p.evMotorCount),available=q.ok?q.mechanicalW*p.evMotorCount*p.driveEfficiency/1000:0;speedRows.push({required_kw:roadLoadAt(p,road.mass,k/3.6,0,p.grade).wheelW/1000,available_kw:available,speed_kmh:k,range_km:x.range===null?null:x.range/1000,consumption_kwh100:x.consumptionKWh100,feasible:x.feasible});}
 let vmaxLo=0,vmaxHi=kinematicMax;for(let j=0;j<28;j++){const v=(vmaxLo+vmaxHi)/2,x=roadEnergy(p,e,pk,road.mass,[{time_s:0,speed_kmh:v,grade_ratio:p.grade},{time_s:3600,speed_kmh:v,grade_ratio:p.grade}],{rows:false});if(x.feasible)vmaxLo=v;else vmaxHi=v;}
 const rangeProfile=road.range===null?[]:Array.from({length:51},(_,j)=>{const fraction=j/50;return {distance_km:road.range*fraction/1000,soc_pct:100*(p.socInitial-(p.socInitial-p.socMin)*fraction),remaining_kwh:road.usableJ/3.6e6*(1-fraction),used_kwh:road.usableJ/3.6e6*fraction};});
 const targetMet=road.range!==null&&road.range>=p.evTargetRange-1,massOK=road.mass<=p.evGrossMass;
 const best=sweep.find(x=>x.mass_ok&&x.feasible&&x.range_km>=p.evTargetRange/1000)??null;
 e.range={...road,designChoices,payloadSweep,batterySweep,payloadMap,payloadMapAxes:{batteryMax:mapBatteryMax,payloadMax:mapPayloadMax,nx,ny},maxSampleRange,massBasis,curbMass:baseMass+pk.mass,payloadCapacity:Math.max(0,p.evGrossMass-baseMass-pk.mass),massReserve:p.evGrossMass-road.mass,maxBatteryMass:massBasis.maxBatteryMass,maxBatteryEnergy:massBasis.maxBatteryMass*p.evSpecificEnergy,pack:pk,baseMass,payload:p.evPayload,grossMass:p.evGrossMass,remainingPayload:Math.max(0,p.evGrossMass-baseMass-pk.mass),cycle:electricCycleInfo(p,b,cycle).name,cycleInfo:electricCycleInfo(p,b,cycle),driveRatio:p.driveRatio,kinematicMaxSpeed:kinematicMax,achievableMaxSpeed:vmaxLo,rangeProfile,acceleration:electricAcceleration(p,e,pk,road.mass),chargeEfficiency:p.evChargeEfficiency,electricOnly:true,hevBuffer:p.system==='hybrid'&&p.plugIn!=='yes',targetMet,massOK,iterations,sweep,speedRows,best,assumptions:'constant Voc/R; fixed ratio; no thermal model; cumulative peak allowance per cycle; electric-only with ICE off'};
 e.bevProcedures=bevProcedureCases(p,b,e,roadEnergy);
 e.checks=e.checks.filter(c=>c.id!=='battery-energy');
 e.checks.push({id:'ev-cycle-power',label:'Електричний маршрут: мотор, струми і час піку',pass:road.feasible,value:road.unmetJ,required:0,unit:'J'}, {id:'ev-mass',label:'Повна маса з батареєю і вантажем',pass:massOK,value:road.mass,required:p.evGrossMass,unit:'kg'},{id:'ev-energy-balance',label:'Електричний енергобаланс маршруту',pass:Math.abs(road.balanceResidual)<.01,value:road.balanceResidual,required:0,unit:'J'});
 if(p.evSizing==='range')e.checks.push({id:'ev-target-range',label:'Заданий електричний пробіг',pass:targetMet&&massOK,value:road.range??0,required:p.evTargetRange,unit:'m'});
 return e;
}
