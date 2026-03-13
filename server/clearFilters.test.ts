/**
 * Tests for Google Sheets filter clearing functionality
 * Tests the clearBasicFilter and clearAllSheetFilters functions
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock googleapis - factory must not reference outer variables (hoisted)
vi.mock("googleapis", () => {
  const mockGet = vi.fn();
  const mockBatchUpdate = vi.fn();
  return {
    google: {
      auth: {
        JWT: vi.fn().mockImplementation(() => ({})),
      },
      sheets: vi.fn().mockReturnValue({
        spreadsheets: {
          get: mockGet,
          batchUpdate: mockBatchUpdate,
        },
      }),
    },
    __mockGet: mockGet,
    __mockBatchUpdate: mockBatchUpdate,
  };
});

// Set env vars before importing
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "test@test.iam.gserviceaccount.com";
process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = "-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----";

import {
  clearBasicFilter,
  clearAllSheetFilters,
} from "./googleSheets";

// Get mock references from the module
let mockGet: ReturnType<typeof vi.fn>;
let mockBatchUpdate: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  const mod = await import("googleapis") as any;
  mockGet = mod.__mockGet;
  mockBatchUpdate = mod.__mockBatchUpdate;
  mockGet.mockReset();
  mockBatchUpdate.mockReset();
});

describe("clearBasicFilter", () => {
  it("returns false when sheet tab is not found", async () => {
    mockGet.mockResolvedValue({
      data: {
        sheets: [
          { properties: { title: "Week 1", sheetId: 0 } },
        ],
      },
    });

    const result = await clearBasicFilter("spreadsheet123", "NonExistentTab");
    expect(result).toBe(false);
    expect(mockBatchUpdate).not.toHaveBeenCalled();
  });

  it("returns false when no basic filter is active", async () => {
    mockGet.mockResolvedValue({
      data: {
        sheets: [
          {
            properties: { title: "Week 1", sheetId: 0 },
            // No basicFilter property
          },
        ],
      },
    });

    const result = await clearBasicFilter("spreadsheet123", "Week 1");
    expect(result).toBe(false);
    expect(mockBatchUpdate).not.toHaveBeenCalled();
  });

  it("clears the basic filter when one is active", async () => {
    mockGet.mockResolvedValue({
      data: {
        sheets: [
          {
            properties: { title: "Week 1", sheetId: 42 },
            basicFilter: {
              range: { sheetId: 42, startRowIndex: 0, endRowIndex: 100 },
            },
          },
        ],
      },
    });
    mockBatchUpdate.mockResolvedValue({ data: {} });

    const result = await clearBasicFilter("spreadsheet123", "Week 1");
    expect(result).toBe(true);
    expect(mockBatchUpdate).toHaveBeenCalledWith({
      spreadsheetId: "spreadsheet123",
      requestBody: {
        requests: [
          {
            clearBasicFilter: {
              sheetId: 42,
            },
          },
        ],
      },
    });
  });
});

describe("clearAllSheetFilters", () => {
  it("returns 0 cleared when no filters are active", async () => {
    mockGet.mockResolvedValue({
      data: {
        sheets: [
          { properties: { title: "Week 1", sheetId: 0 } },
          { properties: { title: "Week 2", sheetId: 1 } },
        ],
      },
    });

    const result = await clearAllSheetFilters("spreadsheet123");
    expect(result.cleared).toBe(0);
    expect(result.tabs).toEqual([]);
    expect(mockBatchUpdate).not.toHaveBeenCalled();
  });

  it("clears filters on all tabs that have them", async () => {
    mockGet.mockResolvedValue({
      data: {
        sheets: [
          {
            properties: { title: "Week 1", sheetId: 0 },
            basicFilter: { range: {} },
          },
          {
            properties: { title: "Week 2", sheetId: 1 },
            // No filter
          },
          {
            properties: { title: "Week 3", sheetId: 2 },
            basicFilter: { range: {} },
          },
        ],
      },
    });
    mockBatchUpdate.mockResolvedValue({ data: {} });

    const result = await clearAllSheetFilters("spreadsheet123");
    expect(result.cleared).toBe(2);
    expect(result.tabs).toEqual(["Week 1", "Week 3"]);
    expect(mockBatchUpdate).toHaveBeenCalledWith({
      spreadsheetId: "spreadsheet123",
      requestBody: {
        requests: [
          { clearBasicFilter: { sheetId: 0 } },
          { clearBasicFilter: { sheetId: 2 } },
        ],
      },
    });
  });

  it("handles empty spreadsheet", async () => {
    mockGet.mockResolvedValue({
      data: { sheets: [] },
    });

    const result = await clearAllSheetFilters("spreadsheet123");
    expect(result.cleared).toBe(0);
    expect(result.tabs).toEqual([]);
  });
});

