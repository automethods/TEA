/** Repeated model evaluations; no claim of an OEM controller or experimental validation. */
import {simulateMission} from './simulation.mjs';
export function matchTerminalSoc(params,bundle,cycle,{tolerance=.001,maxIterations=30}={}){
 if(!['parallel','series'].includes(params.architecture))throw Error('Узгодження SOC застосовується до гібридів.');
 if(!(tolerance>0&&tolerance<=.01&&Number.isInteger(maxIterations)&&maxIterations>0&&maxIterations<=60))throw Error('Межі пошуку SOC.');
 const rows=[];const run=targetSoc=>{try{const r=simulateMission({...params,targetSoc},bundle,cycle),x={targetSoc,deltaSoc:r.summary.socDelta,feasible:r.summary.feasible,fuelKnown:r.summary.fuelKnown,summary:r.summary};rows.push(x);return x;}catch(e){const x={targetSoc,error:e.message};rows.push(x);return x;}};
 const lo=params.socMin+.021,hi=params.socMax-.021;if(lo>=hi)throw Error('Вікно SOC замале для гістерезису.');
 let best=null;for(let i=0;i<=8;i++){const r=run(lo+(hi-lo)*i/8);if(!r.error&&(!best||Math.abs(r.deltaSoc)<Math.abs(best.deltaSoc)))best=r;}
 const candidates=rows.filter(x=>!x.error).sort((a,b)=>a.targetSoc-b.targetSoc);let a,b;
 for(let i=1;i<candidates.length;i++)if(candidates[i-1].deltaSoc*candidates[i].deltaSoc<=0){a=candidates[i-1];b=candidates[i];break;}
 for(let i=0;a&&b&&i<maxIterations&&Math.abs(best.deltaSoc)>tolerance;i++){const m=run((a.targetSoc+b.targetSoc)/2);if(m.error)break;if(Math.abs(m.deltaSoc)<Math.abs(best.deltaSoc))best=m;if(a.deltaSoc*m.deltaSoc<=0)b=m;else a=m;}
 return {format:'soc-matching-audit/1',converged:!!best&&Math.abs(best.deltaSoc)<=tolerance,targetSoc:best?.targetSoc??null,deltaSoc:best?.deltaSoc??null,tolerance,matched:best?.summary??null,trials:rows,
  interpretation:'Only final SOC matched with unchanged initial SOC by varying the explicit rule-controller target. With a mapped battery, fuel-comparison eligibility also requires a temperature return within 0.1 K; this is a screening tolerance, not a certification rule. This is not energy-optimal control, an OEM strategy or a certified fuel-economy correction.',canCompareFuel:!!best&&Math.abs(best.deltaSoc)<=tolerance&&best.feasible&&best.fuelKnown&&(!best.summary.batteryModel||Math.abs(best.summary.finalBatteryTemperatureK-best.summary.initialBatteryTemperatureK)<.1)};
}
export function sensitivityMission(params,bundle,cycle,scenarios){
 if(!Array.isArray(scenarios)||scenarios.length>30)throw Error('Допускається не більше 30 явно заданих сценаріїв.');const baseline=simulateMission(params,bundle,cycle).summary;
 const results=scenarios.map(({label,patch})=>{try{const summary=simulateMission({...params,...patch},bundle,cycle).summary;return {label,patch,summary,deltaFuelKg:summary.fuelKnown&&baseline.fuelKnown?summary.fuelKg-baseline.fuelKg:null,deltaBatteryKWh:summary.batteryKWh-baseline.batteryKWh};}catch(e){return {label,patch,error:e.message};}});
 return {format:'mission-sensitivity/1',baseline,results,interpretation:'Finite deterministic perturbations, not confidence intervals. Fuel must be read together with SOC, feasibility and map coverage.'};
}
