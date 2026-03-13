import { useState, useCallback, useEffect, useRef } from 'react';
import { loadDashboardData, type DashboardData, type AgentData } from '@/lib/sheets';
import { trpc } from '@/lib/trpc';
import { useDashboardCache } from '@/contexts/DashboardCacheContext';
import type { DashboardSlug } from '@/App';

const AUTO_REFRESH_INTERVAL = 60 * 1000; // 1 minute

export interface SheetEntry {
  id: string; // local UI id
  dbId?: number; // database id
  url: string;
  name?: string;
  agentCode?: string;
  agentEmail?: string;
}

// ============================================================
// localStorage helpers for sheet URLs — instant load on revisit
// ============================================================
const SHEETS_CACHE_PREFIX = 'sheets_cache_';

function saveSheetsToCacheStorage(country: string, sheets: SheetEntry[]) {
  try {
    const toStore = sheets
      .filter(s => s.url.trim())
      .map(s => ({ id: s.id, dbId: s.dbId, url: s.url, name: s.name, agentCode: s.agentCode, agentEmail: s.agentEmail }));
    localStorage.setItem(SHEETS_CACHE_PREFIX + country, JSON.stringify(toStore));
  } catch { /* quota exceeded or unavailable — non-critical */ }
}

function loadSheetsFromCacheStorage(country: string): SheetEntry[] | null {
  try {
    const raw = localStorage.getItem(SHEETS_CACHE_PREFIX + country);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SheetEntry[];
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].url) return parsed;
    return null;
  } catch { return null; }
}

function clearSheetsCacheStorage(country: string) {
  try { localStorage.removeItem(SHEETS_CACHE_PREFIX + country); } catch {}
}

