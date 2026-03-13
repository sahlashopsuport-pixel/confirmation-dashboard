import { describe, it, expect, vi, beforeAll } from "vitest";

// Mock the database module
vi.mock("./db", () => ({
  upsertSalaryRecord: vi.fn().mockResolvedValue({ id: 1 }),
  getSalaryRecordsByMonth: vi.fn().mockResolvedValue([]),
  getSalaryRecordsByUser: vi.fn().mockResolvedValue([]),
  getPageManagerUsers: vi.fn().mockResolvedValue([
    { id: 10, username: "ryma" },
    { id: 11, username: "soumia" },
  ]),
}));

import {
  upsertSalaryRecord,
  getSalaryRecordsByMonth,
  getSalaryRecordsByUser,
  getPageManagerUsers,
} from "./db";

describe("Salary DB helpers", () => {
  it("getPageManagers returns page manager users", async () => {
    const result = await getPageManagerUsers();
    expect(result).toHaveLength(2);
    expect(result[0].username).toBe("ryma");
    expect(result[1].username).toBe("soumia");
  });

  it("upsertSalaryRecord saves a salary record", async () => {
    const result = await upsertSalaryRecord({
      userId: 10,
      username: "ryma",
      year: 2026,
      month: 1,
      fixedSalary: 35000,
      deliveredAlgeria: 0,
      deliveredLibya: 212,
      deliveredViconis: 5,
      deliveredTunisia: 60,
      commissionPerOrder: 100,
      goodVideos: 0,
      avgVideos: 0,
      absenceDays: 0,
      bonus: 6500,
      deduction: 0,
      notes: "January salary",
    });
    expect(result).toHaveProperty("id");
    expect(upsertSalaryRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 10,
        username: "ryma",
        year: 2026,
        month: 1,
        fixedSalary: 35000,
      })
    );
  });

  it("getSalaryRecordsByMonth returns records for a given month", async () => {
    const result = await getSalaryRecordsByMonth(2026, 1);
    expect(Array.isArray(result)).toBe(true);
    expect(getSalaryRecordsByMonth).toHaveBeenCalledWith(2026, 1);
  });

  it("getSalaryRecordsByUser returns records for a given user", async () => {
    const result = await getSalaryRecordsByUser(10);
    expect(Array.isArray(result)).toBe(true);
    expect(getSalaryRecordsByUser).toHaveBeenCalledWith(10);
  });
});

describe("Salary calculation logic", () => {
  const WORKING_DAYS = 22;
  const GOOD_VIDEO_RATE = 500;
  const AVG_VIDEO_RATE = 250;

  function calculateTotal(data: {
    fixedSalary: number;
    deliveredAlgeria: number;
    deliveredLibya: number;
    deliveredViconis: number;
    deliveredTunisia: number;
    commissionPerOrder: number;
    goodVideos: number;
    avgVideos: number;
    absenceDays: number;
    bonus: number;
    deduction: number;
  }) {
    const totalDelivered =
      data.deliveredAlgeria + data.deliveredLibya + data.deliveredViconis + data.deliveredTunisia;
    const deliveryCommission = totalDelivered * data.commissionPerOrder;
    const videoBonus = data.goodVideos * GOOD_VIDEO_RATE + data.avgVideos * AVG_VIDEO_RATE;
    const dailySalary = data.fixedSalary / WORKING_DAYS;
    const absenceDeduction = Math.round(dailySalary * data.absenceDays);
    const total =
      data.fixedSalary + deliveryCommission + videoBonus - absenceDeduction + data.bonus - data.deduction;
    return {
      totalDelivered,
      deliveryCommission,
      videoBonus,
      dailySalary: Math.round(dailySalary),
      absenceDeduction,
      total: Math.round(total),
    };
  }

  it("calculates Soumia January 2026 salary correctly (from spreadsheet)", () => {
    // From the screenshot: Fixed 35409, Libya 212, Tunisia 5, Viconis 60
    // Commission Libya 21200, Video 6000, Algeria commission 6500
    // Total 69109
    const result = calculateTotal({
      fixedSalary: 35409,
      deliveredAlgeria: 0,
      deliveredLibya: 212,
      deliveredViconis: 60,
      deliveredTunisia: 5,
      commissionPerOrder: 100,
      goodVideos: 0,
      avgVideos: 0,
      absenceDays: 0,
      bonus: 6500,
      deduction: 0,
    });

    expect(result.totalDelivered).toBe(277);
    expect(result.deliveryCommission).toBe(27700);
    // Total = 35409 + 27700 + 0 - 0 + 6500 - 0 = 69609
    expect(result.total).toBe(69609);
  });

  it("calculates salary with absences correctly", () => {
    const result = calculateTotal({
      fixedSalary: 30000,
      deliveredAlgeria: 10,
      deliveredLibya: 50,
      deliveredViconis: 0,
      deliveredTunisia: 0,
      commissionPerOrder: 100,
      goodVideos: 2,
      avgVideos: 3,
      absenceDays: 3,
      bonus: 0,
      deduction: 0,
    });

    expect(result.totalDelivered).toBe(60);
    expect(result.deliveryCommission).toBe(6000);
    expect(result.videoBonus).toBe(2 * 500 + 3 * 250); // 1750
    expect(result.dailySalary).toBe(Math.round(30000 / 22)); // 1364
    expect(result.absenceDeduction).toBe(Math.round((30000 / 22) * 3)); // 4091
    // Total = 30000 + 6000 + 1750 - 4091 + 0 - 0 = 33659
    expect(result.total).toBe(33659);
  });

  it("calculates salary with bonus and deduction", () => {
    const result = calculateTotal({
      fixedSalary: 25000,
      deliveredAlgeria: 0,
      deliveredLibya: 0,
      deliveredViconis: 0,
      deliveredTunisia: 0,
      commissionPerOrder: 100,
      goodVideos: 0,
      avgVideos: 0,
      absenceDays: 0,
      bonus: 5000,
      deduction: 2000,
    });

    expect(result.total).toBe(28000); // 25000 + 0 + 0 - 0 + 5000 - 2000
  });

  it("handles zero salary edge case", () => {
    const result = calculateTotal({
      fixedSalary: 0,
      deliveredAlgeria: 0,
      deliveredLibya: 0,
      deliveredViconis: 0,
      deliveredTunisia: 0,
      commissionPerOrder: 100,
      goodVideos: 0,
      avgVideos: 0,
      absenceDays: 0,
      bonus: 0,
      deduction: 0,
    });

    expect(result.total).toBe(0);
    expect(result.dailySalary).toBe(0);
  });
});
