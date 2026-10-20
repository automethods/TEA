/** Обмежений ICE-адаптер скалярних виразів; НЕ оригінальний mathjs-safe.
 * Без eval/Function, з перевіркою розмірностей SI. Дозволені + - * / ^ та sqrt.
 * Структуру документів перевіряє справжній upstream native-contract. */
import {validateNativeDocument} from '../vendor/engdoc/native-contract.js';
const Z=[0,0,0,0,0];
const units={
 'm':[1,0,0,0],'m^2':[2,0,0,0],'m^3':[3,0,0,0],'kg':[0,1,0,0],
 's':[0,0,1,0],'K':[0,0,0,1],'1/s':[0,0,-1,0],'rad/s':[0,0,-1,0],
 'Pa':[-1,1,-2,0],'J':[2,1,-2,0],'W':[2,1,-3,0],'N':[1,1,-2,0],
 'N*m':[2,1,-2,0],'kg/s':[0,1,-1,0],'m/s':[1,0,-1,0],'m/s^2':[1,0,-2,0],
 'J/kg':[2,0,-2,0],'J/(kg*K)':[2,0,-2,-1],'m^3/s':[3,0,-1,0],
 'kg/m^3':[-3,1,0,0],'kg/J':[-2,0,2,0],'kg*m^2':[2,1,0,0], 'Pa*s/m':[-2,1,-1,0], 'Pa*s^2/m^2':[-3,1,0,0]
};
for(const d of Object.values(units)) d.push(0);
Object.assign(units,{'1':[0,0,0,0,0],'deg':[0,0,0,0,0],'A':[0,0,0,0,1],'V':[2,1,-3,0,-1],'ohm':[2,1,-3,0,-2],'N*m/A':[2,1,-2,0,-1],'C':[0,0,1,0,1]});
const same=(a,b)=>a.every((v,i)=>Math.abs(v-b[i])<1e-10);
const quantity=(v,d=Z)=>({v,d:[...d]});
function binary(a,b,op) {
  if(op==='+'||op==='-') {if(!same(a.d,b.d))throw new Error('Несумісні розмірності доданків.');return quantity(op==='+'?a.v+b.v:a.v-b.v,a.d);}
  if(op==='*'||op==='/') {if(op==='/'&&b.v===0)throw new Error('Ділення на нуль.');return quantity(op==='*'?a.v*b.v:a.v/b.v,a.d.map((v,i)=>v+(op==='*'?1:-1)*b.d[i]));}
  if(!same(b.d,Z)||Math.abs(b.v)>8)throw new Error('Неприпустимий показник степеня.');
  return quantity(a.v**b.v,a.d.map(v=>v*b.v));
}
export function expression(source,env) {
  if(source.length>10000)throw new Error('Надто довгий вираз.');
  const tokens=source.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z0-9_]*|[()+\-*/^]|\S/g)||[];
  if(tokens.length>1000)throw new Error('Забагато токенів.');
  let i=0,depth=0;
  const primary=()=>{
    if(++depth>64)throw new Error('Надто глибокий вираз.');
    let result;const t=tokens[i++];
    if(t==='('){result=add();if(tokens[i++]!==')')throw new Error('Очікується закривна дужка.');}
    else if(t==='sqrt') {if(tokens[i++]!=='(')throw new Error('Очікується дужка sqrt.');const a=add();if(tokens[i++]!==')')throw new Error('Очікується дужка sqrt.'); result=binary(a,quantity(.5),'^');}
    else if(t==='pi') result=quantity(Math.PI);
    else if(/^\d|^\.\d/.test(t??'')) result=quantity(Number(t));
    else if(Object.hasOwn(env,t??'')) result=env[t];
    else throw new Error(`Невідомий або заборонений токен: ${t}`);
    depth--;return result;
  };
  const power=()=>{let a=primary();if(tokens[i]==='^'){i++;a=binary(a,unary(),'^');}return a;};
  const unary=()=>{if(tokens[i]==='+'||tokens[i]==='-'){const sign=tokens[i++];const a=unary();return quantity(sign==='-'?-a.v:a.v,a.d);}return power();};
  const mul=()=>{let a=unary();while(tokens[i]==='*'||tokens[i]==='/'){const op=tokens[i++];a=binary(a,unary(),op);}return a;};
  const add=()=>{let a=mul();while(tokens[i]==='+'||tokens[i]==='-'){const op=tokens[i++];a=binary(a,mul(),op);}return a;};
  const result=add();
  if(i!==tokens.length||!Number.isFinite(result.v))throw new Error('Вираз не є скінченним скаляром.');
  return result;
}
export function evaluateNative(document) {
  const doc=validateNativeDocument(document),byId=new Map(doc.values.map(v=>[v.id,v])),done=new Map(),pending=new Set();
  function visit(id) {
    if(done.has(id))return done.get(id);
    if(pending.has(id))throw new Error(`Цикл залежностей біля ${id}`);
    const v=byId.get(id);if(!v)throw new Error(`Невідоме значення ${id}`);pending.add(id);
    let q;
    if(v.role==='input') {
      if(v.value.kind!=='float64'&&v.value.kind!=='quantity')throw new Error('ICE підтримує лише float64 та SI quantity.');
      const d=v.value.kind==='quantity'?units[v.value.canonicalUnit]:Z;
      if(!d)throw new Error(`Непідтримувана одиниця ${v.value.canonicalUnit}`);
      q=quantity(v.value.value,d);
    } else {
      const env=Object.fromEntries(v.expression.bindings.map(b=>[b.token,visit(b.valueId)]));
      q=expression(v.expression.source,env);
      const expected=v.valueType==='quantity'?units[v.canonicalUnit]:Z;
      if(!expected||!same(q.d,expected))throw new Error(`Неправильна розмірність результату ${id}.`);
    }
    pending.delete(id);done.set(id,q);return q;
  }
  for(const v of doc.values)visit(v.id);
  return Object.fromEntries([...done].map(([id,q])=>[id,q.v]));
}
