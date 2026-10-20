"use strict";

// Розділ 7 — паливна економічність усталеного руху.
//
// Метод із методички (київське видання), підрозділ 2.3.7, друковані с. 50—53,
// рівняння (2.78)—(2.84).
//
// Паливна характеристика усталеного руху — це залежність Q_s = f(V) на вищій
// передачі по горизонтальній дорозі. З неї беруть дві речі, заради яких її й
// будують: контрольну витрату Q_s,min і економічну швидкість V_ек, на якій ця
// витрата досягається.
//
// Крива має мінімум не випадково. На малій швидкості двигун навантажений
// слабко й працює неекономно (K_B великий), на великій — швидко росте опір
// повітря. Мінімум лежить там, де ці дві тенденції зрівноважуються, і його
// положення — головний висновок розділу.
export function createFuelEconomy({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;

  function specificAtOperatingPoint(inputs, point, measuredApi) {
    if (!(point.availablePowerKw > 0 && point.powerKw > 0 && point.powerKw <= point.availablePowerKw*(1+1e-9))) return null;
    if (inputs.useMeasured) {
      const eta=measuredApi?.at(inputs.measured,point);
      return eta>0 && inputs.heating>0 ? 3600/(eta*inputs.heating) : null;
    }
    const model=engineEfficiency({specificConsumptionGkWh:inputs.specific,heatingValueMjPerKg:inputs.heating,
      speedRatio:point.angularSpeed/inputs.ratedAngularSpeed,
      utilisation:point.powerKw/point.availablePowerKw,engineKind:inputs.engineKind});
    return model?.defined ? model.effectiveSpecificGkWh : null;
  }
  // Одна перевірка числа на весь проєкт: Number() приймає null, true й "" і
  // мовчки робить із них 0 та 1, а Number.isFinite їх пропускає.
  const { finiteNumber } = (function loadNumeric() {
    const scope = typeof window === "object" ? window : globalThis;
    if (!scope.VehicleNumeric && typeof module === "object" && module.exports) {
      require("./numeric.js");
    }
    return scope.VehicleNumeric;
  })();


  // g_N — питома витрата палива при максимальній потужності, с. 50.
  //
  // Діапазони джерела описують карбюраторний двигун і дизель тієї доби.
  // Для сучасного впорскувального двигуна універсального числа в перевірених
  // джерелах немає: паспорт або карта конкретної машини мають дати g_N.
  // 270 г/(кВт·год) нижче — ВИДИМЕ редаговане початкове припущення проєкту,
  // а не число, приписане джерелу. Порожнє поле користується саме ним.
  const SPECIFIC_CONSUMPTION_ROWS = Object.freeze([
    {
      id: "carburettor",
      label: "Карбюраторний двигун",
      min: 330, max: 360, fromSource: true
    },
    {
      id: "diesel",
      label: "Дизель",
      min: 220, max: 240, fromSource: true
    },
    {
      id: "injection",
      label: "Бензиновий із упорскуванням — попередньо 270 г/(кВт·год)",
      min: null, max: null, fromSource: false, requiresProjectValue: true, defaultValue: 270,
      note: "270 г/(кВт·год) — редаговане початкове припущення проєкту. Універсального сучасного діапазону немає; замініть його паспортним значенням або картою конкретного двигуна."
    }
  ]);

  // Густина палива, г/см³, с. 51.
  // Нижча теплота згоряння. Це стандартна табличная властивість палива, а не
  // число курсової методички: вона їх не подає. Потрібна вона лише для того,
  // щоб літри й кіловат-години можна було СКЛАСТИ — без спільної міри
  // витрата гібрида лишається двома числами, які ні про що разом не кажуть.
  function specificConsumptionDefault(rowOrId) {
    const row = typeof rowOrId === "string"
      ? SPECIFIC_CONSUMPTION_ROWS.find(candidate => candidate.id === rowOrId)
      : rowOrId;
    if (!row) return null;
    if (row.fromSource && Number.isFinite(row.min) && Number.isFinite(row.max)) {
      return (row.min + row.max) / 2;
    }
    return Number.isFinite(row.defaultValue) ? row.defaultValue : null;
  }

  const HEATING_VALUE_MJ_PER_KG = Object.freeze([
    { id: "petrol", label: "Бензин", value: 44.0 },
    { id: "diesel", label: "Дизельне паливо", value: 42.5 }
  ]);

  const FUEL_DENSITY = Object.freeze([
    { id: "petrol", label: "Бензин", value: 0.75 },
    { id: "diesel", label: "Дизельне паливо", value: 0.83 }
  ]);

  // Носіїв енергії більше, ніж рядків у таблиці густин, і назви їхні складені:
  // у переліку є не лише «diesel», а й «hev-diesel» та «phev-diesel». Перевірка
  // на точну рівність із «diesel» відправляла дизельний гібрид на бензинову
  // криву — а K_B двох кривих на малих навантаженнях різниться майже на дві
  // третини. Вирішує спосіб запалювання, а не точна назва носія.
  // Перелік носіїв, які документ знає (catalog.js + варіанти фікстури).
  // Носій поза переліком — НЕ «щось бензинове», а невідомий: раніше будь-який
  // рядок з опискою мовчки отримував бензинову криву й бензинову густину.
  const CARRIER_KIND = Object.freeze({
    gasoline: "petrol",
    "hev-gasoline": "petrol",
    "phev-gasoline": "petrol",
    "gasoline-electric": "petrol",
    lpg: "petrol",
    cng: "petrol",
    "hydrogen-ice": "petrol",
    diesel: "diesel",
    "hev-diesel": "diesel",
    "phev-diesel": "diesel"
  });
  // Джерело подає густину лише для бензину й дизеля. Ці носії їдуть на
  // бензиновій — свідоме наближення, і документ його називає.
  const BORROWS_PETROL_DENSITY = Object.freeze(["lpg", "cng", "hydrogen-ice"]);

  function engineKindFor(energyCarrier) {
    if (typeof energyCarrier !== "string") return null;
    return CARRIER_KIND[energyCarrier.trim().toLowerCase()] || null;
  }

  // Густину джерело подає лише для бензину й дизеля. Для LPG, CNG і водню
  // рядка немає, і документ бере бензинову — але каже про це вголос, бо
  // мовчазне наближення нічим не відрізняється від виміряного числа.
  function fuelDensityFor(energyCarrier) {
    const kind = engineKindFor(energyCarrier);
    if (!kind) {
      return { defined: false, value: null, approximated: false,
        reason: "Носій енергії не вибрано." };
    }
    const row = FUEL_DENSITY.find(item => item.id === kind);
    const listed = !BORROWS_PETROL_DENSITY
      .includes(String(energyCarrier).trim().toLowerCase());
    return {
      defined: true,
      value: row.value,
      rowId: row.id,
      approximated: !listed,
      reason: listed
        ? null
        : "Джерело подає густину лише для бензину й дизеля; для цього носія "
          + "взято бензинову — це наближення документа, а не число з книжки."
    };
  }

  // Потужність двигуна на заданій кутовій швидкості — інтерполяцією між
  // точками кривої, а не найближчою точкою. Найближча точка робить криву
  // витрати зубчастою: сусідні швидкості беруть різні опорні точки, і
  // «економічна швидкість» опиняється там, де просто пощастило з округленням.
  function powerAt(curvePoints, angularSpeed) {
    const points = (curvePoints || []).filter(point =>
      Number.isFinite(point.angularSpeed) && Number.isFinite(point.powerKw));
    if (points.length < 2) return null;
    const target = finiteNumber(angularSpeed);
    if (target < points[0].angularSpeed || target > points[points.length - 1].angularSpeed) {
      return null;
    }
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      if (target <= current.angularSpeed) {
        const span = current.angularSpeed - previous.angularSpeed;
        if (span <= 0) return current.powerKw;
        const share = (target - previous.angularSpeed) / span;
        return previous.powerKw + share * (current.powerKw - previous.powerKw);
      }
    }
    return points[points.length - 1].powerKw;
  }

  // K_ω = 1,25 − 0,99·x + 0,98·x² − 0,24·x³, де x = ω/ω_N. Рівняння (2.83).
  function speedFactor(relativeAngularSpeed) {
    const x = finiteNumber(relativeAngularSpeed);
    if (!Number.isFinite(x)) return null;
    return 1.25 - 0.99 * x + 0.98 * x ** 2 - 0.24 * x ** 3;
  }

  // K_B за коефіцієнтом використання потужності B. Рівняння (2.81) і (2.82).
  //
  // Дві різні криві, бо дизель на частковому навантаженні втрачає значно
  // менше: у карбюраторного двигуна на малому B витрата зростає втричі.
  function loadFactor(utilisation, engineKind) {
    const b = finiteNumber(utilisation);
    if (!Number.isFinite(b)) return null;
    // Невідомий тип двигуна — не бензиновий за замовчуванням: кривих дві, і
    // третьої, яка означає «не знаю», у книжці немає.
    if (engineKind === "diesel") {
      return 1.2 + 0.14 * b - 1.8 * b ** 2 + 1.46 * b ** 3;
    }
    if (engineKind !== "petrol") return null;
    return 3.27 - 8.22 * b + 9.13 * b ** 2 - 3.18 * b ** 3;
  }

  function heatingValueFor(energyCarrier) {
    const kind = engineKindFor(energyCarrier);
    if (!kind) {
      return { defined: false, value: null, reason: "Носій енергії не вибрано." };
    }
    const row = HEATING_VALUE_MJ_PER_KG.find(item => item.id === kind);
    if (!row) {
      return {
        defined: false, value: null,
        reason: `Теплоти згоряння для носія «${kind}» немає в переліку.`
      };
    }
    return { defined: true, value: row.value, label: row.label, kind };
  }

  // БАЗОВА КАРТА ЕФЕКТИВНОСТІ ДВИГУНА.
  //
  // Курсова методичка карти двигуна не подає — вона подає питому витрату
  // g_e = g_N·K_ω·K_B, де K_ω залежить від відношення обертів до номінальних,
  // а K_B — від коефіцієнта використання потужності. Це і Є карта, тільки
  // записана через витрату палива, а не через ККД.
  //
  // Перехід між ними точний: за годину двигун віддає 1 кВт·год = 3,6 МДж і
  // спалює g_e грамів палива, у яких H_u·g_e/1000 МДж хімічної енергії.
  //   η_e = 3,6/(g_e·H_u/1000) = 3600/(g_e·H_u)
  // де g_e у г/кВт·год, H_u у МДж/кг.
  //
  // Виражати модель джерела через ККД потрібно, щоб літри й кіловат-години
  // стали звідними: спаливши літр, двигун віддає не літр, а η_e від його
  // теплоти.
  function engineEfficiency({ specificConsumptionGkWh, heatingValueMjPerKg,
    speedRatio, utilisation, engineKind }) {
    const specific = finiteNumber(specificConsumptionGkWh);
    const heating = finiteNumber(heatingValueMjPerKg);
    if (specific === null || specific <= 0) {
      return { defined: false, reason: "Потрібна додатна питома витрата g_N." };
    }
    if (heating === null || heating <= 0) {
      return { defined: false, reason: "Потрібна додатна теплота згоряння палива." };
    }
    // Без відомих обертів і навантаження карта згортається в одну точку —
    // номінальний режим, де обидві поправки дорівнюють одиниці.
    const kOmega = finiteNumber(speedRatio) === null
      ? 1 : speedFactor(finiteNumber(speedRatio));
    const kLoad = finiteNumber(utilisation) === null
      ? 1 : loadFactor(finiteNumber(utilisation), engineKind);
    if (kOmega === null || kLoad === null) {
      return {
        defined: false,
        reason: "Поправок K_ω або K_B для цього режиму немає: перевірте тип двигуна."
      };
    }
    const effectiveGkWh = specific * kOmega * kLoad;
    return {
      defined: true,
      value: 3600 / (effectiveGkWh * heating),
      effectiveSpecificGkWh: effectiveGkWh,
      ratedSpecificGkWh: specific,
      speedFactorK: kOmega,
      loadFactorK: kLoad,
      heatingValueMjPerKg: heating,
      atRatedPoint: finiteNumber(speedRatio) === null && finiteNumber(utilisation) === null
    };
  }

  // Q_s = g_N·K_ω·K_B/(3,6·10⁴·η_тр·ρ)·(P_ψ + P_w), л/100 км. Рівняння (2.78).
  function consumptionAtSpeed({
    speedMs, angularSpeed, ratedAngularSpeed, availablePowerKw,
    roadResistancePsi, grossWeightForceN, dragFactorW,
    specificConsumptionGkWh, transmissionEfficiency, fuelDensityGcm3, engineKind
  }) {
    const named = [
      ["швидкість", speedMs],
      ["кутова швидкість", angularSpeed],
      ["номінальна кутова швидкість", ratedAngularSpeed],
      ["потужність за характеристикою", availablePowerKw],
      ["опір дороги", roadResistancePsi],
      ["сила тяжіння", grossWeightForceN],
      ["фактор обтічності W", dragFactorW],
      ["питома витрата g_N", specificConsumptionGkWh],
      ["ККД трансмісії", transmissionEfficiency],
      ["густина палива", fuelDensityGcm3]
    ].find(([, value]) => !Number.isFinite(finiteNumber(value)));
    if (named) {
      return {
        defined: false,
        reason: `Витрата палива: ${named[0]} має бути числом, отримано ${typeof named[1]}.`
      };
    }
    const speed = finiteNumber(speedMs);
    const eta = finiteNumber(transmissionEfficiency);
    const available = finiteNumber(availablePowerKw);
    if (!(speed > 0)) return { defined: false, reason: "Швидкість має бути додатною." };
    if (!(eta > 0 && eta <= 1)) return { defined: false, reason: "ККД має лежати в межах (0; 1]." };
    if (!(available > 0)) {
      return { defined: false, reason: "Двигун не дає потужності на цій частоті." };
    }
    if (!(finiteNumber(specificConsumptionGkWh) > 0)) {
      return { defined: false, reason: "Потрібна додатна питома витрата конкретного двигуна." };
    }

    const roadForceN = finiteNumber(roadResistancePsi) * finiteNumber(grossWeightForceN);
    const dragForceN = finiteNumber(dragFactorW) * speed ** 2;
    // N_потр = (ψ·G_a·V + P_w·V)/(1000·η_тр), рівняння (2.80).
    const requiredKw = (roadForceN + dragForceN) * speed / (1000 * eta);
    // B = N_потр/N_i, рівняння (2.79).
    const utilisation = requiredKw / available;
    const kOmega = speedFactor(finiteNumber(angularSpeed) / finiteNumber(ratedAngularSpeed));
    const kLoad = loadFactor(utilisation, engineKind);
    // null у множенні дає нуль, а не NaN, тому невідомий тип двигуна вийшов би
    // нульовою витратою — числом, яке виглядає як відповідь.
    if (kLoad === null || kOmega === null) {
      return {
        defined: false,
        reason: "Тип двигуна не визначено: коефіцієнта навантаження K_B для нього немає."
      };
    }
    const litresPer100km = finiteNumber(specificConsumptionGkWh) * kOmega * kLoad
      / (3.6e4 * eta * finiteNumber(fuelDensityGcm3)) * (roadForceN + dragForceN);

    return {
      defined: true,
      speedMs: speed,
      requiredPowerKw: requiredKw,
      availablePowerKw: available,
      utilisation,
      // B > 1 означає, що двигун на цій швидкості просто не тягне: усталеного
      // руху немає, і витрату рахувати нема для чого.
      feasible: utilisation <= 1,
      speedFactorK: kOmega,
      loadFactorK: kLoad,
      roadForceN,
      dragForceN,
      litresPer100km
    };
  }

  // Мінімум кривої разом із відповіддю на питання, чи це справді мінімум.
  //
  // Мінімум на краю діапазону — не висновок про автомобіль, а межа того, де
  // ми перестали рахувати. Назвати його економічною швидкістю означало б
  // видати за результат положення власної вибірки.
  function minimumOf(points, key) {
    const sorted = [...points].sort((first, second) => first.speedMs - second.speedMs);
    const best = sorted.reduce((lowest, point) =>
      (point[key] < lowest[key] ? point : lowest), sorted[0]);
    const atLowEdge = best === sorted[0];
    const atHighEdge = best === sorted[sorted.length - 1];
    return {
      sorted,
      best,
      minimumIsInterior: !atLowEdge && !atHighEdge,
      edge: atLowEdge ? "low" : (atHighEdge ? "high" : null),
      edgeReason: atLowEdge
        ? "Найменша витрата припадає на найнижчу пораховану швидкість. "
          + "Гранична точка вибірки не визначає положення справжнього мінімуму; "
          + "нижчі швидкості на цій передачі не перевірено."
        : (atHighEdge
          ? "Найменша витрата припадає на найвищу пораховану швидкість. "
            + "Гранична точка вибірки не визначає положення справжнього мінімуму; "
            + "вищі швидкості не перевірено."
          : null)
    };
  }

  // Крива Q_s = f(V) і два числа, заради яких її будують.
  function characteristic(points) {
    const usable = (points || []).filter(point => point.defined && point.feasible
      && Number.isFinite(point.litresPer100km) && point.litresPer100km > 0);
    if (usable.length < 2) {
      return { defined: false, reason: "Замало точок усталеного руху для побудови кривої." };
    }
    const edge = minimumOf(usable, "litresPer100km");
    const best = edge.best;
    return {
      defined: true,
      points: edge.sorted,
      // Контрольна витрата — це мінімум кривої, а економічна швидкість — та,
      // на якій він досягається. Одне без одного не має сенсу.
      controlConsumptionL100: best.litresPer100km,
      economicSpeedMs: best.speedMs,
      minimumIsInterior: edge.minimumIsInterior,
      edge: edge.edge,
      edgeReason: edge.edgeReason,
      excludedCount: (points || []).length - usable.length
    };
  }

  // Електричний варіант. У методичці його немає — вона написана до того, як
  // такі автомобілі стали проєктувати, — тому рівняння тут не її, а просто
  // означення: енергія на 100 км є потужність опору, поділена на швидкість.
  //
  // Емпіричних коефіцієнтів K_ω і K_B тут немає й бути не може: вони описують
  // поведінку теплового двигуна на частковому навантаженні. Замість них стоїть
  // ККД приводу, і те, що він узятий сталим, — головне спрощення цієї оцінки.
  function energyAtSpeed({
    speedMs, roadResistancePsi, grossWeightForceN, dragFactorW,
    drivetrainEfficiency, auxiliaryPowerKw = 0
  }) {
    const speed = finiteNumber(speedMs);
    const eta = finiteNumber(drivetrainEfficiency);
    if (!(speed > 0)) return { defined: false, reason: "Швидкість має бути додатною." };
    if (!(eta > 0 && eta <= 1)) return { defined: false, reason: "ККД має лежати в межах (0; 1]." };
    // Перевіряти ПЕРЕД множенням: null * 5 === 0, тому добуток із порожнечі
    // виходить скінченним нулем і проходить будь-яку перевірку після себе.
    const psi = finiteNumber(roadResistancePsi);
    const weight = finiteNumber(grossWeightForceN);
    const drag = finiteNumber(dragFactorW);
    const auxiliary = finiteNumber(auxiliaryPowerKw);
    const missing = [
      ["опір дороги", psi], ["сила тяжіння", weight],
      ["фактор обтічності", drag], ["допоміжна потужність", auxiliary]
    ].find(([, value]) => value === null);
    if (missing) {
      return { defined: false, reason: `${missing[0]}: потрібне число.` };
    }
    const roadForceN = psi * weight;
    const dragForceN = drag * speed ** 2;
    const wheelPowerKw = (roadForceN + dragForceN) * speed / 1000;
    const drawnPowerKw = wheelPowerKw / eta + auxiliary;
    return {
      defined: true,
      speedMs: speed,
      feasible: true,
      wheelPowerKw,
      drawnPowerKw,
      roadForceN,
      dragForceN,
      // кВт·год на 100 км = кВт / (км/год) · 100.
      kwhPer100km: drawnPowerKw / (speed * 3.6) * 100
    };
  }

  function energyCharacteristic(points) {
    const usable = (points || []).filter(point => point.defined
      && Number.isFinite(point.kwhPer100km) && point.kwhPer100km > 0);
    if (usable.length < 2) {
      return { defined: false, reason: "Замало точок для побудови кривої." };
    }
    // Та сама перевірка краю, що й для палива: мінімум на межі вибірки — це
    // межа вибірки, а не економічна швидкість. Одного разу вона тут була
    // відсутня, і підпис під кривою закінчувався словом «undefined».
    const edge = minimumOf(usable, "kwhPer100km");
    return {
      defined: true,
      points: edge.sorted,
      controlConsumptionKwh100: edge.best.kwhPer100km,
      economicSpeedMs: edge.best.speedMs,
      minimumIsInterior: edge.minimumIsInterior,
      edge: edge.edge,
      edgeReason: edge.edgeReason,
      excludedCount: (points || []).length - usable.length
    };
  }

  function buildCharacteristicStep({ kind, curve, efficiencyRef, texNumber, inputs = {} }) {
    const textNumber = (value, digits) => texNumber(value, digits).replaceAll("{,}", ",").replaceAll("\\,", "\u00a0");
    const fuel = kind === "fuel";
    const outputId = fuel ? "value.steady-fuel-characteristic" : "value.steady-energy-characteristic";
    const points = curve?.defined ? curve.points : [];
    const unit = fuel ? "л/100 км" : "кВт·год/100 км";
    // The representative sample is the first feasible point, not a silently
    // substituted minimum. Its factors and forces are evaluator results.
    const point = points[0];
    const hasOperands = point && (fuel
      ? [inputs.specificConsumptionGkWh, inputs.transmissionEfficiency,
        inputs.fuelDensityGcm3, point.speedFactorK, point.loadFactorK,
        point.roadForceN, point.dragForceN, point.litresPer100km]
      : [inputs.transmissionEfficiency, inputs.auxiliaryPowerKw,
        point.wheelPowerKw, point.speedMs, point.kwhPer100km]).every(Number.isFinite);
    const example = !hasOperands ? "\\text{Числові операнди прикладу не збережено; потрібен перерахунок.}"
      : fuel
        ? `Q_s=\\frac{${texNumber(inputs.specificConsumptionGkWh, 2)}\\cdot${texNumber(point.speedFactorK, 5)}`
          + `\\cdot${texNumber(point.loadFactorK, 5)}}{3{,}6\\cdot10^4\\cdot${texNumber(inputs.transmissionEfficiency, 5)}`
          + `\\cdot${texNumber(inputs.fuelDensityGcm3, 3)}}`
          + `(${texNumber(point.roadForceN, 3)}+${texNumber(point.dragForceN, 3)})`
          + `=${texNumber(point.litresPer100km, 3)}\\ \\text{${unit}}`
        : `e_s=\\frac{100}{3{,}6\\cdot${texNumber(point.speedMs, 3)}}`
          + `\\left(\\frac{${texNumber(point.wheelPowerKw, 5)}}{${texNumber(inputs.transmissionEfficiency, 5)}}`
          + `+${texNumber(inputs.auxiliaryPowerKw, 3)}\\right)`
          + `=${texNumber(point.kwhPer100km, 3)}\\ \\text{${unit}}`;
    return {
      id: fuel ? "steady-fuel-characteristic" : "steady-energy-characteristic",
      title: fuel
        ? "Паливна характеристика усталеного руху"
        : "Енергетична характеристика усталеного руху",
      purpose: fuel
        ? "Determine fuel consumption over the feasible steady-speed range."
        : "Determine drivetrain-input energy over the steady-speed range.",
      output: {
        id: outputId,
        symbol: fuel ? "Q_s(V)" : "e_s(V)",
        label: fuel ? "Steady-speed fuel characteristic" : "Steady-speed energy characteristic",
        valueType: "list",
        canonicalUnit: null
      },
      expression: fuel
        ? "gN * Komega * KB / (3.6e4 * eta * rhoFuel) * (Froad + Fdrag)"
        : "100 * (Pwheel / eta + Paux) / (3.6 * V)",
      dependencies: fuel ? [
        "value.traction-characteristic-engine",
        "input.rolling-resistance",
        "value.gross-weight-force",
        "value.drag-factor",
        efficiencyRef,
        "decision.adopted-transmission-ratio",
        "value.dynamic-wheel-radius",
        "input.specific-consumption-basis",
        "input.specific-consumption-at-rated-power",
        "input.fuel-density"
      ] : [
        "input.rolling-resistance",
        "value.gross-weight-force",
        "value.drag-factor",
        efficiencyRef,
        "input.auxiliary-power"
      ],
      equationNumber: fuel ? "7.1" : null,
      formulaTex: fuel
        ? "Q_s=\\frac{g_NK_{\\omega}^{Q}K_B}{3{,}6\\cdot10^4\\eta_{\\mathrm{тр}}\\rho_{\\mathrm{п}}}(P_{\\psi}+P_w)"
        : "e_s=\\frac{100}{3{,}6V}\\left(\\frac{P_{\\mathrm{к}}}{\\eta_{\\mathrm{тр}}}+P_{\\mathrm{доп}}\\right)",
      substitutionTex: curve?.defined
        ? `V=${texNumber(point?.speedMs, 3)}\\ \\text{м/с}:\\quad ${example}`
        : `${fuel ? "Q_s" : "e_s"}=\\text{—}`,
      result: { value: points, canonicalUnit: null, displayUnit: null },
      method: fuel ? "course-methodic-2-3-7" : "steady-road-load-energy-balance",
      sourceRefs: fuel
        ? ["source.method.course", "source.method.birulya-rolling-resistance"]
        : ["source.method.birulya-rolling-resistance", "source.project-input"],
      assumptions: [],
      readerNotes: [
        ...(hasOperands ? [`Числовий приклад відповідає першій придатній точці при V = ${textNumber(point.speedMs * 3.6, 2)} км/год. `
          + "Повну характеристику наведено на рисунку; її мінімум визначається окремо серед усіх обчислених точок."] : []),
        fuel
          ? "Криву побудовано для горизонтальної дороги лише там, де двигун може підтримувати усталений рух; f уточнено для швидкості кожної точки."
          : "Це енергія на вході приводу на горизонтальній дорозі за сталого ККД; f уточнено для швидкості кожної точки, карту втрат електромашини не застосовано."
      ],
      limitations: curve?.defined ? [] : [curve?.reason || "Характеристику не побудовано."]
    };
  }

  function buildControlConsumptionStep({ kind, curve, texNumber }) {
    const fuel = kind === "fuel";
    const value = curve?.defined
      ? (fuel ? curve.controlConsumptionL100 : curve.controlConsumptionKwh100) : null;
    const speedKmh = curve?.defined ? curve.economicSpeedMs * 3.6 : null;
    const values = (curve?.points || []).map(point => fuel ? point.litresPer100km : point.kwhPer100km);
    const shownIndices = [...new Set([0, 1, values.indexOf(value), values.length - 2, values.length - 1])]
      .filter(index => index >= 0 && index < values.length).sort((a, b) => a - b);
    const minimumOperands = shownIndices.map((index, at) =>
      (at && index > shownIndices[at - 1] + 1 ? "\\ldots,\\," : "") + texNumber(values[index], 3)).join(",\\,");
    return {
      id: fuel ? "control-fuel-consumption" : "control-energy-consumption",
      title: fuel ? "Контрольна витрата палива" : "Найменша витрата енергії",
      purpose: "Locate the lowest sampled steady-speed consumption and its speed.",
      output: {
        id: fuel ? "value.control-fuel-consumption" : "value.control-energy-consumption",
        symbol: fuel ? "Q_{s\\min}" : "e_{s\\min}",
        label: fuel ? "Control fuel consumption" : "Minimum steady energy consumption",
        valueType: "quantity",
        canonicalUnit: fuel ? "L/100km" : "kWh/100km"
      },
      expression: fuel ? "min(Qs(V))" : "min(es(V))",
      dependencies: [fuel ? "value.steady-fuel-characteristic" : "value.steady-energy-characteristic"],
      equationNumber: null,
      formulaTex: fuel ? "Q_{s\\min}=\\min_V Q_s(V)" : "e_{s\\min}=\\min_V e_s(V)",
      substitutionTex: curve?.defined
        ? `${fuel ? "Q_{s\\min}" : "e_{s\\min}"}=\\min\\{`
          + minimumOperands
          + `\\}=${texNumber(value, 3)}\\ \\text{${fuel ? "л/100 км" : "кВт·год/100 км"}}`
          + `,\\quad V=${texNumber(speedKmh, 1)}\\;\\mathrm{км/год}`
        : `${fuel ? "Q_{s\\min}" : "e_{s\\min}"}=\\text{—}`,
      result: {
        value,
        canonicalUnit: fuel ? "L/100km" : "kWh/100km",
        displayUnit: fuel ? "л/100 км" : "кВт·год/100 км"
      },
      method: curve?.minimumIsInterior ? "interior-sampled-minimum" : "sample-boundary-minimum",
      sourceRefs: ["source.project-derivation"],
      assumptions: [],
      readerNotes: [
        ...(curve?.defined ? [`Мінімум обрано з усіх ${values.length} придатних точок характеристики. У підстановці наведено крайні значення й точку мінімуму; пропущені між ними числа позначено трикрапкою.`] : []),
        ...(curve?.minimumIsInterior ? [] : [curve?.edgeReason].filter(Boolean))
      ],
      limitations: []
    };
  }

  // A cited row supplies a range. An explicitly adopted value is a project
  // input, including a prefilled midpoint accepted by the author; never cite
  // an edited diesel value as if the source had prescribed that number.
  function specificConsumptionSourceFor(row, declaredValue) {
    return String(declaredValue ?? "").trim() === "" && row?.fromSource
      ? "source.method.course" : "source.project-input";
  }

  return Object.freeze({
    SPECIFIC_CONSUMPTION_ROWS,
    specificConsumptionDefault,
    specificConsumptionSourceFor,
    FUEL_DENSITY,
    CARRIER_KIND,
    specificAtOperatingPoint,
    engineKindFor,
    fuelDensityFor,
    heatingValueFor,
    engineEfficiency,
    HEATING_VALUE_MJ_PER_KG,
    powerAt,
    speedFactor,
    loadFactor,
    consumptionAtSpeed,
    characteristic,
    energyAtSpeed,
    energyCharacteristic,
    buildCharacteristicStep,
    buildControlConsumptionStep
  });
}
