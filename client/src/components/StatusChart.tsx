/**
 * StatusChart — Clean light theme
 * White card, soft shadows, readable dark text on charts
 */

import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import type { AgentData } from '@/lib/sheets';

interface StatusChartProps {
  agents: AgentData[];
}

const COLORS = {
  confirmed: 'oklch(0.6 0.15 185)',    // teal
  cancelled: 'oklch(0.6 0.2 25)',       // coral
  postponed: 'oklch(0.75 0.16 75)',     // amber
  closed: 'oklch(0.55 0.15 250)',       // blue
  no_answer: 'oklch(0.6 0.08 250)',     // muted blue
  other: 'oklch(0.65 0.05 250)',        // light muted
  no_status: 'oklch(0.7 0.12 300)',     // purple - unprocessed
};

export default function StatusChart({ agents }: StatusChartProps) {
  const barData = agents
    .map(a => ({
      name: a.name,
      'Conf. Rate': parseFloat(a.confirmationRate.toFixed(1)),
      'Cancel %': parseFloat(a.cancellationRate.toFixed(1)),
    }))
    .sort((a, b) => b['Conf. Rate'] - a['Conf. Rate']);

  const totalConfirmed = agents.reduce((s, a) => s + a.confirmed, 0);
  const totalCancelled = agents.reduce((s, a) => s + a.cancelled, 0);
  const totalPostponed = agents.reduce((s, a) => s + a.postponed, 0);
  const totalClosed = agents.reduce((s, a) => s + a.closedNumber, 0);
  const totalNoAnswer = agents.reduce((s, a) => s + a.noAnswer, 0);
  const totalOther = agents.reduce((s, a) => s + a.other, 0);
  const totalNoStatus = agents.reduce((s, a) => s + a.noStatus, 0);

  const pieData = [
    { name: 'Confirmed', value: totalConfirmed, color: COLORS.confirmed },
    { name: 'Cancelled', value: totalCancelled, color: COLORS.cancelled },
    { name: 'Postponed', value: totalPostponed, color: COLORS.postponed },
    { name: 'Closed #', value: totalClosed, color: COLORS.closed },
    { name: 'No Answer', value: totalNoAnswer, color: COLORS.no_answer },
    { name: 'No Status', value: totalNoStatus, color: COLORS.no_status },
    { name: 'Other', value: totalOther, color: COLORS.other },
  ].filter(d => d.value > 0);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-xl border border-border bg-card p-3 shadow-lg card-shadow">
          <p className="text-sm font-semibold text-foreground mb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="font-data text-xs" style={{ color: entry.color }}>
              {entry.name}: {entry.value}%
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const PieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className="rounded-xl border border-border bg-card p-3 shadow-lg card-shadow">
          <p className="text-sm font-semibold text-foreground">{data.name}</p>
          <p className="font-data text-xs text-muted-foreground">
            {data.value} orders ({((data.value / agents.reduce((s, a) => s + a.totalOrders, 0)) * 100).toFixed(1)}%)
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Bar Chart */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="lg:col-span-2 rounded-xl border border-border/50 bg-card p-5 card-shadow"
      >
        <h3 className="text-sm font-semibold text-foreground mb-1">Confirmation Rate by Agent</h3>
        <p className="text-xs text-muted-foreground mb-4">Sorted by performance</p>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={{ fill: '#6b7280', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                tickFormatter={(v) => `${v}%`}
                axisLine={{ stroke: '#e5e7eb' }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: '#374151', fontSize: 12, fontFamily: 'DM Sans' }}
                width={100}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Bar dataKey="Conf. Rate" radius={[0, 6, 6, 0]} barSize={24}>
                {barData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      entry['Conf. Rate'] >= 55
                        ? COLORS.confirmed
                        : entry['Conf. Rate'] >= 40
                        ? COLORS.postponed
                        : COLORS.cancelled
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Pie Chart */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="rounded-xl border border-border/50 bg-card p-5 card-shadow"
      >
        <h3 className="text-sm font-semibold text-foreground mb-1">Status Distribution</h3>
        <p className="text-xs text-muted-foreground mb-4">All agents combined</p>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="45%"
                innerRadius={50}
                outerRadius={85}
                paddingAngle={2}
                dataKey="value"
                stroke="#ffffff"
                strokeWidth={2}
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<PieTooltip />} />
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                iconSize={8}
                formatter={(value: string) => (
                  <span style={{ color: '#6b7280', fontSize: '11px', fontFamily: 'DM Sans' }}>
                    {value}
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
    </div>
  );
}
