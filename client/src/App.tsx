import React, { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import { trpc } from "@/lib/trpc";
import { LogOut, Package, FileSpreadsheet, History as HistoryIcon, Loader2, Crosshair, ShieldAlert, Calculator, ExternalLink, Download, Activity, Truck, ClipboardList, Banknote, Database, Shield, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { DashboardCacheProvider } from "@/contexts/DashboardCacheContext";
import CountryFlag from "@/components/CountryFlag";
import ActiveUsers from "@/components/ActiveUsers";
import { lazy, Suspense, useRef, useEffect } from "react";

// Code-split heavy pages — only loaded when navigated to
const SKUPerformance = lazy(() => import("./pages/SKUPerformance"));
const AssignLeads = lazy(() => import("./pages/AssignLeads"));
const History = lazy(() => import("./pages/History"));
const DecisionMatrix = lazy(() => import("./pages/DecisionMatrix"));
const ExportLeads = lazy(() => import("./pages/ExportLeads"));
const AgentActivity = lazy(() => import("./pages/AgentActivity"));
const DeliveryTracking = lazy(() => import("./pages/DeliveryTracking"));
const OrderCollection = lazy(() => import("./pages/OrderCollection"));
const SubmitLeads = lazy(() => import("./pages/SubmitLeads"));
const SalaryAdmin = lazy(() => import("./pages/SalaryAdmin"));
const MySalary = lazy(() => import("./pages/MySalary"));
const LeadArchive = lazy(() => import("./pages/LeadArchive"));
const SheetProtection = lazy(() => import("./pages/SheetProtection"));
const Suivi = lazy(() => import("./pages/Suivi"));

// Route prefetch map — preload JS chunk on hover so navigation feels instant
const PREFETCH_MAP: Record<string, () => Promise<any>> = {
  sku: () => import("./pages/SKUPerformance"),
  assign: () => import("./pages/AssignLeads"),
  history: () => import("./pages/History"),
  matrix: () => import("./pages/DecisionMatrix"),
  export: () => import("./pages/ExportLeads"),
  activity: () => import("./pages/AgentActivity"),
  delivery: () => import("./pages/DeliveryTracking"),
  orders: () => import("./pages/OrderCollection"),
  salary: () => import("./pages/SalaryAdmin"),
  archive: () => import("./pages/LeadArchive"),
  protection: () => import("./pages/SheetProtection"),
  suivi: () => import("./pages/Suivi"),
};
const prefetchedRoutes = new Set<string>();
function prefetchRoute(route: string) {
  if (prefetchedRoutes.has(route)) return;
  const loader = PREFETCH_MAP[route];
  if (loader) {
    prefetchedRoutes.add(route);
    loader().catch(() => prefetchedRoutes.delete(route));
  }
}

// Fallback spinner for lazy-loaded pages
function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

// Dashboard config per country
export const DASHBOARDS = [
  { slug: "algeria", label: "Algeria", flag: "\u{1F1E9}\u{1F1FF}", accent: "text-blue-600", accentBg: "bg-blue-500" },
  { slug: "viconis", label: "Viconis", flag: "\u{1F48E}", accent: "text-purple-600", accentBg: "bg-purple-500" },
  { slug: "libya", label: "Libya", flag: "\u{1F1F1}\u{1F1FE}", accent: "text-emerald-600", accentBg: "bg-emerald-500" },
  { slug: "tunisia", label: "Tunisia", flag: "\u{1F1F9}\u{1F1F3}", accent: "text-orange-600", accentBg: "bg-orange-500" },
] as const;

export type DashboardSlug = (typeof DASHBOARDS)[number]["slug"];

// Helper: reusable nav tab button
function NavTab({
  active,
  onClick,
  onMouseEnter,
  icon: Icon,
  label,
  shortLabel,
  activeColor = "text-blue-600",
  activeBg = "bg-blue-500",
}: {
  active: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortLabel?: string;
  activeColor?: string;
  activeBg?: string;
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`
        relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap
        ${
          active
            ? `${activeColor} bg-gray-100/80`
            : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
        }
      `}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
      {shortLabel && <span className="sm:hidden">{shortLabel}</span>}
      {active && (
        <motion.div
          layoutId="feature-tab-indicator"
          className={`absolute bottom-0 left-2 right-2 h-0.5 ${activeBg} rounded-full`}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      )}
    </button>
  );
}

// Top Navigation Bar — two-row layout for clean spacing
function TopNav({
  currentPage,
  onLogout,
  username,
  isSuperAdmin,
  dashboardRole,
}: {
  currentPage: DashboardSlug | "sku" | "assign" | "export" | "history" | "matrix" | "activity" | "delivery" | "orders" | "salary" | "archive" | "protection" | "suivi";
  onLogout: () => void;
  username?: string;
  isSuperAdmin: boolean;
  dashboardRole?: string;
}) {
  const isCollector = dashboardRole === 'collector';
  const [, setLocation] = useLocation();

  // Check if current page is a country dashboard
  const isCountryPage = DASHBOARDS.some(d => d.slug === currentPage);

  return (
    <div className="bg-white border-b border-gray-200/80 sticky top-0 z-50 shadow-sm">
      {/* Row 1: Brand + Country tabs + User controls */}
      <div className="container flex items-center justify-between h-11">
        <div className="flex items-center gap-1">
          {/* Brand mark */}
          <div className="flex items-center gap-2 mr-3 pr-3 border-r border-gray-200">
            <div className="h-6 w-6 rounded-md bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <span className="text-[10px] font-bold text-white">CD</span>
            </div>
            <span className="text-xs font-bold text-gray-800 hidden lg:inline">Conf Dashboard</span>
          </div>

          {/* Country tabs — hidden for collectors */}
          {!isCollector && DASHBOARDS.map((dash) => {
            const isActive = dash.slug === currentPage;
            return (
              <button
                key={dash.slug}
                onClick={() => {
                  const target = dash.slug === "algeria" ? "/" : `/${dash.slug}`;
                  setLocation(target);
                }}
                className={`
                  relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap
                  ${
                    isActive
                      ? `${dash.accent} bg-gray-100/80 font-semibold`
                      : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                  }
                `}
              >
                <CountryFlag country={dash.slug} flag={dash.flag} className={dash.slug === 'viconis' ? 'h-4 w-auto' : 'text-sm'} />
                <span className="hidden sm:inline">{dash.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="country-indicator"
                    className={`absolute bottom-0 left-2 right-2 h-0.5 ${dash.accentBg} rounded-full`}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Right side: activity + admin badge + user + logout */}
        <div className="flex items-center gap-2 shrink-0">
          {isSuperAdmin && <ActiveUsers />}
          {isSuperAdmin && (
            <span className="hidden lg:inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 border border-amber-200/60 text-[10px] font-semibold text-amber-700">
              <ShieldAlert className="h-3 w-3" />
              Super Admin
            </span>
          )}
          {username && (
            <span className="text-xs text-gray-500 hidden md:inline">{username}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onLogout}
            className="h-7 text-xs px-2.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 hover:border-red-200 border-gray-200"
          >
            <LogOut className="mr-1 h-3 w-3" />
            Logout
          </Button>
        </div>
      </div>

      {/* Row 2: Feature tabs — full width with proper spacing */}
      <div className="border-t border-gray-100">
        <div className="container flex items-center h-10 gap-0.5 overflow-x-auto scrollbar-hide">
          {/* Operations group */}
          {!isCollector && (
            <NavTab
              active={currentPage === "assign"}
              onClick={() => setLocation("/assign")}
              onMouseEnter={() => prefetchRoute('assign')}
              icon={FileSpreadsheet}
              label="Assign"
              shortLabel="Assign"
              activeColor="text-green-600"
              activeBg="bg-green-500"
            />
          )}
          <NavTab
            active={currentPage === "export"}
            onClick={() => setLocation("/export")}
            onMouseEnter={() => prefetchRoute('export')}
            icon={Download}
            label="Upload"
            shortLabel="Upload"
            activeColor="text-orange-600"
            activeBg="bg-orange-500"
          />
          <NavTab
            active={currentPage === "orders"}
            onClick={() => setLocation("/orders")}
            onMouseEnter={() => prefetchRoute('orders')}
            icon={ClipboardList}
            label="Orders"
            shortLabel="Ord"
            activeColor="text-emerald-600"
            activeBg="bg-emerald-500"
          />
          {!isCollector && (
            <NavTab
              active={currentPage === "delivery"}
              onClick={() => setLocation("/delivery")}
              onMouseEnter={() => prefetchRoute('delivery')}
              icon={Truck}
              label="Delivery"
              shortLabel="Del"
              activeColor="text-indigo-600"
              activeBg="bg-indigo-500"
            />
          )}
          {!isCollector && (
            <NavTab
              active={currentPage === "suivi"}
              onClick={() => setLocation("/suivi")}
              onMouseEnter={() => prefetchRoute('suivi')}
              icon={PhoneCall}
              label="Suivi"
              shortLabel="Suivi"
              activeColor="text-rose-600"
              activeBg="bg-rose-500"
            />
          )}

          {/* Divider */}
          {!isCollector && <div className="h-4 w-px bg-gray-200 mx-1.5" />}

          {/* Analytics group */}
          {!isCollector && (
            <NavTab
              active={currentPage === "sku"}
              onClick={() => setLocation("/sku")}
              onMouseEnter={() => prefetchRoute('sku')}
              icon={Package}
              label="SKU"
              shortLabel="SKU"
              activeColor="text-blue-600"
              activeBg="bg-blue-500"
            />
          )}
          {!isCollector && (
            <NavTab
              active={currentPage === "activity"}
              onClick={() => setLocation("/activity")}
              onMouseEnter={() => prefetchRoute('activity')}
              icon={Activity}
              label="Activity"
              shortLabel="Act"
              activeColor="text-cyan-600"
              activeBg="bg-cyan-500"
            />
          )}
          {isSuperAdmin && (
            <NavTab
              active={currentPage === "matrix"}
              onClick={() => setLocation("/matrix")}
              onMouseEnter={() => prefetchRoute('matrix')}
              icon={Crosshair}
              label="Kill/Keep"
              shortLabel="K/K"
              activeColor="text-red-600"
              activeBg="bg-red-500"
            />
          )}
          {isSuperAdmin && (
            <a
              href="https://scalexcost-5m4dyycz.manus.space"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap text-gray-500 hover:text-gray-900 hover:bg-gray-50"
            >
              <Calculator className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Cost Calc</span>
              <span className="sm:hidden">Cost</span>
              <ExternalLink className="h-2.5 w-2.5 opacity-40" />
            </a>
          )}

          {/* Divider */}
          <div className="h-4 w-px bg-gray-200 mx-1.5" />

          {/* Data group */}
          <NavTab
            active={currentPage === "history"}
            onClick={() => setLocation("/history")}
            onMouseEnter={() => prefetchRoute('history')}
            icon={HistoryIcon}
            label="History"
            shortLabel="Hist"
            activeColor="text-violet-600"
            activeBg="bg-violet-500"
          />
          {!isCollector && (
            <NavTab
              active={currentPage === "archive"}
              onClick={() => setLocation("/archive")}
              onMouseEnter={() => prefetchRoute('archive')}
              icon={Database}
              label="Archive"
              shortLabel="Arch"
              activeColor="text-violet-600"
              activeBg="bg-violet-500"
            />
          )}
          {isSuperAdmin && (
            <NavTab
              active={currentPage === "salary"}
              onClick={() => setLocation("/salary")}
              onMouseEnter={() => prefetchRoute('salary')}
              icon={Banknote}
              label="Salary"
              shortLabel="Sal"
              activeColor="text-emerald-600"
              activeBg="bg-emerald-500"
            />
          )}
          {(isSuperAdmin || dashboardRole === 'user') && (
            <NavTab
              active={currentPage === "protection"}
              onClick={() => setLocation("/protection")}
              onMouseEnter={() => prefetchRoute('protection')}
              icon={Shield}
              label="Protection"
              shortLabel="Prot"
              activeColor="text-amber-600"
              activeBg="bg-amber-500"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function AuthGate() {
  const [forceRefresh, setForceRefresh] = useState(0);
  const [location, setLocation] = useLocation();
  const hasEverAuthed = useRef(false);
  const authCheck = trpc.dashboardAuth.check.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 30 * 60_000,  // Auth stays fresh for 30 min — prevents constant re-checking
    gcTime: 60 * 60_000,     // Keep in cache for 60 min
    refetchOnMount: false,    // Don't refetch when component re-renders
  });
  const logoutMutation = trpc.dashboardAuth.logout.useMutation();

  // Track if we've ever successfully authenticated
  useEffect(() => {
    if (authCheck.data?.authenticated) {
      hasEverAuthed.current = true;
    }
  }, [authCheck.data]);

  // Only show full-screen loading on the very first auth check
  // After that, keep showing the current UI while refetching in background
  if (authCheck.isLoading && !hasEverAuthed.current) {
    return (
      <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center">
        <div className="text-gray-400 flex items-center gap-2">
          <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Loading...
        </div>
      </div>
    );
  }

  if (!authCheck.data?.authenticated && !hasEverAuthed.current) {
    return (
      <Login
        onLoginSuccess={() => {
          authCheck.refetch();
          setForceRefresh((prev) => prev + 1);
        }}
      />
    );
  }

  const handleLogout = async () => {
    hasEverAuthed.current = false;
    await logoutMutation.mutateAsync();
    authCheck.refetch();
  };

  const isSuperAdmin = authCheck.data?.dashboardRole === 'super_admin';
  const dashboardRole = authCheck.data?.dashboardRole;
  const isCollector = dashboardRole === 'collector';
  const isPageManager = dashboardRole === 'page_manager';

  // Page managers see Submit Leads + My Salary
  if (isPageManager) {
    const pmPath = location.replace(/^\//, "").split("/")[0] || "";
    const pmPage = pmPath === "my-salary" ? "my-salary" : "submit";
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-white border-b border-border/40 sticky top-0 z-50">
          <div className="container flex items-center justify-between h-12">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setLocation("/")}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                  pmPage === "submit"
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-gray-50"
                }`}
              >
                Submit Leads
              </button>
              <button
                onClick={() => setLocation("/my-salary")}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  pmPage === "my-salary"
                    ? "text-emerald-600 bg-emerald-50"
                    : "text-muted-foreground hover:text-foreground hover:bg-gray-50"
                }`}
              >
                <Banknote className="h-3.5 w-3.5" />
                My Salary
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{authCheck.data?.username}</span>
              <Button variant="ghost" size="sm" onClick={handleLogout} className="h-7 text-xs">
                <LogOut className="h-3 w-3 mr-1" />
                Logout
              </Button>
            </div>
          </div>
        </div>
        <Switch>
          <Route path="/my-salary">
            <Suspense fallback={<PageLoader />}>
              <MySalary />
            </Suspense>
          </Route>
          <Route>
            <Suspense fallback={<PageLoader />}>
              <SubmitLeads />
            </Suspense>
          </Route>
        </Switch>
      </div>
    );
  }

  // Determine current page from URL
  const pathSegment = location.replace(/^\//, "").split("/")[0] || "";
  const currentPage: DashboardSlug | "sku" | "assign" | "export" | "history" | "matrix" | "activity" | "delivery" | "orders" | "salary" | "archive" | "protection" | "suivi" =
    pathSegment === "sku"
      ? "sku"
      : pathSegment === "assign"
        ? "assign"
        : pathSegment === "export"
          ? "export"
          : pathSegment === "history"
            ? "history"
            : pathSegment === "matrix"
              ? "matrix"
              : pathSegment === "activity"
                ? "activity"
                : pathSegment === "delivery"
                  ? "delivery"
                  : pathSegment === "orders"
                    ? "orders"
                    : pathSegment === "salary"
                      ? "salary"
                      : pathSegment === "archive"
                        ? "archive"
                        : pathSegment === "protection"
                          ? "protection"
                          : pathSegment === "suivi"
                            ? "suivi"
                            : DASHBOARDS.find((d) => d.slug === pathSegment)
                        ? (pathSegment as DashboardSlug)
                        : "algeria";

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav is always visible */}
      <TopNav
        currentPage={currentPage}
        onLogout={handleLogout}
        username={authCheck.data?.username}
        isSuperAdmin={isSuperAdmin}
        dashboardRole={dashboardRole}
      />

      <Switch>
        {/* Collector default route → Orders */}
        <Route path="/">
          {isCollector ? <Redirect to="/orders" /> : <Home country="algeria" key="algeria" />}
        </Route>
        <Route path="/sku">
          {isCollector ? <Redirect to="/orders" /> : (
            <Suspense fallback={<PageLoader />}>
              <SKUPerformance />
            </Suspense>
          )}
        </Route>
        <Route path="/assign">
          {isCollector ? <Redirect to="/orders" /> : (
            <Suspense fallback={<PageLoader />}>
              <AssignLeads />
            </Suspense>
          )}
        </Route>
        <Route path="/export">
          <Suspense fallback={<PageLoader />}>
            <ExportLeads />
          </Suspense>
        </Route>
        <Route path="/activity">
          {isCollector ? <Redirect to="/orders" /> : (
            <Suspense fallback={<PageLoader />}>
              <AgentActivity />
            </Suspense>
          )}
        </Route>
        <Route path="/history">
          <Suspense fallback={<PageLoader />}>
            <History />
          </Suspense>
        </Route>
        <Route path="/matrix">
          {isSuperAdmin ? (
            <Suspense fallback={<PageLoader />}>
              <DecisionMatrix />
            </Suspense>
          ) : (
            <div className="container py-20 text-center">
              <ShieldAlert className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-lg font-bold text-foreground mb-2">Access Restricted</h2>
              <p className="text-sm text-muted-foreground">The Kill/Keep Decision Matrix is only available to super admin users.</p>
            </div>
          )}
        </Route>
        <Route path="/delivery">
          {isCollector ? <Redirect to="/orders" /> : (
            <Suspense fallback={<PageLoader />}>
              <DeliveryTracking />
            </Suspense>
          )}
        </Route>
        <Route path="/orders">
          <Suspense fallback={<PageLoader />}>
            <OrderCollection />
          </Suspense>
        </Route>
        <Route path="/archive">
          {isCollector ? <Redirect to="/orders" /> : (
            <Suspense fallback={<PageLoader />}>
              <LeadArchive />
            </Suspense>
          )}
        </Route>
        <Route path="/salary">
          {isSuperAdmin ? (
            <Suspense fallback={<PageLoader />}>
              <SalaryAdmin />
            </Suspense>
          ) : (
            <div className="container py-20 text-center">
              <ShieldAlert className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-lg font-bold text-foreground mb-2">Access Restricted</h2>
              <p className="text-sm text-muted-foreground">Salary management is only available to super admin users.</p>
            </div>
          )}
        </Route>
        <Route path="/protection">
          {(isSuperAdmin || dashboardRole === 'user') ? (
            <Suspense fallback={<PageLoader />}>
              <SheetProtection />
            </Suspense>
          ) : (
            <div className="container py-20 text-center">
              <ShieldAlert className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-lg font-bold text-foreground mb-2">Access Restricted</h2>
              <p className="text-sm text-muted-foreground">Sheet protection is only available to admin users.</p>
            </div>
          )}
        </Route>
        <Route path="/suivi">
          {isCollector ? <Redirect to="/orders" /> : (
            <Suspense fallback={<PageLoader />}>
              <Suivi />
            </Suspense>
          )}
        </Route>
        <Route path="/:country">
          {(params) => {
            if (isCollector) return <Redirect to="/orders" />;
            const country = params.country as DashboardSlug;
            const valid = DASHBOARDS.find((d) => d.slug === country);
            if (!valid) return <NotFound />;
            return <Home country={country} key={country} />;
          }}
        </Route>
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster
            theme="light"
            toastOptions={{
              style: {
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                color: "#1f2937",
              },
            }}
          />
          <DashboardCacheProvider>
            <AuthGate />
          </DashboardCacheProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
