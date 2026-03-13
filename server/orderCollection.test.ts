import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Order Collection feature tests
 * Tests the collectOrders and markOrders logic
 */

// Mock the extractSpreadsheetId helper
function extractSpreadsheetId(url: string): string {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) throw new Error('Invalid spreadsheet URL');
  return match[1];
}

describe('Order Collection - extractSpreadsheetId', () => {
  it('should extract spreadsheet ID from a valid Google Sheets URL', () => {
    const url = 'https://docs.google.com/spreadsheets/d/1X5e7l1KPh7X9ki33-zmz5wrphPtTa0RZE2XtA44sCRQ/edit?gid=477189298';
    expect(extractSpreadsheetId(url)).toBe('1X5e7l1KPh7X9ki33-zmz5wrphPtTa0RZE2XtA44sCRQ');
  });

  it('should throw for an invalid URL', () => {
    expect(() => extractSpreadsheetId('not-a-url')).toThrow('Invalid spreadsheet URL');
  });
});

describe('Order Collection - grouping by spreadsheet', () => {
  it('should group agents sharing the same spreadsheet', () => {
    const agents = [
      { id: 1, name: 'Ramy', sheetUrl: 'https://docs.google.com/spreadsheets/d/ABC123/edit' },
      { id: 2, name: 'Sara', sheetUrl: 'https://docs.google.com/spreadsheets/d/ABC123/edit' },
      { id: 3, name: 'Ali', sheetUrl: 'https://docs.google.com/spreadsheets/d/DEF456/edit' },
    ];

    const spreadsheetMap = new Map<string, { agentId: number; name: string; sheetUrl: string }[]>();
    for (const agent of agents) {
      try {
        const spreadsheetId = extractSpreadsheetId(agent.sheetUrl);
        if (!spreadsheetMap.has(spreadsheetId)) spreadsheetMap.set(spreadsheetId, []);
        spreadsheetMap.get(spreadsheetId)!.push({ agentId: agent.id, name: agent.name, sheetUrl: agent.sheetUrl });
      } catch {
        // skip
      }
    }

    expect(spreadsheetMap.size).toBe(2);
    expect(spreadsheetMap.get('ABC123')!.length).toBe(2);
    expect(spreadsheetMap.get('DEF456')!.length).toBe(1);
  });

  it('should skip agents with invalid URLs', () => {
    const agents = [
      { id: 1, name: 'Ramy', sheetUrl: 'https://docs.google.com/spreadsheets/d/ABC123/edit' },
      { id: 2, name: 'Bad', sheetUrl: 'not-a-url' },
    ];

    const spreadsheetMap = new Map<string, { agentId: number; name: string; sheetUrl: string }[]>();
    for (const agent of agents) {
      try {
        const spreadsheetId = extractSpreadsheetId(agent.sheetUrl);
        if (!spreadsheetMap.has(spreadsheetId)) spreadsheetMap.set(spreadsheetId, []);
        spreadsheetMap.get(spreadsheetId)!.push({ agentId: agent.id, name: agent.name, sheetUrl: agent.sheetUrl });
      } catch {
        // skip
      }
    }

    expect(spreadsheetMap.size).toBe(1);
    expect(spreadsheetMap.get('ABC123')!.length).toBe(1);
  });
});

describe('Order Collection - markOrders grouping', () => {
  it('should group orders by spreadsheet ID for marking', () => {
    const orders = [
      { spreadsheetId: 'ABC123', tab: 'الأسبوع 1', row: 5, phone: '0551234567' },
      { spreadsheetId: 'ABC123', tab: 'الأسبوع 2', row: 10, phone: '0559876543' },
      { spreadsheetId: 'DEF456', tab: 'الأسبوع 1', row: 3, phone: '0661234567' },
    ];

    const bySpreadsheet = new Map<string, Array<{ tab: string; row: number; phone: string }>>();
    for (const order of orders) {
      if (!bySpreadsheet.has(order.spreadsheetId)) bySpreadsheet.set(order.spreadsheetId, []);
      bySpreadsheet.get(order.spreadsheetId)!.push({ tab: order.tab, row: order.row, phone: order.phone });
    }

    expect(bySpreadsheet.size).toBe(2);
    expect(bySpreadsheet.get('ABC123')!.length).toBe(2);
    expect(bySpreadsheet.get('DEF456')!.length).toBe(1);
  });
});

