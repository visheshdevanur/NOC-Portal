/**
 * CSV Input Sanitization
 * FIX #26: Prevents CSV injection attacks by stripping dangerous leading characters.
 * 
 * When spreadsheet apps (Excel, Google Sheets) open a CSV, cells starting with
 * =, +, -, @, \t, \r can trigger formula injection, potentially executing
 * arbitrary commands on the user's machine.
 */

const DANGEROUS_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Sanitize a single CSV cell value to prevent formula injection.
 * Strips leading dangerous characters and wraps in single quotes if needed.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  
  const str = String(value).trim();
  if (str.length === 0) return '';

  // Check if the first character is dangerous
  if (DANGEROUS_PREFIXES.includes(str[0])) {
    // Prefix with a single quote to neutralize the formula
    return `'${str}`;
  }

  return str;
}

/**
 * Sanitize an entire row of CSV data.
 */
export function sanitizeCsvRow(row: Record<string, unknown>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    sanitized[key] = sanitizeCsvCell(value);
  }
  return sanitized;
}

/**
 * Validate file size before CSV parsing.
 * FIX #44: Prevents browser crashes from oversized file uploads.
 * 
 * @param file - The uploaded file
 * @param maxSizeMB - Maximum file size in megabytes (default: 5MB)
 * @returns true if file is within limits
 * @throws Error if file exceeds the limit
 */
export function validateCsvFileSize(file: File, maxSizeMB: number = 5): boolean {
  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds the maximum allowed size of ${maxSizeMB}MB. Please split the file into smaller batches.`);
  }
  return true;
}

/**
 * Validate and sanitize a parsed CSV dataset.
 * Use this after PapaParse parses the file but before inserting into DB.
 */
export function sanitizeParsedCsv(rows: Record<string, unknown>[]): Record<string, string>[] {
  return rows.map(sanitizeCsvRow);
}
