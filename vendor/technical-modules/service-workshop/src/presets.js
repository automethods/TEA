export const PRESET_VERSION='0.2.0'; // Original teaching-data profile, independent of app version.
export const CLASS_IDS=['M1','M2','M3','N1','N2','N3'];
const vehicle=(label,length,width,mass,radius,hours)=>({label,length,width,mass,radius,hours:Object.fromEntries(['maintenance','mechanical','wheel','diagnostic'].map((k,i)=>[k,hours[i]]))});
// SYN-02: editable teaching examples, never category limits or OEM labour norms.
export const VEHICLES={
 M1:vehicle('M1 · легковий, до 8 пасажирських місць',4.5,1.8,2,.30,[2.5,4,2,2.2]),
 M2:vehicle('M2 · автобус, максимальна маса ≤ 5 т',6.5,2.1,4.5,.36,[4,6,3,3.2]),
 M3:vehicle('M3 · автобус, максимальна маса > 5 т',12,2.55,18,.49,[5,8,4,4]),
 N1:vehicle('N1 · вантажний, максимальна маса ≤ 3,5 т',5.5,2.0,3.5,.34,[3,5,2.5,2.6]),
 N2:vehicle('N2 · вантажний, максимальна маса > 3,5–12 т',7.5,2.4,10,.43,[4.5,7,3.5,3.6]),
 N3:vehicle('N3 · вантажний, максимальна маса > 12 т',9,2.55,18,.50,[6,10,4.5,4.5])
};
export const VEHICLE_CHOICES={...Object.fromEntries(CLASS_IDS.map(k=>[k,VEHICLES[k].label])),mixed:'Змішаний потік · редаговані частки'};
const common={days:250,hours:8,shifts:1,bayUtil:.85,attendance:.9,crew:1,plannedBays:4,plannedWorkers:4,parkingSpaces:6,waitBefore:2,waitReady:2,peakFactor:1.3,endClearance:1.5,sideClearance:1,auxArea:50,maxLength:6.5,maxWidth:2.3,maxMass:3.5};
export const WORKSHOPS={
 light:{label:'Універсальна СТО легкових і легких вантажних',planning:{...common},scale:[1,1,1,1],bayShare:[.9,.7,.95,.9]},
 diagnostics:{label:'Діагностика та колісні роботи',planning:{...common,plannedBays:3,plannedWorkers:3,parkingSpaces:4,waitBefore:1,waitReady:1.5,auxArea:30},scale:[.4,.3,1.5,1.8],bayShare:[.9,.7,.95,.95]},
 fleet:{label:'Обслуговування комерційного автопарку',planning:{...common,shifts:2,plannedBays:4,plannedWorkers:6,parkingSpaces:10,maxLength:10,maxWidth:2.6,maxMass:20,auxArea:80},scale:[1.3,1.1,.8,.8],bayShare:[.85,.65,.9,.85]},
 mixed:{label:'СТО змішаного парку / автобусів і вантажних',planning:{...common,shifts:2,plannedBays:5,plannedWorkers:7,parkingSpaces:12,maxLength:12.5,maxWidth:2.6,maxMass:22,auxArea:100},scale:[1,1,.8,1],bayShare:[.85,.6,.9,.85]}
};
export const PLANNING_FIELDS=[
 ['days','Робочих днів за рік','днів',1,366,1],['hours','Тривалість зміни','год',.5,24,.5],['shifts','Змін на добу','',1,3,1],
 ['bayUtil','Частка фонду поста для активних робіт','0–1',.01,1,.01],['attendance','Частка фонду одного працівника','0–1',.01,1,.01],['crew','Працівників одночасно на посту','осіб',1,8,1],
 ['plannedBays','Прийнято робочих постів','постів',1,100,1],['plannedWorkers','Прийнято працівників усього','осіб',1,300,1],['parkingSpaces','Прийнято місць очікування / видачі','місць',0,300,1],
 ['waitBefore','Середнє очікування до роботи поза постом','відкритих год',0,200,.5],['waitReady','Середнє очікування видачі','відкритих год',0,200,.5],['peakFactor','Прийнятий коефіцієнт нерівномірності стоянки','',1,10,.1],
 ['endClearance','Умовний запас спереду й ззаду автомобіля','м',0,10,.1],['sideClearance','Умовний запас з кожного боку','м',0,10,.1],['auxArea','Додаткова площа дільниць і проходів','м²',0,10000,1],
 ['maxLength','Ресурс СТО: максимальна довжина автомобіля','м',.1,30,.1],['maxWidth','Ресурс СТО: максимальна ширина автомобіля','м',.1,5,.05],['maxMass','Ресурс СТО: прийнята допустима маса','т',.1,100,.5]
];
export function classDefaults(){return structuredClone(VEHICLES);}
export function setVehicleChoice(state,id){
 if(!Object.hasOwn(VEHICLE_CHOICES,id))throw new Error('Невідомий набір класів.');
 state.vehiclePreset=id;
 state.vehicleMix=Object.fromEntries(CLASS_IDS.map(k=>[k,id==='mixed'?({M1:50,N1:30,N2:20}[k]??0):Number(k===id)*100]));
}
export function setWorkshopChoice(state,id,data){
 const p=WORKSHOPS[id];if(!p)throw new Error('Невідомий профіль СТО.');
 state.workshopPreset=id;state.planning=structuredClone(p.planning);
 state.bayShare=Object.fromEntries(data.job_types.map((j,i)=>[j.id,p.bayShare[i]]));
 state.months=data.monthly_activity.months.map(m=>({...m,counts:Object.fromEntries(data.job_types.map((j,i)=>[j.id,Math.round(m.counts[j.id]*p.scale[i])]))}));
}
export function addProfileDefaults(state,data){
 state.presetVersion=PRESET_VERSION;state.classData=classDefaults();setVehicleChoice(state,'M1');setWorkshopChoice(state,'light',data);
 state.diagnosticClass='M1';return state;
}
export const mixLabel=s=>CLASS_IDS.filter(k=>s.vehicleMix[k]>0).map(k=>`${k} ${s.vehicleMix[k]}%`).join(' + ')||'Класи не задані';

