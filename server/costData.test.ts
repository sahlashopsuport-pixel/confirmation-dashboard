import { describe, it, expect } from 'vitest';
import {
  classifyProduct,
  detectBuyer,
  normalizeSKU,
  scoreAndDecide,
  buildDecisionMatrix,
  buildConfSKULookup,
  calculateProfitMetrics,
  getEconomics,
  aggregateApiToCostSKUs,
  buildMarketMapFromApi,
  mapSheetToDashboardSlug,
  TESTICALM_DZ_ECONOMICS,
  DEFAULT_ECONOMICS,
  type CostApiEntry,
  type CostSKUEntry,
} from '../client/src/lib/costData';
import type { SKUData } from '../client/src/lib/sheets';

/** Helper to create a minimal SKUData for testing */
function mkSKU(sku: string, totalOrders: number, confirmed: number, cancelled: number): SKUData {
  const adjCancelled = cancelled;
  const postponed = totalOrders - confirmed - cancelled;
  const workedOrders = totalOrders; // simplified for tests
  return {
    sku,
    totalOrders,
    confirmed,
    cancelled,
    postponed: Math.max(0, postponed),
    other: 0,
    confirmationRate: totalOrders > 0 ? (confirmed / totalOrders) * 100 : 0,
    cancellationRate: totalOrders > 0 ? (cancelled / totalOrders) * 100 : 0,
    adjConfirmationRate: workedOrders > 0 ? (confirmed / workedOrders) * 100 : 0,
    adjCancellationRate: workedOrders > 0 ? (adjCancelled / workedOrders) * 100 : 0,
    adjCancelled,
    agentBreakdown: [],
    callBreakdown: { call1: 0, call2: 0, call3: 0, call4: 0, call5: 0, call6: 0 },
  };
}

describe('classifyProduct', () => {
  it('detects Testicalm', () => {
    expect(classifyProduct('romaissa-TT-004- Testicalm Fabruary 2026')).toBe('Testicalm');
    expect(classifyProduct('STIF-FB-8813-TESTICALM ACT 01')).toBe('Testicalm');
  });

  it('detects Prostate Oil', () => {
    expect(classifyProduct('romaissa-FB-9338-prostateOil team 62')).toBe('Prostate Oil');
    expect(classifyProduct('Maissa-FB-8411- mk maissa prostaoil 158')).toBe('Prostate Oil');
  });

  it('detects Varice Oil', () => {
    expect(classifyProduct('maissa-FB-8485- mk maissa varice lib 36')).toBe('Varice Oil');
  });

  it('detects Colon Oil', () => {
    expect(classifyProduct('STIF-FB-1544-COLON ONE CHAHADA 01')).toBe('Colon Oil');
  });

  it('detects IHair', () => {
    expect(classifyProduct('omar-FB-9805-Ihair him 3 om')).toBe('IHair');
  });

  it('detects Hemorrhoids', () => {
    expect(classifyProduct('romaissa-FB-0958-Aissani Hemoroides 73')).toBe('Hemorrhoids');
  });

  it('detects Menopause', () => {
    expect(classifyProduct('nesrine-FB-menopause-oil')).toBe('Menopause');
  });

  it('detects Herbo Calm', () => {
    expect(classifyProduct('romaissa-FB-herbocalm-01')).toBe('Herbo Calm');
  });

  it('detects Viconis', () => {
    expect(classifyProduct('omar-FB-viconis-hair')).toBe('Viconis');
  });

  it('returns Other for unknown', () => {
    expect(classifyProduct('STIF-TL-CZ-SCALEXISLAM.005')).toBe('Other');
  });
});

describe('detectBuyer', () => {
  it('detects Romaissa', () => {
    expect(detectBuyer('romaissa-TT-004- Testicalm')).toBe('Romaissa');
  });

  it('detects Maissa', () => {
    expect(detectBuyer('maissa-TT-888-TESTICALM')).toBe('Maissa');
  });

  it('detects Islam/STIF', () => {
    expect(detectBuyer('STIF-FB-8813-TESTICALM')).toBe('Islam');
    expect(detectBuyer('islam-something')).toBe('Islam');
  });

  it('detects Omar', () => {
    expect(detectBuyer('omar-FB-9805-Ihair')).toBe('Omar');
  });

  it('detects Nesrine', () => {
    expect(detectBuyer('nesrine-FB-692-Prostatoil')).toBe('Nesrine');
  });

  it('returns Unknown for unrecognized', () => {
    expect(detectBuyer('unknown-sku-name')).toBe('Unknown');
  });
});

describe('normalizeSKU', () => {
  it('lowercases and trims', () => {
    expect(normalizeSKU('  TESTICALM ACT  ')).toBe('testicalm act');
  });

  it('collapses whitespace', () => {
    expect(normalizeSKU('romaissa-TT-004-  Testicalm   Feb')).toBe('romaissa-tt-004- testicalm feb');
  });
});

