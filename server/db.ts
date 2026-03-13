import { eq, desc, and, like, sql, gte, lte, lt, isNotNull, isNull, inArray, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, agentSheets, type InsertAgentSheet, type AgentSheet, dashboardUsers, assignmentHistory, assignmentHistoryItems, type InsertAssignmentHistory, type InsertAssignmentHistoryItem, type AssignmentHistory, type AssignmentHistoryItem, peopleIdMap, type PeopleIdMapEntry, type InsertPeopleIdMapEntry, deliveryOrders, type InsertDeliveryOrder, type DeliveryOrder, deliveryUploads, type InsertDeliveryUpload, type DeliveryUpload, collectionBatches, collectionOrders, type CollectionBatch, type InsertCollectionBatch, type CollectionOrder, type InsertCollectionOrder, leadInboxBatches, type LeadInboxBatch, type InsertLeadInboxBatch, salaryRecords, type SalaryRecord, type InsertSalaryRecord, assignedLeads, type AssignedLead, type InsertAssignedLead, suiviCallLogs, type SuiviCallLog, type InsertSuiviCallLog, suiviCachedOrders, type SuiviCachedOrder, type InsertSuiviCachedOrder, suiviSyncLog, type SuiviSyncLog, type InsertSuiviSyncLog } from "../drizzle/schema";
import bcrypt from 'bcryptjs';
import { getAlgeriaDateStr } from '../shared/const';
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ---- Agent Sheets CRUD ----

export async function getAllAgentSheets(country?: string): Promise<AgentSheet[]> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get agent sheets: database not available");
    return [];
  }
  if (country) {
    return db.select().from(agentSheets).where(eq(agentSheets.country, country));
  }
  return db.select().from(agentSheets);
}

export async function addAgentSheet(data: InsertAgentSheet): Promise<AgentSheet | null> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot add agent sheet: database not available");
    return null;
  }
  const result = await db.insert(agentSheets).values(data);
  const insertId = result[0].insertId;
  const rows = await db.select().from(agentSheets).where(eq(agentSheets.id, insertId)).limit(1);
  return rows[0] || null;
}

export async function deleteAgentSheet(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot delete agent sheet: database not available");
    return false;
  }
  await db.delete(agentSheets).where(eq(agentSheets.id, id));
  return true;
}

export async function updateAgentSheet(id: number, data: Partial<InsertAgentSheet>): Promise<AgentSheet | null> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update agent sheet: database not available");
    return null;
  }
  await db.update(agentSheets).set(data).where(eq(agentSheets.id, id));
  const rows = await db.select().from(agentSheets).where(eq(agentSheets.id, id)).limit(1);
  return rows[0] || null;
}

// ---- Dashboard Auth ----

export async function seedDefaultUser(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(dashboardUsers).where(eq(dashboardUsers.username, 'admin')).limit(1);
  const hash = await bcrypt.hash('willmy05', 10);
  if (existing.length === 0) {
    await db.insert(dashboardUsers).values({ username: 'admin', passwordHash: hash, dashboardRole: 'super_admin' });
    console.log('[Auth] Default admin user created (super_admin)');
  } else {
    // Always reset admin password and ensure super_admin role on startup
    await db.update(dashboardUsers).set({ passwordHash: hash, dashboardRole: 'super_admin' }).where(eq(dashboardUsers.username, 'admin'));
    console.log('[Auth] Admin password and role synced');
  }
}

export async function verifyDashboardUser(username: string, password: string): Promise<{ id: number; username: string; dashboardRole: string } | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(dashboardUsers).where(eq(dashboardUsers.username, username)).limit(1);
  if (rows.length === 0) return null;
  const user = rows[0];
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;
  return { id: user.id, username: user.username, dashboardRole: user.dashboardRole };
}

/** Look up a dashboard user's role by id */
export async function getDashboardUserRole(userId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ dashboardRole: dashboardUsers.dashboardRole }).from(dashboardUsers).where(eq(dashboardUsers.id, userId)).limit(1);
  if (rows.length === 0) return null;
  return rows[0].dashboardRole;
}

// ---- Assignment History ----

export interface LogAssignmentInput {
  assignedBy: string;
  country: string;
  sheetTab: string;
  totalLeads: number;
  totalAssigned: number;
  totalFailed: number;
  status: 'success' | 'partial' | 'failed';
  /** Business work date (YYYY-MM-DD) — the day agents will work these leads */
  workDate?: string;
  items: {
    agentId: number;
    agentName: string;
    leadCount: number;
    success: boolean;
    errorMessage?: string;
    leads: any[]; // The actual lead objects for traceability
  }[];
}

export async function logAssignment(input: LogAssignmentInput): Promise<number | null> {
  const db = await getDb();
  if (!db) {
    console.warn('[Database] Cannot log assignment: database not available');
    return null;
  }
  try {
    // Insert the main history record
    const result = await db.insert(assignmentHistory).values({
      assignedBy: input.assignedBy,
      country: input.country,
      sheetTab: input.sheetTab,
      totalLeads: input.totalLeads,
      totalAssigned: input.totalAssigned,
      totalFailed: input.totalFailed,
      status: input.status,
      workDate: input.workDate || getAlgeriaDateStr(),
    });
    const historyId = result[0].insertId;

    // Insert per-agent items
    if (input.items.length > 0) {
      await db.insert(assignmentHistoryItems).values(
        input.items.map(item => ({
          historyId,
          agentId: item.agentId,
          agentName: item.agentName,
          leadCount: item.leadCount,
          success: item.success ? 1 : 0,
          errorMessage: item.errorMessage || null,
          leadsJson: JSON.stringify(item.leads),
        }))
      );
    }

    return historyId;
  } catch (error) {
    console.error('[Database] Failed to log assignment:', error);
    return null;
  }
}

// ---- Upload History ----

export interface LogExportInput {
  exportedBy: string;
  partner: string; // 'sellmax' or 'ecomamanager'
  country: string; // 'tunisia' or 'algeria'
  totalLeads: number;
  duplicatesRemoved: number;
  upsellCount: number;
  /** Sample of first 5 leads for traceability */
  sampleLeads?: any[];
  /** Business work date (YYYY-MM-DD) — the day agents will work these leads */
  workDate?: string;
}

export async function logExport(input: LogExportInput): Promise<number | null> {
  const db = await getDb();
  if (!db) {
    console.warn('[Database] Cannot log upload: database not available');
    return null;
  }
  try {
    const metadata = JSON.stringify({
      partner: input.partner,
      duplicatesRemoved: input.duplicatesRemoved,
      upsellCount: input.upsellCount,
      sampleLeads: input.sampleLeads || [],
    });

    const result = await db.insert(assignmentHistory).values({
      assignedBy: input.exportedBy,
      country: input.country,
      sheetTab: input.partner, // reuse sheetTab for partner name
      totalLeads: input.totalLeads,
      totalAssigned: input.totalLeads, // all uploaded = "assigned"
      totalFailed: 0,
      status: 'success',
      eventType: 'export',
      metadata,
      validationStatus: 'pending', // uploads start as pending until manually validated
      workDate: input.workDate || getAlgeriaDateStr(),
    });
    return result[0].insertId;
  } catch (error) {
    console.error('[Database] Failed to log upload:', error);
    return null;
  }
}

