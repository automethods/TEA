"use strict";

// Розділ 9 — зчеплення. Сухе фрикційне дискове.
//
// АРИФМЕТИКИ ТУТ НЕМАЄ. Вона живе в `manuscript/calculations/clutch.engdoc.md`,
// як вимагає домовленість про нові розділи: рукопис показує читачеві рівняння,
// engdoc його обчислює, а цей модуль тримає те, що обчисленням не є, —
// джерела, профілі методів і прийняття рішень.
//
// ДВА ДЖЕРЕЛА, ЯКІ НЕ ЗБІГАЮТЬСЯ.
//
// Дві методички описують той самий розрахунок і друкують різні числа:
// коефіцієнт запасу, коефіцієнт тертя, поріг підсилювача, допустиме
// напруження витків. Розбіжності записано в
// `Data/Vehicle/docs/clutch_sources.md`, і зводити їх в один діапазон не
// можна — вийшло б число, якого не друкує жодне джерело.
//
// Тому вибирають НЕ окрему величину, а метод цілком. Профіль задає всі
// діапазони, пороги й межі разом, бо кожна методичка — узгоджена система:
// β = 2,2 має сенс поряд із діапазонами μ і k тієї самої книжки,
// а не в суміші з чужими. Незалежний вибір джерела на кожну величину дав би
// гібрид, якого не рекомендує ніхто.
export function createClutch({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;


  // Профілі методів. Кожен — цілісна система з одного джерела.
  const METHOD_PROFILES = Object.freeze([
    {
      id: "course-methodic",
      label: "Методичні вказівки до курсового проєкту (с. 37—38)",
      // Два простори імен, і плутати їх не можна: sourceRef — ідентифікатор
      // бібліографії (для знака посилання на сторінці), documentSourceId —
      // ідентифікатор джерела в канонічному документі. Це вже коштувало цьому
      // проєктові кількох мовчазних помилок.
      sourceRef: "course-methodic",
      documentSourceId: "source.method.course",
      reserveFactor: { min: 1.75, max: 2.5, byVehicleType: null },
      liningPressureMpa: { min: 0.15, max: 0.3 },
      frictionCoefficient: { min: 0.25, max: 0.65 },
      widthRatio: { min: 0.375, max: 0.62 },
      // Числа звірено з друком (djvu, с. 37—39), і звірка виправила три
      // значення, які досі стояли з розшифровки: поріг підсилювача 8 кН
      // (у друці 9), [τ] 600 МПа (у друці 800) і товщину рядка 200 × 130.
      // Усі три виглядали як розбіжність між книжками, а були помилками
      // розпізнавання однієї з них.
      boosterThresholdN: 9000,
      allowableShearMpa: 800,
      // Правило вибору рядка таблиці — теж частина методу, і воно різне:
      // «обирають найближче БІЛЬШЕ».
      rowSelection: "nearest-larger",
      // Таблиця та сама, крім одного рядка: у цій книжці 254 × 150 витримує
      // 0,18 МПа, а не 0,25. Обидва числа прочитані з друку, тому це
      // розбіжність джерел, а не помилка.
      liningTableOverrides: Object.freeze({ "lining.254x150": { pressureMaxMpa: 0.18 } }),
      // Пружини, с. 38—39. Ця книжка ділить саму P_н між пружинами.
      // Тарільчаста пружина, с. 40. Ця книжка подає ще й товщину та кількість
      // пелюсток, чого немає в Опанасюка.
      diaphragm: Object.freeze({
        outerToMean: { min: 1.2, max: 1.5 },
        outerToInner: { min: 2.5, max: 3.5 },
        outerToThickness: { min: 75, max: 100 },
        heightToThickness: { min: 1.5, max: 2 },
        allowableStressMpa: 1400,
        youngModulusGPa: 210,
        poissonRatio: 0.26,
        // Вираз для напруження в цієї книжки СВІЙ, і зводити його з чужим не
        // можна: у неї α = H/(b−a), множник 0,5 на обох членах і МІНУС біля
        // товщинного — вона рахує точку B, середину основи пелюстки, при
        // деформації до плоского стану. Числа-константи відтворюють
        // надруковане рівняння точно.
        stress: Object.freeze({
          alphaFactor: 1,
          bendingCoefficient: 0.5,
          thicknessCoefficient: -0.5,
          modulusCoefficient: 1,
          point: "середина основи пелюстки (точка B), деформація до плоского стану"
        }),
        thicknessMm: Object.freeze({
          passenger: { min: 2, max: 2.5 },
          goods: { min: 3, max: 5 }
        }),
        petals: { min: 8, max: 20 }
      }),
      springs: Object.freeze({
        releaseFactor: { min: 1, max: 1 },
        unevenFactor: { min: 1.1, max: 1.2 },
        allowableShearMpa: 800,
        shearModulusGPa: 85,
        disengagementTravelMm: { singleDisc: 3, twinDisc: 4 },
        deadCoils: { min: 1.5, max: 2 }
      }),
      verified: "rendered-pages"
    },
    {
      id: "opanasyuk",
      label: "Опанасюк Є. Г. (с. 28—32, рівняння 46—52)",
      // Опанасюк, не Оберемок: Оберемок — джерело до шин, прізвища схожі,
      // і обидва трапляються в цьому розділі.
      sourceRef: "opanasyuk",
      documentSourceId: "source.method.opanasyuk",
      reserveFactor: {
        min: 1.2, max: 3.0,
        byVehicleType: Object.freeze({
          passenger: { min: 1.2, max: 1.75 },
          goods: { min: 1.5, max: 2.2 },
          offRoad: { min: 1.8, max: 3.0 }
        })
      },
      liningPressureMpa: { min: 0.14, max: 0.3 },
      // Прочитано з рендеру с. 28, рівняння (46). Тут стояло null, а діапазон
      // ширини був скопійований з іншої методички — тобто саме та суміш двох
      // джерел, якій профілі й мають запобігати.
      frictionCoefficient: { min: 0.25, max: 0.5 },
      widthRatio: { min: 0.38, max: 0.63 },
      boosterThresholdN: 9000,
      allowableShearMpa: 800,
      // «За обчисленою величиною Д_з підбирають з табл. 11 НАЙБЛИЖЧЕ
      // значення» — не найближче більше. Різниця не косметична: для
      // Д' = 209,6 мм це 204 × 146 замість 254 × 150.
      rowSelection: "nearest",
      liningTableOverrides: null,
      // Пружини, с. 30—31, рівняння (47)—(50). Ця книжка додає до сили
      // стиснення протидію відтяжних і відтискних пружин: P_о = (0,05…0,08)P_н.
      // Тарільчаста пружина, с. 32. Висота до товщини тут інша: 1,6…2,8
      // проти 1,5…2,0 у курсовій методичці — розбіжність, звірена з друком.
      diaphragm: Object.freeze({
        outerToMean: { min: 1.2, max: 1.5 },
        outerToInner: { min: 2.5, max: 3.5 },
        outerToThickness: { min: 75, max: 100 },
        heightToThickness: { min: 1.6, max: 2.8 },
        allowableStressMpa: 1400,
        youngModulusGPa: 210,
        poissonRatio: 0.26,
        // Рівняння (52): α = 2h/(Д₁−Д₂), 0,5 на згинному члені, ПЛЮС біля
        // товщинного і 0,5E — вона рахує середину пелюстків розрізаної
        // частини за найбільшої деформації. Для тієї самої пружини це дає
        // 862 МПа проти 404 у курсової методички.
        stress: Object.freeze({
          alphaFactor: 2,
          bendingCoefficient: 0.5,
          thicknessCoefficient: 1,
          modulusCoefficient: 0.5,
          point: "середина пелюстків розрізаної частини, найбільша деформація"
        }),
        // Товщини й кількості пелюсток ця книжка не подає — вигадувати їх
        // за неї не можна.
        thicknessMm: null,
        petals: null
      }),
      springs: Object.freeze({
        releaseFactor: { min: 1.05, max: 1.08 },
        unevenFactor: { min: 1.1, max: 1.2 },
        allowableShearMpa: 800,
        shearModulusGPa: 85,
        disengagementTravelMm: { singleDisc: 3, twinDisc: 4 },
        deadCoils: { min: 1.5, max: 2 }
      }),
      verified: "rendered-pages"
    },
    {
      id: "datasheet",
      // Нічого не радить навмисно. Це не «порожній профіль», а відмова від
      // чисел, надрукованих для азбестових накладок, заборонених у ЄС із
      // 2005 року.
      label: "Паспорт накладки й власні дані проєкту",
      sourceRef: null,
      documentSourceId: null,
      reserveFactor: null,
      liningPressureMpa: null,
      frictionCoefficient: null,
      widthRatio: null,
      boosterThresholdN: null,
      allowableShearMpa: null,
      // Паспорт накладки не подає ані ряду розмірів, ані правила вибору з
      // нього: розмір у цієї основи вже відомий.
      rowSelection: null,
      liningTableOverrides: null,
      // Паспорт пружини подає її саму, а не діапазони методу.
      springs: null,
      diaphragm: null,
      verified: "project-input"
    }
  ]);

  // Таблиця 11 Опанасюка — витяг із ГОСТ 1786-88, прочитаний із рендеру
  // сторінок 29—30, а не з розшифровки.
  //
  // Дотепер діаметри були просто числами: рукопис писав «приймають за
  // таблицею», а застосунок брав будь-що від 100 до 500 мм і мовчки називав
  // це прийнятим за таблицею. Тепер рядок або є в таблиці, або основа
  // прийняття інша й названа інакше.
  //
  // Стандарт описує АЗБЕСТОВІ накладки; азбест у фрикційних матеріалах
  // заборонений у ЄС із 2005 року. Тому цей ряд — історична опція, і кожне
  // прийняте з нього рішення несе цю межу з собою.
  //
  // Верхня межа тиску залежить від рядка: 0,25 МПа до 300 включно і 0,30 МПа
  // від 340. Одного діапазону профілю тут замало.
  const LINING_TABLE = Object.freeze([
    { outerMm: 160, innerMm: 110, thicknessMm: 3.3, pressureMinMpa: 0.14, pressureMaxMpa: 0.25, liningType: 3, continuousTempC: 200, shortTempC: 300 },
    { outerMm: 180, innerMm: 125, thicknessMm: 3.5, pressureMinMpa: 0.14, pressureMaxMpa: 0.25, liningType: 3, continuousTempC: 200, shortTempC: 300 },
    { outerMm: 184, innerMm: 125, thicknessMm: 3.5, pressureMinMpa: 0.14, pressureMaxMpa: 0.25, liningType: 3, continuousTempC: 200, shortTempC: 300 },
    { outerMm: 190, innerMm: 130, thicknessMm: 3.5, pressureMinMpa: 0.14, pressureMaxMpa: 0.25, liningType: 3, continuousTempC: 200, shortTempC: 350 },
    { outerMm: 200, innerMm: 130, thicknessMm: 3.3, pressureMinMpa: 0.14, pressureMaxMpa: 0.25, liningType: 5, continuousTempC: 200, shortTempC: 300 },
    { outerMm: 200, innerMm: 140, thicknessMm: 3.5, pressureMinMpa: 0.14, pressureMaxMpa: 0.25, liningType: 3, continuousTempC: 200, shortTempC: 300 },
    { outerMm: 204, innerMm: 146, thicknessMm: 3.3, pressureMinMpa: 0.14, pressureMaxMpa: 0.25, liningType: 3, continuousTempC: 200, shortTempC: 300 },
    { outerMm: 254, innerMm: 150, thicknessMm: 3.5, pressureMinMpa: 0.14, pressureMaxMpa: 0.25, liningType: 3, continuousTempC: 200, shortTempC: 350 },
    { outerMm: 280, innerMm: 164, thicknessMm: 3.5, pressureMinMpa: 0.14, pressureMaxMpa: 0.25, liningType: 3, continuousTempC: 200, shortTempC: 300 },
    { outerMm: 300, innerMm: 164, thicknessMm: 4.0, pressureMinMpa: 0.14, pressureMaxMpa: 0.25, liningType: 1, continuousTempC: 200, shortTempC: 350 },
    { outerMm: 340, innerMm: 186, thicknessMm: 4.0, pressureMinMpa: 0.14, pressureMaxMpa: 0.30, liningType: 1, continuousTempC: 200, shortTempC: 350 },
    { outerMm: 342, innerMm: 186, thicknessMm: 4.0, pressureMinMpa: 0.14, pressureMaxMpa: 0.30, liningType: 1, continuousTempC: 200, shortTempC: 350 },
    { outerMm: 350, innerMm: 200, thicknessMm: 4.7, pressureMinMpa: 0.14, pressureMaxMpa: 0.30, liningType: 1, continuousTempC: 200, shortTempC: 350 },
    // Короткочасна температура тут справді нижча за попередні рядки: так
    // надруковано в джерелі.
    { outerMm: 400, innerMm: 220, thicknessMm: 4.2, pressureMinMpa: 0.14, pressureMaxMpa: 0.30, liningType: 1, continuousTempC: 200, shortTempC: 250 }
  ].map(row => Object.freeze({ ...row, id: `lining.${row.outerMm}x${row.innerMm}` })));

  // Таблиця належить методу, а не проєктові.
  //
  // Обидві книжки друкують той самий витяг із ГОСТ 1786-88, і рядки збігаються
  // — крім одного: у курсовій методичці 254 × 150 витримує 0,18 МПа, а в
  // Опанасюка 0,25. Обидва числа прочитані з друку, тому це розбіжність
  // джерел. Віддавати обом читачам одне з них означало б скласти таблицю,
  // якої не друкує жодна книжка.
  function liningTableFor(methodProfile) {
    const overrides = methodProfile?.liningTableOverrides;
    if (!overrides) return LINING_TABLE;
    return LINING_TABLE.map(row => (overrides[row.id]
      ? Object.freeze({ ...row, ...overrides[row.id] })
      : row));
  }

  function liningRow(id, methodProfile = null) {
    return liningTableFor(methodProfile).find(row => row.id === id) || null;
  }

  // Який рядок радить метод для обчисленого діаметра. Правило різне, і саме
  // тому воно живе в профілі: «найближче більше» проти «найближче».
  //
  // Порада — це порада: вибір лишається за автором, і документ записує, що
  // саме порадив метод і що прийнято.
  function recommendRow({ methodProfile, preliminaryOuterMm }) {
    const wanted = Number(preliminaryOuterMm);
    if (!methodProfile?.rowSelection || !Number.isFinite(wanted) || wanted <= 0) {
      return null;
    }
    const table = liningTableFor(methodProfile);
    if (methodProfile.rowSelection === "nearest-larger") {
      // Більшого рядка може не бути взагалі — тоді методика не має що
      // порадити, і вигадувати за неї не можна.
      return table.find(row => row.outerMm >= wanted) || null;
    }
    return table.reduce((best, row) => (best === null
      || Math.abs(row.outerMm - wanted) < Math.abs(best.outerMm - wanted)
      ? row : best), null);
  }

  // Три основи прийняття геометрії, і кожна каже про походження розміру щось
  // інше. Мовчазного «просто число» більше немає: без основи це відмова, а не
  // здогад.
  const GEOMETRY_BASES = Object.freeze(["design-sizing", "verified-table", "datasheet", "project-input"]);

  function adoptGeometry({ methodProfile = null, basis, rowId, outerMm, innerMm,
    recommendedRow = null, designInputs = null }) {
    if (!GEOMETRY_BASES.includes(basis)) {
      return {
        defined: false,
        // Читачеві потрібне речення, за яким видно, що робити, а не перелік
        // ідентифікаторів. Порожня основа — звичайний стан нової сторінки, а
        // не збій, і звучати вона має відповідно.
        reason: basis === null || basis === undefined || basis === ""
          ? "Виберіть, звідки взяті розміри накладки: рядок таблиці 11, "
            + "паспорт наявної накладки чи власні розміри проєкту."
          : `Основа прийняття розмірів «${basis}» невідома; є рядок таблиці, `
            + "паспорт накладки або власні розміри проєкту."
      };
    }

    if (basis === "design-sizing") {
      const x = designInputs || {};
      const values = [x.maximumEngineTorqueNm, x.reserveFactor, x.frictionCoefficient,
        x.liningPressureMpa, x.frictionSurfaces].map(finiteNumber);
      if (values.some(v => v === null || v <= 0) || !Number.isInteger(values[4]) || values[4] % 2) {
        return { defined: false, basis, reason: "Для підбору накладки потрібні момент, запас, тертя, допустимий тиск і парна кількість робочих поверхонь." };
      }
      const [torque, reserve, mu, pressure, z] = values;
      // Same uniform-wear radius and annular area as the downstream evaluator.
      // The inner/outer ratio and 5 mm rounding grid are project assumptions.
      const k = 0.6, designTorque = torque * reserve;
      const requiredM = Math.cbrt(16 * designTorque /
        (mu * z * pressure * 1e6 * Math.PI * (1 - k * k) * (1 + k)));
      const outer = Math.ceil(requiredM * 1000 / 5) * 5;
      const inner = outer * k;
      return { defined: true, basis, method: "design-sizing", outerMm: outer,
        innerMm: inner, requiredOuterMm: requiredM * 1000,
        pressureRange: { min: 0, max: pressure },
        sourceRefs: ["source.project-input"],
        limitations: ["Попередній підбір за моментом і прийнятим тиском: d/D=0,60, округлення D вгору до 5 мм. Це не паспорт накладки, не вибір азбестового матеріалу й не перевірка нагрівання або фактичної сили натискного механізму."] };
    }
    if (basis === "verified-table") {
      const row = liningRow(rowId, methodProfile);
      if (!row) {
        // Основу називають і у відмові. Саме в цю мить — основа оголошена,
        // рядок ще ні — сторінка й має показати, що радить метод; без цього
        // поля вона не знала б, що зараз доречно радити.
        return {
          defined: false,
          basis,
          reason: rowId
            ? "Вибрано рядок таблиці ГОСТ 1786-88, але саме цього рядка в "
              + "таблиці немає. Розмір «за таблицею» мусить бути в таблиці."
            : "Виберіть рядок таблиці 11."
        };
      }
      return {
        defined: true,
        basis,
        row,
        recommendedRow: recommendedRow || null,
        // Прийнято рядок, який радить метод, чи інший — це різні рішення, і
        // документ мусить їх розрізняти. Досі будь-який рядок таблиці
        // записувався як manuallyOverridden: false.
        followsRecommendation: recommendedRow ? recommendedRow.id === row.id : null,
        selectionRule: methodProfile?.rowSelection || null,
        outerMm: row.outerMm,
        innerMm: row.innerMm,
        // Межа тиску тут своя, рядкова, і вона строгіша або м'якша за
        // діапазон профілю залежно від розміру.
        pressureRange: { min: row.pressureMinMpa, max: row.pressureMaxMpa },
        method: "verified-table",
        // Таблиця й правило вибору належать ТОМУ методу, який вибрано. Тут
        // завжди стояв Опанасюк, навіть коли застосовували правило курсової
        // методички й її ж межу 0,18 МПа для рядка 254 × 150.
        sourceRefs: [methodProfile?.documentSourceId || "source.project-input"],
        limitations: [
          "ГОСТ 1786-88 описує азбестові накладки; азбест у фрикційних матеріалах "
          + "заборонений у ЄС із 2005 року. Це історичний ряд розмірів, а не чинна "
          + "рекомендація матеріалу."
        ]
      };
    }

    const outer = Number(outerMm);
    const inner = Number(innerMm);
    if (!Number.isFinite(outer) || !Number.isFinite(inner) || outer <= 0 || inner <= 0) {
      return {
        defined: false,
        basis,
        reason: basis === "datasheet"
          ? "Вибрано паспорт накладки, але діаметри не введено."
          : "Вибрано власні розміри, але діаметри не введено."
      };
    }
    return {
      defined: true,
      basis,
      row: null,
      recommendedRow: recommendedRow || null,
      followsRecommendation: recommendedRow
        ? recommendedRow.outerMm === outer && recommendedRow.innerMm === inner
        : null,
      selectionRule: methodProfile?.rowSelection || null,
      outerMm: outer,
      innerMm: inner,
      // Паспорт конкретної накладки друкує і свій допустимий тиск, але його
      // тут не знають, тому межу лишають профілю — і кажуть про це.
      pressureRange: null,
      method: basis,
      sourceRefs: ["source.project-input"],
      limitations: basis === "datasheet"
        ? ["Розміри взято з паспорта наявної накладки; допустимий тиск цього "
          + "виробу документ не знає й перевіряє за діапазоном профілю."]
        : ["Розміри задано проєктом: жодна таблиця й жоден паспорт їх не підтверджує."]
    };
  }

  // Архітектури пускового пристрою. Ця методика описує лише першу.
  const CLUTCH_ARCHITECTURES = Object.freeze([
    { id: "dry-friction", label: "Суха фрикційна муфта", methodApplies: true },
    { id: "wet-clutch", label: "Мокра багатодискова муфта", methodApplies: false },
    { id: "torque-converter", label: "Гідротрансформатор", methodApplies: false },
    { id: "dct", label: "Преселективна коробка з двома муфтами", methodApplies: false },
    { id: "engine-disconnect", label: "Роз'єднувальна муфта ДВЗ (гібрид)", methodApplies: false },
    { id: "none", label: "Пускового пристрою немає", methodApplies: false }
  ]);

  function profile(id) {
    return METHOD_PROFILES.find(item => item.id === id) || null;
  }

  function architecture(id) {
    return CLUTCH_ARCHITECTURES.find(item => item.id === id) || null;
  }

  function rangeFor(methodProfile, quantity, vehicleType) {
    if (!methodProfile) return null;
    const range = methodProfile[quantity];
    if (!range) return null;
    if (quantity === "reserveFactor" && range.byVehicleType) {
      // Об'єднаний діапазон 1,2…3,0 не належить жодній категорії: він просто
      // охоплює всі три. Віддати його при невідомому типі означало б порадити
      // те, чого джерело для цього автомобіля не радить.
      const forType = vehicleType ? range.byVehicleType[vehicleType] : null;
      return forType || null;
    }
    return range;
  }

  // Прийняття однієї величини.
  //
  // Основа прийняття явна. Порожнє або хибне поле НЕ стає мовчки серединою
  // діапазону: раніше так і було, і читач, який вибрав власне значення й не
  // ввів його, отримував рекомендацію, записану як рекомендацію.
  function adopt({ methodProfile, quantity, manualValue, vehicleType, basis = null }) {
    // Профіль може бути ще не вибраний — це звичайний стан, а не помилка
    // виклику, тому тут відмова з причиною, а не звернення до null.
    if (!methodProfile) {
      return { defined: false, reason: "Профіль методу не вибрано." };
    }
    const range = rangeFor(methodProfile, quantity, vehicleType);
    const typed = Number(manualValue);
    const hasManual = manualValue !== null && manualValue !== undefined
      && String(manualValue).trim() !== "" && Number.isFinite(typed) && typed > 0;

    // Рівно дві основи. Раніше явно оброблявся лише "project-input", тому
    // будь-що інше — null, порожнє, друкарська помилка «profile-midpiont» —
    // мовчки означало середину діапазону. Опечатка в назві основи не має
    // тихо міняти метод прийняття.
    if (basis !== "profile-midpoint" && basis !== "project-input") {
      return {
        defined: false,
        reason: `Основа прийняття має бути «profile-midpoint» або «project-input»; `
          + `отримано ${basis === null || basis === undefined ? "нічого" : JSON.stringify(basis)}.`
      };
    }

    if (basis === "project-input") {
      if (!hasManual) {
        return {
          defined: false,
          reason: "Вибрано власне значення, але поле порожнє або не число. "
            + "Внесіть число або поверніться до рекомендації профілю."
        };
      }
      return {
        defined: true,
        value: typed,
        method: "project-input",
        recommendedRange: range,
        // Поза рекомендацією — не помилка, але це має бути видно.
        withinRecommendation: range ? typed >= range.min && typed <= range.max : null,
        sourceRef: null,
        // Саме число походження методички не має — його вніс автор. Але
        // рекомендація, від якої він відступив, походження має, і без неї
        // відступ нема з чим порівняти: у документі лишалося б «власне
        // значення» без жодного натяку, від чого саме відступили.
        recommendedDocumentSourceId: range ? methodProfile.documentSourceId : null,
        recommendedSourceRef: range ? methodProfile.sourceRef : null
      };
    }

    if (!range) {
      return {
        defined: false,
        reason: methodProfile && methodProfile.id === "datasheet"
          ? "Профіль паспорта нічого не радить: виберіть власне значення й внесіть "
            + "його з паспорта накладки."
          : (quantity === "reserveFactor" && methodProfile.reserveFactor?.byVehicleType
            ? "Цей профіль подає коефіцієнт запасу за типом автомобіля; тип не "
              + "вибрано, а спільного діапазону джерело не друкує."
            : "Вибраний профіль не подає цієї величини — виберіть власне значення.")
      };
    }
    return {
      defined: true,
      value: (range.min + range.max) / 2,
      method: "profile-midpoint",
      recommendedRange: range,
      withinRecommendation: true,
      // Середина діапазону — вибір цього проєкту, а не число джерела.
      isAdoptedMidpoint: true,
      // Якщо в полі лишилося число, а вибрано рекомендацію, воно не діє —
      // і документ каже про це, замість вирішувати за автора.
      ignoredManualValue: hasManual ? typed : null,
      sourceRef: methodProfile.sourceRef,
      documentSourceId: methodProfile.documentSourceId
    };
  }

  // Чи є пусковий пристрій і чи описує його ЦЯ методика.
  //
  // Механічний зв'язок ДВЗ із колесами каже, що пусковий пристрій потрібен,
  // але не який саме: гідротрансформатор, мокра муфта, преселективна коробка
  // й суха муфта — різні конструкції. Тому архітектуру оголошують, а не
  // виводять зі зв'язку.
  function applicability({ powertrainType, engineDrivesWheels, clutchArchitecture }) {
    if (powertrainType === "electric") {
      return {
        defined: true, required: false, methodApplies: false,
        reason: "Електропривод рушає з нуля обертів: пускового зчеплення не потрібно."
      };
    }
    if (powertrainType === "hybrid" && engineDrivesWheels === false) {
      return {
        defined: true, required: false, methodApplies: false,
        reason: "Послідовний гібрид: ДВЗ крутить генератор і з колесами не з'єднаний, "
          + "тому пускового зчеплення немає."
      };
    }
    if (powertrainType === "hybrid" && engineDrivesWheels !== true) {
      return {
        defined: false, required: null, methodApplies: null,
        reason: "Для гібрида треба явно сказати, чи веде ДВЗ колеса: від цього "
          + "залежить, чи є пускове зчеплення."
      };
    }
    const declared = architecture(clutchArchitecture);
    if (!declared) {
      return {
        defined: false, required: true, methodApplies: null,
        reason: "Пусковий пристрій потрібен, але його тип не оголошено. Ця методика "
          + "описує лише суху фрикційну муфту, тож без оголошення невідомо, чи вона "
          + "застосовна."
      };
    }
    return {
      defined: true,
      required: declared.id !== "none",
      methodApplies: declared.methodApplies,
      architecture: declared,
      reason: declared.methodApplies
        ? "Суха фрикційна муфта: ця методика застосовна."
        : `${declared.label}: пристрій оголошено, але ця методика його не описує.`
    };
  }

  // z = 2n: поверхонь тертя рівно вдвічі більше, ніж ведених дисків. Отже
  // число ціле й парне. Дробові 2,5 поверхні давали радіус, який виглядав
  // цілком розумно, — а такої конструкції не буває.
  function surfaceCount(value) {
    const z = Number(value);
    if (!Number.isInteger(z) || z < 2) {
      return { defined: false, reason: "Кількість поверхонь тертя — ціле число, не менше 2." };
    }
    if (z % 2 !== 0) {
      return {
        defined: false,
        reason: `z = 2n, тому поверхонь тертя має бути парне число; ${z} не буває.`
      };
    }
    return { defined: true, value: z, drivenDiscs: z / 2 };
  }

  // Тиск на накладку проти ОБОХ меж діапазону.
  //
  // Раніше перевірялася лише верхня: 0,10 МПа при діапазоні 0,14…0,30
  // проходило як «у межах». Занизький тиск теж поза рекомендацією — накладка
  // недовантажена, а зчеплення вийшло більшим, ніж потрібно.
  // Яку межу тиску перевіряти. Рядок таблиці друкує СВОЮ межу (0,25 МПа до
  // 300 включно і 0,30 МПа від 340), і вона головніша за діапазон профілю:
  // профіль радить, з чого починати розрахунок, а таблиця каже, що витримує
  // конкретна накладка. Коли розміри взято з паспорта чи задано проєктом,
  // рядкової межі немає, і лишається діапазон профілю.
  function pressureLimitFor({ geometry, profileRange }) {
    if (geometry?.defined && geometry.pressureRange) {
      return { range: geometry.pressureRange, basis: "lining-row" };
    }
    if (profileRange) return { range: profileRange, basis: "method-profile" };
    return { range: null, basis: null };
  }

  function checkPressure({ actualMpa, allowedRange }) {
    const value = Number(actualMpa);
    if (!Number.isFinite(value) || value <= 0) {
      return { defined: false, reason: "Потрібен додатний тиск." };
    }
    if (!allowedRange) {
      return { defined: true, checked: false, withinAllowed: null, value };
    }
    const aboveMaximum = value > allowedRange.max;
    const belowMinimum = value < allowedRange.min;
    return {
      defined: true,
      checked: true,
      value,
      aboveMaximum,
      belowMinimum,
      withinAllowed: !aboveMaximum && !belowMinimum,
      allowedRange
    };
  }

  // Чи потрібен підсилювач приводу. Поріг належить профілю: одне джерело
  // друкують 9 кН обидві методички — «8 кН» було помилкою розпізнавання
  // однієї з них, виправленою за друком.
  function boosterAdvice({ clampForceN, thresholdN }) {
    const force = Number(clampForceN);
    const threshold = Number(thresholdN);
    if (!(force > 0)) return { defined: false, reason: "Потрібна додатна сила." };
    if (!(threshold > 0)) {
      return {
        defined: true, checked: false, needed: null,
        reason: "Профіль не подає порога: перевірку керованості не виконано."
      };
    }
    return {
      defined: true,
      checked: true,
      needed: force > threshold,
      thresholdN: threshold,
      marginN: threshold - force
    };
  }

  // Передаваний момент і дійсний запас — НЕ тут і поки що ніде.
  //
  // Їх рахують за силою, яку дають прийняті пружини (підрозділ 9.2), а не за
  // потрібною силою: підставити потрібну силу назад у формулу моменту означає
  // перевірити, що a/b·b = a. Саме так тут і було, і «перевірка» проходила за
  // будь-якого радіуса, бо радіус скорочувався. Доти, доки пружин немає,
  // документ має казати, що перевірки немає, а не показувати тотожність.
  // Перевірки, які обидві книжки називають, але не описують.
  //
  // «При розробці зчеплення згідно спеціального завдання проекту додатково
  // розраховуються на міцність маточина веденого диска і важелі виключання
  // зчеплення; проводиться перевірка зчеплення на нагрівання» — і на цьому
  // розділ про зчеплення в обох закінчується.
  //
  // Методу для жодної з трьох немає: ні формул, ні допустимих значень, ні
  // порядку дій. Це не те саме, що (9.12) чи (9.18) — там джерельне
  // співвідношення переставляли, а тут переставляти нема чого. Порахувати їх
  // означало б узяти метод із книжки, якої цей проєкт не читав.
  const SPECIAL_ASSIGNMENT_CHECKS = Object.freeze([
    "перевірка зчеплення на нагрівання",
    "міцність маточини веденого диска",
    "міцність важелів вимикання"
  ]);

  function specialAssignmentStatus(liningRow) {
    return {
      defined: true,
      checked: false,
      checks: [...SPECIAL_ASSIGNMENT_CHECKS],
      // Єдине, що джерела для них дають, — межі з таблиці накладок.
      temperatureLimits: liningRow
        ? { continuousC: liningRow.continuousTempC, shortC: liningRow.shortTempC }
        : null,
      reason: "Три перевірки спеціального завдання не виконано: "
        + `${SPECIAL_ASSIGNMENT_CHECKS.join(", ")}. Обидві книжки називають їх, `
        + "але методу не подають — ні формул, ні допустимих значень."
        + (liningRow
          ? ` Для нагрівання джерела дають лише межу: прийнята накладка витримує `
            + `${liningRow.continuousTempC} °C тривало і ${liningRow.shortTempC} °C `
            + "короткочасно."
          : "")
    };
  }

  // Натискний елемент: багатопружинний чи тарільчастий.
  //
  // Це не доповнення одне до одного, а АЛЬТЕРНАТИВИ: або пакет циліндричних
  // пружин (підрозділ 9.2), або одна тарільчаста (9.3). Джерела описують
  // обидва, і рахувати обидва одночасно для однієї конструкції не можна —
  // вийшло б зчеплення з двома натискними елементами.
  const PRESSURE_ELEMENTS = Object.freeze([
    { id: "coil-springs", label: "Пакет циліндричних пружин", subsection: "9.2" },
    { id: "diaphragm", label: "Тарільчаста (діафрагмова) пружина", subsection: "9.3" }
  ]);

  function pressureElement(id) {
    return PRESSURE_ELEMENTS.find(item => item.id === id) || null;
  }

  // Геометрія тарільчастої пружини.
  //
  // Діаметрів чотири, і вони служать різному.
  //
  // Важіль (9.21) тримається на трьох: зовнішній Д₁, діаметр опори на
  // натискний диск Д_с і внутрішній Двн, де тисне вижимний підшипник.
  // Четвертий, Д₂, у рівняння не входить — до нього подають рекомендацію
  // Д₁/Д₂ = 1,2…1,5 і його ж використовує перевірка міцності.
  //
  // Джерела подають ЧАСТКИ, а не самі розміри: Д₁/Д₂ = 1,2…1,5,
  // Д₁/Двн = 2,5…3,5, Д₁/δ = 75…100, h/δ. Тому розміри вносить автор, а
  // документ каже, чи лежать вони в тому, що радить книжка.
  function adoptDiaphragm({ methodProfile, outerMm, discInnerMm, contactMm, innerMm,
    thicknessMm, heightMm, vehicleType }) {
    const ranges = methodProfile?.diaphragm;
    if (!ranges) {
      return {
        defined: false,
        reason: "Вибраний профіль тарільчастої пружини не описує — виберіть інший "
          + "метод або пакет циліндричних пружин."
      };
    }

    // Геометрія ВАЖЕЛЯ і геометрія РЕКОМЕНДАЦІЙ — різні набори, і плутати їх
    // не можна було вдруге.
    //
    // Рівняння (9.21) читає рівно три діаметри: Д₁, Д_с і Двн. Розміри, до
    // яких книжки подають частки — Д₂, δ, h, — у нього не входять зовсім,
    // тому їхня відсутність не має скасовувати силу вимикання. Тут вона
    // скасовувала: без Д₂ зникало все, включно з (9.21).
    const problems = [];
    const value = (name, raw) => {
      const number = finiteNumber(raw);
      if (number === null || number <= 0) {
        problems.push(`${name}: не задано.`);
        return null;
      }
      return number;
    };
    const outer = value("зовнішній діаметр пружини", outerMm);
    const contact = value("діаметр опори на натискний диск", contactMm);
    const inner = value("внутрішній діаметр пружини", innerMm);

    // Важіль існує лише тоді, коли Д₁ > Д_с > Двн. Інакше знаменник (9.21)
    // стає нулем або від'ємним, і «сила вимикання» виходить безмежною або
    // від'ємною — числом, якого не буває.
    if (outer !== null && contact !== null && inner !== null
      && !(outer > contact && contact > inner)) {
      problems.push(`діаметри ${outer} > ${contact} > ${inner} мм не спадають: `
        + "важеля тарільчастої пружини не існує.");
    }
    if (problems.length) {
      return { defined: false, problems, reason: problems.join(" ") };
    }

    // Далі — необов'язкове: розміри, до яких книжки подають частки. Кожен
    // САМ ПО СОБІ, а не гуртом.
    //
    // Тут вони були одним «або все, або нічого»: без товщини зникало й
    // прийняте Д₂ разом зі своїм рішенням, а частка Д₁/Двн, якій нічого з
    // цього не потрібно, не рахувалася теж. І гірше: Д₂ = −190 або true
    // проходило як «не введено» — попередженням замість помилки.
    //
    // Д₂ (у курсовій методичці — a) НЕ ТЕ САМЕ, що Д_с: рекомендацію 1,2…1,5
    // подають саме до Д₁/Д₂. У формулі міцності стоїть логарифмічне середнє
    // (Д₁−Д₂)/ln(Д₁/Д₂) — отже Д₂ обмежує суцільну конічну частину, а
    // пелюстки йдуть від нього всередину до Двн.
    const optional = (name, raw, extraCheck = null) => {
      if (raw === null || raw === undefined || String(raw).trim() === "") {
        return { entered: false, valid: false, reason: `${name} не задано` };
      }
      const number = finiteNumber(raw);
      if (number === null) {
        return {
          entered: true, valid: false,
          reason: `${name}: не число (${JSON.stringify(raw)})`
        };
      }
      if (number <= 0) {
        return {
          entered: true, valid: false,
          reason: `${name}: має бути додатним, отримано ${number}`
        };
      }
      const extra = extraCheck ? extraCheck(number) : null;
      if (extra) return { entered: true, valid: false, value: number, reason: extra };
      return { entered: true, valid: true, value: number };
    };

    const discInner = optional("внутрішній діаметр суцільної частини Д₂", discInnerMm,
      number => (outer > number && number > inner)
        ? null
        : `Д₂ = ${number} мм має лежати між Д₁ = ${outer} і Двн = ${inner} мм: `
          + "пелюстки йдуть від нього всередину");
    const thickness = optional("товщина пружини", thicknessMm);
    const height = optional("висота пружини", heightMm);

    // Кожна частка рахується з того, що для неї є. Д₁/Двн не потребує нічого
    // понад важіль, тому вона є завжди.
    const ratioFor = (label, actual, range, needs) => {
      const missing = needs.filter(item => !item.valid);
      if (missing.length) {
        return {
          label,
          checked: false,
          range,
          reason: missing.map(item => item.reason).join("; ")
        };
      }
      const number = actual();
      return {
        label,
        checked: true,
        value: number,
        range,
        within: number >= range.min && number <= range.max
      };
    };

    const ratios = [
      ratioFor("Д₁/Д₂", () => outer / discInner.value, ranges.outerToMean, [discInner]),
      ratioFor("Д₁/Двн", () => outer / inner, ranges.outerToInner, []),
      ratioFor("Д₁/δ", () => outer / thickness.value, ranges.outerToThickness, [thickness]),
      ratioFor("h/δ", () => height.value / thickness.value, ranges.heightToThickness,
        [height, thickness])
    ];

    const thicknessRange = ranges.thicknessMm && vehicleType && thickness.valid
      ? ranges.thicknessMm[vehicleType === "goods" || vehicleType === "offRoad"
        ? "goods" : "passenger"] || null
      : null;

    const proportions = {
      // Введене й непридатне — це помилка, а не «ще не введено».
      invalid: [discInner, thickness, height]
        .filter(item => item.entered && !item.valid)
        .map(item => item.reason),
      discInner,
      thickness,
      height,
      ratios,
      checked: ratios.filter(item => item.checked),
      unchecked: ratios.filter(item => !item.checked),
      outsideRecommendation: ratios.filter(item => item.checked && !item.within),
      thicknessRange,
      thicknessWithinRange: thicknessRange
        ? thickness.value >= thicknessRange.min && thickness.value <= thicknessRange.max
        : null
    };

    return {
      defined: true,
      outerMm: outer,
      contactMm: contact,
      innerMm: inner,
      // Виграш у важелі: (Д_с − Двн)/(Д₁ − Д_с). Він РОСТЕ, коли Д_с
      // наближається до Д₁, і падає до нуля, коли Д_с іде до Двн.
      leverAdvantage: (contact - inner) / (outer - contact),
      proportions,
      documentSourceId: methodProfile.documentSourceId
    };
  }

  // Перевірка міцності тарільчастої пружини.
  //
  // Вона є, і вона за профілем: книжки друкують РІЗНІ вирази — однаковий
  // перший доданок, а другий різниться знаком біля товщинного члена й
  // множником 2. Для тієї самої пружини виходить 404 і 862 МПа при спільному
  // допустимому 1400. Зводити їх до однієї формули не можна, тому кожна
  // рахує своєю, а документ каже, чиєю саме.
  function diaphragmStressStatus({ methodProfile, stressMpa } = {}) {
    const limit = methodProfile?.diaphragm?.allowableStressMpa ?? null;
    const point = methodProfile?.diaphragm?.stress?.point ?? null;
    // Число, а не «щось додатне».
    //
    // Від'ємне напруження — це ПОРАХОВАНЕ число, а не відсутнє. Тут воно
    // потрапляло в «не пораховано»: σ = −25 419 МПа давало checked: false і
    // тихо проходило замість того, щоб бути помилкою. Найгірший різновид
    // м'якої відмови — той, що видає провал за брак даних.
    const value = typeof stressMpa === "number" && Number.isFinite(stressMpa)
      ? stressMpa : null;
    if (limit === null) {
      return {
        defined: true,
        checked: false,
        reason: "Вибраний профіль не подає допустимого напруження для тарільчастої "
          + "пружини."
      };
    }
    if (value === null) {
      return {
        defined: true,
        checked: false,
        allowableStressMpa: limit,
        reason: `Напруження не пораховане, тому й не перевірене. Допустиме за `
          + `профілем — ${limit} МПа.`
      };
    }
    // Джерела описують σ як величину, яку обмежують згори, і ні нульового, ні
    // від'ємного сумарного напруження не розглядають зовсім. Тому таке значення — не
    // «пройшло» й не «немає даних», а ознака, що конструкція вийшла за межі
    // моделі, і це сказано прямо.
    if (value <= 0) {
      return {
        defined: true,
        checked: true,
        allowableStressMpa: limit,
        stressMpa: value,
        withinLimit: false,
        outsideModel: true,
        reason: `Напруження вийшло ${value.toFixed(1)} МПа — `
          + `${value === 0 ? "нульове" : "від'ємне"}. Джерела подають σ як `
          + "величину, яку обмежують згори, і ні нульового, ні від'ємного "
          + "сумарного напруження не розглядають: за такої геометрії розрахунок "
          + "за їхнім виразом виходить за межі моделі."
          + (point ? ` Профіль рахує його в точці: ${point}.` : "")
      };
    }
    return {
      defined: true,
      checked: true,
      allowableStressMpa: limit,
      stressMpa: value,
      margin: limit / value,
      withinLimit: value <= limit,
      outsideModel: false,
      reason: (value <= limit
        ? `Напруження ${value.toFixed(1)} МПа проти допустимих ${limit} МПа — `
          + `запас ${(limit / value).toFixed(2)}.`
        // Без порад «візьміть менший зовнішній діаметр»: у виразі Опанасюка
        // зменшення Д₁ з 254 до 230 мм ПІДВИЩУЄ напруження з 862 до 1139 МПа.
        // Порада, яка залежить від вибраної книжки й від решти розмірів, у
        // короткому рядку неправдива.
        : `Напруження ${value.toFixed(1)} МПа ПЕРЕВИЩУЄ допустимі ${limit} МПа. `
          + "Змініть геометрію пружини або матеріал і перевірте наново: напрямок "
          + "залежить від вибраного методу й від решти розмірів.")
        + (point ? ` Профіль рахує його в точці: ${point}.` : "")
    };
  }


  // Висновки підрозділу 9.3 у канонічній формі.
  //
  // Досі вони жили лише в DOM: придатна тарільчаста пружина давала нуль
  // діагностик, і з документа не випливало ні того, що міцність не перевірено,
  // ні того, що якась частка вийшла за рекомендацію книжки. Те саме вже було з
  // тиском і з міцністю дроту.
  function diaphragmDiagnostics({ geometry, methodProfile, declared, stressMpa }) {
    if (!declared || !geometry?.defined) return [];
    const node = "calc.clutch-diaphragm-release-force";
    const proportions = geometry.proportions;
    return [
      ...(() => {
        const stress = diaphragmStressStatus({ methodProfile, stressMpa });
        if (!stress.checked) {
          return [{
            code: "DIAPHRAGM_STRENGTH_UNCHECKED",
            severity: "warning",
            message: stress.reason,
            details: { node: "calc.clutch-diaphragm-stress" }
          }];
        }
        if (stress.withinLimit) return [];
        return [{
          code: stress.outsideModel
            ? "DIAPHRAGM_STRESS_OUTSIDE_MODEL"
            : "DIAPHRAGM_OVERSTRESSED",
          severity: "error",
          message: stress.reason,
          details: { node: "calc.clutch-diaphragm-stress" }
        }];
      })(),
      // Введене й непридатне — ПОМИЛКА, а не «ще не введено»: Д₂ = −190
      // проходило попередженням, ніби його просто не вносили.
      ...proportions.invalid.map(message => ({
        code: "DIAPHRAGM_GEOMETRY_INVALID",
        severity: "error",
        message: `${message}. Сила вимикання (9.21) від цього розміру не залежить `
          + "і порахована.",
        details: { node }
      })),
      // Чого не перевірили — і чому саме цієї частки бракує даних.
      //
      // Без фільтра: він мав прибирати повтор, коли причина вже названа
      // помилкою, а прибирав УСЮ причину. При δ = −2,5 і відсутній h
      // повідомлялася лише товщина, а про брак висоти документ мовчав, хоч
      // саме її й бракувало для h/δ.
      ...proportions.unchecked.map(item => ({
        code: "DIAPHRAGM_RATIO_UNCHECKED",
        severity: "warning",
        message: `Частку ${item.label} не перевірено: ${item.reason}.`,
        details: { node }
      })),
      ...proportions.outsideRecommendation.map(item => ({
        code: "DIAPHRAGM_RATIO_OUTSIDE_RECOMMENDATION",
        severity: "warning",
        message: `Частка ${item.label} = ${item.value.toFixed(2)} лежить поза `
          + `рекомендацією ${item.range.min}…${item.range.max}, яку подає вибраний профіль.`,
        details: { node }
      })),
      ...(proportions.thicknessWithinRange === false
        ? [{
          code: "DIAPHRAGM_THICKNESS_OUTSIDE_RECOMMENDATION",
          severity: "warning",
          message: `Товщина ${proportions.thickness.value} мм лежить поза `
            + `${proportions.thicknessRange.min}…${proportions.thicknessRange.max} мм, `
            + "які профіль радить для цього типу автомобіля.",
          details: { node }
        }]
        : [])
    ];
  }


  // Прийняття величин пружин.
  //
  // Ті самі дві основи, що й у решті розділу: середина діапазону профілю або
  // власне число. Діапазони — з тієї книжки, яку вибрано: множник відтяжних
  // пружин у неї свій (1,00 проти 1,05…1,08), і змішувати їх не можна.
  const SPRING_QUANTITIES = Object.freeze({
    releaseFactor: { symbol: "c", unit: null },
    unevenFactor: { symbol: "k_{\\mathrm{н}}", unit: null },
    allowableShearMpa: { symbol: "[\\tau]", unit: "MPa" },
    // Обидві книжки друкують 1,5…2,0 — це діапазон, а не число. Застосунок
    // мовчки брав його середину, і 1,75 виглядало як величина джерела, хоча
    // джерело такого числа не подає. Тепер це прийняття, як і решта.
    deadCoils: { symbol: "n_{\\mathrm{м}}", unit: null }
  });

  function springRangeFor(methodProfile, quantity) {
    const springs = methodProfile?.springs;
    if (!springs) return null;
    const range = springs[quantity];
    if (typeof range === "number") return { min: range, max: range };
    return range || null;
  }

  function adoptSpring({ methodProfile, quantity, basis = null, manualValue }) {
    if (!methodProfile) {
      return { defined: false, reason: "Профіль методу не вибрано." };
    }
    if (!SPRING_QUANTITIES[quantity]) {
      return { defined: false, reason: `Невідома величина пружини: ${quantity}.` };
    }
    const range = springRangeFor(methodProfile, quantity);
    const typed = Number(manualValue);
    const hasManual = manualValue !== null && manualValue !== undefined
      && String(manualValue).trim() !== "" && Number.isFinite(typed) && typed > 0;

    if (basis !== "profile-midpoint" && basis !== "project-input") {
      return {
        defined: false,
        reason: "Основа прийняття має бути «profile-midpoint» або «project-input»; "
          + `отримано ${basis === null || basis === undefined ? "нічого" : JSON.stringify(basis)}.`
      };
    }
    if (basis === "project-input") {
      if (!hasManual) {
        return {
          defined: false,
          reason: "Вибрано власне значення, але поле порожнє або не число."
        };
      }
      return {
        defined: true,
        value: typed,
        method: "project-input",
        recommendedRange: range,
        withinRecommendation: range ? typed >= range.min && typed <= range.max : null,
        recommendedDocumentSourceId: range ? methodProfile.documentSourceId : null,
        canonicalUnit: SPRING_QUANTITIES[quantity].unit,
        symbol: SPRING_QUANTITIES[quantity].symbol
      };
    }
    if (!range) {
      return {
        defined: false,
        reason: "Вибраний профіль не подає цієї величини — виберіть власне значення."
      };
    }
    return {
      defined: true,
      value: (range.min + range.max) / 2,
      method: "profile-midpoint",
      recommendedRange: range,
      withinRecommendation: true,
      documentSourceId: methodProfile.documentSourceId,
      canonicalUnit: SPRING_QUANTITIES[quantity].unit,
      symbol: SPRING_QUANTITIES[quantity].symbol
    };
  }

  // Прийнята кількість робочих витків і деформація в зібраному стані.
  //
  // Обидві — конструктивні рішення автора, і обидві мають лишатися
  // НЕЗАЛЕЖНИМИ від потрібної сили. Варто вивести деформацію як P_пр/C — і
  // коло повертається: сила, порахована з неї, дорівнюватиме потрібній за
  // побудовою, а перевірка проходитиме завжди, як колись a/b·b = a.
  //
  // Тому деформацію беруть із конструкції: вільна довжина мінус довжина в
  // зібраному стані, або значення з паспорта пружини.
  function adoptSpringAssembly({ coils, recommendedCoils, deflectionBasis,
    freeLengthMm, installedLengthMm, deflectionMm }) {
    const problems = [];
    const adoptedCoils = finiteNumber(coils);
    if (adoptedCoils === null || adoptedCoils < 2) {
      problems.push("прийнята кількість робочих витків має бути не меншою за 2 — оголошене конструктивне обмеження проєкту.");
    } else if (Math.abs(adoptedCoils * 2 - Math.round(adoptedCoils * 2)) > 1e-9) {
      problems.push(`прийнята кількість робочих витків ${adoptedCoils}: `
        + "витки приймають кратно половині.");
    }

    let deflectionM = null;
    let deflectionRationale = null;
    if (deflectionBasis === "assembly-geometry") {
      const free = finiteNumber(freeLengthMm);
      const installed = finiteNumber(installedLengthMm);
      if (free === null || free <= 0 || installed === null || installed <= 0) {
        problems.push("для деформації з геометрії потрібні вільна довжина "
          + "пружини та її довжина в зібраному стані.");
      } else if (!(free > installed)) {
        problems.push(`вільна довжина ${free} мм не більша за довжину в зібраному `
          + `стані ${installed} мм: пружина не стиснута, сили вона не створює.`);
      } else {
        deflectionM = (free - installed) / 1000;
        deflectionRationale = `Деформація з геометрії складання: вільна довжина `
          + `${free} мм мінус довжина в зібраному стані ${installed} мм.`;
      }
    } else if (deflectionBasis === "datasheet") {
      const value = finiteNumber(deflectionMm);
      if (value === null || value <= 0) {
        problems.push("деформацію з паспорта пружини не задано.");
      } else {
        deflectionM = value / 1000;
        deflectionRationale = `Деформація ${value} мм за паспортом пружини.`;
      }
    } else {
      problems.push("основа прийняття деформації має бути «assembly-geometry» "
        + `або «datasheet»; отримано ${deflectionBasis === null
          || deflectionBasis === undefined || deflectionBasis === ""
          ? "нічого" : JSON.stringify(deflectionBasis)}.`);
    }

    if (problems.length) {
      return { defined: false, problems, reason: problems.join(" ") };
    }
    // typeof, а не Number(): Number(null) — це 0, і фікстура, яка не подала
    // поради, отримувала «розрахунок дає 0,00 витка» замість 2,21. Той самий
    // рід помилки вже ловили тут двічі.
    const recommended = typeof recommendedCoils === "number"
      && Number.isFinite(recommendedCoils) && recommendedCoils > 0
      ? recommendedCoils : null;
    // «За порадою» означає одне: прийнято розрахункове число, округлене до
    // найближчої половини витка. Інакше це інша пружина, і документ так і каже.
    const roundedToHalf = recommended === null
      ? null : Math.round(recommended * 2) / 2;
    return {
      defined: true,
      coils: adoptedCoils,
      recommendedCoils: recommended,
      roundedRecommendation: roundedToHalf,
      followsRecommendation: roundedToHalf === null
        ? null : Math.abs(adoptedCoils - roundedToHalf) < 1e-9,
      deflectionM,
      deflectionBasis,
      deflectionRationale,
      freeLengthMm: deflectionBasis === "assembly-geometry" ? finiteNumber(freeLengthMm) : null,
      installedLengthMm: deflectionBasis === "assembly-geometry" ? finiteNumber(installedLengthMm) : null
    };
  }

  function springAssemblyDiagnostics({ assemblyDeclared, developedPressureMpa,
    pressureLimitMpa, clearanceM }) {
    if (!assemblyDeclared) return [];
    const diagnostics = [];
    if (Number.isFinite(developedPressureMpa) && Number.isFinite(pressureLimitMpa)
      && developedPressureMpa > pressureLimitMpa) {
      diagnostics.push({ code: "CLUTCH_DEVELOPED_PRESSURE_HIGH", severity: "warning",
        message: `Фактична сила прийнятих пружин створює тиск ${developedPressureMpa.toFixed(3)} МПа `
          + `проти прийнятої межі ${pressureLimitMpa.toFixed(3)} МПа. `
          + "Попередній варіант потребує узгодження накладки та натискного механізму; "
          + "перевірка тиску за потрібною силою (9.8) цього перевантаження не виключає.",
        details: { node: "calc.clutch-developed-pressure" } });
    }
    if (typeof clearanceM === "number" && Number.isFinite(clearanceM) && clearanceM <= 0) {
      diagnostics.push({ code: "CLUTCH_SPRING_COIL_BIND", severity: "error",
        message: `Запас до змикання витків при вимиканні ${(clearanceM * 1000).toFixed(2)} мм. `
          + "Потрібен додатний запас; змініть довжину складання або геометрію пружини.",
        details: { node: "calc.clutch-spring-release-clearance" } });
    }
    return diagnostics;
  }

  // Величини, які джерела друкують ТОЧНИМ числом, а не діапазоном: хід
  // вимикання (3 мм однодискове, 4 дводискове) і модуль зсуву сталі 85 ГПа.
  // Вибирати тут нема з чого, але походження в них є, і документ має його
  // назвати — інакше вони виглядають як числа нізвідки.
  function springSourcedValues(methodProfile, frictionSurfaces) {
    const springs = methodProfile?.springs;
    if (!springs) {
      return {
        travelM: { defined: false, reason: "Профіль не подає ходу вимикання." },
        shearModulusMpa: { defined: false, reason: "Профіль не подає модуля зсуву." }
      };
    }
    const surfaces = surfaceCount(frictionSurfaces);
    const travelMm = surfaces.defined
      ? (surfaces.drivenDiscs >= 2
        ? springs.disengagementTravelMm.twinDisc
        : springs.disengagementTravelMm.singleDisc)
      : null;
    return {
      travelM: travelMm === null
        ? {
          defined: false,
          reason: "Хід вимикання залежить від кількості дисків, а вона ще не визначена."
        }
        : {
          defined: true,
          value: travelMm / 1000,
          displayValue: travelMm,
          method: "source-value",
          documentSourceId: methodProfile.documentSourceId,
          symbol: "\\Delta f",
          canonicalUnit: "mm",
          rationale: `Джерело подає ${travelMm} мм для `
            + `${surfaces.drivenDiscs >= 2 ? "дводискового" : "однодискового"} зчеплення.`
        },
      shearModulusMpa: {
        defined: true,
        value: springs.shearModulusGPa * 1000,
        displayValue: springs.shearModulusGPa,
        method: "source-value",
        documentSourceId: methodProfile.documentSourceId,
        symbol: "G",
        canonicalUnit: "GPa",
        rationale: `Модуль зсуву сталі за джерелом: ${springs.shearModulusGPa} ГПа.`
      }
    };
  }

  // Геометрія пружини: кількість, середній діаметр і прийнятий дріт. Джерела
  // її не подають — вона конструктивна, і саме тому кожне число тут власне.
  function adoptSpringGeometry({ springCount, meanDiameterMm, wireDiameterMm }) {
    const problems = [];
    const count = Number(springCount);
    if (!Number.isFinite(count) || count <= 0 || !Number.isInteger(count)) {
      problems.push("кількість пружин має бути цілим додатним числом.");
    }
    const mean = Number(meanDiameterMm);
    if (!Number.isFinite(mean) || mean <= 0) {
      problems.push("середній діаметр пружини не задано.");
    }
    const wire = Number(wireDiameterMm);
    if (!Number.isFinite(wire) || wire <= 0) {
      problems.push("діаметр дроту не задано.");
    }
    // Дріт, товщий за саму пружину, — не пружина. Індекс D/d нижче трьох
    // навивати практично неможливо, але це вже конструктивна межа, а не
    // арифметична, тому тут лише очевидна неможливість.
    if (Number.isFinite(mean) && Number.isFinite(wire) && mean > 0 && wire > 0
      && !(mean > wire)) {
      problems.push(`діаметр дроту ${wire} мм не менший за середній діаметр `
        + `пружини ${mean} мм: такої пружини не буває.`);
    }
    return problems.length
      ? { defined: false, problems, reason: problems.join(" ") }
      : {
        defined: true,
        springCount: count,
        meanDiameterM: mean / 1000,
        wireDiameterM: wire / 1000,
        springIndex: mean / wire
      };
  }

  // Висновок про міцність дроту в канонічній формі.
  //
  // Досі він жив лише в DOM: тонкий дріт давав напис на сторінці й ПОРОЖНІЙ
  // список діагностик у документі. Те саме вже було з тиском: висновок, який
  // видно лише тому, хто дивиться на екран, для документа не існує.
  function springStrengthDiagnostics({ status, declared }) {
    if (!declared) return [];
    if (!status?.checked) {
      return [{
        code: "SPRING_STRENGTH_UNCHECKED",
        severity: "warning",
        message: "Міцність дроту пружини не перевірено: бракує розрахункової "
          + "або граничної сили.",
        details: { node: "calc.clutch-spring-allowable-force" }
      }];
    }
    if (!status.sufficient) {
      // До прийняття складання це «дріт замалий за розрахунковою силою» і
      // стосується (9.12). Після — це перевантаження при вимиканні, і винна
      // вже деформація: інший висновок, інший крок.
      return [{
        code: status.realLoad ? "SPRING_OVERSTRESSED_AT_RELEASE" : "SPRING_WIRE_UNDERSIZED",
        severity: "error",
        message: status.reason,
        details: {
          node: status.realLoad
            ? "calc.clutch-spring-maximum-force"
            : "calc.clutch-spring-allowable-force"
        }
      }];
    }
    return [];
  }

  // Перевірка входів третього кроку — усіх, які він споживає.
  //
  // Раніше тут перевірялася сама геометрія, і від'ємний множник відтяжних
  // пружин проходив наскрізь: шість скінченних ВІД'ЄМНИХ результатів, зокрема
  // «сила» −5472 Н, і жодної діагностики. Від'ємна сила виглядає як результат
  // рівно доти, доки на неї не глянути.
  function validateSpringInputs({
    springCount, springMeanDiameterM, springWireDiameterM,
    springReleaseFactor, springUnevenFactor, springAllowableShearMpa,
    springTravelM, springShearModulusMpa, springDeadCoils,
    springAdoptedCoils, springInstalledDeflectionM, springInstalledLengthM
  }) {
    // Кожна проблема називає крок, якого стосується: відмова через діаметр
    // дроту — це не відмова про силу пружини, і показувати пальцем на (9.9)
    // означало б вести читача не туди.
    const problems = [];
    const add = (message, node) => problems.push({ message, node });

    // Крок, до якого веде відмова, — той, що ПЕРШИМ читає цю величину.
    //
    // Не «якийсь із пружинних»: прийнятий дріт, наприклад, у (9.11) не
    // входить зовсім — там його ще тільки рахують, — і вести читача туди
    // означало б показувати на рівняння, яке з поламаним числом не має нічого
    // спільного. Уперше дріт з'являється в (9.12).
    const FORCE_NODE = "calc.clutch-spring-force";              // 9.9:  z_пр, c
    const DESIGN_NODE = "calc.clutch-spring-design-force";      // 9.10: k
    const WIRE_NODE = "calc.clutch-spring-wire-required";       // 9.11: Д_с, [τ]
    const ALLOWABLE_NODE = "calc.clutch-spring-allowable-force"; // 9.12: прийнятий d
    const COILS_NODE = "calc.clutch-spring-working-coils";      // 9.14: Δf, G
    const TOTAL_NODE = "calc.clutch-spring-total-coils";        // 9.15: неробочі витки

    const positive = [
      ["кількість пружин", springCount, FORCE_NODE],
      ["множник відтяжних пружин", springReleaseFactor, FORCE_NODE],
      ["коефіцієнт нерівномірності", springUnevenFactor, DESIGN_NODE],
      ["середній діаметр пружини", springMeanDiameterM, WIRE_NODE],
      ["допустиме напруження", springAllowableShearMpa, WIRE_NODE],
      ["діаметр дроту", springWireDiameterM, ALLOWABLE_NODE],
      ["хід вимикання", springTravelM, COILS_NODE],
      ["модуль зсуву", springShearModulusMpa, COILS_NODE],
      // Неробочі витки перевіряють тут-таки: Number(null) — це 0, а нуль
      // проходив перевірку «не менше нуля» і доходив до обчислення, де
      // валився EVAL_ERROR-ом уже після п'ятнадцяти кроків.
      ["кількість неробочих витків", springDeadCoils, TOTAL_NODE]
    ];

    // Величини складання перевіряють лише тоді, коли вони є: без них перші
    // сім кроків рахуються повністю, і це нормальний стан. Але якщо вони є —
    // перевіряють обов'язково.
    //
    // Два мінуси скорочуються: n = −2 і f = −7,5 мм давали від'ємну
    // жорсткість, ДОДАТНУ силу 377,8 Н і момент 271,4 Н·м без жодної
    // діагностики. Пружини з від'ємною кількістю витків не буває.
    const declared = value => value !== null && value !== undefined
      && String(value).trim() !== "";
    if (declared(springAdoptedCoils)) {
      positive.push(["прийнята кількість робочих витків", springAdoptedCoils,
        "calc.clutch-spring-rate"]);
    }
    if (declared(springInstalledDeflectionM)) {
      positive.push(["деформація пружини в зібраному стані", springInstalledDeflectionM,
        "calc.clutch-spring-developed-force"]);
    }
    if (declared(springInstalledLengthM)) {
      positive.push(["довжина пружини у зібраному стані", springInstalledLengthM,
        "calc.clutch-spring-release-clearance"]);
    }
    positive.forEach(([name, value, node]) => {
      if (value === null || value === undefined || String(value).trim() === "") {
        add(`${name}: не задано.`, node);
        return;
      }
      const number = finiteNumber(value);
      if (number === null) {
        add(`${name}: не число (${JSON.stringify(value)}).`, node);
      } else if (number <= 0) {
        add(`${name}: має бути додатним, отримано ${number}.`, node);
      }
    });

    const count = finiteNumber(springCount);
    if (count !== null && count > 0 && !Number.isInteger(count)) {
      add(`кількість пружин ${count}: має бути цілим числом.`, FORCE_NODE);
    }
    // Витки навивають половинками: 2; 2,5; 3. Рукопис казав «ціле число»,
    // поле пропонувало крок 0,5, а перевірки не було зовсім — три різні
    // відповіді на одне питання.
    const adoptedCoils = finiteNumber(springAdoptedCoils);
    if (declared(springAdoptedCoils) && adoptedCoils !== null && adoptedCoils < 2)
      add("Робочих витків менше 2: прийняте конструктивне обмеження проєкту не виконано.", "calc.clutch-spring-rate");
    if (declared(springAdoptedCoils) && adoptedCoils !== null && adoptedCoils > 0
      && Math.abs(adoptedCoils * 2 - Math.round(adoptedCoils * 2)) > 1e-9) {
      add(`прийнята кількість робочих витків ${adoptedCoils}: витки приймають `
        + "кратно половині.", "calc.clutch-spring-rate");
    }
    // Множники менші за одиницю зменшували б навантаження замість запасу.
    [["множник відтяжних пружин", springReleaseFactor, FORCE_NODE],
      ["коефіцієнт нерівномірності", springUnevenFactor, DESIGN_NODE]]
      .forEach(([name, value, node]) => {
        const number = finiteNumber(value);
        if (number !== null && number > 0 && number < 1) {
          add(`${name} ${number} менший за одиницю: він додає запас, а не знімає його.`,
            node);
        }
      });
    const mean = finiteNumber(springMeanDiameterM);
    const wire = finiteNumber(springWireDiameterM);
    if (mean !== null && wire !== null && mean > 0 && wire > 0
      && !(mean > wire)) {
      // Порушення d ≥ Д_с — теж про прийнятий дріт, тому веде туди ж, куди
      // й він сам: у (9.12), де дріт уперше й читають.
      add(`діаметр дроту ${(wire * 1000).toFixed(1)} мм не менший за середній `
        + `діаметр пружини ${(mean * 1000).toFixed(1)} мм: такої пружини не буває.`,
      ALLOWABLE_NODE);
    }
    return problems.length
      ? { defined: false, problems, reason: problems.map(item => item.message).join(" ") }
      : { defined: true, problems: [] };
  }


  // Перевірка переданого моменту. Тепер вона є — і вона не тотожність.
  //
  // Довга історія цього місця варта одного речення: спершу ємність рахували з
  // тієї самої сили, з якої її виводили (a/b·b = a), потім — із межі міцності
  // дроту, що давало найбільший допустимий момент замість переданого. Обидва
  // рази «перевірка» не могла не пройти.
  //
  // Тепер порівнюють два числа різного походження. Потрібний момент — з
  // двигуна й коефіцієнта запасу. Наявний — із жорсткості прийнятої пружини
  // (матеріал і геометрія) та деформації в зібраному стані, яку автор вносить
  // із конструкції. Ані те, ані те не залежить від іншого: змініть момент
  // двигуна — сила пружини не зрушить.
  function torqueCapacityStatus({ designTorqueNm, transmissibleTorqueNm } = {}) {
    const isTorque = value => typeof value === "number"
      && Number.isFinite(value) && value > 0;
    if (!isTorque(designTorqueNm) || !isTorque(transmissibleTorqueNm)) {
      return {
        defined: true,
        checked: false,
        reason: "Перевірки переданого моменту немає: потрібен момент за (9.1) і "
          + "момент, який дають прийняті пружини за (9.20). Для другого треба "
          + "прийняти кількість робочих витків і деформацію пружини в зібраному "
          + "стані — вони конструктивні, і жодне джерело їх не подає."
      };
    }
    const margin = transmissibleTorqueNm / designTorqueNm;
    return {
      defined: true,
      checked: true,
      required: designTorqueNm,
      available: transmissibleTorqueNm,
      margin,
      sufficient: transmissibleTorqueNm >= designTorqueNm,
      reason: transmissibleTorqueNm >= designTorqueNm
        ? `Зчеплення передає ${transmissibleTorqueNm.toFixed(1)} Н·м проти потрібних `
          + `${designTorqueNm.toFixed(1)} Н·м — запас ${margin.toFixed(2)}.`
        : `Зчеплення передає лише ${transmissibleTorqueNm.toFixed(1)} Н·м проти `
          + `потрібних ${designTorqueNm.toFixed(1)} Н·м: воно пробуксовуватиме. `
          + "Збільште деформацію пружини в зібраному стані, візьміть товщий дріт "
          + "або більше пружин."
    };
  }

  // Висновок про переданий момент у канонічній формі — так само, як тиск і
  // міцність дроту: висновок, який видно лише на екрані, для документа не існує.
  function torqueCapacityDiagnostics({ status, declared }) {
    if (!declared || !status?.checked || status.sufficient) return [];
    return [{
      code: "CLUTCH_TORQUE_CAPACITY_SHORT",
      severity: "error",
      message: status.reason,
      details: { node: "calc.clutch-transmissible-torque" }
    }];
  }


  // Чи витримує прийнятий дріт те навантаження, яке справді на нього діє.
  //
  // Навантаження беруть залежно від того, що вже відоме. До прийняття
  // складання це розрахункова сила (9.10) — попередня перевірка розміру, і
  // вона рівносильна правилу самої методики «приймають найближчий більший
  // діаметр». Після прийняття — найбільша сила при вимиканні (9.18), бо саме
  // вона в дроті й виникає; на ній перевірка стає остаточною.
  //
  // Обидві величини різного походження — навантаження з ланцюга сил, гранична
  // сила з прийнятого дроту й матеріалу, — тому це справжнє порівняння, а не
  // тотожність.
  function springStrengthStatus({ designForceN, allowableForceN,
    maximumForceN, requiredWireM, adoptedWireM } = {}) {
    const isForce = value => typeof value === "number"
      && Number.isFinite(value) && value > 0;
    if (!isForce(allowableForceN)) {
      return {
        defined: true,
        checked: false,
        reason: "Міцність дроту не перевірено: немає граничної сили прийнятого "
          + "дроту (9.12)."
      };
    }

    // Дріт перевіряють за НАЙБІЛЬШОЮ силою, яка в ньому виникає, а не за
    // розрахунковою (9.10). Найбільша — при вимиканні: (9.18). Поки складання
    // не прийняте, найбільшої ще немає, і лишається попередня перевірка
    // розміру — вона теж справжня, просто інша.
    //
    // Без цього більша деформація давала більший момент і «проходила»
    // перевірку, хоча дріт при вимиканні був би перевантажений: 1007 Н проти
    // допустимих 670 Н, а порівнювали 496 Н.
    const realLoad = isForce(maximumForceN);
    const load = realLoad ? maximumForceN : designForceN;
    if (!isForce(load)) {
      return {
        defined: true,
        checked: false,
        reason: "Міцність дроту не перевірено: немає ні розрахункової сили (9.10), "
          + "ні найбільшої сили при вимиканні (9.18)."
      };
    }
    const basis = realLoad
      ? "найбільша сила при вимиканні (9.18)"
      : "розрахункова сила (9.10)";
    const margin = allowableForceN / load;
    const sufficient = allowableForceN >= load;
    const wires = typeof requiredWireM === "number" && typeof adoptedWireM === "number"
      ? ` Розрахунковий діаметр ${(requiredWireM * 1000).toFixed(2)} мм, `
        + `прийнятий ${(adoptedWireM * 1000).toFixed(2)} мм.`
      : "";
    return {
      defined: true,
      checked: true,
      sufficient,
      margin,
      realLoad,
      loadN: load,
      reason: (sufficient
        ? `Дріт витримує: гранична сила ${allowableForceN.toFixed(1)} Н проти `
          + `${load.toFixed(1)} Н (${basis}) — запас ${margin.toFixed(2)}.`
        : `Дріт не витримує: гранична сила ${allowableForceN.toFixed(1)} Н менша за `
          + `${load.toFixed(1)} Н (${basis}). Візьміть товщий дріт, менший `
          + "середній діаметр пружини, більше пружин або меншу деформацію "
          + "в зібраному стані.") + wires
    };
  }



  // Перевірка входів ПЕРЕД обчисленням.
  //
  // engdoc відмовляє на порожньому вході, але не знає правил конструкції:
  // з від'ємним діаметром або з внутрішнім більшим за зовнішній він чесно
  // порахує число, якого не буває. Тому обмеження, які випливають із самої
  // конструкції, перевіряють тут — до того, як щось обчислиться.
  // Число, а не те, що на число перетворюється.
  //
  // Number(true) — це 1, тому springInstalledDeflectionM: true проходило як
  // деформація в один метр і давало 42 992 Н·м без жодної діагностики. Той
  // самий рід помилки, що й Number(null) === 0, і ловимо ми його тут уже
  // вчетверте — тому тепер він в одному місці.
  //
  // Рядок із поля форми — нормальний вхід («12»), тому його приймають;
  // булеве, об'єкт, масив і порожнеча — ні.
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

  // Перевірка входів залежить від кроку.
  //
  // Перший крок (9.1—9.4) рахує потрібний діаметр і діаметрів ще не має —
  // вимагати їх від нього означало б вимагати результату від того, що його
  // тільки-но має дати. Другий крок (9.5—9.8) без них не має сенсу.
  function validateInputs({
    maximumEngineTorqueNm, reserveFactor, liningPressureMpa, frictionCoefficient,
    widthRatio, frictionSurfaces, outerDiameterM, innerDiameterM
  }, { stage = "final" } = {}) {
    const problems = [];
    const preliminary = stage === "preliminary";

    // Кожен крок перевіряє РІВНО те, що споживає.
    //
    // Досі перевірка була спільною, і обидва кроки страждали від цього
    // по-різному: перший відмовлявся через перевернуті діаметри, яких він
    // навіть не читає, а другий вимагав коефіцієнта запасу й тиску, які
    // належать першому. Обидві відмови однаково хибні: крок не може бути
    // невалідним через число, яке в нього не входить.
    const positive = preliminary
      ? [
        ["максимальний момент двигуна", maximumEngineTorqueNm],
        ["коефіцієнт запасу", reserveFactor],
        ["тиск на накладку", liningPressureMpa],
        ["коефіцієнт тертя", frictionCoefficient],
        ["коефіцієнт ширини", widthRatio]
      ]
      : [
        ["коефіцієнт тертя", frictionCoefficient],
        ["зовнішній діаметр", outerDiameterM],
        ["внутрішній діаметр", innerDiameterM]
      ];
    positive.forEach(([name, value]) => {
      // Number(null) — це 0, а не NaN, тому відсутнє значення проходило б як
      // «отримано 0» і читач дізнавався б, що ввів нуль, якого не вводив.
      // Порожнє й нульове — різні помилки, і називати їх треба різно.
      if (value === null || value === undefined || String(value).trim() === "") {
        problems.push(`${name}: не задано.`);
        return;
      }
      const number = finiteNumber(value);
      if (number === null) {
        problems.push(`${name}: не число (${JSON.stringify(value)}).`);
      } else if (number <= 0) {
        problems.push(`${name}: має бути додатним, отримано ${number}.`);
      }
    });

    // Кількість поверхонь тертя входить в обидва кроки.
    const surfaces = surfaceCount(frictionSurfaces);
    if (!surfaces.defined) problems.push(surfaces.reason);

    if (!preliminary) {
      const outer = Number(outerDiameterM);
      const inner = Number(innerDiameterM);
      if (Number.isFinite(outer) && Number.isFinite(inner) && outer > 0 && inner > 0
        && !(outer > inner)) {
        // Накладка — кільце. Внутрішній діаметр, не менший за зовнішній, дає
        // від'ємну або нульову площу, і тиск виходить від'ємним — числом, яке
        // виглядає як результат.
        problems.push(`внутрішній діаметр ${inner} м не менший за зовнішній ${outer} м: `
          + "кільця накладки не існує.");
      }
    }

    // Коефіцієнт тертя понад одиницю трапляється в природі, але не в парі
    // «накладка — чавун»: це майже напевно помилка введення. Він входить в
    // обидва кроки, тому перевіряється в обох.
    const mu = Number(frictionCoefficient);
    if (Number.isFinite(mu) && mu > 1) {
      problems.push(`коефіцієнт тертя ${mu} більший за одиницю: для пари «накладка — чавун» це неможливо.`);
    }

    return problems.length
      ? { defined: false, problems, reason: problems.join(" ") }
      : { defined: true, problems: [], drivenDiscs: surfaces.drivenDiscs };
  }

  // Перевірка тиску в канонічній формі.
  //
  // Досі висновок жив лише на екрані: у зафіксованому проєкті тиск виходив
  // 0,300139 МПа проти дозволених 0,300, і документ мовчав — ні попередження,
  // ні межі, ні сліду в звіті. Перевищення, яке видно лише тому, хто дивиться
  // на сторінку, для документа не існує.
  // Число в повідомленні округлюють до трьох знаків: перевірка лишається
  // точною, а в документі стоїть тиск, а не хвіст із п'ятнадцяти цифр.
  function pressureText(value) {
    return Number(value).toFixed(3).replace(".", ",");
  }

  function pressureDiagnostics({ check, limit }) {
    if (!check?.defined) {
      return [{
        code: "CLUTCH_PRESSURE_UNKNOWN",
        severity: "warning",
        message: "Дійсний тиск на накладку не порахований, тому його не перевірено."
      }];
    }
    if (!check.checked) {
      return [{
        code: "CLUTCH_PRESSURE_UNCHECKED",
        severity: "warning",
        message: "Допустимого тиску для цієї накладки документ не знає: "
          + "ні рядок таблиці, ні профіль його не задають. Перевірку не виконано."
      }];
    }
    const where = limit?.basis === "lining-row"
      ? "рядок таблиці 11"
      : "діапазон вибраного профілю";
    if (check.aboveMaximum) {
      return [{
        code: "CLUTCH_PRESSURE_ABOVE_LIMIT",
        severity: "error",
        message: `Дійсний тиск ${pressureText(check.value)} МПа перевищує допустимий `
          + `${pressureText(check.allowedRange.max)} МПа (${where}). Накладка перевантажена: `
          + "візьміть більший розмір або більше поверхонь тертя."
      }];
    }
    if (check.belowMinimum) {
      return [{
        code: "CLUTCH_PRESSURE_BELOW_RANGE",
        severity: "warning",
        message: `Дійсний тиск ${pressureText(check.value)} МПа нижчий за `
          + `${pressureText(check.allowedRange.min)} МПа (${where}). `
          + "Накладка недовантажена: зчеплення більше, ніж потрібно."
      }];
    }
    return [];
  }

  // Рішення розділу 9 у канонічній формі.
  //
  // Досі провенанс жив лише на екрані: у звіті й у JSON не було ні вибраної
  // архітектури, ні профілю, ні того, чи взято середину діапазону, чи власне
  // число, ні рекомендації, від якої відступили. Текст на сторінці не є
  // документом; документом є те, що можна вивантажити й перечитати.
  function decisionsFor({ applicability, methodProfile, vehicleType, adopted, geometry,
    springAdopted, springGeometry, springSourced, springAssembly,
    pressureElement, diaphragm }) {
    const decisions = [];

    if (applicability?.defined) {
      // Для електромобіля й послідовного гібрида «зчеплення немає» — не вибір
      // автора, а наслідок силової установки: там нічого не оголошували, і
      // записувати це як project-input означало б приписати проєктові рішення,
      // якого він не ухвалював.
      const chosen = applicability.architecture || null;
      decisions.push({
        id: "decision.clutch-architecture",
        kind: "Decision",
        choiceRef: null,
        symbol: null,
        adoptedValue: chosen?.id ?? "not-applicable",
        canonicalUnit: null,
        method: chosen ? "project-input" : "derived-from-powertrain",
        selectedReferenceId: null,
        rationale: applicability.reason,
        sourceRefs: ["source.project-input"],
        limitations: applicability.methodApplies === false
          ? ["Ця методика описує лише суху фрикційну муфту."]
          // Межі розділу — там, де їх шукатимуть: у рішенні про сам вузол.
          : ["За спеціальним завданням проєкту додатково перевіряють: "
            + `${SPECIAL_ASSIGNMENT_CHECKS.join(", ")}. Обидві книжки називають `
            + "ці перевірки, але методу для них не подають, тому цей документ "
            + "їх не рахує."],
        manuallyOverridden: Boolean(chosen)
      });
    }

    // Далі йде вже сама методика зчеплення. Якщо її тут не застосовують —
    // електромобіль, послідовний гібрид, гідротрансформатор, — то профілю,
    // коефіцієнта запасу й тертя цей проєкт не приймав узагалі. Раніше вони
    // записувалися завжди, і документ BEV повідомляв β = 1,475 і μ = 0,375 для
    // зчеплення, якого в машині немає: не помилка арифметики, а вигадане
    // рішення в провенансі.
    if (applicability?.methodApplies !== true) return decisions;

    // Тип автомобіля — теж рішення: у профілі Опанасюка саме він задає
    // діапазон β (легковий 1,2…1,75 проти вантажного 1,5…2,2). Досі його
    // приймали й мовчки використовували, тому в документі β з'являлося без
    // того, від чого воно залежить.
    // Тип автомобіля — ОДНЕ рішення на весь документ (decision.vehicle-type),
    // бо те саме значення задає діапазони ще у восьми розділах: коробка,
    // керованість, плавність ходу, підвіска, рульове, гальма, головна передача
    // й привод коліс. Своє окреме рішення зчеплення тут більше не заводить:
    // дві влади над одним значенням означали б, що читач не знає, котре з них
    // справжнє. Коефіцієнт запасу натомість оголошує глобальне рішення своєю
    // залежністю.

    if (methodProfile) {
      decisions.push({
        id: "decision.clutch-method-profile",
        kind: "Decision",
        choiceRef: null,
        symbol: null,
        adoptedValue: methodProfile.id,
        canonicalUnit: null,
        method: "project-input",
        selectedReferenceId: null,
        // Профіль вибирають цілком: діапазони, пороги й межі однієї книжки
        // мають сенс разом, а не в суміші з чужими.
        rationale: `Метод узято цілком за джерелом: ${methodProfile.label}.`
          + (methodProfile.verified === "ocr-only"
            ? " Числа цього профілю взято з розшифровки, не звіреної з друком."
            : ""),
        sourceRefs: [methodProfile.documentSourceId || "source.project-input"],
        limitations: methodProfile.verified === "ocr-only"
          ? ["Розшифровка джерела не звірена зі сканом."]
          : [],
        manuallyOverridden: true
      });
    }

    const symbols = {
      reserveFactor: "\\beta",
      frictionCoefficient: "\\mu",
      liningPressureMpa: "q",
      widthRatio: "k"
    };
    Object.entries(adopted || {}).forEach(([quantity, value]) => {
      if (!value?.defined) return;
      const range = value.recommendedRange;
      decisions.push({
        id: `decision.clutch-${quantity.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`,
        kind: "Decision",
        choiceRef: null,
        symbol: symbols[quantity] || null,
        adoptedValue: value.value,
        canonicalUnit: quantity === "liningPressureMpa" ? "MPa" : null,
        method: value.method,
        selectedReferenceId: null,
        recommendedValue: range ? (range.min + range.max) / 2 : null,
        // Джерело рекомендації живе окремо від джерела значення. Коли число
        // власне, sourceRefs чесно каже «проєкт», і без цього поля читач не
        // побачив би, чия рекомендація стояла поруч.
        recommendedSourceRefs: value.recommendedDocumentSourceId
          ? [value.recommendedDocumentSourceId]
          : (value.documentSourceId ? [value.documentSourceId] : []),
        rationale: value.method === "profile-midpoint"
          ? `Прийнято середину рекомендованого діапазону ${range.min}…${range.max}. `
            + "Середину вибрав цей проєкт: точкового значення джерело не подає."
          : `Власне значення автора.`
            + (range
              ? (value.withinRecommendation
                ? ` Профіль радить ${range.min}…${range.max}.`
                : ` Це ПОЗА рекомендацією профілю ${range.min}…${range.max}.`)
              : ""),
        sourceRefs: [value.documentSourceId || "source.project-input"],
        limitations: value.withinRecommendation === false
          ? ["Значення лежить поза діапазоном, який рекомендує вибраний профіль."]
          : [],
        manuallyOverridden: value.method === "project-input"
      });
    });

    // Розміри накладки — теж прийняті величини, і досі вони заходили в
    // документ як голі числа. Рукопис при цьому казав «приймають за таблицею»,
    // тому документ фактично стверджував походження, якого не перевіряв.
    if (geometry?.defined) {
      // Сам вибір рядка — окреме рішення, і саме воно найцікавіше: метод
      // порадив одне, автор узяв інше або те саме. Досі цього в документі не
      // було зовсім — лишалися два числа, ніби вони самі собою.
      if (geometry.basis === "verified-table") {
        const recommended = geometry.recommendedRow;
        const follows = geometry.followsRecommendation;
        decisions.push({
          id: "decision.clutch-lining-row",
          kind: "Decision",
          choiceRef: null,
          symbol: null,
          adoptedValue: geometry.row.id,
          canonicalUnit: null,
          method: follows === true ? "method-recommended-row" : "project-input",
          selectedReferenceId: geometry.row.id,
          recommendedValue: recommended ? recommended.id : null,
          recommendedSourceRefs: recommended && methodProfile?.documentSourceId
            ? [methodProfile.documentSourceId]
            : [],
          rationale: (() => {
            const temperatures = ` Ця накладка витримує `
              + `${geometry.row.continuousTempC} °C тривало і `
              + `${geometry.row.shortTempC} °C короткочасно.`;
            const rule = geometry.selectionRule === "nearest-larger"
              ? "найближче більше значення"
              : (geometry.selectionRule === "nearest" ? "найближче значення" : null);
            if (!recommended) {
              return "Рядок вибрано без поради методу: для порахованого діаметра "
                + "метод не має що порадити.";
            }
            if (follows) {
              return `Прийнято рядок, який радить метод: ${rule} для порахованого `
                + `попереднього діаметра — Д₃ ${recommended.outerMm} × d `
                + `${recommended.innerMm} мм.` + temperatures;
            }
            return `Метод радить ${rule}: Д₃ ${recommended.outerMm} × d `
              + `${recommended.innerMm} мм. Прийнято інший рядок — Д₃ `
              + `${geometry.row.outerMm} × d ${geometry.row.innerMm} мм.` + temperatures;
          })(),
          sourceRefs: follows === true
            ? geometry.sourceRefs
            : ["source.project-input"],
          limitations: geometry.limitations,
          manuallyOverridden: follows !== true
        });
      }

      [["decision.clutch-outer-diameter", "D_{\\mathrm{з}}", geometry.outerMm],
        ["decision.clutch-inner-diameter", "d_{\\mathrm{в}}", geometry.innerMm]]
        .forEach(([id, symbol, value]) => {
          decisions.push({
            id,
            kind: "Decision",
            choiceRef: null,
            symbol,
            adoptedValue: value,
            canonicalUnit: "mm",
            method: geometry.method,
            selectedReferenceId: geometry.row?.id || null,
            rationale: geometry.row
              ? `Рядок таблиці 11 (ГОСТ 1786-88): Д_з = ${geometry.row.outerMm} мм, `
                + `d_в = ${geometry.row.innerMm} мм, δ = ${geometry.row.thicknessMm} мм, `
                + `q = ${geometry.row.pressureMinMpa}…${geometry.row.pressureMaxMpa} МПа.`
              : (geometry.basis === "design-sizing"
                ? "Попередній розмір з балансу моменту й прийнятого тиску; d/D=0,60, D округлено вгору до 5 мм."
                : geometry.basis === "datasheet"
                ? "Розмір узято з паспорта наявної накладки."
                : "Розмір задано проєктом без таблиці й без паспорта."),
            sourceRefs: geometry.sourceRefs,
            limitations: geometry.limitations,
            // Рядок таблиці, взятий усупереч пораді методу, — це теж вибір
            // автора, а не «просто таблиця».
            manuallyOverridden: geometry.basis === "design-sizing" ? false : (geometry.basis !== "verified-table"
              || geometry.followsRecommendation !== true)
          });
        });
    }

    // Підрозділ 9.2 і 9.3 — альтернативи, і в РІШЕННЯХ теж.
    //
    // Кроки вже не змішувалися, а рішення змішувалися: документ тарільчастої
    // пружини ніс усі одинадцять рішень про пакет циліндричних — про витки,
    // дріт, деформацію, — яких у цій конструкції немає взагалі. Провенанс
    // конструкції, якої не існує, гірший за його відсутність.
    // Саме «пакет циліндричних пружин», а не «будь-що, крім тарільчастої».
    // Поки елемент не оголошено, документ не має рішень про жодну з
    // конструкцій: !pressureElement означало «пакет», і невизначений стан
    // видавав одинадцять рішень про пружини, яких автор не вибирав.
    const coilSpringsChosen = pressureElement?.id === "coil-springs";

    // Підрозділ 9.2. Величини методу — з провенансом профілю; геометрія
    // пружини конструктивна, і жодне джерело її не подає, тому вона завжди
    // власне рішення проєкту.
    if (coilSpringsChosen && springAdopted) {
      Object.entries(springAdopted).forEach(([quantity, value]) => {
        if (!value?.defined) return;
        const range = value.recommendedRange;
        decisions.push({
          id: `decision.clutch-spring-${quantity.replace(/[A-Z]/g,
            letter => `-${letter.toLowerCase()}`)}`,
          kind: "Decision",
          choiceRef: null,
          symbol: value.symbol || null,
          adoptedValue: value.value,
          canonicalUnit: value.canonicalUnit || null,
          method: value.method,
          selectedReferenceId: null,
          recommendedValue: range ? (range.min + range.max) / 2 : null,
          recommendedSourceRefs: value.recommendedDocumentSourceId
            ? [value.recommendedDocumentSourceId]
            : (value.documentSourceId ? [value.documentSourceId] : []),
          rationale: value.method === "profile-midpoint"
            ? (range && range.min !== range.max
              ? `Прийнято середину діапазону ${range.min}…${range.max}, який подає профіль.`
              : `Значення ${value.value} подає сам профіль.`)
            : "Власне значення автора."
              + (range
                ? (value.withinRecommendation
                  ? ` Профіль радить ${range.min}…${range.max}.`
                  : ` Це ПОЗА рекомендацією профілю ${range.min}…${range.max}.`)
                : ""),
          sourceRefs: [value.documentSourceId || "source.project-input"],
          limitations: value.withinRecommendation === false
            ? ["Значення лежить поза діапазоном, який рекомендує вибраний профіль."]
            : [],
          manuallyOverridden: value.method === "project-input"
        });
      });
    }

    // Точні значення джерела теж мають походження, і воно не «проєкт»:
    // 3 мм і 85 ГПа надруковані в книжці, вибирати тут нема з чого.
    if (coilSpringsChosen && springSourced) {
      [["decision.clutch-spring-travel", springSourced.travelM],
        ["decision.clutch-spring-shear-modulus", springSourced.shearModulusMpa]]
        .forEach(([id, value]) => {
          if (!value?.defined) return;
          decisions.push({
            id,
            kind: "Decision",
            choiceRef: null,
            symbol: value.symbol,
            adoptedValue: value.displayValue,
            canonicalUnit: value.canonicalUnit,
            method: value.method,
            selectedReferenceId: null,
            rationale: value.rationale,
            sourceRefs: [value.documentSourceId || "source.project-input"],
            limitations: [],
            manuallyOverridden: false
          });
        });
    }

    if (coilSpringsChosen && springGeometry?.defined) {
      const adoption = springGeometry.defaultAdoption;
      [["decision.clutch-spring-count", "z_{\\mathrm{пр}}", springGeometry.springCount, null,
        "clutchSpringCount"],
        ["decision.clutch-spring-mean-diameter", "Д_{\\mathrm{с}}",
          springGeometry.meanDiameterM * 1000, "mm", "clutchSpringMeanDiameter"],
        ["decision.clutch-spring-wire-diameter", "d",
          springGeometry.wireDiameterM * 1000, "mm", "clutchSpringWireDiameter"]]
        .forEach(([id, symbol, value, unit, field]) => {
          const automatic = adoption?.automaticFields.includes(field) === true;
          decisions.push({
            id,
            kind: "Decision",
            choiceRef: null,
            symbol,
            adoptedValue: value,
            canonicalUnit: unit,
            method: automatic ? "class-design-assumption" : "project-input",
            selectedReferenceId: null,
            rationale: automatic
              ? "Редагований початковий конструктивний варіант класу; джерела не задають цього розміру."
              : "Конструктивна величина: жодне з джерел ряду для неї не подає.",
            sourceRefs: ["source.project-input"],
            limitations: automatic ? adoption.limitations : [],
            manuallyOverridden: !automatic
          });
        });
    }

    // Натискний елемент — рішення, від якого залежить, який підрозділ узагалі
    // рахують. Без нього не рахують жодного.
    if (pressureElement) {
      decisions.push({
        id: "decision.clutch-pressure-element",
        kind: "Decision",
        choiceRef: null,
        symbol: null,
        adoptedValue: pressureElement.id,
        canonicalUnit: null,
        method: "project-input",
        selectedReferenceId: null,
        rationale: `${pressureElement.label}: розрахунок веде підрозділ `
          + `${pressureElement.subsection}. Пакет циліндричних пружин і тарільчаста — `
          + "альтернативи, разом вони не бувають.",
        sourceRefs: ["source.project-input"],
        limitations: [],
        manuallyOverridden: true
      });
    }

    // Геометрія тарільчастої пружини: розміри вносить автор, а книжки подають
    // лише частки між ними — тому відступ від часток теж записують.
    if (pressureElement?.id === "diaphragm" && diaphragm?.defined) {
      const proportions = diaphragm.proportions;
      // Кожен прийнятий розмір — своє рішення, незалежно від решти. Раніше
      // бракувало товщини — і зникало прийняте Д₂ разом зі своїм рішенням.
      [["decision.clutch-diaphragm-outer", "Д_1", diaphragm.outerMm],
        ["decision.clutch-diaphragm-contact", "Д_{\\mathrm{с}}", diaphragm.contactMm],
        ["decision.clutch-diaphragm-inner", "Д_{\\mathrm{вн}}", diaphragm.innerMm],
        // Д₂ у (9.21) не входить, але рекомендацію Д₁/Д₂ подають саме до нього.
        ["decision.clutch-diaphragm-disc-inner", "Д_2",
          proportions.discInner.valid ? proportions.discInner.value : null],
        ["decision.clutch-diaphragm-thickness", "\\delta",
          proportions.thickness.valid ? proportions.thickness.value : null],
        ["decision.clutch-diaphragm-height", "h",
          proportions.height.valid ? proportions.height.value : null]]
        .filter(([, , value]) => value !== null)
        .forEach(([id, symbol, value]) => {
          decisions.push({
            id,
            kind: "Decision",
            choiceRef: null,
            symbol,
            adoptedValue: value,
            canonicalUnit: "mm",
            method: "project-input",
            selectedReferenceId: null,
            rationale: "Розмір тарільчастої пружини вносить автор: книжки подають "
              + "лише частки між розмірами, а не самі розміри.",
            sourceRefs: ["source.project-input"],
            limitations: proportions.outsideRecommendation.length
              ? proportions.outsideRecommendation.map(item =>
                `${item.label} = ${item.value.toFixed(2)} — поза рекомендацією `
                + `${item.range.min}…${item.range.max}.`)
              : [],
            manuallyOverridden: true
          });
        });
    }

    // Сталі виразу напруження: форма наша, числа — книжчині. Без цього
    // рішення документ не казав би, чия саме книжка дала 404 чи 862 МПа.
    if (pressureElement?.id === "diaphragm" && methodProfile?.diaphragm?.stress
      && diaphragm?.defined && diaphragm.proportions.checked.length === 4) {
      const stress = methodProfile.diaphragm.stress;
      decisions.push({
        id: "decision.clutch-diaphragm-stress-method",
        kind: "Decision",
        choiceRef: null,
        symbol: null,
        adoptedValue: methodProfile.id,
        canonicalUnit: null,
        method: "source-value",
        selectedReferenceId: null,
        rationale: `Сталі виразу напруження за цим профілем: c_α = ${stress.alphaFactor}, `
          + `c_зг = ${stress.bendingCoefficient}, c_т = ${stress.thicknessCoefficient}, `
          + `c_E = ${stress.modulusCoefficient}. Книжка рахує напруження в точці: `
          + `${stress.point}.`,
        sourceRefs: [methodProfile.documentSourceId],
        limitations: ["Другий доданок виразу різниться між книжками знаком і "
          + "множником 2: для тієї самої пружини виходить 404 і 862 МПа. "
          + "Сам запис із чотирма сталими не друкує жодна книжка — це "
          + "параметризація цього проєкту."],
        manuallyOverridden: false
      });
    }

    // Складання пружини. Обидві величини конструктивні, і обидві — рішення
    // автора; порада щодо витків приходить із самого розрахунку (9.14), тому
    // документ каже й що порадив розрахунок, і що прийнято.
    if (coilSpringsChosen && springAssembly?.defined) {
      const adoption = springAssembly.defaultAdoption;
      const automatic = field => adoption?.automaticFields.includes(field) === true;
      decisions.push({
        id: "decision.clutch-spring-adopted-coils",
        kind: "Decision",
        choiceRef: null,
        symbol: "n",
        adoptedValue: springAssembly.coils,
        canonicalUnit: null,
        method: springAssembly.followsRecommendation === true
          && (!adoption || automatic("clutchSpringAdoptedCoils"))
          ? "rounded-from-calculation"
          : "project-input",
        selectedReferenceId: null,
        recommendedValue: springAssembly.recommendedCoils,
        recommendedSourceRefs: [],
        rationale: springAssembly.recommendedCoils === null
          ? "Кількість робочих витків прийнято без розрахункової поради."
          : `Розрахунок (9.14) дає ${springAssembly.recommendedCoils.toFixed(2)} витка; `
            + `прийнято ${springAssembly.coils}.`,
        sourceRefs: ["source.project-input"],
        limitations: [...(springAssembly.followsRecommendation === false
          ? [`Прийнято ${springAssembly.coils} витка замість `
            + `${springAssembly.roundedRecommendation} — розрахункового числа, `
            + "округленого до половини витка."]
          : []), ...(automatic("clutchSpringAdoptedCoils") ? adoption.limitations : [])],
        // Прийняте розрахункове число — не відступ автора, а округлення
        // розрахунку. Раніше тут завжди стояло true, і згода з розрахунком
        // виглядала як відхід від нього.
        manuallyOverridden: adoption
          ? !automatic("clutchSpringAdoptedCoils") : springAssembly.followsRecommendation !== true
      });
      if (springAssembly.deflectionBasis === "assembly-geometry") {
        [["free", "L_0", springAssembly.freeLengthMm, "clutchSpringFreeLength"],
          ["installed", "L_1", springAssembly.installedLengthMm, "clutchSpringInstalledLength"]]
          .forEach(([name, symbol, value, field]) => decisions.push({
            id: `decision.clutch-spring-${name}-length`, kind: "Decision", choiceRef: null,
            symbol, adoptedValue: value, canonicalUnit: "mm",
            method: automatic(field) ? "class-design-assumption" : "project-input",
            selectedReferenceId: null,
            rationale: automatic(field)
              ? "Редаговану довжину початкового варіанта прийнято незалежно від потрібної сили."
              : "Явно задана довжина конструкції пружини.",
            sourceRefs: ["source.project-input"],
            limitations: automatic(field) ? adoption.limitations : [],
            manuallyOverridden: !automatic(field)
          }));
      }
      decisions.push({
        id: "decision.clutch-spring-installed-deflection",
        kind: "Decision",
        choiceRef: null,
        symbol: "f",
        adoptedValue: springAssembly.deflectionM * 1000,
        canonicalUnit: "mm",
        method: springAssembly.deflectionBasis,
        selectedReferenceId: null,
        rationale: springAssembly.deflectionRationale,
        sourceRefs: ["source.project-input"],
        // Це і є та межа, через яку перевірка моменту лишалася б тотожністю,
        // якби деформацію вивели з потрібної сили.
        limitations: ["Деформацію вносить автор із конструкції; виводити її з "
          + "потрібної сили не можна — тоді перевірка переданого моменту стала б "
          + "тотожністю.", ...(springAssembly.deflectionBasis === "assembly-geometry"
            && automatic("clutchSpringFreeLength")
            && automatic("clutchSpringInstalledLength") ? adoption.limitations : [])],
        manuallyOverridden: !(springAssembly.deflectionBasis === "assembly-geometry"
          && automatic("clutchSpringFreeLength")
          && automatic("clutchSpringInstalledLength"))
      });
    }

    return decisions;
  }

  return Object.freeze({
    METHOD_PROFILES,
    CLUTCH_ARCHITECTURES,
    LINING_TABLE,
    liningTableFor,
    liningRow,
    recommendRow,
    adoptGeometry,
    profile,
    architecture,
    rangeFor,
    adopt,
    adoptSpring,
    adoptSpringGeometry,
    adoptSpringAssembly,
    SPECIAL_ASSIGNMENT_CHECKS,
    specialAssignmentStatus,
    PRESSURE_ELEMENTS,
    pressureElement,
    adoptDiaphragm,
    finiteNumber,
    diaphragmStressStatus,
    diaphragmDiagnostics,
    springRangeFor,
    applicability,
    surfaceCount,
    validateInputs,
    validateSpringInputs,
    springStrengthStatus,
    springStrengthDiagnostics,
    springAssemblyDiagnostics,
    torqueCapacityDiagnostics,
    springSourcedValues,
    decisionsFor,
    checkPressure,
    pressureLimitFor,
    pressureDiagnostics,
    boosterAdvice,
    torqueCapacityStatus
  });
}
