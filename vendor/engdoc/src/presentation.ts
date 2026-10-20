import { layoutColumnPercentages } from './layout-tables.js';
import type { NativePageSetup, NativeDocument } from './native-contract.js';
export const DEFAULT_PAGE_SETUP: NativePageSetup = { size: 'A4', orientation: 'portrait', marginMm: 18 };
export function pageDimensions(setup: NativePageSetup): { width: number; height: number } {
    const [short, long] = setup.size === 'A4' ? [210, 297] : [215.9, 279.4];
    return setup.orientation === 'portrait' ? { width: short!, height: long! } : { width: long!, height: short! };
}
/** The browser print engine owns fragmentation; long prose and tables may span pages. */
export function reportPrintCss(doc: NativeDocument): string {
    const setup = doc.pageSetup ?? DEFAULT_PAGE_SETUP, dims = pageDimensions(setup);
    const images=doc.nodes.filter(n=>n.kind==='image').map(n=>`[data-node-id="${n.id}"] .image-content{width:${n.widthPercent}%;margin:${n.alignment==='center'?'0 auto':n.alignment==='right'?'0 0 0 auto':'0 auto 0 0'}}`).join('');
    const columns=doc.nodes.filter(n=>n.kind==='layoutTable').map(n=>layoutColumnPercentages(n).map((width,i)=>`[data-table-id="${n.id}"] > table > colgroup > col:nth-child(${i+1}){width:${width}%}`).join('')).join('');
    return `${images}${columns}@page{size:${setup.size} ${setup.orientation};margin:${setup.marginMm}mm;@bottom-center{content:counter(page);font:9pt sans-serif;color:#576c7a}}
.page-break{break-before:page;height:0;margin:0;padding:0}
.placed-image{break-inside:avoid;margin:20px 0}.placed-image img{display:block;width:100%;height:auto;max-height:${dims.height - 2 * setup.marginMm - 20}mm;object-fit:contain}.placed-image figcaption{white-space:pre-wrap;font-size:.9em}
@media print{html,body{background:white}body{margin:0;padding:0;max-width:none;font-size:11pt}main,section,.data-table{overflow:visible;break-inside:auto}table{table-layout:fixed}thead{display:table-header-group}tr,.chart,.placed-image{break-inside:avoid}h1,h2,h3,h4,h5,h6{break-after:avoid}p{orphans:3;widows:3}details{display:none}.diagnostics pre{max-height:none}footer{break-inside:auto}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;
}
