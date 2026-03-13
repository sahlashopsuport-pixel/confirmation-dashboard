/**
 * DHD (Ecotrack) API Client — Frontend
 *
 * Calls the DHD API directly from the user's browser.
 * This avoids server-side timeout issues (66 pages * 3-4s = too slow for server).
 * The API token is fetched from the server (auth-protected).
 */

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

// ─── Problem Reason Classification ──────────────────────────────────────

const PROBLEM_REASONS = [
  "Client ne répond pas",
  "Reporté par le client",
  "Annulé par le client",
  "Injoignable",
  "Faux numéro",
  "Adresse incorrecte",
  "Refusé par le client",
];

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

// ─── Processed Order Type ───────────────────────────────────────────────

export interface ProcessedOrder {
  tracking: string;
  reference: string | null;
  client: string;
  phone: string;
  phone_2: string | null;
  adresse: string;
  montant: string;
  wilaya_id: number;
  wilayaName: string;
  status: string;
  statusLabel: string;
  created_at: string;
  last_updated_at: string;
  hasProblem: boolean;
  reasonCategory: string | null;
  isSuiviTarget: boolean;
  latestReason: DhdStatusReason | null;
  status_reason: DhdStatusReason[];
  products: string;
}

// ─── API Client ─────────────────────────────────────────────────────────

export class DhdClient {
  private baseUrl: string;
  private token: string;
  private statusLabels: Record<string, string>;
  private wilayaMap: Record<number, string>;
  private suiviTargetStatuses: Set<string>;

  constructor(config: {
    baseUrl: string;
    token: string;
    statusLabels: Record<string, string>;
    wilayaMap: Record<number, string>;
    suiviTargetStatuses: string[];
  }) {
    this.baseUrl = config.baseUrl;
    this.token = config.token;
    this.statusLabels = config.statusLabels;
    this.wilayaMap = config.wilayaMap;
    this.suiviTargetStatuses = new Set(config.suiviTargetStatuses);
  }

  /** Fetch a single page of orders */
  async fetchPage(page: number): Promise<DhdPaginatedResponse> {
    const url = `${this.baseUrl}/api/v1/get/orders?api_token=${this.token}&page=${page}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      redirect: "follow",
    });

    if (res.status === 401) {
      throw new Error("DHD API token expired or invalid. Please contact admin.");
    }
    if (res.status === 429) {
      throw new Error("DHD API rate limit reached. Please wait a minute and try again.");
    }
    if (!res.ok) {
      throw new Error(`DHD API error: ${res.status} ${res.statusText}`);
    }

    return res.json();
  }

  /** Process a raw DHD order into a ProcessedOrder with problem classification */
  processOrder(order: DhdOrder): ProcessedOrder {
    const latestReason = order.status_reason?.[order.status_reason.length - 1] || null;
    const hasProblem = latestReason ? isProblemReason(latestReason.remarque) : false;
    const reasonCategory = latestReason ? classifyReason(latestReason.remarque) : null;
    const isSuiviTarget = this.suiviTargetStatuses.has(order.status);

    return {
      tracking: order.tracking,
      reference: order.reference,
      client: order.client,
      phone: order.phone,
      phone_2: order.phone_2,
      adresse: order.adresse,
      montant: order.montant,
      wilaya_id: order.wilaya_id,
      wilayaName: this.wilayaMap[order.wilaya_id] || `Wilaya ${order.wilaya_id}`,
      status: order.status,
      statusLabel: this.statusLabels[order.status] || order.status,
      created_at: order.created_at,
      last_updated_at: order.last_updated_at,
      hasProblem,
      reasonCategory,
      isSuiviTarget,
      latestReason,
      status_reason: order.status_reason || [],
      products: order.products,
    };
  }

  /** Fetch and process a single page, returning problem orders and stats */
  async fetchAndProcessPage(page: number): Promise<{
    allOrders: ProcessedOrder[];
    problemOrders: ProcessedOrder[];
    stats: ScanStats;
    pagination: { currentPage: number; lastPage: number; total: number };
  }> {
    const result = await this.fetchPage(page);
    const allOrders: ProcessedOrder[] = [];
    const problemOrders: ProcessedOrder[] = [];
    const stats: ScanStats = {
      scannedOrders: 0,
      enLivraison: 0,
      enPreparation: 0,
      livreNonEncaisse: 0,
      suspendu: 0,
      problemCount: 0,
      noAnswerCount: 0,
      postponedCount: 0,
      cancelledCount: 0,
    };

    for (const order of result.data) {
      const processed = this.processOrder(order);
      allOrders.push(processed);
      stats.scannedOrders++;

      if (order.status === "en_livraison") stats.enLivraison++;
      if (order.status === "en_preparation") stats.enPreparation++;
      if (order.status === "livré_non_encaissé") stats.livreNonEncaisse++;
      if (order.status === "suspendu") stats.suspendu++;

      if (processed.hasProblem && processed.isSuiviTarget) {
        problemOrders.push(processed);
        stats.problemCount++;
        if (processed.reasonCategory === "no_answer") stats.noAnswerCount++;
        if (processed.reasonCategory === "postponed") stats.postponedCount++;
        if (processed.reasonCategory === "cancelled") stats.cancelledCount++;
      }
    }

    return {
      allOrders,
      problemOrders,
      stats,
      pagination: {
        currentPage: result.current_page,
        lastPage: result.last_page,
        total: result.total,
      },
    };
  }
}

export interface ScanStats {
  scannedOrders: number;
  enLivraison: number;
  enPreparation: number;
  livreNonEncaisse: number;
  suspendu: number;
  problemCount: number;
  noAnswerCount: number;
  postponedCount: number;
  cancelledCount: number;
}

export function emptyScanStats(): ScanStats {
  return {
    scannedOrders: 0,
    enLivraison: 0,
    enPreparation: 0,
    livreNonEncaisse: 0,
    suspendu: 0,
    problemCount: 0,
    noAnswerCount: 0,
    postponedCount: 0,
    cancelledCount: 0,
  };
}

export function mergeStats(a: ScanStats, b: ScanStats): ScanStats {
  return {
    scannedOrders: a.scannedOrders + b.scannedOrders,
    enLivraison: a.enLivraison + b.enLivraison,
    enPreparation: a.enPreparation + b.enPreparation,
    livreNonEncaisse: a.livreNonEncaisse + b.livreNonEncaisse,
    suspendu: a.suspendu + b.suspendu,
    problemCount: a.problemCount + b.problemCount,
    noAnswerCount: a.noAnswerCount + b.noAnswerCount,
    postponedCount: a.postponedCount + b.postponedCount,
    cancelledCount: a.cancelledCount + b.cancelledCount,
  };
}
