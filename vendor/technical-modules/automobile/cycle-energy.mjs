"use strict";

// Розділ 8 — енергія за їздовим циклом.
//
// Модуль умисно окремий і необов'язковий: без завантаженого циклу він чесно
// відмовляється, і решта документа працює без нього. Курсовий проєкт цього
// розділу не вимагає — він тут тому, що саме за циклом сьогодні порівнюють
// автомобілі, а не за усталеною швидкістю.
//
// ЩО ЦЕ Є І ЧОГО ЦЕ НЕ Є.
//
// WLTC — це крива швидкості в часі. WLTP — це вся процедура випробування:
// маса випробування, коефіцієнти опору з вибігу, приписаний алгоритм
// перемикання передач, кондиціонування, корекція балансу заряду, вагування
// фаз. Тут рахується ЕНЕРГІЯ ЗА ЦИКЛОМ у моделі опору цього документа — це не
// сертифікаційна витрата, і називати її «витратою за WLTP» не можна.
//
// Різниця не косметична: у WLTP опір беруть із вибігу автомобіля, а не з
// прийнятих проєктом f і W, і передачі перемикають за приписом додатка 2, а
// не за розсудом. Обидві розбіжності зсувають результат на відсотки.
export function createCycleEnergy({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;

  // Одна перевірка числа на весь проєкт: Number() приймає null, true й "" і
  // мовчки робить із них 0 та 1, а Number.isFinite їх пропускає.
  const { finiteNumber } = (function loadNumeric() {
    const scope = typeof window === "object" ? window : globalThis;
    if (!scope.VehicleNumeric && typeof module === "object" && module.exports) {
      require("./numeric.js");
    }
    return scope.VehicleNumeric;
  })();

  // δ = 1,04 + 0,04·u_к² живе в performance.js (с. 21 джерела): цикл бере ту
  // саму формулу, а не власну копію.
  function performanceModule() {
    const scope = typeof window === "object" ? window : globalThis;
    if (!scope.VehiclePerformance && typeof module === "object" && module.exports) {
      require("./performance.js");
    }
    return scope.VehiclePerformance;
  }

  const G = 9.81; // Retained public constant; wheel demand is owned by the pinned module.
  const roadLoadAdapter = (function loadRoadLoadAdapter() {
    const scope = typeof window === "object" ? window : globalThis;
    if (!scope.VehicleRoadLoadAdapter && typeof module === "object" && module.exports) {
      require("./road-load-adapter.js");
    }
    return scope.VehicleRoadLoadAdapter;
  })();

  // Проєктний опір не є одним поліномом із замороженим f(V_max). Джерело
  // приймає f=f0 до 50 км/год, а далі f=f0[1+0,01(V-50)]. Цю поправку треба
  // застосовувати в кожній точці циклу; інакше міська частина успадковує
  // коефіцієнт максимальної швидкості й енергія істотно завищується.
  function roadLoadFromDesign({ rollingResistanceF0, grossWeightForceN, dragFactorW }) {
    const required = [rollingResistanceF0, grossWeightForceN, dragFactorW];
    if (required.some(value => value === null || value === undefined || value === "")) {
      return { defined: false, reason: "Потрібні f₀, G_a і W." };
    }
    const f = finiteNumber(rollingResistanceF0);
    const weight = finiteNumber(grossWeightForceN);
    const drag = finiteNumber(dragFactorW);
    if (![f, weight, drag].every(Number.isFinite)) {
      return { defined: false, reason: "Потрібні f₀, G_a і W." };
    }
    if (f < 0 || !(weight > 0) || drag < 0) {
      return { defined: false, reason: "Потрібні f₀ ≥ 0, G_a > 0 і W ≥ 0." };
    }
    return {
      defined: true,
      rollingResistanceF0: f,
      grossWeightForceN: weight,
      dragFactorW: drag,
      source: "design-speed-dependent"
    };
  }

  function roadLoadFromCoastdown({ f0, f1, f2 }) {
    if ([f0, f1, f2].some(value => value === null || value === undefined || value === "")) {
      return { defined: false, reason: "Потрібні всі три коефіцієнти вибігу." };
    }
    const values = [finiteNumber(f0), finiteNumber(f1), finiteNumber(f2)];
    if (!values.every(Number.isFinite)) {
      return { defined: false, reason: "Потрібні всі три коефіцієнти вибігу." };
    }
    if (values[0] <= 0 || values[2] < 0) {
      return { defined: false, reason: "F₀ має бути додатним, а F₂ — невід’ємним." };
    }
    return { defined: true, f0: values[0], f1: values[1], f2: values[2], source: "coastdown" };
  }

  function resistanceAt(roadLoad, speedMs) {
    return roadLoadAdapter.evaluate({ roadLoad, speedMs: finiteNumber(speedMs) })?.resistanceForceN ?? NaN;
  }

  // Розбір циклу з CSV. Формат стандартизованих файлів: рядки коментарів із
  // «#», тоді заголовок, тоді час, швидкість у км/год і, можливо, ухил.
  function delimiterFor(header) {
    if (header.includes(";")) return ";";
    if (header.includes("\t")) return "\t";
    return ",";
  }

  function normalizedHeader(cell) {
    return cell.trim().toLowerCase().replace(/[\s()\[\]./-]+/g, "_");
  }

  function gradeUnitFromHeader(header) {
    if (!header) return null;
    if (/percent|pct|%|відсот/.test(header)) return "percent";
    if (/ratio|m_m|м_м/.test(header)) return "ratio";
    if (/rad|радіан/.test(header)) return "radian";
    if (/deg|degree|град/.test(header)) return "degree";
    return "unknown";
  }

  function parseCycle(text) {
    const lines = String(text || "").split(/\r?\n/)
      .map((line, index) => ({ text: line, lineNumber: index + 1 }));
    const comments = lines.filter(line => line.text.trim().startsWith("#"))
      .map(line => line.text.replace(/^#\s*/, "").trim());
    const body = lines.filter(line => line.text.trim() && !line.text.trim().startsWith("#"));
    if (!body.length) return { defined: false, reason: "Файл циклу порожній." };

    const headerLine = body[0].text;
    const delimiter = delimiterFor(headerLine);
    const headers = headerLine.split(delimiter).map(normalizedHeader);
    const timeIndex = headers.findIndex(cell => /(^|_)time|час/.test(cell));
    const speedIndex = headers.findIndex(cell => /speed|швидк/.test(cell));
    if (timeIndex < 0 || speedIndex < 0) {
      return { defined: false, reason: "Потрібен заголовок зі стовпцями часу та швидкості." };
    }
    const timeHeader = headers[timeIndex];
    if (!/(^|_)(s|sec|secs|second|seconds|с|сек|секунда|секунди)($|_)/.test(timeHeader)) {
      return { defined: false, reason: "У заголовку часу не вказано секунди." };
    }
    const speedHeader = headers[speedIndex];
    const speedUnit = /m_s|м_с/.test(speedHeader) && !/km|км/.test(speedHeader) ? "m/s" :
      (/km|км/.test(speedHeader) ? "km/h" : null);
    if (!speedUnit) return { defined: false, reason: "У заголовку швидкості не вказано км/год або м/с." };
    const gradeIndex = headers.findIndex(cell => /grade|slope|ухил|похил|alpha/.test(cell));
    const gradeUnit = gradeIndex >= 0 ? gradeUnitFromHeader(headers[gradeIndex]) : null;
    if (gradeUnit === "unknown") {
      return { defined: false, reason: "У заголовку ухилу не вказано одиницю: %, м/м, рад або град." };
    }

    const number = cell => {
      const normalized = delimiter === "," ? cell.trim() : cell.trim().replace(",", ".");
      return normalized === "" ? NaN : finiteNumber(normalized);
    };
    const rows = [];
    for (let rowIndex = 1; rowIndex < body.length; rowIndex += 1) {
      const cells = body[rowIndex].text.split(delimiter);
      const required = [timeIndex, speedIndex, ...(gradeIndex >= 0 ? [gradeIndex] : [])];
      if (required.some(index => index >= cells.length || !Number.isFinite(number(cells[index])))) {
        return {
          defined: false,
          reason: `Рядок ${body[rowIndex].lineNumber}: нечислове або відсутнє значення.`
        };
      }
      rows.push({ cells, lineNumber: body[rowIndex].lineNumber });
    }
    if (rows.length < 2) {
      return { defined: false, reason: "Для інтегрування потрібні щонайменше дві точки швидкості." };
    }
    const points = rows.map(row => {
      const { cells } = row;
      const rawGrade = gradeIndex >= 0 ? number(cells[gradeIndex]) : 0;
      const gradeRatio = gradeUnit === "percent" ? rawGrade / 100
        : gradeUnit === "degree" ? Math.tan(rawGrade * Math.PI / 180)
          : gradeUnit === "radian" ? Math.tan(rawGrade) : rawGrade;
      return {
        timeS: number(cells[timeIndex]),
        speedMs: number(cells[speedIndex]) / (speedUnit === "km/h" ? 3.6 : 1),
        gradeRatio
      };
    });
    for (let index = 0; index < points.length; index += 1) {
      if (points[index].speedMs < 0) {
        return {
          defined: false,
          reason: `Рядок ${rows[index].lineNumber}: швидкість не може бути від’ємною.`
        };
      }
      if (index > 0 && !(points[index].timeS > points[index - 1].timeS)) {
        return { defined: false, reason: "Час у циклі має строго зростати без повторів." };
      }
    }
    const distanceM = points.slice(1).reduce((sum, point, index) => {
      const previous = points[index];
      return sum + (point.speedMs + previous.speedMs) / 2 * (point.timeS - previous.timeS);
    }, 0);
    return {
      defined: true,
      name: comments[0] || "цикл без назви",
      comments,
      points,
      durationS: points[points.length - 1].timeS - points[0].timeS,
      distanceM,
      maximumSpeedMs: Math.max(...points.map(point => point.speedMs)),
      gradeUnit: gradeUnit || "level"
    };
  }

  function cycleDigest(points) {
    const text = (points || []).map(point =>
      `${point.timeS}:${point.speedMs}:${point.gradeRatio}`).join("|");
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash * 31 + text.charCodeAt(index)) | 0;
    }
    return `${(points || []).length}:${(hash >>> 0).toString(16)}`;
  }

  // Інтегрування циклу.
  //
  // На кожному кроці: F = F₀ + F₁v + F₂v² + δ·m·a (+ ухил), P = F·v.
  // Додатна потужність іде з накопичувача через ККД приводу, від'ємна
  // повертається через ККД рекуперації — якщо він заданий. Для теплового
  // двигуна рекуперації немає, і гальмівна енергія просто губиться.
  // Потрібна потужність на колесах у точці циклу. ОДНА функція на обидва
  // шляхи розділу 8: інакше §8.4 і §8.5 їдуть різними дорогами, і на циклі з
  // ухилом вони дають різну енергію того самого руху.
  function wheelPowerAt({ roadLoad, massKg, rotatingMassFactor, speedMs,
    accelerationMs2, gradeRatio = 0 }) {
    return roadLoadAdapter.evaluate({ roadLoad, massKg, rotatingMassFactor,
      speedMs, accelerationMs2, gradeRatio })?.wheelPowerW ?? NaN;
  }

  // Чи лежить точка в межах характеристики машини.
  //
  // Карта — це поверхня втрат, а не характеристика: motorMapEfficiency поверне
  // число для будь-якого моменту, зокрема втричі більшого за той, що машина
  // здатна видати. Втрати в міді ростуть як M², тому така точка дістає вчетверо
  // більші втрати й ККД, якого в природі немає. Межу треба ставити тут.
  //
  // Дві різні речі, які не можна плутати:
  //   — оберти вищі за максимальні машини: автомобіль такої швидкості просто
  //     НЕ РОЗВИНЕ. Це неможливий цикл, а не неточність карти, і запасний ККД
  //     тут не рятує: він оцінює втрати, а не створює відсутню швидкість;
  //   — момент вищий за межу: те саме, машина цього моменту не видає.
  function machineFeasibility(map, torqueNm, angularSpeed) {
    const corner = finiteNumber(map?.cornerTorqueNm);
    const top = finiteNumber(map?.maximumAngularSpeed);
    if (top !== null && top > 0 && angularSpeed > top) {
      return { feasible: false, kind: "speed", limit: top, demanded: angularSpeed };
    }
    if (corner === null || !(corner > 0)) return { feasible: true };
    const base = finiteNumber(map?.baseAngularSpeed);
    // До кутової точки межа — момент, після неї — потужність.
    const limit = base !== null && base > 0 && angularSpeed > base
      ? corner * base / angularSpeed
      : corner;
    if (torqueNm > limit) {
      return { feasible: false, kind: "torque", limit, demanded: torqueNm };
    }
    return { feasible: true };
  }

  function integrate({
    cycle, roadLoad, massKg, rotatingMassFactor = 1.04,
    drivetrainEfficiency, regenerationEfficiency = null, auxiliaryPowerKw = 0,
    motorEfficiencyMap, motorEfficiencyAt, motorPackagePoint, gearRatio, dynamicRadiusM,
    electricShare, fallbackMachineEfficiency = null
  }) {
    if (!cycle?.defined) return { defined: false, reason: cycle?.reason || "Цикл не завантажено." };
    if (!roadLoad?.defined) return { defined: false, reason: roadLoad?.reason || "Опір не визначено." };
    const mass = finiteNumber(massKg);
    const eta = finiteNumber(drivetrainEfficiency);
    const delta = finiteNumber(rotatingMassFactor);
    if (!(mass > 0)) return { defined: false, reason: "Потрібна додатна маса." };
    if (!(eta > 0 && eta <= 1)) return { defined: false, reason: "ККД має лежати в межах (0; 1]." };
    if (!(delta >= 1)) {
      return { defined: false, reason: "Коефіцієнт обертових мас має бути не меншим за 1." };
    }
    const auxiliaryKw = finiteNumber(auxiliaryPowerKw);
    if (!(Number.isFinite(auxiliaryKw) && auxiliaryKw >= 0)) {
      return { defined: false, reason: "Потужність допоміжних споживачів має бути невід’ємною." };
    }
    const regenProvided = regenerationEfficiency !== null
      && regenerationEfficiency !== undefined && regenerationEfficiency !== "";
    const regen = regenProvided ? finiteNumber(regenerationEfficiency) : 0;
    if (regenProvided && !(Number.isFinite(regen) && regen >= 0 && regen <= 1)) {
      return { defined: false, reason: "ККД рекуперації має лежати в межах [0; 1]." };
    }
    const hasRegen = regen > 0;

    // Карта електромашини з розділу 4, якщо вона є. ККД трансмісії тут суто
    // механічний — зубчасті пари, шарніри, шліци, — тож множення на карту не
    // рахує втрати двічі: механічні втрати й втрати в машині різні.
    const ratio = finiteNumber(gearRatio);
    const wheelRadius = finiteNumber(dynamicRadiusM);
    // Частка тяги, яку веде електромашина. У електромобіля це вся тяга; у
    // паралельного гібрида — лише частина, і накидати втрати машини на ту
    // частину, яку веде двигун, не можна: двигунові тоді доводиться платити
    // паливом за втрати в машині, що тих кіловат навіть не бачила.
    const share = finiteNumber(electricShare);
    // Частка потрібна там, де вона щось міняє: коли є карта машини. Без карти
    // весь привод іде через один оголошений ККД, і питання частки не постає.
    //
    // А коли карта є, частки, якої не задали, НЕ можна прийняти за одиницю:
    // гібрид без оголошеної стратегії — це не електромобіль, і мовчки зробити
    // його електромобілем означає видати правдоподібне число там, де
    // відповіді немає.
    const mapGiven = Boolean(motorEfficiencyMap?.defined);
    const shareDeclared = electricShare !== undefined && electricShare !== null
      && electricShare !== "";
    if (mapGiven && !shareDeclared) {
      return {
        defined: false,
        reason: "Частку тяги, яку веде електромашина, не оголошено. Для "
          + "гібрида це стратегія керування, і без неї циклу не порахувати: "
          + "прийняти одиницю означало б порахувати електромобіль."
      };
    }
    // Частка поза [0; 1] — це описка, а не край діапазону. Затиснути −0,2 до
    // нуля й 1,7 до одиниці означає порахувати ЩОСЬ ІНШЕ, ніж просили, і не
    // сказати про це: саме такі мовчазні виправлення цей документ і не робить.
    if (shareDeclared && (share === null || share < 0 || share > 1)) {
      return {
        defined: false,
        reason: `Частка тяги електромашини ${JSON.stringify(electricShare)} `
          + "лежить поза межами від 0 до 1. Це описка, і затискати її до межі "
          + "не можна: вийшов би розрахунок іншої машини."
      };
    }
    const machineShare = shareDeclared ? share : 1;
    const kinematicsGiven = ratio !== null && ratio > 0
      && wheelRadius !== null && wheelRadius > 0;
    const motorPackage = motorEfficiencyMap?.componentPackage?.componentType === "motor" && machineShare > 0;
    if (motorPackage && (!kinematicsGiven || typeof motorPackagePoint !== "function")) {
      return { defined: false, reason: "Для пакета електромашини потрібні кінематика та адаптер потужності." };
    }
    const useMotorMap = Boolean(motorEfficiencyMap?.defined)
      && (motorPackage ? typeof motorPackagePoint === "function" : typeof motorEfficiencyAt === "function")
      && kinematicsGiven && machineShare > 0;
    if (motorEfficiencyMap?.measured && !motorEfficiencyMap.defined) {
      return { defined: false, reason: motorEfficiencyMap.reason };
    }

    // Машина, яку оголосили, мусить мати ККД — із карти або з оголошеного
    // запасного числа. Мовчки лишити її з самим механічним ККД означає дати їй
    // 100 %: на тому самому циклі втрата ОДНОГО входу (передаточного числа)
    // зменшувала витрату на 28 %, і жодне число про це не казало.
    const machineDeclared = shareDeclared && machineShare > 0;
    const fallbackDeclared = finiteNumber(fallbackMachineEfficiency) !== null
      && finiteNumber(fallbackMachineEfficiency) > 0
      && finiteNumber(fallbackMachineEfficiency) <= 1;
    // Запасний ККД замінює невідому ЕФЕКТИВНІСТЬ, але не невідому
    // ЗДІЙСНЕННІСТЬ. Якщо характеристика машини є, а обертів із неї не
    // дістати, перевірити межі неможливо — і мовчки порахувати теж не можна:
    // саме так відсутнє передаточне число обходило перевірку максимальних
    // обертів і давало готове число для циклу, якого машина не проїхала б.
    // Межу можна перевірити, коли характеристика справді задає межу. Умова
    // мусить збігатися з тією, яку вживає machineFeasibility: там обидві межі
    // перевіряють на > 0, тож нуль — це «межі немає», а не «межа нульова».
    const envelopeKnown = Boolean(motorEfficiencyMap?.defined)
      && ((finiteNumber(motorEfficiencyMap.maximumAngularSpeed) ?? 0) > 0
        || (finiteNumber(motorEfficiencyMap.cornerTorqueNm) ?? 0) > 0);
    if (machineDeclared && envelopeKnown && !kinematicsGiven) {
      return {
        defined: false,
        reason: "Характеристика електромашини відома, але передаточного числа "
          + "або радіуса колеса немає, тому обертів машини не дістати й меж її "
          + "не перевірити. Запасний ККД тут не рятує: він замінює невідому "
          + "ефективність, а не невідому здійсненність."
      };
    }
    if (machineDeclared && !useMotorMap && !fallbackDeclared) {
      return {
        defined: false,
        reason: "Оголошено частку тяги для електромашини, але її ККД узяти "
          + "нізвідки: немає ні придатної карти, ні оголошеного запасного ККД. "
          + "Порахувати так означало б дати машині ККД 100 %."
      };
    }
    // Перевірка здійсненності не залежить ні від функції ККД, ні від знака
    // потужності, ні від того, чи карта вживається для ефективності.
    const checkFeasibility = !motorPackage && envelopeKnown && kinematicsGiven && machineShare > 0;

    const steps = [];
    let tractionJ = 0;
    let recoveredJ = 0;
    let auxiliaryJ = 0;
    let mappedJ = 0;
    let mappedWeightedEfficiency = 0;
    let unmappedSeconds = 0;
    let outsideEnvelopeSeconds = 0;
    let fallbackJ = 0;
    const machineInfeasible = [];
    let machineInfeasibleSeconds = 0;
    let speedInfeasibleSeconds = 0;
    let electricTractionJ = 0;
    let engineTractionJ = 0;
    for (let index = 1; index < cycle.points.length; index += 1) {
      const previous = cycle.points[index - 1];
      const current = cycle.points[index];
      const dt = current.timeS - previous.timeS;
      if (!(dt > 0)) continue;
      const speedMs = (current.speedMs + previous.speedMs) / 2;
      const accelerationMs2 = (current.speedMs - previous.speedMs) / dt;
      const gradeRatio = (finiteNumber(previous.gradeRatio || 0) + finiteNumber(current.gradeRatio || 0)) / 2;
      const wheelPowerW = wheelPowerAt({
        roadLoad, massKg: mass, rotatingMassFactor: delta,
        speedMs, accelerationMs2, gradeRatio
      });
      const wheelForceN = speedMs > 0 ? wheelPowerW / speedMs : 0;

      const positiveWheelEnergyJ = Math.max(wheelPowerW, 0) * dt;
      // ККД цієї точки. Без карти він сталий; із картою механічна частина
      // лишається сталою, а машинна залежить від моменту й обертів.
      let pointEfficiency = eta;
      if (machineDeclared && !useMotorMap && wheelPowerW > 0) {
        // Карти немає (або немає кінематики) — але машина оголошена, тож її
        // ККД береться з оголошеного запасного числа, а не зникає.
        const fallback = finiteNumber(fallbackMachineEfficiency);
        pointEfficiency = eta / (machineShare / fallback + (1 - machineShare));
        fallbackJ += positiveWheelEnergyJ;
        unmappedSeconds += dt;
      }
      // ЗДІЙСНЕННІСТЬ — окремо від ефективності. Машина зчеплена з колесами,
      // тож обертається щоразу, коли колеса обертаються: гальмує автомобіль чи
      // тягне, значення не має. Тому перевіряють кожну точку, а не лише ті, де
      // useMotorMap, де є придатна функція ККД і де потужність додатна.
      let outsideEnvelope = false;
      if (checkFeasibility) {
        // Швидкість беруть НАЙБІЛЬШУ на відрізку, а не середню: машина мусить
        // витримати пік, а не середнє. Середня применшувала вимогу циклу вдвічі
        // й ставила поруч точну межу машини.
        const peakSpeedMs = Math.max(previous.speedMs, current.speedMs);
        const peakAngularSpeed = peakSpeedMs * ratio / wheelRadius;
        const machineAngularSpeed = speedMs * ratio / wheelRadius;
        // Момент має сенс лише в тязі: у рекуперації межа інша й ця карта її
        // не описує. Оберти ж перевіряють завжди.
        const machineTorqueNm = wheelPowerW > 0 && machineAngularSpeed > 0
          ? wheelPowerW * machineShare / eta / machineAngularSpeed : 0;
        // Дві перевірки — дві РІЗНІ робочі точки, і плутати їх не можна.
        // Оберти перевіряють за піковою швидкістю: машина мусить витримати
        // пік. Момент — за тією самою середньою точкою, на якій його й
        // порахували: підставити піковi оберти під середній момент означає
        // порівняти момент однієї точки з межею іншої й відмовити там, де
        // машина справляється.
        const speedCheck = machineFeasibility(motorEfficiencyMap, 0, peakAngularSpeed);
        const feasibility = !speedCheck.feasible
          ? speedCheck
          : machineFeasibility(motorEfficiencyMap, machineTorqueNm,
            machineAngularSpeed);
        if (!feasibility.feasible) {
          outsideEnvelope = true;
          // Тривалість, а не кількість точок: на циклі з кроком 10 с два
          // відліки — це двадцять секунд.
          machineInfeasibleSeconds += dt;
          if (feasibility.kind === "speed") speedInfeasibleSeconds += dt;
          machineInfeasible.push({
            timeS: current.timeS, peakSpeedMs, kind: feasibility.kind,
            limit: feasibility.limit, demanded: feasibility.demanded
          });
        }
      }
      if (useMotorMap && !motorPackage && wheelPowerW > 0) {
        const machineAngularSpeed = speedMs * ratio / wheelRadius;
        // Момент рахують від ТІЄЇ частки тяги, яку веде машина.
        const machineShaftPowerW = wheelPowerW * machineShare / eta;
        const machineTorqueNm = machineAngularSpeed > 0
          ? machineShaftPowerW / machineAngularSpeed : null;
        const machineEfficiency = machineTorqueNm === null || outsideEnvelope
          ? null
          : motorEfficiencyAt({
            torqueNm: machineTorqueNm, angularSpeed: machineAngularSpeed,
            copper: motorEfficiencyMap.coefficients.copper,
            iron: motorEfficiencyMap.coefficients.iron
          });
        if (motorEfficiencyMap.measured && machineEfficiency === null && !outsideEnvelope) {
          return { defined: false, reason: "Робоча точка циклу поза виміряною картою електромашини.",
            mapFailure: { fromS: previous.timeS, toS: current.timeS,
              rpm: machineAngularSpeed * 30 / Math.PI, torqueNm: machineTorqueNm } };
        }
        if (machineEfficiency !== null && machineEfficiency > 0) {
          // η_точки = η_м/[s/η_ем + (1 − s)]: машинна частка йде через карту,
          // решта — тільки через механічний ККД.
          pointEfficiency = eta / (machineShare / machineEfficiency
            + (1 - machineShare));
          mappedJ += positiveWheelEnergyJ;
          mappedWeightedEfficiency += machineEfficiency * positiveWheelEnergyJ;
        } else {
          // Карта тут не дає числа — або точка за межами характеристики, або
          // машина не описана. Відкотитися до самого механічного ККД НЕ можна:
          // це означало б досконалу машину, тобто ККД 100 %. Точку беруть за
          // прийнятим запасним ККД, і документ каже, скільки таких секунд і
          // звідки взяте число.
          const fallback = finiteNumber(fallbackMachineEfficiency);
          if (fallback === null || !(fallback > 0) || fallback > 1) {
            return {
              defined: false,
              reason: "Карта електромашини не покриває всього циклу, а "
                + "запасного ККД машини не оголошено. Без нього ці точки "
                + "рахувалися б із досконалою машиною."
            };
          }
          pointEfficiency = eta / (machineShare / fallback + (1 - machineShare));
          fallbackJ += positiveWheelEnergyJ;
          if (outsideEnvelope) outsideEnvelopeSeconds += dt;
          else unmappedSeconds += dt;
        }
      }
      let tractionInputEnergyJ = positiveWheelEnergyJ / pointEfficiency;
      let recoveredEnergyJ = wheelPowerW < 0 && hasRegen ? -wheelPowerW * regen * dt : 0;
      let motorComponent, motorQuery;
      if (motorPackage) {
        motorQuery = { wheelPowerW, speedMs, peakSpeedMs: Math.max(previous.speedMs, current.speedMs),
          mechanicalEfficiency: eta, gearRatio: ratio, dynamicRadiusM: wheelRadius,
          electricShare: machineShare, regenerationEfficiency: regen };
        const point = motorPackagePoint(motorQuery);
        if (!point.defined) return { defined: false, reason: `Пакет електромашини не покриває ділянку циклу: ${point.reason}.`,
          mapFailure: { fromS: previous.timeS, toS: current.timeS,
            rpm: point.angularSpeed * 30 / Math.PI, torqueNm: point.torqueNm, reason: point.reason } };
        tractionInputEnergyJ = (point.electricInputPowerW + point.engineInputPowerW) * dt;
        recoveredEnergyJ = point.recoveredPowerW * dt;
        motorComponent = point.motorComponent;
        if (wheelPowerW > 0) {
          pointEfficiency = positiveWheelEnergyJ / tractionInputEnergyJ;
          mappedJ += positiveWheelEnergyJ;
          mappedWeightedEfficiency += motorComponent.motorShaftPowerW / motorComponent.motorElectricalPowerW * positiveWheelEnergyJ;
        }
      }
      // Дві гілки тяги окремо: електрична йде з накопичувача через карту
      // машини, механічна — з вала двигуна лише через механічний ККД. Ділити
      // готову суму на частку НЕ можна: у гілок різні ККД, тому їхні частки
      // не s та (1 − s), а s/η_ем та (1 − s) — і саме двигунові дісталися б
      // чужі втрати.
      engineTractionJ += positiveWheelEnergyJ * (1 - machineShare) / eta;
      electricTractionJ += tractionInputEnergyJ
        - positiveWheelEnergyJ * (1 - machineShare) / eta;
      if (motorPackage) {
        tractionJ += tractionInputEnergyJ;
        recoveredJ += recoveredEnergyJ;
      } else if (wheelPowerW > 0) {
        tractionJ += tractionInputEnergyJ;
      } else if (hasRegen) {
        // Повертається не вся від'ємна потужність: частину з'їдають самі
        // гальма й ККД зворотного тракту.
        recoveredJ += -wheelPowerW * regen * dt;
      }
      const auxiliaryEnergyJ = auxiliaryKw * 1000 * dt;
      auxiliaryJ += auxiliaryEnergyJ;
      steps.push({
        fromS: previous.timeS,
        toS: current.timeS,
        timeS: current.timeS,
        dtS: dt,
        speedMs,
        fromSpeedMs: previous.speedMs,
        toSpeedMs: current.speedMs,
        distanceM: speedMs * dt,
        gradeRatio,
        wheelPowerW,
        wheelForceN,
        positiveWheelEnergyJ,
        tractionInputEnergyJ,
        pointEfficiency,
        recoveredEnergyJ,
        auxiliaryEnergyJ,
        ...(motorComponent ? { motorComponent, motorQuery } : {})
      });
    }

    // Цикл, якого автомобіль не виконав би, не має витрати: число тут описувало
    // б рух, що не відбувся. Це не неточність, а конструктивна вада, і сказати
    // про неї треба так, щоб було зрозуміло, що саме змінювати.
    if (machineInfeasible.length) {
      const bySpeed = machineInfeasible.filter(item => item.kind === "speed");
      const worst = machineInfeasible.reduce((top, item) =>
        item.demanded / item.limit > top.demanded / top.limit ? item : top,
      machineInfeasible[0]);
      // Межа машини — це її власні максимальні оберти, переведені в дорожню
      // швидкість, а не перша швидкість, на якій цикл спіткнувся: та залежить
      // від кроку відліків і від того, де саме цикл прискорювався.
      const machineTopSpeedMs = bySpeed.length
        ? finiteNumber(motorEfficiencyMap.maximumAngularSpeed) * wheelRadius / ratio
        : null;
      // Кожна причина відповідає за СВОЇ секунди. Скласти їх і приписати все
      // обертам означає звинуватити межу обертів у тому, чого вона не робила.
      const byTorqueSeconds = machineInfeasibleSeconds - speedInfeasibleSeconds;
      const alsoTorque = bySpeed.length && byTorqueSeconds > 0
        ? ` Ще ${byTorqueSeconds.toFixed(0)} с бракує моменту.` : "";
      return {
        defined: false,
        infeasible: true,
        reason: bySpeed.length
          ? `Цикл вимагає ${(Math.max(...bySpeed.map(i => i.peakSpeedMs)) * 3.6).toFixed(0)} `
            + "км/год, а електромашина з цим передаточним числом вичерпує оберти "
            + `на ${(machineTopSpeedMs * 3.6).toFixed(0)} км/год: `
            + `${speedInfeasibleSeconds.toFixed(0)} с циклу автомобіль не проїхав `
            + `би. Змініть передаточне число або максимальні оберти машини.${alsoTorque}`
          : `Цикл вимагає ${worst.demanded.toFixed(0)} Н·м, а машина на цих `
            + `обертах дає ${worst.limit.toFixed(0)}: `
            + `${machineInfeasibleSeconds.toFixed(0)} с циклу автомобіль не проїхав би.`,
        infeasibleSeconds: machineInfeasibleSeconds,
        speedInfeasibleSeconds
      };
    }

    const netJ = tractionJ - recoveredJ + auxiliaryJ;
    const distanceKm = steps.reduce((sum, step) => sum + step.distanceM, 0) / 1000;
    if (!(distanceKm > 0)) return { defined: false, reason: "Довжина циклу нульова." };
    return {
      defined: true,
      steps,
      distanceKm,
      tractionKwh: tractionJ / 3.6e6,
      recoveredKwh: recoveredJ / 3.6e6,
      // Основа, за якою рахували ККД приводу в кожній точці.
      efficiencyBasis: useMotorMap ? "motor-map" : "constant",
      ...(motorPackage ? { motorComponentPackage: { componentId: motorEfficiencyMap.componentPackage.component.id,
        packageSha256: motorEfficiencyMap.componentPackage.sha256, boundary: motorEfficiencyMap.componentPackage.component.map.boundary,
        rating: "continuous", inverterEfficiency: motorEfficiencyMap.inverterEfficiency } } : {}),
      // Частку оголошують або ні. Неоголошена НЕ дорівнює одиниці: без неї
      // результат є одношляховим, і гілок у ньому немає взагалі — інакше
      // споживач прочитав би «вся тяга електрична» там, де його про це
      // ніхто не питав.
      electricShareDeclared: shareDeclared,
      // Середній ККД машини за цикл, зважений за корисною роботою: саме він
      // показує, чого варта заміна карти однією сталою.
      meanMachineEfficiency: mappedJ > 0 ? mappedWeightedEfficiency / mappedJ : null,
      unmappedSeconds,
      outsideEnvelopeSeconds,
      // Частка корисної роботи, порахована запасним ККД, а не картою.
      fallbackEnergyShare: (mappedJ + fallbackJ) > 0
        ? fallbackJ / (mappedJ + fallbackJ) : 0,
      fallbackMachineEfficiency: finiteNumber(fallbackMachineEfficiency),
      electricShare: shareDeclared ? machineShare : null,
      // Дві гілки тяги, порахованi кожна своїм ККД. Без оголошеної частки
      // ділити нема чого, і полів немає — не нуль і не вся енергія.
      electricTractionKwh: shareDeclared ? electricTractionJ / 3.6e6 : null,
      engineTractionKwh: shareDeclared ? engineTractionJ / 3.6e6 : null,
      auxiliaryKwh: auxiliaryJ / 3.6e6,
      netKwh: netJ / 3.6e6,
      kwhPer100km: netJ / 3.6e6 / distanceKm * 100,
      // Частка поверненої енергії — головне число для електромобіля: саме воно
      // пояснює, чому міський цикл економніший за заміський.
      recoveredShare: tractionJ > 0 ? recoveredJ / tractionJ : 0,
      regenerationApplied: hasRegen
    };
  }

  // Енергія циклу в літрах палива.
  //
  // Q = E·g_e/(ρ·1000), де E — механічна енергія, яку двигун мусить віддати за
  // цикл, g_e — питома витрата (г/кВт·год), ρ — густина палива (г/см³).
  //
  // ЩО ЦЕ Є І ЧОГО ЦЕ НЕ Є. Питому витрату тут беруть СТАЛОЮ за цикл. У
  // справжнього двигуна вона змінюється з обертами й навантаженням, і саме
  // тому сертифікаційна процедура інтегрує карту двигуна по точках циклу,
  // маючи для кожної точки передачу з приписаного алгоритму перемикання.
  // Тут передач за циклом не розподіляють — отже й обертів двигуна не знають,
  // — тому g_e лишається одним числом, а результат є ОЦІНКОЮ, не витратою за
  // WLTP. Розділ 2 рахує усталений рух точніше: там оберти відомі, і до g_N
  // застосовують поправки K_ω та K_B.
  function cycleSpeedCompatibility(cycle, maximumSpeedKmh) {
    const limit=finiteNumber(maximumSpeedKmh);
    if (!cycle?.defined || !(limit>0)) return {defined:false};
    const required=cycle.maximumSpeedMs*3.6;
    const compatible=required<=limit+1e-8;
    const format=value=>value.toLocaleString("uk-UA",{maximumFractionDigits:1});
    return {defined:true,compatible,requiredMaximumSpeedKmh:required,vehicleMaximumSpeedKmh:limit,
      note:compatible ? `Найбільша швидкість циклу ${format(required)} км/год не перевищує заданих ${format(limit)} км/год автомобіля; потужність під час прискорення перевіряють окремо.`
        : `Цикл вимагає ${format(required)} км/год, що перевищує задану максимальну швидкість автомобіля ${format(limit)} км/год. Профіль не обмежено автоматично; потрібен придатний або явно адаптований цикл.`};
  }

  function fuelFromCycle({ integration, specificConsumptionGkWh, fuelDensityGcm3 }) {
    if (!integration?.defined) {
      return { defined: false, reason: integration?.reason || "Циклу ще не пораховано." };
    }
    const specific = finiteNumber(specificConsumptionGkWh);
    const density = finiteNumber(fuelDensityGcm3);
    if (specific === null || specific <= 0) {
      return { defined: false, reason: "Потрібна додатна питома витрата двигуна g_e." };
    }
    if (density === null || density <= 0) {
      return { defined: false, reason: "Потрібна додатна густина палива." };
    }
    const distanceKm = integration.distanceKm;
    if (!(distanceKm > 0)) {
      return { defined: false, reason: "Довжина циклу має бути додатною." };
    }
    // Маса палива в грамах, обсяг у літрах: г/(г/см³) = см³, а 1000 см³ = 1 л.
    const litres = integration.netKwh * specific / (density * 1000);
    return {
      defined: true,
      litres,
      litresPer100km: litres / distanceKm * 100,
      netKwh: integration.netKwh,
      distanceKm,
      specificConsumptionGkWh: specific,
      fuelDensityGcm3: density
    };
  }

  // Розподіл енергії циклу між двигуном і електромашиною.
  //
  // Стратегію керування документ НЕ вигадує: її задає автор проєкту, бо вона
  // є конструкторським рішенням, а не наслідком опору дороги. Задають дві
  // величини:
  //   electricShare — яку частку тягової енергії циклу покриває електромашина;
  //   chargeBalanceKwh — на скільки за цикл змінився запас батареї
  //     (від'ємне — батарея розрядилася, нуль — режим підтримання заряду).
  //
  // Решта — арифметика: що не покрила електромашина, покрив двигун.
  function hybridSplit({ integration, electricShare, chargeBalanceKwh = 0,
    batteryEfficiency = 1 }) {
    if (!integration?.defined) {
      return { defined: false, reason: integration?.reason || "Циклу ще не пораховано." };
    }
    const share = finiteNumber(electricShare);
    const balance = finiteNumber(chargeBalanceKwh);
    const efficiency = finiteNumber(batteryEfficiency);
    if (share === null || share < 0 || share > 1) {
      return {
        defined: false,
        reason: "Частка електромашини має лежати в межах від 0 до 1: це стратегія "
          + "керування, і задає її автор проєкту."
      };
    }
    if (balance === null) {
      return {
        defined: false,
        reason: "Потрібен баланс заряду за цикл: нуль означає режим підтримання "
          + "заряду, від'ємне число — розряд батареї."
      };
    }
    if (efficiency === null || efficiency <= 0 || efficiency > 1) {
      return { defined: false, reason: "ККД батареї має лежати в межах (0; 1]." };
    }
    // Дві гілки тяги інтегратор рахує кожну своїм ККД: електричну — через
    // карту машини, механічну — лише через механічний ККД. Ділити спільне
    // нетто на частку не можна: тоді двигунові дістаються й втрати машини.
    const splitByPath = integration.electricShareDeclared === true
      && Number.isFinite(integration.electricTractionKwh)
      && Number.isFinite(integration.engineTractionKwh)
      && integration.efficiencyBasis === "motor-map";
    const electricKwh = splitByPath
      ? integration.electricTractionKwh
        - integration.recoveredKwh + integration.auxiliaryKwh
      : integration.netKwh * share;
    const engineKwh = splitByPath
      ? integration.engineTractionKwh
      : integration.netKwh * (1 - share);
    // З батареї беруть рівно стільки, на скільки вона розрядилася; решту
    // електричної енергії виробив двигун через генератор.
    const fromBattery = Math.min(electricKwh, Math.max(0, -balance));
    const electricFromEngineKwh = (electricKwh - fromBattery) / efficiency;
    return {
      defined: true,
      electricShare: share,
      chargeBalanceKwh: balance,
      electricKwh,
      engineKwh,
      fromBatteryKwh: fromBattery,
      electricFromEngineKwh,
      splitByPath,
      batteryEfficiency: efficiency,
      netKwh: integration.netKwh,
      electricTractionKwh: integration.electricTractionKwh,
      engineTractionKwh: integration.engineTractionKwh,
      recoveredKwh: integration.recoveredKwh,
      auxiliaryKwh: integration.auxiliaryKwh,
      // Уся механічна енергія, яку двигун мусить віддати за цикл: пряма тяга
      // плюс те, що він виробив для електромашини.
      totalEngineKwh: engineKwh + electricFromEngineKwh,
      chargeSustaining: balance === 0,
      distanceKm: integration.distanceKm
    };
  }

  // Витрата палива за циклом ПОТОЧКОВО — з передачами.
  //
  // Це те, чого бракувало підрозділу 8.4. Без передач невідомі оберти
  // двигуна, і питому витрату доводилося брати в одній точці — номінальній,
  // — де вона найменша. На циклі двигун там не працює майже ніколи: середнє
  // навантаження легкового автомобіля на WLTC близько десятої частки
  // номінальної потужності, а на такому навантаженні питома витрата
  // вдвічі-втричі більша.
  //
  // Маючи карту перемикань, оберти відомі в кожній точці, а з ними — і
  // поправки K_ω та K_B, тобто вся карта ефективності, яку подає джерело.
  //
  // Паливо інтегрують за МАСОЮ: g_e·P — це грами за годину, і складати треба
  // саме їх, а не літри за сто кілометрів.
  // Quasi-steady controller for a prescribed speed trace. Retain the scheduled
  // gear if feasible; otherwise test lower gears. This is a project controller,
  // not a replacement for a prescribed certification gear schedule.
  function cycleOperatingPoint({ preferred, shiftMap, enginePoints, powerAt,
    wheelPowerFor, eta, share, idleOmega, launchAndIdle, maximumSpeedRatio }) {
    if (!preferred) return null;
    const gears = [preferred, ...(!shiftMap.strategy?.prescribed ? (shiftMap.rows || [])
      .filter(row => row.gear < preferred.gear).sort((a,b) => b.gear-a.gear)
      .map(row => {
        const angularSpeed = preferred.angularSpeed * row.ratio / preferred.ratio;
        return {gear:row.gear,ratio:row.ratio,angularSpeed,
          speedRatio:angularSpeed/shiftMap.ratedAngularSpeed,
          belowMinimum:angularSpeed < row.minimumAngularSpeed};
      }) : [])];
    let bestFailure = null;
    for (const gear of gears) {
      const delta = performanceModule().rotatingMassFactor(gear.ratio);
      const wheelKw = wheelPowerFor(delta);
      const engineKw = wheelKw*share/eta;
      const availableKw = powerAt(enginePoints,gear.angularSpeed);
      const locked = {...gear,delta,wheelKw,engineKw,availableKw,slipping:false};
      if (!gear.belowMinimum && availableKw > 0) {
        if (engineKw <= availableKw + 1e-8) return locked;
        if (!bestFailure || engineKw-availableKw < bestFailure.engineKw-bestFailure.availableKw)
          bestFailure = locked;
      }
      if (!launchAndIdle || gear.gear !== 1 || !(gear.angularSpeed > 0)) continue;
      // With a slipping clutch, engine torque is transmitted at the gearbox
      // input speed. Engine power also pays T*(omegaEngine-omegaInput).
      // The 1.04 factor covers rolling components; engine spin-up dynamics
      // are outside this quasi-steady launch approximation.
      const slipWheelKw = wheelPowerFor(1.04);
      const torqueNm = slipWheelKw*share*1000/(eta*gear.angularSpeed);
      const floor = Math.max(idleOmega,gear.angularSpeed*maximumSpeedRatio);
      const knots = [floor,...enginePoints.map(p=>p.angularSpeed).filter(w=>w>floor)];
      const margin = omega => {
        const power = powerAt(enginePoints,omega);
        return power > 0 ? power-torqueNm*omega/1000 : -Infinity;
      };
      let omega = null;
      for (let i=0;i<knots.length;i++) {
        if (knots[i] <= gear.angularSpeed + 1e-9 || margin(knots[i]) < -1e-9) continue;
        omega=knots[i];
        if (i>0 && margin(knots[i-1]) < 0) {
          let low=knots[i-1],high=omega;
          for(let k=0;k<40;k++) {
            const middle=(low+high)/2;
            if(margin(middle)>=0)high=middle;else low=middle;
          }
          omega=high;
        }
        break;
      }
      if (omega !== null) return {...gear,angularSpeed:omega,
        speedRatio:omega/shiftMap.ratedAngularSpeed,belowMinimum:false,
        delta:1.04,wheelKw:slipWheelKw,engineKw:torqueNm*omega/1000,
        availableKw:powerAt(enginePoints,omega),slipping:true,
        clutchSlipPowerKw:torqueNm*Math.max(0,omega-gear.angularSpeed)/1000};
      // Keep a real torque-limit failure even when all locked gears are below idle.
      for (const omega of knots) {
        const available=powerAt(enginePoints,omega);
        if (!(available>0)) continue;
        const candidate={...gear,angularSpeed:omega,delta:1.04,wheelKw:slipWheelKw,
          engineKw:torqueNm*omega/1000,availableKw:available,slipping:true};
        if (!bestFailure || candidate.engineKw-available < bestFailure.engineKw-bestFailure.availableKw)
          bestFailure=candidate;
      }
    }
    return bestFailure;
  }

  function fuelOverCycle({ cycle, roadLoad, massKg, rotatingMassFactor,
    drivetrainEfficiency, shiftMap, gearAt, powerAt, specificConsumptionGkWh,
    speedFactor, loadFactor, engineKind, fuelDensityGcm3, enginePoints,
    engineEfficiencyMap, mapEfficiencyAt, engineShare, launchAndIdle = false }) {
    if (!cycle?.defined) {
      return { defined: false, reason: cycle?.reason || "Циклу немає." };
    }
    if (!shiftMap?.defined) {
      return { defined: false, reason: shiftMap?.reason || "Карти перемикань немає." };
    }
    if (!roadLoad?.defined) return {defined:false,reason:roadLoad?.reason || "Не задано опір дороги."};
    const mass = finiteNumber(massKg);
    const rotating = finiteNumber(rotatingMassFactor);
    const eta = finiteNumber(drivetrainEfficiency);
    const specific = finiteNumber(specificConsumptionGkWh);
    const density = finiteNumber(fuelDensityGcm3);
    if ([mass, rotating, eta, specific, density]
      .some(value => value === null || value <= 0)) {
      return { defined: false, reason: "Для поточкової витрати бракує величин." };
    }

    // Карта ефективності з розділу 4, якщо вона є. Тоді питому витрату в
    // кожній точці дає лінія Віланса, а добуток g_N·K_ω·K_B рахують поруч —
    // щоб було видно, наскільки й куди дві моделі розходяться НА ЦИКЛІ, а не
    // лише на сітці розділу 4.
    const useMap = Boolean(engineEfficiencyMap?.defined)
      && typeof mapEfficiencyAt === "function"
      && finiteNumber(engineEfficiencyMap.heatingValueMjPerKg) !== null;
    if (engineEfficiencyMap?.measured && !engineEfficiencyMap.defined) {
      return { defined: false, reason: engineEfficiencyMap.reason };
    }

    // Те саме для палива: частка двигуна потрібна там, де є чим її ділити.
    // Її явна відсутність означає звичайний автомобіль — і тоді вона одиниця;
    // а от НЕПРАВИЛЬНА частка (порожній рядок, нуль, більша за одиницю) — це
    // відмова, а не привід узяти одиницю.
    const share = engineShare === undefined ? 1 : finiteNumber(engineShare);
    if (share === null || share <= 0 || share > 1) {
      return {
        defined: false,
        reason: "Частку тяги, яку веде двигун, не оголошено. Для гібрида це "
          + "стратегія керування; прийняти одиницю означало б порахувати "
          + "звичайний автомобіль замість гібрида."
      };
    }

    const idleOmega = finiteNumber(enginePoints?.[0]?.angularSpeed);
    const friction = engineEfficiencyMap?.friction;
    const warmIdleGps = useMap && !engineEfficiencyMap.measured && idleOmega > 0
      && friction?.indicatedEfficiency > 0 && friction?.frictionTorqueNm >= 0
      ? friction.frictionTorqueNm * idleOmega /
        (friction.indicatedEfficiency * engineEfficiencyMap.heatingValueMjPerKg * 1000) : null;
    if (launchAndIdle && (warmIdleGps === null || share !== 1)) {
      return {defined:false,reason:"Для пуску й холостого ходу потрібна явна карта втрат прогрітого єдиного ДВЗ; для гібрида слід задати стани ввімкнення двигуна."};
    }
    let slipEnergyKwh = 0, launchSeconds = 0, modelledIdleSeconds = 0, downshiftSeconds = 0;
    let fuelGrams = 0;
    let methodFuelGrams = 0;
    // Скільки точок карта не змогла порахувати. Мовчазне змішування двох
    // моделей робить із «розбіжності 3 %» число ні про що: частина циклу
    // порахована однією моделлю, частина другою, а підпис каже про одну.
    let mapFallbackSeconds = 0;
    let infeasibleSeconds = 0;
    let infeasibleDeficitKw = 0;
    let infeasibleFirstAtS = 0;
    // Секунди, коли автомобіль тягне, але цей розділ тяги не моделює. Це НЕ
    // холостий хід: змішати їх означало б назвати тягу стоянкою.
    let unpulledSeconds = 0;
    let unpulledDistanceM = 0;
    let deltaMin = Infinity;
    let deltaMax = -Infinity;
    let distanceM = 0;
    let engineJ = 0;
    let idleSeconds = 0;
    let weightedSpecificSum = 0;
    let weightedPowerSum = 0;
    // Ті самі інтервали, за якими складається паливо: рисунок читає їх,
    // а не відтворює фізику або розподіляє готову суму за часом.
    const steps = [];
    const points = cycle.points;
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const dt = current.timeS - previous.timeS;
      if (!(dt > 0)) continue;
      const speedMs = (previous.speedMs + current.speedMs) / 2;
      const accelMs2 = (current.speedMs - previous.speedMs) / dt;
      distanceM += speedMs * dt;

      // Потужність на колесах: та сама функція, що й у §8.4, разом з ухилом.
      const gradeRatio = (finiteNumber(previous.gradeRatio || 0)
        + finiteNumber(current.gradeRatio || 0)) / 2;
      let gear = gearAt(shiftMap, speedMs);
      const scheduledGear = gear?.gear ?? null;
      const wheelPowerFor = delta => wheelPowerAt({roadLoad,massKg:mass,
        rotatingMassFactor:delta,speedMs,accelerationMs2:accelMs2,gradeRatio})/1000;
      let deltaHere = gear?.ratio > 0 ? performanceModule().rotatingMassFactor(gear.ratio) : rotating;
      let wheelKw = wheelPowerFor(deltaHere);
      let operation = wheelKw > 0 ? cycleOperatingPoint({preferred:gear,shiftMap,enginePoints,powerAt,
        wheelPowerFor,eta,share,idleOmega,launchAndIdle,
        maximumSpeedRatio:Math.max(previous.speedMs,current.speedMs)/speedMs}) : null;
      if (operation) {gear=operation;deltaHere=operation.delta;wheelKw=operation.wheelKw;}
      const slipping = Boolean(operation?.slipping);
      deltaMin = Math.min(deltaMin, deltaHere);
      deltaMax = Math.max(deltaMax, deltaHere);
      const step = {
        fromS: previous.timeS, toS: current.timeS, dtS: dt,
        speedMs, gear: gear?.gear ?? null, scheduledGear, rotatingMassFactor:deltaHere,
        angularSpeed: gear?.angularSpeed ?? null,
        wheelPowerKw: wheelKw, status: "unmodelled", fuelGrams: null
      };
      steps.push(step);
      if (!(wheelKw > 0)) {
        // Двигун не тягне: гальмування або стоянка. Витрату на холостому ходу
        // цей розділ не рахує — джерело її не подає, — і мовчазний нуль тут
        // чесніший за вигадане число, але сказати про нього треба.
        idleSeconds += dt;
        const idle = launchAndIdle && (!gear || gear.angularSpeed < idleOmega);
        step.status = idle ? "idle" : launchAndIdle ? "fuel-cut" : "no-traction";
        if (idle) step.angularSpeed = idleOmega;
        step.fuelGrams = idle ? warmIdleGps * dt : 0;
        fuelGrams += step.fuelGrams; methodFuelGrams += step.fuelGrams;
        if (idle) modelledIdleSeconds += dt;
        continue;
      }
      // Двигун везе лише свою частку: решту веде машина, і накидати її на
      // паливо не можна. У звичайного автомобіля частка дорівнює одиниці.
      let engineKw = operation?.engineKw ?? wheelKw * share / eta;
      if (slipping) {
        step.clutchSlipPowerKw = operation.clutchSlipPowerKw ?? 0;
      }
      if (!gear || (gear.belowMinimum && !operation)) {
        // Тут автомобіль ТЯГНЕ (wheelKw > 0), але передача не тримає обертів:
        // це рушання зі зчепленням, якого розділ не моделює. Записати ці
        // секунди до холостого ходу означало б назвати тягу гальмуванням і
        // видати нульову витрату там, де двигун працює.
        unpulledSeconds += dt;
        unpulledDistanceM += speedMs * dt;
        continue;
      }
      const availableKw = powerAt(enginePoints, gear.angularSpeed);
      if (!(availableKw > 0)) {
        unpulledSeconds += dt;
        unpulledDistanceM += speedMs * dt;
        continue;
      }
      // Цикл вимагає більше, ніж двигун здатний дати. Обрізати навантаження
      // до одиниці й порахувати далі означало б видати правдоподібну витрату
      // для руху, якого автомобіль не виконав би.
      if (engineKw > availableKw + 1e-8) {
        infeasibleSeconds += dt;
        infeasibleDeficitKw = Math.max(infeasibleDeficitKw,engineKw-availableKw);
        if (!infeasibleFirstAtS) infeasibleFirstAtS = current.timeS;
        step.status = "infeasible";
        step.enginePowerKw = engineKw;
        step.availablePowerKw = availableKw;
        continue;
      }
      if (slipping) {
        slipEnergyKwh += step.clutchSlipPowerKw*dt/3600;
        launchSeconds += dt;
      }
      if (gear.gear !== scheduledGear) downshiftSeconds += dt;
      const utilisation = engineKw / availableKw;
      const kOmega = speedFactor(gear.speedRatio);
      const kLoad = loadFactor(Math.min(utilisation, 1), engineKind);
      if (kOmega === null || kLoad === null) {
        // Поправок для цього типу двигуна немає — найчастіше тому, що носій
        // енергії взагалі не паливний. Мовчки пропустити точку означало б
        // надрукувати нульову витрату замість відмови.
        return {
          defined: false,
          steps,
          fuelDensityGcm3: density,
          reason: "Поправок K_ω або K_B для цього двигуна немає: перевірте тип "
            + "двигуна й носій енергії. Пропустити ці точки означало б "
            + "надрукувати нульову витрату."
        };
      }
      const methodGkWh = specific * kOmega * kLoad;
      // Карта дає ККД у цій точці; питома витрата з нього — g = 3600/(η·H_u).
      const mapEfficiency = useMap ? mapEfficiencyAt({
        powerKw: engineKw, angularSpeed: gear.angularSpeed,
        indicatedEfficiencyValue: engineEfficiencyMap.friction.indicatedEfficiency,
        frictionTorqueNm: engineEfficiencyMap.friction.frictionTorqueNm
      }) : null;
      const mapGkWh = mapEfficiency !== null && mapEfficiency > 0
        ? 3600 / (mapEfficiency * engineEfficiencyMap.heatingValueMjPerKg)
        : null;
      if (engineEfficiencyMap?.measured && mapGkWh === null) {
        return { defined: false, reason: "Робоча точка циклу поза виміряною картою ДВЗ.",
          mapFailure: { fromS: previous.timeS, toS: current.timeS,
            rpm: gear.angularSpeed * 30 / Math.PI, torqueNm: engineKw * 1000 / gear.angularSpeed } };
      }
      // Основою лишається карта, коли вона є: у неї оберти й навантаження
      // входять як фізичні величини, а не як підігнані многочлени.
      if (useMap && mapGkWh === null) mapFallbackSeconds += dt;
      const effectiveGkWh = mapGkWh ?? methodGkWh;
      // г/кВт·год × кВт × год = грами.
      step.status = slipping ? "clutch-slip" : "traction";
      step.enginePowerKw = engineKw;
      step.availablePowerKw = availableKw;
      step.specificConsumptionGkWh = effectiveGkWh;
      step.fuelGrams = effectiveGkWh * engineKw * (dt / 3600);
      fuelGrams += step.fuelGrams;
      methodFuelGrams += methodGkWh * engineKw * (dt / 3600);
      engineJ += engineKw * 1000 * dt;
      weightedSpecificSum += effectiveGkWh * engineKw * dt;
      weightedPowerSum += engineKw * dt;
    }

    const distanceKm = distanceM / 1000;
    if (!(distanceKm > 0)) {
      return { defined: false, reason: "Довжина циклу вийшла нульовою." };
    }


    // Тяга, якої розділ не моделює, лишає ДІРУ: палива за ці секунди не
    // порахували, а відстань, яку за них проїхали, у знаменнику лишилася. Тому
    // «літрів на 100 км циклу» тут уже не витрата циклу, а суміш порахованого
    // палива з непорахованою відстанню — і знак похибки залежить від того, де
    // саме дірка припала. Такого числа канонічним виходом бути не може.
    // Двигунові бракує потужності — цикл не здійсненний, і витрати він не має.
    // Записати дефіцит в обмеження й водночас надрукувати число означало б
    // подати правдоподібну витрату для руху, якого автомобіль не виконав би.
    if (infeasibleSeconds > 0) {
      const known = steps.filter(step=>Number.isFinite(step.fuelGrams));
      return {
        defined: false,
        infeasible: true,
        countedLitres: fuelGrams/(density*1000),
        coveredSeconds: known.reduce((sum,step)=>sum+step.dtS,0),
        coveredDistanceKm: known.reduce((sum,step)=>sum+step.speedMs*step.dtS,0)/1000,
        distanceKm,
        steps,
        fuelDensityGcm3: density,
        infeasibleSeconds,
        infeasibleDeficitKw,
        checkedWholeCycle: true,
        countedFuelGrams: fuelGrams,
        reason: `Пораховано ${ (fuelGrams/(density*1000)).toLocaleString("uk-UA",{maximumFractionDigits:3}) } л за доступними інтервалами. Перевірено весь цикл. Перша невиконувана ділянка закінчується на ${infeasibleFirstAtS.toFixed(0)} с; `
          + `сумарно ${infeasibleSeconds.toFixed(0)} с бракує тяги, найбільший дефіцит ${infeasibleDeficitKw.toFixed(1)} кВт після перевірки доступних передач і рушання. `
          + "Паливо пораховано для решти інтервалів; пропуски позначено на графіку. Повної витрати за циклом немає."

      };
    }

    // Тяга, якої розділ не моделює, лишає діру. Ділити пораховане паливо на
    // ПОВНУ відстань циклу не можна: у знаменнику опинилася б і та відстань,
    // за яку палива не рахували, і знак похибки залежав би від того, де саме
    // дірка припала. Тому знаменником є ПОКРИТА відстань, а частку покриття
    // документ називає — це чесна величина з оголошеною межею, а не суміш.
    const coveredDistanceM = distanceM - unpulledDistanceM;
    if (!(coveredDistanceM > 0)) {
      return {
        defined: false,
        steps,
        fuelDensityGcm3: density,
        reason: unpulledSeconds > 0
          ? `Увесь рух циклу (${unpulledSeconds.toFixed(0)} с) припав на режими, `
            + "яких розділ не моделює: передача не тримає обертів, тобто "
            + "рушання зі зчепленням. Витрати палива тут немає — нуль означав "
            + "би, що двигун не працює, а він працює."
          : "На жодній точці циклу двигун не тягне, тому витрати палива немає."
      };
    }

    const litres = fuelGrams / (density * 1000);
    const methodLitres = methodFuelGrams / (density * 1000);
    const coveredDistanceKm = coveredDistanceM / 1000;
    const coveredShare = coveredDistanceM / distanceM;
    return {
      defined: true,
      steps,
      fuelDensityGcm3: density,
      litres,
      // На 100 км ПОКРИТОЇ відстані: у знаменнику лише те, за що паливо
      // рахували.
      litresPer100km: litres / coveredDistanceKm * 100,
      coveredDistanceKm,
      coveredShare,
      fuelGrams,
      // Основа, за якою рахували, і те, що дала б інша. Якщо карта десь не
      // спрацювала, основою названо суміш — а не карту.
      basis: !useMap ? "method-coefficients"
        : (mapFallbackSeconds > 0 ? "efficiency-map-with-fallback" : "efficiency-map"),
      mapFallbackSeconds,
      // infeasibleSeconds тут не повертають: дійшовши сюди, вони завжди нуль —
      // за будь-якої неможливої точки функція вже відмовила вище.
      engineShare: share,
      methodLitresPer100km: methodLitres / coveredDistanceKm * 100,
      // Наскільки карта розійшлася з методичкою на всьому циклі.
      mapVersusMethod: methodLitres > 0 ? litres / methodLitres - 1 : null,
      distanceKm,
      engineKwh: engineJ / 3.6e6,
      idleSeconds,
      launchAndIdle, launchSeconds, modelledIdleSeconds, slipEnergyKwh, downshiftSeconds,
      warmIdleLitresPerHour: launchAndIdle ? warmIdleGps * 3600 / (density * 1000) : null,
      unpulledSeconds,
      rotatingMassFactorByGear: true,
      rotatingMassFactorRange: Number.isFinite(deltaMin) ? { min: deltaMin, max: deltaMax } : null,
      // Середня питома витрата, зважена за роботою двигуна: саме її й ховала
      // номінальна точка.
      meanSpecificGkWh: weightedPowerSum > 0
        ? weightedSpecificSum / weightedPowerSum : null,
      ratedSpecificGkWh: specific,
      strategy: shiftMap.strategy,
      ...(engineEfficiencyMap?.componentPackage ? { engineComponentPackage: {
        componentId: engineEfficiencyMap.componentPackage.component.id,
        sha256: engineEfficiencyMap.componentPackage.sha256,
        sourceClass: engineEfficiencyMap.sourceClass,
        heatingValueMjPerKg: engineEfficiencyMap.heatingValueMjPerKg,
        fuelDensityGcm3: density
      } } : {})
    };
  }

  // Зведена витрата гібрида: літри, кіловат-години і їхня СУМА.
  //
  // Гібрид не має однієї витрати. Він має дві, і поки вони лишаються двома
  // числами в різних одиницях, порівняти його ні з бензиновим автомобілем, ні
  // з електромобілем не можна. Спільною мірою слугує ЕНЕРГІЯ: літр палива —
  // це маса ρ, у якій H_u джоулів на кілограм.
  //
  //   E_палива = Q·ρ·H_u        (хімічна енергія, що заїхала в бак)
  //   E_батареї = −ΔW_бат       (енергія, що заїхала з розетки)
  //   E_разом = E_палива + E_батареї
  //
  // Складати їх правомірно саме як ПЕРВИННУ енергію на борту — те, за що
  // заплатили. Складати механічну роботу з хімічною енергією не можна, і тому
  // ККД двигуна тут не косметична подробиця, а те, що взагалі робить суму
  // осмисленою: із хімічної енергії палива до коліс доходить лише η_e.
  function combinedConsumption({ split, engineEfficiency, fuelDensityGcm3,
    heatingValueMjPerKg }) {
    if (!split?.defined) {
      return { defined: false, reason: split?.reason || "Розподілу ще немає." };
    }
    if (!engineEfficiency?.defined) {
      return {
        defined: false,
        reason: engineEfficiency?.reason || "Потрібна карта ефективності двигуна."
      };
    }
    const density = finiteNumber(fuelDensityGcm3);
    const heating = finiteNumber(heatingValueMjPerKg);
    if (density === null || density <= 0 || heating === null || heating <= 0) {
      return { defined: false, reason: "Потрібні густина палива й теплота згоряння." };
    }
    const distanceKm = split.distanceKm;
    if (!(distanceKm > 0)) {
      return { defined: false, reason: "Довжина циклу має бути додатною." };
    }
    // Хімічна енергія, яку двигун мусить спалити, щоб віддати свою механічну.
    const fuelEnergyKwh = split.totalEngineKwh / engineEfficiency.value;
    // 1 кВт·год = 3,6 МДж; маса палива = енергія/теплота; обсяг = маса/густина.
    const fuelKg = fuelEnergyKwh * 3.6 / heating;
    const litres = fuelKg / density;
    // З розетки заїхало рівно стільки, на скільки розрядилася батарея.
    const batteryKwh = Math.max(0, -split.chargeBalanceKwh);
    const totalEnergyKwh = fuelEnergyKwh + batteryKwh;
    const per100 = value => value / distanceKm * 100;
    return {
      defined: true,
      litres,
      litresPer100km: per100(litres),
      fuelEnergyKwh,
      fuelEnergyKwhPer100km: per100(fuelEnergyKwh),
      batteryKwh,
      batteryKwhPer100km: per100(batteryKwh),
      totalEnergyKwh,
      totalEnergyKwhPer100km: per100(totalEnergyKwh),
      // Яку частку первинної енергії дала розетка, а не бак.
      electricEnergyShare: totalEnergyKwh > 0 ? batteryKwh / totalEnergyKwh : 0,
      engineEfficiency: engineEfficiency.value,
      engineEnergyKwh: split.totalEngineKwh,
      fuelDensityGcm3: density,
      heatingValueMjPerKg: heating,
      chargeBalanceKwh: split.chargeBalanceKwh,
      distanceKm,
      chargeSustaining: split.chargeSustaining
    };
  }

  // Фази циклу. Стандарт ділить WLTC на чотири; межі задають у секундах, і
  // вони належать циклові, а не цьому модулю.
  function phaseResults({ cycle, integration, phases }) {
    if (!integration?.defined || !Array.isArray(phases) || !phases.length) return null;
    return phases.map(phase => {
      const inside = integration.steps.map(step => {
        const overlapS = Math.max(0, Math.min(step.toS, phase.toS) - Math.max(step.fromS, phase.fromS));
        return overlapS > 0 ? { step, share: overlapS / step.dtS, overlapS } : null;
      }).filter(Boolean);
      if (!inside.length) return { ...phase, defined: false };
      const distanceM = inside.reduce((sum, item) => sum + item.step.distanceM * item.share, 0);
      const energyJ = inside.reduce((sum, item) =>
        sum + item.step.positiveWheelEnergyJ * item.share, 0);
      const durationS = inside.reduce((sum, item) => sum + item.overlapS, 0);
      return {
        ...phase,
        defined: true,
        distanceKm: distanceM / 1000,
        wheelEnergyKwh: energyJ / 3.6e6,
        averageSpeedKmh: distanceM / durationS * 3.6
      };
    });
  }

  function buildCycleFuelByGearStep({ fuel, ratedEstimate, texNumber }) {
    if (!fuel.defined && fuel.checkedWholeCycle) return {
      id: "drive-cycle-counted-fuel", title: "Паливо на виконуваних інтервалах циклу",
      purpose: "Sum fuel only where engine operating points are feasible; leave whole-cycle consumption undefined.",
      output: {id:"value.drive-cycle-counted-fuel",symbol:"V_{\\mathrm{покр}}",
        label:"Fuel counted on feasible intervals only",valueType:"quantity",canonicalUnit:"L"},
      expression:"sum(knownFuelGrams) / (1000 * fuelDensity)",
      dependencies:["value.drive-cycle-energy","value.shift-map","value.gearbox-ladder","input.fuel-density"],
      equationNumber:"8.5",
      formulaTex:"V_{\\mathrm{покр}}=\\dfrac{\\sum_{i\\in\\mathrm{покр}}\\Delta m_i}{10^3\\rho}",
      substitutionTex:`V_{\\mathrm{покр}}=\\dfrac{${texNumber(fuel.countedFuelGrams,3)}}{10^3\\cdot${texNumber(fuel.fuelDensityGcm3,3)}}=${texNumber(fuel.countedLitres,3)}\\ \\text{л}\\quad(S_{\\mathrm{покр}}=${texNumber(fuel.coveredDistanceKm,3)}\\ \\text{км})`,
      result:{value:fuel.countedLitres,canonicalUnit:"L",displayUnit:"л"},
      method:"project-derivation",sourceRefs:["source.project-derivation"],
      readerNotes:[fuel.reason],assumptions:[],
      limitations:["Паливо лише для виконуваних інтервалів. Пропуски не прирівняно до нуля; повної витрати за циклом у л/100 км не визначено."]
    };

    const textNumber = (value, digits) => texNumber(value, digits).replaceAll("{,}", ",").replaceAll("\\,", "\u00a0");
    const sample = fuel.steps?.find(step => step.specificConsumptionGkWh > 0 && step.enginePowerKw > 0);
    const masses = (fuel.steps || []).map(step => step.fuelGrams).filter(Number.isFinite);
    const massTerms = masses.map(value => texNumber(value, 5));
    // A cycle often starts and finishes with fuel-cut or idle intervals.
    // Show real fuel-consuming terms in the abbreviated sum, keeping an
    // ellipsis wherever intervening/edge intervals have been omitted.
    const nonzeroIndices = masses.flatMap((value, index) => value > 0 ? [index] : []);
    const shownIndices = [...new Set([nonzeroIndices[0], nonzeroIndices[1], nonzeroIndices.at(-1)])]
      .filter(Number.isInteger).sort((a, b) => a - b);
    const abbreviatedTerms = shownIndices.flatMap((index, at) => [
      ...(index > (at ? shownIndices[at - 1] + 1 : 0) ? ["\\ldots"] : []),
      massTerms[index]
    ]);
    if (shownIndices.length && shownIndices.at(-1) < masses.length - 1) abbreviatedTerms.push("\\ldots");
    const massSum = massTerms.length <= 4 || !shownIndices.length
      ? massTerms.join("+") : abbreviatedTerms.join("+");
    const sampleTex = sample
      ? `\\Delta m_{\\mathrm{пал}}&=\\frac{${texNumber(sample.specificConsumptionGkWh, 4)}`
        + `\\cdot${texNumber(sample.enginePowerKw, 5)}\\cdot${texNumber(sample.toS - sample.fromS, 4)}}{3600}`
        + `=${texNumber(sample.fuelGrams, 5)}\\ \\text{г}\\\\ ` : "";
    return {
      id: "drive-cycle-fuel-by-gear",
      title: "Витрата палива за циклом із передачами",
      purpose: "Integrate fuel point by point, with the engine speed the gear gives.",
      output: {
        id: "value.drive-cycle-fuel-by-gear",
        symbol: "Q_{\\mathrm{ц}}",
        label: "Cycle fuel consumption per 100 km, integrated by gear",
        valueType: "quantity",
        canonicalUnit: "L/100km"
      },
      expression: "100 * sum(fuelGramsAtStep) / (1000 * rho * coveredDistanceKm)",
      dependencies: ["value.drive-cycle-energy", "value.shift-map", "value.gearbox-ladder",
        "input.specific-consumption-at-rated-power", fuel.engineComponentPackage
          ? "input.engine-package-fuel-density" : "input.fuel-density",
        ...(fuel.basis.startsWith("efficiency-map")
          ? ["value.engine-efficiency-map"] : [])],
      equationNumber: "8.5",
      formulaTex: "\\Delta m_{\\mathrm{пал},i}=\\frac{g_{e,i}N_{\\mathrm{потр},i}\\Delta t_i}{3600},\\qquad "
        + (fuel.launchAndIdle
          ? "Q_{\\mathrm{ц}}=\\frac{100(\\sum_i\\Delta m_{\\mathrm{пал},i}+m_{\\mathrm{хх}})}{10^3\\rho S_{\\mathrm{покр}}}"
          : "Q_{\\mathrm{ц}}=\\frac{100\\sum_i\\Delta m_{\\mathrm{пал},i}}{10^3\\rho S_{\\mathrm{покр}}}"),
      substitutionTex: `\\begin{aligned}${sampleTex}m_{\\mathrm{пал}}&=${massSum}`
        + `=${texNumber(fuel.fuelGrams, 5)}\\ \\text{г}\\\\ `
        + `Q_{\\mathrm{ц}}&=\\frac{100\\cdot${texNumber(fuel.fuelGrams, 5)}}`
        + `{10^3\\cdot${texNumber(fuel.fuelDensityGcm3, 4)}\\cdot${texNumber(fuel.coveredDistanceKm, 6)}}`
        + `=${texNumber(fuel.litresPer100km, 4)}\\ \\text{л/100 км}`
        + (fuel.coveredShare < 1 ? `\\quad(${texNumber(fuel.coveredShare * 100, 1)}\\%\\ \\text{шляху})` : "")
        + "\\end{aligned}",
      result: {
        value: fuel.litresPer100km, canonicalUnit: "L/100km", displayUnit: "л/100 км"
      },
      method: "project-derivation",
      sourceRefs: ["source.project-derivation", "source.icct.real-world-gap",
        ...(fuel.engineComponentPackage ? ["source.engine-component-package"] : [])],
      readerNotes: [
        "На кожному інтервалі перевіряють потужність вибраної передачі з урахуванням прискорення. Для проєктних стратегій за потреби переходять на нижчу передачу; приписаний алгоритм перемикання не підміняють. Рушання — квазістаціонарне: оберти можуть перевищувати холості, тепло зчеплення включено в енергію двигуна; інерцію розкручування двигуна окремо не моделюють.",
        "У підстановці gₑ задано у г/(кВт·год), Nпотр — у кВт, Δt — у с, ρ — у г/см³, Sпокр — у км. Ділення на 3600 переводить секунди в години, а множник 1000 переводить см³ у літри.",
        ...(fuel.launchAndIdle ? ["Сума включає паливо тягових інтервалів і mхх — паливо на холостому ходу з прийнятої карти втрат (4.20); воно не визначається діленням на нульову корисну потужність."] : []),
        ...(sample ? [`Показано один тяговий інтервал ${textNumber(sample.fromS, 2)}…${textNumber(sample.toS, 2)} с; `
          + `сума палива включає всі ${masses.length} розрахованих інтервалів, а нормування — ${textNumber(fuel.coveredDistanceKm, 6)} км покритої відстані.`] : []),
        fuel.engineComponentPackage
          ? `Пакет ДВЗ ${fuel.engineComponentPackage.componentId}: спочатку інтерполюється витрата палива у г/с, потім ККД. H_u=${fuel.engineComponentPackage.heatingValueMjPerKg} МДж/кг та густина ${fuel.engineComponentPackage.fuelDensityGcm3} кг/л взяті з цього пакета; SHA-256 ${fuel.engineComponentPackage.sha256}. Клас даних: ${fuel.engineComponentPackage.sourceClass}.`
          : fuel.basis.startsWith("efficiency-map")
          ? "Тут питома витрата вже НЕ стала, і бере її розділ не з поправок, а "
            + "з карти ефективності розділу 4. Карта перемикань дає оберти "
            + "двигуна в кожній точці циклу, лінія Віланса — ККД при цих "
            + "обертах і цьому навантаженні, а g_e = 3600/(η·H_u) переводить "
            + "його у грами. Різниця з поправками не в арифметиці: у карті "
            + "оберти й навантаження входять як фізичні величини, а K_ω і K_B "
            + "є многочленами, підігнаними до двигунів своєї доби."
          : "Тут питома витрата вже НЕ стала. Карта перемикань дає оберти "
            + "двигуна в кожній точці циклу, а з обертами й навантаженням — "
            + "обидві поправки джерела, K_ω та K_B.",
        ...(fuel.mapFallbackSeconds > 0
          ? [`Карта не дала питомої витрати на ${textNumber(fuel.mapFallbackSeconds, 0)} `
            + "с циклу — ці точки пораховано поправками методички. Тому "
            + "результат містить інтервали, розраховані різними моделями."]
          : []),
        ...(fuel.mapVersusMethod !== null && fuel.basis.startsWith("efficiency-map")
          ? [`Ті самі точки циклу, пораховані поправками методички, дають `
            + `${textNumber(fuel.methodLitresPer100km, 2)} л/100 км проти `
            + `${textNumber(fuel.litresPer100km, 2)} за картою — розбіжність `
            + `${textNumber(Math.abs(fuel.mapVersusMethod) * 100, 0)} %. Це порівняння двох розрахункових моделей на тих самих інтервалах.`]
          : []),
        `Середня питома витрата за цикл, зважена за роботою двигуна, вийшла `
        + `${textNumber(fuel.meanSpecificGkWh, 0)} г/(кВт·год) — проти `
        + `${textNumber(fuel.ratedSpecificGkWh, 0)} у номінальній точці. У §8.5 витрата залежить від обертів і навантаження, а інерція — від передачі; §8.4 використовує сталу питому витрату.`,
        ratedEstimate > 0 && fuel.coveredShare === 1
          ? `Спрощена оцінка (§8.4): ${textNumber(ratedEstimate, 2)} л/100 км. `
            + `Результат за передачами (§8.5) на ${textNumber(Math.abs(fuel.litresPer100km / ratedEstimate - 1) * 100, 0)} % `
            + (fuel.litresPer100km >= ratedEstimate ? "вищий." : "нижчий.")
          : "",
        `Стратегія перемикання «${fuel.strategy.label.toLowerCase()}» визначає передачу, оберти й навантаження двигуна в кожному інтервалі. Зміна стратегії змінює робочі точки та розраховану витрату.`,
        fuel.launchAndIdle
          ? `Прогрітий двигун: холостий хід ${textNumber(fuel.warmIdleLitresPerHour, 2)} л/год виведено з тієї самої карти втрат; ${textNumber(fuel.modelledIdleSeconds, 0)} с враховано. У першій передачі ${textNumber(fuel.launchSeconds, 0)} с ковзання з підбором обертів за моментом, втрати зчеплення ${textNumber(fuel.slipEnergyKwh, 3)} кВт·год. На примусовому холостому ході вище обертів холостого ходу прийнято відсічення палива. Холодний пуск і температурний стан накладок не змодельовано.`
          : `${textNumber(fuel.idleSeconds, 0)} с циклу двигун не тягне: гальмування `
        + "й стоянки. Витрату на холостому ходу цей розділ не рахує — джерело "
        + "її не подає."
        + (fuel.unpulledSeconds > 0
          ? ` Ще ${textNumber(fuel.unpulledSeconds, 0)} с автомобіль ТЯГНЕ, але `
            + "передача не тримає обертів: це рушання зі зчепленням, якого "
            + "розділ не моделює, і палива за ці секунди він теж не рахує — "
            + "тому результат тут занижений."
          : ""),
        `δ узято за передачею кожного кроку, від ${textNumber(fuel.rotatingMassFactorRange.min, 2)} `
        + `до ${textNumber(fuel.rotatingMassFactorRange.max, 2)}; поле δ стосується лише `
        + "одноступінчастого шляху."
      ].filter(Boolean),
      assumptions: [
        fuel.launchAndIdle ? "Прогрітий ДВЗ; холостий хід із карти втрат, пуск у першій передачі з підбором достатніх обертів за потрібним моментом, відсічення при гальмуванні двигуном. Це не сертифікаційна модель."
          : "Витрату на холостому ходу й під час гальмування прийнято нульовою."
      ],
      limitations: [
        ...(fuel.coveredShare < 1 ? [
          `Результат стосується ${textNumber(fuel.coveredShare * 100, 0)} % шляху `
          + `циклу (${textNumber(fuel.coveredDistanceKm, 2)} з `
          + `${textNumber(fuel.distanceKm, 2)} км), а не всього циклу: `
          + `${textNumber(fuel.unpulledSeconds, 0)} с автомобіль тягне, але `
          + "передача не тримає обертів — це рушання зі зчепленням, якого "
          + "розділ не моделює. Знаменником узято саме покриту відстань: "
          + "поділити на повну означало б домішати відстань, за яку палива не "
          + "рахували, і знак похибки залежав би від того, де саме дірка "
          + "припала."
        ] : []),
        ...(fuel.engineShare < 1 ? [
          `Двигун веде ${textNumber(fuel.engineShare * 100, 0)} % тяги; решту `
          + "везе електромашина, і в паливо вона не входить."
        ] : []),
        "Це не витрата за WLTP: там опір беруть із вибігу, передачі — з "
        + "приписаного алгоритму, а фази зважують.",
        // Число тут паспортного роду, і читач має знати, наскільки воно
        // відрізняється від того, що покаже бак.
        "Витрата тут ПАСПОРТНОГО роду: вона описує автомобіль на приписаному "
        + "циклі, а не в житті. Розрив між ними виміряний за журналами "
        + "заправок власників: для бензинового двигуна реальна витрата вища "
        + "приблизно на 14 % і росте (8 % у 2018 році, 14 % у 2022). "
        + "Паспортне число — стандартизована величина, яка ТИПОВО занижує "
        + "середню по флоту реальну витрату. Це властивість сукупності, а не "
        + "межа для окремої машини: в ощадливих руках вона може виявитися й "
        + "нижчою за паспортну."
      ]
    };
  }

  function buildCycleFuelStep({ fuel, texNumber }) {
    const textNumber = (value, digits) => texNumber(value, digits).replaceAll("{,}", ",").replaceAll("\\,", "\u00a0");
    return {
      id: "drive-cycle-fuel",
      title: "Оцінка палива за сталою питомою витратою",
      purpose: "Turn the cycle's mechanical energy into litres of fuel.",
      output: {
        id: "value.drive-cycle-fuel",
        symbol: "Q_{\\mathrm{ц}}",
        label: "Cycle fuel consumption per 100 km",
        valueType: "quantity",
        canonicalUnit: "L/100km"
      },
      expression: "E * g / (rho * 1000) / s * 100",
      dependencies: ["value.drive-cycle-energy", "input.specific-consumption-at-rated-power",
        "input.fuel-density"],
      equationNumber: "8.4",
      formulaTex: "Q_{\\mathrm{ц}}=\\dfrac{E_{\\mathrm{ц}}g_e}"
        + "{\\rho\\cdot10^{3}}\\cdot\\dfrac{100}{s_{\\mathrm{ц}}}",
      substitutionTex: `Q_{\\mathrm{ц}}=\\dfrac{${texNumber(fuel.netKwh, 2)}\\cdot`
        + `${texNumber(fuel.specificConsumptionGkWh, 0)}}`
        + `{${texNumber(fuel.fuelDensityGcm3, 3)}\\cdot10^{3}}\\cdot`
        + `\\dfrac{100}{${texNumber(fuel.distanceKm, 2)}}`
        + `=${texNumber(fuel.litresPer100km, 2)}\\ \\text{л/100 км}`,
      result: {
        value: fuel.litresPer100km, canonicalUnit: "L/100km", displayUnit: "л/100 км"
      },
      method: "project-derivation",
      sourceRefs: ["source.project-derivation"],
      readerNotes: [
        `За цикл двигун віддає ${textNumber(fuel.netKwh, 2)} кВт·год механічної `
        + `енергії на ${textNumber(fuel.distanceKm, 2)} км. Помноживши на питому `
        + `витрату й поділивши на густину, дістають ${textNumber(fuel.litres, 2)} л.`,
        "У (8.4) питома витрата стала й дорівнює значенню в номінальній точці. Ця спрощена оцінка не враховує зміну режимів двигуна та паливо на холостому ходу.",
        "У §8.5 окремо інтегрують паливо за передачами, обертами й навантаженням; для моделі з рушанням враховують також прогрітий холостий хід і ковзання зчеплення. Тому результат (8.5) може відрізнятися від (8.4). Це розрахункові оцінки, а не сертифікаційна витрата за WLTP."

      ],
      assumptions: [
        "Питома витрата палива стала на всьому циклі."
      ],
      limitations: [
        "Не є сертифікаційною витратою: немає ні опору з вибігу, ні приписаного "
        + "алгоритму перемикання, ні вагування фаз."
      ]
    };
  }

  function buildHybridSplitStep({ split, texNumber }) {
    const textNumber = (value, digits) => texNumber(value, digits).replaceAll("{,}", ",").replaceAll("\\,", "\u00a0");
    const pathFormula = split.splitByPath
      ? "E_{\\mathrm{ел}}=E_{\\mathrm{тр,ел}}-E_{\\mathrm{рек}}+E_{\\mathrm{доп}},\\quad E_{\\mathrm{мех}}=E_{\\mathrm{тр,дв}}"
      : "E_{\\mathrm{ел}}=E_{\\mathrm{ц}}x,\\quad E_{\\mathrm{мех}}=E_{\\mathrm{ц}}(1-x)";
    const pathSubstitution = split.splitByPath
      ? `E_{\\mathrm{ел}}&=${texNumber(split.electricTractionKwh, 6)}-${texNumber(split.recoveredKwh, 6)}`
        + `+${texNumber(split.auxiliaryKwh, 6)}=${texNumber(split.electricKwh, 6)}\\ \\text{кВт·год}\\\\ `
        + `E_{\\mathrm{мех}}&=E_{\\mathrm{тр,дв}}=${texNumber(split.engineTractionKwh, 6)}\\ \\text{кВт·год}\\\\ `
      : `E_{\\mathrm{ел}}&=${texNumber(split.netKwh, 6)}\\cdot${texNumber(split.electricShare, 4)}`
        + `=${texNumber(split.electricKwh, 6)}\\ \\text{кВт·год}\\\\ `
        + `E_{\\mathrm{мех}}&=${texNumber(split.netKwh, 6)}(1-${texNumber(split.electricShare, 4)})`
        + `=${texNumber(split.engineKwh, 6)}\\ \\text{кВт·год}\\\\ `;
    return {
      id: "hybrid-energy-split",
      title: "Розподіл енергії циклу між двигуном і електромашиною",
      purpose: "Apply the author's energy-management strategy to the cycle energy.",
      output: {
        id: "value.hybrid-engine-energy",
        symbol: "E_{\\mathrm{дв}}",
        label: "Cycle energy the engine must deliver",
        valueType: "quantity",
        canonicalUnit: "kWh"
      },
      expression: "enginePathKwh + (electricPathKwh - min(electricPathKwh, max(0, -chargeBalanceKwh))) / batteryEfficiency",
      dependencies: ["value.drive-cycle-energy", "input.hybrid-electric-share",
        "input.hybrid-charge-balance"],
      equationNumber: "8.6",
      formulaTex: pathFormula + ",\\qquad E_{\\mathrm{бат}}=\\min(E_{\\mathrm{ел}},\\max(0,-\\Delta W_{\\mathrm{бат}})),\\qquad "
        + "E_{\\mathrm{дв}}=E_{\\mathrm{мех}}+\\frac{E_{\\mathrm{ел}}-E_{\\mathrm{бат}}}{\\eta_{\\mathrm{бат}}}",
      substitutionTex: `\\begin{aligned}${pathSubstitution}E_{\\mathrm{бат}}&=\\min(${texNumber(split.electricKwh, 6)},`
        + `\\max(0,-(${texNumber(split.chargeBalanceKwh, 6)})))=${texNumber(split.fromBatteryKwh, 6)}\\ \\text{кВт·год}\\\\ `
        + `E_{\\mathrm{дв}}&=${texNumber(split.engineKwh, 6)}+\\frac{${texNumber(split.electricKwh, 6)}`
        + `-${texNumber(split.fromBatteryKwh, 6)}}{${texNumber(split.batteryEfficiency, 4)}}`
        + `=${texNumber(split.totalEngineKwh, 6)}\\ \\text{кВт·год}\\end{aligned}`,
      result: {
        value: split.totalEngineKwh, canonicalUnit: "kWh", displayUnit: "кВт·год"
      },
      method: "project-input",
      sourceRefs: ["source.project-input", "source.icct.real-world-gap"],
      readerNotes: [
        split.splitByPath
          ? "Механічну та електричну тягову енергію взято окремо з інтегрування (8.3), бо їхні ККД різні; спільну енергію повторно на частку x не ділять."
          : "За сталого ККД енергію циклу поділено за прийнятою часткою x. Від'ємний ΔWбат означає розряд; від батареї зараховано не більше електричної потреби.",
        "Стратегію керування документ НЕ вигадує: частку електромашини й баланс "
        + "заряду задає автор проєкту, бо це конструкторське рішення, а не "
        + "наслідок опору дороги. Решта — арифметика.",
        split.chargeSustaining
          ? "Баланс заряду нульовий — це режим ПІДТРИМАННЯ ЗАРЯДУ: батарея "
            + "закінчує цикл з тим самим запасом, з яким почала, отже всю "
            + "енергію зрештою дав двигун. Саме так вимірюють витрату гібрида, "
            + "який не заряджають від мережі."
          : `Батарея за цикл віддала ${textNumber(-split.chargeBalanceKwh, 2)} `
            + "кВт·год — це режим РОЗРЯДУ. Стільки енергії приїхало з розетки, і "
            + "порівнювати таку витрату з витратою звичайного автомобіля можна "
            + "лише разом із цим числом.",
        `З ${textNumber(split.electricKwh, 2)} кВт·год, які дала електромашина, `
        + `${textNumber(split.fromBatteryKwh, 2)} взято з батареї, а `
        + `${textNumber(split.electricFromEngineKwh, 2)} виробив двигун.`
      ],
      assumptions: [
        "Частка електромашини стала на всьому циклі: миттєвого керування цей "
        + "розділ не моделює."
      ],
      limitations: [
        "Це не сертифікаційна процедура: у ній частку визначає алгоритм "
        + "керування автомобіля, а не одне число, і результат зважують по фазах.",
        // Найбільший розрив між паспортом і дійсністю — саме тут, і причина
        // не в моделі, а в тому, що процедура передбачає поведінку, якої
        // здебільшого немає.
        "Паспортна витрата підзарядного гібрида типово занижена НЕ на "
        + "відсотки, а в рази, і множник залежить від сукупності: для паспорта "
        + "за NEDC це 220…240 % у приватних автомобілів і 360…410 % у "
        + "службових, для паспорта за WLTP — у три-п'ять разів. Причина не в "
        + "моделі й не у вимірюванні: процедура передбачає щоденне "
        + "заряджання, а частка руху на електриці в дійсності близько 45…49 % "
        + "у приватних машин і 11…15 % у службових. Та сама конструкція й той "
        + "самий паспорт — інша звичка заряджати; тому це число міряє водія, а "
        + "не автомобіль, і одним числом витрата такої машини не описується."
      ]
    };
  }

  function buildCombinedConsumptionStep({ combined, texNumber }) {
    const textNumber = (value, digits) => texNumber(value, digits).replaceAll("{,}", ",").replaceAll("\\,", "\u00a0");
    return {
      id: "combined-cycle-consumption",
      title: "Зведена витрата за циклом",
      purpose: "Put litres and kilowatt-hours on one scale so they can be added.",
      output: {
        id: "value.combined-cycle-consumption",
        symbol: "E_{\\text{разом}}",
        label: "Combined primary energy per 100 km",
        valueType: "quantity",
        canonicalUnit: "kWh/100km"
      },
      expression: "100 * (engineEnergyKwh / engineEfficiency + max(0, -chargeBalanceKwh)) / distanceKm",
      dependencies: ["value.hybrid-engine-energy", "input.specific-consumption-at-rated-power",
        "input.fuel-density", "input.hybrid-charge-balance"],
      equationNumber: "8.7",
      formulaTex: "E_{\\text{пал}}=\\dfrac{E_{\\text{дв}}}{\\eta_e},\\qquad "
        + "Q_{100}=\\dfrac{100\\cdot E_{\\text{пал}}\\cdot3{,}6}{H_u\\rho S_{\\mathrm{ц}}},\\qquad "
        + "E_{\\text{бат}}=\\max(0,-\\Delta W_{\\mathrm{бат}}),\\qquad "
        + "E_{\\text{разом},100}=\\frac{100(E_{\\text{пал}}+E_{\\text{бат}})}{S_{\\mathrm{ц}}}",
      substitutionTex: `\\begin{aligned}E_{\\text{пал}}&=\\frac{${texNumber(combined.engineEnergyKwh, 6)}}`
        + `{${texNumber(combined.engineEfficiency, 6)}}=${texNumber(combined.fuelEnergyKwh, 6)}\\ \\text{кВт·год}\\\\ `
        + `Q_{100}&=\\frac{100\\cdot${texNumber(combined.fuelEnergyKwh, 6)}\\cdot3{,}6}`
        + `{${texNumber(combined.heatingValueMjPerKg, 3)}\\cdot${texNumber(combined.fuelDensityGcm3, 4)}`
        + `\\cdot${texNumber(combined.distanceKm, 6)}}=${texNumber(combined.litresPer100km, 4)}\\ \\text{л/100 км}\\\\ `
        + `E_{\\text{бат}}&=\\max(0,-(${texNumber(combined.chargeBalanceKwh, 6)}))`
        + `=${texNumber(combined.batteryKwh, 6)}\\ \\text{кВт·год}\\\\ `
        + `E_{\\text{разом},100}&=\\frac{100(${texNumber(combined.fuelEnergyKwh, 6)}+${texNumber(combined.batteryKwh, 6)})}`
        + `{${texNumber(combined.distanceKm, 6)}}=${texNumber(combined.totalEnergyKwhPer100km, 4)}\\ \\text{кВт·год/100 км}\\end{aligned}`,
      result: {
        value: combined.totalEnergyKwhPer100km,
        canonicalUnit: "kWh/100km", displayUnit: "кВт·год/100 км"
      },
      method: "project-derivation",
      sourceRefs: ["source.project-derivation"],
      readerNotes: [
        "Гібрид не має однієї витрати — він має дві, і поки вони лишаються "
        + "двома числами в різних одиницях, порівняти його ні з бензиновим "
        + "автомобілем, ні з електромобілем не можна. Спільною мірою слугує "
        + "ПЕРВИННА ЕНЕРГІЯ: те, за що заплатили, — літри в баку й кіловат-"
        + "години з розетки.",
        // Найважливіше, що читач має винести з цього кроку.
        "Зверніть увагу: при СТАЛОМУ ККД двигуна гібрид у режимі підтримання "
        + "заряду показує ту саму витрату, що й звичайний автомобіль із тим "
        + "самим двигуном. Це не хиба розрахунку — це те, що з такою моделлю "
        + "тільки й може вийти: батарея сама енергії не додає, вона лише "
        + "перерозподіляє її в часі.",
        "Справжня вигода гібрида живе саме в КАРТІ ЕФЕКТИВНОСТІ. Двигун на "
        + "чверті навантаження витрачає близько 415 г/кВт·год замість 250, "
        + "тобто його ККД падає з 33 до 20 відсотків. Електромашина дозволяє "
        + "не працювати в цій зоні: двигун або вимикається, або йде на "
        + "вигіднішому навантаженні. Щоб вигоду побачити числом, задайте "
        + "коефіцієнт використання потужності двигуна — і ККД у виразі вище "
        + "зміниться разом із ним.",
        `Літр палива несе ρ·H_u енергії; ККД двигуна ${textNumber(combined.engineEfficiency * 100, 1)} % `
        + "каже, скільки з неї доходить до коліс. Саме тому ККД тут не "
        + "косметична подробиця: без нього суму складати не було б із чого.",
        combined.chargeSustaining
          ? "Баланс заряду нульовий, отже з розетки не заїхало нічого, і вся "
            + "первинна енергія — це паливо. Витрата такого гібрида дорівнює "
            + "витраті звичайного автомобіля з тим самим двигуном: батарея "
            + "лише перерозподілила енергію в часі, а не додала її."
          : `З розетки заїхало ${textNumber(combined.batteryKwhPer100km, 2)} `
            + `кВт·год/100 км — ${textNumber(combined.electricEnergyShare * 100, 0)} % `
            + "усієї первинної енергії. Порівнювати таку витрату палива з "
            + "витратою звичайного автомобіля можна лише разом із цим числом."
      ],
      assumptions: [
        "Теплота згоряння взята табличною для цього палива: курсова методичка "
        + "її не подає.",
        "Складають первинну енергію на борту, а не роботу на колесах: втрати "
        + "виробництва палива й електрики в жодне з чисел не входять."
      ],
      limitations: [
        "Це не «еквівалентна витрата палива» сертифікаційних процедур: там "
        + "електрику переводять у літри за приписаним коефіцієнтом і зважують "
        + "фази, а тут обидві величини лишаються собою."
      ]
    };
  }

  function buildCycleEnergyStep({
    cycle, cycleFileName = null, teachingCycle = false, selectionNote = null, integration, roadLoad,
    efficiencyRef, electrified, hybrid = false, texNumber
  }) {
    const textNumber = (value, digits) => texNumber(value, digits).replaceAll("{,}", ",").replaceAll("\\,", "\u00a0");
    const design = roadLoad?.source === "design-speed-dependent";
    const motorPacket = integration?.motorComponentPackage;
    const dependencies = [
      "input.drive-cycle-points",
      "input.cycle-road-load-basis",
      "value.gross-mass",
      efficiencyRef,
      "input.rotating-mass-factor",
      "input.auxiliary-power",
      ...(electrified ? ["input.regeneration-efficiency"] : []),
      ...(motorPacket && motorPacket.inverterEfficiency !== null ? ["input.motor-package-inverter-efficiency"] : []),
      ...(design
        ? ["input.rolling-resistance", "value.gross-weight-force", "value.drag-factor"]
        : ["input.coastdown-f0", "input.coastdown-f1", "input.coastdown-f2"]),
      // ККД тяги більше не сталий, коли є карта машини: ланцюг має це
      // показувати, інакше з карти розрахунків не видно, звідки взялося число.
      ...(integration?.efficiencyBasis === "motor-map"
        ? ["value.motor-efficiency-map"] : []),
      ...(hybrid && integration?.efficiencyBasis === "motor-map"
        ? ["input.hybrid-electric-share"] : []),
      // Запасний ККД теж входить у результат, коли карта покрила не все.
      ...(integration?.fallbackEnergyShare > 0
        ? ["input.fallback-machine-efficiency"] : [])
    ];
    const mapped = integration?.efficiencyBasis === "motor-map";
    const fallbackPercent = mapped && integration.fallbackMachineEfficiency !== null
      ? textNumber(integration.fallbackMachineEfficiency * 100, 0) : "—";
    const sample = integration?.steps?.find(step => step.wheelPowerW > 0);
    const sampleTex = sample
      ? `\\Delta E_{\\mathrm{тр}}&=\\frac{${texNumber(sample.wheelPowerW, 3)}\\cdot${texNumber(sample.dtS, 4)}}`
        + `{${texNumber(sample.pointEfficiency, 6)}\\cdot3{,}6\\cdot10^6}`
        + `=${texNumber(sample.tractionInputEnergyJ / 3.6e6, 6)}\\ \\text{кВт·год}\\\\ ` : "";
    return {
      id: "drive-cycle-energy",
      title: "Енергія за їздовим циклом",
      purpose: "Integrate positive traction demand, regenerative recovery and auxiliaries over the imported speed-time cycle.",
      output: {
        id: "value.drive-cycle-energy",
        symbol: "e_{\\mathrm{ц}}",
        label: "Drivetrain-input cycle energy per 100 km",
        valueType: "quantity",
        canonicalUnit: "kWh/100km"
      },
      expression: motorPacket ? "100 * integral(Pdc_motor_signed + Pshaft_engine + Paux, dt) / (3.6e6 * distanceKm)"
        : "100 * integral(max(Pwheel, 0) / eta + min(Pwheel, 0) * etaRegen + Paux, dt) / (3.6e6 * distanceKm)",
      dependencies,
      equationNumber: "8.3",
      formulaTex: motorPacket
        ? "E_{\\mathrm{ц}}=\\frac{\\int(P_{dc}+P_{\\mathrm{ДВЗ}}+P_{\\mathrm{доп}})\\,dt}{3{,}6\\cdot10^6},\\qquad e_{\\mathrm{ц}}=\\frac{100E_{\\mathrm{ц}}}{S_{\\mathrm{ц}}}"
        : (mapped
        ? "E_{\\mathrm{ц}}=\\frac{1}{3{,}6\\cdot10^6}\\left[\\int_{P_{\\mathrm{к}}>0}\\frac{P_{\\mathrm{к}}}"
          + "{\\eta(M,\\omega)}\\,dt"
        : "E_{\\mathrm{ц}}=\\frac{1}{3{,}6\\cdot10^6}\\left[\\int_{P_{\\mathrm{к}}>0}\\frac{P_{\\mathrm{к}}}"
          + "{\\eta}\\,dt")
        + (electrified ? "+\\int_{P_{\\mathrm{к}}<0}P_{\\mathrm{к}}\\eta_{\\mathrm{рек}}\\,dt" : "")
        + "+\\int P_{\\mathrm{доп}}\\,dt\\right],\\qquad e_{\\mathrm{ц}}=\\frac{100E_{\\mathrm{ц}}}{S_{\\mathrm{ц}}}"
        + (mapped
          ? ",\\qquad \\eta=\\dfrac{\\eta_{\\mathrm{м}}}"
            + "{s/\\eta_{\\mathrm{ем}}(M,\\omega)+(1-s)}"
          : ""),
      substitutionTex: integration?.defined
        ? `\\begin{aligned}${sampleTex}E_{\\mathrm{ц}}&=${texNumber(integration.tractionKwh, 6)}`
          + `-${texNumber(integration.recoveredKwh, 6)}+${texNumber(integration.auxiliaryKwh, 6)}`
          + `=${texNumber(integration.netKwh, 6)}\\ \\text{кВт·год}\\\\ `
          + `e_{\\mathrm{ц}}&=\\frac{100\\cdot${texNumber(integration.netKwh, 6)}}`
          + `{${texNumber(integration.distanceKm, 6)}}=${texNumber(integration.kwhPer100km, 3)}`
          + "\\ \\text{кВт·год/100 км}\\end{aligned}"
        : "e_{\\mathrm{ц}}=\\text{—}",
      result: {
        value: integration?.defined ? integration.kwhPer100km : null,
        canonicalUnit: "kWh/100km",
        displayUnit: "кВт·год/100 км"
      },
      method: design ? "project-road-load-time-integration" : "coastdown-road-load-time-integration",
      sourceRefs: design
        ? ["source.reference.tum-bev-longitudinal", "source.method.birulya-rolling-resistance", "source.project-input", ...(motorPacket ? ["source.motor-component-package"] : [])]
        : ["source.reference.tum-bev-longitudinal", "source.project-input", ...(motorPacket ? ["source.motor-component-package"] : [])],
      assumptions: [
        ...(selectionNote ? [selectionNote + " Повний базовий профіль JRC WLTP без масштабування швидкості: https://github.com/JRCSTU/wltp, commit 18650f372044371ed994a161a93473a75e76d2a9."] : []),
        ...(teachingCycle ? ["Навчальний цикл 60 с із шести заданих точок — припущення проєкту та коротка демонстрація розрахунку; це не виміряний чи типовий маршрут і не сертифікаційний цикл."] : []),
        ...(mapped ? [
        "Частку тяги, яку веде електромашина, прийнято сталою за цикл. "
        + "Справжня система керування міняє її від точки до точки."
        ] : [])
      ],
      readerNotes: [
        ...(motorPacket ? [
          `Карта пакета ${motorPacket.componentId}; SHA-256 ${motorPacket.packageSha256}; межа ${motorPacket.boundary}; тривалий режим continuous.`,
          "Електрична потужність інтегрується зі знаком. Додатна сума включає втрати холостого ходу під час зупинок, кочення та гальмування; допоміжні споживачі додаються окремо.",
          "Рекуперація обчислена з від’ємних моментів карти й обмежена тривалою огинаючою, струмом та заданою часткою енергії гальмування. η_рек — верхня межа повернення колесо → DC, а не додатковий множник втрат інвертора.",
          "Надлишок гальмівного моменту забезпечують фрикційні гальма; температура, SOC і зарядна межа конкретної батареї тут не моделюються."
        ] : []),
        "У формулі потужність задано у Вт, час — у с; ділення на 3,6·10⁶ переводить Дж у кВт·год. Sц — довжина циклу в км. У числовій сумі послідовно наведено тягову енергію, повернену енергію та енергію допоміжних споживачів за весь цикл.",
        ...(sample ? [`Приклад інтегрування показує додатну тягу на інтервалі ${textNumber(sample.fromS, 2)}…${textNumber(sample.toS, 2)} с `
          + `при середній швидкості ${textNumber(sample.speedMs, 3)} м/с; підсумок охоплює всі ${integration.steps.length} інтервали.`] : []),
        `Цикл «${cycleFileName || cycle?.name || "без назви"}» інтегровано з його фактичним кроком часу.`,
        ...(mapped ? [
          "ККД тяги тут НЕ сталий: механічна частина лишається сталою, а "
          + "машинна береться з карти розділу 4 у кожній точці за моментом і "
          + "обертами машини. ККД трансмісії в цьому документі суто механічний "
          + "— зубчасті пари, шарніри, шліци, — тому множення на карту не "
          + "рахує ті самі втрати двічі.",
          // ККД, якого немає, — це не нуль. Коли карта не дала жодної точки,
          // працював оголошений запасний ККД, і сказати треба саме це, а не
          // надрукувати «0,0 %» від множення null на сто.
          integration.meanMachineEfficiency === null
            ? "Карти для цієї машини немає, тому працював прийнятий проєктом "
              + `запасний ККД ${fallbackPercent} %, і всі числа розділу `
              + "спираються на нього. Важливо: так ОЦІНЕНО ЕФЕКТИВНІСТЬ, але "
              + "ЗДІЙСНЕННІСТЬ за характеристикою не перевірено — чи розвиває "
              + "машина потрібні оберти й момент, цей розрахунок не знає."
            : `Середній ККД машини за цикл, зважений за корисною роботою: `
              + `${textNumber(integration.meanMachineEfficiency * 100, 1)} %. Це `
              + "й є ціна заміни карти однією сталою: на циклі машина більшість "
              + "часу працює на малому моменті, де вона найгірша."
              + (integration.fallbackEnergyShare > 0
                ? ` Ще ${textNumber(integration.fallbackEnergyShare * 100, 0)} % `
                  + "корисної роботи пораховано оголошеним запасним ККД "
                  + `${textNumber(integration.fallbackMachineEfficiency * 100, 0)} %.`
                : ""),
          ...(integration.electricShare < 1 ? [
            `Машина веде ${textNumber(integration.electricShare * 100, 0)} % тяги; `
            + "решту веде двигун, і на неї втрати машини не накидають. Тому "
            + `тягова енергія розділена: ${textNumber(integration.electricTractionKwh, 2)} `
            + `кВт·год через машину і ${textNumber(integration.engineTractionKwh, 2)} `
            + "кВт·год через вал двигуна."
          ] : [])
        ] : []),
        ...(electrified ? [] : [
          "Для ДВЗ це механічна енергія на вході трансмісії, а не витрата палива: карта питомої витрати й алгоритм перемикання передач не застосовані."
        ])
      ],
      limitations: [
        ...(integration?.defined ? [] : [integration?.reason || "Енергію циклу не визначено."]),
        ...(mapped && !motorPacket ? [
          "Рекуперація крізь карту машини НЕ проходить: повернену енергію "
          + "рахують сталим η_рек, бо в документі це ККД усього зворотного "
          + "тракту, і множити його на η_ем означало б порахувати машину двічі."
        ] : []),
        ...(mapped && integration.outsideEnvelopeSeconds > 0 ? [
          `${textNumber(integration.outsideEnvelopeSeconds, 0)} с циклу машина `
          + "виходила за свою характеристику — момент більший, ніж вона видає. "
          + "Ці точки пораховано сталим ККД: екстраполювати карту туди не можна, "
          + "бо втрати в міді ростуть як квадрат моменту."
        ] : []),
        ...(design && cycle?.maximumSpeedMs * 3.6 > 150
          ? ["Поправку f(V) екстрапольовано вище 150 км/год — верхньої межі джерела."] : []),
        "Результат не є сертифікаційним WLTP: не відтворено випробувальну масу, кондиціонування, баланс заряду та припис перемикання передач."
      ]
    };
  }

  return Object.freeze({
    G,
    roadLoadFromDesign,
    roadLoadFromCoastdown,
    resistanceAt,
    wheelPowerAt,
    parseCycle,
    cycleDigest,
    integrate,
    fuelFromCycle,
    cycleSpeedCompatibility,
    fuelOverCycle,
    hybridSplit,
    combinedConsumption,
    phaseResults,
    buildCycleFuelStep,
    buildCycleFuelByGearStep,
    buildCombinedConsumptionStep,
    buildHybridSplitStep,
    buildCycleEnergyStep
  });
}