export async function getAssignmentHistoryList(filters?: {
  country?: string;
  limit?: number;
  offset?: number;
  search?: string;
  date?: string; // YYYY-MM-DD
  timezoneOffset?: number; // minutes from UTC
}): Promise<{ records: AssignmentHistory[]; total: number }> {
  const db = await getDb();
  if (!db) return { records: [], total: 0 };

  const conditions = [];
  if (filters?.country) {
    conditions.push(eq(assignmentHistory.country, filters.country));
  }
  if (filters?.search) {
    conditions.push(
      sql`(${assignmentHistory.assignedBy} LIKE ${`%${filters.search}%`} OR ${assignmentHistory.sheetTab} LIKE ${`%${filters.search}%`})`
    );
  }
  if (filters?.date) {
    // Filter primarily by workDate (exact string match YYYY-MM-DD).
    // All records should have workDate set; fallback to createdAt range only for safety.
    conditions.push(
      sql`${assignmentHistory.workDate} = ${filters.date}`
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [records, countResult] = await Promise.all([
    db.select()
      .from(assignmentHistory)
      .where(whereClause)
      .orderBy(desc(assignmentHistory.createdAt))
      .limit(filters?.limit || 50)
      .offset(filters?.offset || 0),
    db.select({ count: sql<number>`COUNT(*)` })
      .from(assignmentHistory)
      .where(whereClause),
  ]);

  return { records, total: Number(countResult[0]?.count || 0) };
}

export interface DailyStats {
  assignments: { country: string; totalLeads: number; count: number; recordIds: number[] }[];
  exports: { partner: string; country: string; totalLeads: number; count: number }[];
  totals: { totalAssigned: number; totalExported: number; totalOperations: number };
}

export async function getDailyStats(timezoneOffset?: number, dateStr?: string): Promise<DailyStats> {
  const db = await getDb();
  const empty: DailyStats = {
    assignments: [],
    exports: [],
    totals: { totalAssigned: 0, totalExported: 0, totalOperations: 0 },
  };
  if (!db) return empty;

  try {
    // Determine the target date string (YYYY-MM-DD)
    let targetDateStr: string;
    if (dateStr) {
      targetDateStr = dateStr;
    } else {
      // Calculate today's date in the user's timezone
      const offsetMs = (timezoneOffset ?? 0) * 60_000;
      const now = new Date();
      const userNow = new Date(now.getTime() - offsetMs);
      targetDateStr = `${userNow.getUTCFullYear()}-${String(userNow.getUTCMonth() + 1).padStart(2, '0')}-${String(userNow.getUTCDate()).padStart(2, '0')}`;
    }

    // Filter by workDate — all records should have workDate set
    const todayRecords = await db
      .select()
      .from(assignmentHistory)
      .where(
        sql`${assignmentHistory.workDate} = ${targetDateStr}`
      )
      .orderBy(desc(assignmentHistory.createdAt));

    // Separate assignments and exports
    const assignmentRecords = todayRecords.filter(r => (r.eventType || 'assignment') === 'assignment');
    const exportRecords = todayRecords.filter(r => r.eventType === 'export');

    // Aggregate assignments by country
    const assignmentsByCountry = new Map<string, { totalLeads: number; count: number; recordIds: number[] }>();
    for (const rec of assignmentRecords) {
      const existing = assignmentsByCountry.get(rec.country) || { totalLeads: 0, count: 0, recordIds: [] };
      existing.totalLeads += rec.totalLeads;
      existing.count += 1;
      existing.recordIds.push(rec.id);
      assignmentsByCountry.set(rec.country, existing);
    }

    // Aggregate exports by partner — exclude rejected exports from totals
    const activeExportRecords = exportRecords.filter(r => r.validationStatus !== 'rejected');
    const exportsByPartner = new Map<string, { country: string; totalLeads: number; count: number }>();
    for (const rec of activeExportRecords) {
      const partner = rec.sheetTab; // partner name stored in sheetTab
      let metadata: any = null;
      try { metadata = rec.metadata ? JSON.parse(rec.metadata) : null; } catch {}
      const partnerKey = metadata?.partner || partner;
      const existing = exportsByPartner.get(partnerKey) || { country: rec.country, totalLeads: 0, count: 0 };
      existing.totalLeads += rec.totalLeads;
      existing.count += 1;
      exportsByPartner.set(partnerKey, existing);
    }

    const assignments = Array.from(assignmentsByCountry.entries()).map(([country, data]) => ({
      country,
      totalLeads: data.totalLeads,
      count: data.count,
      recordIds: data.recordIds,
    }));

    const exports = Array.from(exportsByPartner.entries()).map(([partner, data]) => ({
      partner,
      country: data.country,
      totalLeads: data.totalLeads,
      count: data.count,
    }));

    const totalAssigned = assignments.reduce((s, a) => s + a.totalLeads, 0);
    const totalExported = exports.reduce((s, e) => s + e.totalLeads, 0);

    return {
      assignments,
      exports,
      totals: {
        totalAssigned,
        totalExported,
        totalOperations: assignmentRecords.length + activeExportRecords.length,
      },
    };
  } catch (error) {
    console.error('[Database] Failed to get daily stats:', error);
    return empty;
  }
}

export async function getAssignmentHistoryDetail(historyId: number): Promise<{
  history: AssignmentHistory | null;
  items: AssignmentHistoryItem[];
}> {
  const db = await getDb();
  if (!db) return { history: null, items: [] };

  const [historyRows, items] = await Promise.all([
    db.select().from(assignmentHistory).where(eq(assignmentHistory.id, historyId)).limit(1),
    db.select().from(assignmentHistoryItems).where(eq(assignmentHistoryItems.historyId, historyId)),
  ]);

  return {
    history: historyRows[0] || null,
    items,
  };
}

// ---- People ID Map ----

export async function getAllPeopleIdMappings(): Promise<PeopleIdMapEntry[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(peopleIdMap);
}

export async function upsertPeopleIdMapping(data: {
  peopleId: string;
  email: string;
  displayName?: string;
  sourceSpreadsheetId?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  // Check if mapping already exists
  const existing = await db.select().from(peopleIdMap).where(eq(peopleIdMap.peopleId, data.peopleId)).limit(1);
  
  if (existing.length > 0) {
    // Update if email or display name changed
    await db.update(peopleIdMap)
      .set({
        email: data.email,
        displayName: data.displayName || existing[0].displayName,
        sourceSpreadsheetId: data.sourceSpreadsheetId || existing[0].sourceSpreadsheetId,
      })
      .where(eq(peopleIdMap.peopleId, data.peopleId));
  } else {
    await db.insert(peopleIdMap).values({
      peopleId: data.peopleId,
      email: data.email,
      displayName: data.displayName || null,
      sourceSpreadsheetId: data.sourceSpreadsheetId || null,
    });
  }
}

export async function bulkUpsertPeopleIdMappings(mappings: Array<{
  peopleId: string;
  email: string;
  displayName?: string;
  sourceSpreadsheetId?: string;
}>): Promise<void> {
  for (const mapping of mappings) {
    await upsertPeopleIdMapping(mapping);
  }
}

// ---- Delivery Orders ----

export async function upsertDeliveryOrder(order: InsertDeliveryOrder): Promise<"inserted" | "updated" | "skipped"> {
  const db = await getDb();
  if (!db) return "skipped";

  const existing = await db.select({ id: deliveryOrders.id, status: deliveryOrders.status })
    .from(deliveryOrders)
    .where(eq(deliveryOrders.tracking, order.tracking))
    .limit(1);

  if (existing.length > 0) {
    // Update existing order (status may have changed)
    await db.update(deliveryOrders)
      .set({
        status: order.status,
        statusRaw: order.statusRaw,
        remarque: order.remarque,
        agentCode: order.agentCode,
        agentId: order.agentId,
        mediazCode: order.mediazCode,
        uploadBatchId: order.uploadBatchId,
      })
      .where(eq(deliveryOrders.id, existing[0].id));
    return "updated";
  } else {
    await db.insert(deliveryOrders).values(order);
    return "inserted";
  }
}

export async function deleteAllDeliveryOrders(partner?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  if (partner) {
    const result = await db.delete(deliveryOrders).where(eq(deliveryOrders.partner, partner));
    return (result as any)[0]?.affectedRows ?? 0;
  }
  const result = await db.delete(deliveryOrders);
  return (result as any)[0]?.affectedRows ?? 0;
}

export async function bulkInsertDeliveryOrders(
  orders: InsertDeliveryOrder[],
  agentCodeMap: Map<string, number>
): Promise<{ inserted: number; skipped: number }> {
  const db = await getDb();
  if (!db) return { inserted: 0, skipped: orders.length };

  // Resolve agentIds
  for (const order of orders) {
    if (order.agentCode && !order.agentId) {
      order.agentId = agentCodeMap.get(order.agentCode.toLowerCase()) || null;
    }
  }

  // Batch insert in chunks of 200
  const BATCH_SIZE = 200;
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < orders.length; i += BATCH_SIZE) {
    const batch = orders.slice(i, i + BATCH_SIZE);
    try {
      await db.insert(deliveryOrders).values(batch);
      inserted += batch.length;
    } catch (err: any) {
      console.error(`[Delivery] Batch insert error at offset ${i}:`, err.message);
      skipped += batch.length;
    }
  }

  return { inserted, skipped };
}

export async function logDeliveryUpload(upload: InsertDeliveryUpload): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(deliveryUploads).values(upload);
}

export async function getDeliveryStats(partner?: string, dateFrom?: Date, dateTo?: Date): Promise<{
  orders: DeliveryOrder[];
  totalOrders: number;
}> {
  const db = await getDb();
  if (!db) return { orders: [], totalOrders: 0 };

  const conditions: any[] = [];
  if (partner) conditions.push(eq(deliveryOrders.partner, partner));
  if (dateFrom) conditions.push(gte(deliveryOrders.shippedAt, dateFrom));
  if (dateTo) {
    // dateTo should be end of day
    const endOfDay = new Date(dateTo);
    endOfDay.setHours(23, 59, 59, 999);
    conditions.push(lte(deliveryOrders.shippedAt, endOfDay));
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const orders = await db.select()
    .from(deliveryOrders)
    .where(whereClause)
    .orderBy(desc(deliveryOrders.shippedAt));

  return { orders, totalOrders: orders.length };
}

export async function getDeliveryUploads(): Promise<DeliveryUpload[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select()
    .from(deliveryUploads)
    .orderBy(desc(deliveryUploads.createdAt))
    .limit(20);
}

/**
 * Get delivery rates per agent sheet name for the main dashboard.
 * Matches delivery order agentCodes to agent_sheets via flexible prefix matching.
 * Returns a map of agentSheetName → { total, delivered, returned, inTransit, deliveryRate }
 */
export async function getAgentDeliveryRates(dateFrom?: Date, dateTo?: Date): Promise<Record<string, { total: number; delivered: number; returned: number; inTransit: number; deliveryRate: number }>> {
  const db = await getDb();
  const result: Record<string, { total: number; delivered: number; returned: number; inTransit: number; deliveryRate: number }> = {};
  if (!db) return result;

  // 1. Get all Algeria agent_sheets with their codes
  const algeriaAgents = await db.select({
    id: agentSheets.id,
    name: agentSheets.name,
    agentCode: agentSheets.agentCode,
  }).from(agentSheets).where(eq(agentSheets.country, 'algeria'));

  // Build a map: deliveryCode → agentSheetName (flexible matching)
  // e.g., agent_sheets has SH8 → delivery has sh08, so we match by prefix
  const codeToName = new Map<string, string>();
  for (const agent of algeriaAgents) {
    if (agent.agentCode) {
      codeToName.set(agent.agentCode.toLowerCase(), agent.name);
    }
  }

  // 2. Get all delivery orders with agent codes
  const conditions: any[] = [isNotNull(deliveryOrders.agentCode)];
  if (dateFrom) conditions.push(gte(deliveryOrders.shippedAt, dateFrom));
  if (dateTo) {
    const endOfDay = new Date(dateTo);
    endOfDay.setHours(23, 59, 59, 999);
    conditions.push(lte(deliveryOrders.shippedAt, endOfDay));
  }

  const orders = await db.select({
    agentCode: deliveryOrders.agentCode,
    status: deliveryOrders.status,
  })
    .from(deliveryOrders)
    .where(and(...conditions));

  // 3. Match delivery codes to agent names
  // Strict matching: exact match first, then normalized number match (sh08 → sh8)
  // Never match codes with different numbers (w01 ≠ w09)
  const resolveAgentName = (deliveryCode: string): string | null => {
    const lc = deliveryCode.toLowerCase();
    // Exact match
    if (codeToName.has(lc)) return codeToName.get(lc)!;
    // Normalize: strip leading zeros from numeric suffix (sh08 → sh8, yr06 → yr6)
    const normalize = (code: string): string => {
      const match = code.match(/^([a-z]+)(0*)(\d+)$/);
      if (match) return match[1] + match[3]; // letters + number without leading zeros
      return code;
    };
    const normalizedDelivery = normalize(lc);
    for (const [agentCode, name] of Array.from(codeToName)) {
      if (normalize(agentCode) === normalizedDelivery) return name;
    }
    // Only match prefix if delivery code has NO numeric suffix and agent code has one
    // e.g., delivery code "sh" matches agent "sh8" (agent code is the only one starting with "sh")
    const deliveryLetters = lc.replace(/[0-9]+$/, '');
    const deliveryNumbers = lc.replace(/^[a-z]+/, '');
    if (!deliveryNumbers) {
      // Delivery code is letters-only — find unique prefix match
      const matches = Array.from(codeToName).filter(([ac]) => ac.startsWith(deliveryLetters));
      if (matches.length === 1) return matches[0][1];
    }
    return null;
  };

  // 4. Group by resolved agent name
  const grouped = new Map<string, { total: number; delivered: number; returned: number; inTransit: number }>();
  for (const order of orders) {
    const code = (order.agentCode || '').toLowerCase();
    if (!code) continue;
    const agentName = resolveAgentName(code);
    if (!agentName) continue; // Skip codes that don't match any Algeria agent
    let entry = grouped.get(agentName);
    if (!entry) {
      entry = { total: 0, delivered: 0, returned: 0, inTransit: 0 };
      grouped.set(agentName, entry);
    }
    entry.total++;
    const s = order.status;
    if (s === 'livre_paye' || s === 'livre_non_paye') entry.delivered++;
    else if (s === 'retour_recu' || s === 'retour_non_recu' || s === 'non_recu') entry.returned++;
    else entry.inTransit++;
  }

  for (const [name, stats] of Array.from(grouped)) {
    result[name] = {
      ...stats,
      deliveryRate: stats.total > 0 ? (stats.delivered / stats.total) * 100 : 0,
    };
  }
  return result;
}

export async function getAgentCodeMap(): Promise<Map<string, { id: number; name: string; country: string | null }>> {
  const db = await getDb();
  const map = new Map<string, { id: number; name: string; country: string | null }>();
  if (!db) return map;

  const agents = await db.select({
    id: agentSheets.id,
    name: agentSheets.name,
    agentCode: agentSheets.agentCode,
    country: agentSheets.country,
  }).from(agentSheets);

  for (const agent of agents) {
    if (agent.agentCode) {
      map.set(agent.agentCode.toLowerCase(), {
        id: agent.id,
        name: agent.name,
        country: agent.country,
      });
    }
  }
  return map;
}

// ---- Collection History ----

export interface LogCollectionInput {
  collectedBy: string;
  country: string;
  orders: {
    agentId: number;
    agentName: string;
    spreadsheetId: string;
    tab: string;
    rowNumber: number;
    phone?: string;
    customerName?: string;
    product?: string;
    qty?: number;
    price?: string;
    address?: string;
    success: boolean;
    errorMessage?: string;
  }[];
}

/**
 * Insert rows in chunks with retry to prevent silent failures on large batches.
 * Returns the number of rows successfully inserted.
 */
export async function insertInChunks<T extends Record<string, unknown>>(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  table: Parameters<typeof db.insert>[0],
  rows: T[],
  chunkSize: number = 50,
): Promise<{ inserted: number; failed: number; errors: string[] }> {
  let inserted = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const chunkIndex = Math.floor(i / chunkSize) + 1;
    const totalChunks = Math.ceil(rows.length / chunkSize);

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await (db.insert(table) as any).values(chunk);
        inserted += chunk.length;
        break; // success, move to next chunk
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (attempt === 1) {
          console.warn(`[Database] Chunk ${chunkIndex}/${totalChunks} failed (attempt 1), retrying... Error: ${errMsg}`);
        } else {
          console.error(`[Database] Chunk ${chunkIndex}/${totalChunks} failed after retry. ${chunk.length} rows lost. Error: ${errMsg}`);
          failed += chunk.length;
          errors.push(`Chunk ${chunkIndex} (rows ${i + 1}-${i + chunk.length}): ${errMsg}`);
        }
      }
    }
  }

  return { inserted, failed, errors };
}

