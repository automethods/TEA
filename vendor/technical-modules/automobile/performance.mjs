"use strict";

// Розділ 5 — тягово-швидкісні властивості.
//
// Метод узято з методичних вказівок, підрозділ 3.1, друковані с. 21—23.
// Звірено зі сканом (`Курсовой проект+.djvu`, аркуші 11 і 12), а не з
// текстовою розшифровкою: та сама розшифровка вже мала три хибні стовпці в
// таблиці 5 і не містила умови зчеплення взагалі.
//
// Ланцюг тут один і той самий: динамічний фактор → прискорення → час і шлях
// розгону. Кожна ланка бере попередню й нічого не вигадує.
export function createPerformance({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;

  const G = 9.81;

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


  // δ = 1,04 + 0,04·u_к² — коефіцієнт урахування обертових мас, с. 21.
  //
  // Він залежить від передаточного числа КОРОБКИ, а не всієї трансмісії: на
  // нижчих передачах маховик і первинний вал обертаються швидше за колеса, і
  // розганяти доводиться не лише автомобіль.
  function rotatingMassFactor(gearboxRatio) {
    const ratio = finiteNumber(gearboxRatio);
    if (!(ratio > 0)) return null;
    return 1.04 + 0.04 * ratio ** 2;
  }

  // D = (P_т − P_w)/G_a, с. 21. Динамічний фактор — це надлишок сили тяги над
  // опором повітря, віднесений до ваги: безрозмірне число, яке можна прямо
  // порівнювати з ψ.
  function dynamicFactor({ tractiveForceN, dragFactorW, speedMs, grossWeightForceN }) {
    const force = finiteNumber(tractiveForceN);
    const drag = finiteNumber(dragFactorW);
    const speed = finiteNumber(speedMs);
    const weight = finiteNumber(grossWeightForceN);
    // Назвати, ЯКОГО числа бракує. Це вже четвертий випадок, коли сюди
    // потрапляв не число, а весь об'єкт результату — фактор обтічності живе в
    // .value.dragFactorW, а не в .value, — і безіменна відмова щоразу
    // виглядала як брак даних, а не як помилка виклику.
    const named = [
      ["сила тяги", tractiveForceN, force],
      ["фактор обтічності W", dragFactorW, drag],
      ["швидкість", speedMs, speed],
      ["сила тяжіння", grossWeightForceN, weight]
    ].find(([, , value]) => !Number.isFinite(value));
    if (named) {
      return {
        defined: false,
        reason: `Динамічний фактор: ${named[0]} має бути числом, отримано ${typeof named[1]}.`
      };
    }
    if (!(weight > 0)) return { defined: false, reason: "Потрібна додатна сила тяжіння." };
    const dragForceN = drag * speed ** 2;
    return {
      defined: true,
      value: (force - dragForceN) / weight,
      dragForceN,
      tractiveForceN: force,
      grossWeightForceN: weight
    };
  }

  // j = (D − ψ)/δ · g, с. 21.
  //
  // Джерело друкує в чисельнику 0,02 і підписує рисунок «при ψ = 0,02»: це
  // умова, для якої побудовано графік, а не стала світу. Тут береться ψ цього
  // проєкту, а друковане значення лишається в примітці кроку.
  function acceleration({ dynamicFactorValue, roadResistancePsi, gearboxRatio }) {
    const factor = finiteNumber(dynamicFactorValue);
    const psi = finiteNumber(roadResistancePsi);
    const delta = rotatingMassFactor(gearboxRatio);
    if (!Number.isFinite(factor) || !Number.isFinite(psi)) {
      return { defined: false, reason: "Потрібні динамічний фактор і опір дороги." };
    }
    if (delta === null) return { defined: false, reason: "Потрібне додатне передаточне число коробки." };
    return {
      defined: true,
      value: (factor - psi) / delta * G,
      rotatingMassFactor: delta,
      // Від'ємне прискорення — не помилка розрахунку, а факт: на цій передачі
      // й цій швидкості автомобіль не розганяється. Ховати знак означало б
      // приховати, що ділянка недосяжна.
      accelerates: factor > psi
    };
  }

  // Найбільший підйом за динамічним фактором: D = f·cosα + sinα.
  //
  // Рівняння розв'язується точно: f·cosα + sinα — це √(1+f²)·sin(α + arctg f),
  // звідки α = arcsin(D/√(1+f²)) − arctg f. Наближення D − f, яким зазвичай
  // користуються, вірне лише для малих кутів; обидва числа подано поряд, щоб
  // на крутому підйомі було видно, наскільки вони розходяться.
  function gradeability({ dynamicFactorValue, rollingResistanceF }) {
    const factor = finiteNumber(dynamicFactorValue);
    const f = finiteNumber(rollingResistanceF);
    if (!Number.isFinite(factor) || !Number.isFinite(f)) {
      return { defined: false, reason: "Потрібні динамічний фактор і коефіцієнт опору коченню." };
    }
    if (factor <= f) {
      return {
        defined: true, climbs: false, gradeRatio: 0, angleRad: 0, approximateGradeRatio: 0,
        reason: "Динамічний фактор не перевищує опору коченню: підйому автомобіль не долає."
      };
    }
    // Точний розв'язок D = f·cosα + sinα відносно α.
    const amplitude = Math.hypot(1, f);
    const phase = Math.atan2(f, 1);
    const ratio = factor / amplitude;
    if (ratio > 1) {
      return {
        defined: true, climbs: true, gradeRatio: Infinity, angleRad: Math.PI / 2,
        approximateGradeRatio: factor - f,
        reason: "Динамічний фактор перевищує межу рівняння: підйом обмежують зчеплення й перекидання, а не тяга."
      };
    }
    const angleRad = Math.asin(ratio) - phase;
    return {
      defined: true,
      climbs: true,
      angleRad,
      gradeRatio: Math.tan(angleRad),
      // Наближення джерела для малих кутів; на 30 % розходження вже помітне.
      approximateGradeRatio: factor - f,
      reason: null
    };
  }

  // Верхня огинаюча прискорень по передачах: на кожній швидкості автомобіль
  // їде на тій передачі, яка дає більше.
  //
  // Швидкості кривих різних передач не збігаються — кожна передача має свої
  // точки, бо будується з тієї самої кривої двигуна через різне передаточне
  // число. Порівняння за точним збігом швидкостей давало майже порожню
  // огинаючу, і час розгону мовчки не рахувався. Тому значення беруть
  // інтерполяцією, як і скрізь у цьому проєкті.
  function accelerationEnvelope(gears) {
    const speeds = [...new Set((gears || []).flatMap(gear =>
      gear.points.map(point => point.speedMs)))].sort((first, second) => first - second);
    return speeds.map(speedMs => {
      let best = null;
      let bestGear = null;
      (gears || []).forEach(gear => {
        const value = interpolateAt(gear.points, speedMs, "accelerationMs2");
        if (value !== null && (best === null || value > best)) {
          best = value;
          bestGear = gear.gear;
        }
      });
      return { speedMs, accelerationMs2: best, gear: bestGear };
    }).filter(point => point.accelerationMs2 !== null);
  }

  function interpolateAt(points, speedMs, key) {
    if (!points || !points.length) return null;
    if (speedMs < points[0].speedMs || speedMs > points[points.length - 1].speedMs) return null;
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      if (speedMs <= current.speedMs) {
        const before = previous[key];
        const after = current[key];
        if (before === null || after === null) return after ?? before ?? null;
        const span = current.speedMs - previous.speedMs;
        if (span <= 0) return after;
        const share = (speedMs - previous.speedMs) / span;
        return before + share * (after - before);
      }
    }
    return points[points.length - 1][key];
  }

  // Δτ_i = 2(V_{i+1} − V_i)/(j_{i+1} + j_i);  ΔS_i = (V_i + V_{i+1})/2 · Δτ_i.
  // Друковані с. 22. Графоаналітичний метод: криву прискорень ділять на
  // інтервали, на яких її можна замінити прямою.
  function accelerationTime(points) {
    const usable = (points || [])
      .filter(point => Number.isFinite(finiteNumber(point.speedMs))
        && Number.isFinite(finiteNumber(point.accelerationMs2)))
      .sort((first, second) => first.speedMs - second.speedMs);
    if (usable.length < 2) {
      return { defined: false, reason: "Потрібні щонайменше дві точки кривої прискорень." };
    }
    // Розгін триває доти, доки прискорення додатне. Перша ж невід'ємна точка
    // закінчує його: далі автомобіль не пришвидшується, і час до наступної
    // швидкості нескінченний, а не великий.
    const intervals = [];
    let totalTime = 0;
    let totalDistance = 0;
    for (let index = 1; index < usable.length; index += 1) {
      const from = usable[index - 1];
      const to = usable[index];
      const sum = finiteNumber(from.accelerationMs2) + finiteNumber(to.accelerationMs2);
      if (!(finiteNumber(from.accelerationMs2) > 0) || !(finiteNumber(to.accelerationMs2) > 0)) {
        return {
          defined: intervals.length > 0,
          intervals,
          totalTimeS: totalTime,
          totalDistanceM: totalDistance,
          reachedSpeedMs: from.speedMs,
          truncated: true,
          reason: `Прискорення зникає на ${(from.speedMs * 3.6).toFixed(0)} км/год: `
            + "далі автомобіль не розганяється на цій передачі."
        };
      }
      const deltaTime = 2 * (finiteNumber(to.speedMs) - finiteNumber(from.speedMs)) / sum;
      const deltaDistance = (finiteNumber(from.speedMs) + finiteNumber(to.speedMs)) / 2 * deltaTime;
      totalTime += deltaTime;
      totalDistance += deltaDistance;
      intervals.push({
        fromSpeedMs: finiteNumber(from.speedMs),
        toSpeedMs: finiteNumber(to.speedMs),
        fromAccelerationMs2: finiteNumber(from.accelerationMs2),
        toAccelerationMs2: finiteNumber(to.accelerationMs2),
        deltaTimeS: deltaTime,
        deltaDistanceM: deltaDistance,
        cumulativeTimeS: totalTime,
        cumulativeDistanceM: totalDistance
      });
    }
    return {
      defined: true,
      intervals,
      totalTimeS: totalTime,
      totalDistanceM: totalDistance,
      reachedSpeedMs: usable[usable.length - 1].speedMs,
      startSpeedMs: usable[0].speedMs,
      truncated: false,
      reason: null
    };
  }

  // Критична швидкість за перекиданням і за ковзанням, підрозділ 3.3, с. 25:
  //   V_пер = √(g·R·(K_ср/2)/h_g);   V_ковз = √(g·R·φ).
  //
  // Саме тут висота центра мас нарешті працює: досі документ її питав і ніде
  // не використовував.
  function corneringLimits({ turnRadiusM, trackWidthM, centreHeightM, adhesionCoefficient }) {
    const radius = finiteNumber(turnRadiusM);
    const track = finiteNumber(trackWidthM);
    const height = finiteNumber(centreHeightM);
    const phi = finiteNumber(adhesionCoefficient);
    if (!(radius > 0)) return { defined: false, reason: "Потрібен додатний радіус повороту." };
    if (!(track > 0)) return { defined: false, reason: "Потрібна додатна колія." };
    if (!(height > 0)) return { defined: false, reason: "Потрібна додатна висота центра мас." };
    if (!(phi > 0)) return { defined: false, reason: "Потрібен додатний коефіцієнт зчеплення." };
    const rolloverMs = Math.sqrt(G * radius * (track / 2) / height);
    const slideMs = Math.sqrt(G * radius * phi);
    return {
      defined: true,
      turnRadiusM: radius,
      trackWidthM: track,
      centreHeightM: height,
      adhesionCoefficient: phi,
      rolloverSpeedMs: rolloverMs,
      slideSpeedMs: slideMs,
      // Порівняння двох меж цієї моделі, а не висновок про безпечність руху.
      limitedBy: slideMs <= rolloverMs ? "slide" : "rollover",
      criticalSpeedMs: Math.min(rolloverMs, slideMs)
    };
  }

  // Серія критичних швидкостей для рисунка 5.5.
  //
  // Методичка прямо просить брати кілька радіусів у межах 20…100 м. Одна
  // точка з поля R потрібна для числової підстановки, але для висновку про
  // стійкість корисна вся залежність: видно, яка межа нижча на всьому
  // діапазоні, а не лише в одній прийнятій точці.
  function corneringCharacteristic({
    radiiM = null, trackWidthM, centreHeightM, adhesionCoefficient
  }) {
    const radii = Array.isArray(radiiM) && radiiM.length
      ? radiiM
      : Array.from({ length: 17 }, (unused, index) => 20 + index * 5);
    const points = [];
    for (const radius of radii) {
      const limits = corneringLimits({
        turnRadiusM: radius,
        trackWidthM,
        centreHeightM,
        adhesionCoefficient
      });
      if (!limits.defined) return { defined: false, reason: limits.reason, points: [] };
      points.push({
        radiusM: finiteNumber(radius),
        rolloverSpeedKmh: limits.rolloverSpeedMs * 3.6,
        slideSpeedKmh: limits.slideSpeedMs * 3.6,
        criticalSpeedKmh: limits.criticalSpeedMs * 3.6,
        limitedBy: limits.limitedBy
      });
    }
    return { defined: true, points };
  }

  // Крок документа: динамічна характеристика по передачах.
  function buildDynamicFactorStep({ gears, forceDependencies = null, texNumber }) {
    const textNumber = (value, digits) => texNumber(value, digits).replaceAll("{,}", ",").replaceAll("\\,", "\u00a0");
    const example = gears.flatMap(gear => (gear.points || []).map(point =>
      ({ ...point, gear: gear.gear }))).find(point => [point.speedMs,
      point.dynamicFactor, point.tractiveForceN, point.dragFactorW,
      point.grossWeightForceN].every(Number.isFinite));
    return {
      id: "dynamic-factor",
      title: "Динамічний фактор автомобіля",
      purpose: "Express the surplus of tractive force over air resistance per unit weight.",
      output: {
        id: "value.dynamic-factor",
        symbol: "D",
        label: "Dynamic factor",
        valueType: "list",
        canonicalUnit: null
      },
      expression: "(P_t - W v^2) / G_a",
      dependencies: [
        "value.gearbox-ladder",
        "value.gross-weight-force",
        "value.drag-factor",
        ...(forceDependencies?.length
          ? forceDependencies
          : ["value.traction-characteristic-engine"])
      ],
      equationNumber: "5.1",
      formulaTex: "D=\\frac{P_{\\mathrm{т}}-P_w}{G_a},\\qquad P_w=W V^2",
      substitutionTex: example
        ? `V=${texNumber(example.speedMs, 3)}\\ \\text{м/с},\\quad `
          + `D_{${example.gear}}=\\frac{${texNumber(example.tractiveForceN, 2)}`
          + `-${texNumber(example.dragFactorW, 4)}\\cdot${texNumber(example.speedMs, 3)}^2}`
          + `{${texNumber(example.grossWeightForceN, 2)}}=${texNumber(example.dynamicFactor, 5)}`
        : "\\text{Числові операнди прикладу не збережено; потрібен перерахунок.}",
      result: {
        // Пік по передачі — це підсумок, а не величина. Рисунок показує дані
        // документа, тому крива має бути ТУТ, а не лише в пам'яті застосунку.
        value: gears.map(gear => ({
          gear: gear.gear,
          peak: gear.peakDynamicFactor,
          points: (gear.points || [])
            .filter(point => Number.isFinite(finiteNumber(point.dynamicFactor)))
            .map(point => ({
              speedMs: finiteNumber(point.speedMs),
              dynamicFactor: finiteNumber(point.dynamicFactor)
            }))
        })),
        canonicalUnit: null,
        displayUnit: ""
      },
      method: "course-methodic-3-1",
      sourceRefs: ["source.method.course"],
      readerNotes: [
        ...(example ? [`Підстановка показує одну точку: передача ${example.gear}, `
          + `V = ${textNumber(example.speedMs * 3.6, 2)} км/год. Повні криві всіх передач наведено на рисунку 5.1; це не їхні максимуми.`] : []),
        "Динамічний фактор безрозмірний, тому його порівнюють просто з ψ: "
        + "де D більший за опір дороги, там автомобіль розганяється."
      ],
      assumptions: [],
      limitations: [
        "Опір повітря взято в нерухомому повітрі; зустрічний вітер сюди не входить."
      ]
    };
  }

  function buildAccelerationStep({ gears, texNumber }) {
    const textNumber = (value, digits) => texNumber(value, digits).replaceAll("{,}", ",").replaceAll("\\,", "\u00a0");
    const example = gears.flatMap(gear => (gear.points || []).map(point =>
      ({ ...point, gear: gear.gear, ratio: gear.ratio }))).find(point =>
      [point.speedMs, point.dynamicFactor, point.roadResistancePsi,
        point.accelerationMs2, point.ratio].every(Number.isFinite));
    const psiValues = gears.flatMap(gear => gear.points)
      .map(point => finiteNumber(point.roadResistancePsi))
      .filter(Number.isFinite);
    const psiMinimum = psiValues.length ? Math.min(...psiValues) : null;
    const psiMaximum = psiValues.length ? Math.max(...psiValues) : null;
    return {
      id: "acceleration",
      title: "Прискорення автомобіля",
      purpose: "Convert the dynamic factor into acceleration for each gear.",
      output: {
        id: "value.acceleration",
        symbol: "j",
        label: "Acceleration",
        valueType: "list",
        canonicalUnit: "m/s2"
      },
      expression: "(D - psi) / delta * g",
      dependencies: [
        "value.dynamic-factor",
        "input.rolling-resistance",
        "input.road-grade",
        "value.gearbox-ladder"
      ],
      equationNumber: "5.2",
      formulaTex: "j=\\frac{D-\\psi}{1{,}04+0{,}04u_{\\mathrm{к}}^2}\\,g",
      substitutionTex: example
        ? `V=${texNumber(example.speedMs, 3)}\\ \\text{м/с},\\quad `
          + `j_{${example.gear}}=\\frac{${texNumber(example.dynamicFactor, 6)}`
          + `-${texNumber(example.roadResistancePsi, 6)}}`
          + `{1{,}04+0{,}04\\cdot${texNumber(example.ratio, 5)}^2}\\cdot9{,}81`
          + `=${texNumber(example.accelerationMs2, 4)}\\ \\text{м/с}^2`
        : "\\text{Числові операнди прикладу не збережено; потрібен перерахунок.}",
      result: {
        value: gears.map(gear => ({
          gear: gear.gear,
          peak: gear.peakAcceleration,
          points: (gear.points || [])
            .filter(point => Number.isFinite(finiteNumber(point.accelerationMs2)))
            .map(point => ({
              speedMs: finiteNumber(point.speedMs),
              accelerationMs2: finiteNumber(point.accelerationMs2)
            }))
        })),
        canonicalUnit: "m/s2",
        displayUnit: "м/с²"
      },
      method: "course-methodic-3-1",
      sourceRefs: ["source.method.course"],
      readerNotes: [
        ...(example ? [`Підстановка показує одну точку передачі ${example.gear} при `
          + `${textNumber(example.speedMs * 3.6, 2)} км/год; повна залежність j(V) по передачах наведена на рисунку 5.2.`] : []),
        // Джерело друкує в чисельнику 0,02 і підписує рисунок «при ψ = 0,02».
        // Це умова побудови графіка, а не стала, і підміняти нею ψ проєкту
        // означало б рахувати чужу дорогу.
        Number.isFinite(psiMinimum) && Number.isFinite(psiMaximum)
          ? `Опір дороги перераховано в кожній точці за її швидкістю: ψ = `
            + `${textNumber(psiMinimum, 3)}…${textNumber(psiMaximum, 3)}. `
            + "Джерело друкує 0,02 як умову власного графіка, а не сталу величину."
          : "Опір дороги перераховано в кожній точці за її швидкістю; 0,02 у джерелі — "
            + "умова його графіка, а не стала величина.",
        "Знаменник 1,04 + 0,04u_к² враховує обертові маси: на нижчих передачах "
        + "маховик обертається швидше за колеса, і розганяти доводиться не лише автомобіль."
      ],
      assumptions: [],
      limitations: [
        "Перемикання передач вважається миттєвим: часу на розрив потоку потужності не враховано."
      ]
    };
  }

  // Розгінна характеристика — τ(V) і S(V).
  //
  // Рівняння (5.3) друкує ДВА вирази й дає два результати: підсумковий час
  // розгону (скаляр, крок нижче) і саму криву. Крок часу лишається скаляром —
  // його читають інші розділи, — а крива живе окремо, бо саме її показує
  // рисунок, і без неї рисунок малював би те, чого в документі немає.
  function intervalSumTex(intervals, key, texNumber, digits) {
    const terms = intervals.map(interval => texNumber(interval[key], digits));
    return terms.length <= 4 ? terms.join("+")
      : `${terms[0]}+${terms[1]}+\\ldots+${terms.at(-1)}`;
  }

  function buildAccelerationRunStep({ result, texNumber }) {
    const textNumber = (value, digits) => texNumber(value, digits).replaceAll("{,}", ",").replaceAll("\\,", "\u00a0");
    if (!result?.defined || !result.intervals?.length) return null;
    // Крива починається там, де починається розгін: нуль часу й нуль шляху.
    const points = [
      {
        speedMs: result.intervals[0].fromSpeedMs,
        timeS: 0,
        distanceM: 0
      },
      ...result.intervals.map(interval => ({
        speedMs: interval.toSpeedMs,
        timeS: interval.cumulativeTimeS,
        distanceM: interval.cumulativeDistanceM
      }))
    ];
    return {
      id: "acceleration-run",
      title: "Розгінна характеристика",
      purpose: "Show how time and distance accumulate as the vehicle gains speed.",
      output: {
        id: "value.acceleration-run",
        symbol: "\\tau, S",
        label: "Acceleration run",
        valueType: "list",
        canonicalUnit: null
      },
      expression: "cumulative sum of (5.3)",
      dependencies: ["value.acceleration"],
      // Власного номера немає СВІДОМО: це не нове рівняння, а наростаючий
      // підсумок (5.3), і його підстановка — сам рисунок. Оголосити номер
      // означало б пообіцяти окремий рядок підстановки, якого тут не буде.
      equationNumber: null,
      formulaTex: "\\tau(V)=\\sum\\Delta\\tau_i,\\qquad S(V)=\\sum\\Delta S_i",
      substitutionTex: `\\begin{aligned}\\tau&=${intervalSumTex(result.intervals, "deltaTimeS", texNumber, 4)}`
        + `=${texNumber(result.totalTimeS, 3)}\\ \\text{с}\\\\ `
        + `S&=${intervalSumTex(result.intervals, "deltaDistanceM", texNumber, 3)}`
        + `=${texNumber(result.totalDistanceM, 2)}\\ \\text{м}\\end{aligned}`,
      result: { value: points, canonicalUnit: null, displayUnit: "" },
      method: "course-methodic-3-1-graphoanalytic",
      sourceRefs: ["source.method.course"],
      readerNotes: [
        "Та сама рівність (5.3), що дає підсумковий час: тут її суми показано "
        + "наростаючим підсумком, щоб було видно, де розгін уповільнюється.",
        ...(result.truncated
          ? [`Крива обривається на ${textNumber(result.reachedSpeedMs * 3.6, 0)} `
            + "км/год: далі прискорення зникає."]
          : [])
      ],
      assumptions: [],
      limitations: [
        "Графоаналітичний метод: на кожному інтервалі криву прискорень "
        + "замінено прямою, тому згущення точок уточнює результат."
      ]
    };
  }

  function buildAccelerationTimeStep({ result, texNumber }) {
    const textNumber = (value, digits) => texNumber(value, digits).replaceAll("{,}", ",").replaceAll("\\,", "\u00a0");
    const first = result.intervals?.[0];
    const last = result.intervals?.at(-1);
    const sample = first && [first.fromAccelerationMs2, first.toAccelerationMs2].every(Number.isFinite)
      ? `\\Delta\\tau_1&=\\frac{2(${texNumber(first.toSpeedMs, 4)}-${texNumber(first.fromSpeedMs, 4)})}`
        + `{${texNumber(first.toAccelerationMs2, 5)}+${texNumber(first.fromAccelerationMs2, 5)}}`
        + `=${texNumber(first.deltaTimeS, 4)}\\ \\text{с}\\\\ `
        + `\\Delta S_1&=\\frac{${texNumber(first.fromSpeedMs, 4)}+${texNumber(first.toSpeedMs, 4)}}{2}`
        + `\\cdot${texNumber(first.deltaTimeS, 4)}=${texNumber(first.deltaDistanceM, 3)}\\ \\text{м}\\\\ `
      : "";
    return {
      id: "acceleration-time",
      title: "Час і шлях розгону",
      purpose: "Integrate the acceleration curve into time and distance.",
      output: {
        id: "value.acceleration-time",
        symbol: "\\tau",
        label: "Acceleration time",
        valueType: "quantity",
        canonicalUnit: "s"
      },
      expression: "sum 2 (v2 - v1) / (j2 + j1)",
      dependencies: ["value.acceleration"],
      equationNumber: "5.3",
      formulaTex: "\\Delta\\tau_i=\\frac{2(V_{i+1}-V_i)}{j_{i+1}+j_i},\\qquad "
        + "\\Delta S_i=\\frac{V_i+V_{i+1}}{2}\\Delta\\tau_i",
      substitutionTex: `\\begin{aligned}${sample}\\tau&=`
        + `${intervalSumTex(result.intervals || [], "deltaTimeS", texNumber, 4)}`
        + `=${texNumber(result.totalTimeS, 3)}\\ \\text{с}\\\\ `
        + `S&=${intervalSumTex(result.intervals || [], "deltaDistanceM", texNumber, 3)}`
        + `=${texNumber(result.totalDistanceM, 2)}\\ \\text{м}\\end{aligned}`,
      result: { value: result.totalTimeS, canonicalUnit: "s", displayUnit: "с" },
      method: "course-methodic-3-1-graphoanalytic",
      sourceRefs: ["source.method.course"],
      readerNotes: [
        ...(first && last ? [`Показано арифметику першого інтервалу з ${result.intervals.length} і підсумкові суми. `
          + `Розгін інтегрується від ${textNumber(first.fromSpeedMs * 3.6, 2)} до `
          + `${textNumber(last.toSpeedMs * 3.6, 2)} км/год; його накопичені час і шлях наведено на рисунку 5.3. `
          + "Нуль часу відповідає першій синхронній швидкості, а не нерухомому автомобілю."] : []),
        result.truncated
          ? `Розгін обривається на ${textNumber(result.reachedSpeedMs * 3.6, 0)} км/год: `
            + "далі прискорення зникає, і часу до більшої швидкості не існує."
          : `Розгін доведено до ${textNumber(result.reachedSpeedMs * 3.6, 0)} км/год.`
      ],
      assumptions: [
        "Криву прискорень замінено прямими на кожному інтервалі — графоаналітичний метод джерела."
      ],
      limitations: [
        "Часу на перемикання передач не враховано, тому справжній розгін довший."
      ]
    };
  }

  function buildCorneringStep({ limits, turnRadiusM, texNumber }) {
    const textNumber = (value, digits) => texNumber(value, digits).replaceAll("{,}", ",").replaceAll("\\,", "\u00a0");
    return {
      id: "cornering-limits",
      title: "Критична швидкість на повороті",
      purpose: "Bound the cornering speed by rollover and by sliding.",
      output: {
        id: "value.cornering-limit",
        symbol: "V_{\\mathrm{кр}}",
        label: "Critical cornering speed",
        valueType: "quantity",
        canonicalUnit: "m/s"
      },
      expression: "min(sqrt(g R B / (2 h)), sqrt(g R phi))",
      dependencies: [
        "input.turn-radius",
        "input.track-width",
        "input.centre-height",
        "decision.adhesion-coefficient"
      ],
      equationNumber: "5.6",
      formulaTex: "V_{\\mathrm{пер}}=\\sqrt{\\frac{gRK_{\\mathrm{ср}}}{2h_g}},\\qquad "
        + "V_{\\mathrm{ковз}}=\\sqrt{gR\\varphi},\\qquad V_{\\mathrm{кр}}=\\min(V_{\\mathrm{пер}},V_{\\mathrm{ковз}})",
      substitutionTex: `\\begin{aligned}V_{\\mathrm{пер}}&=\\sqrt{\\frac{9{,}81\\cdot${texNumber(limits.turnRadiusM ?? turnRadiusM, 2)}`
        + `\\cdot${texNumber(limits.trackWidthM, 3)}}{2\\cdot${texNumber(limits.centreHeightM, 3)}}}`
        + `=${texNumber(limits.rolloverSpeedMs, 3)}\\ \\text{м/с}\\\\ `
        + `V_{\\mathrm{ковз}}&=\\sqrt{9{,}81\\cdot${texNumber(limits.turnRadiusM ?? turnRadiusM, 2)}`
        + `\\cdot${texNumber(limits.adhesionCoefficient, 3)}}=${texNumber(limits.slideSpeedMs, 3)}\\ \\text{м/с}\\\\ `
        + `V_{\\mathrm{кр}}&=\\min(${texNumber(limits.rolloverSpeedMs, 3)},${texNumber(limits.slideSpeedMs, 3)})`
        + `=${texNumber(limits.criticalSpeedMs, 3)}\\ \\text{м/с}`
        + `\\quad (3{,}6\\cdot${texNumber(limits.criticalSpeedMs, 3)}=${texNumber(limits.criticalSpeedMs * 3.6, 2)}\\ \\text{км/год})\\end{aligned}`,
      result: {
        value: limits.criticalSpeedMs, canonicalUnit: "m/s", displayUnit: "м/с"
      },
      method: "course-methodic-3-3",
      sourceRefs: ["source.method.course"],
      readerNotes: [
        limits.limitedBy === "slide"
          ? `За цією моделлю нижча межа ковзання (${textNumber(limits.slideSpeedMs * 3.6, 1)} км/год проти `
            + `${textNumber(limits.rolloverSpeedMs * 3.6, 1)} км/год за перекиданням).`
          : `За цією моделлю нижча межа перекидання (${textNumber(limits.rolloverSpeedMs * 3.6, 1)} км/год проти `
            + `${textNumber(limits.slideSpeedMs * 3.6, 1)} км/год за ковзанням).`,
        "Це порівняння квазістатичних меж, а не безпечна швидкість руху. "
          + "Наслідки ковзання, перехідні режими, крен підвіски та взаємодію з перешкодами тут не оцінено."
      ],
      assumptions: [
        "Поворот на горизонтальному полотні: віражу й ухилу не враховано."
      ],
      limitations: [
        "Автомобіль узято твердим тілом: крен підвіски зміщує перекидання на нижчу швидкість.",
        "Коефіцієнт зчеплення сталий: залежності від ковзання ця модель не описує."
      ]
    };
  }

  return Object.freeze({
    buildCorneringStep,
    buildDynamicFactorStep,
    buildAccelerationStep,
    buildAccelerationTimeStep,
    buildAccelerationRunStep,
    G,
    accelerationEnvelope,
    rotatingMassFactor,
    dynamicFactor,
    acceleration,
    gradeability,
    accelerationTime,
    corneringLimits,
    corneringCharacteristic
  });
}
