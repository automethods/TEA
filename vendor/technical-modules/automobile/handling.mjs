"use strict";

// Розділ 15 — керованість.
//
// Метод із методичних вказівок, підрозділ 3.4, друковані с. 26—28, звірені з
// рендером сторінок.
//
// Розділ відповідає на два різні питання. Перше: з якої швидкості кероване
// колесо перестає керувати — воно вже ковзає вбік, і повертати його далі
// марно. Друге: якою є поворотність автомобіля — недостатньою, нейтральною чи
// надлишковою, — і чи не стає вона небезпечною раніше за максимальну швидкість.
export function createHandling({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
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
  const G = 9.81;

  // Кути, при яких джерело велить рахувати криву.
  const STEER_ANGLES_DEG = Object.freeze([5, 10, 15, 20, 25, 30, 35, 40]);
  // Середній кут повороту керованих коліс для радіуса повороту.
  const MEAN_STEER_ANGLE_DEG = 20;
  // Коефіцієнт опору боковому відведенню одного одинарного колеса, Н/град.
  const CORNERING_STIFFNESS = Object.freeze({
    passenger: { min: 500, max: 1000 },
    goods: { min: 800, max: 1500 }
  });
  // Гранична бокова сила, за якої колесо ще котиться без бокового ковзання.
  const LATERAL_FORCE_SHARE = 0.4;
  // V_відв має перевищувати максимальну швидкість на 20…30 %.
  const SLIP_SPEED_MARGIN = Object.freeze({ min: 0.2, max: 0.3 });

  const radians = degrees => degrees * Math.PI / 180;

  // V_кер = √[(√(φ²−f²)/tgθ − f)·g·L·cosθ]
  //
  // Підкореневий вираз стає від'ємним, коли кут завеликий: тоді критичної
  // швидкості не існує — колесо ковзає за будь-якої. Це не «нуль», це
  // відсутність розв'язку, і крива на такому куті обривається.
  function criticalSpeedAtAngle({ adhesion, rollingResistanceF, wheelbaseM,
    steerAngleDeg }) {
    const phi = finiteNumber(adhesion);
    const f = finiteNumber(rollingResistanceF);
    const base = finiteNumber(wheelbaseM);
    const theta = finiteNumber(steerAngleDeg);
    if (phi === null || f === null || base === null || theta === null
      || phi <= 0 || base <= 0 || theta <= 0) {
      return { defined: false, reason: "Потрібні φ, f, колісна база й кут повороту." };
    }
    if (!(phi > f)) {
      return {
        defined: false,
        reason: "Коефіцієнт зчеплення має перевищувати опір коченню: інакше "
          + "колесо не котиться, і про керованість не йдеться."
      };
    }
    const bracket = Math.sqrt(phi * phi - f * f) / Math.tan(radians(theta)) - f;
    if (!(bracket > 0)) {
      return {
        defined: false,
        outOfDomain: true,
        steerAngleDeg: theta,
        reason: `При куті ${theta}° критичної швидкості не існує: бокове `
          + "ковзання керованих коліс настає за будь-якої швидкості."
      };
    }
    return {
      defined: true,
      steerAngleDeg: theta,
      value: Math.sqrt(bracket * G * base * Math.cos(radians(theta)))
    };
  }

  function criticalSpeedCurve({ adhesion, rollingResistanceF, wheelbaseM,
    angles = STEER_ANGLES_DEG }) {
    const points = angles
      .map(steerAngleDeg => criticalSpeedAtAngle({
        adhesion, rollingResistanceF, wheelbaseM, steerAngleDeg
      }))
      .filter(point => point.defined)
      .map(point => ({ steerAngleDeg: point.steerAngleDeg, speedMs: point.value }));
    if (!points.length) {
      return { defined: false, reason: "Жоден із кутів не дає критичної швидкості." };
    }
    return { defined: true, points,
      adhesion: finiteNumber(adhesion),
      rollingResistanceF: finiteNumber(rollingResistanceF),
      wheelbaseM: finiteNumber(wheelbaseM)
    };
  }

  function adoptStiffness({ vehicleType, basis, manualValue }) {
    const range = vehicleType === "goods" || vehicleType === "offRoad"
      ? CORNERING_STIFFNESS.goods
      : CORNERING_STIFFNESS.passenger;
    if (basis === "project-input") {
      const value = finiteNumber(manualValue);
      if (value === null || value <= 0) {
        return { defined: false, reason: "Вибрано власний коефіцієнт, але поле порожнє." };
      }
      return { defined: true, value, method: "project-input", range,
        withinRange: value >= range.min && value <= range.max };
    }
    if (basis !== "source-midpoint") {
      return { defined: false, reason: "Основу прийняття коефіцієнта не вибрано." };
    }
    return { defined: true, value: (range.min + range.max) / 2,
      method: "source-midpoint", range, withinRange: true };
  }

  // δ = P_δ/ΣK_від, де P_δ = 0,4·φ·G — гранична бокова сила без ковзання.
  function slipAngleDeg({ axleWeightN, adhesion, stiffnessPerWheel, wheelCount }) {
    const weight = finiteNumber(axleWeightN);
    const phi = finiteNumber(adhesion);
    const stiffness = finiteNumber(stiffnessPerWheel);
    const wheels = finiteNumber(wheelCount);
    if ([weight, phi, stiffness, wheels].some(value => value === null || value <= 0)) {
      return { defined: false, reason: "Для кута відведення бракує величин." };
    }
    const lateralForceN = LATERAL_FORCE_SHARE * phi * weight;
    const totalStiffness = stiffness * wheels;
    return {
      defined: true,
      value: lateralForceN / totalStiffness,
      lateralForceN,
      totalStiffness
    };
  }

  // R = L/tgθ — жорсткі колеса; R_e = L/(tg(θ−δ₁) + tgδ₂) — еластичні.
  function turnRadii({ wheelbaseM, steerAngleDeg = MEAN_STEER_ANGLE_DEG,
    frontSlipDeg, rearSlipDeg }) {
    const base = finiteNumber(wheelbaseM);
    const theta = finiteNumber(steerAngleDeg);
    const front = finiteNumber(frontSlipDeg);
    const rear = finiteNumber(rearSlipDeg);
    if ([base, theta, front, rear].some(value => value === null)
      || base <= 0 || theta <= 0) {
      return { defined: false, reason: "Потрібні база, кут повороту й кути відведення." };
    }
    const rigid = base / Math.tan(radians(theta));
    const denominator = Math.tan(radians(theta - front)) + Math.tan(radians(rear));
    if (!(denominator > 0)) {
      return {
        defined: false,
        reason: "Кут відведення передніх коліс перевищує кут повороту: за таких "
          + "величин автомобіль уже не повертає в бік, у який його спрямували."
      };
    }
    const elastic = base / denominator;
    // R_e = R — нейтральна, R_e > R — недостатня, R_e < R — надлишкова.
    //
    // Порогу «майже нейтральна» джерело не подає, і вигадувати його не можна:
    // власний допуск у два відсотки вже змусив цей крок сказати «нейтральна»
    // там, де критерій бокового відведення бачив надлишкову. Тому порівняння
    // точне, а НАСКІЛЬКИ далеко від нейтральної — показує відношення.
    const ratio = elastic / rigid;
    const steerCharacter = Math.abs(ratio - 1) < 1e-9
      ? "neutral"
      : (elastic > rigid ? "understeer" : "oversteer");
    return {
      defined: true,
      rigidRadiusM: rigid,
      elasticRadiusM: elastic,
      wheelbaseM: base,
      ratio,
      steerCharacter,
      steerAngleDeg: theta,
      frontSlipDeg: front,
      rearSlipDeg: rear
    };
  }

  // V_відв = √[ gL / (G₂/ΣK_від2 − G₁/ΣK_від1) ] — лише за надлишкової
  // поворотності: при недостатній знаменник недодатний, і швидкості немає.
  function lateralSlipCriticalSpeed({ wheelbaseM, frontWeightN, rearWeightN,
    frontStiffnessTotal, rearStiffnessTotal }) {
    const base = finiteNumber(wheelbaseM);
    const front = finiteNumber(frontWeightN);
    const rear = finiteNumber(rearWeightN);
    const frontK = finiteNumber(frontStiffnessTotal);
    const rearK = finiteNumber(rearStiffnessTotal);
    if ([base, front, rear, frontK, rearK].some(value => value === null || value <= 0)) {
      return { defined: false, reason: "Для критичної швидкості бракує величин." };
    }
    const rearCompliance = rear / rearK;
    const frontCompliance = front / frontK;
    const denominator = rearCompliance - frontCompliance;
    // Load-proportional stiffness gives equal G/K in exact arithmetic. The
    // divisions can differ by a few machine units after independently rounded
    // products, so testing only > 0 can invent a billion-m/s critical speed.
    // This bounds floating-point roundoff at the scale of the two operands;
    // it is not a physical "nearly neutral" handling tolerance.
    const roundoffTolerance = 4 * Number.EPSILON
      * Math.max(Math.abs(rearCompliance), Math.abs(frontCompliance));
    if (!(denominator > roundoffTolerance)) {
      return {
        defined: false,
        neutralOrUndersteer: true,
        wheelbaseM: base, frontWeightN: front, rearWeightN: rear,
        frontStiffnessTotal: frontK, rearStiffnessTotal: rearK,
        denominator,
        roundoffTolerance,
        reason: Math.abs(denominator) <= roundoffTolerance
          ? "Відношення G₂/ΣK_від2 та G₁/ΣK_від1 рівні в межах похибки "
            + "машинної арифметики. За нейтральної поворотності ця модель "
            + "не має скінченної критичної швидкості з умови бокового "
            + "відведення; інші обмеження швидкості залишаються чинними."
          : "Поворотність не надлишкова, тому ця модель не має критичної "
            + "швидкості з умови бокового відведення. Це не скасовує інших "
            + "обмежень керованості та швидкості."
      };
    }
    // Знаменник у Н/(Н/град) = град; кут переводять у радіани.
    return {
      defined: true,
      value: Math.sqrt(G * base / (denominator * Math.PI / 180)),
      denominator,
      wheelbaseM: base,
      frontWeightN: front,
      rearWeightN: rear,
      frontStiffnessTotal: frontK,
      rearStiffnessTotal: rearK
    };
  }

  function slipSpeedStatus({ criticalSpeed, maximumSpeedMs }) {
    if (!criticalSpeed?.defined) {
      return { defined: true, checked: false, reason: criticalSpeed?.reason || "" };
    }
    const maximum = finiteNumber(maximumSpeedMs);
    if (maximum === null || maximum <= 0) {
      return { defined: true, checked: false, reason: "Максимальна швидкість не відома." };
    }
    const margin = criticalSpeed.value / maximum - 1;
    return {
      defined: true,
      checked: true,
      margin,
      maximumSpeedMs: maximum,
      withinLimit: margin >= SLIP_SPEED_MARGIN.min,
      reason: `Критична швидкість ${(criticalSpeed.value * 3.6).toFixed(0)} км/год `
        + `перевищує максимальну на ${(margin * 100).toFixed(0)} %. Джерело `
        + `вимагає ${SLIP_SPEED_MARGIN.min * 100}…${SLIP_SPEED_MARGIN.max * 100} %.`
    };
  }

  function buildCriticalSpeedStep({ curve, texNumber }) {
    const list = curve.points
      .filter((point, index) => index === 0 || index === curve.points.length - 1)
      .map(point => {
        const angle = `${texNumber(point.steerAngleDeg, 2)}^{\\circ}`;
        return `V_{\\text{кер}}(${angle})&=\\sqrt{\\left(`
          + `\\dfrac{\\sqrt{${texNumber(curve.adhesion, 3)}^{2}`
          + `-${texNumber(curve.rollingResistanceF, 3)}^{2}}}`
          + `{\\operatorname{tg}(${angle})}`
          + `-${texNumber(curve.rollingResistanceF, 3)}\\right)`
          + `\\cdot${texNumber(G, 2)}\\cdot${texNumber(curve.wheelbaseM, 3)}`
          + `\\cdot\\cos(${angle})}`
          + `=${texNumber(point.speedMs, 3)}\\ \\text{м/с}\\\\`
          + `&=3{,}6\\cdot${texNumber(point.speedMs, 3)}`
          + `=${texNumber(point.speedMs * 3.6, 2)}\\ \\text{км/год}`;
      })
      .join("\\\\");
    return {
      id: "handling-critical-speed",
      title: "Критична швидкість з умови керованості",
      purpose: "Find the speed above which turning the wheels further stops steering.",
      output: {
        id: "value.handling-critical-speed",
        symbol: "V_{\\text{кер}}",
        label: "Handling critical speed",
        valueType: "list",
        canonicalUnit: null
      },
      expression: "sqrt((sqrt(phi^2 - f^2)/tan(theta) - f) g L cos(theta))",
      dependencies: ["input.wheelbase", "input.rolling-resistance", "decision.adhesion-coefficient"],
      equationNumber: "15.1",
      formulaTex: "V_{\\text{кер}}=\\sqrt{\\left(\\dfrac{\\sqrt{\\varphi^{2}"
        + "-f^{2}}}{\\operatorname{tg}\\theta}-f\\right)gL\\cos\\theta}",
      substitutionTex: `\\begin{aligned}${list}\\end{aligned}`,
      result: {
        value: curve.points.map(point => ({
          steerAngleDeg: point.steerAngleDeg, speedMs: point.speedMs
        })),
        canonicalUnit: null,
        displayUnit: ""
      },
      method: "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        "Вище за цю швидкість керовані колеса ковзають убік, і повертати їх "
        + "далі не змінює напряму руху — саме тому це межа керованості, а не "
        + "просто ще одна швидкість."
      ],
      assumptions: [],
      limitations: curve.points.length < STEER_ANGLES_DEG.length
        ? [`Для частини кутів (${STEER_ANGLES_DEG.length - curve.points.length} з `
          + `${STEER_ANGLES_DEG.length}) розв'язку немає: бокове ковзання настає `
          + "за будь-якої швидкості."]
        : []
    };
  }

  const CHARACTER_LABEL = Object.freeze({
    neutral: "нейтральна", understeer: "недостатня", oversteer: "надлишкова"
  });

  function buildTurnRadiusStep({ radii, texNumber }) {
    return {
      id: "handling-turn-radius",
      title: "Радіус повороту й тип поворотності",
      purpose: "Compare the elastic-wheel radius with the rigid one.",
      output: {
        id: "value.handling-turn-radius",
        symbol: "R_e",
        label: "Elastic turn radius",
        valueType: "quantity",
        canonicalUnit: "m"
      },
      expression: "L / (tan(theta - d1) + tan(d2))",
      dependencies: ["decision.vehicle-type", "decision.handling-cornering-stiffness", "value.axle-forces"],
      equationNumber: "15.2",
      formulaTex: "R_e=\\dfrac{L}{\\operatorname{tg}(\\theta-\\delta_1)"
        + "+\\operatorname{tg}\\delta_2},\\qquad R=\\dfrac{L}"
        + "{\\operatorname{tg}\\theta}",
      substitutionTex: `\\begin{aligned}R_e&=\\dfrac{${texNumber(radii.wheelbaseM, 3)}}`
        + `{\\operatorname{tg}\\left((${texNumber(radii.steerAngleDeg, 2)}`
        + `-${texNumber(radii.frontSlipDeg, 3)})^{\\circ}\\right)`
        + `+\\operatorname{tg}(${texNumber(radii.rearSlipDeg, 3)}^{\\circ})}`
        + `=${texNumber(radii.elasticRadiusM, 3)}\\ \\text{м}\\\\`
        + `R&=\\dfrac{${texNumber(radii.wheelbaseM, 3)}}`
        + `{\\operatorname{tg}(${texNumber(radii.steerAngleDeg, 2)}^{\\circ})}`
        + `=${texNumber(radii.rigidRadiusM, 3)}\\ \\text{м}\\end{aligned}`,
      result: { value: radii.elasticRadiusM, canonicalUnit: "m", displayUnit: "м" },
      method: "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        `Поворотність ${CHARACTER_LABEL[radii.steerCharacter]}: `
        + (radii.steerCharacter === "oversteer"
          ? "R_e менший за R, тобто автомобіль входить у поворот крутіше, ніж "
            + "його спрямували."
          : radii.steerCharacter === "understeer"
            ? "R_e більший за R, тобто автомобіль повертає полого, ніж його "
              + "спрямували."
            : "R_e дорівнює R."),
        `Відношення R_e/R = ${texNumber(radii.ratio, 4)}.`
      ],
      assumptions: [
        `Середній кут повороту керованих коліс θ = ${radii.steerAngleDeg}°, як `
        + "подає джерело."
      ],
      limitations: [
        // Порогу «майже нейтральна» джерело не дає, і вигадувати його не можна.
        "Джерело не подає допуску, за яким поворотність вважають нейтральною, "
        + "тому порівняння точне: наскільки далеко від нейтральної — показує "
        + "відношення R_e/R."
      ]
    };
  }

  function buildSlipSpeedStep({ criticalSpeed, status, texNumber }) {
    if (criticalSpeed?.neutralOrUndersteer) {
      const neutral = Math.abs(criticalSpeed.denominator) <= criticalSpeed.roundoffTolerance;
      return {
        id: "handling-slip-critical-speed",
        title: "Критична швидкість з умови бокового відведення — перевірка застосовності",
        purpose: "Evaluate the denominator without inventing a finite speed for neutral or understeering behaviour.",
        output: { id: "value.handling-slip-critical-speed-assessment", symbol: "V_{\\text{відв}}",
          label: "Lateral slip critical-speed assessment", valueType: "text", canonicalUnit: null },
        expression: "assess(G2/K2 - G1/K1)",
        dependencies: ["input.wheelbase", "value.handling-turn-radius", "value.axle-forces"],
        equationNumber: "15.3",
        formulaTex: "\\Delta=G_2/\\Sigma K_2-G_1/\\Sigma K_1;\\quad V=\\sqrt{gL/(\\Delta\\pi/180)},\\quad \\Delta>0",
        substitutionTex: `\\begin{aligned}\\Delta&=\\frac{${texNumber(criticalSpeed.rearWeightN,2)}}{${texNumber(criticalSpeed.rearStiffnessTotal,2)}}-\\frac{${texNumber(criticalSpeed.frontWeightN,2)}}{${texNumber(criticalSpeed.frontStiffnessTotal,2)}}${neutral ? "\\simeq0" : "="+texNumber(criticalSpeed.denominator,6)+"<0"}\\\\V_{\\text{відв}}&=\\text{немає скінченної межі в цій моделі}\\end{aligned}`,
        result: { value: "Немає скінченної критичної швидкості за цією умовою", canonicalUnit: null, displayUnit: null },
        method: "evaluated-applicability-condition", sourceRefs: SOURCE_REFS,
        readerNotes: [criticalSpeed.reason], assumptions: [],
        limitations: ["Це не необмежена безпечна швидкість: ковзання, перекидання, шини й перехідна динаміка перевіряються окремо."]
      };
    }
    return {
      id: "handling-slip-critical-speed",
      title: "Критична швидкість з умови бокового відведення",
      purpose: "State the speed at which an oversteering car loses stability.",
      output: {
        id: "value.handling-slip-critical-speed",
        symbol: "V_{\\text{відв}}",
        label: "Lateral slip critical speed",
        valueType: "quantity",
        canonicalUnit: "m/s"
      },
      expression: "sqrt(g L / ((G2/K2 - G1/K1) * pi / 180))",
      dependencies: ["input.wheelbase", "value.handling-turn-radius", "value.axle-forces"],
      equationNumber: "15.3",
      formulaTex: "V_{\\text{відв}}=\\sqrt{\\dfrac{gL}"
        + "{\\left(\\dfrac{G_2}{\\sum K_{\\text{від}2}}"
        + "-\\dfrac{G_1}{\\sum K_{\\text{від}1}}\\right)\\dfrac{\\pi}{180}}}",
      substitutionTex: `\\begin{aligned}V_{\\text{відв}}&=\\sqrt{\\dfrac{`
        + `${texNumber(G, 2)}\\cdot${texNumber(criticalSpeed.wheelbaseM, 3)}}`
        + `{\\left(\\dfrac{${texNumber(criticalSpeed.rearWeightN, 1)}}`
        + `{${texNumber(criticalSpeed.rearStiffnessTotal, 1)}}`
        + `-\\dfrac{${texNumber(criticalSpeed.frontWeightN, 1)}}`
        + `{${texNumber(criticalSpeed.frontStiffnessTotal, 1)}}\\right)`
        + `\\dfrac{\\pi}{180}}}`
        + `=${texNumber(criticalSpeed.value, 3)}\\ \\text{м/с}\\\\`
        + `&=3{,}6\\cdot${texNumber(criticalSpeed.value, 3)}`
        + `=${texNumber(criticalSpeed.value * 3.6, 2)}\\ \\text{км/год}\\end{aligned}`,
      result: { value: criticalSpeed.value, canonicalUnit: "m/s", displayUnit: "м/с" },
      method: "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        "Сумарні коефіцієнти опору боковому відведенню тут задано в Н/град. "
        + "Тому різницю G₂/ΣK_від2 − G₁/ΣK_від1, виражену в градусах, "
        + "множать на π/180 для переведення в радіани. Швидкість спочатку "
        + "одержують у м/с, а для км/год множать на 3,6.",
        "Цю швидкість рахують лише для надлишкової поворотності: за недостатньої "
        + "знаменник недодатний, і втрати стійкості з ростом швидкості не настає.",
        ...(status?.checked ? [status.reason] : [])
      ],
      assumptions: [],
      limitations: status?.checked && !status.withinLimit
        ? ["Запас над максимальною швидкістю менший за той, що вимагає джерело."]
        : []
    };
  }

  function decisionsFor({ stiffness, vehicleType }) {
    if (!stiffness?.defined) return [];
    return [{
      id: "decision.handling-cornering-stiffness",
      kind: "Decision",
      choiceRef: null,
      symbol: "K_{\\text{від}}",
      adoptedValue: stiffness.value,
      canonicalUnit: "N/deg",
      method: stiffness.method === "project-input" ? "project-input" : "source-midpoint",
      selectedReferenceId: null,
      recommendedValue: (stiffness.range.min + stiffness.range.max) / 2,
      recommendedSourceRefs: SOURCE_REFS,
      rationale: stiffness.method === "project-input"
        ? `Власне значення автора. Джерело подає ${stiffness.range.min}…`
          + `${stiffness.range.max} Н/град для ${vehicleType === "goods"
            || vehicleType === "offRoad" ? "вантажного" : "легкового"} автомобіля.`
        : `Прийнято середину діапазону ${stiffness.range.min}…${stiffness.range.max} `
          + "Н/град, який джерело подає для цього типу автомобіля.",
      sourceRefs: stiffness.method === "project-input"
        ? ["source.project-input"] : SOURCE_REFS,
      limitations: stiffness.withinRange === false
        ? ["Значення лежить поза діапазоном джерела."] : [],
      manuallyOverridden: stiffness.method === "project-input"
    }];
  }

  function diagnosticsFor({ radii, slipStatus }) {
    const out = [];
    if (radii?.defined && radii.steerCharacter === "oversteer") {
      out.push({
        code: "HANDLING_OVERSTEER",
        severity: "warning",
        message: "Поворотність надлишкова: автомобіль входить у поворот "
          + "крутіше, ніж його спрямували, і з ростом швидкості це посилюється.",
        details: { node: "calc.handling-turn-radius" }
      });
    }
    if (slipStatus?.checked && !slipStatus.withinLimit) {
      out.push({
        code: "HANDLING_SLIP_SPEED_TOO_LOW",
        severity: "warning",
        message: slipStatus.reason,
        details: { node: "calc.handling-slip-critical-speed" }
      });
    }
    return out;
  }

  return Object.freeze({
    SOURCE_REFS,
    STEER_ANGLES_DEG,
    MEAN_STEER_ANGLE_DEG,
    CORNERING_STIFFNESS,
    LATERAL_FORCE_SHARE,
    SLIP_SPEED_MARGIN,
    criticalSpeedAtAngle,
    criticalSpeedCurve,
    adoptStiffness,
    slipAngleDeg,
    turnRadii,
    lateralSlipCriticalSpeed,
    slipSpeedStatus,
    diagnosticsFor,
    buildCriticalSpeedStep,
    buildTurnRadiusStep,
    buildSlipSpeedStep,
    decisionsFor
  });
}
