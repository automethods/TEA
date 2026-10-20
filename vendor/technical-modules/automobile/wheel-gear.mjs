"use strict";

// Розділ 23 — колісні передачі (колісні редуктори).
//
// Метод із методичних вказівок, кінець підрозділу 4.1.6, друковані с. 55—57,
// звірені з рендером сторінок, а дві формули — при 600 dpi.
//
// Дві розбіжності друку, обидві перевірені на зображенні сторінки:
//   [σ] = 1000 ГПа — одиниця помилкова; за гігапаскалями міжосьова відстань
//     виходить у тисячу разів меншою й дорівнює часткам міліметра;
//   D_по = 2Z_по/(U+1) — тут має стояти a_w, а не число зубів: інакше модуль
//     m = D_по/Z_по = 2/(U+1) не залежав би від розмірів передачі, а
//     міжосьова відстань, порахована рядком вище, ніде б не використалася.
//
// І третє, важливіше за обидва. Навіть з виправленою одиницею надрукований
// вираз дає міжосьову відстань у 350—500 мм там, де справжній колісний
// редуктор має 60—100. Що саме в ньому не так — стала K_a, показник кореня чи
// щось третє — з джерела не випливає, і документ цього не домислює.
//
// Натомість він бере правило, яке вже перевірене в цьому ж проєкті й походить
// із тієї самої методології: Опанасюк, с. 33, a_w ≈ k_α·∛M, k_α = 8,6…9,6
// (розділ 10 рахує ним міжосьову відстань коробки передач). Прикладене до
// моменту, що припадає на ОДИН сателіт, воно дає розміри справжнього
// редуктора. Надрукований вираз лишається в кроці як звірка — з обома
// числами поряд.
export function createWheelGear({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;

  const { finiteNumber, plainNumber } = (function loadNumeric() {
    const scope = typeof window === "object" ? window : globalThis;
    if (!scope.VehicleNumeric && typeof module === "object" && module.exports) {
      require("./numeric.js");
    }
    return scope.VehicleNumeric;
  })();

  const SOURCE_REFS = Object.freeze(["source.method.course"]);
  // Розрахункове значення міжосьової відстані спирається на Опанасюка.
  const BOTH_SOURCE_REFS = Object.freeze([
    "source.method.course", "source.method.opanasyuk"
  ]);

  // Опанасюк, с. 33: a_w ≈ k_α·∛M, момент у Н·м, відстань у міліметрах. Ті
  // самі числа, якими розділ 10 рахує коробку передач.
  const TORQUE_CENTRE_FACTOR = Object.freeze({ min: 8.6, max: 9.6 });

  const MIN_SUN_TEETH = 12;
  const CENTRE_DISTANCE_FACTOR = 4950;
  const LOAD_SPREAD = Object.freeze({ min: 1.1, max: 1.2 });
  const LOAD_CONCENTRATION = Object.freeze({ min: 1.05, max: 1.08 });
  // ψ_a = 0,5 при U_p ≤ 6,8; 0,4 при U_p > 6,8. Друк подає саме 6,8 —
  // текстовий шар djvu показував тут 6,3.
  const WIDTH_FACTOR_BREAK = 6.8;
  const WIDTH_FACTOR = Object.freeze({ narrow: 0.4, wide: 0.5 });
  const ALLOWED_CONTACT_MPA = 1000;
  const PRINTED_ALLOWED_CONTACT = "1000 ГПа";
  const WIDTH_STEP = Object.freeze({ min: 1.04, max: 1.05 });
  // Стандартний ряд міжосьових відстаней, друковані с. 56.
  const CENTRE_DISTANCE_SERIES = Object.freeze([40, 50, 63, 71, 80, 90, 100, 112,
    125, 140, 160, 180, 200, 225, 250, 280, 315]);
  // Ряд модулів — той самий, що в розділі 10 (таблиця 15).
  const MODULE_SERIES = Object.freeze([2.0, 2.25, 2.5, 2.75, 3.0, 3.5, 4.0, 4.5,
    5.0, 5.5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18]);

  const midpoint = range => (range.min + range.max) / 2;

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

  function widthFactor(ratio) {
    const value = finiteNumber(ratio);
    if (value === null || value <= 1) return null;
    return value <= WIDTH_FACTOR_BREAK ? WIDTH_FACTOR.wide : WIDTH_FACTOR.narrow;
  }

  // Рівновіддалене значення беруть БІЛЬШЕ: обидві величини, які тут
  // округлюють, є нижніми межами (джерело пише a_w ≥ …), і на нічиїй
  // округлення вниз порушувало б саму нерівність.
  function nearestFromSeries(value, series) {
    return series.reduce((best, candidate) =>
      (Math.abs(candidate - value) <= Math.abs(best - value) ? candidate : best));
  }

  // Z_по ≥ 12; Z_k = Z_по(U_p − 1), кратне кількості сателітів.
  function teeth({ sunTeeth, ratio, satelliteCount }) {
    const sun = finiteNumber(sunTeeth);
    const gearRatio = finiteNumber(ratio);
    const satellites = finiteNumber(satelliteCount);
    if ([sun, gearRatio, satellites].some(value => value === null || value <= 0)) {
      return { defined: false, reason: "Потрібні зуби центральної шестірні, передаточне число й кількість сателітів." };
    }
    if (!Number.isSafeInteger(sun) || !Number.isSafeInteger(satellites)) {
      return { defined: false, reason: "Зуби й сателіти рахують цілими." };
    }
    if (sun < MIN_SUN_TEETH) {
      return {
        defined: false,
        reason: `Джерело вимагає Z_по ≥ ${MIN_SUN_TEETH}, а взято ${sun}.`
      };
    }
    if (gearRatio <= 1) {
      return { defined: false, reason: "Передаточне число редуктора має бути більшим за одиницю." };
    }
    const raw = sun * (gearRatio - 1);
    // Округлюють до цілого, кратного кількості сателітів.
    const ring = Math.round(raw / satellites) * satellites;
    if (!(ring > sun)) {
      return {
        defined: false,
        reason: "Коронна шестірня вийшла не більшою за центральну: передаточне "
          + "число замале для такої схеми."
      };
    }
    // KHK Gear Systems, §17.1, (17.1) and (17.3): the source's ring-count
    // divisibility rule alone does not establish a buildable planetary set.
    // Keep the author's sun and planet count; refuse an incompatible candidate.
    const planet = (ring - sun) / 2;
    const assembly = (ring + sun) / satellites;
    if (!Number.isSafeInteger(ring) || !Number.isSafeInteger(planet) || planet <= 0) {
      return { defined: false, reason: `Кандидат Zпо = ${sun}, Zк = ${ring} дає `
        + `Zс = (Zк − Zпо)/2 = ${planet}: сателіт повинен мати додатне ціле число зубів. `
        + "Змініть потрібне передаточне число, зуби центральної шестерні або кількість сателітів; "
        + "корекцію профілю ця попередня модель не задає." };
    }
    if (!Number.isSafeInteger(assembly)) {
      return { defined: false, reason: `Кандидат Zпо = ${sun}, Zк = ${ring} не дозволяє `
        + `рівномірно розмістити ${satellites} сателітів: (Zпо + Zк)/nс = ${assembly} не є цілим. `
        + "Самої кратності коронної шестерні кількості сателітів недостатньо; змініть вибрані параметри." };
    }
    return {
      defined: true,
      sunTeeth: sun,
      ringTeeth: ring,
      planetTeeth: planet,
      assemblyInteger: assembly,
      rawRingTeeth: raw,
      satelliteCount: satellites,
      ratio: gearRatio,
      // Передаточне число, яке справді дають прийняті зуби.
      actualRatio: 1 + ring / sun,
      divisibleBySatellites: ring % satellites === 0
    };
  }

  // a_w ≥ K_a(U_p − 1)·√(Ω·K_H·M_по/(n_c·ψ_a·[σ]²))
  function centreDistance({ ratio, halfShaftTorqueNm, satelliteCount, loadSpread,
    loadConcentration, allowedContactMpa = ALLOWED_CONTACT_MPA }) {
    const gearRatio = finiteNumber(ratio);
    const torque = finiteNumber(halfShaftTorqueNm);
    const satellites = finiteNumber(satelliteCount);
    const spread = finiteNumber(loadSpread);
    const concentration = finiteNumber(loadConcentration);
    const allowed = finiteNumber(allowedContactMpa);
    if ([gearRatio, torque, satellites, spread, concentration, allowed]
      .some(value => value === null || value <= 0)) {
      return { defined: false, reason: "Для міжосьової відстані бракує величин." };
    }
    if (gearRatio <= 1) {
      return { defined: false, reason: "Передаточне число редуктора має бути більшим за одиницю." };
    }
    const psi = widthFactor(gearRatio);
    const radicand = spread * concentration * torque
      / (satellites * psi * allowed ** 2);
    // Те, що дає надрукований вираз, — лишається як звірка.
    const printed = CENTRE_DISTANCE_FACTOR * (gearRatio - 1) * Math.sqrt(radicand);
    // Розрахункове значення: правило Опанасюка за моментом на ОДИН сателіт.
    // Момент ділиться між сателітами, і кожна пара сонце—сателіт передає
    // тільки свою частку; саме її і треба класти у вираз, розрахований на
    // одну зубчасту пару.
    const torquePerSatelliteNm = torque / satellites;
    const centreFactor = midpoint(TORQUE_CENTRE_FACTOR);
    const required = centreFactor * Math.cbrt(torquePerSatelliteNm);
    // Джерело каже округлювати до НАЙБЛИЖЧОГО значення ряду — і саме ж пише
    // a_w ≥ …, тобто задає нижню межу. Найближче знизу цю нерівність порушує,
    // а ряд грубий, тому знизу воно опиняється часто. Беруть перше значення
    // ряду, яке нерівність задовольняє, і показують поряд найближче: читач
    // бачить обидва й бачить, чому вони різні.
    const nearest = nearestFromSeries(required, CENTRE_DISTANCE_SERIES);
    const covering = CENTRE_DISTANCE_SERIES.find(candidate => candidate >= required);
    const adopted = covering
      ?? CENTRE_DISTANCE_SERIES[CENTRE_DISTANCE_SERIES.length - 1];
    return {
      defined: true,
      value: adopted,
      requiredMm: required,
      nearestMm: nearest,
      adoptedMm: adopted,
      roundedUpFromNearest: nearest !== adopted,
      printedMm: printed,
      torquePerSatelliteNm,
      centreFactor,
      centreFactorRange: TORQUE_CENTRE_FACTOR,
      // У скільки разів надрукований вираз більший за розрахункове значення.
      printedOverRequired: printed / required,
      widthFactor: psi,
      inSeries: covering !== undefined,
      seriesMax: CENTRE_DISTANCE_SERIES[CENTRE_DISTANCE_SERIES.length - 1],
      seriesMin: CENTRE_DISTANCE_SERIES[0],
      coversRequired: adopted >= required,
      allowedContactMpa: allowed,
      halfShaftTorqueNm: torque,
      satelliteCount: satellites,
      ratio: gearRatio
    };
  }

  // b_2 = ψ_a·a_w; b_c = (1,04…1,05)b_2; b_по = (1,04…1,05)b_c.
  // Ширини приходять двома скалярами: прийнятою відстанню й ψ_a. Доти сюди
  // передавали ВЕСЬ об'єкт міжосьової відстані й читали з нього приховане
  // поле widthFactor, хоча канонічне value.wheel-gear-centre-distance — це
  // одне число. ψ_a веде до передаточного числа, і тепер це видно і в
  // сигнатурі, і в оголошених залежностях кроку.
  function planetaryCentreMm({ moduleMm, sunTeeth, ringTeeth }) {
    return moduleMm * (sunTeeth + ringTeeth) / 4;
  }

  function widths({ centreDistanceMm, widthFactor, step, moduleMm, sunTeeth, ringTeeth }) {
    const module_ = finiteNumber(moduleMm);
    const sun = finiteNumber(sunTeeth);
    const ring = finiteNumber(ringTeeth);
    const fromModule = module_ > 0 && sun > 0 && ring > sun;
    const centre = fromModule ? planetaryCentreMm({ moduleMm: module_, sunTeeth: sun, ringTeeth: ring })
      : finiteNumber(centreDistanceMm);
    const psi = finiteNumber(widthFactor);
    const factor = finiteNumber(step);
    if ([centre, psi].some(value => value === null || value <= 0)) {
      return { defined: false, reason: "Міжосьової відстані або ψ_a ще немає." };
    }
    if (factor === null || factor <= 0) {
      return { defined: false, reason: "Множник ширини не прийнято." };
    }
    const ringWidthMm = psi * centre;
    const satelliteWidthMm = factor * ringWidthMm;
    const sunWidthMm = factor * satelliteWidthMm;
    return {
      defined: true, ringWidthMm, satelliteWidthMm, sunWidthMm, step: factor,
      centreDistanceMm: centre,
      fromModule, moduleMm: fromModule ? module_ : null,
      sunTeeth: fromModule ? sun : null, ringTeeth: fromModule ? ring : null,
      widthFactor: psi,
      value: sunWidthMm
    };
  }

  // Standard concentric planetary set: a = m(Zsun + Zring)/4, not the
  // external-pair relation formerly combined with its fixed-ring ratio.
  function gearModule({ centre, teethResult }) {
    if (!centre?.defined) {
      return { defined: false, reason: centre?.reason || "Міжосьової відстані ще немає." };
    }
    if (!teethResult?.defined) {
      return { defined: false, reason: teethResult?.reason || "Зубів ще немає." };
    }
    const sizingCentre = Math.max(centre.adoptedMm, centre.requiredMm ?? centre.adoptedMm);
    const sum = teethResult.sunTeeth + teethResult.ringTeeth;
    const raw = 4 * sizingCentre / sum;
    const adopted = MODULE_SERIES.find(value => value >= raw * (1 - 1e-12));
    if (!Number.isFinite(adopted)) return { defined: false, rawModuleMm: raw,
      inSeries: false, reason: `Потрібний модуль планетарного редуктора ${raw.toFixed(2)} мм `
        + `перевищує найбільший модуль ряду ${MODULE_SERIES.at(-1)} мм. Модуль і геометрію не прийнято.` };
    const actualCentreMm = planetaryCentreMm({ moduleMm: adopted,
      sunTeeth: teethResult.sunTeeth, ringTeeth: teethResult.ringTeeth });
    return {
      defined: true,
      value: adopted,
      pitchDiameterMm: adopted * teethResult.sunTeeth,
      planetPitchDiameterMm: adopted * teethResult.planetTeeth,
      ringPitchDiameterMm: adopted * teethResult.ringTeeth,
      requiredPitchDiameterMm: raw * teethResult.sunTeeth,
      actualCentreMm, sizingCentreMm: sizingCentre,
      actualRatio: teethResult.actualRatio,
      rawModuleMm: raw,
      adoptedModuleMm: adopted,
      inSeries: true,
      coversRequired: actualCentreMm >= sizingCentre * (1 - 1e-12),
      // Те, що дав би друк із Z_по замість a_w: модуль, який ні від чого не
      // залежить, крім передаточного числа.
      printedPitchDiameter: 2 * teethResult.sunTeeth / (centre.ratio + 1),
      printedModuleMm: 2 / (centre.ratio + 1)
    };
  }

  // Криві рисунка: міжосьова відстань проти моменту на півосі — розрахункова
  // (за Опанасюком, від моменту на сателіт) і за надрукованим у методичці
  // виразом. Різниця між ними і є те, про що каже розділ.
  function centreAgainstTorque({ ratio, satelliteCount, loadSpread, loadConcentration,
    allowedContactMpa = ALLOWED_CONTACT_MPA, from = 200, to = 4000, steps = 60 }) {
    const points = [];
    for (let index = 0; index <= steps; index += 1) {
      const halfShaftTorqueNm = from + (to - from) * index / steps;
      const centre = centreDistance({
        ratio, halfShaftTorqueNm, satelliteCount, loadSpread, loadConcentration,
        allowedContactMpa
      });
      if (!centre.defined) return [];
      points.push({
        halfShaftTorqueNm,
        centreMm: centre.requiredMm,
        printedCentreMm: centre.printedMm
      });
    }
    return points;
  }

  function buildTeethStep({ teethResult, texNumber }) {
    return {
      id: "wheel-gear-teeth",
      title: "Зуби колісного редуктора",
      purpose: "Fix the tooth counts of the wheel reduction gear.",
      output: {
        id: "value.wheel-gear-ring-teeth",
        symbol: "Z_k",
        label: "Wheel gear ring teeth",
        valueType: "float64",
        canonicalUnit: null
      },
      expression: "Z_sun * (U - 1)",
      dependencies: ["decision.wheel-gear-ratio", "decision.wheel-gear-satellites", "decision.wheel-gear-sun-teeth"],
      equationNumber: "23.1",
      formulaTex: "Z_{\\text{по}}\\ge12,\\qquad Z_k=Z_{\\text{по}}\\left(U_p-1\\right)",
      substitutionTex: `Z_k=${teethResult.sunTeeth}\\left(`
        + `${texNumber(teethResult.ratio, 2)}-1\\right)`
        + `=${texNumber(teethResult.rawRingTeeth, 1)}\\to${teethResult.ringTeeth}`,
      result: { value: teethResult.ringTeeth, canonicalUnit: null, displayUnit: "" },
      method: "sourced-formula",
      sourceRefs: [...SOURCE_REFS, "source.reference.khk-planetary-gears"],
      readerNotes: [
        `Центральна шестірня має не менше ${MIN_SUN_TEETH} зубів.`,
        `Після округлення за правилом методички перевірено цілі зуби сателіта `
        + `Zс = (Zк − Zпо)/2 = ${teethResult.planetTeeth} та рівномірне розміщення: `
        + `(Zпо + Zк)/nс = ${teethResult.assemblyInteger}. Самої кратності Zк кількості сателітів недостатньо (KHK, §17.1).`,
        `Прийняті зуби дають U_p = ${plainNumber(teethResult.actualRatio, 3)} замість `
        + `заданого ${plainNumber(teethResult.ratio, 3)} — це ціна округлення.`
      ],
      assumptions: ["Зуби перевірено для співвісної планетарної схеми зі стандартною геометрією, однаковим модулем і рівномірно розміщеними сателітами; корекцію профілю не задано."],
      limitations: ["Перевірено лише цілі числа зубів та фазову умову складання. Зазор між сусідніми сателітами, підрізання, інтерференцію, розподіл навантаження і міцність потрібно перевірити окремо."]
    };
  }

  function buildCentreStep({ centre, texNumber }) {
    return {
      id: "wheel-gear-centre-distance",
      title: "Попередня нижня межа міжосьової відстані колісної передачі",
      purpose: "Size the wheel gear from the half-shaft torque it must carry.",
      output: {
        id: "value.wheel-gear-centre-distance",
        symbol: "a_w",
        label: "Wheel gear centre distance",
        valueType: "quantity",
        canonicalUnit: "mm"
      },
      expression: "k * cbrt(M / n)",
      dependencies: ["value.half-shaft-design-torque", "decision.wheel-gear-ratio",
        "decision.wheel-gear-satellites", "decision.wheel-gear-allowed-contact"],
      equationNumber: "23.2",
      // Ширини виведено в окремий розрахунок разом із кроком ряду, який їх і
      // задає: тут лишається сама міжосьова відстань.
      formulaTex: "a_w\\approx k_{\\alpha}\\sqrt[3]{\\dfrac{M_{\\text{по}}}{n_c}}",
      substitutionTex: `a_w\\approx${texNumber(centre.centreFactor, 1)}`
        + `\\sqrt[3]{\\dfrac{${texNumber(centre.halfShaftTorqueNm, 0)}}`
        + `{${centre.satelliteCount}}}`
        + `=${texNumber(centre.requiredMm, 1)}\\to${centre.adoptedMm}\\ \\text{мм}`,
      result: { value: centre.adoptedMm, canonicalUnit: "mm", displayUnit: "мм" },
      method: "project-derivation",
      sourceRefs: BOTH_SOURCE_REFS,
      readerNotes: [
        "Міжосьову відстань рахують за правилом Опанасюка (с. 33): "
        + `a_w ≈ k_α·∛M, k_α = ${TORQUE_CENTRE_FACTOR.min}…${TORQUE_CENTRE_FACTOR.max}. `
        + "Перенесення правила для коробки передач на колісний редуктор — "
        + "проєктна аналогія для початкового вибору розміру, а не завершена "
        + "контактна перевірка цієї планетарної передачі.",
        `Момент кладуть НА ОДИН САТЕЛІТ: ${plainNumber(centre.halfShaftTorqueNm, 0)} / `
        + `${centre.satelliteCount} = ${plainNumber(centre.torquePerSatelliteNm, 0)} Н·м. `
        + "Для цієї попередньої оцінки прийнято рівний поділ моменту між "
        + "сателітами; нерівномірність навантаження потребує окремої перевірки.",
        `Надрукований у методичці вираз a_w ≥ K_a(U_p−1)√(ΩK_HM_по/(n_cψ_a[σ]²)) `
        + `дав би ${plainNumber(centre.printedMm, 0)} мм — у `
        + `${plainNumber(centre.printedOverRequired, 1)} раза більше. Причину `
        + "розбіжності — сталу, показник кореня чи інше припущення — тут не "
        + "встановлено. Сам розмір не доводить непридатності будь-якої "
        + "конструкції; обидва числа наведено для перевірки прийнятого методу.",
        `Джерело друкує [σ] = ${PRINTED_ALLOWED_CONTACT}; у порівняльній `
        + `підстановці прийнято ${ALLOWED_CONTACT_MPA} МПа. Це явно зазначене `
        + "виправлення одиниці не підтверджує решту друкованого виразу.",
        `Ряд міжосьових відстаней: ${CENTRE_DISTANCE_SERIES.join(", ")} мм. `
        + `Найближче до розрахункового — ${centre.nearestMm} мм; узято `
        + `${centre.adoptedMm} мм, бо a_w — нижня межа.`
      ],
      assumptions: [
        `Ω = ${LOAD_SPREAD.min}…${LOAD_SPREAD.max} і K_H = `
        + `${LOAD_CONCENTRATION.min}…${LOAD_CONCENTRATION.max} прийнято серединою `
        + "діапазонів."
      ],
      limitations: [
        "Відхилення від джерела: міжосьову відстань рахують за правилом "
        + "Опанасюка a_w ≈ k_α·∛(M_по/n_c), а не за виразом підрозділу 4.1.6. "
        + `Надрукований вираз дає ${plainNumber(centre.printedMm, 0)} мм проти `
        + `${plainNumber(centre.requiredMm, 0)} мм. Застосовність прийнятої `
        + "аналогії потребує окремої перевірки конкретного редуктора.",
        `Відхилення від джерела: у звірці [σ] прочитано як ${ALLOWED_CONTACT_MPA} МПа, `
        + `а не ${PRINTED_ALLOWED_CONTACT}.`,
        ...(centre.inSeries
          ? []
          : [`Розрахункова відстань ${centre.requiredMm.toFixed(0)} мм лежить поза `
            + `рядом ${centre.seriesMin}…${centre.seriesMax} мм, який подає саме `
            + "це джерело."]),
        ...(centre.roundedUpFromNearest
          ? [`Відхилення від джерела: найближче значення ряду `
            + `${centre.nearestMm} мм менше за розрахункове `
            + `${centre.requiredMm.toFixed(1)} мм, тому взято наступне — `
            + `${centre.adoptedMm} мм. Джерело велить округлювати до найближчого, `
            + "але саме воно ж пише a_w ≥ …, і найближче знизу цю нерівність "
            + "порушує."]
          : [])
      ]
    };
  }

  // Ширини вінців — власний результат. Прийнятий крок ширини рухає саме їх, а
  // не міжосьову відстань, до якої його було приписано.
  function buildWidthsStep({ widthsResult, texNumber }) {
    return {
      id: "wheel-gear-widths",
      title: "Ширини вінців колісної передачі",
      purpose: "Calculate successive gear widths with the adopted multiplier.",
      output: {
        id: "value.wheel-gear-widths",
        symbol: "b_{\\text{по}}",
        label: "Sun gear width",
        valueType: "quantity",
        canonicalUnit: "mm"
      },
      expression: widthsResult.fromModule ? "psi * m * (Zsun + Zring) / 4 * step^2" : "psi * a * step^2",
      // ψ_a походить від передаточного числа, тож воно теж названо: доти
      // множник читали прихованим полем об'єкта міжосьової відстані.
      dependencies: [...(widthsResult.fromModule
        ? ["value.wheel-gear-module", "value.wheel-gear-ring-teeth", "decision.wheel-gear-sun-teeth"]
        : ["value.wheel-gear-centre-distance"]), "decision.wheel-gear-ratio", "decision.wheel-gear-width-step"],
      equationNumber: "23.4",
      formulaTex: (widthsResult.fromModule
        ? "a_{\\mathrm{факт}}=\\dfrac{m(Z_{\\mathrm{по}}+Z_k)}{4},\\qquad " : "")
        + (widthsResult.fromModule ? "b_2=\\psi_aa_{\\mathrm{факт}},\\quad " : "b_2=\\psi_aa_w,\\quad ")
        + "b_c=\\left(1{,}04\\ldots1{,}05\\right)b_2,\\quad "
        + "b_{\\text{по}}=\\left(1{,}04\\ldots1{,}05\\right)b_c",
      substitutionTex: "\\begin{aligned}"
        + (widthsResult.fromModule
          ? `a_{\\mathrm{факт}}&=\\frac{${texNumber(widthsResult.moduleMm, 5)}\\cdot(${widthsResult.sunTeeth}+${widthsResult.ringTeeth})}{4}=${texNumber(widthsResult.centreDistanceMm, 5)}\\;\\mathrm{мм}\\\\[3pt]`
          : "")
        + `b_2&=${texNumber(widthsResult.widthFactor, 5)}\\cdot${texNumber(widthsResult.centreDistanceMm, 5)}=${texNumber(widthsResult.ringWidthMm, 5)}\\;\\mathrm{мм}\\\\[3pt]`
        + `b_c&=${texNumber(widthsResult.step, 5)}\\cdot${texNumber(widthsResult.ringWidthMm, 5)}=${texNumber(widthsResult.satelliteWidthMm, 5)}\\;\\mathrm{мм}\\\\[3pt]`
        + `b_{\\text{по}}&=${texNumber(widthsResult.step, 5)}\\cdot${texNumber(widthsResult.satelliteWidthMm, 5)}=${texNumber(widthsResult.sunWidthMm, 5)}\\;\\mathrm{мм}\\end{aligned}`,
      result: {
        value: widthsResult.sunWidthMm, canonicalUnit: "mm", displayUnit: "мм"
      },
      method: "project-derivation",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        ...(widthsResult.fromModule ? [`Ширини розраховано за фактичною відстанню ${plainNumber(widthsResult.centreDistanceMm,2)} мм після прийняття модуля й цілих зубів; попередню нижню межу з (23.2) повторно не приймають за готову геометрію.`] : []),
        "Ширини послідовно обчислено за прийнятим множником. Округлення "
        + "до окремого технологічного ряду тут не виконано; такий ряд і "
        + "остаточні розміри потрібно обґрунтувати при конструюванні.",
        `Коефіцієнт ширини ψ_a = ${widthsResult.widthFactor}: джерело подає `
        + `${WIDTH_FACTOR.wide} при U_p ≤ ${WIDTH_FACTOR_BREAK} і `
        + `${WIDTH_FACTOR.narrow} при більшому.`
      ],
      assumptions: [],
      limitations: []
    };
  }

  function buildModuleStep({ moduleResult, teethResult, texNumber }) {
    return {
      id: "wheel-gear-module",
      title: "Модуль коліс редуктора",
      purpose: "Get the module from the centre distance the gear was sized to.",
      output: {
        id: "value.wheel-gear-module",
        symbol: "m",
        label: "Wheel gear module",
        valueType: "quantity",
        canonicalUnit: "mm"
      },
      expression: "first preferred module >= 4 a_preliminary / (Zsun + Zring)",
      dependencies: ["value.wheel-gear-centre-distance",
        "decision.wheel-gear-sun-teeth", "value.wheel-gear-ring-teeth"],
      equationNumber: "23.3",
      formulaTex: "m_{\\mathrm{потр}}=\\dfrac{4a_{w,\\min}}{Z_{\\mathrm{по}}+Z_k},\\qquad m\\ge m_{\\mathrm{потр}}",
      substitutionTex: `m_{\\mathrm{потр}}=\\dfrac{4\\cdot${texNumber(moduleResult.sizingCentreMm, 2)}}`
        + `{${teethResult.sunTeeth}+${teethResult.ringTeeth}}=${texNumber(moduleResult.rawModuleMm, 2)}`
        + `\\to${moduleResult.adoptedModuleMm}\\ \\text{мм}`,
      result: {
        value: moduleResult.adoptedModuleMm, canonicalUnit: "mm", displayUnit: "мм"
      },
      method: "project-derivation",
      sourceRefs: [...SOURCE_REFS, "source.reference.khk-planetary-gears", "source.project-derivation"],
      readerNotes: [
        "Джерело друкує D_по = 2Z_по/(U_p + 1) — з ЧИСЛОМ ЗУБІВ у чисельнику. "
        + "Це не діаметр за розмірністю. Заміна Z_по на відстань виправляє розмірність, "
        + "але формула 2a_w/(U_p + 1) належить зовнішній парі, а не прийнятій планетарній схемі.",
        `По-перше, розмірність: 2Z_по/(U_p+1) — чисте число, а D_по — діаметр. `
        + `По-друге, наслідок: модуль вийшов би m = D_по/Z_по = 2/(U_p+1) = `
        + `${plainNumber(moduleResult.printedModuleMm, 3)} мм — однаковий для будь-якої `
        + "передачі з таким передаточним числом, хоч для легковика, хоч для "
        + "самоскида. А міжосьова відстань, порахована рядком вище, не "
        + "знадобилася б узагалі.",
        `Для планетарної схеми a_w = m(Zпо + Zс)/2 = m(Zпо + Zк)/4. `
        + `Прийнятий модуль дає aфакт = ${plainNumber(moduleResult.actualCentreMm,2)} мм, `
        + `Dпо = ${plainNumber(moduleResult.pitchDiameterMm,2)} мм, Dс = ${plainNumber(moduleResult.planetPitchDiameterMm,2)} мм, `
        + `Dк = ${plainNumber(moduleResult.ringPitchDiameterMm,2)} мм. Відношення зубів не змінюється: Uфакт = ${plainNumber(moduleResult.actualRatio,4)}.`,
        "Прийнято перший модуль ряду не менший за потрібний; фактичні діаметри, міжосьову відстань і ширини перераховано після цього прийняття."
      ],
      assumptions: [
        "Стандартна співвісна планетарна схема: коронна шестерня нерухома, вхід — центральна шестерня, вихід — водило. Модуль усіх трьох коліс однаковий, корекцію профілю не задано."
      ],
      limitations: [
        "Відхилення від джерела: замість числа зубів у формулі діаметра використано розмірну геометрію прийнятого планетарного зачеплення; зовнішню пару не змішують із планетарним передаточним числом.",
        "Модуль визначено за попередньою геометричною вимогою. Перевірку контакту, згину, підрізання, інтерференції й ресурсу колісного редуктора не виконано.",
        ...(moduleResult.inSeries
          ? []
          : [`Розрахунковий модуль ${moduleResult.rawModuleMm.toFixed(2)} мм лежить `
            + "поза рядом таблиці 15."])
      ]
    };
  }

  function decisionsFor({ ratio, satelliteCount, sunTeeth, allowedContact, widthStep }) {
    const decisions = [];
    [["decision.wheel-gear-ratio", "U_p", ratio, null, null],
      ["decision.wheel-gear-satellites", "n_c", satelliteCount, null, null],
      ["decision.wheel-gear-sun-teeth", "Z_{\\text{по}}", sunTeeth,
        { min: MIN_SUN_TEETH, max: MIN_SUN_TEETH }, null],
      ["decision.wheel-gear-allowed-contact", "\\left[\\sigma\\right]",
        allowedContact, { min: ALLOWED_CONTACT_MPA, max: ALLOWED_CONTACT_MPA }, "MPa"],
      ["decision.wheel-gear-width-step", "b_c/b_2", widthStep, WIDTH_STEP, null]]
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
          recommendedValue: range ? midpoint(range) : null,
          recommendedSourceRefs: SOURCE_REFS,
          rationale: adopted.method === "project-input"
            ? (range
              ? `Власне значення автора. Джерело подає ${range.min}…${range.max}.`
              : "Джерело залишає вибір за автором і числа не подає.")
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

  function diagnosticsFor({ centre, moduleResult }) {
    const out = [];
    if (centre?.defined && !centre.inSeries) {
      out.push({
        code: "WHEEL_GEAR_CENTRE_OUT_OF_SERIES",
        severity: "warning",
        message: `Міжосьова відстань ${centre.requiredMm.toFixed(0)} мм виходить за `
          + `ряд ${centre.seriesMin}…${centre.seriesMax} мм, який подає саме це `
          + `джерело: жодне його значення не задовольняє a_w ≥ `
          + `${centre.requiredMm.toFixed(0)} мм, і взято найбільше — `
          + `${centre.adoptedMm} мм. Момент на півосі `
          + `(${centre.halfShaftTorqueNm.toFixed(0)} Н·м) завеликий для колісного `
          + "редуктора з такою кількістю сателітів: додайте сателітів, і момент "
          + "на кожну пару поділиться.",
        details: { node: "calc.wheel-gear-centre-distance" }
      });
    }
    if (centre?.defined && centre.printedOverRequired > 1.5) {
      out.push({
        code: "WHEEL_GEAR_PRINTED_CENTRE_DISTANCE_DIFFERS",
        // Не дефект проєкту, а різниця між двома джерелами, названа числом.
        severity: "info",
        message: `Надрукований у підрозділі 4.1.6 вираз дає міжосьову відстань `
          + `${centre.printedMm.toFixed(0)} мм — у `
          + `${centre.printedOverRequired.toFixed(1)} раза більше за `
          + `${centre.requiredMm.toFixed(0)} мм, які дає правило Опанасюка за `
          + "моментом на сателіт. Справжній колісний редуктор має 60…100 мм, "
          + "тому розрахунок ведуть за другим, а перше показують поряд.",
        details: { node: "calc.wheel-gear-centre-distance" }
      });
    }
    if (moduleResult?.defined && !moduleResult.inSeries) {
      out.push({
        code: "WHEEL_GEAR_MODULE_OUT_OF_SERIES",
        severity: "warning",
        message: `Розрахунковий модуль ${moduleResult.rawModuleMm.toFixed(2)} мм лежить `
          + "поза рядом таблиці 15.",
        details: { node: "calc.wheel-gear-module" }
      });
    }
    return out;
  }

  return Object.freeze({
    SOURCE_REFS,
    MIN_SUN_TEETH,
    CENTRE_DISTANCE_FACTOR,
    LOAD_SPREAD,
    LOAD_CONCENTRATION,
    WIDTH_FACTOR_BREAK,
    WIDTH_FACTOR,
    ALLOWED_CONTACT_MPA,
    PRINTED_ALLOWED_CONTACT,
    WIDTH_STEP,
    CENTRE_DISTANCE_SERIES,
    MODULE_SERIES,
    TORQUE_CENTRE_FACTOR,
    midpoint,
    adoptRange,
    widthFactor,
    nearestFromSeries,
    centreAgainstTorque,
    teeth,
    centreDistance,
    widths,
    gearModule,
    buildTeethStep,
    buildCentreStep,
    buildWidthsStep,
    buildModuleStep,
    decisionsFor,
    diagnosticsFor
  });
}
