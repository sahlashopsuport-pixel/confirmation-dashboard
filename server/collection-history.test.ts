import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "test-secret";
const DASHBOARD_COOKIE = "dashboard_session";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  // Create a valid dashboard JWT token
  const dashboardToken = jwt.sign(
    { id: 1, username: "admin", dashboardRole: "admin" },
    JWT_SECRET
  );

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
      cookies: {
        [DASHBOARD_COOKIE]: dashboardToken,
      },
    } as unknown as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("collectionHistory", () => {
  describe("collectionHistory.list", () => {
    it("returns records and total count", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.collectionHistory.list({});

      expect(result).toHaveProperty("records");
      expect(result).toHaveProperty("total");
      expect(Array.isArray(result.records)).toBe(true);
      expect(typeof result.total).toBe("number");
    });

    it("accepts country filter", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.collectionHistory.list({
        country: "algeria",
        limit: 10,
        offset: 0,
      });

      expect(result).toHaveProperty("records");
      expect(result).toHaveProperty("total");
      expect(Array.isArray(result.records)).toBe(true);
    });

    it("accepts pagination parameters", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.collectionHistory.list({
        limit: 5,
        offset: 0,
      });

      expect(result.records.length).toBeLessThanOrEqual(5);
    });
  });

  describe("collectionHistory.detail", () => {
    it("returns batch and orders for a valid batch ID", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      // Use a non-existent batch ID - should return null batch and empty orders
      const result = await caller.collectionHistory.detail({ batchId: 999999 });

      expect(result).toHaveProperty("batch");
      expect(result).toHaveProperty("orders");
      expect(result.batch).toBeNull();
      expect(Array.isArray(result.orders)).toBe(true);
      expect(result.orders).toHaveLength(0);
    });
  });

  describe("unauthorized access", () => {
    it("throws error when no dashboard session cookie", async () => {
      const ctx: TrpcContext = {
        user: null,
        req: {
          protocol: "https",
          headers: {},
          cookies: {},
        } as unknown as TrpcContext["req"],
        res: {
          clearCookie: () => {},
        } as TrpcContext["res"],
      };

      const caller = appRouter.createCaller(ctx);

      await expect(caller.collectionHistory.list({})).rejects.toThrow("Unauthorized");
    });
  });
});
