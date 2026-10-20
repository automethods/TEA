/** Data-only SVG plots over the SAME document values. No chart scripts/CDNs.
 * Exact numbers remain in table/evidence; pixel coordinates use finite doubles.
 */
import { unit } from 'mathjs';
import { type NativeDocument, type NativeTable, type NativeChart, type NativeColumn } from './native-contract.js';
import type { NativeEvaluation } from './native-engine.js';
import { canonicalStringify } from './model/json.js';
import { sha256Text } from './runtime.js';
const esc=(v:unknown)=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export interface PlotPoint { rowId: string; x: number; y: number; xText: string; yText: string; }
export interface ChartData { state: 'ready' | 'unavailable'; sourceTableId: string; sourceContentHash: string; xLabel: string; yLabel: string; xUnit: string; yUnit: string; categories: string[]; series: Array<{columnId:string;label:string;points:Array<PlotPoint|null>}>; diagnostics:string[]; }
export function projectChart(doc: NativeDocument, chart: NativeChart, evaluation?: NativeEvaluation): ChartData {
    const table=doc.nodes.find((n):n is NativeTable=>n.id===chart.tableId&&n.kind==='table');
    const result:ChartData={state:'unavailable',sourceTableId:chart.tableId,sourceContentHash:'sha256:'+sha256Text(canonicalStringify(doc)),xLabel:chart.xLabel??'',yLabel:chart.yLabel??'',xUnit:'',yUnit:'',categories:[],series:[],diagnostics:[]};
    if (!table) { result.diagnostics.push('Source table is missing.'); return result; }
    if (!evaluation || evaluation.contentHash!==result.sourceContentHash || evaluation.state!=='evaluated' || evaluation.requestedTargetIds!==null) { result.diagnostics.push('Calculate the complete current document before plotting. Stale, failed and partial results are not drawn.'); return result; }
    const xIndex=table.columns.findIndex(c=>c.id===chart.xColumnId), ys=chart.yColumnIds.map(id=>table.columns.findIndex(c=>c.id===id));
    if (xIndex<0 || ys.some(i=>i<0)) { result.diagnostics.push('Source columns are missing.'); return result; }
    const xColumn=table.columns[xIndex]!,yColumn=table.columns[ys[0]!]!;
    result.xUnit=xColumn.canonicalUnit??'';result.yUnit=yColumn.canonicalUnit??'';
    result.xLabel=chart.xLabel??xColumn.label;result.yLabel=chart.yLabel??(ys.length===1?yColumn.label:'Value');
    const values=new Map(evaluation.values.map(v=>[v.id,v.value as any]));
    const text=(r:number,c:number):string=>{const cell=table.rows[r]!.cells[c]!;if(cell.kind==='text')return cell.text;const v=values.get(cell.valueId);return v&&'value'in v?String(v.value):'';};
    const number=(r:number,c:number,target:NativeColumn):number|null=>{
        const cell=table.rows[r]!.cells[c]!;if(cell.kind==='text') { if(cell.text) throw Error('Text cannot be used as a numeric plot coordinate.'); return null; }
        const v=values.get(cell.valueId);if(!v||!['float64','decimal','quantity'].includes(v.kind))throw Error('A chart coordinate has no numeric value.');
        const n=Number(v.value);if(!Number.isFinite(n))throw Error('Coordinate exceeds finite plotting precision.');
        if(v.kind==='quantity') { if(!target.canonicalUnit)throw Error('Y series cannot mix quantities with dimensionless values.');const converted=unit(n,String(v.canonicalUnit)).toNumber(target.canonicalUnit);if(!Number.isFinite(converted))throw Error('Non-finite coordinate after unit conversion.');return converted; }
        if(target.canonicalUnit)throw Error('Y series cannot mix dimensionless values with quantities.');
        return n;
    };
    try {
        result.categories=table.rows.map((_,r)=>text(r,xIndex));
        result.series=ys.map(c=>({columnId:table.columns[c]!.id,label:table.columns[c]!.label,points:table.rows.map((row,r)=>{
            const x=chart.chartType==='bar'?r:number(r,xIndex,xColumn),y=number(r,c,yColumn);
            if(x===null||y===null)return null;
            return {rowId:row.id,x,y,xText:text(r,xIndex),yText:text(r,c)+(table.columns[c]!.canonicalUnit?' '+table.columns[c]!.canonicalUnit:'')};
        })}));
        const count=result.series.reduce((n,s)=>n+s.points.filter(Boolean).length,0);
        if(!count) { result.diagnostics.push('There are no complete numeric point pairs.');return result; }
        const missing=result.series.reduce((n,s)=>n+s.points.filter(p=>p===null).length,0);
        if(missing)result.diagnostics.push(`${missing} missing point pair(s). Lines break at blanks; missing data is not zero.`);
        result.state='ready';return result;
    } catch(e) { result.series=[];result.diagnostics.push('Plot unavailable: '+String(e instanceof Error?e.message:e));return result; }
}
export function renderChartSvg(doc:NativeDocument, chart:NativeChart, evaluation?:NativeEvaluation):string {
    const data=projectChart(doc,chart,evaluation);
    const notice=data.diagnostics.map(d=>`<p class="chart-note">${esc(d)}</p>`).join('');
    if(data.state!=='ready')return `<figure class="chart" data-chart-id="${esc(chart.id)}"><figcaption>${esc(chart.title)}</figcaption>${notice}</figure>`;
    const points=data.series.flatMap(s=>s.points.filter((p):p is PlotPoint=>!!p));
    let minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
    if(chart.chartType==='bar'){minX=-0.5;maxX=Math.max(0.5,data.categories.length-0.5);minY=Math.min(0,minY);maxY=Math.max(0,maxY);}
    if(minX===maxX){const pad=Math.max(Math.abs(minX)*0.05,1);minX-=pad;maxX+=pad;}
    if(minY===maxY){const pad=Math.max(Math.abs(minY)*0.05,1);minY-=pad;maxY+=pad;}
    if(!Number.isFinite(maxX-minX)||!Number.isFinite(maxY-minY)||![minX,maxX,minY,maxY].every(Number.isFinite))return `<figure class="chart"><figcaption>${esc(chart.title)}</figcaption><p>Values exceed the finite chart-axis range. Exact table values are retained.</p></figure>`;
    const W=720,H=380+Math.floor((data.series.length-1)/3)*20,L=78,R=22,T=35,w=W-L-R,h=247;
    const x=(n:number)=>L+(n-minX)/(maxX-minX)*w,y=(n:number)=>T+h-(n-minY)/(maxY-minY)*h;
    const f=(n:number)=>Number(n.toFixed(3)),tick=(n:number)=>Number(n.toPrecision(4)).toString();
    const palette=['#146b75','#ae4b20','#4c50a0','#7b5b0c','#a23a76','#3e7138'];
    let axes=`<path d="M${L} ${T}V${T+h}H${L+w}" fill="none" stroke="#526979"/>`;
    for(let i=0;i<=4;i++){
        const n=minY+(maxY-minY)*i/4,py=f(y(n));axes+=`<path d="M${L} ${py}H${L+w}" stroke="#dce4e8"/><text x="${L-8}" y="${py+4}" text-anchor="end">${esc(tick(n))}</text>`;
        if(chart.chartType!=='bar'){const v=minX+(maxX-minX)*i/4;axes+=`<text x="${f(x(v))}" y="${T+h+20}" text-anchor="middle">${esc(tick(v))}</text>`;}
    }
    if(chart.chartType==='bar')data.categories.forEach((c,i)=>{if(i%Math.max(1,Math.ceil(data.categories.length/10))===0)axes+=`<text x="${f(x(i))}" y="${T+h+20}" text-anchor="middle">${esc(c.length>18?c.slice(0,15)+'…':c)}</text>`;});
    let paths='';
    data.series.forEach((s,si)=>{
        const color=palette[si%palette.length]!,dash=si%3===1?'7 3':si%3===2?'2 3':'';
        if(chart.chartType==='line'){
            let segment:PlotPoint[]=[];
            const flush=()=>{if(segment.length>1)paths+=`<polyline points="${segment.map(p=>f(x(p.x))+','+f(y(p.y))).join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="${dash}"/>`;segment=[];};
            for(const p of s.points){if(p)segment.push(p);else flush();}flush();
        }
        for(const p of s.points){if(!p)continue;
            const title=esc(`${s.label}; ${p.xText}; ${p.yText}; row ${p.rowId}`);
            if(chart.chartType==='bar'){
                const group=w/Math.max(1,data.categories.length)*0.8,bw=group/data.series.length,px=x(p.x)-group/2+si*bw,top=Math.min(y(p.y),y(0)),height=Math.abs(y(p.y)-y(0));
                paths+=`<rect x="${f(px)}" y="${f(top)}" width="${f(bw*0.92)}" height="${f(height)}" fill="${color}"><title>${title}</title></rect>`;
            }else paths+=`<circle cx="${f(x(p.x))}" cy="${f(y(p.y))}" r="3.5" fill="${color}"><title>${title}</title></circle>`;
        }
    });
    const legend=data.series.map((s,i)=>{const lx=L+(i%3)*205,ly=355+Math.floor(i/3)*20;return `<g><title>${esc(s.label)}</title><path d="M${lx} ${ly-4}h18" stroke="${palette[i%palette.length]}" stroke-width="3"/><text x="${lx+24}" y="${ly}">${esc(s.label.length>25?s.label.slice(0,22)+'…':s.label)}</text></g>`;}).join('');
    const xLabel=data.xLabel+(data.xUnit?' ['+data.xUnit+']':''),yLabel=data.yLabel+(data.yUnit?' ['+data.yUnit+']':'');
    const short=(label:string,limit:number)=>esc(label.length>limit?label.slice(0,limit-1)+'…':label);
    return `<figure class="chart" data-chart-id="${esc(chart.id)}"><figcaption>${esc(chart.title)}</figcaption><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(chart.title)}" class="data-plot"><title>${esc(chart.title)}</title><desc>${esc(chart.chartType)} plot. Source table ${esc(chart.tableId)}. Exact values are available in the source table and calculation evidence. Row order is preserved.</desc><g font-family="system-ui,sans-serif" font-size="11" fill="#243b49">${axes}${paths}<text x="${L+w/2}" y="330" text-anchor="middle"><title>${esc(xLabel)}</title>${short(xLabel,75)}</text><text transform="translate(18 ${T+h/2}) rotate(-90)" text-anchor="middle"><title>${esc(yLabel)}</title>${short(yLabel,38)}</text>${legend}</g></svg>${notice}<p class="chart-note">Source: ${esc(chart.tableId)}. Hover a point/bar for values. Plot positions use floating-point display precision.</p></figure>`;
}
