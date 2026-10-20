"use strict";

// Розділ 4 — карти ефективності двигуна й електромашини.
//
// НАВІЩО ЦЕ. Досі ефективність у документі була однією точкою: питома витрата
// g_N при номінальній потужності плюс дві емпіричні поправки K_ω і K_B із
// методички. Поправки — це вже карта, але карта без фізики: два многочлени
// третього степеня, підігнані до карбюраторних двигунів своєї доби. Вони не
// кажуть, ЧОМУ витрата така, не переносяться на інший двигун і за межами
// підгонки поводяться як завгодно (K_B при B→0 росте до 3,27, при B>1 —
// падає).
//
// ЩО ТУТ НАТОМІСТЬ. Дві карти, у кожної — фізична побудова й лише один
// оголошений параметр.
//
// ДВИГУН — лінія Віланса. Потужність, знята з колінчастого вала, є
// індикаторною потужністю мінус потужність тертя (Ehsani, рівн. 3.6):
//     P_е = P_і − P_тр,   P_і = η_і·P_палива,   P_тр = M_тр·ω
// звідки одразу
//     η_е = P_е/P_палива = η_і·P_е/(P_е + M_тр·ω).
// Ця форма пояснює обидві риси справжньої карти, які K_ω і K_B лише
// відтворюють: ефективність падає на малому навантаженні (бо P_тр не
// зменшується разом із P_е) і падає з обертами при тій самій потужності (бо
// P_тр = M_тр·ω росте). Друге Ehsani формулює прямо: «при заданій потужності
// витрата зазвичай менша на малих обертах, ніж на великих».
//
// ЕЛЕКТРОМАШИНА — розкладання втрат на дві складові, які подає Zheng:
// обмоткові втрати ростуть як квадрат струму, а струм пропорційний моменту;
// втрати в сталі ростуть із частотою перемагнічування, тобто з обертами.
//     P_втр = k_м·M² + k_ст·ω^1,5
// Показник 1,5 — між гістерезисними втратами (∝ω) і вихровими (∝ω²), які
// Zheng називає окремо: розділити їх однією точкою калібрування не можна.
//
// ЩО ЦЕ НЕ Є. Це не виміряні карти конкретних машин. Виміряна карта — сітка з
// сотень точок зі стенда; тут — двопараметрична поверхня, яку проводять через
// одну оголошену точку. Вона годиться на те, на що й увесь цей документ: щоб
// попередньо побачити порядок величин і форму залежності.
export function createEfficiencyMaps({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;

  const { finiteNumber, plainNumber } = (function loadNumeric() {
    const scope = typeof window === "object" ? window : globalThis;
    if (!scope.VehicleNumeric && typeof module === "object" && module.exports) {
      require("./numeric.js");
    }
    return scope.VehicleNumeric;
  })();

  const ENGINE_REFS = Object.freeze(["source.method.ehsani-electric-traction",
    "source.project-derivation"]);
  const MOTOR_REFS = Object.freeze(["source.book.zheng-electric-drive",
    "source.project-derivation"]);

  // Індикаторний ККД η_і — частка теплоти палива, що стала роботою В ЦИЛІНДРІ,
  // ще до тертя. Це єдиний оголошений параметр карти двигуна.
  //
  // Джерела його прямо не друкують, тому числа тут — рішення проєкту. Але
  // перевірити їх є чим: η_і разом із відомою ефективністю в номінальній точці
  // дає механічний ККД η_м = η_е/η_і, а для нього Ehsani подає діапазон. Якщо
  // оголошене η_і виводить η_м за межі діапазону, документ це каже.
  const INDICATED_EFFICIENCY = Object.freeze([
    {
      id: "petrol", label: "Бензиновий двигун", value: 0.40, min: 0.36, max: 0.42
    },
    {
      id: "diesel", label: "Дизель", value: 0.45, min: 0.42, max: 0.50
    }
  ]);

  // Механічний ККД при повному дроселі, Ehsani, с. 57: «близько 90 % на
  // обертах нижче 1800—2400 хв⁻¹, спадає до 75 % на номінальних обертах».
  // Тут це не вхід у розрахунок, а МІРА для перевірки оголошеного η_і.
  const MECHANICAL_EFFICIENCY_BAND = Object.freeze({ min: 0.75, max: 0.90 });

  // Найбільший ККД електромашини, Zheng, розділ 3: асинхронна 90…93 %,
  // синхронна з постійними магнітами — до 97 %.
  const MOTOR_PEAK_EFFICIENCY = Object.freeze([
    {
      id: "pmsm", label: "Синхронна з постійними магнітами",
      value: 0.95, min: 0.93, max: 0.97
    },
    {
      id: "induction", label: "Асинхронна", value: 0.91, min: 0.90, max: 0.93
    }
  ]);

  // Показник, з яким втрати в сталі ростуть з обертами. Zheng називає дві
  // складові: гістерезисну (∝ω) і вихрову (∝ω²). Однією точкою калібрування їх
  // не розділити, тому беруть середній показник.
  const IRON_LOSS_EXPONENT = 1.5;

  function indicatedEfficiency(id) {
    return INDICATED_EFFICIENCY.find(item => item.id === id) || null;
  }

  function motorPeakEfficiency(id) {
    return MOTOR_PEAK_EFFICIENCY.find(item => item.id === id) || null;
  }

  // ТЕРТЯ ДВИГУНА, виведене з його ж номінальної точки.
  //
  // У номінальній точці відомі і потужність P_N, і ефективність η_N (її дає
  // g_N через η = 3600/(g_e·H_u)). Підставивши їх у лінію Віланса, дістають
  // єдине невідоме — момент тертя:
  //     η_N = η_і·P_N/(P_N + M_тр·ω_N)  ⇒  M_тр = P_N(η_і/η_N − 1)/ω_N
  // Жодної підгонки тут немає: карта проходить через точку, яку документ уже
  // знає, а нахил задає оголошене η_і.
  function engineFriction({ ratedPowerKw, ratedAngularSpeed, ratedEfficiency,
    indicatedEfficiencyValue }) {
    const power = finiteNumber(ratedPowerKw);
    const rated = finiteNumber(ratedAngularSpeed);
    const eta = finiteNumber(ratedEfficiency);
    const indicated = finiteNumber(indicatedEfficiencyValue);
    if (power === null || power <= 0) {
      return { defined: false, reason: "Потрібна додатна номінальна потужність." };
    }
    if (rated === null || rated <= 0) {
      return { defined: false, reason: "Потрібні додатні номінальні оберти." };
    }
    if (eta === null || eta <= 0 || eta >= 1) {
      return { defined: false, reason: "Потрібна ефективність у номінальній точці від 0 до 1." };
    }
    if (indicated === null || indicated <= 0 || indicated >= 1) {
      return { defined: false, reason: "Потрібен індикаторний ККД від 0 до 1." };
    }
    // Індикаторний ККД не може бути нижчим за ефективність на валу: тертя
    // віднімає, а не додає. Якщо оголошено інакше — це описка, і мовчки
    // «виправити» її від'ємним тертям не можна.
    if (indicated <= eta) {
      return {
        defined: false,
        reason: `Індикаторний ККД ${indicated.toFixed(3)} не більший за ефективність `
          + `на валу ${eta.toFixed(3)}: тертя вийшло б від'ємним.`
      };
    }
    const frictionPowerKw = power * (indicated / eta - 1);
    const mechanical = eta / indicated;
    return {
      defined: true,
      frictionTorqueNm: frictionPowerKw * 1000 / rated,
      frictionPowerKw,
      mechanicalEfficiency: mechanical,
      // Ehsani подає 75…90 % при повному дроселі. Вихід за межі означає, що
      // оголошений η_і не пасує цьому двигунові.
      withinMechanicalBand: mechanical >= MECHANICAL_EFFICIENCY_BAND.min
        && mechanical <= MECHANICAL_EFFICIENCY_BAND.max,
      indicatedEfficiency: indicated,
      ratedEfficiency: eta,
      ratedPowerKw: power,
      ratedAngularSpeed: rated
    };
  }

  // Ефективність двигуна в точці (P, ω) — сама лінія Віланса.
  function engineMapEfficiency({ powerKw, angularSpeed, indicatedEfficiencyValue,
    frictionTorqueNm }) {
    const power = finiteNumber(powerKw);
    const angular = finiteNumber(angularSpeed);
    const indicated = finiteNumber(indicatedEfficiencyValue);
    const friction = finiteNumber(frictionTorqueNm);
    if ([power, angular, indicated, friction].some(value => value === null)) return null;
    if (power <= 0 || angular <= 0 || friction < 0) return null;
    // Потужність тут у кіловатах, а M_тр·ω дає ват: без переведення карта
    // виходить у тисячу разів гіршою й мовчки.
    const frictionKw = friction * angular / 1000;
    return indicated * power / (power + frictionKw);
  }

  // Питома витрата, що відповідає цій ефективності: g_e = 3600/(η·H_u).
  function specificConsumptionFor({ efficiency, heatingValueMjPerKg }) {
    const eta = finiteNumber(efficiency);
    const heating = finiteNumber(heatingValueMjPerKg);
    if (eta === null || heating === null || eta <= 0 || heating <= 0) return null;
    return 3600 / (eta * heating);
  }

  // КАРТА ДВИГУНА: сітка (оберти × навантаження) і — головне — порівняння з
  // K_ω·K_B методички в тих самих точках.
  //
  // Порівняння тут не для краси. Дві моделі побудовані незалежно: одна з
  // балансу індикаторної потужності й тертя, друга — підгонкою многочленів до
  // дослідних даних. Якщо вони сходяться, це підтверджує обидві; якщо
  // розходяться, видно де саме й чому.
  function engineMap({ ratedPowerKw, ratedAngularSpeed, ratedEfficiency,
    indicatedEfficiencyValue, heatingValueMjPerKg, curvePoints,
    speedFactor, loadFactor, engineKind, specificConsumptionGkWh,
    loadSteps = [0.1, 0.2, 0.3, 0.5, 0.7, 0.9, 1.0],
    speedRatios = [0.3, 0.5, 0.7, 0.9, 1.0] }) {
    const friction = engineFriction({
      ratedPowerKw, ratedAngularSpeed, ratedEfficiency, indicatedEfficiencyValue
    });
    if (!friction.defined) return friction;
    const rated = finiteNumber(ratedAngularSpeed);
    const heating = finiteNumber(heatingValueMjPerKg);

    // Повна потужність на цих обертах: без неї «навантаження» не має міри.
    const fullLoadAt = angular => {
      const points = (curvePoints || []).filter(point =>
        Number.isFinite(point.angularSpeed) && Number.isFinite(point.powerKw));
      if (points.length < 2) return null;
      const sorted = [...points].sort((a, b) => a.angularSpeed - b.angularSpeed);
      if (angular <= sorted[0].angularSpeed) return sorted[0].powerKw;
      for (let index = 1; index < sorted.length; index += 1) {
        if (angular <= sorted[index].angularSpeed) {
          const a = sorted[index - 1];
          const b = sorted[index];
          const span = b.angularSpeed - a.angularSpeed;
          if (!(span > 0)) return b.powerKw;
          return a.powerKw + (b.powerKw - a.powerKw) * (angular - a.angularSpeed) / span;
        }
      }
      return sorted[sorted.length - 1].powerKw;
    };

    const rows = [];
    speedRatios.forEach(ratio => {
      const angular = rated * ratio;
      const available = fullLoadAt(angular);
      if (available === null || !(available > 0)) return;
      loadSteps.forEach(load => {
        const powerKw = available * load;
        const willans = engineMapEfficiency({
          powerKw, angularSpeed: angular,
          indicatedEfficiencyValue: friction.indicatedEfficiency,
          frictionTorqueNm: friction.frictionTorqueNm
        });
        if (willans === null) return;
        // Та сама точка очима методички: g_e = g_N·K_ω·K_B.
        const kOmega = typeof speedFactor === "function" ? speedFactor(ratio) : null;
        const kLoad = typeof loadFactor === "function" ? loadFactor(load, engineKind) : null;
        const methodGkWh = kOmega !== null && kLoad !== null
          && Number.isFinite(specificConsumptionGkWh)
          ? specificConsumptionGkWh * kOmega * kLoad : null;
        const willansGkWh = specificConsumptionFor({
          efficiency: willans, heatingValueMjPerKg: heating
        });
        rows.push({
          speedRatio: ratio,
          angularSpeed: angular,
          loadFraction: load,
          powerKw,
          torqueNm: powerKw * 1000 / angular,
          efficiency: willans,
          specificGkWh: willansGkWh,
          methodSpecificGkWh: methodGkWh,
          // Розбіжність двох моделей у цій точці, частка.
          deviation: methodGkWh !== null && willansGkWh !== null && methodGkWh > 0
            ? willansGkWh / methodGkWh - 1 : null
        });
      });
    });
    if (!rows.length) {
      return { defined: false, reason: "Кривої повної потужності немає: навантаження нема від чого рахувати." };
    }
    const best = rows.reduce((top, row) => row.efficiency > top.efficiency ? row : top, rows[0]);
    const deviations = rows.map(row => row.deviation).filter(value => value !== null);
    return {
      defined: true,
      rows,
      friction,
      best,
      // Найбільша розбіжність із методичкою — саме її треба показати читачеві.
      worstDeviation: deviations.length
        ? deviations.reduce((worst, value) =>
          Math.abs(value) > Math.abs(worst) ? value : worst, deviations[0])
        : null,
      comparedPoints: deviations.length,
      heatingValueMjPerKg: heating,
      // The map consumes this declared input even when the transmission is
      // incomplete and the road-fuel calculation cannot be built yet.
      specificConsumptionGkWh: finiteNumber(specificConsumptionGkWh)
    };
  }

  // ВТРАТИ ЕЛЕКТРОМАШИНИ: два коефіцієнти з однієї оголошеної точки.
  //
  // P_втр = k_м·M² + k_ст·ω^1,5. Дві невідомі, а точка калібрування одна — але
  // друге рівняння дає сама умова максимуму. У точці, де ККД найбільший,
  //     ∂/∂M [ (Mω + k_м M² + k_ст ω^1,5)/(Mω) ] = k_м/ω − k_ст·ω^0,5/M² = 0,
  // тобто k_м·M² = k_ст·ω^1,5: обмоткові втрати дорівнюють втратам у сталі.
  // Це класичний результат теорії машин, і тут він не приймається на віру, а
  // виводиться з самої форми втрат.
  function motorLossCoefficients({ peakEfficiencyValue, bestTorqueNm,
    bestAngularSpeed }) {
    const peak = finiteNumber(peakEfficiencyValue);
    const torque = finiteNumber(bestTorqueNm);
    const angular = finiteNumber(bestAngularSpeed);
    if (peak === null || peak <= 0 || peak >= 1) {
      return { defined: false, reason: "Потрібен найбільший ККД машини від 0 до 1." };
    }
    if (torque === null || torque <= 0 || angular === null || angular <= 0) {
      return { defined: false, reason: "Потрібні момент і оберти точки найбільшого ККД." };
    }
    const powerKw = torque * angular / 1000;
    const lossKw = powerKw * (1 / peak - 1);
    const halfW = lossKw * 1000 / 2;
    return {
      defined: true,
      copper: halfW / torque ** 2,
      iron: halfW / angular ** IRON_LOSS_EXPONENT,
      bestTorqueNm: torque,
      bestAngularSpeed: angular,
      bestPowerKw: powerKw,
      lossAtBestKw: lossKw,
      peakEfficiency: peak
    };
  }

  function motorMapEfficiency({ torqueNm, angularSpeed, copper, iron }) {
    const torque = finiteNumber(torqueNm);
    const angular = finiteNumber(angularSpeed);
    const kCopper = finiteNumber(copper);
    const kIron = finiteNumber(iron);
    if ([torque, angular, kCopper, kIron].some(value => value === null)) return null;
    if (torque <= 0 || angular <= 0 || kCopper < 0 || kIron < 0) return null;
    const outputW = torque * angular;
    const lossW = kCopper * torque ** 2 + kIron * angular ** IRON_LOSS_EXPONENT;
    return outputW / (outputW + lossW);
  }

  // КАРТА ЕЛЕКТРОМАШИНИ: сітка (оберти × момент).
  function motorMap({ peakPowerKw, baseAngularSpeed, maximumAngularSpeed,
    peakEfficiencyValue, bestTorqueFraction = 0.4,
    torqueFractions = [0.1, 0.25, 0.4, 0.6, 0.8, 1.0],
    speedFractions = [0.2, 0.4, 0.6, 0.8, 1.0] }) {
    const peakPower = finiteNumber(peakPowerKw);
    const base = finiteNumber(baseAngularSpeed);
    const top = finiteNumber(maximumAngularSpeed) ?? base;
    if (peakPower === null || peakPower <= 0) {
      return { defined: false, reason: "Потрібна додатна пікова потужність машини." };
    }
    if (base === null || base <= 0) {
      return { defined: false, reason: "Потрібні додатні оберти основної точки машини." };
    }
    // Момент у кутовій точці характеристики: до неї машина тримає момент,
    // після — потужність.
    const cornerTorqueNm = peakPower * 1000 / base;
    const coefficients = motorLossCoefficients({
      peakEfficiencyValue,
      bestTorqueNm: cornerTorqueNm * bestTorqueFraction,
      bestAngularSpeed: base
    });
    if (!coefficients.defined) return coefficients;

    const rows = [];
    speedFractions.forEach(speedFraction => {
      const angular = top * speedFraction;
      if (!(angular > 0)) return;
      // Вище кутової точки момент обмежений потужністю, а не струмом.
      const limitNm = angular <= base
        ? cornerTorqueNm : peakPower * 1000 / angular;
      torqueFractions.forEach(torqueFraction => {
        const torque = limitNm * torqueFraction;
        const efficiency = motorMapEfficiency({
          torqueNm: torque, angularSpeed: angular,
          copper: coefficients.copper, iron: coefficients.iron
        });
        if (efficiency === null) return;
        rows.push({
          speedFraction,
          angularSpeed: angular,
          torqueFraction,
          torqueNm: torque,
          powerKw: torque * angular / 1000,
          efficiency,
          copperLossKw: coefficients.copper * torque ** 2 / 1000,
          ironLossKw: coefficients.iron * angular ** IRON_LOSS_EXPONENT / 1000
        });
      });
    });
    if (!rows.length) {
      return { defined: false, reason: "Сітка карти вийшла порожньою." };
    }
    const best = rows.reduce((top2, row) => row.efficiency > top2.efficiency ? row : top2, rows[0]);
    const worst = rows.reduce((low, row) => row.efficiency < low.efficiency ? row : low, rows[0]);
    return {
      defined: true,
      rows,
      coefficients,
      cornerTorqueNm,
      best,
      worst,
      baseAngularSpeed: base,
      maximumAngularSpeed: top
    };
  }

  function buildEngineMapStep({ map, texNumber }) {
    const percent = value => plainNumber(value * 100, 1);
    const worst = map.worstDeviation;
    const friction = map.friction, point = map.best;
    const fuelDerived = map.specificConsumptionGkWh > 0 && map.heatingValueMjPerKg > 0
      && Math.abs(3600 / (map.specificConsumptionGkWh * map.heatingValueMjPerKg) - friction.ratedEfficiency) < 1e-10;
    const substitutions = [
      fuelDerived
        ? `\\eta_N&=\\frac{3600}{${texNumber(map.specificConsumptionGkWh, 5)}\\cdot${texNumber(map.heatingValueMjPerKg, 5)}}=${texNumber(friction.ratedEfficiency, 6)}`
        : `\\eta_N&=${texNumber(friction.ratedEfficiency, 6)}\\;\\text{(задано)}`,
      `M_{\\mathrm{тр}}&=\\frac{10^3\\cdot${texNumber(friction.ratedPowerKw, 5)}}{${texNumber(friction.ratedAngularSpeed, 6)}}\\left(\\frac{${texNumber(friction.indicatedEfficiency, 6)}}{${texNumber(friction.ratedEfficiency, 6)}}-1\\right)=${texNumber(friction.frictionTorqueNm, 5)}\\;\\mathrm{Н\\cdot м}`,
      `\\eta_{\\mathrm{е}}(\\omega_*,P_*)&=\\frac{${texNumber(friction.indicatedEfficiency, 6)}\\cdot${texNumber(point.powerKw, 6)}\\cdot10^3}{${texNumber(point.powerKw, 6)}\\cdot10^3+${texNumber(friction.frictionTorqueNm, 6)}\\cdot${texNumber(point.angularSpeed, 6)}}=${texNumber(point.efficiency, 6)}=${texNumber(point.efficiency * 100, 1)}\\%`
    ];
    return {
      id: "engine-efficiency-map",
      title: "Карта ефективності двигуна",
      purpose: "Give the engine an efficiency at every speed and load, not only at the rated point.",
      output: {
        id: "value.engine-efficiency-map",
        symbol: "\\eta_{\\mathrm{е}}",
        label: "Engine efficiency over speed and load",
        valueType: "series",
        canonicalUnit: null
      },
      expression: "eta = eta_i P / (P + M_f omega)",
      dependencies: ["value.traction-characteristic-engine",
        "input.specific-consumption-at-rated-power", "decision.indicated-efficiency", "input.energy-carrier"],
      equationNumber: "4.20",
      formulaTex: "\\begin{aligned}"
        + (fuelDerived ? "\\eta_N&=\\frac{3600}{g_N H_u}\\\\[3pt]" : "")
        + "M_{\\mathrm{тр}}&=\\dfrac{P_N}{\\omega_N}\\left(\\dfrac{\\eta_{\\mathrm{і}}}{\\eta_N}-1\\right)\\\\[3pt]"
        + "\\eta_{\\mathrm{е}}&=\\dfrac{\\eta_{\\mathrm{і}}P_{\\mathrm{е}}}{P_{\\mathrm{е}}+M_{\\mathrm{тр}}\\omega}\\end{aligned}",
      substitutionTex: `\\begin{aligned}${substitutions.join("\\\\[3pt]")}\\end{aligned}`,
      result: {
        value: map.rows.map(row => ({
          speedRatio: row.speedRatio, loadFraction: row.loadFraction,
          efficiency: row.efficiency, specificGkWh: row.specificGkWh
        })),
        canonicalUnit: null,
        displayUnit: "—"
      },
      method: "project-derivation",
      sourceRefs: ENGINE_REFS,
      readerNotes: [
        "У формулах балансу потужність виражено у Вт: числові значення характеристики у кВт помножено на 10³. Для η_N питома витрата g_N задана у г/(кВт·год), а нижча теплота згоряння H_u — у МДж/кг.",
        `Після визначення тертя показано підстановку для найкращої точки розрахованої сітки: кутова частота ${plainNumber(point.angularSpeed, 3)} рад/с, потужність ${plainNumber(point.powerKw, 3)} кВт. Інші точки обчислено за тим самим рівнянням; результатом є вся карта, а не лише її максимум.`,
        "Потужність на валу — це індикаторна потужність мінус потужність тертя "
        + "(Ehsani, рівн. 3.6). Поділивши на потужність палива, дістають "
        + "η_е = η_і·P/(P + M_тр·ω): у чисельнику те, що дійшло до вала, у "
        + "знаменнику — те саме плюс тертя, яке з обертами росте, а з "
        + "навантаженням ні.",
        `Момент тертя не підганяли: його дала сама номінальна точка двигуна — `
        + `M_тр = ${plainNumber(map.friction.frictionTorqueNm, 1)} Н·м, тобто `
        + `${plainNumber(map.friction.frictionPowerKw, 1)} кВт на номінальних `
        + "обертах.",
        `Механічний ККД у номінальній точці виходить `
        + `${percent(map.friction.mechanicalEfficiency)} %. Ehsani подає для `
        + `повного дроселя ${percent(MECHANICAL_EFFICIENCY_BAND.min)}…`
        + `${percent(MECHANICAL_EFFICIENCY_BAND.max)} % — `
        + (map.friction.withinMechanicalBand
          ? "значення в межах довідкового діапазону; це не є валідацією карти конкретного двигуна."
          : "значення ЗА межами діапазону: оголошений η_і цьому двигунові не пасує."),
        `Найкраща точка карти: ${percent(map.best.efficiency)} % при `
        + `${plainNumber(map.best.loadFraction * 100, 0)} % навантаження й `
        + `${plainNumber(map.best.speedRatio * 100, 0)} % номінальних обертів — `
        + "тобто на високому навантаженні й невисоких обертах, як і має бути.",
        worst === null ? "Порівняти з K_ω·K_B не було з чим."
          : `Перевірка: у ${map.comparedPoints} точках ту саму карту порахували `
          + "методичкою (g_e = g_N·K_ω·K_B). Дві моделі побудовані незалежно — "
          + "одна з балансу потужностей, друга підгонкою многочленів до "
          + `дослідних даних, — і найбільша розбіжність між ними `
          + `${plainNumber(Math.abs(worst) * 100, 0)} %. Це розбіжність моделей, `
          + "а не підтвердження точності. Без заданого допуску та незалежних вимірювань висновок про узгодженість не роблять."
      ],
      assumptions: [
        `Індикаторний ККД прийнято ${percent(map.friction.indicatedEfficiency)} % `
        + "і сталим по всій карті. Насправді він трохи падає на малому "
        + "навантаженні, тому карта там дещо оптимістична.",
        "Момент тертя прийнято сталим. Ehsani подає, що механічний ККД при "
        + "повному дроселі спадає з 90 % на середніх обертах до 75 % на "
        + "номінальних, — отже, справжнє тертя з обертами росте, і на високих "
        + "обертах карта знову оптимістична."
      ],
      limitations: [
        ...(map.friction.withinMechanicalBand ? [] :
          [`Механічний ККД ${percent(map.friction.mechanicalEfficiency)} % лежить `
            + "за межами діапазону Ehsani для повного дроселя: перевірте "
            + "оголошений індикаторний ККД або питому витрату g_N."]),
        "Карта не показує збагачення суміші на повному навантаженні: лінія "
        + "Віланса монотонна за потужністю, тому найкращу точку вона кладе "
        + "рівно на повне навантаження, тоді як у справжнього двигуна з "
        + "іскровим запалюванням мінімум витрати лежить близько 80 % — саме "
        + "там K_B методички опускається нижче одиниці."
      ]
    };
  }

  function buildMotorMapStep({ map, texNumber }) {
    const percent = value => plainNumber(value * 100, 1);
    const coefficients = map.coefficients, point = map.best;
    const calibrationLoss = `${texNumber(coefficients.bestTorqueNm, 6)}\\cdot${texNumber(coefficients.bestAngularSpeed, 6)}\\left(1/${texNumber(coefficients.peakEfficiency, 6)}-1\\right)`;
    return {
      id: "motor-efficiency-map",
      title: "Карта ефективності електромашини",
      purpose: "Give the machine an efficiency at every speed and torque, not one constant.",
      output: {
        id: "value.motor-efficiency-map",
        symbol: "\\eta_{\\mathrm{ем}}",
        label: "Machine efficiency over speed and torque",
        valueType: "series",
        canonicalUnit: null
      },
      expression: "eta = M omega / (M omega + kc M^2 + ki omega^1.5)",
      dependencies: ["value.traction-characteristic-motor",
        "decision.motor-peak-efficiency"],
      equationNumber: "4.21",
      formulaTex: "\\begin{aligned}k_{\\mathrm{м}}M_*^2&=k_{\\mathrm{ст}}\\omega_*^{1{,}5}=\\frac{M_*\\omega_*(1/\\eta_*-1)}{2}\\\\[3pt]"
        + "\\eta_{\\mathrm{ем}}&=\\dfrac{M\\omega}{M\\omega+k_{\\mathrm{м}}M^2+k_{\\mathrm{ст}}\\omega^{1{,}5}}\\end{aligned}",
      substitutionTex: `\\begin{aligned}k_{\\mathrm{м}}&=\\frac{${calibrationLoss}}{2\\cdot${texNumber(coefficients.bestTorqueNm, 6)}^2}=${texNumber(coefficients.copper, 8)}\\\\[3pt]`
        + `k_{\\mathrm{ст}}&=\\frac{${calibrationLoss}}{2\\cdot${texNumber(coefficients.bestAngularSpeed, 6)}^{1{,}5}}=${texNumber(coefficients.iron, 8)}\\\\[3pt]`
        + `P&=${texNumber(point.torqueNm, 6)}\\cdot${texNumber(point.angularSpeed, 6)}=${texNumber(point.powerKw * 1000, 4)}\\;\\mathrm{Вт}\\\\[3pt]`
        + `P_{\\mathrm{м}}&=${texNumber(coefficients.copper, 8)}\\cdot${texNumber(point.torqueNm, 6)}^2=${texNumber(point.copperLossKw * 1000, 4)}\\;\\mathrm{Вт}\\\\[3pt]`
        + `P_{\\mathrm{ст}}&=${texNumber(coefficients.iron, 8)}\\cdot${texNumber(point.angularSpeed, 6)}^{1{,}5}=${texNumber(point.ironLossKw * 1000, 4)}\\;\\mathrm{Вт}\\\\[3pt]`
        + `\\eta_{\\mathrm{ем}}&=\\frac{${texNumber(point.powerKw * 1000, 4)}}{${texNumber(point.powerKw * 1000, 4)}+${texNumber(point.copperLossKw * 1000, 4)}+${texNumber(point.ironLossKw * 1000, 4)}}=${texNumber(point.efficiency, 6)}=${texNumber(point.efficiency * 100, 1)}\\%\\end{aligned}`,
      result: {
        value: map.rows.map(row => ({
          speedFraction: row.speedFraction, torqueFraction: row.torqueFraction,
          efficiency: row.efficiency
        })),
        canonicalUnit: null,
        displayUnit: "—"
      },
      method: "project-derivation",
      sourceRefs: MOTOR_REFS,
      readerNotes: [
        "Числова підстановка спочатку визначає обидва коефіцієнти втрат із точки калібрування, потім — ККД найкращої точки обчисленої сітки. Момент задано у Н·м, частоту — у рад/с, добуток Mω — у Вт; решту карти обчислено аналогічно.",
        "Втрати машини Zheng розкладає на дві головні складові: обмоткові "
        + "ростуть як квадрат струму, а струм пропорційний моменту; втрати в "
        + "сталі ростуть із частотою перемагнічування, тобто з обертами. Звідси "
        + "P_втр = k_м·M² + k_ст·ω^1,5, і ККД — це відношення корисної "
        + "потужності до неї ж плюс втрати.",
        "Двох коефіцієнтів з однієї точки не дістати, але друге рівняння дає "
        + "сама умова максимуму: прирівнявши до нуля похідну ККД за моментом, "
        + "дістають k_м·M² = k_ст·ω^1,5 — у точці найбільшого ККД обмоткові "
        + "втрати дорівнюють втратам у сталі. Це не прийнято на віру, а "
        + "виведено з форми втрат.",
        `Точка калібрування: ${plainNumber(map.coefficients.bestTorqueNm, 0)} Н·м `
        + `при ${plainNumber(map.coefficients.bestAngularSpeed * 30 / Math.PI, 0)} `
        + `хв⁻¹, де ККД ${percent(map.coefficients.peakEfficiency)} %. Втрати `
        + `там ${plainNumber(map.coefficients.lossAtBestKw, 2)} кВт, і половина з `
        + "них — обмоткові, половина — у сталі.",
        `По карті ККД лежить між ${percent(map.worst.efficiency)} і `
        + `${percent(map.best.efficiency)} %. Найгірша точка — `
        + `${plainNumber(map.worst.torqueFraction * 100, 0)} % моменту при `
        + `${plainNumber(map.worst.speedFraction * 100, 0)} % обертів: малий `
        + "момент на високих обертах, коли втрати в сталі є, а корисної "
        + "потужності майже немає.",
        "Саме тому сталий ККД приводу — груба заміна: між найкращою й "
        + "найгіршою точкою карти різниця в кілька разів більша за похибку, "
        + "яку зазвичай приписують такому розрахунку."
      ],
      assumptions: [
        `ККД у точці калібрування прийнято ${percent(map.coefficients.peakEfficiency)} % `
        + "(Zheng: асинхронна 90…93 %, синхронна з постійними магнітами до 97 %). "
        + "Це найбільший ККД ЗА МОМЕНТОМ на основних обертах, а не по всій "
        + `карті: вздовж межі моменту модель дотягує до ${percent(map.best.efficiency)} %.`,
        "Точку найбільшого ККД покладено на основні оберти при "
        + `${plainNumber(map.coefficients.bestTorqueNm / map.cornerTorqueNm * 100, 0)} % `
        + "моменту кутової точки. Це оголошення проєкту: паспорт машини подав "
        + "би її саме як точку, а не як частку.",
        "Втрати в підшипниках і на вентиляцію окремо не виділено: у цій моделі "
        + "вони входять до складової, що росте з обертами."
      ],
      limitations: [
        "Показник 1,5 біля обертів — компроміс: Zheng називає гістерезисні "
        + "втрати (∝ω) і вихрові (∝ω²) окремо, але однією точкою калібрування "
        + "їх не розділити.",
        "Послаблення поля вище кутової точки зменшує потік і разом із ним "
        + "втрати в сталі; модель цього не враховує, тому на найвищих обертах "
        + "вона занижує ККД.",
        "Карта описує тяговий режим. У рекуперації втрати ті самі за формою, "
        + "але ККД треба брати оберненим відношенням, і документ цього кроку не "
        + "робить."
      ]
    };
  }

  function decisionsFor({ engineKindId, motorKindId }) {
    const decisions = [];
    const engine = indicatedEfficiency(engineKindId);
    if (engine) {
      decisions.push({
        id: "decision.indicated-efficiency",
        kind: "Decision",
        choiceRef: null,
        symbol: "\\eta_{\\mathrm{і}}",
        adoptedValue: engine.value,
        canonicalUnit: null,
        method: "project-input",
        selectedReferenceId: null,
        recommendedValue: null,
        recommendedSourceRefs: ENGINE_REFS,
        rationale: `Індикаторний ККД ${engine.label.toLowerCase()}а прийнято `
          + `${(engine.value * 100).toFixed(0)} % (${(engine.min * 100).toFixed(0)}…`
          + `${(engine.max * 100).toFixed(0)} %). Джерела його прямо не друкують, `
          + "тому це рішення проєкту; перевіряє його механічний ККД, який "
          + "виходить із номінальної точки, — Ehsani подає для нього 75…90 %.",
        sourceRefs: ["source.project-input"],
        limitations: [],
        manuallyOverridden: true
      });
    }
    const motor = motorPeakEfficiency(motorKindId);
    if (motor) {
      decisions.push({
        id: "decision.motor-peak-efficiency",
        kind: "Decision",
        choiceRef: null,
        symbol: "\\eta_{\\mathrm{ем}}^{\\max}",
        adoptedValue: motor.value,
        canonicalUnit: null,
        method: "project-input",
        selectedReferenceId: null,
        recommendedValue: null,
        recommendedSourceRefs: MOTOR_REFS,
        rationale: `Найбільший ККД машини «${motor.label.toLowerCase()}» прийнято `
          + `${(motor.value * 100).toFixed(0)} % із діапазону `
          + `${(motor.min * 100).toFixed(0)}…${(motor.max * 100).toFixed(0)} %, `
          + "який подає Zheng.",
        sourceRefs: MOTOR_REFS,
        limitations: [],
        manuallyOverridden: true
      });
    }
    return decisions;
  }

  return Object.freeze({
    ENGINE_REFS,
    MOTOR_REFS,
    INDICATED_EFFICIENCY,
    MECHANICAL_EFFICIENCY_BAND,
    MOTOR_PEAK_EFFICIENCY,
    IRON_LOSS_EXPONENT,
    indicatedEfficiency,
    motorPeakEfficiency,
    engineFriction,
    engineMapEfficiency,
    specificConsumptionFor,
    engineMap,
    motorLossCoefficients,
    motorMapEfficiency,
    motorMap,
    buildEngineMapStep,
    buildMotorMapStep,
    decisionsFor
  });
}
