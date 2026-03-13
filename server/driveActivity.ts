/**
 * Google Drive Activity API integration
 * 
 * Fetches edit activity from Google Sheets via:
 * 1. Drive Activity API — granular edit events with people IDs
 * 2. Drive Revisions API — revision history with email addresses
 * 
 * IMPORTANT: People IDs are NOT globally unique. The same people ID can
 * represent different users on different spreadsheets. All mapping must
 * be done per-sheet, never globally.
 */

import { google } from "googleapis";

// ---- Auth ----

let _cachedAuth: InstanceType<typeof google.auth.JWT> | null = null;

function getDriveAuth() {
  if (_cachedAuth) return _cachedAuth;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !privateKey) {
    throw new Error("Google Service Account credentials not configured");
  }

  _cachedAuth = new google.auth.JWT({
    email,
    key: privateKey.replace(/\\n/g, "\n"),
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.activity.readonly",
    ],
  });
  return _cachedAuth;
}

// ---- Types ----

export interface ActivityEvent {
  timestamp: string; // ISO string
  actorPeopleId: string; // e.g. "people/111691715312585579008"
  actionType: string; // e.g. "edit", "comment", etc.
}

/** Activity event with email already resolved (per-sheet) */
export interface ResolvedActivityEvent {
  timestamp: string;
  email: string; // resolved email (lowercase)
  displayName: string;
  actionType: string;
  sourceFileId: string; // which spreadsheet this came from
}

export interface RevisionInfo {
  revisionId: string;
  modifiedTime: string; // ISO string
  lastModifyingUser?: {
    displayName?: string;
    emailAddress?: string;
    photoLink?: string;
  };
}

export interface AgentDailyActivity {
  email: string;
  displayName: string;
  peopleId: string; // kept for backward compat, but email is the real identifier
  date: string; // YYYY-MM-DD
  shiftStart: string; // ISO timestamp
  shiftEnd: string; // ISO timestamp
  totalSpanHours: number;
  activeHours: number;
  idleHours: number;
  totalEdits: number;
  editsPerActiveHour: number;
  breaks: Array<{ start: string; end: string; durationMin: number }>;
  hourlyEdits: Record<number, number>; // hour (0-23) → edit count
}

export interface PeopleIdMapping {
  peopleId: string;
  email: string;
  displayName: string;
}

// ---- Activity API ----

/**
 * Fetch activity events for a specific Google Drive file (spreadsheet).
 * Returns up to 200 most recent activities.
 */
export async function fetchDriveActivity(
  fileId: string,
  pageSize: number = 200
): Promise<ActivityEvent[]> {
  const auth = getDriveAuth();
  const driveActivity = google.driveactivity({ version: "v2", auth });

  const activities: ActivityEvent[] = [];
  let pageToken: string | undefined;

  try {
    // Fetch up to 2 pages (200 activities each)
    for (let page = 0; page < 2; page++) {
      const response = await driveActivity.activity.query({
        requestBody: {
          itemName: `items/${fileId}`,
          pageSize,
          ...(pageToken ? { pageToken } : {}),
        },
      });

      const items = response.data.activities || [];
      for (const activity of items) {
        const timestamp =
          activity.timestamp ||
          activity.timeRange?.endTime ||
          activity.timeRange?.startTime;
        if (!timestamp) continue;

        const actors = activity.actors || [];
        for (const actor of actors) {
          const personName = actor.user?.knownUser?.personName;
          if (!personName) continue;

          // Determine action type
          const primaryAction = activity.primaryActionDetail;
          let actionType = "unknown";
          if (primaryAction?.edit) actionType = "edit";
          else if (primaryAction?.create) actionType = "create";
          else if (primaryAction?.comment) actionType = "comment";
          else if (primaryAction?.rename) actionType = "rename";
          else if (primaryAction?.move) actionType = "move";
          else if (primaryAction?.permissionChange) actionType = "permission";

          activities.push({
            timestamp,
            actorPeopleId: personName,
            actionType,
          });
        }
      }

      pageToken = response.data.nextPageToken || undefined;
      if (!pageToken) break;
    }
  } catch (error: any) {
    console.error(`[DriveActivity] Error fetching activity for ${fileId}:`, error.message);
    throw error;
  }

  return activities;
}

// ---- Revisions API ----

/**
 * Fetch revision history for a Google Drive file.
 * Returns revisions with user email addresses.
 */
