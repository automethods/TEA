/** Project-owned input/state contract. Values in canonical SI; form strings and selected units are retained. */
export const VERSION='0.8.6';
export const FORMAT='power-source-workspace/1';
export function scopeActive(scope,p){
 const ice=p.system!=='electric',electric=p.system!=='ice',hybrid=p.system==='hybrid';
 return ({all:true,ice,electric,hybrid,'bev-procedure':p.system==='electric'&&p.evRangeMode==='cycle'&&['wltc3','wltc3a','wltc-auto'].includes(p.missionCycle),'bev-css':p.system==='electric'&&p.evRangeMode==='cycle'&&['wltc3','wltc3a','wltc-auto'].includes(p.missionCycle)&&['short','both'].includes(p.bevProcedure),'bev-performance':p.system==='electric'&&p.evRangeMode==='cycle'&&['wltc3','wltc3a','wltc-auto'].includes(p.missionCycle)&&p.bevTermination==='performance'&&p.bevProcedure!=='route','ev-wltc':electric&&p.evRangeMode==='cycle'&&['wltc3','wltc3a','wltc-auto'].includes(p.missionCycle),'wltc-select':electric&&p.evRangeMode==='cycle'&&['wltc3a','wltc-auto'].includes(p.missionCycle),'wltc-cap':electric&&p.evRangeMode==='cycle'&&['wltc3','wltc3a','wltc-auto'].includes(p.missionCycle)&&p.wltcCap==='yes','ice-only':p.system==='ice',gasoline:ice&&p.fuelType==='gasoline',diesel:ice&&p.fuelType==='diesel',gdi:ice&&p.fuelType==='gasoline'&&p.injection==='direct',di:ice&&(p.fuelType==='diesel'||p.injection==='direct'),
 'four-stroke':ice&&p.engineCycle!=='two-stroke','two-stroke':ice&&p.engineCycle==='two-stroke','two-stroke-direct':ice&&p.engineCycle==='two-stroke'&&(p.fuelType==='diesel'||p.injection==='direct'),
 'gasoline-four':ice&&p.engineCycle!=='two-stroke'&&p.fuelType==='gasoline','diesel-four':ice&&p.engineCycle!=='two-stroke'&&p.fuelType==='diesel','gdi-four':ice&&p.engineCycle!=='two-stroke'&&p.fuelType==='gasoline'&&p.injection==='direct',series:hybrid&&p.topology==='series',
 'rounded-geometry':ice&&p.mode==='design'&&p.adoption==='rounded','design-ice':ice&&p.mode==='design','manual-geometry':ice&&(p.mode==='check'||p.adoption==='manual'),'check-electric':electric&&p.mode==='check',vehicle:p.vehicleEnabled==='yes'||electric&&(p.system==='electric'||p.evEnabled==='yes'),ev:electric&&(p.system==='electric'||p.evEnabled==='yes'),'hybrid-cycle':hybrid&&p.evEnabled==='yes','ev-q':electric&&(p.system==='electric'||p.evEnabled==='yes')&&p.evMassMode==='q','ev-packs':electric&&(p.system==='electric'||p.evEnabled==='yes')&&p.evSizing==='packs','ev-target':electric&&(p.system==='electric'||p.evEnabled==='yes'),'ev-custom':electric&&(p.system==='electric'||p.evEnabled==='yes')&&p.evRangeMode==='cycle'&&p.missionCycle==='custom','ev-energy':electric&&((p.system==='electric'||p.evEnabled==='yes')||p.mode==='check')})[scope]??false;
}
/** Shared ordering for the interactive inputs, calculation graph and full export. Stable I-numbers are retained. */
export function activeFields(fields,p){
 const ev=p.system!=='ice'&&(p.system==='electric'||p.evEnabled==='yes');
 const groups=ev?{
 '2.1':['system','evVehicleClass','fuelType','engineClass','topology','plugIn'],
 '3.2':['evSizing',...(p.evSizing==='range'?['evTargetRange','batteryEnergy']:p.evSizing==='packs'?['evPackCount','evPackEnergy','evTargetRange']:['batteryEnergy','evTargetRange'])],
 '8.1':['evPack','evSpecificEnergy','evSpecificPower','evSpecificPeakPower','evSpecificChargePower','evPackPeakDuration'],
 '3.1':['evPayload','evMassMode','mass','evTareRatio','evReferencePayload','evReferenceBatteryEnergy','evReferenceSpecificEnergy','evGrossMass'],
 '8.3':['evRangeMode','missionCycle','wltcMaxSpeed','wltcCap','wltcCapSpeed','bevProcedure','bevTermination','bevCutoffSoc','bevLowVocRatio','bevLowResistanceFactor','bevCssSpeed','bevCssAcceleration','evCustomCycle','vehicleSpeed','grade','cdArea','rolling','wheelRadius','evRatioMode','evMaxSpeed','driveRatio','driveEfficiency','evRotatingFactor','evRegenFraction','auxPower'],
 '8.4':['voltage','voltageMin','voltageMax','resistance','dischargeCurrent','chargeCurrent','socInitial','socMin','socMax','evChargeEfficiency'],
 '8.5':['duration','averageLoad']}:{};
 const placement=new Map(Object.entries(groups).flatMap(([group,keys])=>keys.map((k,i)=>[k,{group,order:i}])));
 return fields.filter(f=>scopeActive(f.scope,p)&&!(ev&&(f.key==='vehicleType'||f.key==='mass'&&p.evMassMode==='q'||f.key==='driveRatio'&&p.evRatioMode==='target'||f.key==='evMaxSpeed'&&p.evRatioMode!=='target'||f.key==='missionCycle'&&p.evRangeMode!=='cycle'||f.key==='batteryEnergy'&&p.evSizing==='packs'))).map(f=>{
  const at=placement.get(f.key);let q=at?{...f,...at}:f;
  if(f.key==='missionCycle'&&p.system==='ice')q={...q,options:q.options.filter(o=>!['wltc3a','wltc-auto'].includes(o.value))};
  if(p.system==='electric'&&f.key==='targetPower')q={...q,source:'ev-assumptions',help:'Потрібна тривала механічна потужність тягового мотора (усіх моторів разом) до редуктора, при I-7. У прикладі задано 110 кВт. Введіть потужність свого проєкту; нижче розрахунок перевірить, чи забезпечує вона потрібну тягу та маршрут. Межі поля: 1–2000 кВт.'};
  if(ev&&f.key==='batteryEnergy'&&p.evSizing==='range')q={...q,label:p.evMassMode==='total'?'Енергія початкової батареї у відомій спорядженій масі':'Початкове наближення енергії для підбору',help:p.evMassMode==='total'?'I-112 включає цю початкову батарею. Її маса віднімається, потім додається маса підібраної батареї.':'Підбір змінить енергію автоматично; остаточне значення наведене під графіком вибору.'};
  if(ev&&f.key==='evTargetRange'&&p.evSizing!=='range')q={...q,label:'Цільовий пробіг для порівняння на графіку'};
  if(ev&&f.key==='vehicleSpeed'&&p.evRangeMode==='cycle')q={...q,label:'Швидкість окремої перевірки усталеного руху',help:'Не замінює швидкості обраного циклу. Використана також для окремої дорожньої точки розділу 10.'};
  if(ev&&f.key==='evMassMode'&&p.evSizing==='packs')q={...q,help:q.help.replace('I-107','I-158 × I-159'),options:q.options.map(o=>({...o,label:o.label.replace('I-107','I-158 × I-159')}))};
  return q;
 }).sort((a,b)=>Number(a.group)-Number(b.group)||(a.order??1000)-(b.order??1000));
}

