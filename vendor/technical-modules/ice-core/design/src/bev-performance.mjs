import {boundedMotorSI,currentForPower} from './electric.mjs';

/** Optional forward experiment. Energy-based SOC, linear OCV/R vs SOC,
 * ideal speed-following driver, fixed temperature, fixed ratio, finite peak budget.
 * No manufacturer curve or homologation status is implied by these assumptions.
 */
export function experimentBattery(p,pk,soc,dt,rating='continuous'){
 const floor=p.bevCutoffSoc??.03,span=p.socMax-floor,u=Math.max(0,Math.min(1,(soc-floor)/span));
 const voltage=p.voltage*((p.bevLowVocRatio??.85)+(1-(p.bevLowVocRatio??.85))*u),resistance=p.resistance*(1+((p.bevLowResistanceFactor??2)-1)*(1-u));
 const disconnected=soc<=floor+1e-10;
 const maxI=disconnected?0:Math.max(0,Math.min(p.dischargeCurrent,resistance>0?(voltage-p.voltageMin)/resistance:voltage>=p.voltageMin?Infinity:0,resistance>0?voltage/(2*resistance):Infinity,(soc-floor)*pk.energy/(voltage*dt)));
 const chargeI=disconnected?0:Math.max(0,Math.min(p.chargeCurrent,resistance>0?(p.voltageMax-voltage)/resistance:Infinity,(p.socMax-soc)*pk.energy/(voltage*dt)));
 return {voltage,resistance,disconnected,maxW:Math.min((voltage-resistance*maxI)*maxI,rating==='peak'?pk.peakW:pk.continuousW),minW:-Math.min((voltage+resistance*chargeI)*chargeI,pk.chargeW)};
}
export function traceSpeed(trace,t){
 if(t<=trace[0].time_s)return trace[0].speed_kmh;
 if(t>=trace.at(-1).time_s)return trace.at(-1).speed_kmh;
 let lo=0,hi=trace.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(trace[mid].time_s>t)hi=mid;else lo=mid;}
 const a=trace[lo],z=trace[hi];return a.speed_kmh+(z.speed_kmh-a.speed_kmh)*(t-a.time_s)/(z.time_s-a.time_s);
}
export function traceTolerance(trace,t){
 const a=Math.max(0,t-1),z=Math.min(trace.at(-1).time_s,t+1),v=[traceSpeed(trace,a),traceSpeed(trace,z)];
 // Prescribed WLTC points are 1 s apart; CSS includes sparse ramp/hold boundaries.
 let lo=0,hi=trace.length;while(lo<hi){const m=(lo+hi)>>1;if(trace[m].time_s<a)lo=m+1;else hi=m;}
 for(let i=lo;i<trace.length&&trace[i].time_s<=z;i++)v.push(trace[i].speed_kmh);
 return {lower:Math.max(0,Math.min(...v)-2),upper:Math.max(...v)+2};
}
export function violationTimer(previous,actual,band,dt){return actual<band.lower-1e-8||actual>band.upper+1e-8?previous+dt:0;}

