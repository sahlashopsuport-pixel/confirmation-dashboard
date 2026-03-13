import { describe, expect, it } from "vitest";
import {
  parseLeads,
  toSellmaxRows,
  toEcomamanagerRows,
  COMPANIES,
  type ParsedLead,
} from "../client/src/lib/leadParser";

// ===== SELLMAX (Tunisia) =====

describe("parseLeads — Sellmax (Tunisia)", () => {
  it("parses a single tab-separated Shopify row", () => {
    const raw = "#2233\t2026-01-18T14:41:21+01:00\tمحمد عبار\t21623636097\tقابس غنواش\ttesticalm\t179";
    const leads = parseLeads(raw, "sellmax");
    expect(leads).toHaveLength(1);
    expect(leads[0].referenceNumber).toBe("#2233");
    expect(leads[0].name).toBe("محمد عبار");
    expect(leads[0].primaryPhoneNumber).toBe("23636097"); // 216 removed, 8 digits
    expect(leads[0].fullAddress).toBe("قابس غنواش");
    expect(leads[0].productName).toBe("testicalm");
  });

  it("captures Prostacalm product name from column 6", () => {
    const raw = "#6075\t2026-03-01 21:01:22\tفتحي العربي شاوش\t+21655046990\tالبقالطة المنستير\tProstacalm\t1\t79";
    const leads = parseLeads(raw, "sellmax");
    expect(leads).toHaveLength(1);
    expect(leads[0].productName).toBe("Prostacalm");
    expect(leads[0].referenceNumber).toBe("#6075");
  });

  it("captures testicalm product name from column 6 (case insensitive)", () => {
    const raw = "#6042\t2026-03-01 0:02:35\tحامد\t+21623617836\tتونس اريانة\tTESTICALM\t1\t79";
    const leads = parseLeads(raw, "sellmax");
    expect(leads).toHaveLength(1);
    expect(leads[0].productName).toBe("TESTICALM");
  });

  it("parses mixed Testicalm and Prostacalm batch", () => {
    const raw = [
      "#6040\t2026-02-28 23:15:00\tعلي العسيلي\t+21692186887\tالقصرين\ttesticalm\t1\t79",
      "#6075\t2026-03-01 21:01:22\tفتحي\t+21655046990\tالمنستير\tProstacalm\t1\t79",
      "#6078\t2026-03-01 22:17:31\tقيس رشيد\t+21622286710\tالمهدية\ttesticalm\t1\t79",
      "#6080\t2026-03-01 22:34:10\tمحمد على\t+21698524119\tاريانة\tProstacalm\t1\t79",
    ].join("\n");
    const leads = parseLeads(raw, "sellmax");
    expect(leads).toHaveLength(4);
    expect(leads[0].productName).toBe("testicalm");
    expect(leads[1].productName).toBe("Prostacalm");
    expect(leads[2].productName).toBe("testicalm");
    expect(leads[3].productName).toBe("Prostacalm");
  });

  it("parses multiple Sellmax rows", () => {
    const raw = [
      "#1001\t2026-01-10\tAli Ben\t21650123456\tTunis\ttesticalm\t87",
      "#1002\t2026-01-11\tFatma\t21698765432\tSfax\ttesticalm\t87",
    ].join("\n");
    const leads = parseLeads(raw, "sellmax");
    expect(leads).toHaveLength(2);
    expect(leads[0].name).toBe("Ali Ben");
    expect(leads[1].name).toBe("Fatma");
  });

  it("removes 216 prefix from Tunisian phone numbers", () => {
    const raw = "#1003\t2026-01-12\tTest\t+21650123456\tTunis\ttesticalm\t87";
    const leads = parseLeads(raw, "sellmax");
    expect(leads).toHaveLength(1);
    expect(leads[0].primaryPhoneNumber).toBe("50123456");
    expect(leads[0].primaryPhoneNumber).toHaveLength(8);
  });

  it("skips header rows", () => {
    const raw = [
      "Order Number\tDate\tName\tPhone\tAddress",
      "#1004\t2026-01-12\tTest\t21650123456\tTunis\ttesticalm\t87",
    ].join("\n");
    const leads = parseLeads(raw, "sellmax");
    expect(leads).toHaveLength(1);
    expect(leads[0].referenceNumber).toBe("#1004");
  });

  it("skips lines without # prefix", () => {
    const raw = "1005\t2026-01-12\tTest\t21650123456\tTunis\ttesticalm\t87";
    const leads = parseLeads(raw, "sellmax");
    expect(leads).toHaveLength(0);
  });

  it("skips lines with fewer than 5 tab-separated parts", () => {
    const raw = "#1006\t2026-01-12\tTest";
    const leads = parseLeads(raw, "sellmax");
    expect(leads).toHaveLength(0);
  });

  it("captures ad source from column 9 (index 8)", () => {
    const raw = "#6924\t2026-03-07 13:44:03\tرشيد اليحياوي\t+21623868301\tتونس\tProstacalm\t1\t79\tromaissa-FB-1192-Aissani prostacalm TN 03-OA\t102.107.136.143\tNORMAL";
    const leads = parseLeads(raw, "sellmax");
    expect(leads).toHaveLength(1);
    expect(leads[0].adSource).toBe("romaissa-FB-1192-Aissani prostacalm TN 03-OA");
    expect(leads[0].productName).toBe("Prostacalm");
    expect(leads[0].referenceNumber).toBe("#6924");
  });

  it("captures ad source for testicalm leads", () => {
    const raw = "#6925\t2026-03-07 13:44:15\tطاهر\t+21629746107\tتونس\ttesticalm\t1\t79\tromaissa-FB-1192-Aissani Testicalm TN 61-oa-comp\t154.108.89.143\tNORMAL";
    const leads = parseLeads(raw, "sellmax");
    expect(leads).toHaveLength(1);
    expect(leads[0].adSource).toBe("romaissa-FB-1192-Aissani Testicalm TN 61-oa-comp");
    expect(leads[0].productName).toBe("testicalm");
  });

  it("handles rows without ad source column (older format)", () => {
    const raw = "#2233\t2026-01-18T14:41:21+01:00\tمحمد عبار\t21623636097\tقابس غنواش\ttesticalm\t1\t79";
    const leads = parseLeads(raw, "sellmax");
    expect(leads).toHaveLength(1);
    expect(leads[0].adSource).toBe("");
  });

  it("parses batch with mixed ad sources", () => {
    const raw = [
      "#6924\t2026-03-07 13:44:03\tرشيد\t+21623868301\tتونس\tProstacalm\t1\t79\tromaissa-FB-1192-Aissani prostacalm TN 03-OA\t102.107.136.143\tNORMAL",
      "#6925\t2026-03-07 13:44:15\tطاهر\t+21629746107\tتونس\ttesticalm\t1\t79\tromaissa-FB-1192-Aissani Testicalm TN 61-oa-comp\t154.108.89.143\tNORMAL",
    ].join("\n");
    const leads = parseLeads(raw, "sellmax");
    expect(leads).toHaveLength(2);
    expect(leads[0].adSource).toBe("romaissa-FB-1192-Aissani prostacalm TN 03-OA");
    expect(leads[1].adSource).toBe("romaissa-FB-1192-Aissani Testicalm TN 61-oa-comp");
  });

  it("returns empty array for empty input", () => {
    expect(parseLeads("", "sellmax")).toHaveLength(0);
    expect(parseLeads("  \n  ", "sellmax")).toHaveLength(0);
  });
});

