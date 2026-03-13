/**
 * Smart Status Sync — reads lead statuses from Google Sheets via Apps Script and updates the DB.
 *
 * Strategy:
 * 1. Query DB for leads that have no status (or non-final status)
 * 2. Group by agentId + sheetTab → tells us exactly which sheets to read
 * 3. Look up agent's sheet URL from agentSheets table
 * 4. For each unique spreadsheet, call Apps Script ONCE to get all tabs
 * 5. Match DB leads to sheet rows by phone number (cleaned/normalized)
 * 6. Update DB with the status found
 *
 * Uses Apps Script instead of Google Sheets API:
 * - No quota issues (Apps Script has its own generous limits)
 * - No service account auth needed
 * - One call per spreadsheet returns ALL tabs
 * - Already proven to work for Orders page
 */

import { getLeadsNeedingSync, updateLeadStatuses, getDb } from './db';
import { extractSpreadsheetId } from './googleSheets';
import { eq } from 'drizzle-orm';
import { agentSheets } from '../drizzle/schema';

/** Clean phone for matching — strip apostrophe prefix and non-digits */
export function cleanPhoneForMatch(phone: string): string {
  return phone.replace(/^'/, '').replace(/\D/g, '');
}

/** Match two phones: strip to digits and compare */
export function phonesMatch(dbPhone: string, sheetPhone: string): boolean {
  const a = cleanPhoneForMatch(dbPhone);
  const b = cleanPhoneForMatch(sheetPhone);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.endsWith(b) || b.endsWith(a)) return true;
  const aNoZero = a.replace(/^0+/, '');
  const bNoZero = b.replace(/^0+/, '');
  if (aNoZero === bNoZero) return true;
  if (aNoZero.endsWith(bNoZero) || bNoZero.endsWith(aNoZero)) return true;
  return false;
}

export interface SyncResult {
  totalPending: number;
  groupsProcessed: number;
  leadsUpdated: number;
  errors: string[];
  duration: number;
}

/**
 * Apps Script response shape (same as used by Orders page):
 * { title: string, tabs: { [tabName]: { rows: string[][] } } }
 * Each row is an array of cell values as display strings (no header row).
 * Column order: 0=Date, 1=Status, 2=Qty, 3=Delivery, 4=Notes, 5=Code, 6=Product, 7=Name, 8=Phone, ...
 */
interface AppsScriptResponse {
  title: string;
  tabs: Record<string, { rows: string[][] }>;
  error?: string;
}

/**
 * Fetch all tabs from a spreadsheet via Apps Script.
 * Returns null on failure.
 */
async function fetchSheetViaAppsScript(appsScriptUrl: string, spreadsheetId: string): Promise<AppsScriptResponse | null> {
  try {
    const url = `${appsScriptUrl}?id=${spreadsheetId}&_cb=${Date.now()}`;
    console.log(`[StatusSync] Fetching via Apps Script: ${spreadsheetId}`);
    const response = await fetch(url, {
      redirect: 'follow' as any,
      cache: 'no-store',
      signal: AbortSignal.timeout(60000), // 60s timeout per sheet
    });
    if (!response.ok) {
      console.error(`[StatusSync] Apps Script returned ${response.status} for ${spreadsheetId}`);
      return null;
    }
    const data: AppsScriptResponse = await response.json();
    if (data.error) {
      console.warn(`[StatusSync] Apps Script error for ${spreadsheetId}: ${data.error}`);
      return null;
    }
    return data;
  } catch (err: any) {
    console.error(`[StatusSync] Apps Script fetch failed for ${spreadsheetId}:`, err.message || err);
    return null;
  }
}

/**
 * Run the smart status sync.
 * Returns a summary of what was synced.
 */
