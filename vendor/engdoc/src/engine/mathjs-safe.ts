/**
 * `mathjs-safe/0.1` — the locked-down math.js expression adapter (spec §19-20).
 *
 * Design notes (see NOTES.md "Task 3" for the fuller version):
 *
 * - Node types are validated by their `.type` string, never `instanceof`.
 *   Each math.js instance returned by `create()` mints its own Node classes,
 *   so `instanceof` checks captured against one instance would silently fail
 *   against trees produced by another instance. `.type` is stable across
 *   instances.
 * - `parse()` has no `EnginePolicy` parameter (fixed by the adapter
 *   interface), so it always parses through a single float64-configured
 *   instance. Numeric literals therefore always start out as JS `number`.
 *   For the `big-decimal` profile, `compile()` clones the tree and promotes
 *   every `ConstantNode` number to a `BigNumber` (via `value.toString()`,
 *   which round-trips exactly for any literal that fits float64 precision —
 *   the common case, and exactly what the required `0.1 + 0.2` test
 *   exercises). A literal typed with more significant digits than float64
 *   can hold will already have been rounded by the time `parse()` sees it;
 *   this is an inherent limitation of the fixed (source-less) `compile()`
 *   signature, not something `compile()` can recover.
 * - `maxExpressionLength` is enforced in `compile()` against the
 *   reconstructed text of the parsed tree (`toText(tree)`), since
 *   `compile()` is the first point where both a tree and a policy are
 *   available together (`parse()` has no policy; `validate()` has no source
 *   text). A fixed, policy-independent character ceiling
 *   (`HARD_SOURCE_LENGTH_CEILING`) is applied in `parse()` itself as a
 *   defensive backstop against pathological input.
 * - `CompiledExpression` is a brand-only type (no real fields); the actual
 *   compiled closure lives in a module-private `WeakMap` keyed by the
 *   returned handle object. This means a forged object cannot be evaluated
 *   even via `as unknown as CompiledExpression` — the WeakMap lookup simply
 *   misses, and `evaluate()` returns an `EVAL_ERROR` diagnostic rather than
 *   throwing.
 */

import { create, all } from 'mathjs';
import type {
  BigNumber as MathBigNumber,
  FactoryFunctionMap,
  MathJsInstance,
  MathNode,
  Unit as MathUnit,
} from 'mathjs';
import type { Diagnostic } from '../model/diagnostics.js';
import type { TypedValue } from '../model/values.js';
import { canonicalStringify } from '../model/json.js';
import { utf8ByteLength } from '../model/ranges.js';
import { sha256Text } from '../runtime.js';

// `all`'s inferred type from mathjs's typings is broader than
// `FactoryFunctionMap` (the type `create()` actually requires); it is the
// same runtime value mathjs's own docs pass to `create()`.
const allFactories = all as FactoryFunctionMap;

export const ADAPTER_PROFILE_ID = 'mathjs-safe/0.1' as const;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type NumericProfile = 'float64' | 'big-decimal';

/**
 * A mutable, caller-owned budget shared across every `evaluate()` call in one
 * document evaluation pass. `evaluate()` decrements `remainingSteps` and
 * checks `deadlineMs` before running each expression; once either is
 * exhausted, every subsequent `evaluate()` call using this budget object
 * returns `LIMIT_EXCEEDED` without running the expression. Construct one per
 * document evaluation pass (not per expression) and thread the same instance
 * through the policy passed to each `evaluate()` call.
 */
export interface EvaluationBudget {
  remainingSteps: number;
  /** Absolute deadline, `Date.now()`-comparable. */
  deadlineMs: number;
}