export async function logCollection(input: LogCollectionInput): Promise<number | null> {
  const db = await getDb();
  if (!db) {
    console.warn('[Database] Cannot log collection: database not available');
    return null;
  }
  try {
    const successCount = input.orders.filter(o => o.success).length;
    const failCount = input.orders.filter(o => !o.success).length;
    const agentNames = new Set(input.orders.map(o => o.agentName));
    const status = failCount === 0 ? 'success' : successCount === 0 ? 'failed' : 'partial';

    const result = await db.insert(collectionBatches).values({
      collectedBy: input.collectedBy,
      country: input.country,
      totalOrders: input.orders.length,
      agentCount: agentNames.size,
      status,
      successCount,
      failCount,
    });
    const batchId = result[0].insertId;

    if (input.orders.length > 0) {
      const orderRows = input.orders.map(o => ({
        batchId,
        agentId: o.agentId,
        agentName: o.agentName,
        spreadsheetId: o.spreadsheetId,
        tab: o.tab,
        rowNumber: o.rowNumber,
        phone: o.phone || null,
        customerName: o.customerName || null,
        product: o.product || null,
        qty: o.qty || null,
        price: o.price || null,
        address: o.address || null,
        success: o.success ? 1 : 0,
        errorMessage: o.errorMessage || null,
      }));

      const { inserted, failed: chunkFailed, errors } = await insertInChunks(db, collectionOrders, orderRows, 50);

      if (chunkFailed > 0) {
        console.error(`[Collection] Batch ${batchId}: ${inserted}/${input.orders.length} order details saved, ${chunkFailed} lost. Errors: ${errors.join(' | ')}`);
      } else {
        console.log(`[Collection] Batch ${batchId}: All ${inserted} order details saved successfully.`);
      }
    }

    return batchId;
  } catch (error) {
    console.error('[Database] Failed to log collection:', error);
    return null;
  }
}

