import { createContext, useContext, useRef, useCallback } from 'react';
import type { DashboardData } from '@/lib/sheets';
import type { DashboardSlug } from '@/App';

interface CachedDashboard {
  data: DashboardData;
  sheets: Array<{ id: string; dbId?: number; url: string; name?: string; agentCode?: string }>;
  autoRefresh: boolean;
  timestamp: number;
}

interface DashboardCacheContextType {
  getCache: (country: DashboardSlug) => CachedDashboard | null;
  setCache: (country: DashboardSlug, cache: CachedDashboard) => void;
  clearCache: (country: DashboardSlug) => void;
}

const DashboardCacheContext = createContext<DashboardCacheContextType | null>(null);

export function DashboardCacheProvider({ children }: { children: React.ReactNode }) {
  const cacheRef = useRef<Map<DashboardSlug, CachedDashboard>>(new Map());

  const getCache = useCallback((country: DashboardSlug): CachedDashboard | null => {
    return cacheRef.current.get(country) || null;
  }, []);

  const setCache = useCallback((country: DashboardSlug, cache: CachedDashboard) => {
    cacheRef.current.set(country, cache);
  }, []);

  const clearCache = useCallback((country: DashboardSlug) => {
    cacheRef.current.delete(country);
  }, []);

  return (
    <DashboardCacheContext.Provider value={{ getCache, setCache, clearCache }}>
      {children}
    </DashboardCacheContext.Provider>
  );
}

export function useDashboardCache() {
  const ctx = useContext(DashboardCacheContext);
  if (!ctx) throw new Error('useDashboardCache must be used within DashboardCacheProvider');
  return ctx;
}
