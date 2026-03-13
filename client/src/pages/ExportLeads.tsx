/**
 * Upload Leads Page — Lead Converter for Delivery Partners
 *
 * Converts pasted Shopify leads into formatted Excel files for:
 * - Sellmax (Tunisia): 29-column format, phone 8 digits, SOUKTN shop
 * - Ecomanager (Algeria): 14-column format, phone 10 digits, auto-detect 3 paste formats
 * - Colivraison (Algeria): 17-column format, phone 10 digits, product selector
 * - Ecotrack DHD (Algeria): 18-column format, bundled TES+SAV, commune dropdown
 *
 * Flow: Select Converter → (Colivraison: select product) → Paste leads → (Ecotrack: commune selection) → Preview → Download Excel
 */

import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import {
  parseLeads,
  toSellmaxRows,
  toEcomamanagerRows,
  toColivraisonRows,
  toEcotrackRows,
  COMPANIES,
  COLIVRAISON_PRODUCTS,
  type CompanyId,
  type ParsedLead,
  type ColivraisonProductConfig,
} from "@/lib/leadParser";
import { exportToExcel } from "@/lib/excelExport";
import {
  extractWilayaCode,
  getWilayaName,
  getCommunesForWilaya,
  extractCommuneHint,
} from "@/lib/ecotrackData";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Download,
  ClipboardPaste,
  ArrowLeft,
  ArrowRight,
  Phone,
  MapPin,
  Package,
  Hash,
  AlertTriangle,
  Trash2,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  User,
  DollarSign,
  RotateCcw,
  Eye,
  Loader2,
  Truck,
  Building2,
  Search,
  BellRing,
  ExternalLink,
  X,
  Megaphone,
} from "lucide-react";

type Step = "select" | "product" | "paste" | "commune" | "preview";

