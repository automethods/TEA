"use strict";

// Одна перевірка числа на весь проєкт.
//
// Number() приймає забагато: Number(null) === 0, Number(true) === 1,
// Number("") === 0, Number([]) === 0 — і всі вони проходять Number.isFinite.
// Тому звична пара «сплюснути й перевірити на скінченність» не ловить саме те,
// заради чого її пишуть: відсутнє значення стає нулем, а прапорець — одиницею,
// і розрахунокіде далі з фізично неправильним, але правдоподібним числом.
//
// Ця помилка в проєкті траплялася вже не раз: зникав опір повітря, зникав час
// реакції водія, порожній розрахунок оголошував потужність достатньою.
export function createNumeric({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;


  // Повертає число або null. Приймає лише справжні числа й рядки, які цілком
  // є числом: рядок дозволено, бо саме таким приходить значення з поля вводу.
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

  // Ordinary reader text needs localized numbers without MathJax decimal
  // braces or TeX thousands separators. Keep this separate from texNumber.
  const proseFormats = new Map();
  function plainNumber(value, maximumFractionDigits = 1) {
    if (!proseFormats.has(maximumFractionDigits)) proseFormats.set(maximumFractionDigits,
      new Intl.NumberFormat("uk-UA", { maximumFractionDigits }));
    return proseFormats.get(maximumFractionDigits).format(value);
  }

  return Object.freeze({ finiteNumber, plainNumber });
}
