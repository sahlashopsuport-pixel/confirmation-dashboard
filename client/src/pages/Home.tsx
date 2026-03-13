/**
 * Confirmation Dashboard — Clean Light Theme (Live Platform)
 * 
 * Design: White/light gray base, blue primary, colorful status badges.
 * Typography: DM Sans body, JetBrains Mono for data.
 * Features: Auto-refresh, persistent URLs, delete agents, live status, multi-country.
 */


import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3,
  Users,
  CheckCircle,
  XCircle,
  Percent,
  ArrowUpRight,
  RefreshCw,
  TrendingUp,
  Clock,
  Settings,
  Trash2,
  Plus,
  Radio,
  Wifi,
  WifiOff,
  ExternalLink,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Pencil, Check, ShieldCheck, ShieldAlert, Loader2, AlertTriangle, Activity } from 'lucide-react';
import { useDashboard } from '@/hooks/useDashboard';
import SheetInput from '@/components/SheetInput';
import KpiCard from '@/components/KpiCard';
import AgentTable from '@/components/AgentTable';
import StatusChart from '@/components/StatusChart';
import WeeklyChart from '@/components/WeeklyChart';
import AgentDetail from '@/components/AgentDetail';
import TypeBreakdown from '@/components/TypeBreakdown';
import { filterDashboardByProductNames, filterDashboardByDate, filterDashboardExcludeOrganic, getAvailableDates, getUniqueProductNames, type AgentData, type DashboardData } from '@/lib/sheets';
import ProductNameFilter from '@/components/ProductNameFilter';
import DateRangePicker, { type DateRange } from '@/components/DateRangePicker';
import { DASHBOARDS, type DashboardSlug } from '@/App';
import { Filter } from 'lucide-react';
import { useAgentActivity } from '@/hooks/useAgentActivity';
import ActivityIndicator, { ActivitySummaryBar } from '@/components/ActivityIndicator';

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Country config for colors
const COUNTRY_CONFIG: Record<DashboardSlug, { label: string; accent: string; accentBg: string }> = {
  algeria: { label: 'Algeria', accent: 'text-blue-600', accentBg: 'bg-blue-500' },
  viconis: { label: 'Viconis', accent: 'text-purple-600', accentBg: 'bg-purple-500' },
  libya: { label: 'Libya', accent: 'text-emerald-600', accentBg: 'bg-emerald-500' },
  tunisia: { label: 'Tunisia', accent: 'text-orange-600', accentBg: 'bg-orange-500' },
};

interface HomeProps {
  country?: DashboardSlug;
}

