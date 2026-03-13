import { describe, it, expect } from "vitest";
import {
  buildPeopleIdMap,
  buildPerSheetPeopleIdMap,
  analyzeDailyActivity,
  analyzeAllActivities,
  analyzeResolvedDailyActivity,
  analyzeAllResolvedActivities,
  extractSpreadsheetId,
  type ActivityEvent,
  type RevisionInfo,
  type PeopleIdMapping,
  type ResolvedActivityEvent,
} from "./driveActivity";

// ---- extractSpreadsheetId ----

describe("extractSpreadsheetId", () => {
  it("extracts ID from a standard Google Sheets URL", () => {
    const url =
      "https://docs.google.com/spreadsheets/d/1Corh-HgN9TlG0X9k3J6ARMwn0oBFyuQ0-WS-K4mg6FY/edit?gid=0#gid=0";
    expect(extractSpreadsheetId(url)).toBe(
      "1Corh-HgN9TlG0X9k3J6ARMwn0oBFyuQ0-WS-K4mg6FY"
    );
  });

  it("extracts ID from a URL without query params", () => {
    const url =
      "https://docs.google.com/spreadsheets/d/abc123-_xyz/edit";
    expect(extractSpreadsheetId(url)).toBe("abc123-_xyz");
  });

  it("throws on invalid URL", () => {
    expect(() => extractSpreadsheetId("https://example.com")).toThrow(
      "Invalid Google Sheets URL"
    );
  });
});

// ---- buildPeopleIdMap (legacy, backward compat) ----

describe("buildPeopleIdMap", () => {
  it("maps people ID to email when timestamps match within 30s", () => {
    const activities: ActivityEvent[] = [
      {
        timestamp: "2026-02-25T14:17:25.000Z",
        actorPeopleId: "people/111",
        actionType: "edit",
      },
    ];
    const revisions: RevisionInfo[] = [
      {
        revisionId: "1",
        modifiedTime: "2026-02-25T14:17:27.000Z",
        lastModifyingUser: {
          displayName: "Soheib",
          emailAddress: "salhys108@gmail.com",
        },
      },
    ];

    const result = buildPeopleIdMap(activities, revisions);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      peopleId: "people/111",
      email: "salhys108@gmail.com",
      displayName: "Soheib",
    });
  });

  it("does not map when timestamps differ by more than 30s", () => {
    const activities: ActivityEvent[] = [
      {
        timestamp: "2026-02-25T14:17:25.000Z",
        actorPeopleId: "people/111",
        actionType: "edit",
      },
    ];
    const revisions: RevisionInfo[] = [
      {
        revisionId: "1",
        modifiedTime: "2026-02-25T14:20:00.000Z",
        lastModifyingUser: {
          displayName: "Soheib",
          emailAddress: "salhys108@gmail.com",
        },
      },
    ];

    const result = buildPeopleIdMap(activities, revisions);
    expect(result).toHaveLength(0);
  });

  it("maps multiple people IDs to different emails", () => {
    const activities: ActivityEvent[] = [
      {
        timestamp: "2026-02-25T10:00:00.000Z",
        actorPeopleId: "people/111",
        actionType: "edit",
      },
      {
        timestamp: "2026-02-25T11:00:00.000Z",
        actorPeopleId: "people/222",
        actionType: "edit",
      },
    ];
    const revisions: RevisionInfo[] = [
      {
        revisionId: "1",
        modifiedTime: "2026-02-25T10:00:05.000Z",
        lastModifyingUser: {
          displayName: "Agent A",
          emailAddress: "agenta@gmail.com",
        },
      },
      {
        revisionId: "2",
        modifiedTime: "2026-02-25T11:00:10.000Z",
        lastModifyingUser: {
          displayName: "Agent B",
          emailAddress: "agentb@gmail.com",
        },
      },
    ];

    const result = buildPeopleIdMap(activities, revisions);
    expect(result).toHaveLength(2);
    expect(result.find((m) => m.peopleId === "people/111")?.email).toBe(
      "agenta@gmail.com"
    );
    expect(result.find((m) => m.peopleId === "people/222")?.email).toBe(
      "agentb@gmail.com"
    );
  });

  it("skips revisions without email", () => {
    const activities: ActivityEvent[] = [
      {
        timestamp: "2026-02-25T10:00:00.000Z",
        actorPeopleId: "people/111",
        actionType: "edit",
      },
    ];
    const revisions: RevisionInfo[] = [
      {
        revisionId: "1",
        modifiedTime: "2026-02-25T10:00:05.000Z",
        lastModifyingUser: {
          displayName: "Anonymous",
        },
      },
    ];

    const result = buildPeopleIdMap(activities, revisions);
    expect(result).toHaveLength(0);
  });
});

// ---- buildPerSheetPeopleIdMap (NEW — per-sheet mapping) ----

