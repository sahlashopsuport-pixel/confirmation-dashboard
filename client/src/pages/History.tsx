/**
 * Assignment & Upload History Page
 *
 * Shows a log of all lead assignments AND uploads with filters, search, and expandable detail view.
 * Allows tracing back any mistake — who assigned/uploaded what, to which agents/partners, when.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { DASHBOARDS, type DashboardSlug } from '@/App';
import {
  History as HistoryIcon,
  Search,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Users,
  Calendar,
  Globe,
  User,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Eye,
  Copy,
  Phone,
  MapPin,
  Package,
  DollarSign,
  Download,
  ArrowUpRight,
  TrendingUp,
  Activity,
  ClipboardCheck,
  ShieldCheck,
  ShieldX,
  Clock,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import CountryFlag from '@/components/CountryFlag';
import PartnerLogo from '@/components/PartnerLogo';

const PAGE_SIZE = 20;

const COUNTRY_LABELS: Record<string, { label: string; flag: string }> = {
  algeria: { label: 'Algeria', flag: '🇩🇿' },
  viconis: { label: 'Viconis', flag: '💎' },
  libya: { label: 'Libya', flag: '🇱🇾' },
  tunisia: { label: 'Tunisia', flag: '🇹🇳' },
};

const PARTNER_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  sellmax: { label: 'Sellmax', color: 'text-orange-700', bg: 'bg-orange-100' },
  ecomamanager: { label: 'Ecomanager', color: 'text-blue-700', bg: 'bg-blue-100' },
  colivraison: { label: 'Colivraison', color: 'text-emerald-700', bg: 'bg-emerald-100' },
  ecotrack_dhd: { label: 'DHD', color: 'text-indigo-700', bg: 'bg-indigo-100' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  success: { label: 'Success', color: 'text-teal', bg: 'bg-teal-light', icon: CheckCircle2 },
  partial: { label: 'Partial', color: 'text-amber', bg: 'bg-amber-light', icon: AlertTriangle },
  failed: { label: 'Failed', color: 'text-coral', bg: 'bg-coral-light', icon: XCircle },
};

const EVENT_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof Users }> = {
  assignment: { label: 'Assignment', color: 'text-violet-700', bg: 'bg-violet-100', icon: Users },
  export: { label: 'Upload', color: 'text-orange-700', bg: 'bg-orange-100', icon: Download },
  collection: { label: 'Collection', color: 'text-teal-700', bg: 'bg-teal-100', icon: ClipboardCheck },
};

interface ParsedLead {
  date: string;
  customerName: string;
  phone: string;
  wilaya: string;
  product: string;
  price: number | string;
  sku: string;
  address2?: string;
  orderType?: string;
}

export default function History() {
  // Check if current user is super admin
  const authCheck = trpc.dashboardAuth.check.useQuery(undefined, { staleTime: 5 * 60_000 });
  const isSuperAdmin = authCheck.data?.dashboardRole === 'super_admin';

  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleteMode, setDeleteMode] = useState(false);

  // Shared date filter state — synced between DailySummary and table
  const [selectedDate, setSelectedDate] = useState(() => toDateStr(new Date()));
  const [dateFilterEnabled, setDateFilterEnabled] = useState(false);
  const [tzOffset] = useState(() => new Date().getTimezoneOffset());

  // Debounce search input to avoid rapid refetches
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Build stable query input
  const listQueryInput = useMemo(() => ({
    country: countryFilter !== 'all' ? countryFilter : undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    search: searchQuery || undefined,
    date: dateFilterEnabled ? selectedDate : undefined,
    timezoneOffset: dateFilterEnabled ? tzOffset : undefined,
  }), [countryFilter, page, searchQuery, dateFilterEnabled, selectedDate, tzOffset]);

  // Fetch history list — keepPreviousData prevents blank screen during refetch
  const historyQuery = trpc.history.list.useQuery(
    listQueryInput,
    {
      refetchOnWindowFocus: false,
      placeholderData: (prev) => prev, // Keep showing previous data while fetching new
    }
  );

  // Fetch detail when expanded
  const detailQuery = trpc.history.detail.useQuery(
    { id: expandedId! },
    {
      enabled: expandedId !== null,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60_000,  // Detail data doesn't change — cache 5 min
      gcTime: 30 * 60_000,
    }
  );

  // Filter by event type on client side (since the backend returns all types)
  const allRecords = historyQuery.data?.records || [];
  const filteredRecords = useMemo(() => {
    if (eventTypeFilter === 'all') return allRecords;
    return allRecords.filter(r => (r.eventType || 'assignment') === eventTypeFilter);
  }, [allRecords, eventTypeFilter]);

  const records = filteredRecords;
  const total = historyQuery.data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleSearch = useCallback((value: string) => {
    setSearchInput(value);
    setPage(0);
  }, []);

  const toggleExpand = useCallback((id: number) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  const copyLeadsToClipboard = useCallback((leadsJson: string | null) => {
    if (!leadsJson) return;
    try {
      const leads: ParsedLead[] = JSON.parse(leadsJson);
      const text = leads.map(l =>
        `${l.customerName}\t${l.phone}\t${l.wilaya}\t${l.product}\t${l.price}\t${l.sku}\t${l.date}`
      ).join('\n');
      navigator.clipboard.writeText(text);
      toast.success(`Copied ${leads.length} leads to clipboard`);
    } catch {
      toast.error('Failed to copy leads');
    }
  }, []);

  const formatDate = useCallback((date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  // Delete mutation (admin only)
  const deleteMutation = trpc.history.deleteEntries.useMutation({
    onSuccess: (data) => {
      toast.success(`Deleted ${data.deletedCount} record${data.deletedCount !== 1 ? 's' : ''}`);
      setSelectedIds(new Set());
      setDeleteMode(false);
      historyQuery.refetch();
    },
    onError: (err) => {
      toast.error(`Delete failed: ${err.message}`);
    },
  });

  const toggleSelectId = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === records.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(records.map(r => r.id)));
    }
  }, [records, selectedIds.size]);

  const handleBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} record${selectedIds.size !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    deleteMutation.mutate({ historyIds: Array.from(selectedIds) });
  }, [selectedIds, deleteMutation]);

  const handleSingleDelete = useCallback((id: number) => {
    if (!confirm('Are you sure you want to delete this record? This cannot be undone.')) return;
    deleteMutation.mutate({ historyIds: [id] });
  }, [deleteMutation]);

  return (
    <div className="min-h-screen bg-background">
      <main className="container py-6 space-y-5">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-violet-100 flex items-center justify-center">
              <HistoryIcon className="h-4.5 w-4.5 text-violet-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">History</h1>
              <p className="text-xs text-muted-foreground">
                Track all lead assignments & uploads · {total} total record{total !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          {/* Admin delete controls */}
          {isSuperAdmin && (
            <div className="flex items-center gap-2">
              {deleteMode ? (
                <>
                  {selectedIds.size > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleBulkDelete}
                      disabled={deleteMutation.isPending}
                      className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3 mr-1.5" />
                      Delete {selectedIds.size} selected
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setDeleteMode(false); setSelectedIds(new Set()); }}
                    className="h-8 text-xs"
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteMode(true)}
                  className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50"
                >
                  <Trash2 className="h-3 w-3 mr-1.5" />
                  Delete Records
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Daily Operations Summary */}
        <DailySummary
          selectedDate={selectedDate}
          setSelectedDate={(d) => { setSelectedDate(d); setPage(0); }}
          dateFilterEnabled={dateFilterEnabled}
          onDateFilterToggle={(enabled) => { setDateFilterEnabled(enabled); setPage(0); }}
        />

        {/* Filters Bar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Event type filter */}
          <div className="flex items-center gap-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setEventTypeFilter('all'); setPage(0); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  eventTypeFilter === 'all'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                All Types
              </button>
              <button
                onClick={() => { setEventTypeFilter('assignment'); setPage(0); }}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  eventTypeFilter === 'assignment'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <Users className="h-3 w-3" />
                Assignments
              </button>
              <button
                onClick={() => { setEventTypeFilter('export'); setPage(0); }}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  eventTypeFilter === 'export'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <Download className="h-3 w-3" />
                Uploads
              </button>
              <button
                onClick={() => { setEventTypeFilter('collection'); setPage(0); }}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  eventTypeFilter === 'collection'
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <ClipboardCheck className="h-3 w-3" />
                Collections
              </button>
            </div>
          </div>

          {/* Country filter */}
          <div className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setCountryFilter('all'); setPage(0); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  countryFilter === 'all'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                All
              </button>
              {DASHBOARDS.map(dash => (
                <button
                  key={dash.slug}
                  onClick={() => { setCountryFilter(dash.slug); setPage(0); }}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    countryFilter === dash.slug
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground'
                  }`}
                >
                  <CountryFlag country={dash.slug} flag={dash.flag} className={dash.slug === 'viconis' ? 'h-3.5 w-auto' : 'text-sm'} />
                  <span className="hidden sm:inline">{dash.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by user or partner..."
              value={searchInput}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full h-8 pl-9 pr-3 rounded-lg text-xs bg-secondary/60 text-foreground border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60"
            />
          </div>

          {/* Active date filter badge */}
          {dateFilterEnabled && (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-violet-100 text-violet-700 border border-violet-200">
                <Calendar className="h-3 w-3" />
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                <button
                  onClick={() => { setDateFilterEnabled(false); setPage(0); }}
                  className="ml-1 hover:bg-violet-200 rounded-full p-0.5 transition-colors"
                  title="Clear date filter"
                >
                  <XCircle className="h-3 w-3" />
                </button>
              </span>
            </div>
          )}
        </div>

        {/* Show collection history or assignment/upload history */}
        {eventTypeFilter === 'collection' ? (
          <CollectionHistory countryFilter={countryFilter} />
        ) : (
        <>
        <div className="rounded-xl border border-border/50 bg-card overflow-hidden shadow-sm">
          {/* Table Header */}
          <div className={`grid ${deleteMode ? 'grid-cols-[auto_auto_auto_1fr_1fr_1fr_auto_auto_auto_auto_auto_auto]' : 'grid-cols-[auto_auto_1fr_1fr_1fr_auto_auto_auto_auto_auto]'} gap-4 px-4 py-3 bg-secondary/30 border-b border-border/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider`}>
            {deleteMode && (
              <div className="w-6 flex items-center">
                <input
                  type="checkbox"
                  checked={records.length > 0 && selectedIds.size === records.length}
                  onChange={toggleSelectAll}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
                />
              </div>
            )}
            <div className="w-8" />
            <div className="w-20">Type</div>
            <div>Date & Time</div>
            <div>By</div>
            <div>Country / Target</div>
            <div className="text-center">Leads</div>
            <div className="text-center">Assigned</div>
            <div className="text-center">Failed</div>
            <div className="text-center">Status</div>
            <div className="text-center w-24">Upload</div>
            {deleteMode && <div className="w-8" />}
          </div>

          {/* Loading state */}
          {historyQuery.isLoading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <div className="flex items-center gap-2 text-sm">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading history...
              </div>
            </div>
          )}

          {/* Empty state */}
          {!historyQuery.isLoading && records.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <HistoryIcon className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">No history found</p>
              <p className="text-xs mt-1">
                {searchInput || countryFilter !== 'all' || eventTypeFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Assignments and uploads will appear here'}
              </p>
            </div>
          )}

          {/* Records */}
          {records.map((record) => {
            const isExpanded = expandedId === record.id;
            const statusCfg = STATUS_CONFIG[record.status] || STATUS_CONFIG.success;
            const StatusIcon = statusCfg.icon;
            const countryInfo = COUNTRY_LABELS[record.country] || { label: record.country, flag: '🌍' };
            const eventType = (record as any).eventType || 'assignment';
            const eventCfg = EVENT_TYPE_CONFIG[eventType] || EVENT_TYPE_CONFIG.assignment;
            const EventIcon = eventCfg.icon;
            const isExport = eventType === 'export';
            const partnerCfg = isExport ? (PARTNER_CONFIG[record.sheetTab] || null) : null;

            // Parse metadata for upload records
            let metadata: any = null;
            if (isExport && (record as any).metadata) {
              try {
                metadata = JSON.parse((record as any).metadata);
              } catch { /* ignore */ }
            }

            return (
              <div key={record.id} className={`border-b border-border/30 last:border-b-0 ${isExport ? 'bg-orange-50/30' : ''} ${deleteMode && selectedIds.has(record.id) ? 'bg-red-50/50' : ''}`}>
                {/* Main row */}
                <div
                  className={`w-full grid ${deleteMode ? 'grid-cols-[auto_auto_auto_1fr_1fr_1fr_auto_auto_auto_auto_auto_auto]' : 'grid-cols-[auto_auto_1fr_1fr_1fr_auto_auto_auto_auto_auto]'} gap-4 px-4 py-3 text-left hover:bg-secondary/20 transition-colors items-center`}
                >
                  {deleteMode && (
                    <div className="w-6 flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(record.id)}
                        onChange={() => toggleSelectId(record.id)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
                      />
                    </div>
                  )}
                  <button onClick={() => toggleExpand(record.id)} className="w-8 flex items-center justify-center cursor-pointer">
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  {/* Event type badge */}
                  <div className="w-20">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${eventCfg.color} ${eventCfg.bg}`}>
                      <EventIcon className="h-2.5 w-2.5" />
                      {eventCfg.label}
                    </span>
                  </div>
                  <div className="text-xs">
                    {record.workDate ? (
                      <>
                        <span className="font-medium text-foreground">
                          {new Date(record.workDate + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          {', '}
                          {new Date(record.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {record.workDate !== new Date(record.createdAt).toISOString().slice(0, 10) && (
                          <div className="mt-0.5">
                            <span className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground">
                              Created: {formatDate(record.createdAt)}
                            </span>
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="font-medium text-foreground">{formatDate(record.createdAt)}</span>
                    )}
                  </div>
                  <div className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <User className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium text-foreground">{record.assignedBy}</span>
                    </div>
                  </div>
                  <div className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <CountryFlag country={record.country} flag={countryInfo.flag} className={record.country === 'viconis' ? 'h-3.5 w-auto' : undefined} />
                      <span className="font-medium text-foreground">{countryInfo.label}</span>
                      {isExport && partnerCfg ? (
                        <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-bold ${partnerCfg.color} ${partnerCfg.bg}`}>
                          <PartnerLogo partner={record.sheetTab} className="h-3.5 w-auto" />
                          {partnerCfg.label}
                        </span>
                      ) : (
                        <span className="text-muted-foreground font-data">{record.sheetTab}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-center min-w-[60px]">
                    <span className="text-xs font-data font-bold text-foreground">{record.totalLeads}</span>
                  </div>
                  <div className="text-center min-w-[60px]">
                    <span className="text-xs font-data font-bold text-teal">{record.totalAssigned}</span>
                  </div>
                  <div className="text-center min-w-[60px]">
                    <span className={`text-xs font-data font-bold ${record.totalFailed > 0 ? 'text-coral' : 'text-muted-foreground'}`}>
                      {record.totalFailed}
                    </span>
                  </div>
                  <button
                    onClick={() => toggleExpand(record.id)}
                    className="text-center min-w-[80px]"
                  >
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusCfg.color} ${statusCfg.bg}`}>
                      <StatusIcon className="h-3 w-3" />
                      {statusCfg.label}
                    </span>
                  </button>
                  <ValidationCell
                    record={record}
                    isExport={isExport}
                    onValidated={() => historyQuery.refetch()}
                  />
                  {deleteMode && (
                    <div className="w-8 flex items-center justify-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSingleDelete(record.id); }}
                        className="p-1 rounded-md hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-colors"
                        title="Delete this record"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  isExport ? (
                    <ExportDetail
                      record={record}
                      metadata={metadata}
                      partnerCfg={partnerCfg}
                      countryInfo={countryInfo}
                      formatDate={formatDate}
                    />
                  ) : (
                    <ExpandedDetail
                      historyId={record.id}
                      detailQuery={detailQuery}
                      copyLeadsToClipboard={copyLeadsToClipboard}
                    />
                  )
                )}
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="h-7 text-xs"
              >
                <ChevronLeft className="h-3 w-3 mr-1" />
                Prev
              </Button>
              <span className="text-xs text-muted-foreground px-2">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="h-7 text-xs"
              >
                Next
                <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </div>
        )}
        </>
        )}
      </main>
    </div>
  );
}

/** Validation status cell — shows badge + action buttons for upload entries */
function ValidationCell({
  record,
  isExport,
  onValidated,
}: {
  record: any;
  isExport: boolean;
  onValidated: () => void;
}) {
  const validateMutation = trpc.history.validateEntry.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success('Upload validation updated');
        onValidated();
      } else {
        toast.error('Failed to update validation');
      }
    },
    onError: (err) => {
      toast.error(`Validation failed: ${err.message}`);
    },
  });

  const validationStatus = (record as any).validationStatus || 'validated';

  // Non-upload entries don't need validation — show empty cell
  if (!isExport) {
    return <div className="text-center w-24" />;
  }

  // Already validated
  if (validationStatus === 'validated') {
    return (
      <div className="text-center w-24">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-emerald-700 bg-emerald-50">
          <ShieldCheck className="h-3 w-3" />
          Validated
        </span>
      </div>
    );
  }

  // Rejected
  if (validationStatus === 'rejected') {
    return (
      <div className="text-center w-24">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-red-700 bg-red-50">
          <ShieldX className="h-3 w-3" />
          Rejected
        </span>
      </div>
    );
  }

  // Pending — show action buttons
  return (
    <div className="flex items-center gap-1 w-24 justify-center">
      <button
        onClick={(e) => {
          e.stopPropagation();
          validateMutation.mutate({ historyId: record.id, validationStatus: 'validated' });
        }}
        disabled={validateMutation.isPending}
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors disabled:opacity-50"
        title="Mark as validated (uploaded to partner)"
      >
        <ShieldCheck className="h-3 w-3" />
        OK
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          validateMutation.mutate({ historyId: record.id, validationStatus: 'rejected' });
        }}
        disabled={validateMutation.isPending}
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors disabled:opacity-50"
        title="Mark as rejected (not uploaded)"
      >
        <ShieldX className="h-3 w-3" />
      </button>
    </div>
  );
}

