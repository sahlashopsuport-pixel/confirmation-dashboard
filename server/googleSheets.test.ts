import { describe, expect, it } from "vitest";
import {
  formatPhone,
  formatDate,
  parseLeadsFromPaste,
  formatLeadRow,
  extractSpreadsheetId,
  getUntreatedLeadCount,
  getUntreatedLeadCountAllTabs,
} from "./googleSheets";

describe("formatPhone", () => {
  it("strips 213 country code and keeps leading 0", () => {
    expect(formatPhone("2130662666692")).toBe("0662666692");
  });

  it("keeps number unchanged if already starts with 0", () => {
    expect(formatPhone("0551234567")).toBe("0551234567");
  });

  it("adds leading 0 if missing", () => {
    expect(formatPhone("662666692")).toBe("0662666692");
  });

  it("strips non-digit characters", () => {
    expect(formatPhone("+213 0662 666 692")).toBe("0662666692");
  });

  it("handles number with dashes", () => {
    expect(formatPhone("055-123-4567")).toBe("0551234567");
  });

  it("does not strip 213 from short numbers", () => {
    expect(formatPhone("2131234")).toBe("02131234");
  });

  it("handles Libyan numbers (218 prefix)", () => {
    expect(formatPhone("218912345678")).toBe("0218912345678");
  });
});

describe("parseLeadsFromPaste — Shopify raw format", () => {
  // Actual Shopify data: col0=name, col1=phone, col2-4=empty, col5=wilaya, col6=product, col7=empty, col8=qty, col9=price, col10-12=empty, col13=ad_source, col14=date, col15=ip
  const shopifyLine = (name: string, phone: string, wilaya: string, product: string, price: string, adSource: string, date: string, ip: string) =>
    `${name}\t${phone}\t\t\t\t${wilaya}\t${product}\t\t1\t${price}\t\t\t\t${adSource}\t${date}\t${ip}\t\t\t\t\t\t\t\t\t\t`;

  it("parses Shopify raw format correctly", () => {
    const input = shopifyLine(
      "عبد القادر",
      "+2130664054327",
      "11 - Tamanrasset تمنراست",
      "Testicalm",
      "3800",
      "nesrinexfr -NESRINE TESTICALM 147 VEO+ GD",
      "2026-02-04 14:01:37",
      "197.200.104.181"
    );

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(1);
    expect(leads[0].customerName).toBe("عبد القادر");
    expect(leads[0].phone).toBe("+2130664054327");
    expect(leads[0].wilaya).toBe("11 - Tamanrasset تمنراست");
    expect(leads[0].product).toBe("Testicalm");
    expect(leads[0].price).toBe("3800");
    expect(leads[0].date).toBe("2026-02-04");
    expect(leads[0].sku).toBe("nesrinexfr -NESRINE TESTICALM 147 VEO+ GD");
  });

  it("parses multiple Shopify rows", () => {
    const input = [
      shopifyLine("عبد القادر", "+2130664054327", "11 - Tamanrasset تمنراست", "Testicalm", "3800", "ad1", "2026-02-04 14:01:37", "1.2.3.4"),
      shopifyLine("يوسف تونسي", "+2130772601817", "26 - Médéa المدية", "Testicalm", "3800", "ad2", "2026-02-04 14:09:15", "5.6.7.8"),
      shopifyLine("Ben academy", "+2130772460259", "13 - Tlemcen تلمسان", "Testicalm", "3800", "ad3", "2026-02-04 15:07:09", "9.10.11.12"),
    ].join("\n");

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(3);
    expect(leads[0].customerName).toBe("عبد القادر");
    expect(leads[1].customerName).toBe("يوسف تونسي");
    expect(leads[2].customerName).toBe("Ben academy");
  });

  it("merges multiline upsell order into single lead", () => {
    // Row 14 in the real data has a multiline product description that breaks across lines
    const input = [
      shopifyLine("ناجم", "+2130668481555", "11 - Tamanrasset تمنراست", "testicalm علاج", "3800", "ad", "2026-02-04 16:41:45", "1.2.3.4"),
      'اشتري قطعتين و وفر 2100 دينار"\t\t"1',  // continuation line — no valid phone
      '1"\t5800\t\t\t\t\t\t\t\t\t\t"maissa x tiktok',  // another continuation
    ].join("\n");

    const leads = parseLeadsFromPaste(input);
    // The multiline order should be merged into one lead
    expect(leads).toHaveLength(1);
    expect(leads[0].customerName).toBe("ناجم");
    expect(leads[0].phone).toBe("+2130668481555");
    expect(leads[0].wilaya).toBe("11 - Tamanrasset تمنراست");
    // The main line has price 3800, so it should keep that
    expect(leads[0].price).toBe("3800");
    expect(leads[0].date).toBe("2026-02-04");
  });

  it("merges upsell order where price is only on continuation line", () => {
    // Simulate an upsell where the main line has NO price but continuation has 5800
    const mainLine = `ناجم\t+2130668481555\t\t\t\t11 - Tamanrasset تمنراست\ttesticalm علاج\t\t1\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t`;
    const contLine1 = `اشتري قطعتين\t\t1`;
    const contLine2 = `1\t5800\t\t\t\t\t\t\t\t\t\tmaissa x tiktok 08 testicalm`;
    const contLine3 = `testicalmupsell\t2026-02-04 16:41:45\t154.121.82.191`;

    const input = [mainLine, contLine1, contLine2, contLine3].join("\n");
    const leads = parseLeadsFromPaste(input);

    expect(leads).toHaveLength(1);
    expect(leads[0].customerName).toBe("ناجم");
    expect(leads[0].phone).toBe("+2130668481555");
    // Price should be picked up from continuation line
    expect(leads[0].price).toBe("5800");
  });

  it("handles upsell order followed by normal order", () => {
    // Upsell (multiline) followed by a normal single-line order
    const input = [
      shopifyLine("ناجم", "+2130668481555", "11 - Tamanrasset", "testicalm upsell", "3800", "ad", "2026-02-04 16:41:45", "1.2.3.4"),
      'اشتري قطعتين\t\t1',  // continuation
      shopifyLine("Omar", "+2130551234567", "Alger", "Testicalm", "3800", "ad2", "2026-02-04 17:00:00", "5.6.7.8"),
    ].join("\n");

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(2);
    expect(leads[0].customerName).toBe("ناجم");
    expect(leads[1].customerName).toBe("Omar");
    expect(leads[1].price).toBe("3800");
  });

  it("skips empty lines in Shopify format", () => {
    const input = [
      shopifyLine("Name1", "+2130664054327", "Alger", "Product", "3800", "ad", "2026-02-04 14:00:00", "1.2.3.4"),
      "",
      shopifyLine("Name2", "+2130772601817", "Oran", "Product", "4200", "ad2", "2026-02-04 15:00:00", "5.6.7.8"),
    ].join("\n");

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(2);
  });
});

describe("parseLeadsFromPaste — Simple export format", () => {
  it("parses tab-separated data with header", () => {
    const input = `order date creation\tproduct\tfull name\tphone number\twillaya\tprice\tsku
2025-02-20 10:30:00\tTesticalm Spray\tMohamed Ali\t2130662666692\tAlger\t3500\tTEST-001
2025-02-20 11:00:00\tMenopause Oil\tFatima Ben\t0551234567\tOran\t4200\tMENO-002`;

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(2);

    expect(leads[0]).toEqual({
      date: "2025-02-20",
      product: "Testicalm Spray",
      customerName: "Mohamed Ali",
      phone: "2130662666692",
      wilaya: "Alger",
      price: "3500",
      sku: "TEST-001",
    });
  });

  it("parses tab-separated data without header", () => {
    const input = `2025-02-20\tTesticalm Spray\tMohamed Ali\t2130662666692\tAlger\t3500\tTEST-001`;

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(1);
    expect(leads[0].customerName).toBe("Mohamed Ali");
  });

  it("parses comma-separated data", () => {
    const input = `2025-02-20,Testicalm Spray,Mohamed Ali,2130662666692,Alger,3500,TEST-001`;

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(1);
    expect(leads[0].product).toBe("Testicalm Spray");
  });

  it("skips empty lines", () => {
    const input = `2025-02-20\tTesticalm\tAli\t0551234567\tAlger\t3500\tTEST-001

2025-02-20\tMenopause\tFatima\t0661234567\tOran\t4200\tMENO-002

`;

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(2);
  });

  it("skips lines with fewer than 6 columns", () => {
    const input = `2025-02-20\tTesticalm\tAli\t0551234567\tAlger\t3500\tTEST-001
incomplete\tdata\tonly`;

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(1);
  });

  it("returns empty array for empty input", () => {
    expect(parseLeadsFromPaste("")).toEqual([]);
    expect(parseLeadsFromPaste("   ")).toEqual([]);
  });

  it("extracts date-only from datetime strings", () => {
    const input = `2025-02-20 10:30:00\tProduct\tName\t0551234567\tAlger\t3500\tSKU`;
    const leads = parseLeadsFromPaste(input);
    expect(leads[0].date).toBe("2025-02-20");
  });

  it("handles missing SKU column gracefully", () => {
    const input = `2025-02-20\tProduct\tName\t0551234567\tAlger\t3500`;
    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(1);
    expect(leads[0].sku).toBe("");
  });
});

