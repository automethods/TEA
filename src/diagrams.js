import {esc,num} from './format.js';
import {dateText,slotStart} from './calendar.js';
const colors={diagnostic:'#157a82',mechanical:'#3463aa',wheel:'#825da8'};
function svg(w,h,title,body){const arrowId='arrow-'+[...title].reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,7);body=body.replaceAll('url(#arrow)',`url(#${arrowId})`);return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title><defs><marker id="${arrowId}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#607780"/></marker></defs><g font-family="Arial,sans-serif" fill="#18333a">${body}</g></svg>`;}
export function dependencyDiagram(){
 const box=(x,y,w,h,title,sub)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#eff7f6" stroke="#95b8ba"/><text x="${x+w/2}" y="${y+25}" text-anchor="middle" font-size="15" font-weight="600">${title}</text><text x="${x+w/2}" y="${y+46}" text-anchor="middle" font-size="12">${sub}</text>`;
 const line=(x,y,a,b)=>`<path d="M${x} ${y}L${a} ${b}" fill="none" stroke="#607780" stroke-width="1.8" marker-end="url(#arrow)"/>`;
 return svg(870,340,'Шлях розрахунку: дані, ресурси, план, готовність і звіт',[
 box(15,15,245,65,'Замовлення й операції','прибуття · тривалість · попередник'),box(315,15,245,65,'Ресурси та календарі','кваліфікація · пост · оснащення'),box(615,15,240,65,'Деталі та рішення','готовність · припущення · джерела'),
 line(137,80,300,140),line(437,80,437,140),line(735,80,570,140),box(255,140,360,65,'Призначення й перевірки','передування · календар · одночасна зайнятість'),line(437,205,220,270),line(437,205,650,270),box(45,270,350,60,'Навантаження ресурсів','праця ≠ посто-години ≠ очікування'),box(465,270,350,60,'Готовність і строки','завершено всі етапи та контроль')].join(''));
}
export function orderDiagram(schedule,id){
 const o=schedule.orders.find(o=>o.id===id);if(!o)return '';
 const n=o.chain.length,w=870,boxw=Math.min(245,(w-60-(n-1)*38)/n),gap=38;
 const start=(w-n*boxw-(n-1)*gap)/2;
 let body='';o.chain.forEach((r,i)=>{
  const x=start+i*(boxw+gap),fill=r.issues.length?'#fff0ec':'#eef7f6';
  body+=`<rect x="${x}" y="28" width="${boxw}" height="116" rx="10" fill="${fill}" stroke="${r.issues.length?'#b84530':'#83b3b6'}"/><text x="${x+14}" y="52" font-size="16" font-weight="700">${r.id}</text><text x="${x+14}" y="75" font-size="13">${esc(r.staffId)} · ${esc(r.bayId)} · ${num(r.hours)} год</text><text x="${x+14}" y="101" font-size="12">${esc(dateText(r.startTime))}</text><text x="${x+14}" y="122" font-size="12">до ${esc(dateText(r.endTime))}</text>`;
  if(i<n-1)body+=`<path d="M${x+boxw} 85H${x+boxw+gap-5}" stroke="#607780" stroke-width="2" marker-end="url(#arrow)"/>`;
 });
 body+=`<text x="435" y="177" text-anchor="middle" font-size="13">${esc(id)} · обіцяно ${esc(dateText(Date.parse(o.due_local+'Z')))} · ${o.valid?'готовність '+esc(dateText(o.ready)):'план потребує виправлення'}</text>`;
 return svg(w,195,'Послідовність операцій '+id,body);
}
export function timeline(schedule,day=0){
 const names=['B1','B2','B3','B4','M1','M2','W1','D1'];const left=80,width=760,rowh=36;
 let body='';
 for(let hour=8;hour<=17;hour++){const x=left+(hour-8)/9*width;body+=`<line x1="${x}" y1="30" x2="${x}" y2="${30+8*rowh}" stroke="#d7e3e5"/><text x="${x}" y="18" font-size="11" text-anchor="middle">${hour}:00</text>`;}
 body+=`<rect x="${left+4/9*width}" y="29" width="${width/9}" height="${8*rowh}" fill="#e1e6e7" opacity=".8"/>`;
 names.forEach((name,i)=>{
  const y=35+i*rowh;body+=`<text x="15" y="${y+18}" font-size="14" font-weight="600">${name}</text><line x1="${left}" y1="${y+28}" x2="${left+width}" y2="${y+28}" stroke="#e1e9e9"/>`;
  for(const r of schedule.rows.filter(r=>(i<4?r.bayId:r.staffId)===name&&r.end!==null&&r.start<16*(day+1)&&r.end>16*day)){
   const start=Math.max(r.start-day*16,0),end=Math.min(r.end-day*16,16);
   // Separate occupied morning and afternoon blocks; lunch is never coloured as work.
   for(const [a,b] of [[Math.max(start,0),Math.min(end,8)],[Math.max(start,8),Math.min(end,16)]])if(b>a){
    const x=left+(a*.5+(a>=8?1:0))/9*width,bw=(b-a)*.5/9*width;
    body+=`<g><title>${esc(r.id+' '+r.op.name_uk+'; '+dateText(r.startTime)+'–'+dateText(r.endTime)+(r.issues.length?'; '+r.issues.join('; '):''))}</title><rect x="${x}" y="${y}" width="${Math.max(1,bw-1)}" height="25" rx="3" fill="${r.issues.length?'#b84530':colors[r.op.required_skill]}"/>${bw>48?`<text x="${x+bw/2}" y="${y+17}" font-size="10" fill="#fff" text-anchor="middle">${r.id}</text>`:''}</g>`;
   }
  }
 });
 body+=`<text x="80" y="345" font-size="12">${esc(dateText(slotStart(day*16)).split(',')[0])} · зелено-блакитний: діагностика · синій: механіка · фіолетовий: колісні роботи</text><text x="80" y="366" font-size="12">Сіре поле: обід. Червоним позначено призначення з порушеннями.</text>`;
 return svg(870,383,'Розклад постів і працівників, день '+(day+1),body);
}
export function resourceChart(resources){
 const w=870,h=resources.length*38+42;let b='';resources.forEach((r,i)=>{
  const y=12+i*38,ratio=r.demand===null?null:r.capacity?r.demand/r.capacity:0;
  b+=`<text x="10" y="${y+17}" font-size="13">${r.id}</text><rect x="65" y="${y}" width="600" height="24" rx="4" fill="#ecf1f2"/><rect x="65" y="${y}" width="${Math.min(ratio,1.5)*400}" height="24" rx="4" fill="${ratio>1?'#b85a33':'#197d85'}"/><line x1="465" y1="${y-3}" x2="465" y2="${y+27}" stroke="#374c54" stroke-dasharray="3 2"/><text x="680" y="${y+17}" font-size="13">${num(r.demand)} / ${num(r.capacity)} год · ${num(ratio===null?null:ratio*100,1)}%</text>`;
 });b+=`<text x="65" y="${h-5}" font-size="12">Попит / доступний фонд. Штрихова риска — 100%. Це не перевірка здійсненності розкладу.</text>`;return svg(w,h,'Навантаження ресурсів',b);
}
export function monthlyChart(months){
 const max=Math.max(1,...months.map(m=>m.hours));let b='';months.forEach((m,i)=>{const x=45+i*66,h=m.hours/max*170;b+=`<rect x="${x}" y="${210-h}" width="40" height="${h}" rx="3" fill="#197d85"/><text x="${x+20}" y="${200-h}" font-size="11" text-anchor="middle">${num(m.hours,0)}</text><text x="${x+20}" y="232" font-size="12" text-anchor="middle">${i+1}</text>`;});return svg(870,255,'Місячна трудомісткість, людино-години',b);
}

