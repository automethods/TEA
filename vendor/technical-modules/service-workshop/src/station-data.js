import {PLAN_DEFAULTS} from './station-plan.js';
// Manufacturer facts and explicit project assumptions are deliberately separated.
export const VEHICLE_MODELS={
 M1:{name:'Toyota Corolla 1.8 Hybrid Hatchback',length:4.37,width:1.79,height:1.435,mass:1.82,axle:1.1,source:'S18',basis:'Габарити та повна маса — каталог Toyota; навантаження осі 1,1 т — прийняте для ескізу.'},
 M2:{name:'Mercedes-Benz Sprinter Transfer 45, 5,0 т',length:7.367,width:2.02,height:2.86,mass:5,axle:3.5,source:'S19',basis:'Варіант 2019: 18+1 місць, 7 367 × 2 020 × 2 860 мм, 5,0 т. Навантаження осі — припущення.'},
 M3:{name:'MAN Lion’s City 12 E LE',length:12.2,width:2.55,height:3.32,mass:20,axle:13,source:'S20',basis:'Габарити — технічний лист MAN. Проєктна маса 20 т та вісь 13 т — припущення: уточніть за паспортом комплектації.'},
 N1:{name:'Ford Transit 350 L2 H2 FWD, 3,5 т',length:5.531,width:2.059,height:2.542,mass:3.5,axle:2.15,source:'S21',basis:'Габарити EcoBlue L2/H2; вибрано виконання 3,5 т. Ширина без дзеркал; вісь 2,15 т — проєктне припущення.'},
 N2:{name:'Isuzu N75.190, розрахунковий кузов',length:6.7,width:2.5,height:3.5,mass:7.5,axle:5.6,source:'S22',basis:'Каталог підтверджує шасі 7,5 т. Габарит завершеного автомобіля та навантаження осі — прийнятий проєктний конверт, не паспорт кузова.'},
 N3:{name:'Isuzu F135.240, розрахунковий кузов',length:8.5,width:2.55,height:3.8,mass:13.5,axle:9.5,source:'S22',basis:'Каталог підтверджує шасі 13,5 т. Габарит завершеного автомобіля та навантаження осі — прийнятий проєктний конверт, не паспорт кузова.'}
};
export const ZONES={general:'ТО та механічний ремонт',diagnostic:'Діагностування',wheel:'Шинні роботи'};
export const EQUIPMENT={
 lift65:{name:'MAHA MA STAR 6.5',kind:'lift',capacity:6.5,w:4.192,l:2,power:8,price:420000,source:'S23',basis:'6,5 т; ширина 4,192 м; 400 В; 8 кВт. Глибина символу 2 м — ескіз. Перевіряють точки підхоплення та основу.'},
 mobile30:{name:'MAHA C_RGA 7.5 UC, комплект 4 колон',kind:'columns',capacity:30,maxAxle:15,w:1.15,l:1.4,power:6,price:1450000,source:'S24',basis:'7,5 т на колону, 4 колони; 1,5 кВт/колону. Ширина шасі 1,15 м; довжина символу 1,4 м — ескіз. Перевіряють кожне колесо.'},
 diagnostic:{name:'Діагностичний візок: сканер, мультиметр',kind:'cart',capacity:0,w:.8,l:.6,power:.5,price:100000,source:'S15',basis:'Склад за напрямом діагностування; габарит, потужність і бюджет — проєктні припущення.'},
 tyreLight:{name:'Шиномонтажний комплект для легких ТЗ',kind:'tyre',capacity:0,w:3.6,l:2.5,power:3,price:230000,source:'S12',basis:'Два верстати: демонтаж/монтаж і балансування. Зона, електропотужність, бюджет та місцеве виконання — проєктні припущення; перевірити колеса.'},
 tyreHeavy:{name:'Шиномонтажний комплект для вантажних ТЗ',kind:'tyre',capacity:0,w:4.8,l:3,power:7.5,price:650000,source:'S17',basis:'Проєктна специфікація для закупівлі: вантажний верстат, балансування, пристрій підіймання коліс. Не паспорт конкретного виробу.'},
 bench:{name:'Верстак з інструментальною шафою',kind:'bench',capacity:0,w:2,l:.75,power:0,price:40000,source:'S17',basis:'Проєктне оснащення, 2 × 0,75 м; вартість — навчальний бюджет.'},
 compressor:{name:'Компресорна установка',kind:'utility',capacity:0,w:1.5,l:1,power:7.5,price:160000,source:'S17',basis:'Проєктне місце 1,5 × 1 м; 7,5 кВт — припущення. Продуктивність визначити за споживачами та режимом роботи.'},
 extraction:{name:'Місцеве відведення вихлопних газів',kind:'utility',capacity:0,w:.5,l:.5,power:.75,price:60000,source:'S17',basis:'Один комплект на пост; потужність і ціна — бюджетні припущення. Аеродинамічний розрахунок окремий.'}
};
export const EQUIPMENT_IDS=Object.keys(EQUIPMENT);
export function stationDefaults(){
 return {...PLAN_DEFAULTS,workspace:'design',mode:'new',programme:'sto',vehicles:structuredClone(VEHICLE_MODELS),
 fleet:Object.fromEntries(Object.keys(VEHICLE_MODELS).map((k,i)=>[k,{count:i===0?100:0,dailyKm:180,days:250,availability:.9,interval1:15000,interval2:30000,t1:[2.5,4,5,3,4.5,6][i],t2:[5,8,10,6,9,12][i],repair:[1,2,3,1.5,2.5,3.5][i],diagnostic:.08,wheel:.12}])),
 peak:1.15,crew:1,side:1.2,end:1.5,walkway:1.2,apron:6,auxDepth:4,columns:4,selectedBay:0,layoutStyle:'double',
 wage:30000,admin:1,adminWage:26000,fixedMonthly:60000,rate:1100,variable:150,electricity:8,duty:.3,fitout:3000,installation:.12,reserve:.1,years:10,outsourceRate:1200,demandFactor:1,
 existingWorkers:4,existingWidth:24,existingDepth:18,existingHeight:5.5,
 existing:Object.fromEntries(['light','heavy'].flatMap(g=>Object.keys(ZONES).map(z=>[g+'_'+z,g==='light'?2:1]))),
 prices:Object.fromEntries(EQUIPMENT_IDS.map(id=>[id,EQUIPMENT[id].price])),choices:{light:'lift65',heavy:'mobile30'},bayOverrides:{},equipmentOverrides:{},notes:''};
}
export const STATION_NUMBERS={
 throughLength:[6,20],minPostWidth:[6,100],wall:[.12,.6],partition:[.08,.3],gateWidth:[2.5,8],gateHeight:[2.5,8],doorWidth:[.8,1.5],windowWidth:[.8,3],windowHeight:[.6,3],windowSill:[.8,2.5],windowPitch:[3,12],
 peak:[1,3],crew:[1,6],side:[.6,4],end:[.5,5],walkway:[.8,3],apron:[3,30],auxDepth:[3,12],columns:[1,12],
 wage:[0,500000],admin:[0,30],adminWage:[0,500000],fixedMonthly:[0,10000000],rate:[0,100000],variable:[0,100000],electricity:[0,100],duty:[0,1],fitout:[0,100000],installation:[0,1],reserve:[0,1],years:[1,50],outsourceRate:[0,100000],demandFactor:[0,3],existingWorkers:[0,200],existingWidth:[5,500],existingDepth:[5,500],existingHeight:[2,15]
};
export function ensureStation(s){if(!s.design)s.design=stationDefaults();if(s.design&&s.design.layoutMode===undefined&&Object.keys(s.design.bayOverrides??{}).length)s.design.layoutMode='manual';if(typeof s.design==='object'&&!Array.isArray(s.design))for(const [k,v] of Object.entries(PLAN_DEFAULTS))if(s.design[k]===undefined)s.design[k]=v;return s;}
export function validateStation(s){
 ensureStation(s);const d=s.design;d.equipmentOverrides??={};
 if(!['design','exercises'].includes(d.workspace)||!['new','existing'].includes(d.mode)||!['sto','atp'].includes(d.programme)||!['row','double'].includes(d.layoutStyle)||!['auto','manual'].includes(d.layoutMode)||!['auto','reverse','mixed','through'].includes(d.postAccess))throw Error('Невідомий режим проєктування.');
 for(const [k,[min,max]] of Object.entries(STATION_NUMBERS))if(!Number.isFinite(d[k])||d[k]<min||d[k]>max)throw Error('Параметр проєкту '+k+': діапазон '+min+'–'+max+'.');
 for(const k of ['crew','admin','columns','existingWorkers','selectedBay'])if(!Number.isInteger(d[k])||d[k]<0)throw Error('Потрібне ціле число: '+k);
 for(const k of Object.keys(VEHICLE_MODELS)){
  const v=d.vehicles?.[k],f=d.fleet?.[k];if(!v||typeof v.name!=='string'||v.name.length>300)throw Error('Невірний автомобіль '+k);
  for(const x of ['length','width','height','mass','axle'])if(!Number.isFinite(v[x])||v[x]<=0||v[x]>100)throw Error(k+': перевірте '+x);
  if(v.axle>v.mass)throw Error(k+': навантаження осі не може перевищувати повну масу.');
  if(!f||!Number.isInteger(f.count)||f.count<0||f.count>10000)throw Error(k+': перевірте кількість автомобілів.');
  for(const x of ['dailyKm','days','availability','interval1','interval2','t1','t2','repair','diagnostic','wheel'])if(!Number.isFinite(f[x])||f[x]<0)throw Error(k+': перевірте нормативи АТП.');
  if(f.interval1<=0||f.interval2<f.interval1||Math.abs(f.interval2/f.interval1-Math.round(f.interval2/f.interval1))>1e-8||f.availability>1||f.days>366||f.diagnostic+f.wheel>1)throw Error(k+': перевірте періодичність і частки робіт.');
 }
 for(const id of EQUIPMENT_IDS)if(!Number.isFinite(d.prices?.[id])||d.prices[id]<0)throw Error('Перевірте ціну обладнання '+id);
 for(const key of Object.keys(stationDefaults().existing))if(!Number.isInteger(d.existing?.[key])||d.existing[key]<0||d.existing[key]>40)throw Error('Перевірте кількість постів '+key);
 for(const group of ['light','heavy'])if(!['lift65','mobile30'].includes(d.choices?.[group]))throw Error('Невідомий підйомник.');
 if(!d.bayOverrides||typeof d.bayOverrides!=='object'||Array.isArray(d.bayOverrides)||typeof d.notes!=='string'||d.notes.length>12000)throw Error('Невірна структура плану.');
 for(const v of Object.values(d.bayOverrides))if(!v||!['x','y','rotation'].every(k=>Number.isFinite(v[k]))||v.x<0||v.y<0||![0,90].includes(v.rotation))throw Error('Невірні координати поста.');
 if(typeof d.equipmentOverrides!=='object'||Array.isArray(d.equipmentOverrides))throw Error('Невірне розміщення обладнання.');
 for(const v of Object.values(d.equipmentOverrides))if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y)||v.x<0||v.y<0)throw Error('Перевірте координати обладнання.');
 return s;
}
