/**
 * ActiveUsers — Shows who is currently active on the platform.
 * Displays a compact indicator in the nav bar with a popover showing full details.
 */
import { useState, useRef, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Users, Circle, Clock, WifiOff } from 'lucide-react';

function formatTimeAgo(date: Date | string | null): string {
  if (!date) return 'Never';
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = Date.now();
  const diff = now - d.getTime();
  
  if (diff < 60_000) return 'Just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  if (diff < 604800_000) return `${Math.floor(diff / 86400_000)}d ago`;
  return d.toLocaleDateString();
}

const STATUS_CONFIG = {
  online: { color: 'bg-green-500', ring: 'ring-green-200', text: 'text-green-700', label: 'Online', icon: Circle },
  away: { color: 'bg-amber-400', ring: 'ring-amber-200', text: 'text-amber-700', label: 'Away', icon: Clock },
  offline: { color: 'bg-gray-300', ring: 'ring-gray-200', text: 'text-gray-500', label: 'Offline', icon: WifiOff },
} as const;

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  user: 'User',
  collector: 'Collector',
  page_manager: 'Page Manager',
};

export default function ActiveUsers() {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const { data: users, isLoading } = trpc.userActivity.list.useQuery(undefined, {
    refetchInterval: 30_000, // Refresh every 30s
    staleTime: 15_000,
  });

  // Close popover on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const onlineCount = users?.filter(u => u.status === 'online').length ?? 0;
  const awayCount = users?.filter(u => u.status === 'away').length ?? 0;

  return (
    <div className="relative" ref={popoverRef}>
      {/* Compact trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-all hover:bg-gray-100 border border-transparent hover:border-gray-200"
        title={`${onlineCount} online, ${awayCount} away`}
      >
        <div className="relative">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          {onlineCount > 0 && (
            <span className="absolute -top-1 -right-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-green-500 text-[7px] font-bold text-white ring-1 ring-white">
              {onlineCount}
            </span>
          )}
        </div>
        <span className="hidden sm:inline text-muted-foreground">
          {isLoading ? '...' : `${onlineCount} online`}
        </span>
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-border/60 bg-white shadow-lg z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border/40 bg-gray-50/50">
            <h3 className="text-xs font-bold text-foreground">Team Activity</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {onlineCount} online · {awayCount} away · {(users?.length ?? 0) - onlineCount - awayCount} offline
            </p>
          </div>

          {/* User list */}
          <div className="max-h-80 overflow-y-auto divide-y divide-border/30">
            {isLoading ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">Loading...</div>
            ) : !users?.length ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">No users found</div>
            ) : (
              // Sort: online first, then away, then offline
              [...users]
                .sort((a, b) => {
                  const order = { online: 0, away: 1, offline: 2 };
                  return order[a.status] - order[b.status];
                })
                .map(user => {
                  const config = STATUS_CONFIG[user.status];
                  return (
                    <div key={user.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/50 transition-colors">
                      {/* Avatar with status dot */}
                      <div className="relative flex-shrink-0">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-xs font-bold text-primary">
                            {user.username.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ${config.color} ring-2 ring-white`} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-foreground truncate">{user.username}</span>
                          <span className={`text-[9px] font-medium ${config.text} px-1.5 py-0.5 rounded-full bg-opacity-10`} style={{ backgroundColor: `${config.color === 'bg-green-500' ? 'rgb(34 197 94 / 0.1)' : config.color === 'bg-amber-400' ? 'rgb(251 191 36 / 0.1)' : 'rgb(209 213 219 / 0.2)'}` }}>
                            {config.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">
                            {ROLE_LABELS[user.dashboardRole] || user.dashboardRole}
                          </span>
                          <span className="text-[10px] text-muted-foreground/50">·</span>
                          <span className="text-[10px] text-muted-foreground">
                            {user.status === 'online' ? 'Active now' : formatTimeAgo(user.lastActiveAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