// ===== ECOMANAGER (Algeria) =====

describe("parseLeads — Ecomamanager (Algeria)", () => {
  it("parses tab-separated Ecomanager rows", () => {
    const raw = "8478\tمحمد\t+2130549953930\t\t11 - Tamanrasset تمنراست\t\tTesticalm\t\t1\t3800";
    const leads = parseLeads(raw, "ecomamanager");
    expect(leads).toHaveLength(1);
    expect(leads[0].name).toBe("محمد");
    expect(leads[0].primaryPhoneNumber).toBe("0549953930"); // +213 → 0, 10 digits
    expect(leads[0].fullAddress).toBe("11 - Tamanrasset تمنراست");
  });

  it("cleans +213 prefix to 0 for Algerian phones", () => {
    const raw = "8479\tTest\t+2130661234567\t\t16 - Alger\t\tTesticalm\t\t1\t3800";
    const leads = parseLeads(raw, "ecomamanager");
    expect(leads).toHaveLength(1);
    const phone = leads[0].primaryPhoneNumber;
    expect(phone.startsWith("0")).toBe(true);
    expect(phone).toHaveLength(10);
  });

  it("detects upsell from Arabic text in subsequent line", () => {
    const raw = [
      "8480\tعلي\t+2130551234567\t\t09 - Blida\t\tTesticalm\t\t1\t3800",
      "اشتري قطعتين و وفر",
    ].join("\n");
    const leads = parseLeads(raw, "ecomamanager");
    expect(leads).toHaveLength(1);
    expect(leads[0].originalPrice).toBe(5800);
  });

  it("returns empty array for empty input", () => {
    expect(parseLeads("", "ecomamanager")).toHaveLength(0);
  });
});

