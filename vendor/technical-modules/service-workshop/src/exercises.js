import {CalculationBook,scalar} from './calculations.js';
import {slotStart,slotEnd,wallTime,overlap} from './calendar.js';

export function evaluateAbs(d,a) {
 if(![a.radius,a.z,a.limit,a.dr,a.df,a.frequency].every(Number.isFinite)||a.radius<=0||!Number.isInteger(a.z)||a.z<=0||a.limit<0||a.dr<0||a.dr>=a.radius||a.df<0||a.frequency<=a.df)throw new Error('ABS: потрібні r > Δr ≥ 0, ціле z > 0, f > Δf ≥ 0 та поріг ≥ 0.');
 const b=new CalculationBook('abs','Сигнал швидкості колеса');
 for(const [id,val] of Object.entries({r:a.radius,z:a.z,limit:a.limit,dr:a.dr,df:a.df,f:a.frequency}))b.input(id,val,id,'','ABS-CASE');
 b.input('pi',Math.PI,'Число π','','CONSTANT');
 b.calc('circumference','2 * pi * r',{r:'r',pi:'pi'},'Шлях за оберт','м','6.1','S01');
 b.calc('coefficient','3.6 * c / z',{c:'circumference',z:'z'},'Коефіцієнт перетворення','км/год на Гц','6.2','S01');
 b.calc('nominal','k * f',{k:'coefficient',f:'f'},'Номінальна швидкість','км/год','6.3','S01');
 b.calc('minimum','3.6 * 2 * pi * (r - dr) * (f - df) / z',{r:'r',dr:'dr',f:'f',df:'df',z:'z',pi:'pi'},'Нижня межа','км/год','6.4','B01');
 b.calc('maximum','3.6 * 2 * pi * (r + dr) * (f + df) / z',{r:'r',dr:'dr',f:'f',df:'df',z:'z',pi:'pi'},'Верхня межа','км/год','6.5','B01');
 const rows=d.data.trace.map(t=>({...t,FR_Hz:Object.hasOwn(a.frequencies??{},t.sample)?a.frequencies[t.sample]:t.FR_Hz}));
 for(const t of rows){
  const p='t'+t.sample;
  for(const [k,v] of Object.entries({fl:t.FL_Hz,rl:t.RL_Hz,rr:t.RR_Hz,after:t.FR_after_Hz}))b.input(`${p}.${k}`,v);
  b.calc(`${p}.ref`,'a+b+c-min(a,b,c)-max(a,b,c)',{a:`${p}.fl`,b:`${p}.rl`,c:`${p}.rr`},'Медіана трьох опорних частот','Гц','6.6','ABS-CASE');
  b.calc(`${p}.afterDelta`,'100 * (f - ref) / ref',{f:`${p}.after`,ref:`${p}.ref`},'Після ремонту: відхилення','%','6.7','ABS-CASE');
  if(t.FR_Hz!==null){
   if(!Number.isFinite(t.FR_Hz)||t.FR_Hz<0)throw new Error('Частота FR має бути невід’ємним числом або пропуском.');
   b.input(`${p}.fr`,t.FR_Hz);
   b.calc(`${p}.speed`,'k * f',{k:'coefficient',f:`${p}.fr`},'Розрахункова швидкість FR','км/год','6.3','ABS-CASE');
   b.calc(`${p}.delta`,'100 * (f - ref) / ref',{f:`${p}.fr`,ref:`${p}.ref`},'Відхилення FR','%','6.7','ABS-CASE');
  }
 }
 const module=b.evaluate(),v=module.values;
 for(const r of rows){const p='t'+r.sample;r.ref=v[`${p}.ref`];r.speed=v[`${p}.speed`]??null;r.delta=v[`${p}.delta`]??null;r.afterDelta=v[`${p}.afterDelta`];r.status=r.FR_Hz===null?'Немає даних':Math.abs(r.delta)>a.limit?'Розбіжність':'Узгоджено';}
 return {module,...v,rows,bad:rows.filter(r=>r.status!=='Узгоджено').length,afterBad:rows.filter(r=>Math.abs(r.afterDelta)>a.limit).length};
}

