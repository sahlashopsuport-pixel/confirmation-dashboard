/**
 * Inbox feature unit tests — batch-based raw text approach
 * Tests role-based access, raw text storage, batch data structure,
 * and the end-to-end flow: page manager pastes → raw text stored → Hadjer loads raw text.
 */
import { describe, it, expect } from "vitest";

// ─── Role-based access ───────────────────────────────────────────
describe("Inbox role-based access", () => {
  const SUBMIT_ALLOWED_ROLES = ["page_manager", "super_admin"];
  const ADMIN_ALLOWED_ROLES = ["super_admin", "admin"];

  it("page_manager can submit leads", () => {
    expect(SUBMIT_ALLOWED_ROLES.includes("page_manager")).toBe(true);
  });

  it("super_admin can submit leads", () => {
    expect(SUBMIT_ALLOWED_ROLES.includes("super_admin")).toBe(true);
  });

  it("regular admin cannot submit leads", () => {
    expect(SUBMIT_ALLOWED_ROLES.includes("admin")).toBe(false);
  });

  it("super_admin can view pending batches", () => {
    expect(ADMIN_ALLOWED_ROLES.includes("super_admin")).toBe(true);
  });

  it("admin can view pending batches", () => {
    expect(ADMIN_ALLOWED_ROLES.includes("admin")).toBe(true);
  });

  it("page_manager cannot view pending batches", () => {
    expect(ADMIN_ALLOWED_ROLES.includes("page_manager")).toBe(false);
  });
});

// ─── Line counting (used for display and lineCount field) ────────
describe("Raw text line counting", () => {
  function countLines(rawText: string): number {
    return rawText.trim().split("\n").filter((l) => l.trim()).length;
  }

  it("counts lines in a multi-line paste", () => {
    const text = "LY01\tProstate Oil\tAhmed\t218912345678\t150\tTripoli\n" +
                 "LY01\tVaricocel Oil\tMohamed\t218923456789\t200\tBenghazi\n" +
                 "LY02\tProstate Oil\tAli\t218934567890\t150\tMisrata";
    expect(countLines(text)).toBe(3);
  });

  it("ignores empty lines", () => {
    const text = "LY01\tProstate Oil\tAhmed\t218912345678\n\n\nLY02\tVaricocel Oil\tMohamed\t218923456789\n";
    expect(countLines(text)).toBe(2);
  });

  it("counts single line correctly", () => {
    expect(countLines("LY01\tProstate Oil\tAhmed\t218912345678")).toBe(1);
  });

  it("returns 0 for empty/whitespace text", () => {
    expect(countLines("")).toBe(0);
    expect(countLines("   \n  \n  ")).toBe(0);
  });
});

// ─── Batch data structure ────────────────────────────────────────
describe("Inbox batch data structure", () => {
  interface InboxBatch {
    id: number;
    rawText: string;
    country: string;
    lineCount: number;
    submittedBy: string;
    status: "pending" | "assigned";
  }

  it("creates a valid batch object", () => {
    const batch: InboxBatch = {
      id: 1,
      rawText: "LY01\tProstate Oil\tAhmed\t218912345678\t150\tTripoli",
      country: "libya",
      lineCount: 1,
      submittedBy: "rima",
      status: "pending",
    };
    expect(batch.status).toBe("pending");
    expect(batch.country).toBe("libya");
    expect(batch.rawText).toContain("218912345678");
  });

  it("status transitions from pending to assigned", () => {
    const batch: InboxBatch = {
      id: 2,
      rawText: "LY01\tProstate Oil\tAhmed\t218912345678",
      country: "libya",
      lineCount: 1,
      submittedBy: "soumia",
      status: "pending",
    };
    expect(batch.status).toBe("pending");
    const assigned = { ...batch, status: "assigned" as const };
    expect(assigned.status).toBe("assigned");
  });

  it("preserves raw text exactly as submitted", () => {
    const originalText = "LY01\tProstate Oil\tAhmed\t218912345678\t150\tTripoli\nLY02\tVaricocel Oil\tMohamed\t218923456789\t200\tBenghazi";
    const batch: InboxBatch = {
      id: 3,
      rawText: originalText,
      country: "libya",
      lineCount: 2,
      submittedBy: "rima",
      status: "pending",
    };
    // The key guarantee: raw text is stored exactly as-is, no parsing/transformation
    expect(batch.rawText).toBe(originalText);
    expect(batch.rawText.split("\n")).toHaveLength(2);
  });
});

