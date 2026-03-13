/**
 * Lead Archive — Permanent historical lead storage browser.
 * Allows filtering by date range, market, agent, product, SKU, status, week.
 * Data comes from the database, not Google Sheets, so it persists forever.
 * Includes smart status sync that reads statuses from Google Sheets.
 */

import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Database,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Calendar,
  Users,
  Package,
  BarChart3,
  Download,
  Filter,
  X,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Phone,
} from 'lucide-react';
import CountryFlag from '@/components/CountryFlag';
import { toast } from 'sonner';

const MARKETS = [
  { value: 'algeria', label: 'Algeria', flag: '🇩🇿' },
  { value: 'viconis', label: 'Viconis', flag: '💎' },
  { value: 'libya', label: 'Libya', flag: '🇱🇾' },
  { value: 'tunisia', label: 'Tunisia', flag: '🇹🇳' },
];

const PAGE_SIZES = [50, 100, 200, 500];

/** Status badge styles */
function getStatusBadge(status: string | null) {
  if (!status) return { label: 'Pending', color: 'bg-gray-100 text-gray-600', icon: Clock };
  const s = status.trim();
  if (s === 'تأكيد') return { label: 'Confirmed', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle };
  if (s === 'إلغاء') return { label: 'Cancelled', color: 'bg-red-100 text-red-700', icon: XCircle };
  if (s === 'تأجيل') return { label: 'Postponed', color: 'bg-amber-100 text-amber-700', icon: Clock };
  if (s.startsWith('اتصل') || s === 'رقم مغلق' || s === 'لا يرد') return { label: s, color: 'bg-blue-100 text-blue-700', icon: Phone };
  return { label: s, color: 'bg-gray-100 text-gray-600', icon: Clock };
}

function getDefaultDateRange() {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  };
}

/** Get the Monday of the current week */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Generate week options for the last 12 weeks */
function getWeekOptions(): Array<{ value: string; label: string; from: string; to: string }> {
  const weeks: Array<{ value: string; label: string; from: string; to: string }> = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const weekStart = getWeekStart(new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const from = weekStart.toISOString().slice(0, 10);
    const to = weekEnd.toISOString().slice(0, 10);
    const label = i === 0 ? 'This Week' : i === 1 ? 'Last Week' : `${from} → ${to}`;
    weeks.push({ value: `week-${i}`, label, from, to });
  }
  return weeks;
}

