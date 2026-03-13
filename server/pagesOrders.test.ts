import { describe, expect, it } from "vitest";
import { parseLeadsFromPaste, formatLeadRow, formatPhone } from "./googleSheets";

/**
 * Tests for FORMAT F — Pages Orders
 *
 * Pages Orders format (6 columns, tab-separated):
 *   col 0 = page code (SM1, GH1, etc.)
 *   col 1 = product name
 *   col 2 = customer name (often prefixed with page code)
 *   col 3 = phone (9 digits, no country code — Excel strips leading 0)
 *   col 4 = address (optional)
 *   col 5 = date (YYYY-MM-DD)
 *
 * Output:
 *   sku = pageCode + "PAGE" (e.g. SM1PAGE)
 *   price = "" (empty)
 *   orderType = "PAGE"
 */

describe("parseLeadsFromPaste — Pages Orders format (FORMAT F)", () => {
  it("parses a single Algeria pages order row", () => {
    const input = `SM1\ttesticalm\tSM1 client name\t672358110\tWilaya de mila\t2026-02-28`;

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(1);
    expect(leads[0].customerName).toBe("SM1 client name");
    expect(leads[0].phone).toBe("672358110");
    expect(leads[0].product).toBe("testicalm");
    expect(leads[0].wilaya).toBe("Wilaya de mila");
    expect(leads[0].sku).toBe("SM1PAGE");
    expect(leads[0].price).toBe("");
    expect(leads[0].date).toBe("2026-02-28");
    expect(leads[0].orderType).toBe("PAGE");
  });

  it("parses multiple pages order rows", () => {
    const input = [
      `SM1\ttesticalm\tSM1 Ahmed\t672358110\tWilaya de mila\t2026-02-28`,
      `GH1\tprostate oil\tGH1 Mohamed\t943750615\t\t2026-02-28`,
      `SM2\thair serum\tSM2 Fatima\t551234567\tAlger\t2026-03-01`,
    ].join("\n");

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(3);

    expect(leads[0].sku).toBe("SM1PAGE");
    expect(leads[0].customerName).toBe("SM1 Ahmed");
    expect(leads[0].product).toBe("testicalm");

    expect(leads[1].sku).toBe("GH1PAGE");
    expect(leads[1].customerName).toBe("GH1 Mohamed");
    expect(leads[1].product).toBe("prostate oil");
    expect(leads[1].wilaya).toBe(""); // empty address

    expect(leads[2].sku).toBe("SM2PAGE");
    expect(leads[2].customerName).toBe("SM2 Fatima");
    expect(leads[2].date).toBe("2026-03-01");
  });

  it("parses Libya pages order (same format)", () => {
    const input = [
      `SM1\tسيروم تساقط الشعر ihair\tSM1 عميل\t943750615\t\t2026-02-28`,
      `GH1\tprostate oil\tGH1 أحمد\t912345678\tطرابلس\t2026-02-28`,
    ].join("\n");

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(2);
    expect(leads[0].sku).toBe("SM1PAGE");
    expect(leads[0].product).toBe("سيروم تساقط الشعر ihair");
    expect(leads[1].sku).toBe("GH1PAGE");
    expect(leads[1].wilaya).toBe("طرابلس");
  });

  it("handles datetime format in date column", () => {
    const input = `SM1\ttesticalm\tSM1 client\t672358110\tMila\t2026-02-28 00:00:00`;

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(1);
    expect(leads[0].date).toBe("2026-02-28");
  });

  it("handles ISO datetime format in date column", () => {
    const input = `SM1\ttesticalm\tSM1 client\t672358110\tMila\t2026-02-28T14:30:00`;

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(1);
    expect(leads[0].date).toBe("2026-02-28");
  });

  it("handles missing date column gracefully", () => {
    const input = `SM1\ttesticalm\tSM1 client\t672358110\tMila`;

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(1);
    expect(leads[0].date).toBe("");
    expect(leads[0].sku).toBe("SM1PAGE");
  });

  it("handles missing address column", () => {
    const input = `SM1\ttesticalm\tSM1 client\t672358110\t\t2026-02-28`;

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(1);
    expect(leads[0].wilaya).toBe("");
    expect(leads[0].sku).toBe("SM1PAGE");
  });

  it("skips empty lines", () => {
    const input = [
      `SM1\ttesticalm\tSM1 Ahmed\t672358110\tMila\t2026-02-28`,
      ``,
      `GH1\toil\tGH1 Mohamed\t943750615\t\t2026-02-28`,
      ``,
    ].join("\n");

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(2);
  });

  it("uppercases page code for SKU", () => {
    const input = `sm1\ttesticalm\tsm1 client\t672358110\tMila\t2026-02-28`;

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(1);
    expect(leads[0].sku).toBe("SM1PAGE");
  });

  it("handles 10-digit phone numbers (with leading 0)", () => {
    const input = `SM1\ttesticalm\tSM1 client\t0672358110\tMila\t2026-02-28`;

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(1);
    expect(leads[0].phone).toBe("0672358110");
  });

  it("all leads have empty price", () => {
    const input = [
      `SM1\ttesticalm\tSM1 A\t672358110\tMila\t2026-02-28`,
      `GH1\toil\tGH1 B\t943750615\t\t2026-02-28`,
      `SM2\tserum\tSM2 C\t551234567\tAlger\t2026-03-01`,
    ].join("\n");

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(3);
    leads.forEach((lead) => {
      expect(lead.price).toBe("");
    });
  });

  it("all leads have orderType PAGE", () => {
    const input = [
      `SM1\ttesticalm\tSM1 A\t672358110\tMila\t2026-02-28`,
      `GH1\toil\tGH1 B\t943750615\t\t2026-02-28`,
    ].join("\n");

    const leads = parseLeadsFromPaste(input);
    expect(leads).toHaveLength(2);
    leads.forEach((lead) => {
      expect(lead.orderType).toBe("PAGE");
    });
  });

  it("parses exactly N leads from N valid pages order rows", () => {
    const lines = Array.from({ length: 30 }, (_, i) =>
      `SM1\tProduct${i}\tSM1 Name${i}\t67235${String(i).padStart(4, "0")}\tWilaya${i}\t2026-02-28`
    );

    const leads = parseLeadsFromPaste(lines.join("\n"));
    expect(leads).toHaveLength(30);
    leads.forEach((lead) => {
      expect(lead.sku).toBe("SM1PAGE");
      expect(lead.price).toBe("");
      expect(lead.orderType).toBe("PAGE");
    });
  });

  it("does not confuse pages orders with TikTok format", () => {
    // TikTok format has phone in col[1] with +213 prefix
    // Pages Orders has page code in col[0] and phone in col[3]
    const pagesInput = [
      `SM1\ttesticalm\tSM1 client\t672358110\tMila\t2026-02-28`,
      `GH1\toil\tGH1 client\t943750615\t\t2026-02-28`,
    ].join("\n");

    const leads = parseLeadsFromPaste(pagesInput);
    expect(leads).toHaveLength(2);
    expect(leads[0].sku).toBe("SM1PAGE");
    // Should NOT have TikTok-style parsing (name in col[0], phone in col[1])
    expect(leads[0].customerName).toBe("SM1 client");
    expect(leads[0].phone).toBe("672358110");
  });

  it("does not confuse pages orders with Shopify format", () => {
    // Shopify has 15+ columns, pages orders has 4-6
    const pagesInput = `SM1\ttesticalm\tSM1 client\t672358110\tMila\t2026-02-28`;

    const leads = parseLeadsFromPaste(pagesInput);
    expect(leads).toHaveLength(1);
    expect(leads[0].sku).toBe("SM1PAGE");
    expect(leads[0].product).toBe("testicalm");
  });
});

