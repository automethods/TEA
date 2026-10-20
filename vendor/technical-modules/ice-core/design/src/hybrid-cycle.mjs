/** Simplified, explicit demand-following hybrid comparison. No gearbox, OEM control or WLTP weighting.
 * Uses the current calculated fuel curves, current motor, same vehicle mass/route, and Rint battery.
 * Engine share is an input; unused share falls to the motor. Fuel is never extrapolated.
 */
import {electricCycle,roadLoadAt} from './ev-road-load.mjs';
import {boundedMotorSI,motorPoint} from './electric.mjs';
import {batteryLimits,batteryStep} from '../../powertrain/src/battery.mjs';
import {fuel,envelope} from '../../powertrain/src/engine.mjs';
export function hybridRoadCycle(p,e,ice,b){
 const x=e.range,cycle=electricCycle(p,b),count=p.evMotorCount,m=e.motor,pk=x.pack;
 const engine={kind:'calculated',minRpm:ice.speed[0].rpm,maxRpm:ice.speed.at(-1).rpm,rpm:ice.speed.map(q=>q.rpm),torqueNm:ice.speed.map(q=>q.meanTorque),fuelCurves:ice.fuelCurves};
 const engineAt=(rpm,wantedW)=>{
  if(wantedW<=0||rpm<engine.minRpm||rpm>engine.maxRpm)return {powerW:0,kgS:0,rpm:0,torqueNm:0};
  const i=engine.fuelCurves.findIndex(q=>q.rpm>=rpm),a=engine.fuelCurves[Math.max(0,i-1)],z=engine.fuelCurves[i];
  if(!a?.points.length||!z?.points.length)return {powerW:0,kgS:0,rpm:0,torqueNm:0};
  const minT=Math.max(a.points[0].torqueNm,z.points[0].torqueNm,0),maxT=Math.min(a.points.at(-1).torqueNm,z.points.at(-1).torqueNm,envelope(engine,rpm));
  const omega=rpm*Math.PI/30,T=Math.min(maxT,wantedW/omega);
  if(T<minT||T<=0)return {powerW:0,kgS:0,rpm:0,torqueNm:0};
  const f=fuel(engine,rpm,T);if(!f.known)throw Error('Гібридний цикл: точка поза обчисленою паливною областю.');
  return {powerW:T*omega,kgS:f.kgS,rpm,torqueNm:T};
 };
 let soc=p.socInitial,distance=0,fuelKg=0,chemicalJ=0,terminalJ=0,heatJ=0,engineJ=0,generatorJ=0,motorJ=0,unmetJ=0,positiveJ=0,auxUnmetJ=0,peakSeconds=0,onSeconds=0,speedSeconds=0,maxDcResidual=0;
 const rows=[];const share=p.hybridCycleMode==='electric'?0:p.hybridEngineShare;
 for(let j=1;j<cycle.length;j++){
  const a=cycle[j-1],z=cycle[j],span=z.time_s-a.time_s,n=Math.ceil(span),dt=span/n,acc=(z.speed_kmh-a.speed_kmh)/3.6/span;
  for(let k=0;k<n;k++){
   const fraction=(k+.5)/n,v=(a.speed_kmh+(z.speed_kmh-a.speed_kmh)*fraction)/3.6,grade=(a.grade_ratio??0)+((z.grade_ratio??0)-(a.grade_ratio??0))*fraction;
   const road=roadLoadAt(p,x.mass,v,acc,grade),rpm=v/p.wheelRadius*x.driveRatio*30/Math.PI,w=rpm*Math.PI/30;
   const shaft=road.wheelW>=0?road.wheelW/p.driveEfficiency:road.wheelW*p.driveEfficiency*p.evRegenFraction;
   const limits=batteryLimits(e.battery,soc,dt),lo=Math.max(limits.minW,-pk.chargeW),s1hi=Math.min(limits.maxW,pk.continuousW),peakhi=Math.min(limits.maxW,pk.peakW);
   let eng={powerW:0,kgS:0,rpm:0,torqueNm:0},genW=0;
   if(shaft>0&&share>0){
    if(p.topology==='series'){
     const request=motorPoint(m,rpm,w>0?shaft/w/count:0,p.inverterEfficiency).dcW*count+p.auxPower;
     eng=engineAt(p.generatorEngineSpeed*60,Math.min(p.generatorLimit,request*share)/p.generatorEfficiency);genW=eng.powerW*p.generatorEfficiency;
    }else eng=engineAt(rpm,shaft*share);
   }
   const motorWanted=shaft-(p.topology==='parallel'?eng.powerW:0),T=w>0?motorWanted/w/count:0;
   const solve=(hi,rating)=>boundedMotorSI(m,rpm,T,p.inverterEfficiency,Math.max(-m.maxDcW,(lo+genW-p.auxPower)/count),Math.min(m.maxDcW,(hi+genW-p.auxPower)/count),rating);
   let q=solve(s1hi,'continuous');const needPeak=motorWanted>0&&(!q.ok||q.mechanicalW*count<motorWanted-1);
   if(needPeak&&peakSeconds+dt<=pk.peakSeconds+1e-9){q=solve(peakhi,'peak');peakSeconds+=dt;}
   const motorW=q.ok?q.mechanicalW*count:0,dcW=q.ok?q.dcW*count:0,batteryRequested=dcW+p.auxPower-genW;
   const bat=batteryStep(e.battery,soc,batteryRequested,dt);soc=bat.soc;
   const deliveredShaft=motorW+(p.topology==='parallel'?eng.powerW:0),shortfall=shaft>0?Math.max(0,shaft-deliveredShaft):0,deficit=shortfall<1?0:shortfall;
   const wheelDeficit=deficit*p.driveEfficiency;
   if(rpm>m.maxRpm+1e-7)speedSeconds+=dt;
   auxUnmetJ+=Math.abs(bat.unservedW)*dt;maxDcResidual=Math.max(maxDcResidual,Math.abs(genW+bat.terminalW-dcW-p.auxPower+bat.unservedW));
   distance+=v*dt;fuelKg+=eng.kgS*dt;chemicalJ+=bat.chemicalW*dt;terminalJ+=bat.terminalW*dt;heatJ+=bat.heatW*dt;engineJ+=eng.powerW*dt;generatorJ+=genW*dt;motorJ+=motorW*dt;unmetJ+=wheelDeficit*dt;positiveJ+=Math.max(0,road.wheelW)*dt;if(eng.powerW>0)onSeconds+=dt;
   rows.push({time_s:a.time_s+(k+1)*dt,speed_kmh:(a.speed_kmh+(z.speed_kmh-a.speed_kmh)*(k+1)/n),distance_km:distance/1000,wheel_kw:road.wheelW/1000,engine_kw:eng.powerW/1000,generator_kw:genW/1000,motor_kw:motorW/1000,battery_kw:bat.terminalW/1000,deficit_kw:wheelDeficit/1000,deficit_pct:road.wheelW>0?100*wheelDeficit/road.wheelW:0,fuel_g_s:eng.kgS*1000,engine_rpm:eng.rpm,engine_torque_nm:eng.torqueNm,fuel_l:fuelKg/p.fuelDensity*1000,chemical_kwh:chemicalJ/3.6e6,soc,current_a:bat.current,terminal_v:bat.terminalV,fuel_l100:distance>=1000?fuelKg/p.fuelDensity*1e8/distance:null,battery_kwh100:distance>=1000?chemicalJ/distance/36:null});
  }
 }
 const feasible=unmetJ<Math.max(1,positiveJ*1e-6)&&auxUnmetJ<1&&speedSeconds===0;
 return {rows,cycle:x.cycle,mass:x.mass,mode:p.hybridCycleMode,engineShare:share,scope:'single-cycle demand-following; no charge-sustaining or WLTP utility-factor correction',distance,fuelKg,fuelL:fuelKg/p.fuelDensity*1000,fuelL100:distance>0?fuelKg/p.fuelDensity*1e8/distance:null,chemicalJ,terminalJ,heatJ,engineJ,generatorJ,motorJ,batteryKWh100:distance>0?chemicalJ/distance/36:null,gridRecoveryKWh100:distance>0?Math.max(0,chemicalJ)/distance/36/p.evChargeEfficiency:null,initialSoc:p.socInitial,finalSoc:soc,deltaSoc:soc-p.socInitial,onSeconds,peakSeconds,unmetJ,deficitPercent:positiveJ>0?100*unmetJ/positiveJ:0,auxUnmetJ,speedSeconds,feasible,maxDcResidual,balanceResidual:chemicalJ-terminalJ-heatJ,socResidual:pk.energy*(p.socInitial-soc)-chemicalJ};
}
