import { describe, it, expect } from "vitest";

/**
 * Test the local diagnosis computation logic that replaced the server-side
 * diagnoseDates tRPC call. This mirrors the useMemo in Home.tsx that computes
 * missing-date rows from already-loaded agent order data.
 */

// Replicate the WEEK_TAB_MAP from Home.tsx
const WEEK_TAB_MAP: Record<number, string> = {
  1: 'الأسبوع 1',
  2: 'الأسبوع 2',
  3: 'الأسبوع 3',
  4: 'الأسبوع 4',
};

interface OrderRow {
  date: string;
  status: string;
  rawStatus: string;
  productName: string;
  customerName: string;
  phone: string;
  week: number;
  sheetRow?: number;
}

interface AgentData {
  name: string;
  sheetUrl: string;
  orders: OrderRow[];
  dateFormatWarning: number;
}

/**
 * Replicate the local diagnosis logic from Home.tsx useMemo
 */
function computeLocalDiagnosis(
  agents: AgentData[],
  dateFormatWarnings: Array<{ name: string; count: number; sheetUrl: string }>
) {
  return dateFormatWarnings.map(w => {
    const agent = agents.find(a => a.name === w.name && a.sheetUrl === w.sheetUrl);
    if (!agent) return { agentName: w.name, sheetUrl: w.sheetUrl, tabs: [], totalMissing: 0 };

    const tabMap = new Map<string, Array<{
      sheetRow: number;
      rawColumnA: string;
      status: string;
      productName: string;
      customerName: string;
      phone: string;
    }>>();

    for (const order of agent.orders) {
      const hasValidDate = /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(order.date);
      if (hasValidDate && order.date !== 'Unknown') continue;

      const tabName = WEEK_TAB_MAP[order.week] || `Week ${order.week}`;
      if (!tabMap.has(tabName)) tabMap.set(tabName, []);
      tabMap.get(tabName)!.push({
        sheetRow: order.sheetRow || 0,
        rawColumnA: order.date === 'Unknown' ? '(empty)' : order.date || '(empty)',
        status: order.rawStatus || '(empty)',
        productName: order.productName,
        customerName: order.customerName,
        phone: order.phone,
      });
    }

    const tabs = Array.from(tabMap.entries()).map(([tabName, rows]) => ({ tabName, rows }));
    const totalMissing = tabs.reduce((sum, t) => sum + t.rows.length, 0);
    return { agentName: w.name, sheetUrl: w.sheetUrl, tabs, totalMissing };
  });
}