// ===== ROW CONVERSION: toSellmaxRows =====

describe("toSellmaxRows", () => {
  it("converts ParsedLead to Sellmax 29-column format", () => {
    const leads: ParsedLead[] = [
      {
        referenceNumber: "#2233",
        name: "محمد عبار",
        primaryPhoneNumber: "23636097",
        fullAddress: "قابس غنواش",
        rawPhone: "21623636097",
      },
    ];
    const rows = toSellmaxRows(leads);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.shopName).toBe("SOUKTN");
    expect(row.referenceNumber).toBe("#2233");
    expect(row.name).toBe("محمد عبار");
    expect(row.primaryPhoneNumber).toBe("23636097");
    expect(row.fullAddress).toBe("قابس غنواش");
    expect(row.countryCode).toBe("TN");
    expect(row.offerValue).toBe("87");
    expect(row.offerCurrency).toBe("TND");
    expect(row.sku).toBe("TestiIcalm");
    expect(row.value).toBe("87");
    expect(row.currency).toBe("TND");
    expect(row.quantity).toBe("1");
    expect(row.status).toBe("NEW");
  });

  it("maps multiple leads correctly", () => {
    const leads: ParsedLead[] = [
      { referenceNumber: "#1", name: "A", primaryPhoneNumber: "11111111", fullAddress: "Tunis", rawPhone: "11111111" },
      { referenceNumber: "#2", name: "B", primaryPhoneNumber: "22222222", fullAddress: "Sfax", rawPhone: "22222222" },
    ];
    const rows = toSellmaxRows(leads);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe("A");
    expect(rows[1].name).toBe("B");
  });

  it("sets SKU to Prostcalm for Prostacalm products", () => {
    const leads: ParsedLead[] = [
      {
        referenceNumber: "#6075",
        name: "فتحي العربي شاوش",
        primaryPhoneNumber: "55046990",
        fullAddress: "البقالطة المنستير",
        rawPhone: "+21655046990",
        productName: "Prostacalm",
      },
    ];
    const rows = toSellmaxRows(leads);
    expect(rows).toHaveLength(1);
    expect(rows[0].sku).toBe("Prostcalm");
    expect(rows[0].offerValue).toBe("87");
    expect(rows[0].value).toBe("87");
  });

  it("sets SKU to TestiIcalm for testicalm products", () => {
    const leads: ParsedLead[] = [
      {
        referenceNumber: "#6040",
        name: "علي العسيلي",
        primaryPhoneNumber: "92186887",
        fullAddress: "القصرين",
        rawPhone: "+21692186887",
        productName: "testicalm",
      },
    ];
    const rows = toSellmaxRows(leads);
    expect(rows).toHaveLength(1);
    expect(rows[0].sku).toBe("TestiIcalm");
  });

  it("defaults to TestiIcalm when productName is empty", () => {
    const leads: ParsedLead[] = [
      {
        referenceNumber: "#9999",
        name: "Test",
        primaryPhoneNumber: "12345678",
        fullAddress: "Tunis",
        rawPhone: "12345678",
      },
    ];
    const rows = toSellmaxRows(leads);
    expect(rows[0].sku).toBe("TestiIcalm");
  });

  it("maps adSource to offerUrl column", () => {
    const leads: ParsedLead[] = [
      {
        referenceNumber: "#6924",
        name: "رشيد اليحياوي",
        primaryPhoneNumber: "23868301",
        fullAddress: "تونس",
        rawPhone: "+21623868301",
        productName: "Prostacalm",
        adSource: "romaissa-FB-1192-Aissani prostacalm TN 03-OA",
      },
    ];
    const rows = toSellmaxRows(leads);
    expect(rows[0].offerUrl).toBe("romaissa-FB-1192-Aissani prostacalm TN 03-OA");
  });

  it("sets offerUrl to empty string when adSource is missing", () => {
    const leads: ParsedLead[] = [
      {
        referenceNumber: "#2233",
        name: "Test",
        primaryPhoneNumber: "23636097",
        fullAddress: "قابس",
        rawPhone: "21623636097",
      },
    ];
    const rows = toSellmaxRows(leads);
    expect(rows[0].offerUrl).toBe("");
  });

  it("handles mixed Testicalm and Prostacalm batch", () => {
    const leads: ParsedLead[] = [
      { referenceNumber: "#1", name: "A", primaryPhoneNumber: "11111111", fullAddress: "Tunis", rawPhone: "11111111", productName: "testicalm" },
      { referenceNumber: "#2", name: "B", primaryPhoneNumber: "22222222", fullAddress: "Sfax", rawPhone: "22222222", productName: "Prostacalm" },
      { referenceNumber: "#3", name: "C", primaryPhoneNumber: "33333333", fullAddress: "Sousse", rawPhone: "33333333", productName: "TESTICALM" },
      { referenceNumber: "#4", name: "D", primaryPhoneNumber: "44444444", fullAddress: "Bizerte", rawPhone: "44444444", productName: "Prostacalm" },
    ];
    const rows = toSellmaxRows(leads);
    expect(rows[0].sku).toBe("TestiIcalm");
    expect(rows[1].sku).toBe("Prostcalm");
    expect(rows[2].sku).toBe("TestiIcalm");
    expect(rows[3].sku).toBe("Prostcalm");
  });
});

