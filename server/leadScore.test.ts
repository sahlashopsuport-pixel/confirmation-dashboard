import { describe, it, expect } from "vitest";
import {
  orderProfit,
  calculateProfitPerLead,
  calculateLeadScores,
  extractConfirmedQuantities,
  ALGERIA_ECONOMICS,
  type AgentScoreInput,
  type ProductEconomics,
} from "@shared/leadScore";

// ── orderProfit ──────────────────────────────────────────────────────

describe("orderProfit", () => {
  it("returns correct profit for 1pc Algeria order", () => {
    // 3,900 - 580 = 3,320
    expect(orderProfit(1, ALGERIA_ECONOMICS)).toBe(3320);
  });

  it("returns correct profit for 2pc Algeria order", () => {
    // 5,800 - 1,160 - 600 = 4,040
    expect(orderProfit(2, ALGERIA_ECONOMICS)).toBe(4040);
  });

  it("returns correct profit for 3pc Algeria order", () => {
    // 7,800 - 1,740 - 600 = 5,460
    expect(orderProfit(3, ALGERIA_ECONOMICS)).toBe(5460);
  });

  it("returns correct profit for 4pc Algeria order", () => {
    // 9,500 - 2,320 - 600 = 6,580
    expect(orderProfit(4, ALGERIA_ECONOMICS)).toBe(6580);
  });

  it("extrapolates profit for qty 5+ using profitPerExtraPiece", () => {
    // 4pc profit (6,580) + 1 extra piece (1,120) = 7,700
    expect(orderProfit(5, ALGERIA_ECONOMICS)).toBe(6580 + 1120);
  });

  it("returns 0 for qty 0 or negative", () => {
    expect(orderProfit(0, ALGERIA_ECONOMICS)).toBe(0);
    expect(orderProfit(-1, ALGERIA_ECONOMICS)).toBe(0);
  });
});

// ── calculateProfitPerLead ───────────────────────────────────────────

describe("calculateProfitPerLead", () => {
  it("calculates correct profit per lead for agent with all 1pc orders", () => {
    // Agent A: 100 leads, 55 confirmed at 1pc
    // Total profit = 55 × 3,320 = 182,600
    // Total cost = 100 × 400 = 40,000
    // Net = 142,600
    // Per lead = 1,426
    const agent: AgentScoreInput = {
      name: "Agent A",
      totalOrders: 100,
      confirmedQuantities: Array(55).fill(1),
    };
    expect(calculateProfitPerLead(agent, ALGERIA_ECONOMICS)).toBe(1426);
  });

  it("calculates correct profit per lead for agent with upsells", () => {
    // Agent B: 100 leads, 40 × 1pc + 10 × 2pc
    // Total profit = 40 × 3,320 + 10 × 4,040 = 132,800 + 40,400 = 173,200
    // Total cost = 100 × 400 = 40,000
    // Net = 133,200
    // Per lead = 1,332
    const agent: AgentScoreInput = {
      name: "Agent B",
      totalOrders: 100,
      confirmedQuantities: [...Array(40).fill(1), ...Array(10).fill(2)],
    };
    expect(calculateProfitPerLead(agent, ALGERIA_ECONOMICS)).toBe(1332);
  });

  it("higher conf rate beats moderate upsell", () => {
    // Agent A: 55% conf, 0% upsell → 1,426/lead
    const agentA: AgentScoreInput = {
      name: "Agent A",
      totalOrders: 100,
      confirmedQuantities: Array(55).fill(1),
    };
    // Agent B: 50% conf, 20% upsell → 1,332/lead
    const agentB: AgentScoreInput = {
      name: "Agent B",
      totalOrders: 100,
      confirmedQuantities: [...Array(40).fill(1), ...Array(10).fill(2)],
    };
    expect(calculateProfitPerLead(agentA, ALGERIA_ECONOMICS)).toBeGreaterThan(
      calculateProfitPerLead(agentB, ALGERIA_ECONOMICS)
    );
  });

  it("heavy upsell can overcome conf rate gap", () => {
    // Agent A: 55% conf, 0% upsell → 1,426/lead
    const agentA: AgentScoreInput = {
      name: "Agent A",
      totalOrders: 100,
      confirmedQuantities: Array(55).fill(1),
    };
    // Agent C: 50% conf, 50% upsell (25 × 1pc + 25 × 2pc)
    // Profit = 25 × 3,320 + 25 × 4,040 = 83,000 + 101,000 = 184,000
    // Cost = 40,000 → Net = 144,000 → 1,440/lead
    const agentC: AgentScoreInput = {
      name: "Agent C",
      totalOrders: 100,
      confirmedQuantities: [...Array(25).fill(1), ...Array(25).fill(2)],
    };
    expect(calculateProfitPerLead(agentC, ALGERIA_ECONOMICS)).toBeGreaterThan(
      calculateProfitPerLead(agentA, ALGERIA_ECONOMICS)
    );
  });

  it("returns 0 for agent with 0 orders", () => {
    const agent: AgentScoreInput = {
      name: "Empty",
      totalOrders: 0,
      confirmedQuantities: [],
    };
    expect(calculateProfitPerLead(agent, ALGERIA_ECONOMICS)).toBe(0);
  });

  it("returns negative for agent with very low conf rate", () => {
    // Agent: 100 leads, 5 confirmed at 1pc
    // Profit = 5 × 3,320 = 16,600
    // Cost = 100 × 400 = 40,000
    // Net = -23,400 → -234/lead
    const agent: AgentScoreInput = {
      name: "Bad Agent",
      totalOrders: 100,
      confirmedQuantities: Array(5).fill(1),
    };
    expect(calculateProfitPerLead(agent, ALGERIA_ECONOMICS)).toBeLessThan(0);
  });
});

