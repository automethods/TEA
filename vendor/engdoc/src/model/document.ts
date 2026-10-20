import type { TypedValue } from './values.js';
import type { ResolvedExpression } from './expression.js';
import type { Diagnostic } from './diagnostics.js';

export interface SourceRange {
  startByte: number;
  endByte: number;
  startLine: number;
  endLine: number;
}

export interface ScopeNode {
  id: string;
  parentId: string | null;
  role: string;
}

export interface ValueBinding {
  valueId: string;
  ownerNodeId: string;
  symbol: string;
  scopeId: string;
  valueType: string;
  canonicalUnit?: string;
  displayUnit?: string;
  literal?: TypedValue;
  expression?: ResolvedExpression;
}

export interface SemanticNode {
  id: string;
  kind: string;
  role: string;
  sourceRange: SourceRange;
  styleRef?: string;
  props: Record<string, unknown>;
  outputValueId?: string;
  opaque?: boolean;
}

export interface EngDocument {
  frontmatter: Record<string, unknown>;
  nodes: SemanticNode[];
  byId: Map<string, SemanticNode>;
  scopes: Map<string, ScopeNode>;
  values: Map<string, ValueBinding>;
  symbolsByScope: Map<string, Map<string, string>>;
  calculationByOutput: Map<string, string>;
  diagnostics: Diagnostic[];
}