/** Upload detail panel showing metadata and sample leads */
function ExportDetail({
  record,
  metadata,
  partnerCfg,
  countryInfo,
  formatDate,
}: {
  record: any;
  metadata: any;
  partnerCfg: { label: string; color: string; bg: string } | null;
  countryInfo: { label: string; flag: string };
  formatDate: (date: Date | string) => string;
}) {
  const sampleLeads = metadata?.sampleLeads || [];
  const duplicatesRemoved = metadata?.duplicatesRemoved || 0;
  const upsellCount = metadata?.upsellCount || 0;
  const partner = metadata?.partner || record.sheetTab;

  return (
    <div className="px-12 py-4 bg-orange-50/40 border-t border-border/20 space-y-3">
      <h4 className="text-xs font-semibold text-foreground flex items-center gap-2">
        <Download className="h-3.5 w-3.5 text-orange-500" />
        Upload Details
      </h4>

      {/* Upload summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border/40 bg-card p-3 text-center">
          <p className="text-lg font-bold font-mono text-foreground">{record.totalLeads}</p>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Leads Uploaded</p>
        </div>
        <div className="rounded-lg border border-border/40 bg-card p-3 text-center">
          <div className="flex items-center justify-center gap-2">
            <PartnerLogo partner={partner} className="h-5 w-auto" />
            <p className="text-lg font-bold font-mono text-foreground">
              {partnerCfg ? (
                <span className={partnerCfg.color}>{partnerCfg.label}</span>
              ) : partner}
            </p>
          </div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Partner</p>
        </div>
        {duplicatesRemoved > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
            <p className="text-lg font-bold font-mono text-amber-600">{duplicatesRemoved}</p>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Dupes Removed</p>
          </div>
        )}
        {upsellCount > 0 && (
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-center">
            <p className="text-lg font-bold font-mono text-purple-600">{upsellCount}</p>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Upsells (×2)</p>
          </div>
        )}
      </div>

      {/* Sample leads */}
      {sampleLeads.length > 0 && (
        <div className="rounded-lg border border-border/40 bg-card overflow-hidden">
          <div className="px-3 py-2 bg-secondary/30 border-b border-border/30 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Sample Leads (first {sampleLeads.length})
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-secondary/20">
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">#</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Name</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Phone</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Address</th>
                  {partner === 'sellmax' && (
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Ref</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {sampleLeads.map((lead: any, idx: number) => (
                  <tr key={idx} className="border-t border-border/20 hover:bg-secondary/10">
                    <td className="px-3 py-1.5 text-muted-foreground font-data">{idx + 1}</td>
                    <td className="px-3 py-1.5 font-medium">{lead.name || '-'}</td>
                    <td className="px-3 py-1.5 font-data">{lead.phone || '-'}</td>
                    <td className="px-3 py-1.5">{lead.address || '-'}</td>
                    {partner === 'sellmax' && (
                      <td className="px-3 py-1.5 font-data">{lead.ref || '-'}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/** Expanded detail panel showing per-agent breakdown and leads */
function ExpandedDetail({
  historyId,
  detailQuery,
  copyLeadsToClipboard,
}: {
  historyId: number;
  detailQuery: any;
  copyLeadsToClipboard: (json: string | null) => void;
}) {
  const [expandedAgent, setExpandedAgent] = useState<number | null>(null);

  const isLoading = detailQuery.isLoading;
  const items = detailQuery.data?.items || [];
  const isCorrectDetail = detailQuery.data?.history?.id === historyId;

  if (isLoading || !isCorrectDetail) {
    return (
      <div className="px-12 py-6 bg-secondary/10 border-t border-border/20">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading assignment details...
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="px-12 py-6 bg-secondary/10 border-t border-border/20">
        <p className="text-xs text-muted-foreground">No agent details available for this assignment.</p>
      </div>
    );
  }

  return (
    <div className="px-12 py-4 bg-secondary/10 border-t border-border/20 space-y-3">
      <h4 className="text-xs font-semibold text-foreground flex items-center gap-2">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        Per-Agent Breakdown ({items.length} agent{items.length !== 1 ? 's' : ''})
      </h4>

      <div className="space-y-2">
        {items.map((item: any) => {
          const isAgentExpanded = expandedAgent === item.id;
          let leads: ParsedLead[] = [];
          try {
            leads = item.leadsJson ? JSON.parse(item.leadsJson) : [];
          } catch { /* ignore */ }

          return (
            <div key={item.id} className="rounded-lg border border-border/40 bg-card overflow-hidden">
              {/* Agent row */}
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-primary">
                      {item.agentName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-foreground">{item.agentName}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground font-data">
                        {item.leadCount} lead{item.leadCount !== 1 ? 's' : ''}
                      </span>
                      {item.success === 1 ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-teal">
                          <CheckCircle2 className="h-2.5 w-2.5" /> OK
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-coral">
                          <XCircle className="h-2.5 w-2.5" /> Failed
                        </span>
                      )}
                      {item.errorMessage && (
                        <span className="text-[10px] text-coral">{item.errorMessage}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {leads.length > 0 && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyLeadsToClipboard(item.leadsJson)}
                        className="h-6 text-[10px] rounded-md px-2"
                      >
                        <Copy className="h-2.5 w-2.5 mr-1" />
                        Copy
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setExpandedAgent(isAgentExpanded ? null : item.id)}
                        className="h-6 text-[10px] rounded-md px-2"
                      >
                        <Eye className="h-2.5 w-2.5 mr-1" />
                        {isAgentExpanded ? 'Hide' : 'View'} Leads
                        {isAgentExpanded ? (
                          <ChevronUp className="h-2.5 w-2.5 ml-1" />
                        ) : (
                          <ChevronDown className="h-2.5 w-2.5 ml-1" />
                        )}
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Leads table */}
              {isAgentExpanded && leads.length > 0 && (
                <div className="border-t border-border/30 overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-secondary/30">
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">#</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">
                          <div className="flex items-center gap-1"><Calendar className="h-2.5 w-2.5" /> Date</div>
                        </th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">
                          <div className="flex items-center gap-1"><User className="h-2.5 w-2.5" /> Name</div>
                        </th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">
                          <div className="flex items-center gap-1"><Phone className="h-2.5 w-2.5" /> Phone</div>
                        </th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">
                          <div className="flex items-center gap-1"><MapPin className="h-2.5 w-2.5" /> Wilaya</div>
                        </th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">
                          <div className="flex items-center gap-1"><Package className="h-2.5 w-2.5" /> Product</div>
                        </th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">
                          <div className="flex items-center justify-end gap-1"><DollarSign className="h-2.5 w-2.5" /> Price</div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {leads.map((lead, idx) => (
                        <tr key={idx} className="border-t border-border/20 hover:bg-secondary/10">
                          <td className="px-3 py-1.5 text-muted-foreground font-data">{idx + 1}</td>
                          <td className="px-3 py-1.5 font-data">{lead.date}</td>
                          <td className="px-3 py-1.5 font-medium">{lead.customerName}</td>
                          <td className="px-3 py-1.5 font-data">{lead.phone}</td>
                          <td className="px-3 py-1.5">{lead.wilaya}</td>
                          <td className="px-3 py-1.5 max-w-[200px] truncate">{lead.product}</td>
                          <td className="px-3 py-1.5 text-right font-data font-medium">{lead.price}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const MARKET_CONFIG: Record<string, { label: string; flag: string; color: string; bg: string }> = {
  algeria: { label: 'Algeria', flag: '🇩🇿', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  viconis: { label: 'Viconis', flag: '💎', color: 'text-purple-700', bg: 'bg-purple-50' },
  libya: { label: 'Libya', flag: '🇱🇾', color: 'text-red-700', bg: 'bg-red-50' },
  tunisia: { label: 'Tunisia', flag: '🇹🇳', color: 'text-blue-700', bg: 'bg-blue-50' },
};

const EXPORT_PARTNER_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  sellmax: { label: 'Sellmax', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
  ecomamanager: { label: 'Ecomanager', color: 'text-sky-700', bg: 'bg-sky-50', border: 'border-sky-200' },
  colivraison: { label: 'Colivraison', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  ecotrack_dhd: { label: 'DHD', color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200' },
};

/** Format a Date to YYYY-MM-DD string in local time */
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Check if a YYYY-MM-DD string represents today in local time */
function isToday(dateStr: string): boolean {
  return dateStr === toDateStr(new Date());
}

function DailySummary({
  selectedDate,
  setSelectedDate,
  onDateFilterToggle,
  dateFilterEnabled,
}: {
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  onDateFilterToggle: (enabled: boolean) => void;
  dateFilterEnabled: boolean;
}) {
  const [tzOffset] = useState(() => new Date().getTimezoneOffset());
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<number | null>(null);

  const isTodaySelected = isToday(selectedDate);

  const goToPreviousDay = useCallback(() => {
    const d = new Date(selectedDate + 'T12:00:00'); // noon to avoid DST issues
    d.setDate(d.getDate() - 1);
    setSelectedDate(toDateStr(d));
    setExpandedCountry(null);
    setExpandedAgent(null);
  }, [selectedDate, setSelectedDate]);

  const goToNextDay = useCallback(() => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    const today = toDateStr(new Date());
    const next = toDateStr(d);
    setSelectedDate(next > today ? today : next);
    setExpandedCountry(null);
    setExpandedAgent(null);
  }, [selectedDate, setSelectedDate]);

  const goToToday = useCallback(() => {
    setSelectedDate(toDateStr(new Date()));
    setExpandedCountry(null);
    setExpandedAgent(null);
  }, [setSelectedDate]);

  // Build stable query input
  const queryInput = useMemo(() => ({
    timezoneOffset: tzOffset,
    ...(isTodaySelected ? {} : { date: selectedDate }),
  }), [tzOffset, selectedDate, isTodaySelected]);

  const statsQuery = trpc.history.dailyStats.useQuery(queryInput, {
    refetchOnWindowFocus: false,
    refetchInterval: isTodaySelected ? 60_000 : false, // Only auto-refresh for today
    staleTime: isTodaySelected ? 60_000 : 5 * 60_000,
    placeholderData: (prev: any) => prev,
  });

  const stats = statsQuery.data;
  const isLoading = statsQuery.isLoading;

  // Get record IDs for the expanded country
  const expandedRecordIds = useMemo(() => {
    if (!expandedCountry || !stats) return [];
    const match = stats.assignments.find(a => a.country === expandedCountry);
    return match?.recordIds || [];
  }, [expandedCountry, stats]);

  // Fetch batch detail when a country is expanded
  const batchDetailQuery = trpc.history.batchDetail.useQuery(
    { ids: expandedRecordIds },
    {
      enabled: expandedRecordIds.length > 0,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
    }
  );

  // Aggregate items by agent name
  const agentBreakdown = useMemo(() => {
    const items = batchDetailQuery.data?.items || [];
    const byAgent = new Map<string, { totalLeads: number; allLeadsJson: string[]; batches: string[] }>();
    for (const item of items) {
      const existing = byAgent.get(item.agentName) || { totalLeads: 0, allLeadsJson: [], batches: [] };
      existing.totalLeads += item.leadCount;
      if (item.leadsJson) existing.allLeadsJson.push(item.leadsJson);
      if (item.sheetTab && !existing.batches.includes(item.sheetTab)) existing.batches.push(item.sheetTab);
      byAgent.set(item.agentName, existing);
    }
    return Array.from(byAgent.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.totalLeads - a.totalLeads);
  }, [batchDetailQuery.data]);

  const copyAllLeadsForAgent = useCallback((allLeadsJson: string[]) => {
    try {
      const allLeads: ParsedLead[] = [];
      for (const json of allLeadsJson) {
        const parsed = JSON.parse(json);
        allLeads.push(...parsed);
      }
      const text = allLeads.map(l =>
        `${l.customerName}\t${l.phone}\t${l.wilaya}\t${l.product}\t${l.price}\t${l.sku}\t${l.date}`
      ).join('\n');
      navigator.clipboard.writeText(text);
      toast.success(`Copied ${allLeads.length} leads to clipboard`);
    } catch {
      toast.error('Failed to copy leads');
    }
  }, []);

  // Format the selected date for display (must be before early returns)
  const displayDate = useMemo(() => {
    const d = new Date(selectedDate + 'T12:00:00');
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
  }, [selectedDate]);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm animate-pulse">
        <div className="h-5 w-48 bg-secondary/60 rounded mb-3" />
        <div className="grid grid-cols-3 gap-3">
          <div className="h-16 bg-secondary/40 rounded-lg" />
          <div className="h-16 bg-secondary/40 rounded-lg" />
          <div className="h-16 bg-secondary/40 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const { assignments, exports: exportStats, totals } = stats;
  const hasData = totals.totalOperations > 0;

  return (
    <div className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-secondary/20">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Activity className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">
              {isTodaySelected ? "Today's Operations" : 'Daily Operations'}
            </h3>
            <div className="flex items-center gap-1.5">
              <button
                onClick={goToPreviousDay}
                className="h-5 w-5 rounded flex items-center justify-center hover:bg-secondary/60 transition-colors text-muted-foreground hover:text-foreground"
                title="Previous day"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <p className="text-[10px] text-muted-foreground font-medium min-w-[160px] text-center">
                {displayDate}
              </p>
              <button
                onClick={goToNextDay}
                disabled={isTodaySelected}
                className={`h-5 w-5 rounded flex items-center justify-center transition-colors ${
                  isTodaySelected
                    ? 'text-muted-foreground/30 cursor-not-allowed'
                    : 'hover:bg-secondary/60 text-muted-foreground hover:text-foreground'
                }`}
                title="Next day"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              {!isTodaySelected && (
                <button
                  onClick={goToToday}
                  className="ml-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Today
                </button>
              )}
              {/* Date filter toggle — syncs the table below with this date */}
              <button
                onClick={() => onDateFilterToggle(!dateFilterEnabled)}
                className={`ml-2 px-2.5 py-0.5 rounded-md text-[10px] font-semibold transition-all border ${
                  dateFilterEnabled
                    ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                    : 'bg-secondary/60 text-muted-foreground border-border/50 hover:bg-secondary hover:text-foreground'
                }`}
                title={dateFilterEnabled ? 'Click to show all records' : 'Click to filter table by this date'}
              >
                <span className="flex items-center gap-1">
                  <Calendar className="h-2.5 w-2.5" />
                  {dateFilterEnabled ? 'Filtered' : 'Filter Table'}
                </span>
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {statsQuery.isFetching && !statsQuery.isLoading && (
            <svg className="animate-spin w-3.5 h-3.5 text-muted-foreground" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {hasData && (
            <>
              <div className="text-right">
                <p className="text-lg font-bold font-mono text-foreground">{totals.totalAssigned + totals.totalExported}</p>
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Total Leads</p>
              </div>
              <div className="h-8 w-px bg-border/50" />
              <div className="text-right">
                <p className="text-lg font-bold font-mono text-foreground">{totals.totalOperations}</p>
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Operations</p>
              </div>
            </>
          )}
        </div>
      </div>

      {!hasData ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <div className="text-center">
            <Activity className="h-6 w-6 mx-auto mb-1.5 opacity-30" />
            <p className="text-xs font-medium">
              {isTodaySelected ? 'No operations yet today' : 'No operations on this day'}
            </p>
            <p className="text-[10px] mt-0.5">
              {isTodaySelected ? 'Assignments and uploads will appear here' : 'Try navigating to a different date'}
            </p>
          </div>
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {/* Assignments by Market */}
          {assignments.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Users className="h-3 w-3 text-violet-500" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Assigned to Agents</span>
                <span className="text-[10px] font-bold font-mono text-violet-600 ml-auto">{totals.totalAssigned} leads</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {assignments.map((a) => {
                  const cfg = MARKET_CONFIG[a.country] || { label: a.country, flag: '\u{1F30D}', color: 'text-gray-700', bg: 'bg-gray-50' };
                  const isExpanded = expandedCountry === a.country;
                  return (
                    <button
                      key={a.country}
                      onClick={() => {
                        setExpandedCountry(isExpanded ? null : a.country);
                        setExpandedAgent(null);
                      }}
                      className={`rounded-lg border ${isExpanded ? 'border-primary/50 ring-2 ring-primary/20' : 'border-border/40'} ${cfg.bg} p-3 flex items-center gap-3 text-left transition-all hover:shadow-sm cursor-pointer w-full`}
                    >
                      <CountryFlag country={a.country} flag={cfg.flag} className={a.country === 'viconis' ? 'h-6 w-auto' : 'text-xl'} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-lg font-bold font-mono ${cfg.color}`}>{a.totalLeads.toLocaleString()}</p>
                        <p className="text-[10px] font-semibold text-muted-foreground truncate">{cfg.label} · {a.count} batch{a.count !== 1 ? 'es' : ''}</p>
                      </div>
                      <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  );
                })}
              </div>

              {/* Expanded Country Detail */}
              {expandedCountry && (
                <div className="mt-3 rounded-lg border border-border/40 bg-secondary/10 overflow-hidden">
                  {batchDetailQuery.isLoading ? (
                    <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
                      <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Loading agent breakdown...
                    </div>
                  ) : agentBreakdown.length === 0 ? (
                    <div className="p-4 text-xs text-muted-foreground">No agent details available.</div>
                  ) : (
                    <div className="divide-y divide-border/30">
                      {/* Summary header */}
                      <div className="px-4 py-2.5 bg-secondary/20 flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          {agentBreakdown.length} agent{agentBreakdown.length !== 1 ? 's' : ''} · {MARKET_CONFIG[expandedCountry]?.label || expandedCountry}
                        </span>
                        <span className="text-[10px] font-mono font-bold text-muted-foreground">
                          {agentBreakdown.reduce((s, a) => s + a.totalLeads, 0)} total leads
                        </span>
                      </div>

                      {/* Agent rows */}
                      {agentBreakdown.map((agent) => {
                        const isAgentOpen = expandedAgent === agent.name.length + agent.totalLeads; // simple unique key
                        const agentKey = `${agent.name}-${agent.totalLeads}`;
                        const agentKeyNum = agentKey.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
                        const isOpen = expandedAgent === agentKeyNum;

                        // Parse all leads for this agent
                        let allLeads: ParsedLead[] = [];
                        try {
                          for (const json of agent.allLeadsJson) {
                            allLeads.push(...JSON.parse(json));
                          }
                        } catch { /* ignore */ }

                        return (
                          <div key={agent.name}>
                            <div className="flex items-center justify-between px-4 py-2.5 hover:bg-secondary/10 transition-colors">
                              <div className="flex items-center gap-3">
                                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                                  <span className="text-[10px] font-bold text-primary">
                                    {agent.name.charAt(0).toUpperCase()}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-xs font-semibold text-foreground">{agent.name}</span>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[10px] text-muted-foreground font-data">
                                      {agent.totalLeads} lead{agent.totalLeads !== 1 ? 's' : ''}
                                    </span>
                                    {agent.batches.length > 0 && (
                                      <span className="text-[10px] text-muted-foreground">
                                        · {agent.batches.join(', ')}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {allLeads.length > 0 && (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        copyAllLeadsForAgent(agent.allLeadsJson);
                                      }}
                                      className="h-6 text-[10px] rounded-md px-2"
                                    >
                                      <Copy className="h-2.5 w-2.5 mr-1" />
                                      Copy
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedAgent(isOpen ? null : agentKeyNum);
                                      }}
                                      className="h-6 text-[10px] rounded-md px-2"
                                    >
                                      <Eye className="h-2.5 w-2.5 mr-1" />
                                      {isOpen ? 'Hide' : 'View'} Leads
                                      {isOpen ? (
                                        <ChevronUp className="h-2.5 w-2.5 ml-1" />
                                      ) : (
                                        <ChevronDown className="h-2.5 w-2.5 ml-1" />
                                      )}
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Leads table for this agent */}
                            {isOpen && allLeads.length > 0 && (
                              <div className="border-t border-border/30 overflow-x-auto bg-card">
                                <table className="w-full text-[11px]">
                                  <thead>
                                    <tr className="bg-secondary/30">
                                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">#</th>
                                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">
                                        <div className="flex items-center gap-1"><Calendar className="h-2.5 w-2.5" /> Date</div>
                                      </th>
                                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">
                                        <div className="flex items-center gap-1"><User className="h-2.5 w-2.5" /> Name</div>
                                      </th>
                                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">
                                        <div className="flex items-center gap-1"><Phone className="h-2.5 w-2.5" /> Phone</div>
                                      </th>
                                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">
                                        <div className="flex items-center gap-1"><MapPin className="h-2.5 w-2.5" /> Wilaya</div>
                                      </th>
                                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">
                                        <div className="flex items-center gap-1"><Package className="h-2.5 w-2.5" /> Product</div>
                                      </th>
                                      <th className="text-right px-3 py-2 font-semibold text-muted-foreground">
                                        <div className="flex items-center justify-end gap-1"><DollarSign className="h-2.5 w-2.5" /> Price</div>
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {allLeads.map((lead, idx) => (
                                      <tr key={idx} className="border-t border-border/20 hover:bg-secondary/10">
                                        <td className="px-3 py-1.5 text-muted-foreground font-data">{idx + 1}</td>
                                        <td className="px-3 py-1.5 font-data">{lead.date}</td>
                                        <td className="px-3 py-1.5 font-medium">{lead.customerName}</td>
                                        <td className="px-3 py-1.5 font-data">{lead.phone}</td>
                                        <td className="px-3 py-1.5">{lead.wilaya}</td>
                                        <td className="px-3 py-1.5 max-w-[200px] truncate">{lead.product}</td>
                                        <td className="px-3 py-1.5 text-right font-data font-medium">{lead.price}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Uploads by Partner — split into Leads vs Confirmed Orders */}
          {(() => {
            const leadPartners = exportStats.filter((e) => e.partner !== 'ecotrack_dhd');
            const confirmedPartners = exportStats.filter((e) => e.partner === 'ecotrack_dhd');
            const leadTotal = leadPartners.reduce((s, e) => s + e.totalLeads, 0);
            const confirmedTotal = confirmedPartners.reduce((s, e) => s + e.totalLeads, 0);
            return (
              <>
                {leadPartners.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Download className="h-3 w-3 text-orange-500" />
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Uploaded Leads to Partners</span>
                      <span className="text-[10px] font-bold font-mono text-orange-600 ml-auto">{leadTotal} leads</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {leadPartners.map((e) => {
                        const cfg = EXPORT_PARTNER_CONFIG[e.partner] || { label: e.partner, color: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-200' };
                        const countryCfg = MARKET_CONFIG[e.country];
                        return (
                          <div key={e.partner} className={`rounded-lg border ${cfg.border} ${cfg.bg} p-3 flex items-center gap-3`}>
                            <div className="h-8 w-8 rounded-lg bg-white/80 flex items-center justify-center border border-border/30 overflow-hidden">
                              <PartnerLogo partner={e.partner} className="h-6 w-auto" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-lg font-bold font-mono ${cfg.color}`}>{e.totalLeads.toLocaleString()}</p>
                              <p className="text-[10px] font-semibold text-muted-foreground truncate flex items-center gap-1">
                                {cfg.label} {countryCfg ? <><span>·</span> <CountryFlag country={e.country} flag={countryCfg.flag} className={e.country === 'viconis' ? 'h-3 w-auto' : undefined} /></> : ''} <span>·</span> {e.count} upload{e.count !== 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {confirmedPartners.length > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Download className="h-3 w-3 text-purple-500" />
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Uploaded Confirmed Orders</span>
                      <span className="text-[10px] font-bold font-mono text-purple-600 ml-auto">{confirmedTotal} orders</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {confirmedPartners.map((e) => {
                        const cfg = EXPORT_PARTNER_CONFIG[e.partner] || { label: e.partner, color: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-200' };
                        const countryCfg = MARKET_CONFIG[e.country];
                        return (
                          <div key={e.partner} className={`rounded-lg border ${cfg.border} ${cfg.bg} p-3 flex items-center gap-3`}>
                            <div className="h-8 w-8 rounded-lg bg-white/80 flex items-center justify-center border border-border/30 overflow-hidden">
                              <PartnerLogo partner={e.partner} className="h-6 w-auto" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-lg font-bold font-mono ${cfg.color}`}>{e.totalLeads.toLocaleString()}</p>
                              <p className="text-[10px] font-semibold text-muted-foreground truncate flex items-center gap-1">
                                {cfg.label} {countryCfg ? <><span>·</span> <CountryFlag country={e.country} flag={countryCfg.flag} className={e.country === 'viconis' ? 'h-3 w-auto' : undefined} /></> : ''} <span>·</span> {e.count} upload{e.count !== 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

/** Collection History — shows batches of collected orders with expandable detail */
function CollectionHistory({ countryFilter }: { countryFilter: string }) {
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const queryInput = useMemo(() => ({
    country: countryFilter !== 'all' ? countryFilter : undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }), [countryFilter, page]);

  const listQuery = trpc.collectionHistory.list.useQuery(queryInput, {
    refetchOnWindowFocus: false,
    placeholderData: (prev: any) => prev,
  });

  const detailQuery = trpc.collectionHistory.detail.useQuery(
    { batchId: expandedId! },
    {
      enabled: expandedId !== null,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
    }
  );

  const records = listQuery.data?.records || [];
  const total = listQuery.data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const formatDate = useCallback((date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  return (
    <>
      <div className="rounded-xl border border-border/50 bg-card overflow-hidden shadow-sm">
        {/* Table Header */}
        <div className="grid grid-cols-[auto_1fr_1fr_auto_auto_auto_auto_auto] gap-4 px-4 py-3 bg-teal-50/50 border-b border-border/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <div className="w-8" />
          <div>Date & Time</div>
          <div>Collected By</div>
          <div className="text-center">Country</div>
          <div className="text-center">Orders</div>
          <div className="text-center">Agents</div>
          <div className="text-center">Success</div>
          <div className="text-center">Status</div>
        </div>

        {/* Loading state */}
        {listQuery.isLoading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <div className="flex items-center gap-2 text-sm">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading collection history...
            </div>
          </div>
        )}

        {/* Empty state */}
        {!listQuery.isLoading && records.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <ClipboardCheck className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No collections found</p>
            <p className="text-xs mt-1">
              {countryFilter !== 'all'
                ? 'Try selecting a different country'
                : 'Collections will appear here after you mark orders as collected'}
            </p>
          </div>
        )}

        {/* Records */}
        {records.map((batch) => {
          const isExpanded = expandedId === batch.id;
          const countryInfo = COUNTRY_LABELS[batch.country] || { label: batch.country, flag: '🌍' };
          const statusCfg = STATUS_CONFIG[batch.status] || STATUS_CONFIG.success;
          const StatusIcon = statusCfg.icon;

          return (
            <div key={batch.id} className="border-b border-border/30 last:border-b-0">
              {/* Main row */}
              <button
                onClick={() => setExpandedId(prev => prev === batch.id ? null : batch.id)}
                className="w-full grid grid-cols-[auto_1fr_1fr_auto_auto_auto_auto_auto] gap-4 px-4 py-3 text-left hover:bg-teal-50/30 transition-colors items-center"
              >
                <div className="w-8 flex items-center justify-center">
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="text-xs">
                  <span className="font-medium text-foreground">{formatDate(batch.createdAt)}</span>
                </div>
                <div className="text-xs">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium text-foreground">{batch.collectedBy}</span>
                  </div>
                </div>
                <div className="text-center min-w-[80px]">
                  <div className="flex items-center justify-center gap-1">
                    <CountryFlag country={batch.country} flag={countryInfo.flag} className={batch.country === 'viconis' ? 'h-3.5 w-auto' : undefined} />
                    <span className="text-xs font-medium text-foreground">{countryInfo.label}</span>
                  </div>
                </div>
                <div className="text-center min-w-[60px]">
                  <span className="text-xs font-data font-bold text-foreground">{batch.totalOrders}</span>
                </div>
                <div className="text-center min-w-[60px]">
                  <span className="text-xs font-data font-bold text-primary">{batch.agentCount}</span>
                </div>
                <div className="text-center min-w-[60px]">
                  <span className="text-xs font-data font-bold text-teal">{batch.successCount}</span>
                  {batch.failCount > 0 && (
                    <span className="text-xs font-data font-bold text-coral ml-1">/ {batch.failCount} fail</span>
                  )}
                </div>
                <div className="text-center min-w-[80px]">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusCfg.color} ${statusCfg.bg}`}>
                    <StatusIcon className="h-3 w-3" />
                    {statusCfg.label}
                  </span>
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <CollectionBatchDetail
                  batchId={batch.id}
                  detailQuery={detailQuery}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="h-7 text-xs"
            >
              <ChevronLeft className="h-3 w-3 mr-1" />
              Prev
            </Button>
            <span className="text-xs text-muted-foreground px-2">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="h-7 text-xs"
            >
              Next
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

/** Expanded detail for a collection batch — shows individual orders grouped by agent */
function CollectionBatchDetail({
  batchId,
  detailQuery,
}: {
  batchId: number;
  detailQuery: any;
}) {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const isLoading = detailQuery.isLoading;
  const data = detailQuery.data;
  const isCorrectBatch = data?.batch?.id === batchId;

  if (isLoading || !isCorrectBatch) {
    return (
      <div className="px-12 py-6 bg-teal-50/20 border-t border-border/20">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading collection details...
        </div>
      </div>
    );
  }

  const orders = data?.orders || [];
  if (orders.length === 0) {
    return (
      <div className="px-12 py-6 bg-teal-50/20 border-t border-border/20">
        <p className="text-xs text-muted-foreground">No order details available for this collection.</p>
      </div>
    );
  }

  // Group orders by agent
  const byAgent = new Map<string, typeof orders>();
  for (const order of orders) {
    const existing = byAgent.get(order.agentName) || [];
    existing.push(order);
    byAgent.set(order.agentName, existing);
  }
  const agentGroups = Array.from(byAgent.entries()).sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="px-12 py-4 bg-teal-50/20 border-t border-border/20 space-y-3">
      <h4 className="text-xs font-semibold text-foreground flex items-center gap-2">
        <ClipboardCheck className="h-3.5 w-3.5 text-teal-600" />
        Collected Orders by Agent ({agentGroups.length} agent{agentGroups.length !== 1 ? 's' : ''}, {orders.length} order{orders.length !== 1 ? 's' : ''})
      </h4>

      <div className="space-y-2">
        {agentGroups.map(([agentName, agentOrders]) => {
          const isOpen = expandedAgent === agentName;
          const successCount = agentOrders.filter((o: any) => o.success === 1).length;
          const failCount = agentOrders.length - successCount;

          return (
            <div key={agentName} className="rounded-lg border border-border/40 bg-card overflow-hidden">
              {/* Agent row */}
              <button
                onClick={() => setExpandedAgent(isOpen ? null : agentName)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-secondary/10 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded-full bg-teal-100 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-teal-700">
                      {agentName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="text-left">
                    <span className="text-xs font-semibold text-foreground">{agentName}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground font-data">
                        {agentOrders.length} order{agentOrders.length !== 1 ? 's' : ''}
                      </span>
                      {failCount > 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-coral">
                          <XCircle className="h-2.5 w-2.5" /> {failCount} failed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-teal">
                          <CheckCircle2 className="h-2.5 w-2.5" /> All OK
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Eye className="h-3 w-3 text-muted-foreground" />
                  {isOpen ? (
                    <ChevronUp className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
              </button>

              {/* Orders table */}
              {isOpen && (
                <div className="border-t border-border/30 overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-secondary/30">
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">#</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">
                          <div className="flex items-center gap-1"><User className="h-2.5 w-2.5" /> Customer</div>
                        </th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">
                          <div className="flex items-center gap-1"><Phone className="h-2.5 w-2.5" /> Phone</div>
                        </th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">
                          <div className="flex items-center gap-1"><Package className="h-2.5 w-2.5" /> Product</div>
                        </th>
                        <th className="text-center px-3 py-2 font-semibold text-muted-foreground">Qty</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">
                          <div className="flex items-center justify-end gap-1"><DollarSign className="h-2.5 w-2.5" /> Price</div>
                        </th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">
                          <div className="flex items-center gap-1"><MapPin className="h-2.5 w-2.5" /> Address</div>
                        </th>
                        <th className="text-center px-3 py-2 font-semibold text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agentOrders.map((order: any, idx: number) => (
                        <tr key={order.id} className="border-t border-border/20 hover:bg-secondary/10">
                          <td className="px-3 py-1.5 text-muted-foreground font-data">{idx + 1}</td>
                          <td className="px-3 py-1.5 font-medium">{order.customerName || '-'}</td>
                          <td className="px-3 py-1.5 font-data">{order.phone || '-'}</td>
                          <td className="px-3 py-1.5 max-w-[200px] truncate">{order.product || '-'}</td>
                          <td className="px-3 py-1.5 text-center font-data">{order.qty || '-'}</td>
                          <td className="px-3 py-1.5 text-right font-data font-medium">{order.price || '-'}</td>
                          <td className="px-3 py-1.5 max-w-[200px] truncate">{order.address || '-'}</td>
                          <td className="px-3 py-1.5 text-center">
                            {order.success === 1 ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-teal inline-block" />
                            ) : (
                              <span className="text-[10px] text-coral font-medium">{order.errorMessage || 'Failed'}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
