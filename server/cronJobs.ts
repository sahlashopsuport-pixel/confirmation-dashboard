/**
 * Cron Jobs — Server-side scheduled tasks.
 *
 * 1. Lead status sync: twice per day at 8:00 AM and 8:00 PM (UTC+1 / Algeria time)
 * 2. Suivi cache sync: every 30 minutes — scans DHD API (last 7 days) and caches problem orders
 */

import { runStatusSync } from './statusSync';
import { runSuiviSync, isSuiviSyncRunning } from './suiviSync';

// ─── Lead Status Sync (twice daily) ────────────────────────────────────

const SYNC_HOURS_UTC = [7, 19]; // 8 AM and 8 PM in UTC+1 (Algeria)
const CHECK_INTERVAL_MS = 60 * 1000; // Check every minute

let lastSyncDate = ''; // Track last sync to avoid double-runs

function getCurrentUTCHour(): number {
  return new Date().getUTCHours();
}

function getTodayKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${getCurrentUTCHour()}`;
}

async function checkAndSync() {
  const currentHour = getCurrentUTCHour();
  const todayKey = getTodayKey();

  // Only sync at the designated hours, and only once per hour
  if (SYNC_HOURS_UTC.includes(currentHour) && lastSyncDate !== todayKey) {
    lastSyncDate = todayKey;
    console.log(`[CronJobs] Auto-sync triggered at UTC hour ${currentHour} (${currentHour + 1}:00 Algeria time)`);

    try {
      const result = await runStatusSync();
      console.log(`[CronJobs] Auto-sync complete: ${result.leadsUpdated} leads updated in ${(result.duration / 1000).toFixed(1)}s`);
      if (result.errors.length > 0) {
        console.warn(`[CronJobs] Auto-sync had ${result.errors.length} errors:`, result.errors.slice(0, 5));
      }
    } catch (error) {
      console.error('[CronJobs] Auto-sync failed:', error);
    }
  }
}

// ─── Suivi Cache Sync (every 30 minutes) ───────────────────────────────

const SUIVI_SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

async function runSuiviSyncJob() {
  if (isSuiviSyncRunning()) {
    console.log('[CronJobs] Suivi sync already running, skipping...');
    return;
  }

  console.log('[CronJobs] Starting suivi cache sync...');
  try {
    const result = await runSuiviSync('auto');
    if (result.success) {
      console.log(`[CronJobs] Suivi sync complete: ${result.pagesScanned} pages, ${result.problemsFound} problems, ${result.ordersRemoved} removed, ${(result.durationMs / 1000).toFixed(1)}s`);
    } else {
      console.warn(`[CronJobs] Suivi sync skipped/failed: ${result.error}`);
    }
  } catch (error) {
    console.error('[CronJobs] Suivi sync crashed:', error);
  }
}

// ─── Start All Jobs ────────────────────────────────────────────────────

/**
 * Start the cron scheduler. Call once at server startup.
 */
export function startCronJobs() {
  console.log('[CronJobs] Starting schedulers:');
  console.log('  - Lead status sync: 8:00 AM and 8:00 PM Algeria time');
  console.log('  - Suivi cache sync: every 30 minutes');
  
  // Lead status sync — check every minute
  setTimeout(() => checkAndSync().catch(console.error), 10_000); // 10s delay
  setInterval(() => checkAndSync().catch(console.error), CHECK_INTERVAL_MS);

  // Suivi cache sync — run immediately on startup, then every 30 minutes
  // 30s delay to let server fully start and DB connect
  setTimeout(() => runSuiviSyncJob().catch(console.error), 30_000);
  setInterval(() => runSuiviSyncJob().catch(console.error), SUIVI_SYNC_INTERVAL_MS);
}
