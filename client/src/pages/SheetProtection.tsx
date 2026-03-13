/**
 * Sheet Protection Page — Manage Google Sheet permissions for agents
 *
 * Locked columns: A (Date), D (Delivery), F (SKU), M (Reference)
 * Editable columns: B (Status), C (Qty), E (Notes), G (Product), H (Name), I (Phone), J-K (Address), L (Price)
 * Agents cannot delete or move rows. They can add rows at the bottom.
 * Manager emails bypass all restrictions.
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Shield,
  ShieldOff,
  Loader2,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  Lock,
  Unlock,
  Mail,
  Users,
  AlertTriangle,
  Info,
} from "lucide-react";
import CountryFlag from "@/components/CountryFlag";
import { DASHBOARDS, type DashboardSlug } from "@/App";

// Default manager emails that always bypass protection
const DEFAULT_MANAGER_EMAILS = [
  "akoussama11@gmail.com",
  "kada.hadjerkd@gmail.com",
  "sahlashopsuport@gmail.com",
  "shimadagenji257@gmail.com",
];

export default function SheetProtection() {
  const [selectedCountry, setSelectedCountry] = useState<DashboardSlug>("algeria");
  const [managerEmails, setManagerEmails] = useState<string[]>([...DEFAULT_MANAGER_EMAILS]);
  const [newEmail, setNewEmail] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<Set<number>>(new Set());
  const [isApplying, setIsApplying] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  // Fetch agents for selected country
  const agentsQuery = trpc.sheets.list.useQuery();
  const applyProtection = trpc.sheets.applySheetProtection.useMutation();
  const removeProtection = trpc.sheets.removeSheetProtection.useMutation();

  // Filter agents by country
  const agents = useMemo(() => {
    if (!agentsQuery.data) return [];
    return agentsQuery.data.filter((a: any) => a.country === selectedCountry);
  }, [agentsQuery.data, selectedCountry]);

  const allSelected = agents.length > 0 && selectedAgents.size === agents.length;

  const toggleAgent = (id: number) => {
    setSelectedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedAgents(new Set());
    } else {
      setSelectedAgents(new Set(agents.map((a: any) => a.id)));
    }
  };

  const addEmail = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    if (!email.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (managerEmails.includes(email)) {
      toast.error("Email already in the list");
      return;
    }
    setManagerEmails((prev) => [...prev, email]);
    setNewEmail("");
  };

  const removeEmail = (email: string) => {
    // Don't allow removing default emails
    if (DEFAULT_MANAGER_EMAILS.includes(email)) {
      toast.error("Cannot remove default manager emails");
      return;
    }
    setManagerEmails((prev) => prev.filter((e) => e !== email));
  };

  const handleApplyProtection = async () => {
    if (selectedAgents.size === 0) {
      toast.error("Select at least one agent");
      return;
    }
    setIsApplying(true);
    try {
      const result = await applyProtection.mutateAsync({
        agentIds: Array.from(selectedAgents),
        managerEmails,
      });
      toast.success(
        `Protection applied to ${result.spreadsheetsProcessed} spreadsheet(s)`,
        { description: `${result.totalProtected} tab(s) protected` }
      );
    } catch (err: any) {
      toast.error("Failed to apply protection", {
        description: err.message,
      });
    } finally {
      setIsApplying(false);
    }
  };

  const handleRemoveProtection = async () => {
    if (selectedAgents.size === 0) {
      toast.error("Select at least one agent");
      return;
    }
    setIsRemoving(true);
    try {
      const result = await removeProtection.mutateAsync({
        agentIds: Array.from(selectedAgents),
      });
      toast.success(
        `Protection removed from ${result.spreadsheetsProcessed} spreadsheet(s)`,
        { description: `${result.totalRemoved} protection(s) removed` }
      );
    } catch (err: any) {
      toast.error("Failed to remove protection", {
        description: err.message,
      });
    } finally {
      setIsRemoving(false);
    }
  };

  // Reset selection when country changes
  const handleCountryChange = (country: DashboardSlug) => {
    setSelectedCountry(country);
    setSelectedAgents(new Set());
  };

  return (
    <div className="container py-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-600" />
          Sheet Protection
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Lock agent spreadsheets to prevent accidental deletion of leads
        </p>
      </div>

      {/* Info box */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 mb-6">
        <div className="flex items-start gap-3">
          <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-xs text-blue-800 space-y-1.5">
            <p className="font-semibold">When protection is applied:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <p className="font-medium flex items-center gap-1">
                  <Lock className="h-3 w-3" /> Locked (read-only):
                </p>
                <p className="text-blue-700">Date, Delivery mark, SKU, Reference</p>
              </div>
              <div>
                <p className="font-medium flex items-center gap-1">
                  <Unlock className="h-3 w-3" /> Editable by agents:
                </p>
                <p className="text-blue-700">Status, Qty, Notes, Product, Name, Phone, Address, Price</p>
              </div>
            </div>
            <p className="text-blue-700 mt-1">
              Agents <strong>cannot delete or move rows</strong>. They <strong>can add new rows</strong> at the bottom.
              Manager emails bypass all restrictions.
            </p>
          </div>
        </div>
      </div>

      {/* Manager Emails Section */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 mb-6">
        <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-3">
          <Mail className="h-4 w-4 text-gray-500" />
          Manager Emails (bypass all protection)
        </h2>
        <div className="space-y-2 mb-3">
          {managerEmails.map((email) => (
            <div
              key={email}
              className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 border border-gray-100"
            >
              <span className="text-xs font-medium text-gray-700">{email}</span>
              {DEFAULT_MANAGER_EMAILS.includes(email) ? (
                <span className="text-[10px] text-gray-400 font-medium">Default</span>
              ) : (
                <button
                  onClick={() => removeEmail(email)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addEmail()}
            placeholder="Add manager email..."
            className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={addEmail}
            className="h-9 text-xs"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        </div>
      </div>

      {/* Country Selection */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 mb-6">
        <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-gray-500" />
          Select Agents
        </h2>

        {/* Country tabs */}
        <div className="flex gap-1 mb-4 pb-3 border-b border-gray-100">
          {DASHBOARDS.map((dash) => (
            <button
              key={dash.slug}
              onClick={() => handleCountryChange(dash.slug)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                selectedCountry === dash.slug
                  ? `${dash.accent} bg-gray-100`
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              <CountryFlag country={dash.slug} flag={dash.flag} className={dash.slug === 'viconis' ? 'h-4 w-auto' : 'text-sm'} />
              {dash.label}
            </button>
          ))}
        </div>

        {/* Agent list */}
        {agentsQuery.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400">
            No agents found for this country
          </div>
        ) : (
          <>
            {/* Select all */}
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={toggleAll}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                {allSelected ? "Deselect All" : `Select All (${agents.length})`}
              </button>
              <span className="text-xs text-gray-400">
                {selectedAgents.size} selected
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {agents.map((agent: any) => {
                const isSelected = selectedAgents.has(agent.id);
                return (
                  <button
                    key={agent.id}
                    onClick={() => toggleAgent(agent.id)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-all ${
                      isSelected
                        ? "border-blue-400 bg-blue-50 text-blue-700"
                        : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300 hover:bg-gray-100"
                    }`}
                  >
                    <div
                      className={`h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 ${
                        isSelected
                          ? "border-blue-500 bg-blue-500"
                          : "border-gray-300"
                      }`}
                    >
                      {isSelected && (
                        <CheckCircle2 className="h-3 w-3 text-white" />
                      )}
                    </div>
                    <span className="text-xs font-medium truncate">
                      {agent.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button
          onClick={handleApplyProtection}
          disabled={isApplying || isRemoving || selectedAgents.size === 0}
          className="flex-1 h-11 bg-blue-600 hover:bg-blue-700 text-white"
        >
          {isApplying ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Shield className="h-4 w-4 mr-2" />
          )}
          Apply Protection ({selectedAgents.size})
        </Button>
        <Button
          variant="outline"
          onClick={handleRemoveProtection}
          disabled={isApplying || isRemoving || selectedAgents.size === 0}
          className="flex-1 h-11 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
        >
          {isRemoving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <ShieldOff className="h-4 w-4 mr-2" />
          )}
          Remove Protection ({selectedAgents.size})
        </Button>
      </div>

      {/* Warning */}
      <div className="mt-4 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Important:</p>
          <p>
            The service account must be an <strong>editor</strong> on each spreadsheet for protection to work.
            If protection fails for a sheet, make sure the service account email has edit access.
          </p>
        </div>
      </div>
    </div>
  );
}
