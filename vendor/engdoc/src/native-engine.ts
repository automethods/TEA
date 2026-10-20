/** Adapter from native authored objects to the EXISTING graph/evaluator.
 * No Markdown round trip, implicit symbol lookup, eval(), or second arithmetic engine.
 */
import { locateTableValue } from './tabular.js';
import { bignumber } from 'mathjs';
import { mathjsSafeAdapter, DEFAULT_ENGINE_POLICY, ADAPTER_PROFILE_ID } from './engine/mathjs-safe.js';
import { buildValueGraph } from './eval/graph.js';
import { evaluateDocument } from './eval/evaluate.js';
import type { EngDocument, ValueBinding } from './model/document.js';
import type { Diagnostic } from './model/diagnostics.js';
import type { TypedValue } from './model/values.js';
import { canonicalStringify } from './model/json.js';
import { toAccessJson, type JsonValue } from './access-contract.js';
import { fault, clone, type NativeDocument, type NativeInput, type NativeScalar } from './native-contract.js';
export function normalizeNativeInput(input: NativeInput, submitted: NativeScalar): NativeScalar {
    if (submitted.kind !== input.value.kind)
        fault('INVALID_ARGUMENT', `Input ${input.id} requires ${input.value.kind}.`);
    let result = clone(submitted);
    if (submitted.kind === 'quantity' && input.value.kind === 'quantity') {
        const parsed = mathjsSafeAdapter.parse('x');
        if (!parsed.tree)
            fault('INTERNAL_ERROR', 'Unit validation setup failed.');
        const policy = { ...DEFAULT_ENGINE_POLICY };
        const compiled = mathjsSafeAdapter.compile(parsed.tree, policy);
        if (!compiled.ok)
            fault('INTERNAL_ERROR', 'Unit validation setup failed.');
        const out = mathjsSafeAdapter.evaluate(compiled.value, new Map([['x', submitted]]), policy, input.value.canonicalUnit);
        if (!out.ok || out.value.kind !== 'quantity' || typeof out.value.value !== 'number' || !Number.isFinite(out.value.value))
            fault('INVALID_ARGUMENT', 'Invalid or incompatible quantity unit.');
        // Retain the authored canonical unit, never merely relabel a magnitude.
        result = { kind: 'quantity', value: out.value.value, canonicalUnit: input.value.canonicalUnit };
    }
    if (result.kind === 'decimal' || result.kind === 'float64' || result.kind === 'quantity') {
        const n = bignumber(String(result.value));
        if (!n.isFinite() || (input.minimum !== undefined && n.lessThan(bignumber(String(input.minimum)))) ||
            (input.maximum !== undefined && n.greaterThan(bignumber(String(input.maximum)))))
            fault('INVALID_ARGUMENT', `Input ${input.id} is outside its declared bounds.`);
    }
    else if (input.minimum !== undefined || input.maximum !== undefined)
        fault('INVALID_DOCUMENT', 'Numeric bounds cannot be attached to text or boolean inputs.');
    if (input.choices && !input.choices.some(c => canonicalStringify(c) === canonicalStringify(result)))
        fault('INVALID_ARGUMENT', `Input ${input.id} must use one of its declared choices.`);
    return result;
}
/** Build a bounded, already ID-bound model. Source locations are absent in native
 * data; zero ranges exist solely to satisfy the legacy internal interface. */
