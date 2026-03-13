import { describe, it, expect } from 'vitest';

/**
 * Tests for the product name multi-select filter feature.
 * Tests the getUniqueProductNames extraction and filterDashboardByProductNames logic.
 */

// ── Replicate getUniqueProductNames logic ──

interface MockOrder {
  productName: string;
  status: string;
  quantity: number;
}

interface MockAgent {
  name: string;
  orders: MockOrder[];
}

function getUniqueProductNames(agents: MockAgent[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const agent of agents) {
    for (const order of agent.orders) {
      const name = (order.productName || '').trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function filterAgentsByProductNames(agents: MockAgent[], productNames: Set<string>) {
  if (productNames.size === 0) return agents;
  return agents.map(agent => ({
    ...agent,
    orders: agent.orders.filter(o => productNames.has((o.productName || '').trim())),
  })).filter(a => a.orders.length > 0);
}

// ── Test data ──

const mockAgents: MockAgent[] = [
  {
    name: 'Soheib',
    orders: [
      { productName: 'testicalm', status: 'confirmed', quantity: 1 },
      { productName: 'testicalm', status: 'confirmed', quantity: 2 },
      { productName: 'testicalm 22', status: 'cancelled', quantity: 1 },
      { productName: 'menopause', status: 'confirmed', quantity: 1 },
      { productName: 'TESTICALM UPSELL', status: 'confirmed', quantity: 3 },
    ],
  },
  {
    name: 'Amira',
    orders: [
      { productName: 'testicalm', status: 'confirmed', quantity: 1 },
      { productName: 'menopause', status: 'cancelled', quantity: 1 },
      { productName: 'menopause', status: 'confirmed', quantity: 1 },
      { productName: 'testicalm 22', status: 'confirmed', quantity: 1 },
    ],
  },
  {
    name: 'Fatima',
    orders: [
      { productName: 'menopause', status: 'confirmed', quantity: 1 },
      { productName: 'menopause', status: 'confirmed', quantity: 2 },
    ],
  },
  {
    name: 'Khaled',
    orders: [
      { productName: '', status: 'confirmed', quantity: 1 },
      { productName: '  ', status: 'cancelled', quantity: 1 },
    ],
  },
];

// ── Tests ──

describe('getUniqueProductNames', () => {
  it('extracts unique product names from all agents', () => {
    const products = getUniqueProductNames(mockAgents);
    const names = products.map(p => p.name);
    expect(names).toContain('testicalm');
    expect(names).toContain('testicalm 22');
    expect(names).toContain('menopause');
    expect(names).toContain('TESTICALM UPSELL');
  });

  it('sorts products by order count descending', () => {
    const products = getUniqueProductNames(mockAgents);
    // menopause: 4 orders (1+2+1+1 from Soheib/Amira/Fatima)
    // Wait, let me count: Soheib has 1 menopause, Amira has 2, Fatima has 2 = 5 total? No.
    // Soheib: testicalm(2), testicalm 22(1), menopause(1), TESTICALM UPSELL(1)
    // Amira: testicalm(1), menopause(2), testicalm 22(1)
    // Fatima: menopause(2)
    // menopause total = 1+2+2 = 5
    // testicalm total = 2+1 = 3
    // testicalm 22 total = 1+1 = 2
    // TESTICALM UPSELL = 1
    expect(products[0].name).toBe('menopause');
    expect(products[0].count).toBe(5);
    expect(products[1].name).toBe('testicalm');
    expect(products[1].count).toBe(3);
    expect(products[2].name).toBe('testicalm 22');
    expect(products[2].count).toBe(2);
    expect(products[3].name).toBe('TESTICALM UPSELL');
    expect(products[3].count).toBe(1);
  });

  it('excludes empty and whitespace-only product names', () => {
    const products = getUniqueProductNames(mockAgents);
    const names = products.map(p => p.name);
    expect(names).not.toContain('');
    expect(names).not.toContain('  ');
  });

  it('returns empty array when no agents have products', () => {
    const products = getUniqueProductNames([
      { name: 'Empty', orders: [{ productName: '', status: 'confirmed', quantity: 1 }] },
    ]);
    expect(products).toHaveLength(0);
  });

  it('returns empty array when no agents exist', () => {
    const products = getUniqueProductNames([]);
    expect(products).toHaveLength(0);
  });

  it('treats product names as case-sensitive (preserves original casing)', () => {
    const products = getUniqueProductNames(mockAgents);
    const names = products.map(p => p.name);
    // "testicalm" and "TESTICALM UPSELL" are separate entries
    expect(names).toContain('testicalm');
    expect(names).toContain('TESTICALM UPSELL');
  });
});

describe('filterAgentsByProductNames (multi-select)', () => {
  it('returns all agents unfiltered when selection is empty', () => {
    const result = filterAgentsByProductNames(mockAgents, new Set());
    expect(result).toHaveLength(4);
    expect(result[0].orders).toHaveLength(5);
  });

  it('filters to a single product name', () => {
    const result = filterAgentsByProductNames(mockAgents, new Set(['testicalm']));
    // Soheib: 2 testicalm orders, Amira: 1 testicalm order
    expect(result).toHaveLength(2);
    expect(result.find(a => a.name === 'Soheib')!.orders).toHaveLength(2);
    expect(result.find(a => a.name === 'Amira')!.orders).toHaveLength(1);
  });

  it('filters to multiple product names', () => {
    const result = filterAgentsByProductNames(mockAgents, new Set(['testicalm', 'menopause']));
    // Soheib: 2 testicalm + 1 menopause = 3
    // Amira: 1 testicalm + 2 menopause = 3
    // Fatima: 2 menopause = 2
    expect(result).toHaveLength(3);
    expect(result.find(a => a.name === 'Soheib')!.orders).toHaveLength(3);
    expect(result.find(a => a.name === 'Amira')!.orders).toHaveLength(3);
    expect(result.find(a => a.name === 'Fatima')!.orders).toHaveLength(2);
  });

  it('removes agents with zero matching orders', () => {
    const result = filterAgentsByProductNames(mockAgents, new Set(['TESTICALM UPSELL']));
    // Only Soheib has this product
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Soheib');
    expect(result[0].orders).toHaveLength(1);
  });

  it('returns empty when no agents match the selected products', () => {
    const result = filterAgentsByProductNames(mockAgents, new Set(['nonexistent product']));
    expect(result).toHaveLength(0);
  });

  it('handles variant product names correctly', () => {
    // "testicalm" and "testicalm 22" are treated as separate products
    const result = filterAgentsByProductNames(mockAgents, new Set(['testicalm 22']));
    expect(result).toHaveLength(2); // Soheib and Amira
    expect(result.find(a => a.name === 'Soheib')!.orders).toHaveLength(1);
    expect(result.find(a => a.name === 'Amira')!.orders).toHaveLength(1);
    // None of the "testicalm" (without 22) orders should be included
    for (const agent of result) {
      for (const order of agent.orders) {
        expect(order.productName).toBe('testicalm 22');
      }
    }
  });

  it('preserves order data integrity after filtering', () => {
    const result = filterAgentsByProductNames(mockAgents, new Set(['menopause']));
    const fatima = result.find(a => a.name === 'Fatima')!;
    expect(fatima.orders).toHaveLength(2);
    expect(fatima.orders[0].status).toBe('confirmed');
    expect(fatima.orders[0].quantity).toBe(1);
    expect(fatima.orders[1].status).toBe('confirmed');
    expect(fatima.orders[1].quantity).toBe(2);
  });

  it('computes correct confirmation counts after multi-product filter', () => {
    const result = filterAgentsByProductNames(mockAgents, new Set(['testicalm', 'testicalm 22']));
    const totalOrders = result.reduce((s, a) => s + a.orders.length, 0);
    const confirmed = result.reduce((s, a) => s + a.orders.filter(o => o.status === 'confirmed').length, 0);
    const cancelled = result.reduce((s, a) => s + a.orders.filter(o => o.status === 'cancelled').length, 0);

    // Soheib: testicalm(2 confirmed) + testicalm 22(1 cancelled) = 3 orders
    // Amira: testicalm(1 confirmed) + testicalm 22(1 confirmed) = 2 orders
    expect(totalOrders).toBe(5);
    expect(confirmed).toBe(4);
    expect(cancelled).toBe(1);
    expect(totalOrders > 0 ? (confirmed / totalOrders) * 100 : 0).toBe(80);
  });

  it('selecting all products is equivalent to no filter', () => {
    const allProducts = getUniqueProductNames(mockAgents);
    const allNames = new Set(allProducts.map(p => p.name));
    const filtered = filterAgentsByProductNames(mockAgents, allNames);
    const unfiltered = filterAgentsByProductNames(mockAgents, new Set());

    // Khaled has only empty product names, so he's excluded in "all products" but included in "no filter"
    // This is expected behavior — agents with no product data are excluded when specific products are selected
    const filteredOrders = filtered.reduce((s, a) => s + a.orders.length, 0);
    const unfilteredOrders = unfiltered.reduce((s, a) => s + a.orders.length, 0);
    // Khaled has 2 orders with empty product names
    expect(unfilteredOrders - filteredOrders).toBe(2);
  });
});

describe('Product name trimming', () => {
  it('trims whitespace from product names during extraction', () => {
    const agents: MockAgent[] = [
      {
        name: 'Test',
        orders: [
          { productName: '  testicalm  ', status: 'confirmed', quantity: 1 },
          { productName: 'testicalm', status: 'confirmed', quantity: 1 },
        ],
      },
    ];
    const products = getUniqueProductNames(agents);
    expect(products).toHaveLength(1);
    expect(products[0].name).toBe('testicalm');
    expect(products[0].count).toBe(2);
  });

  it('trims whitespace during filtering to match extracted names', () => {
    const agents: MockAgent[] = [
      {
        name: 'Test',
        orders: [
          { productName: '  testicalm  ', status: 'confirmed', quantity: 1 },
          { productName: 'testicalm', status: 'confirmed', quantity: 1 },
          { productName: 'menopause', status: 'confirmed', quantity: 1 },
        ],
      },
    ];
    const result = filterAgentsByProductNames(agents, new Set(['testicalm']));
    expect(result).toHaveLength(1);
    expect(result[0].orders).toHaveLength(2); // Both trimmed versions match
  });
});
