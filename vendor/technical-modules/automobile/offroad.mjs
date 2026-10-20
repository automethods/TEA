"use strict";

// Розділ 17 — прохідність.
//
// Метод із методичних вказівок, підрозділ 3.6, друковані с. 30—31, звірені з
// рендером сторінок.
//
// Прохідність тут двох різних видів: ПРОФІЛЬНА — чи пролізе автомобіль над
// перешкодою, і ОПОРНА — чи зрушить він із місця на слабкому ґрунті. Перша
// вимірюється геометрією, друга — зчепленням.
export function createOffroad({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
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

  // Умови, за яких джерело велить перевірити рух: слабкий ґрунт.
  const REFERENCE_CONDITIONS = Object.freeze({
    rollingResistanceF: 0.04,
    gradeI: 0.06,
    adhesion: 0.22
  });

  const degrees = radians => radians * 180 / Math.PI;

  // α_max,ковз = arctg[(φ·a/L − f)/(1 − φ·h_g/L)]
  //
  // `a` — відстань від ПЕРЕДНЬОЇ осі до центра мас: саме вона визначає, яка
  // частка ваги припадає на задні (ведучі) колеса.
  function gradientBySlip({ adhesion, rollingResistanceF, frontToCentreM,
    wheelbaseM, centreHeightM }) {
    const phi = finiteNumber(adhesion);
    const f = finiteNumber(rollingResistanceF);
    const a = finiteNumber(frontToCentreM);
    const base = finiteNumber(wheelbaseM);
    const height = finiteNumber(centreHeightM);
    if ([phi, f, a, base, height].some(value => value === null)
      || phi <= 0 || base <= 0 || a <= 0 || height <= 0) {
      return { defined: false, reason: "Потрібні φ, f, база, положення й висота центра мас." };
    }
    const denominator = 1 - phi * height / base;
    if (!(denominator > 0)) {
      return {
        defined: false,
        reason: "Центр мас надто високий для цього зчеплення: за такої геометрії "
          + "вираз не має розв'язку."
      };
    }
    const numerator = phi * a / base - f;
    if (!(numerator > 0)) {
      return {
        defined: false,
        outOfDomain: true,
        reason: "Зчеплення ведучих коліс не долає навіть опору коченню: підйому "
          + "автомобіль не подолає зовсім."
      };
    }
    return { defined: true, value: degrees(Math.atan(numerator / denominator)),
      adhesion: phi, rollingResistanceF: f, frontToCentreM: a,
      wheelbaseM: base, centreHeightM: height };
  }

  // α_max,пер = arctg(b/h_g) — `b` від ЗАДНЬОЇ осі до центра мас.
  function gradientByRollover({ rearToCentreM, centreHeightM }) {
    const b = finiteNumber(rearToCentreM);
    const height = finiteNumber(centreHeightM);
    if (b === null || height === null || b <= 0 || height <= 0) {
      return { defined: false, reason: "Потрібні положення й висота центра мас." };
    }
    return { defined: true, value: degrees(Math.atan(b / height)),
      rearToCentreM: b, centreHeightM: height };
  }

  // β_max,ковз ≈ arctg φ; β_max,пер ≈ arctg(B/2h_g)
  function sideSlopeLimits({ adhesion, trackWidthM, centreHeightM }) {
    const phi = finiteNumber(adhesion);
    const track = finiteNumber(trackWidthM);
    const height = finiteNumber(centreHeightM);
    if ([phi, track, height].some(value => value === null)
      || phi <= 0 || track <= 0 || height <= 0) {
      return { defined: false, reason: "Потрібні φ, колія й висота центра мас." };
    }
    const slip = degrees(Math.atan(phi));
    const rollover = degrees(Math.atan(track / (2 * height)));
    return {
      defined: true,
      adhesion: phi, trackWidthM: track, centreHeightM: height,
      slipDeg: slip,
      rolloverDeg: rollover,
      // Що настане раніше — ковзання чи перекидання. Ковзання зворотне,
      // перекидання — ні, тому важливо, який із двох кутів менший.
      governing: slip <= rollover ? "slip" : "rollover",
      limitDeg: Math.min(slip, rollover)
    };
  }

  // K_φ = G_зч/G_a; рух можливий при K_φ ≥ (f + i)/φ.
  function adhesionWeightRatio({ drivingWeightN, grossWeightN, conditions }) {
    const driving = finiteNumber(drivingWeightN);
    const gross = finiteNumber(grossWeightN);
    if (driving === null || gross === null || driving <= 0 || gross <= 0) {
      return { defined: false, reason: "Потрібні зчіпна й повна сили тяжіння." };
    }
    if (driving > gross) {
      return {
        defined: false,
        reason: "Зчіпна вага перевищує повну: на ведучі колеса не може припадати "
          + "більше, ніж важить автомобіль."
      };
    }
    const { rollingResistanceF: f, gradeI: i, adhesion: phi } =
      conditions || REFERENCE_CONDITIONS;
    const value = driving / gross;
    const required = (f + i) / phi;
    return {
      defined: true,
      value,
      required,
      canMove: value >= required,
      drivingWeightN: driving,
      grossWeightN: gross,
      conditions: conditions || REFERENCE_CONDITIONS
    };
  }

  // p₀ = G/(n_к·F_к); без даних про F_к джерело велить брати тиск у шині.
  function groundPressure({ axleWeightN, wheelCount, contactAreaM2, tyrePressureKpa }) {
    const weight = finiteNumber(axleWeightN);
    const wheels = finiteNumber(wheelCount);
    const area = finiteNumber(contactAreaM2);
    const tyre = finiteNumber(tyrePressureKpa);
    if (area === null || area <= 0) {
      if (tyre === null || tyre <= 0) {
        return { defined: false, reason: "Потрібна площа відбитка або тиск у шині." };
      }
      return {
        defined: true,
        valueKpa: tyre,
        method: "tyre-pressure",
        tyrePressureKpa: tyre,
        reason: "Даних про площу відбитка немає, тому тиск на опорну поверхню "
          + "прирівняно до тиску повітря в шині, як велить джерело."
      };
    }
    if (weight === null || wheels === null || weight <= 0 || wheels <= 0) {
      return { defined: false, reason: "Потрібні вага на осі й кількість коліс." };
    }
    return {
      defined: true,
      valueKpa: weight / (wheels * area) / 1000,
      method: "sourced-formula",
      axleWeightN: weight,
      wheelCount: wheels,
      contactAreaM2: area
    };
  }

  function buildGradientStep({ slip, rollover, texNumber }) {
    return {
      id: "offroad-gradient",
      title: "Найбільший підйом, який автомобіль долає",
      purpose: "State which comes first uphill: wheelspin or tipping over.",
      output: {
        id: "value.offroad-gradient",
        symbol: "\\alpha_{\\max}",
        label: "Maximum gradient",
        valueType: "quantity",
        canonicalUnit: "deg"
      },
      expression: "min(slip, rollover)",
      dependencies: ["input.wheelbase", "value.centre-of-mass-front", "input.centre-height",
        "input.rolling-resistance", "decision.adhesion-coefficient"],
      equationNumber: "17.1",
      formulaTex: "\\begin{aligned}\\alpha_{\\text{ковз}}&=\\arctan"
        + "\\dfrac{\\varphi a/L-f}{1-\\varphi h_g/L}\\cdot\\dfrac{180}{\\pi}\\\\[3pt]"
        + "\\alpha_{\\text{пер}}&=\\arctan\\dfrac{b}{h_g}\\cdot\\dfrac{180}{\\pi}\\\\[3pt]"
        + "\\alpha_{\\max}&=\\min(\\alpha_{\\text{ковз}},\\alpha_{\\text{пер}})\\end{aligned}",
      substitutionTex: "\\begin{aligned}\\alpha_{\\text{ковз}}&=\\arctan\\left(\\dfrac{"
        + `${texNumber(slip.adhesion, 3)}\\cdot${texNumber(slip.frontToCentreM, 3)}/${texNumber(slip.wheelbaseM, 3)}`
        + `-${texNumber(slip.rollingResistanceF, 4)}}{1-${texNumber(slip.adhesion, 3)}`
        + `\\cdot${texNumber(slip.centreHeightM, 3)}/${texNumber(slip.wheelbaseM, 3)}}\\right)`
        + `\\cdot\\dfrac{180}{\\pi}=${texNumber(slip.value, 2)}^{\\circ}\\\\[3pt]`
        + `\\alpha_{\\text{пер}}&=\\arctan\\dfrac{${texNumber(rollover.rearToCentreM, 3)}}{${texNumber(rollover.centreHeightM, 3)}}`
        + `\\cdot\\dfrac{180}{\\pi}=${texNumber(rollover.value, 2)}^{\\circ}\\\\[3pt]`
        + `\\alpha_{\\max}&=\\min(${texNumber(slip.value, 2)},${texNumber(rollover.value, 2)})`
        + `=${texNumber(Math.min(slip.value, rollover.value), 2)}^{\\circ}\\end{aligned}`,
      result: {
        value: Math.min(slip.value, rollover.value),
        canonicalUnit: "deg",
        displayUnit: "град"
      },
      method: "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        slip.value <= rollover.value
          ? "Підйом обмежує ЗЧЕПЛЕННЯ: ведучі колеса зірвуться в буксування "
            + "раніше, ніж автомобіль перекинеться назад."
          : "Підйом обмежує ПЕРЕКИДАННЯ: автомобіль перекинеться назад раніше, "
            + "ніж зірвуться в буксування ведучі колеса."
      ],
      assumptions: [],
      limitations: []
    };
  }

  function buildSideSlopeStep({ sideSlope, texNumber }) {
    return {
      id: "offroad-side-slope",
      title: "Найбільший кут косогору",
      purpose: "State the side slope the vehicle can hold.",
      output: {
        id: "value.offroad-side-slope",
        symbol: "\\beta_{\\max}",
        label: "Maximum side slope",
        valueType: "quantity",
        canonicalUnit: "deg"
      },
      expression: "min(arctan(phi), arctan(B / 2h))",
      dependencies: ["input.track-width", "input.centre-height", "decision.adhesion-coefficient"],
      equationNumber: "17.2",
      formulaTex: "\\begin{aligned}\\beta_{\\text{ковз}}&\\approx\\arctan"
        + "\\varphi\\cdot\\dfrac{180}{\\pi}\\\\[3pt]\\beta_{\\text{пер}}&\\approx"
        + "\\arctan\\dfrac{B}{2h_g}\\cdot\\dfrac{180}{\\pi}\\\\[3pt]"
        + "\\beta_{\\max}&=\\min(\\beta_{\\text{ковз}},\\beta_{\\text{пер}})\\end{aligned}",
      substitutionTex: "\\begin{aligned}"
        + `\\beta_{\\text{ковз}}&=\\arctan(${texNumber(sideSlope.adhesion, 3)})\\cdot\\dfrac{180}{\\pi}`
        + `=${texNumber(sideSlope.slipDeg, 2)}^{\\circ}\\\\[3pt]`
        + `\\beta_{\\text{пер}}&=\\arctan\\dfrac{${texNumber(sideSlope.trackWidthM, 3)}}{2\\cdot${texNumber(sideSlope.centreHeightM, 3)}}`
        + `\\cdot\\dfrac{180}{\\pi}=${texNumber(sideSlope.rolloverDeg, 2)}^{\\circ}\\\\[3pt]`
        + `\\beta_{\\max}&=\\min(${texNumber(sideSlope.slipDeg, 2)},${texNumber(sideSlope.rolloverDeg, 2)})`
        + `=${texNumber(sideSlope.limitDeg, 2)}^{\\circ}\\end{aligned}`,
      result: { value: sideSlope.limitDeg, canonicalUnit: "deg", displayUnit: "град" },
      method: "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        sideSlope.governing === "slip"
          ? "У статичній моделі раніше настає бокове ковзання. Його наслідків "
            + "при русі та взаємодії з перешкодою ця оцінка не визначає."
          : "У статичній моделі раніше настає перекидання; ця межа не є "
            + "допустимим експлуатаційним кутом руху."
      ],
      assumptions: ["Вирази джерела наближені — воно й пише «≈»."],
      limitations: []
    };
  }

  function buildAdhesionRatioStep({ ratio, texNumber }) {
    const { rollingResistanceF: f, gradeI: i, adhesion: phi } = ratio.conditions;
    return {
      id: "offroad-adhesion-ratio",
      title: "Коефіцієнт зчіпної ваги",
      purpose: "Decide whether the vehicle can move at all on weak ground.",
      output: {
        id: "value.offroad-adhesion-ratio",
        symbol: "K_{\\varphi}",
        label: "Adhesion weight ratio",
        valueType: "float64",
        canonicalUnit: null
      },
      expression: "Gdriving / Gtotal",
      dependencies: ["value.axle-forces", "value.gross-weight-force"],
      equationNumber: "17.3",
      formulaTex: "K_{\\varphi}=\\dfrac{G_{\\text{зч}}}{G_a},\\qquad "
        + "K_{\\varphi}\\ge\\dfrac{f+i}{\\varphi}",
      substitutionTex: `K_{\\varphi}=\\dfrac{${texNumber(ratio.drivingWeightN, 1)}}{${texNumber(ratio.grossWeightN, 1)}}`
        + `=${texNumber(ratio.value, 3)}${ratio.canMove ? "\\ge" : "\\lt"}`
        + `\\dfrac{${f}+${i}}{${phi}}=${texNumber(ratio.required, 3)}`,
      result: { value: ratio.value, canonicalUnit: null, displayUnit: "" },
      method: "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        `Перевірка на слабкому ґрунті: f = ${f}, i = ${i}, φ = ${phi} — саме ці `
        + "значення називає джерело.",
        ratio.canMove
          ? "Умову за зчіпною вагою виконано. Достатність тягового моменту "
            + "для початку руху перевіряють окремо."
          : "Умову початку руху за зчіпною вагою для прийнятого ґрунту не виконано."
      ],
      assumptions: [],
      limitations: ratio.canMove ? [] : ["Умову руху за зчепленням не виконано."]
    };
  }

  function buildGroundPressureStep({ pressure, texNumber }) {
    return {
      id: "offroad-ground-pressure",
      title: "Тиск на опорну поверхню",
      purpose: "State how hard the wheels press on soft ground.",
      output: {
        id: "value.offroad-ground-pressure",
        symbol: "p_0",
        label: "Ground pressure",
        valueType: "quantity",
        canonicalUnit: "kPa"
      },
      expression: pressure.method === "tyre-pressure" ? "p_tyre" : "G / (n * F)",
      dependencies: pressure.method === "tyre-pressure" ? ["input.offroad-tyre-pressure"] : ["value.axle-forces"],
      equationNumber: "17.4",
      formulaTex: pressure.method === "tyre-pressure" ? "p_0\\approx p_{\\text{ш}}"
        : "p_0=\\dfrac{Z}{1000n_{\\text{к}}F_{\\text{к}}}\\quad[\\text{кПа}]",
      substitutionTex: pressure.method === "tyre-pressure"
        ? `p_0\\approx p_{\\text{ш}}=${texNumber(pressure.tyrePressureKpa, 1)}\\ \\text{кПа}`
        : `p_0=\\dfrac{${texNumber(pressure.axleWeightN, 1)}}{1000\\cdot${texNumber(pressure.wheelCount, 0)}`
          + `\\cdot${texNumber(pressure.contactAreaM2, 5)}}=${texNumber(pressure.valueKpa, 2)}\\ \\text{кПа}`,
      result: { value: pressure.valueKpa, canonicalUnit: "kPa", displayUnit: "кПа" },
      method: pressure.method === "tyre-pressure" ? "source-value" : "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: pressure.reason ? [pressure.reason,
        "Тиск повітря в шині є окремим проєктним припущенням; уточніть його за шиною та навантаженням осі."] : [],
      assumptions: [],
      limitations: pressure.method === "tyre-pressure"
        ? ["Тиск прирівняно до тиску в шині — це наближення джерела, а не "
          + "порахована величина."]
        : []
    };
  }

  function diagnosticsFor({ adhesionRatio, sideSlope }) {
    const out = [];
    if (adhesionRatio?.defined && !adhesionRatio.canMove) {
      const { rollingResistanceF: f, gradeI: i, adhesion: phi } = adhesionRatio.conditions;
      out.push({
        code: "OFFROAD_CANNOT_MOVE",
        severity: "warning",
        message: `Коефіцієнт зчіпної ваги ${adhesionRatio.value.toFixed(3)} менший `
          + `за потрібний ${adhesionRatio.required.toFixed(3)}: за f = ${f}, `
          + `i = ${i} і φ = ${phi} автомобіль не зрушить із місця.`,
        details: { node: "calc.offroad-adhesion-ratio" }
      });
    }
    if (sideSlope?.defined && sideSlope.governing === "rollover") {
      out.push({
        code: "OFFROAD_ROLLOVER_BEFORE_SLIP",
        severity: "warning",
        message: `На косогорі автомобіль перекинеться (${sideSlope.rolloverDeg
          .toFixed(1)}°) РАНІШЕ, ніж зісковзне (${sideSlope.slipDeg.toFixed(1)}°). `
          + "Ковзання зворотне, перекидання — ні.",
        details: { node: "calc.offroad-side-slope" }
      });
    }
    return out;
  }

  return Object.freeze({
    SOURCE_REFS,
    REFERENCE_CONDITIONS,
    gradientBySlip,
    gradientByRollover,
    sideSlopeLimits,
    adhesionWeightRatio,
    groundPressure,
    diagnosticsFor,
    buildGradientStep,
    buildSideSlopeStep,
    buildAdhesionRatioStep,
    buildGroundPressureStep
  });
}
