/**
 * DHD (Ecotrack) API Client
 *
 * Fetches delivery orders from the DHD platform API.
 * Base URL: https://dhd.ecotrack.dz (redirects to platform.dhd-dz.com)
 * Auth: api_token query parameter
 *
 * Key endpoints:
 * - GET /api/v1/get/orders?page=X — paginated orders (40/page, last 90 days)
 * - GET /api/v1/get/tracking/info?tracking=X — full tracking history
 * - GET /api/v1/get/trackings/info?trackings[]=X,Y — bulk tracking (max 100)
 * - POST /api/v1/add/maj?tracking=X&content=Y — add tracking note
 *
 * IMPORTANT: DHD has strict rate limiting (~50 req/min).
 * We use conservative batching (3 parallel) with retry + backoff.
 */

const BASE_URL = "https://dhd.ecotrack.dz";

function getToken(): string {
  const token = process.env.DHD_API_TOKEN;
  if (!token) throw new Error("DHD_API_TOKEN not configured");
  return token;
}

// ─── Types ──────────────────────────────────────────────────────────────

export interface DhdOrderProduct {
  tracking: string;
  reference: string;
  title: string;
  price: number | null;
  quantity: number;
}

export interface DhdStatusReason {
  remarque: string;
  commentaires: string;
  station: string;
  livreur: string;
  created_at: string;
  tracking: string;
}

export interface DhdOrder {
  tracking: string;
  reference: string | null;
  client: string;
  phone: string;
  phone_2: string | null;
  adresse: string;
  stop_desk: number;
  commune_id: number;
  wilaya_id: number;
  montant: string;
  tarif_prestation: string;
  tarif_retour: string;
  type_id: number;
  created_at: string;
  payment_id: number | null;
  return_id: number | null;
  process_state_id: number;
  livred_at: string | null;
  exchanged_at: string | null;
  return_asked_at: string | null;
  last_updated_at: string;
  products: string;
  status: string;
  global_status: string;
  status_reason: DhdStatusReason[];
  order_products: DhdOrderProduct[];
}

export interface DhdPaginatedResponse {
  data: DhdOrder[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number;
  to: number;
}

export interface DhdTrackingEvent {
  remarque: string;
  commentaires: string;
  station: string;
  livreur: string;
  created_at: string;
  tracking: string;
}

// ─── Problem Reason Classification ──────────────────────────────────────

/** Reasons that indicate a delivery problem requiring suivi follow-up */
export const PROBLEM_REASONS = [
  "Client ne répond pas",
  "Reporté par le client",
  "Annulé par le client",
  "Injoignable",
  "Faux numéro",
  "Adresse incorrecte",
  "Refusé par le client",
] as const;

export type ProblemReason = typeof PROBLEM_REASONS[number];

/** Check if a status_reason entry indicates a problem */
export function isProblemReason(remarque: string): boolean {
  const lower = remarque.toLowerCase().trim();
  return PROBLEM_REASONS.some(r => lower.includes(r.toLowerCase())) ||
    lower.includes("ne répond pas") ||
    lower.includes("injoignable") ||
    lower.includes("annulé") ||
    lower.includes("reporté") ||
    lower.includes("faux num") ||
    lower.includes("refusé");
}

/** Classify a status_reason into a category for filtering */
export function classifyReason(remarque: string): string {
  const lower = remarque.toLowerCase().trim();
  if (lower.includes("ne répond pas") || lower.includes("injoignable")) return "no_answer";
  if (lower.includes("reporté")) return "postponed";
  if (lower.includes("annulé")) return "cancelled";
  if (lower.includes("refusé")) return "refused";
  if (lower.includes("faux num") || lower.includes("adresse incorrect")) return "wrong_info";
  if (lower.includes("rdv fixé") || lower.includes("client contacté")) return "contacted";
  return "other";
}

export const REASON_LABELS: Record<string, string> = {
  no_answer: "No Answer",
  postponed: "Postponed",
  cancelled: "Cancelled",
  refused: "Refused",
  wrong_info: "Wrong Info",
  contacted: "Contacted/RDV",
  other: "Other",
};

// ─── Rate Limit & Retry Logic ──────────────────────────────────────────

/** Wait for ms milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Fetch with retry logic for 429 rate limit errors */
async function fetchWithRetry(url: string, options?: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);

    if (res.status === 429) {
      if (attempt === maxRetries) {
        throw new Error("DHD API rate limit exceeded. Please wait a few minutes and try again.");
      }
      // Exponential backoff: 5s, 15s, 45s
      const waitTime = 5000 * Math.pow(3, attempt);
      console.log(`[DHD API] Rate limited (429), waiting ${waitTime / 1000}s before retry ${attempt + 1}/${maxRetries}`);
      await sleep(waitTime);
      continue;
    }

    return res;
  }

  throw new Error("DHD API: max retries exceeded");
}

// ─── API Calls ──────────────────────────────────────────────────────────

