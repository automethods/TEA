import { bignumber, type BigNumber } from 'mathjs';

/**
 * Format a float64 value to a fixed number of significant digits.
 * Locale-independent (no thousands separators, no locale-specific decimal
 * mark) and does not mutate the stored value — it only produces a display
 * string.
 */
export function formatFloat(value: number, significantDigits: number): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  if (value === 0) {
    // toPrecision(0) is invalid; zero has no sign of significance to round.
    return (0).toPrecision(Math.max(1, significantDigits));
  }
  return value.toPrecision(significantDigits);
}

/**
 * Format an arbitrary-precision decimal value to a fixed number of
 * significant digits.
 *
 * The input MUST be passed as a string (or an existing mathjs BigNumber),
 * never as a JavaScript `number` — routing a decimal through `number` as an
 * intermediate step silently truncates it to float64 precision. This
 * function performs all rounding on mathjs's BigNumber (decimal.js-backed)
 * representation and only ever produces a string.
 */
export function formatDecimal(
  value: string | BigNumber,
  significantDigits: number,
): string {
  const decimal = typeof value === 'string' ? bignumber(value) : value;
  return decimal.toPrecision(significantDigits);
}