describe('mapSheetToDashboardSlug', () => {
  it('maps Libya to libya', () => {
    expect(mapSheetToDashboardSlug('Libya')).toBe('libya');
  });

  it('maps Testicalm DZ to algeria', () => {
    expect(mapSheetToDashboardSlug('Testicalm DZ')).toBe('algeria');
  });

  it('maps Herbo Calm DZ to algeria', () => {
    expect(mapSheetToDashboardSlug('Herbo Calm DZ')).toBe('algeria');
  });

  it('maps Menopause to algeria', () => {
    expect(mapSheetToDashboardSlug('Menopause')).toBe('algeria');
  });

  it('maps Viconis to viconis', () => {
    expect(mapSheetToDashboardSlug('Viconis')).toBe('viconis');
  });

  it('maps Tunisia to tunisia', () => {
    expect(mapSheetToDashboardSlug('Tunisia')).toBe('tunisia');
  });

  it('returns unknown for unrecognized sheet', () => {
    expect(mapSheetToDashboardSlug('Random Sheet')).toBe('unknown');
  });
});

describe('getEconomics', () => {
  it('returns Testicalm DZ economics for Testicalm + DZ market', () => {
    const econ = getEconomics('Testicalm', 'Testicalm DZ');
    expect(econ).toEqual(TESTICALM_DZ_ECONOMICS);
  });

  it('returns default economics for other products', () => {
    const econ = getEconomics('Prostate Oil', 'Libya');
    expect(econ).toEqual(DEFAULT_ECONOMICS);
  });
});

describe('calculateProfitMetrics', () => {
  it('calculates full funnel for Testicalm DZ', () => {
    const result = calculateProfitMetrics({
      avgCPL: 2.50,
      adjConfirmationRate: 50,
      economics: TESTICALM_DZ_ECONOMICS,
    });
    expect(result.costPerConfirmed).toBeCloseTo(5.0);
    expect(result.costPerDelivered).toBeCloseTo(9.09, 1);
    expect(result.adCostDA).toBeCloseTo(2272.73, 0);
    expect(result.profitPerDeliveryDA).toBeCloseTo(427.27, 0);
  });

  it('returns zeros when conf rate is 0', () => {
    const result = calculateProfitMetrics({
      avgCPL: 3.0,
      adjConfirmationRate: 0,
      economics: TESTICALM_DZ_ECONOMICS,
    });
    expect(result.costPerConfirmed).toBe(0);
    expect(result.profitPerDeliveryDA).toBe(0);
  });

  it('returns zeros when CPL is 0', () => {
    const result = calculateProfitMetrics({
      avgCPL: 0,
      adjConfirmationRate: 60,
      economics: TESTICALM_DZ_ECONOMICS,
    });
    expect(result.costPerConfirmed).toBe(0);
    expect(result.profitPerDeliveryDA).toBe(0);
  });

  it('shows negative profit for expensive SKU', () => {
    const result = calculateProfitMetrics({
      avgCPL: 5.0,
      adjConfirmationRate: 25,
      economics: TESTICALM_DZ_ECONOMICS,
    });
    expect(result.profitPerDeliveryDA).toBeLessThan(0);
    expect(result.costPerDelivered).toBeCloseTo(36.36, 1);
  });

  it('shows high profit for cheap + high conf SKU', () => {
    const result = calculateProfitMetrics({
      avgCPL: 1.50,
      adjConfirmationRate: 70,
      economics: TESTICALM_DZ_ECONOMICS,
    });
    expect(result.profitPerDeliveryDA).toBeGreaterThan(1500);
    expect(result.profitPerDeliveryDA).toBeCloseTo(1726, -1);
  });
});

