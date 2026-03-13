import { describe, it, expect } from "vitest";
import { classifyStatus } from "./ecotrackParser";

/**
 * Tests for the "All Partners" merged view agent grouping logic.
 * Specifically validates that orders without agent codes are correctly
 * bucketed based on the order's partner field (not the filter variable).
 */

type PartnerStats = { total: number; delivered: number; returned: number; inTransit: number };
type AgentStats = { agentCode: string; agentName: string; total: number; delivered: number; returned: number; inTransit: number; partnerBreakdown: Record<string, PartnerStats> };

// Replicate the agent grouping logic from routers.ts delivery.stats
function groupOrdersByAgent(
  orders: Array<{
    agentCode: string | null;
    mediazCode: string | null;
    partner: string;
    status: string;
  }>,
  agentCodeMap: Map<string, string>
): Map<string, AgentStats> {
  const agentStats = new Map<string, AgentStats>();

  for (const order of orders) {
    const outcome = classifyStatus(order.status);

    // This is the fixed logic: use order.partner instead of a filter variable
    let code: string;
    if (order.agentCode) {
      code = order.agentCode;
    } else if (order.mediazCode) {
      code = "mediaz";
    } else {
      code = order.partner === "colivraison" ? "coliv_team" : "unknown";
    }

    if (!agentStats.has(code)) {
      const agentInfo = agentCodeMap.get(code.toLowerCase());
      agentStats.set(code, {
        agentCode: code,
        agentName: code === "coliv_team" ? "Colivraison Team" : (code === "mediaz" ? "MEDIAZ" : (agentInfo || code.toUpperCase())),
        total: 0,
        delivered: 0,
        returned: 0,
        inTransit: 0,
        partnerBreakdown: {},
      });
    }
    const agent = agentStats.get(code)!;
    agent.total++;
    if (outcome === "delivered") agent.delivered++;
    else if (outcome === "returned") agent.returned++;
    else agent.inTransit++;

    // Per-partner breakdown
    const partnerKey = order.partner || "unknown";
    if (!agent.partnerBreakdown[partnerKey]) {
      agent.partnerBreakdown[partnerKey] = { total: 0, delivered: 0, returned: 0, inTransit: 0 };
    }
    const pb = agent.partnerBreakdown[partnerKey];
    pb.total++;
    if (outcome === "delivered") pb.delivered++;
    else if (outcome === "returned") pb.returned++;
    else pb.inTransit++;
  }

  return agentStats;
}

const agentCodeMap = new Map<string, string>([
  ["l03", "Lamia"],
  ["sh08", "Shahinez"],
  ["r01", "Rania"],
]);

describe("All Partners merged view — agent grouping", () => {
  it("groups Colivraison orders without agent code as 'coliv_team'", () => {
    const orders = [
      { agentCode: null, mediazCode: null, partner: "colivraison", status: "livre_paye" },
      { agentCode: null, mediazCode: null, partner: "colivraison", status: "retour_recu" },
    ];
    const result = groupOrdersByAgent(orders, agentCodeMap);
    expect(result.has("coliv_team")).toBe(true);
    expect(result.get("coliv_team")!.agentName).toBe("Colivraison Team");
    expect(result.get("coliv_team")!.total).toBe(2);
    expect(result.get("coliv_team")!.delivered).toBe(1);
    expect(result.get("coliv_team")!.returned).toBe(1);
  });

  it("groups EcoTrack orders without agent code as 'unknown'", () => {
    const orders = [
      { agentCode: null, mediazCode: null, partner: "48h", status: "livre_paye" },
      { agentCode: null, mediazCode: null, partner: "48h", status: "en_traitement" },
    ];
    const result = groupOrdersByAgent(orders, agentCodeMap);
    expect(result.has("unknown")).toBe(true);
    expect(result.get("unknown")!.agentName).toBe("UNKNOWN");
    expect(result.get("unknown")!.total).toBe(2);
  });

  it("separates coliv_team and unknown when both partners have orders without agent codes", () => {
    const orders = [
      { agentCode: null, mediazCode: null, partner: "colivraison", status: "livre_paye" },
      { agentCode: null, mediazCode: null, partner: "colivraison", status: "livre_paye" },
      { agentCode: null, mediazCode: null, partner: "48h", status: "livre_paye" },
    ];
    const result = groupOrdersByAgent(orders, agentCodeMap);
    expect(result.has("coliv_team")).toBe(true);
    expect(result.has("unknown")).toBe(true);
    expect(result.get("coliv_team")!.total).toBe(2);
    expect(result.get("unknown")!.total).toBe(1);
  });

  it("groups orders with agent codes correctly regardless of partner", () => {
    const orders = [
      { agentCode: "L03", mediazCode: null, partner: "48h", status: "livre_paye" },
      { agentCode: "L03", mediazCode: null, partner: "colivraison", status: "retour_recu" },
    ];
    const result = groupOrdersByAgent(orders, agentCodeMap);
    expect(result.has("L03")).toBe(true);
    expect(result.get("L03")!.total).toBe(2);
    expect(result.get("L03")!.delivered).toBe(1);
    expect(result.get("L03")!.returned).toBe(1);
  });

  it("groups mediaz orders as 'mediaz' regardless of partner", () => {
    const orders = [
      { agentCode: null, mediazCode: "MZ01", partner: "48h", status: "livre_paye" },
      { agentCode: null, mediazCode: "MZ02", partner: "colivraison", status: "livre_paye" },
    ];
    const result = groupOrdersByAgent(orders, agentCodeMap);
    expect(result.has("mediaz")).toBe(true);
    expect(result.get("mediaz")!.agentName).toBe("MEDIAZ");
    expect(result.get("mediaz")!.total).toBe(2);
  });

  it("handles mixed scenario: agents, mediaz, coliv_team, and unknown all in one batch", () => {
    const orders = [
      { agentCode: "R01", mediazCode: null, partner: "48h", status: "livre_paye" },
      { agentCode: "R01", mediazCode: null, partner: "colivraison", status: "livre_paye" },
      { agentCode: null, mediazCode: "MZ01", partner: "48h", status: "en_traitement" },
      { agentCode: null, mediazCode: null, partner: "colivraison", status: "retour_recu" },
      { agentCode: null, mediazCode: null, partner: "48h", status: "non_recu" },
    ];
    const result = groupOrdersByAgent(orders, agentCodeMap);
    
    expect(result.size).toBe(4); // R01, mediaz, coliv_team, unknown
    expect(result.get("R01")!.total).toBe(2);
    expect(result.get("mediaz")!.total).toBe(1);
    expect(result.get("coliv_team")!.total).toBe(1);
    expect(result.get("unknown")!.total).toBe(1);
  });
});

