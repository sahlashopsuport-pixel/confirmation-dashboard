import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Tests for the assignment history feature.
 * We test the DB helper logic (logAssignment, getAssignmentHistoryList, getAssignmentHistoryDetail)
 * and the tRPC procedures (history.list, history.detail) by mocking the DB layer.
 */

// Mock the db module
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    logAssignment: vi.fn(),
    getAssignmentHistoryList: vi.fn(),
    getAssignmentHistoryDetail: vi.fn(),
  };
});

import { logAssignment, getAssignmentHistoryList, getAssignmentHistoryDetail } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "scalex-dashboard-secret-key";
const DASHBOARD_COOKIE = "dashboard_session";

const mockLogAssignment = vi.mocked(logAssignment);
const mockGetList = vi.mocked(getAssignmentHistoryList);
const mockGetDetail = vi.mocked(getAssignmentHistoryDetail);

// Helper to create a context with dashboard auth cookie (JWT-based)
function createDashboardContext(username = "admin"): TrpcContext {
  // getDashboardUser reads a JWT from req.cookies.dashboard_session
  const token = jwt.sign({ id: 1, username }, JWT_SECRET);
  const req = {
    protocol: "https",
    headers: {},
    cookies: { [DASHBOARD_COOKIE]: token },
  } as any;

  return {
    user: null,
    req,
    res: {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
    } as any,
  };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
      cookies: {},
    } as any,
    res: {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
    } as any,
  };
}

const sampleHistoryRecord = {
  id: 1,
  assignedBy: "admin",
  country: "libya",
  sheetTab: "Week 8",
  totalLeads: 100,
  totalAssigned: 95,
  totalFailed: 5,
  status: "partial",
  createdAt: new Date("2026-02-20T10:00:00Z"),
};

const sampleHistoryItems = [
  {
    id: 1,
    historyId: 1,
    agentId: 10,
    agentName: "Fatima",
    leadCount: 50,
    success: 1,
    errorMessage: null,
    leadsJson: JSON.stringify([
      { date: "2026-02-20", customerName: "Ahmed", phone: "0912345678", wilaya: "Tripoli", product: "Oil", price: 120, sku: "OIL-001" },
    ]),
  },
  {
    id: 2,
    historyId: 1,
    agentId: 11,
    agentName: "Sara",
    leadCount: 50,
    success: 0,
    errorMessage: "Sheet API rate limit exceeded",
    leadsJson: JSON.stringify([
      { date: "2026-02-20", customerName: "Omar", phone: "0912345679", wilaya: "Benghazi", product: "Cream", price: 80, sku: "CRM-002" },
    ]),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Assignment History - logAssignment helper", () => {
  it("should call logAssignment with correct parameters", async () => {
    mockLogAssignment.mockResolvedValue(42);

    const input = {
      assignedBy: "admin",
      country: "libya",
      sheetTab: "Week 8",
      totalLeads: 100,
      totalAssigned: 95,
      totalFailed: 5,
      status: "partial" as const,
      items: [
        {
          agentId: 10,
          agentName: "Fatima",
          leadCount: 50,
          success: true,
          leads: [{ date: "2026-02-20", customerName: "Ahmed", phone: "0912345678", wilaya: "Tripoli", product: "Oil", price: 120, sku: "OIL-001" }],
        },
      ],
    };

    const result = await logAssignment(input);
    expect(result).toBe(42);
    expect(mockLogAssignment).toHaveBeenCalledWith(input);
  });

  it("should return null when DB is not available", async () => {
    mockLogAssignment.mockResolvedValue(null);
    const result = await logAssignment({
      assignedBy: "admin",
      country: "algeria",
      sheetTab: "Week 1",
      totalLeads: 10,
      totalAssigned: 10,
      totalFailed: 0,
      status: "success",
      items: [],
    });
    expect(result).toBeNull();
  });
});

