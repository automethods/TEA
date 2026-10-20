export type ValueKind =
  | 'float64' | 'decimal' | 'quantity' | 'boolean' | 'string'
  | 'undefined' | 'error';

export interface TypedValue {
  kind: ValueKind;
  value: unknown;
  canonicalUnit?: string;
  displayUnit?: string;
  precision?: number;
  metadata?: Record<string, unknown>;
}
