import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { verifyDashboardUser } from "./db";

describe("collector role", () => {
  it("verifyDashboardUser returns correct role for collector accounts", async () => {
    // Test that the farah account exists and returns collector role
    const farah = await verifyDashboardUser("farah", "farah2026");
    expect(farah).not.toBeNull();
    expect(farah?.username).toBe("farah");
    expect(farah?.dashboardRole).toBe("collector");

    const sylia = await verifyDashboardUser("sylia", "sylia2026");
    expect(sylia).not.toBeNull();
    expect(sylia?.username).toBe("sylia");
    expect(sylia?.dashboardRole).toBe("collector");

    const houssama = await verifyDashboardUser("houssama", "houssama2026");
    expect(houssama).not.toBeNull();
    expect(houssama?.username).toBe("houssama");
    expect(houssama?.dashboardRole).toBe("collector");
  });

  it("verifyDashboardUser rejects wrong password for collector", async () => {
    const result = await verifyDashboardUser("farah", "wrongpassword");
    expect(result).toBeNull();
  });

  it("admin account still works and has super_admin role", async () => {
    const admin = await verifyDashboardUser("admin", "willmy05");
    expect(admin).not.toBeNull();
    expect(admin?.dashboardRole).toBe("super_admin");
  });
});
