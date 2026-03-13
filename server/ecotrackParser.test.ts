import { describe, expect, it } from "vitest";
import {
  normalizeStatus,
  extractAgentCode,
  extractMediazCode,
  parseEcoTrackDate,
  classifyStatus,
  isTerminalStatus,
  parseEcoTrackExcel,
} from "./ecotrackParser";
import * as XLSX from "xlsx";

// ─── normalizeStatus ─────────────────────────────────────────────────────
describe("normalizeStatus", () => {
  it("normalizes 'En traitement' to 'en_traitement'", () => {
    expect(normalizeStatus("En traitement")).toBe("en_traitement");
  });

  it("normalizes 'Livré payé' to 'livre_paye'", () => {
    expect(normalizeStatus("Livré payé")).toBe("livre_paye");
  });

  it("normalizes 'Livré non payé' to 'livre_non_paye'", () => {
    expect(normalizeStatus("Livré non payé")).toBe("livre_non_paye");
  });

  it("normalizes 'Retour reçu' to 'retour_recu'", () => {
    expect(normalizeStatus("Retour reçu")).toBe("retour_recu");
  });

  it("normalizes 'Retour non reçu' to 'retour_non_recu'", () => {
    expect(normalizeStatus("Retour non reçu")).toBe("retour_non_recu");
  });

  it("normalizes 'Non reçu' to 'non_recu'", () => {
    expect(normalizeStatus("Non reçu")).toBe("non_recu");
  });

  it("handles leading/trailing whitespace", () => {
    expect(normalizeStatus("  En traitement  ")).toBe("en_traitement");
  });

  it("handles unknown statuses by replacing spaces and accents", () => {
    expect(normalizeStatus("Quelque chose")).toBe("quelque_chose");
  });
});

// ─── extractAgentCode ────────────────────────────────────────────────────
describe("extractAgentCode", () => {
  it("extracts code from Arabic name with code appended", () => {
    expect(extractAgentCode("بن الشريف R01")).toBe("r01");
  });

  it("extracts code from Latin name with code appended", () => {
    expect(extractAgentCode("mohamed tel02")).toBe("tel02");
  });

  it("extracts code like 'k1'", () => {
    expect(extractAgentCode("some name k1")).toBe("k1");
  });

  it("returns null when no code is found", () => {
    expect(extractAgentCode("بن الشريف")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractAgentCode("")).toBeNull();
  });

  it("extracts code with trailing whitespace", () => {
    expect(extractAgentCode("name R01  ")).toBe("r01");
  });

  // ─── New: codes at beginning of name ─────────────────────────────
  it("extracts code at beginning of name", () => {
    expect(extractAgentCode("R01 \u0646\u0627\u0635\u0631 \u0628\u0644\u0648\u0627\u0639\u0631")).toBe("r01");
  });

  it("extracts code at beginning without space before Arabic", () => {
    expect(extractAgentCode("YR06\u063a\u0631\u064a\u0633\u064a \u0639\u0628\u062f\u0627\u0644\u0646\u0648\u0631")).toBe("yr06");
  });

  it("extracts code in middle of name", () => {
    expect(extractAgentCode("sh08 \u0631\u0627\u0628\u064a\u0639 \u0628\u0646\u0632\u0631\u0648\u0642")).toBe("sh08");
  });

  // ─── New: special codes ──────────────────────────────────────────
  it("extracts TEL02 (Khoukha phone orders)", () => {
    expect(extractAgentCode("LAKHDER tel02\t\t \t1")).toBe("tel02");
  });

  it("extracts SM1 (Soumia community manager)", () => {
    expect(extractAgentCode("SM1 client bouzid")).toBe("sm1");
  });

  it("prioritizes SM1 over other codes in same name", () => {
    expect(extractAgentCode("SM1 client sh08 \u0645\u062d\u0645\u062f")).toBe("sm1");
  });

  it("extracts GH1 (Ryma community manager)", () => {
    expect(extractAgentCode("GH1 Y01 miloud")).toBe("gh1");
  });

  it("extracts SV02", () => {
    expect(extractAgentCode("SV02 Nouh")).toBe("sv02");
  });

  // ─── New: code with letter suffix ───────────────────────────────
  it("extracts code with letter suffix like L03b", () => {
    expect(extractAgentCode("Kaddour. Guemache L03b")).toBe("l03b");
  });

  it("extracts L03b from Arabic name", () => {
    expect(extractAgentCode("\u0639\u0648\u0627\u0641\u064a L03b")).toBe("l03b");
  });

  // ─── New: code with comma ───────────────────────────────────────
  it("extracts code followed by comma", () => {
    expect(extractAgentCode("Cherrguituofik R01,")).toBe("r01");
  });

  // ─── New: no false positives ────────────────────────────────────
  it("returns null for plain Arabic name", () => {
    expect(extractAgentCode("\u0645\u062d\u0645\u062f")).toBeNull();
  });

  it("returns null for plain Latin name", () => {
    expect(extractAgentCode("Rachid")).toBeNull();
  });

  it("returns null for TEST", () => {
    expect(extractAgentCode("TEST")).toBeNull();
  });
});

