/** One in-memory authority for structured edits, proposals, history and evidence.
 * Storage, user authentication and AI exposure are host responsibilities.
 */
import { applyTabularCommand, locateTableValue } from './tabular.js';
import { NATIVE_EXTENDED_FORMAT, NATIVE_PRESENTATION_FORMAT, TABLE_LIMITS } from './native-contract.js';
import { canonicalStringify } from './model/json.js';
import { sha256Text, utf8Length } from './runtime.js';
import { toAccessJson, type JsonValue } from './access-contract.js';
import type { EngDocument } from './model/document.js';
import { NATIVE_ACCESS, NATIVE_FORMAT, NATIVE_LIMITS, nativeSchemas, nativeDocumentSchema, commandSchema, checked, clone, fault, nativeFailure, NativeFault, validateNativeDocument, type NativeDocument, type NativeValue, type NativeCommand, type NativeScalar, type NativeResult } from './native-contract.js';
import { normalizeNativeInput, compileNativeDocument, nativeDiagnostics, evaluateNativeDocument, type NativeEvaluation } from './native-engine.js';
export { NATIVE_FORMAT, NATIVE_EXTENDED_FORMAT, NATIVE_ACCESS, NATIVE_LIMITS, TABLE_LIMITS } from './native-contract.js';
export type { NativeDocument, NativeNode, NativeInline, NativeInput, NativeCalculation, NativeValue, NativeScalar, NativeCommand, NativeResult, NativeTable, NativeColumn, NativeCell, NativeChart, NativeImage, NativePageSetup, NativeLayoutTable, NativeLayoutCell } from './native-contract.js';
export type { NativeEvaluation } from './native-engine.js';
export interface NativeStatus {
    revision: string;
    contentHash: string;
    canUndo: boolean;
    canRedo: boolean;
    diagnostics: JsonValue[];
    evaluationState: string;
}
export interface NativeCommit extends NativeStatus {
    document: NativeDocument;
}
export interface NativeRead {
    revision: string;
    selector: string;
    items: JsonValue[];
    total: number;
    offset: number;
    nextOffset: number | null;
    diagnostics: JsonValue[];
    omissions: string[];
}
export interface NativeProposal {
    candidateId: string;
    baseRevision: string;
    contentHash: string;
    reason: string;
    commands: NativeCommand[];
    changes: Array<{
        type: string;
        targetId: string;
    }>;
    diagnostics: JsonValue[];
    requiresDraftConfirmation: boolean;
}
interface Candidate {
    doc: NativeDocument;
    compiled: EngDocument;
    preview: NativeProposal;
}
function instanceId(): string { return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), x => x.toString(16).padStart(2, '0')).join(''); }
export class NativeDocumentSession {
    #doc: NativeDocument;
    #compiled: EngDocument;
    #sequence = 0;
    readonly #instance = instanceId();
    #candidateSequence = 0;
    #candidates = new Map<string, Candidate>();
    #past: NativeDocument[] = [];
    #future: NativeDocument[] = [];
    #evaluation: NativeEvaluation | undefined;
    constructor(value: unknown) { this.#doc = this.#validate(value); this.#compiled = compileNativeDocument(this.#doc); }
    get revision(): string { return `native:${this.#instance}:${this.#sequence}`; }
    get contentHash(): string { return `sha256:${sha256Text(canonicalStringify(this.#doc))}`; }
    #validate(value: unknown): NativeDocument { const doc = validateNativeDocument(value); for (const v of doc.values)
        if (v.role === 'input')
            v.value = normalizeNativeInput(v, v.value); return doc; }
    #guard<T>(fn: () => T): NativeResult<T> {
        try {
            const data = clone(fn());
            if (utf8Length(JSON.stringify(data)) > NATIVE_LIMITS.responseBytes)
                fault('LIMIT_EXCEEDED', 'Response is too large; request fewer records.');
            return { ok: true, data };
        }
        catch (e) {
            return e instanceof NativeFault ? nativeFailure(e.code, e.message) : nativeFailure('INTERNAL_ERROR', 'Native session operation failed; no private stack is exposed.');
        }
    }
    #pin(revision: string) { if (revision !== this.revision)
        fault('REVISION_CONFLICT', 'This request is based on a different session revision. Read again.'); }
    #request<T>(operation: string, input: unknown): T { return checked<T>(input, nativeSchemas[operation]!, operation === 'proposeEdit' ? NATIVE_LIMITS.editRequestBytes : NATIVE_LIMITS.requestBytes); }
    #status(): NativeStatus {
        return { revision: this.revision, contentHash: this.contentHash, canUndo: this.#past.length > 0, canRedo: this.#future.length > 0,
            diagnostics: toAccessJson(nativeDiagnostics(this.#compiled)) as JsonValue[], evaluationState: this.#evaluation?.state ?? 'not-evaluated' };
    }
    #preflight(doc: NativeDocument, compiled: EngDocument): void { const bytes = utf8Length(JSON.stringify({ document: doc, diagnostics: nativeDiagnostics(compiled) })); if (bytes > NATIVE_LIMITS.responseBytes - 2048)
        fault('LIMIT_EXCEEDED', 'Commit response limit exceeded; no changes made.'); }
    #advance(doc: NativeDocument, compiled = compileNativeDocument(doc)): void { this.#doc = doc; this.#compiled = compiled; this.#sequence++; this.#evaluation = undefined; this.#candidates.clear(); }
    #trimHistory(): void {
        let bytes = this.#past.reduce((n, d) => n + utf8Length(canonicalStringify(d)), 0) + this.#future.reduce((n, d) => n + utf8Length(canonicalStringify(d)), 0);
        while (this.#past.length + this.#future.length > NATIVE_LIMITS.historyEntries || bytes > NATIVE_LIMITS.historyBytes) {
            const removed = this.#past.length ? this.#past.shift() : this.#future.shift();
            if (!removed)
                break;
            bytes -= utf8Length(canonicalStringify(removed));
        }
    }
    describe(input: unknown = {}): NativeResult<Record<string, unknown>> {
        return this.#guard(() => {
            this.#request('describe', input);
            return {
                profile: NATIVE_ACCESS, format: this.#doc.format, supportedFormats: [NATIVE_FORMAT, NATIVE_EXTENDED_FORMAT, NATIVE_PRESENTATION_FORMAT], tableLimits: TABLE_LIMITS, ...this.#status(), limits: NATIVE_LIMITS,
                concepts: { layoutTable: 'Mixed-content cells containing plain text, empty labelled placeholders or stable references to document objects. Placed objects retain one authored definition.', image: 'Embedded bounded PNG/JPEG placement with caption, alternative text, width and alignment.', pageSetup: 'Authored paper size, orientation and margins for publication.', pageBreak: 'An ordered placement starting subsequent content on a new printed page.', table: 'Ordered typed columns and stable row identities. Cells own values or explicit text/blanks.', cell: 'A stable value ID, not its current A1 address. Formulas use the ordinary value graph.', chart: 'Data-only line/scatter/bar view of named table columns. No executable handlers or saved chart results.', constant: 'Author-editable reference constant; never overridden by temporary scenarios.', node: 'Ordered authored block. Text runs carry marks or stable value references.', value: 'Typed input or calculation output, with an independent owner node ID.',
                    binding: 'Explicit local expression token to value ID; display symbols do not resolve expressions.', evaluation: 'Derived engine evidence; never an editable result.',
                    revision: 'Session-issued monotonically increasing token. Undo does not reuse a token.', contentHash: 'Logical authored content digest, not authentication or an execution proof.' },
                capabilities: { read: true, proposeEdit: true, applyEdit: true, undo: true, redo: true, evaluate: true, nativeBlocks: true, draftJsonRoundTrip: true, tables: true, cellFormulas: true, csvImport: true, charts: true, inputControls: true, images: true, objectTables: true, pageSetup: true, pageBreaks: true,
                    hardCancellation: false, sqlite: false, legacyImport: false, richTextKeystrokeHistory: false, sectionAuthorization: false, mcp: false },
                operations: Object.fromEntries(Object.entries(nativeSchemas).map(([name, s]) => [name, { inputSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema', ...s } }])),
                documentSchema: nativeDocumentSchema, commandSchema,
                tableAuthoring: {entryExamples:['=A1+B1','=SUM(A1:A3)','=AVERAGE(B1:B3)','=A1*@{input.stiffness}'],
                    identities:'Read actual table, row, column and value IDs; A1 addresses are only authoring conveniences. Value reads include a derived current location.',
                    blanks:'An empty cell is missing data, not numeric zero.',ranges:'Ranges bind an explicit fixed set of values. Inserting a row does not expand an existing range.',
                    csv:'The trusted host parses reviewed CSV with tableFromCsv, then proposes putTable. There is no automatic filesystem or URL import operation.',
                    plots:'Read chart/table definitions and full evaluation. SVG is a derived display, never another data authority.'},
                limitations: ['Experimental bounded blocks/tables profile; not full Excel, workbook or rich-text compatibility.', 'Writes are local whole-document calls. The host must restrict applyEdit exposure; document metadata grants no permission.',
                    'JSON draft export excludes history, candidates and calculation results. Opening does not evaluate.',
                    'Unknown fields/versions are rejected, not silently stripped or rewritten. No legacy import or arbitrary resource execution.',
                    'Existing engine numeric limitations remain, including decimal expression-literal precision.', 'Synchronous direct calls are not cancellable. Use NativeDocumentClient in a worker.']
            };
        });
    }
    read(input: unknown): NativeResult<NativeRead> {
        return this.#guard(() => {
            const r = this.#request<{
                revision: string;
                selector: string;
                ids?: string[];
                offset?: number;
                limit?: number;
            }>('read', input);
            this.#pin(r.revision);
            if (r.ids && new Set(r.ids).size !== r.ids.length)
                fault('INVALID_ARGUMENT', 'Duplicate selection IDs.');
            if (['document', 'evaluation'].includes(r.selector) && (r.ids !== undefined || r.offset !== undefined || r.limit !== undefined))
                fault('INVALID_ARGUMENT', 'Document/evaluation reads do not accept IDs or paging arguments.');
            let records: unknown[] = r.selector === 'document' ? [this.#doc] : r.selector === 'evaluation' ? (this.#evaluation ? [this.#evaluation] : []) : r.selector === 'nodes' ? this.#doc.nodes : r.selector === 'tables' ? this.#doc.nodes.filter(n => n.kind === 'table' || n.kind === 'layoutTable') : r.selector === 'charts' ? this.#doc.nodes.filter(n => n.kind === 'chart') : this.#doc.values;
            if (r.selector === 'values') records = this.#doc.values.map(v => { const location = locateTableValue(this.#doc,v.id); return location ? {...v,location} : v; });
            if (r.ids) {
                for (const id of r.ids)
                    if (!records.some(x => (x as {
                        id: string;
                    }).id === id))
                        fault('NOT_FOUND', `No ${r.selector} record ${id}.`);
                const ids = new Set(r.ids);
                records = records.filter(x => ids.has((x as {
                    id: string;
                }).id));
            }
            const offset = r.offset ?? 0, limit = r.limit ?? 100;
            if (offset > records.length)
                fault('INVALID_ARGUMENT', 'Offset is beyond selected records.');
            const end = Math.min(offset + limit, records.length);
            return { revision: this.revision, selector: r.selector, items: toAccessJson(records.slice(offset, end)) as JsonValue[],
                total: records.length, offset, nextOffset: end < records.length ? end : null, diagnostics: this.#status().diagnostics,
                omissions: r.selector === 'evaluation' ? ['Only the last full non-scenario evaluation in this session; no imported result claims.'] : ['Authored data includes embedded image bytes. Reading never calculates; engine AST and separate portable resources are not included.'] };
        });
    }
    proposeEdit(input: unknown): NativeResult<NativeProposal> {
        return this.#guard(() => {
            const r = this.#request<{
                baseRevision: string;
                commands: NativeCommand[];
                reason: string;
            }>('proposeEdit', input);
            this.#pin(r.baseRevision);
            if (this.#candidates.size >= NATIVE_LIMITS.candidates)
                fault('LIMIT_EXCEEDED', 'Too many pending candidates; discard a candidate or commit/reopen.');
            let doc = clone(this.#doc);
            const commands = clone(r.commands);
            const value = (id: string): NativeValue => { const v = doc.values.find(v => v.id === id); if (!v)
                fault('NOT_FOUND', `Unknown value ${id}.`); return v; };
            for (const c of commands) {
                if (applyTabularCommand(doc, c)) continue;
                switch (c.type) {
                    case 'putLayoutTable': {
                        const index=doc.nodes.findIndex(n=>n.id===c.table.id);
                        if(index>=0&&doc.nodes[index]!.kind!=='layoutTable')fault('FORBIDDEN','An object table cannot overwrite another object kind.');
                        if(index<0)doc.nodes.push(clone(c.table));else doc.nodes[index]=clone(c.table);
                        doc.format=NATIVE_PRESENTATION_FORMAT;
                        break;
                    }
                    case 'setLayoutCell': {
                        const table=doc.nodes.find(n=>n.id===c.nodeId);
                        if(!table||table.kind!=='layoutTable')fault('NOT_FOUND','Object table not found.');
                        const row=table.rows.find(r=>r.id===c.rowId),column=table.columns.findIndex(col=>col.id===c.columnId);
                        if(!row||column<0)fault('NOT_FOUND','Object cell not found.');
                        row.cells[column]=clone(c.cell);doc.format=NATIVE_PRESENTATION_FORMAT;
                        break;
                    }
                    case 'setPageSetup':
                        doc.pageSetup = clone(c.pageSetup); doc.format = NATIVE_PRESENTATION_FORMAT;
                        break;
                    case 'setImage': {
                        const index = doc.nodes.findIndex(n => n.id === c.image.id && n.kind === 'image');
                        if (index < 0) fault('NOT_FOUND', 'Unknown image placement.');
                        doc.nodes[index] = clone(c.image); doc.format = NATIVE_PRESENTATION_FORMAT;
                        break;
                    }
                    case 'setInputDefinition': {
                        const prior = value(c.value.id);
                        if (prior.role !== 'input' || prior.ownerNodeId !== c.value.ownerNodeId) fault('FORBIDDEN', 'Input settings cannot change its identity/owner or overwrite a calculation.');
                        const next = clone(c.value); next.value = normalizeNativeInput(next, next.value);
                        doc.values[doc.values.findIndex(v => v.id === next.id)] = next;
                        if (doc.format !== NATIVE_PRESENTATION_FORMAT) doc.format = NATIVE_EXTENDED_FORMAT;
                        break;
                    }
                    case 'setInput': {
                        const v = value(c.valueId);
                        if (v.role !== 'input')
                            fault('FORBIDDEN', 'Computed outputs cannot be overwritten. Change the expression or its inputs.');
                        v.value = normalizeNativeInput(v, c.value);
                        c.value = clone(v.value);
                        break;
                    }
                    case 'setExpression': {
                        const v = value(c.valueId);
                        if (v.role !== 'calculation')
                            fault('FORBIDDEN', 'setExpression requires a calculation output.');
                        v.expression = { source: c.source, bindings: clone(c.bindings) };
                        break;
                    }
                    case 'renameValue': {
                        const v = value(c.valueId);
                        v.label = c.label;
                        v.symbol = c.symbol;
                        break;
                    }
                    case 'setText': {
                        const n = doc.nodes.find(n => n.id === c.nodeId);
                        if (!n)
                            fault('NOT_FOUND', 'Unknown text node.');
                        if (!('content' in n))
                            fault('FORBIDDEN', 'setText requires a paragraph or heading.');
                        n.content = clone(c.content);
                        break;
                    }
                    case 'insertNode': {
                        if (doc.nodes.some(n => n.id === c.node.id))
                            fault('INVALID_DOCUMENT', 'Node ID already exists.');
                        const i = c.beforeNodeId == null ? doc.nodes.length : doc.nodes.findIndex(n => n.id === c.beforeNodeId);
                        if (i < 0)
                            fault('NOT_FOUND', 'Insertion anchor not found.');
                        doc.nodes.splice(i, 0, clone(c.node));
                        if (c.node.kind === 'image' || c.node.kind === 'pageBreak' || c.node.kind === 'layoutTable') doc.format = NATIVE_PRESENTATION_FORMAT;
                        if (c.value)
                            doc.values.push(clone(c.value));
                        break;
                    }
                    case 'removeNode': {
                        const i = doc.nodes.findIndex(n => n.id === c.nodeId);
                        if (i < 0)
                            fault('NOT_FOUND', 'Unknown node.');
                        doc.nodes.splice(i, 1);
                        doc.values = doc.values.filter(v => v.ownerNodeId !== c.nodeId);
                        break;
                    }
                    case 'moveNode': {
                        const i = doc.nodes.findIndex(n => n.id === c.nodeId);
                        if (i < 0)
                            fault('NOT_FOUND', 'Unknown node.');
                        if (c.beforeNodeId === c.nodeId)
                            break;
                        const n = doc.nodes.splice(i, 1)[0]!;
                        const j = c.beforeNodeId === null ? doc.nodes.length : doc.nodes.findIndex(x => x.id === c.beforeNodeId);
                        if (j < 0)
                            fault('NOT_FOUND', 'Move anchor not found.');
                        doc.nodes.splice(j, 0, n);
                        break;
                    }
                }
            }
            doc = this.#validate(doc);
            const compiled = compileNativeDocument(doc), diagnostics = toAccessJson(nativeDiagnostics(compiled)) as JsonValue[];
            const candidateId = `candidate:${this.#instance}:${++this.#candidateSequence}`;
            const preview: NativeProposal = { candidateId, baseRevision: this.revision, contentHash: `sha256:${sha256Text(canonicalStringify(doc))}`, reason: r.reason, commands,
                changes: commands.map(c => ({ type: c.type, targetId: 'valueId' in c ? c.valueId : 'nodeId' in c ? c.nodeId : c.type === 'putTable' || c.type === 'putLayoutTable' ? c.table.id : c.type === 'putChart' ? c.chart.id : c.type === 'setInputDefinition' ? c.value.id : c.type === 'setImage' ? c.image.id : c.type === 'setPageSetup' ? doc.id : c.node.id })), diagnostics,
                requiresDraftConfirmation: diagnostics.some(d => (d as {
                    severity?: string;
                }).severity === 'error') };
            if (utf8Length(JSON.stringify(preview)) > NATIVE_LIMITS.responseBytes)
                fault('LIMIT_EXCEEDED', 'Proposal response limit exceeded; candidate not retained.');
            // Keep private copies; mutating a preview can never alter the candidate to be applied.
            this.#candidates.set(candidateId, { doc, compiled, preview: clone(preview) });
            return preview;
        });
    }
    discardEdit(input: unknown): NativeResult<{
        discarded: boolean;
    }> { return this.#guard(() => { const r = this.#request<{
        baseRevision: string;
        candidateId: string;
    }>('discardEdit', input); this.#pin(r.baseRevision); return { discarded: this.#candidates.delete(r.candidateId) }; }); }
    /** Host-local commit, not authorization from a document or a model. */
    applyEdit(input: unknown): NativeResult<NativeCommit> {
        return this.#guard(() => {
            const r = this.#request<{
                baseRevision: string;
                candidateId: string;
                allowInvalidDraft?: boolean;
            }>('applyEdit', input);
            this.#pin(r.baseRevision);
            const c = this.#candidates.get(r.candidateId);
            if (!c)
                fault('NOT_FOUND', 'Candidate is absent, already consumed or invalidated.');
            if (c.preview.baseRevision !== this.revision)
                fault('REVISION_CONFLICT', 'Candidate revision is no longer current.');
            if (c.preview.requiresDraftConfirmation && r.allowInvalidDraft !== true)
                fault('DRAFT_CONFIRMATION_REQUIRED', 'Candidate has calculation errors. Explicitly confirm saving an invalid draft.');
            if (c.preview.contentHash === this.contentHash) {
                this.#candidates.delete(r.candidateId);
                return { ...this.#status(), document: clone(this.#doc) };
            }
            this.#preflight(c.doc, c.compiled);
            this.#past.push(this.#doc);
            this.#future = [];
            this.#advance(c.doc, c.compiled);
            this.#trimHistory();
            return { ...this.#status(), document: clone(this.#doc) };
        });
    }
    undo(input: unknown): NativeResult<NativeCommit> {
        return this.#guard(() => {
            const r = this.#request<{
                baseRevision: string;
            }>('undo', input);
            this.#pin(r.baseRevision);
            const doc = this.#past.at(-1);
            if (!doc)
                fault('NOTHING_TO_UNDO', 'No retained committed transaction to undo.');
            const compiled = compileNativeDocument(doc);
            this.#preflight(doc, compiled);
            this.#past.pop();
            this.#future.push(this.#doc);
            this.#advance(doc, compiled);
            this.#trimHistory();
            return { ...this.#status(), document: clone(this.#doc) };
        });
    }
    redo(input: unknown): NativeResult<NativeCommit> {
        return this.#guard(() => {
            const r = this.#request<{
                baseRevision: string;
            }>('redo', input);
            this.#pin(r.baseRevision);
            const doc = this.#future.at(-1);
            if (!doc)
                fault('NOTHING_TO_REDO', 'No retained committed transaction to redo.');
            const compiled = compileNativeDocument(doc);
            this.#preflight(doc, compiled);
            this.#future.pop();
            this.#past.push(this.#doc);
            this.#advance(doc, compiled);
            this.#trimHistory();
            return { ...this.#status(), document: clone(this.#doc) };
        });
    }
    evaluate(input: unknown): NativeResult<NativeEvaluation> {
        return this.#guard(() => {
            const r = this.#request<{
                baseRevision: string;
                targetValueIds?: string[];
                overrides?: Array<{
                    valueId: string;
                    value: NativeScalar;
                }>;
            }>('evaluate', input);
            this.#pin(r.baseRevision);
            if (r.targetValueIds && new Set(r.targetValueIds).size !== r.targetValueIds.length)
                fault('INVALID_ARGUMENT', 'Duplicate targets.');
            for (const id of r.targetValueIds ?? [])
                if (!this.#compiled.values.has(id))
                    fault('NOT_FOUND', `Unknown target ${id}.`);
            const seen = new Set<string>();
            const overrides = (r.overrides ?? []).map(o => {
                if (seen.has(o.valueId))
                    fault('INVALID_ARGUMENT', 'Duplicate overrides.');
                seen.add(o.valueId);
                const v = this.#doc.values.find(v => v.id === o.valueId);
                if (!v)
                    fault('NOT_FOUND', 'Unknown override target.');
                if (v.role !== 'input' || v.constant)
                    fault('FORBIDDEN', 'A scenario cannot overwrite a result or a fixed reference constant.');
                return { valueId: o.valueId, value: normalizeNativeInput(v, o.value) };
            });
            const result = evaluateNativeDocument(this.#compiled, this.revision, this.contentHash, r.targetValueIds, overrides);
            // Calculate response size BEFORE retaining evidence. Scenario/partial results never
            // replace the full authoritative-input view used by the document renderer.
            const detached = clone(result);
            if (utf8Length(JSON.stringify(detached)) > NATIVE_LIMITS.responseBytes)
                fault('LIMIT_EXCEEDED', 'Evaluation response limit exceeded.');
            if (!overrides.length && !r.targetValueIds)
                this.#evaluation = detached;
            return detached;
        });
    }
}
