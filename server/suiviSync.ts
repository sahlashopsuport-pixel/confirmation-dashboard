/**
 * Suivi Sync Engine
 *
 * Background job that scans DHD API (last 7 days) and caches problem orders
 * in the database for instant page load. Runs every 30 minutes automatically.
 *
 * Architecture:
 * 1. Fetch pages from DHD API in batches of 5 (conservative to avoid rate limits)
 * 2. Process each order: check if it's a suivi target with a problem reason
 * 3. Upsert problem orders into suivi_cached_orders table
 * 4. Remove stale entries (orders that are no longer problems)
 * 5. Log the sync run to suivi_sync_log
 */

import {
  fetchOrdersPage,
  SUIVI_TARGET_STATUSES,
  WILAYA_MAP,
  DHD_STATUS_LABELS,
  isProblemReason,
  classifyReason,
} from "./dhdApi";
import {
  upsertCachedSuiviOrders,
  removeStaleCache,
  insertSuiviSyncLog,
  updateSuiviSyncLog,
  getLatestSuiviSync,
} from "./db";
import type { InsertSuiviCachedOrder } from "../drizzle/schema";

// ─── Config ────────────────────────────────────────────────────────────

/** How many days back to scan (older orders aren't worth following up) */
const SCAN_DAYS_BACK = 7;

/** How many pages to fetch in parallel per batch (conservative for rate limits) */
const BATCH_SIZE = 5;

/** Delay between batches in ms (to avoid DHD rate limiting) */
const BATCH_DELAY_MS = 2000;

/** Minimum interval between syncs in ms (5 minutes) — prevents spam */
const MIN_SYNC_INTERVAL_MS = 5 * 60 * 1000;

// ─── Sync State ────────────────────────────────────────────────────────

let isSyncing = false;

export function isSuiviSyncRunning(): boolean {
  return isSyncing;
}

// ─── Date Helpers ──────────────────────────────────────────────────────

function getDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

function getTodayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Main Sync Function ────────────────────────────────────────────────

export interface SuiviSyncResult {
  success: boolean;
  pagesScanned: number;
  ordersScanned: number;
  problemsFound: number;
  ordersRemoved: number;
  durationMs: number;
  error?: string;
}

/**
 * Run a full suivi sync: scan DHD API for the last 7 days and cache problem orders.
 * @param triggeredBy - Who triggered the sync ('auto' for cron, username for manual)
 */
