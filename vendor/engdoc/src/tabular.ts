/** Table editing and formula-address lowering. Arithmetic stays in native-engine.
 * Cell addresses are authoring conveniences; persisted formula edges use stable IDs.
 */
import { clone, fault, TABLE_LIMITS, NATIVE_PRESENTATION_FORMAT, NATIVE_EXTENDED_FORMAT, type NativeDocument, type NativeTable, type NativeColumn, type NativeCell, type NativeValue, type NativeScalar, type NativeCommand, type NativeCalculation } from './native-contract.js';
import { sha256Text } from './runtime.js';
import { canonicalStringify } from './model/json.js';
import { parseCsv, writeCsv, type CsvOptions, type ParsedCsv } from './csv.js';
import type { NativeEvaluation } from './native-engine.js';
export function columnName(index: number): string {
    if (!Number.isInteger(index) || index < 0 || index >= TABLE_LIMITS.columns) fault('INVALID_ARGUMENT', 'Column outside supported range.');
    return String.fromCharCode(65 + index);
}
export function cellId(tableId: string, rowId: string, columnId: string): string { return 'cell.' + sha256Text(JSON.stringify([tableId,rowId,columnId])).slice(0,48); }
export function getTable(doc: NativeDocument, nodeId: string): NativeTable { const n=doc.nodes.find(n=>n.id===nodeId); if (!n || n.kind !== 'table') fault('NOT_FOUND','Table not found.'); return n; }
export function parseCellLiteral(text: string, column: NativeColumn, decimalSeparator: '.' | ',' = '.'): NativeScalar {
    const t = (decimalSeparator === ',' ? text.replace(',', '.') : text).trim();
    if (column.valueType === 'boolean') { if (!/^(true|false)$/i.test(t)) fault('INVALID_ARGUMENT','Boolean cells require true or false.'); return {kind:'boolean',value:t.toLowerCase()==='true'}; }
    if (column.valueType === 'decimal') { if (!/^-?\d+(\.\d+)?$/.test(t)) fault('INVALID_ARGUMENT','Decimal cells require an exact decimal string, without exponent or thousands separators.'); return {kind:'decimal',value:t}; }
    if (column.valueType === 'text') return {kind:'string',value:text};
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(t) || !Number.isFinite(Number(t))) fault('INVALID_ARGUMENT','Enter a finite decimal number; blanks, thousands separators and formulas are not numeric data.');
    return column.valueType === 'quantity' ? {kind:'quantity',value:Number(t),canonicalUnit:column.canonicalUnit!} : {kind:'float64',value:Number(t)};
}
export function inferColumns(parsed: ParsedCsv): NativeColumn[] {
    return parsed.headers.map((label,i) => {
        const raw=parsed.rows.map(r=>r[i]!).filter(s=>s.trim()!==''), normalized=raw.map(s=>(parsed.decimalSeparator===','?s.replace(',','.'):s).trim());
        const plain=normalized.length>0 && normalized.every(s=>/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(s));
        const type=normalized.length && normalized.every(s=>/^(true|false)$/i.test(s)) ? 'boolean' : plain ? (normalized.some(s=>s.replace(/[^0-9]/g,'').length>15) ? 'decimal':'float64') : 'text';
        return {id:'col.'+(i+1),label,valueType:type};
    });
}
export function tableFromCsv(text: string, options: CsvOptions & { id: string; title?: string; name?: string; columns?: NativeColumn[] }): { table: NativeTable; values: NativeValue[]; preview: ParsedCsv } {
    const parsed=parseCsv(text,options), columns=clone(options.columns ?? inferColumns(parsed));
    if (columns.length!==parsed.headers.length) fault('INVALID_ARGUMENT','Column mapping must match CSV width.');
    const values: NativeValue[]=[];
    const table: NativeTable={id:options.id,kind:'table',title:options.title??options.name??'Imported table',columns,rows:[],source:{name:options.name??'pasted-data.csv',sha256:parsed.sourceHash,delimiter:parsed.delimiter,header:parsed.header,decimalSeparator:parsed.decimalSeparator}};
    parsed.rows.forEach((row,i)=>{
        const rowId='row.'+(i+1), cells: NativeCell[] = row.map((text,j)=>{
            const c=columns[j]!;
            if (c.valueType==='text' || !text.trim()) return {kind:'text',text:c.valueType==='text'?text:''};
            const id=cellId(table.id,rowId,c.id);
            values.push({id,ownerNodeId:table.id,role:'input',label:`${table.title} · ${columnName(j)}${i+1}`,symbol:`${columnName(j)}${i+1}`,value:parseCellLiteral(text,c,parsed.decimalSeparator)});
            return {kind:'valueRef',valueId:id};
        });
        table.rows.push({id:rowId,cells});
    });
    return {table,values,preview:parsed};
}
export function blankTable(id: string, rows = 3, columns = 3): NativeTable {
    if (!Number.isInteger(rows)||!Number.isInteger(columns)||rows<0||rows>TABLE_LIMITS.rows||columns<1||columns>TABLE_LIMITS.columns||rows*columns>TABLE_LIMITS.cells) fault('LIMIT_EXCEEDED','Unsupported table dimensions.');
    return {id,kind:'table',title:'New data table',columns:Array.from({length:columns},(_,i)=>({id:'col.'+(i+1),label:columnName(i),valueType:'float64'})),rows:Array.from({length:rows},(_,i)=>({id:'row.'+(i+1),cells:Array.from({length:columns},()=>({kind:'text' as const,text:''}))}))};
}
const functions = new Set(['abs','min','max','sqrt','cbrt','sin','cos','tan','asin','acos','atan','atan2','exp','log','log10','round','floor','ceil','sum','mean','size','transpose','dot','cross']);
const address = /^([A-Za-z]+)([1-9]\d*)$/;
function indices(token: string, table: NativeTable): [number,number] {
    const m=token.match(address); if (!m) fault('INVALID_ARGUMENT','Invalid cell address '+token+'.');
    const col=[...m[1]!.toUpperCase()].reduce((a,c)=>a*26+c.charCodeAt(0)-64,0)-1, row=Number(m[2])-1;
    if (!Number.isSafeInteger(row)||row>=table.rows.length||col>=table.columns.length) fault('NOT_FOUND','Cell address '+token+' is outside this table.');
    return [row,col];
}
/** Supports =A1+B2, SUM(A1:A4), AVERAGE/MIN/MAX and explicit @{value.id}.
 * Ranges expand to a bounded explicit set, never hidden mutable position links.
 */
