/**
 * Activity Indicator Component
 * 
 * Shows a colored dot + label for agent activity status.
 * Green = Active, Yellow = Idle, Gray = Offline, Blue = Unknown/Checking
 */

import type { ActivityStatus, AgentActivityInfo } from '@/hooks/useAgentActivity';

const statusConfig: Record<ActivityStatus, { dotColor: string; pulseColor: string; textColor: string; showPulse: boolean }> = {
  active: {
    dotColor: 'bg-emerald-500',
    pulseColor: 'bg-emerald-400',
    textColor: 'text-emerald-600',
    showPulse: true,
  },
  idle: {
    dotColor: 'bg-amber-400',
    pulseColor: 'bg-amber-300',
    textColor: 'text-amber-600',
    showPulse: false,
  },
  offline: {
    dotColor: 'bg-gray-300',
    pulseColor: 'bg-gray-200',
    textColor: 'text-gray-400',
    showPulse: false,
  },
  unknown: {
    dotColor: 'bg-blue-300',
    pulseColor: 'bg-blue-200',
    textColor: 'text-blue-400',
    showPulse: false,
  },
};

interface ActivityIndicatorProps {
  activity: AgentActivityInfo;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export default function ActivityIndicator({ activity, showLabel = true, size = 'sm' }: ActivityIndicatorProps) {
  const config = statusConfig[activity.status];
  const dotSize = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5';
  const pulseSize = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5';

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative flex">
        {config.showPulse && (
          <span className={`animate-ping absolute inline-flex ${pulseSize} rounded-full ${config.pulseColor} opacity-75`} />
        )}
        <span className={`relative inline-flex rounded-full ${dotSize} ${config.dotColor}`} />
      </div>
      {showLabel && (
        <span className={`text-[10px] font-medium ${config.textColor} whitespace-nowrap`}>
          {activity.label}
        </span>
      )}
    </div>
  );
}

/**
 * Activity Summary Bar — shows count of active/idle/offline agents
 */
interface ActivitySummaryProps {
  summary: {
    active: number;
    idle: number;
    offline: number;
    unknown: number;
    total: number;
  };
}

export function ActivitySummaryBar({ summary }: ActivitySummaryProps) {
  if (summary.total === 0) return null;

  return (
    <div className="flex items-center gap-3 text-xs">
      {summary.active > 0 && (
        <div className="flex items-center gap-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-emerald-600 font-semibold">{summary.active} Active</span>
        </div>
      )}
      {summary.idle > 0 && (
        <div className="flex items-center gap-1">
          <span className="inline-flex rounded-full h-2 w-2 bg-amber-400" />
          <span className="text-amber-600 font-medium">{summary.idle} Idle</span>
        </div>
      )}
      {summary.offline > 0 && (
        <div className="flex items-center gap-1">
          <span className="inline-flex rounded-full h-2 w-2 bg-gray-300" />
          <span className="text-gray-400 font-medium">{summary.offline} Offline</span>
        </div>
      )}
      {summary.unknown > 0 && summary.active === 0 && summary.idle === 0 && summary.offline === 0 && (
        <div className="flex items-center gap-1">
          <span className="inline-flex rounded-full h-2 w-2 bg-blue-300" />
          <span className="text-blue-400 font-medium">Detecting activity...</span>
        </div>
      )}
    </div>
  );
}
