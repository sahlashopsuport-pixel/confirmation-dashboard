/**
 * AgentDetail — Clean light theme modal
 * White card, soft shadows, colorful stat badges
 */

import { motion } from 'framer-motion';
import { X, CheckCircle, XCircle, Clock, PhoneOff, Phone, ArrowUpRight } from 'lucide-react';
import type { AgentData } from '@/lib/sheets';

interface AgentDetailProps {
  agent: AgentData;
  onClose: () => void;
}

export default function AgentDetail({ agent, onClose }: AgentDetailProps) {
  const statItems = [
    { label: 'Total Orders', value: agent.totalOrders, icon: Phone, color: 'text-blue', bg: 'bg-blue-light' },
    { label: 'Confirmed', value: agent.confirmed, icon: CheckCircle, color: 'text-teal', bg: 'bg-teal-light' },
    { label: 'Cancelled', value: agent.cancelled, icon: XCircle, color: 'text-coral', bg: 'bg-coral-light' },
    { label: 'Postponed', value: agent.postponed, icon: Clock, color: 'text-amber', bg: 'bg-amber-light' },
    { label: 'Closed Number', value: agent.closedNumber, icon: PhoneOff, color: 'text-muted-foreground', bg: 'bg-secondary' },
    { label: 'No Answer', value: agent.noAnswer, icon: PhoneOff, color: 'text-muted-foreground', bg: 'bg-secondary' },
    { label: 'Callbacks', value: agent.callbackAttempts, icon: Phone, color: 'text-amber', bg: 'bg-amber-light' },
    { label: 'No Status', value: agent.noStatus, icon: Clock, color: 'text-purple-500', bg: 'bg-purple-50' },
    { label: 'Other', value: agent.other, icon: Phone, color: 'text-muted-foreground', bg: 'bg-secondary' },
  ];

  const weekStats = [1, 2, 3, 4]
    .map(w => ({ week: w, ...agent.weeklyBreakdown[w] }))
    .filter(w => w.total > 0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-2xl rounded-2xl bg-card border border-border/50 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center shadow-md shadow-primary/20">
              <span className="text-lg font-bold text-primary-foreground">
                {agent.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{agent.name}</h2>
              <p className="text-xs text-muted-foreground">Detailed Performance</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 hover:bg-secondary transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Stats Grid */}
        <div className="p-5 grid grid-cols-4 gap-3">
          {statItems.map(item => (
            <div key={item.label} className={`rounded-xl ${item.bg} p-3`}>
              <div className="flex items-center gap-1.5 mb-1">
                <item.icon className={`h-3.5 w-3.5 ${item.color}`} />
                <span className="text-xs text-muted-foreground">{item.label}</span>
              </div>
              <p className={`font-data text-xl font-bold ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>

        {/* Key Rates */}
        <div className="px-5 pb-4 grid grid-cols-5 gap-3">
          <div className="rounded-xl bg-teal-light border border-teal/15 p-3">
            <p className="text-xs text-teal font-medium mb-0.5">Conf. Rate</p>
            <p className="font-data text-2xl font-bold text-teal">{agent.confirmationRate.toFixed(1)}%</p>
          </div>
          <div className="rounded-xl bg-green-50 border border-green-500/15 p-3">
            <p className="text-xs text-green-600 font-medium mb-0.5">Worked %</p>
            <p className="font-data text-2xl font-bold text-green-600">{agent.workedConfirmationRate.toFixed(1)}%</p>
            {agent.noStatus > 0 && <p className="text-[10px] text-muted-foreground mt-0.5">{agent.noStatus} untouched</p>}
          </div>
          <div className="rounded-xl bg-coral-light border border-coral/15 p-3">
            <p className="text-xs text-coral font-medium mb-0.5">Cancel Rate</p>
            <p className="font-data text-2xl font-bold text-coral">{agent.cancellationRate.toFixed(1)}%</p>
          </div>
          <div className="rounded-xl bg-blue-light border border-blue/15 p-3">
            <p className="text-xs text-blue font-medium mb-0.5">Upsell Qty</p>
            <p className="font-data text-2xl font-bold text-blue">{agent.upsellCount}</p>
          </div>
          <div className="rounded-xl bg-amber-light border border-amber/15 p-3">
            <p className="text-xs text-amber font-medium mb-0.5">Upsell Rate</p>
            <p className="font-data text-2xl font-bold text-amber">{agent.upsellRate.toFixed(1)}%</p>
          </div>
        </div>

        {/* Weekly Breakdown */}
        {weekStats.length > 0 && (
          <div className="px-5 pb-5">
            <h3 className="text-sm font-semibold text-foreground mb-2">Weekly Breakdown</h3>
            <div className="grid grid-cols-4 gap-2">
              {weekStats.map(w => (
                <div key={w.week} className="rounded-xl bg-secondary p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Week {w.week}</p>
                  <p className="font-data text-sm font-bold text-foreground">{w.total} orders</p>
                  <p className="font-data text-xs text-teal font-medium">{w.confirmationRate.toFixed(0)}% conf.</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Link to sheet */}
        <div className="px-5 pb-5">
          <a
            href={agent.sheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Open original sheet <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>
      </motion.div>
    </motion.div>
  );
}
