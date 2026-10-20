/** Brand-neutral equivalent machine + inverter + constant-Voc Rint storage. All public powers in W. */
import {batteryStep,batteryLimits} from '../../powertrain/src/battery.mjs';
export function motorLoss(m,n,T){const I=T/m.torqueConstantNmArms;return 3*m.phaseResistanceOhm25*I*I+m.rotationLossBaseW*(n/m.baseRpm)**2;}
export function motorEnvelopeSI(m,n,rating='continuous'){
 if(n<0||n>m.maxRpm||!Number.isFinite(n))return 0;const peak=rating==='peak',P=(peak?m.peakKW:m.continuousKW)*1000,T=peak?m.peakNm:m.continuousNm;return Math.min(T,(peak?m.peakPhaseArms:m.continuousPhaseArms)*m.torqueConstantNmArms,n===0?Infinity:P/(n*Math.PI/30));
}
export function motorPoint(m,n,T,eta){const mechanicalW=T*n*Math.PI/30,loss=motorLoss(m,n,T),ac=mechanicalW+loss,dc=ac>=0?ac/eta:ac*eta;return {torqueNm:T,mechanicalW,motorLossW:loss,inverterLossW:dc-ac,dcW:dc,phaseCurrent:Math.abs(T/m.torqueConstantNmArms)};}
export function boundedMotorSI(m,n,T,eta,minDC,maxDC,rating='continuous'){
 if(n>m.maxRpm&&n-m.maxRpm<1e-7)n=m.maxRpm;
 if(n<0||n>m.maxRpm)return {ok:false,reason:'motor-speed',...motorPoint(m,0,0,eta)};
 const lim=motorEnvelopeSI(m,n,rating),wanted=Math.max(-lim,Math.min(lim,T)),q=motorPoint(m,n,wanted,eta),zero=motorPoint(m,n,0,eta);
 if(q.dcW>=minDC&&q.dcW<=maxDC)return {ok:true,...q,limited:wanted!==T};
 if(zero.dcW>maxDC||zero.dcW<minDC)return {ok:false,reason:'rotation-loss-budget',...zero};
 let lo=0,hi=1,best=zero;for(let i=0;i<48;i++){const f=(lo+hi)/2,r=motorPoint(m,n,wanted*f,eta);if(r.dcW>=minDC&&r.dcW<=maxDC){lo=f;best=r;}else hi=f;}
 return {ok:true,...best,limited:true};
}
export function currentForPower(p,P){const disc=p.voltage*p.voltage-4*p.resistance*P;if(disc<0)return null;return 2*P/(p.voltage+Math.sqrt(disc));}
export function batteryConfig(p,energy){return {batteryKWh:energy/3.6e6,voltage:p.voltage,voltageMin:p.voltageMin,voltageMax:p.voltageMax,resistance:p.resistance,dischargeA:p.dischargeCurrent,chargeA:p.chargeCurrent,initialSoc:p.socInitial,socMin:p.socMin,socMax:p.socMax};}
export function designElectrical(p,enginePower=0,{energyOverride=null,powerLimits=null,skipMission=false}={}){
 const count=p.evMotorCount??1;
 const required=Math.max(p.evMotorMinimum??0,p.system==='hybrid'&&p.topology==='parallel'?Math.max(0,p.targetPower-enginePower):p.targetPower);
 const n=p.ratedSpeed*60,base=p.motorBaseSpeed*60,wMin=2*Math.PI*Math.min(p.ratedSpeed,p.motorBaseSpeed);
 const torqueDesign=required/wMin/count,powerDesign=torqueDesign*base*Math.PI/30;
 const power=p.mode==='design'?powerDesign:p.motorContinuous,torque=p.mode==='design'?torqueDesign:p.motorTorque;
 const m={id:'design-motor',name:'Розрахована еквівалентна електромашина',sourceClass:'model-estimated',source:'design/src/electric.mjs',boundary:'motor',lossModel:'generic-quadratic',
 continuousKW:power/1000,continuousNm:torque,peakKW:power*p.motorPeakFactor/1000,peakNm:torque*p.motorPeakFactor,
 maxRpm:p.motorMaxSpeed*60,baseRpm:base,continuousPhaseArms:p.phaseCurrent,peakPhaseArms:p.evPeakPhaseCurrent??p.phaseCurrent,torqueConstantNmArms:p.torqueConstant,phaseResistanceOhm25:p.phaseResistance,rotationLossBaseW:p.ironLoss,
 voltageRequired:p.voltageMin,peakDutySeconds:p.peakDuration,maxDcW:p.inverterCurrent*p.voltageMin};
 const requiredPoint=motorPoint(m,n,required/(n*Math.PI/30)/count,p.inverterEfficiency),avgPoint=motorPoint(m,n,required*p.averageLoad/(n*Math.PI/30)/count,p.inverterEfficiency);
 const averageDC=avgPoint.dcW*count+p.auxPower,current=currentForPower(p,averageDC);
 const requiredEnergy=current===null?null:p.voltage*current*p.duration/(p.socInitial-p.socMin);
 const installed=energyOverride??(p.mode==='design'?(requiredEnergy===null?null:Math.max(3.6e6,Math.ceil(requiredEnergy/3.6e6)*3.6e6)):p.batteryEnergy);
 const bp=installed===null?null:batteryConfig(p,installed),limits=bp?batteryLimits(bp,p.socInitial,1):null;
 if(limits&&powerLimits){limits.maxW=Math.min(limits.maxW,powerLimits.continuousW);limits.minW=Math.max(limits.minW,-powerLimits.chargeW);}
 const peakLimits=bp?batteryLimits(bp,p.socInitial,1):null;if(peakLimits&&powerLimits){peakLimits.maxW=Math.min(peakLimits.maxW,powerLimits.peakW);peakLimits.minW=Math.max(peakLimits.minW,-powerLimits.chargeW);}
 const maxDC=limits?Math.min((limits.maxW-p.auxPower)/count,m.maxDcW):0,minDC=limits?Math.max((limits.minW-p.auxPower)/count,-m.maxDcW):0,peakDC=peakLimits?Math.min((peakLimits.maxW-p.auxPower)/count,m.maxDcW):0;
 const combined=q=>({...q,torqueNm:q.torqueNm*count,mechanicalW:q.mechanicalW*count,dcW:q.dcW*count,motorLossW:q.motorLossW*count,inverterLossW:q.inverterLossW*count});
 const available=combined(boundedMotorSI(m,n,1e6,p.inverterEfficiency,minDC,maxDC)),peak=combined(boundedMotorSI(m,n,1e6,p.inverterEfficiency,minDC,peakDC,'peak'));
 const mission=[];let soc=p.socInitial,chemicalJ=0,terminalJ=0,heatJ=0,deficitJ=0;
 if(bp&&!skipMission){mission.push({time:0,soc,current:0,terminalV:p.voltage,terminalW:0,heatW:0,unservedW:0});const h=Math.max(1,p.duration/1000);
  for(let t=0;t<p.duration-1e-8;){const dt=Math.min(h,p.duration-t),r=batteryStep(bp,soc,averageDC,dt);chemicalJ+=r.chemicalW*dt;terminalJ+=r.terminalW*dt;heatJ+=r.heatW*dt;deficitJ+=Math.max(0,r.unservedW)*dt;soc=r.soc;t+=dt;mission.push({time:t,soc,current:r.current,terminalV:r.terminalV,terminalW:r.terminalW,heatW:r.heatW,unservedW:r.unservedW});}
 }
 const curve=Array.from({length:61},(_,i)=>{const rpm=m.maxRpm*i/60,cont=boundedMotorSI(m,rpm,1e6,p.inverterEfficiency,minDC,maxDC),pk=boundedMotorSI(m,rpm,1e6,p.inverterEfficiency,minDC,peakDC,'peak'),regen=boundedMotorSI(m,rpm,-1e6,p.inverterEfficiency,minDC,maxDC);return {rpm,continuousNm:cont.ok?cont.torqueNm*count:0,peakNm:pk.ok?pk.torqueNm*count:0,continuousW:cont.ok?cont.mechanicalW*count:0,peakW:pk.ok?pk.mechanicalW*count:0,regenNm:regen.ok?regen.torqueNm*count:0,dcW:cont.ok?cont.dcW*count:null};});
 const efficiencyMap=[];for(let i=1;i<=24;i++){const rpm=m.maxRpm*i/24;for(let j=-12;j<=12;j++){const T=m.continuousNm*j/12;if(Math.abs(T)>motorEnvelopeSI(m,rpm))continue;const x=motorPoint(m,rpm,T,p.inverterEfficiency);const eta=x.mechanicalW>0?x.mechanicalW/(x.mechanicalW+x.motorLossW):x.mechanicalW<0?Math.max(0,(Math.abs(x.mechanicalW)-x.motorLossW)/Math.abs(x.mechanicalW)):null;efficiencyMap.push({rpm,torqueNm:T,etaMotor:eta,lossW:x.motorLossW,dcW:x.dcW});}}
 const checks=[{id:'motor-rating',label:'Тривала потужність у заданій точці з поточними обмеженнями',pass:available.ok&&available.mechanicalW>=required*(1-1e-5),value:available.mechanicalW,required,unit:'W'},
 {id:'battery-energy',label:'Енергетичний режим електричного тракту без дефіциту',pass:installed!==null&&deficitJ<1,unit:'J',value:deficitJ,required:0}];
 return {motor:m,motorCount:count,peakLimits,powerLimits,requiredMotorPower:required,designTorque:torqueDesign,designPower:powerDesign,requiredPoint,averagePoint:avgPoint,averageDC,currentRequired:current,requiredEnergy,installedEnergy:installed,efficiencyMap,battery:bp,limits,available,peak,curve,mission,checks,
 summary:{finalSoc:soc,chemicalJ,terminalJ,heatJ,deficitJ,balanceResidual:chemicalJ-terminalJ-heatJ,socEnergyResidual:installed===null?null:installed*(p.socInitial-soc)-chemicalJ,duration:p.duration,model:'constant-Voc/Rint; constant requested load; not a driving cycle'}};
}
