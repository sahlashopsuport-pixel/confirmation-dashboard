import { describe, it, expect } from 'vitest';
import { aggregateSKUData, type AgentData, type SKUData } from '../client/src/lib/sheets';

// Helper to create mock agent data
function createMockAgent(name: string, orders: Array<{ reference: string; status: string }>): AgentData {
  return {
    name,
    sheetUrl: `https://docs.google.com/spreadsheets/d/${name}/edit`,
    totalOrders: orders.length,
    confirmed: orders.filter(o => o.status === 'confirmed').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
    postponed: orders.filter(o => o.status === 'postponed').length,
    closedLine: 0,
    other: orders.filter(o => !['confirmed', 'cancelled', 'postponed'].includes(o.status)).length,
    confirmationRate: 0,
    cancellationRate: 0,
    upsellQty: 0,
    upsellRate: 0,
    weeklyData: {},
    orders: orders.map((o, i) => ({
      id: `${name}-${i}`,
      name: `Customer ${i}`,
      phone: '0000000000',
      city: 'Test City',
      product: 'Test Product',
      quantity: 1,
      status: o.status as any,
      reference: o.reference,
      week: 'Week 1',
      type: undefined,
    })),
    normalOrders: 0,
    abandonedOrders: 0,
    normalConfirmed: 0,
    normalConfirmationRate: 0,
    abandonedConfirmed: 0,
    abandonedConfirmationRate: 0,
  };
}

