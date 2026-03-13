/**
 * Lead Score Engine — Algeria
 *
 * Calculates a profit-based score per agent based on:
 *   Score = Total Profit from Confirmed Orders ÷ Total Leads
 *
 * Then normalizes across all agents to a 0-100 scale.
 *
 * Product Economics (Algeria — Testicalm & Menopause):
 *   1pc: sell 3,900 — cost 580 — customer pays 600 shipping → profit = 3,320
 *   2pc: sell 5,800 — cost 1,160 — you pay 600 shipping → profit = 4,040
 *   3pc: sell 7,800 — cost 1,740 — you pay 600 shipping → profit = 5,460
 *   4pc: sell 9,500 — cost 2,320 — you pay 600 shipping → profit = 6,580
 *   Cost per lead: ~400 DZD ($2.9)
 */

// ── Product Economics Config ──────────────────────────────────────────

export interface ProductEconomics {
  /** Profit per confirmed order by quantity tier (DZD) */
  profitByQty: Record<number, number>;
  /** Fallback: profit for quantities beyond defined tiers */
  profitPerExtraPiece: number;
  /** Cost per lead in DZD */
  costPerLead: number;
}

/**
 * Algeria economics for Testicalm & Menopause.
 * Profit = selling price − (product cost × qty) − shipping you pay
 *
 * 1pc: 3,900 − 580 = 3,320 (customer pays shipping)
 * 2pc: 5,800 − 1,160 − 600 = 4,040
 * 3pc: 7,800 − 1,740 − 600 = 5,460
 * 4pc: 9,500 − 2,320 − 600 = 6,580
 */
export const ALGERIA_ECONOMICS: ProductEconomics = {
  profitByQty: {
    1: 3320,
    2: 4040,
    3: 5460,
    4: 6580,
  },
  // For qty 5+, extrapolate: ~1,500 DZD per extra piece above 4
  // (selling price scales ~1,700/pc, cost = 580/pc, so ~1,120 margin + some)
  profitPerExtraPiece: 1120,
  costPerLead: 400,
};

// ── Scoring Types ─────────────────────────────────────────────────────

export interface AgentScoreInput {
  /** Agent name */
  name: string;
  /** Total leads assigned to this agent */
  totalOrders: number;
  /** Array of confirmed order quantities (e.g., [1, 1, 2, 1, 3]) */
  confirmedQuantities: number[];
}

export interface AgentScoreResult {
  name: string;
  /** Raw profit per lead in DZD (internal, not displayed) */
  profitPerLead: number;
  /** Normalized score 0-100 */
  score: number;
  /** Rank (1 = best) */
  rank: number;
}

// ── Core Functions ────────────────────────────────────────────────────

/**
 * Calculate profit for a single confirmed order based on quantity.
 */
export function orderProfit(qty: number, economics: ProductEconomics): number {
  if (qty <= 0) return 0;

  // Use defined tier if available
  if (economics.profitByQty[qty] !== undefined) {
    return economics.profitByQty[qty];
  }

  // For quantities beyond defined tiers, use highest tier + extra pieces
  const maxDefinedQty = Math.max(...Object.keys(economics.profitByQty).map(Number));
  const baseProfit = economics.profitByQty[maxDefinedQty] ?? 0;
  const extraPieces = qty - maxDefinedQty;
  return baseProfit + extraPieces * economics.profitPerExtraPiece;
}

/**
 * Calculate raw profit per lead for a single agent.
 */
export function calculateProfitPerLead(
  agent: AgentScoreInput,
  economics: ProductEconomics
): number {
  if (agent.totalOrders <= 0) return 0;

  const totalProfit = agent.confirmedQuantities.reduce(
    (sum, qty) => sum + orderProfit(qty, economics),
    0
  );

  // Subtract cost of all leads
  const totalCost = agent.totalOrders * economics.costPerLead;

  return (totalProfit - totalCost) / agent.totalOrders;
}

/**
 * Calculate lead scores for all agents.
 * Returns normalized 0-100 scores with rankings.
 *
 * Normalization: the best agent gets 100, the worst gets a proportional score.
 * If all agents have the same profit/lead, everyone gets 100.
 * If an agent has negative profit/lead, they can score below 0 (clamped to 0).
 */
export function calculateLeadScores(
  agents: AgentScoreInput[],
  economics: ProductEconomics
): AgentScoreResult[] {
  if (agents.length === 0) return [];

  // Calculate raw profit per lead for each agent
  const rawScores = agents.map((agent) => ({
    name: agent.name,
    profitPerLead: calculateProfitPerLead(agent, economics),
  }));

  // Find min and max for normalization
  const maxProfit = Math.max(...rawScores.map((s) => s.profitPerLead));
  const minProfit = Math.min(...rawScores.map((s) => s.profitPerLead));

  // Normalize to 0-100
  const range = maxProfit - minProfit;
  const normalized = rawScores.map((s) => ({
    ...s,
    score:
      range === 0
        ? agents.length === 1 || maxProfit > 0
          ? 100
          : 0
        : Math.max(0, Math.round(((s.profitPerLead - minProfit) / range) * 100)),
  }));

  // Sort by score descending and assign ranks
  const sorted = [...normalized].sort((a, b) => b.score - a.score || b.profitPerLead - a.profitPerLead);

  const results: AgentScoreResult[] = sorted.map((s, i) => ({
    ...s,
    rank: i + 1,
  }));

  return results;
}

/**
 * Helper: Extract confirmed quantities from an agent's orders.
 * Use this to convert AgentData → AgentScoreInput.
 */
export function extractConfirmedQuantities(
  orders: Array<{ status: string; quantity: number }>
): number[] {
  return orders
    .filter((o) => o.status === 'confirmed')
    .map((o) => Math.max(1, o.quantity));
}
