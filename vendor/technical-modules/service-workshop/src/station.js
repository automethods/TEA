import {selectStationLayout} from './station-layout.js';
import {buildStationPlan} from './station-plan.js';
import {CalculationBook} from './calculations.js';
import {CLASS_IDS} from './presets.js';
import {EQUIPMENT,ZONES,validateStation} from './station-data.js';
const ceil=x=>Math.ceil(x-1e-10),round=x=>ceil(x*10)/10;
export function evaluateStation(data,s){
 validateStation(s);const d=s.design,p=s.planning,b=new CalculationBook('station','Технологічне проєктування СТО / АТП'),warnings=[],rows=[],groups={};
 const inp=(k,v,label,unit='')=>b.input(k,v,label,unit,'SYN-03');
 const calc=(id,expression,bindings,label,unit,number)=>b.calc(id,expression,bindings,label,unit,number,'S17, SYN-03');
 for(const k of ['days','hours','shifts','attendance','bayUtil']){if(!Number.isFinite(p[k])||p[k]<=0)throw Error('Перевірте календар роботи СТО.');inp(k,p[k],k);}
 if(p.hours*p.shifts>24||p.days>366||p.attendance>1||p.bayUtil>1)throw Error('Перевірте тривалість змін і коефіцієнти фонду часу.');
 for(const k of ['waitBefore','waitReady'])if(!Number.isFinite(p[k])||p[k]<0)throw Error('Час очікування має бути невід’ємним.');
 inp('peak',d.peak,'Нерівномірність завантаження');inp('crew',d.crew,'Одночасно працюють на посту');
 calc('postFund','days*hours*shifts*bayUtil',{days:'days',hours:'hours',shifts:'shifts',bayUtil:'bayUtil'},'Фонд одного поста','посто-год/рік','4.1');
 calc('personFund','days*hours*attendance',{days:'days',hours:'hours',attendance:'attendance'},'Ефективний фонд одного працівника','люд.-год/рік','4.2');
 const active=CLASS_IDS.filter(k=>d.programme==='atp'?d.fleet[k].count>0:s.vehicleMix[k]>0);
 if(!active.length)throw Error('Задайте автомобілі парку або склад сервісного потоку.');
 if(d.programme==='sto'&&Math.abs(CLASS_IDS.reduce((n,k)=>n+s.vehicleMix[k],0)-100)>1e-7)throw Error('Частки сервісного потоку мають складати 100%.');
 let annualLabour=0,visits=0;
 for(const c of active){
  const vehicle=d.vehicles[c],heavy=vehicle.mass>6.5||vehicle.length>8,group=heavy?'heavy':'light';
  const v=vehicle.mass;if((c==='M2'&&v>5)||(c==='M3'&&v<=5)||(c==='N1'&&v>3.5)||(c==='N2'&&(v<=3.5||v>12))||(c==='N3'&&v<=12))warnings.push(`${c}: прийнята повна маса не відповідає категорії.`);
  let jobs;
  if(d.programme==='sto'){
   jobs=data.job_types.map(j=>{const count=s.months.reduce((n,m)=>n+m.counts[j.id],0)*s.vehicleMix[c]/100*d.demandFactor,h=s.classData[c].hours[j.id];if(!Number.isFinite(count)||count<0||!Number.isFinite(h)||h<0)throw Error('Перевірте програму і трудомісткість.');const prefix=c+'_'+j.id;inp(prefix+'_N',count,c+' '+j.name_uk+' звернень');inp(prefix+'_t',h,c+' трудомісткість','люд.-год');calc(prefix+'_H','N*t',{N:prefix+'_N',t:prefix+'_t'},c+' '+j.name_uk+' праця','люд.-год','3.1');return {id:j.id,count,h,hours:count*h};});
   rows.push({classId:c,name:vehicle.name,visits:jobs.reduce((n,j)=>n+j.count,0),km:null,n1:null,n2:null,hours:jobs.reduce((n,j)=>n+j.hours,0),jobs});
  }else{
   const f=d.fleet[c],prefix=c+'_';
   for(const k of ['count','dailyKm','days','availability','interval1','interval2','t1','t2','repair'])inp(prefix+k,f[k],c+' '+k);
   calc(prefix+'km','n*km*days*a',{n:prefix+'count',km:prefix+'dailyKm',days:prefix+'days',a:prefix+'availability'},c+': річний пробіг парку','км','3.1');
   calc(prefix+'n2','L/I',{L:prefix+'km',I:prefix+'interval2'},c+': великі ТО','обсл./рік','3.2');
   calc(prefix+'n1','L/I-n2',{L:prefix+'km',I:prefix+'interval1',n2:prefix+'n2'},c+': малі ТО без подвійного обліку','обсл./рік','3.3');
   calc(prefix+'labour','n1*t1+n2*t2+L*r/1000',{n1:prefix+'n1',t1:prefix+'t1',n2:prefix+'n2',t2:prefix+'t2',L:prefix+'km',r:prefix+'repair'},c+': річна трудомісткість','люд.-год','3.4');
   const km=f.count*f.dailyKm*f.days*f.availability,n2=km/f.interval2,n1=km/f.interval1-n2,maintenance=n1*f.t1+n2*f.t2,repair=km*f.repair/1000,total=maintenance+repair;
   // Diagnostics and tyres are allocated from the total, never added again.
   jobs=[{id:'maintenance',count:n1+n2,hours:maintenance*(1-f.diagnostic-f.wheel)},{id:'mechanical',count:repair/Math.max(s.classData[c].hours.mechanical,.01),hours:repair*(1-f.diagnostic-f.wheel)},{id:'diagnostic',count:0,hours:total*f.diagnostic},{id:'wheel',count:0,hours:total*f.wheel}];
   rows.push({classId:c,name:vehicle.name,visits:jobs.reduce((n,j)=>n+j.count,0),km,n1,n2,hours:total,jobs});
  }
  for(const job of jobs){
   const zone=['maintenance','mechanical'].includes(job.id)?'general':job.id,key=group+'_'+zone,share=s.bayShare[job.id];
   if(!Number.isFinite(share)||share<0||share>1)throw Error('Частка постових робіт: 0–1.');
   groups[key]??={key,group,zone,label:ZONES[zone]+(heavy?' · важкі ТЗ':' · легкі ТЗ'),labour:0,bayLabour:0,visits:0,classes:[]};
   const g=groups[key];g.labour+=job.hours;g.bayLabour+=job.hours*share;g.visits+=job.count;if(!g.classes.includes(c))g.classes.push(c);
   annualLabour+=job.hours;visits+=job.count;
  }
 }
 const programme=b.evaluate().values;
 for(const row of rows)if(d.programme==='atp')row.hours=programme[row.classId+'_labour'];
 const zones=Object.values(groups).filter(g=>g.labour>0),fund=programme.postFund,workerFund=programme.personFund;
 for(const g of zones){
  inp(g.key+'_H',g.labour,g.label+' праця');inp(g.key+'_B',g.bayLabour,g.label+' постова праця');
  calc(g.key+'_postHours','B/crew',{B:g.key+'_B',crew:'crew'},g.label+': зайнятість поста','посто-год','4.3');
  calc(g.key+'_rawPosts','B*peak/(crew*F)',{B:g.key+'_B',peak:'peak',crew:'crew',F:'postFund'},g.label+': пости до округлення','постів','4.4');
  g.postHours=g.bayLabour/d.crew;g.rawPosts=g.postHours*d.peak/fund;g.required=ceil(g.rawPosts);g.count=d.mode==='new'?g.required:d.existing[g.key];
  g.capacity=g.count*fund;g.load=g.capacity?g.postHours/g.capacity*100:g.postHours?Infinity:0;
  g.vehicle={length:Math.max(...g.classes.map(k=>d.vehicles[k].length)),width:Math.max(...g.classes.map(k=>d.vehicles[k].width)),height:Math.max(...g.classes.map(k=>d.vehicles[k].height)),mass:Math.max(...g.classes.map(k=>d.vehicles[k].mass)),axle:Math.max(...g.classes.map(k=>d.vehicles[k].axle))};
  g.lift=g.zone==='diagnostic'?null:(d.choices[g.group]);
  const lift=g.lift&&EQUIPMENT[g.lift];g.compatible=!lift||(g.vehicle.mass<=lift.capacity&&(!lift.maxAxle||g.vehicle.axle<=lift.maxAxle));
  if(!g.compatible)warnings.push(g.label+': обраний підйомник не відповідає масі / осьовому навантаженню.');
  if(g.count<g.required)warnings.push(g.label+': потрібно '+g.required+', прийнято '+g.count+' постів.');
  const equipmentWidth=lift?(lift.kind==='columns'?g.vehicle.width+2*lift.w:lift.w):g.vehicle.width;
  g.w=round(Math.max(g.vehicle.width+2*d.side,equipmentWidth+1.2,g.zone==='wheel'?(g.group==='heavy'?5.4:4.2):0));
  g.l=round(g.vehicle.length+2*d.end+(g.zone==='wheel'?(g.group==='heavy'?3:2.5):1.5));
  g.height=round(Math.max(g.vehicle.height+(lift?1.8:0)+.5,lift?.kind==='lift'?5.3:0));
 }
 if(!zones.length)throw Error('Річна програма не містить робіт.');
 inp('totalH',annualLabour,'Загальна праця','люд.-год');inp('visits',visits,'Візити за програмою');
 calc('workersRaw','H/F',{H:'totalH',F:'personFund'},'Штат до округлення','осіб','4.5');
 const requiredWorkers=Math.max(d.crew,ceil(annualLabour/workerFund)),workers=d.mode==='new'?requiredWorkers:d.existingWorkers,perShift=ceil(workers/p.shifts);
 if(workers<requiredWorkers)warnings.push(`Працівники: потрібно ${requiredWorkers}, прийнято ${workers}.`);
 const bays=[];let eqIndex=0;const equipment=[];
 const add=(id,bay,x,y)=>{const key=(bay?.id??'aux')+'_'+id,e={...EQUIPMENT[id],id,key,pos:++eqIndex,bayId:bay?.id??'допоміжна зона',x,y,price:d.prices[id]};if(d.equipmentOverrides[key]){e.x=d.equipmentOverrides[key].x;e.y=d.equipmentOverrides[key].y;}equipment.push(e);if(bay)bay.equipment.push(e);return e;};
 for(const g of zones)for(let i=0;i<g.count;i++){const bay={id:'П'+String(bays.length+1).padStart(2,'0'),...g,zoneKey:g.key,equipment:[],rotation:0};bays.push(bay);}
 if(bays.length>60)throw Error('Потрібно понад 60 постів. Розділіть підприємство на корпуси або збільште фонд поста.');
 const layout=selectStationLayout(bays,d,Math.max(...zones.map(g=>g.height)));
 bays.splice(0,bays.length,...layout.bays);layout.bays=bays;
 const {width,depth,aisle,border,auxY}=layout;
 for(const bay of bays){
  const override=d.bayOverrides[bay.id];if(override){bay.x=override.x;bay.y=override.y;bay.rotation=override.rotation;}
  const v=bay.vehicle,cx=bay.vehicleX+v.width/2;
  if(bay.lift)add(bay.lift,bay,cx,bay.vehicleY+v.length/2);
  if(bay.access==='through'){
   const id=bay.zone==='general'?'bench':bay.zone==='wheel'?(bay.group==='heavy'?'tyreHeavy':'tyreLight'):'diagnostic';
   add(id,bay,.2,Math.min(bay.l-EQUIPMENT[id].l-.2,d.end+2));
  }else{
   if(bay.zone==='diagnostic')add('diagnostic',bay,.4,.35);
   else if(bay.zone==='general')add('bench',bay,.4,bay.l-.95);
   if(bay.zone==='wheel')add(bay.group==='heavy'?'tyreHeavy':'tyreLight',bay,(bay.w-EQUIPMENT[bay.group==='heavy'?'tyreHeavy':'tyreLight'].w)/2,bay.l-EQUIPMENT[bay.group==='heavy'?'tyreHeavy':'tyreLight'].l-.15);
  }
  add('extraction',bay,bay.w-.7,.3);
 }
 for(const g of zones){const bay=bays.find(b=>b.zoneKey===g.key);if(bay)Object.assign(g,{w:bay.w,l:bay.l,access:bay.access});}
 add('compressor',null,width-aisle-border+1,auxY+1);
 for(const bay of bays){
  const vrect={x:bay.vehicleX,y:bay.vehicleY,w:bay.vehicle.width,h:bay.vehicle.length};
  const conflict=(a,b)=>a.x<b.x+b.w-.001&&b.x<a.x+a.w-.001&&a.y<b.y+b.h-.001&&b.y<a.y+a.h-.001;
  const fixed=bay.equipment.filter(e=>!['lift','columns'].includes(e.kind));
  for(const e of bay.equipment){if(['lift','columns'].includes(e.kind)){if(Math.abs(e.x-(bay.vehicleX+bay.vehicle.width/2))>.01||Math.abs(e.y-(bay.vehicleY+bay.vehicle.length/2))>.01)warnings.push(bay.id+': позиція '+e.pos+' зміщена від розрахункового положення підйому; перевірте суміщення з ТЗ.');continue;}
   if(e.x<0||e.y<0||e.x+e.w>bay.w+.001||e.y+e.l>bay.l+.001)warnings.push(bay.id+': обладнання '+e.pos+' виходить за межі поста.');
   if(bay.access==='through'&&conflict({x:e.x,y:e.y,w:e.w,h:e.l},{x:bay.vehicleX-.3,y:0,w:bay.vehicle.width+.6,h:bay.l}))warnings.push(bay.id+': обладнання '+e.pos+' перекриває наскрізну смугу руху.');
   if(conflict({x:e.x,y:e.y,w:e.w,h:e.l},vrect))warnings.push(bay.id+': обладнання '+e.pos+' перетинає габарит ТЗ.');
   for(const other of fixed)if(other.pos>e.pos&&conflict({x:e.x,y:e.y,w:e.w,h:e.l},{x:other.x,y:other.y,w:other.w,h:other.l}))warnings.push(bay.id+': перетин обладнання '+e.pos+' / '+other.pos+'.');
  }
 }
 layout.height=Math.max(...zones.map(g=>g.height));
 const rect=b=>({x:b.x,y:b.y,w:b.rotation===90?b.l:b.w,h:b.rotation===90?b.w:b.l});
 const overlaps=(a,c)=>a.x<c.x+c.w-.001&&c.x<a.x+a.w-.001&&a.y<c.y+c.h-.001&&c.y<a.y+a.h-.001;
 for(let i=0;i<bays.length;i++){
  const a=rect(bays[i]);if(a.x<border-.001||a.y<border-.001||a.x+a.w>width-aisle-border+.001||a.y+a.h>auxY+.001)warnings.push(bays[i].id+': пост виходить за межі виробничої зони / перекриває проїзд.');
  for(let j=i+1;j<bays.length;j++)if(overlaps(a,rect(bays[j])))warnings.push(bays[i].id+' і '+bays[j].id+': перетин постів.');
  if(d.bayOverrides[bays[i].id]){const bay=bays[i],fy=bay.face==='bottom'?bay.l:-aisle,front=bay.rotation===90?{x:bay.x+bay.l-fy-aisle,y:bay.y,w:aisle,h:bay.w}:{x:bay.x,y:bay.y+fy,w:bay.w,h:aisle};if(front.x<border-.001||front.y<border-.001||front.x+front.w>width-border+.001||front.y+front.h>auxY+.001)warnings.push(bay.id+': фронтальний проїзд виходить за межі доступного простору.');if(bays.some((other,j)=>j!==i&&overlaps(front,rect(other))))warnings.push(bays[i].id+': недостатній вільний проїзд перед постом.');}
 }
 layout.plan=buildStationPlan(layout,d);warnings.push(...layout.plan.warnings);
 if(d.mode==='existing'&&(layout.plan.outerWidth>d.existingWidth||layout.plan.outerDepth>d.existingDepth||layout.height>d.existingHeight))warnings.push('План перевищує задані габарити існуючого приміщення.');
 const parking=ceil(visits/(p.days*p.hours*p.shifts)*d.peak*(p.waitBefore+p.waitReady));
 const capacityHours=Math.max(0,Math.min(workers*workerFund,...zones.map(g=>!g.compatible?0:g.postHours?annualLabour*g.capacity/g.postHours:Infinity)));
 const throughputFactor=Math.min(1,capacityHours/annualLabour);
 const realised=annualLabour*throughputFactor,area=width*depth;
 const equipmentCost=equipment.reduce((n,e)=>n+e.price,0),connectedPower=equipment.reduce((n,e)=>n+e.power,0),capital=(equipmentCost*(1+d.installation)+area*d.fitout)*(1+d.reserve);
 const payroll=12*(workers*d.wage+d.admin*d.adminWage),energy=connectedPower*d.duty*p.days*p.hours*p.shifts*d.electricity,overhead=12*d.fixedMonthly+energy,fixed=payroll+overhead,depreciation=capital/d.years;
 const rate=d.programme==='atp'?d.outsourceRate:d.rate,revenue=realised*rate,variableCost=realised*d.variable,operating=revenue-variableCost-fixed,profit=operating-depreciation,breakeven=rate>d.variable?(fixed+depreciation)/(rate-d.variable):null,payback=operating>0?capital/operating:null;
 const economicBook=new CalculationBook('station-economics','Економічне порівняння');
 for(const [k,v] of Object.entries({H:realised,rate,variable:d.variable,fixed,capital,years:d.years}))economicBook.input(k,v,k,'','SYN-03');
 economicBook.calc('revenue','H*rate',{H:'H',rate:'rate'},d.programme==='atp'?'Вартість уникнутого аутсорсингу':'Виручка','грн/рік','7.1','SYN-03');
 economicBook.calc('operating','R-H*v-F',{R:'revenue',H:'H',v:'variable',F:'fixed'},'Операційний грошовий результат до податків','грн/рік','7.2','SYN-03');
 economicBook.calc('depreciation','K/y',{K:'capital',y:'years'},'Річна амортизація','грн/рік','7.3','SYN-03');
 economicBook.calc('profit','C-A',{C:'operating',A:'depreciation'},'Результат після амортизації до податків','грн/рік','7.4','SYN-03');
 if(breakeven!==null)economicBook.calc('breakeven','(F+A)/(r-v)',{F:'fixed',A:'depreciation',r:'rate',v:'variable'},'Беззбитковий обсяг','люд.-год/рік','7.5','SYN-03');
 if(payback!==null)economicBook.calc('payback','K/C',{K:'capital',C:'operating'},'Проста окупність','років','7.6','SYN-03');
 return {module:b.evaluate(),economicModule:economicBook.evaluate(),rows,zones,active,annualLabour,visits,fund,workerFund,requiredWorkers,workers,perShift,parking,layout,equipment,warnings:[...new Set(warnings)],economics:{equipmentCost,connectedPower,capital,payroll,energy,overhead,fixed,depreciation,realised,throughputFactor,capacityHours,rate,revenue,variableCost,operating,profit,breakeven,payback,area},sensitivity:[.7,1,1.3].map(f=>{const hours=Math.min(annualLabour*f,capacityHours);return {factor:f,hours,result:hours*(rate-d.variable)-fixed-depreciation};})};
}
