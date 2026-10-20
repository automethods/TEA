"use strict";

export function createMeasuredEfficiencyMap({dependencies={},loadDependency=null,runtime="browser"}={}) {
  const window=runtime==="browser"?dependencies:undefined; const globalThis=dependencies; const module=loadDependency?{exports:{}}:undefined; const require=loadDependency;

  // Explicit SI headers and a complete rectangular grid keep interpolation
  // reproducible. No extrapolation beyond the supplied operating region.
  function parse(text, source, role = "engine", options = {}) {
    if (String(text).trim().startsWith("{")) {
      const scope = typeof window === "object" ? window : globalThis;
      const adapter = role === "motor"
        ? scope.VehicleMotorComponentAdapter || (typeof module === "object" && module.exports ? require("./motor-component-adapter.js") : null)
        : scope.VehicleEngineComponentAdapter || (typeof module === "object" && module.exports ? require("./engine-component-adapter.js") : null);
      return adapter.parse(text, source, options);
    }
    if (!source?.trim()) return { defined: false, reason: "Вкажіть джерело карти." };
    const lines = String(text).trim().split(/\r?\n/).filter(line => line.trim());
    if (lines.shift()?.trim() !== "rpm,torque_nm,efficiency") {
      return { defined: false, reason: "Заголовок CSV: rpm,torque_nm,efficiency; ККД — частка від 0 до 1." };
    }
    const rows = [];
    const seen = new Set();
    for (const line of lines) {
      const cells = line.split(",").map(value => value.trim());
      const [rpm, torqueNm, efficiency] = cells.map(Number);
      const key = `${rpm}:${torqueNm}`;
      if (cells.length !== 3 || cells.some(value => !value)
          || ![rpm, torqueNm, efficiency].every(Number.isFinite)
          || rpm <= 0 || torqueNm <= 0 || efficiency <= 0 || efficiency > 1 || seen.has(key)) {
        return { defined: false, reason: "Карта містить повторні або некоректні точки; потрібні додатні оберти й момент та 0 < ККД ≤ 1." };
      }
      seen.add(key);
      rows.push({ rpm, angularSpeed: rpm * Math.PI / 30, torqueNm, efficiency });
    }
    const speeds = [...new Set(rows.map(row => row.rpm))].sort((a, b) => a - b);
    const torques = [...new Set(rows.map(row => row.torqueNm))].sort((a, b) => a - b);
    if (speeds.length < 2 || torques.length < 2 || rows.length !== speeds.length * torques.length) {
      return { defined: false, reason: "Потрібна повна прямокутна сітка щонайменше 2 × 2 точки." };
    }
    return { defined: true, measured: true, source: source.trim(), rows, speeds, torques,
      best: rows.reduce((a, b) => a.efficiency > b.efficiency ? a : b),
      worst: rows.reduce((a, b) => a.efficiency < b.efficiency ? a : b) };
  }

  function at(map, { angularSpeed, torqueNm, powerKw }) {
    if (!map?.defined) return null;
    if (map.componentPackage) {
      const scope = typeof window === "object" ? window : globalThis;
      const adapter = map.componentPackage.componentType === "motor"
        ? scope.VehicleMotorComponentAdapter || (typeof module === "object" && module.exports ? require("./motor-component-adapter.js") : null)
        : scope.VehicleEngineComponentAdapter || (typeof module === "object" && module.exports ? require("./engine-component-adapter.js") : null);
      return adapter.at(map, { angularSpeed, torqueNm, powerKw });
    }
    const rawRpm = angularSpeed * 30 / Math.PI;
    const rpm = map.speeds.find(value => Math.abs(value - rawRpm) <= 1e-10 * value) ?? rawRpm;
    const torque = torqueNm ?? powerKw * 1000 / angularSpeed;
    if (![rpm, torque].every(Number.isFinite)) return null;
    const bracket = (values, value) => {
      if (value < values[0] || value > values.at(-1)) return null;
      const high = values.findIndex(item => item >= value);
      return [values[Math.max(0, high - 1)], values[high]];
    };
    const ns = bracket(map.speeds, rpm), ts = bracket(map.torques, torque);
    if (!ns || !ts) return null;
    const lerp = (a, b, low, high, x) => high === low ? a : a + (b - a) * (x - low) / (high - low);
    const get = (n, t) => map.rows.find(row => row.rpm === n && row.torqueNm === t).efficiency;
    const low = lerp(get(ns[0], ts[0]), get(ns[1], ts[0]), ...ns, rpm);
    const high = lerp(get(ns[0], ts[1]), get(ns[1], ts[1]), ...ns, rpm);
    return lerp(low, high, ...ts, torque);
  }

  function step(map, role, texNumber) {
    const packet = map.componentPackage;
    const calculated = packet?.format === "vehicle-engine-inputs/1";
    const provenance = packet?.component.map.provenance;
    if (packet?.componentType === "motor") {
      const motor = packet.component;
      return {
        id: `${role}-efficiency-map`, title: "Карта втрат електромашини",
        purpose: "Evaluate the native signed motor loss map and continuous operating limits.",
        output: { id: `value.${role}-efficiency-map`, valueType: "list", canonicalUnit: null, label: "Motor package motoring preview", symbol: "\\eta" },
        expression: "Pdc = boundary(motor+inverter) ? Pshaft + bilinear(loss_w) : inverter(Pshaft + bilinear(loss_w))",
        dependencies: map.inverterEfficiency === null ? [] : ["input.motor-package-inverter-efficiency"],
        equationNumber: null, formulaTex: "P_{dc}=P_{shaft}+P_{loss,map}+P_{loss,inv}",
        substitutionTex: `\\eta_{\\max}=${texNumber(map.best.efficiency * 100, 2)}\\%`,
        result: { value: map.rows, canonicalUnit: null, displayUnit: "" }, method: "ice-motor-loss-grid-bilinear",
        sourceRefs: ["source.motor-component-package", ...(map.inverterEfficiency === null ? [] : ["source.project-input"])],
        readerNotes: [`Джерело: ${map.source}.`, `Компонент: ${motor.id}; клас даних: ${map.sourceClass}; версія джерела: ${motor.map.sourceVersion ?? "не задана"}.`,
          `SHA-256 пакета: ${packet.sha256}.`, `Межа карти: ${motor.map.boundary}; режим циклу — continuous.`,
          `Тривалі межі: ${motor.continuousNm} Н·м; ${motor.continuousKW} кВт; ${motor.continuousPhaseArms} A rms; максимальні оберти ${motor.maxRpm} об/хв. Огинаюча карти та струмова межа перевіряються додатково.`,
          map.inverterEfficiency === null ? "Втрати motor+inverter включено один раз; окремий ККД інвертора не застосовується."
            : `Окремий ККД інвертора ${map.inverterEfficiency} — припущення проєкту, не властивість джерела.`,
          `Походження карти: ${JSON.stringify(provenance ?? {})}.`], assumptions: [],
        limitations: ["Інтерполюються втрати, потім обчислюється електрична потужність; відсутні комірки, маска та огинаюча збережені.",
          "Рекуперація використовує лише від’ємні моменти джерела; додатну тягову карту не віддзеркалено.",
          "Таблиця показує доступні додатні вузли; повна карта, зокрема втрати холостого ходу, збережена в JSON.",
          "Пакет замінює карту й межі її застосування; характеристика приводу, редуктор і батарея лишаються окремими входами."]
      };
    }
    return {
      id: `${role}-efficiency-map`, title: calculated ? "Паливні криві розрахованого ДВЗ" : packet ? "Карта витрати палива ДВЗ" : "Виміряна карта ККД",
      purpose: "Use a supplied speed–torque efficiency grid.",
      output: { id: `value.${role}-efficiency-map`, valueType: "list", canonicalUnit: null,
        label: "Measured efficiency map", symbol: "\\eta" },
      expression: calculated ? "eta = omega * torque / (native_fuel_curve_interpolation(rpm, torque) * LHV)" : packet ? "eta = omega * torque / (bilinear(fuel_g_s) / 1000 * LHV)"
        : "bilinear_interpolation(rpm, torque, efficiency)",
      dependencies: packet ? ["input.engine-package-lower-heating-value"] : [],
      equationNumber: null, formulaTex: "\\eta=f(n,M)",
      substitutionTex: `\\eta_{\\max}=${texNumber(map.best.efficiency * 100, 2)}\\%`,
      result: { value: map.rows, canonicalUnit: null, displayUnit: "" },
      method: calculated ? "ice-calculated-fuel-curves" : packet ? "ice-fuel-grid-bilinear" : "measured-grid-bilinear",
      sourceRefs: [packet ? "source.engine-component-package" : "source.project-input"],
      readerNotes: [`Джерело: ${map.source}.`, ...(packet ? [
        `Компонент: ${packet.component.id}; клас даних: ${map.sourceClass}; версія джерела: ${packet.component.map.sourceVersion ?? "не задана"}.`,
        `SHA-256 пакета: ${packet.sha256}.`,
        `H_u = ${map.heatingValueMjPerKg} МДж/кг; густина палива = ${map.fuelDensityGcm3} кг/л; межа — колінчастий вал.`,
        `Походження карти: ${JSON.stringify(provenance ?? {})}.`
      ] : [])],
      assumptions: [], limitations: [calculated ? "Оригінальні нерегулярні паливні криві ICE; рівномірну сітку не створено. Розраховані дані, не вимірювання; екстраполяція заборонена." : "Білінійна інтерполяція всередині сітки; екстраполяція заборонена.",
        ...(packet ? ["Інтерполюється витрата палива, потім обчислюється ККД. Пропуски, маска та огинаюча збережені.",
          "Клас даних збережено; не всі вузли обробленої карти є вимірюваннями.",
          "Пакет замінює лише карту; характеристика двигуна, носій енергії та перехідні режими залишаються окремими входами."] : [])]
    };
  }
  function compactAxis(values, limit) {
    if(values.length<=limit)return [...values];
    return Array.from({length:limit},(_,i)=>values[Math.round(i*(values.length-1)/(limit-1))]);
  }

  return Object.freeze({ parse, at, step, compactAxis });
}