export default function LeadArchive() {
  const defaults = useMemo(() => getDefaultDateRange(), []);
  const weekOptions = useMemo(() => getWeekOptions(), []);
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [market, setMarket] = useState<string>('');
  const [agentName, setAgentName] = useState('');
  const [product, setProduct] = useState('');
  const [sku, setSku] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [showFilters, setShowFilters] = useState(false);

  const utils = trpc.useUtils();

  // Stabilize query inputs
  const queryInput = useMemo(() => ({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    market: market || undefined,
    agentName: agentName || undefined,
    product: product || undefined,
    sku: sku || undefined,
    status: statusFilter || undefined,
    page,
    pageSize,
  }), [dateFrom, dateTo, market, agentName, product, sku, statusFilter, page, pageSize]);

  const statsInput = useMemo(() => ({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    market: market || undefined,
  }), [dateFrom, dateTo, market]);

  const { data: leadsData, isLoading } = trpc.leadArchive.query.useQuery(queryInput);
  const { data: stats } = trpc.leadArchive.stats.useQuery(statsInput);

  const syncMutation = trpc.leadArchive.syncStatuses.useMutation({
    onSuccess: (result) => {
      toast.success(`Sync complete: ${result.leadsUpdated} leads updated in ${(result.duration / 1000).toFixed(1)}s`, {
        description: result.errors.length > 0 ? `${result.errors.length} errors occurred` : undefined,
      });
      // Refresh the data
      utils.leadArchive.query.invalidate();
      utils.leadArchive.stats.invalidate();
    },
    onError: (error) => {
      toast.error('Sync failed', { description: error.message });
    },
  });

  const handleClearFilters = () => {
    setMarket('');
    setAgentName('');
    setProduct('');
    setSku('');
    setStatusFilter('');
    setSelectedWeek('');
    setPage(1);
  };

  const handleWeekChange = (value: string) => {
    if (value === 'all') {
      setSelectedWeek('');
      // Reset to default 30-day range
      const d = getDefaultDateRange();
      setDateFrom(d.from);
      setDateTo(d.to);
    } else {
      setSelectedWeek(value);
      const week = weekOptions.find(w => w.value === value);
      if (week) {
        setDateFrom(week.from);
        setDateTo(week.to);
      }
    }
    setPage(1);
  };

  const handlePageSizeChange = (value: string) => {
    const newSize = parseInt(value, 10);
    setPageSize(newSize);
    setPage(1); // Reset to page 1 when changing page size
  };

  const hasActiveFilters = market || agentName || product || sku || statusFilter;

  const handleExportCSV = () => {
    if (!leadsData?.leads.length) return;
    const headers = ['Date', 'Agent', 'Market', 'Customer', 'Phone', 'Wilaya', 'Product', 'Price', 'SKU', 'Status', 'Qty', 'Delivery', 'Notes', 'Tab'];
    const rows = leadsData.leads.map(l => [
      l.workDate,
      l.agentName,
      l.market,
      l.customerName || '',
      l.phone || '',
      l.wilaya || '',
      l.product || '',
      l.price || '',
      l.sku || '',
      l.status || '',
      l.quantity ?? '',
      l.delivery || '',
      l.callNotes || '',
      l.sheetTab || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lead-archive-${dateFrom}-to-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Calculate status breakdown from current page data
  const statusCounts = useMemo(() => {
    if (!leadsData?.leads) return { confirmed: 0, cancelled: 0, postponed: 0, pending: 0, other: 0 };
    const counts = { confirmed: 0, cancelled: 0, postponed: 0, pending: 0, other: 0 };
    for (const l of leadsData.leads) {
      if (!l.status) counts.pending++;
      else if (l.status === 'تأكيد') counts.confirmed++;
      else if (l.status === 'إلغاء') counts.cancelled++;
      else if (l.status === 'تأجيل') counts.postponed++;
      else counts.other++;
    }
    return counts;
  }, [leadsData?.leads]);

  // Get unique agents from stats for the agent dropdown
  const agentOptions = useMemo(() => {
    if (!stats?.agentBreakdown) return [];
    return stats.agentBreakdown
      .sort((a, b) => a.agentName.localeCompare(b.agentName))
      .map(a => ({ value: a.agentName, label: `${a.agentName} (${a.count})` }));
  }, [stats?.agentBreakdown]);

  return (
    <div className="container py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-violet-100 flex items-center justify-center">
            <Database className="h-4.5 w-4.5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Lead Archive</h1>
            <p className="text-xs text-muted-foreground">
              Permanent record of all assigned leads — never lost when sheets are recycled
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="h-8 text-xs"
          >
            <RefreshCw className={`h-3 w-3 mr-1.5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            {syncMutation.isPending ? 'Syncing...' : 'Sync Statuses'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="h-8 text-xs"
          >
            <Filter className="h-3 w-3 mr-1.5" />
            Filters
            {hasActiveFilters && (
              <span className="ml-1.5 h-4 w-4 rounded-full bg-violet-500 text-white text-[10px] flex items-center justify-center">
                !
              </span>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={!leadsData?.leads.length}
            className="h-8 text-xs"
          >
            <Download className="h-3 w-3 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-border/50 bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <BarChart3 className="h-3.5 w-3.5" />
              Total Leads
            </div>
            <div className="text-2xl font-bold font-data text-foreground">
              {stats.totalLeads.toLocaleString()}
            </div>
          </div>
          <div className="rounded-xl border border-border/50 bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Calendar className="h-3.5 w-3.5" />
              Days with Data
            </div>
            <div className="text-2xl font-bold font-data text-foreground">
              {stats.dailyStats.length}
            </div>
          </div>
          <div className="rounded-xl border border-border/50 bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Package className="h-3.5 w-3.5" />
              Markets
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {stats.marketBreakdown.map(m => (
                <span key={m.market} className="text-xs font-medium bg-gray-100 px-2 py-0.5 rounded-full">
                  <CountryFlag country={m.market} flag={MARKETS.find(mk => mk.value === m.market)?.flag || ''} className="inline mr-1" />
                  {m.count.toLocaleString()}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border/50 bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Users className="h-3.5 w-3.5" />
              Agents
            </div>
            <div className="text-2xl font-bold font-data text-foreground">
              {stats.agentBreakdown.length}
            </div>
          </div>
        </div>
      )}

      {/* Date Range + Week Filter (always visible) */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">From</label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setSelectedWeek(''); setPage(1); }}
            className="h-8 text-xs w-36"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">To</label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setSelectedWeek(''); setPage(1); }}
            className="h-8 text-xs w-36"
          />
        </div>
        {/* Quick date buttons */}
        <div className="flex items-center gap-1">
          {[
            { label: '7d', days: 7 },
            { label: '30d', days: 30 },
            { label: '90d', days: 90 },
          ].map(({ label, days }) => (
            <Button
              key={label}
              variant="outline"
              size="sm"
              onClick={() => {
                const to = new Date();
                const from = new Date();
                from.setDate(from.getDate() - days);
                setDateFrom(from.toISOString().slice(0, 10));
                setDateTo(to.toISOString().slice(0, 10));
                setSelectedWeek('');
                setPage(1);
              }}
              className="h-7 text-[10px] px-2"
            >
              {label}
            </Button>
          ))}
        </div>
        {/* Week filter */}
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={selectedWeek || 'all'} onValueChange={handleWeekChange}>
            <SelectTrigger className="h-8 text-xs w-44">
              <SelectValue placeholder="Select Week" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Dates</SelectItem>
              {weekOptions.map(w => (
                <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Advanced Filters (collapsible) */}
      {showFilters && (
        <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Advanced Filters</span>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={handleClearFilters} className="h-6 text-[10px]">
                <X className="h-3 w-3 mr-1" />
                Clear All
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Market</label>
              <Select value={market || 'all'} onValueChange={(v) => { setMarket(v === 'all' ? '' : v); setPage(1); }}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All Markets" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Markets</SelectItem>
                  {MARKETS.map(m => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.flag} {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Agent</label>
              <Select value={agentName || 'all'} onValueChange={(v) => { setAgentName(v === 'all' ? '' : v); setPage(1); }}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All Agents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Agents</SelectItem>
                  {agentOptions.map(a => (
                    <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Status</label>
              <Select value={statusFilter || 'all'} onValueChange={(v) => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending (no status)</SelectItem>
                  <SelectItem value="تأكيد">Confirmed (تأكيد)</SelectItem>
                  <SelectItem value="إلغاء">Cancelled (إلغاء)</SelectItem>
                  <SelectItem value="تأجيل">Postponed (تأجيل)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Product</label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  placeholder="Search product..."
                  value={product}
                  onChange={(e) => { setProduct(e.target.value); setPage(1); }}
                  className="h-8 text-xs pl-7"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground mb-1 block">SKU</label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  placeholder="Search SKU..."
                  value={sku}
                  onChange={(e) => { setSku(e.target.value); setPage(1); }}
                  className="h-8 text-xs pl-7"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results Table */}
      <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading leads...</span>
          </div>
        ) : !leadsData?.leads.length ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Database className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No leads found</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Leads will appear here after you assign them through the dashboard
            </p>
          </div>
        ) : (
          <>
            {/* Status summary bar */}
            <div className="flex items-center gap-4 px-4 py-2.5 border-b border-border/30 bg-gray-50/30">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">This page:</span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-[10px]">
                  <CheckCircle className="h-3 w-3 text-emerald-500" />
                  <span className="font-data font-medium text-emerald-700">{statusCounts.confirmed}</span>
                </span>
                <span className="flex items-center gap-1 text-[10px]">
                  <XCircle className="h-3 w-3 text-red-500" />
                  <span className="font-data font-medium text-red-700">{statusCounts.cancelled}</span>
                </span>
                <span className="flex items-center gap-1 text-[10px]">
                  <Clock className="h-3 w-3 text-amber-500" />
                  <span className="font-data font-medium text-amber-700">{statusCounts.postponed}</span>
                </span>
                <span className="flex items-center gap-1 text-[10px]">
                  <Clock className="h-3 w-3 text-gray-400" />
                  <span className="font-data font-medium text-gray-500">{statusCounts.pending} pending</span>
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50 bg-gray-50/50">
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Date</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Agent</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Status</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Market</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Customer</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Phone</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Wilaya</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Product</th>
                    <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Price</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">SKU</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">Qty</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {leadsData.leads.map((lead) => {
                    const marketInfo = MARKETS.find(m => m.value === lead.market);
                    const badge = getStatusBadge(lead.status);
                    const BadgeIcon = badge.icon;
                    return (
                      <tr key={lead.id} className="border-b border-border/30 hover:bg-gray-50/50 transition-colors">
                        <td className="px-3 py-2 font-data text-foreground whitespace-nowrap">{lead.workDate}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <div className="h-5 w-5 rounded-full bg-violet-100 flex items-center justify-center">
                              <span className="text-[9px] font-bold text-violet-600">
                                {lead.agentName.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className="font-medium text-foreground">{lead.agentName}</span>
                            {lead.agentCode && (
                              <span className="text-[9px] text-muted-foreground bg-gray-100 px-1 rounded">
                                {lead.agentCode}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${badge.color}`}>
                            <BadgeIcon className="h-3 w-3" />
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1">
                            <CountryFlag country={lead.market} flag={marketInfo?.flag || ''} className="text-xs" />
                            <span className="text-muted-foreground capitalize">{lead.market}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2 text-foreground">{lead.customerName || '-'}</td>
                        <td className="px-3 py-2 font-data text-foreground">{lead.phone || '-'}</td>
                        <td className="px-3 py-2 text-foreground">{lead.wilaya || '-'}</td>
                        <td className="px-3 py-2 text-foreground max-w-[150px] truncate">{lead.product || '-'}</td>
                        <td className="px-3 py-2 text-right font-data font-medium text-foreground">{lead.price || '-'}</td>
                        <td className="px-3 py-2 font-data text-muted-foreground">{lead.sku || '-'}</td>
                        <td className="px-3 py-2 text-center font-data text-foreground">{lead.quantity ?? '-'}</td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[120px] truncate" title={lead.callNotes || ''}>
                          {lead.callNotes || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination with page size selector */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/30">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, leadsData.total)} of {leadsData.total.toLocaleString()} leads
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">Per page:</span>
                  <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                    <SelectTrigger className="h-7 text-xs w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZES.map(size => (
                        <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="h-7 text-xs"
                >
                  <ChevronLeft className="h-3 w-3 mr-1" />
                  Prev
                </Button>
                <span className="text-xs font-data text-muted-foreground">
                  Page {page} of {leadsData.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(leadsData.totalPages, p + 1))}
                  disabled={page >= leadsData.totalPages}
                  className="h-7 text-xs"
                >
                  Next
                  <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
