"use strict";

// A declared low-speed DUTY, not a second engine or a hidden first-gear target.
// SI throughout. Heat follows transmitted torque times relative clutch speed.
export function createLaunchDesign({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;

  const SOURCE_REFS = ["source.project-derivation", "source.reference.clutch-slip-power"];
  const number = v => v === null || v === undefined || v === "" ? null : Number(v);
  function torqueAt(curve, omega) {
    const points = curve?.points;
    if (!curve?.defined || !Array.isArray(points) || points.length < 2 || !Number.isFinite(omega)
      || omega < points[0].angularSpeed - 1e-9 || omega > points.at(-1).angularSpeed + 1e-9) return null;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      if (omega <= b.angularSpeed + 1e-9) return a.torqueNm + (b.torqueNm-a.torqueNm)
        * Math.max(0, Math.min(1, (omega-a.angularSpeed)/(b.angularSpeed-a.angularSpeed)));
    }
    return points.at(-1).torqueNm;
  }
  function speedForTorque(curve, requiredTorque) {
    const points = curve?.points || [];
    for (let i=0; i<points.length; i++) {
      if (points[i].torqueNm >= requiredTorque) {
        if (!i) return points[i].angularSpeed;
        const a=points[i-1], b=points[i];
        return a.angularSpeed+(b.angularSpeed-a.angularSpeed)*(requiredTorque-a.torqueNm)/(b.torqueNm-a.torqueNm);
      }
    }
    return null;
  }
  function assess({ curve, totalRatio, dynamicRadiusM, efficiency, massKg,
    crawlSpeedKmh, crawlResistanceN, durationS, launchAngularSpeed, hillLaunchAngularSpeed = launchAngularSpeed,
    launchForceN, launchAcceleration, adhesionForceN, energyLimitKj = null }) {
    const u=number(totalRatio), r=number(dynamicRadiusM), eta=number(efficiency), m=number(massKg);
    const speed=number(crawlSpeedKmh), v=speed===null?null:speed/3.6, F=number(crawlResistanceN), t=number(durationS);
    const w=number(launchAngularSpeed), launchF=number(launchForceN), a=number(launchAcceleration);
    const limit=number(energyLimitKj), adhesion=number(adhesionForceN);
    if (![u,r,eta,m,v,w].every(x=>Number.isFinite(x)&&x>0) || eta>1
      || ![F,t,launchF,a].every(x=>Number.isFinite(x)&&x>=0) || !(Number.isFinite(adhesion)&&adhesion>0)
      || (limit!==null && !(Number.isFinite(limit)&&limit>0)))
      return {defined:false,reason:"Для перевірки маневру потрібні редукція, спільна крива, радіус, ККД, маса, швидкість, тривалість і сили."};
    const inputOmega=v*u/r, idle=curve?.minimumAngularSpeed ?? curve?.points?.[0]?.angularSpeed;
    if (!(Number.isFinite(idle) && w >= idle) || torqueAt(curve,w)===null)
      return {defined:false,reason:"Оберти при рушанні мають лежати всередині спільної характеристики; екстраполяцію не виконано."};
    // Once the input shaft is in the engine's usable range, the clutch can be
    // locked and engine speed follows it. Below it, the declared launch speed
    // is held while the clutch slips. No curve extrapolation is allowed.
    const slipping=inputOmega < w - 1e-9;
    const operatingOmega=slipping ? w : inputOmega;
    const available=torqueAt(curve,operatingOmega), torque=F*r/(u*eta);
    const lossKw=torque*Math.max(0,operatingOmega-inputOmega)/1000;
    const energyKj=lossKw*t;
    const forcePossible=F<=adhesion*(1+1e-10) && available!==null && torque<=available*(1+1e-10);
    const hillOmega = number(hillLaunchAngularSpeed);
    const launchTorque=launchF*r/(u*eta), availableLaunch=torqueAt(curve,hillOmega);
    const syncSpeedMs=hillOmega>0 ? hillOmega*r/u : null;
    const syncTimeS=a>0 && syncSpeedMs!==null ? syncSpeedMs/a : null;
    // Explicit constant-omega/constant-acceleration launch approximation:
    // slip falls linearly to zero. It excludes aero, rotating inertia and cooling.
    const launchEnergyKj=syncTimeS===null ? null : 0.5*launchTorque*hillOmega*syncTimeS/1000;
    const launchPossible=launchF<=adhesion*(1+1e-10) && availableLaunch!==null
      && launchTorque<=availableLaunch*(1+1e-10);
    return {defined:true,totalRatio:u,dynamicRadiusM:r,efficiency:eta,massKg:m,crawlSpeedKmh:v*3.6,
      crawlResistanceN:F,adhesionForceN:adhesion,durationS:t,
      inputRpm:inputOmega*30/Math.PI,engineRpm:operatingOmega*30/Math.PI,
      idleRpm:idle*30/Math.PI,lockedIdleSpeedKmh:idle*r/u*3.6,
      slipRpm:Math.max(0,operatingOmega-inputOmega)*30/Math.PI,clutchTorqueNm:torque,
      availableTorqueNm:available,slipping,slipPowerKw:lossKw,slipEnergyKj:energyKj,
      forcePossible,energyLimitKj:limit>0?limit:null,
      thermalWithinLimit:limit>0 ? energyKj<=limit : null,
      launch:{forceN:launchF,accelerationMs2:a,engineRpm:hillOmega>0 ? hillOmega*30/Math.PI : null,torqueNm:launchTorque,
        availableTorqueNm:availableLaunch,forcePossible:launchPossible,
        synchronisationSpeedKmh:syncSpeedMs*3.6,synchronisationTimeS:syncTimeS,
        slipEnergyKj:launchEnergyKj,thermalWithinLimit:limit>0&&launchEnergyKj!==null?launchEnergyKj<=limit:null},
      limitations:["Сценарій, а не універсальна норма: тривалість і оберти прийняті явно; крива двигуна спільна з §4.",
        "Нагрів — механічна енергія тертя. Без теплоємності, початкової температури й охолодження температуру та повторюваність маневрів не підтверджено.",
        "Пуск: сталий момент, сталі оберти двигуна й прискорення до синхронізації; без опору повітря, обертових інерцій і охолодження.",
        "Надлишок повнонавантаженої сили в замкненому приводі обмежують моментом двигуна, не постійним ковзанням зчеплення."]};
  }
  function step(state, tex) {
    if (!state?.defined) return null;
    const launch=state.launch;
    const fmt=(v,d=2)=>new Intl.NumberFormat("uk-UA",{maximumFractionDigits:d}).format(v);
    return {id:"clutch-crawl-duty",title:"Повільний маневр і рушання: ковзання та енергія зчеплення",
      purpose:"Check the declared clutch-slip duty with the actual adopted first gear and the same engine curve.",
      output:{id:"value.clutch-crawl-duty",symbol:"E_{\\mathrm{ковз}}",label:"Clutch crawl and launch energy",valueType:"list",canonicalUnit:null},
      expression:"T_c=F*r/(eta*u); P_slip=T_c*(omega_e-v*u/r); E_slip=P_slip*t",
      dependencies:["value.gearbox-ladder","value.traction-characteristic-engine","value.dynamic-wheel-radius","value.gross-mass","input.clutch-crawl-duration","input.clutch-launch-speed","input.first-gear-crawl-speed","input.first-gear-start-grade","input.first-gear-start-acceleration"],
      equationNumber:null,formulaTex:"T_c=\\frac{Fr}{\\eta u};\\quad P_{\\mathrm{ковз}}=T_c|\\omega_e-\\omega_{in}|;\\quad E_{\\mathrm{ковз}}=\\int P_{\\mathrm{ковз}}\\,dt",
      substitutionTex:`\\begin{aligned}u&=${tex(state.totalRatio,6)};\\quad n_{in}=${tex(state.inputRpm,1)};\\quad n_e=${tex(state.engineRpm,1)}\\\\T_c&=\\frac{${tex(state.crawlResistanceN,2)}\\cdot${tex(state.dynamicRadiusM,6)}}{${tex(state.efficiency,3)}\\cdot${tex(state.totalRatio,6)}}=${tex(state.clutchTorqueNm,3)}\\ \\text{Н·м}\\\\P_{\\mathrm{ковз}}&=${tex(state.clutchTorqueNm,3)}\\frac{\\pi(${tex(state.engineRpm,1)}-${tex(state.inputRpm,1)})}{30\\cdot1000}=${tex(state.slipPowerKw,3)}\\ \\text{кВт}\\\\E_{\\mathrm{маневр}}&=${tex(state.slipPowerKw,3)}\\cdot${tex(state.durationS,1)}=${tex(state.slipEnergyKj,3)}\\ \\text{кДж}`
        +(launch.slipEnergyKj!==null?String.raw`\\T_{c,\mathrm{пуск}}&=\frac{${tex(launch.forceN,2)}\cdot${tex(state.dynamicRadiusM,6)}}{${tex(state.efficiency,3)}\cdot${tex(state.totalRatio,6)}}=${tex(launch.torqueNm,3)}\ \text{Н·м}\\V_{\mathrm{синхр}}&=\frac{(${tex(launch.engineRpm,1)}\pi/30)\cdot${tex(state.dynamicRadiusM,6)}}{${tex(state.totalRatio,6)}}=${tex(launch.synchronisationSpeedKmh/3.6,3)}\ \text{м/с}\\t_{\mathrm{синхр}}&=\frac{${tex(launch.synchronisationSpeedKmh/3.6,3)}}{${tex(launch.accelerationMs2,3)}}=${tex(launch.synchronisationTimeS,3)}\ \text{с}\\E_{\mathrm{пуск}}&\simeq\tfrac12\cdot${tex(launch.torqueNm,3)}\cdot(${tex(launch.engineRpm,1)}\pi/30)\cdot${tex(launch.synchronisationTimeS,3)}/1000=${tex(launch.slipEnergyKj,3)}\ \text{кДж}`:"")+"\\end{aligned}",
      result:{value:[{duty:"crawl",energyKj:state.slipEnergyKj},{duty:"launch",energyKj:launch.slipEnergyKj}],canonicalUnit:null,displayUnit:null},
      method:"declared-clutch-slip-duty",sourceRefs:SOURCE_REFS,assumptions:[],
      readerNotes:[`Маневр: ${fmt(state.crawlSpeedKmh,2)} км/год протягом ${fmt(state.durationS,1)} с за поточним опором дороги. Редукція — після прийняття зубів, не теоретична ціль.`,
        `Без ковзання на мінімальних обертах: ${fmt(state.lockedIdleSpeedKmh,2)} км/год. Потрібний момент ${fmt(state.clutchTorqueNm,2)} Н·м; доступний за спільною кривою ${state.availableTorqueNm===null?"не визначено":fmt(state.availableTorqueNm,2)} Н·м. Умова сили ${state.forcePossible?"виконується":"НЕ виконується"}.`,
        `Рушання за окремим сценарієм: F=${fmt(launch.forceN,1)} Н, a=${fmt(launch.accelerationMs2,2)} м/с²; момент ${fmt(launch.torqueNm,2)} Н·м. Умова сили ${launch.forcePossible?"виконується":"НЕ виконується"}.`,
        state.energyLimitKj===null?"Допустиму енергію одного маневру/рушання не задано: теплову придатність НЕ підтверджено. Це не нульове теплове навантаження."
          :`Прийнята межа одного режиму ${fmt(state.energyLimitKj,2)} кДж; маневр ${state.thermalWithinLimit?"проходить":"НЕ проходить"}, рушання ${launch.thermalWithinLimit===null?"не перевірено":launch.thermalWithinLimit?"проходить":"НЕ проходить"}. Режими показані окремо, їх енергії не додаються як один норматив.`],
      limitations:state.limitations};
  }
  return Object.freeze({torqueAt,speedForTorque,assess,step,SOURCE_REFS});
}
