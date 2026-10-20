"use strict";

// Тягова діаграма — розділ 4.7.
//
// Досі розділ 4 давав таблицю сил: момент, помножений на передаточне число,
// поділений на радіус. Це перетворення, а не перевірка. Перевіркою воно стає
// тоді, коли на тій самій осі швидкості поряд із тягою стоїть те, що їй
// протидіє, і видно точку, де вони зрівнялися: далі автомобіль не розганяється,
// бо розганяти вже нічим.
//
// На одній осі тут:
//   * сила тяги кожного шляху;
//   * верхня огинаюча — те, що привод узагалі може дати;
//   * опір дороги ψ·G_a — сталий за швидкістю в цій моделі;
//   * сумарний опір ψ·G_a + W·v² — росте квадратично;
//   * межа зчеплення φ·G_зч — горизонталь, вище якої колесо буксує;
//   * перетин огинаючої з сумарним опором — досяжна максимальна швидкість.
export function createTractionDiagram({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;


  // The worksheet supplies f0 so each plotted speed uses the same correction
  // as the design-speed power calculation. Legacy callers may supply fixed psi.
  function resistanceCurve({ speedsMs, roadResistancePsi, grossWeightForceKn, dragFactorW,
    rollingResistanceF0 = null, gradeAngleRad = 0 }) {
    // NaN не більший і не менший за ніщо, тому нечислові дані не викликають
    // помилки — вони мовчки роблять кожне порівняння хибним, і перевірка
    // перетину доходить до «тяга ніде не перевищує опору» на графіку з
    // намальованими кривими. Один раз так уже сталося: фактор обтічності
    // передали об'єктом замість числа.
    [["ψ", roadResistancePsi], ["G_a", grossWeightForceKn], ["W", dragFactorW]]
      .forEach(([name, value]) => {
        if (!Number.isFinite(Number(value))) {
          throw new TypeError(`Опір руху: ${name} має бути числом, отримано ${typeof value}.`);
        }
      });
    const scope = typeof window === "object" ? window : globalThis;
    const correction = scope.VehicleRollingResistanceSpeed || (typeof require === "function"
      ? require("./rolling-resistance-speed.js") : null);
    return speedsMs.map(speedMs => {
      const f = Number.isFinite(rollingResistanceF0) && correction
        ? correction.correctForSpeed(rollingResistanceF0, speedMs * 3.6).rollingResistanceF : null;
      const psi = Number.isFinite(f) ? f * Math.cos(gradeAngleRad) + Math.sin(gradeAngleRad) : roadResistancePsi;
      const roadN = psi * grossWeightForceKn * 1000;
      const dragN = dragFactorW * speedMs ** 2;
      return { speedMs, roadN, dragN, totalN: roadN + dragN };
    });
  }

  // Перетин двох кривих, заданих у тих самих точках. Лінійна інтерполяція між
  // сусідніми точками — той самий метод, що й скрізь у цьому проєкті.
  //
  // Береться ПЕРШИЙ перетин згори вниз: там, де тяга востаннє перевищувала
  // опір. Далі крива тяги може перетинати опір ще раз на низькій швидкості —
  // це не максимальна швидкість, а зона, у якій автомобіль розганяється.
  function crossing(tractionPoints, resistancePoints) {
    let previous = null;
    for (let index = 0; index < tractionPoints.length; index += 1) {
      const traction = tractionPoints[index];
      const resistance = resistancePoints[index];
      if (!traction || !resistance) continue;
      const surplus = traction.forceN - resistance.totalN;
      if (previous && previous.surplus >= 0 && surplus < 0) {
        const span = previous.surplus - surplus;
        const share = span === 0 ? 0 : previous.surplus / span;
        return {
          defined: true,
          speedMs: previous.speedMs + share * (traction.speedMs - previous.speedMs),
          reason: null
        };
      }
      previous = { speedMs: traction.speedMs, surplus };
    }
    // Огинаюча ніде не опустилася нижче за опір: у межах побудованої кривої
    // автомобіль ще має надлишок сили, і максимальну швидкість обмежує не
    // опір, а кінець характеристики — тобто обмежувач обертів.
    if (previous && previous.surplus >= 0) {
      return {
        defined: false,
        limitedBy: "curve-end",
        reason: "Тяга перевищує опір на всій побудованій кривій: швидкість обмежує "
          + "не опір дороги й повітря, а кінець характеристики."
      };
    }
    return {
      defined: false,
      limitedBy: "no-surplus",
      reason: "Тяга ніде не перевищує опору: автомобіль не рушить із цією передачею."
    };
  }

  // Верхня огинаюча кількох передач: на кожній швидкості береться найбільша
  // сила з тих, які може дати хоч одна передача. Саме це й називають тяговою
  // характеристикою автомобіля — без ряду передач крива описувала б рух лише
  // на вищій передачі, а виглядала б як повна тягова здатність.
  function multiGearEnvelope(gearCurves) {
    const speeds = [...new Set(gearCurves.flatMap(item =>
      item.points.map(point => point.speedMs)))].sort((first, second) => first - second);
    return speeds.map(speedMs => {
      let best = null;
      let bestGear = null;
      gearCurves.forEach(item => {
        const forceN = interpolate(item.points, speedMs);
        if (forceN !== null && (best === null || forceN > best)) {
          best = forceN;
          bestGear = item.gear;
        }
      });
      return { speedMs, forceN: best === null ? 0 : best, gear: bestGear };
    }).filter(point => point.forceN > 0);
  }

  function interpolate(points, speedMs) {
    if (!points.length) return null;
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

  function launchSegment(gearCurves, adhesionLimitN, launchModel) {
    if (!launchModel || launchModel === "none") return null;
    const firstGear = (gearCurves || [])
      .filter(item => item?.points?.length)
      .slice()
      .sort((left, right) => Number(left.gear ?? 0) - Number(right.gear ?? 0))[0];
    if (!firstGear) return null;
    const points = firstGear.points.slice().sort((left, right) => left.speedMs - right.speedMs);
    const first = points[0];
    if (!(first?.speedMs > 0) || !(first?.forceN > 0)) return null;
    const rawForceN = first.forceN;
    const forceN = Number.isFinite(adhesionLimitN)
      ? Math.min(rawForceN, adhesionLimitN)
      : rawForceN;
    return {
      defined: true,
      kind: "slipping-coupling",
      startSpeedMs: 0,
      endSpeedMs: first.speedMs,
      forceN,
      rawForceN,
      adhesionLimited: Number.isFinite(adhesionLimitN) && forceN < rawForceN
    };
  }

  function build({
    combined, resistance, adhesionForceKn = null, requestedSpeedMs = null,
    gearCurves = null, launchModel = null
  }) {
    if (!combined || !combined.defined) {
      return { defined: false, reason: combined?.reason || "Сумарної сили тяги не побудовано." };
    }
    // Ряд передач є — огинаюча будується по ньому. Немає — по єдиному шляху,
    // і тоді вона описує рух лише на прийнятій передачі, про що має бути
    // сказано, а не залишено на здогад.
    const usableGears = (gearCurves || []).filter(item => item.points && item.points.length);
    const envelope = usableGears.length
      ? multiGearEnvelope(usableGears)
      : combined.points.map(point => ({ speedMs: point.speedMs, forceN: point.adoptedN }));
    const adhesionLimitN = adhesionForceKn === null ? null : adhesionForceKn * 1000;
    if (Number.isFinite(adhesionLimitN) && adhesionLimitN >= 0) {
      envelope.forEach(point => { point.rawForceN = point.forceN; point.forceN = Math.min(point.forceN, adhesionLimitN); });
    }
    const speedsMs = envelope.map(point => point.speedMs);
    const resistancePoints = resistanceCurve({ ...resistance, speedsMs });
    const intersection = crossing(envelope, resistancePoints);
    const launch = launchSegment(usableGears, adhesionLimitN, launchModel);
    if (launch) {
      const launchResistance = resistanceCurve({ ...resistance, speedsMs: [0] })[0];
      launch.resistanceN = launchResistance.totalN;
      launch.canMove = launch.forceN >= launchResistance.totalN;
    }

    return {
      defined: true,
      envelope,
      gearCurves: usableGears,
      launch,
      // Скільки передач стоїть за огинаючою. Одна означає, що крива описує
      // рух лише на прийнятій передачі, і читач має це знати.
      gearCount: usableGears.length,
      singleGearOnly: usableGears.length <= 1,
      resistance: resistancePoints,
      adhesionLimitN,
      intersection,
      requestedSpeedMs,
      // Порівняння задуманого з отриманим. Якщо перетин нижчий за задану
      // швидкість, автомобіль її не розвине — і це те саме, що каже баланс
      // потужностей, тільки видно на графіку.
      meetsRequestedSpeed: intersection.defined && requestedSpeedMs !== null
        ? intersection.speedMs >= requestedSpeedMs && launch?.canMove !== false
        : null
    };
  }

  return Object.freeze({ resistanceCurve, crossing, multiGearEnvelope, launchSegment, build });
}
