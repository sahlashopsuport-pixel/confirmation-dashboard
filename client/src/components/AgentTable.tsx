/**
 * AgentTable — Clean light theme
 * White card, soft shadow, clean borders, readable text
 * Supports optional Normal/Abandoned columns for Viconis
 * Ranked by Lead Score (profit per lead) but score number is hidden
 * Shows delivery rate columns when deliveryRates prop is provided (Algeria only)
 */

import { motion } from 'framer-motion';
import { ArrowUpDown, Trophy, TrendingUp, TrendingDown, Trash2, ExternalLink, Truck } from 'lucide-react';
import { useState, useMemo } from 'react';
import type { AgentData } from '@/lib/sheets';
import ActivityIndicator from '@/components/ActivityIndicator';
import type { AgentActivityInfo } from '@/hooks/useAgentActivity';

interface DeliveryStats {
  total: number;
  delivered: number;
  returned: number;
  inTransit: number;
  deliveryRate: number;
}

interface AgentTableProps {
  agents: AgentData[];
  onRemoveAgent?: (agentName: string, sheetUrl: string) => void;
  showTypeColumns?: boolean;
  getActivity?: (agentName: string) => AgentActivityInfo;
  untreatedCounts?: Record<number, { total: number; untreated: number }>;
  agentIdMap?: Record<string, number>;
  filterWarnings?: Record<string, string[]>;
  organicStats?: Map<string, { total: number; confirmed: number; confirmationRate: number; cancellationRate: number }>;
  deliveryRates?: Record<string, DeliveryStats>;
}

type SortKey = 'name' | 'totalOrders' | 'confirmed' | 'cancelled' | 'confirmationRate' | 'workedConfirmationRate' | 'cancellationRate' | 'upsellCount' | 'upsellRate' | 'normalOrders' | 'abandonedOrders' | 'normalConfirmationRate' | 'untreated' | 'leadScore' | 'organicTotal' | 'organicConfRate' | 'deliveryRate' | 'deliveryTotal' | 'performance';
type SortDir = 'asc' | 'desc';

