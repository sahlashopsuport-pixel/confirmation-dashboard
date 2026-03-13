import { COOKIE_NAME, getAlgeriaDateStr } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getAllAgentSheets, addAgentSheet, deleteAgentSheet, updateAgentSheet, verifyDashboardUser, getDashboardUserRole, logAssignment, logExport, getAssignmentHistoryList, getAssignmentHistoryDetail, getDailyStats, getAllPeopleIdMappings, bulkUpsertPeopleIdMappings, deleteAllDeliveryOrders, bulkInsertDeliveryOrders, logDeliveryUpload, getDeliveryStats, getDeliveryUploads, getAgentCodeMap, getAgentDeliveryRates, logCollection, getCollectionHistoryList, getCollectionBatchDetail, updateHistoryValidation, deleteHistoryEntries, submitBatchToInbox, getInboxSummary, getPendingBatches, markBatchesAsAssigned, getPageManagerSubmissions, getPendingLeadCount, getSalaryRecord, getSalaryHistory, getSalaryRecordsForMonth, upsertSalaryRecord, getPageManagerUsers, storeAssignedLeads, queryAssignedLeads, getLeadArchiveStats, touchUserActivity, getAllDashboardUsersActivity } from "./db";
import { parseEcoTrackExcel, classifyStatus, STATUS_LABELS, STATUS_COLORS, type ParsedEcoTrackOrder } from "./ecotrackParser";
import { runStatusSync } from "./statusSync";
import { addTrackingNote, fetchOrdersPage, SUIVI_TARGET_STATUSES, WILAYA_MAP, DHD_STATUS_LABELS, isProblemReason, classifyReason, PROBLEM_REASONS } from "./dhdApi";
import { insertSuiviCallLog, getSuiviCallLogsByTracking, getRecentSuiviCallLogs, getSuiviCallStats, getAllCachedSuiviOrders, getCachedSuiviStats, getLatestSuiviSync } from "./db";
import { runSuiviSync, isSuiviSyncRunning } from "./suiviSync";
import { parseColivraisonExcel, type ParsedColivraisonOrder } from "./colivraisonParser";
import {
  fetchAndResolveSheetActivity,
  analyzeAllResolvedActivities,
  extractSpreadsheetId as extractSpreadsheetIdDrive,
  buildPerSheetPeopleIdMap,
  fetchDriveActivity,
  fetchRevisions,
  type AgentDailyActivity,
  type PeopleIdMapping,
  type ResolvedActivityEvent,
} from "./driveActivity";
import jwt from "jsonwebtoken";
import {
  extractSpreadsheetId,
  parseLeadsFromPaste,
  formatLeadRow,
  appendRows,
  getSheetNames,
  getUntreatedLeadCount,
  getUntreatedLeadCountAllTabs,
  testConnection,
  clearAllSheetFilters,
  protectAgentSheet,
  removeSheetProtection as removeSheetProtectionFn,
  type LeadData,
} from "./googleSheets";

const DASHBOARD_COOKIE = "dashboard_session";
const JWT_SECRET = process.env.JWT_SECRET || "scalex-dashboard-secret-key";

// Activity cache: avoid re-fetching from Google APIs on rapid refreshes (2-min TTL)
const ACTIVITY_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const activityCache = new Map<string, { data: { agents: AgentDailyActivity[]; unmapped: string[] }; timestamp: number }>();

// Agent status cache: lightweight status dots (60s TTL)
const STATUS_CACHE_TTL_MS = 60 * 1000; // 60 seconds
const statusCache = new Map<string, { data: { statuses: Array<{ sheetName: string; agentEmail: string; lastEditTimestamp: string | null; error?: boolean }> }; timestamp: number }>();

// DHD Summary cache: avoid re-fetching 66 pages on every request (5-min TTL)
const DHD_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const dhdSummaryCache: { data: any; timestamp: number } = { data: null, timestamp: 0 };

// Per-sheet error backoff: skip sheets that keep failing (5-min backoff)
const sheetErrorBackoff = new Map<string, { failCount: number; lastFailTime: number }>();
const ERROR_BACKOFF_MS = 5 * 60 * 1000; // 5 minutes
const MAX_FAIL_COUNT = 3; // After 3 consecutive failures, back off

function shouldSkipSheet(fileId: string): boolean {
  const err = sheetErrorBackoff.get(fileId);
  if (!err) return false;
  if (err.failCount < MAX_FAIL_COUNT) return false;
  return Date.now() - err.lastFailTime < ERROR_BACKOFF_MS;
}

function recordSheetError(fileId: string): void {
  const existing = sheetErrorBackoff.get(fileId);
  sheetErrorBackoff.set(fileId, {
    failCount: (existing?.failCount || 0) + 1,
    lastFailTime: Date.now(),
  });
}

function recordSheetSuccess(fileId: string): void {
  sheetErrorBackoff.delete(fileId);
}

// Server-side cache for untreated counts (avoids hammering Google Sheets API)
const untreatedCache = new Map<string, { data: { total: number; untreated: number }; ts: number }>();
const UNTREATED_CACHE_TTL = 120_000; // 2 minutes — reduced API pressure

// Valid dashboard/country slugs
export const DASHBOARD_SLUGS = ["algeria", "viconis", "libya", "tunisia"] as const;
export type DashboardSlug = typeof DASHBOARD_SLUGS[number];