/** Fetch a single page of orders */
export async function fetchOrdersPage(page: number = 1, startDate?: string, endDate?: string): Promise<DhdPaginatedResponse> {
  const token = getToken();
  let url = `${BASE_URL}/api/v1/get/orders?api_token=${token}&page=${page}`;
  if (startDate) url += `&start_date=${startDate}`;
  if (endDate) url += `&end_date=${endDate}`;

  const res = await fetchWithRetry(url, {
    headers: { Accept: "application/json" },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`DHD API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<DhdPaginatedResponse>;
}

/** Fetch ALL orders across all pages (conservative rate-limited approach) */
export async function fetchAllOrders(
  options?: {
    startDate?: string;
    endDate?: string;
    maxPages?: number;
    onProgress?: (fetched: number, total: number) => void;
  }
): Promise<DhdOrder[]> {
  const { startDate, endDate, maxPages, onProgress } = options || {};
  const allOrders: DhdOrder[] = [];

  // Fetch first page to get total
  const firstPage = await fetchOrdersPage(1, startDate, endDate);
  allOrders.push(...firstPage.data);
  const totalPages = Math.min(firstPage.last_page, maxPages || Infinity);
  onProgress?.(allOrders.length, firstPage.total);

  if (totalPages <= 1) return allOrders;

  // Conservative batching: 3 parallel requests with 1.5s delay between batches
  // This keeps us well under the ~50 req/min rate limit
  const BATCH_SIZE = 3;
  const BATCH_DELAY_MS = 1500; // 1.5 seconds between batches

  for (let page = 2; page <= totalPages; page += BATCH_SIZE) {
    const batch = [];
    for (let p = page; p < page + BATCH_SIZE && p <= totalPages; p++) {
      batch.push(fetchOrdersPage(p, startDate, endDate));
    }

    const results = await Promise.all(batch);
    for (const result of results) {
      allOrders.push(...result.data);
    }
    onProgress?.(allOrders.length, firstPage.total);

    // Wait between batches to avoid rate limiting
    if (page + BATCH_SIZE <= totalPages) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return allOrders;
}

/** Fetch tracking info for a single order */
export async function fetchTrackingInfo(tracking: string): Promise<DhdTrackingEvent[]> {
  const token = getToken();
  const url = `${BASE_URL}/api/v1/get/tracking/info?api_token=${token}&tracking=${tracking}`;

  const res = await fetchWithRetry(url, {
    headers: { Accept: "application/json" },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`DHD tracking API error: ${res.status}`);
  }

  const data = await res.json();
  // The API returns tracking events in the response
  if (Array.isArray(data)) return data;
  if (data?.data && Array.isArray(data.data)) return data.data;
  if (data?.activities && Array.isArray(data.activities)) return data.activities;
  return [];
}

/** Add a tracking note/comment to an order */
export async function addTrackingNote(tracking: string, content: string): Promise<boolean> {
  const token = getToken();
  const url = `${BASE_URL}/api/v1/add/maj?api_token=${token}&tracking=${tracking}&content=${encodeURIComponent(content)}`;

  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: { Accept: "application/json" },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`DHD add note API error: ${res.status}`);
  }

  return true;
}

// ─── Wilaya Map (for display) ───────────────────────────────────────────

export const WILAYA_MAP: Record<number, string> = {
  1: "Adrar", 2: "Chlef", 3: "Laghouat", 4: "Oum El Bouaghi", 5: "Batna",
  6: "Béjaïa", 7: "Biskra", 8: "Béchar", 9: "Blida", 10: "Bouira",
  11: "Tamanrasset", 12: "Tébessa", 13: "Tlemcen", 14: "Tiaret", 15: "Tizi Ouzou",
  16: "Alger", 17: "Djelfa", 18: "Jijel", 19: "Sétif", 20: "Saïda",
  21: "Skikda", 22: "Sidi Bel Abbès", 23: "Annaba", 24: "Guelma", 25: "Constantine",
  26: "Médéa", 27: "Mostaganem", 28: "M'Sila", 29: "Mascara", 30: "Ouargla",
  31: "Oran", 32: "El Bayadh", 33: "Illizi", 34: "Bordj Bou Arréridj", 35: "Boumerdès",
  36: "El Tarf", 37: "Tindouf", 38: "Tissemsilt", 39: "El Oued", 40: "Khenchela",
  41: "Souk Ahras", 42: "Tipaza", 43: "Mila", 44: "Aïn Defla", 45: "Naâma",
  46: "Aïn Témouchent", 47: "Ghardaïa", 48: "Relizane",
  49: "El M'Ghair", 50: "El Meniaa", 51: "Ouled Djellal", 52: "Bordj Badji Mokhtar",
  53: "Béni Abbès", 54: "Timimoun", 55: "Touggourt", 56: "Djanet",
  57: "In Salah", 58: "In Guezzam",
};

// ─── DHD Status Labels ──────────────────────────────────────────────────

export const DHD_STATUS_LABELS: Record<string, string> = {
  prete_a_preparer: "Ready to Prepare",
  prete_a_expedier: "Ready to Ship",
  en_ramassage: "Pickup",
  en_preparation_stock: "Preparing (Stock)",
  vers_hub: "To Hub",
  en_hub: "At Hub",
  vers_wilaya: "To Wilaya",
  en_preparation: "In Preparation",
  en_livraison: "Out for Delivery",
  suspendu: "Suspended",
  "livré_non_encaissé": "Delivered (Not Collected)",
  "encaissé_non_payé": "Collected (Not Paid)",
  paiements_prets: "Payment Ready",
  "payé_et_archivé": "Paid & Archived",
  retour_chez_livreur: "Return at Driver",
  retour_transit_entrepot: "Return in Transit",
  retour_en_traitement: "Return Processing",
  retour_recu: "Return Received",
  retour_archive: "Return Archived",
  annule: "Cancelled",
};

/** Statuses that are "active" — orders still in the delivery pipeline */
export const ACTIVE_STATUSES = new Set([
  "en_livraison",
  "en_preparation",
  "vers_wilaya",
  "en_hub",
  "vers_hub",
  "livré_non_encaissé",
  "suspendu",
]);

/** Statuses where suivi follow-up is most needed.
 * Excludes all 'livré' statuses — delivered orders are the delivery company's
 * money-collection concern, not the confirmation agent's. */
export const SUIVI_TARGET_STATUSES = new Set([
  "en_livraison",
  "en_preparation",
  "suspendu",
]);
