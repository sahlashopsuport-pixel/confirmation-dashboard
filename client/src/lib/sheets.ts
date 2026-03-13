/**
 * Google Sheets Data Parser
 * 
 * Reads public Google Sheets via the gviz/tq CSV export endpoint.
 * Each confirmateur has their own sheet with Week 1-4 tabs (الأسبوع 1-4).
 * 
 * API: /gviz/tq?tqx=out:csv&sheet={TAB_NAME}
 * 
 * Column structure (from header):
 * 0: التاريخ (Date)
 * 1: الحالة (Status)
 * 2: الكمية (Quantity)
 * 3: التوصيل (Delivery)
 * 4: ملاحظة المكالمة (Call Note)
 * 5: الرمز (Code)
 * 6: اسم المنتج (Product Name)
 * 7: اسم الزبون (Customer Name)
 * 8: رقم الهاتف (Phone Number)
 * 9: العنوان 1 (Address 1)
 * 10: العنوان 2 (Address 2)
 * 11: السعر (Price)
 * 12: المرجع (Reference)
 */

export interface OrderRow {
  date: string;
  status: string;
  rawStatus: string;
  quantity: number;
  deliveryStatus: string;
  callNote: string;
  productCode: string;
  productName: string;
  customerName: string;
  phone: string;
  address: string;
  price: number;
  reference: string;
  week: number;
  orderType: string; // Column N: "NORMAL", "ABONDON", etc.
  productCategory: 'testicalm' | 'prostacalm' | 'menopause' | 'other'; // Detected from column G
  sheetRow?: number; // Original 1-indexed row number in the sheet (for date recovery)
}

export interface AgentData {
  name: string;
  sheetUrl: string;
  orders: OrderRow[];
  totalOrders: number;
  confirmed: number;
  cancelled: number;
  postponed: number;
  closedNumber: number;
  noAnswer: number;
  callbackAttempts: number;
  noStatus: number;
  other: number;
  confirmationRate: number;
  cancellationRate: number;
  /** Orders that have been attempted (totalOrders - noStatus) */
  workedOrders: number;
  /** Confirmation rate based on worked orders only (excludes untouched leads) */
  workedConfirmationRate: number;
  /** Cancellation rate based on worked orders only (excludes untouched leads) */
  workedCancellationRate: number;
  upsellCount: number;
  upsellRate: number;
  totalRevenue: number;
  avgOrderValue: number;
  dailyBreakdown: Record<string, { total: number; confirmed: number; cancelled: number }>;
  weeklyBreakdown: Record<number, { total: number; confirmed: number; cancelled: number; confirmationRate: number; cancellationRate: number }>;
  typeBreakdown: Record<string, { total: number; confirmed: number; cancelled: number; confirmationRate: number; cancellationRate: number }>;
  // Per-agent type counts for Viconis
  normalOrders: number;
  normalConfirmed: number;
  normalConfirmationRate: number;
  abandonedOrders: number;
  abandonedConfirmed: number;
  abandonedConfirmationRate: number;
  /** Lead Score: profit-based 0-100 score (Algeria only, -1 = not applicable) */
  leadScore: number;
  /** Number of rows that had data but empty/missing date (text-format date issue) */
  dateFormatWarning: number;

}

export interface SKUCallBreakdown {
  call1: number;
  call2: number;
  call3: number;
  call4: number;
  call5: number;
  call6: number;
  waiting: number;
  postponed: number;
  closed: number;
  noAnswer: number;
}

export interface SKUAgentBreakdown {
  agentName: string;
  totalOrders: number;
  confirmed: number;
  cancelled: number;
  postponed: number;
  other: number;
  confirmationRate: number;
  cancellationRate: number;
  callBreakdown: SKUCallBreakdown;
  /** Adjusted rates treating call6 as cancelled (SKU page only) */
  adjConfirmationRate: number;
  adjCancellationRate: number;
  adjCancelled: number;
}

export interface SKUData {
  sku: string;
  totalOrders: number;
  confirmed: number;
  cancelled: number;
  postponed: number;
  other: number;
  confirmationRate: number;
  cancellationRate: number;
  agentBreakdown: SKUAgentBreakdown[];
  callBreakdown: SKUCallBreakdown;
  /** Adjusted rates treating call6 as cancelled (SKU page only) */
  adjConfirmationRate: number;
  adjCancellationRate: number;
  adjCancelled: number;
}

export interface DashboardData {
  agents: AgentData[];
  totalOrders: number;
  totalConfirmed: number;
  totalCancelled: number;
  overallConfirmationRate: number;
  overallCancellationRate: number;
  /** Total orders that have been attempted across all agents */
  totalWorkedOrders: number;
  /** Overall confirmation rate based on worked orders only */
  overallWorkedConfirmationRate: number;
  /** Overall cancellation rate based on worked orders only */
  overallWorkedCancellationRate: number;
  /** Total untouched leads across all agents */
  totalNoStatus: number;
  lastUpdated: Date;
  typeBreakdown: Record<string, { total: number; confirmed: number; cancelled: number; confirmationRate: number; cancellationRate: number }>;
  // Normal-only totals for Viconis KPIs
  normalTotalOrders: number;
  normalTotalConfirmed: number;
  normalTotalCancelled: number;
  normalConfirmationRate: number;
}


// Known valid status values in Arabic
const VALID_STATUSES: Record<string, string> = {
  'تأكيد': 'confirmed',
  'تاكيد': 'confirmed',
  'إلغاء': 'cancelled',
  'الغاء': 'cancelled',
  'تأجيل': 'postponed',
  'تاجيل': 'postponed',
  'رقم مغلق': 'closed',
  'مغلق': 'closed',
  'لا يجيب': 'no_answer',
  'لايجيب': 'no_answer',
  'رقم خاطئ': 'wrong',
  'خاطئ': 'wrong',
  'مكرر': 'duplicate',
  'حذف': 'deleted',
  'قيد الانتظار': 'waiting',
};

// Callback attempt patterns (اتصل + number)
const CALLBACK_PATTERN = /^اتصل\s*\d+$/;

// Pattern for "حذف/يُحوّل" and similar compound statuses
const DELETE_TRANSFER_PATTERN = /حذف|يُحوّل|يحول/;

function normalizeStatus(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return 'no_status';
  
  // Direct match
  if (VALID_STATUSES[trimmed]) return VALID_STATUSES[trimmed];
  
  // Callback attempts (اتصل 2, اتصل 5, اتصل 6, etc.)
  if (CALLBACK_PATTERN.test(trimmed)) return 'callback';
  
  // Delete/transfer pattern
  if (DELETE_TRANSFER_PATTERN.test(trimmed)) return 'deleted';
  
  // Partial match - check if the status contains a known value
  for (const [key, value] of Object.entries(VALID_STATUSES)) {
    if (trimmed.includes(key)) return value;
  }
  
  // If it looks like a customer name (contains "sh" or is very long), skip it
  if (trimmed.includes('sh0') || trimmed.includes('sh08') || trimmed.length > 30) return null;
  
  // If it contains digits and Arabic text mixed (like phone numbers), skip
  if (/^\d{5,}/.test(trimmed)) return null;
  
  // Unknown but non-empty — could be a valid status we don't know
  return 'other';
}

/**
 * Extract the sheet ID from a Google Sheets URL
 */
export function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

/**
 * Week tab names in Arabic
 */
const WEEK_TAB_NAMES = [
  'الأسبوع 1',
  'الأسبوع 2',
  'الأسبوع 3',
  'الأسبوع 4',
];

/**
 * Fetch a Google Sheet tab as CSV using the gviz endpoint (works with tab names)
 * Used as FALLBACK when Apps Script is unavailable.
 */
async function fetchSheetByName(sheetId: string, tabName: string): Promise<string> {
  const encodedName = encodeURIComponent(tabName);
  // Add cache-busting parameter to prevent browser/CDN caching stale data
  const cacheBuster = Date.now();
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodedName}&_cb=${cacheBuster}`;
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch tab "${tabName}": ${response.status}`);
  }
  const text = await response.text();
  // Check if the response is an error page (Google returns HTML for invalid tabs)
  if (text.includes('<!DOCTYPE') || text.includes('<html')) {
    throw new Error(`Tab "${tabName}" not found or not accessible`);
  }
  return text;
}

/**
 * Apps Script response shape:
 * { title: string, tabs: { [tabName]: { rows: string[][] } } }
 * Each row is an array of cell values as display strings (no header row).
 */