export default function AgentTable({ agents, onRemoveAgent, showTypeColumns = false, getActivity, untreatedCounts, agentIdMap, filterWarnings, organicStats, deliveryRates }: AgentTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('leadScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const getUntreated = (agentSheetUrl: string) => {
    if (!untreatedCounts || !agentIdMap) return 0;
    const id = agentIdMap[agentSheetUrl.trim()];
    return id != null ? (untreatedCounts[id]?.untreated ?? 0) : 0;
  };

  const getDelivery = (agentName: string): DeliveryStats | undefined => {
    if (!deliveryRates) return undefined;
    return deliveryRates[agentName];
  };

  const sorted = useMemo(() => {
    return [...agents].sort((a, b) => {
      if (sortKey === 'untreated') {
        const aVal = getUntreated(a.sheetUrl);
        const bVal = getUntreated(b.sheetUrl);
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      if (sortKey === 'organicTotal' && organicStats) {
        const aVal = organicStats.get(a.name)?.total ?? 0;
        const bVal = organicStats.get(b.name)?.total ?? 0;
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      if (sortKey === 'organicConfRate' && organicStats) {
        const aVal = organicStats.get(a.name)?.confirmationRate ?? 0;
        const bVal = organicStats.get(b.name)?.confirmationRate ?? 0;
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      if (sortKey === 'deliveryRate' && deliveryRates) {
        const aVal = getDelivery(a.name)?.deliveryRate ?? -1;
        const bVal = getDelivery(b.name)?.deliveryRate ?? -1;
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      if (sortKey === 'deliveryTotal' && deliveryRates) {
        const aVal = getDelivery(a.name)?.total ?? 0;
        const bVal = getDelivery(b.name)?.total ?? 0;
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      if (sortKey === 'performance' && deliveryRates) {
        const aDel = getDelivery(a.name);
        const bDel = getDelivery(b.name);
        const aPerf = aDel && aDel.total > 0 ? (a.workedConfirmationRate / 100) * (aDel.deliveryRate / 100) * 100 : -1;
        const bPerf = bDel && bDel.total > 0 ? (b.workedConfirmationRate / 100) * (bDel.deliveryRate / 100) * 100 : -1;
        return sortDir === 'asc' ? aPerf - bPerf : bPerf - aPerf;
      }
      const aVal = a[sortKey as keyof AgentData];
      const bVal = b[sortKey as keyof AgentData];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [agents, sortKey, sortDir, untreatedCounts, agentIdMap, organicStats, deliveryRates]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const getRankBadge = (index: number) => {
    if (index === 0) return (
      <div className="h-6 w-6 rounded-full bg-amber-light flex items-center justify-center">
        <Trophy className="h-3.5 w-3.5 text-amber" />
      </div>
    );
    if (index === 1) return <span className="font-data text-xs font-semibold text-muted-foreground">#2</span>;
    if (index === 2) return <span className="font-data text-xs font-semibold text-muted-foreground">#3</span>;
    return <span className="font-data text-xs text-muted-foreground">#{index + 1}</span>;
  };

  const getConfirmationColor = (rate: number) => {
    if (rate >= 60) return 'text-teal';
    if (rate >= 45) return 'text-amber';
    return 'text-coral';
  };

  const getCancellationColor = (rate: number) => {
    if (rate <= 15) return 'text-teal';
    if (rate <= 30) return 'text-amber';
    return 'text-coral';
  };

  const getDeliveryColor = (rate: number) => {
    if (rate >= 60) return 'text-teal';
    if (rate >= 45) return 'text-amber';
    return 'text-coral';
  };

  const getPerformanceColor = (rate: number) => {
    if (rate >= 35) return 'text-teal';
    if (rate >= 25) return 'text-amber';
    return 'text-coral';
  };

  const SortHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => (
    <button
      onClick={() => toggleSort(sortKeyName)}
      className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition-colors ${
        sortKey === sortKeyName ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
      <ArrowUpDown className="h-3 w-3" />
    </button>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="rounded-xl border border-border/50 bg-card overflow-hidden card-shadow"
    >
      <div className="p-5 border-b border-border/50">
        <h3 className="text-sm font-bold text-foreground">Agent Performance Ranking</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Ranked by profitability per lead · Click column headers to sort</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/50 bg-secondary/50">
              <th className="px-4 py-3 text-left w-10">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">#</span>
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader label="Agent" sortKeyName="name" />
              </th>
              <th className="px-4 py-3 text-right">
                <SortHeader label="Orders" sortKeyName="totalOrders" />
              </th>
              {showTypeColumns && (
                <>
                  <th className="px-4 py-3 text-right">
                    <SortHeader label="Normal" sortKeyName="normalOrders" />
                  </th>
                  <th className="px-4 py-3 text-right">
                    <SortHeader label="Abandon" sortKeyName="abandonedOrders" />
                  </th>
                </>
              )}
              <th className="px-4 py-3 text-right">
                <SortHeader label="Confirmed" sortKeyName="confirmed" />
              </th>
              <th className="px-4 py-3 text-right">
                <SortHeader label="Cancelled" sortKeyName="cancelled" />
              </th>
              <th className="px-4 py-3 text-right">
                <SortHeader label="Worked Conf. Rate" sortKeyName="workedConfirmationRate" />
              </th>
              {deliveryRates && (
                <>
                  <th className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Truck className="h-3 w-3 text-muted-foreground" />
                      <SortHeader label="Del. %" sortKeyName="deliveryRate" />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <SortHeader label="Perf." sortKeyName="performance" />
                  </th>
                </>
              )}
              {showTypeColumns && (
                <th className="px-4 py-3 text-right">
                  <SortHeader label="Normal %" sortKeyName="normalConfirmationRate" />
                </th>
              )}
              <th className="px-4 py-3 text-right">
                <SortHeader label="Cancel %" sortKeyName="cancellationRate" />
              </th>
              <th className="px-4 py-3 text-right">
                <SortHeader label="Upsell Qty" sortKeyName="upsellCount" />
              </th>
              <th className="px-4 py-3 text-right">
                <SortHeader label="Upsell %" sortKeyName="upsellRate" />
              </th>
              {organicStats && (
                <>
                  <th className="px-4 py-3 text-right">
                    <SortHeader label="Organic" sortKeyName="organicTotal" />
                  </th>
                  <th className="px-4 py-3 text-right">
                    <SortHeader label="Org. Conf%" sortKeyName="organicConfRate" />
                  </th>
                </>
              )}

              {untreatedCounts && (
                <th className="px-4 py-3 text-right">
                  <SortHeader label="Pending" sortKeyName="untreated" />
                </th>
              )}
              <th className="px-4 py-3 text-right">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</span>
              </th>
              <th className="px-3 py-3 text-center w-10">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sheet</span>
              </th>
              {onRemoveAgent && (
                <th className="px-3 py-3 text-right w-10">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((agent, index) => {
              const del = getDelivery(agent.name);
              return (
              <tr
                key={agent.name}
                className="border-b border-border/30 hover:bg-secondary/30 transition-colors group"
              >
                <td className="px-4 py-3.5">
                  {getRankBadge(index)}
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-xs font-bold text-primary">
                        {agent.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-foreground">{agent.name}</span>
                        {filterWarnings?.[agent.sheetUrl.trim()] && (
                          <span
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-300/50 text-[9px] font-semibold text-amber-600 cursor-help"
                            title={`Active filter on: ${filterWarnings[agent.sheetUrl.trim()].join(', ')} \u2014 data may be incomplete`}
                          >
                            <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
                            Filter
                          </span>
                        )}
                      </div>
                      {getActivity && (
                        <ActivityIndicator activity={getActivity(agent.name)} size="sm" />
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <span className="font-data text-sm text-foreground">{agent.totalOrders}</span>
                </td>
                {showTypeColumns && (
                  <>
                    <td className="px-4 py-3.5 text-right">
                      <span className="font-data text-sm font-medium text-blue-600">{agent.normalOrders}</span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="font-data text-sm font-medium text-amber">{agent.abandonedOrders}</span>
                    </td>
                  </>
                )}
                <td className="px-4 py-3.5 text-right">
                  <span className="font-data text-sm font-medium text-teal">{agent.confirmed}</span>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <span className="font-data text-sm font-medium text-coral">{agent.cancelled}</span>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <span className={`font-data text-sm font-bold ${getConfirmationColor(agent.workedConfirmationRate)}`}>
                    {agent.workedConfirmationRate.toFixed(1)}%
                  </span>
                  {agent.noStatus > 0 && (
                    <span className="block text-[10px] text-muted-foreground font-data">
                      {agent.noStatus} untouched
                    </span>
                  )}
                </td>
                {deliveryRates && (
                  <>
                    <td className="px-4 py-3.5 text-right">
                      {del && del.total > 0 ? (
                        <span className={`font-data text-sm font-bold ${getDeliveryColor(del.deliveryRate)}`}>
                          {del.deliveryRate.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="font-data text-sm text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {del && del.total > 0 ? (() => {
                        const perf = (agent.workedConfirmationRate / 100) * (del.deliveryRate / 100) * 100;
                        return (
                          <span className={`font-data text-sm font-bold ${getPerformanceColor(perf)}`}>
                            {perf.toFixed(1)}%
                          </span>
                        );
                      })() : (
                        <span className="font-data text-sm text-muted-foreground">-</span>
                      )}
                    </td>
                  </>
                )}
                {showTypeColumns && (
                  <td className="px-4 py-3.5 text-right">
                    <span className={`font-data text-sm font-bold ${getConfirmationColor(agent.normalConfirmationRate)}`}>
                      {agent.normalConfirmationRate.toFixed(1)}%
                    </span>
                  </td>
                )}
                <td className="px-4 py-3.5 text-right">
                  <span className={`font-data text-sm font-bold ${getCancellationColor(agent.cancellationRate)}`}>
                    {agent.cancellationRate.toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <span className="font-data text-sm font-medium text-blue">{agent.upsellCount}</span>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <span className="font-data text-sm text-foreground">
                    {agent.upsellRate.toFixed(1)}%
                  </span>
                </td>
                {organicStats && (() => {
                  const org = organicStats.get(agent.name);
                  return (
                    <>
                      <td className="px-4 py-3.5 text-right">
                        <span className="font-data text-sm text-muted-foreground">{org?.total ?? 0}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span className={`font-data text-sm font-medium ${org && org.total > 0 ? getConfirmationColor(org.confirmationRate) : 'text-muted-foreground'}`}>
                          {org && org.total > 0 ? `${org.confirmationRate.toFixed(1)}%` : '-'}
                        </span>
                      </td>
                    </>
                  );
                })()}

                {untreatedCounts && (
                  <td className="px-4 py-3.5 text-right">
                    {(() => {
                      const count = getUntreated(agent.sheetUrl);
                      if (count === 0) return (
                        <span className="inline-flex items-center rounded-full bg-teal-light px-2 py-0.5 text-xs font-data font-semibold text-teal">0</span>
                      );
                      if (count <= 10) return (
                        <span className="inline-flex items-center rounded-full bg-amber-light px-2 py-0.5 text-xs font-data font-semibold text-amber">{count}</span>
                      );
                      return (
                        <span className="inline-flex items-center rounded-full bg-coral-light px-2 py-0.5 text-xs font-data font-semibold text-coral">{count}</span>
                      );
                    })()}
                  </td>
                )}
                <td className="px-4 py-3.5 text-right">
                  {agent.confirmationRate >= 55 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-teal-light px-2.5 py-1 text-xs font-medium text-teal">
                      <TrendingUp className="h-3 w-3" />
                      Good
                    </span>
                  ) : agent.confirmationRate >= 40 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-light px-2.5 py-1 text-xs font-medium text-amber">
                      <TrendingUp className="h-3 w-3" />
                      Average
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-coral-light px-2.5 py-1 text-xs font-medium text-coral">
                      <TrendingDown className="h-3 w-3" />
                      Needs Work
                    </span>
                  )}
                </td>
                <td className="px-3 py-3.5 text-center">
                  <a
                    href={agent.sheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-lg p-1.5 hover:bg-primary/10 transition-all"
                    title={`Open ${agent.name}'s sheet`}
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                  </a>
                </td>
                {onRemoveAgent && (
                  <td className="px-3 py-3.5 text-right">
                    <button
                      onClick={() => onRemoveAgent(agent.name, agent.sheetUrl)}
                      className="rounded-lg p-1.5 opacity-0 group-hover:opacity-100 hover:bg-coral-light transition-all"
                      title="Remove agent"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-coral" />
                    </button>
                  </td>
                )}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
