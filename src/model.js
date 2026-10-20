import {technicalModules} from '../vendor/technical-modules/consumer-provenance.mjs';
import {evaluateStation} from './station.js';
import {evaluateFleet,evaluatePlanning} from './planning.js';
import {evaluateSchedule} from './scheduler.js';
import {evaluateAbs,evaluateHold,evaluateAdas,evaluateAnnual,evaluatePilot} from './exercises.js';
export function evaluateProject(data,diagnostic,state){
 const schedule=evaluateSchedule(data,state);
 const safe=fn=>{try{return fn();}catch(e){return {error:e.message};}};
 const station=safe(()=>evaluateStation(data,state));
 const fleet=safe(()=>evaluateFleet(data,state));
 const annual=fleet.error?{error:fleet.error}:safe(()=>evaluateAnnual(data,state,fleet));
 const planning=safe(()=>evaluatePlanning(data,state,annual,fleet));
 const abs=safe(()=>evaluateAbs(diagnostic,state.abs)),hold=safe(()=>evaluateHold(schedule)),adas=safe(()=>evaluateAdas(state.adas)),pilot=safe(()=>evaluatePilot(state.pilot,state.parking));
 return {station,schedule,abs,hold,adas,annual,pilot,fleet,planning,technicalModules,modules:[...(station.module?[station.module,station.economicModule]:[]),...schedule.modules,...[abs,hold,adas,annual,fleet,planning].flatMap(m=>m.module?[m.module]:[])],evaluatedAt:new Date().toISOString()};
}
