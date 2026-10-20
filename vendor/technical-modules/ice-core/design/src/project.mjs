import {hybridRoadCycle} from './hybrid-cycle.mjs';
import {designElectricVehicle,electricDriveRatio} from './ev-range.mjs';
import {addSupplements} from './supplements.mjs';
/** Authoritative, source-neutral project evaluation. Subsequent chapters consume graph IDs, not re-entered values. */
import {validateParams,activeFields,VERSION} from './schema.mjs';
import {sizeEngine,engineCharacteristics,engineSpeed,fuelAirRatio} from './ice.mjs';
import {designElectrical,boundedMotorSI,batteryConfig} from './electric.mjs';
import {batteryLimits} from '../../powertrain/src/battery.mjs';
import {linear} from '../../powertrain/src/maps.mjs';
import {rpmAdvice} from './datasets.mjs';
import {CalculationGraph,fingerprint} from './graph.mjs';
export function calculateDesign(candidate,bundle,{origins={},characteristics=true}={}){
 const p=validateParams({...bundle.defaults,...candidate},bundle.fields),g=new CalculationGraph(p,bundle,origins),checks=[];
 const check=(id,label,pass,extra={})=>checks.push({id,label,pass,...extra});
 if(p.system!=='ice'&&p.evEnabled==='yes'&&p.evRatioMode==='target')g.external('input.driveRatio',electricDriveRatio(p),null,'Передатне число за цільовою швидкістю','10-vehicle',['input.motorMaxSpeed','input.wheelRadius','input.evMaxSpeed'],'balance');
 g.calculate("value.omega_required");
 g.calculate("value.torque_required");
 let ice=null,electric=null,system=null,vehicle=null;
 if(p.system!=='electric'){
  ice=sizeEngine(p);Object.assign(ice,engineCharacteristics(p,ice,{loads:characteristics,sampling:bundle.speedSampling,loadSampling:bundle.loadSampling}));
  const dependencies=activeFields(bundle.fields,p).filter(f=>!f.options&&f.type!=='csv'&&['ice','gasoline','diesel','gdi','di','four-stroke','two-stroke','two-stroke-direct','gasoline-four','diesel-four','gdi-four','design-ice','manual-geometry','series','all','hybrid'].includes(f.scope)).map(f=>f.id);
  const ex=(id,v,u,label,ch='04-cycle')=>g.external('result.'+id,v,u,label,ch,dependencies);
  const period=p.engineCycle==='two-stroke'?360:720;
  ex('cycle_revolutions',period/360,null,'Кількість обертів на робочий цикл','05-performance');
  g.calculate("value.stoich");
  if(ice.calculated){ex('bore_solved',ice.calculated.bore,'m','Обчислений діаметр','03-preparation');ex('stroke_solved',ice.calculated.stroke,'m','Обчислений хід','03-preparation');ex('volume_seed',ice.calculated.seedVolume,'m^3','Початкове наближення літражу','03-preparation');}
  const manual=p.mode==='check'||p.adoption==='manual';
  if(p.adoption==='rounded'&&!manual){ex('bore_adopted',ice.adopted.bore,'m','Прийнятий округлений діаметр','03-preparation');ex('stroke_adopted',ice.adopted.stroke,'m','Прийнятий округлений хід','03-preparation');}
  g.alias('value.bore','Діаметр, прийнятий для наступних розрахунків','D','m',manual?'input.bore':p.adoption==='rounded'?'result.bore_adopted':'result.bore_solved','03-preparation');
  g.alias('value.stroke','Хід, прийнятий для наступних розрахунків','S','m',manual?'input.stroke':p.adoption==='rounded'?'result.stroke_adopted':'result.stroke_solved','03-preparation');
  g.calculate("value.area");
  g.calculate("value.swept_one");
  g.calculate("value.displacement");
  g.calculate("value.clearance");
  g.calculate("value.rod_length");
  const nInput=p.system==='hybrid'&&p.topology==='series'?'input.generatorEngineSpeed':'input.ratedSpeed';
  g.calculate("value.omega_engine",{ n:nInput });
  g.calculate("value.cycle_rate",{ n:nInput });
  const s=ice.point.summary;
  for(const [key,unit,label]of [['work','J',`Індикаторна робота одного циліндра за ${period}°`],['fuelPerCycle','kg','Маса палива за цикл одного циліндра'],['fmep','Pa','Середній тиск механічних втрат'],['pmax','Pa','Максимальний тиск'],['Tmax','K','Максимальна середня температура'],['Qw','W','Тепловий потік у стінки'],['Hnet','W','Нетто-потік ентальпії через газообмін і введення палива'],['unreleased','W','Енергія, не виділена як теплота'],['pIVC','Pa',period===360?'Тиск після закриття випускного вікна':'Тиск при закритті впуску'],['TIVC','K',period===360?'Температура після закриття випускного вікна':'Температура при закритті впуску'],['pSOC','Pa','Тиск на початку тепловиділення'],['TSOC','K','Температура на початку тепловиділення'],['pEVO','Pa','Тиск при відкритті випуску'],['TEVO','K','Температура при відкритті випуску']])ex(key,s[key],unit,label);
  g.calculate("value.mean_piston_speed",{ n:nInput });
  g.calculate("value.imep");
  g.calculate("value.indicated_power");
  g.calculate("value.friction_power");
  g.calculate("value.engine_power");
  g.calculate("value.bmep");
  g.calculate("value.engine_torque");
  g.calculate("value.fuel_flow");
  g.calculate("value.fuel_power");
  g.calculate("value.efficiency");
  if(s.Pe>0)g.calculate("value.bsfc");
  g.calculate("value.fuel_volume_flow");
  g.calculate("value.engine_power_error",{ R:p.system==='hybrid'?'input.hybridEngineTarget':'input.targetPower' });
  for(const [key,unit,label]of [['energySwing','J','Розмах надлишкової енергії'],['maxRodForce','N','Максимальна абсолютна сила в шатуні'],['maxGasForce','N','Максимальна газова сила'],['maxSideForce','N','Максимальна бокова сила'],['maxInertiaForce','N','Максимальна абсолютна сила інерції']])ex(key,s[key],unit,label,'06-dynamics');
  const sampleAngle=period===360?40:400;
  const sample=ice.point.rows.reduce((a,x)=>Math.abs(x.theta-sampleAngle)<Math.abs(a.theta-sampleAngle)?x:a,ice.point.rows[0]);
  const sampleDeps=['result.work','value.bore','value.stroke'];
  g.external('result.sample_pressure',sample.p,'Pa','Тиск у контрольній точці','06-dynamics',sampleDeps);
  g.external('result.sample_acceleration',sample.acceleration,'m/s^2','Прискорення поршня у контрольній точці','06-dynamics',sampleDeps);
  g.external('result.sample_theta',sample.theta*Math.PI/180,'rad','Кут контрольної точки','06-dynamics',sampleDeps);
  g.external('result.sample_beta',sample.beta,'rad','Кут нахилу шатуна у контрольній точці','06-dynamics',sampleDeps);
  g.calculate("value.crank_radius");
  g.calculate("value.sample_gas_force");
  g.calculate("value.sample_inertia_force");
  g.calculate("value.sample_total_force");
  g.calculate("value.sample_side_force");
  g.calculate("value.sample_rod_force");
  g.calculate("value.sample_tangent_force");
  g.calculate("value.sample_radial_force");
  g.calculate("value.sample_torque");
  g.calculate("value.mean_indicated_torque");
  g.calculate("value.total_inertia");
  g.calculate("value.coolant_mass_flow");
  check('engine-power','Потужність ДВЗ після прийняття геометрії',s.Pe>=ice.targetPower*(1-5e-5),{value:s.Pe,required:ice.targetPower,unit:'W'});
  check('max-pressure','Проєктна межа максимального тиску',s.pmax<=p.pmaxLimit,{value:s.pmax,required:p.pmaxLimit,unit:'Pa'});
  check('piston-speed','Проєктна межа середньої швидкості поршня',s.cm<=p.pistonSpeedLimit,{value:s.cm,required:p.pistonSpeedLimit,unit:'m/s'});
  check('mass-balance','Нев’язка балансу маси одного циліндра',Math.abs(s.massBalance)<1e-9,{value:s.massBalance,unit:'kg'});
  check('energy-balance','Нев’язка теплового балансу двигуна',Math.abs(s.balanceResidual)<.01,{value:s.balanceResidual,unit:'W'});
  check('pV-torque','Узгодженість інтеграла моменту й роботи p–V',s.torqueWorkError<.001,{value:s.torqueWorkError});
  check('burn-mass','Інтеграл теплоти й введеної маси палива',Math.abs(s.combustionIntegralError)<.002&&Math.abs(s.injectionMassError)<.002,{value:s.combustionIntegralError});
 }
 if(p.system!=='ice'){
  electric=designElectricVehicle(p,bundle,ice?.point.summary.Pe??0);checks.push(...electric.checks);
  const deps=activeFields(bundle.fields,p).filter(f=>!f.options&&f.type!=='csv').map(f=>f.id);if(ice)deps.push('value.engine_power');
  const ex=(id,v,u,label,ch='07-motor')=>g.external('result.'+id,v,u,label,ch,deps,'electrical-balance');
  ex('motor_requirement',electric.requiredMotorPower,'W','Потрібна механічна потужність тягової електромашини');
  ex('motor_s1',electric.motor.continuousKW*1000,'W','Прийнята потужність S1 електромашини');ex('motor_s1_torque',electric.motor.continuousNm,'N*m','Прийнятий момент S1 електромашини');
  g.calculate("value.motor_req_torque");
  g.calculate("value.motor_phase_current");
  g.calculate("value.motor_copper_loss");
  g.calculate("value.motor_rotation_loss");
  g.calculate("value.motor_dc_requirement");
  ex('motor_available',electric.available.ok?electric.available.mechanicalW:0,'W','Доступна моторна потужність з DC-обмеженнями');
  ex('average_dc',electric.averageDC,'W','Потрібна клемна потужність у прийнятому енергетичному режимі','08-battery');
  if(electric.currentRequired!==null){
   g.calculate("value.battery_current_required");
   g.calculate("value.battery_energy_required");
  }
  if(electric.installedEnergy!==null){ex('battery_energy',electric.installedEnergy,'J','Прийнята номінальна енергоємність','08-battery');g.calculate("value.battery_charge");}
  for(const [key,v,unit,label]of [['terminal_energy',electric.summary.terminalJ,'J','Енергія на клемах'],['chemical_energy',electric.summary.chemicalJ,'J','Зменшення хімічної енергії'],['battery_heat',electric.summary.heatJ,'J','Омічне тепло батареї'],['final_soc',electric.summary.finalSoc,null,'Кінцевий SOC']])ex(key,v,unit,label,'08-battery');
  g.calculate("value.electric_energy_residual");
 }
 system=evaluateSystemPoint(p,ice,electric,p.ratedSpeed*60);
 if(p.system==='ice')g.alias('value.system_power','Доступна потужність вихідного вала','P_calc','W','value.engine_power','16-conclusions');
 else if(p.system==='electric')g.alias('value.system_power','Доступна потужність вихідного вала при SOC₀','P_calc','W','result.motor_available','16-conclusions');
 else if(p.topology==='parallel')g.calculate("value.system_power");
 else{
  g.calculate("value.generator_before_limit");
  g.external('result.series_output',system.availableW,'W','Послідовна схема: вихід після обмежень і втрат','09-hybrid',['value.generator_before_limit','result.motor_s1','result.motor_available'],'electrical-balance');
  g.external('result.series_sustaining',system.sustainingW,'W','Послідовна схема без розряджання батареї','09-hybrid',['value.generator_before_limit','result.motor_s1'],'electrical-balance');
  g.alias('value.system_power','Доступна потужність послідовної установки при SOC₀','P_calc','W','result.series_output','09-hybrid');
 }
 g.calculate("value.system_residual");
 check('system-power',p.system==='ice'?'Вихідна потужність у заданій точці':'Вихідна потужність у заданій точці при початковому SOC',system.availableW>=p.targetPower*(1-5e-5),{value:system.availableW,required:p.targetPower,unit:'W'});
 if(p.vehicleEnabled==='yes'||electric?.range){
  if(electric?.range){
   const ch='08-battery',numbers={ev_reference_curb:'8.5',ev_reference_energy:'8.6',ev_reference_battery:'8.7',ev_base_mass:'8.8',ev_battery_mass:'8.9',ev_curb_mass:'8.10',ev_battery_budget:'8.11',ev_energy_budget:'8.12'},calc=(id,label,sym,u,expr,bindings)=>{const v=g.calc('result.'+id,label,sym,u,expr,bindings,ch,['automobile-ev-adaptation']);g.records.at(-1).equationNumber=numbers[id];return v;};
   if(p.evMassMode==='q'){
    calc('ev_reference_curb','Опорна споряджена маса за q','m_ref','kg','q*Q',{q:'input.evTareRatio',Q:'input.evReferencePayload'});
    calc('ev_reference_battery','Маса опорної батареї','m_b,ref','kg','E/e',{E:'input.evReferenceBatteryEnergy',e:'input.evReferenceSpecificEnergy'});
    calc('ev_base_mass','Маса автомобіля без батареї та вантажу','m_base','kg','m-b',{m:'result.ev_reference_curb',b:'result.ev_reference_battery'});
   }else if(p.evMassMode==='total'){
    if(p.evSizing==='packs')calc('ev_reference_energy','Енергія початкових пакетів','E_ref','J','n*E',{n:'input.evPackCount',E:'input.evPackEnergy'});
    calc('ev_reference_battery','Маса початкової батареї у відомій спорядженій масі','m_b,ref','kg','E/e',{E:p.evSizing==='packs'?'result.ev_reference_energy':'input.batteryEnergy',e:'input.evSpecificEnergy'});
    calc('ev_base_mass','Маса автомобіля без батареї та вантажу','m_base','kg','m-b',{m:'input.mass',b:'result.ev_reference_battery'});
   }else g.alias('result.ev_base_mass','Задана маса без батареї та вантажу','m_base','kg','input.mass',ch);
   calc('ev_battery_mass','Маса обраної батареї','m_b','kg','E/e',{E:'result.battery_energy',e:'input.evSpecificEnergy'});
   calc('ev_curb_mass','Споряджена маса з обраною батареєю','m_curb','kg','base+b',{base:'result.ev_base_mass',b:'result.ev_battery_mass'});
   calc('ev_battery_budget','Масовий бюджет батареї після резервування вантажу','m_b,max','kg','G-base-load',{G:'input.evGrossMass',base:'result.ev_base_mass',load:'input.evPayload'});
   calc('ev_energy_budget','Енергетична межа за масою; від’ємна — неможливий варіант','E_b,max','J','m*e',{m:'result.ev_battery_budget',e:'input.evSpecificEnergy'});
   g.calc('result.vehicle_mass','Повна маса з батареєю та заданим вантажем','m','kg','curb+load',{curb:'result.ev_curb_mass',load:'input.evPayload'},ch,['automobile-ev-adaptation']);g.records.at(-1).equationNumber='8.13';
   g.calc('result.ev_mass_reserve','Додатковий залишок маси після заданого вантажу','Δm','kg','G-m',{G:'input.evGrossMass',m:'result.vehicle_mass'},ch,['automobile-ev-adaptation']);g.records.at(-1).equationNumber='8.14';
  }
  addRoadDemand(g,electric?.range?'result.vehicle_mass':'input.mass');
  g.calculate("value.vehicle_shaft_speed");
  const q=evaluateSystemPoint(p,ice,electric,g.values['value.vehicle_shaft_speed']*60),braking=g.values['value.wheel_demand']<0;
  g.external('result.vehicle_shaft_capacity',q.availableW,'W','Доступна потужність установки на обчисленій частоті','10-vehicle',['value.vehicle_shaft_speed','value.system_power'],'balance');
  g.calculate("value.wheel_available");
  const pass=braking?null:g.values['value.wheel_available']>=g.values['value.wheel_power'];
  vehicle={shaftRPM:g.values['value.vehicle_shaft_speed']*60,demandW:g.values['value.wheel_power'],availableW:g.values['value.wheel_available'],force:g.values['value.wheel_demand'],pass,point:q,braking};
  check('vehicle-point',braking?'Гальмівна точка: окремий гальмівний розрахунок не виконаний':'Задана точка цільового автомобіля',pass,{value:vehicle.availableW,required:vehicle.demandW,unit:'W'});
 }
 if(electric){electric.systemCurve=Array.from({length:81},(_,j)=>{const rpm=electric.motor.maxRpm*j/80,q=evaluateSystemPoint(p,ice,electric,rpm),pk=evaluateSystemPoint(p,ice,electric,rpm,'peak'),w=rpm*Math.PI/30;return {rpm,engineW:q.engineW,generatorW:q.generatorW??0,motorW:q.motorW,continuousW:q.availableW,peakW:pk.availableW,sustainingW:q.sustainingW,continuousNm:w>0?q.availableW/w:(electric.curve[0]?.continuousNm??0),peakNm:w>0?pk.availableW/w:(electric.curve[0]?.peakNm??0)};});}
 if(ice&&electric?.range&&characteristics){
  electric.hybridCycle=hybridRoadCycle(p,electric,ice,bundle);const h=electric.hybridCycle;
  checks.push({id:'hybrid-cycle-power',label:'Гібридний маршрут: тяга, SOC та електричні межі',pass:h.feasible,value:h.unmetJ,required:0,unit:'J'}, {id:'hybrid-cycle-balance',label:'Гібридний маршрут: баланс DC і хімічної енергії',pass:Math.abs(h.balanceResidual)<.01&&Math.abs(h.socResidual)<.1&&h.maxDcResidual<.001,value:h.balanceResidual,required:0,unit:'J'});
  for(const [key,value,unit,label]of [['hybrid_cycle_fuel',h.fuelKg,'kg','Паливо за обраний гібридний цикл'],['hybrid_cycle_energy',h.chemicalJ,'J','Зміна хімічної енергії за гібридний цикл'],['hybrid_cycle_soc',h.finalSoc,null,'SOC після гібридного циклу']])g.external('result.'+key,value,unit,label,'09-hybrid',['input.hybridEngineShare','value.engine_power','result.motor_s1'],'ev-assumptions');
 }
 const datasets={...(ice?{'dataset.ice-cycle':ice.point.rows,'dataset.ice-speed':ice.speed,'dataset.ice-fuel-curves':ice.fuelCurves}:{}),...(electric?{'dataset.electric-curve':electric.curve,'dataset.battery-mission':electric.mission,'dataset.motor-efficiency':electric.efficiencyMap,'dataset.system-curve':electric.systemCurve,...(electric.range?{...(electric.bevProcedures?.full?{'dataset.bev-full':electric.bevProcedures.full.rows,'dataset.bev-full-stages':electric.bevProcedures.full.stages,...(electric.bevProcedures.full.endTrace?{'dataset.bev-full-end':electric.bevProcedures.full.endTrace}:{})}:{}),...(electric.bevProcedures?.short?{'dataset.bev-short':electric.bevProcedures.short.rows,'dataset.bev-short-stages':electric.bevProcedures.short.stages,...(electric.bevProcedures.short.endTrace?{'dataset.bev-short-end':electric.bevProcedures.short.endTrace}:{})}:{}),'dataset.ev-payload-range':electric.range.payloadMap,'dataset.ev-road':electric.range.rows,'dataset.ev-sizing':electric.range.sweep,'dataset.ev-payload-fixed':electric.range.payloadSweep,'dataset.ev-battery-fixed-payload':electric.range.batterySweep,'dataset.ev-speed-range':electric.range.speedRows,'dataset.ev-range-soc':electric.range.rangeProfile,'dataset.ev-acceleration':electric.range.acceleration.rows}:{})}:{})};
 if(electric?.hybridCycle)datasets['dataset.hybrid-cycle']=electric.hybridCycle.rows;
 const supplements=addSupplements(g,p,ice,electric,bundle,{characteristics});Object.assign(datasets,supplements.datasets);
 const advice=rpmAdvice(p,bundle);const document=g.finish(datasets,checks);document.engineeringData.adoptedValues=ice?[{id:'adopted.geometry',calculated:ice.calculated,adopted:ice.adopted,recalculated:true}]:[];
 return {supplements,version:VERSION,params:p,inputRevision:g.revision,sourceRevision:bundle.sourceRevision,calculationRevision:document.document.revision,origins,graph:g.records,values:g.values,document,nativeDocument:document.nativeDocument,ice,electric,system,vehicle,checks,datasets,passed:[...checks,...supplements.firstOrder.checks].every(c=>c.pass===true),status:'model-estimated',rpmAdvice:advice,warnings:[...(advice.mismatch||advice.out?[advice.text]:[]),
 'Це інженерна модель із явними припущеннями, не стендова валідація й не сертифікація Euro.',
 ...(ice?[p.engineCycle==='two-stroke'?'Двотактний однозонний газ із продувкою та вікнами; роботу нагнітача й детальну ефективність продувки не визначено, тому ефективна потужність є верхньою оцінкою.':'Чотиритактний однозонний газ; задані впорскування, закони тепловиділення й резервуари. Властивості газу ефективні, без хімічної рівноваги.',ice.loadMethod]:[]),
 ...(electric?[electric.range?'Електричний пробіг: ДВЗ вимкнений, сталі Voc/R, задані вантаж і цикл; немає теплової динаміки, кліматичної корекції чи старіння. Пік обмежено сумарним часом за цикл.':'Сталі Voc/R; сталий енергетичний режим без їздового циклу.']:[]),
 ...(p.system==='hybrid'?['Спільна потужність при SOC₀ може вимагати розряджання батареї. Не є гарантією тривалої charge-sustaining потужності. Для HEV батарейний тест перевіряє буфер, а не пробіг після заряджання.']:[])]};
}
export function evaluateSystemPoint(p,ice,electric,rpm,rating='continuous'){
 const iceW=ice?(linear(ice.speed.map(x=>x.rpm),ice.speed.map(x=>x.meanTorque),rpm)??0)*rpm*Math.PI/30:0;
 if(p.system==='ice')return {rpm,engineW:iceW,motorW:0,availableW:iceW,sustainingW:iceW,source:'computed-cycle-series'};
 const e=electric,count=p.evMotorCount??1,b=(rating==='peak'?e.peakLimits:e.limits)??{minW:0,maxW:0},minDC=Math.max((b.minW-p.auxPower)/count,-e.motor.maxDcW);
 const motor=(budget)=>boundedMotorSI(e.motor,rpm,1e6,p.inverterEfficiency,minDC,Math.min(budget/count,e.motor.maxDcW),rating);
 if(p.system==='hybrid'&&p.topology==='series'){
  const gen=Math.max(0,Math.min(p.generatorLimit,ice.point.summary.Pe*p.generatorEfficiency)),assist=motor(b.maxW+gen-p.auxPower),steady=boundedMotorSI(e.motor,rpm,1e6,p.inverterEfficiency,0,Math.min(Math.max(0,gen-p.auxPower)/count,e.motor.maxDcW),'continuous');
  return {rpm,engineW:ice.point.summary.Pe,generatorW:gen,motorW:assist.ok?assist.mechanicalW*count:0,availableW:assist.ok?assist.mechanicalW*count:0,sustainingW:steady.ok?steady.mechanicalW*count:0,batteryAssistW:assist.ok?Math.max(0,assist.dcW*count+p.auxPower-gen):0};
 }
 const q=motor(b.maxW-p.auxPower),motorW=q.ok?q.mechanicalW*count:0;
 return {rpm,engineW:iceW,motorW,availableW:iceW+motorW,sustainingW:p.system==='electric'?motorW:iceW,batteryAssistW:q.ok?q.dcW*count+p.auxPower:0};
}