// ─── Per-Partner Breakdown ──────────────────────────────────────────────
describe("All Partners merged view — per-partner breakdown", () => {
  it("tracks partnerBreakdown for agent with orders from both partners", () => {
    const orders = [
      { agentCode: "R01", mediazCode: null, partner: "48h", status: "livre_paye" },
      { agentCode: "R01", mediazCode: null, partner: "48h", status: "retour_recu" },
      { agentCode: "R01", mediazCode: null, partner: "48h", status: "en_traitement" },
      { agentCode: "R01", mediazCode: null, partner: "colivraison", status: "livre_paye" },
      { agentCode: "R01", mediazCode: null, partner: "colivraison", status: "livre_paye" },
    ];
    const result = groupOrdersByAgent(orders, agentCodeMap);
    const r01 = result.get("R01")!;
    
    expect(r01.total).toBe(5);
    expect(Object.keys(r01.partnerBreakdown)).toHaveLength(2);
    
    // EcoTrack: 1 delivered, 1 returned, 1 in transit
    expect(r01.partnerBreakdown["48h"].total).toBe(3);
    expect(r01.partnerBreakdown["48h"].delivered).toBe(1);
    expect(r01.partnerBreakdown["48h"].returned).toBe(1);
    expect(r01.partnerBreakdown["48h"].inTransit).toBe(1);
    
    // Colivraison: 2 delivered
    expect(r01.partnerBreakdown["colivraison"].total).toBe(2);
    expect(r01.partnerBreakdown["colivraison"].delivered).toBe(2);
    expect(r01.partnerBreakdown["colivraison"].returned).toBe(0);
  });

  it("has single partner in breakdown when agent only uses one partner", () => {
    const orders = [
      { agentCode: "L03", mediazCode: null, partner: "48h", status: "livre_paye" },
      { agentCode: "L03", mediazCode: null, partner: "48h", status: "retour_recu" },
    ];
    const result = groupOrdersByAgent(orders, agentCodeMap);
    const l03 = result.get("L03")!;
    
    expect(Object.keys(l03.partnerBreakdown)).toHaveLength(1);
    expect(l03.partnerBreakdown["48h"].total).toBe(2);
  });

  it("partnerBreakdown totals sum to agent total", () => {
    const orders = [
      { agentCode: "R01", mediazCode: null, partner: "48h", status: "livre_paye" },
      { agentCode: "R01", mediazCode: null, partner: "48h", status: "retour_recu" },
      { agentCode: "R01", mediazCode: null, partner: "colivraison", status: "livre_paye" },
      { agentCode: "R01", mediazCode: null, partner: "colivraison", status: "en_traitement" },
      { agentCode: "R01", mediazCode: null, partner: "colivraison", status: "retour_recu" },
    ];
    const result = groupOrdersByAgent(orders, agentCodeMap);
    const r01 = result.get("R01")!;
    
    const partnerTotal = Object.values(r01.partnerBreakdown).reduce((s, p) => s + p.total, 0);
    expect(partnerTotal).toBe(r01.total);
    
    const partnerDelivered = Object.values(r01.partnerBreakdown).reduce((s, p) => s + p.delivered, 0);
    expect(partnerDelivered).toBe(r01.delivered);
    
    const partnerReturned = Object.values(r01.partnerBreakdown).reduce((s, p) => s + p.returned, 0);
    expect(partnerReturned).toBe(r01.returned);
  });
});
