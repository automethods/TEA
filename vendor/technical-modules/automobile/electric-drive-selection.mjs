"use strict";

export function createElectricDriveSelection({dependencies={},loadDependency=null,runtime="browser"}={}) {
  const window=runtime==="browser"?dependencies:undefined; const globalThis=dependencies; const module=loadDependency?{exports:{}}:undefined; const require=loadDependency;

  function finite(value) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }

  const LIMITATION_TRANSLATIONS = Object.freeze({
    "No application class or base speed is stated": "Клас застосування та базову частоту не зазначено.",
    "The catalog does not state a reduction ratio or base speed": "Каталог не подає передаточного числа та базової частоти.",
    "The stated gearbox ratios are not a complete axle final-drive ratio": "Наведені числа коробки не є повним передаточним числом привода осі.",
    "Overall ratios include the wheel-end reduction.": "Наведені повні числа включають колісний ступінь редукції.",
    "Four gearbox ratios are stated": "Наведено чотири передаточні числа коробки.",
    "the app imports the highest-speed and next ratio only": "Застосунок імпортує лише найшвидкісніше та наступне передаточні числа.",
    "Motor shaft torque and maximum speed are not stated": "Момент на валу та максимальну частоту двигуна не зазначено.",
    "Motor maximum speed and base speed are not stated": "Максимальну та базову частоти двигуна не зазначено.",
    "motor maximum speed and base speed are not stated": "Максимальну та базову частоти двигуна не зазначено.",
    "motor speeds are not stated": "Частоти обертання двигуна не зазначено.",
    "The four stated ratios are preserved": "Усі чотири наведені передаточні числа збережено.",
    "The stated 579 rpm is wheel speed and is deliberately not stored as motor maximum speed": "579 об/хв — частота колеса, тому її не прийнято як максимальну частоту двигуна.",
    "The stated 488 rpm is wheel speed and is deliberately not stored as motor maximum speed": "488 об/хв — частота колеса, тому її не прийнято як максимальну частоту двигуна.",
    "Overall motor-to-wheel ratios are calculated as each stated transmission ratio multiplied by the separately stated 3.478 wheel-end reduction": "Повні числа від двигуна до колеса розраховано множенням кожного числа коробки на окремо наведене колісне число 3,478.",
    "The table marks power and torque as dual-motor but does not unambiguously say whether values are per motor or system totals": "Таблиця позначає потужність і момент як двомоторні, але не уточнює, чи це значення одного двигуна, чи всієї системи.",
    "compound main and auxiliary ratios require topology-specific pairing and are not auto-applied": "Основні й допоміжні числа потребують узгодження зі схемою та автоматично не застосовуються.",
    "Continuous rating requires the specified cooling": "Тривалі параметри дійсні за передбаченого виробником охолодження.",
    "reduction ratio and base speed are not stated": "Передаточне число та базову частоту не зазначено.",
    "Ratings depend on the stated coolant and installation conditions": "Параметри залежать від наведених умов охолодження та встановлення.",
    "Reduction ratio and base speed are not stated": "Передаточне число та базову частоту не зазначено.",
    "Rated speed reduction ratio and base speed are not stated": "Номінальну частоту, передаточне число та базову частоту не зазначено."
  });

  const MANUFACTURER_SOURCE_REFS = Object.freeze({
    Brogen: "brogen", EMRAX: "emrax", ABB: "abb-amxe", Xinda: "xinda-motor"
  });

  function sourceRef(item) {
    return MANUFACTURER_SOURCE_REFS[item?.manufacturer] || null;
  }

  function translatedLimitations(item) {
    return (Array.isArray(item?.limitations) ? item.limitations : [])
      .filter(Boolean).map(value => LIMITATION_TRANSLATIONS[value] || value);
  }

  function compatibility(item, criteria = {}) {
    const requiredPower = finite(criteria.requiredPowerKw);
    const ratio = finite(item.topSpeedRatio);
    const maximumSpeedMs = finite(criteria.maximumSpeedMs);
    const dynamicRadiusM = finite(criteria.dynamicRadiusM);
    const candidateRpm = ratio !== null && maximumSpeedMs > 0 && dynamicRadiusM > 0
      ? 30 * maximumSpeedMs * ratio / (Math.PI * dynamicRadiusM) : null;
    const requiredRpm = candidateRpm ?? finite(criteria.requiredRpm);
    const requiredAxleLoad = finite(criteria.requiredAxleLoadKg);
    const power = finite(criteria.ratingBasis === "continuous"
      ? item.ratedPowerKw : item.peakPowerKw);
    const rpm = finite(item.maximumSpeedRpm);
    const axleLoad = finite(item.axleLoadKg);
    const rejected = [];
    const unverified = [];
    const application = String(item.application || "").toLowerCase();
    const category = String(criteria.vehicleCategory || "");
    const explicitBus = /bus|coach|shuttle/.test(application);
    const explicitTruck = /truck|commercial/.test(application);
    if (item.componentType === "e-axle"
      && ((category.startsWith("N") && explicitBus && !explicitTruck)
        || (category.startsWith("M") && explicitTruck && !explicitBus))) {
      rejected.push("category");
    }
    const requiredMotorCount = finite(criteria.requiredMotorCount);
    const motorCount = finite(item.motorCount);
    if (item.componentType === "e-axle" && requiredMotorCount > 0
      && motorCount !== null && motorCount !== requiredMotorCount) {
      rejected.push("motor-count");
    }
    if (requiredPower !== null && requiredPower > 0) {
      if (power === null) rejected.push("power-unknown");
      else if (power < requiredPower) rejected.push("power");
    }
    if (requiredRpm !== null && requiredRpm > 0) {
      if (rpm === null) unverified.push("rpm");
      else if (rpm < requiredRpm) rejected.push("rpm");
    }
    if (requiredAxleLoad !== null && requiredAxleLoad > 0 && item.componentType === "e-axle") {
      if (axleLoad === null) unverified.push("axle-load");
      else if (axleLoad < requiredAxleLoad) rejected.push("axle-load");
    }
    if (ratio === null) unverified.push("reduction");
    return {
      suitable: rejected.length === 0,
      rejected,
      unverified,
      requiredRpm,
      powerMarginPercent: power !== null && requiredPower > 0
        ? (power / requiredPower - 1) * 100 : null
    };
  }

  function label(item, criteria = {}) {
    const power = finite(criteria.ratingBasis === "continuous"
      ? item.ratedPowerKw : item.peakPowerKw);
    const ratio = finite(item.topSpeedRatio);
    const requiredPower = finite(criteria.requiredPowerKw);
    const check = compatibility(item, criteria);
    const count = finite(item.motorCount);
    return `${item.manufacturer} ${item.model} · ${item.application}`
      + `${count > 1 ? ` · ${count}× двигун` : ""}`
      + `${power === null ? "" : ` · ${power} кВт`}`
      + `${requiredPower > 0 && power !== null
        ? ` · потрібно ${requiredPower.toFixed(0)} кВт · запас ${check.powerMarginPercent.toFixed(0)}%` : ""}`
      + `${ratio === null ? " · i?" : ` · i=${ratio}`}`
      + `${check.requiredRpm > 0
        ? check.rejected.includes("rpm") ? " · RPM ✕"
          : check.unverified.includes("rpm") ? " · RPM ?" : " · RPM ✓" : ""}`;
  }

  function fieldValues(item, drivenAxle = "rear") {
    if (!item) return {};
    const values = {};
    const power = finite(item.peakPowerKw);
    const maximumSpeed = finite(item.maximumSpeedRpm);
    const firstRatio = finite(item.topSpeedRatio);
    const secondRatio = finite(item.secondRatio);
    if (power !== null) values.motorPeakPowerKw = power;
    if (maximumSpeed !== null) values.motorMaxRpm = maximumSpeed;
    if (firstRatio !== null) {
      values[drivenAxle === "front" ? "motorReductionFront" : "motorReductionRear"] = firstRatio;
    }
    values.motorSecondRatio = secondRatio === null ? "" : secondRatio;
    return values;
  }

  function selection(items, criteria = {}) {
    const assessed = items.map(item => ({ item, ...compatibility(item, criteria) }));
    const rejected = assessed.filter(row => !row.suitable);
    const counts = Object.create(null);
    rejected.flatMap(row => row.rejected).forEach(reason => { counts[reason] = (counts[reason] || 0) + 1; });
    return {
      items: assessed.filter(row => row.suitable).map(row => row.item),
      assessed,
      rejectedCount: rejected.length,
      counts
    };
  }

  function eligible(items, criteria) {
    const normalized = typeof criteria === "object" && criteria !== null
      ? criteria : { requiredPowerKw: criteria };
    return selection(items, normalized).items;
  }

  function sourceText(item) {
    if (!item) return "";
    const limitations = translatedLimitations(item);
    return [`Дані виробника для ${item.manufacturer} ${item.model}.`, ...limitations]
      .filter(Boolean).join(" ");
  }

  return { compatibility, eligible, fieldValues, label, selection, sourceRef, sourceText, translatedLimitations };
}