// ===== ROW CONVERSION: toEcomamanagerRows =====

describe("toEcomamanagerRows", () => {
  it("converts ParsedLead to Ecomanager 14-column format (normal order)", () => {
    const leads: ParsedLead[] = [
      {
        referenceNumber: "",
        name: "محمد",
        primaryPhoneNumber: "0549953930",
        fullAddress: "11 - Tamanrasset",
        rawPhone: "+2130549953930",
        originalPrice: 3800,
      },
    ];
    const rows = toEcomamanagerRows(leads);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row["Client*"]).toBe("محمد");
    expect(row["Téléphone*"]).toBe("0549953930");
    expect(row["Wilaya*"]).toBe("11 - Tamanrasset");
    expect(row["Produit (SKU)*"]).toBe("TES");
    expect(row["Quantité*"]).toBe("1");
    expect(row["Prix unitaire"]).toBe("3800");
    expect(row["Réduction"]).toBe("");
  });

  it("detects upsell and sets quantity=2 and reduction=1800", () => {
    const leads: ParsedLead[] = [
      {
        referenceNumber: "",
        name: "علي",
        primaryPhoneNumber: "0551234567",
        fullAddress: "09 - Blida",
        rawPhone: "+2130551234567",
        originalPrice: 5800,
      },
    ];
    const rows = toEcomamanagerRows(leads);
    expect(rows).toHaveLength(1);
    expect(rows[0]["Quantité*"]).toBe("2");
    expect(rows[0]["Réduction"]).toBe("1800");
  });

  it("uses dash for empty name", () => {
    const leads: ParsedLead[] = [
      {
        referenceNumber: "",
        name: "",
        primaryPhoneNumber: "0549953930",
        fullAddress: "16 - Alger",
        rawPhone: "+2130549953930",
      },
    ];
    const rows = toEcomamanagerRows(leads);
    expect(rows[0]["Client*"]).toBe("-");
  });

  it("uses dash for empty wilaya", () => {
    const leads: ParsedLead[] = [
      {
        referenceNumber: "",
        name: "Test",
        primaryPhoneNumber: "0549953930",
        fullAddress: "",
        rawPhone: "+2130549953930",
      },
    ];
    const rows = toEcomamanagerRows(leads);
    expect(rows[0]["Wilaya*"]).toBe("-");
  });
});

// ===== COMPANIES CONFIG =====

describe("COMPANIES config", () => {
  it("has sellmax config with correct properties", () => {
    const config = COMPANIES.sellmax;
    expect(config.id).toBe("sellmax");
    expect(config.name).toBe("Sellmax");
    expect(config.country).toBe("Tunisia");
    expect(config.headers).toBeDefined();
    expect(config.headers.length).toBe(29);
    expect(config.placeholderText).toBeDefined();
  });

  it("has ecomamanager config with correct properties", () => {
    const config = COMPANIES.ecomamanager;
    expect(config.id).toBe("ecomamanager");
    expect(config.name).toBe("Ecomamanager");
    expect(config.country).toBe("Algeria");
    expect(config.headers).toBeDefined();
    expect(config.headers.length).toBe(14);
    expect(config.placeholderText).toBeDefined();
  });
});
