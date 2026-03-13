/**
 * Cost Data & SKU Decision Matrix Scoring
 * 
 * Fetches cost data from the Cost Calculator API and cross-references with
 * per-SKU confirmation data from the confirmation dashboard (Google Sheets)
 * to produce Kill/Watch/Keep recommendations.
 * 
 * PER-SKU MATCHING:
 * The SKU names (reference column M in Google Sheets) are the same campaign
 * names used in the Calculator API. We match them directly using normalizeSKU()
 * for case-insensitive, whitespace-normalized comparison.
 * 
 * Each Calculator campaign gets its own per-SKU confirmation rate from the
 * dashboard data. SKUs not found in the dashboard get "No confirmation data".
 * 
 * MARKET MAPPING (for economics config):
 * Calculator API "sheet" field maps to dashboard slugs:
 *   - Libya → libya
 *   - Testicalm DZ, Herbo Calm DZ, Menopause → algeria
 *   - Viconis → viconis
 *   - Tunisia → tunisia
 * 
 * PROFIT-BASED SCORING:
 * - Selling price: 3,800 DA → margin after all costs except ads: 2,700 DA
 * - Delivery rate: 55% (fixed)
 * - USD to DA: 250
 * - Cost per delivered = CPL / confRate / 0.55
 * - Ad cost in DA = costPerDelivered × usdToDA
 * - Profit per delivery = marginDA - adCostDA
 * - KILL: profit < 300 DA
 * - WATCH: profit 300-700 DA
 * - KEEP: profit > 700 DA
 */

import type { SKUData } from './sheets';

// === Product Economics Config ===
export interface ProductEconomics {
  marginDA: number;       // margin after all costs except ads (in DA)
  deliveryRate: number;   // delivery rate as decimal (0.55 = 55%)
  usdToDA: number;        // exchange rate
  killThreshold: number;  // profit below this = KILL (in DA)
  watchThreshold: number; // profit below this = WATCH, above = KEEP (in DA)
}

export const TESTICALM_DZ_ECONOMICS: ProductEconomics = {
  marginDA: 2700,
  deliveryRate: 0.55,
  usdToDA: 250,
  killThreshold: 300,
  watchThreshold: 700,
};

// Default economics for products without specific config
export const DEFAULT_ECONOMICS: ProductEconomics = {
  marginDA: 2700,
  deliveryRate: 0.55,
  usdToDA: 250,
  killThreshold: 300,
  watchThreshold: 700,
};

export interface CostSKUEntry {
  sku: string;
  totalOrders: number;
  totalSpend: number;
  avgCPL: number;
  buyerCount: number;
  /** Whether this campaign is still active (not turned off by media buyer) */
  isActive: boolean;
}

export interface DecisionMatrixRow {
  sku: string;
  /** From cost data */
  costOrders: number;
  totalSpend: number;
  avgCPL: number;
  /** From confirmation data (per-SKU) */
  confOrders: number;
  confirmed: number;
  cancelled: number;
  adjConfirmationRate: number;
  adjCancellationRate: number;
  pipeline: number;
  pipelineRate: number;
  /** Calculated - cost metrics */
  costPerConfirmedOrder: number;
  costPerDelivered: number;
  adCostDA: number;
  profitPerDeliveryDA: number;
  /** Product category detected from SKU name */
  productCategory: string;
  /** Media buyer detected from SKU name */
  buyer: string;
  /** Market from sheet column */
  market: string;
  /** Dashboard slug this campaign maps to */
  dashboardSlug: string;
  /** Decision: KILL, WATCH, KEEP */
  decision: 'KILL' | 'WATCH' | 'KEEP';
  /** Score 0-100 (higher = better, should keep) */
  score: number;
  /** Reasons for the decision */
  reasons: string[];
  /** Statistical confidence: low (<30 orders), medium (30-100), high (>100) */
  confidence: 'low' | 'medium' | 'high';
  /** Whether this campaign is still active (not turned off by media buyer) */
  isActive: boolean;
  /** Whether this SKU was found in the confirmation dashboard */
  confMatched: boolean;
  /** Total leads from confirmation dashboard for this SKU (vs costOrders from Calculator) */
  dashboardLeads: number;
}

