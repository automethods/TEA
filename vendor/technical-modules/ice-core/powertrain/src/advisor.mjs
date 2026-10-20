/** Finite catalogue screening, not a global optimum or a procurement recommendation. */
import {makePatch,validatePatch,motorDefaults} from './setup.mjs';
import {assessRequirements} from './requirements.mjs';
import {simulateMission} from './simulation.mjs';
export function candidatePatches(params,bundle,locked=[]){
 if(params.architecture==='ice')return [makePatch(params,{},locked,'Чинний ДВЗ: змінюйте джерело/передачу явно')];
 const results=[],seen=new Set();
 const ratios=['bev','series'].includes(params.architecture)?[4.5,5.5,7]:[3.2,3.7,4.2];
 const energies=params.architecture==='bev'?[48,72]:[12,24];
 for(const m of bundle.motors)for(const count of [1,2])for(const ratio of ratios)for(const batteryKWh of energies){
  const hardware=motorDefaults(bundle,m.id),isDedicated=['bev','series'].includes(params.architecture);
  const proposal={...hardware,motorCount:count,batteryKWh,
   [isDedicated?'motorRatio':'finalDrive']:ratio,
   dischargeA:Math.min(1500,hardware.dischargeA*count),chargeA:Math.min(1000,hardware.chargeA*count)};
  const patch=makePatch(params,proposal,locked,`${count} × ${m.name}; ${batteryKWh} кВт·год`);
  const key=JSON.stringify(patch.params);if(seen.has(key))continue;seen.add(key);results.push(patch);
 }
 return results;
}
export function evaluateCandidate(patch,bundle,cycle){
 try{
  validatePatch(patch,bundle);
  const requirements=assessRequirements(patch.params,bundle,{accelerationStep:.2}),mission=simulateMission(patch.params,bundle,cycle);
  const failures=requirements.checks.filter(x=>!x.pass).map(x=>x.label);
  if(!mission.summary.feasible)failures.push('Заданий їздовий цикл не забезпечено');
  if(mission.summary.voltageLimitedSeconds>0)failures.push('Місія виходить за табличну опору напруги мотора');
  const p=patch.params;
  return {patch,passed:failures.length===0,failures,checks:requirements.checks,accelerationS:requirements.acceleration.timeS,
   fuelL100km:mission.summary.fuelL100km,batteryKWh100km:mission.summary.batteryKWh100km,
   finalSoc:mission.summary.finalSoc,unmetSeconds:mission.summary.unmetSeconds,
   extrapolationSeconds:mission.summary.motorExtrapolationSeconds,warnings:requirements.warnings,
   rank:failures.length*10000+p.batteryKWh+15*p.motorCount,
   limits:'Не ціна; скінченна сітка; батарея й інвертор — задані припущення. Немає спільного ранжування різних архітектур.'};
 }catch(error){return {patch,passed:false,failures:[error.message],rank:1e9,accelerationS:null};}
}
export function sortCandidates(items){return [...items].sort((a,b)=>Number(b.passed)-Number(a.passed)||a.rank-b.rank||(a.accelerationS??Infinity)-(b.accelerationS??Infinity));}