export function lowerTableFormula(doc: NativeDocument, table: NativeTable, formula: string): NativeCalculation['expression'] {
    const raw=formula.trim().replace(/^=/,'');
    if (!raw.length || raw.length>TABLE_LIMITS.formulaChars) fault('LIMIT_EXCEEDED','Formula is empty or too long.');
    const tokens: string[]=[];
    const token=/\s+|@\{[A-Za-z][A-Za-z0-9_.:-]*\}|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z0-9_]*|[()+\-*/^,:]/gy;
    let offset=0;
    while(offset<raw.length){token.lastIndex=offset;const m=token.exec(raw);if(!m)fault('INVALID_ARGUMENT',`Unsupported formula syntax at character ${offset+1}. Use cell addresses, numbers, allowed functions or @{value.id}.`);offset=token.lastIndex;if(m[0].trim())tokens.push(m[0]);}
    const bindings: Array<{token:string;valueId:string}>=[], bound=new Map<string,string>();
    const ref=(id:string):string=>{
        const v=doc.values.find(v=>v.id===id);
        if (!v) fault('NOT_FOUND',`Formula value ${id} is missing.`);
        const type=v.role==='input'?v.value.kind:v.valueType;
        if (!['float64','decimal','quantity'].includes(type)) fault('INVALID_ARGUMENT','Formula references must be numeric; text and booleans are not silently converted.');
        if(bound.has(id))return bound.get(id)!;
        if(bindings.length>=TABLE_LIMITS.rangeCells)fault('LIMIT_EXCEEDED','A cell formula may reference at most 100 distinct values.');
        const t='_cell'+bindings.length;bindings.push({token:t,valueId:id});bound.set(id,t);return t;
    };
    const cell=(name:string):string=>{const [r,c]=indices(name,table),v=table.rows[r]!.cells[c]!;if(v.kind!=='valueRef')fault('INVALID_ARGUMENT',`Cell ${name} is blank or text; it is not zero.`);return ref(v.valueId);};
    const out:string[]=[], stack:string[]=[];
    for(let i=0;i<tokens.length;i++){
        const t=tokens[i]!, next=tokens[i+1];
        if(t==='('){stack.push(i>0 && /^[A-Za-z_]/.test(tokens[i-1]!) ? tokens[i-1]!.toLowerCase().replace(/^average$/,'mean') : '');out.push(t);continue;}
        if(t===')'){if(!stack.length)fault('INVALID_ARGUMENT','Unbalanced formula parentheses.');stack.pop();out.push(t);continue;}
        if(t.startsWith('@{')){out.push(ref(t.slice(2,-1)));continue;}
        if(/^[A-Za-z_]/.test(t) && next==='('){const f=t.toLowerCase()==='average'?'mean':t.toLowerCase();if(!functions.has(f))fault('INVALID_ARGUMENT','Unsupported formula function '+t+'.');out.push(f);continue;}
        if(address.test(t)){
            if(next===':'){
                const end=tokens[i+2];if(!end||!address.test(end)||!['sum','mean','min','max'].includes(stack.at(-1)??'')||!['(',','].includes(tokens[i-1]??'')||![')',','].includes(tokens[i+3]??''))fault('INVALID_ARGUMENT','A range must be a complete SUM/AVERAGE/MIN/MAX argument.');
                const [r0,c0]=indices(t,table),[r1,c1]=indices(end,table);
                if(r1<r0||c1<c0)fault('INVALID_ARGUMENT','Range endpoints must be in increasing row/column order.');
                if((r1-r0+1)*(c1-c0+1)>TABLE_LIMITS.rangeCells)fault('LIMIT_EXCEEDED','Range exceeds 100 cells.');
                const refs:string[]=[];for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)refs.push(cell(columnName(c)+(r+1)));
                out.push(refs.join(', '));i+=2;
            }else out.push(cell(t));
        }else if(/^[A-Za-z_]/.test(t)||t===':')fault('INVALID_ARGUMENT','Unknown formula name '+t+'. Use @{value.id} for a document value.');
        else out.push(t);
    }
    if(stack.length)fault('INVALID_ARGUMENT','Unbalanced formula parentheses.');
    return {source:out.join(' '),bindings};
}
export function displayTableFormula(doc: NativeDocument, table: NativeTable, value: NativeCalculation): string {
    const addresses=new Map<string,string>();table.rows.forEach((r,i)=>r.cells.forEach((c,j)=>{if(c.kind==='valueRef')addresses.set(c.valueId,columnName(j)+(i+1));}));
    const refs=new Map(value.expression.bindings.map(b=>[b.token,addresses.get(b.valueId)??'@{'+b.valueId+'}']));
    return '='+value.expression.source.replace(/[A-Za-z_][A-Za-z0-9_]*/g,t=>refs.get(t)??(t==='mean'?'AVERAGE':t));
}
export function cellEntry(doc: NativeDocument, table: NativeTable, rowIndex:number,columnIndex:number):string {
    const cell=table.rows[rowIndex]?.cells[columnIndex];if(!cell)return '';
    if(cell.kind==='text')return cell.text;
    const v=doc.values.find(v=>v.id===cell.valueId)!;
    return v.role==='input'?String(v.value.value):displayTableFormula(doc,table,v);
}
/** Applies only table/chart commands to a private candidate owned by the session. */
export function applyTabularCommand(doc:NativeDocument,command:NativeCommand):boolean {
    if(command.type==='putTable'){
        const i=doc.nodes.findIndex(n=>n.id===command.table.id);
        if(i>=0 && doc.nodes[i]!.kind!=='table')fault('FORBIDDEN','putTable cannot replace a different kind of node.');
        if(command.values.some(v=>v.ownerNodeId!==command.table.id))fault('INVALID_DOCUMENT','A table transaction may contain only values owned by that table.');
        if(i<0)doc.nodes.push(clone(command.table));else doc.nodes[i]=clone(command.table);
        doc.values=doc.values.filter(v=>v.ownerNodeId!==command.table.id).concat(clone(command.values));
    }else if(command.type==='putChart'){
        const i=doc.nodes.findIndex(n=>n.id===command.chart.id);
        if(i>=0 && doc.nodes[i]!.kind!=='chart')fault('FORBIDDEN','putChart cannot replace a different kind of node.');
        if(i<0)doc.nodes.push(clone(command.chart));else doc.nodes[i]=clone(command.chart);
    }else if(['setTableCell','insertTableRow','removeTableRow','moveTableRow','insertTableColumn','removeTableColumn'].includes(command.type)){
        const c=command as Extract<NativeCommand,{nodeId:string}>, table=getTable(doc,c.nodeId);
        switch(c.type){
            case 'setTableCell': {
                const row=table.rows.find(r=>r.id===c.rowId),j=table.columns.findIndex(col=>col.id===c.columnId);
                if(!row||j<0)fault('NOT_FOUND','Cell row/column not found.');
                const col=table.columns[j]!,old=row.cells[j]!,id=old.kind==='valueRef'?old.valueId:cellId(table.id,row.id,col.id);
                if(col.valueType==='text'||!c.entry.trim()){
                    row.cells[j]={kind:'text',text:col.valueType==='text'?c.entry:''};
                    if(old.kind==='valueRef')doc.values=doc.values.filter(v=>v.id!==old.valueId);
                }else{
                    const previous=doc.values.find(v=>v.id===id),i=table.rows.indexOf(row),label=`${table.title} · ${columnName(j)}${i+1}`;
                    row.cells[j]={kind:'valueRef',valueId:id};
                    const v:NativeValue=c.entry.trim().startsWith('=')?{id,ownerNodeId:table.id,role:'calculation',label,symbol:columnName(j)+(i+1),valueType:col.valueType as NativeCalculation['valueType'],...(col.canonicalUnit?{canonicalUnit:col.canonicalUnit}:{}),expression:{source:'0',bindings:[]}}:
                        {...(previous?.role==='input'?previous:{id,ownerNodeId:table.id,role:'input' as const,label,symbol:columnName(j)+(i+1)}),value:parseCellLiteral(c.entry,col)};
                    if(v.role==='calculation'&&col.valueType==='boolean')fault('INVALID_ARGUMENT','Boolean formulas are outside this numeric table profile.');
                    if(old.kind==='text' && previous)fault('INVALID_DOCUMENT','Cell identity collision.');
                    doc.values=doc.values.filter(v=>v.id!==id);doc.values.push(v);
                    if(v.role==='calculation')v.expression=lowerTableFormula(doc,table,c.entry);
                }
                break;
            }
            case 'insertTableRow': {
                if(table.rows.some(r=>r.id===c.rowId))fault('INVALID_DOCUMENT','Row identity already exists.');
                const i=c.beforeRowId==null?table.rows.length:table.rows.findIndex(r=>r.id===c.beforeRowId);if(i<0)fault('NOT_FOUND','Row anchor missing.');
                table.rows.splice(i,0,{id:c.rowId,cells:table.columns.map(()=>({kind:'text',text:''}))});break;
            }
            case 'removeTableRow': {
                const i=table.rows.findIndex(r=>r.id===c.rowId);if(i<0)fault('NOT_FOUND','Row missing.');
                const removed=table.rows.splice(i,1)[0]!,ids=new Set(removed.cells.filter((x):x is Extract<NativeCell,{valueId:string}>=>x.kind==='valueRef').map(x=>x.valueId));doc.values=doc.values.filter(v=>!ids.has(v.id));break;
            }
            case 'moveTableRow': {
                const i=table.rows.findIndex(r=>r.id===c.rowId);if(i<0)fault('NOT_FOUND','Row missing.');if(c.beforeRowId===c.rowId)break;
                const row=table.rows.splice(i,1)[0]!,j=c.beforeRowId===null?table.rows.length:table.rows.findIndex(r=>r.id===c.beforeRowId);if(j<0)fault('NOT_FOUND','Row anchor missing.');table.rows.splice(j,0,row);break;
            }
            case 'insertTableColumn': if(table.columns.some(col=>col.id===c.column.id))fault('INVALID_DOCUMENT','Column identity already exists.');table.columns.push(clone(c.column));for(const r of table.rows)r.cells.push({kind:'text',text:''});break;
            case 'removeTableColumn': {
                const j=table.columns.findIndex(col=>col.id===c.columnId);if(j<0)fault('NOT_FOUND','Column missing.');table.columns.splice(j,1);
                const removed=new Set<string>();for(const r of table.rows){const cell=r.cells.splice(j,1)[0]!;if(cell.kind==='valueRef')removed.add(cell.valueId);}doc.values=doc.values.filter(v=>!removed.has(v.id));break;
            }
        }
    }else return false;
    if(doc.format!==NATIVE_PRESENTATION_FORMAT)doc.format=NATIVE_EXTENDED_FORMAT;return true;
}
export function exportTableCsv(doc:NativeDocument, table:NativeTable, evaluation?:NativeEvaluation):{text:string;neutralized:number} {
    const fresh=!!evaluation&&evaluation.state==='evaluated'&&evaluation.contentHash==='sha256:'+sha256Text(canonicalStringify(doc))&&!evaluation.scenario&&evaluation.normalizedOverrides.length===0&&evaluation.requestedTargetIds===null;
    const values=new Map(doc.values.map(v=>[v.id,v])),results=new Map(evaluation?.values.map(v=>[v.id,v.value as any])??[]);
    return writeCsv([table.columns.map(c=>({text:c.label+(c.canonicalUnit?' ['+c.canonicalUnit+']':'')})),...table.rows.map(r=>r.cells.map(c=>{
        if(c.kind==='text')return {text:c.text};
        const v=values.get(c.valueId)!;
        if(v.role==='calculation'&&!fresh)fault('INVALID_ARGUMENT','Calculate the current document before exporting formula results.');
        const result=v.role==='input'?v.value:results.get(v.id);
        if(!result||!['float64','decimal','quantity','boolean'].includes(result.kind))fault('INVALID_ARGUMENT','A cell result is unavailable.');
        return {text:String(result.value),numeric:['float64','decimal','quantity'].includes(result.kind)};
    }))]);
}
/** Current layout coordinate is derived; it never replaces the stable value ID. */
export function locateTableValue(doc:NativeDocument,valueId:string):{tableId:string;rowId:string;columnId:string;address:string;label:string}|undefined{
    for(const n of doc.nodes)if(n.kind==='table')for(let i=0;i<n.rows.length;i++)for(let j=0;j<n.columns.length;j++){
        const c=n.rows[i]!.cells[j]!;if(c.kind==='valueRef'&&c.valueId===valueId){const address=columnName(j)+(i+1);return {tableId:n.id,rowId:n.rows[i]!.id,columnId:n.columns[j]!.id,address,label:n.title+' · '+address};}
    }
    return undefined;
}

/** Presentation only. Exact decimal strings and serialized values are untouched.
 * Numeric cells show 12 significant digits; edit controls/CSV/evidence stay exact.
 */
export function displayCellMagnitude(value:{value:unknown}):string {
    return typeof value.value==='number' && Number.isFinite(value.value)
        ? String(Number(value.value.toPrecision(12))) : String(value.value);
}