export async function getCollectionHistoryList(filters?: {
  country?: string;
  limit?: number;
  offset?: number;
}): Promise<{ records: CollectionBatch[]; total: number }> {
  const db = await getDb();
  if (!db) return { records: [], total: 0 };

  const conditions = [];
  if (filters?.country) {
    conditions.push(eq(collectionBatches.country, filters.country));
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [records, countResult] = await Promise.all([
    db.select()
      .from(collectionBatches)
      .where(whereClause)
      .orderBy(desc(collectionBatches.createdAt))
      .limit(filters?.limit || 50)
      .offset(filters?.offset || 0),
    db.select({ count: sql<number>`COUNT(*)` })
      .from(collectionBatches)
      .where(whereClause),
  ]);

  return { records, total: Number(countResult[0].count) };
}

export async function getCollectionBatchDetail(batchId: number): Promise<{
  batch: CollectionBatch | null;
  orders: CollectionOrder[];
}> {
  const db = await getDb();
  if (!db) return { batch: null, orders: [] };

  const [batchRows, orderRows] = await Promise.all([
    db.select().from(collectionBatches).where(eq(collectionBatches.id, batchId)).limit(1),
    db.select().from(collectionOrders).where(eq(collectionOrders.batchId, batchId)),
  ]);

  return {
    batch: batchRows[0] || null,
    orders: orderRows,
  };
}


// ---- History Validation ----

export async function updateHistoryValidation(
  historyId: number,
  validationStatus: 'validated' | 'rejected',
  validatedBy: string,
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    await db.update(assignmentHistory)
      .set({
        validationStatus,
        validatedBy,
        validatedAt: new Date(),
      })
      .where(eq(assignmentHistory.id, historyId));
    return true;
  } catch (error) {
    console.error('[Database] Failed to update validation:', error);
    return false;
  }
}


