"use strict";

// Preliminary road-vehicle powertrain design. No DOM, IO, or hidden mutations.
// Defaults are declared design assumptions, NOT Euro-emissions certification or
// manufacturer data. P = T * omega / 1000 everywhere. All ratios are reductions.
export function createPowertrainDesign({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;

  const CLASS_DEFAULTS = Object.freeze({
    M1: Object.freeze({ cruiseKmh:120, workingGears:5, people:5, luggageKg:50, cargoKg:0, wheelbaseM:2.7, tyre:"205/55R16 94V", speedKmh: 160, dieselRpm: 3800, petrolRpm: 5500, idleRpm: 800, creepKmh: 7, minGears: 6, maxStep: 1.65, topRatio: 0.75, trackM: 1.55, centreHeightM: 0.55, startGrade: 0.25, gearboxDrivingTeeth: 20, gearboxMeshRatio: 2.15, steeringScrubM: 0.04 }),
    M2: Object.freeze({ cruiseKmh:100, workingGears:5, people:16, luggageKg:150, cargoKg:0, wheelbaseM:3.66, tyre:"225/75R16C 121/120R", speedKmh: 120, dieselRpm: 3500, petrolRpm: 5000, idleRpm: 780, creepKmh: 5, minGears: 6, maxStep: 1.65, topRatio: 0.75, trackM: 1.75, centreHeightM: 0.90, startGrade: 0.20, gearboxDrivingTeeth: 20, gearboxMeshRatio: 2.15, steeringScrubM: 0.05 }),
    M3: Object.freeze({ cruiseKmh:85, workingGears:5, people:55, luggageKg:400, cargoKg:0, wheelbaseM:5.8, tyre:"295/80R22.5 152/148M", speedKmh: 100, dieselRpm: 2200, petrolRpm: 4000, idleRpm: 650, creepKmh: 5, minGears: 6, maxStep: 1.60, topRatio: 0.78, trackM: 2.05, centreHeightM: 1.10, startGrade: 0.18, gearboxDrivingTeeth: 23, gearboxMeshRatio: 2.5, steeringScrubM: 0.05 }),
    N1: Object.freeze({ cruiseKmh:110, workingGears:5, people:2, luggageKg:0, cargoKg:750, wheelbaseM:3.2, tyre:"215/75R16C 116/114R", speedKmh: 130, dieselRpm: 3500, petrolRpm: 5000, idleRpm: 780, creepKmh: 5, minGears: 6, maxStep: 1.65, topRatio: 0.75, trackM: 1.70, centreHeightM: 0.80, startGrade: 0.25, gearboxDrivingTeeth: 20, gearboxMeshRatio: 2.15, steeringScrubM: 0.05 }),
    N2: Object.freeze({ cruiseKmh:85, workingGears:5, people:2, luggageKg:0, cargoKg:3500, wheelbaseM:4.3, tyre:"245/70R19.5 141/140M", speedKmh: 100, dieselRpm: 2400, petrolRpm: 4200, idleRpm: 700, creepKmh: 5, minGears: 6, maxStep: 1.60, topRatio: 0.78, trackM: 1.85, centreHeightM: 1.00, startGrade: 0.25, gearboxDrivingTeeth: 23, gearboxMeshRatio: 2.5, steeringScrubM: 0.05 }),
    N3: Object.freeze({ cruiseKmh:80, workingGears:11, people:2, luggageKg:0, cargoKg:14000, wheelbaseM:4.2, tyre:"315/80R22.5 156/150L", speedKmh: 90, dieselRpm: 2100, petrolRpm: 4000, idleRpm: 600, creepKmh: 4, minGears: 12, maxStep: 1.45, topRatio: 0.78, trackM: 2.05, centreHeightM: 1.15, startGrade: 0.25, gearboxDrivingTeeth: 23, gearboxMeshRatio: 2.5, steeringScrubM: 0.05 })
  });
  const engineFormulaTex = String.raw`\begin{aligned}T_m&=1000P_Nk_T/\omega_N,\quad\omega_1=b_1\omega_N,\quad\omega_2=b_2\omega_N\\[3pt]P_2&=T_m\omega_2/1000,\quad p=\frac{k_T(1-b_2)}{1-k_Tb_2}\\[3pt]x&=\frac{\omega-\omega_x}{\omega_1-\omega_x},\quad y=\frac{\omega-\omega_2}{\omega_N-\omega_2}\\[3pt]T&=T_m[c+(1-c)(3x^2-2x^3)]\quad(\omega_x\le\omega<\omega_1)\\[3pt]T&=T_m\quad(\omega_1\le\omega\le\omega_2)\\[3pt]T&=\frac{1000[P_N-(P_N-P_2)(1-y)^p]}{\omega}\quad(\omega_2<\omega\le\omega_N)\\[3pt]P&=T\omega/1000\end{aligned}`;
  function number(value) {
    return (typeof value === "number" || (typeof value === "string" && value.trim()))
      && Number.isFinite(Number(value)) ? Number(value) : NaN;
  }
  const positive = value => number(value) > 0;
  const rad = rpm => rpm * Math.PI / 30;
  function defaults(category) { return CLASS_DEFAULTS[category] || null; }

  // A C1-continuous full-load envelope: torque rises smoothly, has a declared
  // plateau, then decreases as power approaches its rated maximum. The low-speed
  // torque fraction is an explicit approximation, not an idle-fuel model.
  function engineEnvelope({ maxPowerKw, ratedAngularSpeed, idleAngularSpeed,
    supplySystemId = "diesel-turbo", supplySystemCovered = true, pointCount = 161 }) {
    if (supplySystemCovered === false) return { defined: false,
      reason: "Для цього палива попередню форму характеристики не прийнято. Задайте виміряну криву або явні паспортні/проєктні точки." };
    const P = number(maxPowerKw), rated = number(ratedAngularSpeed);
    const idle = number(idleAngularSpeed);
    if (!(P > 0 && rated > idle && idle > 0)) return { defined: false, reason: "Потрібні додатні потужність, холостий хід і номінальна частота; n_N > n_x." };
    const diesel = /^diesel/.test(supplySystemId);
    const turbo = diesel || /turbo/.test(supplySystemId);
    const factor = diesel ? 1.40 : turbo ? 1.50 : 1.15;
    const bandStart = diesel ? 0.43 : turbo ? 0.32 : 0.65;
    const bandEnd = diesel ? 0.62 : turbo ? 0.58 : 0.72;
    const w1 = rated * bandStart, w2 = rated * bandEnd;
    if (!(idle < w1)) return { defined: false, reason: "Холостий хід має бути нижчим за початок робочої полиці моменту." };
    const maxTorque = 1000 * P / rated * factor;
    const lowFraction = diesel ? 0.45 : 0.40;
    const startPower = maxTorque * w2 / 1000;
    const exponent = factor * (1 - bandEnd) / (1 - factor * bandEnd);
    function at(w) {
      if (!(w >= idle && w <= rated)) return null;
      let torque;
      if (w < w1) {
        const x = (w - idle) / (w1 - idle);
        torque = maxTorque * (lowFraction + (1 - lowFraction) * x * x * (3 - 2 * x));
      } else if (w <= w2) torque = maxTorque;
      else {
        const x = (w - w2) / (rated - w2);
        const power = P - (P - startPower) * Math.pow(1 - x, exponent);
        torque = 1000 * power / w;
      }
      return { angularSpeed: w, ratio: w / rated, torqueNm: torque, powerKw: torque * w / 1000 };
    }
    const count = Math.min(401, Math.max(25, Math.round(number(pointCount) || 161)));
    const anchors = [idle, w1, w2, rated];
    const speeds = new Set(anchors);
    for (let i = 0; i < count; i++) speeds.add(idle + (rated - idle) * i / (count - 1));
    const points = [...speeds].sort((a, b) => a - b).map(at);
    const supportPoints = [...new Set([...anchors, ...Array.from({ length: 9 }, (_, i) => idle + (rated - idle) * i / 8)])].sort((a, b) => a - b).map(at);
    return { defined: true, kind: "engine-modern", points, supportPoints,
      minimumAngularSpeed: idle, ratedAngularSpeed: rated, maximumAngularSpeed: rated,
      plateauFromAngularSpeed: w1, plateauToAngularSpeed: w2,
      peakPower: at(rated), peakTorque: at(w1), model: "modern-C1-design-envelope",
      parameters: { factor, bandStart, bandEnd, lowFraction, exponent },
      sourceRefs: ["source.project-derivation"],
      limitations: ["Попередня гладка характеристика класу: форма, полиця й момент на малих обертах є явними припущеннями проєкту, а не виміряною картою конкретного двигуна.",
        "Euro 5/6 позначає бажаний рівень викидів. За силовою характеристикою відповідність нормам викидів не встановлюється."] };
  }

  function ratioChain({ gearboxRatio, finalDriveRatio, transferRatio = 1, hubRatio = 1 }) {
    const values = [gearboxRatio, finalDriveRatio, transferRatio, hubRatio].map(number);
    if (!values.every(v => v > 0)) return { defined: false, reason: "Кожне передаточне число має бути додатним." };
    return { defined: true, gearboxRatio: values[0], finalDriveRatio: values[1], transferRatio: values[2], hubRatio: values[3], totalRatio: values.reduce((a, b) => a * b, 1) };
  }
  function vehicleSpeedKmh({ rpm, dynamicRadiusM, totalRatio }) {
    return number(rpm) >= 0 && [dynamicRadiusM, totalRatio].every(positive)
      ? 3.6 * rad(number(rpm)) * number(dynamicRadiusM) / number(totalRatio) : NaN;
  }
  function engineSpeedRpm({ speedKmh, dynamicRadiusM, totalRatio }) {
    return number(speedKmh) >= 0 && [dynamicRadiusM, totalRatio].every(positive)
      ? number(speedKmh) / 3.6 * number(totalRatio) / number(dynamicRadiusM) * 30 / Math.PI : NaN;
  }

  // Ordinary automatic road gearing respects the adhesion endpoint before
  // generating the row. Explicit crawl/manual designs remain separate cases.
  function designFirstRatio({ dynamicRadiusM, idleAngularSpeed, creepSpeedKmh,
    roadRequiredRatio, launchTorqueNm, massKg, startGrade, rollingResistance,
    efficiency, minimumAcceleration = 0.25, mode = "locked-creep", adoptedTotalRatio = null, launchAngularSpeed = idleAngularSpeed, peakTorqueNm = null, adhesionLimit = null }) {
    const r = number(dynamicRadiusM), idle = number(idleAngularSpeed), creep = number(creepSpeedKmh);
    const road = number(roadRequiredRatio), torque = number(launchTorqueNm), m = number(massKg);
    const grade = number(startGrade), f = number(rollingResistance), eta = number(efficiency);
    const acceleration = number(minimumAcceleration);
    if (![r,idle,creep,road,torque,m,grade,f,eta,acceleration,number(launchAngularSpeed)].every(Number.isFinite)
      || !(r > 0 && idle > 0 && creep > 0 && road > 0 && torque > 0 && m > 0
      && grade >= 0 && f >= 0 && eta > 0 && eta <= 1 && acceleration > 0 && number(launchAngularSpeed) >= idle)) {
      return { defined: false, reason: "Не визначено вимоги до повзучого ходу, старту, момент, масу, радіус або ККД." };
    }
    const kinematic = idle * r / (creep / 3.6);
    const alpha = Math.atan(grade);
    const requiredLaunchForceN = m * (9.81 * (Math.sin(alpha) + f * Math.cos(alpha)) + acceleration);
    const sizingTorque = mode === "balanced-launch" ? number(peakTorqueNm) : torque;
    if (!(sizingTorque > 0)) return { defined:false, reason:"Для рушання на ухилі потрібен максимальний момент двигуна." };
    const launch = requiredLaunchForceN * r / (sizingTorque * eta);
    const idleLaunchRequiredRatio = m * (9.81*f + acceleration) * r / (torque * eta);
    if (!["balanced-launch", "clutch-slip", "locked-creep"].includes(mode)) return {defined:false, reason:"Не визначено режим першої передачі."};
    const requirement = mode === "locked-creep" ? Math.max(road, kinematic, launch) : Math.max(road, launch, ...(mode === "balanced-launch" ? [idleLaunchRequiredRatio] : []));
    const adopted = number(adoptedTotalRatio);
    if (adoptedTotalRatio !== null && adoptedTotalRatio !== "" && !(Number.isFinite(adopted) && adopted > 0)) return {defined:false, reason:"Власна перша редукція має бути додатною."};
    const adhesionConstrained = !(adopted > 0) && mode !== "locked-creep" && number(adhesionLimit) > 0;
    const value = adopted > 0 ? adopted : adhesionConstrained ? Math.min(requirement, number(adhesionLimit)) : requirement;
    return { defined: true, value, mode, adoptedManually: adopted > 0, requiredValue: requirement,
      adhesionConstrained, adhesionLimited: adhesionConstrained && value < requirement,
      // Project allowance for tooth rounding, not a change in tyre adhesion.
      firstGearAdhesionAllowance: adhesionConstrained ? 1.05 : null,
      launchAngularSpeed: number(launchAngularSpeed), satisfiesRequirement: value >= requirement*(1-1e-10),
      roadLaunchRequiredRatio: Math.max(road,launch), lockedCreepRequiredRatio: Math.max(road,kinematic,launch),
      roadRequiredRatio: road, lowSpeedRequiredRatio: kinematic,
      launchRequiredRatio: launch, requiredLaunchForceN, creepSpeedKmh: creep,
      minimumAcceleration: acceleration, launchTorqueNm: sizingTorque, idleLaunchTorqueNm: torque, idleLaunchRequiredRatio, idleAngularSpeed: idle,
      massKg: m, startGrade: grade, rollingResistance: f, dynamicRadiusM: r,
      efficiency: eta,
      limitedBy: adhesionConstrained && value < requirement ? "adhesion" : value === kinematic ? "low-speed" : value === launch ? "launch" : "road-resistance" };
  }
  function designLadder({ firstGearRatio, topGearRatio, maximumAngularSpeed,
    minimumLoadedAngularSpeed, maxStepRatio, minimumGearCount, gearCount = null, workingTopRatio = null }) {
    if (workingTopRatio > topGearRatio) {
      const working = designLadder({ firstGearRatio, topGearRatio: workingTopRatio, maximumAngularSpeed,
        minimumLoadedAngularSpeed, maxStepRatio, minimumGearCount,
        gearCount: gearCount === null || gearCount === "" ? null : Number(gearCount) - 1 });
      if (!working.defined) return working;
      const step = workingTopRatio / topGearRatio;
      const valid = working.designValid && step <= working.maximumStepRatio * (1 + 1e-9);
      return { ...working, designValid: valid, speedBandCovered: valid,
        workingGearCount: working.gearCount, workingTopRatio, economyGear: true,
        minimumRequiredCount: working.minimumRequiredCount + 1,
        gearCount: working.gearCount + 1, topGearRatio, designTopGearRatio: topGearRatio, topGearIsDirect: false,
        gears: [...working.gears, { gear: working.gearCount + 1, ratio: topGearRatio }],
        afterShiftAngularSpeed: maximumAngularSpeed / Math.max(1 / working.progressionDenominator, step),
        limitations: [...working.limitations, ...(valid ? [] : ["Крок до крейсерської передачі перевищує робочу смугу."])] };
    }
    const first = number(firstGearRatio), top = number(topGearRatio);
    const hi = number(maximumAngularSpeed), lo = number(minimumLoadedAngularSpeed);
    const spacing = Math.min(number(maxStepRatio), hi / lo);
    if (!(first > top && top > 0 && hi > lo && lo > 0 && spacing > 1)) return { defined: false, reason: "Неможливо побудувати ряд: перевірте крайні передачі та робочу смугу двигуна." };
    const exact = 1 + Math.log(first / top) / Math.log(spacing);
    const minimum = Math.max(2, Math.ceil(exact - 1e-10), Math.ceil(number(minimumGearCount) || 2));
    const chosen = gearCount === null || gearCount === "" ? minimum : number(gearCount);
    if (!(Number.isInteger(chosen) && chosen >= 2 && chosen <= 32)) return { defined: false, reason: "Кількість передач має бути цілою від 2 до 32." };
    const q = Math.pow(top / first, 1 / (chosen - 1));
    const gears = Array.from({ length: chosen }, (_, i) => ({ gear: i + 1,
      ratio: i === 0 ? first : i === chosen - 1 ? top : first * Math.pow(q, i) }));
    const valid = 1 / q <= spacing * (1 + 1e-9);
    return { defined: true, designValid: valid, speedBandCovered: valid, method: "endpoint-and-shift-coverage",
      progressionDenominator: q, exactCount: exact, minimumRequiredCount: minimum,
      gearCount: chosen, countIsAdopted: gearCount !== null && gearCount !== "",
      topGearIsDirect: Math.abs(top - 1) < 1e-9, gears, firstGearRatio: first, topGearRatio: top,
      designFirstGearRatio: first, designTopGearRatio: top,
      classMaximumStepRatio: number(maxStepRatio),
      classMinimumGearCount: Math.max(2, Math.ceil(number(minimumGearCount) || 2)),
      maximumStepRatio: spacing, afterShiftAngularSpeed: hi * q,
      minimumLoadedAngularSpeed: lo, maximumAngularSpeed: hi,
      limitations: valid ? [] : ["Прийнятих передач недостатньо для допустимого кроку / робочих обертів після перемикання. Результат не є прийнятним проєктом."] };
  }
  function inspectGearing({ ladder, finalDriveRatio, requiredFinalDriveRatio = finalDriveRatio,
    requiredFirstTotalRatio = null, requiredTopTotalRatio = null,
    transferRatio = 1, hubRatio = 1, dynamicRadiusM, idleAngularSpeed,
    minimumLoadedAngularSpeed = ladder?.minimumLoadedAngularSpeed ?? idleAngularSpeed,
    maximumAngularSpeed, targetSpeedKmh, creepSpeedKmh, curvePoints = null,
    efficiency = null, requiredForceAtSpeed = null, adhesionForceN = null,
    requiredLaunchForceN = null, requireLockedCreep = true }) {
    if (!ladder?.defined) return { defined: false, reason: ladder?.reason || "Ряд передач не визначено." };
    const r = number(dynamicRadiusM), idle = number(idleAngularSpeed), max = number(maximumAngularSpeed);
    const loaded = number(minimumLoadedAngularSpeed), target = number(targetSpeedKmh), creep = number(creepSpeedKmh);
    if (!(r > 0 && max > idle && loaded >= idle && loaded < max && idle > 0
      && (targetSpeedKmh == null || target > 0) && creep > 0 && Array.isArray(ladder.gears) && ladder.gears.length >= 2)) {
      return { defined: false, reason: "Не визначено радіус, робочу смугу, ряд передач або цільові швидкості." };
    }
    const rows = ladder.gears.map((gear, index) => {
      const chain = ratioChain({ gearboxRatio: gear.ratio, finalDriveRatio, transferRatio, hubRatio });
      // Final-drive teeth are adopted before gearbox targets are generated.
      // Compare the target/actual gearbox rows with the SAME downstream chain;
      // independently interpolating first and top total bounds mixes two stages.
      const requiredGearboxRatio = ladder.designRequiredGears?.[index]?.ratio ?? gear.targetRatio ?? gear.ratio;
      const requiredTotal = ratioChain({ gearboxRatio: requiredGearboxRatio,
        finalDriveRatio, transferRatio, hubRatio }).totalRatio;
      return { gear: gear.gear, ...chain, transferCaseRatio: chain.transferRatio,
        wheelHubRatio: chain.hubRatio, finalDriveRequiredRatio: number(requiredFinalDriveRatio),
        finalDriveActualRatio: chain.finalDriveRatio, requiredTotalRatio: requiredTotal,
        requiredGearboxRatio,
        drivingTeeth: gear.drivingTeeth ?? null, drivenTeeth: gear.drivenTeeth ?? null, direct: gear.direct === true,
        idleSpeedKmh: 3.6 * idle * r / chain.totalRatio,
        minimumSpeedKmh: 3.6 * (ladder.economyGear && index===ladder.gears.length-1 ? ladder.economyMinimumAngularSpeed ?? loaded : loaded) * r / chain.totalRatio,
        maximumSpeedKmh: 3.6 * max * r / chain.totalRatio,
        // Legacy aliases remain the fully engaged idle-to-limit interval.
        minSpeedKmh: 3.6 * idle * r / chain.totalRatio,
        maxSpeedKmh: 3.6 * max * r / chain.totalRatio };
    });
    if (rows.some(row => !row.defined)) return { defined: false, reason: "Неповний ланцюг передаточних чисел." };
    const ordered = rows.every((row, i) => i === 0 || row.totalRatio < rows[i - 1].totalRatio);
    const overlap = rows.every((row, i) => i === 0 || row.minimumSpeedKmh <= rows[i - 1].maximumSpeedKmh * (1 + 1e-9));
    const eta = number(efficiency), adhesion = number(adhesionForceN);
    const points = Array.isArray(curvePoints) ? [...curvePoints].sort((a, b) => a.angularSpeed - b.angularSpeed) : [];
    const forceCheckAvailable = points.length >= 2 && points.every(p => number(p.angularSpeed) > 0 && number(p.torqueNm) >= 0)
      && eta > 0 && eta <= 1 && typeof requiredForceAtSpeed === "function";
    function wheelForceAt(speedMs, row) {
      const w = speedMs * row.totalRatio / r;
      if (w < points[0].angularSpeed - 1e-9 || w > points.at(-1).angularSpeed + 1e-9) return null;
      let torque = points.at(-1).torqueNm;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        if (w <= b.angularSpeed) {
          const span = b.angularSpeed - a.angularSpeed;
          torque = span > 0 ? a.torqueNm + (b.torqueNm - a.torqueNm) * (w - a.angularSpeed) / span : b.torqueNm;
          break;
        }
      }
      const force = torque * row.totalRatio * eta / r;
      return adhesion > 0 ? Math.min(force, adhesion) : force;
    }
    const shifts = rows.slice(1).map((row, i) => {
      const previous = rows[i];
      const from = Math.max(previous.minimumSpeedKmh, row.minimumSpeedKmh) / 3.6;
      const to = Math.min(previous.maximumSpeedKmh, row.maximumSpeedKmh) / 3.6;
      const shift = { fromGear: previous.gear, toGear: row.gear,
        overlap: to >= from - 1e-9, overlapFromSpeedKmh: from * 3.6, overlapToSpeedKmh: to * 3.6,
        afterShiftRpmAtLimit: max * row.totalRatio / previous.totalRatio * 30 / Math.PI,
        forceSatisfied: null, feasibleShiftSpeedKmh: null };
      if (forceCheckAvailable && shift.overlap) {
        const samples = new Set([from, to]);
        for (let j = 1; j < 64; j++) samples.add(from + (to - from) * j / 64);
        for (const p of points) {
          const speed = p.angularSpeed * r / row.totalRatio;
          if (speed >= from && speed <= to) samples.add(speed);
        }
        let best = null;
        for (const speed of [...samples].sort((a, b) => b - a)) {
          const required = number(requiredForceAtSpeed(speed));
          const before = wheelForceAt(speed, previous), after = wheelForceAt(speed, row);
          if (!Number.isFinite(required) || before === null || after === null) continue;
          const margin = Math.min(before, after) - required;
          if (!best || margin > best.forceMarginN) best = { forceMarginN: margin,
            availableWheelForceN: after, requiredForceN: required, speed };
          if (margin > 1e-8) {
            best = { forceMarginN: margin, availableWheelForceN: after, requiredForceN: required, speed };
            shift.feasibleShiftSpeedKmh = speed * 3.6;
            break;
          }
        }
        shift.forceSatisfied = best ? best.forceMarginN > 1e-8 : null;
        if (best) Object.assign(shift, { availableWheelForceN: best.availableWheelForceN,
          requiredForceN: best.requiredForceN, forceMarginN: best.forceMarginN,
          forceCheckSpeedKmh: best.speed * 3.6 });
      }
      return shift;
    });
    // A cruising overdrive need not deliver maximum speed: inspect every gear.
    const targetRows = rows.filter(row => target >= row.minimumSpeedKmh * (1-1e-9)
      && target <= row.maximumSpeedKmh * (1+1e-9));
    const topRow = forceCheckAvailable && targetRows.length
      ? targetRows.reduce((best, row) => !best || (wheelForceAt(target/3.6, row) ?? -Infinity)
        > (wheelForceAt(target/3.6, best) ?? -Infinity) ? row : best, null) : rows.at(-1);
    const targetSpecified = target > 0;
    const topWheelForceN = forceCheckAvailable && targetSpecified ? wheelForceAt(target / 3.6, topRow) : null;
    const topRequiredForceN = forceCheckAvailable && targetSpecified ? number(requiredForceAtSpeed(target / 3.6)) : null;
    const result = { defined: true, rows, shifts, overlap, ordered,
      gearboxTeethAdopted: ladder.integerSelection?.defined === true,
      constantMesh: ladder.integerSelection?.mesh ?? null,
      formulaTex: String.raw`u_{\Sigma,k}=u_{\mathrm{gear},k}\,u_{\mathrm{transfer}}\,u_0\,u_{\mathrm{hub}}`,
      requiredFinalDriveRatio: number(requiredFinalDriveRatio), actualFinalDriveRatio: number(finalDriveRatio),
      requiredFirstTotalRatio: number(requiredFirstTotalRatio), requiredTopTotalRatio: number(requiredTopTotalRatio),
      requiredTotalBasis: "required-gearbox-with-adopted-downstream",
      requiredTotalExplanation: "Повна редукція до округлення КПП = потрібне число КПП × уже прийнята головна передача × активна роздавальна × колісна передача. Потрібне число головної передачі та початкова верхня межа повної редукції належать попередньому етапу й показані окремо.",
      targetSpeedGear: topRow.gear,
      targetSpeedKmh: targetSpecified ? target : null,
      idleRpm: idle * 30 / Math.PI, minimumLoadedRpm: loaded * 30 / Math.PI, maximumRpm: max * 30 / Math.PI,
      requireLockedCreep, lockedCreepSatisfied: rows[0].idleSpeedKmh <= creep * (1 + 1e-9),
      creepSatisfied: rows[0].idleSpeedKmh <= creep * (1 + 1e-9),
      topSpeedKinematicallyPossible: targetSpecified ? topRow.maximumSpeedKmh >= target * (1 - 1e-9) : null,
      topSpeedWithinLoadedRange: targetSpecified ? target >= topRow.minimumSpeedKmh * (1 - 1e-9)
        && target <= topRow.maximumSpeedKmh * (1 + 1e-9) : null,
      topEngineRpm: targetSpecified ? engineSpeedRpm({ speedKmh: target, dynamicRadiusM: r, totalRatio: topRow.totalRatio }) : null,
      forceCheckAvailable, shiftForceSatisfied: forceCheckAvailable ? shifts.every(shift => shift.forceSatisfied === true) : null,
      topSpeedForceSatisfied: forceCheckAvailable && targetSpecified ? topWheelForceN !== null && Number.isFinite(topRequiredForceN)
        && topWheelForceN >= topRequiredForceN * (1 - 1e-9) : null,
      topWheelForceN, topRequiredForceN,
      launchAdhesionSatisfied: adhesion > 0 && number(requiredLaunchForceN) > 0 ? adhesion >= number(requiredLaunchForceN) : null,
      spread: rows[0].totalRatio / topRow.totalRatio };
    result.failures = [!ordered && "GEARS_NOT_ORDERED", !overlap && "LOADED_SPEED_GAP",
      requireLockedCreep && !result.creepSatisfied && "CRAWL_SPEED_TOO_HIGH", result.topSpeedKinematicallyPossible === false && "TOP_SPEED_OVERSPEED",
      result.topSpeedWithinLoadedRange === false && "TOP_SPEED_OUTSIDE_LOADED_RANGE",
      result.shiftForceSatisfied === false && "SHIFT_FORCE_INSUFFICIENT",
      result.topSpeedForceSatisfied === false && "TOP_SPEED_FORCE_INSUFFICIENT",
      result.launchAdhesionSatisfied === false && "LAUNCH_ADHESION_INSUFFICIENT",
      ladder.speedBandCovered === false && "GEAR_COUNT_INSUFFICIENT",
      ladder.integerSelection?.defined === false && "GEARBOX_TEETH_NOT_ADOPTED"].filter(Boolean);
    result.valid = result.failures.length === 0;
    result.limitations = [requireLockedCreep
      ? "Прийнято окрему вимогу до повзучого ходу без ковзання. Рушання з нуля все одно потребує зчеплення."
      : "Перша передача не прив'язана до швидкості маневру із замкненим зчепленням. Ковзання та енергія маневру перевірені окремим сценарієм; це не підтвердження ресурсу зчеплення.",
      ...(result.gearboxTeethAdopted ? ["Передаточні числа КПП відповідають прийнятим цілим зубам; геометрію, контакт і згин перевіряє розділ 10."]
        : ["Проміжні числа КПП є проєктним рядом; їх реалізацію зубчастими парами треба перевірити окремо."]),
      ...(forceCheckAvailable ? ["Перекриття перевірено у робочій смузі двигуна та за додатним запасом сили до і після перемикання; часову втрату під час перемикання тут не враховано."]
        : ["Силу на переходах не перевірено: потрібні крива моменту, ККД і опір дороги."])];
    return result;
  }
  // The gearbox ratio alone does not determine engine speed. This analysis
  // chooses a TOTAL engine-to-wheel target. The separate gearbox/axle design
  // still has to realize it in integer teeth and pass the ladder checks.
  function topOperatingPoint({ curve, dynamicRadiusM, targetSpeedMs, requiredPowerKw,
    auxiliaryPowerKw = 0, fuelAt = null, fuelBasis = "not-defined", minimumReserve = 1,
    minimumAngularSpeed = 0, minimumTotalRatio = 0, maximumTotalRatio = Infinity }) {
    const r=number(dynamicRadiusM), v=number(targetSpeedMs), demand=number(requiredPowerKw), aux=number(auxiliaryPowerKw);
    const points=(curve?.points||[]).filter(p=>Number.isFinite(p.angularSpeed)&&Number.isFinite(p.powerKw))
      .slice().sort((a,b)=>a.angularSpeed-b.angularSpeed);
    if (!(curve?.defined && r>0 && v>0 && demand>0 && aux>=0 && points.length>1))
      return {defined:false,reason:"Потрібні спільна характеристика двигуна, потужність опору, допоміжне навантаження, радіус і швидкість."};
    const lo=points[0].angularSpeed, hi=points.at(-1).angularSpeed;
    const interpolate=w=>{
      if(w<lo||w>hi)return null;
      const i=points.findIndex(p=>p.angularSpeed>=w);
      if(i===0)return points[0].powerKw;
      const a=points[i-1],b=points[i];return a.powerKw+(b.powerKw-a.powerKw)*(w-a.angularSpeed)/(b.angularSpeed-a.angularSpeed);
    };
    const powerDemand=demand+aux;
    const evaluate=w=>{
      const available=interpolate(w);
      if(!(available>0))return null;
      const specific=typeof fuelAt==="function"?fuelAt({angularSpeed:w,powerKw:powerDemand,availablePowerKw:available}):null;
      return {angularSpeed:w,rpm:w*30/Math.PI,totalRatio:w*r/v,availablePowerKw:available,
        requiredPowerKw:powerDemand,reserveRatio:available/powerDemand,utilisation:powerDemand/available,
        feasible:available>=powerDemand*minimumReserve*(1-1e-10) && w >= minimumAngularSpeed
          && w*r/v >= minimumTotalRatio && w*r/v <= maximumTotalRatio,specificGkWh:Number.isFinite(specific)&&specific>0?specific:null};
    };
    // Peak POWER is not necessarily the redline (measured curves often fall off).
    const peak=points.reduce((a,b)=>b.powerKw>a.powerKw?b:a,points[0]);
    const powerMatched=evaluate(peak.angularSpeed);
    const candidates=[...new Set([...points.map(p=>p.angularSpeed),
      ...Array.from({length:401},(_,i)=>lo+(hi-lo)*i/400)])].map(evaluate).filter(Boolean);
    const feasible=candidates.filter(c=>c.feasible);
    const economical=feasible.filter(c=>c.specificGkWh!==null).sort((a,b)=>a.specificGkWh-b.specificGkWh||a.rpm-b.rpm)[0]||null;
    return {defined:true,powerMatched,economical,feasibleCount:feasible.length,candidateCount:candidates.length,
      powerFeasible:feasible.length>0,minimumReserve, minimumAngularSpeed, requiredPowerKw:powerDemand,auxiliaryPowerKw:aux,
      dynamicRadiusM:r,targetSpeedMs:v,kinematicBound:hi*r/v,fuelBasis,
      reason:!feasible.length?"Жодні оберти цієї характеристики не дають потрібної потужності. Самою зміною передачі це не виправити."
        :!economical?"Потужність перевірено; економічний оптимум не визначено без придатної карти / апроксимації витрати."
        :"Передаточне число для зменшення витрати палива — мінімум витрати серед перевірених точок за тієї самої потужності опору. Це не мінімум кривої повного навантаження."};
  }
  function topOperatingPointStep(state, texNumber) {
    if(!state?.defined)return null;
    const p=state.powerMatched,e=state.economical;
    return {id:"top-operating-point",title:"Робочі оберти на цільовій швидкості: потужність і витрата",
      purpose:"Separate peak-power matching from feasible economy at the same road-speed demand.",
      output:{id:"value.top-operating-point",symbol:"u_{\\Sigma,top}",label:"Top-gear operating-point comparison",valueType:"list",canonicalUnit:null},
      expression:"u_total = omega*r/v; minimise g(omega,P_required) subject to P_available >= P_required",
      dependencies:["value.required-cruise-power","value.traction-characteristic-engine","value.dynamic-wheel-radius"],
      equationNumber:null,
      formulaTex:"u_{\\Sigma}=\\frac{\\pi n r}{30V};\\quad P_{\\mathrm{дост}}(n)\\ge P_{\\mathrm{потр}};\\quad g_e=g_e(n,P_{\\mathrm{потр}})",
      substitutionTex:`\\begin{aligned}P_{\\mathrm{потр}}&=${texNumber(state.requiredPowerKw,3)}\\ \\text{кВт}\\\\u_{\\Sigma,Pmax}&=\\frac{\\pi\\cdot${texNumber(p.rpm,1)}\\cdot${texNumber(state.dynamicRadiusM,6)}}{30\\cdot${texNumber(state.targetSpeedMs,6)}}=${texNumber(p.totalRatio,6)}`
        +(e?`\\\\n_{\\mathrm{екон}}&=${texNumber(e.rpm,1)}\\ \\text{об/хв};\\quad u_{\\Sigma,\\mathrm{екон}}=${texNumber(e.totalRatio,6)}\\\\P_{\\mathrm{дост}}&=${texNumber(e.availablePowerKw,3)}\\ge${texNumber(state.requiredPowerKw,3)}\\ \\text{кВт};\\quad g_e=${texNumber(e.specificGkWh,2)}\\ \\text{г/(кВт·год)}`:"")+"\\end{aligned}",
      result:{value:[{basis:"peak-power",...p},...(e?[{basis:"economy-candidate",...e}]:[])],canonicalUnit:null,displayUnit:null},
      method:"power-feasible-operating-point-search",sourceRefs:["source.project-derivation","source.method.course"],
      readerNotes:[state.reason,`Основа витрати: ${state.fuelBasis}. Перевірено ${state.candidateCount} точок; допустимі за потужністю — ${state.feasibleCount}.`,
        "I-79 задає лише частину редукції в коробці, не оберти сам по собі. Потрібний добуток розкладається на коробку, головну й за наявності колісну передачу.",
        "Автоматична початкова передача прив'язана до обертів максимуму потужності, а не до граничних обертів. Передаточне число для зменшення витрати палива показано окремо; його можна прийняти через I-82. Після вибору зубів перевіряються фактичні оберти, сила та перекриття."],
      assumptions:[],limitations:["Пошук дискретний і залежить від прийнятої паливної моделі, не є паспортним оптимумом. Передача максимальної швидкості та економічна крейсерська передача можуть бути різними. Втома, охолодження й ресурс цим пошуком не перевірені."]};
  }
  function reverseGear({firstGearRatio, adoptedRatio=null, finalDriveRatio, transferRatio=1, hubRatio=1,
    dynamicRadiusM, idleAngularSpeed, maximumAngularSpeed, peakTorqueNm, efficiency, adhesionForceN}) {
    const manual=adoptedRatio!==null && adoptedRatio!=="";
    const ratio=manual ? number(adoptedRatio) : number(firstGearRatio);
    const chain=ratioChain({gearboxRatio:ratio,finalDriveRatio,transferRatio,hubRatio});
    if (!chain.defined || !(dynamicRadiusM>0 && idleAngularSpeed>0 && maximumAngularSpeed>=idleAngularSpeed
      && peakTorqueNm>0 && efficiency>0 && efficiency<=1)) return {defined:false,reason:"Для заднього ходу потрібні додатне число КПП, повний ланцюг редукції та характеристика двигуна."};
    const wheelTorqueNm=peakTorqueNm*chain.totalRatio*efficiency;
    const forceN=wheelTorqueNm/dynamicRadiusM;
    return {defined:true,gear:"R",ratio,signedRatio:-ratio,direction:-1,manual,...chain,
      firstGearRatio,governingRatio:Math.max(firstGearRatio,ratio),dynamicRadiusM,idleAngularSpeed,maximumAngularSpeed,
      idleSpeedKmh:-idleAngularSpeed*dynamicRadiusM/chain.totalRatio*3.6,
      kinematicMaximumSpeedKmh:-maximumAngularSpeed*dynamicRadiusM/chain.totalRatio*3.6,
      peakTorqueNm,efficiency,wheelTorqueNm,forceN,
      usableForceN:adhesionForceN>0?Math.min(forceN,adhesionForceN):null,
      adhesionLimited:adhesionForceN>0?forceN>adhesionForceN:null};
  }
  function reverseGearSteps(state,tex) {
    if (!state?.defined) return [];
    return [{id:"reverse-gear-ratio",title:"Задній хід: передаточне число, швидкість і тяга",
      purpose:"Adopt a separate reverse ratio without adding it to the forward driving schedule.",
      output:{id:"value.reverse-gear-ratio",symbol:"|u_R|",label:"Reverse gearbox ratio magnitude",valueType:"number",canonicalUnit:null},
      expression:state.manual?"u_R=adopted; U_R=u_R*u_final*u_transfer*u_hub; v=-omega*r/U_R":"u_R=u_first; U_R=u_R*u_final*u_transfer*u_hub; v=-omega*r/U_R",
      dependencies:["value.first-gear-ratio","value.final-drive-ratio","decision.transfer-case-ratio","value.dynamic-wheel-radius","value.traction-characteristic-engine",...(state.manual?["input.reverse-gear-ratio"]:[])],
      equationNumber:null,
      formulaTex:String.raw`U_R=|u_R|u_0u_{\mathrm{рк}}u_{\mathrm{кол}},\quad v_R=-\omega r/U_R,\quad T_{\mathrm{кол},R}=T_{e,\max}U_R\eta`,
      substitutionTex:String.raw`\begin{aligned}|u_R|&=${tex(state.ratio,5)};\quad U_R=${tex(state.ratio,5)}\cdot${tex(state.finalDriveRatio,5)}\cdot${tex(state.transferRatio,5)}\cdot${tex(state.hubRatio,5)}=${tex(state.totalRatio,5)}\\v_{R,x}&=-\frac{${tex(state.idleAngularSpeed,5)}\cdot${tex(state.dynamicRadiusM,6)}}{${tex(state.totalRatio,5)}}\cdot3{,}6=${tex(state.idleSpeedKmh,2)}\ \text{км/год}\\T_{\mathrm{кол},R}&=${tex(state.peakTorqueNm,3)}\cdot${tex(state.totalRatio,5)}\cdot${tex(state.efficiency,3)}=${tex(state.wheelTorqueNm,2)}\ \text{Н·м}\end{aligned}`,
      result:{value:state.ratio,canonicalUnit:null,displayUnit:null},method:state.manual?"project-input":"reverse-matches-first",
      sourceRefs:[state.manual?"source.project-input":"source.project-derivation"],assumptions:[],
      readerNotes:[state.manual?"Число заднього ходу прийнято автором.":"Початково модуль числа заднього ходу дорівнює дійсному числу першої передачі. Це проєктне припущення, не норматив.",
        `Мінус швидкості означає задній напрям. Кінематична межа при максимальних обертах: ${tex(state.kinematicMaximumSpeedKmh,2)} км/год; це не рекомендована швидкість маневру.`,
        `Повнонавантажена сила ${tex(state.forceN/1000,3)} кН; за статичним зчепленням ${state.usableForceN===null?"не визначено":tex(state.usableForceN/1000,3)+" кН"}. R не входить у кількість передніх передач, розгін або паливний цикл.`],
      limitations:["Це вибір відношення й перевірка кінематики та навантаження. Проміжну шестерню заднього ходу, її зуби, розташування та міцність треба визначити при компонуванні коробки."]},
      {id:"governing-gearbox-ratio",title:"Найбільше число КПП для навантаження валів",
      purpose:"Include a shorter reverse gear in downstream torque sizing.",
      output:{id:"value.governing-gearbox-ratio",symbol:"u_{\\mathrm{к,max}}",label:"Governing gearbox ratio",valueType:"number",canonicalUnit:null},
      expression:"max(u_first, abs(u_reverse))",dependencies:["value.first-gear-ratio","value.reverse-gear-ratio"],equationNumber:null,
      formulaTex:String.raw`u_{\mathrm{к,max}}=\max(u_1,|u_R|)`,
      substitutionTex:String.raw`u_{\mathrm{к,max}}=\max(${tex(state.firstGearRatio,5)},${tex(state.ratio,5)})=${tex(state.governingRatio,5)}`,
      result:{value:state.governingRatio,canonicalUnit:null,displayUnit:null},method:"governing-forward-or-reverse",sourceRefs:["source.project-derivation"],
      readerNotes:["Навантаження карданного вала й привода враховує більше з передаточних чисел першої передачі та заднього ходу."],assumptions:[],limitations:[]}];
  }
  function cruiseOperatingPointStep(state, tex) {
    if (!state?.defined) return null;
    const e=state.economical, a=state.actual;
    return {id:"cruise-operating-point",title:"Крейсерська передача: витрата й запас потужності",
      purpose:"Choose an optional economy overdrive independently of the maximum-speed working gear.",
      output:{id:"value.cruise-operating-point",symbol:"u_{\\Sigma,c}",label:"Cruising gear assessment",valueType:"list",canonicalUnit:null},
      expression:"v_c=min(v_class,0.9*v_max); P_c=F_road(v_c)*v_c/eta+P_aux; minimise g(omega,P_c) with P_available/P_c>=1.15 and loaded rpm/shift limits; validate integer ratio",
      dependencies:["value.traction-characteristic-engine","value.dynamic-wheel-radius","value.final-drive-ratio","value.gearbox-ladder","input.vehicle-category","value.required-cruise-power","input.specific-consumption-at-rated-power","input.auxiliary-power"],
      equationNumber:null,
      formulaTex:String.raw`P_c=F_{\mathrm{оп}}(V_c)V_c/\eta+P_{\mathrm{доп}},\quad u_{\Sigma,c}=\omega_c r/V_c,\quad P_{\mathrm{дост}}/P_c\ge1{,}15`,
      substitutionTex:String.raw`V_c=${tex(state.targetSpeedMs*3.6,2)}\ \text{км/год};\quad P_c=`
        +(state.road?String.raw`\frac{(${tex(state.road.roadForceN,3)}+${tex(state.road.dragForceN,3)})\cdot${tex(state.targetSpeedMs,6)}}{1000\cdot${tex(state.road.efficiency,3)}}+${tex(state.auxiliaryPowerKw,3)}=`:"")
        +String.raw`${tex(state.requiredPowerKw,3)}\ \text{кВт}`
        +(e?String.raw`;\quad u_{\Sigma,c}=${tex(e.angularSpeed,4)}\cdot${tex(state.dynamicRadiusM,6)}/${tex(state.targetSpeedMs,6)}=${tex(e.totalRatio,5)};\quad g_e=${tex(e.specificGkWh,2)}\ \text{г/(кВт·год)}`:"")
        +(a?String.raw`;\quad n_{\mathrm{дійсн}}=${tex(a.rpm,1)}\ \text{об/хв};\quad P_{\mathrm{дост}}/P_c=${tex(a.reserveRatio,3)}`:""),
      result:{value:[{basis:"cruise-search",speedKmh:state.targetSpeedMs*3.6,powerKw:state.requiredPowerKw,minimumReserve:state.minimumReserve,baselineSpecificGkWh:state.baselineSpecificGkWh??null},...(e?[{basis:"economy-target",...e}]:[]),...(a?[{basis:"integer-gear-check",...a}]:[])],canonicalUnit:null,displayUnit:null},
      method:"working-gears-plus-cruise",sourceRefs:["source.method.course","source.project-derivation"],
      readerNotes:[state.adoptionReason||state.reason,`Основа витрати: ${state.fuelBasis}. Цільовий варіант і дійсні оберти, витрата та запас після прийняття зубів показані окремо.`,
        "Проєктні припущення: M1 — 120, M2 — 100, M3 — 85, N1 — 110, N2 — 85, N3 — 80 км/год, не більше 90 % заданої максимальної швидкості; запас потужності 15 %. Це не нормативні обмеження швидкості.",
        "Нижні крейсерські оберти: не нижче 1,5 холостих і 0,35 номінальних; крок від робочої передачі — в межах профілю. Власний ряд задається через I-79 та I-82."],
      assumptions:[],limitations:["Дискретний пошук за прийнятою паливною моделлю; не паспортна оптимізація автомобіля."]};
  }
  return Object.freeze({ CLASS_DEFAULTS, engineFormulaTex, defaults, engineEnvelope, ratioChain, vehicleSpeedKmh, engineSpeedRpm,
    designFirstRatio, designLadder, inspectGearing, topOperatingPoint, topOperatingPointStep, cruiseOperatingPointStep, reverseGear, reverseGearSteps });
}
