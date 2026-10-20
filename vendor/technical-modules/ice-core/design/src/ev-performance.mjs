import {boundedMotorSI,currentForPower} from './electric.mjs';
import {batteryLimits} from '../../powertrain/src/battery.mjs';
/** Forward, full-load acceleration with a fixed reduction and explicit adhesion. */
export function electricAcceleration(p,e,pk,mass){
 const dt=.05,limit=180,target=100/3.6,N=p.evMotorCount,rows=[{time_s:0,speed_kmh:0,distance_m:0,soc_pct:p.socInitial*100}],alpha=Math.atan(p.grade);
 const adhesion=p.evGrip*p.evDrivenMassFraction*mass*9.80665*Math.cos(alpha),rpmLimit=e.motor.maxRpm;
 let t=0,v=0,distance=0,energy=0,peakTime=0,time100=null,reason='time-limit';
 while(t<limit&&v<target){
  const soc=p.socInitial-energy/pk.energy;if(soc<=p.socMin){reason='battery-depleted';break;}
  const rpm=v/p.wheelRadius*p.driveRatio*30/Math.PI,limits=batteryLimits(e.battery,soc,dt),peak=t<pk.peakSeconds;
  const budget=Math.min(limits.maxW,peak?pk.peakW:pk.continuousW)-p.auxPower;
  const q=boundedMotorSI(e.motor,rpm,1e6,p.inverterEfficiency,0,Math.min(budget/N,e.motor.maxDcW),peak?'peak':'continuous');
  const force=q.ok?Math.min(adhesion,Math.max(0,q.torqueNm)*N*p.driveRatio*p.driveEfficiency/p.wheelRadius):0;
  const resistance=mass*9.80665*(p.rolling*Math.cos(alpha)+Math.sin(alpha))+.5*1.225*p.cdArea*v*v,acc=(force-resistance)/(mass*p.evRotatingFactor);
  if(acc<=.0001){reason='force-limit';break;}
  const maxV=rpmLimit*Math.PI/30*p.wheelRadius/p.driveRatio;let step=dt,next=Math.min(maxV,v+acc*dt);
  if(next>=target){step=(target-v)/acc;next=target;time100=t+step;reason='reached';}
  const torque=force*p.wheelRadius/(N*p.driveRatio*p.driveEfficiency),actual=boundedMotorSI(e.motor,rpm,torque,p.inverterEfficiency,0,Math.min(budget/N,e.motor.maxDcW),peak?'peak':'continuous');
  const current=currentForPower(p,(actual.ok?actual.dcW*N:0)+p.auxPower);energy+=(current===null?0:p.voltage*current)*step;
  distance+=(v+next)*.5*step;t+=step;if(peak)peakTime+=step;v=next;
  if(rows.length===1||t-rows.at(-1).time_s>=.249||time100!==null)rows.push({time_s:t,speed_kmh:v*3.6,distance_m:distance,soc_pct:100*(p.socInitial-energy/pk.energy)});
  if(v>=maxV-1e-8&&v<target){reason='rpm-limit';break;}
 }
 const reasonCode=reason;reason=({'time-limit':'понад 180 с','force-limit':'тяги недостатньо','battery-depleted':'вичерпано доступний заряд','rpm-limit':'межа частоти мотора','reached':'100 км/год досягнуто'})[reason];
 return {time100,reason,reasonCode,rows,distance,energyJ:energy,peakSeconds:pk.peakSeconds,peakUsedSeconds:peakTime,grip:p.evGrip,drivenMassFraction:p.evDrivenMassFraction,model:'0.05 s; fixed ratio; no shift or launch delay; static axle load; peak then S1'};
}