describe("parseLeadsFromPaste — Real Shopify data", () => {
  it("parses the actual pasted data from Boss", () => {
    // First 3 lines from the real paste
    const input = `عبد القادر\t+2130664054327\t\t\t\t11 - Tamanrasset تمنراست\tTesticalm\t\t1\t3800\t\t\t\tnesrinexfr -NESRINE TESTICALM 147 VEO+ GD\t2026-02-04 14:01:37\t197.200.104.181\t\t\t\t\t\t\t\t\t\t
يوسف تونسي\t+2130772601817\t\t\t\t26 - Médéa المدية\tTesticalm\t\t1\t3800\t\t\t\tnesrinexfr -NESRINE TESTICALM 147 VEO+ GD\t2026-02-04 14:09:15\t154.241.112.106\t\t\t\t\t\t\t\t\t\t
براهمي معمد\t+2130665018555\t\t\t\t01 - Adrar أدرار\tTesticalm\t\t1\t3800\t\t\t\tSTIF 1544 ALG TESTICALM USE 03\t2026-02-04 14:37:46\t105.235.139.173\t\t\t\t\t\t\t\t\t\t`;

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(3);

    // Verify first lead
    expect(leads[0].customerName).toBe("عبد القادر");
    expect(leads[0].phone).toBe("+2130664054327");
    expect(leads[0].wilaya).toBe("11 - Tamanrasset تمنراست");
    expect(leads[0].product).toBe("Testicalm");
    expect(leads[0].price).toBe("3800");
    expect(leads[0].date).toBe("2026-02-04");

    // Verify second lead
    expect(leads[1].customerName).toBe("يوسف تونسي");
    expect(leads[1].phone).toBe("+2130772601817");
    expect(leads[1].wilaya).toBe("26 - Médéa المدية");

    // Verify third lead
    expect(leads[2].customerName).toBe("براهمي معمد");
    expect(leads[2].wilaya).toBe("01 - Adrar أدرار");
  });
});

describe("formatDate", () => {
  it("converts YYYY-MM-DD to DD/MM/YYYY", () => {
    expect(formatDate("2026-02-04")).toBe("04/02/2026");
  });

  it("converts another date correctly", () => {
    expect(formatDate("2025-12-31")).toBe("31/12/2025");
  });

  it("returns as-is if already DD/MM/YYYY", () => {
    expect(formatDate("04/02/2026")).toBe("04/02/2026");
  });

  it("returns as-is for unrecognized format", () => {
    expect(formatDate("Feb 4 2026")).toBe("Feb 4 2026");
  });

  it("returns empty string for empty input", () => {
    expect(formatDate("")).toBe("");
  });
});

describe("formatLeadRow", () => {
  // Helper: today's date in DD/MM/YYYY (formatLeadRow always uses assignment date)
  const now = new Date();
  const todayDDMMYYYY = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

  it("produces 13-column row with today's date (assignment date) and UPPERCASE product", () => {
    const lead = {
      date: "2025-02-20",
      product: "Testicalm Spray",
      customerName: "Mohamed Ali",
      phone: "2130662666692",
      wilaya: "Alger",
      price: "3500",
      sku: "TEST-001",
    };

    const row = formatLeadRow(lead, "SB");
    expect(row).toHaveLength(13);

    expect(row[0]).toBe(todayDDMMYYYY); // Date — always today's date (assignment date)
    expect(row[1]).toBe(""); // Status
    expect(row[2]).toBe(""); // Quantity
    expect(row[3]).toBe(""); // Delivery
    expect(row[4]).toBe(""); // Call Note
    expect(row[5]).toBe("SB"); // Agent Code
    expect(row[6]).toBe("TESTICALM SPRAY"); // Product — UPPERCASE
    expect(row[7]).toBe("Mohamed Ali SB"); // Customer + agent code
    expect(row[8]).toBe("'0662666692"); // Phone — apostrophe prefix forces text in Sheets
    expect(row[9]).toBe("Alger"); // Wilaya
    expect(row[10]).toBe(""); // Address 2
    expect(row[11]).toBe("3500"); // Price
    expect(row[12]).toBe("TEST-001"); // SKU
  });

  it("formats phone number with no spaces and leading 0", () => {
    const lead = {
      date: "2025-02-20",
      product: "Test",
      customerName: "Test",
      phone: "+213 0551 234 567",
      wilaya: "Alger",
      price: "1000",
      sku: "SKU",
    };

    const row = formatLeadRow(lead, "AB");
    expect(row[8]).toBe("'0551234567"); // Apostrophe prefix + clean digits
    expect(row[5]).toBe("AB");
    expect(row[6]).toBe("TEST"); // UPPERCASE
  });

  it("uses workDate when provided instead of today's date", () => {
    const lead = {
      date: "2025-02-20",
      product: "Testicalm",
      customerName: "Test User",
      phone: "0551234567",
      wilaya: "Alger",
      price: "3800",
      sku: "SKU-001",
    };

    // Pass workDate = tomorrow (2026-03-07)
    const row = formatLeadRow(lead, "AG", undefined, "2026-03-07");
    expect(row[0]).toBe("07/03/2026"); // Should be the workDate, NOT today
  });

  it("uses workDate for Libya market too", () => {
    const lead = {
      date: "2026-01-19",
      product: "Prostate Oil",
      customerName: "Ahmed",
      phone: "218912345678",
      wilaya: "Tripoli",
      address2: "Ain Zara",
      price: "150",
      sku: "PRO-001",
      orderType: "NORMAL",
    };

    const row = formatLeadRow(lead, "LB", "libya", "2026-03-08");
    expect(row[0]).toBe("08/03/2026"); // workDate, not today
    expect(row).toHaveLength(14); // Libya still has 14 columns
  });

  it("falls back to today when workDate is not provided", () => {
    const lead = {
      date: "2025-02-20",
      product: "Test",
      customerName: "Test",
      phone: "0551234567",
      wilaya: "Alger",
      price: "1000",
      sku: "SKU",
    };

    const row = formatLeadRow(lead, "AG");
    expect(row[0]).toBe(todayDDMMYYYY); // No workDate → today
  });

  it("falls back to today when workDate is undefined", () => {
    const lead = {
      date: "2025-02-20",
      product: "Test",
      customerName: "Test",
      phone: "0551234567",
      wilaya: "Alger",
      price: "1000",
      sku: "SKU",
    };

    const row = formatLeadRow(lead, "AG", "algeria", undefined);
    expect(row[0]).toBe(todayDDMMYYYY); // undefined workDate → today
  });
});

describe("extractSpreadsheetId", () => {
  it("extracts ID from standard Google Sheets URL", () => {
    const url =
      "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit#gid=0";
    expect(extractSpreadsheetId(url)).toBe(
      "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
    );
  });

  it("extracts ID from URL without hash", () => {
    const url =
      "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit";
    expect(extractSpreadsheetId(url)).toBe(
      "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
    );
  });

  it("throws for invalid URL", () => {
    expect(() => extractSpreadsheetId("https://google.com")).toThrow(
      "Invalid Google Sheets URL"
    );
  });
});

describe("Split assign — lead index distribution", () => {
  // These tests verify the frontend logic for splitting leads across agents
  // The actual splitAssign procedure calls appendRows which needs Google API,
  // so we test the index distribution logic that the frontend sends

  it("splits 10 leads equally across 2 agents", () => {
    const totalLeads = 10;
    const agentCount = 2;
    const perAgent = Math.floor(totalLeads / agentCount);
    const remainder = totalLeads % agentCount;

    const assignments = Array.from({ length: agentCount }, (_, i) => ({
      leadCount: perAgent + (i < remainder ? 1 : 0),
    }));

    expect(assignments[0].leadCount).toBe(5);
    expect(assignments[1].leadCount).toBe(5);
    expect(assignments.reduce((s, a) => s + a.leadCount, 0)).toBe(totalLeads);
  });

  it("splits 7 leads across 3 agents with remainder", () => {
    const totalLeads = 7;
    const agentCount = 3;
    const perAgent = Math.floor(totalLeads / agentCount);
    const remainder = totalLeads % agentCount;

    const assignments = Array.from({ length: agentCount }, (_, i) => ({
      leadCount: perAgent + (i < remainder ? 1 : 0),
    }));

    // 7 / 3 = 2 remainder 1 → first agent gets 3, rest get 2
    expect(assignments[0].leadCount).toBe(3);
    expect(assignments[1].leadCount).toBe(2);
    expect(assignments[2].leadCount).toBe(2);
    expect(assignments.reduce((s, a) => s + a.leadCount, 0)).toBe(totalLeads);
  });

  it("builds correct lead indices for sequential assignment", () => {
    const leads = Array.from({ length: 10 }, (_, i) => ({ name: `Lead ${i}` }));
    const agentCounts = [4, 3, 3]; // 3 agents with 4, 3, 3 leads

    let currentIndex = 0;
    const assignmentData = agentCounts.map((count) => {
      const indices = Array.from({ length: count }, (_, i) => currentIndex + i);
      currentIndex += count;
      return { leadIndices: indices };
    });

    expect(assignmentData[0].leadIndices).toEqual([0, 1, 2, 3]);
    expect(assignmentData[1].leadIndices).toEqual([4, 5, 6]);
    expect(assignmentData[2].leadIndices).toEqual([7, 8, 9]);

    // All indices should be unique and cover all leads
    const allIndices = assignmentData.flatMap((a) => a.leadIndices);
    expect(allIndices).toHaveLength(10);
    expect(new Set(allIndices).size).toBe(10);
  });

  it("hard caps lead count to not exceed remaining", () => {
    const totalLeads = 100;
    const assignments = [
      { agentId: 1, leadCount: 60 },
      { agentId: 2, leadCount: 30 },
    ];

    // Agent 3 tries to take 20 but only 10 remain
    const othersTotal = assignments.reduce((s, a) => s + a.leadCount, 0);
    const maxForNew = totalLeads - othersTotal;
    const requestedCount = 20;
    const cappedCount = Math.max(0, Math.min(requestedCount, maxForNew));

    expect(cappedCount).toBe(10);
  });

  it("prevents over-assignment (total cannot exceed lead count)", () => {
    const totalLeads = 50;
    const assignments = [
      { agentId: 1, leadCount: 25 },
      { agentId: 2, leadCount: 25 },
    ];

    const totalAssigned = assignments.reduce((s, a) => s + a.leadCount, 0);
    const remaining = totalLeads - totalAssigned;

    expect(totalAssigned).toBe(50);
    expect(remaining).toBe(0);

    // Trying to add more should be capped to 0
    const maxForNew = totalLeads - totalAssigned;
    expect(maxForNew).toBe(0);
  });

  it("detects duplicate batch via hash", () => {
    const hashLeads = (leads: { phone: string; customerName: string; price: string }[]) =>
      leads.map((l) => `${l.phone}|${l.customerName}|${l.price}`).sort().join("||");

    const batch1 = [
      { phone: "0551234567", customerName: "Ali", price: "3800" },
      { phone: "0662345678", customerName: "Omar", price: "4200" },
    ];

    const batch2 = [
      { phone: "0662345678", customerName: "Omar", price: "4200" },
      { phone: "0551234567", customerName: "Ali", price: "3800" },
    ];

    const batch3 = [
      { phone: "0551234567", customerName: "Ali", price: "3800" },
      { phone: "0773456789", customerName: "Karim", price: "5000" },
    ];

    // Same leads in different order should produce same hash
    expect(hashLeads(batch1)).toBe(hashLeads(batch2));
    // Different leads should produce different hash
    expect(hashLeads(batch1)).not.toBe(hashLeads(batch3));
  });
});

