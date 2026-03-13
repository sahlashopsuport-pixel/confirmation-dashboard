import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import jwt from "jsonwebtoken";
import type { TrpcContext } from "./_core/context";

const JWT_SECRET = process.env.JWT_SECRET || "scalex-dashboard-secret-key";
const DASHBOARD_COOKIE = "dashboard_session";

type CookieCall = {
  name: string;
  value?: string;
  options: Record<string, unknown>;
};

type ClearedCookieCall = {
  name: string;
  options: Record<string, unknown>;
};

function createPublicContext(cookies: Record<string, string> = {}): {
  ctx: TrpcContext;
  setCookies: CookieCall[];
  clearedCookies: ClearedCookieCall[];
} {
  const setCookies: CookieCall[] = [];
  const clearedCookies: ClearedCookieCall[] = [];

  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
      cookies,
    } as unknown as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        setCookies.push({ name, value, options });
      },
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as unknown as TrpcContext["res"],
  };

  return { ctx, setCookies, clearedCookies };
}

// Mock the db module
vi.mock("./db", () => ({
  verifyDashboardUser: vi.fn(async (username: string, password: string) => {
    if (username === "admin" && password === "scalex2026") {
      return { id: 1, username: "admin", dashboardRole: "super_admin" };
    }
    if (username === "agent1" && password === "agent123") {
      return { id: 2, username: "agent1", dashboardRole: "user" };
    }
    return null;
  }),
  getDashboardUserRole: vi.fn(async (userId: number) => {
    if (userId === 1) return "super_admin";
    if (userId === 2) return "user";
    return null;
  }),
  getAllAgentSheets: vi.fn(async () => []),
  addAgentSheet: vi.fn(async () => null),
  deleteAgentSheet: vi.fn(async () => true),
  updateAgentSheet: vi.fn(async () => null),
  upsertUser: vi.fn(async () => {}),
  getUserByOpenId: vi.fn(async () => undefined),
  seedDefaultUser: vi.fn(async () => {}),
  logAssignment: vi.fn(async () => ({ historyId: 1 })),
  getAssignmentHistoryList: vi.fn(async () => ({ records: [], total: 0 })),
  getAssignmentHistoryDetail: vi.fn(async () => ({ history: null, items: [] })),
  touchUserActivity: vi.fn(async () => {}),
  getAllDashboardUsersActivity: vi.fn(async () => []),
}));

describe("Role-based access control: dashboardAuth.login", () => {
  it("returns dashboardRole=super_admin for admin user", async () => {
    const { ctx, setCookies } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboardAuth.login({
      username: "admin",
      password: "scalex2026",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.username).toBe("admin");
      expect(result.dashboardRole).toBe("super_admin");
    }

    // Verify JWT includes dashboardRole
    const token = setCookies[0]?.value;
    expect(token).toBeTruthy();
    const decoded = jwt.verify(token!, JWT_SECRET) as { id: number; username: string; dashboardRole: string };
    expect(decoded.dashboardRole).toBe("super_admin");
  });

  it("returns dashboardRole=user for regular user", async () => {
    const { ctx, setCookies } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboardAuth.login({
      username: "agent1",
      password: "agent123",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.username).toBe("agent1");
      expect(result.dashboardRole).toBe("user");
    }

    // Verify JWT includes dashboardRole
    const token = setCookies[0]?.value;
    const decoded = jwt.verify(token!, JWT_SECRET) as { id: number; username: string; dashboardRole: string };
    expect(decoded.dashboardRole).toBe("user");
  });
});

describe("Role-based access control: dashboardAuth.check", () => {
  it("returns dashboardRole for super_admin from JWT", async () => {
    const token = jwt.sign({ id: 1, username: "admin", dashboardRole: "super_admin" }, JWT_SECRET, { expiresIn: "7d" });
    const { ctx } = createPublicContext({ [DASHBOARD_COOKIE]: token });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboardAuth.check();

    expect(result.authenticated).toBe(true);
    if (result.authenticated) {
      expect(result.dashboardRole).toBe("super_admin");
    }
  });

  it("returns dashboardRole=user for regular user from JWT", async () => {
    const token = jwt.sign({ id: 2, username: "agent1", dashboardRole: "user" }, JWT_SECRET, { expiresIn: "7d" });
    const { ctx } = createPublicContext({ [DASHBOARD_COOKIE]: token });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboardAuth.check();

    expect(result.authenticated).toBe(true);
    if (result.authenticated) {
      expect(result.dashboardRole).toBe("user");
    }
  });

  it("defaults to dashboardRole=user for old JWTs without role field", async () => {
    // Simulate an old JWT that doesn't have dashboardRole
    const token = jwt.sign({ id: 1, username: "admin" }, JWT_SECRET, { expiresIn: "7d" });
    const { ctx } = createPublicContext({ [DASHBOARD_COOKIE]: token });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboardAuth.check();

    expect(result.authenticated).toBe(true);
    if (result.authenticated) {
      expect(result.dashboardRole).toBe("user");
    }
  });
});

describe("Role-based access control: costData.fetch", () => {
  it("throws Forbidden for regular user trying to access costData", async () => {
    const token = jwt.sign({ id: 2, username: "agent1", dashboardRole: "user" }, JWT_SECRET, { expiresIn: "7d" });
    const { ctx } = createPublicContext({ [DASHBOARD_COOKIE]: token });
    const caller = appRouter.createCaller(ctx);

    await expect(caller.costData.fetch()).rejects.toThrow("Forbidden");
  });

  it("throws Unauthorized when no cookie is present", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.costData.fetch()).rejects.toThrow("Unauthorized");
  });

  it("allows super_admin to access costData (will fail on fetch but not on auth)", async () => {
    const token = jwt.sign({ id: 1, username: "admin", dashboardRole: "super_admin" }, JWT_SECRET, { expiresIn: "7d" });
    const { ctx } = createPublicContext({ [DASHBOARD_COOKIE]: token });
    const caller = appRouter.createCaller(ctx);

    // The fetch will fail because we're in test env (no real CDN), but it should NOT throw Forbidden
    try {
      await caller.costData.fetch();
    } catch (e: any) {
      // Should NOT be a Forbidden error — it should be a fetch error
      expect(e.message).not.toContain("Forbidden");
      expect(e.message).not.toContain("Unauthorized");
    }
  }, 15000);

  it("rejects old JWT without dashboardRole from costData", async () => {
    // Old JWT without dashboardRole defaults to 'user' → should be rejected
    const token = jwt.sign({ id: 1, username: "admin" }, JWT_SECRET, { expiresIn: "7d" });
    const { ctx } = createPublicContext({ [DASHBOARD_COOKIE]: token });
    const caller = appRouter.createCaller(ctx);

    await expect(caller.costData.fetch()).rejects.toThrow("Forbidden");
  });
});
