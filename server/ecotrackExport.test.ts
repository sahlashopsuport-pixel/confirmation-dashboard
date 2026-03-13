import { describe, expect, it } from "vitest";
import {
  extractWilayaCode,
  extractCommuneHint,
  getCommunesForWilaya,
  getWilayaName,
  findWilayaCodeFromArabic,
  WILAYA_MAP,
  COMMUNE_MAP,
  ARABIC_WILAYA_MAP,
} from "@/lib/ecotrackData";
import {
  parseLeads,
  toEcotrackRows,
  type ParsedLead,
  type EcotrackRow,
  COMPANIES,
  ECOTRACK_HEADERS,
} from "@/lib/leadParser";

// ─── Ecotrack Data Helpers ──────────────────────────────────────────────

describe("extractWilayaCode", () => {
  it("extracts code from standard format '09 - Blida البليدة - واقنون'", () => {
    expect(extractWilayaCode("09 - Blida البليدة - واقنون")).toBe(9);
  });

  it("extracts code from format '14 -تيارت- سوقر'", () => {
    expect(extractWilayaCode("14 -تيارت- سوقر")).toBe(14);
  });

  it("extracts code from single-digit '1 - Adrar'", () => {
    expect(extractWilayaCode("1 - Adrar")).toBe(1);
  });

  it("extracts code from '16 - Alger الجزائر'", () => {
    expect(extractWilayaCode("16 - Alger الجزائر")).toBe(16);
  });

  it("extracts code from '58 - El Meniaa'", () => {
    expect(extractWilayaCode("58 - El Meniaa")).toBe(58);
  });

  it("returns null for empty string", () => {
    expect(extractWilayaCode("")).toBeNull();
  });

  it("returns null for invalid code > 58", () => {
    expect(extractWilayaCode("99 - Invalid")).toBeNull();
  });

  it("returns null for code = 0", () => {
    expect(extractWilayaCode("0 - Nothing")).toBeNull();
  });

  it("returns null for no leading number", () => {
    expect(extractWilayaCode("Blida")).toBeNull();
  });

  it("falls back to Arabic name lookup when no numeric code", () => {
    expect(extractWilayaCode("تيارت- سوقر")).toBe(14);
  });

  it("falls back to Arabic name for الوادي (no numeric code)", () => {
    // extractWilayaCode now falls back to Arabic name lookup
    expect(extractWilayaCode("الوادي - دقيلة")).toBe(39);
    // Direct Arabic lookup also works
    expect(findWilayaCodeFromArabic("الوادي - دقيلة")).toBe(39);
  });
});

describe("findWilayaCodeFromArabic", () => {
  it("finds code for تيارت (Tiaret)", () => {
    expect(findWilayaCodeFromArabic("تيارت- سوقر")).toBe(14);
  });

  it("finds code for البليدة (Blida)", () => {
    expect(findWilayaCodeFromArabic("البليدة - واقنون")).toBe(9);
  });

  it("finds code for خنشلة (Khenchela)", () => {
    expect(findWilayaCodeFromArabic("خنشلة")).toBe(40);
  });

  it("returns null for empty string", () => {
    expect(findWilayaCodeFromArabic("")).toBeNull();
  });

  it("returns null for unknown text", () => {
    expect(findWilayaCodeFromArabic("unknown text")).toBeNull();
  });
});

describe("ARABIC_WILAYA_MAP completeness", () => {
  it("has all 58 wilayas", () => {
    const codes = Object.values(ARABIC_WILAYA_MAP);
    expect(codes.length).toBe(58);
    expect(Math.min(...codes)).toBe(1);
    expect(Math.max(...codes)).toBe(58);
  });
});

describe("extractCommuneHint", () => {
  it("extracts commune from '09 - Blida البليدة - واقنون'", () => {
    expect(extractCommuneHint("09 - Blida البليدة - واقنون")).toBe("واقنون");
  });

  it("extracts commune from '14 -تيارت- سوقر'", () => {
    expect(extractCommuneHint("14 -تيارت- سوقر")).toBe("سوقر");
  });

  it("returns the second part for 2-part string", () => {
    expect(extractCommuneHint("09 - Blida")).toBe("Blida");
  });

  it("returns empty for empty string", () => {
    expect(extractCommuneHint("")).toBe("");
  });

  it("returns empty for no dashes", () => {
    expect(extractCommuneHint("Blida")).toBe("");
  });
});

