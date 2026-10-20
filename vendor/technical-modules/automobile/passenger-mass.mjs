"use strict";

export function createPassengerMass({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;

  // Commission Regulation (EU) No 1230/2012, Annex I, Part B, point 2.2.3.8.
  // These are type-approval requirements for M2/M3, not engineering custom.
  const CREW_MASS_KG = 75;

  const BUS_CLASSES = [
    {
      id: "class-i",
      label: "Клас I / A — міський, з місцями для стояння",
      passengerMassKg: 68,
      standingAreaM2: 0.125,
      standing: true
    },
    {
      id: "class-ii",
      label: "Клас II — міжміський, обмежені місця для стояння",
      passengerMassKg: 71,
      standingAreaM2: 0.15,
      standing: true
    },
    {
      id: "class-iii",
      label: "Клас III / B — туристичний, лише сидячі місця",
      passengerMassKg: 71,
      standingAreaM2: null,
      standing: false
    }
  ];

  const BUS_CATEGORIES = new Set(["M2", "M3"]);

  function passengerMassFor(category, busClassId) {
    if (!BUS_CATEGORIES.has(category)) return CREW_MASS_KG;
    const busClass = BUS_CLASSES.find(item => item.id === busClassId);
    return busClass ? busClass.passengerMassKg : CREW_MASS_KG;
  }

  function luggageAllowanceKg(baggageVolumeM3) {
    const volume = Number(baggageVolumeM3);
    return Number.isFinite(volume) && volume > 0 ? 100 * volume : 0;
  }

  return { CREW_MASS_KG, BUS_CLASSES, BUS_CATEGORIES, passengerMassFor, luggageAllowanceKg };
}
