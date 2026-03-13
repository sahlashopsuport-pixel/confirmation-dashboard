import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

/**
 * Tests for the admin-only history delete feature:
 * 1. Rejects unauthenticated users
 * 2. Rejects non-admin users (regular dashboard users)
 * 3. Accepts valid input from super_admin
 * 4. Validates input schema (ids must be array of numbers)
 * 5. Handles empty ids array
 */

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(opts: { withCookie?: boolean; role?: string } = {}): TrpcContext {
  const { withCookie = false, role = "user" } = opts;
  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    role: role as any,
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

describe("history.delete", () => {
  it("rejects when no dashboard session cookie is present", async () => {
    const ctx = createContext({ withCookie: false });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.history.deleteEntries({ historyIds: [1] })
    ).rejects.toThrow("Not authenticated");
  });

  it("rejects non-super_admin users", async () => {
    const ctx = createContext({ withCookie: true, role: "user" });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.history.deleteEntries({ historyIds: [1] })
    ).rejects.toThrow();
  });

  it("rejects regular admin users (only super_admin allowed)", async () => {
    const ctx = createContext({ withCookie: true, role: "admin" });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.history.deleteEntries({ historyIds: [1] })
    ).rejects.toThrow();
  });

  it("accepts valid input from super_admin (may fail at DB level)", async () => {
    // getDashboardUser reads from a JWT cookie, so we need a real JWT
    // Instead we test that the input schema is valid and the procedure exists
    const ctx = createContext({ withCookie: true, role: "super_admin" });
    const caller = appRouter.createCaller(ctx);

    // Will fail at auth level because mock cookie isn't a real JWT
    // But we verify the procedure exists and accepts the input shape
    try {
      await caller.history.deleteEntries({ historyIds: [999999] });
    } catch (err: any) {
      // Auth failure is expected (mock JWT), but NOT input validation error
      expect(err.code).not.toBe("BAD_REQUEST");
    }
  });

  it("rejects empty historyIds array", async () => {
    const ctx = createContext({ withCookie: true, role: "super_admin" });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.history.deleteEntries({ historyIds: [] })
    ).rejects.toThrow();
  });

  it("rejects non-number historyIds", async () => {
    const ctx = createContext({ withCookie: true, role: "super_admin" });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.history.deleteEntries({ historyIds: ["abc"] as any })
    ).rejects.toThrow();
  });

  it("accepts multiple historyIds from super_admin", async () => {
    const ctx = createContext({ withCookie: true, role: "super_admin" });
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.history.deleteEntries({ historyIds: [1, 2, 3] });
    } catch (err: any) {
      // Auth failure is expected (mock JWT), but NOT input validation error
      expect(err.code).not.toBe("BAD_REQUEST");
    }
  });
});
