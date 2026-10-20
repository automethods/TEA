/** Numeric-literal reader, NOT a MATLAB interpreter. The source is never executed.
 * Missing values remain null. Orientation, units, identity and evidence are explicit.
 * End-to-end conformance with original ALPHA ZIPs is pending until those bytes exist.
 */
import {validateMap,linear,increasing} from './maps.mjs';
const idPattern=/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;
export function numericMatrix(text){
 if(typeof text!=='string'||text.length>12e6)throw Error('Неприпустимий числовий масив.');
 const s=text.replace(/\.\.\.[^\n]*\n/g,' ').trim();
 if(!s.startsWith('[')||!s.endsWith(']'))throw Error('Підтримано лише літеральний масив [...].');
 const inner=s.slice(1,-1).trim();if(!inner)throw Error('Порожній масив.');
 const rows=inner.split(/;|\r?\n/).map(x=>x.trim()).filter(Boolean).map(row=>{
  const cells=row.split(/[,\s]+/).filter(Boolean);return cells.map(x=>{if(/^nan$/i.test(x))return null;
   if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eEdD][+-]?\d+)?$/.test(x))throw Error('Нелітеральний елемент MATLAB: '+x);
   const v=Number(x.replace(/[dD]/,'e'));if(!Number.isFinite(v))throw Error('Нескінченний елемент.');return v;});});
 if(!rows.length||rows.some(r=>r.length!==rows[0].length)||rows.length*rows[0].length>250000)throw Error('Нерівна або завелика матриця.');
 return rows;
}
export function readMatlabArray(source,field){
 if(typeof source!=='string'||source.length>20e6||!idPattern.test(field))throw Error('Неприпустиме джерело/поле.');
 // Remove MATLAB comments, retaining line boundaries. No expressions are evaluated.
 const clean=source.replace(/^\s*%\{[\s\S]*?^\s*%\}/gm,'').replace(/%[^\n]*/g,'');
 const re=new RegExp('^\\s*(?:[A-Za-z]\\w*\\.)*'+field.replace(/\./g,'\\.')+'\\s*=\\s*','gm'),hits=[...clean.matchAll(re)];
 if(hits.length!==1)throw Error('Потрібне одне присвоєння '+field+'; знайдено '+hits.length);
 const offset=hits[0].index+hits[0][0].length;if(clean[offset]!=='[')throw Error(field+': очікується [...], не функція/посилання.');
 const end=clean.indexOf(']',offset);if(end<0)throw Error('Незакритий масив '+field);
 let rows=numericMatrix(clean.slice(offset,end+1)),tail=clean.slice(end+1),transpose=false;
 const suffix=tail.match(/^[ \t]*(\.'|')?[ \t]*(;|\r?\n|$)/);
 if(!suffix)throw Error(field+': вираз після масиву не підтримано.');transpose=!!suffix[1];
 if(transpose)rows=rows[0].map((_,j)=>rows.map(r=>r[j]));return rows;
}
function vector(source,field){const m=readMatlabArray(source,field);if(m.length!==1&&m[0].length!==1)throw Error(field+': потрібний вектор.');const a=m.flat();if(a.some(x=>x===null))throw Error(field+': пропуск осі.');return a;}
function metadata(meta,quantity){
 if(!meta||meta.format!=='alpha-import-metadata/1'||!idPattern.test(meta.id??'')||!idPattern.test(meta.componentId??'')||typeof meta.source!=='string'||!meta.source.trim()||typeof meta.version!=='string'||!meta.version.trim())throw Error('Потрібні format, id, componentId, source, version.');
 if(meta.quantity!==quantity||!['processed-benchmark-map','processed-model-map','user-table','synthetic-fixture'].includes(meta.evidence))throw Error('Вкажіть вид карти й доказовість; processed не дорівнює measured.');
 if(!['rad/s','rpm'].includes(meta.speedUnit)||!['torque-by-speed','speed-by-torque'].includes(meta.matrixOrientation))throw Error('Вкажіть одиниці частоти й орієнтацію матриці.');
 return {format:'powertrain-grid/1',id:meta.id,componentId:meta.componentId,source:meta.source,sourceVersion:meta.version,evidence:meta.evidence,quantity,
  provenance:{conversion:'ICE numeric-literal adapter 0.7.0',sourceSpeedUnit:meta.speedUnit,sourceMatrixOrientation:meta.matrixOrientation,cellEvidence:'Not supplied per cell; not all nodes are measured',sourceCitation:meta.citation??meta.source},boundary:meta.boundary};
}
function matrix(source,fields,meta){
 const speed=vector(source,fields.speed),rpm=speed.map(x=>meta.speedUnit==='rad/s'?x*30/Math.PI:x),torqueNm=vector(source,fields.torque);
 increasing(rpm,'rpm');increasing(torqueNm,'torque');let values=readMatlabArray(source,fields.values);
 if(meta.matrixOrientation==='torque-by-speed')values=values[0].map((_,j)=>values.map(r=>r[j]));
 if(values.length!==rpm.length||values.some(r=>r.length!==torqueNm.length))throw Error('Розміри масиву не відповідають явно заданій орієнтації.');
 return {rpm,torqueNm,values};
}
export function normalizeAlphaEngine(source,meta){
 const out=metadata(meta,'fuel_g_s');if(meta.boundary!=='crankshaft'||meta.fuelUnit!=='g/s')throw Error('Потрібна межа crankshaft та паливо g/s.');
 const f={speed:'fuel_map_speed_radps',torque:'fuel_map_torque_Nm',values:'fuel_map_gps',maxSpeed:'full_throttle_speed_radps',maxTorque:'full_throttle_torque_Nm',...meta.fields};
 Object.assign(out,matrix(source,f,meta),{lhvJkg:meta.lhvJkg,fuelDensityKgL:meta.fuelDensityKgL});
 const rpm=vector(source,f.maxSpeed).map(x=>meta.speedUnit==='rad/s'?x*30/Math.PI:x),maxTorqueNm=vector(source,f.maxTorque);
 increasing(rpm,'WOT rpm');if(rpm.length!==maxTorqueNm.length||maxTorqueNm.some(x=>x<0))throw Error('Некоректна WOT огинаюча.');
 out.operatingEnvelope={rpm,maxTorqueNm};
 // null outside source envelope is deliberately NOT replaced by zero.
 out.maxTorqueNm=out.rpm.map(n=>linear(rpm,maxTorqueNm,n));
 out.operatingMinRpm=meta.operatingMinRpm;out.operatingMaxRpm=meta.operatingMaxRpm;
 if(!(out.operatingMinRpm>0&&out.operatingMaxRpm>out.operatingMinRpm&&out.operatingMinRpm>=rpm[0]&&out.operatingMaxRpm<=rpm.at(-1)))throw Error('Вкажіть підтверджені ненульові робочі межі частоти.');
 return validateMap(out);
}
export function normalizeAlphaMotor(source,meta){
 const out=metadata(meta,'loss_w');if(meta.lossUnit!=='W'||!meta.fields||!['motor-only','motor+inverter'].includes(meta.boundary))throw Error('Потрібні поля, lossUnit=W і межа motor-only/motor+inverter. EDU/BISG не перетворюються без кінематичного адаптера.');
 const f=meta.fields;for(const key of ['speed','torque','values','maxSpeed','maxTorque','minTorque'])if(typeof f[key]!=='string')throw Error('Вкажіть поле '+key+' з конкретного пакета; імена не вгадуються.');
 Object.assign(out,matrix(source,f,meta));const rpm=vector(source,f.maxSpeed).map(x=>meta.speedUnit==='rad/s'?x*30/Math.PI:x);
 out.operatingEnvelope={rpm,maxTorqueNm:vector(source,f.maxTorque),minTorqueNm:vector(source,f.minTorque)};
 out.testConditions=meta.testConditions??{status:'unknown'};return validateMap(out);
}
