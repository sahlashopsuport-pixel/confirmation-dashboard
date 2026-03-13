/**
 * Google Sheets Write Helper
 * Uses a service account to append rows to agent Google Sheets.
 */
import { google } from "googleapis";

// --- Retry wrapper with exponential backoff ---

/**
 * Retry an async function with exponential backoff.
 * Retries on transient Google API errors (rate limits, timeouts, 5xx).
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  { maxRetries = 4, baseDelayMs = 1000, label = "API call" } = {}
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const status = err?.code || err?.response?.status || 0;
      const message = err?.message || "";
      // Detect quota exceeded: Google returns 429 OR 403 with "Quota exceeded" message
      const isQuotaError =
        status === 429 ||
        message.includes("Quota exceeded") ||
        message.includes("quota") ||
        message.includes("RESOURCE_EXHAUSTED") ||
        message.includes("rateLimitExceeded");
      // Retry on: quota errors, 5xx, network errors
      const isRetryable =
        isQuotaError ||
        status >= 500 ||
        message.includes("ECONNRESET") ||
        message.includes("ETIMEDOUT") ||
        message.includes("socket hang up") ||
        message.includes("connect ETIMEDOUT") ||
        message.includes("network") ||
        message.includes("timeout");
      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }
      // Use much longer backoff for quota errors (15s base) vs normal errors (1s base)
      const quotaBaseMs = 15000;
      const effectiveBase = isQuotaError ? quotaBaseMs : baseDelayMs;
      const delay = effectiveBase * Math.pow(1.5, attempt) + Math.random() * 1000;
      console.log(`[Retry] ${label} attempt ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms (${isQuotaError ? 'QUOTA' : 'transient'}) — ${message.slice(0, 100)}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// --- Conditional formatting color helpers ---

type RGBColor = { red: number; green: number; blue: number; alpha?: number };

function hexToRgb(hex: string): RGBColor {
  const h = hex.replace('#', '');
  return {
    red: parseInt(h.substring(0, 2), 16) / 255,
    green: parseInt(h.substring(2, 4), 16) / 255,
    blue: parseInt(h.substring(4, 6), 16) / 255,
  };
}

function makeConditionalFormatRule(
  sheetId: number,
  startRow: number,
  endRow: number,
  colStart: number,
  colEnd: number,
  textValue: string,
  bgHex: string,
  fgHex: string,
) {
  return {
    addConditionalFormatRule: {
      rule: {
        ranges: [
          {
            sheetId,
            startRowIndex: startRow,
            endRowIndex: endRow,
            startColumnIndex: colStart,
            endColumnIndex: colEnd,
          },
        ],
        booleanRule: {
          condition: {
            type: "TEXT_EQ" as const,
            values: [{ userEnteredValue: textValue }],
          },
          format: {
            backgroundColor: hexToRgb(bgHex),
            textFormat: {
              foregroundColor: hexToRgb(fgHex),
              bold: true,
            },
          },
        },
      },
      index: 0,
    },
  };
}

function buildStatusConditionalFormats(sheetId: number, startRow: number, endRow: number) {
  // Column B (index 1)
  const col = 1;
  const rules: Array<{ text: string; bg: string; fg: string }> = [
    { text: "\u062a\u0623\u0643\u064a\u062f", bg: "#006100", fg: "#FFFFFF" },           // تأكيد - dark green
    { text: "\u0625\u0644\u063a\u0627\u0621", bg: "#9C0006", fg: "#FFFFFF" },           // إلغاء - dark red
    { text: "\u062a\u0623\u062c\u064a\u0644", bg: "#BF6000", fg: "#FFFFFF" },           // تأجيل - dark orange
    { text: "\u0627\u062a\u0635\u0644 1", bg: "#F4E8D6", fg: "#5B3A00" },              // اتصل 1 - light tan
    { text: "\u0627\u062a\u0635\u0644 2", bg: "#E8D5B0", fg: "#5B3A00" },              // اتصل 2 - tan
    { text: "\u0627\u062a\u0635\u0644 3", bg: "#D4B88A", fg: "#5B3A00" },              // اتصل 3 - darker tan
    { text: "\u0627\u062a\u0635\u0644 4", bg: "#C09A60", fg: "#FFFFFF" },              // اتصل 4 - brown
    { text: "\u0627\u062a\u0635\u0644 5", bg: "#A07830", fg: "#FFFFFF" },              // اتصل 5 - darker brown
    { text: "\u0627\u062a\u0635\u0644 6", bg: "#6B4513", fg: "#FFFFFF" },              // اتصل 6 - dark brown
    { text: "\u0642\u064a\u062f \u0627\u0644\u0627\u0646\u062a\u0638\u0627\u0631", bg: "#C6EFCE", fg: "#006100" }, // قيد الانتظار - light green
    { text: "\u0631\u0642\u0645 \u0645\u063a\u0644\u0642", bg: "#D9D9D9", fg: "#9C0006" },       // رقم مغلق - gray
  ];
  return rules.map((r) =>
    makeConditionalFormatRule(sheetId, startRow, endRow, col, col + 1, r.text, r.bg, r.fg),
  );
}

function buildDeliveryConditionalFormats(sheetId: number, startRow: number, endRow: number) {
  // Column D (index 3)
  const col = 3;
  return [
    makeConditionalFormatRule(sheetId, startRow, endRow, col, col + 1, "\u0646\u0639\u0645", "#FFD966", "#5B3A00"), // نعم - gold
    makeConditionalFormatRule(sheetId, startRow, endRow, col, col + 1, "\u0644\u0627", "#F4CCCC", "#9C0006"),       // لا - pink
  ];
}

// --- End conditional formatting helpers ---

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !privateKey) {
    throw new Error("Google Service Account credentials not configured");
  }

  return new google.auth.JWT({
    email,
    key: privateKey.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

/**
 * Extract spreadsheet ID from a Google Sheets URL.
 * Supports formats:
 *   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/...
 */
export function extractSpreadsheetId(url: string): string {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    throw new Error(`Invalid Google Sheets URL: ${url}`);
  }
  return match[1];
}

// --- In-memory cache for sheet tab names (reduces API reads) ---
const sheetNamesCache = new Map<string, { names: string[]; expiresAt: number }>();
const SHEET_NAMES_CACHE_TTL = 3 * 60 * 1000; // 3 minutes

/**
 * Get all sheet (tab) names in a spreadsheet.
 * Results are cached for 3 minutes to reduce API quota usage.
 */
export async function getSheetNames(spreadsheetId: string): Promise<string[]> {
  const cached = sheetNamesCache.get(spreadsheetId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.names;
  }

  const names = await withRetry(async () => {
    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    const res = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties.title",
    });

    return (
      res.data.sheets?.map((s) => s.properties?.title ?? "").filter(Boolean) ?? []
    );
  }, { label: "getSheetNames" });

  sheetNamesCache.set(spreadsheetId, { names, expiresAt: Date.now() + SHEET_NAMES_CACHE_TTL });
  return names;
}

/**
 * Get the sheetId (numeric) for a given tab name.
 */
