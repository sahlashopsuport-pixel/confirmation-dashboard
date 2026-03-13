import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, bigint } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Agent sheets table — stores Google Sheet URLs for confirmateurs
export const agentSheets = mysqlTable("agent_sheets", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  sheetUrl: text("sheetUrl").notNull(),
  country: varchar("country", { length: 50 }),
  agentCode: varchar("agentCode", { length: 20 }),
  /** The designated agent's Google email (for activity tracking — only this email is tracked per sheet) */
  agentEmail: varchar("agentEmail", { length: 320 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AgentSheet = typeof agentSheets.$inferSelect;
export type InsertAgentSheet = typeof agentSheets.$inferInsert;

// Dashboard users table — simple username/password authentication
export const dashboardUsers = mysqlTable("dashboard_users", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  /** Role: 'user' for regular access, 'super_admin' for full access, 'collector' for Orders + History only */
  dashboardRole: mysqlEnum("dashboard_role", ["user", "super_admin", "collector", "page_manager"]).default("user").notNull(),
  /** Last time this user made any API call (heartbeat) */
  lastActiveAt: timestamp("lastActiveAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DashboardUser = typeof dashboardUsers.$inferSelect;
export type InsertDashboardUser = typeof dashboardUsers.$inferInsert;

// Assignment history — logs every lead assignment and export operation
export const assignmentHistory = mysqlTable("assignment_history", {
  id: int("id").autoincrement().primaryKey(),
  /** Who performed the assignment/export (dashboard username) */
  assignedBy: varchar("assignedBy", { length: 100 }).notNull(),
  /** Country/dashboard slug: algeria, viconis, libya, tunisia */
  country: varchar("country", { length: 50 }).notNull(),
  /** Sheet tab (week) for assignments, or partner name for exports */
  sheetTab: varchar("sheetTab", { length: 100 }).notNull(),
  /** Total leads in the batch */
  totalLeads: int("totalLeads").notNull(),
  /** How many were successfully assigned */
  totalAssigned: int("totalAssigned").notNull(),
  /** How many failed */
  totalFailed: int("totalFailed").notNull().default(0),
  /** Overall status: success, partial, failed */
  status: varchar("status", { length: 20 }).notNull().default("success"),
  /** Event type: assignment (default) or export */
  eventType: varchar("eventType", { length: 20 }).notNull().default("assignment"),
  /** Extra metadata JSON (e.g., export partner details, duplicate count, upsell count) */
  metadata: text("metadata"),
  /** Business work date — the day agents will actually work these leads (may differ from createdAt for night assignments) */
  workDate: varchar("workDate", { length: 10 }),
  /** Validation status: pending (just exported), validated (confirmed uploaded), rejected (not uploaded/discarded) */
  validationStatus: varchar("validationStatus", { length: 20 }).notNull().default("validated"),
  /** Who validated/rejected this entry */
  validatedBy: varchar("validatedBy", { length: 100 }),
  /** When the validation happened */
  validatedAt: timestamp("validatedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AssignmentHistory = typeof assignmentHistory.$inferSelect;
export type InsertAssignmentHistory = typeof assignmentHistory.$inferInsert;

// Assignment history items — per-agent breakdown within an assignment
export const assignmentHistoryItems = mysqlTable("assignment_history_items", {
  id: int("id").autoincrement().primaryKey(),
  /** FK to assignment_history */
  historyId: int("historyId").notNull(),
  /** Agent sheet DB id */
  agentId: int("agentId").notNull(),
  /** Agent name at time of assignment (snapshot) */
  agentName: varchar("agentName", { length: 255 }).notNull(),
  /** Number of leads assigned to this agent */
  leadCount: int("leadCount").notNull(),
  /** Whether this agent's assignment succeeded */
  success: int("success").notNull().default(1),
  /** Error message if failed */
  errorMessage: text("errorMessage"),
  /** JSON array of lead objects assigned to this agent (for traceability) */
  leadsJson: text("leadsJson"),
});

export type AssignmentHistoryItem = typeof assignmentHistoryItems.$inferSelect;
export type InsertAssignmentHistoryItem = typeof assignmentHistoryItems.$inferInsert;

// People ID mapping — maps Google Drive Activity API people IDs to email addresses
export const peopleIdMap = mysqlTable("people_id_map", {
  id: int("id").autoincrement().primaryKey(),
  /** Google people ID, e.g. "people/111691715312585579008" */
  peopleId: varchar("peopleId", { length: 100 }).notNull().unique(),
  /** Resolved email address */
  email: varchar("email", { length: 320 }).notNull(),
  /** Display name from Google */
  displayName: varchar("displayName", { length: 255 }),
  /** Which spreadsheet this mapping was discovered from */
  sourceSpreadsheetId: varchar("sourceSpreadsheetId", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PeopleIdMapEntry = typeof peopleIdMap.$inferSelect;
export type InsertPeopleIdMapEntry = typeof peopleIdMap.$inferInsert;

// Delivery orders — stores parsed orders from shipping partner exports (48H, Colivraison, etc.)
export const deliveryOrders = mysqlTable("delivery_orders", {
  id: int("id").autoincrement().primaryKey(),
  /** Unique tracking number from shipping partner (e.g., ECOEXG2602161470171) */
  tracking: varchar("tracking", { length: 100 }).notNull().unique(),
  /** Shipping partner: 48h, colivraison, viconis48, etc. */
  partner: varchar("partner", { length: 50 }).notNull(),
  /** Order reference from the original system */
  reference: varchar("reference", { length: 100 }),
  /** Client name as written in the export */
  clientName: varchar("clientName", { length: 255 }),
  /** Client phone number */
  phone: varchar("phone", { length: 20 }),
  /** Phone 2 (secondary) */
  phone2: varchar("phone2", { length: 20 }),
  /** Wilaya (state/province) */
  wilaya: varchar("wilaya", { length: 100 }),
  /** Commune (city/district) */
  commune: varchar("commune", { length: 100 }),
  /** Full address */
  address: text("address"),
  /** Product description */
  product: text("product"),
  /** Remarque/notes from the export */
  remarque: text("remarque"),
  /** Order amount in DZD (stored as integer cents to avoid float issues) */
  amount: int("amount"),
  /** Current delivery status: en_traitement, livre_paye, livre_non_paye, retour_recu, retour_non_recu, non_recu */
  status: varchar("status", { length: 50 }).notNull(),
  /** Raw status text from the export (for display) */
  statusRaw: varchar("statusRaw", { length: 100 }),
  /** Agent code extracted from client name (e.g., SH08, L03, Y01) */
  agentCode: varchar("agentCode", { length: 20 }),
  /** FK to agent_sheets.id (resolved from agentCode) */
  agentId: int("agentId"),
  /** MEDIAZ code from remarque field (e.g., LAM mediaz, GHM-MEDIAZ) */
  mediazCode: varchar("mediazCode", { length: 50 }),
  /** Shipment date from the export */
  shippedAt: timestamp("shippedAt"),
  /** Upload batch ID — groups orders from the same file upload */
  uploadBatchId: varchar("uploadBatchId", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DeliveryOrder = typeof deliveryOrders.$inferSelect;
export type InsertDeliveryOrder = typeof deliveryOrders.$inferInsert;

// Delivery upload log — tracks each file upload for audit trail
export const deliveryUploads = mysqlTable("delivery_uploads", {
  id: int("id").autoincrement().primaryKey(),
  /** Upload batch ID (matches deliveryOrders.uploadBatchId) */
  batchId: varchar("batchId", { length: 50 }).notNull().unique(),
  /** Shipping partner */
  partner: varchar("partner", { length: 50 }).notNull(),
  /** Original filename */
  filename: varchar("filename", { length: 255 }).notNull(),
  /** Total rows in the file */
  totalRows: int("totalRows").notNull(),
  /** New orders inserted */
  newOrders: int("newOrders").notNull().default(0),
  /** Existing orders updated */
  updatedOrders: int("updatedOrders").notNull().default(0),
  /** Who uploaded (dashboard username) */
  uploadedBy: varchar("uploadedBy", { length: 100 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DeliveryUpload = typeof deliveryUploads.$inferSelect;
export type InsertDeliveryUpload = typeof deliveryUploads.$inferInsert;

// Collection batches — logs each "Mark as Collected" action
export const collectionBatches = mysqlTable("collection_batches", {
  id: int("id").autoincrement().primaryKey(),
  /** Who performed the collection (dashboard username) */
  collectedBy: varchar("collectedBy", { length: 100 }).notNull(),
  /** Country/dashboard slug: algeria, viconis, libya, tunisia */
  country: varchar("country", { length: 50 }).notNull(),
  /** Total orders in this batch */
  totalOrders: int("totalOrders").notNull(),
  /** How many agents were involved */
  agentCount: int("agentCount").notNull(),
  /** Overall status: success, partial, failed */
  status: varchar("status", { length: 20 }).notNull().default("success"),
  /** How many orders were successfully marked */
  successCount: int("successCount").notNull().default(0),
  /** How many orders failed to mark */
  failCount: int("failCount").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CollectionBatch = typeof collectionBatches.$inferSelect;
export type InsertCollectionBatch = typeof collectionBatches.$inferInsert;

// Collection orders — individual orders within a collection batch
export const collectionOrders = mysqlTable("collection_orders", {
  id: int("id").autoincrement().primaryKey(),
  /** FK to collection_batches */
  batchId: int("batchId").notNull(),
  /** Agent sheet DB id */
  agentId: int("agentId").notNull(),
  /** Agent name at time of collection (snapshot) */
  agentName: varchar("agentName", { length: 255 }).notNull(),
  /** Spreadsheet ID */
  spreadsheetId: varchar("spreadsheetId", { length: 100 }).notNull(),
  /** Tab/sheet name */
  tab: varchar("tab", { length: 100 }).notNull(),
  /** Row number in the sheet */
  rowNumber: int("rowNumber").notNull(),
  /** Customer phone (for identification) */
  phone: varchar("phone", { length: 20 }),
  /** Customer name */
  customerName: varchar("customerName", { length: 255 }),
  /** Product name */
  product: varchar("product", { length: 255 }),
  /** Quantity */
  qty: int("qty"),
  /** Price */
  price: varchar("price", { length: 20 }),
  /** Address */
  address: text("address"),
  /** Whether this order was successfully marked */
  success: int("success").notNull().default(1),
  /** Error message if failed */
  errorMessage: text("errorMessage"),
});

export type CollectionOrder = typeof collectionOrders.$inferSelect;
export type InsertCollectionOrder = typeof collectionOrders.$inferInsert;
// Lead inbox batches — raw text blobs submitted by page managers (Rima/Soumia) for Hadjer to assign
// Stores the raw pasted text exactly as-is so Hadjer gets a perfect copy-paste into her textarea
export const leadInboxBatches = mysqlTable("lead_inbox_batches", {
  id: int("id").autoincrement().primaryKey(),
  /** Raw pasted text — stored exactly as submitted, no parsing */
  rawText: text("rawText").notNull(),
  /** Country: algeria, libya, tunisia, viconis */
  country: varchar("country", { length: 50 }).notNull(),
  /** Approximate number of lines/leads in the batch */
  lineCount: int("lineCount").notNull().default(0),
  /** Who submitted this batch (dashboard username) */
  submittedBy: varchar("submittedBy", { length: 100 }).notNull(),
  /** Status: pending (awaiting assignment), assigned (already used) */
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  /** FK to assignment_history.id when assigned */
  assignmentHistoryId: int("assignmentHistoryId"),
  /** When the batch was assigned by Hadjer (null if still pending) */
  assignedAt: timestamp("assignedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LeadInboxBatch = typeof leadInboxBatches.$inferSelect;
export type InsertLeadInboxBatch = typeof leadInboxBatches.$inferInsert;

// Salary records — monthly salary breakdown for page managers (Ryma/Soumia)
export const salaryRecords = mysqlTable("salary_records", {
  id: int("id").autoincrement().primaryKey(),
  /** Dashboard user ID (FK to dashboard_users.id) */
  userId: int("userId").notNull(),
  /** Dashboard username (snapshot for display) */
  username: varchar("username", { length: 100 }).notNull(),
  /** Year */
  year: int("year").notNull(),
  /** Month (1-12) */
  month: int("month").notNull(),
  /** Fixed monthly salary in DA */
  fixedSalary: int("fixedSalary").notNull().default(0),
  /** Number of delivered orders — Algeria */
  deliveredAlgeria: int("deliveredAlgeria").notNull().default(0),
  /** Number of delivered orders — Libya */
  deliveredLibya: int("deliveredLibya").notNull().default(0),
  /** Number of delivered orders — Viconis */
  deliveredViconis: int("deliveredViconis").notNull().default(0),
  /** Number of delivered orders — Tunisia */
  deliveredTunisia: int("deliveredTunisia").notNull().default(0),
  /** Commission rate per delivered order in DA (default 100) */
  commissionPerOrder: int("commissionPerOrder").notNull().default(100),
  /** Number of good video testimonials (500 DA each) */
  goodVideos: int("goodVideos").notNull().default(0),
  /** Number of average video testimonials (250 DA each) */
  avgVideos: int("avgVideos").notNull().default(0),
  /** Number of absence days */
  absenceDays: int("absenceDays").notNull().default(0),
  /** Bonus amount in DA */
  bonus: int("bonus").notNull().default(0),
  /** Deduction amount in DA */
  deduction: int("deduction").notNull().default(0),
  /** Notes/remarks */
  notes: text("notes"),
  /** Who created/updated this record (admin username) */
  updatedBy: varchar("updatedBy", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SalaryRecord = typeof salaryRecords.$inferSelect;
export type InsertSalaryRecord = typeof salaryRecords.$inferInsert;

// Assigned leads — permanent storage of every lead ever assigned to agents
// This is the source of truth for historical data, even after Google Sheet weeks are recycled
export const assignedLeads = mysqlTable("assigned_leads", {
  id: int("id").autoincrement().primaryKey(),
  /** FK to assignment_history.id — which batch this lead belongs to */
  historyId: int("historyId"),
  /** Agent sheet DB id */
  agentId: int("agentId").notNull(),
  /** Agent name at time of assignment (snapshot) */
  agentName: varchar("agentName", { length: 255 }).notNull(),
  /** Agent code (e.g. SB, L03) */
  agentCode: varchar("agentCode", { length: 20 }),
  /** Business work date YYYY-MM-DD — the day agents will work this lead */
  workDate: varchar("workDate", { length: 10 }).notNull(),
  /** Country/market: algeria, libya, tunisia, viconis */
  market: varchar("market", { length: 50 }).notNull(),
  /** Sheet tab the lead was written to (e.g. الاسبوع 1) */
  sheetTab: varchar("sheetTab", { length: 100 }),
  /** Customer name */
  customerName: varchar("customerName", { length: 255 }),
  /** Customer phone */
  phone: varchar("phone", { length: 30 }),
  /** Wilaya (state/province) */
  wilaya: varchar("wilaya", { length: 100 }),
  /** Product name */
  product: varchar("product", { length: 255 }),
  /** Price */
  price: varchar("price", { length: 20 }),
  /** SKU / reference */
  sku: varchar("sku", { length: 100 }),
  /** Address 2 (Libya: area/neighborhood) */
  address2: varchar("address2", { length: 255 }),
  /** Order type (Libya: NORMAL / ABANDONED) */
  orderType: varchar("orderType", { length: 50 }),
  /** Who assigned this lead (dashboard username) */
  assignedBy: varchar("assignedBy", { length: 100 }).notNull(),
  /** Confirmation status synced from Google Sheet (col B): تأكيد, إلغاء, تأجيل, etc. */
  status: varchar("status", { length: 50 }),
  /** Quantity synced from Google Sheet (col C) */
  quantity: int("quantity"),
  /** Delivery status synced from Google Sheet (col D): نعم or لا */
  delivery: varchar("delivery", { length: 20 }),
  /** Call notes synced from Google Sheet (col E) */
  callNotes: text("callNotes"),
  /** Row number in the Google Sheet (for targeted re-sync) */
  sheetRow: int("sheetRow"),
  /** Last time this lead's status was synced from the sheet */
  syncedAt: timestamp("syncedAt"),
  /** When this lead was assigned */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AssignedLead = typeof assignedLeads.$inferSelect;
export type InsertAssignedLead = typeof assignedLeads.$inferInsert;

// Suivi call logs — tracks follow-up calls made by suivi agents on DHD delivery orders
export const suiviCallLogs = mysqlTable("suivi_call_logs", {
  id: int("id").autoincrement().primaryKey(),
  /** DHD tracking number */
  tracking: varchar("tracking", { length: 100 }).notNull(),
  /** Client name from DHD */
  clientName: varchar("clientName", { length: 255 }),
  /** Client phone */
  phone: varchar("phone", { length: 20 }),
  /** DHD order status at time of call */
  orderStatus: varchar("orderStatus", { length: 50 }),
  /** The problem reason from DHD (e.g., "Client ne répond pas") */
  problemReason: varchar("problemReason", { length: 255 }),
  /** Call result: answered, no_answer, postponed, cancelled, wrong_number, resolved */
  callResult: varchar("callResult", { length: 50 }).notNull(),
  /** Notes from the suivi agent */
  notes: text("notes"),
  /** Who made the call (dashboard username) */
  calledBy: varchar("calledBy", { length: 100 }).notNull(),
  /** Wilaya ID from DHD */
  wilayaId: int("wilayaId"),
  /** Amount from DHD */
  amount: varchar("amount", { length: 20 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SuiviCallLog = typeof suiviCallLogs.$inferSelect;
export type InsertSuiviCallLog = typeof suiviCallLogs.$inferInsert;

// Suivi cached orders — server-side cache of DHD problem orders for instant page load
export const suiviCachedOrders = mysqlTable("suivi_cached_orders", {
  id: int("id").autoincrement().primaryKey(),
  /** DHD tracking number — unique identifier */
  tracking: varchar("tracking", { length: 100 }).notNull().unique(),
  /** Client name */
  client: varchar("client", { length: 255 }).notNull(),
  /** Client phone */
  phone: varchar("phone", { length: 20 }).notNull(),
  /** Secondary phone */
  phone2: varchar("phone2", { length: 20 }),
  /** Client address */
  adresse: text("adresse"),
  /** Order reference */
  reference: varchar("reference", { length: 100 }),
  /** Order amount */
  montant: varchar("montant", { length: 20 }).notNull(),
  /** Wilaya ID */
  wilayaId: int("wilayaId").notNull(),
  /** Wilaya name (resolved) */
  wilayaName: varchar("wilayaName", { length: 100 }).notNull(),
  /** DHD status key (e.g., en_livraison, suspendu) */
  status: varchar("status", { length: 50 }).notNull(),
  /** Human-readable status label */
  statusLabel: varchar("statusLabel", { length: 100 }).notNull(),
  /** Problem reason category: no_answer, postponed, cancelled, refused, wrong_info, etc. */
  reasonCategory: varchar("reasonCategory", { length: 50 }).notNull(),
  /** Raw latest reason text from DHD */
  latestReasonText: text("latestReasonText"),
  /** Full latest reason JSON */
  latestReasonJson: text("latestReasonJson"),
  /** Full status_reason array JSON */
  statusReasonJson: text("statusReasonJson"),
  /** Products description */
  products: text("products"),
  /** Order creation date from DHD */
  orderCreatedAt: varchar("orderCreatedAt", { length: 50 }),
  /** Last update date from DHD */
  lastUpdatedAt: varchar("lastUpdatedAt", { length: 50 }),
  /** When this cache entry was created */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** When this cache entry was last refreshed */
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SuiviCachedOrder = typeof suiviCachedOrders.$inferSelect;
export type InsertSuiviCachedOrder = typeof suiviCachedOrders.$inferInsert;

// Suivi sync log — tracks each background sync run
export const suiviSyncLog = mysqlTable("suivi_sync_log", {
  id: int("id").autoincrement().primaryKey(),
  /** Sync status: running, completed, failed */
  status: varchar("status", { length: 20 }).notNull(),
  /** Total pages scanned */
  pagesScanned: int("pagesScanned").notNull().default(0),
  /** Total orders scanned across all pages */
  ordersScanned: int("ordersScanned").notNull().default(0),
  /** Problem orders found and cached */
  problemsFound: int("problemsFound").notNull().default(0),
  /** Orders removed (no longer problem) */
  ordersRemoved: int("ordersRemoved").notNull().default(0),
  /** Duration in milliseconds */
  durationMs: int("durationMs"),
  /** Error message if failed */
  errorMessage: text("errorMessage"),
  /** Who triggered: 'auto' for cron, username for manual */
  triggeredBy: varchar("triggeredBy", { length: 100 }).notNull().default("auto"),
  /** Start date filter used (YYYY-MM-DD) */
  startDate: varchar("startDate", { length: 10 }),
  /** End date filter used (YYYY-MM-DD) */
  endDate: varchar("endDate", { length: 10 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SuiviSyncLog = typeof suiviSyncLog.$inferSelect;
export type InsertSuiviSyncLog = typeof suiviSyncLog.$inferInsert;