// ─── extractMediazCode ──────────────────────────────────────────────────
describe("extractMediazCode", () => {
  it("extracts 'LAM mediaz'", () => {
    expect(extractMediazCode("LAM mediaz")).toBe("LAM mediaz");
  });

  it("extracts 'GHM-MEDIAZ'", () => {
    expect(extractMediazCode("GHM-MEDIAZ")).toBe("GHM-MEDIAZ");
  });

  it("extracts 'GHM-MEDIAZ PA'", () => {
    expect(extractMediazCode("GHM-MEDIAZ PA")).toBe("GHM-MEDIAZ PA");
  });

  it("returns null when no mediaz code found", () => {
    expect(extractMediazCode("some random text")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(extractMediazCode(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(extractMediazCode(undefined)).toBeNull();
  });
});

// ─── parseEcoTrackDate ──────────────────────────────────────────────────
describe("parseEcoTrackDate", () => {
  it("parses DD-MM-YYYY HH:MM format", () => {
    const d = parseEcoTrackDate("16-02-2026 12:28");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(1); // February = 1
    expect(d!.getDate()).toBe(16);
    expect(d!.getHours()).toBe(12);
    expect(d!.getMinutes()).toBe(28);
  });

  it("returns null for null input", () => {
    expect(parseEcoTrackDate(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseEcoTrackDate("")).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(parseEcoTrackDate(undefined)).toBeNull();
  });

  it("handles leading/trailing whitespace", () => {
    const d = parseEcoTrackDate("  16-02-2026 12:28  ");
    expect(d).not.toBeNull();
    expect(d!.getDate()).toBe(16);
  });
});

// ─── classifyStatus ─────────────────────────────────────────────────────
describe("classifyStatus", () => {
  it("classifies livre_paye as delivered", () => {
    expect(classifyStatus("livre_paye")).toBe("delivered");
  });

  it("classifies livre_non_paye as delivered", () => {
    expect(classifyStatus("livre_non_paye")).toBe("delivered");
  });

  it("classifies retour_recu as returned", () => {
    expect(classifyStatus("retour_recu")).toBe("returned");
  });

  it("classifies retour_non_recu as returned", () => {
    expect(classifyStatus("retour_non_recu")).toBe("returned");
  });

  it("classifies non_recu as returned", () => {
    expect(classifyStatus("non_recu")).toBe("returned");
  });

  it("classifies en_traitement as in_transit", () => {
    expect(classifyStatus("en_traitement")).toBe("in_transit");
  });

  it("classifies unknown status as in_transit", () => {
    expect(classifyStatus("something_else")).toBe("in_transit");
  });
});

// ─── isTerminalStatus ───────────────────────────────────────────────────
describe("isTerminalStatus", () => {
  it("returns true for delivered statuses", () => {
    expect(isTerminalStatus("livre_paye")).toBe(true);
    expect(isTerminalStatus("retour_recu")).toBe(true);
  });

  it("returns false for in_transit", () => {
    expect(isTerminalStatus("en_traitement")).toBe(false);
  });
});

// ─── parseEcoTrackExcel ─────────────────────────────────────────────────
describe("parseEcoTrackExcel", () => {
  function buildExcelBuffer(rows: any[][]): Buffer {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  }

  const HEADER = [
    "Type d'opération",
    "Type de préstation",
    "Tracking",
    "Référence",
    "Client",
    "Téléphone",
    "Téléphone 2",
    "Wilaya",
    "Commune",
    "Adresse",
    "Produit",
    "Remarque",
    "Fragile",
    "Poids (KG)",
    "Montant",
    "Statut colis",
    "Date d'expédition",
  ];

  it("parses a valid Excel file with one order", () => {
    const dataRow = [
      "Livraison",
      "Domicile",
      "ECO-12345",
      "REF-001",
      "Ahmed R01",
      "0555123456",
      "0666789012",
      "Alger",
      "Bab El Oued",
      "Rue 123",
      "Hair Oil",
      "LAM mediaz",
      "Non",
      1,
      2500,
      "Livré payé",
      "16-02-2026 12:28",
    ];

    const buffer = buildExcelBuffer([HEADER, dataRow]);
    const { orders, errors } = parseEcoTrackExcel(buffer);

    expect(errors).toHaveLength(0);
    expect(orders).toHaveLength(1);

    const order = orders[0];
    expect(order.tracking).toBe("ECO-12345");
    expect(order.reference).toBe("REF-001");
    expect(order.clientName).toBe("Ahmed R01");
    expect(order.phone).toBe("0555123456");
    expect(order.wilaya).toBe("Alger");
    expect(order.amount).toBe(2500);
    expect(order.status).toBe("livre_paye");
    expect(order.statusRaw).toBe("Livré payé");
    expect(order.agentCode).toBe("r01");
    expect(order.mediazCode).toBe("LAM mediaz");
    expect(order.shippedAt).not.toBeNull();
  });

  it("returns error for empty file", () => {
    const buffer = buildExcelBuffer([]);
    const { orders, errors } = parseEcoTrackExcel(buffer);
    expect(orders).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("returns error for wrong header format", () => {
    // Need at least 2 rows (header + data) to get past the row count check
    // Column C must NOT contain the word 'tracking'
    const buffer = buildExcelBuffer([["Col1", "Col2", "WrongColumn"], ["a", "b", "c"]]);
    const { orders, errors } = parseEcoTrackExcel(buffer);
    expect(orders).toHaveLength(0);
    expect(errors[0]).toContain("Unexpected header format");
  });

  it("skips rows with no tracking number", () => {
    const dataRow1 = [
      "Livraison", "Domicile", "ECO-111", "REF-001", "Ahmed", "0555", null,
      "Alger", "Commune", "Addr", "Product", null, null, null, 1000, "En traitement", null,
    ];
    const emptyRow = [
      "Livraison", "Domicile", null, null, null, null, null,
      null, null, null, null, null, null, null, null, null, null,
    ];

    const buffer = buildExcelBuffer([HEADER, dataRow1, emptyRow]);
    const { orders } = parseEcoTrackExcel(buffer);
    expect(orders).toHaveLength(1);
    expect(orders[0].tracking).toBe("ECO-111");
  });

  it("handles multiple orders with different statuses", () => {
    const rows = [
      HEADER,
      ["L", "D", "T-001", "R-1", "Ali k1", "05", null, "Oran", "C", "A", "P", null, null, null, 1000, "En traitement", null],
      ["L", "D", "T-002", "R-2", "Sara tel02", "06", null, "Blida", "C", "A", "P", "GHM-MEDIAZ", null, null, 2000, "Retour reçu", null],
      ["L", "D", "T-003", "R-3", "Omar", "07", null, "Tizi", "C", "A", "P", null, null, null, 3000, "Livré payé", null],
    ];

    const buffer = buildExcelBuffer(rows);
    const { orders, errors } = parseEcoTrackExcel(buffer);

    expect(errors).toHaveLength(0);
    expect(orders).toHaveLength(3);

    expect(orders[0].agentCode).toBe("k1");
    expect(orders[0].status).toBe("en_traitement");

    expect(orders[1].agentCode).toBe("tel02");
    expect(orders[1].mediazCode).toBe("GHM-MEDIAZ");
    expect(orders[1].status).toBe("retour_recu");

    expect(orders[2].agentCode).toBeNull(); // "Omar" has no code
    expect(orders[2].status).toBe("livre_paye");
  });
});