export function useDashboard(country?: DashboardSlug) {
  const cache = useDashboardCache();
  const countryKey = country || 'algeria';

  // Initialize state from in-memory cache if available
  const cached = cache.getCache(countryKey);

  // Try localStorage cache for sheets (instant — no DB wait)
  const localSheets = loadSheetsFromCacheStorage(countryKey);

  const [sheets, setSheets] = useState<SheetEntry[]>(
    cached?.sheets || localSheets || [{ id: '1', url: '' }]
  );
  const [data, setData] = useState<DashboardData | null>(cached?.data || null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(cached?.autoRefresh ?? true);
  const [nextRefreshIn, setNextRefreshIn] = useState(AUTO_REFRESH_INTERVAL / 1000);
  const [isLive, setIsLive] = useState(cached?.data ? true : false);
  const [refreshCount, setRefreshCount] = useState(0);
  const [dbReady, setDbReady] = useState(cached?.data ? true : false);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sheetsRef = useRef(sheets);
  const countryRef = useRef(country);
  // Track whether we already triggered an immediate load from localStorage
  const immediateLoadTriggered = useRef(false);
  // Ref to hold the latest loadDataFromSheets function — used by setInterval to avoid stale closures
  const loadDataFromSheetsRef = useRef<(sheetsToLoad: SheetEntry[], silent?: boolean) => Promise<void>>(async () => {});

  // tRPC queries and mutations — filter by country
  const sheetsQuery = trpc.sheets.list.useQuery(
    country ? { country } : undefined,
    {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60_000,        // Sheets list rarely changes — stay fresh 5 min
      gcTime: 30 * 60_000,
      refetchOnMount: false,         // Don't refetch when switching back to this dashboard
      placeholderData: (prev: any) => prev,
    }
  );
  const addSheetMutation = trpc.sheets.add.useMutation();
  const deleteSheetMutation = trpc.sheets.delete.useMutation();
  const [filterWarnings, setFilterWarnings] = useState<Record<number, string[]>>({});

  // Keep refs in sync
  useEffect(() => {
    sheetsRef.current = sheets;
  }, [sheets]);

  useEffect(() => {
    countryRef.current = country;
  }, [country]);

  // Save to in-memory cache whenever data or sheets change
  useEffect(() => {
    if (data) {
      cache.setCache(countryKey, {
        data,
        sheets,
        autoRefresh,
        timestamp: Date.now(),
      });
    }
  }, [data, sheets, autoRefresh, countryKey]);

  // Save sheets to localStorage whenever they change (for instant load on next visit)
  useEffect(() => {
    const hasUrls = sheets.some(s => s.url.trim());
    if (hasUrls) {
      saveSheetsToCacheStorage(countryKey, sheets);
    }
  }, [sheets, countryKey]);

  // Load saved sheets from database on mount (only if no cache)
  // Helper: run filter detection in background via Apps Script (zero Google Sheets API quota)
  const runFilterDetection = useCallback((agentIds: number[]) => {
    if (agentIds.length === 0) return;
    const batchInput = JSON.stringify({ "0": { json: { agentIds } } });
    fetch('/api/trpc/leads.detectFilters?batch=1&input=' + encodeURIComponent(batchInput), {
      credentials: 'include',
    })
      .then(res => res.json())
      .then((json: any) => {
        const batchResult = Array.isArray(json) ? json[0] : json;
        const detected = batchResult?.result?.data?.json ?? batchResult?.result?.data ?? {};
        const parsed: Record<number, string[]> = {};
        for (const [key, value] of Object.entries(detected)) {
          const numKey = Number(key);
          if (!isNaN(numKey) && Array.isArray(value)) {
            parsed[numKey] = value as string[];
          }
        }
        setFilterWarnings(parsed);
        const warningCount = Object.keys(parsed).length;
        if (warningCount > 0) {
          console.warn(`[Dashboard] ${warningCount} agent(s) have active sheet filters`);
        }
      })
      .catch((err) => {
        console.warn('[Dashboard] Filter detection failed:', err);
      });
  }, []);

  // IMMEDIATE LOAD from localStorage cache — starts fetching Google Sheets data right away
  // This runs BEFORE the DB query returns, eliminating the 20s+ wait
  useEffect(() => {
    if (immediateLoadTriggered.current) return;
    if (cached?.data) return; // Already have in-memory cache, no need
    if (localSheets && localSheets.length > 0) {
      immediateLoadTriggered.current = true;
      // Start loading immediately — don't wait for DB
      setTimeout(() => {
        loadDataFromSheetsRef.current(localSheets);
      }, 50);
    }
  }, []); // Only on mount

  // When DB query returns — sync sheets (update dbIds, names, etc.) and handle new sheets
  useEffect(() => {
    if (sheetsQuery.data && !dbReady) {
      setDbReady(true);
      if (sheetsQuery.data.length > 0) {
        const dbSheets: SheetEntry[] = sheetsQuery.data.map(s => ({
          id: String(s.id),
          dbId: s.id,
          url: s.sheetUrl,
          name: s.name,
          agentCode: s.agentCode || undefined,
          agentEmail: s.agentEmail || undefined,
        }));
        setSheets(dbSheets);
        // Save updated sheets with dbIds to localStorage
        saveSheetsToCacheStorage(countryKey, dbSheets);

        if (!cached?.data && !immediateLoadTriggered.current) {
          // No localStorage cache existed — this is the first time, load from DB sheets
          immediateLoadTriggered.current = true;
          setTimeout(() => {
            loadDataFromSheetsRef.current(dbSheets);
          }, 300);
        } else if (cached?.data) {
          // Data loaded from in-memory cache — still run filter detection in background
          const agentIds = sheetsQuery.data.map(s => s.id);
          setTimeout(() => runFilterDetection(agentIds), 500);
        }
        // If immediateLoadTriggered is true but no cached data, we're already loading from localStorage
        // The DB sync just updates the sheet entries (dbIds, names) for the manage panel
      } else {
        // DB returned empty (e.g. user not authenticated or no sheets saved yet)
        // If we have localStorage cache, DON'T reset sheets — keep using cached URLs
        // Only reset if there's truly no cached data anywhere
        if (!localSheets || localSheets.length === 0) {
          // No cache at all — show setup screen
          setSheets([{ id: '1', url: '' }]);
        }
        // Otherwise keep the localStorage-loaded sheets intact
      }
    }
  }, [sheetsQuery.data, dbReady, runFilterDetection, countryKey]);

  const addSheet = useCallback(() => {
    setSheets(prev => [...prev, { id: String(Date.now()), url: '' }]);
  }, []);

  const removeSheet = useCallback((id: string) => {
    setSheets(prev => {
      const sheet = prev.find(s => s.id === id);
      // Delete from DB if it has a dbId
      if (sheet?.dbId) {
        deleteSheetMutation.mutate({ id: sheet.dbId });
      }
      const updated = prev.length > 1 ? prev.filter(s => s.id !== id) : [{ id: '1', url: '' }];
      return updated;
    });
  }, [deleteSheetMutation]);

  const updateSheetUrl = useCallback((id: string, url: string) => {
    setSheets(prev => prev.map(s => s.id === id ? { ...s, url } : s));
  }, []);

  // Remove an agent from the loaded dashboard
  const removeAgent = useCallback((agentName: string) => {
    setData(prev => {
      if (!prev) return prev;
      const filtered = prev.agents.filter(a => a.name !== agentName);
      const totalOrders = filtered.reduce((s, a) => s + a.totalOrders, 0);
      const totalConfirmed = filtered.reduce((s, a) => s + a.confirmed, 0);
      const totalCancelled = filtered.reduce((s, a) => s + a.cancelled, 0);
      return {
        ...prev,
        agents: filtered,
        totalOrders,
        totalConfirmed,
        totalCancelled,
        overallConfirmationRate: totalOrders > 0 ? (totalConfirmed / totalOrders) * 100 : 0,
        overallCancellationRate: totalOrders > 0 ? (totalCancelled / totalOrders) * 100 : 0,
      };
    });
  }, []);

  // Remove agent and also remove their sheet URL from DB
  const removeAgentAndSheet = useCallback((agentName: string, sheetUrl: string) => {
    removeAgent(agentName);
    setSheets(prev => {
      const sheet = prev.find(s => s.url.trim() === sheetUrl.trim());
      if (sheet?.dbId) {
        deleteSheetMutation.mutate({ id: sheet.dbId });
      }
      const updated = prev.filter(s => s.url.trim() !== sheetUrl.trim());
      if (updated.length === 0) updated.push({ id: '1', url: '' });
      return updated;
    });
  }, [removeAgent, deleteSheetMutation]);

  // Core data loading function
  const loadDataFromSheets = useCallback(async (sheetsToLoad: SheetEntry[], silent = false) => {
    const urls = sheetsToLoad.map(s => s.url).filter(u => u.trim() !== '');
    if (urls.length === 0) {
      if (!silent) setError('Please add at least one Google Sheet URL.');
      return;
    }

    setLoading(true);
    if (!silent) {
      setError(null);
      setProgress('Loading data...');
    }

    // Fire filter detection in PARALLEL with data loading (don't wait for data first)
    const agentIds = sheetsToLoad
      .filter(s => s.dbId)
      .map(s => s.dbId as number);
    if (agentIds.length > 0) {
      runFilterDetection(agentIds);
    }

    try {
      // Build a URL -> agent name map from DB entries to skip heavy fetchAgentName calls
      const agentNames: Record<string, string> = {};
      for (const sheet of sheetsToLoad) {
        if (sheet.name && sheet.url.trim()) {
          agentNames[sheet.url.trim()] = sheet.name;
        }
      }
      const result = await loadDashboardData(urls, silent ? undefined : setProgress, Object.keys(agentNames).length > 0 ? agentNames : undefined);
      if (result.agents.length === 0) {
        if (!silent) {
          setError('Could not load data from any of the provided sheets. Make sure they are publicly accessible.');
        }
      } else {
        setData(result);
        setIsLive(true);
        setRefreshCount(prev => prev + 1);
      }
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
      if (!silent) setProgress('');
      setNextRefreshIn(AUTO_REFRESH_INTERVAL / 1000);
    }
  }, []);

  // Keep the ref always pointing to the latest function
  useEffect(() => {
    loadDataFromSheetsRef.current = loadDataFromSheets;
  }, [loadDataFromSheets]);

  // Manual load — also saves new sheets to DB
  const loadData = useCallback(async (silent = false) => {
    const currentSheets = sheetsRef.current;
    await loadDataFromSheets(currentSheets, silent);

    // Save new sheets to DB (ones without dbId)
    if (!silent) {
      for (const sheet of currentSheets) {
        if (!sheet.dbId && sheet.url.trim()) {
          try {
            const name = sheet.name || `Agent ${sheet.id}`;
            const result = await addSheetMutation.mutateAsync({
              name,
              sheetUrl: sheet.url.trim(),
              country: countryRef.current,
            });
            if (result) {
              setSheets(prev => prev.map(s =>
                s.id === sheet.id ? { ...s, dbId: result.id, name: result.name } : s
              ));
            }
          } catch {
            console.warn('Failed to save sheet to database');
          }
        }
      }
    }
  }, [loadDataFromSheets, addSheetMutation]);

  // Start countdown timer
  const startCountdown = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setNextRefreshIn(AUTO_REFRESH_INTERVAL / 1000);
    countdownRef.current = setInterval(() => {
      setNextRefreshIn(prev => {
        if (prev <= 1) return AUTO_REFRESH_INTERVAL / 1000;
        return prev - 1;
      });
    }, 1000);
  }, []);

  // ============================================================
  // AUTO-REFRESH LOGIC — uses refs to keep the interval STABLE
  // ============================================================
  useEffect(() => {
    if (!autoRefresh || !isLive) {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      return;
    }

    startCountdown();

    refreshTimerRef.current = setInterval(() => {
      const currentSheets = sheetsRef.current;
      loadDataFromSheetsRef.current(currentSheets, true);
    }, AUTO_REFRESH_INTERVAL);

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [autoRefresh, isLive, startCountdown]);

  const toggleAutoRefresh = useCallback(() => {
    setAutoRefresh(prev => !prev);
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setProgress('');
    setIsLive(false);
    cache.clearCache(countryKey);
    clearSheetsCacheStorage(countryKey);
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, [countryKey]);

  const clearSavedData = useCallback(async () => {
    const currentSheets = sheetsRef.current;
    for (const sheet of currentSheets) {
      if (sheet.dbId) {
        try {
          await deleteSheetMutation.mutateAsync({ id: sheet.dbId });
        } catch {
          // Ignore
        }
      }
    }
    setSheets([{ id: '1', url: '' }]);
    clearSheetsCacheStorage(countryKey);
    reset();
  }, [reset, deleteSheetMutation, countryKey]);

  // Add a new sheet URL and immediately reload
  const addSheetAndReload = useCallback(async (url: string) => {
    const newEntry: SheetEntry = { id: String(Date.now()), url };
    setSheets(prev => [...prev, newEntry]);
    setTimeout(() => loadData(false), 100);
  }, [loadData]);

  return {
    sheets,
    data,
    loading,
    progress,
    error,
    autoRefresh,
    nextRefreshIn,
    isLive,
    addSheet,
    removeSheet,
    updateSheetUrl,
    loadData: () => loadData(false),
    reset,
    removeAgent,
    removeAgentAndSheet,
    toggleAutoRefresh,
    clearSavedData,
    addSheetAndReload,
    refreshCount,
    setSheets,
    refetchSheets: sheetsQuery.refetch,
    filterWarnings,
    dbReady,
    hasSavedSheets: localSheets !== null || (sheetsQuery.data?.length ?? 0) > 0,
  };
}