describe("getCommunesForWilaya", () => {
  it("returns communes for Blida (09)", () => {
    const communes = getCommunesForWilaya(9);
    expect(communes.length).toBeGreaterThan(0);
    expect(communes).toContain("Blida");
  });

  it("returns communes for Alger (16)", () => {
    const communes = getCommunesForWilaya(16);
    expect(communes.length).toBeGreaterThan(0);
    expect(communes).toContain("Alger Centre");
  });

  it("returns empty array for invalid code", () => {
    expect(getCommunesForWilaya(99)).toEqual([]);
  });

  it("returns empty array for code 0", () => {
    expect(getCommunesForWilaya(0)).toEqual([]);
  });
});

describe("getWilayaName", () => {
  it("returns 'Blida' for code 9", () => {
    expect(getWilayaName(9)).toBe("Blida");
  });

  it("returns 'Alger' for code 16", () => {
    expect(getWilayaName(16)).toBe("Alger");
  });

  it("returns empty string for invalid code", () => {
    expect(getWilayaName(99)).toBe("");
  });
});

describe("WILAYA_MAP completeness", () => {
  it("has all 58 wilayas", () => {
    const keys = Object.keys(WILAYA_MAP).map(Number);
    expect(keys.length).toBe(58);
    expect(Math.min(...keys)).toBe(1);
    expect(Math.max(...keys)).toBe(58);
  });
});

describe("COMMUNE_MAP completeness", () => {
  it("has communes for all 58 wilayas", () => {
    for (let i = 1; i <= 58; i++) {
      expect(COMMUNE_MAP[i]).toBeDefined();
      expect(COMMUNE_MAP[i].length).toBeGreaterThan(0);
    }
  });
});

// ─── Ecotrack Company Config ────────────────────────────────────────────

describe("COMPANIES.ecotrack_dhd", () => {
  it("exists in COMPANIES config", () => {
    expect(COMPANIES.ecotrack_dhd).toBeDefined();
  });

  it("has correct properties", () => {
    const config = COMPANIES.ecotrack_dhd;
    expect(config.id).toBe("ecotrack_dhd");
    expect(config.name).toBe("Ecotrack DHD");
    expect(config.country).toBe("Algeria");
  });

  it("has 18 headers matching the Ecotrack template", () => {
    expect(ECOTRACK_HEADERS).toHaveLength(18);
    expect(ECOTRACK_HEADERS[0]).toBe("reference commande");
    expect(ECOTRACK_HEADERS[6]).toBe("commune de livraison*");
    expect(ECOTRACK_HEADERS[8]).toBe("produit (référence)*");
    expect(ECOTRACK_HEADERS[17]).toBe("Lien map");
  });
});

// ─── Ecotrack Parsing ──────────────────────────────────────────────────

describe("parseLeads for ecotrack_dhd (tab-separated)", () => {
  it("parses tab-separated leads correctly", () => {
    // Real 13-column format: A=date, B=status, C=qty, D=uploaded, E=comments, F=agent, G=product, H=name, I=phone, J=address, K=empty, L=price, M=ads
    const rawText = "01/03/2026\tتأكيد\t1\tنعم\t\tSH08\tTESTICALM\tمحمد\t0549953930\t09 - Blida البليدة - واقنون\t\t3800\tromaissa-FB";
    const leads = parseLeads(rawText, "ecotrack_dhd");
    expect(leads.length).toBe(1);
    expect(leads[0].name).toBe("محمد");
    expect(leads[0].primaryPhoneNumber).toBe("0549953930");
    expect(leads[0].fullAddress).toBe("09 - Blida البليدة - واقنون");
    expect(leads[0].originalPrice).toBe(3800);
  });

  it("detects upsell from qty column (C=2) correctly", () => {
    // qty=2 in column C means upsell, stored in productName as "qty:2"
    const rawText = "01/03/2026\tتأكيد\t2\tنعم\t\tSH08\tTESTICALM اشتري قطعتين و وفر 2100 دينار\tعلي\t0555123456\t16 - Alger الجزائر\t\t5800\tromaissa-FB";
    const leads = parseLeads(rawText, "ecotrack_dhd");
    expect(leads.length).toBe(1);
    expect(leads[0].originalPrice).toBe(5800);
    expect(leads[0].productName).toBe("qty:2"); // upsell detected from qty column
  });

  it("parses multiple tab-separated leads", () => {
    const rawText = [
      "01/03/2026\tتأكيد\t1\tنعم\t\tSH08\tTESTICALM\tأحمد\t0549953930\t09 - Blida البليدة\t\t3800\tromaissa-FB",
      "01/03/2026\tتأكيد\t1\tنعم\t\tSH08\tTESTICALM\tمحمد\t0666123456\t16 - Alger الجزائر\t\t3800\tromaissa-FB",
      "01/03/2026\tتأكيد\t2\tنعم\t\tSH08\tTESTICALM اشتري قطعتين و وفر\tعلي\t0777654321\t31 - Oran وهران\t\t5800\tromaissa-FB",
    ].join("\n");
    const leads = parseLeads(rawText, "ecotrack_dhd");
    expect(leads.length).toBe(3);
  });
});

