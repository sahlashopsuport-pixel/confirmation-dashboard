import { describe, it, expect } from 'vitest';
import { aggregateSKUData, type AgentData, type OrderRow } from '../client/src/lib/sheets';

// Helper to create a proper OrderRow with rawStatus
function makeOrder(reference: string, status: string, rawStatus: string): OrderRow {
  return {
    date: '01/01/2026',
    status,
    rawStatus,
    quantity: 1,
    deliveryStatus: '',
    callNote: '',
    productCode: '',
    productName: 'Test Product',
    customerName: 'Customer',
    phone: '0000000000',
    address: 'Test',
    price: 100,
    reference,
    week: 1,
    orderType: 'NORMAL',
    productCategory: 'other',
  };
}

// Helper to create mock agent with proper OrderRow objects
function createAgent(name: string, orders: OrderRow[]): AgentData {
  return {
    name,
    sheetUrl: `https://docs.google.com/spreadsheets/d/${name}/edit`,
    totalOrders: orders.length,
    confirmed: orders.filter(o => o.status === 'confirmed').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
    postponed: orders.filter(o => o.status === 'postponed').length,
    closedNumber: 0,
    noAnswer: 0,
    callbackAttempts: 0,
    other: 0,
    confirmationRate: 0,
    cancellationRate: 0,
    upsellCount: 0,
    upsellRate: 0,
    totalRevenue: 0,
    avgOrderValue: 0,
    dailyBreakdown: {},
    weeklyBreakdown: {},
    typeBreakdown: {},
    normalOrders: 0,
    normalConfirmed: 0,
    normalConfirmationRate: 0,
    abandonedOrders: 0,
    abandonedConfirmed: 0,
    abandonedConfirmationRate: 0,
    leadScore: -1,
    dateFormatWarning: 0,
    orders,
  };
}

