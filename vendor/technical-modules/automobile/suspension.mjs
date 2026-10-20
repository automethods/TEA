"use strict";

// Розділ 18 — підвіска.
//
// Метод із методичних вказівок, підрозділ 4.2.3, друковані с. 58—60, звірені з
// рендером сторінок.
//
// Розділ спирається на розділ 16: статичний прогин f_ст, прийнятий там задля
// плавності ходу, тут стає вхідною величиною для листової ресори. Тому міняти
// його наосліп не можна — зміниться і плавність.
export function createSuspension({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
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
  // Модель пакета взято з Вахламова, тому крок посилається на обидві книжки.
  const BOTH_SOURCE_REFS = Object.freeze([
    "source.method.course", "source.book.vakhlamov"
  ]);

  // Динамічний прогин відносно статичного навантаження.
  const DYNAMIC_LOAD_SHARE = Object.freeze({
    paved: { min: 2, max: 3 },
    unpaved: { min: 3, max: 4 }
  });
  // Динамічний прогин відносно статичного.
  const DYNAMIC_DEFLECTION_SHARE = Object.freeze({
    passenger: { min: 0.5, max: 0.7 },
    bus: { min: 0.7, max: 0.9 },
    goods: { min: 0.8, max: 1.0 }
  });
  // Навантаження, за якого вмикається додатковий пружний елемент.
  const SECONDARY_ENGAGE_SHARE = Object.freeze({ min: 0.6, max: 0.7 });

  // Довжина ресори як частка бази. Друковані значення с. 60 — розшифровка
  // подавала лише один із трьох рядків.
  const SPRING_LENGTH_SHARE = Object.freeze({
    passengerRear: { min: 0.40, max: 0.55 },
    goodsFront: { min: 0.26, max: 0.35 },
    goodsRear: { min: 0.35, max: 0.45 }
  });
  // Коефіцієнт форми кінців листів.
  const END_SHAPE_FACTOR = Object.freeze({
    goods: { min: 1.25, max: 1.35 },
    passenger: { min: 1.35, max: 1.40 }
  });
  const LEAF_COUNT = Object.freeze({ min: 6, max: 14 });
  const WIDTH_TO_THICKNESS = Object.freeze({ min: 6, max: 10 });
  // Модуль поздовжньої пружності сталі, МПа.
  const YOUNG_MODULUS_MPA = 210000;

  function midpoint(range) {
    return (range.min + range.max) / 2;
  }

  // Характеристика пружних властивостей: статика, динаміка й точка, у якій
  // вмикається додатковий пружний елемент.
  // Словник покриттів каталогу проти двох категорій підвіски. Перелічують
  // ОБИДВІ сторони явно: покриття поза переліком — не «щось тверде», а
  // невідоме, і саме мовчазне віднесення його до твердого й було вадою.
  const PAVED_SURFACES = Object.freeze(["paved", "asphalt-good", "asphalt-worn"]);
  const UNPAVED_SURFACES = Object.freeze(["unpaved", "gravel-compacted",
    "gravel-loose", "aggregate-loose", "earth-sandy-loose", "sand"]);

  function classifySurface(surface) {
    if (PAVED_SURFACES.includes(surface)) return "paved";
    if (UNPAVED_SURFACES.includes(surface)) return "unpaved";
    return null;
  }

  function elasticCharacteristic({ staticLoadN, staticDeflectionM, vehicleType,
    surface }) {
    const load = finiteNumber(staticLoadN);
    const deflection = finiteNumber(staticDeflectionM);
    if (load === null || deflection === null || load <= 0 || deflection <= 0) {
      return { defined: false, reason: "Потрібні статичне навантаження й прогин." };
    }
    // Покриття задає смугу динамічного навантаження, і смуги ці різні.
    //
    // Тут була тиха вада. Підвіска знає дві категорії — «paved» і «unpaved», —
    // а решта документа вживає словник покриттів каталогу («asphalt-good»,
    // «gravel-compacted», «sand»…). Типове значення «paved» мовчки приймало
    // ЛЮБЕ незнайоме покриття за тверде: ущільнений гравій, пісок і бездоріжжя
    // рахувалися з вужчою смугою, ніж їм належить.
    const kind = classifySurface(surface);
    if (!kind) {
      return {
        defined: false,
        reason: `Покриття «${surface ?? "не вибрано"}» не віднесено ні до `
          + "твердого, ні до ґрунтового, а від цього залежить смуга "
          + "динамічного навантаження: на ґрунті вона ширша."
      };
    }
    const loadBand = kind === "unpaved"
      ? DYNAMIC_LOAD_SHARE.unpaved : DYNAMIC_LOAD_SHARE.paved;
    const deflectionBand = vehicleType === "goods" || vehicleType === "offRoad"
      ? DYNAMIC_DEFLECTION_SHARE.goods
      : (vehicleType === "bus" || vehicleType === "intercityBus"
        ? DYNAMIC_DEFLECTION_SHARE.bus
        : DYNAMIC_DEFLECTION_SHARE.passenger);
    return {
      defined: true,
      staticLoadN: load,
      staticDeflectionM: deflection,
      dynamicLoadN: load * midpoint(loadBand),
      dynamicDeflectionM: deflection * midpoint(deflectionBand),
      secondaryEngageLoadN: load * midpoint(SECONDARY_ENGAGE_SHARE),
      loadBand,
      deflectionBand,
      surface
    };
  }

  function adoptSpringLength({ wheelbaseM, vehicleType, axle }) {
    const base = finiteNumber(wheelbaseM);
    if (base === null || base <= 0) {
      return { defined: false, reason: "Колісна база не задана." };
    }
    const goods = vehicleType === "goods" || vehicleType === "offRoad";
    const share = goods
      ? (axle === "front" ? SPRING_LENGTH_SHARE.goodsFront : SPRING_LENGTH_SHARE.goodsRear)
      : SPRING_LENGTH_SHARE.passengerRear;
    if (!goods && axle === "front") {
      // Для передніх ресор легкових автомобілів джерело частки не подає:
      // передня підвіска в них зазвичай незалежна, і ресори там немає.
      return {
        defined: false,
        reason: "Для передніх ресор легкових автомобілів джерело частки не подає: "
          + "передня підвіска в них зазвичай незалежна."
      };
    }
    return {
      defined: true,
      lengthM: base * midpoint(share),
      share,
      axle,
      wheelbaseM: base
    };
  }

  // K₁ = l₂/L_р, K₂ = l₁/L_р; для симетричної обидва по 0,5.
  function asymmetry({ springLengthM, shortEndM }) {
    const length = finiteNumber(springLengthM);
    if (length === null || length <= 0) {
      return { defined: false, reason: "Довжина ресори не відома." };
    }
    const short = finiteNumber(shortEndM);
    if (short === null) {
      return {
        defined: true, symmetric: true,
        shortEndM: length / 2, longEndM: length / 2,
        k1: 0.5, k2: 0.5, springLengthM: length
      };
    }
    if (!(short > 0 && short < length)) {
      return {
        defined: false,
        reason: "Короткий кінець ресори має бути меншим за її довжину й додатним."
      };
    }
    const long = length - short;
    return {
      defined: true,
      symmetric: Math.abs(short - long) < 1e-9,
      shortEndM: short,
      longEndM: long,
      k1: long / length,
      k2: short / length,
      springLengthM: length
    };
  }

  // Прогин у точці статичної зосередженої сили на шарнірно опертій балці:
  // f_ст = δ·Z·L³/(48EJ) симетрична; δ·Z·l₁²·l₂²/(3EJ·L) несиметрична.
  // Друга залежність виведена з UW ME354, с. 3.20, підстановкою x=l₁,
  // b=l₂ і L=l₁+l₂. Показники 2 відновлюють розмірність J = довжина⁴
  // та дають симетричну формулу при l₁=l₂=L/2. δ — поправка ресори з курсу.
  function totalInertiaMm4({ endShapeFactor, staticLoadN, staticDeflectionM,
    geometry }) {
    const delta = finiteNumber(endShapeFactor);
    const load = finiteNumber(staticLoadN);
    const deflection = finiteNumber(staticDeflectionM);
    if ([delta, load, deflection].some(value => value === null || value <= 0)
      || !geometry?.defined) {
      return { defined: false, reason: "Для моменту інерції бракує величин." };
    }
    // Довжини — у міліметрах, прогин — у міліметрах, E — у Н/мм².
    const lengthMm = geometry.springLengthM * 1000;
    const deflectionMm = deflection * 1000;
    const value = geometry.symmetric
      ? delta * load * lengthMm ** 3 / (48 * YOUNG_MODULUS_MPA * deflectionMm)
      : delta * load * (geometry.shortEndM * 1000) ** 2 * (geometry.longEndM * 1000) ** 2
        / (3 * YOUNG_MODULUS_MPA * deflectionMm * lengthMm);
    return { defined: true, value, symmetric: geometry.symmetric,
      endShapeFactor: delta, staticLoadN: load, staticDeflectionM: deflection,
      youngModulusMpa: YOUNG_MODULUS_MPA };
  }

  // J_Σ = b(h·n)³/12 і b = k·h → h = ⁴√(12J/(k·n³)), b = k·h.
  function leafSection({ inertiaMm4, leafCount, widthToThickness }) {
    const inertia = finiteNumber(inertiaMm4);
    const count = finiteNumber(leafCount);
    const ratio = finiteNumber(widthToThickness);
    if ([inertia, count, ratio].some(value => value === null || value <= 0)) {
      return { defined: false, reason: "Для перерізу листа бракує величин." };
    }
    if (!Number.isInteger(count)) {
      return { defined: false, reason: "Кількість листів має бути цілою." };
    }
    // Пакет ресори — це n листів, що ковзають один по одному, тобто n балок
    // ПАРАЛЕЛЬНО: J_Σ = n·b·h³/12. Методичка друкує J_Σ = b(h·n)³/12 —
    // суцільну балку висотою в увесь пакет, — і за нею лист виходить утричі
    // тоншим за найтонший у таблиці 16, куди вона ж велить його звіряти.
    //
    // Вахламов (с. 299) подає прогин як f = δP·l³/(4E·n_п·b·h³), тобто рівно
    // n листів паралельно; звідси й береться показник при n.
    const thickness = (12 * inertia / (ratio * count)) ** 0.25;
    // Те, що дала б надрукована формула, — для звірки поряд.
    const printedThickness = (12 * inertia / (ratio * count ** 3)) ** 0.25;
    return {
      defined: true,
      thicknessMm: thickness,
      widthMm: ratio * thickness,
      printedThicknessMm: printedThickness,
      printedWidthMm: ratio * printedThickness,
      leafCount: count,
      widthToThickness: ratio,
      withinLeafCount: count >= LEAF_COUNT.min && count <= LEAF_COUNT.max,
      withinRatio: ratio >= WIDTH_TO_THICKNESS.min && ratio <= WIDTH_TO_THICKNESS.max
    };
  }

  // Таблиця 16 — витяг з ОН 8027-86, звірений із друком (с. 61).
  const LEAF_SERIES = Object.freeze([
    {
      id: "car-based",
      label: "Легкові, автобуси й вантажні на базі легкових",
      widthsMm: Object.freeze([45, 55]),
      thicknessesMm: Object.freeze([4.5, 5, 6, 6.5, 7, 7.5])
    },
    {
      id: "bus",
      label: "Автобуси з неуніфікованими ресорами",
      widthsMm: Object.freeze([65, 75, 90]),
      thicknessesMm: Object.freeze([7, 8, 9, 10, 12])
    },
    {
      id: "goods",
      label: "Вантажні автомобілі та автобуси",
      widthsMm: Object.freeze([55, 65, 75, 90, 100]),
      thicknessesMm: Object.freeze([6, 6.5, 7, 8, 9, 10, 11, 12, 14, 16])
    }
  ]);

  function seriesFor(vehicleType) {
    if (vehicleType === "goods" || vehicleType === "offRoad") {
      return LEAF_SERIES.find(item => item.id === "goods");
    }
    if (vehicleType === "bus" || vehicleType === "intercityBus") {
      return LEAF_SERIES.find(item => item.id === "bus");
    }
    return LEAF_SERIES.find(item => item.id === "car-based");
  }

  // Джерело велить порівняти пораховані h і b з таблицею 16 й ВИБРАТИ лист.
  // Саме тут автор і мирить розрахунок зі стандартом — а мирити є що.
  function adoptLeaf({ section, vehicleType }) {
    if (!section?.defined) {
      return { defined: false, reason: section?.reason || "Переріз не пораховано." };
    }
    const series = seriesFor(vehicleType);
    const thickness = series.thicknessesMm.find(value => value >= section.thicknessMm)
      ?? series.thicknessesMm[series.thicknessesMm.length - 1];
    const width = series.widthsMm.find(value => value >= section.widthMm)
      ?? series.widthsMm[series.widthsMm.length - 1];
    const belowSeries = section.thicknessMm < series.thicknessesMm[0];
    return {
      defined: true,
      series,
      thicknessMm: thickness,
      widthMm: width,
      computedThicknessMm: section.thicknessMm,
      computedWidthMm: section.widthMm,
      belowSeries
    };
  }

  function buildCharacteristicStep({ characteristic, texNumber }) {
    return {
      id: "suspension-elastic-characteristic",
      title: "Характеристика пружних властивостей підвіски",
      purpose: "Set the static and dynamic points the spring must carry.",
      output: {
        id: "value.suspension-dynamic-load",
        symbol: "Z_{\\text{дин}}",
        label: "Dynamic suspension load",
        valueType: "quantity",
        canonicalUnit: "N"
      },
      expression: "Zst * share",
      dependencies: ["decision.road-context", "decision.vehicle-type", "value.axle-forces", "decision.ride-static-deflection"],
      equationNumber: "18.1",
      formulaTex: "Z_{\\text{дин}}=(2\\ldots4)Z_{\\text{ст}},\\qquad "
        + "Z_0=(0{,}6\\ldots0{,}7)Z_{\\text{ст}}",
      substitutionTex: "\\begin{aligned}Z_{\\text{дин}}&="
        + `\\dfrac{${characteristic.loadBand.min}+${characteristic.loadBand.max}}{2}`
        + `\\cdot${texNumber(characteristic.staticLoadN, 2)}=${texNumber(characteristic.dynamicLoadN, 2)}\\ \\text{Н}\\\\[3pt]`
        + `Z_0&=\\dfrac{${SECONDARY_ENGAGE_SHARE.min}+${SECONDARY_ENGAGE_SHARE.max}}{2}`
        + `\\cdot${texNumber(characteristic.staticLoadN, 2)}=${texNumber(characteristic.secondaryEngageLoadN, 2)}\\ \\text{Н}\\end{aligned}`,
      result: {
        value: characteristic.dynamicLoadN, canonicalUnit: "N", displayUnit: "Н"
      },
      method: "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        `Динамічний прогин f_дин = ${texNumber(characteristic.dynamicDeflectionM * 1000, 0)}`
        + ` мм — частка ${characteristic.deflectionBand.min}…`
        + `${characteristic.deflectionBand.max} від статичного, прийнятого в розділі 16.`,
        classifySurface(characteristic.surface) === "unpaved"
          ? "Для ґрунтових доріг і бездоріжжя джерело бере більшу частку."
          : "Для доріг зі штучним покриттям."
      ],
      assumptions: [],
      limitations: [
        // Зв'язок із розділом 16 — не деталь: f_ст там прийнято задля плавності.
        "Статичний прогин тут той самий, що прийнято в розділі 16 задля плавності "
        + "ходу: змінити його тут означає змінити й плавність."
      ]
    };
  }

  // Сумарний прогин — власний розрахунок, а не приписка до навантаження.
  //
  // f = f_ст + f_дин входить у число витків пружини (розділ 22), і доти воно
  // потрапляло туди складеним у app.js: жодна оголошена величина його не
  // називала, тож карта не могла показати, звідки воно взялося. Крок оголошує
  // рівно один вихід, і саме його розділ 22 бере залежністю.
  function buildTotalDeflectionStep({ characteristic, texNumber }) {
    const totalM = characteristic.staticDeflectionM + characteristic.dynamicDeflectionM;
    return {
      id: "suspension-total-deflection",
      title: "Сумарний прогин підвіски",
      purpose: "Add the dynamic travel to the static deflection the ride chapter adopted.",
      output: {
        id: "value.suspension-total-deflection",
        symbol: "f",
        label: "Total suspension deflection",
        valueType: "quantity",
        canonicalUnit: "m"
      },
      expression: "fst + fdyn",
      dependencies: ["decision.ride-static-deflection", "decision.vehicle-type",
        "decision.road-context"],
      equationNumber: "18.1",
      formulaTex: "f=f_{\\text{ст}}+f_{\\text{дин}},\\qquad "
        + "f_{\\text{дин}}=k_ff_{\\text{ст}}",
      substitutionTex: "\\begin{aligned}f_{\\text{дин}}&="
        + `\\dfrac{${characteristic.deflectionBand.min}+${characteristic.deflectionBand.max}}{2}`
        + `\\cdot${texNumber(characteristic.staticDeflectionM, 5)}`
        + `=${texNumber(characteristic.dynamicDeflectionM, 5)}\\ \\text{м}\\\\[3pt]`
        + `f&=${texNumber(characteristic.staticDeflectionM, 5)}+${texNumber(characteristic.dynamicDeflectionM, 5)}`
        + `=${texNumber(totalM, 5)}\\ \\text{м}=${texNumber(totalM * 1000, 2)}\\ \\text{мм}\\end{aligned}`,
      result: { value: totalM, canonicalUnit: "m", displayUnit: "м" },
      method: "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        `Динамічна частка k_f = ${characteristic.deflectionBand.min}…`
        + `${characteristic.deflectionBand.max} від статичного прогину — за типом `
        + "автомобіля; прийнято середину.",
        "Цим прогином пружина стискається до упору, і саме він задає число "
        + "витків у розділі 22."
      ],
      assumptions: [],
      limitations: [
        "Статичний прогин той самий, що прийнято в розділі 16 задля плавності "
        + "ходу: змінити його тут означає змінити й плавність."
      ]
    };
  }

  function buildLeafStep({ geometry, inertia, section, leaf, texNumber }) {
    const inertiaNumerator = geometry.symmetric
      ? `${texNumber(geometry.springLengthM * 1000, 2)}^3`
      : `${texNumber(geometry.shortEndM * 1000, 2)}^2\\cdot${texNumber(geometry.longEndM * 1000, 2)}^2`;
    const inertiaDenominator = geometry.symmetric
      ? "48" : `3\\cdot${texNumber(geometry.springLengthM * 1000, 2)}`;
    return {
      id: "suspension-leaf-section",
      title: "Переріз листа ресори",
      purpose: "Size the leaf from the deflection the ride chapter adopted.",
      output: {
        id: "value.suspension-leaf-thickness",
        symbol: "h",
        label: "Leaf thickness",
        valueType: "quantity",
        canonicalUnit: "mm"
      },
      expression: "h = (12 J / (k n))^(1/4)",
      dependencies: ["decision.suspension-leaf", "decision.suspension-spring-length", "value.suspension-dynamic-load"],
      equationNumber: "18.2",
      formulaTex: "\\begin{aligned}" + (geometry.symmetric
        ? "f_{\\text{ст}}&=\\delta\\dfrac{Z_{\\text{ст}}L_p^{3}}"
          + "{48EJ_{\\Sigma}},\\qquad J_{\\Sigma}"
          + "=\\dfrac{n_{\\text{л}}bh^{3}}{12}"
        : "f_{\\text{ст}}&=\\delta\\dfrac{Z_{\\text{ст}}l_1^{2}l_2^{2}}"
          + "{3EJ_{\\Sigma}L_p},\\qquad J_{\\Sigma}"
          + "=\\dfrac{n_{\\text{л}}bh^{3}}{12}")
        + "\\\\[3pt]h&=\\sqrt[4]{\\dfrac{12J_{\\Sigma}}{k_bn_{\\text{л}}}},\\qquad b=k_bh\\end{aligned}",
      substitutionTex: "\\begin{aligned}J_{\\Sigma}&=\\dfrac{"
        + `${texNumber(inertia.endShapeFactor, 3)}\\cdot${texNumber(inertia.staticLoadN, 2)}\\cdot${inertiaNumerator}}`
        + `{${inertiaDenominator}\\cdot${texNumber(inertia.youngModulusMpa, 0)}`
        + `\\cdot${texNumber(inertia.staticDeflectionM * 1000, 3)}}`
        + `=${texNumber(inertia.value, 2)}\\ \\text{мм}^4\\\\[3pt]`
        + `h&=\\sqrt[4]{\\dfrac{12\\cdot${texNumber(inertia.value, 2)}}`
        + `{${texNumber(section.widthToThickness, 2)}\\cdot${section.leafCount}}}`
        + `=${texNumber(section.thicknessMm, 3)}\\ \\text{мм}\\\\[3pt]`
        + `b&=${texNumber(section.widthToThickness, 2)}\\cdot${texNumber(section.thicknessMm, 3)}`
        + `=${texNumber(section.widthMm, 3)}\\ \\text{мм}\\end{aligned}`,
      result: {
        value: section.thicknessMm, canonicalUnit: "mm", displayUnit: "мм"
      },
      method: "project-derivation",
      sourceRefs: geometry.symmetric ? BOTH_SOURCE_REFS
        : [...BOTH_SOURCE_REFS, "source.reference.washington-beams", "source.project-derivation"],
      readerNotes: [
        ...(!geometry.symmetric ? [
          "Для несиметричної ресори застосовано f_ст = δZ_ст·l₁²·l₂²/(3EJ_ΣL_p). "
          + "Це проєктне виведення: у розв'язок шарнірно опертої балки UW ME354, "
          + "с. 3.20, y₁ = −Pbx(L² − b² − x²)/(6EIL), підставлено x = a, L = a + b. "
          + "Прогин береться саме в точці прикладання сили; δ залишено поправкою "
          + "форми листів із навчальної методики.",
          "Виправлено відсутні квадрати плечей у попередній реалізації (18.2): "
          + "вираз із l₁l₂ давав J у мм² замість мм⁴. При l₁ = l₂ = L_p/2 "
          + "виправлений вираз переходить у формулу симетричної ресори."
        ] : []),
        "Пакет ресори — це листи, що КОВЗАЮТЬ один по одному, тобто n балок "
        + "паралельно: J_Σ = n_л·b·h³/12. Методичка друкує J_Σ = b(h·n_л)³/12 — "
        + "суцільну балку висотою в увесь пакет, — а суцільна балка в рази "
        + "жорсткіша за той самий метал, розділений на листи.",
        `Ціна різниці: за надрукованою формулою лист виходить `
        + `${texNumber(section.printedThicknessMm, 1)} мм — утричі тонший за `
        + "найтонший у таблиці 16, до якої та сама методичка велить його "
        + `звіряти. За пакетом із листів — ${texNumber(section.thicknessMm, 1)} мм, `
        + "і він у таблицю потрапляє.",
        "Вахламов (с. 299) подає прогин симетричної ресори як "
        + "f_р = δP_р·l_р³/(4E·n_п·b·h³) — рівно n листів паралельно, — і саме "
        + "звідси взято показник при n_л.",
        `Прийнято ${section.leafCount} листів і b/h = ${section.widthToThickness}; `
        + `джерело подає ${LEAF_COUNT.min}…${LEAF_COUNT.max} листів і `
        + `b/h = ${WIDTH_TO_THICKNESS.min}…${WIDTH_TO_THICKNESS.max}.`,
        leaf?.defined
          ? `За таблицею 16 беруть лист ${leaf.thicknessMm}×${leaf.widthMm} мм `
            + `(${leaf.series.label.toLowerCase()}).`
          : ""
      ].filter(Boolean),
      assumptions: [
        `Модуль поздовжньої пружності E = ${YOUNG_MODULUS_MPA / 1000} ГПа.`,
        ...(!geometry.symmetric ? [
          "Статична зосереджена сила діє між двома шарнірними опорами; "
          + "прогин визначають у точці цієї сили. Застосовано малі кути повороту, "
          + "стале EJ та нехтування деформацією зсуву."
        ] : [])
      ],
      limitations: [
        ...(!geometry.symmetric ? [
          "Балкова аналогія з поправкою δ не враховує податливості кріплень, "
          + "міжлистового тертя та нелінійного контакту реальної ресори."
        ] : []),
        "Відхилення від джерела: пакет рахують як n_л листів ПАРАЛЕЛЬНО "
        + "(J_Σ = n_л·b·h³/12), а не як суцільну балку, що її друкує методичка. "
        + "Так само подає Вахламов, с. 299.",
        ...(leaf?.belowSeries
          ? ["Розрахунковий лист усе одно тонший за найтонший у таблиці 16: "
            + "перевірте прийняті кількість листів і відношення b/h."]
          : [])
      ]
    };
  }

  function decisionsFor({ leaf, springLength }) {
    const decisions = [];
    if (springLength?.defined) {
      decisions.push({
        id: "decision.suspension-spring-length",
        kind: "Decision",
        choiceRef: null,
        symbol: "L_p",
        adoptedValue: springLength.lengthM,
        canonicalUnit: "m",
        method: "source-midpoint",
        selectedReferenceId: null,
        recommendedValue: springLength.lengthM,
        recommendedSourceRefs: SOURCE_REFS,
        rationale: `Прийнято середину частки ${springLength.share.min}…`
          + `${springLength.share.max} від колісної бази, яку джерело подає для `
          + `${springLength.axle === "front" ? "передніх" : "задніх"} ресор `
          + "цього типу автомобіля.",
        sourceRefs: SOURCE_REFS,
        limitations: [],
        manuallyOverridden: false
      });
    }
    if (leaf?.defined) {
      decisions.push({
        id: "decision.suspension-leaf",
        kind: "Decision",
        choiceRef: null,
        symbol: "h\\times b",
        adoptedValue: `${leaf.thicknessMm}×${leaf.widthMm}`,
        canonicalUnit: "mm",
        method: "standard-series",
        selectedReferenceId: null,
        recommendedValue: null,
        recommendedSourceRefs: SOURCE_REFS,
        rationale: `Лист із ряду ОН 8027-86 (таблиця 16) для групи `
          + `«${leaf.series.label.toLowerCase()}». Розрахунок дав `
          + `${leaf.computedThicknessMm.toFixed(1)}×${leaf.computedWidthMm.toFixed(0)} мм.`,
        sourceRefs: SOURCE_REFS,
        limitations: leaf.belowSeries
          ? ["Розрахунковий переріз менший за найменший у ряду — див. межі кроку."]
          : [],
        manuallyOverridden: false
      });
    }
    return decisions;
  }

  function diagnosticsFor({ section, leaf }) {
    if (!section?.defined) return [];
    const out = [];
    if (leaf?.defined && leaf.belowSeries) {
      out.push({
        code: "SUSPENSION_SECTION_BELOW_SERIES",
        severity: "warning",
        message: `Розрахунок дає лист завтовшки `
          + `${leaf.computedThicknessMm.toFixed(1)} мм, а найтонший у таблиці 16 `
          + `для цього типу — ${leaf.series.thicknessesMm[0]} мм. Пакет уже `
          + "рахують як листи паралельно, тому причина не у формулі: або листів "
          + "прийнято забагато, або відношення b/h завелике. Зменште їх, і "
          + "переріз підніметься в ряд.",
        details: { node: "calc.suspension-leaf-section" }
      });
    }
    if (!section.withinLeafCount) {
      out.push({
        code: "SUSPENSION_LEAF_COUNT_OUTSIDE_RANGE",
        severity: "warning",
        message: `Листів у ресорі ${section.leafCount}, а джерело подає `
          + `${LEAF_COUNT.min}…${LEAF_COUNT.max}.`,
        details: { node: "calc.suspension-leaf-section" }
      });
    }
    if (!section.withinRatio) {
      out.push({
        code: "SUSPENSION_LEAF_RATIO_OUTSIDE_RANGE",
        severity: "warning",
        message: `Відношення ширини до товщини ${section.widthToThickness}, а `
          + `джерело подає ${WIDTH_TO_THICKNESS.min}…${WIDTH_TO_THICKNESS.max}.`,
        details: { node: "calc.suspension-leaf-section" }
      });
    }
    return out;
  }

  return Object.freeze({
    SOURCE_REFS,
    DYNAMIC_LOAD_SHARE,
    DYNAMIC_DEFLECTION_SHARE,
    SECONDARY_ENGAGE_SHARE,
    SPRING_LENGTH_SHARE,
    END_SHAPE_FACTOR,
    LEAF_COUNT,
    WIDTH_TO_THICKNESS,
    YOUNG_MODULUS_MPA,
    midpoint,
    elasticCharacteristic,
    adoptSpringLength,
    asymmetry,
    totalInertiaMm4,
    leafSection,
    LEAF_SERIES,
    seriesFor,
    classifySurface,
    adoptLeaf,
    buildCharacteristicStep,
    buildTotalDeflectionStep,
    buildLeafStep,
    decisionsFor,
    diagnosticsFor
  });
}
