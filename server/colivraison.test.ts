/**
 * Tests for Colivraison export feature:
 * - Name cleanup (phone→client, digits removal)
 * - Lead parsing (tab-separated format)
 * - Row conversion (price→qty mapping, fixed fields)
 * - Duplicate detection (by phone number)
 */

import { describe, it, expect } from "vitest";

// We import from the client lib — vitest resolves the alias via vite config
import {
  parseLeads,
  toColivraisonRows,
  cleanColivraisonName,
  COLIVRAISON_PRODUCTS,
  type ParsedLead,
} from "../client/src/lib/leadParser";

describe("cleanColivraisonName", () => {
  it("replaces pure phone number with 'client'", () => {
    expect(cleanColivraisonName("675055198")).toBe("client");
    expect(cleanColivraisonName("0552787506")).toBe("client");
    expect(cleanColivraisonName("+213552787506")).toBe("client");
  });

  it("removes digits from names with mixed letters and numbers", () => {
    expect(cleanColivraisonName("mohamed055920")).toBe("mohamed");
    expect(cleanColivraisonName("ahmed123")).toBe("ahmed");
    expect(cleanColivraisonName("123fatima456")).toBe("fatima");
  });

  it("keeps clean names as-is", () => {
    expect(cleanColivraisonName("محمد عبدالرزاق")).toBe("محمد عبدالرزاق");
    expect(cleanColivraisonName("Ahmed Ben Ali")).toBe("Ahmed Ben Ali");
  });

  it("returns 'client' for empty names", () => {
    expect(cleanColivraisonName("")).toBe("client");
    expect(cleanColivraisonName("   ")).toBe("client");
  });
});

