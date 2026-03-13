/**
 * Order Collection — Collect confirmed orders with empty Column D (التوصيل)
 * 
 * Flow:
 * 1. Select country → Click "Collect Orders"
 * 2. Review all confirmed orders that haven't been marked as shipped
 * 3. Select orders to mark → Click "Mark as Collected"
 * 4. Apps Script writes نعم to Column D on original sheets
 */

import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import CountryFlag from '@/components/CountryFlag';
import {
  Package,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Phone,
  MapPin,
  Calendar,
  User,
  ShoppingBag,
  Check,
  X,
  Download,
  Search,
  ExternalLink,
} from 'lucide-react';
import { DASHBOARDS, type DashboardSlug } from '@/App';

// Column indices matching Apps Script
const COL = {
  DATE: 0,      // A - التاريخ
  STATUS: 1,    // B - الحالة
  QTY: 2,       // C - الكمية
  DELIVERY: 3,  // D - التوصيل
  NOTE: 4,      // E - ملاحظة المكالمة
  CODE: 5,      // F - الرمز
  PRODUCT: 6,   // G - اسم المنتج
  CUSTOMER: 7,  // H - اسم الزبون
  PHONE: 8,     // I - رقم الهاتف
  ADDRESS1: 9,  // J - العنوان 1
  ADDRESS2: 10, // K - العنوان 2
  PRICE: 11,    // L - السعر
  REF: 12,      // M - المرجع
};

type CollectedOrder = {
  agentId: number;
  agentName: string;
  spreadsheetId: string;
  sheetUrl: string;
  tab: string;
  row: number;
  phone: string;
  cells: string[];
};

type MarkResult = {
  marked: number;
  failed: number;
  total: number;
  details: Array<{ tab: string; row: number; phone: string; status: string; reason?: string; customerName?: string; agentName?: string; product?: string; address?: string }>;
  markedBy: string;
};

