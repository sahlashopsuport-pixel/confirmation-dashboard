import { describe, it, expect } from "vitest";

/**
 * Tests for the delivery rate agent matching logic used in getAgentDeliveryRates.
 * The resolveAgentName function is embedded in db.ts, so we test the matching
 * algorithm directly here to ensure code matching works correctly.
 */

// Replicate the resolveAgentName logic from db.ts for unit testing
function resolveAgentName(
  deliveryCode: string,
  codeToName: Map<string, string>
): string | null {
  const lc = deliveryCode.toLowerCase();
  // Exact match
  if (codeToName.has(lc)) return codeToName.get(lc)!;
  // Try matching by checking if delivery code starts with agent code
  for (const [agentCode, name] of Array.from(codeToName)) {
    if (lc.startsWith(agentCode) || agentCode.startsWith(lc)) return name;
  }
  // Try removing trailing digits for fuzzy match (sh08 → sh, yr06 → yr)
  const stripped = lc.replace(/[0-9]+$/, "");
  if (stripped && codeToName.has(stripped)) return codeToName.get(stripped)!;
  for (const [agentCode, name] of Array.from(codeToName)) {
    const agentStripped = agentCode.replace(/[0-9]+$/, "");
    if (stripped === agentStripped) return name;
  }
  return null;
}

// Build a delivery stats aggregator (same logic as db.ts)
function aggregateDeliveryStats(
  orders: Array<{ agentCode: string; status: string }>,
  codeToName: Map<string, string>
): Record<
  string,
  {
    total: number;
    delivered: number;
    returned: number;
    inTransit: number;
    deliveryRate: number;
  }
> {
  const grouped = new Map<
    string,
    { total: number; delivered: number; returned: number; inTransit: number }
  >();

  for (const order of orders) {
    const code = (order.agentCode || "").toLowerCase();
    if (!code) continue;
    const agentName = resolveAgentName(code, codeToName);
    if (!agentName) continue;
    let entry = grouped.get(agentName);
    if (!entry) {
      entry = { total: 0, delivered: 0, returned: 0, inTransit: 0 };
      grouped.set(agentName, entry);
    }
    entry.total++;
    const s = order.status;
    if (s === "livre_paye" || s === "livre_non_paye") entry.delivered++;
    else if (
      s === "retour_recu" ||
      s === "retour_non_recu" ||
      s === "non_recu"
    )
      entry.returned++;
    else entry.inTransit++;
  }

  const result: Record<
    string,
    {
      total: number;
      delivered: number;
      returned: number;
      inTransit: number;
      deliveryRate: number;
    }
  > = {};
  for (const [name, stats] of Array.from(grouped)) {
    result[name] = {
      ...stats,
      deliveryRate:
        stats.total > 0 ? (stats.delivered / stats.total) * 100 : 0,
    };
  }
  return result;
}

// Algeria agent codes from agent_sheets table
const algeriaAgents = new Map<string, string>([
  ["kh01", "Khoukha"],
  ["l03", "Lamia"],
  ["m09", "Meriem"],
  ["r01", "Rania"],
  ["y01", "Yacine"],
  ["sa01", "Sabrina"],
  ["ot02", "Othmane"],
  ["w09", "Wissam"],
  ["yc05", "Youcef"],
  ["yr", "Yasmina"],
  ["sh8", "Shahinez"],
]);