export function planningDiagram(s,m){
 const p=m.planning;if(p.error)return svg(870,150,'Неповні входи',`<text x="25" y="60" font-size="18">${esc(p.error)}</text>`);
 const mix=Object.entries(s.vehicleMix).filter(([,v])=>v>0).map(([k,v])=>k+' '+num(v)+'%').join(' · ');
 const box=(x,y,w,h,title,sub,tail='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#edf7f6" stroke="#95b8ba"/><text x="${x+w/2}" y="${y+26}" text-anchor="middle" font-size="16" font-weight="700">${esc(title)}</text><text x="${x+w/2}" y="${y+51}" text-anchor="middle" font-size="12">${esc(sub)}</text><text x="${x+w/2}" y="${y+72}" text-anchor="middle" font-size="12">${esc(tail)}</text>`;
 const line=(x,y,a,b)=>`<path d="M${x} ${y}L${a} ${b}" stroke="#607780" stroke-width="2" marker-end="url(#arrow)"/>`;
 return svg(870,345,'Потік, річна праця, пости, працівники і стоянка',box(15,15,400,85,'Класи та робочі значення',mix,'t = Σ p · tк / 100  (3.1)')+box(455,15,400,85,'Річна програма',num(m.annual.count)+' замовлень · '+num(m.annual.hours,1)+' люд.-год','H = Σ N · t  (7.2–7.3)')+line(415,57,450,57)+line(655,100,145,165)+line(655,100,435,165)+line(655,100,725,165)+box(15,170,260,100,'Робочі пости',num(p.bayHours,1)+' посто-год / '+num(p.bayFund)+' год','Потрібно '+p.requiredBays+' · прийнято '+s.planning.plannedBays)+box(305,170,260,100,'Працівники',num(m.annual.hours,1)+' люд.-год / '+num(p.workerFund)+' год','Потрібно '+p.requiredWorkers+' · прийнято '+s.planning.plannedWorkers)+box(595,170,260,100,'Стоянка поза постом','k · λ · (wдо + wвидачі)  (3.12)','Потрібно '+p.requiredParking+' · прийнято '+s.planning.parkingSpaces)+`<text x="435" y="313" text-anchor="middle" font-size="13">Результати округлюються вгору. Склад потоку має давати 100%.</text>`);
}
export function capacityDiagram(s,m){
 const p=m.planning;if(p.error)return '';
 const items=[['Пости',p.requiredBays,s.planning.plannedBays],['Працівники',p.requiredWorkers,s.planning.plannedWorkers],['Стоянка',p.requiredParking,s.planning.parkingSpaces]];const max=Math.max(1,...items.flatMap(r=>r.slice(1)));let body='';
 items.forEach(([label,need,have],i)=>{const y=30+i*80;body+=`<text x="12" y="${y+18}" font-size="15">${label}</text><rect x="145" y="${y}" width="${need/max*540}" height="24" rx="4" fill="#157a82"/><rect x="145" y="${y+28}" width="${have/max*540}" height="16" rx="3" fill="#a7c9cc"/><text x="710" y="${y+18}" font-size="14">потрібно ${need}</text><text x="710" y="${y+42}" font-size="13">прийнято ${have}</text>`;});
 body+=`<text x="145" y="285" font-size="12">Темний — розрахункова потреба; світлий — прийняті ресурси.</text>`;return svg(870,310,'Потреба та прийнята кількість ресурсів',body);
}