describe('scoreAndDecide (profit-based)', () => {
  const economics = TESTICALM_DZ_ECONOMICS;

  it('returns KEEP for high profit SKU (>700 DA)', () => {
    const result = scoreAndDecide({
      adjConfirmationRate: 60,
      costPerConfirmedOrder: 3.33,
      costPerDelivered: 6.06,
      profitPerDeliveryDA: 1185,
      pipelineRate: 10,
      confOrders: 200,
      avgCPL: 2.0,
      productCategory: 'Testicalm',
      economics,
    });
    expect(result.decision).toBe('KEEP');
    expect(result.score).toBeGreaterThanOrEqual(55);
    expect(result.confidence).toBe('high');
  });

  it('returns KILL for negative profit SKU', () => {
    const result = scoreAndDecide({
      adjConfirmationRate: 20,
      costPerConfirmedOrder: 25,
      costPerDelivered: 45.45,
      profitPerDeliveryDA: -8663,
      pipelineRate: 5,
      confOrders: 100,
      avgCPL: 5.0,
      productCategory: 'Testicalm',
      economics,
    });
    expect(result.decision).toBe('KILL');
    expect(result.score).toBe(0);
    expect(result.reasons[0]).toContain('LOSING MONEY');
  });

  it('returns KILL for low profit SKU (<300 DA)', () => {
    const result = scoreAndDecide({
      adjConfirmationRate: 40,
      costPerConfirmedOrder: 8.75,
      costPerDelivered: 15.91,
      profitPerDeliveryDA: -1277,
      pipelineRate: 5,
      confOrders: 50,
      avgCPL: 3.5,
      productCategory: 'Testicalm',
      economics,
    });
    expect(result.decision).toBe('KILL');
  });

  it('returns WATCH for borderline profit (300-700 DA)', () => {
    const result = scoreAndDecide({
      adjConfirmationRate: 50,
      costPerConfirmedOrder: 5.0,
      costPerDelivered: 9.09,
      profitPerDeliveryDA: 427,
      pipelineRate: 10,
      confOrders: 80,
      avgCPL: 2.5,
      productCategory: 'Testicalm',
      economics,
    });
    expect(result.decision).toBe('WATCH');
    expect(result.score).toBeGreaterThanOrEqual(35);
    expect(result.score).toBeLessThan(55);
  });

  it('upgrades KILL to WATCH for very small samples (<20)', () => {
    const result = scoreAndDecide({
      adjConfirmationRate: 20,
      costPerConfirmedOrder: 25,
      costPerDelivered: 45.45,
      profitPerDeliveryDA: -8663,
      pipelineRate: 0,
      confOrders: 10,
      avgCPL: 5.0,
      productCategory: 'Testicalm',
      economics,
    });
    expect(result.decision).toBe('WATCH');
    expect(result.confidence).toBe('low');
    expect(result.reasons.some((r: string) => r.includes('Upgraded to WATCH'))).toBe(true);
  });

  it('upgrades KILL to WATCH for high pipeline (>30%)', () => {
    const result = scoreAndDecide({
      adjConfirmationRate: 30,
      costPerConfirmedOrder: 10,
      costPerDelivered: 18.18,
      profitPerDeliveryDA: -1845,
      pipelineRate: 40,
      confOrders: 50,
      avgCPL: 3.0,
      productCategory: 'Testicalm',
      economics,
    });
    expect(result.decision).toBe('WATCH');
    expect(result.reasons.some((r: string) => r.includes('high pipeline'))).toBe(true);
  });

  it('returns WATCH with no confirmation data', () => {
    const result = scoreAndDecide({
      adjConfirmationRate: 0,
      costPerConfirmedOrder: 0,
      costPerDelivered: 0,
      profitPerDeliveryDA: 0,
      pipelineRate: 0,
      confOrders: 0,
      avgCPL: 3.0,
      productCategory: 'Testicalm',
      economics,
    });
    expect(result.decision).toBe('WATCH');
    expect(result.score).toBe(50);
    expect(result.reasons[0]).toContain('No confirmation data');
  });
});

describe('buildConfSKULookup', () => {
  it('builds lookup with normalized keys', () => {
    const skus: SKUData[] = [
      mkSKU('romaissa-FB-9513-TesticalmAMS-asx802 Veo+', 200, 120, 50),
      mkSKU('STIF-FB-1544-TESTICALM ACT 03', 100, 55, 30),
    ];
    const lookup = buildConfSKULookup(skus);
    expect(lookup.size).toBe(2);
    expect(lookup.has('romaissa-fb-9513-testicalmams-asx802 veo+')).toBeTruthy();
    // normalizeSKU collapses spaces
    expect(lookup.has(normalizeSKU('romaissa-FB-9513-TesticalmAMS-asx802 Veo+'))).toBeTruthy();
  });

  it('keeps SKU with more orders when duplicates exist', () => {
    const skus: SKUData[] = [
      mkSKU('test-sku', 50, 25, 15),
      mkSKU('TEST-SKU', 100, 60, 30),
    ];
    const lookup = buildConfSKULookup(skus);
    expect(lookup.size).toBe(1);
    const entry = lookup.get('test-sku');
    expect(entry!.totalOrders).toBe(100);
  });
});

