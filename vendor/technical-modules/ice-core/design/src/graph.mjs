/** One authority for scalar definitions, dependencies, evaluations and native projections. No render-time arithmetic. */
import {evaluateNative2,evaluateScalar2} from '../../vendor/text-work-20260924/runtime.mjs';
import {sha256Text} from '../../vendor/engdoc/runtime.js';
import {appendNativeViews} from './native-views.mjs';
import {VERSION,activeFields} from './schema.mjs';
export function nativeUnit(unit){return unit==='1'?null:['1/s','rad/s'].includes(unit)?'s^-1':unit;}
export function fingerprint(value){return 'sha256:'+sha256Text(JSON.stringify(value));}
export class CalculationGraph{
 constructor(params,bundle,origins={}){
  this.params=params;this.bundle=bundle;this.records=[];this.values={};this.revision=fingerprint(params);this.origins=origins;this.configurationRefs=activeFields(bundle.fields,params).filter(f=>f.options||f.type==='csv').map(f=>f.id);
  this.native={format:'engdoc-native-draft/0.2',id:'doc.power-source-design',title:'Проєктний розрахунок енергетичної силової установки автомобіля',nodes:[],values:[]};
  this.add('constant.pi',Math.PI,null,'Число π','input','02-inputs',[],'balance','π');
  for(const f of activeFields(bundle.fields,params))if(!f.options&&f.type!=='csv')this.add(f.id,params[f.key],f.canonicalUnit,f.label,'input',f.group,[],origins[f.key]?.source??f.source,f.symbol);
 }
 add(id,value,unit,label,kind,chapter,deps=[],source='balance',symbol=id.split('.').at(-1)){
  if(Object.hasOwn(this.values,id))throw Error('Повторний ідентифікатор '+id);if(!Number.isFinite(value))throw Error('Нескінченний результат '+id);
  for(const d of deps)if(!Object.hasOwn(this.values,d))throw Error('Немає залежності '+d);
  const node='node.'+id;
  this.native.nodes.push({id:node,kind:'input',valueId:id});this.native.values.push({id,ownerNodeId:node,role:'input',label:(kind==='external'?'Чисельний результат інтегратора: ':'')+label,symbol,value:nativeUnit(unit)?{kind:'quantity',value,canonicalUnit:nativeUnit(unit)}:{kind:'float64',value}});
  if(kind==='external'||id.startsWith('constant.'))this.native.values.at(-1).constant=true;
  this.values[id]=value;this.records.push({id,label,symbol,kind,chapter,canonicalUnit:unit,value,dependencies:deps,...(kind==='external'?{configurationRefs:this.configurationRefs}:{}),sourceRefs:[source],status:kind==='input'?(this.origins[id.slice(6)]?.status??'given-or-assumed'):'model-estimated'});return value;
 }
 external(id,value,unit,label,chapter,deps,source='legacy-ice'){return this.add(id,value,unit,label,'external',chapter,deps,source,this.bundle.symbols?.[id]??id.split('.').at(-1));}
 calc(id,label,symbol,unit,source,bindings,chapter,sourceRefs=['balance']){
  if(Object.hasOwn(this.values,id))throw Error('Повторний ідентифікатор '+id);for(const d of Object.values(bindings))if(!Object.hasOwn(this.values,d))throw Error('Немає залежності '+d);
  const node='node.'+id,v={id,ownerNodeId:node,role:'calculation',label,symbol,valueType:nativeUnit(unit)?'quantity':'float64',...(nativeUnit(unit)?{canonicalUnit:nativeUnit(unit)}:{}),expression:{source,bindings:Object.entries(bindings).map(([token,valueId])=>({token,valueId}))}};
  this.native.nodes.push({id:node,kind:'calculation',valueId:id});this.native.values.push(v);
  const evaluated=evaluateScalar2(source,Object.fromEntries(Object.entries(bindings).map(([token,ref])=>{const r=this.records.find(x=>x.id===ref);return [token,{value:this.values[ref],unit:nativeUnit(r.canonicalUnit)}];})),nativeUnit(unit));const out=evaluated.value;this.values[id]=out;
  this.records.push({id,label,symbol,kind:'calculation',chapter,canonicalUnit:unit,value:out,expression:source,bindings,dependencies:Object.values(bindings),sourceRefs,status:'model-estimated',engineTrace:evaluated.trace});return out;
 }
 calculate(id,overrides={}){
  const d=this.bundle.chapters.flatMap(c=>c.calculations??[]).find(c=>c.value.id===id);if(!d)throw Error('Немає авторської native-формули '+id);
  const v=d.value,bindings={...Object.fromEntries(v.expression.bindings.map(b=>[b.token,b.valueId])),...overrides};
  for(const token of Object.keys(overrides))if(!v.expression.bindings.some(b=>b.token===token))throw Error('Невідома змінна конфігураційної прив’язки '+token);
  const out=this.calc(v.id,v.label,v.symbol,d.displayUnit??null,v.expression.source,bindings,d.chapter,d.sourceRefs);
  Object.assign(this.records.at(-1),{equationNumber:d.equationNumber,purpose:d.purpose,resultNote:d.resultNote,formulaDefinitionId:id,figureIds:d.figureIds??[]});return out;
 }
 /** Alias has no independently adopted value; native draft represents it through a unit-checked projection. */
 alias(id,label,symbol,unit,sourceId,chapter){
  const value=this.calc(id,label,symbol,unit,'source',{source:sourceId},chapter);
  const row=this.records.at(-1);row.kind='alias';row.aliasOf=sourceId;delete row.expression;delete row.bindings;
  return value;
 }
 finish(datasets,checks){
  const snapshot=evaluateNative2(this.native),evaluated=Object.fromEntries(snapshot.values.map(x=>[x.id,Number(x.value.value)]));for(const [k,v]of Object.entries(this.values))if(Math.abs(evaluated[k]-v)>Math.max(1e-9,Math.abs(v)*1e-12))throw Error('Не збіглася native-проєкція '+k);
  for(const r of this.records)for(const s of r.sourceRefs)if(!this.bundle.sources.some(x=>x.id===s))throw Error('Невідоме джерело '+s);
  const calculationRevision=fingerprint({inputRevision:this.revision,sourceRevision:this.bundle.sourceRevision,values:this.native.values});
  const statements=[['heading.scope','heading','Межі документа'],['p.scope','paragraph','Text_work 0.2 виконує скалярні формули. Зовнішні розрахунки циклу ДВЗ й електропривода позначено незмінними знімками; для їх оновлення потрібен ICE. Native-таблиці для перегляду можуть бути проріджені, повні CSV не проріджуються.'],['p.revision','paragraph','Входи: '+this.revision+'; джерела/моделі: '+this.bundle.sourceRevision+'; розрахунок: '+calculationRevision]];
  const existing=new Map(this.native.nodes.map(n=>[n.id,n])),ordered=[];
  for(const c of this.bundle.chapters){ordered.push({id:'native.heading.'+c.id,kind:'heading',level:1,content:[{kind:'text',text:c.title}]});for(let i=0;i<c.paragraphs.length;i++)ordered.push({id:'native.text.'+c.id+'.'+i,kind:'paragraph',content:[{kind:'text',text:c.paragraphs[i]}]});
   for(const g of c.governing??[])ordered.push({id:'native.governing.'+g.number,kind:'paragraph',content:[{kind:'text',text:g.purpose+' '+g.formula+' ('+g.number+'). '+g.symbols}]});
   for(const row of this.records){const ch=row.chapter.includes('-')?row.chapter:this.bundle.chapters.find(c=>Number(c.id.split('-')[0])===Number(row.chapter.split('.')[0]))?.id;if(ch===c.id){const n=existing.get('node.'+row.id);if(n){ordered.push(n);existing.delete(n.id);}}}
  }this.native.nodes=[...ordered,...existing.values()];
  for(const [id,kind,text]of statements)this.native.nodes.push({id,kind,...(kind==='heading'?{level:1}:{}),content:[{kind:'text',text}]});appendNativeViews(this.native,datasets);
  return {schema:'engineering-document-v1',profile:'power-source-design/1.0',document:{id:'doc.power-source-design',title:this.native.title,language:'uk',revision:calculationRevision},
   metadata:{technicalModules:this.bundle.technicalModules,application:'ICE Design',applicationVersion:VERSION,numericProfile:'IEEE754-binary64',unitSystem:'SI',nativeFormat:this.native.format},
   engineeringData:{sources:this.bundle.sources,inputs:this.records.filter(x=>x.kind==='input'),choices:activeFields(this.bundle.fields,this.params).filter(f=>f.options||f.type==='csv').map(f=>({id:f.id,value:this.params[f.key],sourceRefs:[this.origins[f.key]?.source??f.source]})),decisions:this.origins,valueAliases:this.records.filter(x=>x.kind==='alias').map(({value,...x})=>x),calculationDefinitions:this.records.filter(x=>x.kind==='calculation').map(({value,...r})=>r)},
   evaluationSnapshot:{evaluator:'Text_work/native-worker-2026-09-24',nativeTraces:snapshot.traces,sourceRevision:this.bundle.sourceRevision,calculationRevision,inputRevision:this.revision,values:this.records,diagnostics:checks,externalEvaluations:this.records.filter(x=>x.kind==='external'),datasets:Object.entries(datasets).map(([id,data])=>({id,revision:fingerprint(data),rows:Array.isArray(data)?data.length:null,inputRevision:this.revision}))},nativeDocument:this.native};
 }
}