export async function fetchRevisions(fileId: string): Promise<RevisionInfo[]> {
  const auth = getDriveAuth();
  const drive = google.drive({ version: "v3", auth });

  try {
    const response = await drive.revisions.list({
      fileId,
      fields: "revisions(id,modifiedTime,lastModifyingUser)",
      pageSize: 200,
    });

    const revisions = response.data.revisions || [];
    return revisions.map((rev) => ({
      revisionId: rev.id || "",
      modifiedTime: rev.modifiedTime || "",
      lastModifyingUser: rev.lastModifyingUser
        ? {
            displayName: rev.lastModifyingUser.displayName || undefined,
            emailAddress: rev.lastModifyingUser.emailAddress || undefined,
            photoLink: rev.lastModifyingUser.photoLink || undefined,
          }
        : undefined,
    }));
  } catch (error: any) {
    console.error(`[DriveActivity] Error fetching revisions for ${fileId}:`, error.message);
    throw error;
  }
}

// ---- Per-Sheet People ID → Email Mapping ----

/**
 * Build a mapping of people IDs to emails for a SINGLE sheet by cross-referencing
 * that sheet's activity timestamps with its revision timestamps.
 * 
 * CRITICAL: This mapping is ONLY valid for the specific sheet it was built from.
 * The same people ID can map to a different email on a different sheet.
 */
export function buildPerSheetPeopleIdMap(
  activities: ActivityEvent[],
  revisions: RevisionInfo[]
): Map<string, PeopleIdMapping> {
  const mappings = new Map<string, PeopleIdMapping>();

  // Get unique people IDs from these activities
  const uniquePeopleIds = new Set(activities.map((a) => a.actorPeopleId));

  for (const peopleId of Array.from(uniquePeopleIds)) {
    const personActivities = activities.filter((a) => a.actorPeopleId === peopleId);

    for (const activity of personActivities) {
      const activityTime = new Date(activity.timestamp).getTime();

      // Find a revision within ±30 seconds
      for (const rev of revisions) {
        if (!rev.lastModifyingUser?.emailAddress) continue;
        const revTime = new Date(rev.modifiedTime).getTime();
        const diff = Math.abs(activityTime - revTime);

        if (diff <= 30000) {
          mappings.set(peopleId, {
            peopleId,
            email: rev.lastModifyingUser.emailAddress,
            displayName: rev.lastModifyingUser.displayName || rev.lastModifyingUser.emailAddress,
          });
          break;
        }
      }

      if (mappings.has(peopleId)) break;
    }
  }

  return mappings;
}

// Keep the old function name for backward compat (used in tests/other places)
export function buildPeopleIdMap(
  activities: ActivityEvent[],
  revisions: RevisionInfo[]
): PeopleIdMapping[] {
  return Array.from(buildPerSheetPeopleIdMap(activities, revisions).values());
}

// ---- Per-Sheet Activity Resolution ----

/**
 * For a single spreadsheet: fetch activities + revisions, resolve people IDs to emails
 * using ONLY this sheet's data. Returns activities tagged with resolved emails.
 * 
 * If `designatedAgentEmail` is provided, the most active people ID on this sheet
 * that isn't already mapped to another known email will be assumed to be the agent.
 */
export async function fetchAndResolveSheetActivity(
  fileId: string,
  designatedAgentEmail?: string | null,
  pageSize: number = 200,
): Promise<{
  resolvedActivities: ResolvedActivityEvent[];
  perSheetMappings: Map<string, PeopleIdMapping>;
}> {
  // Fetch both in parallel
  const [activities, revisions] = await Promise.all([
    fetchDriveActivity(fileId, pageSize),
    fetchRevisions(fileId),
  ]);

  // Build per-sheet mapping
  const perSheetMap = buildPerSheetPeopleIdMap(activities, revisions);

  // If we have a designated agent email and there's a dominant unmapped people ID,
  // assume it belongs to the designated agent
  if (designatedAgentEmail) {
    const designatedLower = designatedAgentEmail.toLowerCase();
    
    // Check if the designated email is already mapped
    let alreadyMapped = false;
    for (const [, mapping] of Array.from(perSheetMap.entries())) {
      if (mapping.email.toLowerCase() === designatedLower) {
        alreadyMapped = true;
        break;
      }
    }

    if (!alreadyMapped) {
      // Find the most active unmapped people ID — likely the designated agent
      const activityCounts = new Map<string, number>();
      for (const a of activities) {
        if (!perSheetMap.has(a.actorPeopleId)) {
          activityCounts.set(a.actorPeopleId, (activityCounts.get(a.actorPeopleId) || 0) + 1);
        }
      }

      if (activityCounts.size > 0) {
        // Pick the most active unmapped ID
        let maxId = '';
        let maxCount = 0;
        for (const [pid, count] of Array.from(activityCounts.entries())) {
          if (count > maxCount) {
            maxId = pid;
            maxCount = count;
          }
        }

        if (maxId && maxCount > 10) {
          // Only assign if it has significant activity (>10 edits)
          perSheetMap.set(maxId, {
            peopleId: maxId,
            email: designatedLower,
            displayName: designatedLower.split('@')[0],
          });
          console.log(`[DriveActivity] Assigned most active unmapped ID ${maxId} (${maxCount} edits) to designated agent ${designatedLower} on sheet ${fileId}`);
        }
      }
    }
  }

  // Resolve activities: convert people IDs to emails using per-sheet mapping
  const resolvedActivities: ResolvedActivityEvent[] = [];
  for (const a of activities) {
    const mapping = perSheetMap.get(a.actorPeopleId);
    if (mapping) {
      resolvedActivities.push({
        timestamp: a.timestamp,
        email: mapping.email.toLowerCase(),
        displayName: mapping.displayName,
        actionType: a.actionType,
        sourceFileId: fileId,
      });
    }
    // Activities with unmapped people IDs are dropped — we can't reliably identify them
  }

  return { resolvedActivities, perSheetMappings: perSheetMap };
}

