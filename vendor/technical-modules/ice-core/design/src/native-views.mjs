import {evaluateNative2} from '../../vendor/text-work-20260924/runtime.mjs';
import {sha256Text} from '../../vendor/engdoc/runtime.js';
export function appendNativeViews(doc,datasets){
 const table=(id,title,columns,rows)=>{
  if(!rows.length)return;
  const node={id,kind:'table',title,columns:columns.map(([key,label,unit])=>({id:'column.'+key,label,valueType:unit?'quantity':'float64',...(unit?{canonicalUnit:unit}:{})})),rows:[]};
  for(let i=0;i<rows.length;i++){const row={id:id+'.row'+i,cells:[]};for(let j=0;j<columns.length;j++){const [key,label,unit]=columns[j],value=rows[i][key];
   if(!Number.isFinite(value))throw Error('Не можна видати пропуск native-таблиці за нуль.');const valueId=id+'.r'+i+'.c'+j;
   row.cells.push({kind:'valueRef',valueId});doc.values.push({id:valueId,ownerNodeId:id,role:'input',label:label+' / '+i,symbol:key+'_'+i,constant:true,value:unit?{kind:'quantity',value,canonicalUnit:unit}:{kind:'float64',value}});
  }node.rows.push(row);}
  const csv=columns.map(c=>c[0]).join(',')+'\n'+rows.map(r=>columns.map(c=>r[c[0]]).join(',')).join('\n')+'\n';
  node.source={name:id+'.csv',sha256:'sha256:'+sha256Text(csv),delimiter:',',header:true,decimalSeparator:'.'};doc.nodes.push(node);return node;
 };
 const speed=datasets['dataset.ice-speed'];
 if(speed?.length){table('table.engine-speed','Повна поточна швидкісна серія — модель, не стенд', [['rpm','n, хв⁻¹','min^-1'],['Pe','Pₑ, Вт','W'],['meanTorque','Mₑ, Н·м','N*m'],['fuelFlow','ṁf, кг/с','kg/s']],speed);
  doc.nodes.push({id:'chart.engine-power',kind:'chart',title:'Модельна потужність',tableId:'table.engine-speed',xColumnId:'column.rpm',yColumnIds:['column.Pe'],chartType:'line',xLabel:'n, хв⁻¹',yLabel:'Pₑ, Вт'});
 }
 const cycle=datasets['dataset.ice-cycle'];
 if(cycle?.length){const indices=new Set([0,cycle.length-1]);for(let i=0;i<=64;i++)indices.add(Math.round(i*(cycle.length-1)/64));let peak=0;cycle.forEach((r,i)=>{if(r.p>cycle[peak].p)peak=i;});indices.add(peak);
  const preview=[...indices].sort((a,b)=>a-b).map(i=>cycle[i]);
  doc.nodes.push({id:'p.preview-limit',kind:'paragraph',content:[{kind:'text',text:'Таблиця нижче — '+preview.length+' вибраних точок для редактора Text_work (ліміт 500 значень), із збереженням точки pmax. Це НЕ повна розрахункова сітка і не дані для повторного інтегрування. Повний масив: build/design-cycle.csv, '+cycle.length+' точок. Графіки ICE/A1 використовують повний масив.'}]});
  table('table.cycle-preview','Перегляд p–θ: вибірка, не зміна розрахункових даних',[['theta','θ, градуси','deg'],['p','p, Па','Pa']],preview);
  doc.nodes.push({id:'chart.cycle-pressure',kind:'chart',title:'Розгорнута індикаторна діаграма — вибірка',tableId:'table.cycle-preview',xColumnId:'column.theta',yColumnIds:['column.p'],chartType:'line',xLabel:'θ, °',yLabel:'p, Па'});
 }
 const electric=datasets['dataset.electric-curve'];if(!cycle&&electric?.length){const rows=electric.filter((_,i)=>i%Math.max(1,Math.ceil(electric.length/40))===0);table('table.motor','Модельний електропривід',[['rpm','n, хв⁻¹','min^-1'],['continuousW','P, Вт','W'],['continuousNm','M, Н·м','N*m']],rows);doc.nodes.push({id:'chart.motor-power',kind:'chart',title:'Електрична потужність на валу',tableId:'table.motor',xColumnId:'column.rpm',yColumnIds:['column.continuousW'],chartType:'line',xLabel:'n, хв⁻¹',yLabel:'P, Вт'});}
 if(doc.values.length>500)throw Error('Native Text_work перевищує 500 значень; розділіть документ.');
 evaluateNative2(doc);return doc;
}