export interface EnginePolicy {
  numericProfile: NumericProfile;
  /** decimal.js working precision (significant digits) for the `big-decimal` profile. Ignored for `float64`. */
  precision: number;
  /** Fixed at `half-even` per spec §20.3; kept as a field so it is part of the fingerprint and future-extensible. */
  roundingMode: 'half-even';
  displaySignificantDigits: number;
  /** Reconstructed-source character ceiling, checked in `compile()`. */
  maxExpressionLength: number;
  maxAstDepth: number;
  maxAstNodeCount: number;
  maxSymbolCount: number;
  maxFunctionCallCount: number;
  /** Max significant digits in a single numeric literal's mantissa. */
  maxNumericLiteralDigits: number;
  /** Max absolute magnitude of a numeric literal's exponent. */
  maxNumericLiteralExponent: number;
  maxResultSerializationBytes: number;
  maxEvaluationTimeMsPerExpression: number;
  /** Documents the intended total step count for one document evaluation pass; enforced via `budget`. */
  maxDocumentEvaluationSteps: number;
  /** Optional shared cross-expression budget for one document evaluation pass. See `EvaluationBudget`. */
  budget?: EvaluationBudget;
}

/** Conservative reference defaults; copy and override per-document in Task 6. */
export const DEFAULT_ENGINE_POLICY: EnginePolicy = {
  numericProfile: 'float64',
  precision: 64,
  roundingMode: 'half-even',
  displaySignificantDigits: 6,
  maxExpressionLength: 2_000,
  maxAstDepth: 64,
  maxAstNodeCount: 500,
  maxSymbolCount: 100,
  maxFunctionCallCount: 100,
  maxNumericLiteralDigits: 30,
  maxNumericLiteralExponent: 300,
  maxResultSerializationBytes: 4_000,
  maxEvaluationTimeMsPerExpression: 1_000,
  maxDocumentEvaluationSteps: 10_000,
};

export interface EngineParseResult {
  tree: MathNode | undefined;
  diagnostics: Diagnostic[];
}

/**
 * Opaque, unforgeable handle produced only by this adapter's `compile()`.
 * The type carries no real data (see file header); the payload lives in a
 * module-private `WeakMap`.
 */
declare const COMPILED_BRAND: unique symbol;
export interface CompiledExpression {
  readonly [COMPILED_BRAND]: true;
}

export type CompiledExpressionResult =
  | { ok: true; value: CompiledExpression }
  | { ok: false; diagnostics: Diagnostic[] };

export type EvaluationResult =
  | { ok: true; value: TypedValue }
  | { ok: false; diagnostics: Diagnostic[] };

export interface CalculationEngineAdapter {
  readonly profileId: typeof ADAPTER_PROFILE_ID;
  parse(source: string): EngineParseResult;
  validate(tree: unknown, policy: EnginePolicy): Diagnostic[];
  collectSymbols(tree: unknown): string[];
  compile(tree: unknown, policy: EnginePolicy): CompiledExpressionResult;
  evaluate(
    compiled: CompiledExpression,
    scope: ReadonlyMap<string, TypedValue>,
    policy: EnginePolicy,
    expectedUnit?: string,
  ): EvaluationResult;
  toTex(tree: unknown): string;
  toText(tree: unknown): string;
  fingerprint(policy: EnginePolicy): string;
}

// ---------------------------------------------------------------------------
// math.js instances (independent per numeric profile, per §20.2's "record
// math.js version, precision, rounding mode, ... in the fingerprint")
// ---------------------------------------------------------------------------

const float64Instance: MathJsInstance = create(allFactories, { number: 'number' });

/**
 * Bounded LRU cache of big-decimal instances, keyed by `precision`.
 *
 * `precision` comes from `EnginePolicy`, which Task 6 constructs per
 * document — if it is ever influenced by untrusted/document-controlled
 * input, an unbounded cache keyed by every distinct precision value seen
 * would be a memory-exhaustion vector (each entry is a full math.js
 * instance). Capped at `MAX_BIG_DECIMAL_INSTANCE_CACHE_SIZE` entries,
 * evicting the least-recently-used precision once the cap is exceeded (`Map`
 * iteration order is used as the recency order: `get` re-inserts the hit key
 * to mark it most-recently-used, so the least-recently-used key is always
 * first).
 */