describe('buildDecisionMatrix (per-SKU matching)', () => {
  it('matches Calculator SKU to confirmation dashboard SKU by normalized name', () => {
    const costSKUs: CostSKUEntry[] = [
      { sku: 'romaissa-FB-9513-TesticalmAMS-asx802 Veo+', totalOrders: 100, totalSpend: 250, avgCPL: 2.5, buyerCount: 1, isActive: true },
    ];
    const confSKUs: SKUData[] = [
      mkSKU('romaissa-FB-9513-TesticalmAMS-asx802 Veo+', 200, 120, 50),
    ];
    const marketMap = { 'romaissa-FB-9513-TesticalmAMS-asx802 Veo+': 'Testicalm DZ' };

    const matrix = buildDecisionMatrix(costSKUs, confSKUs, marketMap);
    expect(matrix).toHaveLength(1);
    expect(matrix[0].confMatched).toBe(true);
    expect(matrix[0].adjConfirmationRate).toBe(60); // 120/200 * 100
    expect(matrix[0].confOrders).toBe(200);
    expect(matrix[0].confirmed).toBe(120);
  });

  it('uses per-SKU conf rate (not market average)', () => {
    const costSKUs: CostSKUEntry[] = [
      { sku: 'romaissa-testicalm-01', totalOrders: 100, totalSpend: 250, avgCPL: 2.5, buyerCount: 1, isActive: true },
      { sku: 'islam-testicalm-02', totalOrders: 50, totalSpend: 200, avgCPL: 4.0, buyerCount: 1, isActive: true },
    ];
    const confSKUs: SKUData[] = [
      mkSKU('romaissa-testicalm-01', 300, 180, 80),  // 60% conf
      mkSKU('islam-testicalm-02', 100, 40, 40),       // 40% conf
    ];
    const marketMap = { 'romaissa-testicalm-01': 'Testicalm DZ', 'islam-testicalm-02': 'Testicalm DZ' };

    const matrix = buildDecisionMatrix(costSKUs, confSKUs, marketMap);
    expect(matrix).toHaveLength(2);

    const rom = matrix.find(r => r.sku === 'romaissa-testicalm-01')!;
    const isl = matrix.find(r => r.sku === 'islam-testicalm-02')!;

    // Each gets its OWN conf rate, not a shared market average
    expect(rom.adjConfirmationRate).toBe(60);
    expect(isl.adjConfirmationRate).toBe(40);
    expect(rom.confMatched).toBe(true);
    expect(isl.confMatched).toBe(true);
  });

  it('marks unmatched SKUs as confMatched=false with WATCH decision', () => {
    const costSKUs: CostSKUEntry[] = [
      { sku: 'orphan-sku-not-in-dashboard', totalOrders: 50, totalSpend: 100, avgCPL: 2.0, buyerCount: 1, isActive: true },
    ];
    const confSKUs: SKUData[] = [
      mkSKU('some-other-sku', 200, 120, 50),
    ];
    const marketMap: Record<string, string> = {};

    const matrix = buildDecisionMatrix(costSKUs, confSKUs, marketMap);
    expect(matrix).toHaveLength(1);
    expect(matrix[0].confMatched).toBe(false);
    expect(matrix[0].confOrders).toBe(0);
    expect(matrix[0].adjConfirmationRate).toBe(0);
    expect(matrix[0].decision).toBe('WATCH');
  });

  it('returns empty array when no cost SKUs', () => {
    const matrix = buildDecisionMatrix([], [], {});
    expect(matrix).toHaveLength(0);
  });

  it('preserves isActive through to DecisionMatrixRow', () => {
    const costSKUs: CostSKUEntry[] = [
      { sku: 'active-sku', totalOrders: 100, totalSpend: 250, avgCPL: 2.5, buyerCount: 1, isActive: true },
      { sku: 'off-sku', totalOrders: 50, totalSpend: 100, avgCPL: 2.0, buyerCount: 1, isActive: false },
    ];
    const confSKUs: SKUData[] = [
      mkSKU('active-sku', 200, 120, 50),
      mkSKU('off-sku', 100, 60, 30),
    ];
    const marketMap = { 'active-sku': 'Testicalm DZ', 'off-sku': 'Libya' };

    const matrix = buildDecisionMatrix(costSKUs, confSKUs, marketMap);
    const activeRow = matrix.find(r => r.sku === 'active-sku');
    const offRow = matrix.find(r => r.sku === 'off-sku');
    expect(activeRow!.isActive).toBe(true);
    expect(offRow!.isActive).toBe(false);
  });

  it('includes dashboardSlug and market fields', () => {
    const costSKUs: CostSKUEntry[] = [
      { sku: 'libya-sku', totalOrders: 100, totalSpend: 200, avgCPL: 2.0, buyerCount: 1, isActive: true },
    ];
    const confSKUs: SKUData[] = [
      mkSKU('libya-sku', 150, 90, 40),
    ];
    const marketMap = { 'libya-sku': 'Libya' };

    const matrix = buildDecisionMatrix(costSKUs, confSKUs, marketMap);
    expect(matrix[0].market).toBe('Libya');
    expect(matrix[0].dashboardSlug).toBe('libya');
  });

  it('calculates profit correctly with per-SKU conf rate', () => {
    const costSKUs: CostSKUEntry[] = [
      { sku: 'test-sku-1', totalOrders: 100, totalSpend: 250, avgCPL: 2.5, buyerCount: 1, isActive: true },
    ];
    // 62.5% conf rate: 500 total, 312 confirmed
    const confSKUs: SKUData[] = [
      mkSKU('test-sku-1', 500, 312, 125),
    ];
    const marketMap = { 'test-sku-1': 'Testicalm DZ' };

    const matrix = buildDecisionMatrix(costSKUs, confSKUs, marketMap);
    expect(matrix).toHaveLength(1);

    const row = matrix[0];
    // 312/500 = 62.4% conf rate
    expect(row.adjConfirmationRate).toBeCloseTo(62.4, 0);
    expect(row.costPerConfirmedOrder).toBeCloseTo(4.0, 0);
    expect(row.costPerDelivered).toBeCloseTo(7.27, 1);
    expect(row.profitPerDeliveryDA).toBeGreaterThan(700);
    expect(row.decision).toBe('KEEP');
    expect(row.confMatched).toBe(true);
  });

  it('handles case-insensitive matching', () => {
    const costSKUs: CostSKUEntry[] = [
      { sku: 'STIF-FB-1544-TESTICALM ACT 03', totalOrders: 25, totalSpend: 50, avgCPL: 2.0, buyerCount: 1, isActive: true },
    ];
    const confSKUs: SKUData[] = [
      mkSKU('stif-fb-1544-testicalm act 03', 100, 55, 30),
    ];
    const marketMap = { 'STIF-FB-1544-TESTICALM ACT 03': 'Testicalm DZ' };

    const matrix = buildDecisionMatrix(costSKUs, confSKUs, marketMap);
    expect(matrix).toHaveLength(1);
    expect(matrix[0].confMatched).toBe(true);
    expect(matrix[0].adjConfirmationRate).toBeCloseTo(55, 0);
  });

  it('includes dashboardLeads from matched SKU', () => {
    const costSKUs: CostSKUEntry[] = [
      { sku: 'matched-sku', totalOrders: 100, totalSpend: 250, avgCPL: 2.5, buyerCount: 1, isActive: true },
      { sku: 'unmatched-sku', totalOrders: 50, totalSpend: 100, avgCPL: 2.0, buyerCount: 1, isActive: true },
    ];
    const confSKUs: SKUData[] = [
      mkSKU('matched-sku', 200, 120, 50),
    ];
    const marketMap = { 'matched-sku': 'Testicalm DZ', 'unmatched-sku': 'Testicalm DZ' };

    const matrix = buildDecisionMatrix(costSKUs, confSKUs, marketMap);
    const matched = matrix.find(r => r.sku === 'matched-sku')!;
    const unmatched = matrix.find(r => r.sku === 'unmatched-sku')!;

    // Matched SKU gets dashboardLeads from confSKU.totalOrders
    expect(matched.dashboardLeads).toBe(200);
    expect(matched.confMatched).toBe(true);

    // Unmatched SKU gets 0 dashboardLeads
    expect(unmatched.dashboardLeads).toBe(0);
    expect(unmatched.confMatched).toBe(false);
  });

  it('handles whitespace differences in SKU names', () => {
    const costSKUs: CostSKUEntry[] = [
      { sku: 'romaissa-TT-004-  Testicalm   Feb', totalOrders: 50, totalSpend: 100, avgCPL: 2.0, buyerCount: 1, isActive: true },
    ];
    const confSKUs: SKUData[] = [
      mkSKU('romaissa-TT-004- Testicalm Feb', 200, 110, 60),
    ];
    const marketMap = { 'romaissa-TT-004-  Testicalm   Feb': 'Testicalm DZ' };

    const matrix = buildDecisionMatrix(costSKUs, confSKUs, marketMap);
    expect(matrix).toHaveLength(1);
    expect(matrix[0].confMatched).toBe(true);
  });
});

