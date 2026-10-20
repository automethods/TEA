"use strict";

// Розділ 12 — головна передача.
//
// Метод із методичних вказівок, підрозділ 4.1.4, друковані с. 49—52, звірені з
// рендером сторінок. Таблицю 12 (коефіцієнт форми зуба) джерело використовує ту
// саму, що й у розділі 10, тому вона тут не дублюється, а береться звідти.
//
// Знак у контактних напругах: тут книжка друкує ПЛЮС, а в розділі 10 для
// циліндричної пари — мінус. Обидва місця рахують надруковане й називають
// розбіжність (див. Data/Vehicle/docs/finaldrive_sources.md).
export function createFinalDrive({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;

  const scope = typeof window === "object" ? window : globalThis;

  function shared(name, file) {
    if (!scope[name] && typeof window !== "object" && typeof require === "function"
      && typeof module === "object" && module.exports) require(file);
    return scope[name];
  }
  const { finiteNumber } = shared("VehicleNumeric", "./numeric.js");
  // Таблиця 12 — одна на розділи 10 і 12: джерело посилається на неї обидва рази.
  function toothForm() {
    return shared("VehicleGearboxGears", "./gearbox-gears.js");
  }

  const SOURCE_REFS = Object.freeze(["source.method.course"]);
  const BOTH_SOURCE_REFS = Object.freeze([
    "source.method.course", "source.book.vakhlamov"
  ]);

  // Вахламов, с. 178: «Передаточные числа одинарных конических и гипоидных
  // передач обычно выбираются в следующих пределах: 3,5…4,5 для легковых
  // автомобилей и 5…7 для грузовых».
  //
  // Це не межа розрахунку, а перевірка правдоподібності. Саме передаточне
  // число головної передачі — не самостійне рішення: воно те, що лишається
  // після прийнятої вищої передачі коробки. Тому вихід за цей діапазон каже
  // не «виправте головну передачу», а «перевірте максимальну швидкість,
  // номінальні оберти й прийняту вищу передачу»: щось із них дає незвичну
  // для цього класу сумарну редукцію.
  const USUAL_RATIO = Object.freeze({
    passenger: { min: 3.5, max: 4.5 },
    goods: { min: 5, max: 7 }
  });
  const PINION_TEETH = Object.freeze({ min: 5, max: 11 });
  const BEVEL_RATIO_DOUBLE = 1.7;
  const SPIRAL_ANGLE = Object.freeze({ min: 30, max: 45 });
  const HYPOID_DRIVING_ANGLE = Object.freeze({ min: 45, max: 50 });
  const HYPOID_DRIVEN_ANGLE = Object.freeze({
    light: { min: 20, max: 25 },
    heavy: { min: 30, max: 35 }
  });
  // Вахламов, с. 177: у ГІПОЇДНОЇ передачі кути спіралі різні — β₁ = 40…50°
  // у ведучої шестерні, β₂ = 20…30° у веденої, — і їх відношення
  // k = cosβ₂/cosβ₁ не повинно перевищувати 1,2…1,5 (більші значення для
  // легкових, менші для вантажних). Саме це k і робить гіпоїдну передачу
  // міцнішою за конічну: u_г = k·D₀/d₀, тобто ведуча шестерня в k разів
  // більша, ніж дала б конічна геометрія при тому самому передаточному
  // числі, а більший діаметр — це менша окружна сила на зубі.
  const HYPOID_DIAMETER_RATIO = Object.freeze({ min: 1.2, max: 1.5 });
  const CONE_LENGTH_MM = Object.freeze({ min: 90, max: 150 });
  const BENDING_STRESS_MPA = Object.freeze({ min: 420, max: 550 });
  // Вахламов, с. 181: [σ_к] = 1000…1200 МПа, більші значення — для гіпоїдних
  // головних передач; шестерні роблять зі сталей 15ХН3А, 20ХН3А, 20ХНМА,
  // 30ХГТ. Методичка друкує саму лише нижню межу.
  const CONTACT_LIMITS_MPA = Object.freeze({ bevel: 1000, hypoid: 1200 });
  const CONTACT_LIMIT_MPA = CONTACT_LIMITS_MPA.hypoid;
  const CONTACT_COEFFICIENT = 0.418;
  const YOUNG_MODULUS_MPA = 210000;
  const PRESSURE_ANGLE_DEG = 20;
  // b = L/3 — «найчастіше», як пише джерело.
  const TOOTH_LENGTH_SHARE = 1 / 3;

  const radians = degrees => degrees * Math.PI / 180;
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
    return {
      defined: true, value: (range.min + range.max) / 2,
      method: "source-midpoint", range, withinRange: true
    };
  }

  // Одинарна передача — сама конічна пара. Подвійна ділить передаточне число
  // між конічною парою (1,7) і циліндричною.
  function splitRatio({ totalRatio, kind }) {
    const total = finiteNumber(totalRatio);
    if (total === null || total <= 0) {
      return { defined: false, reason: "Передаточне число головної передачі не відоме." };
    }
    if (kind === "single") {
      return { defined: true, kind, bevelRatio: total, cylindricalRatio: null, totalRatio: total };
    }
    if (kind !== "double") {
      return { defined: false, reason: "Тип головної передачі не вибрано." };
    }
    return {
      defined: true,
      kind,
      bevelRatio: BEVEL_RATIO_DOUBLE,
      cylindricalRatio: total / BEVEL_RATIO_DOUBLE,
      totalRatio: total
    };
  }

  // Z₂ = u_кон·Z₁, і зубів не буває дробових.
  function bevelTeeth({ pinionTeeth, bevelRatio, rounding = "nearest" }) {
    const pinion = finiteNumber(pinionTeeth);
    const ratio = finiteNumber(bevelRatio);
    if (pinion === null) {
      return { defined: false, reason: "Не задано кількість зубів ведучої шестерні головної передачі Z₁ (§12.2). Прийміть початкове число зубів або введіть власне додатне ціле число." };
    }
    if (!Number.isInteger(pinion)) {
      return { defined: false, reason: `Кількість зубів ведучої шестерні головної передачі Z₁ = ${pinion}: зубів не буває дробових. Введіть додатне ціле число (§12.2).` };
    }
    if (pinion <= 0) {
      return { defined: false, reason: `Кількість зубів ведучої шестерні головної передачі Z₁ = ${pinion} має бути додатною (§12.2).` };
    }
    if (ratio === null || ratio <= 0) {
      return { defined: false, reason: "Передаточне число конічної пари не відоме." };
    }
    const driven = rounding === "not-above-required"
      ? Math.floor(ratio * pinion + 1e-9) : Math.round(ratio * pinion);
    if (driven < 1) return { defined: false, reason: "Прийняте передаточне число дає менше одного зуба веденої шестерні." };
    return {
      defined: true,
      drivingTeeth: pinion,
      drivenTeeth: driven,
      actualRatio: driven / pinion,
      withinRange: pinion >= PINION_TEETH.min && pinion <= PINION_TEETH.max,
      // δ = arctg(Z₁/Z₂) — половина кута при вершині первісного конуса.
      pitchConeHalfAngleDeg: Math.atan(pinion / driven) * 180 / Math.PI
    };
  }

  function cylindricalTeeth({ drivingTeeth, cylindricalRatio, rounding = "nearest" }) {
    const driving = finiteNumber(drivingTeeth);
    const ratio = finiteNumber(cylindricalRatio);
    if (driving === null || !Number.isInteger(driving) || driving <= 0) {
      return { defined: false, reason: "Кількість зубів Z₃ має бути цілою." };
    }
    if (ratio === null || ratio <= 0) {
      return { defined: false, reason: "Передаточне число циліндричної пари не відоме." };
    }
    const driven = rounding === "not-above-required"
      ? Math.floor(ratio * driving + 1e-9) : Math.round(ratio * driving);
    if (driven < 1) return { defined: false, reason: "Прийняте передаточне число дає менше одного зуба Z₄." };
    return {
      defined: true, drivingTeeth: driving, drivenTeeth: driven,
      actualRatio: driven / driving
    };
  }

  // Resolve integer gearing once, before any vehicle-performance calculation.
  // The component chapter consumes the same resolution using the required ratio.
  function adoptedRatio({ totalRatio, kind, pinionTeeth, adoptionPolicy = "not-above-required" }) {
    const split = splitRatio({ totalRatio, kind });
    const teeth = split.defined ? bevelTeeth({ pinionTeeth, bevelRatio: split.bevelRatio,
      rounding: kind === "single" ? adoptionPolicy : "nearest" })
      : { defined: false, reason: split.reason };
    const cylindrical = split.defined && teeth.defined && kind === "double"
      ? cylindricalTeeth({ drivingTeeth: 15, cylindricalRatio: split.totalRatio / teeth.actualRatio,
        rounding: adoptionPolicy })
      : { defined: false };
    if (!split.defined || !teeth.defined || (kind === "double" && !cylindrical.defined)) {
      return { defined: false, reason: split.reason || teeth.reason || cylindrical.reason,
        requiredRatio: finiteNumber(totalRatio), requiredValue: finiteNumber(totalRatio), split, teeth, cylindrical };
    }
    const value = teeth.actualRatio * (kind === "double" ? cylindrical.actualRatio : 1);
    return { defined: true, value, actualRatio: value, requiredRatio: split.totalRatio,
      requiredValue: split.totalRatio, errorPercent: (value / split.totalRatio - 1) * 100,
      adoptionPolicy, split, teeth, cylindrical,
      actualStages: [{stage:"bevel",drivingTeeth:teeth.drivingTeeth,drivenTeeth:teeth.drivenTeeth,ratio:teeth.actualRatio},
        ...(kind === "double" ? [{stage:"cylindrical",drivingTeeth:cylindrical.drivingTeeth,
          drivenTeeth:cylindrical.drivenTeeth,ratio:cylindrical.actualRatio}] : [])] };
  }

  // Z_пр = Z₁/(cos³β₁·cos δ)
  // Кути спіралі за видом передачі та вагою автомобіля.
  // Чи лежить передаточне число головної передачі там, де воно зазвичай
  // лежить у автомобіля цього класу.
  function ratioPlausibility({ totalRatio, vehicleType, category = null, kind = "single" }) {
    const ratio = finiteNumber(totalRatio);
    if (ratio === null || ratio <= 0) {
      return { checked: false, reason: "Передаточного числа ще немає." };
    }
    // The cited historical bands describe a single bevel/hypoid final drive
    // in passenger cars and goods vehicles. They do not define bus gearing,
    // nor the total ratio of a two-stage drive.
    if (kind !== "single" || ["M2", "M3"].includes(category)) {
      return { checked: false, reason: kind !== "single"
        ? "Довідковий діапазон одинарної головної передачі не застосовують до суми двох ступенів."
        : "Наведене джерело не задає окремого діапазону передаточних чисел для автобусів; перевіряють швидкість, тягу й міцність прийнятого ланцюга." };
    }
    const resolvedType = category === "M1" ? "passenger"
      : /^N[123]$/.test(category || "") ? "goods" : vehicleType;
    if (!["goods", "passenger"].includes(resolvedType)) {
      return { checked: false, reason: "Тип автомобіля для порівняння з довідковим діапазоном не визначено." };
    }
    const band = resolvedType === "goods" ? USUAL_RATIO.goods : USUAL_RATIO.passenger;
    return {
      checked: true,
      value: ratio,
      band,
      vehicleType: resolvedType,
      usual: ratio >= band.min && ratio <= band.max,
      above: ratio > band.max,
      below: ratio < band.min
    };
  }

  function spiralAngles({ gearType, heavy = false }) {
    if (gearType === "hypoid") {
      // Вахламов, с. 177: k = cosβ₂/cosβ₁ ≤ 1,2…1,5, і «більші значення
      // указанного отношения — для главных передач легковых автомобилей, а
      // меньшие — для грузовых». Отже кути беруть не серединою діапазонів, а
      // так, щоб k ліг у потрібний кінець: легковим — більший, вантажним —
      // менший. Це і є те, що джерело велить.
      const drivenBand = heavy ? HYPOID_DRIVEN_ANGLE.heavy : HYPOID_DRIVEN_ANGLE.light;
      // β₁ угорі свого діапазону для легкових і внизу для вантажних — це і дає
      // «більший k легковим, менший вантажним». β₂ беруть НАЙМЕНШИЙ зі свого
      // діапазону: менший кут веденої шестерні — більший cos β₂, отже більший
      // k, а вантажним його й так уріже власний діапазон β₂ (30…35° проти
      // 20…25° у легкових).
      const driving = heavy ? HYPOID_DRIVING_ANGLE.min : HYPOID_DRIVING_ANGLE.max;
      const driven = drivenBand.min;
      const ratio = Math.cos(radians(driven)) / Math.cos(radians(driving));
      return {
        defined: true,
        gearType,
        drivingDeg: driving,
        drivenDeg: driven,
        diameterRatio: ratio,
        withinRatioLimit: ratio >= HYPOID_DIAMETER_RATIO.min
          && ratio <= HYPOID_DIAMETER_RATIO.max,
        ratioLimit: HYPOID_DIAMETER_RATIO,
        contactLimitMpa: CONTACT_LIMITS_MPA.hypoid
      };
    }
    if (gearType !== "bevel") {
      return { defined: false, reason: "Вид головної передачі не вибрано." };
    }
    // Конічна: кути обох шестерень однакові, а шестерня не збільшена.
    const angle = midpoint(SPIRAL_ANGLE);
    return {
      defined: true,
      gearType,
      drivingDeg: angle,
      drivenDeg: angle,
      diameterRatio: 1,
      withinRatioLimit: true,
      ratioLimit: null,
      contactLimitMpa: CONTACT_LIMITS_MPA.bevel
    };
  }

  function equivalentTeeth({ pinionTeeth, spiralAngleDeg, coneHalfAngleDeg }) {
    const teeth = finiteNumber(pinionTeeth);
    const beta = finiteNumber(spiralAngleDeg);
    const delta = finiteNumber(coneHalfAngleDeg);
    if (teeth === null || beta === null || delta === null) {
      return { defined: false, reason: "Потрібні зуби, кут спіралі й кут конуса." };
    }
    const value = teeth / (Math.cos(radians(beta)) ** 3 * Math.cos(radians(delta)));
    return { defined: true, value };
  }

  // mₙ = √[6·M·cos β₁/(π·y·Z₁·L·(1−λ³)·σ)]
  function toothModuleMm({ designTorqueNm, spiralAngleDeg, formFactor, pinionTeeth,
    coneLengthMm, toothLengthMm, allowableStressMpa }) {
    const values = {
      designTorqueNm: finiteNumber(designTorqueNm),
      spiralAngleDeg: finiteNumber(spiralAngleDeg),
      formFactor: finiteNumber(formFactor),
      pinionTeeth: finiteNumber(pinionTeeth),
      coneLengthMm: finiteNumber(coneLengthMm),
      toothLengthMm: finiteNumber(toothLengthMm),
      allowableStressMpa: finiteNumber(allowableStressMpa)
    };
    const missing = Object.entries(values).find(([, value]) => value === null || value <= 0);
    if (missing) {
      return { defined: false, reason: `Для модуля бракує величини: ${missing[0]}.` };
    }
    // Зуб лежить на твірній конуса, тому не може бути довшим за неї. Перевірити
    // це треба ПРЯМО: λ = 1 − b/L стає від'ємним, а куб від'ємного числа малий
    // за модулем, тож умова (1 − λ³) > 0 такий випадок пропускає.
    if (!(values.toothLengthMm < values.coneLengthMm)) {
      return {
        defined: false,
        reason: `Довжина зуба ${values.toothLengthMm} мм не менша за довжину `
          + `твірної конуса ${values.coneLengthMm} мм: зуб лежить на твірній і `
          + "довшим за неї бути не може."
      };
    }
    const lambda = 1 - values.toothLengthMm / values.coneLengthMm;
    const shapeFactor = 1 - lambda ** 3;
    if (!(shapeFactor > 0)) {
      return { defined: false, reason: "Множник (1 − λ³) вийшов недодатним." };
    }
    // Момент у Н·м → Н·мм; напруга в МПа = Н/мм².
    const value = Math.sqrt(
      6 * values.designTorqueNm * 1000 * Math.cos(radians(values.spiralAngleDeg))
      / (Math.PI * values.formFactor * values.pinionTeeth * values.coneLengthMm
        * shapeFactor * values.allowableStressMpa));
    return { defined: true, value, lambda, shapeFactor };
  }

  // Середній радіус первісного конуса: r_ср = r_осн − (b/2)·sin δ.
  function meanConeRadiusMm({ baseRadiusMm, faceWidthMm, coneHalfAngleDeg }) {
    const base = finiteNumber(baseRadiusMm);
    const width = finiteNumber(faceWidthMm);
    const delta = finiteNumber(coneHalfAngleDeg);
    if (base === null || width === null || delta === null) return null;
    return base - width / 2 * Math.sin(radians(delta));
  }

  // Explicit verification of the existing bending sizing relation, for both
  // members. This is the same preliminary equivalent-cone method, inverted for
  // stress; it is not a separate ISO tooth-root rating.
  function bendingStress({ designTorqueNm, moduleMm, drivingTeeth, drivenTeeth,
    spiralAngleDeg, drivenSpiralAngleDeg = spiralAngleDeg, formFactor,
    drivenFormFactor, coneLengthMm, toothLengthMm, allowableStressMpa }) {
    const module_ = finiteNumber(moduleMm);
    const limit = finiteNumber(allowableStressMpa);
    if (!(module_ > 0) || !(limit > 0) || !(drivingTeeth > 0) || !(drivenTeeth > 0)) {
      return { defined: false, reason: "Для перевірки згину потрібні додатні модуль, зуби та допустима напруга." };
    }
    const member = (torque, teeth, angle, factor) => {
      const required = toothModuleMm({ designTorqueNm: torque, spiralAngleDeg: angle,
        formFactor: factor, pinionTeeth: teeth, coneLengthMm, toothLengthMm,
        allowableStressMpa: limit });
      if (!required.defined) return required;
      const value = limit * (required.value / module_) ** 2;
      return { defined: true, value, limitMpa: limit, withinLimit: value <= limit * (1 + 1e-10),
        safetyFactor: limit / value, requiredModuleMm: required.value, torqueNm: torque,
        formFactor: factor, teeth, spiralAngleDeg: angle,
        coneLengthMm: finiteNumber(coneLengthMm), toothLengthMm: finiteNumber(toothLengthMm),
        lambda: required.lambda };
    };
    const driving = member(designTorqueNm, drivingTeeth, spiralAngleDeg, formFactor);
    const driven = member(designTorqueNm * drivenTeeth / drivingTeeth, drivenTeeth,
      drivenSpiralAngleDeg, drivenFormFactor);
    if (!driving.defined || !driven.defined) return { defined: false, driving, driven,
      reason: driving.reason || driven.reason || "Згин одного з коліс не перевірено." };
    const governingMember = driving.value >= driven.value ? "driving" : "driven";
    const value = Math.max(driving.value, driven.value);
    return { defined: true, value, limitMpa: limit, withinLimit: driving.withinLimit && driven.withinLimit,
      safetyFactor: limit / value, driving, driven, governingMember,
      method: "preliminary-equivalent-cone", moduleMm: module_, coneLengthMm, toothLengthMm };
  }

  // σ_ст = 0,418√[P·E/(b₀ sinα cosα)·(1/r_e1 + 1/r_e2)] — ПЛЮС, як надруковано тут.
  function contactStress({ designTorqueNm, moduleMm, drivingTeeth, drivenTeeth,
    spiralAngleDeg, coneHalfAngleDeg, toothLengthMm,
    // Гіпоїдна передача: кут спіралі веденої шестерні свій, а ведуча більша
    // за конічну в k = cosβ₂/cosβ₁ разів. Без цих двох величин вираз рахує
    // конічну пару — так, як і рахував досі.
    drivenSpiralAngleDeg, pinionDiameterRatio = 1, gearType, contactLimitMpa }) {
    const module_ = finiteNumber(moduleMm);
    const torque = finiteNumber(designTorqueNm);
    const beta = finiteNumber(spiralAngleDeg);
    const delta1 = finiteNumber(coneHalfAngleDeg);
    const width = finiteNumber(toothLengthMm);
    const z1 = finiteNumber(drivingTeeth);
    const z2 = finiteNumber(drivenTeeth);
    if ([module_, torque, beta, delta1, width, z1, z2].some(value => value === null)
      || module_ <= 0 || torque <= 0 || z1 <= 0 || z2 <= 0 || width <= 0
      || beta < 0 || beta >= 90 || delta1 <= 0 || delta1 >= 90) {
      return { defined: false, reason: "Для контактних напруг бракує величин." };
    }
    // Другий конус доповнює перший до прямого кута.
    const delta2 = 90 - delta1;
    const scale = finiteNumber(pinionDiameterRatio) ?? 1;
    // Ведуча шестерня гіпоїдної передачі більша: d₀ = k·D₀/u_г (Вахламов,
    // с. 177). Саме через це вона й міцніша за конічну.
    const baseRadius1 = module_ * z1 / 2 * scale;
    const baseRadius2 = module_ * z2 / 2;
    const beta2 = finiteNumber(drivenSpiralAngleDeg) ?? beta;
    if (!(scale > 0) || beta2 < 0 || beta2 >= 90) {
      return { defined: false, reason: "Коефіцієнт діаметра та кути спіралі поза областю геометричної моделі." };
    }
    const r1 = meanConeRadiusMm({ baseRadiusMm: baseRadius1, faceWidthMm: width,
      coneHalfAngleDeg: delta1 });
    const r2 = meanConeRadiusMm({ baseRadiusMm: baseRadius2, faceWidthMm: width,
      coneHalfAngleDeg: delta2 });
    if (!(r1 > 0) || !(r2 > 0)) {
      return {
        defined: false,
        reason: "Середній радіус конуса вийшов недодатним: зуб задовгий для цього "
          + "діаметра. Зменшіть довжину зуба або збільшіть модуль."
      };
    }
    const alpha = radians(PRESSURE_ANGLE_DEG);
    // Знаменник: ШИРИНА ВІНЦЯ, а не «довжина контактної лінії».
    //
    // Методичка друкує в знаменнику в₀ = (r₁ср + r₂ср)·sin α, і ширина вінця в
    // її вираз не входить узагалі. Це фізично неможливо: контактна напруга
    // падає зі зростанням площі контакту, а площа — це якраз ширина вінця.
    // За її виразом ширша шестерня виходила б НАПРУЖЕНІШОЮ за вужчу.
    //
    // Вахламов (с. 181) друкує той самий вираз із тим самим коефіцієнтом
    // 0,418, але в знаменнику стоїть b — «ширина шестерни». Рахують за ним;
    // в₀ лишається поряд для звірки.
    // b₀ = (r₁ср + r₂ср)·sin α — саме КУТ ЗАЧЕПЛЕННЯ, а не кут конуса. Символи
    // δ і α на скані схожі, і сплутати їх коштує 23 % напруги; те саме α стоїть
    // і в знаменнику під коренем, і в розділі 10 у тій самій ролі.
    const lineOfContact = (r1 + r2) * Math.sin(alpha);
    const equivalent1 = r1 / (Math.cos(radians(beta)) ** 2 * Math.cos(radians(delta1)));
    const equivalent2 = r2 / (Math.cos(radians(beta2)) ** 2 * Math.cos(radians(delta2)));
    const force = torque * 1000 / r1;
    const denominator = width;
    const value = CONTACT_COEFFICIENT * Math.sqrt(
      force * YOUNG_MODULUS_MPA / (denominator * Math.sin(alpha) * Math.cos(alpha))
      * (1 / equivalent1 + 1 / equivalent2));
    // Те, що дала б надрукована методичкою «довжина контактної лінії».
    const byPrintedDenominator = CONTACT_COEFFICIENT * Math.sqrt(
      force * YOUNG_MODULUS_MPA / (lineOfContact * Math.sin(alpha) * Math.cos(alpha))
      * (1 / equivalent1 + 1 / equivalent2));
    return {
      defined: true,
      value,
      withinLimit: value <= (finiteNumber(contactLimitMpa) ?? CONTACT_LIMIT_MPA),
      limitMpa: finiteNumber(contactLimitMpa) ?? CONTACT_LIMIT_MPA,
      safetyFactor: (finiteNumber(contactLimitMpa) ?? CONTACT_LIMIT_MPA) / value,
      byPrintedDenominatorMpa: byPrintedDenominator,
      faceWidthMm: width,
      lineOfContactMm: lineOfContact,
      gearType: gearType ?? null,
      pinionDiameterRatio: scale,
      drivenSpiralAngleDeg: beta2,
      forceN: force,
      meanRadiiMm: { driving: r1, driven: r2 },
      equivalentRadiiMm: { driving: equivalent1, driven: equivalent2 }
    };
  }

  // Project derivation: solve L=m*sqrt(Z1^2+Z2^2)/2 together with the
  // existing bending requirement, then increase m until contact also passes.
  // This is preliminary equivalent-cone sizing, NOT an ISO/AGMA hypoid rating.
  function designGeometry({ designTorqueNm, drivingTeeth, drivenTeeth, spiralAngleDeg,
    formFactor, allowableStressMpa, drivenSpiralAngleDeg, pinionDiameterRatio,
    gearType, contactLimitMpa, drivenFormFactor, minimumModuleMm = null, largerThanMinimum = false }) {
    const K = Math.hypot(drivingTeeth, drivenTeeth) / 2;
    const constants = [designTorqueNm, drivingTeeth, drivenTeeth, formFactor, allowableStressMpa, K];
    if (!constants.every(v => finiteNumber(v) > 0)) return { defined:false, reason:"Для узгодженого підбору потрібні момент, зуби, форма і допустима напруга." };
    const lambda = 1-TOOTH_LENGTH_SHARE;
    const drivenAngle = drivenSpiralAngleDeg ?? spiralAngleDeg;
    const drivenForm = drivenFormFactor ?? formFactorFor({ equivalent: equivalentTeeth({
      pinionTeeth: drivenTeeth, spiralAngleDeg: drivenAngle,
      coneHalfAngleDeg: 90 - Math.atan(drivingTeeth / drivenTeeth) * 180 / Math.PI
    }) })?.factor;
    if (!(drivenForm > 0)) return { defined: false, reason: "Коефіцієнт форми зуба веденого колеса не визначено." };
    const required = Math.cbrt(6*designTorqueNm*1000*Math.cos(radians(spiralAngleDeg)) /
      (Math.PI*formFactor*drivingTeeth*K*(1-lambda**3)*allowableStressMpa));
    // Explicit 0.25-mm preliminary design grid; this does not claim a sourced
    // preferred-number series. A production gear is adopted from a catalogue.
    const grid = minimumModuleMm > 0
      ? [...new Set([...(toothForm()?.MODULE_SERIES || []).flatMap(row => row.values),
          ...Array.from({length:125}, (_,i)=>18+i*0.5)])]
          .filter(m=>m>=required*(1-1e-10) && (largerThanMinimum ? m>minimumModuleMm*(1+1e-10) : m>=minimumModuleMm*(1-1e-10))).sort((a,b)=>a-b)
      : Array.from({length:240},(_,i)=>Math.ceil(required/0.25-1e-10)*0.25+i*0.25);
    const history=[];
    for (let trial=0;trial<grid.length;trial++) {
      const m=grid[trial];
      const L=m*K, b=L*TOOTH_LENGTH_SHARE;
      const bending=bendingStress({designTorqueNm,moduleMm:m,drivingTeeth,drivenTeeth,
        spiralAngleDeg,drivenSpiralAngleDeg:drivenAngle,formFactor,drivenFormFactor:drivenForm,
        coneLengthMm:L,toothLengthMm:b,allowableStressMpa});
      const contact=contactStress({designTorqueNm,moduleMm:m,drivingTeeth,drivenTeeth,spiralAngleDeg,
        coneHalfAngleDeg:Math.atan(drivingTeeth/drivenTeeth)*180/Math.PI,toothLengthMm:b,
        drivenSpiralAngleDeg,pinionDiameterRatio,gearType,contactLimitMpa});
      const passed = bending.defined && bending.withinLimit && contact.defined && contact.withinLimit;
      history.push({moduleMm:m,coneLengthMm:L,toothLengthMm:b,
        bendingDrivingMpa:bending.driving?.value??null,bendingDrivenMpa:bending.driven?.value??null,
        bendingLimitMpa:allowableStressMpa,contactMpa:contact.value??null,contactLimitMpa:contact.limitMpa??contactLimitMpa,passed});
      if (passed) return {
        defined:true, module:{defined:true,value:m,requiredValue:Math.max(bending.driving.requiredModuleMm,bending.driven.requiredModuleMm),
          lambda,shapeFactor:1-lambda**3,geometricDesign:true},
        coneLength:{defined:true,value:L,method:"geometric-design",withinRange:L>=CONE_LENGTH_MM.min&&L<=CONE_LENGTH_MM.max},
        toothLengthMm:b,contact,bending,firstBendingModuleMm:required,trialCount:trial+1,history,
        gridDescription:minimumModuleMm>0 ? "Наведені в проєкті модулі до 18 мм; далі явна проєктна сітка 0,5 мм до 80 мм. Це не каталог виробничих гіпоїдних пар." : "Попередня проєктна сітка 0,25 мм, не виробничий каталог."
      };
    }
    return {defined:false,history,trialCount:history.length,reason:"Підбір у заданій межі пошуку не задовольнив згин і контакт; потрібні інші зуби, матеріал або габарити. Жоден кандидат не прийнятий."};
  }

  function formFactorFor({ equivalent }) {
    const gears = toothForm();
    if (!gears || !equivalent?.defined) return null;
    // Таблиця 12 дискретна: беруть найближче приведене число зубів.
    return gears.TOOTH_FORM_FACTOR.reduce((closest, row) =>
      Math.abs(row.equivalentTeeth - equivalent.value)
        < Math.abs(closest.equivalentTeeth - equivalent.value) ? row : closest,
    gears.TOOTH_FORM_FACTOR[0]);
  }

  // Довжину твірної конуса джерело велить ПРИЙНЯТИ (90…150 мм) і підставити в
  // формулу модуля. Але та сама L випливає й з готової пари: L = m√(Z₁²+Z₂²)/2.
  // Два числа мають збігатися, і джерело про це не згадує — воно не описує
  // жодної ітерації. Документ рахує надруковане й показує обидва L: якщо вони
  // розходяться, прийняте L не відповідає парі, яку воно ж і породило.
  function coneDistanceFromPair({ moduleMm, drivingTeeth, drivenTeeth }) {
    const module_ = finiteNumber(moduleMm);
    const z1 = finiteNumber(drivingTeeth);
    const z2 = finiteNumber(drivenTeeth);
    if (module_ === null || z1 === null || z2 === null
      || module_ <= 0 || z1 <= 0 || z2 <= 0) {
      return { defined: false, reason: "Потрібні модуль і числа зубів." };
    }
    return { defined: true, value: module_ * Math.sqrt(z1 * z1 + z2 * z2) / 2 };
  }

  function coneDistanceStatus({ adoptedMm, impliedMm }) {
    const adopted = finiteNumber(adoptedMm);
    const implied = finiteNumber(impliedMm);
    if (adopted === null || implied === null || adopted <= 0) {
      return { defined: false, checked: false, reason: "Порівняти довжини твірної не вийшло." };
    }
    const difference = (implied - adopted) / adopted;
    return {
      defined: true,
      checked: true,
      adoptedMm: adopted,
      impliedMm: implied,
      difference,
      close: Math.abs(difference) <= 0.1,
      reason: `Прийнято L = ${adopted.toFixed(0)} мм, а з готової пари випливає `
        + `${implied.toFixed(0)} мм — різниця ${(difference * 100).toFixed(0)} %. `
        + (Math.abs(difference) <= 0.1
          ? "Прийняте значення відповідає парі."
          : "Прийняте L не відповідає парі, яку воно ж і породило: джерело "
            + "жодної ітерації не описує, тому виправляти його мовчки не можна "
            + "— але й лишати розбіжність непоміченою теж.")
    };
  }

  function buildDesignTorqueStep({ torque, texNumber }) {
    return {
      id: "final-drive-design-torque",
      title: "Розрахунковий момент на ведучій шестірні",
      purpose: "Take the torque the final-drive pinion is sized against.",
      output: {
        id: "value.final-drive-design-torque",
        symbol: "M_{\\text{розр}}",
        label: "Final drive design torque",
        valueType: "quantity",
        canonicalUnit: "N*m"
      },
      expression: "beta * engineTorque * firstGearRatio * activeTransferRatio",
      dependencies: [torque.reserveFactorIsAbsent ? "value.maximum-motor-torque" : "value.maximum-engine-torque",
        torque.firstGearValueRef || "value.gearbox-ladder",
        ...(!torque.reserveFactorIsAbsent || (torque.transferRatio ?? 1) !== 1
          ? [torque.transferRatioSourceRef || "decision.transfer-case-ratio"] : [])],
      equationNumber: "12.1",
      formulaTex: "M_{\\text{розр}}=\\beta M_{\\text{к}\\max}" + (torque.firstGearValueRef === "value.governing-gearbox-ratio" ? "\\max(u_1,|u_R|)" : "u_{\\text{к}1}") + "u_{\\mathrm{рк}}",
      substitutionTex: `M_{\\text{розр}}=${texNumber(torque.reserveFactor, 3)}\\cdot`
        + `${texNumber(torque.engineTorqueNm, 1)}\\cdot${texNumber(torque.firstGearRatio, 3)}`
        + `\\cdot${texNumber(torque.transferRatio ?? 1, 3)}`
        + `=${texNumber(torque.value, 0)}\\ \\text{Н}\\cdot\\text{м}`,
      result: { value: torque.value, canonicalUnit: "N*m", displayUnit: "Н·м" },
      method: "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: [],
      assumptions: ["Для попереднього міцнісного навантаження ККД коробки й роздавальної коробки прийнято рівним 1: втрати не зменшують розрахунковий момент. Головна передача й колісний редуктор у вхідний момент не входять."],
      limitations: torque.reserveFactorIsAbsent
        ? ["Коефіцієнта запасу зчеплення β тут немає: в електричного привода "
          + "немає зчеплення. Джерело такого випадку не розглядає."]
        : []
    };
  }

  function buildTeethStep({ split, teeth, cylindrical, texNumber }) {
    const bevelRatio = `\\frac{${teeth.drivenTeeth}}{${teeth.drivingTeeth}}`;
    const totalRatio = cylindrical?.defined
      ? `${bevelRatio}\\cdot\\frac{${cylindrical.drivenTeeth}}{${cylindrical.drivingTeeth}}`
      : bevelRatio;
    return {
      id: "final-drive-teeth",
      title: "Числа зубів головної передачі",
      purpose: "Turn the final-drive ratio into whole teeth.",
      output: {
        id: "value.final-drive-teeth",
        symbol: "Z",
        label: "Final drive teeth",
        valueType: "list",
        canonicalUnit: null
      },
      expression: "Z2 = ratio * Z1",
      dependencies: ["decision.vehicle-type", "decision.final-drive-kind", "decision.final-drive-pinion-teeth"],
      equationNumber: "12.2",
      formulaTex: (split.kind === "double" ? "u_0=\\dfrac{Z_2}{Z_1}\\dfrac{Z_4}{Z_3},\\qquad " : "u_0=\\dfrac{Z_2}{Z_1},\\qquad ")
        + "\\delta=\\operatorname{arctg}\\dfrac{Z_1}{Z_2}",
      substitutionTex: `\\begin{aligned}u_0&=${totalRatio}=`
        + `${texNumber(teeth.actualRatio * (cylindrical?.defined ? cylindrical.actualRatio : 1), 5)}\\\\ `
        + `\\delta&=\\operatorname{arctg}\\frac{${teeth.drivingTeeth}}{${teeth.drivenTeeth}}`
        + `=${texNumber(teeth.pitchConeHalfAngleDeg, 3)}^{\\circ}\\end{aligned}`,
      result: {
        value: [
          { stage: "bevel", drivingTeeth: teeth.drivingTeeth,
            drivenTeeth: teeth.drivenTeeth, ratio: teeth.actualRatio },
          ...(cylindrical?.defined
            ? [{ stage: "cylindrical", drivingTeeth: cylindrical.drivingTeeth,
              drivenTeeth: cylindrical.drivenTeeth, ratio: cylindrical.actualRatio }]
            : [])
        ],
        canonicalUnit: null,
        displayUnit: ""
      },
      method: "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        split.kind === "double"
          ? `Подвійна передача: для конічної пари потрібно ${BEVEL_RATIO_DOUBLE}, за цілими зубами прийнято ${texNumber(teeth.actualRatio,4)}; `
            + `циліндрична має ${texNumber(cylindrical?.actualRatio,4)}. Загальне потрібне u₀ = ${texNumber(split.totalRatio,4)}.`
          : "Одинарна передача: усе передаточне число несе конічна пара."
      ],
      assumptions: [],
      limitations: [
        `Джерело подає Z₁ = ${PINION_TEETH.min}…${PINION_TEETH.max} `
        + "(менші значення — для вантажних автомобілів)."
      ]
    };
  }

  function buildModuleStep({ module_, inputs, coneLength, texNumber }) {
    const members = module_.geometricDesign && inputs.bending?.defined
      ? [inputs.bending.driving, inputs.bending.driven]
      : [{ torqueNm: inputs.designTorqueNm, spiralAngleDeg: inputs.spiralAngleDeg,
        formFactor: inputs.formFactor, teeth: inputs.pinionTeeth,
        requiredModuleMm: module_.value }];
    const calculations = members.map((member, index) =>
      `m_{\\mathrm{req},${index + 1}}&=\\sqrt{\\frac{6\\cdot${texNumber(member.torqueNm, 3)}\\cdot10^3`
      + `\\cdot\\cos(${texNumber(member.spiralAngleDeg, 3)}^\\circ)}`
      + `{\\pi\\cdot${texNumber(member.formFactor, 4)}\\cdot${member.teeth}`
      + `\\cdot${texNumber(inputs.coneLengthMm, 4)}\\cdot(1-${texNumber(module_.lambda, 6)}^3)`
      + `\\cdot${texNumber(inputs.allowableStressMpa, 2)}}}`
      + `=${texNumber(member.requiredModuleMm, 4)}\\ \\text{мм}`).join("\\\\ ");
    return {
      id: "final-drive-module",
      title: "Модуль зубів за більшим радіусом",
      purpose: "Size the bevel tooth from bending strength.",
      output: {
        id: "value.final-drive-module",
        symbol: "m_n",
        label: "Final drive module",
        valueType: "quantity",
        canonicalUnit: "mm"
      },
      expression: "sqrt(6 M cos(beta) / (pi y Z L (1 - lambda^3) sigma))",
      dependencies: ["decision.final-drive-bending-stress", "value.final-drive-design-torque", "value.final-drive-teeth",
        "decision.final-drive-spiral-angle", "decision.final-drive-cone-length"],
      equationNumber: "12.3",
      formulaTex: (module_.geometricDesign ? "m_{\\mathrm{req},i}=" : "m_n=") + "\\sqrt{\\dfrac{6\\cdot10^3M_i\\cos\\beta_i}"
        + "{\\pi y_iZ_iL\\left(1-\\lambda^{3}\\right)\\sigma}},\\qquad "
        + "\\lambda=1-\\dfrac{b}{L}",
      substitutionTex: `\\begin{aligned}\\lambda&=1-\\frac{${texNumber(inputs.toothLengthMm, 4)}}`
        + `{${texNumber(inputs.coneLengthMm, 4)}}=${texNumber(module_.lambda, 6)}\\\\ `
        + calculations + (module_.geometricDesign
          ? `\\\\ m_{\\mathrm{req}}&=\\max(${members.map(member => texNumber(member.requiredModuleMm, 4)).join(",\\,")})`
            + `=${texNumber(module_.requiredValue, 4)}\\ \\text{мм}\\\\ `
            + `m_n&=${texNumber(module_.value, 2)}\\ \\text{мм}\\quad\\text{(прийнято після перевірок)}`
          : `\\\\ m_n&=m_{\\mathrm{req},1}=${texNumber(module_.value, 4)}\\ \\text{мм}`)
        + "\\end{aligned}",
      result: { value: module_.value, canonicalUnit: "mm", displayUnit: "мм" },
      method: module_.geometricDesign ? "project-geometric-sizing" : "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        "У формулі Mᵢ задано в Н·м і множником 1000 переведено в Н·мм; L і b — у мм, σ — у МПа. Індекси 1 і 2 позначають ведучу й ведену шестерні; M₁ — розрахунковий момент (12.1).",
        ...(module_.geometricDesign ? [`Потрібно за згином m ≥ ${texNumber(module_.requiredValue,2)} мм; прийнято ${texNumber(module_.value,2)} мм із попереднім кроком 0,25 мм, після перевірки контакту. L і b перераховано за прийнятим модулем. Це навчальний підбір еквівалентних конусів, не повна перевірка гіпоїдної геометрії за ISO/AGMA.`] : []),
        `Коефіцієнт форми зуба взято з таблиці 12 за приведеною кількістю зубів `
        + `Z_пр = ${texNumber(inputs.equivalentTeeth, 1)} — з тієї самої таблиці, `
        + "що й у розділі 10."
      ],
      assumptions: [
        `Довжина зуба b = L/${Math.round(1 / TOOTH_LENGTH_SHARE)}, як пише джерело.`,
        "У попередній геометрії mₙ використовують як еквівалентний зовнішній модуль конусів. Він не задає повної нормальної геометрії виробничої гіпоїдної пари."
      ],
      limitations: [
        // Джерело велить прийняти L і не згадує, що те саме L випливає з пари.
        ...(coneLength?.checked && !coneLength.close ? [coneLength.reason] : [])
      ]
    };
  }

  function buildContactStressStep({ contact, texNumber }) {
    return {
      id: "final-drive-contact-stress",
      title: "Контактні напруги в зубах головної передачі",
      purpose: "Check the bevel pair against the printed contact limit.",
      output: {
        id: "value.final-drive-contact-stress",
        symbol: "\\sigma_{\\text{ст}}",
        label: "Final drive contact stress",
        valueType: "quantity",
        canonicalUnit: "MPa"
      },
      expression: "0.418 * sqrt(P E / (b sin(a) cos(a)) * (1/re1 + 1/re2))",
      dependencies: ["value.final-drive-module", "value.final-drive-design-torque"],
      equationNumber: "12.4",
      formulaTex: "\\sigma_{\\text{ст}}=0{,}418\\sqrt{\\dfrac{PE}"
        + "{b\\sin\\alpha\\cos\\alpha}"
        + "\\left(\\dfrac{1}{r_{e1}}+\\dfrac{1}{r_{e2}}\\right)}",
      substitutionTex: `\\sigma_{\\text{ст}}=0{,}418\\sqrt{\\frac{${texNumber(contact.forceN, 3)}`
        + `\\cdot${YOUNG_MODULUS_MPA}}{${texNumber(contact.faceWidthMm, 4)}`
        + `\\cdot\\sin(${PRESSURE_ANGLE_DEG}^\\circ)\\cdot\\cos(${PRESSURE_ANGLE_DEG}^\\circ)}`
        + `\\left(\\frac{1}{${texNumber(contact.equivalentRadiiMm.driving, 4)}}`
        + `+\\frac{1}{${texNumber(contact.equivalentRadiiMm.driven, 4)}}\\right)}`
        + `=${texNumber(contact.value, 2)}\\ \\text{МПа}`,
      result: { value: contact.value, canonicalUnit: "MPa", displayUnit: "МПа" },
      method: "sourced-formula",
      sourceRefs: BOTH_SOURCE_REFS,
      readerNotes: [
        `Межа — ${CONTACT_LIMITS_MPA.bevel}…${CONTACT_LIMITS_MPA.hypoid} МПа `
        + "(Вахламов, с. 181; більші значення — для гіпоїдних передач, сталі "
        + "15ХН3А, 20ХН3А, 20ХНМА, 30ХГТ). Методичка друкує саму лише нижню "
        + "межу цього діапазону.",
        "Перевірку ведуть за РОЗРАХУНКОВИМ моментом — піковим, а не тим, з яким "
        + "передача працює постійно. Тому попередня пара часто лягає вище "
        + "діапазону, і це вказівка додати зубів ведучій шестерні, збільшити "
        + "модуль або подовжити початковий конус, а не ознака помилки в числах.",
        contact.gearType === "hypoid"
          ? "Передача ГІПОЇДНА: кути спіралі різні, і ведуча шестерня в "
            + `${texNumber(contact.pinionDiameterRatio, 3)} раза більша, ніж дала б `
            + "конічна геометрія при тому самому передаточному числі "
            + "(Вахламов, с. 177: u_г = k·D₀/d₀). Саме через це вона й міцніша: "
            + "більший діаметр — менша окружна сила на зубі."
          : "Передача КОНІЧНА: кути спіралі обох шестерень однакові, ведуча "
            + "шестерня не збільшена, тому й допустима напруга нижча.",
        "У знаменнику стоїть ШИРИНА ВІНЦЯ. Методичка друкує там "
        + "в₀ = (r₁ср + r₂ср)·sin α, і ширина вінця в її вираз не входить "
        + "узагалі — а це неможливо: напруга контакту падає зі зростанням площі "
        + "контакту, і ширша шестерня виходила б у неї НАПРУЖЕНІШОЮ за вужчу. "
        + `За надрукованим знаменником тут вийшло б `
        + `${texNumber(contact.byPrintedDenominatorMpa, 0)} МПа. Вахламов (с. 181) `
        + "друкує той самий вираз із тим самим коефіцієнтом 0,418, але з b — "
        + "«шириной шестерни».",
        // Найцікавіше, що дало читання друку цього розділу.
        "Тут книжка друкує в дужках ПЛЮС, а в розділі 10 для циліндричної пари "
        + "— мінус. Обидві пари зовнішні, тож фізика в них та сама. Документ "
        + "рахує надруковане в кожному місці й називає розбіжність."
      ],
      assumptions: [
        "Кут зачеплення α = 20°, модуль пружності E = 210 ГПа, вал під 90°."
      ],
      limitations: [
        "Відхилення від джерела: у знаменнику взято ширину вінця b (Вахламов, "
        + "с. 181), а не надруковану методичкою «довжину контактної лінії» "
        + "в₀ = (r₁ср + r₂ср)·sin α, за якою ширша шестерня виходила б "
        + "напруженішою за вужчу.",
        ...(contact.gearType === "hypoid"
          ? ["Відхилення від джерела: гіпоїдну пару рахують із різними кутами "
            + "спіралі й збільшеною в k разів ведучою шестернею (Вахламов, "
            + "с. 177). Методичка цієї геометрії не подає, хоч і називає "
            + "гіпоїдні кути."]
          : [])
      ].concat(contact.withinLimit
        ? []
        : [`Напруга ${contact.value.toFixed(0)} МПа перевищує ${contact.limitMpa} МПа.`])
    };
  }

  function buildBendingStressStep({ bending, texNumber }) {
    const tex = texNumber;
    const members = [bending.driving, bending.driven];
    const substitutions = members.map((member, index) =>
      `\\sigma_{F,${index + 1}}&=\\frac{6\\cdot${tex(member.torqueNm, 3)}\\cdot10^3`
      + `\\cdot\\cos(${tex(member.spiralAngleDeg, 3)}^\\circ)}`
      + `{\\pi\\cdot${tex(member.formFactor, 4)}\\cdot${member.teeth}`
      + `\\cdot${tex(member.coneLengthMm, 4)}\\cdot(1-${tex(member.lambda, 6)}^3)`
      + `\\cdot${tex(bending.moduleMm, 4)}^2}=${tex(member.value, 3)}\\ \\text{МПа}`
    ).join("\\\\ ");
    return {
      id: "final-drive-bending-stress",
      title: "Перевірка згину обох коліс головної передачі",
      purpose: "Verify both members by inverting the existing preliminary module relation.",
      output: { id: "value.final-drive-bending-stress", symbol: "\\sigma_{F,\\max}",
        label: "Maximum final drive bending stress", valueType: "quantity", canonicalUnit: "MPa" },
      expression: "max(6 M1 cos(beta1)/(pi y1 Z1 L (1-lambda^3) m^2), 6 M2 cos(beta2)/(pi y2 Z2 L (1-lambda^3) m^2))",
      dependencies: ["value.final-drive-module", "value.final-drive-design-torque", "value.final-drive-teeth",
        "decision.final-drive-spiral-angle", "decision.final-drive-cone-length", "decision.final-drive-bending-stress"],
      equationNumber: "12.5",
      formulaTex: "\\sigma_{F,i}=\\dfrac{6\\cdot10^3M_i\\cos\\beta_i}{\\pi y_iZ_iL(1-\\lambda^3)m_n^2},"
        + "\\quad \\sigma_{F,\\max}=\\max(\\sigma_{F,1},\\sigma_{F,2})\\leq[\\sigma_F]",
      substitutionTex: `\\begin{aligned}${substitutions}\\\\ `
        + `\\sigma_{F,\\max}&=\\max(${tex(bending.driving.value,3)},${tex(bending.driven.value,3)})`
        + `=${tex(bending.value,3)}\\ \\text{МПа}\\\\ `
        + `\\sigma_{F,\\max}&${bending.withinLimit ? "\\leq" : ">"}[\\sigma_F]=${tex(bending.limitMpa,0)}\\ \\text{МПа}\\end{aligned}`,
      result: {value:bending.value,canonicalUnit:"MPa",displayUnit:"МПа"},
      method: "project-derived-verification", sourceRefs: [...SOURCE_REFS,"source.project-derivation"],
      readerNotes: [`Коефіцієнти форми: y₁ = ${tex(bending.driving.formFactor,3)}, y₂ = ${tex(bending.driven.formFactor,3)}; `
        + `умова згину ${bending.withinLimit ? "виконується" : "не виконується"}, запас ${tex(bending.safetyFactor,2)}.`,
        "Це перевірка прийнятого модуля за оберненою формулою (12.3); момент у формулі переводять з Н·м у Н·мм множником 1000."],
      assumptions: ["Для веденого колеса прийнято M₂ = M₁·Z₂/Z₁ без зменшення на втрати; обидва колеса мають однакову попередню допустиму напругу.",
        "Форма зуба й еквівалентні конуси належать навчальній моделі. Матеріал, термообробка, ресурс і розподіл навантаження потребують окремого прийняття."],
      limitations: ["Попередня перевірка не є повним розрахунком конічної або гіпоїдної передачі за ISO 10300.",
        ...(!bending.withinLimit ? ["Прийнятий модуль не забезпечує умову згину обох коліс."] : [])]
    };
  }

  function buildRefinementStep({ refinement, texNumber: tex }) {
    if (!refinement?.defined) return null;
    const o=refinement.original, n=refinement.revised;
    const value=v=>Number.isFinite(v)?tex(v,3):"\\text{не визначено}";
    return {id:"final-drive-design-refinement",title:"Головна передача: невдалий початковий варіант і перевірений кандидат",
      purpose:"Retain the original failed checks, then evaluate larger module candidates with consistent geometry and both strength constraints.",
      output:{id:"value.final-drive-design-refinement",symbol:"m_{new}",label:"Final-drive design refinement audit",valueType:"list",canonicalUnit:null},
      expression:"evaluate larger module candidates; L=m*sqrt(z1^2+z2^2)/2; b=L/3; accept only if bending1,bending2,contact pass",
      dependencies:["value.final-drive-design-torque","value.final-drive-teeth"],equationNumber:null,
      formulaTex:"L=\\frac{m\\sqrt{z_1^2+z_2^2}}2;\\quad b=L/3;\\quad\\sigma_{F1},\\sigma_{F2}\\le[\\sigma_F];\\quad\\sigma_H\\le[\\sigma_H]",
      substitutionTex:`\\begin{aligned}m_{old}&=${value(o.moduleMm)}\\ \\text{мм};\\quad L_{old}=${value(o.coneLengthMm)}\\ \\text{мм};\\quad L_{geom}=${value(o.impliedConeLengthMm)}\\ \\text{мм}\\\\
        \\sigma_{F1,old}&=${value(o.bendingDrivingMpa)},\\quad\\sigma_{F2,old}=${value(o.bendingDrivenMpa)},\\quad[\\sigma_F]=${value(o.bendingLimitMpa)}\\ \\text{МПа}\\\\
        \\sigma_{H,old}&=${value(o.contactMpa)},\\quad[\\sigma_H]=${value(o.contactLimitMpa)}\\ \\text{МПа}`
        +(n.defined?`\\\\m_{new}&=${value(n.module.value)}\\ \\text{мм};\\quad L_{new}=${value(n.coneLength.value)}\\ \\text{мм};\\quad b_{new}=${value(n.toothLengthMm)}\\ \\text{мм}\\\\
        \\sigma_{F1,new}&=${value(n.bending.driving.value)}\\le${value(o.bendingLimitMpa)};\\quad\\sigma_{F2,new}=${value(n.bending.driven.value)}\\le${value(o.bendingLimitMpa)}\\\\
        \\sigma_{H,new}&=${value(n.contact.value)}\\le${value(n.contact.limitMpa)}\\ \\text{МПа}`:"\\\\\\text{Придатного кандидата в межах пошуку не знайдено}")+"\\end{aligned}",
      result:{value:[{stage:"original",...o},...(n.history||[]).map(row=>({stage:"trial",...row}))],canonicalUnit:null,displayUnit:null},
      method:"bounded-size-refinement-with-audit",sourceRefs:["source.project-derivation","source.method.course"],assumptions:[],
      readerNotes:["Початкові невиконані умови збережено вище; вони не перейменовані на успішні. У кандидата ті самі момент, матеріальні межі та числа зубів: змінені модуль, узгоджена твірна й ширина вінця.",
        n.gridDescription||"Пошук обмежений наведеним рядом; при вичерпанні межі успіх не заявляється.",
        `Перевірено кандидатів: ${n.trialCount||0}. `+(refinement.applied?"Кандидат прийнято для автоматичного проєктного розміру; його використовують подальші результати.":refinement.manualGeometry?"Авторський розмір не змінено. Кандидат — лише пропозиція; для переходу виберіть узгоджений геометричний підбір.":"Новий варіант не прийнято."),
        n.defined?"Перевірені (12.4), (12.5) і геометрична сумісність; попереднє виконання цих умов не є перевіркою ресурсу.":n.reason],
      limitations:["Еквівалентна конічна/гіпоїдна модель навчального проєкту, не повний ISO 10300. Габарити, пляма контакту, опори, термообробка й втома потребують окремого проєктування."]};
  }

  function secondaryDesign(options) {
    return shared("VehicleFinalDriveSecondary", "./final-drive-secondary.js").design(options);
  }

  function buildSecondarySteps(options) {
    return shared("VehicleFinalDriveSecondary", "./final-drive-secondary.js").buildSteps(options);
  }

  function designStatus({ kind, adoptedRatio, teeth, module: module_, coneStatus, contact, bending, angles, secondary }) {
    const limitations = ["Навчальний підбір еквівалентних конусів; перевірка матеріалу, термообробки, ресурсу, опор і плями контакту не виконана."];
    if (kind === "double" && !secondary?.defined) limitations.push("Циліндрична ступінь не пройшла підбір модуля й міцності.");
    const secondaryComplete = kind !== "double" || (secondary?.defined && secondary.bending?.withinLimit && secondary.contact?.withinLimit);
    const complete = adoptedRatio?.defined && teeth?.defined && module_?.defined
      && coneStatus?.checked && contact?.defined && bending?.defined && angles?.defined;
    const failed = (contact?.defined && !contact.withinLimit) || (bending?.defined && !bending.withinLimit)
      || (coneStatus?.checked && !coneStatus.close) || (angles?.defined && !angles.withinRatioLimit);
    if (angles?.defined && !angles.withinRatioLimit) limitations.push("Відношення гіпоїдних діаметрів виходить за прийнятий діапазон моделі.");
    return { status: failed ? "failed" : complete && secondaryComplete ? "preliminary-verified" : "incomplete",
      complete: Boolean(complete && secondaryComplete), limitations };
  }

  function decisionsFor({ kind, pinionTeeth, spiralAngle, coneLength, bendingStress }) {
    const decisions = [];
    if (kind) {
      decisions.push({
        id: "decision.final-drive-kind",
        kind: "Decision",
        choiceRef: null,
        symbol: null,
        adoptedValue: kind,
        canonicalUnit: null,
        method: "project-input",
        selectedReferenceId: null,
        recommendedValue: null,
        recommendedSourceRefs: SOURCE_REFS,
        rationale: kind === "double"
          ? "Подвійна головна передача: конічна пара несе 1,7, решту — циліндрична."
          : "Одинарна головна передача: усе передаточне число несе конічна пара.",
        sourceRefs: SOURCE_REFS,
        limitations: [],
        manuallyOverridden: true
      });
    }
    if (Number.isFinite(pinionTeeth)) {
      decisions.push({
        id: "decision.final-drive-pinion-teeth",
        kind: "Decision",
        choiceRef: null,
        symbol: "Z_1",
        adoptedValue: pinionTeeth,
        canonicalUnit: null,
        method: "project-input",
        selectedReferenceId: null,
        recommendedValue: Math.round((PINION_TEETH.min + PINION_TEETH.max) / 2),
        recommendedSourceRefs: SOURCE_REFS,
        rationale: `Джерело подає ${PINION_TEETH.min}…${PINION_TEETH.max} `
          + "(менші значення — для вантажних автомобілів).",
        sourceRefs: SOURCE_REFS,
        limitations: pinionTeeth < PINION_TEETH.min || pinionTeeth > PINION_TEETH.max
          ? ["Значення лежить поза діапазоном джерела."] : [],
        manuallyOverridden: true
      });
    }
    [["decision.final-drive-spiral-angle", "\\beta_1", spiralAngle, SPIRAL_ANGLE, "deg"],
      ["decision.final-drive-cone-length", "L", coneLength, CONE_LENGTH_MM, "mm"],
      ["decision.final-drive-bending-stress", "\\sigma", bendingStress,
        BENDING_STRESS_MPA, "MPa"]]
      .forEach(([id, symbol, adopted, range, unit]) => {
        if (!adopted?.defined) return;
        decisions.push({
          id,
          kind: "Decision",
          choiceRef: null,
          symbol,
          adoptedValue: adopted.value,
          canonicalUnit: unit,
          method: adopted.method === "geometric-design" ? "geometric-design" : adopted.method === "project-input" ? "project-input" : "source-midpoint",
          selectedReferenceId: null,
          recommendedValue: (range.min + range.max) / 2,
          recommendedSourceRefs: SOURCE_REFS,
          rationale: adopted.method === "geometric-design"
            ? "L узгоджено з геометрією зубчастої пари, модулем, умовами згину та контакту; це виведення проєкту, а не середина довідкового діапазону."
            : adopted.method === "project-input"
            ? `Власне значення автора. Джерело подає ${range.min}…${range.max}.`
            : `Прийнято середину діапазону ${range.min}…${range.max}.`,
          sourceRefs: adopted.method === "geometric-design" ? ["source.project-derivation"]
            : adopted.method === "project-input" ? ["source.project-input"] : SOURCE_REFS,
          limitations: adopted.withinRange === false
            ? ["Значення лежить поза діапазоном джерела."] : [],
          manuallyOverridden: adopted.method === "project-input"
        });
      });
    return decisions;
  }

  function diagnosticsFor({ teeth, contact, bending, designStatus: status, coneLength, plausibility }) {
    const out = [];
    if (bending?.defined && !bending.withinLimit) out.push({
      code:"FINAL_DRIVE_BENDING_ABOVE_LIMIT",severity:"warning",
      message:`Напруга згину ${bending.value.toFixed(0)} МПа перевищує ${bending.limitMpa} МПа.`,
      details:{node:"calc.final-drive-bending-stress"}
    });
    if (status?.status === "incomplete") out.push({
      code:"FINAL_DRIVE_DESIGN_INCOMPLETE",severity:"warning",
      message:"Конструктивний розрахунок головної передачі не завершено: потрібні зуби, модуль та перевірки всіх ступенів.",
      details:{node:"calc.final-drive-design-torque"}
    });
    if (coneLength?.checked && !coneLength.close) {
      out.push({
        code: "FINAL_DRIVE_CONE_LENGTH_MISMATCH",
        severity: "warning",
        message: coneLength.reason,
        details: { node: "calc.final-drive-module" }
      });
    }
    if (teeth?.defined && teeth.withinRange === false) {
      out.push({
        code: "FINAL_DRIVE_PINION_OUTSIDE_RANGE",
        severity: "warning",
        message: `Ведуча шестерня має ${teeth.drivingTeeth} зубів, а джерело подає `
          + `${PINION_TEETH.min}…${PINION_TEETH.max}.`,
        details: { node: "calc.final-drive-teeth" }
      });
    }
    if (plausibility?.checked && !plausibility.usual) {
      out.push({
        code: "FINAL_DRIVE_RATIO_UNUSUAL",
        // Не дефект: число саме по собі правильне, просто незвичне.
        severity: "info",
        message: `Передаточне число головної передачі ${plausibility.value.toFixed(2)} `
          + `лежить поза звичним для ${plausibility.vehicleType === "goods"
            ? "вантажних" : "легкових"} автомобілів діапазоном `
          + `${plausibility.band.min}…${plausibility.band.max} (Вахламов, с. 178). `
          + "Це історичний довідковий діапазон, а не критерій придатності. "
          + "Передаточне число оцінюють у прийнятому ланцюгу: за обертами "
          + "на заданій швидкості, повзучим ходом, силою тяги та перевірками "
          + "міцності зубчастих пар. Сам вихід за цей діапазон не визначає "
          + "розмірів або напруг коробки передач.",
        details: { node: "calc.final-drive-teeth" }
      });
    }
    if (contact?.defined && !contact.withinLimit) {
      out.push({
        code: "FINAL_DRIVE_CONTACT_ABOVE_LIMIT",
        severity: "warning",
        message: `Контактні напруги ${contact.value.toFixed(0)} МПа перевищують `
          + `${contact.limitMpa} МПа — верх діапазону `
          + `${CONTACT_LIMITS_MPA.bevel}…${CONTACT_LIMITS_MPA.hypoid} МПа, який `
          + "подає Вахламов (с. 181) для сталей 15ХН3А, 20ХН3А, 20ХНМА, 30ХГТ. "
          + "Перевірку ведуть за РОЗРАХУНКОВИМ моментом, тобто за піковим, а не "
          + "за тим, з яким передача працює постійно, тому попередня пара часто "
          + "лягає вище діапазону. Знизити можна трьома важелями: більше зубів "
          + "ведучої шестерні, більший модуль, довший початковий конус (він "
          + "задає ширину вінця).",
        details: { node: "calc.final-drive-contact-stress" }
      });
    }
    return out;
  }

  return Object.freeze({
    SOURCE_REFS,
    PINION_TEETH,
    BEVEL_RATIO_DOUBLE,
    SPIRAL_ANGLE,
    HYPOID_DRIVING_ANGLE,
    HYPOID_DRIVEN_ANGLE,
    HYPOID_DIAMETER_RATIO,
    midpoint,
    spiralAngles,
    CONE_LENGTH_MM,
    BENDING_STRESS_MPA,
    CONTACT_LIMIT_MPA,
    CONTACT_LIMITS_MPA,
    USUAL_RATIO,
    ratioPlausibility,
    CONTACT_COEFFICIENT,
    TOOTH_LENGTH_SHARE,
    adoptRange,
    splitRatio,
    bevelTeeth,
    cylindricalTeeth,
    adoptedRatio,
    equivalentTeeth,
    toothModuleMm,
    bendingStress,
    contactStress,
    coneDistanceFromPair,
    coneDistanceStatus,
    formFactorFor,
    designGeometry,
    buildRefinementStep,
    designStatus,
    secondaryDesign,
    buildSecondarySteps,
    diagnosticsFor,
    buildDesignTorqueStep,
    buildTeethStep,
    buildModuleStep,
    buildContactStressStep,
    buildBendingStressStep,
    decisionsFor
  });
}