const MAX_BIG_DECIMAL_INSTANCE_CACHE_SIZE = 8;
const bigDecimalInstances = new Map<number, MathJsInstance>();

function getMathInstance(policy: EnginePolicy): MathJsInstance {
  if (policy.numericProfile === 'float64') {
    return float64Instance;
  }
  const cached = bigDecimalInstances.get(policy.precision);
  if (cached) {
    bigDecimalInstances.delete(policy.precision);
    bigDecimalInstances.set(policy.precision, cached);
    return cached;
  }
  const instance = create(allFactories, { number: 'BigNumber', precision: policy.precision });
  bigDecimalInstances.set(policy.precision, instance);
  if (bigDecimalInstances.size > MAX_BIG_DECIMAL_INSTANCE_CACHE_SIZE) {
    const oldestKey = bigDecimalInstances.keys().next().value;
    if (oldestKey !== undefined) {
      bigDecimalInstances.delete(oldestKey);
    }
  }
  return instance;
}

/**
 * Exposed only so tests can verify the bounded-cache fix without weakening
 * the module-private `WeakMap`/`Map` encapsulation elsewhere in this file.
 * Not part of `CalculationEngineAdapter`; do not use from application code.
 */
export const __testHooks = {
  bigDecimalInstanceCacheSize: (): number => bigDecimalInstances.size,
  maxBigDecimalInstanceCacheSize: MAX_BIG_DECIMAL_INSTANCE_CACHE_SIZE,
};

// ---------------------------------------------------------------------------
// Allowlists (spec §20.1, §20.2)
// ---------------------------------------------------------------------------

/** §20.2, implemented verbatim. `sum/mean/size/transpose/dot/cross` are
 * unreachable in this MVP because array/matrix construction (`ArrayNode`) is
 * denied at the AST level, so there is no way to construct an array argument
 * for them — they are still listed and allowlisted for spec completeness and
 * so a future MVP revision that permits `ArrayNode` does not also need to
 * revisit this set. */
const ALLOWED_FUNCTIONS: ReadonlySet<string> = new Set([
  'abs', 'min', 'max',
  'sqrt', 'cbrt',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'exp', 'log', 'log10',
  'round', 'floor', 'ceil',
  'sum', 'mean',
  'size', 'transpose', 'dot', 'cross',
]);

const ALLOWED_NODE_TYPES: ReadonlySet<string> = new Set([
  'ConstantNode', 'SymbolNode', 'OperatorNode', 'ParenthesisNode', 'FunctionNode',
]);

// ---------------------------------------------------------------------------
// Compiled-expression side table (see brand notes in file header)
// ---------------------------------------------------------------------------

interface CompiledInternal {
  evalFn: { evaluate(scope: unknown): unknown };
  mathInstance: MathJsInstance;
}

const compiledRegistry = new WeakMap<object, CompiledInternal>();

// ---------------------------------------------------------------------------
// parse()
// ---------------------------------------------------------------------------

/**
 * Defensive backstop independent of any `EnginePolicy` — `parse(source)` has
 * no policy parameter (fixed by `CalculationEngineAdapter`), so this is the
 * *only* raw-source-length bound applied before parsing, regardless of what
 * `policy.maxExpressionLength` a caller intends to use later in `compile()`.
 *
 * `compile()` separately checks `toText(tree).length` against
 * `policy.maxExpressionLength`, but that check runs on the AST-reconstructed
 * text — whitespace and other syntax that collapses away during parsing
 * (e.g. thousands of leading spaces before a single digit) is invisible to
 * it. This constant is therefore kept low enough (a small multiple of a
 * realistic engineering-expression length, not "generous for pathological
 * input") to be a meaningful bound on its own: a policy with
 * `maxExpressionLength` smaller than this ceiling gets exact enforcement of
 * AST complexity via `compile()`, plus this raw-length ceiling as a floor
 * that no source can exceed regardless of policy; a policy that somehow
 * wanted to *allow* raw sources longer than this constant is out of scope
 * for a single-expression cell in an engineering worksheet and is not
 * supported.
 */