export function evaluateHold(schedule) {
 const repair=schedule.rows.find(r=>r.id==='O01-02'),control=schedule.rows.find(r=>r.id==='O01-03');
 if(repair.end===null||control.end===null||control.start<repair.end||!repair.endTime||!control.startTime)return {valid:false,conflicts:[]};
 const start=repair.end,end=control.start;
 const module=scalar('hold','Очікування O01 на посту',{start,end,startClock:repair.endTime/3600000,endClock:control.startTime/3600000},[
 ['bayHours','(b-a)*0.5',{a:'start',b:'end'},'Додаткова зайнятість поста','посто-год','5.1','B02, B03'],
 ['calendarHours','b-a',{a:'startClock',b:'endClock'},'Календарне очікування','год','5.2','B02, B03']]);
 const conflicts=schedule.rows.filter(r=>r.orderId!=='O01'&&r.bayId===repair.bayId&&r.end!==null&&overlap({start,end},r));
 return {valid:true,start,end,bayId:repair.bayId,module,...module.values,conflicts};
}

export function evaluateAdas(a) {
 const start=wallTime(a.start),due=wallTime(a.due),available=wallTime(a.available);
 if([start,due,available].some(x=>x===null)||![a.alignment,a.procedure,a.wait].every(x=>Number.isFinite(x)&&x>=0))throw new Error('ADAS: перевірте дати та невід’ємні тривалості.');
 const module=scalar('adas','Геометрія коліс і ADAS',{s:start/3600000,d:due/3600000,a:available/3600000,t:a.alignment,p:a.procedure,w:a.wait},[
 ['alignmentEnd','s+t',{s:'s',t:'t'},'Кінець геометрії','год','8.1','ADAS-CASE'],
 ['ownStart','max(e,a)',{e:'alignmentEnd',a:'a'},'Початок власної процедури','год','8.2','ADAS-CASE'],
 ['ownEnd','s+p',{s:'ownStart',p:'p'},'Готовність власними силами','год','8.3','ADAS-CASE'],
 ['outsideEnd','e+w+p',{e:'alignmentEnd',w:'w',p:'p'},'Готовність через аутсорсинг','год','8.4','ADAS-CASE']]);
 const feasible=a.oem&&a.equipment&&a.access&&a.trained;
 const valid=!a.required||a.mode==='outside'||feasible;
 const ready=valid?module.values[!a.required?'alignmentEnd':a.mode==='own'?'ownEnd':'outsideEnd']*3600000:null;
 return {module,feasible,valid,ready,due,late:valid?Math.max(0,(ready-due)/3600000):null,alignmentEnd:module.values.alignmentEnd*3600000};
}

export function evaluateAnnual(data,state,fleet) {
 const b=new CalculationBook('annual','Річна програма');
 for(const j of data.job_types){const h=fleet?fleet.hours[j.id]:state.annualHours[j.id];if(!Number.isFinite(h)||h<0)throw new Error('Річна програма: трудомісткість має бути невід’ємною.');b.input(j.id+'.h',h,'Середня трудомісткість '+j.name_uk,'люд.-год/замовлення');}
 const months=state.months.map((m,i)=>{
  const refs={},terms=[];
  for(const j of data.job_types){const n=m.counts[j.id];if(!Number.isInteger(n)||n<0)throw new Error('Річна програма: кількість замовлень має бути цілою та невід’ємною.');const id=`m${i+1}.${j.id}`;b.input(id,n,'Кількість '+j.name_uk,'замовлень');refs[j.id]=id;refs[j.id+'H']=j.id+'.h';terms.push(`${j.id} * ${j.id}H`);}
  b.calc(`m${i+1}.hours`,terms.join(' + '),refs,'Місячна трудомісткість','люд.-год','7.1','CASE');
  return {...m,count:Object.values(m.counts).reduce((a,b)=>a+b,0)};
 });
 b.calc('annualHours',months.map((_,i)=>'m'+i).join(' + '),Object.fromEntries(months.map((_,i)=>['m'+i,`m${i+1}.hours`])),'Річна трудомісткість','люд.-год','7.2','CASE');
 const counts=Object.fromEntries(data.job_types.map(j=>[j.id,months.reduce((n,m)=>n+m.counts[j.id],0)]));
 for(const j of data.job_types){b.input(j.id+'.annualCount',counts[j.id]);b.calc(j.id+'.annualHours','n * h',{n:j.id+'.annualCount',h:j.id+'.h'},'Річна праця '+j.name_uk,'люд.-год','7.3','CASE + SYN-02');}
 const module=b.evaluate();months.forEach((m,i)=>m.hours=module.values[`m${i+1}.hours`]);
 return {module,months,hours:module.values.annualHours,count:months.reduce((n,m)=>n+m.count,0),byJob:Object.fromEntries(data.job_types.map(j=>[j.id,module.values[j.id+'.annualHours']])),weightedHours:Object.fromEntries(data.job_types.map(j=>[j.id,fleet?fleet.hours[j.id]:state.annualHours[j.id]]))};
}

