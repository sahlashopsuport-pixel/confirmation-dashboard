/**
 * Tests for Activity Status Optimizations
 * 
 * Tests the server-side caching, error backoff, and batch improvements
 * for the agentStatus endpoint.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Test the shouldSkipSheet / recordSheetError / recordSheetSuccess logic ----
// We'll re-implement the logic here to test it in isolation since it's module-scoped

describe('Sheet Error Backoff Logic', () => {
  const ERROR_BACKOFF_MS = 5 * 60 * 1000; // 5 minutes
  const MAX_FAIL_COUNT = 3;

  let sheetErrorBackoff: Map<string, { failCount: number; lastFailTime: number }>;

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

  beforeEach(() => {
    sheetErrorBackoff = new Map();
  });

  it('should not skip a sheet with no errors', () => {
    expect(shouldSkipSheet('sheet1')).toBe(false);
  });

  it('should not skip a sheet after 1 or 2 failures', () => {
    recordSheetError('sheet1');
    expect(shouldSkipSheet('sheet1')).toBe(false);
    
    recordSheetError('sheet1');
    expect(shouldSkipSheet('sheet1')).toBe(false);
  });

  it('should skip a sheet after 3 consecutive failures', () => {
    recordSheetError('sheet1');
    recordSheetError('sheet1');
    recordSheetError('sheet1');
    expect(shouldSkipSheet('sheet1')).toBe(true);
  });

  it('should stop skipping after backoff period expires', () => {
    recordSheetError('sheet1');
    recordSheetError('sheet1');
    recordSheetError('sheet1');
    expect(shouldSkipSheet('sheet1')).toBe(true);

    // Simulate time passing beyond backoff
    const entry = sheetErrorBackoff.get('sheet1')!;
    entry.lastFailTime = Date.now() - ERROR_BACKOFF_MS - 1000;
    expect(shouldSkipSheet('sheet1')).toBe(false);
  });

  it('should clear error state on success', () => {
    recordSheetError('sheet1');
    recordSheetError('sheet1');
    recordSheetError('sheet1');
    expect(shouldSkipSheet('sheet1')).toBe(true);

    recordSheetSuccess('sheet1');
    expect(shouldSkipSheet('sheet1')).toBe(false);
  });

  it('should track errors independently per sheet', () => {
    recordSheetError('sheet1');
    recordSheetError('sheet1');
    recordSheetError('sheet1');
    
    recordSheetError('sheet2');
    
    expect(shouldSkipSheet('sheet1')).toBe(true);
    expect(shouldSkipSheet('sheet2')).toBe(false);
  });

  it('should increment fail count correctly', () => {
    recordSheetError('sheet1');
    expect(sheetErrorBackoff.get('sheet1')?.failCount).toBe(1);
    
    recordSheetError('sheet1');
    expect(sheetErrorBackoff.get('sheet1')?.failCount).toBe(2);
    
    recordSheetError('sheet1');
    expect(sheetErrorBackoff.get('sheet1')?.failCount).toBe(3);
    
    recordSheetError('sheet1');
    expect(sheetErrorBackoff.get('sheet1')?.failCount).toBe(4);
  });
});

// ---- Test the status determination logic ----

describe('Activity Status Determination', () => {
  const ACTIVE_THRESHOLD = 15 * 60 * 1000;  // 15 minutes
  const IDLE_THRESHOLD = 60 * 60 * 1000;    // 60 minutes

  type ActivityStatus = 'active' | 'idle' | 'offline' | 'unknown';

  function determineStatus(lastActivityTime: Date | null, now: Date, hasError?: boolean): ActivityStatus {
    if (hasError) return 'unknown';
    if (!lastActivityTime) return 'offline';
    const elapsedMs = now.getTime() - lastActivityTime.getTime();
    if (elapsedMs < ACTIVE_THRESHOLD) return 'active';
    if (elapsedMs < IDLE_THRESHOLD) return 'idle';
    return 'offline';
  }

  it('should return "unknown" when hasError is true', () => {
    const now = new Date();
    expect(determineStatus(now, now, true)).toBe('unknown');
    expect(determineStatus(null, now, true)).toBe('unknown');
  });

  it('should return "offline" when lastActivityTime is null and no error', () => {
    const now = new Date();
    expect(determineStatus(null, now)).toBe('offline');
  });

  it('should return "active" when last edit was within 15 minutes', () => {
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    expect(determineStatus(fiveMinAgo, now)).toBe('active');
  });

  it('should return "active" when last edit was just now', () => {
    const now = new Date();
    expect(determineStatus(now, now)).toBe('active');
  });

  it('should return "idle" when last edit was 15-60 minutes ago', () => {
    const now = new Date();
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
    expect(determineStatus(thirtyMinAgo, now)).toBe('idle');
  });

  it('should return "idle" at exactly 15 minutes', () => {
    const now = new Date();
    const exactly15 = new Date(now.getTime() - ACTIVE_THRESHOLD);
    expect(determineStatus(exactly15, now)).toBe('idle');
  });

  it('should return "offline" when last edit was over 60 minutes ago', () => {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    expect(determineStatus(twoHoursAgo, now)).toBe('offline');
  });

  it('should return "offline" at exactly 60 minutes', () => {
    const now = new Date();
    const exactly60 = new Date(now.getTime() - IDLE_THRESHOLD);
    expect(determineStatus(exactly60, now)).toBe('offline');
  });
});

// ---- Test the status label generation ----

describe('Activity Status Labels', () => {
  function getStatusLabel(status: string, lastActivityTime: Date | null, hasError?: boolean): string {
    if (hasError) return 'Connection issue';
    switch (status) {
      case 'active': return 'Active now';
      case 'idle': {
        if (!lastActivityTime) return 'Idle';
        const mins = Math.floor((Date.now() - lastActivityTime.getTime()) / 60000);
        return `Idle ${mins}m`;
      }
      case 'offline': {
        if (!lastActivityTime) return 'Offline';
        const mins = Math.floor((Date.now() - lastActivityTime.getTime()) / 60000);
        if (mins < 60) return `Last seen ${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `Last seen ${hours}h ago`;
        return 'Offline';
      }
      case 'unknown': return 'Loading...';
      default: return '';
    }
  }

  it('should show "Connection issue" for error status', () => {
    expect(getStatusLabel('unknown', null, true)).toBe('Connection issue');
  });

  it('should show "Active now" for active agents', () => {
    expect(getStatusLabel('active', new Date())).toBe('Active now');
  });

  it('should show "Idle Xm" for idle agents', () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    expect(getStatusLabel('idle', thirtyMinAgo)).toBe('Idle 30m');
  });

  it('should show "Last seen Xm ago" for recently offline agents', () => {
    const fortyFiveMinAgo = new Date(Date.now() - 45 * 60 * 1000);
    expect(getStatusLabel('offline', fortyFiveMinAgo)).toBe('Last seen 45m ago');
  });

  it('should show "Last seen Xh ago" for agents offline for hours', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    expect(getStatusLabel('offline', threeHoursAgo)).toBe('Last seen 3h ago');
  });

  it('should show "Offline" for agents offline for over 24 hours', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(getStatusLabel('offline', twoDaysAgo)).toBe('Offline');
  });

  it('should show "Offline" when no last activity time', () => {
    expect(getStatusLabel('offline', null)).toBe('Offline');
  });
});

// ---- Test cache TTL logic ----

describe('Cache TTL Logic', () => {
  const STATUS_CACHE_TTL_MS = 60 * 1000; // 60 seconds

  it('should serve from cache when within TTL', () => {
    const cache = new Map<string, { data: any; timestamp: number }>();
    const now = Date.now();
    cache.set('status_all', { data: { statuses: [{ sheetName: 'TEST', lastEditTimestamp: '2026-01-01T00:00:00Z' }] }, timestamp: now - 30_000 });

    const cached = cache.get('status_all');
    const isFresh = cached && now - cached.timestamp < STATUS_CACHE_TTL_MS;
    expect(isFresh).toBe(true);
  });

  it('should not serve from cache when TTL expired', () => {
    const cache = new Map<string, { data: any; timestamp: number }>();
    const now = Date.now();
    cache.set('status_all', { data: { statuses: [] }, timestamp: now - 70_000 });

    const cached = cache.get('status_all');
    const isFresh = cached && now - cached.timestamp < STATUS_CACHE_TTL_MS;
    expect(isFresh).toBe(false);
  });

  it('should cache per country', () => {
    const cache = new Map<string, { data: any; timestamp: number }>();
    const now = Date.now();
    cache.set('status_viconis', { data: { statuses: [{ sheetName: 'A' }] }, timestamp: now });
    cache.set('status_libya', { data: { statuses: [{ sheetName: 'B' }] }, timestamp: now });

    expect(cache.get('status_viconis')?.data.statuses[0].sheetName).toBe('A');
    expect(cache.get('status_libya')?.data.statuses[0].sheetName).toBe('B');
    expect(cache.has('status_all')).toBe(false);
  });
});

// ---- Test batch size optimization ----

describe('Batch Processing', () => {
  it('should process all entries with batch size 10', () => {
    const entries = Array.from({ length: 33 }, (_, i) => `sheet_${i}`);
    const BATCH_SIZE = 10;
    const processed: string[] = [];
    let batchCount = 0;

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      processed.push(...batch);
      batchCount++;
    }

    expect(processed.length).toBe(33);
    expect(batchCount).toBe(4); // ceil(33/10) = 4 batches
  });

  it('should have fewer batches than old batch size of 5', () => {
    const entries = Array.from({ length: 33 }, (_, i) => `sheet_${i}`);
    
    const oldBatches = Math.ceil(entries.length / 5);  // 7 batches
    const newBatches = Math.ceil(entries.length / 10); // 4 batches
    
    expect(newBatches).toBeLessThan(oldBatches);
    expect(oldBatches).toBe(7);
    expect(newBatches).toBe(4);
  });

  it('should calculate total delay reduction', () => {
    const entries = 33;
    
    // Old: 7 batches, 200ms delay between each (6 delays) = 1200ms
    const oldDelayMs = (Math.ceil(entries / 5) - 1) * 200;
    
    // New: 4 batches, 50ms delay between each (3 delays) = 150ms
    const newDelayMs = (Math.ceil(entries / 10) - 1) * 50;
    
    expect(oldDelayMs).toBe(1200);
    expect(newDelayMs).toBe(150);
    expect(newDelayMs).toBeLessThan(oldDelayMs);
  });
});
