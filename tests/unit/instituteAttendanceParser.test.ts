/**
 * Tests for instituteAttendanceParser.ts
 *
 * Uses a mock 2-D array that faithfully replicates the structure of the
 * MIT Mysore "Monthly Attendance Report" Excel template (the same format
 * visible in the screenshot shared by the user).
 *
 * No file-system I/O is needed — the parser is a pure function that
 * operates on arrays, so SheetJS is NOT required in the test environment.
 */

import { describe, it, expect } from 'vitest';
import {
  extractSubjectCode,
  isHeaderRow,
  parseInstituteAttendanceSheet,
  type ParsedAttendanceResult,
} from '../../src/lib/instituteAttendanceParser';

// ─── Helper: build a realistic mock sheet ────────────────────────────────────

/**
 * Produces a 2-D array that mirrors what SheetJS returns for the institute
 * attendance Excel template. Values match the screenshot exactly.
 *
 * @param extraDataRows  Additional rows appended after the standard 3 students.
 */
function buildMockSheet(extraDataRows: unknown[][] = []): unknown[][] {
  return [
    // Row 1 — college name
    ['', 'Maharaja Institute of Technology Mysore', '', '', '', '', '', ''],
    // Row 2 — affiliation
    ['', 'An Autonomous Institution Affiliated to VTU', '', '', '', '', '', ''],
    // Row 3 — address
    ['', 'Belawadi, Srirangapatna Tq, Mandya, Karnataka-571477', '', '', '', '', '', ''],
    // Row 4 — department
    ['', 'DEPARTMENT OF First Year', '', '', '', '', '', ''],
    // Row 5 — semester / section
    ['Semester:Semester 2', '', '', 'Section :Section E', '', '', '', ''],
    // Row 6 — COURSE row (subject code extracted from here)
    [
      'COURSE :APPLIED CHEMISTRY FOR CSE STREAM(M25BCHES202)',
      '',
      '',
      'Name of Staff Members Shivakumara KC',
      '',
      '',
      '',
      '',
    ],
    // Row 7 — date range
    ['From Date:09-03-2026 To 21-06-2026', '', '', '', '', '', '', ''],
    // Row 8 — report title
    ['', 'Monthly Attendance Report', '', '', '', '', '', ''],
    // Row 9 — HEADER row
    [
      'SL No.',
      'Student Name',
      'USN',
      'Roll No.',
      'Total',
      'Present',
      'Attendance %',
      'Individual',
      'Overall',
      '9',
      '10',
      '11',
      '12',
    ],
    // Row 10–12 — student data (numbers as JS numbers, as SheetJS returns them)
    [1, 'A S ABHIJITH',    '4MH25CD001', '', 55, 46, 84, 84, '', 'A', 'A', 'P', 'P'],
    [2, 'AFNAN KHAN S',    '4MH25CD002', '', 55, 51, 93, 93, '', 'A', 'P', 'P', 'P'],
    [3, 'AMMAR AHMED',     '4MH25CD003', '', 55, 38, 69, 69, '', 'P', 'P', 'P', 'P'],
    ...extraDataRows,
  ];
}

// ─── extractSubjectCode ───────────────────────────────────────────────────────

describe('extractSubjectCode', () => {
  it('extracts a standard VTU subject code from a COURSE row', () => {
    expect(
      extractSubjectCode('COURSE :APPLIED CHEMISTRY FOR CSE STREAM(M25BCHES202)'),
    ).toBe('M25BCHES202');
  });

  it('extracts a shorter VTU code (e.g. 21CS54)', () => {
    expect(extractSubjectCode('COURSE:COMPUTER NETWORKS(21CS54)')).toBe('21CS54');
  });

  it('ignores short abbreviations like "(PH)" and takes the last long code', () => {
    expect(
      extractSubjectCode('COURSE :PHYSICS (PH) MODULE(M25BPHYS101)'),
    ).toBe('M25BPHYS101');
  });

  it('handles extra spaces around the colon', () => {
    expect(
      extractSubjectCode('COURSE :MATHEMATICS(M25BMAT101) Staff: John'),
    ).toBe('M25BMAT101');
  });

  it('is case-insensitive on input', () => {
    expect(
      extractSubjectCode('course:some subject(M25BCHES202)'),
    ).toBe('M25BCHES202');
  });

  it('returns null when there is no parenthesised code', () => {
    expect(extractSubjectCode('COURSE :APPLIED CHEMISTRY FOR CSE STREAM')).toBeNull();
  });

  it('returns null for completely unrelated text', () => {
    expect(extractSubjectCode('Maharaja Institute of Technology Mysore')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractSubjectCode('')).toBeNull();
  });
});

// ─── isHeaderRow ─────────────────────────────────────────────────────────────