interface AppsScriptResponse {
  title: string;
  tabs: Record<string, { rows: string[][] }>;
  error?: string;
}

/**
 * Fetch ALL weekly tabs from a Google Sheet in a single call via the
 * standalone Apps Script endpoint. Returns the sheet title and all tab data.
 *
 * The Apps Script uses getDisplayValues() which correctly reads both
 * Date objects and text-formatted dates — permanently fixing the GViz
 * date-format issue where text-formatted dates are returned as empty.
 *
 * One call per agent instead of 8 calls (4 tabs × 2 queries each).
 */
async function fetchSheetViaAppsScript(sheetId: string): Promise<AppsScriptResponse | null> {
  const baseUrl = import.meta.env.VITE_APPS_SCRIPT_URL;
  if (!baseUrl) return null; // Apps Script not configured, fall back to GViz

  try {
    const url = `${baseUrl}?id=${sheetId}&_cb=${Date.now()}`;
    const response = await fetch(url, {
      redirect: 'follow',
      cache: 'no-store',
    });
    if (!response.ok) return null;

    const data: AppsScriptResponse = await response.json();
    if (data.error) {
      console.warn(`[AppsScript] Error for ${sheetId}: ${data.error}`);
      return null;
    }
    return data;
  } catch (err) {
    console.warn(`[AppsScript] Failed for ${sheetId}:`, err);
    return null;
  }
}

/**
 * Fetch ONLY column A (dates) using a range-based GViz query.
 *
 * WHY: The full-sheet GViz query infers column types. When column A is typed
 * as "date", cells containing text-formatted dates (e.g. "26/02/2026" stored
 * as plain text instead of a Date object) are returned as empty/null even
 * though the dates are clearly visible in the sheet.
 *
 * A range-based query (range=A:A) avoids this type-inference bug and returns
 * the raw cell values correctly.
 *
 * Returns a Map<number, string> mapping 1-based sheet row number to date string.
 */
async function fetchDateColumn(sheetId: string, tabName: string): Promise<Map<number, string>> {
  const encodedName = encodeURIComponent(tabName);
  const cacheBuster = Date.now();
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodedName}&range=A:A&_cb=${cacheBuster}`;
  const dateMap = new Map<number, string>();

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) return dateMap;
    const text = await response.text();
    if (text.includes('<!DOCTYPE') || text.includes('<html')) return dateMap;

    const lines = text.split('\n').filter(l => l.trim());
    // Skip header (line 0). Line i corresponds to sheet row i+1 (1-indexed)
    for (let i = 1; i < lines.length; i++) {
      const val = lines[i].replace(/^"|"$/g, '').trim();
      if (val && val !== '\u0627\u0644\u062a\u0627\u0631\u064a\u062e') {
        // Store with sheet row number (i+1 because header is row 1)
        dateMap.set(i + 1, val);
      }
    }
  } catch {
    // Non-critical: if this fails, we fall back to the full-sheet dates
  }

  return dateMap;
}

/**
 * Parse CSV string into rows. Handles quoted fields from gviz output.
 */
function parseCSV(csv: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;
  
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    const nextChar = csv[i + 1];
    
    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentCell += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentCell);
        currentCell = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentCell);
        currentCell = '';
        rows.push(currentRow);
        currentRow = [];
        if (char === '\r') i++;
      } else {
        currentCell += char;
      }
    }
  }
  
  // Last row
  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }
  
  return rows;
}

/**
 * Extract agent name from sheet title HTML
 */
async function fetchAgentName(sheetId: string): Promise<string> {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
    const response = await fetch(url);
    const html = await response.text();
    
    const titleMatch = html.match(/<title>(.*?)<\/title>/);
    if (titleMatch) {
      const title = titleMatch[1];
      // Pattern: "NAME CONFIRMATION XX YYYY - Google Sheets"
      const nameMatch = title.match(/^(.*?)\s*(?:CONFIRMATION|confirmation|تأكيد)/i);
      if (nameMatch) {
        return nameMatch[1].trim();
      }
      return title.replace(/\s*-\s*(?:Google Sheets|Hojas de cálculo de Google).*$/i, '').trim();
    }
  } catch {
    // Ignore errors
  }
  return `Agent`;
}

/**
 * Normalize various date string formats to dd/mm/yyyy.
 * Handles:
 * - Already correct: "25/02/2026" → pass through
 * - =DATE(y,m,d) formula text: "=DATE(2026,2,23)" → "23/02/2026"
 * - ISO format: "2026-02-23" → "23/02/2026"
 * - Dash-separated: "23-02-2026" → "23/02/2026"
 * - Dot-separated: "23.02.2026" → "23/02/2026"
 * - US format mm/dd/yyyy is NOT handled (ambiguous with dd/mm/yyyy)
 * - Empty/unrecognized: returns as-is
 */
export function normalizeDateString(raw: string): string {
  if (!raw) return '';
  const s = raw.trim();
  
  // Already dd/mm/yyyy or d/m/yyyy
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) return s;
  
  // =DATE(year, month, day) formula stored as text
  const dateFormula = s.match(/^=DATE\s*\(\s*(\d{4})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})\s*\)$/i);
  if (dateFormula) {
    const [, year, month, day] = dateFormula;
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  }
  
  // ISO format: yyyy-mm-dd or yyyy-mm-ddT...
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}/${month}/${year}`;
  }
  
  // Dash-separated dd-mm-yyyy
  const dashMatch = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const [, day, month, year] = dashMatch;
    return `${day}/${month}/${year}`;
  }
  
  // Dot-separated dd.mm.yyyy
  const dotMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotMatch) {
    const [, day, month, year] = dotMatch;
    return `${day}/${month}/${year}`;
  }
  
  // Google Sheets serial date number (days since Dec 30, 1899)
  const num = Number(s);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    // Convert serial to date
    const epoch = new Date(1899, 11, 30); // Dec 30, 1899
    const d = new Date(epoch.getTime() + num * 86400000);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear().toString();
    return `${day}/${month}/${year}`;
  }
  
  // Unrecognized — return as-is
  return s;
}

/**
 * Parse order rows from CSV data
 */
function parseOrders(csvRows: string[][], weekNumber: number, dateMap?: Map<number, string>): { orders: OrderRow[]; dateWarningCount: number } {
  const orders: OrderRow[] = [];
  let dateWarningCount = 0;
  
  // Skip header row (row 0)
  for (let i = 1; i < csvRows.length; i++) {
    const row = csvRows[i];
    if (!row || row.length < 8) continue;
    
    const rawDate = row[0]?.trim() || '';
    const rawStatus = row[1]?.trim() || '';
    
    // Skip header rows
    if (rawDate === 'التاريخ' || rawStatus === 'الحالة') continue;
    
    // Normalize status — returns null for invalid/spillover rows
    const status = normalizeStatus(rawStatus);
    
    // If status is null (invalid spillover data), skip the row entirely
    if (!status) continue;
    
    // If status is 'no_status' (empty), only include if row has actual lead data
    // (product name or customer name or phone number present)
    if (status === 'no_status') {
      const hasProduct = !!(row[6]?.trim());
      const hasCustomerName = !!(row[7]?.trim());
      const hasPhone = !!(row[8]?.trim());
      if (!hasProduct && !hasCustomerName && !hasPhone) continue;
    }
    
    // Try to normalize the date to dd/mm/yyyy format
    let date = normalizeDateString(rawDate);
    
    // If date is empty/invalid, try recovering from the range-based date column
    // (GViz full-sheet CSV drops text-formatted dates due to type inference)
    if (!date || date === '') {
      const sheetRow = i + 1; // CSV row i (0-indexed) = sheet row i+1
      const recoveredDate = dateMap?.get(sheetRow);
      if (recoveredDate) {
        date = normalizeDateString(recoveredDate);
      }
    }
    
    // Check if date is valid
    const hasValidDate = /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(date);
    
    if (!hasValidDate) {
      // Empty or unrecognized date — count as warning so team can fix it in the sheet
      // The order is still included with 'Unknown' date so it's not lost from totals
      dateWarningCount++;
    }
    
    // If date is not valid and not empty (some garbage text), skip the row
    if (!hasValidDate && date !== '') continue;
    
    const priceStr = row[11]?.trim() || '0';
    const price = parseFloat(priceStr.replace(/[^\d.]/g, '')) || 0;
    const quantity = parseInt(row[2]?.trim() || '1') || 1;
    
    // Detect product category from column G (اسم المنتج)
    const productNameRaw = (row[6]?.trim() || '').toLowerCase();
    let productCategory: 'testicalm' | 'prostacalm' | 'menopause' | 'other' = 'other';
    if (productNameRaw.includes('prostacalm') || productNameRaw.includes('prostcalm')) {
      productCategory = 'prostacalm';
    } else if (productNameRaw.includes('testicalm')) {
      productCategory = 'testicalm';
    } else if (productNameRaw.includes('meno')) {
      productCategory = 'menopause';
    }

    orders.push({
      date: date || 'Unknown',
      status,
      rawStatus,
      quantity,
      deliveryStatus: row[3]?.trim() || '',
      callNote: row[4]?.trim() || '',
      productCode: row[5]?.trim() || '',
      productName: row[6]?.trim() || '',
      customerName: row[7]?.trim() || '',
      phone: row[8]?.trim() || '',
      address: row[9]?.trim() || '',
      price,
      reference: row[12]?.trim() || '',
      week: weekNumber,
      orderType: (row[13]?.trim() || '').toUpperCase() || '',
      productCategory,
      sheetRow: i + 1, // CSV row i (0-indexed) = sheet row i+1 (1-indexed, header is row 1)
    });
  }
  
  return { orders, dateWarningCount };
}