export function evaluatePilot(records,parking=[]) {
 const errors=[];
 const rows=records.map(r=>{
  if(!r.id)return null;
  const parse=s=>s?wallTime(s):null;
  const row={...r,arrivalMs:parse(r.arrival),startMs:parse(r.start),dueMs:parse(r.due),readyMs:parse(r.ready),issuedMs:parse(r.issued)};
  if(r.accepted){
   for(const key of ['labour','bay','wait'])if(r[key]!==null&&(!Number.isFinite(r[key])||r[key]<0))errors.push(`${r.id}: некоректне значення ${key}`);
   const times=[row.arrivalMs,row.startMs,row.readyMs,row.issuedMs].filter(x=>x!==null);
   if(times.some((t,i)=>i&&t<times[i-1]))errors.push(`${r.id}: порушено порядок подій`);
  }
  row.elapsed=row.arrivalMs!==null&&row.readyMs!==null?(row.readyMs-row.arrivalMs)/3600000:null;
  row.onTime=row.readyMs!==null&&row.dueMs!==null?row.readyMs<=row.dueMs:null;
  row.parking=row.issuedMs!==null&&row.readyMs!==null?(row.issuedMs-row.readyMs)/3600000:null;
  return row;
 }).filter(Boolean);
 if(new Set(rows.map(x=>x.id)).size!==rows.length)errors.push('Коди звернень мають бути унікальними.');
 const accepted=rows.filter(r=>r.accepted),sum=k=>accepted.every(r=>Number.isFinite(r[k])&&r[k]>=0)?accepted.reduce((n,r)=>n+r[k],0):null;
 // Explicit physical-location log, as in TEA 1.2. Do not infer it from labour.
 const events=[];
 const intervals=parking.map(p=>({...p,startMs:wallTime(p.start),endMs:wallTime(p.end)}));
 for(const p of intervals){
  if(p.startMs===null||p.endMs===null||p.endMs<p.startMs||!rows.some(r=>r.id===p.orderId))errors.push('Журнал стоянки: перевірте код і межі інтервалу.');
  else if(p.endMs>p.startMs)events.push([p.startMs,1],[p.endMs,-1]);
 }
 for(let i=0;i<intervals.length;i++)for(let j=i+1;j<intervals.length;j++)if(intervals[i].orderId===intervals[j].orderId&&overlap({start:intervals[i].startMs,end:intervals[i].endMs},{start:intervals[j].startMs,end:intervals[j].endMs}))errors.push('Журнал стоянки: подвійний облік автомобіля '+intervals[i].orderId);
 events.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);let current=0,peak=0;for(const [,n] of events){current+=n;peak=Math.max(peak,current);}
 return {rows,errors,total:rows.length,accepted:accepted.length,rejected:rows.length-accepted.length,labour:sum('labour'),bay:sum('bay'),wait:sum('wait'),onTime:accepted.filter(r=>r.onTime).length,knownDeadlines:accepted.filter(r=>r.onTime!==null).length,peak:errors.length?null:peak};
}
