"use strict";

export function createChapter4Traction({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;

  // Одна перевірка числа на весь проєкт: Number() приймає null, true й "" і
  // мовчки робить із них 0 та 1, а Number.isFinite їх пропускає. Модуль
  // лежить окремо, бо ця сама помилка ловилася вже в кількох розділах.
  const { finiteNumber, plainNumber } = (function loadNumeric() {
    const scope = typeof window === "object" ? window : globalThis;
    if (!scope.VehicleNumeric && typeof module === "object" && module.exports) {
      require("./numeric.js");
    }
    return scope.VehicleNumeric;
  })();

  function requiredCruisePower(context) {
    const values = [
      context.roadResistancePsi,
      context.grossWeightForceKn,
      context.maximumSpeedMs,
      context.dragFactorW,
      context.transmissionEfficiency
    ];
    if (!values.every(Number.isFinite)) {
      return { defined: false, reason: "Не всі вихідні дані визначено." };
    }
    if (context.grossWeightForceKn <= 0 || context.maximumSpeedMs <= 0
      || context.dragFactorW < 0 || context.transmissionEfficiency <= 0
      || context.transmissionEfficiency > 1) {
      return { defined: false, reason: "Вихідні дані лежать поза допустимими межами." };
    }
    const roadPowerKw = context.roadResistancePsi * context.grossWeightForceKn
      * context.maximumSpeedMs;
    const dragPowerKw = context.dragFactorW * context.maximumSpeedMs ** 3 / 1000;
    const requiredPowerKw = (roadPowerKw + dragPowerKw) / context.transmissionEfficiency;
    return {
      defined: true,
      ...context,
      roadPowerKw,
      dragPowerKw,
      requiredPowerKw
    };
  }

  function buildRequiredCruisePowerStep(context) {
    const { result, texNumber, electrified, directEfficiency } = context;
    return {
      id: "required-cruise-power",
      title: "Потужність для руху з максимальною швидкістю",
      purpose: "Determine the source power required to maintain the target maximum speed.",
      output: {
        id: "value.required-cruise-power",
        symbol: "N_v",
        label: "Required power at maximum speed",
        valueType: "quantity",
        canonicalUnit: "kW"
      },
      expression: "(psi * G_a * V_max + W * V_max^3 / 1000) / eta_m",
      dependencies: [
        "value.road-resistance",
        "value.gross-weight-force",
        "input.maximum-speed",
        "value.drag-factor",
        directEfficiency ? "decision.transmission-efficiency" : "value.transmission-efficiency"
      ],
      equationNumber: "4.5",
      formulaTex: "N_v=\\frac{\\psi_vG_aV_{\\max}+WV_{\\max}^{3}}{1000\\eta_{\\mathrm{м}}}",
      substitutionTex: `N_v=\\frac{${texNumber(result.roadResistancePsi, 4)}`
        + `\\cdot${texNumber(result.grossWeightForceKn, 2)}\\cdot10^3`
        + `\\cdot${texNumber(result.maximumSpeedMs, 2)}`
        + `+${texNumber(result.dragFactorW, 4)}\\cdot${texNumber(result.maximumSpeedMs, 2)}^3}`
        + `{1000\\cdot${texNumber(result.transmissionEfficiency, 4)}}`
        + `=${texNumber(result.requiredPowerKw, 2)}\\;\\mathrm{кВт}`,
      result: {
        value: result.requiredPowerKw,
        canonicalUnit: "kW",
        displayUnit: "кВт"
      },
      method: electrified ? "constant-speed-power-floor" : "opanasyuk-2.4",
      sourceRefs: electrified
        ? ["source.method.opanasyuk", "source.method.ehsani-electric-traction"]
        : ["source.method.opanasyuk"],
      assumptions: [
        "The speed is steady, so acceleration power is zero.",
        "G_a is supplied in kN and converted to N inside the displayed substitution.",
        "W uses SI units N·s²/m² and V_max uses m/s."
      ],
      limitations: electrified
        ? ["For an electrified drivetrain this is the continuous cruise-power floor, not a complete engine/motor rating or power-split calculation."]
        : []
    };
  }

  // Від N_v до номіналу двигуна — методичка курсового проєкту, стор. 13.
  //
  // Правило подано для двох типів двигунів і двох призначень, і лише для них:
  //   карбюраторний (іскровий) легкового автомобіля чи автобуса:
  //       N_max = 1,1·N_v, ω_N = 440…550 с⁻¹, ω_v = (1,15…1,20)·ω_N;
  //   карбюраторний вантажного з обмежувачем: N_max = N_v, ω_N = ω_v = 310…330 с⁻¹;
  //   дизель: N_max = N_v, ω_N = ω_v; у дизелів вантажних 200…260 с⁻¹.
  // Для дизеля легкового методичка діапазону не подає. Редаговане початкове
  // прийняття нижче обмежене фактичними номінальними точками трьох сучасних
  // серійних легкових дизелів; це не нормативний діапазон.
  // Діапазон для автобусів із дизелем джерело також не називає; табл. 5
  // групує «дизель вантажного автомобіля та автобуса», тому автобус іде з
  // вантажним, а обмеження про це записане.
  const ENGINE_RATING_RULES = Object.freeze({
    "spark-passenger": {
      label: "іскровий двигун легкового автомобіля чи автобуса",
      powerFactor: 1.1, ratedRange: [440, 550], overspeedRange: [1.15, 1.2]
    },
    "spark-goods": {
      label: "іскровий двигун вантажного автомобіля з обмежувачем частоти",
      powerFactor: 1, ratedRange: [310, 330], overspeedRange: [1, 1]
    },
    "diesel-goods": {
      label: "дизель вантажного автомобіля чи автобуса",
      powerFactor: 1, ratedRange: [200, 260], overspeedRange: [1, 1]
    },
    "diesel-passenger": {
      label: "дизель легкового автомобіля",
      powerFactor: 1, ratedRange: [3250 * Math.PI / 30, 4000 * Math.PI / 30],
      overspeedRange: [1, 1], exampleBasedRange: true
    }
  });

  function engineRatingRuleId({ category, supplySystemId }) {
    const diesel = /^diesel/.test(supplySystemId || "");
    const goods = /^N/.test(category || "");
    const bus = /^M[23]/.test(category || "");
    if (diesel) return goods || bus ? "diesel-goods" : "diesel-passenger";
    return goods ? "spark-goods" : "spark-passenger";
  }

  function preliminaryEngineRating({ requiredCruisePowerKw, category, supplySystemId, modern = false }) {
    const cruise = finiteNumber(requiredCruisePowerKw);
    if (!(cruise > 0)) return { defined: false, reason: "Потрібна додатна N_v." };
    if (!supplySystemId) return { defined: false, reason: "Систему живлення не вибрано." };
    if (modern) {
      const scope = typeof window === "object" ? window : globalThis;
      const model = scope.VehiclePowertrainDesign || (typeof require === "function" ? require("./powertrain-design.js") : null);
      const profile = model?.defaults(category);
      if (!profile) return { defined: false, reason: "Немає профілю класу для попереднього двигуна." };
      const rpm = /^diesel/.test(supplySystemId) ? profile.dieselRpm : profile.petrolRpm;
      const angular = rpm * Math.PI / 30;
      return { defined: true, modern: true, ruleId: "modern-class-" + category,
        ruleLabel: "редагований попередній профіль класу " + category,
        powerFactor: 1.15, maxPowerKw: cruise * 1.15,
        ratedRange: { min: angular, max: angular, midpoint: angular },
        ratedAngularSpeed: angular, ratedSpeedReason: null, overspeedRange: [1, 1],
        limitations: ["Запас потужності 15 % і номінальна частота " + rpm + " об/хв — проєктні початкові припущення класу. Прийняту потужність і оберти можна змінити; це не дані виробника або сертифікат Euro."] };
    }
    const ruleId = engineRatingRuleId({ category, supplySystemId });
    const rule = ENGINE_RATING_RULES[ruleId];
    const ratedRange = rule.ratedRange
      ? { min: rule.ratedRange[0], max: rule.ratedRange[1], midpoint: (rule.ratedRange[0] + rule.ratedRange[1]) / 2 }
      : null;
    return {
      defined: true,
      ruleId,
      ruleLabel: rule.label,
      powerFactor: rule.powerFactor,
      maxPowerKw: cruise * rule.powerFactor,
      ratedRange,
      // Середина діапазону — проєктне типове значення; читач може взяти інше.
      ratedAngularSpeed: ratedRange ? ratedRange.midpoint : null,
      ratedSpeedReason: null,
      overspeedRange: rule.overspeedRange,
      limitations: [
        "Попередній номінал: крок замінює паспорт двигуна лише доти, доки паспорта немає.",
        ...(rule.exampleBasedRange
          ? ["3250…4000 об/хв — огинаюча номінальних точок BMW 320d, Volkswagen Polo 1.6 TDI та Ford C-Max TDCi; це приклади серійних двигунів, а не нормативна вимога."]
          : []),
        ...(ruleId === "diesel-goods" && /^M[23]/.test(category || "")
          ? ["Діапазон ω_N джерело подає для вантажних автомобілів; для автобуса з дизелем узято той самий, як групує табл. 5."]
          : [])
      ]
    };
  }

  // (4.22) не повинно ховати гібрид за одним «двигуном». Спочатку маємо
  // сумарну попередню встановлену потужність, потім явно ділимо її між ДВЗ і
  // електромашиною. Частка — редаговане проєктне рішення; 0,5 є лише стартом.
  function preliminaryPowerAllocation({
    requiredCruisePowerKw, powertrain, category, supplySystemId,
    hybridElectricShare = 0.5, modern = false
  }) {
    const cruise = finiteNumber(requiredCruisePowerKw);
    if (!(cruise > 0)) return { defined: false, reason: "Потрібна додатна N_v." };
    if (powertrain === "electric") {
      return {
        defined: true, powertrain, powerFactor: 1, totalPowerKw: cruise,
        enginePowerKw: 0, motorPowerKw: cruise, electricShare: 1,
        engineRating: null
      };
    }
    const engineRating = preliminaryEngineRating({
      requiredCruisePowerKw: cruise, category, supplySystemId, modern
    });
    if (!engineRating.defined) return engineRating;
    const share = powertrain === "hybrid" ? finiteNumber(hybridElectricShare) : 0;
    if (!(share >= 0 && share <= 1)) {
      return { defined: false, reason: "Частка електромашини має лежати в межах 0…1." };
    }
    return {
      defined: true,
      powertrain,
      powerFactor: engineRating.powerFactor,
      totalPowerKw: engineRating.maxPowerKw,
      enginePowerKw: engineRating.maxPowerKw * (1 - share),
      motorPowerKw: engineRating.maxPowerKw * share,
      electricShare: share,
      engineRating
    };
  }

  // I-50 is an adopted installed/continuous ICE rating, not merely the hybrid
  // split from (4.22). A prototype value may be useful evidence, but it cannot
  // remain the automatic adoption when it is below N_v: that would make the
  // requested maximum speed impossible before the rest of the calculation even
  // starts. Manual values are never overwritten; a deliberately undersized
  // manual engine is left for the maximum-speed check to reject.
  function automaticEnginePower({
    preliminaryPowerKw, requiredCruisePowerKw, currentPowerKw = null,
    currentAdoption = "preliminary-rule"
  }) {
    const preliminary = finiteNumber(preliminaryPowerKw);
    const cruise = finiteNumber(requiredCruisePowerKw);
    const current = finiteNumber(currentPowerKw);
    if (!(preliminary > 0) && !(cruise > 0)) {
      return { defined: false, reason: "Немає ні попереднього номіналу, ні N_v." };
    }
    if (currentAdoption === "manual" && current > 0) {
      return {
        defined: true, powerKw: current, adoption: "manual",
        satisfiesCruise: !(cruise > 0) || current >= cruise,
        floorApplied: false
      };
    }
    if (currentAdoption === "prototype" && current > 0
        && (!(cruise > 0) || current >= cruise)) {
      return {
        defined: true, powerKw: current, adoption: "prototype",
        satisfiesCruise: true, floorApplied: false
      };
    }
    const preliminaryCandidate = preliminary > 0 ? preliminary : 0;
    const cruiseCandidate = cruise > 0 ? cruise : 0;
    const powerKw = Math.max(preliminaryCandidate, cruiseCandidate);
    const floorApplied = cruiseCandidate > preliminaryCandidate;
    return {
      defined: true, powerKw,
      adoption: floorApplied ? "cruise-floor" : "preliminary-rule",
      satisfiesCruise: !(cruise > 0) || powerKw >= cruise,
      floorApplied
    };
  }

  function buildPreliminaryEnginePowerStep({ rating, allocation, cruisePowerKw, texNumber }) {
    const hybrid = allocation?.powertrain === "hybrid";
    const resultKw = allocation?.enginePowerKw ?? rating.maxPowerKw;
    return {
      id: "preliminary-engine-power",
      title: "Попередня максимальна потужність двигуна за N_v",
      purpose: "Adopt the preliminary maximum engine power from the cruise power by the methodic's engine-type rule.",
      output: {
        id: "value.engine-max-power-preliminary",
        symbol: "N_{\\max}",
        label: "Preliminary maximum engine power",
        valueType: "quantity",
        canonicalUnit: "kW"
      },
      expression: hybrid ? "(1 - x_e) * k_N * N_v" : "k_N * N_v",
      dependencies: ["value.required-cruise-power", "decision.supply-system", "input.vehicle-category",
        ...(hybrid ? ["input.hybrid-electric-power-share"] : [])],
      equationNumber: "4.22",
      formulaTex: hybrid ? "P_{\\mathrm{ДВЗ,розр}}=(1-x_{\\mathrm{е}})k_NN_v" : "P_{\\mathrm{ДВЗ,розр}}=k_NN_v",
      substitutionTex: hybrid
        ? `P_{\\mathrm{ДВЗ,розр}}=(1-${texNumber(allocation.electricShare, 2)})\\cdot`
          + `${texNumber(rating.powerFactor, 2)}\\cdot${texNumber(cruisePowerKw, 2)}`
          + `=${texNumber(resultKw, 2)}\\;\\mathrm{кВт}`
        : `P_{\\mathrm{ДВЗ,розр}}=${texNumber(rating.powerFactor, 2)}\\cdot${texNumber(cruisePowerKw, 2)}`
          + `=${texNumber(resultKw, 2)}\\;\\mathrm{кВт}`,
      result: { value: resultKw, canonicalUnit: "kW", displayUnit: "кВт" },
      method: rating.modern ? "declared-class-power-reserve" : `course-p13-${rating.ruleId}`,
      sourceRefs: [rating.modern ? "source.project-derivation" : "source.method.course"],
      assumptions: [`Тип двигуна за правилом: ${rating.ruleLabel}.`],
      limitations: rating.limitations
    };
  }

  function buildPreliminaryMotorPowerStep({ allocation, cruisePowerKw, texNumber }) {
    const hybrid = allocation.powertrain === "hybrid";
    return {
      id: "preliminary-motor-power",
      title: "Попередня розрахункова потужність електромашини",
      purpose: "Allocate the required preliminary installed power to the traction motor.",
      output: {
        id: "value.motor-power-preliminary",
        symbol: "P_{\\mathrm{е,розр}}",
        label: "Preliminary calculated motor power",
        valueType: "quantity",
        canonicalUnit: "kW"
      },
      expression: hybrid ? "x_e * k_N * N_v" : "N_v",
      dependencies: ["value.required-cruise-power",
        ...(hybrid ? ["input.hybrid-electric-power-share", "decision.supply-system"] : [])],
      equationNumber: "4.22",
      formulaTex: hybrid ? "P_{\\mathrm{е,розр}}=x_{\\mathrm{е}}k_NN_v" : "P_{\\mathrm{е,розр}}=N_v",
      substitutionTex: hybrid
        ? `P_{\\mathrm{е,розр}}=${texNumber(allocation.electricShare, 2)}\\cdot`
          + `${texNumber(allocation.powerFactor, 2)}\\cdot${texNumber(cruisePowerKw, 2)}`
          + `=${texNumber(allocation.motorPowerKw, 2)}\\;\\mathrm{кВт}`
        : `P_{\\mathrm{е,розр}}=${texNumber(cruisePowerKw, 2)}`
          + `=${texNumber(allocation.motorPowerKw, 2)}\\;\\mathrm{кВт}`,
      result: { value: allocation.motorPowerKw, canonicalUnit: "kW", displayUnit: "кВт" },
      method: hybrid ? "declared-hybrid-power-allocation" : "constant-speed-power-floor",
      sourceRefs: ["source.method.course", "source.method.ehsani-electric-traction"],
      assumptions: hybrid
        ? [`Частку електромашини x_e=${allocation.electricShare} прийнято для попереднього розподілу встановленої потужності.`]
        : ["Для BEV N_v є нижньою межею тривалої потужності; вимогу розгону перевіряють окремо."],
      limitations: ["Після вибору реальної машини розрахункове значення замінюють паспортним прийняттям."]
    };
  }

  function buildPreliminaryEngineSpeedStep({ rating, texNumber }) {
    const range = rating.ratedRange;
    return {
      id: "preliminary-engine-speed",
      title: "Попередня частота обертання при максимальній потужності",
      purpose: "Adopt the rated engine speed from the methodic's range for the engine type; the midpoint is the project default.",
      output: {
        id: "value.engine-rated-speed-preliminary",
        symbol: "\\omega_N",
        label: "Preliminary rated engine speed",
        valueType: "quantity",
        canonicalUnit: "1/s"
      },
      expression: rating.modern ? "declared class rated angular speed" : "(omega_N_min + omega_N_max) / 2",
      dependencies: ["decision.supply-system", "input.vehicle-category"],
      equationNumber: null,
      formulaTex: rating.modern ? "\\omega_N=\\pi n_N/30" : "\\omega_N\\in[\\omega_{N,\\min};\\,\\omega_{N,\\max}],\\qquad \\omega_v=k_\\omega\\,\\omega_N",
      substitutionTex: rating.modern ? `\\omega_N=\\pi\\cdot${texNumber(rating.ratedAngularSpeed*30/Math.PI,0)}/30=${texNumber(rating.ratedAngularSpeed,2)}\\;\\mathrm{рад/с}` : `\\omega_N=\\frac{${texNumber(range.min, 0)}+${texNumber(range.max, 0)}}{2}`
        + `=${texNumber(rating.ratedAngularSpeed, 0)}\\;\\mathrm{с^{-1}}`
        + `\\;(${texNumber(rating.ratedAngularSpeed * 30 / Math.PI, 0)}\\;\\mathrm{об/хв})`,
      result: { value: rating.ratedAngularSpeed, canonicalUnit: "1/s", displayUnit: "с⁻¹" },
      method: rating.modern ? "declared-class-rated-speed" : rating.ruleId === "diesel-passenger"
        ? "series-diesel-examples-midpoint"
        : `course-p13-${rating.ruleId}-midpoint`,
      sourceRefs: rating.modern ? ["source.project-derivation"] : rating.ruleId === "diesel-passenger"
        ? ["source.reference.bmw-320d", "source.reference.vw-polo-tdi", "source.reference.ford-cmax-tdci"]
        : ["source.method.course"],
      assumptions: [rating.ruleId === "diesel-passenger"
        ? "Середина огинаючої трьох серійних прикладів — редаговане початкове прийняття, не нормативне число."
        : "Середина діапазону джерела — типове значення проєкту, не число з джерела."],
      limitations: rating.limitations
    };
  }

  // Номінал електродвигуна. Джерела для діапазону немає (extract Ehsani, gap 1,
  // item 4), тому беруть прототип; без прототипу — N_v як НИЖНЮ межу, і так її
  // й називають: для легкового автомобіля потужність визначає розгін, а не
  // V_max (Ehsani §5.2.3), і перевіряє це §5.7.
  function preliminaryMotorRating({
    prototypeMotorPowerKw = null, prototypeMotorPowerFrontKw = null,
    prototypeMotorPowerRearKw = null, calculatedMotorPowerKw = null,
    requiredCruisePowerKw, enforceCruiseFloor = false
  }) {
    const total = finiteNumber(prototypeMotorPowerKw);
    const front = finiteNumber(prototypeMotorPowerFrontKw);
    const rear = finiteNumber(prototypeMotorPowerRearKw);
    const prototypeKw = total > 0 ? total
      : (front > 0 || rear > 0) ? (front > 0 ? front : 0) + (rear > 0 ? rear : 0) : null;
    const calculated = finiteNumber(calculatedMotorPowerKw);
    const cruise = finiteNumber(requiredCruisePowerKw);
    const candidate = prototypeKw !== null ? prototypeKw : (calculated > 0 ? calculated : null);
    // The motor has to carry N_v continuously only when it is the sole
    // mechanical traction source (BEV or a series/generator-only hybrid).
    // In a mechanically coupled PHEV the ICE is given that continuous floor;
    // the motor may remain a shorter-duration assist machine.
    if (enforceCruiseFloor && cruise > 0 && (candidate === null || candidate < cruise)) {
      return {
        defined: true, peakPowerKw: Math.max(cruise, calculated > 0 ? calculated : 0),
        adoption: "cruise-floor",
        note: prototypeKw !== null
          ? `Паспортні ${prototypeKw} кВт нижчі за N_v=${cruise} кВт. Для тягової машини, що сама веде колеса, прийнято N_v як мінімальну тривалу межу; замініть її реальною тривалою характеристикою.`
          : "Для тягової машини, що сама веде колеса, N_v є мінімальною тривалою межею; вимогу розгону перевіряють окремо."
      };
    }
    if (prototypeKw !== null) {
      return { defined: true, peakPowerKw: prototypeKw, adoption: "prototype",
        note: "Потужність узято з прототипу." };
    }
    if (calculated > 0) {
      return { defined: true, peakPowerKw: calculated, adoption: "calculated-allocation",
        note: "Прийнято розрахункову потужність за (4.22); поле можна замінити паспортом вибраної електромашини." };
    }
    if (!(cruise > 0)) return { defined: false, reason: "Ні прототипу, ні N_v." };
    return { defined: true, peakPowerKw: cruise, adoption: "cruise-floor",
      note: "Потужність — нижня межа за N_v, не номінал: для легкового автомобіля її "
        + "визначає розгін (Ehsani §5.2.3); перевірка — у §5.7." };
  }

  // ω_b = ω_max / x. Джерело подає x лише прикладом (x = 4, §8.4.1) і не подає
  // діапазону; тому x — прийнятий вхід, а не число з таблиці.
  function motorSpeedsFromRatio({ requiredMotorSpeedRpm, speedRatio }) {
    const rpm = finiteNumber(requiredMotorSpeedRpm);
    const ratio = finiteNumber(speedRatio);
    if (!(rpm > 0)) return { defined: false, reason: "Потрібна частота при V_max за (4.6)." };
    if (!(ratio >= 1)) return { defined: false, reason: "Відношення частот x має бути не менше за 1." };
    const maximumAngularSpeed = rpm * Math.PI / 30;
    return { defined: true, maximumAngularSpeed, baseAngularSpeed: maximumAngularSpeed / ratio, speedRatio: ratio };
  }

  // Баланс потужностей на V_max.
  //
  // Досі N_v рахували й ні з чим не порівнювали: проєкт міг узяти явно
  // слабку машину й усе одно дістати діаграму сили тяги. Кінематичне
  // передаточне число теж нічого про це не каже — воно лише не дає двигунові
  // перекрутитися.
  //
  // Порівнюють НА КОЛЕСАХ, а не на валу. Для гібрида ділити потрібну
  // потужність на один спільний ККД до того, як відомий розподіл між
  // машинами, узагалі не можна: у ДВЗ і електродвигуна свої шляхи зі своїми
  // втратами. Тому потрібну потужність беруть до трансмісії, а доступну —
  // після неї, кожен шлях зі своїм ККД.
  function maximumSpeedBalance({ requiredWheelPowerKw, pathPowers }) {
    const required = finiteNumber(requiredWheelPowerKw);
    if (!(required > 0)) {
      return { defined: false, reason: "Потрібну потужність на колесах не визначено." };
    }
    const allPositive = (pathPowers || []).filter(item => finiteNumber(item.wheelPowerKw) > 0);
    const contributions = allPositive.filter(item => item.continuous !== false);
    const excludedContributions = allPositive.filter(item => item.continuous === false);
    if (!contributions.length) {
      return {
        defined: false,
        reason: excludedContributions.length
          ? "При V_max є лише короткочасна (пікова) потужність; тривалу потужність на колесах не визначено."
          : "Жоден шлях не подає потужності на колесах при V_max.",
        excludedContributions: excludedContributions.map(item => ({
          pathId: item.pathId, wheelPowerKw: finiteNumber(item.wheelPowerKw),
          reason: item.exclusionReason || null
        }))
      };
    }
    const availableKw = contributions.reduce((sum, item) => sum + finiteNumber(item.wheelPowerKw), 0);
    return {
      defined: true,
      requiredWheelPowerKw: required,
      availableWheelPowerKw: availableKw,
      contributions: contributions.map(item => ({
        pathId: item.pathId, wheelPowerKw: finiteNumber(item.wheelPowerKw)
      })),
      excludedContributions: excludedContributions.map(item => ({
        pathId: item.pathId, wheelPowerKw: finiteNumber(item.wheelPowerKw),
        reason: item.exclusionReason || null
      })),
      // Запас у частках потрібної потужності: 1,15 читається краще за «+15 %»,
      // коли треба порівняти два проєкти.
      reserveRatio: availableKw / required,
      attainable: availableKw >= required
    };
  }

  function buildMaximumSpeedBalanceStep({ balance, maximumSpeedKmh, texNumber }) {
    return {
      id: "maximum-speed-balance",
      title: "Баланс потужності у заданій швидкісній точці",
      purpose: "Compare the wheel power available at V_max with the power the road and air demand.",
      output: {
        id: "value.maximum-speed-balance",
        symbol: "N_{\\mathrm{зап}}",
        label: "Power reserve at maximum speed",
        valueType: "number",
        canonicalUnit: null
      },
      expression: "sum(P_wheel) / P_required",
      dependencies: [
        "value.required-cruise-power",
        "value.combined-tractive-force",
        "input.maximum-speed"
      ],
      equationNumber: "4.16",
      formulaTex: "N_{\\mathrm{зап}}=\\frac{\\sum P_{\\mathrm{к}}(V_{\\max})}"
        + "{P_{\\mathrm{потр}}(V_{\\max})}",
      substitutionTex: `N_{\\mathrm{зап}}=\\frac{${texNumber(balance.availableWheelPowerKw, 1)}}`
        + `{${texNumber(balance.requiredWheelPowerKw, 1)}}=`
        + `${texNumber(balance.reserveRatio, 2)}`,
      result: { value: balance.reserveRatio, canonicalUnit: null, displayUnit: null },
      method: "wheel-power-balance-at-vmax",
      sourceRefs: ["source.reference.virzi-mariotti"],
      readerNotes: [
        "Це лише перевірка потужності в одній точці. Пуск, безперервність діапазонів, оберти після перемикання й додатне прискорення до цієї швидкості перевіряють окремо.",
        balance.attainable
          ? `При ${plainNumber(maximumSpeedKmh, 0)} км/год баланс потужності виконується: на колесах `
            + `${plainNumber(balance.availableWheelPowerKw, 1)} кВт проти потрібних `
            + `${plainNumber(balance.requiredWheelPowerKw, 1)} кВт.`
          // Не «майже досяжна» і не «замалий запас»: заданої швидкості
          // автомобіль не розвине, і решта розділу спирається на число, якого
          // він не досягне.
          : `Швидкість ${plainNumber(maximumSpeedKmh, 0)} км/год НЕ досяжна: на колесах `
            + `${plainNumber(balance.availableWheelPowerKw, 1)} кВт проти потрібних `
            + `${plainNumber(balance.requiredWheelPowerKw, 1)} кВт. Прийміть меншу V_max `
            + "або перегляньте потужність на потрібних обертах і передаточні числа.",
        ...(balance.contributions.length > 1
          ? [`Внески тривалої потужності шляхів: ${balance.contributions
            .map(item => `${item.pathId} — ${plainNumber(item.wheelPowerKw, 1)} кВт`)
            .join("; ")}.`]
          : []),
        ...(balance.excludedContributions?.length
          ? [`У баланс усталеного V_max не включено короткочасні внески: ${balance.excludedContributions
            .map(item => `${item.pathId} — ${plainNumber(item.wheelPowerKw, 1)} кВт`)
            .join("; ")}.`]
          : [])
      ],
      assumptions: [
        "Порівняння на колесах: потрібну потужність беруть до трансмісії, доступну — після неї."
      ],
      limitations: [
        "Усталений рух у нерухомому повітрі: зустрічний вітер і підйом сюди не входять.",
        "Потужність допоміжних споживачів не віднімається."
      ]
    };
  }

  // Потужність, потрібна на розгін, за Ehsani, рівняння (5.12):
  //
  //   P_t = δM/(2t_a)·(V_f² + V_b²) + (2/3)·M·g·f_r·V_f + (1/5)·ρ·C_D·A_f·V_f³
  //
  // Три доданки — три різні витрати: перший розганяє масу, другий долає
  // кочення, третій — повітря. Коефіцієнти 2/3 і 1/5 не підігнані: вони
  // випливають з усереднення опору по розгону за припущенням V = V_f·√(t/t_a)
  // (рівняння 5.10), і саме тому вони саме такі.
  //
  // Крейсерська потужність цього не показує. Автомобіль, здатний тримати
  // 160 км/год, може розганятися до сотні півхвилини, і навпаки: сама лише
  // N_v не каже про машину нічого, доки поряд немає розгону.
  function accelerationPower({
    grossMassKg, rotatingMassFactor, finalSpeedMs, baseSpeedMs,
    accelerationTimeS, rollingResistanceF, dragFactorW
  }) {
    const mass = finiteNumber(grossMassKg);
    const delta = finiteNumber(rotatingMassFactor);
    const finalSpeed = finiteNumber(finalSpeedMs);
    const baseSpeed = finiteNumber(baseSpeedMs);
    const time = finiteNumber(accelerationTimeS);
    const f = finiteNumber(rollingResistanceF);
    const drag = finiteNumber(dragFactorW);
    const named = [
      ["повна маса", grossMassKg, mass],
      ["коефіцієнт обертових мас", rotatingMassFactor, delta],
      ["кінцева швидкість", finalSpeedMs, finalSpeed],
      ["базова швидкість", baseSpeedMs, baseSpeed],
      ["час розгону", accelerationTimeS, time],
      ["коефіцієнт опору коченню", rollingResistanceF, f],
      ["фактор обтічності W", dragFactorW, drag]
    ].find(([, , value]) => !Number.isFinite(value));
    if (named) {
      return {
        defined: false,
        reason: `Потужність розгону: ${named[0]} має бути числом, отримано ${typeof named[1]}.`
      };
    }
    if (!(time > 0)) return { defined: false, reason: "Час розгону має бути додатним." };
    if (!(finalSpeed > 0)) return { defined: false, reason: "Кінцева швидкість має бути додатною." };
    if (baseSpeed > finalSpeed) {
      return {
        defined: false,
        reason: "Базова швидкість більша за кінцеву: розгін закінчився б, не вийшовши "
          + "із зони сталого моменту, і рівняння (5.12) до нього не застосовне."
      };
    }

    const inertiaKw = delta * mass / (2 * time) * (finalSpeed ** 2 + baseSpeed ** 2) / 1000;
    const rollingKw = (2 / 3) * mass * 9.81 * f * finalSpeed / 1000;
    // W = ½ρC_D A, тому (1/5)ρC_D A V³ = (2/5)W V³.
    const dragKw = (2 / 5) * drag * finalSpeed ** 3 / 1000;
    return {
      defined: true,
      inertiaKw,
      rollingKw,
      dragKw,
      wheelPowerKw: inertiaKw + rollingKw + dragKw,
      finalSpeedMs: finalSpeed,
      baseSpeedMs: baseSpeed,
      accelerationTimeS: time
    };
  }

  // P_прийнята ≥ max(P_крейс, P_розгін). Обидві вимоги — на колесах.
  function sizingCheck({ cruiseWheelPowerKw, accelerationWheelPowerKw, availableWheelPowerKw }) {
    const cruise = finiteNumber(cruiseWheelPowerKw);
    const accel = finiteNumber(accelerationWheelPowerKw);
    const available = finiteNumber(availableWheelPowerKw);
    if (![cruise, accel, available].every(Number.isFinite)) {
      return { defined: false, reason: "Потрібні всі три потужності на колесах." };
    }
    const required = Math.max(cruise, accel);
    return {
      defined: true,
      cruiseWheelPowerKw: cruise,
      accelerationWheelPowerKw: accel,
      requiredWheelPowerKw: required,
      availableWheelPowerKw: available,
      // Яка з двох вимог визначає машину — це і є висновок: доти, доки
      // рахували лише крейсерську, розгін міг мовчки її перевищувати.
      governedBy: accel > cruise ? "acceleration" : "cruise",
      sufficient: available >= required,
      reserveRatio: available / required
    };
  }

  function buildSizingStep({ acceleration, sizing, texNumber }) {
    return {
      id: "power-sizing",
      title: "Вибір потужності машини за розгоном і крейсером",
      purpose: "Size the machine by the greater of the cruise and acceleration demands.",
      output: {
        id: "value.power-sizing",
        symbol: "P_{\\mathrm{потр}}",
        label: "Required wheel power",
        valueType: "quantity",
        canonicalUnit: "kW"
      },
      expression: "max(P_cruise, P_acceleration)",
      dependencies: [
        "value.required-cruise-power",
        "value.gross-mass",
        "value.drag-factor",
        "input.rolling-resistance",
        "input.acceleration-target-speed",
        "input.acceleration-target-time",
        "input.rotating-mass-factor",
        "value.combined-tractive-force"
      ],
      equationNumber: "5.7",
      formulaTex: "P_t=\\frac{\\delta M}{2t_a}\\left(V_f^2+V_b^2\\right)"
        + "+\\frac{2}{3}Mgf_rV_f+\\frac{1}{5}\\rho C_D A_f V_f^3",
      substitutionTex: `P_t=${texNumber(acceleration.inertiaKw, 1)}`
        + `+${texNumber(acceleration.rollingKw, 1)}`
        + `+${texNumber(acceleration.dragKw, 1)}`
        + `=${texNumber(acceleration.wheelPowerKw, 1)}\;\\mathrm{кВт}`,
      result: {
        value: sizing.requiredWheelPowerKw, canonicalUnit: "kW", displayUnit: "кВт"
      },
      method: "ehsani-5.12",
      sourceRefs: ["source.method.ehsani-electric-traction"],
      readerNotes: [
        sizing.governedBy === "acceleration"
          ? `Машину визначає РОЗГІН: ${plainNumber(sizing.accelerationWheelPowerKw, 1)} кВт `
            + `проти ${plainNumber(sizing.cruiseWheelPowerKw, 1)} кВт на крейсер.`
          : `Машину визначає КРЕЙСЕР: ${plainNumber(sizing.cruiseWheelPowerKw, 1)} кВт `
            + `проти ${plainNumber(sizing.accelerationWheelPowerKw, 1)} кВт на розгін.`,
        sizing.sufficient
          ? `Прийнятої потужності вистачає: ${plainNumber(sizing.availableWheelPowerKw, 1)} кВт `
            + `на колесах, запас ${plainNumber(sizing.reserveRatio, 2)}.`
          : `Прийнятої потужності НЕ вистачає: ${plainNumber(sizing.availableWheelPowerKw, 1)} кВт `
            + `проти потрібних ${plainNumber(sizing.requiredWheelPowerKw, 1)} кВт.`,
        `Розгін 0…${plainNumber(acceleration.finalSpeedMs * 3.6, 0)} км/год за `
        + `${plainNumber(acceleration.accelerationTimeS, 1)} с; базова швидкість `
        + `${plainNumber(acceleration.baseSpeedMs * 3.6, 0)} км/год.`
      ],
      assumptions: [
        // Коефіцієнти 2/3 і 1/5 не підігнані: вони випливають саме з цього
        // припущення про профіль розгону (рівняння 5.10 джерела).
        "Профіль розгону взято за джерелом: V = V_f·√(t/t_a); саме з нього виходять "
        + "коефіцієнти 2/3 і 1/5 в осереднених опорах.",
        "Коефіцієнт f_r у рівнянні прийнято сталим і рівним базовому f₀; "
        + "швидкісну поправку не підставляють у формулу, виведену для сталого f_r."
      ],
      limitations: [
        "Рівняння (5.12) застосоване там, де єдине тягове джерело — одна "
        + "електрична машина: у BEV або послідовному гібриді/REEV. Для ДВЗ і "
        + "багатоджерельного паралельного гібрида потрібна інша модель розгону.",
        "Потужність на колесах: втрати приводу треба врахувати окремо, кожен шлях зі своїм ККД.",
        "Коефіцієнт обертових мас узято сталим, як у джерелі; насправді він залежить від передачі."
      ]
    };
  }

  function requiredMotorSpeed(context) {
    const values = [context.maximumSpeedMs, context.reductionRatio, context.dynamicRadiusM];
    if (!values.every(Number.isFinite) || values.some(value => value <= 0)) {
      return { defined: false, reason: "Потрібні додатні Vmax, i та rд." };
    }
    const requiredRpm = 30 * context.maximumSpeedMs * context.reductionRatio
      / (Math.PI * context.dynamicRadiusM);
    // Порівняння з тим, що машина справді вміє. Досі крок рахував потрібну
    // частоту й сам зізнавався, що не стверджує, ніби вибраний двигун її
    // витримає: проєкт міг прийняти редуктор, який вимагає 18 000 хв⁻¹ від
    // двигуна на 11 000, і документ не заперечував.
    const availableRpm = Number.isFinite(finiteNumber(context.availableMotorSpeedRpm))
      && finiteNumber(context.availableMotorSpeedRpm) > 0
      ? finiteNumber(context.availableMotorSpeedRpm)
      : null;
    return {
      defined: true,
      ...context,
      requiredMotorSpeedRpm: requiredRpm,
      availableMotorSpeedRpm: availableRpm,
      // null — «не перевіряли», а не «пройшло». Без кривої двигуна порівнювати
      // немає з чим, і вдавати перевірку гірше, ніж її не робити.
      withinMotorLimit: availableRpm === null ? null : requiredRpm <= availableRpm,
      speedMarginRatio: availableRpm === null ? null : availableRpm / requiredRpm
    };
  }

  function buildRequiredMotorSpeedStep(context) {
    const { result, axle, texNumber } = context;
    const axleId = axle === "front" ? "front" : "rear";
    const axleLabel = axle === "front" ? "передньої" : "задньої";
    const within = result.withinMotorLimit;
    return {
      id: `required-motor-speed-${axleId}`,
      title: `Потрібна максимальна частота обертання електродвигуна ${axleLabel} осі`,
      purpose: "Check the motor speed required by the adopted single-speed reduction at Vmax.",
      output: {
        id: `value.required-motor-speed-${axleId}`,
        symbol: `n_{\\mathrm{m,max,${axleId}}}`,
        label: `Required maximum motor speed, ${axleId} axle`,
        valueType: "quantity",
        canonicalUnit: "rpm"
      },
      expression: "30 * V_max * i_g / (pi * r_d)",
      dependencies: [
        "input.maximum-speed",
        "value.dynamic-wheel-radius",
        `decision.motor-reduction-${axleId}`,
        ...(result.availableMotorSpeedRpm === null
          ? [] : ["value.traction-characteristic-motor"])
      ],
      equationNumber: "4.6",
      formulaTex: "n_{\\mathrm{m,max}}=\\frac{30V_{\\max}i_g}{\\pi r_{\\mathrm{д}}}",
      substitutionTex: `n_{\\mathrm{m,max,${axleId}}}=\\frac{30\\cdot`
        + `${texNumber(result.maximumSpeedMs, 2)}\\cdot${texNumber(result.reductionRatio, 3)}}`
        + `{\\pi\\cdot${texNumber(result.dynamicRadiusM, 3)}}`
        + `=${texNumber(result.requiredMotorSpeedRpm, 0)}\\;\\mathrm{хв^{-1}}`,
      result: {
        value: result.requiredMotorSpeedRpm,
        canonicalUnit: "rpm",
        displayUnit: "хв⁻¹"
      },
      method: "ehsani-8.12-inverse",
      sourceRefs: ["source.method.ehsani-electric-traction"],
      readerNotes: [
        within === null
          ? "Межу двигуна не перевірено: максимальної частоти обертання машини не задано."
          : within
            ? `Двигун витримує: потрібно ${plainNumber(result.requiredMotorSpeedRpm, 0)} хв⁻¹ `
              + `при ${plainNumber(result.availableMotorSpeedRpm, 0)} хв⁻¹ можливих `
              + `(запас ${plainNumber(result.speedMarginRatio, 2)}).`
            // Порада дієва: редуктор, а не двигун, бо саме він тут вибирається.
            : `Двигун НЕ витримує: потрібно ${plainNumber(result.requiredMotorSpeedRpm, 0)} хв⁻¹ `
              + `при ${plainNumber(result.availableMotorSpeedRpm, 0)} хв⁻¹ можливих. `
              + "Зменште передаточне число редуктора, прийміть меншу максимальну "
              + "швидкість або виберіть швидкохіднішу машину."
      ],
      assumptions: [
        "The adopted ratio is the complete motor-to-wheel single-speed reduction.",
        "Tyre growth and slip at maximum speed are neglected."
      ],
      limitations: [
        "Перевіряється лише частота обертання: чи витримає двигун потрібний "
        + "момент і чи не перегріється — окремі питання."
      ]
    };
  }

  return Object.freeze({
    requiredCruisePower,
    buildRequiredCruisePowerStep,
    ENGINE_RATING_RULES,
    engineRatingRuleId,
    preliminaryEngineRating,
    preliminaryPowerAllocation,
    automaticEnginePower,
    buildPreliminaryEnginePowerStep,
    buildPreliminaryMotorPowerStep,
    preliminaryMotorRating,
    motorSpeedsFromRatio,
    buildPreliminaryEngineSpeedStep,
    maximumSpeedBalance,
    accelerationPower,
    sizingCheck,
    buildSizingStep,
    buildMaximumSpeedBalanceStep,
    requiredMotorSpeed,
    buildRequiredMotorSpeedStep
  });
}
