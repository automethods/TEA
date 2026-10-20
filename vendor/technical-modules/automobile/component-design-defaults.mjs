"use strict";

// Editable construction candidates for the initial educational project.
// These dimensions are not manufacturer data or values prescribed by a source.
export function createComponentDesignDefaults({dependencies={},loadDependency=null,runtime="browser"}={}) {
  const window=runtime==="browser"?dependencies:undefined; const globalThis=dependencies; const module=loadDependency?{exports:{}}:undefined; const require=loadDependency;

  const FIELD_LABELS = Object.freeze({
    halfShaftArm: "Плече навантаження півосі",
    halfShaftLength: "Довжина півосі",
    springMeanDiameter: "Середній діаметр пружини підвіски",
    torsionArm: "Плече торсіона",
    torsionLength: "Робоча довжина торсіона",
    plateThickness: "Товщина пластини торсіона",
    plateWidth: "Ширина пластини торсіона",
    plateCount: "Кількість пластин торсіона"
  });
  const UNITS = Object.freeze({ halfShaftArm: "м", halfShaftLength: "м",
    springMeanDiameter: "м", torsionArm: "м", torsionLength: "м",
    plateThickness: "мм", plateWidth: "мм", plateCount: "" });
  // Lengths are initial packaging assumptions, with the halfshaft length
  // corresponding to half the initial class track. They are not measurements
  // of the current layout and never override an explicitly entered dimension.
  const ROWS = Object.freeze({
    M1: Object.freeze([0.12, 0.775, 0.12, 0.30, 1.0, 8, 50, 6]),
    M2: Object.freeze([0.12, 0.875, 0.14, 0.35, 1.2, 10, 60, 8]),
    M3: Object.freeze([0.12, 1.025, 0.20, 0.45, 1.5, 12, 90, 12]),
    N1: Object.freeze([0.12, 0.850, 0.14, 0.32, 1.1, 10, 60, 8]),
    N2: Object.freeze([0.12, 0.925, 0.18, 0.40, 1.4, 12, 80, 10]),
    N3: Object.freeze([0.12, 1.025, 0.23, 0.45, 1.5, 16, 100, 14])
  });
  const FIELDS = Object.freeze(Object.keys(FIELD_LABELS));
  const SUSPENSION_LIMITATION = "Пружина, круглий і пластинчастий торсіони — окремі попередні варіанти для порівняння. Їх не прийнято одночасно встановленими елементами підвіски. Розміщення, матеріал, ресурс і кінематику підвіски уточнюють окремо.";
  const SHAFT_LIMITATION = "Попередній розмір компонування; це не вимірювання півосі. Уточніть відстані за кресленням підшипників, маточини та диференціала.";

  function fieldsForCategory(category) {
    const row = ROWS[category];
    return row ? Object.fromEntries(FIELDS.map((id, index) => [id, row[index]])) : {};
  }

  function adoptionFor({ category, id, value, automatic = false }) {
    if (!FIELDS.includes(id) || value === null || value === undefined
      || String(value).trim() === "" || !Number.isFinite(Number(value)) || Number(value) <= 0) {
      return { defined: false, reason: "Розмір не задано або він не є додатним." };
    }
    const number = Number(value);
    const candidate = fieldsForCategory(category)[id];
    // A caller must carry explicit adoption state. Coinciding numbers alone
    // do not turn an older saved or manually entered value into a default.
    const isDefault = automatic === true && number === candidate;
    const label = FIELD_LABELS[id];
    const rationale = isDefault
      ? `${label}: ${number}${UNITS[id] ? ` ${UNITS[id]}` : ""} — редаговане початкове конструктивне припущення проєкту класу ${category}; джерело не задає цього розміру.`
        + (id === "halfShaftLength" ? " Початковий орієнтир — половина колії профілю класу, без деталізації корпусу диференціала." : "")
      : `${label}: явно задане значення проєкту.`;
    return { defined: true, value: number,
      method: isDefault ? "class-design-assumption" : "project-input",
      rationale, sourceRefs: [isDefault ? "source.project-derivation" : "source.project-input"],
      limitations: [id.startsWith("halfShaft") ? SHAFT_LIMITATION : SUSPENSION_LIMITATION],
      manuallyOverridden: !isDefault };
  }

  return Object.freeze({ FIELDS, FIELD_LABELS, fieldsForCategory, adoptionFor,
    SUSPENSION_LIMITATION, SHAFT_LIMITATION });
}
