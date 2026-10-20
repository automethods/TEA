/**
 * engdoc ID rule.
 *
 * NOTE: this intentionally differs from the SDOC document-format ID rule in
 * `sdoc/ARCHITECTURE-v0.3.md` (section 4.4), which requires IDs to match
 * `[A-Za-z][A-Za-z0-9._-]{0,127}` (must start with a letter, max 128 chars).
 * engdoc's compiler-internal IDs are looser: any non-empty run of
 * alphanumerics, dots, underscores, or hyphens, with no leading-character
 * restriction and no length cap.
 */
export const ID_PATTERN = /^[A-Za-z0-9._-]+$/;

export function isValidId(id: string): boolean {
  return ID_PATTERN.test(id);
}

export function assertValidId(id: string, context?: string): void {
  if (!isValidId(id)) {
    const suffix = context ? ` (${context})` : '';
    throw new Error(`Invalid ID: ${JSON.stringify(id)}${suffix}`);
  }
}