export function compileNativeDocument(native: NativeDocument): EngDocument {
    const doc: EngDocument = { frontmatter: { sdocProfile: 'calc-core/0.1', calculationEngine: ADAPTER_PROFILE_ID,
            numericProfile: native.numericProfile ?? 'float64' }, nodes: [], byId: new Map(), values: new Map(),
        scopes: new Map([['scope.document', { id: 'scope.document', parentId: null, role: 'document' }]]),
        symbolsByScope: new Map([['scope.document', new Map()]]), calculationByOutput: new Map(), diagnostics: [] };
    const range = { startByte: 0, endByte: 0, startLine: 0, endLine: 0 };
    for (const n of native.nodes) {
        const node = { id: n.id, kind: n.kind, role: n.kind, sourceRange: range, props: {} as Record<string, unknown> };
        doc.nodes.push(node);
        doc.byId.set(n.id, node);
    }
    for (const v of native.values) {
        const nativeOwner = native.nodes.find(n => n.id === v.ownerNodeId)!;
        let owner = doc.byId.get(v.ownerNodeId)!;
        if (nativeOwner.kind === 'table') {
            // Internal-only slash IDs cannot collide with authored IDs. Each cell has
            // its own engine owner/trace, while storage retains its table owner.
            const engineId = 'native-cell/' + v.id;
            owner = { id: engineId, kind: v.role, role: v.role, sourceRange: range, props: {} };
            doc.nodes.push(owner); doc.byId.set(engineId, owner);
        }
        const binding: ValueBinding = { valueId: v.id, ownerNodeId: owner.id, symbol: locateTableValue(native,v.id)?.address ?? v.symbol, scopeId: 'scope.document',
            valueType: v.role === 'input' ? v.value.kind : v.valueType };
        if (v.role === 'input') {
            binding.literal = clone(v.value);
            if (v.value.kind === 'quantity')
                binding.canonicalUnit = v.value.canonicalUnit;
            owner.props = { required: true, ...(v.minimum !== undefined ? { minimum: v.minimum } : {}), ...(v.maximum !== undefined ? { maximum: v.maximum } : {}) };
        }
        else {
            if (v.canonicalUnit !== undefined)
                binding.canonicalUnit = v.canonicalUnit;
            owner.outputValueId = v.id;
            owner.props = { purpose: locateTableValue(native,v.id)?.label ?? v.label };
            doc.calculationByOutput.set(v.id, owner.id);
        }
        doc.values.set(v.id, binding);
    }
    const policy = { ...DEFAULT_ENGINE_POLICY, numericProfile: native.numericProfile ?? 'float64' };
    for (const v of native.values) {
        if (v.role !== 'calculation')
            continue;
        const engineOwnerId = doc.values.get(v.id)!.ownerNodeId;
        const parsed = mathjsSafeAdapter.parse(v.expression.source);
        doc.diagnostics.push(...parsed.diagnostics.map(d => ({ ...d, nodeId: engineOwnerId })));
        if (!parsed.tree)
            continue;
        const diagnostics = mathjsSafeAdapter.validate(parsed.tree, policy);
        doc.diagnostics.push(...diagnostics.map(d => ({ ...d, nodeId: engineOwnerId })));
        // Do not walk denied or over-limit trees with a less restrictive walker.
        if (diagnostics.some(d => d.severity === 'error'))
            continue;
        const ids = new Map<string, string>(), first = new Map<string, string>();
        const walk = (node: any, path: string): void => {
            const id = path ? `${v.id}#expr.${path}` : `${v.id}#expr`;
            ids.set(path, id);
            if (node.type === 'SymbolNode' && !first.has(node.name))
                first.set(node.name, id);
            const children = node.type === 'ParenthesisNode' ? [node.content] : (node.type === 'OperatorNode' || node.type === 'FunctionNode' ? node.args : []);
            (children ?? []).forEach((child: unknown, i: number) => walk(child, path ? `${path}.${i}` : String(i)));
        };
        walk(parsed.tree, '');
        const refs = new Map(v.expression.bindings.map(b => [b.token, b.valueId]));
        const symbols = mathjsSafeAdapter.collectSymbols(parsed.tree), symbolRefs = [];
        for (const token of symbols) {
            const target = refs.get(token);
            if (!target)
                doc.diagnostics.push({ code: 'UNRESOLVED_SYMBOL', severity: 'error', nodeId: engineOwnerId, message: `Expression token ${token} needs an explicit value-ID binding.` });
            else
                symbolRefs.push({ token, targetValueId: target, expressionNodeId: first.get(token) ?? `${v.id}#expr` });
        }
        for (const token of refs.keys())
            if (!symbols.includes(token))
                doc.diagnostics.push({ code: 'UNRESOLVED_REF', severity: 'error', nodeId: engineOwnerId, message: `Binding token ${token} is not used in this expression.` });
        doc.values.get(v.id)!.expression = { source: v.expression.source, tree: parsed.tree, rootExpressionId: `${v.id}#expr`, symbolRefs, expressionIdsByPath: ids };
    }
    return doc;
}
export function nativeDiagnostics(doc: EngDocument): Diagnostic[] { return [...doc.diagnostics, ...buildValueGraph(doc).diagnostics]; }
export interface NativeEvaluation {
    revision: string;
    contentHash: string;
    state: 'evaluated' | 'failed' | 'blocked';
    persisted: false;
    scenario: boolean;
    requestedTargetIds: string[] | null;
    normalizedOverrides: Array<{
        valueId: string;
        value: NativeScalar;
    }>;
    values: Array<{
        id: string;
        value: JsonValue;
    }>;
    traces: JsonValue[];
    diagnostics: JsonValue[];
}
export function evaluateNativeDocument(doc: EngDocument, revision: string, contentHash: string, targets: string[] | undefined, overrides: Array<{
    valueId: string;
    value: NativeScalar;
}>): NativeEvaluation {
    const graph = buildValueGraph(doc), diagnostics = [...doc.diagnostics, ...graph.diagnostics];
    const envelope = { revision, contentHash, persisted: false as const, scenario: overrides.length > 0,
        requestedTargetIds: targets ?? null, normalizedOverrides: clone(overrides) };
    if (diagnostics.some(d => d.severity === 'error'))
        return { ...envelope, state: 'blocked', values: [], traces: [], diagnostics: toAccessJson(diagnostics) as JsonValue[] };
    const snap = evaluateDocument(doc, graph, { ...(targets ? { targetValueIds: targets } : {}), ...(overrides.length ? { overrides: new Map(overrides.map(o => [o.valueId, o.value])) } : {}) });
    diagnostics.push(...snap.diagnostics);
    const valid = (v: TypedValue): boolean => {
        if (v.kind === 'float64' || v.kind === 'quantity')
            return typeof v.value === 'number' ? Number.isFinite(v.value) : v.kind === 'quantity' && typeof v.value === 'string' && bignumber(v.value).isFinite();
        return v.kind !== 'decimal' || (typeof v.value === 'string' && bignumber(v.value).isFinite());
    };
    if ([...snap.values.values()].some(v => !valid(v))) {
        diagnostics.push({ code: 'TYPE_MISMATCH', severity: 'error', message: 'Non-finite computed value.' });
        return { ...envelope, state: 'failed', values: [], traces: [], diagnostics: toAccessJson(diagnostics) as JsonValue[] };
    }
    const failed = diagnostics.some(d => d.severity === 'error') || [...snap.values.values()].some(v => v.kind === 'error' || v.kind === 'undefined');
    return { ...envelope, state: failed ? 'failed' : 'evaluated', values: [...snap.values].map(([id, value]) => ({ id, value: toAccessJson(value) })),
        traces: [...snap.traces.values()].map(t => toAccessJson(t)), diagnostics: toAccessJson(diagnostics) as JsonValue[] };
}