describe('SKU Call Breakdown', () => {
  it('should classify اتصل 1-6 into correct call breakdown fields', () => {
    const orders = [
      makeOrder('SKU-A', 'callback', 'اتصل 1'),
      makeOrder('SKU-A', 'callback', 'اتصل 2'),
      makeOrder('SKU-A', 'callback', 'اتصل 3'),
      makeOrder('SKU-A', 'callback', 'اتصل 4'),
      makeOrder('SKU-A', 'callback', 'اتصل 5'),
      makeOrder('SKU-A', 'callback', 'اتصل 6'),
    ];
    const agents = [createAgent('Agent1', orders)];
    const result = aggregateSKUData(agents);

    expect(result.length).toBe(1);
    const cb = result[0].callBreakdown;
    expect(cb.call1).toBe(1);
    expect(cb.call2).toBe(1);
    expect(cb.call3).toBe(1);
    expect(cb.call4).toBe(1);
    expect(cb.call5).toBe(1);
    expect(cb.call6).toBe(1);
  });

  it('should classify waiting, postponed, closed, noAnswer statuses', () => {
    const orders = [
      makeOrder('SKU-B', 'waiting', 'قيد الانتظار'),
      makeOrder('SKU-B', 'waiting', 'قيد الانتظار'),
      makeOrder('SKU-B', 'postponed', 'تأجيل'),
      makeOrder('SKU-B', 'closed', 'رقم مغلق'),
      makeOrder('SKU-B', 'no_answer', 'لا يجيب'),
      makeOrder('SKU-B', 'no_answer', 'لا يجيب'),
    ];
    const agents = [createAgent('Agent1', orders)];
    const result = aggregateSKUData(agents);

    const cb = result[0].callBreakdown;
    expect(cb.waiting).toBe(2);
    expect(cb.postponed).toBe(1);
    expect(cb.closed).toBe(1);
    expect(cb.noAnswer).toBe(2);
  });

  it('should not count confirmed/cancelled in call breakdown', () => {
    const orders = [
      makeOrder('SKU-C', 'confirmed', 'تأكيد'),
      makeOrder('SKU-C', 'cancelled', 'ملغي'),
      makeOrder('SKU-C', 'callback', 'اتصل 1'),
    ];
    const agents = [createAgent('Agent1', orders)];
    const result = aggregateSKUData(agents);

    const cb = result[0].callBreakdown;
    // Only اتصل 1 should be counted
    expect(cb.call1).toBe(1);
    expect(cb.call2).toBe(0);
    expect(cb.waiting).toBe(0);
    expect(cb.postponed).toBe(0);
    expect(cb.closed).toBe(0);
    expect(cb.noAnswer).toBe(0);
  });

  it('should aggregate call breakdown per agent within a SKU', () => {
    const agent1Orders = [
      makeOrder('SKU-D', 'callback', 'اتصل 1'),
      makeOrder('SKU-D', 'callback', 'اتصل 2'),
      makeOrder('SKU-D', 'confirmed', 'تأكيد'),
    ];
    const agent2Orders = [
      makeOrder('SKU-D', 'callback', 'اتصل 1'),
      makeOrder('SKU-D', 'waiting', 'قيد الانتظار'),
    ];

    const agents = [
      createAgent('Agent1', agent1Orders),
      createAgent('Agent2', agent2Orders),
    ];
    const result = aggregateSKUData(agents);

    expect(result.length).toBe(1);
    const sku = result[0];

    // Overall call breakdown
    expect(sku.callBreakdown.call1).toBe(2); // 1 from each agent
    expect(sku.callBreakdown.call2).toBe(1); // only Agent1
    expect(sku.callBreakdown.waiting).toBe(1); // only Agent2

    // Per-agent breakdown
    const a1 = sku.agentBreakdown.find(a => a.agentName === 'Agent1');
    expect(a1).toBeDefined();
    expect(a1!.callBreakdown.call1).toBe(1);
    expect(a1!.callBreakdown.call2).toBe(1);
    expect(a1!.callBreakdown.waiting).toBe(0);

    const a2 = sku.agentBreakdown.find(a => a.agentName === 'Agent2');
    expect(a2).toBeDefined();
    expect(a2!.callBreakdown.call1).toBe(1);
    expect(a2!.callBreakdown.call2).toBe(0);
    expect(a2!.callBreakdown.waiting).toBe(1);
  });

  it('should handle orders with undefined rawStatus gracefully', () => {
    const orders = [
      makeOrder('SKU-E', 'confirmed', 'تأكيد'),
      { ...makeOrder('SKU-E', 'cancelled', 'ملغي'), rawStatus: undefined as any },
    ];
    const agents = [createAgent('Agent1', orders)];

    // Should not throw
    const result = aggregateSKUData(agents);
    expect(result.length).toBe(1);
    expect(result[0].totalOrders).toBe(2);
  });

  it('should produce zero call breakdown for SKUs with only confirmed/cancelled', () => {
    const orders = [
      makeOrder('SKU-F', 'confirmed', 'تأكيد'),
      makeOrder('SKU-F', 'confirmed', 'تأكيد'),
      makeOrder('SKU-F', 'cancelled', 'ملغي'),
    ];
    const agents = [createAgent('Agent1', orders)];
    const result = aggregateSKUData(agents);

    const cb = result[0].callBreakdown;
    expect(cb.call1).toBe(0);
    expect(cb.call2).toBe(0);
    expect(cb.call3).toBe(0);
    expect(cb.call4).toBe(0);
    expect(cb.call5).toBe(0);
    expect(cb.call6).toBe(0);
    expect(cb.waiting).toBe(0);
    expect(cb.postponed).toBe(0);
    expect(cb.closed).toBe(0);
    expect(cb.noAnswer).toBe(0);
  });

  it('should handle multiple call attempts for the same SKU (pipeline analysis)', () => {
    // Simulate a SKU where many orders are still in early call stages
    const orders = [
      makeOrder('SKU-PIPELINE', 'callback', 'اتصل 1'),
      makeOrder('SKU-PIPELINE', 'callback', 'اتصل 1'),
      makeOrder('SKU-PIPELINE', 'callback', 'اتصل 1'),
      makeOrder('SKU-PIPELINE', 'callback', 'اتصل 2'),
      makeOrder('SKU-PIPELINE', 'callback', 'اتصل 2'),
      makeOrder('SKU-PIPELINE', 'confirmed', 'تأكيد'),
      makeOrder('SKU-PIPELINE', 'cancelled', 'ملغي'),
    ];
    const agents = [createAgent('Agent1', orders)];
    const result = aggregateSKUData(agents);

    const sku = result[0];
    expect(sku.totalOrders).toBe(7);
    expect(sku.confirmed).toBe(1);
    expect(sku.cancelled).toBe(1);
    expect(sku.callBreakdown.call1).toBe(3);
    expect(sku.callBreakdown.call2).toBe(2);

    // Pipeline (excluding call6): call1-5 + waiting + postponed + closed + noAnswer
    const pipeline = sku.callBreakdown.call1 + sku.callBreakdown.call2 +
      sku.callBreakdown.call3 + sku.callBreakdown.call4 +
      sku.callBreakdown.call5 + sku.callBreakdown.waiting +
      sku.callBreakdown.postponed + sku.callBreakdown.closed +
      sku.callBreakdown.noAnswer;
    expect(pipeline).toBe(5);
  });

  it('should treat call6 as cancelled in adjusted rates (SKU level)', () => {
    const orders = [
      makeOrder('SKU-ADJ', 'confirmed', 'تأكيد'),
      makeOrder('SKU-ADJ', 'confirmed', 'تأكيد'),
      makeOrder('SKU-ADJ', 'cancelled', 'ملغي'),
      makeOrder('SKU-ADJ', 'callback', 'اتصل 6'),
      makeOrder('SKU-ADJ', 'callback', 'اتصل 6'),
    ];
    const agents = [createAgent('Agent1', orders)];
    const result = aggregateSKUData(agents);

    const sku = result[0];
    // Raw: 2 confirmed, 1 cancelled, 2 call6
    expect(sku.confirmed).toBe(2);
    expect(sku.cancelled).toBe(1);
    expect(sku.callBreakdown.call6).toBe(2);

    // Adjusted: call6 counted as cancelled → adjCancelled = 1 + 2 = 3
    expect(sku.adjCancelled).toBe(3);
    // adjConfirmationRate = 2/5 * 100 = 40
    expect(sku.adjConfirmationRate).toBeCloseTo(40, 1);
    // adjCancellationRate = 3/5 * 100 = 60
    expect(sku.adjCancellationRate).toBeCloseTo(60, 1);
  });

  it('should treat call6 as cancelled in adjusted rates (per-agent level)', () => {
    const agent1Orders = [
      makeOrder('SKU-AGENT-ADJ', 'confirmed', 'تأكيد'),
      makeOrder('SKU-AGENT-ADJ', 'callback', 'اتصل 6'),
    ];
    const agent2Orders = [
      makeOrder('SKU-AGENT-ADJ', 'cancelled', 'ملغي'),
      makeOrder('SKU-AGENT-ADJ', 'callback', 'اتصل 6'),
      makeOrder('SKU-AGENT-ADJ', 'callback', 'اتصل 6'),
    ];
    const agents = [
      createAgent('Agent1', agent1Orders),
      createAgent('Agent2', agent2Orders),
    ];
    const result = aggregateSKUData(agents);
    const sku = result[0];

    // Agent1: 1 confirmed, 0 cancelled raw, 1 call6 → adjCancelled = 1
    const a1 = sku.agentBreakdown.find(a => a.agentName === 'Agent1')!;
    expect(a1.cancelled).toBe(0);
    expect(a1.adjCancelled).toBe(1);
    expect(a1.adjConfirmationRate).toBeCloseTo(50, 1); // 1/2
    expect(a1.adjCancellationRate).toBeCloseTo(50, 1); // 1/2

    // Agent2: 0 confirmed, 1 cancelled raw, 2 call6 → adjCancelled = 3
    const a2 = sku.agentBreakdown.find(a => a.agentName === 'Agent2')!;
    expect(a2.cancelled).toBe(1);
    expect(a2.adjCancelled).toBe(3);
    expect(a2.adjConfirmationRate).toBeCloseTo(0, 1); // 0/3
    expect(a2.adjCancellationRate).toBeCloseTo(100, 1); // 3/3
  });

  it('should exclude call6 from pipeline calculation', () => {
    const orders = [
      makeOrder('SKU-PIPE', 'callback', 'اتصل 1'),
      makeOrder('SKU-PIPE', 'callback', 'اتصل 5'),
      makeOrder('SKU-PIPE', 'callback', 'اتصل 6'), // exhausted — NOT in pipeline
      makeOrder('SKU-PIPE', 'callback', 'اتصل 6'), // exhausted — NOT in pipeline
      makeOrder('SKU-PIPE', 'waiting', 'قيد الانتظار'),
      makeOrder('SKU-PIPE', 'closed', 'رقم مغلق'),
      makeOrder('SKU-PIPE', 'no_answer', 'لا يجيب'),
      makeOrder('SKU-PIPE', 'confirmed', 'تأكيد'),
    ];
    const agents = [createAgent('Agent1', orders)];
    const result = aggregateSKUData(agents);
    const sku = result[0];

    // Pipeline = call1(1) + call5(1) + waiting(1) + closed(1) + noAnswer(1) = 5
    // call6(2) is excluded
    const cb = sku.callBreakdown;
    const pipeline = cb.call1 + cb.call2 + cb.call3 + cb.call4 + cb.call5 +
      cb.waiting + cb.postponed + cb.closed + cb.noAnswer;
    expect(pipeline).toBe(5);
    expect(cb.call6).toBe(2); // still tracked in breakdown, just not in pipeline
  });
});
