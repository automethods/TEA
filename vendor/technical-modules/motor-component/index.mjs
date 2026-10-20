import { installComponent } from '../engine-component/component-package.mjs';
import { motorEnvelope, motorPower, boundedMotor } from './motor.mjs';
import { lookup } from '../engine-component/maps.mjs';

export const moduleId = 'module.motor.component';
export const moduleVersion = '0.1.2';
export const modelId = 'ice-motor-loss-grid/1';
const failure = reason => ({ status: 'invalid-input', moduleId, moduleVersion, modelId, outputs: null, reason });

export function createMotorComponent(packet) {
  try {
    if (packet?.componentType !== 'motor') return failure('complete-motor-package-required');
    const supplied = packet.component;
    if (!supplied?.sourceClass?.trim() || supplied.id !== supplied.map?.componentId
        || !['motor-only', 'motor+inverter'].includes(supplied.map?.boundary)) return failure('motor-identity-boundary-or-evidence-missing');
    if (supplied.maxDcW !== undefined && (!Number.isFinite(supplied.maxDcW) || supplied.maxDcW <= 0)) return failure('invalid-motor-dc-limit');
    installComponent(packet, { engines: [], motors: [], parameters: [{ key: 'motorId', options: [] }] });
    const retained = structuredClone(packet), motor = retained.component;
    const operatingPoint = (inputs = {}) => {
      const { motorAngularSpeedRadPerS: omega, motorShaftTorqueNm: torque = 0,
        inverterEfficiency, rating = 'continuous', peakExposureS } = inputs;
      if (![omega, torque].every(Number.isFinite) || omega < 0 || !['continuous', 'peak'].includes(rating)) return failure('invalid-motor-operating-point');
      if (rating === 'peak' && (!Number.isFinite(peakExposureS) || peakExposureS < 0 || peakExposureS > motor.peakDutySeconds)) return failure('peak-duty-context-required');
      const voltage = inputs.motorTerminalVoltageV, envelope = motor.voltageEnvelope;
      if (voltage !== undefined && voltage !== null) {
        if (!Number.isFinite(voltage) || voltage <= 0) return failure('invalid-motor-terminal-voltage');
        if (envelope && (!(envelope.maximumTerminalVoltageV > 0 && envelope.maxLoadRpmPerV > 0)
          || voltage > envelope.maximumTerminalVoltageV || omega * 30 / Math.PI > voltage * envelope.maxLoadRpmPerV + 1e-8)) return failure('motor-voltage-speed-envelope');
      }
      const eta = motor.boundary === 'motor+inverter' ? 1 : inverterEfficiency;
      if (!Number.isFinite(eta) || eta <= 0 || eta > 1) return failure('motor-only-requires-inverter-efficiency');
      const rawRpm = omega * 30 / Math.PI;
      const rpm = [...motor.map.rpm, motor.maxRpm].find(n => Math.abs(n - rawRpm) <= 1e-10 * Math.max(1,n)) ?? rawRpm;
      if (rpm > motor.maxRpm) return failure('motor-speed');
      return { rpm, torque, eta, rating };
    };
    const result = (native, point) => {
      if (!native.ok) return failure(native.reason);
      const torque = native.torque ?? point.torque;
      const raw = lookup(motor.map, point.rpm, torque);
      if (!raw.ok) return failure(raw.reason);
      const outputs = { motorShaftPowerW: native.mechanicalW, motorElectricalPowerW: native.dcW,
        mappedLossPowerW: native.motorLossW, additionalInverterLossPowerW: native.inverterLossW,
        motorShaftTorqueNm: torque };
      if (!Object.values(outputs).every(Number.isFinite) || outputs.mappedLossPowerW < 0
          || outputs.additionalInverterLossPowerW < -1e-9) return failure('nonphysical-motor-power');
      return { status: 'ok', moduleId, moduleVersion, modelId, outputs, boundary: motor.boundary,
        evidence: raw.evidence, interpolated: raw.interpolated, limited: native.limited === true };
    };
    const limit = inputs => {
      const point = operatingPoint(inputs); if (point.status) return point;
      return { status:'ok', moduleId, moduleVersion, modelId,
        outputs: { motorTorqueLimitNm: motorEnvelope(motor, point.rpm, point.rating, point.torque < 0 ? -1 : 1) } };
    };
    const evaluate = inputs => {
      const point = operatingPoint(inputs); if (point.status) return point;
      const cap = motorEnvelope(motor, point.rpm, point.rating, point.torque < 0 ? -1 : 1);
      if (Math.abs(point.torque) > cap + 1e-8) return failure('motor-torque-or-power-envelope');
      const native = motorPower(motor, null, point.rpm, point.torque, point.eta);
      if (native.ok && Math.abs(native.dcW) > (motor.maxDcW ?? Infinity) + 1e-8) return failure('motor-dc-power');
      return result(native, point);
    };
    const regenerate = inputs => {
      const point = operatingPoint(inputs); if (point.status) return point;
      const charge = inputs.batteryChargePowerLimitW;
      if (point.torque > 0 || !Number.isFinite(charge) || charge < 0) return failure('invalid-regeneration-limit');
      return result(boundedMotor(motor, null, point.rpm, point.torque, 1, point.eta, -charge, Infinity, point.rating), point);
    };
    return { status:'ok', moduleId, moduleVersion, modelId, package:structuredClone(retained), evaluate, regenerate, limit };
  } catch (error) { return failure(error.message); }
}
