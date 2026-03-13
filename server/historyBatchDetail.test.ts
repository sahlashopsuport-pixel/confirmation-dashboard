import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
      cookies: {},
    } as unknown as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

describe("history.batchDetail", () => {
  it("returns items array even without auth (public procedure)", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Use a non-existent ID — should return empty items, not throw
    const result = await caller.history.batchDetail({ ids: [999999] });

    expect(result).toHaveProperty("items");
    expect(Array.isArray(result.items)).toBe(true);
  });

  it("rejects empty ids array", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.history.batchDetail({ ids: [] })
    ).rejects.toThrow();
  });

  it("rejects more than 50 ids", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const tooManyIds = Array.from({ length: 51 }, (_, i) => i + 1);
    await expect(
      caller.history.batchDetail({ ids: tooManyIds })
    ).rejects.toThrow();
  });
});
