"use strict";

// Розділ 16 — плавність ходу.
//
// Метод із методичних вказівок, підрозділ 3.5, друковані с. 28—30, звірені з
// рендером сторінок.
//
// Питання розділу: чи не збігається власна частота коливань автомобіля з
// частотою, яку йому нав'язує дорога. Там, де збігається, настає резонанс — і
// саме тому тут рахують ШВИДКОСТІ, а не лише частоти.
export function createRide({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
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
  const G = 9.81;

  // Статичний прогин підвіски, м. Менші значення — задня підвіска, більші —
  // передня.
  const STATIC_DEFLECTION_M = Object.freeze({
    passenger: { min: 0.15, max: 0.25 },
    goods: { min: 0.08, max: 0.13 },
    intercityBus: { min: 0.12, max: 0.18 }
  });
  // Частота коливань підресорених мас, за якої плавність вважають задовільною.
  const SPRUNG_FREQUENCY_HZ = Object.freeze({
    passenger: { min: 0.8, max: 1.3 },
    goods: { min: 1.3, max: 1.8 },
    intercityBus: { min: 0.70, max: 1.35 }
  });
  // Без даних про жорсткість шин частоту непідресорених мас беруть звідси.
  const UNSPRUNG_FREQUENCY_HZ = Object.freeze({ min: 6.7, max: 8.5 });
  // Довжина хвилі нерівності дороги, м.
  const WAVELENGTH_M = Object.freeze({ min: 0.5, max: 5.0 });
  // Висоту нерівності джерело велить приймати 0,05 м.
  const UNEVENNESS_HEIGHT_M = 0.05;

  function bandFor(vehicleType, table) {
    if (vehicleType === "goods" || vehicleType === "offRoad") return table.goods;
    if (vehicleType === "intercityBus") return table.intercityBus;
    return table.passenger;
  }

  function adoptDeflection({ vehicleType, basis, manual }) {
    const value = finiteNumber(manual);
    if (basis === "project-input") {
      return value > 0
        ? { defined: true, value, method: "project-input" }
        : { defined: false, reason: "Вибрано власний прогин, але поле порожнє або недодатне." };
    }
    if (basis === "source-midpoint") {
      const range = bandFor(vehicleType, STATIC_DEFLECTION_M);
      return { defined: true, value: (range.min + range.max) / 2, method: "source-midpoint" };
    }
    return { defined: false, reason: "Основу прийняття прогину не вибрано." };
  }

  // ν_н = (1/2π)·√(g/f_ст)
  function sprungFrequency({ staticDeflectionM }) {
    const deflection = finiteNumber(staticDeflectionM);
    if (deflection === null || deflection <= 0) {
      return { defined: false, reason: "Статичний прогин підвіски має бути додатним." };
    }
    return {
      defined: true,
      value: Math.sqrt(G / deflection) / (2 * Math.PI),
      staticDeflectionM: deflection
    };
  }

  // ν_в = (1/2π)·√(ΣC_ш/m_м) — або з діапазону, коли жорсткості шин немає.
  function unsprungFrequency({ tyreStiffnessNm, axleMassKg }) {
    const stiffness = finiteNumber(tyreStiffnessNm);
    const mass = finiteNumber(axleMassKg);
    if (stiffness === null || mass === null || stiffness <= 0 || mass <= 0) {
      return {
        defined: true,
        value: (UNSPRUNG_FREQUENCY_HZ.min + UNSPRUNG_FREQUENCY_HZ.max) / 2,
        method: "source-midpoint",
        range: UNSPRUNG_FREQUENCY_HZ,
        reason: "Сумарну жорсткість шин і непідресорену масу осі не задано. "
          + "Прийнято середину джерельного діапазону 6,7…8,5 Гц; "
          + "це попередня довідкова частота, а не результат розрахунку за жорсткістю шин."
      };
    }
    return {
      defined: true,
      value: Math.sqrt(stiffness / mass) / (2 * Math.PI),
      method: "sourced-formula",
      tyreStiffnessNm: stiffness,
      axleMassKg: mass
    };
  }

  function frequencyStatus({ frequency, vehicleType }) {
    if (!frequency?.defined) {
      return { defined: false, checked: false, reason: frequency?.reason || "" };
    }
    const range = bandFor(vehicleType, SPRUNG_FREQUENCY_HZ);
    const within = frequency.value >= range.min && frequency.value <= range.max;
    return {
      defined: true,
      checked: true,
      range,
      withinLimit: within,
      reason: `Частота ${frequency.value.toFixed(2)} Гц `
        + (within ? "лежить у межах " : "ПОЗА межами ")
        + `${range.min}…${range.max} Гц, за яких плавність вважають задовільною.`
    };
  }

  // ν_вим = V/S — частота, яку нав'язує дорога; резонанс при ν_вим = ν.
  // Швидкість резонансу: V_р = ν·S.
  function resonanceSpeeds({ sprungHz, unsprungHz,
    wavelengths = [WAVELENGTH_M.min, WAVELENGTH_M.max] }) {
    const sprung = finiteNumber(sprungHz);
    const unsprung = finiteNumber(unsprungHz);
    if (sprung === null || unsprung === null || sprung <= 0 || unsprung <= 0) {
      return { defined: false, reason: "Потрібні обидві власні частоти." };
    }
    return {
      defined: true,
      sprungHz: sprung,
      unsprungHz: unsprung,
      points: wavelengths.map(wavelengthM => ({
        wavelengthM,
        sprungSpeedMs: sprung * wavelengthM,
        unsprungSpeedMs: unsprung * wavelengthM
      }))
    };
  }

  // Швидкість, прискорення й швидкість зміни прискорень при коливаннях.
  function oscillationSeverity({ frequencyHz, heightM = UNEVENNESS_HEIGHT_M }) {
    const frequency = finiteNumber(frequencyHz);
    const height = finiteNumber(heightM);
    if (frequency === null || height === null || frequency <= 0 || height <= 0) {
      return { defined: false, reason: "Потрібні частота коливань і висота нерівності." };
    }
    return {
      defined: true,
      velocityMs: height * frequency,
      accelerationMs2: height * frequency ** 2,
      jerkMs3: height * frequency ** 3,
      heightM: height,
      frequencyHz: frequency
    };
  }

  function buildUnsprungStep({ frequency, texNumber }) {
    const midpoint = frequency.method === "source-midpoint";
    const formulaTex = midpoint
      ? "\\nu_{\\text{в}}=\\dfrac{\\nu_{\\text{в,min}}+\\nu_{\\text{в,max}}}{2}"
      : "\\nu_{\\text{в}}=\\dfrac{1}{2\\pi}\\sqrt{\\dfrac{\\sum C_{\\text{ш}}}{m_{\\text{м}}}}";
    const numericTex = midpoint
      ? `\\dfrac{${texNumber(frequency.range.min, 1)}+${texNumber(frequency.range.max, 1)}}{2}`
      : `\\dfrac{1}{2\\cdot\\pi}\\sqrt{\\dfrac{${texNumber(frequency.tyreStiffnessNm, 0)}}{${texNumber(frequency.axleMassKg, 2)}}}`;
    return {
      id: "ride-unsprung-frequency",
      title: "Частота власних коливань непідресорених мас",
      purpose: "State the high-frequency oscillation set by the tyres.",
      output: {
        id: "value.ride-unsprung-frequency",
        symbol: "\\nu_{\\text{в}}",
        label: "Unsprung mass frequency",
        valueType: "quantity",
        canonicalUnit: "Hz"
      },
      expression: midpoint ? "(nu_v_min + nu_v_max) / 2" : "sqrt(C / m) / (2 pi)",
      // The midpoint depends only on the explicitly cited source interval.
      // A tyre deformation coefficient is neither stiffness nor axle mass.
      // The known-input guide branch binds its declared C and m references.
      dependencies: midpoint
        ? ["input.ride-unsprung-frequency-min", "input.ride-unsprung-frequency-max"]
        : ["input.ride-tyre-stiffness", "input.ride-unsprung-mass"],
      equationNumber: "16.2",
      formulaTex,
      substitutionTex: `\\nu_{\\text{в}}=${numericTex}=${texNumber(frequency.value, 2)}`
        + "\\ \\text{Гц}",
      result: { value: frequency.value, canonicalUnit: "Hz", displayUnit: "Гц" },
      method: frequency.method === "source-midpoint" ? "source-midpoint" : "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: frequency.reason ? [frequency.reason] : [],
      assumptions: [],
      limitations: frequency.method === "source-midpoint"
        ? [`Значення взято з діапазону ${UNSPRUNG_FREQUENCY_HZ.min}…`
          + `${UNSPRUNG_FREQUENCY_HZ.max} Гц, а не пораховано з жорсткості шин.`]
        : []
    };
  }

  function buildResonanceStep({ speeds, texNumber }) {
    const list = speeds.points.flatMap(point => [
      `V_{\\text{р,н}}(S=${texNumber(point.wavelengthM, 1)}\\,\\text{м})`
        + `&=3{,}6\\cdot${texNumber(speeds.sprungHz, 5)}\\cdot${texNumber(point.wavelengthM, 1)}`
        + `=${texNumber(point.sprungSpeedMs * 3.6, 2)}\\ \\text{км/год}`,
      `V_{\\text{р,в}}(S=${texNumber(point.wavelengthM, 1)}\\,\\text{м})`
        + `&=3{,}6\\cdot${texNumber(speeds.unsprungHz, 5)}\\cdot${texNumber(point.wavelengthM, 1)}`
        + `=${texNumber(point.unsprungSpeedMs * 3.6, 2)}\\ \\text{км/год}`
    ]).join("\\\\[3pt]");
    return {
      id: "ride-resonance-speeds",
      title: "Резонансні швидкості руху",
      purpose: "Find the speeds at which the road drives the car at its own frequency.",
      output: {
        id: "value.ride-resonance-speeds",
        symbol: "V_{\\text{р}}",
        label: "Resonance speeds",
        valueType: "list",
        canonicalUnit: null
      },
      expression: "V = nu * S",
      dependencies: ["value.ride-sprung-frequency", "value.ride-unsprung-frequency"],
      equationNumber: "16.3",
      formulaTex: "V_{\\text{р,н}}=3{,}6\\nu_{\\text{н}}S,\\qquad "
        + "V_{\\text{р,в}}=3{,}6\\nu_{\\text{в}}S\\quad[\\text{км/год}]",
      substitutionTex: `\\begin{aligned}${list}\\end{aligned}`,
      result: {
        value: speeds.points.map(point => ({
          wavelengthM: point.wavelengthM,
          sprungSpeedMs: point.sprungSpeedMs,
          unsprungSpeedMs: point.unsprungSpeedMs
        })),
        canonicalUnit: null,
        displayUnit: ""
      },
      method: "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        "Резонанс настає, коли частота, яку нав'язує дорога, збігається з "
        + "власною. Довжину хвилі нерівності джерело бере "
        + `${WAVELENGTH_M.min}…${WAVELENGTH_M.max} м. Індекс н означає підресорені, `
        + "в — непідресорені маси; множник 3,6 переводить м/с у км/год."
      ],
      assumptions: [],
      limitations: []
    };
  }

  // Примітки читачеві для кроків, які тепер рахує engdoc.
  //
  // Місток будує крок із ТРАСИ, а траса не має ні readerNotes, ні method: у
  // engdoc їх просто немає. Без них розділ утратив би межі плавності й
  // пояснення, чому різкість важить більше за висоту нерівності.
  function worksheetNotes({ status } = {}) {
    return {
      "ride-sprung-frequency": {
        method: "sourced-formula",
        readerNotes: status?.checked ? [status.reason] : [],
        limitations: status?.checked && !status.withinLimit
          ? ["Частота поза межами, за яких джерело вважає плавність задовільною."]
          : []
      },
      "ride-oscillation-velocity": {
        method: "sourced-formula",
        readerNotes: ["Показник джерела Z_0ν використовує частоту в Гц. "
          + "Для амплітуди швидкості гармонічного руху потрібен множник 2π; "
          + "наведений показник не є цією амплітудою."]
      },
      "ride-oscillation-severity": {
        method: "sourced-formula",
        readerNotes: [`Висоту нерівності взято ${UNEVENNESS_HEIGHT_M} м, як велить джерело. `
          + "Показник Z_0ν² з частотою в Гц не є амплітудою гармонічного "
          + "прискорення: для неї потрібен множник (2π)²."]
      },
      "ride-oscillation-jerk": {
        method: "sourced-formula",
        readerNotes: ["Показник джерела Z_0ν³ зростає як куб частоти при "
          + "сталій висоті нерівності. Для амплітуди третьої похідної "
          + "гармонічного переміщення потрібен додатковий множник (2π)³; "
          + "оцінку впливу вібрації на людину цей показник не замінює."]
      }
    };
  }

  function decisionsFor({ deflection, vehicleType }) {
    if (!deflection?.defined) return [];
    const range = bandFor(vehicleType, STATIC_DEFLECTION_M);
    return [{
      id: "decision.ride-static-deflection",
      kind: "Decision",
      choiceRef: null,
      symbol: "f_{\\text{ст}}",
      adoptedValue: deflection.value,
      canonicalUnit: "m",
      method: deflection.method === "project-input" ? "project-input" : "source-midpoint",
      selectedReferenceId: null,
      recommendedValue: (range.min + range.max) / 2,
      recommendedSourceRefs: SOURCE_REFS,
      rationale: deflection.method === "project-input"
        ? `Власне значення автора. Джерело подає ${range.min}…${range.max} м.`
        : `Прийнято середину діапазону ${range.min}…${range.max} м. Менші значення `
          + "джерело радить для задньої підвіски, більші — для передньої.",
      sourceRefs: deflection.method === "project-input"
        ? ["source.project-input"] : SOURCE_REFS,
      limitations: deflection.value < range.min || deflection.value > range.max
        ? ["Значення лежить поза діапазоном джерела."] : [],
      manuallyOverridden: deflection.method === "project-input"
    }];
  }

  function diagnosticsFor({ status }) {
    if (!status?.checked || status.withinLimit) return [];
    return [{
      code: "RIDE_FREQUENCY_OUTSIDE_RANGE",
      severity: "warning",
      message: status.reason,
      details: { node: "calc.ride-sprung-frequency" }
    }];
  }

  return Object.freeze({
    SOURCE_REFS,
    STATIC_DEFLECTION_M,
    SPRUNG_FREQUENCY_HZ,
    UNSPRUNG_FREQUENCY_HZ,
    WAVELENGTH_M,
    UNEVENNESS_HEIGHT_M,
    bandFor,
    adoptDeflection,
    sprungFrequency,
    unsprungFrequency,
    frequencyStatus,
    resonanceSpeeds,
    oscillationSeverity,
    worksheetNotes,
    diagnosticsFor,
    buildUnsprungStep,
    buildResonanceStep,
    decisionsFor
  });
}