// ---- History Delete (Admin-only) ----

export async function deleteHistoryEntries(
  historyIds: number[],
): Promise<{ deletedCount: number }> {
  const db = await getDb();
  if (!db) return { deletedCount: 0 };
  try {
    // First delete child items (assignment_history_items)
    await db.delete(assignmentHistoryItems)
      .where(inArray(assignmentHistoryItems.historyId, historyIds));
    // Then delete parent records
    const result = await db.delete(assignmentHistory)
      .where(inArray(assignmentHistory.id, historyIds));
    return { deletedCount: (result as any)[0]?.affectedRows ?? historyIds.length };
  } catch (error) {
    console.error('[Database] Failed to delete history entries:', error);
    return { deletedCount: 0 };
  }
}


// ─── Lead Inbox Helpers ─────────────────────────────────────────────

/**
 * Submit a raw text batch to the inbox (used by page managers like Rima/Soumia).
 * Stores the raw pasted text exactly as-is — no parsing, no transformation.
 */
export async function submitBatchToInbox(
  rawText: string,
  country: string,
  submittedBy: string
): Promise<{ batchId: number; lineCount: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const lineCount = rawText.trim().split("\n").filter((l) => l.trim()).length;

  const result = await db.insert(leadInboxBatches).values({
    rawText: rawText.trim(),
    country,
    lineCount,
    submittedBy,
    status: "pending",
  });

  const batchId = (result as any)[0]?.insertId ?? 0;
  return { batchId, lineCount };
}

/**
 * Get inbox summary: count of pending batches and total lines grouped by country.
 */
export async function getInboxSummary(): Promise<
  Array<{ country: string; batchCount: number; totalLines: number }>
> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select({
      country: leadInboxBatches.country,
      batchCount: sql<number>`COUNT(*)`.as("batchCount"),
      totalLines: sql<number>`SUM(lineCount)`.as("totalLines"),
    })
    .from(leadInboxBatches)
    .where(eq(leadInboxBatches.status, "pending"))
    .groupBy(leadInboxBatches.country);

  return result.map((r) => ({
    country: r.country,
    batchCount: Number(r.batchCount),
    totalLines: Number(r.totalLines),
  }));
}

/**
 * Get all pending batches, optionally filtered by country.
 * Returns raw text that can be pasted directly into Hadjer's textarea.
 */
export async function getPendingBatches(
  country?: string
): Promise<LeadInboxBatch[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(leadInboxBatches.status, "pending")];
  if (country) {
    conditions.push(eq(leadInboxBatches.country, country));
  }

  return db
    .select()
    .from(leadInboxBatches)
    .where(and(...conditions))
    .orderBy(leadInboxBatches.createdAt);
}

/**
 * Mark batches as assigned (after Hadjer uses them in an assignment).
 */
export async function markBatchesAsAssigned(
  batchIds: number[],
  assignmentHistoryId?: number
): Promise<{ updatedCount: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (batchIds.length === 0) return { updatedCount: 0 };

  const updateData: Record<string, unknown> = { status: "assigned", assignedAt: new Date() };
  if (assignmentHistoryId) {
    updateData.assignmentHistoryId = assignmentHistoryId;
  }

  const result = await db
    .update(leadInboxBatches)
    .set(updateData)
    .where(inArray(leadInboxBatches.id, batchIds));

  return { updatedCount: (result as any)[0]?.affectedRows ?? batchIds.length };
}

/**
 * Get all page manager submissions (for shared history view).
 * Returns all submissions so each page manager can see the full picture,
 * with submittedBy field to identify who submitted each batch.
 */
export async function getPageManagerSubmissions(
  _username: string,
  limit = 50
): Promise<LeadInboxBatch[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(leadInboxBatches)
    .orderBy(desc(leadInboxBatches.createdAt))
    .limit(limit);
}

/**
 * Get total pending line count across all pending batches (for badge display).
 */
