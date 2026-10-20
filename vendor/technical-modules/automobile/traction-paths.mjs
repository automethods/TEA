"use strict";

// Розділ 4.5 — від характеристики джерела до сили тяги на колесах.
//
// Три різні речі, які досі змішувалися в одну:
//
//   джерело   — характеристика машини та основа її паспортних значень;
//   шлях      — як момент цього джерела доходить до конкретної осі:
//               передаточне число, ККД, частка джерела, віддана цьому шляху;
//   стратегія — чи можна складати сили кількох джерел і в якій частці.
//
// Розділення потрібне не для краси. Один двигун може вести дві осі — тоді в
// нього два шляхи й одна характеристика, а не дві. І навпаки: два різні
// двигуни на одній осі — це два джерела й два шляхи. Досі розрахунок частоти
// обертання давав передній і задній осі власні передаточні числа, ніде не
// сказавши, чи це одна машина, чи дві.
export function createTractionPaths({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;

  // Одна перевірка числа на весь проєкт: Number() приймає null, true й "" і
  // мовчки робить із них 0 та 1, а Number.isFinite їх пропускає.
  const { finiteNumber, plainNumber } = (function loadNumeric() {
    const scope = typeof window === "object" ? window : globalThis;
    if (!scope.VehicleNumeric && typeof module === "object" && module.exports) {
      require("./numeric.js");
    }
    return scope.VehicleNumeric;
  })();


  // Механічне з'єднання за Ehsani, §6.2.2, с. 119. Підтримуються ті схеми, для
  // яких джерело подає рівняння: роздільні осі та явне моментне з'єднання.
  // Швидкісне з'єднання потребує окремої схеми. Для планетарного power-split
  // нижче реалізовано рівняння Вілліса для прийнятої схеми: ДВЗ — водило,
  // тяговий мотор і вихід — коронна шестерня, генератор — сонячна.
  const TOPOLOGIES = Object.freeze({
    "separated-axles": {
      label: "Роздільні осі: кожне джерело веде свою вісь",
      combinable: true,
      note: "Сили складаються на рівні коліс, бо осі механічно не пов'язані."
    },
    "torque-coupled": {
      label: "Моментне з'єднання: джерела зведені в один привод",
      combinable: true,
      note: "Моменти складаються в муфті (Ehsani, рівн. (6.2)—(6.3))."
    },
    "speed-coupled": {
      label: "Швидкісне з'єднання",
      combinable: false,
      note: "Швидкісне з'єднання задає зв'язок частот, якого ця модель не описує."
    },
    "planetary-series-parallel": {
      label: "Планетарне (послідовно-паралельне) з'єднання",
      combinable: true,
      note: "Кінематика перевіряється рівнянням Вілліса; ДВЗ з'єднано з водилом, генератор — із сонячною, вихід і тяговий мотор — з коронною шестернею."
    }
  });

  // Лише опис стратегій. Числа дає resolveUtilization і тільки він: доки тут
  // жила друга реалізація, вона мовчки перетворювала пропущений множник на нуль,
  // тобто прибирала машину з розрахунку там, де перевірка відмовляла.
  const STRATEGIES = Object.freeze({
    "simultaneous-full-load-upper-envelope": {
      label: "Одночасна повнопотокова верхня огинаюча",
      // Це межа можливостей, а не робота регулятора: жодне джерело не каже, що
      // обидві машини завжди виведені на повне навантаження.
      requiresFactors: false
    },
    "declared-utilization": {
      label: "Оголошений ступінь використання",
      requiresFactors: true
    }
  });

  // Межі огинаючої залежать від того, які машини в ній беруть участь: писати
  // «не враховано стану заряду батареї» для бензинового автомобіля означає
  // засмічувати примітку тим, чого в ньому немає, і привчати її не читати.
  const COMMON_ENVELOPE_LIMITATIONS = Object.freeze([
    "Не враховано теплового зниження потужності.",
    "Не враховано спільних обмежень коробки передач.",
    "Не враховано зчеплення коліс із дорогою: це межа джерел, а не межа руху."
  ]);
  const ELECTRIC_ENVELOPE_LIMITATIONS = Object.freeze([
    "Не враховано стану заряду батареї.",
    "Не враховано обмежень батареї та інвертора."
  ]);

  // За РОДОМ машини, а не за збігом ідентифікатора: коли джерела назвуть
  // motor.front і motor.rear, порівняння з рядком «motor» тихо втратило б
  // електричні застереження.
  // Кілька шляхів від одного джерела — це одна машина, поділена між осями, а
  // не кілька машин. Різниця не косметична: два незалежні двигуни по 110 кВт
  // дають удвічі більше, ніж один поділений навпіл, і схема «роздільні осі»
  // сама по собі каже «кожне джерело веде свою вісь» — неправду там, де одне
  // джерело веде дві. Модель має одну криву на джерело, тому інакше описати
  // два різні двигуни вона не може, і мовчати про це не має права.
  function sharedSourceLimitations(paths) {
    const bySource = new Map();
    paths.forEach(path => {
      bySource.set(path.sourceId, (bySource.get(path.sourceId) || 0) + 1);
    });
    return [...bySource.entries()]
      .filter(([, count]) => count > 1)
      .map(([sourceId, count]) =>
        `Джерело «${sourceId}» веде ${count} осі як одна машина: сила ділиться `
        + "між ними прийнятою часткою, а не подвоюється. Дві незалежні машини "
        + "з різними характеристиками ця модель не описує — для них потрібні "
        + "окремі джерела зі своїми кривими.");
  }

  function envelopeLimitations(sources) {
    const electric = sources.some(source => (source.kind || source.id) === "motor"
      || String(source.kind || source.id).startsWith("motor"));
    return [
      ...COMMON_ENVELOPE_LIMITATIONS,
      ...(electric ? ELECTRIC_ENVELOPE_LIMITATIONS : [])
    ];
  }

  // Точка характеристики — у координатах дороги. v = ω·r/i; F = T·i·η·u/r.
  //
  // Частку джерела бере САМЕ ЗВІДСИ, з опису шляху. Доти, доки її можна було
  // задати і в кривій, і в шляху, перевірка сумувала одні числа, а сила
  // рахувалася за іншими: два шляхи по 0,5 з кривими, побудованими на 1,0,
  // проходили перевірку й давали подвійну силу.
  function pathCurve({ curve, reductionRatio, efficiency, dynamicRadiusM, allocation = 1 }) {
    const ratio = finiteNumber(reductionRatio);
    const eta = finiteNumber(efficiency);
    const radius = finiteNumber(dynamicRadiusM);
    const share = finiteNumber(allocation);
    if (!curve || !curve.defined) {
      return { defined: false, reason: curve?.reason || "Характеристика джерела не побудована." };
    }
    if (!(ratio > 0)) return { defined: false, reason: "Передаточне число має бути додатним." };
    if (!(eta > 0 && eta <= 1)) return { defined: false, reason: "ККД має лежати в межах (0; 1]." };
    if (!(radius > 0)) return { defined: false, reason: "Динамічний радіус має бути додатним." };
    if (!(share > 0 && share <= 1)) return { defined: false, reason: "Частка джерела має лежати в межах (0; 1]." };
    if (!Array.isArray(curve.points) || !curve.points.length
      || curve.points.some(point => !Number.isFinite(finiteNumber(point.angularSpeed)) || finiteNumber(point.angularSpeed) < 0
        || !Number.isFinite(finiteNumber(point.torqueNm)))) {
      return { defined: false, reason: "Крива має містити скінченні точки моменту та невід'ємної частоти." };
    }

    const points = curve.points
      .map(point => ({
        speedMs: point.angularSpeed * radius / ratio,
        forceN: point.torqueNm * ratio * eta * share / radius,
        angularSpeed: point.angularSpeed,
        torqueNm: point.torqueNm
      }))
      .sort((a, b) => a.speedMs - b.speedMs);

    return {
      defined: true,
      points,
      speedRange: { from: points[0].speedMs, to: points[points.length - 1].speedMs },
      reductionRatio: ratio,
      efficiency: eta,
      allocation: share,
      dynamicRadiusM: radius
    };
  }

  // Структурні перевірки. Кожна з них закриває випадок, у якому крива
  // виходила правдоподібною і неправильною.
  function validateStructure({ sources, axles, paths, topology }) {
    const problems = [];
    const byId = new Map(sources.map(source => [source.id, source]));
    const axleById = new Map(axles.map(axle => [axle.id, axle]));

    // Дублікати ідентифікаторів мовчки перемагали: Map лишав останній запис, і
    // два джерела з однією назвою давали дійсний результат за другим із них.
    [["Джерело", sources], ["Шлях", paths], ["Вісь", axles]].forEach(([kind, items]) => {
      const seen = new Set();
      items.forEach(item => {
        if (seen.has(item.id)) problems.push(`${kind} ${item.id} оголошено двічі.`);
        seen.add(item.id);
      });
    });

    const allocation = new Map();
    const kinematics = new Map();
    const axleUse = new Map();
    const drivenSets = [];
    const groups = [];

    paths.forEach(path => {
      const name = path.id || "?";
      if (!path.sourceId) problems.push(`Шлях ${name} не вказує джерела.`);
      else if (!byId.has(path.sourceId)) problems.push(`Шлях ${name} посилається на невідоме джерело ${path.sourceId}.`);
      if (!path.axle) problems.push(`Шлях ${name} не вказує осі.`);
      else if (!axleById.has(path.axle)) problems.push(`Шлях ${name} посилається на невідому вісь ${path.axle}.`);

      // path.axle лише називає запис радіуса. Фізичний вихід шляху — повний
      // axleNumbers: один шлях ДВЗ може вести [1, 2], і тоді задній мотор уже
      // не є «окремою віссю», хоч власником радіуса шляху ДВЗ записано front.
      const driven = [...new Set(Array.isArray(path.axleNumbers) ? path.axleNumbers : [])]
        .sort((first, second) => first - second);
      if (!driven.length || driven.some(number => !Number.isInteger(number) || number < 1)) {
        problems.push(`Шлях ${name} має назвати ведучі осі додатними цілими номерами.`);
      }
      driven.forEach(number => axleUse.set(number, (axleUse.get(number) || 0) + 1));
      drivenSets.push({ name, key: driven.join(","), numbers: driven });

      const share = finiteNumber(path.allocation ?? 1);
      if (!(share > 0 && share <= 1)) problems.push(`Шлях ${name}: частка джерела має лежати в межах (0; 1].`);
      allocation.set(path.sourceId, (allocation.get(path.sourceId) || 0) + share);

      // Одна машина не може одночасно обертатися з двома частотами. Але
      // порівнювати треба саме те, що задає частоту, — відношення i/r_д, а не
      // пару чисел: 9/0,30 і 9,3/0,31 — це та сама кінематика.
      const axle = axleById.get(path.axle);
      const radius = axle ? finiteNumber(axle.dynamicRadiusM) : NaN;
      const ratio = finiteNumber(path.reductionRatio);
      if (axle && !(radius > 0)) problems.push(`Вісь ${path.axle}: динамічний радіус має бути додатним.`);
      if (Number.isFinite(ratio) && Number.isFinite(radius) && radius > 0) {
        const kinematic = ratio / radius;
        const seen = kinematics.get(path.sourceId);
        if (seen !== undefined && Math.abs(seen - kinematic) > Math.max(1e-9, 1e-6 * Math.abs(seen))) {
          problems.push(
            `Джерело ${path.sourceId} має шляхи з різною кінематикою (i/r_д = `
            + `${seen.toFixed(3)} і ${kinematic.toFixed(3)} м⁻¹): одна машина не може обертатися `
            + "з двома частотами на одній швидкості. Для розподілу моменту між осями потрібна "
            + "явна модель диференціала або муфти.");
        }
        kinematics.set(path.sourceId, kinematic);
      }

      groups.push(path.couplingGroup || null);
    });

    allocation.forEach((total, sourceId) => {
      if (total > 1 + 1e-9) {
        problems.push(
          `Джерело ${sourceId} віддає ${total.toFixed(2)} своєї сили — одна машина `
          + "не може бути витрачена більше ніж повністю.");
      }
    });

    if (topology === "separated-axles") {
      axleUse.forEach((count, axle) => {
        if (count > 1) {
          problems.push(
            `Схема «роздільні осі», але на вісь ${axle} припадає ${count} шляхи: `
            + "два джерела на одній осі — це моментне з'єднання, а не роздільні осі.");
        }
      });
    }
    if (topology === "torque-coupled") {
      if (new Set(drivenSets.map(item => item.key)).size > 1) {
        problems.push(
          "Моментне з'єднання має спільний вихід, тому всі шляхи мають вести "
          + "на однаковий набір ведучих осей.");
      }
      // Кожен шлях мусить назвати ту саму непорожню групу: раніше шлях без
      // групи не збільшував множини, і пара «c1 + нічого» проходила.
      if (groups.some(group => !group) || new Set(groups).size !== 1) {
        problems.push("Моментне з'єднання потребує, щоб кожен шлях назвав ту саму спільну групу (couplingGroup).");
      }
    }
    if (topology === "planetary-series-parallel"
        && new Set(drivenSets.map(item => item.key)).size > 1) {
      problems.push(
        "Планетарне з'єднання має один вихід на коронній шестерні, тому шляхи "
        + "ДВЗ і тягового мотора мають вести на однаковий набір осей.");
    }
    return problems;
  }

  // Ступінь використання. Для оголошеної стратегії кожне джерело, що бере
  // участь, мусить мати явне число в [0; 1]: мовчазне 0 замість пропущеного
  // множника прибирало машину з розрахунку, а 1,7, тихо зведене до одиниці,
  // видавало помилку автора за прийняте рішення.
  function resolveUtilization(strategy, sourceIds, factors) {
    if (strategy === "simultaneous-full-load-upper-envelope") {
      return { factors: new Map(sourceIds.map(id => [id, 1])), problems: [] };
    }
    const problems = [];
    const resolved = new Map();
    sourceIds.forEach(id => {
      const raw = factors?.[id];
      if (raw === undefined || raw === null || raw === "") {
        problems.push(`Для джерела ${id} не задано ступеня використання.`);
        return;
      }
      const value = finiteNumber(raw);
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        problems.push(`Ступінь використання джерела ${id} має бути числом у межах [0; 1]; задано ${raw}.`);
        return;
      }
      resolved.set(id, value);
    });
    return { factors: resolved, problems };
  }

  function planetaryKinematics({ points, paths, axles, parameters }) {
    const sunTeeth = finiteNumber(parameters?.sunTeeth);
    const ringTeeth = finiteNumber(parameters?.ringTeeth);
    const generatorMaximumRpm = finiteNumber(parameters?.generatorMaximumRpm);
    if (!Number.isInteger(sunTeeth) || sunTeeth <= 0
        || !Number.isInteger(ringTeeth) || ringTeeth <= sunTeeth) {
      return { defined: false, reason: "Для планетарного ряду задайте додатні цілі числа зубів, причому z_r > z_s." };
    }
    if (!(generatorMaximumRpm > 0)) {
      return { defined: false, reason: "Для планетарного ряду задайте допустиму максимальну частоту генератора." };
    }
    const enginePaths = paths.filter(path => path.sourceId === "engine");
    const motorPaths = paths.filter(path => path.sourceId === "motor");
    if (!enginePaths.length || !motorPaths.length) {
      return { defined: false, reason: "Планетарна схема потребує тягових шляхів ДВЗ і електромотора." };
    }
    const axleById = new Map(axles.map(axle => [axle.id, axle]));
    const angularSpeed = (path, speedMs) =>
      speedMs * finiteNumber(path.reductionRatio) /
      finiteNumber(axleById.get(path.axle)?.dynamicRadiusM);
    const samples = points.map(point => {
      const carrierRadS = angularSpeed(enginePaths[0], point.speedMs);
      const ringRadS = angularSpeed(motorPaths[0], point.speedMs);
      // z_s*ω_s + z_r*ω_r = (z_s+z_r)*ω_c.
      const sunRadS = ((sunTeeth + ringTeeth) * carrierRadS
        - ringTeeth * ringRadS) / sunTeeth;
      return {
        speedMs: point.speedMs,
        carrierRadS,
        ringRadS,
        sunRadS,
        generatorRpm: sunRadS * 30 / Math.PI
      };
    });
    const maximumGeneratorRpm = Math.max(...samples.map(item => Math.abs(item.generatorRpm)));
    if (maximumGeneratorRpm > generatorMaximumRpm + 1e-6) {
      return {
        defined: false,
        reason: `Розрахункова частота генератора ${maximumGeneratorRpm.toFixed(0)} об/хв перевищує прийняті ${generatorMaximumRpm.toFixed(0)} об/хв.`,
        sunTeeth, ringTeeth, samples, maximumGeneratorRpm, generatorMaximumAllowedRpm: generatorMaximumRpm
      };
    }
    return {
      defined: true, sunTeeth, ringTeeth, samples,
      maximumGeneratorRpm, generatorMaximumAllowedRpm: generatorMaximumRpm,
      equation: "z_s*omega_s + z_r*omega_r = (z_s+z_r)*omega_c"
    };
  }

  // Present one already evaluated Willis sample; this function neither
  // evaluates a second planetary model nor creates a synthetic trace.
  function planetaryPresentation(result, texNumber) {
    const sample = result?.samples?.find(item =>
      Math.abs(item.generatorRpm) === result.maximumGeneratorRpm);
    if (!sample || !(result.sunTeeth > 0 && result.ringTeeth > result.sunTeeth)) return null;
    return {
      substitutionTex: `\\begin{aligned}\\omega_s&=\\frac{(z_s+z_r)\\omega_c-z_r\\omega_r}{z_s}`
        + `=\\frac{(${result.sunTeeth}+${result.ringTeeth})\\cdot(${texNumber(sample.carrierRadS, 3)})`
        + `-${result.ringTeeth}\\cdot(${texNumber(sample.ringRadS, 3)})}{${result.sunTeeth}}`
        + `=${texNumber(sample.sunRadS, 3)}\\;\\text{рад/с},\\\\[4pt]`
        + `n_s&=\\frac{30\\omega_s}{\\pi}=\\frac{30\\cdot(${texNumber(sample.sunRadS, 3)})}{\\pi}`
        + `=${texNumber(sample.generatorRpm, 1)}\\;\\text{об/хв}\\end{aligned}`,
      speedMs: sample.speedMs,
      maximumGeneratorRpm: result.maximumGeneratorRpm,
      generatorMaximumAllowedRpm: result.generatorMaximumAllowedRpm,
      defined: result.defined,
      reason: result.reason || null
    };
  }

  // Сила тяги за прийнятою стратегією.
  //
  // Джерело — єдиний власник кривої та відповіді на питання, чи веде воно
  // колеса. Шлях — єдиний власник частки, передаточного числа й ККД. Доти,
  // доки крива могла нести власну частку, перевірка й розрахунок брали різні
  // числа.
  function combine({
    sources, axles, paths, topology, strategy, utilizationFactors, planetary,
    pointCount = 24
  }) {
    const scheme = TOPOLOGIES[topology];
    if (!scheme) return { defined: false, reason: "Схему з'єднання не задано." };
    if (!scheme.combinable) return { defined: false, reason: scheme.note, topology, unsupported: true };
    if (!STRATEGIES[strategy]) return { defined: false, reason: "Стратегію не задано." };
    if (!Number.isInteger(pointCount) || pointCount < 2) {
      return { defined: false, reason: "Кількість точок має бути цілою і не меншою за дві." };
    }
    if (!Array.isArray(sources) || !sources.length) return { defined: false, reason: "Джерел не задано." };
    if (!Array.isArray(axles) || !axles.length) return { defined: false, reason: "Осей не задано." };
    if (!Array.isArray(paths) || !paths.length) return { defined: false, reason: "Шляхів не задано." };

    const structural = validateStructure({ sources, axles, paths, topology });
    if (structural.length) return { defined: false, reason: structural[0], problems: structural };

    const byId = new Map(sources.map(source => [source.id, source]));
    // Радіус належить осі, а не шляху: шлях його читає, але не перевизначає.
    // Доти, доки шлях міг подати власний, з'являлася друга влада над тим самим
    // числом — те саме, що вже сталося з часткою джерела.
    const axleById = new Map(axles.map(axle => [axle.id, axle]));

    // Відмова замість мовчазного зникнення. Невідомий зв'язок і незбудована
    // крива тягового джерела — це підстава не рахувати, а не рахувати без нього.
    const blocking = [];
    paths.forEach(path => {
      const source = byId.get(path.sourceId);
      if (source.traction === null || source.traction === undefined) {
        blocking.push(`Джерело ${source.id}: не задано, чи передає воно момент на колеса.`);
      } else if (source.traction === true && !source.curve?.defined) {
        blocking.push(`Джерело ${source.id}: характеристику не побудовано (${source.curve?.reason || "причини не вказано"}).`);
      }
    });
    if (blocking.length) return { defined: false, reason: blocking[0], problems: blocking };

    const excluded = paths
      .filter(path => byId.get(path.sourceId).traction === false)
      .map(path => ({
        id: path.id,
        sourceId: path.sourceId,
        reason: "Джерело не передає момент на колеса."
      }));

    const active = paths
      .filter(path => byId.get(path.sourceId).traction === true)
      .map(path => ({
        ...path,
        curve: pathCurve({
          curve: byId.get(path.sourceId).curve,
          reductionRatio: path.reductionRatio,
          efficiency: path.efficiency,
          dynamicRadiusM: axleById.get(path.axle).dynamicRadiusM,
          allocation: path.allocation ?? 1
        })
      }));
    const broken = active.find(path => !path.curve.defined);
    if (broken) return { defined: false, reason: `Шлях ${broken.id}: ${broken.curve.reason}` };
    if (!active.length) return { defined: false, reason: "Жоден шлях не передає момент на колеса." };

    const participating = [...new Set(active.map(path => path.sourceId))];
    const utilization = resolveUtilization(strategy, participating, utilizationFactors);
    if (utilization.problems.length) {
      return { defined: false, reason: utilization.problems[0], problems: utilization.problems };
    }

    // Область швидкості — об'єднання, а не перетин: поза своїм діапазоном
    // машина справді не дає сили, і нуль тут не вигадка, а факт. Але перетин
    // теж називається окремо: лише в ньому працюють усі джерела одночасно.
    const from = Math.min(...active.map(path => path.curve.speedRange.from));
    const to = Math.max(...active.map(path => path.curve.speedRange.to));
    const simultaneousFrom = Math.max(...active.map(path => path.curve.speedRange.from));
    const simultaneousTo = Math.min(...active.map(path => path.curve.speedRange.to));

    // Власні точки кривих зберігаються: рівномірна сітка сама по собі згладила б
    // зломи, у яких і полягає характеристика.
    const speeds = new Set(active.flatMap(path => path.curve.points.map(point => point.speedMs)));
    const step = (to - from) / (pointCount - 1);
    for (let index = 0; index < pointCount; index += 1) speeds.add(from + step * index);
    if (simultaneousTo > simultaneousFrom) {
      speeds.add(simultaneousFrom);
      speeds.add(simultaneousTo);
    }

    const points = [...speeds].sort((a, b) => a - b).map(speedMs => {
      const contributions = active.map(path => {
        const available = forceAtSpeed(path.curve, speedMs);
        const factor = utilization.factors.get(path.sourceId);
        return {
          pathId: path.id,
          sourceId: path.sourceId,
          axle: path.axle,
          active: available !== null,
          available: available ?? 0,
          factor,
          forceN: (available ?? 0) * factor
        };
      });
      return {
        speedMs,
        speedKmh: speedMs * 3.6,
        withinSimultaneousRange: speedMs >= simultaneousFrom && speedMs <= simultaneousTo,
        envelopeN: contributions.reduce((sum, item) => sum + item.available, 0),
        adoptedN: contributions.reduce((sum, item) => sum + item.forceN, 0),
        contributions
      };
    });

    const planetaryResult = topology === "planetary-series-parallel"
      ? planetaryKinematics({ points, paths: active, axles, parameters: planetary })
      : null;
    if (planetaryResult && !planetaryResult.defined) {
      return { defined: false, topology, reason: planetaryResult.reason, planetary: planetaryResult };
    }

    return {
      defined: true,
      topology,
      topologyNote: scheme.note,
      strategy,
      strategyLabel: STRATEGIES[strategy].label,
      speedRange: { from, to },
      simultaneousRange: simultaneousTo > simultaneousFrom
        ? { from: simultaneousFrom, to: simultaneousTo }
        : null,
      method: "linear-interpolation-between-path-breakpoints",
      points,
      planetary: planetaryResult,
      excluded,
      limitations: [
        ...envelopeLimitations(active.map(path => byId.get(path.sourceId))),
        ...sharedSourceLimitations(active),
        ...(planetaryResult ? [
          `Планетарний ряд перевірено за рівнянням Вілліса; найбільша за модулем частота генератора ${planetaryResult.maximumGeneratorRpm.toFixed(0)} об/хв.`,
          "Сили утворюють верхню енергетичну огинаючу; втрати генератора та внутрішній електричний перетік power-split окремо не моделюються."
        ] : []),
        // Інтерполяція — метод цього проєкту, а не джерела, і виміряна крива
        // прямо каже, що між її точками значень не інтерпольовано.
        "Між точками кривих узято лінійну інтерполяцію: це метод проєкту, а не джерела.",
        ...(simultaneousTo > simultaneousFrom
          ? [`Усі джерела працюють одночасно лише в межах ${(simultaneousFrom * 3.6).toFixed(1)}…`
            + `${(simultaneousTo * 3.6).toFixed(1)} км/год; поза ними частина джерел позначена як неактивна.`]
          : ["Спільного діапазону, у якому працюють усі джерела, немає."]),
        ...(strategy === "simultaneous-full-load-upper-envelope"
          ? [active.length > 1
            ? "Усі джерела взято на повному навантаженні одночасно: це межа можливостей, а не робота регулятора."
            : "Джерело взято на повному навантаженні: це межа його можливостей, а не робота регулятора."]
          : ["Ступінь використання кожного джерела оголосив автор проєкту."])
      ]
    };
  }

  // Integer gearbox adoption can change the top ratio after the initial
  // driveline structure was collected. Rebuild every path curve and trace from
  // the same adopted total before performance, fuel or component consumers run.
  function adoptEngineTotalRatio({ driveline, totalRatio, texNumber, utilizationFactors, planetary }) {
    if (!(finiteNumber(totalRatio) > 0)) return { ...driveline, reason: "Повна прийнята редукція має бути додатною." };
    const paths = (driveline.paths || []).map(path => path.sourceId === "engine"
      ? { ...path, reductionRatio: finiteNumber(totalRatio) } : path);
    if (!paths.some(path => path.sourceId === "engine") && driveline.enginePathTemplate) {
      paths.push({ ...driveline.enginePathTemplate, reductionRatio: finiteNumber(totalRatio) });
    }
    if (!paths.length && driveline.reason) {
      return { ...driveline, combined: { defined: false, reason: driveline.reason } };
    }
    const combined = combine({ sources: driveline.sources || [], axles: driveline.axles || [], paths,
      topology: driveline.topology, strategy: driveline.strategy, utilizationFactors, planetary });
    const pathSteps = [];
    for (const path of paths) {
      const source = driveline.sources.find(item => item.id === path.sourceId);
      if (source?.traction !== true) continue;
      const axle = driveline.axles.find(item => item.id === path.axle);
      const curve = pathCurve({ curve: source.curve, reductionRatio: path.reductionRatio,
        efficiency: path.efficiency, dynamicRadiusM: axle?.dynamicRadiusM, allocation: path.allocation });
      if (curve.defined) pathSteps.push(buildPathForceStep({ path, curve, axle, source, texNumber }));
    }
    return { ...driveline, paths, combined, pathSteps,
      combinedStep: combined.defined ? buildCombinedForceStep({ combined, texNumber }) : null,
      reason: combined.defined ? null : combined.reason };
  }

  // ------------------------------------------------- кроки для документа --

  // Крок на КОЖЕН шлях, а не на кожну вісь. Один двигун із двома шляхами тієї
  // самої кінематики дає ту саму потрібну частоту, і про це кажуть прямо; два
  // різні двигуни дають два кроки. Раніше передня й задня осі отримували власні
  // передаточні числа, ніде не сказавши, одна це машина чи дві.
  function buildPathForceStep({ path, curve, axle, source, texNumber }) {
    // Примітки читає людина, а не MathJax: у тексті має стояти 9,7, а не 9{,}7.
    const peak = curve.points.reduce((best, point) => (point.forceN > best.forceN ? point : best), curve.points[0]);
    return {
      id: `traction-path-${path.id}`,
      title: `Сила тяги на колесах: ${path.id}`,
      purpose: "Convert this source's torque into wheel force at the driven axle.",
      output: {
        id: `value.wheel-force-${path.id}`,
        symbol: "F_{\\mathrm{т}}",
        label: `Wheel force through path ${path.id}`,
        valueType: "list",
        canonicalUnit: null
      },
      expression: "T * i * eta * u / r_d",
      dependencies: [
        `value.traction-characteristic-${source.id}`,
        "value.dynamic-wheel-radius",
        // Шлях веде конкретну вісь, і те, яку саме, — прийняте рішення, а не
        // властивість кривої. Без цього рядка змінена ведуча вісь мовчки
        // переставляла б тягу, і сліду в документі не лишалося б.
        "decision.driven-axle-set",
        // Передаточне число, ККД і частка — множники формули (4.8), і кожен
        // приходить зі свого місця: редуктора осі або u_тр,min, прийнятого чи
        // порахованого ККД, оголошеної частки. Шлях називає їх сам, бо лише
        // він знає, звідки взяв своє.
        ...(path.factorRefs || []),
        ...(source.id === "engine" || source.kind === "engine"
          ? ["input.maximum-speed"]
          : [])
      ],
      // Номер рівняння не ставиться: шляхів буває кілька, і кожен показує свою
      // підстановку в таблиці розділу, а не під спільним номером. Саме рівняння
      // (4.8) стоїть у рукописі один раз, як і належить формулі.
      equationNumber: null,
      formulaTex: "F_{\\mathrm{т}}=\\frac{T\\,i\\,\\eta\\,u}{r_{\\mathrm{д}}},"
        + "\\qquad v=\\frac{\\omega r_{\\mathrm{д}}}{i}",
      substitutionTex: `\\begin{aligned}F_{\\mathrm{т,max}}&=\\frac{${texNumber(peak.torqueNm, 5)}\\cdot${texNumber(curve.reductionRatio, 6)}\\cdot${texNumber(curve.efficiency, 5)}\\cdot${texNumber(curve.allocation, 5)}}{${texNumber(curve.dynamicRadiusM, 6)}}`
        + `=${texNumber(peak.forceN, 3)}\\;\\mathrm{Н}=${texNumber(peak.forceN / 1000, 4)}\\;\\mathrm{кН}\\\\[3pt]`
        + `v_*&=\\frac{${texNumber(peak.angularSpeed, 5)}\\cdot${texNumber(curve.dynamicRadiusM, 6)}}{${texNumber(curve.reductionRatio, 6)}}=${texNumber(peak.speedMs, 5)}\\;\\mathrm{м/с}\\\\[3pt]`
        + `V_*&=3{,}6\\cdot${texNumber(peak.speedMs, 5)}=${texNumber(peak.speedMs * 3.6, 3)}\\;\\mathrm{км/год}\\end{aligned}`,
      result: {
        value: curve.points.map(point => ({
          speedMs: point.speedMs, forceN: point.forceN, angularSpeed: point.angularSpeed
        })),
        canonicalUnit: null,
        displayUnit: ""
      },
      method: "path-torque-to-wheel-force",
      sourceRefs: ["source.method.course"],
      readerNotes: [
        "Підставляючи числові дані шляху в (4.8), показано точку найбільшої сили; решту точок кривої обчислено тим самим правилом.",
        // Назвати «вісь передня», коли шлях веде обидві, — неправда, яку
        // повний привід робив щоразу. Шлях звітує своїми осями.
        `Шлях ${path.id}: джерело «${source.id}» веде `
        + `${(path.axleNumbers || []).length > 1
          ? `осі ${path.axleNumbers.join(", ")}`
          : `вісь ${(path.axleNumbers || [])[0] ?? axle.id}`}`
        + ` через передаточне число ${plainNumber(path.reductionRatio, 2)} `
        + `з ККД ${plainNumber(path.efficiency, 3)}.`,
        finiteNumber(path.allocation ?? 1) < 1
          ? `Цьому шляху віддано ${plainNumber(finiteNumber(path.allocation) * 100, 0)} % сили джерела.`
          : "Цьому шляху віддано всю силу джерела.",
        `Динамічний радіус осі: ${plainNumber(axle.dynamicRadiusM, 3)} м (${axle.provenance || "джерело не вказано"}).`
      ],
      assumptions: ["Wheel force follows the source torque through a fixed reduction and efficiency."],
      limitations: ["Adhesion is not checked here: this is what the driveline can deliver, not what the road accepts."]
    };
  }

  // Ведучі осі автомобіля — це об'єднання осей, які ведуть його шляхи, і ніщо
  // інше. Вибір читача не «призначає» ведучі осі понад шляхи: він каже, куди
  // йде єдиний шлях ДВЗ, якому більше нізвідки взяти вісь. Усе решта — редуктори
  // на осях — уже назвали свої осі самі.
  //
  // Одна влада, дві перевірки. Кількість має збігтися з колісною формулою: 4×2
  // з двигуном ззаду й редуктором спереду давав би дві ведучі осі там, де
  // формула обіцяє одну. І, якщо положення названо, об'єднання має збігтися з
  // ним: інакше документ казав би «ведуча задня», ведучи передню.
  function drivenAxleUnion(paths) {
    const numbers = new Set();
    (paths || []).forEach(path => {
      (path.axleNumbers || []).forEach(number => numbers.add(number));
    });
    return [...numbers].sort((first, second) => first - second);
  }

  function validateDrivenAxles({ paths, statedSet, drivenAxleCount }) {
    const union = drivenAxleUnion(paths);
    if (!union.length) {
      return { defined: false, union, reason: "Жоден шлях не називає своєї ведучої осі." };
    }
    if (Number.isInteger(drivenAxleCount) && union.length !== drivenAxleCount) {
      return {
        defined: false,
        union,
        reason: `Шляхи ведуть ${union.length} ${union.length === 1 ? "вісь" : "осі"} `
          + `(${union.join(", ")}), а колісна формула обіцяє ${drivenAxleCount}. `
          + "Приведіть привод у відповідність до формули або змініть формулу."
      };
    }
    if (Array.isArray(statedSet) && statedSet.length
      && (statedSet.length !== union.length
        || statedSet.some((number, index) => number !== union[index]))) {
      return {
        defined: false,
        union,
        reason: `Прийнято ведучими осі ${statedSet.join(", ")}, а шляхи ведуть `
          + `${union.join(", ")}. Розрахунок не вибирає між ними.`
      };
    }
    return { defined: true, union, reason: null };
  }

  // Сила тяги шляху на заданій швидкості. Між точками — лінійна інтерполяція,
  // як і скрізь у цьому модулі; поза межами кривої шлях не дає нічого, і це
  // не нуль «на всяк випадок», а справжня відсутність тяги на цій швидкості.
  function forceAtSpeed(curve, speedMs) {
    if (!curve || !curve.defined || !curve.points.length) return null;
    if (!Number.isFinite(finiteNumber(speedMs))) return null;
    const points = curve.points;
    if (speedMs < points[0].speedMs || speedMs > points[points.length - 1].speedMs) return null;
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      if (speedMs <= current.speedMs) {
        const span = current.speedMs - previous.speedMs;
        if (span <= 0) return current.forceN;
        const share = (speedMs - previous.speedMs) / span;
        return previous.forceN + share * (current.forceN - previous.forceN);
      }
    }
    return points[points.length - 1].forceN;
  }

  function buildCombinedForceStep({ combined, texNumber }) {
    const peak = combined.points.reduce(
      (best, point) => (point.adoptedN > best.adoptedN ? point : best), combined.points[0]);
    return {
      id: "combined-tractive-force",
      title: "Сумарна сила тяги",
      purpose: "Combine the driveline paths under the adopted strategy.",
      output: {
        id: "value.combined-tractive-force",
        symbol: "F_{\\mathrm{т,\\Sigma}}",
        label: "Combined tractive force",
        valueType: "list",
        canonicalUnit: null
      },
      expression: "sum(u_s * F_s(v))",
      dependencies: [
        ...combined.points[0].contributions.map(item => `value.wheel-force-${item.pathId}`),
        "input.driveline-topology",
        "decision.traction-combination-strategy"
      ],
      equationNumber: "4.9",
      formulaTex: "F_{\\mathrm{adopted}}(v)=\\sum_s u_s(v)\\,F_{s,\\max}(v)",
      substitutionTex: `\\begin{aligned}V_*&=3{,}6\\cdot${texNumber(peak.speedMs, 5)}=${texNumber(peak.speedKmh, 3)}\\;\\mathrm{км/год}\\\\[3pt]`
        + `F_{\\mathrm{т,\\Sigma}}(V_*)&=${peak.contributions.map(item => `${texNumber(item.factor, 4)}\\cdot${texNumber(item.available, 4)}`).join("+")}`
        + `=${texNumber(peak.adoptedN, 3)}\\;\\mathrm{Н}=${texNumber(peak.adoptedN / 1000, 4)}\\;\\mathrm{кН}\\end{aligned}`,
      result: {
        value: combined.points.map(point => ({
          speedMs: point.speedMs, adoptedN: point.adoptedN, envelopeN: point.envelopeN
        })),
        canonicalUnit: null,
        displayUnit: ""
      },
      method: combined.strategy,
      // Ehsani цитується лише тоді, коли складаються кілька джерел: саме він
      // дає фізику додавання моментів і сил. Для однієї машини це посилання
      // було б до чогось, чого в розрахунку немає.
      sourceRefs: combined.points[0].contributions.length > 1
        ? ["source.project-input", "source.method.ehsani-electric-traction"]
        : ["source.project-input"],
      readerNotes: [
        "Числова підстановка показує точку максимуму сумарної кривої. Кожен доданок узято на одній і тій самій швидкості V_*; максимуми окремих джерел на різних швидкостях не додають.",
        combined.points[0].contributions.length === 1
          ? "Одне джерело тяги: сила передається через прийнятий тракт до ведучих коліс. Додавання незалежних двигунів тут немає."
          : `Схема з'єднання: ${TOPOLOGIES[combined.topology].label}. ${combined.topologyNote}`,
        `Прийнята стратегія: ${combined.strategyLabel}.`,
        ...combined.excluded.map(item => `Шлях ${item.id} не входить у суму: ${item.reason}`)
      ],
      assumptions: [
        "Every source is converted to wheel force at the same road speed before being added."
      ],
      limitations: combined.limitations
    };
  }

  function gearCurvesFor(data) {
      const ladder = data.layout.gearboxLadder;
      const driveline = data.chapter4.drivelineView;
      if (!ladder?.defined || !driveline.paths) return null;
      // One ICE may feed more than one driven axle. A gearbox gear belongs to
      // that source, not to the first path we happen to find, so the vehicle's
      // gear curve must sum every active ICE path. The path allocations already
      // prevent a single engine from being counted twice.
      const enginePaths = driveline.paths.filter(path => path.sourceId === "engine");
      const source = driveline.sources?.find(item => item.id === "engine");
      if (!enginePaths.length || !source?.curve?.defined) return null;
      const topGear = data.chapter4.driveline.gearing?.topGear?.value;
      if (!(topGear > 0)) return null;

      return ladder.gears.map(gear => {
        const curves = enginePaths.map(enginePath => pathCurve({
          curve: source.curve,
          reductionRatio: enginePath.reductionRatio * gear.ratio / topGear,
          efficiency: enginePath.efficiency,
          dynamicRadiusM: driveline.axles?.find(item => item.id === enginePath.axle)?.dynamicRadiusM,
          allocation: enginePath.allocation
        }));
        if (curves.some(curve => !curve.defined) || !curves[0]?.points?.length) {
          return { gear: gear.gear, points: [] };
        }
        const length = Math.min(...curves.map(curve => curve.points.length));
        const points = Array.from({ length }, (_, index) => ({
          speedMs: curves[0].points[index].speedMs,
          forceN: curves.reduce((sum, curve) => sum + curve.points[index].forceN, 0)
        }));
        return { gear: gear.gear, points };
      });
    }

  return Object.freeze({
    gearCurvesFor,
    adoptEngineTotalRatio,
    TOPOLOGIES,
    STRATEGIES,
    COMMON_ENVELOPE_LIMITATIONS,
    ELECTRIC_ENVELOPE_LIMITATIONS,
    envelopeLimitations,
    pathCurve,
    forceAtSpeed,
    validateStructure,
    resolveUtilization,
    planetaryKinematics,
    planetaryPresentation,
    combine,
    forceAtSpeed,
    drivenAxleUnion,
    validateDrivenAxles,
    buildPathForceStep,
    buildCombinedForceStep
  });
}