describe("Pages Orders — formatLeadRow integration", () => {
  it("formats a pages order lead for Algeria agent sheet", () => {
    const lead = {
      date: "2026-02-28",
      product: "testicalm",
      customerName: "SM1 client name",
      phone: "672358110",
      wilaya: "Wilaya de mila",
      price: "" as string | number,
      sku: "SM1PAGE",
      orderType: "PAGE",
    };

    const row = formatLeadRow(lead, "AGENT01", "algeria");
    // Row structure: date, status, qty, delivery, note, agentCode, product, customer, phone, wilaya, address2, price, sku
    expect(row[5]).toBe("AGENT01"); // agent code
    expect(row[6]).toBe("TESTICALM"); // product uppercased
    expect(row[7]).toBe("SM1 client name AGENT01"); // customer name + agent code
    expect(row[8]).toBe("'672358110"); // phone as-is for PAGE orders (no formatPhone)
    expect(row[9]).toBe("Wilaya de mila"); // wilaya/address
    expect(row[11]).toBe(""); // price empty
    expect(row[12]).toBe("SM1PAGE"); // SKU
  });

  it("formats a pages order lead for Libya agent sheet (includes orderType column)", () => {
    const lead = {
      date: "2026-02-28",
      product: "prostate oil",
      customerName: "GH1 Mohamed",
      phone: "943750615",
      wilaya: "",
      price: "" as string | number,
      sku: "GH1PAGE",
      orderType: "PAGE",
    };

    const row = formatLeadRow(lead, "AGENT02", "libya");
    expect(row[6]).toBe("PROSTATE OIL"); // product uppercased
    expect(row[7]).toBe("GH1 Mohamed AGENT02"); // customer name + agent code
    expect(row[11]).toBe(""); // price empty
    expect(row[12]).toBe("GH1PAGE"); // SKU
    // Libya includes orderType in column N (index 13)
    expect(row[13]).toBe("PAGE");
  });

  it("formats a pages order lead for Viconis agent sheet (includes orderType column)", () => {
    const lead = {
      date: "2026-02-28",
      product: "Pack Anti-Chute",
      customerName: "SM1 Fatima",
      phone: "551234567",
      wilaya: "Alger",
      price: "" as string | number,
      sku: "SM1PAGE",
      orderType: "PAGE",
    };

    const row = formatLeadRow(lead, "AGENT03", "viconis");
    expect(row[6]).toBe("PACK ANTI-CHUTE"); // product uppercased
    expect(row[12]).toBe("SM1PAGE"); // SKU
    // Viconis includes orderType in column N (index 13)
    expect(row[13]).toBe("PAGE");
  });
});

describe("Pages Orders — phone formatting", () => {
  it("Algeria: 9-digit phone gets leading 0", () => {
    const result = formatPhone("672358110");
    expect(result).toBe("0672358110");
    expect(result.length).toBe(10);
  });

  it("Algeria: 10-digit phone with leading 0 stays unchanged", () => {
    const result = formatPhone("0672358110");
    expect(result).toBe("0672358110");
  });

  it("Libya: 9-digit phone gets leading 0", () => {
    const result = formatPhone("943750615", "libya");
    expect(result).toBe("0943750615");
    expect(result.length).toBe(10);
  });
});