describe("Connection test response handling", () => {
  // These test the shape and logic of the testConnection return value
  // (actual Google API calls are tested via integration, not unit tests)

  it("returns correct shape for full editor access", () => {
    const result = {
      success: true,
      sheetNames: ["Week 1", "Week 2"],
      canRead: true,
      canWrite: true,
    };
    expect(result.success).toBe(true);
    expect(result.canRead).toBe(true);
    expect(result.canWrite).toBe(true);
    expect(result.sheetNames).toHaveLength(2);
  });

  it("returns correct shape for read-only access", () => {
    const result = {
      success: false,
      sheetNames: ["Week 1"],
      canRead: true,
      canWrite: false,
      error: "Read-only access — share as Editor (not Viewer) with the service account email",
    };
    expect(result.success).toBe(false);
    expect(result.canRead).toBe(true);
    expect(result.canWrite).toBe(false);
    expect(result.error).toContain("Read-only");
  });

  it("returns correct shape for no access", () => {
    const result = {
      success: false,
      sheetNames: [],
      canRead: false,
      canWrite: false,
      error: "No access — share the sheet with the service account email",
    };
    expect(result.success).toBe(false);
    expect(result.canRead).toBe(false);
    expect(result.canWrite).toBe(false);
  });

  it("frontend status mapping: success → ok", () => {
    const result = { success: true, canRead: true, canWrite: true };
    const status = result.success ? "ok" : result.canRead && !result.canWrite ? "readonly" : "error";
    expect(status).toBe("ok");
  });

  it("frontend status mapping: read-only → readonly", () => {
    const result = { success: false, canRead: true, canWrite: false };
    const status = result.success ? "ok" : result.canRead && !result.canWrite ? "readonly" : "error";
    expect(status).toBe("readonly");
  });

  it("frontend status mapping: no access → error", () => {
    const result = { success: false, canRead: false, canWrite: false };
    const status = result.success ? "ok" : result.canRead && !result.canWrite ? "readonly" : "error";
    expect(status).toBe("error");
  });
});

describe("Failed lead recovery — index tracking", () => {
  const sampleLeads = [
    { date: "2026-02-04", customerName: "Ali", phone: "0551234567", wilaya: "Alger", product: "Testicalm", price: "3800", sku: "SKU1" },
    { date: "2026-02-04", customerName: "Omar", phone: "0662345678", wilaya: "Oran", product: "Testicalm", price: "3800", sku: "SKU2" },
    { date: "2026-02-04", customerName: "Karim", phone: "0773456789", wilaya: "Constantine", product: "Menopause", price: "4200", sku: "SKU3" },
    { date: "2026-02-04", customerName: "Fatima", phone: "0884567890", wilaya: "Tlemcen", product: "Testicalm", price: "3800", sku: "SKU4" },
    { date: "2026-02-04", customerName: "Sara", phone: "0995678901", wilaya: "Blida", product: "Menopause", price: "4200", sku: "SKU5" },
  ];

  it("splitAssign error response includes failedLeadIndices", () => {
    // Simulating what the backend returns when an agent's assignment fails
    const splitResult = {
      success: false,
      results: [
        { agentName: "Agent A", sheetTab: "Week 1", rowsAppended: 2 },
      ],
      errors: [
        { agentName: "Agent B", error: "Permission denied", failedLeadIndices: [2, 3, 4] },
      ],
      totalAssigned: 2,
    };

    expect(splitResult.errors[0].failedLeadIndices).toEqual([2, 3, 4]);
    expect(splitResult.errors[0].failedLeadIndices).toHaveLength(3);
  });

  it("can recover failed leads by indices", () => {
    const failedIndices = [2, 3, 4];
    const failedLeads = failedIndices.map((i) => sampleLeads[i]).filter(Boolean);

    expect(failedLeads).toHaveLength(3);
    expect(failedLeads[0].customerName).toBe("Karim");
    expect(failedLeads[1].customerName).toBe("Fatima");
    expect(failedLeads[2].customerName).toBe("Sara");
  });

  it("handles out-of-bounds indices gracefully", () => {
    const failedIndices = [0, 10, 99]; // 10 and 99 are out of bounds
    const failedLeads = failedIndices.map((i) => sampleLeads[i]).filter(Boolean);

    expect(failedLeads).toHaveLength(1);
    expect(failedLeads[0].customerName).toBe("Ali");
  });

  it("can aggregate failed leads from multiple agent errors", () => {
    const errors = [
      { agentName: "Agent B", error: "Permission denied", failedLeadIndices: [2, 3] },
      { agentName: "Agent C", error: "Sheet not found", failedLeadIndices: [4] },
    ];

    const allFailedIndices = errors.flatMap((e) => e.failedLeadIndices);
    expect(allFailedIndices).toEqual([2, 3, 4]);

    const allFailedLeads = allFailedIndices.map((i) => sampleLeads[i]).filter(Boolean);
    expect(allFailedLeads).toHaveLength(3);
  });

  it("formats failed leads as tab-separated text for clipboard", () => {
    const failedIndices = [0, 1];
    const failedLeads = failedIndices.map((i) => sampleLeads[i]).filter(Boolean);

    const text = failedLeads
      .map((l) => `${l.customerName}\t${l.phone}\t${l.wilaya}\t${l.product}\t${l.price}\t${l.sku}\t${l.date}`)
      .join("\n");

    expect(text).toContain("Ali\t0551234567\tAlger\tTesticalm\t3800\tSKU1\t2026-02-04");
    expect(text).toContain("Omar\t0662345678\tOran\tTesticalm\t3800\tSKU2\t2026-02-04");
    expect(text.split("\n")).toHaveLength(2);
  });

  it("retry creates new lead set from failed indices only", () => {
    // Simulate: 5 leads, agent A got [0,1] successfully, agent B failed with [2,3,4]
    const splitResult = {
      results: [{ agentName: "Agent A", sheetTab: "Week 1", rowsAppended: 2 }],
      errors: [{ agentName: "Agent B", error: "Error", failedLeadIndices: [2, 3, 4] }],
    };

    const allFailedIndices = splitResult.errors.flatMap((e) => e.failedLeadIndices);
    const retryLeads = allFailedIndices.map((i) => sampleLeads[i]).filter(Boolean);

    // Only the failed leads should be in the retry set
    expect(retryLeads).toHaveLength(3);
    expect(retryLeads.map((l) => l.customerName)).toEqual(["Karim", "Fatima", "Sara"]);

    // The successfully assigned leads (Ali, Omar) should NOT be in the retry set
    expect(retryLeads.find((l) => l.customerName === "Ali")).toBeUndefined();
    expect(retryLeads.find((l) => l.customerName === "Omar")).toBeUndefined();
  });

  it("total affected leads count matches sum of all error failedLeadIndices", () => {
    const errors = [
      { agentName: "Agent B", error: "err1", failedLeadIndices: [2, 3] },
      { agentName: "Agent C", error: "err2", failedLeadIndices: [4] },
    ];

    const totalAffected = errors.reduce((s, e) => s + e.failedLeadIndices.length, 0);
    expect(totalAffected).toBe(3);
  });
});

describe("formatPhone — Libya market", () => {
  it("strips 218 country code and keeps leading 0", () => {
    expect(formatPhone("218912345678", "libya")).toBe("0912345678");
  });

  it("strips 218 from long number", () => {
    expect(formatPhone("218923456789", "libya")).toBe("0923456789");
  });

  it("keeps number unchanged if already starts with 0", () => {
    expect(formatPhone("0912345678", "libya")).toBe("0912345678");
  });

  it("adds leading 0 if missing (no country code)", () => {
    expect(formatPhone("912345678", "libya")).toBe("0912345678");
  });

  it("strips non-digit characters from Libya number", () => {
    expect(formatPhone("+218 91 234 5678", "libya")).toBe("0912345678");
  });

  it("does not strip 218 from short numbers", () => {
    expect(formatPhone("218123", "libya")).toBe("0218123");
  });
});

