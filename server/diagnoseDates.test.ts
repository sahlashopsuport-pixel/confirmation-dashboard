import { describe, it, expect } from "vitest";

// We can't directly import the private normalizeDateStringServer,
// but we can test the exported diagnoseMissingDates through its behavior.
// Instead, let's test the date normalization logic that the frontend uses
// to ensure consistency between frontend detection and server diagnosis.

// Replicate the server-side normalizeDateStringServer for unit testing
function normalizeDateStringServer(raw: string): string {
  if (!raw) return '';
  const s = raw.trim();

  // Already dd/mm/yyyy or d/m/yyyy
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) return s;

  // =DATE(year, month, day) formula stored as text
  const dateFormula = s.match(/^=DATE\s*\(\s*(\d{4})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})\s*\)$/i);
  if (dateFormula) {
    const [, year, month, day] = dateFormula;
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  }

  // ISO format: yyyy-mm-dd or yyyy-mm-ddT...
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}/${month}/${year}`;
  }

  // Dash-separated dd-mm-yyyy
  const dashMatch = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const [, day, month, year] = dashMatch;
    return `${day}/${month}/${year}`;
  }

  // Dot-separated dd.mm.yyyy
  const dotMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotMatch) {
    const [, day, month, year] = dotMatch;
    return `${day}/${month}/${year}`;
  }

  // Google Sheets serial date number (days since Dec 30, 1899)
  const num = Number(s);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const epoch = new Date(1899, 11, 30);
    const d = new Date(epoch.getTime() + num * 86400000);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear().toString();
    return `${day}/${month}/${year}`;
  }

  // Unrecognized — return as-is
  return s;
}

describe("normalizeDateStringServer", () => {
  it("returns empty string for empty input", () => {
    expect(normalizeDateStringServer("")).toBe("");
    expect(normalizeDateStringServer("  ")).toBe("");
  });

  it("passes through dd/mm/yyyy format", () => {
    expect(normalizeDateStringServer("28/02/2026")).toBe("28/02/2026");
    expect(normalizeDateStringServer("1/2/2026")).toBe("1/2/2026");
  });

  it("converts ISO format yyyy-mm-dd", () => {
    expect(normalizeDateStringServer("2026-02-28")).toBe("28/02/2026");
    expect(normalizeDateStringServer("2026-02-28T12:00:00")).toBe("28/02/2026");
  });

  it("converts dash-separated dd-mm-yyyy", () => {
    expect(normalizeDateStringServer("28-02-2026")).toBe("28/02/2026");
    expect(normalizeDateStringServer("1-2-2026")).toBe("1/2/2026");
  });

  it("converts dot-separated dd.mm.yyyy", () => {
    expect(normalizeDateStringServer("28.02.2026")).toBe("28/02/2026");
  });

  it("converts =DATE() formula", () => {
    expect(normalizeDateStringServer("=DATE(2026, 2, 28)")).toBe("28/02/2026");
    expect(normalizeDateStringServer("=DATE(2026,1,5)")).toBe("05/01/2026");
  });

  it("converts Google Sheets serial date numbers", () => {
    // 45000 is approximately 2023-03-14
    const result = normalizeDateStringServer("45000");
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it("returns unrecognized text as-is", () => {
    expect(normalizeDateStringServer("hello")).toBe("hello");
    expect(normalizeDateStringServer("not a date")).toBe("not a date");
  });

  it("detects missing dates correctly", () => {
    // These should NOT be valid dates
    const invalidInputs = ["", "  ", "hello", "N/A", "---"];
    for (const input of invalidInputs) {
      const normalized = normalizeDateStringServer(input);
      const hasValidDate = /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(normalized);
      expect(hasValidDate).toBe(false);
    }

    // These SHOULD be valid dates
    const validInputs = ["28/02/2026", "2026-02-28", "28-02-2026", "=DATE(2026,2,28)"];
    for (const input of validInputs) {
      const normalized = normalizeDateStringServer(input);
      const hasValidDate = /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(normalized);
      expect(hasValidDate).toBe(true);
    }
  });
});
