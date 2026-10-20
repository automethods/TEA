"use strict";

// Розділ 14 — привод ведучих коліс (півосі).
//
// Метод із методичних вказівок, підрозділ 4.1.6, друковані с. 53—55, звірені з
// рендером сторінок.
//
// Головна ідея розділу: діаметр півосі задає НЕ один режим, а найгірший із
// трьох. Джерело велить порахувати діаметр за кожним і взяти БІЛЬШИЙ — саме
// тому тут три вирази, а не один.
export function createWheelDrive({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
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

  const ADHESION_MAX = Object.freeze({ min: 0.8, max: 0.9 });
  const DYNAMIC_FACTOR = Object.freeze({
    passenger: { min: 1.7, max: 2.0 },
    goods: { min: 2.0, max: 2.5 }
  });
  const BENDING_STRESS_MPA = Object.freeze({ min: 100, max: 140 });
  const TORSION_STRESS_MPA = Object.freeze({ min: 500, max: 700 });
  const TWIST_LIMIT_DEG_PER_M = 9;
  const WHEEL_GEAR_MIN_TEETH = 12;

  // Модуль зсуву сталі за джерелом.
  const SHEAR_MODULUS_GPA = 85;
  const PRINTED_SHEAR_MODULUS = "85 ГПа";

  const LOAD_CASES = Object.freeze([
    { id: "traction", equation: "14.1",
      label: "прямолінійний рух: згин і кручення разом" },
    { id: "lateral", equation: "14.2", label: "бокова сила: лише згин" },
    { id: "obstacle", equation: "14.3", label: "переїзд перешкоди: лише згин" }
  ]);

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
    return { defined: true, value: (range.min + range.max) / 2,
      method: "source-midpoint", range, withinRange: true };
  }

  // d = ∛(32·M/(π·σ)); момент у Н·м → Н·мм, напруга в Н/мм², діаметр у мм.
  function diameterForMoment(momentNm, stressMpa) {
    return Math.cbrt(32 * momentNm * 1000 / (Math.PI * stressMpa));
  }

  // Три режими навантаження, три діаметри. Джерело велить узяти БІЛЬШИЙ.
  function loadedHalfShaft({ wheelLoadN, armM, dynamicRadiusM, adhesion,
    dynamicFactor, allowableStressMpa, wheelHubRatio = 1 }) {
    const values = {
      wheelLoadN: finiteNumber(wheelLoadN),
      armM: finiteNumber(armM),
      dynamicRadiusM: finiteNumber(dynamicRadiusM),
      adhesion: finiteNumber(adhesion),
      dynamicFactor: finiteNumber(dynamicFactor),
      allowableStressMpa: finiteNumber(allowableStressMpa),
      wheelHubRatio: finiteNumber(wheelHubRatio)
    };
    const missing = Object.entries(values).find(([, value]) => value === null || value <= 0);
    if (missing) {
      return { defined: false, reason: `Для розрахунку півосі бракує величини: ${missing[0]}.` };
    }
    const { wheelLoadN: load, armM: arm, dynamicRadiusM: radius,
      adhesion: phi, dynamicFactor: gamma, allowableStressMpa: stress } = values;

    // (14.1) M_зг = Z_к·b·√(1+φ²), M_кр = Z_к·φ·r_д, σ = 32√(M²зг+M²кр)/(πd³)
    const bendingTraction = load * arm * Math.sqrt(1 + phi * phi);
    const torsion = load * phi * radius / values.wheelHubRatio;
    const combined = Math.sqrt(bendingTraction ** 2 + torsion ** 2);
    // (14.2) бокова сила: σ_зг = 32·Z_к(b + φ'·r_д)/(πd³), φ' = φ
    const lateral = load * (arm + phi * radius);
    // (14.3) перешкода: σ_зг = 32·Z_к·γ_д·b/(πd³)
    const obstacle = load * gamma * arm;

    const cases = [
      { id: "traction", momentNm: combined, diameterMm: diameterForMoment(combined, stress),
        bendingNm: bendingTraction, torsionNm: torsion },
      { id: "lateral", momentNm: lateral, diameterMm: diameterForMoment(lateral, stress) },
      { id: "obstacle", momentNm: obstacle, diameterMm: diameterForMoment(obstacle, stress) }
    ];
    const governing = cases.reduce((worst, item) =>
      item.diameterMm > worst.diameterMm ? item : worst);
    return {
      defined: true,
      inputs: values,
      cases,
      governing,
      diameterMm: governing.diameterMm,
      allowableStressMpa: stress, wheelHubRatio: values.wheelHubRatio
    };
  }

  // (14.4) d = ∛(16·Z_к·φ·r_д/(π[τ])) — розвантажена піввісь несе лише кручення.
  //
  // Момент у цьому виразі — той, що обмежений ЗЧЕПЛЕННЯМ: більше за Z_к·φ·r_д
  // колесо не передасть, бо піде юзом. Але двигун через першу передачу здатен
  // подати на піввісь і більше — і тоді розмірним стає він.
  //
  // Розділ уже рахує обидва моменти, тож піввісь беруть за БІЛЬШИМ із них.
  // Інакше виходило безглуздя: пруток розміряли за одним моментом, а кут
  // закручування перевіряли за іншим, удвічі більшим, — і піввісь «не
  // проходила» за жорсткістю, хоча насправді просто була порахована не на той
  // момент.
  function unloadedHalfShaft({ wheelLoadN, dynamicRadiusM, adhesion, allowableShearMpa,
    designTorqueNm, shaftLengthM, wheelHubRatio = 1 }) {
    const load = finiteNumber(wheelLoadN);
    const radius = finiteNumber(dynamicRadiusM);
    const phi = finiteNumber(adhesion);
    const shear = finiteNumber(allowableShearMpa);
    const hub = finiteNumber(wheelHubRatio);
    if ([load, radius, phi, shear, hub].some(value => value === null || value <= 0)) {
      return { defined: false, reason: "Для розвантаженої півосі бракує величин." };
    }
    const adhesionTorqueNm = load * phi * radius / hub;
    const engineTorqueNm = finiteNumber(designTorqueNm);
    const governedByEngine = engineTorqueNm !== null && engineTorqueNm > adhesionTorqueNm;
    const torqueNm = governedByEngine ? engineTorqueNm : adhesionTorqueNm;
    const strengthMm = Math.cbrt(16 * torqueNm * 1000 / (Math.PI * shear));
    const stiffnessMm = diameterForTwistMm({ torqueNm, lengthM: shaftLengthM });
    const governedByStiffness = stiffnessMm !== null && stiffnessMm > strengthMm;
    return {
      defined: true,
      wheelLoadN: load, dynamicRadiusM: radius, adhesion: phi,
      torqueNm,
      adhesionTorqueNm,
      wheelHubRatio: hub,
      engineTorqueNm,
      governedByEngine,
      strengthDiameterMm: strengthMm,
      stiffnessDiameterMm: stiffnessMm,
      governedByStiffness,
      governingMode: governedByStiffness
        ? "stiffness" : (governedByEngine ? "engine" : "adhesion"),
      diameterMm: governedByStiffness ? stiffnessMm : strengthMm,
      allowableShearMpa: shear
    };
  }

  // Діаметр, що його вимагає ЖОРСТКІСТЬ.
  //
  // Розділ розміряє піввісь за найгіршим із режимів навантаження, але всі три
  // режими — про МІЦНІСТЬ. Джерело ставить ще одну умову, і вона не про
  // міцність: кут закручування не більший за 9° на метр. Обернувши вираз кута,
  // дістаємо діаметр, якого ця умова вимагає:
  //   φ = 32M·L/(πd⁴G)·180/π  ⇒  d = ⁴√(32M·L·180/(π²·φ_доп·G))
  // Розмірним стає більший із двох діаметрів — за міцністю чи за жорсткістю.
  function diameterForTwistMm({ torqueNm, lengthM, limitDegPerM = TWIST_LIMIT_DEG_PER_M,
    shearModulusGpa = SHEAR_MODULUS_GPA }) {
    const torque = finiteNumber(torqueNm);
    const length = finiteNumber(lengthM);
    const limit = finiteNumber(limitDegPerM);
    const modulus = finiteNumber(shearModulusGpa);
    if ([torque, length, limit, modulus].some(value => value === null || value <= 0)) {
      return null;
    }
    // Допустимий кут на всю довжину, у радіанах.
    const allowedRad = limit * length * Math.PI / 180;
    const fourth = 32 * torque * length / (Math.PI * allowedRad * modulus * 1e9);
    return fourth > 0 ? fourth ** 0.25 * 1000 : null;
  }

  // M_розр = β·M_кmax·u_к1·u₀·K_M
  function designTorque({ engineTorqueNm, reserveFactor, firstGearRatio,
    finalDriveRatio, distributionCoefficient, reserveFactorIsAbsent = false, transferRatio = 1,
    finalDriveValueRef = "value.final-drive-ratio", transferRatioSourceRef = "decision.transfer-case-ratio",
    firstGearValueRef = "value.gearbox-ladder" }) {
    const values = [engineTorqueNm, reserveFactor, firstGearRatio, finalDriveRatio,
      distributionCoefficient, transferRatio].map(finiteNumber);
    if (values.some(value => value === null || value <= 0)) {
      return { defined: false, reason: "Потрібні момент двигуна, коефіцієнт запасу, "
        + "передаточні числа й коефіцієнт розподілу моменту." };
    }
    const [torque, beta, first, final, distribution, transfer] = values;
    return {
      defined: true,
      value: beta * torque * first * transfer * final * distribution,
      engineTorqueNm: torque, reserveFactor: beta, firstGearRatio: first,
      finalDriveRatio: final, distributionCoefficient: distribution, transferRatio: transfer,
      reserveFactorIsAbsent, finalDriveValueRef, transferRatioSourceRef, firstGearValueRef
    };
  }

  // (14.5) θ = M·ℓ/(G·J_p)·180/π, J_p = πd⁴/32; межа — 9° на метр.
  function twistAngle({ torqueNm, lengthM, diameterMm, shearModulusGpa = SHEAR_MODULUS_GPA }) {
    const torque = finiteNumber(torqueNm);
    const length = finiteNumber(lengthM);
    const diameter = finiteNumber(diameterMm);
    const modulus = finiteNumber(shearModulusGpa);
    if ([torque, length, diameter, modulus].some(value => value === null || value <= 0)) {
      return { defined: false, reason: "Потрібні момент, довжина півосі, діаметр і модуль зсуву." };
    }
    const polarMomentMm4 = Math.PI * diameter ** 4 / 32;
    const radians = torque * 1000 * (length * 1000) / (modulus * 1000 * polarMomentMm4);
    const degrees = radians * 180 / Math.PI;
    return {
      defined: true,
      value: degrees,
      torqueNm: torque, lengthM: length, diameterMm: diameter,
      perMetreDeg: degrees / length,
      // The diameter may be obtained by inverting this same limit. Binary64
      // round-off (for example 9.000000000000004°/m) is not an exceedance.
      withinLimit: degrees / length <= TWIST_LIMIT_DEG_PER_M * (1 + 1e-12),
      limitDegPerM: TWIST_LIMIT_DEG_PER_M,
      polarMomentMm4,
      shearModulusGpa: modulus
    };
  }

  // Колісна передача: Z_к = Z_по(u_р − 1), Z_по ≥ 12, Z_к кратне числу сателітів.
  function wheelGearTeeth({ sunTeeth, ratio, satelliteCount }) {
    const sun = finiteNumber(sunTeeth);
    const gearRatio = finiteNumber(ratio);
    const satellites = finiteNumber(satelliteCount);
    if (sun === null || !Number.isInteger(sun)) {
      return { defined: false, reason: "Кількість зубів центральної шестірні має бути цілою." };
    }
    if (sun < WHEEL_GEAR_MIN_TEETH) {
      return {
        defined: false,
        reason: `Джерело вимагає Z_по ≥ ${WHEEL_GEAR_MIN_TEETH}, а прийнято ${sun}.`
      };
    }
    if (gearRatio === null || gearRatio <= 1) {
      return { defined: false, reason: "Передаточне число колісної передачі має бути більшим за одиницю." };
    }
    if (satellites === null || !Number.isInteger(satellites) || satellites < 2) {
      return { defined: false, reason: "Кількість сателітів має бути цілою, не меншою за два." };
    }
    const exact = sun * (gearRatio - 1);
    // Кратність числу сателітів — умова складання, і округляють саме до неї.
    const ring = Math.round(exact / satellites) * satellites;
    return {
      defined: true,
      sunTeeth: sun,
      ringTeeth: ring,
      exactRingTeeth: exact,
      satelliteCount: satellites,
      actualRatio: 1 + ring / sun,
      divisible: ring % satellites === 0
    };
  }

  function buildDiameterStep({ loaded, texNumber }) {
    const v = loaded.inputs;
    const n = (value, digits = 3) => texNumber(value, digits);
    const load = n(v.wheelLoadN, 1), arm = n(v.armM), radius = n(v.dynamicRadiusM),
      phi = n(v.adhesion), gamma = n(v.dynamicFactor), stress = n(v.allowableStressMpa, 1),
      hub = n(v.wheelHubRatio);
    const moments = [
      `\\sqrt{(${load}\\cdot${arm})^2(1+${phi}^2)+(${load}\\cdot${phi}\\cdot${radius}/${hub})^2}`,
      `${load}(${arm}+${phi}\\cdot${radius})`, `${load}\\cdot${gamma}\\cdot${arm}`
    ];
    const names = ["тяга", "бічна", "перешкода"];
    const lines = loaded.cases.map((item, index) => `d_{\\mathrm{${names[index]}}}&=`
      + `\\sqrt[3]{\\frac{32\\cdot10^3\\cdot${moments[index]}}{\\pi\\cdot${stress}}}`
      + `=${n(item.diameterMm, 2)}\\ \\text{мм}`);
    lines.push(`d&=\\max(${loaded.cases.map(item => n(item.diameterMm, 2)).join(",")})`
      + `=${n(loaded.diameterMm, 2)}\\ \\text{мм}`);
    return {
      id: "half-shaft-diameter",
      title: "Діаметр навантаженої півосі",
      purpose: "Size the half-shaft against the worst of three load modes.",
      output: {
        id: "value.half-shaft-diameter",
        symbol: "d",
        label: "Half shaft diameter",
        valueType: "quantity",
        canonicalUnit: "mm"
      },
      expression: "max over load cases of cbrt(32 M / (pi sigma))",
      dependencies: ["decision.half-shaft-bending-stress", "decision.half-shaft-arm", "decision.half-shaft-kind", "decision.half-shaft-dynamic-factor", "value.axle-forces", "decision.half-shaft-adhesion", "value.dynamic-wheel-radius",
        ...((loaded.wheelHubRatio ?? 1) !== 1 ? ["decision.wheel-gear-ratio"] : [])],
      equationNumber: "14.1",
      formulaTex: "d_i=\\sqrt[3]{\\dfrac{32M_i}{\\pi[\\sigma]}},\\qquad d=\\max(d_{\\mathrm{тяга}},d_{\\mathrm{бічна}},d_{\\mathrm{перешкода}})",
      substitutionTex: `\\begin{aligned}${lines.join("\\\\")}\\end{aligned}`,
      result: { value: loaded.diameterMm, canonicalUnit: "mm", displayUnit: "мм" },
      method: "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        // Це і є суть розділу: діаметр задає найгірший режим, а не тяговий.
        `Три режими дають три діаметри; джерело велить узяти БІЛЬШИЙ. Тут `
        + `визначальний — «${LOAD_CASES.find(item => item.id === loaded.governing.id)
          ?.label}».`,
        `Напруги згину прийнято ${loaded.allowableStressMpa} МПа з діапазону `
        + `${BENDING_STRESS_MPA.min}…${BENDING_STRESS_MPA.max} МПа.`
      ],
      assumptions: ["φ′max = φmax, як велить джерело.",
        "У числовій підстановці моменти в Н·м множать на 10³, щоб одержати Н·мм; допустиме напруження в МПа дорівнює Н/мм².",
        `Крутний момент до колісного редуктора: Mкр = Zк·φ·rд/uкол, uкол = ${texNumber(loaded.wheelHubRatio ?? 1,3)}. Згин від колісних сил редуктором не зменшують.`],
      limitations: []
    };
  }

  function buildUnloadedStep({ unloaded, texNumber }) {
    const n = (value, digits = 3) => texNumber(value, digits);
    const stiffness = Number.isFinite(unloaded.stiffnessDiameterMm);
    const forceTorque = `${n(unloaded.wheelLoadN, 1)}\\cdot${n(unloaded.adhesion)}\\cdot${n(unloaded.dynamicRadiusM)}/${n(unloaded.wheelHubRatio ?? 1)}`;
    const lines = [
      `M_{\\mathrm{кр}}&=${Number.isFinite(unloaded.engineTorqueNm)
        ? `\\max(${forceTorque},${n(unloaded.engineTorqueNm, 2)})` : forceTorque}`
        + `=${n(unloaded.torqueNm, 2)}\\ \\text{Н}\\cdot\\text{м}`,
      `d_{\\tau}&=\\sqrt[3]{\\frac{16\\cdot${n(unloaded.torqueNm, 2)}\\cdot10^3}{\\pi\\cdot${n(unloaded.allowableShearMpa, 1)}}}`
        + `=${n(unloaded.strengthDiameterMm, 2)}\\ \\text{мм}`
    ];
    if (stiffness) lines.push(
      `d_{\\theta}&=10^3\\sqrt[4]{\\frac{32\\cdot${n(unloaded.torqueNm, 2)}\\cdot180}{\\pi^2\\cdot${SHEAR_MODULUS_GPA}\\cdot10^9\\cdot${TWIST_LIMIT_DEG_PER_M}}}`
        + `=${n(unloaded.stiffnessDiameterMm, 2)}\\ \\text{мм}`);
    lines.push(`d&=${stiffness ? `\\max(${n(unloaded.strengthDiameterMm, 2)},${n(unloaded.stiffnessDiameterMm, 2)})` : n(unloaded.strengthDiameterMm, 2)}`
      + `=${n(unloaded.diameterMm, 2)}\\ \\text{мм}`);
    return {
      id: "half-shaft-unloaded-diameter",
      title: "Діаметр розвантаженої півосі",
      purpose: "Size an unloaded half-shaft, which carries torque only.",
      output: {
        id: "value.half-shaft-unloaded-diameter",
        symbol: "d",
        label: "Unloaded half shaft diameter",
        valueType: "quantity",
        canonicalUnit: "mm"
      },
      expression: "max(cbrt(16 max(Z phi r/u_hub, M_drive) / (pi tau)), stiffness diameter)",
      dependencies: ["decision.half-shaft-shear-stress", "value.axle-forces", "decision.half-shaft-adhesion", "value.dynamic-wheel-radius",
        ...((unloaded.wheelHubRatio ?? 1) !== 1 ? ["decision.wheel-gear-ratio"] : []),
        ...(Number.isFinite(unloaded.engineTorqueNm) ? ["value.half-shaft-design-torque"] : [])],
      equationNumber: "14.4",
      formulaTex: "M_{\\mathrm{кр}}=\\max\\left(\\dfrac{Z_{\\mathrm{к}}\\varphi_{\\max}r_{\\mathrm{д}}}{u_{\\mathrm{кол}}},M_{\\mathrm{прив}}\\right),"
        + "\\quad d=\\max\\left(\\sqrt[3]{\\dfrac{16M_{\\mathrm{кр}}}{\\pi[\\tau]}},d_\\theta\\right)",
      substitutionTex: `\\begin{aligned}${lines.join("\\\\")}\\end{aligned}`,
      result: { value: unloaded.diameterMm, canonicalUnit: "mm", displayUnit: "мм" },
      method: "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        "Розвантажена піввісь не несе згину — його беруть на себе підшипники "
        + "маточини, тому лишається саме кручення.",
        `Допустимі напруги кручення прийнято ${unloaded.allowableShearMpa} МПа `
        + `з ${TORSION_STRESS_MPA.min}…${TORSION_STRESS_MPA.max} МПа.`,
        // Який саме режим задав розмір — головне, що читач має тут побачити.
        {
          adhesion: () => "Розмір задало ЗЧЕПЛЕННЯ: більше за Z_к·φ·r_д колесо не "
            + "передасть, бо піде юзом.",
          engine: () => "Розмір задав ДВИГУН: через першу передачу він подає на "
            + `піввісь ${texNumber(unloaded.engineTorqueNm ?? 0, 0)} Н·м проти `
            + `${texNumber(unloaded.adhesionTorqueNm, 0)} Н·м, які дозволяє `
            + "зчеплення.",
          stiffness: () => "Розмір задала ЖОРСТКІСТЬ, а не міцність. За напругами "
            + `вистачило б ${texNumber(unloaded.strengthDiameterMm, 1)} мм, але `
            + `тоді піввісь закрутилася б понад ${TWIST_LIMIT_DEG_PER_M}°/м, які `
            + `дозволяє джерело. Умова жорсткості вимагає `
            + `${texNumber(unloaded.stiffnessDiameterMm, 1)} мм — це і взято.`
        }[unloaded.governingMode]?.() || "Визначальний режим не задано."
      ],
      assumptions: [`Колісний редуктор стоїть після півосі; момент від зчеплення на її вході зменшено у ${texNumber(unloaded.wheelHubRatio ?? 1,3)} раза. dθ — діаметр за окремою умовою жорсткості.`,
        "У формулі міцності момент переведено з Н·м у Н·мм множником 10³. Для жорсткості G=85·10⁹ Па і межа 9°/м; корінь дає метри, які переведено в міліметри множником 10³."],
      limitations: [
        "Джерело вимагає окремо вказати, які елементи конструкції розвантажують "
        + "піввісь від згину.",
        ...(!Number.isFinite(unloaded.stiffnessDiameterMm)
          ? ["Довжину півосі не задано: наведено попередній діаметр за міцністю; жорсткість і загальний кут закручування ще не перевірено."] : [])
      ]
    };
  }

  function buildDesignTorqueStep({ torque, texNumber }) {
    return {
      id: "half-shaft-design-torque",
      title: "Розрахунковий момент на півосі",
      purpose: "Take the torque that reaches one driving wheel.",
      output: {
        id: "value.half-shaft-design-torque",
        symbol: "M_{\\text{розр}}",
        label: "Half shaft design torque",
        valueType: "quantity",
        canonicalUnit: "N*m"
      },
      expression: "beta * M * u1 * u_transfer * u0 * KM",
      // Джерело моменту залежить від приводу: у ДВЗ це максимальний момент
      // двигуна, в електричного — характеристика мотора. Півосі є в обох.
      dependencies: [
        torque.reserveFactorIsAbsent
          ? "value.traction-characteristic-motor" : "value.maximum-engine-torque",
        ...(torque.firstGearValueRef ? [torque.firstGearValueRef] : []),
        "value.differential-torque-distribution",
        ...(torque.finalDriveValueRef ? [torque.finalDriveValueRef] : []),
        ...((torque.transferRatio ?? 1) !== 1 ? [torque.transferRatioSourceRef || "decision.transfer-case-ratio"] : [])
      ],
      equationNumber: "14.5",
      formulaTex: "M_{\\text{розр}}=\\beta M_{\\text{к}\\max}"
        + (torque.firstGearValueRef === "value.governing-gearbox-ratio" ? "\\max(u_1,|u_R|)" : "u_{\\text{к}1}") + "u_{\\mathrm{рк}}u_0K_M",
      substitutionTex: `M_{\\text{розр}}=${texNumber(torque.reserveFactor, 3)}\\cdot`
        + `${texNumber(torque.engineTorqueNm, 0)}\\cdot`
        + `${texNumber(torque.firstGearRatio, 2)}\\cdot`
        + `${texNumber(torque.transferRatio ?? 1, 3)}\\cdot`
        + `${texNumber(torque.finalDriveRatio, 2)}\\cdot`
        + `${texNumber(torque.distributionCoefficient, 3)}`
        + `=${texNumber(torque.value, 0)}\\ \\text{Н}\\cdot\\text{м}`,
      result: { value: torque.value, canonicalUnit: "N*m", displayUnit: "Н·м" },
      method: "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        "K_M з розділу 13: саме він вирішує, скільки з осьового моменту "
        + "дістанеться одному колесу."
      ],
      assumptions: ["Піввісь розташована до колісного редуктора; його передаточне число не множать у вхідний момент півосі. Для попередньої міцності втрати не зменшують навантаження."],
      limitations: torque.reserveFactorIsAbsent
        ? ["Коефіцієнта запасу зчеплення β тут немає: в електричного привода "
          + "немає зчеплення. Джерело такого випадку не розглядає."]
        : []
    };
  }

  // Діаметр приходить або з (14.1)—(14.3), або з (14.4) — залежно від типу
  // півосі. Крок має посилатися на ТОЙ, що справді пораховано, інакше
  // залежність указує на величину, якої в цьому проєкті немає.
  function buildTwistStep({ twist, diameterValueId = "value.half-shaft-diameter",
    texNumber }) {
    return {
      id: "half-shaft-twist",
      title: "Кут закручування півосі",
      purpose: "Check the half-shaft stiffness against the printed limit.",
      output: {
        id: "value.half-shaft-twist",
        symbol: "\\theta",
        label: "Half shaft twist",
        valueType: "quantity",
        canonicalUnit: "deg"
      },
      expression: "M l / (G Jp) * 180 / pi",
      dependencies: ["decision.half-shaft-length", "value.half-shaft-design-torque", diameterValueId],
      equationNumber: "14.6",
      formulaTex: "\\theta=\\dfrac{M_{\\text{розр}}\\ell}{GJ_p}"
        + "\\cdot\\dfrac{180}{\\pi},\\qquad J_p=\\dfrac{\\pi d^{4}}{32}",
      substitutionTex: `\\begin{aligned}J_p&=\\frac{\\pi\\cdot${texNumber(twist.diameterMm, 3)}^4}{32}`
        + `=${texNumber(twist.polarMomentMm4, 2)}\\ \\text{мм}^4\\\\`
        + `\\theta&=\\frac{${texNumber(twist.torqueNm, 2)}\\cdot10^3\\cdot${texNumber(twist.lengthM, 3)}\\cdot10^3}`
        + `{${texNumber(twist.shearModulusGpa, 0)}\\cdot10^3\\cdot${texNumber(twist.polarMomentMm4, 2)}}`
        + `\\cdot\\frac{180}{\\pi}=${texNumber(twist.value, 2)}^{\\circ}\\end{aligned}`,
      result: { value: twist.value, canonicalUnit: "deg", displayUnit: "град" },
      method: "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        `Межа — ${twist.limitDegPerM}° на метр довжини. У карданного вала `
        + "(розділ 11) вона інша — 6°/м; це різні вузли й різні вимоги.",
        `Питоме закручування θ/ℓ = ${texNumber(twist.value, 3)}° / ${texNumber(twist.lengthM, 3)} м = ${texNumber(twist.perMetreDeg, 3)}°/м. Загальний кут у градусах і кут на метр — різні величини.`
      ],
      assumptions: [],
      limitations: [
        ...(twist.withinLimit ? [] : ["Кут перевищує межу джерела."])
      ]
    };
  }

  function decisionsFor({ halfShaftKind, adhesion, dynamicFactor, bendingStress,
    shearStress, armM, lengthM, armAdoption, lengthAdoption }) {
    const decisions = [];
    if (halfShaftKind) {
      decisions.push({
        id: "decision.half-shaft-kind",
        kind: "Decision",
        choiceRef: null,
        symbol: null,
        adoptedValue: halfShaftKind,
        canonicalUnit: null,
        method: "project-input",
        selectedReferenceId: null,
        recommendedValue: null,
        recommendedSourceRefs: SOURCE_REFS,
        rationale: halfShaftKind === "unloaded"
          ? "Розвантажена піввісь: згин беруть на себе підшипники маточини, "
            + "тому діаметр задає лише кручення."
          : "Навантажена піввісь несе і згин, і кручення, тому діаметр задає "
            + "найгірший із трьох режимів.",
        sourceRefs: SOURCE_REFS,
        limitations: [],
        manuallyOverridden: true
      });
    }
    [["decision.half-shaft-adhesion", "\\varphi_{\\max}", adhesion, ADHESION_MAX, null],
      ["decision.half-shaft-dynamic-factor", "\\gamma_{\\text{д}}", dynamicFactor, null, null],
      ["decision.half-shaft-bending-stress", "\\sigma", bendingStress,
        BENDING_STRESS_MPA, "MPa"],
      ["decision.half-shaft-shear-stress", "[\\tau]", shearStress,
        TORSION_STRESS_MPA, "MPa"]]
      .forEach(([id, symbol, adopted, range, unit]) => {
        if (!adopted?.defined) return;
        const band = range || adopted.range;
        decisions.push({
          id,
          kind: "Decision",
          choiceRef: null,
          symbol,
          adoptedValue: adopted.value,
          canonicalUnit: unit,
          method: adopted.method === "project-input" ? "project-input" : "source-midpoint",
          selectedReferenceId: null,
          recommendedValue: band ? (band.min + band.max) / 2 : null,
          recommendedSourceRefs: SOURCE_REFS,
          rationale: adopted.method === "project-input"
            ? `Власне значення автора.${band ? ` Джерело подає ${band.min}…${band.max}.` : ""}`
            : `Прийнято середину діапазону${band ? ` ${band.min}…${band.max}` : ""}.`,
          sourceRefs: adopted.method === "project-input"
            ? ["source.project-input"] : SOURCE_REFS,
          limitations: adopted.withinRange === false
            ? ["Значення лежить поза діапазоном джерела."] : [],
          manuallyOverridden: adopted.method === "project-input"
        });
      });
    [["decision.half-shaft-arm", "b", armM, "m",
      "Відстань від площини обертання колеса до небезпечного перерізу півосі — "
      + "з компонувальної схеми (рис. 25 джерела)."],
      ["decision.half-shaft-length", "\\ell", lengthM, "m",
        "Довжина півосі — від фланця до половини довжини шліців."]]
      .forEach(([id, symbol, value, unit, rationale]) => {
        if (!Number.isFinite(value)) return;
        const adoption = id === "decision.half-shaft-arm" ? armAdoption : lengthAdoption;
        decisions.push({
          id, kind: "Decision", choiceRef: null, symbol,
          adoptedValue: value, canonicalUnit: unit,
          method: adoption?.method || "project-input", selectedReferenceId: null,
          recommendedValue: null, recommendedSourceRefs: [],
          rationale: adoption?.rationale || rationale,
          sourceRefs: adoption?.sourceRefs || ["source.project-input"],
          limitations: adoption?.limitations || [],
          manuallyOverridden: adoption?.manuallyOverridden ?? true
        });
      });
    return decisions;
  }

  function diagnosticsFor({ twist, loaded }) {
    const out = [];
    if (twist?.defined && !twist.withinLimit) {
      out.push({
        code: "HALF_SHAFT_TWIST_EXCEEDS_LIMIT",
        severity: "warning",
        message: `Кут закручування півосі ${twist.perMetreDeg.toFixed(2)}°/м перевищує `
          + `${twist.limitDegPerM}°/м, які подає джерело.`,
        details: { node: "calc.half-shaft-twist" }
      });
    }
    if (loaded?.defined && loaded.governing.id !== "traction") {
      out.push({
        code: "HALF_SHAFT_GOVERNED_BY_SIDE_LOAD",
        severity: "info",
        message: `Діаметр півосі задає не тяга, а режим «${
          LOAD_CASES.find(item => item.id === loaded.governing.id)?.label
        }»: саме він дав найбільший діаметр.`,
        details: { node: "calc.half-shaft-diameter" }
      });
    }
    return out;
  }

  return Object.freeze({
    SOURCE_REFS,
    ADHESION_MAX,
    DYNAMIC_FACTOR,
    BENDING_STRESS_MPA,
    TORSION_STRESS_MPA,
    TWIST_LIMIT_DEG_PER_M,
    WHEEL_GEAR_MIN_TEETH,
    SHEAR_MODULUS_GPA,
    PRINTED_SHEAR_MODULUS,
    LOAD_CASES,
    adoptRange,
    loadedHalfShaft,
    unloadedHalfShaft,
    diameterForTwistMm,
    designTorque,
    twistAngle,
    wheelGearTeeth,
    diagnosticsFor,
    buildDiameterStep,
    buildUnloadedStep,
    buildDesignTorqueStep,
    buildTwistStep,
    decisionsFor
  });
}
