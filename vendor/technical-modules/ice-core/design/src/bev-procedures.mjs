/** Model cases following the user's BEV procedure stage tables.
 * SOC termination substitutes for the regulatory speed-tolerance break-off.
 * DC terminal energy and chemical SOC energy are kept distinct throughout.
 */
import {isWLTC,wltcProfile} from './wltc.mjs';
import {performanceProcedureCases} from './bev-performance.mjs';
export function bevProcedureCases(p,b,e,roadEnergy){
 if(p.system!=='electric'||p.evRangeMode!=='cycle'||!isWLTC(p.missionCycle)||(p.bevProcedure??'both')==='route')return null;
 const x=e.range,pk=x.pack,start=p.socMax,usable=pk.energy*(start-p.socMin),speed=(p.bevCssSpeed??100/3.6)*3.6,acc=p.bevCssAcceleration??.5;
 const profile=wltcProfile(p,b),cycle=profile.rows;
 if(p.bevTermination==='performance')return performanceProcedureCases(p,e,profile,b.bevProcedures);
 const city=cycle.filter(z=>z.time_s<=profile.cityDuration),duration=cycle.at(-1).time_s;
 const definitions=b.bevProcedures;
 if(!definitions?.full?.length||!definitions?.short?.length)throw Error('Немає таблиць процедур BEV.');
 if(definitions.full.filter(z=>z.record_type==='driving').map(z=>z.segment).join(',')!=='WLTC_REPEAT')throw Error('Непідтримана послідовна процедура BEV.');
 const sequence=definitions.short.filter(z=>z.record_type==='driving').map(z=>z.segment);
 if(sequence.join(',')!=='DS1_WLTC,DS1_CITY,CSS_M,DS2_WLTC,DS2_CITY,CSS_E')throw Error('Непідтримана послідовність скороченої процедури BEV.');
 const initial=()=>({t:0,d:0,chem:0,terminal:0,peak:0,feasible:true,ended:false,stages:[],rows:[{time_s:0,time_min:0,distance_km:0,speed_kmh:0,soc_pct:start*100,chemical_used_kwh:0,terminal_used_kwh:0,remaining_kwh:usable/3.6e6,segment:'START'}]});
 function run(st,trace,label,keep=true){
  if(st.ended)return null;
  const pp={...p,socInitial:start-st.chem/pk.energy},r=roadEnergy(pp,e,pk,x.mass,trace,{rows:true,peakUsedSeconds:st.peak});
  const t0=st.t,d0=st.d,c0=st.chem,u0=st.terminal;let before={time_s:0,distance_km:0,energy_kwh:0,speed_kmh:trace[0].speed_kmh};
  let localT=0,localD=0,localC=0,localU=0,cityU=0,cityD=0;
  for(const q of r.rows){
   const dt=q.time_s-before.time_s,dc=(q.energy_kwh-before.energy_kwh)*3.6e6;
   const f=dc>0?Math.min(1,Math.max(0,(usable-st.chem)/dc)):1;
   localT+=dt*f;localD+=(q.distance_km-before.distance_km)*1000*f;localC+=dc*f;localU+=q.dc_kw*1000*dt*f;
   if(q.time_s<=profile.cityDuration){cityU=localU;cityD=localD;}
   if(q.current_a===null||q.deficit_kw>1e-6||q.speed_kmh/3.6/p.wheelRadius*p.driveRatio*30/Math.PI>e.motor.maxRpm+1e-6)st.feasible=false;
   st.t=t0+localT;st.d=d0+localD;st.chem=c0+localC;st.terminal=u0+localU;
   if(keep)st.rows.push({time_s:st.t,time_min:st.t/60,distance_km:st.d/1000,speed_kmh:before.speed_kmh+(q.speed_kmh-before.speed_kmh)*f,soc_pct:100*(start-st.chem/pk.energy),chemical_used_kwh:st.chem/3.6e6,terminal_used_kwh:st.terminal/3.6e6,remaining_kwh:Math.max(0,usable-st.chem)/3.6e6,segment:label});
   if(f<1||st.chem>=usable-1e-5){st.ended=true;break;}before=q;
  }
  st.peak=r.peakSeconds;
  const z={segment:label,start_s:t0,end_s:st.t,duration_s:localT,distance_km:localD/1000,chemical_kwh:localC/3.6e6,terminal_kwh:localU/3.6e6,end_soc_pct:100*(start-st.chem/pk.energy),completed:localT>=trace.at(-1).time_s-1e-7,city_terminal_kwh:cityU/3.6e6,city_distance_km:cityD/1000};st.stages.push(z);return z;
 }
 function css(hold,brake){
  const ramp=speed/3.6/acc,n=Math.ceil(ramp),a=[{time_s:0,speed_kmh:0,grade_ratio:p.grade}];
  for(let j=1;j<=n;j++)a.push({time_s:ramp*j/n,speed_kmh:speed*j/n,grade_ratio:p.grade});
  if(hold>0)a.push({time_s:ramp+hold,speed_kmh:speed,grade_ratio:p.grade});
  if(brake)for(let j=1;j<=n;j++)a.push({time_s:ramp+hold+ramp*j/n,speed_kmh:speed*(1-j/n),grade_ratio:p.grade});
  return a;
 }
 const result=(st,id,ec,weights=null,reason=null)=>({id,rows:st.rows,stages:st.stages,startSoc:start,endSoc:start-st.chem/pk.energy,usableChemicalKWh:usable/3.6e6,chemicalKWh:st.chem/3.6e6,terminalKWh:st.terminal/3.6e6,heatKWh:(st.chem-st.terminal)/3.6e6,testDistanceKm:st.d/1000,timeSeconds:st.t,feasible:st.feasible,completed:st.ended,stopReason:reason??(st.ended?'Модельна межа SOC_min':'Досягнуто обчислювальної межі'),dcWhKm:ec,weights,rangeKm:st.feasible&&st.ended&&ec>0?st.terminal/3600/ec:null,rechargeKWh:st.chem/3.6e6/p.evChargeEfficiency,acKWh100:st.feasible&&st.ended&&ec>0?(st.chem/3.6e6/p.evChargeEfficiency)/(st.terminal/3600/ec)*100:null,peakSeconds:st.peak});
 let full=null,short=null;
 if(['full','both'].includes(p.bevProcedure??'both')){
  const st=initial();let cycles=0;
  while(!st.ended&&cycles<100&&st.t<180000){const z=run(st,cycle,'WLTC_'+(++cycles));if(z.chemical_kwh<=0)break;}
  const complete=st.stages.filter(z=>z.completed),sum=(key)=>complete.reduce((a,z)=>a+z[key],0),ec=sum('distance_km')>0?sum('terminal_kwh')*1000/sum('distance_km'):null;
  full={...result(st,'full',ec),completeCycles:complete.length,cycleAttempts:cycles};
 }
 if(['short','both'].includes(p.bevProcedure??'both')){
  const st=initial();let reason=null,hold=0;
  if(speed<profile.cssMinimum-1e-7)reason='Для цього чотирифазного випадку CSS має бути не менше '+profile.cssMinimum.toFixed(1)+' км/год.';
  if(profile.capKmh!==null&&speed>profile.capKmh+1e-7)reason='CSS перевищує введену граничну швидкість автомобіля.';
  if(speed/3.6/acc>60+1e-7)reason='Перехід CSS триває понад 60 с; перевірте прискорення.';
  if(speed>x.achievableMaxSpeed+1e-5)reason='Обрана CSS-швидкість перевищує доступну тривалу швидкість автомобіля.';
  if(reason){short={...result(st,'short',null,null,reason),feasible:false,cssSpeedKmh:speed};}
  else{
   run(st,cycle,'DS1_WLTC');run(st,city,'DS1_CITY');
   // Select CSS_M so that 5% of model chemical usable energy remains after DS2.
   // Verify the actual remaining fraction of terminal energy after the final stage.
   const residual=usable*.05;
   function trial(h){const q={...st,rows:[],stages:[]};run(q,css(h,true),'CSS_M',false);run(q,cycle,'DS2_WLTC',false);run(q,city,'DS2_CITY',false);return q;}
   if(st.ended||trial(0).chem>usable-residual){reason='Батареї недостатньо для двох динамічних сегментів і переходів CSS.';}
   else{
    let lo=0,hi=3600;while(trial(hi).chem<usable-residual&&hi<144000)hi*=2;
    for(let j=0;j<22;j++){const mid=(lo+hi)/2;if(trial(mid).chem<usable-residual)lo=mid;else hi=mid;}hold=(lo+hi)/2;
    for(const key of sequence.slice(2)){if(key==='CSS_M')run(st,css(hold,true),key);else if(key.endsWith('WLTC'))run(st,cycle,key);else if(key.endsWith('CITY'))run(st,city,key);else run(st,css(144000,false),key);}
   }
   const a=st.stages.find(z=>z.segment==='DS1_WLTC'),z=st.stages.find(z=>z.segment==='DS2_WLTC'),end=st.stages.find(z=>z.segment==='CSS_E');
   const k=a&&st.terminal>0?a.terminal_kwh*3.6e6/st.terminal:null,ec=a?.completed&&z?.completed&&k!==null?(a.terminal_kwh/a.distance_km*k+z.terminal_kwh/z.distance_km*(1-k))*1000:null;
   const finalShare=end&&st.terminal>0?end.terminal_kwh*3.6e6/st.terminal:null;
   if(finalShare!==null&&finalShare>.1+1e-6)reason='Заключний CSS перевищує 10% сумарної клемної енергії; скорочений випадок не підтверджено.';
   if(reason)st.feasible=false;
   short={...result(st,'short',ec,k===null?null:[k,1-k],reason),cssSpeedKmh:speed,cssHoldSeconds:hold,finalTerminalFraction:finalShare};
  }
 }
 return {full,short,startSoc:start,endSoc:p.socMin,cssSpeedKmh:speed,cssAcceleration:acc,traceDuration:duration,cityDuration:city.at(-1).time_s,termination:'soc',profile,phaseSpeeds:profile.phases,definitions,method:'Model of supplied procedure sequence; selected four-phase WLTC Class 3a/3b; SOC_max to SOC_min; constant Voc/R; no thermal recovery; cumulative peak budget over entire experiment; SOC break-off instead of regulatory trace tolerance; model charging efficiency instead of measured AC recharge; no certification corrections.'};
}