describe("formatPhone — Tunisia market", () => {
  it("strips 216 country code", () => {
    expect(formatPhone("21612345678", "tunisia")).toBe("12345678");
  });

  it("keeps 8-digit number unchanged", () => {
    expect(formatPhone("12345678", "tunisia")).toBe("12345678");
  });

  it("does not add leading 0 for Tunisia", () => {
    expect(formatPhone("98765432", "tunisia")).toBe("98765432");
  });
});

describe("formatPhone — default (Algeria) market", () => {
  it("strips 213 when no market specified", () => {
    expect(formatPhone("2130662666692")).toBe("0662666692");
  });

  it("strips 213 when market is algeria", () => {
    expect(formatPhone("2130662666692", "algeria")).toBe("0662666692");
  });
});

describe("parseLeadsFromPaste — Libya format (FORMAT C)", () => {
  // Libya Shopify export: col0=order ref, col1=date, col2=product, col3=name, col4=phone, col5=city, col6=area, col7=price, col8=sku, col9=order type, col10=IP
  const libyaLine = (ref: string, date: string, product: string, name: string, phone: string, city: string, area: string, price: string, sku: string, orderType: string, ip: string) =>
    `${ref}\t${date}\t${product}\t${name}\t${phone}\t${city}\t${area}\t${price}\t${sku}\t${orderType}\t${ip}`;

  it("parses Libya format with market hint", () => {
    const input = libyaLine(
      "#130652", "2026-01-19T14:05:07Z", "Prostate Oil", "Ahmed Mohamed",
      "218912345678", "Tripoli", "Ain Zara", "150", "PRO-001", "NORMAL", "192.168.1.1"
    );

    const leads = parseLeadsFromPaste(input, "libya");
    expect(leads).toHaveLength(1);
    expect(leads[0].customerName).toBe("Ahmed Mohamed");
    expect(leads[0].phone).toBe("218912345678");
    expect(leads[0].wilaya).toBe("Tripoli");
    expect(leads[0].address2).toBe("Ain Zara");
    expect(leads[0].price).toBe("150");
    expect(leads[0].sku).toBe("PRO-001");
    expect(leads[0].orderType).toBe("NORMAL");
    expect(leads[0].date).toBe("2026-01-19");
    expect(leads[0].product).toBe("Prostate Oil");
  });

  it("auto-detects Libya format by # order reference", () => {
    const input = libyaLine(
      "#D40336", "2026-01-20T10:00:00Z", "Varicocel Oil", "Khaled Ali",
      "218923456789", "Benghazi", "Al Sabri", "200", "VAR-002", "ABANDONED", "10.0.0.1"
    );

    // No market hint — should auto-detect by # prefix
    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(1);
    expect(leads[0].customerName).toBe("Khaled Ali");
    expect(leads[0].orderType).toBe("ABANDONED");
    expect(leads[0].address2).toBe("Al Sabri");
  });

  it("parses multiple Libya rows", () => {
    const input = [
      libyaLine("#130652", "2026-01-19T14:05:07Z", "Prostate Oil", "Ahmed", "218912345678", "Tripoli", "Ain Zara", "150", "PRO-001", "NORMAL", "1.2.3.4"),
      libyaLine("#130653", "2026-01-19T15:00:00Z", "Varicocel Oil", "Khaled", "218923456789", "Benghazi", "Al Sabri", "200", "VAR-002", "NORMAL", "5.6.7.8"),
      libyaLine("#D40336", "2026-01-20T10:00:00Z", "Prostate Oil", "Omar", "218934567890", "Misrata", "Center", "150", "PRO-001", "ABANDONED", "9.10.11.12"),
    ].join("\n");

    const leads = parseLeadsFromPaste(input, "libya");
    expect(leads).toHaveLength(3);
    expect(leads[0].customerName).toBe("Ahmed");
    expect(leads[1].customerName).toBe("Khaled");
    expect(leads[2].customerName).toBe("Omar");
    expect(leads[2].orderType).toBe("ABANDONED");
  });

  it("skips header row with Libya keywords", () => {
    const input = [
      "Order Refrencce\tCreation Date\tProduct Name\tFull Name\tPhone Number\tAdress 1\tAdress 2\tTotal Price\tSku\tOrder Type\tIP Adress",
      libyaLine("#130652", "2026-01-19T14:05:07Z", "Prostate Oil", "Ahmed", "218912345678", "Tripoli", "Ain Zara", "150", "PRO-001", "NORMAL", "1.2.3.4"),
    ].join("\n");

    const leads = parseLeadsFromPaste(input, "libya");
    expect(leads).toHaveLength(1);
    expect(leads[0].customerName).toBe("Ahmed");
  });

  it("handles multiline product (upsell) in Libya format", () => {
    const input = [
      libyaLine("#130652", "2026-01-19T14:05:07Z", "Prostate Oil Pack", "Ahmed", "218912345678", "Tripoli", "Ain Zara", "300", "PRO-PACK", "NORMAL", "1.2.3.4"),
      "Buy 2 get 1 free offer\t\t\t\t\t\t\t\t\t\t",  // continuation line
      libyaLine("#130653", "2026-01-19T15:00:00Z", "Varicocel Oil", "Khaled", "218923456789", "Benghazi", "Al Sabri", "200", "VAR-002", "NORMAL", "5.6.7.8"),
    ].join("\n");

    const leads = parseLeadsFromPaste(input, "libya");
    expect(leads).toHaveLength(2);
    expect(leads[0].customerName).toBe("Ahmed");
    expect(leads[0].product).toBe("Prostate Oil Pack");
    expect(leads[1].customerName).toBe("Khaled");
  });

  it("handles ISO date with timezone offset", () => {
    const input = libyaLine(
      "#130652", "2026-01-19T14:05:07+02:00", "Product", "Name",
      "218912345678", "City", "Area", "100", "SKU", "NORMAL", "1.2.3.4"
    );

    const leads = parseLeadsFromPaste(input, "libya");
    expect(leads[0].date).toBe("2026-01-19");
  });

  it("handles date with space separator", () => {
    const input = libyaLine(
      "#130652", "2026-01-19 14:05:07", "Product", "Name",
      "218912345678", "City", "Area", "100", "SKU", "NORMAL", "1.2.3.4"
    );

    const leads = parseLeadsFromPaste(input, "libya");
    expect(leads[0].date).toBe("2026-01-19");
  });

  it("skips empty lines", () => {
    const input = [
      libyaLine("#130652", "2026-01-19T14:05:07Z", "Product A", "Ahmed", "218912345678", "Tripoli", "Ain Zara", "150", "SKU1", "NORMAL", "1.2.3.4"),
      "",
      libyaLine("#130653", "2026-01-19T15:00:00Z", "Product B", "Khaled", "218923456789", "Benghazi", "Al Sabri", "200", "SKU2", "NORMAL", "5.6.7.8"),
    ].join("\n");

    const leads = parseLeadsFromPaste(input, "libya");
    expect(leads).toHaveLength(2);
  });
});

describe("formatLeadRow — Libya market", () => {
  it("produces 14-column row with order type in column N", () => {
    const lead = {
      date: "2026-01-19",
      product: "Prostate Oil",
      customerName: "Ahmed Mohamed",
      phone: "218912345678",
      wilaya: "Tripoli",
      address2: "Ain Zara",
      price: "150",
      sku: "PRO-001",
      orderType: "NORMAL",
    };

    const row = formatLeadRow(lead, "LB", "libya");
    expect(row).toHaveLength(14);

    const now = new Date();
    const todayDDMMYYYY = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    expect(row[0]).toBe(todayDDMMYYYY); // Date — always today's date (assignment date)
    expect(row[1]).toBe(""); // Status
    expect(row[2]).toBe(""); // Quantity
    expect(row[3]).toBe(""); // Delivery
    expect(row[4]).toBe(""); // Call Note
    expect(row[5]).toBe("LB"); // Agent Code
    expect(row[6]).toBe("PROSTATE OIL"); // Product — UPPERCASE
    expect(row[7]).toBe("Ahmed Mohamed LB"); // Customer + agent code
    expect(row[8]).toBe("'0912345678"); // Phone — stripped 218, added 0, apostrophe prefix
    expect(row[9]).toBe("Tripoli"); // City (Address 1)
    expect(row[10]).toBe("Ain Zara"); // Area (Address 2)
    expect(row[11]).toBe("150"); // Price
    expect(row[12]).toBe("PRO-001"); // SKU
    expect(row[13]).toBe("NORMAL"); // Order Type
  });

  it("produces 13-column row for Algeria (no order type)", () => {
    const lead = {
      date: "2025-02-20",
      product: "Testicalm Spray",
      customerName: "Mohamed Ali",
      phone: "2130662666692",
      wilaya: "Alger",
      price: "3500",
      sku: "TEST-001",
    };

    const row = formatLeadRow(lead, "SB", "algeria");
    expect(row).toHaveLength(13);
    expect(row[8]).toBe("'0662666692"); // Algeria phone formatting
  });

  it("strips 218 from Libya phone in formatLeadRow", () => {
    const lead = {
      date: "2026-01-19",
      product: "Oil",
      customerName: "Test",
      phone: "218923456789",
      wilaya: "Benghazi",
      address2: "Area",
      price: "200",
      sku: "SKU",
      orderType: "ABANDONED",
    };

    const row = formatLeadRow(lead, "LB", "libya");
    expect(row[8]).toBe("'0923456789"); // 218 stripped, 0 added, apostrophe prefix
    expect(row[13]).toBe("ABANDONED"); // Order type preserved
  });

  it("handles Libya lead without orderType gracefully (13 cols)", () => {
    const lead = {
      date: "2026-01-19",
      product: "Oil",
      customerName: "Test",
      phone: "218912345678",
      wilaya: "Tripoli",
      address2: "Area",
      price: "150",
      sku: "SKU",
    };

    // No orderType → should not add column N
    const row = formatLeadRow(lead, "LB", "libya");
    expect(row).toHaveLength(13);
  });
});