describe("buildPerSheetPeopleIdMap", () => {
  it("maps people IDs to emails by matching timestamps within 30s", () => {
    const activities: ActivityEvent[] = [
      { timestamp: "2026-02-26T10:00:00Z", actorPeopleId: "people/111", actionType: "edit" },
      { timestamp: "2026-02-26T10:05:00Z", actorPeopleId: "people/222", actionType: "edit" },
    ];
    const revisions: RevisionInfo[] = [
      {
        revisionId: "1",
        modifiedTime: "2026-02-26T10:00:05Z",
        lastModifyingUser: { emailAddress: "alice@gmail.com", displayName: "Alice" },
      },
      {
        revisionId: "2",
        modifiedTime: "2026-02-26T10:05:10Z",
        lastModifyingUser: { emailAddress: "bob@gmail.com", displayName: "Bob" },
      },
    ];

    const map = buildPerSheetPeopleIdMap(activities, revisions);
    expect(map.size).toBe(2);
    expect(map.get("people/111")?.email).toBe("alice@gmail.com");
    expect(map.get("people/222")?.email).toBe("bob@gmail.com");
  });

  it("produces DIFFERENT mappings for the SAME people ID on different sheets", () => {
    // This is the core bug fix: same people ID maps to different users on different sheets
    const activitiesSheetA: ActivityEvent[] = [
      { timestamp: "2026-02-26T10:00:00Z", actorPeopleId: "people/111", actionType: "edit" },
    ];
    const revisionsSheetA: RevisionInfo[] = [
      {
        revisionId: "1",
        modifiedTime: "2026-02-26T10:00:02Z",
        lastModifyingUser: { emailAddress: "alice@gmail.com", displayName: "Alice" },
      },
    ];

    const activitiesSheetB: ActivityEvent[] = [
      { timestamp: "2026-02-26T10:00:00Z", actorPeopleId: "people/111", actionType: "edit" },
    ];
    const revisionsSheetB: RevisionInfo[] = [
      {
        revisionId: "1",
        modifiedTime: "2026-02-26T10:00:03Z",
        lastModifyingUser: { emailAddress: "bob@gmail.com", displayName: "Bob" },
      },
    ];

    const mapA = buildPerSheetPeopleIdMap(activitiesSheetA, revisionsSheetA);
    const mapB = buildPerSheetPeopleIdMap(activitiesSheetB, revisionsSheetB);

    // Same people ID, different emails — this is the bug we fixed
    expect(mapA.get("people/111")?.email).toBe("alice@gmail.com");
    expect(mapB.get("people/111")?.email).toBe("bob@gmail.com");
  });

  it("does NOT map when timestamp diff exceeds 30s", () => {
    const activities: ActivityEvent[] = [
      { timestamp: "2026-02-26T10:00:00Z", actorPeopleId: "people/111", actionType: "edit" },
    ];
    const revisions: RevisionInfo[] = [
      {
        revisionId: "1",
        modifiedTime: "2026-02-26T10:01:00Z", // 60s gap
        lastModifyingUser: { emailAddress: "alice@gmail.com", displayName: "Alice" },
      },
    ];

    const map = buildPerSheetPeopleIdMap(activities, revisions);
    expect(map.size).toBe(0);
  });
});

// ---- analyzeResolvedDailyActivity (NEW — email-based) ----

