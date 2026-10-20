import {CalculationBook} from './calculations.js';
import {slotStart,slotEnd,staffAvailable,overlap} from './calendar.js';

export function evaluateSchedule(data,state) {
 const scenario=data.reference_schedules[state.scenario==='manual'?'improved':state.scenario];
 const assignments=state.scenario==='manual'?state.assignments:scenario.assignments;
 const amap=new Map(assignments.map(a=>[a.operation_id,a]));
 const orders=new Map(data.orders.map(x=>[x.id,x]));
 const staff=new Map(data.resources.staff.map(x=>[x.id,x]));
 const equipment=new Map(data.resources.equipment.map(x=>[x.id,x]));
 const modules=[],rows=[];
 for(let i=0;i<data.operations.length;i+=10) {
  const b=new CalculationBook(`schedule.${i}`, 'Трудомісткість і межі операцій');
  b.input('slotHours',.5,'Тривалість інтервалу','год');
  for(const op of data.operations.slice(i,i+10)) {
   const a=amap.get(op.id)??{},edit=state.operationEdits?.[op.id]??{};
   const duration=Object.hasOwn(edit,'duration')?edit.duration:op.duration_slots,start=a.start_slot;
   const p=op.id.replaceAll('-','_');
   const validStart=Number.isInteger(start)&&start>=0&&start<128;
   const validDuration=Number.isInteger(duration)&&duration>0&&duration<=8;
   const r={id:op.id,orderId:op.order_id,op,start,duration,staffId:a.staff_id,bayId:a.bay_id,issues:[],prefix:p};
   if(!validStart)r.issues.push('Не задано коректний початок (0–127)');
   if(!validDuration)r.issues.push('Тривалість має бути 0,5–4 год із кроком 0,5 год');
   if(validDuration){b.input(`${p}.duration`,duration,op.name_uk,'30-хв інтервал');b.calc(`${p}.hours`,'d * h',{d:`${p}.duration`,h:'slotHours'},'Активна праця / зайнятість поста','год','4.1');}
   if(validStart&&validDuration){b.input(`${p}.start`,start,'Початок','30-хв інтервал');b.calc(`${p}.end`,'s + d',{s:`${p}.start`,d:`${p}.duration`},'Кінець операції','30-хв інтервал','4.3');}
   rows.push(r);
  }
  const m=b.evaluate();modules.push(m);
  for(const r of rows.slice(i)){r.hours=m.values[`${r.prefix}.hours`]??null;r.end=m.values[`${r.prefix}.end`]??null;}
 }
 const rmap=new Map(rows.map(r=>[r.id,r]));
 const calendar=state.scenario==='baseline'?'baseline':'improved';
 for(const r of rows){
  const worker=staff.get(r.staffId),order=orders.get(r.orderId);
  if(!worker)r.issues.push('Працівника не вибрано');
  else if(!worker.skills.includes(r.op.required_skill))r.issues.push('Немає потрібної кваліфікації');
  if(!r.op.allowed_bay_ids.includes(r.bayId))r.issues.push('Пост несумісний з операцією');
  const parts=state.scenario==='manual'&&r.id==='O29-01'?state.partsReady:scenario.parts_ready_overrides?.[r.id]??r.op.parts_ready_slot;
  if(state.scenario==='manual'&&r.id==='O29-01'&&(!Number.isInteger(parts)||parts<0||parts>128))r.issues.push('Не задано коректну готовність деталей (0–128)');
  r.release=Math.max(r.op.release_slot,order.arrival_slot,parts??0);
  if(r.end!==null){
   if(r.end>128)r.issues.push('За межами горизонту 8 робочих днів');
   if(Math.floor(r.start/8)!==Math.floor((r.end-1)/8))r.issues.push('Операція перетинає перерву');
   if(r.start<r.release)r.issues.push('Раніше прибуття або готовності деталей');
   const pred=rmap.get(r.op.predecessor_id);
   if(pred&&(pred.end===null||r.start<pred.end))r.issues.push('Попередній етап не завершено');
   if(worker&&Array.from({length:r.duration},(_,j)=>r.start+j).some(t=>!staffAvailable(worker,t,calendar)))r.issues.push('Працівник поза календарем');
   r.startTime=slotStart(r.start,data.metadata.week_start_local);r.endTime=slotEnd(r.end,data.metadata.week_start_local);
  }
 }
 for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
  const a=rows[i],b=rows[j];if(a.end===null||b.end===null||!overlap(a,b))continue;
  const reasons=[];
  if(a.staffId&&a.staffId===b.staffId)reasons.push(`Накладка працівника ${a.staffId}`);
  if(a.bayId&&a.bayId===b.bayId)reasons.push(`Накладка поста ${a.bayId}`);
  if(a.orderId===b.orderId)reasons.push('Одночасні етапи одного автомобіля');
  for(const reason of reasons){a.issues.push(`${reason}: ${b.id}`);b.issues.push(`${reason}: ${a.id}`);}
 }
 // Equipment capacities may be greater than one; compare simultaneous active sets.
 for(const [id,eq] of equipment){
  const cap=eq.quantity??eq.capacity??1;
  for(let t=0;t<128;t++){
   const active=rows.filter(r=>r.end!==null&&r.start<=t&&t<r.end&&r.op.equipment_ids.includes(id));
   if(active.length>cap)for(const r of active)r.issues.push(`Перевищено місткість обладнання ${id}`);
  }
 }
 for(const r of rows)r.issues=[...new Set(r.issues)];
 const orderResults=data.orders.map(o=>{
  const chain=rows.filter(r=>r.orderId===o.id),valid=chain.every(r=>r.issues.length===0&&r.endTime!==null);
  const endSlot=valid?Math.max(...chain.map(r=>r.end)):null,ready=valid?slotEnd(endSlot,data.metadata.week_start_local):null;
  return {...o,chain,valid,endSlot,ready,onTime:valid&&ready<=Date.parse(o.due_local+'Z'),withinWeek:valid&&endSlot<=80,elapsed:valid?(ready-slotStart(o.arrival_slot,data.metadata.week_start_local))/3600000:null};
 });
 const resources=[...data.resources.staff.map(x=>({...x,type:'staff',capacity:Array.from({length:80},(_,i)=>staffAvailable(x,i,calendar)?0.5:0).reduce((a,b)=>a+b,0)})),...data.resources.bays.map(x=>({...x,type:'bay',capacity:40}))].map(x=>{
  const assigned=rows.filter(r=>(x.type==='staff'?r.staffId:r.bayId)===x.id);
  return {...x,demand:assigned.every(r=>r.hours!==null)?assigned.reduce((n,r)=>n+r.hours,0):null,used:assigned.every(r=>r.end!==null)?assigned.reduce((n,r)=>n+Math.max(0,Math.min(r.end,80)-Math.max(r.start,0))*.5,0):null};
 });
 const total=rows.every(r=>r.hours!==null)?rows.reduce((n,r)=>n+r.hours,0):null;
 const valid=rows.every(r=>r.issues.length===0);
 const summary={total,valid,issueRows:rows.filter(r=>r.issues.length).length,orders:orderResults.length,operations:rows.length,onTime:orderResults.filter(o=>o.onTime).length,withinWeek:orderResults.filter(o=>o.withinWeek).length,delivered:rows.every(r=>r.end!==null)?rows.reduce((n,r)=>n+Math.max(0,Math.min(r.end,80)-Math.max(r.start,0))*.5,0):null,meanElapsed:valid?orderResults.reduce((n,o)=>n+o.elapsed,0)/orderResults.length:null};
 return {rows,orders:orderResults,resources,summary,modules};
}
