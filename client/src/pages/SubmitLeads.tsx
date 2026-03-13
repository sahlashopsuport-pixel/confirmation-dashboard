/**
 * Submit Leads — Page Manager Interface (Rima/Soumia)
 *
 * 3-step flow: Select Country → Paste Leads → Review Table → Submit.
 * The review step shows every line in a readable table so page managers
 * can verify all leads were scanned correctly before submitting.
 * Raw text is stored exactly as-is — zero data loss.
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  CheckCircle,
  FileSpreadsheet,
  Globe,
  Clock,
  LogOut,
  Inbox,
  Loader2,
  Trash2,
  Info,
  Eye,
  ArrowLeft,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import CountryFlag from '@/components/CountryFlag';

const COUNTRIES = [
  { value: 'libya', label: 'Libya', flag: '🇱🇾' },
  { value: 'algeria', label: 'Algeria', flag: '🇩🇿' },
  { value: 'viconis', label: 'Viconis', flag: '🇩🇿' },
  { value: 'tunisia', label: 'Tunisia', flag: '🇹🇳' },
] as const;

type Step = 'paste' | 'review' | 'success';

/**
 * Split each line into columns for the review table.
 * We don't parse or transform — just display what was pasted.
 */
function splitLineIntoColumns(line: string): string[] {
  return line.split('\t').map((c) => c.trim());
}

