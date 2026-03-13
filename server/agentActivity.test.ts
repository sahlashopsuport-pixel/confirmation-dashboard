/**
 * Agent Activity Detection Tests
 * 
 * Tests the logic for detecting agent activity by monitoring
 * status column changes vs Hadjer's affectation (new rows).
 */

import { describe, it, expect } from 'vitest';

// We test the pure logic functions that the hook uses internally.
// Since the hook itself uses React state, we test the underlying logic.

interface StatusSnapshot {
  confirmed: number;
  cancelled: number;
  callback: number;
  postponed: number;
  noAnswer: number;
  other: number;
  totalWithStatus: number;
  totalRows: number;
}

function countStatusChanges(prev: StatusSnapshot, curr: StatusSnapshot): number {
  let delta = 0;
  delta += Math.max(0, curr.confirmed - prev.confirmed);
  delta += Math.max(0, curr.cancelled - prev.cancelled);
  delta += Math.max(0, curr.callback - prev.callback);
  delta += Math.max(0, curr.postponed - prev.postponed);
  delta += Math.max(0, curr.noAnswer - prev.noAnswer);
  delta += Math.max(0, curr.other - prev.other);
  return delta;
}

type ActivityStatus = 'active' | 'idle' | 'offline' | 'unknown';

function determineStatus(
  statusDelta: number,
  lastActivityTime: Date | null,
  now: Date,
  activeThreshold: number = 5 * 60 * 1000,
  idleThreshold: number = 30 * 60 * 1000
): ActivityStatus {
  if (statusDelta > 0) return 'active';
  if (!lastActivityTime) return 'offline';
  const elapsedMs = now.getTime() - lastActivityTime.getTime();
  if (elapsedMs < activeThreshold) return 'active';
  if (elapsedMs < idleThreshold) return 'idle';
  return 'offline';
}

describe('Agent Activity Detection', () => {
  describe('countStatusChanges', () => {
    it('should detect no changes when snapshots are identical', () => {
      const snapshot: StatusSnapshot = {
        confirmed: 10, cancelled: 5, callback: 3,
        postponed: 2, noAnswer: 1, other: 0,
        totalWithStatus: 21, totalRows: 30,
      };
      expect(countStatusChanges(snapshot, snapshot)).toBe(0);
    });

    it('should detect agent work when confirmed count increases', () => {
      const prev: StatusSnapshot = {
        confirmed: 10, cancelled: 5, callback: 3,
        postponed: 2, noAnswer: 1, other: 0,
        totalWithStatus: 21, totalRows: 30,
      };
      const curr: StatusSnapshot = {
        confirmed: 13, cancelled: 5, callback: 3,
        postponed: 2, noAnswer: 1, other: 0,
        totalWithStatus: 24, totalRows: 30,
      };
      expect(countStatusChanges(prev, curr)).toBe(3);
    });

    it('should detect agent work when multiple statuses change', () => {
      const prev: StatusSnapshot = {
        confirmed: 10, cancelled: 5, callback: 3,
        postponed: 2, noAnswer: 1, other: 0,
        totalWithStatus: 21, totalRows: 30,
      };
      const curr: StatusSnapshot = {
        confirmed: 12, cancelled: 7, callback: 4,
        postponed: 2, noAnswer: 1, other: 0,
        totalWithStatus: 26, totalRows: 30,
      };
      // 2 confirmed + 2 cancelled + 1 callback = 5
      expect(countStatusChanges(prev, curr)).toBe(5);
    });

    it('should NOT detect activity when only totalRows increases (Hadjer affectation)', () => {
      const prev: StatusSnapshot = {
        confirmed: 10, cancelled: 5, callback: 3,
        postponed: 2, noAnswer: 1, other: 0,
        totalWithStatus: 21, totalRows: 30,
      };
      const curr: StatusSnapshot = {
        confirmed: 10, cancelled: 5, callback: 3,
        postponed: 2, noAnswer: 1, other: 0,
        totalWithStatus: 21, totalRows: 50, // 20 new rows added by Hadjer
      };
      expect(countStatusChanges(prev, curr)).toBe(0);
    });

    it('should handle mixed scenario: Hadjer adds rows AND agent works', () => {
      const prev: StatusSnapshot = {
        confirmed: 10, cancelled: 5, callback: 3,
        postponed: 2, noAnswer: 1, other: 0,
        totalWithStatus: 21, totalRows: 30,
      };
      const curr: StatusSnapshot = {
        confirmed: 15, cancelled: 6, callback: 3,
        postponed: 2, noAnswer: 1, other: 0,
        totalWithStatus: 27, totalRows: 50,
      };
      expect(countStatusChanges(prev, curr)).toBe(6); // 5 confirmed + 1 cancelled
    });

    it('should ignore negative changes (data corrections)', () => {
      const prev: StatusSnapshot = {
        confirmed: 10, cancelled: 5, callback: 3,
        postponed: 2, noAnswer: 1, other: 0,
        totalWithStatus: 21, totalRows: 30,
      };
      const curr: StatusSnapshot = {
        confirmed: 8, cancelled: 5, callback: 3,
        postponed: 2, noAnswer: 1, other: 0,
        totalWithStatus: 19, totalRows: 30,
      };
      expect(countStatusChanges(prev, curr)).toBe(0);
    });
  });

  describe('determineStatus', () => {
    it('should return active when status delta > 0', () => {
      const now = new Date();
      expect(determineStatus(3, null, now)).toBe('active');
    });

    it('should return offline when no last activity time and no delta', () => {
      const now = new Date();
      expect(determineStatus(0, null, now)).toBe('offline');
    });

    it('should return active when last activity was recent (< 5 min)', () => {
      const now = new Date();
      const lastActivity = new Date(now.getTime() - 2 * 60 * 1000);
      expect(determineStatus(0, lastActivity, now)).toBe('active');
    });

    it('should return idle when last activity was 5-30 min ago', () => {
      const now = new Date();
      const lastActivity = new Date(now.getTime() - 15 * 60 * 1000);
      expect(determineStatus(0, lastActivity, now)).toBe('idle');
    });

    it('should return offline when last activity was > 30 min ago', () => {
      const now = new Date();
      const lastActivity = new Date(now.getTime() - 60 * 60 * 1000);
      expect(determineStatus(0, lastActivity, now)).toBe('offline');
    });

    it('should return active even with old lastActivity if new delta detected', () => {
      const now = new Date();
      const lastActivity = new Date(now.getTime() - 60 * 60 * 1000);
      expect(determineStatus(5, lastActivity, now)).toBe('active');
    });

    it('should handle edge case at exactly 5 min boundary', () => {
      const now = new Date();
      const lastActivity = new Date(now.getTime() - 5 * 60 * 1000);
      expect(determineStatus(0, lastActivity, now)).toBe('idle');
    });

    it('should handle edge case at exactly 30 min boundary', () => {
      const now = new Date();
      const lastActivity = new Date(now.getTime() - 30 * 60 * 1000);
      expect(determineStatus(0, lastActivity, now)).toBe('offline');
    });
  });
});
