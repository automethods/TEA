/** One-zone, crankcase/blower-scavenged two-stroke teaching model.
 * Angles are measured from firing TDC. Exhaust opens before transfer and closes after it.
 * Reservoir pressure and effective port areas are explicit assumptions, not a port design.
 */
import {geometry} from '../../src/geometry.mjs';
import {GAS_R,u,enthalpy,temperature,orifice,burn,heatCoefficient} from '../../src/thermo.mjs';

function portArea(t,open,close,maxArea){
 if(t<=open||t>=close)return 0;
 return maxArea*Math.sin(Math.PI*(t-open)/(close-open))**2;
}
function injectionFraction(t,p){const q=(t-p.injectionStart)/p.injectionDuration;return q<=0?0:q>=1?1:(1-Math.cos(Math.PI*q))/2;}
function rates(t,y,p,fuel){
 const g=geometry(p,t),m=y[0];
 if(!(m>1e-10))throw Error('Двотактний цикл: маса в циліндрі недодатна.');
 const T=temperature(y[1]/m),pressure=m*GAS_R*T/g.V;
 if(!(T>100&&T<6500&&Number.isFinite(pressure)))throw Error('Двотактний цикл: температура або тиск поза областю моделі.');
 const ai=portArea(t,p.transferOpen,p.transferClose,g.area*p.transferAreaRatio);
 const ae=portArea(t,p.portExhaustOpen,p.portExhaustClose,g.area*p.exhaustAreaRatio);
 const mi=pressure<p.scavengeP?orifice(p.scavengeP,p.intakeT,pressure,ai,p.cd):-orifice(pressure,T,p.scavengeP,ai,p.cd);
 const me=pressure<p.exhaustP?orifice(p.exhaustP,p.exhaustT,pressure,ae,p.cd):-orifice(pressure,T,p.exhaustP,ae,p.cd);
 const dt=1/(6*p.rpm),hin=Math.max(mi,0)*enthalpy(p.intakeT)+Math.max(me,0)*enthalpy(p.exhaustT);
 const hout=-(Math.min(mi,0)+Math.min(me,0))*enthalpy(T);
 const df=Math.max(mi,0)+(Math.min(mi,0)+Math.min(me,0))*y[2]/m;
 const inj=p.direct&&t>=p.injectionStart&&t<=p.injectionStart+p.injectionDuration?
  fuel*Math.PI*Math.sin(Math.PI*(t-p.injectionStart)/p.injectionDuration)/(2*p.injectionDuration):0;
 const hinFuel=inj*(enthalpy(p.fuelT)-p.vaporization);
 const b=burn(t,{soc:p.soc,duration:p.duration,wiebeA:p.wiebeA,wiebeM:p.wiebeM});
 const qc=fuel*p.lhv*p.etaComb*b.dx;
 const qw=heatCoefficient(pressure,T,g.V,p)*g.wallArea*(T-p.wallT)*dt,work=pressure*g.dV;
 return [(mi+me)*dt+inj,qc-qw-work+(hin-hout)*dt+hinFuel,df*dt,work,qw,hin*dt,hout*dt,qc,mi*dt,me*dt,inj,hinFuel,Math.max(mi,0)*dt];
}
function rk4(t,y,h,p,fuel){
 const a=rates(t,y,p,fuel),b=rates(t+h/2,y.map((v,i)=>v+h*a[i]/2),p,fuel),c=rates(t+h/2,y.map((v,i)=>v+h*b[i]/2),p,fuel),d=rates(t+h,y.map((v,i)=>v+h*c[i]),p,fuel);
 return y.map((v,i)=>v+h*(a[i]+2*b[i]+2*c[i]+d[i])/6);
}
function grid(p){const s=new Set([0,180,360,p.soc,p.soc+p.duration,p.transferOpen,p.transferClose,p.portExhaustOpen,p.portExhaustClose]);if(p.direct){s.add(p.injectionStart);s.add(p.injectionStart+p.injectionDuration);}for(let t=0;t<360;t+=p.step)s.add(Number(t.toFixed(9)));return [...s].filter(x=>x>=0&&x<=360).sort((a,b)=>a-b);}
function sample(t,y,p,fuel){
 const g=geometry(p,t),T=temperature(y[1]/y[0]),pressure=y[0]*GAS_R*T/g.V,r=rates(t,y,p,fuel),b=burn(t,{soc:p.soc,duration:p.duration,wiebeA:p.wiebeA,wiebeM:p.wiebeM});
 return {theta:t,p:pressure,T,m:y[0],U:y[1],fresh:y[2],x:g.x,V:g.V,velocity:g.velocity,acceleration:g.acceleration,beta:g.beta,dx:g.dx,xb:b.x,xf:p.direct?injectionFraction(t,p):1,qRelease:r[7],heatRate:r[4]*6*p.rpm,inletFlow:r[8]*6*p.rpm,exhaustFlow:r[9]*6*p.rpm,injectionRate:r[10]*6*p.rpm,W:y[3],Qwall:y[4],Hin:y[5],Hout:y[6],Qcomb:y[7]};
}
export function simulateTwoStroke(p,{record=true}={}){
 const times=grid(p),g0=geometry(p,0),m0=p.exhaustP*g0.V/(GAS_R*p.exhaustT);
 let init=[m0,m0*u(p.exhaustT),m0*.8],fuel=m0*.8/(p.alpha*p.stoich+(p.direct?0:1)),result;
 for(let cycle=1;cycle<=p.maxCycles;cycle++){
  const start=[...init],oldFuel=fuel;let y=[...init,0,0,0,0,0,0,0,0,0,0],trapState=null,rows=record?[sample(0,y,p,fuel)]:[],maxP=0,maxT=0;
  for(let j=1;j<times.length;j++){
   const t=times[j];y=rk4(times[j-1],y,t-times[j-1],p,fuel);
   // The previous charge is now residual gas. Count only this scavenging event's inlet charge.
   // This resets a provenance tracer, not physical mass or internal energy.
   if(Math.abs(t-p.portExhaustOpen)<1e-7)y[2]=0;
   if(Math.abs(t-p.portExhaustClose)<1e-7)trapState={m:y[0],fresh:y[2],U:y[1],fuel:y[2]/(p.alpha*p.stoich+(p.direct?0:1))};
   const x=sample(t,y,p,fuel);maxP=Math.max(maxP,x.p);maxT=Math.max(maxT,x.T);if(record)rows.push(x);
  }
  const nextFuel=trapState.fuel,err=Math.max(Math.abs(y[0]-start[0])/Math.max(start[0],1e-10),Math.abs(y[1]-start[1])/Math.max(start[1],1e-8),Math.abs(y[2]-start[2])/Math.max(start[2],1e-10),Math.abs(nextFuel-oldFuel)/Math.max(oldFuel,1e-10));
  result={rows,fuel,fuelSupplied:p.direct?fuel:y[12]/(p.alpha*p.stoich+1),deliveredFresh:y[12],ivcState:trapState,cycles:cycle,periodicError:err,work:y[3],Qwall:y[4],Hin:y[5],Hout:y[6],Qcomb:y[7],injectedMass:y[10],HinFuel:y[11],deltaU:y[1]-start[1],deltaM:y[0]-start[0],netIntake:y[8],netExhaust:y[9],pmax:maxP,Tmax:maxT,massBalance:y[0]-start[0]-y[8]-y[9]-y[10],energyBalance:y[1]-start[1]-(y[7]-y[4]-y[3]+y[5]-y[6]+y[11])};
  if(err<p.periodicTolerance)break;
  init=y.slice(0,3);fuel=nextFuel;
 }
 if(result.periodicError>=p.periodicTolerance)throw Error('Двотактний цикл не досяг періодичного стану; перевірте тиск продувки, фази й площі вікон.');
 return result;
}