export async function runStatusSync(): Promise<SyncResult> {
  const startTime = Date.now();
  const result: SyncResult = {
    totalPending: 0,
    groupsProcessed: 0,
    leadsUpdated: 0,
    errors: [],
    duration: 0,
  };

  try {
    const appsScriptUrl = process.env.VITE_APPS_SCRIPT_URL;
    if (!appsScriptUrl) {
      result.errors.push('Apps Script URL not configured (VITE_APPS_SCRIPT_URL)');
      result.duration = Date.now() - startTime;
      return result;
    }

    // Step 1: Get leads that need syncing, grouped by agent+tab
    const { groups, totalPending } = await getLeadsNeedingSync();
    result.totalPending = totalPending;

    if (groups.length === 0) {
      console.log('[StatusSync] No leads need syncing');
      result.duration = Date.now() - startTime;
      return result;
    }

    console.log(`[StatusSync] ${totalPending} leads pending across ${groups.length} agent+tab groups`);

    // Step 2: Look up agent sheet URLs
    const db = await getDb();
    if (!db) {
      result.errors.push('Database not available');
      result.duration = Date.now() - startTime;
      return result;
    }

    // Get all unique agent IDs and fetch their sheet URLs
    const uniqueAgentIds = Array.from(new Set(groups.map(g => g.agentId)));
    const allAgentSheets = await Promise.all(
      uniqueAgentIds.map(async (agentId) => {
        const rows = await db
          .select({ id: agentSheets.id, sheetUrl: agentSheets.sheetUrl })
          .from(agentSheets)
          .where(eq(agentSheets.id, agentId));
        return rows[0] ? { id: agentId, sheetUrl: rows[0].sheetUrl } : null;
      })
    );

    // Build agentId → { sheetUrl, spreadsheetId } map
    const agentInfoMap = new Map<number, { sheetUrl: string; spreadsheetId: string }>();
    for (const agent of allAgentSheets) {
      if (agent) {
        try {
          const spreadsheetId = extractSpreadsheetId(agent.sheetUrl);
          agentInfoMap.set(agent.id, { sheetUrl: agent.sheetUrl, spreadsheetId });
        } catch {
          result.errors.push(`Invalid sheet URL for agent id=${agent.id}`);
        }
      }
    }

    // Step 3: Group by spreadsheetId to minimize Apps Script calls
    // One spreadsheet may serve multiple agents (rare) or one agent may have multiple tabs
    const spreadsheetGroups = new Map<string, {
      spreadsheetId: string;
      agentGroups: typeof groups;
    }>();

    for (const group of groups) {
      const info = agentInfoMap.get(group.agentId);
      if (!info) {
        result.errors.push(`No sheet URL for agent ${group.agentName} (id=${group.agentId})`);
        continue;
      }
      if (!spreadsheetGroups.has(info.spreadsheetId)) {
        spreadsheetGroups.set(info.spreadsheetId, {
          spreadsheetId: info.spreadsheetId,
          agentGroups: [],
        });
      }
      spreadsheetGroups.get(info.spreadsheetId)!.agentGroups.push(group);
    }

    console.log(`[StatusSync] ${spreadsheetGroups.size} unique spreadsheets to fetch`);

    // Step 4: Fetch each spreadsheet via Apps Script and match leads
    const allUpdates: Array<{
      id: number;
      status: string | null;
      quantity: number | null;
      delivery: string | null;
      callNotes: string | null;
      sheetRow: number | null;
    }> = [];

    // Process spreadsheets in parallel (max 10 concurrent)
    const spreadsheetEntries = Array.from(spreadsheetGroups.values());
    const BATCH_SIZE = 10;

    for (let i = 0; i < spreadsheetEntries.length; i += BATCH_SIZE) {
      const batch = spreadsheetEntries.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async ({ spreadsheetId, agentGroups }) => {
          const data = await fetchSheetViaAppsScript(appsScriptUrl, spreadsheetId);
          if (!data || !data.tabs) {
            result.errors.push(`Failed to fetch spreadsheet ${spreadsheetId}`);
            return;
          }

          // For each agent+tab group, match leads against the sheet data
          for (const group of agentGroups) {
            const tabData = data.tabs[group.sheetTab];
            if (!tabData || !tabData.rows) {
              result.errors.push(`Tab "${group.sheetTab}" not found in spreadsheet ${spreadsheetId} for ${group.agentName}`);
              continue;
            }

            const rows = tabData.rows;

            // Build phone → row data map from the sheet
            // Apps Script rows don't include header — row[0] is first data row
            // Column indices: 0=Date, 1=Status, 2=Qty, 3=Delivery, 4=Notes, 5=Code, 6=Product, 7=Name, 8=Phone
            const sheetPhoneMap = new Map<string, { rowIndex: number; row: string[] }>();
            for (let r = 0; r < rows.length; r++) {
              const row = rows[r] ?? [];
              const phone = (row[8] ?? '').toString().trim(); // Col I = Phone
              if (phone) {
                const cleanPhone = cleanPhoneForMatch(phone);
                if (cleanPhone) {
                  // If multiple rows have same phone, keep the last one (most recent)
                  sheetPhoneMap.set(cleanPhone, { rowIndex: r + 2, row }); // +2: 1 for header, 1 for 0-based to 1-based
                }
              }
            }

            // Match DB leads to sheet rows
            for (const lead of group.leads) {
              if (!lead.phone) continue;
              const dbPhoneClean = cleanPhoneForMatch(lead.phone);
              if (!dbPhoneClean) continue;

              // Try exact match first
              let match = sheetPhoneMap.get(dbPhoneClean);

              // If no exact match, try fuzzy (endsWith)
              if (!match) {
                for (const [sheetPhone, data] of Array.from(sheetPhoneMap.entries())) {
                  if (phonesMatch(dbPhoneClean, sheetPhone)) {
                    match = data;
                    break;
                  }
                }
              }

              if (match) {
                const status = (match.row[1] ?? '').toString().trim() || null; // Col B
                const qtyStr = (match.row[2] ?? '').toString().trim();
                const quantity = qtyStr ? parseInt(qtyStr, 10) || null : null; // Col C
                const delivery = (match.row[3] ?? '').toString().trim() || null; // Col D
                const callNotes = (match.row[4] ?? '').toString().trim() || null; // Col E

                allUpdates.push({
                  id: lead.id,
                  status,
                  quantity,
                  delivery,
                  callNotes,
                  sheetRow: match.rowIndex,
                });
              }
            }

            result.groupsProcessed++;
          }
        })
      );

      // Log any rejected promises
      for (const br of batchResults) {
        if (br.status === 'rejected') {
          result.errors.push(`Batch error: ${br.reason}`);
        }
      }
    }

    // Step 5: Batch update all matched leads in DB
    if (allUpdates.length > 0) {
      result.leadsUpdated = await updateLeadStatuses(allUpdates);
      console.log(`[StatusSync] Updated ${result.leadsUpdated} lead statuses`);
    } else {
      console.log('[StatusSync] No matches found to update');
    }
  } catch (error: any) {
    result.errors.push(`Sync failed: ${error.message || error}`);
    console.error('[StatusSync] Fatal error:', error);
  }

  result.duration = Date.now() - startTime;
  console.log(`[StatusSync] Complete in ${result.duration}ms — ${result.leadsUpdated} updated, ${result.errors.length} errors`);
  return result;
}
