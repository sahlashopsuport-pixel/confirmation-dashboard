import { describe, it, expect } from "vitest";
import { mergeActivitiesByEmail, type ActivityEvent, type PeopleIdMapping } from "./driveActivity";

describe("mergeActivitiesByEmail", () => {
  it("merges activities from multiple people IDs with the same email", () => {
    const activities: ActivityEvent[] = [
      { timestamp: "2026-02-25T09:00:00.000Z", actorPeopleId: "people/111", actionType: "edit" },
      { timestamp: "2026-02-25T09:05:00.000Z", actorPeopleId: "people/222", actionType: "edit" },
      { timestamp: "2026-02-25T09:10:00.000Z", actorPeopleId: "people/333", actionType: "edit" },
    ];

    const peopleIdMap = new Map<string, PeopleIdMapping>([
      ["people/111", { peopleId: "people/111", email: "yacine@gmail.com", displayName: "yacine" }],
      ["people/222", { peopleId: "people/222", email: "yacine@gmail.com", displayName: "yacine" }],
      ["people/333", { peopleId: "people/333", email: "yacine@gmail.com", displayName: "yacine" }],
    ]);

    const { mergedActivities, mergedPeopleIdMap } = mergeActivitiesByEmail(activities, peopleIdMap);

    // All activities should be remapped to canonical people/111
    expect(mergedActivities.every(a => a.actorPeopleId === "people/111")).toBe(true);
    expect(mergedActivities.length).toBe(3);

    // Only canonical entry should remain in map
    expect(mergedPeopleIdMap.size).toBe(1);
    expect(mergedPeopleIdMap.has("people/111")).toBe(true);
    expect(mergedPeopleIdMap.has("people/222")).toBe(false);
    expect(mergedPeopleIdMap.has("people/333")).toBe(false);
  });

  it("deduplicates activities with same timestamp after merging", () => {
    const activities: ActivityEvent[] = [
      { timestamp: "2026-02-25T09:00:00.000Z", actorPeopleId: "people/111", actionType: "edit" },
      { timestamp: "2026-02-25T09:00:00.000Z", actorPeopleId: "people/222", actionType: "edit" }, // same timestamp, different ID
      { timestamp: "2026-02-25T09:05:00.000Z", actorPeopleId: "people/111", actionType: "edit" },
    ];

    const peopleIdMap = new Map<string, PeopleIdMapping>([
      ["people/111", { peopleId: "people/111", email: "yacine@gmail.com", displayName: "yacine" }],
      ["people/222", { peopleId: "people/222", email: "yacine@gmail.com", displayName: "yacine" }],
    ]);

    const { mergedActivities } = mergeActivitiesByEmail(activities, peopleIdMap);

    // Duplicate timestamp should be removed
    expect(mergedActivities.length).toBe(2);
  });

  it("does not merge activities from different emails", () => {
    const activities: ActivityEvent[] = [
      { timestamp: "2026-02-25T09:00:00.000Z", actorPeopleId: "people/111", actionType: "edit" },
      { timestamp: "2026-02-25T09:05:00.000Z", actorPeopleId: "people/222", actionType: "edit" },
    ];

    const peopleIdMap = new Map<string, PeopleIdMapping>([
      ["people/111", { peopleId: "people/111", email: "yacine@gmail.com", displayName: "yacine" }],
      ["people/222", { peopleId: "people/222", email: "sarah@gmail.com", displayName: "sarah" }],
    ]);

    const { mergedActivities, mergedPeopleIdMap } = mergeActivitiesByEmail(activities, peopleIdMap);

    // No merging should happen
    expect(mergedActivities.length).toBe(2);
    expect(mergedPeopleIdMap.size).toBe(2);
    expect(mergedActivities[0].actorPeopleId).toBe("people/111");
    expect(mergedActivities[1].actorPeopleId).toBe("people/222");
  });

  it("returns as-is when no duplicates exist", () => {
    const activities: ActivityEvent[] = [
      { timestamp: "2026-02-25T09:00:00.000Z", actorPeopleId: "people/111", actionType: "edit" },
    ];

    const peopleIdMap = new Map<string, PeopleIdMapping>([
      ["people/111", { peopleId: "people/111", email: "yacine@gmail.com", displayName: "yacine" }],
    ]);

    const { mergedActivities, mergedPeopleIdMap } = mergeActivitiesByEmail(activities, peopleIdMap);

    expect(mergedActivities).toBe(activities); // same reference (no copy)
    expect(mergedPeopleIdMap).toBe(peopleIdMap);
  });

  it("handles case-insensitive email matching", () => {
    const activities: ActivityEvent[] = [
      { timestamp: "2026-02-25T09:00:00.000Z", actorPeopleId: "people/111", actionType: "edit" },
      { timestamp: "2026-02-25T09:05:00.000Z", actorPeopleId: "people/222", actionType: "edit" },
    ];

    const peopleIdMap = new Map<string, PeopleIdMapping>([
      ["people/111", { peopleId: "people/111", email: "Yacine@Gmail.com", displayName: "yacine" }],
      ["people/222", { peopleId: "people/222", email: "yacine@gmail.com", displayName: "yacine" }],
    ]);

    const { mergedActivities, mergedPeopleIdMap } = mergeActivitiesByEmail(activities, peopleIdMap);

    // Should merge (case-insensitive)
    expect(mergedActivities.every(a => a.actorPeopleId === "people/111")).toBe(true);
    expect(mergedPeopleIdMap.size).toBe(1);
  });

  it("skips unknown emails during merging", () => {
    const activities: ActivityEvent[] = [
      { timestamp: "2026-02-25T09:00:00.000Z", actorPeopleId: "people/111", actionType: "edit" },
      { timestamp: "2026-02-25T09:05:00.000Z", actorPeopleId: "people/222", actionType: "edit" },
      { timestamp: "2026-02-25T09:10:00.000Z", actorPeopleId: "people/333", actionType: "edit" },
    ];

    const peopleIdMap = new Map<string, PeopleIdMapping>([
      ["people/111", { peopleId: "people/111", email: "unknown", displayName: "Unknown" }],
      ["people/222", { peopleId: "people/222", email: "unknown", displayName: "Unknown" }],
      ["people/333", { peopleId: "people/333", email: "yacine@gmail.com", displayName: "yacine" }],
    ]);

    const { mergedActivities, mergedPeopleIdMap } = mergeActivitiesByEmail(activities, peopleIdMap);

    // Unknown emails should NOT be merged together
    expect(mergedActivities.length).toBe(3);
    // people/111 and people/222 keep their original IDs
    expect(mergedActivities[0].actorPeopleId).toBe("people/111");
    expect(mergedActivities[1].actorPeopleId).toBe("people/222");
    expect(mergedPeopleIdMap.size).toBe(3);
  });

  it("handles mixed: some emails have duplicates, some don't", () => {
    const activities: ActivityEvent[] = [
      { timestamp: "2026-02-25T09:00:00.000Z", actorPeopleId: "people/111", actionType: "edit" },
      { timestamp: "2026-02-25T09:05:00.000Z", actorPeopleId: "people/222", actionType: "edit" },
      { timestamp: "2026-02-25T09:10:00.000Z", actorPeopleId: "people/333", actionType: "edit" },
    ];

    const peopleIdMap = new Map<string, PeopleIdMapping>([
      ["people/111", { peopleId: "people/111", email: "yacine@gmail.com", displayName: "yacine" }],
      ["people/222", { peopleId: "people/222", email: "yacine@gmail.com", displayName: "yacine" }],
      ["people/333", { peopleId: "people/333", email: "sarah@gmail.com", displayName: "sarah" }],
    ]);

    const { mergedActivities, mergedPeopleIdMap } = mergeActivitiesByEmail(activities, peopleIdMap);

    // Yacine merged, Sarah untouched
    const yacineActivities = mergedActivities.filter(a => a.actorPeopleId === "people/111");
    const sarahActivities = mergedActivities.filter(a => a.actorPeopleId === "people/333");
    expect(yacineActivities.length).toBe(2);
    expect(sarahActivities.length).toBe(1);
    expect(mergedPeopleIdMap.size).toBe(2);
  });
});