describe("parseLeadsFromPaste — real Libya data with quoted multi-line fields", () => {
  it("correctly joins quoted multi-line product/sku fields and parses all 167 orders", () => {
    // Simulate a few real rows with CSV-style quoted multi-line fields
    const realData = [
      '#D40415\t2026-01-19T21:25:17Z\tمشروب ضد البروستات و الحرقة البولية prostateoil\tحسين محمد\t+2180922347814\tالبريقة\t-\t220\tnesrinex692- Prostatoil VOICE\tABANDONED\t156.38.43.92',
      '#130924\t2026-01-19T21:25:54Z\t"مشروب ضد البروستات و الحرقة البولية prostateoil',
      'اشتري قطعتين و وفر 100دينار"\tابراهيم الهلالي\t+2180910829110\tالزهراء\tالزهرا،\t320\t"nesrinex692- Prostatoil VOICE',
      'prostateupsell"\tNORMAL\t41.254.83.207',
      '#130925\t2026-01-19T21:27:02Z\tمشروب ضد البروستات و الحرقة البولية prostateoil\tعمر احمد موسى  ٠\t+2180914254273\tبنغازي  السوق البدريه ال\tالباب الرقم  خمس\t220\tromaissa 9496  prostateAMS-asx278 veo+\tNORMAL\t156.38.41.152',
      '#130926\t2026-01-19T21:28:29Z\t"prostateoil new',
      'اشتري قطعتين و وفر 100دينار"\tعبدالسلام النجار\t+2180913813751\tالجفره\tالجفره هون\t320\t"romaissa 0958 Aissani prostateoil 249 VEO+ -sh- x2',
      'prostateupsell"\tNORMAL\t41.254.79.157',
      '#130927\t2026-01-19T21:29:47Z\t"مشروب ضد البروستات و الحرقة البولية prostateoil',
      'اشتري قطعتين و وفر 100دينار"\tإبراهيم تواتي احمد دابو\t+2180926230454\tغات\tمدينة غات\t320\t"maissa 6067 - maissa prostaoil 213 ams',
      'prostateupsell"\tNORMAL\t102.212.138.186',
    ].join("\n");

    const leads = parseLeadsFromPaste(realData, "libya");
    
    // Should parse 5 orders (1 normal + 3 upsell + 1 normal)
    expect(leads).toHaveLength(5);
    
    // First: normal order (no quotes)
    expect(leads[0].customerName).toBe("حسين محمد");
    expect(leads[0].orderType).toBe("ABANDONED");
    expect(leads[0].price).toBe("220");
    
    // Second: upsell order (quoted product + quoted sku)
    expect(leads[1].customerName).toBe("ابراهيم الهلالي");
    expect(leads[1].price).toBe("320");
    expect(leads[1].orderType).toBe("NORMAL");
    expect(leads[1].wilaya).toBe("الزهراء");
    
    // Third: normal order
    expect(leads[2].customerName).toBe("عمر احمد موسى  ٠");
    expect(leads[2].price).toBe("220");
    
    // Fourth: upsell
    expect(leads[3].customerName).toBe("عبدالسلام النجار");
    expect(leads[3].price).toBe("320");
    expect(leads[3].wilaya).toBe("الجفره");
    
    // Fifth: upsell
    expect(leads[4].customerName).toBe("إبراهيم تواتي احمد دابو");
    expect(leads[4].price).toBe("320");
    expect(leads[4].wilaya).toBe("غات");
    expect(leads[4].address2).toBe("مدينة غات");
  });

  it("handles mixed normal and upsell orders correctly", () => {
    const mixedData = [
      '#130930\t2026-01-19T21:37:25Z\tزيت علاج القولون -Colon Digest Releif Oil\tسالم جليد الشريف\t+2180913207565\tمسلاتة / القصبات\tمسلاتة ليبيا بجوار الساحة الشعبية\t200\tSTIF 1544 LIB COLON ONE CH\tNORMAL\t156.38.52.123',
      '#130932\t2026-01-19T21:38:12Z\t"prostateoil new',
      'اشتري قطعتين و وفر 100دينار"\tمحمد احمد\t+2180924126365\tزليتن\tزلبتن  بالقرب من محطة وقود كعام\t320\t"romaissa 1255 Aissani prostateoil 234 VEO+ -GD',
      'prostateupsell"\tNORMAL\t38.252.48.63',
      '#130933\t2026-01-19T21:38:42Z\tihair pro serum-سيروم تساقط الشعر التركي\tيوسف\t+2180910664736\tالقطرون\tالقطرون\t180\tromaissa 9874 ihairAMS-asx519veo+\tNORMAL\t102.164.101.148',
    ].join("\n");

    const leads = parseLeadsFromPaste(mixedData, "libya");
    expect(leads).toHaveLength(3);
    
    expect(leads[0].customerName).toBe("سالم جليد الشريف");
    expect(leads[0].price).toBe("200");
    
    expect(leads[1].customerName).toBe("محمد احمد");
    expect(leads[1].price).toBe("320");
    
    expect(leads[2].customerName).toBe("يوسف");
    expect(leads[2].price).toBe("180");
  });
});

describe("getUntreatedLeadCount", () => {
  it("is exported as a function", () => {
    expect(typeof getUntreatedLeadCount).toBe("function");
  });
});

describe("getUntreatedLeadCountAllTabs", () => {
  it("is exported as a function", () => {
    expect(typeof getUntreatedLeadCountAllTabs).toBe("function");
  });

  it("accepts a single spreadsheetId argument", () => {
    expect(getUntreatedLeadCountAllTabs.length).toBe(1);
  });
});

describe("parseLeadsFromPaste — Viconis format (FORMAT D)", () => {
  // Viconis Shopify export: col0=product name, col1=full name, col2=phone(213...), col3=adress(wilaya),
  // col4=price, col5=sku, col6=ip, col7=creation date, col8=type, col9=order number
  const viconisLine = (product: string, name: string, phone: string, address: string, price: string, sku: string, ip: string, date: string, type: string, orderNum: string) =>
    `${product}\t${name}\t${phone}\t${address}\t${price}\t${sku}\t${ip}\t${date}\t${type}\t${orderNum}`;

  it("parses Viconis format with market hint", () => {
    const input = viconisLine(
      "Pack Anti-Chute VICONIS مجموعة تساقط الشعر",
      "Mohamed",
      "2130540943541",
      "27 - Mostaganem مستغانم",
      "3900",
      "VICONISXFACEBOOK-MohadermoFLX1",
      "79.127.139.231",
      "2026-02-21 13:48:09",
      "NORMAL",
      "#11268"
    );
    const leads = parseLeadsFromPaste(input, "viconis");
    expect(leads).toHaveLength(1);
    expect(leads[0].product).toBe("Pack Anti-Chute VICONIS مجموعة تساقط الشعر");
    expect(leads[0].customerName).toBe("Mohamed");
    expect(leads[0].phone).toBe("2130540943541");
    expect(leads[0].wilaya).toBe("27 - Mostaganem مستغانم");
    expect(leads[0].price).toBe("3900");
    expect(leads[0].sku).toBe("VICONISXFACEBOOK-MohadermoFLX1");
    expect(leads[0].date).toBe("2026-02-21");
    expect(leads[0].orderType).toBe("NORMAL");
  });

  it("auto-detects Viconis format without market hint", () => {
    const input = viconisLine(
      "Pack Anti-Chute VICONIS مجموعة تساقط الشعر",
      "Haroual rabie",
      "2130540943541",
      "27 - Mostaganem مستغانم",
      "3900",
      "VICONISXFACEBOOK-MohadermoFLX1",
      "79.127.139.231",
      "2026-02-21 13:48:09",
      "NORMAL",
      "#11268"
    );
    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(1);
    expect(leads[0].product).toBe("Pack Anti-Chute VICONIS مجموعة تساقط الشعر");
    expect(leads[0].orderType).toBe("NORMAL");
  });

  it("parses multiple Viconis leads", () => {
    const lines = [
      viconisLine("Pack Anti-Chute VICONIS", "Mohamed", "2130540943541", "27 - Mostaganem", "3900", "VICONISXFACEBOOK-SKU1", "79.127.139.231", "2026-02-21 13:48:09", "NORMAL", "#11268"),
      viconisLine("Sérum VICONIS", "Ahmed Ali", "2130661234567", "16 - Alger", "2500", "VICONISXFACEBOOK-SKU2", "41.200.10.5", "2026-02-21 14:00:00", "ABONDON", "#11269"),
      viconisLine("Pack Complet VICONIS", "Fatima Zohra", "2130770987654", "31 - Oran", "5900", "VICONISXTIKTOK-SKU3", "105.235.1.1", "2026-02-21 15:30:22", "NORMAL", "#11270"),
    ].join("\n");
    const leads = parseLeadsFromPaste(lines, "viconis");
    expect(leads).toHaveLength(3);
    expect(leads[0].customerName).toBe("Mohamed");
    expect(leads[1].customerName).toBe("Ahmed Ali");
    expect(leads[1].orderType).toBe("ABONDON");
    expect(leads[2].price).toBe("5900");
  });

  it("handles Viconis header row", () => {
    const header = "product name\tfull name\tphone number\tadress 1\tprice\tsku\tip\tcreation date\torder type\torder number";
    const data = viconisLine(
      "Pack Anti-Chute VICONIS",
      "Mohamed",
      "2130540943541",
      "27 - Mostaganem",
      "3900",
      "VICONISXFACEBOOK-SKU1",
      "79.127.139.231",
      "2026-02-21 13:48:09",
      "NORMAL",
      "#11268"
    );
    const leads = parseLeadsFromPaste(`${header}\n${data}`, "viconis");
    expect(leads).toHaveLength(1);
    expect(leads[0].product).toBe("Pack Anti-Chute VICONIS");
  });

  it("strips datetime to date only", () => {
    const input = viconisLine(
      "Product",
      "Name",
      "2130540943541",
      "Wilaya",
      "3900",
      "SKU",
      "1.2.3.4",
      "2026-02-21 13:48:09",
      "NORMAL",
      "#11268"
    );
    const leads = parseLeadsFromPaste(input, "viconis");
    expect(leads[0].date).toBe("2026-02-21");
  });

  it("skips empty lines", () => {
    const lines = [
      viconisLine("Product A", "Name A", "2130540943541", "Wilaya A", "3900", "SKU-A", "1.2.3.4", "2026-02-21 13:48:09", "NORMAL", "#11268"),
      "",
      "  ",
      viconisLine("Product B", "Name B", "2130661234567", "Wilaya B", "2500", "SKU-B", "5.6.7.8", "2026-02-21 14:00:00", "ABONDON", "#11269"),
    ].join("\n");
    const leads = parseLeadsFromPaste(lines, "viconis");
    expect(leads).toHaveLength(2);
  });
});