export default function ExportLeads() {
  const [step, setStep] = useState<Step>("select");
  const [selectedCompany, setSelectedCompany] = useState<CompanyId | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ColivraisonProductConfig | null>(null);
  const [rawText, setRawText] = useState("");
  const [leads, setLeads] = useState<ParsedLead[]>([]);
  const [duplicatesRemoved, setDuplicatesRemoved] = useState(false);
  const [duplicatesRemovedCount, setDuplicatesRemovedCount] = useState(0);

  // Ecotrack commune selections: leadIndex → selected commune name
  const [communeSelections, setCommuneSelections] = useState<Record<number, string>>({});
  // Commune search filter per lead
  const [communeSearches, setCommuneSearches] = useState<Record<number, string>>({});
  // Wilaya overrides: leadIndex → manually selected wilaya code
  const [wilayaOverrides, setWilayaOverrides] = useState<Record<number, number>>({});

  // Post-upload reminder state
  const [showReminder, setShowReminder] = useState(false);
  const [reminderPartner, setReminderPartner] = useState<string>("");
  const [reminderLeadCount, setReminderLeadCount] = useState(0);
  const [lastHistoryId, setLastHistoryId] = useState<number | null>(null);

  // Log upload mutation
  const logExportMutation = trpc.history.logExport.useMutation();
  const validateMutation = trpc.history.validateEntry.useMutation();

  // Duplicate detection
  const duplicateInfo = useMemo(() => {
    const phoneMap = new Map<string, number[]>();
    leads.forEach((lead, idx) => {
      const normalizedPhone = lead.primaryPhoneNumber.replace(/[\s\-()]/g, "");
      if (!normalizedPhone) return;
      const existing = phoneMap.get(normalizedPhone) || [];
      existing.push(idx);
      phoneMap.set(normalizedPhone, existing);
    });
    const duplicateIndices = new Set<number>();
    const duplicateGroups: { phone: string; indices: number[] }[] = [];
    Array.from(phoneMap.entries()).forEach(([phone, indices]) => {
      if (indices.length > 1) {
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
    setDuplicatesRemovedCount(duplicateInfo.count);
    setLeads(cleaned);
    setDuplicatesRemoved(true);
    toast.success(
      `Removed ${duplicateInfo.count} duplicate lead${duplicateInfo.count > 1 ? "s" : ""} (kept first occurrence)`
    );
  }, [leads, duplicateInfo]);

  // Delete a single lead from the preview list
  const handleDeleteLead = useCallback((index: number) => {
    const lead = leads[index];
    const newLeads = leads.filter((_, i) => i !== index);
    setLeads(newLeads);
    // Also update commune selections if applicable (shift indices)
    const newCommuneSelections: Record<number, string> = {};
    const newCommuneSearches: Record<number, string> = {};
    const newWilayaOverrides: Record<number, number> = {};
    Object.entries(communeSelections).forEach(([k, v]) => {
      const ki = parseInt(k);
      if (ki < index) newCommuneSelections[ki] = v;
      else if (ki > index) newCommuneSelections[ki - 1] = v;
    });
    Object.entries(communeSearches).forEach(([k, v]) => {
      const ki = parseInt(k);
      if (ki < index) newCommuneSearches[ki] = v;
      else if (ki > index) newCommuneSearches[ki - 1] = v;
    });
    Object.entries(wilayaOverrides).forEach(([k, v]) => {
      const ki = parseInt(k);
      if (ki < index) newWilayaOverrides[ki] = v;
      else if (ki > index) newWilayaOverrides[ki - 1] = v;
    });
    setCommuneSelections(newCommuneSelections);
    setCommuneSearches(newCommuneSearches);
    setWilayaOverrides(newWilayaOverrides);
    toast.success(`Removed lead: ${lead.name || lead.primaryPhoneNumber}`);
  }, [leads, communeSelections, communeSearches, wilayaOverrides]);

  // Handlers
  const handleSelectCompany = useCallback((id: CompanyId) => {
    setSelectedCompany(id);
    setSelectedProduct(null);
    setRawText("");
    setLeads([]);
    setDuplicatesRemoved(false);
    setCommuneSelections({});
    setCommuneSearches({});
    if (id === "colivraison") {
      setStep("product");
    } else {
      setStep("paste");
    }
  }, []);

  const handleSelectProduct = useCallback((product: ColivraisonProductConfig) => {
    setSelectedProduct(product);
    setStep("paste");
  }, []);

  const handleParse = useCallback(() => {
    if (!rawText.trim() || !selectedCompany) {
      toast.error("Please paste lead data first");
      return;
    }
    try {
      const parsed = parseLeads(rawText, selectedCompany);
      if (parsed.length === 0) {
        toast.error("No valid leads found in pasted data. Check the format.");
        return;
      }
      setLeads(parsed);
      setDuplicatesRemoved(false);

      // For Ecotrack DHD, go to commune selection step
      if (selectedCompany === "ecotrack_dhd") {
        // Always start with empty selections — commune must be manually selected
        setCommuneSelections({});
        setCommuneSearches({});
        setStep("commune");
        toast.success(`Parsed ${parsed.length} leads — now select communes`);
      } else {
        setStep("preview");
        toast.success(`Parsed ${parsed.length} leads`);
      }
    } catch (err: any) {
      toast.error(`Parse error: ${err.message || "Unknown error"}`);
    }
  }, [rawText, selectedCompany]);

  // Upsell count (Ecomanager + Colivraison + Ecotrack)
  const upsellCount = useMemo(() => {
    if (selectedCompany !== "ecomamanager" && selectedCompany !== "colivraison" && selectedCompany !== "ecotrack_dhd") return 0;
    return leads.filter((l) => (l.originalPrice || 3800) >= 5800).length;
  }, [leads, selectedCompany]);

  // Ecotrack: count how many communes are selected
  const communeSelectedCount = useMemo(() => {
    return Object.values(communeSelections).filter(v => v).length;
  }, [communeSelections]);

  // Ecotrack: count how many leads have a valid wilaya code (including overrides)
  const wilayaDetectedCount = useMemo(() => {
    if (selectedCompany !== "ecotrack_dhd") return 0;
    return leads.filter((l, i) => wilayaOverrides[i] != null || extractWilayaCode(l.fullAddress || '') !== null).length;
  }, [leads, selectedCompany, wilayaOverrides]);

  const handleDownload = useCallback(() => {
    if (!selectedCompany || leads.length === 0) return;
    try {
      if (selectedCompany === "sellmax") {
        const rows = toSellmaxRows(leads);
        exportToExcel("sellmax", rows);
        toast.success(`Downloaded ${rows.length} leads as Sellmax Excel file`);
      } else if (selectedCompany === "colivraison") {
        if (!selectedProduct) {
          toast.error("No product selected");
          return;
        }
        const rows = toColivraisonRows(leads, selectedProduct);
        exportToExcel("colivraison", rows);
        toast.success(`Downloaded ${rows.length} leads as Colivraison Excel file`);
      } else if (selectedCompany === "ecotrack_dhd") {
        const rows = toEcotrackRows(leads, communeSelections, wilayaOverrides);
        exportToExcel("ecotrack_dhd", rows);
        toast.success(`Downloaded ${rows.length} leads as Ecotrack DHD Excel file`);
      } else {
        const rows = toEcomamanagerRows(leads);
        exportToExcel("ecomamanager", rows);
        toast.success(`Downloaded ${rows.length} leads as Ecomanager Excel file`);
      }

      // Show reminder notification to confirm upload on partner platform
      const partnerName = COMPANIES[selectedCompany].name;
      setReminderPartner(partnerName);
      setReminderLeadCount(leads.length);
      setShowReminder(true);

      // Log upload to history (fire and forget)
      const country = selectedCompany === "sellmax" ? "tunisia" : "algeria";
      const sampleLeads = leads.slice(0, 5).map(l => ({
        name: l.name,
        phone: l.primaryPhoneNumber,
        address: l.fullAddress,
        ref: l.referenceNumber,
      }));
      logExportMutation.mutate({
        partner: selectedCompany,
        country,
        totalLeads: leads.length,
        duplicatesRemoved: duplicatesRemovedCount,
        upsellCount: (selectedCompany === "ecomamanager" || selectedCompany === "colivraison" || selectedCompany === "ecotrack_dhd") ? upsellCount : 0,
        sampleLeads,
      }, {
        onSuccess: (data) => {
          if (data.historyId) {
            setLastHistoryId(data.historyId);
          }
        },
        onError: (err) => {
          console.warn('Failed to log upload:', err);
        },
      });
    } catch (err: any) {
      toast.error(`Upload error: ${err.message || "Unknown error"}`);
    }
  }, [selectedCompany, selectedProduct, leads, communeSelections, duplicatesRemovedCount, upsellCount, logExportMutation]);

  const handleReset = useCallback(() => {
    setStep("select");
    setSelectedCompany(null);
    setSelectedProduct(null);
    setRawText("");
    setLeads([]);
    setDuplicatesRemoved(false);
    setDuplicatesRemovedCount(0);
    setCommuneSelections({});
    setCommuneSearches({});
    setWilayaOverrides({});
    setShowReminder(false);
  }, []);

  const handleBackToPaste = useCallback(() => {
    setStep("paste");
  }, []);

  // Step config — dynamic based on company
  const steps: { key: Step; label: string; icon: any }[] =
    selectedCompany === "colivraison"
      ? [
          { key: "select", label: "Converter", icon: Package },
          { key: "product", label: "Product", icon: Truck },
          { key: "paste", label: "Paste", icon: ClipboardPaste },
          { key: "preview", label: "Preview & Download", icon: Download },
        ]
      : selectedCompany === "ecotrack_dhd"
      ? [
          { key: "select", label: "Converter", icon: Package },
          { key: "paste", label: "Paste", icon: ClipboardPaste },
          { key: "commune", label: "Communes", icon: Building2 },
          { key: "preview", label: "Preview & Download", icon: Download },
        ]
      : [
          { key: "select", label: "Converter", icon: Package },
          { key: "paste", label: "Paste", icon: ClipboardPaste },
          { key: "preview", label: "Preview & Download", icon: Download },
        ];
  const stepOrder = steps.map((s) => s.key);
  const currentStepIndex = stepOrder.indexOf(step);

  const companyConfig = selectedCompany ? COMPANIES[selectedCompany] : null;

  // Color theme per company
  const companyColor = selectedCompany === "sellmax"
    ? "orange"
    : selectedCompany === "colivraison"
    ? "green"
    : selectedCompany === "ecotrack_dhd"
    ? "purple"
    : "blue";

  const colorClasses = {
    orange: {
      badge: "bg-orange-100 text-orange-700",
      button: "bg-orange-500 hover:bg-orange-600",
      icon: "text-orange-400",
      step: "bg-orange-500",
      stepPast: "bg-orange-100 text-orange-600",
      border: "hover:border-orange-400 hover:bg-orange-50/30",
      accent: "text-orange-500",
    },
    blue: {
      badge: "bg-blue-100 text-blue-700",
      button: "bg-blue-500 hover:bg-blue-600",
      icon: "text-blue-400",
      step: "bg-blue-500",
      stepPast: "bg-blue-100 text-blue-600",
      border: "hover:border-blue-400 hover:bg-blue-50/30",
      accent: "text-blue-500",
    },
    green: {
      badge: "bg-green-100 text-green-700",
      button: "bg-green-600 hover:bg-green-700",
      icon: "text-green-500",
      step: "bg-green-600",
      stepPast: "bg-green-100 text-green-600",
      border: "hover:border-green-400 hover:bg-green-50/30",
      accent: "text-green-600",
    },
    purple: {
      badge: "bg-purple-100 text-purple-700",
      button: "bg-purple-600 hover:bg-purple-700",
      icon: "text-purple-500",
      step: "bg-purple-600",
      stepPast: "bg-purple-100 text-purple-600",
      border: "hover:border-purple-400 hover:bg-purple-50/30",
      accent: "text-purple-600",
    },
  };
  const cc = colorClasses[companyColor];

  return (
    <div className="container py-6 max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Download className={`h-5 w-5 ${cc.accent}`} />
          Upload Leads
          {companyConfig && (
            <span className={`text-sm font-normal ${cc.accent}`}>
              {companyConfig.name} ({companyConfig.country})
            </span>
          )}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Convert pasted leads into formatted Excel files for partners
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
                  className={`h-3 w-3 ${isPast ? cc.accent : "text-muted-foreground/30"}`}
                />
              )}
              <div
                className={`
                  flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all
                  ${isActive ? `${cc.step} text-white` : isPast ? cc.stepPast : "bg-muted text-muted-foreground"}
                `}
              >
                <Icon className="h-3 w-3" />
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* ============ STEP 1: Select Converter ============ */}
      {step === "select" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-sm font-bold text-foreground mb-1">Select Delivery Partner</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Choose which partner format to upload leads for
            </p>
            {/* === LEADS SECTION === */}
            <div className="mb-2">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Leads</h3>
              <p className="text-[10px] text-muted-foreground">Send raw leads for confirmation & shipping</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {/* Sellmax */}
              <button
                onClick={() => handleSelectCompany("sellmax")}
                className="relative rounded-xl border-2 border-border p-6 text-left transition-all hover:scale-[1.01] hover:border-orange-400 hover:bg-orange-50/30 group"
              >
                <div className="flex items-center gap-3 mb-3">
                  <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663100505681/BGqs7KPXdQCKEiUP6wXDFD/sellmax-logo_25dd1a56.png" alt="Sellmax" className="h-10 w-10 rounded-lg object-contain" />
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Sellmax</h3>
                    <p className="text-xs text-muted-foreground">Tunisia</p>
                  </div>
                </div>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <FileSpreadsheet className="h-3 w-3 text-orange-400" />
                    <span>29-column Excel format</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3 w-3 text-orange-400" />
                    <span>Phone: 8 digits (removes 216 prefix)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Package className="h-3 w-3 text-orange-400" />
                    <span>Shop: SOUKTN · SKU: auto (TestiIcalm / Prostcalm) · 87 TND</span>
                  </div>
                </div>
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ArrowRight className="h-4 w-4 text-orange-400" />
                </div>
              </button>

              {/* Ecomanager */}
              <button
                onClick={() => handleSelectCompany("ecomamanager")}
                className="relative rounded-xl border-2 border-border p-6 text-left transition-all hover:scale-[1.01] hover:border-blue-400 hover:bg-blue-50/30 group"
              >
                <div className="flex items-center gap-3 mb-3">
                  <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663100505681/BGqs7KPXdQCKEiUP6wXDFD/ecomanager-logo_5a044077.png" alt="Ecomanager" className="h-10 w-10 rounded-lg object-contain" />
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Ecomanager</h3>
                    <p className="text-xs text-muted-foreground">Algeria</p>
                  </div>
                </div>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <FileSpreadsheet className="h-3 w-3 text-blue-400" />
                    <span>14-column Excel format (Commandes sheet)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3 w-3 text-blue-400" />
                    <span>Phone: 10 digits (removes +213 prefix)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Package className="h-3 w-3 text-blue-400" />
                    <span>SKU: TES · 3800 DA · Upsell auto-detect</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Eye className="h-3 w-3 text-blue-400" />
                    <span>Auto-detects 3 paste formats</span>
                  </div>
                </div>
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ArrowRight className="h-4 w-4 text-blue-400" />
                </div>
              </button>

              {/* Colivraison */}
              <button
                onClick={() => handleSelectCompany("colivraison")}
                className="relative rounded-xl border-2 border-border p-6 text-left transition-all hover:scale-[1.01] hover:border-green-400 hover:bg-green-50/30 group"
              >
                <div className="flex items-center gap-3 mb-3">
                  <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663100505681/BGqs7KPXdQCKEiUP6wXDFD/colivraison-logo_019de486.png" alt="Colivraison" className="h-10 w-10 rounded-lg object-contain" />
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Colivraison</h3>
                    <p className="text-xs text-muted-foreground">Algeria</p>
                  </div>
                </div>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <FileSpreadsheet className="h-3 w-3 text-green-500" />
                    <span>17-column Excel format</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3 w-3 text-green-500" />
                    <span>Phone: 10 digits (removes +213 prefix)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Package className="h-3 w-3 text-green-500" />
                    <span>Product selector · Price→Qty auto-map</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <User className="h-3 w-3 text-green-500" />
                    <span>Name cleanup (phone→client, remove digits)</span>
                  </div>
                </div>
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ArrowRight className="h-4 w-4 text-green-500" />
                </div>
              </button>

            </div>

            {/* === CONFIRMED ORDERS SECTION === */}
            <div className="mb-2">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Confirmed Orders</h3>
              <p className="text-[10px] text-muted-foreground">Upload confirmed orders for delivery only</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Ecotrack DHD */}
              <button
                onClick={() => handleSelectCompany("ecotrack_dhd")}
                className="relative rounded-xl border-2 border-border p-6 text-left transition-all hover:scale-[1.01] hover:border-purple-400 hover:bg-purple-50/30 group"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-lg bg-white flex items-center justify-center overflow-hidden">
                    <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663100505681/BGqs7KPXdQCKEiUP6wXDFD/dhd-livraison-logo_36555280.png" alt="DHD Livraison" className="h-8 w-8 object-contain" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Ecotrack DHD</h3>
                    <p className="text-xs text-muted-foreground">Algeria</p>
                  </div>
                </div>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <FileSpreadsheet className="h-3 w-3 text-purple-500" />
                    <span>18-column Excel format</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Package className="h-3 w-3 text-purple-500" />
                    <span>Testicalm + Savon bundle (TES,SAV)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Building2 className="h-3 w-3 text-purple-500" />
                    <span>Commune dropdown per wilaya</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <DollarSign className="h-3 w-3 text-purple-500" />
                    <span>Normal: 1+1 · Upsell: 2+1 (always 1 savon)</span>
                  </div>
                </div>
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ArrowRight className="h-4 w-4 text-purple-500" />
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ STEP 1.5: Product Selection (Colivraison only) ============ */}
      {step === "product" && selectedCompany === "colivraison" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-sm font-bold text-foreground mb-1">Select Product</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Choose the product for this upload batch. The product name and price→quantity rules will be applied automatically.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {COLIVRAISON_PRODUCTS.map((product) => (
                <button
                  key={product.id}
                  onClick={() => handleSelectProduct(product)}
                  className="relative rounded-xl border-2 border-border p-5 text-left transition-all hover:scale-[1.01] hover:border-green-400 hover:bg-green-50/30 group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                      <Package className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground">{product.name}</h3>
                      <p className="text-xs text-muted-foreground">{product.productLabel}</p>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <p className="font-semibold text-foreground text-[11px]">Price → Quantity Rules:</p>
                    {product.priceRules.map((rule) => (
                      <div key={rule.price} className="flex items-center gap-1.5">
                        <DollarSign className="h-3 w-3 text-green-500" />
                        <span>{rule.price.toLocaleString()} DA → Qty {rule.qty}</span>
                      </div>
                    ))}
                  </div>
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowRight className="h-4 w-4 text-green-500" />
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-4">
              <Button
                variant="outline"
                onClick={() => setStep("select")}
                className="rounded-lg"
              >
                <ArrowLeft className="mr-1.5 h-3 w-3" />
                Back
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============ STEP 2: Paste ============ */}
      {step === "paste" && selectedCompany && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-foreground">
                Paste Lead Data — {companyConfig?.name}
                {selectedProduct && (
                  <span className="ml-2 text-xs font-normal text-green-600">
                    ({selectedProduct.name})
                  </span>
                )}
              </label>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${cc.badge}`}>
                {companyConfig?.country}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {selectedCompany === "sellmax"
                ? "Paste tab-separated Shopify rows. Each row needs: #order, date, name, phone, address."
                : selectedCompany === "colivraison"
                ? "Paste leads with tab-separated columns: name, phone (+213), address, product, qty, price, reference. Phone is used as anchor."
                : selectedCompany === "ecotrack_dhd"
                ? "Paste confirmed leads (same format as Ecomanager). Phone (+213) is used as anchor. You'll select communes in the next step."
                : "Paste leads in any of 3 formats: tab-separated, concatenated (no tabs), or multi-line. Phone (+213) is used as anchor."}
            </p>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={companyConfig?.placeholderText || "Paste leads here..."}
              className="w-full h-56 rounded-lg border border-border bg-background p-3 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder:text-muted-foreground/40"
            />
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (selectedCompany === "colivraison") {
                      setStep("product");
                    } else {
                      setStep("select");
                    }
                  }}
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
                disabled={!rawText.trim()}
                className={`rounded-lg ${cc.button} text-white`}
              >
                <ClipboardPaste className="mr-2 h-4 w-4" />
                Parse & {selectedCompany === "ecotrack_dhd" ? "Select Communes" : "Preview"}
              </Button>
            </div>
          </div>

          {/* Format help */}
          <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
            <h3 className="text-xs font-bold text-foreground mb-2">
              {selectedCompany === "sellmax" ? "Sellmax Format" : selectedCompany === "colivraison" ? "Colivraison Format" : selectedCompany === "ecotrack_dhd" ? "Ecotrack DHD Format" : "Ecomanager Formats"}
            </h3>
            {selectedCompany === "sellmax" ? (
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Tab-separated rows from Shopify. Required columns:</p>
                <code className="block bg-background rounded px-2 py-1 font-mono text-[10px] overflow-x-auto">
                  #OrderNumber → Date → Name → Phone → Address → Product → Price ...
                </code>
                <p className="mt-1">Phone numbers: 216 prefix is automatically removed, result is 8 digits.</p>
              </div>
            ) : selectedCompany === "colivraison" ? (
              <div className="text-xs text-muted-foreground space-y-2">
                <div>
                  <p className="font-semibold text-foreground">Tab-separated lead data</p>
                  <code className="block bg-background rounded px-2 py-1 font-mono text-[10px] overflow-x-auto">
                    Name → +213... → (empty) → (empty) → (empty) → Address → Product → (empty) → Qty → Price → ... → Reference
                  </code>
                </div>
                <div className="space-y-1 mt-2">
                  <p className="font-semibold text-foreground">Auto-cleanup rules:</p>
                  <p>• Phone: +213 prefix removed, result is 10 digits</p>
                  <p>• Name is phone number (e.g. "675055198") → replaced with "client"</p>
                  <p>• Name has digits (e.g. "mohamed055920") → digits removed → "mohamed"</p>
                  <p>• Duplicates detected by phone number</p>
                  <p>• Qty auto-set from price rules ({selectedProduct?.priceRules.map(r => `${r.price}→${r.qty}`).join(", ")})</p>
                </div>
              </div>
            ) : selectedCompany === "ecotrack_dhd" ? (
              <div className="text-xs text-muted-foreground space-y-2">
                <div>
                  <p className="font-semibold text-foreground">Same format as Ecomanager (tab-separated or concatenated)</p>
                  <p>Phone (+213) is the anchor. Wilaya code is auto-extracted.</p>
                </div>
                <div className="space-y-1 mt-2">
                  <p className="font-semibold text-foreground">Ecotrack-specific rules:</p>
                  <p>• Products: TES,SAV (Testicalm + Savon bundle)</p>
                  <p>• Normal (3800 DA): qty = 1,1 (1 testicalm + 1 savon)</p>
                  <p>• Upsell (5800 DA): qty = 2,1 (2 testicalm + 1 savon — always 1 savon)</p>
                  <p>• Commune: you'll select from a dropdown filtered by wilaya</p>
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground space-y-2">
                <div>
                  <p className="font-semibold text-foreground">Format 1: Tab-separated</p>
                  <code className="block bg-background rounded px-2 py-1 font-mono text-[10px] overflow-x-auto">
                    8478 → Name → +213... → Wilaya → Product → Price
                  </code>
                </div>
                <div>
                  <p className="font-semibold text-foreground">Format 2: Concatenated (no tabs)</p>
                  <p>Data runs together on few lines. +213 phone is the anchor.</p>
                </div>
                <div>
                  <p className="font-semibold text-foreground">Format 3: Multi-line (abandoned)</p>
                  <p>Each field on its own line with junk metadata mixed in.</p>
                </div>
                <p className="mt-1">Upsell auto-detected via Arabic text or price = 5800.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ STEP 2.5: Commune Selection (Ecotrack DHD only) ============ */}
      {step === "commune" && selectedCompany === "ecotrack_dhd" && leads.length > 0 && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-2xl font-bold font-mono text-foreground">{leads.length}</p>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total Leads</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-2xl font-bold font-mono text-purple-600">{wilayaDetectedCount}</p>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Wilaya Detected</p>
            </div>
            <div className={`rounded-xl border p-4 text-center ${communeSelectedCount === leads.length ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
              <p className={`text-2xl font-bold font-mono ${communeSelectedCount === leads.length ? "text-green-600" : "text-amber-600"}`}>
                {communeSelectedCount}/{leads.length}
              </p>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Communes Set</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-2xl font-bold font-mono text-purple-600">{upsellCount}</p>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Upsells (×2)</p>
            </div>
          </div>

          {/* Duplicate warning */}
          {duplicateInfo.count > 0 && !duplicatesRemoved && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">
                    {duplicateInfo.count} duplicate{duplicateInfo.count > 1 ? "s" : ""} detected
                  </p>
                  <p className="text-xs text-amber-600">
                    {duplicateInfo.duplicateGroups.length} phone number{duplicateInfo.duplicateGroups.length > 1 ? "s" : ""} appear multiple times
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={removeDuplicates}
                className="rounded-lg border-amber-300 text-amber-700 hover:bg-amber-100"
              >
                <Trash2 className="mr-1.5 h-3 w-3" />
                Remove Duplicates
              </Button>
            </div>
          )}

          {/* Commune selection table */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Building2 className="h-4 w-4 text-purple-500" />
                Select Commune for Each Lead
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-purple-100 text-purple-700">
                Mandatory field
              </span>
            </div>
            <div className="max-h-[500px] overflow-auto">
              <table className="w-full text-xs" style={{ minWidth: '1100px' }}>
                <thead className="sticky top-0 bg-card z-10 shadow-sm">
                  <tr className="border-b border-border">
                    <th className="px-2 py-2 text-left font-semibold text-muted-foreground w-10">#</th>
                    <th className="px-2 py-2 text-left font-semibold text-muted-foreground min-w-[120px]">Name</th>
                    <th className="px-2 py-2 text-left font-semibold text-muted-foreground min-w-[110px]">Phone</th>
                    <th className="px-2 py-2 text-left font-semibold text-muted-foreground min-w-[130px]">Wilaya</th>
                    <th className="px-2 py-2 text-left font-semibold text-muted-foreground min-w-[220px]">Address</th>
                    <th className="px-2 py-2 text-left font-semibold text-muted-foreground min-w-[70px]">Price</th>
                    <th className="px-2 py-2 text-left font-semibold text-muted-foreground min-w-[50px]">Qty</th>
                    <th className="px-2 py-2 text-left font-semibold text-muted-foreground min-w-[200px]">
                      <div className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        Commune *
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead, i) => {
                    const detectedWilayaCode = extractWilayaCode(lead.fullAddress || '');
                    const effectiveWilayaCode = wilayaOverrides[i] != null ? wilayaOverrides[i] : detectedWilayaCode;
                    const wilayaName = effectiveWilayaCode ? getWilayaName(effectiveWilayaCode) : '';
                    const communes = effectiveWilayaCode ? getCommunesForWilaya(effectiveWilayaCode) : [];
                    const selectedCommune = communeSelections[i] || '';
                    const isDuplicate = duplicateInfo.duplicateIndices.has(i);
                    const qtyVal = lead.productName?.startsWith('qty:') ? parseInt(lead.productName.split(':')[1], 10) : 1;
                    const isWilayaOverridden = wilayaOverrides[i] != null;

                    const updateLead = (field: keyof ParsedLead, value: string | number | undefined) => {
                      setLeads(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
                    };

                    return (
                      <tr
                        key={i}
                        className={`border-b border-border/30 ${
                          isDuplicate ? "bg-red-50" : i % 2 === 0 ? "" : "bg-muted/20"
                        }`}
                      >
                        <td className="px-2 py-1.5 text-muted-foreground font-mono">{i + 1}</td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={lead.name || ''}
                            onChange={(e) => updateLead('name', e.target.value)}
                            className="w-full text-xs rounded border border-border/50 px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-purple-300 min-w-[100px]"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={lead.primaryPhoneNumber || ''}
                            onChange={(e) => updateLead('primaryPhoneNumber', e.target.value)}
                            className="w-full text-xs font-mono rounded border border-border/50 px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-purple-300 min-w-[90px]"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={effectiveWilayaCode || ''}
                            onChange={(e) => {
                              const newCode = e.target.value ? parseInt(e.target.value, 10) : null;
                              if (newCode) {
                                setWilayaOverrides(prev => ({ ...prev, [i]: newCode }));
                                // Clear commune selection when wilaya changes
                                setCommuneSelections(prev => { const next = { ...prev }; delete next[i]; return next; });
                              } else {
                                setWilayaOverrides(prev => { const next = { ...prev }; delete next[i]; return next; });
                                setCommuneSelections(prev => { const next = { ...prev }; delete next[i]; return next; });
                              }
                            }}
                            className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 border appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-purple-300 ${
                              effectiveWilayaCode
                                ? isWilayaOverridden
                                  ? "bg-blue-100 text-blue-700 border-blue-300"
                                  : "bg-purple-100 text-purple-700 border-purple-200"
                                : "bg-red-100 text-red-700 border-red-300"
                            }`}
                          >
                            <option value="">-- No wilaya --</option>
                            {Array.from({ length: 58 }, (_, k) => k + 1).map(code => (
                              <option key={code} value={code}>
                                {String(code).padStart(2, '0')} - {getWilayaName(code)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={lead.fullAddress || ''}
                            onChange={(e) => updateLead('fullAddress', e.target.value)}
                            className="w-full text-xs rounded border border-border/50 px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-purple-300 min-w-[250px]"
                            title={lead.fullAddress || '-'}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            value={lead.originalPrice || 3800}
                            onChange={(e) => updateLead('originalPrice', parseInt(e.target.value) || 0)}
                            className="w-full text-xs font-mono rounded border border-border/50 px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-purple-300 w-20"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            value={qtyVal}
                            min={1}
                            onChange={(e) => {
                              const newQty = parseInt(e.target.value) || 1;
                              updateLead('productName', newQty > 1 ? `qty:${newQty}` : undefined);
                            }}
                            className={`w-full text-xs font-mono rounded border px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-purple-300 w-14 ${
                              qtyVal > 1 ? 'border-purple-300 bg-purple-50 text-purple-700 font-bold' : 'border-border/50'
                            }`}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          {communes.length > 0 ? (
                            <div className="relative">
                              <select
                                value={selectedCommune}
                                onChange={(e) => {
                                  setCommuneSelections(prev => ({ ...prev, [i]: e.target.value }));
                                }}
                                className={`w-full text-xs rounded-lg border px-2 py-1.5 pr-6 appearance-none bg-background focus:outline-none focus:ring-2 focus:ring-purple-300 ${
                                  selectedCommune
                                    ? "border-green-300 bg-green-50 text-green-800 font-medium"
                                    : "border-amber-300 bg-amber-50 text-amber-800"
                                }`}
                              >
                                <option value="">-- Select commune ({communes.length}) --</option>
                                {communes.map(c => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                              {selectedCommune && (
                                <CheckCircle2 className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-green-500 pointer-events-none" />
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-red-500 italic">No wilaya detected</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleBackToPaste}
                className="rounded-lg"
              >
                <ArrowLeft className="mr-1.5 h-3 w-3" />
                Back to Paste
              </Button>
              <Button
                variant="outline"
                onClick={handleReset}
                className="rounded-lg"
              >
                <RotateCcw className="mr-1.5 h-3 w-3" />
                Start Over
              </Button>
            </div>
            <Button
              onClick={() => {
                // Warn if not all communes are selected
                const missingCount = leads.length - communeSelectedCount;
                if (missingCount > 0) {
                  toast.warning(`${missingCount} lead${missingCount > 1 ? 's' : ''} still missing commune selection. They'll be uploaded with empty commune.`);
                }
                setStep("preview");
              }}
              className={`rounded-lg text-white ${cc.button}`}
            >
              <ArrowRight className="mr-2 h-4 w-4" />
              Continue to Preview ({communeSelectedCount}/{leads.length} communes set)
            </Button>
          </div>
        </div>
      )}

      {/* ============ STEP 3: Preview & Download ============ */}
      {step === "preview" && selectedCompany && leads.length > 0 && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className={`grid grid-cols-2 ${selectedCompany === "sellmax" ? "sm:grid-cols-5" : "sm:grid-cols-4"} gap-3`}>
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-2xl font-bold font-mono text-foreground">{leads.length}</p>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total Leads</p>
            </div>
            {selectedCompany === "sellmax" && (() => {
              const prostaCount = leads.filter(l => l.productName && l.productName.toLowerCase().includes('prostacalm')).length;
              const actualTesti = leads.length - prostaCount;
              return (
                <>
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-center">
                    <p className="text-2xl font-bold font-mono text-blue-600">{actualTesti}</p>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Testicalm</p>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                    <p className="text-2xl font-bold font-mono text-emerald-600">{prostaCount}</p>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Prostacalm</p>
                  </div>
                </>
              );
            })()}
            {(selectedCompany === "ecomamanager" || selectedCompany === "colivraison" || selectedCompany === "ecotrack_dhd") && (
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <p className="text-2xl font-bold font-mono text-purple-600">{upsellCount}</p>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Upsells (×2)</p>
              </div>
            )}
            <div className={`rounded-xl border p-4 text-center ${
              duplicateInfo.count > 0
                ? "border-amber-200 bg-amber-50"
                : "border-green-200 bg-green-50"
            }`}>
              <p className={`text-2xl font-bold font-mono ${
                duplicateInfo.count > 0 ? "text-amber-600" : "text-green-600"
              }`}>
                {duplicateInfo.count}
              </p>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Duplicates</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-2xl font-bold font-mono text-foreground">
                {selectedCompany === "sellmax" ? "29" : selectedCompany === "colivraison" ? "17" : selectedCompany === "ecotrack_dhd" ? "18" : "14"}
              </p>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Excel Columns</p>
            </div>
          </div>

          {/* Duplicate warning */}
          {duplicateInfo.count > 0 && !duplicatesRemoved && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">
                    {duplicateInfo.count} duplicate{duplicateInfo.count > 1 ? "s" : ""} detected
                  </p>
                  <p className="text-xs text-amber-600">
                    {duplicateInfo.duplicateGroups.length} phone number{duplicateInfo.duplicateGroups.length > 1 ? "s" : ""} appear multiple times
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={removeDuplicates}
                className="rounded-lg border-amber-300 text-amber-700 hover:bg-amber-100"
              >
                <Trash2 className="mr-1.5 h-3 w-3" />
                Remove Duplicates
              </Button>
            </div>
          )}

          {duplicatesRemoved && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <p className="text-sm font-semibold text-green-700">Duplicates removed</p>
            </div>
          )}

          {/* Ecotrack commune warning */}
          {selectedCompany === "ecotrack_dhd" && communeSelectedCount < leads.length && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <p className="text-sm text-amber-700">
                <span className="font-semibold">{leads.length - communeSelectedCount}</span> lead{leads.length - communeSelectedCount > 1 ? 's' : ''} missing commune.{' '}
                <button onClick={() => setStep("commune")} className="underline font-semibold hover:text-amber-800">Go back to set them</button>
              </p>
            </div>
          )}

          {/* Preview table */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                Lead Preview
                <span className="text-xs font-normal text-muted-foreground">
                  ({leads.length} leads)
                </span>
              </h3>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${cc.badge}`}>
                {companyConfig?.name} format
              </span>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card z-10 shadow-sm">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-10">#</th>
                    {selectedCompany === "sellmax" && (
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                        <div className="flex items-center gap-1"><Hash className="h-3 w-3" /> Order</div>
                      </th>
                    )}
                    {selectedCompany === "sellmax" && (
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                        <div className="flex items-center gap-1"><Package className="h-3 w-3" /> Product</div>
                      </th>
                    )}
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                      <div className="flex items-center gap-1"><User className="h-3 w-3" /> Name</div>
                    </th>
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                      <div className="flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</div>
                    </th>
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                      <div className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {selectedCompany === "sellmax" ? "Address" : selectedCompany === "ecotrack_dhd" ? "Wilaya" : selectedCompany === "colivraison" ? "Address" : "Wilaya"}</div>
                    </th>
                    {selectedCompany === "ecotrack_dhd" && (
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                        <div className="flex items-center gap-1"><Building2 className="h-3 w-3" /> Commune</div>
                      </th>
                    )}
                    {(selectedCompany === "ecomamanager" || selectedCompany === "colivraison" || selectedCompany === "ecotrack_dhd") && (
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">
                        <div className="flex items-center gap-1 justify-end"><DollarSign className="h-3 w-3" /> Price</div>
                      </th>
                    )}
                    {selectedCompany === "colivraison" && (
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">
                        <div className="flex items-center gap-1"><FileSpreadsheet className="h-3 w-3" /> Ref</div>
                      </th>
                    )}
                    {selectedCompany === "ecotrack_dhd" && (
                      <th className="px-3 py-2 text-center font-semibold text-muted-foreground">Qty</th>
                    )}
                    {selectedCompany === "sellmax" && (
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground min-w-[180px]">
                        <div className="flex items-center gap-1"><Megaphone className="h-3 w-3" /> Ad Source</div>
                      </th>
                    )}
                    <th className="px-3 py-2 text-center font-semibold text-muted-foreground w-16">Status</th>
                    <th className="px-3 py-2 text-center font-semibold text-muted-foreground w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead, i) => {
                    const isDuplicate = duplicateInfo.duplicateIndices.has(i);
                    const isUpsell = (lead.originalPrice || 3800) >= 5800;
                    const detectedWilaya = selectedCompany === "ecotrack_dhd" ? extractWilayaCode(lead.fullAddress || '') : null;
                    const wilayaCode = selectedCompany === "ecotrack_dhd" && wilayaOverrides[i] != null ? wilayaOverrides[i] : detectedWilaya;
                    const wilayaName = wilayaCode ? getWilayaName(wilayaCode) : '';
                    const commune = communeSelections[i] || '';

                    return (
                      <tr
                        key={i}
                        className={`border-b border-border/30 ${
                          isDuplicate ? "bg-red-50" : i % 2 === 0 ? "" : "bg-muted/20"
                        }`}
                      >
                        <td className="px-3 py-2 text-muted-foreground font-mono">{i + 1}</td>
                        {selectedCompany === "sellmax" && (
                          <td className="px-3 py-2 font-mono text-primary">{lead.referenceNumber}</td>
                        )}
                        {selectedCompany === "sellmax" && (
                          <td className="px-3 py-2">
                            {lead.productName && lead.productName.toLowerCase().includes('prostacalm') ? (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">Prostacalm</span>
                            ) : (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold">Testicalm</span>
                            )}
                          </td>
                        )}
                        <td className="px-3 py-2 font-medium">{lead.name || <span className="text-muted-foreground italic">-</span>}</td>
                        <td className="px-3 py-2 font-mono">{lead.primaryPhoneNumber}</td>
                        <td className="px-3 py-2">
                          {selectedCompany === "ecotrack_dhd" ? (
                            wilayaCode ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-bold">
                                {String(wilayaCode).padStart(2, '0')} - {wilayaName}
                              </span>
                            ) : (
                              <span className="text-muted-foreground italic">-</span>
                            )
                          ) : (
                            lead.fullAddress || <span className="text-muted-foreground italic">-</span>
                          )}
                        </td>
                        {selectedCompany === "ecotrack_dhd" && (
                          <td className="px-3 py-2">
                            {commune ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">{commune}</span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-bold">Not set</span>
                            )}
                          </td>
                        )}
                        {(selectedCompany === "ecomamanager" || selectedCompany === "colivraison" || selectedCompany === "ecotrack_dhd") && (
                          <td className="px-3 py-2 text-right font-mono">
                            {(lead.originalPrice || 3800).toLocaleString()}
                            {isUpsell && (
                              <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-purple-100 text-purple-700 font-bold">
                                UPSELL
                              </span>
                            )}
                          </td>
                        )}
                        {selectedCompany === "colivraison" && (
                          <td className="px-3 py-2 text-xs text-muted-foreground max-w-[150px] truncate">{lead.referenceNumber || "-"}</td>
                        )}
                        {selectedCompany === "ecotrack_dhd" && (
                          <td className="px-3 py-2 text-center font-mono text-[10px]">
                            {isUpsell ? "2,1" : "1,1"}
                          </td>
                        )}
                        {selectedCompany === "sellmax" && (
                          <td className="px-3 py-2 text-xs text-muted-foreground max-w-[220px] truncate" title={lead.adSource || ''}>
                            {lead.adSource || <span className="text-muted-foreground/50 italic">-</span>}
                          </td>
                        )}
                        <td className="px-3 py-2 text-center">
                          {isDuplicate ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">DUP</span>
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mx-auto" />
                          )}
                        </td>
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

          {/* Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (selectedCompany === "ecotrack_dhd") {
                    setStep("commune");
                  } else {
                    handleBackToPaste();
                  }
                }}
                className="rounded-lg"
              >
                <ArrowLeft className="mr-1.5 h-3 w-3" />
                {selectedCompany === "ecotrack_dhd" ? "Back to Communes" : "Back to Paste"}
              </Button>
              <Button
                variant="outline"
                onClick={handleReset}
                className="rounded-lg"
              >
                <RotateCcw className="mr-1.5 h-3 w-3" />
                Start Over
              </Button>
            </div>
            <Button
              onClick={handleDownload}
              size="lg"
              className={`rounded-lg text-white ${cc.button}`}
            >
              <Download className="mr-2 h-4 w-4" />
              Download {companyConfig?.name} Excel ({leads.length} leads)
            </Button>
          </div>

          {/* Output format info */}
          <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
            <h3 className="text-xs font-bold text-foreground mb-2">
              Output Format — {companyConfig?.name}
            </h3>
            {selectedCompany === "sellmax" ? (
              <div className="text-xs text-muted-foreground space-y-1">
                <p>29 columns: shopName (SOUKTN), referenceNumber, name, phone (8 digits), fullAddress, city, province, countryCode (TN), zipCode, offerValue (87), offerCurrency (TND), sku (TestiIcalm or Prostcalm — auto-detected from product name), value (87), currency (TND), description, quantity (1), status (NEW), ...</p>
                <p className="text-[10px] text-muted-foreground/70">Sheet name: Sheet1 · Format: .xlsx with shared strings</p>
              </div>
            ) : selectedCompany === "colivraison" ? (
              <div className="text-xs text-muted-foreground space-y-1">
                <p>17 columns: Nom, Tel1 (10 digits), Tel2, Adresse, Commune (.), Wilaya (.), Produit ({selectedProduct?.productLabel}), Variant, Qte (auto from price), Prix, Remarque, Ref, Fragile, Testable, SKU, Weight, Exchange</p>
                <p className="text-[10px] text-muted-foreground/70">Sheet name: Colivraison Template · Format: .xlsx · Filename: Colivraison_DATE_TIME.xlsx</p>
              </div>
            ) : selectedCompany === "ecotrack_dhd" ? (
              <div className="text-xs text-muted-foreground space-y-1">
                <p>18 columns: reference commande, nom*, telephone*, telephone 2, code wilaya*, wilaya de livraison, commune de livraison*, adresse de livraison*, produit (TES,SAV), quantité (1,1 or 2,1), poids, montant du colis*, remarque, FRAGILE, ESSAYAGE, ECHANGE, STOP DESK, Lien map</p>
                <p className="text-[10px] text-muted-foreground/70">Sheet name: Sheet1 · Format: .xlsx · Filename: EcotrackDHD_DATE_TIME.xlsx</p>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground space-y-1">
                <p>14 columns: Client*, Téléphone* (10 digits), Téléphone 2, Wilaya*, Commune, Adresse, Remarque, Produit (SKU)* (TES), Quantité* (1 or 2), Prix unitaire (3800), Frais de livraison, Réduction (1800 if upsell), Référent, Stop desk</p>
                <p className="text-[10px] text-muted-foreground/70">Sheet name: Commandes · Format: .xlsx with shared strings</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ POST-UPLOAD REMINDER BANNER ============ */}
      {showReminder && (
        <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom-4 duration-500">
          <div className="mx-auto max-w-2xl px-4 pb-4">
            <div className="relative rounded-xl border-2 border-amber-300 bg-amber-50 shadow-lg shadow-amber-200/40 p-4">
              {/* Dismiss button */}
              <button
                onClick={() => setShowReminder(false)}
                className="absolute top-2 right-2 rounded-lg p-1 hover:bg-amber-200/50 transition-colors"
                title="Dismiss reminder"
              >
                <X className="h-4 w-4 text-amber-600" />
              </button>

              <div className="flex items-start gap-3">
                {/* Bell icon with pulse */}
                <div className="relative mt-0.5">
                  <div className="h-10 w-10 rounded-full bg-amber-200 flex items-center justify-center">
                    <BellRing className="h-5 w-5 text-amber-700" />
                  </div>
                  <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-amber-900">
                    Don't forget to upload the file on {reminderPartner}!
                  </h4>
                  <p className="text-xs text-amber-700 mt-1">
                    You just downloaded <span className="font-bold">{reminderLeadCount} leads</span> for {reminderPartner}.
                    Go to the {reminderPartner} platform and upload the Excel file to complete the process.
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <Button
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs h-8"
                      onClick={() => {
                        if (lastHistoryId) {
                          validateMutation.mutate(
                            { historyId: lastHistoryId, validationStatus: 'validated' },
                            {
                              onSuccess: () => {
                                toast.success('Upload confirmed & validated in History');
                              },
                              onError: () => {
                                toast.error('Upload confirmed but failed to validate in History');
                              },
                            }
                          );
                        }
                        setShowReminder(false);
                      }}
                      disabled={validateMutation.isPending}
                    >
                      <CheckCircle2 className="mr-1.5 h-3 w-3" />
                      {validateMutation.isPending ? 'Confirming...' : 'Done, I uploaded it'}
                    </Button>
                    <span className="text-[10px] text-amber-500 font-medium">This reminder will stay until you confirm</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
