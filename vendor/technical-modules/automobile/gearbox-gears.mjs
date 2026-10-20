"use strict";

// Розділ 10.2 — модуль зубів і перевірка на згин.
//
// Формулу обидві книжки друкують ту саму: m = 10³√(2M_розр cosβ′/(π z y в k_σ)),
// і таблиці коефіцієнта форми зуба, допустимих напруг та ряду модулів у них
// збігаються числом у число. Розходяться вони в ДВОХ місцях, і обидва
// прочитані з друку:
//
//   • кут нахилу зубів β′ — курсова методичка дає 25…35° для легкових і
//     20…30° для вантажних; Опанасюк розрізняє ще й схему коробки:
//     тривальна легкового 22…34°, двовальна легкового 20…25°, вантажний і
//     автобус 18…26°;
//   • ширина шестерні в — у вантажних 20…25 мм проти 20…40 мм.
//
// Тому профіль тут потрібен так само, як у розділі 9.
export function createGearboxGears({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;


  // Коефіцієнт форми зуба. Обидві книжки друкують ту саму таблицю 12.
  const TOOTH_FORM_FACTOR = Object.freeze([
    { equivalentTeeth: 16, factor: 0.101 },
    { equivalentTeeth: 17, factor: 0.102 },
    { equivalentTeeth: 18, factor: 0.104 },
    { equivalentTeeth: 19, factor: 0.105 },
    { equivalentTeeth: 20, factor: 0.106 },
    { equivalentTeeth: 21, factor: 0.108 },
    { equivalentTeeth: 22, factor: 0.110 },
    { equivalentTeeth: 23, factor: 0.112 },
    { equivalentTeeth: 24, factor: 0.114 },
    { equivalentTeeth: 28, factor: 0.117 },
    { equivalentTeeth: 30, factor: 0.120 },
    { equivalentTeeth: 32, factor: 0.123 },
    { equivalentTeeth: 35, factor: 0.128 },
    { equivalentTeeth: 37, factor: 0.131 },
    { equivalentTeeth: 40, factor: 0.136 },
    { equivalentTeeth: 45, factor: 0.142 },
    { equivalentTeeth: 50, factor: 0.145 },
    { equivalentTeeth: 60, factor: 0.150 }
  ]);

  // Допустимі напруги згину, таблиця 13. Числа однакові в обох книжках; поріг
  // вантажопідйомності курсова подає в кілограмах (5000 кг), Опанасюк у
  // ньютонах (50 кН) — та сама межа в різних одиницях.
  const BENDING_STRESS = Object.freeze({
    firstAndReverse: { light: { min: 750, max: 850 }, heavy: { min: 500, max: 650 } },
    constantMeshAndOthers: { light: { min: 350, max: 450 }, heavy: { min: 175, max: 275 } },
    heavyPayloadKg: 5000
  });

  // Ряд модулів. Числа однакові; стандарт названо по-різному, і кожен профіль
  // називає свій.
  const MODULE_SERIES = Object.freeze([
    { preferred: true, values: Object.freeze([2.0, 2.5, 3.0, 4.0, 5.0, 6, 8, 10, 12, 16]) },
    { preferred: false, values: Object.freeze([2.25, 2.75, 3.5, 4.5, 5.5, 7, 9, 11, 14, 18]) }
  ]);

  const PROFILES = Object.freeze([
    {
      id: "course-methodic",
      documentSourceId: "source.method.course",
      // с. 45: кут не залежить від схеми коробки.
      helixAngleDeg: Object.freeze({
        passenger: { min: 25, max: 35 },
        goods: { min: 20, max: 30 }
      }),
      gearWidthMm: Object.freeze({
        passenger: { min: 15, max: 25 },
        goods: { min: 20, max: 25 }
      }),
      moduleStandard: "ГОСТ 9563-60 (СТ СЕВ 310-76)",
      // с. 46: коефіцієнт 0,418.
      contactCoefficient: 0.418
    },
    {
      id: "opanasyuk",
      documentSourceId: "source.method.opanasyuk",
      // с. 35: для легкового кут залежить ще й від схеми коробки.
      helixAngleDeg: Object.freeze({
        passengerThreeShaft: { min: 22, max: 34 },
        passengerTwoShaft: { min: 20, max: 25 },
        goods: { min: 18, max: 26 }
      }),
      gearWidthMm: Object.freeze({
        passenger: { min: 15, max: 25 },
        goods: { min: 20, max: 40 }
      }),
      moduleStandard: "ОСТ 37.001.223-80 (ст РЕВ 310-76)",
      // с. 37, рівняння (56): 0,4118 — на три знаки більше, ніж у курсової.
      contactCoefficient: 0.4118
    }
  ]);

  function profile(id) {
    return PROFILES.find(item => item.id === id) || null;
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

  // Діапазон кута нахилу залежить від книжки, типу автомобіля й — в Опанасюка
  // — від схеми коробки. Змішувати їх не можна: це різні рекомендації.
  function helixAngleRange(gearboxProfile, { vehicleType, topologyId }) {
    const ranges = gearboxProfile?.helixAngleDeg;
    if (!ranges) return null;
    const goods = vehicleType === "goods" || vehicleType === "offRoad";
    if (ranges.passengerThreeShaft) {
      if (goods) return ranges.goods;
      return topologyId === "two-shaft"
        ? ranges.passengerTwoShaft
        : (topologyId === "three-shaft" ? ranges.passengerThreeShaft : null);
    }
    return goods ? ranges.goods : ranges.passenger;
  }

  function gearWidthRange(gearboxProfile, vehicleType) {
    const ranges = gearboxProfile?.gearWidthMm;
    if (!ranges) return null;
    return vehicleType === "goods" || vehicleType === "offRoad"
      ? ranges.goods : ranges.passenger;
  }

  // Коефіцієнт форми зуба беруть за ПРИВЕДЕНОЮ кількістю зубів: у косозубої
  // шестерні зуб працює так, ніби їх z/cos³β′.
  function toothFormFactor(teeth, helixAngleDeg) {
    const count = finiteNumber(teeth);
    const angle = finiteNumber(helixAngleDeg);
    if (count === null || angle === null || count <= 0) return null;
    const cos = Math.cos(angle * Math.PI / 180);
    const equivalent = count / cos ** 3;

    // Таблиця дискретна, тому беруть найближче табличне значення — і
    // документ каже, яке саме, разом із самим z_пр.
    const nearest = TOOTH_FORM_FACTOR.reduce((chosen, row) =>
      Math.abs(row.equivalentTeeth - equivalent)
        < Math.abs(chosen.equivalentTeeth - equivalent) ? row : chosen);
    return {
      equivalentTeeth: equivalent,
      tableTeeth: nearest.equivalentTeeth,
      factor: nearest.factor,
      // За межами таблиці значення не інтерполюють і не продовжують: там його
      // просто немає.
      outsideTable: equivalent < TOOTH_FORM_FACTOR[0].equivalentTeeth
        || equivalent > TOOTH_FORM_FACTOR[TOOTH_FORM_FACTOR.length - 1].equivalentTeeth
    };
  }

  // Допустимі напруги: перша передача й задній хід навантажені найбільше,
  // решта — удвічі менше.
  function bendingStressRange({ role, payloadKg }) {
    const heavy = finiteNumber(payloadKg) !== null
      && finiteNumber(payloadKg) > BENDING_STRESS.heavyPayloadKg;
    const row = role === "first-gear" || role === "reverse"
      ? BENDING_STRESS.firstAndReverse
      : BENDING_STRESS.constantMeshAndOthers;
    return { range: heavy ? row.heavy : row.light, heavy };
  }

  // Модуль: m = 10³·√(2M cosβ′/(π z y в k_σ)).
  //
  // Одиниці ті самі, що й у розділі 9: усе в СІ, підкореневий вираз дає метри,
  // множник 10³ переводить у міліметри.
  function toothModule({ designTorqueNm, helixAngleDeg, teeth, formFactor,
    gearWidthMm, allowableStressMpa }) {
    const values = {
      designTorqueNm: finiteNumber(designTorqueNm),
      helixAngleDeg: finiteNumber(helixAngleDeg),
      teeth: finiteNumber(teeth),
      formFactor: finiteNumber(formFactor),
      gearWidthMm: finiteNumber(gearWidthMm),
      allowableStressMpa: finiteNumber(allowableStressMpa)
    };
    const missing = Object.entries(values)
      .filter(([, value]) => value === null || value <= 0)
      .map(([name]) => name);
    if (missing.length) {
      return { defined: false, missing, reason: `Бракує величин: ${missing.join(", ")}.` };
    }

    const cos = Math.cos(values.helixAngleDeg * Math.PI / 180);
    const widthM = values.gearWidthMm / 1000;
    const stressPa = values.allowableStressMpa * 1e6;
    const squared = 2 * values.designTorqueNm * cos
      / (Math.PI * values.teeth * values.formFactor * widthM * stressPa);
    return {
      defined: true,
      moduleMm: Math.sqrt(squared) * 1000,
      operands: values
    };
  }

  // Що радить стандарт для порахованого модуля.
  //
  // «Перевагу слід надавати першому ряду» — тому порада завжди з першого, хоч
  // би яким близьким був другий. Тут стояло навпаки: для m = 4,05 мм код брав
  // 4,5 з другого ряду замість 5,0 з першого, бо воно ближче. Ближче — не те
  // саме, що краще, коли джерело прямо каже, чому надавати перевагу.
  //
  // Округлюють УГОРУ: менший модуль означав би слабший зуб, ніж вимагає
  // розрахунок.
  function recommendModule(requiredMm) {
    const required = finiteNumber(requiredMm);
    if (required === null || required <= 0) {
      return { defined: false, reason: "Розрахунковий модуль не відомий." };
    }
    const fromRow = index => MODULE_SERIES[index].values
      .find(value => value >= required) ?? null;
    const preferred = fromRow(0);
    const secondary = fromRow(1);
    if (preferred === null && secondary === null) {
      return {
        defined: false,
        requiredMm: required,
        reason: `Розрахунковий модуль ${required.toFixed(2)} мм більший за все, `
          + "що подає ряд стандарту."
      };
    }
    return {
      defined: true,
      requiredMm: required,
      recommendedMm: preferred ?? secondary,
      recommendedRow: preferred === null ? 2 : 1,
      // Другий ряд не забороняють — його лише не радять першим. Якщо він
      // ближчий, автор має це бачити й вирішувати сам.
      alternativeMm: secondary !== null && (preferred === null || secondary < preferred)
        ? secondary : null,
      alternativeRow: 2
    };
  }

  // Прийняття модуля: за порадою стандарту або власне число автора.
  function adoptModule({ basis, recommendation, manualValue }) {
    if (basis !== "standard-series" && basis !== "project-input") {
      return {
        defined: false,
        reason: "Основа прийняття модуля має бути «standard-series» або "
          + `«project-input»; отримано ${basis === null || basis === undefined
            || basis === "" ? "нічого" : JSON.stringify(basis)}.`
      };
    }
    if (basis === "standard-series") {
      if (!recommendation?.defined) {
        return {
          defined: false,
          reason: recommendation?.reason || "Розрахунковий модуль не відомий."
        };
      }
      return {
        defined: true,
        basis,
        method: "standard-series",
        moduleMm: recommendation.recommendedMm,
        row: recommendation.recommendedRow,
        recommendation,
        // Прийнятий модуль має бути не меншим за розрахунковий — інакше зуб
        // слабший, ніж вимагає згин.
        coversRequired: recommendation.recommendedMm >= recommendation.requiredMm
      };
    }
    const value = finiteNumber(manualValue);
    if (value === null || value <= 0) {
      return { defined: false, reason: "Вибрано власний модуль, але число не задано." };
    }
    const inSeries = MODULE_SERIES.some(row => row.values.includes(value));
    return {
      defined: true,
      basis,
      method: "project-input",
      moduleMm: value,
      row: MODULE_SERIES.findIndex(row => row.values.includes(value)) + 1 || null,
      recommendation,
      inSeries,
      coversRequired: recommendation?.defined
        ? value >= recommendation.requiredMm : null
    };
  }

  // Чи витримує прийнятий модуль те, що вимагає розрахунок на згин.
  function moduleStatus(adopted) {
    if (!adopted?.defined) {
      return {
        defined: true,
        checked: false,
        reason: adopted?.reason || "Модуль ще не прийнято, тому перевіряти нема чого."
      };
    }
    if (adopted.coversRequired === null) {
      return {
        defined: true,
        checked: false,
        reason: `Прийнято модуль ${adopted.moduleMm} мм, але розрахункового немає, `
          + "тому порівнювати нема з чим."
      };
    }
    return {
      defined: true,
      checked: true,
      withinLimit: adopted.coversRequired,
      reason: adopted.coversRequired
        ? `Прийнято ${adopted.moduleMm} мм (ряд ${adopted.row || "поза рядом"}) `
          + `проти розрахункових ${adopted.recommendation.requiredMm.toFixed(2)} мм.`
          + (adopted.inSeries === false ? " Це число не належить ряду стандарту." : "")
        : `Прийнято ${adopted.moduleMm} мм, а розрахунок вимагає `
          + `${adopted.recommendation.requiredMm.toFixed(2)} мм: зуб буде слабший `
          + "за потрібне. Візьміть більший модуль, ширшу шестерню або міцніший матеріал."
    };
  }

  function moduleDiagnostics(status) {
    if (!status?.checked || status.withinLimit) return [];
    return [{
      code: "GEARBOX_MODULE_BELOW_REQUIRED",
      severity: "error",
      message: status.reason,
      details: { node: "calc.gearbox-module" }
    }];
  }

  // Розрахунковий момент на валу шестерні: M_розр = M_e,max · β · u.
  //
  // β тут — коефіцієнт запасу ЗЧЕПЛЕННЯ (розділ 9), а не кут нахилу: у
  // Опанасюка вони позначені β і β′, у курсовій методичці описані словами.
  // Без зчеплення цього моменту немає, і вигадувати його ніяк: для машини без
  // зчеплення джерела просто не подають, від чого рахувати модуль.
  function designTorque({ engineTorqueNm, clutchReserveFactor, ratioToShaft }) {
    const torque = finiteNumber(engineTorqueNm);
    const reserve = finiteNumber(clutchReserveFactor);
    const ratio = finiteNumber(ratioToShaft);
    if (torque === null || torque <= 0) {
      return { defined: false, reason: "Максимальний момент двигуна не відомий." };
    }
    if (reserve === null || reserve <= 0) {
      return {
        defined: false,
        reason: "Коефіцієнт запасу зчеплення не прийнято: розрахунковий момент "
          + "рахують саме через нього, і без розділу 9 його немає."
      };
    }
    if (ratio === null || ratio <= 0) {
      return { defined: false, reason: "Передаточне число до вала не відоме." };
    }
    return { defined: true, value: torque * reserve * ratio };
  }

  // Крок документа: модуль. Рахують його для найнавантаженіших пар — привода
  // проміжного вала й першої передачі, — а приймають один на всю коробку:
  // рівність сум зубів у парах вимагає однакового модуля.
  function buildModuleStep({ pairs, adopted, texNumber, reserveFactorIsAbsent = false }) {
    const list = pairs
      .map((pair, index) => {
        const p = pair.module?.operands;
        if (!p || ![p.designTorqueNm, p.helixAngleDeg, p.teeth, p.formFactor,
          p.gearWidthMm, p.allowableStressMpa].every(Number.isFinite)) {
          throw new Error(`Розділ 10.5: для пари «${pair.label}» потрібен результат toothModule з числовими операндами.`);
        }
        return `m_{${index + 1}}&=10^3\\sqrt{\\frac{2\\cdot${texNumber(p.designTorqueNm, 3)}`
          + `\\cdot\\cos(${texNumber(p.helixAngleDeg, 3)}^\\circ)}`
          + `{\\pi\\cdot${p.teeth}\\cdot${texNumber(p.formFactor, 4)}`
          + `\\cdot(${texNumber(p.gearWidthMm, 3)}\\cdot10^{-3})`
          + `\\cdot(${texNumber(p.allowableStressMpa, 2)}\\cdot10^6)}}`
          + `=${texNumber(pair.moduleMm, 3)}\\ \\text{мм}`;
      }).join("\\\\ ");
    return {
      id: "gearbox-module",
      title: "Нормальний модуль зубів шестерень",
      purpose: "Знайти модуль, за якого зуб витримує згин, і округлити його до "
        + "ряду стандарту.",
      output: {
        id: "value.gearbox-module",
        symbol: "m",
        label: "Gear module",
        valueType: "quantity",
        canonicalUnit: "mm"
      },
      expression: "m = 1000 * sqrt(2 * M_design * cos(beta) / (pi * z * y * b * k_sigma))",
      dependencies: [
        "value.gearbox-teeth",
        "decision.gearbox-helix-angle",
        "decision.gearbox-gear-width",
        "decision.gearbox-module"
      ],
      equationNumber: "10.5",
      formulaTex: "m=10^3\\sqrt{\\dfrac{2M_{\\mathrm{розр}}\\cos\\beta'}"
        + "{\\pi z y \\text{в} k_\\sigma}}",
      substitutionTex: `\\begin{aligned}${list}\\\\ m_{\\mathrm{потр}}&=\\max\\{`
        + `${pairs.map(pair => texNumber(pair.moduleMm, 3)).join(",\\,")}\\}`
        + `=${texNumber(Math.max(...pairs.map(pair => pair.moduleMm)), 3)}\\ \\text{мм}\\\\ `
        + `m_{\\mathrm{прийн}}&=${texNumber(adopted.moduleMm, 2)}\\ \\text{мм}\\quad\\text{(прийнято)}\\end{aligned}`,
      result: {
        value: adopted.moduleMm,
        canonicalUnit: "mm",
        displayUnit: "мм"
      },
      method: "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        ...pairs.map((pair, index) => `m${index + 1} — потрібний модуль пари «${pair.label}». У підстановці ширину переведено з мм у м, напругу — з МПа в Па; зовнішній множник 1000 повертає модуль у мм.`),
        "Модуль один на всю коробку: рівність сум зубів у парах можлива лише за "
        + "однакового модуля, тому приймають найбільший із потрібних.",
        `Найбільший потрібен для пари «${pairs.reduce((chosen, pair) =>
          pair.moduleMm > chosen.moduleMm ? pair : chosen).label}».`
      ],
      assumptions: [
        "Розрахунок попередній: він дає розмір, з якого починають, а не остаточний."
      ],
      limitations: [
        "Коефіцієнт форми зуба взято з дискретної таблиці за найближчим "
        + "приведеним числом зубів.",
        // Одиниця замість β — не «типове значення», а ВІДСУТНІСТЬ множника.
        // Методичка писала для автомобіля зі зчепленням; електропривод вона
        // не розглядає, і мовчазна одиниця виглядала б як її рекомендація.
        ...(reserveFactorIsAbsent
          ? ["Коефіцієнта запасу зчеплення β тут немає: в електричного "
            + "привода немає зчеплення, тому розрахунковий момент дорівнює "
            + "моменту електромашини. Джерело такого випадку не розглядає — "
            + "це рішення проєкту."]
          : []),
        ...(adopted.inSeries === false
          ? ["Прийнятий модуль не належить ряду стандарту."]
          : [])
      ]
    };
  }

  // Перевірка на контактні напруги. Спільне в обох книжках: кут зачеплення,
  // модуль пружності, довжина лінії зачеплення й межі. Різний лише коефіцієнт.
  const CONTACT = Object.freeze({
    pressureAngleDeg: 20,
    youngModulusMpa: 210000,
    limits: Object.freeze({
      straight: { min: 1500, max: 3000 },
      helical: { min: 1000, max: 2500 }
    })
  });

  // Ділильний радіус косозубої шестерні: нормальний модуль ділять на cos β′.
  function pitchRadiusMm({ moduleMm, teeth, helixAngleDeg }) {
    const m = finiteNumber(moduleMm);
    const z = finiteNumber(teeth);
    const beta = finiteNumber(helixAngleDeg);
    if (m === null || z === null || beta === null || m <= 0 || z <= 0) return null;
    return m * z / (2 * Math.cos(beta * Math.PI / 180));
  }

  // σ_ст = k·cosβ′·√( PE/(в₀ sinα cosα) · (1/r₀₁ − 1/r₀₂) )
  //
  // Знак у дужках — МІНУС, і так надруковано в обох книжках. Класична теорія
  // Герца для ЗОВНІШНЬОГО зачеплення дає плюс: кривини складаються. Але
  // виправляти джерело мовчки не можна, тому документ рахує надруковане й
  // показує обидва числа поряд — щоб читач бачив, про що йдеться.
  function contactStress({ gearboxProfile, torqueNm, moduleMm, drivingTeeth,
    drivenTeeth, helixAngleDeg }) {
    const coefficient = gearboxProfile?.contactCoefficient ?? null;
    if (coefficient === null) {
      return { defined: false, reason: "Метод не подає коефіцієнта контактних напруг." };
    }
    const torque = finiteNumber(torqueNm);
    const beta = finiteNumber(helixAngleDeg);
    const r1 = pitchRadiusMm({ moduleMm, teeth: drivingTeeth, helixAngleDeg });
    const r2 = pitchRadiusMm({ moduleMm, teeth: drivenTeeth, helixAngleDeg });
    if (torque === null || torque <= 0 || beta === null || r1 === null || r2 === null) {
      return { defined: false, reason: "Бракує моменту, модуля, зубів або кута нахилу." };
    }

    // НАДРУКОВАНИЙ вираз має дужку (1/r₀₁ − 1/r₀₂), і вона додатна лише тоді,
    // коли ведуча шестерня менша за ведену. На перевернутій або рівній парі
    // підкореневий вираз від'ємний чи нульовий, і корінь дає NaN — а NaN
    // проходив далі мовчки: JSON робив із нього null, напис друкував «NaN МПа».
    // Межу застосовності виразу треба назвати, а не обчислювати крізь неї.
    if (!(r1 < r2)) {
      return {
        defined: false,
        outOfDomain: true,
        reason: "Надрукований вираз описує лише пару, у якій ведуча шестерня "
          + `менша за ведену: r₀₁ = ${r1.toFixed(1)} мм, r₀₂ = ${r2.toFixed(1)} мм. `
          + "Для такої пари контактні напруги за цією формулою не рахують."
      };
    }

    const alpha = CONTACT.pressureAngleDeg * Math.PI / 180;
    // Колове зусилля на ділильному колі: момент у Н·мм, радіус у мм.
    const circumferentialForceN = torque * 1000 / r1;
    const lineOfActionMm = (r1 + r2) * Math.sin(alpha);
    const common = circumferentialForceN * CONTACT.youngModulusMpa
      / (lineOfActionMm * Math.sin(alpha) * Math.cos(alpha));
    const printed = coefficient * Math.cos(beta * Math.PI / 180)
      * Math.sqrt(common * (1 / r1 - 1 / r2));
    const external = coefficient * Math.cos(beta * Math.PI / 180)
      * Math.sqrt(common * (1 / r1 + 1 / r2));

    return {
      defined: true,
      stressMpa: printed,
      externalMeshStressMpa: external,
      circumferentialForceN,
      lineOfActionMm,
      pitchRadiiMm: { driving: r1, driven: r2 },
      coefficient,
      helixAngleDeg: beta,
      pressureAngleDeg: CONTACT.pressureAngleDeg,
      youngModulusMpa: CONTACT.youngModulusMpa
    };
  }

  // Межі залежать від того, прямозуба шестерня чи косозуба.
  function contactStressStatus({ stress, helixAngleDeg }) {
    if (!stress?.defined) {
      return {
        defined: true,
        checked: false,
        reason: stress?.reason || "Контактні напруги ще не пораховані."
      };
    }
    const beta = finiteNumber(helixAngleDeg) ?? 0;
    const helical = Math.abs(beta) > 1e-9;
    const range = helical ? CONTACT.limits.helical : CONTACT.limits.straight;
    const value = stress.stressMpa;
    // Діапазон — це вимога МІЦНОСТІ, тобто верхня межа. Опинитися нижче за
    // неї не порушення: зуб, підібраний за згином, часто виходить міцнішим на
    // контакт, ніж треба, — так само, як карданний вал, підібраний за
    // критичною частотою.
    const within = value <= range.max;
    const below = value < range.min;
    return {
      defined: true,
      checked: true,
      helical,
      range,
      stressMpa: value,
      withinLimit: within,
      belowBand: below,
      // «Якщо значення поза межами, розрахунки необхідно повторити,
      // скоригувавши вихідні дані (β′, в)» — порада самого джерела, тому вона
      // тут доречна: напрямок називає книжка, а не цей документ.
      reason: !within
        ? `Контактні напруги ${value.toFixed(0)} МПа перевищують ${range.max} МПа `
          + `для ${helical ? "косозубих" : "прямозубих"} шестерень. Зуб `
          + "викришиться: джерела радять повторити розрахунок, скоригувавши кут "
          + "нахилу зубів і ширину шестерні."
        : below
          ? `Контактні напруги ${value.toFixed(0)} МПа нижчі за ${range.min} МПа, `
            + `з яких починається діапазон для `
            + `${helical ? "косозубих" : "прямозубих"} шестерень. Це не `
            + "порушення: модуль підібрано за ЗГИНОМ, і зуб вийшов міцнішим на "
            + "контакт, ніж вимагає момент. Діапазон — вимога міцності, тобто "
            + "верхня межа."
          : `Контактні напруги ${value.toFixed(0)} МПа — у межах ${range.min}…`
            + `${range.max} МПа для ${helical ? "косозубих" : "прямозубих"} шестерень.`
    };
  }

  function contactStressDiagnostics(status) {
    if (!status?.checked) return [];
    if (!status.withinLimit) {
      return [{
        code: "GEARBOX_CONTACT_STRESS_ABOVE_LIMIT",
        severity: "warning",
        message: status.reason,
        details: { node: "calc.gearbox-contact-stress" }
      }];
    }
    if (status.belowBand) {
      return [{
        code: "GEARBOX_CONTACT_STRESS_BELOW_BAND",
        // Не дефект: зуб міцніший, ніж треба.
        severity: "info",
        message: status.reason,
        details: { node: "calc.gearbox-contact-stress" }
      }];
    }
    return [];
  }

  // Крок документа: контактні напруги.
  function buildContactStressStep({ stress, status, pair, texNumber }) {
    return {
      id: "gearbox-contact-stress",
      title: "Контактні напруги в зубах",
      purpose: "Перевірити зуб не лише на згин, а й на контакт: чи не викришиться "
        + "поверхня під тиском у зачепленні.",
      output: {
        id: "value.gearbox-contact-stress",
        symbol: "\\sigma_{\\mathrm{ст}}",
        label: "Contact stress",
        valueType: "quantity",
        canonicalUnit: "MPa"
      },
      expression: "sigma = k * cos(beta) * sqrt(P * E / (b0 * sin(a) * cos(a)) "
        + "* (1 / r1 - 1 / r2))",
      dependencies: [
        "value.gearbox-module",
        "decision.gearbox-helix-angle",
        "decision.gearbox-method-profile"
      ],
      equationNumber: "10.6",
      formulaTex: "\\sigma_{\\mathrm{ст}}=k\\cos\\beta'\\sqrt{\\dfrac{PE}"
        + "{\\text{в}_0\\sin\\alpha\\cos\\alpha}\\left(\\dfrac{1}{r_{01}}"
        + "-\\dfrac{1}{r_{02}}\\right)}",
      substitutionTex: `\\sigma_{\\mathrm{ст}}=${texNumber(stress.coefficient, 4)}`
        + `\\cdot\\cos(${texNumber(stress.helixAngleDeg, 3)}^\\circ)`
        + `\\sqrt{\\frac{${texNumber(stress.circumferentialForceN, 3)}\\cdot${texNumber(stress.youngModulusMpa, 0)}}`
        + `{${texNumber(stress.lineOfActionMm, 4)}\\cdot\\sin(${texNumber(stress.pressureAngleDeg, 2)}^\\circ)`
        + `\\cdot\\cos(${texNumber(stress.pressureAngleDeg, 2)}^\\circ)}`
        + `\\left(\\frac{1}{${texNumber(stress.pitchRadiiMm.driving, 4)}}`
        + `-\\frac{1}{${texNumber(stress.pitchRadiiMm.driven, 4)}}\\right)}`
        + `=${texNumber(stress.stressMpa, 2)}\\ \\text{МПа}`,
      result: {
        value: stress.stressMpa,
        canonicalUnit: "MPa",
        displayUnit: "МПа"
      },
      method: "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        `Перевірено пару «${pair.label}» — найнавантаженішу з тих, що рахують.`,
        `Коефіцієнт ${stress.coefficient} — з вибраного методу: книжки друкують `
        + "0,418 і 0,4118."
      ],
      assumptions: [
        "Кут зачеплення α = 20°, модуль пружності сталі E = 210 ГПа — обидві книжки."
      ],
      limitations: [
        // Це найважливіше, що читач має знати про цей крок.
        "Обидві книжки друкують у дужках МІНУС: (1/r₀₁ − 1/r₀₂). Класична теорія "
        + "Герца для зовнішнього зачеплення дає плюс. Тут пораховано надруковане; "
        + `з плюсом вийшло б ${texNumber(stress.externalMeshStressMpa, 0)} МПа.`,
        ...(status.checked && !status.withinLimit
          ? ["Значення поза межами, які подають книжки."]
          : [])
      ]
    };
  }

  const SOURCE_REFS = Object.freeze(["source.method.course", "source.method.opanasyuk"]);

  // Рішення розділу 10.2. Кут нахилу й ширина шестерні належать МЕТОДУ —
  // книжки дають різні діапазони, — а модуль приймає автор із ряду стандарту.
  function decisionsFor({ gearboxProfile, helix, helixRange, width, widthRange,
    adopted, recommendation }) {
    const decisions = [];
    if (gearboxProfile) {
      decisions.push({
        id: "decision.gearbox-method-profile",
        kind: "Decision",
        choiceRef: null,
        symbol: null,
        adoptedValue: gearboxProfile.id,
        canonicalUnit: null,
        method: "project-input",
        selectedReferenceId: null,
        rationale: "Метод розрахунку коробки вибирають цілком: формула й таблиці в "
          + "книжках однакові, але кут нахилу зубів і ширина шестерні різні. "
          + `Ряд модулів за ${gearboxProfile.moduleStandard}.`,
        sourceRefs: [gearboxProfile.documentSourceId],
        limitations: [],
        manuallyOverridden: true
      });
    }
    [["decision.gearbox-helix-angle", "\\beta'", helix, helixRange, null],
      ["decision.gearbox-gear-width", "\\text{в}", width, widthRange, "mm"]]
      .forEach(([id, symbol, adoptedValue, range, unit]) => {
        if (!adoptedValue?.defined) return;
        decisions.push({
          id,
          kind: "Decision",
          choiceRef: null,
          symbol,
          adoptedValue: adoptedValue.value,
          canonicalUnit: unit,
          method: adoptedValue.method,
          selectedReferenceId: null,
          recommendedValue: range ? (range.min + range.max) / 2 : null,
          recommendedSourceRefs: gearboxProfile ? [gearboxProfile.documentSourceId] : [],
          rationale: adoptedValue.method === "profile-midpoint"
            ? `Прийнято середину діапазону ${range.min}…${range.max}, який подає `
              + "вибраний метод."
            : `Власне значення автора.${range
              ? ` Метод радить ${range.min}…${range.max}.` : ""}`,
          sourceRefs: adoptedValue.method === "profile-midpoint" && gearboxProfile
            ? [gearboxProfile.documentSourceId]
            : ["source.project-input"],
          limitations: range && (adoptedValue.value < range.min
            || adoptedValue.value > range.max)
            ? ["Значення лежить поза діапазоном, який подає вибраний метод."]
            : [],
          manuallyOverridden: adoptedValue.method === "project-input"
        });
      });
    if (adopted?.defined) {
      decisions.push({
        id: "decision.gearbox-module",
        kind: "Decision",
        choiceRef: null,
        symbol: "m",
        adoptedValue: adopted.moduleMm,
        canonicalUnit: "mm",
        method: adopted.method,
        selectedReferenceId: null,
        recommendedValue: recommendation?.defined ? recommendation.recommendedMm : null,
        recommendedSourceRefs: SOURCE_REFS,
        rationale: recommendation?.defined
          ? `Розрахунок вимагає ${recommendation.requiredMm.toFixed(2)} мм; ряд `
            + `стандарту дає ${recommendation.recommendedMm} мм у першому ряду`
            + (recommendation.alternativeMm
              ? ` і ${recommendation.alternativeMm} мм у другому, якому переваги не надають.`
              : ".")
          : "Модуль прийнято без розрахункової поради.",
        sourceRefs: adopted.method === "standard-series"
          ? SOURCE_REFS : ["source.project-input"],
        limitations: [
          "Модуль один на всю коробку: рівність сум зубів у парах можлива лише "
          + "за однакового модуля.",
          ...(adopted.inSeries === false
            ? ["Прийняте число не належить ряду стандарту."] : [])
        ],
        manuallyOverridden: adopted.method === "project-input"
      });
    }
    return decisions;
  }

  return Object.freeze({
    CONTACT,
    SOURCE_REFS,
    contactStress,
    buildContactStressStep,
    contactStressStatus,
    contactStressDiagnostics,
    pitchRadiusMm,
    decisionsFor,
    designTorque,
    buildModuleStep,
    TOOTH_FORM_FACTOR,
    BENDING_STRESS,
    MODULE_SERIES,
    PROFILES,
    profile,
    helixAngleRange,
    gearWidthRange,
    toothFormFactor,
    bendingStressRange,
    toothModule,
    recommendModule,
    adoptModule,
    moduleStatus,
    moduleDiagnostics
  });
}
