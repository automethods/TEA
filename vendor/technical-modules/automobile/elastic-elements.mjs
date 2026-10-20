"use strict";

// Розділ 22 — пружні елементи, крім листової ресори: циліндрична пружина й
// торсіон (круглий і пластинчастий).
//
// Метод із методичних вказівок, підрозділ 4.2.3, друковані с. 63—64, звірені
// з рендером сторінок при 600 dpi — саме роздільність і знадобилася, щоб
// упевнитися, що над радикалом НЕМАЄ показника.
//
// Допустимі напруги взято не з методички, а з Вахламова (с. 302—303): за
// надрукованими методичкою числами пружина виходить нездійсненною (сто
// сімдесят витків), а торсіон — удвічі товщим за справжній. Вахламов подає ті
// самі вирази, і його τ = 8P·D/(πd³) незалежно доводить, що корінь у
// методичці мусить бути кубічним.
export function createElasticElements({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
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
  // Кроки, у яких допустиму напругу взято з Вахламова, посилаються на обидві
  // книжки: вираз із методички, число — з Вахламова.
  const BOTH_SOURCE_REFS = Object.freeze([
    "source.method.course", "source.book.vakhlamov"
  ]);

  // Модуль зсуву — те саме рішення, що в розділах 11 і 14: джерело друкує
  // 85 ГПа, рахують за загальновживаними 80.
  const SHEAR_MODULUS_GPA = 80;
  const PRINTED_SHEAR_MODULUS_GPA = 85;

  // Вахламов, с. 302: [τ_ст] = 500 МПа, [τ_д] = 800 МПа. Пружину підвіски
  // рахують на ДИНАМІЧНЕ навантаження (P_пр = Z_дин), тому робочим є [τ_д].
  const SPRING_ALLOWED_SHEAR_MPA = 800;
  const SPRING_STATIC_ALLOWED_SHEAR_MPA = 500;
  const PRINTED_SPRING_ALLOWED_SHEAR_MPA = 100;
  // Вахламов, с. 303: торсіони зі сталі 50ХФА, 45ХНМА, [τ_кр] = 800…1000 МПа.
  const TORSION_ALLOWED_SHEAR_MPA = Object.freeze({ min: 800, max: 1000 });
  const PRINTED_TORSION_ALLOWED_SHEAR_MPA = Object.freeze({ min: 100, max: 250 });
  // Для ПЛАСТИНЧАСТОГО торсіона те саме джерело дозволяє 900 МПа.
  const PLATE_TORSION_LIMIT_MPA = 900;
  const DEAD_COILS = Object.freeze({ min: 1.5, max: 2.0 });
  const SPLINE_DIAMETER_FACTOR = Object.freeze({ min: 1.2, max: 1.3 });
  const TWIST_LIMIT_DEG_PER_M = 15;
  // Скільки робочих витків має справжня пружина підвіски. Межі від проєкту:
  // джерело їх не подає, а без них абсурдний результат мовчить.
  const BUILDABLE_COILS = Object.freeze({ min: 4, max: 14 });

  const midpoint = range => (range.min + range.max) / 2;
  const cbrt = value => Math.cbrt(value);

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

  // Діаметр дроту циліндричної пружини.
  //
  // Джерело друкує КВАДРАТНИЙ корінь: d = √(8P_пр·D_ср/(π[τ])). Підкореневий
  // вираз має розмірність м³ (Н·м поділити на Н/м²), і квадратний корінь дав
  // би м^1,5 — не довжину. Корінь мусить бути КУБІЧНИЙ; так само й у
  // торсіоні. Документ рахує кубічним і показує обидва числа.
  function springWireDiameter({ compressionForceN, meanDiameterM, allowedShearMpa }) {
    const force = finiteNumber(compressionForceN);
    const diameter = finiteNumber(meanDiameterM);
    const allowed = finiteNumber(allowedShearMpa);
    if ([force, diameter, allowed].some(value => value === null || value <= 0)) {
      return { defined: false, reason: "Потрібні стискуюче зусилля, середній діаметр і [τ]." };
    }
    const radicand = 8 * force * diameter / (Math.PI * allowed * 1e6);
    return {
      defined: true,
      value: cbrt(radicand),
      radicand,
      // Те, що дав би надрукований квадратний корінь — щоб читач побачив
      // різницю, а не повірив на слово.
      printedSquareRootValue: Math.sqrt(radicand),
      compressionForceN: force,
      meanDiameterM: diameter,
      allowedShearMpa: allowed
    };
  }

  // n_p = f·G·d⁴/(8P_пр·D_ср³) — число робочих витків.
  //
  // Кожен множник приходить окремим скаляром. Доти сюди передавали ВЕСЬ об'єкт
  // діаметра, а зусилля й середній діаметр читали з його полів: канонічна
  // залежність називала одне число — value.coil-spring-wire, — а формула
  // тихо брала ще два. Такий крок не відтворити з оголошених залежностей і не
  // перенести в engdoc, де входом є значення, а не об'єкт сусіднього кроку.
  function springCoils({ wireDiameterM, compressionForceN, meanDiameterM,
    totalDeflectionM, shearModulusGpa = SHEAR_MODULUS_GPA, deadCoils }) {
    const wire = finiteNumber(wireDiameterM);
    const force = finiteNumber(compressionForceN);
    const mean = finiteNumber(meanDiameterM);
    const deflection = finiteNumber(totalDeflectionM);
    const modulus = finiteNumber(shearModulusGpa);
    const dead = finiteNumber(deadCoils);
    if ([wire, force, mean].some(value => value === null || value <= 0)) {
      return { defined: false, reason: "Потрібні діаметр дроту, стискуюче зусилля й середній діаметр." };
    }
    if ([deflection, modulus, dead].some(value => value === null || value <= 0)) {
      return { defined: false, reason: "Потрібні сумарний прогин, модуль зсуву й неробочі витки." };
    }
    const working = deflection * modulus * 1e9 * wire ** 4
      / (8 * force * mean ** 3);
    if (!(working > 0) || !Number.isFinite(working)) {
      return { defined: false, reason: "Число витків не визначене." };
    }
    return {
      defined: true,
      value: working,
      workingCoils: working,
      totalCoils: working + dead,
      deadCoils: dead,
      wireDiameterM: wire,
      compressionForceN: force,
      meanDiameterM: mean,
      totalDeflectionM: deflection,
      shearModulusGpa: modulus,
      buildable: working >= BUILDABLE_COILS.min && working <= BUILDABLE_COILS.max,
      buildableRange: BUILDABLE_COILS
    };
  }

  // Круглий торсіон: d = ∛(16M_кр/(π[τ])) — той самий корінь, та сама поправка.
  function torsionDiameter({ dynamicLoadN, armM, allowedShearMpa }) {
    const load = finiteNumber(dynamicLoadN);
    const arm = finiteNumber(armM);
    const allowed = finiteNumber(allowedShearMpa);
    if ([load, arm, allowed].some(value => value === null || value <= 0)) {
      return { defined: false, reason: "Потрібні динамічне навантаження, розмах важеля і [τ]." };
    }
    const momentNm = load * arm;
    const radicand = 16 * momentNm / (Math.PI * allowed * 1e6);
    const value = cbrt(radicand);
    return {
      defined: true,
      value,
      momentNm,
      dynamicLoadN: load,
      armM: arm,
      radicand,
      printedSquareRootValue: Math.sqrt(radicand),
      allowedShearMpa: allowed,
      polarInertiaM4: Math.PI * value ** 4 / 32,
      splineMinM: SPLINE_DIAMETER_FACTOR.min * value,
      splineMaxM: SPLINE_DIAMETER_FACTOR.max * value
    };
  }

  // ψ = M_кр·l/(G·J_p)·180/π, і не більше 15° на метр довжини.
  //
  // Полярний момент інерції рахують ТУТ із діаметра: J_p = πd⁴/32. Доти його
  // читали з об'єкта сусіднього кроку разом із M_кр, якого в оголошених
  // залежностях не було зовсім.
  function torsionTwist({ diameterM, momentNm, workingLengthM,
    shearModulusGpa = SHEAR_MODULUS_GPA }) {
    const bar = finiteNumber(diameterM);
    const moment = finiteNumber(momentNm);
    const length = finiteNumber(workingLengthM);
    const modulus = finiteNumber(shearModulusGpa);
    if ([bar, moment].some(value => value === null || value <= 0)) {
      return { defined: false, reason: "Потрібні діаметр торсіона й крутний момент." };
    }
    if ([length, modulus].some(value => value === null || value <= 0)) {
      return { defined: false, reason: "Потрібні робоча довжина торсіона й модуль зсуву." };
    }
    const polarInertiaM4 = Math.PI * bar ** 4 / 32;
    const twistDeg = moment * length
      / (modulus * 1e9 * polarInertiaM4) * 180 / Math.PI;
    const perMetre = twistDeg / length;
    return {
      defined: true,
      value: twistDeg,
      perMetreDeg: perMetre,
      diameterM: bar,
      momentNm: moment,
      polarInertiaM4,
      workingLengthM: length,
      shearModulusGpa: modulus,
      withinLimit: perMetre <= TWIST_LIMIT_DEG_PER_M,
      limitDegPerM: TWIST_LIMIT_DEG_PER_M
    };
  }

  // Пластинчастий торсіон.
  //
  // Джерело друкує τ = 3M_кр(1 + 0,6h/b)/(n_п·h²·b) і поряд каже, що h та b —
  // «довжини відповідно БІЛЬШОЇ і МЕНШОЇ сторін». З таким читанням вираз
  // суперечить класичному розв'язку кручення прямокутника
  // τ = 3M(1 + 0,6t/a)/(a·t²), де a — довга сторона, t — тонка. Якщо ж
  // прочитати h як ТОНКУ сторону, а b як довгу, надрукований вираз збігається
  // з класичним ТОЧНО. Отже переплутано підпис, а не формулу.
  function plateTorsionStress({ momentNm, thicknessM, widthM, plateCount }) {
    const moment = finiteNumber(momentNm);
    const thickness = finiteNumber(thicknessM);
    const width = finiteNumber(widthM);
    const count = finiteNumber(plateCount);
    if ([moment, thickness, width, count].some(value => value === null || value <= 0)) {
      return { defined: false, reason: "Потрібні момент, товщина, ширина й кількість пластин." };
    }
    if (thickness > width) {
      return {
        defined: false,
        reason: "Товщина пластини вийшла більшою за ширину: сторони переплутано."
      };
    }
    // Як надруковано, з h = товщина (тонка сторона) і b = ширина. У такому
    // читанні вираз — це ТА САМА формула, що й класичний розв'язок кручення
    // прямокутника, переписана інакше: 3M(1 + 0,6t/a)/(n·a·t²). Не незалежна
    // перевірка, а тотожність, і саме вона показує, як треба читати підпис.
    const stressPa = 3 * moment * (1 + 0.6 * thickness / width)
      / (count * thickness ** 2 * width);
    // А це те, що вийшло б, якби читати підпис буквально: h — більша сторона.
    const byLegendPa = 3 * moment * (1 + 0.6 * width / thickness)
      / (count * width ** 2 * thickness);
    return {
      defined: true,
      value: stressPa / 1e6,
      byLegendMpa: byLegendPa / 1e6,
      // Наскільки буквальне читання підпису ЗАНИЖУЄ напругу.
      legendUnderstatesBy: (stressPa - byLegendPa) / stressPa,
      thicknessM: thickness,
      widthM: width,
      plateCount: count,
      momentNm: moment,
      withinLimit: stressPa / 1e6 <= PLATE_TORSION_LIMIT_MPA,
      limitMpa: PLATE_TORSION_LIMIT_MPA
    };
  }

  // Крива для рисунка: кут закручування на метр проти [τ].
  function twistAgainstAllowedShear({ dynamicLoadN, armM, workingLengthM,
    shearModulusGpa = SHEAR_MODULUS_GPA, from = 50, to = 900, steps = 60 }) {
    const points = [];
    for (let index = 0; index <= steps; index += 1) {
      const allowedShearMpa = from + (to - from) * index / steps;
      const diameter = torsionDiameter({ dynamicLoadN, armM, allowedShearMpa });
      if (!diameter.defined) return [];
      const twist = torsionTwist({
        diameterM: diameter.value, momentNm: diameter.momentNm,
        workingLengthM, shearModulusGpa
      });
      if (!twist.defined) return [];
      points.push({
        allowedShearMpa, twistPerMetreDeg: twist.perMetreDeg,
        diameterMm: diameter.value * 1000
      });
    }
    return points;
  }

  function buildSpringStep({ diameter, texNumber }) {
    return {
      id: "coil-spring",
      title: "Циліндрична пружина підвіски",
      purpose: "Size the wire of a coil-spring suspension.",
      output: {
        id: "value.coil-spring-wire",
        symbol: "d",
        label: "Coil spring wire diameter",
        valueType: "quantity",
        canonicalUnit: "m"
      },
      expression: "cbrt(8 P D / (pi tau))",
      dependencies: ["value.suspension-dynamic-load",
        "input.coil-spring-mean-diameter",
        "decision.coil-spring-allowed-shear"],
      equationNumber: "22.1",
      // Формула кроку — тільки його власна. Витки виведено в окремий
      // розрахунок, і лишати їх тут означало б, що траса цього кроку далі
      // змінюється від рішення, якого в його залежностях уже немає.
      formulaTex: "d=\\sqrt[3]{\\dfrac{8P_{\\text{пр}}D_{\\text{ср}}}"
        + "{\\pi\\left[\\tau\\right]}}",
      substitutionTex: `d=\\sqrt[3]{\\dfrac{8\\cdot`
        + `${texNumber(diameter.compressionForceN, 0)}\\cdot`
        + `${texNumber(diameter.meanDiameterM, 3)}}{\\pi\\cdot`
        + `${texNumber(diameter.allowedShearMpa, 0)}\\cdot10^{6}}}`
        + `=${texNumber(diameter.value, 6)}\\ \\text{м}`
        + `=${texNumber(diameter.value * 1000, 2)}\\ \\text{мм}`,
      result: { value: diameter.value, canonicalUnit: "m", displayUnit: "м" },
      method: "project-derivation",
      sourceRefs: BOTH_SOURCE_REFS,
      readerNotes: [
        "Джерело друкує КВАДРАТНИЙ корінь. Підкореневий вираз має розмірність "
        + "м³ — Н·м поділити на Н/м², — і квадратний корінь дав би м^1,5, тобто "
        + `не довжину. За надрукованим вийшло б ${texNumber(diameter.printedSquareRootValue * 1000, 1)}`
        + " мм, і це число нічого не означає. Корінь кубічний.",
        "Це не здогад за розмірністю. Вахламов (с. 302) подає ту саму пружину "
        + "через напругу: τ = 8P_пр·D_ср/(πd³). Розв'язавши щодо d, дістають "
        + "рівно кубічний корінь із того самого підкореневого виразу — отже "
        + "показник у методичці просто загубився при друці.",
        `Прийнято [τ] = ${texNumber(diameter.allowedShearMpa, 0)} МПа; основу `
        + `прийняття зазначено в рішенні. Вахламов (с. 302) подає `
        + `[τ_ст] = ${SPRING_STATIC_ALLOWED_SHEAR_MPA} МПа при `
        + `статичному навантаженні, [τ_д] = ${SPRING_ALLOWED_SHEAR_MPA} МПа при `
        + "динамічному. Пружину рахують на динамічне (P_пр = Z_дин), тому "
        + "робоче — друге.",
        `Методичка друкує ${PRINTED_SPRING_ALLOWED_SHEAR_MPA} МПа. Нижче допустиме `
        + "напруження збільшує потрібний діаметр дроту, а при сталому прогині "
        + "змінює число витків. Тут обрано іншу джерельну основу допустимого "
        + "напруження; здійсненність пружини перевіряють за її геометрією, "
        + "матеріалом і режимом роботи."
      ],
      // G у діаметр дроту не входить: воно стоїть у числі витків, і припущення
      // переїхало туди ж, куди й арифметика.
      assumptions: [],
      limitations: [
        "Відхилення від джерела: надрукований квадратний корінь замінено "
        + "кубічним — за розмірністю підкореневого виразу й за виразом "
        + "τ = 8P·D/(πd³) у Вахламова, с. 302.",
        `Відхилення від джерела: прийнято [τ] = ${texNumber(diameter.allowedShearMpa, 0)} МПа `
        + `замість ${PRINTED_SPRING_ALLOWED_SHEAR_MPA} МПа, які друкує методичка. `
        + "Походження прийнятого значення зазначено окремим рішенням."
      ]
    };
  }

  // Число витків — власний результат, а не приписка до діаметра дроту.
  //
  // Доти неробочі витки стояли залежністю кроку, чий оголошений вихід —
  // діаметр; на діаметр вони не впливають ніяк, тож карта стверджувала
  // неправду. Спроба назвати їх «побічним виходом» була гіршою за проблему:
  // канонічна модель копіює один вихід і один результат, тож поле читав лише
  // тест, який я сам і написав. Один розрахунок — один справжній вихід.
  function buildSpringCoilsStep({ coils, texNumber }) {
    return {
      id: "coil-spring-coils",
      title: "Число витків пружини",
      purpose: "Count the working and total coils the adopted deflection needs.",
      output: {
        id: "value.coil-spring-coils",
        symbol: "n_n",
        label: "Coil spring total coil count",
        // Безрозмірна кількість — float64, а не quantity без одиниці: quantity
        // в engdoc означає величину з одиницею, і null там читається як
        // пропущена одиниця, а не як її відсутність.
        valueType: "float64",
        canonicalUnit: null
      },
      expression: "n_p = f G d^4 / (8 P D^3); n_n = n_p + dead",
      // Усі п'ять множників названо. Доти стояли тільки діаметр дроту й
      // неробочі витки, а прогин, зусилля й середній діаметр входили
      // прихованими полями об'єкта діаметра.
      dependencies: ["value.coil-spring-wire", "value.suspension-total-deflection",
        "value.suspension-dynamic-load", "input.coil-spring-mean-diameter",
        "decision.coil-spring-dead-coils"],
      equationNumber: "22.1",
      formulaTex: "n_p=\\dfrac{fGd^{4}}{8P_{\\text{пр}}D_{\\text{ср}}^{3}},"
        + "\\qquad n_n=n_p+n_{\\text{непр}}",
      substitutionTex: "\\begin{aligned}n_p&=\\dfrac{"
        + `${texNumber(coils.totalDeflectionM, 5)}\\cdot${texNumber(coils.shearModulusGpa, 1)}\\cdot10^9`
        + `\\cdot${texNumber(coils.wireDiameterM, 6)}^4}{8\\cdot${texNumber(coils.compressionForceN, 2)}`
        + `\\cdot${texNumber(coils.meanDiameterM, 4)}^3}=${texNumber(coils.workingCoils, 3)}\\\\[3pt]`
        + `n_n&=${texNumber(coils.workingCoils, 3)}+${texNumber(coils.deadCoils, 2)}`
        + `=${texNumber(coils.totalCoils, 3)}\\ \\text{витків}\\end{aligned}`,
      result: { value: coils.totalCoils, canonicalUnit: null, displayUnit: "витків" },
      method: "project-derivation",
      sourceRefs: BOTH_SOURCE_REFS,
      readerNotes: [
        "Робочі витки дає прогин, неробочі додають окремо: ними пружина "
        + "спирається на чашки, і в роботі вони не беруть участі.",
        `Прийнято ${texNumber(coils.deadCoils, 1)} неробочих витка.`,
        `f = f_дин + f_ст; неробочих витків ${DEAD_COILS.min}…${DEAD_COILS.max}.`
      ],
      assumptions: [
        `Модуль зсуву G = ${SHEAR_MODULUS_GPA} ГПа: джерело друкує `
        + `${PRINTED_SHEAR_MODULUS_GPA} ГПа, проєкт рахує за загальновживаним — `
        + "те саме рішення, що в розділах 11 і 14."
      ],
      limitations: coils.buildable
        ? []
        : [`Робочих витків ${texNumber(coils.workingCoils, 1)} — поза межами `
          + `${BUILDABLE_COILS.min}…${BUILDABLE_COILS.max}, прийнятими проєктом `
          + "для перевірки компонування. Це не універсальна межа здійсненності пружини."]
    };
  }

  function buildTorsionStep({ diameter, texNumber }) {
    return {
      id: "round-torsion-bar",
      title: "Круглий торсіон",
      purpose: "Size a round torsion bar.",
      output: {
        id: "value.torsion-bar-diameter",
        symbol: "d",
        label: "Round torsion bar diameter",
        valueType: "quantity",
        canonicalUnit: "m"
      },
      expression: "cbrt(16 M / (pi tau))",
      dependencies: ["value.suspension-dynamic-load", "input.torsion-arm",
        "decision.torsion-allowed-shear"],
      equationNumber: "22.2",
      // Кут закручування виведено в окремий розрахунок разом із робочою
      // довжиною, яка його й задає: тут лишається сам діаметр.
      formulaTex: "d=\\sqrt[3]{\\dfrac{16M_{\\text{кр}}}{\\pi\\left[\\tau\\right]}},"
        + "\\qquad M_{\\text{кр}}=Z_{\\text{дин}}h_{\\theta}",
      substitutionTex: "\\begin{aligned}M_{\\text{кр}}&="
        + `${texNumber(diameter.dynamicLoadN, 2)}\\cdot${texNumber(diameter.armM, 4)}`
        + `=${texNumber(diameter.momentNm, 2)}\\ \\text{Н·м}\\\\[3pt]`
        + `d&=\\sqrt[3]{\\dfrac{16\\cdot${texNumber(diameter.momentNm, 2)}}`
        + `{\\pi\\cdot${texNumber(diameter.allowedShearMpa, 1)}\\cdot10^6}}`
        + `=${texNumber(diameter.value, 6)}\\ \\text{м}`
        + `=${texNumber(diameter.value * 1000, 2)}\\ \\text{мм}\\end{aligned}`,
      result: { value: diameter.value, canonicalUnit: "m", displayUnit: "м" },
      method: "project-derivation",
      sourceRefs: BOTH_SOURCE_REFS,
      readerNotes: [
        "Корінь тут кубічний з тієї самої причини, що й у пружині: "
        + `16M_кр/(π[τ]) має розмірність м³. За надрукованим квадратним вийшло б `
        + `${texNumber(diameter.printedSquareRootValue * 1000, 1)} мм. Вахламов `
        + "(с. 303) подає τ = 16M_кр/(πd³) — той самий вираз, розв'язаний щодо "
        + "напруги, і кубічний корінь випливає з нього прямо.",
        `Прийнято [τ] = ${texNumber(diameter.allowedShearMpa, 0)} МПа; основу `
        + "прийняття зазначено в рішенні. Вахламов (с. 303) описує "
        + "торсіони зі сталі 50ХФА, 45ХНМА, для яких "
        + `[τ_кр] = ${TORSION_ALLOWED_SHEAR_MPA.min}…${TORSION_ALLOWED_SHEAR_MPA.max} МПа. `
        + `Методичка друкує ${PRINTED_TORSION_ALLOWED_SHEAR_MPA.min}…`
        + `${PRINTED_TORSION_ALLOWED_SHEAR_MPA.max} МПа. Це різні основи вибору; `
        + "прийняте напруження потрібно узгодити з конкретними матеріалом, "
        + "термообробкою й режимом навантаження.",
        `Шліцьові кінці d_ш = (${SPLINE_DIAMETER_FACTOR.min}…`
        + `${SPLINE_DIAMETER_FACTOR.max})d = ${texNumber(diameter.splineMinM * 1000, 1)}…`
        + `${texNumber(diameter.splineMaxM * 1000, 1)} мм, і джерело велить брати `
        + "їх РІЗНИМИ: d_ш1 ≠ d_ш2, щоб торсіон не можна було поставити "
        + "поверненим не тим кінцем."
      ],
      // G входить у кут, не в діаметр.
      assumptions: [],
      limitations: [
        "Відхилення від джерела: надрукований квадратний корінь замінено "
        + "кубічним — за розмірністю й за виразом τ = 16M/(πd³) у Вахламова, "
        + "с. 303.",
        `Джерельні основи різні: Вахламов подає ${TORSION_ALLOWED_SHEAR_MPA.min}…`
        + `${TORSION_ALLOWED_SHEAR_MPA.max} МПа, методичка — `
        + `${PRINTED_TORSION_ALLOWED_SHEAR_MPA.min}…`
        + `${PRINTED_TORSION_ALLOWED_SHEAR_MPA.max} МПа. Прийняте значення `
        + `${texNumber(diameter.allowedShearMpa, 0)} МПа має окреме рішення.`
      ]
    };
  }

  // Кут закручування — власний результат. Робоча довжина входить у нього
  // (M ℓ/(G J_p)) і не входить у діаметр, до якого її було приписано.
  function buildTorsionTwistStep({ twist, texNumber }) {
    return {
      id: "torsion-bar-twist",
      title: "Кут закручування торсіона",
      purpose: "Check the twist the adopted working length allows.",
      output: {
        id: "value.torsion-bar-twist",
        symbol: "\\varphi",
        label: "Torsion bar twist angle",
        valueType: "quantity",
        canonicalUnit: "deg"
      },
      expression: "M l / (G Jp) * 180 / pi",
      // M_кр = Z_дин·h_θ, і обидва множники названо: доти момент приходив
      // прихованим полем об'єкта діаметра.
      dependencies: ["value.torsion-bar-diameter", "value.suspension-dynamic-load",
        "input.torsion-arm", "decision.torsion-working-length"],
      equationNumber: "22.2",
      formulaTex: "\\varphi=\\dfrac{M_{\\text{кр}}\\ell}{GJ_p}\\cdot"
        + "\\dfrac{180}{\\pi}",
      substitutionTex: "\\begin{aligned}\\varphi&=\\dfrac{"
        + `${texNumber(twist.momentNm, 2)}\\cdot${texNumber(twist.workingLengthM, 4)}}`
        + `{${texNumber(twist.shearModulusGpa, 1)}\\cdot10^9\\cdot`
        + `(\\pi\\cdot${texNumber(twist.diameterM, 6)}^4/32)}\\cdot\\dfrac{180}{\\pi}`
        + `=${texNumber(twist.value, 3)}^{\\circ}\\\\[3pt]`
        + `\\varphi/\\ell&=\\dfrac{${texNumber(twist.value, 3)}}{${texNumber(twist.workingLengthM, 4)}}`
        + `=${texNumber(twist.perMetreDeg, 3)}\\ \\text{°/м}\\end{aligned}`,
      result: { value: twist.value, canonicalUnit: "deg", displayUnit: "град" },
      method: "project-derivation",
      sourceRefs: BOTH_SOURCE_REFS,
      readerNotes: [
        "Кут закручування росте прямо з робочою довжиною: довший торсіон за той "
        + "самий момент закручується більше, і саме цим його й підбирають.",
        `Методичка наводить межу ${TWIST_LIMIT_DEG_PER_M}°/м. Після вибору `
        + `іншої основи допустимого напруження отримано ${texNumber(twist.perMetreDeg, 1)}°/м. `
        + "У цьому варіанті перевірку за друкованою межею не застосовано. "
        + "Це не доводить допустимості кута: потрібна перевірка робочої "
        + "деформації, матеріалу та довговічності конкретного торсіона."
      ],
      assumptions: [
        `Модуль зсуву G = ${SHEAR_MODULUS_GPA} ГПа замість друкованих `
        + `${PRINTED_SHEAR_MODULUS_GPA}.`
      ],
      limitations: [
        `Перевірку за джерельною межею ${TWIST_LIMIT_DEG_PER_M}°/м тут не `
        + "застосовано. Допустимість розрахованого кута окремо не підтверджено."
      ]
    };
  }

  function buildPlateStep({ plate, texNumber }) {
    return {
      id: "plate-torsion-bar",
      title: "Пластинчастий торсіон",
      purpose: "Check the stress in a laminated torsion bar against the printed limit.",
      output: {
        id: "value.plate-torsion-stress",
        symbol: "\\tau",
        label: "Plate torsion bar stress",
        valueType: "quantity",
        canonicalUnit: "MPa"
      },
      expression: "3 M (1 + 0.6 h/b) / (n h^2 b)",
      // Той самий момент, що й у круглого торсіона, плюс розміри пакета, які
      // задає автор. Доти крок називав залежністю діаметр круглого прутка —
      // число, якого в його формулі немає зовсім.
      dependencies: ["value.suspension-dynamic-load", "input.torsion-arm",
        "input.plate-torsion-thickness", "input.plate-torsion-width",
        "input.plate-torsion-count"],
      equationNumber: "22.3",
      formulaTex: "\\tau=3M_{\\text{кр}}\\dfrac{1+0{,}6h/b}"
        + "{n_{\\text{п}}h^{2}b}",
      substitutionTex: `\\tau=\\dfrac{3\\cdot${texNumber(plate.momentNm, 0)}\\cdot10^3`
        + `\\left(1+0{,}6\\cdot\\dfrac{${texNumber(plate.thicknessM * 1000, 1)}}`
        + `{${texNumber(plate.widthM * 1000, 1)}}\\right)}`
        + `{${plate.plateCount}\\cdot${texNumber(plate.thicknessM * 1000, 1)}^{2}`
        + `\\cdot${texNumber(plate.widthM * 1000, 1)}}`
        + `=${texNumber(plate.value, 0)}\\ \\text{МПа}`,
      result: { value: plate.value, canonicalUnit: "MPa", displayUnit: "МПа" },
      method: "sourced-formula",
      sourceRefs: BOTH_SOURCE_REFS,
      readerNotes: [
        "Джерело підписує h та b як «довжини відповідно БІЛЬШОЇ і МЕНШОЇ "
        + "сторін». Прочитаний навпаки — h як ТОНКА сторона, b як широка — "
        + "надрукований вираз тотожний класичному розв'язку кручення "
        + "прямокутника τ = 3M(1 + 0,6t/a)/(n·a·t²): це та сама формула, "
        + "переписана інакше. Отже переплутано підпис, а не формулу, і тут її "
        + "читають так, як вона написана.",
        "Вахламов (с. 303, рис. 10.30, в) позначає b як ширину пластини, "
        + "h як товщину. Це підтверджує прийняте читання розмірів. Його "
        + "формула має той самий знаменник n·h²·b, проте інший поправковий "
        + "множник, зазначений нижче.",
        "Поправковий множник у двох книжках різний: методичка друкує "
        + "(1 + 0,6h/b) — це класичний розв'язок Сен-Венана, — а Вахламов "
        + "(1 + h/b), тобто з запасом. Тут узято класичний, як у методички.",
        "Ціна буквального читання підпису: напруга вийшла б "
        + `${texNumber(plate.byLegendMpa, 0)} МПа замість `
        + `${texNumber(plate.value, 0)} МПа — на `
        + `${texNumber(plate.legendUnderstatesBy * 100, 0)} % менше. Торсіон `
        + "здавався б міцнішим, ніж він є, і саме в той бік, у який помилятися "
        + "не можна.",
        `Обчислені напруги не повинні перевищувати ${PLATE_TORSION_LIMIT_MPA} МПа.`,
        `Для круглого торсіона прийнято ${TORSION_ALLOWED_SHEAR_MPA.min}…`
        + `${TORSION_ALLOWED_SHEAR_MPA.max} МПа, для пластинчастого — `
        + `${PLATE_TORSION_LIMIT_MPA} МПа. Порівняння цих величин не замінює `
        + "вибору матеріалу й перевірки деформацій обох конструкцій."
      ],
      assumptions: [
        "h прочитано як товщину пластини, b — як ширину: інакше вираз не "
        + "збігається ні з класичним розв'язком, ні з Вахламовим."
      ],
      limitations: plate.withinLimit
        ? []
        : [`Напруга ${plate.value.toFixed(0)} МПа перевищує `
          + `${PLATE_TORSION_LIMIT_MPA} МПа.`]
    };
  }

  function decisionsFor({ springShear, torsionShear, deadCoils, torsionLength }) {
    const decisions = [];
    [["decision.coil-spring-allowed-shear", "\\left[\\tau\\right]_{\\text{пр}}",
      springShear, { min: SPRING_ALLOWED_SHEAR_MPA, max: SPRING_ALLOWED_SHEAR_MPA },
      "MPa"],
      ["decision.torsion-allowed-shear", "\\left[\\tau\\right]_{\\text{т}}",
        torsionShear, TORSION_ALLOWED_SHEAR_MPA, "MPa"],
      ["decision.coil-spring-dead-coils", "n_n-n_p", deadCoils, DEAD_COILS, null],
      ["decision.torsion-working-length", "l", torsionLength, null, "m"]]
      .forEach(([id, symbol, adopted, range, unit]) => {
        if (!adopted?.defined) return;
        decisions.push({
          id,
          kind: "Decision",
          choiceRef: null,
          symbol,
          adoptedValue: adopted.value,
          canonicalUnit: unit,
          method: adopted.method === "class-design-assumption" ? "class-design-assumption"
            : adopted.method === "project-input" ? "project-input" : "source-midpoint",
          selectedReferenceId: null,
          recommendedValue: range ? midpoint(range) : null,
          recommendedSourceRefs: SOURCE_REFS,
          rationale: adopted.rationale || (adopted.method === "project-input"
            ? (range
              ? `Власне значення автора. Джерело подає ${range.min}…${range.max}.`
              : "Робочу довжину торсіона джерело велить брати з конструктивних "
                + "міркувань і формули не подає.")
            : `Прийнято середину діапазону ${range.min}…${range.max}.`),
          sourceRefs: adopted.sourceRefs || (adopted.method === "project-input"
            ? ["source.project-input"] : SOURCE_REFS),
          limitations: [...(adopted.limitations || []), ...(adopted.withinRange === false
            ? ["Значення лежить поза діапазоном джерела."] : [])],
          manuallyOverridden: adopted.manuallyOverridden ?? (adopted.method === "project-input")
        });
      });
    return decisions;
  }

  function diagnosticsFor({ coils, twist, plate }) {
    const out = [];
    if (coils?.defined && !coils.buildable) {
      out.push({
        code: "COIL_SPRING_NOT_BUILDABLE",
        severity: "warning",
        message: `Робочих витків вийшло ${coils.workingCoils.toFixed(1)}; це поза `
          + `проєктним орієнтиром ${coils.buildableRange.min}…`
          + `${coils.buildableRange.max}. Перевірте потрібний прогин, діаметри, `
          + "розміщення пружини й основу допустимого напруження. Підвищувати "
          + "допустиме напруження лише заради бажаного числа витків не можна.",
        details: { node: "calc.coil-spring-coils" }
      });
    }
    if (twist?.defined && !twist.withinLimit) {
      out.push({
        code: "TORSION_TWIST_ABOVE_PRINTED_LIMIT",
        // Не дефект, а наслідок свідомого вибору: пруток розміряно за
        // допустимою напругою справжньої торсіонної сталі, і межа методички
        // разом із її ж низьким [τ] тут не діє.
        severity: "info",
        message: `Торсіон закручується на ${twist.perMetreDeg.toFixed(1)}° на метр, `
          + `що перевищує друковані ${TWIST_LIMIT_DEG_PER_M}°/м. У цьому `
          + "варіанті прийнято іншу основу допустимого напруження, а перевірку "
          + "за цією межею не застосовано. Допустимість робочого кута "
          + "та довговічність потрібно підтвердити окремо.",
        details: { node: "calc.torsion-bar-twist" }
      });
    }
    if (plate?.defined && !plate.withinLimit) {
      out.push({
        code: "PLATE_TORSION_STRESS_ABOVE_LIMIT",
        severity: "warning",
        message: `Напруга в пластинчастому торсіоні ${plate.value.toFixed(0)} МПа `
          + `перевищує ${PLATE_TORSION_LIMIT_MPA} МПа.`,
        details: { node: "calc.plate-torsion-bar" }
      });
    }
    return out;
  }

  return Object.freeze({
    SOURCE_REFS,
    SHEAR_MODULUS_GPA,
    PRINTED_SHEAR_MODULUS_GPA,
    SPRING_ALLOWED_SHEAR_MPA,
    SPRING_STATIC_ALLOWED_SHEAR_MPA,
    PRINTED_SPRING_ALLOWED_SHEAR_MPA,
    TORSION_ALLOWED_SHEAR_MPA,
    PRINTED_TORSION_ALLOWED_SHEAR_MPA,
    PLATE_TORSION_LIMIT_MPA,
    DEAD_COILS,
    SPLINE_DIAMETER_FACTOR,
    TWIST_LIMIT_DEG_PER_M,
    BUILDABLE_COILS,
    midpoint,
    adoptRange,
    springWireDiameter,
    springCoils,
    torsionDiameter,
    torsionTwist,
    plateTorsionStress,
    twistAgainstAllowedShear,
    buildSpringStep,
    buildSpringCoilsStep,
    buildTorsionTwistStep,
    buildTorsionStep,
    buildPlateStep,
    decisionsFor,
    diagnosticsFor
  });
}
