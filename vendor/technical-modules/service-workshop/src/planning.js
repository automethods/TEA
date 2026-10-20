import {CalculationBook,scalar} from './calculations.js';
import {CLASS_IDS,PLANNING_FIELDS} from './presets.js';
export function evaluateFleet(data,state){
 const shares=CLASS_IDS.map(id=>state.vehicleMix[id]);
 if(!shares.every(v=>Number.isFinite(v)&&v>=0&&v<=100)||Math.abs(shares.reduce((a,b)=>a+b,0)-100)>1e-7)throw new Error('Частки класів мають бути заданими, невід’ємними та разом дорівнювати 100%. Автоматичного нормування немає.');
 const active=CLASS_IDS.filter(id=>state.vehicleMix[id]>0),b=new CalculationBook('fleet','Змішаний потік транспортних засобів');
 for(const id of active){
  const c=state.classData[id];b.input(id+'.share',state.vehicleMix[id],'Частка '+id,'%','SYN-02');
  for(const key of ['length','width','mass'])if(!Number.isFinite(c[key])||c[key]<=0)throw new Error(`${id}: потрібні додатні габарити й маса представника класу.`);
  for(const j of data.job_types){const h=c.hours[j.id];if(!Number.isFinite(h)||h<0)throw new Error(`${id}: трудомісткості мають бути невід’ємними числами.`);b.input(id+'.'+j.id,h,id+' · '+j.name_uk,'люд.-год/замовлення','SYN-02');}
 }
 for(const j of data.job_types){const bindings={},terms=[];active.forEach((id,i)=>{bindings['s'+i]=id+'.share';bindings['h'+i]=id+'.'+j.id;terms.push(`s${i} * h${i} / 100`);});b.calc(j.id,terms.join(' + '),bindings,'Зважена трудомісткість '+j.name_uk,'люд.-год/замовлення','3.1','SYN-02');}
 const module=b.evaluate();return {module,hours:module.values,active,classes:active.map(id=>({id,share:state.vehicleMix[id],...state.classData[id]}))};
}
export function evaluatePlanning(data,state,annual,fleet){
 if(annual.error||fleet.error)throw new Error('Спочатку виправте склад потоку та річну програму.');
 const p=state.planning;
 for(const [key,label,,min,max,step] of PLANNING_FIELDS)if(!Number.isFinite(p[key])||p[key]<min||p[key]>max||(step===1&&!Number.isInteger(p[key])))throw new Error(`${label}: потрібне число від ${min} до ${max}${step===1?' (ціле)':''}.`);
 if(p.hours*p.shifts>24)throw new Error('Сумарна тривалість змін не може перевищувати 24 години на добу.');
 const b=new CalculationBook('planning','Ресурси СТО за річною програмою');
 for(const [k,v] of Object.entries(p))b.input(k,v,k,'','SYN-02');
 b.input('annualLabour',annual.hours,'Загальна річна трудомісткість','люд.-год','CASE + SYN-02');b.input('orders',annual.count,'Річні замовлення','замовлень','CASE + SYN-02');
 for(const j of data.job_types){const share=state.bayShare[j.id];if(!Number.isFinite(share)||share<0||share>1)throw new Error('Частка постових робіт має бути від 0 до 1.');b.input(j.id+'.H',annual.byJob[j.id],'Праця '+j.name_uk,'люд.-год');b.input(j.id+'.share',share,'Частка постових робіт','0–1','SYN-02');}
 b.calc('bayLabour',data.job_types.map((j,i)=>`h${i} * s${i}`).join(' + '),Object.fromEntries(data.job_types.flatMap((j,i)=>[['h'+i,j.id+'.H'],['s'+i,j.id+'.share']])),'Постова праця','люд.-год','3.2','ST02 + SYN-02');
 const defs=[
 ['benchLabour','H - B',{H:'annualLabour',B:'bayLabour'},'Позапостова праця','люд.-год','3.3'],
 ['bayHours','H / r',{H:'bayLabour',r:'crew'},'Активна зайнятість постів','посто-год','3.4'],
 ['bayFund','d * t * s * u',{d:'days',t:'hours',s:'shifts',u:'bayUtil'},'Річний фонд одного поста','год','3.5'],
 ['workerFund','d * t * a',{d:'days',t:'hours',a:'attendance'},'Річний фонд одного працівника','год','3.6'],
 ['bayDemand','H / F',{H:'bayHours',F:'bayFund'},'Потреба в постах до округлення','постів','3.7'],
 ['workerDemand','H / F',{H:'annualLabour',F:'workerFund'},'Потреба в працівниках до округлення','осіб','3.8'],
 ['bayLoad','100 * H / (n * F)',{H:'bayHours',n:'plannedBays',F:'bayFund'},'Попит / прийнятий фонд постів','%','3.9'],
 ['workerLoad','100 * H / (n * F)',{H:'annualLabour',n:'plannedWorkers',F:'workerFund'},'Попит / прийнятий фонд працівників','%','3.10'],
 ['arrivalRate','N / (d * t * s)',{N:'orders',d:'days',t:'hours',s:'shifts'},'Середній потік у відкриті години','авто/год','3.11'],
 ['parkingDemand','k * a * (w + r)',{k:'peakFactor',a:'arrivalRate',w:'waitBefore',r:'waitReady'},'Оціночна потреба стоянки до округлення','місць','3.12']
 ];for(const def of defs)b.calc(...def,'SYN-02');
 const length=Math.max(...fleet.classes.map(c=>c.length)),width=Math.max(...fleet.classes.map(c=>c.width));
 b.input('vehicleLength',length,'Найбільша довжина представника в потоці','м','SYN-02');b.input('vehicleWidth',width,'Найбільша ширина представника в потоці','м','SYN-02');
 b.calc('bayArea','(L + 2 * e) * (W + 2 * s)',{L:'vehicleLength',W:'vehicleWidth',e:'endClearance',s:'sideClearance'},'Умовний прямокутник одного поста','м²','3.13','SYN-02');
 b.calc('workArea','n * A + x',{n:'plannedBays',A:'bayArea',x:'auxArea'},'Ескізна виробнича площа','м²','3.14','SYN-02');
 const module=b.evaluate(),v=module.values,requiredBays=Math.ceil(v.bayDemand-1e-10),requiredWorkers=Math.ceil(v.workerDemand-1e-10),requiredParking=Math.ceil(v.parkingDemand-1e-10);
 const compatibility=fleet.classes.map(c=>({id:c.id,issues:[c.length>p.maxLength?'довжина':null,c.width>p.maxWidth?'ширина':null,c.mass>p.maxMass?'маса':null].filter(Boolean)}));
 const warnings=[];
 for(const c of compatibility)if(c.issues.length)warnings.push(`${c.id}: перевищено прийняту можливість СТО (${c.issues.join(', ')}).`);
 if(requiredBays>p.plannedBays)warnings.push(`За обсягом робіт бракує ${requiredBays-p.plannedBays} постів.`);
 if(requiredWorkers>p.plannedWorkers)warnings.push(`За річним фондом бракує ${requiredWorkers-p.plannedWorkers} працівників.`);
 if(requiredParking>p.parkingSpaces)warnings.push(`За прийнятою моделлю бракує ${requiredParking-p.parkingSpaces} місць стоянки.`);
 return {module,...v,requiredBays,requiredWorkers,requiredParking,compatibility,warnings};
}