/**
 * Calculate agent statistics from orders
 */
function calculateAgentStats(name: string, sheetUrl: string, orders: OrderRow[]): AgentData {
  const totalOrders = orders.length;
  const confirmed = orders.filter(o => o.status === 'confirmed').length;
  const cancelled = orders.filter(o => o.status === 'cancelled').length;
  const postponed = orders.filter(o => o.status === 'postponed').length;
  const closedNumber = orders.filter(o => o.status === 'closed').length;
  const noAnswer = orders.filter(o => o.status === 'no_answer').length;
  const callbackAttempts = orders.filter(o => o.status === 'callback').length;
  const noStatusCount = orders.filter(o => o.status === 'no_status').length;
  const other = totalOrders - confirmed - cancelled - postponed - closedNumber - noAnswer - callbackAttempts - noStatusCount;
  
  // Count upsells: orders where quantity > 1 (customer bought 2+ pieces)
  const upsellCount = orders.filter(o => o.quantity > 1).length;
  
  const confirmedOrders = orders.filter(o => o.status === 'confirmed');
  const totalRevenue = confirmedOrders.reduce((sum, o) => sum + o.price, 0);
  
  // Daily breakdown
  const dailyBreakdown: Record<string, { total: number; confirmed: number; cancelled: number }> = {};
  for (const order of orders) {
    const key = order.date;
    if (!dailyBreakdown[key]) {
      dailyBreakdown[key] = { total: 0, confirmed: 0, cancelled: 0 };
    }
    dailyBreakdown[key].total++;
    if (order.status === 'confirmed') dailyBreakdown[key].confirmed++;
    if (order.status === 'cancelled') dailyBreakdown[key].cancelled++;
  }
  
  // Weekly breakdown
  const weeklyBreakdown: Record<number, { total: number; confirmed: number; cancelled: number; confirmationRate: number; cancellationRate: number }> = {};
  for (let w = 1; w <= 4; w++) {
    const weekOrders = orders.filter(o => o.week === w);
    const wTotal = weekOrders.length;
    const wConfirmed = weekOrders.filter(o => o.status === 'confirmed').length;
    const wCancelled = weekOrders.filter(o => o.status === 'cancelled').length;
    weeklyBreakdown[w] = {
      total: wTotal,
      confirmed: wConfirmed,
      cancelled: wCancelled,
      confirmationRate: wTotal > 0 ? (wConfirmed / wTotal) * 100 : 0,
      cancellationRate: wTotal > 0 ? (wCancelled / wTotal) * 100 : 0,
    };
  }
  
  // Type breakdown (NORMAL vs ABONDON etc.)
  const typeBreakdown: Record<string, { total: number; confirmed: number; cancelled: number; confirmationRate: number; cancellationRate: number }> = {};
  for (const order of orders) {
    const type = order.orderType || 'UNKNOWN';
    if (!typeBreakdown[type]) {
      typeBreakdown[type] = { total: 0, confirmed: 0, cancelled: 0, confirmationRate: 0, cancellationRate: 0 };
    }
    typeBreakdown[type].total++;
    if (order.status === 'confirmed') typeBreakdown[type].confirmed++;
    if (order.status === 'cancelled') typeBreakdown[type].cancelled++;
  }
  // Calculate rates for each type
  for (const type of Object.keys(typeBreakdown)) {
    const t = typeBreakdown[type];
    t.confirmationRate = t.total > 0 ? (t.confirmed / t.total) * 100 : 0;
    t.cancellationRate = t.total > 0 ? (t.cancelled / t.total) * 100 : 0;
  }
  
  // Per-agent normal vs abandoned counts (empty orderType = UNKNOWN, not NORMAL)
  const normalOrders = orders.filter(o => o.orderType === 'NORMAL').length;
  const normalConfirmedCount = orders.filter(o => o.orderType === 'NORMAL' && o.status === 'confirmed').length;
  const abandonedOrders = orders.filter(o => o.orderType === 'ABONDON' || o.orderType === 'ABANDONED').length;
  const abandonedConfirmedCount = orders.filter(o => (o.orderType === 'ABONDON' || o.orderType === 'ABANDONED') && o.status === 'confirmed').length;

  return {
    name,
    sheetUrl,
    orders,
    totalOrders,
    confirmed,
    cancelled,
    postponed,
    closedNumber,
    noAnswer,
    callbackAttempts,
    noStatus: noStatusCount,
    other,
    confirmationRate: totalOrders > 0 ? (confirmed / totalOrders) * 100 : 0,
    cancellationRate: totalOrders > 0 ? (cancelled / totalOrders) * 100 : 0,
    workedOrders: totalOrders - noStatusCount,
    workedConfirmationRate: (totalOrders - noStatusCount) > 0 ? (confirmed / (totalOrders - noStatusCount)) * 100 : 0,
    workedCancellationRate: (totalOrders - noStatusCount) > 0 ? (cancelled / (totalOrders - noStatusCount)) * 100 : 0,
    upsellCount,
    upsellRate: totalOrders > 0 ? (upsellCount / totalOrders) * 100 : 0,
    totalRevenue,
    avgOrderValue: confirmed > 0 ? totalRevenue / confirmed : 0,
    dailyBreakdown,
    weeklyBreakdown,
    typeBreakdown,
    normalOrders,
    normalConfirmed: normalConfirmedCount,
    normalConfirmationRate: normalOrders > 0 ? (normalConfirmedCount / normalOrders) * 100 : 0,
    abandonedOrders,
    abandonedConfirmed: abandonedConfirmedCount,
    abandonedConfirmationRate: abandonedOrders > 0 ? (abandonedConfirmedCount / abandonedOrders) * 100 : 0,
    leadScore: -1, // Calculated after all agents are loaded
    dateFormatWarning: 0, // Set by loadSheetData after parsing
  };
}


/**
 * Main function: Load data from a single Google Sheet.
 *
 * PRIMARY: Uses Apps Script endpoint (1 call per agent, reads all 4 tabs,
 * correctly handles text-formatted dates via getDisplayValues()).
 *
 * FALLBACK: If Apps Script is unavailable, falls back to GViz CSV endpoint
 * (8 calls per agent: 4 tabs × 2 queries each).
 */
