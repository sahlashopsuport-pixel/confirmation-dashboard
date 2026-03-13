/**
 * My Salary — Read-only salary view for page managers (Ryma/Soumia).
 * Shows the current month breakdown + history of past months.
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  DollarSign,
  Truck,
  Video,
  Calendar,
  Gift,
  MinusCircle,
  TrendingUp,
  Banknote,
  Clock,
} from 'lucide-react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WORKING_DAYS = 22;
const GOOD_VIDEO_RATE = 500;
const AVG_VIDEO_RATE = 250;

function formatDA(value: number): string {
  return `${value.toLocaleString('en-US', { useGrouping: false })} DA`;
}

interface SalaryData {
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
  notes: string | null;
}

function calculateTotal(data: SalaryData) {
  const totalDelivered = data.deliveredAlgeria + data.deliveredLibya + data.deliveredViconis + data.deliveredTunisia;
  const deliveryCommission = totalDelivered * data.commissionPerOrder;
  const videoBonus = (data.goodVideos * GOOD_VIDEO_RATE) + (data.avgVideos * AVG_VIDEO_RATE);
  const dailySalary = data.fixedSalary / WORKING_DAYS;
  const absenceDeduction = Math.round(dailySalary * data.absenceDays);
  const total = data.fixedSalary + deliveryCommission + videoBonus - absenceDeduction + data.bonus - data.deduction;
  return {
    totalDelivered,
    deliveryCommission,
    videoBonus,
    dailySalary: Math.round(dailySalary),
    absenceDeduction,
    total: Math.round(total),
  };
}

function SalaryBreakdown({ data, monthLabel }: { data: SalaryData; monthLabel: string }) {
  const calc = calculateTotal(data);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Banknote className="h-4 w-4 text-primary" />
          {monthLabel}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-center">
            <DollarSign className="h-4 w-4 text-blue-600 mx-auto mb-1" />
            <div className="text-lg font-bold text-blue-700 font-mono">{formatDA(data.fixedSalary)}</div>
            <div className="text-[10px] text-blue-600">Fixed Salary</div>
          </div>
          <div className="rounded-lg bg-green-50 border border-green-100 p-3 text-center">
            <Truck className="h-4 w-4 text-green-600 mx-auto mb-1" />
            <div className="text-lg font-bold text-green-700 font-mono">{calc.totalDelivered}</div>
            <div className="text-[10px] text-green-600">Delivered Orders</div>
          </div>
          <div className="rounded-lg bg-purple-50 border border-purple-100 p-3 text-center">
            <Video className="h-4 w-4 text-purple-600 mx-auto mb-1" />
            <div className="text-lg font-bold text-purple-700 font-mono">{data.goodVideos + data.avgVideos}</div>
            <div className="text-[10px] text-purple-600">Videos</div>
          </div>
          <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-center">
            <Calendar className="h-4 w-4 text-amber-600 mx-auto mb-1" />
            <div className="text-lg font-bold text-amber-700 font-mono">{data.absenceDays}</div>
            <div className="text-[10px] text-amber-600">Absences</div>
          </div>
        </div>

        {/* Delivery Breakdown */}
        <div className="rounded-lg bg-gray-50 border border-border/50 p-3">
          <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <Truck className="h-3 w-3" />
            Delivery Breakdown
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Algeria</span>
              <span className="font-mono font-medium">{data.deliveredAlgeria}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Libya</span>
              <span className="font-mono font-medium">{data.deliveredLibya}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Viconis</span>
              <span className="font-mono font-medium">{data.deliveredViconis}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tunisia</span>
              <span className="font-mono font-medium">{data.deliveredTunisia}</span>
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground mt-2">
            {calc.totalDelivered} orders x {data.commissionPerOrder} DA = {formatDA(calc.deliveryCommission)}
          </div>
        </div>

        {/* Video Breakdown */}
        {(data.goodVideos > 0 || data.avgVideos > 0) && (
          <div className="rounded-lg bg-gray-50 border border-border/50 p-3">
            <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
              <Video className="h-3 w-3" />
              Video Testimonials
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Good (500 DA)</span>
                <span className="font-mono font-medium">{data.goodVideos}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Average (250 DA)</span>
                <span className="font-mono font-medium">{data.avgVideos}</span>
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground mt-2">
              Total video bonus: {formatDA(calc.videoBonus)}
            </div>
          </div>
        )}

        {/* Total Summary */}
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Fixed Salary</span>
            <span className="font-mono">{formatDA(data.fixedSalary)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Delivery Commission</span>
            <span className="font-mono text-green-600">+{formatDA(calc.deliveryCommission)}</span>
          </div>
          {calc.videoBonus > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Video Bonus</span>
              <span className="font-mono text-green-600">+{formatDA(calc.videoBonus)}</span>
            </div>
          )}
          {data.absenceDays > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Absence ({data.absenceDays} days)</span>
              <span className="font-mono text-red-500">-{formatDA(calc.absenceDeduction)}</span>
            </div>
          )}
          {data.bonus > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Bonus</span>
              <span className="font-mono text-green-600">+{formatDA(data.bonus)}</span>
            </div>
          )}
          {data.deduction > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Deduction</span>
              <span className="font-mono text-red-500">-{formatDA(data.deduction)}</span>
            </div>
          )}
          <div className="border-t border-primary/20 pt-2 mt-2 flex justify-between text-base font-bold">
            <span>TOTAL PAYMENT</span>
            <span className={calc.total >= 0 ? 'text-primary' : 'text-red-500'}>
              {formatDA(calc.total)}
            </span>
          </div>
        </div>

        {/* Notes */}
        {data.notes && (
          <div className="text-xs text-muted-foreground bg-gray-50 rounded-lg p-2 border border-border/50">
            <span className="font-semibold">Notes:</span> {data.notes}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function MySalary() {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  // Fetch own salary history
  const salaryHistory = trpc.salary.myHistory.useQuery();

  // Find record for selected month
  const currentRecord = salaryHistory.data?.find(
    (r) => r.year === selectedYear && r.month === selectedMonth
  );

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

  if (salaryHistory.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container py-6 space-y-5 max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-lg font-bold text-foreground flex items-center justify-center gap-2">
          <Banknote className="h-5 w-5 text-primary" />
          My Salary
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          View your monthly salary breakdown
        </p>
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

      {/* Current Month Salary */}
      {currentRecord ? (
        <SalaryBreakdown
          data={currentRecord}
          monthLabel={`${MONTHS[selectedMonth - 1]} ${selectedYear}`}
        />
      ) : (
        <Card className="border-border/50">
          <CardContent className="py-12 text-center">
            <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">No salary data for this month</p>
            <p className="text-xs text-muted-foreground mt-1">
              Salary will appear here once the admin fills it in.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Salary History */}
      {salaryHistory.data && salaryHistory.data.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
            Salary History
          </h3>
          <div className="space-y-2">
            {salaryHistory.data.map((record) => {
              const calc = calculateTotal(record);
              const isSelected = record.year === selectedYear && record.month === selectedMonth;
              return (
                <button
                  key={`${record.year}-${record.month}`}
                  onClick={() => {
                    setSelectedYear(record.year);
                    setSelectedMonth(record.month);
                  }}
                  className={`w-full text-left rounded-lg border p-3 transition-all ${
                    isSelected
                      ? 'border-primary/30 bg-primary/5'
                      : 'border-border/50 bg-card hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-semibold text-foreground">
                        {MONTHS[record.month - 1]} {record.year}
                      </span>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {calc.totalDelivered} deliveries · {record.goodVideos + record.avgVideos} videos · {record.absenceDays} absences
                      </div>
                    </div>
                    <span className="text-sm font-bold font-mono text-primary">
                      {formatDA(calc.total)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
