/**
 * Delivery Tracking Page
 *
 * Upload EcoTrack Excel exports, parse orders, match to agents,
 * and display delivery performance dashboard per agent.
 * Includes date range filter for accurate delivery rate analysis.
 */
import { useState, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Upload,
  Truck,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  FileUp,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Package,
  MapPin,
  Calendar,
  Filter,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Status Colors & Labels ──────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  en_traitement: "In Transit",
  livre_paye: "Delivered (Paid)",
  livre_non_paye: "Delivered (Unpaid)",
  retour_recu: "Return Received",
  retour_non_recu: "Return Not Received",
  non_recu: "Not Received",
};

const STATUS_COLORS: Record<string, string> = {
  en_traitement: "bg-blue-100 text-blue-700",
  livre_paye: "bg-emerald-100 text-emerald-700",
  livre_non_paye: "bg-amber-100 text-amber-700",
  retour_recu: "bg-red-100 text-red-700",
  retour_non_recu: "bg-rose-100 text-rose-700",
  non_recu: "bg-purple-100 text-purple-700",
};

const STATUS_DOT_COLORS: Record<string, string> = {
  en_traitement: "bg-blue-500",
  livre_paye: "bg-emerald-500",
  livre_non_paye: "bg-amber-500",
  retour_recu: "bg-red-500",
  retour_non_recu: "bg-rose-500",
  non_recu: "bg-purple-500",
};

// ─── Date Helpers ───────────────────────────────────────────────────────
function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]; // YYYY-MM-DD
}

function getPresetRange(preset: string): { from: string; to: string } {
  const today = new Date();
  const to = formatDate(today);

  switch (preset) {
    case "today": {
      return { from: to, to };
    }
    case "yesterday": {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      const y = formatDate(d);
      return { from: y, to: y };
    }
    case "last7": {
      const d = new Date(today);
      d.setDate(d.getDate() - 7);
      return { from: formatDate(d), to };
    }
    case "last14": {
      const d = new Date(today);
      d.setDate(d.getDate() - 14);
      return { from: formatDate(d), to };
    }
    case "last30": {
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      return { from: formatDate(d), to };
    }
    case "thisMonth": {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: formatDate(d), to };
    }
    case "lastMonth": {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: formatDate(start), to: formatDate(end) };
    }
    default:
      return { from: "", to: "" };
  }
}

const PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 days" },
  { key: "last14", label: "Last 14 days" },
  { key: "last30", label: "Last 30 days" },
  { key: "thisMonth", label: "This month" },
  { key: "lastMonth", label: "Last month" },
];

