/** Effective battery-terminal energy model; provenance and limits in manifest.json. */
export const moduleId = "module.vehicle.battery-consumption";
export const moduleVersion = "0.1.0";
export const parameterBounds = Object.freeze({
  tractionEnergyMultiplier: Object.freeze([1, 2.5]),
  regenerationFraction: Object.freeze([0, 1]),
  auxiliaryPowerW: Object.freeze([0, 3000])
});
const names = Object.keys(parameterBounds);
const finite = value => typeof value === "number" && Number.isFinite(value);
function validInputs(p) {
  return p && ["wheelTractionEnergyJ", "wheelBrakingEnergyJ", "durationS"].every(key => finite(p[key]) && p[key] >= 0) && p.durationS > 0;
}
function vector(p) {
  // kWh and kW scaling avoids a normal matrix dominated by joules vs seconds.
  return [p.wheelTractionEnergyJ / 3600000, -p.wheelBrakingEnergyJ / 3600000, p.durationS / 3600];
}
export function predictBatteryEnergy({ inputs, parameters }) {
  if (!validInputs(inputs) || !parameters || names.some(key => !finite(parameters[key]) || parameters[key] < parameterBounds[key][0] || parameters[key] > parameterBounds[key][1])) {
    return { status: "invalid-input", outputs: null, diagnostics: ["Finite SI energies, positive duration and bounded parameters required"] };
  }
  const batteryNetEnergyJ = parameters.tractionEnergyMultiplier * inputs.wheelTractionEnergyJ
    - parameters.regenerationFraction * inputs.wheelBrakingEnergyJ + parameters.auxiliaryPowerW * inputs.durationS;
  if (!finite(batteryNetEnergyJ)) return { status: "invalid-input", outputs: null, diagnostics: ["Nonfinite predicted energy"] };
  return { status: "ok", moduleId, moduleVersion, outputs: { batteryNetEnergyJ }, diagnostics: [] };
}

function solve(matrix, rhs) {
  const n = rhs.length, a = matrix.map((row, i) => [...row, rhs[i]]);
  let minimumPivot = Infinity, maximumPivot = 0;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let i = col + 1; i < n; i++) if (Math.abs(a[i][col]) > Math.abs(a[pivot][col])) pivot = i;
    const magnitude = Math.abs(a[pivot][col]);
    if (!finite(magnitude) || magnitude < 1e-10) return null;
    minimumPivot = Math.min(minimumPivot, magnitude); maximumPivot = Math.max(maximumPivot, magnitude);
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    for (let j = col; j <= n; j++) a[col][j] /= divisor;
    for (let i = 0; i < n; i++) if (i !== col) {
      const factor = a[i][col];
      for (let j = col; j <= n; j++) a[i][j] -= factor * a[col][j];
    }
  }
  return { values: a.map(row => row[n]), pivotRatio: maximumPivot / minimumPivot };
}

export function fitBatteryConsumption(rows) {
  if (!Array.isArray(rows) || rows.length < 3 || rows.some(row => !validInputs(row.inputs) || !finite(row.batteryNetEnergyJ))) {
    return { status: "invalid-input", parameters: null, diagnostics: ["At least three finite phase records required"] };
  }
  const x = rows.map(row => vector(row.inputs)), y = rows.map(row => row.batteryNetEnergyJ / 3600000);
  const norms = names.map((_, j) => Math.sqrt(x.reduce((sum, row) => sum + row[j] ** 2, 0)));
  if (norms.some(norm => !finite(norm) || norm === 0)) return { status: "rank-deficient", parameters: null, diagnostics: ["Three independent energy/duration features required"] };
  const z = x.map(row => row.map((v, j) => v / norms[j]));
  const gram = names.map((_, i) => names.map((_, j) => z.reduce((sum, row) => sum + row[i] * row[j], 0)));
  const rankCheck = solve(gram, [0, 0, 0]);
  if (!rankCheck) return { status: "rank-deficient", parameters: null, diagnostics: ["Three independent energy/duration features required"] };
  const bounds = [[1, 2.5], [0, 1], [0, 3]];
  let best = null;
  // Only three parameters: enumerate free/lower/upper faces of the box.
  // The convex least-squares optimum lies on one of these 27 faces.
  for (let face = 0; face < 27; face++) {
    const state = names.map((_, j) => Math.floor(face / 3 ** j) % 3);
    const free = names.map((_, j) => j).filter(j => state[j] === 0);
    const p = state.map((s, j) => s === 0 ? 0 : bounds[j][s - 1]);
    if (free.length) {
      const residual = y.map((v, i) => v - x[i].reduce((sum, value, j) => sum + value * p[j], 0));
      const solution = solve(free.map(i => free.map(j => gram[i][j])), free.map(j => z.reduce((sum, row, i) => sum + row[j] * residual[i], 0)));
      if (!solution) continue;
      free.forEach((j, k) => { p[j] = solution.values[k] / norms[j]; });
    }
    if (p.some((v, j) => !finite(v) || v < bounds[j][0] - 1e-8 || v > bounds[j][1] + 1e-8)) continue;
    const bounded = p.map((v, j) => Math.max(bounds[j][0], Math.min(bounds[j][1], v)));
    const sse = x.reduce((sum, row, i) => sum + (row.reduce((v, value, j) => v + value * bounded[j], 0) - y[i]) ** 2, 0);
    if (finite(sse) && (!best || sse < best.sse)) best = { values: bounded, sse };
  }
  if (!best) return { status: "invalid-input", parameters: null, diagnostics: ["Nonfinite fit"] };
  const parameters = { tractionEnergyMultiplier: best.values[0], regenerationFraction: best.values[1], auxiliaryPowerW: best.values[2] * 1000 };
  const activeBounds = names.filter(key => parameterBounds[key].some(bound => Math.abs(parameters[key] - bound) < 1e-6));
  return { status: "ok", moduleId, moduleVersion, parameters, sampleCount: rows.length,
    rmseJ: Math.sqrt(best.sse / rows.length) * 3600000,
    normalizedNormalMatrixPivotRatio: rankCheck.pivotRatio, activeBounds,
    diagnostics: activeBounds.map(key => `${key}: optimum on parameter bound`) };
}