describe('aggregateApiToCostSKUs', () => {
  const sampleEntries: CostApiEntry[] = [
    { buyer: 'islam', buyerDisplayName: 'Islam', sku: 'STIF-FB-1544-TESTICALM ACT 03', date: '2026-02-04', orders: 10, spend: 19.33, costPerLead: 1.93, platform: 'FB', sheet: 'Testicalm DZ', isActive: true },
    { buyer: 'islam', buyerDisplayName: 'Islam', sku: 'STIF-FB-1544-TESTICALM ACT 03', date: '2026-02-05', orders: 15, spend: 30.00, costPerLead: 2.00, platform: 'FB', sheet: 'Testicalm DZ', isActive: true },
    { buyer: 'romaissa', buyerDisplayName: 'Romaissa', sku: 'romaissa-TT-004- Testicalm Feb', date: '2026-02-04', orders: 50, spend: 100.00, costPerLead: 2.00, platform: 'TT', sheet: 'Testicalm DZ', isActive: false },
    { buyer: 'islam', buyerDisplayName: 'Islam', sku: 'STIF-FB-1544-COLON OIL CH', date: '2026-02-01', orders: 11, spend: 17.87, costPerLead: 1.62, platform: 'FB', sheet: 'Libya', isActive: false },
  ];

  it('aggregates entries by SKU', () => {
    const result = aggregateApiToCostSKUs(sampleEntries);
    expect(result).toHaveLength(3);
  });

  it('sums orders and spend per SKU', () => {
    const result = aggregateApiToCostSKUs(sampleEntries);
    const testicalm = result.find(r => r.sku === 'STIF-FB-1544-TESTICALM ACT 03');
    expect(testicalm).toBeDefined();
    expect(testicalm!.totalOrders).toBe(25);
    expect(testicalm!.totalSpend).toBeCloseTo(49.33);
  });

  it('calculates weighted avg CPL', () => {
    const result = aggregateApiToCostSKUs(sampleEntries);
    const testicalm = result.find(r => r.sku === 'STIF-FB-1544-TESTICALM ACT 03');
    expect(testicalm).toBeDefined();
    expect(testicalm!.avgCPL).toBeCloseTo(1.97, 1);
  });

  it('counts unique buyers per SKU', () => {
    const result = aggregateApiToCostSKUs(sampleEntries);
    const testicalm = result.find(r => r.sku === 'STIF-FB-1544-TESTICALM ACT 03');
    expect(testicalm!.buyerCount).toBe(1);
    const romaissa = result.find(r => r.sku.includes('romaissa'));
    expect(romaissa!.buyerCount).toBe(1);
  });

  it('counts multiple buyers for same SKU', () => {
    const entries: CostApiEntry[] = [
      { buyer: 'islam', buyerDisplayName: 'Islam', sku: 'shared-sku', date: '2026-02-01', orders: 10, spend: 20, costPerLead: 2, platform: 'FB', sheet: 'Libya', isActive: true },
      { buyer: 'romaissa', buyerDisplayName: 'Romaissa', sku: 'shared-sku', date: '2026-02-01', orders: 5, spend: 10, costPerLead: 2, platform: 'TT', sheet: 'Libya', isActive: true },
    ];
    const result = aggregateApiToCostSKUs(entries);
    expect(result).toHaveLength(1);
    expect(result[0].buyerCount).toBe(2);
    expect(result[0].totalOrders).toBe(15);
  });

  it('sorts by total orders descending', () => {
    const result = aggregateApiToCostSKUs(sampleEntries);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].totalOrders).toBeGreaterThanOrEqual(result[i].totalOrders);
    }
  });

  it('returns empty array for empty input', () => {
    expect(aggregateApiToCostSKUs([])).toEqual([]);
  });
});

