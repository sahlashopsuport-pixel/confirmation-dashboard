/**
 * DHD Delivery Suivi — Cached Data (Instant Load)
 *
 * Loads problem orders from server-side cache (instant).
 * Background sync runs every 30 min automatically.
 * Manual "Force Refresh" triggers a new sync.
 * No more slow page-by-page scanning on the frontend.
 */

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone,
  PhoneOff,
  PhoneMissed,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Search,
  Filter,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  Package,
  Truck,
  Copy,
  Check,
  Database,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────

interface CachedOrder {
  id: number;
  tracking: string;
  client: string;
  phone: string;
  phone2: string | null;
  adresse: string | null;
  reference: string | null;
  montant: string;
  wilayaId: number;
  wilayaName: string;
  status: string;
  statusLabel: string;
  reasonCategory: string;
  latestReasonText: string;
  latestReasonJson: string | null;
  statusReasonJson: string | null;
  products: string | null;
  orderCreatedAt: string;
  lastUpdatedAt: string;
  createdAt: Date;
  updatedAt: Date;
  // Parsed from JSON by server
  latestReason: {
    remarque: string;
    commentaires: string;
    station: string;
    livreur: string;
    created_at: string;
    tracking: string;
  } | null;
  status_reason: Array<{
    remarque: string;
    commentaires: string;
    station: string;
    livreur: string;
    created_at: string;
    tracking: string;
  }>;
}

// ─── Constants ──────────────────────────────────────────────────────────

const REASON_LABELS: Record<string, string> = {
  no_answer: "No Answer",
  postponed: "Postponed",
  cancelled: "Cancelled",
  refused: "Refused",
  wrong_info: "Wrong Info",
  contacted: "Contacted",
  other: "Other",
};

const REASON_COLORS: Record<string, string> = {
  no_answer: "bg-amber-100 text-amber-800 border-amber-200",
  postponed: "bg-blue-100 text-blue-800 border-blue-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
  refused: "bg-rose-100 text-rose-800 border-rose-200",
  wrong_info: "bg-purple-100 text-purple-800 border-purple-200",
  contacted: "bg-green-100 text-green-800 border-green-200",
  other: "bg-gray-100 text-gray-800 border-gray-200",
};

