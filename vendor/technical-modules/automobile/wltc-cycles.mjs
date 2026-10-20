"use strict";
export function createWltcCycles({dependencies={},loadDependency=null,runtime="browser"}={}) {
  const window=runtime==="browser"?dependencies:undefined; const globalThis=dependencies; const module=loadDependency?{exports:{}}:undefined; const require=loadDependency;
  const data = dependencies.VehicleWltcCycleData || loadDependency?.("./wltc-cycle-data.js");

  function select({powerKw,curbMassKg,maximumSpeedKmh,powertrain="conventional"}) {
    if (!(maximumSpeedKmh>0)) return {defined:false,reason:"Для вибору WLTC задайте максимальну швидкість."};
    const pmr=powerKw>0&&curbMassKg>0 ? powerKw*1000/curbMassKg : null;
    if (powertrain==="conventional"&&pmr===null)
      return {defined:false,reason:"Для вибору WLTC потрібні потужність двигуна й споряджена маса."};
    const id=powertrain==="conventional"&&pmr<=22 ? "wltc1"
      : powertrain==="conventional"&&pmr<=34 ? "wltc2"
      : maximumSpeedKmh<120 ? "wltc3a" : "wltc3";
    const label=data[id].label;
    const basis=powertrain==="conventional"
      ? `P/m₀ = ${pmr.toLocaleString("uk-UA",{maximumFractionDigits:2})} Вт/кг; m₀ — споряджена маса без корисного навантаження. Межі класів: ≤22, >22…34, >34 Вт/кг.`
      : "Для електричного або гібридного привода прийнято порівняльний профіль Class 3; це початковий вибір проєкту.";
    return {defined:true,id,label,pmr,note:`Автоматично: ${label}. ${basis} Підклас 3a — нижче 120 км/год, 3b — від 120 км/год.`};
  }
  function phases(id){
    return (id==="wltc1"
      ? [["low","Низька швидкість",0,589],["medium","Середня швидкість",589,1022],["low-repeat","Повтор низької фази",1022,1611]]
      : [["low","Низька швидкість",0,589],["medium","Середня швидкість",589,1022],["high","Висока швидкість",1022,1477],["extra-high","Надвисока швидкість",1477,1800]])
      .map(([id,label,fromS,toS])=>({id,label,fromS,toS}));
  }
  const parsed=new Map();
  function resolve(inputs,parseCycle){
    const choice=select(inputs);
    if(!choice.defined)return {...choice,cycle:{defined:false,reason:choice.reason}};
    if(!parsed.has(choice.id)){
      const row=data[choice.id];
      parsed.set(choice.id,parseCycle(`#${row.label}\ntime_s,speed_kmh\n`+row.speeds.map((v,t)=>`${t},${v}`).join("\n")));
    }
    return {...choice,cycle:parsed.get(choice.id),fileName:`${choice.label}.csv`,phases:phases(choice.id)};
  }
  return Object.freeze({select,resolve,phases});
}