export function performanceProcedureCases(p,e,profile,definitions){
 const pk=e.range.pack,mass=e.range.mass,N=p.evMotorCount,m=e.motor,start=p.socMax,floor=p.bevCutoffSoc??.03,usable=pk.energy*(start-floor),cycle=profile.rows,city=cycle.filter(q=>q.time_s<=profile.cityDuration),speed=(p.bevCssSpeed??100/3.6)*3.6,acc=p.bevCssAcceleration??.5;
 const initial=()=>({t:0,d:0,chem:0,terminal:0,heat:0,v:0,peak:0,violation:0,maxViolation:0,violationSeconds:0,ended:false,feasible:true,event:null,stages:[],rows:[],tail:[],lastRecord:-1,minVoltage:Infinity});
 const clone=s=>({...s,stages:[],rows:[],tail:[],event:s.event?{...s.event}:null});
 function run(s,trace,label,{keep=true,step=.1,allowEnd=true}={}){
  if(s.ended)return null;
  const t0=s.t,d0=s.d,c0=s.chem,u0=s.terminal,h0=s.heat,duration=trace.at(-1).time_s;let t=0;
  const alpha=Math.atan(p.grade),normal=mass*9.80665*Math.cos(alpha),adhesion=p.evGrip*p.evDrivenMassFraction*normal,brakeLimit=p.evGrip*normal,effectiveMass=mass*p.evRotatingFactor;
  function record(requested,band,current=0,voltage=p.voltage,maxWheel=0){
   const row={time_s:s.t,time_min:s.t/60,distance_km:s.d/1000,speed_kmh:s.v*3.6,requested_speed_kmh:requested,lower_speed_kmh:band.lower,upper_speed_kmh:band.upper,speed_error_kmh:s.v*3.6-requested,soc_pct:100*(start-s.chem/pk.energy),chemical_used_kwh:s.chem/3.6e6,terminal_used_kwh:s.terminal/3.6e6,heat_kwh:s.heat/3.6e6,remaining_kwh:Math.max(0,usable-s.chem)/3.6e6,current_a:current,terminal_v:voltage,available_wheel_kw:maxWheel,violation_s:s.violation,segment:label};
   if(keep){s.tail.push(row);if(s.tail.length>Math.ceil(90/step)+2)s.tail.shift();if(s.t-s.lastRecord>=1-1e-8||s.ended||t>=duration-1e-8){s.rows.push(row);s.lastRecord=s.t;}}
  }
  if(keep&&!s.rows.length)record(traceSpeed(trace,0),traceTolerance(trace,0));
  while(t<duration-1e-8&&!s.ended){
   const dt=Math.min(step,duration-t),requested=traceSpeed(trace,t+dt),target=requested/3.6,soc=start-s.chem/pk.energy,v0=s.v;
   const battery=experimentBattery(p,pk,soc,dt),peakBattery=experimentBattery(p,pk,soc,dt,'peak');
   const aux=Math.min(p.auxPower,Math.max(0,battery.maxW));
   const vEval=Math.max(0,(v0+target)/2),rpm=vEval/p.wheelRadius*p.driveRatio*30/Math.PI;
   const resistanceForce=mass*9.80665*(p.rolling*Math.cos(alpha)+Math.sin(alpha))+.5*1.225*p.cdArea*vEval*vEval;
   const neededForce=effectiveMass*(target-v0)/dt+resistanceForce;
   // Regeneration is only a share of achievable braking, at the driven wheels.
   // A missed trace must not turn the driver's requested deceleration into energy.
   const brakingForce=Math.max(-brakeLimit,neededForce);
   const regenForce=Math.max(-adhesion,brakingForce*p.evRegenFraction);
   const requiredTorque=neededForce>=0?neededForce*p.wheelRadius/(N*p.driveRatio*p.driveEfficiency):regenForce*p.wheelRadius*p.driveEfficiency/(N*p.driveRatio);
   const point=(budget,rating)=>boundedMotorSI(m,Math.min(rpm,m.maxRpm),requiredTorque,p.inverterEfficiency,Math.max((budget.minW-aux)/N,-m.maxDcW),Math.max(0,Math.min((budget.maxW-aux)/N,m.maxDcW)),rating);
   const cont=point(battery,'continuous'),wantsPeak=neededForce>0&&(!cont.ok||cont.torqueNm<requiredTorque-1e-6),peak=wantsPeak&&s.peak+dt<=pk.peakSeconds+1e-8;
   let q=peak?point(peakBattery,'peak'):cont;const activeBattery=peak?peakBattery:battery;
   if(peak)s.peak+=dt;
   let force=q.ok&&!battery.disconnected?(neededForce>=0?Math.min(adhesion,q.torqueNm*N*p.driveRatio*p.driveEfficiency/p.wheelRadius):q.torqueNm*N*p.driveRatio/(p.driveEfficiency*p.wheelRadius)):0;
   if(rpm>m.maxRpm&&force>0)force=0;
   // Friction brakes supply the requested remainder; regeneration remains limited.
   const totalForce=neededForce<0?brakingForce:Math.max(0,force);
   const next=Math.max(0,Math.min(neededForce>=0?target:Infinity,v0+(totalForce-resistanceForce)/effectiveMass*dt));
   const mid=(v0+next)/2,actualRpm=mid/p.wheelRadius*p.driveRatio*30/Math.PI;
   if(neededForce>=0&&q.ok){const torque=force*p.wheelRadius/(N*p.driveRatio*p.driveEfficiency);q=boundedMotorSI(m,Math.min(actualRpm,m.maxRpm),torque,p.inverterEfficiency,Math.max((activeBattery.minW-aux)/N,-m.maxDcW),Math.max(0,Math.min((activeBattery.maxW-aux)/N,m.maxDcW)),peak?'peak':'continuous');}
   if(neededForce<0&&Math.abs(next-target)>1e-9)q=boundedMotorSI(m,actualRpm,requiredTorque,p.inverterEfficiency,Math.max((activeBattery.minW-aux)/N,-m.maxDcW),Math.max(0,Math.min((activeBattery.maxW-aux)/N,m.maxDcW)));
   let dc=battery.disconnected?0:(q.ok?q.dcW*N:0)+aux;
   dc=Math.max(activeBattery.minW,Math.min(activeBattery.maxW,dc));
   const current=currentForPower(activeBattery,dc);
   if(current===null||!Number.isFinite(current)){s.feasible=false;s.ended=true;s.event={code:'electrical-error',time_s:s.t};break;}
   const chemical=activeBattery.voltage*current*dt,heat=activeBattery.resistance*current*current*dt;
   s.chem+=chemical;s.terminal+=dc*dt;s.heat+=heat;s.d+=mid*dt;s.v=next;s.t+=dt;t+=dt;
   const terminalV=activeBattery.voltage-activeBattery.resistance*current;s.minVoltage=Math.min(s.minVoltage,terminalV);
   const band=traceTolerance(trace,t);s.violation=violationTimer(s.violation,s.v*3.6,band,dt);s.maxViolation=Math.max(s.maxViolation,s.violation);if(s.violation>0)s.violationSeconds+=dt;
   if(s.violation>=4-1e-8){s.ended=true;s.feasible=allowEnd;s.event={code:allowEnd?'speed-tolerance':'early-speed-tolerance',segment:label,time_s:s.t,distance_km:s.d/1000,soc:Math.max(floor,start-s.chem/pk.energy),requested_kmh:requested,actual_kmh:s.v*3.6,lower_kmh:band.lower,upper_kmh:band.upper,consecutive_seconds:s.violation,batteryDisconnected:battery.disconnected,terminal_v:terminalV,braking_seconds:s.v/2,limit:battery.disconnected?'BMS cutoff':s.peak>=pk.peakSeconds-1e-8?'battery/continuous motor/rpm/adhesion':'battery/motor/rpm/adhesion'};}
   record(requested,band,current,terminalV,Math.max(0,(activeBattery.maxW-aux)*p.inverterEfficiency*p.driveEfficiency/1000));
   if(s.t>=180000&&!s.ended){s.ended=true;s.feasible=false;s.event={code:'time-limit',time_s:s.t};}
  }
  const stage={segment:label,start_s:t0,end_s:s.t,duration_s:s.t-t0,distance_km:(s.d-d0)/1000,chemical_kwh:(s.chem-c0)/3.6e6,terminal_kwh:(s.terminal-u0)/3.6e6,heat_kwh:(s.heat-h0)/3.6e6,end_soc_pct:100*(start-s.chem/pk.energy),completed:t>=duration-1e-7};s.stages.push(stage);return stage;
 }
 function css(hold,brake){
  const ramp=speed/3.6/acc;return [{time_s:0,speed_kmh:0},{time_s:ramp,speed_kmh:speed},...(hold>0?[{time_s:ramp+hold,speed_kmh:speed}]:[]),...(brake?[{time_s:2*ramp+hold,speed_kmh:0}]:[])];
 }
 const reason=s=>s.event?.code==='speed-tolerance'?'Поза допуском швидкості протягом 4 с':s.event?.code==='early-speed-tolerance'?'Втрата швидкості до завершального CSS_E':s.event?.code==='time-limit'?'Обчислювальна межа 50 год':'Випробування не завершено';
 function result(s,id,ec,weights=null,message=null){
  const completed=s.event?.code==='speed-tolerance',feasible=s.feasible&&ec>0&&completed&&!message,range=feasible?s.terminal/3600/ec:null;
  return {id,termination:'performance',rows:s.rows,endTrace:s.tail,event:s.event,stages:s.stages,startSoc:start,endSoc:start-s.chem/pk.energy,usableChemicalKWh:usable/3.6e6,chemicalKWh:s.chem/3.6e6,terminalKWh:s.terminal/3.6e6,heatKWh:s.heat/3.6e6,balanceResidualJ:s.chem-s.terminal-s.heat,testDistanceKm:s.d/1000,timeSeconds:s.t,feasible,completed,stopReason:message??reason(s),dcWhKm:ec,weights,rangeKm:range,rechargeKWh:s.chem/3.6e6/p.evChargeEfficiency,acKWh100:range===null?null:s.chem/3.6e6/p.evChargeEfficiency/range*100,peakSeconds:s.peak,minTerminalVoltage:Number.isFinite(s.minVoltage)?s.minVoltage:null,violationSeconds:s.violationSeconds};
 }
 let full=null,short=null;
 if(['full','both'].includes(p.bevProcedure??'both')){
  const s=initial();let n=0;while(!s.ended&&n<100)run(s,cycle,'WLTC_'+(++n));
  const complete=s.stages.filter(q=>q.completed),dist=complete.reduce((v,q)=>v+q.distance_km,0),energy=complete.reduce((v,q)=>v+q.terminal_kwh,0),ec=dist>0?energy*1000/dist:null;
  full={...result(s,'full',ec,null,dist>0?null:'Не завершено жодного WLTC; перевірте тягу та батарею'),completeCycles:complete.length,cycleAttempts:n};
 }
 if(['short','both'].includes(p.bevProcedure??'both')){
  let s=initial(),message=null,hold=0;
  if(speed<profile.cssMinimum-1e-7)message='CSS нижче мінімуму '+profile.cssMinimum.toFixed(1)+' км/год для цього профілю.';
  if(profile.capKmh!==null&&speed>profile.capKmh+1e-7)message='CSS перевищує введену граничну швидкість автомобіля.';
  if(speed/3.6/acc>60+1e-7)message='Перехід до CSS триває понад 60 с; збільшіть прискорення або зменшіть CSS.';
  if(!message){
   run(s,cycle,'DS1_WLTC',{allowEnd:false});run(s,city,'DS1_CITY',{allowEnd:false});
   if(s.ended)message='Перший динамічний сегмент не виконано: перевірте тягу та батарею.';
   else{
    const anchor=s;
    const trial=(h,step,keep)=>{const z=clone(anchor);run(z,css(h,true),'CSS_M',{step,keep,allowEnd:false});run(z,cycle,'DS2_WLTC',{step,keep,allowEnd:false});run(z,city,'DS2_CITY',{step,keep,allowEnd:false});run(z,css(180000,false),'CSS_E',{step,keep});return z;};
    const fraction=z=>z.event?.code==='speed-tolerance'?(z.stages.find(q=>q.segment==='CSS_E')?.terminal_kwh??0)/(z.terminal/3.6e6):null;
    const zero=trial(0,1,false);
    if(fraction(zero)===null)message='Батарея/тяга не забезпечує два динамічні сегменти та кінцевий CSS.';
    else{
     let lo=0,hi=Math.max(1,zero.t-anchor.t);if(fraction(zero)>.05)for(let j=0;j<13;j++){const mid=(lo+hi)/2,z=trial(mid,1,false),share=fraction(z);if(share!==null&&share>.05)lo=mid;else hi=mid;}
     hold=lo;const final=trial(hold,.1,true);s={...final,rows:[...anchor.rows,...final.rows],stages:[...anchor.stages,...final.stages]};
     if(fraction(s)===null)message='Скорочений випадок не досяг коректного завершення у CSS_E.';
     else if(fraction(s)>.1+1e-6)message='Частка енергії CSS_E перевищила 10%; скорочений випадок не підтверджено.';
    }
   }
  }
  const a=s.stages.find(q=>q.segment==='DS1_WLTC'),z=s.stages.find(q=>q.segment==='DS2_WLTC'),last=s.stages.find(q=>q.segment==='CSS_E'),k=a&&s.terminal>0?a.terminal_kwh*3.6e6/s.terminal:null;
  const ec=a?.completed&&z?.completed&&k!==null?(k*a.terminal_kwh/a.distance_km+(1-k)*z.terminal_kwh/z.distance_km)*1000:null;
  short={...result(s,'short',ec,k===null?null:[k,1-k],message),cssSpeedKmh:speed,cssHoldSeconds:hold,finalTerminalFraction:last&&s.terminal>0?last.terminal_kwh*3.6e6/s.terminal:null};
 }
 return {full,short,termination:'performance',startSoc:start,endSoc:null,cutoffSoc:floor,cssSpeedKmh:speed,cssAcceleration:acc,traceDuration:profile.duration,cityDuration:profile.cityDuration,phaseSpeeds:profile.phases,profile,definitions,method:'Forward 0.1 s; ideal driver; linear energy-SOC OCV/R; fixed temperature; finite cumulative peak budget; +/-2 km/h over +/-1 s envelope; 4 consecutive seconds; shortened end permitted only in CSS_E; user parameters are assumptions, not manufacturer data; AC charging estimated; no certification.'};
}
