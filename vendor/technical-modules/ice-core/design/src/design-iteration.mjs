import {sizeEngine,enginePoint,engineSpeed,cylinderTorqueAt} from './ice.mjs';
import {dynamics} from '../../src/cycle.mjs';
import {calculateDesign} from './project.mjs';
import {motorPoint,motorEnvelopeSI,currentForPower} from './electric.mjs';
const up=(x,step)=>Math.ceil((x-1e-12)/step)*step;
export function matchesIterationParams(p,a){return !!a&&Object.keys(p).every(key=>typeof p[key]==='number'&&typeof a[key]==='number'?Math.abs(p[key]-a[key])<=1e-10*Math.max(1e-12,Math.abs(p[key]),Math.abs(a[key])):p[key]===a[key]);}
/** Select new preliminary current ratings, not new pass thresholds or pack properties. */
export function selectElectricalRatings(p,electric,fields){
 const m={...electric.motor,continuousPhaseArms:Infinity},count=electric.motorCount;
 const speeds=[...new Set([m.baseRpm,p.ratedSpeed*60,...Array.from({length:61},(_,i)=>m.maxRpm*i/60)])].filter(n=>n<=m.maxRpm);
 const envelope=speeds.map(rpm=>({rpm,...motorPoint(m,rpm,motorEnvelopeSI(m,rpm),p.inverterEfficiency)}));
 const peakDC=Math.max(...envelope.map(q=>q.dcW)),packDC=peakDC*count+p.auxPower;
 const batteryA=currentForPower(p,packDC),terminalV=batteryA===null?null:p.voltage-p.resistance*batteryA;
 if(batteryA===null||terminalV<p.voltageMin)throw Error('Потрібна потужність недоступна за заданих напруги та опору батареї. Оберіть інший пакет; електричні межі не змінено.');
 if(electric.powerLimits&&packDC>electric.powerLimits.continuousW)throw Error('Пакет не забезпечує потрібну тривалу потужність. Потрібен інший пакет або більша енергоємність у межах маси; властивості батареї не змінено.');
 const demand={phaseCurrent:Math.max(...envelope.map(q=>q.phaseCurrent)),inverterCurrent:peakDC/p.voltageMin,dischargeCurrent:batteryA};
 const selected={};for(const [key,value]of Object.entries(demand)){
  const rating=p[key]>=value?p[key]:up(value*1.10,25),field=fields.find(f=>f.key===key);
  if(!Number.isFinite(rating)||rating>(field?.max??p[key]))throw Error('Потрібний номінал виходить за межі поля '+(field?.number??key));
  selected[key]=rating;
 }
 if((p.evPeakPhaseCurrent??p.phaseCurrent)<selected.phaseCurrent)selected.evPeakPhaseCurrent=selected.phaseCurrent;
 return {selected,demand,envelope,packDC,terminalV,margin:1.10,ratingStepA:25};
}
export function mechanicalScreen(rows,p,L){
 const hi=Math.max(...rows.map(x=>x.rod)),lo=Math.min(...rows.map(x=>x.rod)),F=Math.max(hi,-lo),M=Math.max(...rows.map(x=>Math.abs(x.torqueSum)));
 const a=(hi-lo)/(2*p.rodArea),mean=Math.max(0,-(hi+lo)/(2*p.rodArea));
 const euler=Math.PI**2*p.youngModulus*p.rodIy/(p.rodLengthFactor*L)**2,Ip=Math.PI*(p.pinOuter**4-p.pinInner**4)/64;
 const ratios={goodman:p.stressConcentration*(a/p.enduranceStress+mean/p.ultimateStress),euler:hi/euler,eulerDomain:(euler/p.rodArea)/(.6*p.yieldStress),pinBending:p.stressConcentration*F*p.pinSpan*p.pinOuter/(8*Ip*p.yieldStress),pinBearing:F/(p.pinOuter*p.pinBearingLength*p.bearingAllowable),shaft:p.stressConcentration*16*M/(Math.PI*p.shaftOuter**3*p.shearAllowable)};
 return {hi,lo,F,M,ratios,pass:Object.values(ratios).every(x=>Number.isFinite(x)&&x<=1)};
}
/** Bounded preliminary design iteration. Requirements and material limits are immutable.
 * Geometry is sized against the highest sampled speed. Mass feedback uses a uniform
 * steel rod body (one third reciprocating) and a hollow pin of length span + bearing.
 * This is an explicit mass estimate, not a manufactured-part mass or validated life.
 */
