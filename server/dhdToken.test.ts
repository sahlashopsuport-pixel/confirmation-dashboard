import { describe, it, expect } from "vitest";

describe("DHD API Token Validation", () => {
  it("should have DHD_API_TOKEN env variable set", () => {
    const token = process.env.DHD_API_TOKEN;
    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
    expect(token!.length).toBeGreaterThan(10);
  });

  it("should successfully authenticate with DHD API", async () => {
    const token = process.env.DHD_API_TOKEN;
    if (!token) {
      console.warn("DHD_API_TOKEN not set, skipping live API test");
      return;
    }

    const res = await fetch(
      `https://dhd.ecotrack.dz/api/v1/get/orders?api_token=${token}&page=1`,
      {
        headers: { Accept: "application/json" },
        redirect: "follow",
      }
    );

    // Should NOT be 401 (unauthenticated)
    expect(res.status).not.toBe(401);
    // Should be 200 OK
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("current_page");
    expect(data).toHaveProperty("data");
    expect(Array.isArray(data.data)).toBe(true);
  }, 30000);
});