// Middleware to check dashboard auth from cookie
function getDashboardUser(req: any): { id: number; username: string; dashboardRole: string } | null {
  try {
    const token = req.cookies?.[DASHBOARD_COOKIE];
    if (!token) return null;
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number; username: string; dashboardRole?: string };
    return { id: decoded.id, username: decoded.username, dashboardRole: decoded.dashboardRole || 'user' };
  } catch {
    return null;
  }
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Dashboard authentication
  dashboardAuth: router({
    login: publicProcedure
      .input(z.object({
        username: z.string().min(1),
        password: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = await verifyDashboardUser(input.username, input.password);
        if (!user) {
          return { success: false as const, error: "Invalid username or password" };
        }
        // Create JWT token — include role for frontend access control
        const token = jwt.sign({ id: user.id, username: user.username, dashboardRole: user.dashboardRole }, JWT_SECRET, { expiresIn: "7d" });
        // Set cookie
        ctx.res.cookie(DASHBOARD_COOKIE, token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax" as const,
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
          path: "/",
        });
        // Touch activity on login
        touchUserActivity(user.id).catch(() => {});
        return { success: true as const, username: user.username, dashboardRole: user.dashboardRole };
      }),

    check: publicProcedure.query(({ ctx }) => {
      const user = getDashboardUser(ctx.req);
      if (!user) {
        return { authenticated: false as const };
      }
      // Heartbeat: update lastActiveAt (throttled to once per 30s per user)
      touchUserActivity(user.id).catch(() => {});
      return { authenticated: true as const, username: user.username, dashboardRole: user.dashboardRole };
    }),

    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(DASHBOARD_COOKIE, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        path: "/",
      });
      return { success: true };
    }),
  }),

  // Agent Sheets CRUD — now with country filtering
  sheets: router({
    list: publicProcedure
      .input(z.object({
        country: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) return [];
        return getAllAgentSheets(input?.country);
      }),

    add: publicProcedure
      .input(z.object({
        name: z.string().min(1),
        sheetUrl: z.string().url(),
        country: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        return addAgentSheet({
          name: input.name,
          sheetUrl: input.sheetUrl,
          country: input.country || null,
        });
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        return deleteAgentSheet(input.id);
      }),

    update: publicProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        sheetUrl: z.string().url().optional(),
        country: z.string().optional(),
        agentCode: z.string().optional(),
        agentEmail: z.string().email().optional().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        const { id, ...data } = input;
        return updateAgentSheet(id, data);
      }),

    /** Apply sheet protection to agent spreadsheets */
    applySheetProtection: publicProcedure
      .input(z.object({
        agentIds: z.array(z.number()),
        managerEmails: z.array(z.string()),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        if (user.dashboardRole !== 'super_admin' && user.dashboardRole !== 'user') throw new Error("Only authorized users can apply protection");

        const allSheets = await getAllAgentSheets();
        const results: Record<number, { protected: number; tabs: string[]; errors: string[] }> = {};
        let totalProtected = 0;

        const spreadsheetMap = new Map<string, { agentId: number; name: string }[]>();
        for (const agentId of input.agentIds) {
          const agent = allSheets.find(s => s.id === agentId);
          if (!agent) continue;
          try {
            const spreadsheetId = extractSpreadsheetId(agent.sheetUrl);
            if (!spreadsheetMap.has(spreadsheetId)) spreadsheetMap.set(spreadsheetId, []);
            spreadsheetMap.get(spreadsheetId)!.push({ agentId: agent.id, name: agent.name });
          } catch { /* skip invalid URLs */ }
        }

        const entries = Array.from(spreadsheetMap.entries());
        for (let i = 0; i < entries.length; i += 2) {
          const batch = entries.slice(i, i + 2);
          await Promise.all(
            batch.map(async ([spreadsheetId, agents]) => {
              try {
                const result = await protectAgentSheet(spreadsheetId, input.managerEmails);
                for (const agent of agents) {
                  results[agent.agentId] = result;
                }
                totalProtected += result.protected;
              } catch (err: any) {
                console.error(`[Protection] Failed for spreadsheet ${spreadsheetId}:`, err.message);
                for (const agent of agents) {
                  results[agent.agentId] = { protected: 0, tabs: [], errors: [err.message] };
                }
              }
            })
          );
          if (i + 2 < entries.length) {
            await new Promise(r => setTimeout(r, 1000));
          }
        }

        return { totalProtected, results, spreadsheetsProcessed: spreadsheetMap.size };
      }),

    /** Remove sheet protection from agent spreadsheets */
    removeSheetProtection: publicProcedure
      .input(z.object({
        agentIds: z.array(z.number()),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        if (user.dashboardRole !== 'super_admin' && user.dashboardRole !== 'user') throw new Error("Only authorized users can remove protection");

        const allSheets = await getAllAgentSheets();
        let totalRemoved = 0;

        const spreadsheetMap = new Map<string, number[]>();
        for (const agentId of input.agentIds) {
          const agent = allSheets.find(s => s.id === agentId);
          if (!agent) continue;
          try {
            const spreadsheetId = extractSpreadsheetId(agent.sheetUrl);
            if (!spreadsheetMap.has(spreadsheetId)) spreadsheetMap.set(spreadsheetId, []);
            spreadsheetMap.get(spreadsheetId)!.push(agentId);
          } catch { /* skip */ }
        }

        const entries = Array.from(spreadsheetMap.entries());
        for (let i = 0; i < entries.length; i += 2) {
          const batch = entries.slice(i, i + 2);
          await Promise.all(
            batch.map(async ([spreadsheetId]) => {
              try {
                const result = await removeSheetProtectionFn(spreadsheetId);
                totalRemoved += result.removed;
              } catch (err: any) {
                console.error(`[Protection] Failed to remove for ${spreadsheetId}:`, err.message);
              }
            })
          );
          if (i + 2 < entries.length) {
            await new Promise(r => setTimeout(r, 1000));
          }
        }

        return { totalRemoved, spreadsheetsProcessed: spreadsheetMap.size };
      }),
  }),

  // Lead Assignment
  leads: router({
    parse: publicProcedure
      .input(z.object({ rawText: z.string().min(1), market: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        const leads = parseLeadsFromPaste(input.rawText, input.market);
        return { leads, count: leads.length };
      }),

    agents: publicProcedure
      .input(z.object({ country: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) return [];
        const sheets = await getAllAgentSheets(input?.country);
        return sheets.map((s) => ({
          id: s.id,
          name: s.name,
          sheetUrl: s.sheetUrl,
          country: s.country,
          agentCode: s.agentCode || "",
        }));
      }),

    testConnection: publicProcedure
      .input(z.object({ sheetUrl: z.string().url() }))
      .mutation(async ({ input, ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        const spreadsheetId = extractSpreadsheetId(input.sheetUrl);
        return testConnection(spreadsheetId);
      }),

    getSheetTabs: publicProcedure
      .input(z.object({ agentId: z.number() }))
      .query(async ({ input, ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) return [];
        const allSheets = await getAllAgentSheets();
        const agent = allSheets.find((s) => s.id === input.agentId);
        if (!agent) return [];
        try {
          const spreadsheetId = extractSpreadsheetId(agent.sheetUrl);
          const tabs = await getSheetNames(spreadsheetId);
          return tabs;
        } catch {
          return [];
        }
      }),

    assign: publicProcedure
      .input(z.object({
        agentId: z.number(),
        leads: z.array(z.object({
          date: z.string(),
          customerName: z.string(),
          phone: z.string(),
          wilaya: z.string(),
          product: z.string(),
          price: z.union([z.string(), z.number()]),
          sku: z.string(),
          address2: z.string().optional(),
          orderType: z.string().optional(),
        })),
        agentCode: z.string().optional(),
        sheetTab: z.string().optional(),
        market: z.string().optional(),
        workDate: z.string().optional(), // YYYY-MM-DD business work date
      }))
      .mutation(async ({ input, ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");

        const allSheets = await getAllAgentSheets();
        const agent = allSheets.find((s) => s.id === input.agentId);
        if (!agent) throw new Error("Agent not found");

        const code = input.agentCode || agent.agentCode || "";
        const spreadsheetId = extractSpreadsheetId(agent.sheetUrl);

        const tabNames = await getSheetNames(spreadsheetId);
        if (tabNames.length === 0) {
          throw new Error("No sheets found in the spreadsheet");
        }

        // Use specified tab or fall back to first tab
        let targetTab = input.sheetTab || tabNames[0];
        if (input.sheetTab && !tabNames.includes(input.sheetTab)) {
          throw new Error(`Tab "${input.sheetTab}" not found. Available: ${tabNames.join(", ")}`);
        }

        // Determine market from input or agent country
        const market = input.market || agent.country || undefined;

        const rows = input.leads.map((lead) =>
          formatLeadRow(lead as LeadData, code, market, input.workDate)
        );

        const appendedCount = await appendRows(spreadsheetId, targetTab, rows);

        // Log single assignment to history
        const effectiveWorkDate = input.workDate || getAlgeriaDateStr();
        logAssignment({
          assignedBy: user.username,
          country: market || agent.country || 'unknown',
          sheetTab: targetTab,
          totalLeads: input.leads.length,
          totalAssigned: appendedCount,
          totalFailed: 0,
          status: 'success',
          workDate: effectiveWorkDate,
          items: [{
            agentId: input.agentId,
            agentName: agent.name,
            leadCount: appendedCount,
            success: true,
            leads: input.leads,
          }],
        }).catch((err) => console.error('[History] Failed to log single assignment:', err));

        // Store leads permanently in database (fire-and-forget)
        storeAssignedLeads(
          input.leads.map(lead => ({
            agentId: input.agentId,
            agentName: agent.name,
            agentCode: code,
            workDate: effectiveWorkDate,
            market: market || agent.country || 'unknown',
            sheetTab: targetTab,
            customerName: lead.customerName,
            phone: lead.phone,
            wilaya: lead.wilaya,
            product: lead.product,
            price: String(lead.price),
            sku: lead.sku,
            address2: lead.address2,
            orderType: lead.orderType,
            assignedBy: user.username,
          }))
        ).catch((err) => console.error('[LeadArchive] Failed to store leads:', err));

        return {
          success: true,
          agentName: agent.name,
          sheetTab: targetTab,
          rowsAppended: appendedCount,
          totalLeads: input.leads.length,
        };
      }),

    // Multi-agent split assignment: distribute leads round-robin across multiple agents
    splitAssign: publicProcedure
      .input(z.object({
        assignments: z.array(z.object({
          agentId: z.number(),
          sheetTab: z.string(),
          leadIndices: z.array(z.number()), // indices into the leads array
        })),
        leads: z.array(z.object({
          date: z.string(),
          customerName: z.string(),
          phone: z.string(),
          wilaya: z.string(),
          product: z.string(),
          price: z.union([z.string(), z.number()]),
          sku: z.string(),
          address2: z.string().optional(),
          orderType: z.string().optional(),
        })),
        market: z.string().optional(),
        workDate: z.string().optional(), // YYYY-MM-DD business work date
      }))
      .mutation(async ({ input, ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");

        const allSheets = await getAllAgentSheets();
        const results: { agentName: string; sheetTab: string; rowsAppended: number }[] = [];
        const errors: { agentName: string; error: string; failedLeadIndices: number[] }[] = [];

        // PRE-FLIGHT SAFETY: Validate all lead indices are within bounds
        for (const assignment of input.assignments) {
          const outOfBounds = assignment.leadIndices.filter((i) => i < 0 || i >= input.leads.length);
          if (outOfBounds.length > 0) {
            const agent = allSheets.find((s) => s.id === assignment.agentId);
            errors.push({
              agentName: agent?.name || `ID ${assignment.agentId}`,
              error: `${outOfBounds.length} lead index(es) out of bounds (max: ${input.leads.length - 1}). Aborting this agent to prevent data loss.`,
              failedLeadIndices: assignment.leadIndices,
            });
          }
        }
        // If any pre-flight errors, skip those assignments
        const safeAssignments = input.assignments.filter((a) => {
          return !errors.some((e) => e.failedLeadIndices === a.leadIndices);
        });

        for (let idx = 0; idx < safeAssignments.length; idx++) {
          const assignment = safeAssignments[idx];
          const agent = allSheets.find((s) => s.id === assignment.agentId);
          if (!agent) {
            errors.push({ agentName: `ID ${assignment.agentId}`, error: "Agent not found", failedLeadIndices: assignment.leadIndices });
            continue;
          }

          // Stagger between agents to avoid bursting API quota (1.5s gap between agents)
          if (idx > 0) {
            await new Promise((r) => setTimeout(r, 1500));
          }

          try {
            const code = agent.agentCode || "";
            const spreadsheetId = extractSpreadsheetId(agent.sheetUrl);

            // Determine market from input or agent country
            const market = input.market || agent.country || undefined;

            // Get the leads for this agent by indices
            const agentLeads = assignment.leadIndices.map((i) => input.leads[i]).filter(Boolean);
            if (agentLeads.length === 0) continue;

            const rows = agentLeads.map((lead) => formatLeadRow(lead as LeadData, code, market, input.workDate));
            const appendedCount = await appendRows(spreadsheetId, assignment.sheetTab, rows);

            results.push({
              agentName: agent.name,
              sheetTab: assignment.sheetTab,
              rowsAppended: appendedCount,
            });
          } catch (err: any) {
            errors.push({ agentName: agent.name, error: err.message || "Unknown error", failedLeadIndices: assignment.leadIndices });
          }
        }

        const totalAssigned = results.reduce((sum, r) => sum + r.rowsAppended, 0);
        const totalFailed = errors.reduce((sum, e) => sum + e.failedLeadIndices.length, 0);

        // POST-FLIGHT SAFETY: Verify no leads were silently dropped
        const totalRequestedLeads = input.assignments.reduce((sum, a) => sum + a.leadIndices.length, 0);
        const totalAccountedFor = totalAssigned + totalFailed;
        if (totalAccountedFor < totalRequestedLeads) {
          const dropped = totalRequestedLeads - totalAccountedFor;
          console.error(`[SAFETY] ${dropped} leads were silently dropped! Requested: ${totalRequestedLeads}, Accounted: ${totalAccountedFor}`);
          errors.push({
            agentName: "SYSTEM",
            error: `WARNING: ${dropped} lead(s) may have been lost during assignment. Please verify agent sheets manually.`,
            failedLeadIndices: [],
          });
        }

        // Log assignment to history (fire-and-forget, don't block the response)
        const allSheets2 = allSheets;
        const historyItems = input.assignments.map((assignment) => {
          const agent = allSheets2.find((s) => s.id === assignment.agentId);
          const agentLeads = assignment.leadIndices.map((i) => input.leads[i]).filter(Boolean);
          const result = results.find((r) => r.agentName === agent?.name);
          const error = errors.find((e) => e.agentName === (agent?.name || `ID ${assignment.agentId}`));
          return {
            agentId: assignment.agentId,
            agentName: agent?.name || `ID ${assignment.agentId}`,
            leadCount: agentLeads.length,
            success: !error,
            errorMessage: error?.error,
            leads: agentLeads,
          };
        });

        const effectiveWorkDate = input.workDate || getAlgeriaDateStr();
        logAssignment({
          assignedBy: user.username,
          country: input.market || 'unknown',
          sheetTab: input.assignments[0]?.sheetTab || 'unknown',
          totalLeads: input.leads.length,
          totalAssigned,
          totalFailed,
          status: errors.length === 0 ? 'success' : totalAssigned > 0 ? 'partial' : 'failed',
          workDate: effectiveWorkDate,
          items: historyItems,
        }).catch((err) => console.error('[History] Failed to log assignment:', err));

        // Store all assigned leads permanently in database (fire-and-forget)
        const allLeadsToStore = input.assignments.flatMap((assignment) => {
          const agent = allSheets.find((s) => s.id === assignment.agentId);
          if (!agent) return [];
          const agentLeads = assignment.leadIndices.map((i) => input.leads[i]).filter(Boolean);
          return agentLeads.map(lead => ({
            agentId: assignment.agentId,
            agentName: agent.name,
            agentCode: agent.agentCode || '',
            workDate: effectiveWorkDate,
            market: input.market || agent.country || 'unknown',
            sheetTab: assignment.sheetTab,
            customerName: lead.customerName,
            phone: lead.phone,
            wilaya: lead.wilaya,
            product: lead.product,
            price: String(lead.price),
            sku: lead.sku,
            address2: lead.address2,
            orderType: lead.orderType,
            assignedBy: user.username,
          }));
        });
        storeAssignedLeads(allLeadsToStore)
          .catch((err) => console.error('[LeadArchive] Failed to store leads:', err));

        return {
          success: errors.length === 0,
          results,
          errors,
          totalAssigned,
        };
      }),

    // Get untreated lead counts for agents — reads ALL tabs (all weeks) and sums across them
    // Clear basic filters on all tabs for given agents before data refresh
    clearFilters: publicProcedure
      .input(z.object({
        agentIds: z.array(z.number()),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");

        const allSheets = await getAllAgentSheets();
        const results: Record<number, { cleared: number; tabs: string[] }> = {};
        let totalCleared = 0;

        // Process agents in batches of 3 to avoid API quota issues
        const BATCH_SIZE = 3;
        for (let i = 0; i < input.agentIds.length; i += BATCH_SIZE) {
          const batch = input.agentIds.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map(async (agentId) => {
              const agent = allSheets.find((s) => s.id === agentId);
              if (!agent) return;
              try {
                const spreadsheetId = extractSpreadsheetId(agent.sheetUrl);
                const result = await clearAllSheetFilters(spreadsheetId);
                results[agentId] = result;
                totalCleared += result.cleared;
              } catch (err: any) {
                console.error(`[ClearFilter] Failed for agent ${agent.name}:`, err.message);
                results[agentId] = { cleared: 0, tabs: [] };
              }
            })
          );
          if (i + BATCH_SIZE < input.agentIds.length) {
            await new Promise((r) => setTimeout(r, 500));
          }
        }

        return { totalCleared, results };
      }),

    // [REMOVED] fixDates — no longer needed, Apps Script reads dates correctly via getDisplayValues()
    // [REMOVED] diagnoseDates — replaced with local computation from Apps Script data

    // Detect active filters via Apps Script (zero Google Sheets API quota)
    detectFilters: publicProcedure
      .input(z.object({
        agentIds: z.array(z.number()),
      }))
      .query(async ({ input }) => {
        const appsScriptUrl = process.env.VITE_APPS_SCRIPT_URL;
        if (!appsScriptUrl) return {};

        const allSheets = await getAllAgentSheets();
        const results: Record<number, string[]> = {};

        // Group agents by spreadsheet ID to avoid duplicate calls
        const spreadsheetMap = new Map<string, number[]>(); // spreadsheetId → [agentIds]
        for (const agentId of input.agentIds) {
          const agent = allSheets.find((s) => s.id === agentId);
          if (!agent) continue;
          try {
            const spreadsheetId = extractSpreadsheetId(agent.sheetUrl);
            if (!spreadsheetMap.has(spreadsheetId)) spreadsheetMap.set(spreadsheetId, []);
            spreadsheetMap.get(spreadsheetId)!.push(agentId);
          } catch {
            // Invalid URL, skip
          }
        }

        // Call Apps Script for ALL unique spreadsheets in parallel (fast)
        const entries = Array.from(spreadsheetMap.entries());
        const filterResults = await Promise.allSettled(
          entries.map(async ([spreadsheetId, agentIds]) => {
            const url = `${appsScriptUrl}?id=${spreadsheetId}&action=filters&_cb=${Date.now()}`;
            const response = await fetch(url, { redirect: 'follow' as any, signal: AbortSignal.timeout(15000) });
            if (!response.ok) return;
            const data = await response.json() as { filters?: Record<string, boolean>; hasAnyFilter?: boolean; error?: string };
            if (data.error || !data.hasAnyFilter) return;

            const filteredTabs = Object.keys(data.filters || {});
            if (filteredTabs.length > 0) {
              for (const agentId of agentIds) {
                results[agentId] = filteredTabs;
              }
            }
          })
        );

        return results;
      }),

    // Collect confirmed orders with empty Column D from all agent sheets
    collectOrders: publicProcedure
      .input(z.object({
        country: z.string().optional(),
      }))
      .query(async ({ input, ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");

        const appsScriptUrl = process.env.VITE_APPS_SCRIPT_URL;
        if (!appsScriptUrl) throw new Error("Apps Script URL not configured");

        const allSheets = await getAllAgentSheets(input.country);
        if (allSheets.length === 0) return { orders: [], agents: [] };

        // Group agents by spreadsheet ID
        const spreadsheetMap = new Map<string, { agentId: number; name: string; sheetUrl: string }[]>();
        for (const agent of allSheets) {
          try {
            const spreadsheetId = extractSpreadsheetId(agent.sheetUrl);
            if (!spreadsheetMap.has(spreadsheetId)) spreadsheetMap.set(spreadsheetId, []);
            spreadsheetMap.get(spreadsheetId)!.push({ agentId: agent.id, name: agent.name, sheetUrl: agent.sheetUrl });
          } catch {
            // Invalid URL, skip
          }
        }

        // Fetch from all spreadsheets in parallel
        const entries = Array.from(spreadsheetMap.entries());
        const allOrders: Array<{
          agentId: number;
          agentName: string;
          spreadsheetId: string;
          sheetUrl: string;
          tab: string;
          row: number;
          phone: string;
          cells: string[];
        }> = [];

        const collectResults = await Promise.allSettled(
          entries.map(async ([spreadsheetId, agents]) => {
            const url = `${appsScriptUrl}?id=${spreadsheetId}&action=collect&_cb=${Date.now()}`;
            const response = await fetch(url, { redirect: 'follow' as any, signal: AbortSignal.timeout(30000) });
            if (!response.ok) return;
            const data = await response.json() as { orders?: Array<{ tab: string; row: number; phone: string; cells: string[] }>; error?: string };
            if (data.error || !data.orders) return;

            // All agents sharing this spreadsheet get the same orders
            const agentInfo = agents[0]; // Use first agent as the representative
            for (const order of data.orders) {
              allOrders.push({
                agentId: agentInfo.agentId,
                agentName: agentInfo.name,
                spreadsheetId,
                sheetUrl: agentInfo.sheetUrl,
                tab: order.tab,
                row: order.row,
                phone: order.phone,
                cells: order.cells,
              });
            }
          })
        );

        return {
          orders: allOrders,
          agents: allSheets.map(s => ({ id: s.id, name: s.name, sheetUrl: s.sheetUrl })),
        };
      }),

    // Mark orders as collected (write نعم to Column D)
    markOrders: publicProcedure
      .input(z.object({
        orders: z.array(z.object({
          spreadsheetId: z.string(),
          tab: z.string(),
          row: z.number(),
          phone: z.string(),
          agentId: z.number().optional(),
          agentName: z.string().optional(),
          customerName: z.string().optional(),
          product: z.string().optional(),
          qty: z.number().optional(),
          price: z.string().optional(),
          address: z.string().optional(),
        })),
        country: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");

        const appsScriptUrl = process.env.VITE_APPS_SCRIPT_URL;
        if (!appsScriptUrl) throw new Error("Apps Script URL not configured");

        // Group orders by spreadsheet ID
        const bySpreadsheet = new Map<string, Array<{ tab: string; row: number; phone: string }>>();
        for (const order of input.orders) {
          if (!bySpreadsheet.has(order.spreadsheetId)) bySpreadsheet.set(order.spreadsheetId, []);
          bySpreadsheet.get(order.spreadsheetId)!.push({ tab: order.tab, row: order.row, phone: order.phone });
        }

        let totalMarked = 0;
        let totalFailed = 0;
        const allDetails: Array<{ tab: string; row: number; phone: string; status: string; reason?: string }> = [];

        // Process each spreadsheet in parallel
        const entries = Array.from(bySpreadsheet.entries());
        const markResults = await Promise.allSettled(
          entries.map(async ([spreadsheetId, orders]) => {
            const url = `${appsScriptUrl}?id=${spreadsheetId}&action=markOrders`;
            const response = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orders }),
              redirect: 'follow' as any,
              signal: AbortSignal.timeout(60000), // 60s timeout for writes
            });
            if (!response.ok) {
              totalFailed += orders.length;
              for (const o of orders) {
                allDetails.push({ tab: o.tab, row: o.row, phone: o.phone, status: 'failed', reason: `HTTP ${response.status}` });
              }
              return;
            }
            const data = await response.json() as { marked: number; failed: number; details: Array<{ tab: string; row: number; phone: string; status: string; reason?: string }> };
            totalMarked += data.marked;
            totalFailed += data.failed;
            allDetails.push(...data.details);
          })
        );

        // Log collection to database
        try {
          await logCollection({
            collectedBy: user.username,
            country: input.country || 'algeria',
            orders: input.orders.map(o => {
              const detail = allDetails.find(d => d.tab === o.tab && d.row === o.row && d.phone === o.phone);
              return {
                agentId: o.agentId || 0,
                agentName: o.agentName || 'Unknown',
                spreadsheetId: o.spreadsheetId,
                tab: o.tab,
                rowNumber: o.row,
                phone: o.phone,
                customerName: o.customerName,
                product: o.product,
                qty: o.qty,
                price: o.price,
                address: o.address,
                success: detail?.status === 'marked',
                errorMessage: detail?.reason,
              };
            }),
          });
        } catch (e) {
          console.error('[Collection] Failed to log collection history:', e);
        }

        // Enrich details with customer/agent info from input orders
        const enrichedDetails = allDetails.map(d => {
          const inputOrder = input.orders.find(o => o.tab === d.tab && o.row === d.row && o.phone === d.phone);
          return {
            ...d,
            customerName: inputOrder?.customerName || '',
            agentName: inputOrder?.agentName || '',
            product: inputOrder?.product || '',
            address: inputOrder?.address || '',
          };
        });

        return {
          marked: totalMarked,
          failed: totalFailed,
          total: input.orders.length,
          details: enrichedDetails,
          markedBy: user.username,
        };
      }),

    untreatedCounts: publicProcedure
      .input(z.object({
        agentIds: z.array(z.number()),
        // When a specific tab is provided (e.g. from AssignLeads), only check that tab
        sheetTabs: z.record(z.string(), z.string()).optional(),
      }))
      .query(async ({ input, ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) return {};

        const allSheets = await getAllAgentSheets();
        const results: Record<number, { total: number; untreated: number }> = {};

        // Check cache first — skip agents that were recently fetched
        const now = Date.now();
        const agentsToFetch: number[] = [];
        for (const agentId of input.agentIds) {
          const specificTab = input.sheetTabs?.[String(agentId)];
          const cacheKey = `${agentId}:${specificTab || 'all'}`;
          const cached = untreatedCache.get(cacheKey);
          if (cached && (now - cached.ts) < UNTREATED_CACHE_TTL) {
            results[agentId] = cached.data;
          } else {
            agentsToFetch.push(agentId);
          }
        }

        // Process uncached agents in small batches of 3 to avoid bursting API quota
        const BATCH_SIZE = 3;
        for (let i = 0; i < agentsToFetch.length; i += BATCH_SIZE) {
          const batch = agentsToFetch.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map(async (agentId) => {
              const agent = allSheets.find((s) => s.id === agentId);
              if (!agent) return;
              try {
                const spreadsheetId = extractSpreadsheetId(agent.sheetUrl);
                const specificTab = input.sheetTabs?.[String(agentId)];
                let counts: { total: number; untreated: number };
                if (specificTab) {
                  counts = await getUntreatedLeadCount(spreadsheetId, specificTab);
                } else {
                  const allCounts = await getUntreatedLeadCountAllTabs(spreadsheetId);
                  counts = { total: allCounts.total, untreated: allCounts.untreated };
                }
                results[agentId] = counts;
                // Store in cache
                const cacheKey = `${agentId}:${specificTab || 'all'}`;
                untreatedCache.set(cacheKey, { data: counts, ts: Date.now() });
              } catch {
                results[agentId] = { total: 0, untreated: 0 };
              }
            })
          );
          // Small delay between batches to spread out API calls
          if (i + BATCH_SIZE < agentsToFetch.length) {
            await new Promise((r) => setTimeout(r, 500));
          }
        }

        return results;
      }),
  }),

  // Cost Data for Decision Matrix (super_admin only)
  costData: router({
    fetch: publicProcedure
      .input(z.object({
        sheet: z.string().optional(),
        month: z.number().optional(),
        year: z.number().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        if (user.dashboardRole !== 'super_admin') throw new Error("Forbidden: Kill/Keep matrix requires super admin access");

        const apiBase = process.env.COST_CALCULATOR_API_URL;
        if (!apiBase) throw new Error('Cost Calculator API URL not configured');

        const params = new URLSearchParams();
        if (input?.sheet) params.set('sheet', input.sheet);
        if (input?.month) params.set('month', String(input.month));
        if (input?.year) params.set('year', String(input.year));

        const url = `${apiBase}/api/public/cost-data${params.toString() ? '?' + params.toString() : ''}`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Failed to fetch cost data from Calculator API: ${res.status} ${res.statusText}`);
        }
        const body = await res.json();
        return body;
      }),
  }),

  // Assignment History
  history: router({
    list: publicProcedure
      .input(z.object({
        country: z.string().optional(),
        limit: z.number().min(1).max(100).optional(),
        offset: z.number().min(0).optional(),
        search: z.string().optional(),
        date: z.string().optional(), // YYYY-MM-DD
        timezoneOffset: z.number().optional(), // minutes from UTC
      }).optional())
      .query(async ({ ctx, input }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) return { records: [], total: 0 };
        return getAssignmentHistoryList({
          country: input?.country,
          limit: input?.limit || 50,
          offset: input?.offset || 0,
          search: input?.search,
          date: input?.date,
          timezoneOffset: input?.timezoneOffset,
        });
      }),

    detail: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) return { history: null, items: [] };
        return getAssignmentHistoryDetail(input.id);
      }),

    dailyStats: publicProcedure
      .input(z.object({ timezoneOffset: z.number().optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).optional())
      .query(async ({ ctx, input }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) return { assignments: [], exports: [], totals: { totalAssigned: 0, totalExported: 0, totalOperations: 0 } };
        return getDailyStats(input?.timezoneOffset, input?.date);
      }),

    /** Fetch details for multiple history records (used by daily summary drill-down) */
    batchDetail: publicProcedure
      .input(z.object({ ids: z.array(z.number()).min(1).max(50) }))
      .query(async ({ ctx, input }) => {
        const results = await Promise.all(input.ids.map(id => getAssignmentHistoryDetail(id)));
        // Merge all items from all records, tagging each with its parent history info
        const allItems: Array<{
          historyId: number;
          sheetTab: string;
          assignedBy: string;
          createdAt: Date;
          agentName: string;
          leadCount: number;
          success: number;
          errorMessage: string | null;
          leadsJson: string | null;
        }> = [];
        for (const r of results) {
          if (!r.history) continue;
          for (const item of r.items) {
            allItems.push({
              historyId: r.history.id,
              sheetTab: r.history.sheetTab,
              assignedBy: r.history.assignedBy,
              createdAt: r.history.createdAt,
              agentName: item.agentName,
              leadCount: item.leadCount,
              success: item.success,
              errorMessage: item.errorMessage,
              leadsJson: item.leadsJson,
            });
          }
        }
        return { items: allItems };
      }),

    logExport: publicProcedure
      .input(z.object({
        partner: z.enum(['sellmax', 'ecomamanager', 'colivraison', 'ecotrack_dhd']),
        country: z.string(),
        totalLeads: z.number(),
        duplicatesRemoved: z.number(),
        upsellCount: z.number(),
        sampleLeads: z.array(z.any()).optional(),
        workDate: z.string().optional(), // YYYY-MM-DD business work date
      }))
      .mutation(async ({ ctx, input }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error('Not authenticated');
        const historyId = await logExport({
          exportedBy: user.username,
          partner: input.partner,
          country: input.country,
          totalLeads: input.totalLeads,
          duplicatesRemoved: input.duplicatesRemoved,
          upsellCount: input.upsellCount,
          sampleLeads: input.sampleLeads,
          workDate: input.workDate || undefined,
        });
        return { success: true, historyId };
      }),

    validateEntry: publicProcedure
      .input(z.object({
        historyId: z.number(),
        validationStatus: z.enum(['validated', 'rejected']),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error('Not authenticated');
        const success = await updateHistoryValidation(
          input.historyId,
          input.validationStatus,
          user.username,
        );
        return { success };
      }),

    deleteEntries: publicProcedure
      .input(z.object({
        historyIds: z.array(z.number()).min(1).max(100),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error('Not authenticated');
        if (user.dashboardRole !== 'super_admin') throw new Error('Forbidden: Only Super Admin can delete history entries');
        const result = await deleteHistoryEntries(input.historyIds);
        return result;
      }),
  }),

  // Agent Activity Tracker — uses Google Drive Activity API
  activity: router({
    /** Fetch activity data for all connected sheets (per-sheet people ID resolution) */
    fetch: publicProcedure
      .input(z.object({
        country: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error('Not authenticated');

        // Server-side cache: avoid re-fetching from Google APIs on rapid refreshes
        const cacheKey = `activity_${input?.country || 'all'}`;
        const cached = activityCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < ACTIVITY_CACHE_TTL_MS) {
          console.log(`[Activity] Serving from cache (${Math.round((Date.now() - cached.timestamp) / 1000)}s old)`);
          return cached.data;
        }

        // Get all connected sheets
        const allSheets = await getAllAgentSheets(input?.country);
        if (allSheets.length === 0) return { agents: [], unmapped: [] };

        // Build maps for sheet info
        const spreadsheetEntries: Array<{ fileId: string; name: string; country: string; agentEmail?: string | null }> = [];
        const agentEmailToSheetName = new Map<string, string>();
        const seenFileIds = new Set<string>();

        for (const sheet of allSheets) {
          try {
            const id = extractSpreadsheetIdDrive(sheet.sheetUrl);
            if (!seenFileIds.has(id)) {
              seenFileIds.add(id);
              spreadsheetEntries.push({
                fileId: id,
                name: sheet.name || 'Unknown',
                country: sheet.country || 'unknown',
                agentEmail: sheet.agentEmail,
              });
            }
            if (sheet.agentEmail) {
              agentEmailToSheetName.set(sheet.agentEmail.toLowerCase(), sheet.name || 'Unknown');
            }
          } catch {
            // Skip invalid URLs
          }
        }

        // Build whitelist of designated agent emails (lowercase)
        const designatedEmails = new Set<string>();
        for (const sheet of allSheets) {
          if (sheet.agentEmail) {
            designatedEmails.add(sheet.agentEmail.toLowerCase());
          }
        }

        // ---- NEW: Per-sheet activity resolution ----
        // For each sheet, fetch activities + revisions and resolve people IDs to emails
        // using ONLY that sheet's data. This avoids cross-contamination from people ID collisions.
        const allResolvedActivities: ResolvedActivityEvent[] = [];
        const BATCH_SIZE = 5;

        for (let i = 0; i < spreadsheetEntries.length; i += BATCH_SIZE) {
          const batch = spreadsheetEntries.slice(i, i + BATCH_SIZE);
          const batchResults = await Promise.allSettled(
            batch.map(async (entry) => {
              try {
                const { resolvedActivities } = await fetchAndResolveSheetActivity(
                  entry.fileId,
                  entry.agentEmail, // helps map the most active unmapped ID to the designated agent
                  200,
                );
                return resolvedActivities;
              } catch (err: any) {
                console.error(`[Activity] Failed to fetch/resolve for ${entry.name}:`, err.message);
                return [] as ResolvedActivityEvent[];
              }
            })
          );

          for (const r of batchResults) {
            if (r.status === 'fulfilled') {
              allResolvedActivities.push(...r.value);
            }
          }

          if (i + BATCH_SIZE < spreadsheetEntries.length) {
            await new Promise((r) => setTimeout(r, 100));
          }
        }

        console.log(`[Activity] Resolved ${allResolvedActivities.length} activities across ${spreadsheetEntries.length} sheets`);

        // Filter: if designated emails exist, only include matching agents
        const hasDesignatedEmails = designatedEmails.size > 0;
        const filteredActivities = hasDesignatedEmails
          ? allResolvedActivities.filter((a) => designatedEmails.has(a.email))
          : allResolvedActivities;

        // Build email → display name map (prefer sheet name over email)
        const emailToDisplayName = new Map<string, string>();
        for (const [email, sheetName] of Array.from(agentEmailToSheetName.entries())) {
          emailToDisplayName.set(email, sheetName);
        }

        // Analyze: group by email × date
        const agents = analyzeAllResolvedActivities(filteredActivities, emailToDisplayName);

        const result = { agents, unmapped: [] as string[] };

        // Store in cache
        activityCache.set(cacheKey, { data: result, timestamp: Date.now() });
        console.log(`[Activity] Cached result for ${cacheKey} (${agents.length} agent entries)`);

        return result;
      }),

    /** Get all known people ID → email mappings */
    mappings: publicProcedure
      .query(async ({ ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error('Not authenticated');
        return getAllPeopleIdMappings();
      }),

    /** Manually map a people ID to an email */
    mapPerson: publicProcedure
      .input(z.object({
        peopleId: z.string(),
        email: z.string(),
        displayName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error('Not authenticated');
        await bulkUpsertPeopleIdMappings([{
          peopleId: input.peopleId,
          email: input.email,
          displayName: input.displayName,
        }]);
        return { success: true };
      }),

    /**
     * Lightweight agent status endpoint — optimized.
     * Returns last edit timestamp per designated agent using per-sheet people ID resolution.
     * 
     * Optimizations:
     * - 60s server-side cache (shared across all browser tabs)
     * - Batch size 10 with 50ms delays (was 5 / 200ms)
     * - Per-sheet error backoff: failing sheets skipped for 5 min after 3 consecutive failures
     * - Returns `error: true` for failed/backed-off sheets so frontend can show "Unknown" vs "Offline"
     */
    agentStatus: publicProcedure
      .input(z.object({
        country: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error('Not authenticated');

        // Check cache first
        const cacheKey = `status_${input?.country || 'all'}`;
        const cached = statusCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < STATUS_CACHE_TTL_MS) {
          return cached.data;
        }

        const allSheets = await getAllAgentSheets(input?.country);
        if (allSheets.length === 0) return { statuses: [] };

        // Build map: spreadsheetId → { agentEmail, sheetName }
        const sheetMap = new Map<string, { agentEmail: string; sheetName: string }>();
        for (const sheet of allSheets) {
          if (!sheet.agentEmail) continue;
          try {
            const id = extractSpreadsheetIdDrive(sheet.sheetUrl);
            sheetMap.set(id, {
              agentEmail: sheet.agentEmail.toLowerCase(),
              sheetName: sheet.name || 'Unknown',
            });
          } catch { /* skip invalid URLs */ }
        }

        // Fetch recent activity for each spreadsheet with per-sheet resolution
        const statuses: Array<{ sheetName: string; agentEmail: string; lastEditTimestamp: string | null; error?: boolean }> = [];
        const entries = Array.from(sheetMap.entries());
        const BATCH_SIZE = 10; // Increased from 5

        const startTime = Date.now();

        for (let i = 0; i < entries.length; i += BATCH_SIZE) {
          const batch = entries.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(
            batch.map(async ([fileId, info]) => {
              // Skip sheets in error backoff
              if (shouldSkipSheet(fileId)) {
                return {
                  sheetName: info.sheetName,
                  agentEmail: info.agentEmail,
                  lastEditTimestamp: null as string | null,
                  error: true,
                };
              }

              try {
                // Fetch activities and revisions for this specific sheet
                const [activities, revisions] = await Promise.all([
                  fetchDriveActivity(fileId, 20), // Small page for quick status
                  fetchRevisions(fileId),
                ]);

                // Build per-sheet mapping
                const perSheetMap = buildPerSheetPeopleIdMap(activities, revisions);

                // Find the designated agent's latest edit using per-sheet resolved email
                let latestTimestamp: string | null = null;
                for (const a of activities) {
                  if (a.actionType !== 'edit') continue;
                  const mapping = perSheetMap.get(a.actorPeopleId);
                  if (mapping && mapping.email.toLowerCase() === info.agentEmail) {
                    if (!latestTimestamp || new Date(a.timestamp) > new Date(latestTimestamp)) {
                      latestTimestamp = a.timestamp;
                    }
                  }
                }

                recordSheetSuccess(fileId);
                return {
                  sheetName: info.sheetName,
                  agentEmail: info.agentEmail,
                  lastEditTimestamp: latestTimestamp,
                  error: false,
                };
              } catch (err: any) {
                console.error(`[AgentStatus] Error for ${info.sheetName}:`, err.message);
                recordSheetError(fileId);
                return {
                  sheetName: info.sheetName,
                  agentEmail: info.agentEmail,
                  lastEditTimestamp: null as string | null,
                  error: true,
                };
              }
            })
          );

          for (const r of results) {
            if (r.status === 'fulfilled') {
              statuses.push(r.value);
            }
          }

          if (i + BATCH_SIZE < entries.length) {
            await new Promise((r) => setTimeout(r, 50)); // Reduced from 200ms
          }
        }

        const elapsed = Date.now() - startTime;
        console.log(`[AgentStatus] Fetched ${statuses.length} statuses in ${elapsed}ms (${entries.length} sheets, batch=${BATCH_SIZE})`);

        const result = { statuses };
        statusCache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
      }),
  }),

  // ─── Delivery Tracking ─────────────────────────────────────────────
  delivery: router({
    // Upload and parse delivery Excel file (EcoTrack 48H or Colivraison)
    upload: publicProcedure
      .input(z.object({
        /** Base64-encoded file content */
        fileBase64: z.string(),
        filename: z.string(),
        partner: z.string().default("48h"),
      }))
      .mutation(async ({ input, ctx }) => {
        const dashUser = getDashboardUser(ctx.req);
        if (!dashUser) throw new Error("Authentication required");

        // Decode base64 file
        const buffer = Buffer.from(input.fileBase64, "base64");

        // Parse the Excel file based on partner
        let parsedOrders: Array<{
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
        }>;
        let errors: string[];

        if (input.partner === "colivraison") {
          const result = parseColivraisonExcel(buffer);
          parsedOrders = result.orders;
          errors = result.errors;
        } else {
          const result = parseEcoTrackExcel(buffer);
          parsedOrders = result.orders;
          errors = result.errors;
        }

        if (parsedOrders.length === 0) {
          return {
            success: false,
            message: errors.length > 0 ? errors[0] : "No orders found in the file",
            errors,
            stats: { total: 0, inserted: 0, updated: 0, skipped: 0 },
          };
        }

        // Get agent code → agent ID mapping (used for 48h EcoTrack)
        const agentCodeMapRaw = await getAgentCodeMap();
        const agentCodeToId = new Map<string, number>();
        Array.from(agentCodeMapRaw.entries()).forEach(([code, info]) => {
          agentCodeToId.set(code, info.id);
        });

        // Generate batch ID
        const batchId = `${input.partner}_${Date.now()}`;

        // Convert parsed orders to DB format
        const dbOrders = parsedOrders.map(o => ({
          tracking: o.tracking,
          partner: input.partner,
          reference: o.reference,
          clientName: o.clientName,
          phone: o.phone,
          phone2: o.phone2,
          wilaya: o.wilaya,
          commune: o.commune,
          address: o.address,
          product: o.product,
          remarque: o.remarque,
          amount: o.amount,
          status: o.status,
          statusRaw: o.statusRaw,
          agentCode: o.agentCode,
          agentId: o.agentCode ? (agentCodeToId.get(o.agentCode.toLowerCase()) || null) : null,
          mediazCode: o.mediazCode || null,
          shippedAt: o.shippedAt,
          uploadBatchId: batchId,
        }));

        // Delete existing orders for this partner only, then insert fresh
        const deletedCount = await deleteAllDeliveryOrders(input.partner);
        const stats = await bulkInsertDeliveryOrders(dbOrders, agentCodeToId);

        // Log the upload
        await logDeliveryUpload({
          batchId,
          partner: input.partner,
          filename: input.filename,
          totalRows: parsedOrders.length,
          newOrders: stats.inserted,
          updatedOrders: 0,
          uploadedBy: dashUser.username,
        });

        return {
          success: true,
          message: `Replaced ${deletedCount} old ${input.partner} orders with ${stats.inserted} new orders from file`,
          errors,
          stats: { total: parsedOrders.length, inserted: stats.inserted, updated: 0, skipped: stats.skipped },
        };
      }),

    // Get delivery performance stats
    stats: publicProcedure
      .input(z.object({
        partner: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }).optional())
      .query(async ({ input, ctx }) => {
        const dashUser = getDashboardUser(ctx.req);
        if (!dashUser) throw new Error("Authentication required");

        const partner = input?.partner;
        const dateFrom = input?.dateFrom ? new Date(input.dateFrom) : undefined;
        const dateTo = input?.dateTo ? new Date(input.dateTo) : undefined;
        const { orders } = await getDeliveryStats(partner, dateFrom, dateTo);

        // Get agent code → name mapping
        const agentCodeMapRaw = await getAgentCodeMap();

        // Build per-agent stats
        const agentStats = new Map<string, {
          agentCode: string;
          agentName: string;
          total: number;
          delivered: number;
          returned: number;
          inTransit: number;
          statusBreakdown: Record<string, number>;
          partnerBreakdown: Record<string, { total: number; delivered: number; returned: number; inTransit: number }>;
        }>();

        // Also track MEDIAZ stats
        const mediazStats = new Map<string, {
          code: string;
          total: number;
          delivered: number;
          returned: number;
          inTransit: number;
        }>();

        // Overall status breakdown
        const overallStatusBreakdown: Record<string, number> = {};
        let totalDelivered = 0, totalReturned = 0, totalInTransit = 0;

        // Per-wilaya stats
        const wilayaStats = new Map<string, { total: number; delivered: number; returned: number }>();

        for (const order of orders) {
          const outcome = classifyStatus(order.status);
          overallStatusBreakdown[order.status] = (overallStatusBreakdown[order.status] || 0) + 1;

          if (outcome === "delivered") totalDelivered++;
          else if (outcome === "returned") totalReturned++;
          else totalInTransit++;

          // Agent stats — group by agent code (extracted from client name) for both partners
          // Orders without agent code are grouped as "coliv_team" for Colivraison or "unknown" for EcoTrack
          let code: string;
          if (order.agentCode) {
            code = order.agentCode;
          } else if (order.mediazCode) {
            code = "mediaz";
          } else {
            code = order.partner === "colivraison" ? "coliv_team" : "unknown";
          }
          if (!agentStats.has(code)) {
            const agentInfo = agentCodeMapRaw.get(code.toLowerCase());
            agentStats.set(code, {
              agentCode: code,
              agentName: code === "coliv_team" ? "Colivraison Team" : (code === "mediaz" ? "MEDIAZ" : (agentInfo?.name || code.toUpperCase())),
              total: 0,
              delivered: 0,
              returned: 0,
              inTransit: 0,
              statusBreakdown: {},
              partnerBreakdown: {},
            });
          }
          const agent = agentStats.get(code)!;
          agent.total++;
          if (outcome === "delivered") agent.delivered++;
          else if (outcome === "returned") agent.returned++;
          else agent.inTransit++;
          agent.statusBreakdown[order.status] = (agent.statusBreakdown[order.status] || 0) + 1;

          // Per-partner breakdown within each agent
          const partnerKey = order.partner || "unknown";
          if (!agent.partnerBreakdown[partnerKey]) {
            agent.partnerBreakdown[partnerKey] = { total: 0, delivered: 0, returned: 0, inTransit: 0 };
          }
          const pb = agent.partnerBreakdown[partnerKey];
          pb.total++;
          if (outcome === "delivered") pb.delivered++;
          else if (outcome === "returned") pb.returned++;
          else pb.inTransit++;

          // MEDIAZ stats
          if (order.mediazCode) {
            if (!mediazStats.has(order.mediazCode)) {
              mediazStats.set(order.mediazCode, { code: order.mediazCode, total: 0, delivered: 0, returned: 0, inTransit: 0 });
            }
            const mz = mediazStats.get(order.mediazCode)!;
            mz.total++;
            if (outcome === "delivered") mz.delivered++;
            else if (outcome === "returned") mz.returned++;
            else mz.inTransit++;
          }

          // Wilaya stats
          const wilaya = order.wilaya || "Unknown";
          if (!wilayaStats.has(wilaya)) {
            wilayaStats.set(wilaya, { total: 0, delivered: 0, returned: 0 });
          }
          const ws = wilayaStats.get(wilaya)!;
          ws.total++;
          if (outcome === "delivered") ws.delivered++;
          else if (outcome === "returned") ws.returned++;
        }

        return {
          totalOrders: orders.length,
          totalDelivered,
          totalReturned,
          totalInTransit,
          deliveryRate: orders.length > 0 ? (totalDelivered / orders.length) * 100 : 0,

          overallStatusBreakdown,
          agents: Array.from(agentStats.values()).sort((a, b) => b.total - a.total),
          mediaz: Array.from(mediazStats.values()).sort((a, b) => b.total - a.total),
          wilayas: Array.from(wilayaStats.entries())
            .map(([name, s]) => ({ name, ...s }))
            .sort((a, b) => b.total - a.total),
          statusLabels: STATUS_LABELS,
          statusColors: STATUS_COLORS,
        };
      }),

    // Get upload history
    uploads: publicProcedure.query(async ({ ctx }) => {
      const dashUser = getDashboardUser(ctx.req);
      if (!dashUser) throw new Error("Authentication required");
      return getDeliveryUploads();
    }),

    // Get delivery rates per agent code (for main dashboard integration)
    // No auth required — delivery stats are not sensitive and must load for all users
    agentRates: publicProcedure
      .input(z.object({
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        const dateFrom = input?.dateFrom ? new Date(input.dateFrom) : undefined;
        const dateTo = input?.dateTo ? new Date(input.dateTo) : undefined;

        return await getAgentDeliveryRates(dateFrom, dateTo);
      }),
  }),

  // Collection History
  collectionHistory: router({
    list: publicProcedure
      .input(z.object({
        country: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }).optional())
      .query(async ({ input, ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        return getCollectionHistoryList({
          country: input?.country,
          limit: input?.limit,
          offset: input?.offset,
        });
      }),

    detail: publicProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input, ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        return getCollectionBatchDetail(input.batchId);
      }),
  }),

  // ─── Lead Inbox (Pages) ─────────────────────────────────────────
  inbox: router({
    /** Page managers submit raw text batch — no parsing, stored as-is */
    submit: publicProcedure
      .input(z.object({
        rawText: z.string().min(1, "Paste some leads first"),
        country: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        if (user.dashboardRole !== 'page_manager' && user.dashboardRole !== 'super_admin') {
          throw new Error("Only page managers can submit leads");
        }
        return submitBatchToInbox(input.rawText, input.country, user.username);
      }),

    /** Get inbox summary (pending batch counts by country) */
    summary: publicProcedure
      .query(async ({ ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        return getInboxSummary();
      }),

    /** Get pending batches (for Hadjer to load raw text into assignment textarea) */
    pending: publicProcedure
      .input(z.object({ country: z.string().optional() }))
      .query(async ({ input, ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        return getPendingBatches(input.country);
      }),

    /** Get pending lead count (total lines across all pending batches, for badge) */
    pendingCount: publicProcedure
      .input(z.object({ country: z.string().optional() }))
      .query(async ({ input, ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        return getPendingLeadCount(input.country);
      }),

    /** Mark batches as assigned */
    markAssigned: publicProcedure
      .input(z.object({
        batchIds: z.array(z.number()),
        assignmentHistoryId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        return markBatchesAsAssigned(input.batchIds, input.assignmentHistoryId);
      }),

    /** Page manager's own submission history */
    mySubmissions: publicProcedure
      .query(async ({ ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        return getPageManagerSubmissions(user.username);
      }),
  }),

  // ============ SALARY MANAGEMENT ============
  salary: router({
    /** Get all page manager users (admin only) */
    getPageManagers: publicProcedure.query(async ({ ctx }) => {
      const user = getDashboardUser(ctx.req);
      if (!user) throw new Error("Unauthorized");
      if (user.dashboardRole !== 'super_admin') throw new Error("Forbidden");
      return getPageManagerUsers();
    }),

    /** Get salary records for a specific month (admin: all employees, employee: own only) */
    getMonthRecords: publicProcedure
      .input(z.object({ year: z.number(), month: z.number().min(1).max(12) }))
      .query(async ({ input, ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        if (user.dashboardRole === 'super_admin') {
          return getSalaryRecordsForMonth(input.year, input.month);
        }
        // Page managers can only see their own
        if (user.dashboardRole === 'page_manager') {
          const record = await getSalaryRecord(user.id, input.year, input.month);
          return record ? [record] : [];
        }
        throw new Error("Forbidden");
      }),

    /** Get salary history for a specific user (admin: any user, employee: own only) */
    getHistory: publicProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input, ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        if (user.dashboardRole === 'super_admin') {
          return getSalaryHistory(input.userId);
        }
        if (user.dashboardRole === 'page_manager' && user.id === input.userId) {
          return getSalaryHistory(input.userId);
        }
        throw new Error("Forbidden");
      }),

    /** Get own salary history (for page managers) */
    myHistory: publicProcedure.query(async ({ ctx }) => {
      const user = getDashboardUser(ctx.req);
      if (!user) throw new Error("Unauthorized");
      if (user.dashboardRole !== 'page_manager') throw new Error("Forbidden");
      return getSalaryHistory(user.id);
    }),

    /** Upsert salary record (admin only) */
    upsert: publicProcedure
      .input(z.object({
        userId: z.number(),
        username: z.string(),
        year: z.number(),
        month: z.number().min(1).max(12),
        fixedSalary: z.number().min(0),
        deliveredAlgeria: z.number().min(0),
        deliveredLibya: z.number().min(0),
        deliveredViconis: z.number().min(0),
        deliveredTunisia: z.number().min(0),
        commissionPerOrder: z.number().min(0),
        goodVideos: z.number().min(0),
        avgVideos: z.number().min(0),
        absenceDays: z.number().min(0),
        bonus: z.number().min(0),
        deduction: z.number().min(0),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        if (user.dashboardRole !== 'super_admin') throw new Error("Forbidden");
        return upsertSalaryRecord({ ...input, updatedBy: user.username });
      }),
  }),

  // ─── User Activity Tracking ─────────────────────────────────────
  userActivity: router({
    /** Get all dashboard users with their online/away/offline status */
    list: publicProcedure.query(async ({ ctx }) => {
      const user = getDashboardUser(ctx.req);
      if (!user) throw new Error("Unauthorized");
      return getAllDashboardUsersActivity();
    }),
  }),

  // ─── Lead Archive (Permanent Lead Storage) ─────────────────────────
  leadArchive: router({
    /** Query historical leads with filters and pagination */
    query: publicProcedure
      .input(z.object({
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        market: z.string().optional(),
        agentId: z.number().optional(),
        agentName: z.string().optional(),
        product: z.string().optional(),
        sku: z.string().optional(),
        status: z.string().optional(),
        page: z.number().optional(),
        pageSize: z.number().min(10).max(500).optional(),
      }))
      .query(async ({ input, ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        return queryAssignedLeads(input);
      }),

    /** Get summary stats for the lead archive */
    stats: publicProcedure
      .input(z.object({
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        market: z.string().optional(),
      }))
      .query(async ({ input, ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        return getLeadArchiveStats(input);
      }),

    /** Trigger smart status sync — reads statuses from Google Sheets and updates DB */
    syncStatuses: publicProcedure
      .mutation(async ({ ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        // Only super_admin can trigger sync
        if (user.dashboardRole !== 'super_admin') throw new Error("Only admins can trigger sync");
        const result = await runStatusSync();
        return result;
      }),

  }),

  // ─── DHD Delivery Suivi ──────────────────────────────────────────────
  suivi: router({
    /**
     * Get DHD API config (labels, wilaya map, target statuses).
     * Token is no longer exposed — fetching goes through server proxy.
     */
    getApiConfig: publicProcedure
      .query(async ({ ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        return {
          statusLabels: DHD_STATUS_LABELS,
          wilayaMap: WILAYA_MAP,
          suiviTargetStatuses: Array.from(SUIVI_TARGET_STATUSES),
        };
      }),

    /**
     * Server-side proxy: fetch a BATCH of DHD pages in parallel.
     * Fetches up to 10 pages at once for ~10x speed improvement.
     * Excludes all 'livré' statuses — delivered orders are not agent concern.
     */
    fetchBatch: publicProcedure
      .input(z.object({
        startPage: z.number().int().min(1),
        batchSize: z.number().int().min(1).max(10).default(10),
      }))
      .query(async ({ ctx, input }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");

        const { startPage, batchSize } = input;

        // Fetch all pages in parallel
        const pageNumbers = Array.from({ length: batchSize }, (_, i) => startPage + i);
        const results = await Promise.allSettled(
          pageNumbers.map(p => fetchOrdersPage(p))
        );

        type ProblemOrder = {
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
          latestReason: { remarque: string; commentaires: string; station: string; livreur: string; created_at: string; tracking: string } | null;
          status_reason: Array<{ remarque: string; commentaires: string; station: string; livreur: string; created_at: string; tracking: string }>;
          products: string;
        };

        const allProblemOrders: ProblemOrder[] = [];
        let scannedOrders = 0;
        let enLivraison = 0;
        let enPreparation = 0;
        let suspendu = 0;
        let problemCount = 0;
        let noAnswerCount = 0;
        let postponedCount = 0;
        let cancelledCount = 0;
        let lastPage = 1;
        let total = 0;
        let pagesCompleted = 0;

        for (const res of results) {
          if (res.status === "rejected") continue;
          const result = res.value;
          lastPage = result.last_page;
          total = result.total;
          pagesCompleted++;

          for (const order of result.data) {
            scannedOrders++;
            // Skip all livré statuses — delivered orders are not agent concern
            if (order.status.startsWith("livr")) continue;

            if (order.status === "en_livraison") enLivraison++;
            if (order.status === "en_preparation") enPreparation++;
            if (order.status === "suspendu") suspendu++;

            const latestReason = order.status_reason?.[order.status_reason.length - 1] || null;
            const hasProblem = latestReason ? isProblemReason(latestReason.remarque) : false;
            const reasonCategory = latestReason ? classifyReason(latestReason.remarque) : null;
            const isSuiviTarget = SUIVI_TARGET_STATUSES.has(order.status);

            if (hasProblem && isSuiviTarget) {
              problemCount++;
              if (reasonCategory === "no_answer") noAnswerCount++;
              if (reasonCategory === "postponed") postponedCount++;
              if (reasonCategory === "cancelled") cancelledCount++;

              allProblemOrders.push({
                tracking: order.tracking,
                reference: order.reference,
                client: order.client,
                phone: order.phone,
                phone_2: order.phone_2,
                adresse: order.adresse,
                montant: order.montant,
                wilaya_id: order.wilaya_id,
                wilayaName: WILAYA_MAP[order.wilaya_id] || `Wilaya ${order.wilaya_id}`,
                status: order.status,
                statusLabel: DHD_STATUS_LABELS[order.status] || order.status,
                created_at: order.created_at,
                last_updated_at: order.last_updated_at,
                hasProblem,
                reasonCategory,
                isSuiviTarget,
                latestReason,
                status_reason: order.status_reason || [],
                products: order.products,
              });
            }
          }
        }

        return {
          problemOrders: allProblemOrders,
          stats: {
            scannedOrders,
            enLivraison,
            enPreparation,
            suspendu,
            problemCount,
            noAnswerCount,
            postponedCount,
            cancelledCount,
          },
          pagination: {
            lastPage,
            total,
            pagesCompleted,
            startPage,
            endPage: startPage + batchSize - 1,
          },
        };
      }),

    /** Log a suivi call */
    logCall: publicProcedure
      .input(z.object({
        tracking: z.string(),
        clientName: z.string().optional(),
        phone: z.string().optional(),
        orderStatus: z.string().optional(),
        problemReason: z.string().optional(),
        callResult: z.enum(["answered", "no_answer", "postponed", "cancelled", "wrong_number", "resolved"]),
        notes: z.string().optional(),
        wilayaId: z.number().optional(),
        amount: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");

        await insertSuiviCallLog({
          tracking: input.tracking,
          clientName: input.clientName || null,
          phone: input.phone || null,
          orderStatus: input.orderStatus || null,
          problemReason: input.problemReason || null,
          callResult: input.callResult,
          notes: input.notes || null,
          calledBy: user.username,
          wilayaId: input.wilayaId || null,
          amount: input.amount || null,
        });

        // Optionally add note to DHD tracking
        if (input.notes) {
          try {
            await addTrackingNote(input.tracking, `[Suivi: ${user.username}] ${input.callResult} — ${input.notes}`);
          } catch (e) {
            console.warn("[Suivi] Failed to add DHD tracking note:", e);
          }
        }

        return { success: true };
      }),

    /** Get call logs for a tracking number */
    getCallLogs: publicProcedure
      .input(z.object({ tracking: z.string() }))
      .query(async ({ ctx, input }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        return getSuiviCallLogsByTracking(input.tracking);
      }),

    /** Get today's call stats */
    getCallStats: publicProcedure
      .query(async ({ ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        return getSuiviCallStats(user.username);
      }),

    /** Get recent call logs */
    getRecentLogs: publicProcedure
      .input(z.object({ limit: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        return getRecentSuiviCallLogs(input?.limit || 50);
      }),

    // ─── Cached Data Endpoints (instant page load) ───────────────────

    /** Get all cached problem orders (instant — reads from DB, not DHD API) */
    getCachedOrders: publicProcedure
      .query(async ({ ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        const orders = await getAllCachedSuiviOrders();
        // Parse JSON fields back to objects for frontend
        return orders.map(o => ({
          ...o,
          latestReason: o.latestReasonJson ? JSON.parse(o.latestReasonJson) : null,
          status_reason: o.statusReasonJson ? JSON.parse(o.statusReasonJson) : [],
        }));
      }),

    /** Get cached order stats */
    getCachedStats: publicProcedure
      .query(async ({ ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        return getCachedSuiviStats();
      }),

    /** Get sync status (when was last sync, is one running now?) */
    getSyncStatus: publicProcedure
      .query(async ({ ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        const lastSync = await getLatestSuiviSync();
        return {
          isRunning: isSuiviSyncRunning(),
          lastSync: lastSync ? {
            id: lastSync.id,
            status: lastSync.status,
            pagesScanned: lastSync.pagesScanned,
            ordersScanned: lastSync.ordersScanned,
            problemsFound: lastSync.problemsFound,
            ordersRemoved: lastSync.ordersRemoved,
            durationMs: lastSync.durationMs,
            triggeredBy: lastSync.triggeredBy,
            createdAt: lastSync.createdAt,
            errorMessage: lastSync.errorMessage,
          } : null,
        };
      }),

    /** Trigger a manual sync (force refresh) */
    triggerSync: publicProcedure
      .mutation(async ({ ctx }) => {
        const user = getDashboardUser(ctx.req);
        if (!user) throw new Error("Unauthorized");
        if (isSuiviSyncRunning()) {
          return { started: false, message: "Sync already in progress" };
        }
        // Run sync in background (don't await — return immediately)
        runSuiviSync(user.username).catch(err => {
          console.error("[Suivi] Manual sync failed:", err);
        });
        return { started: true, message: "Sync started in background" };
      }),

  }),
});

export type AppRouter = typeof appRouter;