export async function getPendingLeadCount(
  country?: string
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const conditions = [eq(leadInboxBatches.status, "pending")];
  if (country) {
    conditions.push(eq(leadInboxBatches.country, country));
  }

  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(lineCount), 0)`.as("total") })
    .from(leadInboxBatches)
    .where(and(...conditions));

  return Number(result[0]?.total ?? 0);
}

// ============ SALARY MANAGEMENT ============

/**
 * Get salary record for a specific user/month/year.
 * Returns null if no record exists yet.
 */
export async function getSalaryRecord(userId: number, year: number, month: number): Promise<SalaryRecord | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(salaryRecords).where(
    and(
      eq(salaryRecords.userId, userId),
      eq(salaryRecords.year, year),
      eq(salaryRecords.month, month),
    )
  );
  return rows[0] ?? null;
}

/**
 * Get all salary records for a specific user (all months).
 * Ordered by year desc, month desc.
 */
export async function getSalaryHistory(userId: number): Promise<SalaryRecord[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(salaryRecords)
    .where(eq(salaryRecords.userId, userId))
    .orderBy(desc(salaryRecords.year), desc(salaryRecords.month));
}

/**
 * Get all salary records for a specific month/year (both employees).
 */
export async function getSalaryRecordsForMonth(year: number, month: number): Promise<SalaryRecord[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(salaryRecords).where(
    and(
      eq(salaryRecords.year, year),
      eq(salaryRecords.month, month),
    )
  );
}

/**
 * Upsert (create or update) a salary record.
 * Uses userId + year + month as the logical key.
 */
export async function upsertSalaryRecord(data: {
  userId: number;
  username: string;
  year: number;
  month: number;
  fixedSalary: number;
  deliveredAlgeria: number;
  deliveredLibya: number;
  deliveredViconis: number;
  deliveredTunisia: number;
  commissionPerOrder: number;
  goodVideos: number;
  avgVideos: number;
  absenceDays: number;
  bonus: number;
  deduction: number;
  notes?: string;
  updatedBy: string;
}): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if record already exists
  const existing = await getSalaryRecord(data.userId, data.year, data.month);

  if (existing) {
    // Update
    await db.update(salaryRecords)
      .set({
        fixedSalary: data.fixedSalary,
        deliveredAlgeria: data.deliveredAlgeria,
        deliveredLibya: data.deliveredLibya,
        deliveredViconis: data.deliveredViconis,
        deliveredTunisia: data.deliveredTunisia,
        commissionPerOrder: data.commissionPerOrder,
        goodVideos: data.goodVideos,
        avgVideos: data.avgVideos,
        absenceDays: data.absenceDays,
        bonus: data.bonus,
        deduction: data.deduction,
        notes: data.notes ?? null,
        updatedBy: data.updatedBy,
      })
      .where(eq(salaryRecords.id, existing.id));
    return { id: existing.id };
  } else {
    // Insert
    const result = await db.insert(salaryRecords).values({
      userId: data.userId,
      username: data.username,
      year: data.year,
      month: data.month,
      fixedSalary: data.fixedSalary,
      deliveredAlgeria: data.deliveredAlgeria,
      deliveredLibya: data.deliveredLibya,
      deliveredViconis: data.deliveredViconis,
      deliveredTunisia: data.deliveredTunisia,
      commissionPerOrder: data.commissionPerOrder,
      goodVideos: data.goodVideos,
      avgVideos: data.avgVideos,
      absenceDays: data.absenceDays,
      bonus: data.bonus,
      deduction: data.deduction,
      notes: data.notes ?? null,
      updatedBy: data.updatedBy,
    });
    return { id: Number(result[0].insertId) };
  }
}

/**
 * Get all page manager users from dashboard_users.
 */
export async function getPageManagerUsers(): Promise<Array<{ id: number; username: string }>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({
    id: dashboardUsers.id,
    username: dashboardUsers.username,
  }).from(dashboardUsers).where(eq(dashboardUsers.dashboardRole, 'page_manager'));
  return rows;
}

// ─── Assigned Leads (Permanent Storage) ────────────────────────────────

export interface StoreLeadInput {
  historyId?: number | null;
  agentId: number;
  agentName: string;
  agentCode?: string;
  workDate: string; // YYYY-MM-DD
  market: string;
  sheetTab?: string;
  customerName?: string;
  phone?: string;
  wilaya?: string;
  product?: string;
  price?: string;
  sku?: string;
  address2?: string;
  orderType?: string;
  assignedBy: string;
}

/**
 * Store assigned leads in the database permanently.
 * Called during assign/splitAssign — fire-and-forget, doesn't block assignment.
 * Inserts in batches of 500 to avoid MySQL packet limits.
 */
export async function storeAssignedLeads(leads: StoreLeadInput[]): Promise<number> {
  if (leads.length === 0) return 0;
  const db = await getDb();
  if (!db) {
    console.warn('[Database] Cannot store assigned leads: database not available');
    return 0;
  }
  try {
    const BATCH_SIZE = 500;
    let totalInserted = 0;
    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
      const batch = leads.slice(i, i + BATCH_SIZE);
      await db.insert(assignedLeads).values(
        batch.map(lead => ({
          historyId: lead.historyId ?? null,
          agentId: lead.agentId,
          agentName: lead.agentName,
          agentCode: lead.agentCode || null,
          workDate: lead.workDate,
          market: lead.market,
          sheetTab: lead.sheetTab || null,
          customerName: lead.customerName || null,
          phone: lead.phone || null,
          wilaya: lead.wilaya || null,
          product: lead.product || null,
          price: typeof lead.price === 'number' ? String(lead.price) : (lead.price || null),
          sku: lead.sku || null,
          address2: lead.address2 || null,
          orderType: lead.orderType || null,
          assignedBy: lead.assignedBy,
        }))
      );
      totalInserted += batch.length;
    }
    console.log(`[LeadArchive] Stored ${totalInserted} leads permanently`);
    return totalInserted;
  } catch (error) {
    console.error('[LeadArchive] Failed to store leads:', error);
    return 0;
  }
}

export interface QueryLeadsInput {
  /** Filter by work date range (YYYY-MM-DD) */
  dateFrom?: string;
  dateTo?: string;
  /** Filter by market */
  market?: string;
  /** Filter by agent ID */
  agentId?: number;
  /** Filter by agent name (partial match) */
  agentName?: string;
  /** Filter by product (partial match) */
  product?: string;
  /** Filter by SKU */
  sku?: string;
  /** Filter by status (e.g. تأكيد, إلغاء, تأجيل, or 'pending' for null) */
  status?: string;
  /** Pagination */
  page?: number;
  pageSize?: number;
}

export interface QueryLeadsResult {
  leads: AssignedLead[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Query assigned leads from the permanent archive with filters and pagination.
 */
export async function queryAssignedLeads(input: QueryLeadsInput): Promise<QueryLeadsResult> {
  const db = await getDb();
  if (!db) return { leads: [], total: 0, page: 1, pageSize: 50, totalPages: 0 };

  const page = input.page || 1;
  const pageSize = Math.min(input.pageSize || 50, 500); // cap at 500
  const offset = (page - 1) * pageSize;

  // Build conditions
  const conditions: any[] = [];
  if (input.dateFrom) conditions.push(gte(assignedLeads.workDate, input.dateFrom));
  if (input.dateTo) conditions.push(lte(assignedLeads.workDate, input.dateTo));
  if (input.market) conditions.push(eq(assignedLeads.market, input.market));
  if (input.agentId) conditions.push(eq(assignedLeads.agentId, input.agentId));
  if (input.agentName) conditions.push(like(assignedLeads.agentName, `%${input.agentName}%`));
  if (input.product) conditions.push(like(assignedLeads.product, `%${input.product}%`));
  if (input.sku) conditions.push(like(assignedLeads.sku, `%${input.sku}%`));
  if (input.status) {
    if (input.status === 'pending') {
      conditions.push(isNull(assignedLeads.status));
    } else {
      conditions.push(eq(assignedLeads.status, input.status));
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [leads, countResult] = await Promise.all([
    db.select()
      .from(assignedLeads)
      .where(whereClause)
      .orderBy(desc(assignedLeads.workDate), desc(assignedLeads.id))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` })
      .from(assignedLeads)
      .where(whereClause),
  ]);

  const total = Number(countResult[0]?.count || 0);

  return {
    leads,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Get summary stats for assigned leads — grouped by date and market.
 */
export async function getLeadArchiveStats(input: { dateFrom?: string; dateTo?: string; market?: string }) {
  const db = await getDb();
  if (!db) return { dailyStats: [], totalLeads: 0, marketBreakdown: [], agentBreakdown: [] };

  const conditions: any[] = [];
  if (input.dateFrom) conditions.push(gte(assignedLeads.workDate, input.dateFrom));
  if (input.dateTo) conditions.push(lte(assignedLeads.workDate, input.dateTo));
  if (input.market) conditions.push(eq(assignedLeads.market, input.market));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [dailyStats, marketBreakdown, agentBreakdown, totalResult] = await Promise.all([
    // Daily lead counts
    db.select({
      workDate: assignedLeads.workDate,
      count: sql<number>`count(*)`,
    })
      .from(assignedLeads)
      .where(whereClause)
      .groupBy(assignedLeads.workDate)
      .orderBy(desc(assignedLeads.workDate))
      .limit(90), // last 90 days max

    // Market breakdown
    db.select({
      market: assignedLeads.market,
      count: sql<number>`count(*)`,
    })
      .from(assignedLeads)
      .where(whereClause)
      .groupBy(assignedLeads.market),

    // Agent breakdown (top 50)
    db.select({
      agentId: assignedLeads.agentId,
      agentName: assignedLeads.agentName,
      count: sql<number>`count(*)`,
    })
      .from(assignedLeads)
      .where(whereClause)
      .groupBy(assignedLeads.agentId, assignedLeads.agentName)
      .orderBy(desc(sql`count(*)`))
      .limit(50),

    // Total
    db.select({ count: sql<number>`count(*)` })
      .from(assignedLeads)
      .where(whereClause),
  ]);

  return {
    dailyStats: dailyStats.map(r => ({ date: r.workDate, count: Number(r.count) })),
    totalLeads: Number(totalResult[0]?.count || 0),
    marketBreakdown: marketBreakdown.map(r => ({ market: r.market, count: Number(r.count) })),
    agentBreakdown: agentBreakdown.map(r => ({ agentId: r.agentId, agentName: r.agentName, count: Number(r.count) })),
  };
}

// ── Status Sync: Smart sync of lead statuses from Google Sheets ──

/** Final statuses that don't need re-syncing */
const FINAL_STATUSES = ['تأكيد', 'إلغاء'];

/**
 * Get leads that need status sync — grouped by agentId + sheetTab.
 * Only returns leads with no status or non-final status.
 * This tells us exactly which sheets+tabs to read (no wasted API calls).
 */
export async function getLeadsNeedingSync(): Promise<{
  groups: Array<{
    agentId: number;
    agentName: string;
    sheetTab: string;
    leads: Array<{ id: number; phone: string | null; customerName: string | null }>;
  }>;
  totalPending: number;
}> {
  const db = await getDb();
  if (!db) return { groups: [], totalPending: 0 };

  // Get leads that have no status OR have a non-final status
  // Only get leads that have a phone (needed for matching)
  const pendingLeads = await db
    .select({
      id: assignedLeads.id,
      agentId: assignedLeads.agentId,
      agentName: assignedLeads.agentName,
      sheetTab: assignedLeads.sheetTab,
      phone: assignedLeads.phone,
      customerName: assignedLeads.customerName,
    })
    .from(assignedLeads)
    .where(
      and(
        isNotNull(assignedLeads.phone),
        isNotNull(assignedLeads.sheetTab),
        or(
          isNull(assignedLeads.status),
          and(
            isNotNull(assignedLeads.status),
            // Non-final statuses: تأجيل, اتصل 1-6, قيد الانتظار, رقم مغلق, etc.
            sql`${assignedLeads.status} NOT IN ('تأكيد', 'إلغاء')`
          )
        )
      )
    )
    .orderBy(assignedLeads.agentId, assignedLeads.sheetTab);

  // Group by agentId + sheetTab
  const groupMap = new Map<string, {
    agentId: number;
    agentName: string;
    sheetTab: string;
    leads: Array<{ id: number; phone: string | null; customerName: string | null }>;
  }>();

  for (const lead of pendingLeads) {
    const key = `${lead.agentId}::${lead.sheetTab}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        agentId: lead.agentId,
        agentName: lead.agentName,
        sheetTab: lead.sheetTab!,
        leads: [],
      });
    }
    groupMap.get(key)!.leads.push({
      id: lead.id,
      phone: lead.phone,
      customerName: lead.customerName,
    });
  }

  return {
    groups: Array.from(groupMap.values()),
    totalPending: pendingLeads.length,
  };
}

/**
 * Batch update lead statuses in the database.
 * Called after reading sheet data and matching rows.
 */
export async function updateLeadStatuses(updates: Array<{
  id: number;
  status: string | null;
  quantity: number | null;
  delivery: string | null;
  callNotes: string | null;
  sheetRow: number | null;
}>): Promise<number> {
  if (updates.length === 0) return 0;
  const db = await getDb();
  if (!db) return 0;

  let updated = 0;
  // Batch updates in chunks of 50 for speed (parallel within each chunk)
  const CHUNK_SIZE = 50;
  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE);
    const results = await Promise.allSettled(
      chunk.map(u =>
        db.update(assignedLeads)
          .set({
            status: u.status,
            quantity: u.quantity,
            delivery: u.delivery,
            callNotes: u.callNotes,
            sheetRow: u.sheetRow,
            syncedAt: new Date(),
          })
          .where(eq(assignedLeads.id, u.id))
      )
    );
    for (const r of results) {
      if (r.status === 'fulfilled') updated++;
      else console.error(`[StatusSync] Batch update error:`, r.reason);
    }
  }
  return updated;
}

// ─── User Activity Tracking ─────────────────────────────────────
/**
 * Touch lastActiveAt for a dashboard user (called on every authenticated API request).
 * Uses an in-memory throttle to avoid hammering the DB — only writes once per 30 seconds per user.
 */
const lastTouchMap = new Map<number, number>(); // userId → last write timestamp
const TOUCH_THROTTLE_MS = 30_000; // 30 seconds

export async function touchUserActivity(userId: number): Promise<void> {
  const now = Date.now();
  const lastTouch = lastTouchMap.get(userId) || 0;
  if (now - lastTouch < TOUCH_THROTTLE_MS) return; // skip — recently touched
  lastTouchMap.set(userId, now);
  try {
    const db = await getDb();
    if (!db) return;
    await db
      .update(dashboardUsers)
      .set({ lastActiveAt: new Date() })
      .where(eq(dashboardUsers.id, userId));
  } catch (error) {
    console.error(`[Activity] Failed to touch user ${userId}:`, error);
  }
}

/**
 * Get all dashboard users with their activity status.
 * Online = active in last 5 min, Away = 5-30 min, Offline = 30+ min or never.
 */
export async function getAllDashboardUsersActivity(): Promise<Array<{
  id: number;
  username: string;
  dashboardRole: string;
  lastActiveAt: Date | null;
  status: 'online' | 'away' | 'offline';
}>> {
  const db = await getDb();
  if (!db) return [];
  const allUsers = await db
    .select({
      id: dashboardUsers.id,
      username: dashboardUsers.username,
      dashboardRole: dashboardUsers.dashboardRole,
      lastActiveAt: dashboardUsers.lastActiveAt,
    })
    .from(dashboardUsers)
    .orderBy(dashboardUsers.username);

  const now = Date.now();
  return allUsers.map((u: any) => {
    let status: 'online' | 'away' | 'offline' = 'offline';
    if (u.lastActiveAt) {
      const diff = now - u.lastActiveAt.getTime();
      if (diff < 5 * 60 * 1000) status = 'online';       // < 5 min
      else if (diff < 30 * 60 * 1000) status = 'away';    // 5-30 min
    }
    return { ...u, status };
  });
}

// ─── Suivi Call Logs ────────────────────────────────────────────────────

/** Insert a suivi call log entry */
export async function insertSuiviCallLog(log: InsertSuiviCallLog): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(suiviCallLogs).values(log);
}

/** Get call logs for a specific tracking number */
export async function getSuiviCallLogsByTracking(tracking: string): Promise<SuiviCallLog[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(suiviCallLogs).where(eq(suiviCallLogs.tracking, tracking)).orderBy(desc(suiviCallLogs.createdAt));
}

/** Get recent call logs (last N entries) */
export async function getRecentSuiviCallLogs(limit: number = 50): Promise<SuiviCallLog[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(suiviCallLogs).orderBy(desc(suiviCallLogs.createdAt)).limit(limit);
}

/** Get call log stats for today */
export async function getSuiviCallStats(calledBy?: string): Promise<{
  totalCalls: number;
  answered: number;
  noAnswer: number;
  postponed: number;
  cancelled: number;
  resolved: number;
}> {
  const db = await getDb();
  if (!db) return { totalCalls: 0, answered: 0, noAnswer: 0, postponed: 0, cancelled: 0, resolved: 0 };

  // Get today's date in Algeria timezone
  const today = getAlgeriaDateStr();
  const todayStart = new Date(today + "T00:00:00+01:00");

  const conditions = [gte(suiviCallLogs.createdAt, todayStart)];
  if (calledBy) conditions.push(eq(suiviCallLogs.calledBy, calledBy));

  const logs = await db.select().from(suiviCallLogs).where(and(...conditions));

  return {
    totalCalls: logs.length,
    answered: logs.filter(l => l.callResult === "answered").length,
    noAnswer: logs.filter(l => l.callResult === "no_answer").length,
    postponed: logs.filter(l => l.callResult === "postponed").length,
    cancelled: logs.filter(l => l.callResult === "cancelled").length,
    resolved: logs.filter(l => l.callResult === "resolved").length,
  };
}

// ─── Suivi Cache DB Helpers ─────────────────────────────────────────────

/** Get all cached suivi problem orders */
export async function getAllCachedSuiviOrders(): Promise<SuiviCachedOrder[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(suiviCachedOrders).orderBy(desc(suiviCachedOrders.updatedAt));
}

/** Upsert a batch of cached suivi orders (insert or update on tracking conflict) */
export async function upsertCachedSuiviOrders(orders: InsertSuiviCachedOrder[]): Promise<number> {
  if (orders.length === 0) return 0;
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let upserted = 0;
  // Process in chunks of 50 to avoid query size limits
  const CHUNK_SIZE = 50;
  for (let i = 0; i < orders.length; i += CHUNK_SIZE) {
    const chunk = orders.slice(i, i + CHUNK_SIZE);
    await db.insert(suiviCachedOrders).values(chunk).onDuplicateKeyUpdate({
      set: {
        client: sql`VALUES(client)`,
        phone: sql`VALUES(phone)`,
        phone2: sql`VALUES(phone2)`,
        adresse: sql`VALUES(adresse)`,
        reference: sql`VALUES(\`reference\`)`,
        montant: sql`VALUES(montant)`,
        wilayaId: sql`VALUES(wilayaId)`,
        wilayaName: sql`VALUES(wilayaName)`,
        status: sql`VALUES(status)`,
        statusLabel: sql`VALUES(statusLabel)`,
        reasonCategory: sql`VALUES(reasonCategory)`,
        latestReasonText: sql`VALUES(latestReasonText)`,
        latestReasonJson: sql`VALUES(latestReasonJson)`,
        statusReasonJson: sql`VALUES(statusReasonJson)`,
        products: sql`VALUES(products)`,
        orderCreatedAt: sql`VALUES(orderCreatedAt)`,
        lastUpdatedAt: sql`VALUES(lastUpdatedAt)`,
      },
    });
    upserted += chunk.length;
  }
  return upserted;
}

