"use strict";

import * as coupling from "../battery-motor/index.mjs";
export function batteryDesignFactory({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;

  const DEFAULTS = Object.freeze({ batteryModel: "off", batteryUsableKwh: "", batteryGrossKwh: "",
    batteryBaseMassKg: "", batterySpecificEnergyWhKg: "160", batteryGrossMassLimitKg: "",
    batterySocInitialPct: "90", batterySocMinPct: "10", batterySocMaxPct: "100",
    batteryTargetRangeKm: "300", batteryVoltageV: "400", batteryResistanceOhm: "0.05",
    batteryDischargeA: "800", batteryChargeA: "300", batteryVoltageMinV: "250", batteryVoltageMaxV: "450" });
  const finite = value => value !== null && value !== undefined && String(value).trim() !== ""
    && Number.isFinite(Number(value)) ? Number(value) : null;

  function settings(read) {
    const soc = id => { const value = finite(read(id)); return value === null ? NaN : value / 100; };
    return { model: read("batteryModel") || "off", energyKwh: finite(read("batteryUsableKwh")),
      grossKwh: finite(read("batteryGrossKwh")), baseMassKg: finite(read("batteryBaseMassKg")),
      specificEnergyWhKg: finite(read("batterySpecificEnergyWhKg")), grossMassLimitKg: finite(read("batteryGrossMassLimitKg")),
      socInitial: soc("batterySocInitialPct"), socMin: soc("batterySocMinPct"),
      socMax: soc("batterySocMaxPct"), targetRangeKm: finite(read("batteryTargetRangeKm")),
      voltageV: finite(read("batteryVoltageV")), resistanceOhm: finite(read("batteryResistanceOhm")),
      dischargeA: finite(read("batteryDischargeA")), chargeA: finite(read("batteryChargeA")),
      voltageMinV: finite(read("batteryVoltageMinV")), voltageMaxV: finite(read("batteryVoltageMaxV")) };
  }

  function validate(p) {
    if (!["energy", "rint"].includes(p.model)) return "Виберіть модель батареї.";
    if (!(p.energyKwh > 0 && p.baseMassKg > 0 && p.specificEnergyWhKg > 0 && p.grossMassLimitKg > 0))
      return "Задайте доступну місткість, масу без батареї, доступну питому енергію пакета та допустиму повну масу.";
    if (p.grossKwh !== null && !(p.grossKwh >= p.energyKwh)) return "Повна місткість має бути не меншою за доступну.";
    if (![p.socMin, p.socInitial, p.socMax].every(Number.isFinite)
      || !(p.socMin >= 0 && p.socMin < p.socInitial && p.socInitial <= p.socMax && p.socMax <= 1))
      return "Потрібно 0 ≤ SOC_min < SOC_поч ≤ SOC_max ≤ 100%.";
    if (!(p.targetRangeKm > 0)) return "Задайте додатний бажаний запас ходу.";
    if (p.model === "rint" && !(p.voltageV > 0 && p.resistanceOhm !== null && p.resistanceOhm >= 0
      && p.dischargeA > 0 && p.chargeA !== null && p.chargeA >= 0
      && p.voltageMinV > 0 && p.voltageMinV <= p.voltageV && p.voltageV <= p.voltageMaxV))
      return "Перевірте напругу, опір, межі струму та вікно напруги батареї.";
    return null;
  }

  function prepare({ powertrain, read, evaluate }) {
    const p = settings(read);
    const enabled = powertrain === "electric" && p.model !== "off";
    const reason = enabled ? validate(p) : null;
    if (!enabled || reason) return { enabled, defined: false, reason, settings: p };
    const worksheet = evaluate(p);
    return { enabled, defined: worksheet.defined, reason: worksheet.reason, settings: p, worksheet,
      packMassKg: worksheet.packMassKg, curbMassKg: worksheet.curbMassKg,
      payloadCapacityKg: worksheet.payloadCapacityKg, tripEnergyKwh: worksheet.tripEnergyKwh };
  }

  // Repeat the existing backward cycle integral. The Rint stable root is the
  // same as ICE: P=(U-RI)I, chemical power UI, heat I²R. A discharge power
  // shortfall invalidates range; curtailed regeneration goes to friction brakes.
  // At the reserve boundary only the last step's time and distance are shortened.
  function traverse(integration, p, tripEnergyKwh, { rows = false, evaluateMotor } = {}) {
    if (!integration?.defined || !integration.steps?.length) return { defined: false, reason: integration?.reason || "Потрібен інтеграл циклу." };
    const capacityJ = p.energyKwh * 3.6e6, availableJ = tripEnergyKwh * 3.6e6;
    let usedJ = 0, terminalJ = 0, heatJ = 0, distanceM = 0, elapsedS = 0, curtailedJ = 0;
    let motorLossJ = 0, inverterLossJ = 0, additionalFrictionJ = 0;
    const profile = [], cyclesLimit = 10000;
    let cycleCount = 0;
    for (; cycleCount < cyclesLimit; cycleCount += 1) {
      const before = usedJ;
      for (const step of integration.steps) {
        const requestedW = (step.tractionInputEnergyJ + step.auxiliaryEnergyJ - step.recoveredEnergyJ) / step.dtS;
        let powerW = requestedW, chemicalW = requestedW, lossW = 0, currentA = null, terminalV = null;
        const chargeRoomJ = Math.max(0, (p.socMax - p.socInitial) * capacityJ + usedJ);
        let acceptedMotor = null;
        if (step.motorComponent) {
          if (!step.motorQuery || typeof evaluateMotor !== "function") return { defined:false, reason:"Для пакета електромашини потрібне узгодження робочої точки з батареєю." };
          const coupled = coupling.coupleBatteryMotorStep({ battery:{model:p.model,openCircuitVoltageV:p.voltageV,
            resistanceOhm:p.resistanceOhm,dischargeCurrentLimitA:p.dischargeA,chargeCurrentLimitA:p.chargeA,
            minTerminalVoltageV:p.voltageMinV,maxTerminalVoltageV:p.voltageMaxV}, dtS:step.dtS,
            chargeRoomEnergyJ:chargeRoomJ,auxiliaryPowerW:step.auxiliaryEnergyJ/step.dtS,
            requestedMotorElectricalPowerW:step.motorComponent.motorElectricalPowerW,
            requestedMotorShaftPowerW:step.motorComponent.motorShaftPowerW,
            evaluateMotor:limits=>evaluateMotor({...step.motorQuery,...limits}) });
          if(coupled.status!=="ok")return {defined:false,reason:`Батарея й електромашина не виконують профіль: ${coupled.reason}.`,timeS:elapsedS};
          acceptedMotor=coupled.outputs;
          powerW=acceptedMotor.batteryTerminalPowerW;chemicalW=acceptedMotor.batteryChemicalPowerW;
          lossW=acceptedMotor.batteryHeatPowerW;currentA=acceptedMotor.batteryCurrentA;terminalV=acceptedMotor.batteryTerminalVoltageV;
        } else if (p.model === "rint") {
          const U = p.voltageV, R = p.resistanceOhm;
          const iMax = Math.min(p.dischargeA, R > 0 ? U / (2 * R) : Infinity,
            R > 0 ? (U - p.voltageMinV) / R : Infinity);
          const iCharge = Math.min(p.chargeA, R > 0 ? (p.voltageMaxV - U) / R : Infinity);
          const maxW = (U - R * iMax) * iMax, minW = -(U + R * iCharge) * iCharge;
          if (requestedW > maxW + 1e-6) return { defined: false, reason: "Батарея не забезпечує потужність профілю в межах струму й напруги.", timeS: elapsedS, requestedW, availableW: maxW };
          powerW = Math.max(minW, requestedW);
          currentA = 2 * powerW / (U + Math.sqrt(Math.max(0, U * U - 4 * R * powerW)));
          chemicalW = U * currentA; lossW = R * currentA * currentA; terminalV = U - R * currentA;
        }
        // The ceiling is expressed as chemical energy, including internal heat.
        if (!acceptedMotor && chemicalW < 0 && -chemicalW * step.dtS > chargeRoomJ) {
          chemicalW = -chargeRoomJ / step.dtS;
          if (p.model === "rint") {
            currentA = chemicalW / p.voltageV; lossW = p.resistanceOhm * currentA * currentA;
            terminalV = p.voltageV - p.resistanceOhm * currentA;
          }
          powerW = chemicalW - lossW;
        }
        const depleted = chemicalW > 0 && usedJ + chemicalW * step.dtS >= availableJ;
        const dt = depleted ? Math.max(0, (availableJ - usedJ) / chemicalW) : step.dtS;
        usedJ += chemicalW * dt; terminalJ += powerW * dt; heatJ += lossW * dt;
        curtailedJ += Math.max(0, powerW - requestedW) * dt;
        if(acceptedMotor){motorLossJ+=acceptedMotor.mappedLossPowerW*dt;inverterLossJ+=acceptedMotor.additionalInverterLossPowerW*dt;
          additionalFrictionJ+=acceptedMotor.additionalFrictionShaftPowerW/step.motorQuery.mechanicalEfficiency*dt;}
        const travelledM = depleted && Number.isFinite(step.fromSpeedMs) && Number.isFinite(step.toSpeedMs)
          ? step.fromSpeedMs * dt + (step.toSpeedMs - step.fromSpeedMs) * dt * dt / (2 * step.dtS)
          : step.speedMs * dt;
        distanceM += travelledM; elapsedS += dt;
        if (rows && (profile.length === 0 || depleted || elapsedS - profile[profile.length - 1].timeS >= 30))
          profile.push({ timeS: elapsedS, distanceKm: distanceM / 1000,
            socPct: 100 * (p.socInitial - usedJ / capacityJ), remainingKwh: Math.max(0, (availableJ - usedJ) / 3.6e6),
            currentA, terminalV, ...(acceptedMotor ? {motor:acceptedMotor} : {}) });
        if (depleted) return { defined: distanceM > 0, reason: distanceM > 0 ? null : "Батарея вичерпана до початку руху.",
          distanceKm: distanceM / 1000, consumptionKwhKm: distanceM > 0 ? usedJ / 3.6e6 / (distanceM / 1000) : null,
          chemicalKwh: usedJ / 3.6e6, terminalKwh: terminalJ / 3.6e6, heatKwh: heatJ / 3.6e6,
          curtailedKwh: curtailedJ / 3.6e6, motorLossKwh:motorLossJ/3.6e6, inverterLossKwh:inverterLossJ/3.6e6, additionalFrictionKwh:additionalFrictionJ/3.6e6,
          coupling: integration.motorComponentPackage ? {moduleId:coupling.moduleId,version:coupling.moduleVersion,modelId:coupling.modelId,voltageCompatibility:"Only assessed when the package declares a voltage-speed envelope; peak voltage alone is not a minimum operating voltage."} : null, elapsedS, cycleCount: cycleCount + 1, profile };
      }
      if (usedJ - before <= 1e-6) return { defined: false, reason: "Профіль не витрачає додатної енергії; скінченний запас ходу не визначено." };
    }
    return { defined: false, reason: "Для цього профілю вичерпання батареї потребує понад 10 000 повторень." };
  }

  function calculate({ state, cycleResult, payloadKg, integrate, evaluate, evaluateMotor }) {
    const massKg = state.defined ? state.curbMassKg + payloadKg : null;
    const massOK = state.defined ? massKg <= state.settings.grossMassLimitKg + 1e-7 : null;
    const base = { ...state, payloadKg, massKg, massOK, range: null, rangeKm: null, choices: null };
    if (!state.enabled || !state.defined) return base;
    const p = state.settings;
    if (!cycleResult?.integration?.defined || cycleResult?.speedCompatibility?.compatible === false)
      return { ...base, reason: cycleResult?.integration?.reason || cycleResult?.speedCompatibility?.note || "Виберіть сумісний профіль швидкості й заповніть параметри опору та приводу." };
    const cache = new Map();
    function variant(energyKwh, keepRows = false) {
      const key = `${energyKwh}/${keepRows}`;
      if (cache.has(key)) return cache.get(key);
      const settings = { ...p, energyKwh, grossKwh: null };
      const worksheet = evaluate(settings);
      const massKg = worksheet.curbMassKg + payloadKg;
      const integral = energyKwh === p.energyKwh ? cycleResult.integration : integrate(massKg);
      const range = traverse(integral, settings, worksheet.tripEnergyKwh, { rows: keepRows, evaluateMotor });
      const result = { energyKwh, packMassKg: worksheet.packMassKg, massKg,
        payloadCapacityKg: worksheet.payloadCapacityKg, massOK: massKg <= p.grossMassLimitKg + 1e-7,
        rangeKm: range.defined ? range.distanceKm : null, consumptionKwh100km: range.defined ? range.consumptionKwhKm * 100 : null,
        feasible: range.defined, reason: range.reason, range };
      cache.set(key, result); return result;
    }
    const current = variant(p.energyKwh, true);
    const rangeWorksheet = current.feasible ? evaluate({ ...p, consumptionKwhKm: current.range.consumptionKwhKm }, { range: true }) : null;
    const ceilingKwh = Math.min(3000, Math.max(0, (p.grossMassLimitKg - p.baseMassKg - payloadKg) * p.specificEnergyWhKg / 1000));
    let choices = null;
    if (cycleResult.basis === "design" && ceilingKwh > 0) {
      const samples = Array.from({ length: 25 }, (_, i) => variant(ceilingKwh * (i + 1) / 25));
      const feasible = samples.filter(x => x.massOK && x.feasible);
      const best = feasible.reduce((a, x) => !a || x.rangeKm > a.rangeKm ? x : a, null);
      const first = samples.find(x => x.massOK && x.feasible && x.rangeKm >= p.targetRangeKm);
      let minimum = null;
      if (first) {
        let hi = first.energyKwh, lo = samples[samples.indexOf(first) - 1]?.energyKwh || 0;
        for (let i = 0; i < 18; i += 1) {
          const mid = (lo + hi) / 2, x = variant(mid);
          if (x.massOK && x.feasible && x.rangeKm >= p.targetRangeKm) hi = mid; else lo = mid;
        }
        const rounded = Math.ceil(hi * 100) / 100;
        const checked = variant(Math.min(ceilingKwh, rounded));
        if (checked.massOK && checked.feasible && checked.rangeKm >= p.targetRangeKm) minimum = checked;
      }
      choices = { minimum, maximumChecked: best, ceilingKwh, samples,
        method: "25 mass-constrained samples; first target bracket refined; capacities rounded up to 0.01 kWh and rechecked." };
    }
    return { ...state, payloadKg, massKg: current.massKg, massOK: current.massOK,
      range: current.range, rangeWorksheet, choices, reason: current.reason,
      rangeKm: current.feasible && current.massOK && rangeWorksheet?.defined ? rangeWorksheet.rangeKm : null,
      sizingReason: cycleResult.basis !== "design" ? "Підбір за змінною масою потребує проєктного опору: виміряний вибіг задано для однієї маси." : ceilingKwh <= 0 ? "Після резервування навантаження немає маси для батареї." : null };
  }

  return Object.freeze({ DEFAULTS, settings, validate, prepare, traverse, calculate });
}