const HARD_SOURCE_LENGTH_CEILING = 4_000;

function parse(source: string): EngineParseResult {
  if (source.length > HARD_SOURCE_LENGTH_CEILING) {
    return {
      tree: undefined,
      diagnostics: [
        {
          code: 'LIMIT_EXCEEDED',
          severity: 'error',
          message: `Expression source exceeds the hard ${HARD_SOURCE_LENGTH_CEILING}-character parse ceiling`,
          details: { limit: 'hardSourceLengthCeiling', length: source.length },
        },
      ],
    };
  }
  try {
    const tree = float64Instance.parse(source);
    return { tree, diagnostics: [] };
  } catch (err) {
    return { tree: undefined, diagnostics: [evalErrorDiagnostic(err)] };
  }
}

// ---------------------------------------------------------------------------
// Shared node helpers
// ---------------------------------------------------------------------------

function isMathNode(node: unknown): node is { type: string } {
  return typeof node === 'object' && node !== null && typeof (node as { type?: unknown }).type === 'string';
}

function evalErrorDiagnostic(err: unknown): Diagnostic {
  return {
    code: 'EVAL_ERROR',
    severity: 'error',
    message: err instanceof Error ? err.message : String(err),
  };
}

// ---------------------------------------------------------------------------
// collectSymbols()
// ---------------------------------------------------------------------------

function collectSymbols(tree: unknown): string[] {
  const symbols = new Set<string>();
  collectSymbolsInto(tree, symbols);
  return [...symbols].sort();
}

function collectSymbolsInto(node: unknown, into: Set<string>): void {
  if (!isMathNode(node)) {
    return;
  }
  switch (node.type) {
    case 'SymbolNode':
      into.add((node as unknown as { name: string }).name);
      return;
    case 'OperatorNode':
    case 'FunctionNode':
      // FunctionNode: only its arguments carry real symbols; `.fn`'s own
      // SymbolNode is the (allowlist-checked) function name, not a scope
      // symbol, so it is deliberately not visited here.
      for (const arg of (node as unknown as { args?: unknown[] }).args ?? []) {
        collectSymbolsInto(arg, into);
      }
      return;
    case 'ParenthesisNode':
      collectSymbolsInto((node as unknown as { content: unknown }).content, into);
      return;
    default:
      return;
  }
}

// ---------------------------------------------------------------------------
// validate()
// ---------------------------------------------------------------------------

interface WalkState {
  diagnostics: Diagnostic[];
  symbols: Set<string>;
  nodeCount: number;
  functionCallCount: number;
  policy: EnginePolicy;
  mathInstance: MathJsInstance;
  nodeLimitHit: boolean;
  depthLimitHit: boolean;
  symbolLimitHit: boolean;
  functionLimitHit: boolean;
}

function validate(tree: unknown, policy: EnginePolicy): Diagnostic[] {
  const state: WalkState = {
    diagnostics: [],
    symbols: new Set(),
    nodeCount: 0,
    functionCallCount: 0,
    policy,
    mathInstance: getMathInstance(policy),
    nodeLimitHit: false,
    depthLimitHit: false,
    symbolLimitHit: false,
    functionLimitHit: false,
  };
  walk(tree, 1, state);
  return state.diagnostics;
}

