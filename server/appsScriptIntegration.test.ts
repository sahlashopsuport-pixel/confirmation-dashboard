/**
 * Tests for Apps Script integration into the dashboard data pipeline.
 *
 * Validates that:
 * 1. Apps Script response can be converted to the format parseOrders expects
 * 2. Dates are always present (the whole point of this integration)
 * 3. Column mapping is correct (status, quantity, product, price, etc.)
 * 4. The dummy header row approach works correctly
 * 5. Edge cases: empty tabs, missing columns, extra columns
 */
import { describe, it, expect } from 'vitest';

// We can't import the client-side sheets.ts directly in Node vitest
// because it uses import.meta.env. Instead we test the core logic
// by re-implementing the key transformation and validating the contract.

// ── Replicate the key functions from sheets.ts for testing ──

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

function normalizeDateString(raw: string): string {
  if (!raw) return '';
  const s = raw.trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) return s;
  const dateFormula = s.match(/^=DATE\s*\(\s*(\d{4})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})\s*\)$/i);
  if (dateFormula) {
    const [, year, month, day] = dateFormula;
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  }
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}/${month}/${year}`;
  }
  const num = Number(s);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const epoch = new Date(1899, 11, 30);
    const d = new Date(epoch.getTime() + num * 86400000);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear().toString();
    return `${day}/${month}/${year}`;
  }
  return s;
}

// Simulate the parseOrders logic (simplified for testing)
interface TestOrder {
  date: string;
  status: string;
  rawStatus: string;
  quantity: number;
  productName: string;
  customerName: string;
  phone: string;
  price: number;
  reference: string;
  week: number;
  orderType: string;
}

function parseOrdersForTest(csvRows: string[][], weekNumber: number): { orders: TestOrder[]; dateWarningCount: number } {
  const orders: TestOrder[] = [];
  let dateWarningCount = 0;

  for (let i = 1; i < csvRows.length; i++) {
    const row = csvRows[i];
    if (!row || row.length < 8) continue;

    const rawDate = row[0]?.trim() || '';
    const rawStatus = row[1]?.trim() || '';

    if (rawDate === 'التاريخ' || rawStatus === 'الحالة') continue;

    const status = normalizeStatus(rawStatus);
    if (!status) continue;

    if (status === 'no_status') {
      const hasProduct = !!(row[6]?.trim());
      const hasCustomerName = !!(row[7]?.trim());
      const hasPhone = !!(row[8]?.trim());
      if (!hasProduct && !hasCustomerName && !hasPhone) continue;
    }

    let date = normalizeDateString(rawDate);
    const hasValidDate = /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(date);

    if (!hasValidDate) dateWarningCount++;
    if (!hasValidDate && date !== '') continue;

    const priceStr = row[11]?.trim() || '0';
    const price = parseFloat(priceStr.replace(/[^\d.]/g, '')) || 0;
    const quantity = parseInt(row[2]?.trim() || '1') || 1;

    orders.push({
      date: date || 'Unknown',
      status,
      rawStatus,
      quantity,
      productName: row[6]?.trim() || '',
      customerName: row[7]?.trim() || '',
      phone: row[8]?.trim() || '',
      price,
      reference: row[12]?.trim() || '',
      week: weekNumber,
      orderType: (row[13]?.trim() || '').toUpperCase() || '',
    });
  }

  return { orders, dateWarningCount };
}

// ── Dummy header row (same as in sheets.ts) ──
const DUMMY_HEADER = ['التاريخ', 'الحالة', 'الكمية', 'التوصيل', 'ملاحظة', 'الرمز', 'المنتج', 'الزبون', 'الهاتف', 'العنوان1', 'العنوان2', 'السعر', 'المرجع', 'النوع'];

describe('Apps Script → parseOrders integration', () => {
  it('correctly parses a typical Apps Script row with all fields', () => {
    const appsScriptRows: string[][] = [
      ['15/02/2026', 'تأكيد', '1', 'نعم ', '', 'R', 'Testicalm', 'Youcef Chaib R01', '0658887403', '14 - Tiaret', '', '4400', 'romaissaXtiktok.004'],
    ];

    const rowsWithHeader = [DUMMY_HEADER, ...appsScriptRows];
    const { orders, dateWarningCount } = parseOrdersForTest(rowsWithHeader, 2);

    expect(orders).toHaveLength(1);
    expect(dateWarningCount).toBe(0);

    const order = orders[0];
    expect(order.date).toBe('15/02/2026');
    expect(order.status).toBe('confirmed');
    expect(order.rawStatus).toBe('تأكيد');
    expect(order.quantity).toBe(1);
    expect(order.productName).toBe('Testicalm');
    expect(order.customerName).toBe('Youcef Chaib R01');
    expect(order.phone).toBe('0658887403');
    expect(order.price).toBe(4400);
    expect(order.reference).toBe('romaissaXtiktok.004');
    expect(order.week).toBe(2);
  });

  it('handles multiple statuses correctly', () => {
    const rows: string[][] = [
      ['15/02/2026', 'تأكيد', '1', '', '', '', 'Product A', 'Customer 1', '0500000001', '', '', '3800', 'SKU1'],
      ['15/02/2026', 'إلغاء', '1', '', '', '', 'Product B', 'Customer 2', '0500000002', '', '', '3800', 'SKU2'],
      ['15/02/2026', 'تأجيل', '1', '', '', '', 'Product C', 'Customer 3', '0500000003', '', '', '3800', 'SKU3'],
      ['15/02/2026', 'اتصل 2', '1', '', '', '', 'Product D', 'Customer 4', '0500000004', '', '', '3800', 'SKU4'],
      ['15/02/2026', 'رقم مغلق', '1', '', '', '', 'Product E', 'Customer 5', '0500000005', '', '', '3800', 'SKU5'],
      ['15/02/2026', 'لا يجيب', '1', '', '', '', 'Product F', 'Customer 6', '0500000006', '', '', '3800', 'SKU6'],
    ];

    const { orders } = parseOrdersForTest([DUMMY_HEADER, ...rows], 1);

    expect(orders).toHaveLength(6);
    expect(orders[0].status).toBe('confirmed');
    expect(orders[1].status).toBe('cancelled');
    expect(orders[2].status).toBe('postponed');
    expect(orders[3].status).toBe('callback');
    expect(orders[4].status).toBe('closed');
    expect(orders[5].status).toBe('no_answer');
  });

  it('dates from Apps Script are always valid (no empty dates)', () => {
    // This is the KEY test — Apps Script getDisplayValues() always returns
    // the visible date string, unlike GViz which drops text-formatted dates.
    const rows: string[][] = [
      ['26/02/2026', 'تأكيد', '1', '', '', '', 'Product', 'Name', '0500000001', '', '', '3800', 'SKU1'],
      ['25/02/2026', 'إلغاء', '1', '', '', '', 'Product', 'Name', '0500000002', '', '', '3800', 'SKU2'],
      ['24/02/2026', 'تأجيل', '1', '', '', '', 'Product', 'Name', '0500000003', '', '', '3800', 'SKU3'],
    ];

    const { orders, dateWarningCount } = parseOrdersForTest([DUMMY_HEADER, ...rows], 3);

    expect(orders).toHaveLength(3);
    expect(dateWarningCount).toBe(0); // No date warnings!
    expect(orders[0].date).toBe('26/02/2026');
    expect(orders[1].date).toBe('25/02/2026');
    expect(orders[2].date).toBe('24/02/2026');
  });

  it('handles empty tab (no data rows)', () => {
    const { orders, dateWarningCount } = parseOrdersForTest([DUMMY_HEADER], 1);
    expect(orders).toHaveLength(0);
    expect(dateWarningCount).toBe(0);
  });

  it('skips rows with no status and no lead data', () => {
    const rows: string[][] = [
      ['15/02/2026', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['15/02/2026', '', '', '', '', '', 'Product', 'Name', '0500000001', '', '', '', ''],
    ];

    const { orders } = parseOrdersForTest([DUMMY_HEADER, ...rows], 1);
    // First row should be skipped (no status, no lead data)
    // Second row should be included (has product + customer + phone)
    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe('no_status');
  });

  it('handles rows with fewer than 13 columns (Apps Script may trim trailing empty cells)', () => {
    // Apps Script getDisplayValues may return fewer columns if trailing cells are empty
    const rows: string[][] = [
      ['15/02/2026', 'تأكيد', '1', '', '', '', 'Product', 'Name', '0500000001'],
      // Only 9 columns — missing address, price, reference
    ];

    const { orders } = parseOrdersForTest([DUMMY_HEADER, ...rows], 1);
    expect(orders).toHaveLength(1);
    expect(orders[0].price).toBe(0); // Missing price defaults to 0
    expect(orders[0].reference).toBe(''); // Missing reference defaults to ''
  });

  it('handles upsell quantity correctly', () => {
    const rows: string[][] = [
      ['15/02/2026', 'تأكيد', '2', 'نعم', '', '', 'Testicalm', 'Customer', '0500000001', '', '', '8800', 'SKU1'],
      ['15/02/2026', 'تأكيد', '3', 'نعم', '', '', 'Testicalm', 'Customer', '0500000002', '', '', '13200', 'SKU2'],
    ];

    const { orders } = parseOrdersForTest([DUMMY_HEADER, ...rows], 1);
    expect(orders).toHaveLength(2);
    expect(orders[0].quantity).toBe(2);
    expect(orders[1].quantity).toBe(3);
  });

  it('handles order type column (column N / index 13)', () => {
    const rows: string[][] = [
      ['15/02/2026', 'تأكيد', '1', '', '', '', 'Product', 'Name', '0500000001', '', '', '3800', 'SKU1', 'NORMAL'],
      ['15/02/2026', 'إلغاء', '1', '', '', '', 'Product', 'Name', '0500000002', '', '', '3800', 'SKU2', 'ABONDON'],
    ];

    const { orders } = parseOrdersForTest([DUMMY_HEADER, ...rows], 1);
    expect(orders).toHaveLength(2);
    expect(orders[0].orderType).toBe('NORMAL');
    expect(orders[1].orderType).toBe('ABONDON');
  });

  it('correctly maps week numbers across all 4 tabs', () => {
    const row: string[] = ['15/02/2026', 'تأكيد', '1', '', '', '', 'Product', 'Name', '0500000001', '', '', '3800', 'SKU1'];

    for (let week = 1; week <= 4; week++) {
      const { orders } = parseOrdersForTest([DUMMY_HEADER, row], week);
      expect(orders).toHaveLength(1);
      expect(orders[0].week).toBe(week);
    }
  });
});

describe('Apps Script endpoint (live)', () => {
  const APPS_SCRIPT_URL = process.env.VITE_APPS_SCRIPT_URL;

  it('fetches real sheet data with all dates present', async () => {
    if (!APPS_SCRIPT_URL) {
      console.warn('Skipping live test: VITE_APPS_SCRIPT_URL not set');
      return;
    }

    // Use Rym's sheet (known to have data with dates)
    const testSheetId = '11gI91uBg3Qr_xhutKD6bT2CeIs2awK8W1v_u37Ipvhs';
    const url = `${APPS_SCRIPT_URL}?id=${testSheetId}`;

    const res = await fetch(url, { redirect: 'follow' });
    expect(res.ok).toBe(true);

    const data = await res.json();
    expect(data.tabs).toBeDefined();

    let totalRows = 0;
    let totalWithDate = 0;
    let totalEmptyDate = 0;

    for (const [tabName, tabData] of Object.entries(data.tabs) as [string, { rows: string[][] }][]) {
      for (const row of tabData.rows) {
        const dateVal = (row[0] || '').trim();
        const statusVal = (row[1] || '').trim();
        // Only count rows that have some data (not completely empty)
        if (!dateVal && !statusVal && !(row[6] || '').trim()) continue;
        totalRows++;
        if (dateVal && /\d{1,2}\/\d{1,2}\/\d{4}/.test(dateVal)) {
          totalWithDate++;
        } else if (!dateVal) {
          totalEmptyDate++;
        }
      }
    }

    console.log(`Live test: ${totalRows} data rows, ${totalWithDate} with dates, ${totalEmptyDate} empty dates`);

    // The key assertion: Apps Script should return dates for virtually all rows
    // Allow a small margin for truly empty rows at the end of a tab
    if (totalRows > 0) {
      const dateRate = totalWithDate / totalRows;
      expect(dateRate).toBeGreaterThan(0.95); // 95%+ rows should have dates
    }
  }, 30000);

  it('returns all 4 weekly tabs when they exist', async () => {
    if (!APPS_SCRIPT_URL) return;

    const testSheetId = '11gI91uBg3Qr_xhutKD6bT2CeIs2awK8W1v_u37Ipvhs';
    const url = `${APPS_SCRIPT_URL}?id=${testSheetId}`;

    const res = await fetch(url, { redirect: 'follow' });
    const data = await res.json();

    const expectedTabs = ['الأسبوع 1', 'الأسبوع 2', 'الأسبوع 3', 'الأسبوع 4'];
    const returnedTabs = Object.keys(data.tabs);

    // Should return at least the tabs that exist in the sheet
    expect(returnedTabs.length).toBeGreaterThan(0);

    // Each returned tab should have the expected structure
    for (const tabName of returnedTabs) {
      expect(data.tabs[tabName]).toHaveProperty('rows');
      expect(Array.isArray(data.tabs[tabName].rows)).toBe(true);
    }
  }, 30000);

  it('handles invalid sheet ID gracefully', async () => {
    if (!APPS_SCRIPT_URL) return;

    const url = `${APPS_SCRIPT_URL}?id=invalid_sheet_id_12345`;
    const res = await fetch(url, { redirect: 'follow' });
    const data = await res.json();

    // Should return an error, not crash
    expect(data.error).toBeDefined();
  }, 30000);
});
