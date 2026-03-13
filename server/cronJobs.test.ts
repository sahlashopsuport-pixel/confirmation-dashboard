import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('CronJobs module', () => {
  it('exports startCronJobs function', async () => {
    const mod = await import('./cronJobs');
    expect(typeof mod.startCronJobs).toBe('function');
  });

  it('startCronJobs does not throw', async () => {
    const mod = await import('./cronJobs');
    // Should not throw when called
    expect(() => mod.startCronJobs()).not.toThrow();
  });
});

describe('Page size limits', () => {
  it('queryAssignedLeads caps pageSize at 500', async () => {
    // The function should cap at 500
    const { queryAssignedLeads } = await import('./db');
    // Call with pageSize 1000 — should be capped to 500
    const result = await queryAssignedLeads({ pageSize: 1000 });
    expect(result.pageSize).toBeLessThanOrEqual(500);
  });

  it('queryAssignedLeads allows pageSize of 500', async () => {
    const { queryAssignedLeads } = await import('./db');
    const result = await queryAssignedLeads({ pageSize: 500 });
    expect(result.pageSize).toBe(500);
  });

  it('queryAssignedLeads defaults to 50 when no pageSize given', async () => {
    const { queryAssignedLeads } = await import('./db');
    const result = await queryAssignedLeads({});
    expect(result.pageSize).toBe(50);
  });
});
