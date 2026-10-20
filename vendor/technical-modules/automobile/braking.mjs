"use strict";

// Розділ 6 — гальмові властивості.
//
// Метод із методичних вказівок, підрозділ 3.2, друковані с. 24. Звірено зі
// сканом (`Курсовой проект+.djvu`, аркуш 13).
//
// Тут документ уперше рахує не те, що автомобіль може, а те, чого він може не
// встигнути. Тому головне в цьому розділі — не числа, а порівняння їх із
// нормою: сповільнення й шлях, які нікуди не порівнюють, нічого не кажуть про
// придатність автомобіля.
export function createBraking({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;

  // Одна перевірка числа на весь проєкт: Number() приймає null, true й "" і
  // мовчки робить із них 0 та 1, а Number.isFinite їх пропускає. Модуль
  // лежить окремо, бо ця сама помилка ловилася вже в кількох розділах.
  const { finiteNumber } = (function loadNumeric() {
    const scope = typeof window === "object" ? window : globalThis;
    if (!scope.VehicleNumeric && typeof module === "object" && module.exports) {
      require("./numeric.js");
    }
    return scope.VehicleNumeric;
  })();

  const G = 9.81;

  // Час спрацьовування приводу залежить від його типу, с. 24.
  const ACTUATION_TIMES = Object.freeze([
    { id: "hydraulic", label: "Гідравлічний привод", seconds: 0.2 },
    { id: "pneumatic", label: "Пневматичний привод", seconds: 0.6 }
  ]);

  // K_е — коефіцієнт ефективності гальмової системи, с. 24.
  const EFFICIENCY_FACTORS = Object.freeze([
    { id: "car", label: "Легковий автомобіль", value: 1.2 },
    { id: "goods", label: "Вантажний автомобіль", value: 1.4 }
  ]);

  // Швидкість, з якої нормують гальмування, с. 24.
  const TEST_SPEEDS = Object.freeze([
    { id: "car", label: "Легкові автомобілі", speedMs: 22.2 },
    { id: "goods", label: "Вантажні автомобілі та автобуси", speedMs: 16.7 }
  ]);

  const DRIVER_REACTION_S = 0.8;
  const TORQUE_RISE_S = 0.5;

  // j_сп = (φ·cosα + f ± sinα)·g, с. 24.
  //
  // Знак при sinα — це напрям ухилу: на спуску складова ваги ГАЛЬМУВАННЮ
  // заважає, тому її віднімають. Джерело друкує «±» і залишає знак читачеві;
  // тут його визначає сам ухил, бо вгадувати напрям нема потреби — він
  // заданий у розділі 2.
  function deceleration({ adhesionCoefficient, rollingResistanceF, gradeAngleRad }) {
    const phi = finiteNumber(adhesionCoefficient);
    const f = finiteNumber(rollingResistanceF);
    // Ухилу НЕ ЗАДАНО і ухил — СМІТТЯ це різні речі. Перше означає рівну
    // дорогу, друге означає, що ухилу ніхто не перевіряв: `|| 0` робив із
    // булевого значення нуль і мовчки випрямляв дорогу.
    const alpha = gradeAngleRad === undefined || gradeAngleRad === null
      ? 0 : finiteNumber(gradeAngleRad);
    if (alpha === null) {
      return { defined: false, reason: "Ухил дороги має бути числом у радіанах." };
    }
    if (!(phi > 0)) return { defined: false, reason: "Потрібен додатний коефіцієнт зчеплення." };
    if (!Number.isFinite(f) || f < 0) {
      return { defined: false, reason: "Коефіцієнт опору коченню має бути невід'ємним." };
    }
    const value = (phi * Math.cos(alpha) + f + Math.sin(alpha)) * G;
    if (!(value > 0)) {
      return {
        defined: false,
        reason: "Сповільнення не додатне: на такому спуску зчеплення не втримує автомобіль."
      };
    }
    return {
      defined: true,
      value,
      adhesionCoefficient: phi,
      rollingResistanceF: f,
      gradeAngleRad: alpha,
      // На спуску складова ваги розганяє, тому шлях довший — і це має бути
      // видно, а не сховане в знаку.
      downhill: alpha < 0
    };
  }

  // S_г = V²/(2g(φ·cosα + f ± sinα)) — шлях ефективного гальмування, с. 24.
  function effectiveDistance({ speedMs, decelerationMs2 }) {
    const speed = finiteNumber(speedMs);
    const decel = finiteNumber(decelerationMs2);
    if (!(speed > 0)) return { defined: false, reason: "Потрібна додатна початкова швидкість." };
    if (!(decel > 0)) return { defined: false, reason: "Потрібне додатне сповільнення." };
    return { defined: true, value: speed ** 2 / (2 * decel), speedMs: speed,
      decelerationMs2: decel };
  }

  // S_зуп = (t_р + t_пр + 0,5·t_зр)·V + K_е·S_г, с. 24.
  //
  // Зупинковий шлях більший за гальмовий рівно на те, що автомобіль проїжджає,
  // поки водій реагує, а привод спрацьовує. Саме ця різниця й вирішує, чи
  // вистачить дистанції, і саме її зазвичай недооцінюють.
  function stoppingDistance({
    speedMs, effectiveDistanceM, actuationTimeS, efficiencyFactor,
    reactionTimeS = DRIVER_REACTION_S, torqueRiseTimeS = TORQUE_RISE_S
  }) {
    const speed = finiteNumber(speedMs);
    const effective = finiteNumber(effectiveDistanceM);
    const actuation = finiteNumber(actuationTimeS);
    const factor = finiteNumber(efficiencyFactor);
    const reaction = finiteNumber(reactionTimeS);
    const rise = finiteNumber(torqueRiseTimeS);
    const named = [
      ["швидкість", speedMs, speed],
      ["шлях ефективного гальмування", effectiveDistanceM, effective],
      ["час спрацьовування привода", actuationTimeS, actuation],
      ["коефіцієнт ефективності", efficiencyFactor, factor],
      ["час реакції водія", reactionTimeS, reaction],
      ["час зростання гальмового зусилля", torqueRiseTimeS, rise]
    ].find(([, , value]) => !Number.isFinite(value));
    if (named) {
      return {
        defined: false,
        reason: `Зупинковий шлях: ${named[0]} має бути числом, отримано ${typeof named[1]}.`
      };
    }
    const lostTimeS = reaction + actuation + 0.5 * rise;
    const reactionDistanceM = lostTimeS * speed;
    return {
      defined: true,
      value: reactionDistanceM + factor * effective,
      lostTimeS,
      reactionDistanceM,
      brakingDistanceM: factor * effective,
      efficiencyFactor: factor,
      reactionTimeS: reaction,
      actuationTimeS: actuation,
      torqueRiseTimeS: rise,
      speedMs: speed,
      effectiveDistanceM: effective
    };
  }

  // Порівняння з ГОСТ 25478-82, на який джерело прямо посилається (с. 24).
  //
  // Самих норм тут НЕМАЄ, і це навмисно. Обидва видання методички лише
  // називають стандарт і кажуть порівняти з ним; жодне не друкує чисел. Тому
  // документ не має чого вписати, і вписати «по пам'яті» означало б подати
  // вигадані числа як норму — гірше, ніж не мати перевірки взагалі, бо
  // читач повірив би їй.
  //
  // Замість цього межу вносить читач із самого стандарту, а документ записує,
  // звідки вона, і виконує порівняння. Так само вже зроблено з несучою
  // здатністю шин: її називають, а не вигадують.
  function complianceCheck({
    decelerationMs2, stoppingDistanceM,
    requiredDecelerationMs2 = null, maximumStoppingDistanceM = null
  }) {
    const decel = finiteNumber(decelerationMs2);
    const distance = finiteNumber(stoppingDistanceM);
    if (!Number.isFinite(decel) || !Number.isFinite(distance)) {
      return { defined: false, reason: "Потрібні сповільнення й зупинковий шлях." };
    }
    const requiredDecel = finiteNumber(requiredDecelerationMs2);
    const maximumDistance = finiteNumber(maximumStoppingDistanceM);
    const hasDecelLimit = Number.isFinite(requiredDecel) && requiredDecel > 0;
    const hasDistanceLimit = Number.isFinite(maximumDistance) && maximumDistance > 0;

    if (!hasDecelLimit && !hasDistanceLimit) {
      return {
        defined: true,
        checked: false,
        // Не «відповідає» і не «не відповідає»: перевірки не було.
        compliant: null,
        reason: "Норм ГОСТ 25478-82 у документі немає: методичка називає стандарт, "
          + "але чисел не друкує. Внесіть межу зі стандарту, щоб зробити порівняння."
      };
    }
    const decelerationOk = hasDecelLimit ? decel >= requiredDecel : null;
    const distanceOk = hasDistanceLimit ? distance <= maximumDistance : null;
    const verdicts = [decelerationOk, distanceOk].filter(value => value !== null);
    return {
      defined: true,
      checked: true,
      decelerationOk,
      distanceOk,
      // Обидві межі, якщо їх дві: пройти лише одну не досить.
      compliant: verdicts.every(Boolean),
      decelerationMarginMs2: hasDecelLimit ? decel - requiredDecel : null,
      distanceMarginM: hasDistanceLimit ? maximumDistance - distance : null,
      requiredDecelerationMs2: hasDecelLimit ? requiredDecel : null,
      maximumStoppingDistanceM: hasDistanceLimit ? maximumDistance : null,
      reason: null
    };
  }

  function buildBrakingDecelerationStep({ decel, brakingSpeedKmh, texNumber }) {
    const textNumber = (value, digits) => texNumber(value, digits).replaceAll("{,}", ",").replaceAll("\\,", "\u00a0");
    return {
      id: "braking-deceleration",
      title: "Сповільнення автомобіля",
      purpose: "Compute the available braking deceleration at the selected speed and road condition.",
      output: {
        id: "value.braking-deceleration",
        symbol: "j_{\\mathrm{сп}}",
        label: "Braking deceleration",
        valueType: "quantity",
        canonicalUnit: "m/s2"
      },
      expression: "(phi*cos(alpha) + f(V) + sin(alpha))*g",
      dependencies: [
        "decision.adhesion-coefficient",
        "input.rolling-resistance",
        "input.road-grade",
        "input.braking-test-speed"
      ],
      equationNumber: "6.1",
      formulaTex: "j_{\\mathrm{сп}}=(\\varphi\\cos\\alpha+f(V)\\pm\\sin\\alpha)g",
      substitutionTex: `j_{\\mathrm{сп}}=(${texNumber(decel.adhesionCoefficient, 2)}`
        + `\\cdot\\cos(${texNumber(decel.gradeAngleRad, 6)})+${texNumber(decel.rollingResistanceF, 6)}`
        + `+\\sin(${texNumber(decel.gradeAngleRad, 6)}))\\cdot9{,}81`
        + `=${texNumber(decel.value, 2)}\\;\\mathrm{м/с^2}`,
      result: { value: decel.value, canonicalUnit: "m/s2", displayUnit: "м/с²" },
      method: "course-methodic-3-2",
      sourceRefs: ["source.method.course", "source.method.birulya-rolling-resistance"],
      readerNotes: [
        `Кут ухилу α = ${textNumber(decel.gradeAngleRad, 6)} рад підставлено зі своїм знаком: від'ємний кут означає спуск.`,
        `Коефіцієнт кочення перераховано для швидкості початку гальмування `
        + `${textNumber(brakingSpeedKmh, 1)} км/год: f = `
        + `${textNumber(decel.rollingResistanceF, 4)}.`,
        `Коефіцієнт зчеплення взято прийнятий цим проєктом: `
        + `φ = ${textNumber(decel.adhesionCoefficient, 2)}.`
      ],
      assumptions: [],
      limitations: [
        "Коефіцієнт зчеплення вважається сталим протягом усього гальмування."
      ]
    };
  }

  function buildBrakingStep({ effective, stopping, compliance, texNumber }) {
    const textNumber = (value, digits) => texNumber(value, digits).replaceAll("{,}", ",").replaceAll("\\,", "\u00a0");
    return {
      id: "braking-performance",
      title: "Гальмовий і зупинковий шлях",
      purpose: "Compute stopping distance and compare it with the entered standard limits.",
      output: {
        id: "value.stopping-distance",
        symbol: "S_{\\mathrm{зуп}}",
        label: "Stopping distance",
        valueType: "quantity",
        canonicalUnit: "m"
      },
      expression: "(t_r + t_a + 0.5 t_rise) V + K_e V^2 / (2 j)",
      dependencies: [
        "value.braking-deceleration",
        "input.braking-test-speed",
        "input.braking-actuation",
        "input.braking-efficiency-class",
        ...(compliance.requiredDecelerationMs2 != null
          ? ["input.braking-required-deceleration"] : []),
        ...(compliance.maximumStoppingDistanceM != null
          ? ["input.braking-maximum-distance"] : [])
      ],
      equationNumber: "6.2",
      formulaTex: "S_{\\mathrm{г}}=\\frac{V^2}{2j_{\\mathrm{сп}}},"
        + "\\qquad S_{\\mathrm{зуп}}=\\left(t_{\\mathrm{р}}+t_{\\mathrm{пр}}"
        + "+0{,}5t_{\\mathrm{зр}}\\right)V+K_{\\mathrm{е}}S_{\\mathrm{г}}",
      substitutionTex: `\\begin{aligned}S_{\\mathrm{г}}&=\\frac{${texNumber(effective.speedMs, 5)}^2}`
        + `{2\\cdot${texNumber(effective.decelerationMs2, 5)}}=${texNumber(effective.value, 3)}\\ \\text{м}\\\\ `
        + `S_{\\mathrm{зуп}}&=(${texNumber(stopping.reactionTimeS, 2)}+${texNumber(stopping.actuationTimeS, 2)}`
        + `+0{,}5\\cdot${texNumber(stopping.torqueRiseTimeS, 2)})\\cdot${texNumber(stopping.speedMs, 5)}`
        + `+${texNumber(stopping.efficiencyFactor, 3)}\\cdot${texNumber(stopping.effectiveDistanceM, 3)}`
        + `=${texNumber(stopping.value, 2)}\\ \\text{м}\\end{aligned}`,
      result: { value: stopping.value, canonicalUnit: "m", displayUnit: "м" },
      method: "course-methodic-3-2",
      sourceRefs: ["source.method.course"],
      readerNotes: [
        `За ${textNumber(stopping.lostTimeS, 2)} с до початку гальмування автомобіль `
        + `проходить ${textNumber(stopping.reactionDistanceM, 1)} м — це реакція водія `
        + "й спрацьовування привода, а не гальмування.",
        compliance.checked === false
          ? compliance.reason
          : compliance.compliant
            ? "Вимоги ГОСТ 25478-82 виконано за внесеними межами."
            : "Вимоги ГОСТ 25478-82 НЕ виконано за внесеними межами."
      ],
      assumptions: [
        "Гальмують усі колеса одночасно й з повним використанням зчеплення."
      ],
      limitations: [
        "Норм ГОСТ 25478-82 документ не тримає: методичка називає стандарт, "
        + "але його чисел не друкує, тому межу вносить читач.",
        "Перерозподілу ваги під час гальмування не враховано: передні колеса "
        + "навантажуються більше за статичну частку, задні — менше."
      ]
    };
  }

  return Object.freeze({
    buildBrakingDecelerationStep,
    buildBrakingStep,
    G,
    ACTUATION_TIMES,
    EFFICIENCY_FACTORS,
    TEST_SPEEDS,
    DRIVER_REACTION_S,
    TORQUE_RISE_S,
    deceleration,
    effectiveDistance,
    stoppingDistance,
    complianceCheck
  });
}
