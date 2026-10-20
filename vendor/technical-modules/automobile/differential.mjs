"use strict";

// Розділ 13 — диференціал.
//
// Метод із методичних вказівок, підрозділ 4.1.5, друковані с. 52—53, звірені з
// рендером сторінок. Розділ короткий: уся арифметика — один вираз, але саме
// він визначає, скільки моменту дістанеться колесу з гіршим зчепленням, і
// звідси його читає розділ 14.
export function createDifferential({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;

  const { finiteNumber } = (function loadNumeric() {
    const scope = typeof window === "object" ? window : globalThis;
    if (!scope.VehicleNumeric && typeof module === "object" && module.exports) {
      require("./numeric.js");
    }
    return scope.VehicleNumeric;
  })();

  const SOURCE_REFS = Object.freeze(["source.method.course"]);

  // Коефіцієнт блокування за типом диференціала.
  const LOCKING = Object.freeze([
    { id: "low-friction", label: "Конічний малого тертя",
      range: Object.freeze({ min: 0, max: 0.2 }) },
    { id: "increased-friction", label: "Підвищеного тертя",
      range: Object.freeze({ min: 0.2, max: 0.6 }) },
    // Джерело подає для самоблоківного одне число, а не діапазон.
    { id: "self-locking", label: "Самоблоківний",
      range: Object.freeze({ min: 0.6, max: 0.6 }) }
  ]);

  // Симетричний диференціал ділить момент порівну, тому U = 1.
  const SYMMETRIC_INTERNAL_RATIO = 1;

  function kind(id) {
    return LOCKING.find(item => item.id === id) || null;
  }

  function adoptLocking({ kindId, basis, manualValue }) {
    const type = kind(kindId);
    if (!type) {
      return { defined: false, reason: "Тип диференціала не вибрано: від нього "
        + "залежить коефіцієнт блокування." };
    }
    if (basis === "project-input") {
      const value = finiteNumber(manualValue);
      if (value === null || value < 0) {
        return { defined: false, reason: "Вибрано власний коефіцієнт, але поле порожнє." };
      }
      return { defined: true, value, method: "project-input", type,
        withinRange: value >= type.range.min && value <= type.range.max };
    }
    if (basis !== "source-midpoint") {
      return { defined: false, reason: "Основу прийняття коефіцієнта не вибрано." };
    }
    return {
      defined: true,
      value: (type.range.min + type.range.max) / 2,
      method: "source-midpoint",
      type,
      withinRange: true
    };
  }

  // K_M = (U + K_б)/(1 + U)
  //
  // Це ЧАСТКА моменту, що дістається колесу з кращим зчепленням. При K_б = 0
  // (ідеальний симетричний диференціал) вона дорівнює половині: колеса
  // дістають порівну, і буксування одного залишає автомобіль без тяги.
  function torqueDistribution({ internalRatio = SYMMETRIC_INTERNAL_RATIO,
    lockingCoefficient }) {
    const ratio = finiteNumber(internalRatio);
    const locking = finiteNumber(lockingCoefficient);
    if (ratio === null || ratio <= 0) {
      return { defined: false, reason: "Внутрішнє передаточне число має бути додатним." };
    }
    if (locking === null || locking < 0) {
      return { defined: false, reason: "Коефіцієнт блокування має бути невід'ємним." };
    }
    return {
      defined: true,
      value: (ratio + locking) / (1 + ratio),
      internalRatio: ratio,
      lockingCoefficient: locking,
      symmetric: ratio === SYMMETRIC_INTERNAL_RATIO
    };
  }

  function buildDistributionStep({ distribution, type, texNumber }) {
    return {
      id: "differential-torque-distribution",
      title: "Розподіл моменту між ведучими колесами",
      purpose: "State how much of the axle torque one wheel can take.",
      output: {
        id: "value.differential-torque-distribution",
        symbol: "K_M",
        label: "Torque distribution coefficient",
        valueType: "float64",
        canonicalUnit: null
      },
      expression: "(U + Kb) / (1 + U)",
      dependencies: ["decision.differential-kind", "decision.differential-locking"],
      equationNumber: "13.1",
      formulaTex: "K_M=\\dfrac{U+K_{\\text{б}}}{1+U}",
      substitutionTex: `K_M=\\dfrac{${texNumber(distribution.internalRatio, 0)}`
        + `+${texNumber(distribution.lockingCoefficient, 2)}}`
        + `{1+${texNumber(distribution.internalRatio, 0)}}`
        + `=${texNumber(distribution.value, 3)}`,
      result: { value: distribution.value, canonicalUnit: null, displayUnit: "" },
      method: "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        distribution.symmetric
          ? "Диференціал симетричний, тому U = 1."
          : `Внутрішнє передаточне число U = ${texNumber(distribution.internalRatio, 2)}.`,
        type ? `Тип: ${type.label.toLowerCase()}, K_б = ${type.range.min}`
          + (type.range.min === type.range.max ? "." : `…${type.range.max}.`) : ""
      ].filter(Boolean),
      assumptions: [],
      limitations: [
        // Це не тонкість, а те, чому взагалі ставлять диференціали підвищеного
        // тертя: при K_б = 0 обидва колеса дістають порівну, і колесо на льоду
        // забирає в другого рівно стільки ж, тобто майже нічого.
        "При K_б = 0 колеса дістають порівну, тому колесо на слизькому "
        + "визначає тягу всієї осі: більше за його зчеплення вісь не передасть."
      ]
    };
  }

  function decisionsFor({ kindId, locking }) {
    const decisions = [];
    const type = kind(kindId);
    if (type) {
      decisions.push({
        id: "decision.differential-kind",
        kind: "Decision",
        choiceRef: null,
        symbol: null,
        adoptedValue: type.id,
        canonicalUnit: null,
        method: "project-input",
        selectedReferenceId: null,
        recommendedValue: null,
        recommendedSourceRefs: SOURCE_REFS,
        rationale: `${type.label}: джерело подає K_б = ${type.range.min}`
          + (type.range.min === type.range.max ? "." : `…${type.range.max}.`),
        sourceRefs: SOURCE_REFS,
        limitations: [],
        manuallyOverridden: true
      });
    }
    if (locking?.defined) {
      decisions.push({
        id: "decision.differential-locking",
        kind: "Decision",
        choiceRef: null,
        symbol: "K_{\\text{б}}",
        adoptedValue: locking.value,
        canonicalUnit: null,
        method: locking.method === "project-input" ? "project-input" : "source-midpoint",
        selectedReferenceId: null,
        recommendedValue: locking.type
          ? (locking.type.range.min + locking.type.range.max) / 2 : null,
        recommendedSourceRefs: SOURCE_REFS,
        rationale: locking.method === "project-input"
          ? `Власне значення автора. Для цього типу джерело подає `
            + `${locking.type.range.min}…${locking.type.range.max}.`
          : "Прийнято середину діапазону, який джерело подає для цього типу.",
        sourceRefs: locking.method === "project-input"
          ? ["source.project-input"] : SOURCE_REFS,
        limitations: locking.withinRange === false
          ? ["Значення лежить поза діапазоном для вибраного типу диференціала."]
          : [],
        manuallyOverridden: locking.method === "project-input"
      });
    }
    return decisions;
  }

  return Object.freeze({
    SOURCE_REFS,
    LOCKING,
    SYMMETRIC_INTERNAL_RATIO,
    kind,
    adoptLocking,
    torqueDistribution,
    buildDistributionStep,
    decisionsFor
  });
}
