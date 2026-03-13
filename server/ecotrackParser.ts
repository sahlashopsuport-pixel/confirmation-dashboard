/**
 * EcoTrack (48H) Excel Export Parser
 *
 * Parses the XLSX export from EcoTrack delivery platform.
 * Extracts: tracking, reference, client, phone, wilaya, commune, address,
 *           product, remarque, amount, status, shipment date, agent code, mediaz code.
 */
import * as XLSX from "xlsx";

// ─── Status Normalization ────────────────────────────────────────────────
// Maps raw French status strings to normalized keys
const STATUS_MAP: Record<string, string> = {
  "en traitement": "en_traitement",
  "livré payé": "livre_paye",
  "livré non payé": "livre_non_paye",
  "retour reçu": "retour_recu",
  "retour non reçu": "retour_non_recu",
  "non reçu": "non_recu",
};

export function normalizeStatus(raw: string): string {
  const key = raw.trim().toLowerCase();
  return STATUS_MAP[key] || key.replace(/\s+/g, "_").replace(/[éè]/g, "e").replace(/[ç]/g, "c").replace(/[ù]/g, "u");
}

// ─── Agent Code Extraction ───────────────────────────────────────────────
// Agent codes appear in client names at the beginning, middle, or end.
// Examples: "بن الشريف R01", "R01 ناصر بلواعر", "SM1 client sh08 محمد"
// Pattern: 1-4 letters followed by 1-2 digits, optionally followed by a letter suffix (e.g., L03b)
// Special codes: TEL02 (Khoukha phone orders), SM1 (Soumia), GH1 (Ryma)

// Known special codes that should be recognized
const SPECIAL_CODES = new Set(["tel02", "sm1", "gh1", "sv02"]);

// Match codes like R01, SH08, L03, Y01, L03b, YR06, SM1, GH1, TEL02, SV02
// The pattern: 1-4 letters + 1-2 digits + optional letter suffix (like 'b')
const AGENT_CODE_PATTERN = /(?:^|[\s,.]|(?<=[\u0600-\u06FF]))([a-zA-Z]{1,4}\d{1,2}[a-zA-Z]?)(?=[\s,.]|$|[\u0600-\u06FF])/gi;

export function extractAgentCode(clientName: string): string | null {
  if (!clientName) return null;
  const cleaned = clientName.trim();
  
  // Find all potential codes in the name
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  const regex = new RegExp(AGENT_CODE_PATTERN.source, 'gi');
  while ((m = regex.exec(cleaned)) !== null) {
    matches.push(m[1].toLowerCase());
  }
  
  if (matches.length === 0) return null;
  
  // Filter out common false positives (e.g., random letter-number combos that aren't codes)
  // Prioritize: known special codes > standard agent codes
  for (const code of matches) {
    if (SPECIAL_CODES.has(code)) return code;
  }
  
  // Return the first valid-looking agent code
  // Standard patterns: 1-2 letter prefix + 2 digit number (R01, SH08, Y01, L03, YR06)
  // Or with suffix: L03b
  for (const code of matches) {
    // Skip if it looks like a random word (e.g., 'tel' without being tel02)
    if (/^[a-z]{1,4}\d{1,2}[a-z]?$/.test(code)) {
      return code;
    }
  }
  
  return matches[0]; // fallback to first match
}

// ─── MEDIAZ Code Extraction ──────────────────────────────────────────────
// MEDIAZ codes appear in the remarque field: "LAM mediaz", "GHM-MEDIAZ", "GHM-MEDIAZ PA", etc.
const MEDIAZ_REGEX = /\b(LAM\s*mediaz|GHM[- ]?MEDIAZ)(\s+[A-Z]{1,3})?\b/i;

export function extractMediazCode(remarque: string | null | undefined): string | null {
  if (!remarque) return null;
  const match = remarque.match(MEDIAZ_REGEX);
  if (!match) return null;
  return match[0].trim();
}

// ─── Date Parsing ────────────────────────────────────────────────────────
// EcoTrack dates come as "DD-MM-YYYY HH:MM" (e.g., "16-02-2026 12:28")
export function parseEcoTrackDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const trimmed = dateStr.trim();
  // Try DD-MM-YYYY HH:MM format
  const match = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/);
  if (match) {
    const [, day, month, year, hour, minute] = match;
    return new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute)
    );
  }
  // Fallback: try native Date parsing
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Parsed Order Type ───────────────────────────────────────────────────
export interface ParsedEcoTrackOrder {
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
  shippedAt: Date | null;
}

