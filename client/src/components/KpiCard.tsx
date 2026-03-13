/**
 * KPI Card — Clean light design with colorful icon circles
 * Matches reference: white card, soft shadow, colored icon badge, centered layout
 */

import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  color?: 'default' | 'teal' | 'coral' | 'amber' | 'green';
  delay?: number;
}

const colorMap = {
  default: {
    bg: 'bg-blue-light',
    icon: 'text-blue',
    ring: 'ring-blue/10',
  },
  teal: {
    bg: 'bg-teal-light',
    icon: 'text-teal',
    ring: 'ring-teal/10',
  },
  coral: {
    bg: 'bg-coral-light',
    icon: 'text-coral',
    ring: 'ring-coral/10',
  },
  amber: {
    bg: 'bg-amber-light',
    icon: 'text-amber',
    ring: 'ring-amber/10',
  },
  green: {
    bg: 'bg-green-light',
    icon: 'text-green',
    ring: 'ring-green/10',
  },
};

export default function KpiCard({ title, value, subtitle, icon: Icon, color = 'default', delay = 0 }: KpiCardProps) {
  const c = colorMap[color];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="rounded-xl bg-card p-5 card-shadow hover:card-shadow-hover transition-shadow border border-border/50"
    >
      <div className="flex flex-col items-center text-center gap-3">
        <div className={`h-12 w-12 rounded-full ${c.bg} flex items-center justify-center ring-4 ${c.ring}`}>
          <Icon className={`h-5 w-5 ${c.icon}`} />
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
          <p className="text-xl font-bold text-foreground mt-1 font-data">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