describe('isHeaderRow', () => {
  it('correctly identifies the exact header row from the template', () => {
    const headerRow = [
      'SL No.',
      'Student Name',
      'USN',
      'Roll No.',
      'Total',
      'Present',
      'Attendance %',
      'Individual',
      'Overall',
    ];
    expect(isHeaderRow(headerRow)).toBe(true);
  });

  it('is case-insensitive (handles lowercase/mixed-case headers)', () => {
    expect(isHeaderRow(['usn', 'total', 'present', 'student name'])).toBe(true);
    expect(isHeaderRow(['USN', 'TOTAL', 'PRESENT'])).toBe(true);
  });

  it('returns false for a regular student data row', () => {
    expect(
      isHeaderRow([1, 'A S ABHIJITH', '4MH25CD001', '', 55, 46, 84, 84, '']),
    ).toBe(false);
  });

  it('returns false for the college name row', () => {
    expect(isHeaderRow(['', 'Maharaja Institute of Technology Mysore'])).toBe(false);
  });

  it('returns false if "USN" is present but "Total" and "Present" are missing', () => {
    expect(isHeaderRow(['USN', 'Student Name', 'Roll No.'])).toBe(false);
  });

  it('returns false if "Total" and "Present" are present but "USN" is missing', () => {
    expect(isHeaderRow(['SL No.', 'Total', 'Present'])).toBe(false);
  });

  it('returns false for an empty row', () => {
    expect(isHeaderRow([])).toBe(false);
  });
});

// ─── parseInstituteAttendanceSheet — happy path ───────────────────────────────

describe('parseInstituteAttendanceSheet — happy path', () => {
  let result: ParsedAttendanceResult;

  // Run the parser once and share the result across tests in this suite
  beforeAll(() => {
    result = parseInstituteAttendanceSheet(buildMockSheet());
  });

  it('has no fatal errors', () => {
    expect(result.fatalErrors).toHaveLength(0);
  });

  it('has no row errors', () => {
    expect(result.rowErrors).toHaveLength(0);
  });

  it('extracts the subject code from the COURSE row', () => {
    expect(result.subjectCode).toBe('M25BCHES202');
  });

  it('extracts exactly 3 student rows', () => {
    expect(result.rows).toHaveLength(3);
  });

  it('extracts correct USNs (maps to roll_number)', () => {
    expect(result.rows[0].usn).toBe('4MH25CD001');
    expect(result.rows[1].usn).toBe('4MH25CD002');
    expect(result.rows[2].usn).toBe('4MH25CD003');
  });

  it('extracts correct student names', () => {
    expect(result.rows[0].studentName).toBe('A S ABHIJITH');
    expect(result.rows[1].studentName).toBe('AFNAN KHAN S');
    expect(result.rows[2].studentName).toBe('AMMAR AHMED');
  });

  it('extracts correct total classes (as numbers)', () => {
    expect(result.rows[0].totalClasses).toBe(55);
    expect(result.rows[1].totalClasses).toBe(55);
    expect(result.rows[2].totalClasses).toBe(55);
  });

  it('extracts correct present classes (as numbers)', () => {
    expect(result.rows[0].presentClasses).toBe(46);
    expect(result.rows[1].presentClasses).toBe(51);
    expect(result.rows[2].presentClasses).toBe(38);
  });

  it('computes attendance percentage correctly', () => {
    // A S ABHIJITH: 46/55 = 83.6 → rounds to 84
    expect(result.rows[0].attendancePct).toBe(84);
    // AFNAN KHAN S: 51/55 = 92.7 → rounds to 93
    expect(result.rows[1].attendancePct).toBe(93);
    // AMMAR AHMED: 38/55 = 69.09 → rounds to 69
    expect(result.rows[2].attendancePct).toBe(69);
  });

  it('ignores the P/A date columns and Attendance % column entirely', () => {
    // The row objects should only have the 5 mapped fields
    const keys = Object.keys(result.rows[0]).sort();
    expect(keys).toEqual(
      ['attendancePct', 'presentClasses', 'studentName', 'totalClasses', 'usn'].sort(),
    );
  });
});

// ─── parseInstituteAttendanceSheet — edge cases ───────────────────────────────

