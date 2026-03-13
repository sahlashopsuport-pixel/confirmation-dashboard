/**
 * Salary Admin Page — Super Admin fills in salary data for page managers (Ryma & Soumia)
 * One page per month: select month, fill in both employees, save.
 */

import { useState, useMemo, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Loader2,
  DollarSign,
  Truck,
  Video,
  Calendar,
  Gift,
  MinusCircle,
  User,
  Calculator,
} from 'lucide-react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WORKING_DAYS = 22;
const GOOD_VIDEO_RATE = 500;
const AVG_VIDEO_RATE = 250;

interface SalaryFormData {
  fixedSalary: number;
  deliveredAlgeria: number;
  deliveredLibya: number;
  deliveredViconis: number;
  deliveredTunisia: number;
  commissionPerOrder: number;
  goodVideos: number;
  avgVideos: number;
  absenceDays: number;
  bonus: number;
  deduction: number;
  notes: string;
}

const defaultForm: SalaryFormData = {
  fixedSalary: 0,
  deliveredAlgeria: 0,
  deliveredLibya: 0,
  deliveredViconis: 0,
  deliveredTunisia: 0,
  commissionPerOrder: 100,
  goodVideos: 0,
  avgVideos: 0,
  absenceDays: 0,
  bonus: 0,
  deduction: 0,
  notes: '',
};

function calculateTotal(form: SalaryFormData) {
  const totalDelivered = form.deliveredAlgeria + form.deliveredLibya + form.deliveredViconis + form.deliveredTunisia;
  const deliveryCommission = totalDelivered * form.commissionPerOrder;
  const videoBonus = (form.goodVideos * GOOD_VIDEO_RATE) + (form.avgVideos * AVG_VIDEO_RATE);
  const dailySalary = form.fixedSalary / WORKING_DAYS;
  const absenceDeduction = Math.round(dailySalary * form.absenceDays);
  const total = form.fixedSalary + deliveryCommission + videoBonus - absenceDeduction + form.bonus - form.deduction;
  return {
    totalDelivered,
    deliveryCommission,
    videoBonus,
    dailySalary: Math.round(dailySalary),
    absenceDeduction,
    total: Math.round(total),
  };
}

function formatDA(value: number): string {
  return `${value.toLocaleString('en-US', { useGrouping: false })} DA`;
}

