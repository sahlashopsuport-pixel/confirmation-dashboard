/**
 * SKU Decision Matrix Page — Profit-Based Scoring
 * 
 * Cross-references ad spend with PER-SKU confirmation rates from cached
 * dashboards. Each campaign is matched to its exact SKU in the confirmation
 * dashboard using the reference column (column M in Google Sheets).
 * 
 * Testicalm DZ: margin 2,700 DA, delivery 55%, USD=250 DA
 * KILL: profit < 300 DA | WATCH: 300-700 DA | KEEP: > 700 DA
 */

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import CountryFlag from '@/components/CountryFlag';
import {
  Skull,
  Eye,
  ThumbsUp,
  DollarSign,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Loader2,
  Download,
  Truck,
  Calculator,
  Power,
  PowerOff,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { useDashboardCache } from '@/contexts/DashboardCacheContext';
import { DASHBOARDS, type DashboardSlug } from '@/App';
import { aggregateSKUData, type SKUData } from '@/lib/sheets';
import {
  aggregateApiToCostSKUs,
  buildDecisionMatrix,
  buildMarketMapFromApi,
  type CostApiResponse,
  type DecisionMatrixRow,
} from '@/lib/costData';

type SortField = 'sku' | 'costOrders' | 'avgCPL' | 'adjConfirmationRate' | 'adjCancellationRate' | 'costPerDelivered' | 'profitPerDeliveryDA' | 'score' | 'pipelineRate';
type SortDir = 'asc' | 'desc';
type DecisionFilter = 'all' | 'KILL' | 'WATCH' | 'KEEP';

function DecisionBadge({ decision }: { decision: 'KILL' | 'WATCH' | 'KEEP' }) {
  const config = {
    KILL: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200', icon: Skull, label: 'KILL' },
    WATCH: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', icon: Eye, label: 'WATCH' },
    KEEP: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', icon: ThumbsUp, label: 'KEEP' },
  }[decision];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${config.bg} ${config.text} ${config.border}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: 'low' | 'medium' | 'high' }) {
  const config = {
    low: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Low' },
    medium: { bg: 'bg-blue-50', text: 'text-blue-600', label: 'Med' },
    high: { bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'High' },
  }[confidence];
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-semibold ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}

function ProfitBadge({ profitDA }: { profitDA: number }) {
  if (profitDA <= 0) {
    return <span className="font-data font-bold text-red-600">{Math.round(profitDA)} DA</span>;
  }
  if (profitDA < 300) {
    return <span className="font-data font-bold text-red-500">{Math.round(profitDA)} DA</span>;
  }
  if (profitDA < 700) {
    return <span className="font-data font-bold text-amber-600">{Math.round(profitDA)} DA</span>;
  }
  return <span className="font-data font-bold text-emerald-600">{Math.round(profitDA)} DA</span>;
}