describe('buildMarketMapFromApi', () => {
  it('maps SKU to sheet/market', () => {
    const entries: CostApiEntry[] = [
      { buyer: 'islam', buyerDisplayName: 'Islam', sku: 'sku-1', date: '2026-02-01', orders: 10, spend: 20, costPerLead: 2, platform: 'FB', sheet: 'Libya', isActive: true },
      { buyer: 'romaissa', buyerDisplayName: 'Romaissa', sku: 'sku-2', date: '2026-02-01', orders: 5, spend: 10, costPerLead: 2, platform: 'TT', sheet: 'Testicalm DZ', isActive: true },
    ];
    const map = buildMarketMapFromApi(entries);
    expect(map['sku-1']).toBe('Libya');
    expect(map['sku-2']).toBe('Testicalm DZ');
  });

  it('uses first occurrence for SKUs appearing in multiple sheets', () => {
    const entries: CostApiEntry[] = [
      { buyer: 'islam', buyerDisplayName: 'Islam', sku: 'sku-1', date: '2026-02-01', orders: 10, spend: 20, costPerLead: 2, platform: 'FB', sheet: 'Libya', isActive: true },
      { buyer: 'islam', buyerDisplayName: 'Islam', sku: 'sku-1', date: '2026-02-02', orders: 5, spend: 10, costPerLead: 2, platform: 'FB', sheet: 'Tunisia', isActive: true },
    ];
    const map = buildMarketMapFromApi(entries);
    expect(map['sku-1']).toBe('Libya');
  });

  it('returns empty object for empty input', () => {
    expect(buildMarketMapFromApi([])).toEqual({});
  });
});

describe('isActive campaign status', () => {
  it('aggregates isActive correctly — active if ANY entry is active', () => {
    const entries: CostApiEntry[] = [
      { buyer: 'islam', buyerDisplayName: 'Islam', sku: 'mixed-sku', date: '2026-02-01', orders: 10, spend: 20, costPerLead: 2, platform: 'FB', sheet: 'Libya', isActive: false },
      { buyer: 'islam', buyerDisplayName: 'Islam', sku: 'mixed-sku', date: '2026-02-02', orders: 5, spend: 10, costPerLead: 2, platform: 'FB', sheet: 'Libya', isActive: true },
    ];
    const result = aggregateApiToCostSKUs(entries);
    expect(result).toHaveLength(1);
    expect(result[0].isActive).toBe(true);
  });

  it('marks SKU as inactive when ALL entries are inactive', () => {
    const entries: CostApiEntry[] = [
      { buyer: 'islam', buyerDisplayName: 'Islam', sku: 'off-sku', date: '2026-02-01', orders: 10, spend: 20, costPerLead: 2, platform: 'FB', sheet: 'Libya', isActive: false },
      { buyer: 'islam', buyerDisplayName: 'Islam', sku: 'off-sku', date: '2026-02-02', orders: 5, spend: 10, costPerLead: 2, platform: 'FB', sheet: 'Libya', isActive: false },
    ];
    const result = aggregateApiToCostSKUs(entries);
    expect(result).toHaveLength(1);
    expect(result[0].isActive).toBe(false);
  });

  it('preserves isActive in sample entries', () => {
    const sampleEntries2: CostApiEntry[] = [
      { buyer: 'islam', buyerDisplayName: 'Islam', sku: 'STIF-FB-1544-TESTICALM ACT 03', date: '2026-02-04', orders: 10, spend: 19.33, costPerLead: 1.93, platform: 'FB', sheet: 'Testicalm DZ', isActive: true },
      { buyer: 'islam', buyerDisplayName: 'Islam', sku: 'STIF-FB-1544-TESTICALM ACT 03', date: '2026-02-05', orders: 15, spend: 30.00, costPerLead: 2.00, platform: 'FB', sheet: 'Testicalm DZ', isActive: true },
      { buyer: 'romaissa', buyerDisplayName: 'Romaissa', sku: 'romaissa-TT-004- Testicalm Feb', date: '2026-02-04', orders: 50, spend: 100.00, costPerLead: 2.00, platform: 'TT', sheet: 'Testicalm DZ', isActive: false },
      { buyer: 'islam', buyerDisplayName: 'Islam', sku: 'STIF-FB-1544-COLON OIL CH', date: '2026-02-01', orders: 11, spend: 17.87, costPerLead: 1.62, platform: 'FB', sheet: 'Libya', isActive: false },
    ];
    const result = aggregateApiToCostSKUs(sampleEntries2);
    const active = result.find(r => r.sku === 'STIF-FB-1544-TESTICALM ACT 03');
    const inactive = result.find(r => r.sku === 'romaissa-TT-004- Testicalm Feb');
    expect(active!.isActive).toBe(true);
    expect(inactive!.isActive).toBe(false);
  });
});

