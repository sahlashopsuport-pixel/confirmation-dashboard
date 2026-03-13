/**
 * Agent Activity Detection Hook (v3 — Optimized)
 * 
 * Fetches the last edit timestamp per agent from the Drive Activity API
 * via the lightweight `activity.agentStatus` tRPC endpoint.
 * 
 * v3 Optimizations:
 * - Handles `error` flag from server to distinguish "Unknown" (API error) from "Offline" (no edits)
 * - Smarter polling: 90s interval (server caches for 60s, so we always get fresh data)
 * - Keeps previous data visible while refetching (no flicker)
 * - Label updates every 30s to keep "Idle 5m" → "Idle 6m" accurate
 * 
 * Activity levels:
 * - Active (green): Last edit within 15 minutes
 * - Idle (yellow): Last edit 15-60 minutes ago
 * - Offline (gray): No edit for 60+ minutes
 * - Unknown (blue): API error or loading
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { AgentData } from '@/lib/sheets';
import { trpc } from '@/lib/trpc';

export type ActivityStatus = 'active' | 'idle' | 'offline' | 'unknown';

export interface AgentActivityInfo {
  agentName: string;
  status: ActivityStatus;
  lastActivityTime: Date | null;
  statusChanges: number;
  label: string;
  hasError?: boolean; // true if the server couldn't fetch this agent's activity
}

const ACTIVE_THRESHOLD = 15 * 60 * 1000;  // 15 minutes
const IDLE_THRESHOLD = 60 * 60 * 1000;    // 60 minutes

function determineStatus(lastActivityTime: Date | null, now: Date, hasError?: boolean): ActivityStatus {
  if (hasError) return 'unknown';
  if (!lastActivityTime) return 'offline';
  const elapsedMs = now.getTime() - lastActivityTime.getTime();
  if (elapsedMs < ACTIVE_THRESHOLD) return 'active';
  if (elapsedMs < IDLE_THRESHOLD) return 'idle';
  return 'offline';
}

function getStatusLabel(status: ActivityStatus, lastActivityTime: Date | null, hasError?: boolean): string {
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
  }
}

/**
 * @param agents - Current agent data array (used for agent name list)
 * @param refreshCount - Increments on every data refresh (triggers API re-fetch)
 * @param country - Country slug to filter sheets
 */
export function useAgentActivity(agents: AgentData[] | undefined, refreshCount: number, country?: string) {
  const [activityMap, setActivityMap] = useState<Map<string, AgentActivityInfo>>(new Map());

  // Stabilize the country input to avoid infinite re-fetches
  const countryInput = useMemo(() => (country ? { country } : undefined), [country]);

  // Fetch agent status from Drive Activity API
  // Server caches for 60s, so polling at 90s ensures we always get fresh data
  const { data: statusData, isLoading } = trpc.activity.agentStatus.useQuery(
    countryInput,
    {
      refetchInterval: 90_000, // 90s (server cache is 60s, so we always get fresh data)
      staleTime: 45_000,       // Consider data fresh for 45s
      refetchOnWindowFocus: false,
      placeholderData: (prev: any) => prev, // Keep showing previous data while refetching
    }
  );

  // Build the activity map from API data
  useEffect(() => {
    if (!statusData?.statuses) return;

    const now = new Date();
    const newMap = new Map<string, AgentActivityInfo>();

    for (const s of statusData.statuses) {
      const hasError = s.error === true;
      const lastEdit = s.lastEditTimestamp ? new Date(s.lastEditTimestamp) : null;
      const status = determineStatus(lastEdit, now, hasError);
      const label = getStatusLabel(status, lastEdit, hasError);

      newMap.set(s.sheetName, {
        agentName: s.sheetName,
        status,
        lastActivityTime: lastEdit,
        statusChanges: 0,
        label,
        hasError,
      });
    }

    setActivityMap(newMap);
  }, [statusData]);

  // Periodic label update (to keep "Idle 5m" → "Idle 6m" etc.)
  useEffect(() => {
    const interval = setInterval(() => {
      setActivityMap(prev => {
        if (prev.size === 0) return prev;
        const updated = new Map<string, AgentActivityInfo>();
        const now = new Date();
        for (const [name, info] of Array.from(prev.entries())) {
          const newStatus = determineStatus(info.lastActivityTime, now, info.hasError);
          const newLabel = getStatusLabel(newStatus, info.lastActivityTime, info.hasError);
          updated.set(name, {
            ...info,
            status: newStatus,
            label: newLabel,
          });
        }
        return updated;
      });
    }, 30000); // Update labels every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const getActivity = useCallback((agentName: string): AgentActivityInfo => {
    return activityMap.get(agentName) || {
      agentName,
      status: isLoading ? 'unknown' : 'offline',
      lastActivityTime: null,
      statusChanges: 0,
      label: isLoading ? 'Loading...' : 'No data',
      hasError: false,
    };
  }, [activityMap, isLoading]);

  const summary = useMemo(() => ({
    active: Array.from(activityMap.values()).filter(a => a.status === 'active').length,
    idle: Array.from(activityMap.values()).filter(a => a.status === 'idle').length,
    offline: Array.from(activityMap.values()).filter(a => a.status === 'offline').length,
    unknown: Array.from(activityMap.values()).filter(a => a.status === 'unknown').length,
    total: activityMap.size,
  }), [activityMap]);

  return { activityMap, getActivity, summary };
}