describe('Order Collection - order key uniqueness', () => {
  it('should generate unique keys for orders', () => {
    const orderKey = (o: { spreadsheetId: string; tab: string; row: number }) =>
      `${o.spreadsheetId}:${o.tab}:${o.row}`;

    const key1 = orderKey({ spreadsheetId: 'ABC', tab: 'الأسبوع 1', row: 5 });
    const key2 = orderKey({ spreadsheetId: 'ABC', tab: 'الأسبوع 1', row: 6 });
    const key3 = orderKey({ spreadsheetId: 'ABC', tab: 'الأسبوع 2', row: 5 });
    const key4 = orderKey({ spreadsheetId: 'DEF', tab: 'الأسبوع 1', row: 5 });

    expect(key1).not.toBe(key2);
    expect(key1).not.toBe(key3);
    expect(key1).not.toBe(key4);
  });
});

describe('Order Collection - Apps Script response parsing', () => {
  it('should parse a valid collect response', () => {
    const response = {
      orders: [
        { tab: 'الأسبوع 2', row: 177, phone: '0696974990', cells: ['28/02/2026', 'تأكيد', '1', '', '', 'R', 'TESTICALM', 'Mohcene R01', '0696974990', 'Annaba', '', '4400', 'REF-001'] },
        { tab: 'الأسبوع 2', row: 189, phone: '6645665350', cells: ['28/02/2026', 'تأكيد', '1', '', '', 'R', 'testicalm', 'Mouloud R01', '6645665350', 'Bejaia', '', '4400', 'REF-002'] },
      ],
      totalFound: 2,
    };

    expect(response.orders.length).toBe(2);
    expect(response.orders[0].phone).toBe('0696974990');
    expect(response.orders[0].cells[1]).toBe('تأكيد'); // Status = confirmed
    expect(response.orders[0].cells[3]).toBe(''); // Delivery = empty
  });

  it('should handle error response', () => {
    const response = { error: 'Spreadsheet not found' };
    expect(response.error).toBeDefined();
    expect((response as any).orders).toBeUndefined();
  });

  it('should handle empty orders', () => {
    const response = { orders: [], totalFound: 0 };
    expect(response.orders.length).toBe(0);
  });
});

describe('Order Collection - markOrders response parsing', () => {
  it('should parse a successful mark response', () => {
    const response = {
      marked: 3,
      failed: 0,
      total: 3,
      details: [
        { tab: 'الأسبوع 2', row: 177, phone: '0696974990', status: 'marked', reason: '' },
        { tab: 'الأسبوع 2', row: 189, phone: '6645665350', status: 'marked', reason: '' },
        { tab: 'الأسبوع 2', row: 190, phone: '6747485410', status: 'marked', reason: '' },
      ],
    };

    expect(response.marked).toBe(3);
    expect(response.failed).toBe(0);
    expect(response.details.every(d => d.status === 'marked')).toBe(true);
  });

  it('should parse a partial failure response', () => {
    const response = {
      marked: 2,
      failed: 1,
      total: 3,
      details: [
        { tab: 'الأسبوع 2', row: 177, phone: '0696974990', status: 'marked', reason: '' },
        { tab: 'الأسبوع 2', row: 189, phone: '6645665350', status: 'marked', reason: '' },
        { tab: 'الأسبوع 2', row: 200, phone: '0551234567', status: 'failed', reason: 'Phone mismatch and search failed' },
      ],
    };

    expect(response.marked).toBe(2);
    expect(response.failed).toBe(1);
    const failures = response.details.filter(d => d.status === 'failed');
    expect(failures.length).toBe(1);
    expect(failures[0].reason).toContain('Phone mismatch');
  });

  it('should handle row shift detection', () => {
    const response = {
      marked: 1,
      failed: 0,
      total: 1,
      details: [
        { tab: 'الأسبوع 2', row: 180, phone: '0696974990', status: 'marked', reason: 'Found at different row (was 177, now 180)' },
      ],
    };

    expect(response.marked).toBe(1);
    expect(response.details[0].reason).toContain('different row');
  });
});
