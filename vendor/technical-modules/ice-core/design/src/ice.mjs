/** General four-stroke 0D engine. PFI premixed intake; GDI/CI air intake + separately injected mass.
 * Effective gas, imposed injection/heat-release laws, no chemical kinetics, spray, detonation or emissions model.
 * Only local project code is executed. All dimensional inputs are SI except internal crank degrees and rpm.
 */
import {geometry,trapz,RAD} from '../../src/geometry.mjs';
import {GAS_R,u,enthalpy,temperature,orifice,valveArea,burn,heatCoefficient} from '../../src/thermo.mjs';
import {dynamics} from '../../src/cycle.mjs';
import {simulateTwoStroke} from './two-stroke.mjs';
export function engineTarget(p){return p.system==='hybrid'?p.hybridEngineTarget:p.targetPower;}
export function engineSpeed(p){return p.system==='hybrid'&&p.topology==='series'?p.generatorEngineSpeed*60:p.ratedSpeed*60;}
export function fuelAirRatio(p){return ((8/3)*p.carbon+8*p.hydrogen-p.oxygen)/.23;}
export function cycleParameters(p,D,S,rpm=engineSpeed(p)){
 const diesel=p.fuelType==='diesel',direct=diesel||p.injection==='direct';
 return {bore:D,stroke:S,compression:p.compression,cylinders:p.cylinders,rod:S/2/p.rodRatio,recipMass:p.recipMass,rpm,period:p.engineCycle==='two-stroke'?360:720,
 intakeP:p.intakePressure,intakeT:p.intakeTemperature,exhaustP:p.exhaustPressure,exhaustT:p.exhaustTemperature,crankP:p.crankPressure,wallT:p.wallTemperature,
 ivc:p.intakeClose,evo:p.exhaustOpen,intakeDiameter:D*p.intakeDiameterRatio,exhaustDiameter:D*p.exhaustDiameterRatio,intakeLift:D*p.liftRatio,exhaustLift:D*p.liftRatio*.9,cd:p.valveCd,
 alpha:p.lambda,stoich:fuelAirRatio(p),lhv:p.lhv,etaComb:p.combustionEfficiency,soc:diesel?p.dieselStart+p.ignitionDelay:p.sparkStart,
 duration:diesel?p.premixDuration*.5+p.diffusionDuration:p.sparkDuration,wiebeA:6.908,wiebeM:p.sparkShape??2,
 injectionStart:diesel?p.dieselStart:p.gdiStart,injectionDuration:diesel?p.dieselInjectionDuration:p.gdiDuration,
 premixShare:p.premixShare,premixDuration:p.premixDuration,diffusionDuration:p.diffusionDuration,diesel,direct,fuelT:p.fuelTemperature??300,vaporization:p.vaporization??0,
 heatMultiplier:p.heatMultiplier,frictionA:p.frictionA,frictionB:p.frictionB,frictionC:p.frictionC,frictionD:p.frictionD,
 step:p.step,maxCycles:45,periodicTolerance:1e-5,speedIrregularity:p.inertiaIrregularity,coolantCp:p.coolantCp,coolantRise:p.coolantRise,
 scavengeP:p.scavengePressure,portExhaustOpen:p.portExhaustOpen,portExhaustClose:p.portExhaustClose,transferOpen:p.transferOpen,transferClose:p.transferClose,transferAreaRatio:p.transferAreaRatio,exhaustAreaRatio:p.exhaustAreaRatio,
 ...(p.engineCycle==='two-stroke'?{soc:p.twoStrokeStart,duration:p.twoStrokeDuration,wiebeM:2,injectionStart:0,injectionDuration:p.twoStrokeInjectionDuration}:{} )};
}
export function injectionLaw(theta,p){if(!p.direct)return {x:1,dx:0};const y=(theta-p.injectionStart)/p.injectionDuration;if(y<=0)return {x:0,dx:0};if(y>=1)return {x:1,dx:0};return {x:(1-Math.cos(Math.PI*y))/2,dx:Math.PI*Math.sin(Math.PI*y)/(2*p.injectionDuration)};}
export function combustionLaw(theta,p){
 let b;if(p.diesel){const a=burn(theta,{soc:p.soc,duration:p.premixDuration,wiebeA:6.908,wiebeM:2}),c=burn(theta,{soc:p.soc+p.premixDuration*.5,duration:p.diffusionDuration,wiebeA:6.908,wiebeM:1});b={x:p.premixShare*a.x+(1-p.premixShare)*c.x,dx:p.premixShare*a.dx+(1-p.premixShare)*c.dx};}else b=burn(theta,p);
 const injected=injectionLaw(theta,p);return b.x>injected.x?{...injected,fuelLimited:true}:{...b,fuelLimited:false};
}
// State: mass,U,fresh inlet tracer,W,Qwall,Hin,Hout,Qcomb,netIntake,netExhaust,injectedMass,injectedEnthalpy
function rates(t,y,p,mFuel){
 const g=geometry(p,t),m=y[0];if(!(m>1e-10))throw Error('Маса в циліндрі недодатна; перевірте геометрію/крок.');
 const T=temperature(y[1]/m),pressure=m*GAS_R*T/g.V;if(!(T>100&&T<6500&&Number.isFinite(pressure)))throw Error('Температура/тиск поза областю ефективної моделі.');
 const ai=valveArea(t,0,p.ivc,p.intakeDiameter,p.intakeLift,2),ae=valveArea(t,p.evo,720,p.exhaustDiameter,p.exhaustLift,2);
 const mi=pressure<p.intakeP?orifice(p.intakeP,p.intakeT,pressure,ai,p.cd):-orifice(pressure,T,p.intakeP,ai,p.cd);
 const me=pressure<p.exhaustP?orifice(p.exhaustP,p.exhaustT,pressure,ae,p.cd):-orifice(pressure,T,p.exhaustP,ae,p.cd);
 const dt=1/(6*p.rpm),hin=Math.max(mi,0)*enthalpy(p.intakeT)+Math.max(me,0)*enthalpy(p.exhaustT),hout=-(Math.min(mi,0)+Math.min(me,0))*enthalpy(T);
 const df=Math.max(mi,0)+(Math.min(mi,0)+Math.min(me,0))*y[2]/m;
 const injected=p.direct?mFuel*injectionLaw(t,p).dx:0,hinFuel=injected*(enthalpy(p.fuelT)-p.vaporization);
 const qc=mFuel*p.lhv*p.etaComb*combustionLaw(t,p).dx,qw=heatCoefficient(pressure,T,g.V,p)*g.wallArea*(T-p.wallT)*dt,work=pressure*g.dV;
 return [(mi+me)*dt+injected,qc-qw-work+(hin-hout)*dt+hinFuel,df*dt,work,qw,hin*dt,hout*dt,qc,mi*dt,me*dt,injected,hinFuel];
}
function rk4(t,y,h,p,fuel){const a=rates(t,y,p,fuel),b=rates(t+h/2,y.map((v,i)=>v+h*a[i]/2),p,fuel),c=rates(t+h/2,y.map((v,i)=>v+h*b[i]/2),p,fuel),d=rates(t+h,y.map((v,i)=>v+h*c[i]),p,fuel);return y.map((v,i)=>v+h*(a[i]+2*b[i]+2*c[i]+d[i])/6);}
function angles(p){const s=new Set([0,180,p.ivc,p.soc,360,p.soc+p.duration,p.evo,540,720]);if(p.direct){s.add(p.injectionStart);s.add(p.injectionStart+p.injectionDuration);}if(p.diesel){s.add(p.soc+p.premixDuration);s.add(p.soc+p.premixDuration*.5);}for(let t=0;t<720;t+=p.step)s.add(Number(t.toFixed(9)));return [...s].filter(x=>x>=0&&x<=720).sort((a,b)=>a-b);}
function sample(theta,y,p,fuel){const g=geometry(p,theta),T=temperature(y[1]/y[0]),pressure=y[0]*GAS_R*T/g.V,r=rates(theta,y,p,fuel),b=combustionLaw(theta,p);return {theta,p:pressure,T,m:y[0],U:y[1],fresh:y[2],x:g.x,V:g.V,velocity:g.velocity,acceleration:g.acceleration,beta:g.beta,dx:g.dx,xb:b.x,xf:injectionLaw(theta,p).x,qRelease:r[7],heatRate:r[4]*6*p.rpm,inletFlow:r[8]*6*p.rpm,exhaustFlow:r[9]*6*p.rpm,injectionRate:r[10]*6*p.rpm,W:y[3],Qwall:y[4],Hin:y[5],Hout:y[6],Qcomb:y[7]};}
export function simulateCycle(p,{record=true}={}){
 const times=angles(p),g0=geometry(p,0),m0=p.exhaustP*g0.V/(GAS_R*p.exhaustT);let init=[m0,m0*u(p.exhaustT)],result;
 for(let cycle=1;cycle<=p.maxCycles;cycle++){
  const start=[...init];let y=[...init,0,0,0,0,0,0,0,0,0,0],fuel=0,ivcState,rows=record?[sample(0,y,p,0)]:[],maxP=0,maxT=0;
  for(let j=1;j<times.length;j++){
   const t=times[j];y=rk4(times[j-1],y,t-times[j-1],p,fuel);
   if(Math.abs(t-p.ivc)<1e-7){fuel=y[2]/(p.alpha*p.stoich+(p.direct?0:1));ivcState={m:y[0],fresh:y[2],U:y[1],fuel};}
   const x=sample(t,y,p,fuel);maxP=Math.max(maxP,x.p);maxT=Math.max(maxT,x.T);if(record)rows.push(x);
  }
  const err=Math.max(Math.abs(y[0]-start[0])/Math.max(start[0],1e-10),Math.abs(y[1]-start[1])/Math.max(start[1],1e-8));
  result={rows,fuel,ivcState,cycles:cycle,periodicError:err,work:y[3],Qwall:y[4],Hin:y[5],Hout:y[6],Qcomb:y[7],netIntake:y[8],netExhaust:y[9],injectedMass:y[10],HinFuel:y[11],deltaU:y[1]-start[1],deltaM:y[0]-start[0],pmax:maxP,Tmax:maxT,
   massBalance:y[0]-start[0]-y[8]-y[9]-y[10],energyBalance:y[1]-start[1]-(y[7]-y[4]-y[3]+y[5]-y[6]+y[11])};
  if(err<p.periodicTolerance)break;init=y.slice(0,2);
 }
 if(result.periodicError>=p.periodicTolerance)throw Error('Не досягнуто періодичного стану за '+p.maxCycles+' циклів.');return result;
}
function interpolatePeriod(rows,theta,period,key){
 const angle=((theta%period)+period)%period;let lo=0,hi=rows.length-1;
 while(hi-lo>1){const mid=(lo+hi)>>1;if(rows[mid].theta<=angle)lo=mid;else hi=mid;}
 const a=rows[lo],b=rows[hi],f=(angle-a.theta)/(b.theta-a.theta);
 return a[key]+f*(b[key]-a[key]);
}
/** Identical cylinders with evenly spaced firing. Phase slots are not a firing-order assignment.
 * Torque includes gas pressure and reciprocating inertia, before mechanical friction.
 * Power is instantaneous at the imposed constant angular speed, in watts.
 */