import { stripUpsellSuffix } from '../client/src/lib/costData';

describe('stripUpsellSuffix', () => {
  it('strips testicalmupsell suffix', () => {
    expect(stripUpsellSuffix('romaissa-TT-R.04-Testicalm February2026 testicalmupsell'))
      .toBe('romaissa-TT-R.04-Testicalm February2026');
  });

  it('strips prostateupsell suffix', () => {
    expect(stripUpsellSuffix('omar-FB-prostate oil Feb2026 prostateupsell'))
      .toBe('omar-FB-prostate oil Feb2026');
  });

  it('strips UPSELL suffix case-insensitively', () => {
    expect(stripUpsellSuffix('some-sku TESTICALMUPSELL'))
      .toBe('some-sku');
  });

  it('leaves base SKU unchanged (no upsell suffix)', () => {
    expect(stripUpsellSuffix('romaissa-TT-R.04-Testicalm February2026'))
      .toBe('romaissa-TT-R.04-Testicalm February2026');
  });

  it('leaves empty string unchanged', () => {
    expect(stripUpsellSuffix('')).toBe('');
  });

  it('does not strip "upsell" from middle of SKU name', () => {
    expect(stripUpsellSuffix('upsell-campaign-name'))
      .toBe('upsell-campaign-name');
  });

  it('strips suffix with trailing whitespace', () => {
    expect(stripUpsellSuffix('some-sku testicalmupsell  '))
      .toBe('some-sku');
  });
});

describe('aggregateApiToCostSKUs — upsell merge', () => {
  it('merges upsell variant into base SKU', () => {
    const entries: CostApiEntry[] = [
      { buyer: 'romaissa', buyerDisplayName: 'Romaissa', sku: 'romaissa-TT-R.04-Testicalm February2026', date: '2026-02-04', orders: 50, spend: 100, costPerLead: 2.0, platform: 'TT', sheet: 'Testicalm DZ', isActive: true },
      { buyer: 'romaissa', buyerDisplayName: 'Romaissa', sku: 'romaissa-TT-R.04-Testicalm February2026 testicalmupsell', date: '2026-02-04', orders: 0, spend: 0, costPerLead: 0, platform: 'TT', sheet: 'Testicalm DZ', isActive: true },
    ];
    const result = aggregateApiToCostSKUs(entries);
    // Should produce 1 merged entry, not 2
    expect(result).toHaveLength(1);
    expect(result[0].sku).toBe('romaissa-TT-R.04-Testicalm February2026');
    expect(result[0].totalOrders).toBe(50);
    expect(result[0].totalSpend).toBe(100);
  });

  it('sums orders and spend when upsell has data', () => {
    const entries: CostApiEntry[] = [
      { buyer: 'romaissa', buyerDisplayName: 'Romaissa', sku: 'sku-base', date: '2026-02-04', orders: 40, spend: 80, costPerLead: 2.0, platform: 'TT', sheet: 'Testicalm DZ', isActive: true },
      { buyer: 'romaissa', buyerDisplayName: 'Romaissa', sku: 'sku-base someupsell', date: '2026-02-04', orders: 10, spend: 20, costPerLead: 2.0, platform: 'TT', sheet: 'Testicalm DZ', isActive: false },
    ];
    const result = aggregateApiToCostSKUs(entries);
    expect(result).toHaveLength(1);
    expect(result[0].totalOrders).toBe(50);
    expect(result[0].totalSpend).toBe(100);
    expect(result[0].avgCPL).toBe(2.0);
  });

  it('marks merged SKU as active if base is active', () => {
    const entries: CostApiEntry[] = [
      { buyer: 'romaissa', buyerDisplayName: 'Romaissa', sku: 'sku-base', date: '2026-02-04', orders: 40, spend: 80, costPerLead: 2.0, platform: 'TT', sheet: 'Testicalm DZ', isActive: true },
      { buyer: 'romaissa', buyerDisplayName: 'Romaissa', sku: 'sku-base someupsell', date: '2026-02-04', orders: 0, spend: 0, costPerLead: 0, platform: 'TT', sheet: 'Testicalm DZ', isActive: false },
    ];
    const result = aggregateApiToCostSKUs(entries);
    expect(result[0].isActive).toBe(true);
  });

  it('marks merged SKU as active if upsell is active', () => {
    const entries: CostApiEntry[] = [
      { buyer: 'romaissa', buyerDisplayName: 'Romaissa', sku: 'sku-base', date: '2026-02-04', orders: 40, spend: 80, costPerLead: 2.0, platform: 'TT', sheet: 'Testicalm DZ', isActive: false },
      { buyer: 'romaissa', buyerDisplayName: 'Romaissa', sku: 'sku-base someupsell', date: '2026-02-04', orders: 0, spend: 0, costPerLead: 0, platform: 'TT', sheet: 'Testicalm DZ', isActive: true },
    ];
    const result = aggregateApiToCostSKUs(entries);
    expect(result[0].isActive).toBe(true);
  });

  it('does not merge SKUs that are not upsell variants', () => {
    const entries: CostApiEntry[] = [
      { buyer: 'romaissa', buyerDisplayName: 'Romaissa', sku: 'sku-alpha', date: '2026-02-04', orders: 30, spend: 60, costPerLead: 2.0, platform: 'TT', sheet: 'Testicalm DZ', isActive: true },
      { buyer: 'romaissa', buyerDisplayName: 'Romaissa', sku: 'sku-beta', date: '2026-02-04', orders: 20, spend: 40, costPerLead: 2.0, platform: 'TT', sheet: 'Testicalm DZ', isActive: true },
    ];
    const result = aggregateApiToCostSKUs(entries);
    expect(result).toHaveLength(2);
  });
});