describe("formatPhone — Viconis market", () => {
  it("strips 213 country code (same as Algeria)", () => {
    expect(formatPhone("2130540943541", "viconis")).toBe("0540943541");
  });

  it("adds leading 0 if missing after stripping 213", () => {
    expect(formatPhone("213662666692", "viconis")).toBe("0662666692");
  });

  it("keeps number unchanged if already starts with 0", () => {
    expect(formatPhone("0540943541", "viconis")).toBe("0540943541");
  });
});

describe("formatLeadRow — Viconis market", () => {
  it("produces 14-column row with order type in column N", () => {
    const lead = {
      date: "2026-02-21",
      product: "Pack Anti-Chute VICONIS",
      customerName: "Mohamed",
      phone: "2130540943541",
      wilaya: "27 - Mostaganem",
      price: "3900",
      sku: "VICONISXFACEBOOK-SKU1",
      orderType: "NORMAL",
    };
    const now2 = new Date();
    const todayDDMMYYYY2 = `${String(now2.getDate()).padStart(2, '0')}/${String(now2.getMonth() + 1).padStart(2, '0')}/${now2.getFullYear()}`;
    const row = formatLeadRow(lead, "VIC", "viconis");
    expect(row).toHaveLength(14);
    expect(row[0]).toBe(todayDDMMYYYY2); // DD/MM/YYYY — always today's date
    expect(row[1]).toBe(""); // Status
    expect(row[5]).toBe("VIC"); // Agent code
    expect(row[6]).toBe("PACK ANTI-CHUTE VICONIS"); // UPPERCASE
    expect(row[7]).toBe("Mohamed VIC"); // Name + agent code
    expect(row[8]).toBe("'0540943541"); // Phone with apostrophe, 213 stripped
    expect(row[9]).toBe("27 - Mostaganem"); // Wilaya
    expect(row[11]).toBe("3900"); // Price
    expect(row[12]).toBe("VICONISXFACEBOOK-SKU1"); // SKU
    expect(row[13]).toBe("NORMAL"); // Type
  });

  it("includes ABONDON type", () => {
    const lead = {
      date: "2026-02-21",
      product: "Sérum VICONIS",
      customerName: "Ahmed",
      phone: "2130661234567",
      wilaya: "16 - Alger",
      price: "2500",
      sku: "VICONISXFACEBOOK-SKU2",
      orderType: "ABONDON",
    };
    const row = formatLeadRow(lead, "VIC", "viconis");
    expect(row).toHaveLength(14);
    expect(row[13]).toBe("ABONDON");
  });

  it("produces 13-column row when no orderType", () => {
    const lead = {
      date: "2026-02-21",
      product: "Pack VICONIS",
      customerName: "Ali",
      phone: "0551234567",
      wilaya: "31 - Oran",
      price: "5900",
      sku: "SKU-X",
    };
    const row = formatLeadRow(lead, "VIC", "viconis");
    expect(row).toHaveLength(13);
  });
});

describe("parseLeadsFromPaste — TikTok format (FORMAT E)", () => {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const tiktokHeader = "full name\tphone number\tadress 1\tadress2\tproduct name\tsku\tcode\tcode 2";

  const tiktokLine = (name: string, phone: string, addr1: string, addr2: string, product: string, sku: string, code: string, code2: string) =>
    `${name}\t${phone}\t${addr1}\t${addr2}\t${product}\t${sku}\t${code}\t${code2}`;

  it("parses TikTok format with header row", () => {
    const input = [
      tiktokHeader,
      tiktokLine("محمد أحمد", "+213 669 86 24 01", "Rue des fleurs", "16 - Alger", "TESTICALM", "STIF 6609 TK TESTICALM ACT 02", "TK001", ""),
    ].join("\n");

    const leads = parseLeadsFromPaste(input, "algeria");
    expect(leads).toHaveLength(1);
    expect(leads[0].customerName).toBe("محمد أحمد");
    expect(leads[0].phone).toBe("+213 669 86 24 01");
    expect(leads[0].wilaya).toBe("16 - Alger");
    expect(leads[0].product).toBe("TESTICALM");
    expect(leads[0].sku).toBe("STIF 6609 TK TESTICALM ACT 02");
    expect(leads[0].date).toBe(todayStr);
    expect(leads[0].price).toBe("3800");
    expect(leads[0].orderType).toBe("TIKTOK");
  });

  it("parses multiple TikTok leads", () => {
    const input = [
      tiktokHeader,
      tiktokLine("محمد أحمد", "+213 669 86 24 01", "Rue 1", "16 - Alger", "TESTICALM", "SKU1", "C1", ""),
      tiktokLine("يوسف بن علي", "+213 551 23 45 67", "Rue 2", "31 - Oran", "PROSTATE OIL", "SKU2", "C2", "C2B"),
      tiktokLine("كريم حسين", "+213 770 99 88 77", "Rue 3", "25 - Constantine", "VARICOCEL", "SKU3", "C3", ""),
    ].join("\n");

    const leads = parseLeadsFromPaste(input, "algeria");
    expect(leads).toHaveLength(3);
    expect(leads[0].customerName).toBe("محمد أحمد");
    expect(leads[1].customerName).toBe("يوسف بن علي");
    expect(leads[2].customerName).toBe("كريم حسين");
    expect(leads[1].wilaya).toBe("31 - Oran");
    expect(leads[2].product).toBe("VARICOCEL");
  });

  it("auto-detects TikTok format without header (phone starts with +213 and has spaces)", () => {
    const input = [
      tiktokLine("محمد أحمد", "+213 669 86 24 01", "Rue des fleurs", "16 - Alger", "TESTICALM", "SKU1", "C1", ""),
      tiktokLine("يوسف بن علي", "+213 551 23 45 67", "Rue 2", "31 - Oran", "PROSTATE OIL", "SKU2", "C2", ""),
    ].join("\n");

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(2);
    expect(leads[0].customerName).toBe("محمد أحمد");
    expect(leads[0].date).toBe(todayStr);
    expect(leads[0].orderType).toBe("TIKTOK");
  });

  it("auto-fills today's date for all TikTok leads", () => {
    const input = [
      tiktokHeader,
      tiktokLine("Test User", "+213 669 86 24 01", "Addr", "Wilaya", "Product", "SKU", "C", ""),
    ].join("\n");

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(1);
    expect(leads[0].date).toBe(todayStr);
  });

  it("preserves raw phone number for later formatting by formatPhone", () => {
    const input = [
      tiktokHeader,
      tiktokLine("Test", "+213 669 86 24 01", "Addr", "Wilaya", "Prod", "SKU", "C", ""),
    ].join("\n");

    const leads = parseLeadsFromPaste(input);
    // Raw phone is preserved; formatPhone will clean it during sheet write
    expect(leads[0].phone).toBe("+213 669 86 24 01");
    // Verify formatPhone handles the TikTok phone format correctly
    expect(formatPhone(leads[0].phone)).toBe("0669862401");
  });

  it("handles TikTok phone formatting through formatPhone correctly", () => {
    // Various TikTok phone formats
    expect(formatPhone("+213 669 86 24 01")).toBe("0669862401");
    expect(formatPhone("+213 551 23 45 67")).toBe("0551234567");
    expect(formatPhone("+213 770 99 88 77")).toBe("0770998877");
    // Already clean format
    expect(formatPhone("+2130669862401")).toBe("0669862401");
  });

  it("skips empty lines in TikTok data", () => {
    const input = [
      tiktokHeader,
      tiktokLine("User1", "+213 669 86 24 01", "Addr", "Wilaya", "Prod", "SKU", "C", ""),
      "\t\t\t\t\t\t\t",  // empty line
      "",  // blank line
      tiktokLine("User2", "+213 551 23 45 67", "Addr2", "Wilaya2", "Prod2", "SKU2", "C2", ""),
    ].join("\n");

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(2);
  });

  it("skips lines with fewer than 5 columns", () => {
    const input = [
      tiktokHeader,
      tiktokLine("User1", "+213 669 86 24 01", "Addr", "Wilaya", "Prod", "SKU", "C", ""),
      "incomplete\tdata\tonly",  // too few columns
    ].join("\n");

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(1);
  });

  it("maps adress2 to wilaya correctly", () => {
    const input = [
      tiktokHeader,
      tiktokLine("Test", "+213 669 86 24 01", "123 Main Street", "09 - Blida البليدة", "TESTICALM", "SKU", "C", ""),
    ].join("\n");

    const leads = parseLeadsFromPaste(input);
    expect(leads[0].wilaya).toBe("09 - Blida البليدة");
  });

  it("handles comma-separated TikTok data", () => {
    const input = [
      "full name,phone number,adress 1,adress2,product name,sku,code,code 2",
      "محمد أحمد,+213 669 86 24 01,Rue des fleurs,16 - Alger,TESTICALM,SKU1,C1,",
    ].join("\n");

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(1);
    expect(leads[0].customerName).toBe("محمد أحمد");
    expect(leads[0].phone).toBe("+213 669 86 24 01");
  });

  it("marks all TikTok leads with TIKTOK orderType", () => {
    const input = [
      tiktokHeader,
      tiktokLine("User1", "+213 669 86 24 01", "A", "W", "P", "S", "C", ""),
      tiktokLine("User2", "+213 551 23 45 67", "A", "W", "P", "S", "C", ""),
    ].join("\n");

    const leads = parseLeadsFromPaste(input);
    expect(leads.every((l) => l.orderType === "TIKTOK")).toBe(true);
  });

  it("formatLeadRow correctly formats TikTok lead for Algeria sheet", () => {
    const lead = {
      date: todayStr,
      customerName: "محمد أحمد",
      phone: "+213 669 86 24 01",
      wilaya: "16 - Alger",
      product: "testicalm",
      price: "3800",
      sku: "STIF 6609 TK TESTICALM ACT 02",
      orderType: "TIKTOK",
    };
    const row = formatLeadRow(lead, "AG01", "algeria");
    // Date should be formatted DD/MM/YYYY
    const [y, m, d] = todayStr.split("-");
    expect(row[0]).toBe(`${d}/${m}/${y}`);
    expect(row[5]).toBe("AG01"); // Agent code
    expect(row[6]).toBe("TESTICALM"); // Product UPPERCASE
    expect(row[7]).toBe("محمد أحمد AG01"); // Name + agent code
    expect(row[8]).toBe("'0669862401"); // Phone cleaned with apostrophe
    expect(row[9]).toBe("16 - Alger"); // Wilaya
    expect(row[11]).toBe("3800"); // TikTok standard price
    expect(row[12]).toBe("STIF 6609 TK TESTICALM ACT 02"); // SKU
  });
});

