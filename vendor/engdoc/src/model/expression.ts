export interface ResolvedSymbolRef {
  token: string;
  targetValueId: string;
  expressionNodeId: string;
}

export interface ResolvedExpression {
  source: string;
  tree: unknown;
  rootExpressionId: string;
  symbolRefs: ResolvedSymbolRef[];
  expressionIdsByPath: Map<string, string>;
}
