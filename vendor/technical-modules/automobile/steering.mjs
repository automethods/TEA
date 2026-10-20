"use strict";

// Розділ 19 — рульове керування.
//
// Метод із методичних вказівок, підрозділи 4.3.1—4.3.2, друковані с. 65—66,
// звірені з рендером сторінок.
//
// Головне питання розділу одне: чи зможе водій повернути кермо сам. Джерело
// дає для цього чітку межу — 400 Н на рульовому колесі при повороті коліс
// нерухомого автомобіля. Понад неї потрібен підсилювач.
export function createSteering({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
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

  const STEERING_WHEEL_TURN_DEG = Object.freeze({ min: 540, max: 1080 });
  const ROAD_WHEEL_TURN_DEG = Object.freeze({ min: 35, max: 40 });
  const STEERING_WHEEL_RADIUS_M = Object.freeze({ min: 0.20, max: 0.25 });
  // Радіус обкочування — плече, на якому опір повороту діє на цапфу.
  const SCRUB_RADIUS_M = Object.freeze({
    passenger: { min: 0.03, max: 0.06 },
    goods: { min: 0.05, max: 0.12 }
  });
  // Силове передаточне число має лежати в цих межах.
  const FORCE_RATIO_LIMITS = Object.freeze({ min: 100, max: 300 });
  const MECHANISM_EFFICIENCY = Object.freeze({ min: 0.70, max: 0.90 });
  const LINKAGE_EFFICIENCY = Object.freeze({ min: 0.65, max: 0.95 });
  // Понад це зусилля джерело велить ставити підсилювач.
  const POWER_ASSIST_THRESHOLD_N = 400;
  // Опір коченню в момент повороту НА МІСЦІ. У документі він має власне
  // позначення f_пов: величина інша, ніж опір коченню в русі (розділ 2), а
  // однакова літера вже одного разу мало не звела їх докупи. Різниця сягає
  // п'яти разів і входить у момент опору прямо пропорційно.
  const TURNING_RESISTANCE_SYMBOL = "f_{\\text{пов}}";
  const TURNING_ROLLING_RESISTANCE = Object.freeze({
    paved: { min: 0.03, max: 0.06 },
    offRoad: { min: 0.1, max: 0.3 }
  });
  const TURNING_ADHESION = Object.freeze({ min: 0.6, max: 0.8 });
  const SLIP_RADIUS_SHARE = Object.freeze({ min: 0.12, max: 0.15 });

  const midpoint = range => (range.min + range.max) / 2;

  function scrubBand(vehicleType) {
    return vehicleType === "goods" || vehicleType === "offRoad"
      ? SCRUB_RADIUS_M.goods : SCRUB_RADIUS_M.passenger;
  }

  function adoptRange(range, basis, manualValue, name) {
    if (basis === "project-input") {
      const value = finiteNumber(manualValue);
      if (value === null || value <= 0) {
        return { defined: false, reason: `Вибрано власне значення (${name}), але поле порожнє.` };
      }
      return { defined: true, value, method: "project-input", range,
        withinRange: value >= range.min && value <= range.max };
    }
    if (basis !== "source-midpoint") {
      return { defined: false, reason: `Основу прийняття (${name}) не вибрано.` };
    }
    return { defined: true, value: midpoint(range), method: "source-midpoint",
      range, withinRange: true };
  }

  // U_ω = α_р.к/α_к.к — скільки обертів керма на один поворот коліс.
  function kinematicRatio({ steeringWheelTurnDeg, roadWheelTurnDeg }) {
    const wheel = finiteNumber(steeringWheelTurnDeg);
    const road = finiteNumber(roadWheelTurnDeg);
    if (wheel === null || road === null || wheel <= 0 || road <= 0) {
      return { defined: false, reason: "Потрібні кути повороту рульового й керованого коліс." };
    }
    return {
      defined: true,
      value: wheel / road,
      steeringWheelTurnDeg: wheel,
      roadWheelTurnDeg: road,
      withinRange: wheel >= STEERING_WHEEL_TURN_DEG.min
        && wheel <= STEERING_WHEEL_TURN_DEG.max
        && road >= ROAD_WHEEL_TURN_DEG.min && road <= ROAD_WHEEL_TURN_DEG.max
    };
  }

  // U_p = U_ω·R_р.к/C, якщо знехтувати втратами на тертя.
  function forceRatio({ kinematic, steeringWheelRadiusM, scrubRadiusM }) {
    if (!kinematic?.defined) {
      return { defined: false, reason: kinematic?.reason || "Кінематичне число не відоме." };
    }
    const radius = finiteNumber(steeringWheelRadiusM);
    const scrub = finiteNumber(scrubRadiusM);
    if (radius === null || scrub === null || radius <= 0 || scrub <= 0) {
      return { defined: false, reason: "Потрібні радіус керма й радіус обкочування." };
    }
    const value = kinematic.value * radius / scrub;
    return {
      defined: true,
      value,
      steeringWheelRadiusM: radius,
      scrubRadiusM: scrub,
      withinLimit: value >= FORCE_RATIO_LIMITS.min && value <= FORCE_RATIO_LIMITS.max,
      limits: FORCE_RATIO_LIMITS
    };
  }

  // ΣM_к.к ≈ 1,25·G·(f·c + φ·r_ковз) — опір повороту коліс НА МІСЦІ.
  function turningResistance({ steeredWeightN, rollingResistanceF, scrubRadiusM,
    adhesion, wheelRadiusM, slipRadiusShare = midpoint(SLIP_RADIUS_SHARE) }) {
    const weight = finiteNumber(steeredWeightN);
    const f = finiteNumber(rollingResistanceF);
    const scrub = finiteNumber(scrubRadiusM);
    const phi = finiteNumber(adhesion);
    const radius = finiteNumber(wheelRadiusM);
    const share = finiteNumber(slipRadiusShare);
    if ([weight, f, scrub, phi, radius, share].some(value => value === null || value <= 0)) {
      return { defined: false, reason: "Для моменту опору повороту бракує величин." };
    }
    const slipRadiusM = share * radius;
    return {
      defined: true,
      value: 1.25 * weight * (f * scrub + phi * slipRadiusM),
      slipRadiusM,
      steeredWeightN: weight,
      rollingResistanceF: f,
      adhesion: phi,
      scrubRadiusM: scrub,
      wheelRadiusM: radius,
      slipRadiusShare: share
    };
  }

  // P_р.к = ΣM_к.к/(U_ω·η_р.м·η_р.п·R_р.к)
  function steeringEffort({ resistance, kinematic, mechanismEfficiency,
    linkageEfficiency, steeringWheelRadiusM }) {
    if (!resistance?.defined || !kinematic?.defined) {
      return {
        defined: false,
        reason: resistance?.reason || kinematic?.reason || "Бракує вхідних величин."
      };
    }
    const mechanism = finiteNumber(mechanismEfficiency);
    const linkage = finiteNumber(linkageEfficiency);
    const radius = finiteNumber(steeringWheelRadiusM);
    if ([mechanism, linkage, radius].some(value => value === null || value <= 0)) {
      return { defined: false, reason: "Потрібні ККД механізму, привода й радіус керма." };
    }
    const value = resistance.value / (kinematic.value * mechanism * linkage * radius);
    const needsPowerAssist = value > POWER_ASSIST_THRESHOLD_N;
    // Preliminary assist sizing is a PROJECT design step, not a sourced formula:
    // once assistance is mandatory, choose a simple rounded gain that brings the
    // driver's static effort below 300 N (comfort target below the 400 N source
    // threshold). A real booster/rack is still selected from manufacturer data.
    const assistTargetN = 300;
    const minimumAssistGain = needsPowerAssist ? value / assistTargetN : 1;
    const recommendedAssistGain = needsPowerAssist
      ? Math.max(1.5, Math.ceil(minimumAssistGain * 2) / 2) : 1;
    const assistedEffortN = value / recommendedAssistGain;
    return {
      defined: true,
      value,
      unassistedEffortN: value,
      needsPowerAssist,
      thresholdN: POWER_ASSIST_THRESHOLD_N,
      assistTargetN,
      minimumAssistGain,
      recommendedAssistGain,
      assistedEffortN,
      mechanismEfficiency: mechanism,
      linkageEfficiency: linkage,
      turningResistanceNm: resistance.value,
      kinematicRatio: kinematic.value,
      steeringWheelRadiusM: radius
    };
  }

  // Рейковий механізм: крок і кількість зубів рейки.
  function rackGeometry({ moduleMm, rackLengthMm }) {
    const module_ = finiteNumber(moduleMm);
    const length = finiteNumber(rackLengthMm);
    if (module_ === null || length === null || module_ <= 0 || length <= 0) {
      return { defined: false, reason: "Потрібні модуль і довжина нарізаної частини." };
    }
    const pitchMm = Math.PI * module_;
    const teeth = Math.round(length / pitchMm + 0.5);
    return {
      defined: true,
      pitchMm,
      teeth,
      // Джерело велить уточнити довжину за прийнятою кількістю зубів.
      refinedLengthMm: (teeth - 0.5) * pitchMm,
      // h = (2h_a* + c*)m при h_a* = 1,0 і c* = 0,25.
      toothHeightMm: 2.25 * module_,
      toothThicknessMm: 0.5 * Math.PI * module_,
      moduleMm: module_
    };
  }

  function buildRatioStep({ kinematic, force, texNumber }) {
    return {
      id: "steering-force-ratio",
      title: "Передаточні числа рульового керування",
      purpose: "State how much the steering multiplies the driver's effort.",
      output: {
        id: "value.steering-force-ratio",
        symbol: "U_p",
        label: "Steering force ratio",
        valueType: "float64",
        canonicalUnit: null
      },
      expression: "Uw * R / C",
      dependencies: ["decision.steering-wheel-radius", "decision.vehicle-type", "decision.steering-scrub-radius"],
      equationNumber: "19.1",
      formulaTex: "U_{\\omega}=\\dfrac{\\alpha_{\\text{р.к}}}"
        + "{\\alpha_{\\text{к.к}}},\\qquad "
        + "U_p=U_{\\omega}\\dfrac{R_{\\text{р.к}}}{C}",
      substitutionTex: `\\begin{aligned}U_{\\omega}&=\\dfrac{${texNumber(kinematic.steeringWheelTurnDeg, 0)}}`
        + `{${texNumber(kinematic.roadWheelTurnDeg, 2)}}=${texNumber(kinematic.value, 3)}\\\\[3pt]`
        + `U_p&=${texNumber(kinematic.value, 3)}\\cdot\\dfrac{${texNumber(force.steeringWheelRadiusM, 4)}}`
        + `{${texNumber(force.scrubRadiusM, 4)}}=${texNumber(force.value, 2)}\\end{aligned}`,
      result: { value: force.value, canonicalUnit: null, displayUnit: "" },
      method: "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        `Джерело вимагає U_p у межах ${FORCE_RATIO_LIMITS.min}…`
        + `${FORCE_RATIO_LIMITS.max}.`,
        "Вираз без втрат на тертя: воно враховане далі, у зусиллі на кермі."
      ],
      assumptions: [],
      limitations: force.withinLimit
        ? []
        : ["Силове передаточне число поза межами джерела."]
    };
  }

  function buildResistanceStep({ resistance, texNumber }) {
    return {
      id: "steering-turning-resistance",
      title: "Момент опору повороту керованих коліс",
      purpose: "State how hard the wheels resist turning at a standstill.",
      output: {
        id: "value.steering-turning-resistance",
        symbol: "\\sum M_{\\text{к.к}}",
        label: "Turning resistance moment",
        valueType: "quantity",
        canonicalUnit: "N*m"
      },
      expression: "1.25 G (f c + phi r)",
      dependencies: ["value.axle-forces", "value.dynamic-wheel-radius"],
      equationNumber: "19.2",
      formulaTex: "\\sum M_{\\text{к.к}}\\approx1{,}25G\\left("
        + TURNING_RESISTANCE_SYMBOL + "c+\\varphi r_{\\text{ковз}}\\right)",
      substitutionTex: `\\begin{aligned}r_{\\text{ковз}}&=${texNumber(resistance.slipRadiusShare, 4)}`
        + `\\cdot${texNumber(resistance.wheelRadiusM, 5)}=${texNumber(resistance.slipRadiusM, 5)}\\ \\text{м}\\\\[3pt]`
        + `\\sum M_{\\text{к.к}}&\\approx1{,}25\\cdot${texNumber(resistance.steeredWeightN, 2)}\\left(`
        + `${texNumber(resistance.rollingResistanceF, 4)}\\cdot${texNumber(resistance.scrubRadiusM, 4)}`
        + `+${texNumber(resistance.adhesion, 3)}\\cdot${texNumber(resistance.slipRadiusM, 5)}\\right)`
        + `=${texNumber(resistance.value, 2)}\\ \\text{Н·м}\\end{aligned}`,
      result: { value: resistance.value, canonicalUnit: "N*m", displayUnit: "Н·м" },
      method: "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        // Власне позначення — щоб однакова літера більше не зводила докупи
        // дві різні величини.
        `f_пов = ${resistance.rollingResistanceF} — опір коченню при повороті `
        + "коліс НА МІСЦІ. Це НЕ той коефіцієнт f, з яким автомобіль котиться "
        + "в розділі 2: колесо тут не котиться, а розвертається, стираючи "
        + "протектор. Джерело подає для нього власні межі, і різниця сягає "
        + "п'яти разів.",
        `Радіус ковзання r_ковз ≈ (${SLIP_RADIUS_SHARE.min}…${SLIP_RADIUS_SHARE.max})r_к.`
      ],
      assumptions: ["Вираз наближений — джерело друкує «≈»."],
      limitations: []
    };
  }

  function buildEffortStep({ effort, texNumber }) {
    return {
      id: "steering-effort",
      title: "Зусилля на рульовому колесі",
      purpose: "Decide whether the driver can turn the wheel unaided.",
      output: {
        id: "value.steering-effort",
        symbol: "P_{\\text{р.к}}",
        label: "Steering wheel effort",
        valueType: "quantity",
        canonicalUnit: "N"
      },
      expression: "M / (Uw * eta1 * eta2 * R)",
      dependencies: ["decision.steering-wheel-radius", "decision.steering-mechanism-efficiency", "decision.steering-linkage-efficiency", "value.steering-turning-resistance", "value.steering-force-ratio"],
      equationNumber: "19.3",
      formulaTex: "P_{\\text{р.к}}=\\dfrac{\\sum M_{\\text{к.к}}}"
        + "{U_{\\omega}\\eta_{\\text{р.м}}\\eta_{\\text{р.п}}R_{\\text{р.к}}}",
      substitutionTex: `P_{\\text{р.к}}=\\dfrac{${texNumber(effort.turningResistanceNm, 2)}}`
        + `{${texNumber(effort.kinematicRatio, 3)}\\cdot${texNumber(effort.mechanismEfficiency, 3)}`
        + `\\cdot${texNumber(effort.linkageEfficiency, 3)}\\cdot${texNumber(effort.steeringWheelRadiusM, 4)}}`
        + `=${texNumber(effort.value, 2)}\\ \\text{Н}`,
      result: { value: effort.value, canonicalUnit: "N", displayUnit: "Н" },
      method: "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        effort.needsPowerAssist
          ? `Без підсилювача ${effort.value.toFixed(0)} Н > ${effort.thresholdN} Н; `
            + `для попереднього проєкту потрібен підсилювач не менш як ×${effort.minimumAssistGain.toFixed(2)}, `
            + `прийнята округлена рекомендація ×${effort.recommendedAssistGain.toFixed(1)} дає близько `
            + `${effort.assistedEffortN.toFixed(0)} Н. Остаточний підсилювач вибирають за паспортом.`
          : `Зусилля не перевищує ${effort.thresholdN} Н — поріг потреби в `
            + "підсиленні за цим критерієм джерела. Остаточний вибір "
            + "підсилювача потребує вимог до всіх режимів керування.",
        "Зусилля рахують для повороту коліс НЕРУХОМОГО автомобіля — це найважчий "
        + "випадок."
      ],
      assumptions: [],
      limitations: effort.needsPowerAssist
        ? ["Розрахована кратність підсилення — попередня проєктна рекомендація; теплову й динамічну здатність підсилювача перевіряють за паспортом вузла."]
        : []
    };
  }

  function decisionsFor({ scrub, wheelRadius, mechanism, linkage, vehicleType }) {
    const decisions = [];
    const band = scrubBand(vehicleType);
    if (scrub?.defined) {
      decisions.push({
        id: "decision.steering-scrub-radius",
        kind: "Decision",
        choiceRef: null,
        symbol: "C",
        adoptedValue: scrub.value,
        canonicalUnit: "m",
        method: scrub.method === "project-input" ? "project-input" : "source-midpoint",
        selectedReferenceId: null,
        recommendedValue: midpoint(band),
        recommendedSourceRefs: SOURCE_REFS,
        rationale: scrub.method === "project-input"
          ? `Власне значення автора. Джерело подає ${band.min}…${band.max} м.`
          : `Прийнято середину діапазону ${band.min}…${band.max} м для цього типу `
            + "автомобіля.",
        sourceRefs: scrub.method === "project-input"
          ? ["source.project-input"] : SOURCE_REFS,
        limitations: scrub.withinRange === false
          ? ["Значення лежить поза діапазоном джерела."] : [],
        manuallyOverridden: scrub.method === "project-input"
      });
    }
    [["decision.steering-wheel-radius", "R_{\\text{р.к}}", wheelRadius,
      STEERING_WHEEL_RADIUS_M, "m"],
      ["decision.steering-mechanism-efficiency", "\\eta_{\\text{р.м}}", mechanism,
        MECHANISM_EFFICIENCY, null],
      ["decision.steering-linkage-efficiency", "\\eta_{\\text{р.п}}", linkage,
        LINKAGE_EFFICIENCY, null]]
      .forEach(([id, symbol, adopted, range, unit]) => {
        if (!adopted?.defined) return;
        decisions.push({
          id,
          kind: "Decision",
          choiceRef: null,
          symbol,
          adoptedValue: adopted.value,
          canonicalUnit: unit,
          method: adopted.method === "project-input" ? "project-input" : "source-midpoint",
          selectedReferenceId: null,
          recommendedValue: midpoint(range),
          recommendedSourceRefs: SOURCE_REFS,
          rationale: adopted.method === "project-input"
            ? `Власне значення автора. Джерело подає ${range.min}…${range.max}.`
            : `Прийнято середину діапазону ${range.min}…${range.max}.`,
          sourceRefs: adopted.method === "project-input"
            ? ["source.project-input"] : SOURCE_REFS,
          limitations: adopted.withinRange === false
            ? ["Значення лежить поза діапазоном джерела."] : [],
          manuallyOverridden: adopted.method === "project-input"
        });
      });
    return decisions;
  }

  function diagnosticsFor({ forceRatioValue, effort }) {
    const out = [];
    if (forceRatioValue?.defined && !forceRatioValue.withinLimit) {
      out.push({
        code: "STEERING_FORCE_RATIO_OUTSIDE_RANGE",
        severity: "warning",
        message: `Силове передаточне число ${forceRatioValue.value.toFixed(0)} поза `
          + `межами ${forceRatioValue.limits.min}…${forceRatioValue.limits.max}, `
          + "які подає джерело.",
        details: { node: "calc.steering-force-ratio" }
      });
    }
    if (effort?.defined && effort.needsPowerAssist) {
      out.push({
        code: "STEERING_NEEDS_POWER_ASSIST",
        severity: "warning",
        message: `Без підсилювача ${effort.value.toFixed(0)} Н > ${effort.thresholdN} Н. `
          + `Попередньо потрібне підсилення не менш як ×${effort.minimumAssistGain.toFixed(2)}; `
          + `округлена рекомендація ×${effort.recommendedAssistGain.toFixed(1)} дає `
          + `${effort.assistedEffortN.toFixed(0)} Н на кермі лише за такого фактичного підсилення. `
          + "Потрібно прийняти підсилювач за паспортом; наведена рекомендація ще не підтверджує допустиме зусилля.",
        details: { node: "calc.steering-effort" }
      });
    }
    return out;
  }

  return Object.freeze({
    SOURCE_REFS,
    STEERING_WHEEL_TURN_DEG,
    ROAD_WHEEL_TURN_DEG,
    STEERING_WHEEL_RADIUS_M,
    SCRUB_RADIUS_M,
    FORCE_RATIO_LIMITS,
    MECHANISM_EFFICIENCY,
    LINKAGE_EFFICIENCY,
    POWER_ASSIST_THRESHOLD_N,
    TURNING_ROLLING_RESISTANCE,
    TURNING_RESISTANCE_SYMBOL,
    TURNING_ADHESION,
    SLIP_RADIUS_SHARE,
    midpoint,
    scrubBand,
    adoptRange,
    kinematicRatio,
    forceRatio,
    turningResistance,
    steeringEffort,
    rackGeometry,
    buildRatioStep,
    buildResistanceStep,
    buildEffortStep,
    decisionsFor,
    diagnosticsFor
  });
}
