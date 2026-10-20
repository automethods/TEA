"use strict";

// Карта перемикання передач за швидкістю.
//
// НАВІЩО ЦЕ. Без передач за циклом невідомі оберти двигуна, а без обертів
// невідома його питома витрата: розділ 8 мусив брати одну точку карти —
// номінальну — і через це занижував витрату в рази. Стандартні цикли
// стовпця «передача» не несуть (перевірено на WLTP, NEDC, Artemis, EPA:
// схема його дозволяє, дані порожні), тому карту будують самі.
//
// ЩО ЦЕ Є. Оберти двигуна на передачі i при швидкості V:
//     ω = V·u_i·u₀/r_д
// Передача придатна, поки ω лежить між мінімальними й максимальними обертами
// двигуна. Момент перемикання вибирає СТРАТЕГІЯ — і це справжнє рішення
// водія або програми керування, а не властивість автомобіля:
//   спортивна — тримати оберти високими, перемикати пізно, щоб мати
//     потужність;
//   економна — перемикати рано, щоб двигун ішов на малих обертах, де витрата
//     менша;
//   звичайна — між ними.
//
// ЗВІДКИ МЕЖІ СМУГИ. Самі межі, між якими стратегія вибирає момент, тепер не
// вигадані: їх подає GTR 15 (ECE/TRANS/180/Add.15/Amend.6), додаток 2 —
// нормативний алгоритм призначення передач для WLTP.
//   низ:  n_min_drive = n_х + 0,125·(n_N − n_х) для передач вище другої,
//         n_х на першій, 0,9·n_х на другій                    (§2(k));
//   верх: n_95_high — найвищі оберти, на яких потужність ще не впала нижче
//         95 % номінальної                                     (§2(g)).
// Це краще за частку номінальних обертів: смуга залежить від обертів холостого
// ходу конкретного двигуна, а верх — від справжньої кривої потужності, а не
// від круглого числа.
//
// ЩО ЦЕ НЕ Є. Це не весь алгоритм GTR 15: там передачу вибирають ще й за
// умовою P_доступна ≥ P_потрібна на кожній секунді циклу (§3.1, §3.4, §3.5),
// тобто карта залежить і від навантаження, а не тільки від швидкості. Тут —
// карта за швидкістю, і документ це каже. Регламент R83 (NEDC) передачі не
// обчислює взагалі: він друкує їх готовою таблицею за часом (додаток 4а,
// п. 6.1.3) — саме тому карту тут будують, а не переписують.
export function createShiftStrategy({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
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

  const SOURCE_REFS = Object.freeze(["source.project-derivation"]);
  const REGULATION_REFS = Object.freeze(["source.unece-gtr15-annex2",
    "source.project-derivation"]);

  // Частка РОБОЧОЇ СМУГИ обертів, на якій перемикають угору.
  //
  // Раніше тут стояла частка номінальних обертів. Вона погана тим, що нічого
  // не знає про сам двигун: 0,70·ω_N на двигуні з холостим ходом 800 хв⁻¹ і на
  // двигуні з 1400 хв⁻¹ означає зовсім різну манеру їзди. Тепер частку беруть
  // від смуги [ω_min_drive; ω_95], обидва кінці якої задає GTR 15, — і вона
  // означає те саме на будь-якому двигуні: «наскільки далеко по робочій смузі
  // дати двигунові піти, перш ніж перемкнути».
  //
  //   ω_перем = ω_min_drive + k·(ω_95 − ω_min_drive)
  //
  // Самі k — рішення проєкту: регламент манер їзди не описує, він описує одну
  // приписану процедуру. Числа вибрані так, щоб відтворити три впізнавані
  // манери, а спортивна збігалася з верхом смуги — вище неї їхати немає сенсу,
  // бо потужність там уже падає.
  const STRATEGIES = Object.freeze([
    {
      id: "sport",
      label: "Спортивна",
      bandFraction: 1.00,
      note: "Перемикають на верху робочої смуги — там, де потужність ще не "
        + "впала нижче 95 % номінальної. Вище тримати оберти немає сенсу: "
        + "потужності це вже не додає, а розгін виходить найкоротшим саме тут."
    },
    {
      id: "normal",
      label: "Звичайна",
      bandFraction: 0.65,
      note: "Перемикають, пройшовши близько двох третин робочої смуги — так "
        + "їздять у місті без поспіху."
    },
    {
      id: "eco",
      label: "Економна",
      bandFraction: 0.35,
      note: "Перемикають рано, у нижній третині смуги: там менша питома "
        + "витрата, але й запас потужності менший."
    },
    // Четверта — не манера їзди, а сам регламент.
    {
      id: "wltp",
      label: "Приписана GTR 15",
      bandFraction: null,
      prescribed: true,
      note: "Передачу не вибирає манера їзди: на кожній швидкості беруть "
        + "НАЙВИЩУ передачу, на якій оберти лежать у смузі й потужності "
        + "вистачає на опір дороги. Це сам алгоритм додатка 2 GTR 15, "
        + "яким призначають передачі для WLTP."
    }
  ]);

  // Запас потужності, §3.4: приписаний алгоритм бере не всю потужність
  // зовнішньої характеристики, а на 10 % меншу — стаціонарна крива вища за
  // те, що двигун віддає на перехідних режимах.
  const SAFETY_MARGIN = 0.10;

  // Потрібна потужність для приписаного алгоритму, §3.1.
  //
  //   P_потр = (F_опору + k_r·m·a)·V,   k_r = 1,03
  //
  // Модель опору тут РІВНА, без ухилу, і це не спрощення, а вимога: §3.1
  // визначає P_потр для рівного циклу WLTC, і карта, побудована з ухилом,
  // уже не є приписаною картою, хоч і посилалася б на регламент. Ухил
  // документа впливає на розгін і на тягу — але не на цей алгоритм.
  //
  // Один спільний будівник на застосунок і фікстуру: та сама десятирядкова
  // модель, написана двічі, розходиться на першій же правці.
  const ROTATING_MASS_FACTOR = 1.03;

  function requiredPowerBuilder({ rollingResistanceAt, grossWeightForceN,
    dragFactorW, massKg }) {
    const weight = finiteNumber(grossWeightForceN);
    const drag = finiteNumber(dragFactorW);
    const mass = finiteNumber(massKg);
    if ([weight, drag, mass].some(value => value === null || value <= 0)) return null;
    if (typeof rollingResistanceAt !== "function") return null;
    return (speedMs, accelerationMs2) => {
      const rolling = finiteNumber(rollingResistanceAt(speedMs));
      if (rolling === null) return null;
      // Рівна дорога: ψ = f, без складової ухилу.
      const resistanceN = rolling * weight + drag * speedMs ** 2;
      return (resistanceN + mass * ROTATING_MASS_FACTOR * accelerationMs2)
        * speedMs / 1000;
    };
  }

  // n_min_drive за GTR 15, додаток 2, §2(k) — найменші оберти, на яких
  // регламент дозволяє їхати на цій передачі.
  //
  // Перша передача має право опускатися до холостого ходу (з неї рушають),
  // друга — до 0,9·n_х, а всі вищі мусять триматися помітно вище: холостий хід
  // плюс восьма частина відстані до номінальних обертів.
  function minimumAngularSpeedFor({ gear, idleAngularSpeed, ratedAngularSpeed }) {
    const idle = finiteNumber(idleAngularSpeed);
    const rated = finiteNumber(ratedAngularSpeed);
    if (idle === null || idle <= 0) return null;
    if (gear === 1) return idle;
    if (gear === 2) return 0.9 * idle;
    if (rated === null || rated <= idle) return null;
    return idle + 0.125 * (rated - idle);
  }

  // n_95_high за GTR 15, додаток 2, §2(g) — найвищі оберти, на яких потужність
  // ще не менша за 95 % номінальної.
  //
  // Шукають саме НАЙВИЩУ таку точку: крива перетинає рівень 0,95·P_N двічі —
  // на підйомі й на спаді, — а межею є друга. Між точками кривої регламент
  // приписує лінійну інтерполяцію (§2(h)), її тут і роблять.
  function speedAt95Power(curvePoints, ratedPowerKw) {
    const points = (curvePoints || [])
      .filter(point => Number.isFinite(point.angularSpeed)
        && Number.isFinite(point.powerKw))
      .sort((first, second) => first.angularSpeed - second.angularSpeed);
    if (points.length < 2) return null;
    const rated = finiteNumber(ratedPowerKw)
      ?? Math.max(...points.map(point => point.powerKw));
    if (!(rated > 0)) return null;
    const level = 0.95 * rated;
    // Ідемо з кінця кривої: перший перетин згори вниз і є n_95_high.
    for (let index = points.length - 1; index >= 1; index -= 1) {
      const upper = points[index];
      const lower = points[index - 1];
      if (lower.powerKw >= level && upper.powerKw < level) {
        const span = lower.powerKw - upper.powerKw;
        if (!(span > 0)) return lower.angularSpeed;
        const share = (lower.powerKw - level) / span;
        return lower.angularSpeed + share * (upper.angularSpeed - lower.angularSpeed);
      }
    }
    // Крива ніде не спадає нижче 95 %: обмеженням є її власний кінець. Це той
    // випадок, який регламент описує як обмеження обертів (n_lim).
    const last = points[points.length - 1];
    return last.powerKw >= level ? last.angularSpeed : null;
  }

  // Розгін 0—100 рахують СПОРТИВНОЮ стратегією, і завжди нею.
  //
  // Паспортне число 0—100 — це не «розгін за звичайної їзди»: його знімають
  // на повному дроселі з найкращими перемиканнями, які машина дозволяє. Ніхто
  // не міряє 0—100, перемикаючись на половині смуги обертів. Тому стратегія
  // документа керує витратою за циклом, а розгін завжди йде по спортивній —
  // інакше число не можна порівняти ні з паспортом, ні з випробуванням.
  const ACCELERATION_STRATEGY_ID = "sport";

  function strategy(id) {
    return STRATEGIES.find(item => item.id === id) || null;
  }

  // Оберти двигуна на передачі при заданій швидкості.
  function engineSpeedAt({ speedMs, gearRatio, finalDriveRatio, transferCaseRatio = 1, wheelHubRatio = 1, dynamicRadiusM }) {
    const speed = finiteNumber(speedMs);
    const gear = finiteNumber(gearRatio);
    const final = finiteNumber(finalDriveRatio);
    const transfer = finiteNumber(transferCaseRatio);
    const hub = finiteNumber(wheelHubRatio);
    const radius = finiteNumber(dynamicRadiusM);
    if ([speed, gear, final, transfer, hub, radius].some(value => value === null)
      || gear <= 0 || final <= 0 || transfer <= 0 || hub <= 0 || radius <= 0 || speed < 0) {
      return null;
    }
    return speed * gear * final * transfer * hub / radius;
  }

  // ПРИПИСАНИЙ АЛГОРИТМ GTR 15, додаток 2, §3.3—3.5.
  //
  // Три манери їзди вище відкладають частку смуги — це рішення водія. Тут
  // рішення не приймають узагалі: передачу диктують дві умови регламенту.
  //
  //   §3.3  оберти на передачі мусять лежати між n_min_drive і n_max;
  //   §3.5  для передач вище другої ще й P_доступна ≥ P_потрібна,
  //         де P_доступна = P_wot(n)·(1 − SM), SM = 10 % (§3.4);
  //         беруть НАЙВИЩУ передачу, яка обидві умови задовольняє.
  //
  // Через другу умову карта залежить не лише від швидкості, а й від
  // прискорення: P_потрібна містить доданок k_r·a·v·m. Тут її будують для
  // усталеного руху (a = 0) — так карта лишається картою за швидкістю, і її
  // можна порівняти з трьома манерами. Прискорення регламент враховує
  // посекундно, і документ це каже.
  function prescribedRows({ ladder, speedAt, angularAt, bandTop, idle, rated,
    curvePoints, requiredPowerAt, maximumSpeedMs }) {
    if (typeof requiredPowerAt !== "function") {
      return {
        rows: null,
        reason: "Приписаний алгоритм GTR 15 рахує ще й потрібну потужність: "
          + "без опору дороги й маси його не застосувати."
      };
    }
    // Криву сортують ОДИН раз: усередині сканування це були б тисячі
    // однакових сортувань поспіль.
    const sorted = (curvePoints || [])
      .filter(point => Number.isFinite(point.angularSpeed)
        && Number.isFinite(point.powerKw))
      .sort((a, b) => a.angularSpeed - b.angularSpeed);
    const available = angularSpeed => {
      if (sorted.length < 2) return null;
      if (angularSpeed < sorted[0].angularSpeed) return null;
      if (angularSpeed > sorted[sorted.length - 1].angularSpeed) return null;
      for (let index = 1; index < sorted.length; index += 1) {
        if (angularSpeed <= sorted[index].angularSpeed) {
          const a = sorted[index - 1];
          const b = sorted[index];
          const span = b.angularSpeed - a.angularSpeed;
          const power = span > 0
            ? a.powerKw + (b.powerKw - a.powerKw) * (angularSpeed - a.angularSpeed) / span
            : b.powerKw;
          return { fullLoadPowerKw: power, availablePowerKw: power * (1 - SAFETY_MARGIN) };
        }
      }
      return null;
    };
    // Нижні межі так само: їх стільки, скільки передач, а не скільки кроків
    // сканування.
    const bottoms = new Map(ladder.map(item => [item.gear, minimumAngularSpeedFor({
      gear: item.gear, idleAngularSpeed: idle, ratedAngularSpeed: rated
    })]));
    const bottomFor = gear => bottoms.get(gear) ?? null;
    // Найвища придатна передача на цій швидкості за усталеного руху.
    const gearAtSpeed = speedMs => {
      const needKw = requiredPowerAt(speedMs, 0);
      for (let index = ladder.length - 1; index >= 0; index -= 1) {
        const item = ladder[index];
        const omega = angularAt(speedMs, item.ratio);
        const bottom = bottomFor(item.gear);
        if (bottom === null) continue;
        if (omega < bottom || omega > bandTop) continue;
        let availablePowerKw = null;
        let fullLoadPowerKw = null;
        // §3.5(b): умова потужності діє для передач вище другої.
        if (item.gear > 2) {
          const power = available(omega);
          if (power === null || !(power.availablePowerKw >= needKw)) continue;
          availablePowerKw = power.availablePowerKw;
          fullLoadPowerKw = power.fullLoadPowerKw;
        }
        return { ...item, selection: { gear: item.gear, speedMs,
          minimumAngularSpeed: bottom, angularSpeed: omega,
          maximumAngularSpeed: bandTop, availablePowerKw, fullLoadPowerKw,
          requiredPowerKw: needKw } };
      }
      // §3.3(c): нижче за все — перша передача.
      return ladder[0];
    };
    // Скануємо швидкість і ловимо, де змінюється призначена передача.
    const top = Math.max(maximumSpeedMs, 1);
    const stepMs = top / 2000;
    const upAt = new Map();
    const upSelections = new Map();
    let previous = null;
    for (let speedMs = stepMs; speedMs <= top; speedMs += stepMs) {
      const chosen = gearAtSpeed(speedMs);
      if (previous && chosen.gear > previous.gear) {
        // Регламент передачі пропускає; кожну пройдену межу записуємо.
        for (let gear = previous.gear; gear < chosen.gear; gear += 1) {
          if (!upAt.has(gear)) {
            upAt.set(gear, speedMs);
            upSelections.set(gear, chosen.selection ?? null);
          }
        }
      }
      previous = chosen;
    }
    const rows = ladder.map((item, index) => {
      const last = index === ladder.length - 1;
      const upMs = last ? null : (upAt.get(item.gear) ?? null);
      const neverSelected = !last && upMs === null;
      return {
        gear: item.gear,
        ratio: item.ratio,
        shiftUpSpeedMs: upMs,
        // Передача, до якої алгоритм не дійшов, не бере на себе нічого:
        // інакше gearAt віддавав би їй усі швидкості вище попередньої межі —
        // і крок водночас друкував би, що її не призначено ніде.
        neverSelected,
        minimumAngularSpeed: bottomFor(item.gear),
        shiftAngularSpeed: upMs === null ? null : angularAt(upMs, item.ratio),
        selection: upSelections.get(item.gear) ?? null,
        topSpeedMs: speedAt(rated, item.ratio),
        heldByMinimumSpeed: false
      };
    });
    return { rows, reason: null };
  }

  // Карта: для кожної передачі — від якої швидкості до якої нею їдуть.
  function shiftMap({ gears, finalDriveRatio, transferCaseRatio = 1, wheelHubRatio = 1, dynamicRadiusM, ratedAngularSpeed,
    idleAngularSpeed, curvePoints, ratedPowerKw, strategyId,
    requiredPowerAt, maximumSpeedMs }) {
    const chosen = strategy(strategyId);
    if (!chosen) {
      return { defined: false, reason: "Стратегію перемикання не вибрано." };
    }
    const rated = finiteNumber(ratedAngularSpeed);
    const final = finiteNumber(finalDriveRatio);
    const radius = finiteNumber(dynamicRadiusM);
    const transfer = finiteNumber(transferCaseRatio);
    const hub = finiteNumber(wheelHubRatio);
    if ([rated, final, transfer, hub, radius].some(value => value === null || value <= 0)) {
      return {
        defined: false,
        reason: "Потрібні номінальні оберти, головна передача й радіус колеса."
      };
    }
    const idle = finiteNumber(idleAngularSpeed);
    if (idle === null || idle <= 0) {
      return {
        defined: false,
        reason: "Потрібні оберти холостого ходу: нижню межу смуги перемикання "
          + "GTR 15 рахує від них, а не від номінальних обертів."
      };
    }
    if (idle >= rated) {
      return {
        defined: false,
        reason: "Оберти холостого ходу не менші за номінальні — перевірте дані "
          + "двигуна."
      };
    }
    const ladder = (gears || [])
      .map(item => ({ gear: item.gear, ratio: finiteNumber(item.ratio) }))
      .filter(item => item.ratio !== null && item.ratio > 0)
      // Від найбільшого передаточного числа до найменшого: перша передача
      // найнижча.
      .sort((first, second) => second.ratio - first.ratio);
    if (ladder.length < 1) {
      return { defined: false, reason: "Ряду передач немає." };
    }

    // Верх смуги. Крива потужності дає його чесно; без кривої лишається
    // номінальна точка, і документ каже, що межу взято грубішою.
    const ninetyFive = speedAt95Power(curvePoints, ratedPowerKw);
    const bandTop = ninetyFive ?? rated;
    // Швидкість, на якій із передачі виходять угору, і зворотний перехід.
    const speedAt = (angular, ratio) => angular * radius / (ratio * final * transfer * hub);
    const angularAt = (speedMs, ratio) => engineSpeedAt({ speedMs, gearRatio: ratio,
      finalDriveRatio: final, transferCaseRatio: transfer, wheelHubRatio: hub, dynamicRadiusM: radius });

    // Приписаний алгоритм регламенту йде іншим шляхом: він не відкладає
    // частку смуги, а перебирає передачі згори вниз за двома умовами.
    if (chosen.prescribed) {
      const prescribed = prescribedRows({
        ladder, speedAt, angularAt, bandTop, idle, rated, curvePoints,
        requiredPowerAt,
        maximumSpeedMs: finiteNumber(maximumSpeedMs)
          ?? speedAt(rated, ladder[ladder.length - 1].ratio)
      });
      if (!prescribed.rows) {
        return { defined: false, reason: prescribed.reason };
      }
      const rows = prescribed.rows;
      // Смуга непризначеної передачі нульова: від межі попередньої до неї ж.
      let boundary = 0;
      rows.forEach(row => {
        row.fromSpeedMs = boundary;
        row.toSpeedMs = row.neverSelected ? boundary : row.shiftUpSpeedMs;
        if (row.shiftUpSpeedMs !== null) boundary = row.shiftUpSpeedMs;
      });
      return {
        defined: true,
        strategy: chosen,
        rows,
        ratedAngularSpeed: rated,
        idleAngularSpeed: idle,
        bandTopAngularSpeed: bandTop,
        bandTopFromCurve: ninetyFive !== null,
        minimumAngularSpeed: rows[0].minimumAngularSpeed,
        shiftAngularSpeed: rows[0].shiftAngularSpeed,
        finalDriveRatio: final, transferCaseRatio: transfer, wheelHubRatio: hub,
        dynamicRadiusM: radius,
        topSpeedMs: rows[rows.length - 1].topSpeedMs,
        // Передачі, до яких приписаний алгоритм так і не дійшов.
        skippedGears: rows.filter(row => row.neverSelected).map(row => row.gear)
      };
    }

    const rows = ladder.map((item, index) => {
      const next = ladder[index + 1] || null;
      const last = index === ladder.length - 1;
      const bandBottom = minimumAngularSpeedFor({
        gear: item.gear, idleAngularSpeed: idle, ratedAngularSpeed: rated
      });
      // Момент перемикання — частка робочої смуги цієї передачі.
      const shiftSpeed = bandBottom === null ? null
        : bandBottom + chosen.bandFraction * (bandTop - bandBottom);
      const strategyUpMs = shiftSpeed === null ? null : speedAt(shiftSpeed, item.ratio);
      // Після перемикання оберти падають у u_i+1/u_i разів, і нижче
      // n_min_drive наступної передачі вони впасти не можуть.
      const nextBottom = next
        ? minimumAngularSpeedFor({
          gear: next.gear, idleAngularSpeed: idle, ratedAngularSpeed: rated
        })
        : null;
      const floorUpMs = next && nextBottom !== null
        ? speedAt(nextBottom, next.ratio)
        : null;
      const upMs = last || strategyUpMs === null ? null
        : Math.max(strategyUpMs, floorUpMs ?? 0);
      return {
        gear: item.gear,
        ratio: item.ratio,
        shiftUpSpeedMs: upMs,
        minimumAngularSpeed: bandBottom,
        shiftAngularSpeed: shiftSpeed,
        strategyUpSpeedMs: strategyUpMs,
        minimumNextSpeedMs: floorUpMs,
        nextMinimumAngularSpeed: nextBottom,
        nextRatio: next?.ratio ?? null,
        // Найбільша швидкість, яку передача взагалі дає: на номінальних
        // обертах. Вища передача її перевищує, нижча — ні.
        topSpeedMs: speedAt(rated, item.ratio),
        // Стратегія хотіла перемкнути раніше, ніж дозволяють мінімальні
        // оберти наступної передачі.
        heldByMinimumSpeed: !last && floorUpMs !== null && strategyUpMs !== null
          && floorUpMs > strategyUpMs
      };
    });
    // Нижні межі: з передачі i їдуть від швидкості, на якій у неї перемкнули.
    rows.forEach((row, index) => {
      row.fromSpeedMs = index === 0 ? 0 : rows[index - 1].shiftUpSpeedMs;
      row.toSpeedMs = row.shiftUpSpeedMs;
    });

    return {
      defined: true,
      strategy: chosen,
      rows,
      ratedAngularSpeed: rated,
      idleAngularSpeed: idle,
      bandTopAngularSpeed: bandTop,
      // Верх смуги взято з кривої потужності, а не з номінальної точки.
      bandTopFromCurve: ninetyFive !== null,
      // Смуга першої передачі — найширша: саме її межі показують у кроці.
      minimumAngularSpeed: rows[0].minimumAngularSpeed,
      shiftAngularSpeed: rows[0].shiftAngularSpeed,
      finalDriveRatio: final, transferCaseRatio: transfer, wheelHubRatio: hub,
      dynamicRadiusM: radius,
      // Найвища швидкість, яку дає остання передача.
      topSpeedMs: rows[rows.length - 1].topSpeedMs
    };
  }

  // Яка передача й які оберти на цій швидкості.
  function gearAt(map, speedMs) {
    if (!map?.defined) return null;
    const speed = finiteNumber(speedMs);
    if (speed === null || speed < 0) return null;
    // Непризначені передачі пропускають: їхня смуга нульова, і брати їх як
    // «останню з відкритим верхом» не можна.
    const usable = map.rows.filter(item => !item.neverSelected);
    const row = usable.find(item =>
      item.toSpeedMs === null || speed < item.toSpeedMs) || usable[usable.length - 1];
    if (!row) return null;
    const angularSpeed = engineSpeedAt({
      speedMs: speed, gearRatio: row.ratio,
      finalDriveRatio: map.finalDriveRatio, transferCaseRatio: map.transferCaseRatio ?? 1,
      wheelHubRatio: map.wheelHubRatio ?? 1, dynamicRadiusM: map.dynamicRadiusM
    });
    return {
      gear: row.gear,
      ratio: row.ratio,
      angularSpeed,
      speedRatio: angularSpeed / map.ratedAngularSpeed,
      // Нижче n_min_drive цієї передачі двигун не тягне: на такій швидкості
      // або рушають зі зчепленням, або стоять. Межа в кожної передачі своя —
      // перша має право опускатися до холостого ходу, вищі ні.
      belowMinimum: row.minimumAngularSpeed !== null
        && angularSpeed < row.minimumAngularSpeed
    };
  }

  // Розгін 0—100 км/год за картою перемикань.
  //
  // Досі розгін брав ОГИНАЮЧУ — найкраще прискорення з усіх передач у кожній
  // точці. Це неявно означає «перемикати там, де криві перетинаються», тобто
  // саме спортивну стратегію, і жодної іншої описати не давало. З картою
  // передача в кожній точці відома, і розгін нарешті залежить від манери
  // їзди — як і в житті.
  function accelerationRun({ map, gears, targetSpeedMs, shiftTimeS = 0 }) {
    if (!map?.defined) {
      return { defined: false, reason: map?.reason || "Карти перемикань немає." };
    }
    const target = finiteNumber(targetSpeedMs);
    const shiftTime = finiteNumber(shiftTimeS) ?? 0;
    if (target === null || target <= 0) {
      return { defined: false, reason: "Потрібна додатна цільова швидкість." };
    }
    const byGear = new Map((gears || []).map(item => [item.gear, item.points || []]));
    const pointsOut = [];
    const intervals = [];
    let timeS = 0;
    let motionTimeS = 0;
    let distanceM = 0;
    let speedMs = 0;
    let currentGear = null;
    const step = 0.1;
    let guard = 0;

    while (speedMs < target && guard < 100000) {
      guard += 1;
      const at = gearAt(map, speedMs);
      if (!at) break;
      if (currentGear !== null && at.gear !== currentGear && shiftTime > 0) {
        // Під час перемикання тяги немає: швидкість падає на опір, але для
        // попереднього розрахунку досить порахувати самий час.
        timeS += shiftTime;
        distanceM += speedMs * shiftTime;
      }
      currentGear = at.gear;
      const curve = byGear.get(at.gear) || [];
      const launch = currentGear === Math.min(...byGear.keys()) && curve.length && speedMs < curve[0].speedMs;
      const accel = launch ? curve[0].accelerationMs2 : interpolate(curve, speedMs);
      if (accel === null || !(accel > 0)) {
        return {
          defined: false,
          reason: `На передачі ${at.gear} при ${(speedMs * 3.6).toFixed(0)} км/год `
            + "прискорення немає: за цією стратегією автомобіль тут уже не "
            + "розганяється. Перемикайте пізніше або перевірте ряд передач."
        };
      }
      const dv = Math.min(step, target - speedMs);
      const dt = dv / accel;
      intervals.push({ fromSpeedMs: speedMs, toSpeedMs: speedMs + dv,
        deltaSpeedMs: dv, accelerationMs2: accel, deltaTimeS: dt, gear: at.gear });
      timeS += dt;
      motionTimeS += dt;
      distanceM += (speedMs + dv / 2) * dt;
      speedMs = Math.min(target, speedMs + dv);
      pointsOut.push({ speedMs, timeS, distanceM, gear: at.gear });
    }
    if (speedMs < target) {
      return { defined: false, reason: "Розгін не дійшов до цільової швидкості." };
    }
    return {
      defined: true,
      value: timeS,
      timeS,
      motionTimeS,
      intervals,
      distanceM,
      targetSpeedMs: target,
      points: pointsOut,
      shiftCount: new Set(pointsOut.map(point => point.gear)).size - 1,
      shiftTimeS: shiftTime,
      launchApproximation: "constant-first-synchronous-acceleration",
      strategy: map.strategy
    };
  }

  function interpolate(points, speedMs) {
    if (!points.length) return null;
    if (speedMs < points[0].speedMs - 1e-9 || speedMs > points.at(-1).speedMs + 1e-9) return null;
    if (speedMs <= points[0].speedMs) return points[0].accelerationMs2 ?? null;
    for (let index = 1; index < points.length; index += 1) {
      if (speedMs <= points[index].speedMs) {
        const a = points[index - 1];
        const b = points[index];
        const span = b.speedMs - a.speedMs;
        if (!(span > 0)) return b.accelerationMs2 ?? null;
        const share = (speedMs - a.speedMs) / span;
        const first = a.accelerationMs2;
        const second = b.accelerationMs2;
        if (first === null || second === null) return null;
        return first + (second - first) * share;
      }
    }
    return points[points.length - 1].accelerationMs2 ?? null;
  }

  function buildShiftMapStep({ map, texNumber }) {
    const textNumber = (value, digits) => texNumber(value, digits).replaceAll("{,}", ",").replaceAll("\\,", "\u00a0");
    const rows = map.rows.filter(row => row.shiftUpSpeedMs !== null);
    const toRpm = angular => textNumber(angular * 30 / Math.PI, 0);
    // Смугу показують по найвищій передачі: там межа найсуворіша.
    const bottomRpm = toRpm(map.rows[map.rows.length - 1].minimumAngularSpeed);
    const topRpm = toRpm(map.bandTopAngularSpeed);
    const sample = rows[0];
    const selection = (rows.find(row => row.selection?.availablePowerKw !== null && row.selection)
      ?? rows.find(row => row.selection))?.selection;
    const reduction = row => [row.ratio, map.transferCaseRatio ?? 1,
      map.finalDriveRatio, map.wheelHubRatio ?? 1].map(value => texNumber(value, 5)).join("\\cdot");
    let substitution;
    if (map.strategy.prescribed) {
      substitution = selection
        ? `\\begin{aligned}V&=${texNumber(selection.speedMs, 4)}\\ \\text{м/с},\\quad i=${selection.gear}\\\\ `
          + `${texNumber(selection.minimumAngularSpeed, 4)}&\\leq${texNumber(selection.angularSpeed, 4)}`
          + `\\leq${texNumber(selection.maximumAngularSpeed, 4)}\\quad(\\text{рад/с})`
          + (selection.availablePowerKw !== null
            ? `\\\\ P_{\\mathrm{дост}}&=0{,}9\\cdot${texNumber(selection.fullLoadPowerKw, 4)}`
              + `=${texNumber(selection.availablePowerKw, 4)}`
              + `\\geq${texNumber(selection.requiredPowerKw, 4)}=P_{\\mathrm{потр}}\\quad(\\text{кВт})`
            : "\\\\ \\text{Для передачі }i\\leq2&\\text{ умову потужності не застосовують}")
          + "\\end{aligned}"
        : "\\text{Під час перебору швидкостей переходів на вищу передачу не знайдено.}";
    } else if (sample) {
      substitution = `\\begin{aligned}\\omega_{\\mathrm{страт},${sample.gear}}&=`
        + `${texNumber(sample.minimumAngularSpeed, 4)}+${texNumber(map.strategy.bandFraction, 3)}`
        + `(${texNumber(map.bandTopAngularSpeed, 4)}-${texNumber(sample.minimumAngularSpeed, 4)})`
        + `=${texNumber(sample.shiftAngularSpeed, 4)}\\ \\text{рад/с}\\\\ `
        + `V_{\\mathrm{страт},${sample.gear}}&=\\frac{${texNumber(sample.shiftAngularSpeed, 4)}`
        + `\\cdot${texNumber(map.dynamicRadiusM, 5)}}{${reduction(sample)}}`
        + `=${texNumber(sample.strategyUpSpeedMs, 4)}\\ \\text{м/с}\\\\ `
        + `V_{\\min,${sample.gear + 1}}&=\\frac{${texNumber(sample.nextMinimumAngularSpeed, 4)}`
        + `\\cdot${texNumber(map.dynamicRadiusM, 5)}}{${reduction({ ratio: sample.nextRatio })}}`
        + `=${texNumber(sample.minimumNextSpeedMs, 4)}\\ \\text{м/с}\\\\ `
        + `V_{\\mathrm{перем},${sample.gear}}&=\\max(${texNumber(sample.strategyUpSpeedMs, 4)},`
        + `${texNumber(sample.minimumNextSpeedMs, 4)})=${texNumber(sample.shiftUpSpeedMs, 4)}\\ \\text{м/с}`
        + `\\quad(\\times3{,}6=${texNumber(sample.shiftUpSpeedMs * 3.6, 2)}\\ \\text{км/год})\\end{aligned}`;
    } else {
      substitution = "\\text{Одна передача: перемикань немає.}";
    }
    return {
      id: "shift-map",
      title: "Карта перемикання передач",
      purpose: "Fix at which speed each gear gives way to the next.",
      output: {
        id: "value.shift-map",
        symbol: "V_{\\text{перем}}",
        label: "Upshift speeds by gear",
        valueType: "series",
        canonicalUnit: "m/s"
      },
      expression: "V = omega r / (u_i u_transfer u0 u_hub)",
      dependencies: ["value.gearbox-ladder", "decision.shift-strategy",
        "value.dynamic-wheel-radius", "input.engine-idle-speed", "value.final-drive-ratio", "decision.transfer-case-ratio",
        ...(map.wheelHubRatio && map.wheelHubRatio !== 1
          ? ["value.wheel-gear-ring-teeth", "decision.wheel-gear-sun-teeth"] : [])],
      equationNumber: "5.4",
      formulaTex: (map.strategy.prescribed
        ? "i=\\max\\{i:\\ \\omega_{\\min}\\le\\omega_i\\le\\omega_{95}"
          + "\\ \\wedge\\ P_{\\text{дост}}(\\omega_i)\\ge P_{\\text{потр}}\\},"
          + "\\qquad P_{\\text{дост}}=0{,}9\\,P_{wot}"
        : "\\omega_{\\mathrm{страт},i}=\\omega_{\\min,i}+k(\\omega_{95}-"
          + "\\omega_{\\min,i}),\\qquad V_{\\mathrm{перем},i}="
          + `\\max\\left(\\dfrac{\\omega_{\\mathrm{страт},i}r_{\\text{д}}}{u_iu_{\\mathrm{рк}}u_0u_{\\mathrm{hub}}},`
          + "\\dfrac{\\omega_{\\min,i+1}r_{\\text{д}}}{u_{i+1}u_{\\mathrm{рк}}u_0u_{\\mathrm{hub}}}\\right)")
          + (map.wheelHubRatio && map.wheelHubRatio !== 1 ? ",\\quad u_{\\mathrm{hub}}=1+\\frac{Z_k}{Z_{\\mathrm{по}}}" : ""),
      substitutionTex: substitution,
      result: {
        value: map.rows.map(row => ({
          gear: row.gear, ratio: row.ratio,
          shiftUpSpeedMs: row.shiftUpSpeedMs, topSpeedMs: row.topSpeedMs
        })),
        canonicalUnit: "m/s",
        displayUnit: "м/с"
      },
      method: "project-derivation",
      sourceRefs: REGULATION_REFS,
      readerNotes: [
        map.strategy.prescribed
          ? "Підстановка показує прийняту передачу в зазначеній точці перемикання; її обрано перебором від найвищої до найнижчої за записаними умовами. Повна карта зберігає всі межі передач."
          : `Підстановка показує перший перехід. Межі всіх переходів: ${rows.map(row => `${row.gear} → ${row.gear + 1}: ${textNumber(row.shiftUpSpeedMs * 3.6, 2)} км/год`).join("; ") || "перемикань немає"}. `
            + "Швидкість переходу — більша зі швидкості за стратегією та мінімальної придатної швидкості наступної передачі.",
        `Стратегія «${map.strategy.label.toLowerCase()}»: ${map.strategy.note}`,
        ...(map.wheelHubRatio && map.wheelHubRatio !== 1 ? ["Дійсна колісна редукція u_hub=1+Z_k/Z_по взята з прийнятих цілих зубів коронної й сонячної шестерень при нерухомій коронній шестерні; потрібне U_p не замінює її у кінематиці."] : []),
        "Оберти двигуна на передачі однозначно задані швидкістю: "
        + "ω = V·u_i·u_рк·u₀·u_hub/r_д (без колісного редуктора u_hub=1). Тому вибір моменту перемикання — це вибір "
        + "СТРАТЕГІЇ, а не властивість автомобіля: та сама коробка на тому "
        + "самому автомобілі може перемикатися і рано, і пізно.",
        "Межі робочої смуги подає GTR 15, додаток 2 — нормативний алгоритм "
        + "призначення передач для WLTP. Низ: n_min_drive = n_х + 0,125·(n_N − "
        + `n_х) для передач вище другої (${bottomRpm} хв⁻¹), n_х на першій, `
        + "0,9·n_х на другій (§2(k)). Верх: n_95_high — найвищі оберти, на яких "
        + `потужність ще не впала нижче 95 % номінальної (${topRpm} хв⁻¹, §2(g)).`
        + (map.bandTopFromCurve ? "" : " Кривої потужності тут немає, тому за "
          + "верх смуги взято номінальні оберти — це грубіше за n_95_high."),
        map.strategy.prescribed
          ? "Тут частки смуги немає взагалі: передачу диктує сам алгоритм "
            + "додатка 2 (§3.5) — беруть НАЙВИЩУ передачу, на якій оберти "
            + "лежать у смузі й доступної потужності (90 % зовнішньої "
            + "характеристики, §3.4) вистачає на опір дороги. Тому регламент "
            + "перемикає вгору раніше за будь-яку з трьох манер: на усталеній "
            + "швидкості потужності треба мало, і найвища передача майже "
            + "завжди придатна."
            + (map.skippedGears?.length
              ? ` Передач ${map.skippedGears.join(", ")} алгоритм не призначив `
                + "на жодній швидкості."
              : "")
          : `Стратегія проходить ${textNumber(map.strategy.bandFraction * 100, 0)} % `
            + "цієї смуги, перш ніж перемкнути. Частку від СМУГИ, а не від "
            + "номінальних обертів, узято тому, що частка номінальних нічого не "
            + "знає про сам двигун: 70 % ω_N на двигуні з холостим ходом 800 хв⁻¹ "
            + "і на двигуні з 1400 хв⁻¹ означають різну манеру їзди, а та сама "
            + "частка смуги — ту саму.",
        "Стандартні цикли стовпця «передача» не несуть — перевірено на WLTP, "
        + "NEDC, Artemis і EPA, — тому карту будують самі. Регламент R83 (NEDC) "
        + "передачі не обчислює взагалі: він друкує їх готовою таблицею за "
        + "часом (додаток 4а, п. 6.1.3), і до іншого автомобіля така таблиця не "
        + "переноситься."
      ],
      assumptions: [
        "Час самого перемикання не враховано.",
        map.strategy.prescribed
          ? "Приписану карту побудовано для усталеного руху (a = 0) на РІВНІЙ "
            + "дорозі — так P_потр визначає §3.1. Ухил документа на цю карту не "
            + "впливає навмисно: з ухилом вона вже не була б приписаною картою. "
            + "Прискорення регламент враховує посекундно, і на розгоні він тримає "
            + "нижчі передачі, ніж показує ця карта."
          : "Частки смуги для трьох манер їзди — рішення проєкту: GTR 15 описує "
            + "одну приписану процедуру, а не манери їзди, тому самих часток "
            + "жодне джерело не друкує. Із джерела взято обидва кінці смуги, "
            + "між якими ці частки відкладають."
      ],
      limitations: map.rows.some(row => row.heldByMinimumSpeed)
        ? ["На деяких передачах перемикання зсунуто вгору: за стратегією воно "
          + "припало б на швидкість, за якої наступна передача вже не тягне."]
        : []
    };
  }

  function buildAccelerationStep({ run, envelopeTimeS, documentStrategyId, texNumber }) {
    const textNumber = (value, digits) => texNumber(value, digits).replaceAll("{,}", ",").replaceAll("\\,", "\u00a0");
    // Розгін завжди йде спортивною; обрана в документі стратегія керує лише
    // витратою. Ноти мусять казати саме це, а не «розгін залежить від
    // стратегії» — це було правдою до того, як розгін від неї відв'язали.
    const overridden = Boolean(documentStrategyId)
      && documentStrategyId !== ACCELERATION_STRATEGY_ID;
    const documentLabel = strategy(documentStrategyId)?.label?.toLowerCase()
      ?? documentStrategyId;
    const first = run.intervals?.[0];
    const example = first
      ? `\\Delta\\tau_1&=\\frac{${texNumber(first.deltaSpeedMs, 5)}}{${texNumber(first.accelerationMs2, 5)}}`
        + `=${texNumber(first.deltaTimeS, 5)}\\ \\text{с}\\\\ ` : "";
    return {
      id: "shift-acceleration",
      title: "Розгін за картою перемикання",
      purpose: "Time the run to the target speed with the gears the strategy gives.",
      output: {
        id: "value.shift-acceleration-time",
        symbol: "\\tau_{\\text{р}}",
        label: "Acceleration time under the chosen shift strategy",
        valueType: "quantity",
        canonicalUnit: "s"
      },
      expression: "sum(dV / a(V, gear))",
      // Розгін рахують окремою спортивною картою, тому посилатися на
      // value.shift-map (карту обраної стратегії) не можна: читач не зміг би
      // відтворити число, пройшовши ребром графа.
      dependencies: [
        ...(overridden ? [] : ["value.shift-map"]),
        "value.acceleration", "decision.shift-strategy"
      ],
      equationNumber: "5.5",
      formulaTex: "\\tau_{\\text{р}}=\\int_0^{V}\\dfrac{dV}"
        + "{j\\left(V,\\ u_i(V)\\right)}+n_{\\text{перем}}t_{\\text{перем}}",
      substitutionTex: `\\begin{aligned}${example}\\tau_{\\text{р}}&=`
        + `${texNumber(run.motionTimeS, 5)}+${run.shiftCount}\\cdot${texNumber(run.shiftTimeS, 3)}`
        + `=${texNumber(run.timeS, 3)}\\ \\text{с}\\end{aligned}`,
      result: { value: run.timeS, canonicalUnit: "s", displayUnit: "с" },
      method: "project-derivation",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        ...(first ? [`Перший інтервал: передача ${first.gear}, від ${textNumber(first.fromSpeedMs, 3)} до `
          + `${textNumber(first.toSpeedMs, 3)} м/с. Інтеграл замінено сумою ΔV/j на ${run.intervals.length} інтервалах; `
          + `${textNumber(run.motionTimeS, 5)} с — сума часу руху, до якої окремо додано час перемикань.`] : []),
        `Стратегія «${run.strategy.label.toLowerCase()}»: ${run.shiftCount} `
        + `перемикань до ${textNumber(run.targetSpeedMs * 3.6, 0)} км/год, час `
        + `самого перемикання прийнято ${textNumber(run.shiftTimeS, 1)} с.`,
        overridden ? `У документі обрано стратегію «${documentLabel}»; цей розгін окремо обчислено за стратегією «${run.strategy.label.toLowerCase()}».` : "",
        "Від 0 до першої синхронної точки застосовано явне наближення: стала початкова прискорювальна здатність першої передачі зі ковзанням зчеплення. Нагрівання зчеплення цим інтегралом не перевірено.",
        "За межами робочих швидкостей інших передач прискорення не продовжують. Це попередній розрахунок, не паспортне випробування 0–100.",
        envelopeTimeS !== null && envelopeTimeS !== undefined
          ? `Інтеграл верхньої огинаючої становить ${textNumber(envelopeTimeS, 1)} с від першої синхронної швидкості; він не включає початковий пуск і затримки перемикань. Тому різниця не є лише часом перемикань.` : ""
      ].filter(Boolean),
      assumptions: [
        "Під час перемикання тяги немає; опір за цей час не інтегрують окремо."
      ],
      limitations: []
    };
  }

  function decisionsFor({ strategyId }) {
    const chosen = strategy(strategyId);
    if (!chosen) return [];
    return [{
      id: "decision.shift-strategy",
      kind: "Decision",
      choiceRef: null,
      symbol: "k",
      adoptedValue: chosen.bandFraction,
      choiceKind: chosen.prescribed ? "regulation" : "driving-manner",
      canonicalUnit: null,
      method: "project-input",
      selectedReferenceId: null,
      recommendedValue: null,
      recommendedSourceRefs: SOURCE_REFS,
      rationale: chosen.prescribed
        ? "Передачі призначає сам алгоритм GTR 15 (додаток 2, §3.3—3.5): "
          + "найвища передача, на якій оберти в смузі й потужності вистачає. "
          + "Це не манера їзди, а норматив, і вибирати в ньому нема чого."
        : `Стратегія «${chosen.label.toLowerCase()}»: перемикають, `
          + `пройшовши ${(chosen.bandFraction * 100).toFixed(0)} % робочої смуги `
          + "обертів. Межі смуги подає GTR 15 (додаток 2), а частку смуги — "
          + "манера їзди, і задає її автор.",
      sourceRefs: chosen.prescribed
        ? ["source.unece-gtr15-annex2"] : ["source.project-input"],
      limitations: [],
      manuallyOverridden: !chosen.prescribed
    }];
  }

  return Object.freeze({
    SOURCE_REFS,
    REGULATION_REFS,
    STRATEGIES,
    ACCELERATION_STRATEGY_ID,
    ROTATING_MASS_FACTOR,
    requiredPowerBuilder,
    strategy,
    minimumAngularSpeedFor,
    speedAt95Power,
    engineSpeedAt,
    shiftMap,
    gearAt,
    accelerationRun,
    buildShiftMapStep,
    buildAccelerationStep,
    decisionsFor
  });
}