function walk(node: unknown, depth: number, state: WalkState): void {
  state.nodeCount += 1;
  if (state.nodeCount > state.policy.maxAstNodeCount) {
    if (!state.nodeLimitHit) {
      state.nodeLimitHit = true;
      state.diagnostics.push(limitExceeded('maxAstNodeCount', 'Expression AST node count exceeds the configured limit', {
        limit: state.policy.maxAstNodeCount,
      }));
    }
    return;
  }
  if (depth > state.policy.maxAstDepth) {
    if (!state.depthLimitHit) {
      state.depthLimitHit = true;
      state.diagnostics.push(limitExceeded('maxAstDepth', 'Expression AST depth exceeds the configured limit', {
        limit: state.policy.maxAstDepth,
      }));
    }
    return;
  }
  if (!isMathNode(node)) {
    state.diagnostics.push(nodeDenied('unknown', node));
    return;
  }

  const { type } = node;
  if (!ALLOWED_NODE_TYPES.has(type)) {
    state.diagnostics.push(nodeDenied(type, node));
    return;
  }

  switch (type) {
    case 'ConstantNode': {
      checkNumericLiteral((node as unknown as { value: unknown }).value, state);
      return;
    }
    case 'SymbolNode': {
      const name = (node as unknown as { name: string }).name;
      state.symbols.add(name);
      if (state.symbols.size > state.policy.maxSymbolCount && !state.symbolLimitHit) {
        state.symbolLimitHit = true;
        state.diagnostics.push(limitExceeded('maxSymbolCount', 'Distinct symbol count exceeds the configured limit', {
          limit: state.policy.maxSymbolCount,
        }));
      }
      return;
    }
    case 'OperatorNode': {
      for (const arg of (node as unknown as { args?: unknown[] }).args ?? []) {
        walk(arg, depth + 1, state);
      }
      return;
    }
    case 'ParenthesisNode': {
      walk((node as unknown as { content: unknown }).content, depth + 1, state);
      return;
    }
    case 'FunctionNode': {
      state.functionCallCount += 1;
      if (state.functionCallCount > state.policy.maxFunctionCallCount && !state.functionLimitHit) {
        state.functionLimitHit = true;
        state.diagnostics.push(limitExceeded('maxFunctionCallCount', 'Function-call count exceeds the configured limit', {
          limit: state.policy.maxFunctionCallCount,
        }));
      }
      const fnNode = (node as unknown as { fn: unknown }).fn;
      if (!isMathNode(fnNode) || fnNode.type !== 'SymbolNode') {
        state.diagnostics.push(functionDenied('<indirect>', 'Function calls must name an allowlisted function directly'));
      } else {
        const fnName = (fnNode as unknown as { name: string }).name;
        if (!ALLOWED_FUNCTIONS.has(fnName)) {
          state.diagnostics.push(functionDenied(fnName, `Function '${fnName}' is not in the §20.2 allowlist`));
        }
      }
      for (const arg of (node as unknown as { args?: unknown[] }).args ?? []) {
        walk(arg, depth + 1, state);
      }
      return;
    }
    default:
      return;
  }
}

function nodeDenied(nodeType: string, node: unknown): Diagnostic {
  return {
    code: 'NODE_DENIED',
    severity: 'error',
    message: `Disallowed expression node type: ${nodeType}`,
    details: { nodeType, node: isMathNode(node) ? undefined : String(node) },
  };
}

function functionDenied(fnName: string, message: string): Diagnostic {
  return {
    code: 'FUNCTION_DENIED',
    severity: 'error',
    message,
    details: { function: fnName },
  };
}

function limitExceeded(limit: string, message: string, details: Record<string, unknown>): Diagnostic {
  return { code: 'LIMIT_EXCEEDED', severity: 'error', message, details: { limit, ...details } };
}

/** Digit/exponent analysis is necessarily approximate for the float64
 * profile — by the time `validate()` sees the tree, `parse()` (which has no
 * policy) has already collapsed the literal to a JS `number`, so the
 * original source digit count is unrecoverable. For `big-decimal`, the
 * `ConstantNode.value` is already a `BigNumber` and its string form is
 * exact. */