/** Remove cached orders whose tracking is NOT in the given set (stale orders that are no longer problems) */
export async function removeStaleCache(activeTrackings: Set<string>): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // Get all current cached trackings
  const cached = await db.select({ tracking: suiviCachedOrders.tracking }).from(suiviCachedOrders);
  const toRemove = cached.filter(c => !activeTrackings.has(c.tracking)).map(c => c.tracking);

  if (toRemove.length === 0) return 0;

  // Delete in chunks
  const CHUNK_SIZE = 100;
  let removed = 0;
  for (let i = 0; i < toRemove.length; i += CHUNK_SIZE) {
    const chunk = toRemove.slice(i, i + CHUNK_SIZE);
    await db.delete(suiviCachedOrders).where(inArray(suiviCachedOrders.tracking, chunk));
    removed += chunk.length;
  }
  return removed;
}

/** Clear all cached suivi orders */
export async function clearSuiviCache(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(suiviCachedOrders);
}

/** Insert a sync log entry */
export async function insertSuiviSyncLog(log: InsertSuiviSyncLog): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(suiviSyncLog).values(log);
  return Number(result[0].insertId);
}

/** Update a sync log entry */
export async function updateSuiviSyncLog(id: number, updates: Partial<InsertSuiviSyncLog>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(suiviSyncLog).set(updates).where(eq(suiviSyncLog.id, id));
}

