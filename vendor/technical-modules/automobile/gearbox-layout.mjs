"use strict";

// Розділ 10.4 — міжосьова відстань і осьовий розмір коробки.
//
// Тут книжки йдуть РІЗНИМИ шляхами до того самого числа, і це рідкісний
// подарунок: одну відстань можна порахувати двічі незалежно й порівняти.
//
//   • курсова методичка виводить її з геометрії: колеса вже мають модуль і
//     числа зубів, а відстань між осями — це сума ділильних радіусів;
//   • Опанасюк дає емпіричну формулу (53) від моменту на веденому валу:
//     a_w ≈ k_α·∛M_вих, де k_α залежить лише від типу автомобіля.
//
// Жодна не «правильніша». Прийнята — та, що з вибраного методу; друга стоїть
// поряд як перевірка, і розбіжність між ними сама по собі щось каже про
// конструкцію.
export function createGearboxLayout({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;


  // Опанасюк, с. 33: коефіцієнт залежить від типу автомобіля.
  const CENTRE_DISTANCE_FACTOR = Object.freeze({
    passenger: { min: 8.9, max: 9.3 },
    goods: { min: 8.6, max: 9.6 }
  });

  // Опанасюк, (54): частки від міжосьової відстані.
  const AXIAL_PROPORTIONS = Object.freeze({
    gearRimWidth: { min: 0.19, max: 0.25 },
    bearingWidth: { min: 0.20, max: 0.28 },
    synchroniserWidth: { min: 0.45, max: 0.78 }
  });

  // Два шляхи — два РІЗНІ джерела, і змішувати їхні посилання не можна.
  //
  // Геометричний шлях курсова методичка лише ПРИЗНАЧАЄ («знаходять… відстань
  // між осями валів»), але окремого рівняння не друкує — сама рівність
  // a_w = m·ΣZ/(2cosβ′) є стандартною геометрією евольвентного зачеплення.
  // Тому крок позначено як побудову проєкту, а книжку названо там, де вона
  // справді щось каже: у тому, що цим шляхом треба йти.
  const GEOMETRIC_SOURCE_REFS = Object.freeze(["source.project-derivation"]);
  const EMPIRICAL_SOURCE_REFS = Object.freeze(["source.method.opanasyuk"]);

  // Переліки, які документ знає. Значення поза ними — не «щось інше», а
  // НЕВІДОМЕ, і мовчки підставляти замість нього найпоширеніший випадок
  // означає видати неперевірене за пораховане.
  const TOPOLOGIES = Object.freeze(["three-shaft", "two-shaft"]);
  const VEHICLE_TYPES = Object.freeze(["passenger", "goods", "offRoad"]);
  const GOODS_TYPES = Object.freeze(["goods", "offRoad"]);

  function finiteNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") return null;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  // Шлях курсової методички: відстань між осями — це сума ділильних радіусів
  // пари, а вони вже відомі з модуля й чисел зубів.
  function geometricCentreDistance({ moduleMm, teethSum, helixAngleDeg }) {
    const m = finiteNumber(moduleMm);
    const sum = finiteNumber(teethSum);
    const beta = finiteNumber(helixAngleDeg);
    if (m === null || sum === null || beta === null || m <= 0 || sum <= 0) {
      return { defined: false, reason: "Потрібні модуль, сума зубів і кут нахилу." };
    }
    return {
      defined: true,
      centreDistanceMm: m * sum / (2 * Math.cos(beta * Math.PI / 180)),
      // Крок згодом друкує підстановку, тому величини, з яких вийшло число,
      // повертаються разом із ним — щоб їх не довелося шукати вдруге.
      moduleMm: m,
      teethSum: sum,
      helixAngleDeg: beta,
      method: "from-gear-geometry"
    };
  }

  // Шлях Опанасюка: емпірично від моменту на веденому валу.
  function empiricalCentreDistance({ outputTorqueNm, vehicleType, basis, manualFactor,
    topologyId }) {
    // Схема має бути ВІДОМОЮ. Раніше перевірка звучала «задана і не тривальна»,
    // тому і відсутня схема, і схема з опискою потрапляли в тривальну гілку.
    if (!TOPOLOGIES.includes(topologyId)) {
      return {
        defined: false,
        reason: topologyId
          ? `Схема коробки «${topologyId}» документу не відома.`
          : "Схему коробки не вибрано."
      };
    }
    // Сторінка 33 починає речення з «Для тривальних коробок передач…». Це не
    // застереження дрібним шрифтом, а межа застосовності: для двовальної
    // коробки книжка цього числа не дає, і вигадувати його тут не можна.
    if (topologyId !== "three-shaft") {
      return {
        defined: false,
        outOfScope: true,
        reason: "Рівняння (53) надруковане лише для тривальних коробок передач. "
          + "Для цієї схеми джерело емпіричної оцінки не дає."
      };
    }
    // Книжка подає два діапазони k_α. Тип поза переліком не «легковий за
    // замовчуванням» — він невідомий, і коефіцієнта для нього немає.
    if (!VEHICLE_TYPES.includes(vehicleType)) {
      return {
        defined: false,
        reason: vehicleType
          ? `Тип автомобіля «${vehicleType}» документу не відомий.`
          : "Тип автомобіля не вибрано: від нього залежить коефіцієнт k_α."
      };
    }
    const torque = finiteNumber(outputTorqueNm);
    if (torque === null || torque <= 0) {
      return { defined: false, reason: "Момент на веденому валу не відомий." };
    }
    const range = GOODS_TYPES.includes(vehicleType)
      ? CENTRE_DISTANCE_FACTOR.goods
      : CENTRE_DISTANCE_FACTOR.passenger;

    let factor = null;
    if (basis === "source-midpoint") {
      factor = (range.min + range.max) / 2;
    } else if (basis === "project-input") {
      factor = finiteNumber(manualFactor);
      if (factor === null || factor <= 0) {
        return { defined: false, reason: "Вибрано власний коефіцієнт, але число не задано." };
      }
    } else {
      return {
        defined: false,
        reason: "Основа прийняття коефіцієнта має бути «source-midpoint» або "
          + "«project-input»."
      };
    }

    return {
      defined: true,
      // a_w ≈ k_α·∛M_вих: момент у Н·м, відстань у міліметрах.
      centreDistanceMm: factor * Math.cbrt(torque),
      factor,
      range,
      withinRange: factor >= range.min && factor <= range.max,
      method: "empirical-from-torque",
      // Як прийнято сам коефіцієнт — це інше питання, ніж яким виразом
      // пораховано відстань, і плутати їх в одному полі не можна.
      factorMethod: basis === "source-midpoint" ? "profile-midpoint" : "project-input"
    };
  }

  // Порівняння двох шляхів. Розбіжність не помилка — вона щось каже.
  //
  // ПРИЙНЯТА ЗАВЖДИ ГЕОМЕТРИЧНА, і вибраний метод цього не змінює. Після того
  // як модуль, сума зубів і кут нахилу прийняті, відстань між осями вже не
  // вибирають — вона визначена зачепленням. Прийняти 57,9 мм, маючи 63 зуби
  // при модулі 3, неможливо: колеса не зачепляться.
  //
  // Раніше тут «прийнятою» ставала емпірична, коли вибрано Опанасюка, а
  // осьовий розмір усе одно рахувався від геометричної. Документ міг
  // надрукувати як прийняту одну відстань, а розміри коробки взяти з іншої.
  // Вираз (53) — орієнтовна оцінка (книжка й сама пише «орієнтоване»), тобто
  // ПЕРЕВІРКА, і саме нею він тут і лишається.
  function centreDistanceComparison({ geometric, empirical }) {
    if (!geometric?.defined || !empirical?.defined) {
      return {
        defined: true,
        checked: false,
        reason: "Порівняти два шляхи не вийшло: "
          + [geometric, empirical].filter(item => !item?.defined)
            .map(item => item?.reason || "величини бракує").join("; ") + "."
      };
    }
    const difference = (geometric.centreDistanceMm - empirical.centreDistanceMm)
      / empirical.centreDistanceMm;
    return {
      defined: true,
      checked: true,
      adoptedMm: geometric.centreDistanceMm,
      checkMm: empirical.centreDistanceMm,
      geometricMm: geometric.centreDistanceMm,
      empiricalMm: empirical.centreDistanceMm,
      difference,
      // Дві незалежні оцінки в межах чверті одна від одної — звичайна річ для
      // попереднього розрахунку. Більша розбіжність означає, що прийняті
      // модуль і числа зубів дають коробку іншого розміру, ніж підказує досвід.
      close: Math.abs(difference) <= 0.25,
      reason: `За геометрією ${geometric.centreDistanceMm.toFixed(1)} мм, `
        + `за моментом ${empirical.centreDistanceMm.toFixed(1)} мм — різниця `
        + `${(difference * 100).toFixed(0)} %. `
        + (Math.abs(difference) <= 0.25
          ? "Два незалежні шляхи дають близькі числа."
          : "Розбіжність велика: прийняті модуль і числа зубів дають коробку "
            + "іншого розміру, ніж підказує емпірична оцінка. Це не помилка "
            + "розрахунку, а привід переглянути прийняте.")
    };
  }

  function comparisonDiagnostics(comparison) {
    if (!comparison?.checked || comparison.close) return [];
    return [{
      code: "GEARBOX_CENTRE_DISTANCE_DISAGREEMENT",
      severity: "info",
      message: comparison.reason,
      details: { node: "calc.gearbox-centre-distance" }
    }];
  }

  // Осьовий розмір по картеру, (54): l = m·в + n·B + c·H.
  //
  // Тут m — КІЛЬКІСТЬ зубчастих коліс, а не модуль: у джерела ті самі літери
  // означають різне в сусідніх рівняннях.
  function axialSize({ centreDistanceMm, gearCount, bearingCount, synchroniserCount }) {
    const a = finiteNumber(centreDistanceMm);
    const counts = {
      gearCount: finiteNumber(gearCount),
      bearingCount: finiteNumber(bearingCount),
      synchroniserCount: finiteNumber(synchroniserCount)
    };
    const missing = Object.entries(counts)
      .filter(([, value]) => value === null || value < 0 || !Number.isInteger(value))
      .map(([name]) => name);
    if (a === null || a <= 0) {
      return { defined: false, reason: "Міжосьова відстань не відома." };
    }
    if (missing.length) {
      return {
        defined: false,
        missing,
        reason: "Потрібні цілі кількості коліс, підшипників і муфт синхронізаторів."
      };
    }

    const middle = range => (range.min + range.max) / 2 * a;
    const rim = middle(AXIAL_PROPORTIONS.gearRimWidth);
    const bearing = middle(AXIAL_PROPORTIONS.bearingWidth);
    const synchroniser = middle(AXIAL_PROPORTIONS.synchroniserWidth);
    return {
      defined: true,
      gearRimWidthMm: rim,
      bearingWidthMm: bearing,
      synchroniserWidthMm: synchroniser,
      axialSizeMm: counts.gearCount * rim + counts.bearingCount * bearing
        + counts.synchroniserCount * synchroniser,
      counts
    };
  }


  // M_вих = M_e,max·u₁ — момент на веденому валу, у ньютон-метрах.
  function outputTorque({ engineTorqueNm, firstGearRatio }) {
    const torque = finiteNumber(engineTorqueNm);
    const ratio = finiteNumber(firstGearRatio);
    if (torque === null || ratio === null || torque <= 0 || ratio <= 0) {
      return { defined: false, reason: "Потрібні момент двигуна й передаточне "
        + "число першої передачі." };
    }
    return { defined: true, torqueNm: torque * ratio, engineTorqueNm: torque,
      firstGearRatio: ratio };
  }

  // Кількості для (54) читає зі схеми коробки — але схему автор ще тільки має
  // накреслити, тому це ПРОПОЗИЦІЯ, а не величина з джерела.
  function countsFromScheme({ topologyId, gearedGearCount, hasDirectGear }) {
    // Читання схеми залежить від самої схеми, тому невідома схема не може
    // мовчки означати тривальну.
    if (!TOPOLOGIES.includes(topologyId)) {
      return {
        defined: false,
        reason: topologyId
          ? `Схема коробки «${topologyId}» документу не відома.`
          : "Схему коробки не вибрано."
      };
    }
    const geared = finiteNumber(gearedGearCount);
    if (geared === null || geared < 0) {
      return { defined: false, reason: "Кількість передач із шестернями не відома." };
    }
    const total = geared + (hasDirectGear ? 1 : 0);
    return {
      defined: true,
      method: "derived-from-powertrain",
      // Тривальна: на первинному валу — шестерня постійного зачеплення, на
      // вторинному — по одній на кожну передачу, крім прямої.
      // Двовальна: на кожному валу по шестерні на передачу.
      gearCount: topologyId === "two-shaft" ? geared * 2 : 1 + geared,
      // По два підшипники на кожен із двох валів, які називає рівняння.
      bearingCount: 4,
      // Одна муфта вмикає дві передачі.
      synchroniserCount: Math.ceil(total / 2),
      reason: "Кількості прочитано з кінематичної схеми (рисунок 10.1)."
    };
  }

  function buildOutputTorqueNote(torque) {
    return `M_вих = ${torque.engineTorqueNm.toFixed(1)} · `
      + `${torque.firstGearRatio.toFixed(3)} = ${torque.torqueNm.toFixed(1)} Н·м`;
  }

  function buildGeometricStep({ geometric, moduleMm, teethSum, helixAngleDeg,
    texNumber }) {
    return {
      id: "gearbox-centre-distance",
      title: "Міжосьова відстань за геометрією коліс",
      purpose: "Знайти відстань між осями валів із розмірів шестерень, які вже "
        + "прийнято.",
      output: {
        id: "value.gearbox-centre-distance",
        symbol: "a_w",
        label: "Centre distance",
        valueType: "quantity",
        canonicalUnit: "mm"
      },
      expression: "a = m * Z / (2 * cos(beta))",
      dependencies: ["decision.gearbox-teeth", "value.gearbox-module", "decision.gearbox-helix-angle"],
      equationNumber: "10.7",
      formulaTex: "a_w=\\dfrac{m\\left(Z_1+Z_2\\right)}{2\\cos\\beta'}",
      substitutionTex: `a_w=\\dfrac{${texNumber(moduleMm, 1)}\\cdot `
        + `${texNumber(teethSum, 0)}}{2\\cos ${texNumber(helixAngleDeg, 0)}^\\circ}`
        + `=${texNumber(geometric.centreDistanceMm, 1)}\\ \\text{мм}`,
      result: {
        value: geometric.centreDistanceMm,
        canonicalUnit: "mm",
        displayUnit: "мм"
      },
      method: "project-derivation",
      sourceRefs: GEOMETRIC_SOURCE_REFS,
      readerNotes: [
        "Курсова методичка призначає саме цей шлях — відстань між осями "
        + "виводять із розмірів шестерень, — але окремого рівняння не друкує.",
        "Відстань одна на всю коробку: сума зубів у парах однакова, тому кожна "
        + "пара дає те саме число."
      ],
      assumptions: [],
      limitations: [
        "Рівність — стандартна геометрія евольвентного зачеплення, а не вираз "
        + "із книжки. Книжці належить вказівка, яким шляхом іти."
      ]
    };
  }

  function buildEmpiricalStep({ empirical, torque, vehicleType, texNumber }) {
    const range = empirical.range;
    return {
      id: "gearbox-centre-distance-empirical",
      title: "Міжосьова відстань за моментом",
      purpose: "Перевірити ту саму відстань незалежно — за емпіричним виразом "
        + "Опанасюка, який знає лише момент і тип автомобіля.",
      output: {
        id: "value.gearbox-centre-distance-empirical",
        symbol: "a_w'",
        label: "Centre distance from torque",
        valueType: "quantity",
        canonicalUnit: "mm"
      },
      expression: "a = k * cbrt(M)",
      dependencies: ["value.gearbox-ladder", "decision.gearbox-centre-distance-factor", ...(torque.governingRatioRef ? [torque.governingRatioRef] : [])],
      equationNumber: "10.8",
      formulaTex: "a_w\\approx k_\\alpha\\sqrt[3]{M_{\\text{вих}}},"
        + (torque.governingRatioRef === "value.governing-gearbox-ratio" ? "\\quad M_{\\text{вих}}=M_{e\\max}\\max(u_1,|u_R|)" : "\\quad M_{\\text{вих}}=M_{e\\max}u_1"),
      substitutionTex: `a_w\\approx ${texNumber(empirical.factor, 2)}`
        + `\\sqrt[3]{${texNumber(torque.torqueNm, 1)}}`
        + `=${texNumber(empirical.centreDistanceMm, 1)}\\ \\text{мм}`,
      result: {
        value: empirical.centreDistanceMm,
        canonicalUnit: "mm",
        displayUnit: "мм"
      },
      method: "sourced-formula",
      sourceRefs: EMPIRICAL_SOURCE_REFS,
      readerNotes: [
        buildOutputTorqueNote(torque),
        `k_α = ${range.min}…${range.max} — `
        + (vehicleType === "goods" || vehicleType === "offRoad"
          ? "вантажні автомобілі й автобуси." : "легкові автомобілі.")
      ],
      assumptions: [
        "Момент на веденому валу беруть за першою передачею — найбільший, який "
        + "коробка передає."
      ],
      limitations: [
        "Рівняння (53) надруковане лише для тривальних коробок передач.",
        "Це орієнтовне значення: книжка й сама пише «орієнтоване»."
      ]
    };
  }

  function buildAxialSizeStep({ size, counts, texNumber }) {
    return {
      id: "gearbox-axial-size",
      title: "Осьовий розмір коробки",
      purpose: "Оцінити довжину коробки по картеру — скільки місця вона займе "
        + "вздовж автомобіля.",
      output: {
        id: "value.gearbox-axial-size",
        symbol: "l",
        label: "Gearbox axial size",
        valueType: "quantity",
        canonicalUnit: "mm"
      },
      expression: "l = m * b + n * B + c * H",
      dependencies: ["decision.gearbox-axial-counts", "decision.gearbox-axial-proportions", "value.gearbox-centre-distance"],
      equationNumber: "10.9",
      formulaTex: "l=m\\text{в}+nB+cH",
      substitutionTex: `l=${counts.gearCount}\\cdot`
        + `${texNumber(size.gearRimWidthMm, 1)}+${counts.bearingCount}\\cdot`
        + `${texNumber(size.bearingWidthMm, 1)}+${counts.synchroniserCount}\\cdot`
        + `${texNumber(size.synchroniserWidthMm, 1)}`
        + `=${texNumber(size.axialSizeMm, 0)}\\ \\text{мм}`,
      result: {
        value: size.axialSizeMm,
        canonicalUnit: "mm",
        displayUnit: "мм"
      },
      method: "sourced-formula",
      sourceRefs: EMPIRICAL_SOURCE_REFS,
      readerNotes: [
        "Тут m — це КІЛЬКІСТЬ зубчастих коліс, а не модуль: у книжки та сама "
        + "літера означає різне в сусідніх рівняннях.",
        `Ширини взято серединами часток: в ≈ ${texNumber(size.gearRimWidthMm, 1)} мм, `
        + `B ≈ ${texNumber(size.bearingWidthMm, 1)} мм, `
        + `H ≈ ${texNumber(size.synchroniserWidthMm, 1)} мм.`
      ],
      assumptions: [
        "Кількості коліс, підшипників і муфт — на вторинному і первинному валах."
      ],
      limitations: [
        "Розмір по картеру, без стінок і фланців: справжня коробка довша.",
        // Не «слідує вибраному методу», а НЕ ЗАЛЕЖИТЬ від нього: рівняння (54)
        // друкує лише Опанасюк, курсова методичка осьового розміру окремим
        // виразом не подає. Мовчати про це означало б видати чужий вираз за
        // продовження вибраного методу.
        "Рівняння (54) друкує лише Опанасюк, тому цей крок не залежить від "
        + "вибраного методу коробки: курсова методичка осьового розміру "
        + "окремим виразом не подає.",
        ...(counts.method === "derived-from-powertrain"
          ? ["Кількості прочитано з кінематичної схеми (рисунок 10.1) за "
            + "числом передач; якщо конструкція від неї відступає, внесіть "
            + "їх вручну."]
          : [])
      ]
    };
  }

  function decisionsFor({ factor, vehicleType, counts, size }) {
    const decisions = [];
    if (factor?.defined) {
      const range = factor.range;
      decisions.push({
        id: "decision.gearbox-centre-distance-factor",
        kind: "Decision",
        choiceRef: null,
        symbol: "k_\\alpha",
        adoptedValue: factor.factor,
        canonicalUnit: null,
        method: factor.factorMethod,
        selectedReferenceId: null,
        recommendedValue: (range.min + range.max) / 2,
        recommendedSourceRefs: EMPIRICAL_SOURCE_REFS,
        rationale: factor.factorMethod === "project-input"
          ? `Власне значення автора. Книжка радить ${range.min}…${range.max} для `
            + (vehicleType === "goods" || vehicleType === "offRoad"
              ? "вантажних автомобілів і автобусів." : "легкових автомобілів.")
          : `Прийнято середину діапазону ${range.min}…${range.max}, який книжка `
            + "подає для цього типу автомобіля.",
        sourceRefs: factor.factorMethod === "project-input"
          ? ["source.project-input"] : EMPIRICAL_SOURCE_REFS,
        limitations: factor.withinRange
          ? []
          : ["Значення лежить поза діапазоном, який подає книжка."],
        manuallyOverridden: factor.factorMethod === "project-input"
      });
    }
    if (counts?.defined) {
      decisions.push({
        id: "decision.gearbox-axial-counts",
        kind: "Decision",
        choiceRef: null,
        symbol: "m,n,c",
        adoptedValue: `${counts.gearCount}/${counts.bearingCount}/`
          + `${counts.synchroniserCount}`,
        canonicalUnit: null,
        method: counts.method,
        selectedReferenceId: null,
        recommendedValue: null,
        recommendedSourceRefs: [],
        rationale: counts.method === "project-input"
          ? "Кількості внесено з накресленої кінематичної схеми."
          : "Кількості прочитано зі схеми коробки: шестерня постійного "
            + "зачеплення на первинному валу, по одній на кожну непряму "
            + "передачу на вторинному, по два підшипники на вал, одна муфта "
            + "на дві передачі.",
        sourceRefs: ["source.project-input"],
        limitations: counts.method === "project-input"
          ? []
          : ["Це читання схеми цим проєктом, а не число з книжки: справжню "
            + "конструкція може від неї відступати."],
        manuallyOverridden: counts.method === "project-input"
      });
    }
    if (size?.defined) {
      const band = range => `${range.min}…${range.max}`;
      decisions.push({
        id: "decision.gearbox-axial-proportions",
        kind: "Decision",
        choiceRef: null,
        symbol: "\\text{в}, B, H",
        adoptedValue: [size.gearRimWidthMm, size.bearingWidthMm,
          size.synchroniserWidthMm].map(value => Number(value.toFixed(2))).join(" / "),
        canonicalUnit: "mm",
        method: "profile-midpoint",
        selectedReferenceId: null,
        recommendedValue: null,
        recommendedSourceRefs: EMPIRICAL_SOURCE_REFS,
        rationale: "Прийнято середини часток, які подає (54): "
          + `в ≈ ${band(AXIAL_PROPORTIONS.gearRimWidth)}·a_w, `
          + `B ≈ ${band(AXIAL_PROPORTIONS.bearingWidth)}·a_w, `
          + `H ≈ ${band(AXIAL_PROPORTIONS.synchroniserWidth)}·a_w. `
          + "Рівняння друкує лише Опанасюк, тому частки не залежать від "
          + "вибраного методу коробки.",
        sourceRefs: EMPIRICAL_SOURCE_REFS,
        limitations: [
          "Ширини — не виміряні розміри, а частки від міжосьової відстані: "
          + "уточнюють їх після підбору підшипників і синхронізаторів."
        ],
        manuallyOverridden: false
      });
    }
    return decisions;
  }

  return Object.freeze({
    CENTRE_DISTANCE_FACTOR,
    AXIAL_PROPORTIONS,
    TOPOLOGIES,
    VEHICLE_TYPES,
    GEOMETRIC_SOURCE_REFS,
    EMPIRICAL_SOURCE_REFS,
    outputTorque,
    countsFromScheme,
    geometricCentreDistance,
    empiricalCentreDistance,
    centreDistanceComparison,
    comparisonDiagnostics,
    axialSize,
    buildGeometricStep,
    buildEmpiricalStep,
    buildAxialSizeStep,
    decisionsFor
  });
}