function checkNumericLiteral(value: unknown, state: WalkState): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      state.diagnostics.push(limitExceeded('maxNumericLiteralDigits', 'Numeric literal is not finite', { value: String(value) }));
      return;
    }
    const { digits, exponent } = analyzeNumericString(value.toExponential());
    reportNumericLiteralLimits(digits, exponent, state);
    return;
  }
  if (state.mathInstance.isBigNumber(value)) {
    const { digits, exponent } = analyzeNumericString((value as MathBigNumber).toExponential());
    reportNumericLiteralLimits(digits, exponent, state);
  }
  // boolean/string constants carry no numeric-literal limits.
}

function analyzeNumericString(exponential: string): { digits: number; exponent: number } {
  const [mantissa, exponentPart] = exponential.split('e');
  const digits = (mantissa ?? '').replace(/[-.]/g, '').length;
  const exponent = exponentPart ? Math.abs(parseInt(exponentPart, 10)) : 0;
  return { digits, exponent };
}

function reportNumericLiteralLimits(digits: number, exponent: number, state: WalkState): void {
  if (digits > state.policy.maxNumericLiteralDigits) {
    state.diagnostics.push(limitExceeded('maxNumericLiteralDigits', 'Numeric literal has too many significant digits', {
      limit: state.policy.maxNumericLiteralDigits,
      digits,
    }));
  }
  if (exponent > state.policy.maxNumericLiteralExponent) {
    state.diagnostics.push(limitExceeded('maxNumericLiteralExponent', 'Numeric literal exponent magnitude is too large', {
      limit: state.policy.maxNumericLiteralExponent,
      exponent,
    }));
  }
}

// ---------------------------------------------------------------------------
// compile()
// ---------------------------------------------------------------------------

function compile(tree: unknown, policy: EnginePolicy): CompiledExpressionResult {
  const diagnostics = validate(tree, policy);
  if (diagnostics.some((d) => d.severity === 'error')) {
    return { ok: false, diagnostics };
  }

  const reconstructedLength = toText(tree).length;
  if (reconstructedLength > policy.maxExpressionLength) {
    return {
      ok: false,
      diagnostics: [
        limitExceeded('maxExpressionLength', 'Expression text length exceeds the configured limit', {
          limit: policy.maxExpressionLength,
          length: reconstructedLength,
        }),
      ],
    };
  }

  const mathInstance = getMathInstance(policy);
  const preparedTree = policy.numericProfile === 'big-decimal'
    ? promoteConstantsToBigNumber(tree as MathNode, mathInstance)
    : (tree as MathNode);

  let evalFn: { evaluate(scope: unknown): unknown };
  try {
    evalFn = preparedTree.compile();
  } catch (err) {
    return { ok: false, diagnostics: [evalErrorDiagnostic(err)] };
  }

  const handle = Object.freeze({}) as CompiledExpression;
  compiledRegistry.set(handle as object, { evalFn, mathInstance });
  return { ok: true, value: handle };
}

/** Clones `tree` and promotes every numeric `ConstantNode.value` to a
 * `BigNumber` from `mathInstance`, so a `big-decimal`-profile compile does
 * real decimal arithmetic instead of float64 arithmetic on values that
 * happen to have been parsed as JS numbers (see file header). */
function promoteConstantsToBigNumber(tree: MathNode, mathInstance: MathJsInstance): MathNode {
  const clone = tree.cloneDeep();
  promoteConstantsInto(clone, mathInstance);
  return clone;
}

function promoteConstantsInto(node: unknown, mathInstance: MathJsInstance): void {
  if (!isMathNode(node)) {
    return;
  }
  switch (node.type) {
    case 'ConstantNode': {
      const constantNode = node as unknown as { value: unknown };
      if (typeof constantNode.value === 'number') {
        constantNode.value = mathInstance.bignumber(constantNode.value.toString());
      }
      return;
    }
    case 'OperatorNode':
    case 'FunctionNode':
      for (const arg of (node as unknown as { args?: unknown[] }).args ?? []) {
        promoteConstantsInto(arg, mathInstance);
      }
      return;
    case 'ParenthesisNode':
      promoteConstantsInto((node as unknown as { content: unknown }).content, mathInstance);
      return;
    default:
      return;
  }
}

