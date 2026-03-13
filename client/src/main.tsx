import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, httpLink, splitLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60_000,       // Data stays fresh for 2 min — prevents re-fetch on tab switches
      gcTime: 15 * 60_000,         // Keep unused data in cache for 15 min
      refetchOnWindowFocus: false,  // Don't refetch when user tabs back
      refetchOnReconnect: false,    // Don't refetch on network reconnect
      retry: 1,                     // Only retry once on failure
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

// Fetch options shared by all links
const sharedFetchOpts = {
  url: "/api/trpc",
  transformer: superjson,
  fetch(input: RequestInfo | URL, init?: RequestInit) {
    return globalThis.fetch(input, {
      ...(init ?? {}),
      credentials: "include" as RequestCredentials,
    });
  },
};

// Procedures that should NOT be batched — they are fast DB queries that get
// stuck waiting when batched with slow Google Sheets API calls (activity, leads).
const UNBATCHED_PROCEDURES = new Set([
  "delivery.agentRates",
  "dashboardAuth.check",
  "dashboardAuth.login",
  "sheets.list",
  "history.dailyStats",
  "history.batchDetail",
]);

const trpcClient = trpc.createClient({
  links: [
    splitLink({
      condition: (op) => UNBATCHED_PROCEDURES.has(op.path),
      // Fast procedures get their own individual requests
      true: httpLink(sharedFetchOpts),
      // Everything else is batched as before
      false: httpBatchLink(sharedFetchOpts),
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
