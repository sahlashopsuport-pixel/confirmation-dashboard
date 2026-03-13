/**
 * Agent Activity Tracker
 * 
 * Shows real-time agent activity from Google Drive Activity API.
 * Displays: who's active now, daily shift times, breaks, productivity.
 * No fixed shift times (Ramadan schedule).
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CountryFlag from '@/components/CountryFlag';
import {
  Activity,
  Clock,
  Coffee,
  TrendingUp,
  Users,
  ChevronDown,
  ChevronUp,
  Mail,
  AlertTriangle,
  RefreshCw,
  BarChart3,
  Eye,
  Calendar,
  Zap,
  Timer,
  Play,
  Pause,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { DASHBOARDS, type DashboardSlug } from '@/App';

// ---- Types ----

interface AgentDailyActivity {
  email: string;
  displayName: string;
  peopleId: string;
  date: string;
  shiftStart: string;
  shiftEnd: string;
  totalSpanHours: number;
  activeHours: number;
  idleHours: number;
  totalEdits: number;
  editsPerActiveHour: number;
  breaks: Array<{ start: string; end: string; durationMin: number }>;
  hourlyEdits: Record<number, number>;
}

// ---- Helpers ----

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function isToday(dateStr: string): boolean {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return dateStr === todayStr;
}

function isActiveNow(shiftEnd: string): boolean {
  const endTime = new Date(shiftEnd).getTime();
  const now = Date.now();
  return (now - endTime) < 15 * 60 * 1000; // Active if last edit within 15 min
}

function getProductivityColor(editsPerHour: number): string {
  if (editsPerHour >= 20) return 'text-emerald-600';
  if (editsPerHour >= 15) return 'text-blue-600';
  if (editsPerHour >= 10) return 'text-amber-600';
  return 'text-red-500';
}

function getProductivityBg(editsPerHour: number): string {
  if (editsPerHour >= 20) return 'bg-emerald-50 border-emerald-200';
  if (editsPerHour >= 15) return 'bg-blue-50 border-blue-200';
  if (editsPerHour >= 10) return 'bg-amber-50 border-amber-200';
  return 'bg-red-50 border-red-200';
}

function getInitials(email: string, displayName: string): string {
  if (displayName && displayName !== email && displayName !== 'Unknown') {
    // Use first letter(s) of the display name (sheet name)
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return displayName.slice(0, 2).toUpperCase();
  }
  return email.split('@')[0].slice(0, 2).toUpperCase();
}

function getAvatarColor(email: string): string {
  const colors = [
    'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
    'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500',
    'bg-orange-500', 'bg-pink-500',
  ];
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// ---- Hourly Activity Bar Chart ----

function HourlyChart({ hourlyEdits }: { hourlyEdits: Record<number, number> }) {
  const maxEdits = Math.max(...Object.values(hourlyEdits), 1);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  
  return (
    <div className="flex items-end gap-px h-12">
      {hours.map(hour => {
        const count = hourlyEdits[hour] || 0;
        const height = count > 0 ? Math.max((count / maxEdits) * 100, 8) : 0;
        const isWorkHour = count > 0;
        return (
          <div
            key={hour}
            className="flex-1 relative group"
            title={`${hour}:00 — ${count} edits`}
          >
            <div
              className={`w-full rounded-t-sm transition-all ${
                isWorkHour ? 'bg-blue-400 hover:bg-blue-500' : 'bg-gray-100'
              }`}
              style={{ height: `${height}%`, minHeight: isWorkHour ? '3px' : '1px' }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ---- Work/Break Timeline ----

interface TimelineSegment {
  type: 'work' | 'break';
  start: string; // ISO
  end: string;   // ISO
  durationMin: number;
}

function buildTimeline(
  shiftStart: string,
  shiftEnd: string,
  breaks: Array<{ start: string; end: string; durationMin: number }>
): TimelineSegment[] {
  if (breaks.length === 0) {
    const durationMin = Math.round((new Date(shiftEnd).getTime() - new Date(shiftStart).getTime()) / 60000);
    return [{ type: 'work', start: shiftStart, end: shiftEnd, durationMin }];
  }

  const segments: TimelineSegment[] = [];
  const sortedBreaks = [...breaks].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  let cursor = shiftStart;
  for (const brk of sortedBreaks) {
    // Work segment before this break
    const workStart = cursor;
    const workEnd = brk.start;
    const workDur = Math.round((new Date(workEnd).getTime() - new Date(workStart).getTime()) / 60000);
    if (workDur > 0) {
      segments.push({ type: 'work', start: workStart, end: workEnd, durationMin: workDur });
    }
    // Break segment
    segments.push({ type: 'break', start: brk.start, end: brk.end, durationMin: brk.durationMin });
    cursor = brk.end;
  }

  // Final work segment after last break
  const finalDur = Math.round((new Date(shiftEnd).getTime() - new Date(cursor).getTime()) / 60000);
  if (finalDur > 0) {
    segments.push({ type: 'work', start: cursor, end: shiftEnd, durationMin: finalDur });
  }

  return segments;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function WorkBreakTimeline({ activity }: { activity: AgentDailyActivity }) {
  const segments = buildTimeline(activity.shiftStart, activity.shiftEnd, activity.breaks);
  const totalMs = new Date(activity.shiftEnd).getTime() - new Date(activity.shiftStart).getTime();
  const totalWorkMin = segments.filter(s => s.type === 'work').reduce((sum, s) => sum + s.durationMin, 0);
  const totalBreakMin = segments.filter(s => s.type === 'break').reduce((sum, s) => sum + s.durationMin, 0);

  return (
    <div className="space-y-3">
      {/* Summary line */}
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
          <span className="text-muted-foreground">Worked:</span>
          <span className="font-semibold text-emerald-700">{formatDuration(totalWorkMin)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm bg-amber-400" />
          <span className="text-muted-foreground">Breaks:</span>
          <span className="font-semibold text-amber-700">{formatDuration(totalBreakMin)}</span>
        </div>
        <span className="text-muted-foreground ml-auto">
          {formatTime(activity.shiftStart)} → {formatTime(activity.shiftEnd)}
        </span>
      </div>

      {/* Visual bar */}
      <div className="flex h-6 rounded-lg overflow-hidden border border-border/50">
        {segments.map((seg, i) => {
          const segMs = seg.durationMin * 60000;
          const widthPct = totalMs > 0 ? Math.max((segMs / totalMs) * 100, 1.5) : 0;
          return (
            <div
              key={i}
              className={`relative group flex items-center justify-center transition-opacity hover:opacity-90 ${
                seg.type === 'work'
                  ? 'bg-emerald-400'
                  : 'bg-amber-300'
              }`}
              style={{ width: `${widthPct}%` }}
              title={`${seg.type === 'work' ? 'Worked' : 'Break'}: ${formatTime(seg.start)} → ${formatTime(seg.end)} (${formatDuration(seg.durationMin)})`}
            >
              {widthPct > 8 && (
                <span className={`text-[9px] font-semibold ${
                  seg.type === 'work' ? 'text-emerald-900' : 'text-amber-900'
                }`}>
                  {formatDuration(seg.durationMin)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Detailed list */}
      <div className="space-y-1.5">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            {seg.type === 'work' ? (
              <div className="flex items-center justify-center h-5 w-5 rounded-full bg-emerald-100">
                <Play className="h-2.5 w-2.5 text-emerald-600 ml-0.5" />
              </div>
            ) : (
              <div className="flex items-center justify-center h-5 w-5 rounded-full bg-amber-100">
                <Pause className="h-2.5 w-2.5 text-amber-600" />
              </div>
            )}
            <span className={`font-medium ${
              seg.type === 'work' ? 'text-emerald-700' : 'text-amber-700'
            }`}>
              {seg.type === 'work' ? 'Worked' : 'Break'}
            </span>
            <span className="text-muted-foreground font-mono">
              {formatTime(seg.start)} → {formatTime(seg.end)}
            </span>
            <span className={`font-semibold ml-auto ${
              seg.type === 'work' ? 'text-emerald-600' : seg.durationMin >= 30 ? 'text-amber-600' : 'text-muted-foreground'
            }`}>
              {formatDuration(seg.durationMin)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Agent Card ----

function AgentCard({ activity, isExpanded, onToggle }: {
  activity: AgentDailyActivity;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const active = isToday(activity.date) && isActiveNow(activity.shiftEnd);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border bg-card overflow-hidden transition-shadow ${
        active ? 'border-emerald-300 shadow-md shadow-emerald-100' : 'border-border/50 shadow-sm'
      }`}
    >
      {/* Card Header */}
      <button
        onClick={onToggle}
        className="w-full text-left p-4 hover:bg-accent/30 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className={`h-10 w-10 rounded-full ${getAvatarColor(activity.email)} flex items-center justify-center relative`}>
              <span className="text-xs font-bold text-white">
                {getInitials(activity.email, activity.displayName)}
              </span>
              {active && (
                <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-white">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                </div>
              )}
            </div>
            
            {/* Name & Email */}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {activity.displayName !== 'Unknown' && activity.displayName !== activity.email
                    ? activity.displayName
                    : activity.email.split('@')[0]}
                </span>
                {active && (
                  <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                    ACTIVE
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {activity.displayName !== 'Unknown' && activity.displayName !== activity.email
                  ? activity.email
                  : ''}
              </span>
            </div>
          </div>
          
          {/* Quick Stats */}
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-xs text-muted-foreground">Shift</div>
              <div className="text-sm font-mono font-medium text-foreground">
                {formatTime(activity.shiftStart)} → {formatTime(activity.shiftEnd)}
              </div>
            </div>
            <div className="text-right hidden md:block">
              <div className="text-xs text-muted-foreground">Active</div>
              <div className="text-sm font-mono font-medium text-foreground">
                {activity.activeHours}h
              </div>
            </div>
            <div className="text-right hidden md:block">
              <div className="text-xs text-muted-foreground">Edits</div>
              <div className="text-sm font-mono font-medium text-foreground">
                {activity.totalEdits}
              </div>
            </div>
            <div className={`text-right hidden lg:block px-2 py-1 rounded-lg border ${getProductivityBg(activity.editsPerActiveHour)}`}>
              <div className="text-[10px] text-muted-foreground">Edits/hr</div>
              <div className={`text-sm font-mono font-bold ${getProductivityColor(activity.editsPerActiveHour)}`}>
                {activity.editsPerActiveHour}
              </div>
            </div>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </button>
      
      {/* Expanded Detail */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-4">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-blue-600 mb-1">
                    <Clock className="h-3 w-3" />
                    Total Span
                  </div>
                  <div className="text-lg font-mono font-bold text-blue-700">
                    {activity.totalSpanHours}h
                  </div>
                </div>
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 mb-1">
                    <Zap className="h-3 w-3" />
                    Active Time
                  </div>
                  <div className="text-lg font-mono font-bold text-emerald-700">
                    {activity.activeHours}h
                  </div>
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 mb-1">
                    <Coffee className="h-3 w-3" />
                    Idle Time
                  </div>
                  <div className="text-lg font-mono font-bold text-amber-700">
                    {activity.idleHours}h
                  </div>
                </div>
                <div className={`rounded-lg border p-3 ${getProductivityBg(activity.editsPerActiveHour)}`}>
                  <div className={`flex items-center gap-1.5 text-xs ${getProductivityColor(activity.editsPerActiveHour)} mb-1`}>
                    <TrendingUp className="h-3 w-3" />
                    Edits/Hour
                  </div>
                  <div className={`text-lg font-mono font-bold ${getProductivityColor(activity.editsPerActiveHour)}`}>
                    {activity.editsPerActiveHour}
                  </div>
                </div>
              </div>
              
              {/* Hourly Activity Chart */}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">Hourly Activity (24h)</div>
                <HourlyChart hourlyEdits={activity.hourlyEdits} />
                <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
                  <span>0:00</span>
                  <span>6:00</span>
                  <span>12:00</span>
                  <span>18:00</span>
                  <span>23:00</span>
                </div>
              </div>
              
              {/* Work/Break Timeline */}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Work / Break Timeline
                </div>
                <WorkBreakTimeline activity={activity} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ---- Summary Stats ----

function SummaryStats({ agents, date }: { agents: AgentDailyActivity[]; date: string }) {
  const dayAgents = agents.filter(a => a.date === date);
  const activeNow = dayAgents.filter(a => isToday(a.date) && isActiveNow(a.shiftEnd)).length;
  const totalEdits = dayAgents.reduce((s, a) => s + a.totalEdits, 0);
  const avgActiveHours = dayAgents.length > 0
    ? (dayAgents.reduce((s, a) => s + a.activeHours, 0) / dayAgents.length).toFixed(1)
    : '0';
  const avgEditsPerHour = dayAgents.length > 0
    ? (dayAgents.reduce((s, a) => s + a.editsPerActiveHour, 0) / dayAgents.length).toFixed(1)
    : '0';
  const totalBreakMin = dayAgents.reduce((s, a) => s + a.breaks.reduce((bs, b) => bs + b.durationMin, 0), 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {isToday(date) && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 mb-1">
            <Activity className="h-3 w-3" />
            Active Now
          </div>
          <div className="text-2xl font-mono font-bold text-emerald-700">{activeNow}</div>
        </div>
      )}
      <div className="rounded-xl bg-blue-50 border border-blue-200 p-3">
        <div className="flex items-center gap-1.5 text-xs text-blue-600 mb-1">
          <Users className="h-3 w-3" />
          Agents
        </div>
        <div className="text-2xl font-mono font-bold text-blue-700">{dayAgents.length}</div>
      </div>
      <div className="rounded-xl bg-violet-50 border border-violet-200 p-3">
        <div className="flex items-center gap-1.5 text-xs text-violet-600 mb-1">
          <BarChart3 className="h-3 w-3" />
          Total Edits
        </div>
        <div className="text-2xl font-mono font-bold text-violet-700">{totalEdits.toLocaleString()}</div>
      </div>
      <div className="rounded-xl bg-cyan-50 border border-cyan-200 p-3">
        <div className="flex items-center gap-1.5 text-xs text-cyan-600 mb-1">
          <Timer className="h-3 w-3" />
          Avg Active
        </div>
        <div className="text-2xl font-mono font-bold text-cyan-700">{avgActiveHours}h</div>
      </div>
      <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-3">
        <div className="flex items-center gap-1.5 text-xs text-indigo-600 mb-1">
          <TrendingUp className="h-3 w-3" />
          Avg Edits/hr
        </div>
        <div className="text-2xl font-mono font-bold text-indigo-700">{avgEditsPerHour}</div>
      </div>
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
        <div className="flex items-center gap-1.5 text-xs text-amber-600 mb-1">
          <Coffee className="h-3 w-3" />
          Total Break
        </div>
        <div className="text-2xl font-mono font-bold text-amber-700">{totalBreakMin}m</div>
      </div>
    </div>
  );
}

// ---- Main Component ----

export default function AgentActivity() {
  const [selectedCountry, setSelectedCountry] = useState<DashboardSlug>('libya');

  const { data, isLoading, error, refetch, isFetching } = trpc.activity.fetch.useQuery(
    { country: selectedCountry },
    {
      refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
      staleTime: 60 * 1000, // 1 min stale time — allows quick tab switches to refetch
    }
  );

  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'edits' | 'active' | 'productivity'>('edits');

  // Get unique dates from the data
  const dates = useMemo(() => {
    if (!data?.agents) return [];
    const dateSet = new Set<string>();
    for (const agent of data.agents) {
      dateSet.add(agent.date);
    }
    return Array.from(dateSet).sort((a, b) => b.localeCompare(a));
  }, [data?.agents]);

  // Default to today or most recent date
  const activeDate = selectedDate || (dates.length > 0 ? dates[0] : '');

  // Filter and sort agents for the selected date
  const filteredAgents = useMemo(() => {
    if (!data?.agents) return [];
    let agents = data.agents.filter(a => a.date === activeDate);
    
    // Filter out service accounts (contain "iam.gserviceaccount.com")
    agents = agents.filter(a => !a.email.includes('iam.gserviceaccount.com'));
    
    switch (sortBy) {
      case 'edits':
        return agents.sort((a, b) => b.totalEdits - a.totalEdits);
      case 'active':
        return agents.sort((a, b) => b.activeHours - a.activeHours);
      case 'productivity':
        return agents.sort((a, b) => b.editsPerActiveHour - a.editsPerActiveHour);
      default:
        return agents;
    }
  }, [data?.agents, activeDate, sortBy]);

  // Loading state
  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center py-20">
          <div className="text-center space-y-4">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
            <div>
              <p className="text-sm font-medium text-foreground">Loading Activity Data</p>
              <p className="text-xs text-muted-foreground mt-1">Scanning all connected sheets...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center py-20">
          <div className="text-center space-y-4">
            <AlertTriangle className="h-8 w-8 text-red-500 mx-auto" />
            <div>
              <p className="text-sm font-medium text-foreground">Failed to Load Activity</p>
              <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-1.5 h-3 w-3" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-6 space-y-5">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500" />
            Agent Activity Tracker
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time activity from Google Sheets · Auto-refreshes every 5 min
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-8 text-xs"
        >
          <RefreshCw className={`mr-1.5 h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Country Tabs */}
      <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-1 w-fit">
        {DASHBOARDS.map((dash) => (
          <button
            key={dash.slug}
            onClick={() => {
              setSelectedCountry(dash.slug as DashboardSlug);
              setSelectedDate(null);
              setExpandedAgent(null);
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
              selectedCountry === dash.slug
                ? 'bg-white text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <CountryFlag country={dash.slug} flag={dash.flag} className={dash.slug === 'viconis' ? 'h-3.5 w-auto' : undefined} />
            <span>{dash.label}</span>
          </button>
        ))}
      </div>

      {/* Date Selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
        {dates.map(date => (
          <button
            key={date}
            onClick={() => setSelectedDate(date)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              date === activeDate
                ? 'bg-blue-500 text-white shadow-sm'
                : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
            }`}
          >
            {isToday(date) ? 'Today' : formatDate(date)}
          </button>
        ))}
      </div>

      {/* Summary Stats */}
      {activeDate && <SummaryStats agents={data?.agents || []} date={activeDate} />}

      {/* Sort Controls */}
      <div className="flex items-center gap-2">
        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Sort by:</span>
        {(['edits', 'active', 'productivity'] as const).map(s => (
          <button
            key={s}
            onClick={() => setSortBy(s)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              sortBy === s
                ? 'bg-foreground text-background'
                : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
            }`}
          >
            {s === 'edits' ? 'Total Edits' : s === 'active' ? 'Active Hours' : 'Edits/Hour'}
          </button>
        ))}
        <span className="text-xs text-muted-foreground ml-auto">
          {filteredAgents.length} agent{filteredAgents.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Unmapped People Warning */}
      {data?.unmapped && data.unmapped.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-amber-700">
              {data.unmapped.length} unidentified user{data.unmapped.length !== 1 ? 's' : ''} detected
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Some Google accounts couldn't be matched to email addresses. Their activity is shown with people IDs instead.
            </p>
          </div>
        </div>
      )}

      {/* Agent Cards */}
      {filteredAgents.length === 0 ? (
        <div className="text-center py-16">
          <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No activity found for this date</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAgents.map((agent) => (
            <AgentCard
              key={`${agent.peopleId}-${agent.date}`}
              activity={agent}
              isExpanded={expandedAgent === `${agent.peopleId}-${agent.date}`}
              onToggle={() =>
                setExpandedAgent(
                  expandedAgent === `${agent.peopleId}-${agent.date}`
                    ? null
                    : `${agent.peopleId}-${agent.date}`
                )
              }
            />
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="pt-4 pb-8 text-center">
        <p className="text-xs text-muted-foreground/50">
          Data sourced from Google Drive Activity API · {dates.length} day{dates.length !== 1 ? 's' : ''} of history
        </p>
      </div>
    </div>
  );
}