// ─── Agent Code Matching ────────────────────────────────────────────────
describe("resolveAgentName — delivery code to agent matching", () => {
  it("matches exact code (l03 → Lamia)", () => {
    expect(resolveAgentName("L03", algeriaAgents)).toBe("Lamia");
  });

  it("matches exact code case-insensitive (KH01 → Khoukha)", () => {
    expect(resolveAgentName("KH01", algeriaAgents)).toBe("Khoukha");
  });

  it("matches prefix: sh08 → SH8 (Shahinez)", () => {
    expect(resolveAgentName("sh08", algeriaAgents)).toBe("Shahinez");
  });

  it("matches prefix: yr06 → YR (Yasmina)", () => {
    expect(resolveAgentName("yr06", algeriaAgents)).toBe("Yasmina");
  });

  it("matches prefix: m09 → Meriem", () => {
    expect(resolveAgentName("M09", algeriaAgents)).toBe("Meriem");
  });

  it("matches prefix: sa01 → Sabrina", () => {
    expect(resolveAgentName("SA01", algeriaAgents)).toBe("Sabrina");
  });

  it("matches prefix: ot02 → Othmane", () => {
    expect(resolveAgentName("OT02", algeriaAgents)).toBe("Othmane");
  });

  it("matches prefix: w09 → Wissam", () => {
    expect(resolveAgentName("W09", algeriaAgents)).toBe("Wissam");
  });

  it("matches prefix: yc05 → Youcef", () => {
    expect(resolveAgentName("YC05", algeriaAgents)).toBe("Youcef");
  });

  it("returns null for unknown code", () => {
    expect(resolveAgentName("ZZ99", algeriaAgents)).toBeNull();
  });

  it("empty codes are skipped before resolveAgentName is called (tested in aggregation)", () => {
    // In the real code, empty codes are filtered out before resolveAgentName is called
    // so we test this in the aggregation tests instead
    const orders = [{ agentCode: "", status: "livre_paye" }];
    const result = aggregateDeliveryStats(orders, algeriaAgents);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

// ─── Delivery Stats Aggregation ─────────────────────────────────────────
describe("aggregateDeliveryStats — group orders by agent and compute rates", () => {
  it("calculates correct delivery rate for a single agent", () => {
    const orders = [
      { agentCode: "L03", status: "livre_paye" },
      { agentCode: "L03", status: "livre_paye" },
      { agentCode: "L03", status: "retour_recu" },
      { agentCode: "L03", status: "en_traitement" },
    ];
    const result = aggregateDeliveryStats(orders, algeriaAgents);
    expect(result["Lamia"]).toBeDefined();
    expect(result["Lamia"].total).toBe(4);
    expect(result["Lamia"].delivered).toBe(2);
    expect(result["Lamia"].returned).toBe(1);
    expect(result["Lamia"].inTransit).toBe(1);
    expect(result["Lamia"].deliveryRate).toBe(50);
  });

  it("groups orders from different delivery codes to same agent (sh08 → SH8)", () => {
    const orders = [
      { agentCode: "sh08", status: "livre_paye" },
      { agentCode: "SH8", status: "livre_paye" },
      { agentCode: "sh8", status: "retour_recu" },
    ];
    const result = aggregateDeliveryStats(orders, algeriaAgents);
    expect(result["Shahinez"]).toBeDefined();
    expect(result["Shahinez"].total).toBe(3);
    expect(result["Shahinez"].delivered).toBe(2);
    expect(result["Shahinez"].returned).toBe(1);
  });

  it("handles multiple agents correctly", () => {
    const orders = [
      { agentCode: "L03", status: "livre_paye" },
      { agentCode: "KH01", status: "livre_paye" },
      { agentCode: "L03", status: "retour_recu" },
      { agentCode: "KH01", status: "livre_non_paye" },
      { agentCode: "KH01", status: "en_traitement" },
    ];
    const result = aggregateDeliveryStats(orders, algeriaAgents);
    expect(result["Lamia"].total).toBe(2);
    expect(result["Lamia"].delivered).toBe(1);
    expect(result["Lamia"].returned).toBe(1);
    expect(result["Lamia"].deliveryRate).toBe(50);

    expect(result["Khoukha"].total).toBe(3);
    expect(result["Khoukha"].delivered).toBe(2);
    expect(result["Khoukha"].returned).toBe(0);
    expect(result["Khoukha"].inTransit).toBe(1);
    expect(result["Khoukha"].deliveryRate).toBeCloseTo(66.67, 1);
  });

  it("skips orders with unknown agent codes", () => {
    const orders = [
      { agentCode: "L03", status: "livre_paye" },
      { agentCode: "UNKNOWN99", status: "livre_paye" },
      { agentCode: "ZZ", status: "retour_recu" },
    ];
    const result = aggregateDeliveryStats(orders, algeriaAgents);
    expect(Object.keys(result)).toHaveLength(1);
    expect(result["Lamia"]).toBeDefined();
  });

  it("skips orders with empty agent codes", () => {
    const orders = [
      { agentCode: "", status: "livre_paye" },
      { agentCode: "L03", status: "livre_paye" },
    ];
    const result = aggregateDeliveryStats(orders, algeriaAgents);
    expect(Object.keys(result)).toHaveLength(1);
  });

  it("classifies non_recu as returned", () => {
    const orders = [
      { agentCode: "R01", status: "non_recu" },
      { agentCode: "R01", status: "livre_paye" },
    ];
    const result = aggregateDeliveryStats(orders, algeriaAgents);
    expect(result["Rania"].returned).toBe(1);
    expect(result["Rania"].delivered).toBe(1);
    expect(result["Rania"].deliveryRate).toBe(50);
  });

  it("classifies retour_non_recu as returned", () => {
    const orders = [
      { agentCode: "Y01", status: "retour_non_recu" },
    ];
    const result = aggregateDeliveryStats(orders, algeriaAgents);
    expect(result["Yacine"].returned).toBe(1);
    expect(result["Yacine"].delivered).toBe(0);
    expect(result["Yacine"].deliveryRate).toBe(0);
  });

  it("classifies livre_non_paye as delivered", () => {
    const orders = [
      { agentCode: "M09", status: "livre_non_paye" },
    ];
    const result = aggregateDeliveryStats(orders, algeriaAgents);
    expect(result["Meriem"].delivered).toBe(1);
    expect(result["Meriem"].deliveryRate).toBe(100);
  });

  it("classifies en_traitement as in-transit", () => {
    const orders = [
      { agentCode: "SA01", status: "en_traitement" },
      { agentCode: "SA01", status: "en_attente" },
    ];
    const result = aggregateDeliveryStats(orders, algeriaAgents);
    expect(result["Sabrina"].inTransit).toBe(2);
    expect(result["Sabrina"].delivered).toBe(0);
    expect(result["Sabrina"].deliveryRate).toBe(0);
  });

  it("returns empty object when no orders provided", () => {
    const result = aggregateDeliveryStats([], algeriaAgents);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("returns empty object when no codes match", () => {
    const orders = [
      { agentCode: "ZZ99", status: "livre_paye" },
      { agentCode: "XX11", status: "retour_recu" },
    ];
    const result = aggregateDeliveryStats(orders, algeriaAgents);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("handles yr06 prefix matching to YR (Yasmina)", () => {
    const orders = [
      { agentCode: "yr06", status: "livre_paye" },
      { agentCode: "yr06", status: "livre_paye" },
      { agentCode: "yr06", status: "retour_recu" },
    ];
    const result = aggregateDeliveryStats(orders, algeriaAgents);
    expect(result["Yasmina"]).toBeDefined();
    expect(result["Yasmina"].total).toBe(3);
    expect(result["Yasmina"].delivered).toBe(2);
    expect(result["Yasmina"].returned).toBe(1);
    expect(result["Yasmina"].deliveryRate).toBeCloseTo(66.67, 1);
  });
});

// ─── Integration: delivery.agentRates tRPC endpoint ─────────────────────
// Verifies the endpoint returns data without auth (critical for published site)
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
      cookies: {},
    } as unknown as TrpcContext["req"],
    res: {
      clearCookie: () => {},
      cookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

describe("delivery.agentRates tRPC endpoint", () => {
  it("returns delivery rates without authentication (no dashboard cookie)", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Should not throw — no auth required
    const result = await caller.delivery.agentRates({});

    // Result should be an object (map of agent name → stats)
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");

    // If there are agents, each should have the expected shape
    const agents = Object.entries(result);
    if (agents.length > 0) {
      const [name, stats] = agents[0];
      expect(typeof name).toBe("string");
      expect(stats).toHaveProperty("total");
      expect(stats).toHaveProperty("delivered");
      expect(stats).toHaveProperty("returned");
      expect(stats).toHaveProperty("inTransit");
      expect(stats).toHaveProperty("deliveryRate");
      expect(typeof stats.total).toBe("number");
      expect(typeof stats.deliveryRate).toBe("number");
    }
  });

  it("accepts optional date range parameters", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.delivery.agentRates({
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
    });

    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  it("works with undefined input", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.delivery.agentRates(undefined);

    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });
});
