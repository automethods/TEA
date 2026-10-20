"use strict";

// Розділ 20 — гальмівна система.
//
// Метод із методичних вказівок, підрозділи 4.4.1—4.4.2, друковані с. 70—74,
// звірені з рендером сторінок.
//
// УВАГА до формули φ_розр. Джерело друкує K_τ(a − b)/((K_τ+1)h_g), і для
// звичайного автомобіля це дає ВІД'ЄМНИЙ коефіцієнт зчеплення — величину, якої
// не буває. Виведення з тих самих реакцій, які джерело подає нижче, дає
// (K_τ·a − b)/((K_τ+1)h_g). Документ рахує обидві й веде ланцюг за виведеною:
// від'ємне φ зробило б від'ємним і гальмовий момент.
export function createBrakes({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
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

  // Коефіцієнт розподілу гальмових сил між осями.
  const FORCE_DISTRIBUTION = Object.freeze({
    balanced: { min: 1.5, max: 1.6 },
    frontHeavy: { min: 0.6, max: 1.0 }
  });
  const FRICTION_COEFFICIENT = Object.freeze({ min: 0.30, max: 0.35 });
  const WRAP_ANGLE_DEG = Object.freeze({ min: 60, max: 140 });
  // a ≈ b ≈ 0,8R_б — геометрія барабана.
  const DRUM_GEOMETRY_SHARE = 0.8;

  const PEDAL_TRAVEL_MM = Object.freeze({
    passenger: { min: 70, max: 75 },
    goods: { min: 80, max: 100 }
  });
  const SHOE_TRAVEL_MM = Object.freeze({ min: 5, max: 6 });
  const HYDRAULIC_EFFICIENCY = Object.freeze({ min: 0.95, max: 0.97 });
  const PNEUMATIC_EFFICIENCY = Object.freeze({ min: 0.92, max: 0.95 });
  const HYDRAULIC_FORCE_RATIO = Object.freeze({
    passenger: { min: 30, max: 40 },
    goods: { min: 50, max: 60 }
  });
  const PNEUMATIC_FORCE_RATIO = Object.freeze({ min: 100, max: 600 });
  // Межі зусилля на педалі.
  // Вище за зчеплення сухого асфальту не буває: коефіцієнт розподілу, який
  // вимагає більшого, не можна здійснити на жодній дорозі.
  const ATTAINABLE_ADHESION_MAX = 0.8;
  const PEDAL_EFFORT_N = Object.freeze({
    service: { min: 100, max: 150 },
    emergency: 500,
    boosterThreshold: 400
  });

  const midpoint = range => (range.min + range.max) / 2;

  // Зведення багатовісного автомобіля до двовісного.
  //
  // Поздовжній перерозподіл ваги при гальмуванні описують через a, b і базу,
  // і всі ці вирази писані для ДВОХ осей. У тривісного автомобіля задній
  // візок працює як одна опора, прикладена в його центрі, тому за задню вісь
  // беруть точку B + B₁/2 від передньої, а базою стає та сама відстань.
  //
  // Без цього зведення b = B − a дає безглузде число: у фікстури 6×4 воно
  // виходило 0,43 м при a = 2,27 м, тобто центр мас нібито стояв на 84 %
  // бази, і за ним K_τ вимагав зчеплення 2,2 — більшого, ніж дає будь-яка
  // дорога. Перевірка зведення проста: b/L_екв має дорівнювати оголошеній
  // частці передньої осі, і воно дорівнює.
  function equivalentTwoAxle({ wheelbaseM, rearSpacingM, frontToCentreM, axleCount }) {
    const base = finiteNumber(wheelbaseM);
    const front = finiteNumber(frontToCentreM);
    if (base === null || front === null || base <= 0 || front <= 0) {
      return { defined: false, reason: "Потрібні база й відстань до центра мас." };
    }
    const spacing = finiteNumber(rearSpacingM);
    const axles = finiteNumber(axleCount);
    // Зводять ЛИШЕ багатовісний. Поле міжосьової відстані заднього візка
    // існує в геометрії завжди, і в двовісного автомобіля воно не означає
    // нічого: якби зведення вмикали за ним, двовісні машини діставали б
    // вигадану третю опору.
    const hasBogie = axles !== null && axles > 2 && spacing !== null && spacing > 0;
    const effectiveBaseM = hasBogie ? base + spacing / 2 : base;
    const rearToCentreM = effectiveBaseM - front;
    if (!(rearToCentreM > 0)) {
      return {
        defined: false,
        reason: "Центр мас вийшов за задню вісь: перевірте базу й розподіл ваги."
      };
    }
    return {
      defined: true,
      effectiveBaseM,
      rearToCentreM,
      frontToCentreM: front,
      reducedFromBogie: effectiveBaseM !== base
    };
  }

  function distributionForAdhesion({ frontToCentreM, rearToCentreM, centreHeightM, adhesion }) {
    const [a,b,h,mu] = [frontToCentreM,rearToCentreM,centreHeightM,adhesion].map(finiteNumber);
    if ([a,b,h,mu].some(x => x === null || x <= 0) || mu > 1 || a - mu*h <= 0) {
      return {defined:false, reason:"Потрібні додатні координати центра мас і зчеплення; задня вісь не повинна розвантажуватися."};
    }
    return {defined:true, value:(b+mu*h)/(a-mu*h), method:"axle-reaction-sizing",
      designAdhesion:mu, withinRange:null, sourceRefs:["source.project-input"]};
  }

  // φ_розр. Друкований вираз і виведений із реакцій — обидва.
  function designAdhesion({ distributionCoefficient, frontToCentreM, rearToCentreM,
    centreHeightM }) {
    const k = finiteNumber(distributionCoefficient);
    const a = finiteNumber(frontToCentreM);
    const b = finiteNumber(rearToCentreM);
    const h = finiteNumber(centreHeightM);
    if ([k, a, b, h].some(value => value === null) || k <= 0 || a <= 0 || b <= 0 || h <= 0) {
      return { defined: false, reason: "Потрібні K_τ і координати центра мас." };
    }
    const denominator = (k + 1) * h;
    // Як надруковано: K_τ(a − b).
    const printed = k * (a - b) / denominator;
    // Як виходить із реакцій, що їх подає саме це джерело нижче:
    // K_τ = Z₁/Z₂ = (b + φh)/(a − φh) ⇒ φ = (K_τ·a − b)/((K_τ+1)h).
    const derived = (k * a - b) / denominator;
    return {
      defined: true,
      value: derived,
      printedValue: printed,
      derivedValue: derived,
      printedIsUsable: printed > 0,
      attainable: derived > 0 && derived <= ATTAINABLE_ADHESION_MAX,
      attainableMax: ATTAINABLE_ADHESION_MAX,
      distributionCoefficient: k,
      frontToCentreM: a,
      rearToCentreM: b,
      centreHeightM: h
    };
  }

  // Z_τ1 = (G/2)(b + φh)/L, Z_τ2 = (G/2)(a − φh)/L — на одне колесо осі.
  function axleReactions({ grossWeightN, wheelbaseM, frontToCentreM, rearToCentreM,
    centreHeightM, adhesion }) {
    const weight = finiteNumber(grossWeightN);
    const base = finiteNumber(wheelbaseM);
    const a = finiteNumber(frontToCentreM);
    const b = finiteNumber(rearToCentreM);
    const h = finiteNumber(centreHeightM);
    const phi = finiteNumber(adhesion);
    if ([weight, base, a, b, h, phi].some(value => value === null)
      || weight <= 0 || base <= 0 || phi <= 0) {
      return { defined: false, reason: "Для реакцій бракує величин." };
    }
    const front = weight / 2 * (b + phi * h) / base;
    const rear = weight / 2 * (a - phi * h) / base;
    if (!(rear > 0)) {
      return {
        defined: false,
        reason: "Реакція на задніх колесах вийшла недодатною: за таким зчепленням "
          + "і такою висотою центра мас задня вісь відривається від дороги."
      };
    }
    return { defined: true, frontWheelN: front, rearWheelN: rear, adhesion: phi,
      grossWeightN: weight, wheelbaseM: base, frontToCentreM: a,
      rearToCentreM: b, centreHeightM: h };
  }

  // M_τ = φ_розр·Z_τ·r_d — граничний гальмовий момент на колесі.
  function brakeMoment({ adhesion, wheelReactionN, dynamicRadiusM }) {
    const phi = finiteNumber(adhesion);
    const reaction = finiteNumber(wheelReactionN);
    const radius = finiteNumber(dynamicRadiusM);
    if ([phi, reaction, radius].some(value => value === null || value <= 0)) {
      return { defined: false, reason: "Потрібні φ, реакція дороги й динамічний радіус." };
    }
    return { defined: true, value: phi * reaction * radius,
      reactionN: reaction, radiusM: radius, adhesion: phi };
  }

  // Типи гальмових механізмів і їхні моменти тертя.
  const MECHANISMS = Object.freeze([
    {
      id: "drum-equal-forces",
      label: "Барабанний із рівними приводними силами й різними кутами охоплення",
      formulaTex: "M_{\\text{тр}}=\\mu hR_{\\text{б}}"
        + "\\dfrac{2Pa}{a^{2}-\\mu^{2}b^{2}}"
    },
    {
      id: "drum-two-forces",
      label: "Барабанний із двома приводними силами",
      formulaTex: "M_{\\text{тр}}=\\mu hR_{\\text{б}}\\dfrac{2P}{a-\\mu b}"
    },
    {
      id: "drum-one-force",
      label: "Барабанний з однією приводною силою",
      formulaTex: "M_{\\text{тр}}=\\mu h^{2}R_{\\text{б}}"
        + "\\dfrac{P}{\\left(a-\\mu b\\right)^{2}}"
    },
    {
      id: "disc",
      label: "Дисковий",
      formulaTex: "M_{\\text{тр}}=P\\mu R_{\\text{ср}}n"
    }
  ]);

  function mechanism(id) {
    return MECHANISMS.find(item => item.id === id) || null;
  }

  // Обертають: із потрібного моменту тертя знаходять приводну силу P, яка й
  // стає вихідною величиною для розрахунку привода.
  function actuationForce({ mechanismId, frictionMoment, friction, drumRadiusM,
    meanRadiusM, surfaceCount = 2 }) {
    const type = mechanism(mechanismId);
    if (!type) {
      return { defined: false, reason: "Тип гальмового механізму не вибрано." };
    }
    const moment = finiteNumber(frictionMoment);
    const mu = finiteNumber(friction);
    if (moment === null || mu === null || moment <= 0 || mu <= 0) {
      return { defined: false, reason: "Потрібні момент тертя й коефіцієнт тертя." };
    }
    if (mechanismId === "disc") {
      const radius = finiteNumber(meanRadiusM);
      const count = finiteNumber(surfaceCount);
      if (radius === null || count === null || radius <= 0 || count <= 0) {
        return { defined: false, reason: "Потрібні середній радіус колодки й кількість поверхонь." };
      }
      return { defined: true, value: moment / (mu * radius * count), type,
        frictionMoment: moment, friction: mu, meanRadiusM: radius, surfaceCount: count };
    }
    const drum = finiteNumber(drumRadiusM);
    if (drum === null || drum <= 0) {
      return { defined: false, reason: "Потрібен робочий радіус барабана." };
    }
    // a ≈ b ≈ 0,8R_б; h — плече, беруть рівним робочому радіусу барабана.
    const a = DRUM_GEOMETRY_SHARE * drum;
    const b = a;
    const h = drum;
    const operands = { frictionMoment: moment, friction: mu, drumRadiusM: drum,
      armAM: a, armBM: b, armHM: h };
    if (mechanismId === "drum-equal-forces") {
      const denominator = a * a - mu * mu * b * b;
      if (!(denominator > 0)) {
        return { defined: false, reason: "Геометрія барабана дає самозаклинювання." };
      }
      return { defined: true, value: moment * denominator / (mu * h * drum * 2 * a), type, ...operands };
    }
    if (mechanismId === "drum-two-forces") {
      const denominator = a - mu * b;
      if (!(denominator > 0)) {
        return { defined: false, reason: "Геометрія барабана дає самозаклинювання." };
      }
      return { defined: true, value: moment * denominator / (mu * h * drum * 2), type, ...operands };
    }
    const denominator = a - mu * b;
    if (!(denominator > 0)) {
      return { defined: false, reason: "Геометрія барабана дає самозаклинювання." };
    }
    return { defined: true, value: moment * denominator ** 2 / (mu * h * h * drum), type, ...operands };
  }

  // U_k = S_пед/ΣS_к
  function kinematicRatio({ pedalTravelMm, shoeTravelMm, shoeCount = 2 }) {
    const pedal = finiteNumber(pedalTravelMm);
    const shoe = finiteNumber(shoeTravelMm);
    const count = finiteNumber(shoeCount);
    if ([pedal, shoe, count].some(value => value === null || value <= 0)) {
      return { defined: false, reason: "Потрібні хід педалі й переміщення колодок." };
    }
    return { defined: true, value: pedal / (shoe * count), pedalTravelMm: pedal,
      shoeTravelMm: shoe, shoeCount: count };
  }

  // P_пед = ΣP_τ/(U_p·η_пр)
  function pedalEffort({ totalBrakeForceN, forceRatio, efficiency }) {
    const force = finiteNumber(totalBrakeForceN);
    const ratio = finiteNumber(forceRatio);
    const eta = finiteNumber(efficiency);
    if ([force, ratio, eta].some(value => value === null || value <= 0)) {
      return { defined: false, reason: "Потрібні гальмова сила, передаточне число й ККД." };
    }
    const value = force / (ratio * eta);
    const needsBooster = value > PEDAL_EFFORT_N.boosterThreshold;
    const targetPedalEffortN = midpoint(PEDAL_EFFORT_N.service);
    const minimumBoosterGain = needsBooster ? value / PEDAL_EFFORT_N.service.max : 1;
    const recommendedBoosterGain = needsBooster
      ? Math.max(1.5, Math.ceil((value / targetPedalEffortN) * 2) / 2) : 1;
    const assistedValueN = value / recommendedBoosterGain;
    return {
      defined: true,
      value,
      unassistedValueN: value,
      totalBrakeForceN: force, forceRatio: ratio, efficiency: eta,
      withinService: value <= PEDAL_EFFORT_N.service.max,
      withinEmergency: value <= PEDAL_EFFORT_N.emergency,
      needsBooster,
      targetPedalEffortN,
      minimumBoosterGain,
      recommendedBoosterGain,
      assistedValueN,
      assistedWithinService: assistedValueN >= PEDAL_EFFORT_N.service.min
        && assistedValueN <= PEDAL_EFFORT_N.service.max,
      limits: PEDAL_EFFORT_N
    };
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

  function distributionBand(vehicleType) {
    // 1,5…1,6 — легкові й вантажні з a ≈ b; 0,6…1,0 — вантажні, у яких a > b.
    return vehicleType === "goods" ? FORCE_DISTRIBUTION.frontHeavy
      : FORCE_DISTRIBUTION.balanced;
  }

  function pedalTravelBand(vehicleType) {
    return vehicleType === "goods" ? PEDAL_TRAVEL_MM.goods : PEDAL_TRAVEL_MM.passenger;
  }

  function forceRatioBand(driveKind, vehicleType) {
    if (driveKind === "pneumatic") return PNEUMATIC_FORCE_RATIO;
    return vehicleType === "goods" ? HYDRAULIC_FORCE_RATIO.goods
      : HYDRAULIC_FORCE_RATIO.passenger;
  }

  function efficiencyBand(driveKind) {
    return driveKind === "pneumatic" ? PNEUMATIC_EFFICIENCY : HYDRAULIC_EFFICIENCY;
  }

  function buildAdhesionStep({ adhesion, reactions, texNumber }) {
    return {
      id: "brakes-design-adhesion",
      title: "Розрахунковий коефіцієнт зчеплення й реакції дороги",
      purpose: "Fix the adhesion the brakes are sized for, and the wheel loads it produces.",
      output: {
        id: "value.brakes-design-adhesion",
        symbol: "\\varphi_{\\text{розр}}",
        label: "Design adhesion coefficient",
        valueType: "float64",
        canonicalUnit: null
      },
      expression: "(K a - b) / ((K + 1) h)",
      dependencies: ["decision.vehicle-type", "value.centre-of-mass-front", "decision.brakes-force-distribution",
        "value.gross-weight-force", "input.centre-height"],
      equationNumber: "20.1",
      formulaTex: "\\begin{aligned}\\varphi_{\\text{розр}}&=\\dfrac{K_{\\tau}a-b}"
        + "{\\left(K_{\\tau}+1\\right)h_g},\\\\ "
        + "Z_{\\tau1}&=\\dfrac{G_a}{2}\\cdot\\dfrac{b+\\varphi_{\\text{розр}}h_g}{L},\\\\ "
        + "Z_{\\tau2}&=\\dfrac{G_a}{2}\\cdot\\dfrac{a-\\varphi_{\\text{розр}}h_g}{L}\\end{aligned}",
      substitutionTex: `\\begin{aligned}\\varphi_{\\text{розр}}&=\\dfrac{`
        + `${texNumber(adhesion.distributionCoefficient, 3)}\\cdot`
        + `${texNumber(adhesion.frontToCentreM, 3)}-`
        + `${texNumber(adhesion.rearToCentreM, 3)}}{\\left(`
        + `${texNumber(adhesion.distributionCoefficient, 3)}+1\\right)\\cdot`
        + `${texNumber(adhesion.centreHeightM, 3)}}=`
        + `${texNumber(adhesion.value, 6)}`
        + (reactions?.defined
          ? `,\\\\ Z_{\\tau1}&=\\dfrac{${texNumber(reactions.grossWeightN, 3)}}{2}`
            + `\\cdot\\dfrac{${texNumber(reactions.rearToCentreM, 3)}+`
            + `${texNumber(reactions.adhesion, 6)}\\cdot${texNumber(reactions.centreHeightM, 3)}}`
            + `{${texNumber(reactions.wheelbaseM, 3)}}=${texNumber(reactions.frontWheelN, 3)}\\ \\text{Н}`
            + `,\\\\ Z_{\\tau2}&=\\dfrac{${texNumber(reactions.grossWeightN, 3)}}{2}`
            + `\\cdot\\dfrac{${texNumber(reactions.frontToCentreM, 3)}-`
            + `${texNumber(reactions.adhesion, 6)}\\cdot${texNumber(reactions.centreHeightM, 3)}}`
            + `{${texNumber(reactions.wheelbaseM, 3)}}=${texNumber(reactions.rearWheelN, 3)}\\ \\text{Н}`
          : "") + "\\end{aligned}",
      result: { value: adhesion.value, canonicalUnit: null, displayUnit: "" },
      method: "project-derivation",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        `Джерело друкує φ_розр = K_τ(a − b)/((K_τ+1)h_g). Для цього автомобіля `
        + `такий вираз дає ${texNumber(adhesion.printedValue, 3)} замість `
        + `${texNumber(adhesion.value, 3)}`
        + (adhesion.printedIsUsable
          ? ": у ньому K_τ загубив множник при a."
          : " — від'ємний коефіцієнт зчеплення, тобто величину, якої не буває: "
            + "від'ємним став би й увесь гальмовий момент за ним."),
        "Хиба видніша там, де a < b, тобто в звичайного передньоважкого "
        + "автомобіля: чисельник K_τ(a − b) стає від'ємним. Але вираз хибний і "
        + "при a > b — просто повертає інше додатне число.",
        "Виведення з реакцій, які подає це саме джерело нижче: "
        + "K_τ = Z_τ1/Z_τ2 = (b + φh_g)/(a − φh_g). Розв'язавши щодо φ, "
        + "дістаємо (K_τ·a − b)/((K_τ+1)h_g) — ним і ведуть розрахунок. "
        + "Читач може перевірити перехід у два рядки.",
        `Тут a — відстань від передньої осі до центра мас (${texNumber(adhesion.frontToCentreM, 3)} м), `
        + `b — до задньої (${texNumber(adhesion.rearToCentreM, 3)} м); ті самі, що в розділі 3.`
      ],
      assumptions: [
        "Гальмування на межі зчеплення: колеса на порозі блокування."
      ],
      limitations: [
        "Відхилення від джерела: надрукований вираз φ_розр = K_τ(a − b)/((K_τ+1)h_g) "
        + `дає ${texNumber(adhesion.printedValue, 3)}`
        + (adhesion.printedIsUsable ? "" : " — від'ємне значення")
        + "; ужито виведений із реакцій "
        + `(K_τ·a − b)/((K_τ+1)h_g) = ${texNumber(adhesion.value, 3)}.`,
        ...(adhesion.attainable
          ? []
          : [`Розрахункове зчеплення перевищує ${adhesion.attainableMax} — `
            + "межу сухого асфальту."])
      ]
    };
  }

  // Numerical traces use the operands retained by the evaluator; no result is
  // reverse-engineered into a missing input.
  function actuationTrace(force, texNumber) {
    if (!force?.defined) return null;
    const n = (value, digits = 6) => texNumber(value, digits);
    const m = n(force.frictionMoment);
    const mu = n(force.friction);
    let formula;
    let substitution;
    if (force.type.id === "disc") {
      formula = "P=\\dfrac{M_{\\text{тр}}}{\\mu R_{\\text{ср}}n}";
      substitution = `\\dfrac{${m}}{${mu}\\cdot${n(force.meanRadiusM)}\\cdot${n(force.surfaceCount, 0)}}`;
    } else {
      const a = n(force.armAM), b = n(force.armBM), h = n(force.armHM);
      const drum = n(force.drumRadiusM);
      if (force.type.id === "drum-equal-forces") {
        formula = "P=\\dfrac{M_{\\text{тр}}(a^2-\\mu^2 b^2)}{2\\mu hR_{\\text{б}}a}";
        substitution = `\\dfrac{${m}\\cdot(${a}^2-${mu}^2\\cdot${b}^2)}`
          + `{2\\cdot${mu}\\cdot${h}\\cdot${drum}\\cdot${a}}`;
      } else if (force.type.id === "drum-two-forces") {
        formula = "P=\\dfrac{M_{\\text{тр}}(a-\\mu b)}{2\\mu hR_{\\text{б}}}";
        substitution = `\\dfrac{${m}\\cdot(${a}-${mu}\\cdot${b})}`
          + `{2\\cdot${mu}\\cdot${h}\\cdot${drum}}`;
      } else {
        formula = "P=\\dfrac{M_{\\text{тр}}(a-\\mu b)^2}{\\mu h^2R_{\\text{б}}}";
        substitution = `\\dfrac{${m}\\cdot(${a}-${mu}\\cdot${b})^2}`
          + `{${mu}\\cdot${h}^2\\cdot${drum}}`;
      }
    }
    return { formula, substitution: `P&=${substitution}=${n(force.value, 3)}\\ \\text{Н}` };
  }

  function buildMomentStep({ moment, mechanismResult, adhesion, texNumber }) {
    const actuation = actuationTrace(mechanismResult, texNumber);
    return {
      id: "brakes-moment",
      title: "Гальмовий момент і приводна сила механізму",
      purpose: "Size the brake mechanism for the moment adhesion allows.",
      output: {
        id: "value.brakes-moment",
        symbol: "M_{\\tau}",
        label: "Brake moment on one front wheel",
        valueType: "quantity",
        canonicalUnit: "N*m"
      },
      expression: "phi Z r_d",
      dependencies: ["value.brakes-design-adhesion", "value.dynamic-wheel-radius",
        "decision.brakes-mechanism", "decision.brakes-friction"],
      equationNumber: "20.2",
      formulaTex: "\\begin{aligned}M_{\\tau}&=\\varphi_{\\text{розр}}Z_{\\tau}r_d,\\\\ "
        + "M_{\\text{тр}}&=M_{\\tau}"
        + (actuation ? `,\\\\ ${actuation.formula.replace("=", "&=")}` : "")
        + "\\end{aligned}",
      substitutionTex: `\\begin{aligned}M_{\\tau}&=${texNumber(adhesion.value, 6)}\\cdot`
        + `${texNumber(moment.reactionN, 3)}\\cdot${texNumber(moment.radiusM, 6)}`
        + `=${texNumber(moment.value, 3)}\\ \\text{Н}\\cdot\\text{м}`
        + (actuation ? `,\\\\ ${actuation.substitution}` : "") + "\\end{aligned}",
      result: { value: moment.value, canonicalUnit: "N*m", displayUnit: "Н·м" },
      method: "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        "Момент тертя механізму прирівнюють до гальмового: M_тр = M_τ. Звідси "
        + "знаходять приводну силу P механізму. Попередня оцінка педального "
        + "зусилля за сумарною гальмовою силою автомобіля не замінює "
        + "узгодження цієї сили з циліндрами, важелями та підсилювачем.",
        `Коефіцієнт тертя накладки μ = ${FRICTION_COEFFICIENT.min}…`
        + `${FRICTION_COEFFICIENT.max}; кут охоплення β = ${WRAP_ANGLE_DEG.min}…`
        + `${WRAP_ANGLE_DEG.max}°.`,
        `Для барабанних механізмів плечі беруть a ≈ b ≈ ${DRUM_GEOMETRY_SHARE}R_б.`
      ],
      assumptions: [],
      limitations: mechanismResult?.defined ? [] : [mechanismResult?.reason || ""].filter(Boolean)
    };
  }

  function buildDriveStep({ kinematic, ratio, effort, driveKind, texNumber }) {
    const pneumatic = driveKind === "pneumatic";
    let ratioFormula = "U_p=U_{p,\\text{прийняте}}";
    let ratioSubstitution = `U_p&=${texNumber(ratio.value, 6)}`;
    let ratioNote = "U_p прийнято як проєктне значення; геометрію важелів і циліндрів цим кроком не визначено.";
    if (ratio.method === "source-midpoint") {
      ratioFormula = "U_p=\\dfrac{U_{p,\\min}+U_{p,\\max}}{2}";
      ratioSubstitution = `U_p&=\\dfrac{${texNumber(ratio.range.min, 3)}+${texNumber(ratio.range.max, 3)}}{2}`
        + `=${texNumber(ratio.value, 6)}`;
      ratioNote = "U_p прийнято як середину діапазону джерела; це вибір передаточного числа, а не результат розрахунку геометрії привода.";
    } else if (ratio.method === "service-effort-sizing") {
      ratioFormula = "U_p=\\dfrac{\\sum P_{\\tau}}{P_{\\text{пед,ціль}}\\eta_{\\text{пр}}}";
      ratioSubstitution = `U_p&=\\dfrac{${texNumber(effort.totalBrakeForceN, 3)}}`
        + `{${texNumber(ratio.targetPedalEffortN, 3)}\\cdot${texNumber(effort.efficiency, 6)}}`
        + `=${texNumber(ratio.value, 6)}`;
      ratioNote = "U_p підібрано за цільовим зусиллям на педалі в межах діапазону джерела; геометрія привода потребує окремого узгодження.";
    }
    return {
      id: "brakes-pedal-effort",
      title: "Гальмовий привод і зусилля на педалі",
      purpose: "Check the driver can brake with the force the source allows.",
      output: {
        id: "value.brakes-pedal-effort",
        symbol: "P_{\\text{пед}}",
        label: "Pedal effort",
        valueType: "quantity",
        canonicalUnit: "N"
      },
      expression: "sum P / (U_p eta)",
      dependencies: ["decision.vehicle-type", "value.brakes-design-adhesion", "value.gross-weight-force", "decision.brakes-pedal-travel",
        "decision.brakes-force-ratio", "decision.brakes-drive-efficiency"],
      equationNumber: "20.3",
      formulaTex: "\\begin{aligned}U_k&=\\dfrac{S_{\\text{пед.роб}}}{n_{\\text{к}}S_{\\text{к}}},\\\\ "
        + ratioFormula.replace("=", "&=")
        + ",\\\\ P_{\\text{пед}}&=\\dfrac{\\sum P_{\\tau}}{U_p\\eta_{\\text{пр}}}\\end{aligned}",
      substitutionTex: `\\begin{aligned}U_k&=\\dfrac{${texNumber(kinematic.pedalTravelMm, 3)}}`
        + `{${texNumber(kinematic.shoeCount, 0)}\\cdot${texNumber(kinematic.shoeTravelMm, 3)}}`
        + `=${texNumber(kinematic.value, 6)},\\\\ ${ratioSubstitution},\\\\ `
        + `P_{\\text{пед}}&=\\dfrac{${texNumber(effort.totalBrakeForceN, 3)}}`
        + `{${texNumber(effort.forceRatio, 6)}\\cdot${texNumber(effort.efficiency, 6)}}`
        + `=${texNumber(effort.value, 3)}\\ \\text{Н}\\end{aligned}`,
      result: { value: effort.value, canonicalUnit: "N", displayUnit: "Н" },
      method: "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        ratioNote,
        `n_к = ${kinematic.shoeCount} — кількість колодок у сумі переміщень; усі ходи підставлено в міліметрах.`,
        `При робочому гальмуванні джерело дозволяє P_пед ≤ `
        + `${PEDAL_EFFORT_N.service.min}…${PEDAL_EFFORT_N.service.max} Н, `
        + `при аварійному — до ${PEDAL_EFFORT_N.emergency} Н.`,
        effort.needsBooster
          ? `Без підсилювача ${effort.value.toFixed(0)} Н > ${PEDAL_EFFORT_N.boosterThreshold} Н. `
            + `Попередня округлена рекомендація ×${effort.recommendedBoosterGain.toFixed(1)} `
            + `дає близько ${effort.assistedValueN.toFixed(0)} Н; остаточний підсилювач перевіряють за паспортом.`
          : `Понад ${PEDAL_EFFORT_N.boosterThreshold} Н джерело велить ставити підсилювач.`,
        pneumatic
          ? `Пневматичний привод: U_p = ${PNEUMATIC_FORCE_RATIO.min}…`
            + `${PNEUMATIC_FORCE_RATIO.max}, η_пр = ${PNEUMATIC_EFFICIENCY.min}…`
            + `${PNEUMATIC_EFFICIENCY.max}.`
          : `Гідравлічний привод: η_пр = ${HYDRAULIC_EFFICIENCY.min}…`
            + `${HYDRAULIC_EFFICIENCY.max}; U_p = `
            + `${HYDRAULIC_FORCE_RATIO.passenger.min}…`
            + `${HYDRAULIC_FORCE_RATIO.passenger.max} для легкових і `
            + `${HYDRAULIC_FORCE_RATIO.goods.min}…${HYDRAULIC_FORCE_RATIO.goods.max} `
            + "для вантажних."
      ],
      assumptions: [
        `Переміщення колодки S_к = ${SHOE_TRAVEL_MM.min}…${SHOE_TRAVEL_MM.max} мм — `
        + "середина діапазону."
      ],
      limitations: effort.needsBooster
        ? ["Кратність підсилювача — попередня проєктна рекомендація; остаточний вузол перевіряють за паспортними характеристиками й резервуванням."]
        : (effort.withinService ? []
          : [`Зусилля ${effort.value.toFixed(0)} Н без підсилювача перевищує орієнтир робочого гальмування.`])
    };
  }

  function decisionsFor({ distribution, friction, pedalTravel, forceRatio, efficiency,
    mechanismId, vehicleType, driveKind }) {
    const decisions = [];
    const type = mechanism(mechanismId);
    if (type) {
      decisions.push({
        id: "decision.brakes-mechanism",
        kind: "Decision",
        choiceRef: null,
        symbol: null,
        adoptedValue: type.label,
        canonicalUnit: null,
        method: "project-input",
        selectedReferenceId: null,
        recommendedValue: null,
        recommendedSourceRefs: SOURCE_REFS,
        rationale: "Тип гальмового механізму вибирає автор; джерело подає вираз "
          + "моменту тертя для кожного з чотирьох типів.",
        sourceRefs: SOURCE_REFS,
        limitations: [],
        manuallyOverridden: true
      });
    }
    [["decision.brakes-force-distribution", "K_{\\tau}", distribution,
      distributionBand(vehicleType), null],
      ["decision.brakes-friction", "\\mu", friction, FRICTION_COEFFICIENT, null],
      ["decision.brakes-pedal-travel", "S_{\\text{пед.роб}}", pedalTravel,
        pedalTravelBand(vehicleType), "mm"],
      ["decision.brakes-force-ratio", "U_p", forceRatio,
        forceRatioBand(driveKind, vehicleType), null],
      ["decision.brakes-drive-efficiency", "\\eta_{\\text{пр}}", efficiency,
        efficiencyBand(driveKind), null]]
      .forEach(([id, symbol, adopted, range, unit]) => {
        if (!adopted?.defined) return;
        decisions.push({
          id,
          kind: "Decision",
          choiceRef: null,
          symbol,
          adoptedValue: adopted.value,
          canonicalUnit: unit,
          method: adopted.method,
          selectedReferenceId: null,
          recommendedValue: midpoint(range),
          recommendedSourceRefs: SOURCE_REFS,
          rationale: adopted.method === "axle-reaction-sizing"
            ? "Попередній розподіл із реакцій осей: Kτ=(b+φh)/(a−φh), φ=" + adopted.designAdhesion + ". Це розрахункове налаштування розподілу, не незалежне підтвердження ефективності гальм."
            : adopted.method === "service-effort-sizing"
            ? `У межах діапазону джерела ${range.min}…${range.max} прийнято U_p, який дає близько ${adopted.targetPedalEffortN} Н на педалі.`
            : adopted.method === "project-input"
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

  function diagnosticsFor({ adhesion, effort }) {
    const out = [];
    if (adhesion?.defined) {
      // Відхилення від друкованого виразу називають ЗАВЖДИ, а не лише тоді,
      // коли воно кидається в очі знаком: вираз хибний і при a > b, просто
      // тоді він повертає інше додатне число замість неможливого від'ємного.
      out.push({
        code: "BRAKES_PRINTED_ADHESION_DIFFERS",
        // Це запис про джерело, а не дефект проєкту: вибір зроблено свідомо
        // й пояснено в самому кроці.
        severity: "info",
        message: "Надрукований вираз φ_розр = K_τ(a − b)/((K_τ+1)h_g) дає "
          + `${adhesion.printedValue.toFixed(3)}; виведений із реакцій цього ж `
          + `джерела (K_τ·a − b)/((K_τ+1)h_g) дає `
          + `${adhesion.derivedValue.toFixed(3)}. Ланцюг ведуть за виведеним`
          + (adhesion.printedIsUsable
            ? " — у друкованому виразі K_τ загубив множник при a."
            : ": надрукований тут узагалі від'ємний, а коефіцієнта зчеплення "
              + "зі знаком мінус не буває."),
        details: { node: "calc.brakes-design-adhesion" }
      });
      if (!adhesion.attainable) {
        out.push({
          code: "BRAKES_ADHESION_UNATTAINABLE",
          severity: "warning",
          message: `Розрахунковий коефіцієнт зчеплення ${adhesion.derivedValue.toFixed(3)} `
            + (adhesion.derivedValue <= 0 ? "недодатний. " : `вищий за орієнтир цього методу ${adhesion.attainableMax}. `)
            + "Прийнятий розподіл K_τ слід переглянути за реакціями осей; цей результат не є підтвердженням ефективності гальм.",
          details: { node: "calc.brakes-design-adhesion" }
        });
      }
    }
    if (effort?.defined && effort.needsBooster) {
      out.push({
        code: "BRAKES_NEEDS_BOOSTER",
        severity: "warning",
        message: `Без підсилювача ${effort.value.toFixed(0)} Н > ${effort.limits.boosterThreshold} Н. `
          + `Попередня рекомендація ×${effort.recommendedBoosterGain.toFixed(1)} дає `
          + `${effort.assistedValueN.toFixed(0)} Н на педалі лише за такого фактичного підсилення. `
          + "Підсилювач ще не вибрано за паспортом, тому ця рекомендація не закриває перевищення зусилля.",
        details: { node: "calc.brakes-pedal-effort" }
      });
    } else if (effort?.defined && !effort.withinService) {
      out.push({
        code: "BRAKES_PEDAL_EFFORT_ABOVE_SERVICE",
        // Не дефект. Джерело подає два числа, які суперечили б одне одному,
        // якби стосувалися однієї величини: 100…150 Н при робочому гальмуванні
        // і 400 Н як поріг, за яким треба ставити підсилювач. Разом вони
        // сходяться лише в одному читанні: 100…150 Н — це те, що відчуває
        // нога на педалі ПІД ПІДСИЛЮВАЧЕМ, а 400 Н — межа для приводу БЕЗ
        // нього. Документ рахує привод без підсилювача, тому його число
        // порівнюють саме з 400 Н.
        severity: "info",
        message: `Зусилля на педалі ${effort.value.toFixed(0)} Н перевищує `
          + `${effort.limits.service.max} Н, які джерело подає для робочого `
          + `гальмування, але не сягає порога підсилювача `
          + `(${effort.limits.boosterThreshold} Н). Ці два числа стосуються `
          + "різних речей: 100…150 Н — це те, що відчуває нога на педалі під "
          + "підсилювачем, а розрахунок веде привод БЕЗ нього. Поставте "
          + "підсилювач — і зусилля на педалі впаде в потрібні межі.",
        details: { node: "calc.brakes-pedal-effort" }
      });
    }
    return out;
  }

  return Object.freeze({
    SOURCE_REFS,
    FORCE_DISTRIBUTION,
    FRICTION_COEFFICIENT,
    WRAP_ANGLE_DEG,
    DRUM_GEOMETRY_SHARE,
    PEDAL_TRAVEL_MM,
    SHOE_TRAVEL_MM,
    HYDRAULIC_EFFICIENCY,
    PNEUMATIC_EFFICIENCY,
    HYDRAULIC_FORCE_RATIO,
    PNEUMATIC_FORCE_RATIO,
    PEDAL_EFFORT_N,
    ATTAINABLE_ADHESION_MAX,
    MECHANISMS,
    midpoint,
    adoptRange,
    equivalentTwoAxle,
    distributionBand,
    distributionForAdhesion,
    pedalTravelBand,
    forceRatioBand,
    efficiencyBand,
    mechanism,
    designAdhesion,
    axleReactions,
    brakeMoment,
    actuationForce,
    kinematicRatio,
    pedalEffort,
    buildAdhesionStep,
    buildMomentStep,
    buildDriveStep,
    decisionsFor,
    diagnosticsFor
  });
}