// ---------------------------------------------------------------------------
// evaluate()
// ---------------------------------------------------------------------------

function evaluate(
  compiled: CompiledExpression,
  scope: ReadonlyMap<string, TypedValue>,
  policy: EnginePolicy,
  expectedUnit?: string,
): EvaluationResult {
  const internal = compiledRegistry.get(compiled as object);
  if (!internal) {
    return {
      ok: false,
      diagnostics: [{
        code: 'EVAL_ERROR',
        severity: 'error',
        message: "evaluate() received a CompiledExpression not produced by this adapter's compile()",
      }],
    };
  }

  if (policy.budget && (policy.budget.remainingSteps <= 0 || Date.now() >= policy.budget.deadlineMs)) {
    return {
      ok: false,
      diagnostics: [limitExceeded('documentEvaluationBudget', 'Document evaluation budget is exhausted', {})],
    };
  }

  const startedAt = Date.now();
  let raw: unknown;
  try {
    const mathScope = buildMathScope(scope, internal.mathInstance);
    raw = internal.evalFn.evaluate(mathScope);
  } catch (err) {
    if (policy.budget) {
      policy.budget.remainingSteps -= 1;
    }
    return { ok: false, diagnostics: [evalErrorDiagnostic(err)] };
  }
  const elapsedMs = Date.now() - startedAt;
  if (policy.budget) {
    policy.budget.remainingSteps -= 1;
  }
  if (elapsedMs > policy.maxEvaluationTimeMsPerExpression) {
    return {
      ok: false,
      diagnostics: [limitExceeded('maxEvaluationTimeMsPerExpression', 'Expression evaluation exceeded its time budget', {
        limit: policy.maxEvaluationTimeMsPerExpression,
        elapsedMs,
      })],
    };
  }

  const converted = fromMathValue(raw, internal.mathInstance, expectedUnit);
  if (!converted.ok) {
    return converted;
  }

  const serializedBytes = utf8ByteLength(canonicalStringify(converted.value.value ?? null));
  if (serializedBytes > policy.maxResultSerializationBytes) {
    return {
      ok: false,
      diagnostics: [limitExceeded('maxResultSerializationBytes', 'Result serialization exceeds the configured byte limit', {
        limit: policy.maxResultSerializationBytes,
        bytes: serializedBytes,
      })],
    };
  }

  return { ok: true, value: converted.value };
}

function buildMathScope(scope: ReadonlyMap<string, TypedValue>, mathInstance: MathJsInstance): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [key, typedValue] of scope) {
    switch (typedValue.kind) {
      case 'float64':
        out.set(key, typedValue.value as number);
        break;
      case 'decimal':
        out.set(key, mathInstance.bignumber(String(typedValue.value)));
        break;
      case 'quantity':
        out.set(key, mathInstance.unit(typedValue.value as number, typedValue.canonicalUnit ?? ''));
        break;
      case 'boolean':
        out.set(key, typedValue.value as boolean);
        break;
      case 'string':
        out.set(key, typedValue.value as string);
        break;
      case 'undefined':
      case 'error':
        // Deliberately not bound: referencing this symbol surfaces math.js's
        // own "Undefined symbol" error, converted to EVAL_ERROR below.
        break;
      default:
        break;
    }
  }
  return out;
}