function EmployeeForm({
  username,
  form,
  onChange,
  onSave,
  saving,
  hasExisting,
}: {
  username: string;
  form: SalaryFormData;
  onChange: (field: keyof SalaryFormData, value: number | string) => void;
  onSave: () => void;
  saving: boolean;
  hasExisting: boolean;
}) {
  const calc = calculateTotal(form);
  const displayName = username.charAt(0).toUpperCase() + username.slice(1);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-4 w-4 text-primary" />
          </div>
          {displayName}
          {hasExisting && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
              Saved
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Fixed Salary */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <DollarSign className="h-3 w-3" />
            Fixed Salary (DA)
          </Label>
          <Input
            type="number"
            min={0}
            value={form.fixedSalary || ''}
            onChange={(e) => onChange('fixedSalary', Number(e.target.value) || 0)}
            placeholder="e.g. 35000"
            className="font-mono text-sm"
          />
        </div>

        {/* Commission Per Order */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <Calculator className="h-3 w-3" />
            Commission Per Delivered Order (DA)
          </Label>
          <Input
            type="number"
            min={0}
            value={form.commissionPerOrder || ''}
            onChange={(e) => onChange('commissionPerOrder', Number(e.target.value) || 0)}
            placeholder="100"
            className="font-mono text-sm"
          />
        </div>

        {/* Delivered Orders */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <Truck className="h-3 w-3" />
            Delivered Orders
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] text-muted-foreground">Algeria</span>
              <Input
                type="number"
                min={0}
                value={form.deliveredAlgeria || ''}
                onChange={(e) => onChange('deliveredAlgeria', Number(e.target.value) || 0)}
                placeholder="0"
                className="font-mono text-sm"
              />
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground">Libya</span>
              <Input
                type="number"
                min={0}
                value={form.deliveredLibya || ''}
                onChange={(e) => onChange('deliveredLibya', Number(e.target.value) || 0)}
                placeholder="0"
                className="font-mono text-sm"
              />
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground">Viconis</span>
              <Input
                type="number"
                min={0}
                value={form.deliveredViconis || ''}
                onChange={(e) => onChange('deliveredViconis', Number(e.target.value) || 0)}
                placeholder="0"
                className="font-mono text-sm"
              />
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground">Tunisia</span>
              <Input
                type="number"
                min={0}
                value={form.deliveredTunisia || ''}
                onChange={(e) => onChange('deliveredTunisia', Number(e.target.value) || 0)}
                placeholder="0"
                className="font-mono text-sm"
              />
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            Total: {calc.totalDelivered} orders = {formatDA(calc.deliveryCommission)} commission
          </div>
        </div>

        {/* Video Testimonials */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <Video className="h-3 w-3" />
            Video Testimonials
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] text-muted-foreground">Good (500 DA each)</span>
              <Input
                type="number"
                min={0}
                value={form.goodVideos || ''}
                onChange={(e) => onChange('goodVideos', Number(e.target.value) || 0)}
                placeholder="0"
                className="font-mono text-sm"
              />
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground">Average (250 DA each)</span>
              <Input
                type="number"
                min={0}
                value={form.avgVideos || ''}
                onChange={(e) => onChange('avgVideos', Number(e.target.value) || 0)}
                placeholder="0"
                className="font-mono text-sm"
              />
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            Video bonus: {formatDA(calc.videoBonus)}
          </div>
        </div>

        {/* Absences */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <Calendar className="h-3 w-3" />
            Absences
          </Label>
          <Input
            type="number"
            min={0}
            max={WORKING_DAYS}
            value={form.absenceDays || ''}
            onChange={(e) => onChange('absenceDays', Number(e.target.value) || 0)}
            placeholder="0"
            className="font-mono text-sm"
          />
          <div className="text-[10px] text-muted-foreground">
            Daily rate: {formatDA(calc.dailySalary)} (salary / {WORKING_DAYS} days) — Deduction: {formatDA(calc.absenceDeduction)}
          </div>
        </div>

        {/* Bonus & Deduction */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Gift className="h-3 w-3" />
              Bonus (DA)
            </Label>
            <Input
              type="number"
              min={0}
              value={form.bonus || ''}
              onChange={(e) => onChange('bonus', Number(e.target.value) || 0)}
              placeholder="0"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <MinusCircle className="h-3 w-3" />
              Deduction (DA)
            </Label>
            <Input
              type="number"
              min={0}
              value={form.deduction || ''}
              onChange={(e) => onChange('deduction', Number(e.target.value) || 0)}
              placeholder="0"
              className="font-mono text-sm"
            />
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground">Notes</Label>
          <Textarea
            value={form.notes}
            onChange={(e) => onChange('notes', e.target.value)}
            placeholder="Optional notes..."
            className="text-sm min-h-[60px]"
          />
        </div>

        {/* Total Summary */}
        <div className="rounded-lg bg-gray-50 border border-border/50 p-3 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Fixed Salary</span>
            <span className="font-mono">{formatDA(form.fixedSalary)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Delivery Commission ({calc.totalDelivered} x {form.commissionPerOrder})</span>
            <span className="font-mono text-green-600">+{formatDA(calc.deliveryCommission)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Video Bonus ({form.goodVideos}x500 + {form.avgVideos}x250)</span>
            <span className="font-mono text-green-600">+{formatDA(calc.videoBonus)}</span>
          </div>
          {form.absenceDays > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Absence ({form.absenceDays} days x {formatDA(calc.dailySalary)})</span>
              <span className="font-mono text-red-500">-{formatDA(calc.absenceDeduction)}</span>
            </div>
          )}
          {form.bonus > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Bonus</span>
              <span className="font-mono text-green-600">+{formatDA(form.bonus)}</span>
            </div>
          )}
          {form.deduction > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Deduction</span>
              <span className="font-mono text-red-500">-{formatDA(form.deduction)}</span>
            </div>
          )}
          <div className="border-t border-border/50 pt-1.5 mt-1.5 flex justify-between text-sm font-bold">
            <span>TOTAL PAYMENT</span>
            <span className={calc.total >= 0 ? 'text-primary' : 'text-red-500'}>
              {formatDA(calc.total)}
            </span>
          </div>
        </div>

        <Button
          onClick={onSave}
          disabled={saving}
          className="w-full"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {hasExisting ? 'Update Salary' : 'Save Salary'}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function SalaryAdmin() {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  // Fetch page managers
  const pageManagers = trpc.salary.getPageManagers.useQuery();

  // Fetch existing records for selected month
  const [queryKey] = useState(() => ({ year: selectedYear, month: selectedMonth }));
  const monthRecords = trpc.salary.getMonthRecords.useQuery(
    { year: selectedYear, month: selectedMonth },
    { enabled: !!pageManagers.data }
  );

  // Form state for each employee
  const [forms, setForms] = useState<Record<number, SalaryFormData>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  // Initialize forms when data loads
  const initForms = useCallback(() => {
    if (!pageManagers.data || !monthRecords.data) return;
    const newForms: Record<number, SalaryFormData> = {};
    for (const pm of pageManagers.data) {
      const existing = monthRecords.data.find((r) => r.userId === pm.id);
      if (existing) {
        newForms[pm.id] = {
          fixedSalary: existing.fixedSalary,
          deliveredAlgeria: existing.deliveredAlgeria,
          deliveredLibya: existing.deliveredLibya,
          deliveredViconis: existing.deliveredViconis,
          deliveredTunisia: existing.deliveredTunisia,
          commissionPerOrder: existing.commissionPerOrder,
          goodVideos: existing.goodVideos,
          avgVideos: existing.avgVideos,
          absenceDays: existing.absenceDays,
          bonus: existing.bonus,
          deduction: existing.deduction,
          notes: existing.notes || '',
        };
      } else {
        newForms[pm.id] = { ...defaultForm };
      }
    }
    setForms(newForms);
  }, [pageManagers.data, monthRecords.data]);

  // Re-init when month records change
  useMemo(() => {
    initForms();
  }, [initForms]);

  const upsertMutation = trpc.salary.upsert.useMutation({
    onSuccess: () => {
      monthRecords.refetch();
    },
  });

  const handleFieldChange = (userId: number, field: keyof SalaryFormData, value: number | string) => {
    setForms((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] || { ...defaultForm }),
        [field]: value,
      },
    }));
  };

  const handleSave = async (userId: number, username: string) => {
    const form = forms[userId];
    if (!form) return;
    setSavingId(userId);
    try {
      await upsertMutation.mutateAsync({
        userId,
        username,
        year: selectedYear,
        month: selectedMonth,
        fixedSalary: form.fixedSalary,
        deliveredAlgeria: form.deliveredAlgeria,
        deliveredLibya: form.deliveredLibya,
        deliveredViconis: form.deliveredViconis,
        deliveredTunisia: form.deliveredTunisia,
        commissionPerOrder: form.commissionPerOrder,
        goodVideos: form.goodVideos,
        avgVideos: form.avgVideos,
        absenceDays: form.absenceDays,
        bonus: form.bonus,
        deduction: form.deduction,
        notes: form.notes || undefined,
      });
      toast.success(`Salary saved for ${username.charAt(0).toUpperCase() + username.slice(1)}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save salary');
    } finally {
      setSavingId(null);
    }
  };

  const goToPrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  return (
    <div className="container py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Salary Management
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Fill in monthly salary data for page managers
          </p>
        </div>
      </div>

      {/* Month Selector */}
      <div className="flex items-center justify-center gap-3">
        <Button variant="outline" size="sm" onClick={goToPrevMonth} className="h-8 w-8 p-0">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-sm font-bold text-foreground min-w-[160px] text-center">
          {MONTHS[selectedMonth - 1]} {selectedYear}
        </div>
        <Button variant="outline" size="sm" onClick={goToNextMonth} className="h-8 w-8 p-0">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Loading */}
      {(pageManagers.isLoading || monthRecords.isLoading) && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Employee Forms — side by side */}
      {pageManagers.data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {pageManagers.data.map((pm) => (
            <EmployeeForm
              key={pm.id}
              username={pm.username}
              form={forms[pm.id] || { ...defaultForm }}
              onChange={(field, value) => handleFieldChange(pm.id, field, value)}
              onSave={() => handleSave(pm.id, pm.username)}
              saving={savingId === pm.id}
              hasExisting={!!monthRecords.data?.find((r) => r.userId === pm.id)}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {pageManagers.data && pageManagers.data.length === 0 && (
        <div className="text-center py-12">
          <User className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No page managers found in the system.</p>
        </div>
      )}
    </div>
  );
}
