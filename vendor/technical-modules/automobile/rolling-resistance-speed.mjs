"use strict";

// Швидкісна поправка коефіцієнта опору коченню за А. К. Бирулею,
// «Проектирование автомобильных дорог, часть 1», с. 45 (та сама сторінка, що
// й рис. 15; таблиця 4 з f₀ стоїть поруч, на с. 44):
//
//   «До скорости 50 км/час численные значения коэффициентов сопротивления
//    качению практически постоянны, а для скоростей в интервале 50—150 км/час
//    сопротивление растёт по эмпирической зависимости
//        f = f₀(1 + 0,01(V − 50)).»
//
// Жодного числа, якого немає в цьому реченні, тут не вводиться: 50, 150 і 0,01
// стоять у джерелі дослівно.
export function createRollingResistanceSpeed({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
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

  const CONSTANT_UP_TO_KMH = 50;
  const CITED_UP_TO_KMH = 150;
  const SPEED_COEFFICIENT = 0.01;

  // Джерело каже «до скорости 50 км/час ... практически постоянны», тому саме
  // 50 км/год належить до сталої ділянки: рівняння вмикається лише вище за 50.
  //
  // Нижче за 50 км/год формула не показується взагалі. Вона визначена лише для
  // інтервалу 50—150 км/год, а підстановка на кшталт (1 + 0,01(40 − 50))
  // видимо зменшила б f нижче за f₀ — того джерело не стверджує. Показати
  // читачеві правдоподібне рівняння там, де його власне джерело не діє, гірше,
  // ніж не показати нічого.
  //
  // Вище за 150 км/год значення все одно обчислюється тією самою формулою, але
  // позначається як екстраполяція за межі інтервалу, який подає джерело.
  function correctForSpeed(rollingResistanceF0, speedKmh) {
    const f0 = finiteNumber(rollingResistanceF0);
    const speed = finiteNumber(speedKmh);
    const constant = !(speed > CONSTANT_UP_TO_KMH);
    const extrapolated = speed > CITED_UP_TO_KMH;
    const factor = constant ? 1 : 1 + SPEED_COEFFICIENT * (speed - CONSTANT_UP_TO_KMH);
    return {
      rollingResistanceF0: f0,
      speedKmh: speed,
      factor,
      rollingResistanceF: f0 * factor,
      regime: constant ? "constant" : extrapolated ? "extrapolated" : "cited",
      constant,
      extrapolated,
      // Рівняння та підстановку показують лише там, де діє джерело.
      showsEquation: !constant
    };
  }

  function limitationsFor(correction, texSpeed) {
    if (!correction.extrapolated) return [];
    return [
      `Швидкість ${texSpeed} км/год перевищує 150 км/год — верхню межу ` +
      `інтервалу, для якого джерело подає цю залежність. Значення f отримано ` +
      `екстраполяцією за межі області застосовності джерела.`
    ];
  }

  // Крок розрахунку у тому самому вигляді, що й кроки розділу 3: одне
  // визначення розрахунку (ENGINEERING_DOCUMENT_MODEL, розділ 7) і один слід
  // обчислення з числовою підстановкою (розділ 8).
  function buildSpeedCorrectionStep(correction, texNumber) {
    const f0Tex = texNumber(correction.rollingResistanceF0, 4);
    const speedTex = texNumber(correction.speedKmh, 1);
    const fTex = texNumber(correction.rollingResistanceF, 4);
    return {
      id: "rolling-resistance-at-speed",
      title: "Коефіцієнт опору коченню при максимальній швидкості",
      purpose: "Correct the surface rolling-resistance coefficient for the maximum design speed.",
      output: {
        id: "value.rolling-resistance-at-speed",
        symbol: "f",
        label: "Rolling-resistance coefficient at the maximum speed",
        valueType: "number",
        canonicalUnit: null
      },
      expression: correction.constant
        ? "f0"
        : "f0 * (1 + 0.01 * (V_max_kmh - 50))",
      dependencies: ["input.rolling-resistance", "input.maximum-speed"],
      // Перше нумероване рівняння розділу 2. За сталої ділянки рівняння не
      // показується, тому й номера не отримує.
      equationNumber: correction.showsEquation ? "2.1" : null,
      formulaTex: correction.showsEquation
        ? "f=f_0\\left(1+0{,}01\\left(V-50\\right)\\right)"
        : "f=f_0",
      substitutionTex: correction.showsEquation
        ? `f=${f0Tex}\\left(1+0{,}01\\left(${speedTex}-50\\right)\\right)=${fTex}`
        : `f=f_0=${f0Tex}`,
      result: { value: correction.rollingResistanceF, canonicalUnit: null, displayUnit: "" },
      method: correction.regime,
      sourceRefs: ["source.method.birulya-rolling-resistance"],
      assumptions: [
        "Rolling resistance is practically constant up to 50 km/h (source statement).",
        "The empirical relation is stated for the 50–150 km/h interval.",
        ...limitationsFor(correction, speedTex.replace("{,}", ","))
      ],
      limitations: limitationsFor(correction, speedTex.replace("{,}", ","))
    };
  }

  return Object.freeze({
    CONSTANT_UP_TO_KMH,
    CITED_UP_TO_KMH,
    SPEED_COEFFICIENT,
    correctForSpeed,
    buildSpeedCorrectionStep
  });
}
