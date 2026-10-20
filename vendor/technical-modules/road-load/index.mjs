/** Headless pilot. Formula variants and origins: manifest.json; no host state. */
export const moduleId = "module.vehicle.road-load";
export const moduleVersion = "0.1.1";
const common = ["operatingMassKg", "rotatingMassFactor", "vehicleSpeedMPerS", "accelerationMPerS2", "gradeRatio"];
const ports = {
  "automobile-speed-dependent/1": ["rollingResistanceCoefficient", "weightForceN", "dragFactorKgPerM"],
  "ice-constant-coefficient/1": ["rollingResistanceCoefficient", "dragAreaM2"],
  "coastdown-polynomial/1": ["coastdownF0N", "coastdownF1NsPerM", "coastdownF2KgPerM"]
};

export function evaluateRoadLoad({ modelId, inputs }) {
  const errors = [];
  if (!Object.hasOwn(ports, modelId)) return { status: "invalid-input", diagnostics: ["Unknown road-load modelId"], outputs: null };
  const required = [...common, ...ports[modelId]];
  for (const key of required) {
    if (typeof inputs?.[key] !== "number" || !Number.isFinite(inputs[key])) errors.push(`${key}: finite number required`);
  }
  if (errors.length) return { status: "invalid-input", diagnostics: errors, outputs: null };
  const p = inputs;
  if (p.operatingMassKg <= 0 || p.rotatingMassFactor < 1 || p.vehicleSpeedMPerS < 0) errors.push("Mass > 0, rotating factor >= 1 and forward speed >= 0 required");
  if (modelId === "coastdown-polynomial/1") {
    if (p.coastdownF0N <= 0 || p.coastdownF2KgPerM < 0) errors.push("Coastdown F0 > 0 and F2 >= 0 required");
  } else if (p.rollingResistanceCoefficient < 0 || (modelId === "automobile-speed-dependent/1"
    ? p.weightForceN <= 0 || p.dragFactorKgPerM < 0 : p.dragAreaM2 < 0)) errors.push("Invalid rolling/weight/aerodynamic inputs");
  if (errors.length) return { status: "invalid-input", diagnostics: errors, outputs: null };
  const v = p.vehicleSpeedMPerS, angle = Math.atan(p.gradeRatio);
  let rollingForceN = null, aerodynamicForceN = null, resistanceForceN;
  const gravityMPerS2 = modelId === "ice-constant-coefficient/1" ? 9.80665 : 9.81;
  if (modelId === "automobile-speed-dependent/1") {
    const speedKmh = v * 3.6;
    const correction = speedKmh > 50 ? 1 + .01 * (speedKmh - 50) : 1;
    rollingForceN = p.rollingResistanceCoefficient * correction * p.weightForceN;
    aerodynamicForceN = p.dragFactorKgPerM * v ** 2;
    resistanceForceN = rollingForceN + aerodynamicForceN;
  } else if (modelId === "ice-constant-coefficient/1") {
    rollingForceN = p.operatingMassKg * gravityMPerS2 * p.rollingResistanceCoefficient * Math.cos(angle);
    aerodynamicForceN = .5 * 1.225 * p.dragAreaM2 * v * v;
    resistanceForceN = rollingForceN + aerodynamicForceN;
  } else {
    resistanceForceN = p.coastdownF0N + p.coastdownF1NsPerM * v + p.coastdownF2KgPerM * v ** 2;
  }
  const gradeForceN = p.operatingMassKg * gravityMPerS2 * Math.sin(angle);
  const inertiaForceN = p.operatingMassKg * p.rotatingMassFactor * p.accelerationMPerS2;
  const wheelPowerW = (modelId === "ice-constant-coefficient/1"
    ? resistanceForceN + gradeForceN + inertiaForceN : resistanceForceN + inertiaForceN + gradeForceN) * v;
  const outputs = { rollingForceN, aerodynamicForceN, resistanceForceN, gradeForceN, inertiaForceN, wheelPowerW };
  if (Object.values(outputs).some(value => value !== null && !Number.isFinite(value))) {
    return { status: "invalid-input", diagnostics: ["Nonfinite derived force/power"], outputs: null };
  }
  return { status: "ok", moduleId, moduleVersion, modelId, outputs, diagnostics: [] };
}