// ---- Activity Analysis (Email-Based) ----

const IDLE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes = idle gap
const TIMEZONE_OFFSET_HOURS = 1; // Algeria = UTC+1

/**
 * Analyze resolved activities for a specific email on a specific date.
 * Returns daily activity summary including shift times, breaks, and productivity.
 */
export function analyzeResolvedDailyActivity(
  activities: ResolvedActivityEvent[],
  email: string,
  date: string, // YYYY-MM-DD in Algeria time
  displayName: string = "Unknown"
): AgentDailyActivity | null {
  // Filter activities for this email on this date
  const personActivities = activities
    .filter((a) => a.email === email)
    .map((a) => ({
      ...a,
      localTime: toAlgeriaTime(new Date(a.timestamp)),
    }))
    .filter((a) => formatDate(a.localTime) === date)
    .sort((a, b) => a.localTime.getTime() - b.localTime.getTime());

  if (personActivities.length === 0) return null;

  // Use local (Algeria) timestamps for date grouping and span calculation
  const localTimestamps = personActivities.map((a) => a.localTime.getTime());
  const totalSpanMs = localTimestamps[localTimestamps.length - 1] - localTimestamps[0];

  // Use ORIGINAL UTC timestamps for shiftStart/shiftEnd (frontend will convert to user's local TZ)
  const utcTimestamps = personActivities.map((a) => new Date(a.timestamp).getTime());
  const shiftStart = new Date(utcTimestamps[0]);
  const shiftEnd = new Date(utcTimestamps[utcTimestamps.length - 1]);

  // Detect breaks (gaps > 15 min)
  const breaks: Array<{ start: string; end: string; durationMin: number }> = [];
  let totalIdleMs = 0;

  for (let i = 1; i < localTimestamps.length; i++) {
    const gap = localTimestamps[i] - localTimestamps[i - 1];
    if (gap > IDLE_THRESHOLD_MS) {
      breaks.push({
        start: new Date(utcTimestamps[i - 1]).toISOString(),
        end: new Date(utcTimestamps[i]).toISOString(),
        durationMin: Math.round(gap / 60000),
      });
      totalIdleMs += gap;
    }
  }

  const activeMs = totalSpanMs - totalIdleMs;
  const activeHours = activeMs / 3600000;
  const totalSpanHours = totalSpanMs / 3600000;
  const idleHours = totalIdleMs / 3600000;

  // Hourly edit distribution (in Algeria time)
  const hourlyEdits: Record<number, number> = {};
  for (const a of personActivities) {
    const hour = a.localTime.getUTCHours();
    hourlyEdits[hour] = (hourlyEdits[hour] || 0) + 1;
  }

  return {
    email,
    displayName,
    peopleId: email, // Use email as the identifier (people IDs are unreliable across sheets)
    date,
    shiftStart: shiftStart.toISOString(),
    shiftEnd: shiftEnd.toISOString(),
    totalSpanHours: Math.round(totalSpanHours * 10) / 10,
    activeHours: Math.round(activeHours * 10) / 10,
    idleHours: Math.round(idleHours * 10) / 10,
    totalEdits: personActivities.length,
    editsPerActiveHour: activeHours > 0 ? Math.round((personActivities.length / activeHours) * 10) / 10 : 0,
    breaks,
    hourlyEdits,
  };
}

/**
 * Analyze resolved activities for ALL emails across multiple dates.
 * Groups by email (globally unique) instead of people ID (NOT globally unique).
 */