describe("parseLeads — colivraison tab-separated", () => {
  it("parses basic tab-separated leads", () => {
    const rawText = "عبدالرزاق طواهرية\t+2130552787506\t\t\t\t28 - M'Sila المسيلة\tTesticalm\t\t1\t3800\t\t\t\tromaissa-TT-R.04-Testicalm February2026";
    const leads = parseLeads(rawText, "colivraison");
    expect(leads.length).toBe(1);
    expect(leads[0].name).toBe("عبدالرزاق طواهرية");
    expect(leads[0].primaryPhoneNumber).toBe("0552787506");
    expect(leads[0].fullAddress).toBe("28 - M'Sila المسيلة");
    expect(leads[0].originalPrice).toBe(3800);
  });

  it("parses upsell leads with price 5800", () => {
    const rawText = "محمد أحمد\t+2130661234567\t\t\t\t16 - Alger الجزائر\tTesticalm\t\t2\t5800\t\t\t\tref-001";
    const leads = parseLeads(rawText, "colivraison");
    expect(leads.length).toBe(1);
    expect(leads[0].originalPrice).toBe(5800);
  });

  it("removes +213 prefix from phone numbers", () => {
    const rawText = "أحمد محمد\t+2130552787506\t\t\t\t28 - M'Sila المسيلة\tTesticalm\t\t1\t3800";
    const leads = parseLeads(rawText, "colivraison");
    expect(leads[0].primaryPhoneNumber).toBe("0552787506");
    expect(leads[0].primaryPhoneNumber.length).toBe(10);
  });

  it("parses multiple leads", () => {
    const rawText = [
      "Lead One\t+2130552787506\t\t\t\t28 - M'Sila\tTesticalm\t\t1\t3800\t\t\t\tref-1",
      "Lead Two\t+2130661234567\t\t\t\t16 - Alger\tTesticalm\t\t1\t3800\t\t\t\tref-2",
    ].join("\n");
    const leads = parseLeads(rawText, "colivraison");
    expect(leads.length).toBe(2);
    expect(leads[0].name).toBe("Lead One");
    expect(leads[1].name).toBe("Lead Two");
  });

  it("skips lines without phone numbers", () => {
    const rawText = [
      "No Phone Here\t\t\t\t\t28 - M'Sila\tTesticalm\t\t1\t3800",
      "Valid Lead\t+2130552787506\t\t\t\t28 - M'Sila\tTesticalm\t\t1\t3800",
    ].join("\n");
    const leads = parseLeads(rawText, "colivraison");
    expect(leads.length).toBe(1);
    expect(leads[0].name).toBe("Valid Lead");
  });

  it("extracts reference from column N (after price) — not the name column", () => {
    // This is the key bug fix: the old parser scanned backwards for 'last column with letters'
    // which grabbed the Latin name instead of the reference.
    const rawText = "Slimani abdelaziz\t+2130772310758\t\t\t\t55 - Touggourt \u062a\u0642\u0631\u062a\tTesticalm\t\t1\t3800\t\t\t\tromaissa-TT-R.001-Testicalm january 2026\t2026-02-26 18:15:43\t41.200.6.231";
    const leads = parseLeads(rawText, "colivraison");
    expect(leads.length).toBe(1);
    expect(leads[0].name).toBe("Slimani abdelaziz");
    expect(leads[0].referenceNumber).toBe("romaissa-TT-R.001-Testicalm january 2026");
    // Must NOT be the name
    expect(leads[0].referenceNumber).not.toBe("Slimani abdelaziz");
  });

  it("extracts reference for upsell leads with multi-line cells", () => {
    // Upsell leads have newlines inside cells (product, qty, reference columns)
    // The parser must flatten all tab-columns across sub-lines to find the reference.
    const rawText = "Benabderrahmane abdellatif\t+2130665091925\t\t\t\t15 - Tizi Ouzou \u062a\u064a\u0632\u064a \u0648\u0632\u0648\tTesticalm\n\u0627\u0634\u062a\u0631\u064a \u0642\u0637\u0639\u062a\u064a\u0646 \u0648 \u0648\u0641\u0631 2100 \u062f\u064a\u0646\u0627\u0631\t\t1\n1\t5800\t\t\t\tromaissa-FB-8644-Testicalm tournage fp 07 GD nv\ntesticalmupsell\t2026-02-26 18:12:53\t105.235.129.120";
    const leads = parseLeads(rawText, "colivraison");
    expect(leads.length).toBe(1);
    expect(leads[0].name).toBe("Benabderrahmane abdellatif");
    expect(leads[0].referenceNumber).toBe("romaissa-FB-8644-Testicalm tournage fp 07 GD nv");
    expect(leads[0].originalPrice).toBe(5800);
  });

  it("handles mix of normal and upsell leads together", () => {
    const rawText = [
      // Normal lead
      "\u0635\u0627\u0644\u062d\t+2130662587631\t\t\t\t03 - Laghouat \u0627\u0644\u0623\u063a\u0648\u0627\u0637\tTesticalm\t\t1\t3800\t\t\t\tSTIF-FB-8813-islam Testicalm 215-oa-comp\t2026-02-26 18:13:43\t197.119.4.196",
      // Upsell lead (multi-line)
      "Amine\t+2130773786050\t\t\t\t06 - B\u00e9ja\u00efa \u0628\u062c\u0627\u064a\u0629\tTesticalm\n\u0627\u0634\u062a\u0631\u064a \u0642\u0637\u0639\u062a\u064a\u0646 \u0648 \u0648\u0641\u0631 2100 \u062f\u064a\u0646\u0627\u0631\t\t1\n1\t5800\t\t\t\tromaissa-FB-7234-TesticalmAMS-asx791VEO+\ntesticalmupsell\t2026-02-26 18:18:41\t154.121.120.84",
    ].join("\n");
    const leads = parseLeads(rawText, "colivraison");
    expect(leads.length).toBe(2);
    // Normal lead
    expect(leads[0].referenceNumber).toBe("STIF-FB-8813-islam Testicalm 215-oa-comp");
    expect(leads[0].originalPrice).toBe(3800);
    // Upsell lead
    expect(leads[1].name).toBe("Amine");
    expect(leads[1].referenceNumber).toBe("romaissa-FB-7234-TesticalmAMS-asx791VEO+");
    expect(leads[1].originalPrice).toBe(5800);
  });

  it("extracts reference with date and IP columns after it", () => {
    const rawText = "Alilou\t+2130771081382\t\t\t\t21 - Skikda \u0633\u0643\u064a\u0643\u062f\u0629\tTesticalm\t\t1\t3800\t\t\t\tromaissa-FB-1255-TesticalmAMS-asx784+veo+\t2026-02-26 18:15:35\t105.109.225.61";
    const leads = parseLeads(rawText, "colivraison");
    expect(leads.length).toBe(1);
    expect(leads[0].referenceNumber).toBe("romaissa-FB-1255-TesticalmAMS-asx784+veo+");
    // Must not include date or IP
    expect(leads[0].referenceNumber).not.toContain("2026");
    expect(leads[0].referenceNumber).not.toContain("105.");
  });
});