export default function DecisionMatrix() {
  const { getCache } = useDashboardCache();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [buyerFilter, setBuyerFilter] = useState<string>('all');
  const [expandedSKU, setExpandedSKU] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'off'>('all');

  // Load cost data from Calculator API via tRPC
  const costDataQuery = trpc.costData.fetch.useQuery(undefined, {
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 2,
    placeholderData: (prev: CostApiResponse | undefined) => prev,
  });

  const loading = costDataQuery.isLoading;
  const error = costDataQuery.error?.message || null;

  const apiResponse = costDataQuery.data as CostApiResponse | undefined;

  const costSKUs = useMemo(() => {
    if (!apiResponse?.data) return [];
    return aggregateApiToCostSKUs(apiResponse.data);
  }, [apiResponse]);

  // Build per-SKU confirmation data from ALL cached dashboards
  // Same approach as SKU Performance page: gather agents, call aggregateSKUData
  const confSKUs = useMemo((): SKUData[] => {
    const allAgents: any[] = [];
    const slugs: DashboardSlug[] = ['algeria', 'libya', 'viconis', 'tunisia'];

    for (const slug of slugs) {
      const cached = getCache(slug);
      if (cached?.data?.agents) {
        for (const agent of cached.data.agents) {
          allAgents.push(agent);
        }
      }
    }

    if (allAgents.length === 0) return [];
    return aggregateSKUData(allAgents);
  }, [getCache]);

  // Track which dashboards are loaded for the status banner
  const dashboardStatus = useMemo(() => {
    const status: Record<string, { loaded: boolean; confRate: number; totalOrders: number }> = {};
    for (const dash of DASHBOARDS) {
      const cached = getCache(dash.slug);
      status[dash.slug] = {
        loaded: !!cached?.data,
        confRate: cached?.data?.overallConfirmationRate || 0,
        totalOrders: cached?.data?.totalOrders || 0,
      };
    }
    return status;
  }, [getCache]);

  const loadedDashboards = useMemo(() => {
    return DASHBOARDS.filter(d => dashboardStatus[d.slug]?.loaded);
  }, [dashboardStatus]);

  const unloadedDashboards = useMemo(() => {
    return DASHBOARDS.filter(d => !dashboardStatus[d.slug]?.loaded);
  }, [dashboardStatus]);

  const marketMap = useMemo(() => {
    if (!apiResponse?.data) return {};
    return buildMarketMapFromApi(apiResponse.data);
  }, [apiResponse]);

  const matrixRows = useMemo(() => {
    if (costSKUs.length === 0) return [];
    return buildDecisionMatrix(costSKUs, confSKUs, marketMap);
  }, [costSKUs, confSKUs, marketMap]);

  // Match stats
  const matchStats = useMemo(() => {
    const matched = matrixRows.filter(r => r.confMatched).length;
    const unmatched = matrixRows.filter(r => !r.confMatched).length;
    return { matched, unmatched, total: matrixRows.length };
  }, [matrixRows]);

  // Unique categories and buyers for filters
  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const row of matrixRows) cats.add(row.productCategory);
    return ['all', ...Array.from(cats).sort()];
  }, [matrixRows]);

  const buyers = useMemo(() => {
    const bs = new Set<string>();
    for (const row of matrixRows) bs.add(row.buyer);
    return ['all', ...Array.from(bs).sort()];
  }, [matrixRows]);

  // Filter and sort
  const filteredRows = useMemo(() => {
    let rows = [...matrixRows];
    if (decisionFilter !== 'all') rows = rows.filter(r => r.decision === decisionFilter);
    if (categoryFilter !== 'all') rows = rows.filter(r => r.productCategory === categoryFilter);
    if (buyerFilter !== 'all') rows = rows.filter(r => r.buyer === buyerFilter);
    if (statusFilter !== 'all') rows = rows.filter(r => statusFilter === 'active' ? r.isActive : !r.isActive);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(r => r.sku.toLowerCase().includes(q));
    }
    rows.sort((a, b) => {
      let aVal: any = (a as any)[sortField];
      let bVal: any = (b as any)[sortField];
      if (sortField === 'sku') {
        aVal = a.sku.toLowerCase();
        bVal = b.sku.toLowerCase();
      }
      if (typeof aVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return rows;
  }, [matrixRows, decisionFilter, categoryFilter, buyerFilter, statusFilter, searchQuery, sortField, sortDir]);

  // Summary KPIs
  const kpis = useMemo(() => {
    const killRows = matrixRows.filter(r => r.decision === 'KILL');
    const watchRows = matrixRows.filter(r => r.decision === 'WATCH');
    const keepRows = matrixRows.filter(r => r.decision === 'KEEP');
    const totalSpend = matrixRows.reduce((s, r) => s + r.totalSpend, 0);
    const killSpend = killRows.reduce((s, r) => s + r.totalSpend, 0);
    const avgCPL = matrixRows.length > 0
      ? matrixRows.reduce((s, r) => s + r.avgCPL * r.costOrders, 0) / matrixRows.reduce((s, r) => s + r.costOrders, 0)
      : 0;
    // Average profit for KEEP SKUs
    const keepWithProfit = keepRows.filter(r => r.profitPerDeliveryDA > 0);
    const avgKeepProfit = keepWithProfit.length > 0
      ? keepWithProfit.reduce((s, r) => s + r.profitPerDeliveryDA, 0) / keepWithProfit.length
      : 0;
    // Losing money SKUs
    const losingMoney = matrixRows.filter(r => r.profitPerDeliveryDA < 0 && r.confOrders > 0);

    const activeCount = matrixRows.filter(r => r.isActive).length;
    const offCount = matrixRows.filter(r => !r.isActive).length;
    const offKillCount = matrixRows.filter(r => !r.isActive && r.decision === 'KILL').length;

    return {
      totalSKUs: matrixRows.length,
      killCount: killRows.length,
      watchCount: watchRows.length,
      keepCount: keepRows.length,
      totalSpend,
      killSpend,
      avgCPL,
      avgKeepProfit: Math.round(avgKeepProfit),
      losingCount: losingMoney.length,
      activeCount,
      offCount,
      offKillCount,
    };
  }, [matrixRows]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'sku' ? 'asc' : 'desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />;
  };

  // Export KILL list as CSV
  const exportKillList = () => {
    const killRows = matrixRows.filter(r => r.decision === 'KILL');
    const headers = ['SKU', 'Buyer', 'Product', 'Market', 'CPL ($)', 'Conf%', 'Cost/Delivered ($)', 'Ad Cost (DA)', 'Profit/Delivery (DA)', 'Leads', 'Score'];
    const csvRows = killRows.map(r => [
      `"${r.sku}"`, r.buyer, r.productCategory, r.market,
      r.avgCPL.toFixed(2), r.adjConfirmationRate.toFixed(1),
      r.costPerDelivered.toFixed(2), Math.round(r.adCostDA),
      Math.round(r.profitPerDeliveryDA), r.costOrders, r.score,
    ].join(','));
    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kill-list-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading cost data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-sm text-red-600">{error}</span>
      </div>
    );
  }

  return (
    <div className="container py-6 space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-1">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              Profit Decision Matrix
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Testicalm DZ: Margin 2,700 DA · Delivery 55% · USD = 250 DA · KILL &lt;300 DA · WATCH 300-700 DA · KEEP &gt;700 DA
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportKillList}
              disabled={kpis.killCount === 0}
              className="h-8 text-xs"
            >
              <Download className="mr-1.5 h-3 w-3" />
              Export KILL List ({kpis.killCount})
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Dashboard Data Status Banner */}
      <div className="flex flex-wrap items-center gap-2">
        {DASHBOARDS.map(dash => {
          const st = dashboardStatus[dash.slug];
          return (
            <div
              key={dash.slug}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium ${
                st?.loaded
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}
            >
              <CountryFlag country={dash.slug} flag={dash.flag} className={dash.slug === 'viconis' ? 'h-3.5 w-auto' : undefined} />
              <span>{dash.label}</span>
              {st?.loaded ? (
                <>
                  <CheckCircle className="h-3 w-3" />
                  <span className="font-data">{st.confRate.toFixed(1)}%</span>
                </>
              ) : (
                <>
                  <XCircle className="h-3 w-3" />
                  <span>Not loaded</span>
                </>
              )}
            </div>
          );
        })}
        {confSKUs.length > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-200">
            <CheckCircle className="h-3.5 w-3.5 text-blue-600" />
            <span className="text-xs text-blue-700 font-medium">
              {matchStats.matched} of {matchStats.total} SKUs matched · {confSKUs.length} SKUs in dashboards
            </span>
          </div>
        )}
        {unloadedDashboards.length > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-xs text-amber-700 font-medium">
              Visit {unloadedDashboards.map(d => d.label).join(', ')} dashboard{unloadedDashboards.length > 1 ? 's' : ''} first to load confirmation data
            </span>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <KPICard title="KILL" value={kpis.killCount.toString()} subtitle={`$${kpis.killSpend.toFixed(0)} wasted`} color="red" />
        <KPICard title="WATCH" value={kpis.watchCount.toString()} subtitle="Borderline profit" color="amber" />
        <KPICard title="KEEP" value={kpis.keepCount.toString()} subtitle={kpis.avgKeepProfit > 0 ? `Avg ${kpis.avgKeepProfit} DA profit` : ''} color="green" />
        <KPICard title="Avg CPL" value={`$${kpis.avgCPL.toFixed(2)}`} subtitle={`${Math.round(kpis.avgCPL * 250)} DA`} color="default" />
        <KPICard title="Losing Money" value={kpis.losingCount.toString()} subtitle="Negative profit SKUs" color={kpis.losingCount > 0 ? 'red' : 'default'} />
        <KPICard title="Total SKUs" value={kpis.totalSKUs.toString()} subtitle={`${matchStats.matched} matched`} color="default" />
        <KPICard title="Already OFF" value={kpis.offCount.toString()} subtitle={`${kpis.offKillCount} were KILL`} color={kpis.offCount > 0 ? 'default' : 'default'} />
        <KPICard title="Still Active" value={kpis.activeCount.toString()} subtitle="Need your review" color="green" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-card rounded-lg border border-border/50 p-1">
          {(['all', 'KILL', 'WATCH', 'KEEP'] as DecisionFilter[]).map(d => (
            <button
              key={d}
              onClick={() => setDecisionFilter(d)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                decisionFilter === d
                  ? d === 'KILL' ? 'bg-red-100 text-red-700'
                    : d === 'WATCH' ? 'bg-amber-100 text-amber-700'
                    : d === 'KEEP' ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-gray-100'
              }`}
            >
              {d === 'all' ? 'All' : d}
              {d !== 'all' && (
                <span className="ml-1 text-[10px] opacity-70">
                  ({d === 'KILL' ? kpis.killCount : d === 'WATCH' ? kpis.watchCount : kpis.keepCount})
                </span>
              )}
            </button>
          ))}
        </div>

        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="h-8 px-2 text-xs rounded-lg border border-border/50 bg-card text-foreground"
        >
          {categories.map(c => (
            <option key={c} value={c}>{c === 'all' ? 'All Products' : c}</option>
          ))}
        </select>

        <select
          value={buyerFilter}
          onChange={e => setBuyerFilter(e.target.value)}
          className="h-8 px-2 text-xs rounded-lg border border-border/50 bg-card text-foreground"
        >
          {buyers.map(b => (
            <option key={b} value={b}>{b === 'all' ? 'All Buyers' : b}</option>
          ))}
        </select>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search SKU name..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-8 pr-3 text-xs rounded-lg border border-border/50 bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="flex items-center gap-1 bg-card rounded-lg border border-border/50 p-1">
          {(['all', 'active', 'off'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                statusFilter === s
                  ? s === 'off' ? 'bg-gray-200 text-gray-700'
                    : s === 'active' ? 'bg-green-100 text-green-700'
                    : 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-gray-100'
              }`}
            >
              {s === 'all' ? 'All Status' : s === 'active' ? 'Active' : 'Already OFF'}
              {s !== 'all' && (
                <span className="ml-1 text-[10px] opacity-70">
                  ({s === 'active' ? kpis.activeCount : kpis.offCount})
                </span>
              )}
            </button>
          ))}
        </div>

        <span className="text-xs text-muted-foreground">
          {filteredRows.length} of {matrixRows.length} SKUs
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
        <div className="max-h-[calc(100vh-320px)] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm border-b border-border/50">
              <tr>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground w-8">#</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground min-w-[200px]">
                  <button onClick={() => handleSort('sku')} className="flex items-center gap-1 hover:text-foreground">
                    SKU / Campaign <SortIcon field="sku" />
                  </button>
                </th>
                <th className="text-center px-2 py-2.5 font-semibold text-muted-foreground w-20">Decision</th>
                <th className="text-right px-2 py-2.5 font-semibold text-muted-foreground w-16">
                  <button onClick={() => handleSort('costOrders')} className="flex items-center gap-1 hover:text-foreground ml-auto">
                    Leads <SortIcon field="costOrders" />
                  </button>
                </th>
                <th className="text-right px-2 py-2.5 font-semibold text-muted-foreground w-16" title="Leads from confirmation dashboard">
                  <span className="text-[10px]">Dash</span>
                </th>
                <th className="text-right px-2 py-2.5 font-semibold text-muted-foreground w-16">
                  <button onClick={() => handleSort('avgCPL')} className="flex items-center gap-1 hover:text-foreground ml-auto">
                    CPL <SortIcon field="avgCPL" />
                  </button>
                </th>
                <th className="text-right px-2 py-2.5 font-semibold text-muted-foreground w-16">
                  <button onClick={() => handleSort('adjConfirmationRate')} className="flex items-center gap-1 hover:text-foreground ml-auto">
                    Conf% <SortIcon field="adjConfirmationRate" />
                  </button>
                </th>
                <th className="text-right px-2 py-2.5 font-semibold text-muted-foreground w-20">
                  <button onClick={() => handleSort('costPerDelivered')} className="flex items-center gap-1 hover:text-foreground ml-auto">
                    $/Deliv <SortIcon field="costPerDelivered" />
                  </button>
                </th>
                <th className="text-right px-2 py-2.5 font-semibold text-muted-foreground w-24">
                  <button onClick={() => handleSort('profitPerDeliveryDA')} className="flex items-center gap-1 hover:text-foreground ml-auto">
                    Profit/Deliv <SortIcon field="profitPerDeliveryDA" />
                  </button>
                </th>
                <th className="text-left px-2 py-2.5 font-semibold text-muted-foreground w-20">Market</th>
                <th className="text-center px-2 py-2.5 font-semibold text-muted-foreground w-14">Conf.</th>
                <th className="text-left px-2 py-2.5 font-semibold text-muted-foreground w-20">Buyer</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, i) => {
                const isExpanded = expandedSKU === row.sku;
                const rowBorder = row.decision === 'KILL' ? 'border-l-2 border-l-red-400' : row.decision === 'WATCH' ? 'border-l-2 border-l-amber-400' : 'border-l-2 border-l-emerald-400';
                const rowBg = isExpanded ? 'bg-blue-50/50' : !row.isActive ? 'bg-gray-50/40 hover:bg-gray-100/60' : 'hover:bg-gray-50/80';
                return (
                  <>
                    <tr
                      key={row.sku}
                      className={`cursor-pointer transition-colors ${rowBorder} ${rowBg}`}
                      onClick={() => setExpandedSKU(isExpanded ? null : row.sku)}
                    >
                      <td className="px-3 py-2 text-muted-foreground font-data">
                        {isExpanded ? <ChevronDown className="h-3 w-3 inline" /> : <ChevronRight className="h-3 w-3 inline" />}
                      </td>
                      <td className="px-3 py-2 font-medium text-foreground truncate max-w-[300px]" title={row.sku}>
                        <div className="flex items-center gap-1.5">
                          {!row.isActive && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-gray-200 text-gray-600 border border-gray-300 shrink-0">
                              <PowerOff className="h-2.5 w-2.5" />
                              OFF
                            </span>
                          )}
                          <span className={!row.isActive ? 'opacity-60' : ''}>{row.sku}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <DecisionBadge decision={row.decision} />
                      </td>
                      <td className="px-2 py-2 text-right font-data">
                        {row.costOrders.toLocaleString()}
                      </td>
                      <td className="px-2 py-2 text-right font-data">
                        {row.dashboardLeads > 0 ? (
                          <span className={row.dashboardLeads < row.costOrders * 0.3 ? 'text-red-500' : row.dashboardLeads < row.costOrders * 0.7 ? 'text-amber-500' : 'text-muted-foreground'}>
                            {row.dashboardLeads.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right font-data">
                        ${row.avgCPL.toFixed(2)}
                      </td>
                      <td className={`px-2 py-2 text-right font-data font-bold ${
                        row.adjConfirmationRate >= 55 ? 'text-emerald-600' :
                        row.adjConfirmationRate >= 40 ? 'text-amber-600' :
                        row.adjConfirmationRate > 0 ? 'text-red-600' : 'text-gray-400'
                      }`}>
                        {row.confMatched ? `${row.adjConfirmationRate.toFixed(1)}%` : '-'}
                      </td>
                      <td className={`px-2 py-2 text-right font-data ${
                        row.costPerDelivered > 10 ? 'text-red-600' :
                        row.costPerDelivered > 7 ? 'text-amber-600' :
                        row.costPerDelivered > 0 ? 'text-emerald-600' : 'text-gray-400'
                      }`}>
                        {row.costPerDelivered > 0 ? `$${row.costPerDelivered.toFixed(2)}` : '-'}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {row.confMatched ? (
                          <ProfitBadge profitDA={row.profitPerDeliveryDA} />
                        ) : '-'}
                      </td>
                      <td className="px-2 py-2 text-left">
                        <span className="text-[10px] text-muted-foreground">{row.market}</span>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <ConfidenceBadge confidence={row.confidence} />
                      </td>
                      <td className="px-2 py-2 text-left">
                        <span className="text-[10px] text-muted-foreground">{row.buyer}</span>
                      </td>
                    </tr>
                    {/* Expanded detail row */}
                    {isExpanded && (
                      <tr key={`${row.sku}-detail`}>
                        <td colSpan={12} className="bg-blue-50/30 border-t border-border/30 px-6 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Left: Profit Funnel */}
                            <div>
                              <h4 className="text-xs font-bold text-foreground mb-3 flex items-center gap-1.5">
                                <Calculator className="h-3.5 w-3.5 text-primary" />
                                Profit Funnel
                              </h4>
                              <div className="space-y-2">
                                <FunnelStep
                                  label="1. Cost per Lead (CPL)"
                                  value={`$${row.avgCPL.toFixed(2)}`}
                                  valueDA={`${Math.round(row.avgCPL * 250)} DA`}
                                  color="text-foreground"
                                />
                                <div className="text-[10px] text-muted-foreground pl-4">
                                  ÷ {row.adjConfirmationRate > 0 ? `${row.adjConfirmationRate.toFixed(1)}%` : '?%'} confirmation rate {row.confMatched ? '(per-SKU)' : '(no data)'}
                                </div>
                                <FunnelStep
                                  label="2. Cost per Confirmed"
                                  value={row.costPerConfirmedOrder > 0 ? `$${row.costPerConfirmedOrder.toFixed(2)}` : '-'}
                                  valueDA={row.costPerConfirmedOrder > 0 ? `${Math.round(row.costPerConfirmedOrder * 250)} DA` : '-'}
                                  color="text-foreground"
                                />
                                <div className="text-[10px] text-muted-foreground pl-4">
                                  ÷ 55% delivery rate
                                </div>
                                <FunnelStep
                                  label="3. Cost per Delivered"
                                  value={row.costPerDelivered > 0 ? `$${row.costPerDelivered.toFixed(2)}` : '-'}
                                  valueDA={row.costPerDelivered > 0 ? `${Math.round(row.adCostDA)} DA` : '-'}
                                  color={row.costPerDelivered > 10 ? 'text-red-600' : row.costPerDelivered > 7 ? 'text-amber-600' : 'text-emerald-600'}
                                />
                                <div className="h-px bg-border/50 my-2" />
                                <div className="text-[10px] text-muted-foreground pl-4">
                                  Margin: 2,700 DA − {row.adCostDA > 0 ? `${Math.round(row.adCostDA)} DA ad cost` : '? DA'}
                                </div>
                                <FunnelStep
                                  label="4. PROFIT per Delivery"
                                  value={row.confMatched ? `${Math.round(row.profitPerDeliveryDA)} DA` : '-'}
                                  valueDA={row.profitPerDeliveryDA < 300 ? 'KILL' : row.profitPerDeliveryDA < 700 ? 'WATCH' : 'KEEP'}
                                  color={row.profitPerDeliveryDA < 300 ? 'text-red-600' : row.profitPerDeliveryDA < 700 ? 'text-amber-600' : 'text-emerald-600'}
                                  bold
                                />
                              </div>
                            </div>

                            {/* Right: Decision Reasons + Metrics */}
                            <div className="space-y-4">
                              <div>
                                <h4 className="text-xs font-bold text-foreground mb-2">Decision Reasons</h4>
                                <ul className="space-y-1">
                                  {row.reasons.map((reason, ri) => (
                                    <li key={ri} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                      <span className={`mt-0.5 h-1.5 w-1.5 rounded-full shrink-0 ${
                                        row.decision === 'KILL' ? 'bg-red-400' : row.decision === 'WATCH' ? 'bg-amber-400' : 'bg-emerald-400'
                                      }`} />
                                      {reason}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-foreground mb-2">Metrics</h4>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <MetricBox label="Cost Leads" value={row.costOrders.toLocaleString()} />
                                  <MetricBox label="Conf. Leads" value={row.confMatched ? row.confOrders.toLocaleString() : 'No match'} />
                                  <MetricBox label="Confirmed" value={row.confMatched ? row.confirmed.toLocaleString() : '-'} color="text-emerald-600" />
                                  <MetricBox label="Cancelled" value={row.confMatched ? row.cancelled.toLocaleString() : '-'} color="text-red-600" />
                                  <MetricBox label="Market" value={row.market} />
                                  <MetricBox label="Matched" value={row.confMatched ? 'Yes' : 'No'} color={row.confMatched ? 'text-emerald-600' : 'text-amber-600'} />
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={12} className="text-center py-8 text-muted-foreground text-sm">
                    No SKUs match your filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-muted-foreground pb-4">
        <p>
          Profit Decision Matrix: {costSKUs.length} SKUs ({apiResponse?.count || 0} entries via live API)
          {confSKUs.length > 0 && ` · ${matchStats.matched} matched to confirmation data (${confSKUs.length} SKUs in dashboards)`}
        </p>
        <p className="mt-1 text-muted-foreground/60">
          Profit = Margin (2,700 DA) − CPL ÷ Conf% ÷ 55% delivery × 250 DA/USD
        </p>
      </div>
    </div>
  );
}

function FunnelStep({ label, value, valueDA, color, bold }: { label: string; value: string; valueDA: string; color: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-3 py-1.5 rounded-lg ${bold ? 'bg-white border border-border/50' : ''}`}>
      <span className={`text-xs ${bold ? 'font-bold' : 'font-medium'} text-foreground`}>{label}</span>
      <div className="flex items-center gap-2">
        <span className={`font-data ${bold ? 'text-sm font-bold' : 'text-xs font-semibold'} ${color}`}>{value}</span>
        <span className="text-[10px] text-muted-foreground">{valueDA}</span>
      </div>
    </div>
  );
}

function MetricBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-white rounded-lg px-3 py-2 border border-border/30">
      <div className="text-muted-foreground text-[10px]">{label}</div>
      <div className={`font-data font-bold ${color || 'text-foreground'}`}>{value}</div>
    </div>
  );
}

function KPICard({ title, value, subtitle, color }: { title: string; value: string; subtitle?: string; color: 'default' | 'red' | 'amber' | 'green' }) {
  const colorClasses = {
    default: 'border-border/50',
    red: 'border-red-200 bg-red-50/50',
    amber: 'border-amber-200 bg-amber-50/50',
    green: 'border-emerald-200 bg-emerald-50/50',
  }[color];
  const valueColor = {
    default: 'text-foreground',
    red: 'text-red-700',
    amber: 'text-amber-700',
    green: 'text-emerald-700',
  }[color];
  return (
    <div className={`rounded-xl border bg-card p-3 ${colorClasses}`}>
      <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{title}</div>
      <div className={`text-lg font-bold font-data ${valueColor} mt-0.5`}>{value}</div>
      {subtitle && <div className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</div>}
    </div>
  );
}
