/** Experimental editor-neutral data and operation schemas. No document-supplied code.
 * This bounded subset is not the final SQLite file format or a general JSON Schema engine.
 */
import { toAccessJson } from './access-contract.js';
import { utf8Length } from './runtime.js';
export const NATIVE_FORMAT = 'engdoc-native-draft/0.1';
export const NATIVE_ACCESS = 'engdoc-native-edit/0.1';
export const NATIVE_WORKER_PROTOCOL = 'engdoc-native-worker/0.1';
export const NATIVE_LIMITS = Object.freeze({ documentBytes: 2000000, requestBytes: 100000, responseBytes: 3000000,
    nodes: 500, values: 500, commands: 32, candidates: 8, historyEntries: 100, historyBytes: 8000000, pageItems: 100 });
export class NativeFault extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
export function fault(code, message) { throw new NativeFault(code, message); }
export function nativeFailure(code, message) { return { ok: false, error: { code, message } }; }
export function clone(value) { return toAccessJson(value); }
const str = (max = 20000) => ({ type: 'string', maxLength: max });
const id = { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z][A-Za-z0-9_.:-]*$' };
const revision = { type: 'string', minLength: 1, maxLength: 256 };
const arr = (items, max = 100, min = 0) => ({ type: 'array', items, maxItems: max, minItems: min });
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const number = { type: 'number' };
const typed = (kind, value, quantity = false) => obj({ kind: { const: kind }, value, ...(quantity ? { canonicalUnit: { ...str(128), minLength: 1 } } : {}) });
export const scalarSchema = { oneOf: [typed('float64', number), typed('quantity', number, true),
        typed('decimal', { ...str(256), pattern: '^-?\\d+(\\.\\d+)?$' }), typed('boolean', { type: 'boolean' }), typed('string', str())] };
const inline = { oneOf: [obj({ kind: { const: 'text' }, text: str(), marks: { ...arr({ enum: ['strong', 'em', 'code'] }, 3), uniqueItems: true } }, ['kind', 'text']),
        obj({ kind: { const: 'valueRef' }, valueId: id, mode: { enum: ['result', 'symbol'] } })] };
const content = arr(inline, 200);
export const nodeSchema = { oneOf: [obj({ id, kind: { const: 'paragraph' }, content }),
        obj({ id, kind: { const: 'heading' }, level: { type: 'integer', minimum: 1, maximum: 6 }, content }),
        obj({ id, kind: { enum: ['input', 'calculation', 'view'] }, valueId: id })] };
