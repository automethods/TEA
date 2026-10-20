import { NativeDocumentSession } from '../vendor/engdoc-runtime.js';

// Reusable arithmetic scopes are authored here as native EngDoc documents.
// Application-specific source/numbering metadata stays outside the strict native schema.
export class CalculationBook {
  constructor(id,title) {
    this.doc={format:'engdoc-native-draft/0.3',id,title,nodes:[],values:[],numericProfile:'float64'};
    this.annotations={};
  }
  input(id,value,label=id,unit='',source='CASE') {
    if(!Number.isFinite(value)) throw new Error(`Некоректне число: ${label}`);
    this.doc.nodes.push({id:`node.${id}`,kind:'input',valueId:id});
    this.doc.values.push({id,ownerNodeId:`node.${id}`,role:'input',label,symbol:id.replaceAll('.','_'),value:{kind:'float64',value}});
    this.annotations[id]={label,unit,source}; return id;
  }
  calc(id,expression,bindings,label,unit='',number='',source='CASE') {
    this.doc.nodes.push({id:`node.${id}`,kind:'calculation',valueId:id});
    this.doc.values.push({id,ownerNodeId:`node.${id}`,role:'calculation',label,symbol:id.replaceAll('.','_'),valueType:'float64',expression:{source:expression,bindings:Object.entries(bindings).map(([token,valueId])=>({token,valueId}))}});
    this.annotations[id]={label,unit,number,source};return id;
  }
  evaluate() {
    const session=new NativeDocumentSession(this.doc);
    const r=session.evaluate({baseRevision:session.revision});
    if(!r.ok || r.data.state!=='evaluated') throw new Error(`Не вдалося обчислити ${this.doc.title}: ${JSON.stringify(r.error??r.data.diagnostics)}`);
    const values=Object.fromEntries(r.data.values.map(v=>[v.id,v.value.value]));
    return {document:this.doc,evidence:r.data,annotations:this.annotations,values};
  }
}
export function scalar(id,title,inputs,defs) {
  const b=new CalculationBook(id,title);
  for(const [key,v] of Object.entries(inputs)) b.input(key,...(Array.isArray(v)?v:[v]));
  for(const d of defs)b.calc(...d);
  return b.evaluate();
}