export function analyzeAllResolvedActivities(
  activities: ResolvedActivityEvent[],
  emailToDisplayName: Map<string, string>,
): AgentDailyActivity[] {
  const result: AgentDailyActivity[] = [];

  // Get unique emails
  const uniqueEmails = new Set(activities.map((a) => a.email));

  for (const email of Array.from(uniqueEmails)) {
    const displayName = emailToDisplayName.get(email) || email.split('@')[0];

    // Get unique dates for this email (in Algeria time)
    const personActivities = activities.filter((a) => a.email === email);
    const dates = new Set(
      personActivities.map((a) => formatDate(toAlgeriaTime(new Date(a.timestamp))))
    );

    for (const date of Array.from(dates)) {
      const daily = analyzeResolvedDailyActivity(activities, email, date, displayName);
      if (daily) {
        result.push(daily);
      }
    }
  }

  // Sort by date descending, then by displayName
  result.sort((a, b) => {
    const dateComp = b.date.localeCompare(a.date);
    if (dateComp !== 0) return dateComp;
    return a.displayName.localeCompare(b.displayName);
  });

  return result;
}

// ---- Legacy functions kept for backward compatibility ----

/**
 * @deprecated Use analyzeResolvedDailyActivity instead. This uses people IDs which are unreliable.
 */
export function analyzeDailyActivity(
  activities: ActivityEvent[],
  peopleId: string,
  date: string,
  email: string = "unknown",
  displayName: string = "Unknown"
): AgentDailyActivity | null {
  const personActivities = activities
    .filter((a) => a.actorPeopleId === peopleId)
    .map((a) => ({
      ...a,
      localTime: toAlgeriaTime(new Date(a.timestamp)),
    }))
    .filter((a) => formatDate(a.localTime) === date)
    .sort((a, b) => a.localTime.getTime() - b.localTime.getTime());

  if (personActivities.length === 0) return null;

  const localTimestamps = personActivities.map((a) => a.localTime.getTime());
  const totalSpanMs = localTimestamps[localTimestamps.length - 1] - localTimestamps[0];
  const utcTimestamps = personActivities.map((a) => new Date(a.timestamp).getTime());
  const shiftStart = new Date(utcTimestamps[0]);
  const shiftEnd = new Date(utcTimestamps[utcTimestamps.length - 1]);

  const breaks: Array<{ start: string; end: string; durationMin: number }> = [];
  let totalIdleMs = 0;

  for (let i = 1; i < localTimestamps.length; i++) {
    const gap = localTimestamps[i] - localTimestamps[i - 1];
    if (gap > IDLE_THRESHOLD_MS) {
      breaks.push({
        start: new Date(utcTimestamps[i - 1]).toISOString(),
        end: new Date(utcTimestamps[i]).toISOString(),
        durationMin: Math.round(gap / 60000),
      });
      totalIdleMs += gap;
    }
  }

  const activeMs = totalSpanMs - totalIdleMs;
  const activeHours = activeMs / 3600000;
  const totalSpanHours = totalSpanMs / 3600000;
  const idleHours = totalIdleMs / 3600000;

  const hourlyEdits: Record<number, number> = {};
  for (const a of personActivities) {
    const hour = a.localTime.getUTCHours();
    hourlyEdits[hour] = (hourlyEdits[hour] || 0) + 1;
  }

  return {
    email,
    displayName,
    peopleId,
    date,
    shiftStart: shiftStart.toISOString(),
    shiftEnd: shiftEnd.toISOString(),
    totalSpanHours: Math.round(totalSpanHours * 10) / 10,
    activeHours: Math.round(activeHours * 10) / 10,
    idleHours: Math.round(idleHours * 10) / 10,
    totalEdits: personActivities.length,
    editsPerActiveHour: activeHours > 0 ? Math.round((personActivities.length / activeHours) * 10) / 10 : 0,
    breaks,
    hourlyEdits,
  };
}

/**
 * @deprecated Use analyzeAllResolvedActivities instead.
 */
export function analyzeAllActivities(
  activities: ActivityEvent[],
  peopleIdMap: Map<string, PeopleIdMapping>
): Map<string, AgentDailyActivity[]> {
  const result = new Map<string, AgentDailyActivity[]>();
  const uniquePeopleIds = new Set(activities.map((a) => a.actorPeopleId));

  for (const peopleId of Array.from(uniquePeopleIds)) {
    const mapping = peopleIdMap.get(peopleId);
    const email = mapping?.email || "unknown";
    const displayName = mapping?.displayName || peopleId.split("/").pop() || "Unknown";

    const personActivities = activities.filter((a) => a.actorPeopleId === peopleId);
    const dates = new Set(
      personActivities.map((a) => formatDate(toAlgeriaTime(new Date(a.timestamp))))
    );

    const dailyActivities: AgentDailyActivity[] = [];
    for (const date of Array.from(dates)) {
      const daily = analyzeDailyActivity(activities, peopleId, date, email, displayName);
      if (daily) {
        dailyActivities.push(daily);
      }
    }

    dailyActivities.sort((a, b) => b.date.localeCompare(a.date));
    result.set(peopleId, dailyActivities);
  }

  return result;
}

