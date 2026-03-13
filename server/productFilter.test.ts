import { describe, it, expect } from 'vitest';

/**
 * Test the product category detection and filterDashboardByProduct logic.
 * Since these are client-side functions, we test the core logic inline.
 */

// Replicate the product detection logic from sheets.ts parseOrders
function detectProductCategory(productName: string): 'testicalm' | 'menopause' | 'other' {
  const lower = (productName || '').toLowerCase();
  if (lower.includes('testicalm')) return 'testicalm';
  if (lower.includes('meno')) return 'menopause';
  return 'other';
}

describe('Product Category Detection', () => {
  it('detects testicalm products', () => {
    expect(detectProductCategory('Testicalm')).toBe('testicalm');
    expect(detectProductCategory('22testicalm علاج دوالي الخصيةTesticalm')).toBe('testicalm');
    expect(detectProductCategory('testicalm')).toBe('testicalm');
    expect(detectProductCategory('TESTICALM PREMIUM')).toBe('testicalm');
    expect(detectProductCategory('اشتري قطعتين testicalm')).toBe('testicalm');
  });

  it('detects menopause products', () => {
    expect(detectProductCategory('menopause')).toBe('menopause');
    expect(detectProductCategory('Menopause Relief')).toBe('menopause');
    expect(detectProductCategory('meno cream')).toBe('menopause');
    expect(detectProductCategory('MENO')).toBe('menopause');
  });

  it('returns other for unknown products', () => {
    expect(detectProductCategory('')).toBe('other');
    expect(detectProductCategory('Some Random Product')).toBe('other');
    expect(detectProductCategory('hairloss oil')).toBe('other');
  });

  it('handles edge cases', () => {
    expect(detectProductCategory(null as any)).toBe('other');
    expect(detectProductCategory(undefined as any)).toBe('other');
    expect(detectProductCategory('   ')).toBe('other');
  });
});

// Replicate the filter logic from filterDashboardByProduct
type ProductCategory = 'all' | 'testicalm' | 'menopause' | 'other';

interface MockOrder {
  status: string;
  productCategory: 'testicalm' | 'menopause' | 'other';
}

interface MockAgent {
  name: string;
  orders: MockOrder[];
}

function filterAgentOrders(agents: MockAgent[], product: ProductCategory) {
  if (product === 'all') return agents;
  return agents.map(agent => ({
    ...agent,
    orders: agent.orders.filter(o => o.productCategory === product),
  })).filter(a => a.orders.length > 0);
}

describe('Product Filter Logic', () => {
  const mockAgents: MockAgent[] = [
    {
      name: 'Agent A',
      orders: [
        { status: 'confirmed', productCategory: 'testicalm' },
        { status: 'confirmed', productCategory: 'testicalm' },
        { status: 'cancelled', productCategory: 'menopause' },
        { status: 'confirmed', productCategory: 'menopause' },
        { status: 'confirmed', productCategory: 'other' },
      ],
    },
    {
      name: 'Agent B',
      orders: [
        { status: 'confirmed', productCategory: 'testicalm' },
        { status: 'cancelled', productCategory: 'testicalm' },
        { status: 'confirmed', productCategory: 'menopause' },
      ],
    },
    {
      name: 'Agent C',
      orders: [
        { status: 'confirmed', productCategory: 'menopause' },
        { status: 'cancelled', productCategory: 'menopause' },
      ],
    },
  ];

  it('returns all agents when filter is "all"', () => {
    const result = filterAgentOrders(mockAgents, 'all');
    expect(result).toHaveLength(3);
    expect(result[0].orders).toHaveLength(5);
  });

  it('filters to testicalm only', () => {
    const result = filterAgentOrders(mockAgents, 'testicalm');
    expect(result).toHaveLength(2); // Agent C has no testicalm
    expect(result[0].name).toBe('Agent A');
    expect(result[0].orders).toHaveLength(2);
    expect(result[0].orders.every(o => o.productCategory === 'testicalm')).toBe(true);
    expect(result[1].name).toBe('Agent B');
    expect(result[1].orders).toHaveLength(2);
  });

  it('filters to menopause only', () => {
    const result = filterAgentOrders(mockAgents, 'menopause');
    expect(result).toHaveLength(3); // All agents have menopause orders
    expect(result[0].orders).toHaveLength(2); // Agent A: 2 menopause
    expect(result[1].orders).toHaveLength(1); // Agent B: 1 menopause
    expect(result[2].orders).toHaveLength(2); // Agent C: 2 menopause
  });

  it('removes agents with 0 orders for filtered product', () => {
    const result = filterAgentOrders(mockAgents, 'other');
    expect(result).toHaveLength(1); // Only Agent A has 'other' orders
    expect(result[0].name).toBe('Agent A');
    expect(result[0].orders).toHaveLength(1);
  });

  it('computes correct confirmation counts after filtering', () => {
    const testicalm = filterAgentOrders(mockAgents, 'testicalm');
    const totalOrders = testicalm.reduce((s, a) => s + a.orders.length, 0);
    const confirmed = testicalm.reduce((s, a) => s + a.orders.filter(o => o.status === 'confirmed').length, 0);
    const cancelled = testicalm.reduce((s, a) => s + a.orders.filter(o => o.status === 'cancelled').length, 0);
    
    expect(totalOrders).toBe(4); // 2 from A + 2 from B
    expect(confirmed).toBe(3); // 2 from A + 1 from B
    expect(cancelled).toBe(1); // 0 from A + 1 from B
    expect(totalOrders > 0 ? (confirmed / totalOrders) * 100 : 0).toBe(75);
  });
});
