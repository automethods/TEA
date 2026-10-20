"use strict";

export function createLayoutCalculator({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;

  // Одна перевірка числа на весь проєкт: Number() приймає null, true й "" і
  // мовчки робить із них 0 та 1. Тут це важило двічі: булеве значення
  // проходило як «одна вісь», а ще воно перемикало повний привід, бо
  // Number(true) = 1 ≥ 0,035.
  const { finiteNumber } = (function loadNumeric() {
    const scope = typeof window === "object" ? window : globalThis;
    if (!scope.VehicleNumeric && typeof module === "object" && module.exports) {
      require("./numeric.js");
    }
    return scope.VehicleNumeric;
  })();

  const GOODS_LIMITS_T = {
    state: [18, 25, 32],
    local: [14, 21, 24]
  };
  const BUS_EDUCATIONAL_LIMITS_T = {
    state: [19, 29, 30],
    local: [13, 16, 22]
  };
  const SINGLE_AXLE_LIMIT_T = {
    state: 11.5,
    local: 7
  };

  // The single-axle values of ПДР 22.5 are a road-network capacity limit. They
  // govern goods vehicles (N1–N3) and buses (M3), whose axle loads approach
  // them. For M1/M2 they never bind — an M1 axle carries roughly 1 t against a
  // 7 t limit — so comparing against them and printing "попередньо відповідає"
  // would report a check that was never performed (rule 4). The constraint that
  // actually governs a passenger car is the load rating of its own tyres, which
  // this application does not hold; it is named, not invented.
  const TYRE_LIMITED_CATEGORIES = new Set(["M1", "M2"]);

  function axleLoadLimitBasis(category, roadNetwork) {
    const network = roadNetwork === "local" ? "local" : "state";
    if (TYRE_LIMITED_CATEGORIES.has(category)) {
      return { applies: false, limitTonnes: null, basis: "tyre-load-rating" };
    }
    return {
      applies: true,
      limitTonnes: SINGLE_AXLE_LIMIT_T[network],
      basis: "pdr-22-5-single-axle"
    };
  }

  function axleCheckStatus(row) {
    if (!row.limitApplies) return null;
    const base = row.withinLimit ? "попередньо відповідає" : "перевищення";
    return row.groupedRearAxle ? `${base}; уточнити за B₁` : base;
  }

  function minimumAxleCount(grossMassKg, category, roadNetwork) {
    const network = roadNetwork === "local" ? "local" : "state";
    if (category === "M1" || category === "M2") {
      return {
        defined: true,
        count: 2,
        limitsTonnes: [],
        limitTonnes: null,
        exceedsLimit: false,
        provisionalPassengerLimits: false,
        selectionMethod: "passenger-layout"
      };
    }
    const limits = category === "M3"
      ? BUS_EDUCATIONAL_LIMITS_T[network]
      : GOODS_LIMITS_T[network];
    // Кількість осей вибирають ЗА МАСОЮ, тому маси, якої немає, тут досить,
    // щоб відмовитись. `|| 0` робив із неї нуль, нуль проходив під найменшу
    // межу, і документ радив дві осі вантажівці будь-якої ваги.
    const mass = finiteNumber(grossMassKg);
    if (mass === null || mass <= 0) {
      return {
        defined: false,
        count: null,
        limitsTonnes: limits,
        limitTonnes: null,
        reason: "Кількість осей вибирають за повною масою, а її не задано."
      };
    }
    const grossTonnes = mass / 1000;
    const forcedTwoAxles = category === "N1";
    const matchingLimit = limits.findIndex(limit => grossTonnes <= limit);
    const count = forcedTwoAxles
      ? 2
      : (matchingLimit === -1 ? 4 : matchingLimit + 2);
    return {
      defined: true,
      count,
      limitsTonnes: [...limits],
      limitTonnes: limits[count - 2],
      exceedsLimit: grossTonnes > limits.at(-1),
      provisionalPassengerLimits: category === "M3",
      selectionMethod: category === "M3" ? "provisional-passenger" : "pdr-goods"
    };
  }

  function formulaFor(category, axleCount, fullDrive) {
    const wheels = axleCount * 2;
    if (fullDrive) return `${wheels}x${wheels}`;
    return `${wheels}x2`;
  }

  function tyreLayout(category, axleCount, fullDrive) {
    if (fullDrive || category === "M1") return Array(axleCount).fill(2);
    return [2, ...Array(axleCount - 1).fill(4)];
  }

  function describeFormula(formula, category) {
    const match = /^([468])x([2468])$/.exec(formula);
    if (!match) return null;
    const axleCount = finiteNumber(match[1]) / 2;
    const drivenAxleCount = finiteNumber(match[2]) / 2;
    const fullDrive = axleCount === drivenAxleCount;
    const tyresPerAxle = tyreLayout(category, axleCount, fullDrive);
    return {
      axleCount,
      drivenAxleCount,
      fullDrive,
      tyresPerAxle,
      tyreCount: tyresPerAxle.reduce((sum, count) => sum + count, 0)
    };
  }

  // Які саме осі ведучі.
  //
  // Скільки їх — каже сама колісна формула: 6×4 це дві ведучі осі з трьох, і
  // сперечатися з нею нема про що. Чого вона не каже — котрі дві. Для 4×2 це
  // різниця між передньо- і задньопривідним автомобілем, і вона змінює зчіпну
  // вагу вдвічі, бо G_зч рахують по осях, які справді штовхають.
  //
  // Тому число ведучих осей звідси не питають, а їхнє положення — питають, і
  // не вгадують: до відповіді розрахунок не має підстави, а не має типового
  // значення. Задній привід у курсовому звичайний, але «звичайний» — не те
  // саме, що «прийнятий автором».
  // «1 ведучих осей» — не українська. Число керує відмінком, і формулювання
  // живе тут одне на всіх, бо його читають і у відмові, і в записі рішення:
  // два однакові речення в різних файлах розходяться першими.
  function drivenCountPhrase(driven, total) {
    const noun = driven === 1
      ? "ведучу вісь"
      : (driven < 5 ? "ведучі осі" : "ведучих осей");
    return `${driven} ${noun} із ${total}`;
  }

  function drivenAxleNumbers({ axleCount, drivenAxleCount, position }) {
    const total = finiteNumber(axleCount);
    const driven = finiteNumber(drivenAxleCount);
    if (!Number.isInteger(total) || total < 1) {
      return { defined: false, reason: "Колісну формулу не прийнято." };
    }
    if (!Number.isInteger(driven) || driven < 1 || driven > total) {
      return {
        defined: false,
        reason: `Колісна формула подає ${driven} ведучих осей при ${total} осях.`
      };
    }
    const all = Array.from({ length: total }, (unused, index) => index + 1);
    // Повний привід питання не лишає: ведучі всі, і питати нема чого.
    if (driven === total) {
      return {
        defined: true, numbers: all, position: "all", impliedByFormula: true,
        countPhrase: drivenCountPhrase(driven, total),
        axleCount: total, drivenAxleCount: driven
      };
    }
    if (position !== "front" && position !== "rear") {
      return {
        defined: false,
        reason: `Формула подає ${drivenCountPhrase(driven, total)}, але не каже, `
          + `${driven === 1 ? "котру" : "котрі"}. Укажіть, `
          + `${driven === 1 ? "спереду вона чи ззаду" : "спереду вони чи ззаду"}.`
      };
    }
    // Ведучі осі беруться суцільною групою з одного кінця: саме так стоїть
    // візок або міст. Розкидані через вісь ведучі осі трапляються хіба в
    // спеціальній техніці, і такий випадок довелося б задавати переліком.
    return {
      defined: true,
      numbers: position === "front" ? all.slice(0, driven) : all.slice(total - driven),
      position,
      impliedByFormula: false,
      countPhrase: drivenCountPhrase(driven, total),
      axleCount: total, drivenAxleCount: driven
    };
  }

  function recommend({ grossMassKg, category, roadNetwork, surface, rollingResistanceF0 }) {
    const network = roadNetwork === "local" ? "local" : "state";
    const fullDrive = surface?.fullDrive === null || surface?.fullDrive === undefined
      ? finiteNumber(rollingResistanceF0) >= 0.035
      : surface.fullDrive;
    const axle = minimumAxleCount(grossMassKg, category, network);
    // Без маси кількість осей не рекомендують. Межі, які залежать лише від
    // мережі доріг, лишаються — вони від маси не залежать.
    if (axle.defined === false) {
      return {
        defined: false,
        reason: axle.reason,
        roadNetwork: network,
        axleCount: null,
        drivenAxleCount: null,
        formula: null,
        fullDrive,
        tyresPerAxle: [],
        tyreCount: null,
        limitsTonnes: axle.limitsTonnes,
        massLimitTonnes: null,
        singleAxleLimitTonnes: SINGLE_AXLE_LIMIT_T[network],
        axleLoadLimit: axleLoadLimitBasis(category, network),
        exceedsLimit: null,
        provisionalPassengerLimits: category === "M3",
        selectionMethod: null
      };
    }
    const tyresPerAxle = tyreLayout(category, axle.count, fullDrive);
    return {
      defined: true,
      roadNetwork: network,
      axleCount: axle.count,
      drivenAxleCount: fullDrive ? axle.count : 1,
      formula: formulaFor(category, axle.count, fullDrive),
      fullDrive,
      tyresPerAxle,
      tyreCount: tyresPerAxle.reduce((sum, count) => sum + count, 0),
      limitsTonnes: axle.limitsTonnes,
      massLimitTonnes: axle.limitTonnes,
      singleAxleLimitTonnes: SINGLE_AXLE_LIMIT_T[network],
      axleLoadLimit: axleLoadLimitBasis(category, network),
      exceedsLimit: axle.exceedsLimit,
      provisionalPassengerLimits: axle.provisionalPassengerLimits,
      selectionMethod: axle.selectionMethod
    };
  }

  return {
    GOODS_LIMITS_T,
    BUS_EDUCATIONAL_LIMITS_T,
    SINGLE_AXLE_LIMIT_T,
    minimumAxleCount,
    axleLoadLimitBasis,
    axleCheckStatus,
    describeFormula,
    drivenCountPhrase,
    drivenAxleNumbers,
    recommend
  };
}
