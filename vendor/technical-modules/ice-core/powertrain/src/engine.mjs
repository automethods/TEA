import {linear,lookup} from './maps.mjs';
export const RPM_TO_RAD=Math.PI/30;
export function envelope(e,n){
 if(n<e.minRpm||n>e.maxRpm||!Number.isFinite(n))return 0;
 let raw=['curve','calculated'].includes(e.kind)?linear(e.rpm,e.torqueNm,n)??0:e.kind==='grid'?linear(e.map.operatingEnvelope?.rpm??e.map.rpm,e.map.operatingEnvelope?.maxTorqueNm??e.map.maxTorqueNm,n)??0:Math.min(e.maxTorqueNm,e.maxPowerKW*1000/(n*RPM_TO_RAD));
 return Math.min(raw,e.limitNm??Infinity,(e.limitKW??Infinity)*1000/(n*RPM_TO_RAD));
}
export function fuel(e,n,T,on=true){
 if(!on)return {kgS:0,known:true};if(n<e.minRpm||n>e.maxRpm||T<0||T>envelope(e,n)+1e-6)return {kgS:null,known:false,reason:'engine-envelope'};
 const P=T*n*RPM_TO_RAD/1000;
 if(e.kind==='calculated'){const rows=e.fuelCurves??[];let i=rows.findIndex(x=>x.rpm>=n);if(i<0)return {kgS:null,known:false,reason:'outside-calculated-fuel-range'};const a=rows[Math.max(0,i-1)],b=rows[i];const at=x=>x.points.length<2?(x.points.length===1&&Math.abs(x.points[0].torqueNm-T)<1e-8?x.points[0].fuelKgS:null):linear(x.points.map(q=>q.torqueNm),x.points.map(q=>q.fuelKgS),T);const va=at(a),vb=at(b);if(!Number.isFinite(va)||!Number.isFinite(vb))return {kgS:null,known:false,reason:'outside-calculated-fuel-domain'};return {kgS:a.rpm===b.rpm?va:va+(vb-va)*(n-a.rpm)/(b.rpm-a.rpm),known:true,estimated:true,status:'model-estimated'};}
 if(e.kind==='willans')return {kgS:Math.max(e.idleFuelGsAssumed,e.interceptGs+e.slopeGsPerKW*P)/1000,known:true,estimated:true};
 if(e.kind==='grid'){const v=lookup(e.map,n,T);return v.ok?{kgS:v.value/1000,known:true,evidence:v.evidence,interpolated:v.interpolated}:{kgS:null,known:false,reason:v.reason};}
 return {kgS:null,known:false,reason:'no-calibrated-fuel-map'};
}
export function operatingPoint(e,powerKW){
 if(powerKW<=0)return {rpm:0,torque:0,powerKW:0,fuelKgS:0,fuelKnown:true};
 let best=null;
 for(let n=e.minRpm;n<=e.maxRpm+1;n+=100){const T=powerKW*1000/(n*RPM_TO_RAD);if(T>envelope(e,n)+1e-8)continue;const f=fuel(e,n,T);const score=f.known?f.kgS:powerKW/(.32*e.lhvJkg/1000);
  if(!best||score<best.score-1e-12||Math.abs(score-best.score)<1e-12&&Math.abs(n-3000)<Math.abs(best.rpm-3000))best={rpm:n,torque:T,powerKW,fuelKgS:f.kgS,fuelKnown:f.known,score};}
 return best;
}
