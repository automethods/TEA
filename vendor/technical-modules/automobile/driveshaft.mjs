"use strict";

// Розділ 11 — карданна передача.
//
// Метод із методичних вказівок, підрозділ 4.1.3, друковані с. 48—49. Числа
// звірено з рендером сторінок, а не з розшифровкою: та переставила місцями
// позначення частот (див. Data/Vehicle/docs/driveshaft_sources.md).
//
// Ланцюг простий: критична частота задає діаметри вала, діаметри — напруги
// кручення й кут закручування. Обидві перевірки мають надруковані межі.
export function createDriveshaft({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
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

  // Таблиця 15 — витяг з ГОСТ 13758-89. Звірено з друком.
  const SHAFT_SERIES = Object.freeze([
    { innerMm: 45, outerMm: Object.freeze([49, 50, 51]) },
    { innerMm: 55, outerMm: Object.freeze([59, 60, 61, 62]) },
    { innerMm: 71, outerMm: Object.freeze([74.6, 75.2, 76]) },
    { innerMm: 85, outerMm: Object.freeze([90, 91, 92]) },
    { innerMm: 110, outerMm: Object.freeze([114, 115, 116]) }
  ]);

  // An explicitly preliminary project grid, used only after every supplied
  // table section fails. These dimensions are NOT attributed to ГОСТ.
  const PRELIMINARY_CUSTOM_GRID = Object.freeze({
    minimumOuterMm: 120, maximumOuterMm: 300, outerStepMm: 1,
    minimumWallMm: 4, wallDivisor: 20
  });
  const CUSTOM_SECTION_LIMITATION = "Переріз поза наведеним рядом ГОСТ 13758-89: це попередньо прийнята проєктна труба. Матеріал, доступність і виготовлення труби, зварні шви, втома, балансування, опори й критичні форми зібраної передачі потребують окремої перевірки.";

  const RESERVE_RANGE = Object.freeze({ min: 1.2, max: 2.0 });
  const SPEED_MARGIN_RANGE = Object.freeze({ min: 1.1, max: 1.2 });
  const TORSION_LIMITS_MPA = Object.freeze({ min: 100, max: 300 });
  const TWIST_LIMIT_DEG_PER_M = 6;
  const TWO_SHAFT_LENGTH_M = 1.6;

  // Модуль зсуву сталі.
  //
  // Джерело друкує 85 ГПа. Загальновживане значення для конструкційних сталей —
  // 80…81 ГПа, і автор проєкту вирішив рахувати за ним. Це СВІДОМИЙ відступ
  // від букви джерела, а не описка: кут закручування обернено пропорційний G,
  // тому різниця в 6 % не губиться в округленнях, і крок про неї каже.
  const SHEAR_MODULUS_GPA = 80;
  const PRINTED_SHEAR_MODULUS_GPA = 85;

  // Довжину вала джерело велить брати З КОМПОНУВАЛЬНОЇ СХЕМИ й формули не
  // подає. Ця оцінка — груба підказка проєкту, щоб було з чого почати: у
  // класичному компонуванні вал займає приблизно половину бази. Приймає її
  // автор, і справжнє число він знімає зі своєї схеми.
  const LENGTH_FROM_WHEELBASE = 0.5;

  function recommendLength(wheelbaseM) {
    const base = finiteNumber(wheelbaseM);
    if (base === null || base <= 0) {
      return { defined: false, reason: "Колісна база не задана." };
    }
    return {
      defined: true,
      lengthM: base * LENGTH_FROM_WHEELBASE,
      wheelbaseM: base,
      share: LENGTH_FROM_WHEELBASE
    };
  }

  function adoptLength({ basis, wheelbaseM, manualValue }) {
    if (basis === "project-input") {
      const value = finiteNumber(manualValue);
      if (value === null || value <= 0) {
        return { defined: false, reason: "Вибрано власну довжину, але поле порожнє." };
      }
      return { defined: true, lengthM: value, method: "project-input" };
    }
    if (basis === "supported-spans") {
      const full = recommendLength(wheelbaseM);
      if (!full.defined) return full;
      const shaftCount = Math.max(1, Math.ceil(full.lengthM / 1.1));
      return {defined:true, lengthM:full.lengthM / shaftCount,
        totalRouteM:full.lengthM, shaftCount, intermediateSupports:shaftCount-1,
        method:"supported-spans", recommended:full,
        reason:`Попередня траса B/2=${full.lengthM.toFixed(2)} м: ${shaftCount} рівних прольотів, ${shaftCount-1} проміжних опор. Перевіряють один найбільший непідпертий проліт; положення опор і шарнірів слід уточнити компонуванням.`};
    }
    if (basis !== "from-wheelbase") {
      return { defined: false, reason: "Основу прийняття довжини не вибрано." };
    }
    const recommended = recommendLength(wheelbaseM);
    return recommended.defined
      ? { defined: true, lengthM: recommended.lengthM, method: "project-derivation",
        recommended }
      : { defined: false, reason: recommended.reason };
  }

  // L_в ≥ 1,6 м — джерело велить брати двовальну передачу.
  function shaftCountAdvice(lengthM) {
    const length = finiteNumber(lengthM);
    if (length === null || length <= 0) {
      return { defined: false, reason: "Довжина вала не відома." };
    }
    return {
      defined: true,
      lengthM: length,
      twoShaft: length >= TWO_SHAFT_LENGTH_M,
      thresholdM: TWO_SHAFT_LENGTH_M,
      reason: length >= TWO_SHAFT_LENGTH_M
        ? `Довжина ${length.toFixed(2)} м не менша за ${TWO_SHAFT_LENGTH_M} м: `
          + "джерело велить обирати двовальну передачу з проміжною опорою."
        : `Довжина ${length.toFixed(2)} м менша за ${TWO_SHAFT_LENGTH_M} м: `
          + "вистачає одного вала."
    };
  }

  function adoptRange(range, basis, manualValue, name) {
    if (basis === "project-input") {
      const value = finiteNumber(manualValue);
      if (value === null || value <= 0) {
        return { defined: false, reason: `Вибрано власний ${name}, але поле порожнє.` };
      }
      return { defined: true, value, method: "project-input", range,
        withinRange: value >= range.min && value <= range.max };
    }
    if (basis !== "source-midpoint") {
      return { defined: false, reason: `Основу прийняття (${name}) не вибрано.` };
    }
    const value = (range.min + range.max) / 2;
    return { defined: true, value, method: "source-midpoint", range, withinRange: true };
  }

  // ω_max = (1,1…1,2)·ω_дmax/u_кmin — найбільша частота обертання КАРДАННОГО
  // вала. У розшифровці джерела ці два позначення переставлені місцями.
  function propellerShaftSpeed({ engineMaxAngularSpeed, minGearboxRatio, margin }) {
    const engine = finiteNumber(engineMaxAngularSpeed);
    const ratio = finiteNumber(minGearboxRatio);
    if (engine === null || engine <= 0) {
      return { defined: false, reason: "Потрібна максимальна частота обертання двигуна." };
    }
    if (ratio === null || ratio <= 0) {
      return { defined: false, reason: "Потрібне мінімальне передаточне число коробки." };
    }
    if (!margin?.defined) {
      return { defined: false, reason: margin?.reason || "Множник частоти не прийнято." };
    }
    return {
      defined: true,
      value: margin.value * engine / ratio,
      engineMaxAngularSpeed: engine,
      minGearboxRatio: ratio,
      margin: margin.value
    };
  }

  function criticalSpeed({ shaftSpeed, reserve }) {
    if (!shaftSpeed?.defined) {
      return { defined: false, reason: shaftSpeed?.reason || "Частота вала не відома." };
    }
    if (!reserve?.defined) {
      return { defined: false, reason: reserve?.reason || "Коефіцієнт запасу не прийнято." };
    }
    return {
      defined: true,
      value: reserve.value * shaftSpeed.value,
      shaftSpeedValue: shaftSpeed.value,
      reserve: reserve.value
    };
  }

  // (4.1) обернено: ω_кр = 1,13·10⁷√(D²+d²)/L² → D = √((ω_кр L²/1,13·10⁷)² − d²)
  function requiredOuterDiameterMm({ criticalSpeedValue, innerMm, lengthMm }) {
    const omega = finiteNumber(criticalSpeedValue);
    const inner = finiteNumber(innerMm);
    const length = finiteNumber(lengthMm);
    if (omega === null || omega <= 0 || inner === null || inner <= 0
      || length === null || length <= 0) {
      return { defined: false, reason: "Потрібні критична частота, внутрішній діаметр і довжина." };
    }
    const radicand = (omega * length * length / 1.13e7) ** 2 - inner * inner;
    if (!(radicand > 0)) {
      // Тут стояла відмова з поясненням, що вал «не досягає потрібної частоти
      // за жодної товщини стінки». Читання було ПЕРЕВЕРНУТЕ, і це видно з
      // самої нерівності. Умова придатності — ω_кр ≥ ω, тобто
      // D² ≥ (ωL²/C)² − d². Від'ємна права частина означає, що нерівність
      // виконується за БУДЬ-ЯКОГО D: труба з таким внутрішнім діаметром уже
      // жорсткіша, ніж треба, і мінімальний переріз ряду підходить.
      //
      // Відмова в цьому місці мовчки викидала весь розділ 11 там, де привод
      // низькообертовий: електричний і послідовно-гібридний варіанти базової
      // лінії давали НУЛЬ кроків замість шести, і жоден тест цього не бачив,
      // бо перевіряли лише варіанти з ДВЗ. Справжня неможливість — коли
      // потрібний D більший за все, що є в таблиці; її ловить пошук по ряду.
      return {
        defined: true,
        value: 0,
        satisfiedByAnyWall: true,
        innerMm: inner,
        lengthMm: length
      };
    }
    return { defined: true, value: Math.sqrt(radicand), innerMm: inner, lengthMm: length };
  }

  // Обчислене D округляють до найближчого БІЛЬШОГО в рядку свого d.
  //
  // Прапорець «будь-яка стінка підходить» переносять СЮДИ, бо він властивість
  // не обчислення, а прийнятого перерізу: при вручну вибраному d його губили,
  // і крок разом із підказкою казав «розрахунок вимагає 0 мм» — число, яке
  // нічого не означає.
  function adoptOuterDiameter({ requiredMm, innerMm, satisfiedByAnyWall = false }) {
    const required = finiteNumber(requiredMm);
    const inner = finiteNumber(innerMm);
    if (required === null || inner === null) {
      return { defined: false, reason: "Потрібен обчислений діаметр." };
    }
    const row = SHAFT_SERIES.find(item => item.innerMm === inner);
    if (!row) {
      return { defined: false, reason: `Внутрішнього діаметра ${inner} мм у таблиці 15 немає.` };
    }
    const chosen = row.outerMm.find(value => value >= required);
    if (chosen === undefined) {
      return {
        defined: false,
        reason: `Потрібно ${required.toFixed(1)} мм, а найбільший зовнішній діаметр `
          + `рядка d = ${inner} мм — ${row.outerMm[row.outerMm.length - 1]} мм. `
          + "Візьміть наступний рядок ГОСТ."
      };
    }
    return {
      defined: true,
      outerMm: chosen,
      innerMm: inner,
      requiredMm: required,
      satisfiedByAnyWall: satisfiedByAnyWall === true,
      row: row.outerMm,
      method: "standard-series"
    };
  }

  // Джерело велить вибрати d за таблицею, потім порахувати D і округлити
  // вгору. Якщо в рядку такого D немає — беруть наступний рядок; сам перебір
  // рядків книжка не описує, це помічник проєкту, а вибір лишається за
  // автором.
  function recommendSection({ criticalSpeedValue, lengthMm, designTorqueNm = null }) {
    const omega = finiteNumber(criticalSpeedValue);
    const length = finiteNumber(lengthMm);
    const torque = finiteNumber(designTorqueNm);
    if (omega === null || omega <= 0 || length === null || length <= 0) {
      return { defined: false, reason: "Потрібні критична частота й довжина вала." };
    }
    for (const row of SHAFT_SERIES) {
      const required = requiredOuterDiameterMm({
        criticalSpeedValue: omega, innerMm: row.innerMm, lengthMm: length
      });
      if (!required.defined) continue;
      // Independent reference implementation; the live selection evaluates the
      // same candidates through the authoritative worksheet.
      for (const chosen of row.outerMm.filter(value => value + 1e-9 >= required.value)) {
      const torsion = torque !== null && torque > 0
        ? torsionalStress({ torqueNm: torque, outerMm: chosen, innerMm: row.innerMm })
        : null;
      const twist = torque !== null && torque > 0
        ? twistAngle({ torqueNm: torque, lengthMm: length, outerMm: chosen, innerMm: row.innerMm })
        : null;
      if (torsion?.defined && !torsion.withinLimit) continue;
      if (twist?.defined && !twist.withinLimit) continue;
      return {
        defined: true,
        innerMm: row.innerMm,
        outerMm: chosen,
        requiredMm: required.value,
        satisfiedByAnyWall: required.satisfiedByAnyWall === true,
        sizedForTorque: torque !== null && torque > 0,
        torsionMpa: torsion?.defined ? torsion.value : null,
        twistPerMetreDeg: twist?.defined ? twist.perMetreDeg : null
      };
      }
    }
    return {
      defined: false,
      reason: torque !== null && torque > 0
        ? `Жоден рядок таблиці 15 одночасно не проходить критичну частоту ${omega.toFixed(0)} с⁻¹, `
          + `кручення і жорсткість при M=${torque.toFixed(0)} Н·м та довжині ${(length / 1000).toFixed(2)} м. `
          + "Потрібен інший стандартний переріз або конструкція вала."
        : `Жоден рядок таблиці 15 не дає критичної частоти ${omega.toFixed(0)} с⁻¹ `
          + `для вала завдовжки ${(length / 1000).toFixed(2)} м. Вал треба вкоротити — `
          + "тобто зробити передачу двовальною з проміжною опорою."
    };
  }

  // (4.2) M_розр = β·M_кmax·u_к1
  function designTorque({ engineTorqueNm, reserveFactor, firstGearRatio,
    reserveFactorIsAbsent = false }) {
    const torque = finiteNumber(engineTorqueNm);
    const beta = reserveFactorIsAbsent ? 1 : finiteNumber(reserveFactor);
    const ratio = finiteNumber(firstGearRatio);
    if (torque === null || torque <= 0 || beta === null || beta <= 0
      || ratio === null || ratio <= 0) {
      return { defined: false, reason: reserveFactorIsAbsent
        ? "Потрібні момент джерела й передаточне число першої передачі."
        : "Потрібні момент двигуна, коефіцієнт запасу й передаточне число першої передачі." };
    }
    return {
      defined: true,
      value: beta * torque * ratio,
      engineTorqueNm: torque,
      reserveFactor: beta,
      firstGearRatio: ratio,
      reserveFactorIsAbsent
    };
  }

  function sectionModulus(outerMm, innerMm) {
    return Math.PI * (outerMm ** 4 - innerMm ** 4);
  }

  // τ = 16·M·D/(π(D⁴−d⁴)), момент у Н·м → Н·мм.
  function torsionalStress({ torqueNm, outerMm, innerMm }) {
    const torque = finiteNumber(torqueNm);
    const outer = finiteNumber(outerMm);
    const inner = finiteNumber(innerMm);
    if (torque === null || outer === null || inner === null || !(outer > inner)) {
      return { defined: false, reason: "Потрібні момент і діаметри, зовнішній більший за внутрішній." };
    }
    const value = 16 * torque * 1000 * outer / sectionModulus(outer, inner);
    return {
      defined: true,
      value,
      // 100…300 МПа — це вимога МІЦНОСТІ, тобто верхня межа. Опинитися нижче
      // за неї не порушення: карданний вал розміряють за критичною частотою,
      // і вал, підібраний під неї, майже завжди міцніший, ніж треба.
      withinLimit: value <= TORSION_LIMITS_MPA.max,
      belowBand: value < TORSION_LIMITS_MPA.min,
      limits: TORSION_LIMITS_MPA
    };
  }

  // φ = M·L/(G·J_p)·180/π, J_p = π(D⁴−d⁴)/32
  function twistAngle({ torqueNm, lengthMm, outerMm, innerMm,
    shearModulusGpa = SHEAR_MODULUS_GPA }) {
    const torque = finiteNumber(torqueNm);
    const length = finiteNumber(lengthMm);
    const outer = finiteNumber(outerMm);
    const inner = finiteNumber(innerMm);
    const modulus = finiteNumber(shearModulusGpa);
    if (torque === null || length === null || outer === null || inner === null
      || modulus === null || !(outer > inner) || !(length > 0) || !(modulus > 0)) {
      return { defined: false, reason: "Потрібні момент, довжина, діаметри й модуль зсуву." };
    }
    const polarMoment = sectionModulus(outer, inner) / 32;
    // Н·мм · мм / (МПа · мм⁴) — радіани, далі в градуси.
    const radians = torque * 1000 * length / (modulus * 1000 * polarMoment);
    const degrees = radians * 180 / Math.PI;
    const perMetre = degrees / (length / 1000);
    return {
      defined: true,
      value: degrees,
      perMetreDeg: perMetre,
      withinLimit: perMetre <= TWIST_LIMIT_DEG_PER_M,
      limitDegPerM: TWIST_LIMIT_DEG_PER_M,
      polarMomentMm4: polarMoment,
      shearModulusGpa: modulus
    };
  }

  const SOURCE_REFS = Object.freeze(["source.method.course"]);

  // Крок оголошує те, що робить: ПРИЙМАЄ переріз із ряду ГОСТ. Доти він
  // оголошував виразом sqrt(...), а повертав табличне значення — вираз і
  // результат казали різне. Сам вираз тепер рахує engdoc, і його вихід
  // value.driveshaft-required-outer-diameter стоїть тут залежністю.
  function buildDiameterStep({ adopted, lengthMm, texNumber }) {
    const loadSized = adopted.sizedForTorque && !adopted.manual;
    const custom = adopted.custom === true;
    const seriesTex = custom ? "\\text{проєктна сітка, не ГОСТ}" : "\\text{ГОСТ 13758-89}";
    return {
      id: "driveshaft-outer-diameter",
      title: "Зовнішній діаметр карданного вала",
      purpose: loadSized ? "Select a complete section meeting critical-speed, torsion and twist limits." : "Size the tube so its whirling speed clears the working range.",
      output: {
        id: "value.driveshaft-outer-diameter",
        symbol: "D",
        label: "Outer diameter",
        valueType: "quantity",
        canonicalUnit: "mm"
      },
      expression: loadSized ? `first ${custom ? "explicit preliminary project grid" : "standard"} d,D pair meeting D_req, torsion and twist limits` : "smallest outer diameter of the GOST row that meets D_req",
      dependencies: ["value.driveshaft-required-outer-diameter",
        "decision.driveshaft-inner-diameter", ...(loadSized ? ["value.driveshaft-design-torque"] : [])],
      equationNumber: "11.3",
      formulaTex: loadSized
        ? `(d,D)\\in${seriesTex}:\\quad D\\ge D_{\\text{потр}},\\quad\\tau\\le[\\tau],\\quad\\varphi/L\\le[\\varphi/L]`
        : "D=\\min\\{D_i\\in\\text{ГОСТ 13758-89}\\mid D_i\\ge D_{\\text{потр}}\\}",
      substitutionTex: `d=${texNumber(adopted.innerMm, 0)}\\ \\text{мм},\\quad `
        + `L_{\\text{в}}=${texNumber(lengthMm, 0)}\\ \\text{мм}:\\quad `
        // Критичну частоту тут не цитують: її немає серед залежностей цього
        // кроку, і брати її означало б читати число, якого крок не оголошує.
        + (adopted.satisfiedByAnyWall
          ? "\\text{за частотою — будь-яка стінка}\\Rightarrow "
          : `D\\ge${texNumber(adopted.requiredMm, 1)}\\Rightarrow `)
        + `${texNumber(adopted.outerMm, 1)}\\ \\text{мм}`,
      result: { value: adopted.outerMm, canonicalUnit: "mm", displayUnit: "мм" },
      method: custom ? "project-custom-section-speed-torque-twist" : loadSized ? "standard-series-speed-torque-twist" : "standard-series",
      sourceRefs: custom ? [...SOURCE_REFS, "source.project-derivation"] : SOURCE_REFS,
      readerNotes: [
        loadSized
          ? `Прийнято повний переріз d=${adopted.innerMm} мм, D=${adopted.outerMm} мм за трьома умовами: критична частота, τ=${texNumber(adopted.torsionMpa,1)} МПа ≤ ${TORSION_LIMITS_MPA.max} МПа, φ/L=${texNumber(adopted.twistPerMetreDeg,2)}°/м ≤ ${TWIST_LIMIT_DEG_PER_M}°/м. Усі перевірки кандидатів обчислює той самий аркуш engdoc.`
            + (custom ? ` Наведений стандартний ряд не проходить; прийнято проєктну трубу із сітки D=${adopted.customGrid.minimumOuterMm}…${adopted.customGrid.maximumOuterMm} мм, крок ${adopted.customGrid.outerStepMm} мм, товщина стінки t=max(${adopted.customGrid.minimumWallMm}, ceil(D/${adopted.customGrid.wallDivisor})) мм, d=D−2t. Це не стандартний типорозмір.` : "")
          : adopted.satisfiedByAnyWall
          ? "Критичну частоту перевищує вже "
            + `найтонша труба ряду при d = ${adopted.innerMm} мм, тому за розміром `
            + `узято найменший зовнішній діаметр рядка — ${adopted.outerMm} мм. `
            + "Так буває в низькообертовому приводі: вал крутиться повільно, і "
            + "биття йому не загрожує за жодної товщини стінки."
          : `Розрахунок вимагає ${adopted.requiredMm.toFixed(1)} мм; ряд ГОСТ 13758-89 `
            + `для d = ${adopted.innerMm} мм дає ${adopted.outerMm} мм.`
      ],
      assumptions: custom ? ["Крок і товщина стінки проєктної сітки є явним геометричним припущенням; виробнича доступність не підтверджена."] : [],
      limitations: custom ? [CUSTOM_SECTION_LIMITATION] : loadSized ? ["Вибір обмежено наведеним рядом труб. Перевірки є попередніми; зварні шви, втома, балансування й опори окремо не перевірені."] : adopted.satisfiedByAnyWall
        ? ["Розміру за критичною частотою тут немає: її задовольняє весь рядок, "
          + "тому переріз обрано найтоншим. Міцність такого вала перевіряють "
          + "окремо — рівняннями (11.5) і (11.6)."]
        : [
          "Обчислене значення округлюють до найближчого БІЛЬШОГО в ряду: менший "
          + "діаметр знизив би критичну частоту нижче за потрібну."
        ]
    };
  }

  // Примітки читачеві для кроків, які тепер рахує engdoc.
  //
  // Місток будує крок із ТРАСИ, а траса не має ні readerNotes, ні method: у
  // engdoc їх просто немає. Якби їх не додати, розділ утратив би все, що
  // пояснює відступи від джерела — а це половина цінності книжки. Тому вони
  // живуть тут, у модулі розділу, поряд із межами й діагностиками, і
  // застосунок із фікстурою беруть їх з одного місця.
  // Аргументи — прості числа з трас engdoc. Доти сюди передавали результати
  // чистих функцій, тобто ДРУГЕ обчислення тих самих величин поряд із трасою:
  // розійтися вони могли будь-коли, і ніщо цього не показало б.
  function worksheetNotes({ torsionMpa = null, twistPerMetreDeg = null } = {}) {
    return {
      // (11.1) і (11.4) переїхали в engdoc останніми, і приміток їм тоді не
      // додали: у звіті вони друкувалися числом без методу й без пояснення.
      // Траса методу не несе — його дає розділ, тут.
      "driveshaft-speed": {
        method: "sourced-formula",
        readerNotes: [
          "ω_дmax — джерело тяги, ω_max — карданний вал. У текстовій "
          + "розшифровці джерела ці позначення переставлені місцями; тут вони "
          + "як у друку.",
          `Множник ${SPEED_MARGIN_RANGE.min}…${SPEED_MARGIN_RANGE.max} — запас на `
          + "те, що джерело тяги може перекрутити номінал."
        ]
      },
      "driveshaft-design-torque": {
        method: "sourced-formula",
        readerNotes: [
          "Момент беруть на ПЕРШІЙ передачі: саме на ній вал несе найбільше."
        ]
      },
      "driveshaft-twist-per-metre": {
        method: "sourced-formula",
        readerNotes: [
          `Межа — ${TWIST_LIMIT_DEG_PER_M}° на кожен метр довжини, тому `
          + "перевіряють саме цю величину, а не кут усього вала."
        ]
      },
      "driveshaft-critical-speed": {
        method: "sourced-formula",
        readerNotes: [
          `Запас K_зап = ${RESERVE_RANGE.min}…${RESERVE_RANGE.max} над робочою `
          + "частотою: на критичній вал починає бити, і працювати біля неї не можна."
        ]
      },
      "driveshaft-required-outer-diameter": {
        method: "project-derivation",
        readerNotes: [
          "Це ВИМОГА, а не розмір: надрукований вираз розв'язано щодо D. Сам "
          + "розмір беруть наступним кроком із наведеного ряду ГОСТ 13758-89. Якщо жоден повний переріз не проходить усі три перевірки, проєкт явно позначає позатабличну попередню трубу. Перебір кандидатів не є виразом.",
          "Нуль тут означає, що критичну частоту перевищує будь-яка стінка "
          + "таблиці: підкореневий вираз від'ємний, і це не помилка, а стан "
          + "низькообертового привода."
        ],
        limitations: [
          "Коефіцієнт биття джерело друкує як 1,13·10⁷ під міліметри. У СІ той "
          + "самий коефіцієнт дорівнює 1,13·10⁴ м/с, і аркуш пише його з "
          + "одиницею: без неї вираз не сходиться за розмірністю."
        ]
      },
      "driveshaft-torsion": {
        method: "sourced-formula",
        readerNotes: [
          `Джерело вимагає ${TORSION_LIMITS_MPA.min}…${TORSION_LIMITS_MPA.max} МПа.`,
          ...(torsionMpa !== null && torsionMpa < TORSION_LIMITS_MPA.min
            ? ["Напруга нижче 100 МПа не перевищує допустиму. Переріз також має задовольняти критичну частоту й жорсткість; одну причину запасу без порівняння всіх умов не визначають."]
            : [])
        ],
        limitations: torsionMpa !== null && torsionMpa > TORSION_LIMITS_MPA.max
          ? [`Напруга ${torsionMpa.toFixed(0)} МПа перевищує `
            + `${TORSION_LIMITS_MPA.max} МПа, які подає джерело.`]
          : []
      },
      "driveshaft-twist": {
        method: "sourced-formula",
        readerNotes: [
          `Межа — ${TWIST_LIMIT_DEG_PER_M}° на кожен метр довжини, тому `
          + "перевіряють саме кут на метр, а не кут усього вала."
        ],
        limitations: [
          `Модуль зсуву взято ${SHEAR_MODULUS_GPA} ГПа — загальновживане `
          + `значення для конструкційних сталей. Джерело друкує `
          + `${PRINTED_SHEAR_MODULUS_GPA} ГПа; кут обернено пропорційний G, тому `
          + "різниця не губиться в округленнях. Це рішення проєкту, не джерела.",
          ...(twistPerMetreDeg !== null && twistPerMetreDeg > TWIST_LIMIT_DEG_PER_M
            ? ["Кут перевищує межу: джерело радить збільшити площу перерізу "
              + "або вкоротити вал."]
            : [])
        ]
      }
    };
  }

  function diagnosticsFor({ torsionMpa = null, twistPerMetreDeg = null,
    section, advice } = {}) {
    const out = [];
    // Кількість валів документ не ПРИЙМАЄ, а виводить із довжини. Це порада
    // джерела, і місце їй серед діагностик: рішенням вона була б твердженням
    // про вибір, якого автор не робив.
    if (advice?.defined && advice.twoShaft) {
      out.push({
        code: "DRIVESHAFT_TWO_SHAFT_ADVISED",
        severity: "info",
        message: advice.reason,
        details: { node: "calc.driveshaft-outer-diameter" }
      });
    }
    if (torsionMpa !== null && torsionMpa > TORSION_LIMITS_MPA.max) {
      out.push({
        code: "DRIVESHAFT_TORSION_ABOVE_LIMIT",
        severity: "warning",
        message: `Напруги кручення ${torsionMpa.toFixed(0)} МПа перевищують `
          + `${TORSION_LIMITS_MPA.max} МПа, які подає джерело. Вал не витримає: `
          + "потрібен більший діаметр або товща стінка.",
        details: { node: "calc.driveshaft-torsion" }
      });
    } else if (torsionMpa !== null && torsionMpa < TORSION_LIMITS_MPA.min) {
      out.push({
        code: "DRIVESHAFT_TORSION_BELOW_BAND",
        // Не дефект: так і має бути у вала, підібраного за критичною частотою.
        severity: "info",
        message: `Напруги кручення ${torsionMpa.toFixed(0)} МПа нижчі за `
          + `${TORSION_LIMITS_MPA.min} МПа, з яких починається діапазон джерела. Це `
          + "не перевищення допустимої напруги; переріз також має задовольняти критичну частоту й жорсткість. "
          + "Діапазон 100…300 МПа — вимога міцності, тобто верхня межа.",
        details: { node: "calc.driveshaft-torsion" }
      });
    }
    if (twistPerMetreDeg !== null && twistPerMetreDeg > TWIST_LIMIT_DEG_PER_M) {
      out.push({
        code: "DRIVESHAFT_TWIST_EXCEEDS_LIMIT",
        severity: "warning",
        message: `Кут закручування ${twistPerMetreDeg.toFixed(2)}°/м перевищує `
          + `${TWIST_LIMIT_DEG_PER_M}°/м. Джерело радить збільшити площу перерізу `
          + "або вкоротити вал.",
        details: { node: "calc.driveshaft-twist" }
      });
    }
    if (section && section.defined === false && section.reason) {
      out.push({
        code: "DRIVESHAFT_SECTION_NOT_FOUND",
        severity: "error",
        message: section.reason,
        details: { node: "calc.driveshaft-outer-diameter" }
      });
    }
    if (section?.defined && section.custom) out.push({
      code: "DRIVESHAFT_CUSTOM_SECTION_PRELIMINARY", severity: "warning",
      message: CUSTOM_SECTION_LIMITATION,
      details: { node: "calc.driveshaft-outer-diameter", innerMm: section.innerMm, outerMm: section.outerMm }
    });
    return out;
  }

  function decisionsFor({ length, reserve, margin, section }) {
    const decisions = [];
    if (length?.defined) {
      decisions.push({
        id: "decision.driveshaft-length",
        kind: "Decision",
        choiceRef: null,
        symbol: "L_{\\text{в}}",
        adoptedValue: length.lengthM,
        canonicalUnit: "m",
        method: length.method,
        selectedReferenceId: null,
        recommendedValue: length.recommended?.lengthM ?? null,
        recommendedSourceRefs: ["source.project-derivation"],
        rationale: length.method === "supported-spans" ? length.reason : length.method === "project-input"
          ? "Довжину знято з компонувальної схеми, як велить джерело."
          : "Груба початкова оцінка проєкту: близько половини колісної бази. "
            + "Джерело формули не подає — воно велить брати довжину з "
            + "компонувальної схеми, тому це лише відправна точка.",
        sourceRefs: length.method === "project-input"
          ? ["source.project-input"] : ["source.project-derivation"],
        limitations: length.method !== "project-input"
          ? ["Оцінка за базою — не розмір із креслення: справжню довжину дає "
            + "компонувальна схема."]
          : [],
        manuallyOverridden: length.method === "project-input"
      });
    }
    [["decision.driveshaft-reserve", "K_{\\text{зап}}", reserve, RESERVE_RANGE],
      ["decision.driveshaft-speed-margin", "k_\\omega", margin, SPEED_MARGIN_RANGE]]
      .forEach(([id, symbol, adopted, range]) => {
        if (!adopted?.defined) return;
        decisions.push({
          id,
          kind: "Decision",
          choiceRef: null,
          symbol,
          adoptedValue: adopted.value,
          canonicalUnit: null,
          method: adopted.method === "project-input" ? "project-input" : "source-midpoint",
          selectedReferenceId: null,
          recommendedValue: (range.min + range.max) / 2,
          recommendedSourceRefs: SOURCE_REFS,
          rationale: adopted.method === "project-input"
            ? `Власне значення автора. Джерело подає ${range.min}…${range.max}.`
            : `Прийнято середину діапазону ${range.min}…${range.max}.`,
          sourceRefs: adopted.method === "project-input"
            ? ["source.project-input"] : SOURCE_REFS,
          limitations: adopted.withinRange === false
            ? ["Значення лежить поза діапазоном, який подає джерело."] : [],
          manuallyOverridden: adopted.method === "project-input"
        });
      });
    if (section?.defined) {
      decisions.push({
        id: "decision.driveshaft-inner-diameter",
        kind: "Decision",
        choiceRef: null,
        symbol: "d",
        adoptedValue: section.innerMm,
        canonicalUnit: "mm",
        method: section.custom ? "project-custom-section" : section.manual ? "project-input" : "standard-series",
        selectedReferenceId: null,
        recommendedValue: section.innerMm,
        recommendedSourceRefs: section.custom ? ["source.project-derivation"] : SOURCE_REFS,
        rationale: section.custom
          ? `Наведений ряд ГОСТ не задовольняє три умови. Проєктна сітка: D=${section.customGrid.minimumOuterMm}…${section.customGrid.maximumOuterMm} мм, крок ${section.customGrid.outerStepMm} мм, t=max(${section.customGrid.minimumWallMm}, ceil(D/${section.customGrid.wallDivisor})) мм. Прийнято d=${section.innerMm}, D=${section.outerMm} мм; усі перевірки обчислено авторитетним аркушем. Це попередній позатабличний переріз.`
          : section.manual ? "Автор вибрав внутрішній діаметр із наведеного ряду. Зовнішній прийнято за критичною частотою; результати перевірок міцності й жорсткості показано без автоматичної зміни вибору."
          : "Прийнято повний переріз із ряду ГОСТ 13758-89 (таблиця 15), який проходить критичну частоту, кручення й закручування, якщо розрахунковий момент відомий.",
        sourceRefs: section.custom ? [...SOURCE_REFS, "source.project-derivation"] : section.manual ? [...SOURCE_REFS, "source.project-input"] : SOURCE_REFS,
        limitations: section.custom ? [CUSTOM_SECTION_LIMITATION] : [],
        manuallyOverridden: section.manual === true
      });
    }
    return decisions;
  }

  return Object.freeze({
    SHAFT_SERIES,
    PRELIMINARY_CUSTOM_GRID,
    CUSTOM_SECTION_LIMITATION,
    RESERVE_RANGE,
    SPEED_MARGIN_RANGE,
    TORSION_LIMITS_MPA,
    TWIST_LIMIT_DEG_PER_M,
    TWO_SHAFT_LENGTH_M,
    SHEAR_MODULUS_GPA,
    PRINTED_SHEAR_MODULUS_GPA,
    LENGTH_FROM_WHEELBASE,
    recommendLength,
    adoptLength,
    shaftCountAdvice,
    adoptRange,
    propellerShaftSpeed,
    criticalSpeed,
    requiredOuterDiameterMm,
    adoptOuterDiameter,
    recommendSection,
    designTorque,
    torsionalStress,
    twistAngle,
    buildDiameterStep,
    worksheetNotes,
    diagnosticsFor,
    decisionsFor
  });
}