async function getSheetId(
  sheetsApi: any,
  spreadsheetId: string,
  sheetName: string
): Promise<number> {
  const meta = await sheetsApi.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties",
  });
  const sheet = meta.data.sheets?.find(
    (s: any) => s.properties?.title === sheetName
  );
  return sheet?.properties?.sheetId ?? 0;
}

/**
 * Append rows to a specific sheet tab.
 * After appending, clears any cell formatting (background color, etc.)
 * on the newly written rows so they appear clean/white.
 *
 * @param spreadsheetId - The spreadsheet ID
 * @param sheetName - The tab/sheet name to append to
 * @param rows - Array of row arrays (each row is an array of cell values)
 * @returns Number of rows appended
 */
export async function appendRows(
  spreadsheetId: string,
  sheetName: string,
  rows: (string | number | null)[][]
): Promise<number> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  // First, find how many rows already exist so we know where new rows start
  const existing = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A:A`,
  }), { label: "appendRows.getExisting" });
  const startRow = existing.data.values?.length ?? 0;

  const res = await withRetry(() => sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${sheetName}'!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "OVERWRITE",
    requestBody: {
      values: rows,
    },
  }), { label: "appendRows.append" });

  const rowsAppended = res.data.updates?.updatedRows ?? 0;

  // Clear formatting on the newly appended rows (remove black background)
  if (rowsAppended > 0) {
    try {
      // Single API call to get both sheetId AND conditional format rules (saves 1 read request)
      const sheetMeta = await withRetry(() => sheets.spreadsheets.get({
        spreadsheetId,
        fields: "sheets.properties,sheets.conditionalFormats",
      }), { label: "appendRows.getSheetMeta" });
      const targetSheet = sheetMeta.data.sheets?.find(
        (s: any) => s.properties?.title === sheetName
      );
      const sheetId = targetSheet?.properties?.sheetId ?? 0;
      const existingRuleCount = targetSheet?.conditionalFormats?.length ?? 0;

      // Extend white bg to column Z (26 cols) to clear any black formatting on right side
      const extendedCols = 26;

      // Data validation dropdown values
      const statusValues = [
        "تأكيد", "إلغاء", "تأجيل", "اتصل 1", "اتصل 2", "اتصل 3",
        "اتصل 4", "اتصل 5", "اتصل 6", "قيد الانتظار", "رقم مغلق",
      ];
      const qtyValues = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
      const deliveryValues = ["نعم", "لا"];

      const makeConditionValue = (val: string) => ({
        userEnteredValue: val,
      });

      // First: clear ALL existing conditional formatting rules to prevent stacking
      // Then re-apply them for the full data range (row 2 to startRow + rowsAppended)
      const fullRangeStart = 1; // row index 1 = row 2 (after header)
      const fullRangeEnd = startRow + rowsAppended;

      // Build delete requests for existing conditional format rules (delete in reverse order)
      const deleteRequests = [];
      for (let i = existingRuleCount - 1; i >= 0; i--) {
        deleteRequests.push({
          deleteConditionalFormatRule: {
            sheetId,
            index: i,
          },
        });
      }

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            // 0. Delete all existing conditional format rules to prevent stacking
            ...deleteRequests,
            // 1. Clear formatting (white bg, black text) — extended to 26 columns
            {
              repeatCell: {
                range: {
                  sheetId,
                  startRowIndex: startRow,
                  endRowIndex: startRow + rowsAppended,
                  startColumnIndex: 0,
                  endColumnIndex: extendedCols,
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 1, green: 1, blue: 1 },
                    textFormat: {
                      foregroundColor: { red: 0, green: 0, blue: 0 },
                    },
                  },
                },
                fields:
                  "userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.foregroundColor",
              },
            },
            // 2. Column B (index 1) — Status dropdown
            {
              setDataValidation: {
                range: {
                  sheetId,
                  startRowIndex: startRow,
                  endRowIndex: startRow + rowsAppended,
                  startColumnIndex: 1,
                  endColumnIndex: 2,
                },
                rule: {
                  condition: {
                    type: "ONE_OF_LIST",
                    values: statusValues.map(makeConditionValue),
                  },
                  showCustomUi: true,
                  strict: false,
                },
              },
            },
            // 3. Column C (index 2) — Quantity dropdown
            {
              setDataValidation: {
                range: {
                  sheetId,
                  startRowIndex: startRow,
                  endRowIndex: startRow + rowsAppended,
                  startColumnIndex: 2,
                  endColumnIndex: 3,
                },
                rule: {
                  condition: {
                    type: "ONE_OF_LIST",
                    values: qtyValues.map(makeConditionValue),
                  },
                  showCustomUi: true,
                  strict: false,
                },
              },
            },
            // 4. Column D (index 3) — Delivery dropdown
            {
              setDataValidation: {
                range: {
                  sheetId,
                  startRowIndex: startRow,
                  endRowIndex: startRow + rowsAppended,
                  startColumnIndex: 3,
                  endColumnIndex: 4,
                },
                rule: {
                  condition: {
                    type: "ONE_OF_LIST",
                    values: deliveryValues.map(makeConditionValue),
                  },
                  showCustomUi: true,
                  strict: false,
                },
              },
            },
            // 5. Format ENTIRE column A as Date (dd/MM/yyyy) — prevents broken dates
            // This runs every assignment so dates never break again
            {
              repeatCell: {
                range: {
                  sheetId,
                  startRowIndex: 0,
                  startColumnIndex: 0, // Column A
                  endColumnIndex: 1,   // Only column A
                },
                cell: {
                  userEnteredFormat: {
                    numberFormat: {
                      type: "DATE",
                      pattern: "dd/MM/yyyy",
                    },
                  },
                },
                fields: "userEnteredFormat.numberFormat",
              },
            },
            // 6-16. Conditional formatting for Column B (Status) — full data range
            ...buildStatusConditionalFormats(sheetId, fullRangeStart, fullRangeEnd),
            // 17-18. Conditional formatting for Column D (Delivery) — full data range
            ...buildDeliveryConditionalFormats(sheetId, fullRangeStart, fullRangeEnd),
          ],
        },
      });
    } catch (fmtErr) {
      // Non-critical: formatting cleanup failed, data is still written
      console.warn("Failed to clear formatting on appended rows:", fmtErr);
    }
  }

  return rowsAppended;
}

/**
 * Format a lead into a row matching the agent sheet structure.
 *
 * Agent sheet columns:
 * 1. التاريخ (Date)
 * 2. الحالة (Status) — empty, agent fills
 * 3. الكمية (Quantity) — empty, agent fills
 * 4. التوصيل (Delivery) — empty, agent fills
 * 5. ملاحظة المكالمة (Call Note) — empty, agent fills
 * 6. الرمز (Code) — agent code
 * 7. اسم المنتج (Product Name)
 * 8. اسم الزبون (Customer Name)
 * 9. رقم الهاتف (Phone)
 * 10. 1 العنوان (Address 1)
 * 11. 2 العنوان (Address 2)
 * 12. السعر (Price)
 * 13. المرجع (Reference/SKU)
 */
export interface LeadData {
  date: string;
  customerName: string;
  phone: string;
  wilaya: string;
  product: string;
  price: number | string;
  sku: string;
  address2?: string;    // Libya: area/neighborhood
  orderType?: string;   // Libya: NORMAL / ABANDONED
}

/**
 * Convert date from YYYY-MM-DD to DD/MM/YYYY format.
 * Input: "2026-02-04" → Output: "04/02/2026"
 * If already in DD/MM/YYYY or unrecognized, returns as-is.
 */
export function formatDate(date: string): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return date;
}

export function formatLeadRow(
  lead: LeadData,
  agentCode: string,
  market?: string,
  workDate?: string // YYYY-MM-DD business work date — if provided, use this instead of today
): (string | number | null)[] {
  // Use workDate if provided (e.g. "Tomorrow" assignment), otherwise fall back to today
  let dateFormatted: string;
  if (workDate) {
    // workDate is YYYY-MM-DD, convert to DD/MM/YYYY
    dateFormatted = formatDate(workDate);
  } else {
    const now = new Date();
    dateFormatted = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  }
  const row: (string | number | null)[] = [
    dateFormatted, // التاريخ — work date (DD/MM/YYYY)
    "", // الحالة — agent fills
    "", // الكمية — agent fills
    "", // التوصيل — agent fills
    "", // ملاحظة المكالمة — agent fills
    agentCode, // الرمز
    lead.product.toUpperCase(), // اسم المنتج — UPPERCASE
    agentCode ? `${lead.customerName} ${agentCode}` : lead.customerName, // اسم الزبون + agent code (e.g. "oussama SH08")
    lead.orderType === "PAGE"
      ? "'" + lead.phone  // Pages Orders: phone as-is, no formatting
      : "'" + formatPhone(lead.phone, market), // رقم الهاتف — apostrophe prefix forces text in Sheets
    lead.wilaya, // 1 العنوان (city)
    lead.address2 || "", // 2 العنوان (area) — Libya has this, Algeria leaves empty
    lead.price, // السعر
    lead.sku, // المرجع
  ];

  // Libya & Viconis: add order type in column N
  if ((market === "libya" || market === "viconis") && lead.orderType) {
    row.push(lead.orderType);
  }

  return row;
}

/**
 * Format phone number: strip country code, keep leading 0.
 * Algeria: strip 213 prefix → 0XXXXXXXXX
 * Libya: strip 218 prefix → 09XXXXXXXX
 * Tunisia: strip 216 prefix → XXXXXXXX (8 digits, no leading 0)
 */
export function formatPhone(phone: string, market?: string): string {
  // Remove all non-digit characters
  let digits = phone.replace(/\D/g, "");

  if (market === "libya") {
    // Strip "218" country code prefix
    if (digits.startsWith("218") && digits.length > 10) {
      digits = digits.slice(3);
    }
    // Libya phones start with 09
    if (!digits.startsWith("0")) {
      digits = "0" + digits;
    }
  } else if (market === "tunisia") {
    // Strip "216" country code prefix
    if (digits.startsWith("216") && digits.length > 8) {
      digits = digits.slice(3);
    }
    // Tunisia phones are 8 digits, no leading 0
  } else {
    // Algeria (default): strip "213" country code prefix
    if (digits.startsWith("213") && digits.length > 10) {
      digits = digits.slice(3);
    }
    // Ensure leading 0
    if (!digits.startsWith("0")) {
      digits = "0" + digits;
    }
  }

  return digits;
}

/**
 * Read existing rows from a sheet to find the last row.
 */
export async function getRowCount(
  spreadsheetId: string,
  sheetName: string
): Promise<number> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A:A`,
  });

  return res.data.values?.length ?? 0;
}