export const CLASS_DESCRIPTIONS={
 M1:{purpose:'Перевезення пасажирів',seats:'Не більше 8 місць, крім водія; без місць для стояння',mass:'Окремої межі маси для M1 у ст. 4 не задано'},
 M2:{purpose:'Перевезення пасажирів',seats:'Понад 8 місць, крім водія',mass:'Не більше 5 т'},
 M3:{purpose:'Перевезення пасажирів',seats:'Понад 8 місць, крім водія',mass:'Понад 5 т'},
 N1:{purpose:'Перевезення вантажів',seats:'Не визначає категорію N',mass:'Не більше 3,5 т'},
 N2:{purpose:'Перевезення вантажів',seats:'Не визначає категорію N',mass:'Понад 3,5 т, але не більше 12 т'},
 N3:{purpose:'Перевезення вантажів',seats:'Не визначає категорію N',mass:'Понад 12 т'}
};
export function restoreVehicleDefaults(state){state.classData=classDefaults();repairVehicleMix(state);}

export function validVehicleMix(state){return CLASS_IDS.every(k=>Number.isFinite(state.vehicleMix[k])&&state.vehicleMix[k]>=0&&state.vehicleMix[k]<=100)&&Math.abs(CLASS_IDS.reduce((sum,k)=>sum+state.vehicleMix[k],0)-100)<1e-7;}
// Preserve the edited share. Transfer the difference through neighbouring active classes.
export function balanceVehicleMix(state,id,value){
 if(!CLASS_IDS.includes(id)||!Number.isFinite(value)||value<0||value>100)throw new Error('Частка має бути числом від 0 до 100%.');
 const mix=state.vehicleMix,at=CLASS_IDS.indexOf(id),others=Array.from({length:5},(_,i)=>CLASS_IDS[(at+i+1)%6]);
 mix[id]=value;
 for(const k of others)if(!Number.isFinite(mix[k])||mix[k]<0||mix[k]>100)mix[k]=0;
 let excess=CLASS_IDS.reduce((sum,k)=>sum+mix[k],0)-100;
 if(excess>1e-9){for(const k of others){const take=Math.min(mix[k],excess);mix[k]-=take;excess-=take;if(excess<1e-9)break;}}
 else if(excess < -1e-9){const target=others.find(k=>mix[k]>0)??others[0];mix[target]-=excess;}
 for(const k of CLASS_IDS)mix[k]=Number(mix[k].toFixed(8));
 // One correction on a non-edited class removes floating-point accumulation.
 const target=others.find(k=>mix[k]>0)??others[0];mix[target]+=100-CLASS_IDS.reduce((sum,k)=>sum+mix[k],0);
 state.vehiclePreset=CLASS_IDS.find(k=>Math.abs(mix[k]-100)<1e-9)??'mixed';
}
export function repairVehicleMix(state){
 if(validVehicleMix(state))return false;
 const id=CLASS_IDS.find(k=>Number.isFinite(state.vehicleMix[k])&&state.vehicleMix[k]>0&&state.vehicleMix[k]<=100);
 if(id)balanceVehicleMix(state,id,state.vehicleMix[id]);else setVehicleChoice(state,state.vehiclePreset);
 return true;
}