// ── calculateLeadScores (normalization) ──────────────────────────────

describe("calculateLeadScores", () => {
  it("normalizes scores to 0-100 range", () => {
    const agents: AgentScoreInput[] = [
      { name: "Best", totalOrders: 100, confirmedQuantities: Array(60).fill(1) },
      { name: "Mid", totalOrders: 100, confirmedQuantities: Array(40).fill(1) },
      { name: "Low", totalOrders: 100, confirmedQuantities: Array(20).fill(1) },
    ];
    const results = calculateLeadScores(agents, ALGERIA_ECONOMICS);
    
    // Best agent should get 100
    const best = results.find(r => r.name === "Best")!;
    expect(best.score).toBe(100);
    expect(best.rank).toBe(1);
    
    // Low agent should get 0
    const low = results.find(r => r.name === "Low")!;
    expect(low.score).toBe(0);
    expect(low.rank).toBe(3);
    
    // Mid should be between 0 and 100
    const mid = results.find(r => r.name === "Mid")!;
    expect(mid.score).toBeGreaterThan(0);
    expect(mid.score).toBeLessThan(100);
    expect(mid.rank).toBe(2);
  });

  it("gives all agents 100 when they have identical performance", () => {
    const agents: AgentScoreInput[] = [
      { name: "A", totalOrders: 100, confirmedQuantities: Array(50).fill(1) },
      { name: "B", totalOrders: 100, confirmedQuantities: Array(50).fill(1) },
    ];
    const results = calculateLeadScores(agents, ALGERIA_ECONOMICS);
    expect(results.every(r => r.score === 100)).toBe(true);
  });

  it("single agent gets score 100", () => {
    const agents: AgentScoreInput[] = [
      { name: "Solo", totalOrders: 50, confirmedQuantities: Array(30).fill(1) },
    ];
    const results = calculateLeadScores(agents, ALGERIA_ECONOMICS);
    expect(results[0].score).toBe(100);
    expect(results[0].rank).toBe(1);
  });

  it("returns empty array for no agents", () => {
    expect(calculateLeadScores([], ALGERIA_ECONOMICS)).toEqual([]);
  });

  it("clamps negative profit agents to score 0", () => {
    const agents: AgentScoreInput[] = [
      { name: "Good", totalOrders: 100, confirmedQuantities: Array(60).fill(1) },
      { name: "Bad", totalOrders: 100, confirmedQuantities: Array(5).fill(1) },
    ];
    const results = calculateLeadScores(agents, ALGERIA_ECONOMICS);
    const bad = results.find(r => r.name === "Bad")!;
    expect(bad.score).toBe(0);
  });

  it("ranks agents correctly by profit per lead", () => {
    const agents: AgentScoreInput[] = [
      // High conf, no upsell
      { name: "HighConf", totalOrders: 100, confirmedQuantities: Array(55).fill(1) },
      // Lower conf, heavy upsell (should be close or higher)
      { name: "HeavyUpsell", totalOrders: 100, confirmedQuantities: [...Array(25).fill(1), ...Array(25).fill(2)] },
      // Low conf, no upsell
      { name: "LowConf", totalOrders: 100, confirmedQuantities: Array(30).fill(1) },
    ];
    const results = calculateLeadScores(agents, ALGERIA_ECONOMICS);
    
    // HeavyUpsell should rank 1 (50% conf but 50% upsell → 1,440/lead)
    // HighConf should rank 2 (55% conf, 0% upsell → 1,426/lead)
    // LowConf should rank 3
    expect(results[0].name).toBe("HeavyUpsell");
    expect(results[1].name).toBe("HighConf");
    expect(results[2].name).toBe("LowConf");
  });

  it("3pc and 4pc upsells have significant impact", () => {
    const agents: AgentScoreInput[] = [
      // 50% conf, all 1pc
      { name: "NoUpsell", totalOrders: 100, confirmedQuantities: Array(50).fill(1) },
      // 45% conf, but 10 are 3pc orders
      { name: "BigUpsell", totalOrders: 100, confirmedQuantities: [...Array(35).fill(1), ...Array(10).fill(3)] },
    ];
    const results = calculateLeadScores(agents, ALGERIA_ECONOMICS);
    
    // NoUpsell: 50 × 3,320 - 40,000 = 126,000 → 1,260/lead
    // BigUpsell: 35 × 3,320 + 10 × 5,460 - 40,000 = 116,200 + 54,600 - 40,000 = 130,800 → 1,308/lead
    // BigUpsell should rank higher despite lower conf rate
    expect(results[0].name).toBe("BigUpsell");
  });
});