describe('aggregateSKUData', () => {
  it('should aggregate orders by SKU across agents', () => {
    const agents = [
      createMockAgent('Agent1', [
        { reference: 'SKU-A', status: 'confirmed' },
        { reference: 'SKU-A', status: 'cancelled' },
        { reference: 'SKU-B', status: 'confirmed' },
      ]),
      createMockAgent('Agent2', [
        { reference: 'SKU-A', status: 'confirmed' },
        { reference: 'SKU-B', status: 'confirmed' },
        { reference: 'SKU-B', status: 'cancelled' },
      ]),
    ];

    const result = aggregateSKUData(agents);

    // Should have 2 SKUs
    expect(result.length).toBe(2);

    // SKU-A: 3 total (2 confirmed, 1 cancelled) — from Agent1 (2) + Agent2 (1)
    const skuA = result.find(s => s.sku === 'SKU-A');
    expect(skuA).toBeDefined();
    expect(skuA!.totalOrders).toBe(3);
    expect(skuA!.confirmed).toBe(2);
    expect(skuA!.cancelled).toBe(1);

    // SKU-B: 3 total (2 confirmed, 1 cancelled) — from Agent1 (1) + Agent2 (2)
    const skuB = result.find(s => s.sku === 'SKU-B');
    expect(skuB).toBeDefined();
    expect(skuB!.totalOrders).toBe(3);
    expect(skuB!.confirmed).toBe(2);
    expect(skuB!.cancelled).toBe(1);
  });

  it('should include per-agent breakdown for each SKU', () => {
    const agents = [
      createMockAgent('SOHEIB', [
        { reference: 'TESTICALM', status: 'confirmed' },
        { reference: 'TESTICALM', status: 'confirmed' },
        { reference: 'TESTICALM', status: 'cancelled' },
      ]),
      createMockAgent('LINA', [
        { reference: 'TESTICALM', status: 'confirmed' },
        { reference: 'TESTICALM', status: 'postponed' },
      ]),
    ];

    const result = aggregateSKUData(agents);
    expect(result.length).toBe(1);

    const sku = result[0];
    expect(sku.sku).toBe('TESTICALM');
    expect(sku.totalOrders).toBe(5);

    // Agent breakdown should have 2 agents
    expect(sku.agentBreakdown.length).toBe(2);

    // SOHEIB: 3 orders, 2 confirmed, 1 cancelled → 66.7% conf rate
    const soheib = sku.agentBreakdown.find(a => a.agentName === 'SOHEIB');
    expect(soheib).toBeDefined();
    expect(soheib!.totalOrders).toBe(3);
    expect(soheib!.confirmed).toBe(2);
    expect(soheib!.cancelled).toBe(1);
    expect(soheib!.confirmationRate).toBeCloseTo(66.67, 1);

    // LINA: 2 orders, 1 confirmed, 0 cancelled → 50% conf rate
    const lina = sku.agentBreakdown.find(a => a.agentName === 'LINA');
    expect(lina).toBeDefined();
    expect(lina!.totalOrders).toBe(2);
    expect(lina!.confirmed).toBe(1);
    expect(lina!.cancelled).toBe(0);
    expect(lina!.postponed).toBe(1);
    expect(lina!.confirmationRate).toBe(50);
  });

  it('should sort agent breakdown by confirmation rate descending', () => {
    const agents = [
      createMockAgent('LowPerformer', [
        { reference: 'SKU-X', status: 'cancelled' },
        { reference: 'SKU-X', status: 'cancelled' },
        { reference: 'SKU-X', status: 'confirmed' },
      ]),
      createMockAgent('HighPerformer', [
        { reference: 'SKU-X', status: 'confirmed' },
        { reference: 'SKU-X', status: 'confirmed' },
        { reference: 'SKU-X', status: 'confirmed' },
      ]),
      createMockAgent('MidPerformer', [
        { reference: 'SKU-X', status: 'confirmed' },
        { reference: 'SKU-X', status: 'cancelled' },
      ]),
    ];

    const result = aggregateSKUData(agents);
    const sku = result[0];

    // Should be sorted: HighPerformer (100%) > MidPerformer (50%) > LowPerformer (33.3%)
    expect(sku.agentBreakdown[0].agentName).toBe('HighPerformer');
    expect(sku.agentBreakdown[0].confirmationRate).toBe(100);
    expect(sku.agentBreakdown[1].agentName).toBe('MidPerformer');
    expect(sku.agentBreakdown[1].confirmationRate).toBe(50);
    expect(sku.agentBreakdown[2].agentName).toBe('LowPerformer');
    expect(sku.agentBreakdown[2].confirmationRate).toBeCloseTo(33.33, 1);
  });

  it('should label orders with no reference as UNKNOWN', () => {
    const agents = [
      createMockAgent('Agent1', [
        { reference: '', status: 'confirmed' },
        { reference: '', status: 'cancelled' },
      ]),
    ];

    const result = aggregateSKUData(agents);
    const unknown = result.find(s => s.sku === 'UNKNOWN');
    expect(unknown).toBeDefined();
    expect(unknown!.totalOrders).toBe(2);
  });

  it('should sort SKUs by total orders descending by default', () => {
    const agents = [
      createMockAgent('Agent1', [
        { reference: 'SmallSKU', status: 'confirmed' },
        { reference: 'BigSKU', status: 'confirmed' },
        { reference: 'BigSKU', status: 'confirmed' },
        { reference: 'BigSKU', status: 'cancelled' },
        { reference: 'MedSKU', status: 'confirmed' },
        { reference: 'MedSKU', status: 'cancelled' },
      ]),
    ];

    const result = aggregateSKUData(agents);
    expect(result[0].sku).toBe('BigSKU');
    expect(result[0].totalOrders).toBe(3);
    expect(result[1].sku).toBe('MedSKU');
    expect(result[1].totalOrders).toBe(2);
    expect(result[2].sku).toBe('SmallSKU');
    expect(result[2].totalOrders).toBe(1);
  });

  it('should calculate correct confirmation and cancellation rates', () => {
    const agents = [
      createMockAgent('Agent1', [
        { reference: 'SKU-RATE', status: 'confirmed' },
        { reference: 'SKU-RATE', status: 'confirmed' },
        { reference: 'SKU-RATE', status: 'confirmed' },
        { reference: 'SKU-RATE', status: 'cancelled' },
        { reference: 'SKU-RATE', status: 'postponed' },
      ]),
    ];

    const result = aggregateSKUData(agents);
    const sku = result[0];
    expect(sku.confirmationRate).toBe(60); // 3/5 = 60%
    expect(sku.cancellationRate).toBe(20); // 1/5 = 20%
  });

  it('should handle empty agents array', () => {
    const result = aggregateSKUData([]);
    expect(result).toEqual([]);
  });

  it('should handle agents with no orders', () => {
    const agents = [createMockAgent('EmptyAgent', [])];
    const result = aggregateSKUData(agents);
    expect(result).toEqual([]);
  });
});