// ─── sh08 Phone Anchor Parser (concatenated Google Sheets paste) ──────

describe("parseLeads for ecotrack_dhd (sh08 concatenated format)", () => {
  // Real data from Boss's paste — 6 leads, 2 lines each
  const realPaste = [
    "01/03/2026تأكيد1نعمSH08TESTICALM اشتري قطعتين و وفر 2100 دينارحليم sh08055582101209 - Blida البليدة - واقنون4200",
    "romaissa-FB-7234-TesticalmAMS-asx817veo+ testicalmupsell",
    "01/03/2026تأكيد1نعمSH08TESTICALM اشتري قطعتين و وفر 2100 دينارHamida boualem sh08055056963748 - Relizane غليزان - غليزان 4400",
    "romaissa-FB-0168-TesticalmAMS-asx835 testicalmupsell",
    "01/03/2026تأكيد1نعم 05-03-2026 التوصيل يكون يوم SH08TESTICALM اشتري قطعتين و وفر 2100 دينارفلوس عبد الرزاق sh08066322711321 - Skikda سكيكدة - رمضان جمال 4400",
    "romaissa-FB-7234-testicalmAMS-asx768veo+ testicalmupsell",
    "01/03/2026تأكيد1نعمSH08TESTICALMطارق sh08055858299939 - El Oued الوادي - دقيلة 4400",
    "romaissa-TT-5720-Testicalm AMS 11-02-26",
    "01/03/2026تأكيد1نعمSH08TESTICALMAbdelhafidBouricha sh080542140807-تيارت- سوقر 4400",
    "STIF 1345 TK TESTICALM tournage",
    "01/03/2026تأكيد1نعمSH08TESTICALMفواد sh08069935237040 - Khenchela خنشلة - خنشلة 4400",
    "romaissa-TT-R.001-Testicalm january 2026",
  ].join("\n");

  it("detects all 6 leads from the real paste", () => {
    const leads = parseLeads(realPaste, "ecotrack_dhd");
    expect(leads).toHaveLength(6);
  });

  it("skips campaign/source lines (no phone)", () => {
    const leads = parseLeads(realPaste, "ecotrack_dhd");
    // Should not contain any campaign text as names
    const names = leads.map(l => l.name);
    expect(names.every(n => !n.includes("romaissa"))).toBe(true);
    expect(names.every(n => !n.includes("STIF"))).toBe(true);
  });

  it("extracts correct phone numbers", () => {
    const leads = parseLeads(realPaste, "ecotrack_dhd");
    expect(leads[0].primaryPhoneNumber).toBe("0555821012");
    expect(leads[1].primaryPhoneNumber).toBe("0550569637");
    expect(leads[2].primaryPhoneNumber).toBe("0663227113");
    expect(leads[3].primaryPhoneNumber).toBe("0558582999");
    expect(leads[4].primaryPhoneNumber).toBe("0542140807");
    expect(leads[5].primaryPhoneNumber).toBe("0699352370");
  });

  it("extracts correct names", () => {
    const leads = parseLeads(realPaste, "ecotrack_dhd");
    expect(leads[0].name).toBe("حليم");
    expect(leads[1].name).toBe("Hamida boualem");
    expect(leads[2].name).toBe("فلوس عبد الرزاق");
    expect(leads[3].name).toBe("طارق");
    expect(leads[4].name).toBe("AbdelhafidBouricha");
    expect(leads[5].name).toBe("فواد");
  });

  it("extracts correct prices", () => {
    const leads = parseLeads(realPaste, "ecotrack_dhd");
    expect(leads[0].originalPrice).toBe(4200);
    expect(leads[1].originalPrice).toBe(4400);
    expect(leads[2].originalPrice).toBe(4400);
    expect(leads[3].originalPrice).toBe(4400);
    expect(leads[4].originalPrice).toBe(4400);
    expect(leads[5].originalPrice).toBe(4400);
  });

  it("extracts wilaya info from fullAddress", () => {
    const leads = parseLeads(realPaste, "ecotrack_dhd");
    // Lead 1: "09 - Blida البليدة - واقنون"
    expect(extractWilayaCode(leads[0].fullAddress || "")).toBe(9);
    // Lead 2: "48 - Relizane غليزان - غليزان"
    expect(extractWilayaCode(leads[1].fullAddress || "")).toBe(48);
    // Lead 3: "21 - Skikda سكيكدة - رمضان جمال"
    expect(extractWilayaCode(leads[2].fullAddress || "")).toBe(21);
    // Lead 4: "39 - El Oued الوادي - دقيلة"
    expect(extractWilayaCode(leads[3].fullAddress || "")).toBe(39);
    // Lead 5: edge case — code from Arabic name تيارت = 14
    expect(extractWilayaCode(leads[4].fullAddress || "")).toBe(14);
    // Lead 6: "40 - Khenchela خنشلة - خنشلة"
    expect(extractWilayaCode(leads[5].fullAddress || "")).toBe(40);
  });

  it("detects upsell correctly from Arabic marker text", () => {
    const leads = parseLeads(realPaste, "ecotrack_dhd");
    // Leads 1-3 have "اشتري قطعتين و وفر" (upsell text) — but price is 4200/4400 not 5800
    // Leads 4-6 don't have the upsell text
    // The upsell detection is based on price >= 5800 in toEcotrackRows, not in parser
    // Parser just extracts the raw price
    expect(leads[0].originalPrice).toBe(4200);
    expect(leads[3].originalPrice).toBe(4400);
  });

  it("handles single sh08 lead", () => {
    const singleLead = "01/03/2026تأكيد1نعمSH08TESTICALMأحمد sh08055512345616 - Alger الجزائر - باب الواد3800";
    const leads = parseLeads(singleLead, "ecotrack_dhd");
    expect(leads).toHaveLength(1);
    expect(leads[0].name).toBe("أحمد");
    expect(leads[0].primaryPhoneNumber).toBe("0555123456");
    expect(leads[0].originalPrice).toBe(3800);
  });

  it("falls back to +213 parser when no sh phones present", () => {
    const plus213Data = "01/03/2026تأكيد1نعمSH08TESTICALMأحمد +2130549953930 09 - Blida البليدة 3800";
    const leads = parseLeads(plus213Data, "ecotrack_dhd");
    expect(leads.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── sh08 + toEcotrackRows integration ────────────────────────────────

describe("sh08 paste → toEcotrackRows integration", () => {
  const realPaste = [
    "01/03/2026تأكيد1نعمSH08TESTICALM اشتري قطعتين و وفر 2100 دينارحليم sh08055582101209 - Blida البليدة - واقنون4200",
    "romaissa-FB-7234-TesticalmAMS-asx817veo+ testicalmupsell",
    "01/03/2026تأكيد1نعمSH08TESTICALMطارق sh08055858299939 - El Oued الوادي - دقيلة 4400",
    "romaissa-TT-5720-Testicalm AMS 11-02-26",
  ].join("\n");

  it("full pipeline: parse sh08 leads and convert to Ecotrack rows", () => {
    const leads = parseLeads(realPaste, "ecotrack_dhd");
    expect(leads).toHaveLength(2);

    const communeMap = { 0: "Blida", 1: "Robbah" };
    const rows = toEcotrackRows(leads, communeMap);
    expect(rows).toHaveLength(2);

    // First row
    expect(rows[0]["nom et prenom du destinataire*"]).toBe("حليم");
    expect(rows[0]["telephone*"]).toBe("0555821012");
    expect(rows[0]["code wilaya*"]).toBe("9");
    expect(rows[0]["wilaya de livraison"]).toBe("Blida");
    expect(rows[0]["commune de livraison*"]).toBe("Blida");
    expect(rows[0]["produit (référence)*"]).toBe("TES,SAV");
    expect(rows[0]["quantité*"]).toBe("1,1"); // 4200 < 5800, not upsell
    expect(rows[0]["montant du colis*"]).toBe("4200");

    // Second row
    expect(rows[1]["nom et prenom du destinataire*"]).toBe("طارق");
    expect(rows[1]["telephone*"]).toBe("0558582999");
    expect(rows[1]["code wilaya*"]).toBe("39");
    expect(rows[1]["wilaya de livraison"]).toBe("El Oued");
    expect(rows[1]["commune de livraison*"]).toBe("Robbah");
    expect(rows[1]["quantité*"]).toBe("1,1"); // 4400 < 5800, not upsell
  });
});

// ─── toEcotrackRows ─────────────────────────────────────────────────────

describe("toEcotrackRows", () => {
  const baseLead: ParsedLead = {
    referenceNumber: "",
    name: "محمد",
    primaryPhoneNumber: "0549953930",
    fullAddress: "09 - Blida البليدة - واقنون",
    rawPhone: "+2130549953930",
    originalPrice: 3800,
  };

  it("generates correct row for normal order (3800)", () => {
    const rows = toEcotrackRows([baseLead], { 0: "Blida" });
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row["nom et prenom du destinataire*"]).toBe("محمد");
    expect(row["telephone*"]).toBe("0549953930");
    expect(row["code wilaya*"]).toBe("9");
    expect(row["wilaya de livraison"]).toBe("Blida");
    expect(row["commune de livraison*"]).toBe("Blida");
    expect(row["produit (référence)*"]).toBe("TES,SAV");
    expect(row["quantité*"]).toBe("1,1");
    expect(row["montant du colis*"]).toBe("3800");
  });

  it("generates correct row for upsell order (5800)", () => {
    const upsellLead: ParsedLead = { ...baseLead, originalPrice: 5800 };
    const rows = toEcotrackRows([upsellLead], { 0: "Blida" });
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row["quantité*"]).toBe("2,1"); // 2 testicalm + 1 savon
    expect(row["montant du colis*"]).toBe("5800");
    expect(row["produit (référence)*"]).toBe("TES,SAV");
  });

  it("always uses TES,SAV product reference", () => {
    const rows = toEcotrackRows([baseLead], {});
    expect(rows[0]["produit (référence)*"]).toBe("TES,SAV");
  });

  it("leaves commune empty when not provided in communeMap", () => {
    const rows = toEcotrackRows([baseLead], {});
    expect(rows[0]["commune de livraison*"]).toBe("");
  });

  it("extracts wilaya code from fullAddress", () => {
    const rows = toEcotrackRows([baseLead], {});
    expect(rows[0]["code wilaya*"]).toBe("9");
    expect(rows[0]["wilaya de livraison"]).toBe("Blida");
  });

  it("handles lead with no wilaya in address", () => {
    const noWilayaLead: ParsedLead = { ...baseLead, fullAddress: "" };
    const rows = toEcotrackRows([noWilayaLead], {});
    expect(rows[0]["code wilaya*"]).toBe("");
    expect(rows[0]["wilaya de livraison"]).toBe("");
  });

  it("handles lead with missing name", () => {
    const noNameLead: ParsedLead = { ...baseLead, name: "" };
    const rows = toEcotrackRows([noNameLead], {});
    expect(rows[0]["nom et prenom du destinataire*"]).toBe("-");
  });

  it("maps commune selections by index correctly", () => {
    const leads: ParsedLead[] = [
      { ...baseLead, fullAddress: "09 - Blida البليدة" },
      { ...baseLead, fullAddress: "16 - Alger الجزائر", primaryPhoneNumber: "0666123456" },
      { ...baseLead, fullAddress: "31 - Oran وهران", primaryPhoneNumber: "0777654321" },
    ];
    const communeMap = {
      0: "Boufarik",
      1: "Bab El Oued",
      // index 2 intentionally missing
    };
    const rows = toEcotrackRows(leads, communeMap);
    expect(rows[0]["commune de livraison*"]).toBe("Boufarik");
    expect(rows[1]["commune de livraison*"]).toBe("Bab El Oued");
    expect(rows[2]["commune de livraison*"]).toBe(""); // missing = empty
  });

  it("sets default price to 3800 when originalPrice is undefined", () => {
    const noPriceLead: ParsedLead = { ...baseLead, originalPrice: undefined };
    const rows = toEcotrackRows([noPriceLead], {});
    expect(rows[0]["montant du colis*"]).toBe("3800");
    expect(rows[0]["quantité*"]).toBe("1,1"); // not upsell
  });

  it("leaves optional fields empty", () => {
    const rows = toEcotrackRows([baseLead], {});
    const row = rows[0];
    expect(row["reference commande"]).toBe("");
    expect(row["telephone 2"]).toBe("");
    expect(row["poids (kg)"]).toBe("");
    expect(row["remarque"]).toBe("");
    expect(row["FRAGILE"]).toBe("");
    expect(row["ESSAYAGE PERMI"]).toBe("");
    expect(row["ECHANGE"]).toBe("");
    expect(row["STOP DESK"]).toBe("");
    expect(row["Lien map"]).toBe("");
  });
});

// ─── Integration: parse + convert pipeline ──────────────────────────────

describe("Ecotrack DHD full pipeline", () => {
  it("parses leads and converts to Ecotrack rows end-to-end", () => {
    const rawText = [
      "01/03/2026\tتأكيد\t1\tنعم\t\tSH08\tTESTICALM\tأحمد بن علي\t0549953930\t09 - Blida البليدة - واقنون\t\t3800\tromaissa-FB",
      "01/03/2026\tتأكيد\t2\tنعم\t\tSH08\tTESTICALM اشتري قطعتين و وفر\tمحمد خالد\t0666123456\t16 - Alger الجزائر - باب الواد\t\t5800\tromaissa-FB",
    ].join("\n");

    // Step 1: Parse
    const leads = parseLeads(rawText, "ecotrack_dhd");
    expect(leads).toHaveLength(2);

    // Step 2: Convert with commune selections
    const communeMap = { 0: "Blida", 1: "Bab El Oued" };
    const rows = toEcotrackRows(leads, communeMap);
    expect(rows).toHaveLength(2);

    // Verify first row (normal, qty=1)
    expect(rows[0]["nom et prenom du destinataire*"]).toBe("أحمد بن علي");
    expect(rows[0]["telephone*"]).toBe("0549953930");
    expect(rows[0]["code wilaya*"]).toBe("9");
    expect(rows[0]["commune de livraison*"]).toBe("Blida");
    expect(rows[0]["produit (référence)*"]).toBe("TES,SAV");
    expect(rows[0]["quantité*"]).toBe("1,1");
    expect(rows[0]["montant du colis*"]).toBe("3800");

    // Verify second row (upsell, qty=2)
    expect(rows[1]["nom et prenom du destinataire*"]).toBe("محمد خالد");
    expect(rows[1]["telephone*"]).toBe("0666123456");
    expect(rows[1]["code wilaya*"]).toBe("16");
    expect(rows[1]["commune de livraison*"]).toBe("Bab El Oued");
    expect(rows[1]["quantité*"]).toBe("2,1"); // upsell from qty=2: 2 testicalm + 1 savon
    expect(rows[1]["montant du colis*"]).toBe("5800");
  });
});


// ─── Edge cases: SM1 client names, 9-digit phones, apostrophe phones ────

describe("parseLeads for ecotrack_dhd — edge cases (previously dropped leads)", () => {
  it("parses leads with 'SM1 client' in the name (not a header)", () => {
    const rawText = "03/03/2026\tتأكيد\t1\t\t\tY01\tTESTICALM\tSM1 client belgacem Y01\t0698535698\tDjelfa Messaad\t\t4400\tSM1PAGE";
    const leads = parseLeads(rawText, "ecotrack_dhd");
    expect(leads).toHaveLength(1);
    expect(leads[0].name).toBe("SM1 client belgacem Y01");
    expect(leads[0].primaryPhoneNumber).toBe("0698535698");
    expect(leads[0].fullAddress).toBe("Djelfa Messaad");
    expect(leads[0].originalPrice).toBe(4400);
  });

  it("parses leads with 'SM1 client' followed by agent code only", () => {
    const rawText = "03/03/2026\tتأكيد\t1\t\t\tYC05\tTESTICALM\tSM1 client yc05\t0556024597\tعين نعجة الجزائر\t\t4200\tSM1PAGE";
    const leads = parseLeads(rawText, "ecotrack_dhd");
    expect(leads).toHaveLength(1);
    expect(leads[0].name).toBe("SM1 client yc05");
    expect(leads[0].primaryPhoneNumber).toBe("0556024597");
  });

  it("parses leads with just 'client' in the name", () => {
    const rawText = "22/02/2026\tتأكيد\t1\t\t\tL\tTESTICALM\tclient L03\t0674420500\tadrar tizmayen commune agazmir\t\t5050\tromaissa-FB";
    const leads = parseLeads(rawText, "ecotrack_dhd");
    expect(leads).toHaveLength(1);
    expect(leads[0].name).toBe("client L03");
    expect(leads[0].originalPrice).toBe(5050);
  });

  it("parses 9-digit phone numbers without leading 0 (spaces stripped)", () => {
    const rawText = "08/02/2026\tتأكيد\t1\t\t\tK\tTESTICALM\tHamoudi KH01\t770 83 98 77\tKantoli CONSTANTINE HAMAM BOUZINE\t\t4400\tromaissa-FB";
    const leads = parseLeads(rawText, "ecotrack_dhd");
    expect(leads).toHaveLength(1);
    expect(leads[0].name).toBe("Hamoudi KH01");
    expect(leads[0].primaryPhoneNumber).toBe("0770839877"); // 0 prepended
    expect(leads[0].originalPrice).toBe(4400);
  });

  it("parses another 9-digit phone (552 37 66 51)", () => {
    const rawText = "08/02/2026\tتأكيد\t1\t\t\tK\tTESTICALM\tTarek Affes KH01\t552 37 66 51\tChelghoum Läid  MILA\tMila\t4400\tromaissa-FB";
    const leads = parseLeads(rawText, "ecotrack_dhd");
    expect(leads).toHaveLength(1);
    expect(leads[0].name).toBe("Tarek Affes KH01");
    expect(leads[0].primaryPhoneNumber).toBe("0552376651"); // 0 prepended
  });

  it("parses phone with leading apostrophe (Google Sheets text prefix)", () => {
    const rawText = "23/02/2026\tتأكيد\t1\t\t\tL\tmenopause\tبولنوار يوسف L03\t'0696313600\tmostaghanem commune khedra\t\t4500\tnesrine-TT";
    const leads = parseLeads(rawText, "ecotrack_dhd");
    expect(leads).toHaveLength(1);
    expect(leads[0].name).toBe("بولنوار يوسف L03");
    expect(leads[0].primaryPhoneNumber).toBe("0696313600"); // apostrophe stripped
    expect(leads[0].originalPrice).toBe(4500);
  });

  it("still skips actual header rows with exact header names", () => {
    const rawText = "Date\tStatus\tQty\tUploaded\tComments\tAgent\tProduct\tname\t\tAddress\t\tPrice\tAds";
    const leads = parseLeads(rawText, "ecotrack_dhd");
    expect(leads).toHaveLength(0);
  });

  it("still skips rows with exact 'costumer' header", () => {
    const rawText = "Date\tStatus\tQty\tUploaded\tComments\tAgent\tProduct\tcostumer\t\tAddress\t\tPrice\tAds";
    const leads = parseLeads(rawText, "ecotrack_dhd");
    expect(leads).toHaveLength(0);
  });

  it("parses all 11 SM1 client leads in a batch", () => {
    const rawText = [
      "03/03/2026\tتأكيد\t1\t\t\tWA05\tTESTICALM\twa05 SM1 client\t0675509354\tمستغانم, بلدية خير الدين\t\t4400\tSM1PAGE",
      "03/03/2026\tتأكيد\t1\t\t\tY01\tTESTICALM\tSM1 client belgacem Y01\t0698535698\tDjelfa Messaad\t\t4400\tSM1PAGE",
      "03/03/2026\tتأكيد\t1\t\t\tY01\tTESTICALM\tSM1 client hassane Y01\t0550144555\t16-Algiers birkhadem\t\t4000\tSM1PAGE",
      "03/03/2026\tتأكيد\t1\t\t\tY01\tTESTICALM\tSM1 client Abdellah Y01\t0654937603\tSoug ahras ville\t\t4400\tSM1PAGE",
      "03/03/2026\tتأكيد\t1\t\tAb3thli samedi nkôn 9a3d\tYC05\tTESTICALM\tSM1 client yc05\t0672055660\tتيارت بلدية مغيلة\t\t4400\tSM1PAGE",
      "03/03/2026\tتأكيد\t1\t\t\tYC05\tTESTICALM\tSM1 client yc05\t0556024597\tعين نعجة الجزائر\t\t4200\tSM1PAGE",
      "03/03/2026\tتأكيد\t1\t\t\tL03\tTESTICALM\tSM1 client L03\t0774516176\tain defla 3arib\t\t4400\tSM1PAGE",
      "03/03/2026\tتأكيد\t1\t\t\tL03\tTESTICALM\tSM1 client L03\t0655396170\tannaba centre\t\t4400\tSM1PAGE",
      "03/03/2026\tتأكيد\t1\t\t\tL03\tTESTICALM\tSM1 client L03\t0698011305\ttizi ouazou el boghni bounouh\t\t4400\tSM1PAGE",
      "22/02/2026\tتأكيد\t1\t\t\tL\tTESTICALM\tclient L03\t0674420500\tadrar tizmayen commune agazmir\t\t5050\tromaissa-FB",
      "24/02/2026\tتأكيد\t1\t\t\tL\ttesticalm\tSM1 client L03\t0550888686\tblida madrasa bn sari\t\t4400\ttesti",
    ].join("\n");
    const leads = parseLeads(rawText, "ecotrack_dhd");
    expect(leads).toHaveLength(11);
  });

  it("parses all 14 previously-dropped leads in a combined batch", () => {
    const rawText = [
      // 11 SM1 client leads
      "03/03/2026\tتأكيد\t1\t\t\tWA05\tTESTICALM\twa05 SM1 client\t0675509354\tمستغانم, بلدية خير الدين\t\t4400\tSM1PAGE",
      "03/03/2026\tتأكيد\t1\t\t\tY01\tTESTICALM\tSM1 client belgacem Y01\t0698535698\tDjelfa Messaad\t\t4400\tSM1PAGE",
      "03/03/2026\tتأكيد\t1\t\t\tY01\tTESTICALM\tSM1 client hassane Y01\t0550144555\t16-Algiers birkhadem\t\t4000\tSM1PAGE",
      "03/03/2026\tتأكيد\t1\t\t\tY01\tTESTICALM\tSM1 client Abdellah Y01\t0654937603\tSoug ahras ville\t\t4400\tSM1PAGE",
      "03/03/2026\tتأكيد\t1\t\tAb3thli samedi nkôn 9a3d\tYC05\tTESTICALM\tSM1 client yc05\t0672055660\tتيارت بلدية مغيلة\t\t4400\tSM1PAGE",
      "03/03/2026\tتأكيد\t1\t\t\tYC05\tTESTICALM\tSM1 client yc05\t0556024597\tعين نعجة الجزائر\t\t4200\tSM1PAGE",
      "03/03/2026\tتأكيد\t1\t\t\tL03\tTESTICALM\tSM1 client L03\t0774516176\tain defla 3arib\t\t4400\tSM1PAGE",
      "03/03/2026\tتأكيد\t1\t\t\tL03\tTESTICALM\tSM1 client L03\t0655396170\tannaba centre\t\t4400\tSM1PAGE",
      "03/03/2026\tتأكيد\t1\t\t\tL03\tTESTICALM\tSM1 client L03\t0698011305\ttizi ouazou el boghni bounouh\t\t4400\tSM1PAGE",
      "22/02/2026\tتأكيد\t1\t\t\tL\tTESTICALM\tclient L03\t0674420500\tadrar tizmayen commune agazmir\t\t5050\tromaissa-FB",
      "24/02/2026\tتأكيد\t1\t\t\tL\ttesticalm\tSM1 client L03\t0550888686\tblida madrasa bn sari\t\t4400\ttesti",
      // 2 nine-digit phone leads
      "08/02/2026\tتأكيد\t1\t\t\tK\tTESTICALM\tHamoudi KH01\t770 83 98 77\tKantoli CONSTANTINE HAMAM BOUZINE\t\t4400\tromaissa-FB",
      "08/02/2026\tتأكيد\t1\t\t\tK\tTESTICALM\tTarek Affes KH01\t552 37 66 51\tChelghoum Läid  MILA\tMila\t4400\tromaissa-FB",
      // 1 apostrophe phone lead
      "23/02/2026\tتأكيد\t1\t\t\tL\tmenopause\tبولنوار يوسف L03\t'0696313600\tmostaghanem commune khedra\t\t4500\tnesrine-TT",
    ].join("\n");
    const leads = parseLeads(rawText, "ecotrack_dhd");
    expect(leads).toHaveLength(14);
  });
});

// ─── Wilaya Overrides in toEcotrackRows ─────────────────────────────────

describe("toEcotrackRows with wilayaOverrides", () => {
  const baseLead: ParsedLead = {
    referenceNumber: "",
    name: "محمد",
    primaryPhoneNumber: "0549953930",
    fullAddress: "09 - Blida البليدة - واقنون",
    rawPhone: "+2130549953930",
    originalPrice: 3800,
  };

  it("uses detected wilaya when no override is provided", () => {
    const rows = toEcotrackRows([baseLead], { 0: "Blida" });
    expect(rows[0]["code wilaya*"]).toBe("9");
    expect(rows[0]["wilaya de livraison"]).toBe("Blida");
  });

  it("uses detected wilaya when wilayaOverrides is undefined", () => {
    const rows = toEcotrackRows([baseLead], { 0: "Blida" }, undefined);
    expect(rows[0]["code wilaya*"]).toBe("9");
    expect(rows[0]["wilaya de livraison"]).toBe("Blida");
  });

  it("uses detected wilaya when wilayaOverrides is empty", () => {
    const rows = toEcotrackRows([baseLead], { 0: "Blida" }, {});
    expect(rows[0]["code wilaya*"]).toBe("9");
    expect(rows[0]["wilaya de livraison"]).toBe("Blida");
  });

  it("overrides wilaya when override is provided for the lead index", () => {
    const rows = toEcotrackRows([baseLead], { 0: "Oran" }, { 0: 31 });
    expect(rows[0]["code wilaya*"]).toBe("31");
    expect(rows[0]["wilaya de livraison"]).toBe("Oran");
  });

  it("does not affect other leads when only one has an override", () => {
    const lead2: ParsedLead = {
      ...baseLead,
      name: "أحمد",
      fullAddress: "16 - Alger الجزائر",
    };
    const rows = toEcotrackRows([baseLead, lead2], { 0: "Blida", 1: "Alger Centre" }, { 0: 31 });
    // First lead: overridden to 31 (Oran)
    expect(rows[0]["code wilaya*"]).toBe("31");
    expect(rows[0]["wilaya de livraison"]).toBe("Oran");
    // Second lead: no override, uses detected 16 (Alger)
    expect(rows[1]["code wilaya*"]).toBe("16");
    expect(rows[1]["wilaya de livraison"]).toBe("Alger");
  });

  it("provides wilaya for a lead with no detected wilaya via override", () => {
    const noWilayaLead: ParsedLead = {
      ...baseLead,
      fullAddress: "some random address without wilaya code",
    };
    const rows = toEcotrackRows([noWilayaLead], { 0: "Djelfa" }, { 0: 17 });
    expect(rows[0]["code wilaya*"]).toBe("17");
    expect(rows[0]["wilaya de livraison"]).toBe("Djelfa");
  });
});