// ─── Column Index Map ────────────────────────────────────────────────────
// Expected columns from the EcoTrack export (0-indexed):
// 0: Type d'opération, 1: Type de préstation, 2: Tracking, 3: Référence,
// 4: Client, 5: Téléphone, 6: Téléphone 2, 7: Wilaya, 8: Commune,
// 9: Adresse, 10: Produit, 11: Remarque, 12: Fragile, 13: Poids (KG),
// 14: Montant, 15: Statut colis, 16: Date d'expédition

const COL = {
  TRACKING: 2,
  REFERENCE: 3,
  CLIENT: 4,
  PHONE: 5,
  PHONE2: 6,
  WILAYA: 7,
  COMMUNE: 8,
  ADDRESS: 9,
  PRODUCT: 10,
  REMARQUE: 11,
  AMOUNT: 14,
  STATUS: 15,
  SHIPPED_DATE: 16,
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

// ─── Main Parser ─────────────────────────────────────────────────────────
export function parseEcoTrackExcel(buffer: Buffer): {
  orders: ParsedEcoTrackOrder[];
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
  const trackingHeader = cellStr(header[COL.TRACKING]);
  if (!trackingHeader || !trackingHeader.toLowerCase().includes("tracking")) {
    return {
      orders: [],
      errors: [`Unexpected header format. Column C should be "Tracking" but found "${trackingHeader}". Make sure this is an EcoTrack export file.`],
    };
  }

  const orders: ParsedEcoTrackOrder[] = [];
  const errors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const tracking = cellStr(row[COL.TRACKING]);
    if (!tracking) {
      // Skip empty rows
      continue;
    }

    const statusRaw = cellStr(row[COL.STATUS]) || "unknown";
    const clientName = cellStr(row[COL.CLIENT]);
    const remarque = cellStr(row[COL.REMARQUE]);

    try {
      orders.push({
        tracking,
        reference: cellStr(row[COL.REFERENCE]),
        clientName,
        phone: cellStr(row[COL.PHONE]),
        phone2: cellStr(row[COL.PHONE2]),
        wilaya: cellStr(row[COL.WILAYA]),
        commune: cellStr(row[COL.COMMUNE]),
        address: cellStr(row[COL.ADDRESS]),
        product: cellStr(row[COL.PRODUCT]),
        remarque,
        amount: cellNum(row[COL.AMOUNT]),
        status: normalizeStatus(statusRaw),
        statusRaw,
        agentCode: extractAgentCode(clientName || ""),
        mediazCode: extractMediazCode(remarque),
        shippedAt: parseEcoTrackDate(cellStr(row[COL.SHIPPED_DATE])),
      });
    } catch (err: any) {
      errors.push(`Row ${i + 1}: ${err.message}`);
    }
  }

  return { orders, errors };
}

// ─── Status Classification Helpers ───────────────────────────────────────
export type DeliveryOutcome = "delivered" | "returned" | "in_transit";

export function classifyStatus(status: string): DeliveryOutcome {
  switch (status) {
    case "livre_paye":
    case "livre_non_paye":
      return "delivered";
    case "retour_recu":
    case "retour_non_recu":
    case "non_recu":
      return "returned";
    case "en_traitement":
    default:
      return "in_transit";
  }
}

export function isTerminalStatus(status: string): boolean {
  return classifyStatus(status) !== "in_transit";
}

// ─── Status Display Labels ───────────────────────────────────────────────
export const STATUS_LABELS: Record<string, string> = {
  en_traitement: "In Transit",
  livre_paye: "Delivered (Paid)",
  livre_non_paye: "Delivered (Unpaid)",
  retour_recu: "Return Received",
  retour_non_recu: "Return Not Received",
  non_recu: "Not Received",
};

export const STATUS_COLORS: Record<string, string> = {
  en_traitement: "#3b82f6",    // blue
  livre_paye: "#10b981",       // green
  livre_non_paye: "#f59e0b",   // amber
  retour_recu: "#ef4444",      // red
  retour_non_recu: "#dc2626",  // dark red
  non_recu: "#9333ea",         // purple
};