describe("parseLeads — colivraison concatenated (no tabs)", () => {
  it("parses concatenated leads with references", () => {
    const rawText = `خليل+213079943452503 - Laghouat الأغواطTesticalm13800romaissa-FB-7234-testicalmAMS-asx768veo+2026-02-27 2:53:00154.255.62.79مادي برغيوة+213065985322231 - Oran وهرانTESTICALM13800maissa-FB-mk maissa testicalm 309 -sh- comp2026-02-27 2:54:19154.121.77.87`;
    const leads = parseLeads(rawText, "colivraison");
    expect(leads.length).toBe(2);
    expect(leads[0].name).toBe("خليل");
    expect(leads[0].primaryPhoneNumber).toBe("0799434525");
    expect(leads[0].fullAddress).toContain("Laghouat");
    expect(leads[0].originalPrice).toBe(3800);
    expect(leads[0].referenceNumber).toContain("romaissa-FB-7234");
    expect(leads[1].name).toBe("مادي برغيوة");
    expect(leads[1].referenceNumber).toContain("maissa-FB");
  });

  it("detects upsell price 5800 from upsell text", () => {
    const rawText = `675055198+213067505519807 - Biskra بسكرةTesticalm\nاشتري قطعتين و وفر 2100 دينار1\n15800romaissa-TT-R.06-Testicalm fabruary2026\ntesticalmupsell2026-02-27 2:56:42154.121.146.1`;
    const leads = parseLeads(rawText, "colivraison");
    expect(leads.length).toBe(1);
    expect(leads[0].originalPrice).toBe(5800);
  });

  it("keeps raw phone-number name (cleanColivraisonName converts to 'client' in toColivraisonRows)", () => {
    const rawText = `675055198+213067505519807 - Biskra بسكرةTesticalm\nاشتري قطعتين و وفر 2100 دينار1\n15800romaissa-TT-R.06-Testicalm fabruary2026\ntesticalmupsell2026-02-27 2:56:42154.121.146.1`;
    const leads = parseLeads(rawText, "colivraison");
    // Parser keeps raw name "675055198", cleanColivraisonName converts to "client" during row conversion
    expect(leads[0].name).toBe("675055198");
    // Verify cleanColivraisonName handles it
    expect(cleanColivraisonName(leads[0].name)).toBe("client");
  });

  it("removes leading digits from reference", () => {
    const rawText = `HAMZAOUI AZZEDINE+213077300983412 - Tébessa تبسةTesticalm 2213800maissa-FB-2509 - mk maissa testicalm 278 sh2026-02-27 2:57:3841.200.31.147`;
    const leads = parseLeads(rawText, "colivraison");
    expect(leads.length).toBe(1);
    expect(leads[0].referenceNumber).not.toMatch(/^\d/);
    expect(leads[0].referenceNumber).toContain("maissa-FB-2509");
  });
});

describe("toColivraisonRows", () => {
  const testicalm = COLIVRAISON_PRODUCTS[0]; // Testicalm

  it("maps basic lead to Colivraison row format", () => {
    const leads: ParsedLead[] = [{
      referenceNumber: "romaissa-TT-R.04",
      name: "محمد أحمد",
      primaryPhoneNumber: "0552787506",
      fullAddress: "28 - M'Sila المسيلة",
      rawPhone: "+2130552787506",
      originalPrice: 3800,
    }];

    const rows = toColivraisonRows(leads, testicalm);
    expect(rows.length).toBe(1);
    expect(rows[0].Nom).toBe("محمد أحمد");
    expect(rows[0].Tel1).toBe("0552787506");
    expect(rows[0].Tel2).toBe("");
    expect(rows[0].Adresse).toBe("28 - M'Sila المسيلة");
    expect(rows[0].Commune).toBe(".");
    expect(rows[0].Wilaya).toBe(".");
    expect(rows[0].Produit).toContain("testicalm");
    expect(rows[0].Variant).toBe("");
    expect(rows[0].Qte).toBe("1");
    expect(rows[0].Prix).toBe("3800");
    expect(rows[0].Remarque).toBe("");
    expect(rows[0].Ref).toBe("romaissa-TT-R.04");
    expect(rows[0].Fragile).toBe("");
    expect(rows[0].Testable).toBe("");
    expect(rows[0].SKU).toBe("");
    expect(rows[0].Weight).toBe("");
    expect(rows[0].Exchange).toBe("");
  });

  it("sets qty=2 for price 5800 (upsell)", () => {
    const leads: ParsedLead[] = [{
      referenceNumber: "ref-1",
      name: "Test",
      primaryPhoneNumber: "0552787506",
      fullAddress: "",
      rawPhone: "+2130552787506",
      originalPrice: 5800,
    }];

    const rows = toColivraisonRows(leads, testicalm);
    expect(rows[0].Qte).toBe("2");
    expect(rows[0].Prix).toBe("5800");
  });

  it("cleans phone-number names to 'client'", () => {
    const leads: ParsedLead[] = [{
      referenceNumber: "",
      name: "675055198",
      primaryPhoneNumber: "0552787506",
      fullAddress: "",
      rawPhone: "+2130552787506",
      originalPrice: 3800,
    }];

    const rows = toColivraisonRows(leads, testicalm);
    expect(rows[0].Nom).toBe("client");
  });

  it("removes digits from mixed names", () => {
    const leads: ParsedLead[] = [{
      referenceNumber: "",
      name: "mohamed055920",
      primaryPhoneNumber: "0552787506",
      fullAddress: "",
      rawPhone: "+2130552787506",
      originalPrice: 3800,
    }];

    const rows = toColivraisonRows(leads, testicalm);
    expect(rows[0].Nom).toBe("mohamed");
  });

  it("defaults qty to 1 for unknown prices", () => {
    const leads: ParsedLead[] = [{
      referenceNumber: "",
      name: "Test",
      primaryPhoneNumber: "0552787506",
      fullAddress: "",
      rawPhone: "+2130552787506",
      originalPrice: 4500, // Not in price rules
    }];

    const rows = toColivraisonRows(leads, testicalm);
    expect(rows[0].Qte).toBe("1");
  });
});