export function cylinderTorqueAt(rows,p,theta){
 if(![360,720].includes(p.period)||!Number.isInteger(p.cylinders)||p.cylinders<1)throw Error('Invalid cycle or cylinder count');
 const out={theta},omega=p.rpm*Math.PI/30,interval=p.period/p.cylinders;let sum=0;
 for(let j=0;j<p.cylinders;j++){const torque=interpolatePeriod(rows,theta-j*interval,p.period,'torque');out['torqueCylinder'+(j+1)]=torque;out['powerCylinder'+(j+1)]=torque*omega;sum+=torque;}
 return {...out,torqueSum:sum,powerSum:sum*omega};
}
export function enginePoint(p,{dynamic=true}={}){
 const c=p.period===360?simulateTwoStroke(p,{record:dynamic}):simulateCycle(p,{record:dynamic}),g=geometry(p,0),rate=p.cylinders*p.rpm*6/p.period,cm=p.stroke*p.rpm/30;
 const suppliedFuel=c.fuelSupplied??c.fuel;
 const fmep=p.frictionA+p.frictionB*c.pmax+p.frictionC*cm+p.frictionD*cm*cm,Pi=c.work*rate,frictionPower=fmep*g.vd*rate,Pe=Pi-frictionPower,fuelPower=suppliedFuel*p.lhv*rate;
 const Qw=c.Qwall*rate,Hnet=(c.Hout-c.Hin-c.HinFuel)*rate,unreleased=fuelPower-c.Qcomb*rate;
 const s={rpm:p.rpm,firingIntervalDeg:p.period/p.cylinders,cycleAngleDeg:p.period,vd:g.vd,totalVolume:g.vd*p.cylinders,vc:g.vc,area:g.area,cm,imep:c.work/g.vd,fmep,bmep:Pe/(g.vd*rate),Pi,Pe,meanTorque:Pe/g.omega,meanIndTorque:Pi/g.omega,pmax:c.pmax,Tmax:c.Tmax,
 fuelPerCycle:suppliedFuel,retainedFuelPerCycle:c.fuel,fuelFlow:suppliedFuel*rate,bsfc:Pe>0?3.6e9*suppliedFuel*rate/Pe:null,etaE:Pe/fuelPower,etaI:Pi/fuelPower,etaM:Pi>0?Pe/Pi:null,
 work:c.work,Qw,Hnet,frictionPower,unreleased,fuelPower,residualFraction:1-c.ivcState.fresh/c.ivcState.m,trappedMass:c.ivcState.m,
 injectedMass:c.injectedMass,injectionMassError:p.direct?(c.injectedMass-c.fuel)/c.fuel:0,combustionIntegralError:(c.Qcomb-c.fuel*p.lhv*p.etaComb)/(c.fuel*p.lhv*p.etaComb),
 cycles:c.cycles,periodicError:c.periodicError,massBalance:c.massBalance,energyBalance:c.energyBalance,balanceResidual:fuelPower-(Pe+frictionPower+Qw+Hnet+unreleased+c.deltaU*rate),deltaU:c.deltaU,deltaM:c.deltaM,netIntake:c.netIntake,netExhaust:c.netExhaust,QcombCycle:c.Qcomb,QwallCycle:c.Qwall,HinCycle:c.Hin,HoutCycle:c.Hout,HinFuelCycle:c.HinFuel,
 coolantMassFlow:(Qw+.7*frictionPower)/(p.coolantCp*p.coolantRise)};
 let rows=[],torquePeriodRows=[];
 if(dynamic){rows=dynamics(c.rows,p);for(const row of rows)Object.assign(row,cylinderTorqueAt(rows,p,row.theta));
  const interval=p.period/p.cylinders;torquePeriodRows=[...rows.filter(row=>row.theta<interval).map(row=>cylinderTorqueAt(rows,p,row.theta)),cylinderTorqueAt(rows,p,interval)];
  let E=0,lo=0,hi=0;rows[0].energyFluctuation=0;
  for(let i=1;i<rows.length;i++){E+=((rows[i-1].torqueSum+rows[i].torqueSum)/2-s.meanIndTorque)*(rows[i].theta-rows[i-1].theta)*RAD;rows[i].energyFluctuation=E;lo=Math.min(lo,E);hi=Math.max(hi,E);}
  const dm=trapz(rows,x=>x.torqueSum,x=>x.theta*RAD)/(p.period*RAD);
  Object.assign(s,{energySwing:hi-lo,requiredTotalInertia:(hi-lo)/(p.speedIrregularity*g.omega**2),maxRodForce:Math.max(...rows.map(x=>Math.abs(x.rod))),maxGasForce:Math.max(...rows.map(x=>x.gas)),maxSideForce:Math.max(...rows.map(x=>Math.abs(x.side))),maxInertiaForce:Math.max(...rows.map(x=>Math.abs(x.inertia))),torqueWorkError:Math.abs(dm-s.meanIndTorque)/Math.max(1,Math.abs(s.meanIndTorque)),quadratureError:Math.abs(trapz(rows,x=>x.p,x=>x.V)-c.work)/Math.max(1,Math.abs(c.work)),pumpingWork:p.period===360?trapz(rows.filter(x=>x.theta>=p.portExhaustOpen&&x.theta<=p.portExhaustClose),x=>x.p,x=>x.V):trapz(rows.filter(x=>x.theta<=180),x=>x.p,x=>x.V)+trapz(rows.filter(x=>x.theta>=540),x=>x.p,x=>x.V)});
  for(const [name,t]of [['IVC',p.period===360?p.portExhaustClose:p.ivc],['SOC',p.soc],['EVO',p.period===360?p.portExhaustOpen:p.evo]]){const x=rows.find(x=>Math.abs(x.theta-t)<1e-7);s['p'+name]=x.p;s['T'+name]=x.T;}
 }
 return {params:p,summary:s,rows,torquePeriodRows};
}
export function sizeEngine(p){
 const target=engineTarget(p),rpm=engineSpeed(p),iterations=[];let calculated=null;
 if(p.mode==='design'){
  const V=(p.engineCycle==='two-stroke'?60:120)*target/(p.bmepSeed*rpm),D0=Math.cbrt(4*V/(p.cylinders*Math.PI*p.strokeBore));let lower=.025,upper=Math.min(.25,.35/p.strokeBore),D=Math.max(lower+1e-4,Math.min(upper-1e-4,D0));
  for(let i=0;i<30;i++){
   const s=enginePoint(cycleParameters(p,D,D*p.strokeBore),{dynamic:false}).summary,residual=(s.Pe-target)/target;
   iterations.push({iteration:i+1,bore:D,stroke:D*p.strokeBore,powerW:s.Pe,residual});
   if(Math.abs(residual)<1e-5){calculated={bore:D,stroke:D*p.strokeBore,seedBore:D0,seedVolume:V,converged:true};break;}
   if(s.Pe<target)lower=D;else upper=D;
   const trial=s.Pe>0?D*Math.cbrt(target/s.Pe):(D+upper)/2;
   D=trial>lower&&trial<upper?trial:(lower+upper)/2;
  }
  if(!calculated)throw Error('Проєктний пошук не збігся: перевірте вимогу, наддув, S/D і межі геометрії.');
 }
 const adopted=p.mode==='check'||p.adoption==='manual'?{bore:p.bore,stroke:p.stroke,status:p.mode==='check'?'given':'manually-adopted'}:{...calculated,status:'calculated'};
 if(p.mode==='design'&&p.adoption==='rounded'){const step=p.geometryStep??.001;adopted.bore=Math.ceil((calculated.bore-1e-12)/step)*step;adopted.stroke=Math.ceil((calculated.stroke-1e-12)/step)*step;adopted.status='rounded-recalculated';for(let j=0;j<10;j++){const q=enginePoint(cycleParameters(p,adopted.bore,adopted.stroke),{dynamic:false});if(q.summary.Pe>=target*(1-5e-5))break;adopted.bore+=step;}}
 const point=enginePoint(cycleParameters(p,adopted.bore,adopted.stroke));return {calculated,adopted,iterations,point,targetPower:target,powerResidual:(point.summary.Pe-target)/target};
}
export function engineCharacteristics(p,result,{loads=true,sampling=Array.from({length:9},(_,i)=>i/8),loadSampling=[.08,.25,.5,.75,1]}={}){
 const n=engineSpeed(p),min=(p.sweepMinSpeed??Math.max(10,n/60*.3))*60,max=(p.sweepMaxSpeed??n/60)*60;if(sampling.some(x=>!Number.isFinite(x)||x<0||x>1))throw Error('Некоректна частотна CSV-сітка');const ns=[...new Set([...sampling.map(f=>min+(max-min)*f),n])].sort((a,b)=>a-b);const speed=[],fuelCurves=[];
 for(const rpm of ns){const base=cycleParameters(p,result.adopted.bore,result.adopted.stroke,rpm),full=Math.abs(rpm-n)<1e-6?result.point.summary:enginePoint(base,{dynamic:false}).summary;speed.push({...full});
  if(loads){const points=[];for(const fraction of loadSampling){
   try{const q={...base};if(p.fuelType==='gasoline'){if(base.period===360)q.scavengeP=base.exhaustP+(base.scavengeP-base.exhaustP)*fraction;else q.intakeP=base.intakeP*(.18+.82*fraction);}else q.alpha=base.alpha/fraction;
    const x=fraction===1?full:enginePoint(q,{dynamic:false}).summary;points.push({torqueNm:x.meanTorque,fuelKgS:x.fuelFlow,load:fraction});}catch{/* Failed physical points stay absent, never zero-filled. */}
  }
  points.sort((a,b)=>a.torqueNm-b.torqueNm);const neg=points.filter(x=>x.torqueNm<0).at(-1),pos=points.find(x=>x.torqueNm>=0);let valid=points.filter(x=>x.torqueNm>=0);
  if(neg&&pos){const f=-neg.torqueNm/(pos.torqueNm-neg.torqueNm);valid.unshift({torqueNm:0,fuelKgS:neg.fuelKgS+f*(pos.fuelKgS-neg.fuelKgS),load:null,method:'interpolated-zero-brake-torque'});}
  fuelCurves.push({rpm,points:valid});
  }
 }
 return {speed,fuelCurves,loadMethod:p.fuelType==='gasoline'?(p.engineCycle==='two-stroke'?'Заданий тиск продувки p_sc=p_ex+(p_sc0−p_ex)L; сталий склад суміші. Навчальна серія, не карта реального регулятора. Витрата PFI враховує всю подану суміш, включно з незахопленим паливом.':'Задане дроселювання p_in=p_in0(0.18+0.82L); фіксоване тепловиділення.'):'Фіксоване повітрозабезпечення, α=α0/L; фіксовані фази. Не карта реального регулятора наддуву.'};
}
