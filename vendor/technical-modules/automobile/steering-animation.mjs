"use strict";

// Рульова трапеція в русі — розділ 21.
//
// НАВІЩО РУХ. Графік у 21.2 уже показує розходження дійсної й теоретичної
// залежностей: дві криві, між ними зазор у градусах. Але з нього не видно,
// ЩО саме розходиться. Механізм у русі показує це прямо: два перпендикуляри
// до площин коліс мали б перетнутися в одній точці на осі задніх коліс, а
// трапеція зводить їх у дві різні — і відстань між ними росте з кутом.
//
// ЩО ТУТ Є СТАНОМ, А ЩО РОЗМІРОМ. Розміри — колія, база, довжина цапфи,
// відношення плечей, розташування трапеції — належать документові й
// приходять сюди готовою геометрією. Станом анімації є ОДИН кут повороту
// внутрішнього колеса. Розділити їх треба суворо: рух не має права нічого
// записати назад у вихідні дані, інакше кадр анімації змінював би розрахунок.
//
// ЩО ЦЕ НЕ Є. Не модель динаміки: тут немає ні швидкості, ні сил, ні
// податливості. Це кінематика чотириланкового механізму в одній площині —
// рівно те, що рахує сам розділ.
export function createSteeringAnimation({dependencies={},loadDependency=null,runtime="browser"}={}) {
  const window=runtime==="browser"?dependencies:undefined; const globalThis=dependencies; const module=loadDependency?{exports:{}}:undefined; const require=loadDependency;

  const { finiteNumber } = (function loadNumeric() {
    const scope = typeof window === "object" ? window : globalThis;
    if (!scope.VehicleNumeric && typeof module === "object" && module.exports) {
      require("./numeric.js");
    }
    return scope.VehicleNumeric;
  })();

  const toRad = deg => deg * Math.PI / 180;
  const cot = rad => 1 / Math.tan(rad);

  // Один кадр: суто геометрія, у метрах, без жодного знання про SVG.
  //
  // Система координат: x праворуч уздовж передньої осі, y вперед. Шворні в
  // (0, 0) і (M, 0), вісь задніх коліс — пряма y = −L. Поворот ліворуч:
  // ліве колесо внутрішнє, центр повороту ліворуч від автомобіля.
  function frame({ geometry, innerDeg, outerDeg, idealOuterDeg }) {
    if (!geometry?.defined) {
      return { defined: false, reason: geometry?.reason || "Трапецію ще не побудовано." };
    }
    const inner = finiteNumber(innerDeg);
    if (inner === null || Math.abs(inner) >= 90) {
      return { defined: false, reason: "Потрібен кут внутрішнього колеса між −90° та +90°." };
    }
    if (inner < 0) {
      const positive = frame({ geometry, innerDeg: -inner,
        outerDeg: outerDeg == null ? null : Math.abs(outerDeg),
        idealOuterDeg: idealOuterDeg == null ? null : Math.abs(idealOuterDeg) });
      if (!positive.defined) return positive;
      const M = geometry.kingpinDistanceM;
      const mirror = p => p ? [M-p[0], p[1]] : null;
      const segment = s => s ? { ...s, from: mirror(s.from), to: mirror(s.to) } : null;
      return { ...positive, innerDeg: inner, outerDeg: positive.outerDeg === null ? null : -positive.outerDeg,
        idealOuterDeg: positive.idealOuterDeg === null ? null : -positive.idealOuterDeg,
        outerErrorDeg: positive.outerErrorDeg === null ? null : -positive.outerErrorDeg, direction: "right",
        kingpins: positive.kingpins.map(mirror), arms: positive.arms.map(segment),
        tieRod: segment(positive.tieRod), rearAxle: segment(positive.rearAxle), rearAxles: positive.rearAxles.map(segment),
        wheels: positive.wheels.map(w => ({ ...w, at: mirror(w.at), steerDeg: -w.steerDeg })),
        centreFromInner: mirror(positive.centreFromInner), centreFromOuter: mirror(positive.centreFromOuter),
        idealCentre: mirror(positive.idealCentre),
        bounds: { ...positive.bounds, minX: M-positive.bounds.maxX, maxX: M-positive.bounds.minX } };
    }
    // При нульовому куті actualOuterAngle нічого не повертає — його контракт
    // вимагає додатного кута. Але нуль тут не «немає зовнішнього колеса», а
    // НЕЙТРАЛЬНЕ положення: обидва колеса дивляться прямо, важелі стоять під
    // ±θ, тяга на місці. Раніше перший же кадр, який бачив читач, показував
    // одне колесо, один важіль і жодної тяги.
    const outer = inner === 0 ? 0 : finiteNumber(outerDeg);
    const ideal = inner === 0 ? 0 : finiteNumber(idealOuterDeg);
    const { kingpinDistanceM: M, wheelbaseM: L, armM: arm, thetaRad: theta,
      tieRodM: tie } = geometry;

    // Важелі при шворнях. Нульове положення нахилене на θ до поперечини —
    // саме цей нахил і розводить кути коліс.
    const innerRad = toRad(inner);
    const outerRad = outer === null ? null : toRad(outer);
    const leftJoint = [arm * Math.cos(innerRad - theta), arm * Math.sin(innerRad - theta)];
    const rightJoint = outerRad === null ? null
      : [M - arm * Math.cos(theta + outerRad), -arm * Math.sin(theta + outerRad)];

    // Миттєвий центр повороту, знайдений з КОЖНОГО колеса окремо. За ідеальної
    // трапеції обидві точки збігаються на осі задніх коліс; за дійсної — ні, і
    // саме цей розрив читач має побачити.
    const centreFromInner = inner > 0 ? [-L * cot(innerRad), -L] : null;
    const centreFromOuter = outerRad !== null && outer > 0
      ? [M - L * cot(outerRad), -L] : null;
    const centreGapM = centreFromInner && centreFromOuter
      ? Math.abs(centreFromOuter[0] - centreFromInner[0]) : null;

    // Те саме за теоретичною умовою — для порівняння в кадрі.
    const idealRad = ideal === null ? null : toRad(ideal);
    const idealCentre = idealRad !== null && ideal > 0
      ? [M - L * cot(idealRad), -L] : null;

    return {
      defined: true,
      innerDeg: inner,
      outerDeg: outer,
      idealOuterDeg: ideal,
      // Розходження дійсного й теоретичного кутів — те, що рахує таблиця 17.
      outerErrorDeg: outer !== null && ideal !== null ? outer - ideal : null,
      kingpins: [[0, 0], [M, 0]],
      arms: [
        { from: [0, 0], to: leftJoint },
        ...(rightJoint ? [{ from: [M, 0], to: rightJoint }] : [])
      ],
      tieRod: rightJoint ? { from: leftJoint, to: rightJoint, lengthM: tie } : null,
      // Колеса як відрізки в площині кочення, довжиною для видимості.
      wheels: [
        { at: [0, 0], steerDeg: inner, side: "inner" },
        ...(outer !== null ? [{ at: [M, 0], steerDeg: outer, side: "outer" }] : [])
      ],
      rearAxle: { from: [-0.2 * M, -L], to: [1.2 * M, -L] },
      rearAxles: [
        { from: [0, -L], to: [M, -L] },
        ...(geometry.axleCount === 3 && geometry.rearSpacingM > 0
          ? [{ from: [0, -L - geometry.rearSpacingM], to: [M, -L - geometry.rearSpacingM] }] : [])
      ],
      centreFromInner, centreFromOuter, idealCentre, centreGapM,
      bounds: bounds({ M, L, centreFromInner, centreFromOuter, idealCentre })
    };
  }

  // Огляд містить механізм і всі скінченні центри. На малих кутах механізм
  // стає дрібнішим лише в огляді; правий збільшений вигляд зберігає читабельність.
  function bounds({ M, L, centreFromInner, centreFromOuter, idealCentre }) {
    const xs = [-0.35 * M, 1.35 * M];
    const ys = [-L * 1.12, 0.45 * M];
    [centreFromInner, centreFromOuter, idealCentre].forEach(point => {
      if (!point) return;
      if (Number.isFinite(point[0])) xs.push(point[0]);
    });
    return {
      minX: Math.min(...xs), maxX: Math.max(...xs),
      minY: Math.min(...ys), maxY: Math.max(...ys)
    };
  }

  // Розкадровка: кути, які проходить анімація. Стан — і тільки він.
  function sweep({ maxInnerDeg = 30, steps = 60 } = {}) {
    const top = finiteNumber(maxInnerDeg);
    const count = Math.max(2, Math.round(finiteNumber(steps) ?? 60));
    if (top === null || top <= 0 || top >= 90) return [];
    // Туди й назад, щоб рух читався як коливання, а не як стрибок на початок.
    const forward = Array.from({ length: count },
      (unused, index) => (top * index) / (count - 1));
    const left = [...forward, ...forward.slice(1, -1).reverse()];
    return [...left, ...left.map(angle => -angle)];
  }

  // --- малювання ------------------------------------------------------------

  return Object.freeze({frame,sweep,bounds});
}
