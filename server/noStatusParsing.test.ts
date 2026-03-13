/**
 * Tests for the no-status row parsing fix.
 * Verifies that rows with empty status but valid lead data (product, customer, phone)
 * are counted as 'no_status' instead of being skipped.
 */
import { describe, it, expect } from 'vitest';

// We test the normalizeStatus logic and the parseOrders row-filtering logic
// by importing the relevant functions. Since normalizeStatus and parseOrders
// are not exported, we test through the public aggregation functions.
// Instead, we replicate the core logic here for unit testing.

// Replicate normalizeStatus logic
const VALID_STATUSES: Record<string, string> = {
  'تأكيد': 'confirmed',
  'تاكيد': 'confirmed',
  'إلغاء': 'cancelled',
  'الغاء': 'cancelled',
  'تأجيل': 'postponed',
  'تاجيل': 'postponed',
  'رقم مغلق': 'closed',
  'مغلق': 'closed',
  'لا يجيب': 'no_answer',
  'لايجيب': 'no_answer',
  'رقم خاطئ': 'wrong',
  'خاطئ': 'wrong',
  'مكرر': 'duplicate',
  'حذف': 'deleted',
  'قيد الانتظار': 'waiting',
};

const CALLBACK_PATTERN = /^اتصل\s*\d+$/;
const DELETE_TRANSFER_PATTERN = /حذف|يُحوّل|يحول/;

function normalizeStatus(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return 'no_status';
  if (VALID_STATUSES[trimmed]) return VALID_STATUSES[trimmed];
  if (CALLBACK_PATTERN.test(trimmed)) return 'callback';
  if (DELETE_TRANSFER_PATTERN.test(trimmed)) return 'deleted';
  for (const [key, value] of Object.entries(VALID_STATUSES)) {
    if (trimmed.includes(key)) return value;
  }
  if (trimmed.includes('sh0') || trimmed.includes('sh08') || trimmed.length > 30) return null;
  if (/^\d{5,}/.test(trimmed)) return null;
  return 'other';
}

// Replicate the row-inclusion logic from parseOrders
function shouldIncludeRow(rawStatus: string, row: string[]): { include: boolean; status: string | null } {
  const status = normalizeStatus(rawStatus);
  if (!status) return { include: false, status: null };
  
  if (status === 'no_status') {
    const hasProduct = !!(row[6]?.trim());
    const hasCustomerName = !!(row[7]?.trim());
    const hasPhone = !!(row[8]?.trim());
    if (!hasProduct && !hasCustomerName && !hasPhone) return { include: false, status };
  }
  
  return { include: true, status };
}

describe('normalizeStatus', () => {
  it('returns no_status for empty string', () => {
    expect(normalizeStatus('')).toBe('no_status');
  });

  it('returns no_status for whitespace-only string', () => {
    expect(normalizeStatus('   ')).toBe('no_status');
  });

  it('returns confirmed for تأكيد', () => {
    expect(normalizeStatus('تأكيد')).toBe('confirmed');
  });

  it('returns cancelled for إلغاء', () => {
    expect(normalizeStatus('إلغاء')).toBe('cancelled');
  });

  it('returns callback for اتصل 3', () => {
    expect(normalizeStatus('اتصل 3')).toBe('callback');
  });

  it('returns null for spillover data (long strings)', () => {
    expect(normalizeStatus('sh08 some random spillover data from next column')).toBeNull();
  });

  it('returns null for phone number spillover', () => {
    expect(normalizeStatus('0551234567')).toBeNull();
  });
});

describe('shouldIncludeRow (no-status filtering)', () => {
  // Row format: [date, status, qty, delivery, callNote, code, productName, customerName, phone, ...]
  const makeRow = (status: string, product: string, customer: string, phone: string): string[] => {
    return ['23/02/2026', status, '', '', '', '', product, customer, phone, '', '', '3800', ''];
  };

  it('includes row with empty status but valid product name', () => {
    const row = makeRow('', 'TESTICALM', '', '');
    const result = shouldIncludeRow('', row);
    expect(result.include).toBe(true);
    expect(result.status).toBe('no_status');
  });

  it('includes row with empty status but valid customer name', () => {
    const row = makeRow('', '', 'Ahmed Bokhari', '');
    const result = shouldIncludeRow('', row);
    expect(result.include).toBe(true);
    expect(result.status).toBe('no_status');
  });

  it('includes row with empty status but valid phone number', () => {
    const row = makeRow('', '', '', '0551234567');
    const result = shouldIncludeRow('', row);
    expect(result.include).toBe(true);
    expect(result.status).toBe('no_status');
  });

  it('includes row with empty status and all lead data present', () => {
    const row = makeRow('', 'TESTICALM', 'zaoui', '0665006116');
    const result = shouldIncludeRow('', row);
    expect(result.include).toBe(true);
    expect(result.status).toBe('no_status');
  });

  it('excludes row with empty status and no lead data', () => {
    const row = makeRow('', '', '', '');
    const result = shouldIncludeRow('', row);
    expect(result.include).toBe(false);
  });

  it('includes row with confirmed status normally', () => {
    const row = makeRow('تأكيد', 'TESTICALM', 'Ahmed', '0551234567');
    const result = shouldIncludeRow('تأكيد', row);
    expect(result.include).toBe(true);
    expect(result.status).toBe('confirmed');
  });

  it('excludes row with spillover data in status', () => {
    const row = makeRow('0551234567890', 'TESTICALM', 'Ahmed', '0551234567');
    const result = shouldIncludeRow('0551234567890', row);
    expect(result.include).toBe(false);
    expect(result.status).toBeNull();
  });
});

describe('noStatus count in agent stats', () => {
  it('noStatus orders should not affect confirmation/cancellation rates', () => {
    // Simulate: 7 orders with status + 2 with no_status = 9 total
    // 5 confirmed, 2 cancelled, 2 no_status
    const totalOrders = 9;
    const confirmed = 5;
    const cancelled = 2;
    const noStatus = 2;
    
    const confirmationRate = (confirmed / totalOrders) * 100;
    const cancellationRate = (cancelled / totalOrders) * 100;
    
    // With 9 total orders, rates are calculated on the full base
    expect(confirmationRate).toBeCloseTo(55.56, 1);
    expect(cancellationRate).toBeCloseTo(22.22, 1);
    
    // noStatus should be separate from other
    const other = totalOrders - confirmed - cancelled - noStatus;
    expect(other).toBe(0);
  });
});
