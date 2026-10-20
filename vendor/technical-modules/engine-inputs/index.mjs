import {sha256Text} from '../ice-core/vendor/engdoc/runtime.js';
import {fuel, RPM_TO_RAD} from '../ice-core/powertrain/src/engine.mjs';

export const format='vehicle-engine-inputs/1';
export const modelId='ice-calculated-fuel-curves/1';
const digest=packet=>{const value=structuredClone(packet);delete value.sha256;return sha256Text(JSON.stringify(value));};

// The ICE producer supplies its existing calculated engine record. This file
// adds the exchange envelope, retaining the original irregular fuel curves.
export function makeEngineInputs(engine, {applicationVersion, fuelCarrier, inputRevision, sourceRevision, calculationRevision, sources, moduleReleaseSha256}={}) {
  const component=structuredClone(engine);
  component.map={boundary:'crankshaft',componentId:component.id,source:component.source,
    sourceVersion:applicationVersion,evidence:component.sourceClass,
    provenance:{producer:'ICE Design',inputRevision,sourceRevision,calculationRevision,
      ...(moduleReleaseSha256===undefined?{}:{moduleReleaseSha256}),sources:structuredClone(sources || [])}};
  const packet={format,componentType:'engine',fuelCarrier,component};
  packet.sha256=digest(packet);readEngineInputs(packet);return packet;
}
export function readEngineInputs(packet) {
  if (!packet || packet.format!==format || packet.componentType!=='engine' || !['gasoline','diesel'].includes(packet.fuelCarrier)) throw Error('Unsupported engine input file');
  if (!/^[a-f0-9]{64}$/.test(packet.sha256 || '') || digest(packet)!==packet.sha256) throw Error('Engine input checksum mismatch');
  const e=packet.component;
  if (!e || e.kind!=='calculated' || e.sourceClass!=='model-estimated' || e.boundary!=='crankshaft' || !e.id?.trim() || !e.source?.trim()
      || e.map?.componentId!==e.id || e.map?.boundary!=='crankshaft' || e.map?.evidence!==e.sourceClass || e.map?.source!==e.source) throw Error('Engine identity or evidence mismatch');
  if (![e.lhvJkg,e.fuelDensityKgL,e.minRpm,e.maxRpm,e.maxPowerKW,e.maxTorqueNm].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>0)
      || e.maxRpm<=e.minRpm) throw Error('Invalid engine properties');
  if (!Array.isArray(e.rpm) || e.rpm.length<3 || e.rpm.length>100 || e.torqueNm?.length!==e.rpm.length || e.fuelCurves?.length!==e.rpm.length) throw Error('Incomplete engine curves');
  e.rpm.forEach((n,i)=>{
    if (!Number.isFinite(n)||n<=0||(i&&n<=e.rpm[i-1])||!Number.isFinite(e.torqueNm[i])||e.torqueNm[i]<0) throw Error('Invalid engine envelope');
    const row=e.fuelCurves[i];
    if (row?.rpm!==n||!Array.isArray(row.points)||row.points.length<1||row.points.length>50) throw Error('Invalid fuel curve');
    row.points.forEach((q,j)=>{if(!Number.isFinite(q.torqueNm)||q.torqueNm<0||!Number.isFinite(q.fuelKgS)||q.fuelKgS<0||(j&&q.torqueNm<=row.points[j-1].torqueNm))throw Error('Invalid fuel point');});
  });
  if (e.rpm[0]!==e.minRpm || e.rpm.at(-1)!==e.maxRpm
      || Math.abs(Math.max(...e.torqueNm)-e.maxTorqueNm)>1e-8*Math.max(1,e.maxTorqueNm)
      || Math.abs(Math.max(...e.rpm.map((n,i)=>n*RPM_TO_RAD*e.torqueNm[i]/1000))-e.maxPowerKW)>1e-8*Math.max(1,e.maxPowerKW)) throw Error('Engine ratings do not match the source curve');
  const provenance=e.map.provenance;
  for (const key of ['inputRevision','sourceRevision','calculationRevision']) if(!/^sha256:[a-f0-9]{64}$/.test(provenance?.[key]||''))throw Error('Missing source revision');
  if (!Array.isArray(provenance.sources)||!provenance.sources.length) throw Error('Missing engine sources');
  return structuredClone(packet);
}
export function createCalculatedEngineComponent(packet) {
  const retained=readEngineInputs(packet),e=retained.component;
  const evaluate=({engineAngularSpeedRadPerS,engineShaftTorqueNm}={})=>{
    if (![engineAngularSpeedRadPerS,engineShaftTorqueNm].every(Number.isFinite)||engineAngularSpeedRadPerS<=0||engineShaftTorqueNm<0) return {status:'invalid-input',reason:'invalid-engine-operating-point',outputs:null};
    const raw=engineAngularSpeedRadPerS/RPM_TO_RAD,rpm=e.rpm.find(n=>Math.abs(n-raw)<=1e-10*Math.max(1,n))??raw;
    const f=fuel(e,rpm,engineShaftTorqueNm);
    if(!f.known)return {status:'invalid-input',reason:f.reason,outputs:null};
    const engineShaftPowerW=engineAngularSpeedRadPerS*engineShaftTorqueNm,fuelThermalPowerW=f.kgS*e.lhvJkg,
      engineEfficiency=fuelThermalPowerW>0?engineShaftPowerW/fuelThermalPowerW:null;
    if(engineShaftPowerW>0&&(!(engineEfficiency>0)||engineEfficiency>1+1e-12))return {status:'invalid-input',reason:'nonphysical-engine-energy-balance',outputs:null};
    return {status:'ok',modelId,outputs:{fuelMassFlowKgPerS:f.kgS,engineShaftPowerW,fuelThermalPowerW,engineEfficiency},evidence:'model-estimated'};
  };
  return {status:'ok',modelId,package:structuredClone(retained),properties:{fuelLowerHeatingValueJPerKg:e.lhvJkg,fuelDensityKgPerM3:e.fuelDensityKgL*1000},evaluate};
}
export function engineInputControls(packet) {
  const {component:e}=readEngineInputs(packet);
  const powers=e.rpm.map((n,i)=>n*RPM_TO_RAD*e.torqueNm[i]/1000),i=powers.indexOf(Math.max(...powers));
  return {engineCurveMode:'measured',enginePoints:'n_rpm,M_nm\n'+e.rpm.map((n,j)=>n+','+e.torqueNm[j]).join('\n'),
    enginePointsSource:e.source+'; model-estimated; SHA-256 '+packet.sha256,engineMaxPowerKw:powers[i],
    engineRatedRpm:e.rpm[i],engineMaxTorqueNm:e.maxTorqueNm,engineEfficiencyCsv:JSON.stringify(packet,null,2),engineEfficiencySource:e.source};
}