export async function loadSheetData(
  sheetUrl: string,
  onProgress?: (msg: string) => void,
  knownAgentName?: string
): Promise<AgentData> {
  const sheetId = extractSheetId(sheetUrl);
  if (!sheetId) {
    throw new Error('Invalid Google Sheets URL. Please paste a valid link.');
  }
  
  // Use known agent name from DB if it's a real name, otherwise fetch from sheet title
  const isGenericName = !knownAgentName || 
    knownAgentName === 'Agent' || 
    /^Agent\s*\d+$/i.test(knownAgentName) ||
    knownAgentName.trim() === '';
  
  let agentName: string;
  if (!isGenericName) {
    agentName = knownAgentName!;
    onProgress?.(`Loading: ${agentName}`);
  } else {
    onProgress?.('Fetching sheet info...');
    agentName = await fetchAgentName(sheetId);
    onProgress?.(`Found agent: ${agentName}`);
  }
  
  const allOrders: OrderRow[] = [];
  let totalDateWarnings = 0;

  // ── Try Apps Script first (1 call, all tabs, no date issues) ──
  onProgress?.(`Loading via Apps Script...`);
  const appsScriptData = await fetchSheetViaAppsScript(sheetId);

  if (appsScriptData && appsScriptData.tabs) {
    // Use sheet title from Apps Script if we don't have a known name
    if (isGenericName && appsScriptData.title) {
      const titleMatch = appsScriptData.title.match(/^(.*?)\s*(?:CONFIRMATION|confirmation|تأكيد)/i);
      if (titleMatch) {
        agentName = titleMatch[1].trim();
      } else {
        agentName = appsScriptData.title.replace(/\s*-\s*(?:Google Sheets).*$/i, '').trim();
      }
    }

    for (let weekIdx = 0; weekIdx < WEEK_TAB_NAMES.length; weekIdx++) {
      const tabName = WEEK_TAB_NAMES[weekIdx];
      const weekNum = weekIdx + 1;
      const tabData = appsScriptData.tabs[tabName];

      if (!tabData || !tabData.rows || tabData.rows.length === 0) {
        onProgress?.(`Week ${weekNum}: empty`);
        continue;
      }

      // Apps Script returns data rows only (no header).
      // Prepend a dummy header row so parseOrders() can skip row 0 as usual.
      const rowsWithHeader: string[][] = [
        ['التاريخ', 'الحالة', 'الكمية', 'التوصيل', 'ملاحظة', 'الرمز', 'المنتج', 'الزبون', 'الهاتف', 'العنوان1', 'العنوان2', 'السعر', 'المرجع', 'النوع'],
        ...tabData.rows,
      ];

      const { orders, dateWarningCount } = parseOrders(rowsWithHeader, weekNum);
      totalDateWarnings += dateWarningCount;
      onProgress?.(`Week ${weekNum}: ${orders.length} orders (Apps Script)${dateWarningCount > 0 ? ` ⚠ ${dateWarningCount} missing dates` : ''}`);
      allOrders.push(...orders);
    }

    onProgress?.(`Total: ${allOrders.length} orders loaded via Apps Script. Calculating stats...`);
  } else {
    // ── Fallback: GViz CSV endpoint ──
    onProgress?.(`Apps Script unavailable, falling back to GViz...`);
    onProgress?.(`Loading ${WEEK_TAB_NAMES.length} week tabs...`);

    const tabResults = await Promise.allSettled(
      WEEK_TAB_NAMES.map((tabName, i) =>
        Promise.all([
          fetchSheetByName(sheetId, tabName),
          fetchDateColumn(sheetId, tabName),
        ]).then(([csv, dateMap]) => ({ csv, dateMap, tabName, weekNum: i + 1 }))
      )
    );

    for (const result of tabResults) {
      if (result.status === 'fulfilled') {
        const { csv, dateMap, tabName, weekNum } = result.value;
        const rows = parseCSV(csv);
        if (rows.length <= 1) {
          onProgress?.(`Week ${weekNum}: empty or header only`);
          continue;
        }
        const { orders, dateWarningCount } = parseOrders(rows, weekNum, dateMap);
        totalDateWarnings += dateWarningCount;
        onProgress?.(`Week ${weekNum}: ${orders.length} orders (GViz)${dateWarningCount > 0 ? ` ⚠ ${dateWarningCount} missing dates` : ''}`);
        allOrders.push(...orders);
      } else {
        const idx = tabResults.indexOf(result);
        const weekNum = idx + 1;
        const errMsg = result.reason instanceof Error ? result.reason.message : 'not found';
        onProgress?.(`Week ${weekNum}: skipped (${errMsg})`);
      }
    }
  }
  
  onProgress?.(`Total: ${allOrders.length} orders loaded. Calculating stats...`);
  if (totalDateWarnings > 0) {
    onProgress?.(`⚠️ ${totalDateWarnings} rows with missing dates`);
  }
  
  const agentData = calculateAgentStats(agentName, sheetUrl, allOrders);
  agentData.dateFormatWarning = totalDateWarnings;
  return agentData;
}

/**
 * Load multiple sheets and create dashboard data
 */
/**
 * Aggregate all orders by SKU (reference column M) across all agents
 * Returns sorted by total orders descending
 */
function emptyCallBreakdown(): SKUCallBreakdown {
  return { call1: 0, call2: 0, call3: 0, call4: 0, call5: 0, call6: 0, waiting: 0, postponed: 0, closed: 0, noAnswer: 0 };
}

function classifyCallStatus(rawStatus: string, normalizedStatus: string): keyof SKUCallBreakdown | null {
  if (!rawStatus) return null;
  const trimmed = rawStatus.trim();
  // Match اتصل 1 through اتصل 6
  const callMatch = trimmed.match(/^\u0627\u062a\u0635\u0644\s*(\d+)$/);
  if (callMatch) {
    const num = parseInt(callMatch[1]);
    if (num >= 1 && num <= 6) return `call${num}` as keyof SKUCallBreakdown;
  }
  if (normalizedStatus === 'waiting') return 'waiting';
  if (normalizedStatus === 'postponed') return 'postponed';
  if (normalizedStatus === 'closed') return 'closed';
  if (normalizedStatus === 'no_answer') return 'noAnswer';
  return null;
}

/**
 * Strip upsell suffix from SKU name to get the base campaign name.
 * Matches any trailing word ending in "upsell" (case-insensitive).
 * E.g., "sku-name testicalmupsell" → "sku-name"
 */
function stripUpsellSuffix(sku: string): string {
  return sku.replace(/\s+\S*upsell\s*$/i, '').trim();
}

/**
 * Normalize SKU name: lowercase, collapse whitespace, trim, strip upsell suffix.
 * Used as grouping key so "SKU Name", "sku  name", and "sku name testicalmupsell"
 * all map to the same entry.
 */
