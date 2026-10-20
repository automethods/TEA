import {VERSION} from './schema.mjs';
/** Bounded first-order engineering models and explicit map use cases.
 * Definitions/assumptions are in manuscript chunks and Data CSV; figures/report never recompute physics.
 */
import {pmsmPoint} from './engineering-review.mjs';
import {makeTransfer,importTransfer} from './transfer.mjs';
import {installComponent} from '../../powertrain/src/component-package.mjs';
import {engineDefaults} from '../../powertrain/src/setup.mjs';
import {fuel,envelope} from '../../powertrain/src/engine.mjs';
import {lookup} from '../../powertrain/src/maps.mjs';
import {simulateMission} from '../../powertrain/src/simulation.mjs';
export function fatigueLife(amplitude,mean,p){
 const denom=1-p.stressConcentration*Math.max(0,mean)/p.ultimateStress;
 if(denom<=0)return {status:'outside-goodman-domain',cycles:null,equivalentPa:null,exponent:Math.log(p.snAmplitude2/p.snAmplitude1)/Math.log(p.snCycles2/p.snCycles1)};
 const eq=p.stressConcentration*amplitude/denom;
 const n1=p.snCycles1,n2=p.snCycles2,s1=p.snAmplitude1,s2=p.snAmplitude2;
 const exponent=Math.log(s2/s1)/Math.log(n2/n1);
 if(eq<s2)return {status:'below-sn-amplitude-range',cycles:null,lowerBoundCycles:n2,equivalentPa:eq,exponent};
 if(eq>s1)return {status:'above-sn-amplitude-range',cycles:null,upperBoundCycles:n1,equivalentPa:eq,exponent};
 const cycles=n1*(eq/s1)**(1/exponent);return {status:'interpolated-assumed-sn',cycles,equivalentPa:eq,exponent};
}
export function controllerResponse(command,tau,dt,duration){
 if(!(tau>0&&dt>0&&duration>0&&duration/dt<=20000&&Number.isFinite(command)))throw Error('Invalid first-order response inputs');
 const rows=[{time_s:0,command_w:command,output_w:0}];let y=0,t=0;
 while(t<duration-1e-10){const h=Math.min(dt,duration-t);y=command+(y-command)*Math.exp(-h/tau);t+=h;rows.push({time_s:t,command_w:command,output_w:y});}
 return {rows,command,tau,dt,duration,output:y,residual:Math.abs(y-command*(1-Math.exp(-duration/tau))),status:'assumed-first-order-response'};
}
export function addSupplements(g,p,ice,electric,b,{characteristics=true}={}){
 const check=(id,label,pass,value,limit,unit)=>({id,label,pass,value,required:limit,unit});
 const extra={firstOrder:{checks:[]},control:null,map:null,mission:null,datasets:{}};
 const ext=(key,v,u,label,ch,dependencies,source='first-order-theory')=>g.external('result.'+key,v,u,label,ch,dependencies,source);
 if(ice){
  const rows=ice.point.rows,hi=Math.max(...rows.map(x=>x.rod)),lo=Math.min(...rows.map(x=>x.rod));
  const period=ice.point.params.period;
  ext('rodMax',hi,'N',`Найбільша сила стиску шатуна за ${period}°`,'12-strength',['result.maxRodForce']);
  ext('rodMin',lo,'N',`Найменша сила стиску шатуна за ${period}°`,'12-strength',['result.maxRodForce']);
  g.calculate('value.rod_stress_amplitude');g.calculate('value.rod_stress_mean');
  ext('tensileMean',Math.max(0,g.values['value.rod_stress_mean']),'Pa','Розтягальна частина середнього напруження','12-strength',['value.rod_stress_mean']);
  for(const id of ['goodman_utilization','euler_force','pin_second_moment','pin_bending','pin_bearing'])g.calculate('value.'+id);
  ext('peakIndTorque',Math.max(...rows.map(x=>Math.abs(x.torqueSum))),'N*m','Максимальний модуль сумарного індикаторного моменту','12-strength',['value.mean_indicated_torque']);g.calculate('value.shaft_shear');
  const v=g.values,elastic=v['value.euler_force']/p.rodArea<=.6*p.yieldStress;
  const life=fatigueLife(v['value.rod_stress_amplitude'],v['value.rod_stress_mean'],p),rpm=ice.point.params.rpm;
  extra.firstOrder.life={...life,hours:life.cycles===null?null:life.cycles*period/(21600*rpm),rpm,cycleDeg:period,scope:`Repeated single ${period}° block, assumed S-N; not experimentally validated life`};
  extra.firstOrder.checks.push(check('rod-goodman','Шатун: умовний критерій Goodman',v['value.goodman_utilization']<=1,v['value.goodman_utilization'],1),check('rod-euler','Шатун: Euler лише у пружній області',elastic?hi<=v['value.euler_force']:null,hi,v['value.euler_force'],'N'),check('pin-bending','Палець: умовний згин',v['value.pin_bending']<=p.yieldStress,v['value.pin_bending'],p.yieldStress,'Pa'),check('pin-bearing','Палець: середній тиск',v['value.pin_bearing']<=p.bearingAllowable,v['value.pin_bearing'],p.bearingAllowable,'Pa'),check('shaft-torsion','Еквівалентний вал: лише кручення',v['value.shaft_shear']<=p.shearAllowable,v['value.shaft_shear'],p.shearAllowable,'Pa'));
  extra.firstOrder.eulerApplicable=elastic;
  extra.firstOrder.sn=Array.from({length:41},(_,i)=>{const N=p.snCycles1*(p.snCycles2/p.snCycles1)**(i/40);return {cycles:N,log_cycles:Math.log10(N),amplitude_pa:p.snAmplitude1*(N/p.snCycles1)**life.exponent};});
  extra.datasets['dataset.sn-assumed']=extra.firstOrder.sn;
 }
 g.calculate('value.control_command');extra.control=controllerResponse(g.values['value.control_command'],p.controlTau,p.controlStep,p.controlDuration);extra.datasets['dataset.control-response']=extra.control.rows;
 if(electric){
  for(const id of ['em_current_peak','em_voltage_peak','em_gap_shear','em_diameter','em_length'])g.calculate('value.'+id);
  const spec={source:'Data/design-defaults.csv: author assumptions; no OEM identification',evidence:'assumed-example',polePairs:p.polePairs,LdH:p.inductanceD,LqH:p.inductanceQ,fluxWb:p.fluxLinkage,currentPeakA:g.values['value.em_current_peak'],voltagePhasePeakV:g.values['value.em_voltage_peak'],resistanceOhm:p.phaseResistance,idMinA:-g.values['value.em_current_peak'],idMaxA:0};
  extra.firstOrder.dq=pmsmPoint(spec,p.ratedSpeed*60,g.values['value.motor_req_torque'],{samples:401});
  extra.firstOrder.dqCurve=Array.from({length:21},(_,i)=>{const rpm=(i+1)*p.ratedSpeed*60/21,q=pmsmPoint(spec,rpm,g.values['value.motor_req_torque'],{samples:201});return {rpm,current_peak_a:q.point?.currentPeakA??null,voltage_peak_v:q.point?.voltagePhasePeakV??null,id_a:q.point?.idA??null,iq_a:q.point?.iqA??null};});
  extra.firstOrder.checks.push(check('dq-point','Електромашина: точка на обмеженій dq-сітці',extra.firstOrder.dq.point?true:null));extra.datasets['dataset.dq-screen']=extra.firstOrder.dqCurve;
 }
 g.calculate('value.map_power');
 if(p.system!=='electric'){
  const packet=b.componentBundle?.sourcePackages?.find(x=>x.component.id===p.mapReference);if(packet){
   const e=packet.component,f=fuel(e,p.mapSpeed*60,p.mapTorque),rows=[];
   for(const n of e.map.rpm)for(const T of e.map.torqueNm){const q=fuel(e,n,T),P=n*Math.PI/30*T;if(q.known&&P>0&&q.kgS>0)rows.push({rpm:n,torque_nm:T,power_w:P,fuel_kg_s:q.kgS,bsfc_g_kwh:q.kgS*3.6e9/P,efficiency:P/(q.kgS*e.lhvJkg)});}
   extra.map={engine:e.id,source:e.source,evidence:e.sourceClass,point:f,rows,operatingEnvelope:e.map.operatingEnvelope,availableTorque:envelope(e,p.mapSpeed*60),scope:'Reference component only, does not replace the current engine cycle'};extra.datasets['dataset.epa-map']=rows;
   if(f.known&&f.kgS>0){ext('mapFuel',f.kgS,'kg/s','Інтерпольована витрата конкретного компонента','11-maps',['input.mapSpeed','input.mapTorque'],'epa-intake');ext('mapLhv',e.lhvJkg,'J/kg','Нижча теплота згоряння палива карти','11-maps',[],'epa-intake');g.calculate('value.map_bsfc');g.calculate('value.map_efficiency');}
  }
 }else if(b.boltMap){
  const m=b.boltMap,point=lookup(m,p.mapSpeed*60,p.mapTorque),power=g.values['value.map_power'];const rows=[];
  for(const n of m.rpm)for(const T of m.torqueNm){const q=lookup(m,n,T),P=n*Math.PI/30*T;if(q.ok&&P>0)rows.push({rpm:n,torque_nm:T,loss_w:q.value,efficiency:P/(P+q.value)});}
  extra.map={engine:m.componentId,source:m.source,evidence:m.evidence,point,rows,mechanicalW:power,efficiency:point.ok?power/(power+point.value):null,scope:'MOTO at source voltage 350 V; motoring only; no inverter or reduction'};extra.datasets['dataset.epa-map']=rows;
 }
 if(p.vehicleEnabled==='yes'&&characteristics&&b.componentBundle&&!(electric?.range)){
  try{
   const provisional={version:VERSION,params:p,ice,electric,inputRevision:g.revision,calculationRevision:g.revision,sourceRevision:b.sourceRevision};
   let {bundle,params:cfg}=importTransfer(makeTransfer(provisional),b.componentBundle);
   if(p.system!=='electric'&&p.missionEngine!=='model'){
    const packet=b.componentBundle.sourcePackages.find(x=>x.component.id===p.missionEngine);if(!packet)throw Error('Пакет EPA не встановлений');
    const diesel=packet.component.id.includes('diesel');if(diesel!==(p.fuelType==='diesel'))throw Error('Паливо вибраної карти не відповідає типу ДВЗ. Виберіть узгоджену карту.');
    bundle=installComponent(packet,bundle);cfg={...cfg,...engineDefaults(bundle,packet.component.id)};
   }
   const cyc=b.componentBundle.cycleCatalog.find(c=>c.id===p.missionCycle);if(!cyc)throw Error('Невідомий їздовий цикл');
   const mission=simulateMission(cfg,bundle,cyc.rows);extra.mission={...mission,cycle:cyc.id,cycleTitle:cyc.title??cyc.id,engineSource:p.system==='electric'?'no-engine':p.missionEngine==='model'?'current-project-model':p.missionEngine,sourceRevision:b.sourceRevision,designInputRevision:g.revision};extra.datasets['dataset.vehicle-mission']=mission.rows;
  }catch(e){extra.mission={status:'not-calculated',error:e.message};}
 }
 return extra;
}