/**
 * Detect product category from SKU/reference name.
 * Works for both Calculator campaign names and Dashboard reference names.
 * Order matters: more specific keywords must come before generic ones.
 */
export function classifyProduct(skuName: string): string {
  const name = skuName.toLowerCase();
  // Specific products first (longer/more specific keywords)
  if (name.includes('prostacalm') || name.includes('prostcalm')) return 'Prostacalm';
  if (name.includes('testicalm')) return 'Testicalm';
  if (name.includes('varicocel')) return 'Varicocele Oil';
  if (name.includes('varicoil') || name.includes('varice') || name.includes('varic')) return 'Varice Oil';
  if (name.includes('prostat') || name.includes('prostate') || name.includes('prostaoil')) return 'Prostate Oil';
  if (name.includes('colon')) return 'Colon Oil';
  if (name.includes('hemorrhoid') || name.includes('hemoroid') || name.includes('hemoroides') || name.includes('hemo')) return 'Hemorrhoids';
  if (name.includes('menopause') || name.includes('manopause') || name.includes('menoapuse') || name.includes('manoapuse') || name.includes('menop') || name.includes('manop')) return 'Menopause';
  if (name.includes('herbocalm') || name.includes('herbo calm') || name.includes('herbo')) return 'Herbo Calm';
  if (name.includes('vcionis') || name.includes('viconis')) return 'Viconis';
  if (name.includes('ihair') || name.includes('i hair') || name.includes('i-hair')) return 'IHair';
  if (name.includes('teeth')) return 'Teeth';
  if (name.includes('ferroglo')) return 'Ferroglo';
  if (name.includes('masque')) return 'Masque';
  if (name.includes('dermo') || name.includes('yacine') || name.includes('yassine')) return 'Dermo';
  if (name.includes('ousra')) return 'Ousra';
  // Catch 'hair' last (after ihair) to avoid false positives
  if (name.includes('hair')) return 'IHair';
  return 'Other';
}

/** Detect media buyer from SKU name prefix */
export function detectBuyer(skuName: string): string {
  const name = skuName.toLowerCase();
  if (name.startsWith('romaissa')) return 'Romaissa';
  if (name.startsWith('nesrine')) return 'Nesrine';
  if (name.startsWith('maissa') || name.startsWith('mmaissa')) return 'Maissa';
  if (name.startsWith('omar')) return 'Omar';
  if (name.startsWith('stif') || name.startsWith('islam')) return 'Islam';
  return 'Unknown';
}