/**
 * Count untreated leads in a sheet tab.
 * Untreated = rows that have data in column A (date) but column B (status) is empty.
 * Skips the header row (row 1).
 */
export async function getUntreatedLeadCount(
  spreadsheetId: string,
  sheetName: string
): Promise<{ total: number; untreated: number }> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  // Read columns A through I to check for actual lead data
  // Col A=Date, B=Status, G=Product, H=Client Name, I=Phone
  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A:I`,
  }), { label: "getUntreatedLeadCount" });

  const rows = res.data.values ?? [];
  // Skip header row (index 0)
  let total = 0;
  let untreated = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const colA = (row[0] ?? "").toString().trim(); // Date
    const colB = (row[1] ?? "").toString().trim(); // Status
    const colG = (row[6] ?? "").toString().trim(); // Product name
    const colH = (row[7] ?? "").toString().trim(); // Client name
    const colI = (row[8] ?? "").toString().trim(); // Phone
    // Only count as a real lead if it has product name, client name, or phone
    const hasLeadData = colG || colH || colI;
    if (colA && hasLeadData) {
      total++;
      if (!colB) {
        untreated++;
      }
    }
  }
  return { total, untreated };
}

/**
 * Count untreated leads across ALL tabs (all weeks) in a spreadsheet.
 * Sums total and untreated across every tab.
 * Returns per-tab breakdown as well.
 */
export async function getUntreatedLeadCountAllTabs(
  spreadsheetId: string
): Promise<{ total: number; untreated: number; perTab: Record<string, { total: number; untreated: number }> }> {
  const tabNames = await getSheetNames(spreadsheetId);
  let grandTotal = 0;
  let grandUntreated = 0;
  const perTab: Record<string, { total: number; untreated: number }> = {};

  // Process tabs sequentially to avoid bursting API quota
  // (each tab = 1 read request, 5+ tabs in parallel can spike quota)
  for (const tabName of tabNames) {
    try {
      const counts = await getUntreatedLeadCount(spreadsheetId, tabName);
      perTab[tabName] = counts;
      grandTotal += counts.total;
      grandUntreated += counts.untreated;
    } catch {
      perTab[tabName] = { total: 0, untreated: 0 };
    }
  }

  return { total: grandTotal, untreated: grandUntreated, perTab };
}

/**
 * Detect if a value looks like a phone number (starts with + or has 10+ digits).
 */
function looksLikePhone(val: string): boolean {
  const cleaned = val.replace(/\D/g, "");
  return (
    (val.startsWith("+") && cleaned.length >= 10) || cleaned.length >= 10
  );
}

/**
 * Detect if a value looks like a date (YYYY-MM-DD pattern).
 */
function looksLikeDate(val: string): boolean {
  // Matches YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY
  return /^\d{4}-\d{2}-\d{2}/.test(val) || /^\d{2}\/\d{2}\/\d{4}$/.test(val) || /^\d{2}-\d{2}-\d{4}$/.test(val);
}

/**
 * Parse pasted data into lead objects.
 *
 * Supports six formats:
 *
 * FORMAT A — "Shopify raw" (auto-detected when col[1] looks like a phone):
 *   col 0 = name, col 1 = phone, col 5 = wilaya, col 6 = product,
 *   col 8 = qty, col 9 = price, col 13 = ad source, col 14 = date
 *
 * FORMAT B — "Simple export" (fallback):
 *   col 0 = date, col 1 = product, col 2 = name, col 3 = phone,
 *   col 4 = wilaya, col 5 = price, col 6 = sku
 *
 * FORMAT C — "Libya Shopify export" (auto-detected when market=libya or col[0] starts with #):
 *   col 0 = order ref (#130652), col 1 = date (ISO), col 2 = product,
 *   col 3 = name, col 4 = phone (218...), col 5 = city, col 6 = area,
 *   col 7 = price, col 8 = sku, col 9 = order type (NORMAL/ABANDONED), col 10 = IP
 *
 * FORMAT D — "Viconis Shopify export":
 *   col 0 = product name, col 1 = full name, col 2 = phone (213...),
 *   col 3 = wilaya, col 4 = price, col 5 = sku, col 7 = date, col 8 = type, col 9 = order number
 *
 * FORMAT E — "TikTok leads" (auto-detected when header has "adress"+"code" or phone has +213 with spaces):
 *   col 0 = full name, col 1 = phone (+213 with spaces), col 2 = adress 1,
 *   col 3 = adress2 (wilaya), col 4 = product name, col 5 = sku, col 6 = code, col 7 = code 2
 *   No date → auto-filled with today's date. No price → left empty.
 *
 *
 * FORMAT F — "Pages Orders" (auto-detected when col[0] is short page code, col[3] is 9-digit phone):
 *   col 0 = page code (SM1, GH1, etc.), col 1 = product name, col 2 = customer name (with page code prefix),
 *   col 3 = phone (9 digits, no country code), col 4 = address (optional), col 5 = date
 *   SKU = pageCode + "PAGE" (e.g. SM1PAGE). Price left empty. orderType = "PAGE".
 *
 * Handles both tab-separated and comma-separated data.
 */
/**
 * Pre-process raw text to handle CSV-style quoted fields that span multiple lines.
 * Shopify exports wrap multi-line values in double quotes: "line1\nline2"
 * This function joins those continuation lines back into the parent row.
 */
function joinQuotedMultilineFields(rawText: string): string {
  const rawLines = rawText.split("\n");
  const joined: string[] = [];
  let buffer = "";
  let inQuote = false;

  for (const line of rawLines) {
    if (!inQuote) {
      // Count unescaped quotes in this line
      const quoteCount = (line.match(/"/g) || []).length;
      if (quoteCount % 2 === 1) {
        // Odd number of quotes — opening a multi-line field
        buffer = line;
        inQuote = true;
      } else {
        joined.push(line);
      }
    } else {
      // We're inside a quoted multi-line field — append to buffer
      buffer += " " + line;
      const quoteCount = (line.match(/"/g) || []).length;
      if (quoteCount % 2 === 1) {
        // Odd quotes closes the multi-line field
        inQuote = false;
        // Strip the wrapping quotes from joined fields
        joined.push(buffer.replace(/"([^"]*)"/g, "$1"));
        buffer = "";
      }
    }
  }
  // If we ended mid-quote, push whatever we have
  if (buffer) {
    joined.push(buffer.replace(/"([^"]*)"/g, "$1"));
  }
  return joined.join("\n");
}

export function parseLeadsFromPaste(rawText: string, market?: string): LeadData[] {
  // Pre-process: join CSV-style quoted multi-line fields into single lines
  const processedText = joinQuotedMultilineFields(rawText);
  const lines = processedText.trim().split("\n");
  if (lines.length === 0) return [];

  // Detect delimiter: tab or comma
  const firstLine = lines[0];
  const delimiter = firstLine.includes("\t") ? "\t" : ",";

  // ── EARLY CHECK: Continuous-string Pages Orders (no tabs, no newlines) ──
  // When pasted from Google Sheets on some browsers/devices, tabs and newlines are stripped,
  // producing one long string like: "SM1testicalmSM1 client067235811028/02/2026SM1testicalm..."
  // Actual sheet: A=PageCode, B=Product, C=Customer, D=Phone, E=empty, F=empty, G=Date
  // Strategy: split by date, extract phone from end, extract page code from start, keep rest as-is.
  if (lines.length === 1 && !firstLine.includes("\t")) {
    const raw = firstLine;
    // Check if the string contains repeated date patterns (at least 2)
    const dateMatches = raw.match(/(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/g);
    if (dateMatches && dateMatches.length >= 2) {
      // Split by date — each record ends with a date
      const parts = raw.split(/(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/);
      const leads: LeadData[] = [];
      for (let i = 0; i < parts.length - 1; i += 2) {
        const content = parts[i];
        const date = parts[i + 1] || "";
        if (!content || !content.trim()) continue;

        // Extract phone: 9-10 digits at end of content
        // Try 10 digits first (Algeria: 0XXXXXXXXX), then 9 digits (Libya: XXXXXXXXX)
        const phoneMatch = content.match(/(\d{10})$/) || content.match(/(\d{9})$/);
        if (!phoneMatch) continue;
        const phone = phoneMatch[1];
        const beforePhone = content.substring(0, content.length - phone.length).trim();

        // Extract page code from the START of the record (col A comes first)
        // Page code is 2-5 chars like SM1, GH1, SM2 at the very beginning
        const codeMatch = beforePhone.match(/^([A-Z]{1,4}\d{1,2})/i);
        const pageCode = codeMatch ? codeMatch[1].toUpperCase() : "";
        const sku = pageCode ? pageCode + "PAGE" : "PAGE";

        // Everything after page code and before phone = product + customer (as-is)
        const restText = codeMatch ? beforePhone.substring(codeMatch[0].length).trim() : beforePhone;

        leads.push({
          date,
          product: restText,
          customerName: restText,
          phone,
          wilaya: "",
          price: "",
          sku,
          orderType: "PAGE",
        });
      }
      if (leads.length > 0) return leads;
    }
  }

  // Check if first line is a header row
  const firstLower = firstLine.toLowerCase();
  const headerKeywords = [
    "order date",
    "date creation",
    "full name",
    "phone number",
    "willaya",
    "order refrencce",
    "order reference",
    "creation date",
    "adress 1",
    "order type",
    "product name",
    "order number",
  ];
  const isHeader = headerKeywords.some((kw) => firstLower.includes(kw));

  const dataLines = isHeader ? lines.slice(1) : lines;

  // Auto-detect Viconis format (FORMAT D):
  // - market is explicitly "viconis"
  // - OR header contains "product name" + "order number" (Viconis Shopify export)
  // - OR auto-detect: col[0] looks like a product name (long text), col[2] looks like phone (213...)
  let isViconisFormat = market === "viconis";
  if (!isViconisFormat) {
    // Check header for Viconis-specific keywords
    if (isHeader && firstLower.includes("product name") && firstLower.includes("order number")) {
      isViconisFormat = true;
    }
    // Auto-detect: col[0] is long text (product), col[2] starts with 213 (phone)
    if (!isViconisFormat) {
      for (const dl of dataLines.slice(0, 5)) {
        const testCols = dl.split(delimiter).map((c) => c.trim());
        if (testCols.length >= 9) {
          const col0 = testCols[0] || "";
          const col2 = testCols[2] || "";
          const col9 = testCols[9] || "";
          // Viconis: col0=product (long), col2=phone (213...), col9=order number (#XXXXX)
          if (col0.length > 10 && col2.replace(/\D/g, "").startsWith("213") && /^#\d+$/.test(col9)) {
            isViconisFormat = true;
            break;
          }
        }
      }
    }
  }

  // Auto-detect Libya format (FORMAT C):
  // - market is explicitly "libya"
  // - OR first data column starts with # (order reference like #130652 or #D40336)
  let isLibyaFormat = !isViconisFormat && market === "libya";
  if (!isLibyaFormat && !isViconisFormat) {
    for (const dl of dataLines.slice(0, 5)) {
      const testCols = dl.split(delimiter).map((c) => c.trim());
      if (testCols.length >= 8 && /^#[A-Z0-9]+$/i.test(testCols[0] || "")) {
        isLibyaFormat = true;
        break;
      }
    }
  }

  // Auto-detect Pages Orders format (FORMAT F) — checked BEFORE Libya/Viconis
  // because page orders from any market share the same structure:
  // - col[0] is a short page code (2-4 alphanumeric chars like SM1, GH1, SM2)
  // - col[3] is a phone number (9-10 digits, no country code prefix)
  // - col[1] is a product name (text)
  // - 4-6 columns total
  let isPageOrderFormat = false;
  {
    let pageOrderMatchCount = 0;
    for (const dl of dataLines.slice(0, 5)) {
      const testCols = dl.split(delimiter).map((c) => c.trim());
      if (testCols.length >= 4 && testCols.length <= 10) {
        const col0 = testCols[0] || "";
        const col3 = testCols[3] || "";
        const col3Digits = col3.replace(/\D/g, "");
        // Page code: 2-5 alphanumeric chars (e.g. SM1, GH1, SM2, AB12)
        const isPageCode = /^[A-Za-z]{1,4}\d{1,2}$/.test(col0);
        // Phone: 9-10 digits without country code
        const isShortPhone = col3Digits.length >= 9 && col3Digits.length <= 10 && !col3.startsWith("+") && !col3.startsWith("213") && !col3.startsWith("218");
        if (isPageCode && isShortPhone) {
          pageOrderMatchCount++;
        }
      }
    }
    // Require at least 2 matching lines (or 1 if only 1-2 lines total)
    if (pageOrderMatchCount >= 2 || (pageOrderMatchCount >= 1 && dataLines.length <= 2)) {
      isPageOrderFormat = true;
    }
  }

  // If page order format detected, override Libya/Viconis flags
  if (isPageOrderFormat) {
    isViconisFormat = false;
    isLibyaFormat = false;
  }

  // Auto-detect TikTok format (FORMAT E):
  // - Header contains "adress" + "code" (TikTok-specific columns)
  // - OR phone numbers have +213 with spaces and no date-like column in first position
  // - Columns: full name, phone number, adress 1, adress2, product name, sku, code, code 2
  let isTikTokFormat = false;
  if (!isViconisFormat && !isLibyaFormat && !isPageOrderFormat) {
    // Check header for TikTok-specific keywords
    if (isHeader && firstLower.includes("adress") && (firstLower.includes("code 2") || firstLower.includes("code"))) {
      isTikTokFormat = true;
    }
    // Auto-detect without header: phone in col[1] has +213 with spaces, col[0] is a name (not date)
    // Safety: require at least 2 matching lines AND verify NO column in the row contains a date
    // This prevents false positives when normal Algeria leads happen to have +213 with spaces
    if (!isTikTokFormat) {
      let tiktokMatchCount = 0;
      for (const dl of dataLines.slice(0, 5)) {
        const testCols = dl.split(delimiter).map((c) => c.trim());
        if (testCols.length >= 6) {
          const col1 = testCols[1] || "";
          const col0 = testCols[0] || "";
          // TikTok phone: starts with +213 and has spaces between digit groups
          // col0 is a name (not a date, not starting with #)
          // AND no column in the row looks like a date (TikTok exports have NO date column)
          const hasDateColumn = testCols.some((c) => looksLikeDate(c));
          if (
            /^\+213\s/.test(col1) &&
            !looksLikeDate(col0) &&
            !col0.startsWith("#") &&
            !looksLikePhone(col0) &&
            !hasDateColumn &&
            testCols.length <= 10 // TikTok has 8 cols max; Shopify raw has 15+
          ) {
            tiktokMatchCount++;
          }
        }
      }
      // Require at least 2 matching lines to confirm TikTok format
      if (tiktokMatchCount >= 2 || (tiktokMatchCount >= 1 && dataLines.length <= 2)) {
        isTikTokFormat = true;
      }
    }
  }

  const leads: LeadData[] = [];

  if (isPageOrderFormat) {
    // FORMAT F: Pages Orders (tab-separated from Google Sheets)
    // Actual sheet layout: A=PageCode, B=Product, C=Customer, D=Phone, E=empty, F=empty, G=Date
    // But columns may vary — date could be in col 4, 5, 6, or later.
    // Strategy: col[0]=page code, col[1]=product, col[2]=customer, col[3]=phone,
    // then scan remaining cols for date, and any non-empty non-date col = address.
    // SKU = pageCode + "PAGE" (e.g. SM1PAGE). Price left empty.
    for (const line of dataLines) {
      const cols = line.split(delimiter).map((c) => c.trim());
      if (cols.every((c) => c === "")) continue;
      if (cols.length < 4) continue;

      const pageCode = (cols[0] || "").trim().toUpperCase();
      const product = cols[1] || "";
      const customerName = cols[2] || "";
      const phone = cols[3] || "";

      // Scan cols 4+ for date and address
      let date = "";
      let address = "";
      for (let ci = 4; ci < cols.length; ci++) {
        const val = cols[ci];
        if (!val) continue;
        if (!date && looksLikeDate(val)) {
          date = val;
        } else if (!address) {
          address = val;
        }
      }

      // Handle datetime format "2026-02-28 00:00:00"
      if (date.includes(" ")) {
        date = date.split(" ")[0];
      }
      if (date.includes("T")) {
        date = date.split("T")[0];
      }

      // SKU = page code + "PAGE"
      const sku = pageCode ? pageCode + "PAGE" : "PAGE";

      leads.push({
        date,
        product,
        customerName,
        phone,
        wilaya: address,
        price: "",  // No price for pages orders
        sku,
        orderType: "PAGE",
      });
    }
  } else if (isTikTokFormat) {
    // FORMAT E: TikTok leads (Algeria)
    // col 0=full name, 1=phone number (+213 with spaces), 2=adress 1, 3=adress2 (wilaya),
    // 4=product name, 5=sku, 6=code, 7=code 2
    // No date column → auto-fill with today's date
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    for (const line of dataLines) {
      const cols = line.split(delimiter).map((c) => c.trim());
      if (cols.every((c) => c === "")) continue;
      if (cols.length < 5) continue;

      leads.push({
        date: todayStr,
        customerName: cols[0] || "",
        phone: cols[1] || "",
        wilaya: cols[3] || "",  // adress2 = wilaya
        product: cols[4] || "",
        price: "3800",  // TikTok leads standard price
        sku: cols[5] || "",
        orderType: "TIKTOK",  // Mark as TikTok order for tracking
      });
    }
  } else if (isViconisFormat) {
    // FORMAT D: Viconis Shopify export
    // col 0=product name, 1=full name, 2=phone(213...), 3=adress(wilaya),
    // 4=price, 5=sku, 6=ip, 7=creation date, 8=type(NORMAL/ABONDON), 9=order number
    for (const line of dataLines) {
      const cols = line.split(delimiter).map((c) => c.trim());
      if (cols.every((c) => c === "")) continue;
      if (cols.length < 8) continue;

      let date = cols[7] || "";
      // Handle datetime format "2026-02-21 13:48:09"
      if (date.includes(" ")) {
        date = date.split(" ")[0];
      }
      if (date.includes("T")) {
        date = date.split("T")[0];
      }

      leads.push({
        date,
        product: cols[0] || "",
        customerName: cols[1] || "",
        phone: cols[2] || "",
        wilaya: cols[3] || "",
        price: cols[4] || "",
        sku: cols[5] || "",
        orderType: cols[8] || "",
      });
    }
  } else if (isLibyaFormat) {
    // FORMAT C: Libya Shopify export
    // col 0=order ref, 1=date(ISO), 2=product, 3=name, 4=phone(218...), 5=city, 6=area, 7=price, 8=sku, 9=order type, 10=IP
    // Multi-line products: some products have upsell text on next line (no order ref)
    let currentLead: LeadData | null = null;

    for (const line of dataLines) {
      const cols = line.split(delimiter).map((c) => c.trim());
      if (cols.every((c) => c === "")) continue;

      // A main line starts with an order reference (#130652 or #D40336)
      const orderRef = cols[0] || "";
      const isMainLine = /^#[A-Z0-9]+$/i.test(orderRef);

      if (isMainLine && cols.length >= 8) {
        if (currentLead) {
          leads.push(currentLead);
        }

        let date = cols[1] || "";
        // Handle ISO date format (2026-01-19T14:05:07Z)
        if (date.includes("T")) {
          date = date.split("T")[0];
        }
        if (date.includes(" ")) {
          date = date.split(" ")[0];
        }

        currentLead = {
          date,
          product: cols[2] || "",
          customerName: cols[3] || "",
          phone: cols[4] || "",
          wilaya: cols[5] || "",
          address2: cols[6] || "",
          price: cols[7] || "",
          sku: cols[8] || "",
          orderType: cols[9] || "",
        };
      } else if (currentLead) {
        // Continuation line (upsell text) — skip, product name already captured
        // But check if there's useful data like sku on continuation lines
        for (const col of cols) {
          const cleaned = col.replace(/["']/g, "").trim();
          if (
            cleaned.length > 5 &&
            !looksLikeDate(cleaned) &&
            !/^\d+$/.test(cleaned) &&
            !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cleaned) &&
            !cleaned.startsWith("#")
          ) {
            // Could be an upsell SKU — append to existing SKU if not already there
            if (currentLead.sku && !currentLead.sku.includes(cleaned)) {
              // Skip upsell continuation SKUs — main SKU is sufficient
            }
          }
        }
      }
    }
    if (currentLead) {
      leads.push(currentLead);
    }
  } else {

  // Auto-detect format: scan first few data lines for one with a valid phone in col[1]
  // Split raw line (don't trim first) to preserve trailing tab columns
  let isShopifyRaw = false;
  for (const dl of dataLines.slice(0, 5)) {
    const testCols = dl.split(delimiter).map((c) => c.trim());
    if (testCols.length >= 6 && looksLikePhone(testCols[1] || "") && !looksLikeDate(testCols[1] || "")) {
      isShopifyRaw = true;
      break;
    }
  }

  if (isShopifyRaw) {
    // FORMAT A: Shopify raw paste
    // Main lines: col 0=name, 1=phone, 5=wilaya, 6=product, 8=qty, 9=price, 13=ad_source, 14=date
    // Upsell/multi-line orders: main line has valid phone but product wraps across lines.
    // Continuation lines don't have a valid phone in col[1].
    // We merge continuation lines into the last valid lead to capture price, date, sku.
    let currentLead: LeadData | null = null;

    for (const line of dataLines) {
      // Split BEFORE trimming to preserve trailing tab columns (upsell lines have trailing tabs)
      const cols = line.split(delimiter).map((c) => c.trim());
      // Skip completely empty lines
      if (cols.every((c) => c === "")) continue;

      const phone = cols[1] || "";
      // A main line has a valid phone in col[1]. Don't rely on col count alone
      // because trim() on the line would strip trailing tabs reducing column count.
      // Also exclude date strings (e.g. "2026-02-04 16:41:45") which have 14+ digits.
      const isMainLine = looksLikePhone(phone) && !looksLikeDate(phone);

      if (isMainLine) {
        // Save previous lead if exists
        if (currentLead) {
          leads.push(currentLead);
        }

        const name = cols[0] || "";
        const wilaya = cols[5] || "";
        const product = cols[6] || "";
        const price = cols[9] || "";
        let date = cols[14] || "";
        if (date.includes(" ")) {
          date = date.split(" ")[0];
        }
        // Handle ISO date format (2026-02-04T12:39:37+01:00)
        if (date.includes("T")) {
          date = date.split("T")[0];
        }
        const adSource = cols[13] || "";

        currentLead = {
          date,
          product,
          customerName: name,
          phone,
          wilaya,
          price,
          sku: adSource,
        };
      } else if (currentLead) {
        // Continuation line — merge data into current lead
        // Look for price: scan cols for a number that looks like a price (>= 1000)
        for (const col of cols) {
          const cleaned = col.replace(/["']/g, "").trim();
          if (/^\d+$/.test(cleaned)) {
            const num = parseInt(cleaned, 10);
            if (num >= 1000 && !currentLead.price) {
              currentLead.price = cleaned;
            }
          }
        }
        // Look for date in continuation lines
        for (const col of cols) {
          const cleaned = col.replace(/["']/g, "").trim();
          if (looksLikeDate(cleaned)) {
            let d = cleaned;
            if (d.includes(" ")) d = d.split(" ")[0];
            if (d.includes("T")) d = d.split("T")[0];
            if (!currentLead.date) {
              currentLead.date = d;
            }
          }
        }
        // Look for ad source / SKU in continuation lines
        // Ad sources typically contain keywords like "tiktok", "nesrine", "stif", "romaissa", etc.
        for (const col of cols) {
          const cleaned = col.replace(/["']/g, "").trim();
          if (
            cleaned.length > 5 &&
            !looksLikeDate(cleaned) &&
            !/^\d+$/.test(cleaned) &&
            !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cleaned) && // not IP
            !currentLead.sku
          ) {
            currentLead.sku = cleaned;
          }
        }
      }
    }
    // Don't forget the last lead
    if (currentLead) {
      leads.push(currentLead);
    }
  } else {
    // FORMAT B: Simple export
    for (const line of dataLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const cols = trimmed.split(delimiter).map((c) => c.trim());

      // col 0=date, 1=product, 2=name, 3=phone, 4=wilaya, 5=price, 6=sku
      if (cols.length < 6) continue;

      let date = cols[0];
      if (date.includes(" ")) {
        date = date.split(" ")[0];
      }

      leads.push({
        date,
        product: cols[1] || "",
        customerName: cols[2] || "",
        phone: cols[3] || "",
        wilaya: cols[4] || "",
        price: cols[5] || "",
        sku: cols[6] || "",
      });
    }
  }

  } // close else for non-Libya formats

  return leads;
}

/**
 * Test the connection to a spreadsheet (verifies credentials + sharing).
 */
export async function testConnection(
  spreadsheetId: string
): Promise<{ success: boolean; sheetNames: string[]; error?: string; canRead: boolean; canWrite: boolean }> {
  const auth = getAuth();
  const sheetsApi = google.sheets({ version: "v4", auth });
  let sheetNames: string[] = [];
  let canRead = false;
  let canWrite = false;

  // Step 1: Check read access
  try {
    sheetNames = await getSheetNames(spreadsheetId);
    canRead = true;
  } catch (err: any) {
    return {
      success: false,
      sheetNames: [],
      canRead: false,
      canWrite: false,
      error: err.message?.includes("not found")
        ? "Sheet not found — check the URL"
        : err.message?.includes("permission")
        ? "No access — share the sheet with the service account email"
        : err.message || "Unknown error",
    };
  }

  // Step 2: Check write (editor) access by updating a custom developer metadata
  // This is non-destructive — it writes a tiny metadata entry that doesn't affect sheet content
  try {
    const firstSheet = sheetNames[0];
    if (!firstSheet) {
      return { success: false, sheetNames, canRead, canWrite: false, error: "Sheet has no tabs" };
    }
    const sheetId = await getSheetId(sheetsApi, spreadsheetId, firstSheet);
    // Try to update a cell's note in a far-away cell (ZZ1) — non-destructive
    await withRetry(async () => {
      await sheetsApi.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              updateSpreadsheetProperties: {
                properties: {
                  title: (await sheetsApi.spreadsheets.get({ spreadsheetId, fields: "properties.title" })).data.properties?.title || "Sheet",
                },
                fields: "title",
              },
            },
          ],
        },
      });
    }, { label: "testConnection.writeCheck", maxRetries: 2 });
    canWrite = true;
  } catch (err: any) {
    // Write failed — service account is viewer only, not editor
    canWrite = false;
  }

  return {
    success: canRead && canWrite,
    sheetNames,
    canRead,
    canWrite,
    error: canRead && !canWrite
      ? "Read-only access — share as Editor (not Viewer) with the service account email"
      : undefined,
  };
}


/**
 * Clear the basic filter on a specific sheet tab.
 * This is non-destructive — it only removes the active filter view,
 * not the underlying data. Agents can re-apply filters anytime.
 *
 * Returns true if a filter was cleared, false if no filter was active.
 */
export async function clearBasicFilter(
  spreadsheetId: string,
  sheetName: string
): Promise<boolean> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  // First, get the sheet's numeric ID and check if it has a basic filter
  const meta = await withRetry(() => sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties,sheets.basicFilter",
  }), { label: "clearBasicFilter.getMeta" });

  const targetSheet = meta.data.sheets?.find(
    (s: any) => s.properties?.title === sheetName
  );

  if (!targetSheet) {
    return false;
  }

  // If no basic filter is active, nothing to clear
  if (!targetSheet.basicFilter) {
    return false;
  }

  const sheetId = targetSheet.properties?.sheetId ?? 0;

  // Clear the basic filter
  await withRetry(() => sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          clearBasicFilter: {
            sheetId,
          },
        },
      ],
    },
  }), { label: "clearBasicFilter.clear" });

  console.log(`[Filter] Cleared basic filter on "${sheetName}" in spreadsheet ${spreadsheetId}`);
  return true;
}

/**
 * Clear basic filters on ALL tabs in a spreadsheet.
 * Returns the number of filters that were cleared.
 */
export async function clearAllSheetFilters(
  spreadsheetId: string
): Promise<{ cleared: number; tabs: string[] }> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  // Get all sheets with their filter status in a single API call
  const meta = await withRetry(() => sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties,sheets.basicFilter",
  }), { label: "clearAllFilters.getMeta" });

  const sheetsWithFilters = (meta.data.sheets ?? []).filter(
    (s: any) => s.basicFilter
  );

  if (sheetsWithFilters.length === 0) {
    return { cleared: 0, tabs: [] };
  }

  // Build batch request to clear all filters at once (single API call)
  const requests = sheetsWithFilters.map((s: any) => ({
    clearBasicFilter: {
      sheetId: s.properties?.sheetId ?? 0,
    },
  }));

  await withRetry(() => sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  }), { label: "clearAllFilters.batchClear" });

  const clearedTabs = sheetsWithFilters.map(
    (s: any) => s.properties?.title ?? "Unknown"
  );

  console.log(`[Filter] Cleared ${clearedTabs.length} filter(s) on tabs: ${clearedTabs.join(", ")} in spreadsheet ${spreadsheetId}`);
  return { cleared: clearedTabs.length, tabs: clearedTabs };
}


/**
 * Sheet Protection Configuration
 * 
 * Locked columns (agents cannot edit):
 *   A (0) = Date, D (3) = Delivery/Collection, F (5) = SKU, M (12) = Reference
 * 
 * Editable columns (agents can modify):
 *   B (1) = Status, C (2) = Qty, E (4) = Call Notes, G (6) = Product,
 *   H (7) = Client Name, I (8) = Phone, J (9) = Address 1, K (10) = Address 2, L (11) = Price
 * 
 * Structure: Agents cannot delete or move rows. They can add rows at the bottom.
 * Manager emails bypass all protection.
 */

// Editable column indices (0-based): B(1), C(2), E(4), G(6), H(7), I(8), J(9), K(10), L(11)
// Agents CAN edit: Status, Qty, Call Notes, Product, Client Name, Phone, Address 1, Address 2, Price
// Agents CANNOT edit: A(0)=Date, D(3)=Delivery, F(5)=SKU, M(12)=Reference
// Agents CANNOT: delete rows, insert rows (except bottom), move rows
const EDITABLE_COLUMNS = [1, 2, 4, 6, 7, 8, 9, 10, 11]; // B, C, E, G, H, I, J, K, L

/**
 * Apply protection to an agent's spreadsheet.
 * 
 * Strategy: Protect the ENTIRE sheet, then set "unprotectedRanges" for
 * only the editable columns (as specific cell ranges, NOT full columns).
 * This prevents row deletion because deleting a row would affect protected
 * cells that the agent doesn't have permission to edit.
 * 
 * @param spreadsheetId - The Google Spreadsheet ID
 * @param managerEmails - Emails that bypass all protection
 * @returns Summary of protection applied
 */
export async function protectAgentSheet(
  spreadsheetId: string,
  managerEmails: string[],
): Promise<{ protected: number; tabs: string[]; errors: string[] }> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const errors: string[] = [];

  // CRITICAL: The service account that applies the protection MUST be in the editors list.
  // Otherwise Google Sheets API rejects with "You can't remove yourself as an editor".
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const allEditors = serviceAccountEmail
    ? Array.from(new Set([...managerEmails, serviceAccountEmail]))
    : managerEmails;

  // 1. Get all sheets, existing protections, and filter views
  const meta = await withRetry(() => sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties,sheets.protectedRanges,sheets.basicFilter,sheets.filterViews",
  }), { label: "protectSheet.getMeta" });

  const allSheets = meta.data.sheets ?? [];
  if (allSheets.length === 0) {
    return { protected: 0, tabs: [], errors: ['No sheets found'] };
  }

  // 2. Remove ALL existing protections and filter views first (clean slate)
  const existingProtections: number[] = [];
  const existingFilterViewIds: number[] = [];
  for (const sheet of allSheets) {
    const ranges = (sheet as any).protectedRanges ?? [];
    for (const p of ranges) {
      if (p.protectedRangeId) {
        existingProtections.push(p.protectedRangeId);
      }
    }
    const filterViews = (sheet as any).filterViews ?? [];
    for (const fv of filterViews) {
      if (fv.filterViewId) {
        existingFilterViewIds.push(fv.filterViewId);
      }
    }
  }

  const cleanupRequests: any[] = [
    ...existingProtections.map(id => ({ deleteProtectedRange: { protectedRangeId: id } })),
    ...existingFilterViewIds.map(id => ({ deleteFilterView: { filterId: id } })),
  ];

  if (cleanupRequests.length > 0) {
    await withRetry(() => sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: cleanupRequests },
    }), { label: "protectSheet.deleteExisting" });
  }

  // 3. Build protection requests for each tab
  // Strategy: Protect the ENTIRE sheet, then define unprotectedRanges for editable columns.
  // Because the unprotected ranges are specific cell ranges (not full rows/columns),
  // Google Sheets will block row deletion, insertion, and movement.
  const protectRequests: any[] = [];
  const protectedTabs: string[] = [];

  for (const sheet of allSheets) {
    const sheetId = sheet.properties?.sheetId ?? 0;
    const title = sheet.properties?.title ?? 'Unknown';
    const maxRow = sheet.properties?.gridProperties?.rowCount ?? 1000;

    // Build unprotected ranges: each editable column from row 2 to maxRow
    // These are NOT full columns — they start at row 2 (index 1) to protect the header
    const unprotectedRanges = EDITABLE_COLUMNS.map(colIdx => ({
      sheetId,
      startRowIndex: 1,   // Row 2 (skip header)
      endRowIndex: maxRow, // To the last row
      startColumnIndex: colIdx,
      endColumnIndex: colIdx + 1,
    }));

    // Single protection for the entire sheet with unprotected editable areas
    protectRequests.push({
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId,
            // Protect entire sheet (no startRow/endRow = full sheet)
          },
          description: `Sheet protection - ${title} (agents can edit status/name/address/price/qty/phone/notes)`,
          warningOnly: false,
          editors: {
            users: allEditors,
          },
          unprotectedRanges,
        },
      },
    });

    protectedTabs.push(title);
  }

  // 4. Apply all protections in a single batch request
  if (protectRequests.length > 0) {
    try {
      await withRetry(() => sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: protectRequests },
      }), { label: "protectSheet.applyProtections" });
    } catch (err: any) {
      errors.push(`Failed to apply protections: ${err.message}`);
    }
  }

  // 5. Create Filter Views for each data tab so agents can filter on protected sheets
  // Filter Views are personal/temporary and don't modify data — they work even on protected sheets.
  // We create one filter view per tab covering columns A-M (the data columns).
  const FILTER_DATA_COLS = 13; // A through M
  const filterViewTabs: string[] = [];

  for (const sheet of allSheets) {
    const sheetId = sheet.properties?.sheetId ?? 0;
    const title = sheet.properties?.title ?? 'Unknown';
    const maxRow = sheet.properties?.gridProperties?.rowCount ?? 1000;

    try {
      await withRetry(() => sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            addFilterView: {
              filter: {
                title: `Filter - ${title}`,
                range: {
                  sheetId,
                  startRowIndex: 0,
                  endRowIndex: maxRow,
                  startColumnIndex: 0,
                  endColumnIndex: FILTER_DATA_COLS,
                },
              },
            },
          }],
        },
      }), { label: `protectSheet.addFilterView.${title}` });
      filterViewTabs.push(title);
    } catch (err: any) {
      // Some tabs (e.g., with tables) may fail — that's OK, skip them
      console.log(`[Protection] Skipped filter view for "${title}": ${err.message}`);
    }
  }

  console.log(`[Protection] Applied ${protectRequests.length} protections on ${protectedTabs.length} tabs, created ${filterViewTabs.length} filter views in spreadsheet ${spreadsheetId}`);
  return { protected: protectedTabs.length, tabs: protectedTabs, errors };
}

/**
 * Remove all protections from an agent's spreadsheet.
 * 
 * @param spreadsheetId - The Google Spreadsheet ID
 * @returns Summary of protections removed
 */
export async function removeSheetProtection(
  spreadsheetId: string,
): Promise<{ removed: number; tabs: string[] }> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  // Get all existing protections and filter views
  const meta = await withRetry(() => sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties,sheets.protectedRanges,sheets.filterViews",
  }), { label: "removeProtection.getMeta" });

  const allSheets = meta.data.sheets ?? [];
  const protectionIds: number[] = [];
  const filterViewIds: number[] = [];
  const affectedTabs: string[] = [];

  for (const sheet of allSheets) {
    const ranges = (sheet as any).protectedRanges ?? [];
    const filterViews = (sheet as any).filterViews ?? [];
    if (ranges.length > 0 || filterViews.length > 0) {
      affectedTabs.push(sheet.properties?.title ?? 'Unknown');
      for (const p of ranges) {
        if (p.protectedRangeId) {
          protectionIds.push(p.protectedRangeId);
        }
      }
      for (const fv of filterViews) {
        if (fv.filterViewId) {
          filterViewIds.push(fv.filterViewId);
        }
      }
    }
  }

  const deleteRequests: any[] = [
    ...protectionIds.map(id => ({ deleteProtectedRange: { protectedRangeId: id } })),
    ...filterViewIds.map(id => ({ deleteFilterView: { filterId: id } })),
  ];

  if (deleteRequests.length === 0) {
    return { removed: 0, tabs: [] };
  }

  await withRetry(() => sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: deleteRequests },
  }), { label: "removeProtection.delete" });

  console.log(`[Protection] Removed ${protectionIds.length} protections and ${filterViewIds.length} filter views from ${affectedTabs.length} tabs in spreadsheet ${spreadsheetId}`);
  return { removed: protectionIds.length, tabs: affectedTabs };
}
