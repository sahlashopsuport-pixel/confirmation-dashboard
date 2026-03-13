import { describe, it, expect } from 'vitest';

const COST_CALCULATOR_API_URL = process.env.COST_CALCULATOR_API_URL;

describe('Cost Calculator API URL secret', () => {
  it('COST_CALCULATOR_API_URL is set', () => {
    expect(COST_CALCULATOR_API_URL).toBeDefined();
    expect(COST_CALCULATOR_API_URL).not.toBe('');
    expect(COST_CALCULATOR_API_URL).toContain('manus.space');
  });

  it('can reach the cost data endpoint', async () => {
    const url = `${COST_CALCULATOR_API_URL}/api/public/cost-data?sheet=Testicalm%20DZ&month=2&year=2026`;
    const res = await fetch(url);
    expect(res.ok).toBe(true);
    const body = await res.json();
    // API returns { count, totalOrders, totalSpend, filters, data: [...] }
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('count');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    // Validate entry structure
    const entry = body.data[0];
    expect(entry).toHaveProperty('buyer');
    expect(entry).toHaveProperty('buyerDisplayName');
    expect(entry).toHaveProperty('sku');
    expect(entry).toHaveProperty('date');
    expect(entry).toHaveProperty('orders');
    expect(entry).toHaveProperty('spend');
    expect(entry).toHaveProperty('costPerLead');
    expect(entry).toHaveProperty('platform');
    expect(entry).toHaveProperty('sheet');
  });
});