describe('aggregateSKUData — upsell merge', () => {
  it('merges upsell variant into base SKU', () => {
    const agents = [
      createMockAgent('Agent1', [
        { reference: 'maissa-FB-3177-mk maissa testicalm 268 sh', status: 'confirmed' },
        { reference: 'maissa-FB-3177-mk maissa testicalm 268 sh', status: 'cancelled' },
        { reference: 'maissa-FB-3177-mk maissa testicalm 268 sh testicalmupsell', status: 'confirmed' },
      ]),
    ];

    const result = aggregateSKUData(agents);
    // Should be 1 merged SKU, not 2
    expect(result).toHaveLength(1);
    expect(result[0].totalOrders).toBe(3);
    expect(result[0].confirmed).toBe(2);
    expect(result[0].cancelled).toBe(1);
  });

  it('uses the non-upsell name as display name', () => {
    const agents = [
      createMockAgent('Agent1', [
        { reference: 'sku-base testicalmupsell', status: 'confirmed' },
        { reference: 'sku-base', status: 'confirmed' },
      ]),
    ];

    const result = aggregateSKUData(agents);
    expect(result).toHaveLength(1);
    // Display name should be the base, not the upsell variant
    expect(result[0].sku.toLowerCase()).not.toContain('upsell');
  });
});

describe('aggregateSKUData — whitespace/case normalization', () => {
  it('merges SKUs with different casing', () => {
    const agents = [
      createMockAgent('Agent1', [
        { reference: 'SKU-Alpha', status: 'confirmed' },
      ]),
      createMockAgent('Agent2', [
        { reference: 'sku-alpha', status: 'cancelled' },
      ]),
    ];

    const result = aggregateSKUData(agents);
    expect(result).toHaveLength(1);
    expect(result[0].totalOrders).toBe(2);
    expect(result[0].confirmed).toBe(1);
    expect(result[0].cancelled).toBe(1);
  });

  it('merges SKUs with extra whitespace differences', () => {
    const agents = [
      createMockAgent('Agent1', [
        { reference: 'maissa-FB- 3177-mk maissa testicalm 268 sh', status: 'confirmed' },
        { reference: 'maissa-FB-  3177-mk  maissa testicalm 268 sh', status: 'confirmed' },
      ]),
    ];

    const result = aggregateSKUData(agents);
    expect(result).toHaveLength(1);
    expect(result[0].totalOrders).toBe(2);
  });

  it('merges 3 variants: base + duplicate base + upsell', () => {
    const agents = [
      createMockAgent('Agent1', [
        { reference: 'maissa-FB- 3177-mk maissa testicalm 268 sh', status: 'confirmed' },
        { reference: 'maissa-FB- 3177-mk maissa testicalm 268 sh', status: 'confirmed' },
        { reference: 'maissa-FB- 3177-mk maissa testicalm 268 sh', status: 'cancelled' },
      ]),
      createMockAgent('Agent2', [
        { reference: 'maissa-FB- 3177-mk maissa testicalm 268 sh', status: 'confirmed' },
        { reference: 'maissa-FB- 3177-mk maissa testicalm 268 sh testicalmupsell', status: 'confirmed' },
      ]),
    ];

    const result = aggregateSKUData(agents);
    // All 5 orders should be in 1 SKU
    expect(result).toHaveLength(1);
    expect(result[0].totalOrders).toBe(5);
    expect(result[0].confirmed).toBe(4);
    expect(result[0].cancelled).toBe(1);
    // Agent breakdown should still have both agents
    expect(result[0].agentBreakdown).toHaveLength(2);
  });
});
