/**
 * SheetInput — Clean light theme entry screen
 * White card on light gray background, blue accents
 */

import { motion } from 'framer-motion';
import { Plus, Trash2, Loader2, FileSpreadsheet, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SheetEntry } from '@/hooks/useDashboard';

interface SheetInputProps {
  sheets: SheetEntry[];
  loading: boolean;
  progress: string;
  error: string | null;
  onAddSheet: () => void;
  onRemoveSheet: (id: string) => void;
  onUpdateUrl: (id: string, url: string) => void;
  onLoadData: () => void;
  countryLabel?: string;
}

export default function SheetInput({
  sheets,
  loading,
  progress,
  error,
  onAddSheet,
  onRemoveSheet,
  onUpdateUrl,
  onLoadData,
  countryLabel,
}: SheetInputProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      {/* Subtle pattern */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
        backgroundSize: '24px 24px',
      }} />

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-lg px-4"
      >
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <Zap className="h-7 w-7 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2">
            {countryLabel ? `${countryLabel} Dashboard` : 'Confirmation Dashboard'}
          </h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
            Paste your confirmateurs' Google Sheet links below. Each agent should have their own sheet with the standard template (Week 1-4 tabs).
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-card border border-border/60 card-shadow p-6">
          {/* Sheet URL Inputs */}
          <div className="space-y-3 mb-4">
            {sheets.map((sheet, index) => (
              <motion.div
                key={sheet.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="flex items-center gap-2"
              >
                <div className="flex-1 relative">
                  <FileSpreadsheet className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                  <input
                    type="url"
                    value={sheet.url}
                    onChange={e => onUpdateUrl(sheet.id, e.target.value)}
                    placeholder={`Agent ${index + 1} — Paste Google Sheet URL`}
                    className="w-full rounded-xl border border-border bg-secondary/50 pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 focus:bg-card transition-all"
                    disabled={loading}
                  />
                </div>
                {sheets.length > 1 && (
                  <button
                    onClick={() => onRemoveSheet(sheet.id)}
                    disabled={loading}
                    className="rounded-xl p-3 border border-border hover:bg-coral-light hover:border-coral/20 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </button>
                )}
              </motion.div>
            ))}
          </div>

          {/* Add More Button */}
          <button
            onClick={onAddSheet}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors mb-6 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add another agent sheet
          </button>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-xl border border-coral/20 bg-coral-light p-3 mb-4"
            >
              <p className="text-xs text-coral font-medium">{error}</p>
            </motion.div>
          )}

          {/* Load Button */}
          <Button
            onClick={onLoadData}
            disabled={loading}
            className="w-full h-12 text-sm font-semibold rounded-xl shadow-md shadow-primary/20"
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Load Dashboard
              </>
            )}
          </Button>

          {/* Progress */}
          {loading && progress && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-muted-foreground text-center mt-3"
            >
              {progress}
            </motion.p>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-6 rounded-xl bg-card border border-border/40 p-4">
          <h3 className="text-xs font-semibold text-foreground mb-2">How it works</h3>
          <ol className="space-y-1.5 text-xs text-muted-foreground">
            <li className="flex gap-2">
              <span className="font-data font-semibold text-primary">1.</span>
              Make sure each sheet is set to "Anyone with the link can view"
            </li>
            <li className="flex gap-2">
              <span className="font-data font-semibold text-primary">2.</span>
              Paste one Google Sheet URL per confirmateur
            </li>
            <li className="flex gap-2">
              <span className="font-data font-semibold text-primary">3.</span>
              Click "Load Dashboard" to see all agents' performance
            </li>
          </ol>
        </div>
      </motion.div>
    </div>
  );
}