export default function SubmitLeads({ onLogout }: { onLogout?: () => void }) {
  const [country, setCountry] = useState<string>('');
  const [rawText, setRawText] = useState('');
  const [step, setStep] = useState<Step>('paste');
  const [lastResult, setLastResult] = useState<{ lineCount: number; country: string } | null>(null);

  // Parse lines for display
  const lines = useMemo(() => {
    if (!rawText.trim()) return [];
    return rawText.trim().split('\n').filter((l) => l.trim());
  }, [rawText]);

  const lineCount = lines.length;

  // For the review table, split each line into columns
  const reviewRows = useMemo(() => {
    return lines.map((line) => splitLineIntoColumns(line));
  }, [lines]);

  // Detect max columns for table header
  const maxCols = useMemo(() => {
    return reviewRows.reduce((max, row) => Math.max(max, row.length), 0);
  }, [reviewRows]);

  const submitMutation = trpc.inbox.submit.useMutation({
    onSuccess: (data) => {
      setLastResult({ lineCount: data.lineCount, country });
      setStep('success');
      setRawText('');
      toast.success(`${data.lineCount} leads submitted successfully!`);
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to submit leads');
    },
  });

  const { data: submissions, isLoading: loadingHistory } = trpc.inbox.mySubmissions.useQuery(
    undefined,
    { refetchInterval: 30000 }
  );

  const handleReview = () => {
    if (!country) {
      toast.error('Please select a country first');
      return;
    }
    if (lineCount === 0) {
      toast.error('Please paste some leads first');
      return;
    }
    setStep('review');
  };

  const handleSubmit = () => {
    submitMutation.mutate({
      rawText: rawText.trim(),
      country,
    });
  };

  const handleReset = () => {
    setStep('paste');
    setLastResult(null);
    setCountry('');
    setRawText('');
  };

  const handleBackToEdit = () => {
    setStep('paste');
  };

  const selectedCountry = COUNTRIES.find((c) => c.value === country);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-card/95 backdrop-blur-lg shadow-sm">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
              <Inbox className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <h1 className="text-sm font-bold text-foreground">Submit Leads</h1>
            {/* Step indicator */}
            {step !== 'success' && (
              <div className="hidden sm:flex items-center gap-1.5 ml-2">
                <span className={`h-1.5 w-1.5 rounded-full ${step === 'paste' ? 'bg-primary' : 'bg-primary/30'}`} />
                <span className={`h-1.5 w-1.5 rounded-full ${step === 'review' ? 'bg-primary' : 'bg-primary/30'}`} />
              </div>
            )}
          </div>
          {onLogout && (
            <Button variant="outline" size="sm" onClick={onLogout} className="h-8 text-xs">
              <LogOut className="mr-1.5 h-3 w-3" />
              Sign Out
            </Button>
          )}
        </div>
      </header>

      <main className="container py-6 max-w-4xl mx-auto space-y-6">
        <AnimatePresence mode="wait">
          {/* ─── SUCCESS STATE ─── */}
          {step === 'success' && lastResult ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="rounded-xl border border-teal/30 bg-teal-light p-8 text-center"
            >
              <CheckCircle className="h-12 w-12 text-teal mx-auto mb-4" />
              <h2 className="text-lg font-bold text-foreground mb-2">Leads Submitted!</h2>
              <p className="text-sm text-muted-foreground mb-1">
                <span className="font-data font-bold text-teal">{lastResult.lineCount}</span> leads sent to{' '}
                <span className="capitalize font-medium">{lastResult.country}</span> inbox
              </p>
              <p className="text-xs text-muted-foreground mb-6">
                Hadjer will see them in the Assign Leads &rarr; Pages tab
              </p>
              <Button onClick={handleReset} className="bg-primary hover:bg-primary/90">
                Submit More Leads
              </Button>
            </motion.div>
          ) : step === 'review' ? (
            /* ─── REVIEW STEP ─── */
            <motion.div
              key="review"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-5"
            >
              {/* Review header */}
              <div className="rounded-xl border border-border/50 bg-card p-5 card-shadow">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-bold text-foreground">Review Your Leads</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <CountryFlag country={selectedCountry?.value} flag={selectedCountry?.flag} className={selectedCountry?.value === 'viconis' ? 'h-5 w-auto' : 'text-lg'} />
                    <span className="text-xs font-medium text-foreground capitalize">{selectedCountry?.label}</span>
                  </div>
                </div>

                {/* Summary bar */}
                <div className="flex items-center gap-4 p-3 rounded-lg bg-secondary/30 border border-border/20 mb-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-teal" />
                    <span className="text-sm font-bold text-foreground">{lineCount}</span>
                    <span className="text-xs text-muted-foreground">lead{lineCount !== 1 ? 's' : ''} detected</span>
                  </div>
                  <div className="h-4 w-px bg-border" />
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{maxCols} column{maxCols !== 1 ? 's' : ''} per row</span>
                  </div>
                </div>

                {/* Info banner */}
                <div className="flex items-start gap-2 mb-4 p-3 rounded-lg bg-blue-light/50 border border-blue/10">
                  <Info className="h-3.5 w-3.5 text-blue mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Check that all your leads appear below. If something looks wrong,{' '}
                    <span className="font-medium text-foreground">go back and fix the paste</span> before submitting.
                  </p>
                </div>

                {/* Review table */}
                <div className="rounded-lg border border-border/30 overflow-hidden">
                  <div className="max-h-[400px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-secondary/50 sticky top-0 z-10">
                        <tr>
                          <th className="text-left p-2 font-semibold text-muted-foreground w-10">#</th>
                          {Array.from({ length: maxCols }, (_, i) => (
                            <th key={i} className="text-left p-2 font-semibold text-muted-foreground">
                              Col {i + 1}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {reviewRows.map((cols, rowIdx) => (
                          <tr
                            key={rowIdx}
                            className={`border-t border-border/20 ${
                              rowIdx % 2 === 0 ? 'bg-card' : 'bg-secondary/10'
                            }`}
                          >
                            <td className="p-2 text-muted-foreground font-data font-medium">{rowIdx + 1}</td>
                            {Array.from({ length: maxCols }, (_, colIdx) => (
                              <td key={colIdx} className="p-2 font-data">
                                {cols[colIdx] ? (
                                  <span className="text-foreground">{cols[colIdx]}</span>
                                ) : (
                                  <span className="text-muted-foreground/30">—</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Row count footer */}
                {lineCount > 20 && (
                  <p className="text-[10px] text-muted-foreground text-center mt-2">
                    Showing all {lineCount} rows — scroll to review
                  </p>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleBackToEdit}
                  className="flex-1 h-12 text-sm font-medium"
                  size="lg"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Edit
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitMutation.isPending}
                  className="flex-[2] h-12 text-sm font-bold bg-primary hover:bg-primary/90"
                  size="lg"
                >
                  {submitMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Confirm &amp; Submit {lineCount} Lead{lineCount !== 1 ? 's' : ''}
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          ) : (
            /* ─── PASTE STEP ─── */
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-5"
            >
              {/* Step 1: Country */}
              <div className="rounded-xl border border-border/50 bg-card p-5 card-shadow">
                <div className="flex items-center gap-2 mb-4">
                  <Globe className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-bold text-foreground">1. Select Country</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {COUNTRIES.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setCountry(c.value)}
                      className={`rounded-lg border-2 p-3 text-center transition-all ${
                        country === c.value
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border/50 hover:border-primary/30'
                      }`}
                    >
                      <span className="block mb-1"><CountryFlag country={c.value} flag={c.flag} className={c.value === 'viconis' ? 'h-6 w-auto mx-auto' : 'text-2xl'} /></span>
                      <span className="text-xs font-medium text-foreground">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 2: Paste Leads */}
              <div className="rounded-xl border border-border/50 bg-card p-5 card-shadow">
                <div className="flex items-center gap-2 mb-3">
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-bold text-foreground">2. Paste Leads</h2>
                </div>

                {/* Format hint */}
                <div className="flex items-start gap-2 mb-3 p-3 rounded-lg bg-blue-light/50 border border-blue/10">
                  <Info className="h-3.5 w-3.5 text-blue mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Copy leads from your sheet and paste here exactly as they are.{' '}
                    <span className="font-medium text-foreground">
                      Same format Hadjer uses — no changes needed.
                    </span>
                  </p>
                </div>

                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Paste your leads here from Google Sheets..."
                  className="w-full h-48 rounded-lg border border-border/50 bg-background p-3 text-sm font-data placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />

                {/* Line count preview */}
                {rawText.trim() && (
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {lineCount > 0 ? (
                        <>
                          <CheckCircle className="h-3.5 w-3.5 text-teal" />
                          <span className="text-xs text-teal font-medium">
                            {lineCount} line{lineCount !== 1 ? 's' : ''} ready to review
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-3.5 w-3.5 text-amber" />
                          <span className="text-xs text-amber font-medium">No valid lines detected</span>
                        </>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRawText('')}
                      className="h-7 text-xs text-muted-foreground"
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      Clear
                    </Button>
                  </div>
                )}
              </div>

              {/* Review button (goes to review step, not direct submit) */}
              <Button
                onClick={handleReview}
                disabled={!country || lineCount === 0}
                className="w-full h-12 text-sm font-bold bg-primary hover:bg-primary/90"
                size="lg"
              >
                <Eye className="mr-2 h-4 w-4" />
                Review {lineCount > 0 ? `${lineCount} Leads` : 'Leads'}
                {selectedCountry ? ` for ${selectedCountry.label}` : ''}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Submission History */}
        <div className="rounded-xl border border-border/50 bg-card p-5 card-shadow">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-bold text-foreground">Recent Submissions</h2>
          </div>

          {loadingHistory ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !submissions || submissions.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No submissions yet</p>
          ) : (
            <div className="space-y-2">
              {submissions.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/20"
                >
                  <div className="flex items-center gap-3">
                    <CountryFlag country={sub.country} flag={COUNTRIES.find((c) => c.value === sub.country)?.flag} className={sub.country === 'viconis' ? 'h-5 w-auto' : 'text-lg'} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground capitalize">
                          {sub.country}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {sub.lineCount} lead{sub.lineCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground/70">
                        by {sub.submittedBy}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        sub.status === 'pending'
                          ? 'bg-amber-light text-amber border border-amber/20'
                          : 'bg-teal-light text-teal border border-teal/20'
                      }`}
                    >
                      {sub.status}
                    </span>
                    <div className="text-right">
                      <span className="text-[10px] text-muted-foreground font-data block">
                        {new Date(sub.createdAt).toLocaleString()}
                      </span>
                      {sub.status === 'assigned' && sub.assignedAt && (
                        <span className="text-[10px] text-teal font-data block">
                          Assigned: {new Date(sub.assignedAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
