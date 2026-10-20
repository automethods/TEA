import { utf8Length } from './runtime.js';
/** Trusted, local contract for the first (read-only) legacy document session.
 * This is deliberately a smaller profile than the proposed native editor API.
 * The same schemas below drive request validation and capability discovery.
 */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export const ACCESS_PROFILE = 'engdoc-legacy-access/0.1';
export const ACCESS_LIMITS = Object.freeze({
  maxSourceBytes: 2_000_000, maxIds: 100, maxReadItems: 100,
  maxSourceCharsPerRead: 20_000, maxResponseBytes: 1_000_000,
  maxRequestBytes: 100_000, maxJsonDepth: 64,
});

export type AccessErrorCode = 'INVALID_ARGUMENT' | 'NOT_FOUND' | 'REVISION_CONFLICT'
  | 'FORBIDDEN' | 'LIMIT_EXCEEDED' | 'INTERNAL_ERROR';
export type AccessResult<T> = { ok: true; data: T } | {
  ok: false; error: { code: AccessErrorCode; message: string; details?: JsonValue };
};
export interface ReadRequest {
  revision: string;
  selector: 'nodes' | 'values' | 'source';
  ids?: string[];
  includeDependencies?: boolean;
  offset?: number;
  limit?: number;
}
export type ScenarioValue =
  | { kind: 'float64'; value: number }
  | { kind: 'decimal'; value: string }
  | { kind: 'quantity'; value: number; canonicalUnit: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'string'; value: string };
export interface EvaluateRequest {
  baseRevision: string;
  targetValueIds?: string[];
  overrides?: Array<{ valueId: string; value: ScenarioValue }>;
}

// This private subset validator supports exactly the schema vocabulary used here,
// not arbitrary schemas embedded in a document. There is no remote $ref resolver.
interface Schema {
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean';
  description?: string;
  enum?: readonly JsonValue[];
  const?: JsonValue;
  properties?: Record<string, Schema>;
  required?: readonly string[];
  additionalProperties?: false;
  items?: Schema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  oneOf?: readonly Schema[];
}
const id: Schema = { type: 'string', minLength: 1, maxLength: 256 };
const revision: Schema = { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' };
const ids: Schema = { type: 'array', items: id, minItems: 1, maxItems: ACCESS_LIMITS.maxIds, uniqueItems: true };
const scalar = (kind: string, value: Schema, quantity = false): Schema => ({
  type: 'object', additionalProperties: false,
  required: quantity ? ['kind', 'value', 'canonicalUnit'] : ['kind', 'value'],
  properties: { kind: { const: kind }, value,
    ...(quantity ? { canonicalUnit: { type: 'string' as const, minLength: 1, maxLength: 128 } } : {}) },
});
const scenarioValue: Schema = { oneOf: [
  scalar('float64', { type: 'number' }),
  scalar('decimal', { type: 'string', maxLength: 256, pattern: '^-?\\d+(\\.\\d+)?$' }),
  scalar('quantity', { type: 'number' }, true),
  scalar('boolean', { type: 'boolean' }),
  scalar('string', { type: 'string', maxLength: 20_000 }),
] };
const readSchema: Schema = {
  type: 'object', required: ['revision', 'selector'], additionalProperties: false,
  properties: {
    revision, selector: { enum: ['nodes', 'values', 'source'] }, ids,
    includeDependencies: { type: 'boolean', description: 'Values only; arithmetic dependencies only, not source or validity links.' },
    offset: { type: 'integer', minimum: 0, maximum: ACCESS_LIMITS.maxSourceBytes },
    limit: { type: 'integer', minimum: 1, maximum: ACCESS_LIMITS.maxSourceCharsPerRead,
      description: 'At most 100 items for nodes/values; at most 20000 UTF-16 code units for source.' },
  },
};
const evaluateSchema: Schema = {
  type: 'object', required: ['baseRevision'], additionalProperties: false,
  properties: {
    baseRevision: revision, targetValueIds: ids,
    overrides: { type: 'array', maxItems: ACCESS_LIMITS.maxIds, items: {
      type: 'object', additionalProperties: false, required: ['valueId', 'value'],
      properties: { valueId: id, value: scenarioValue },
    } },
  },
};
const schemas = { read: readSchema, evaluate: evaluateSchema };

export function accessFailure<T = never>(code: AccessErrorCode, message: string, details?: JsonValue): AccessResult<T> {
  return { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } };
}

/** Detach a JSON-compatible value without coercing decimals, non-finite numbers,
 * class instances or cycles. Undefined object fields are omitted; an array's
 * undefined item is rejected. The authoritative model/AST is never returned.
 */
export function toAccessJson(value: unknown, depth = 0, ancestors = new Set<object>()): JsonValue {
  if (depth > ACCESS_LIMITS.maxJsonDepth) throw new TypeError('JSON nesting limit exceeded.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || value === null) throw new TypeError('Value is not finite JSON data.');
  if (ancestors.has(value)) throw new TypeError('Cyclic data is not supported.');
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) throw new TypeError('Non-JSON object.');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map(v => toAccessJson(v, depth + 1, ancestors));
    const out: JsonObject = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue;
      Object.defineProperty(out, key, { value: toAccessJson(item, depth + 1, ancestors), enumerable: true, writable: true, configurable: true });
    }
    return out;
  } finally { ancestors.delete(value); }
}

