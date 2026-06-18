/**
 * instituteAttendanceParser.ts
 *
 * Parses the institute's "Monthly Attendance Report" Excel template
 * exported from the college attendance software.
 *
 * Expected sheet structure (rows top → bottom):
 *   1–4 : College name / affiliation / address / department  →  IGNORED
 *   5   : Semester & Section info                            →  IGNORED
 *   6   : "COURSE :<name>(SubjectCode)  Name of Staff: ..." →  subject code EXTRACTED
 *   7   : Date range row                                     →  IGNORED
 *   8   : "Monthly Attendance Report" title                  →  IGNORED
 *   9   : Header row: SL No. | Student Name | USN | Roll No.| Total | Present | Attendance % | Individual | Overall | <date cols…>
 *  10+  : Data rows (one per student)
 *
 * Fields extracted per student:
 *   - USN          → maps to roll_number in the NOC Portal DB
 *   - Student Name
 *   - Total        → total classes conducted
 *   - Present      → classes attended
 *
 * Everything else (P/A date columns, Attendance %, Individual, Overall,
 * Roll No., header metadata) is **ignored**.
 *
 * This module is a pure utility with zero browser/DOM dependencies so that
 * it can be fully tested with vitest.
 */

// ─── Public Types ────────────────────────────────────────────────────────────

export interface ParsedAttendanceRow {
  /** USN as it appears in the Excel — maps to `roll_number` in profiles. */
  usn: string;
  studentName: string;
  totalClasses: number;
  presentClasses: number;
  /** Computed once here so callers don't repeat the math. */
  attendancePct: number;
}

export interface ParsedAttendanceResult {
  /**
   * Subject code extracted from the COURSE row, e.g. "M25BCHES202".
   * null if the COURSE row was not found or had no parseable code.
   */
  subjectCode: string | null;
  rows: ParsedAttendanceRow[];
  /** Non-fatal per-row issues (skipped rows). */
  rowErrors: string[];
  /** Fatal structural errors (missing columns, empty file, …). */
  fatalErrors: string[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Safely coerce any cell value to a trimmed string. */
function cellStr(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

// ─── Exported helpers (also individually tested) ──────────────────────────────

/**
 * Extract the subject code from a raw COURSE-row text string.
 *
 * Strategy: find the **last** set of parentheses whose content is
 * 5–20 uppercase alphanumeric characters — the pattern used by VTU codes
 * like "M25BCHES202", "M25BMAT101", "21CS54", etc.
 *
 * Examples:
 *   "COURSE:APPLIED CHEMISTRY FOR CSE STREAM(M25BCHES202)"  → "M25BCHES202"
 *   "COURSE :MATHEMATICS(M25BMAT101) Staff: John"           → "M25BMAT101"
 *   "COURSE :PHYSICS (PH) MODULE(M25BPHYS101)"              → "M25BPHYS101"
 */
export function extractSubjectCode(rowText: string): string | null {
  // Uppercase everything so the regex is case-insensitive without the flag
  const upper = rowText.toUpperCase();
  // Match all occurrences of (ALPHANUMERIC, 5–20 chars)
  const matches = [...upper.matchAll(/\(([A-Z0-9]{5,20})\)/g)];
  if (matches.length === 0) return null;
  // Return the last match (avoids abbreviations like "(PH)" appearing earlier)
  return matches[matches.length - 1][1];
}

/**
 * Decide whether a given row is the data-table header row.
 *
 * A header row must contain ALL of:
 *   - a cell whose lowercase text is "usn"
 *   - a cell whose lowercase text is "total"
 *   - a cell whose lowercase text is "present"
 */
export function isHeaderRow(row: unknown[]): boolean {
  const cells = row.map(c => cellStr(c).toLowerCase());
  return cells.includes('usn') && cells.includes('total') && cells.includes('present');
}

/**
 * Core parser.
 *
 * @param rows  2-D array as returned by SheetJS `sheet_to_json(sheet, { header: 1, defval: '' })`.
 *              Each element is one row; each element inside is one cell value.
 */
export function parseInstituteAttendanceSheet(
  rows: unknown[][],
): ParsedAttendanceResult {
  const result: ParsedAttendanceResult = {
    subjectCode: null,
    rows: [],
    rowErrors: [],
    fatalErrors: [],
  };

  if (!rows || rows.length === 0) {
    result.fatalErrors.push('The uploaded file appears to be empty.');
    return result;
  }

  // ── Pass 1: scan pre-header rows for subject code + locate header ──────────
  let headerRowIndex = -1;
  let usnCol = -1;
  let nameCol = -1;
  let totalCol = -1;
  let presentCol = -1;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const rowText = row.map(c => cellStr(c)).join(' ');

    // Grab subject code from any row containing the COURSE keyword
    if (/COURSE\s*:/i.test(rowText) && !result.subjectCode) {
      const code = extractSubjectCode(rowText);
      if (code) result.subjectCode = code;
    }

    // Detect the header row
    if (isHeaderRow(row)) {
      headerRowIndex = i;
      const cells = row.map(c => cellStr(c).toLowerCase());

      usnCol = cells.indexOf('usn');
      // "student name" may span merged cells in some exports — find it
      nameCol = cells.findIndex(c => c.includes('student') && c.includes('name'));
      if (nameCol === -1) nameCol = cells.indexOf('student name');
      totalCol = cells.indexOf('total');
      presentCol = cells.indexOf('present');
      break;
    }
  }

  // ── Structural validation ─────────────────────────────────────────────────
  if (headerRowIndex === -1) {
    result.fatalErrors.push(
      'Could not find the data header row. Expected a row containing "USN", "Total", and "Present" columns.',
    );
    return result;
  }
  if (usnCol === -1) {
    result.fatalErrors.push('Header row found but "USN" column is missing.');
    return result;
  }
  if (totalCol === -1) {
    result.fatalErrors.push('Header row found but "Total" column is missing.');
    return result;
  }
  if (presentCol === -1) {
    result.fatalErrors.push('Header row found but "Present" column is missing.');
    return result;
  }

  // ── Pass 2: parse data rows ───────────────────────────────────────────────
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const usn = cellStr(row[usnCol]);
    // Skip completely empty rows (common at sheet bottom/footer lines)
    if (!usn) continue;

    // Skip summary/footer rows where the first column is not a number
    const slNo = cellStr(row[0]);
    if (slNo && !/^\d+$/.test(slNo)) continue;

    const studentName = nameCol !== -1 ? cellStr(row[nameCol]) : '';
    const totalRaw    = cellStr(row[totalCol]);
    const presentRaw  = cellStr(row[presentCol]);

    const totalClasses   = parseInt(totalRaw, 10);
    const presentClasses = parseInt(presentRaw, 10);

    if (isNaN(totalClasses) || totalClasses <= 0) {
      result.rowErrors.push(
        `Row ${i + 1} (USN: ${usn}): "Total" value "${totalRaw}" is not a valid positive number — row skipped.`,
      );
      continue;
    }
    if (isNaN(presentClasses) || presentClasses < 0) {
      result.rowErrors.push(
        `Row ${i + 1} (USN: ${usn}): "Present" value "${presentRaw}" is not a valid number — row skipped.`,
      );
      continue;
    }
    if (presentClasses > totalClasses) {
      result.rowErrors.push(
        `Row ${i + 1} (USN: ${usn}): Present (${presentClasses}) > Total (${totalClasses}) — row skipped.`,
      );
      continue;
    }

    const attendancePct = Math.round((presentClasses / totalClasses) * 100);

    result.rows.push({ usn, studentName, totalClasses, presentClasses, attendancePct });
  }

  return result;
}