// ── extractConfirmedQuantities ───────────────────────────────────────

describe("extractConfirmedQuantities", () => {
  it("extracts quantities from confirmed orders only", () => {
    const orders = [
      { status: "confirmed", quantity: 1 },
      { status: "cancelled", quantity: 2 },
      { status: "confirmed", quantity: 2 },
      { status: "postponed", quantity: 1 },
      { status: "confirmed", quantity: 1 },
    ];
    expect(extractConfirmedQuantities(orders)).toEqual([1, 2, 1]);
  });

  it("treats 0 quantity as 1 (minimum)", () => {
    const orders = [
      { status: "confirmed", quantity: 0 },
      { status: "confirmed", quantity: 1 },
    ];
    expect(extractConfirmedQuantities(orders)).toEqual([1, 1]);
  });

  it("returns empty array when no confirmed orders", () => {
    const orders = [
      { status: "cancelled", quantity: 1 },
      { status: "postponed", quantity: 2 },
    ];
    expect(extractConfirmedQuantities(orders)).toEqual([]);
  });

  it("handles empty orders array", () => {
    expect(extractConfirmedQuantities([])).toEqual([]);
  });
});

// ── Real-world scenario tests ────────────────────────────────────────

describe("Real-world Algeria scenarios", () => {
  it("Boss's example: Testicalm agent comparison", () => {
    // From the conversation:
    // Agent A: 55% conf, 0% upsell → profit/lead = 1,426
    // Agent B: 50% conf, 20% upsell → profit/lead = 1,332
    // Agent C: 50% conf, 40% upsell → profit/lead = 1,404
    const agentA: AgentScoreInput = {
      name: "Agent A",
      totalOrders: 100,
      confirmedQuantities: Array(55).fill(1),
    };
    const agentB: AgentScoreInput = {
      name: "Agent B",
      totalOrders: 100,
      confirmedQuantities: [...Array(40).fill(1), ...Array(10).fill(2)],
    };
    const agentC: AgentScoreInput = {
      name: "Agent C",
      totalOrders: 100,
      confirmedQuantities: [...Array(30).fill(1), ...Array(20).fill(2)],
    };

    const pplA = calculateProfitPerLead(agentA, ALGERIA_ECONOMICS);
    const pplB = calculateProfitPerLead(agentB, ALGERIA_ECONOMICS);
    const pplC = calculateProfitPerLead(agentC, ALGERIA_ECONOMICS);

    expect(pplA).toBe(1426);
    expect(pplB).toBe(1332);
    expect(pplC).toBe(1404);

    // Ranking: A > C > B
    expect(pplA).toBeGreaterThan(pplC);
    expect(pplC).toBeGreaterThan(pplB);
  });

  it("quantity does not inflate ranking (same efficiency, different volume)", () => {
    // Agent with 200 leads and 50% conf should score same as agent with 50 leads and 50% conf
    const bigVolume: AgentScoreInput = {
      name: "Big Volume",
      totalOrders: 200,
      confirmedQuantities: Array(100).fill(1),
    };
    const smallVolume: AgentScoreInput = {
      name: "Small Volume",
      totalOrders: 50,
      confirmedQuantities: Array(25).fill(1),
    };

    const pplBig = calculateProfitPerLead(bigVolume, ALGERIA_ECONOMICS);
    const pplSmall = calculateProfitPerLead(smallVolume, ALGERIA_ECONOMICS);

    // Same profit per lead regardless of volume
    expect(pplBig).toBe(pplSmall);
  });

  it("upsell from same lead is more profitable (cost per lead stays same)", () => {
    // 1pc confirmed: profit = 3,320, cost = 400 → net = 2,920 per lead
    // 2pc confirmed: profit = 4,040, cost = 400 → net = 3,640 per lead
    // The upsell adds 720 DZD more profit from the same lead
    const onePC: AgentScoreInput = {
      name: "1pc",
      totalOrders: 1,
      confirmedQuantities: [1],
    };
    const twoPC: AgentScoreInput = {
      name: "2pc",
      totalOrders: 1,
      confirmedQuantities: [2],
    };

    const ppl1 = calculateProfitPerLead(onePC, ALGERIA_ECONOMICS);
    const ppl2 = calculateProfitPerLead(twoPC, ALGERIA_ECONOMICS);

    expect(ppl2 - ppl1).toBe(4040 - 3320); // 720 DZD difference
  });
});