export async function runSuiviSync(triggeredBy: string = "auto"): Promise<SuiviSyncResult> {
  if (isSyncing) {
    return {
      success: false,
      pagesScanned: 0,
      ordersScanned: 0,
      problemsFound: 0,
      ordersRemoved: 0,
      durationMs: 0,
      error: "Sync already in progress",
    };
  }

  // Check minimum interval (skip for manual triggers)
  if (triggeredBy === "auto") {
    const lastSync = await getLatestSuiviSync();
    if (lastSync && lastSync.status === "completed") {
      const elapsed = Date.now() - new Date(lastSync.createdAt).getTime();
      if (elapsed < MIN_SYNC_INTERVAL_MS) {
        return {
          success: false,
          pagesScanned: 0,
          ordersScanned: 0,
          problemsFound: 0,
          ordersRemoved: 0,
          durationMs: 0,
          error: `Last sync was ${Math.round(elapsed / 60000)} min ago. Minimum interval: ${MIN_SYNC_INTERVAL_MS / 60000} min.`,
        };
      }
    }
  }

  isSyncing = true;
  const startTime = Date.now();
  const startDate = getDateDaysAgo(SCAN_DAYS_BACK);
  const endDate = getTodayStr();

  // Create sync log entry
  let syncLogId: number;
  try {
    syncLogId = await insertSuiviSyncLog({
      status: "running",
      triggeredBy,
      startDate,
      endDate,
    });
  } catch (e) {
    console.error("[SuiviSync] Failed to create sync log:", e);
    isSyncing = false;
    return {
      success: false,
      pagesScanned: 0,
      ordersScanned: 0,
      problemsFound: 0,
      ordersRemoved: 0,
      durationMs: Date.now() - startTime,
      error: "Failed to create sync log",
    };
  }

  console.log(`[SuiviSync] Starting sync (${startDate} → ${endDate}), triggered by: ${triggeredBy}`);

  let pagesScanned = 0;
  let ordersScanned = 0;
  const allProblemOrders: InsertSuiviCachedOrder[] = [];
  const activeTrackings = new Set<string>();

  try {
    // Fetch first page to discover total pages
    const firstPage = await fetchOrdersPage(1, startDate, endDate);
    const totalPages = firstPage.last_page;
    console.log(`[SuiviSync] Total pages: ${totalPages}, total orders: ${firstPage.total}`);

    // Process first page
    pagesScanned++;
    for (const order of firstPage.data) {
      ordersScanned++;
      processOrder(order, allProblemOrders, activeTrackings);
    }

    // Fetch remaining pages in batches
    for (let startPage = 2; startPage <= totalPages; startPage += BATCH_SIZE) {
      const pageNumbers = [];
      for (let p = startPage; p < startPage + BATCH_SIZE && p <= totalPages; p++) {
        pageNumbers.push(p);
      }

      const results = await Promise.allSettled(
        pageNumbers.map((p) => fetchOrdersPage(p, startDate, endDate))
      );

      for (const res of results) {
        if (res.status === "rejected") {
          console.warn("[SuiviSync] Page fetch failed:", res.reason);
          continue;
        }
        pagesScanned++;
        for (const order of res.value.data) {
          ordersScanned++;
          processOrder(order, allProblemOrders, activeTrackings);
        }
      }

      // Log progress
      if (pagesScanned % 20 === 0) {
        console.log(`[SuiviSync] Progress: ${pagesScanned}/${totalPages} pages, ${allProblemOrders.length} problems found`);
      }

      // Delay between batches to avoid rate limiting
      if (startPage + BATCH_SIZE <= totalPages) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    // Upsert all problem orders to cache
    const upserted = await upsertCachedSuiviOrders(allProblemOrders);
    console.log(`[SuiviSync] Upserted ${upserted} problem orders to cache`);

    // Remove stale orders (no longer problems)
    const removed = await removeStaleCache(activeTrackings);
    console.log(`[SuiviSync] Removed ${removed} stale cached orders`);

    const durationMs = Date.now() - startTime;

    // Update sync log
    await updateSuiviSyncLog(syncLogId, {
      status: "completed",
      pagesScanned,
      ordersScanned,
      problemsFound: allProblemOrders.length,
      ordersRemoved: removed,
      durationMs,
    });

    console.log(`[SuiviSync] Sync complete: ${pagesScanned} pages, ${ordersScanned} orders, ${allProblemOrders.length} problems, ${removed} removed, ${(durationMs / 1000).toFixed(1)}s`);

    isSyncing = false;
    return {
      success: true,
      pagesScanned,
      ordersScanned,
      problemsFound: allProblemOrders.length,
      ordersRemoved: removed,
      durationMs,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[SuiviSync] Sync failed:", errMsg);

    const durationMs = Date.now() - startTime;
    await updateSuiviSyncLog(syncLogId, {
      status: "failed",
      pagesScanned,
      ordersScanned,
      problemsFound: allProblemOrders.length,
      durationMs,
      errorMessage: errMsg,
    });

    isSyncing = false;
    return {
      success: false,
      pagesScanned,
      ordersScanned,
      problemsFound: allProblemOrders.length,
      ordersRemoved: 0,
      durationMs,
      error: errMsg,
    };
  }
}

// ─── Order Processing ──────────────────────────────────────────────────

function processOrder(
  order: { tracking: string; reference: string | null; client: string; phone: string; phone_2: string | null; adresse: string; montant: string; wilaya_id: number; status: string; created_at: string; last_updated_at: string; products: string; status_reason: Array<{ remarque: string; commentaires: string; station: string; livreur: string; created_at: string; tracking: string }> },
  problemOrders: InsertSuiviCachedOrder[],
  activeTrackings: Set<string>
): void {
  // Skip all livré statuses
  if (order.status.startsWith("livr")) return;

  // Check if it's a suivi target
  if (!SUIVI_TARGET_STATUSES.has(order.status)) return;

  // Check for problem reason
  const latestReason = order.status_reason?.[order.status_reason.length - 1] || null;
  if (!latestReason || !isProblemReason(latestReason.remarque)) return;

  const reasonCategory = classifyReason(latestReason.remarque);

  activeTrackings.add(order.tracking);
  problemOrders.push({
    tracking: order.tracking,
    client: order.client,
    phone: order.phone,
    phone2: order.phone_2 || null,
    adresse: order.adresse || null,
    reference: order.reference || null,
    montant: order.montant,
    wilayaId: order.wilaya_id,
    wilayaName: WILAYA_MAP[order.wilaya_id] || `Wilaya ${order.wilaya_id}`,
    status: order.status,
    statusLabel: DHD_STATUS_LABELS[order.status] || order.status,
    reasonCategory,
    latestReasonText: latestReason.remarque,
    latestReasonJson: JSON.stringify(latestReason),
    statusReasonJson: JSON.stringify(order.status_reason || []),
    products: order.products || null,
    orderCreatedAt: order.created_at,
    lastUpdatedAt: order.last_updated_at,
  });
}