function fromMathValue(
  raw: unknown,
  mathInstance: MathJsInstance,
  expectedUnit: string | undefined,
): { ok: true; value: TypedValue } | { ok: false; diagnostics: Diagnostic[] } {
  if (mathInstance.isUnit(raw)) {
    return unitToTypedValue(raw as MathUnit, mathInstance, expectedUnit);
  }
  if (expectedUnit !== undefined) {
    return {
      ok: false,
      diagnostics: [{
        code: 'UNIT_MISMATCH',
        severity: 'error',
        message: `Expected result unit '${expectedUnit}' but the expression evaluated to a dimensionless value`,
        details: { expectedUnit },
      }],
    };
  }
  if (typeof raw === 'number') {
    return { ok: true, value: { kind: 'float64', value: raw } };
  }
  if (typeof raw === 'boolean') {
    return { ok: true, value: { kind: 'boolean', value: raw } };
  }
  if (typeof raw === 'string') {
    return { ok: true, value: { kind: 'string', value: raw } };
  }
  if (mathInstance.isBigNumber(raw)) {
    return { ok: true, value: { kind: 'decimal', value: (raw as MathBigNumber).toString() } };
  }
  return {
    ok: false,
    diagnostics: [{
      code: 'TYPE_MISMATCH',
      severity: 'error',
      message: `Unsupported evaluation result type: ${typeof raw}`,
    }],
  };
}

function unitToTypedValue(
  unitValue: MathUnit,
  mathInstance: MathJsInstance,
  expectedUnit: string | undefined,
): { ok: true; value: TypedValue } | { ok: false; diagnostics: Diagnostic[] } {
  let resolved: MathUnit;
  let unitLabel: string;
  if (expectedUnit !== undefined) {
    try {
      // `.to()` performs real unit conversion (recomputes the magnitude);
      // never relabel the unit string on the existing magnitude.
      resolved = unitValue.to(expectedUnit);
    } catch (err) {
      return {
        ok: false,
        diagnostics: [{
          code: 'UNIT_MISMATCH',
          severity: 'error',
          message: err instanceof Error ? err.message : String(err),
          details: { expectedUnit },
        }],
      };
    }
    unitLabel = expectedUnit;
  } else {
    resolved = unitValue;
    unitLabel = unitValue.formatUnits();
  }

  const magnitude = resolved.toNumeric(unitLabel);
  const normalizedMagnitude = mathInstance.isBigNumber(magnitude)
    ? (magnitude as MathBigNumber).toString()
    : magnitude;

  return { ok: true, value: { kind: 'quantity', value: normalizedMagnitude, canonicalUnit: unitLabel } };
}

// ---------------------------------------------------------------------------
// toTex() / toText()
// ---------------------------------------------------------------------------

function toTex(tree: unknown): string {
  return (tree as MathNode).toTex();
}

function toText(tree: unknown): string {
  return (tree as MathNode).toString();
}

// ---------------------------------------------------------------------------
// fingerprint()
// ---------------------------------------------------------------------------

function fingerprint(policy: EnginePolicy): string {
  const mathInstance = getMathInstance(policy);
  const payload = {
    adapter: ADAPTER_PROFILE_ID,
    mathjsVersion: mathInstance.version,
    numericProfile: policy.numericProfile,
    precision: policy.precision,
    roundingMode: policy.roundingMode,
    displaySignificantDigits: policy.displaySignificantDigits,
    limits: {
      maxExpressionLength: policy.maxExpressionLength,
      maxAstDepth: policy.maxAstDepth,
      maxAstNodeCount: policy.maxAstNodeCount,
      maxSymbolCount: policy.maxSymbolCount,
      maxFunctionCallCount: policy.maxFunctionCallCount,
      maxNumericLiteralDigits: policy.maxNumericLiteralDigits,
      maxNumericLiteralExponent: policy.maxNumericLiteralExponent,
      maxResultSerializationBytes: policy.maxResultSerializationBytes,
      maxEvaluationTimeMsPerExpression: policy.maxEvaluationTimeMsPerExpression,
      maxDocumentEvaluationSteps: policy.maxDocumentEvaluationSteps,
    },
  };
  return sha256Text(canonicalStringify(payload));
}

// ---------------------------------------------------------------------------
// Adapter export
// ---------------------------------------------------------------------------

export const mathjsSafeAdapter: CalculationEngineAdapter = {
  profileId: ADAPTER_PROFILE_ID,
  parse,
  validate,
  collectSymbols,
  compile,
  evaluate,
  toTex,
  toText,
  fingerprint,
};