export function validateParams(p,fields){
 if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Потрібен об’єкт вихідних даних.');
 const known=new Set(fields.map(f=>f.key));for(const k of Object.keys(p))if(!known.has(k))throw Error('Невідомий параметр '+k);
 for(const f of activeFields(fields,p)){
  const v=p[f.key];if(f.type==='csv'){if(typeof v!=='string'||v.length>300000)throw Error(f.number+': некоректний CSV.');continue;}if(f.options){if(!f.options.some(o=>o.value===v))throw Error(f.number+': неприпустимий вибір — '+f.label);}
  else if(!Number.isFinite(v)||v<f.min||v>f.max)throw Error(f.number+': '+f.label+' — перевірте значення та одиниці.');
 }
 if(p.system!=='electric'&&(p.snCycles2<=p.snCycles1||p.snAmplitude2>=p.snAmplitude1||p.pinInner>=p.pinOuter||p.yieldStress>p.ultimateStress||p.enduranceStress>p.ultimateStress))throw Error('Перевірте геометрію пальця, S–N опори й матеріальні межі.');
 if((p.system!=='ice'&&!Number.isInteger(p.polePairs))||p.controlDuration/p.controlStep>20000)throw Error('Перевірте число пар полюсів та розмір сітки керування.');
 if(!['ice','hybrid','electric'].includes(p.system)||!['design','check'].includes(p.mode))throw Error('Виберіть тип установки та режим.');
 if(p.system!=='electric'){
  if(p.engineClass!=='custom'&&!p.engineClass.startsWith(p.fuelType+'-'))throw Error('Клас ДВЗ має відповідати обраному паливу.');
  if(!(p.sweepMinSpeed<p.sweepMaxSpeed))throw Error('Нижня частота серії має бути меншою за верхню.');
  if(!Number.isInteger(p.cylinders))throw Error('Кількість циліндрів має бути цілою.');
  if(Math.abs(p.carbon+p.hydrogen+p.oxygen-1)>1e-7)throw Error('Масові частки C+H+O повинні дорівнювати 1.');
  if((8/3*p.carbon+8*p.hydrogen-p.oxygen)<=0)throw Error('Елементний склад не визначає додатної потреби кисню.');
  if(p.engineCycle==='two-stroke'){
   if(!(p.portExhaustOpen<p.transferOpen&&p.transferOpen<180&&p.transferClose>180&&p.transferClose<p.portExhaustClose&&p.portExhaustClose<300))throw Error('Двотактні фази: випуск відкривається першим і закривається останнім.');
   if(!(p.scavengePressure>p.exhaustPressure))throw Error('Тиск продувки має перевищувати тиск випуску.');
   if(!(p.twoStrokeStart+p.twoStrokeDuration<p.portExhaustOpen))throw Error('Тепловиділення має закінчитися до відкриття випускного вікна.');
   if((p.fuelType==='diesel'||p.injection==='direct')&&p.twoStrokeInjectionDuration>=p.twoStrokeStart)throw Error('Пряме впорскування має завершитися до початку тепловиділення.');
  }else if(p.fuelType==='gasoline'){
   if(p.sparkStart<=p.intakeClose||p.sparkStart+p.sparkDuration>=p.exhaustOpen)throw Error('Згоряння має бути між IVC та EVO.');
   if(p.injection==='direct'&&(p.gdiStart<=p.intakeClose||p.gdiStart+p.gdiDuration>=p.sparkStart))throw Error('GDI цього рівня: впорскування після IVC і до початку згоряння.');
  }else if(p.dieselStart<=p.intakeClose||p.dieselStart+p.dieselInjectionDuration>=p.exhaustOpen||p.dieselStart+p.ignitionDelay+Math.max(p.premixDuration,p.premixDuration*.5+p.diffusionDuration)>=p.exhaustOpen)throw Error('Впорскування та згоряння дизеля мають закінчитися до EVO.');
 }
 if(p.system!=='ice'){
  if(scopeActive('wltc-select',p)&&p.missionCycle==='wltc3a'&&p.wltcMaxSpeed>=120/3.6)throw Error('Class 3a: I-192 має бути нижче 120 км/год; інакше оберіть Class 3b або автовибір.');
  if(scopeActive('wltc-select',p)&&p.wltcCap==='yes'&&p.wltcCapSpeed>p.wltcMaxSpeed)throw Error('Додатковий обмежувач I-198 не може перевищувати I-192.');
  if(scopeActive('bev-performance',p)&&!(p.bevCutoffSoc<p.socMin&&p.bevCutoffSoc<p.socMax))throw Error('Технічний поріг I-194 має бути нижче резерву I-103 та початкового SOC_max.');
  if(!Number.isInteger(p.evMotorCount)||p.evMotorCount<1||p.evPeakPhaseCurrent<p.phaseCurrent)throw Error('Перевірте кількість моторів і струм peak ≥ S1.');
  if((p.system==='electric'||p.evEnabled==='yes')&&(!Number.isInteger(p.evPackCount)||p.evSpecificPeakPower<p.evSpecificPower||p.evGrossMass<=p.evPayload))throw Error('Перевірте кількість пакетів, peak ≥ S1 та повну масу.');
  if(!(p.socMin<p.socInitial&&p.socInitial<=p.socMax))throw Error('Потрібно SOC_min < SOC_0 ≤ SOC_max.');
  if(!(p.voltageMin<=p.voltage&&p.voltage<p.voltageMax&&p.voltageMax<=p.inverterVoltage))throw Error('Перевірте U_min ≤ Voc < U_max ≤ U_inv_max.');
  if(p.motorBaseSpeed>=p.motorMaxSpeed||p.ratedSpeed>p.motorMaxSpeed)throw Error('Базова і розрахункова частоти мають належати діапазону мотора.');
  if(p.mode==='design'&&p.system==='hybrid'&&p.topology==='parallel'&&p.hybridEngineTarget>=p.targetPower)throw Error('Для проєктного P2 задайте потужність ДВЗ нижчу за спільну вимогу або виберіть чистий ДВЗ.');
 }
 return {...p,...(p.system==='electric'?{evEnabled:'yes'}:{})};
}
export function formFromParams(p,fields){return Object.fromEntries(fields.map(f=>{const u=f.units?.[0],value=f.options?p[f.key]:u?(p[f.key]-u.offset)/u.factor:p[f.key];return [f.key,{text:typeof value==='number'?String(Number(value.toPrecision(12))):String(value),unit:0}];}));}
export function readForm(form,fields,base){
 const p={...base};for(const f of fields){const x=form[f.key];if(!x)continue;if(f.options)p[f.key]=x.text;}
 for(const f of fields){if(f.options||!scopeActive(f.scope,p))continue;const x=form[f.key];if(f.type==='csv'){p[f.key]=x?.text??'';continue;}if(!x||typeof x.text!=='string'||!x.text.trim())throw Error(f.number+': порожнє активне поле.');
  const raw=x.text.trim().replace(',','.');if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw))throw Error(f.number+': введіть число, не вираз.');
  const u=f.units?.[x.unit??0];if(f.units&&!u)throw Error(f.number+': невідома одиниця.');p[f.key]=Number(raw)*(u?.factor??1)+(u?.offset??0);
 }
 return validateParams(p,fields);
}
export function proposedDefaults(current,patch,locked,fields,origins,label,source='assumptions'){
 const p={...current},changes=[],protectedKeys=[];const keys=new Set(fields.map(f=>f.key));
 for(const [key,value]of Object.entries(patch)){if(!keys.has(key))throw Error('Невідоме поле підказки '+key);if(Object.is(value,current[key]))continue;if(locked[key]){protectedKeys.push(key);continue;}p[key]=value;changes.push({key,before:current[key],after:value});}
 return {base:JSON.stringify(current),locks:JSON.stringify(locked),params:p,changes,protectedKeys,label,source,origins:{...origins,...Object.fromEntries(changes.map(c=>[c.key,{status:'adopted',source,label}]))}};
}
export function commitProposal(proposal,current,locked,fields){if(proposal.base!==JSON.stringify(current)||proposal.locks!==JSON.stringify(locked))throw Error('Підстановка застаріла; перегляньте її ще раз.');return validateParams(proposal.params,fields);}
export function readWorkspace(data,fields,defaults){
 if(!data||data.format!==FORMAT||!['0.5.0','0.6.0','0.7.0','0.8.0','0.8.1','0.8.2','0.8.3','0.8.4','0.8.5','0.8.6'].includes(data.version))throw Error('Потрібен проєкт power-source-workspace/1 (0.5/0.6/0.7/0.8). Старі ICE/Powertrain JSON відкриваються у відповідному збереженому модулі.');
 const migrated=data.version==='0.5.0'?{...defaults,...data.params,engineClass:'custom',sweepMinSpeed:Math.max(10,(data.params.system==='hybrid'&&data.params.topology==='series'?data.params.generatorEngineSpeed:data.params.ratedSpeed)*.3),sweepMaxSpeed:data.params.system==='hybrid'&&data.params.topology==='series'?data.params.generatorEngineSpeed:data.params.ratedSpeed}:{...defaults,...data.params};const params=validateParams(migrated,fields),known=new Set(fields.map(f=>f.key));
 for(const [k,v]of Object.entries(data.locked??{}))if(!known.has(k)||typeof v!=='boolean')throw Error('Некоректний захист поля.');
 for(const [k,v]of Object.entries(data.origins??{}))if(!known.has(k)||!v||typeof v.source!=='string'||typeof v.status!=='string'||(v.label??'').length>1000)throw Error('Некоректне походження поля.');
 let form={...formFromParams(params,fields),...(data.form??{})};const parsed=readForm(form,fields,params);
 for(const f of activeFields(fields,params))if(typeof params[f.key]==='number'&&Math.abs(parsed[f.key]-params[f.key])>Math.max(1e-9,Math.abs(params[f.key])*1e-10)||typeof params[f.key]==='string'&&parsed[f.key]!==params[f.key])throw Error('Форма не відповідає збереженим параметрам.');
 return {params,form,locked:data.locked??{},origins:data.origins??{},title:typeof data.title==='string'?data.title.slice(0,200):'Розрахунок силової установки'};
}


export function compatibleExamples(p,b){return b.examples.filter(e=>{const q={...b.defaults,...e.patch};return q.system===p.system&&(p.system==='electric'||q.fuelType===p.fuelType)&&(p.system!=='hybrid'||q.topology===p.topology);});}
