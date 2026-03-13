/**
 * Colivraison Excel Export Parser
 *
 * Parses the XLSX export from Colivraison delivery platform.
 * 14 columns: Num Commande, Reference Commande, Date creation, Date mise a jour,
 *             Nom, Telephone, Produit, Quantite, Remarque, Wilaya, Commune,
 *             Prix total, Statut, Étape
 *
 * Extracts: tracking (Num Commande), reference, client, phone, wilaya, commune,
 *           product, remarque, amount, status, shipment date, media buyer.
 */
import * as XLSX from "xlsx";
import { extractAgentCode } from "./ecotrackParser";

// ─── Status Normalization ────────────────────────────────────────────────
// Maps raw French status strings from Colivraison to normalized keys
// These match the same normalized keys used by EcoTrack for unified display
const COLIVRAISON_STATUS_MAP: Record<string, string> = {
  // Delivered + Paid
  "commande livrée payée": "livre_paye",
  "livré": "livre_paye",
  "commande encaissée au hub": "livre_paye",
  "paiement livreur reçu": "livre_paye",
  "paiement en transit": "livre_paye",

  // Return Received
  "retour pret vers depot": "retour_recu",
  "retour (annulée)": "retour_recu",

  // Return Not Received (in transit back)
  "retour en transit": "retour_non_recu",
  "retour pret pour transit": "retour_non_recu",

  // In Transit / Being Delivered
  "en livraison": "en_traitement",
  "en transit vers wilaya": "en_traitement",
  "expédié vers livreur": "en_traitement",
  "dispatch au livreur": "en_traitement",
  "dispatcher transit": "en_traitement",

  // Processing / Pending
  "client ne répond pas": "en_traitement",
  "reporté": "en_traitement",
  "injoignable": "en_traitement",
  "réceptionner au hub": "en_traitement",
  "en cours d'emballage": "en_traitement",
  "reconfirmation par le client": "en_traitement",
  "client occupé": "en_traitement",

  // Not Received / Cancelled
  "switch le colis": "non_recu",
  "commande en double": "non_recu",
  "a changé d'avis": "non_recu",
  "probleme avec ce colis": "non_recu",
  "trop chère": "non_recu",
  "n'a pas commandé": "non_recu",
  "a commandé ailleurs.": "non_recu",
};

export function normalizeColivraisonStatus(raw: string): string {
  const key = raw.trim().toLowerCase();
  return COLIVRAISON_STATUS_MAP[key] || key.replace(/\s+/g, "_").replace(/[éè]/g, "e").replace(/[ç]/g, "c").replace(/[ù]/g, "u");
}

// ─── Media Buyer Extraction ─────────────────────────────────────────────
// Extract media buyer name from Reference Commande
// Examples: "romaissa-TT-R.001-Testicalm january 2026" → "romaissa"
//           "STIF-FB-8813-TESTICALM ACT 01" → "STIF" (islam)
//           "maissa-FB-mk maissa testicalm 309" → "maissa"
export function extractMediaBuyer(reference: string | null): string | null {
  if (!reference) return null;
  const cleaned = reference.trim().split("\n")[0]; // take first line only
  const match = cleaned.match(/^([a-zA-Z]+)/);
  return match ? match[1].toLowerCase() : null;
}

// ─── Date Parsing ────────────────────────────────────────────────────────
// Colivraison dates come as "DD-MM-YYYY" (e.g., "28-02-2026")
export function parseColivraisonDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const trimmed = dateStr.trim();
  // Try DD-MM-YYYY format
  const match = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }
  // Fallback: try native Date parsing
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Parsed Order Type ───────────────────────────────────────────────────
export interface ParsedColivraisonOrder {
  tracking: string;
  reference: string | null;
  clientName: string | null;
  phone: string | null;
  phone2: string | null;
  wilaya: string | null;
  commune: string | null;
  address: string | null;
  product: string | null;
  remarque: string | null;
  amount: number | null;
  status: string;
  statusRaw: string;
  agentCode: string | null;
  mediazCode: string | null;
  mediaBuyer: string | null;
  shippedAt: Date | null;
  quantity: number | null;
}

