import { describe, it, expect } from 'vitest';

/**
 * Test the date range filtering logic from sheets.ts
 * Since filterDashboardByDate is a client-side function, we replicate the core logic inline.
 */

// Replicate parseDateToTime from sheets.ts
function parseDateToTime(dateStr: string): number {
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
  }
  return 0;
}

interface MockOrder {
  date: string; // dd/mm/yyyy
  status: string;
}

interface MockAgent {
  name: string;
  orders: MockOrder[];
}

// Replicate the filter logic from filterDashboardByDate
function filterByDateRange(
  agents: MockAgent[],
  dateOrRange: string | { from: string; to: string } | null
): MockAgent[] {
  if (!dateOrRange) return agents;
  if (typeof dateOrRange === 'string' && (dateOrRange === 'all' || dateOrRange === '')) return agents;

  let fromTime: number;
  let toTime: number;

  if (typeof dateOrRange === 'string') {
    fromTime = parseDateToTime(dateOrRange);
    toTime = fromTime;
  } else {
    fromTime = parseDateToTime(dateOrRange.from);
    toTime = parseDateToTime(dateOrRange.to);
  }

  return agents.map(agent => ({
    ...agent,
    orders: agent.orders.filter(o => {
      const t = parseDateToTime(o.date);
      return t >= fromTime && t <= toTime;
    }),
  })).filter(a => a.orders.length > 0);
}

describe('parseDateToTime', () => {
  it('parses dd/mm/yyyy format correctly', () => {
    const t = parseDateToTime('21/02/2026');
    const d = new Date(t);
    expect(d.getDate()).toBe(21);
    expect(d.getMonth()).toBe(1); // Feb = 1
    expect(d.getFullYear()).toBe(2026);
  });

  it('handles single-digit day/month', () => {
    const t = parseDateToTime('01/01/2026');
    const d = new Date(t);
    expect(d.getDate()).toBe(1);
    expect(d.getMonth()).toBe(0); // Jan = 0
    expect(d.getFullYear()).toBe(2026);
  });

  it('returns 0 for invalid format', () => {
    expect(parseDateToTime('invalid')).toBe(0);
    expect(parseDateToTime('')).toBe(0);
  });
});

