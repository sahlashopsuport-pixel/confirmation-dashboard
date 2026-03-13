/**
 * WeeklyChart — Clean light theme
 */

import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { AgentData } from '@/lib/sheets';

interface WeeklyChartProps {
  agents: AgentData[];
}

export default function WeeklyChart({ agents }: WeeklyChartProps) {
  const weekData = [1, 2, 3, 4].map(week => {
    const weekStats = agents.reduce(
      (acc, agent) => {
        const wb = agent.weeklyBreakdown[week];
        if (wb) {
          acc.total += wb.total;
          acc.confirmed += wb.confirmed;
          acc.cancelled += wb.cancelled;
        }
        return acc;
      },
      { total: 0, confirmed: 0, cancelled: 0 }
    );

    return {
      name: `Week ${week}`,
      Confirmed: weekStats.confirmed,
      Cancelled: weekStats.cancelled,
      Other: weekStats.total - weekStats.confirmed - weekStats.cancelled,
      'Conf. Rate': weekStats.total > 0
        ? parseFloat(((weekStats.confirmed / weekStats.total) * 100).toFixed(1))
        : 0,
    };
  }).filter(w => w.Confirmed > 0 || w.Cancelled > 0 || w.Other > 0);

  if (weekData.length === 0) {
    return null;
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const total = payload.reduce((s: number, p: any) => s + (p.value || 0), 0);
      return (
        <div className="rounded-xl border border-border bg-card p-3 shadow-lg card-shadow">
          <p className="text-sm font-semibold text-foreground mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="font-data text-xs" style={{ color: entry.color }}>
              {entry.name}: {entry.value}
            </p>
          ))}
          <div className="mt-1 pt-1 border-t border-border">
            <p className="font-data text-xs text-muted-foreground">Total: {total}</p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.4 }}
      className="rounded-xl border border-border/50 bg-card p-5 card-shadow"
    >
      <h3 className="text-sm font-semibold text-foreground mb-1">Weekly Breakdown</h3>
      <p className="text-xs text-muted-foreground mb-4">Orders by status per week (all agents)</p>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={weekData} margin={{ left: 0, right: 10 }}>
            <XAxis
              dataKey="name"
              tick={{ fill: '#374151', fontSize: 12, fontFamily: 'DM Sans' }}
              axisLine={{ stroke: '#e5e7eb' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 11, fontFamily: 'JetBrains Mono' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(value: string) => (
                <span style={{ color: '#6b7280', fontSize: '11px', fontFamily: 'DM Sans' }}>
                  {value}
                </span>
              )}
            />
            <Bar dataKey="Confirmed" stackId="a" fill="oklch(0.6 0.15 185)" radius={[0, 0, 0, 0]} />
            <Bar dataKey="Cancelled" stackId="a" fill="oklch(0.6 0.2 25)" radius={[0, 0, 0, 0]} />
            <Bar dataKey="Other" stackId="a" fill="oklch(0.82 0.03 250)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
