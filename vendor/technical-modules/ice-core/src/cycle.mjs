import {geometry,trapz,RAD} from './geometry.mjs';
import {GAS_R,u,enthalpy,temperature,orifice,valveArea,burn,heatCoefficient} from './thermo.mjs';
/** y=[m,U,mFresh,W,Qwall,Hin,Hout,Qcomb,mIntNet,mExNet]. */
function rates(deg,y,p,fuel) {
  const g=geometry(p,deg), mass=y[0];
  if(!(mass>1e-10)) throw new Error('Втрата додатності маси; зменште крок.');
  const T=temperature(y[1]/mass), pressure=mass*GAS_R*T/g.V;
  if(!(T>100&&T<6500&&Number.isFinite(pressure))) throw new Error('Стан поза допустимою областю інтегратора.');
  const ai=valveArea(deg,0,p.ivc,p.intakeDiameter,p.intakeLift,2);
  const ae=valveArea(deg,p.evo,720,p.exhaustDiameter,p.exhaustLift,2);
  const mi=pressure<p.intakeP ? orifice(p.intakeP,p.intakeT,pressure,ai,p.cd) : -orifice(pressure,T,p.intakeP,ai,p.cd);
  const me=pressure<p.exhaustP ? orifice(p.exhaustP,p.exhaustT,pressure,ae,p.cd) : -orifice(pressure,T,p.exhaustP,ae,p.cd);
  const degreeSeconds=1/(6*p.rpm), freshFraction=y[2]/mass;
  const hin=Math.max(mi,0)*enthalpy(p.intakeT)+Math.max(me,0)*enthalpy(p.exhaustT);
  const hout=-(Math.min(mi,0)+Math.min(me,0))*enthalpy(T);
  const df=Math.max(mi,0)+(Math.min(mi,0)+Math.min(me,0))*freshFraction;
  const qc=fuel*p.lhv*p.etaComb*burn(deg,p).dx;
  const qw=heatCoefficient(pressure,T,g.V,p)*g.wallArea*(T-p.wallT)*degreeSeconds;
  const work=pressure*g.dV;
  return [(mi+me)*degreeSeconds,qc-qw-work+(hin-hout)*degreeSeconds,
    df*degreeSeconds,work,qw,hin*degreeSeconds,hout*degreeSeconds,qc,mi*degreeSeconds,me*degreeSeconds];
}
function rk4(t,y,h,p,fuel) {
  const a=rates(t,y,p,fuel), b=rates(t+h/2,y.map((v,i)=>v+h*a[i]/2),p,fuel);
  const c=rates(t+h/2,y.map((v,i)=>v+h*b[i]/2),p,fuel),d=rates(t+h,y.map((v,i)=>v+h*c[i]),p,fuel);
  return y.map((v,i)=>v+h*(a[i]+2*b[i]+2*c[i]+d[i])/6);
}
function grid(p) {
  const points=new Set([0,180,p.ivc,p.soc,360,p.soc+p.duration,p.evo,540,720]);
  for(let t=0;t<720;t+=p.step) points.add(Number(t.toFixed(9)));
  return [...points].sort((a,b)=>a-b);
}
function sample(t,y,p,fuel) {
  const g=geometry(p,t),T=temperature(y[1]/y[0]),pressure=y[0]*GAS_R*T/g.V;
  const rate=rates(t,y,p,fuel);
  return {theta:t,p:pressure,T,m:y[0],U:y[1],fresh:y[2],x:g.x,V:g.V,velocity:g.velocity,
    acceleration:g.acceleration,beta:g.beta,dx:g.dx,xb:burn(t,p).x,qRelease:fuel*p.lhv*p.etaComb*burn(t,p).dx,
    heatRate:rate[4]*6*p.rpm,inletFlow:rate[8]*6*p.rpm,exhaustFlow:rate[9]*6*p.rpm,
    W:y[3],Qwall:y[4],Hin:y[5],Hout:y[6],Qcomb:y[7]};
}
export function simulate(p,{record=true}={}) {
  const points=grid(p),g0=geometry(p,0),m0=p.exhaustP*g0.V/(GAS_R*p.exhaustT);
  let init=[m0,m0*u(p.exhaustT)],result,periodicError=Infinity;
  for(let cycle=1;cycle<=p.maxCycles;cycle++) {
    const start=[...init]; let y=[...init,0,0,0,0,0,0,0,0],fuel=0,ivcState;
    const rows=record ? [sample(0,y,p,fuel)] : [];
    for(let j=1;j<points.length;j++) {
      const previous=points[j-1],t=points[j];
      y=rk4(previous,y,t-previous,p,fuel);
      if(Math.abs(t-p.ivc)<1e-7) { fuel=y[2]/(1+p.alpha*p.stoich); ivcState={m:y[0],fresh:y[2],U:y[1],fuel}; }
      if(record) rows.push(sample(t,y,p,fuel));
    }
    periodicError=Math.max(Math.abs(y[0]-start[0])/Math.max(start[0],1e-10),Math.abs(y[1]-start[1])/Math.max(start[1],1e-8));
    result={rows,fuel,ivcState,cycles:cycle,periodicError,start,end:y,
      work:y[3],Qwall:y[4],Hin:y[5],Hout:y[6],Qcomb:y[7],deltaU:y[1]-start[1],deltaM:y[0]-start[0],
      massBalance:(y[0]-start[0])-y[8]-y[9],energyBalance:(y[1]-start[1])-(y[7]-y[4]-y[3]+y[5]-y[6])};
    if(periodicError<p.periodicTolerance) break;
    init=y.slice(0,2);
  }
  if(periodicError>=p.periodicTolerance) throw new Error(`Цикл не збігся за ${p.maxCycles} повторів (нев'язка ${periodicError}).`);
  if(record) {
    result.pmax=Math.max(...result.rows.map(x=>x.p));
    result.Tmax=Math.max(...result.rows.map(x=>x.T));
    result.trapezoidWork=trapz(result.rows,x=>x.p,x=>x.V);
    result.pumpingWork=trapz(result.rows.filter(x=>x.theta<=180||x.theta>=540),x=>x.p,x=>x.V);
    // The disjoint branches meet at equal BDC volumes; the intervening segment has dV=0.
  }
  return result;
}
export function dynamics(rows,p) {
  const r=p.stroke/2,area=Math.PI*p.bore*p.bore/4;
  return rows.map(x=>{
    const gas=(x.p-p.crankP)*area,inertia=-p.recipMass*x.acceleration,total=gas+inertia;
    const rod=total/Math.cos(x.beta),side=total*Math.tan(x.beta);
    const tangent=rod*Math.sin(x.theta*RAD+x.beta),radial=rod*Math.cos(x.theta*RAD+x.beta);
    return {...x,gas,inertia,total,rod,side,tangent,radial,torque:r*tangent,gasTorque:gas*x.dx};
  });
}
export function interpolate(rows,deg,key) {
  const angle=((deg%720)+720)%720;
  let lo=0,hi=rows.length-1;
  while(hi-lo>1) {const m=(lo+hi)>>1;if(rows[m].theta<=angle)lo=m;else hi=m;}
  const a=rows[lo],b=rows[hi],f=(angle-a.theta)/(b.theta-a.theta);
  return a[key]+f*(b[key]-a[key]);
}
export function evaluatePoint(p) {
  const c=simulate(p),g=geometry(p,0),rate=p.cylinders*p.rpm/120;
  const cm=p.stroke*p.rpm/30;
  const fmep=p.frictionA+p.frictionB*c.pmax+p.frictionC*cm+p.frictionD*cm*cm;
  const brakeWork=c.work-fmep*g.vd,Pi=c.work*rate,frictionPower=fmep*g.vd*rate,Pe=brakeWork*rate;
  if(Pe<=0) throw new Error('Ефективна потужність недодатна; цей режим не належить робочій області моделі.');
  const fuelPower=c.fuel*p.lhv*rate,fuelFlow=c.fuel*rate;
  const rows=dynamics(c.rows,p);
  for(const row of rows) row.torqueSum=Array.from({length:p.cylinders},(_,j)=>interpolate(rows,row.theta-j*720/p.cylinders,'torque')).reduce((a,b)=>a+b,0);
  const meanTorque=Pe/g.omega,meanIndTorque=Pi/g.omega;
  const dynMean=trapz(rows,x=>x.torqueSum,x=>x.theta*RAD)/(4*Math.PI);
  let energy=0,minE=0,maxE=0;
  for(let i=1;i<rows.length;i++) {
    energy+=((rows[i].torqueSum+rows[i-1].torqueSum)/2-meanIndTorque)*(rows[i].theta-rows[i-1].theta)*RAD;
    minE=Math.min(minE,energy);maxE=Math.max(maxE,energy);rows[i].energyFluctuation=energy;
  }
  rows[0].energyFluctuation=0;
  const Qw=c.Qwall*rate,Hnet=(c.Hout-c.Hin)*rate,unburned=fuelPower-c.Qcomb*rate;
  const at=t=>c.rows.find(x=>Math.abs(x.theta-t)<1e-7);
  const a=at(p.ivc),cc=at(p.soc),b=at(p.evo);
  const forcePeak=rows.reduce((a,b)=>Math.abs(a.total)>Math.abs(b.total)?a:b);
  const balanceResidual=fuelPower-(Pe+frictionPower+Qw+Hnet+unburned+c.deltaU*rate);
  return {p:{...p},rows,summary:{rpm:p.rpm,vd:g.vd,totalVolume:g.vd*p.cylinders,vc:g.vc,area:g.area,cm,
    pIVC:a.p,TIVC:a.T,VIVC:a.V,pSOC:cc.p,TSOC:cc.T,VSOC:cc.V,pEVO:b.p,TEVO:b.T,VEVO:b.V,
    maxGasForce:Math.max(...rows.map(x=>x.gas)),maxRodForce:Math.max(...rows.map(x=>Math.abs(x.rod))),
    maxSideForce:Math.max(...rows.map(x=>Math.abs(x.side))),maxInertiaForce:Math.max(...rows.map(x=>Math.abs(x.inertia))),
    forcePeakAngle:forcePeak.theta,maxTotalForce:Math.abs(forcePeak.total),
    fuelPerCycle:c.fuel,residualFraction:1-c.ivcState.fresh/c.ivcState.m,trappedMass:c.ivcState.m,
    imep:c.work/g.vd,fmep,bmep:brakeWork/g.vd,Pi,Pe,meanTorque,meanIndTorque,pmax:c.pmax,Tmax:c.Tmax,
    fuelFlow,bsfc:3.6e9*fuelFlow/Pe,etaI:Pi/fuelPower,etaE:Pe/fuelPower,etaM:Pe/Pi,
    work:c.work,pumpingWork:c.pumpingWork,Qw,Hnet,frictionPower,unburned,fuelPower,
    coolantVolumeFlow:(Qw+frictionPower*p.coolantFrictionShare)/(p.coolantDensity*p.coolantCp*p.coolantDeltaT),
    oilVolumeFlow:frictionPower*(1-p.coolantFrictionShare)/(p.oilDensity*p.oilCp*p.oilDeltaT),
    requiredTotalInertia:(maxE-minE)/(p.speedIrregularity*g.omega**2),energySwing:maxE-minE,
    cycles:c.cycles,periodicError:c.periodicError,massBalance:c.massBalance,energyBalance:c.energyBalance,
    balanceResidual,dynMean,torqueWorkError:Math.abs(dynMean-meanIndTorque)/Math.abs(meanIndTorque),
    quadratureError:Math.abs(c.trapezoidWork-c.work)/Math.abs(c.work),deltaU:c.deltaU}};
}