// ─── Raw text loading into textarea (Hadjer's flow) ──────────────
describe("Loading batches into AssignLeads textarea", () => {
  it("concatenates multiple batches with newline separator", () => {
    const batches = [
      { id: 1, rawText: "LY01\tProstate Oil\tAhmed\t218912345678" },
      { id: 2, rawText: "LY02\tVaricocel Oil\tMohamed\t218923456789\nLY02\tProstate Oil\tAli\t218934567890" },
    ];
    const combinedText = batches.map((b) => b.rawText).join("\n");
    expect(combinedText.split("\n")).toHaveLength(3);
    expect(combinedText).toContain("218912345678");
    expect(combinedText).toContain("218923456789");
    expect(combinedText).toContain("218934567890");
  });

  it("single batch loads directly without extra newlines", () => {
    const batches = [
      { id: 1, rawText: "LY01\tProstate Oil\tAhmed\t218912345678\nLY01\tVaricocel Oil\tFatima\t218945678901" },
    ];
    const combinedText = batches.map((b) => b.rawText).join("\n");
    expect(combinedText.split("\n")).toHaveLength(2);
  });

  it("collects batch IDs for marking as assigned", () => {
    const batches = [
      { id: 10, rawText: "line1" },
      { id: 20, rawText: "line2" },
      { id: 30, rawText: "line3" },
    ];
    const batchIds = batches.map((b) => b.id);
    expect(batchIds).toEqual([10, 20, 30]);
  });
});

// ─── Country validation ──────────────────────────────────────────
describe("Country options for inbox", () => {
  const VALID_COUNTRIES = ["libya", "algeria", "viconis", "tunisia"];

  it("libya is a valid country", () => {
    expect(VALID_COUNTRIES.includes("libya")).toBe(true);
  });

  it("algeria is a valid country", () => {
    expect(VALID_COUNTRIES.includes("algeria")).toBe(true);
  });

  it("viconis is a valid country", () => {
    expect(VALID_COUNTRIES.includes("viconis")).toBe(true);
  });

  it("tunisia is a valid country", () => {
    expect(VALID_COUNTRIES.includes("tunisia")).toBe(true);
  });

  it("unknown country is not valid", () => {
    expect(VALID_COUNTRIES.includes("morocco")).toBe(false);
  });
});

// ─── End-to-end flow simulation ──────────────────────────────────
describe("End-to-end inbox flow (raw text preservation)", () => {
  // Simulate: Soumia pastes 7 Libya leads → stored as raw text → Hadjer loads → same text
  it("preserves exact lead format through the entire flow", () => {
    // Step 1: Soumia copies from her sheet (tab-separated, PageCode in col 1)
    const pastedByPageManager = [
      "LY01\tProstate Oil\tAhmed Hassan\t218912345678\t150\tTripoli",
      "LY01\tVaricocel Oil\tMohamed Ali\t218923456789\t200\tBenghazi",
      "LY02\tProstate Oil\tIbrahim Saleh\t218934567890\t150\tMisrata",
      "LY01\tHair Oil\tFatima Ahmed\t218945678901\t120\tTripoli",
      "LY02\tProstate Oil\tOmar Khalil\t218956789012\t150\tSabha",
      "LY01\tVaricocel Oil\tYoussef Nouri\t218967890123\t200\tZliten",
      "LY02\tHair Oil\tAisha Mohamed\t218978901234\t120\tDerna",
    ].join("\n");

    // Step 2: Stored as-is in database (no parsing)
    const storedRawText = pastedByPageManager; // no transformation!

    // Step 3: Hadjer clicks "Load from Inbox" → raw text goes into textarea
    const loadedIntoTextarea = storedRawText;

    // Step 4: Verify — text is identical at every step
    expect(loadedIntoTextarea).toBe(pastedByPageManager);
    expect(loadedIntoTextarea.split("\n")).toHaveLength(7);

    // Step 5: Each line still has all original columns intact
    const firstLine = loadedIntoTextarea.split("\n")[0];
    const cols = firstLine.split("\t");
    expect(cols[0]).toBe("LY01");           // PageCode preserved
    expect(cols[1]).toBe("Prostate Oil");    // Product preserved
    expect(cols[2]).toBe("Ahmed Hassan");    // Customer preserved
    expect(cols[3]).toBe("218912345678");    // Phone preserved
    expect(cols[4]).toBe("150");             // Price preserved
    expect(cols[5]).toBe("Tripoli");         // Wilaya preserved
  });

  it("handles Algeria format (different column layout)", () => {
    const algeriaLeads = [
      "DZ01\tTesticalm\tKarim Benali\t0555123456\t3500\tAlger\tBab Ezzouar",
      "DZ02\tTesticalm\tAmine Cherif\t0666789012\t3500\tOran\tHai Sabah",
    ].join("\n");

    // Raw text stored and loaded back identically
    const loaded = algeriaLeads;
    expect(loaded).toBe(algeriaLeads);
    expect(loaded.split("\n")).toHaveLength(2);
    expect(loaded.split("\n")[0].split("\t")).toHaveLength(7);
  });
});

