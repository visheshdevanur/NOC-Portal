import { sanitizeCsvCell, sanitizeCsvRow, validateCsvFileSize, sanitizeParsedCsv } from '../../src/lib/csvSanitizer';
import { describe, it, expect } from 'vitest';

describe('csvSanitizer', () => {
  describe('sanitizeCsvCell', () => {
    it('returns empty string for null/undefined', () => {
      expect(sanitizeCsvCell(null)).toBe('');
      expect(sanitizeCsvCell(undefined)).toBe('');
    });

    it('passes through safe values unchanged', () => {
      expect(sanitizeCsvCell('John Doe')).toBe('John Doe');
      expect(sanitizeCsvCell('CS101')).toBe('CS101');
      expect(sanitizeCsvCell(42)).toBe('42');
    });

    it('neutralizes formula injection with = prefix', () => {
      expect(sanitizeCsvCell('=CMD("calc")')).toBe("'=CMD(\"calc\")");
    });

    it('neutralizes formula injection with + prefix', () => {
      expect(sanitizeCsvCell('+1234567890')).toBe("'+1234567890");
    });

    it('neutralizes formula injection with - prefix', () => {
      expect(sanitizeCsvCell('-1+1')).toBe("'-1+1");
    });

    it('neutralizes formula injection with @ prefix', () => {
      expect(sanitizeCsvCell('@SUM(A1:A10)')).toBe("'@SUM(A1:A10)");
    });

    it('neutralizes tab-prefixed injection', () => {
      // .trim() strips the tab, then '=' is caught as dangerous
      expect(sanitizeCsvCell('\t=evil')).toBe("'=evil");
    });
  });

  describe('sanitizeCsvRow', () => {
    it('sanitizes all values in a row', () => {
      const row = { name: 'John', roll: '=DROP TABLE', dept: 'CS' };
      const result = sanitizeCsvRow(row);
      expect(result.name).toBe('John');
      expect(result.roll).toBe("'=DROP TABLE");
      expect(result.dept).toBe('CS');
    });
  });

  describe('validateCsvFileSize', () => {
    it('passes for files under limit', () => {
      const file = new File(['x'.repeat(1000)], 'test.csv', { type: 'text/csv' });
      expect(validateCsvFileSize(file, 5)).toBe(true);
    });

    it('throws for files over limit', () => {
      // Create a file object with a spoofed size
      const file = new File(['x'], 'test.csv', { type: 'text/csv' });
      Object.defineProperty(file, 'size', { value: 10 * 1024 * 1024 });
      expect(() => validateCsvFileSize(file, 5)).toThrow('exceeds the maximum');
    });
  });

  describe('sanitizeParsedCsv', () => {
    it('sanitizes all rows', () => {
      const rows = [
        { name: '=evil', amount: '100' },
        { name: 'John', amount: '+50' },
      ];
      const result = sanitizeParsedCsv(rows);
      expect(result[0].name).toBe("'=evil");
      expect(result[0].amount).toBe('100');
      expect(result[1].name).toBe('John');
      expect(result[1].amount).toBe("'+50");
    });
  });
});