describe("analyzeResolvedDailyActivity", () => {
  it("calculates shift times and edit counts for a single email on a date", () => {
    const activities: ResolvedActivityEvent[] = [
      { timestamp: "2026-02-26T08:00:00Z", email: "agent@gmail.com", displayName: "Agent", actionType: "edit", sourceFileId: "sheet1" },
      { timestamp: "2026-02-26T08:05:00Z", email: "agent@gmail.com", displayName: "Agent", actionType: "edit", sourceFileId: "sheet1" },
      { timestamp: "2026-02-26T08:10:00Z", email: "agent@gmail.com", displayName: "Agent", actionType: "edit", sourceFileId: "sheet1" },
      // Different email — should be excluded
      { timestamp: "2026-02-26T08:03:00Z", email: "other@gmail.com", displayName: "Other", actionType: "edit", sourceFileId: "sheet1" },
    ];

    const result = analyzeResolvedDailyActivity(activities, "agent@gmail.com", "2026-02-26", "Agent");
    expect(result).not.toBeNull();
    expect(result!.totalEdits).toBe(3);
    expect(result!.email).toBe("agent@gmail.com");
  });

  it("returns null when no activities match the email/date", () => {
    const activities: ResolvedActivityEvent[] = [
      { timestamp: "2026-02-26T08:00:00Z", email: "agent@gmail.com", displayName: "Agent", actionType: "edit", sourceFileId: "sheet1" },
    ];

    const result = analyzeResolvedDailyActivity(activities, "other@gmail.com", "2026-02-26", "Other");
    expect(result).toBeNull();
  });

  it("detects breaks (gaps > 15 min)", () => {
    const activities: ResolvedActivityEvent[] = [
      { timestamp: "2026-02-26T08:00:00Z", email: "agent@gmail.com", displayName: "Agent", actionType: "edit", sourceFileId: "sheet1" },
      // 30 min gap
      { timestamp: "2026-02-26T08:30:00Z", email: "agent@gmail.com", displayName: "Agent", actionType: "edit", sourceFileId: "sheet1" },
    ];

    const result = analyzeResolvedDailyActivity(activities, "agent@gmail.com", "2026-02-26", "Agent");
    expect(result).not.toBeNull();
    expect(result!.breaks.length).toBe(1);
    expect(result!.breaks[0].durationMin).toBe(30);
  });

  it("aggregates edits from multiple sheets for the same email", () => {
    const activities: ResolvedActivityEvent[] = [
      { timestamp: "2026-02-26T08:00:00Z", email: "agent@gmail.com", displayName: "Agent", actionType: "edit", sourceFileId: "sheet1" },
      { timestamp: "2026-02-26T08:05:00Z", email: "agent@gmail.com", displayName: "Agent", actionType: "edit", sourceFileId: "sheet2" },
      { timestamp: "2026-02-26T08:10:00Z", email: "agent@gmail.com", displayName: "Agent", actionType: "edit", sourceFileId: "sheet1" },
    ];

    const result = analyzeResolvedDailyActivity(activities, "agent@gmail.com", "2026-02-26", "Agent");
    expect(result).not.toBeNull();
    expect(result!.totalEdits).toBe(3); // All 3 from both sheets
  });
});

// ---- analyzeAllResolvedActivities (NEW — email-based grouping) ----

describe("analyzeAllResolvedActivities", () => {
  it("groups activities by email and date", () => {
    const activities: ResolvedActivityEvent[] = [
      { timestamp: "2026-02-26T08:00:00Z", email: "alice@gmail.com", displayName: "Alice", actionType: "edit", sourceFileId: "sheet1" },
      { timestamp: "2026-02-26T09:00:00Z", email: "alice@gmail.com", displayName: "Alice", actionType: "edit", sourceFileId: "sheet1" },
      { timestamp: "2026-02-26T08:00:00Z", email: "bob@gmail.com", displayName: "Bob", actionType: "edit", sourceFileId: "sheet2" },
      { timestamp: "2026-02-25T08:00:00Z", email: "alice@gmail.com", displayName: "Alice", actionType: "edit", sourceFileId: "sheet1" },
    ];

    const emailToDisplayName = new Map<string, string>();
    emailToDisplayName.set("alice@gmail.com", "ALICE");
    emailToDisplayName.set("bob@gmail.com", "BOB");

    const result = analyzeAllResolvedActivities(activities, emailToDisplayName);

    // 3 entries: Alice on 2/26, Bob on 2/26, Alice on 2/25
    expect(result.length).toBe(3);

    const aliceEntry = result.find((r) => r.email === "alice@gmail.com" && r.date === "2026-02-26");
    expect(aliceEntry?.displayName).toBe("ALICE");
    expect(aliceEntry?.totalEdits).toBe(2);

    const bobEntry = result.find((r) => r.email === "bob@gmail.com");
    expect(bobEntry?.displayName).toBe("BOB");
    expect(bobEntry?.totalEdits).toBe(1);
  });

  it("uses email prefix as fallback display name", () => {
    const activities: ResolvedActivityEvent[] = [
      { timestamp: "2026-02-26T08:00:00Z", email: "unknown@gmail.com", displayName: "unknown", actionType: "edit", sourceFileId: "sheet1" },
    ];

    const emailToDisplayName = new Map<string, string>();
    const result = analyzeAllResolvedActivities(activities, emailToDisplayName);
    expect(result.length).toBe(1);
    expect(result[0].displayName).toBe("unknown");
  });
});

// ---- analyzeDailyActivity (legacy, backward compat) ----

