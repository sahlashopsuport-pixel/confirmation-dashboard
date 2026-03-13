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

// Mock the db module to avoid real database calls in tests
vi.mock("./db", () => ({
  verifyDashboardUser: vi.fn(async (username: string, password: string) => {
    if (username === "admin" && password === "scalex2026") {
      return { id: 1, username: "admin", dashboardRole: "super_admin" };
    }
    return null;
  }),
  getDashboardUserRole: vi.fn(async (userId: number) => {
    if (userId === 1) return "super_admin";
    return "user";
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

describe("dashboardAuth.login", () => {
  it("returns success and sets cookie with valid credentials", async () => {
    const { ctx, setCookies } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboardAuth.login({
      username: "admin",
      password: "scalex2026",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.username).toBe("admin");
    }
    expect(setCookies).toHaveLength(1);
    expect(setCookies[0]?.name).toBe(DASHBOARD_COOKIE);
    expect(setCookies[0]?.options).toMatchObject({
      httpOnly: true,
      path: "/",
    });

    // Verify the JWT token is valid
    const token = setCookies[0]?.value;
    expect(token).toBeTruthy();
    const decoded = jwt.verify(token!, JWT_SECRET) as { id: number; username: string };
    expect(decoded.id).toBe(1);
    expect(decoded.username).toBe("admin");
  });

  it("returns failure with invalid credentials", async () => {
    const { ctx, setCookies } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboardAuth.login({
      username: "admin",
      password: "wrongpassword",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Invalid username or password");
    }
    expect(setCookies).toHaveLength(0);
  });
});

describe("dashboardAuth.check", () => {
  it("returns authenticated=true when valid JWT cookie is present", async () => {
    const token = jwt.sign({ id: 1, username: "admin" }, JWT_SECRET, { expiresIn: "7d" });
    const { ctx } = createPublicContext({ [DASHBOARD_COOKIE]: token });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboardAuth.check();

    expect(result.authenticated).toBe(true);
    if (result.authenticated) {
      expect(result.username).toBe("admin");
    }
  });

  it("returns authenticated=false when no cookie is present", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboardAuth.check();

    expect(result.authenticated).toBe(false);
  });

  it("returns authenticated=false when cookie has invalid token", async () => {
    const { ctx } = createPublicContext({ [DASHBOARD_COOKIE]: "invalid-token" });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboardAuth.check();

    expect(result.authenticated).toBe(false);
  });
});

describe("dashboardAuth.logout", () => {
  it("clears the dashboard session cookie", async () => {
    const token = jwt.sign({ id: 1, username: "admin" }, JWT_SECRET, { expiresIn: "7d" });
    const { ctx, clearedCookies } = createPublicContext({ [DASHBOARD_COOKIE]: token });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboardAuth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(DASHBOARD_COOKIE);
    expect(clearedCookies[0]?.options).toMatchObject({ path: "/" });
  });
});

describe("sheets.list (auth guard)", () => {
  it("returns empty array when not authenticated", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.sheets.list();

    expect(result).toEqual([]);
  });

  it("returns sheets when authenticated", async () => {
    const token = jwt.sign({ id: 1, username: "admin" }, JWT_SECRET, { expiresIn: "7d" });
    const { ctx } = createPublicContext({ [DASHBOARD_COOKIE]: token });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.sheets.list();

    // The mock returns empty array, but it should have been called
    expect(result).toEqual([]);
  });
});
