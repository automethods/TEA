"use strict";

// Розділ 9.4 — те, що рахують додатково, коли зчеплення є спеціальним
// завданням проєкту.
//
// Курсова методичка й Опанасюк називають три перевірки й не подають до них
// НІЧОГО — ні формул, ні допустимих значень. Дві з трьох знайшлися у
// Вахламова, с. 62—63, разом із межами й марками сталей. Третя, нагрівання,
// лишається відмовою: методу для неї немає й там.
export function createClutchSpecial({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;

  const { finiteNumber } = (function loadNumeric() {
    const scope = typeof window === "object" ? window : globalThis;
    if (!scope.VehicleNumeric && typeof module === "object" && module.exports) {
      require("./numeric.js");
    }
    return scope.VehicleNumeric;
  })();

  const SOURCE_REFS = Object.freeze(["source.book.vakhlamov"]);

  // Вахламов, с. 62: шліци маточини веденого диска.
  const SPLINE_CRUSH_MPA = Object.freeze({ min: 15, max: 30 });
  const SPLINE_SHEAR_MPA = Object.freeze({ min: 5, max: 15 });
  // Вахламов, с. 63: важелі виключення.
  const LEVER_BENDING_MPA = Object.freeze({ min: 320, max: 400 });

  const midpoint = range => (range.min + range.max) / 2;

  // σ_см = 8M/((d_н² − d_в²)·z·l_ш);  τ_ср = 4M/((d_н − d_в)·z·l_ш·b_ш)
  function hubSplines({ designTorqueNm, outerDiameterMm, innerDiameterMm,
    splineCount, splineLengthMm, splineWidthMm }) {
    const torque = finiteNumber(designTorqueNm);
    const outer = finiteNumber(outerDiameterMm);
    const inner = finiteNumber(innerDiameterMm);
    const count = finiteNumber(splineCount);
    const length = finiteNumber(splineLengthMm);
    const width = finiteNumber(splineWidthMm);
    if ([torque, outer, inner, count, length, width]
      .some(value => value === null || value <= 0)) {
      return { defined: false, reason: "Для шліців маточини бракує величин." };
    }
    if (!Number.isInteger(count)) return {defined:false,reason:"Кількість шліців має бути цілим числом."};
    if (!(outer > inner)) {
      return {
        defined: false,
        reason: "Зовнішній діаметр шліців має бути більшим за внутрішній."
      };
    }
    // Момент у Н·м, розміри в мм: 1 Н·м = 1000 Н·мм.
    const momentNmm = torque * 1000;
    const crushMpa = 8 * momentNmm / ((outer ** 2 - inner ** 2) * count * length);
    // ЗРІЗ: у знаменнику ПЛЮС, а Вахламов друкує мінус.
    //
    // Перевіряється двома незалежними способами.
    //
    // По-перше, тотожністю з класичним розв'язком. Момент передають z шліців
    // на середньому радіусі d_ср/2, отже сила на шліц F = 2M/(d_ср·z), а
    // площа зрізу b·l:  τ = 2M/(d_ср·z·b·l). Підставивши d_ср = (d_н+d_в)/2,
    // дістаємо рівно 4M/((d_н+d_в)·z·l·b) — надрукований вираз із плюсом.
    //
    // По-друге, наслідком. З мінусом у знаменнику стоїть подвоєна ВИСОТА
    // шліца замість його середнього діаметра — величина в п'ять-десять разів
    // менша, — і напруга зрізу виходить у стільки ж разів більшою за напругу
    // зминання. Але зріз іде по ширині шліца, а зминання по його висоті, і
    // ширина завжди більша: зріз мусить бути МЕНШИЙ. За надрукованим виразом
    // будь-яка справжня маточина порушує власну межу джерела (5…15 МПа) у
    // кілька разів — тобто такої маточини не буває.
    const meanDiameterMm = (outer + inner) / 2;
    const shearMpa = 2 * momentNmm / (meanDiameterMm * count * length * width);
    const printedShearMpa = 4 * momentNmm / ((outer - inner) * count * length * width);
    return {
      defined: true,
      crushMpa,
      shearMpa,
      printedShearMpa,
      meanDiameterMm,
      crushWithinLimit: crushMpa <= SPLINE_CRUSH_MPA.max,
      shearWithinLimit: shearMpa <= SPLINE_SHEAR_MPA.max,
      crushLimits: SPLINE_CRUSH_MPA,
      shearLimits: SPLINE_SHEAR_MPA,
      designTorqueNm: torque,
      outerDiameterMm: outer,
      innerDiameterMm: inner,
      splineCount: count,
      splineLengthMm: length,
      splineWidthMm: width
    };
  }

  // σ_изг = P_пр.в·l/(u·z·W_изг), де u = l/f — передаточне число важеля.
  function releaseLevers({ springForceN, armLengthMm, innerArmMm, leverCount,
    sectionModulusMm3 }) {
    const force = finiteNumber(springForceN);
    const arm = finiteNumber(armLengthMm);
    const innerArm = finiteNumber(innerArmMm);
    const count = finiteNumber(leverCount);
    const modulus = finiteNumber(sectionModulusMm3);
    if ([force, arm, innerArm, count, modulus]
      .some(value => value === null || value <= 0)) {
      return { defined: false, reason: "Для важелів виключення бракує величин." };
    }
    if (!Number.isInteger(count)) return {defined:false,reason:"Кількість важелів має бути цілим числом."};
    // u = l/f: у скільки разів важіль множить хід і ділить силу.
    const ratio = arm / innerArm;
    const stressMpa = force * arm / (ratio * count * modulus);
    return {
      defined: true,
      value: stressMpa,
      leverRatio: ratio,
      withinLimit: stressMpa <= LEVER_BENDING_MPA.max,
      limits: LEVER_BENDING_MPA,
      springForceN: force,
      armLengthMm: arm,
      innerArmMm: innerArm,
      leverCount: count,
      sectionModulusMm3: modulus
    };
  }

  function buildHubStep({ splines, texNumber }) {
    return {
      id: "clutch-hub-splines",
      title: "Шліци маточини веденого диска",
      purpose: "Check the hub splines the source lists but does not size.",
      output: {
        id: "value.clutch-hub-crush",
        symbol: "\\sigma_{\\text{см}}",
        label: "Hub spline crushing stress",
        valueType: "quantity",
        canonicalUnit: "MPa"
      },
      expression: "8 M / ((D^2 - d^2) z l)",
      dependencies: ["value.clutch-design-torque"],
      equationNumber: "9.24",
      formulaTex: "\\sigma_{\\text{см}}=\\dfrac{8M_{\\max}}"
        + "{\\left(d_{\\text{н}}^{2}-d_{\\text{в}}^{2}\\right)zl_{\\text{ш}}},"
        + "\\qquad \\tau_{\\text{ср}}=\\dfrac{4M_{\\max}}"
        + "{\\left(d_{\\text{н}}+d_{\\text{в}}\\right)zl_{\\text{ш}}b_{\\text{ш}}}",
      substitutionTex: `\\sigma_{\\text{см}}=${texNumber(splines.crushMpa, 1)}`
        + `\\ \\text{МПа},\\quad \\tau_{\\text{ср}}=${texNumber(splines.shearMpa, 1)}`
        + `\\ \\text{МПа}`,
      result: { value: splines.crushMpa, canonicalUnit: "MPa", displayUnit: "МПа" },
      method: "project-derivation",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        `Допустимі напруги: зминання ${SPLINE_CRUSH_MPA.min}…${SPLINE_CRUSH_MPA.max} МПа, `
        + `зріз ${SPLINE_SHEAR_MPA.min}…${SPLINE_SHEAR_MPA.max} МПа (Вахламов, с. 62). `
        + "Маточину роблять зі сталі 35 або 40Х із наступною термообробкою, а її "
        + "довжину беруть рівною зовнішньому діаметру шліців первинного вала.",
        "У виразі зрізу тут ПЛЮС, а Вахламов друкує мінус. Перевіряється двома "
        + "способами. Тотожність: момент передають z шліців на середньому "
        + "радіусі, отже τ = 2M/(d_ср·z·b·l), а це і є 4M/((d_н+d_в)·z·l·b). "
        + "Наслідок: із мінусом у знаменнику стоїть подвоєна ВИСОТА шліца "
        + "замість середнього діаметра, і зріз виходить у кілька разів більший "
        + `за зминання — тут ${texNumber(splines.printedShearMpa, 0)} МПа проти `
        + `${texNumber(splines.crushMpa, 1)}. Але зріз іде по ШИРИНІ шліца, а `
        + "зминання по його ВИСОТІ, і ширина завжди більша: зріз мусить бути "
        + "меншим. За надрукованим виразом будь-яка справжня маточина порушує "
        + "власну межу джерела в кілька разів."
      ],
      assumptions: [],
      limitations: [
        "Відхилення від джерела: у знаменнику виразу зрізу взято (d_н + d_в), а "
        + "не надруковане (d_н − d_в).",
        ...(splines.crushWithinLimit && splines.shearWithinLimit
          ? []
          : [`Напруги виходять за межі: зминання ${splines.crushMpa.toFixed(1)}, `
            + `зріз ${splines.shearMpa.toFixed(1)} МПа.`])
      ]
    };
  }

  function buildLeverStep({ levers, texNumber }) {
    return {
      id: "clutch-release-levers",
      title: "Важелі виключення зчеплення",
      purpose: "Check the release levers the source lists but does not size.",
      output: {
        id: "value.clutch-lever-bending",
        symbol: "\\sigma_{\\text{изг}}",
        label: "Release lever bending stress",
        valueType: "quantity",
        canonicalUnit: "MPa"
      },
      expression: "P l / (u z W)",
      dependencies: ["value.clutch-required-clamp-force"],
      equationNumber: "9.25",
      formulaTex: "\\sigma_{\\text{изг}}=\\dfrac{P_{\\text{пр.в}}l}"
        + "{uzW_{\\text{изг}}},\\qquad u=\\dfrac{l}{f}",
      substitutionTex: `u=${texNumber(levers.leverRatio, 2)}:\\quad `
        + `\\sigma_{\\text{изг}}=${texNumber(levers.value, 0)}\\ \\text{МПа}`,
      result: { value: levers.value, canonicalUnit: "MPa", displayUnit: "МПа" },
      method: "sourced-formula",
      sourceRefs: SOURCE_REFS,
      readerNotes: [
        `Напруги згину важелів не повинні перевищувати ${LEVER_BENDING_MPA.min}…`
        + `${LEVER_BENDING_MPA.max} МПа (Вахламов, с. 63). Важелі роблять із `
        + "ковкого чавуну або мало- чи середньовуглецевої сталі.",
        "u = l/f — передаточне число важеля: у скільки разів він множить хід "
        + "муфти виключення й ділить силу на ній.",
        "Найбільше зношуються саме внутрішні кінці важелів, у які впирається "
        + "вижимний підшипник, — тому їх цементують або азотують, а зверху "
        + "ставлять упорне кільце."
      ],
      assumptions: [],
      limitations: levers.withinLimit
        ? []
        : [`Напруга ${levers.value.toFixed(0)} МПа перевищує `
          + `${LEVER_BENDING_MPA.max} МПа.`]
    };
  }

  return Object.freeze({
    SOURCE_REFS,
    SPLINE_CRUSH_MPA,
    SPLINE_SHEAR_MPA,
    LEVER_BENDING_MPA,
    midpoint,
    hubSplines,
    releaseLevers,
    buildHubStep,
    buildLeverStep
  });
}
