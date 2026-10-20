"use strict";

// Розділ 4.1 — вихідні дані для тягового розрахунку.
//
// Метод узято з «Методичка АВТОМОБИЛИ_Опанасюк.DOC», §2.1, який розпадається
// рівно на три підрозділи цього модуля. Формули наведено дослівно:
//
//   §2.1.1  Gш = Gi/n            (рівняння (7) джерела)
//           «з односкатними шинами n=2, з двоскатними — n=4»;
//           «для більшої достовірності необхідно визначити Gш на всіх мостах
//            і по більшому з них вибирають шини»;
//           «Вказаний радіус rс приймають за динамічний rд».
//
//   §2.1.2  ηм = 0,98^k · 0,97^l · 0,995^m · 0,999^p
//           k — пари циліндричних шестерень, через які передається крутний
//           момент на певній передачі; l — пари конічних гіпоїдних шестерень;
//           m — карданні шарніри; p — шліцьові з'єднання.
//           «Втратами енергії в підшипниках агрегатів трансмісії зневажаємо.»
//
//   §2.1.3  W = KF, К — коефіцієнт обтічності, Н·с²/м⁴; F — площа проекції
//           автомобіля на площину, перпендикулярну його повздовжній осі, м².
//
// Жодного числа, якого немає в джерелі, тут не вводиться.
export function createChapter4Inputs({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;
  const tyreReferenceData = dependencies.VehicleTyreReferenceData || loadDependency?.("./tyre-reference-data.js");

  // Одна перевірка числа на весь проєкт: Number() приймає null, true й "" і
  // мовчки робить із них 0 та 1, а Number.isFinite їх пропускає.
  const { finiteNumber, plainNumber } = (function loadNumeric() {
    const scope = typeof window === "object" ? window : globalThis;
    if (!scope.VehicleNumeric && typeof module === "object" && module.exports) {
      require("./numeric.js");
    }
    return scope.VehicleNumeric;
  })();

  // Те саме прискорення вільного падіння, що й у розділі 3.
  const STANDARD_GRAVITY = 9.81;

  // Густина повітря за стандартною атмосферою ISA на рівні моря. Значення є
  // входом із зазначеним джерелом, а не прихованою сталою: за іншої висоти
  // чи температури користувач вписує своє.
  const ISA_SEA_LEVEL_AIR_DENSITY = 1.225;

  // Множники ККД за Опанасюком, §2.1.2.
  const CYLINDRICAL_PAIR_EFFICIENCY = 0.98;
  const BEVEL_PAIR_EFFICIENCY = 0.97;
  const CARDAN_JOINT_EFFICIENCY = 0.995;
  const SPLINE_JOINT_EFFICIENCY = 0.999;

  // Таблиця 12 «ИНС / Нагрузка, кгс», Приходько В. М. (ред.),
  // «Автомобильный справочник», 2002, друковані с. 205–206. Індекс масиву —
  // це ИНС, значення — навантаження в кгс. Транскрипцію разом із виправленими
  // друкарськими помилками джерела наведено у
  // Data/Vehicle/docs/tyre_load_index_tables.md.
  const LOAD_INDEX_KGF = Object.freeze([...(tyreReferenceData?.loadIndexKgf || [])]);

  // Таблиця 13 «Индекс категории скорости / Скорость качения шины, км/ч» того
  // самого довідника, друкована с. 206. Порядок — як надруковано: H (210)
  // стоїть між U (200) і V (240).
  const SPEED_CATEGORIES = Object.freeze((tyreReferenceData?.speedCategories || [])
    .map(entry => Object.freeze({ code: entry.code, speedKmh: entry.speedKmh })));

  // ---------------------------------------------------------------- 4.1.1 --

  // Gш = Gi/n на кожному мості. Джерело вимагає обчислити навантаження на
  // ВСІХ мостах і вибирати шину за більшим із них, тому повертається повний
  // перелік рядків, а не одразу максимум.
  function wheelLoads(axleRows, grossWeightForceKn) {
    const totalKn = finiteNumber(grossWeightForceKn) || 0;
    const rows = (axleRows || []).map(row => {
      const tyreCount = finiteNumber(row.tyreCount) || 0;
      const axleForceKn = totalKn * (finiteNumber(row.share) || 0);
      const wheelForceKn = tyreCount > 0 ? axleForceKn / tyreCount : 0;
      return {
        axleNumber: row.axleNumber,
        position: row.position,
        tyreCount,
        // «з односкатними шинами n=2, з двоскатними — n=4»
        dual: tyreCount >= 4,
        axleForceKn,
        wheelForceKn,
        // Таблиця 12 подає навантаження в кгс, тому сила переводиться назад у
        // кгс тим самим g, що й у розділі 3.
        wheelLoadKgf: wheelForceKn * 1000 / STANDARD_GRAVITY
      };
    });
    let governing = null;
    rows.forEach(row => {
      if (!governing || row.wheelLoadKgf > governing.wheelLoadKgf) governing = row;
    });
    return { rows, governing };
  }

  // Найменший ИНС, чиє табличне навантаження не менше за розрахункове.
  function requiredLoadIndex(wheelLoadKgf) {
    const load = finiteNumber(wheelLoadKgf);
    if (!Number.isFinite(load) || load <= 0) {
      return { index: null, ratedKgf: null, exceedsTable: false, defined: false };
    }
    const index = LOAD_INDEX_KGF.findIndex(rated => rated >= load);
    if (index === -1) {
      return {
        index: null,
        ratedKgf: null,
        defined: true,
        exceedsTable: true,
        tableMaxKgf: LOAD_INDEX_KGF[LOAD_INDEX_KGF.length - 1],
        tableMaxIndex: LOAD_INDEX_KGF.length - 1
      };
    }
    return { index, ratedKgf: LOAD_INDEX_KGF[index], defined: true, exceedsTable: false };
  }

  // Найменша категорія швидкості, чия табличні км/год не менші за V_max.
  function requiredSpeedCategory(maximumSpeedKmh) {
    const speed = finiteNumber(maximumSpeedKmh);
    if (!Number.isFinite(speed) || speed <= 0) {
      return { code: null, speedKmh: null, exceedsTable: false, defined: false };
    }
    const ordered = [...SPEED_CATEGORIES].sort((a, b) => a.speedKmh - b.speedKmh);
    const match = ordered.find(entry => entry.speedKmh >= speed);
    if (!match) {
      const top = ordered[ordered.length - 1];
      return {
        code: null,
        speedKmh: null,
        defined: true,
        exceedsTable: true,
        tableMaxCode: top.code,
        tableMaxSpeedKmh: top.speedKmh
      };
    }
    return { code: match.code, speedKmh: match.speedKmh, defined: true, exceedsTable: false };
  }

  // Вимога до шини у тому вигляді, в якому її можна записати в пояснювальну
  // записку, навіть коли жодної конкретної шини не названо. Це і є чесний
  // результат 4.1.1 за відсутності ГОСТ 4754-80 і 5513-86, на які посилається
  // джерело і яких проєкт не має.
  function tyreRequirement(governingRow, maximumSpeedKmh) {
    const load = requiredLoadIndex(governingRow ? governingRow.wheelLoadKgf : null);
    const speed = requiredSpeedCategory(maximumSpeedKmh);
    const parts = [];
    if (load.index !== null) parts.push(`ИНС ${load.index}`);
    if (speed.code) parts.push(`категорія ${speed.code}`);
    return {
      loadIndex: load,
      speedCategory: speed,
      dual: Boolean(governingRow && governingRow.dual),
      // «не менше ніж» — вимога-мінімум, а не позначення конкретної шини.
      text: parts.length === 2
        ? `потрібно не менше ніж ${parts[0]}, ${parts[1]}`
        : (parts.length === 1 ? `потрібно не менше ніж ${parts[0]}` : null),
      complete: parts.length === 2
    };
  }

  // ----------------------------------------- 4.1.1, статичний радіус шини ---
  //
  // В. А. Оберемок, «Эксплуатационные свойства автотранспортных средств»,
  // друкована с. 18, рівняння (2.1):
  //
  //     r_ст = 0,5·d + Δ·λ_ст·B
  //
  //   d    — посадочний діаметр обода;
  //   Δ    = H/B — відношення висоти профілю до ширини;
  //   λ_ст — «коэффициент, учитывающий смятие шины под нагрузкой»;
  //   B    — ширина профілю.
  //
  // Там же: Н/В = 1,0 для шин вантажних автомобілів і автобусів (крім
  // широкопрофільних); Н/В ≈ 0,95 для легкових із дюймовим позначенням;
  // Н/В = 0,8…0,85 для змішаного (міліметрово-дюймового) позначення.
  // λ_ст = 0,85…0,9 для шин вантажних і діагональних шин легкових,
  // λ_ст = 0,8…0,85 для радіальних шин легкових.
  //
  // Оберемок, с. 19, рівняння (2.3): r_к^с = (1,03…1,06)·r_ст.
  // Оберемок, с. 17: «На дорогах с твердым покрытием можно принять, что
  // r_ст = r_д» — те саме припущення, що й у методичці Опанасюка, §2.1.1.

  // Дюйм у міліметрах — означення одиниці, а не число джерела.
  const INCH_MM = 25.4;

  // Рівняння (2.3) Оберемка.
  const FREE_ROLLING_RADIUS_FACTORS = Object.freeze({ min: 1.03, max: 1.06 });

  // Обидві таблиці нижче — Оберемок. Посилання лежить на самих рядках, бо
  // номер джерела має стояти там, де значення приймають (правило §7.2), а
  // приймають його біля поля, не в кінці розділу.
  //
  // Це ідентифікатор бібліографії ("oberemok"), а НЕ ідентифікатор джерела в
  // моделі документа ("source.method.oberemok"): другий тут дав би порожній
  // знак посилання, бо нумерує їх бібліографія.
  const TYRE_TABLE_SOURCE_REF = "oberemok";

  // Δ = H/B за Оберемком для позначень, які САМІ відношення не подають.
  const ASPECT_RATIO_FALLBACKS = Object.freeze([
    {
      id: "goods-bus",
      label: "Шини вантажних автомобілів і автобусів (крім широкопрофільних)",
      min: 1.0, max: 1.0, sourceRef: TYRE_TABLE_SOURCE_REF
    },
    {
      id: "car-inch",
      label: "Легкові автомобілі, дюймове позначення",
      min: 0.95, max: 0.95, sourceRef: TYRE_TABLE_SOURCE_REF
    },
    {
      id: "car-mixed",
      label: "Легкові автомобілі, змішане (міліметрово-дюймове) позначення",
      min: 0.8, max: 0.85, sourceRef: TYRE_TABLE_SOURCE_REF
    }
  ].map(Object.freeze));

  // λ_ст за Оберемком.
  const DEFLECTION_RANGES = Object.freeze([
    {
      id: "goods-and-diagonal-car",
      label: "Шини вантажних автомобілів і діагональні шини легкових",
      min: 0.85, max: 0.9, sourceRef: TYRE_TABLE_SOURCE_REF
    },
    {
      id: "car-radial",
      label: "Радіальні шини легкових автомобілів",
      min: 0.8, max: 0.85, sourceRef: TYRE_TABLE_SOURCE_REF
    }
  ].map(Object.freeze));

  function aspectRatioFallback(id) {
    return ASPECT_RATIO_FALLBACKS.find(row => row.id === id) || null;
  }

  function deflectionRange(id) {
    return DEFLECTION_RANGES.find(row => row.id === id) || null;
  }

  // Розбір позначення шини. Повертає прочитані розміри або явний стан «не
  // читається» з причиною: жодного вгадування тут не робиться.
  function parseTyreDesignation(text) {
    const raw = String(text === null || text === undefined ? "" : text).trim();
    const fail = reason => Object.freeze({ text: raw, parsed: false, reason });
    if (!raw) return fail("Позначення шини не задано.");
    // Extract the geometric core first. Catalogues attach service classes and
    // indices in several equivalent forms: R16C, R16 C, LT245/75R16,
    // P245/70R17, 113/111 and 121/119R. None changes B/H/R/d geometry.
    const compact = raw.toUpperCase().replace(/,/g, ".").replace(/\s+/g, "")
      .replace(/^(?:LT|P)(?=\d)/, "")
      .replace(/\/(?=(?:ZR|[A-Z]?R|D|-)\d)/, "");
    const core = /^(\d{1,3}(?:\.\d+)?)(?:\/(\d{2,3}(?:\.\d+)?))?([ZHVWS]?R|D|-)(\d{2}(?:\.\d)?)(?:CP|C|LT)?/.exec(compact);
    const normalized = core
      ? `${core[1]}${core[2] ? `/${core[2]}` : ""}${core[3]}${core[4]}`
      : compact;
    const withAspect =
      /^(\d{1,3}(?:\.\d+)?)\/(\d{2,3}(?:\.\d+)?)([ZHVWS]?R|D|-)(\d{2}(?:\.\d)?)$/.exec(normalized);
    const withoutAspect =
      /^(\d{1,3}(?:\.\d+)?)([ZHVWS]?R|D|-)(\d{2}(?:\.\d)?)$/.exec(normalized);
    const match = withAspect || withoutAspect;
    if (!match) {
      return fail(`Позначення «${raw}» не відповідає жодній із форм B/H R d, `
        + "B R d або B-d і не читається.");
    }
    const widthNumber = finiteNumber(match[1]);
    // Ширину подають або в міліметрах (135…445), або в дюймах (5,60…14,00).
    // Проміжок між ними не належить жодній із систем, тому число звідти —
    // це відмова, а не здогад.
    let widthUnit = null;
    if (widthNumber >= 100) widthUnit = "mm";
    else if (widthNumber <= 20) widthUnit = "in";
    if (!widthUnit) {
      return fail(`Ширину профілю ${match[1]} не можна прочитати ні як `
        + "міліметри (від 100), ні як дюйми (до 20).");
    }
    const constructionCode = withAspect ? match[3] : match[2];
    const rimNumber = finiteNumber(withAspect ? match[4] : match[3]);
    const construction = constructionCode.endsWith("R")
      ? "radial"
      : "diagonal";
    const aspectRatioFromCode = withAspect ? finiteNumber(match[2]) / 100 : null;
    return Object.freeze({
      text: raw,
      normalized,
      parsed: true,
      reason: null,
      sectionWidth: widthNumber,
      sectionWidthUnit: widthUnit,
      sectionWidthMm: widthUnit === "mm" ? widthNumber : widthNumber * INCH_MM,
      aspectRatioFromCode,
      construction,
      rimDiameterIn: rimNumber,
      rimDiameterMm: rimNumber * INCH_MM,
      // Яким саме шляхом далі братиметься Δ: із самого коду чи з таблиці
      // Оберемка.
      designationKind: aspectRatioFromCode !== null
        ? "aspect-in-code"
        : (widthUnit === "mm" ? "mixed" : "inch")
    });
  }

  // Категорія ЄС → рід шини, за яким Оберемок членує свої значення. Джерело
  // говорить про легкові проти вантажних і автобусів, а не про M/N, тому
  // відповідність подається з застереженням там, де вона не очевидна.
  function vehicleTyreKind(category) {
    if (category === "M1") return "car";
    if (["M2", "M3", "N1", "N2", "N3"].includes(category)) return "goods-bus";
    return null;
  }

  // Джерело подає діапазон, а не точкове значення. Типовим береться середина
  // діапазону — це рішення за замовчуванням, а не число Оберемка, і саме так
  // воно підписане в інтерфейсі та у трасі обчислення.
  function adoptWithinRange(range, chosenValue) {
    if (!range) {
      return { defined: false, value: null, withinRange: false, isMidpointDefault: false, range: null };
    }
    // Порожнє поле — це «значення не обрано», а не нуль: Number(null) і
    // Number("") дають 0, і без цієї перевірки замість типового значення
    // діапазону прийнявся б нуль.
    const absent = chosenValue === null || chosenValue === undefined || chosenValue === "";
    const number = absent ? NaN : finiteNumber(chosenValue);
    if (!Number.isFinite(number)) {
      return {
        defined: true,
        value: (range.min + range.max) / 2,
        withinRange: true,
        isMidpointDefault: true,
        range
      };
    }
    return {
      defined: true,
      value: number,
      withinRange: number >= range.min && number <= range.max,
      isMidpointDefault: false,
      range
    };
  }

  // Δ береться з коду, якщо код його несе; інакше — з таблиці Оберемка за
  // родом шини й видом позначення. Подвійного застосування бути не може:
  // basis каже, який шлях спрацював.
  function resolveAspectRatio({ parsed, category, chosenValue }) {
    if (!parsed || !parsed.parsed) {
      return {
        defined: false,
        value: null,
        basis: null,
        fallback: null,
        editable: false,
        reason: parsed ? parsed.reason : "Позначення шини не задано."
      };
    }
    if (parsed.aspectRatioFromCode !== null) {
      return {
        defined: true,
        value: parsed.aspectRatioFromCode,
        basis: "code",
        fallback: null,
        editable: false,
        // Δ = H/B вже стоїть у самому позначенні, тому запасні 0,8…0,85
        // Оберемка тут НЕ застосовуються — інакше шину сплющило б двічі.
        reason: null
      };
    }
    const kind = vehicleTyreKind(category);
    if (!kind) {
      return {
        defined: false, value: null, basis: null, fallback: null, editable: false,
        reason: "Джерело подає Н/В окремо для легкових і для вантажних та "
          + "автобусів; категорія автомобіля не визначена."
      };
    }
    const fallbackId = kind === "goods-bus"
      ? "goods-bus"
      : (parsed.designationKind === "inch" ? "car-inch" : "car-mixed");
    const fallback = aspectRatioFallback(fallbackId);
    const adopted = adoptWithinRange(fallback, chosenValue);
    return {
      defined: adopted.defined,
      value: adopted.value,
      basis: `oberemok-${fallbackId}`,
      fallback,
      // Точкове значення джерела редагувати нема чого; діапазон — це вибір.
      editable: fallback.min !== fallback.max,
      withinRange: adopted.withinRange,
      isMidpointDefault: adopted.isMidpointDefault,
      reason: null
    };
  }

  // Рядок λ_ст, який Оберемок подає для цієї шини, або null.
  function suggestDeflectionRange({ category, construction }) {
    const kind = vehicleTyreKind(category);
    if (!kind) return null;
    if (kind === "goods-bus") {
      return {
        id: "goods-and-diagonal-car",
        caveat: "Джерело подає цей рядок для шин вантажних автомобілів; "
          + "широкопрофільні шини воно з формули (2.1) виключає."
      };
    }
    if (construction === "radial") return { id: "car-radial", caveat: null };
    if (construction === "diagonal") return { id: "goods-and-diagonal-car", caveat: null };
    return null;
  }

  // r_ст = 0,5d + Δ·λ_ст·B, Оберемок (2.1); r_к^с = (1,03…1,06)r_ст, (2.3).
  function staticWheelRadius({ parsed, aspectRatio, deflectionCoefficient }) {
    const blank = reason => ({
      defined: false, reason,
      radiusMm: null, radiusM: null,
      freeRadiusMm: null, freeRadiusM: null,
      freeRollingRadiusMinM: null, freeRollingRadiusMaxM: null
    });
    if (!parsed || !parsed.parsed) {
      return blank(parsed ? parsed.reason : "Позначення шини не задано.");
    }
    const delta = finiteNumber(aspectRatio);
    const lambda = finiteNumber(deflectionCoefficient);
    if (!Number.isFinite(delta)) return blank("Відношення Н/В не визначено.");
    if (!Number.isFinite(lambda)) return blank("Коефіцієнт λ_ст не визначено.");
    const halfRimMm = 0.5 * parsed.rimDiameterMm;
    const radiusMm = halfRimMm + delta * lambda * parsed.sectionWidthMm;
    const freeRadiusMm = halfRimMm + delta * parsed.sectionWidthMm;
    return {
      defined: true,
      reason: null,
      halfRimMm,
      sectionWidthMm: parsed.sectionWidthMm,
      aspectRatio: delta,
      deflectionCoefficient: lambda,
      radiusMm,
      radiusM: radiusMm / 1000,
      // Вільний радіус — арифметика самого позначення, наведена для контролю
      // порядку величини; у формулу (2.1) він не входить.
      freeRadiusMm,
      freeRadiusM: freeRadiusMm / 1000,
      freeRollingRadiusMinM: FREE_ROLLING_RADIUS_FACTORS.min * radiusMm / 1000,
      freeRollingRadiusMaxM: FREE_ROLLING_RADIUS_FACTORS.max * radiusMm / 1000
    };
  }

  // --------------------------------------------------------------- 4.1.2 ---

  function transmissionEfficiency(counts) {
    const k = Math.max(0, Math.trunc(finiteNumber(counts.cylindricalPairs) || 0));
    const l = Math.max(0, Math.trunc(finiteNumber(counts.bevelPairs) || 0));
    const m = Math.max(0, Math.trunc(finiteNumber(counts.cardanJoints) || 0));
    const p = Math.max(0, Math.trunc(finiteNumber(counts.splineJoints) || 0));
    return {
      cylindricalPairs: k,
      bevelPairs: l,
      cardanJoints: m,
      splineJoints: p,
      efficiency: Math.pow(CYLINDRICAL_PAIR_EFFICIENCY, k)
        * Math.pow(BEVEL_PAIR_EFFICIENCY, l)
        * Math.pow(CARDAN_JOINT_EFFICIENCY, m)
        * Math.pow(SPLINE_JOINT_EFFICIENCY, p),
      // Джерело прямо каже, що втрати в підшипниках не враховано.
      neglectsBearingLosses: true
    };
  }

  // Таблиця 3 курсової методики (див. docs/superpowers/specs/
  // 2026-08-14-chapter4-traction-design.md). Тут вона працює НЕ як джерело
  // значення ηм, а як перехресна перевірка порахованого за формулою: вихід за
  // межі рядка свого класу зазвичай означає, що елемент трансмісії полічено
  // неправильно.
  const EFFICIENCY_RANGES = Object.freeze([
    {
      id: "goods-bus-single-final-4x2",
      label: "Вантажні та автобуси, одинарна головна передача, 4×2",
      min: 0.90, max: 0.92
    },
    {
      id: "goods-bus-double-final-4x2",
      label: "Вантажні та автобуси, подвійна головна передача, 4×2",
      min: 0.86, max: 0.88
    },
    {
      id: "goods-bus-double-final-4x4-6x4",
      label: "Вантажні та автобуси, подвійна головна передача, 4×4 або 6×4",
      min: 0.82, max: 0.84
    },
    {
      id: "goods-bus-double-final-6x6",
      label: "Вантажні та автобуси, подвійна головна передача, 6×6",
      min: 0.78, max: 0.80
    },
    {
      id: "car-small-bus-4x2",
      label: "Легкові та автобуси особливо малого і малого класів, 4×2",
      min: 0.92, max: 0.94
    }
  ].map(Object.freeze));

  function efficiencyRange(rangeId) {
    return EFFICIENCY_RANGES.find(range => range.id === rangeId) || null;
  }

  // Рядок таблиці, який відповідає цьому автомобілю, або null — коли таблиця
  // не подає рядка для такого поєднання. null тут означає «джерело не подає
  // діапазону», а не «діапазон нульовий»; інтерфейс має сказати саме це.
  function suggestEfficiencyRange({ category, axleFormula, doubleFinalDrive }) {
    const formula = String(axleFormula || "");
    if (category === "M1") {
      // Таблиця подає рядок для легкових ОСОБЛИВО МАЛОГО І МАЛОГО класів.
      // Розмірного класу легкового автомобіля модель даних не тримає, тому
      // рядок пропонується із застереженням, а не як встановлений факт.
      return formula === "4x2"
        ? {
            id: "car-small-bus-4x2",
            caveat: "Джерело подає цей рядок для легкових особливо малого і "
              + "малого класів; розмірного класу легкового автомобіля модель "
              + "даних не містить."
          }
        : null;
    }
    if (category === "M2") return null;
    if (!["M3", "N1", "N2", "N3"].includes(category)) return null;
    if (doubleFinalDrive === null || doubleFinalDrive === undefined) return null;
    if (!doubleFinalDrive) {
      return formula === "4x2" ? { id: "goods-bus-single-final-4x2", caveat: null } : null;
    }
    if (formula === "4x2") return { id: "goods-bus-double-final-4x2", caveat: null };
    if (formula === "4x4" || formula === "6x4") {
      return { id: "goods-bus-double-final-4x4-6x4", caveat: null };
    }
    if (formula === "6x6") return { id: "goods-bus-double-final-6x6", caveat: null };
    return null;
  }

  // На етапі (4.5) коробку ще не вибрано, тому рахувати число зубчастих пар
  // означало б удавати, що кінематична схема вже відома. Обидві курсові
  // методики прямо дозволяють ПОПЕРЕДНЬО прийняти ККД із таблиці типів
  // автомобіля. Для BEV Zheng подає складники редуктора/трансмісії в
  // mid-to-high 90% range; 0,95 тут є консервативним редагованим стартом.
  function preliminaryTransmissionEfficiency({
    category, axleFormula, powertrain, doubleFinalDrive = false,
    prototypeEfficiency = null
  }) {
    const prototype = finiteNumber(prototypeEfficiency);
    if (prototype > 0 && prototype <= 1) {
      return {
        defined: true, value: prototype, method: "prototype",
        sourceRefs: ["source.dataset.vehicle-prototypes"], limitations: []
      };
    }
    if (powertrain === "electric") {
      return {
        defined: true, value: 0.95, min: 0.95, max: 0.99,
        method: "zheng-ev-mechanical-starting-value",
        sourceRefs: ["source.book.zheng-electric-drive"],
        limitations: [
          "0,95 — попереднє редаговане значення механічного редуктора, а не ККД батареї, інвертора чи електромашини.",
          "Після вибору e-axle або редуктора його замінюють паспортним значенням чи картою втрат."
        ]
      };
    }
    let suggestion = suggestEfficiencyRange({ category, axleFormula, doubleFinalDrive });
    // M2 — автобус малого класу за регуляторною категорією, але розмірного
    // класу в моделі немає. Даємо той самий ряд лише як явне припущення.
    if (!suggestion && category === "M2" && axleFormula === "4x2") {
      suggestion = {
        id: "car-small-bus-4x2",
        caveat: "Категорія M2 не доводить належності автобуса до особливо малого або малого класу."
      };
    }
    const range = suggestion ? efficiencyRange(suggestion.id) : null;
    if (!range && axleFormula === "4x4") {
      // A preliminary path to ONE driven axle: two gearbox pairs, one transfer
      // pair, one final-drive pair and that branch's joints. Parallel axle
      // branches must not have their efficiencies multiplied together.
      const counts = { cylindricalPairs: 3, bevelPairs: 1, cardanJoints: 2, splineJoints: 1 };
      const estimate = transmissionEfficiency(counts);
      return { defined: true, value: estimate.efficiency, counts,
        method: "preliminary-4x4-path-estimate",
        sourceRefs: ["source.method.opanasyuk", "source.project-input"],
        limitations: ["Початкова схема 4×4: на шляху до однієї осі прийнято 3 циліндричні пари (КПП і роздавальна), 1 конічну пару, 2 карданні шарніри та 1 шліцьове з’єднання. Паралельні гілки не перемножуються. Склад схеми — припущення проєкту; коефіцієнти втрат — за Опанасюком. Втрати в підшипниках не враховано; ККД можна уточнити вручну."] };
    }
    if (!range) {
      return { defined: false, reason: "Таблиця не містить рядка для прийнятої категорії та колісної формули." };
    }
    return {
      defined: true,
      value: (range.min + range.max) / 2,
      min: range.min,
      max: range.max,
      label: range.label,
      method: "course-efficiency-range-midpoint",
      sourceRefs: ["source.method.course"],
      limitations: suggestion.caveat ? [suggestion.caveat] : []
    };
  }

  // Спільна форма перехресної перевірки для 4.1.2 і 4.1.3: значення лишається
  // тим, що дала формула; таблиця лише повідомляє про незгоду, нічого не
  // усереднюючи й не підмінюючи.
  function crossCheck(value, range) {
    if (!range) return { status: "no-range", range: null, value };
    const number = finiteNumber(value);
    if (!Number.isFinite(number)) return { status: "no-value", range, value };
    if (number < range.min) return { status: "below", range, value: number };
    if (number > range.max) return { status: "above", range, value: number };
    return { status: "within", range, value: number };
  }

  // --------------------------------------------------------------- 4.1.3 ---

  // W = ½ρCdA. За ρ = 1,225 кг/м³ це W = 0,6125·Cd·A, але 0,6125 ніде не
  // зашито: множник завжди рахується з поточного ρ, яке є входом.
  function dragFactor({ airDensityKgM3, dragCoef, frontalAreaM2 }) {
    const rho = finiteNumber(airDensityKgM3);
    const cd = finiteNumber(dragCoef);
    const area = finiteNumber(frontalAreaM2);
    const halfDensity = rho / 2;
    return {
      airDensityKgM3: rho,
      dragCoef: cd,
      frontalAreaM2: area,
      halfDensity,
      // К за позначенням Опанасюка, Н·с²/м⁴.
      dragCoefficientK: halfDensity * cd,
      // W = KF, Н·с²/м².
      dragFactorW: halfDensity * cd * area
    };
  }

  // Таблиця 5 Опанасюка, «Орієнтовні значення фактору опору повітря W»,
  // Н·с²/м². Перенесено всі тринадцять рядків у порядку джерела.
  const DRAG_FACTOR_RANGES = Object.freeze([
    { id: "car-extra-small", label: "Легкові особливо малого класу", min: 0.5, max: 0.6 },
    { id: "car-small", label: "Легкові малого класу", min: 0.6, max: 0.7 },
    { id: "car-medium", label: "Легкові середнього класу", min: 0.75, max: 0.85 },
    { id: "car-large", label: "Легкові великого класу", min: 0.85, max: 0.95 },
    { id: "goods-to-1t", label: "Вантажні вантажопідйомністю до 1 т", min: 1.2, max: 1.5 },
    { id: "goods-1-2.5t", label: "Вантажні вантажопідйомністю 1,1…2,5 т", min: 1.6, max: 2.0 },
    { id: "goods-2.6-4t", label: "Вантажні вантажопідйомністю 2,6…4,0 т", min: 2.1, max: 2.8 },
    { id: "goods-over-4t", label: "Вантажні вантажопідйомністю понад 4 т", min: 2.9, max: 3.5 },
    {
      id: "trailer-train-van",
      label: "Автопоїзд причіпний: тягач з кузовом-фургоном і причепом-фургоном",
      min: 3.9, max: 4.0
    },
    {
      id: "trailer-train-platform",
      label: "Автопоїзд причіпний: тягач з бортовою платформою і бортовим причепом",
      min: 4.3, max: 4.4
    },
    {
      id: "semitrailer-4x2",
      label: "Сідельний автопоїзд: тягач 4×2 з напівпричепом-фургоном",
      min: 3.4, max: 3.5
    },
    {
      id: "semitrailer-6x4",
      label: "Сідельний автопоїзд: тягач 6×4 з напівпричепом-фургоном",
      min: 4.2, max: 4.4
    },
    {
      id: "bus-vagon",
      label: "Автобуси з кузовом вагонного типу середньої і великої пасажиромісткості",
      min: 2.9, max: 3.6
    }
  ].map(Object.freeze));

  function dragFactorRange(rangeId) {
    return DRAG_FACTOR_RANGES.find(range => range.id === rangeId) || null;
  }

  // Рядок таблиці 5 для цього автомобіля, або null. Легкові розділено на
  // чотири розмірні класи, яких модель даних не містить, тому для M1 рядок не
  // вгадується; для M2 таблиця рядка не має взагалі.
  function suggestDragFactorRange({ category, payloadKg }) {
    if (["M1", "M2"].includes(category)) return null;
    if (category === "M3") return { id: "bus-vagon", caveat: null };
    if (!["N1", "N2", "N3"].includes(category)) return null;
    const payloadTonnes = finiteNumber(payloadKg) / 1000;
    if (!Number.isFinite(payloadTonnes) || payloadTonnes <= 0) return null;
    // Джерело членує рядки за вантажопідйомністю: до 1 т, 1,1…2,5, 2,6…4,0,
    // понад 4. Автопоїзди мають власні рядки й тут не пропонуються — причіпний
    // склад не є частиною моделі даних.
    if (payloadTonnes <= 1) return { id: "goods-to-1t", caveat: null };
    if (payloadTonnes <= 2.5) return { id: "goods-1-2.5t", caveat: null };
    if (payloadTonnes <= 4) return { id: "goods-2.6-4t", caveat: null };
    return { id: "goods-over-4t", caveat: null };
  }

  // ------------------------------------------- прийняття значень із полів ---

  // Кількість елементів трансмісії з поля вводу. Порожнє поле — це «не
  // задано», а не нуль: Number(null) і Number("") обидва дають 0, тобто скінченне
  // число, і без цієї перевірки незаповнене поле мовчки прийнялося б за
  // відсутність елементів, а ηм — за одиницю.
  function adoptCount(value) {
    const absent = value === null || value === undefined || String(value).trim() === "";
    if (absent) return { defined: false, value: null, reason: "Кількість не задано." };
    const number = finiteNumber(value);
    if (!Number.isFinite(number) || number < 0 || !Number.isInteger(number)) {
      return {
        defined: false,
        value: null,
        reason: "Кількість елементів має бути цілим невід'ємним числом."
      };
    }
    return { defined: true, value: number, reason: null };
  }

  // Те саме для додатних величин Cd, A і ρ: порожнє поле не стає нулем.
  function adoptPositiveNumber(value, label) {
    const absent = value === null || value === undefined || String(value).trim() === "";
    if (absent) return { defined: false, value: null, reason: `${label} не задано.` };
    const number = finiteNumber(value);
    if (!Number.isFinite(number) || number <= 0) {
      return { defined: false, value: null, reason: `${label} має бути додатним числом.` };
    }
    return { defined: true, value: number, reason: null };
  }

  // Текст перехресної перевірки для інтерфейсу. Значення тут не змінюється й не
  // замінюється: повідомлення лише називає стан, включно зі станом «джерело
  // діапазону не подає», який має бути видимим, а не мовчазним успіхом.
  function crossCheckMessage(check, options) {
    const settings = options || {};
    const symbol = settings.symbol || "значення";
    const unit = settings.unit || "";
    const format = settings.format || (value => String(value).replace(".", ","));
    const bounds = check.range
      ? `${format(check.range.min)}…${format(check.range.max)}${unit}`
      : null;
    const caveat = settings.caveat ? ` ${settings.caveat}` : "";
    // Рядок таблиці може не мати назви (наприклад, у тестах): тоді речення
    // просто не згадує рядка, замість «для рядка «undefined»».
    const forRow = check.range && check.range.label
      ? ` для рядка «${check.range.label}»`
      : "";
    if (check.status === "no-range") {
      return `Джерело не подає діапазону ${symbol} для цього автомобіля, тому `
        + `перехресну перевірку не виконано.`
        + (settings.noRangeReason ? ` ${settings.noRangeReason}` : "")
        + caveat;
    }
    if (check.status === "no-value") {
      return `${symbol} не обчислено, тому перехресну перевірку не виконано.` + caveat;
    }
    const value = `${symbol} = ${format(check.value)}${unit}`;
    if (check.status === "within") {
      return `Обчислене ${value} лежить у діапазоні ${bounds}, який джерело подає${forRow}.`
        + caveat;
    }
    const side = check.status === "below" ? "нижче за" : "вище за";
    return `Обчислене ${value} лежить ${side} діапазон ${bounds}, який джерело `
      + `подає${forRow}. Значення залишено таким, як його дала формула.`
      + (settings.disagreementHint ? ` ${settings.disagreementHint}` : "")
      + caveat;
  }

  // ------------------------------------------------------ кроки розрахунку --

  function crossCheckLimitations(check, symbol, unit) {
    if (check.status === "no-range") {
      return [
        `Таблиця джерела не подає діапазону ${symbol} для цього класу ` +
        `автомобіля, тому перехресну перевірку не виконано.`
      ];
    }
    if (check.status === "below" || check.status === "above") {
      const side = check.status === "below" ? "нижче за" : "вище за";
      const range = `${String(check.range.min).replace(".", ",")}…${String(check.range.max).replace(".", ",")}`;
      // Назва рядка обчислюється тут: у crossCheckMessage вона своя, і
      // звертання до чужої локальної змінної валило весь перерахунок.
      const forRow = check.range.label ? ` для рядка «${check.range.label}»` : "";
      return [
        `Обчислене ${symbol} лежить ${side} діапазон ${range}${unit}, який ` +
        `джерело подає${forRow}.`
      ];
    }
    return [];
  }

  function buildWheelLoadStep(context) {
    const { loads, grossWeightForceKn, texNumber } = context;
    const trace = loads.rows
      .map(row => `G_{\\mathrm{ш}${row.axleNumber}}=${texNumber(row.axleForceKn, 2)}/${row.tyreCount}=${texNumber(row.wheelForceKn, 2)}`)
      .join(";\\quad ");
    return {
      id: "wheel-load-per-tyre",
      title: "Навантаження на шину",
      purpose: "Determine the per-tyre load on every axle and identify the governing one.",
      output: {
        id: "value.governing-wheel-load",
        symbol: "G_{\\mathrm{ш}}",
        label: "Governing per-tyre load",
        valueType: "quantity",
        canonicalUnit: "kN"
      },
      expression: "max_i(G_i / n_i)",
      dependencies: ["value.axle-forces", "decision.wheel-layout"],
      equationNumber: "4.1",
      formulaTex: "G_{\\mathrm{ш}}=\\frac{G_i}{n}",
      substitutionTex: `${trace};\\quad G_{\\mathrm{ш}}=${texNumber(loads.governing ? loads.governing.wheelForceKn : 0, 2)}\\;\\mathrm{кН}`,
      result: {
        value: loads.governing ? loads.governing.wheelForceKn : null,
        canonicalUnit: "kN",
        displayUnit: "кН"
      },
      method: "opanasyuk-2.1.1",
      sourceRefs: ["source.method.opanasyuk"],
      assumptions: [
        "n = 2 on single-tyre axles and n = 4 on dual-tyre axles, per the source.",
        "The tyre is selected from the largest per-tyre load among all axles.",
        `Силу ваги завантаженого автомобіля ${plainNumber(grossWeightForceKn, 2)} кН розподілено за попередніми частками навантаження на осі з розділу 3.`
      ]
    };
  }

  function buildTyreRequirementStep(context) {
    const { requirement, loads, maximumSpeedKmh, texNumber } = context;
    const kgf = loads.governing ? loads.governing.wheelLoadKgf : 0;
    const limitations = [];
    if (requirement.loadIndex.exceedsTable) {
      limitations.push(
        `Навантаження на шину ${plainNumber(kgf, 0)} кгс перевищує ` +
        `${requirement.loadIndex.tableMaxKgf} кгс — найбільше значення таблиці 12, ` +
        `тому індекс несучої здатності не визначено.`);
    }
    if (requirement.speedCategory.exceedsTable) {
      limitations.push(
        `Швидкість ${plainNumber(maximumSpeedKmh, 0)} км/год перевищує ` +
        `${requirement.speedCategory.tableMaxSpeedKmh} км/год — найбільшу швидкість ` +
        `таблиці 13, тому категорію швидкості не визначено.`);
    }
    if (requirement.dual) {
      limitations.push(
        "Найнавантаженіший міст двоскатний: у позначенні шини через дріб " +
        "(наприклад 98/96) для здвоєної установки читають ДРУГИЙ, менший індекс.");
    }
    limitations.push(
      "ГОСТ 4754-80 і 5513-86, на які посилається джерело, проєкт не містить, " +
      "тому підрозділ подає вимогу до шини, а не позначення конкретної шини зі стандарту.");
    return {
      id: "tyre-requirement",
      title: "Вимога до шини за навантаженням і швидкістю",
      purpose: "State the load index and speed category the tyre must meet.",
      output: {
        id: "value.tyre-requirement",
        symbol: null,
        label: "Required tyre load index and speed category",
        valueType: "text",
        canonicalUnit: null
      },
      expression: "minLoadIndex(G_wheel_kgf) and minSpeedCategory(V_max_kmh)",
      dependencies: ["value.governing-wheel-load", "input.maximum-speed"],
      equationNumber: null,
      formulaTex: "\\mathrm{ИНС}\\ge G_{\\mathrm{ш}},\\qquad V_{\\text{кат}}\\ge V_{\\max}",
      substitutionTex: requirement.text
        ? `G_{\\mathrm{ш}}=${texNumber(kgf, 0)}\\;\\text{кгс},\\;V_{\\max}=${texNumber(maximumSpeedKmh, 0)}\\;\\text{км/год}\\Rightarrow\\text{${requirement.text}}`
        : `G_{\\mathrm{ш}}=${texNumber(kgf, 0)}\\;\\text{кгс},\\;V_{\\max}=${texNumber(maximumSpeedKmh, 0)}\\;\\text{км/год}`,
      result: { value: requirement.text, canonicalUnit: null, displayUnit: "" },
      method: requirement.complete ? "load-index-table" : "outside-table",
      sourceRefs: ["source.reference.tyre-index-tables", "source.method.opanasyuk"],
      assumptions: [
        "The load index table is read in kgf; the per-tyre force is converted with g = 9.81 m/s².",
        "The requirement is a minimum, not a designation of a specific tyre."
      ],
      limitations
    };
  }

  // Крок 4.1.1 — статичний радіус із позначення шини за Оберемком (2.1).
  function buildStaticRadiusStep(context) {
    const { parsed, aspect, deflection, radius, texNumber } = context;
    const limitations = [
      "Оберемок, с. 18: значення r_ст при максимальному допустимому "
      + "навантаженні стандартизовані, а формула (2.1) дає його наближено.",
      "Оберемок, с. 18: r_ст і r_д змінюються залежно від навантаження на "
      + "колесо й тиску повітря в шині; r_д, крім того, дещо зростає зі "
      + "зростанням кутової швидкості колеса й зменшується зі зростанням "
      + "переданого крутного моменту.",
      `Оберемок, с. 19, рівняння (2.3): радіус кочення у вільному режимі `
      + `r_к^с = (1,03…1,06)·r_ст = `
      + `${plainNumber(radius.freeRollingRadiusMinM, 3)}…`
      + `${plainNumber(radius.freeRollingRadiusMaxM, 3)} м.`
    ];
    if (aspect.basis === "code") {
      limitations.push(
        "Δ = H/B прочитано із самого позначення, тому запасні значення H/B "
        + "Оберемка (1,0 / 0,95 / 0,8…0,85) до нього НЕ застосовуються.");
    } else if (aspect.fallback) {
      limitations.push(
        `Позначення не містить відношення H/B, тому Δ узято з тексту `
        + `Оберемка, с. 18, рядок «${aspect.fallback.label}».`);
    }
    if (aspect.isMidpointDefault && aspect.fallback && aspect.fallback.min !== aspect.fallback.max) {
      limitations.push(
        "Джерело подає для Δ діапазон, а не точкове значення; прийнято "
        + "середину діапазону як значення за замовчуванням.");
    }
    if (deflection.isMidpointDefault) {
      limitations.push(
        "Джерело подає для λ_ст діапазон, а не точкове значення; прийнято "
        + "середину діапазону як значення за замовчуванням.");
    }
    if (deflection.range && deflection.withinRange === false) {
      limitations.push(
        `Прийняте λ_ст = ${plainNumber(deflection.value, 3)} лежить поза `
        + `діапазоном ${String(deflection.range.min).replace(".", ",")}…`
        + `${String(deflection.range.max).replace(".", ",")}, який джерело подає для рядка `
        + `«${deflection.range.label}».`);
    }
    if (deflection.caveat) limitations.push(deflection.caveat);
    return {
      id: "static-wheel-radius",
      title: "Статичний радіус шини за позначенням",
      purpose: "Compute the static tyre radius from its size designation.",
      output: {
        id: "value.static-wheel-radius",
        symbol: "r_{\\mathrm{ст}}",
        label: "Static tyre radius",
        valueType: "quantity",
        canonicalUnit: "m"
      },
      expression: "0.5 * d_rim + aspect_ratio * lambda_static * section_width",
      dependencies: ["input.tyre-designation", "decision.tyre-deflection-coefficient"],
      equationNumber: "4.2",
      formulaTex: "r_{\\mathrm{ст}}=0{,}5d+\\Delta\\lambda_{\\mathrm{ст}}B",
      substitutionTex: `r_{\\mathrm{ст}}=0{,}5\\cdot${texNumber(parsed.rimDiameterMm, 1)}`
        + `+${texNumber(aspect.value, 3)}\\cdot${texNumber(deflection.value, 3)}`
        + `\\cdot${texNumber(parsed.sectionWidthMm, 1)}=${texNumber(radius.radiusMm, 1)}`
        + `\\;\\mathrm{мм}=${texNumber(radius.radiusM, 3)}\\;\\mathrm{м}`,
      result: { value: radius.radiusM, canonicalUnit: "m", displayUnit: "м" },
      method: aspect.basis === "code" ? "oberemok-2.1-aspect-from-code" : "oberemok-2.1-aspect-from-table",
      sourceRefs: ["source.method.oberemok"],
      assumptions: [
        "d is the rim seat diameter in millimetres, converted from the inch figure of the designation.",
        "B is the section width in millimetres, converted where the designation states it in inches.",
        "Оберемок, с. 17: on hard road surfaces r_ст = r_д may be assumed; the "
        + "course methodic (Опанасюк, §2.1.1) takes r_д ≈ r_к ≈ r_ст on the same grounds."
      ],
      limitations
    };
  }

  function buildDynamicRadiusStep(context) {
    const { radius, texNumber } = context;
    return {
      id: "dynamic-wheel-radius",
      title: "Динамічний радіус колеса",
      purpose: "Adopt the dynamic wheel radius from the static radius of the selected tyre.",
      output: {
        id: "value.dynamic-wheel-radius",
        symbol: "r_{\\mathrm{д}}",
        label: "Dynamic wheel radius",
        valueType: "quantity",
        canonicalUnit: "m"
      },
      expression: "r_static",
      dependencies: ["value.static-wheel-radius"],
      equationNumber: null,
      // «Вказаний радіус rс приймають за динамічний rд, тобто вважають, що
      // rс ≈ rд» — Опанасюк, §2.1.1.
      formulaTex: "r_{\\mathrm{д}}\\approx r_{\\mathrm{ст}}",
      substitutionTex: `r_{\\mathrm{д}}\\approx r_{\\mathrm{ст}}=${texNumber(radius.radiusM, 3)}\\;\\mathrm{м}`,
      result: { value: radius.radiusM, canonicalUnit: "m", displayUnit: "м" },
      method: radius.method,
      sourceRefs: [radius.sourceRef, "source.method.opanasyuk"],
      assumptions: [
        "The source takes the static radius from the standard as the dynamic radius."
      ],
      limitations: radius.limitations || []
    };
  }

  function buildTransmissionEfficiencyStep(context) {
    const { efficiency, check, texNumber } = context;
    const { cylindricalPairs: k, bevelPairs: l, cardanJoints: m, splineJoints: p } = efficiency;
    return {
      id: "transmission-efficiency",
      title: "Механічний ККД трансмісії",
      purpose: "Compute the mechanical transmission efficiency from the count of its elements.",
      output: {
        id: "value.transmission-efficiency",
        symbol: "\\eta_{\\mathrm{м}}",
        label: "Mechanical transmission efficiency",
        valueType: "number",
        canonicalUnit: null
      },
      expression: "0.98^k * 0.97^l * 0.995^m * 0.999^p",
      dependencies: [
        "input.cylindrical-gear-pairs",
        "input.bevel-gear-pairs",
        "input.cardan-joints",
        "input.spline-joints"
      ],
      equationNumber: "4.3",
      formulaTex: "\\eta_{\\mathrm{м}}=0{,}98^{k}\\cdot0{,}97^{l}\\cdot0{,}995^{m}\\cdot0{,}999^{p}",
      substitutionTex: `\\eta_{\\mathrm{м}}=0{,}98^{${k}}\\cdot0{,}97^{${l}}\\cdot0{,}995^{${m}}\\cdot0{,}999^{${p}}=${texNumber(efficiency.efficiency, 3)}`,
      result: { value: efficiency.efficiency, canonicalUnit: null, displayUnit: "" },
      method: "opanasyuk-2.1.2",
      sourceRefs: ["source.method.opanasyuk"],
      assumptions: [
        "Bearing losses in the transmission units are neglected (source statement).",
        "The element counts belong to one specific gear and require a kinematic scheme."
      ],
      limitations: crossCheckLimitations(check, "\\eta_{м}", "")
    };
  }

  function buildDragFactorStep(context) {
    const { drag, check, texNumber } = context;
    return {
      id: "drag-factor",
      title: "Фактор опору повітря",
      purpose: "Derive the drag factor W from the drag coefficient, frontal area and air density.",
      output: {
        id: "value.drag-factor",
        symbol: "W",
        label: "Air-resistance factor",
        valueType: "quantity",
        canonicalUnit: "N*s^2/m^2"
      },
      expression: "0.5 * rho * Cd * A",
      dependencies: [
        "input.air-density",
        "decision.drag-coefficient",
        "decision.frontal-area"
      ],
      equationNumber: "4.4",
      formulaTex: "W=\\tfrac{1}{2}\\rho\\,C_dA",
      substitutionTex: `W=0{,}5\\cdot${texNumber(drag.airDensityKgM3, 3)}\\cdot${texNumber(drag.dragCoef, 3)}\\cdot${texNumber(drag.frontalAreaM2, 2)}=${texNumber(drag.dragFactorW, 3)}\\;\\mathrm{Н\\cdot с^2/м^2}`,
      result: {
        value: drag.dragFactorW,
        canonicalUnit: "N*s^2/m^2",
        displayUnit: "Н·с²/м²"
      },
      method: "cd-area-derived",
      sourceRefs: ["source.method.opanasyuk", "source.standard.isa-sea-level-density"],
      assumptions: [
        "W = KF of the source, with K = ½ρCd in N·s²/m⁴.",
        "Air density is an explicit input with its own source, not a buried constant."
      ],
      limitations: crossCheckLimitations(check, "W", " Н·с²/м²")
    };
  }

  return Object.freeze({
    STANDARD_GRAVITY,
    ISA_SEA_LEVEL_AIR_DENSITY,
    CYLINDRICAL_PAIR_EFFICIENCY,
    BEVEL_PAIR_EFFICIENCY,
    CARDAN_JOINT_EFFICIENCY,
    SPLINE_JOINT_EFFICIENCY,
    LOAD_INDEX_KGF,
    SPEED_CATEGORIES,
    EFFICIENCY_RANGES,
    DRAG_FACTOR_RANGES,
    INCH_MM,
    FREE_ROLLING_RADIUS_FACTORS,
    TYRE_TABLE_SOURCE_REF,
    ASPECT_RATIO_FALLBACKS,
    DEFLECTION_RANGES,
    parseTyreDesignation,
    vehicleTyreKind,
    adoptWithinRange,
    resolveAspectRatio,
    aspectRatioFallback,
    deflectionRange,
    suggestDeflectionRange,
    staticWheelRadius,
    buildStaticRadiusStep,
    wheelLoads,
    requiredLoadIndex,
    requiredSpeedCategory,
    tyreRequirement,
    transmissionEfficiency,
    efficiencyRange,
    suggestEfficiencyRange,
    preliminaryTransmissionEfficiency,
    dragFactor,
    dragFactorRange,
    suggestDragFactorRange,
    crossCheck,
    crossCheckMessage,
    crossCheckLimitations,
    adoptCount,
    adoptPositiveNumber,
    buildWheelLoadStep,
    buildTyreRequirementStep,
    buildDynamicRadiusStep,
    buildTransmissionEfficiencyStep,
    buildDragFactorStep
  });
}