describe("analyzeDailyActivity", () => {
  function makeActivities(
    peopleId: string,
    utcTimes: string[]
  ): ActivityEvent[] {
    return utcTimes.map((t) => ({
      timestamp: t,
      actorPeopleId: peopleId,
      actionType: "edit",
    }));
  }

  it("calculates shift start/end and total edits", () => {
    const activities = makeActivities("people/111", [
      "2026-02-25T09:00:00.000Z",
      "2026-02-25T09:03:00.000Z",
      "2026-02-25T09:06:00.000Z",
      "2026-02-25T14:00:00.000Z",
    ]);

    const result = analyzeDailyActivity(
      activities,
      "people/111",
      "2026-02-25",
      "test@gmail.com",
      "Test Agent"
    );

    expect(result).not.toBeNull();
    expect(result!.totalEdits).toBe(4);
    expect(result!.email).toBe("test@gmail.com");
    expect(result!.displayName).toBe("Test Agent");
    expect(result!.date).toBe("2026-02-25");
  });

  it("detects breaks (idle gaps > 15 min)", () => {
    const activities = makeActivities("people/111", [
      "2026-02-25T09:00:00.000Z",
      "2026-02-25T09:03:00.000Z",
      "2026-02-25T09:33:00.000Z",
      "2026-02-25T09:36:00.000Z",
    ]);

    const result = analyzeDailyActivity(
      activities,
      "people/111",
      "2026-02-25",
      "test@gmail.com",
      "Test"
    );

    expect(result).not.toBeNull();
    expect(result!.breaks).toHaveLength(1);
    expect(result!.breaks[0].durationMin).toBe(30);
    expect(result!.idleHours).toBeGreaterThan(0);
  });

  it("returns null when no activities for the given date", () => {
    const activities = makeActivities("people/111", [
      "2026-02-24T09:00:00.000Z",
    ]);

    const result = analyzeDailyActivity(
      activities,
      "people/111",
      "2026-02-25",
      "test@gmail.com",
      "Test"
    );

    expect(result).toBeNull();
  });

  it("returns null for a different person", () => {
    const activities = makeActivities("people/222", [
      "2026-02-25T09:00:00.000Z",
    ]);

    const result = analyzeDailyActivity(
      activities,
      "people/111",
      "2026-02-25",
      "test@gmail.com",
      "Test"
    );

    expect(result).toBeNull();
  });

  it("calculates hourly edit distribution", () => {
    const activities = makeActivities("people/111", [
      "2026-02-25T09:00:00.000Z",
      "2026-02-25T09:01:00.000Z",
      "2026-02-25T10:00:00.000Z",
      "2026-02-25T13:00:00.000Z",
      "2026-02-25T13:05:00.000Z",
      "2026-02-25T13:10:00.000Z",
    ]);

    const result = analyzeDailyActivity(
      activities,
      "people/111",
      "2026-02-25",
      "test@gmail.com",
      "Test"
    );

    expect(result).not.toBeNull();
    expect(result!.hourlyEdits[10]).toBe(2);
    expect(result!.hourlyEdits[11]).toBe(1);
    expect(result!.hourlyEdits[14]).toBe(3);
  });

  it("handles single edit (zero span)", () => {
    const activities = makeActivities("people/111", [
      "2026-02-25T09:00:00.000Z",
    ]);

    const result = analyzeDailyActivity(
      activities,
      "people/111",
      "2026-02-25",
      "test@gmail.com",
      "Test"
    );

    expect(result).not.toBeNull();
    expect(result!.totalEdits).toBe(1);
    expect(result!.totalSpanHours).toBe(0);
    expect(result!.activeHours).toBe(0);
    expect(result!.breaks).toHaveLength(0);
  });
});

// ---- analyzeAllActivities (legacy, backward compat) ----

describe("analyzeAllActivities", () => {
  it("groups activities by person and date", () => {
    const activities: ActivityEvent[] = [
      { timestamp: "2026-02-25T09:00:00.000Z", actorPeopleId: "people/111", actionType: "edit" },
      { timestamp: "2026-02-25T09:05:00.000Z", actorPeopleId: "people/111", actionType: "edit" },
      { timestamp: "2026-02-24T09:00:00.000Z", actorPeopleId: "people/111", actionType: "edit" },
      { timestamp: "2026-02-25T10:00:00.000Z", actorPeopleId: "people/222", actionType: "edit" },
    ];

    const peopleIdMap = new Map<string, PeopleIdMapping>([
      ["people/111", { peopleId: "people/111", email: "a@test.com", displayName: "Agent A" }],
      ["people/222", { peopleId: "people/222", email: "b@test.com", displayName: "Agent B" }],
    ]);

    const result = analyzeAllActivities(activities, peopleIdMap);

    const personA = result.get("people/111");
    expect(personA).toBeDefined();
    expect(personA!.length).toBe(2);

    const personB = result.get("people/222");
    expect(personB).toBeDefined();
    expect(personB!.length).toBe(1);
  });

  it("uses fallback display name when mapping not found", () => {
    const activities: ActivityEvent[] = [
      { timestamp: "2026-02-25T09:00:00.000Z", actorPeopleId: "people/999", actionType: "edit" },
    ];

    const peopleIdMap = new Map<string, PeopleIdMapping>();

    const result = analyzeAllActivities(activities, peopleIdMap);
    const person = result.get("people/999");
    expect(person).toBeDefined();
    expect(person![0].email).toBe("unknown");
    expect(person![0].displayName).toBe("999");
  });
});
