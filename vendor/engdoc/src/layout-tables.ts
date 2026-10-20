/** Mixed-content placements share existing native objects; no copied formula/image definitions. */
import type { NativeDocument, NativeLayoutTable } from './native-contract.js';
export function placedNodeIds(doc: NativeDocument): Set<string> {
    return new Set(doc.nodes.flatMap(n=>n.kind==='layoutTable'?n.rows.flatMap(row=>row.cells.flatMap(cell=>cell.kind==='nodeRef'?[cell.nodeId]:[])):[]));
}
/** Missing weights preserve the equal columns of older .3 documents. */
export function layoutColumnPercentages(table: NativeLayoutTable): number[] {
    const weights=table.columns.map(c=>c.widthWeight??1),total=weights.reduce((a,b)=>a+b,0);
    return weights.map(w=>100*w/total);
}
export function blankLayoutTable(id: string): NativeLayoutTable {
    return {id,kind:'layoutTable',title:'Object table',columns:[{id:'description',label:'Description'},{id:'content',label:'Content'}],rows:[{id:'row.1',cells:[{kind:'empty',label:'Text or document object'},{kind:'empty',label:'Formula, image or graph'}]},{id:'row.2',cells:[{kind:'empty',label:'Text or document object'},{kind:'empty',label:'Formula, image or graph'}]}]};
}
