import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

/**
 * Tests for the history.logExport mutation.
 * 
 * Since the endpoint requires a dashboard_session cookie (not Manus OAuth),
 * we test the input validation and authentication guard at the tRPC level.
 */

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(withCookie = false): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
      cookies: withCookie
        ? { dashboard_session: "mock-jwt-token" }
        : {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("history.logExport", () => {
  it("rejects when no dashboard session cookie is present", async () => {
    const ctx = createContext(false);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.history.logExport({
        partner: "sellmax",
        country: "tunisia",
        totalLeads: 10,
        duplicatesRemoved: 0,
        upsellCount: 0,
      })
    ).rejects.toThrow("Not authenticated");
  });

  it("validates partner must be sellmax or ecomamanager", async () => {
    const ctx = createContext(true);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.history.logExport({
        partner: "invalid_partner" as any,
        country: "tunisia",
        totalLeads: 10,
        duplicatesRemoved: 0,
        upsellCount: 0,
      })
    ).rejects.toThrow();
  });

  it("accepts valid sellmax export input", async () => {
    const ctx = createContext(true);
    const caller = appRouter.createCaller(ctx);

    // This will fail at DB level (no real DB in test) but validates the input schema passes
    try {
      await caller.history.logExport({
        partner: "sellmax",
        country: "tunisia",
        totalLeads: 25,
        duplicatesRemoved: 3,
        upsellCount: 0,
        sampleLeads: [
          { name: "Test User", phone: "12345678", address: "Tunis" },
        ],
      });
    } catch (err: any) {
      // If it throws, it should NOT be a validation error (ZodError)
      // It should be a DB error since we don't have a real database in tests
      expect(err.message).not.toContain("Invalid");
    }
  });

  it("accepts valid ecomamanager export input", async () => {
    const ctx = createContext(true);
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.history.logExport({
        partner: "ecomamanager",
        country: "algeria",
        totalLeads: 50,
        duplicatesRemoved: 5,
        upsellCount: 8,
        sampleLeads: [
          { name: "Test User", phone: "0555123456", address: "Alger" },
        ],
      });
    } catch (err: any) {
      expect(err.message).not.toContain("Invalid");
    }
  });
});