function check(value: JsonValue, schema: Schema, path: string): string | undefined {
  if (schema.oneOf && schema.oneOf.filter(s => check(value, s, path) === undefined).length !== 1) return `${path}: value does not match one supported typed value.`;
  if ('const' in schema && value !== schema.const) return `${path}: unexpected constant.`;
  if (schema.enum && !schema.enum.includes(value)) return `${path}: unsupported selection.`;
  const t = schema.type;
  if (t === 'object' && (value === null || typeof value !== 'object' || Array.isArray(value))) return `${path}: expected object.`;
  if (t === 'array' && !Array.isArray(value)) return `${path}: expected array.`;
  if (t === 'string' && typeof value !== 'string') return `${path}: expected string.`;
  if (t === 'boolean' && typeof value !== 'boolean') return `${path}: expected boolean.`;
  if ((t === 'number' || t === 'integer') && (typeof value !== 'number' || !Number.isFinite(value))) return `${path}: expected finite number.`;
  if (t === 'integer' && !Number.isInteger(value)) return `${path}: expected integer.`;
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) return `${path}: string is too short.`;
    if (schema.maxLength !== undefined && value.length > schema.maxLength) return `${path}: string is too long.`;
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) return `${path}: invalid string syntax.`;
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) return `${path}: below minimum.`;
    if (schema.maximum !== undefined && value > schema.maximum) return `${path}: above maximum.`;
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) return `${path}: empty selection is not allowed.`;
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return `${path}: too many items.`;
    if (schema.uniqueItems && new Set(value.map(v => JSON.stringify(v))).size !== value.length) return `${path}: duplicate items.`;
    for (let i = 0; schema.items && i < value.length; i++) { const error = check(value[i]!, schema.items, `${path}[${i}]`); if (error) return error; }
  }
  if (t === 'object') {
    const obj = value as JsonObject;
    for (const k of schema.required ?? []) if (!Object.prototype.hasOwnProperty.call(obj, k)) return `${path}.${k}: required.`;
    for (const k of Object.keys(obj)) {
      const prop = schema.properties && Object.prototype.hasOwnProperty.call(schema.properties, k) ? schema.properties[k] : undefined;
      if (!prop && schema.additionalProperties === false) return `${path}.${k}: unknown argument.`;
      if (prop) { const error = check(obj[k]!, prop, `${path}.${k}`); if (error) return error; }
    }
  }
  return undefined;
}

export function validateAccessRequest(operation: 'read' | 'evaluate', input: unknown): AccessResult<JsonObject> {
  try {
    const json = toAccessJson(input);
    if (utf8Length(JSON.stringify(json)) > ACCESS_LIMITS.maxRequestBytes) return accessFailure('LIMIT_EXCEEDED', 'Request byte limit exceeded.');
    const error = check(json, schemas[operation], 'request');
    return error ? accessFailure('INVALID_ARGUMENT', error) : { ok: true, data: json as JsonObject };
  } catch { return accessFailure('INVALID_ARGUMENT', 'Request must contain bounded finite JSON data.'); }
}

export function describeAccessContract(): JsonObject {
  return toAccessJson({
    profile: ACCESS_PROFILE,
    runtime: 'javascript', runtimes: ['node', 'browser'], access: 'whole-document-read-and-scenario',
    concepts: {
      node: 'An existing legacy directive, not yet a complete rich-text paragraph tree.',
      value: 'A typed input, constant, decision or computed output with a stable ID.',
      binding: 'Connects an executable expression token to a stable value ID.',
      evaluation: 'A new engine scenario; never adoption of an input or a persisted snapshot.',
      revision: 'SHA-256 of the exact UTF-8 source supplied to this immutable session.',
    },
    capabilities: {
      describe: true, read: true, evaluate: true,
      proposeEdit: false, applyEdit: false, nativeRichText: false,
      sqlite: false, browser: true, mcp: false, hardCancellation: false,
      sectionAuthorization: false,
    },
    limits: ACCESS_LIMITS,
    operations: {
      read: { description: 'Read detached definitions or exact source without evaluation.',
        inputSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema', ...readSchema } },
      evaluate: { description: 'Recalculate through the existing engine, with temporary input-only overrides. Whole-document build/graph errors block evaluation.',
        inputSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema', ...evaluateSchema } },
    },
    limitations: [
      'No database writes, new native format, or document edit commands in this profile.',
      'Value dependency expansion follows arithmetic edges only; decision validity is checked by the existing evaluator.',
      'This is not an authorization boundary for document sections or a computational sandbox.',
      'Existing engine restrictions and numerical limitations still apply. No hard cancellation is claimed.',
      'Source paging uses UTF-16 offsets, distinct from legacy sourceRange UTF-8 byte offsets.',
    ],
  }) as JsonObject;
}
