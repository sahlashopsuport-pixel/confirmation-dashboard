import { describe, it, expect } from 'vitest';
import { normalizeDateString } from '../client/src/lib/sheets';

describe('normalizeDateString', () => {
  it('passes through dd/mm/yyyy as-is', () => {
    expect(normalizeDateString('25/02/2026')).toBe('25/02/2026');
    expect(normalizeDateString('1/1/2026')).toBe('1/1/2026');
    expect(normalizeDateString('05/12/2025')).toBe('05/12/2025');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeDateString('')).toBe('');
    expect(normalizeDateString('  ')).toBe('');
  });

  it('parses =DATE(year,month,day) formula strings', () => {
    expect(normalizeDateString('=DATE(2026,2,23)')).toBe('23/02/2026');
    expect(normalizeDateString('=DATE(2026, 2, 23)')).toBe('23/02/2026');
    expect(normalizeDateString('=DATE(2026,12,5)')).toBe('05/12/2026');
    expect(normalizeDateString('=date(2026,1,15)')).toBe('15/01/2026');
  });

  it('converts ISO format yyyy-mm-dd', () => {
    expect(normalizeDateString('2026-02-23')).toBe('23/02/2026');
    expect(normalizeDateString('2026-12-05')).toBe('05/12/2026');
    expect(normalizeDateString('2026-02-23T10:30:00')).toBe('23/02/2026');
  });

  it('converts dash-separated dd-mm-yyyy', () => {
    expect(normalizeDateString('23-02-2026')).toBe('23/02/2026');
    expect(normalizeDateString('5-12-2026')).toBe('5/12/2026');
  });

  it('converts dot-separated dd.mm.yyyy', () => {
    expect(normalizeDateString('23.02.2026')).toBe('23/02/2026');
    expect(normalizeDateString('5.12.2026')).toBe('5/12/2026');
  });

  it('converts Google Sheets serial date numbers', () => {
    // 46075 = Feb 23, 2026 in Google Sheets serial
    const result = normalizeDateString('46075');
    expect(result).toMatch(/^\d{2}\/\d{2}\/2026$/);
  });

  it('returns unrecognized strings as-is', () => {
    expect(normalizeDateString('hello')).toBe('hello');
    expect(normalizeDateString('abc123')).toBe('abc123');
  });

  it('trims whitespace', () => {
    expect(normalizeDateString('  25/02/2026  ')).toBe('25/02/2026');
    expect(normalizeDateString(' =DATE(2026,2,23) ')).toBe('23/02/2026');
  });

  it('handles =DATE formula with extra spaces', () => {
    expect(normalizeDateString('=DATE( 2026 , 2 , 23 )')).toBe('23/02/2026');
  });
});