/** Normalize SKU name for matching between cost data and confirmation data */
export function normalizeSKU(sku: string): string {
  return sku
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strip upsell suffix from SKU name to get the base campaign name.
 * In the Calculator, upsell entries are separate rows with the same SKU name
 * plus an upsell suffix (e.g., "testicalmupsell", "prostateupsell").
 * Since the Calculator only tracks data on the original (non-upsell) entry,
 * the upsell variant should be merged into the base SKU.
 * 
 * Examples:
 *   "romaissa-TT-R.04-Testicalm February2026 testicalmupsell" → "romaissa-TT-R.04-Testicalm February2026"
 *   "omar-FB-prostate oil Feb2026 prostateupsell" → "omar-FB-prostate oil Feb2026"
 *   "romaissa-TT-R.04-Testicalm February2026" → "romaissa-TT-R.04-Testicalm February2026" (unchanged)
 */
export function stripUpsellSuffix(sku: string): string {
  // Remove trailing upsell keyword (case-insensitive)
  // Pattern: optional whitespace + word ending in "upsell" at end of string
  return sku.replace(/\s+\S*upsell\s*$/i, '').trim();
}

/**
 * Map Calculator API "sheet" field to dashboard slug.
 * 
 * Calculator sheets: Libya, Testicalm DZ, Herbo Calm DZ, Menopause, Viconis, Tunisia
 * Dashboard slugs: libya, algeria, viconis, tunisia
 * 
 * All DZ products (Testicalm DZ, Herbo Calm DZ, Menopause) map to "algeria".
 */
export function mapSheetToDashboardSlug(sheet: string): string {
  const s = sheet.toLowerCase().trim();
  if (s === 'libya') return 'libya';
  if (s === 'tunisia') return 'tunisia';
  if (s === 'viconis') return 'viconis';
  // All DZ-market products map to algeria dashboard
  if (s === 'testicalm dz' || s === 'herbo calm dz' || s === 'menopause') return 'algeria';
  // Fallback: try to detect from keywords
  if (s.includes('dz') || s.includes('algeria')) return 'algeria';
  if (s.includes('libya') || s.includes('lib')) return 'libya';
  if (s.includes('tunis')) return 'tunisia';
  if (s.includes('viconis')) return 'viconis';
  return 'unknown';
}

/** Get economics config for a product/market combination */
export function getEconomics(productCategory: string, market: string): ProductEconomics {
  // For now, Testicalm DZ is the only configured product
  if (productCategory === 'Testicalm' && (market.toLowerCase().includes('dz') || market.toLowerCase().includes('algeria') || market.toLowerCase().includes('testicalm'))) {
    return TESTICALM_DZ_ECONOMICS;
  }
  // Default: use same economics (can be expanded later per product/market)
  return DEFAULT_ECONOMICS;
}

/**
 * Calculate profit-based metrics for a SKU.
 * 
 * Full funnel: Lead → Confirmed → Delivered
 * Cost per delivered = CPL / confRate / deliveryRate
 * Ad cost in DA = costPerDelivered × usdToDA
 * Profit per delivery = marginDA - adCostDA
 */
export function calculateProfitMetrics(params: {
  avgCPL: number;
  adjConfirmationRate: number;
  economics: ProductEconomics;
}): { costPerConfirmed: number; costPerDelivered: number; adCostDA: number; profitPerDeliveryDA: number } {
  const { avgCPL, adjConfirmationRate, economics } = params;
  const confRate = adjConfirmationRate / 100;

  if (confRate <= 0 || avgCPL <= 0) {
    return { costPerConfirmed: 0, costPerDelivered: 0, adCostDA: 0, profitPerDeliveryDA: 0 };
  }

  const costPerConfirmed = avgCPL / confRate;
  const costPerDelivered = costPerConfirmed / economics.deliveryRate;
  const adCostDA = costPerDelivered * economics.usdToDA;
  const profitPerDeliveryDA = economics.marginDA - adCostDA;

  return { costPerConfirmed, costPerDelivered, adCostDA, profitPerDeliveryDA };
}

/**
 * Score a SKU and produce a Kill/Watch/Keep decision.
 * 
 * PROFIT-BASED SCORING:
 * - Primary: profit per delivered order (determines KILL/WATCH/KEEP)
 * - Secondary: sample size / confidence (prevents premature KILL decisions)
 * - Pipeline: high pipeline = data still incomplete, upgrade to WATCH
 */
export function scoreAndDecide(params: {
  adjConfirmationRate: number;
  costPerConfirmedOrder: number;
  costPerDelivered: number;
  profitPerDeliveryDA: number;
  pipelineRate: number;
  confOrders: number;
  avgCPL: number;
  productCategory: string;
  economics: ProductEconomics;
}): { score: number; decision: 'KILL' | 'WATCH' | 'KEEP'; reasons: string[]; confidence: 'low' | 'medium' | 'high' } {
  const { adjConfirmationRate, costPerDelivered, profitPerDeliveryDA, pipelineRate, confOrders, avgCPL, economics } = params;
  const reasons: string[] = [];

  // Confidence based on sample size
  const confidence: 'low' | 'medium' | 'high' = confOrders < 30 ? 'low' : confOrders < 100 ? 'medium' : 'high';

  // No confirmation data at all → can't decide
  if (confOrders === 0 || adjConfirmationRate <= 0) {
    reasons.push('No confirmation data available');
    reasons.push(`CPL: $${avgCPL.toFixed(2)}`);
    return { score: 50, decision: 'WATCH', reasons, confidence: 'low' };
  }

  // === PROFIT-BASED DECISION ===
  let decision: 'KILL' | 'WATCH' | 'KEEP';
  let score: number;

  if (profitPerDeliveryDA > economics.watchThreshold) {
    // Profit > 700 DA = KEEP
    decision = 'KEEP';
    // Score 55-100 based on how far above threshold
    score = Math.min(100, 55 + Math.round((profitPerDeliveryDA - economics.watchThreshold) / 50));
    reasons.push(`Profit: ${Math.round(profitPerDeliveryDA)} DA/delivery (above ${economics.watchThreshold} DA target)`);
  } else if (profitPerDeliveryDA >= economics.killThreshold) {
    // Profit 300-700 DA = WATCH
    decision = 'WATCH';
    // Score 35-54 based on position in range
    const range = economics.watchThreshold - economics.killThreshold;
    const position = (profitPerDeliveryDA - economics.killThreshold) / range;
    score = 35 + Math.round(position * 19);
    reasons.push(`Borderline profit: ${Math.round(profitPerDeliveryDA)} DA/delivery (between ${economics.killThreshold}-${economics.watchThreshold} DA)`);
  } else {
    // Profit < 300 DA = KILL
    decision = 'KILL';
    // Score 0-34 based on how bad
    score = Math.max(0, Math.round(34 * Math.max(0, profitPerDeliveryDA) / economics.killThreshold));
    if (profitPerDeliveryDA < 0) {
      reasons.push(`LOSING MONEY: ${Math.round(profitPerDeliveryDA)} DA/delivery (negative profit)`);
      score = 0;
    } else {
      reasons.push(`Low profit: ${Math.round(profitPerDeliveryDA)} DA/delivery (below ${economics.killThreshold} DA minimum)`);
    }
  }

  // Add funnel breakdown
  reasons.push(`Conf rate: ${adjConfirmationRate.toFixed(1)}% → Cost/confirmed: $${costPerDelivered > 0 ? (avgCPL / (adjConfirmationRate / 100)).toFixed(2) : '0'}`);
  reasons.push(`After 55% delivery: $${costPerDelivered.toFixed(2)}/delivered → ${Math.round(costPerDelivered * economics.usdToDA)} DA ad cost`);

  // Pipeline adjustment: if high pipeline, data is incomplete → upgrade KILL to WATCH
  if (pipelineRate >= 30) {
    reasons.push(`High pipeline: ${pipelineRate.toFixed(0)}% leads still being worked`);
    if (decision === 'KILL') {
      decision = 'WATCH';
      score = Math.max(score, 35);
      reasons.push('Upgraded to WATCH: high pipeline means conf rate may improve');
    }
  }

  // Sample size protection: never KILL with very few orders
  if (confOrders < 20 && decision === 'KILL') {
    decision = 'WATCH';
    score = Math.max(score, 35);
    reasons.push(`Upgraded to WATCH: only ${confOrders} orders (insufficient for KILL decision)`);
  }

  // Confidence note
  if (confidence === 'low') {
    reasons.push(`Low confidence: ${confOrders} orders processed`);
  }

  return { score, decision, reasons, confidence };
}

/**
 * Build a normalized lookup map from confirmation dashboard SKU data.
 * Key: normalized SKU name → Value: SKUData
 * 
 * This enables O(1) matching between Calculator SKU names and dashboard SKU data.
 */
export function buildConfSKULookup(confSKUs: SKUData[]): Map<string, SKUData> {
  const lookup = new Map<string, SKUData>();
  for (const sku of confSKUs) {
    const key = normalizeSKU(sku.sku);
    // If duplicate normalized keys, keep the one with more orders
    const existing = lookup.get(key);
    if (!existing || sku.totalOrders > existing.totalOrders) {
      lookup.set(key, sku);
    }
  }
  return lookup;
}

/**
 * Build the full decision matrix by cross-referencing cost data with
 * PER-SKU confirmation rates from the dashboard.
 * 
 * Each Calculator campaign is matched to its exact SKU in the confirmation
 * dashboard using normalized name matching. SKUs not found get "No data".
 */
export function buildDecisionMatrix(
  costSKUs: CostSKUEntry[],
  confSKUs: SKUData[],
  marketMap: Record<string, string>,
): DecisionMatrixRow[] {
  // Build normalized lookup for O(1) matching
  const confLookup = buildConfSKULookup(confSKUs);
  const rows: DecisionMatrixRow[] = [];

  for (const cost of costSKUs) {
    const sku = cost.sku;
    const costOrders = cost.totalOrders;
    const totalSpend = cost.totalSpend;
    const avgCPL = cost.avgCPL;

    const productCategory = classifyProduct(sku);
    const buyer = detectBuyer(sku);
    const market = marketMap[sku] || 'Unknown';
    const dashboardSlug = mapSheetToDashboardSlug(market);

    // Match this Calculator SKU to confirmation dashboard SKU data
    const normalizedSKU = normalizeSKU(sku);
    const confMatch = confLookup.get(normalizedSKU);

    // Use per-SKU rates from the matched confirmation data
    const confOrders = confMatch ? confMatch.totalOrders : 0;
    const confirmed = confMatch ? confMatch.confirmed : 0;
    const cancelled = confMatch ? confMatch.adjCancelled : 0;
    const adjConfRate = confMatch ? confMatch.adjConfirmationRate : 0;
    const adjCancelRate = confMatch ? confMatch.adjCancellationRate : 0;

    // Pipeline: orders not yet confirmed/cancelled (postponed + other + noStatus)
    const pipeline = confMatch ? (confMatch.totalOrders - confMatch.confirmed - confMatch.cancelled - (confMatch.adjCancelled - confMatch.cancelled)) : 0;
    const pipelineRate = confOrders > 0 ? (Math.max(0, pipeline) / confOrders) * 100 : 0;

    // Get economics for this product/market
    const economics = getEconomics(productCategory, market);

    // Calculate profit metrics using per-SKU conf rate
    const { costPerConfirmed, costPerDelivered, adCostDA, profitPerDeliveryDA } = calculateProfitMetrics({
      avgCPL,
      adjConfirmationRate: adjConfRate,
      economics,
    });

    const { score, decision, reasons, confidence } = scoreAndDecide({
      adjConfirmationRate: adjConfRate,
      costPerConfirmedOrder: costPerConfirmed,
      costPerDelivered,
      profitPerDeliveryDA,
      pipelineRate,
      confOrders,
      avgCPL,
      productCategory,
      economics,
    });

    rows.push({
      sku,
      costOrders,
      totalSpend,
      avgCPL,
      confOrders,
      confirmed,
      cancelled,
      adjConfirmationRate: adjConfRate,
      adjCancellationRate: adjCancelRate,
      pipeline: Math.max(0, pipeline),
      pipelineRate: isFinite(pipelineRate) ? pipelineRate : 0,
      costPerConfirmedOrder: isFinite(costPerConfirmed) ? costPerConfirmed : 0,
      costPerDelivered: isFinite(costPerDelivered) ? costPerDelivered : 0,
      adCostDA: isFinite(adCostDA) ? adCostDA : 0,
      profitPerDeliveryDA: isFinite(profitPerDeliveryDA) ? profitPerDeliveryDA : 0,
      productCategory,
      buyer,
      market,
      dashboardSlug,
      decision,
      score,
      reasons,
      confidence,
      isActive: cost.isActive,
      confMatched: !!confMatch,
      dashboardLeads: confMatch ? confMatch.totalOrders : 0,
    });
  }

  // Sort by score ascending (worst first = most actionable)
  rows.sort((a, b) => a.score - b.score);

  return rows;
}


// === Cost Calculator API Integration ===

/** Shape of a single entry from the Cost Calculator API */
export interface CostApiEntry {
  buyer: string;
  buyerDisplayName: string;
  sku: string;
  date: string;
  orders: number;
  spend: number;
  costPerLead: number;
  platform: string;
  sheet: string;
  /** Whether this campaign is still active (power button not clicked) */
  isActive: boolean;
}

/** Shape of the Cost Calculator API response */
export interface CostApiResponse {
  count: number;
  totalOrders: number;
  totalSpend: number;
  activeCount: number;
  inactiveCount: number;
  filters: { month: number | null; year: number | null; sheet: string | null; status: string | null };
  data: CostApiEntry[];
}

/**
 * Aggregate raw API entries into CostSKUEntry[] (same shape as the old CSV totals).
 * Groups by SKU, sums orders and spend, calculates weighted avg CPL, counts unique buyers.
 * 
 * UPSELL MERGE: Entries with upsell suffixes (e.g., "testicalmupsell") are merged
 * into their base SKU. Since the Calculator only tracks cost data on the original
 * (non-upsell) entry, the upsell variant has no separate cost data and should be
 * combined with the base campaign.
 */
export function aggregateApiToCostSKUs(entries: CostApiEntry[]): CostSKUEntry[] {
  // Group entries by NORMALIZED base SKU (lowercase, trimmed, upsell stripped)
  // This ensures "SKU Name" and "sku name" and "SKU Name testicalmupsell" all merge into one.
  const skuMap = new Map<string, { displaySku: string; totalOrders: number; totalSpend: number; buyers: Set<string>; isActive: boolean }>();

  for (const entry of entries) {
    // Strip upsell suffix then normalize for grouping key
    const baseSku = stripUpsellSuffix(entry.sku);
    const key = normalizeSKU(baseSku);
    const existing = skuMap.get(key);
    if (existing) {
      existing.totalOrders += entry.orders;
      existing.totalSpend += entry.spend;
      existing.buyers.add(entry.buyer);
      // A SKU is active if ANY of its entries are active
      if (entry.isActive) existing.isActive = true;
      // Keep the display name with more orders (likely the "real" one)
      if (entry.orders > 0 && !existing.displaySku.includes(baseSku)) {
        // Prefer the non-upsell variant as display name
        if (baseSku === entry.sku) {
          existing.displaySku = baseSku;
        }
      }
    } else {
      skuMap.set(key, {
        displaySku: baseSku,
        totalOrders: entry.orders,
        totalSpend: entry.spend,
        buyers: new Set([entry.buyer]),
        isActive: !!entry.isActive,
      });
    }
  }

  const results: CostSKUEntry[] = [];
  for (const [, data] of Array.from(skuMap.entries())) {
    const avgCPL = data.totalOrders > 0 ? data.totalSpend / data.totalOrders : 0;
    results.push({
      sku: data.displaySku,
      totalOrders: data.totalOrders,
      totalSpend: data.totalSpend,
      avgCPL,
      buyerCount: data.buyers.size,
      isActive: data.isActive,
    });
  }

  // Sort by total orders descending (most orders first)
  results.sort((a, b) => b.totalOrders - a.totalOrders);
  return results;
}

/**
 * Build a market map from API entries (SKU → sheet/market).
 * Uses the sheet field from the API which maps to market (Libya, Testicalm DZ, etc.)
 * Upsell variants are mapped using their base SKU name.
 */
export function buildMarketMapFromApi(entries: CostApiEntry[]): Record<string, string> {
  const marketMap: Record<string, string> = {};
  for (const entry of entries) {
    const baseSku = stripUpsellSuffix(entry.sku);
    // Use the display SKU name (not normalized) as key, matching aggregateApiToCostSKUs output
    if (!marketMap[baseSku]) {
      marketMap[baseSku] = entry.sheet;
    }
  }
  return marketMap;
}
