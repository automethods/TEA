"use strict";

// Розділ 4.4 — зовнішня характеристика джерела тяги.
//
// Документ описує три різні машини, і характеристика в них різна за самою
// природою, а не за коефіцієнтами:
//
//   * поршневий двигун має швидкісну зовнішню характеристику N(ω), яку
//     будують за емпіричною формулою;
//   * тяговий електродвигун має дві ділянки — сталого моменту до базової
//     частоти й сталої потужності вище неї;
//   * у послідовного гібрида (REEV) на колесах стоїть лише електродвигун, а
//     ДВЗ обертає генератор, тому його крива не є тяговою.
//
// Тому модуль повертає не «криву», а перелік кривих із зазначенням, яка з них
// тягова. Нічого не вигадується: для ДВЗ використано формулу й таблицю
// джерела, для електродвигуна — означення двох ділянок за Ehsani.
export function createTractionCharacteristic({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;

  // Одна перевірка числа на весь проєкт: Number() приймає null, true й "" і
  // мовчки робить із них 0 та 1, а Number.isFinite їх пропускає.
  const { finiteNumber, plainNumber } = (function loadNumeric() {
    const scope = typeof window === "object" ? window : globalThis;
    if (!scope.VehicleNumeric && typeof module === "object" && module.exports) {
      require("./numeric.js");
    }
    return scope.VehicleNumeric;
  })();


  // Коефіцієнти співвідношення Лейдермана—Хлистова за Szpica (2019).
  //
  //   P = P_max·[A·ξ + B·ξ² − C·ξ³],   T = T_Pmax·[A + B·ξ − C·ξ²],   ξ = n/n_Pmax
  //
  // Класичні значення (карбюратор 1,0/1,0/1,0; дизелі 0,5/1,5, 0,7/1,3, 0,6/1,4)
  // визначено для конструкцій, яких сучасний автомобіль не має, і карбюраторних
  // двигунів не випускають. Тому тут — коефіцієнти, ідентифіковані на
  // барабанному стенді для шести систем живлення, які існують сьогодні.
  //
  // C не є вільним: при ξ = 1 має бути P = P_max, звідки A + B − C = 1
  // (рівняння (9) джерела). Тому C обчислюється, а не переписується.
  const SUPPLY_SYSTEMS = Object.freeze([
    {
      id: "petrol-injection",
      label: "Бензиновий, розподілене впорскування, без наддуву",
      a: 0.511162, b: 1.617855, samples: 237,
      confidence: { a: 0.477565, b: 1.534683 }
    },
    {
      id: "petrol-turbo",
      label: "Бензиновий з турбонаддувом",
      a: 0.295132, b: 2.120719, samples: 9,
      confidence: { a: 0.098739, b: 1.613545 },
      limitations: [
        "Дев'ять зразків — джерело прямо зазначає, що для статистичної оцінки цього замало.",
        "Для двигунів із турбонаддувом і іскровим запалюванням джерело радить іншу функцію (поліном), бо ця форма опису для них недостатня."
      ]
    },
    {
      id: "lpg-early",
      label: "Іскрове запалювання, ГБО I—II покоління",
      a: 0.570199, b: 1.574281, samples: 64,
      confidence: { a: 0.511813, b: 1.429668 }
    },
    {
      id: "lpg-iv",
      label: "Іскрове запалювання, ГБО IV покоління",
      a: 0.542335, b: 1.544406, samples: 23,
      confidence: { a: 0.437003, b: 1.310846 }
    },
    {
      id: "diesel-na",
      label: "Дизель без наддуву",
      a: 0.738505, b: 1.194464, samples: 11,
      confidence: { a: 0.539064, b: 0.735096 },
      limitations: [
        "Одинадцять зразків — джерело прямо зазначає, що для статистичної оцінки цього замало."
      ]
    },
    {
      id: "diesel-turbo",
      label: "Дизель із турбонаддувом",
      a: 0.261225, b: 2.568185, samples: 175,
      confidence: { a: 0.189442, b: 2.399555 },
      limitations: [
        "На малих частотах обертання розбіжність із дослідом сягає 50 % і стабілізується біля 5 % лише вище."
      ]
    }
  ].map(row => Object.freeze({ ...row, c: finiteNumber((row.a + row.b - 1).toFixed(6)) })));

  const MINIMUM_ANGULAR_SPEED = 80;

  function coefficients(id) {
    return SUPPLY_SYSTEMS.find(item => item.id === id) || null;
  }

  // Система живлення, а не «карбюратор чи дизель»: саме вона визначає форму
  // характеристики в цій моделі. Наддув доводиться питати окремо — з паспорта
  // прототипу він не випливає.
  function supplySystemFor({ energyCarrier, turbocharged }) {
    if (energyCarrier === "diesel") return turbocharged ? "diesel-turbo" : "diesel-na";
    if (energyCarrier === "lpg") return "lpg-iv";
    if (energyCarrier === "gasoline") return turbocharged ? "petrol-turbo" : "petrol-injection";
    return null;
  }

  // Верхня межа ряду ω. Двигун з іскровим запалюванням розкручується за
  // частоту максимальної потужності, дизель — ні: його обмежує регулятор.
  const SPARK_IGNITION = ["petrol-injection", "petrol-turbo", "lpg-early", "lpg-iv"];

  function upperAngularSpeed({ coefficientId, ratedAngularSpeed, overspeedFactor = 1.2 }) {
    return SPARK_IGNITION.includes(coefficientId)
      ? ratedAngularSpeed * overspeedFactor
      : ratedAngularSpeed;
  }

  // P = P_max·[A·ξ + B·ξ² − C·ξ³]; T = 1000·P/ω. C обчислено як A + B − 1, тому
  // при ξ = 1 крива проходить рівно через P_max.
  function enginePointAt(angularSpeed, rated, power, row) {
    const ratio = angularSpeed / rated;
    const powerKw = power * (row.a * ratio + row.b * ratio * ratio - row.c * ratio * ratio * ratio);
    return { angularSpeed, ratio, powerKw, torqueNm: 1000 * powerKw / angularSpeed };
  }

  function speedCharacteristic({
    maxPowerKw, ratedAngularSpeed, coefficientId, pointCount = 7, overspeedFactor = 1.2,
    // Паливо, якого немає в таблиці джерела. Тоді будь-який вибраний рядок
    // описує іншу систему живлення, і крива не є апроксимацією за джерелом —
    // її не можна подавати як розрахунок.
    supplySystemCovered = true
  }) {
    if (!supplySystemCovered) {
      return {
        defined: false,
        reason: "Таблиця коефіцієнтів не містить цього палива: потрібна виміряна крива "
          + "або паспортні точки."
      };
    }
    const row = coefficients(coefficientId);
    const power = finiteNumber(maxPowerKw);
    const rated = finiteNumber(ratedAngularSpeed);
    if (!row) return { defined: false, reason: "Тип двигуна не визначено." };
    if (!Number.isFinite(power) || power <= 0) return { defined: false, reason: "Потрібна додатна N_max." };
    if (!Number.isFinite(rated) || rated <= MINIMUM_ANGULAR_SPEED) {
      return { defined: false, reason: `Потрібна ω_N понад ${MINIMUM_ANGULAR_SPEED} с⁻¹.` };
    }
    const top = upperAngularSpeed({ coefficientId, ratedAngularSpeed: rated, overspeedFactor });
    const count = Math.max(2, Math.round(pointCount));
    const step = (top - MINIMUM_ANGULAR_SPEED) / (count - 1);

    const speeds = [];
    for (let index = 0; index < count; index += 1) {
      speeds.push(MINIMUM_ANGULAR_SPEED + step * index);
    }
    // Джерело: «серед обраних значень обов'язково повинно бути ω_N». Найближчу
    // точку зсуваємо на ω_N, а не додаємо зайву, щоб кількість точок лишалася
    // такою, яку задає джерело.
    if (!speeds.some(value => Math.abs(value - rated) < 1e-9)) {
      let nearest = 0;
      speeds.forEach((value, index) => {
        if (Math.abs(value - rated) < Math.abs(speeds[nearest] - rated)) nearest = index;
      });
      speeds[nearest] = rated;
    }

    const points = speeds.map(angularSpeed => enginePointAt(angularSpeed, rated, power, row));

    const peak = points.reduce((best, point) => (point.powerKw > best.powerKw ? point : best), points[0]);
    const peakTorque = points.reduce((best, point) => (point.torqueNm > best.torqueNm ? point : best), points[0]);
    return {
      defined: true,
      kind: "engine",
      coefficients: row,
      minimumAngularSpeed: MINIMUM_ANGULAR_SPEED,
      ratedAngularSpeed: rated,
      maximumAngularSpeed: top,
      points,
      peakPower: peak,
      peakTorque,
      sourceRefs: ["source.method.szpica-leiderman-khlystov"],
      limitations: row.limitations || []
    };
  }

  // Щільна лінія відомої аналітичної формули — лише для рисунка. Сім точок
  // таблиці, їхні екстремуми й усі наступні розрахунки залишаються незмінними.
  // Виміряні та паспортні характеристики з'єднують тільки їхні власні точки.
  function displayPoints(curve) {
    const points = curve?.points || [];
    if (!curve?.defined || curve.kind !== "engine" || !curve.coefficients) return points;
    const rated = points.find(point => Math.abs(point.angularSpeed - curve.ratedAngularSpeed) < 1e-9);
    if (!rated || points.length < 2) return points;
    const row = curve.coefficients;
    const power = rated.powerKw / (row.a + row.b - row.c);
    const anchors = new Map(points.map(point => [point.angularSpeed, point]));
    const minimum = Math.min(...anchors.keys());
    const maximum = Math.max(...anchors.keys());
    const speeds = new Set(anchors.keys());
    for (let index = 0; index <= 160; index += 1) {
      speeds.add(minimum + (maximum - minimum) * index / 160);
    }
    return [...speeds].sort((a, b) => a - b).map(angularSpeed => anchors.get(angularSpeed)
      || enginePointAt(angularSpeed, curve.ratedAngularSpeed, power, row));
  }

  // Полиця максимального моменту.
  //
  // Кубічна залежність дає для моменту параболу T = T_Pmax[A + B·ξ − C·ξ²] —
  // з ОДНИМ максимумом. Сучасний наддувний двигун тримає T_max у широкому
  // діапазоні частот, і жодні коефіцієнти цього не відтворять: справа у формі
  // функції, а не в числах. Обидва джерела кажуть це прямо — Szpica (висновок
  // 6) радить для наддувних іскрових двигунів іншу функцію, Псьол і Мазур
  // зазначають суттєві похибки для двигунів «які мають близький до постійного
  // крутний момент у широкому діапазоні частот обертання».
  //
  // Тому для такого двигуна крива не апроксимується, а СКЛАДАЄТЬСЯ з ділянок
  // за паспортними точками: зростання моменту до n1, полиця T_max від n1 до
  // n2, далі зростання потужності до P_max при n_Pmax і ділянка сталої
  // потужності. Жодного підібраного коефіцієнта тут немає — є лише відрізки
  // між оголошеними точками, і кожну з них видно в паспорті двигуна.
  function plateauCharacteristic({
    maxTorqueNm, plateauFromAngularSpeed, plateauToAngularSpeed,
    maxPowerKw, ratedAngularSpeed, maximumAngularSpeed, pointCount = 11,
    // Полиця потужності існує не в кожного двигуна. Її беруть із паспорта
    // («110 кВт при 5000—6000 об/хв»), і без такої вказівки крива має
    // закінчуватися на n_Pmax, а не продовжуватися здогадом.
    powerHeldToAngularSpeed = null
  }) {
    const torque = finiteNumber(maxTorqueNm);
    const from = finiteNumber(plateauFromAngularSpeed);
    const to = finiteNumber(plateauToAngularSpeed);
    const power = finiteNumber(maxPowerKw);
    const rated = finiteNumber(ratedAngularSpeed);
    const top = finiteNumber(maximumAngularSpeed);
    const finite = [torque, from, to, power, rated, top].every(Number.isFinite);
    if (!finite) return { defined: false, reason: "Потрібні T_max, межі полиці, P_max, n_Pmax і n_max." };
    if (![torque, from, to, power, rated, top].every(value => value > 0)) {
      return { defined: false, reason: "Усі величини мають бути додатними." };
    }
    if (rated <= MINIMUM_ANGULAR_SPEED) {
      return {
        defined: false,
        reason: `Частота максимальної потужності має перевищувати ${MINIMUM_ANGULAR_SPEED} с⁻¹, `
          + "інакше сітка точок вийде за межі самої кривої."
      };
    }
    if (!(to >= from)) return { defined: false, reason: "Полиця має закінчуватися не раніше, ніж починається." };
    if (!(rated >= to)) return { defined: false, reason: "Частота максимальної потужності не може бути нижчою за кінець полиці." };
    if (!(top >= rated)) return { defined: false, reason: "Максимальна частота не може бути нижчою за n_Pmax." };
    // Number(null) дорівнює 0, а не NaN, тому «не задано» перевіряється явно.
    const powerHeldTo = powerHeldToAngularSpeed === null || powerHeldToAngularSpeed === undefined
      || !Number.isFinite(finiteNumber(powerHeldToAngularSpeed))
      ? rated
      : finiteNumber(powerHeldToAngularSpeed);
    if (powerHeldTo < rated || powerHeldTo > top) {
      return { defined: false, reason: "Полиця потужності має лежати між n_Pmax і максимальною частотою." };
    }

    // Дві перевірки, і обидві потрібні.
    //
    // На кінці полиці потужність уже дорівнює T_max·ω₂ і не може перевищувати
    // заявлену P_max. І навпаки: момент при максимальній потужності дорівнює
    // 1000·P_max/ω_Pmax і не може перевищувати заявлений T_max — інакше крива
    // проходила б вище власного максимуму моменту. Раніше стояла лише перша, і
    // пара 250 Н·м / 180 кВт при 5000 об/хв давала «дійсну» криву з 344 Н·м.
    const powerAtPlateauEnd = torque * to / 1000;
    if (powerAtPlateauEnd > power * (1 + 1e-9)) {
      return {
        defined: false,
        reason: `Неузгоджені дані: на кінці полиці ${powerAtPlateauEnd.toFixed(1)} кВт `
          + `перевищує заявлену P_max = ${power.toFixed(1)} кВт.`
      };
    }
    const torqueAtRated = 1000 * power / rated;
    if (torqueAtRated > torque * (1 + 1e-9)) {
      return {
        defined: false,
        reason: `Неузгоджені дані: при P_max момент ${torqueAtRated.toFixed(1)} Н·м `
          + `перевищує заявлений T_max = ${torque.toFixed(1)} Н·м.`
      };
    }

    // Крива не тягнеться далі, ніж її підтверджують дані.
    const curveTop = powerHeldTo;
    const count = Math.max(4, Math.round(pointCount));
    const speeds = new Set([from, to, rated, curveTop]);
    const step = (curveTop - MINIMUM_ANGULAR_SPEED) / (count - 1);
    for (let index = 0; index < count; index += 1) speeds.add(MINIMUM_ANGULAR_SPEED + step * index);

    const points = [...speeds].filter(value => value > 0).sort((a, b) => a - b).map(angularSpeed => {
      let torqueNm;
      let region;
      if (angularSpeed < from) {
        // Момент зростає до полиці. Відрізок прямий: проміжних паспортних
        // точок немає, і вигадувати їх немає підстав.
        region = "rising";
        const share = angularSpeed / from;
        torqueNm = torque * share;
      } else if (angularSpeed <= to) {
        region = "plateau";
        torqueNm = torque;
      } else if (angularSpeed <= rated) {
        // Потужність зростає від кінця полиці до P_max.
        region = "to-rated";
        const share = rated > to ? (angularSpeed - to) / (rated - to) : 1;
        const powerKw = powerAtPlateauEnd + (power - powerAtPlateauEnd) * share;
        torqueNm = 1000 * powerKw / angularSpeed;
      } else {
        region = "constant-power";
        torqueNm = 1000 * power / angularSpeed;
      }
      return { angularSpeed, ratio: angularSpeed / rated, powerKw: torqueNm * angularSpeed / 1000, torqueNm, region };
    });

    return {
      defined: true,
      kind: "engine-plateau",
      maxTorqueNm: torque,
      plateau: { from, to },
      ratedAngularSpeed: rated,
      maximumAngularSpeed: curveTop,
      governedAngularSpeed: top,
      powerHeldToAngularSpeed: powerHeldTo > rated ? powerHeldTo : null,
      points,
      peakPower: points.reduce((best, point) => (point.powerKw > best.powerKw ? point : best), points[0]),
      // З побудованих точок, а не з оголошеної полиці: якщо крива десь вища за
      // T_max, це має бути видно, а не приховане підстановкою полиці.
      peakTorque: points.reduce((best, point) => (point.torqueNm > best.torqueNm ? point : best), points[0]),
      sourceRefs: ["source.project-input"],
      method: "project-interpolation-between-datasheet-points",
      limitations: [
        "Крива складена з паспортних точок двигуна, а не апроксимована: між ними взято прямі відрізки. Це прозора інтерполяція цього проєкту, а не метод із джерела.",
        "Ділянка до полиці описана найгрубіше — паспорт зазвичай не подає моменту на низьких частотах.",
        powerHeldTo > rated
          ? "Ділянку сталої потужності побудовано за паспортним діапазоном максимальної потужності."
          : "Понад n_Pmax крива не продовжується: паспорт діапазону максимальної потужності не подає."
      ]
    };
  }

  // Тяговий електродвигун: до базової частоти момент сталий, вище — стала
  // потужність. Це ідеалізація двох ділянок: таблиці емпіричних коефіцієнтів
  // вона не потребує, але й реального двигуна не описує повністю — зокрема,
  // не показує обмеження за нагрівом, через яке тривала крива лежить нижче за
  // короткочасну. Зняті точки мають перевагу над нею.
  function motorCharacteristic({ peakPowerKw, baseAngularSpeed, maximumAngularSpeed, pointCount = 9 }) {
    const power = finiteNumber(peakPowerKw);
    const base = finiteNumber(baseAngularSpeed);
    const top = finiteNumber(maximumAngularSpeed);
    if (!Number.isFinite(power) || power <= 0) return { defined: false, reason: "Потрібна додатна потужність." };
    if (!Number.isFinite(base) || base <= 0) return { defined: false, reason: "Потрібна додатна базова частота." };
    if (!Number.isFinite(top) || top < base) return { defined: false, reason: "Максимальна частота менша за базову." };

    const constantTorqueNm = 1000 * power / base;
    const count = Math.max(2, Math.round(pointCount));
    const step = top / (count - 1);
    const speeds = [];
    for (let index = 0; index < count; index += 1) speeds.push(step * index || step * 0.05);
    if (!speeds.some(value => Math.abs(value - base) < 1e-9)) {
      let nearest = 0;
      speeds.forEach((value, index) => {
        if (Math.abs(value - base) < Math.abs(speeds[nearest] - base)) nearest = index;
      });
      speeds[nearest] = base;
    }

    const points = speeds.map(angularSpeed => {
      const belowBase = angularSpeed <= base;
      const torqueNm = belowBase ? constantTorqueNm : 1000 * power / angularSpeed;
      return {
        angularSpeed,
        ratio: angularSpeed / base,
        powerKw: torqueNm * angularSpeed / 1000,
        torqueNm,
        region: belowBase ? "constant-torque" : "constant-power"
      };
    });

    return {
      defined: true,
      kind: "motor",
      constantTorqueNm,
      baseAngularSpeed: base,
      maximumAngularSpeed: top,
      points,
      peakPower: points.reduce((best, point) => (point.powerKw > best.powerKw ? point : best), points[0]),
      peakTorque: points[0],
      sourceRefs: ["source.method.ehsani-electric-traction"]
    };
  }

  // Що саме будувати для цієї силової установки. Повертається перелік, бо в
  // гібрида джерел тяги справді два, а в послідовного гібрида крива ДВЗ узагалі
  // не тягова — і саме це має бути видно, а не приховане.
  // Виміряна або паспортна крива, введена таблицею.
  //
  // Апроксимація потрібна лише тоді, коли кривої немає. Якщо вона є — зняті на
  // стенді точки або графік із паспорта, — то це найкраще свідчення, і жодна
  // емпірична залежність його не поліпшить. Тому таблиця точок є повноправним
  // третім способом задати характеристику, а не запасним.
  //
  // Формат рядка: частота, потужність[, момент]. Роздільник — кома, крапка з
  // комою або табуляція; десятковий знак — крапка або кома. Заголовок
  // необов'язковий і розпізнається за тим, що в першому полі немає числа.
  // Який стовпець другий — потужність чи момент. Заголовок читається, бо
  // таблиця його зазвичай має; якщо ні, стовпець називає викликач. Мовчазне
  // припущення тут коштувало б дорого: 250 у стовпці моменту, прочитані як
  // кіловати, дали б 2387 Н·м і криву, якої не існує.
  function detectValueColumn(headerFields) {
    const second = (headerFields[1] || "").toLowerCase();
    if (/^(m|t|мом|момент|torque)|н·м|н\.м|nm/.test(second)) return "torque";
    if (/^(n|p|пот|потуж|power)|квт|kw/.test(second)) return "power";
    return null;
  }

  const VALUE_COLUMNS = Object.freeze(["power", "torque"]);

  function parseCharacteristicPoints(text, { speedUnit = "rpm", valueColumn } = {}) {
    if (valueColumn !== undefined && !VALUE_COLUMNS.includes(valueColumn)) {
      return {
        points: [],
        valueColumn: null,
        problems: [`Невідомий стовпець «${valueColumn}»: дозволено лише power або torque.`]
      };
    }
    let column = valueColumn || null;
    const rows = String(text || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const points = [];
    const problems = [];

    rows.forEach((line, index) => {
      // Кома не може бути водночас роздільником полів і десятковим знаком, і
      // в українських таблицях вона зазвичай десяткова: Excel розділяє поля
      // крапкою з комою. Тому роздільник визначається для кожного рядка: якщо
      // є «;» або табуляція — це вони, і кома лишається в числі.
      const separator = /[;\t]/.test(line) ? /[;\t]/ : /[,\s]+/;
      const fields = line.split(separator).map(field => field.trim()).filter(Boolean);
      if (!fields.length) return;
      const numbers = fields.map(field => finiteNumber(field.replace(",", ".")));
      if (numbers.some(value => !Number.isFinite(value))) {
        if (index === 0) {
          // Заголовок: саме з нього видно, що стоїть у другому стовпці.
          if (!valueColumn) column = detectValueColumn(fields);
          return;
        }
        problems.push(`Рядок ${index + 1}: не число — «${line}».`);
        return;
      }
      const [speed, second, third] = numbers;
      if (!(speed > 0)) {
        problems.push(`Рядок ${index + 1}: частота має бути додатною.`);
        return;
      }
      // Поки не відомо, що в стовпці, число лишається без назви: приписати
      // йому одиницю навмання — саме те, чого ця перевірка уникає.
      const point = { angularSpeed: speedUnit === "rpm" ? speed * Math.PI / 30 : speed };
      if (!column) {
        point.unlabelled = second;
        if (third !== undefined) point.unlabelledSecond = third;
        points.push(point);
        return;
      }
      if (column === "torque") {
        point.torqueNm = second;
        if (third !== undefined) point.powerKw = third;
      } else {
        point.powerKw = second;
        if (third !== undefined) point.torqueNm = third;
      }
      points.push(point);
    });

    // Без заголовка і без вказівки стовпець лишається неоднозначним. Мовчки
    // вважати його потужністю — саме та помилка, якої тут уникають.
    if (!column && points.length) {
      problems.push(
        "Не видно, що в другому стовпці: додайте заголовок (наприклад «n; M») "
        + "або вкажіть стовпець явно.");
      // Точки повертаються без назви величини, тому побудувати з них криву не
      // вийде — і це правильно: неоднозначність має зупиняти, а не тлумачитися.
      return { points: [], unlabelledPoints: points, problems, valueColumn: null };
    }
    return { points, problems, valueColumn: column };
  }

  function measuredCharacteristic({ points, tolerance = 0.02, kind = "engine-measured" }) {
    const rows = Array.isArray(points) ? points.filter(row => row && row.angularSpeed > 0) : [];
    if (rows.length < 3) {
      return { defined: false, reason: "Потрібно щонайменше три точки кривої." };
    }
    const ordered = [...rows].sort((a, b) => a.angularSpeed - b.angularSpeed);
    const problems = [];

    const resolved = ordered.map((row, index) => {
      const hasPower = Number.isFinite(row.powerKw) && row.powerKw >= 0;
      const hasTorque = Number.isFinite(row.torqueNm) && row.torqueNm >= 0;
      if (!hasPower && !hasTorque) {
        problems.push(`Точка ${index + 1}: немає ні потужності, ні моменту.`);
        return null;
      }
      const powerKw = hasPower ? row.powerKw : row.torqueNm * row.angularSpeed / 1000;
      const torqueNm = hasTorque ? row.torqueNm : 1000 * row.powerKw / row.angularSpeed;
      // Якщо задано і те, і те, вони мають узгоджуватися: P = Tω/1000. Мовчки
      // прийняти суперечливу пару означало б показати графік, якого немає в
      // жодному з двох стовпців.
      if (hasPower && hasTorque) {
        const implied = torqueNm * row.angularSpeed / 1000;
        if (Math.abs(implied - powerKw) > Math.max(tolerance * Math.max(powerKw, 1), 1e-9)) {
          problems.push(
            `Точка ${index + 1}: потужність ${powerKw.toFixed(1)} кВт і момент `
            + `${torqueNm.toFixed(1)} Н·м не узгоджуються (з моменту виходить ${implied.toFixed(1)} кВт).`);
        }
      }
      return { angularSpeed: row.angularSpeed, powerKw, torqueNm, region: "measured" };
    });

    if (problems.length) return { defined: false, reason: problems[0], problems };

    const peakPower = resolved.reduce((best, point) => (point.powerKw > best.powerKw ? point : best), resolved[0]);
    const peakTorque = resolved.reduce((best, point) => (point.torqueNm > best.torqueNm ? point : best), resolved[0]);
    return {
      defined: true,
      kind,
      points: resolved.map(point => ({ ...point, ratio: point.angularSpeed / peakPower.angularSpeed })),
      ratedAngularSpeed: peakPower.angularSpeed,
      maximumAngularSpeed: resolved[resolved.length - 1].angularSpeed,
      peakPower,
      peakTorque,
      sourceRefs: ["source.project-input"],
      limitations: [
        "Крива задана точками: між ними значень не інтерпольовано, а поза крайніми точками її немає.",
        "Походження точок фіксує користувач — стенд, паспорт двигуна чи інше джерело."
      ]
    };
  }

  // Двигун із полицею моменту описується паспортними точками, без полінома;
  // решта — кубічною залежністю. Вибір робить наявність даних, а не здогад.
  // Виміряна крива електродвигуна має ту саму перевагу, що й у ДВЗ: модель
  // двох ділянок — ідеалізація, а зняті точки — ні. Вона потрібна тим більше,
  // що реальний тяговий двигун має ще й обмеження за нагрівом, якого дві
  // ідеальні ділянки не показують.
  function motorCurve(motor) {
    if (!motor) return { defined: false, reason: "Дані двигуна не задано." };
    return Array.isArray(motor.points) && motor.points.length
      ? measuredCharacteristic({ ...motor, kind: "motor-measured" })
      : motorCharacteristic(motor);
  }

  // Порядок переваги: виміряна крива, потім паспортна полиця, потім
  // апроксимація. Апроксимують лише тоді, коли кращого свідчення немає.
  function engineCurve(engine) {
    if (!engine) return { defined: false, reason: "Дані двигуна не задано." };
    if (Array.isArray(engine.points) && engine.points.length) return measuredCharacteristic(engine);
    if (engine.modelFamily === "modern") {
      const scope = typeof window === "object" ? window : globalThis;
      const model = scope.VehiclePowertrainDesign || (typeof require === "function" ? require("./powertrain-design.js") : null);
      return model ? model.engineEnvelope({ ...engine, supplySystemId: engine.coefficientId })
        : { defined: false, reason: "Модуль сучасної характеристики не завантажено." };
    }
    return engine.maxTorqueNm !== undefined && engine.plateauFromAngularSpeed !== undefined
      ? plateauCharacteristic(engine)
      : speedCharacteristic(engine);
  }

  // Чи передає ця машина момент на колеса — властивість трансмісії, а не
  // кривої, тому вона стоїть лише тут, на записі про джерело тяги. Раніше
  // кожна крива теж несла traction: true, і для REx запис і крива казали
  // протилежне.
  //
  // Схему визначає механічний зв'язок, а не торгова назва: «REx» у наборі
  // даних — це маркетингова позначка, і вона не доводить, що ДВЗ не з'єднаний
  // із колесами. Тому потрібне явне значення.
  const ENGINE_COUPLINGS = Object.freeze(["mechanical", "generator-only"]);

  function characteristics(context) {
    const { powertrain, engineCoupling, engine, motor } = context;
    if (powertrain === "conventional") {
      return [{ role: "engine", traction: true, curve: engineCurve(engine) }];
    }
    if (powertrain === "electric") {
      return [{ role: "motor", traction: true, curve: motorCurve(motor) }];
    }
    if (powertrain === "hybrid") {
      // Невідома схема з'єднання не робить невідомими самі криві: кожна з них
      // рахується зі своїх даних. Невідомим лишається одне — чи передає ДВЗ
      // момент на колеса, — і тільки це й позначається.
      const known = ENGINE_COUPLINGS.includes(engineCoupling);
      if (!known) {
        return [
          { role: "motor", traction: true, curve: motorCurve(motor) },
          {
            role: "engine",
            traction: null,
            undetermined: true,
            note: "Не задано, чи з'єднаний ДВЗ із колесами механічно. Без цього не можна "
              + "сказати, чи є його характеристика тяговою; позначка силової установки цього не доводить.",
            curve: engineCurve(engine)
          }
        ];
      }
      const generatorOnly = engineCoupling === "generator-only";
      return [
        { role: "motor", traction: true, curve: motorCurve(motor) },
        {
          role: "engine",
          traction: !generatorOnly,
          note: generatorOnly
            ? "ДВЗ обертає генератор і механічно з колесами не з'єднаний, тому його характеристика не є тяговою."
            : "ДВЗ механічно з'єднаний із колесами, тому обидва джерела можуть передавати момент.",
          curve: engineCurve(engine)
        }
      ];
    }
    return [];
  }

  // Крок розрахунку для канонічного документа. Без нього розділ 4.4 лишався б
  // лише екраном: ані у JSON, ані у звіті, ані в карті розрахунків його не
  // було б, хоч читач і бачив би криву.
  const MODE_METHODS = Object.freeze({
    measured: "measured-points",
    plateau: "datasheet-plateau-interpolation",
    approximation: "leiderman-khlystov-szpica-2019",
    "two-region": "constant-torque-then-constant-power"
  });

  // Найбільший момент двигуна як окреме канонічне значення.
  //
  // Досі це число жило лише всередині кривої, у полі peakTorque.torqueNm, і
  // кожен, кому воно було потрібне, діставав його звідти сам. Так уже
  // з'явилося чотири помилки поспіль, де читали на рівень мілкіше, ніж лежить
  // число, і щоразу виходив NaN замість помилки.
  //
  // Розділ 9 будує на ньому весь розрахунок зчеплення, тож момент має бути
  // тим, на що можна послатися: значенням із власним ідентифікатором, а не
  // полем чужого об'єкта.
  function buildMaximumTorqueStep({ curve, sourceRole = "engine", texNumber }) {
    const peak = curve.peakTorque;
    const isMotor = sourceRole === "motor";
    return {
      id: isMotor ? "maximum-motor-torque" : "maximum-engine-torque",
      title: isMotor ? "Максимальний крутний момент електродвигуна"
        : "Максимальний крутний момент двигуна",
      purpose: "Name the peak torque of the external characteristic as a value of its own.",
      output: {
        id: isMotor ? "value.maximum-motor-torque" : "value.maximum-engine-torque",
        symbol: isMotor ? "M_{\\mathrm{м,max}}" : "M_{\\mathrm{к,max}}",
        label: isMotor ? "Maximum motor torque" : "Maximum engine torque",
        valueType: "quantity",
        canonicalUnit: "N*m"
      },
      expression: "max of T(omega) over the external characteristic",
      dependencies: [`value.traction-characteristic-${sourceRole}`],
      equationNumber: sourceRole === "motor" ? "4.24" : null,
      formulaTex: `${isMotor ? "M_{\\mathrm{м,max}}" : "M_{\\mathrm{к,max}}"}`
        + "=\\max_{\\omega}T(\\omega)",
      substitutionTex: `${isMotor ? "M_{\\mathrm{м,max}}" : "M_{\\mathrm{к,max}}"}`
        + `=${texNumber(peak.torqueNm, 1)}`
        + `\\;\\mathrm{Н{\\cdot}м}\\ \\text{при}\\ `
        + `${texNumber(peak.angularSpeed * 30 / Math.PI, 0)}\\;\\mathrm{хв^{-1}}`,
      result: { value: peak.torqueNm, canonicalUnit: "N*m", displayUnit: "Н·м" },
      method: "peak-of-external-characteristic",
      sourceRefs: curve.sourceRefs || ["source.project-input"],
      readerNotes: [
        isMotor
          ? `Частота максимального моменту ${plainNumber(peak.angularSpeed * 30 / Math.PI, 0)} хв⁻¹.`
          : `Частота максимального моменту ${plainNumber(peak.angularSpeed * 30 / Math.PI, 0)} хв⁻¹ — `
            + (curve.kind === "engine-modern" ? "ряд передач додатково перевіряє повзучий хід і допустимий крок перемикання." : "вона ж задає знаменник геометричної прогресії ряду передач.")
      ],
      assumptions: [],
      limitations: [
        // Момент беруть із кривої, а крива вже несе свої застереження; тут
        // важливо сказати лише те, що це зовнішня характеристика, тобто повне
        // навантаження, а не робочий режим.
        "Це момент за зовнішньою характеристикою, тобто на повному навантаженні."
      ]
    };
  }

  function buildMaximumEngineAngularSpeedStep({ curve, sourceRole = "engine", texNumber }) {
    const maximumAngularSpeed = curve.maximumAngularSpeed;
    const isMotor = sourceRole === "motor";
    return {
      id: isMotor ? "maximum-motor-angular-speed" : "maximum-engine-angular-speed",
      title: isMotor ? "Найбільша частота обертання електродвигуна"
        : "Найбільша частота обертання двигуна",
      purpose: "Name the upper speed of the external characteristic as a value of its own.",
      output: {
        id: isMotor ? "value.motor-maximum-angular-speed" : "value.engine-maximum-angular-speed",
        symbol: isMotor ? "\\omega_{\\mathrm{м,max}}" : "\\omega_{\\mathrm{д,max}}",
        label: isMotor ? "Maximum motor angular speed" : "Maximum engine angular speed",
        valueType: "quantity",
        canonicalUnit: "1/s"
      },
      expression: "maximum angular speed of the external characteristic",
      dependencies: [`value.traction-characteristic-${sourceRole}`],
      equationNumber: sourceRole === "motor" ? "4.25" : null,
      formulaTex: `${isMotor ? "\\omega_{\\mathrm{м,max}}" : "\\omega_{\\mathrm{д,max}}"}`
        + "=\\max_{\\omega\\in\\mathrm{characteristic}}\\omega",
      substitutionTex: `${isMotor ? "\\omega_{\\mathrm{м,max}}" : "\\omega_{\\mathrm{д,max}}"}`
        + `=${texNumber(maximumAngularSpeed, 1)}`
        + "\\;\\mathrm{с^{-1}}",
      result: { value: maximumAngularSpeed, canonicalUnit: "1/s", displayUnit: "с⁻¹" },
      method: "upper-bound-of-external-characteristic",
      sourceRefs: curve.sourceRefs || ["source.project-input"],
      readerNotes: [
        `Найбільша частота становить ${plainNumber(maximumAngularSpeed * 30 / Math.PI, 0)} хв⁻¹.`
      ],
      assumptions: [],
      limitations: [
        "Це верхня межа зовнішньої характеристики, а не частота робочого режиму."
      ]
    };
  }

  // Джерело тяги — однією величиною, незалежно від того, яка це машина.
  //
  // Розділ 11 бере момент і частоту тієї машини, яка ВЕДЕ КОЛЕСА. Аркуш engdoc
  // імпортує величину за ОДНИМ незмінним ідентифікатором, а «та з двох, що
  // веде колеса» ним не виражається, тож вибір робить розділ 4 — там, де
  // відомо, хто веде колеса. Для послідовного гібрида це електромашина: крива
  // ДВЗ існує, але механічного зв'язку з колесами немає.
  //
  // Це ПРИЙНЯТЕ ЗНАЧЕННЯ, а не розрахунок. Спершу я зробив із нього крок із
  // виразом «величина машини, яка веде колеса» — і це був рукописний
  // розрахунок, який нічого не рахує: легасі-набір R-1 виріс на чотири кроки,
  // хоча жодної нової арифметики в книжці не з'явилося. AdoptedValue для
  // цього й існує: він несе sourceValueRef — оголошену величину, з якої його
  // взято, — і саме він, а не вигаданий крок, є псевдонімом.
  function tractionSourceAliases({ sourceRole = "engine" } = {}) {
    const isMotor = sourceRole === "motor";
    const machine = isMotor ? "електромашина" : "ДВЗ";
    const rationale = `Колеса веде ${machine}, тому джерелом тяги для `
      + "подальших розділів є саме воно. Вибір роблять за механічним зв'язком: "
      + "у послідовного гібрида крива ДВЗ існує, а колеса він не веде.";
    return [
      {
        id: "value.traction-source-maximum-torque",
        kind: "ValueAlias",
        symbol: "M_{\\mathrm{дж,max}}",
        label: "Maximum torque of the traction source",
        aliasOf: isMotor
          ? "value.maximum-motor-torque" : "value.maximum-engine-torque",
        canonicalUnit: "N*m",
        rationale,
        sourceRefs: ["source.project-derivation"]
      },
      {
        id: "value.traction-source-maximum-angular-speed",
        kind: "ValueAlias",
        symbol: "\\omega_{\\mathrm{дж,max}}",
        label: "Maximum angular speed of the traction source",
        aliasOf: isMotor
          ? "value.motor-maximum-angular-speed" : "value.engine-maximum-angular-speed",
        canonicalUnit: "1/s",
        rationale,
        sourceRefs: ["source.project-derivation"]
      }
    ];
  }

  // Curve results stay series. A worked point from each active model region
  // explains the construction without replacing the curve by a peak scalar.
  function characteristicSubstitution(source, texNumber) {
    const { curve, mode } = source, peak = curve.peakPower;
    const t = (value, digits = 6) => texNumber(value, digits);
    const rows = [];
    if (curve.kind === "engine-modern") {
      const p = curve.parameters, rated = curve.ratedAngularSpeed;
      const idle = curve.minimumAngularSpeed, w1 = curve.plateauFromAngularSpeed, w2 = curve.plateauToAngularSpeed;
      const low = curve.points.reduce((best, point) => Math.abs(point.angularSpeed - (idle + w1) / 2) < Math.abs(best.angularSpeed - (idle + w1) / 2) ? point : best);
      const high = curve.points.reduce((best, point) => Math.abs(point.angularSpeed - (w2 + rated) / 2) < Math.abs(best.angularSpeed - (w2 + rated) / 2) ? point : best);
      const plateauEnd = curve.points.find(point => point.angularSpeed === w2);
      const x = (low.angularSpeed - idle) / (w1 - idle), y = (high.angularSpeed - w2) / (rated - w2);
      rows.push(`T_m&=\\frac{1000\\cdot${t(peak.powerKw)}}{${t(rated)}}\\cdot${t(p.factor)}=${t(curve.peakTorque.torqueNm)}\\;\\mathrm{Н\\cdot м}`,
        `\\omega_1&=${t(p.bandStart)}\\cdot${t(rated)}=${t(w1)},\\quad\\omega_2=${t(p.bandEnd)}\\cdot${t(rated)}=${t(w2)}\\;\\mathrm{рад/с}`,
        `p&=\\frac{${t(p.factor)}(1-${t(p.bandEnd)})}{1-${t(p.factor)}\\cdot${t(p.bandEnd)}}=${t(p.exponent)}`,
        `x&=\\frac{${t(low.angularSpeed)}-${t(idle)}}{${t(w1)}-${t(idle)}}=${t(x)}`,
        `T(${t(low.angularSpeed, 3)})&=${t(curve.peakTorque.torqueNm)}\\left[${t(p.lowFraction)}+(1-${t(p.lowFraction)})(3\\cdot${t(x)}^2-2\\cdot${t(x)}^3)\\right]=${t(low.torqueNm)}\\;\\mathrm{Н\\cdot м}`,
        `P(${t(low.angularSpeed, 3)})&=\\frac{${t(low.torqueNm)}\\cdot${t(low.angularSpeed)}}{1000}=${t(low.powerKw)}\\;\\mathrm{кВт}`,
        `P_2&=\\frac{${t(plateauEnd.torqueNm)}\\cdot${t(w2)}}{1000}=${t(plateauEnd.powerKw)}\\;\\mathrm{кВт}`,
        `y&=\\frac{${t(high.angularSpeed)}-${t(w2)}}{${t(rated)}-${t(w2)}}=${t(y)}`,
        `P(${t(high.angularSpeed, 3)})&=${t(peak.powerKw)}-(${t(peak.powerKw)}-${t(plateauEnd.powerKw)})(1-${t(y)})^{${t(p.exponent)}}=${t(high.powerKw)}\\;\\mathrm{кВт}`,
        `T(${t(high.angularSpeed, 3)})&=\\frac{1000\\cdot${t(high.powerKw)}}{${t(high.angularSpeed)}}=${t(high.torqueNm)}\\;\\mathrm{Н\\cdot м}`);
    } else if (mode === "approximation") {
      const point = curve.points[0], c = curve.coefficients;
      const ratedPoint = curve.points.find(item => Math.abs(item.angularSpeed - curve.ratedAngularSpeed) < 1e-9);
      rows.push(`\\xi&=\\frac{${t(point.angularSpeed)}}{${t(curve.ratedAngularSpeed)}}=${t(point.ratio)}`,
        `P&=${t(ratedPoint.powerKw)}\\left[${t(c.a)}\\cdot${t(point.ratio)}+${t(c.b)}\\cdot${t(point.ratio)}^2-${t(c.c)}\\cdot${t(point.ratio)}^3\\right]=${t(point.powerKw)}\\;\\mathrm{кВт}`,
        `T&=\\frac{1000\\cdot${t(point.powerKw)}}{${t(point.angularSpeed)}}=${t(point.torqueNm)}\\;\\mathrm{Н\\cdot м}`);
    } else if (mode === "two-region") {
      const low = curve.points[0], high = curve.points.at(-1);
      rows.push(`T_b&=\\frac{1000\\cdot${t(peak.powerKw)}}{${t(curve.baseAngularSpeed)}}=${t(curve.constantTorqueNm)}\\;\\mathrm{Н\\cdot м}`,
        `P(${t(low.angularSpeed, 3)})&=\\frac{${t(low.torqueNm)}\\cdot${t(low.angularSpeed)}}{1000}=${t(low.powerKw)}\\;\\mathrm{кВт}`,
        `T(${t(high.angularSpeed, 3)})&=\\frac{1000\\cdot${t(high.powerKw)}}{${t(high.angularSpeed)}}=${t(high.torqueNm)}\\;\\mathrm{Н\\cdot м}`);
    } else {
      rows.push(`P_{\\max}&=${t(peak.powerKw, 3)}\\;\\mathrm{кВт}\\quad(\\omega=${t(peak.angularSpeed, 3)}\\;\\mathrm{рад/с})`,
        `T_{\\max}&=${t(curve.peakTorque.torqueNm, 3)}\\;\\mathrm{Н\\cdot м}\\quad\\text{за заданими точками}`);
    }
    return `\\begin{aligned}${rows.join("\\\\[3pt]")}\\end{aligned}`;
  }

  function buildCharacteristicStep({ source, texNumber }) {
    const { role, mode, curve, traction, provenance, supplySystem, ratingBasis } = source;
    const isMotor = role === "motor";
    const modern = curve.kind === "engine-modern";
    const sourceRefs = modern ? ["source.project-derivation"] : mode === "measured"
      ? ["source.project-input"]
      : mode === "approximation"
        ? ["source.method.szpica-leiderman-khlystov"]
        : isMotor
          ? ["source.method.ehsani-electric-traction"]
          : ["source.project-input"];

    return {
      id: `traction-characteristic-${role}`,
      title: isMotor
        ? "Зовнішня характеристика електродвигуна"
        : "Зовнішня швидкісна характеристика ДВЗ",
      purpose: "Establish the power and torque available from this traction source.",
      // Вихід — крива, а не потужність: у кожній точці є частота, потужність і
      // момент. Одиниця тут була б такою самою неправдою, як і в результаті.
      output: {
        id: `value.traction-characteristic-${role}`,
        symbol: isMotor ? "P_{\\mathrm{м}}(\\omega)" : "P_{\\mathrm{д}}(\\omega)",
        label: `Characteristic of the ${role}`,
        valueType: "list",
        canonicalUnit: null
      },
      expression: modern ? "C1 torque-rise / torque-plateau / power-rise envelope; P=T*omega/1000" : mode === "approximation"
        ? "P_max * (A * xi + B * xi^2 - C * xi^3)"
        : "curve points",
      // Кожен режим має свої входи, і всі вони мають бути оголошені: інакше з
      // документа не видно, чому крива змінилася. Основа паспортних значень і
      // зв'язок із колесами входять сюди ж — вони теж змінюють висновок.
      dependencies: [
        ...(mode === "approximation"
          ? ["decision.supply-system", "input.engine-max-power", "input.engine-rated-speed", ...(modern ? ["input.vehicle-category"] : [])]
          : []),
        ...(mode === "plateau"
          ? [
            "input.engine-max-power", "input.engine-rated-speed",
            "input.engine-max-torque", "input.engine-plateau-from", "input.engine-plateau-to",
            // Лише коли паспорт справді подає діапазон максимальної потужності:
            // оголошувати вхід, якого немає, означало б залежність без значення.
            ...(curve.powerHeldToAngularSpeed ? ["input.engine-power-held-to"] : [])
          ]
          : []),
        ...(mode === "two-region"
          ? [
            "input.motor-peak-power", "input.motor-base-speed", "input.motor-maximum-speed",
            // x впливає на криву лише тоді, коли він і дав базову частоту:
            // паспортна базова частота не залежить від прийнятого x.
            ...(source.baseSpeedFromRatio ? ["input.motor-speed-ratio"] : [])
          ]
          : []),
        ...(mode === "measured" ? [`input.${role}-curve-points`] : []),
        // Своєї машини, а не спільна: у ДВЗ і електродвигуна основа паспортних
        // значень різна за природою, і гібрид цілком природно має тривалу
        // потужність ДВЗ разом із піковою потужністю електродвигуна.
        `decision.${source.role === "motor" ? "motor" : "engine"}-rating-basis`,
        ...(isMotor ? [] : ["decision.engine-coupling"])
      ],
      equationNumber: isMotor ? "4.23" : mode === "approximation" ? "4.7" : null,
      formulaTex: modern ? (typeof window === "object" ? window : globalThis).VehiclePowertrainDesign.engineFormulaTex
        : mode === "approximation"
        ? "P=P_{\\max}\\left[A\\xi+B\\xi^{2}-C\\xi^{3}\\right],\\quad\\xi=\\omega/\\omega_N,\\quad T=1000P/\\omega"
        : isMotor && mode !== "measured"
          ? "\\begin{aligned}T_b&=1000P_{\\max}/\\omega_b\\\\[3pt]T&=T_b,\\quad P=T_b\\omega/1000\\quad(\\omega\\le\\omega_b)\\\\[3pt]P&=P_{\\max},\\quad T=1000P/\\omega\\quad(\\omega>\\omega_b)\\end{aligned}"
          : "P(\\omega)\\ \\text{за заданими точками}",
      substitutionTex: characteristicSubstitution(source, texNumber),
      // Крива — не одна величина: у кожній точці є частота, потужність і
      // момент. Одиниця тут була б неправдою, тому її немає, а одиниці стоять
      // у самих записах.
      result: {
        value: curve.points.map(point => ({
          angularSpeed: point.angularSpeed,
          powerKw: point.powerKw,
          torqueNm: point.torqueNm
        })),
        canonicalUnit: null,
        displayUnit: ""
      },
      method: modern ? curve.model : MODE_METHODS[mode] || mode,
      // Те, що має прочитати читач звіту, і саме тому — українською: чи
      // рухає ця машина автомобіль, звідки взято криву і на якій основі подано
      // паспортні значення.
      readerNotes: [
        mode === "measured" || mode === "plateau"
          ? "Таблиця заданих точок є вихідними даними; наведені максимуми знайдено серед точок, а не отримано підстановкою в апроксимацію."
          : "Наведено числові підстановки для характерних точок робочих ділянок. Решту точок табличної та графічної характеристики обчислено за тією самою формулою; потужність P — у кВт, момент T — у Н·м, частота ω — у рад/с.",
        traction === true
          ? "Ця машина передає момент на колеса."
          : traction === false
            ? "Ця машина моменту на колеса не передає: крива наведена для повноти."
            : "Не задано, чи з'єднана ця машина з колесами механічно; позначка силової установки цього не доводить.",
        modern ? `Гладка проєктна характеристика: k_T=${curve.parameters.factor}; b₁=ω₁/ω_N=${curve.parameters.bandStart}; b₂=ω₂/ω_N=${curve.parameters.bandEnd}; c=T_x/T_max=${curve.parameters.lowFraction}; p=${curve.parameters.exponent.toFixed(5)}; n_x=${Math.round(curve.minimumAngularSpeed*30/Math.PI)} об/хв. Це припущення, не паспорт двигуна.` : mode === "measured"
          ? (provenance
            ? `Крива задана знятими точками; джерело точок: ${provenance}.`
            : "Крива задана знятими точками; походження точок не вказано.")
          : mode === "approximation"
            ? "Крива апроксимована за системою живлення; коефіцієнти визначено на барабанному стенді."
            : mode === "plateau"
              ? "Крива складена з паспортних точок прямими відрізками — це інтерполяція проєкту, а не метод із джерела."
              : "Крива побудована як дві ідеальні ділянки: сталий момент і стала потужність; обмеження за нагрівом вона не показує.",
        ratingBasis === "continuous"
          ? (modern ? "Розрахункові значення прийнято як тривалі; це проєктне припущення." : "Паспортні значення прийнято як тривалі.")
          : (modern ? "Розрахункові значення прийнято як короткочасні (пікові); тривалу характеристику окремо не задано."
            : "Паспортні значення прийнято як короткочасні (пікові); тривала крива лежить нижче."),
        // Межі, які подає саме джерело: мала вибірка для наддувного бензинового,
        // похибка дизеля з наддувом на малих частотах. Тримати їх лише в коді
        // означало б знати про них і не сказати читачеві.
        ...(curve.limitations || [])
      ],
      sourceRefs,
      assumptions: [
        traction === true
          ? "This source drives the wheels."
          : traction === false
            ? "This source does not drive the wheels; it is shown for completeness."
            : "Whether this source drives the wheels is not stated.",
        ...(provenance ? [`Points supplied by the author: ${provenance}.`] : [])
      ],
      limitations: [
        ...(curve.limitations || []),
        ...(mode === "measured" && !provenance
          ? ["Походження точок не вказано."]
          : [])
      ]
    };
  }

  return Object.freeze({
    SUPPLY_SYSTEMS,
    ENGINE_COUPLINGS,
    VALUE_COLUMNS,
    MINIMUM_ANGULAR_SPEED,
    coefficients,
    supplySystemFor,
    upperAngularSpeed,
    speedCharacteristic,
    displayPoints,
    plateauCharacteristic,
    measuredCharacteristic,
    parseCharacteristicPoints,
    engineCurve,
    motorCurve,
    buildMaximumTorqueStep,
    buildMaximumEngineAngularSpeedStep,
    tractionSourceAliases,
    buildCharacteristicStep,
    motorCharacteristic,
    characteristics
  });
}
