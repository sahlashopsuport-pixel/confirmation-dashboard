/**
 * Agent Email Filtering Tests
 *
 * Tests the filtering logic that ensures only the designated agent's
 * activity is shown per sheet, ignoring managers and other editors.
 */

import { describe, it, expect } from "vitest";
import type { AgentDailyActivity, PeopleIdMapping } from "./driveActivity";
import { analyzeAllActivities, type ActivityEvent } from "./driveActivity";

// ---- Helper: simulate the filtering logic from the activity router ----

interface SheetConfig {
  name: string;
  country: string;
  agentEmail?: string | null;
}

/**
 * Replicates the filtering logic from routers.ts activity.fetch procedure.
 * Given analyzed activities and sheet configs, returns only activities
 * from designated agents (or all if no emails configured).
 */
function filterActivitiesByDesignatedEmail(
  analysisMap: Map<string, AgentDailyActivity[]>,
  peopleIdMap: Map<string, PeopleIdMapping>,
  sheets: SheetConfig[]
): { agents: AgentDailyActivity[]; unmapped: string[] } {
  // Build designated emails set
  const designatedEmails = new Set<string>();
  const agentEmailToSheetName = new Map<string, string>();
  for (const sheet of sheets) {
    if (sheet.agentEmail) {
      designatedEmails.add(sheet.agentEmail.toLowerCase());
      agentEmailToSheetName.set(sheet.agentEmail.toLowerCase(), sheet.name);
    }
  }

  const hasDesignatedEmails = designatedEmails.size > 0;
  const agents: AgentDailyActivity[] = [];
  const unmappedIds: string[] = [];

  for (const [peopleId, dailyActivities] of Array.from(analysisMap.entries())) {
    const mapping = peopleIdMap.get(peopleId);
    if (!mapping || mapping.email === "unknown") {
      if (!hasDesignatedEmails) {
        unmappedIds.push(peopleId);
        agents.push(...dailyActivities);
      }
      continue;
    }

    // Filter: if designated emails exist, only include matching agents
    if (hasDesignatedEmails && !designatedEmails.has(mapping.email.toLowerCase())) {
      continue; // Skip non-designated editors
    }

    // Override displayName with sheet name if available
    const sheetName = agentEmailToSheetName.get(mapping.email.toLowerCase());
    for (const da of dailyActivities) {
      if (sheetName) {
        da.displayName = sheetName;
      }
      agents.push(da);
    }
  }

  agents.sort((a, b) => {
    const dateComp = b.date.localeCompare(a.date);
    if (dateComp !== 0) return dateComp;
    return a.displayName.localeCompare(b.displayName);
  });

  return { agents, unmapped: unmappedIds };
}

// ---- Tests ----

