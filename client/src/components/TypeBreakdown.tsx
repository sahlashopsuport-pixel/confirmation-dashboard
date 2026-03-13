/**
 * TypeBreakdown — Shows confirmation/cancellation rates by order type (NORMAL vs ABONDON)
 * Only displayed for dashboards that have type data (e.g., Viconis)
 */

import { motion } from 'framer-motion';
import { Package, ShoppingCart, CheckCircle, XCircle, Percent } from 'lucide-react';

interface TypeStats {
  total: number;
  confirmed: number;
  cancelled: number;
  confirmationRate: number;
  cancellationRate: number;
}

interface TypeBreakdownProps {
  typeBreakdown: Record<string, TypeStats>;
}

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Package; color: string; bgColor: string; borderColor: string }> = {
  NORMAL: {
    label: 'Normal Leads',
    icon: ShoppingCart,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  ABONDON: {
    label: 'Abandoned Cart',
    icon: Package,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
  ABANDONED: {
    label: 'Abandoned Cart',
    icon: Package,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
};

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type] || {
    label: type,
    icon: Package,
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
  };
}

export default function TypeBreakdown({ typeBreakdown }: TypeBreakdownProps) {
  const types = Object.entries(typeBreakdown)
    .filter(([type, stats]) => type && type !== 'UNKNOWN' && type !== '' && stats.total >= 5)
    .sort((a, b) => b[1].total - a[1].total);
  
  if (types.length <= 1) return null; // No point showing breakdown if only one type

  const totalOrders = types.reduce((sum, [, stats]) => sum + stats.total, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.35 }}
      className="rounded-xl border border-border/50 bg-card p-5 card-shadow"
    >
      <div className="flex items-center gap-2 mb-4">
        <Percent className="h-4 w-4 text-purple-500" />
        <h3 className="text-sm font-bold text-foreground">Confirmation Rate by Type</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {types.map(([type, stats]) => {
          const config = getTypeConfig(type);
          const Icon = config.icon;
          const pctOfTotal = totalOrders > 0 ? ((stats.total / totalOrders) * 100).toFixed(1) : '0';

          return (
            <div
              key={type}
              className={`rounded-xl border ${config.borderColor} ${config.bgColor} p-4 space-y-3`}
            >
              {/* Type header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${config.color}`} />
                  <span className={`text-sm font-bold ${config.color}`}>{config.label}</span>
                </div>
                <span className="text-xs text-muted-foreground font-data">
                  {stats.total.toLocaleString()} orders ({pctOfTotal}%)
                </span>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <CheckCircle className="h-3 w-3 text-teal" />
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Confirmed</span>
                  </div>
                  <p className="text-lg font-bold font-data text-teal">{stats.confirmationRate.toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground font-data">{stats.confirmed.toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <XCircle className="h-3 w-3 text-coral" />
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Cancelled</span>
                  </div>
                  <p className="text-lg font-bold font-data text-coral">{stats.cancellationRate.toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground font-data">{stats.cancelled.toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Percent className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Other</span>
                  </div>
                  <p className="text-lg font-bold font-data text-foreground">
                    {(100 - stats.confirmationRate - stats.cancellationRate).toFixed(1)}%
                  </p>
                  <p className="text-xs text-muted-foreground font-data">
                    {(stats.total - stats.confirmed - stats.cancelled).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Confirmation rate bar */}
              <div className="space-y-1">
                <div className="h-2.5 rounded-full bg-white/60 overflow-hidden flex">
                  <div
                    className="h-full rounded-l-full transition-all duration-700"
                    style={{
                      width: `${Math.min(stats.confirmationRate, 100)}%`,
                      backgroundColor: 'oklch(0.6 0.15 185)',
                    }}
                  />
                  <div
                    className="h-full transition-all duration-700"
                    style={{
                      width: `${Math.min(stats.cancellationRate, 100)}%`,
                      backgroundColor: 'oklch(0.6 0.2 25)',
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Comparison summary */}
      {types.length === 2 && (
        <div className="mt-4 pt-3 border-t border-border/30">
          <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
            {types.map(([type, stats]) => {
              const config = getTypeConfig(type);
              return (
                <div key={type} className="flex items-center gap-1.5">
                  <div className={`h-2.5 w-2.5 rounded-full ${config.bgColor} border ${config.borderColor}`} />
                  <span className="font-medium">{config.label}:</span>
                  <span className={`font-data font-bold ${stats.confirmationRate >= 55 ? 'text-teal' : stats.confirmationRate >= 40 ? 'text-amber' : 'text-coral'}`}>
                    {stats.confirmationRate.toFixed(1)}% conf.
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}
