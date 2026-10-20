export const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export const num=(n,d=2)=>Number.isFinite(n)?new Intl.NumberFormat('uk-UA',{maximumFractionDigits:d}).format(n):'—';
export const table=(number,title,heads,rows,cls='')=>`<div class="table-wrap ${rows.length<=12?'table-compact':''} ${cls}"><table id="table-${esc(number)}"><caption>Таблиця ${esc(number)} — ${esc(title)}</caption><thead><tr>${heads.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.map(c=>`<td>${c??'—'}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${heads.length}" class="empty">Записів немає.</td></tr>`}</tbody></table></div>`;
export const badge=(s,kind='')=>`<span class="badge ${kind}">${esc(s)}</span>`;
export const formula=(number,body,note='')=>`<div class="equation" id="eq-${number}"><div>${body}</div><a href="#eq-${number}" aria-label="Формула ${number}">(${number})</a></div>${note?`<p class="note">${note}</p>`:''}`;
const jobs=['maintenance','mechanical','wheel','diagnostic'],classes=['M1','M2','M3','N1','N2','N3'];
const planning=['days','hours','shifts','bayUtil','attendance','crew','plannedBays','plannedWorkers','parkingSpaces','waitBefore','waitReady','peakFactor','endClearance','sideClearance','auxArea','maxLength','maxWidth','maxMass'];
export function inputNumber(path){
 const fixed={vehiclePreset:'1.1',workshopPreset:'1.2',student:'2.0.1',group:'2.0.2',variant:'2.0.3',scenario:'2.5.1',partsReady:'2.5.2',day:'2.5.3',selectedOrder:'2.5.4',diagnosticClass:'2.6.1','notes.hypotheses':'6.1','notes.decision':'6.2','notes.verification':'6.3','notes.equipment':'10.1','notes.conclusion':'10.2'};
 if(fixed[path])return fixed[path];const p=path.split('.');
 if(p[0]==='vehicleMix')return '2.1.'+(classes.indexOf(p[1])+1);
 if(p[0]==='classData')return '2.2.'+(p[2]==='hours'?classes.indexOf(p[1])*4+jobs.indexOf(p[3])+1:25+classes.indexOf(p[1])*4+['length','width','mass','radius'].indexOf(p[2]));
 if(p[0]==='months')return '2.3.'+(Number(p[1])*4+jobs.indexOf(p[2])+1);
 if(p[0]==='bayShare')return '2.3.'+(49+jobs.indexOf(p[1]));
 if(p[0]==='planning')return '2.4.'+(planning.indexOf(p[1])+1);
 if(['op','assignment'].includes(p[0])){const id=/O(\d+)-(\d+)/.exec(p[1]);return '2.5.'+(5+((Number(id[1])-1)*3+Number(id[2])-1)*4+['duration','start_slot','bay_id','staff_id'].indexOf(p[2]));}
 if(p[0]==='abs')return '2.6.'+(p[1]==='frequencies'?7+Number(p[2]):2+['radius','z','limit','frequency','dr','df'].indexOf(p[1]));
 if(p[0]==='adas')return '2.7.'+(1+['required','oem','equipment','access','trained','mode','start','due','available','alignment','procedure','wait'].indexOf(p[1]));
 if(p[0]==='pilot')return '2.8.'+(Number(p[1])+1)+'.'+(1+['accepted','reason','arrival','start','due','ready','issued','labour','bay','wait'].indexOf(p[2]));
 if(p[0]==='parking')return '2.9.'+(Number(p[1])+1)+'.'+(1+['orderId','start','end','reason'].indexOf(p[2]));
 throw new Error('Unnumbered input: '+path);
}
export const inputMark=id=>`<small class="input-reference" title="Номер вхідного поля">I-${inputNumber(id)}</small>`;
export const field=(id,label,value,options={})=>`<label class="field"><span>${inputMark(id)} ${label}</span><input id="${esc(id)}" data-field="${esc(id)}" data-input-ref="I-${inputNumber(id)}" type="${options.type||'number'}" value="${esc(value)}" ${options.type==='text'||options.type==='datetime-local'?'':`step="${options.step??'any'}"`} ${options.min!==undefined?`min="${options.min}"`:''} ${options.max!==undefined?`max="${options.max}"`:''}></label>`;
export const check=(id,label,value)=>`<label class="check"><input type="checkbox" data-field="${id}" data-input-ref="I-${inputNumber(id)}" ${value?'checked':''}><span>${inputMark(id)} ${label}</span></label>`;
export const errorBox=s=>`<p class="error" role="alert">${esc(s)}</p>`;
// Convert authored source keys in text nodes; preserve attributes and user-entered textareas.
export function linkReferences(html,sources){
 const refs=Object.fromEntries(sources.map((s,i)=>[s.id,i+1]));Object.assign(refs,{CASE:refs['SYN-02'],'ABS-CASE':refs['SYN-02'],'ADAS-CASE':refs['SYN-02']});
 let inTextarea=false;
 return html.split(/(<[^>]+>)/g).map(part=>{
  if(part.startsWith('<')){if(/^<textarea\b/.test(part))inTextarea=true;if(/^<\/textarea/.test(part))inTextarea=false;return part;}
  if(inTextarea)return part;
  return part.replace(/\[((?:(?:S\d+|B\d+|ST\d+|SYN-\d+|ABS-CASE|ADAS-CASE|CASE)[,; ]*)+)\]/g,(all,keys)=>{
   const ids=[...new Set(keys.split(/[,; ]+/).filter(Boolean).map(k=>refs[k]))];if(ids.some(x=>!x))throw new Error('Unknown reference '+all);
   return ids.map(n=>`<a class="cite" href="#source-${n}" title="Джерело ${n}">[${n}]</a>`).join(', ');
  });
 }).join('');
}

// Display flat numbering per section; field paths remain stable for saved projects.
export function flattenInputNumbers(html){
 return html.split(/(?=<section\b)/).map(part=>{let n=0;const refs=new Map();return part.replace(/I-[0-9]+(?:\.[0-9]+)*/g,old=>{if(!refs.has(old))refs.set(old,'I-'+String(++n).padStart(2,'0'));return refs.get(old);});}).join('');
}

// Render the deliberately small arithmetic vocabulary used by calculation tables.
export function arithmeticHtml(source,bindings={}){
 const tokens=source.match(/[A-Za-z][A-Za-z0-9_]*|[0-9]+(?:\.[0-9]+)?|[()+*\/-]/g)||[];let at=0;
 const atom=()=>{const t=tokens[at++];if(t==='('){const value=add();if(tokens[at++]!==')')throw Error('Unclosed arithmetic group');return '('+value+')';}if(t==='-')return '−'+atom();return Object.hasOwn(bindings,t)?num(bindings[t],4):esc(t);};
 const mul=()=>{let a=atom();while(['*','/'].includes(tokens[at])){const op=tokens[at++],b=atom();a=op==='*'?a+' · '+b:`<span class="fraction"><span>${a}</span><span>${b}</span></span>`;}return a;};
 const add=()=>{let a=mul();while(['+','-'].includes(tokens[at])){const op=tokens[at++];a+=' '+(op==='-'?'−':'+')+' '+mul();}return a;};
 return add();
}