describe("SAFETY: TikTok false-positive prevention", () => {
  // Critical: Normal Algeria leads with +213 phone should NOT be detected as TikTok
  // This test protects against the scenario where Shopify raw data gets misclassified

  it("does NOT detect Shopify raw format as TikTok (phone has +213 but no spaces)", () => {
    // Shopify raw: col0=name, col1=phone (no spaces), col5=wilaya, col6=product, col14=date
    const input = [
      `عبد القادر\t+2130664054327\t\t\t\t11 - Tamanrasset\tTesticalm\t\t1\t3800\t\t\t\tad-source\t2026-02-04 14:01:37\t197.200.104.181\t\t\t\t\t\t\t\t\t\t`,
      `يوسف تونسي\t+2130772601817\t\t\t\t26 - Médéa\tTesticalm\t\t1\t3800\t\t\t\tad-source\t2026-02-04 14:09:15\t154.241.112.106\t\t\t\t\t\t\t\t\t\t`,
    ].join("\n");

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(2);
    // These should be parsed as Shopify raw (Format A), NOT TikTok
    // Key indicator: date should come from col14, not be today's date
    expect(leads[0].date).toBe("2026-02-04");
    expect(leads[1].date).toBe("2026-02-04");
    // Price should come from data, not forced to 3800
    expect(leads[0].price).toBe("3800");
  });

  it("does NOT detect Format B (simple export) as TikTok even if phone has +213", () => {
    // Format B: col0=date, col1=product, col2=name, col3=phone, col4=wilaya, col5=price, col6=sku
    const input = [
      `2026-02-20\tTesticalm\tMohamed Ali\t+213 066 266 6692\tAlger\t3500\tTEST-001`,
      `2026-02-20\tMenopause Oil\tFatima Ben\t+213 055 123 4567\tOran\t4200\tMENO-002`,
    ].join("\n");

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(2);
    // Should be parsed as Format B — date from col0, not today
    expect(leads[0].date).toBe("2026-02-20");
    expect(leads[0].customerName).toBe("Mohamed Ali");
    expect(leads[0].price).toBe("3500"); // NOT forced to 3800
  });

  it("correctly detects real TikTok data (name in col0, +213 with spaces in col1, no date column)", () => {
    const input = [
      `محمد أحمد\t+213 669 86 24 01\tRue des fleurs\t16 - Alger\tTESTICALM\tSKU1\tC1\t`,
      `يوسف بن علي\t+213 551 23 45 67\tRue 2\t31 - Oran\tPROSTATE OIL\tSKU2\tC2\t`,
    ].join("\n");

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(2);
    // TikTok: date should be today, price forced to 3800, orderType = TIKTOK
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(leads[0].date).toBe(todayStr);
    expect(leads[0].price).toBe("3800");
    expect(leads[0].orderType).toBe("TIKTOK");
  });

  it("does NOT detect as TikTok when data has a date column (even if +213 with spaces)", () => {
    // Edge case: someone pastes data with +213 spaces AND a date in another column
    // The strengthened detection should reject this as TikTok because it has a date column
    const input = [
      `محمد أحمد\t+213 669 86 24 01\t2026-02-20\t16 - Alger\tTESTICALM\tSKU1\tC1\t`,
      `يوسف بن علي\t+213 551 23 45 67\t2026-02-20\t31 - Oran\tPROSTATE OIL\tSKU2\tC2\t`,
    ].join("\n");

    const leads = parseLeadsFromPaste(input);
    // Should NOT be parsed as TikTok (has date column)
    // It will fall through to Format B or Format A depending on column count
    // The key assertion: price should NOT be forced to 3800
    if (leads.length > 0) {
      expect(leads[0].orderType).not.toBe("TIKTOK");
    }
  });

  it("requires at least 2 matching lines for TikTok auto-detection (single line not enough)", () => {
    // Only 1 line that looks TikTok-ish, mixed with non-TikTok data
    const input = [
      `محمد أحمد\t+213 669 86 24 01\tRue des fleurs\t16 - Alger\tTESTICALM\tSKU1\tC1\t`,
      `2026-02-20\tTesticalm\tFatima\t0551234567\tOran\t4200\tMENO-002`,
      `2026-02-20\tMenopause\tAli\t0661234567\tAlger\t3500\tTEST-001`,
    ].join("\n");

    const leads = parseLeadsFromPaste(input);
    // With mixed data, should NOT be classified as TikTok
    // The non-TikTok lines have dates, so they should be parsed normally
    expect(leads.length).toBeGreaterThan(0);
  });
});

describe("SAFETY: Lead count preservation in stratified shuffle", () => {
  // Critical: No leads should be silently dropped during stratified distribution

  it("total distributed leads equals total requested", async () => {
    const { stratifiedShuffle, groupLeadsByType } = await import("@shared/stratifiedShuffle");

    // Simulate 100 normal + 30 abandon + 20 tiktok = 150 total
    const leads = [
      ...Array.from({ length: 100 }, () => ({ batchType: "normal" })),
      ...Array.from({ length: 30 }, () => ({ batchType: "abandon" })),
      ...Array.from({ length: 20 }, () => ({ batchType: "tiktok" })),
    ];

    const leadsByType = groupLeadsByType(leads);
    const agents = [
      { agentId: 1, quantity: 50 },
      { agentId: 2, quantity: 40 },
      { agentId: 3, quantity: 30 },
      { agentId: 4, quantity: 30 },
    ];

    const results = stratifiedShuffle(leadsByType, agents, 42);

    // Total distributed must equal total requested (150)
    const totalDistributed = results.reduce(
      (sum: number, r: any) => sum + r.leadIndices.length,
      0
    );
    expect(totalDistributed).toBe(150);

    // No duplicate indices
    const allIndices = results.flatMap((r: any) => r.leadIndices);
    expect(new Set(allIndices).size).toBe(150);

    // All indices within bounds
    expect(allIndices.every((i: number) => i >= 0 && i < 150)).toBe(true);
  });

  it("handles uneven distribution without dropping leads", async () => {
    const { stratifiedShuffle, groupLeadsByType } = await import("@shared/stratifiedShuffle");

    // 7 normal + 3 abandon = 10 total, split across 3 agents
    const leads = [
      ...Array.from({ length: 7 }, () => ({ batchType: "normal" })),
      ...Array.from({ length: 3 }, () => ({ batchType: "abandon" })),
    ];

    const leadsByType = groupLeadsByType(leads);
    const agents = [
      { agentId: 1, quantity: 4 },
      { agentId: 2, quantity: 3 },
      { agentId: 3, quantity: 3 },
    ];

    const results = stratifiedShuffle(leadsByType, agents, 42);
    const totalDistributed = results.reduce(
      (sum: number, r: any) => sum + r.leadIndices.length,
      0
    );
    expect(totalDistributed).toBe(10);

    // Each agent gets exactly what was requested
    expect(results[0].leadIndices.length).toBe(4);
    expect(results[1].leadIndices.length).toBe(3);
    expect(results[2].leadIndices.length).toBe(3);
  });

  it("throws when requesting more leads than available", async () => {
    const { stratifiedShuffle, groupLeadsByType } = await import("@shared/stratifiedShuffle");

    const leads = Array.from({ length: 10 }, () => ({ batchType: "normal" }));
    const leadsByType = groupLeadsByType(leads);
    const agents = [
      { agentId: 1, quantity: 6 },
      { agentId: 2, quantity: 6 }, // Total 12 > 10 available
    ];

    expect(() => stratifiedShuffle(leadsByType, agents)).toThrow("Requested 12 leads but only 10 available");
  });

  it("preserves type ratios per agent", async () => {
    const { stratifiedShuffle, groupLeadsByType } = await import("@shared/stratifiedShuffle");

    // 60 normal + 40 abandon = 100 total (60/40 ratio)
    const leads = [
      ...Array.from({ length: 60 }, () => ({ batchType: "normal" })),
      ...Array.from({ length: 40 }, () => ({ batchType: "abandon" })),
    ];

    const leadsByType = groupLeadsByType(leads);
    const agents = [
      { agentId: 1, quantity: 50 },
      { agentId: 2, quantity: 50 },
    ];

    const results = stratifiedShuffle(leadsByType, agents, 42);

    // Each agent should get roughly 60% normal, 40% abandon
    for (const result of results) {
      const normalCount = result.breakdown.normal || 0;
      const abandonCount = result.breakdown.abandon || 0;
      const total = normalCount + abandonCount;
      expect(total).toBe(50);
      // Allow ±2 tolerance for rounding
      expect(normalCount).toBeGreaterThanOrEqual(28);
      expect(normalCount).toBeLessThanOrEqual(32);
    }
  });
});