/** One road-load definition reused by chapter 10 and the explicit input helper. */
export function addRoadDemand(g,massId='input.mass'){
  g.add('constant.gravity',9.80665,'m/s^2','Стандартне прискорення вільного падіння','input','10-vehicle',[],'balance','g');g.add('constant.air_density',1.225,'kg/m^3','Прийнята густина повітря для автомобіля','input','10-vehicle',[],'assumptions','ρ_air');
  g.calculate("value.normal_force",{m:massId});
  g.calculate("value.rolling_force");
  g.calculate("value.grade_force");
  g.calculate("value.aero_force");
  g.calculate("value.wheel_demand");
  g.calculate("value.wheel_power");

}
export function vehiclePowerProposal(p,bundle){
 if(p.vehicleEnabled!=='yes')throw Error('Увімкніть блок цільового автомобіля.');
 const g=new CalculationGraph(validateParams(p,bundle.fields),bundle);addRoadDemand(g);
 g.add('decision.power_margin',1.2,null,'Прийнятий коефіцієнт запасу','input','10-vehicle',[],'assumptions','k_P');
 const P=g.calculate("value.power_advised");
 if(P<=0)throw Error('На спуску ця підказка не визначає додатної потрібної потужності.');
 return {patch:{targetPower:P},traces:g.records.filter(x=>x.chapter==='10-vehicle'),inputRevision:g.revision,label:'Усталений рух цільового автомобіля + прийнятий запас 20%'};
}
