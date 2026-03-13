/**
 * Stratified Shuffle — Fair distribution of mixed lead types across agents
 *
 * Given leads grouped by type (Normal, Abandon, TikTok) and agent quantities,
 * distributes each type proportionally per agent, then shuffles within each
 * agent's batch so the order is mixed.
 *
 * Example: 100 Normal + 30 Abandon + 20 TikTok = 150 total
 * Agent A gets 30 leads → ~20 Normal + ~6 Abandon + ~4 TikTok
 * Agent B gets 20 leads → ~13 Normal + ~4 Abandon + ~3 TikTok
 * Each agent gets the same quality ratio regardless of quantity.
 */

export interface LeadWithType {
  leadIndex: number; // Original index in the combined leads array
  batchType: string; // "normal" | "abandon" | "tiktok" etc.
}

export interface AgentAllocation {
  agentId: number;
  quantity: number; // How many leads this agent should receive
}

export interface StratifiedResult {
  agentId: number;
  leadIndices: number[]; // Indices into the combined leads array
  breakdown: Record<string, number>; // Count per batch type
}

/**
 * Seeded pseudo-random number generator (Mulberry32)
 * Ensures reproducible shuffles for testing
 */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle with optional seed for reproducibility
 */
function shuffleArray<T>(arr: T[], rng?: () => number): T[] {
  const shuffled = [...arr];
  const random = rng || Math.random;
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Main stratified shuffle function
 *
 * @param leadsByType - Map of batch type to array of lead indices
 *   e.g. { "normal": [0,1,2,...99], "abandon": [100,101,...129], "tiktok": [130,...149] }
 * @param agents - Array of agent allocations with quantities
 * @param seed - Optional seed for reproducible shuffling (useful for testing)
 * @returns Array of StratifiedResult, one per agent
 */
export function stratifiedShuffle(
  leadsByType: Record<string, number[]>,
  agents: AgentAllocation[],
  seed?: number
): StratifiedResult[] {
  const rng = seed !== undefined ? mulberry32(seed) : undefined;

  // Calculate totals
  const totalLeads = Object.values(leadsByType).reduce((sum, arr) => sum + arr.length, 0);
  const totalRequested = agents.reduce((sum, a) => sum + a.quantity, 0);

  if (totalRequested > totalLeads) {
    throw new Error(
      `Requested ${totalRequested} leads but only ${totalLeads} available`
    );
  }

  // Shuffle each type's pool independently first
  const shuffledPools: Record<string, number[]> = {};
  for (const [type, indices] of Object.entries(leadsByType)) {
    shuffledPools[type] = shuffleArray(indices, rng);
  }

  // Calculate the ratio of each type
  const typeRatios: Record<string, number> = {};
  for (const [type, indices] of Object.entries(leadsByType)) {
    typeRatios[type] = indices.length / totalLeads;
  }

  const types = Object.keys(leadsByType);
  const typePointers: Record<string, number> = {};
  for (const type of types) {
    typePointers[type] = 0;
  }

  const results: StratifiedResult[] = [];

  for (const agent of agents) {
    const agentLeads: number[] = [];
    const breakdown: Record<string, number> = {};

    // Calculate how many of each type this agent should get
    const typeTargets: Record<string, number> = {};
    let assigned = 0;

    for (const type of types) {
      // Proportional allocation, floored
      const target = Math.floor(agent.quantity * typeRatios[type]);
      typeTargets[type] = target;
      assigned += target;
    }

    // Distribute remainder — give extra leads to types with highest fractional parts
    let remainder = agent.quantity - assigned;
    if (remainder > 0) {
      const fractionals = types
        .map((type) => ({
          type,
          frac: agent.quantity * typeRatios[type] - typeTargets[type],
        }))
        .sort((a, b) => b.frac - a.frac);

      for (const { type } of fractionals) {
        if (remainder <= 0) break;
        typeTargets[type]++;
        remainder--;
      }
    }

    // Pull leads from each type's shuffled pool
    for (const type of types) {
      const count = typeTargets[type];
      const pool = shuffledPools[type];
      let pulled = 0;

      while (pulled < count && typePointers[type] < pool.length) {
        agentLeads.push(pool[typePointers[type]]);
        typePointers[type]++;
        pulled++;
      }

      breakdown[type] = pulled;
    }

    // If we still need more leads (rounding edge case), pull from any remaining pool
    let deficit = agent.quantity - agentLeads.length;
    if (deficit > 0) {
      for (const type of types) {
        const pool = shuffledPools[type];
        while (deficit > 0 && typePointers[type] < pool.length) {
          agentLeads.push(pool[typePointers[type]]);
          typePointers[type]++;
          breakdown[type] = (breakdown[type] || 0) + 1;
          deficit--;
        }
        if (deficit <= 0) break;
      }
    }

    // Shuffle the agent's combined batch so types are interleaved
    const shuffledAgentLeads = shuffleArray(agentLeads, rng);

    results.push({
      agentId: agent.agentId,
      leadIndices: shuffledAgentLeads,
      breakdown,
    });
  }

  return results;
}

/**
 * Helper to build leadsByType from a combined leads array with orderType field
 */
export function groupLeadsByType(
  leads: Array<{ orderType?: string; batchType?: string }>,
  batchLabels?: Record<number, string> // Optional: override batch label per lead index
): Record<string, number[]> {
  const groups: Record<string, number[]> = {};

  for (let i = 0; i < leads.length; i++) {
    // Prefer batchType (set by multi-batch paste), then batchLabels override, then orderType
    const type = leads[i].batchType || batchLabels?.[i] || leads[i].orderType?.toLowerCase() || "normal";
    if (!groups[type]) groups[type] = [];
    groups[type].push(i);
  }

  return groups;
}
