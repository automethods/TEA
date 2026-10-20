"use strict";

// Розділ 21 — рульовий привод: трапеція й рейковий механізм.
//
// Метод із методичних вказівок, підрозділ 4.3.3 і кінець 4.3.2, друковані
// с. 66—69, звірені з рендером сторінок.
//
// Джерело перевіряє трапецію ГРАФІЧНО: креслять схему в масштабі не менше
// 1:10, повертають внутрішнє колесо через кожні 5° і вимірюють кут
// зовнішнього. Документ рахує те саме ТОЧНО — розв'язує чотириланковий
// механізм, — бо вимірювання з креслення й так наближає розв'язок, який має
// замкнений вигляд. Критерій лишається джерельним.
//
// УВАГА до позначень. Друк уживає ОДНУ літеру для двох різних величин двічі:
//   m — і модуль рейки (3,0…3,5 мм), і плече трапеції OA₃ (сотні міліметрів);
//   M — і відстань між осями шворнів, і розмір по роликах.
// Тут вони розведені: m_тр і M для трапеції, m_р і M_рол для рейки.
export function createSteeringLinkage({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
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

  const ARM_RATIO = Object.freeze({ min: 0.12, max: 0.16 });
  // x ≈ 0,7 при задньому та x ≈ 1,0 при передньому розташуванні трапеції.
  const PLACEMENT_FACTOR = Object.freeze({ rear: 0.7, front: 1.0 });
  // Табл. 17: внутрішнє колесо повертають через кожні 5°.
  const CHECK_ANGLES_DEG = Object.freeze([5, 10, 15, 20, 25, 30, 35, 40]);
  // До 20° залежності мають ЗБІГАТИСЯ, далі розходження не більше 2…3°.
  const COINCIDENCE_LIMIT_DEG = 20;
  const COINCIDENCE_TOLERANCE_DEG = 0.5;
  const MAX_DIVERGENCE_DEG = Object.freeze({ min: 2, max: 3 });

  const RACK_MODULE_MM = Object.freeze({ min: 3.0, max: 3.5 });
  const PINION_TEETH = Object.freeze({ min: 6, max: 10 });
  const RACK_HEIGHT_MM = Object.freeze({ min: 20, max: 80 });
  const PROFILE_ANGLE_DEG = 20;
  const ADDENDUM_FACTOR = 1.0;
  const CLEARANCE_FACTOR = 0.25;
  // Вираз L = OA₃·sin2α_max має максимум при 45° і далі спадає, тому за цією
  // межею він уже не описує хід рейки.
  const RACK_ANGLE_LIMIT_DEG = 45;

  const midpoint = range => (range.min + range.max) / 2;
  const toRad = deg => deg * Math.PI / 180;
  const toDeg = rad => rad * 180 / Math.PI;

  function adoptRange(range, basis, manualValue, name) {
    if (basis === "project-input") {
      const value = finiteNumber(manualValue);
      if (value === null || value <= 0) {
        return { defined: false, reason: `Вибрано власне значення (${name}), але поле порожнє.` };
      }
      return { defined: true, value, method: "project-input", range,
        withinRange: value >= range.min && value <= range.max };
    }
    if (basis !== "source-midpoint") {
      return { defined: false, reason: `Основу прийняття (${name}) не вибрано.` };
    }
    return { defined: true, value: midpoint(range), method: "source-midpoint",
      range, withinRange: true };
  }

  function placementFactor(placement) {
    return Object.prototype.hasOwnProperty.call(PLACEMENT_FACTOR, placement)
      ? PLACEMENT_FACTOR[placement] : null;
  }

  // Основні розміри трапеції: M, θ, n, m_тр.
  //
  // M — відстань між осями шворнів; її дістають, відклавши від колії по
  // довжині поворотної цапфи з кожного боку. При тороїдних шинах джерело
  // дозволяє прийняти l_ц ≈ B_ш — ширині профілю шини.
  function trapezoidGeometry({ trackWidthM, kingpinLengthM, wheelbaseM, placement,
    armRatio }) {
    const track = finiteNumber(trackWidthM);
    const kingpin = finiteNumber(kingpinLengthM);
    const base = finiteNumber(wheelbaseM);
    const ratio = finiteNumber(armRatio);
    const factor = placementFactor(placement);
    if ([track, kingpin, base, ratio].some(value => value === null || value <= 0)) {
      return { defined: false, reason: "Потрібні колія, довжина цапфи, база й відношення m/n." };
    }
    if (factor === null) {
      return { defined: false, reason: "Розташування трапеції не вибрано." };
    }
    const kingpinDistanceM = track - 2 * kingpin;
    if (!(kingpinDistanceM > 0)) {
      return {
        defined: false,
        reason: "Дві довжини цапфи перекрили колію: відстані між шворнями не лишилося."
      };
    }
    // ctg θ = M/(2xL)
    const thetaRad = Math.atan(2 * factor * base / kingpinDistanceM);
    // n = M/(1 + 2(m/n)cos θ). Вираз неявний лише на вигляд: помноживши на
    // знаменник, дістають n + 2m_тр·cos θ = M — тобто просту геометрію
    // трапеції, у якій кожне плече відбирає m_тр·cos θ.
    const tieRodM = kingpinDistanceM / (1 + 2 * ratio * Math.cos(thetaRad));
    const armM = ratio * tieRodM;
    return {
      defined: true,
      kingpinDistanceM,
      thetaRad,
      thetaDeg: toDeg(thetaRad),
      tieRodM,
      armM,
      armRatio: ratio,
      placement,
      placementFactor: factor,
      wheelbaseM: base,
      kingpinLengthM: kingpin,
      trackWidthM: track,
      // Та сама довжина, знайдена прямо з геометрії: n = M − 2m_тр·cos θ.
      tieRodCheckM: kingpinDistanceM - 2 * armM * Math.cos(thetaRad)
    };
  }

  // Кут зовнішнього колеса за теоретичною умовою (4.10):
  // ctg α_зовн − ctg α_вн = M/L.
  function theoreticalOuterAngle({ innerDeg, kingpinDistanceM, wheelbaseM }) {
    const inner = finiteNumber(innerDeg);
    const distance = finiteNumber(kingpinDistanceM);
    const base = finiteNumber(wheelbaseM);
    if ([inner, distance, base].some(value => value === null) || inner <= 0
      || distance <= 0 || base <= 0) {
      return null;
    }
    const cot = 1 / Math.tan(toRad(inner)) + distance / base;
    return toDeg(Math.atan(1 / cot));
  }

  // Кут зовнішнього колеса, який СПРАВДІ дає трапеція.
  //
  // Кінці важелів мусять лишатися на відстані n один від одного — це і є
  // рівняння замикання чотириланкового механізму. Розв'язують поділом
  // навпіл: функція монотонна в робочому діапазоні.
  function actualOuterAngle({ innerDeg, geometry }) {
    const inner = finiteNumber(innerDeg);
    if (inner === null || inner <= 0 || !geometry?.defined) return null;
    const { kingpinDistanceM: M, armM: arm, thetaRad: theta, tieRodM: n } = geometry;
    const innerRad = toRad(inner);
    const left = angle => [arm * Math.cos(angle - theta), arm * Math.sin(angle - theta)];
    const right = angle => [M - arm * Math.cos(theta + angle),
      -arm * Math.sin(theta + angle)];
    const gap = outer => {
      const [ax, ay] = left(innerRad);
      const [bx, by] = right(outer);
      return Math.hypot(bx - ax, by - ay) - n;
    };
    let low = -toRad(5);
    let high = innerRad + toRad(5);
    if (gap(low) * gap(high) > 0) return null;
    for (let step = 0; step < 200; step += 1) {
      const middle = (low + high) / 2;
      if (gap(middle) * gap(low) <= 0) high = middle; else low = middle;
    }
    const outer = toDeg((low + high) / 2);
    return outer > 0 ? outer : null;
  }

  // Табл. 17 — обидві залежності поряд.
  function angleTable({ geometry }) {
    if (!geometry?.defined) {
      return { defined: false, reason: geometry?.reason || "Трапецію ще не побудовано." };
    }
    const rows = [];
    for (const innerDeg of CHECK_ANGLES_DEG) {
      const theoretical = theoreticalOuterAngle({
        innerDeg, kingpinDistanceM: geometry.kingpinDistanceM,
        wheelbaseM: geometry.wheelbaseM
      });
      const actual = actualOuterAngle({ innerDeg, geometry });
      if (theoretical === null || actual === null) {
        return {
          defined: false,
          reason: `Кут ${innerDeg}° не вдалося замкнути: трапеція такої геометрії `
            + "не збирається."
        };
      }
      rows.push({
        innerDeg, theoreticalDeg: theoretical, actualDeg: actual,
        divergenceDeg: actual - theoretical
      });
    }
    return { defined: true, rows };
  }

  // Критерій джерела: до 20° залежності збігаються, далі розходження не
  // перевищує 2…3°.
  function trapezoidVerdict({ table }) {
    if (!table?.defined) {
      return { checked: false, reason: table?.reason || "Таблиці ще немає." };
    }
    const early = table.rows.filter(row => row.innerDeg <= COINCIDENCE_LIMIT_DEG);
    const late = table.rows.filter(row => row.innerDeg > COINCIDENCE_LIMIT_DEG);
    const earlyWorst = Math.max(...early.map(row => Math.abs(row.divergenceDeg)));
    const lateWorst = Math.max(...late.map(row => Math.abs(row.divergenceDeg)));
    const coincides = earlyWorst <= COINCIDENCE_TOLERANCE_DEG;
    const withinLimit = lateWorst <= MAX_DIVERGENCE_DEG.max;
    return {
      checked: true,
      coincides,
      withinLimit,
      satisfactory: coincides && withinLimit,
      earlyWorstDeg: earlyWorst,
      lateWorstDeg: lateWorst,
      coincidenceLimitDeg: COINCIDENCE_LIMIT_DEG,
      toleranceDeg: COINCIDENCE_TOLERANCE_DEG,
      allowedDeg: MAX_DIVERGENCE_DEG
    };
  }

  // Рейковий рульовий механізм — за друком с. 66—67.
  function rackGeometry({ armM, maxSteerDeg, moduleMm, pinionTeeth, rackHeightMm }) {
    const arm = finiteNumber(armM);
    const maxSteer = finiteNumber(maxSteerDeg);
    const module_ = finiteNumber(moduleMm);
    const teeth = finiteNumber(pinionTeeth);
    const height = finiteNumber(rackHeightMm);
    if ([arm, maxSteer, module_, teeth, height]
      .some(value => value === null || value <= 0)) {
      return { defined: false, reason: "Потрібні плече трапеції, кут повороту, модуль, зуби й висота рейки." };
    }
    if (maxSteer >= RACK_ANGLE_LIMIT_DEG) {
      return {
        defined: false,
        reason: `Вираз L = OA₃·sin2α_max має максимум при ${RACK_ANGLE_LIMIT_DEG}° `
          + "і далі спадає: за цією межею він уже не описує хід рейки."
      };
    }
    const pitchMm = Math.PI * module_;
    // L = OA₃·sin2α_max, де OA₃ — плече трапеції.
    const rawLengthMm = arm * 1000 * Math.sin(2 * toRad(maxSteer));
    const rawTeeth = rawLengthMm / pitchMm + 0.5;
    const rackTeeth = Math.round(rawTeeth);
    if (!(rackTeeth > 0)) {
      return { defined: false, reason: "Хід рейки замалий навіть на один зуб." };
    }
    // Уточнена довжина нарізаної частини.
    const lengthMm = (rackTeeth - 0.5) * pitchMm;
    const toothHeightMm = (2 * ADDENDUM_FACTOR + CLEARANCE_FACTOR) * module_;
    const toothThicknessMm = 0.5 * Math.PI * module_;
    const alpha = toRad(PROFILE_ANGLE_DEG);
    const overRollersMm = height
      + 0.85 * module_ * (1 / Math.sin(alpha) + 1)
      - (Math.PI / (4 * Math.tan(alpha)) + 1) * module_;
    return {
      defined: true,
      pitchMm, rawLengthMm, rawTeeth, rackTeeth, lengthMm,
      toothHeightMm, toothThicknessMm, overRollersMm,
      moduleMm: module_, pinionTeeth: teeth, rackHeightMm: height,
      maxSteerDeg: maxSteer, armM: arm,
      pinionWithinRange: teeth >= PINION_TEETH.min && teeth <= PINION_TEETH.max
    };
  }

  function buildTrapezoidStep({ geometry, texNumber }) {
    return {
      id: "steering-trapezoid",
      title: "Основні розміри рульової трапеції",
      purpose: "Fix the trapezoid that turns one steering input into two wheel angles.",
      output: {
        id: "value.steering-trapezoid-tie-rod",
        symbol: "n",
        label: "Steering tie rod length",
        valueType: "quantity",
        canonicalUnit: "m"
      },
      expression: "M / (1 + 2 (m/n) cos theta)",
      dependencies: ["input.track-width", "input.wheelbase",
        "decision.steering-trapezoid-placement", "decision.steering-trapezoid-arm-ratio"],
      equationNumber: "21.1",
      formulaTex: "M=B-2l_{\\text{ц}},\\qquad "
        + "\\operatorname{ctg}\\theta=\\dfrac{M}{2xL},\\qquad "
        + "n=\\dfrac{M}{1+2\\dfrac{m_{\\text{тр}}}{n}\\cos\\theta}",
      substitutionTex: `\\begin{aligned}M&=${texNumber(geometry.trackWidthM, 3)}-2\\cdot`
        + `${texNumber(geometry.kingpinLengthM, 3)}=`
        + `${texNumber(geometry.kingpinDistanceM, 3)}\\ \\text{м}\\\\[3pt]`
        + `\\theta&=\\arctan\\dfrac{2\\cdot${texNumber(geometry.placementFactor, 2)}`
        + `\\cdot${texNumber(geometry.wheelbaseM, 3)}}{${texNumber(geometry.kingpinDistanceM, 3)}}`
        + `\\cdot\\dfrac{180}{\\pi}=${texNumber(geometry.thetaDeg, 5)}^{\\circ}\\\\[3pt]`
        + `n&=\\dfrac{${texNumber(geometry.kingpinDistanceM, 3)}}`
        + `{1+2\\cdot${texNumber(geometry.armRatio, 4)}\\cdot\\cos(${texNumber(geometry.thetaDeg, 5)}^{\\circ})}`
        + `=${texNumber(geometry.tieRodM, 5)}\\ \\text{м}\\\\[3pt]`
        + `m_{\\text{тр}}&=${texNumber(geometry.armRatio, 4)}\\cdot${texNumber(geometry.tieRodM, 5)}`
        + `=${texNumber(geometry.armM, 5)}\\ \\text{м}\\end{aligned}`,
      result: { value: geometry.tieRodM, canonicalUnit: "m", displayUnit: "м" },
      method: "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        `Відношення плеча до тяги m_тр/n = ${ARM_RATIO.min}…${ARM_RATIO.max}; `
        + `множник розташування x = ${PLACEMENT_FACTOR.rear} при задній трапеції `
        + `і ${PLACEMENT_FACTOR.front} при передній.`,
        "Вираз для n неявний лише на вигляд: помноживши на знаменник, дістають "
        + "n + 2m_тр·cos θ = M — просту геометрію трапеції, у якій кожне плече "
        + `відбирає m_тр·cos θ. Пряма перевірка: M − 2m_тр·cos θ = `
        + `${texNumber(geometry.tieRodCheckM, 3)} м.`,
        "Довжину поворотної цапфи l_ц при тороїдних шинах джерело дозволяє "
        + "прийняти рівною ширині профілю шини B_ш."
      ],
      assumptions: [],
      limitations: []
    };
  }

  function buildAngleStep({ table, verdict, geometry, texNumber }) {
    const worst = table.rows.reduce((best, row) =>
      (Math.abs(row.divergenceDeg) > Math.abs(best.divergenceDeg) ? row : best));
    return {
      id: "steering-trapezoid-angles",
      title: "Перевірка трапеції за кутами повороту коліс",
      purpose: "Check the trapezoid reproduces the Ackermann relation closely enough.",
      output: {
        id: "value.steering-trapezoid-divergence",
        symbol: "\\Delta\\alpha_{\\text{зовн}}",
        label: "Worst divergence between the actual and theoretical outer angle",
        valueType: "quantity",
        canonicalUnit: "deg"
      },
      expression: "max |alpha_actual - alpha_theoretical|",
      dependencies: ["value.steering-trapezoid-tie-rod"],
      equationNumber: "21.2",
      formulaTex: "\\begin{aligned}\\operatorname{ctg}\\alpha_{\\text{зовн}}"
        + "-\\operatorname{ctg}\\alpha_{\\text{вн}}&=\\dfrac{M}{L}\\\\[3pt]"
        + "\\Delta\\alpha_{\\max}&=\\max|\\alpha_{\\text{факт}}-\\alpha_{\\text{теор}}|\\end{aligned}",
      substitutionTex: `\\begin{aligned}\\dfrac{M}{L}&=\\dfrac{${texNumber(geometry.kingpinDistanceM, 3)}}`
        + `{${texNumber(geometry.wheelbaseM, 2)}}`
        + `=${texNumber(geometry.kingpinDistanceM / geometry.wheelbaseM, 4)}\\\\[3pt]`
        + `\\Delta\\alpha_{\\max}&=|${texNumber(worst.actualDeg, 4)}-${texNumber(worst.theoreticalDeg, 4)}|`
        + `=${texNumber(Math.abs(worst.divergenceDeg), 4)}^{\\circ}`
        + `\\quad(\\alpha_{\\text{вн}}=${worst.innerDeg}^{\\circ})\\end{aligned}`,
      result: {
        value: Math.abs(worst.divergenceDeg), canonicalUnit: "deg", displayUnit: "град"
      },
      method: "project-derivation",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        "Джерело перевіряє трапецію КРЕСЛЕННЯМ: у масштабі не менше 1:10 "
        + "повертають внутрішнє колесо через кожні 5° і вимірюють кут "
        + "зовнішнього. Документ розв'язує те саме рівняння замикання "
        + "чотириланкового механізму точно — кінці важелів мусять лишатися на "
        + "відстані n один від одного. Це не інший метод, а те саме "
        + "вимірювання без похибки лінійки.",
        `Критерій джерела: до ${COINCIDENCE_LIMIT_DEG}° залежності мають `
        + `збігатися, далі розходження не більше ${MAX_DIVERGENCE_DEG.min}…`
        + `${MAX_DIVERGENCE_DEG.max}°.`,
        `Тут до ${COINCIDENCE_LIMIT_DEG}° розходження не перевищує `
        + `${texNumber(verdict.earlyWorstDeg, 2)}°, далі — `
        + `${texNumber(verdict.lateWorstDeg, 2)}°.`
      ],
      assumptions: [
        "Важелі трапеції однакові, шворні вертикальні, ланки жорсткі."
      ],
      limitations: verdict.satisfactory
        ? []
        : [verdict.coincides
          ? `Розходження за ${COINCIDENCE_LIMIT_DEG}° сягає `
            + `${verdict.lateWorstDeg.toFixed(2)}° — понад дозволені `
            + `${MAX_DIVERGENCE_DEG.max}°.`
          : `До ${COINCIDENCE_LIMIT_DEG}° залежності не збігаються: розходження `
            + `${verdict.earlyWorstDeg.toFixed(2)}°.`]
    };
  }

  function buildRackStep({ rack, texNumber }) {
    return {
      id: "steering-rack",
      title: "Рейковий рульовий механізм",
      purpose: "Size the rack: toothed length, tooth count and tooth proportions.",
      output: {
        id: "value.steering-rack-length",
        symbol: "L_{\\text{р}}",
        label: "Toothed length of the rack",
        valueType: "quantity",
        canonicalUnit: "mm"
      },
      expression: "(Z - 0.5) * pi * m",
      dependencies: ["decision.steering-pinion-teeth", "decision.steering-rack-height", "value.steering-trapezoid-tie-rod",
        "decision.steering-rack-module"],
      equationNumber: "21.3",
      formulaTex: "\\begin{aligned}P_n&=\\pi m_{\\text{р}},\\qquad "
        + "L_{\\text{поп}}=1000OA_3\\sin(2\\alpha_{\\max})\\quad[\\text{мм}]\\\\[3pt]"
        + "Z_{\\text{поп}}&=\\dfrac{L_{\\text{поп}}}{P_n}+0{,}5,\\qquad "
        + "L=\\left(Z_{\\text{пр}}-0{,}5\\right)P_n\\end{aligned}",
      substitutionTex: `\\begin{aligned}P_n&=\\pi\\cdot${texNumber(rack.moduleMm, 2)}`
        + `=${texNumber(rack.pitchMm, 5)}\\ \\text{мм}\\\\[3pt]`
        + `L_{\\text{поп}}&=1000\\cdot${texNumber(rack.armM, 5)}\\cdot`
        + `\\sin(2\\cdot${texNumber(rack.maxSteerDeg, 2)}^{\\circ})`
        + `=${texNumber(rack.rawLengthMm, 4)}\\ \\text{мм}\\\\[3pt]`
        + `Z_{\\text{поп}}&=\\dfrac{${texNumber(rack.rawLengthMm, 4)}}{${texNumber(rack.pitchMm, 5)}}+0{,}5`
        + `=${texNumber(rack.rawTeeth, 4)}\\to Z_{\\text{пр}}=${rack.rackTeeth}\\\\[3pt]`
        + `L&=(${rack.rackTeeth}-0{,}5)\\cdot${texNumber(rack.pitchMm, 5)}`
        + `=${texNumber(rack.lengthMm, 3)}\\ \\text{мм}\\end{aligned}`,
      result: { value: rack.lengthMm, canonicalUnit: "mm", displayUnit: "мм" },
      method: "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        // Та сама літера двічі — і не в сусідніх розділах, а на сусідніх
        // сторінках.
        "У друку та сама літера m означає тут ДВІ різні величини: модуль "
        + "рейки (3,0…3,5 мм) і плече трапеції OA₃ (сотні міліметрів). У "
        + "виразі L = OA₃·sin2α_max йдеться про плече, а в P_n = πm — про "
        + "модуль. Тут вони розведені: m_р і m_тр.",
        `Висота зуба h = (2h*_a + c*)m_р = ${texNumber(rack.toothHeightMm, 2)} мм `
        + `при h*_a = ${ADDENDUM_FACTOR} і c* = ${CLEARANCE_FACTOR}; товщина `
        + `S̄_y = 0,5πm_р = ${texNumber(rack.toothThicknessMm, 2)} мм.`,
        `Розмір по роликах M_рол = ${texNumber(rack.overRollersMm, 2)} мм при `
        + `висоті рейки H = ${texNumber(rack.rackHeightMm, 0)} мм і куті `
        + `головного профілю α = ${PROFILE_ANGLE_DEG}°. У друку він теж зветься `
        + "M — як і відстань між шворнями трапеції.",
        `Зубів шестерні Z₁ = ${rack.pinionTeeth}; джерело подає `
        + `${PINION_TEETH.min}…${PINION_TEETH.max}.`
      ],
      assumptions: [
        "Число зубів рейки округлюють до цілого, після чого довжину нарізаної "
        + "частини уточнюють — так велить джерело."
      ],
      limitations: rack.pinionWithinRange
        ? []
        : [`Число зубів шестерні поза межами ${PINION_TEETH.min}…${PINION_TEETH.max}.`]
    };
  }

  function decisionsFor({ placement, armRatio, rackModule, rackHeight, pinionTeeth }) {
    const decisions = [];
    if (placement) {
      decisions.push({
        id: "decision.steering-trapezoid-placement",
        kind: "Decision",
        choiceRef: null,
        symbol: "x",
        adoptedValue: placementFactor(placement),
        canonicalUnit: null,
        method: "project-input",
        selectedReferenceId: null,
        recommendedValue: null,
        recommendedSourceRefs: SOURCE_REFS,
        rationale: placement === "rear"
          ? `Заднє розташування трапеції: x = ${PLACEMENT_FACTOR.rear}.`
          : `Переднє розташування трапеції: x = ${PLACEMENT_FACTOR.front}.`,
        sourceRefs: SOURCE_REFS,
        limitations: [],
        manuallyOverridden: true
      });
    }
    [["decision.steering-trapezoid-arm-ratio", "m_{\\text{тр}}/n", armRatio,
      ARM_RATIO, null],
      ["decision.steering-rack-module", "m_{\\text{р}}", rackModule,
        RACK_MODULE_MM, "mm"],
      ["decision.steering-rack-height", "H", rackHeight, RACK_HEIGHT_MM, "mm"],
      ["decision.steering-pinion-teeth", "Z_1", pinionTeeth, PINION_TEETH, null]]
      .forEach(([id, symbol, adopted, range, unit]) => {
        if (!adopted?.defined) return;
        decisions.push({
          id,
          kind: "Decision",
          choiceRef: null,
          symbol,
          adoptedValue: adopted.value,
          canonicalUnit: unit,
          method: adopted.method === "project-input" ? "project-input" : "source-midpoint",
          selectedReferenceId: null,
          recommendedValue: midpoint(range),
          recommendedSourceRefs: SOURCE_REFS,
          rationale: adopted.method === "project-input"
            ? `Власне значення автора. Джерело подає ${range.min}…${range.max}.`
            : `Прийнято середину діапазону ${range.min}…${range.max}.`,
          sourceRefs: adopted.method === "project-input"
            ? ["source.project-input"] : SOURCE_REFS,
          limitations: adopted.withinRange === false
            ? ["Значення лежить поза діапазоном джерела."] : [],
          manuallyOverridden: adopted.method === "project-input"
        });
      });
    return decisions;
  }

  function diagnosticsFor({ verdict, rack }) {
    const out = [];
    if (verdict?.checked && !verdict.satisfactory) {
      out.push({
        code: "STEERING_TRAPEZOID_DIVERGENCE",
        severity: "warning",
        message: verdict.coincides
          ? `Розходження між дійсною й теоретичною залежностями сягає `
            + `${verdict.lateWorstDeg.toFixed(2)}° — понад дозволені `
            + `${verdict.allowedDeg.max}°. Розміри трапеції треба переглянути.`
          : `До ${verdict.coincidenceLimitDeg}° залежності мають збігатися, а `
            + `розходяться на ${verdict.earlyWorstDeg.toFixed(2)}°. Розміри `
            + "трапеції треба переглянути.",
        details: { node: "calc.steering-trapezoid-angles" }
      });
    }
    if (rack?.defined && !rack.pinionWithinRange) {
      out.push({
        code: "STEERING_PINION_TEETH_OUT_OF_RANGE",
        severity: "warning",
        message: `Зубів шестерні ${rack.pinionTeeth}; джерело подає `
          + `${PINION_TEETH.min}…${PINION_TEETH.max}.`,
        details: { node: "calc.steering-rack" }
      });
    }
    return out;
  }

  return Object.freeze({
    SOURCE_REFS,
    ARM_RATIO,
    PLACEMENT_FACTOR,
    CHECK_ANGLES_DEG,
    COINCIDENCE_LIMIT_DEG,
    COINCIDENCE_TOLERANCE_DEG,
    MAX_DIVERGENCE_DEG,
    RACK_MODULE_MM,
    PINION_TEETH,
    RACK_HEIGHT_MM,
    PROFILE_ANGLE_DEG,
    ADDENDUM_FACTOR,
    CLEARANCE_FACTOR,
    RACK_ANGLE_LIMIT_DEG,
    midpoint,
    adoptRange,
    placementFactor,
    trapezoidGeometry,
    theoreticalOuterAngle,
    actualOuterAngle,
    angleTable,
    trapezoidVerdict,
    rackGeometry,
    buildTrapezoidStep,
    buildAngleStep,
    buildRackStep,
    decisionsFor,
    diagnosticsFor
  });
}