describe("Local diagnosis computation (replaces server diagnoseDates)", () => {
  const makeOrder = (overrides: Partial<OrderRow> = {}): OrderRow => ({
    date: '28/02/2026',
    status: 'confirmed',
    rawStatus: 'تأكيد',
    productName: 'Test Product',
    customerName: 'Test Customer',
    phone: '0555123456',
    week: 1,
    sheetRow: 5,
    ...overrides,
  });

  it("returns empty result when agent has no missing dates", () => {
    const agents: AgentData[] = [{
      name: 'WARDA',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/abc123',
      orders: [makeOrder(), makeOrder({ sheetRow: 6 })],
      dateFormatWarning: 0,
    }];

    // No warnings → no diagnosis needed
    const result = computeLocalDiagnosis(agents, []);
    expect(result).toHaveLength(0);
  });

  it("detects orders with 'Unknown' date as missing", () => {
    const agents: AgentData[] = [{
      name: 'SARAH',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/xyz789',
      orders: [
        makeOrder({ date: '28/02/2026', sheetRow: 2 }),
        makeOrder({ date: 'Unknown', sheetRow: 5, week: 3, rawStatus: 'رقم مغلق' }),
        makeOrder({ date: 'Unknown', sheetRow: 8, week: 3, rawStatus: 'إلغاء' }),
        makeOrder({ date: '27/02/2026', sheetRow: 10 }),
      ],
      dateFormatWarning: 2,
    }];

    const warnings = [{ name: 'SARAH', count: 2, sheetUrl: 'https://docs.google.com/spreadsheets/d/xyz789' }];
    const result = computeLocalDiagnosis(agents, warnings);

    expect(result).toHaveLength(1);
    expect(result[0].agentName).toBe('SARAH');
    expect(result[0].totalMissing).toBe(2);
    expect(result[0].tabs).toHaveLength(1);
    expect(result[0].tabs[0].tabName).toBe('الأسبوع 3');
    expect(result[0].tabs[0].rows).toHaveLength(2);
    expect(result[0].tabs[0].rows[0].sheetRow).toBe(5);
    expect(result[0].tabs[0].rows[0].rawColumnA).toBe('(empty)');
    expect(result[0].tabs[0].rows[1].sheetRow).toBe(8);
  });

  it("groups missing dates by week tab", () => {
    const agents: AgentData[] = [{
      name: 'TAGRAWLA',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/def456',
      orders: [
        makeOrder({ date: 'Unknown', sheetRow: 10, week: 1 }),
        makeOrder({ date: 'Unknown', sheetRow: 211, week: 4 }),
        makeOrder({ date: '25/02/2026', sheetRow: 15, week: 2 }),
      ],
      dateFormatWarning: 2,
    }];

    const warnings = [{ name: 'TAGRAWLA', count: 2, sheetUrl: 'https://docs.google.com/spreadsheets/d/def456' }];
    const result = computeLocalDiagnosis(agents, warnings);

    expect(result[0].totalMissing).toBe(2);
    expect(result[0].tabs).toHaveLength(2);

    const tab1 = result[0].tabs.find(t => t.tabName === 'الأسبوع 1');
    const tab4 = result[0].tabs.find(t => t.tabName === 'الأسبوع 4');
    expect(tab1?.rows).toHaveLength(1);
    expect(tab1?.rows[0].sheetRow).toBe(10);
    expect(tab4?.rows).toHaveLength(1);
    expect(tab4?.rows[0].sheetRow).toBe(211);
  });

  it("handles #ERROR! dates (non-empty but invalid)", () => {
    const agents: AgentData[] = [{
      name: 'SARAH',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/xyz789',
      orders: [
        makeOrder({ date: '#ERROR!', sheetRow: 370, week: 3, rawStatus: 'رقم مغلق' }),
      ],
      dateFormatWarning: 1,
    }];

    const warnings = [{ name: 'SARAH', count: 1, sheetUrl: 'https://docs.google.com/spreadsheets/d/xyz789' }];
    const result = computeLocalDiagnosis(agents, warnings);

    expect(result[0].totalMissing).toBe(1);
    expect(result[0].tabs[0].rows[0].rawColumnA).toBe('#ERROR!');
    expect(result[0].tabs[0].rows[0].sheetRow).toBe(370);
  });

  it("returns totalMissing=0 when agent not found in data", () => {
    const agents: AgentData[] = [];
    const warnings = [{ name: 'GHOST', count: 5, sheetUrl: 'https://docs.google.com/spreadsheets/d/ghost' }];
    const result = computeLocalDiagnosis(agents, warnings);

    expect(result).toHaveLength(1);
    expect(result[0].agentName).toBe('GHOST');
    expect(result[0].totalMissing).toBe(0);
    expect(result[0].tabs).toHaveLength(0);
  });

  it("handles multiple agents with mixed results", () => {
    const agents: AgentData[] = [
      {
        name: 'WARDA',
        sheetUrl: 'https://docs.google.com/spreadsheets/d/abc',
        orders: [makeOrder({ date: 'Unknown', sheetRow: 211, week: 4 })],
        dateFormatWarning: 1,
      },
      {
        name: 'SARAH',
        sheetUrl: 'https://docs.google.com/spreadsheets/d/def',
        orders: [
          makeOrder({ date: '#ERROR!', sheetRow: 370, week: 3 }),
          makeOrder({ date: '#ERROR!', sheetRow: 374, week: 3 }),
          makeOrder({ date: '#ERROR!', sheetRow: 376, week: 3 }),
        ],
        dateFormatWarning: 3,
      },
    ];

    const warnings = [
      { name: 'WARDA', count: 1, sheetUrl: 'https://docs.google.com/spreadsheets/d/abc' },
      { name: 'SARAH', count: 3, sheetUrl: 'https://docs.google.com/spreadsheets/d/def' },
    ];

    const result = computeLocalDiagnosis(agents, warnings);
    expect(result).toHaveLength(2);
    expect(result[0].agentName).toBe('WARDA');
    expect(result[0].totalMissing).toBe(1);
    expect(result[1].agentName).toBe('SARAH');
    expect(result[1].totalMissing).toBe(3);
    expect(result[1].tabs[0].rows).toHaveLength(3);
  });

  it("preserves sheetRow for correct row linking", () => {
    const agents: AgentData[] = [{
      name: 'TEST',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/test',
      orders: [
        makeOrder({ date: 'Unknown', sheetRow: 2, week: 1 }),
        makeOrder({ date: 'Unknown', sheetRow: 150, week: 2 }),
        makeOrder({ date: 'Unknown', sheetRow: 300, week: 3 }),
        makeOrder({ date: 'Unknown', sheetRow: 450, week: 4 }),
      ],
      dateFormatWarning: 4,
    }];

    const warnings = [{ name: 'TEST', count: 4, sheetUrl: 'https://docs.google.com/spreadsheets/d/test' }];
    const result = computeLocalDiagnosis(agents, warnings);

    expect(result[0].totalMissing).toBe(4);
    expect(result[0].tabs).toHaveLength(4);

    // Verify each tab has the correct row number
    const tab1 = result[0].tabs.find(t => t.tabName === 'الأسبوع 1');
    expect(tab1?.rows[0].sheetRow).toBe(2);
    const tab4 = result[0].tabs.find(t => t.tabName === 'الأسبوع 4');
    expect(tab4?.rows[0].sheetRow).toBe(450);
  });

  it("includes status, product, customer, phone in row details", () => {
    const agents: AgentData[] = [{
      name: 'WARDA',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/abc',
      orders: [makeOrder({
        date: 'Unknown',
        sheetRow: 211,
        week: 4,
        rawStatus: 'تأكيد',
        productName: 'Pack Anti-Chute VICONIS',
        customerName: 'مالك كتوم W09',
        phone: '0770178221',
      })],
      dateFormatWarning: 1,
    }];

    const warnings = [{ name: 'WARDA', count: 1, sheetUrl: 'https://docs.google.com/spreadsheets/d/abc' }];
    const result = computeLocalDiagnosis(agents, warnings);

    const row = result[0].tabs[0].rows[0];
    expect(row.status).toBe('تأكيد');
    expect(row.productName).toBe('Pack Anti-Chute VICONIS');
    expect(row.customerName).toBe('مالك كتوم W09');
    expect(row.phone).toBe('0770178221');
  });

  it("handles orders with missing sheetRow (defaults to 0)", () => {
    const agents: AgentData[] = [{
      name: 'TEST',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/test',
      orders: [makeOrder({ date: 'Unknown', sheetRow: undefined, week: 1 })],
      dateFormatWarning: 1,
    }];

    const warnings = [{ name: 'TEST', count: 1, sheetUrl: 'https://docs.google.com/spreadsheets/d/test' }];
    const result = computeLocalDiagnosis(agents, warnings);

    expect(result[0].tabs[0].rows[0].sheetRow).toBe(0);
  });
});