describe('parseInstituteAttendanceSheet — edge cases', () => {
  it('returns a fatal error for an empty input array', () => {
    const r = parseInstituteAttendanceSheet([]);
    expect(r.fatalErrors.length).toBeGreaterThan(0);
    expect(r.rows).toHaveLength(0);
  });

  it('returns a fatal error when the header row is absent', () => {
    const r = parseInstituteAttendanceSheet([
      ['Maharaja Institute of Technology Mysore'],
      ['Some other row without USN/Total/Present'],
    ]);
    expect(r.fatalErrors.length).toBeGreaterThan(0);
    expect(r.fatalErrors[0]).toContain('header row');
  });

  it('records a row error (and skips) when Total is 0', () => {
    const sheet = buildMockSheet([
      [4, 'BAD STUDENT', '4MH25CD099', '', 0, 10, '', '', ''],
    ]);
    const r = parseInstituteAttendanceSheet(sheet);
    const usns = r.rows.map(row => row.usn);
    expect(usns).not.toContain('4MH25CD099');
    expect(r.rowErrors.length).toBeGreaterThan(0);
  });

  it('records a row error (and skips) when Present > Total', () => {
    const sheet = buildMockSheet([
      [4, 'IMPOSSIBLE STUDENT', '4MH25CD098', '', 10, 15, '', '', ''],
    ]);
    const r = parseInstituteAttendanceSheet(sheet);
    const usns = r.rows.map(row => row.usn);
    expect(usns).not.toContain('4MH25CD098');
    expect(r.rowErrors.length).toBeGreaterThan(0);
  });

  it('records a row error (and skips) when Present is negative', () => {
    const sheet = buildMockSheet([
      [4, 'NEG STUDENT', '4MH25CD097', '', 55, -5, '', '', ''],
    ]);
    const r = parseInstituteAttendanceSheet(sheet);
    const usns = r.rows.map(row => row.usn);
    expect(usns).not.toContain('4MH25CD097');
    expect(r.rowErrors.length).toBeGreaterThan(0);
  });

  it('records a row error when Total is non-numeric text', () => {
    const sheet = buildMockSheet([
      [4, 'TEXT STUDENT', '4MH25CD096', '', 'N/A', 10, '', '', ''],
    ]);
    const r = parseInstituteAttendanceSheet(sheet);
    expect(r.rows.find(row => row.usn === '4MH25CD096')).toBeUndefined();
    expect(r.rowErrors.length).toBeGreaterThan(0);
  });

  it('silently skips blank rows in the data section', () => {
    const sheet = buildMockSheet([
      [],          // blank row — must be skipped without error
      ['', '', '', '', '', '', '', ''], // all-empty row
    ]);
    const r = parseInstituteAttendanceSheet(sheet);
    expect(r.rows).toHaveLength(3);    // only the original 3 students
    expect(r.rowErrors).toHaveLength(0);
  });

  it('silently skips footer/summary rows (non-numeric SL No.)', () => {
    const sheet = buildMockSheet([
      ['Total:', '', '', '', 165, 135, '', '', ''], // summary row
    ]);
    const r = parseInstituteAttendanceSheet(sheet);
    // The summary row has no USN so it will be skipped anyway
    expect(r.rows).toHaveLength(3);
  });

  it('returns subjectCode as null when COURSE row is absent', () => {
    // Sheet with header but no COURSE row
    const sheet = [
      ['SL No.', 'Student Name', 'USN', 'Roll No.', 'Total', 'Present', 'Attendance %'],
      [1, 'STUDENT ONE', '4MH25CD001', '', 55, 46, 84],
    ];
    const r = parseInstituteAttendanceSheet(sheet);
    expect(r.subjectCode).toBeNull();
    expect(r.rows).toHaveLength(1);   // data still parsed even without code
  });

  it('handles SheetJS numeric cell values (numbers, not strings)', () => {
    // SheetJS returns numbers as actual JS numbers — the parser must handle both
    const sheet = buildMockSheet();
    const r = parseInstituteAttendanceSheet(sheet);
    expect(typeof r.rows[0].totalClasses).toBe('number');
    expect(typeof r.rows[0].presentClasses).toBe('number');
    expect(typeof r.rows[0].attendancePct).toBe('number');
  });

  it('handles 100% attendance correctly', () => {
    const sheet = buildMockSheet([
      [4, 'PERFECT ATTENDANCE', '4MH25CD095', '', 55, 55, 100, 100, ''],
    ]);
    const r = parseInstituteAttendanceSheet(sheet);
    const student = r.rows.find(row => row.usn === '4MH25CD095');
    expect(student).toBeDefined();
    expect(student!.attendancePct).toBe(100);
    expect(r.rowErrors).toHaveLength(0);
  });

  it('handles 0% attendance (0 present out of N total)', () => {
    const sheet = buildMockSheet([
      [4, 'ZERO ATTENDANCE', '4MH25CD094', '', 55, 0, 0, 0, ''],
    ]);
    const r = parseInstituteAttendanceSheet(sheet);
    const student = r.rows.find(row => row.usn === '4MH25CD094');
    expect(student).toBeDefined();
    expect(student!.attendancePct).toBe(0);
    expect(r.rowErrors).toHaveLength(0);
  });

  it('processes a large class (60+ students) without errors', () => {
    const bigClass: unknown[][] = Array.from({ length: 60 }, (_, idx) => [
      idx + 1,
      `STUDENT ${idx + 1}`,
      `4MH25CD${String(idx + 1).padStart(3, '0')}`,
      '',
      55,
      Math.min(55, 30 + idx % 26),
      '',
      '',
      '',
    ]);
    const sheet = buildMockSheet(bigClass);
    const r = parseInstituteAttendanceSheet(sheet);
    expect(r.rows).toHaveLength(63); // 3 original + 60 new
    expect(r.fatalErrors).toHaveLength(0);
    expect(r.rowErrors).toHaveLength(0);
  });
});