const base = { id, ownerNodeId: id, label: str(500), symbol: { ...str(128), minLength: 1 } };
const bindings = arr(obj({ token: { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z_][A-Za-z0-9_]*$' }, valueId: id }), 100);
export const valueSchema = { oneOf: [obj({ ...base, role: { const: 'input' }, value: scalarSchema, minimum: number, maximum: number }, [...Object.keys(base), 'role', 'value']),
        obj({ ...base, role: { const: 'calculation' }, valueType: { enum: ['float64', 'decimal', 'quantity'] }, canonicalUnit: { ...str(128), minLength: 1 },
            expression: obj({ source: str(10000), bindings }) }, [...Object.keys(base), 'role', 'valueType', 'expression'])] };
export const nativeDocumentSchema = obj({ format: { const: NATIVE_FORMAT }, id, title: str(500),
    nodes: arr(nodeSchema, NATIVE_LIMITS.nodes), values: arr(valueSchema, NATIVE_LIMITS.values), numericProfile: { enum: ['float64', 'big-decimal'] } }, ['format', 'id', 'title', 'nodes', 'values']);
const nullableId = { oneOf: [id, { type: 'null' }] };
export const commandSchema = { oneOf: [obj({ type: { const: 'setText' }, nodeId: id, content }),
        obj({ type: { const: 'setInput' }, valueId: id, value: scalarSchema }), obj({ type: { const: 'setExpression' }, valueId: id, source: str(10000), bindings }),
        obj({ type: { const: 'renameValue' }, valueId: id, label: str(500), symbol: { ...str(128), minLength: 1 } }),
        obj({ type: { const: 'insertNode' }, node: nodeSchema, value: valueSchema, beforeNodeId: nullableId }, ['type', 'node']),
        obj({ type: { const: 'removeNode' }, nodeId: id }), obj({ type: { const: 'moveNode' }, nodeId: id, beforeNodeId: nullableId })] };
const pin = { baseRevision: revision };
export const nativeSchemas = {
    describe: obj({}), read: obj({ revision, selector: { enum: ['document', 'nodes', 'values', 'evaluation'] }, ids: arr(id, 100, 1),
        offset: { type: 'integer', minimum: 0, maximum: 500 }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, ['revision', 'selector']),
    proposeEdit: obj({ ...pin, commands: arr(commandSchema, NATIVE_LIMITS.commands, 1), reason: { ...str(2000), minLength: 1 } }),
    applyEdit: obj({ ...pin, candidateId: revision, allowInvalidDraft: { type: 'boolean' } }, ['baseRevision', 'candidateId']),
    discardEdit: obj({ ...pin, candidateId: revision }), undo: obj(pin), redo: obj(pin), evaluate: obj({ ...pin, targetValueIds: arr(id, 100, 1),
        overrides: arr(obj({ valueId: id, value: scalarSchema }), 100) }, ['baseRevision'])
};
function check(v, s, path) {
    if (s.oneOf) {
        const matching = s.oneOf.filter(x => {
            try {
                check(v, x, path);
                return true;
            }
            catch {
                return false;
            }
        });
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
            v.forEach((x, i) => check(x, s.items, `${path}[${i}]`));
    }
    if (t === 'object') {
        const o = v;
        for (const k of s.required ?? [])
            if (!Object.hasOwn(o, k))
                fault('INVALID_ARGUMENT', `${path}.${k}: required.`);
        for (const k of Object.keys(o)) {
            if (!s.properties || !Object.hasOwn(s.properties, k))
                fault('INVALID_ARGUMENT', `${path}.${k}: unknown field.`);
            check(o[k], s.properties[k], `${path}.${k}`);
        }
    }
}
export function checked(value, schema, maxBytes = NATIVE_LIMITS.requestBytes) {
    let json;
    try {
        json = toAccessJson(value);
    }
    catch {
        fault('INVALID_ARGUMENT', 'Expected bounded finite JSON, not cycles, undefined or class instances.');
    }
    if (utf8Length(JSON.stringify(json)) > maxBytes)
        fault('LIMIT_EXCEEDED', 'JSON byte limit exceeded.');
    check(json, schema, 'request');
    return json;
}
export function validateNativeDocument(value) {
    if (value && typeof value === 'object' && 'format' in value && value.format !== NATIVE_FORMAT)
        fault('UNSUPPORTED_CAPABILITY', 'Unsupported native draft format; no data was changed.');
    const doc = checked(value, nativeDocumentSchema, NATIVE_LIMITS.documentBytes);
    const nodes = new Map(doc.nodes.map(n => [n.id, n])), values = new Map(doc.values.map(v => [v.id, v]));
    if (nodes.size !== doc.nodes.length || values.size !== doc.values.length)
        fault('INVALID_DOCUMENT', 'Duplicate node or value ID.');
    if (nodes.has('scope.document'))
        fault('INVALID_DOCUMENT', 'scope.document is reserved for the engine adapter.');
    const owners = new Set();
    for (const v of doc.values) {
        const n = nodes.get(v.ownerNodeId);
        if (!n || !('valueId' in n) || n.valueId !== v.id || n.kind !== v.role)
            fault('INVALID_DOCUMENT', `Value ${v.id} needs exactly one matching owner node.`);
        if (owners.has(v.ownerNodeId))
            fault('INVALID_DOCUMENT', 'This draft profile supports one output per owner.');
        owners.add(v.ownerNodeId);
        if (v.role === 'calculation') {
            if ((v.valueType === 'quantity') !== (v.canonicalUnit !== undefined))
                fault('INVALID_DOCUMENT', 'Only quantity calculations require a canonical unit.');
            const tokens = new Set();
            for (const b of v.expression.bindings) {
                if (tokens.has(b.token))
                    fault('INVALID_DOCUMENT', 'Duplicate expression token.');
                tokens.add(b.token);
                if (!values.has(b.valueId))
                    fault('INVALID_DOCUMENT', `Missing binding target ${b.valueId}.`);
            }
        }
        else if (v.minimum !== undefined && v.maximum !== undefined && v.minimum > v.maximum)
            fault('INVALID_DOCUMENT', 'Minimum exceeds maximum.');
    }
    for (const n of doc.nodes) {
        if ('valueId' in n) {
            const v = values.get(n.valueId);
            if (!v)
                fault('INVALID_DOCUMENT', `Missing value ${n.valueId}.`);
            if (n.kind !== 'view' && (v.ownerNodeId !== n.id || v.role !== n.kind))
                fault('INVALID_DOCUMENT', 'Input/calculation placements must own their definition. Use view for another placement.');
        }
        else
            for (const run of n.content)
                if (run.kind === 'valueRef' && !values.has(run.valueId))
                    fault('INVALID_DOCUMENT', `Missing inline value ${run.valueId}.`);
    }
    return doc;
}