describe('buildMarketMapFromApi — upsell merge', () => {
  it('maps upsell variant to base SKU market', () => {
    const entries: CostApiEntry[] = [
      { buyer: 'romaissa', buyerDisplayName: 'Romaissa', sku: 'sku-base', date: '2026-02-04', orders: 50, spend: 100, costPerLead: 2.0, platform: 'TT', sheet: 'Testicalm DZ', isActive: true },
      { buyer: 'romaissa', buyerDisplayName: 'Romaissa', sku: 'sku-base testicalmupsell', date: '2026-02-04', orders: 0, spend: 0, costPerLead: 0, platform: 'TT', sheet: 'Testicalm DZ', isActive: true },
    ];
    const map = buildMarketMapFromApi(entries);
    expect(map['sku-base']).toBe('Testicalm DZ');
    // Upsell variant should NOT have its own key — it's merged into base
    expect(Object.keys(map)).toHaveLength(1);
  });
});

describe('aggregateApiToCostSKUs — duplicate base SKU dedup', () => {
  it('merges 3 entries for same base SKU (2 identical + 1 upsell)', () => {
    const entries: CostApiEntry[] = [
      { buyer: 'romaissa', buyerDisplayName: 'Romaissa', sku: 'romaissa-TT-R.001-Testicalm january 2026', date: '2026-01-10', orders: 30, spend: 60, costPerLead: 2.0, platform: 'TT', sheet: 'Testicalm DZ', isActive: true },
      { buyer: 'romaissa', buyerDisplayName: 'Romaissa', sku: 'romaissa-TT-R.001-Testicalm january 2026', date: '2026-01-11', orders: 20, spend: 40, costPerLead: 2.0, platform: 'TT', sheet: 'Testicalm DZ', isActive: true },
      { buyer: 'romaissa', buyerDisplayName: 'Romaissa', sku: 'romaissa-TT-R.001-Testicalm january 2026 testicalmupsell', date: '2026-01-10', orders: 0, spend: 0, costPerLead: 0, platform: 'TT', sheet: 'Testicalm DZ', isActive: true },
    ];
    const result = aggregateApiToCostSKUs(entries);
    expect(result).toHaveLength(1);
    expect(result[0].sku).toBe('romaissa-TT-R.001-Testicalm january 2026');
    expect(result[0].totalOrders).toBe(50);
    expect(result[0].totalSpend).toBe(100);
    expect(result[0].avgCPL).toBe(2.0);
  });

  it('merges entries with different casing into one row', () => {
    const entries: CostApiEntry[] = [
      { buyer: 'romaissa', buyerDisplayName: 'Romaissa', sku: 'Romaissa-TT-Testicalm Jan', date: '2026-01-10', orders: 30, spend: 60, costPerLead: 2.0, platform: 'TT', sheet: 'Testicalm DZ', isActive: true },
      { buyer: 'romaissa', buyerDisplayName: 'Romaissa', sku: 'romaissa-TT-Testicalm Jan', date: '2026-01-11', orders: 20, spend: 40, costPerLead: 2.0, platform: 'TT', sheet: 'Testicalm DZ', isActive: false },
    ];
    const result = aggregateApiToCostSKUs(entries);
    expect(result).toHaveLength(1);
    expect(result[0].totalOrders).toBe(50);
    // Active if ANY entry is active
    expect(result[0].isActive).toBe(true);
  });

  it('merges entries with extra whitespace differences', () => {
    const entries: CostApiEntry[] = [
      { buyer: 'romaissa', buyerDisplayName: 'Romaissa', sku: 'romaissa-TT-004-  Testicalm   Feb', date: '2026-02-01', orders: 25, spend: 50, costPerLead: 2.0, platform: 'TT', sheet: 'Testicalm DZ', isActive: true },
      { buyer: 'romaissa', buyerDisplayName: 'Romaissa', sku: 'romaissa-TT-004- Testicalm Feb', date: '2026-02-02', orders: 15, spend: 30, costPerLead: 2.0, platform: 'TT', sheet: 'Testicalm DZ', isActive: true },
    ];
    const result = aggregateApiToCostSKUs(entries);
    expect(result).toHaveLength(1);
    expect(result[0].totalOrders).toBe(40);
    expect(result[0].totalSpend).toBe(80);
  });
});
