/** Backward, quasi-static mission calculation. The prescribed speed is NOT made feasible by clipping.
 * Positive battery power/current = discharge; positive wheel/shaft power = propulsion.
 * Optional pack SOC/T dynamics are explicit; OEM control, shift transients and validated launch performance are not claimed.
 */
import {RPM_TO_RAD,envelope,fuel,operatingPoint} from './engine.mjs';
import {motorEnvelope,boundedMotor,motorPower} from './motor.mjs';
import {validateBatteryModel} from './battery-map.mjs';
import {batteryLimits,batteryStep} from './battery.mjs';
import {G,roadLoad,validateCycle,validateConfig} from './vehicle.mjs';
export function components(p,bundle){
 const engine=structuredClone(bundle.engines.find(x=>x.id===p.engineId));
 const motor=structuredClone(bundle.motors.find(x=>x.id===p.motorId));
 if(bundle.importedFuel){if(bundle.importedFuel.componentId!==p.engineId)throw Error('Паливна карта належить іншому ДВЗ: перевірте componentId.');engine.kind='grid';engine.map=bundle.importedFuel;engine.minRpm=engine.map.operatingMinRpm??engine.map.rpm[0];engine.maxRpm=engine.map.operatingMaxRpm??engine.map.rpm.at(-1);engine.lhvJkg=engine.map.lhvJkg;engine.fuelDensityKgL=engine.map.fuelDensityKgL;engine.name=engine.map.id;engine.source=engine.map.source;engine.sourceClass=engine.map.evidence??'user-imported-map';engine.maxPowerKW=Math.max(...engine.map.rpm.map((n,i)=>engine.map.maxTorqueNm[i]===null?0:n*RPM_TO_RAD*engine.map.maxTorqueNm[i]))/1000;}
 if(bundle.importedMotor){if(bundle.importedMotor.componentId!==p.motorId)throw Error('Карта втрат належить іншому компоненту: перевірте componentId.');motor.map=bundle.importedMotor;motor.name+=' / '+motor.map.id;}
 engine.limitNm=p.engineLimitNm;engine.limitKW=p.engineLimitKW;
 engine.minRpm=Math.max(engine.minRpm,p.engineLowerRpm);engine.maxRpm=Math.min(engine.maxRpm,p.engineUpperRpm);
 engine.maxPowerKW=Math.min(engine.maxPowerKW,p.engineLimitKW);
 motor.maxDcW=p.inverterMaxKW*1000;
 motor.peakPhaseArms=Math.min(motor.peakPhaseArms,p.inverterPeakArms);
 motor.continuousPhaseArms=Math.min(motor.continuousPhaseArms,p.inverterContinuousArms);
 const batteryModel=p.architecture!=='ice'&&bundle.importedBattery?validateBatteryModel(bundle.importedBattery):null;
 if(batteryModel&&(Math.abs(p.batteryKWh-batteryModel.capacityAh*batteryModel.nominalVoltageV/1000)>1e-7||Math.abs(p.voltage-batteryModel.nominalVoltageV)>1e-7))throw Error('Узгодьте видимі номінальні kWh/V з імпортованою Ah/V картою через явну підстановку.');
 if(batteryModel&&(p.socMin<batteryModel.soc[0]||p.socMax>batteryModel.soc.at(-1)))throw Error('Межі SOC виходять за імпортовану карту.');
 return {engine,motor,fit:bundle.motorFit,batteryModel};
}
function gear(p,v,force,engine,motor,on,rating){
 if(['bev','series'].includes(p.architecture))return p.motorRatio;
 const ratios=[3.5,2.1,1.4,1,.8].map(x=>x*p.finalDrive);
 const w=v/p.wheelRadius;
 if(v<.1)return ratios[0];
 const choices=ratios.map(r=>{const n=w*r/RPM_TO_RAD;
  const maxT=(p.architecture==='ice'||on?envelope(engine,Math.max(n,engine.minRpm)):0)+(p.architecture==='ice'?0:motorEnvelope(motor,n,rating)*p.motorCount);
  const auxTorque=p.architecture==='ice'?p.auxKW*1000/(Math.max(n,engine.minRpm)*RPM_TO_RAD):0;
  const capacity=Math.max(0,maxT-auxTorque)*r*p.transmissionEfficiency/p.wheelRadius;
  return {r,n,capacity,score:Math.max(0,force-capacity)*100+Math.abs(n-(on?2500:2000)),valid:n<=(p.architecture==='ice'?engine.maxRpm:motor.maxRpm)&&(p.architecture!=='ice'||n<=engine.maxRpm)};
 }).filter(x=>x.valid);
 return choices.sort((a,b)=>a.score-b.score)[0]?.r??ratios.at(-1);
}
const zeroMotor=()=>({ok:true,torque:0,mechanicalW:0,dcW:0,motorLossW:0,inverterLossW:0,extrapolated:false});
/** Evaluate a point without changing the caller's controller state. */
export function solvePoint(p,c,{v,force,soc,dt=1,engineOn=false,gradePct=0,rating='continuous',temperatureK}){
 const bp=c.batteryModel?{...p,batteryModel:c.batteryModel}:p;
 const {engine,motor,fit}=c,hybrid=['parallel','series'].includes(p.architecture),electric=p.architecture!=='ice';
 const demandW=force*v,braking=force<0,stopped=v<1e-9;
 let on=engineOn;
 if(hybrid){if(soc<=p.targetSoc-.02)on=true;else if(soc>=p.targetSoc+.02)on=false;
  if(demandW>p.evThresholdKW*1000)on=true;if(braking)on=false;}
 else on=p.architecture==='ice'&&!braking;
 const ratio=gear(p,v,Math.max(0,force),engine,motor,on,rating),n=v/p.wheelRadius*ratio/RPM_TO_RAD,w=n*RPM_TO_RAD;
 if(p.architecture==='parallel'&&n<engine.minRpm)on=false; // P2 engine decoupled below stable speed, no invented launch clutch.
 const eta=p.transmissionEfficiency,theta=Math.atan(gradePct/100),normal=p.mass*G*Math.cos(theta);
 const grip=p.adhesion*p.drivenFraction*normal,brakeGrip=p.adhesion*normal;
 const requestedForce=stopped&&force===0?0:braking?Math.max(force,-brakeGrip):Math.min(force,grip);
 const ts=requestedForce*p.wheelRadius/ratio*(braking?eta:1/eta);
 const limit=electric?batteryLimits(bp,soc,dt,temperatureK):{minW:0,maxW:0};
 const aux=p.auxKW*1000;
 let mot=zeroMotor(),te=0,engineN=0,enginePowerW=0,generatorW=0,generatorLossW=0,clutchLossW=0,auxFromEngineW=0;
 let mapFailure=null,ff={kgS:0,known:true};
 if(p.architecture==='ice'){
  if(!braking){engineN=Math.max(n,engine.minRpm);const cap=envelope(engine,engineN);
   // Ideal slipping clutch below idle; explicit heat loss. Auxiliary shaft equivalent is separate.
   auxFromEngineW=aux;const auxT=aux/(engineN*RPM_TO_RAD);
   te=Math.min(Math.max(0,ts),Math.max(0,cap-auxT));enginePowerW=te*engineN*RPM_TO_RAD+aux;
   clutchLossW=te*(engineN*RPM_TO_RAD-w);ff=fuel(engine,engineN,te+auxT);}
  else if(aux>0){engineN=engine.minRpm;auxFromEngineW=aux;enginePowerW=aux;ff=fuel(engine,engineN,aux/(engineN*RPM_TO_RAD));on=true;} // explicit idling/declutched auxiliary supply, not fuel-cut
 }else if(p.architecture==='series'){
  let generatedTarget=0;
  if(on){const wheelShaftW=Math.max(0,ts*w),powerDC=wheelShaftW/.90+aux;
   generatedTarget=Math.min(p.generatorMaxKW*1000,engine.maxPowerKW*1000*p.generatorEfficiency,
    Math.max(p.preferredEngineKW*1000*p.generatorEfficiency,powerDC+(soc<p.targetSoc?p.chargeMarginKW*1000:0)));
   generatedTarget=Math.min(generatedTarget,Math.max(0,powerDC-limit.minW));}
  generatorW=generatedTarget;
  mot=boundedMotor(motor,fit,n,ts,p.motorCount,p.inverterEfficiency,limit.minW+generatorW-aux,limit.maxW+generatorW-aux,rating);
  // A battery at its upper limit cannot absorb surplus generator power. Reduce the generator first.
  if(!mot.ok&&mot.reason==='unabsorbable-generation'){
   const raw=motorPower(motor,fit,n,Math.max(-motorEnvelope(motor,n,rating),Math.min(motorEnvelope(motor,n,rating),ts/p.motorCount)),p.inverterEfficiency);
   if(raw.ok){generatorW=Math.max(0,Math.min(generatorW,raw.dcW*p.motorCount+aux-limit.minW));
    mot=boundedMotor(motor,fit,n,ts,p.motorCount,p.inverterEfficiency,limit.minW+generatorW-aux,limit.maxW+generatorW-aux,rating);}}
  if(mot.ok)generatorW=Math.max(0,Math.min(generatorW,mot.dcW+aux-limit.minW));
  const op=operatingPoint(engine,generatorW/(1000*p.generatorEfficiency));
  if(!op){generatorW=0;on=false;mot=boundedMotor(motor,fit,n,ts,p.motorCount,p.inverterEfficiency,limit.minW-aux,limit.maxW-aux,rating);mapFailure='generator-engine-point';}
  else {engineN=op.rpm;te=op.torque;enginePowerW=op.powerKW*1000;ff={kgS:op.fuelKgS,known:op.fuelKnown};}
  generatorLossW=enginePowerW-generatorW;
 }else if(p.architecture==='parallel'){
  const cap=on?envelope(engine,n):0;
  if(on&&w>0)te=Math.min(cap,Math.max(0,ts)+(soc<p.targetSoc?p.chargeMarginKW*1000/w:0));
  mot=boundedMotor(motor,fit,n,ts-te,p.motorCount,p.inverterEfficiency,limit.minW-aux,limit.maxW-aux,rating);
  if(mot.ok&&on){te=Math.max(0,Math.min(cap,ts-mot.torque)); // reduce charging or fill a motor-limited propulsion request
   mot=boundedMotor(motor,fit,n,ts-te,p.motorCount,p.inverterEfficiency,limit.minW-aux,limit.maxW-aux,rating);}
  engineN=te>0?n:0;enginePowerW=te*w;ff=fuel(engine,n,te,te>0);
 }else mot=boundedMotor(motor,fit,n,ts,p.motorCount,p.inverterEfficiency,limit.minW-aux,limit.maxW-aux,rating);
 if(!mot.ok){mapFailure=mapFailure??mot.reason;mot=zeroMotor();}
 // Regenerative braking cannot propel the vehicle. Friction brakes supply the remaining deceleration.
 let shaftTorque=p.architecture==='series'||p.architecture==='bev'?mot.torque:te+mot.torque;
 let wheelFromDrive=shaftTorque*ratio/p.wheelRadius*(shaftTorque>=0?eta:1/eta);
 // Limit regeneration to the driven axle's available grip; the rest is mechanical braking.
 if(braking&&wheelFromDrive < -grip && electric){
  mot=boundedMotor(motor,fit,n,-grip*p.wheelRadius/ratio*eta,p.motorCount,p.inverterEfficiency,limit.minW+generatorW-aux,limit.maxW+generatorW-aux,rating);
  if(!mot.ok){mapFailure=mot.reason;mot=zeroMotor();}
  shaftTorque=mot.torque;wheelFromDrive=shaftTorque*ratio/p.wheelRadius/eta;
 }
 const frictionForce=braking?Math.max(0,wheelFromDrive-requestedForce):0;
 const deliveredForce=wheelFromDrive-frictionForce;
 const wheelDriveW=wheelFromDrive*v,frictionBrakeW=frictionForce*v;
 const gearboxLossW=shaftTorque*w-wheelDriveW;
 const unservedForce=force-deliveredForce;
 const bat=electric?batteryStep(bp,soc,mot.dcW+aux-generatorW,dt,temperatureK):{soc,current:0,terminalV:p.voltage,terminalW:0,chemicalW:0,heatW:0,unservedW:0,limited:false};
 const demandServedW=deliveredForce*v;
 const mechanicalResidual=enginePowerW+mot.mechanicalW-generatorW-generatorLossW-clutchLossW-auxFromEngineW-gearboxLossW-demandServedW-frictionBrakeW;
 // The series motor and engine are different shafts, so enginePowerW cancels generator + generator loss here.
 const electricalResidual=electric?generatorW+bat.terminalW-mot.dcW-aux:0;
 return {engineOn:on,ratio,motorRpm:electric?n:0,engineRpm:engineN,engineTorqueNm:te,motorTorqueNm:mot.torque,
  enginePowerW,motorPowerW:mot.mechanicalW,generatorW,generatorLossW,clutchLossW,auxFromEngineW,
  wheelDemandW:demandW,wheelDeliveredW:demandServedW,requiredForce:force,deliveredForce,
  gearboxLossW,motorLossW:mot.motorLossW,inverterLossW:mot.inverterLossW,frictionBrakeW,
  fuelKgS:ff.kgS,fuelKnown:ff.known,motorExtrapolated:electric&&mot.extrapolated,mapFailure,
  unmetW:Math.abs(unservedForce)*v,unservedForce,battery:bat,mechanicalResidual,electricalResidual,
  auxiliaryUnservedW:Math.abs(bat.unservedW),voltageBelowReference:electric&&mot.mechanicalW>0&&bat.terminalV<motor.voltageRequired};
}
export function simulateMission(params,bundle,cycle){
 const p=validateConfig(params,bundle),frames=validateCycle(cycle),c=components(p,bundle),rows=[];
 const steps=frames.slice(1).reduce((s,x,i)=>s+Math.ceil(x.time_s-frames[i].time_s),0);if(steps>20000)throw Error('Місія перевищує 20000 внутрішніх кроків: розділіть маршрут на коротші фрагменти.');
 let temperatureK=c.batteryModel?.thermal.initialK,thermalStoredJ=0,coolingJ=0,chargeAs=0,maxTemperatureK=temperatureK??null,fuelUnknownSeconds=0,mapFailureSeconds=0,firstUncovered=null;
 let soc=p.initialSoc,on=false,distance=0,fuelKg=0,fuelKnown=true,unmetJ=0,unmetSeconds=0,auxUnservedJ=0;
 let batteryTerminalJ=0,batteryChemicalJ=0,regenJ=0,regenDCJ=0,brakingBatteryChargeJ=0,engineChargingJ=0,frictionJ=0,heatJ=0,motorExtrapolationSeconds=0,voltageLimitedSeconds=0;
 let maxMechanicalResidualW=0,maxElectricalResidualW=0,mapFailures=0;
 for(let i=1;i<frames.length;i++){
  const a=frames[i-1],b=frames[i],dt=b.time_s-a.time_s,sub=Math.ceil(dt/1); // Rint/SOC constraints at <=1 s
  for(let j=0;j<sub;j++){
   const h=dt/sub,f=(j+.5)/sub,v0=(a.speed_kmh+(b.speed_kmh-a.speed_kmh)*j/sub)/3.6;
   const v=(a.speed_kmh+(b.speed_kmh-a.speed_kmh)*f)/3.6,acc=(b.speed_kmh-a.speed_kmh)/3.6/dt,gradePct=a.grade_pct+(b.grade_pct-a.grade_pct)*f;
   const load=roadLoad(p,v,acc,gradePct),force=v===0&&acc===0?0:load.force;
   const q=solvePoint(p,c,{v,force,soc,dt:h,engineOn:on,gradePct,temperatureK});
   const startSoc=soc;if(q.battery.temperatureK!==undefined){temperatureK=q.battery.temperatureK;maxTemperatureK=Math.max(maxTemperatureK,temperatureK);thermalStoredJ+=q.battery.storedJ;coolingJ+=q.battery.coolingJ;}chargeAs+=q.battery.current*h;soc=q.battery.soc;on=q.engineOn;distance+=v*h;
   if(q.fuelKnown)fuelKg+=q.fuelKgS*h;else{fuelKnown=false;fuelUnknownSeconds+=h;}if(q.mapFailure){mapFailureSeconds+=h;}if(firstUncovered===null&&(!q.fuelKnown||q.mapFailure))firstUncovered={time_s:a.time_s+j*h,engineRpm:q.engineRpm,engineTorqueNm:q.engineTorqueNm,reason:q.mapFailure??'fuel-unknown'};
   unmetJ+=q.unmetW*h;if(q.unmetW>10||q.auxiliaryUnservedW>1)unmetSeconds+=h;
   auxUnservedJ+=q.auxiliaryUnservedW*h;batteryTerminalJ+=q.battery.terminalW*h;batteryChemicalJ+=q.battery.chemicalW*h;
   regenJ+=(q.wheelDemandW<0?Math.max(0,-q.motorPowerW):0)*h;regenDCJ+=(q.wheelDemandW<0?Math.max(0,-(q.motorPowerW+q.motorLossW+q.inverterLossW)):0)*h;brakingBatteryChargeJ+=(q.wheelDemandW<0?Math.max(0,-q.battery.terminalW):0)*h;engineChargingJ+=(q.wheelDemandW>=0?Math.max(0,-q.motorPowerW):0)*h;frictionJ+=q.frictionBrakeW*h;heatJ+=q.battery.heatW*h;
   if(q.motorExtrapolated)motorExtrapolationSeconds+=h;if(q.voltageBelowReference)voltageLimitedSeconds+=h;
   maxMechanicalResidualW=Math.max(maxMechanicalResidualW,Math.abs(q.mechanicalResidual));maxElectricalResidualW=Math.max(maxElectricalResidualW,Math.abs(q.electricalResidual));if(q.mapFailure)mapFailures++;
   rows.push({time_s:a.time_s+(j+1)*h,speed_kmh:v*3.6,grade_pct:gradePct,soc,startSoc,
    batteryKW:q.battery.terminalW/1000,batteryCurrentA:q.battery.current,batteryVoltageV:q.battery.terminalV,batteryTemperatureK:temperatureK??null,
    engineKW:q.enginePowerW/1000,motorKW:q.motorPowerW/1000,generatorKW:q.generatorW/1000,
    wheelKW:q.wheelDemandW/1000,deliveredKW:q.wheelDeliveredW/1000,unmetKW:q.unmetW/1000,
    fuelGs:q.fuelKgS===null?null:q.fuelKgS*1000,engineRpm:q.engineRpm,motorRpm:q.motorRpm,
    engineTorqueNm:q.engineTorqueNm,motorTorqueNm:q.motorTorqueNm,
    regenKW:(q.wheelDemandW<0?Math.max(0,-q.motorPowerW):0)/1000,frictionBrakeKW:q.frictionBrakeW/1000,
    lossKW:(q.gearboxLossW+q.motorLossW+q.inverterLossW+q.battery.heatW+q.generatorLossW+q.clutchLossW)/1000,
    mapFailure:q.mapFailure,extrapolated:q.motorExtrapolated,auxiliaryUnservedKW:q.auxiliaryUnservedW/1000});
  }
 }
 const km=distance/1000,hours=(frames.at(-1).time_s-frames[0].time_s)/3600,feasible=unmetSeconds<1e-9&&mapFailures===0;
 const fuelLitres=fuelKnown?fuelKg/c.engine.fuelDensityKgL:null;
 return {params:p,components:c,rows,summary:{distanceKm:km,durationS:hours*3600,initialSoc:p.initialSoc,finalSoc:soc,socDelta:soc-p.initialSoc,
  feasible,fuelKnown,fuelEvidence:p.architecture==='bev'?'not-applicable':c.engine.kind==='willans'?'user-OBD-II-MAF-lambda-reference':c.engine.kind==='grid'?(c.engine.map.evidence??'user-imported-map-provenance'):c.engine.kind==='calculated'?'current-project-model':'no-fuel-map',fuelKg:fuelKnown?fuelKg:null,fuelLitres,
  fuelL100km:fuelKnown&&km>0?fuelLitres/km*100:null,batteryKWh:batteryTerminalJ/3.6e6,batteryChemicalKWh:batteryChemicalJ/3.6e6,
  batteryKWh100km:km>0?batteryTerminalJ/3.6e6/km*100:null,regenMechanicalKWh:regenJ/3.6e6,regenDCkWh:regenDCJ/3.6e6,brakingBatteryChargeKWh:brakingBatteryChargeJ/3.6e6,engineChargingMechanicalKWh:engineChargingJ/3.6e6,frictionBrakeKWh:frictionJ/3.6e6,
  batteryHeatKWh:heatJ/3.6e6,unmetKWh:unmetJ/3.6e6,unmetSeconds,auxUnservedKWh:auxUnservedJ/3.6e6,
  motorExtrapolationSeconds,voltageLimitedSeconds,mapFailures,fuelUnknownSeconds,mapFailureSeconds,firstUncovered,mapCoverage:{fuelKnownFraction:hours>0?1-fuelUnknownSeconds/(hours*3600):null,motorDataFailureFraction:hours>0?mapFailureSeconds/(hours*3600):null,definition:'Time fractions, not fractions of independently measured cells'},maxMechanicalResidualW,maxElectricalResidualW,
  batteryEnergyResidualKWh:c.batteryModel?(batteryChemicalJ-batteryTerminalJ-heatJ)/3.6e6:p.batteryKWh*(p.initialSoc-soc)-batteryChemicalJ/3.6e6,
  batteryEnergyResidualDefinition:c.batteryModel?'integrated OCV*I minus terminal energy and Joule heat':'nominal energy times SOC change minus chemical energy',
  batteryChargeResidualAh:(c.batteryModel?.capacityAh??p.batteryKWh*1000/p.voltage)*(p.initialSoc-soc)-chargeAs/3600,
  batteryModel:c.batteryModel?{id:c.batteryModel.id,capacityAh:c.batteryModel.capacityAh,nominalVoltageV:c.batteryModel.nominalVoltageV,evidence:c.batteryModel.evidence,source:c.batteryModel.source}:null,initialBatteryTemperatureK:c.batteryModel?.thermal.initialK??null,finalBatteryTemperatureK:temperatureK??null,maxBatteryTemperatureK:maxTemperatureK,batteryCoolingKWh:coolingJ/3.6e6,batteryThermalResidualKWh:c.batteryModel?(heatJ-thermalStoredJ-coolingJ)/3.6e6:null,
  chargeSustaining:Math.abs(soc-p.initialSoc)<.005,control:'illustrative-rule-based-not-OEM',rating:'continuous',
  note:'Задана швидкість; якщо feasible=false, це невиконане завдання, а не досягнутий пробіг/витрата.'}};
}
export function performance(params,bundle){
 const p=validateConfig(params,bundle),c=components(p,bundle),rows=[];
 for(let v=1;v<=180;v+=2){const x=v/3.6,road=roadLoad(p,x,0,p.designGrade);
  const q=solvePoint(p,c,{v:x,force:1e6,soc:p.initialSoc,engineOn:true,rating:'continuous'});
  const peak=solvePoint(p,c,{v:x,force:1e6,soc:p.initialSoc,engineOn:true,rating:'peak'});
  rows.push({speed_kmh:v,requiredKW:road.powerW/1000,availableContinuousKW:q.wheelDeliveredW/1000,availablePeakKW:peak.wheelDeliveredW/1000,
   continuousForceN:q.deliveredForce,peakForceN:peak.deliveredForce,acceleration:(q.deliveredForce-road.force)/(p.mass*p.rotatingMassFactor)});
 }
 const v=p.designSpeed/3.6,load=roadLoad(p,v,p.designAcceleration,p.designGrade);
 const point=solvePoint(p,c,{v,force:load.force,soc:p.initialSoc,engineOn:true,gradePct:p.designGrade,rating:'continuous'});
 const cruiseLoad=roadLoad(p,v,0,0),cruise=solvePoint({...p,architecture:'bev'},c,{v,force:cruiseLoad.force,soc:p.initialSoc,engineOn:false,rating:'continuous'});
 const range=!c.batteryModel&&p.architecture==='bev'&&cruise.unmetW<10&&cruise.battery.chemicalW>0? p.batteryKWh*(p.initialSoc-p.socMin)/(cruise.battery.chemicalW/1000)*p.designSpeed:null;
 return {rows,design:{speedKMH:p.designSpeed,gradePct:p.designGrade,acceleration:p.designAcceleration,forceN:load.force,wheelKW:load.powerW/1000,
  requiredShaftKW:load.powerW/(p.transmissionEfficiency*1000),deliveredKW:point.wheelDeliveredW/1000,unmetKW:point.unmetW/1000,
  batteryCurrentA:point.battery.current,rangeKmSteadyEstimate:range,rangeStatus:c.batteryModel?'not-evaluated-requires-state-integrated-range':'constant-speed-no-temperature-no-accessory-variation'},point};
}