export default function Home({ country = 'algeria' }: HomeProps) {
  const config = COUNTRY_CONFIG[country];

  const {
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
    loadData,
    reset,
    removeAgent,
    removeAgentAndSheet,
    toggleAutoRefresh,
    clearSavedData,
    addSheetAndReload,
    refreshCount,
    setSheets,
    refetchSheets,
    filterWarnings,
    dbReady,
    hasSavedSheets,
  } = useDashboard(country);

  const [selectedAgent, setSelectedAgent] = useState<AgentData | null>(null);
  const [showManagePanel, setShowManagePanel] = useState(false);
  const [newSheetUrl, setNewSheetUrl] = useState('');
  const [editingAgent, setEditingAgent] = useState<string | null>(null); // sheetUrl of agent being edited
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<Record<string, 'checking' | 'ok' | 'error' | 'readonly'>>({});
  const connectionCacheRef = useRef<Record<string, { status: 'ok' | 'error' | 'readonly'; timestamp: number }>>({});
  const CONNECTION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // tRPC mutations for agent management
  const updateSheetMutation = trpc.sheets.update.useMutation();
  const testConnectionMutation = trpc.leads.testConnection.useMutation();

  // Find DB entry for an agent by matching sheet URL
  const findDbEntry = useCallback((sheetUrl: string) => {
    return sheets.find(s => s.url.trim() === sheetUrl.trim());
  }, [sheets]);

  const startEditAgent = useCallback((agent: AgentData) => {
    setEditingAgent(agent.sheetUrl);
    const dbEntry = findDbEntry(agent.sheetUrl);
    setEditName(dbEntry?.name || agent.name);
    setEditCode(dbEntry?.agentCode || '');
    setEditEmail(dbEntry?.agentEmail || '');
  }, [findDbEntry]);

  const saveAgentEdit = useCallback(async (agent: AgentData) => {
    const dbEntry = findDbEntry(agent.sheetUrl);
    if (!dbEntry?.dbId) return;
    const newName = editName.trim() || agent.name;
    const newCode = editCode.trim() || undefined;
    const newEmail = editEmail.trim() || undefined;
    try {
      await updateSheetMutation.mutateAsync({
        id: dbEntry.dbId,
        name: newName,
        agentCode: newCode,
        agentEmail: newEmail || null,
      });
      // Update local sheets state immediately for instant feedback
      setSheets((prev: any[]) => prev.map((s: any) =>
        s.dbId === dbEntry.dbId ? { ...s, name: newName, agentCode: newCode, agentEmail: newEmail } : s
      ));
      setEditingAgent(null);
      // Refetch from DB to stay in sync
      refetchSheets();
    } catch (err) {
      console.error('Failed to update agent:', err);
    }
  }, [findDbEntry, editName, editCode, updateSheetMutation, setSheets, refetchSheets]);

  const checkConnection = useCallback(async (sheetUrl: string, forceRefresh = false) => {
    // Check cache first (skip if force refresh)
    if (!forceRefresh) {
      const cached = connectionCacheRef.current[sheetUrl];
      if (cached && Date.now() - cached.timestamp < CONNECTION_CACHE_TTL) {
        setConnectionStatus(prev => ({ ...prev, [sheetUrl]: cached.status }));
        return;
      }
    }
    setConnectionStatus(prev => ({ ...prev, [sheetUrl]: 'checking' }));
    
    // Try up to 2 times on failure
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await testConnectionMutation.mutateAsync({ sheetUrl });
        let status: 'ok' | 'error' | 'readonly' = 'error';
        if (result.success) {
          status = 'ok';
        } else if (result.canRead && !result.canWrite) {
          status = 'readonly';
        }
        connectionCacheRef.current[sheetUrl] = { status, timestamp: Date.now() };
        setConnectionStatus(prev => ({ ...prev, [sheetUrl]: status }));
        return; // Success, exit
      } catch {
        if (attempt === 0) {
          // Wait 1s before retry
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        setConnectionStatus(prev => ({ ...prev, [sheetUrl]: 'error' }));
      }
    }
  }, [testConnectionMutation, CONNECTION_CACHE_TTL]);

  const checkAllConnections = useCallback(async (forceRefresh = false) => {
    if (!data) return;
    // Stagger checks to avoid overwhelming the API
    for (const agent of data.agents) {
      checkConnection(agent.sheetUrl, forceRefresh);
      // Small delay between checks to reduce rate limiting
      await new Promise(r => setTimeout(r, 300));
    }
  }, [data, checkConnection]);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [excludeOrganic, setExcludeOrganic] = useState(false);
  const [organicStats, setOrganicStats] = useState<Map<string, { total: number; confirmed: number; confirmationRate: number; cancellationRate: number }>>(new Map());

  // Available dates for the date picker (from raw data, before any filters)
  const availableDates = useMemo(() => {
    if (!data) return [];
    return getAvailableDates(data);
  }, [data]);

  // Unique product names from raw data (before any filters)
  const uniqueProducts = useMemo(() => {
    if (!data) return [];
    return getUniqueProductNames(data);
  }, [data]);

  // Stabilize selectedProducts reference to avoid unnecessary re-renders
  const selectedProductsKey = useMemo(() => Array.from(selectedProducts).sort().join('|'), [selectedProducts]);

  // Apply product filter then date filter then organic filter to dashboard data — must be before early return to keep hooks order stable
  const [filteredData, setFilteredData] = useState<DashboardData | null>(null);
  useEffect(() => {
    if (!data) { setFilteredData(null); return; }
    let cancelled = false;
    (async () => {
      let result = await filterDashboardByProductNames(data, selectedProducts);
      if (dateRange) {
        result = await filterDashboardByDate(result, { from: dateRange.from, to: dateRange.to });
      }
      if (excludeOrganic) {
        const withOrganic = await filterDashboardExcludeOrganic(result);
        if (!cancelled) {
          setOrganicStats(withOrganic.organicStats);
          setFilteredData(withOrganic);
        }
      } else {
        if (!cancelled) {
          setOrganicStats(new Map());
          setFilteredData(result);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [data, selectedProductsKey, dateRange, excludeOrganic]);

  // Agent activity tracking — powered by Drive Activity API for instant status
  const { getActivity, summary: activitySummary } = useAgentActivity(data?.agents, refreshCount, country);

  // Untreated leads count per agent — build agent ID list from sheets with dbId
  // Stabilize reference: only recalculate when the actual IDs change (not on every sheets array mutation)
  const agentIdsRaw = sheets.filter(s => s.dbId).map(s => s.dbId!);
  const agentIdsKey = agentIdsRaw.join(',');
  const agentIds = useMemo(() => agentIdsRaw, [agentIdsKey]);
  const agentIdMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of sheets) {
      if (s.dbId && s.url) map[s.url.trim()] = s.dbId;
    }
    return map;
  }, [sheets]);
  const { data: untreatedCounts } = trpc.leads.untreatedCounts.useQuery(
    { agentIds },
    {
      enabled: agentIds.length > 0,
      refetchInterval: autoRefresh ? 60000 : false,
      staleTime: 30_000,
      placeholderData: (prev: any) => prev, // Keep showing previous counts while refetching
    }
  );

  // Build a map of sheetUrl → list of tabs with active filters
  // MUST be before early return to keep hooks order stable across renders
  const filterWarningsByUrl = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const s of sheets) {
      if (s.dbId && filterWarnings[s.dbId]) {
        map[s.url.trim()] = filterWarnings[s.dbId];
      }
    }
    return map;
  }, [sheets, filterWarnings]);
  const filterWarningCount = Object.keys(filterWarningsByUrl).length;

  // Delivery rates for Algeria agents (from EcoTrack data)
  // Date filter applies to both confirmation and delivery data
  const isAlgeria = country === 'algeria';
  const deliveryDateFrom = useMemo(() => {
    if (!dateRange) return undefined;
    const parts = dateRange.from.split('/');
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return undefined;
  }, [dateRange]);
  const deliveryDateTo = useMemo(() => {
    if (!dateRange) return undefined;
    const parts = dateRange.to.split('/');
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return undefined;
  }, [dateRange]);
  const deliveryInput = useMemo(() => {
    return { dateFrom: deliveryDateFrom, dateTo: deliveryDateTo };
  }, [deliveryDateFrom, deliveryDateTo]);
  const { data: deliveryRates } = trpc.delivery.agentRates.useQuery(
    deliveryInput,
    {
      enabled: isAlgeria,
      staleTime: 60_000,
      placeholderData: (prev: any) => prev,
    }
  );


  // Compute global team performance (Worked Conf Rate × Delivery Rate) for Algeria
  // Must be above early return to maintain consistent hook call order
  const workedConfRateForPerf = filteredData?.overallWorkedConfirmationRate ?? filteredData?.overallConfirmationRate ?? 0;
  const teamPerformance = useMemo(() => {
    if (!isAlgeria || !deliveryRates) return null;
    let totalDelivered = 0;
    let totalShipped = 0;
    for (const stats of Object.values(deliveryRates)) {
      totalDelivered += stats.delivered;
      totalShipped += stats.total;
    }
    if (totalShipped === 0) return null;
    const overallDelRate = (totalDelivered / totalShipped) * 100;
    const perf = (workedConfRateForPerf / 100) * (overallDelRate / 100) * 100;
    return { perf, delRate: overallDelRate };
  }, [isAlgeria, deliveryRates, workedConfRateForPerf]);

  if (!data || !filteredData) {
    return (
      <SheetInput
        sheets={sheets}
        loading={loading}
        progress={progress}
        error={error}
        onAddSheet={addSheet}
        onRemoveSheet={removeSheet}
        onUpdateUrl={updateSheetUrl}
        onLoadData={loadData}
        countryLabel={config.label}
      />
    );
  }

  const topAgent = [...filteredData.agents].sort((a, b) => b.leadScore - a.leadScore)[0];
  const avgConfRate = filteredData.overallConfirmationRate;
  const workedConfRate = filteredData.overallWorkedConfirmationRate ?? avgConfRate;
  const totalNoStatus = filteredData.totalNoStatus ?? 0;
  const isViconis = country === 'viconis';
  const hasTypeData = isViconis && filteredData.normalTotalOrders > 0;
  const normalConfRate = filteredData.normalConfirmationRate;

  const isProductFiltered = selectedProducts.size > 0;
  const isDateFiltered = dateRange !== null;
  const isFiltered = isProductFiltered || isDateFiltered || excludeOrganic;
  const activeProductLabel = isProductFiltered
    ? (selectedProducts.size <= 2
        ? Array.from(selectedProducts).join(', ')
        : `${selectedProducts.size} products`)
    : '';
  const activeDateLabel = dateRange?.label || '';

  const handleAddNewSheet = () => {
    if (newSheetUrl.trim()) {
      addSheetAndReload(newSheetUrl.trim());
      setNewSheetUrl('');
    }
  };

  return (
    <>
      {/* Dashboard Header */}
      <header className="sticky top-12 z-40 border-b border-border/60 bg-card/95 backdrop-blur-lg shadow-sm">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className={`h-7 w-7 rounded-lg ${config.accentBg} flex items-center justify-center`}>
                <BarChart3 className="h-3.5 w-3.5 text-white" />
              </div>
              <h1 className="text-sm font-bold text-foreground">
                {config.label} Dashboard
              </h1>
            </div>
            {/* Live indicator */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-light border border-green/20">
              <div className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green" />
              </div>
              <span className="text-[10px] font-semibold text-green uppercase tracking-wider">Live</span>
            </div>
            {/* Agent Activity Summary */}
            <ActivitySummaryBar summary={activitySummary} />
            {/* Filter Warning Badge */}
            {filterWarningCount > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-300/50" title={`${filterWarningCount} agent(s) have active sheet filters — data may be incomplete`}>
                <svg className="h-3 w-3 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
                <span className="text-[10px] font-semibold text-amber-600">{filterWarningCount} filtered</span>
              </div>
            )}


          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
              {autoRefresh ? (
                <>
                  <Wifi className="h-3 w-3 text-green" />
                  <span className="font-data">Next refresh: {formatCountdown(nextRefreshIn)}</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3 text-muted-foreground" />
                  <span>Auto-refresh off</span>
                </>
              )}
            </div>
            <div className="h-4 w-px bg-border hidden sm:block" />
            <span className="text-xs text-muted-foreground font-data hidden md:inline">
              {filteredData.agents.length} agent{filteredData.agents.length !== 1 ? 's' : ''} · {filteredData.totalOrders.toLocaleString()} orders
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowManagePanel(true)}
              className="h-8 text-xs rounded-lg"
            >
              <Settings className="mr-1.5 h-3 w-3" />
              Manage
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={loading}
              className="h-8 text-xs rounded-lg"
            >
              <RefreshCw className={`mr-1.5 h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      {/* Loading bar */}
      {loading && (
        <div className="h-1 bg-secondary overflow-hidden">
          <motion.div
            className={`h-full ${config.accentBg}`}
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 15, ease: 'linear' }}
          />
        </div>
      )}

      <main className="container py-6 space-y-5">
        {/* Filter Bar: Product + Date */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Product Name Filter (multi-select from actual data) */}
          {uniqueProducts.length > 0 && (
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <ProductNameFilter
                products={uniqueProducts}
                selected={selectedProducts}
                onChange={setSelectedProducts}
              />
            </div>
          )}

          {/* Date Range Filter */}
          {availableDates.length > 0 && (
            <DateRangePicker
              availableDates={availableDates}
              value={dateRange}
              onChange={setDateRange}
            />
          )}

          {/* Exclude Organic Toggle */}
          <button
            onClick={() => setExcludeOrganic(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              excludeOrganic
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
            }`}
            title={excludeOrganic ? 'Showing paid leads only (organic excluded)' : 'Click to exclude organic/page leads (no SKU)'}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            {excludeOrganic ? 'Paid Only' : 'Excl. Organic'}
          </button>

          {/* Active filter summary */}
          {isFiltered && (
            <span className="text-xs text-primary font-medium">
              Filtered{isProductFiltered ? ` · ${activeProductLabel}` : ''}{isDateFiltered ? ` · ${activeDateLabel}` : ''}{excludeOrganic ? ' · Paid only' : ''} · {filteredData.totalOrders.toLocaleString()} orders
            </span>
          )}
        </div>



        {/* KPI Cards Row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCard
            title={isFiltered ? 'Filtered Orders' : 'Total Orders'}
            value={filteredData.totalOrders.toLocaleString()}
            subtitle={`${filteredData.agents.length} agents`}
            icon={Users}
            color="default"
            delay={0}
          />
          <KpiCard
            title="Confirmed"
            value={hasTypeData ? filteredData.normalTotalConfirmed.toLocaleString() : filteredData.totalConfirmed.toLocaleString()}
            subtitle={hasTypeData ? `${normalConfRate.toFixed(1)}% (Normal only)` : `${filteredData.overallConfirmationRate.toFixed(1)}% rate`}
            icon={CheckCircle}
            color="teal"
            delay={0.05}
          />
          <KpiCard
            title="Cancelled"
            value={hasTypeData ? filteredData.normalTotalCancelled.toLocaleString() : filteredData.totalCancelled.toLocaleString()}
            subtitle={hasTypeData ? 'Normal leads only' : `${filteredData.overallCancellationRate.toFixed(1)}% rate`}
            icon={XCircle}
            color="coral"
            delay={0.1}
          />
          <KpiCard
            title={hasTypeData ? 'Normal Conf. Rate' : 'Conf. Rate'}
            value={hasTypeData ? `${normalConfRate.toFixed(1)}%` : `${avgConfRate.toFixed(1)}%`}
            subtitle={hasTypeData
              ? `${filteredData.normalTotalOrders.toLocaleString()} normal leads`
              : totalNoStatus > 0
                ? `Worked: ${workedConfRate.toFixed(1)}% · ${totalNoStatus} untouched`
                : (avgConfRate >= 55 ? 'On target' : avgConfRate >= 40 ? 'Below target' : 'Needs attention')}
            icon={Percent}
            color={(hasTypeData ? normalConfRate : avgConfRate) >= 55 ? 'teal' : (hasTypeData ? normalConfRate : avgConfRate) >= 40 ? 'amber' : 'coral'}
            delay={0.15}
          />
          <KpiCard
            title="Top Performer"
            value={topAgent?.name || '-'}
            subtitle={topAgent ? `${topAgent.confirmationRate.toFixed(1)}% conf. · ${topAgent.upsellRate.toFixed(1)}% upsell` : ''}
            icon={TrendingUp}
            color="green"
            delay={0.2}
          />
          <KpiCard
            title="Postponed"
            value={filteredData.agents.reduce((s: number, a: AgentData) => s + a.postponed, 0).toLocaleString()}
            subtitle="Pending callback"
            icon={Clock}
            color="amber"
            delay={0.25}
          />
          {teamPerformance && (
            <KpiCard
              title="Team Perf."
              value={`${teamPerformance.perf.toFixed(1)}%`}
              subtitle={`Conf ${workedConfRate.toFixed(0)}% × Del ${teamPerformance.delRate.toFixed(0)}%`}
              icon={Activity}
              color={teamPerformance.perf >= 35 ? 'teal' : teamPerformance.perf >= 25 ? 'amber' : 'coral'}
              delay={0.3}
            />
          )}
        </div>

        {/* Charts Row */}
        <StatusChart agents={filteredData.agents} />

        {/* Type Breakdown — Viconis only */}
        {isViconis && filteredData.typeBreakdown && Object.keys(filteredData.typeBreakdown).filter(t => t && t !== 'UNKNOWN' && t !== '').length > 1 && (
          <TypeBreakdown typeBreakdown={filteredData.typeBreakdown} />
        )}

        {/* Weekly Chart */}
        <WeeklyChart agents={filteredData.agents} />

        {/* Agent Table */}
        <AgentTable agents={filteredData.agents} onRemoveAgent={removeAgentAndSheet} showTypeColumns={isViconis && hasTypeData} getActivity={getActivity} untreatedCounts={untreatedCounts ?? undefined} agentIdMap={agentIdMap} filterWarnings={filterWarningsByUrl} organicStats={excludeOrganic ? organicStats : undefined} deliveryRates={isAlgeria ? deliveryRates : undefined} />

        {/* Clickable agent cards for detail */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          <h3 className="text-sm font-bold text-foreground mb-3">Agent Quick View</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredData.agents.map((agent: AgentData, i: number) => (
              <motion.div
                key={agent.name}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: 0.5 + i * 0.05 }}
                className="rounded-xl border border-border/50 bg-card p-4 text-left card-shadow hover:card-shadow-hover transition-all group relative"
              >
                {/* Delete button on hover */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeAgentAndSheet(agent.name, agent.sheetUrl);
                  }}
                  className="absolute top-2 right-2 rounded-lg p-1 opacity-0 group-hover:opacity-100 hover:bg-coral-light transition-all"
                  title="Remove agent"
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground hover:text-coral" />
                </button>

                <button
                  onClick={() => setSelectedAgent(agent)}
                  className="w-full text-left"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-bold text-primary">
                          {agent.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-semibold text-foreground">{agent.name}</span>
                          {filterWarningsByUrl[agent.sheetUrl.trim()] && (
                            <span className="inline-flex items-center px-1 py-0.5 rounded bg-amber-50 border border-amber-300/50" title={`Active filter on: ${filterWarningsByUrl[agent.sheetUrl.trim()].join(', ')}`}>
                              <svg className="h-2.5 w-2.5 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
                            </span>
                          )}
                        </div>
                        <ActivityIndicator activity={getActivity(agent.name)} size="sm" />
                      </div>
                    </div>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Orders</span>
                      <span className="font-data font-medium text-foreground">{agent.totalOrders}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Conf. Rate</span>
                      <span className={`font-data font-bold ${
                        agent.confirmationRate >= 55 ? 'text-teal' :
                        agent.confirmationRate >= 40 ? 'text-amber' : 'text-coral'
                      }`}>
                        {agent.confirmationRate.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Worked %</span>
                      <span className={`font-data font-bold ${
                        agent.workedConfirmationRate >= 55 ? 'text-teal' :
                        agent.workedConfirmationRate >= 40 ? 'text-amber' : 'text-coral'
                      }`}>
                        {agent.workedConfirmationRate.toFixed(1)}%
                        {agent.noStatus > 0 && <span className="text-[10px] text-muted-foreground font-normal ml-1">({agent.noStatus} new)</span>}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Cancel %</span>
                      <span className="font-data font-medium text-coral">{agent.cancellationRate.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Upsell</span>
                      <span className="font-data font-medium text-blue">{agent.upsellRate.toFixed(1)}%</span>
                    </div>
                    {/* Mini progress bar — based on conf rate */}
                    <div className="h-2 rounded-full bg-secondary overflow-hidden mt-1">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.min(agent.confirmationRate, 100)}%`,
                          backgroundColor: agent.confirmationRate >= 55
                            ? 'oklch(0.6 0.15 185)'
                            : agent.confirmationRate >= 40
                            ? 'oklch(0.75 0.16 75)'
                            : 'oklch(0.6 0.2 25)',
                        }}
                      />
                    </div>
                  </div>
                </button>
                {/* Open Google Sheet link */}
                <a
                  href={agent.sheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="mt-2 flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg text-xs font-medium text-primary/70 hover:text-primary hover:bg-primary/5 border border-transparent hover:border-primary/10 transition-all"
                  title="Open Google Sheet"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open Sheet
                </a>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Footer */}
        <div className="pt-4 pb-8 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Radio className="h-3 w-3 text-green" />
            Last updated: {data.lastUpdated.toLocaleString()}
            {autoRefresh && (
              <span className="text-primary font-medium">· Auto-refreshing every 1 min</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground/50">
            Scalex Groupe · {config.label} Confirmation Dashboard
          </p>
        </div>
      </main>

      {/* Agent Detail Modal */}
      <AnimatePresence>
        {selectedAgent && (
          <AgentDetail
            agent={selectedAgent}
            onClose={() => setSelectedAgent(null)}
          />
        )}
      </AnimatePresence>

      {/* Manage Panel (Slide-over) */}
      <AnimatePresence>
        {showManagePanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm"
            onClick={() => setShowManagePanel(false)}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border/50 shadow-2xl overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              {/* Panel Header */}
              <div className="sticky top-0 bg-card border-b border-border/50 p-5 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-foreground">Manage {config.label} Dashboard</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Add, remove agents & settings</p>
                </div>
                <button
                  onClick={() => setShowManagePanel(false)}
                  className="rounded-xl p-2 hover:bg-secondary transition-colors"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              <div className="p-5 space-y-6">
                {/* Auto-refresh toggle */}
                <div>
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3">Auto-Refresh</h3>
                  <button
                    onClick={toggleAutoRefresh}
                    className={`w-full flex items-center justify-between rounded-xl border p-4 transition-all ${
                      autoRefresh
                        ? 'border-green/20 bg-green-light'
                        : 'border-border bg-secondary/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {autoRefresh ? (
                        <div className="h-8 w-8 rounded-full bg-green/10 flex items-center justify-center">
                          <Wifi className="h-4 w-4 text-green" />
                        </div>
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                          <WifiOff className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="text-left">
                        <p className="text-sm font-medium text-foreground">
                          {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {autoRefresh ? 'Refreshes every minute' : 'Manual refresh only'}
                        </p>
                      </div>
                    </div>
                    <div className={`h-6 w-11 rounded-full transition-colors relative ${
                      autoRefresh ? 'bg-green' : 'bg-border'
                    }`}>
                      <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                        autoRefresh ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </div>
                  </button>
                </div>

                {/* Current Agents */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                      Active Agents ({data.agents.length})
                    </h3>
                    <button
                      onClick={() => checkAllConnections(true)}
                      className="text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors"
                    >
                      Check All Connections
                    </button>
                  </div>
                  <div className="space-y-2">
                    {data.agents.map(agent => {
                      const isEditing = editingAgent === agent.sheetUrl;
                      const dbEntry = findDbEntry(agent.sheetUrl);
                      const connStatus = connectionStatus[agent.sheetUrl];
                      return (
                        <div
                          key={agent.sheetUrl}
                          className={`rounded-xl border bg-secondary/30 p-3 group transition-all ${
                            isEditing ? 'border-primary/40 ring-1 ring-primary/20' : 'border-border/50'
                          }`}
                        >
                          {/* Top row: avatar, name/stats, actions */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              {/* Connection status indicator */}
                              <div className="relative">
                                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                                  <span className="text-xs font-bold text-primary">
                                    {agent.name.charAt(0).toUpperCase()}
                                  </span>
                                </div>
                                {connStatus && (
                                  <div className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full flex items-center justify-center ${
                                    connStatus === 'checking' ? 'bg-yellow-100' :
                                    connStatus === 'ok' ? 'bg-green-100' :
                                    connStatus === 'readonly' ? 'bg-orange-100' : 'bg-red-100'
                                  }`}>
                                    {connStatus === 'checking' ? (
                                      <Loader2 className="h-2.5 w-2.5 text-yellow-600 animate-spin" />
                                    ) : connStatus === 'ok' ? (
                                      <ShieldCheck className="h-2.5 w-2.5 text-green-600" />
                                    ) : connStatus === 'readonly' ? (
                                      <ShieldAlert className="h-2.5 w-2.5 text-orange-600" />
                                    ) : (
                                      <ShieldAlert className="h-2.5 w-2.5 text-red-600" />
                                    )}
                                  </div>
                                )}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-foreground">{agent.name}</p>
                                <p className="text-xs text-muted-foreground font-data">
                                  {agent.totalOrders} orders · {agent.confirmationRate.toFixed(1)}% conf.
                                  {dbEntry?.name && dbEntry.name !== agent.name && (
                                    <span className="text-primary/60"> · DB: {dbEntry.name}</span>
                                  )}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {/* Check connection */}
                              <button
                                onClick={() => checkConnection(agent.sheetUrl)}
                                className="rounded-lg p-1.5 hover:bg-secondary transition-colors"
                                title="Check connection"
                              >
                                {connStatus === 'checking' ? (
                                  <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
                                ) : (
                                  <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                              </button>
                              {/* Edit */}
                              <button
                                onClick={() => isEditing ? setEditingAgent(null) : startEditAgent(agent)}
                                className={`rounded-lg p-1.5 transition-colors ${
                                  isEditing ? 'bg-primary/10 text-primary' : 'hover:bg-secondary text-muted-foreground'
                                }`}
                                title={isEditing ? 'Cancel edit' : 'Edit agent'}
                              >
                                {isEditing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                              </button>
                              {/* Open sheet */}
                              <a
                                href={agent.sheetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-lg p-1.5 hover:bg-secondary transition-colors"
                                title="Open sheet"
                              >
                                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                              </a>
                              {/* Delete */}
                              <button
                                onClick={() => removeAgentAndSheet(agent.name, agent.sheetUrl)}
                                className="rounded-lg p-1.5 hover:bg-coral-light transition-colors"
                                title="Remove agent"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-coral" />
                              </button>
                            </div>
                          </div>

                          {/* Edit form (expanded when editing) */}
                          <AnimatePresence>
                            {isEditing && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="pt-3 mt-3 border-t border-border/50 space-y-2.5">
                                  {/* Name */}
                                  <div>
                                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Display Name</label>
                                    <input
                                      type="text"
                                      value={editName}
                                      onChange={e => setEditName(e.target.value)}
                                      placeholder="Agent display name"
                                      className="w-full mt-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                                    />
                                  </div>
                                  {/* Agent Code */}
                                  <div>
                                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Agent Code</label>
                                    <input
                                      type="text"
                                      value={editCode}
                                      onChange={e => setEditCode(e.target.value)}
                                      placeholder="e.g. SB, LN, YC"
                                      className="w-full mt-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all font-data"
                                    />
                                  </div>
                                  {/* Agent Email (for activity tracking) */}
                                  <div>
                                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Agent Google Email</label>
                                    <input
                                      type="email"
                                      value={editEmail}
                                      onChange={e => setEditEmail(e.target.value)}
                                      placeholder="agent@gmail.com"
                                      className="w-full mt-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                                    />
                                    <p className="text-[9px] text-muted-foreground/60 mt-0.5">Used by Activity Tracker to identify this agent</p>
                                  </div>
                                  {/* Save button */}
                                  <Button
                                    onClick={() => saveAgentEdit(agent)}
                                    disabled={updateSheetMutation.isPending}
                                    size="sm"
                                    className="w-full h-9 rounded-lg text-xs"
                                  >
                                    {updateSheetMutation.isPending ? (
                                      <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                                    ) : (
                                      <Check className="h-3 w-3 mr-1.5" />
                                    )}
                                    Save Changes
                                  </Button>
                                  {/* Connection status message */}
                                  {connStatus === 'ok' && (
                                    <p className="text-[10px] text-green-600 flex items-center gap-1">
                                      <ShieldCheck className="h-3 w-3" /> Editor access confirmed
                                    </p>
                                  )}
                                  {connStatus === 'readonly' && (
                                    <p className="text-[10px] text-orange-600 flex items-center gap-1">
                                      <ShieldAlert className="h-3 w-3" /> Read-only — share as Editor, not Viewer
                                    </p>
                                  )}
                                  {connStatus === 'error' && (
                                    <p className="text-[10px] text-red-600 flex items-center gap-1">
                                      <ShieldAlert className="h-3 w-3" /> No access — share the sheet with the service account email
                                    </p>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Add New Agent */}
                <div>
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3">Add New Agent</h3>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <FileSpreadsheet className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                      <input
                        type="url"
                        value={newSheetUrl}
                        onChange={e => setNewSheetUrl(e.target.value)}
                        placeholder="Paste Google Sheet URL"
                        className="w-full rounded-xl border border-border bg-secondary/50 pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 focus:bg-card transition-all"
                        onKeyDown={e => e.key === 'Enter' && handleAddNewSheet()}
                      />
                    </div>
                    <Button
                      onClick={handleAddNewSheet}
                      disabled={!newSheetUrl.trim() || loading}
                      size="sm"
                      className="h-11 px-4 rounded-xl"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>



                {/* Danger Zone */}
                <div className="pt-4 border-t border-border/50">
                  <h3 className="text-xs font-bold text-coral uppercase tracking-wider mb-3">Danger Zone</h3>
                  <button
                    onClick={() => {
                      if (confirm(`This will clear all saved sheet URLs for ${config.label} and reset this dashboard. Continue?`)) {
                        clearSavedData();
                        setShowManagePanel(false);
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-coral/20 bg-coral-light p-3.5 text-sm font-medium text-coral hover:bg-coral/10 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear All Data & Reset
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