/** Get the latest sync log entry */
export async function getLatestSuiviSync(): Promise<SuiviSyncLog | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(suiviSyncLog).orderBy(desc(suiviSyncLog.createdAt)).limit(1);
  return rows[0] || null;
}

/** Get cached order stats (aggregated counts) */
export async function getCachedSuiviStats(): Promise<{
  total: number;
  noAnswer: number;
  postponed: number;
  cancelled: number;
  refused: number;
  wrongInfo: number;
  other: number;
}> {
  const db = await getDb();
  if (!db) return { total: 0, noAnswer: 0, postponed: 0, cancelled: 0, refused: 0, wrongInfo: 0, other: 0 };

  const orders = await db.select({ reasonCategory: suiviCachedOrders.reasonCategory }).from(suiviCachedOrders);
  return {
    total: orders.length,
    noAnswer: orders.filter(o => o.reasonCategory === "no_answer").length,
    postponed: orders.filter(o => o.reasonCategory === "postponed").length,
    cancelled: orders.filter(o => o.reasonCategory === "cancelled").length,
    refused: orders.filter(o => o.reasonCategory === "refused").length,
    wrongInfo: orders.filter(o => o.reasonCategory === "wrong_info").length,
    other: orders.filter(o => !["no_answer", "postponed", "cancelled", "refused", "wrong_info"].includes(o.reasonCategory)).length,
  };
}
