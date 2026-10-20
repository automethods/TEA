import { installComponent } from './component-package.mjs';
import { lookup } from './maps.mjs';
import {createCalculatedEngineComponent} from '../engine-inputs/index.mjs';

export const moduleId = 'module.engine.component';
export const moduleVersion = '0.2.0';
export const modelId = 'ice-fuel-grid/1';
const failure = reason => ({ status: 'invalid-input', moduleId, moduleVersion, modelId, outputs: null, reason });

// Validate once, then retain a private package snapshot for repeated cycle queries.
// The public package is another clone so caller edits cannot alter the evaluator.
export function createEngineComponent(packet) {
  try {
    if (packet?.format === 'vehicle-engine-inputs/1') {
      const component=createCalculatedEngineComponent(packet);
      return {...component,moduleId,moduleVersion,evaluate:inputs=>({...component.evaluate(inputs),moduleId,moduleVersion})};
    }
    if (packet?.componentType !== 'engine') return failure('engine-package-required');
    const supplied = packet.component, map = supplied?.map;
    if (map?.boundary !== 'crankshaft' || !map.componentId?.trim()
        || supplied.id !== map.componentId || !supplied.sourceClass?.trim()) {
      return failure('engine-identity-boundary-or-evidence-missing');
    }
    installComponent(packet, { engines: [], motors: [], parameters: [{ key: 'engineId', options: [] }] });
    const retained = structuredClone(packet);
    const component = retained.component;
    const source = retained.component.map;
    const evaluate = ({ engineAngularSpeedRadPerS, engineShaftTorqueNm } = {}) => {
      if (![engineAngularSpeedRadPerS, engineShaftTorqueNm].every(Number.isFinite)
          || engineAngularSpeedRadPerS <= 0 || engineShaftTorqueNm < 0) return failure('invalid-engine-operating-point');
      const rawRpm = engineAngularSpeedRadPerS * 30 / Math.PI;
      const rpm = [...source.rpm, component.minRpm, component.maxRpm]
        .find(value => Math.abs(value - rawRpm) <= 1e-10 * Math.max(1, value)) ?? rawRpm;
      if (rpm < component.minRpm || rpm > component.maxRpm) return failure('outside-component-speed');
      const result = lookup(source, rpm, engineShaftTorqueNm);
      if (!result.ok) return failure(result.reason);
      const fuelMassFlowKgPerS = result.value / 1000;
      const engineShaftPowerW = engineAngularSpeedRadPerS * engineShaftTorqueNm;
      const fuelThermalPowerW = fuelMassFlowKgPerS * retained.component.lhvJkg;
      const engineEfficiency = fuelThermalPowerW > 0 ? engineShaftPowerW / fuelThermalPowerW : null;
      if (![fuelMassFlowKgPerS, engineShaftPowerW, fuelThermalPowerW].every(Number.isFinite)
          || (engineShaftPowerW > 0 && (!(engineEfficiency > 0) || engineEfficiency > 1 + 1e-12))) {
        return failure('nonphysical-engine-energy-balance');
      }
      return { status: 'ok', moduleId, moduleVersion, modelId,
        outputs: { fuelMassFlowKgPerS, engineShaftPowerW, fuelThermalPowerW, engineEfficiency },
        evidence: result.evidence, interpolated: result.interpolated };
    };
    return { status: 'ok', moduleId, moduleVersion, modelId, package: structuredClone(retained),
      properties: { fuelLowerHeatingValueJPerKg: retained.component.lhvJkg,
        fuelDensityKgPerM3: retained.component.fuelDensityKgL * 1000 }, evaluate };
  } catch (error) {
    return failure(error.message);
  }
}
