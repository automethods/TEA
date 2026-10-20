"use strict";

// Розділ 4.6 — передаточні числа трансмісії.
//
// Метод і всі числові межі взято з методичних вказівок до курсового проєкту,
// підрозділ 2.3, друковані с. 17—18. Звірено зі сканом (`Курсовой проект+.djvu`,
// аркуші 9 і 10), а не з текстовою розшифровкою: та сама розшифровка вже мала
// три хибні стовпці в таблиці 5, і покладатися на неї не можна.
//
// Скан дає більше, ніж розшифровка: умову зчеплення ведучих коліс із дорогою,
// якої в реконструйованому тексті немає зовсім. Саме вона обмежує перше
// передаточне число зверху, і без неї розрахунок давав би передачу, яку колеса
// не змогли б реалізувати.
export function createGearboxRatios({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;

  // Одна перевірка числа на весь проєкт: Number() приймає null, true й "" і
  // мовчки робить із них 0 та 1, а Number.isFinite їх пропускає.
  const { finiteNumber, plainNumber } = (function loadNumeric() {
    const scope = typeof window === "object" ? window : globalThis;
    if (!scope.VehicleNumeric && typeof module === "object" && module.exports) {
      require("./numeric.js");
    }
    return scope.VehicleNumeric;
  })();

  const ACTUAL_HUB_DEPENDENCIES = Object.freeze([
    "value.wheel-gear-ring-teeth", "decision.wheel-gear-sun-teeth"
  ]);
  const ACTUAL_HUB_FORMULA_TEX = "u_{\\mathrm{hub}}=1+\\frac{Z_k}{Z_{\\mathrm{по}}}";
  const ACTUAL_HUB_NOTE = "Дійсна колісна редукція u_hub=1+Z_k/Z_по відповідає прийнятим цілим зубам коронної й сонячної шестерень при нерухомій коронній шестерні. Початкове потрібне U_p не підставляють замість цього дійсного відношення.";


  // «Коробки передач легкових автомобілів з задніми ведучими колесами мають
  // здебільшого останню передачу пряму (u_кmin = 1). У легкових
  // передньоприводних автомобілів остання передача прискорююча, u_кmin =
  // 0,75…0,95.» — с. 17.
  const TOP_GEAR_RANGES = Object.freeze([
    {
      id: "car-rear-drive",
      label: "Легковий автомобіль із задніми ведучими колесами",
      min: 1, max: 1,
      note: "Остання передача пряма."
    },
    {
      id: "car-front-drive",
      label: "Легковий передньопривідний автомобіль",
      min: 0.75, max: 0.95,
      note: "Остання передача прискорююча."
    },
    {
      id: "truck-diesel",
      label: "Вантажний автомобіль із дизелем",
      min: 0.66, max: 1.0,
      note: null
    },
    {
      id: "truck-diesel-splitter",
      label: "Вантажний автомобіль із дизелем і подільником або демультиплікатором",
      min: 0.71, max: 0.82,
      note: null
    },
    {
      id: "truck-direct",
      label: "Вантажний автомобіль із прямою останньою передачею",
      min: 1.0, max: 1.0,
      note: "Останню передачу приймають прямою."
    },
    {
      id: "bus-city",
      label: "Міський або приміський автобус",
      min: 1.0, max: 1.0,
      note: null
    },
    {
      id: "bus-intercity",
      label: "Міжміський автобус",
      min: 0.72, max: 0.78,
      note: null
    }
  ]);

  // «Мінімальні передаточні числа роздавальних коробок сучасних повноприводних
  // вантажних автомобілів знаходяться в інтервалі від 0,917 до 1,00.» — с. 17.
  const TRANSFER_CASE_RANGE = Object.freeze({ min: 0.917, max: 1.0 });

  // ψ_max за призначенням автомобіля, с. 18.
  const ROAD_RESISTANCE_RANGES = Object.freeze([
    {
      id: "car-and-intercity",
      label: "Легкові автомобілі, а також вантажні автомобілі та автобуси міжміських сполучень",
      min: 0.25, max: 0.35
    },
    {
      id: "other-goods-and-buses",
      label: "Інші вантажні автомобілі та автобуси",
      min: 0.35, max: 0.45
    },
    {
      id: "off-road",
      label: "Автомобілі підвищеної прохідності",
      min: 0.45, max: 0.55
    }
  ]);

  // «φ = 0,6 — коефіцієнт зчеплення коліс з полотном дороги» — методичка, с. 18.
  // Це одне розрахункове число для перевірки передаточного числа, без поділу
  // за станом покриття.
  const ADHESION_COEFFICIENT = 0.6;

  // Стан покриття міняє зчеплення на порядок, тому одного числа мало.
  // Таблиця 6 Бирулі, друкована с. 60 — звірено зі сканом
  // (birulia_ak_proektirovanie_avtomobilnykh_dorog_chast1.pdf, аркуш 31).
  //
  // Це значення дорожнього проєктування свого часу. Сучасна шина на сухому
  // асфальті чіпляється краще: довідник з підготовки водіїв подає ≈0,8 для
  // сухого асфальту й 0,1 для льоду. Тому 0,7 тут — не «максимум можливого», а
  // розрахункове значення джерела, і саме як таке воно й позначене.
  const ADHESION_BY_SURFACE = Object.freeze([
    {
      id: "dry-asphalt-theory-book",
      surface: "Сухий асфальт",
      conditions: "Добрі шини; орієнтовне значення",
      value: 0.8, min: 0.8, max: 0.8,
      approximate: true, sourceRef: "korkort-theory-2025",
      modelSourceRef: "source.reference.korkort-theory-2025"
    },
    {
      id: "dry-clean-favourable",
      surface: "Сухе, чисте",
      conditions: "Особливо сприятливі",
      value: 0.7, min: 0.7, max: 0.7
    },
    {
      id: "dry-clean-normal",
      surface: "Сухе, чисте",
      conditions: "Нормальні",
      value: 0.5, min: 0.5, max: 0.5
    },
    {
      id: "wet-dirty",
      surface: "Вологе, брудне",
      conditions: "Несприятливі",
      // Джерело подає діапазон 0,3—0,2; 0,25 — прийнята цим проєктом середина,
      // а не значення таблиці.
      value: 0.25, min: 0.2, max: 0.3, valueIsAdoptedMidpoint: true
    },
    {
      id: "icy",
      surface: "Обледеніле",
      conditions: "Особливо несприятливі",
      value: 0.1, min: 0.1, max: 0.1
    }
  ]);

  function range(list, id) {
    return list.find(item => item.id === id) || null;
  }

  // Зчіпна вага G_зч — частина повної сили тяжіння, що припадає на ведучі осі
  // (Бируля, §15: «Часть веса автомобиля, приходящаяся на ведущие оси,
  // называется сцепным весом», m = G_зч/G). Її не треба питати окремо: осьові
  // частки k_i вже прийняті в розділі 3, а колісна формула каже, які осі ведучі.
  function adhesionWeight({ axleForcesKn, drivenAxleNumbers }) {
    const forces = Array.isArray(axleForcesKn) ? axleForcesKn : [];
    const driven = Array.isArray(drivenAxleNumbers) ? drivenAxleNumbers : [];
    if (!forces.length) return { defined: false, reason: "Осьових сил не задано." };
    if (!driven.length) return { defined: false, reason: "Не задано, які осі ведучі." };
    if (forces.some(value => !Number.isFinite(finiteNumber(value)) || finiteNumber(value) < 0)) {
      return { defined: false, reason: "Осьові сили мають бути скінченними й невід'ємними." };
    }
    // Номер осі — ціле число в межах схеми. Дробовий 1,5 давав NaN у зчіпній
    // вазі, а повторений «2, 2» рахував ту саму вісь двічі й видавав
    // G_зч/G = 1,10 — більше за всю вагу автомобіля.
    const invalid = driven.filter(number =>
      !Number.isInteger(number) || number < 1 || number > forces.length);
    if (invalid.length) {
      return { defined: false, reason: `Ведуча вісь ${invalid[0]} не існує в прийнятій схемі.` };
    }
    if (new Set(driven).size !== driven.length) {
      return { defined: false, reason: "Ту саму вісь названо ведучою двічі." };
    }
    const total = forces.reduce((sum, value) => sum + value, 0);
    const adhesion = driven.reduce((sum, number) => sum + forces[number - 1], 0);
    return {
      defined: true,
      adhesionWeightKn: adhesion,
      grossWeightForceKn: total,
      // m = G_зч/G — коефіцієнт зчіпної ваги за Бирулею.
      adhesionWeightRatio: total > 0 ? adhesion / total : null,
      drivenAxleNumbers: [...driven],
      // Крок показує саме доданки, тому сили лишаються з результатом.
      axleForcesKn: forces.map(Number)
    };
  }

  // Крок документа для зчіпної ваги.
  //
  // G_зч не питають окремо: осьові частки вже прийнято в розділі 3, а ведучі
  // осі — в 3.3. Це сума, а не нове припущення, і показати її треба саме як
  // суму, щоб було видно, які доданки взято.
  function buildAdhesionWeightStep({ adhesion, texNumber }) {
    const numbers = adhesion.drivenAxleNumbers;
    // Спершу назви доданків, потім їхні числа. Для однієї ведучої осі
    // «G_зч=8,75=8,75» читалося як помилка друку; «G_зч=G_2=8,75» каже, що
    // саме взято.
    const symbols = numbers.map(number => `G_{${number}}`).join("+");
    const values = numbers
      .map(number => texNumber(adhesion.axleForcesKn[number - 1], 2))
      .join("+");
    const terms = numbers.length > 1 ? `${symbols}=${values}` : symbols;
    return {
      id: "adhesion-weight",
      title: "Зчіпна вага",
      purpose: "Sum the weight carried by the driven axles.",
      output: {
        id: "value.adhesion-weight",
        symbol: "G_{\\mathrm{зч}}",
        label: "Adhesion weight",
        valueType: "quantity",
        canonicalUnit: "kN"
      },
      expression: "sum of driven axle forces",
      dependencies: [
        "value.axle-forces",
        "decision.driven-axle-set"
      ],
      equationNumber: "4.11",
      formulaTex: "G_{\\mathrm{зч}}=\\sum_{i\\in\\text{вед}}G_i",
      substitutionTex: `G_{\\mathrm{зч}}=${terms}=`
        + `${texNumber(adhesion.adhesionWeightKn, 2)}\\;\\mathrm{кН}`,
      result: {
        value: adhesion.adhesionWeightKn, canonicalUnit: "kN", displayUnit: "кН"
      },
      method: "sum-of-driven-axle-static-shares",
      // Бируля, §15: «Часть веса автомобиля, приходящаяся на ведущие оси,
      // называется сцепным весом».
      sourceRefs: ["source.reference.birulya-adhesion"],
      readerNotes: [
        `Ведучі осі: ${numbers.join(", ")}. `
        + `Коефіцієнт зчіпної ваги m = G_зч/G = `
        + `${plainNumber(adhesion.adhesionWeightRatio, 3)}.`
      ],
      assumptions: [],
      limitations: [
        // Курсовий рахує статику. На розгоні вага переходить назад, і задній
        // привід має більше зчеплення, ніж тут написано, а передній — менше.
        "Частки осей статичні: перерозподіл ваги на розгоні й на підйомі не враховано, "
        + "тому G_зч задніх ведучих осей у русі більша за цю оцінку, а передніх — менша."
      ]
    };
  }

  // u_тр,min = ω_max·r_к/V_max — умова досягнення заданої максимальної швидкості.
  function minimumTransmissionRatio({ maxAngularSpeed, rollingRadiusM, maxSpeedMs }) {
    const omega = finiteNumber(maxAngularSpeed);
    const radius = finiteNumber(rollingRadiusM);
    const speed = finiteNumber(maxSpeedMs);
    if (!(omega > 0)) return { defined: false, reason: "Потрібна додатна максимальна частота обертання." };
    if (!(radius > 0)) return { defined: false, reason: "Потрібен додатний радіус кочення." };
    if (!(speed > 0)) return { defined: false, reason: "Потрібна додатна максимальна швидкість." };
    return {
      defined: true,
      value: omega * radius / speed,
      maxAngularSpeed: omega,
      rollingRadiusM: radius,
      maxSpeedMs: speed
    };
  }

  // Крок документа для u_тр,min.
  //
  // Досі це число рахувалося всередині шляху ДВЗ і ніде не показувалося:
  // у звіті стояла сила тяги з передаточним числом, яке з'являлося нізвідки.
  // Читач не міг ні перевірити його, ні побачити, від чого воно залежить.
  //
  // Радіус тут — окреме питання. Методичка пише r_к (радіус кочення), а
  // документ має r_д, прийнятий рівним r_ст за Опанасюком. Вільний радіус
  // кочення джерело подає як 1,03…1,06·r_ст, тобто r_к на кілька відсотків
  // більший за прийнятий. Ця заміна занижує u_тр,min приблизно на стільки ж, і
  // саме тому вона тут названа, а не зроблена мовчки.
  function buildMinimumRatioStep({ minimum, radiusBasis, texNumber }) {
    const basis = radiusBasis || {};
    const adoptedAsDynamic = basis.adoptedAsDynamic !== false;
    return {
      id: "minimum-transmission-ratio",
      title: "Кінематична межа передаточного числа на вищій передачі",
      purpose: "Bound the top-gear total reduction from above so the engine does not exceed its maximum speed at V_max.",
      output: {
        id: "value.minimum-transmission-ratio",
        symbol: "u_{\\mathrm{тр,min}}",
        label: "Minimum transmission ratio",
        valueType: "number",
        canonicalUnit: null
      },
      expression: "omega_max * r_k / v_max",
      dependencies: [
        "value.dynamic-wheel-radius",
        "input.maximum-speed",
        "value.traction-characteristic-engine"
      ],
      equationNumber: "4.10",
      formulaTex: "u_{\\mathrm{тр,min}}=\\frac{\\omega_{\\max}\\,r_{\\mathrm{к}}}{V_{\\max}}",
      substitutionTex: `u_{\\mathrm{тр,min}}=\\frac{${texNumber(minimum.maxAngularSpeed, 1)}`
        + `\\cdot${texNumber(minimum.rollingRadiusM, 3)}}{${texNumber(minimum.maxSpeedMs, 2)}}`
        + `=${texNumber(minimum.value, 2)}`,
      result: { value: minimum.value, canonicalUnit: null, displayUnit: null },
      method: "course-methodic-2-3-kinematic-bound",
      sourceRefs: ["source.method.course"],
      // Найважливіше, чого цей крок НЕ доводить. Назва «умова досягнення
      // максимальної швидкості» обіцяла більше, ніж дає кінематика: вона
      // рахує лише те, щоб двигун не перекрутився. Чи вистачить потужності
      // подолати опір на цій швидкості, каже баланс потужностей, і поки його
      // немає, документ не має права стверджувати, що V_max досяжна.
      readerNotes: [
        "За заданої швидкості це найбільше передаточне число, за якого двигун "
        + "не перевищує граничної частоти: ω = V·u_тр/r_к ≤ ω_max. "
        + "Позначення u_тр,min стосується вищої передачі в ряду. "
        + "Чи вистачить потужності на цій швидкості, "
        + "перевіряє баланс потужностей (4.16)."
      ],
      assumptions: adoptedAsDynamic
        ? [
          "Радіус кочення прийнято рівним динамічному: r_к ≈ r_д. Джерело подає "
          + "вільний радіус кочення 1,03…1,06·r_ст, тому справжній r_к трохи більший."
        ]
        : [],
      limitations: adoptedAsDynamic && Number.isFinite(basis.freeRollingMaxM)
        ? [
          "За вільним радіусом кочення u_тр,min було б до "
          + `${plainNumber(basis.freeRollingMaxM / minimum.rollingRadiusM, 2)} `
          + "раза більшим; різниця йде в запас за максимальною швидкістю."
        ]
        : []
    };
  }

  // u_0 = u_тр,min/(u_к,min·u_рк,min). Головна передача — це те, що лишається
  // після прийнятих чисел коробки й роздавальної коробки.
  function finalDriveRatio({ transmissionRatio, topGearRatio, transferCaseRatio = 1, wheelHubRatio = 1 }) {
    const total = finiteNumber(transmissionRatio);
    const gearbox = finiteNumber(topGearRatio);
    const transfer = finiteNumber(transferCaseRatio);
    const hub = finiteNumber(wheelHubRatio);
    if (!(total > 0)) return { defined: false, reason: "Потрібне додатне u_тр,min." };
    if (!(gearbox > 0)) return { defined: false, reason: "Потрібне додатне u_к,min." };
    if (!(transfer > 0)) return { defined: false, reason: "Потрібне додатне u_рк,min." };
    if (!(hub > 0)) return { defined: false, reason: "Потрібне додатне передаточне число колісної передачі." };
    return {
      defined: true,
      value: total / (gearbox * transfer * hub),
      topGearRatio: gearbox,
      transferCaseRatio: transfer,
      wheelHubRatio: hub
    };
  }

  // Крок документа для головної передачі.
  //
  // u_0 — не самостійне рішення, а те, що лишається після двох прийнятих:
  // вищої передачі коробки й роздавальної коробки. Показувати його як
  // прийняте число означало б ховати, звідки воно взялося.
  function buildFinalDriveStep({ finalDrive, adoptedRatio, texNumber }) {
    const required = finalDrive.requiredValue ?? finalDrive.value;
    const hub = finalDrive.wheelHubRatio ?? 1;
    const requiredTotal = required * finalDrive.topGearRatio * finalDrive.transferCaseRatio * hub;
    const stages = finalDrive.actualStages || (finalDrive.actualPair ? [finalDrive.actualPair] : []);
    const toothProduct = stages.map(stage => `\\frac{${stage.drivenTeeth}}{${stage.drivingTeeth}}`).join("\\cdot");
    return {
      id: "final-drive-ratio",
      title: "Передаточне число головної передачі",
      purpose: "Derive the final-drive ratio from the adopted transmission and gearbox ratios.",
      output: {
        id: "value.final-drive-ratio",
        symbol: "u_0",
        label: "Final drive ratio",
        valueType: "number",
        canonicalUnit: null
      },
      expression: stages.length ? "product of adopted final-drive tooth ratios" : "u_tr / (u_k * u_rk * u_hub)",
      dependencies: [
        "decision.adopted-transmission-ratio",
        "decision.top-gear-ratio",
        "decision.transfer-case-ratio",
        ...(hub !== 1 ? ACTUAL_HUB_DEPENDENCIES : [])
      ],
      equationNumber: "4.12",
      formulaTex: `${stages.length ? "u_{0,\\mathrm{потр}}" : "u_0"}=\\frac{u_{\\mathrm{тр,потр}}}`
        + `{u_{\\mathrm{к,min}}\\,u_{\\mathrm{рк,min}}${hub !== 1 ? "\\,u_{\\mathrm{hub}}" : ""}}`
        + (stages.length ? ",\\qquad u_0=\\prod_j\\frac{z_{2,j}}{z_{1,j}}" : "")
        + (hub !== 1 ? `,\\quad ${ACTUAL_HUB_FORMULA_TEX}` : ""),
      substitutionTex: `${stages.length ? "u_{0,\\mathrm{потр}}" : "u_0"}=\\frac{${texNumber(requiredTotal, 3)}}`
        + `{${texNumber(finalDrive.topGearRatio, 2)}\\cdot`
        + `${texNumber(finalDrive.transferCaseRatio, 3)}${hub !== 1 ? `\\cdot${texNumber(hub, 4)}` : ""}}`
        + `=${texNumber(required, 4)}`
        + (stages.length ? `;\\quad u_0=${toothProduct}=${texNumber(finalDrive.value, 4)}` : ""),
      result: { value: finalDrive.value, canonicalUnit: null, displayUnit: null },
      method: stages.length ? "required-and-adopted-final-drive-ratios" : "course-methodic-2-3",
      sourceRefs: ["source.method.course", ...(stages.length || hub !== 1 ? ["source.project-derivation"] : [])],
      assumptions: [],
      readerNotes: [...(stages.length ? [
        `Потрібна редукція u₀=${plainNumber(required,4)}; прийняті ступені: ${stages.map(stage => `${stage.drivenTeeth}/${stage.drivingTeeth}`).join(" × ")}, разом u₀=${plainNumber(finalDrive.value,4)}. Дійсний добуток використано в усіх тягових шляхах; головна передача не додається повторно.`
      ] : []), ...(hub !== 1 ? [ACTUAL_HUB_NOTE] : [])],
      limitations: stages.length ? ["Числа зубів визначають кінематику. Геометрію, згин і контакт перевіряє розділ 12; це ще не підтвердження ресурсу чи виготовлення."] : [
        "Отримане число — вимога до головної передачі, а не наявне передаточне "
        + "число: серійний ряд головних передач дискретний, і найближче з нього "
        + "зсуне і максимальну швидкість, і силу тяги."
      ]
    };
  }

  // u_тр,max = ψ_max·G_a·r_д/(M_k,max·η_м) — умова подолання найбільшого опору
  // дороги. Обмеження зверху дає зчеплення: u_тр,max ≤ φ·G_зч·r_д/(M_k,max·η_м).
  function maximumTransmissionRatio({
    roadResistanceMax, grossWeightForceN, dynamicRadiusM, maxTorqueNm, efficiency,
    adhesionWeightN = null, adhesionCoefficient = ADHESION_COEFFICIENT
  }) {
    const psi = finiteNumber(roadResistanceMax);
    const weight = finiteNumber(grossWeightForceN);
    const radius = finiteNumber(dynamicRadiusM);
    const torque = finiteNumber(maxTorqueNm);
    const eta = finiteNumber(efficiency);
    if (!(psi > 0)) return { defined: false, reason: "Потрібне додатне ψ_max." };
    if (!(weight > 0)) return { defined: false, reason: "Потрібна додатна повна сила тяжіння." };
    if (!(radius > 0)) return { defined: false, reason: "Потрібен додатний динамічний радіус." };
    if (!(torque > 0)) return { defined: false, reason: "Потрібен додатний максимальний момент двигуна." };
    if (!(eta > 0 && eta <= 1)) return { defined: false, reason: "ККД має лежати в межах (0; 1]." };
    const phi = finiteNumber(adhesionCoefficient);
    if (!(phi > 0)) return { defined: false, reason: "Коефіцієнт зчеплення має бути додатним числом." };

    const required = psi * weight * radius / (torque * eta);
    const adhesion = adhesionWeightN !== null && finiteNumber(adhesionWeightN) > 0
      ? phi * finiteNumber(adhesionWeightN) * radius / (torque * eta)
      : null;

    const adopted = adhesion === null ? required : Math.min(required, adhesion);
    return {
      defined: true,
      value: adopted,
      roadRequiredRatio: required,
      adhesionLimit: adhesion,
      // Перевірка джерела, а не побажання: передаточне число, більше за межу
      // зчеплення, дало б силу, якої колеса не передадуть на дорогу.
      satisfiesAdhesion: adhesion === null ? null : required <= adhesion,
      limitedBy: adhesion !== null && adhesion < required ? "adhesion" : "road-resistance",
      adhesionCoefficient: adhesion === null ? null : phi,
      roadResistanceMax: psi,
      // Preserve the exact evaluated operands for the numbered numerical trace.
      // Recovering them from the rounded ratio would conceal unit mistakes.
      grossWeightForceN: weight,
      dynamicRadiusM: radius,
      maxTorqueNm: torque,
      efficiency: eta,
      adhesionForceN: adhesion === null ? null : phi * finiteNumber(adhesionWeightN)
    };
  }

  // F_φ = φ·G_зч — сила, яку дорога взагалі здатна прийняти від ведучих коліс.
  // Вона не залежить від того, який момент підводить трансмісія: більше за неї
  // колесо не передасть, а почне буксувати.
  function buildAdhesionForceStep({ adhesion, adhesionCoefficient, texNumber }) {
    const phi = finiteNumber(adhesionCoefficient);
    const forceKn = phi * adhesion.adhesionWeightKn;
    return {
      id: "adhesion-force",
      title: "Сила зчеплення ведучих коліс",
      purpose: "Bound the wheel force by what the road can accept.",
      output: {
        id: "value.adhesion-force",
        symbol: "F_{\\varphi}",
        label: "Adhesion-limited wheel force",
        valueType: "quantity",
        canonicalUnit: "kN"
      },
      expression: "phi * G_adhesion",
      dependencies: ["value.adhesion-weight", "decision.adhesion-coefficient"],
      equationNumber: "4.14",
      formulaTex: "F_{\\varphi}=\\varphi\\,G_{\\mathrm{зч}}",
      substitutionTex: `F_{\\varphi}=${texNumber(phi, 2)}\\cdot`
        + `${texNumber(adhesion.adhesionWeightKn, 2)}=`
        + `${texNumber(forceKn, 2)}\\;\\mathrm{кН}`,
      result: { value: forceKn, canonicalUnit: "kN", displayUnit: "кН" },
      method: "adhesion-limited-force",
      sourceRefs: ["source.reference.birulya-adhesion", "source.reference.virzi-mariotti"],
      assumptions: [],
      limitations: [
        "Межа статична: під час розгону вага переходить на задні осі, тому в русі "
        + "F_φ задніх ведучих коліс більша за цю оцінку, а передніх — менша.",
        "Коефіцієнт зчеплення взято сталим: залежності від ковзання ця модель не описує."
      ]
    };
  }

  function buildRoadRequiredRatioStep({ maximum, efficiencyRef, texNumber }) {
    return {
      id: "road-required-transmission-ratio",
      title: "Передаточне число за найбільшим опором дороги",
      purpose: "Determine the transmission ratio required by the heaviest road condition.",
      output: {
        id: "value.road-required-transmission-ratio",
        symbol: "u_{\\mathrm{тр,дор}}",
        label: "Road-required transmission ratio",
        valueType: "number",
        canonicalUnit: null
      },
      expression: "psi_max * G_a * r_d / (M_max * eta)",
      dependencies: [
        "decision.maximum-road-resistance",
        "value.gross-weight-force",
        "value.dynamic-wheel-radius",
        "value.traction-characteristic-engine",
        efficiencyRef || "value.transmission-efficiency"
      ],
      equationNumber: "4.13",
      formulaTex: "u_{\\mathrm{тр,дор}}=\\frac{\\psi_{\\max}\\,G_a\\,r_{\\mathrm{д}}}"
        + "{M_{\\max}\\,\\eta_{\\mathrm{м}}}",
      substitutionTex: `u_{\\mathrm{тр,дор}}=\\frac{${texNumber(maximum.roadResistanceMax, 4)}\\cdot${texNumber(maximum.grossWeightForceN / 1000, 5)}\\cdot10^3\\cdot${texNumber(maximum.dynamicRadiusM, 6)}}`
        + `{${texNumber(maximum.maxTorqueNm, 4)}\\cdot${texNumber(maximum.efficiency, 5)}}=${texNumber(maximum.roadRequiredRatio, 3)}`,
      result: { value: maximum.roadRequiredRatio, canonicalUnit: null, displayUnit: null },
      method: "course-methodic-2-3-road-requirement",
      sourceRefs: ["source.method.course"],
      readerNotes: ["G_a з розділу 3 виражено у кН; множник 10³ переводить його у Н перед підстановкою разом із моментом у Н·м і радіусом у м."],
      assumptions: [],
      limitations: [
        "Це потрібне число за опором дороги, а не автоматично прийнята перша передача: "
        + "його ще обмежує зчеплення."
      ]
    };
  }

  function buildAdhesionRatioStep({ maximum, efficiencyRef, texNumber }) {
    if (maximum.adhesionLimit === null) return null;
    return {
      id: "adhesion-transmission-limit",
      title: "Межа передаточного числа за зчепленням",
      purpose: "Limit the transmission ratio by the force the driven wheels can transmit.",
      output: {
        id: "value.adhesion-transmission-limit",
        symbol: "u_{\\mathrm{тр},\\varphi}",
        label: "Adhesion-limited transmission ratio",
        valueType: "number",
        canonicalUnit: null
      },
      expression: "F_phi * r_d / (M_max * eta)",
      dependencies: [
        "value.adhesion-force",
        "value.dynamic-wheel-radius",
        "value.traction-characteristic-engine",
        efficiencyRef || "value.transmission-efficiency"
      ],
      equationNumber: "4.15",
      formulaTex: "u_{\\mathrm{тр},\\varphi}=\\frac{F_{\\varphi}\\,r_{\\mathrm{д}}}"
        + "{M_{\\max}\\,\\eta_{\\mathrm{м}}}",
      substitutionTex: `u_{\\mathrm{тр},\\varphi}=\\frac{${texNumber(maximum.adhesionForceN / 1000, 5)}\\cdot10^3\\cdot${texNumber(maximum.dynamicRadiusM, 6)}}`
        + `{${texNumber(maximum.maxTorqueNm, 4)}\\cdot${texNumber(maximum.efficiency, 5)}}=${texNumber(maximum.adhesionLimit, 3)}`,
      result: { value: maximum.adhesionLimit, canonicalUnit: null, displayUnit: null },
      method: "adhesion-limited-transmission-ratio",
      sourceRefs: ["source.method.course", "source.reference.virzi-mariotti"],
      readerNotes: ["Силу F_φ беруть із (4.14); множник 10³ переводить кН у Н. Це межа сили за зчепленням, а не повторне множення головної передачі."],
      assumptions: [],
      limitations: [
        "Межу визначено зі статичної зчіпної ваги; перенесення навантаження під час "
        + "розгону змінює її для переднього і заднього привода в різні боки."
      ]
    };
  }

  // Прийняте число — менша з двох незалежних меж. Тримати їх одним числом
  // було небезпечно: попередня реалізація попереджала про буксування, але далі
  // все одно будувала коробку за завеликим дорожнім значенням.
  function buildMaximumRatioStep({ maximum, texNumber }) {
    if (maximum.modern) {
      const locked = maximum.mode === "locked-creep";
      const balanced = maximum.mode === "balanced-launch";
      const candidates = [maximum.roadRequiredRatio, ...(locked ? [maximum.lowSpeedRequiredRatio] : []), maximum.launchRequiredRatio, ...(balanced ? [maximum.idleLaunchRequiredRatio] : [])];
      const required = maximum.requiredValue ?? Math.max(...candidates);
      return {
        id: "maximum-transmission-ratio", title: "Перша повна редукція: вимоги та межа зчеплення",
        purpose: "Choose a road/launch endpoint bounded by adhesion for automatic road gearing; preserve unmet requirements and explicit crawl/manual choices.",
        output: { id: "value.maximum-transmission-ratio", symbol: "u_{\\Sigma,1}", label: "First gear total reduction", valueType: "number", canonicalUnit: null },
        expression: maximum.adhesionConstrained ? "min(u_required, u_adhesion)" : balanced ? "max(u_road, F_hill*r/(T_peak*eta), m*(g*f+a)*r/(T_idle*eta))" : locked ? "max(u_road, omega_idle*r/v_creep, F_launch*r/(T_launch*eta))" : "max(u_road, F_launch*r/(T_launch*eta))",
        dependencies: [...(maximum.adhesionConstrained ? ["value.adhesion-transmission-limit"] : []), "value.road-required-transmission-ratio", "value.traction-characteristic-engine", "value.dynamic-wheel-radius", "input.vehicle-category", "input.first-gear-design-mode", "input.first-gear-crawl-speed", "input.first-gear-start-grade", "input.first-gear-start-acceleration", "input.clutch-launch-speed"],
        equationNumber: null,
        formulaTex: (balanced ? String.raw`u_{\mathrm{ухил}}=\frac{m[g(\sin\alpha+f_0\cos\alpha)+a]r}{T_{\max}\eta},\quad u_{\mathrm{рівна}}=\frac{m(gf_0+a)r}{T(n_c)\eta},\quad u_{\mathrm{потр}}=\max(u_{\mathrm{дор}},u_{\mathrm{ухил}},u_{\mathrm{рівна}})` : "u_{\\mathrm{повз}}=\\frac{\\omega_xr}{v_{\\mathrm{повз}}};\\quad F_{\\mathrm{пуск}}=m[g(\\sin\\alpha+f_0\\cos\\alpha)+a];\\quad u_{\\mathrm{пуск}}=\\frac{F_{\\mathrm{пуск}}r}{T(n_{\\mathrm{пуск}})\\eta}") + (maximum.adhesionConstrained ? String.raw`;\quad u_{\Sigma,1}=\min(u_{\mathrm{потр}},u_{\varphi})` : ""),
        substitutionTex: `\\begin{aligned}u_{\\mathrm{повз}}&=\\frac{(${texNumber(maximum.idleAngularSpeed*30/Math.PI,0)}\\pi/30)\\cdot${texNumber(maximum.dynamicRadiusM,6)}}{${texNumber(maximum.creepSpeedKmh,2)}/3{,}6}=${texNumber(maximum.lowSpeedRequiredRatio,3)}\\\\`
          + `\\alpha&=\\arctan(${texNumber(maximum.startGrade,3)});\\quad a=${texNumber(maximum.minimumAcceleration,3)}\\ \\text{м/с²}\\\\`
          + `F_{\\mathrm{пуск}}&=${texNumber(maximum.massKg,2)}[9{,}81(\\sin\\alpha+${texNumber(maximum.rollingResistance,4)}\\cos\\alpha)+${texNumber(maximum.minimumAcceleration,3)}]=${texNumber(maximum.requiredLaunchForceN,2)}\\ \\text{Н}\\\\`
          + `u_{\\mathrm{пуск}}&=\\frac{${texNumber(maximum.requiredLaunchForceN,2)}\\cdot${texNumber(maximum.dynamicRadiusM,6)}}{${texNumber(maximum.launchTorqueNm,3)}\\cdot${texNumber(maximum.efficiency,3)}}=${texNumber(maximum.launchRequiredRatio,3)}\\\\`
          + (balanced ? `u_{\\mathrm{рівна}}&=\\frac{${texNumber(maximum.massKg,2)}(9{,}81\\cdot${texNumber(maximum.rollingResistance,4)}+${texNumber(maximum.minimumAcceleration,3)})\\cdot${texNumber(maximum.dynamicRadiusM,6)}}{${texNumber(maximum.idleLaunchTorqueNm,3)}\\cdot${texNumber(maximum.efficiency,3)}}=${texNumber(maximum.idleLaunchRequiredRatio,3)}\\\\` : "")
          + `u_{\\Sigma,1,\\mathrm{потр}}&=\\max(${candidates.map(x=>texNumber(x,3)).join(",")})=${texNumber(required,3)}\\\\u_{\\Sigma,1,\\mathrm{прийн}}&=${maximum.adhesionConstrained ? `\\min(${texNumber(required,3)},${texNumber(maximum.adhesionLimit,3)})=` : ""}${texNumber(maximum.value,3)}\\end{aligned}`,
        result: { value: maximum.value, canonicalUnit: null, displayUnit: null },
        method: maximum.adhesionConstrained ? "adhesion-constrained-road-launch" : locked ? "declared-locked-creep-and-launch" : "declared-road-launch-with-clutch-slip",
        sourceRefs: ["source.method.course", "source.project-derivation"], assumptions: maximum.adhesionConstrained ? ["Для округлення зубів першої передачі дозволено до 5 % надлишку повної тяги; для передач 2 і вище — не більше межі зчеплення. Це проєктний допуск, не збільшення φ."] : [],
        readerNotes: [
          locked ? `Явно вибрано повзучий хід ${maximum.creepSpeedKmh} км/год без ковзання. Це проєктна вимога, не норма для всіх автомобілів.`
            : `Вибрано маневр ${maximum.creepSpeedKmh} км/год із перевіркою зчеплення: кінематичне число ${plainNumber(maximum.lowSpeedRequiredRatio,3)} показане як АЛЬТЕРНАТИВА, не включене в максимум.`,
          balanced ? "Звичайний старт — за моментом на прийнятих нижніх обертах на рівній дорозі. Пусковий ухил перевіряється окремо за максимальним моментом; мінімальні потрібні оберти та тепло зчеплення визначаються після прийняття зубів." : `Пуск: ухил ${plainNumber(maximum.startGrade*100,1)} %, прискорення ${plainNumber(maximum.minimumAcceleration,2)} м/с²; ${plainNumber((maximum.launchAngularSpeed??maximum.idleAngularSpeed)*30/Math.PI,0)} об/хв і момент ${plainNumber(maximum.launchTorqueNm,2)} Н·м із спільної кривої. Це явні початкові припущення; їх можна змінити.`,
          maximum.adoptedManually ? `Повна перша редукція задана автором. Вимога ${maximum.satisfiesRequirement ? "виконується" : "НЕ виконується"}; число не виправлено мовчки.` : maximum.adhesionConstrained ? `Автоматично прийнято менше з дорожньої/пускової вимоги та межі зчеплення. ${maximum.adhesionLimited ? "Початкова вимога повністю НЕ виконується; окремі дорожню та пускову умови перевіряємо на прийнятій передачі." : "Початкову вимогу виконано."} Цілі зуби перевіряються за зчепленням повторно: перша передача — до 105 % Fφ, решта — до 100 % Fφ.` : "Для зубчастого підбору використано потрібну редукцію. Фактичний добуток може відрізнятися після вибору цілих зубів.",
          "Межа за зчепленням показує повний момент двигуна. Коли потрібний момент менший, зчеплення може бути замкненим без буксування шин; момент задають подачею палива.",
          "Енергія короткого маневру й рушання на фактичній передачі показана в §9. Без допустимої енергії та теплових даних ресурс не підтверджено."
        ], limitations: ["Умови сили й кінематики не замінюють перевірку тепла, інерцій, керування двигуном та ресурсу зчеплення."]
      };
    }
    const satisfied = maximum.satisfiesAdhesion;
    return {
      id: "maximum-transmission-ratio",
      title: "Прийняте найбільше передаточне число трансмісії",
      purpose: "Adopt the smaller of the road requirement and the adhesion limit.",
      output: {
        id: "value.maximum-transmission-ratio",
        symbol: "u_{\\mathrm{тр,max}}",
        label: "Maximum transmission ratio",
        valueType: "number",
        canonicalUnit: null
      },
      expression: "min(u_road, u_adhesion)",
      dependencies: [
        "value.road-required-transmission-ratio",
        ...(maximum.adhesionLimit === null ? [] : ["value.adhesion-transmission-limit"])
      ],
      equationNumber: null,
      formulaTex: "u_{\\mathrm{тр,max}}=\\min\\left(u_{\\mathrm{тр,дор}},"
        + "u_{\\mathrm{тр},\\varphi}\\right)",
      substitutionTex: maximum.adhesionLimit === null
        ? `u_{\\mathrm{тр,max}}=${texNumber(maximum.value, 2)}\\;\\text{(межу зчеплення не визначено)}`
        : `u_{\\mathrm{тр,max}}=\\min(${texNumber(maximum.roadRequiredRatio, 2)},`
          + `${texNumber(maximum.adhesionLimit, 2)})=${texNumber(maximum.value, 2)}`,
      result: { value: maximum.value, canonicalUnit: null, displayUnit: null },
      method: "minimum-of-road-and-adhesion-limits",
      sourceRefs: ["source.method.course"],
      readerNotes: [
        satisfied === null
          ? "Межу зчеплення не перевірено: немає зчіпної ваги або коефіцієнта зчеплення."
          : satisfied
            ? `Умову зчеплення виконано: ${plainNumber(maximum.value, 2)} ≤ `
              + `${plainNumber(maximum.adhesionLimit, 2)}.`
            // Порада самого джерела, а не переказ: спершу перекомпонувати
            // автомобіль, щоб на ведучі колеса припало більше ваги, а якщо це
            // неможливо — брати u_тр,max із умови відсутності буксування,
            // тобто саме межу зчеплення.
            : `Дорожня вимога перевищує межу зчеплення: `
              + `${plainNumber(maximum.roadRequiredRatio, 2)} > `
              + `${plainNumber(maximum.adhesionLimit, 2)}. Колеса забуксують раніше, `
              + "ніж двигун вийде на свій момент. Джерело радить спершу збільшити "
              + "навантаження на ведучі колеса зміною загального компонування, а "
              + "коли це неможливо — приймати u_тр,max за умовою відсутності "
              + `буксування, тому прийнято ${plainNumber(maximum.value, 2)}.`
      ],
      assumptions: [],
      limitations: [
        "M_max узято з зовнішньої характеристики: це найбільший момент двигуна, "
        + "а не момент на розрахунковій частоті.",
        ...(maximum.limitedBy === "adhesion" ? [
          "За прийнятого зчеплення автомобіль не долає заданий ψ_max: збільшення "
          + "передаточного числа лише спричинило б буксування."
        ] : [])
      ]
    };
  }

  // Роздавальна коробка на нижчому ряді.
  //
  // Старий скан подає цей рядок нечітко, і я прочитав його як 1,31…2,26.
  // Свіжіше видання тієї самої методики (МетодичкаКИЕВ, рівняння 2.35 і текст
  // перед ним) друкує його чітко: **від 1,31 до 2,28**. Нижня межа збіглася,
  // верхню я прочитав хибно в останній цифрі. Тепер узято чітке видання.
  const TRANSFER_CASE_LOW_RANGE = Object.freeze({ min: 1.31, max: 2.28 });

  // Ряд передач коробки за законом геометричної прогресії, с. 19.
  //
  // Формули звірено зі сканом, а не з розшифровкою:
  //   u_к1 = u_тр,max/(u_рк,max·u_0);
  //   q = ω_M/ω_max — знаменник прогресії;
  //   n = (lg u_к,min − lg u_к1)/lg q + 1;
  //   пряма остання передача:        u_кj = (u_к1^(n−j))^(1/(n−1));
  //   прискорююча остання, передостання пряма: u_кj = (u_к1^(n−j−1))^(1/(n−2)).
  //
  // Знаменник прогресії — не вільний параметр: його задає сам двигун
  // відношенням частоти максимального моменту до максимальної. Ширший
  // діапазон обертів дає менше q і менше передач.
  function gearboxLadder({
    firstGearRatio, topGearRatio, angularSpeedAtMaxTorque, maximumAngularSpeed,
    topGearIsDirect = true, gearCount = null
  }) {
    const first = finiteNumber(firstGearRatio);
    const top = finiteNumber(topGearRatio);
    const omegaM = finiteNumber(angularSpeedAtMaxTorque);
    const omegaMax = finiteNumber(maximumAngularSpeed);
    if (!(first > 0)) return { defined: false, reason: "Потрібне додатне u_к1." };
    if (!(top > 0)) return { defined: false, reason: "Потрібне додатне u_к,min." };
    if (!(first > top)) {
      return {
        defined: false,
        reason: `Перша передача ${first.toFixed(2)} має бути більшою за останню `
          + `${top.toFixed(2)}: інакше ряду між ними немає.`
      };
    }
    if (!(omegaM > 0) || !(omegaMax > 0)) {
      return { defined: false, reason: "Потрібні ω_M і ω_max із зовнішньої характеристики." };
    }
    if (!(omegaM < omegaMax)) {
      return {
        defined: false,
        reason: "Частота максимального моменту має бути меншою за максимальну: "
          + "інакше знаменник прогресії не менший за одиницю."
      };
    }

    const q = omegaM / omegaMax;
    const exact = (Math.log10(top) - Math.log10(first)) / Math.log10(q) + 1;
    // Число передач ціле за побудовою коробки, а формула дає дробове. Округлення
    // вгору, а не до найближчого: менше передач, ніж вимагає прогресія, лишає
    // розрив, у якому двигун провалюється нижче за ω_M.
    const suppliedCount = gearCount !== null && gearCount !== undefined && gearCount !== "";
    const adoptedCount = finiteNumber(gearCount);
    if (suppliedCount && (!Number.isInteger(adoptedCount) || adoptedCount < 2 || adoptedCount > 64)) {
      return { defined: false, reason: "Кількість передач має бути цілим числом від 2 до 64." };
    }
    const overdrive = !topGearIsDirect;
    if (overdrive && !(first > 1 && top < 1)) {
      return { defined: false, reason: "Для ряду з прямою передостанньою передачею потрібні u_к1 > 1 та u_к,min < 1." };
    }
    const count = suppliedCount ? adoptedCount : Math.max(overdrive ? 3 : 2, Math.ceil(exact));
    if (count > 64 || (overdrive && count < 3)) {
      return { defined: false, reason: "Кількість передач не відповідає вибраній схемі ряду." };
    }
    // Preserve both ADOPTED endpoints. The old power-only expression silently
    // replaced an adopted overdrive (e.g. 0.8) with first^(-1/(n-2)).
    const gears = Array.from({ length: count }, (unused, index) => {
      const ratio = index === 0 ? first : index === count - 1 ? top
        : overdrive ? first ** ((count - index - 2) / (count - 2))
        : first ** ((count - index - 1) / (count - 1)) * top ** (index / (count - 1));
      return { gear: index + 1, ratio };
    });
    const adjacentRatios = gears.slice(1).map((gear, index) => gear.ratio / gears[index].ratio);

    return {
      defined: true,
      progressionDenominator: q,
      exactCount: exact,
      gearCount: count,
      countIsAdopted: suppliedCount,
      speedBandCovered: adjacentRatios.every(ratio => ratio >= q - 1e-12),
      topGearIsDirect,
      gears,
      firstGearRatio: first,
      topGearRatio: top,
      angularSpeedAtMaxTorque: omegaM,
      maximumAngularSpeed: omegaMax
    };
  }

  // u_к1 = u_тр,max/(u_рк,max·u_0), с. 19.
  function firstGearRatio({ maximumTransmissionRatio, finalDriveRatio, transferCaseMax = 1, wheelHubRatio = 1 }) {
    const total = finiteNumber(maximumTransmissionRatio);
    const final = finiteNumber(finalDriveRatio);
    const transfer = finiteNumber(transferCaseMax);
    const hub = finiteNumber(wheelHubRatio);
    if (!(total > 0)) return { defined: false, reason: "Потрібне додатне u_тр,max." };
    if (!(final > 0)) return { defined: false, reason: "Потрібне додатне u_0." };
    if (!(transfer > 0)) return { defined: false, reason: "Потрібне додатне u_рк,max." };
    if (!(hub > 0)) return { defined: false, reason: "Потрібне додатне передаточне число колісної передачі." };
    return {
      defined: true,
      value: total / (transfer * final * hub),
      transferCaseMax: transfer,
      finalDriveRatio: final,
      wheelHubRatio: hub
    };
  }

  function buildFirstGearStep({ first, texNumber }) {
    const hub = first.wheelHubRatio ?? 1;
    const adopted = first.adoptedPair;
    const required = first.requiredValue ?? first.value;
    const meshFactor = first.pairsPerGear === 2
      ? `\\frac{${first.constantMesh.drivenTeeth}}{${first.constantMesh.drivingTeeth}}\\cdot` : "";
    return {
      id: "first-gear-ratio",
      title: "Передаточне число першої передачі",
      purpose: adopted ? "Publish the adopted integer first-gear ratio and retain its separate lower-bound requirement." : "Remove final-drive, transfer and hub reductions from the required first-gear total reduction.",
      output: {
        id: "value.first-gear-ratio",
        symbol: "u_{\\mathrm{к}1}",
        label: "First-gear ratio",
        valueType: "number",
        canonicalUnit: null
      },
      expression: adopted ? "u_first_actual = direct ? 1 : meshFactor * drivenTeeth / drivingTeeth; u_first_actual >= u_first_required" : "u_tr_max / (u_transfer * u_final * u_hub)",
      dependencies: [
        "value.maximum-transmission-ratio",
        "value.final-drive-ratio",
        "decision.transfer-case-ratio",
        ...(adopted ? ["decision.gearbox-topology", "decision.gearbox-constant-mesh"] : []),
        ...(hub !== 1 ? ACTUAL_HUB_DEPENDENCIES : [])
      ],
      equationNumber: "4.17",
      formulaTex: `${adopted ? "u_{\\mathrm{к}1,\\mathrm{потр}}" : "u_{\\mathrm{к}1}"}=\\frac{u_{\\mathrm{тр,max}}}`
        + `{u_{\\mathrm{рк}}u_0${hub !== 1 ? "u_{\\mathrm{hub}}" : ""}}`
        + (adopted ? ",\\quad u_{\\mathrm{к}1,\\mathrm{дійсн}}=" + (adopted.direct ? "1" : `${first.pairsPerGear === 2 ? "\\frac{Z_2}{Z_1}\\cdot" : ""}\\frac{Z_{1\\mathrm{в}}}{Z_{1\\mathrm{п}}}`) + "\\ge u_{\\mathrm{к}1,\\mathrm{потр}}" : "")
        + (hub !== 1 ? `,\\quad ${ACTUAL_HUB_FORMULA_TEX}` : ""),
      substitutionTex: `${adopted ? "u_{\\mathrm{к}1,\\mathrm{потр}}" : "u_{\\mathrm{к}1}"}=\\frac{${texNumber(required
        * first.transferCaseMax * first.finalDriveRatio * hub, 2)}}`
        + `{${texNumber(first.transferCaseMax, 2)}\\cdot${texNumber(first.finalDriveRatio, 2)}${hub !== 1 ? `\\cdot${texNumber(hub, 4)}` : ""}}`
        + `=${texNumber(required, 3)}`
        + (adopted ? `,\\quad u_{\\mathrm{к}1,\\mathrm{дійсн}}=${adopted.direct ? "1" : `${meshFactor}\\frac{${adopted.drivenTeeth}}{${adopted.drivingTeeth}}`}=${texNumber(first.value, 4)}` : ""),
      result: { value: first.value, canonicalUnit: null, displayUnit: null },
      method: adopted ? "integer-gearset-adopted" : "course-methodic-2-3-first-gear",
      sourceRefs: adopted || hub !== 1 ? ["source.method.course", "source.project-derivation"] : ["source.method.course"],
      readerNotes: [...(adopted ? ["Потрібне число задає нижню межу першої передачі. У всіх подальших розрахунках використано дійсне число прийнятих цілих зубів; саме цей скаляр задає найбільше число коробки та момент карданного вала."] : []),
        ...(hub !== 1 ? [ACTUAL_HUB_NOTE] : [])],
      assumptions: [],
      limitations: []
    };
  }

  function buildGearCountStep({ ladder, texNumber }) {
    if (ladder.economyGear) return {
      id:"gear-count", title:"Кількість робочих передач і крейсерська передача",
      purpose:"Cover the working range, then add one independently sized cruising gear.",
      output:{id:"value.gear-count",symbol:"n",label:"Gear count",valueType:"integer",canonicalUnit:"1"},
      expression:"n_min = max(n_class_working, n_teeth_working, ceil(1+ln(u_first/u_working)/ln(s_max))) + 1",
      dependencies:["value.first-gear-ratio","decision.top-gear-ratio","value.traction-characteristic-engine","input.vehicle-category",...(ladder.countIsAdopted?["input.gear-count"]:[])],
      equationNumber:"4.18",
      formulaTex:String.raw`n_w=\max(n_{w,0},\lceil1+\ln(u_1/u_w)/\ln(s_{\max})\rceil),\quad n=n_w+1`,
      substitutionTex:String.raw`n_{\mathrm{смуга}}=1+\frac{\ln(${texNumber(ladder.designFirstGearRatio,5)}/${texNumber(ladder.workingTopRatio,5)})}{\ln(${texNumber(ladder.maximumStepRatio,5)})}=${texNumber(ladder.exactCount,4)};\quad n_{\min}=${ladder.minimumRequiredCount};\quad n=${ladder.workingGearCount}+1=${ladder.gearCount}`,
      result:{value:ladder.gearCount,canonicalUnit:"1",displayUnit:"передач"},method:"working-gears-plus-cruise",
      sourceRefs:["source.project-derivation","source.method.course"],
      readerNotes:[`Робоча частина: початково ${ladder.classMinimumGearCount}, прийнято ${ladder.workingGearCount}; окрема крейсерська передача. Ручне число — загальна кількість, разом із крейсерською.`,
        ...(ladder.constructionMinimumGearCount?[`Цілі зуби потребують щонайменше ${ladder.constructionMinimumGearCount-1} робочих передач.`]:[])],
      assumptions:[],limitations:ladder.limitations||[]
    };
    if (["endpoint-and-shift-coverage", "integer-gearset-adopted"].includes(ladder.method)) return {
      id: "gear-count", title: "Кількість передач за діапазоном редукції та кроком перемикання",
      purpose: "Span the two designed endpoints with sufficient overlap and the declared class architecture.",
      output: { id: "value.gear-count", symbol: "n", label: "Gear count", valueType: "integer", canonicalUnit: "1" },
      expression: ladder.constructionMinimumGearCount ? "max(n_class, n_teeth, ceil(1+ln(u_first_required/u_top_required)/ln(s_allowed)))"
        : "max(n_class, ceil(1+ln(u_first_required/u_top_required)/ln(s_allowed)))",
      dependencies: ["value.first-gear-ratio", "value.maximum-transmission-ratio", "value.final-drive-ratio", "decision.transfer-case-ratio",
        "decision.top-gear-ratio", "value.traction-characteristic-engine", "input.vehicle-category", ...(ladder.countIsAdopted ? ["input.gear-count"] : []),
        ...(ladder.inspection?.rows?.[0]?.hubRatio && ladder.inspection.rows[0].hubRatio !== 1 ? ACTUAL_HUB_DEPENDENCIES : [])],
      equationNumber: "4.18",
      formulaTex: "s_{\\max}=\\min(s_{\\mathrm{клас}},\\omega_{\\max}/\\omega_{\\mathrm{роб,min}}),\\quad n_{\\min}=\\max\\left(n_{\\mathrm{клас}},"
        + (ladder.constructionMinimumGearCount ? "n_Z," : "")
        + "\\left\\lceil1+\\frac{\\ln(u_{1,\\mathrm{потр}}/u_{n,\\mathrm{потр}})}{\\ln s_{\\max}}\\right\\rceil\\right)",
      substitutionTex: `\\begin{aligned}s_{\\max}&=\\min\\left(${texNumber(ladder.classMaximumStepRatio, 5)},\\frac{${texNumber(ladder.maximumAngularSpeed, 6)}}{${texNumber(ladder.minimumLoadedAngularSpeed, 6)}}\\right)=${texNumber(ladder.maximumStepRatio, 6)}\\\\[3pt]`
        + `n_{\\mathrm{смуга}}&=1+\\frac{\\ln(${texNumber(ladder.designFirstGearRatio, 6)}/${texNumber(ladder.designTopGearRatio, 6)})}{\\ln(${texNumber(ladder.maximumStepRatio, 6)})}=${texNumber(ladder.exactCount, 4)}\\\\[3pt]`
        + `n_{\\min}&=\\max\\left(${ladder.classMinimumGearCount},${ladder.constructionMinimumGearCount ? `${ladder.constructionMinimumGearCount},` : ""}\\left\\lceil${texNumber(ladder.exactCount, 4)}\\right\\rceil\\right)=${ladder.minimumRequiredCount},\\quad n=${ladder.gearCount}\\end{aligned}`,
      result: { value: ladder.gearCount, canonicalUnit: "1", displayUnit: "передач" }, method: ladder.method,
      sourceRefs: ["source.project-derivation"], assumptions: [],
      readerNotes: ["Крайні передачі визначені перед вибором кількості. Початкова архітектура класу та допустимий крок — проєктні припущення, а не універсальна вимога до числа передач.",
        ...(ladder.constructionMinimumGearCount ? [`n_Z=${ladder.constructionMinimumGearCount} — нижня межа після невдалого підбору цілих зубів для попереднього ряду; це результат перевірки конструктивної здійсненності, а не інша початкова кількість передач класу.`] : []),
        `Найменші оберти після перемикання при граничних обертах: ${plainNumber(ladder.afterShiftAngularSpeed*30/Math.PI,0)} об/хв. ${(ladder.speedBandCovered ?? ladder.designValid) ? "Обмеження кроку виконано." : "Прийнятий ряд НЕ задовольняє обмеження кроку."}`,
        ...(ladder.integerSelection?.defined ? ["n_min спочатку визначено за потрібними крайніми числами; прийнятий цілий зубчастий ряд перевірено окремо за фактичним максимальним кроком."] : [])],
      limitations: ladder.limitations || []
    };
    return {
      id: "gear-count",
      title: "Кількість передач коробки",
      purpose: "Report the course-model speed-band count; this is not a complete transmission selection.",
      output: {
        id: "value.gear-count",
        symbol: "n",
        label: "Gear count",
        valueType: "integer",
        canonicalUnit: "1"
      },
      expression: "ceil((lg(u_top) - lg(u_first)) / lg(omega_M / omega_max) + 1)",
      dependencies: [
        "value.first-gear-ratio",
        "decision.top-gear-ratio",
        "value.traction-characteristic-engine",
        ...(ladder.countIsAdopted ? ["input.gear-count"] : [])
      ],
      equationNumber: "4.18",
      formulaTex: "q=\\frac{\\omega_M}{\\omega_{\\max}},\\qquad "
        + "n=\\frac{\\lg u_{\\mathrm{к,min}}-\\lg u_{\\mathrm{к}1}}{\\lg q}+1",
      substitutionTex: `\\begin{aligned}q&=\\frac{${texNumber(ladder.angularSpeedAtMaxTorque, 5)}}{${texNumber(ladder.maximumAngularSpeed, 5)}}=${texNumber(ladder.progressionDenominator, 6)}\\\\[3pt]`
        + `n_{\\mathrm{розр}}&=\\frac{\\lg(${texNumber(ladder.topGearRatio, 6)})-\\lg(${texNumber(ladder.firstGearRatio, 6)})}{\\lg(${texNumber(ladder.progressionDenominator, 6)})}+1=${texNumber(ladder.exactCount, 4)},\\quad n=${texNumber(ladder.gearCount, 0)}\\end{aligned}`,
      result: { value: ladder.gearCount, canonicalUnit: "1", displayUnit: "передач" },
      method: ladder.countIsAdopted ? "project-input" : "ceiling-of-required-count",
      sourceRefs: ladder.countIsAdopted ? ["source.method.course", "source.project-input"]
        : ["source.method.course"],
      readerNotes: [
        ladder.countIsAdopted
          ? `Формула дає ${plainNumber(ladder.exactCount, 2)}, автор прийняв `
            + `${plainNumber(ladder.gearCount, 0)} передач.`
          : `Формула дає ${plainNumber(ladder.exactCount, 2)}, прийнято `
            + `${plainNumber(ladder.gearCount, 0)} — округлення вгору.`,
        "Це оцінка перекриття смуги обертів, а не перевірений вибір серійної коробки. "
          + "Окремо перевіряють рушання, мінімальну швидкість із замкненим зчепленням, "
          + "нагрів зчеплення, тягу після перемикань і тривалий режим максимальної швидкості.",
        ...(ladder.speedBandCovered === false
          ? ["Прийнятий ряд має перемикання з падінням обертів нижче ω_M; умову перекриття смуги не виконано."] : [])
      ],
      assumptions: [],
      limitations: []
    };
  }

  // Крайні передаточні числа ряду — окремими величинами.
  //
  // Розділ 11 бере з ряду два числа: найменше (верхня передача) для частоти
  // карданного вала і найбільше (перша передача) для розрахункового моменту.
  // Аркуш engdoc імпортує ЗНАЧЕННЯ, а не список, тому кожне з двох мусить
  // бути названим.
  //
  // Але це ПРИЙНЯТІ ЗНАЧЕННЯ, а не розрахунки: число дорівнює елементові
  // ряду, і жодної нової арифметики книжка з ними не набуває. Оформити їх
  // кроками означало б збільшити легасі-набір R-1 на два записи, які нічого
  // не рахують.
  //
  // Одноступеневий редуктор електропривода має обидва числа однакові, і це
  // правда про конструкцію, а не збіг.
  // Крайні передаточні числа ряду — ПСЕВДОНІМИ справжніх скалярів, а не
  // прихований Math.min по списку.
  //
  // Спершу я оформив їх прийнятими значеннями, у яких sourceValueRef указував
  // на value.gearbox-ladder. Це був не псевдонім, а брехня двічі: список і
  // число мають різний тип і різне значення, а саме число лічилося Math.min,
  // схованим усередині. Якби формула ряду змінилася, «псевдонім» лишився б
  // старим і ніхто б цього не побачив.
  //
  // Справжні скаляри існують. У коробки з передачами це decision.top-gear-ratio
  // (верхня передача) і value.first-gear-ratio (перша). В одноступеневого
  // редуктора електропривода обидва — це та сама прийнята редукція, і це
  // правда про конструкцію: верхня передача там і є першою.
  function ladderRatioAliases({ lowestOf, highestOf, singleStage = false } = {}) {
    if (!lowestOf || !highestOf) return [];
    const note = singleStage
      ? " Ступінь один, тож верхня передача і є першою."
      : "";
    return [
      {
        id: "value.gearbox-lowest-ratio",
        kind: "ValueAlias",
        symbol: "u_{\\mathrm{к}\\min}",
        label: "Lowest gearbox ratio",
        aliasOf: lowestOf,
        canonicalUnit: null,
        rationale: "Верхня передача — та, у якої передаточне число найменше; "
          + "саме на ній карданний вал крутиться найшвидше." + note,
        sourceRefs: ["source.project-derivation"]
      },
      {
        id: "value.gearbox-highest-ratio",
        kind: "ValueAlias",
        symbol: "u_{\\mathrm{к}1}",
        label: "Highest gearbox ratio",
        aliasOf: highestOf,
        canonicalUnit: null,
        rationale: "Найбільша редукція задає найбільший момент на валу; для ДВЗ враховується також прийняте число заднього ходу, якщо його визначено." + note,
        sourceRefs: ["source.project-derivation"]
      }
    ];
  }

  function buildGearboxLadderStep({ ladder, texNumber }) {
    const adopted = ladder.integerSelection?.defined === true;
    const actualHubPresent = ladder.inspection?.rows?.[0]?.hubRatio !== undefined && ladder.inspection.rows[0].hubRatio !== 1;
    const modern = ["endpoint-and-shift-coverage", "integer-gearset-adopted"].includes(ladder.method);
    const numericalRows = [];
    if (modern) {
      const first = ladder.designFirstGearRatio;
      const top = ladder.workingTopRatio ?? ladder.designTopGearRatio;
      const workingCount = ladder.workingGearCount ?? ladder.gearCount;
      const target = (ladder.designRequiredGears || ladder.gears)[1];
      if (adopted && target) numericalRows.push(`u_{${target.gear},\\mathrm{потр}}&=${texNumber(first, 6)}\\left(\\frac{${texNumber(top, 6)}}{${texNumber(first, 6)}}\\right)^{\\frac{${target.gear}-1}{${workingCount}-1}}=${texNumber(target.ratio, 6)}`);
      const mesh = ladder.integerSelection?.mesh;
      const meshFactor = ladder.integerSelection?.pairsPerGear === 2
        ? `\\frac{${mesh.drivenTeeth}}{${mesh.drivingTeeth}}\\cdot` : "";
      for (const gear of ladder.gears) numericalRows.push(!adopted && ladder.economyGear && gear.gear === ladder.gearCount
        ? `u_${gear.gear}&=${texNumber(gear.ratio,6)}\\;\\text{(крейсерська)}` : adopted
        ? `u_{${gear.gear},\\mathrm{дійсн}}&=${gear.direct ? "1\\;\\text{(пряма)}" : `${meshFactor}\\frac{${gear.drivenTeeth}}{${gear.drivingTeeth}}=${texNumber(gear.ratio, 6)}`}`
        : `u_${gear.gear}&=${texNumber(first, 6)}\\left(\\frac{${texNumber(top, 6)}}{${texNumber(first, 6)}}\\right)^{\\frac{${gear.gear}-1}{${workingCount}-1}}=${texNumber(gear.ratio, 6)}`);
      const inspected = ladder.inspection?.rows || [];
      for (const row of inspected.filter((_, index) => index === 0 || index === inspected.length - 1)) {
        numericalRows.push(`u_{\\Sigma,${row.gear}}&=${texNumber(row.gearboxRatio, 6)}\\cdot${texNumber(row.transferRatio, 5)}\\cdot${texNumber(row.finalDriveRatio, 6)}\\cdot${texNumber(row.hubRatio ?? 1, 5)}=${texNumber(row.totalRatio, 6)}`);
      }
    }
    if (["endpoint-and-shift-coverage", "integer-gearset-adopted"].includes(ladder.method)) return {
      id: "gearbox-ladder", title: "Ряд передач і повний ланцюг редукції",
      purpose: "Publish adopted gearbox ratios separately from the final drive and total reduction.",
      output: { id: "value.gearbox-ladder", symbol: "u_{\\mathrm{к}j}", label: "Gearbox ratios", valueType: "list", canonicalUnit: null },
      expression: adopted ? "u_required_j=geometric target; u_actual_j=adopted integer gear product (direct=1); U_j=u_actual_j*u_transfer*u_final*u_hub" : "u_j=u_first*(u_top/u_first)^((j-1)/(n-1)); U_j=u_j*u_transfer*u_final*u_hub",
      dependencies: ["value.first-gear-ratio", "value.gear-count", "decision.top-gear-ratio", "value.final-drive-ratio", "decision.transfer-case-ratio",
        ...(adopted ? ["decision.gearbox-topology", "decision.gearbox-constant-mesh"] : []),
        ...(actualHubPresent ? ACTUAL_HUB_DEPENDENCIES : [])],
      equationNumber: "4.19",
      formulaTex: (ladder.economyGear ? String.raw`u_j=u_1(u_w/u_1)^{(j-1)/(n_w-1)}\ (j\le n_w),\quad u_n=\omega_{\mathrm{екон}}r/(V_cu_0u_{\mathrm{рк}}u_{\mathrm{hub}}),\quad u_{j,\mathrm{дійсн}}=\prod Z_{\mathrm{ведених}}/Z_{\mathrm{ведучих}}` : adopted
        ? "u_{j,\\mathrm{потр}}=u_{1,\\mathrm{потр}}\\left(\\frac{u_{n,\\mathrm{потр}}}{u_{1,\\mathrm{потр}}}\\right)^{\\frac{j-1}{n-1}},\\quad u_{j,\\mathrm{дійсн}}=\\prod\\frac{Z_{\\mathrm{ведених}}}{Z_{\\mathrm{ведучих}}},\\quad u_{\\Sigma,j}=u_{j,\\mathrm{дійсн}}u_{\\mathrm{рк}}u_0u_{\\mathrm{hub}}"
        : "u_j=u_1\\left(\\frac{u_n}{u_1}\\right)^{\\frac{j-1}{n-1}},\\qquad u_{\\Sigma,j}=u_j u_{\\mathrm{рк}}u_0u_{\\mathrm{hub}}")
        + (actualHubPresent ? `,\\quad ${ACTUAL_HUB_FORMULA_TEX}` : ""),
      substitutionTex: `\\begin{aligned}${numericalRows.join("\\\\[3pt]")}\\end{aligned}`,
      result: { value: ladder.gears.map(g=>({gear:g.gear,ratio:g.ratio})), canonicalUnit: null, displayUnit: "" },
      method: ladder.method, sourceRefs: ["source.project-derivation"], assumptions: [],
      readerNotes: [...(ladder.economyGear ? [`Ряд містить ${ladder.workingGearCount} робочих передач і окрему крейсерську. Цільову максимальну швидкість перевірено на передачі ${ladder.inspection?.targetSpeedGear ?? "—"}; вона не обов’язково остання.`] : []), "u_j — тільки коробка; u₀ — головна передача; u_рк — активний діапазон роздавальної коробки; u_hub — колісний редуктор (1, коли відсутній). Швидкості відповідають замкненому приводу.",
        ...(actualHubPresent ? [ACTUAL_HUB_NOTE] : []),
        ...(adopted ? ["Геометрична прогресія задає потрібний ряд. Прийнятий ряд отримано з цілих зубів (пряма передача = 1), тому його кроки можуть різнитися. Тяга, швидкість, перемикання й деталі використовують саме прийнятий ряд, який повторно перевірено."] : []),
        ...(ladder.inspection?.rows || []).map(r=>`Передача ${r.gear}: коробка ${plainNumber(r.gearboxRatio,3)} × роздавальна ${plainNumber(r.transferRatio,3)} × головна ${plainNumber(r.finalDriveRatio,3)} × колісна ${plainNumber(r.hubRatio ?? 1,3)} = повна ${plainNumber(r.totalRatio,3)}; холостий хід ${plainNumber(r.idleSpeedKmh ?? r.minSpeedKmh,2)} км/год, робоча смуга ${plainNumber(r.minimumSpeedKmh ?? r.minSpeedKmh,2)}–${plainNumber(r.maximumSpeedKmh ?? r.maxSpeedKmh,2)} км/год.`),
        ladder.inspection?.valid
          ? `Кінематичне перекриття, повзучий хід і верхню швидкість перевірено.${ladder.inspection.forceCheckAvailable ? " Перевірено запас сили на переходах та на цільовій швидкості." : " Перевірка сили ще не виконана."}`
          : `Вимоги не виконані або ще не перевірені: ${(ladder.inspection?.failures || []).join(", ")}.`],
      limitations: [...(ladder.limitations || []), ...(ladder.inspection?.limitations || [])]
    };
    const list = ladder.gears.map(gear => {
      const first = texNumber(ladder.firstGearRatio, 6);
      const top = texNumber(ladder.topGearRatio, 6);
      const n = ladder.gearCount, j = gear.gear;
      const numeric = ladder.topGearIsDirect
        ? `${first}^{\\frac{${n}-${j}}{${n}-1}}${ladder.topGearRatio === 1 ? "" : `\\cdot${top}^{\\frac{${j}-1}{${n}-1}}`}`
        : j === n ? `${top}\\;\\text{(прийнято)}` : `${first}^{\\frac{${n}-${j}-1}{${n}-2}}`;
      return `u_{\\mathrm{к}${j}}&=${numeric}=${texNumber(gear.ratio, 6)}`;
    }).join("\\\\[3pt]");
    return {
      id: "gearbox-ladder",
      title: "Ряд передаточних чисел коробки передач",
      purpose: "Space the gears geometrically between the first and the top ratio.",
      output: {
        id: "value.gearbox-ladder",
        symbol: "u_{\\mathrm{к}j}",
        label: "Gearbox ratios",
        valueType: "list",
        canonicalUnit: null
      },
      expression: ladder.topGearIsDirect && ladder.topGearRatio === 1
        ? "u_k1^((n - j) / (n - 1))" : ladder.topGearIsDirect
        ? "u_first^((n-j)/(n-1))*u_top^((j-1)/(n-1))"
        : "j == n ? u_top : u_first^((n-j-1)/(n-2))",
      dependencies: [
        "value.first-gear-ratio",
        "value.gear-count",
        "decision.top-gear-ratio"
      ],
      equationNumber: "4.19",
      formulaTex: ladder.topGearIsDirect && ladder.topGearRatio === 1
        ? "u_{\\mathrm{к}j}=\\sqrt[n-1]{u_{\\mathrm{к}1}^{\\,n-j}}" : ladder.topGearIsDirect
        ? "u_{\\mathrm{к}j}=u_{\\mathrm{к}1}^{\\frac{n-j}{n-1}}u_{\\mathrm{к,min}}^{\\frac{j-1}{n-1}}"
        : "u_{\\mathrm{к}j}=u_{\\mathrm{к}1}^{\\frac{n-j-1}{n-2}}\\ (j<n),\\quad u_{\\mathrm{к}n}=u_{\\mathrm{к,min}}",
      substitutionTex: `\\begin{aligned}${list}\\end{aligned}`,
      result: {
        value: ladder.gears.map(gear => ({ gear: gear.gear, ratio: gear.ratio })),
        canonicalUnit: null,
        displayUnit: ""
      },
      method: ladder.topGearIsDirect && ladder.topGearRatio === 1
        ? "course-methodic-2-3-geometric-progression" : "project-prescribed-endpoint-progression",
      sourceRefs: ladder.topGearIsDirect && ladder.topGearRatio === 1
        ? ["source.method.course"] : ["source.method.course", "source.project-derivation"],
      readerNotes: [
        `Ряд побудовано для ${plainNumber(ladder.gearCount, 0)} передач між `
        + `u_к1 = ${plainNumber(ladder.firstGearRatio, 2)} та `
        + `u_к,min = ${plainNumber(ladder.topGearRatio, 2)}.`,
        ladder.topGearIsDirect
          ? "Ряд має n−1 геометричних інтервалів між прийнятими крайніми передаточними числами."
          : "До прямої передостанньої передачі — n−2 геометричних інтервали; остання дорівнює прийнятому u_к,min."
      ],
      assumptions: [
        "Прогресія геометрична: на кожному перемиканні двигун падає до тієї самої частоти."
      ],
      limitations: [
        // Ряд — вимога, а не наявна коробка: серійні коробки мають свої числа,
        // і найближчі з них зсунуть і тягу, і швидкість на кожній передачі.
        "Отримані числа — вимога до коробки, а не передаточні числа наявної: "
        + "серійний ряд дискретний.",
        "Прогресію застосовано до ступінчастої коробки ДВЗ; на односхідчастий "
        + "редуктор електроприводу вона не поширюється."
      ]
    };
  }

  // Коробка (редуктор) електричного привода — один або два ступені.
  //
  // Геометричну прогресію будують між першою й прямою передачами, і сенс вона
  // має лише для ДВЗ: його робочий діапазон вузький, тому передач багато.
  // Електромашина такого діапазону не має — передаточні числа для неї
  // ПРИЙМАЮТЬ, і документ не вдає, що вивів їх із джерела, яке про
  // електропривод не писало.
  //
  // Прямої передачі в редуктора немає: вали не співвісні, тому момент завжди
  // йде через пару шестерень.
  // Explicit gears are alternatives; the final drive is multiplied exactly once.
  function electricDriveRatios({ mode = "total", frontRatio, rearRatio, secondRatio,
    secondAxle = "rear", gears, finalDriveRatio, axle = "rear", activeGear = 1 }) {
    const read = value => value === null || value === undefined || String(value).trim() === ""
      ? null : Number(value);
    let reductions;
    if (mode === "gear-final") {
      const ratios = String(gears || "").split(/[;,\s]+/).filter(Boolean).map(Number);
      const final = read(finalDriveRatio);
      if (!["front", "rear"].includes(axle) || !(final > 0 && Number.isFinite(final))
        || ![1, 2].includes(ratios.length) || ratios.some(value => !(value > 0 && Number.isFinite(value)))
        || (ratios.length === 2 && ratios[0] <= ratios[1]))
        return { defined: false, reductions: [], reason: "Задайте одну або дві спадні передачі та додатну головну передачу." };
      reductions = [{ axle, ratios: ratios.map(value => value * final), gearRatios: ratios, finalDriveRatio: final }];
    } else if (mode === "total") {
      reductions = [["front", frontRatio], ["rear", rearRatio]]
        .filter(([, value]) => read(value) !== null)
        .map(([side, value]) => ({ axle: side, ratios: [read(value)] }));
      const second = read(secondRatio);
      if (second !== null) {
        const target = reductions.find(item => item.axle === secondAxle);
        // Older catalog inputs put the top-speed reduction first. Preserve
        // their order; only the explicit gear row requires descending gears.
        if (!target || !(second > 0 && Number.isFinite(second)) || second === target.ratios[0])
          return { defined: false, reductions: [], reason: "Друга редукція має бути додатною та відмінною від першої на вибраній осі." };
        target.ratios.push(second);
      }
    } else return { defined: false, reductions: [], reason: "Невідомий спосіб задання редукції." };
    if (reductions.some(item => item.ratios.some(value => !(value > 0 && Number.isFinite(value)))))
      return { defined: false, reductions: [], reason: "Редукції мають бути додатними скінченними числами." };
    const gear = Number(activeGear);
    if (![1, 2].includes(gear) || (gear === 2 && !reductions.some(item => item.ratios.length === 2)))
      return { defined: false, reductions: [], reason: "Вибрана передача відсутня у заданому ряді." };
    return { defined: true, mode, activeGear: gear,
      reductions: reductions.map(item => ({ ...item, value: item.ratios[Math.min(gear, item.ratios.length) - 1] })) };
  }

  function electricLadder({ reductionRatio, secondRatio, stageCount = 2 }) {
    const first = finiteNumber(reductionRatio);
    if (first === null || first <= 0) {
      return { defined: false, reason: "Потрібне додатне передаточне число редуктора." };
    }
    // Порожнє друге поле означає один ступінь; заповнене, але не число —
    // помилку, а не мовчазний перехід до одноступеневого.
    const blank = secondRatio === undefined || secondRatio === null
      || String(secondRatio).trim() === "";
    const second = blank ? null : finiteNumber(secondRatio);
    if (!blank && (second === null || second <= 0)) {
      return { defined: false, reason: "Друге передаточне число має бути додатним." };
    }
    if (second !== null && second === first) {
      return { defined: false, reason: "Два однакові ступені — це один ступінь." };
    }
    const ordered = second === null
      ? [first]
      : [Math.max(first, second), Math.min(first, second)];
    return {
      defined: true,
      gears: ordered.map((ratio, index) => ({ gear: index + 1, ratio })),
      gearCount: ordered.length,
      countIsAdopted: true,
      topGearIsDirect: false,
      firstGearRatio: ordered[0],
      topGearRatio: ordered[ordered.length - 1],
      // СТУПЕНІ — не передачі. Ступені перемножуються (i_g = i₁i₂) і момент
      // іде через обидва завжди; передачі вибирають. Кількість ступенів задає
      // схему: один — двовальна, два — тривальна, де перший ступінь стає
      // парою постійного зачеплення.
      stageCount: stageCount === 1 ? 1 : 2,
      topologyId: stageCount === 1 ? "two-shaft" : "three-shaft",
      method: "project-input"
    };
  }

  // Той самий вихід value.gearbox-ladder, але ПРИЙНЯТИЙ, а не виведений:
  // розділ 10 працює з ряду передаточних чисел, і йому байдуже, звідки той ряд
  // узявся, — а от документові не байдуже, і крок каже це прямо.
  function buildElectricLadderStep({ ladder, axleLabel, texNumber }) {
    if (!ladder?.defined) return null;
    const list = ladder.gears
      .map(gear => `u_{${gear.gear}}=${texNumber(gear.ratio, 2)}`)
      .join(",\\quad ");
    return {
      id: "gearbox-ladder",
      title: "Повні передаточні числа електричного привода",
      purpose: "Publish the declared motor-to-wheel reductions before separating any hub reducer.",
      output: {
        id: "value.gearbox-ladder",
        symbol: "u_{\\mathrm{к}j}",
        label: "Declared motor-to-wheel reductions",
        valueType: "list",
        canonicalUnit: null
      },
      expression: "adopted",
      dependencies: [],
      // Номера рівняння немає: нічого не виводять. Це прийняте значення.
      equationNumber: null,
      formulaTex: null,
      substitutionTex: list,
      result: {
        value: ladder.gears.map(gear => ({ gear: gear.gear, ratio: gear.ratio })),
        canonicalUnit: null,
        displayUnit: ""
      },
      method: "project-input",
      sourceRefs: ["source.project-input"],
      readerNotes: [
        "Ці числа охоплюють повний шлях електромашина–колесо. Якщо є колісний редуктор, число самої коробки та навантаження вала перед ним отримують діленням на прийняте колісне число один раз.",
        ladder.gearCount === 1
          ? `Одна вибирана передача${axleLabel ? ` ${axleLabel}` : ""}: `
            + "передаточне число одне, і воно прийняте в підрозділі 4.3."
          : `Дві вибирані передачі${axleLabel ? ` ${axleLabel}` : ""}: `
            + "обидва передаточні числа прийняті автором."
      ],
      assumptions: [],
      limitations: [
        // Геометрична прогресія (4.19) сюди не застосовна, і зробити вигляд,
        // що застосовна, було б підміною методу.
        "Ряд не виводять прогресією: вона розставляє передачі під вузький "
        + "робочий діапазон ДВЗ, а електромашина такого діапазону не має. "
        + "Передаточні числа тут приймає автор, і джерело цього випадку не "
        + "розглядає."
      ]
    };
  }

  // Electrical input ratios already include the entire motor-to-wheel path.
  // Component ratios are separated once here, then shared by tooth candidates
  // and the explicit canonical shaft endpoints below.
  function electricHardwareLadder({ ladder, wheelHubRatio = 1, finalDriveRatio = 1 }) {
    const hub = finiteNumber(wheelHubRatio);
    const final = finiteNumber(finalDriveRatio);
    if (!ladder?.defined || !(hub > 0 && final > 0) || !Array.isArray(ladder.gears)
      || !ladder.gears.length || ladder.gears.some(gear => !(finiteNumber(gear.ratio) > 0))) {
      return { defined: false, reason: "Для коробки електропривода потрібні повні передаточні числа й дійсна колісна редукція." };
    }
    const gears = ladder.gears.map(gear => ({ ...gear, motorToWheelRatio: gear.ratio,
      ratio: gear.ratio / (hub * final) }));
    return { ...ladder, gears, wheelHubRatio: hub, finalDriveRatio: final,
      firstGearRatio: Math.max(...gears.map(gear => gear.ratio)),
      topGearRatio: Math.min(...gears.map(gear => gear.ratio)),
      ratioScope: "gearbox-upstream-of-hub", method: final !== 1
        ? "declared-motor-total-divided-by-final-and-hub" : "declared-motor-total-divided-by-hub" };
  }

  function buildElectricGearboxEndpointSteps({ hardwareLadder, texNumber }) {
    if (!hardwareLadder?.defined || hardwareLadder.ratioScope !== "gearbox-upstream-of-hub") return [];
    const hub = hardwareLadder.wheelHubRatio;
    const final = hardwareLadder.finalDriveRatio || 1;
    const divisor = hub * final;
    return [["lowest", "min", hardwareLadder.topGearRatio, "найменше", "shaft maximum speed"],
      ["highest", "max", hardwareLadder.firstGearRatio, "найбільше", "shaft maximum torque"]]
      .map(([name, operation, value, label, purpose]) => ({
        id: `electric-gearbox-${name}-ratio`,
        title: `Число самої коробки електропривода: ${label}`,
        purpose: `Separate the adopted final drive and hub reduction from the motor-to-wheel endpoint for ${purpose}.`,
        output: { id: `value.electric-gearbox-${name}-ratio`, symbol: `u_{\\mathrm{к},${operation}}`,
          label: `${name} electric hardware gearbox ratio`, valueType: "number", canonicalUnit: null },
        expression: final !== 1
          ? `${operation}(declared motor-to-wheel ratios) / (adopted final drive * adopted hub ratio)`
          : `${operation}(declared motor-to-wheel ratios) / adopted hub ratio`,
        dependencies: ["value.gearbox-ladder", ...(hub !== 1 ? ACTUAL_HUB_DEPENDENCIES : []), ...(final !== 1 ? ["decision.electric-final-drive"] : [])],
        equationNumber: null,
        formulaTex: `u_{\\mathrm{к},${operation}}=\\frac{\\${operation}_j u_{\\mathrm{мотор-колесо},j}}{${final !== 1 ? "u_0\\," : ""}u_{\\mathrm{hub}}}`
          + (hub !== 1 ? `,\\quad ${ACTUAL_HUB_FORMULA_TEX}` : ""),
        substitutionTex: `u_{\\mathrm{к},${operation}}=\\frac{${texNumber(value * divisor, 4)}}{${texNumber(divisor, 4)}}=${texNumber(value, 4)}`,
        result: { value, canonicalUnit: null, displayUnit: null },
        method: hardwareLadder.method, sourceRefs: ["source.project-derivation"],
        readerNotes: ["Вал розглядають на виході коробки перед окремим колісним редуктором. Найменше число визначає його найбільшу частоту, найбільше — розрахунковий момент. Враховано всі оголошені вибирані передачі електропривода.",
          ...(hub !== 1 ? [ACTUAL_HUB_NOTE] : [])],
        assumptions: [final !== 1 ? `Окрема головна передача ${final} вилучена з повної редукції рівно один раз.`
          : "Для цієї гілки окрему головну й роздавальну передачі не прийнято; повна моторна редукція включає весь шлях до колеса."],
        limitations: ["Це потрібна редукція коробки з оголошеної моторної кінематики. Кандидати цілих зубів електричного редуктора ще не прийняті в тяговому шляху; їх конструктивний розрахунок залишається попереднім."]
      }));
  }

  return Object.freeze({
    ladderRatioAliases,
    buildGearboxLadderStep,
    buildElectricLadderStep,
    electricHardwareLadder,
    buildElectricGearboxEndpointSteps,
    electricLadder,
    electricDriveRatios,
    TOP_GEAR_RANGES,
    TRANSFER_CASE_LOW_RANGE,
    gearboxLadder,
    firstGearRatio,
    TRANSFER_CASE_RANGE,
    ROAD_RESISTANCE_RANGES,
    ADHESION_COEFFICIENT,
    ADHESION_BY_SURFACE,
    range,
    adhesionWeight,
    buildAdhesionWeightStep,
    minimumTransmissionRatio,
    buildMinimumRatioStep,
    finalDriveRatio,
    buildFinalDriveStep,
    maximumTransmissionRatio,
    buildAdhesionForceStep,
    buildRoadRequiredRatioStep,
    buildAdhesionRatioStep,
    buildMaximumRatioStep,
    buildFirstGearStep,
    buildGearCountStep
  });
}
