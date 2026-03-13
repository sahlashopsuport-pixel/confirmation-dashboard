import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for user activity tracking logic.
 * We test the status classification and time-ago formatting.
 */

// Status classification logic (mirrors getAllDashboardUsersActivity)
function classifyStatus(lastActiveAt: Date | null): 'online' | 'away' | 'offline' {
  if (!lastActiveAt) return 'offline';
  const diff = Date.now() - lastActiveAt.getTime();
  if (diff < 5 * 60 * 1000) return 'online';       // < 5 min
  if (diff < 30 * 60 * 1000) return 'away';          // 5-30 min
  return 'offline';
}

// Time-ago formatting (mirrors ActiveUsers component)
function formatTimeAgo(date: Date | null): string {
  if (!date) return 'Never';
  const now = Date.now();
  const diff = now - date.getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  if (diff < 604800_000) return `${Math.floor(diff / 86400_000)}d ago`;
  return date.toLocaleDateString();
}

describe('User Activity — Status Classification', () => {
  it('should classify null lastActiveAt as offline', () => {
    expect(classifyStatus(null)).toBe('offline');
  });

  it('should classify activity within 5 minutes as online', () => {
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);
    expect(classifyStatus(twoMinAgo)).toBe('online');
  });

  it('should classify activity exactly at 5 minutes as away', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    expect(classifyStatus(fiveMinAgo)).toBe('away');
  });

  it('should classify activity at 15 minutes as away', () => {
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
    expect(classifyStatus(fifteenMinAgo)).toBe('away');
  });

  it('should classify activity at 30 minutes as offline', () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    expect(classifyStatus(thirtyMinAgo)).toBe('offline');
  });

  it('should classify activity from yesterday as offline', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(classifyStatus(yesterday)).toBe('offline');
  });

  it('should classify just-now activity as online', () => {
    const justNow = new Date();
    expect(classifyStatus(justNow)).toBe('online');
  });
});

describe('User Activity — Time Ago Formatting', () => {
  it('should return "Never" for null date', () => {
    expect(formatTimeAgo(null)).toBe('Never');
  });

  it('should return "Just now" for activity within 1 minute', () => {
    const tenSecsAgo = new Date(Date.now() - 10_000);
    expect(formatTimeAgo(tenSecsAgo)).toBe('Just now');
  });

  it('should return minutes for activity within 1 hour', () => {
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000);
    expect(formatTimeAgo(twentyMinAgo)).toBe('20m ago');
  });

  it('should return hours for activity within 1 day', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    expect(formatTimeAgo(threeHoursAgo)).toBe('3h ago');
  });

  it('should return days for activity within 1 week', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(formatTimeAgo(twoDaysAgo)).toBe('2d ago');
  });

  it('should return formatted date for activity older than 1 week', () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const result = formatTimeAgo(twoWeeksAgo);
    // Should be a date string, not "Xd ago"
    expect(result).not.toContain('ago');
    expect(result).not.toBe('Never');
  });
});

describe('User Activity — Throttle Logic', () => {
  it('should only write once per 30 seconds per user (conceptual)', () => {
    // The throttle map prevents DB writes within 30s of the last write
    const THROTTLE_MS = 30_000;
    const lastTouchMap = new Map<number, number>();
    
    function shouldWrite(userId: number): boolean {
      const now = Date.now();
      const lastTouch = lastTouchMap.get(userId) || 0;
      if (now - lastTouch < THROTTLE_MS) return false;
      lastTouchMap.set(userId, now);
      return true;
    }

    // First call should write
    expect(shouldWrite(1)).toBe(true);
    // Immediate second call should skip
    expect(shouldWrite(1)).toBe(false);
    // Different user should write
    expect(shouldWrite(2)).toBe(true);
  });
});
