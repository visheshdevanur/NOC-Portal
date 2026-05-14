/**
 * Client-side input sanitization utilities.
 * Prevents XSS via stored data and enforces reasonable string lengths.
 */

/** Strip HTML tags and limit string length */
export function sanitize(input: string, maxLength = 500): string {
  if (!input) return '';
  return input
    .replace(/<[^>]*>/g, '')  // Strip HTML tags
    .replace(/[<>"'`]/g, '')  // Remove characters that could be used in XSS
    .trim()
    .slice(0, maxLength);
}

/** Sanitize a remarks/notes field (allows slightly longer text) */
export function sanitizeRemarks(input: string): string {
  return sanitize(input, 1000);
}

/** Sanitize a name field */
export function sanitizeName(input: string): string {
  return sanitize(input, 200);
}

/** Validate and sanitize a numeric value, clamped to [min, max] */
export function sanitizeNumber(value: number, min: number, max: number): number {
  if (isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Validate UUID format */
export function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}
