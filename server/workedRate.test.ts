import { describe, it, expect } from 'vitest';

/**
 * Tests for the Worked Rate calculation logic.
 * 
 * Worked Rate = confirmed / (totalOrders - noStatus) * 100
 * This excludes untouched (freshly assigned) leads from the denominator
 * to give a fairer picture of agent performance.
 */

describe('Worked Rate Calculation Logic', () => {
  // Helper that mirrors the calculation in sheets.ts
  function calcWorkedRate(confirmed: number, totalOrders: number, noStatus: number): number {
    const workedOrders = totalOrders - noStatus;
    return workedOrders > 0 ? (confirmed / workedOrders) * 100 : 0;
  }

  function calcTotalRate(confirmed: number, totalOrders: number): number {
    return totalOrders > 0 ? (confirmed / totalOrders) * 100 : 0;
  }

  it('should return higher worked rate when there are untouched leads', () => {
    // Rym's case: 863 total, 813 worked, 50 untouched
    const confirmed = 500;
    const totalOrders = 863;
    const noStatus = 50;

    const totalRate = calcTotalRate(confirmed, totalOrders);
    const workedRate = calcWorkedRate(confirmed, totalOrders, noStatus);

    expect(totalRate).toBeCloseTo(57.94, 1);
    expect(workedRate).toBeCloseTo(61.50, 1);
    expect(workedRate).toBeGreaterThan(totalRate);
  });

  it('should equal total rate when there are no untouched leads', () => {
    const confirmed = 500;
    const totalOrders = 800;
    const noStatus = 0;

    const totalRate = calcTotalRate(confirmed, totalOrders);
    const workedRate = calcWorkedRate(confirmed, totalOrders, noStatus);

    expect(workedRate).toBeCloseTo(totalRate, 2);
  });

  it('should return 0 when all leads are untouched', () => {
    const confirmed = 0;
    const totalOrders = 100;
    const noStatus = 100;

    const workedRate = calcWorkedRate(confirmed, totalOrders, noStatus);
    expect(workedRate).toBe(0);
  });

  it('should handle edge case of 0 total orders', () => {
    const workedRate = calcWorkedRate(0, 0, 0);
    expect(workedRate).toBe(0);
  });

  it('should calculate overall worked rate from multiple agents', () => {
    const agents = [
      { confirmed: 500, totalOrders: 863, noStatus: 50 },
      { confirmed: 300, totalOrders: 400, noStatus: 0 },
      { confirmed: 200, totalOrders: 350, noStatus: 30 },
    ];

    const totalConfirmed = agents.reduce((s, a) => s + a.confirmed, 0);
    const totalOrders = agents.reduce((s, a) => s + a.totalOrders, 0);
    const totalNoStatus = agents.reduce((s, a) => s + a.noStatus, 0);

    const overallTotalRate = calcTotalRate(totalConfirmed, totalOrders);
    const overallWorkedRate = calcWorkedRate(totalConfirmed, totalOrders, totalNoStatus);

    // 1000 / 1613 = 62.0%
    expect(overallTotalRate).toBeCloseTo(62.0, 0);
    // 1000 / (1613 - 80) = 1000 / 1533 = 65.2%
    expect(overallWorkedRate).toBeCloseTo(65.2, 0);
    expect(overallWorkedRate).toBeGreaterThan(overallTotalRate);
  });

  it('should show meaningful difference for agents with many fresh leads', () => {
    // Agent just received 200 new leads on top of 500 existing worked leads
    const confirmed = 300;
    const totalOrders = 700;
    const noStatus = 200;

    const totalRate = calcTotalRate(confirmed, totalOrders);
    const workedRate = calcWorkedRate(confirmed, totalOrders, noStatus);

    // Total: 300/700 = 42.9%
    expect(totalRate).toBeCloseTo(42.9, 0);
    // Worked: 300/500 = 60.0%
    expect(workedRate).toBeCloseTo(60.0, 0);
    // The difference is significant — 17 percentage points
    expect(workedRate - totalRate).toBeGreaterThan(15);
  });
});
