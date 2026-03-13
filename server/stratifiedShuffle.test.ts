import { describe, it, expect } from "vitest";
import {
  stratifiedShuffle,
  groupLeadsByType,
} from "../shared/stratifiedShuffle";

describe("stratifiedShuffle", () => {
  it("distributes leads proportionally across agents", () => {
    // 100 Normal + 30 Abandon + 20 TikTok = 150 total
    const leadsByType: Record<string, number[]> = {
      normal: Array.from({ length: 100 }, (_, i) => i),
      abandon: Array.from({ length: 30 }, (_, i) => 100 + i),
      tiktok: Array.from({ length: 20 }, (_, i) => 130 + i),
    };

    const agents = [
      { agentId: 1, quantity: 30 },
      { agentId: 2, quantity: 20 },
      { agentId: 3, quantity: 50 },
      { agentId: 4, quantity: 50 },
    ];

    const results = stratifiedShuffle(leadsByType, agents, 42);

    // Each agent should get their requested quantity
    expect(results[0].leadIndices.length).toBe(30);
    expect(results[1].leadIndices.length).toBe(20);
    expect(results[2].leadIndices.length).toBe(50);
    expect(results[3].leadIndices.length).toBe(50);

    // Total assigned should equal total requested
    const totalAssigned = results.reduce(
      (sum, r) => sum + r.leadIndices.length,
      0
    );
    expect(totalAssigned).toBe(150);

    // No duplicate indices across agents
    const allIndices = results.flatMap((r) => r.leadIndices);
    const uniqueIndices = new Set(allIndices);
    expect(uniqueIndices.size).toBe(150);
  });

  it("maintains proportional ratios per agent", () => {
    const leadsByType: Record<string, number[]> = {
      normal: Array.from({ length: 100 }, (_, i) => i),
      abandon: Array.from({ length: 30 }, (_, i) => 100 + i),
      tiktok: Array.from({ length: 20 }, (_, i) => 130 + i),
    };

    const agents = [
      { agentId: 1, quantity: 30 },
      { agentId: 2, quantity: 30 },
    ];

    const results = stratifiedShuffle(leadsByType, agents, 42);

    // Each agent should get roughly 67% normal, 20% abandon, 13% tiktok
    for (const result of results) {
      const normalCount = result.breakdown["normal"] || 0;
      const abandonCount = result.breakdown["abandon"] || 0;
      const tiktokCount = result.breakdown["tiktok"] || 0;
      const total = normalCount + abandonCount + tiktokCount;

      expect(total).toBe(30);
      // Normal should be ~20 (67% of 30)
      expect(normalCount).toBeGreaterThanOrEqual(19);
      expect(normalCount).toBeLessThanOrEqual(21);
      // Abandon should be ~6 (20% of 30)
      expect(abandonCount).toBeGreaterThanOrEqual(5);
      expect(abandonCount).toBeLessThanOrEqual(7);
      // TikTok should be ~4 (13% of 30)
      expect(tiktokCount).toBeGreaterThanOrEqual(3);
      expect(tiktokCount).toBeLessThanOrEqual(5);
    }
  });

  it("handles single type (no shuffle needed)", () => {
    const leadsByType: Record<string, number[]> = {
      normal: Array.from({ length: 50 }, (_, i) => i),
    };

    const agents = [
      { agentId: 1, quantity: 20 },
      { agentId: 2, quantity: 30 },
    ];

    const results = stratifiedShuffle(leadsByType, agents, 42);

    expect(results[0].leadIndices.length).toBe(20);
    expect(results[1].leadIndices.length).toBe(30);
    expect(results[0].breakdown["normal"]).toBe(20);
    expect(results[1].breakdown["normal"]).toBe(30);
  });

  it("handles uneven distribution with small numbers", () => {
    // 5 Normal + 3 Abandon = 8 total
    const leadsByType: Record<string, number[]> = {
      normal: [0, 1, 2, 3, 4],
      abandon: [5, 6, 7],
    };

    const agents = [
      { agentId: 1, quantity: 4 },
      { agentId: 2, quantity: 4 },
    ];

    const results = stratifiedShuffle(leadsByType, agents, 42);

    expect(results[0].leadIndices.length).toBe(4);
    expect(results[1].leadIndices.length).toBe(4);

    // No duplicates
    const allIndices = results.flatMap((r) => r.leadIndices);
    expect(new Set(allIndices).size).toBe(8);
  });

  it("throws when requesting more leads than available", () => {
    const leadsByType: Record<string, number[]> = {
      normal: [0, 1, 2],
    };

    const agents = [{ agentId: 1, quantity: 5 }];

    expect(() => stratifiedShuffle(leadsByType, agents, 42)).toThrow(
      "Requested 5 leads but only 3 available"
    );
  });

  it("handles agents with different quantities correctly", () => {
    // 60 Normal + 40 Abandon = 100 total
    const leadsByType: Record<string, number[]> = {
      normal: Array.from({ length: 60 }, (_, i) => i),
      abandon: Array.from({ length: 40 }, (_, i) => 60 + i),
    };

    const agents = [
      { agentId: 1, quantity: 10 },
      { agentId: 2, quantity: 50 },
      { agentId: 3, quantity: 40 },
    ];

    const results = stratifiedShuffle(leadsByType, agents, 42);

    // Agent 1: 10 leads, ~6 normal + ~4 abandon
    expect(results[0].leadIndices.length).toBe(10);
    expect(results[0].breakdown["normal"]).toBe(6);
    expect(results[0].breakdown["abandon"]).toBe(4);

    // Agent 2: 50 leads, ~30 normal + ~20 abandon
    expect(results[1].leadIndices.length).toBe(50);
    expect(results[1].breakdown["normal"]).toBe(30);
    expect(results[1].breakdown["abandon"]).toBe(20);

    // Agent 3: 40 leads, ~24 normal + ~16 abandon
    expect(results[2].leadIndices.length).toBe(40);
    expect(results[2].breakdown["normal"]).toBe(24);
    expect(results[2].breakdown["abandon"]).toBe(16);
  });

  it("produces reproducible results with the same seed", () => {
    const leadsByType: Record<string, number[]> = {
      normal: Array.from({ length: 30 }, (_, i) => i),
      abandon: Array.from({ length: 10 }, (_, i) => 30 + i),
    };

    const agents = [
      { agentId: 1, quantity: 20 },
      { agentId: 2, quantity: 20 },
    ];

    const results1 = stratifiedShuffle(leadsByType, agents, 123);
    const results2 = stratifiedShuffle(leadsByType, agents, 123);

    expect(results1[0].leadIndices).toEqual(results2[0].leadIndices);
    expect(results1[1].leadIndices).toEqual(results2[1].leadIndices);
  });

  it("handles three types with very unequal distribution", () => {
    // 80 Normal + 5 Abandon + 15 TikTok = 100 total
    const leadsByType: Record<string, number[]> = {
      normal: Array.from({ length: 80 }, (_, i) => i),
      abandon: Array.from({ length: 5 }, (_, i) => 80 + i),
      tiktok: Array.from({ length: 15 }, (_, i) => 85 + i),
    };

    const agents = [
      { agentId: 1, quantity: 25 },
      { agentId: 2, quantity: 25 },
      { agentId: 3, quantity: 25 },
      { agentId: 4, quantity: 25 },
    ];

    const results = stratifiedShuffle(leadsByType, agents, 42);

    for (const result of results) {
      expect(result.leadIndices.length).toBe(25);
      // Normal should dominate (~80%)
      const normalCount = result.breakdown["normal"] || 0;
      expect(normalCount).toBeGreaterThanOrEqual(19);
      expect(normalCount).toBeLessThanOrEqual(21);
    }

    // All 100 leads should be assigned
    const allIndices = results.flatMap((r) => r.leadIndices);
    expect(new Set(allIndices).size).toBe(100);
  });
});

