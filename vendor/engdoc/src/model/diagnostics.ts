export interface Diagnostic {
  code: string;
  severity: 'error' | 'warning';
  nodeId?: string;
  message: string;
  details?: Record<string, unknown>;
}