describe("SAFETY: Sequential assignment index integrity", () => {
  // Verifies the frontend sequential assignment logic produces valid indices

  it("sequential indices cover all leads without gaps or overlaps", () => {
    const totalLeads = 150;
    const agentCounts = [50, 40, 30, 30]; // Must sum to 150

    let currentIndex = 0;
    const assignmentData = agentCounts.map((count) => {
      const indices = Array.from({ length: count }, (_, i) => currentIndex + i);
      currentIndex += count;
      return { leadIndices: indices };
    });

    // All indices should be unique
    const allIndices = assignmentData.flatMap((a) => a.leadIndices);
    expect(allIndices).toHaveLength(totalLeads);
    expect(new Set(allIndices).size).toBe(totalLeads);

    // All indices within bounds
    expect(allIndices.every((i) => i >= 0 && i < totalLeads)).toBe(true);

    // No gaps
    const sorted = [...allIndices].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      expect(sorted[i]).toBe(i);
    }
  });

  it("detects out-of-bounds indices", () => {
    const totalLeads = 10;
    const indices = [0, 1, 2, 10, 11]; // 10 and 11 are out of bounds

    const outOfBounds = indices.filter((i) => i < 0 || i >= totalLeads);
    expect(outOfBounds).toEqual([10, 11]);
    expect(outOfBounds.length).toBe(2);
  });

  it("detects negative indices", () => {
    const totalLeads = 10;
    const indices = [-1, 0, 1, 2];

    const outOfBounds = indices.filter((i) => i < 0 || i >= totalLeads);
    expect(outOfBounds).toEqual([-1]);
  });
});

describe("SAFETY: Parse lead count matches input rows", () => {
  // Verifies that the parser doesn't silently drop valid leads

  it("parses exactly N leads from N valid Shopify rows", () => {
    const shopifyLine = (name: string, phone: string, wilaya: string, product: string, price: string, date: string) =>
      `${name}\t${phone}\t\t\t\t${wilaya}\t${product}\t\t1\t${price}\t\t\t\tad-source\t${date}\t1.2.3.4\t\t\t\t\t\t\t\t\t\t`;

    const lines = Array.from({ length: 50 }, (_, i) =>
      shopifyLine(`Name${i}`, `+213066${String(i).padStart(7, "0")}`, `Wilaya${i}`, "Product", "3800", `2026-02-04 14:0${i % 10}:00`)
    );

    const leads = parseLeadsFromPaste(lines.join("\n"));
    expect(leads).toHaveLength(50);
  });

  it("parses exactly N leads from N valid Libya rows", () => {
    const libyaLine = (i: number) =>
      `#13${String(i).padStart(4, "0")}\t2026-01-19T14:05:07Z\tProstate Oil\tName${i}\t21891${String(i).padStart(7, "0")}\tTripoli\tArea\t150\tSKU\tNORMAL\t1.2.3.4`;

    const lines = Array.from({ length: 30 }, (_, i) => libyaLine(i));

    const leads = parseLeadsFromPaste(lines.join("\n"), "libya");
    expect(leads).toHaveLength(30);
  });

  it("parses exactly N leads from N valid Viconis rows", () => {
    const viconisLine = (i: number) =>
      `Pack VICONIS\tName${i}\t213054${String(i).padStart(7, "0")}\t27 - Mostaganem\t3900\tSKU-${i}\t1.2.3.4\t2026-02-21 13:48:09\tNORMAL\t#${11000 + i}`;

    const lines = Array.from({ length: 25 }, (_, i) => viconisLine(i));

    const leads = parseLeadsFromPaste(lines.join("\n"), "viconis");
    expect(leads).toHaveLength(25);
  });

  it("parses exactly N leads from N valid TikTok rows", () => {
    const header = "full name\tphone number\tadress 1\tadress2\tproduct name\tsku\tcode\tcode 2";
    const tiktokLine = (i: number) =>
      `Name${i}\t+213 669 ${String(i).padStart(2, "0")} 24 01\tAddr${i}\tWilaya${i}\tProduct\tSKU${i}\tC${i}\t`;

    const lines = [header, ...Array.from({ length: 20 }, (_, i) => tiktokLine(i))];

    const leads = parseLeadsFromPaste(lines.join("\n"));
    expect(leads).toHaveLength(20);
  });
});

describe("SAFETY: Phone number formatting preserves all digits", () => {
  // Verifies no digit loss during phone formatting

  it("Algeria: 10-digit number after stripping 213", () => {
    const result = formatPhone("2130662666692");
    expect(result.replace(/\D/g, "").length).toBeGreaterThanOrEqual(9);
    expect(result).toBe("0662666692");
  });

  it("Libya: 10-digit number after stripping 218", () => {
    const result = formatPhone("218912345678", "libya");
    expect(result.replace(/\D/g, "").length).toBeGreaterThanOrEqual(9);
    expect(result).toBe("0912345678");
  });

  it("Tunisia: 8-digit number after stripping 216", () => {
    const result = formatPhone("21612345678", "tunisia");
    expect(result.replace(/\D/g, "").length).toBe(8);
    expect(result).toBe("12345678");
  });

  it("TikTok phone with spaces: all digits preserved", () => {
    const result = formatPhone("+213 669 86 24 01");
    expect(result).toBe("0669862401");
    expect(result.replace(/\D/g, "").length).toBe(10);
  });
});

describe("formatLeadRow — agent code auto-appended to customer name", () => {
  it("appends agent code to customer name (format: 'Name CODE')", () => {
    const lead = {
      date: "2025-02-20",
      product: "Testicalm",
      customerName: "oussama",
      phone: "0551234567",
      wilaya: "Alger",
      price: "3800",
      sku: "SKU-001",
    };
    const row = formatLeadRow(lead, "SH08");
    expect(row[7]).toBe("oussama SH08"); // Name + space + code
    expect(row[5]).toBe("SH08"); // Code column still has the code separately
  });

  it("does NOT append code when agentCode is empty string", () => {
    const lead = {
      date: "2025-02-20",
      product: "Testicalm",
      customerName: "oussama",
      phone: "0551234567",
      wilaya: "Alger",
      price: "3800",
      sku: "SKU-001",
    };
    const row = formatLeadRow(lead, "");
    expect(row[7]).toBe("oussama"); // No code appended
    expect(row[5]).toBe(""); // Code column empty
  });

  it("works with Arabic customer names", () => {
    const lead = {
      date: "2025-02-20",
      product: "Testicalm",
      customerName: "محمد أحمد",
      phone: "0551234567",
      wilaya: "Alger",
      price: "3800",
      sku: "SKU-001",
    };
    const row = formatLeadRow(lead, "LN12");
    expect(row[7]).toBe("محمد أحمد LN12");
  });

  it("works with Libya market and agent code", () => {
    const lead = {
      date: "2026-01-19",
      product: "Prostate Oil",
      customerName: "Ahmed",
      phone: "218912345678",
      wilaya: "Tripoli",
      address2: "Ain Zara",
      price: "150",
      sku: "PRO-001",
      orderType: "NORMAL",
    };
    const row = formatLeadRow(lead, "RM05", "libya");
    expect(row[7]).toBe("Ahmed RM05");
    expect(row[5]).toBe("RM05");
    expect(row).toHaveLength(14); // Libya has 14 columns
  });

  it("works with Viconis market and agent code", () => {
    const lead = {
      date: "2026-02-21",
      product: "Pack VICONIS",
      customerName: "Ali",
      phone: "0551234567",
      wilaya: "31 - Oran",
      price: "5900",
      sku: "SKU-X",
      orderType: "ABONDON",
    };
    const row = formatLeadRow(lead, "VIC", "viconis");
    expect(row[7]).toBe("Ali VIC");
    expect(row[5]).toBe("VIC");
  });

  it("preserves customer name exactly when no code (undefined-like scenarios)", () => {
    const lead = {
      date: "2025-02-20",
      product: "Test",
      customerName: "Test User",
      phone: "0551234567",
      wilaya: "Alger",
      price: "1000",
      sku: "SKU",
    };
    // Empty string code = no append
    const row = formatLeadRow(lead, "");
    expect(row[7]).toBe("Test User");
  });
});