/**
 * @deprecated Merging by email from a global people ID map is unreliable.
 */
export function mergeActivitiesByEmail(
  activities: ActivityEvent[],
  peopleIdMap: Map<string, PeopleIdMapping>
): { mergedActivities: ActivityEvent[]; mergedPeopleIdMap: Map<string, PeopleIdMapping> } {
  const emailToPeopleIds = new Map<string, string[]>();
  for (const [peopleId, mapping] of Array.from(peopleIdMap.entries())) {
    if (mapping.email === 'unknown') continue;
    const email = mapping.email.toLowerCase();
    const ids = emailToPeopleIds.get(email) || [];
    ids.push(peopleId);
    emailToPeopleIds.set(email, ids);
  }

  const remap = new Map<string, string>();
  for (const [_email, ids] of Array.from(emailToPeopleIds.entries())) {
    if (ids.length <= 1) continue;
    const canonical = ids[0];
    for (let i = 1; i < ids.length; i++) {
      remap.set(ids[i], canonical);
    }
  }

  if (remap.size === 0) {
    return { mergedActivities: activities, mergedPeopleIdMap: peopleIdMap };
  }

  const mergedActivities = activities.map((a) => {
    const canonical = remap.get(a.actorPeopleId);
    if (canonical) return { ...a, actorPeopleId: canonical };
    return a;
  });

  const seen = new Set<string>();
  const deduped = mergedActivities.filter((a) => {
    const key = `${a.actorPeopleId}|${a.timestamp}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const mergedPeopleIdMap = new Map<string, PeopleIdMapping>();
  for (const [peopleId, mapping] of Array.from(peopleIdMap.entries())) {
    if (!remap.has(peopleId)) {
      mergedPeopleIdMap.set(peopleId, mapping);
    }
  }

  return { mergedActivities: deduped, mergedPeopleIdMap };
}

// ---- Helpers ----

function toAlgeriaTime(utcDate: Date): Date {
  return new Date(utcDate.getTime() + TIMEZONE_OFFSET_HOURS * 3600000);
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Extract spreadsheet ID from a Google Sheets URL.
 */
export function extractSpreadsheetId(url: string): string {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    throw new Error(`Invalid Google Sheets URL: ${url}`);
  }
  return match[1];
}


/**
 * Lightweight: Fetch only the most recent activity per spreadsheet.
 * Uses pageSize=20 to minimize API quota. Returns the latest edit timestamp
 * per actor (people ID) — used for quick status checks.
 * 
 * Note: For the agentStatus endpoint, we still use people IDs because we
 * only look at a single sheet at a time (so people IDs are valid in that context).
 */
export async function fetchRecentActivityStatus(
  fileId: string
): Promise<Array<{ actorPeopleId: string; lastEditTimestamp: string }>> {
  const auth = getDriveAuth();
  const driveActivity = google.driveactivity({ version: "v2", auth });

  const latestByActor = new Map<string, string>();

  try {
    const response = await driveActivity.activity.query({
      requestBody: {
        itemName: `items/${fileId}`,
        pageSize: 20,
      },
    });

    const items = response.data.activities || [];
    for (const activity of items) {
      const timestamp =
        activity.timestamp ||
        activity.timeRange?.endTime ||
        activity.timeRange?.startTime;
      if (!timestamp) continue;

      const actors = activity.actors || [];
      for (const actor of actors) {
        const personName = actor.user?.knownUser?.personName;
        if (!personName) continue;

        const primaryAction = activity.primaryActionDetail;
        if (!primaryAction?.edit) continue;

        const existing = latestByActor.get(personName);
        if (!existing || new Date(timestamp) > new Date(existing)) {
          latestByActor.set(personName, timestamp);
        }
      }
    }
  } catch (error: any) {
    console.error(`[DriveActivity] Error fetching recent status for ${fileId}:`, error.message);
    return [];
  }

  return Array.from(latestByActor.entries()).map(([actorPeopleId, lastEditTimestamp]) => ({
    actorPeopleId,
    lastEditTimestamp,
  }));
}