function normalizeAndStripSKU(sku: string): string {
  const stripped = stripUpsellSuffix(sku);
  return stripped.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function aggregateSKUData(agents: AgentData[]): SKUData[] {
  // Track totals per normalized SKU key and per SKU+agent
  // displayNames maps normalized key → best display name (non-upsell, most common)
  const skuMap: Record<string, { total: number; confirmed: number; cancelled: number; postponed: number; noStatus: number; other: number; callBreakdown: SKUCallBreakdown }> = {};
  const skuAgentMap: Record<string, Record<string, { total: number; confirmed: number; cancelled: number; postponed: number; noStatus: number; other: number; callBreakdown: SKUCallBreakdown }>> = {};
  const displayNames: Record<string, { name: string; count: number }> = {};

  for (const agent of agents) {
    for (const order of agent.orders) {
      const rawSku = order.reference?.trim() || 'UNKNOWN';
      // Normalize: strip upsell suffix + lowercase + collapse whitespace
      const sku = rawSku === 'UNKNOWN' ? 'UNKNOWN' : normalizeAndStripSKU(rawSku);

      // Track best display name (prefer the non-upsell original, pick the most frequent)
      const baseDisplay = stripUpsellSuffix(rawSku);
      if (!displayNames[sku] || (baseDisplay === rawSku && displayNames[sku].name !== baseDisplay)) {
        // Prefer non-upsell variant as display name
        if (baseDisplay === rawSku) {
          displayNames[sku] = { name: baseDisplay, count: (displayNames[sku]?.count || 0) + 1 };
        } else if (!displayNames[sku]) {
          displayNames[sku] = { name: baseDisplay, count: 1 };
        }
      } else {
        displayNames[sku].count++;
      }

      // SKU totals
      if (!skuMap[sku]) {
        skuMap[sku] = { total: 0, confirmed: 0, cancelled: 0, postponed: 0, noStatus: 0, other: 0, callBreakdown: emptyCallBreakdown() };
      }
      skuMap[sku].total++;
      if (order.status === 'confirmed') skuMap[sku].confirmed++;
      else if (order.status === 'cancelled') skuMap[sku].cancelled++;
      else if (order.status === 'postponed') skuMap[sku].postponed++;
      else if (order.status === 'no_status') skuMap[sku].noStatus++;
      else skuMap[sku].other++;

      // Track call breakdown
      const callKey = classifyCallStatus(order.rawStatus, order.status);
      if (callKey) skuMap[sku].callBreakdown[callKey]++;

      // Per-agent breakdown within SKU
      if (!skuAgentMap[sku]) skuAgentMap[sku] = {};
      if (!skuAgentMap[sku][agent.name]) {
        skuAgentMap[sku][agent.name] = { total: 0, confirmed: 0, cancelled: 0, postponed: 0, noStatus: 0, other: 0, callBreakdown: emptyCallBreakdown() };
      }
      skuAgentMap[sku][agent.name].total++;
      if (order.status === 'confirmed') skuAgentMap[sku][agent.name].confirmed++;
      else if (order.status === 'cancelled') skuAgentMap[sku][agent.name].cancelled++;
      else if (order.status === 'postponed') skuAgentMap[sku][agent.name].postponed++;
      else if (order.status === 'no_status') skuAgentMap[sku][agent.name].noStatus++;
      else skuAgentMap[sku][agent.name].other++;
      if (callKey) skuAgentMap[sku][agent.name].callBreakdown[callKey]++;
    }
  }

  const skuList: SKUData[] = Object.entries(skuMap).map(([sku, stats]) => {
    // Build agent breakdown for this SKU, sorted by conf rate descending
    const agentBreakdown: SKUAgentBreakdown[] = Object.entries(skuAgentMap[sku] || {}).map(([agentName, aStats]) => {
      // Adjusted: treat call6 as cancelled for SKU-level analysis
      const adjCancelled = aStats.cancelled + aStats.callBreakdown.call6;
      // Exclude noStatus (untried) leads from denominator — only count leads with at least 1 status
      const workedOrders = aStats.total - aStats.noStatus;
      return {
        agentName,
        totalOrders: aStats.total,
        confirmed: aStats.confirmed,
        cancelled: aStats.cancelled,
        postponed: aStats.postponed,
        other: aStats.other,
        confirmationRate: aStats.total > 0 ? (aStats.confirmed / aStats.total) * 100 : 0,
        cancellationRate: aStats.total > 0 ? (aStats.cancelled / aStats.total) * 100 : 0,
        callBreakdown: { ...aStats.callBreakdown },
        adjCancelled,
        adjConfirmationRate: workedOrders > 0 ? (aStats.confirmed / workedOrders) * 100 : 0,
        adjCancellationRate: workedOrders > 0 ? (adjCancelled / workedOrders) * 100 : 0,
      };
    });
    agentBreakdown.sort((a, b) => b.adjConfirmationRate - a.adjConfirmationRate);

    // Adjusted: treat call6 as cancelled for SKU-level analysis
    const adjCancelled = stats.cancelled + stats.callBreakdown.call6;
    // Exclude noStatus (untried) leads from denominator — only count leads with at least 1 status
    const workedOrders = stats.total - stats.noStatus;
    // Use the original display name instead of the normalized key
    const display = displayNames[sku]?.name || sku;
    return {
      sku: display,
      totalOrders: stats.total,
      confirmed: stats.confirmed,
      cancelled: stats.cancelled,
      postponed: stats.postponed,
      other: stats.other,
      confirmationRate: stats.total > 0 ? (stats.confirmed / stats.total) * 100 : 0,
      cancellationRate: stats.total > 0 ? (stats.cancelled / stats.total) * 100 : 0,
      agentBreakdown,
      callBreakdown: { ...stats.callBreakdown },
      adjCancelled,
      adjConfirmationRate: workedOrders > 0 ? (stats.confirmed / workedOrders) * 100 : 0,
      adjCancellationRate: workedOrders > 0 ? (adjCancelled / workedOrders) * 100 : 0,
    };
  });

  // Sort by total orders descending
  skuList.sort((a, b) => b.totalOrders - a.totalOrders);

  return skuList;
}

/**
 * Product categories for filtering
 */
export type ProductCategory = 'all' | 'testicalm' | 'prostacalm' | 'menopause' | 'other';

/**
 * Recompute agent stats from a subset of orders (filtered by product)
 */
function recalcAgentFromOrders(agent: AgentData, filteredOrders: OrderRow[]): AgentData {
  const totalOrders = filteredOrders.length;
  const confirmed = filteredOrders.filter(o => o.status === 'confirmed').length;
  const cancelled = filteredOrders.filter(o => o.status === 'cancelled').length;
  const postponed = filteredOrders.filter(o => o.status === 'postponed').length;
  const closedNumber = filteredOrders.filter(o => o.status === 'closed').length;
  const noAnswer = filteredOrders.filter(o => o.status === 'no_answer').length;
  const callbackAttempts = filteredOrders.filter(o => o.status === 'callback').length;
  const noStatusCount = filteredOrders.filter(o => o.status === 'no_status').length;
  const other = totalOrders - confirmed - cancelled - postponed - closedNumber - noAnswer - callbackAttempts - noStatusCount;
  const upsellCount = filteredOrders.filter(o => o.quantity > 1).length;
  const confirmedOrders = filteredOrders.filter(o => o.status === 'confirmed');
  const totalRevenue = confirmedOrders.reduce((sum, o) => sum + o.price, 0);

  // Daily breakdown
  const dailyBreakdown: Record<string, { total: number; confirmed: number; cancelled: number }> = {};
  for (const order of filteredOrders) {
    const key = order.date;
    if (!dailyBreakdown[key]) dailyBreakdown[key] = { total: 0, confirmed: 0, cancelled: 0 };
    dailyBreakdown[key].total++;
    if (order.status === 'confirmed') dailyBreakdown[key].confirmed++;
    if (order.status === 'cancelled') dailyBreakdown[key].cancelled++;
  }

  // Weekly breakdown
  const weeklyBreakdown: Record<number, { total: number; confirmed: number; cancelled: number; confirmationRate: number; cancellationRate: number }> = {};
  for (let w = 1; w <= 4; w++) {
    const weekOrders = filteredOrders.filter(o => o.week === w);
    const wTotal = weekOrders.length;
    const wConfirmed = weekOrders.filter(o => o.status === 'confirmed').length;
    const wCancelled = weekOrders.filter(o => o.status === 'cancelled').length;
    weeklyBreakdown[w] = {
      total: wTotal, confirmed: wConfirmed, cancelled: wCancelled,
      confirmationRate: wTotal > 0 ? (wConfirmed / wTotal) * 100 : 0,
      cancellationRate: wTotal > 0 ? (wCancelled / wTotal) * 100 : 0,
    };
  }

  // Type breakdown
  const typeBreakdown: Record<string, { total: number; confirmed: number; cancelled: number; confirmationRate: number; cancellationRate: number }> = {};
  for (const order of filteredOrders) {
    const type = order.orderType || 'UNKNOWN';
    if (!typeBreakdown[type]) typeBreakdown[type] = { total: 0, confirmed: 0, cancelled: 0, confirmationRate: 0, cancellationRate: 0 };
    typeBreakdown[type].total++;
    if (order.status === 'confirmed') typeBreakdown[type].confirmed++;
    if (order.status === 'cancelled') typeBreakdown[type].cancelled++;
  }
  for (const type of Object.keys(typeBreakdown)) {
    const t = typeBreakdown[type];
    t.confirmationRate = t.total > 0 ? (t.confirmed / t.total) * 100 : 0;
    t.cancellationRate = t.total > 0 ? (t.cancelled / t.total) * 100 : 0;
  }

  const normalOrders = filteredOrders.filter(o => o.orderType === 'NORMAL').length;
  const normalConfirmedCount = filteredOrders.filter(o => o.orderType === 'NORMAL' && o.status === 'confirmed').length;
  const abandonedOrders = filteredOrders.filter(o => o.orderType === 'ABONDON' || o.orderType === 'ABANDONED').length;
  const abandonedConfirmedCount = filteredOrders.filter(o => (o.orderType === 'ABONDON' || o.orderType === 'ABANDONED') && o.status === 'confirmed').length;

  return {
    ...agent,
    orders: filteredOrders,
    totalOrders, confirmed, cancelled, postponed, closedNumber, noAnswer, callbackAttempts, noStatus: noStatusCount, other,
    confirmationRate: totalOrders > 0 ? (confirmed / totalOrders) * 100 : 0,
    cancellationRate: totalOrders > 0 ? (cancelled / totalOrders) * 100 : 0,
    workedOrders: totalOrders - noStatusCount,
    workedConfirmationRate: (totalOrders - noStatusCount) > 0 ? (confirmed / (totalOrders - noStatusCount)) * 100 : 0,
    workedCancellationRate: (totalOrders - noStatusCount) > 0 ? (cancelled / (totalOrders - noStatusCount)) * 100 : 0,
    upsellCount,
    upsellRate: totalOrders > 0 ? (upsellCount / totalOrders) * 100 : 0,
    totalRevenue,
    avgOrderValue: confirmed > 0 ? totalRevenue / confirmed : 0,
    dailyBreakdown, weeklyBreakdown, typeBreakdown,
    normalOrders,
    normalConfirmed: normalConfirmedCount,
    normalConfirmationRate: normalOrders > 0 ? (normalConfirmedCount / normalOrders) * 100 : 0,
    abandonedOrders,
    abandonedConfirmed: abandonedConfirmedCount,
    abandonedConfirmationRate: abandonedOrders > 0 ? (abandonedConfirmedCount / abandonedOrders) * 100 : 0,
    leadScore: -1, // Calculated after all agents are loaded
    dateFormatWarning: 0, // Set by loadSheetData after parsing
  };
}

/**
 * Extract all unique product names from dashboard data, sorted by order count descending
 */
export function getUniqueProductNames(data: DashboardData): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const agent of data.agents) {
    for (const order of agent.orders) {
      const name = (order.productName || '').trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Filter dashboard data by a set of product names (multi-select)
 * Returns a new DashboardData with agents recalculated for only matching orders
 */
export async function filterDashboardByProductNames(data: DashboardData, productNames: Set<string>): Promise<DashboardData> {
  if (productNames.size === 0) return data;

  const filteredAgents = data.agents.map(agent => {
    const filteredOrders = agent.orders.filter(o => productNames.has((o.productName || '').trim()));
    return recalcAgentFromOrders(agent, filteredOrders);
  }).filter(a => a.totalOrders > 0);

  const totalOrders = filteredAgents.reduce((s, a) => s + a.totalOrders, 0);
  const totalConfirmed = filteredAgents.reduce((s, a) => s + a.confirmed, 0);
  const totalCancelled = filteredAgents.reduce((s, a) => s + a.cancelled, 0);

  const typeBreakdown: Record<string, { total: number; confirmed: number; cancelled: number; confirmationRate: number; cancellationRate: number }> = {};
  for (const agent of filteredAgents) {
    for (const [type, stats] of Object.entries(agent.typeBreakdown)) {
      if (!typeBreakdown[type]) typeBreakdown[type] = { total: 0, confirmed: 0, cancelled: 0, confirmationRate: 0, cancellationRate: 0 };
      typeBreakdown[type].total += stats.total;
      typeBreakdown[type].confirmed += stats.confirmed;
      typeBreakdown[type].cancelled += stats.cancelled;
    }
  }
  for (const type of Object.keys(typeBreakdown)) {
    const t = typeBreakdown[type];
    t.confirmationRate = t.total > 0 ? (t.confirmed / t.total) * 100 : 0;
    t.cancellationRate = t.total > 0 ? (t.cancelled / t.total) * 100 : 0;
  }

  const normalTotalOrders = filteredAgents.reduce((s, a) => s + a.normalOrders, 0);
  const normalTotalConfirmed = filteredAgents.reduce((s, a) => s + a.normalConfirmed, 0);
  const normalTotalCancelled = filteredAgents.reduce((s, a) => {
    const nc = a.orders.filter(o => o.orderType === 'NORMAL' && o.status === 'cancelled').length;
    return s + nc;
  }, 0);

  // Recalculate lead scores
  const { calculateLeadScores, extractConfirmedQuantities, ALGERIA_ECONOMICS } = await import('@shared/leadScore');
  const scoreInputs = filteredAgents.map(a => ({
    name: a.name,
    totalOrders: a.totalOrders,
    confirmedQuantities: extractConfirmedQuantities(a.orders),
  }));
  const scores = calculateLeadScores(scoreInputs, ALGERIA_ECONOMICS);
  const scoreMap = new Map(scores.map(s => [s.name, s]));
  for (const agent of filteredAgents) {
    const s = scoreMap.get(agent.name);
    agent.leadScore = s ? s.score : -1;
  }

  return {
    ...data,
    agents: filteredAgents,
    totalOrders,
    totalConfirmed,
    totalCancelled,
    overallConfirmationRate: totalOrders > 0 ? (totalConfirmed / totalOrders) * 100 : 0,
    overallCancellationRate: totalOrders > 0 ? (totalCancelled / totalOrders) * 100 : 0,
    totalWorkedOrders: totalOrders - filteredAgents.reduce((s: number, a: AgentData) => s + a.noStatus, 0),
    overallWorkedConfirmationRate: (totalOrders - filteredAgents.reduce((s: number, a: AgentData) => s + a.noStatus, 0)) > 0 ? (totalConfirmed / (totalOrders - filteredAgents.reduce((s: number, a: AgentData) => s + a.noStatus, 0))) * 100 : 0,
    overallWorkedCancellationRate: (totalOrders - filteredAgents.reduce((s: number, a: AgentData) => s + a.noStatus, 0)) > 0 ? (totalCancelled / (totalOrders - filteredAgents.reduce((s: number, a: AgentData) => s + a.noStatus, 0))) * 100 : 0,
    totalNoStatus: filteredAgents.reduce((s: number, a: AgentData) => s + a.noStatus, 0),
    typeBreakdown,
    normalTotalOrders,
    normalTotalConfirmed,
    normalTotalCancelled,
    normalConfirmationRate: normalTotalOrders > 0 ? (normalTotalConfirmed / normalTotalOrders) * 100 : 0,
  };
}

/**
 * Filter dashboard data by product category
 * Returns a new DashboardData with agents recalculated for only the selected product
 */
export async function filterDashboardByProduct(data: DashboardData, product: ProductCategory): Promise<DashboardData> {
  if (product === 'all') return data;

  const filteredAgents = data.agents.map(agent => {
    const filteredOrders = agent.orders.filter(o => o.productCategory === product);
    return recalcAgentFromOrders(agent, filteredOrders);
  }).filter(a => a.totalOrders > 0); // Remove agents with 0 orders for this product

  const totalOrders = filteredAgents.reduce((s, a) => s + a.totalOrders, 0);
  const totalConfirmed = filteredAgents.reduce((s, a) => s + a.confirmed, 0);
  const totalCancelled = filteredAgents.reduce((s, a) => s + a.cancelled, 0);

  // Aggregate type breakdown
  const typeBreakdown: Record<string, { total: number; confirmed: number; cancelled: number; confirmationRate: number; cancellationRate: number }> = {};
  for (const agent of filteredAgents) {
    for (const [type, stats] of Object.entries(agent.typeBreakdown)) {
      if (!typeBreakdown[type]) typeBreakdown[type] = { total: 0, confirmed: 0, cancelled: 0, confirmationRate: 0, cancellationRate: 0 };
      typeBreakdown[type].total += stats.total;
      typeBreakdown[type].confirmed += stats.confirmed;
      typeBreakdown[type].cancelled += stats.cancelled;
    }
  }
  for (const type of Object.keys(typeBreakdown)) {
    const t = typeBreakdown[type];
    t.confirmationRate = t.total > 0 ? (t.confirmed / t.total) * 100 : 0;
    t.cancellationRate = t.total > 0 ? (t.cancelled / t.total) * 100 : 0;
  }

  const normalTotalOrders = filteredAgents.reduce((s, a) => s + a.normalOrders, 0);
  const normalTotalConfirmed = filteredAgents.reduce((s, a) => s + a.normalConfirmed, 0);
  const normalTotalCancelled = filteredAgents.reduce((s, a) => {
    const nc = a.orders.filter(o => o.orderType === 'NORMAL' && o.status === 'cancelled').length;
    return s + nc;
  }, 0);

  // Recalculate lead scores for filtered agents
  const { calculateLeadScores, extractConfirmedQuantities, ALGERIA_ECONOMICS } = await import('@shared/leadScore');
  const scoreInputs = filteredAgents.map(a => ({
    name: a.name,
    totalOrders: a.totalOrders,
    confirmedQuantities: extractConfirmedQuantities(a.orders),
  }));
  const scores = calculateLeadScores(scoreInputs, ALGERIA_ECONOMICS);
  const scoreMap = new Map(scores.map(s => [s.name, s]));
  for (const agent of filteredAgents) {
    const s = scoreMap.get(agent.name);
    agent.leadScore = s ? s.score : -1;
  }

  return {
    ...data,
    agents: filteredAgents,
    totalOrders,
    totalConfirmed,
    totalCancelled,
    overallConfirmationRate: totalOrders > 0 ? (totalConfirmed / totalOrders) * 100 : 0,
    overallCancellationRate: totalOrders > 0 ? (totalCancelled / totalOrders) * 100 : 0,
    totalWorkedOrders: totalOrders - filteredAgents.reduce((s: number, a: AgentData) => s + a.noStatus, 0),
    overallWorkedConfirmationRate: (totalOrders - filteredAgents.reduce((s: number, a: AgentData) => s + a.noStatus, 0)) > 0 ? (totalConfirmed / (totalOrders - filteredAgents.reduce((s: number, a: AgentData) => s + a.noStatus, 0))) * 100 : 0,
    overallWorkedCancellationRate: (totalOrders - filteredAgents.reduce((s: number, a: AgentData) => s + a.noStatus, 0)) > 0 ? (totalCancelled / (totalOrders - filteredAgents.reduce((s: number, a: AgentData) => s + a.noStatus, 0))) * 100 : 0,
    totalNoStatus: filteredAgents.reduce((s: number, a: AgentData) => s + a.noStatus, 0),
    typeBreakdown,
    normalTotalOrders,
    normalTotalConfirmed,
    normalTotalCancelled,
    normalConfirmationRate: normalTotalOrders > 0 ? (normalTotalConfirmed / normalTotalOrders) * 100 : 0,
  };
}

/**
 * Get all unique dates available in the dashboard data, sorted newest first
 */
export function getAvailableDates(data: DashboardData): string[] {
  const dateSet = new Set<string>();
  for (const agent of data.agents) {
    for (const order of agent.orders) {
      if (order.date && order.date !== 'Unknown') {
        dateSet.add(order.date);
      }
    }
  }
  // Sort dates: try to parse dd/mm/yyyy, newest first
  return Array.from(dateSet).sort((a, b) => {
    const parseDate = (d: string) => {
      const parts = d.split('/');
      if (parts.length === 3) {
        return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
      }
      return 0;
    };
    return parseDate(b) - parseDate(a);
  });
}

/**
 * Parse dd/mm/yyyy to timestamp for comparison
 */
export function parseDateToTime(dateStr: string): number {
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
  }
  return 0;
}

/**
 * Filter dashboard data by a date range (from/to in dd/mm/yyyy format)
 * Also supports single date string for backward compatibility
 * Returns a new DashboardData with agents recalculated for only the selected date(s)
 */
export async function filterDashboardByDate(
  data: DashboardData,
  dateOrRange: string | { from: string; to: string } | null
): Promise<DashboardData> {
  if (!dateOrRange) return data;
  if (typeof dateOrRange === 'string' && (dateOrRange === 'all' || dateOrRange === '')) return data;

  let fromTime: number;
  let toTime: number;

  if (typeof dateOrRange === 'string') {
    // Single date — backward compat
    fromTime = parseDateToTime(dateOrRange);
    toTime = fromTime;
  } else {
    fromTime = parseDateToTime(dateOrRange.from);
    toTime = parseDateToTime(dateOrRange.to);
  }

  const filteredAgents = data.agents.map(agent => {
    const filteredOrders = agent.orders.filter(o => {
      const t = parseDateToTime(o.date);
      return t >= fromTime && t <= toTime;
    });
    return recalcAgentFromOrders(agent, filteredOrders);
  }).filter(a => a.totalOrders > 0); // Remove agents with 0 orders for this range

  const totalOrders = filteredAgents.reduce((s, a) => s + a.totalOrders, 0);
  const totalConfirmed = filteredAgents.reduce((s, a) => s + a.confirmed, 0);
  const totalCancelled = filteredAgents.reduce((s, a) => s + a.cancelled, 0);

  // Aggregate type breakdown
  const typeBreakdown: Record<string, { total: number; confirmed: number; cancelled: number; confirmationRate: number; cancellationRate: number }> = {};
  for (const agent of filteredAgents) {
    for (const [type, stats] of Object.entries(agent.typeBreakdown)) {
      if (!typeBreakdown[type]) typeBreakdown[type] = { total: 0, confirmed: 0, cancelled: 0, confirmationRate: 0, cancellationRate: 0 };
      typeBreakdown[type].total += stats.total;
      typeBreakdown[type].confirmed += stats.confirmed;
      typeBreakdown[type].cancelled += stats.cancelled;
    }
  }
  for (const type of Object.keys(typeBreakdown)) {
    const t = typeBreakdown[type];
    t.confirmationRate = t.total > 0 ? (t.confirmed / t.total) * 100 : 0;
    t.cancellationRate = t.total > 0 ? (t.cancelled / t.total) * 100 : 0;
  }

  const normalTotalOrders = filteredAgents.reduce((s, a) => s + a.normalOrders, 0);
  const normalTotalConfirmed = filteredAgents.reduce((s, a) => s + a.normalConfirmed, 0);
  const normalTotalCancelled = filteredAgents.reduce((s, a) => {
    const nc = a.orders.filter(o => o.orderType === 'NORMAL' && o.status === 'cancelled').length;
    return s + nc;
  }, 0);

  // Recalculate lead scores for filtered agents
  const { calculateLeadScores: calcScores2, extractConfirmedQuantities: extractQty2, ALGERIA_ECONOMICS: AE2 } = await import('@shared/leadScore');
  const si2 = filteredAgents.map(a => ({
    name: a.name,
    totalOrders: a.totalOrders,
    confirmedQuantities: extractQty2(a.orders),
  }));
  const sc2 = calcScores2(si2, AE2);
  const sm2 = new Map(sc2.map(s => [s.name, s]));
  for (const agent of filteredAgents) {
    const s = sm2.get(agent.name);
    agent.leadScore = s ? s.score : -1;
  }

  return {
    ...data,
    agents: filteredAgents,
    totalOrders,
    totalConfirmed,
    totalCancelled,
    overallConfirmationRate: totalOrders > 0 ? (totalConfirmed / totalOrders) * 100 : 0,
    overallCancellationRate: totalOrders > 0 ? (totalCancelled / totalOrders) * 100 : 0,
    totalWorkedOrders: totalOrders - filteredAgents.reduce((s: number, a: AgentData) => s + a.noStatus, 0),
    overallWorkedConfirmationRate: (totalOrders - filteredAgents.reduce((s: number, a: AgentData) => s + a.noStatus, 0)) > 0 ? (totalConfirmed / (totalOrders - filteredAgents.reduce((s: number, a: AgentData) => s + a.noStatus, 0))) * 100 : 0,
    overallWorkedCancellationRate: (totalOrders - filteredAgents.reduce((s: number, a: AgentData) => s + a.noStatus, 0)) > 0 ? (totalCancelled / (totalOrders - filteredAgents.reduce((s: number, a: AgentData) => s + a.noStatus, 0))) * 100 : 0,
    totalNoStatus: filteredAgents.reduce((s: number, a: AgentData) => s + a.noStatus, 0),
    typeBreakdown,
    normalTotalOrders,
    normalTotalConfirmed,
    normalTotalCancelled,
    normalConfirmationRate: normalTotalOrders > 0 ? (normalTotalConfirmed / normalTotalOrders) * 100 : 0,
  };
}

export async function loadDashboardData(
  sheetUrls: string[],
  onProgress?: (msg: string) => void,
  agentNames?: Record<string, string>
): Promise<DashboardData> {
  const agents: AgentData[] = [];
  const validUrls = sheetUrls.map((u, i) => ({ url: u.trim(), idx: i })).filter(u => u.url);
  
  // Load ALL agents in parallel — Apps Script handles all 4 tabs in 1 call per agent
  // so there's no benefit to batching; fire everything at once for maximum speed
  onProgress?.(`Loading ${validUrls.length} agents in parallel...`);
  
  const results = await Promise.allSettled(
    validUrls.map(({ url, idx }) =>
      loadSheetData(url, (msg) => {
        onProgress?.(`[${idx + 1}/${validUrls.length}] ${msg}`);
      }, agentNames?.[url.trim()])
    )
  );
  
  for (let r = 0; r < results.length; r++) {
    const result = results[r];
    if (result.status === 'fulfilled') {
      agents.push(result.value);
    } else {
      const failIdx = validUrls[r].idx + 1;
      const errMsg = result.reason instanceof Error ? result.reason.message : 'Unknown error';
      onProgress?.(`Failed to load sheet ${failIdx}: ${errMsg}`);
    }
  }
  
  const totalOrders = agents.reduce((sum, a) => sum + a.totalOrders, 0);
  const totalConfirmed = agents.reduce((sum, a) => sum + a.confirmed, 0);
  const totalCancelled = agents.reduce((sum, a) => sum + a.cancelled, 0);
  
  // Aggregate type breakdown across all agents
  const typeBreakdown: Record<string, { total: number; confirmed: number; cancelled: number; confirmationRate: number; cancellationRate: number }> = {};
  for (const agent of agents) {
    for (const [type, stats] of Object.entries(agent.typeBreakdown)) {
      if (!typeBreakdown[type]) {
        typeBreakdown[type] = { total: 0, confirmed: 0, cancelled: 0, confirmationRate: 0, cancellationRate: 0 };
      }
      typeBreakdown[type].total += stats.total;
      typeBreakdown[type].confirmed += stats.confirmed;
      typeBreakdown[type].cancelled += stats.cancelled;
    }
  }
  for (const type of Object.keys(typeBreakdown)) {
    const t = typeBreakdown[type];
    t.confirmationRate = t.total > 0 ? (t.confirmed / t.total) * 100 : 0;
    t.cancellationRate = t.total > 0 ? (t.cancelled / t.total) * 100 : 0;
  }
  
  // Normal-only aggregates for Viconis KPIs
  const normalTotalOrders = agents.reduce((sum, a) => sum + a.normalOrders, 0);
  const normalTotalConfirmed = agents.reduce((sum, a) => sum + a.normalConfirmed, 0);
  const normalTotalCancelled = agents.reduce((sum, a) => {
    const normalCancelled = a.orders.filter(o => o.orderType === 'NORMAL' && o.status === 'cancelled').length;
    return sum + normalCancelled;
  }, 0);

  // Calculate lead scores for all agents (Algeria economics)
  const { calculateLeadScores, extractConfirmedQuantities, ALGERIA_ECONOMICS } = await import('@shared/leadScore');
  const scoreInputs = agents.map(a => ({
    name: a.name,
    totalOrders: a.totalOrders,
    confirmedQuantities: extractConfirmedQuantities(a.orders),
  }));
  const scores = calculateLeadScores(scoreInputs, ALGERIA_ECONOMICS);
  const scoreMap = new Map(scores.map(s => [s.name, s]));
  for (const agent of agents) {
    const s = scoreMap.get(agent.name);
    agent.leadScore = s ? s.score : -1;
  }

  return {
    agents,
    totalOrders,
    totalConfirmed,
    totalCancelled,
    overallConfirmationRate: totalOrders > 0 ? (totalConfirmed / totalOrders) * 100 : 0,
    overallCancellationRate: totalOrders > 0 ? (totalCancelled / totalOrders) * 100 : 0,
    totalWorkedOrders: totalOrders - agents.reduce((s: number, a: AgentData) => s + a.noStatus, 0),
    overallWorkedConfirmationRate: (totalOrders - agents.reduce((s: number, a: AgentData) => s + a.noStatus, 0)) > 0 ? (totalConfirmed / (totalOrders - agents.reduce((s: number, a: AgentData) => s + a.noStatus, 0))) * 100 : 0,
    overallWorkedCancellationRate: (totalOrders - agents.reduce((s: number, a: AgentData) => s + a.noStatus, 0)) > 0 ? (totalCancelled / (totalOrders - agents.reduce((s: number, a: AgentData) => s + a.noStatus, 0))) * 100 : 0,
    totalNoStatus: agents.reduce((s: number, a: AgentData) => s + a.noStatus, 0),
    lastUpdated: new Date(),
    typeBreakdown,
    normalTotalOrders,
    normalTotalConfirmed,
    normalTotalCancelled,
    normalConfirmationRate: normalTotalOrders > 0 ? (normalTotalConfirmed / normalTotalOrders) * 100 : 0,
  };
}


/**
 * Filter dashboard data to exclude organic/page orders (orders with empty reference/SKU).
 * Returns a new DashboardData with agents recalculated for only paid (has-SKU) orders.
 * Also attaches organic stats to each agent for display in a separate column.
 */
export async function filterDashboardExcludeOrganic(
  data: DashboardData
): Promise<DashboardData & { organicStats: Map<string, { total: number; confirmed: number; confirmationRate: number; cancellationRate: number }> }> {
  const organicStats = new Map<string, { total: number; confirmed: number; confirmationRate: number; cancellationRate: number }>();

  const filteredAgents = data.agents.map(agent => {
    const paidOrders = agent.orders.filter(o => o.reference.trim() !== '');
    const organicOrders = agent.orders.filter(o => o.reference.trim() === '');
    const orgConfirmed = organicOrders.filter(o => o.status === 'confirmed').length;
    const orgCancelled = organicOrders.filter(o => o.status === 'cancelled').length;
    organicStats.set(agent.name, {
      total: organicOrders.length,
      confirmed: orgConfirmed,
      confirmationRate: organicOrders.length > 0 ? (orgConfirmed / organicOrders.length) * 100 : 0,
      cancellationRate: organicOrders.length > 0 ? (orgCancelled / organicOrders.length) * 100 : 0,
    });
    return recalcAgentFromOrders(agent, paidOrders);
  }).filter(a => a.totalOrders > 0);

  const totalOrders = filteredAgents.reduce((s, a) => s + a.totalOrders, 0);
  const totalConfirmed = filteredAgents.reduce((s, a) => s + a.confirmed, 0);
  const totalCancelled = filteredAgents.reduce((s, a) => s + a.cancelled, 0);

  // Aggregate type breakdown
  const typeBreakdown: Record<string, { total: number; confirmed: number; cancelled: number; confirmationRate: number; cancellationRate: number }> = {};
  for (const agent of filteredAgents) {
    for (const [type, stats] of Object.entries(agent.typeBreakdown)) {
      if (!typeBreakdown[type]) typeBreakdown[type] = { total: 0, confirmed: 0, cancelled: 0, confirmationRate: 0, cancellationRate: 0 };
      typeBreakdown[type].total += stats.total;
      typeBreakdown[type].confirmed += stats.confirmed;
      typeBreakdown[type].cancelled += stats.cancelled;
    }
  }
  for (const type of Object.keys(typeBreakdown)) {
    const t = typeBreakdown[type];
    t.confirmationRate = t.total > 0 ? (t.confirmed / t.total) * 100 : 0;
    t.cancellationRate = t.total > 0 ? (t.cancelled / t.total) * 100 : 0;
  }

  const normalTotalOrders = filteredAgents.reduce((s, a) => s + a.normalOrders, 0);
  const normalTotalConfirmed = filteredAgents.reduce((s, a) => s + a.normalConfirmed, 0);
  const normalTotalCancelled = filteredAgents.reduce((s, a) => {
    const nc = a.orders.filter(o => o.orderType === 'NORMAL' && o.status === 'cancelled').length;
    return s + nc;
  }, 0);

  // Recalculate lead scores
  const { calculateLeadScores, extractConfirmedQuantities, ALGERIA_ECONOMICS } = await import('@shared/leadScore');
  const si = filteredAgents.map(a => ({
    name: a.name,
    totalOrders: a.totalOrders,
    confirmedQuantities: extractConfirmedQuantities(a.orders),
  }));
  const sc = calculateLeadScores(si, ALGERIA_ECONOMICS);
  const sm = new Map(sc.map(s => [s.name, s]));
  for (const agent of filteredAgents) {
    const s = sm.get(agent.name);
    agent.leadScore = s ? s.score : -1;
  }

  return {
    ...data,
    agents: filteredAgents,
    totalOrders,
    totalConfirmed,
    totalCancelled,
    overallConfirmationRate: totalOrders > 0 ? (totalConfirmed / totalOrders) * 100 : 0,
    overallCancellationRate: totalOrders > 0 ? (totalCancelled / totalOrders) * 100 : 0,
    totalWorkedOrders: totalOrders - filteredAgents.reduce((s: number, a: AgentData) => s + a.noStatus, 0),
    overallWorkedConfirmationRate: (totalOrders - filteredAgents.reduce((s: number, a: AgentData) => s + a.noStatus, 0)) > 0 ? (totalConfirmed / (totalOrders - filteredAgents.reduce((s: number, a: AgentData) => s + a.noStatus, 0))) * 100 : 0,
    overallWorkedCancellationRate: (totalOrders - filteredAgents.reduce((s: number, a: AgentData) => s + a.noStatus, 0)) > 0 ? (totalCancelled / (totalOrders - filteredAgents.reduce((s: number, a: AgentData) => s + a.noStatus, 0))) * 100 : 0,
    totalNoStatus: filteredAgents.reduce((s: number, a: AgentData) => s + a.noStatus, 0),
    typeBreakdown,
    normalTotalOrders,
    normalTotalConfirmed,
    normalTotalCancelled,
    normalConfirmationRate: normalTotalOrders > 0 ? (normalTotalConfirmed / normalTotalOrders) * 100 : 0,
    organicStats,
  };
}