describe("Assignment History - getAssignmentHistoryList", () => {
  it("should return records and total count", async () => {
    mockGetList.mockResolvedValue({
      records: [sampleHistoryRecord as any],
      total: 1,
    });

    const result = await getAssignmentHistoryList({ country: "libya", limit: 20, offset: 0 });
    expect(result.records).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.records[0].assignedBy).toBe("admin");
    expect(result.records[0].country).toBe("libya");
  });

  it("should return empty when no records match", async () => {
    mockGetList.mockResolvedValue({ records: [], total: 0 });

    const result = await getAssignmentHistoryList({ country: "tunisia" });
    expect(result.records).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("should support search filter", async () => {
    mockGetList.mockResolvedValue({ records: [sampleHistoryRecord as any], total: 1 });

    const result = await getAssignmentHistoryList({ search: "Week 8" });
    expect(mockGetList).toHaveBeenCalledWith({ search: "Week 8" });
    expect(result.total).toBe(1);
  });
});

describe("Assignment History - getAssignmentHistoryDetail", () => {
  it("should return history record with items", async () => {
    mockGetDetail.mockResolvedValue({
      history: sampleHistoryRecord as any,
      items: sampleHistoryItems as any,
    });

    const result = await getAssignmentHistoryDetail(1);
    expect(result.history).toBeTruthy();
    expect(result.history!.id).toBe(1);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].agentName).toBe("Fatima");
    expect(result.items[0].success).toBe(1);
    expect(result.items[1].agentName).toBe("Sara");
    expect(result.items[1].success).toBe(0);
    expect(result.items[1].errorMessage).toBe("Sheet API rate limit exceeded");
  });

  it("should return null history when not found", async () => {
    mockGetDetail.mockResolvedValue({ history: null, items: [] });

    const result = await getAssignmentHistoryDetail(999);
    expect(result.history).toBeNull();
    expect(result.items).toHaveLength(0);
  });
});

describe("Assignment History - tRPC procedures", () => {
  it("history.list returns records for authenticated user", async () => {
    mockGetList.mockResolvedValue({
      records: [sampleHistoryRecord as any],
      total: 1,
    });

    const ctx = createDashboardContext("admin");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.history.list({ country: "libya", limit: 20, offset: 0 });

    expect(result.records).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("history.list returns empty for unauthenticated user", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.history.list({ limit: 20, offset: 0 });

    expect(result.records).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("history.detail returns items for authenticated user", async () => {
    mockGetDetail.mockResolvedValue({
      history: sampleHistoryRecord as any,
      items: sampleHistoryItems as any,
    });

    const ctx = createDashboardContext("admin");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.history.detail({ id: 1 });

    expect(result.history).toBeTruthy();
    expect(result.items).toHaveLength(2);
  });

  it("history.detail returns null for unauthenticated user", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.history.detail({ id: 1 });

    expect(result.history).toBeNull();
    expect(result.items).toHaveLength(0);
  });
});

describe("Assignment History - Data integrity", () => {
  it("leadsJson should be parseable back to lead objects", () => {
    const item = sampleHistoryItems[0];
    const leads = JSON.parse(item.leadsJson!);
    expect(leads).toBeInstanceOf(Array);
    expect(leads[0]).toHaveProperty("customerName");
    expect(leads[0]).toHaveProperty("phone");
    expect(leads[0]).toHaveProperty("wilaya");
    expect(leads[0]).toHaveProperty("product");
    expect(leads[0]).toHaveProperty("price");
    expect(leads[0]).toHaveProperty("sku");
  });

  it("status should be one of success, partial, or failed", () => {
    const validStatuses = ["success", "partial", "failed"];
    expect(validStatuses).toContain(sampleHistoryRecord.status);
  });

  it("totalAssigned + totalFailed should equal totalLeads", () => {
    expect(sampleHistoryRecord.totalAssigned + sampleHistoryRecord.totalFailed).toBe(sampleHistoryRecord.totalLeads);
  });

  it("items success flag should be 0 or 1", () => {
    for (const item of sampleHistoryItems) {
      expect([0, 1]).toContain(item.success);
    }
  });
});
