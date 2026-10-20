/** Experimental editor-neutral data and operation schemas. No document-supplied code.
 * This bounded subset is not the final SQLite file format or a general JSON Schema engine.
 */
import { toAccessJson, type JsonValue } from './access-contract.js';
import { utf8Length } from './runtime.js';
export const NATIVE_FORMAT = 'engdoc-native-draft/0.1';
export const NATIVE_EXTENDED_FORMAT = 'engdoc-native-draft/0.2';
export const NATIVE_PRESENTATION_FORMAT = 'engdoc-native-draft/0.3';
export const NATIVE_ACCESS = 'engdoc-native-edit/0.2';
export const TABLE_LIMITS = Object.freeze({ rows: 200, columns: 26, cells: 500, csvBytes: 100000, fieldChars: 20000, formulaChars: 5000, rangeCells: 100, series: 6 });
export const NATIVE_WORKER_PROTOCOL = 'engdoc-native-worker/0.1';
export const NATIVE_LIMITS = Object.freeze({ documentBytes: 2000000, requestBytes: 100000, editRequestBytes: 500000, responseBytes: 3000000,
    nodes: 500, values: 500, commands: 32, candidates: 8, historyEntries: 100, historyBytes: 8000000, pageItems: 100 });
export type NativeScalar = {
    kind: 'float64';
    value: number;
} | {
    kind: 'decimal';
    value: string;
} | {
    kind: 'quantity';
    value: number;
    canonicalUnit: string;
} | {
    kind: 'boolean';
    value: boolean;
} | {
    kind: 'string';
    value: string;
};
export type NativeInline = {
    kind: 'text';
    text: string;
    marks?: Array<'strong' | 'em' | 'code'>;
} | {
    kind: 'valueRef';
    valueId: string;
    mode: 'result' | 'symbol';
};
export type NativeCell = { kind: 'text'; text: string } | { kind: 'valueRef'; valueId: string };
export interface NativeColumn { id: string; label: string; valueType: 'text' | 'float64' | 'decimal' | 'quantity' | 'boolean'; canonicalUnit?: string; }
export interface NativeTableRow { id: string; cells: NativeCell[]; }
export interface NativeTable {
    id: string; kind: 'table'; title: string; columns: NativeColumn[]; rows: NativeTableRow[];
    source?: { name: string; sha256: string; delimiter: ',' | ';' | '\t'; header: boolean; decimalSeparator: '.' | ','; };
}
export interface NativeChart {
    id: string; kind: 'chart'; title: string; tableId: string; xColumnId: string; yColumnIds: string[];
    chartType: 'line' | 'scatter' | 'bar'; xLabel?: string; yLabel?: string;
}
export interface NativePageSetup {
    size: 'A4' | 'Letter'; orientation: 'portrait' | 'landscape'; marginMm: number;
}
export interface NativeImage {
    id: string; kind: 'image'; dataUrl: string; alt: string; caption: string;
    widthPercent: number; alignment: 'left' | 'center' | 'right';
}
export type NativeLayoutCell = { kind: 'text'; text: string } | { kind: 'empty'; label: string } | { kind: 'nodeRef'; nodeId: string };
export interface NativeLayoutTable {
    id: string; kind: 'layoutTable'; title: string; columns: Array<{ id: string; label: string; widthWeight?: number }>;
    publishPlaceholderLabels?: boolean;
    rows: Array<{ id: string; cells: NativeLayoutCell[] }>;
}
export type NativeNode = NativeLayoutTable | NativeImage | { id: string; kind: 'pageBreak' } | NativeTable | NativeChart | {
    id: string;
    kind: 'paragraph';
    content: NativeInline[];
} | {
    id: string;
    kind: 'heading';
    level: number;
    content: NativeInline[];
} | {
    id: string;
    kind: 'input' | 'calculation' | 'view';
    valueId: string;
};
interface ValueBase {
    id: string;
    ownerNodeId: string;
    label: string;
    symbol: string;
}
export interface NativeInput extends ValueBase {
    role: 'input';
    value: NativeScalar;
    constant?: boolean;
    control?: 'field' | 'slider' | 'select';
    step?: number;
    choices?: NativeScalar[];
    minimum?: number;
    maximum?: number;
}
export interface NativeCalculation extends ValueBase {
    role: 'calculation';
    valueType: 'float64' | 'decimal' | 'quantity';
    canonicalUnit?: string;
    expression: {
        source: string;
        bindings: Array<{
            token: string;
            valueId: string;
        }>;
    };
}
export type NativeValue = NativeInput | NativeCalculation;
export interface NativeDocument {
    format: typeof NATIVE_FORMAT | typeof NATIVE_EXTENDED_FORMAT | typeof NATIVE_PRESENTATION_FORMAT;
    id: string;
    title: string;
    nodes: NativeNode[];
    values: NativeValue[];
    pageSetup?: NativePageSetup;
    numericProfile?: 'float64' | 'big-decimal';
}
export type NativeCommand = { type: 'putLayoutTable'; table: NativeLayoutTable; } | { type: 'setLayoutCell'; nodeId: string; rowId: string; columnId: string; cell: NativeLayoutCell; } | { type: 'setPageSetup'; pageSetup: NativePageSetup; } | { type: 'setImage'; image: NativeImage; } | {
    type: 'setInputDefinition'; value: NativeInput;
} | {
    type: 'putTable'; table: NativeTable; values: NativeValue[];
} | {
    type: 'setTableCell'; nodeId: string; rowId: string; columnId: string; entry: string;
} | {
    type: 'insertTableRow'; nodeId: string; rowId: string; beforeRowId?: string | null;
} | {
    type: 'removeTableRow'; nodeId: string; rowId: string;
} | {
    type: 'moveTableRow'; nodeId: string; rowId: string; beforeRowId: string | null;
} | {
    type: 'insertTableColumn'; nodeId: string; column: NativeColumn;
} | {
    type: 'removeTableColumn'; nodeId: string; columnId: string;
} | {
    type: 'putChart'; chart: NativeChart;
} | {
    type: 'setText';
    nodeId: string;
    content: NativeInline[];
} | {
    type: 'setInput';
    valueId: string;
    value: NativeScalar;
} | {
    type: 'setExpression';
    valueId: string;
    source: string;
    bindings: Array<{
        token: string;
        valueId: string;
    }>;
} | {
    type: 'renameValue';
    valueId: string;
    label: string;
    symbol: string;
} | {
    type: 'insertNode';
    node: NativeNode;
    value?: NativeValue;
    beforeNodeId?: string | null;
} | {
    type: 'removeNode';
    nodeId: string;
} | {
    type: 'moveNode';
    nodeId: string;
    beforeNodeId: string | null;
};
export type NativeErrorCode = 'INVALID_ARGUMENT' | 'INVALID_DOCUMENT' | 'UNSUPPORTED_CAPABILITY' | 'NOT_FOUND' | 'FORBIDDEN' | 'REVISION_CONFLICT' | 'LIMIT_EXCEEDED' | 'INTERNAL_ERROR' | 'DRAFT_CONFIRMATION_REQUIRED' | 'NOTHING_TO_UNDO' | 'NOTHING_TO_REDO' | 'BUSY' | 'CANCELLED' | 'TIMEOUT' | 'SESSION_CLOSED';
export type NativeResult<T> = {
    ok: true;
    data: T;
} | {
    ok: false;
    error: {
        code: NativeErrorCode;
        message: string;
    };
};
export class NativeFault extends Error {
    constructor(readonly code: NativeErrorCode, message: string) { super(message); }
}
export function fault(code: NativeErrorCode, message: string): never { throw new NativeFault(code, message); }
export function nativeFailure(code: NativeErrorCode, message: string): NativeResult<never> { return { ok: false, error: { code, message } }; }
export function clone<T>(value: T): T { return toAccessJson(value) as T; }
export interface Schema {
    type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
    const?: JsonValue;
    enum?: JsonValue[];
    properties?: Record<string, Schema>;
    required?: string[];
    additionalProperties?: false;
    items?: Schema;
    oneOf?: Schema[];
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    minItems?: number;
    maxItems?: number;
    uniqueItems?: boolean;
    minimum?: number;
    maximum?: number;
    description?: string;
}
const str = (max = 20000): Schema => ({ type: 'string', maxLength: max });
const id: Schema = { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z][A-Za-z0-9_.:-]*$' };
const revision: Schema = { type: 'string', minLength: 1, maxLength: 256 };
const arr = (items: Schema, max = 100, min = 0): Schema => ({ type: 'array', items, maxItems: max, minItems: min });
const obj = (properties: Record<string, Schema>, required = Object.keys(properties)): Schema => ({ type: 'object', properties, required, additionalProperties: false });
const number: Schema = { type: 'number' };
const typed = (kind: string, value: Schema, quantity = false) => obj({ kind: { const: kind }, value, ...(quantity ? { canonicalUnit: { ...str(128), minLength: 1 } } : {}) });
export const scalarSchema: Schema = { oneOf: [typed('float64', number), typed('quantity', number, true),
        typed('decimal', { ...str(256), pattern: '^-?\\d+(\\.\\d+)?$' }), typed('boolean', { type: 'boolean' }), typed('string', str())] };
