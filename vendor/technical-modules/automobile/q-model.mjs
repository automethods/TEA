"use strict";

export function createQModel({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;

  function median(values) {
    const ordered = [...values].sort((a, b) => a - b);
    if (!ordered.length) return null;
    const middle = Math.floor(ordered.length / 2);
    return ordered.length % 2
      ? ordered[middle]
      : (ordered[middle - 1] + ordered[middle]) / 2;
  }

  function solveThreeByThree(matrix, vector) {
    const augmented = matrix.map((row, index) => [...row, vector[index]]);
    for (let pivot = 0; pivot < 3; pivot += 1) {
      let best = pivot;
      for (let row = pivot + 1; row < 3; row += 1) {
        if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[best][pivot])) best = row;
      }
      [augmented[pivot], augmented[best]] = [augmented[best], augmented[pivot]];
      if (Math.abs(augmented[pivot][pivot]) < 1e-12) return null;
      const divisor = augmented[pivot][pivot];
      for (let column = pivot; column < 4; column += 1) augmented[pivot][column] /= divisor;
      for (let row = 0; row < 3; row += 1) {
        if (row === pivot) continue;
        const factor = augmented[row][pivot];
        for (let column = pivot; column < 4; column += 1) {
          augmented[row][column] -= factor * augmented[pivot][column];
        }
      }
    }
    return augmented.map(row => row[3]);
  }

  function trendModel(points) {
    if (!points.length) return null;
    const minPayload = Math.min(...points.map(point => point.payload));
    const maxPayload = Math.max(...points.map(point => point.payload));
    const center = (minPayload + maxPayload) / 2;
    const scale = Math.max((maxPayload - minPayload) / 2, 1);
    if (points.length < 3) {
      return {
        minPayload,
        maxPayload,
        center,
        scale,
        coefficients: [points.reduce((sum, point) => sum + point.q, 0) / points.length, 0, 0],
        degree: 0
      };
    }
    const sums = points.reduce((accumulator, point) => {
      const z = (point.payload - center) / scale;
      accumulator.z1 += z;
      accumulator.z2 += z ** 2;
      accumulator.z3 += z ** 3;
      accumulator.z4 += z ** 4;
      accumulator.y += point.q;
      accumulator.zy += z * point.q;
      accumulator.z2y += z ** 2 * point.q;
      return accumulator;
    }, { z1: 0, z2: 0, z3: 0, z4: 0, y: 0, zy: 0, z2y: 0 });
    let coefficients = solveThreeByThree(
      [
        [points.length, sums.z1, sums.z2],
        [sums.z1, sums.z2, sums.z3],
        [sums.z2, sums.z3, sums.z4]
      ],
      [sums.y, sums.zy, sums.z2y]
    );
    return {
      minPayload,
      maxPayload,
      center,
      scale,
      coefficients: coefficients || [sums.y / points.length, 0, 0],
      degree: coefficients ? 2 : 0
    };
  }

  function evaluateTrend(payloadKg, model) {
    if (!model || payloadKg < model.minPayload || payloadKg > model.maxPayload) return null;
    const z = (payloadKg - model.center) / model.scale;
    const [c0, c1, c2] = model.coefficients;
    const value = c0 + c1 * z + c2 * z ** 2;
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  return Object.freeze({ median, trendModel, evaluateTrend });
}
