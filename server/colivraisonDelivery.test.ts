/**
 * Tests for Colivraison delivery tracking parser
 * - Status normalization
 * - Media buyer extraction from reference
 * - Date parsing (DD-MM-YYYY)
 * - Full Excel parsing with sample data
 */

import { describe, it, expect } from "vitest";
import {
  normalizeColivraisonStatus,
  extractMediaBuyer,
  parseColivraisonDate,
  isColivraisonExport,
  parseColivraisonExcel,
} from "./colivraisonParser";
import * as fs from "fs";
import * as path from "path";

describe("normalizeColivraisonStatus", () => {
  it("maps delivered/paid statuses to livre_paye", () => {
    expect(normalizeColivraisonStatus("Commande livrée payée")).toBe("livre_paye");
    expect(normalizeColivraisonStatus("Livré")).toBe("livre_paye");
    expect(normalizeColivraisonStatus("Commande encaissée au hub")).toBe("livre_paye");
    expect(normalizeColivraisonStatus("Paiement livreur reçu")).toBe("livre_paye");
    expect(normalizeColivraisonStatus("Paiement en transit")).toBe("livre_paye");
  });

  it("maps return statuses correctly", () => {
    expect(normalizeColivraisonStatus("Retour pret vers depot")).toBe("retour_recu");
    expect(normalizeColivraisonStatus("Retour (annulée)")).toBe("retour_recu");
    expect(normalizeColivraisonStatus("Retour en transit")).toBe("retour_non_recu");
    expect(normalizeColivraisonStatus("Retour pret pour transit")).toBe("retour_non_recu");
  });

  it("maps in-transit/processing statuses to en_traitement", () => {
    expect(normalizeColivraisonStatus("En livraison")).toBe("en_traitement");
    expect(normalizeColivraisonStatus("En transit vers wilaya")).toBe("en_traitement");
    expect(normalizeColivraisonStatus("Expédié vers livreur")).toBe("en_traitement");
    expect(normalizeColivraisonStatus("Client ne répond pas")).toBe("en_traitement");
    expect(normalizeColivraisonStatus("Reporté")).toBe("en_traitement");
    expect(normalizeColivraisonStatus("Injoignable")).toBe("en_traitement");
  });

  it("maps cancelled/not-received statuses to non_recu", () => {
    expect(normalizeColivraisonStatus("A changé d'avis")).toBe("non_recu");
    expect(normalizeColivraisonStatus("Trop chère")).toBe("non_recu");
    expect(normalizeColivraisonStatus("N'a pas commandé")).toBe("non_recu");
    expect(normalizeColivraisonStatus("Switch le colis")).toBe("non_recu");
  });

  it("handles case insensitivity and trimming", () => {
    expect(normalizeColivraisonStatus("  LIVRÉ  ")).toBe("livre_paye");
    expect(normalizeColivraisonStatus("en livraison")).toBe("en_traitement");
  });

  it("falls back to sanitized key for unknown statuses", () => {
    const result = normalizeColivraisonStatus("Some Unknown Status");
    expect(result).toBe("some_unknown_status");
  });
});

describe("extractMediaBuyer", () => {
  it("extracts media buyer from reference with dashes", () => {
    expect(extractMediaBuyer("romaissa-TT-R.001-Testicalm january 2026")).toBe("romaissa");
    expect(extractMediaBuyer("STIF-FB-8813-TESTICALM ACT 01")).toBe("stif");
    expect(extractMediaBuyer("maissa-FB-mk maissa testicalm 309")).toBe("maissa");
    expect(extractMediaBuyer("omar-TT-R.05-Prostate Oil")).toBe("omar");
  });

  it("returns null for null/empty reference", () => {
    expect(extractMediaBuyer(null)).toBeNull();
    expect(extractMediaBuyer("")).toBeNull();
  });

  it("handles references with newlines (takes first line)", () => {
    expect(extractMediaBuyer("romaissa-FB-123\ntesticalmupsell")).toBe("romaissa");
  });

  it("returns null for references starting with numbers", () => {
    expect(extractMediaBuyer("12345-something")).toBeNull();
  });
});

describe("parseColivraisonDate", () => {
  it("parses DD-MM-YYYY format", () => {
    const d = parseColivraisonDate("28-02-2026");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(1); // February = 1
    expect(d!.getDate()).toBe(28);
  });

  it("parses 01-01-2026", () => {
    const d = parseColivraisonDate("01-01-2026");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(0); // January = 0
    expect(d!.getDate()).toBe(1);
  });

  it("returns null for null/empty input", () => {
    expect(parseColivraisonDate(null)).toBeNull();
    expect(parseColivraisonDate("")).toBeNull();
    expect(parseColivraisonDate(undefined)).toBeNull();
  });

  it("returns null for invalid date strings", () => {
    expect(parseColivraisonDate("not-a-date")).toBeNull();
  });
});

describe("isColivraisonExport", () => {
  it("detects Colivraison header by Num Commande", () => {
    expect(isColivraisonExport(["Num Commande", "Reference Commande", "", "", "", "", "", "", "", "", "", "", "Statut", "Étape"])).toBe(true);
  });

  it("rejects non-Colivraison headers", () => {
    expect(isColivraisonExport(["Tracking", "Client", "Phone", "Status"])).toBe(false);
  });
});

describe("parseColivraisonExcel — real file", () => {
  const testFilePath = path.join(__dirname, "..", "test-data-coliv.xlsx");

  it("parses the sample Colivraison export file", () => {
    if (!fs.existsSync(testFilePath)) {
      console.warn("Skipping real file test — test-data-coliv.xlsx not found");
      return;
    }

    const buffer = fs.readFileSync(testFilePath);
    const { orders, errors } = parseColivraisonExcel(buffer);

    // Should parse many orders
    expect(orders.length).toBeGreaterThan(100);
    expect(errors.length).toBe(0);

    // Check first order structure
    const first = orders[0];
    expect(first.tracking).toMatch(/^COLIV-/);
    expect(first.status).toBeTruthy();
    expect(first.statusRaw).toBeTruthy();

    // Check media buyer extraction works on some orders
    const withMediaBuyer = orders.filter(o => o.mediaBuyer !== null);
    expect(withMediaBuyer.length).toBeGreaterThan(0);

    // Check status normalization
    const statuses = new Set(orders.map(o => o.status));
    // Should have some known normalized statuses
    expect(
      statuses.has("livre_paye") ||
      statuses.has("en_traitement") ||
      statuses.has("retour_recu") ||
      statuses.has("retour_non_recu") ||
      statuses.has("non_recu")
    ).toBe(true);

    // Check dates are parsed
    const withDates = orders.filter(o => o.shippedAt !== null);
    expect(withDates.length).toBeGreaterThan(0);
  });
});
