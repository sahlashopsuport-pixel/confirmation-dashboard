/**
 * Work/Break Timeline Tests
 * 
 * Tests the buildTimeline logic that converts shift start/end + breaks
 * into alternating work/break segments for the Activity page.
 */

import { describe, it, expect } from 'vitest';

// ---- Replicate the pure logic from the frontend component ----

interface TimelineSegment {
  type: 'work' | 'break';
  start: string;
  end: string;
  durationMin: number;
}

function buildTimeline(
  shiftStart: string,
  shiftEnd: string,
  breaks: Array<{ start: string; end: string; durationMin: number }>
): TimelineSegment[] {
  if (breaks.length === 0) {
    const durationMin = Math.round((new Date(shiftEnd).getTime() - new Date(shiftStart).getTime()) / 60000);
    return [{ type: 'work', start: shiftStart, end: shiftEnd, durationMin }];
  }

  const segments: TimelineSegment[] = [];
  const sortedBreaks = [...breaks].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  let cursor = shiftStart;
  for (const brk of sortedBreaks) {
    const workStart = cursor;
    const workEnd = brk.start;
    const workDur = Math.round((new Date(workEnd).getTime() - new Date(workStart).getTime()) / 60000);
    if (workDur > 0) {
      segments.push({ type: 'work', start: workStart, end: workEnd, durationMin: workDur });
    }
    segments.push({ type: 'break', start: brk.start, end: brk.end, durationMin: brk.durationMin });
    cursor = brk.end;
  }

  const finalDur = Math.round((new Date(shiftEnd).getTime() - new Date(cursor).getTime()) / 60000);
  if (finalDur > 0) {
    segments.push({ type: 'work', start: cursor, end: shiftEnd, durationMin: finalDur });
  }

  return segments;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ---- Tests ----

describe('buildTimeline', () => {
  it('returns single work segment when no breaks', () => {
    const segments = buildTimeline(
      '2026-02-25T08:00:00.000Z',
      '2026-02-25T17:00:00.000Z',
      []
    );
    expect(segments).toHaveLength(1);
    expect(segments[0].type).toBe('work');
    expect(segments[0].durationMin).toBe(540); // 9 hours
  });

  it('splits into work-break-work with one break', () => {
    const segments = buildTimeline(
      '2026-02-25T08:00:00.000Z',
      '2026-02-25T17:00:00.000Z',
      [{ start: '2026-02-25T12:00:00.000Z', end: '2026-02-25T13:00:00.000Z', durationMin: 60 }]
    );
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ type: 'work', start: '2026-02-25T08:00:00.000Z', end: '2026-02-25T12:00:00.000Z', durationMin: 240 });
    expect(segments[1]).toEqual({ type: 'break', start: '2026-02-25T12:00:00.000Z', end: '2026-02-25T13:00:00.000Z', durationMin: 60 });
    expect(segments[2]).toEqual({ type: 'work', start: '2026-02-25T13:00:00.000Z', end: '2026-02-25T17:00:00.000Z', durationMin: 240 });
  });

  it('handles multiple breaks correctly', () => {
    const segments = buildTimeline(
      '2026-02-25T08:00:00.000Z',
      '2026-02-25T18:00:00.000Z',
      [
        { start: '2026-02-25T10:00:00.000Z', end: '2026-02-25T10:30:00.000Z', durationMin: 30 },
        { start: '2026-02-25T13:00:00.000Z', end: '2026-02-25T14:00:00.000Z', durationMin: 60 },
        { start: '2026-02-25T16:00:00.000Z', end: '2026-02-25T16:15:00.000Z', durationMin: 15 },
      ]
    );
    // work-break-work-break-work-break-work = 7 segments
    expect(segments).toHaveLength(7);
    expect(segments.filter(s => s.type === 'work')).toHaveLength(4);
    expect(segments.filter(s => s.type === 'break')).toHaveLength(3);

    // First work: 8:00 → 10:00 = 120 min
    expect(segments[0].durationMin).toBe(120);
    // First break: 10:00 → 10:30 = 30 min
    expect(segments[1].durationMin).toBe(30);
    // Second work: 10:30 → 13:00 = 150 min
    expect(segments[2].durationMin).toBe(150);
    // Second break: 13:00 → 14:00 = 60 min
    expect(segments[3].durationMin).toBe(60);
    // Third work: 14:00 → 16:00 = 120 min
    expect(segments[4].durationMin).toBe(120);
    // Third break: 16:00 → 16:15 = 15 min
    expect(segments[5].durationMin).toBe(15);
    // Final work: 16:15 → 18:00 = 105 min
    expect(segments[6].durationMin).toBe(105);
  });

  it('handles break at the very start of shift (no leading work)', () => {
    const segments = buildTimeline(
      '2026-02-25T08:00:00.000Z',
      '2026-02-25T12:00:00.000Z',
      [{ start: '2026-02-25T08:00:00.000Z', end: '2026-02-25T08:30:00.000Z', durationMin: 30 }]
    );
    // break-work = 2 segments (no leading 0-min work)
    expect(segments).toHaveLength(2);
    expect(segments[0].type).toBe('break');
    expect(segments[1].type).toBe('work');
    expect(segments[1].durationMin).toBe(210); // 3.5 hours
  });

  it('handles break at the very end of shift (no trailing work)', () => {
    const segments = buildTimeline(
      '2026-02-25T08:00:00.000Z',
      '2026-02-25T12:00:00.000Z',
      [{ start: '2026-02-25T11:30:00.000Z', end: '2026-02-25T12:00:00.000Z', durationMin: 30 }]
    );
    // work-break = 2 segments (no trailing 0-min work)
    expect(segments).toHaveLength(2);
    expect(segments[0].type).toBe('work');
    expect(segments[0].durationMin).toBe(210); // 3.5 hours
    expect(segments[1].type).toBe('break');
  });

  it('sorts unsorted breaks correctly', () => {
    const segments = buildTimeline(
      '2026-02-25T08:00:00.000Z',
      '2026-02-25T17:00:00.000Z',
      [
        { start: '2026-02-25T14:00:00.000Z', end: '2026-02-25T14:30:00.000Z', durationMin: 30 },
        { start: '2026-02-25T10:00:00.000Z', end: '2026-02-25T10:20:00.000Z', durationMin: 20 },
      ]
    );
    // work-break-work-break-work = 5
    expect(segments).toHaveLength(5);
    // First break should be the 10:00 one (sorted)
    expect(segments[1].start).toBe('2026-02-25T10:00:00.000Z');
    expect(segments[3].start).toBe('2026-02-25T14:00:00.000Z');
  });

  it('total work + break durations equal total span', () => {
    const shiftStart = '2026-02-25T09:00:00.000Z';
    const shiftEnd = '2026-02-25T21:00:00.000Z';
    const breaks = [
      { start: '2026-02-25T12:30:00.000Z', end: '2026-02-25T14:00:00.000Z', durationMin: 90 },
      { start: '2026-02-25T17:00:00.000Z', end: '2026-02-25T19:00:00.000Z', durationMin: 120 },
    ];
    const segments = buildTimeline(shiftStart, shiftEnd, breaks);
    const totalMin = segments.reduce((sum, s) => sum + s.durationMin, 0);
    const expectedMin = (new Date(shiftEnd).getTime() - new Date(shiftStart).getTime()) / 60000;
    expect(totalMin).toBe(expectedMin);
  });
});

describe('formatDuration', () => {
  it('formats minutes under 60 as Xm', () => {
    expect(formatDuration(5)).toBe('5m');
    expect(formatDuration(30)).toBe('30m');
    expect(formatDuration(59)).toBe('59m');
  });

  it('formats exact hours without minutes', () => {
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(480)).toBe('8h');
  });

  it('formats hours and minutes together', () => {
    expect(formatDuration(90)).toBe('1h 30m');
    expect(formatDuration(150)).toBe('2h 30m');
    expect(formatDuration(505)).toBe('8h 25m');
  });

  it('handles zero', () => {
    expect(formatDuration(0)).toBe('0m');
  });
});