describe('Date Range Filter Logic', () => {
  const mockAgents: MockAgent[] = [
    {
      name: 'Agent A',
      orders: [
        { date: '15/02/2026', status: 'confirmed' },
        { date: '16/02/2026', status: 'confirmed' },
        { date: '17/02/2026', status: 'cancelled' },
        { date: '18/02/2026', status: 'confirmed' },
        { date: '19/02/2026', status: 'confirmed' },
        { date: '20/02/2026', status: 'cancelled' },
        { date: '21/02/2026', status: 'confirmed' },
      ],
    },
    {
      name: 'Agent B',
      orders: [
        { date: '16/02/2026', status: 'confirmed' },
        { date: '18/02/2026', status: 'cancelled' },
        { date: '20/02/2026', status: 'confirmed' },
      ],
    },
    {
      name: 'Agent C',
      orders: [
        { date: '15/02/2026', status: 'confirmed' },
        { date: '21/02/2026', status: 'cancelled' },
      ],
    },
  ];

  it('returns all agents when filter is null', () => {
    const result = filterByDateRange(mockAgents, null);
    expect(result).toHaveLength(3);
    expect(result[0].orders).toHaveLength(7);
  });

  it('returns all agents when filter is "all"', () => {
    const result = filterByDateRange(mockAgents, 'all');
    expect(result).toHaveLength(3);
  });

  it('returns all agents when filter is empty string', () => {
    const result = filterByDateRange(mockAgents, '');
    expect(result).toHaveLength(3);
  });

  it('filters by single date string (backward compat)', () => {
    const result = filterByDateRange(mockAgents, '16/02/2026');
    expect(result).toHaveLength(2); // Agent A and B have orders on 16th
    expect(result[0].name).toBe('Agent A');
    expect(result[0].orders).toHaveLength(1);
    expect(result[0].orders[0].date).toBe('16/02/2026');
    expect(result[1].name).toBe('Agent B');
    expect(result[1].orders).toHaveLength(1);
  });

  it('filters by date range object', () => {
    const result = filterByDateRange(mockAgents, { from: '16/02/2026', to: '18/02/2026' });
    // Agent A: 16, 17, 18 = 3 orders
    // Agent B: 16, 18 = 2 orders
    // Agent C: none in range
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Agent A');
    expect(result[0].orders).toHaveLength(3);
    expect(result[1].name).toBe('Agent B');
    expect(result[1].orders).toHaveLength(2);
  });

  it('includes boundary dates in range', () => {
    const result = filterByDateRange(mockAgents, { from: '15/02/2026', to: '15/02/2026' });
    // Single day range
    expect(result).toHaveLength(2); // Agent A and C
    expect(result[0].orders).toHaveLength(1);
    expect(result[0].orders[0].date).toBe('15/02/2026');
    expect(result[1].orders).toHaveLength(1);
    expect(result[1].orders[0].date).toBe('15/02/2026');
  });

  it('removes agents with 0 orders in range', () => {
    const result = filterByDateRange(mockAgents, { from: '19/02/2026', to: '19/02/2026' });
    // Only Agent A has an order on 19th
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Agent A');
  });

  it('handles wide date range covering all data', () => {
    const result = filterByDateRange(mockAgents, { from: '01/01/2026', to: '31/12/2026' });
    expect(result).toHaveLength(3);
    expect(result[0].orders).toHaveLength(7);
    expect(result[1].orders).toHaveLength(3);
    expect(result[2].orders).toHaveLength(2);
  });

  it('returns empty when range has no matching orders', () => {
    const result = filterByDateRange(mockAgents, { from: '01/01/2025', to: '31/01/2025' });
    expect(result).toHaveLength(0);
  });

  it('computes correct counts after date range filter', () => {
    const result = filterByDateRange(mockAgents, { from: '18/02/2026', to: '21/02/2026' });
    // Agent A: 18, 19, 20, 21 = 4 orders (confirmed, confirmed, cancelled, confirmed)
    // Agent B: 18, 20 = 2 orders (cancelled, confirmed)
    // Agent C: 21 = 1 order (cancelled)
    const totalOrders = result.reduce((s, a) => s + a.orders.length, 0);
    const confirmed = result.reduce((s, a) => s + a.orders.filter(o => o.status === 'confirmed').length, 0);
    const cancelled = result.reduce((s, a) => s + a.orders.filter(o => o.status === 'cancelled').length, 0);

    expect(totalOrders).toBe(7);
    expect(confirmed).toBe(4); // A: 3 confirmed, B: 1 confirmed
    expect(cancelled).toBe(3); // A: 1 cancelled, B: 1 cancelled, C: 1 cancelled
  });

  it('works with "Last 7 days" style range', () => {
    // Simulate: from 15/02 to 21/02 = 7 days
    const result = filterByDateRange(mockAgents, { from: '15/02/2026', to: '21/02/2026' });
    expect(result).toHaveLength(3);
    // All orders fall within this range
    expect(result[0].orders).toHaveLength(7);
    expect(result[1].orders).toHaveLength(3);
    expect(result[2].orders).toHaveLength(2);
  });

  it('handles cross-month ranges', () => {
    const crossMonthAgents: MockAgent[] = [
      {
        name: 'Agent X',
        orders: [
          { date: '28/01/2026', status: 'confirmed' },
          { date: '31/01/2026', status: 'confirmed' },
          { date: '01/02/2026', status: 'cancelled' },
          { date: '05/02/2026', status: 'confirmed' },
        ],
      },
    ];
    const result = filterByDateRange(crossMonthAgents, { from: '30/01/2026', to: '03/02/2026' });
    expect(result).toHaveLength(1);
    expect(result[0].orders).toHaveLength(2); // 31/01 and 01/02
    expect(result[0].orders[0].date).toBe('31/01/2026');
    expect(result[0].orders[1].date).toBe('01/02/2026');
  });
});

describe('getAvailableDates logic', () => {
  // Replicate the getAvailableDates logic
  function getAvailableDates(agents: MockAgent[]): string[] {
    const dateSet = new Set<string>();
    for (const agent of agents) {
      for (const order of agent.orders) {
        if (order.date) dateSet.add(order.date);
      }
    }
    return Array.from(dateSet).sort((a, b) => {
      return parseDateToTime(b) - parseDateToTime(a);
    });
  }

  it('collects unique dates from all agents sorted newest first', () => {
    const agents: MockAgent[] = [
      { name: 'A', orders: [{ date: '15/02/2026', status: 'ok' }, { date: '17/02/2026', status: 'ok' }] },
      { name: 'B', orders: [{ date: '15/02/2026', status: 'ok' }, { date: '16/02/2026', status: 'ok' }] },
    ];
    const dates = getAvailableDates(agents);
    expect(dates).toEqual(['17/02/2026', '16/02/2026', '15/02/2026']);
  });

  it('returns empty array for no agents', () => {
    expect(getAvailableDates([])).toEqual([]);
  });
});