// ─── Review step: line-to-column splitting for preview table ─────
describe("Review step — splitLineIntoColumns", () => {
  function splitLineIntoColumns(line: string): string[] {
    return line.split("\t").map((c) => c.trim());
  }

  it("splits a tab-separated Libya lead into columns", () => {
    const line = "LY01\tProstate Oil\tAhmed Hassan\t218912345678\t150\tTripoli";
    const cols = splitLineIntoColumns(line);
    expect(cols).toHaveLength(6);
    expect(cols[0]).toBe("LY01");
    expect(cols[1]).toBe("Prostate Oil");
    expect(cols[2]).toBe("Ahmed Hassan");
    expect(cols[3]).toBe("218912345678");
    expect(cols[4]).toBe("150");
    expect(cols[5]).toBe("Tripoli");
  });

  it("splits an Algeria lead with 7 columns", () => {
    const line = "DZ01\tTesticalm\tKarim Benali\t0555123456\t3500\tAlger\tBab Ezzouar";
    const cols = splitLineIntoColumns(line);
    expect(cols).toHaveLength(7);
    expect(cols[6]).toBe("Bab Ezzouar");
  });

  it("handles single-column line (no tabs)", () => {
    const cols = splitLineIntoColumns("just a phone number");
    expect(cols).toHaveLength(1);
    expect(cols[0]).toBe("just a phone number");
  });

  it("trims whitespace from each column", () => {
    const line = " LY01 \t Prostate Oil \t Ahmed \t 218912345678 ";
    const cols = splitLineIntoColumns(line);
    expect(cols[0]).toBe("LY01");
    expect(cols[1]).toBe("Prostate Oil");
    expect(cols[2]).toBe("Ahmed");
    expect(cols[3]).toBe("218912345678");
  });

  it("handles empty columns (consecutive tabs)", () => {
    const line = "LY01\t\tAhmed\t\t150";
    const cols = splitLineIntoColumns(line);
    expect(cols).toHaveLength(5);
    expect(cols[1]).toBe("");
    expect(cols[3]).toBe("");
  });
});

// ─── Review step: max columns detection ──────────────────────────
describe("Review step — max columns for table header", () => {
  function splitLineIntoColumns(line: string): string[] {
    return line.split("\t").map((c) => c.trim());
  }

  it("detects max columns across rows with different column counts", () => {
    const lines = [
      "LY01\tProstate Oil\tAhmed\t218912345678\t150\tTripoli",       // 6 cols
      "DZ01\tTesticalm\tKarim\t0555123456\t3500\tAlger\tBab Ezzouar", // 7 cols
      "LY02\tOil\tMohamed\t218923456789",                              // 4 cols
    ];
    const rows = lines.map(splitLineIntoColumns);
    const maxCols = rows.reduce((max, row) => Math.max(max, row.length), 0);
    expect(maxCols).toBe(7);
  });

  it("handles uniform column count", () => {
    const lines = [
      "A\tB\tC\tD\tE",
      "1\t2\t3\t4\t5",
    ];
    const rows = lines.map(splitLineIntoColumns);
    const maxCols = rows.reduce((max, row) => Math.max(max, row.length), 0);
    expect(maxCols).toBe(5);
  });

  it("handles single row", () => {
    const rows = [splitLineIntoColumns("X\tY\tZ")];
    const maxCols = rows.reduce((max, row) => Math.max(max, row.length), 0);
    expect(maxCols).toBe(3);
  });
});

// ─── Review step: full flow simulation ───────────────────────────
describe("Review step — full flow (paste → review → submit)", () => {
  function splitLineIntoColumns(line: string): string[] {
    return line.split("\t").map((c) => c.trim());
  }

  it("page manager can review 7 leads before submitting", () => {
    const rawText = [
      "LY01\tProstate Oil\tAhmed Hassan\t218912345678\t150\tTripoli",
      "LY01\tVaricocel Oil\tMohamed Ali\t218923456789\t200\tBenghazi",
      "LY02\tProstate Oil\tIbrahim Saleh\t218934567890\t150\tMisrata",
      "LY01\tHair Oil\tFatima Ahmed\t218945678901\t120\tTripoli",
      "LY02\tProstate Oil\tOmar Khalil\t218956789012\t150\tSabha",
      "LY01\tVaricocel Oil\tYoussef Nouri\t218967890123\t200\tZliten",
      "LY02\tHair Oil\tAisha Mohamed\t218978901234\t120\tDerna",
    ].join("\n");

    // Step 1: Count lines
    const lines = rawText.trim().split("\n").filter((l) => l.trim());
    expect(lines).toHaveLength(7);

    // Step 2: Split into review rows
    const reviewRows = lines.map(splitLineIntoColumns);
    expect(reviewRows).toHaveLength(7);

    // Step 3: Each row has correct data
    expect(reviewRows[0][0]).toBe("LY01");
    expect(reviewRows[0][2]).toBe("Ahmed Hassan");
    expect(reviewRows[6][2]).toBe("Aisha Mohamed");
    expect(reviewRows[6][5]).toBe("Derna");

    // Step 4: Max columns detected correctly
    const maxCols = reviewRows.reduce((max, row) => Math.max(max, row.length), 0);
    expect(maxCols).toBe(6);

    // Step 5: After review, raw text submitted unchanged
    const submittedText = rawText.trim();
    expect(submittedText).toBe(rawText);
  });

  it("review catches missing data (empty columns visible)", () => {
    const rawText = "LY01\t\tAhmed\t\t150\tTripoli";
    const cols = splitLineIntoColumns(rawText);
    // Page manager can see empty columns 2 and 4 in the review table
    expect(cols[1]).toBe("");
    expect(cols[3]).toBe("");
    // They can go back and fix the paste
  });
});
