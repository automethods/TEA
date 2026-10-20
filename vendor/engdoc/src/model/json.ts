/**
 * Canonical JSON serialization: object keys are sorted so that structurally
 * equal values always produce byte-identical output, regardless of
 * insertion order.
 */
export function canonicalStringify(value: unknown): string {
  return stringifyCanonical(value);
}

function stringifyCanonical(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stringifyCanonical(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const body = entries
      .map(([k, v]) => `${JSON.stringify(k)}:${stringifyCanonical(v)}`)
      .join(',');
    return `{${body}}`;
  }
  throw new TypeError(`Cannot canonically serialize value of type ${typeof value}`);
}