const CALL_RESULTS = [
  { value: "answered", label: "Answered", icon: Phone, color: "text-green-600", bg: "bg-green-50 border-green-200" },
  { value: "no_answer", label: "No Answer", icon: PhoneMissed, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
  { value: "postponed", label: "Postponed", icon: Clock, color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
  { value: "cancelled", label: "Cancelled", icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200" },
  { value: "wrong_number", label: "Wrong Number", icon: PhoneOff, color: "text-gray-600", bg: "bg-gray-50 border-gray-200" },
  { value: "resolved", label: "Resolved", icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
] as const;

// ─── Helper: Time ago ──────────────────────────────────────────────────

function timeAgo(date: Date | string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Stat Card ──────────────────────────────────────────────────────────

function StatCard({ title, value, subtitle, icon: Icon, color }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200/60 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500">{title}</span>
        <div className={`h-7 w-7 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="h-3.5 w-3.5 text-white" />
        </div>
      </div>
      <div className="text-xl font-bold text-gray-900 font-data">{value}</div>
      {subtitle && <span className="text-[11px] text-gray-500">{subtitle}</span>}
    </div>
  );
}

// ─── Call Log Modal ─────────────────────────────────────────────────────

function CallLogModal({ order, onClose, onSubmit, isSubmitting }: {
  order: CachedOrder;
  onClose: () => void;
  onSubmit: (result: string, notes: string) => void;
  isSubmitting: boolean;
}) {
  const [selectedResult, setSelectedResult] = useState<string>("");
  const [notes, setNotes] = useState("");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Log Call Result</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {order.client} · {order.tracking.slice(0, 20)}...
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-500">Phone:</span>{" "}
              <a href={`tel:${order.phone}`} className="font-medium text-blue-600">{order.phone}</a>
              {order.phone2 && (
                <span className="ml-1">
                  / <a href={`tel:${order.phone2}`} className="text-blue-600">{order.phone2}</a>
                </span>
              )}
            </div>
            <div>
              <span className="text-gray-500">Amount:</span>{" "}
              <span className="font-data font-medium">{order.montant} DA</span>
            </div>
            <div>
              <span className="text-gray-500">Wilaya:</span>{" "}
              <span className="font-medium">{order.wilayaName}</span>
            </div>
            <div>
              <span className="text-gray-500">Problem:</span>{" "}
              <span className="font-medium text-red-600">
                {order.latestReason?.remarque || order.latestReasonText || "Unknown"}
              </span>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-2 block">Call Result</label>
            <div className="grid grid-cols-3 gap-2">
              {CALL_RESULTS.map((result) => {
                const RIcon = result.icon;
                const isSelected = selectedResult === result.value;
                return (
                  <button
                    key={result.value}
                    onClick={() => setSelectedResult(result.value)}
                    className={`
                      flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-xs font-medium transition-all
                      ${isSelected
                        ? `${result.bg} border-current ${result.color} shadow-sm`
                        : "border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                      }
                    `}
                  >
                    <RIcon className="h-4 w-4" />
                    {result.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Client said deliver tomorrow, new address..."
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
              rows={3}
            />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1 rounded-xl" disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={() => onSubmit(selectedResult, notes)}
              disabled={!selectedResult || isSubmitting}
              className="flex-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSubmitting ? (
                <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving...</>
              ) : (
                <><CheckCircle className="mr-1.5 h-3.5 w-3.5" /> Log Call</>
              )}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Order Detail Slide-over ────────────────────────────────────────────

function OrderDetail({ order, onClose, onLogCall }: {
  order: CachedOrder;
  onClose: () => void;
  onLogCall: () => void;
}) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success("Copied!");
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="absolute right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Order Detail</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Client Info */}
          <div className="rounded-xl border border-gray-200 p-4 space-y-2 text-sm">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Client</h4>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Name</span>
              <span className="font-medium">{order.client}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Phone</span>
              <div className="flex items-center gap-2">
                <a href={`tel:${order.phone}`} className="font-data font-medium text-blue-600 hover:underline">
                  {order.phone}
                </a>
                <button onClick={() => copyToClipboard(order.phone, "phone")} className="p-1 rounded hover:bg-gray-100">
                  {copiedField === "phone" ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3 text-gray-400" />}
                </button>
              </div>
            </div>
            {order.phone2 && (
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Phone 2</span>
                <div className="flex items-center gap-2">
                  <a href={`tel:${order.phone2}`} className="font-data font-medium text-blue-600 hover:underline">
                    {order.phone2}
                  </a>
                  <button onClick={() => copyToClipboard(order.phone2!, "phone2")} className="p-1 rounded hover:bg-gray-100">
                    {copiedField === "phone2" ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3 text-gray-400" />}
                  </button>
                </div>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Address</span>
              <span className="text-right max-w-[60%]">{order.adresse || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Wilaya</span>
              <span>{order.wilayaName}</span>
            </div>
          </div>

          {/* Order Info */}
          <div className="rounded-xl border border-gray-200 p-4 space-y-2 text-sm">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Order</h4>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Tracking</span>
              <div className="flex items-center gap-2">
                <span className="font-data text-xs">{order.tracking}</span>
                <button onClick={() => copyToClipboard(order.tracking, "tracking")} className="p-1 rounded hover:bg-gray-100">
                  {copiedField === "tracking" ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3 text-gray-400" />}
                </button>
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Amount</span>
              <span className="font-data font-bold text-lg">{order.montant} DA</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Status</span>
              <Badge variant="outline">{order.statusLabel}</Badge>
            </div>
            {order.products && (
              <div className="flex justify-between">
                <span className="text-gray-500">Products</span>
                <span className="text-right max-w-[60%]">{order.products}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Created</span>
              <span className="font-data text-xs">{new Date(order.orderCreatedAt).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Problem Info */}
          {order.latestReason && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-2 text-sm">
              <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> Latest Problem
              </h4>
              <div className="flex justify-between">
                <span className="text-amber-700">Reason</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${REASON_COLORS[order.reasonCategory || "other"]}`}>
                  {REASON_LABELS[order.reasonCategory || "other"]}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-700">Detail</span>
                <span className="text-right max-w-[60%] font-medium">{order.latestReason.remarque}</span>
              </div>
              {order.latestReason.commentaires && (
                <div className="flex justify-between">
                  <span className="text-amber-700">Comment</span>
                  <span className="text-right max-w-[60%]">{order.latestReason.commentaires}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-amber-700">Station</span>
                <span>{order.latestReason.station}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-700">Date</span>
                <span className="font-data text-xs">{new Date(order.latestReason.created_at).toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Status History */}
          {order.status_reason && order.status_reason.length > 0 && (
            <div className="rounded-xl border border-gray-200 p-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Delivery History ({order.status_reason.length} events)
              </h4>
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {[...order.status_reason].reverse().map((reason, i) => (
                  <div key={i} className="flex gap-3 text-xs">
                    <div className="flex flex-col items-center">
                      <div className="h-2 w-2 rounded-full bg-blue-500 mt-1.5" />
                      {i < order.status_reason.length - 1 && <div className="w-px h-full bg-gray-200" />}
                    </div>
                    <div className="pb-3">
                      <p className="font-medium text-gray-900">{reason.remarque}</p>
                      {reason.commentaires && <p className="text-gray-500">{reason.commentaires}</p>}
                      <p className="text-gray-400 mt-0.5">{reason.station} · {new Date(reason.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Button */}
          <Button onClick={onLogCall} className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 text-white" size="lg">
            <Phone className="h-4 w-4 mr-2" />
            Log Suivi Call
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Suivi Page ────────────────────────────────────────────────────

export default function SuiviPage() {
  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterReason, setFilterReason] = useState<string>("all");
  const [filterWilaya, setFilterWilaya] = useState<string>("all");
  const [selectedOrder, setSelectedOrder] = useState<CachedOrder | null>(null);
  const [callLogOrder, setCallLogOrder] = useState<CachedOrder | null>(null);
  const [sortField, setSortField] = useState<"date" | "amount">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // ─── Queries: load cached data (instant) ─────────────────────────────

  const ordersQuery = trpc.suivi.getCachedOrders.useQuery(undefined, {
    staleTime: 2 * 60 * 1000, // 2 min stale time
    refetchInterval: 5 * 60 * 1000, // Auto-refetch every 5 min
  });

  const statsQuery = trpc.suivi.getCachedStats.useQuery(undefined, {
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const syncStatusQuery = trpc.suivi.getSyncStatus.useQuery(undefined, {
    refetchInterval: 15 * 1000, // Check sync status every 15s
  });

  // ─── Mutations ───────────────────────────────────────────────────────

  const triggerSyncMutation = trpc.suivi.triggerSync.useMutation({
    onSuccess: (data) => {
      if (data.started) {
        toast.success("Sync started! Data will update in 1-2 minutes.");
        // Start polling sync status more frequently
        syncStatusQuery.refetch();
      } else {
        toast.info(data.message);
      }
    },
    onError: (err) => {
      toast.error(`Failed to start sync: ${err.message}`);
    },
  });

  const logCallMutation = trpc.suivi.logCall.useMutation({
    onSuccess: () => {
      toast.success("Call logged successfully");
      setCallLogOrder(null);
    },
    onError: (err) => {
      toast.error(`Failed to log call: ${err.message}`);
    },
  });

  // ─── Derived data ────────────────────────────────────────────────────

  const orders = (ordersQuery.data || []) as CachedOrder[];
  const stats = statsQuery.data || { total: 0, noAnswer: 0, postponed: 0, cancelled: 0, refused: 0, wrongInfo: 0, other: 0 };
  const syncStatus = syncStatusQuery.data;
  const isSyncing = syncStatus?.isRunning || false;
  const lastSync = syncStatus?.lastSync;

  // Filter and sort
  const filteredOrders = useMemo(() => {
    return orders
      .filter((order) => {
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          if (
            !order.client.toLowerCase().includes(q) &&
            !order.phone.includes(q) &&
            !order.tracking.toLowerCase().includes(q) &&
            !(order.phone2 || "").includes(q) &&
            !order.wilayaName.toLowerCase().includes(q) &&
            !(order.reference || "").toLowerCase().includes(q)
          ) return false;
        }
        if (filterReason !== "all" && order.reasonCategory !== filterReason) return false;
        if (filterWilaya !== "all" && order.wilayaName !== filterWilaya) return false;
        return true;
      })
      .sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1;
        if (sortField === "date") return dir * (new Date(a.lastUpdatedAt).getTime() - new Date(b.lastUpdatedAt).getTime());
        if (sortField === "amount") return dir * (parseFloat(a.montant) - parseFloat(b.montant));
        return 0;
      });
  }, [orders, searchQuery, filterReason, filterWilaya, sortField, sortDir]);

  // Unique wilayas for filter
  const uniqueWilayas = useMemo(() => {
    return Array.from(new Set(orders.map((o) => o.wilayaName))).sort();
  }, [orders]);

  // ─── Loading state ───────────────────────────────────────────────────

  if (ordersQuery.isLoading && !ordersQuery.data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
          <p className="text-sm text-gray-500">Loading cached orders...</p>
        </div>
      </div>
    );
  }

  if (ordersQuery.error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto" />
          <p className="text-sm text-red-600 font-medium">Failed to load orders</p>
          <p className="text-xs text-gray-500">{ordersQuery.error.message}</p>
          <Button variant="outline" size="sm" onClick={() => ordersQuery.refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">DHD Delivery Suivi</h2>
          <p className="text-sm text-gray-500">
            Follow up on problem deliveries · {stats.total} problem orders (last 7 days)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Sync status indicator */}
          {isSyncing ? (
            <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-200">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Syncing...</span>
            </div>
          ) : lastSync ? (
            <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-200">
              <Database className="h-3 w-3" />
              <span>Synced {timeAgo(lastSync.createdAt)}</span>
              {lastSync.status === "failed" && (
                <span className="text-red-500 ml-1">(failed)</span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200">
              <AlertTriangle className="h-3 w-3" />
              <span>Never synced</span>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => triggerSyncMutation.mutate()}
            disabled={isSyncing || triggerSyncMutation.isPending}
            className="h-8 text-xs rounded-lg"
          >
            {isSyncing ? (
              <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> Syncing</>
            ) : (
              <><RefreshCw className="mr-1.5 h-3 w-3" /> Force Refresh</>
            )}
          </Button>
        </div>
      </div>

      {/* Sync info banner (shows when never synced or sync failed) */}
      {!lastSync && !isSyncing && orders.length === 0 && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 flex items-start gap-3">
          <Zap className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-800">First sync in progress</p>
            <p className="text-xs text-blue-600 mt-1">
              The system is scanning DHD orders for the first time. This takes 1-2 minutes.
              After that, data syncs automatically every 30 minutes and loads instantly.
            </p>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard title="Problem Orders" value={stats.total} subtitle="Need follow-up" icon={AlertTriangle} color="bg-red-500" />
        <StatCard title="No Answer" value={stats.noAnswer} subtitle="Client unreachable" icon={PhoneOff} color="bg-amber-500" />
        <StatCard title="Postponed" value={stats.postponed} subtitle="Callback needed" icon={Clock} color="bg-blue-500" />
        <StatCard title="Cancelled" value={stats.cancelled} subtitle="Client cancelled" icon={XCircle} color="bg-red-600" />
        <StatCard title="Refused" value={stats.refused} subtitle="Client refused" icon={PhoneMissed} color="bg-rose-500" />
        <StatCard title="Other" value={stats.wrongInfo + stats.other} subtitle="Wrong info / other" icon={Package} color="bg-gray-500" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search client, phone, tracking..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 rounded-lg"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="h-3 w-3 text-gray-400" />
            </button>
          )}
        </div>

        <Select value={filterReason} onValueChange={setFilterReason}>
          <SelectTrigger className="w-[160px] h-9 rounded-lg">
            <Filter className="h-3 w-3 mr-1.5" />
            <SelectValue placeholder="Problem Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Problems</SelectItem>
            <SelectItem value="no_answer">No Answer</SelectItem>
            <SelectItem value="postponed">Postponed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="refused">Refused</SelectItem>
            <SelectItem value="wrong_info">Wrong Info</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterWilaya} onValueChange={setFilterWilaya}>
          <SelectTrigger className="w-[160px] h-9 rounded-lg">
            <SelectValue placeholder="Wilaya" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Wilayas</SelectItem>
            {uniqueWilayas.map((w) => (
              <SelectItem key={w} value={w}>{w}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-xs text-gray-500">
          {filteredOrders.length} of {orders.length} problem orders
        </span>
      </div>

      {/* Orders Table */}
      <div className="rounded-xl border border-gray-200/60 bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Client</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Phone</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Wilaya</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">
                  <button
                    onClick={() => {
                      if (sortField === "amount") setSortDir((d) => d === "asc" ? "desc" : "asc");
                      else { setSortField("amount"); setSortDir("desc"); }
                    }}
                    className="flex items-center gap-1 hover:text-gray-700"
                  >
                    Amount
                    {sortField === "amount" && (sortDir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)}
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Problem</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">
                  <button
                    onClick={() => {
                      if (sortField === "date") setSortDir((d) => d === "asc" ? "desc" : "asc");
                      else { setSortField("date"); setSortDir("desc"); }
                    }}
                    className="flex items-center gap-1 hover:text-gray-700"
                  >
                    Updated
                    {sortField === "date" && (sortDir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)}
                  </button>
                </th>
                <th className="text-center px-4 py-3 font-medium text-gray-500 text-xs">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400">
                    {orders.length === 0
                      ? isSyncing
                        ? "Sync in progress... data will appear shortly"
                        : "No problem orders cached yet. Click 'Force Refresh' to sync."
                      : "No orders match your filters"
                    }
                  </td>
                </tr>
              ) : (
                filteredOrders.slice(0, 200).map((order) => (
                  <tr
                    key={order.tracking}
                    className="border-b border-gray-50 hover:bg-blue-50/30 cursor-pointer transition-colors"
                    onClick={() => setSelectedOrder(order)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{order.client}</div>
                      <div className="text-[10px] text-gray-400 font-data">{order.tracking.slice(0, 18)}...</div>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`tel:${order.phone}`}
                        className="font-data text-blue-600 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {order.phone}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{order.wilayaName}</td>
                    <td className="px-4 py-3 font-data font-medium">{order.montant} DA</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${REASON_COLORS[order.reasonCategory || "other"]}`}>
                        {REASON_LABELS[order.reasonCategory || "other"]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-[10px]">{order.statusLabel}</Badge>
                    </td>
                    <td className="px-4 py-3 font-data text-xs text-gray-500">
                      {new Date(order.lastUpdatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs rounded-lg"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCallLogOrder(order);
                        }}
                      >
                        <Phone className="h-3 w-3 mr-1" />
                        Call
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredOrders.length > 200 && (
          <div className="text-center py-3 text-xs text-gray-400 border-t border-gray-100">
            Showing first 200 of {filteredOrders.length} orders. Use search/filters to narrow down.
          </div>
        )}
      </div>

      {/* Sync details footer */}
      {lastSync && (
        <div className="text-center text-xs text-gray-400 space-y-0.5">
          <p>
            Last sync: {new Date(lastSync.createdAt).toLocaleString()} ({timeAgo(lastSync.createdAt)})
            {lastSync.pagesScanned && ` · ${lastSync.pagesScanned} pages · ${lastSync.ordersScanned?.toLocaleString()} orders scanned`}
            {lastSync.durationMs && ` · ${(lastSync.durationMs / 1000).toFixed(0)}s`}
          </p>
          <p>Auto-syncs every 30 minutes · Covers last 7 days of DHD orders</p>
        </div>
      )}

      {/* Order Detail Slide-over */}
      <AnimatePresence>
        {selectedOrder && (
          <OrderDetail
            order={selectedOrder}
            onClose={() => setSelectedOrder(null)}
            onLogCall={() => {
              setCallLogOrder(selectedOrder);
              setSelectedOrder(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Call Log Modal */}
      <AnimatePresence>
        {callLogOrder && (
          <CallLogModal
            order={callLogOrder}
            onClose={() => setCallLogOrder(null)}
            onSubmit={(result, notes) => {
              logCallMutation.mutate({
                tracking: callLogOrder.tracking,
                callResult: result as "answered" | "no_answer" | "postponed" | "cancelled" | "wrong_number" | "resolved",
                notes: notes || undefined,
                clientName: callLogOrder.client,
                phone: callLogOrder.phone,
                wilayaId: callLogOrder.wilayaId,
                amount: callLogOrder.montant,
                orderStatus: callLogOrder.status,
                problemReason: callLogOrder.reasonCategory || undefined,
              });
            }}
            isSubmitting={logCallMutation.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