// ─── Date Filter Component ──────────────────────────────────────────────
function DateFilter({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onClear,
  isFiltered,
}: {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onClear: () => void;
  isFiltered: boolean;
}) {
  const [showPresets, setShowPresets] = useState(false);

  const handlePreset = (preset: string) => {
    const { from, to } = getPresetRange(preset);
    onDateFromChange(from);
    onDateToChange(to);
    setShowPresets(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/50 bg-card p-4 shadow-sm"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="h-7 w-7 rounded-lg bg-indigo-50 flex items-center justify-center">
          <Calendar className="h-3.5 w-3.5 text-indigo-600" />
        </div>
        <h3 className="text-sm font-bold text-foreground">Date Filter</h3>
        {isFiltered && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold">
            Active
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {isFiltered && (
            <button
              onClick={onClear}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Quick presets */}
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPresets(!showPresets)}
            className="h-8 text-xs rounded-lg"
          >
            <Filter className="mr-1.5 h-3 w-3" />
            Quick Filter
            <ChevronDown className="ml-1 h-3 w-3" />
          </Button>
          <AnimatePresence>
            {showPresets && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute top-full left-0 mt-1 z-20 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[160px]"
              >
                {PRESETS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => handlePreset(p.key)}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors text-foreground"
                  >
                    {p.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Date inputs */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">From:</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="h-8 px-2 text-xs rounded-lg border border-border bg-background text-foreground font-data focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">To:</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="h-8 px-2 text-xs rounded-lg border border-border bg-background text-foreground font-data focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Active filter summary */}
        {isFiltered && (
          <div className="text-xs text-indigo-600 font-medium bg-indigo-50 px-2.5 py-1 rounded-lg">
            {dateFrom && dateTo
              ? `${dateFrom} → ${dateTo}`
              : dateFrom
              ? `From ${dateFrom}`
              : `Until ${dateTo}`}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── File Upload Component ───────────────────────────────────────────────
function FileUploadZone({ onUpload, isUploading, partnerLabel = "EcoTrack" }: { onUpload: (file: File) => void; isUploading: boolean; partnerLabel?: string }) {
  const [dragActive, setDragActive] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls"))) {
        onUpload(file);
      } else {
        toast.error("Please upload an Excel file (.xlsx or .xls)");
      }
    },
    [onUpload]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onUpload(file);
      e.target.value = "";
    },
    [onUpload]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
      className={`
        relative border-2 border-dashed rounded-xl p-8 text-center transition-all
        ${dragActive ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/40 hover:bg-gray-50/50"}
        ${isUploading ? "opacity-60 pointer-events-none" : ""}
      `}
    >
      <input
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileSelect}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        disabled={isUploading}
      />
      <div className="flex flex-col items-center gap-3">
        {isUploading ? (
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
        ) : (
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileUp className="h-6 w-6 text-primary" />
          </div>
        )}
        <div>
          <p className="text-sm font-semibold text-foreground">
            {isUploading ? "Processing file..." : `Upload ${partnerLabel} Export`}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Drag & drop or click to select an Excel file (.xlsx)
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────
function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: any;
  color: "blue" | "green" | "red" | "amber" | "purple";
}) {
  const colorMap = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-600",
    amber: "bg-amber-50 text-amber-600",
    purple: "bg-purple-50 text-purple-600",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/50 bg-card p-4 shadow-sm"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="text-xl font-bold text-foreground font-data">{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
    </motion.div>
  );
}

// ─── Agent Performance Row ───────────────────────────────────────────────
function AgentRow({
  agent,
  rank,
}: {
  agent: {
    agentCode: string;
    agentName: string;
    total: number;
    delivered: number;
    returned: number;
    inTransit: number;
    statusBreakdown: Record<string, number>;
    partnerBreakdown?: Record<string, { total: number; delivered: number; returned: number; inTransit: number }>;
  };
  rank: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const deliveryRate = agent.total > 0 ? (agent.delivered / agent.total) * 100 : 0;
  const returnRate = agent.total > 0 ? (agent.returned / agent.total) * 100 : 0;
  const completedRate =
    agent.delivered + agent.returned > 0
      ? (agent.delivered / (agent.delivered + agent.returned)) * 100
      : 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: rank * 0.03 }}
      className="border border-border/40 rounded-xl bg-card overflow-hidden"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-gray-50/50 transition-colors"
      >
        {/* Rank */}
        <div className="flex-shrink-0 h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
          <span className="text-xs font-bold text-muted-foreground">#{rank + 1}</span>
        </div>

        {/* Agent info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground truncate">{agent.agentName}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-muted-foreground font-data">
              {agent.agentCode.toUpperCase()}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">{agent.total} orders</span>
        </div>

        {/* Quick stats */}
        <div className="hidden md:flex items-center gap-6">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Delivery</p>
            <p className={`text-sm font-bold font-data ${deliveryRate >= 50 ? "text-emerald-600" : deliveryRate >= 35 ? "text-amber-600" : "text-red-600"}`}>
              {deliveryRate.toFixed(1)}%
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Return</p>
            <p className={`text-sm font-bold font-data ${returnRate <= 20 ? "text-emerald-600" : returnRate <= 35 ? "text-amber-600" : "text-red-600"}`}>
              {returnRate.toFixed(1)}%
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Success*</p>
            <p className={`text-sm font-bold font-data ${completedRate >= 60 ? "text-emerald-600" : completedRate >= 45 ? "text-amber-600" : "text-red-600"}`}>
              {completedRate.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="hidden lg:block w-32">
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden flex">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${deliveryRate}%` }}
            />
            <div
              className="h-full bg-red-400 transition-all"
              style={{ width: `${returnRate}%` }}
            />
          </div>
        </div>

        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 border-t border-border/30">
              {/* Mobile stats */}
              <div className="md:hidden grid grid-cols-3 gap-3 mb-3">
                <div className="text-center p-2 rounded-lg bg-emerald-50">
                  <p className="text-xs text-emerald-600">Delivery</p>
                  <p className="text-sm font-bold font-data text-emerald-700">{deliveryRate.toFixed(1)}%</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-red-50">
                  <p className="text-xs text-red-600">Return</p>
                  <p className="text-sm font-bold font-data text-red-700">{returnRate.toFixed(1)}%</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-blue-50">
                  <p className="text-xs text-blue-600">Success*</p>
                  <p className="text-sm font-bold font-data text-blue-700">{completedRate.toFixed(1)}%</p>
                </div>
              </div>

              {/* Partner breakdown — only shown when multiple partners exist */}
              {agent.partnerBreakdown && Object.keys(agent.partnerBreakdown).length > 1 && (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Per Partner</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Object.entries(agent.partnerBreakdown)
                      .sort((a, b) => b[1].total - a[1].total)
                      .map(([partnerKey, ps]) => {
                        const pDeliveryRate = ps.total > 0 ? (ps.delivered / ps.total) * 100 : 0;
                        const pReturnRate = ps.total > 0 ? (ps.returned / ps.total) * 100 : 0;
                        const pSuccessRate = ps.delivered + ps.returned > 0 ? (ps.delivered / (ps.delivered + ps.returned)) * 100 : 0;
                        const partnerLabel = partnerKey === "48h" ? "EcoTrack" : partnerKey === "colivraison" ? "Colivraison" : partnerKey === "viconis48" ? "Viconis48" : partnerKey;
                        return (
                          <div key={partnerKey} className="rounded-lg border border-border/40 bg-gray-50/50 p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-foreground">{partnerLabel}</span>
                              <span className="text-[10px] font-data text-muted-foreground">{ps.total} orders</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-center">
                              <div>
                                <p className="text-[10px] text-muted-foreground">Delivered</p>
                                <p className={`text-xs font-bold font-data ${pDeliveryRate >= 50 ? "text-emerald-600" : pDeliveryRate >= 35 ? "text-amber-600" : "text-red-600"}`}>
                                  {ps.delivered} <span className="text-[10px] font-normal">({pDeliveryRate.toFixed(1)}%)</span>
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground">Returned</p>
                                <p className={`text-xs font-bold font-data ${pReturnRate <= 20 ? "text-emerald-600" : pReturnRate <= 35 ? "text-amber-600" : "text-red-600"}`}>
                                  {ps.returned} <span className="text-[10px] font-normal">({pReturnRate.toFixed(1)}%)</span>
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground">Success*</p>
                                <p className={`text-xs font-bold font-data ${pSuccessRate >= 60 ? "text-emerald-600" : pSuccessRate >= 45 ? "text-amber-600" : "text-red-600"}`}>
                                  {pSuccessRate.toFixed(1)}%
                                </p>
                              </div>
                            </div>
                            {/* Mini progress bar */}
                            <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden flex mt-2">
                              <div className="h-full bg-emerald-500" style={{ width: `${pDeliveryRate}%` }} />
                              <div className="h-full bg-red-400" style={{ width: `${pReturnRate}%` }} />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Status breakdown */}
              <p className="text-xs font-semibold text-muted-foreground mb-2">Status Breakdown</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(agent.statusBreakdown).map(([status, count]) => (
                  <div
                    key={status}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${STATUS_COLORS[status] || "bg-gray-100 text-gray-700"}`}
                  >
                    <div className={`h-2 w-2 rounded-full ${STATUS_DOT_COLORS[status] || "bg-gray-400"}`} />
                    <span className="font-medium">{STATUS_LABELS[status] || status}</span>
                    <span className="ml-auto font-bold font-data">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Status Distribution Chart (CSS-based) ───────────────────────────────
function StatusDistribution({ breakdown }: { breakdown: Record<string, number> }) {
  const total = Object.values(breakdown).reduce((s, n) => s + n, 0);
  if (total === 0) return null;

  const entries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/50 bg-card p-5 shadow-sm"
    >
      <h3 className="text-sm font-bold text-foreground mb-4">Status Distribution</h3>

      {/* Stacked bar */}
      <div className="h-4 rounded-full overflow-hidden flex mb-4">
        {entries.map(([status, count]) => (
          <div
            key={status}
            className={`h-full transition-all ${STATUS_DOT_COLORS[status] || "bg-gray-400"}`}
            style={{ width: `${(count / total) * 100}%` }}
            title={`${STATUS_LABELS[status] || status}: ${count} (${((count / total) * 100).toFixed(1)}%)`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {entries.map(([status, count]) => (
          <div key={status} className="flex items-center gap-2 text-xs">
            <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${STATUS_DOT_COLORS[status] || "bg-gray-400"}`} />
            <span className="text-muted-foreground truncate">{STATUS_LABELS[status] || status}</span>
            <span className="ml-auto font-bold font-data text-foreground">{count}</span>
            <span className="text-muted-foreground font-data">({((count / total) * 100).toFixed(1)}%)</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ─── MEDIAZ Performance Table ────────────────────────────────────────────
function MediazTable({
  mediaz,
}: {
  mediaz: Array<{ code: string; total: number; delivered: number; returned: number; inTransit: number }>;
}) {
  if (mediaz.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/50 bg-card p-5 shadow-sm"
    >
      <h3 className="text-sm font-bold text-foreground mb-4">MEDIAZ Performance</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/30">
              <th className="text-left py-2 px-3 font-semibold text-muted-foreground">Code</th>
              <th className="text-right py-2 px-3 font-semibold text-muted-foreground">Total</th>
              <th className="text-right py-2 px-3 font-semibold text-muted-foreground">Delivered</th>
              <th className="text-right py-2 px-3 font-semibold text-muted-foreground">Returned</th>
              <th className="text-right py-2 px-3 font-semibold text-muted-foreground">In Transit</th>
              <th className="text-right py-2 px-3 font-semibold text-muted-foreground">Delivery %</th>
            </tr>
          </thead>
          <tbody>
            {mediaz.map((m) => {
              const rate = m.total > 0 ? (m.delivered / m.total) * 100 : 0;
              return (
                <tr key={m.code} className="border-b border-border/20 hover:bg-gray-50/50">
                  <td className="py-2 px-3 font-semibold text-foreground">{m.code}</td>
                  <td className="py-2 px-3 text-right font-data">{m.total}</td>
                  <td className="py-2 px-3 text-right font-data text-emerald-600">{m.delivered}</td>
                  <td className="py-2 px-3 text-right font-data text-red-600">{m.returned}</td>
                  <td className="py-2 px-3 text-right font-data text-blue-600">{m.inTransit}</td>
                  <td className={`py-2 px-3 text-right font-data font-bold ${rate >= 50 ? "text-emerald-600" : rate >= 35 ? "text-amber-600" : "text-red-600"}`}>
                    {rate.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

// ─── Top Wilayas Table ───────────────────────────────────────────────────
function WilayaTable({
  wilayas,
}: {
  wilayas: Array<{ name: string; total: number; delivered: number; returned: number }>;
}) {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? wilayas : wilayas.slice(0, 10);

  if (wilayas.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/50 bg-card p-5 shadow-sm"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-foreground">Top Wilayas</h3>
        <span className="text-xs text-muted-foreground">{wilayas.length} wilayas</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/30">
              <th className="text-left py-2 px-3 font-semibold text-muted-foreground">Wilaya</th>
              <th className="text-right py-2 px-3 font-semibold text-muted-foreground">Total</th>
              <th className="text-right py-2 px-3 font-semibold text-muted-foreground">Delivered</th>
              <th className="text-right py-2 px-3 font-semibold text-muted-foreground">Returned</th>
              <th className="text-right py-2 px-3 font-semibold text-muted-foreground">Delivery %</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((w) => {
              const rate = w.total > 0 ? (w.delivered / w.total) * 100 : 0;
              return (
                <tr key={w.name} className="border-b border-border/20 hover:bg-gray-50/50">
                  <td className="py-2 px-3 font-semibold text-foreground flex items-center gap-1.5">
                    <MapPin className="h-3 w-3 text-muted-foreground" />
                    {w.name}
                  </td>
                  <td className="py-2 px-3 text-right font-data">{w.total}</td>
                  <td className="py-2 px-3 text-right font-data text-emerald-600">{w.delivered}</td>
                  <td className="py-2 px-3 text-right font-data text-red-600">{w.returned}</td>
                  <td className={`py-2 px-3 text-right font-data font-bold ${rate >= 50 ? "text-emerald-600" : rate >= 35 ? "text-amber-600" : "text-red-600"}`}>
                    {rate.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {wilayas.length > 10 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-3 text-xs text-primary font-medium hover:underline"
        >
          {showAll ? "Show less" : `Show all ${wilayas.length} wilayas`}
        </button>
      )}
    </motion.div>
  );
}

// ─── Upload History ──────────────────────────────────────────────────────
function UploadHistory() {
  const { data: uploads, isLoading } = trpc.delivery.uploads.useQuery(undefined, {
    staleTime: 60_000,
  });

  if (isLoading || !uploads || uploads.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/50 bg-card p-5 shadow-sm"
    >
      <h3 className="text-sm font-bold text-foreground mb-3">Recent Uploads</h3>
      <div className="space-y-2">
        {uploads.map((u: any) => (
          <div key={u.batchId} className="flex items-center gap-3 text-xs p-2 rounded-lg hover:bg-gray-50/50">
            <div className="h-7 w-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Upload className="h-3.5 w-3.5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">{u.filename}</p>
              <p className="text-muted-foreground">
                {u.totalRows} rows · {u.newOrders} new · {u.updatedOrders} updated · by {u.uploadedBy}
              </p>
            </div>
            <span className="text-muted-foreground flex-shrink-0">
              {new Date(u.createdAt).toLocaleDateString()}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────
export default function DeliveryTracking() {
  const utils = trpc.useUtils();
  const [partner, setPartner] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const isFiltered = dateFrom !== "" || dateTo !== "";

  // Fetch stats with date filter
  const statsInput = useMemo(
    () => ({
      ...(partner !== "all" ? { partner } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
    }),
    [partner, dateFrom, dateTo]
  );
  const { data: stats, isLoading: statsLoading } = trpc.delivery.stats.useQuery(statsInput, {
    staleTime: 30_000,
  });

  // Upload mutation
  const uploadMutation = trpc.delivery.upload.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.message);
        utils.delivery.stats.invalidate();
        utils.delivery.uploads.invalidate();
      } else {
        toast.error(result.message);
      }
    },
    onError: (err) => {
      toast.error(`Upload failed: ${err.message}`);
    },
  });

  const handleUpload = useCallback(
    async (file: File) => {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        uploadMutation.mutate({
          fileBase64: base64,
          filename: file.name,
          partner,
        });
      };
      reader.readAsDataURL(file);
    },
    [partner, uploadMutation]
  );

  const handleClearFilter = useCallback(() => {
    setDateFrom("");
    setDateTo("");
  }, []);

  const hasData = stats && stats.totalOrders > 0;

  return (
    <div className="container py-6 space-y-5">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-indigo-100 flex items-center justify-center">
            <Truck className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Delivery Tracking</h2>
            <p className="text-xs text-muted-foreground">
              {partner === "all" ? "All partners combined" : partner === "48h" ? "48H / EcoTrack" : "Colivraison"} delivery performance
            </p>
          </div>
        </div>
        {hasData && (
          <span className="text-xs text-muted-foreground font-data">
            {stats.totalOrders.toLocaleString()} orders
            {isFiltered && " (filtered)"}
          </span>
        )}
      </div>

      {/* Partner Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-gray-100 w-fit">
        <button
          onClick={() => setPartner("all")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            partner === "all"
              ? "bg-white text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          All Partners
        </button>
        <button
          onClick={() => setPartner("48h")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            partner === "48h"
              ? "bg-white text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          48H / EcoTrack
        </button>
        <button
          onClick={() => setPartner("colivraison")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            partner === "colivraison"
              ? "bg-white text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Colivraison
        </button>
      </div>

      {/* Upload Zone — hidden on All Partners view */}
      {partner !== "all" && (
        <FileUploadZone onUpload={handleUpload} isUploading={uploadMutation.isPending} partnerLabel={partner === "48h" ? "EcoTrack" : "Colivraison"} />
      )}

      {/* Upload result feedback */}
      {uploadMutation.data && !uploadMutation.data.success && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>{uploadMutation.data.message}</span>
        </div>
      )}

      {/* Date Filter — always visible once there's data or loading */}
      <DateFilter
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onClear={handleClearFilter}
        isFiltered={isFiltered}
      />

      {/* Loading state */}
      {statsLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Dashboard — only shown when data exists */}
      {hasData && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <KpiCard
              title="Total Orders"
              value={stats.totalOrders.toLocaleString()}
              subtitle={`${stats.agents.length} agents tracked`}
              icon={Package}
              color="blue"
            />
            <KpiCard
              title="Delivered"
              value={stats.totalDelivered.toLocaleString()}
              subtitle={`${stats.deliveryRate.toFixed(1)}% of total`}
              icon={CheckCircle}
              color="green"
            />
            <KpiCard
              title="Returned"
              value={stats.totalReturned.toLocaleString()}
              subtitle={`${stats.totalOrders > 0 ? ((stats.totalReturned / stats.totalOrders) * 100).toFixed(1) : 0}% of total`}
              icon={XCircle}
              color="red"
            />
            <KpiCard
              title="In Transit"
              value={stats.totalInTransit.toLocaleString()}
              subtitle="Pending delivery"
              icon={Clock}
              color="amber"
            />
            <KpiCard
              title="Delivery Rate"
              value={`${stats.deliveryRate.toFixed(1)}%`}
              subtitle="Delivered / Total (incl. in-transit)"
              icon={Truck}
              color="purple"
            />
          </div>

          {/* Status Distribution */}
          <StatusDistribution breakdown={stats.overallStatusBreakdown} />

          {/* Agent Performance */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-foreground">Agent Performance</h3>
              <span className="text-xs text-muted-foreground">{stats.agents.length} agents</span>
            </div>
            <div className="space-y-2">
              {stats.agents.map((agent: any, i: number) => (
                <AgentRow key={agent.agentCode} agent={agent} rank={i} />
              ))}
            </div>
          </div>

          {/* MEDIAZ Performance */}
          <MediazTable mediaz={stats.mediaz} />

          {/* Top Wilayas */}
          <WilayaTable wilayas={stats.wilayas} />
        </>
      )}

      {/* Empty state */}
      {!statsLoading && !hasData && !isFiltered && (
        <div className="text-center py-12">
          <Truck className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-sm font-semibold text-foreground mb-1">No delivery data yet</h3>
          <p className="text-xs text-muted-foreground">
            {partner === "all" ? "Switch to a specific partner tab to upload data." : `Upload ${partner === "48h" ? "an EcoTrack" : "a Colivraison"} Excel export above to start tracking delivery performance.`}
          </p>
        </div>
      )}

      {/* Empty state for filtered with no results */}
      {!statsLoading && !hasData && isFiltered && (
        <div className="text-center py-12">
          <Calendar className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-sm font-semibold text-foreground mb-1">No orders in this date range</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Try adjusting the date filter or clear it to see all data.
          </p>
          <Button variant="outline" size="sm" onClick={handleClearFilter}>
            <X className="mr-1.5 h-3 w-3" />
            Clear Filter
          </Button>
        </div>
      )}

      {/* Upload History */}
      <UploadHistory />

      {/* Footer */}
      <div className="pt-2 pb-6 text-center">
        <p className="text-[10px] text-muted-foreground/50">
          Scalex Groupe · Delivery Tracking Dashboard
        </p>
      </div>
    </div>
  );
}