describe("groupLeadsByType", () => {
  it("groups leads by batchType field", () => {
    const leads = [
      { batchType: "normal", orderType: "NORMAL" },
      { batchType: "normal", orderType: "NORMAL" },
      { batchType: "abandon", orderType: "ABANDON" },
      { batchType: "tiktok", orderType: "TIKTOK" },
      { batchType: "tiktok", orderType: "TIKTOK" },
    ];

    const groups = groupLeadsByType(leads);

    expect(groups["normal"]).toEqual([0, 1]);
    expect(groups["abandon"]).toEqual([2]);
    expect(groups["tiktok"]).toEqual([3, 4]);
  });

  it("falls back to orderType when batchType is not set", () => {
    const leads = [
      { orderType: "NORMAL" },
      { orderType: "ABANDON" },
      { orderType: "TIKTOK" },
    ];

    const groups = groupLeadsByType(leads);

    expect(groups["normal"]).toEqual([0]);
    expect(groups["abandon"]).toEqual([1]);
    expect(groups["tiktok"]).toEqual([2]);
  });

  it("defaults to 'normal' when neither batchType nor orderType is set", () => {
    const leads = [{}, {}, {}];

    const groups = groupLeadsByType(leads);

    expect(groups["normal"]).toEqual([0, 1, 2]);
  });

  it("prefers batchType over orderType", () => {
    const leads = [
      { batchType: "abandon", orderType: "NORMAL" },
      { batchType: "tiktok", orderType: "NORMAL" },
    ];

    const groups = groupLeadsByType(leads);

    expect(groups["abandon"]).toEqual([0]);
    expect(groups["tiktok"]).toEqual([1]);
    expect(groups["normal"]).toBeUndefined();
  });

  it("uses batchLabels override when provided", () => {
    const leads = [{ orderType: "NORMAL" }, { orderType: "NORMAL" }];
    const batchLabels: Record<number, string> = { 0: "abandon", 1: "tiktok" };

    const groups = groupLeadsByType(leads, batchLabels);

    expect(groups["abandon"]).toEqual([0]);
    expect(groups["tiktok"]).toEqual([1]);
  });
});