// ─── Column Index Map ────────────────────────────────────────────────────
// Colivraison export columns (0-indexed):
// 0: Num Commande, 1: Reference Commande, 2: Date creation, 3: Date mise a jour,
// 4: Nom, 5: Telephone, 6: Produit, 7: Quantite, 8: Remarque,
// 9: Wilaya, 10: Commune, 11: Prix total, 12: Statut, 13: Étape
const COL = {
  NUM_COMMANDE: 0,
  REFERENCE: 1,
  DATE_CREATION: 2,
  DATE_UPDATE: 3,
  NOM: 4,
  TELEPHONE: 5,
  PRODUIT: 6,
  QUANTITE: 7,
  REMARQUE: 8,
  WILAYA: 9,
  COMMUNE: 10,
  PRIX_TOTAL: 11,
  STATUT: 12,
  ETAPE: 13,
} as const;

function cellStr(val: any): string | null {
  if (val === null || val === undefined || val === "") return null;
  return String(val).trim();
}

function cellNum(val: any): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = typeof val === "number" ? val : parseFloat(String(val));
  return isNaN(n) ? null : n;
}

// ─── Header Detection ───────────────────────────────────────────────────
// Detect if a file is a Colivraison export by checking header columns
export function isColivraisonExport(header: any[]): boolean {
  const col0 = cellStr(header[0])?.toLowerCase() || "";
  const col1 = cellStr(header[1])?.toLowerCase() || "";
  const col12 = cellStr(header[12])?.toLowerCase() || "";
  // Check for "num commande" in col 0 and "statut" in col 12
  return (
    (col0.includes("num") && col0.includes("commande")) ||
    (col1.includes("reference") && col1.includes("commande")) ||
    (col12.includes("statut"))
  );
}

// ─── Main Parser ─────────────────────────────────────────────────────────
export function parseColivraisonExcel(buffer: Buffer): {
  orders: ParsedColivraisonOrder[];
  errors: string[];
} {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { orders: [], errors: ["No sheets found in the Excel file"] };
  }

  const sheet = workbook.Sheets[sheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  if (rows.length < 2) {
    return { orders: [], errors: ["File has no data rows (only header or empty)"] };
  }

  // Validate header row
  const header = rows[0];
  if (!isColivraisonExport(header)) {
    return {
      orders: [],
      errors: [`Unexpected header format. Expected Colivraison export with "Num Commande" in column A, but found "${cellStr(header[0])}". Make sure this is a Colivraison export file.`],
    };
  }

  const orders: ParsedColivraisonOrder[] = [];
  const errors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const numCommande = cellStr(row[COL.NUM_COMMANDE]);
    if (!numCommande) {
      continue; // Skip empty rows
    }

    // Use "COLIV-{numCommande}" as tracking to avoid collision with EcoTrack tracking numbers
    const tracking = `COLIV-${numCommande.replace(/\.0$/, "")}`;
    const statusRaw = cellStr(row[COL.STATUT]) || "unknown";
    const reference = cellStr(row[COL.REFERENCE]);

    try {
      orders.push({
        tracking,
        reference,
        clientName: cellStr(row[COL.NOM]),
        phone: cellStr(row[COL.TELEPHONE]),
        phone2: null, // Colivraison doesn't have a second phone column
        wilaya: cellStr(row[COL.WILAYA]),
        commune: cellStr(row[COL.COMMUNE]),
        address: null, // No address column in Colivraison export
        product: cellStr(row[COL.PRODUIT]),
        remarque: cellStr(row[COL.REMARQUE]),
        amount: cellNum(row[COL.PRIX_TOTAL]),
        status: normalizeColivraisonStatus(statusRaw),
        statusRaw,
        agentCode: extractAgentCode(cellStr(row[COL.NOM]) || ""),
        mediazCode: null,
        mediaBuyer: extractMediaBuyer(reference),
        shippedAt: parseColivraisonDate(cellStr(row[COL.DATE_CREATION])),
        quantity: cellNum(row[COL.QUANTITE]),
      });
    } catch (err: any) {
      errors.push(`Row ${i + 1}: ${err.message}`);
    }
  }

  return { orders, errors };
}
