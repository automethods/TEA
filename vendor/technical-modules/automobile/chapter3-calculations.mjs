"use strict";

export function createChapter3Calculations({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;

  // Одна перевірка числа на весь проєкт: Number() приймає null, true й "" і
  // мовчки робить із них 0 та 1, а Number.isFinite їх пропускає.
  const { finiteNumber } = (function loadNumeric() {
    const scope = typeof window === "object" ? window : globalThis;
    if (!scope.VehicleNumeric && typeof module === "object" && module.exports) {
      require("./numeric.js");
    }
    return scope.VehicleNumeric;
  })();

  const STANDARD_GRAVITY = 9.81;

  function calculateMasses(usefulLoadKg, tareRatioQ) {
    const curbMassKg = tareRatioQ * usefulLoadKg;
    return {
      curbMassKg,
      grossMassKg: curbMassKg + usefulLoadKg
    };
  }

  // Приймає коефіцієнт опору коченню, який діє в розрахунковому режимі. Для
  // режиму максимальної швидкості це f(V_max) за рівнянням (2.1), а не f₀.
  function calculateRoadResistance(rollingResistanceF, gradeAngleRad) {
    return rollingResistanceF * Math.cos(gradeAngleRad) + Math.sin(gradeAngleRad);
  }

  function calculateGrossWeightForce(grossMassKg) {
    return grossMassKg * STANDARD_GRAVITY / 1000;
  }

  // Положення центра мас за рівняннями (3.6) і (3.7).
  //
  // Для двовісного автомобіля a = G2·B/Ga; для тривісного до моменту задньої
  // осі додається момент проміжної, віддаленої на B1. Позначення збігаються з
  // незмінною габаритною схемою: B — база, B1 — відстань між задніми осями.
  // Обидва вирази — рівняння
  // моментів відносно передньої осі, тому вони дають ВІДСТАНЬ ДО ЦЕНТРА МАС,
  // а не перевіряють її: частки k_i прийнято раніше, і саме вони визначають a.
  //
  // Повертає null там, де бракує вхідних даних, а не нуль: центр мас на
  // передній осі — це фізичне твердження, і воно не має з'являтися лише тому,
  // що користувач ще не ввів колісну базу.
  function calculateCentreOfMass({ axleForcesKn, grossWeightForceKn, wheelbaseM, rearSpacingM }) {
    const forces = Array.isArray(axleForcesKn) ? axleForcesKn : [];
    const ga = finiteNumber(grossWeightForceKn);
    const wheelbase = finiteNumber(wheelbaseM);
    if (!Number.isFinite(ga) || ga <= 0) return null;
    if (!Number.isFinite(wheelbase) || wheelbase <= 0) return null;
    if (forces.length < 2) return null;

    if (forces.length === 2) {
      const a = forces[1] * wheelbase / ga;
      return { a, b: wheelbase - a, axles: 2, equation: "3.6", rearSpacingM: null };
    }
    const spacing = finiteNumber(rearSpacingM);
    if (!Number.isFinite(spacing) || spacing <= 0) return null;
    // Третя вісь віддалена від першої задньої на B1, тому її момент береться
    // з плечем (B + B1). Осі понад третю сюди не входять: джерело подає
    // рівняння лише для дво- і тривісної схем.
    const a = (forces[1] * wheelbase + forces[2] * (wheelbase + spacing)) / ga;
    return { a, b: wheelbase - a, axles: 3, equation: "3.7", rearSpacingM: spacing };
  }

  // Крок для положення центра мас. Досі підстановку (3.6)/(3.7) складав
  // рендерер, тому в документі число було, а розрахунку — ні: ані траси, ані
  // рядка у звіті. Вираз тепер один, і живе тут.
  // Підстановка в (3.8). Її показує і документ, і звіт, тому вираз один.
  // Досі рядок обривався на синусі й не називав самого ψ — читач бачив дії
  // без результату.
  // Підстановка колісної формули. Кожен доданок з'являється лише тоді, коли
  // величина за ним відома: інакше читач побачив би «=undefined» замість
  // числа, а це гірше, ніж не побачити нічого.
  function wheelLayoutSubstitution({ selectionMethod, recommendedAxleCount,
    grossMassKg, axleFormula }) {
    const adopted = typeof axleFormula === "string" && axleFormula
      ? `;\\quad ${axleFormula.replace("x", "\\times")}` : "";
    if (selectionMethod === "passenger-layout") {
      return `n_{\\mathrm{осей}}=2${adopted}`;
    }
    const massTonnes = Number.isFinite(grossMassKg) && grossMassKg > 0
      ? (grossMassKg / 1000).toFixed(3) : null;
    // Без маси немає й нерівності: «0.000 ≤ M_max(n)» справджувалося б завжди
    // і радило б дві осі будь-якій вантажівці — та сама вада, яку вже
    // виправляли в самому правилі.
    const rule = massTonnes === null
      ? "n_{\\mathrm{осей}}=\\min\\{n:M_a\\le M_{\\max}(n)\\}"
      : `n_{\\mathrm{осей}}=\\min\\{n:${massTonnes}\\le M_{\\max}(n)\\}`;
    const count = Number.isFinite(recommendedAxleCount)
      ? `=${recommendedAxleCount}` : "";
    return `${rule}${count}${adopted}`;
  }

  function buildRoadResistanceSubstitution({ rollingResistanceF, gradeAngleRad, roadResistance, texNumber }) {
    const degrees = gradeAngleRad * 180 / Math.PI;
    return `\\psi=${texNumber(rollingResistanceF, 4)}\\cos(${texNumber(degrees, 2)}^\\circ)`
      + `+\\sin(${texNumber(degrees, 2)}^\\circ)=${texNumber(roadResistance, 4)}`;
  }

  function buildCentreOfMassStep(context) {
    const { centre, axleForcesKn, grossWeightForceKn, wheelbaseM, texNumber } = context;
    const twoAxle = centre.axles === 2;
    const substitution = twoAxle
      ? `a=\\frac{${texNumber(axleForcesKn[1], 2)}\\cdot${texNumber(wheelbaseM, 2)}}`
        + `{${texNumber(grossWeightForceKn, 2)}}=${texNumber(centre.a, 3)}\\;\\mathrm{м}`
      : `a=\\frac{${texNumber(axleForcesKn[1], 2)}\\cdot${texNumber(wheelbaseM, 2)}`
        + `+${texNumber(axleForcesKn[2], 2)}\\cdot${texNumber(wheelbaseM + centre.rearSpacingM, 2)}}`
        + `{${texNumber(grossWeightForceKn, 2)}}=${texNumber(centre.a, 3)}\\;\\mathrm{м}`;
    return {
      id: "centre-of-mass",
      title: "Положення центра мас за базою",
      purpose: "Locate the centre of mass along the wheelbase from the adopted axle loads.",
      output: {
        id: "value.centre-of-mass-front",
        symbol: "a",
        label: "Distance from the front axle to the centre of mass",
        valueType: "quantity",
        canonicalUnit: "m"
      },
      expression: twoAxle
        ? "G_2 * B / G_a"
        : "(G_2 * B + G_3 * (B + B_1)) / G_a",
      dependencies: [
        // Осьові сили несуть у собі k1, тому окремо його оголошувати не треба:
        // залежність іде ланцюгом, а не в обхід нього.
        "value.axle-forces",
        "value.gross-weight-force",
        "input.wheelbase",
        ...(twoAxle ? [] : ["input.rear-axle-spacing"])
      ],
      equationNumber: centre.equation,
      formulaTex: twoAxle
        ? "a=\\frac{G_2B}{G_a},\\qquad b=B-a"
        : "a=\\frac{G_2B+G_3(B+B_1)}{G_a},\\qquad b=B-a",
      substitutionTex: `${substitution};\\quad b=${texNumber(wheelbaseM, 2)}`
        + `-${texNumber(centre.a, 3)}=${texNumber(centre.b, 3)}\\;\\mathrm{м}`,
      result: { value: centre.a, canonicalUnit: "m", displayUnit: "м" },
      method: twoAxle ? "course-two-axle-moment" : "course-three-axle-moment",
      sourceRefs: ["source.method.course"],
      assumptions: [
        "Axle loads are the preliminary shares of chapter 3, not weighed values.",
        twoAxle
          ? "Moments are taken about the front axle of a two-axle vehicle."
          : "The third axle acts at (B + B_1) from the front axle; the source gives no equation beyond three axles."
      ],
      // Межі застосування читач БАЧИТЬ — вони друкуються у звіті й у
      // методичних вказівках, а ті українські. Внутрішні assumptions вище
      // лишаються англійськими: на папір вони не йдуть.
      limitations: [
        "Результат зсувається разом із прийнятою часткою k₁ і лишається "
        + "попереднім, доки не викреслено компоновальну схему."
      ]
    };
  }

  function buildCalculationSteps(context) {
    const {
      load,
      qBasis,
      tareRatioQ,
      qMethod,
      curbMassKg,
      grossMassKg,
      grossWeightForceKn,
      axleLoadEstimate,
      acceptedLayout,
      prototypeSourceRef,
      layoutRecommendation,
      axleFormula,
      rollingResistanceF,
      speedCorrectionStep,
      gradeAngleRad,
      roadResistance,
      texNumber
    } = context;
    const usefulLoadFormula = load.mode === "passengers"
      ? "M_{\\mathrm{кор}}=M_{\\mathrm{п}}+M_{\\mathrm{багаж}}"
      : load.mode === "cargo"
        ? "M_{\\mathrm{кор}}=M_{\\mathrm{в}}"
        : "M_{\\mathrm{кор}}=M_{\\mathrm{п}}+M_{\\mathrm{багаж}}+M_{\\mathrm{в}}";
    const usefulLoadSubstitution = load.mode === "passengers"
      ? `M_{\\mathrm{кор}}=${texNumber(load.passengerMass, 0)}+${texNumber(load.luggage, 0)}=${texNumber(load.total, 0)}`
      : load.mode === "cargo"
        ? `M_{\\mathrm{кор}}=${texNumber(load.cargo, 0)}`
        : `M_{\\mathrm{кор}}=${texNumber(load.passengerMass, 0)}+${texNumber(load.luggage, 0)}+${texNumber(load.cargo, 0)}=${texNumber(load.total, 0)}`;
    const axleForceTrace = axleLoadEstimate
      ? axleLoadEstimate.rows
        .map(row => `G_${row.axleNumber}=${texNumber(row.share, 3)}\\cdot${texNumber(grossWeightForceKn, 2)}=${texNumber(row.share * grossWeightForceKn, 2)}`)
        .join(";\\quad ")
      : "";

    // Equation (2.1) belongs to chapter 2, but it feeds the road resistance
    // below, so it is emitted first: a reader must see f derived before it
    // is used (TECHNICAL_WRITING_RULES.md section 1). It is omitted at or
    // below 50 km/h it carries no equation number and displays f = f0
    // instead of the relation, because the source states the relation only
    // for 50-150 km/h. The VALUE always exists -- road resistance depends on
    // it at every speed -- so the step is always emitted; only its formula is
    // withheld.
    return [
      ...(speedCorrectionStep ? [speedCorrectionStep] : []),
      {
        id: "useful-load",
        title: "Визначення корисного навантаження",
        purpose: "Determine the useful-load mass for the selected operating mode.",
        output: {
          id: "value.useful-load",
          symbol: "M_{\\mathrm{кор}}",
          label: "Useful-load mass",
          valueType: "quantity",
          canonicalUnit: "kg"
        },
        expression: load.mode === "passengers"
          ? "peopleIncludingDriver * assumedPersonMassKg + luggageMassKg"
          : load.mode === "cargo"
            ? "cargoMassKg"
            : "peopleIncludingDriver * assumedPersonMassKg + luggageMassKg + cargoMassKg",
        dependencies: load.mode === "passengers"
          ? ["input.people-including-driver", "input.assumed-person-mass", "input.luggage-mass"]
          : load.mode === "cargo"
            ? ["input.cargo-mass"]
            : [
                "input.people-including-driver",
                "input.assumed-person-mass",
                "input.luggage-mass",
                "input.cargo-mass"
              ],
        equationNumber: "3.1",
        formulaTex: usefulLoadFormula,
        substitutionTex: usefulLoadSubstitution,
        result: { value: load.total, canonicalUnit: "kg", displayUnit: "кг" },
        method: load.mode,
        // Набір прототипів — звідки запис; видання — звідки сам запис. Друге
        // без першого губить том, перше без другого називає томом усю базу.
        sourceRefs: [
          ...(load.split?.sourced.length
            ? ["source.dataset.vehicle-prototypes",
                ...(prototypeSourceRef ? [prototypeSourceRef] : [])]
            : []),
          ...(!load.split || load.split.adopted.length ? ["source.project-input"] : [])
        ],
        readerNotes: load.mode === "cargo" && load.split?.sourced.includes("total")
          ? [`Корисне навантаження ${load.total.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} кг `
              + "взято з паспортних даних прототипу."]
          : load.mode === "combined" && load.split ? [
              `Сумарні ${texNumber(load.total, 0)} кг і ${texNumber(load.people, 0)} осіб `
                + "разом із водієм взято з прототипу; "
                + `${texNumber(load.luggage, 0)} кг багажу та ${texNumber(load.cargo, 0)} кг вантажу `
                + "прийнято автором, бо джерело такого поділу не подає."
            ]
          : []
      },
      {
        id: "curb-mass",
        title: "Визначення власної маси",
        purpose: "Estimate preliminary curb mass from useful load and the adopted tare coefficient.",
        output: {
          id: "value.curb-mass",
          symbol: "M_0",
          label: "Preliminary curb mass",
          valueType: "quantity",
          canonicalUnit: "kg"
        },
        expression: "q * M_useful",
        dependencies: ["decision.tare-coefficient", "value.useful-load"],
        equationNumber: "3.3",
        formulaTex: "M_0=qM_{\\mathrm{кор}}",
        substitutionTex: `M_0=${texNumber(tareRatioQ, 3)}\\cdot${texNumber(qBasis.massKg, 0)}\\approx${texNumber(curbMassKg, 0)}`,
        result: { value: curbMassKg, canonicalUnit: "kg", displayUnit: "кг" },
        method: qMethod,
        // (3.3) і (3.4) — друковані рівняння тієї самої методики, що й (3.5)
        // поруч, і мусять посилатися на неї так само. Порожній перелік джерел
        // означав, що в документі стоїть рівняння з номером і без походження;
        // помітила це перевірка методичних вказівок, яка вимагає джерела для
        // кожного описаного розрахунку.
        sourceRefs: ["source.method.course"]
      },
      {
        id: "gross-mass",
        title: "Визначення повної маси",
        purpose: "Determine gross vehicle mass from curb mass and useful load.",
        output: {
          id: "value.gross-mass",
          symbol: "M_a",
          label: "Gross vehicle mass",
          valueType: "quantity",
          canonicalUnit: "kg"
        },
        expression: "M_0 + M_useful",
        dependencies: ["value.curb-mass", "value.useful-load"],
        equationNumber: "3.4",
        formulaTex: "M_a=M_0+M_{\\mathrm{кор}}",
        substitutionTex: `M_a\\approx${texNumber(curbMassKg, 0)}+${texNumber(qBasis.massKg, 0)}=${texNumber(grossMassKg, 0)}`,
        result: { value: grossMassKg, canonicalUnit: "kg", displayUnit: "кг" },
        sourceRefs: ["source.method.course"]
      },
      // Дві дії — дві величини. Повна сила тяжіння не залежить від того, як її
      // розподілили по осях, а осьові сили залежать від k1. Поки обидві жили в
      // одному кроці під одним ідентифікатором, споживач осьових сил не міг
      // послатися на них і не оголошував k1 у своїх залежностях.
      {
        id: "gross-weight-force",
        title: "Повна сила тяжіння автомобіля",
        purpose: "Convert the gross mass into the weight force the axles carry.",
        output: {
          id: "value.gross-weight-force",
          symbol: "G_a",
          label: "Gross vehicle weight force",
          valueType: "quantity",
          canonicalUnit: "kN"
        },
        expression: "M_a * standardGravity / 1000",
        dependencies: ["value.gross-mass"],
        equationNumber: "3.5",
        formulaTex: "G_a=M_ag",
        substitutionTex: `G_a=${texNumber(grossMassKg, 0)}\\cdot9{,}81/1000=${texNumber(grossWeightForceKn, 2)}\\;\\mathrm{кН}`,
        result: { value: grossWeightForceKn, canonicalUnit: "kN", displayUnit: "кН" },
        sourceRefs: ["source.method.course"],
        assumptions: ["Standard gravity is 9.81 m/s²."]
      },
      {
        id: "axle-distribution",
        title: "Попередній розподіл навантаження по осях",
        purpose: "Distribute the weight force between the axles by the adopted shares.",
        output: {
          id: "value.axle-forces",
          symbol: "G_i",
          label: "Preliminary axle weight forces",
          valueType: "list",
          canonicalUnit: "kN"
        },
        expression: "k_i * G_a",
        dependencies: ["value.gross-weight-force", "decision.wheel-layout", "decision.front-axle-share"],
        equationNumber: "3.5",
        formulaTex: "k_i=\\frac{1-k_1}{n-1},\\qquad G_i=k_iG_a",
        substitutionTex: axleForceTrace,
        // Список, оголошений як список: значення структуроване, а не зліплене в
        // рядок. Форматування — справа звіту, а не канонічного документа.
        result: {
          value: (axleLoadEstimate?.rows || []).map(row => ({
            axleNumber: row.axleNumber,
            forceKn: row.share * grossWeightForceKn
          })),
          canonicalUnit: "kN",
          displayUnit: "кН"
        },
        method: axleLoadEstimate?.method || null,
        sourceRefs: ["source.method.course"],
        assumptions: [
          "Axle shares are preliminary until vehicle geometry is defined."
        ]
      },
      {
        id: "road-resistance",
        title: "Сумарний опір дороги",
        purpose: "Determine the dimensionless total road-resistance coefficient.",
        output: {
          id: "value.road-resistance",
          symbol: "\\psi",
          label: "Total road-resistance coefficient",
          valueType: "number",
          canonicalUnit: null
        },
        // f — коефіцієнт опору коченню при максимальній швидкості за
        // рівнянням (2.1); за швидкості до 50 км/год він дорівнює f₀.
        expression: "f * cos(alpha) + sin(alpha)",
        dependencies: ["value.rolling-resistance-at-speed", "input.road-grade"],
        equationNumber: "3.8",
        formulaTex: "\\psi=f\\cos\\alpha+\\sin\\alpha",
        substitutionTex: buildRoadResistanceSubstitution({
          rollingResistanceF, gradeAngleRad, roadResistance, texNumber
        }),
        result: { value: roadResistance, canonicalUnit: null, displayUnit: "" },
        sourceRefs: ["source.road-surface.selected", "source.method.birulya-rolling-resistance"]
      },
      {
        id: "wheel-layout",
        title: "Колісна формула та шини",
        purpose: "Select the preliminary axle and tyre layout for mass and road conditions.",
        output: {
          id: "value.tyre-count",
          symbol: "n_{\\mathrm{шин}}",
          label: "Tyre count",
          valueType: "integer",
          canonicalUnit: "1"
        },
        expression: "wheelLayoutRule(M_a, vehicleCategory, roadNetwork, roadSurface, f0)",
        dependencies: [
          "value.gross-mass",
          "input.vehicle-category",
          "input.road-network",
          "input.road-surface",
          "input.rolling-resistance",
          "decision.wheel-layout"
        ],
        equationNumber: null,
        formulaTex: layoutRecommendation.selectionMethod === "passenger-layout"
          ? "n_{\\mathrm{осей}}=2"
          : "n_{\\mathrm{осей}}=\\min\\{n:M_a\\le M_{\\max}(n)\\}",
        // Підстановка друкує лише те, що справді відоме.
        //
        // Доти в неї підставляли layoutRecommendation.axleCount і axleFormula
        // беззастережно. Правило ПДР відмовляється називати кількість осей без
        // повної маси й повертає null, а тривісна фікстура підкладала
        // рекомендацію без цього поля зовсім, — і до читача доходило
        // «n_осей=min{n:1.747≤M_max(n)}=undefined». Число, якого немає, тепер
        // не друкують: лишається правило, за яким його добирають.
        substitutionTex: wheelLayoutSubstitution({
          selectionMethod: layoutRecommendation.selectionMethod,
          recommendedAxleCount: layoutRecommendation.axleCount,
          grossMassKg,
          axleFormula
        }),
        result: {
          value: acceptedLayout?.tyreCount ?? null,
          canonicalUnit: "1",
          displayUnit: "шин"
        },
        method: layoutRecommendation.selectionMethod,
        sourceRefs: ["source.regulation.ua-traffic-rules-22.5", "source.method.course"],
        assumptions: ["This is a preliminary layout rather than a final axle-load certification."]
      }
    ];
  }

  return Object.freeze({
    calculateCentreOfMass,
    buildCentreOfMassStep,
    buildRoadResistanceSubstitution,
    wheelLayoutSubstitution,
    STANDARD_GRAVITY,
    calculateMasses,
    calculateRoadResistance,
    calculateGrossWeightForce,
    buildCalculationSteps
  });
}
