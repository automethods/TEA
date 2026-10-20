import {validateNativeDocument} from '../../vendor/engdoc/native-contract.js';
import {evaluateNative} from '../../src/native-evaluate.mjs';
export function nativeDocument(project,bundle){
 const d={format:'engdoc-native-draft/0.1',id:'doc.powertrain',title:'Силова установка автомобіля — ICE / P2 / Series / BEV',nodes:[],values:[]};
 for(const c of bundle.chapters){d.nodes.push({id:'h.'+c.id,kind:'heading',level:1,content:[{kind:'text',text:c.title}]});c.paragraphs.forEach((text,i)=>d.nodes.push({id:'p.'+c.id+'.'+i,kind:'paragraph',content:[{kind:'text',text}]}));}
 const p=project.params,s=project.summary,des=project.performance.design;
 const input=(id,symbol,label,value,unit)=>{d.nodes.push({id:'node.'+id,kind:'input',valueId:id});d.values.push({id,ownerNodeId:'node.'+id,role:'input',symbol,label,value:unit?{kind:'quantity',value,canonicalUnit:unit}:{kind:'float64',value}});};
 input('input.speed','v','Швидкість розрахункової точки',p.designSpeed/3.6,'m/s');input('snapshot.force','F_req','Чисельний знімок: потрібне зусилля',des.forceN,'N');
 input('snapshot.battery_energy','E_DC','Чисельний знімок: нетто-енергія на клемах',s.batteryKWh*3.6e6,'J');input('snapshot.duration','t','Тривалість заданої місії',s.durationS,'s');
 input('input.nominal_energy','E_nom','Номінальна енергія еквівалентної батареї',p.batteryKWh*3.6e6,'J');input('input.soc0','SOC_0','Початковий SOC',p.initialSoc);input('snapshot.soc1','SOC_1','Чисельний знімок: кінцевий SOC',s.finalSoc);
 const calc=(id,symbol,label,source,bindings,unit)=>{d.nodes.push({id:'node.'+id,kind:'calculation',valueId:id});d.values.push({id,ownerNodeId:'node.'+id,role:'calculation',symbol,label,valueType:'quantity',canonicalUnit:unit,expression:{source,bindings:Object.entries(bindings).map(([token,valueId])=>({token,valueId}))}});};
 calc('calc.wheel_power','P_w','Потрібна колісна потужність','F * v',{F:'snapshot.force',v:'input.speed'},'W');
 calc('calc.mean_battery_power','P_DC_avg','Середня клемна потужність батареї','E / t',{E:'snapshot.battery_energy',t:'snapshot.duration'},'W');
 calc('calc.chemical_energy','E_chem','Зміна хімічної енергії батареї','E * (a - b)',{E:'input.nominal_energy',a:'input.soc0',b:'snapshot.soc1'},'J');
 validateNativeDocument(d);const values=evaluateNative(d);
 if(Math.abs(values['calc.wheel_power']-des.wheelKW*1000)>1e-6)throw Error('Не збігається native-формула колісної потужності.');
 for(const m of bundle.parameters){
  const id='setting.'+m.key;
  d.nodes.push({id:'node.'+id,kind:'input',valueId:id});
  d.values.push({id,ownerNodeId:'node.'+id,role:'input',symbol:m.key,label:m.label+(m.unit?' ['+m.unit+']':''),value:typeof p[m.key]==='string'?{kind:'string',value:p[m.key]}:{kind:'float64',value:p[m.key]}});
 }
 validateNativeDocument(d);
 return {document:d,values};
}