describe("Agent Email Filtering", () => {
  // Common test data: activities from 3 people (agent, manager, unknown)
  const activities: ActivityEvent[] = [
    // Agent (WARDA) — designated agent
    { timestamp: "2026-02-25T09:00:00.000Z", actorPeopleId: "people/111", actionType: "edit" },
    { timestamp: "2026-02-25T09:05:00.000Z", actorPeopleId: "people/111", actionType: "edit" },
    { timestamp: "2026-02-25T09:10:00.000Z", actorPeopleId: "people/111", actionType: "edit" },
    // Manager (Hadjer) — should be filtered out
    { timestamp: "2026-02-25T09:01:00.000Z", actorPeopleId: "people/222", actionType: "edit" },
    { timestamp: "2026-02-25T09:02:00.000Z", actorPeopleId: "people/222", actionType: "edit" },
    // Unknown person — should be filtered out when designated emails exist
    { timestamp: "2026-02-25T10:00:00.000Z", actorPeopleId: "people/333", actionType: "edit" },
  ];

  const peopleIdMap = new Map<string, PeopleIdMapping>([
    ["people/111", { peopleId: "people/111", email: "werdproo@gmail.com", displayName: "werdproo" }],
    ["people/222", { peopleId: "people/222", email: "kada.hadjerkd@gmail.com", displayName: "Hadjer" }],
    // people/333 is unmapped
  ]);

  it("filters to only designated agent when agentEmail is set", () => {
    const sheets: SheetConfig[] = [
      { name: "WARDA", country: "algeria", agentEmail: "werdproo@gmail.com" },
    ];

    const analysisMap = analyzeAllActivities(activities, peopleIdMap);
    const result = filterActivitiesByDesignatedEmail(analysisMap, peopleIdMap, sheets);

    // Only WARDA's activities should appear
    expect(result.agents.length).toBe(1); // 1 day of activity
    expect(result.agents[0].email).toBe("werdproo@gmail.com");
    expect(result.agents[0].totalEdits).toBe(3);
    // Hadjer and unknown should be excluded
    expect(result.unmapped).toHaveLength(0); // unmapped are excluded when designated emails exist
  });

  it("shows all activities when no agentEmail is configured", () => {
    const sheets: SheetConfig[] = [
      { name: "WARDA", country: "algeria" }, // no agentEmail
    ];

    const analysisMap = analyzeAllActivities(activities, peopleIdMap);
    const result = filterActivitiesByDesignatedEmail(analysisMap, peopleIdMap, sheets);

    // All people should appear (agent + manager + unknown)
    expect(result.agents.length).toBeGreaterThanOrEqual(2); // at least agent + manager
    const emails = result.agents.map(a => a.email);
    expect(emails).toContain("werdproo@gmail.com");
    expect(emails).toContain("kada.hadjerkd@gmail.com");
    // Unknown person should be in unmapped
    expect(result.unmapped).toContain("people/333");
  });

  it("overrides displayName with sheet name for designated agents", () => {
    const sheets: SheetConfig[] = [
      { name: "WARDA", country: "algeria", agentEmail: "werdproo@gmail.com" },
    ];

    const analysisMap = analyzeAllActivities(activities, peopleIdMap);
    const result = filterActivitiesByDesignatedEmail(analysisMap, peopleIdMap, sheets);

    expect(result.agents[0].displayName).toBe("WARDA");
  });

  it("handles multiple designated agents across sheets", () => {
    const multiActivities: ActivityEvent[] = [
      // Agent 1 (WARDA)
      { timestamp: "2026-02-25T09:00:00.000Z", actorPeopleId: "people/111", actionType: "edit" },
      { timestamp: "2026-02-25T09:05:00.000Z", actorPeopleId: "people/111", actionType: "edit" },
      // Agent 2 (SOHEIB)
      { timestamp: "2026-02-25T10:00:00.000Z", actorPeopleId: "people/444", actionType: "edit" },
      { timestamp: "2026-02-25T10:05:00.000Z", actorPeopleId: "people/444", actionType: "edit" },
      { timestamp: "2026-02-25T10:10:00.000Z", actorPeopleId: "people/444", actionType: "edit" },
      // Manager (should be excluded)
      { timestamp: "2026-02-25T09:01:00.000Z", actorPeopleId: "people/222", actionType: "edit" },
    ];

    const multiPeopleMap = new Map<string, PeopleIdMapping>([
      ["people/111", { peopleId: "people/111", email: "werdproo@gmail.com", displayName: "werdproo" }],
      ["people/444", { peopleId: "people/444", email: "salhys108@gmail.com", displayName: "salhys108" }],
      ["people/222", { peopleId: "people/222", email: "kada.hadjerkd@gmail.com", displayName: "Hadjer" }],
    ]);

    const sheets: SheetConfig[] = [
      { name: "WARDA", country: "algeria", agentEmail: "werdproo@gmail.com" },
      { name: "Soheib", country: "algeria", agentEmail: "salhys108@gmail.com" },
    ];

    const analysisMap = analyzeAllActivities(multiActivities, multiPeopleMap);
    const result = filterActivitiesByDesignatedEmail(analysisMap, multiPeopleMap, sheets);

    // Both designated agents should appear
    expect(result.agents.length).toBe(2);
    const emails = result.agents.map(a => a.email);
    expect(emails).toContain("werdproo@gmail.com");
    expect(emails).toContain("salhys108@gmail.com");
    // Manager should NOT appear
    expect(emails).not.toContain("kada.hadjerkd@gmail.com");
  });

  it("handles case-insensitive email matching", () => {
    const sheets: SheetConfig[] = [
      { name: "WARDA", country: "algeria", agentEmail: "WerdProo@Gmail.com" }, // mixed case
    ];

    const analysisMap = analyzeAllActivities(activities, peopleIdMap);
    const result = filterActivitiesByDesignatedEmail(analysisMap, peopleIdMap, sheets);

    // Should still match werdproo@gmail.com
    expect(result.agents.length).toBe(1);
    expect(result.agents[0].email).toBe("werdproo@gmail.com");
  });

  it("excludes unmapped people when designated emails are configured", () => {
    const sheets: SheetConfig[] = [
      { name: "WARDA", country: "algeria", agentEmail: "werdproo@gmail.com" },
    ];

    const analysisMap = analyzeAllActivities(activities, peopleIdMap);
    const result = filterActivitiesByDesignatedEmail(analysisMap, peopleIdMap, sheets);

    // Unmapped should be empty (excluded when filter is active)
    expect(result.unmapped).toHaveLength(0);
  });

  it("includes unmapped people when no designated emails are configured", () => {
    const sheets: SheetConfig[] = [
      { name: "WARDA", country: "algeria" }, // no agentEmail
    ];

    const analysisMap = analyzeAllActivities(activities, peopleIdMap);
    const result = filterActivitiesByDesignatedEmail(analysisMap, peopleIdMap, sheets);

    // Unmapped person should be reported
    expect(result.unmapped).toContain("people/333");
  });

  it("handles mixed sheets: some with agentEmail, some without", () => {
    // When at least one sheet has agentEmail, the filter is active
    const sheets: SheetConfig[] = [
      { name: "WARDA", country: "algeria", agentEmail: "werdproo@gmail.com" },
      { name: "OTHER", country: "algeria" }, // no agentEmail
    ];

    const analysisMap = analyzeAllActivities(activities, peopleIdMap);
    const result = filterActivitiesByDesignatedEmail(analysisMap, peopleIdMap, sheets);

    // Only WARDA should appear (filter is active because at least one email is set)
    expect(result.agents.length).toBe(1);
    expect(result.agents[0].email).toBe("werdproo@gmail.com");
  });

  it("handles empty sheets list gracefully", () => {
    const sheets: SheetConfig[] = [];

    const analysisMap = analyzeAllActivities(activities, peopleIdMap);
    const result = filterActivitiesByDesignatedEmail(analysisMap, peopleIdMap, sheets);

    // No designated emails → show all
    expect(result.agents.length).toBeGreaterThanOrEqual(2);
  });

  it("handles null agentEmail values", () => {
    const sheets: SheetConfig[] = [
      { name: "WARDA", country: "algeria", agentEmail: null },
      { name: "LINA", country: "algeria", agentEmail: null },
    ];

    const analysisMap = analyzeAllActivities(activities, peopleIdMap);
    const result = filterActivitiesByDesignatedEmail(analysisMap, peopleIdMap, sheets);

    // All null → no filter → show all
    expect(result.agents.length).toBeGreaterThanOrEqual(2);
  });

  it("sorts results by date descending then by displayName", () => {
    const multiDayActivities: ActivityEvent[] = [
      // Agent on Feb 25
      { timestamp: "2026-02-25T09:00:00.000Z", actorPeopleId: "people/111", actionType: "edit" },
      // Agent on Feb 24
      { timestamp: "2026-02-24T09:00:00.000Z", actorPeopleId: "people/111", actionType: "edit" },
    ];

    const sheets: SheetConfig[] = [
      { name: "WARDA", country: "algeria", agentEmail: "werdproo@gmail.com" },
    ];

    const analysisMap = analyzeAllActivities(multiDayActivities, peopleIdMap);
    const result = filterActivitiesByDesignatedEmail(analysisMap, peopleIdMap, sheets);

    expect(result.agents.length).toBe(2);
    // Feb 25 should come first (descending)
    expect(result.agents[0].date).toBe("2026-02-25");
    expect(result.agents[1].date).toBe("2026-02-24");
  });
});
