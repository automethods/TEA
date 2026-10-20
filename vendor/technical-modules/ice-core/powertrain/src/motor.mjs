import {lookup,bracket,linear} from './maps.mjs';
import {RPM_TO_RAD} from './engine.mjs';
export function motorEnvelope(m,n,rating='continuous',direction=1){
 if(!Number.isFinite(n)||n<0||n>m.maxRpm)return 0;
 const continuous=rating==='continuous',T=continuous?m.continuousNm:m.peakNm,P=continuous?m.continuousKW:m.peakKW;
 const current=continuous?m.continuousPhaseArms:m.peakPhaseArms;
 const env=m.map?.operatingEnvelope;const mapLimit=env?linear(env.rpm,direction<0?env.minTorqueNm:env.maxTorqueNm,n):null;
 if(env&&mapLimit===null)return 0;
 return Math.min(T,current*m.torqueConstantNmArms,n===0?Infinity:P*1000/(n*RPM_TO_RAD),env?Math.abs(mapLimit):Infinity);
}
export function motorPower(m,fit,n,T,etaInv=.97){
 if(!Number.isFinite(n)||!Number.isFinite(T)||n<0||n>m.maxRpm||!(etaInv>0&&etaInv<=1))return {ok:false,reason:'motor-envelope'};
 const omega=n*RPM_TO_RAD,P=T*omega;
 if(!m.map&&n===0&&T===0)return {ok:true,mechanicalW:0,dcW:0,motorLossW:0,inverterLossW:0,extrapolated:false};
 let loss,extrapolated=false,boundary=m.boundary;
 if(m.map){const v=lookup(m.map,n,T);if(!v.ok)return v;loss=v.value;boundary=m.map.boundary;}
 else if(m.lossModel==='generic-quadratic'){loss=3*m.phaseResistanceOhm25*(T/m.torqueConstantNmArms)**2+m.rotationLossBaseW*(n/m.baseRpm)**2;extrapolated=true;}
 else if(m.lossModel==='emrax228-digitized'){
  const a=n/1000,b=Math.abs(T)/100,features=[1,a,a*a,a*a*a,b*b,b*b*a];
  loss=features.reduce((s,x,i)=>s+x*fit.coefficients[i],0);
  const copper=3*m.phaseResistanceOhm25*(T/m.torqueConstantNmArms)**2;
  loss=Math.max(loss,copper,Math.abs(P)*(1/.96-1));
  // At exact standstill only copper is identifiable; rotating fit is not used.
  if(n===0)loss=copper;
  // Bracketed envelope of digitized low/high branches (not the full manufacturer's map).
  const ns=[...new Set(fit.points.map(x=>x.rpm))].sort((a,b)=>a-b);
  const lower=ns.map(n=>Math.min(...fit.points.filter(x=>x.rpm===n).map(x=>x.torque_nm)));
  const upper=ns.map(n=>Math.max(...fit.points.filter(x=>x.rpm===n).map(x=>x.torque_nm)));
  const q=bracket(ns,n),low=q?lower[q[0]]*(1-q[2])+lower[q[1]]*q[2]:Infinity,high=q?upper[q[0]]*(1-q[2])+upper[q[1]]*q[2]:-Infinity;
  extrapolated=!q||T<low||T>high;
 }else{
  const eta=m.assumedEfficiency;loss=P>=0?P*(1/eta-1):Math.abs(P)*(1-eta);
  loss=Math.max(loss,3*m.phaseResistanceOhm25*(T/m.torqueConstantNmArms)**2);extrapolated=true;
 }
 const ac=P+loss,dc=boundary==='motor+inverter'?ac:ac>=0?ac/etaInv:ac*etaInv;
 return {ok:true,mechanicalW:P,dcW:dc,motorLossW:loss,inverterLossW:dc-ac,extrapolated};
}
/** Bounded motor torque at a specified DC power budget. No hidden clipping of user inputs. */
export function boundedMotor(m,fit,n,requestedT,count,etaInv,dcMin,dcMax,rating='continuous'){
 dcMin=Math.max(dcMin,-(m.maxDcW??Infinity)*count);dcMax=Math.min(dcMax,(m.maxDcW??Infinity)*count);
 const limit=motorEnvelope(m,n,rating,requestedT<0?-1:1)*count;
 if(n>m.maxRpm)return {ok:false,torque:0,dcW:0,mechanicalW:0,motorLossW:0,inverterLossW:0,reason:'motor-speed'};
 const sample=T=>{const r=motorPower(m,fit,n,T/count,etaInv);return {...r,torque:T,dcW:r.dcW*count,mechanicalW:r.mechanicalW*count,motorLossW:r.motorLossW*count,inverterLossW:r.inverterLossW*count};};
 let wanted=Math.max(-limit,Math.min(limit,requestedT)),r=sample(wanted);
 if(!r.ok)return {...r,torque:0,dcW:0,mechanicalW:0,motorLossW:0,inverterLossW:0};
 if(r.dcW>=dcMin-1e-8&&r.dcW<=dcMax+1e-8)return r;
 const zero=sample(0);if(!zero.ok)return {...zero,torque:0,dcW:0,mechanicalW:0,motorLossW:0,inverterLossW:0};
 if(zero.dcW>dcMax+1e-8)return {...zero,ok:false,reason:'insufficient-standby-power'};
 if(zero.dcW<dcMin-1e-8)return {...zero,ok:false,reason:'unabsorbable-generation'};
 let lo=0,hi=1,best=zero;
 for(let j=0;j<55;j++){const f=(lo+hi)/2,q=sample(wanted*f);if(q.ok&&q.dcW>=dcMin&&q.dcW<=dcMax){lo=f;best=q;}else hi=f;}
 return {...best,limited:true};
}
