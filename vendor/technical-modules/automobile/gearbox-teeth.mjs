"use strict";

// Розділ 10.1 — числа зубів шестерень коробки передач.
//
// Тут уперше в цьому документі величини ДИСКРЕТНІ: зубів не буває 23,4. Через
// це передаточне число, знайдене тяговим розрахунком, точно відтворити
// неможливо, і методика це визнає — вона дозволяє відхилення до 5 %.
//
// Обидві книжки описують цей розрахунок ОДНАКОВО, аж до чисел: u_п = 1,8…2,5,
// Z₁ = 17…23, рівність сум зубів у парах і межа 5 %. Розбіжностей тут немає,
// тому профіль на нього не впливає — на відміну від розділу 9.
export function createGearboxTeeth({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;


  // Схеми коробки. Від них залежить сама будова розрахунку, а не лише числа:
  // у тривальній момент іде через ДВІ пари шестерень, у двовальній — через одну.
  const TOPOLOGIES = Object.freeze([
    {
      id: "three-shaft",
      label: "Тривальна коробка передач",
      pairsPerGear: 2,
      // Пряма передача моменту через шестерні не передає взагалі: первинний і
      // вторинний вали з'єднуються навпростець.
      hasDirectGear: true
    },
    {
      id: "two-shaft",
      label: "Двовальна коробка передач",
      pairsPerGear: 1,
      hasDirectGear: false
    }
  ]);

  const SOURCE_RANGES = Object.freeze({
    // u_п = Z₂/Z₁ — передаточне число пари постійного зачеплення.
    constantMeshRatio: { min: 1.8, max: 2.5 },
    // Z₁ — число зубів шестерні первинного вала (тривальна) або ведучої
    // шестерні першої передачі (двовальна).
    drivingTeeth: { min: 17, max: 23 },
    // Відхилення дійсного передаточного числа від знайденого тяговим
    // розрахунком.
    ratioDeviation: 0.05
  });

  const SOURCE_REFS = Object.freeze(["source.method.course", "source.method.opanasyuk"]);

  function topology(id) {
    return TOPOLOGIES.find(item => item.id === id) || null;
  }

  function finiteNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") return null;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  function greatestCommonDivisor(first, second) {
    let a = Math.abs(first);
    let b = Math.abs(second);
    while (b) {
      const remainder = a % b;
      a = b;
      b = remainder;
    }
    return a;
  }

  // Пара постійного зачеплення тривальної коробки: її приймає автор у межах,
  // які подають обидві книжки, а сума Z₁ + Z₂ далі тримає всі інші пари.
  function adoptConstantMesh({ basis, meshRatio, drivingTeeth }) {
    if (basis !== "source-midpoint" && basis !== "project-input") {
      return {
        defined: false,
        reason: "Основа прийняття має бути «source-midpoint» або «project-input»; "
          + `отримано ${basis === null || basis === undefined || basis === ""
            ? "нічого" : JSON.stringify(basis)}.`
      };
    }

    const ranges = SOURCE_RANGES;
    const ratio = basis === "source-midpoint"
      ? (ranges.constantMeshRatio.min + ranges.constantMeshRatio.max) / 2
      : finiteNumber(meshRatio);
    const teeth = basis === "source-midpoint"
      ? Math.round((ranges.drivingTeeth.min + ranges.drivingTeeth.max) / 2)
      : finiteNumber(drivingTeeth);

    const problems = [];
    if (ratio === null || ratio <= 0) {
      problems.push("передаточне число пари постійного зачеплення не задано.");
    }
    if (teeth === null || teeth <= 0) {
      problems.push("число зубів шестерні первинного вала не задано.");
    } else if (!Number.isInteger(teeth)) {
      problems.push(`число зубів ${teeth}: зубів не буває дробових.`);
    }
    if (problems.length) {
      return { defined: false, problems, reason: problems.join(" ") };
    }

    // Z₂ = u_п · Z₁ — і воно теж ціле, тому приймають найближче ціле, а
    // дійсне u_п рахують уже з нього. Інакше сума Z₁ + Z₂ була б дробовою, і
    // рівність сум у парах — фікцією.
    const drivenTeeth = Math.round(ratio * teeth);
    const actualRatio = drivenTeeth / teeth;
    return {
      defined: true,
      basis,
      method: basis === "source-midpoint" ? "source-midpoint" : "project-input",
      meshRatio: ratio,
      actualMeshRatio: actualRatio,
      drivingTeeth: teeth,
      drivenTeeth,
      teethSum: teeth + drivenTeeth,
      withinRange: {
        meshRatio: ratio >= ranges.constantMeshRatio.min
          && ratio <= ranges.constantMeshRatio.max,
        drivingTeeth: teeth >= ranges.drivingTeeth.min
          && teeth <= ranges.drivingTeeth.max
      },
      sourceRefs: SOURCE_REFS
    };
  }

  // Пара шестерень однієї передачі.
  //
  // Сума зубів у парі задана — вона однакова для всіх пар, бо модуль і кут
  // нахилу однакові, а вали паралельні. Тому вибирати можна лише РОЗПОДІЛ цієї
  // суми, і кожен розподіл дає своє дійсне передаточне число.
  function teethForGear({ teethSum, targetRatio, meshRatio = 1 }) {
    const sum = finiteNumber(teethSum);
    const target = finiteNumber(targetRatio);
    const mesh = finiteNumber(meshRatio);
    if (sum === null || target === null || mesh === null
      || sum <= 0 || target <= 0 || mesh <= 0) {
      return { defined: false, reason: "Потрібні сума зубів і цільове передаточне число." };
    }

    // Шукана частка: скільки разів ведена шестерня більша за ведучу.
    const wanted = target / mesh;
    const candidates = [];
    for (let driving = 1; driving < sum; driving += 1) {
      const driven = sum - driving;
      const actual = mesh * (driven / driving);
      candidates.push({
        drivingTeeth: driving,
        drivenTeeth: driven,
        actualRatio: actual,
        deviation: (actual - target) / target,
        // «Уникаючи кратності кількостей зуб'їв у парі»: спільний дільник
        // означає, що ті самі зуби зустрічаються знову й знову, і зношуються
        // нерівномірно.
        shareFactor: greatestCommonDivisor(driving, driven) > 1
      });
    }

    // Спершу ті, що вкладаються в 5 % і не мають спільного дільника; далі —
    // просто найближчі. Порада лишається порадою: приймає автор.
    const withinLimit = candidates.filter(item =>
      Math.abs(item.deviation) <= SOURCE_RANGES.ratioDeviation);
    const preferred = withinLimit.filter(item => !item.shareFactor);
    const pool = preferred.length ? preferred : (withinLimit.length ? withinLimit : candidates);
    const best = pool.reduce((chosen, item) =>
      Math.abs(item.deviation) < Math.abs(chosen.deviation) ? item : chosen);

    return {
      defined: true,
      wantedRatio: wanted,
      recommended: best,
      withinLimitCount: withinLimit.length,
      coprimeWithinLimitCount: preferred.length,
      sourceRefs: SOURCE_REFS
    };
  }

  // Adopt one integer gearset before the traction calculations. The mesh is a
  // starting design choice, not a 23-tooth size limit: an automatic design may
  // need a larger common tooth sum to keep every pinion/wheel at least 17 teeth.
  // First/top are inequalities (launch and overspeed), so symmetric rounding
  // alone is insufficient even when its error is less than five per cent.
  function selectFeasibleGearset({ topologyId, mesh, targetGears,
    automaticMesh = false, maximumStepRatio = null, cruiseGearCheck = null, maximumGearRatios = null }) {
    const scheme = topology(topologyId);
    const targets = Array.isArray(targetGears) ? targetGears.map((item, index) => ({
      gear: item.gear || index + 1, targetRatio: finiteNumber(item.ratio)
    })) : [];
    const minimum = SOURCE_RANGES.drivingTeeth.min;
    const limit = SOURCE_RANGES.ratioDeviation;
    const maxStep = finiteNumber(maximumStepRatio);
    if (!scheme || !mesh?.defined || !targets.length
      || targets.some(item => !(item.targetRatio > 0))
      || targets.some((item, index) => index > 0 && item.targetRatio >= targets[index - 1].targetRatio)) {
      return { defined: false, mesh, gears: [], automaticMesh,
        reason: "Для цілих зубів потрібні схема, пара постійного зачеплення та спадний додатний ряд передач." };
    }
    const direct = item => scheme.hasDirectGear && Math.abs(item.targetRatio - 1) < 1e-9;
    const withMesh = drivingTeeth => ({ ...adoptConstantMesh({ basis: "project-input",
      meshRatio: mesh.meshRatio, drivingTeeth }), basis: mesh.basis,
      method: automaticMesh ? "feasible-integer-selection" : mesh.method,
      automaticSelection: automaticMesh,
      startingDrivingTeeth: mesh.startingDrivingTeeth ?? mesh.drivingTeeth,
      sourceRefs: automaticMesh ? [...SOURCE_REFS, "source.project-derivation"] : mesh.sourceRefs });
    function candidatesFor(selectedMesh, item, index) {
      const maximumRatio = maximumGearRatios?.[index] ?? Infinity;
      if (direct(item) && maximumRatio < 1 - 1e-10) return [];
      if (direct(item)) return [{ ...item, ratio: 1, actualRatio: 1, deviation: 0,
        direct: true, drivingTeeth: null, drivenTeeth: null, shareFactor: false }];
      const factor = scheme.pairsPerGear === 2 ? selectedMesh.actualMeshRatio : 1;
      const lowerRatio = item.targetRatio * (index === 0 ? 1 : 1 - limit);
      const upperRatio = Math.min(maximumRatio, item.targetRatio * (index === targets.length - 1 && !cruiseGearCheck ? 1 : 1 + limit));
      const firstTooth = Math.max(minimum,
        Math.ceil(factor * selectedMesh.teethSum / (upperRatio + factor) - 1e-10));
      const lastTooth = Math.min(selectedMesh.teethSum - minimum,
        Math.floor(factor * selectedMesh.teethSum / (lowerRatio + factor) + 1e-10));
      const candidates = [];
      for (let driving = firstTooth; driving <= lastTooth; driving += 1) {
        const driven = selectedMesh.teethSum - driving;
        const ratio = factor * driven / driving;
        if (index === targets.length - 1 && cruiseGearCheck && !cruiseGearCheck(ratio)) continue;
        candidates.push({ ...item, ratio, actualRatio: ratio,
          drivingTeeth: driving, drivenTeeth: driven, direct: false,
          deviation: (ratio - item.targetRatio) / item.targetRatio,
          shareFactor: greatestCommonDivisor(driving, driven) > 1 });
      }
      return candidates;
    }
    function fit(selectedMesh) {
      if (selectedMesh.drivingTeeth < minimum || selectedMesh.drivenTeeth < minimum) return null;
      let paths = [];
      for (let index = 0; index < targets.length; index += 1) {
        const next = [];
        for (const candidate of candidatesFor(selectedMesh, targets[index], index)) {
          // Relative-ratio error has priority; coprimality only breaks a tie.
          const cost = candidate.deviation ** 2 + (candidate.shareFactor ? 1e-14 : 0);
          if (index === 0) next.push({ gear: candidate, cost, previous: null });
          else {
            let best = null;
            for (const previous of paths) {
              const step = previous.gear.ratio / candidate.ratio;
              if (!(step > 1 + 1e-12) || (maxStep > 1 && step > maxStep * (1 + 1e-10))) continue;
              if (!best || previous.cost < best.cost) best = previous;
            }
            if (best) next.push({ gear: candidate, cost: best.cost + cost, previous: best });
          }
        }
        if (!next.length) return null;
        paths = next;
      }
      let best = paths.reduce((chosen, path) => path.cost < chosen.cost ? path : chosen);
      const gears = [];
      while (best) { gears.unshift(best.gear); best = best.previous; }
      return gears;
    }
    let selectedMesh = withMesh(mesh.drivingTeeth);
    let gears = fit(selectedMesh);
    // The bound below follows from rounding the ideal tooth split by at most
    // one tooth. It tightens the 5% tolerance until ordering and the maximum
    // shift step are guaranteed. There is no arbitrary maximum mesh size.
    let roundingMargin = limit / 2;
    for (let index = 1; index < targets.length; index += 1) {
      const step = targets[index - 1].targetRatio / targets[index].targetRatio;
      roundingMargin = Math.min(roundingMargin, (step - 1) / (2 * (step + 1)));
      if (maxStep > 1) roundingMargin = Math.min(roundingMargin,
        (maxStep - step) / (2 * (maxStep + step)));
    }
    if (!gears && automaticMesh && roundingMargin > 1e-12) {
      const nominalMesh = mesh.meshRatio;
      const lowFactor = scheme.pairsPerGear === 2 ? nominalMesh / 2 : 1;
      const highFactor = scheme.pairsPerGear === 2 ? nominalMesh * 1.5 : 1;
      const sumBound = Math.max(...targets.filter(item => !direct(item)).map(item => {
        const target = item.targetRatio;
        const drivingBound = Math.max(minimum + 1,
          1 + (target + highFactor) / (target * roundingMargin));
        return Math.max(drivingBound * (target + lowFactor) / lowFactor,
          (minimum + 1) * (target + highFactor) / target);
      }), minimum * 2);
      const lastDriving = Math.max(mesh.drivingTeeth, minimum, Math.ceil(1 / nominalMesh),
        Math.ceil((sumBound + 0.5) / (1 + nominalMesh)) + 1);
      if (Number.isSafeInteger(lastDriving)) {
        let driving = Math.max(mesh.drivingTeeth + 1, minimum);
        while (driving <= lastDriving) {
          selectedMesh = withMesh(driving);
          gears = fit(selectedMesh);
          if (gears || driving === lastDriving) break;
          driving = Math.min(lastDriving, driving < mesh.drivingTeeth + 64
            ? driving + 1 : Math.ceil(driving * 1.25));
        }
      }
    }
    if (!gears) {
      const fallback = targets.map(item => direct(item)
        ? { ...item, ratio: 1, actualRatio: 1, deviation: 0, direct: true,
          drivingTeeth: null, drivenTeeth: null, shareFactor: false }
        : { ...item, ...teethForGear({ teethSum: mesh.teethSum,
          targetRatio: item.targetRatio,
          meshRatio: scheme.pairsPerGear === 2 ? mesh.actualMeshRatio : 1 }).recommended });
      return { defined: false, mesh, gears: fallback, automaticMesh,
        requiresMoreGears: automaticMesh && roundingMargin <= 1e-12,
        reason: automaticMesh && roundingMargin <= 1e-12
          ? "Ряд не має запасу допустимого кроку для цілих зубів; потрібна додаткова передача або інші крайні числа."
          : "Для заданої суми зубів не знайдено ряду з мінімум 17 зубами на кожній шестерні, похибкою до 5 %, допустимим кроком і крайніми нерівностями. Змініть пару постійного зачеплення." };
    }
    return { defined: true, pairsPerGear: scheme.pairsPerGear,
      mesh: selectedMesh, gears, automaticMesh,
      hasDirectGear: gears.some(item => item.direct),
      meshAdjusted: selectedMesh.drivingTeeth !== (mesh.startingDrivingTeeth ?? mesh.drivingTeeth),
      maximumActualStepRatio: gears.slice(1).reduce((maximum, item, index) =>
        Math.max(maximum, gears[index].ratio / item.ratio), 1),
      reason: "Прийнято єдиний ряд цілих зубів із перевіркою крайніх передаточних чисел і кроку; саме його використовують тяга, швидкість та деталі коробки." };
  }

  // Чи вкладається прийнятий набір у 5 %, які дозволяє методика.
  function deviationStatus(gears) {
    if (!Array.isArray(gears) || !gears.length) {
      return {
        defined: true,
        checked: false,
        reason: "Числа зубів ще не прийняті, тому відхилення нема від чого рахувати."
      };
    }
    const limit = SOURCE_RANGES.ratioDeviation;
    const worst = gears.reduce((chosen, gear) =>
      Math.abs(gear.deviation) > Math.abs(chosen.deviation) ? gear : chosen);
    const outside = gears.filter(gear => Math.abs(gear.deviation) > limit);
    return {
      defined: true,
      checked: true,
      limit,
      worst,
      outside,
      withinLimit: outside.length === 0,
      reason: outside.length === 0
        ? `Найбільше відхилення ${(worst.deviation * 100).toFixed(2)} % на `
          + `${worst.gear}-й передачі — у межах 5 %, які дозволяє методика.`
        : `Відхилення понад 5 % на передачах: ${outside.map(gear => gear.gear).join(", ")}. `
          + `Найбільше ${(worst.deviation * 100).toFixed(2)} % на ${worst.gear}-й. `
          + "Змініть число зубів первинного вала або передаточне число пари "
          + "постійного зачеплення."
    };
  }

  // Conservative screening for this uncorrected tooth model. A smaller count
  // would require a separate profile-shift/undercut calculation, not a silent
  // exception based on the helix-angle input alone.
  function toothCountDiagnostics(gears) {
    const minimum = SOURCE_RANGES.drivingTeeth.min;
    return (gears || [])
      .filter(gear => [gear?.drivingTeeth, gear?.drivenTeeth].some(count =>
        Number.isFinite(count) && count < minimum))
      .map(gear => ({
        code: "GEARBOX_PINION_BELOW_MINIMUM",
        severity: "error",
        message: `Пара ${gear.gear ? `${gear.gear}-ї передачі ` : ""}`
          + `має ${gear.drivingTeeth}/${gear.drivenTeeth ?? "—"} зубів; мінімум цієї моделі — ${minimum} на кожній шестерні. `
          + "Потрібна більша сума зубів або окремий розрахунок корекції профілю та підрізання.",
        details: { node: "calc.gearbox-teeth", drivingTeeth: gear.drivingTeeth,
          drivenTeeth: gear.drivenTeeth }
      }));
  }

  function deviationDiagnostics(status) {
    if (!status?.checked || status.withinLimit) return [];
    return [{
      code: "GEARBOX_TEETH_RATIO_DEVIATION",
      severity: "error",
      message: status.reason,
      details: { node: "calc.gearbox-teeth" }
    }];
  }

  // Крок документа: таблиця зубів. Він один на всі передачі — так само, як
  // ряд передаточних чисел у розділі 4 один на весь ряд: перелічувати кожну
  // передачу окремим кроком означало б, що їх кількість відома наперед.
  function buildTeethStep({ topology: scheme, mesh, gears, texNumber, adopted = null, adoptionReason = null }) {
    const list = gears
      .map(gear => gear.direct
        ? `u_{\\mathrm{к}${gear.gear}}&=1\\quad\\text{(пряме з'єднання валів)}`
        : `u_{\\mathrm{к}${gear.gear}}&=`
          + (scheme.pairsPerGear === 2
            ? `\\frac{${mesh.drivenTeeth}}{${mesh.drivingTeeth}}\\cdot` : "")
          + `\\frac{${gear.drivenTeeth}}{${gear.drivingTeeth}}=${texNumber(gear.actualRatio, 5)}`)
      .join("\\\\ ");
    return {
      id: "gearbox-teeth",
      title: adopted === false ? "Кандидати чисел зубів коробки передач (ще не прийняті)"
        : "Числа зубів шестерень коробки передач",
      purpose: "Розподілити сталу суму зубів між парами так, щоб дійсні "
        + "передаточні числа не відійшли від розрахункових більш ніж на 5 %.",
      output: {
        id: "value.gearbox-teeth",
        symbol: "Z_{ij}",
        label: "Gearbox tooth counts",
        valueType: "list",
        canonicalUnit: null
      },
      expression: scheme.pairsPerGear === 2
        ? "u_ki = (Z_2 / Z_1) * (Z_iv / Z_ip)"
        : "u_ki = Z_2i / Z_1i",
      dependencies: [
        "value.gearbox-ladder",
        "decision.gearbox-topology",
        "decision.gearbox-constant-mesh"
      ],
      equationNumber: scheme.pairsPerGear === 2 ? "10.2" : "10.3",
      formulaTex: scheme.pairsPerGear === 2
        ? "u_{\\mathrm{к}i}=\\dfrac{Z_2}{Z_1}\\cdot\\dfrac{Z_{i\\mathrm{в}}}{Z_{i\\mathrm{п}}}"
        : "u_{\\mathrm{к}i}=\\dfrac{Z_{2i}}{Z_{1i}}",
      substitutionTex: `\\begin{aligned}\\Sigma Z&=${texNumber(mesh.teethSum, 0)}\\\\ ${list}\\end{aligned}`,
      result: {
        value: gears.map(gear => ({
          gear: gear.gear,
          drivingTeeth: gear.drivingTeeth,
          drivenTeeth: gear.drivenTeeth,
          requiredRatio: gear.targetRatio,
          ratio: gear.actualRatio,
          deviation: gear.deviation
        })),
        canonicalUnit: null,
        displayUnit: ""
      },
      method: "sourced-formula",
      sourceRefs: mesh.automaticSelection ? [...SOURCE_REFS, "source.project-derivation"] : SOURCE_REFS,
      readerNotes: [
        `Сума зубів у кожній парі однакова: ${texNumber(mesh.teethSum, 0)}. `
        + "Це умова паралельності валів за однакових модуля й кута нахилу зубів.",
        scheme.pairsPerGear === 2
          ? "Момент іде через дві пари: постійного зачеплення й самої передачі. "
            + "Пряма передача шестерень не використовує зовсім."
          : "Момент іде через одну пару, тому передаточне число — це просто "
            + "відношення зубів."
      ],
      assumptions: [
        "Однакові модуль і кут нахилу зубів у всіх парах."
      ],
      limitations: [
        ...(adopted === false ? [adoptionReason || "Це попередні кандидати зубчастих пар; їхні дійсні відношення не прийняті у тяговому шляху. Конструкцію ще не завершено."] : []),
        "Зубів не буває дробових, тому розрахункове передаточне число точно не "
        + "відтворюється: методика дозволяє відхилення до 5 %.",
        ...(gears.some(gear => gear.shareFactor)
          ? ["Є пари зі спільним дільником. Пораду уникати кратності застосовано після вимог до цілих зубів, крайніх передач і кроку ряду."]
          : [])
      ]
    };
  }

  // Рішення розділу 10.1 у канонічній формі.
  function decisionsFor({ topology: scheme, mesh, gears, adopted = null, adoptionReason = null }) {
    const decisions = [];
    if (scheme) {
      decisions.push({
        id: "decision.gearbox-topology",
        kind: "Decision",
        choiceRef: null,
        symbol: null,
        adoptedValue: scheme.id,
        canonicalUnit: null,
        method: "project-input",
        selectedReferenceId: null,
        rationale: `${scheme.label}: момент іде через `
          + `${scheme.pairsPerGear === 2 ? "дві пари шестерень" : "одну пару шестерень"}, `
          + "і від цього залежить сама будова розрахунку зубів.",
        sourceRefs: ["source.project-input"],
        limitations: scheme.hasDirectGear
          ? ["Пряма передача шестерень не використовує, тому чисел зубів не має."]
          : [],
        manuallyOverridden: true
      });
    }
    if (mesh?.defined) {
      decisions.push({
        id: "decision.gearbox-constant-mesh",
        kind: "Decision",
        choiceRef: null,
        symbol: "u_{\\mathrm{п}}",
        adoptedValue: mesh.actualMeshRatio,
        canonicalUnit: null,
        method: mesh.method,
        selectedReferenceId: null,
        recommendedValue: (SOURCE_RANGES.constantMeshRatio.min
          + SOURCE_RANGES.constantMeshRatio.max) / 2,
        recommendedSourceRefs: SOURCE_REFS,
        rationale: `Z₁ = ${mesh.drivingTeeth}, Z₂ = ${mesh.drivenTeeth}, тому дійсне `
          + `u_п = ${mesh.actualMeshRatio.toFixed(3)}. Обидві книжки радять `
          + `u_п = ${SOURCE_RANGES.constantMeshRatio.min}…`
          + `${SOURCE_RANGES.constantMeshRatio.max} і Z₁ = `
          + `${SOURCE_RANGES.drivingTeeth.min}…${SOURCE_RANGES.drivingTeeth.max}.`
          + (mesh.automaticSelection ? " Автоматичний підбір може збільшити початкову суму зубів: це проєктний вибір для здійсненності ряду, не новий нормативний діапазон." : ""),
        sourceRefs: mesh.automaticSelection ? [...SOURCE_REFS, "source.project-derivation"]
          : mesh.method === "project-input" ? ["source.project-input"] : SOURCE_REFS,
        limitations: [
          ...(mesh.withinRange.meshRatio ? [] : ["u_п лежить поза рекомендацією книжок."]),
          ...(mesh.withinRange.drivingTeeth ? [] : ["Z₁ лежить поза рекомендацією книжок."]),
          "Z₂ округлено до цілого, тому дійсне u_п відрізняється від прийнятого."
        ],
        manuallyOverridden: mesh.method === "project-input"
      });
    }
    if (Array.isArray(gears) && gears.length) {
      decisions.push({
        id: "decision.gearbox-teeth",
        kind: "Decision",
        choiceRef: null,
        symbol: "Z_{ij}",
        adoptedValue: adopted === false ? null : gears.map(gear =>
          `${gear.gear}: ${gear.drivingTeeth}/${gear.drivenTeeth}`).join("; "),
        recommendedValue: adopted === false ? gears.map(gear =>
          `${gear.gear}: ${gear.drivingTeeth}/${gear.drivenTeeth}`).join("; ") : null,
        canonicalUnit: null,
        method: adopted === false ? "candidate-not-adopted" : adopted === true
          ? "integer-gearset-adopted" : "rounded-from-calculation",
        selectedReferenceId: null,
        rationale: adopted === false ? adoptionReason || "Попередні кандидати ще не прийняті у тяговому шляху."
          : "Сталу суму зубів розподілено між парами так, щоб дійсні "
            + "передаточні числа виконували вимоги до першої, вищої передач і перемикань.",
        sourceRefs: adopted === true ? [...SOURCE_REFS, "source.project-derivation"] : SOURCE_REFS,
        limitations: [...(adopted === false ? ["Конструкцію редуктора ще не завершено; тяга та швидкість використовують оголошену редукцію."] : []),
          "Зубів не буває дробових: дійсні передаточні числа "
          + "відрізняються від розрахункових у межах, які дозволяє методика."],
        manuallyOverridden: false
      });
    }
    return decisions;
  }

  return Object.freeze({
    buildTeethStep,
    decisionsFor,
    TOPOLOGIES,
    SOURCE_RANGES,
    SOURCE_REFS,
    topology,
    adoptConstantMesh,
    teethForGear,
    selectFeasibleGearset,
    deviationStatus,
    deviationDiagnostics,
    toothCountDiagnostics
  });
}
