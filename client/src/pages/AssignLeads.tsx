/**
 * Assign Leads Page — Multi-Agent Split
 *
 * Flow: Select Country → Select Week → Paste leads → Select agents + lead counts → Confirm → Done
 * Safeguards: hard cap, remaining warning, confirmation, per-agent results, duplicate detection
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { stratifiedShuffle, groupLeadsByType } from "@shared/stratifiedShuffle";
import CountryFlag from '@/components/CountryFlag';
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { DASHBOARDS, type DashboardSlug } from "@/App";
import {
  ClipboardPaste,
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Users,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  Phone,
  MapPin,
  Package,
  Calendar as CalendarIcon,
  CalendarDays,
  DollarSign,
  Hash,
  Eye,
  RotateCcw,
  SplitSquareHorizontal,
  AlertTriangle,
  XCircle,
  Minus,
  Plus,
  Copy,
  ChevronDown,
  ChevronUp,
  Table,
  Trash2,
  Shuffle,
  Layers,
  AlertOctagon,
  Volume2,
  Filter,
  ShieldAlert,
  Inbox,
  Download,
} from "lucide-react";
import { format, parse, addDays, isToday, isTomorrow } from "date-fns";

interface ParsedLead {
  date: string;
  customerName: string;
  phone: string;
  wilaya: string;
  product: string;
  price: number | string;
  sku: string;
  address2?: string;
  orderType?: string;
  batchType?: "normal" | "abandon" | "tiktok" | "pages";
}

interface AgentAssignment {
  agentId: number;
  agentName: string;
  sheetUrl: string;
  leadCount: number;
}

type Step = "country" | "week" | "paste" | "preview" | "assign" | "confirm" | "done";

// Hash leads for duplicate detection
function hashLeads(leads: ParsedLead[]): string {
  return leads
    .map((l) => `${l.phone}|${l.customerName}|${l.price}`)
    .sort()
    .join("||");
}

export default function AssignLeads() {
  const trpcUtils = trpc.useUtils();
  const [step, setStep] = useState<Step>("country");
  const [selectedCountry, setSelectedCountry] = useState<DashboardSlug | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<string>("");
  const [availableTabs, setAvailableTabs] = useState<string[]>([]);
  const [rawText, setRawText] = useState("");
  const [leads, setLeads] = useState<ParsedLead[]>([]);

  // Multi-batch paste state (Algeria/Viconis only)
  type BatchType = "normal" | "abandon" | "tiktok" | "pages";
  const [activeBatchTab, setActiveBatchTab] = useState<BatchType>("normal");
  const [batchTexts, setBatchTexts] = useState<Record<BatchType, string>>({
    normal: "",
    abandon: "",
    tiktok: "",
    pages: "",
  });
  const [batchLeads, setBatchLeads] = useState<Record<BatchType, ParsedLead[]>>({
    normal: [],
    abandon: [],
    tiktok: [],
    pages: [],
  });
  const [batchParsed, setBatchParsed] = useState<Record<BatchType, boolean>>({
    normal: false,
    abandon: false,
    tiktok: false,
    pages: false,
  });
  // Whether to use stratified shuffle (multi-batch mode)
  // Now includes Libya for Pages Orders support
  const useMultiBatch = selectedCountry === "algeria" || selectedCountry === "viconis" || selectedCountry === "libya";
  const [assignments, setAssignments] = useState<AgentAssignment[]>([]);
  const [lastAssignedHash, setLastAssignedHash] = useState<string>("");
  const [splitResult, setSplitResult] = useState<{
    results: { agentName: string; sheetTab: string; rowsAppended: number }[];
    errors: { agentName: string; error: string; failedLeadIndices: number[] }[];
    totalAssigned: number;
  } | null>(null);
  const [expandedErrors, setExpandedErrors] = useState<Record<number, boolean>>({});
  const [duplicatesRemoved, setDuplicatesRemoved] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);

  // Work Date: defaults to today, auto-suggests tomorrow after 8 PM
  const [workDate, setWorkDate] = useState(() => {
    const now = new Date();
    // If after 8 PM local time, suggest tomorrow
    if (now.getHours() >= 20) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString().slice(0, 10);
    }
    return now.toISOString().slice(0, 10);
  });

  // ─── Inbox state (Pages leads from app) ───
  const [inboxBatchIds, setInboxBatchIds] = useState<number[]>([]);
  const [loadedFromInbox, setLoadedFromInbox] = useState(false);

  // Query pending inbox count for the Pages tab badge
  const inboxCountQuery = trpc.inbox.pendingCount.useQuery(
    { country: selectedCountry || undefined },
    {
      enabled: !!selectedCountry,
      refetchInterval: 30000,
      retry: false,
    }
  );
  const pendingInboxCount = inboxCountQuery.data ?? 0;

  // Fetch agents filtered by country
  const agentsQuery = trpc.leads.agents.useQuery(
    { country: selectedCountry || undefined },
    {
      enabled: !!selectedCountry,
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60_000,  // Agent list rarely changes
      placeholderData: (prev: any) => prev,
    }
  );

  // Parse mutation
  // Track whether current parse call is for a batch (multi-batch mode)
  const isBatchParseRef = useRef(false);

  const parseMutation = trpc.leads.parse.useMutation({
    onSuccess: (data) => {
      // Skip global onSuccess when parsing a batch — handleParseBatch has its own callback
      if (isBatchParseRef.current) {
        isBatchParseRef.current = false;
        return;
      }
      if (data.count === 0) {
        toast.error("No valid leads found in pasted data");
        return;
      }
      // Duplicate detection
      const newHash = hashLeads(data.leads);
      if (newHash === lastAssignedHash) {
        toast.warning("Warning: This looks like the same batch you just assigned!", {
          duration: 6000,
        });
      }
      setLeads(data.leads);
      setStep("preview");
      toast.success(`Parsed ${data.count} leads`);
    },
    onError: (err) => {
      isBatchParseRef.current = false;
      toast.error(`Parse error: ${err.message}`);
    },
  });

  // Split assign mutation
  const splitAssignMutation = trpc.leads.splitAssign.useMutation({
    onSuccess: async (data) => {
      setSplitResult(data);
      setLastAssignedHash(hashLeads(leads));
      setStep("done");
      // Mark inbox batches as assigned if they were loaded from inbox
      if (loadedFromInbox && inboxBatchIds.length > 0) {
        try {
          await trpcUtils.client.inbox.markAssigned.mutate({ batchIds: inboxBatchIds });
          setInboxBatchIds([]);
          setLoadedFromInbox(false);
          inboxCountQuery.refetch();
        } catch (e) {
          console.error('Failed to mark inbox batches as assigned:', e);
        }
      }
      if (data.errors.length === 0) {
        toast.success(`All ${data.totalAssigned} leads assigned successfully!`);
      } else {
        // Show blocking error modal — Hadjer must acknowledge failures
        setShowErrorModal(true);
      }
    },
    onError: (err) => {
      toast.error(`Assignment failed: ${err.message}`);
      // Also show blocking modal for total failures
      setShowErrorModal(true);
    },
  });

  // Fetch tabs from the first agent with a sheet URL (they all share the same tab structure)
  const firstAgentWithSheet = useMemo(
    () => agentsQuery.data?.find((a) => a.sheetUrl),
    [agentsQuery.data]
  );

  const tabsQuery = trpc.leads.getSheetTabs.useQuery(
    { agentId: firstAgentWithSheet?.id! },
    {
      enabled: !!firstAgentWithSheet && step === "week",
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 5000),
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      placeholderData: (prev: any) => prev,
    }
  );

  useEffect(() => {
    if (tabsQuery.data && tabsQuery.data.length > 0) {
      setAvailableTabs(tabsQuery.data);
    }
  }, [tabsQuery.data]);

  // Computed values
  const totalAssigned = useMemo(
    () => assignments.reduce((sum, a) => sum + a.leadCount, 0),
    [assignments]
  );
  const remaining = leads.length - totalAssigned;

  const agents = agentsQuery.data || [];
  const agentsWithSheet = useMemo(
    () => agents.filter((a) => a.sheetUrl),
    [agents]
  );
  const agentsWithoutSheet = useMemo(
    () => agents.filter((a) => !a.sheetUrl),
    [agents]
  );

  // Untreated leads count per agent
  const agentIdsForUntreated = useMemo(
    () => agentsWithSheet.map((a) => a.id),
    [agentsWithSheet]
  );
  // Build sheetTabs map: all agents use the selected week tab
  const sheetTabsMap = useMemo(() => {
    if (!selectedWeek) return undefined;
    const map: Record<number, string> = {};
    for (const id of agentIdsForUntreated) {
      map[id] = selectedWeek;
    }
    return map;
  }, [agentIdsForUntreated, selectedWeek]);

  const { data: untreatedCounts } = trpc.leads.untreatedCounts.useQuery(
    { agentIds: agentIdsForUntreated, sheetTabs: sheetTabsMap },
    {
      enabled: agentIdsForUntreated.length > 0 && !!selectedWeek && step === "assign",
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      placeholderData: (prev: any) => prev,
    }
  );

  // Filter detection — check which agents have active filters on their sheets
  const { data: filterStatus, isLoading: filterCheckLoading } = trpc.leads.detectFilters.useQuery(
    { agentIds: agentIdsForUntreated },
    {
      enabled: agentIdsForUntreated.length > 0 && (step === "assign" || step === "confirm"),
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      placeholderData: (prev: any) => prev,
    }
  );

  // Count how many selected agents have active filters
  const selectedAgentsWithFilters = useMemo(() => {
    if (!filterStatus) return [];
    return assignments
      .filter((a) => filterStatus[a.agentId] && filterStatus[a.agentId].length > 0)
      .map((a) => ({
        agentId: a.agentId,
        agentName: a.agentName,
        filteredTabs: filterStatus[a.agentId],
      }));
  }, [filterStatus, assignments]);

  // Handlers
  // Duplicate detection — computed from leads
  const duplicateInfo = useMemo(() => {
    const phoneMap = new Map<string, number[]>();
    leads.forEach((lead, idx) => {
      // Normalize phone: strip spaces, dashes, leading zeros/country codes for comparison
      const normalizedPhone = lead.phone.replace(/[\s\-()]/g, '').replace(/^(\+?213|\+?218|\+?216|0)/, '');
      if (!normalizedPhone) return;
      const existing = phoneMap.get(normalizedPhone) || [];
      existing.push(idx);
      phoneMap.set(normalizedPhone, existing);
    });
    const duplicateIndices = new Set<number>();
    const duplicateGroups: { phone: string; indices: number[] }[] = [];
    Array.from(phoneMap.entries()).forEach(([phone, indices]) => {
      if (indices.length > 1) {
        // Mark all but the first as duplicates
        for (let i = 1; i < indices.length; i++) {
          duplicateIndices.add(indices[i]);
        }
        duplicateGroups.push({ phone, indices });
      }
    });
    return { duplicateIndices, duplicateGroups, count: duplicateIndices.size };
  }, [leads]);

  const removeDuplicates = useCallback(() => {
    if (duplicateInfo.count === 0) return;
    const cleaned = leads.filter((_, idx) => !duplicateInfo.duplicateIndices.has(idx));
    setLeads(cleaned);
    setDuplicatesRemoved(true);
    toast.success(`Removed ${duplicateInfo.count} duplicate lead${duplicateInfo.count > 1 ? 's' : ''} (kept first occurrence)`);
  }, [leads, duplicateInfo]);

  // Delete a single lead from the preview list
  const handleDeleteLead = useCallback((index: number) => {
    const lead = leads[index];
    const newLeads = leads.filter((_, i) => i !== index);
    setLeads(newLeads);
    // Also update batchLeads if in multi-batch mode
    if (lead.batchType) {
      setBatchLeads(prev => ({
        ...prev,
        [lead.batchType!]: prev[lead.batchType!].filter(l => l !== lead),
      }));
    }
    toast.success(`Removed lead: ${lead.customerName || lead.phone}`);
  }, [leads]);

  const handleSelectCountry = useCallback((slug: DashboardSlug) => {
    setSelectedCountry(slug);
    setSelectedWeek("");
    setAvailableTabs([]);
    setAssignments([]);
    setDuplicatesRemoved(false);
    setStep("week");
  }, []);

  const handleSelectWeek = useCallback((tab: string) => {
    setSelectedWeek(tab);
    setStep("paste");
  }, []);

  const handleParse = useCallback(() => {
    if (!rawText.trim()) {
      toast.error("Please paste lead data first");
      return;
    }
    setDuplicatesRemoved(false);
    parseMutation.mutate({ rawText, market: selectedCountry || undefined });
  }, [rawText, parseMutation]);

  // Multi-batch: parse a single batch
  const handleParseBatch = useCallback(
    (batchType: BatchType) => {
      const text = batchTexts[batchType];
      if (!text.trim()) {
        toast.error(`No data pasted in ${batchType} tab`);
        return;
      }
      isBatchParseRef.current = true;
      parseMutation.mutate(
        { rawText: text, market: selectedCountry || undefined },
        {
          onSuccess: (data) => {
            if (data.count === 0) {
              toast.error(`No valid leads found in ${batchType} data`);
              return;
            }
            // Tag leads with their batch type
            const taggedLeads = data.leads.map((l: ParsedLead) => ({
              ...l,
              orderType: batchType === "tiktok" ? "TIKTOK" : batchType === "abandon" ? "ABANDON" : batchType === "pages" ? "PAGE" : l.orderType || "NORMAL",
              batchType: batchType,
            }));
            setBatchLeads((prev) => ({ ...prev, [batchType]: taggedLeads }));
            setBatchParsed((prev) => ({ ...prev, [batchType]: true }));
            toast.success(`Parsed ${data.count} ${batchType} leads`);
          },
        }
      );
    },
    [batchTexts, parseMutation, selectedCountry]
  );

  // Load leads from app inbox (Pages tab) — loads raw text directly, no reconstruction
  const handleLoadFromInbox = useCallback(async () => {
    try {
      const batches = await trpcUtils.inbox.pending.fetch({ country: selectedCountry || undefined });
      if (!batches || batches.length === 0) {
        toast.info("No pending leads in inbox");
        return;
      }
      // Concatenate raw text from all pending batches — this is exactly what page managers pasted
      const combinedText = batches.map((b: any) => b.rawText).join('\n');
      setBatchTexts((prev) => ({ ...prev, pages: combinedText }));
      // Track which batch IDs were loaded
      setInboxBatchIds(batches.map((b: any) => b.id));
      setLoadedFromInbox(true);
      const totalLines = batches.reduce((sum: number, b: any) => sum + (b.lineCount || 0), 0);
      toast.success(`Loaded ${totalLines} leads from ${batches.length} inbox batch${batches.length !== 1 ? 'es' : ''}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load inbox leads');
    }
  }, [selectedCountry]);

  // Multi-batch: combine all parsed batches and go to preview
  const handleCombineAndPreview = useCallback(() => {
    const allLeads: ParsedLead[] = [
      ...batchLeads.normal,
      ...batchLeads.abandon,
      ...batchLeads.tiktok,
      ...batchLeads.pages,
    ];
    if (allLeads.length === 0) {
      toast.error("No leads parsed yet. Parse at least one batch.");
      return;
    }
    // Duplicate detection across batches
    const newHash = hashLeads(allLeads);
    if (newHash === lastAssignedHash) {
      toast.warning("Warning: This looks like the same batch you just assigned!", {
        duration: 6000,
      });
    }
    setLeads(allLeads);
    setDuplicatesRemoved(false);
    setStep("preview");
    const parts = [];
    if (batchLeads.normal.length > 0) parts.push(`${batchLeads.normal.length} normal`);
    if (batchLeads.abandon.length > 0) parts.push(`${batchLeads.abandon.length} abandon`);
    if (batchLeads.tiktok.length > 0) parts.push(`${batchLeads.tiktok.length} tiktok`);
    if (batchLeads.pages.length > 0) parts.push(`${batchLeads.pages.length} pages`);
    toast.success(`Combined ${allLeads.length} leads (${parts.join(", ")})`);
  }, [batchLeads, lastAssignedHash]);

  const toggleAgent = useCallback(
    (agent: { id: number; name: string; sheetUrl: string }) => {
      setAssignments((prev) => {
        const exists = prev.find((a) => a.agentId === agent.id);
        if (exists) {
          return prev.filter((a) => a.agentId !== agent.id);
        }
        return [
          ...prev,
          {
            agentId: agent.id,
            agentName: agent.name,
            sheetUrl: agent.sheetUrl,
            leadCount: 0,
          },
        ];
      });
    },
    []
  );

  const updateLeadCount = useCallback(
    (agentId: number, count: number) => {
      setAssignments((prev) => {
        // Calculate what others have
        const othersTotal = prev
          .filter((a) => a.agentId !== agentId)
          .reduce((sum, a) => sum + a.leadCount, 0);
        const maxForThis = leads.length - othersTotal;
        const capped = Math.max(0, Math.min(count, maxForThis));
        return prev.map((a) =>
          a.agentId === agentId ? { ...a, leadCount: capped } : a
        );
      });
    },
    [leads.length]
  );

  const splitEqually = useCallback(() => {
    setAssignments((prev) => {
      if (prev.length === 0) return prev;
      const perAgent = Math.floor(leads.length / prev.length);
      const remainder = leads.length % prev.length;
      return prev.map((a, i) => ({
        ...a,
        leadCount: perAgent + (i < remainder ? 1 : 0),
      }));
    });
  }, [leads.length]);

  const handleConfirmAssign = useCallback(() => {
    if (remaining > 0) {
      toast.error(`${remaining} leads still unassigned. Assign all leads before proceeding.`);
      return;
    }
    if (assignments.every((a) => a.leadCount === 0)) {
      toast.error("No leads assigned to any agent");
      return;
    }
    setStep("confirm");
  }, [remaining, assignments]);

  const handleExecuteAssign = useCallback(() => {
    const activeAssignments = assignments.filter((a) => a.leadCount > 0);

    // Check if we have multi-batch leads to use stratified shuffle
    const hasMultiBatch = useMultiBatch && (
      (batchLeads.normal.length > 0 ? 1 : 0) +
      (batchLeads.abandon.length > 0 ? 1 : 0) +
      (batchLeads.tiktok.length > 0 ? 1 : 0) +
      (batchLeads.pages.length > 0 ? 1 : 0)) > 1;

    let assignmentData;

    if (hasMultiBatch) {
      // Use stratified shuffle for fair distribution
      const leadsByType = groupLeadsByType(leads);
      const agentAllocations = activeAssignments.map((a) => ({
        agentId: a.agentId,
        quantity: a.leadCount,
      }));

      const stratifiedResults = stratifiedShuffle(leadsByType, agentAllocations);

      assignmentData = stratifiedResults.map((sr) => ({
        agentId: sr.agentId,
        sheetTab: selectedWeek,
        leadIndices: sr.leadIndices,
      }));
    } else {
      // Sequential assignment (single batch or non-Algeria/Viconis)
      let currentIndex = 0;
      assignmentData = activeAssignments.map((a) => {
        const indices = Array.from(
          { length: a.leadCount },
          (_, i) => currentIndex + i
        );
        currentIndex += a.leadCount;
        return {
          agentId: a.agentId,
          sheetTab: selectedWeek,
          leadIndices: indices,
        };
      });
    }

    splitAssignMutation.mutate({
      assignments: assignmentData,
      leads,
      market: selectedCountry || undefined,
      workDate,
    });
  }, [assignments, selectedWeek, leads, splitAssignMutation, useMultiBatch, batchLeads, workDate]);

  const handleReset = useCallback(() => {
    setStep("country");
    setSelectedCountry(null);
    setSelectedWeek("");
    setAvailableTabs([]);
    setRawText("");
    setLeads([]);
    setAssignments([]);
    setSplitResult(null);
    setExpandedErrors({});
    // Reset multi-batch state
    setActiveBatchTab("normal");
    setBatchTexts({ normal: "", abandon: "", tiktok: "", pages: "" });
    setBatchLeads({ normal: [], abandon: [], tiktok: [], pages: [] });
    setBatchParsed({ normal: false, abandon: false, tiktok: false, pages: false });
  }, []);

  // Get the actual lead objects for a set of failed indices
  const getFailedLeads = useCallback(
    (indices: number[]): ParsedLead[] => {
      return indices.map((i) => leads[i]).filter(Boolean);
    },
    [leads]
  );

  // Copy failed leads to clipboard as tab-separated text (ready to re-paste)
  const copyFailedLeads = useCallback(
    (indices: number[]) => {
      const failedLeads = getFailedLeads(indices);
      const text = failedLeads
        .map(
          (l) =>
            `${l.customerName}\t${l.phone}\t${l.wilaya}\t${l.product}\t${l.price}\t${l.sku}\t${l.date}`
        )
        .join("\n");
      navigator.clipboard.writeText(text).then(() => {
        toast.success(`${failedLeads.length} failed leads copied to clipboard`);
      });
    },
    [getFailedLeads]
  );

  // Copy ALL failed leads from all errors
  const copyAllFailedLeads = useCallback(() => {
    if (!splitResult) return;
    const allIndices = splitResult.errors.flatMap((e) => e.failedLeadIndices);
    copyFailedLeads(allIndices);
  }, [splitResult, copyFailedLeads]);

  // Retry failed leads: go back to assign step with only the failed leads
  const retryFailedLeads = useCallback(() => {
    if (!splitResult) return;
    const allFailedIndices = splitResult.errors.flatMap((e) => e.failedLeadIndices);
    const failedLeads = getFailedLeads(allFailedIndices);
    if (failedLeads.length === 0) return;
    setLeads(failedLeads);
    setAssignments([]);
    setSplitResult(null);
    setExpandedErrors({});
    setStep("assign");
    toast.info(`${failedLeads.length} failed leads ready to re-assign`);
  }, [splitResult, getFailedLeads]);

  const handleBackToAssign = useCallback(() => {
    setStep("assign");
  }, []);

  // Format phone for display (market-aware)
  const formatPhonePreview = (phone: string): string => {
    let digits = phone.replace(/\D/g, "");
    if (selectedCountry === "libya") {
      if (digits.startsWith("218") && digits.length > 10) {
        digits = digits.slice(3);
      }
      if (!digits.startsWith("0")) {
        digits = "0" + digits;
      }
    } else if (selectedCountry === "tunisia") {
      if (digits.startsWith("216") && digits.length > 8) {
        digits = digits.slice(3);
      }
    } else {
      if (digits.startsWith("213") && digits.length > 10) {
        digits = digits.slice(3);
      }
      if (!digits.startsWith("0")) {
        digits = "0" + digits;
      }
    }
    return digits;
  };

  const countryConfig = DASHBOARDS.find((d) => d.slug === selectedCountry);

  // Step labels for indicator
  const steps: { key: Step; label: string; icon: any }[] = [
    { key: "country", label: "Country", icon: MapPin },
    { key: "week", label: "Week", icon: CalendarIcon },
    { key: "paste", label: "Paste", icon: ClipboardPaste },
    { key: "preview", label: "Preview", icon: Table },
    { key: "assign", label: "Split", icon: SplitSquareHorizontal },
    { key: "confirm", label: "Confirm", icon: Eye },
    { key: "done", label: "Done", icon: CheckCircle2 },
  ];

  const stepOrder = steps.map((s) => s.key);
  const currentStepIndex = stepOrder.indexOf(step);

  return (
    <div className="container py-6 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
          <SplitSquareHorizontal className="h-5 w-5 text-primary" />
          Assign Leads
          {countryConfig && (
            <span className={`text-sm font-normal ${countryConfig.accent} flex items-center gap-1`}>
              <CountryFlag country={countryConfig.slug} flag={countryConfig.flag} className={countryConfig.slug === 'viconis' ? 'h-4 w-auto' : undefined} /> {countryConfig.label}
            </span>
          )}
          {selectedWeek && (
            <span className="text-sm font-normal text-muted-foreground">
              → {selectedWeek}
            </span>
          )}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Select country → week → paste leads → distribute across agents
        </p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-1.5 mb-6 flex-wrap">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const isActive = step === s.key;
          const isPast = currentStepIndex > i;
          return (
            <div key={s.key} className="flex items-center gap-1.5">
              {i > 0 && (
                <ArrowRight
                  className={`h-3 w-3 ${isPast ? "text-primary" : "text-muted-foreground/30"}`}
                />
              )}
              <div
                className={`
                  flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all
                  ${isActive ? "bg-primary text-primary-foreground" : isPast ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}
                `}
              >
                <Icon className="h-3 w-3" />
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* ============ STEP 1: Country ============ */}
      {step === "country" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-sm font-bold text-foreground mb-1">Select Country</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Choose which country's agents will receive these leads
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {DASHBOARDS.map((dash) => (
                <button
                  key={dash.slug}
                  onClick={() => handleSelectCountry(dash.slug)}
                  className={`
                    relative rounded-xl border-2 p-5 text-center transition-all hover:scale-[1.02]
                    border-border hover:border-primary/40 hover:bg-muted/30
                  `}
                >
                  <span className="block mb-2"><CountryFlag country={dash.slug} flag={dash.flag} className={dash.slug === 'viconis' ? 'h-8 w-auto mx-auto' : 'text-3xl'} /></span>
                  <span className="text-sm font-bold text-foreground">{dash.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============ STEP 2: Week ============ */}
      {step === "week" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-sm font-bold text-foreground mb-1">Select Week Tab</h2>
            <p className="text-xs text-muted-foreground mb-4">
              All leads will be assigned to this tab for every agent
            </p>

            {tabsQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading sheet tabs...
              </div>
            ) : availableTabs.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {availableTabs.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => handleSelectWeek(tab)}
                    className={`
                      rounded-xl border-2 p-4 text-center transition-all hover:scale-[1.02]
                      border-border hover:border-primary/40 hover:bg-muted/30
                    `}
                  >
                    <CalendarIcon className="h-5 w-5 mx-auto mb-2 text-primary" />
                    <span className="text-sm font-bold text-foreground">{tab}</span>
                  </button>
                ))}
              </div>
            ) : tabsQuery.isError ? (
              <div className="text-center py-8">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 text-amber-500" />
                <p className="text-sm text-muted-foreground mb-3">
                  Could not load sheet tabs. This is usually a temporary connection issue.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => tabsQuery.refetch()}
                  className="rounded-lg"
                >
                  <RotateCcw className="mr-1.5 h-3 w-3" />
                  Retry
                </Button>
              </div>
            ) : (
              <div className="text-center py-8">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 text-amber-500" />
                <p className="text-sm text-muted-foreground">
                  {!firstAgentWithSheet
                    ? "No agents with sheets found for this country. Add agents first."
                    : "No tabs found. Check if the sheet is shared with the service account."}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => tabsQuery.refetch()}
                  className="rounded-lg mt-3"
                >
                  <RotateCcw className="mr-1.5 h-3 w-3" />
                  Retry
                </Button>
              </div>
            )}

            <div className="mt-4">
              <Button variant="outline" onClick={() => setStep("country")} className="rounded-lg">
                <ArrowLeft className="mr-1.5 h-3 w-3" />
                Back
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============ STEP 3: Paste ============ */}
      {step === "paste" && !useMultiBatch && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <label className="block text-sm font-semibold text-foreground mb-2">
              Paste Lead Data
            </label>
            <p className="text-xs text-muted-foreground mb-3">
              Copy rows from your Shopify export and paste below.
            </p>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={selectedCountry === "tunisia"
                ? `Paste tab-separated lead data here...`
                : `Paste tab-separated lead data here...\nExample: 2025-02-20\tTesticalm Spray\tMohamed Ali\t2130662666692\tAlger\t3500\tTEST-001`
              }
              className="w-full h-48 rounded-lg border border-border bg-background p-3 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder:text-muted-foreground/40"
            />
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep("week")}
                  className="rounded-lg"
                >
                  <ArrowLeft className="mr-1.5 h-3 w-3" />
                  Back
                </Button>
                <span className="text-xs text-muted-foreground">
                  {rawText.trim()
                    ? `${rawText.trim().split("\n").length} lines pasted`
                    : "No data pasted yet"}
                </span>
              </div>
              <Button
                onClick={handleParse}
                disabled={!rawText.trim() || parseMutation.isPending}
                className="rounded-lg"
              >
                {parseMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ClipboardPaste className="mr-2 h-4 w-4" />
                )}
                Parse & Continue
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============ STEP 3: Multi-Batch Paste (Algeria/Viconis/Libya) ============ */}
      {step === "paste" && useMultiBatch && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  Multi-Batch Paste
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Paste each lead type separately. They will be shuffled proportionally across agents for fair distribution.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Shuffle className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-semibold text-primary">Stratified Shuffle</span>
              </div>
            </div>

            {/* Batch tabs */}
            <div className="flex gap-1 mb-4 bg-muted/50 p-1 rounded-lg">
              {(["normal", "abandon", "tiktok", "pages"] as BatchType[]).map((bType) => {
                const isActive = activeBatchTab === bType;
                const count = batchLeads[bType].length;
                const isParsed = batchParsed[bType];
                const labels: Record<BatchType, { label: string; icon: string; color: string }> = {
                  normal: { label: "Normal", icon: "📦", color: "bg-green-100 text-green-700" },
                  abandon: { label: "Abandons", icon: "🔄", color: "bg-amber-100 text-amber-700" },
                  tiktok: { label: "TikTok", icon: "🎵", color: "bg-purple-100 text-purple-700" },
                  pages: { label: "Pages", icon: "📄", color: "bg-blue-100 text-blue-700" },
                };
                const cfg = labels[bType];
                return (
                  <button
                    key={bType}
                    onClick={() => setActiveBatchTab(bType)}
                    className={`
                      flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold transition-all
                      ${isActive ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}
                    `}
                  >
                    <span>{cfg.icon}</span>
                    <span>{cfg.label}</span>
                    {isParsed && count > 0 && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${cfg.color}`}>
                        {count}
                      </span>
                    )}
                    {bType === "pages" && pendingInboxCount > 0 && !isParsed && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-primary/15 text-primary animate-pulse">
                        {pendingInboxCount} new
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Load from Inbox banner (Pages tab only) */}
            {activeBatchTab === "pages" && pendingInboxCount > 0 && (
              <div className="mb-3 flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-2">
                  <Inbox className="h-4 w-4 text-primary" />
                  <div>
                    <span className="text-xs font-semibold text-foreground">
                      {pendingInboxCount} leads waiting in app inbox
                    </span>
                    <p className="text-[10px] text-muted-foreground">Submitted by page managers via the app</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleLoadFromInbox}
                  className="h-7 text-xs"
                >
                  <Download className="mr-1.5 h-3 w-3" />
                  Load from Inbox
                </Button>
              </div>
            )}

            {/* Active batch textarea */}
            <textarea
              value={batchTexts[activeBatchTab]}
              onChange={(e) =>
                setBatchTexts((prev) => ({ ...prev, [activeBatchTab]: e.target.value }))
              }
              placeholder={
                activeBatchTab === "pages"
                  ? `Paste Pages Orders here...\nExample: SM1\ttesticalm\tSM1 client name\t672358110\tWilaya de mila\t2026-02-28`
                  : activeBatchTab === "tiktok"
                  ? `Paste TikTok leads here...\nExample: full name\tphone number\tadress 1\tadress2\tproduct name\tsku\tcode\tcode 2`
                  : activeBatchTab === "abandon"
                  ? `Paste abandon/callback leads here (same format as normal Shopify export)...`
                  : selectedCountry === "viconis"
                  ? `Paste normal Viconis leads here...\nExample: Pack Anti-Chute VICONIS\tMohamed\t2130540943541\t27 - Mostaganem\t3900\tVICONISXFACEBOOK-SKU\t79.127.139.231\t2026-02-21 13:48:09\tNORMAL\t#11268`
                  : selectedCountry === "libya"
                  ? `Paste normal Libya leads here...\nExample: #130652\t2026-01-19T14:05:07Z\tProstate Oil\tAhmed Mohamed\t218912345678\tTripoli\tAin Zara\t150\tPRO-001\tNORMAL`
                  : `Paste normal Shopify leads here...\nExample: 2025-02-20\tTesticalm Spray\tMohamed Ali\t2130662666692\tAlger\t3500\tTEST-001`
              }
              className="w-full h-40 rounded-lg border border-border bg-background p-3 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder:text-muted-foreground/40"
            />

            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {batchTexts[activeBatchTab].trim()
                    ? `${batchTexts[activeBatchTab].trim().split("\n").length} lines`
                    : "No data"}
                </span>
                {batchParsed[activeBatchTab] && batchLeads[activeBatchTab].length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">
                    {batchLeads[activeBatchTab].length} parsed
                  </span>
                )}
              </div>
              <Button
                onClick={() => handleParseBatch(activeBatchTab)}
                disabled={!batchTexts[activeBatchTab].trim() || parseMutation.isPending}
                className="rounded-lg"
                size="sm"
              >
                {parseMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ClipboardPaste className="mr-1.5 h-3.5 w-3.5" />
                )}
                Validate {activeBatchTab === "normal" ? "Normal" : activeBatchTab === "abandon" ? "Abandons" : activeBatchTab === "tiktok" ? "TikTok" : "Pages"}
              </Button>
              {batchParsed[activeBatchTab] && batchLeads[activeBatchTab].length > 0 && (
                <span className="flex items-center gap-1 text-xs font-semibold text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Validated
                </span>
              )}
            </div>
          </div>

          {/* Combined summary */}
          {(batchLeads.normal.length > 0 || batchLeads.abandon.length > 0 || batchLeads.tiktok.length > 0 || batchLeads.pages.length > 0) && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <h3 className="text-xs font-bold text-foreground mb-3 flex items-center gap-2">
                <Shuffle className="h-3.5 w-3.5 text-primary" />
                Batch Summary — Ready to Shuffle
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                {(["normal", "abandon", "tiktok", "pages"] as BatchType[]).map((bType) => {
                  const count = batchLeads[bType].length;
                  const colors: Record<BatchType, string> = {
                    normal: "bg-green-50 border-green-200 text-green-700",
                    abandon: "bg-amber-50 border-amber-200 text-amber-700",
                    tiktok: "bg-purple-50 border-purple-200 text-purple-700",
                    pages: "bg-blue-50 border-blue-200 text-blue-700",
                  };
                  const totalLeads = batchLeads.normal.length + batchLeads.abandon.length + batchLeads.tiktok.length + batchLeads.pages.length;
                  return (
                    <div key={bType} className={`rounded-lg border p-3 text-center ${colors[bType]}`}>
                      <p className="text-lg font-bold font-mono">{count}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wider">
                        {bType === "normal" ? "Normal" : bType === "abandon" ? "Abandons" : bType === "tiktok" ? "TikTok" : "Pages"}
                      </p>
                      {count > 0 && (
                        <p className="text-[10px] mt-1 opacity-70">
                          {((count / Math.max(totalLeads, 1)) * 100).toFixed(0)}% of total
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Total: <span className="font-bold text-foreground">{batchLeads.normal.length + batchLeads.abandon.length + batchLeads.tiktok.length + batchLeads.pages.length}</span> leads
                </p>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => setStep("week")}
              className="rounded-lg"
            >
              <ArrowLeft className="mr-1.5 h-3 w-3" />
              Back
            </Button>
            <Button
              onClick={handleCombineAndPreview}
              disabled={
                (batchLeads.normal.length + batchLeads.abandon.length + batchLeads.tiktok.length + batchLeads.pages.length) === 0
              }
              className="rounded-lg"
              size="lg"
            >
              <Shuffle className="mr-2 h-4 w-4" />
              Shuffle & Continue ({batchLeads.normal.length + batchLeads.abandon.length + batchLeads.tiktok.length + batchLeads.pages.length} leads)
            </Button>
          </div>
        </div>
      )}

      {/* ============ STEP 4: Preview ============ */}
      {step === "preview" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Table className="h-4 w-4 text-primary" />
                Lead Preview
                <span className="text-xs font-normal text-muted-foreground">({leads.length} leads)</span>
              </h2>
              <div className="flex items-center gap-2">
                {selectedCountry === "libya" && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">Libya Format</span>
                )}
                {selectedCountry === "viconis" && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-semibold">Viconis Format</span>
                )}
              </div>
            </div>

            {/* Multi-batch breakdown banner */}
            {useMultiBatch && (batchLeads.normal.length > 0 || batchLeads.abandon.length > 0 || batchLeads.tiktok.length > 0 || batchLeads.pages.length > 0) && (
              <div className="mb-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Shuffle className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-bold text-foreground">Stratified Shuffle Active</span>
                  <span className="text-[10px] text-muted-foreground">— leads will be distributed proportionally by type</span>
                </div>
                <div className="flex items-center gap-3">
                  {batchLeads.normal.length > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">
                      📦 {batchLeads.normal.length} Normal
                    </span>
                  )}
                  {batchLeads.abandon.length > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">
                      🔄 {batchLeads.abandon.length} Abandons
                    </span>
                  )}
                  {batchLeads.tiktok.length > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-bold">
                      🎵 {batchLeads.tiktok.length} TikTok
                    </span>
                  )}
                  {batchLeads.pages.length > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold">
                      📄 {batchLeads.pages.length} Pages
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Duplicate Detection Banner */}
            {duplicateInfo.count > 0 && !duplicatesRemoved ? (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-red-700">
                      {duplicateInfo.count} duplicate{duplicateInfo.count > 1 ? 's' : ''} detected
                    </p>
                    <p className="text-xs text-red-600">
                      {duplicateInfo.duplicateGroups.length} phone number{duplicateInfo.duplicateGroups.length > 1 ? 's' : ''} appear{duplicateInfo.duplicateGroups.length === 1 ? 's' : ''} more than once. Duplicates are highlighted in red below.
                    </p>
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={removeDuplicates}
                  className="rounded-lg flex-shrink-0"
                >
                  <Trash2 className="mr-1.5 h-3 w-3" />
                  Remove Duplicates
                </Button>
              </div>
            ) : duplicatesRemoved ? (
              <div className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                <p className="text-sm font-medium text-green-700">
                  Duplicates removed — {leads.length} unique leads remaining
                </p>
              </div>
            ) : null}
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="max-h-[420px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-muted/80 border-b border-border">
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-8">#</th>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Date</th>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Name</th>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Phone</th>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">{selectedCountry === "libya" ? "City" : "Wilaya"}</th>
                      {selectedCountry === "libya" && (
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Area</th>
                      )}
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Product</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Price</th>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">SKU</th>
                      {(selectedCountry === "libya" || selectedCountry === "viconis") && (
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Type</th>
                      )}
                      {useMultiBatch && (
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Batch</th>
                      )}
                      <th className="px-3 py-2 text-center font-semibold text-muted-foreground w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead, i) => {
                      const isDuplicate = duplicateInfo.duplicateIndices.has(i);
                      return (
                      <tr key={i} className={`border-b border-border/50 transition-colors ${
                        isDuplicate ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-muted/30'
                      }`}>
                        <td className="px-3 py-2 text-muted-foreground font-mono flex items-center gap-1">
                          {i + 1}
                          {isDuplicate && <span className="text-[9px] px-1 py-0.5 rounded bg-red-200 text-red-700 font-bold">DUP</span>}
                        </td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{lead.date}</td>
                        <td className="px-3 py-2 font-medium text-foreground">{lead.customerName}</td>
                        <td className="px-3 py-2 font-mono">{formatPhonePreview(lead.phone)}</td>
                        <td className="px-3 py-2">{lead.wilaya}</td>
                        {selectedCountry === "libya" && (
                          <td className="px-3 py-2 text-muted-foreground">{lead.address2 || "-"}</td>
                        )}
                        <td className="px-3 py-2">{lead.product}</td>
                        <td className="px-3 py-2 text-right font-mono font-medium">{lead.price}</td>
                        <td className="px-3 py-2 text-muted-foreground font-mono text-[10px]">{lead.sku}</td>
                        {(selectedCountry === "libya" || selectedCountry === "viconis") && (
                          <td className="px-3 py-2">
                            {lead.orderType ? (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                                lead.orderType === "NORMAL" || lead.orderType === "normal"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}>
                                {lead.orderType}
                              </span>
                            ) : "-"}
                          </td>
                        )}
                        {useMultiBatch && (
                          <td className="px-3 py-2">
                            {lead.batchType ? (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                                lead.batchType === "normal" ? "bg-green-100 text-green-700"
                                  : lead.batchType === "abandon" ? "bg-amber-100 text-amber-700"
                                  : lead.batchType === "pages" ? "bg-blue-100 text-blue-700"
                                  : "bg-purple-100 text-purple-700"
                              }`}>
                                {lead.batchType === "normal" ? "📦 Normal" : lead.batchType === "abandon" ? "🔄 Abandon" : lead.batchType === "pages" ? "📄 Pages" : "🎵 TikTok"}
                              </span>
                            ) : "-"}
                          </td>
                        )}
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => handleDeleteLead(i)}
                            className="p-1 rounded-md hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-colors"
                            title="Remove this lead"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => setStep("paste")}
              className="rounded-lg"
            >
              <ArrowLeft className="mr-1.5 h-3 w-3" />
              Back to Paste
            </Button>
            <Button
              onClick={() => setStep("assign")}
              className="rounded-lg"
              size="lg"
            >
              Looks Good — Assign
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ============ STEP 5: Split / Assign ============ */}
      {step === "assign" && (
        <div className="space-y-4">
          {/* Lead summary bar */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Hash className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Leads</p>
                    <p className="text-lg font-bold text-foreground font-mono">{leads.length}</p>
                  </div>
                </div>
                <div className="h-8 w-px bg-border" />
                <div className="flex items-center gap-2">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${totalAssigned === leads.length ? "bg-green-100" : "bg-amber-100"}`}>
                    <Users className={`h-4 w-4 ${totalAssigned === leads.length ? "text-green-600" : "text-amber-600"}`} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Assigned</p>
                    <p className={`text-lg font-bold font-mono ${totalAssigned === leads.length ? "text-green-600" : "text-amber-600"}`}>
                      {totalAssigned}
                    </p>
                  </div>
                </div>
                <div className="h-8 w-px bg-border" />
                <div className="flex items-center gap-2">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${remaining === 0 ? "bg-green-100" : "bg-red-100"}`}>
                    {remaining === 0 ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Remaining</p>
                    <p className={`text-lg font-bold font-mono ${remaining === 0 ? "text-green-600" : "text-red-500"}`}>
                      {remaining}
                    </p>
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={splitEqually}
                disabled={assignments.length === 0}
                className="rounded-lg"
              >
                <SplitSquareHorizontal className="mr-1.5 h-3.5 w-3.5" />
                Split Equally
              </Button>
            </div>
          </div>

          {/* Remaining warning */}
          {remaining > 0 && totalAssigned > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
              <p className="text-xs text-red-700 font-medium">
                {remaining} lead{remaining !== 1 ? "s" : ""} still unassigned. All leads must be assigned before you can proceed.
              </p>
            </div>
          )}

          {/* Filter warning banner */}
          {filterStatus && Object.keys(filterStatus).length > 0 && (
            <div className="rounded-xl border-2 border-orange-400 bg-orange-50 p-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                  <ShieldAlert className="h-5 w-5 text-orange-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-orange-800 mb-1 flex items-center gap-2">
                    Active Filters Detected
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-200 text-orange-700 font-bold">
                      {Object.keys(filterStatus).length} agent{Object.keys(filterStatus).length !== 1 ? "s" : ""}
                    </span>
                  </h3>
                  <p className="text-xs text-orange-700 mb-2">
                    These agents have active filters on their Google Sheets. Assigning leads while filters are active may cause leads to be written to hidden rows or wrong positions.
                  </p>
                  <div className="space-y-1">
                    {Object.entries(filterStatus).map(([agentId, tabs]) => {
                      const agent = agents.find((a) => a.id === Number(agentId));
                      return (
                        <div key={agentId} className="flex items-center gap-2 text-xs">
                          <Filter className="h-3 w-3 text-orange-500" />
                          <span className="font-bold text-orange-800">{agent?.name || `Agent #${agentId}`}</span>
                          <span className="text-orange-600">— filters on: {(tabs as string[]).join(", ")}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-orange-600 mt-2 font-semibold">
                    Ask the agent to remove filters before assigning, or the leads may not appear correctly.
                  </p>
                </div>
              </div>
            </div>
          )}
          {filterCheckLoading && (
            <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-3 flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500" />
              <p className="text-xs text-orange-600">Checking agent sheets for active filters...</p>
            </div>
          )}

          {/* Agent selection grid */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Select Agents & Set Lead Counts
              <span className="text-xs font-normal text-muted-foreground ml-auto">
                {assignments.length} selected
              </span>
            </h3>

            {agentsQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading agents...
              </div>
            ) : (
              <div className="space-y-2">
                {agentsWithSheet.map((agent) => {
                  const assignment = assignments.find((a) => a.agentId === agent.id);
                  const isSelected = !!assignment;

                  return (
                    <div
                      key={agent.id}
                      className={`
                        rounded-lg border p-3 transition-all
                        ${isSelected
                          ? "border-primary/40 bg-primary/5"
                          : "border-border hover:border-primary/20 hover:bg-muted/20"
                        }
                      `}
                    >
                      <div className="flex items-center gap-3">
                        {/* Checkbox area */}
                        <button
                          onClick={() => toggleAgent(agent)}
                          className={`
                            h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-all
                            ${isSelected
                              ? "border-primary bg-primary"
                              : "border-muted-foreground/30 hover:border-primary/50"
                            }
                          `}
                        >
                          {isSelected && (
                            <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
                          )}
                        </button>

                        {/* Agent info */}
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div
                            className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                              isSelected
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {agent.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {agent.name}
                            </p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-[10px] text-muted-foreground truncate">
                                {agent.agentCode ? `Code: ${agent.agentCode}` : "No code"}
                              </p>
                              {untreatedCounts && untreatedCounts[agent.id] != null && (
                                <span
                                  className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-mono font-bold ${
                                    untreatedCounts[agent.id].untreated === 0
                                      ? "bg-emerald-100 text-emerald-700"
                                      : untreatedCounts[agent.id].untreated <= 10
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-red-100 text-red-700"
                                  }`}
                                  title={`${untreatedCounts[agent.id].untreated} pending / ${untreatedCounts[agent.id].total} total leads`}
                                >
                                  {untreatedCounts[agent.id].untreated} pending
                                </span>
                              )}
                              {filterStatus && filterStatus[agent.id] && filterStatus[agent.id].length > 0 && (
                                <span
                                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-300 animate-pulse"
                                  title={`Active filters on: ${filterStatus[agent.id].join(", ")}`}
                                >
                                  <Filter className="h-2.5 w-2.5" />
                                  FILTER ACTIVE
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Lead count input */}
                        {isSelected && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() =>
                                updateLeadCount(agent.id, (assignment?.leadCount || 0) - 1)
                              }
                              className="h-7 w-7 rounded-md border border-border hover:bg-muted flex items-center justify-center transition-colors"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <input
                              type="number"
                              min={0}
                              max={leads.length}
                              value={assignment?.leadCount || 0}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                updateLeadCount(agent.id, val);
                              }}
                              className="w-16 h-7 rounded-md border border-border bg-background text-center text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                            />
                            <button
                              onClick={() =>
                                updateLeadCount(agent.id, (assignment?.leadCount || 0) + 1)
                              }
                              className="h-7 w-7 rounded-md border border-border hover:bg-muted flex items-center justify-center transition-colors"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                            <span className="text-[10px] text-muted-foreground w-10 text-right">
                              leads
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Disabled agents (no sheet) */}
                {agentsWithoutSheet.map((agent) => (
                  <div
                    key={agent.id}
                    className="rounded-lg border border-border/50 p-3 opacity-50 cursor-not-allowed"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-5 rounded border-2 border-muted-foreground/20 shrink-0" />
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                          {agent.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-muted-foreground truncate">
                            {agent.name}
                          </p>
                          <p className="text-[10px] text-red-400">No sheet configured</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {agents.length === 0 && (
                  <div className="text-center py-6">
                    <AlertCircle className="h-6 w-6 mx-auto mb-2 text-amber-500" />
                    <p className="text-sm text-muted-foreground">
                      No agents found for {countryConfig?.label}. Add agents in the dashboard first.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => setStep("paste")}
              className="rounded-lg"
            >
              <ArrowLeft className="mr-1.5 h-3 w-3" />
              Back to Paste
            </Button>
            <Button
              onClick={handleConfirmAssign}
              disabled={
                assignments.length === 0 ||
                totalAssigned === 0 ||
                remaining > 0
              }
              className="rounded-lg bg-green-600 hover:bg-green-700 text-white"
              size="lg"
            >
              <Eye className="mr-2 h-4 w-4" />
              Review & Confirm
            </Button>
          </div>
        </div>
      )}

      {/* ============ STEP 5: Confirm ============ */}
      {step === "confirm" && (
        <div className="space-y-4">
          {/* Filter warning on confirm step */}
          {selectedAgentsWithFilters.length > 0 && (
            <div className="rounded-xl border-2 border-red-400 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                  <ShieldAlert className="h-5 w-5 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-red-800 mb-1">
                    WARNING: Assigning to Agents with Active Filters
                  </h3>
                  <p className="text-xs text-red-700 mb-2">
                    The following selected agents have active filters. Leads may be written to hidden rows and appear missing:
                  </p>
                  <div className="space-y-1">
                    {selectedAgentsWithFilters.map((af) => (
                      <div key={af.agentId} className="flex items-center gap-2 text-xs">
                        <Filter className="h-3 w-3 text-red-500" />
                        <span className="font-bold text-red-800">{af.agentName}</span>
                        <span className="text-red-600">&mdash; {af.filteredTabs.join(", ")}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-red-600 mt-2 font-bold uppercase tracking-wide">
                    Proceed only if you are sure the filters will not affect the assignment.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-sm font-bold text-foreground mb-1 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Confirm Assignment
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              Please review carefully before assigning. This will write leads to Google Sheets.
            </p>

            {/* Work Date Picker — Quick Select */}
            <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 mb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <CalendarDays className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <span className="text-sm font-bold text-blue-900">Work Date</span>
                  <p className="text-xs text-blue-600/80">The day agents will work these leads</p>
                </div>
              </div>

              {/* Selected date display */}
              <div className="text-center mb-3">
                <span className="text-lg font-bold text-blue-900 font-mono">
                  {format(parse(workDate, 'yyyy-MM-dd', new Date()), 'EEEE, dd MMMM yyyy')}
                </span>
              </div>

              {/* Quick-select buttons */}
              <div className="grid grid-cols-2 gap-2">
                {[0, 1].map((offset) => {
                  const date = addDays(new Date(), offset);
                  const dateStr = format(date, 'yyyy-MM-dd');
                  const isSelected = workDate === dateStr;
                  const label = offset === 0 ? 'Today' : 'Tomorrow';
                  const dayLabel = format(date, 'EEE, dd MMM');
                  return (
                    <button
                      key={offset}
                      type="button"
                      onClick={() => setWorkDate(dateStr)}
                      className={`rounded-lg border-2 px-3 py-2.5 transition-all text-center ${
                        isSelected
                          ? 'border-blue-500 bg-blue-600 text-white shadow-md scale-[1.02]'
                          : 'border-blue-200 bg-white text-blue-900 hover:border-blue-400 hover:bg-blue-50'
                      }`}
                    >
                      <div className={`text-xs font-bold ${isSelected ? 'text-blue-100' : 'text-blue-500'}`}>
                        {label}
                      </div>
                      <div className={`text-sm font-bold font-mono mt-0.5 ${isSelected ? 'text-white' : 'text-blue-900'}`}>
                        {dayLabel}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="px-4 py-2 text-left font-semibold text-muted-foreground">Agent</th>
                    <th className="px-4 py-2 text-left font-semibold text-muted-foreground">Tab</th>
                    <th className="px-4 py-2 text-right font-semibold text-muted-foreground">Leads</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments
                    .filter((a) => a.leadCount > 0)
                    .map((a) => (
                      <tr key={a.agentId} className="border-b border-border/50">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                              {a.agentName.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-semibold">{a.agentName}</span>
                            {filterStatus && filterStatus[a.agentId] && filterStatus[a.agentId].length > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-300">
                                <Filter className="h-2.5 w-2.5" />
                                FILTER
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{selectedWeek}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-primary">
                          {a.leadCount}
                        </td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/30">
                    <td className="px-4 py-2 font-bold" colSpan={2}>
                      Total
                    </td>
                    <td className="px-4 py-2 text-right font-mono font-bold text-green-600">
                      {totalAssigned}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={handleBackToAssign}
              className="rounded-lg"
            >
              <ArrowLeft className="mr-1.5 h-3 w-3" />
              Back to Edit
            </Button>
            <Button
              onClick={handleExecuteAssign}
              disabled={splitAssignMutation.isPending}
              className="rounded-lg bg-green-600 hover:bg-green-700 text-white"
              size="lg"
            >
              {splitAssignMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Assign {totalAssigned} Leads Now
            </Button>
          </div>
        </div>
      )}

      {/* ============ STEP 6: Done ============ */}
      {step === "done" && splitResult && (
        <div className="space-y-4">
          {/* Success results */}
          {splitResult.results.length > 0 && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-6">
              <div className="text-center mb-4">
                <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto mb-2" />
                <h2 className="text-lg font-bold text-foreground">
                  {splitResult.totalAssigned} Leads Assigned
                </h2>
                <p className="text-sm text-muted-foreground">
                  Successfully distributed across {splitResult.results.length} agent{splitResult.results.length !== 1 ? "s" : ""}
                </p>
              </div>

              <div className="rounded-lg border border-green-200 bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-green-50 border-b border-green-200">
                      <th className="px-4 py-2 text-left font-semibold text-green-800">Agent</th>
                      <th className="px-4 py-2 text-left font-semibold text-green-800">Tab</th>
                      <th className="px-4 py-2 text-right font-semibold text-green-800">Rows</th>
                      <th className="px-4 py-2 text-center font-semibold text-green-800">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {splitResult.results.map((r, i) => (
                      <tr key={i} className="border-b border-green-100">
                        <td className="px-4 py-2 font-semibold">{r.agentName}</td>
                        <td className="px-4 py-2 text-muted-foreground">{r.sheetTab}</td>
                        <td className="px-4 py-2 text-right font-mono font-bold">{r.rowsAppended}</td>
                        <td className="px-4 py-2 text-center">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Error results */}
          {splitResult.errors.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-red-800 flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  Failed Assignments ({splitResult.errors.length}) —{" "}
                  {splitResult.errors.reduce((s, e) => s + e.failedLeadIndices.length, 0)} leads affected
                </h3>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyAllFailedLeads}
                    className="h-7 text-xs rounded-lg border-red-300 text-red-700 hover:bg-red-100"
                  >
                    <Copy className="mr-1 h-3 w-3" />
                    Copy All Failed
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={retryFailedLeads}
                    className="h-7 text-xs rounded-lg border-red-300 text-red-700 hover:bg-red-100"
                  >
                    <RotateCcw className="mr-1 h-3 w-3" />
                    Retry Failed Leads
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {splitResult.errors.map((e, i) => {
                  const failedLeads = getFailedLeads(e.failedLeadIndices);
                  const isExpanded = expandedErrors[i];
                  return (
                    <div key={i} className="rounded-lg border border-red-200 bg-white overflow-hidden">
                      <div className="p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {e.agentName} — {failedLeads.length} leads
                            </p>
                            <p className="text-xs text-red-600">{e.error}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyFailedLeads(e.failedLeadIndices)}
                            className="h-7 text-xs"
                          >
                            <Copy className="mr-1 h-3 w-3" />
                            Copy
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setExpandedErrors((prev) => ({ ...prev, [i]: !prev[i] }))
                            }
                            className="h-7 text-xs"
                          >
                            {isExpanded ? (
                              <ChevronUp className="mr-1 h-3 w-3" />
                            ) : (
                              <ChevronDown className="mr-1 h-3 w-3" />
                            )}
                            {isExpanded ? "Hide" : "Show"} Leads
                          </Button>
                        </div>
                      </div>
                      {isExpanded && failedLeads.length > 0 && (
                        <div className="border-t border-red-100 max-h-64 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-red-50 border-b border-red-100">
                                <th className="px-3 py-1.5 text-left font-semibold text-red-800">#</th>
                                <th className="px-3 py-1.5 text-left font-semibold text-red-800">Name</th>
                                <th className="px-3 py-1.5 text-left font-semibold text-red-800">Phone</th>
                                <th className="px-3 py-1.5 text-left font-semibold text-red-800">Wilaya</th>
                                <th className="px-3 py-1.5 text-left font-semibold text-red-800">Product</th>
                                <th className="px-3 py-1.5 text-right font-semibold text-red-800">Price</th>
                              </tr>
                            </thead>
                            <tbody>
                              {failedLeads.map((lead, j) => (
                                <tr key={j} className="border-b border-red-50 hover:bg-red-50/50">
                                  <td className="px-3 py-1.5 text-muted-foreground">{j + 1}</td>
                                  <td className="px-3 py-1.5 font-medium">{lead.customerName}</td>
                                  <td className="px-3 py-1.5 font-mono">{formatPhonePreview(lead.phone)}</td>
                                  <td className="px-3 py-1.5">{lead.wilaya}</td>
                                  <td className="px-3 py-1.5">{lead.product}</td>
                                  <td className="px-3 py-1.5 text-right font-mono">{lead.price}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" onClick={handleReset} className="rounded-lg">
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Assign More Leads
            </Button>
            {splitResult.errors.length > 0 && (
              <Button onClick={retryFailedLeads} className="rounded-lg bg-red-600 hover:bg-red-700 text-white">
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Retry {splitResult.errors.reduce((s, e) => s + e.failedLeadIndices.length, 0)} Failed Leads
              </Button>
            )}
          </div>
        </div>
      )}
      {/* ============ BLOCKING ERROR MODAL ============ */}
      {/* Forces Hadjer to acknowledge failed assignments — cannot be dismissed by clicking outside */}
      <AlertDialog open={showErrorModal} onOpenChange={setShowErrorModal}>
        <AlertDialogContent className="sm:max-w-md border-red-300 bg-red-50" onEscapeKeyDown={(e) => e.preventDefault()}>
          <AlertDialogHeader>
            <div className="flex flex-col items-center gap-3 mb-2">
              <div className="h-16 w-16 rounded-full bg-red-100 border-2 border-red-300 flex items-center justify-center animate-pulse">
                <AlertOctagon className="h-8 w-8 text-red-600" />
              </div>
              <AlertDialogTitle className="text-xl text-red-800 text-center">
                Assignment Failed!
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {splitResult?.errors && splitResult.errors.length > 0 ? (
                  <>
                    <p className="text-sm text-red-700 text-center font-medium">
                      {splitResult.errors.length} agent(s) failed —{" "}
                      {splitResult.errors.reduce((s, e) => s + e.failedLeadIndices.length, 0)} leads were NOT assigned
                    </p>
                    <div className="rounded-lg border border-red-200 bg-white p-3 space-y-2 max-h-48 overflow-y-auto">
                      {splitResult.errors.map((e, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold text-foreground">{e.agentName}</span>
                            <span className="text-red-600"> — {e.failedLeadIndices.length} leads</span>
                            <p className="text-xs text-muted-foreground">{e.error}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-red-600 text-center font-medium">
                      Scroll down on the results page to copy or retry the failed leads.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-red-700 text-center font-medium">
                    The entire assignment request failed. Please check your connection and try again.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center">
            <AlertDialogAction
              onClick={() => setShowErrorModal(false)}
              className="bg-red-600 hover:bg-red-700 text-white px-8"
            >
              I Understand{splitResult?.errors && splitResult.errors.length > 0 ? " — Show Details" : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
