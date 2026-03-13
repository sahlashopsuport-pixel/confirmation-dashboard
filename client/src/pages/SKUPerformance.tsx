/**
 * SKU Performance Page
 * 
 * Aggregates all agents' orders by SKU (column M / المرجع) across countries.
 * Shows confirmation rate per product with sortable/searchable table.
 * Click any SKU row to expand and see per-agent breakdown.
 * Toggle "Show Call Status" to see اتصل 1-6, انتظار, تأجيل, مغلق, لا يجيب columns.
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CountryFlag from '@/components/CountryFlag';
import {
  Package,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Filter,
  ChevronDown,
  ChevronRight,
  User,
  Phone,
  Power,
  PowerOff,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { useDashboardCache } from '@/contexts/DashboardCacheContext';
import { DASHBOARDS, type DashboardSlug } from '@/App';
import { aggregateSKUData, getAvailableDates, parseDateToTime, type SKUData, type SKUAgentBreakdown, type SKUCallBreakdown, type AgentData, type DashboardData } from '@/lib/sheets';
import { normalizeSKU, stripUpsellSuffix, type CostApiResponse } from '@/lib/costData';
import DateRangePicker, { type DateRange } from '@/components/DateRangePicker';
import { CalendarDays } from 'lucide-react';

type CampaignFilter = 'all' | 'active' | 'off' | 'unknown';
type SortField = 'sku' | 'totalOrders' | 'confirmed' | 'cancelled' | 'confirmationRate' | 'cancellationRate'
  | 'call1' | 'call2' | 'call3' | 'call4' | 'call5' | 'call6' | 'waiting' | 'postponed' | 'closed' | 'noAnswer';
type SortDir = 'asc' | 'desc';

const CALL_COLUMNS: { key: keyof SKUCallBreakdown; label: string }[] = [
  { key: 'call1', label: 'اتصل 1' },
  { key: 'call2', label: 'اتصل 2' },
  { key: 'call3', label: 'اتصل 3' },
  { key: 'call4', label: 'اتصل 4' },
  { key: 'call5', label: 'اتصل 5' },
  { key: 'call6', label: 'اتصل 6' },
  { key: 'waiting', label: 'انتظار' },
  { key: 'postponed', label: 'تأجيل' },
  { key: 'closed', label: 'مغلق' },
  { key: 'noAnswer', label: 'لا يجيب' },
];

function getSortValue(sku: SKUData, field: SortField): number | string {
  if (field === 'sku') return sku.sku.toLowerCase();
  if (field in sku.callBreakdown) return sku.callBreakdown[field as keyof SKUCallBreakdown];
  // Use adjusted rates for sorting (call6 treated as cancelled)
  if (field === 'confirmationRate') return sku.adjConfirmationRate;
  if (field === 'cancellationRate') return sku.adjCancellationRate;
  if (field === 'cancelled') return sku.adjCancelled;
  return (sku as any)[field] ?? 0;
}

export default function SKUPerformance() {
  const { getCache } = useDashboardCache();
  const [selectedCountry, setSelectedCountry] = useState<DashboardSlug | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('totalOrders');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedSKU, setExpandedSKU] = useState<string | null>(null);
  const [showCallStatus, setShowCallStatus] = useState(false);
  const [campaignFilter, setCampaignFilter] = useState<CampaignFilter>('all');
  const [dateRange, setDateRange] = useState<DateRange | null>(null);

  // Load cost data from Calculator API to get isActive status per SKU
  const costDataQuery = trpc.costData.fetch.useQuery(undefined, {
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 2,
    placeholderData: (prev: CostApiResponse | undefined) => prev,
  });
  const costApiResponse = costDataQuery.data as CostApiResponse | undefined;

  // Gather all agents from cached data across countries (unfiltered)
  const allAgents = useMemo(() => {
    const agents: AgentData[] = [];
    const countries = selectedCountry === 'all'
      ? DASHBOARDS.map(d => d.slug)
      : [selectedCountry];

    for (const country of countries) {
      const cached = getCache(country as DashboardSlug);
      if (cached?.data?.agents) {
        agents.push(...cached.data.agents);
      }
    }
    return agents;
  }, [selectedCountry, getCache]);

  // Collect available dates from all agents (for the date picker)
  const availableDates = useMemo(() => {
    const dateSet = new Set<string>();
    for (const agent of allAgents) {
      for (const order of agent.orders) {
        if (order.date && order.date !== 'Unknown') {
          dateSet.add(order.date);
        }
      }
    }
    return Array.from(dateSet).sort((a, b) => parseDateToTime(b) - parseDateToTime(a));
  }, [allAgents]);

  // Apply date filter to agents' orders before SKU aggregation
  const filteredAgents = useMemo(() => {
    if (!dateRange) return allAgents;
    const fromTime = parseDateToTime(dateRange.from);
    const toTime = parseDateToTime(dateRange.to);
    return allAgents.map(agent => ({
      ...agent,
      orders: agent.orders.filter(o => {
        const t = parseDateToTime(o.date);
        return t >= fromTime && t <= toTime;
      }),
    })).filter(agent => agent.orders.length > 0);
  }, [allAgents, dateRange]);

  // Aggregate SKU data from (date-filtered) agents
  const skuData = useMemo(() => {
    return aggregateSKUData(filteredAgents);
  }, [filteredAgents]);

  // Build isActive lookup from Calculator API data
  // Key: normalized SKU name → isActive boolean
  const isActiveLookup = useMemo(() => {
    const lookup = new Map<string, boolean>();
    if (!costApiResponse?.data) return lookup;
    // Group by SKU: a SKU is active if ANY of its daily entries are active
    // Strip upsell suffix so "sku testicalmupsell" maps to same key as "sku"
    for (const entry of costApiResponse.data) {
      const key = normalizeSKU(stripUpsellSuffix(entry.sku));
      if (entry.isActive) {
        lookup.set(key, true);
      } else if (!lookup.has(key)) {
        lookup.set(key, false);
      }
    }
    return lookup;
  }, [costApiResponse]);

  const costDataLoaded = !!costApiResponse?.data;

  // Filter by search
  const searchFiltered = useMemo(() => {
    if (!searchQuery.trim()) return skuData;
    const q = searchQuery.toLowerCase();
    return skuData.filter(s => s.sku.toLowerCase().includes(q));
  }, [skuData, searchQuery]);

  // Filter by campaign status (Active/OFF/Unknown)
  const filteredData = useMemo(() => {
    if (campaignFilter === 'all') return searchFiltered;
    return searchFiltered.filter(s => {
      const key = normalizeSKU(s.sku);
      if (campaignFilter === 'active') return isActiveLookup.get(key) === true;
      if (campaignFilter === 'off') return isActiveLookup.has(key) && isActiveLookup.get(key) === false;
      // 'unknown' — not found in Calculator API
      return !isActiveLookup.has(key);
    });
  }, [searchFiltered, campaignFilter, isActiveLookup]);

  // Sort
  const sortedData = useMemo(() => {
    const sorted = [...filteredData];
    sorted.sort((a, b) => {
      const aVal = getSortValue(a, sortField);
      const bVal = getSortValue(b, sortField);
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredData, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const toggleExpand = (sku: string) => {
    setExpandedSKU(prev => prev === sku ? null : sku);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 text-primary" />
      : <ArrowDown className="h-3 w-3 text-primary" />;
  };

  // Summary stats — using adjusted rates (call6 treated as cancelled)
  const isDateFiltered = dateRange !== null;
  const isFiltered = searchQuery.trim().length > 0 || campaignFilter !== 'all' || isDateFiltered;
  const statsData = filteredData;
  const totalOrders = statsData.reduce((s, d) => s + d.totalOrders, 0);
  const totalConfirmed = statsData.reduce((s, d) => s + d.confirmed, 0);
  const totalAdjCancelled = statsData.reduce((s, d) => s + d.adjCancelled, 0);
  const overallConfRate = totalOrders > 0 ? (totalConfirmed / totalOrders) * 100 : 0;
  const overallAdjCancelRate = totalOrders > 0 ? (totalAdjCancelled / totalOrders) * 100 : 0;
  const bestSKU = statsData.length > 0
    ? [...statsData].filter(s => s.totalOrders >= 10).sort((a, b) => b.adjConfirmationRate - a.adjConfirmationRate)[0]
    : null;
  const worstSKU = statsData.length > 0
    ? [...statsData].filter(s => s.totalOrders >= 10).sort((a, b) => a.adjConfirmationRate - b.adjConfirmationRate)[0]
    : null;

  // Totals for call breakdown
  const callTotals = useMemo(() => {
    const t: SKUCallBreakdown = { call1: 0, call2: 0, call3: 0, call4: 0, call5: 0, call6: 0, waiting: 0, postponed: 0, closed: 0, noAnswer: 0 };
    for (const sku of sortedData) {
      for (const key of CALL_COLUMNS) {
        t[key.key] += sku.callBreakdown[key.key];
      }
    }
    return t;
  }, [sortedData]);

  // Pipeline % — orders still being worked on (call1-5 + waiting + postponed + closed + noAnswer)
  // Excludes call6 (exhausted all attempts = effectively cancelled)
  const pipelineTotal = useMemo(() => {
    return sortedData.reduce((s, sku) => {
      const cb = sku.callBreakdown;
      return s + cb.call1 + cb.call2 + cb.call3 + cb.call4 + cb.call5 + cb.waiting + cb.postponed + cb.closed + cb.noAnswer;
    }, 0);
  }, [sortedData]);

  // Check which countries have cached data
  const countriesWithData = DASHBOARDS.filter(d => {
    const cached = getCache(d.slug);
    return cached?.data?.agents && cached.data.agents.length > 0;
  });

  const totalColSpan = 9 + (showCallStatus ? CALL_COLUMNS.length : 0);

  if (countriesWithData.length === 0) {
    return (
      <div className="container py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="h-16 w-16 rounded-2xl bg-blue-light flex items-center justify-center mx-auto mb-4">
            <Package className="h-8 w-8 text-blue" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">No Data Available</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Load your country dashboards first (Algeria, Viconis, Libya, or Tunisia), then come back here to see SKU performance across all agents.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="container py-6 space-y-5">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-blue-light flex items-center justify-center">
            <Package className="h-4.5 w-4.5 text-blue" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">SKU Performance</h2>
            <p className="text-xs text-muted-foreground">
              Confirmation rate by product — click any row to see per-agent breakdown
            </p>
          </div>
        </div>

        {/* Campaign filter + Country filter + Call Status toggle */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant={showCallStatus ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowCallStatus(!showCallStatus)}
            className="h-8 text-xs rounded-lg"
          >
            <Phone className="mr-1.5 h-3 w-3" />
            {showCallStatus ? 'Hide Call Status' : 'Show Call Status'}
          </Button>
          {/* Campaign Active/OFF filter */}
          {costDataLoaded && (
            <div className="flex items-center gap-2">
              <Power className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-0.5">
                {(['all', 'active', 'off', 'unknown'] as CampaignFilter[]).map(f => {
                  const label = f === 'all' ? 'All' : f === 'active' ? 'Active' : f === 'off' ? 'OFF' : '???';
                  const count = f === 'all' ? skuData.length
                    : f === 'active' ? skuData.filter(s => isActiveLookup.get(normalizeSKU(s.sku)) === true).length
                    : f === 'off' ? skuData.filter(s => isActiveLookup.has(normalizeSKU(s.sku)) && isActiveLookup.get(normalizeSKU(s.sku)) === false).length
                    : skuData.filter(s => !isActiveLookup.has(normalizeSKU(s.sku))).length;
                  return (
                    <button
                      key={f}
                      onClick={() => setCampaignFilter(f)}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                        campaignFilter === f
                          ? 'bg-white text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {label}
                      <span className="ml-1 text-[10px] font-data opacity-60">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-0.5">
              <button
                onClick={() => setSelectedCountry('all')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  selectedCountry === 'all'
                    ? 'bg-white text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All
              </button>
              {DASHBOARDS.map(dash => {
                const hasData = countriesWithData.some(c => c.slug === dash.slug);
                return (
                  <button
                    key={dash.slug}
                    onClick={() => setSelectedCountry(dash.slug)}
                    disabled={!hasData}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      selectedCountry === dash.slug
                        ? 'bg-white text-foreground shadow-sm'
                        : hasData
                          ? 'text-muted-foreground hover:text-foreground'
                          : 'text-muted-foreground/40 cursor-not-allowed'
                    }`}
                  >
                    <span className="mr-1"><CountryFlag country={dash.slug} flag={dash.flag} className={dash.slug === 'viconis' ? 'h-3.5 w-auto' : undefined} /></span>
                    {dash.label}
                  </button>
                );
              })}
            </div>
          </div>
          {/* Date Range Filter */}
          {availableDates.length > 0 && (
            <DateRangePicker
              availableDates={availableDates}
              value={dateRange}
              onChange={setDateRange}
            />
          )}
          {/* Active filter summary */}
          {isFiltered && (
            <span className="text-xs text-primary font-medium">
              Filtered{isDateFiltered ? ` · ${dateRange?.label || 'Date'}` : ''}{campaignFilter !== 'all' ? ` · ${campaignFilter}` : ''} · {totalOrders.toLocaleString()} orders
            </span>
          )}
        </div>
      </motion.div>

      {/* Summary KPIs */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"
      >
        <div className={`rounded-xl border p-4 card-shadow ${isFiltered ? 'border-primary/30 bg-primary/5' : 'border-border/50 bg-card'}`}>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            {isFiltered ? 'Matching SKUs' : 'Total SKUs'}
          </p>
          <p className="text-xl font-bold font-data text-foreground">{statsData.length}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{totalOrders.toLocaleString()} total orders</p>
          {isFiltered && <p className="text-[10px] text-primary font-semibold mt-0.5">
            {searchQuery && `"${searchQuery}"`}
            {searchQuery && (campaignFilter !== 'all' || isDateFiltered) ? ' · ' : ''}
            {campaignFilter !== 'all' ? campaignFilter.toUpperCase() : ''}
            {campaignFilter !== 'all' && isDateFiltered ? ' · ' : ''}
            {isDateFiltered ? (dateRange?.label || 'Date filtered') : ''}
          </p>}
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-4 card-shadow">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Confirmed</p>
          <p className="text-xl font-bold font-data text-teal">{totalConfirmed.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{overallConfRate.toFixed(1)}% rate</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-4 card-shadow">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Cancelled</p>
          <p className="text-xl font-bold font-data text-coral">{totalAdjCancelled.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{overallAdjCancelRate.toFixed(1)}% rate</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-4 card-shadow">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Avg Conf. Rate</p>
          <p className={`text-xl font-bold font-data ${overallConfRate >= 55 ? 'text-teal' : overallConfRate >= 40 ? 'text-amber' : 'text-coral'}`}>
            {overallConfRate.toFixed(1)}%
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{overallConfRate >= 55 ? 'On target' : 'Below target'}</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-4 card-shadow">
          <div className="flex items-center gap-1 mb-1">
            <TrendingUp className="h-3 w-3 text-green" />
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Best SKU</p>
          </div>
          <p className="text-sm font-bold text-foreground truncate" title={bestSKU?.sku || '-'}>
            {bestSKU?.sku || '-'}
          </p>
          <p className="text-[10px] text-green mt-0.5 font-data">{bestSKU ? `${bestSKU.confirmationRate.toFixed(1)}% conf.` : ''}</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-4 card-shadow">
          <div className="flex items-center gap-1 mb-1">
            <TrendingDown className="h-3 w-3 text-coral" />
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Worst SKU</p>
          </div>
          <p className="text-sm font-bold text-foreground truncate" title={worstSKU?.sku || '-'}>
            {worstSKU?.sku || '-'}
          </p>
          <p className="text-[10px] text-coral mt-0.5 font-data">{worstSKU ? `${worstSKU.confirmationRate.toFixed(1)}% conf.` : ''}</p>
        </div>
      </motion.div>

      {/* Search bar */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="relative"
      >
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search SKU / product name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border/50 bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
      </motion.div>

      {/* SKU Table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-xl border border-border/50 bg-card overflow-hidden card-shadow"
      >
        <div className="overflow-x-auto max-h-[calc(100vh-20rem)]">
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border/50 bg-secondary/80 backdrop-blur-sm">
                <th className="text-left px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-10">
                  #
                </th>
                <th
                  className="text-left px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => handleSort('sku')}
                >
                  <div className="flex items-center gap-1">
                    SKU / Product <SortIcon field="sku" />
                  </div>
                </th>
                <th
                  className="text-center px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => handleSort('totalOrders')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Orders <SortIcon field="totalOrders" />
                  </div>
                </th>
                <th
                  className="text-center px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => handleSort('confirmed')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Conf. <SortIcon field="confirmed" />
                  </div>
                </th>
                <th
                  className="text-center px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => handleSort('confirmationRate')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Conf % <SortIcon field="confirmationRate" />
                  </div>
                </th>
                <th
                  className="text-center px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => handleSort('cancelled')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Cancel <SortIcon field="cancelled" />
                  </div>
                </th>
                <th
                  className="text-center px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => handleSort('cancellationRate')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Cancel % <SortIcon field="cancellationRate" />
                  </div>
                </th>
                {/* Call status columns */}
                {showCallStatus && CALL_COLUMNS.map(col => (
                  <th
                    key={col.key}
                    className="text-center px-2 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors whitespace-nowrap"
                    onClick={() => handleSort(col.key as SortField)}
                  >
                    <div className="flex items-center justify-center gap-1">
                      {col.label} <SortIcon field={col.key as SortField} />
                    </div>
                  </th>
                ))}
                <th className="text-center px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="text-center px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Campaign
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedData.length === 0 ? (
                <tr>
                  <td colSpan={totalColSpan} className="text-center py-8 text-sm text-muted-foreground">
                    {searchQuery ? 'No SKUs match your search.' : 'No SKU data available.'}
                  </td>
                </tr>
              ) : (
                <>
                  {sortedData.map((sku, index) => {
                    const isExpanded = expandedSKU === sku.sku;
                    const confColor = sku.adjConfirmationRate >= 55
                      ? 'text-teal'
                      : sku.adjConfirmationRate >= 40
                      ? 'text-amber'
                      : 'text-coral';
                    const statusLabel = sku.adjConfirmationRate >= 55
                      ? 'Good'
                      : sku.adjConfirmationRate >= 40
                      ? 'Average'
                      : 'Low';
                    const statusBg = sku.adjConfirmationRate >= 55
                      ? 'bg-teal-light text-teal'
                      : sku.adjConfirmationRate >= 40
                      ? 'bg-amber-light text-amber'
                      : 'bg-coral-light text-coral';

                    const normalizedKey = normalizeSKU(sku.sku);
                    const campaignStatus = isActiveLookup.has(normalizedKey)
                      ? (isActiveLookup.get(normalizedKey) ? 'active' : 'off')
                      : 'unknown';

                    return (
                      <SKURow
                        key={sku.sku}
                        sku={sku}
                        index={index}
                        isExpanded={isExpanded}
                        confColor={confColor}
                        statusLabel={statusLabel}
                        statusBg={statusBg}
                        showCallStatus={showCallStatus}
                        totalColSpan={totalColSpan}
                        campaignStatus={campaignStatus}
                        costDataLoaded={costDataLoaded}
                        onToggle={() => toggleExpand(sku.sku)}
                      />
                    );
                  })}

                  {/* Totals row */}
                  <tr className="border-t-2 border-border/60 bg-secondary/20 font-bold">
                    <td className="px-4 py-3 text-xs text-muted-foreground"></td>
                    <td className="px-4 py-3 text-xs font-bold text-foreground">
                      TOTAL ({sortedData.length} SKUs)
                    </td>
                    <td className="px-4 py-3 text-center text-xs font-data font-bold text-foreground">
                      {totalOrders.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-center text-xs font-data font-bold text-teal">
                      {totalConfirmed.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-center text-xs font-data font-bold text-teal">
                      {overallConfRate.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-center text-xs font-data font-bold text-coral">
                      {totalAdjCancelled.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-center text-xs font-data font-bold text-coral">
                      {overallAdjCancelRate.toFixed(1)}%
                    </td>
                    {showCallStatus && CALL_COLUMNS.map(col => (
                      <td key={col.key} className="px-2 py-3 text-center text-xs font-data font-bold text-foreground">
                        {callTotals[col.key] > 0 ? callTotals[col.key].toLocaleString() : '-'}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-center">
                      {pipelineTotal > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-light text-blue">
                          <Phone className="h-2.5 w-2.5" />
                          {pipelineTotal} in pipeline
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {costDataLoaded && (
                        <span className="text-[10px] text-muted-foreground font-data">
                          {(() => {
                            let active = 0, off = 0, unknown = 0;
                            for (const sku of sortedData) {
                              const key = normalizeSKU(sku.sku);
                              if (isActiveLookup.has(key)) {
                                isActiveLookup.get(key) ? active++ : off++;
                              } else {
                                unknown++;
                              }
                            }
                            return `${active} active · ${off} off`;
                          })()}
                        </span>
                      )}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {sortedData.length > 0 && (
          <div className="px-4 py-3 border-t border-border/30 bg-secondary/10 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              Showing {sortedData.length} of {skuData.length} SKUs
              {isFiltered && ` (filtered${campaignFilter !== 'all' ? `: ${campaignFilter}` : ''}${isDateFiltered ? ` · ${dateRange?.label || 'date'}` : ''})`}
            </span>
            <span className="text-[10px] text-muted-foreground">
              Sorted by {sortField === 'sku' ? 'name' : sortField.replace(/([A-Z])/g, ' $1').toLowerCase()} ({sortDir === 'desc' ? 'high to low' : 'low to high'})
            </span>
          </div>
        )}
      </motion.div>
    </div>
  );
}

/**
 * Individual SKU row with expandable agent breakdown
 */
function SKURow({
  sku,
  index,
  isExpanded,
  confColor,
  statusLabel,
  statusBg,
  showCallStatus,
  totalColSpan,
  campaignStatus,
  costDataLoaded,
  onToggle,
}: {
  sku: SKUData;
  index: number;
  isExpanded: boolean;
  confColor: string;
  statusLabel: string;
  statusBg: string;
  showCallStatus: boolean;
  totalColSpan: number;
  campaignStatus: 'active' | 'off' | 'unknown';
  costDataLoaded: boolean;
  onToggle: () => void;
}) {
  // Pipeline % for this SKU (excludes call6 — exhausted all attempts)
  const cb = sku.callBreakdown;
  const pipeline = cb.call1 + cb.call2 + cb.call3 + cb.call4 + cb.call5 + cb.waiting + cb.postponed + cb.closed + cb.noAnswer;
  const pipelinePct = sku.totalOrders > 0 ? (pipeline / sku.totalOrders) * 100 : 0;

  return (
    <>
      <motion.tr
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: Math.min(index * 0.02, 0.5) }}
        className={`border-b border-border/30 cursor-pointer transition-colors ${
          isExpanded ? 'bg-primary/5' : 'hover:bg-secondary/20'
        }`}
        onClick={onToggle}
      >
        <td className="px-4 py-3 text-xs text-muted-foreground font-data">
          {index + 1}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center flex-shrink-0">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-primary" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Package className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-foreground truncate max-w-[250px]" title={sku.sku}>
                {sku.sku}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {sku.agentBreakdown.length} agent{sku.agentBreakdown.length !== 1 ? 's' : ''}
                {pipelinePct > 0 && ` · ${pipelinePct.toFixed(0)}% in pipeline`}
              </span>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-center text-xs font-data font-medium text-foreground">
          {sku.totalOrders.toLocaleString()}
        </td>
        <td className="px-4 py-3 text-center text-xs font-data font-bold text-teal">
          {sku.confirmed.toLocaleString()}
        </td>
        <td className={`px-3 py-3 text-center text-xs font-data font-bold ${confColor}`}>
          {sku.adjConfirmationRate.toFixed(1)}%
        </td>
        <td className="px-4 py-3 text-center text-xs font-data font-bold text-coral">
          {sku.adjCancelled.toLocaleString()}
        </td>
        <td className="px-3 py-3 text-center text-xs font-data font-medium text-coral">
          {sku.adjCancellationRate.toFixed(1)}%
        </td>
        {/* Call status cells */}
        {showCallStatus && CALL_COLUMNS.map(col => {
          const val = sku.callBreakdown[col.key];
          return (
            <td key={col.key} className="px-2 py-3 text-center text-xs font-data text-muted-foreground">
              {val > 0 ? (
                <span className="font-medium text-foreground">{val}</span>
              ) : (
                <span className="text-muted-foreground/40">-</span>
              )}
            </td>
          );
        })}
        <td className="px-4 py-3 text-center">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusBg}`}>
            {sku.adjConfirmationRate >= 55 ? (
              <TrendingUp className="h-2.5 w-2.5" />
            ) : sku.adjConfirmationRate >= 40 ? (
              <BarChart3 className="h-2.5 w-2.5" />
            ) : (
              <TrendingDown className="h-2.5 w-2.5" />
            )}
            {statusLabel}
          </span>
        </td>
        <td className="px-3 py-3 text-center">
          {!costDataLoaded ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground mx-auto" />
          ) : campaignStatus === 'active' ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
              <Power className="h-2.5 w-2.5" />
              Active
            </span>
          ) : campaignStatus === 'off' ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500 border border-gray-200">
              <PowerOff className="h-2.5 w-2.5" />
              OFF
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground/50">-</span>
          )}
        </td>
      </motion.tr>

      {/* Expandable agent breakdown */}
      <AnimatePresence>
        {isExpanded && sku.agentBreakdown.length > 0 && (
          <motion.tr
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <td colSpan={totalColSpan} className="p-0">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-secondary/10 border-b border-border/30"
              >
                <div className="px-6 py-3">
                  <div className="flex items-center gap-2 mb-3">
                    <User className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Agent Breakdown — sorted by confirmation rate
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border/30">
                          <th className="text-left px-3 py-2 text-[9px] font-semibold text-muted-foreground uppercase w-8">#</th>
                          <th className="text-left px-3 py-2 text-[9px] font-semibold text-muted-foreground uppercase">Agent</th>
                          <th className="text-center px-3 py-2 text-[9px] font-semibold text-muted-foreground uppercase">Orders</th>
                          <th className="text-center px-3 py-2 text-[9px] font-semibold text-muted-foreground uppercase">Conf.</th>
                          <th className="text-center px-2 py-2 text-[9px] font-semibold text-muted-foreground uppercase">Conf %</th>
                          <th className="text-center px-3 py-2 text-[9px] font-semibold text-muted-foreground uppercase">Cancel</th>
                          <th className="text-center px-2 py-2 text-[9px] font-semibold text-muted-foreground uppercase">Cancel %</th>
                          {showCallStatus && CALL_COLUMNS.map(col => (
                            <th key={col.key} className="text-center px-1.5 py-2 text-[9px] font-semibold text-muted-foreground uppercase whitespace-nowrap">
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sku.agentBreakdown.map((agent, i) => {
                          const agentConfColor = agent.adjConfirmationRate >= 55
                            ? 'text-teal'
                            : agent.adjConfirmationRate >= 40
                            ? 'text-amber'
                            : 'text-coral';

                          return (
                            <tr key={agent.agentName} className="border-b border-border/20 hover:bg-card/50">
                              <td className="px-3 py-2 text-[10px] font-bold text-muted-foreground">{i + 1}</td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                    <span className="text-[9px] font-bold text-primary">
                                      {agent.agentName.charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                  <span className="text-xs font-semibold text-foreground truncate max-w-[150px]">
                                    {agent.agentName}
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-center text-xs font-data font-medium text-foreground">{agent.totalOrders}</td>
                              <td className="px-3 py-2 text-center text-xs font-data font-bold text-teal">{agent.confirmed}</td>
                              <td className={`px-2 py-2 text-center text-xs font-data font-bold ${agentConfColor}`}>
                                {agent.adjConfirmationRate.toFixed(1)}%
                              </td>
                              <td className="px-3 py-2 text-center text-xs font-data font-bold text-coral">{agent.adjCancelled}</td>
                              <td className="px-2 py-2 text-center text-xs font-data font-medium text-coral">
                                {agent.adjCancellationRate.toFixed(1)}%
                              </td>
                              {showCallStatus && CALL_COLUMNS.map(col => {
                                const val = agent.callBreakdown[col.key];
                                return (
                                  <td key={col.key} className="px-1.5 py-2 text-center text-[10px] font-data text-muted-foreground">
                                    {val > 0 ? <span className="font-medium text-foreground">{val}</span> : <span className="text-muted-foreground/40">-</span>}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            </td>
          </motion.tr>
        )}
      </AnimatePresence>
    </>
  );
}
