import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

/**
 * Tests for the date filter on history.list:
 * 1. history.list accepts date and timezoneOffset parameters
 * 2. history.list returns results without date filter (default behavior)
 * 3. history.list input validation works for date parameter
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
      headers: {
        cookie: withCookie ? "dashboard_session=valid-token" : "",
      },
    } as any,
    resHeaders: new Headers(),
  };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: {
      headers: { cookie: "" },
    } as any,
    resHeaders: new Headers(),
  };
}

const caller = appRouter.createCaller(createContext(true));
const unauthCaller = appRouter.createCaller(createUnauthContext());

describe("history.list date filter", () => {
  it("should accept date and timezoneOffset parameters", async () => {
    // This should not throw — the input schema accepts these params
    const result = await caller.history.list({
      date: "2026-03-02",
      timezoneOffset: -60,
      limit: 5,
      offset: 0,
    });
    expect(result).toHaveProperty("records");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.records)).toBe(true);
    expect(typeof result.total).toBe("number");
  });

  it("should work without date filter (returns all records)", async () => {
    const result = await caller.history.list({
      limit: 5,
      offset: 0,
    });
    expect(result).toHaveProperty("records");
    expect(result).toHaveProperty("total");
  });

  it("should return empty for unauthenticated users", async () => {
    const result = await unauthCaller.history.list({
      date: "2026-03-02",
      timezoneOffset: -60,
      limit: 5,
    });
    expect(result.records).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("should accept date without timezoneOffset (defaults to 0)", async () => {
    const result = await caller.history.list({
      date: "2026-01-15",
      limit: 5,
    });
    expect(result).toHaveProperty("records");
    expect(result).toHaveProperty("total");
  });

  it("should return fewer or equal records when filtered by date vs unfiltered", async () => {
    const allResult = await caller.history.list({ limit: 100 });
    const filteredResult = await caller.history.list({
      date: "2026-03-02",
      timezoneOffset: -60,
      limit: 100,
    });
    expect(filteredResult.total).toBeLessThanOrEqual(allResult.total);
  });
});