export default function OrderCollection() {
  const [selectedCountry, setSelectedCountry] = useState<DashboardSlug>('algeria');
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [markResult, setMarkResult] = useState<MarkResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Fetch collected orders
  const collectQuery = trpc.leads.collectOrders.useQuery(
    { country: selectedCountry },
    { enabled: false, retry: false }
  );

  // Mark orders mutation
  const markMutation = trpc.leads.markOrders.useMutation({
    onSuccess: (result: MarkResult) => {
      setMarkResult(result);
      setSelectedOrders(new Set());
      setShowConfirmDialog(false);
      // Refetch to show updated state
      collectQuery.refetch();
    },
  });

  // Build a map of agent sheetUrls from the agents array
  const agentSheetUrls = useMemo(() => {
    const map = new Map<string, string>();
    if (collectQuery.data?.agents) {
      for (const agent of collectQuery.data.agents) {
        map.set(agent.name, (agent as any).sheetUrl || '');
      }
    }
    return map;
  }, [collectQuery.data?.agents]);

  // Group orders by agent — include ALL agents even with 0 orders
  const ordersByAgent = useMemo(() => {
    const map = new Map<string, CollectedOrder[]>();
    if (!collectQuery.data) return map;

    // First, add all orders grouped by agent
    for (const order of (collectQuery.data.orders || [])) {
      const key = `${order.agentName}__${order.spreadsheetId}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(order);
    }

    // Then, add agents that have 0 orders (from the agents list)
    if (collectQuery.data.agents) {
      for (const agent of collectQuery.data.agents) {
        const sheetUrl = (agent as any).sheetUrl || '';
        // Extract spreadsheetId from sheetUrl
        const match = sheetUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
        const spreadsheetId = match ? match[1] : 'unknown';
        const key = `${agent.name}__${spreadsheetId}`;
        if (!map.has(key)) map.set(key, []);
      }
    }

    return map;
  }, [collectQuery.data]);

  // Filter orders by search — always show agents (even with 0 matching orders if no search)
  const filteredOrdersByAgent = useMemo(() => {
    if (!searchQuery.trim()) return ordersByAgent;
    const q = searchQuery.toLowerCase();
    const filtered = new Map<string, CollectedOrder[]>();
    for (const [key, orders] of Array.from(ordersByAgent)) {
      // If search matches agent name, show all their orders
      const agentName = key.split('__')[0];
      if (agentName.toLowerCase().includes(q)) {
        filtered.set(key, orders);
        continue;
      }
      const matching = orders.filter((o: CollectedOrder) =>
        o.phone.includes(q) ||
        (o.cells[COL.CUSTOMER] || '').toLowerCase().includes(q) ||
        (o.cells[COL.PRODUCT] || '').toLowerCase().includes(q) ||
        (o.cells[COL.ADDRESS1] || '').toLowerCase().includes(q)
      );
      if (matching.length > 0) filtered.set(key, matching);
    }
    return filtered;
  }, [ordersByAgent, searchQuery]);

  // Total counts
  const totalOrders = collectQuery.data?.orders?.length || 0;
  const filteredTotal = Array.from(filteredOrdersByAgent.values()).reduce((s: number, arr: CollectedOrder[]) => s + arr.length, 0);

  // Order key for selection
  const orderKey = (o: CollectedOrder) => `${o.spreadsheetId}__${o.tab}__${o.row}__${o.phone}`;

  // Toggle selection
  const toggleOrder = (o: CollectedOrder) => {
    const key = orderKey(o);
    setSelectedOrders(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Select all visible
  const selectAll = () => {
    const allKeys = new Set<string>();
    for (const orders of Array.from(filteredOrdersByAgent.values())) {
      for (const o of orders) allKeys.add(orderKey(o));
    }
    setSelectedOrders(allKeys);
  };

  // Deselect all
  const deselectAll = () => setSelectedOrders(new Set());

  // Toggle agent expand
  const toggleAgent = (key: string) => {
    setExpandedAgents(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Expand all agents
  const expandAll = () => {
    const allKeys = new Set(ordersByAgent.keys());
    setExpandedAgents(allKeys);
  };

  // Handle mark orders
  const handleMarkOrders = () => {
    if (selectedOrders.size === 0) return;

    // Build the orders array from selected keys — include metadata for collection history
    const ordersToMark: Array<{
      spreadsheetId: string; tab: string; row: number; phone: string;
      agentId?: number; agentName?: string; customerName?: string;
      product?: string; qty?: number; price?: string; address?: string;
    }> = [];
    for (const orders of Array.from(ordersByAgent.values())) {
      for (const o of orders) {
        if (selectedOrders.has(orderKey(o))) {
          ordersToMark.push({
            spreadsheetId: o.spreadsheetId,
            tab: o.tab,
            row: o.row,
            phone: o.phone,
            agentId: o.agentId,
            agentName: o.agentName,
            customerName: cleanCell(o.cells[COL.CUSTOMER]),
            product: cleanCell(o.cells[COL.PRODUCT]),
            qty: parseInt(o.cells[COL.QTY]) || undefined,
            price: cleanCell(o.cells[COL.PRICE]),
            address: cleanCell(o.cells[COL.ADDRESS1]),
          });
        }
      }
    }

    markMutation.mutate({ orders: ordersToMark, country: selectedCountry });
  };

  // Export to clipboard (for pasting into master sheet)
  // Strip newlines from cell values to prevent broken rows when pasting
  // (upsell product names contain multi-line text that would create extra rows)
  const cleanCell = (val: string) => (val || '').replace(/[\r\n]+/g, ' ').trim();

  // Preserve leading zeros on phone numbers when pasting into spreadsheets
  // by wrapping in ="..." formula format (forces text interpretation)
  const cleanPhone = (val: string) => {
    const cleaned = cleanCell(val);
    if (!cleaned) return '';
    return `="${cleaned}"`;
  };

  const exportToClipboard = () => {
    const rows: string[] = [];
    // No header row — copy raw cells exactly as they appear in the Google Sheet
    // Only add Agent Name as the last column
    for (const orders of Array.from(filteredOrdersByAgent.values())) {
      for (const o of orders) {
        if (selectedOrders.size === 0 || selectedOrders.has(orderKey(o))) {
          // Copy ALL cells from the sheet as-is, just strip newlines and preserve phone leading zeros
          const outputCells = o.cells.map((cell, idx) => {
            // Phone column (I = index 8): wrap in ="..." to preserve leading zero
            if (idx === COL.PHONE) return cleanPhone(cell);
            // All other columns: just strip newlines to prevent row breaks
            return cleanCell(cell);
          });
          // Append agent name as the last column
          outputCells.push(o.agentName);
          rows.push(outputCells.join('\t'));
        }
      }
    }
    navigator.clipboard.writeText(rows.join('\n')).then(() => {
      toast.success(`Copied ${rows.length} order${rows.length !== 1 ? 's' : ''} to clipboard`, {
        description: 'You can now paste into your spreadsheet',
        duration: 3000,
      });
    }).catch(() => {
      toast.error('Failed to copy to clipboard');
    });
  };

  return (
    <div className="container py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Order Collection
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Collect confirmed orders (تأكيد) with empty delivery column (التوصيل)
          </p>
        </div>
      </div>

      {/* Country selector + Collect button */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-card rounded-lg border border-border/50 p-1">
          {DASHBOARDS.map((dash) => (
            <button
              key={dash.slug}
              onClick={() => {
                setSelectedCountry(dash.slug);
                setSelectedOrders(new Set());
                setMarkResult(null);
              }}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all
                ${selectedCountry === dash.slug
                  ? `${dash.accent} bg-gray-100`
                  : 'text-muted-foreground hover:text-foreground hover:bg-gray-50'
                }
              `}
            >
              <CountryFlag country={dash.slug} flag={dash.flag} className={dash.slug === 'viconis' ? 'h-3.5 w-auto' : undefined} />
              <span>{dash.label}</span>
            </button>
          ))}
        </div>

        <Button
          onClick={() => {
            setMarkResult(null);
            setSelectedOrders(new Set());
            collectQuery.refetch();
          }}
          disabled={collectQuery.isFetching}
          className="h-9"
        >
          {collectQuery.isFetching ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {collectQuery.data ? 'Refresh' : 'Collect Orders'}
        </Button>

        {totalOrders > 0 && (
          <span className="text-sm font-data font-bold text-foreground">
            {totalOrders} order{totalOrders !== 1 ? 's' : ''} found
          </span>
        )}
      </div>

      {/* Loading state */}
      {collectQuery.isFetching && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Scanning all agent sheets...</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {collectQuery.error && (
        <div className="rounded-xl border border-coral/30 bg-coral-light p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-coral mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-coral">Error collecting orders</p>
            <p className="text-xs text-muted-foreground mt-1">{collectQuery.error.message}</p>
          </div>
        </div>
      )}

      {/* Mark result banner */}
      <AnimatePresence>
        {markResult && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`rounded-xl border p-4 flex items-start gap-3 ${
              markResult.failed === 0
                ? 'border-green/30 bg-green-light'
                : 'border-amber/30 bg-amber-light'
            }`}
          >
            {markResult.failed === 0 ? (
              <CheckCircle className="h-5 w-5 text-green mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber mt-0.5 shrink-0" />
            )}
            <div>
              <p className="text-sm font-semibold text-foreground">
                {markResult.marked} order{markResult.marked !== 1 ? 's' : ''} marked as collected
                {markResult.failed > 0 && (
                  <span className="text-coral ml-2">
                    ({markResult.failed} failed)
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Marked by {markResult.markedBy} at {new Date().toLocaleString()}
              </p>
              {markResult.failed > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-coral mb-2">Failed Orders — Please check these manually:</p>
                  <div className="rounded-lg border border-coral/30 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-coral/10 text-left">
                          <th className="px-3 py-1.5 font-semibold text-foreground">Agent</th>
                          <th className="px-3 py-1.5 font-semibold text-foreground">Customer</th>
                          <th className="px-3 py-1.5 font-semibold text-foreground">Phone</th>
                          <th className="px-3 py-1.5 font-semibold text-foreground">Tab / Row</th>
                          <th className="px-3 py-1.5 font-semibold text-foreground">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {markResult.details
                          .filter(d => d.status === 'failed')
                          .map((d, i) => (
                            <tr key={i} className="border-t border-coral/15 bg-white">
                              <td className="px-3 py-1.5 font-medium text-foreground">{d.agentName || '—'}</td>
                              <td className="px-3 py-1.5 text-foreground">{d.customerName || '—'}</td>
                              <td className="px-3 py-1.5 font-data text-foreground">{d.phone || '—'}</td>
                              <td className="px-3 py-1.5 text-muted-foreground">{d.tab} / Row {d.row}</td>
                              <td className="px-3 py-1.5 text-coral">{d.reason || 'Unknown'}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-7 text-xs"
                onClick={() => setMarkResult(null)}
              >
                Dismiss
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Orders table */}
      {collectQuery.data && !collectQuery.isFetching && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by name, phone, product..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-border/50 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* Selection controls */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={selectAll}>
                Select All ({filteredTotal})
              </Button>
              {selectedOrders.size > 0 && (
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={deselectAll}>
                  Deselect ({selectedOrders.size})
                </Button>
              )}
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={expandAll}>
                Expand All
              </Button>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 ml-auto">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={exportToClipboard}
              >
                <Download className="mr-1.5 h-3 w-3" />
                Copy to Clipboard
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs bg-green hover:bg-green/90 text-white"
                disabled={selectedOrders.size === 0 || markMutation.isPending}
                onClick={() => setShowConfirmDialog(true)}
              >
                {markMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                ) : (
                  <Check className="mr-1.5 h-3 w-3" />
                )}
                Mark as Collected ({selectedOrders.size})
              </Button>
            </div>
          </div>

          {/* Agent groups */}
          <div className="space-y-3">
            {Array.from(filteredOrdersByAgent.entries()).map(([agentKey, orders]) => {
              const agentName = orders[0]?.agentName || agentKey.split('__')[0];
              const spreadsheetId = agentKey.split('__')[1] || '';
              const sheetUrl = orders[0]?.sheetUrl || agentSheetUrls.get(agentName) || (spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}` : '');
              const isExpanded = expandedAgents.has(agentKey);
              const selectedInAgent = orders.filter(o => selectedOrders.has(orderKey(o))).length;

              return (
                <motion.div
                  key={agentKey}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-border/50 bg-card overflow-hidden"
                >
                  {/* Agent header */}
                  <button
                    onClick={() => toggleAgent(agentKey)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-bold text-primary">
                          {agentName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-foreground">{agentName}</span>
                      <span className="text-xs font-data text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                        {orders.length} order{orders.length !== 1 ? 's' : ''}
                      </span>
                      {selectedInAgent > 0 && (
                        <span className="text-xs font-data text-green bg-green-light px-2 py-0.5 rounded-full">
                          {selectedInAgent} selected
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {sheetUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(sheetUrl, '_blank');
                          }}
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open Sheet
                        </Button>
                      )}
                      {orders.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Toggle all orders in this agent
                            const agentOrderKeys = orders.map(o => orderKey(o));
                            const allSelected = agentOrderKeys.every(k => selectedOrders.has(k));
                            setSelectedOrders(prev => {
                              const next = new Set(prev);
                              if (allSelected) {
                                agentOrderKeys.forEach(k => next.delete(k));
                              } else {
                                agentOrderKeys.forEach(k => next.add(k));
                              }
                              return next;
                            });
                          }}
                        >
                          {orders.every(o => selectedOrders.has(orderKey(o))) ? 'Deselect All' : 'Select All'}
                        </Button>
                      )}
                    </div>
                  </button>

                  {/* Orders table */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        {orders.length === 0 ? (
                          <div className="px-4 py-6 text-center">
                            <CheckCircle className="h-6 w-6 text-green mx-auto mb-2" />
                            <p className="text-xs text-muted-foreground">No pending orders — all caught up!</p>
                          </div>
                        ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-secondary/50 text-muted-foreground">
                                <th className="px-3 py-2 text-left w-8"></th>
                                <th className="px-3 py-2 text-left">Tab</th>
                                <th className="px-3 py-2 text-left">Date</th>
                                <th className="px-3 py-2 text-left">Customer</th>
                                <th className="px-3 py-2 text-left">Phone</th>
                                <th className="px-3 py-2 text-left">Product</th>
                                <th className="px-3 py-2 text-left">Qty</th>
                                <th className="px-3 py-2 text-left">Address</th>
                                <th className="px-3 py-2 text-right">Price</th>
                                <th className="px-3 py-2 text-left">Reference</th>
                                <th className="px-3 py-2 text-left">Note</th>
                              </tr>
                            </thead>
                            <tbody>
                              {orders.map((order, idx) => {
                                const isSelected = selectedOrders.has(orderKey(order));
                                const c = order.cells;
                                return (
                                  <tr
                                    key={`${order.tab}-${order.row}`}
                                    onClick={() => toggleOrder(order)}
                                    className={`
                                      border-t border-border/30 cursor-pointer transition-colors
                                      ${isSelected ? 'bg-green-light/50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}
                                      hover:bg-primary/5
                                    `}
                                  >
                                    <td className="px-3 py-2">
                                      <div className={`
                                        h-4 w-4 rounded border-2 flex items-center justify-center transition-all
                                        ${isSelected ? 'bg-green border-green' : 'border-border'}
                                      `}>
                                        {isSelected && <Check className="h-3 w-3 text-white" />}
                                      </div>
                                    </td>
                                    <td className="px-3 py-2 font-data text-muted-foreground whitespace-nowrap">{order.tab}</td>
                                    <td className="px-3 py-2 font-data whitespace-nowrap">{c[COL.DATE] || '-'}</td>
                                    <td className="px-3 py-2 font-semibold whitespace-nowrap">{c[COL.CUSTOMER] || '-'}</td>
                                    <td className="px-3 py-2 font-data whitespace-nowrap">{c[COL.PHONE] || '-'}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">{c[COL.PRODUCT] || '-'}</td>
                                    <td className="px-3 py-2 font-data text-center">{c[COL.QTY] || '-'}</td>
                                    <td className="px-3 py-2 max-w-[200px] truncate" title={`${c[COL.ADDRESS1] || ''} ${c[COL.ADDRESS2] || ''}`}>
                                      {c[COL.ADDRESS1] || '-'}
                                    </td>
                                    <td className="px-3 py-2 font-data font-bold text-right whitespace-nowrap">
                                      {c[COL.PRICE] ? `${c[COL.PRICE]} DA` : '-'}
                                    </td>
                                    <td className="px-3 py-2 max-w-[150px] truncate text-muted-foreground" title={c[COL.REF] || ''}>
                                      {c[COL.REF] || '-'}
                                    </td>
                                    <td className="px-3 py-2 max-w-[120px] truncate text-muted-foreground" title={c[COL.NOTE] || ''}>
                                      {c[COL.NOTE] || '-'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}



      {/* Initial state — no data yet */}
      {!collectQuery.data && !collectQuery.isFetching && !collectQuery.error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Package className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-sm font-bold text-foreground mb-1">Ready to collect</h3>
          <p className="text-xs text-muted-foreground">
            Select a country and click "Collect Orders" to scan all agent sheets for confirmed orders.
          </p>
        </div>
      )}

      {/* Confirmation Dialog */}
      <AnimatePresence>
        {showConfirmDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center"
            onClick={() => !markMutation.isPending && setShowConfirmDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-2xl border border-border shadow-xl p-6 max-w-md w-full mx-4"
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="h-10 w-10 rounded-full bg-amber-light flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-5 w-5 text-amber" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Confirm Mark as Collected</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    This will write <strong>نعم</strong> to Column D (التوصيل) for <strong>{selectedOrders.size} order{selectedOrders.size !== 1 ? 's' : ''}</strong> on the original Google Sheets.
                  </p>
                  <p className="text-xs text-coral mt-2 font-medium">
                    This action cannot be easily undone. Make sure you have copied/exported the orders first.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowConfirmDialog(false)}
                  disabled={markMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-green hover:bg-green/90 text-white"
                  onClick={handleMarkOrders}
                  disabled={markMutation.isPending}
                >
                  {markMutation.isPending ? (
                    <>
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      Marking...
                    </>
                  ) : (
                    <>
                      <Check className="mr-1.5 h-3 w-3" />
                      Yes, Mark {selectedOrders.size} Orders
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