export async function iterateDesign(candidate,bundle,{onProgress=()=>{},maxGeometryIterations=18,maxMechanicalIterations=24}={}){
 const before={...candidate},p={...candidate},history=[];
 const progress=async stage=>{onProgress(stage);await new Promise(resolve=>setTimeout(resolve,0));};
 const fixed=['targetPower','ratedSpeed','hybridEngineTarget','generatorEngineSpeed','cylinders','engineCycle','fuelType','pmaxLimit','pistonSpeedLimit','youngModulus','yieldStress','ultimateStress','enduranceStress','bearingAllowable','shearAllowable','stressConcentration','rodLengthFactor','evPayload','evTargetRange','evGrossMass','mass','evMassMode','evTareRatio','evReferencePayload','evReferenceBatteryEnergy','evReferenceSpecificEnergy','evSizing','batteryEnergy','evSpecificEnergy','evSpecificPower','evSpecificPeakPower','voltage','voltageMin','voltageMax','resistance','socInitial','socMin','socMax','inverterEfficiency','driveEfficiency','evMaxSpeed','missionCycle','vehicleSpeed','motorBaseSpeed','motorMaxSpeed'];
 if(p.mode!=='design')throw Error('Підбір компонентів потребує проєктного режиму. У перевірному режимі зберігаються параметри наявного обладнання.');
 let size=null,points=[],envelope=[];
 if(p.system!=='electric'){
  if(p.mode!=='design'||!['computed','rounded'].includes(p.adoption))throw Error('Підбір потребує проєктного режиму з обчисленою геометрією.');
  const n=engineSpeed(p),nmax=Math.max(n,p.sweepMaxSpeed*60),minRatio=p.fuelType==='diesel'?.75:.70;
  let geometryOK=false;
  for(let k=0;k<maxGeometryIterations;k++){
   await progress(`Геометрія: ітерація ${k+1}`);size=sizeEngine(p);
   const cm=size.adopted.stroke*nmax/30;history.push({stage:'geometry',iteration:k+1,strokeBore:p.strokeBore,intakePressure:p.intakePressure,scavengePressure:p.scavengePressure,bore:size.adopted.bore,stroke:size.adopted.stroke,maxPistonSpeed:cm});
   if(cm<=p.pistonSpeedLimit*.98){geometryOK=true;break;}
   if(p.strokeBore>minRatio+.001){p.strokeBore=Math.max(minRatio,Math.round((p.strokeBore-.05)*100)/100);continue;}
   if(p.engineCycle==='two-stroke'){p.scavengePressure=up(p.scavengePressure*1.08,5000);if(p.scavengePressure>400000)break;}
   else if(p.compressor!=='none'){const ratio=p.exhaustPressure/p.intakePressure;p.intakePressure=up(p.intakePressure*1.08,5000);p.exhaustPressure=up(p.intakePressure*ratio,1000);if(p.intakePressure>400000||p.exhaustPressure>450000)break;}
   else break;
  }
  if(!geometryOK)throw Error('Не знайдено геометрію в заданих межах. Вимогу потужності й межу швидкості поршня не змінено.');
  const speeds=[...new Set([n,...bundle.speedSampling.map(f=>60*(p.sweepMinSpeed+(p.sweepMaxSpeed-p.sweepMinSpeed)*f))])].sort((a,b)=>a-b);
  await progress('Перевірка циклу в усіх точках швидкісної сітки');
  points=speeds.map(rpm=>Math.abs(rpm-n)<1e-7?size.point:enginePoint({...size.point.params,rpm}));
  if(points.some(q=>q.summary.pmax>p.pmaxLimit))throw Error('Тиск перевищує задану межу на швидкісній сітці; потрібна інша термодинамічна конфігурація.');
  const L=size.point.params.rod,oldL=before.strokeBore?sizeEngine(before).point.params.rod:L,rho=7850;
  const pinMass=x=>rho*Math.PI/4*(x.pinOuter**2-x.pinInner**2)*(x.pinSpan+x.pinBearingLength);
  const oldPin=pinMass(before),oldRod=rho*before.rodArea*oldL;
  let mechanicalOK=false;
  for(let k=0;k<maxMechanicalIterations;k++){
   await progress(`Механічні розміри: ітерація ${k+1}`);
   envelope=points.map(q=>{const cp={...q.params,recipMass:p.recipMass},rows=dynamics(q.rows,cp);for(const row of rows)Object.assign(row,cylinderTorqueAt(rows,cp,row.theta));return {rpm:cp.rpm,...mechanicalScreen(rows,p,L),pmax:q.summary.pmax,meanPistonSpeed:p.strokeBore?size.adopted.stroke*cp.rpm/30:q.summary.cm};});
   const worst={hi:Math.max(...envelope.map(x=>x.hi)),F:Math.max(...envelope.map(x=>x.F)),M:Math.max(...envelope.map(x=>x.M)),goodman:Math.max(...envelope.map(x=>x.ratios.goodman))};
   history.push({stage:'mechanical',iteration:k+1,recipMass:p.recipMass,rodArea:p.rodArea,rodIy:p.rodIy,pinOuter:p.pinOuter,pinBearingLength:p.pinBearingLength,pinSpan:p.pinSpan,shaftOuter:p.shaftOuter,worstRatios:Object.fromEntries(Object.keys(envelope[0].ratios).map(key=>[key,Math.max(...envelope.map(x=>x.ratios[key]))]))});
   if(envelope.every(x=>x.pass)&&k>0){mechanicalOK=true;break;}
   p.rodArea=up(Math.max(p.rodArea*worst.goodman/.78,worst.hi/(.78*.48*p.yieldStress)),25e-6);
   // A chosen elastic critical stress keeps Euler inside the original domain gate.
   p.rodIy=Math.floor((.48*p.yieldStress*p.rodArea*(p.rodLengthFactor*L)**2/(Math.PI**2*p.youngModulus))/50e-12)*50e-12;
   p.pinOuter=Math.max(p.pinOuter,up(.30*size.adopted.bore,.001));
   for(let j=0;j<40;j++){
    p.pinBearingLength=Math.max(before.pinBearingLength,up(worst.F/(.78*p.bearingAllowable*p.pinOuter),.001));
    p.pinSpan=Math.max(before.pinSpan,up(p.pinBearingLength+0.010,.001));
    const Ip=Math.PI*(p.pinOuter**4-p.pinInner**4)/64,bend=p.stressConcentration*worst.F*p.pinSpan*p.pinOuter/(8*Ip*p.yieldStress);
    if(bend<=.78)break;p.pinOuter+=.001;
   }
   p.shaftOuter=Math.max(before.shaftOuter,up((16*p.stressConcentration*worst.M/(Math.PI*.78*p.shearAllowable))**(1/3),.001));
   p.recipMass=up(before.recipMass+Math.max(0,pinMass(p)-oldPin)+Math.max(0,rho*p.rodArea*L-oldRod)/3,.01);
   if(p.pinOuter>Math.min(.1,.55*size.adopted.bore)||p.pinSpan+p.pinBearingLength>1.2*size.adopted.bore||p.recipMass>20)throw Error('Підбір вийшов за межі початкової геометричної сумісності.');
  }
  if(!mechanicalOK)throw Error('Ітерації механічних розмірів не збіглися; невиконані перевірки залишаються відкритими.');
 }
 await progress('Повторний повний розрахунок');let result=calculateDesign(p,bundle);
 let electricalSelection=null;
 if(result.electric){
  await progress('Підбір номінальних струмів мотора, інвертора та батареї');
  electricalSelection=selectElectricalRatings(p,result.electric,bundle.fields);
  Object.assign(p,electricalSelection.selected);history.push({stage:'electrical-ratings',...electricalSelection});
  result=calculateDesign(p,bundle);
 }
 // A different explicitly adopted synchronous-machine inductance, not relaxed electrical limits.
 if(result.supplements.firstOrder.checks.some(x=>x.id==='dq-point'&&x.pass!==true)){
  for(const factor of [1,.9,.8,.7,.6,.5,.4]){
   p.inductanceD=before.inductanceD*factor;p.inductanceQ=before.inductanceQ*factor;result=calculateDesign(p,bundle);history.push({stage:'dq',inductanceD:p.inductanceD,inductanceQ:p.inductanceQ});
   if(result.supplements.firstOrder.checks.find(x=>x.id==='dq-point')?.pass===true)break;
  }
 }
 for(const key of fixed)if(p[key]!==before[key])throw Error('Неприпустима зміна вимоги: '+key);
 const checks=[...result.checks,...result.supplements.firstOrder.checks],failed=checks.filter(x=>x.pass!==true);
 if(failed.length)throw Error('Залишилися перевірки: '+failed.map(x=>x.id).join(', '));
 const changes=Object.keys(p).filter(key=>p[key]!==before[key]).map(key=>({key,before:before[key],after:p[key]}));
 const audit={schema:'ice-design-iteration/1',before,params:p,changes,history,envelope,checks,electricalSelection,scope:'All supplied speed-grid points; preliminary model checks only',massAssumptions:{densityKgM3:7850,rodReciprocatingFraction:1/3,pinLength:'span + bearing length'},unchangedRequirements:fixed};
 result.iterationAudit=audit;return {params:p,result,audit};
}
