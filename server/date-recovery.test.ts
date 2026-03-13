import { describe, expect, it } from "vitest";
import { normalizeDateString } from "../client/src/lib/sheets";

/**
 * Tests for the GViz date recovery fix.
 *
 * Problem: Google Sheets GViz full-sheet CSV export infers column A as "date" type.
 * When cells contain text-formatted dates (e.g. "26/02/2026" stored as plain text
 * instead of a Date object), the CSV returns empty strings for those cells.
 *
 * Fix: A separate range-based query (range=A:A) fetches column A without type
 * inference, returning the raw text values. These are passed as a dateMap to
 * parseOrders, which uses them to recover dates that the full-sheet CSV dropped.
 */

describe("normalizeDateString", () => {
  it("passes through dd/mm/yyyy format", () => {
    expect(normalizeDateString("25/02/2026")).toBe("25/02/2026");
    expect(normalizeDateString("1/3/2026")).toBe("1/3/2026");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeDateString("")).toBe("");
    expect(normalizeDateString("  ")).toBe("");
  });

  it("converts ISO format to dd/mm/yyyy", () => {
    expect(normalizeDateString("2026-02-25")).toBe("25/02/2026");
  });

  it("converts dash-separated dd-mm-yyyy", () => {
    expect(normalizeDateString("25-02-2026")).toBe("25/02/2026");
  });

  it("converts dot-separated dd.mm.yyyy", () => {
    expect(normalizeDateString("25.02.2026")).toBe("25/02/2026");
  });

  it("converts =DATE() formula text", () => {
    expect(normalizeDateString("=DATE(2026,2,23)")).toBe("23/02/2026");
  });

  it("converts Google Sheets serial date number", () => {
    // 46072 = 2026-02-25 in Google Sheets serial format
    const result = normalizeDateString("46072");
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
});

describe("date recovery via dateMap", () => {
  // Simulate what parseOrders does with the dateMap
  function simulateDateRecovery(
    csvDate: string,
    sheetRow: number,
    dateMap: Map<number, string>
  ): { date: string; isRecovered: boolean } {
    let date = normalizeDateString(csvDate);
    let isRecovered = false;

    // This mirrors the logic added to parseOrders
    if (!date || date === "") {
      const recoveredDate = dateMap.get(sheetRow);
      if (recoveredDate) {
        date = normalizeDateString(recoveredDate);
        isRecovered = true;
      }
    }

    return { date, isRecovered };
  }

  it("uses CSV date when available", () => {
    const dateMap = new Map<number, string>();
    dateMap.set(5, "25/02/2026");

    const result = simulateDateRecovery("25/02/2026", 5, dateMap);
    expect(result.date).toBe("25/02/2026");
    expect(result.isRecovered).toBe(false);
  });

  it("recovers date from dateMap when CSV returns empty", () => {
    const dateMap = new Map<number, string>();
    dateMap.set(59, "26/02/2026");

    const result = simulateDateRecovery("", 59, dateMap);
    expect(result.date).toBe("26/02/2026");
    expect(result.isRecovered).toBe(true);
  });

  it("recovers date from dateMap when CSV returns whitespace", () => {
    const dateMap = new Map<number, string>();
    dateMap.set(100, "27/02/2026");

    const result = simulateDateRecovery("   ", 100, dateMap);
    expect(result.date).toBe("27/02/2026");
    expect(result.isRecovered).toBe(true);
  });

  it("returns empty when both CSV and dateMap have no date", () => {
    const dateMap = new Map<number, string>();

    const result = simulateDateRecovery("", 200, dateMap);
    expect(result.date).toBe("");
    expect(result.isRecovered).toBe(false);
  });

  it("handles dateMap with various date formats", () => {
    const dateMap = new Map<number, string>();
    dateMap.set(10, "2026-02-25"); // ISO format from range query

    const result = simulateDateRecovery("", 10, dateMap);
    expect(result.date).toBe("25/02/2026");
    expect(result.isRecovered).toBe(true);
  });

  it("simulates full recovery scenario for multiple rows", () => {
    // Simulate: rows 2-5 have dates in CSV, rows 6-8 have empty CSV but dateMap has them
    const dateMap = new Map<number, string>();
    dateMap.set(2, "25/02/2026");
    dateMap.set(3, "25/02/2026");
    dateMap.set(4, "25/02/2026");
    dateMap.set(5, "25/02/2026");
    dateMap.set(6, "26/02/2026");
    dateMap.set(7, "26/02/2026");
    dateMap.set(8, "26/02/2026");

    // Rows 2-5: CSV has dates (no recovery needed)
    for (let row = 2; row <= 5; row++) {
      const result = simulateDateRecovery("25/02/2026", row, dateMap);
      expect(result.isRecovered).toBe(false);
      expect(result.date).toBe("25/02/2026");
    }

    // Rows 6-8: CSV is empty (recovery from dateMap)
    for (let row = 6; row <= 8; row++) {
      const result = simulateDateRecovery("", row, dateMap);
      expect(result.isRecovered).toBe(true);
      expect(result.date).toBe("26/02/2026");
    }
  });
});