const inline: Schema = { oneOf: [obj({ kind: { const: 'text' }, text: str(), marks: { ...arr({ enum: ['strong', 'em', 'code'] }, 3), uniqueItems: true } }, ['kind', 'text']),
        obj({ kind: { const: 'valueRef' }, valueId: id, mode: { enum: ['result', 'symbol'] } })] };
const content = arr(inline, 200);
export const columnSchema = obj({ id, label: str(200), valueType: { enum: ['text', 'float64', 'decimal', 'quantity', 'boolean'] }, canonicalUnit: { ...str(128), minLength: 1 } }, ['id', 'label', 'valueType']);
const cellSchema: Schema = { oneOf: [obj({ kind: { const: 'text' }, text: str(TABLE_LIMITS.fieldChars) }), obj({ kind: { const: 'valueRef' }, valueId: id })] };
export const tableSchema = obj({ id, kind: { const: 'table' }, title: str(500), columns: arr(columnSchema, TABLE_LIMITS.columns, 1),
    rows: arr(obj({ id, cells: arr(cellSchema, TABLE_LIMITS.columns, 1) }), TABLE_LIMITS.rows),
    source: obj({ name: str(200), sha256: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' }, delimiter: { enum: [',', ';', '\t'] }, header: { type: 'boolean' }, decimalSeparator: { enum: ['.', ','] } }) }, ['id', 'kind', 'title', 'columns', 'rows']);
export const chartSchema = obj({ id, kind: { const: 'chart' }, title: str(500), tableId: id, xColumnId: id,
    yColumnIds: { ...arr(id, TABLE_LIMITS.series, 1), uniqueItems: true }, chartType: { enum: ['line', 'scatter', 'bar'] }, xLabel: str(200), yLabel: str(200) }, ['id', 'kind', 'title', 'tableId', 'xColumnId', 'yColumnIds', 'chartType']);
export const pageSetupSchema = obj({ size: { enum: ['A4', 'Letter'] }, orientation: { enum: ['portrait', 'landscape'] }, marginMm: { type: 'number', minimum: 5, maximum: 40 } });
export const imageSchema = obj({ id, kind: { const: 'image' }, dataUrl: { ...str(350000), pattern: '^data:image/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$' }, alt: str(1000), caption: str(2000), widthPercent: { type: 'number', minimum: 5, maximum: 100 }, alignment: { enum: ['left', 'center', 'right'] } });
export const layoutCellSchema: Schema = { oneOf: [obj({kind:{const:'text'},text:str()}),obj({kind:{const:'empty'},label:str(500)}),obj({kind:{const:'nodeRef'},nodeId:id})] };
export const layoutTableSchema = obj({id,kind:{const:'layoutTable'},title:str(500),columns:arr(obj({id,label:str(200),widthWeight:{type:'number',minimum:1,maximum:100}},['id','label']),TABLE_LIMITS.columns,1),rows:arr(obj({id,cells:arr(layoutCellSchema,TABLE_LIMITS.columns,1)}),TABLE_LIMITS.rows),publishPlaceholderLabels:{type:'boolean'}},['id','kind','title','columns','rows']);
export const nodeSchema: Schema = { oneOf: [obj({ id, kind: { const: 'paragraph' }, content }),
        obj({ id, kind: { const: 'heading' }, level: { type: 'integer', minimum: 1, maximum: 6 }, content }),
        obj({ id, kind: { enum: ['input', 'calculation', 'view'] }, valueId: id }), tableSchema, chartSchema, layoutTableSchema, imageSchema, obj({ id, kind: { const: 'pageBreak' } })] };
const base = { id, ownerNodeId: id, label: str(500), symbol: { ...str(128), minLength: 1 } };
const bindings = arr(obj({ token: { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z_][A-Za-z0-9_]*$' }, valueId: id }), 100);
export const valueSchema: Schema = { oneOf: [obj({ ...base, role: { const: 'input' }, value: scalarSchema, minimum: number, maximum: number, constant: { type: 'boolean' }, control: { enum: ['field', 'slider', 'select'] }, step: number, choices: { ...arr(scalarSchema, 30, 1), uniqueItems: true } }, [...Object.keys(base), 'role', 'value']),
        obj({ ...base, role: { const: 'calculation' }, valueType: { enum: ['float64', 'decimal', 'quantity'] }, canonicalUnit: { ...str(128), minLength: 1 },
            expression: obj({ source: str(10000), bindings }) }, [...Object.keys(base), 'role', 'valueType', 'expression'])] };
export const nativeDocumentSchema: Schema = obj({ format: { enum: [NATIVE_FORMAT, NATIVE_EXTENDED_FORMAT, NATIVE_PRESENTATION_FORMAT] }, id, title: str(500),
    nodes: arr(nodeSchema, NATIVE_LIMITS.nodes), values: arr(valueSchema, NATIVE_LIMITS.values), pageSetup: pageSetupSchema, numericProfile: { enum: ['float64', 'big-decimal'] } }, ['format', 'id', 'title', 'nodes', 'values']);
const nullableId: Schema = { oneOf: [id, { type: 'null' }] };
export const commandSchema: Schema = { oneOf: [
        obj({type:{const:'putLayoutTable'},table:layoutTableSchema}),
        obj({type:{const:'setLayoutCell'},nodeId:id,rowId:id,columnId:id,cell:layoutCellSchema}),
        obj({ type: { const: 'setPageSetup' }, pageSetup: pageSetupSchema }),
        obj({ type: { const: 'setImage' }, image: imageSchema }),
        obj({ type: { const: 'setInputDefinition' }, value: valueSchema.oneOf![0]! }),
        obj({ type: { const: 'putTable' }, table: tableSchema, values: arr(valueSchema, NATIVE_LIMITS.values) }),
        obj({ type: { const: 'setTableCell' }, nodeId: id, rowId: id, columnId: id, entry: str(TABLE_LIMITS.fieldChars) }),
        obj({ type: { const: 'insertTableRow' }, nodeId: id, rowId: id, beforeRowId: nullableId }, ['type', 'nodeId', 'rowId']),
        obj({ type: { const: 'removeTableRow' }, nodeId: id, rowId: id }),
        obj({ type: { const: 'moveTableRow' }, nodeId: id, rowId: id, beforeRowId: nullableId }),
        obj({ type: { const: 'insertTableColumn' }, nodeId: id, column: columnSchema }),
        obj({ type: { const: 'removeTableColumn' }, nodeId: id, columnId: id }),
        obj({ type: { const: 'putChart' }, chart: chartSchema }),obj({ type: { const: 'setText' }, nodeId: id, content }),
        obj({ type: { const: 'setInput' }, valueId: id, value: scalarSchema }), obj({ type: { const: 'setExpression' }, valueId: id, source: str(10000), bindings }),
        obj({ type: { const: 'renameValue' }, valueId: id, label: str(500), symbol: { ...str(128), minLength: 1 } }),
        obj({ type: { const: 'insertNode' }, node: nodeSchema, value: valueSchema, beforeNodeId: nullableId }, ['type', 'node']),
        obj({ type: { const: 'removeNode' }, nodeId: id }), obj({ type: { const: 'moveNode' }, nodeId: id, beforeNodeId: nullableId })] };
const pin = { baseRevision: revision };
export const nativeSchemas: Record<string, Schema> = {
    describe: obj({}), read: obj({ revision, selector: { enum: ['document', 'nodes', 'values', 'evaluation', 'tables', 'charts'] }, ids: arr(id, 100, 1),
        offset: { type: 'integer', minimum: 0, maximum: 500 }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, ['revision', 'selector']),
    proposeEdit: obj({ ...pin, commands: arr(commandSchema, NATIVE_LIMITS.commands, 1), reason: { ...str(2000), minLength: 1 } }),
    applyEdit: obj({ ...pin, candidateId: revision, allowInvalidDraft: { type: 'boolean' } }, ['baseRevision', 'candidateId']),
    discardEdit: obj({ ...pin, candidateId: revision }), undo: obj(pin), redo: obj(pin), evaluate: obj({ ...pin, targetValueIds: arr(id, 100, 1),
        overrides: arr(obj({ valueId: id, value: scalarSchema }), 100) }, ['baseRevision'])
};
function check(v: JsonValue, s: Schema, path: string): void {
    if (s.oneOf) {
        const matching = s.oneOf.filter(x => { try {
            check(v, x, path);
            return true;
        }
        catch {
            return false;
        } });
        if (matching.length !== 1)
            fault('INVALID_ARGUMENT', `${path}: does not match one supported shape.`);
        return;
    }
    if ('const' in s && v !== s.const)
        fault('INVALID_ARGUMENT', `${path}: unsupported constant.`);
    if (s.enum && !s.enum.includes(v))
        fault('INVALID_ARGUMENT', `${path}: unsupported selection.`);
    const t = s.type;
    if (t === 'object' && (!v || typeof v !== 'object' || Array.isArray(v)))
        fault('INVALID_ARGUMENT', `${path}: expected object.`);
    if (t === 'array' && !Array.isArray(v))
        fault('INVALID_ARGUMENT', `${path}: expected array.`);
    if (t === 'null' && v !== null)
        fault('INVALID_ARGUMENT', `${path}: expected null.`);
    if ((t === 'string' || t === 'number' || t === 'boolean') && typeof v !== t)
        fault('INVALID_ARGUMENT', `${path}: expected ${t}.`);
    if (t === 'integer' && (typeof v !== 'number' || !Number.isSafeInteger(v)))
        fault('INVALID_ARGUMENT', `${path}: expected integer.`);
    if (typeof v === 'string' && ((s.minLength !== undefined && v.length < s.minLength) || (s.maxLength !== undefined && v.length > s.maxLength) || (s.pattern && !new RegExp(s.pattern).test(v))))
        fault('INVALID_ARGUMENT', `${path}: invalid string length or syntax.`);
    if (typeof v === 'number' && (!Number.isFinite(v) || (s.minimum !== undefined && v < s.minimum) || (s.maximum !== undefined && v > s.maximum)))
        fault('INVALID_ARGUMENT', `${path}: number outside allowed range.`);
    if (Array.isArray(v)) {
        if ((s.minItems !== undefined && v.length < s.minItems) || (s.maxItems !== undefined && v.length > s.maxItems))
            fault('LIMIT_EXCEEDED', `${path}: item count outside allowed range.`);
        if (s.uniqueItems && new Set(v.map(x => JSON.stringify(x))).size !== v.length)
            fault('INVALID_ARGUMENT', `${path}: duplicate items.`);
        if (s.items)
            v.forEach((x, i) => check(x, s.items!, `${path}[${i}]`));
    }
    if (t === 'object') {
        const o = v as Record<string, JsonValue>;
        for (const k of s.required ?? [])
            if (!Object.hasOwn(o, k))
                fault('INVALID_ARGUMENT', `${path}.${k}: required.`);
        for (const k of Object.keys(o)) {
            if (!s.properties || !Object.hasOwn(s.properties, k))
                fault('INVALID_ARGUMENT', `${path}.${k}: unknown field.`);
            check(o[k]!, s.properties[k]!, `${path}.${k}`);
        }
    }
}
export function checked<T>(value: unknown, schema: Schema, maxBytes: number = NATIVE_LIMITS.requestBytes): T {
    let json: JsonValue;
    try {
        json = toAccessJson(value);
    }
    catch {
        fault('INVALID_ARGUMENT', 'Expected bounded finite JSON, not cycles, undefined or class instances.');
    }
    if (utf8Length(JSON.stringify(json)) > maxBytes)
        fault('LIMIT_EXCEEDED', 'JSON byte limit exceeded.');
    check(json, schema, 'request');
    return json as T;
}
export function validateNativeDocument(value: unknown): NativeDocument {
    if (value && typeof value === 'object' && 'format' in value && !([NATIVE_FORMAT, NATIVE_EXTENDED_FORMAT, NATIVE_PRESENTATION_FORMAT] as unknown[]).includes(value.format))
        fault('UNSUPPORTED_CAPABILITY', 'Unsupported native draft format; no data was changed.');
    const doc = checked<NativeDocument>(value, nativeDocumentSchema, NATIVE_LIMITS.documentBytes);
    const nodes = new Map(doc.nodes.map(n => [n.id, n])), values = new Map(doc.values.map(v => [v.id, v]));
    if (nodes.size !== doc.nodes.length || values.size !== doc.values.length)
        fault('INVALID_DOCUMENT', 'Duplicate node or value ID.');
    if (nodes.has('scope.document'))
        fault('INVALID_DOCUMENT', 'scope.document is reserved for the engine adapter.');
    if (doc.format === NATIVE_FORMAT && (doc.nodes.some(n => n.kind === 'table' || n.kind === 'chart') || doc.values.some(v => v.role === 'input' && ['constant','control','step','choices'].some(k => Object.hasOwn(v,k)))))
        fault('UNSUPPORTED_CAPABILITY', 'Tables, charts and input controls require native draft /0.2.');
    if (doc.format !== NATIVE_PRESENTATION_FORMAT && (doc.pageSetup || doc.nodes.some(n => n.kind === 'image' || n.kind === 'pageBreak' || n.kind === 'layoutTable')))
        fault('UNSUPPORTED_CAPABILITY', 'Images, object tables and page layout require native draft /0.3.');
    for (const n of doc.nodes) if (n.kind === 'image') validateImageData(n.dataUrl);
    const owners = new Set<string>();
    const cellOwners = new Map<string, string>();
    let cellCount = 0;
    for (const n of doc.nodes) if (n.kind === 'layoutTable') {
        cellCount += n.columns.length * n.rows.length;
        if (cellCount > TABLE_LIMITS.cells) fault('LIMIT_EXCEEDED', 'Document table-cell limit exceeded.');
        if(new Set(n.columns.map(c=>c.id)).size!==n.columns.length||new Set(n.rows.map(r=>r.id)).size!==n.rows.length)
            fault('INVALID_DOCUMENT','Duplicate object-table row or column identity.');
        for(const row of n.rows){
            if(row.cells.length!==n.columns.length)fault('INVALID_DOCUMENT','Object tables must be rectangular.');
            for(const cell of row.cells)if(cell.kind==='nodeRef'){
                const target=nodes.get(cell.nodeId);
                if(!target)fault('INVALID_DOCUMENT','Placed object is missing. Clear its table cell before deleting it.');
                if(target.kind==='layoutTable'||target.kind==='pageBreak')fault('INVALID_DOCUMENT','Object cells cannot contain object tables or page breaks.');
            }
        }
    }
    for (const n of doc.nodes) if (n.kind === 'table') {
        cellCount += n.columns.length * n.rows.length;
        if (cellCount > TABLE_LIMITS.cells) fault('LIMIT_EXCEEDED', 'Document table-cell limit exceeded.');
        if (new Set(n.columns.map(c => c.id)).size !== n.columns.length || new Set(n.rows.map(r => r.id)).size !== n.rows.length)
            fault('INVALID_DOCUMENT', 'Duplicate table row or column identity.');
        for (const c of n.columns) if ((c.valueType === 'quantity') !== (c.canonicalUnit !== undefined))
            fault('INVALID_DOCUMENT', 'Only quantity columns require a canonical unit.');
        for (const r of n.rows) {
            if (r.cells.length !== n.columns.length) fault('INVALID_DOCUMENT', 'Tables must be rectangular.');
            r.cells.forEach((c, i) => {
                const col = n.columns[i]!;
                if (c.kind === 'text') {
                    if (col.valueType !== 'text' && c.text !== '') fault('INVALID_DOCUMENT', 'Numeric/boolean column cells must be typed values or explicitly blank.');
                    return;
                }
                const v = values.get(c.valueId);
                if (!v || v.ownerNodeId !== n.id || cellOwners.has(v.id)) fault('INVALID_DOCUMENT', 'Every table value needs exactly one owning cell.');
                cellOwners.set(v.id, n.id);
                const type = v.role === 'input' ? v.value.kind : v.valueType;
                const unit = v.role === 'input' ? (v.value.kind === 'quantity' ? v.value.canonicalUnit : undefined) : v.canonicalUnit;
                if (type !== col.valueType || unit !== col.canonicalUnit) fault('INVALID_DOCUMENT', 'Cell type/unit must match its column.');
            });
        }
    }
    for (const v of doc.values) {
        const n = nodes.get(v.ownerNodeId);
        if (!n || (n.kind === 'table' ? cellOwners.get(v.id) !== n.id : !('valueId' in n) || n.valueId !== v.id || n.kind !== v.role))
            fault('INVALID_DOCUMENT', `Value ${v.id} needs exactly one matching owner node.`);
        if (n.kind !== 'table' && owners.has(v.ownerNodeId))
            fault('INVALID_DOCUMENT', 'This draft profile supports one output per owner.');
        owners.add(v.ownerNodeId);
        if (v.role === 'calculation') {
            if ((v.valueType === 'quantity') !== (v.canonicalUnit !== undefined))
                fault('INVALID_DOCUMENT', 'Only quantity calculations require a canonical unit.');
            const tokens = new Set<string>();
            for (const b of v.expression.bindings) {
                if (tokens.has(b.token))
                    fault('INVALID_DOCUMENT', 'Duplicate expression token.');
                tokens.add(b.token);
                if (!values.has(b.valueId))
                    fault('INVALID_DOCUMENT', `Missing binding target ${b.valueId}.`);
            }
        }
        else {
            if (v.minimum !== undefined && v.maximum !== undefined && v.minimum > v.maximum) fault('INVALID_DOCUMENT', 'Minimum exceeds maximum.');
            const numeric = ['float64', 'quantity', 'decimal'].includes(v.value.kind);
            if (v.step !== undefined && (!numeric || v.step <= 0)) fault('INVALID_DOCUMENT', 'Step must be a positive numeric increment.');
            if (v.control === 'slider' && (!['float64','quantity'].includes(v.value.kind) || v.minimum === undefined || v.maximum === undefined || v.minimum >= v.maximum)) fault('INVALID_DOCUMENT', 'Sliders need finite increasing bounds and float64/quantity values.');
            if (v.control === 'select' && !v.choices?.length) fault('INVALID_DOCUMENT', 'Select controls need explicit choices.');
            if (v.choices?.some(c => c.kind !== v.value.kind || (c.kind === 'quantity' && v.value.kind === 'quantity' && c.canonicalUnit !== v.value.canonicalUnit))) fault('INVALID_DOCUMENT', 'Input choices must have the same type and canonical unit.');
        }
    }
    for (const n of doc.nodes) {
        if ('valueId' in n) {
            const v = values.get(n.valueId);
            if (!v)
                fault('INVALID_DOCUMENT', `Missing value ${n.valueId}.`);
            if (n.kind !== 'view' && (v.ownerNodeId !== n.id || v.role !== n.kind))
                fault('INVALID_DOCUMENT', 'Input/calculation placements must own their definition. Use view for another placement.');
        }
        else if (n.kind === 'chart') {
            const t = nodes.get(n.tableId);
            if (!t || t.kind !== 'table') fault('INVALID_DOCUMENT', 'Chart source table is missing.');
            const cols = new Map(t.columns.map(c => [c.id,c]));
            if (!cols.has(n.xColumnId) || n.yColumnIds.some(id => !cols.has(id))) fault('INVALID_DOCUMENT', 'Chart column reference is missing.');
            if (n.chartType !== 'bar' && !['float64','decimal','quantity'].includes(cols.get(n.xColumnId)!.valueType)) fault('INVALID_DOCUMENT', 'Line/scatter X columns must be numeric.');
            if (n.yColumnIds.some(id => !['float64','decimal','quantity'].includes(cols.get(id)!.valueType))) fault('INVALID_DOCUMENT', 'Chart Y columns must be numeric.');
        }
        else if ('content' in n)
            for (const run of n.content)
                if (run.kind === 'valueRef' && !values.has(run.valueId))
                    fault('INVALID_DOCUMENT', `Missing inline value ${run.valueId}.`);
    }
    return doc;
}

/** Embedded raster bytes only: no external fetches, SVG handlers or document code. */
export function validateImageData(dataUrl: string): { bytes: Uint8Array; mediaType: 'image/png' | 'image/jpeg'; width: number; height: number } {
    const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
    if (!match || dataUrl.length > 350000) fault('INVALID_DOCUMENT', 'Use an embedded PNG or JPEG up to 256 KB.');
    let binary: string;
    try { binary = atob(match[2]!); } catch { fault('INVALID_DOCUMENT', 'Malformed image encoding.'); }
    if (btoa(binary) !== match[2] || binary.length > 262144) fault('INVALID_DOCUMENT', 'Noncanonical or oversized image encoding.');
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    const u16 = (i: number) => (bytes[i]! << 8) | bytes[i + 1]!;
    const u32 = (i: number) => new DataView(bytes.buffer).getUint32(i);
    let width = 0, height = 0;
    if (match[1] === 'image/png') {
        if (bytes.length < 45 || [137,80,78,71,13,10,26,10].some((v,i) => bytes[i] !== v) || u32(8) !== 13 ||
            new TextDecoder().decode(bytes.slice(12,16)) !== 'IHDR' || new TextDecoder().decode(bytes.slice(-8,-4)) !== 'IEND')
            fault('INVALID_DOCUMENT', 'Invalid PNG header or ending.');
        let position=8, imageData=false, ending=false;
        while(position<bytes.length){
            if(position+12>bytes.length)fault('INVALID_DOCUMENT','Truncated PNG chunk.');
            const length=u32(position),end=position+12+length;
            if(end>bytes.length)fault('INVALID_DOCUMENT','Truncated PNG chunk data.');
            let crc=0xffffffff;
            for(let i=position+4;i<end-4;i++){crc^=bytes[i]!;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
            if(((crc^0xffffffff)>>>0)!==u32(end-4))fault('INVALID_DOCUMENT','Invalid PNG chunk checksum.');
            const kind=new TextDecoder().decode(bytes.slice(position+4,position+8));
            if(kind==='IHDR'&&position!==8)fault('INVALID_DOCUMENT','Duplicate PNG header.');
            if(kind==='IDAT')imageData=true;
            if(kind==='IEND'){if(length!==0||end!==bytes.length)fault('INVALID_DOCUMENT','Invalid PNG ending.');ending=true;}
            position=end;
        }
        if(!imageData||!ending)fault('INVALID_DOCUMENT','PNG needs image data and an ending.');
        width = u32(16); height = u32(20);
    } else {
        if (bytes.length < 4 || u16(0) !== 0xffd8 || u16(bytes.length-2) !== 0xffd9) fault('INVALID_DOCUMENT', 'Invalid JPEG header or ending.');
        for (let i = 2; i + 4 < bytes.length;) {
            if (bytes[i++] !== 255) fault('INVALID_DOCUMENT', 'Invalid JPEG segment.');
            while (bytes[i] === 255) i++;
            const marker = bytes[i++]!;
            if (marker === 0xda || marker === 0xd9) break;
            if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
            const length = u16(i);
            if (length < 2 || i + length > bytes.length) fault('INVALID_DOCUMENT', 'Invalid JPEG segment length.');
            if ([0xc0,0xc1,0xc2].includes(marker) && length >= 8) { height = u16(i+3); width = u16(i+5); break; }
            i += length;
        }
    }
    if (!width || !height || width > 10000 || height > 10000 || width * height > 32000000)
        fault('INVALID_DOCUMENT', 'Unsupported raster dimensions (maximum 32 megapixels / 10000 pixels per side).');
    return { bytes, mediaType: match[1] as 'image/png' | 'image/jpeg', width, height };
}
