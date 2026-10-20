"use strict";

// The worksheet owns all new secondary-stage arithmetic. This module adopts
// the first preferred module whose evaluated bending and contact checks pass.
export function createSecondary({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;

  const scope = typeof window === "object" ? window : globalThis;
  const cache = new Map();
  function environment() {
    return { source: scope.VehicleFinalDriveSecondaryWorksheetSource, adapter: scope.VehicleFinalDriveSecondaryDocument };
  }
  const ASSUMPTIONS = [
    "Геометрія та допустимі напруги другої ступені — явні попередні припущення, наведені у входах аркуша; вони не є вимогами виробника.",
    "M₃ = M₁·uкон без зменшення на втрати; запас і навантаження вже входять у M₁ та вдруге не множаться.",
    "Для зовнішнього зачеплення кривини додаються; у контактній формулі використано ширину вінця b."
  ];
  const LIMITATIONS = [
    "Це попередній підбір за статичним згином і контактом, не повна перевірка за ISO 6336. Матеріал, термообробку, ресурс, точність, профіль і навантаження по ширині потрібно прийняти окремо."
  ];
  function design({ torqueNm, teeth, helixAngleDeg = 25, faceWidthModules = 10,
    allowableBendingMpa = 225, allowableContactMpa = 1000 }) {
    if (!teeth?.defined || !(torqueNm > 0) || !Number.isFinite(torqueNm)
      || !(helixAngleDeg > 0 && helixAngleDeg < 45) || !(faceWidthModules > 0)
      || !(allowableBendingMpa > 0) || !(allowableContactMpa > 0)) {
      return { defined: false, reason: "Для другої ступені потрібні цілі зуби, момент і допустимі напруги." };
    }
    const { source, adapter } = environment();
    if (!source || !adapter) return { defined: false, reason: "Аркуш другої ступені ще не завантажено." };
    const g = scope.VehicleGearboxGears;
    const f1 = g.toothFormFactor(teeth.drivingTeeth, helixAngleDeg);
    const f2 = g.toothFormFactor(teeth.drivenTeeth, helixAngleDeg);
    if (!f1 || !f2) return { defined: false, reason: "Форму зубів другої ступені не визначено." };
    const inputs = { torqueNm, drivingTeeth: teeth.drivingTeeth, drivenTeeth: teeth.drivenTeeth,
      helixAngleDeg, faceWidthModules, allowableBendingMpa, allowableContactMpa,
      drivingFormFactor: f1.factor, drivenFormFactor: f2.factor };
    const key = JSON.stringify(inputs);
    if (cache.has(key)) return cache.get(key);
    const candidates = g.MODULE_SERIES[0].values.map(value => ({ value, basis: "source-series" }));
    // This explicit preliminary grid extends the search for heavy vehicles;
    // it is not represented as a manufacturer's or a sourced standard series.
    for (let value = 17; value <= 64; value += 1) candidates.push({ value, basis: "project-grid" });
    let last;
    for (const candidate of candidates) {
      const evaluated = adapter.evaluateSecondaryCandidate(source, { ...inputs, moduleMm: candidate.value });
      if (!evaluated.defined) return evaluated;
      const v = evaluated.values;
      const driving = { defined: true, value: v["driving-bending"], limitMpa: allowableBendingMpa,
        withinLimit: v["driving-bending"] <= allowableBendingMpa,
        safetyFactor: v["driving-bending-safety-factor"], requiredModuleMm: v["driving-required-module"],
        formFactor: f1.factor, torqueNm };
      const driven = { defined: true, value: v["driven-bending"], limitMpa: allowableBendingMpa,
        withinLimit: v["driven-bending"] <= allowableBendingMpa,
        safetyFactor: v["driven-bending-safety-factor"], requiredModuleMm: v["driven-required-module"],
        formFactor: f2.factor, torqueNm: v["driven-torque"] };
      const bending = { defined: true, driving, driven, value: v.bending, limitMpa: allowableBendingMpa,
        withinLimit: v.bending <= allowableBendingMpa, safetyFactor: v["bending-safety-factor"] };
      const contact = { defined: true, value: v.contact, limitMpa: allowableContactMpa,
        withinLimit: v.contact <= allowableContactMpa, safetyFactor: v["contact-safety-factor"],
        forceN: v["tangential-force"], pitchRadiiMm: { driving: v["driving-radius"], driven: v["driven-radius"] } };
      last = { defined: true, moduleMm: v.module, moduleBasis: candidate.basis,
        requiredModuleMm: v["required-module"],
        faceWidthMm: v["face-width"], helixAngleDeg, torqueNm, teeth, bending, contact,
        assumptions: [...ASSUMPTIONS], limitations: [...LIMITATIONS,
          ...(candidate.basis === "project-grid"
            ? ["Модуль перевищує перший ряд джерела 2…16 мм: використано попередню сітку проєкту 17…64 мм із кроком 1 мм. Це не стандартний або підтверджений виробником модуль; потрібне окреме конструктивне прийняття."] : []),
          ...(f1.outsideTable || f2.outsideTable
            ? ["Приведене число зубів виходить за таблицю; використано найближчу крайову форму як явне попереднє наближення."] : [])],
        worksheet: evaluated, documentData: evaluated.documentData };
      if (bending.withinLimit && contact.withinLimit) {
        if (cache.size >= 64) cache.delete(cache.keys().next().value);
        cache.set(key, last);
        return last;
      }
    }
    return { ...(last || {}), defined: false,
      reason: "Жодний модуль першого ряду 2…16 мм або попередньої сітки проєкту 17…64 мм не задовольнив обидві перевірки циліндричної ступені." };
  }
  function buildSteps({ secondary: s, texNumber: t }) {
    if (!s?.defined) return [];
    return s.worksheet.steps.map(step => ({ ...step,
      assumptions: s.assumptions, limitations: [...step.limitations, ...s.limitations],
      readerNotes: [
        `M₃ = ${t(s.torqueNm, 0)} Н·м; b = ${t(s.faceWidthMm, 1)} мм; β = ${t(s.helixAngleDeg, 1)}°; `
          + `y₃ = ${t(s.bending.driving.formFactor, 3)}, y₄ = ${t(s.bending.driven.formFactor, 3)}.`,
        ...(step.id.endsWith("-module") ? [
          `Потрібно за згином m ≥ ${t(s.requiredModuleMm, 2)} мм; прийнято ${t(s.moduleMm, 2)} мм `
            + `${s.moduleBasis === "project-grid" ? "за явною попередньою сіткою проєкту" : "із першого ряду джерела"} після перевірок (12.7), (12.8).`
        ] : step.id.endsWith("-contact") ? [
          `F_t = ${t(s.contact.forceN, 0)} Н; r₃ = ${t(s.contact.pitchRadiiMm.driving, 2)} мм, `
            + `r₄ = ${t(s.contact.pitchRadiiMm.driven, 2)} мм; межа ${t(s.contact.limitMpa, 0)} МПа; запас ${t(s.contact.safetyFactor, 2)}.`
        ] : [
          `σ₃ = ${t(s.bending.driving.value, 1)} МПа, σ₄ = ${t(s.bending.driven.value, 1)} МПа; `
            + `межа ${t(s.bending.limitMpa, 0)} МПа; запас ${t(s.bending.safetyFactor, 2)}.`
        ])
      ]
    }));
  }
  return { design, buildSteps };
}
