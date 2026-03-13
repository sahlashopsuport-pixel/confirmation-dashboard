/**
 * DateRangePicker — Full date range picker with presets and dual calendar
 * 
 * Features:
 * - Quick presets sidebar (Today, Yesterday, Last 7/14/30 days, etc.)
 * - Dual month calendar view
 * - Click to select start/end dates
 * - Range highlighting between selected dates
 * - Update/Cancel buttons
 * - Popover-style dropdown from trigger button
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';

export interface DateRange {
  from: string; // dd/mm/yyyy
  to: string;   // dd/mm/yyyy
  label: string; // e.g. "Last 7 days", "21/02/2026"
}

interface DateRangePickerProps {
  availableDates: string[]; // dd/mm/yyyy sorted newest first
  value: DateRange | null;  // null = "All Dates" / Maximum
  onChange: (range: DateRange | null) => void;
}

// Parse dd/mm/yyyy to Date object
function parseDate(str: string): Date {
  const parts = str.split('/');
  if (parts.length === 3) {
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  return new Date(str);
}

// Format Date to dd/mm/yyyy
function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// Format Date to short display: "21 Feb 2026"
function formatShort(d: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// Get month name
function getMonthName(month: number): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return months[month];
}

// Get short month name
function getMonthShort(month: number): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[month];
}

// Get days in month
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// Get day of week for first day of month (0 = Sunday)
function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

// Check if two dates are the same day
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Check if date is between two dates (inclusive)
function isBetween(date: Date, from: Date, to: Date): boolean {
  const t = date.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

interface PresetOption {
  label: string;
  getRange: (today: Date) => { from: Date; to: Date };
}

function getPresets(today: Date): PresetOption[] {
  return [
    {
      label: 'Today',
      getRange: (t) => ({ from: t, to: t }),
    },
    {
      label: 'Yesterday',
      getRange: (t) => {
        const y = new Date(t);
        y.setDate(y.getDate() - 1);
        return { from: y, to: y };
      },
    },
    {
      label: 'Today + Yesterday',
      getRange: (t) => {
        const y = new Date(t);
        y.setDate(y.getDate() - 1);
        return { from: y, to: t };
      },
    },
    {
      label: 'Last 7 days',
      getRange: (t) => {
        const from = new Date(t);
        from.setDate(from.getDate() - 6);
        return { from, to: t };
      },
    },
    {
      label: 'Last 14 days',
      getRange: (t) => {
        const from = new Date(t);
        from.setDate(from.getDate() - 13);
        return { from, to: t };
      },
    },
    {
      label: 'Last 30 days',
      getRange: (t) => {
        const from = new Date(t);
        from.setDate(from.getDate() - 29);
        return { from, to: t };
      },
    },
    {
      label: 'This week',
      getRange: (t) => {
        const day = t.getDay();
        const from = new Date(t);
        from.setDate(from.getDate() - (day === 0 ? 6 : day - 1)); // Monday start
        return { from, to: t };
      },
    },
    {
      label: 'Last week',
      getRange: (t) => {
        const day = t.getDay();
        const thisMonday = new Date(t);
        thisMonday.setDate(thisMonday.getDate() - (day === 0 ? 6 : day - 1));
        const lastMonday = new Date(thisMonday);
        lastMonday.setDate(lastMonday.getDate() - 7);
        const lastSunday = new Date(lastMonday);
        lastSunday.setDate(lastSunday.getDate() + 6);
        return { from: lastMonday, to: lastSunday };
      },
    },
    {
      label: 'This month',
      getRange: (t) => {
        const from = new Date(t.getFullYear(), t.getMonth(), 1);
        return { from, to: t };
      },
    },
    {
      label: 'Last month',
      getRange: (t) => {
        const from = new Date(t.getFullYear(), t.getMonth() - 1, 1);
        const to = new Date(t.getFullYear(), t.getMonth(), 0);
        return { from, to };
      },
    },
  ];
}

// Calendar month component
function CalendarMonth({
  year,
  month,
  selectedFrom,
  selectedTo,
  hoverDate,
  availableDateSet,
  onDateClick,
  onDateHover,
}: {
  year: number;
  month: number;
  selectedFrom: Date | null;
  selectedTo: Date | null;
  hoverDate: Date | null;
  availableDateSet: Set<string>;
  onDateClick: (d: Date) => void;
  onDateHover: (d: Date | null) => void;
}) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  // Determine effective "to" for range highlighting (use hover if selecting)
  const effectiveTo = selectedFrom && !selectedTo && hoverDate ? hoverDate : selectedTo;

  return (
    <div className="w-[280px]">
      <div className="text-center font-semibold text-sm text-foreground mb-3">
        {getMonthName(month)} {year}
      </div>
      <div className="grid grid-cols-7 gap-0">
        {dayNames.map(d => (
          <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground pb-2">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="h-8" />;
          }

          const date = new Date(year, month, day);
          const dateStr = formatDate(date);
          const hasData = availableDateSet.has(dateStr);
          const isFrom = selectedFrom && isSameDay(date, selectedFrom);
          const isTo = effectiveTo && isSameDay(date, effectiveTo);
          const isInRange = selectedFrom && effectiveTo
            ? isBetween(date, 
                selectedFrom.getTime() <= effectiveTo.getTime() ? selectedFrom : effectiveTo,
                selectedFrom.getTime() <= effectiveTo.getTime() ? effectiveTo : selectedFrom)
            : false;
          const isToday = isSameDay(date, new Date());

          return (
            <button
              key={day}
              onClick={() => onDateClick(date)}
              onMouseEnter={() => onDateHover(date)}
              onMouseLeave={() => onDateHover(null)}
              className={`
                h-8 text-xs font-medium relative transition-all rounded-md
                ${isFrom || isTo
                  ? 'bg-primary text-primary-foreground font-bold z-10'
                  : isInRange
                  ? 'bg-primary/15 text-primary font-semibold'
                  : hasData
                  ? 'text-foreground hover:bg-primary/10'
                  : 'text-muted-foreground/40'
                }
                ${isToday && !isFrom && !isTo ? 'ring-1 ring-primary/50' : ''}
              `}
            >
              {day}
              {hasData && !isFrom && !isTo && !isInRange && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary/40" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DateRangePicker({ availableDates, value, onChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFrom, setSelectedFrom] = useState<Date | null>(null);
  const [selectedTo, setSelectedTo] = useState<Date | null>(null);
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Calendar navigation: show two months, default to current month and previous
  const today = useMemo(() => new Date(), []);
  const [rightMonth, setRightMonth] = useState(today.getMonth());
  const [rightYear, setRightYear] = useState(today.getFullYear());

  const leftMonth = rightMonth === 0 ? 11 : rightMonth - 1;
  const leftYear = rightMonth === 0 ? rightYear - 1 : rightYear;

  // Build set of available dates for quick lookup
  const availableDateSet = useMemo(() => new Set(availableDates), [availableDates]);

  // Presets
  const presets = useMemo(() => getPresets(today), [today]);

  // Sync internal state when value changes externally
  useEffect(() => {
    if (value) {
      setSelectedFrom(parseDate(value.from));
      setSelectedTo(parseDate(value.to));
      setActivePreset(value.label);
    } else {
      setSelectedFrom(null);
      setSelectedTo(null);
      setActivePreset(null);
    }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const handleDateClick = useCallback((date: Date) => {
    if (!selectedFrom || (selectedFrom && selectedTo)) {
      // Start new selection
      setSelectedFrom(date);
      setSelectedTo(null);
      setActivePreset(null);
    } else {
      // Complete the range
      if (date.getTime() < selectedFrom.getTime()) {
        setSelectedTo(selectedFrom);
        setSelectedFrom(date);
      } else {
        setSelectedTo(date);
      }
      setActivePreset(null);
    }
  }, [selectedFrom, selectedTo]);

  const handlePresetClick = useCallback((preset: PresetOption) => {
    const { from, to } = preset.getRange(today);
    setSelectedFrom(from);
    setSelectedTo(to);
    setActivePreset(preset.label);
    // Navigate calendar to show the range
    setRightMonth(to.getMonth());
    setRightYear(to.getFullYear());
  }, [today]);

  const handleUpdate = useCallback(() => {
    if (selectedFrom && selectedTo) {
      onChange({
        from: formatDate(selectedFrom),
        to: formatDate(selectedTo),
        label: activePreset || `${formatShort(selectedFrom)} - ${formatShort(selectedTo)}`,
      });
    } else if (selectedFrom) {
      onChange({
        from: formatDate(selectedFrom),
        to: formatDate(selectedFrom),
        label: activePreset || formatShort(selectedFrom),
      });
    }
    setIsOpen(false);
  }, [selectedFrom, selectedTo, activePreset, onChange]);

  const handleCancel = useCallback(() => {
    // Reset to current value
    if (value) {
      setSelectedFrom(parseDate(value.from));
      setSelectedTo(parseDate(value.to));
      setActivePreset(value.label);
    } else {
      setSelectedFrom(null);
      setSelectedTo(null);
      setActivePreset(null);
    }
    setIsOpen(false);
  }, [value]);

  const handleClear = useCallback(() => {
    onChange(null);
    setSelectedFrom(null);
    setSelectedTo(null);
    setActivePreset(null);
    setIsOpen(false);
  }, [onChange]);

  const navigateMonth = useCallback((direction: -1 | 1) => {
    setRightMonth(prev => {
      const newMonth = prev + direction;
      if (newMonth > 11) {
        setRightYear(y => y + 1);
        return 0;
      }
      if (newMonth < 0) {
        setRightYear(y => y - 1);
        return 11;
      }
      return newMonth;
    });
  }, []);

  // Display label for trigger button
  const displayLabel = value
    ? value.label.length > 30
      ? `${getMonthShort(parseDate(value.from).getMonth())} ${parseDate(value.from).getDate()} - ${getMonthShort(parseDate(value.to).getMonth())} ${parseDate(value.to).getDate()}, ${parseDate(value.to).getFullYear()}`
      : value.label
    : 'All Dates';

  const displaySublabel = value
    ? `${formatShort(parseDate(value.from))} – ${formatShort(parseDate(value.to))}`
    : null;

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 h-9 px-3.5 rounded-lg text-xs font-semibold transition-all border
          ${value
            ? 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/15'
            : 'bg-secondary/60 text-muted-foreground border-border/50 hover:bg-secondary hover:text-foreground'
          }
        `}
      >
        <CalendarDays className="h-3.5 w-3.5" />
        <span>{displayLabel}</span>
        {value && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
            className="ml-1 p-0.5 rounded hover:bg-primary/20 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </button>

      {/* Popover */}
      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute top-full left-0 mt-2 z-50 bg-card rounded-xl border border-border shadow-xl flex overflow-hidden"
          style={{ minWidth: '720px' }}
        >
          {/* Left: Presets */}
          <div className="w-[180px] border-r border-border bg-secondary/30 py-3 px-2 flex flex-col gap-0.5 overflow-y-auto max-h-[420px]">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2 mb-2">
              Quick Select
            </div>
            <button
              onClick={handleClear}
              className={`
                text-left px-3 py-2 rounded-lg text-xs font-medium transition-all
                ${!value && !selectedFrom
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground hover:bg-secondary'
                }
              `}
            >
              Maximum (All)
            </button>
            {presets.map(preset => (
              <button
                key={preset.label}
                onClick={() => handlePresetClick(preset)}
                className={`
                  text-left px-3 py-2 rounded-lg text-xs font-medium transition-all
                  ${activePreset === preset.label
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-secondary'
                  }
                `}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Right: Calendars */}
          <div className="flex-1 p-4">
            {/* Navigation */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => navigateMonth(-1)}
                className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
              >
                <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              <div className="flex-1" />
              <button
                onClick={() => navigateMonth(1)}
                className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
              >
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            {/* Dual Calendar */}
            <div className="flex gap-6">
              <CalendarMonth
                year={leftYear}
                month={leftMonth}
                selectedFrom={selectedFrom}
                selectedTo={selectedTo}
                hoverDate={hoverDate}
                availableDateSet={availableDateSet}
                onDateClick={handleDateClick}
                onDateHover={setHoverDate}
              />
              <CalendarMonth
                year={rightYear}
                month={rightMonth}
                selectedFrom={selectedFrom}
                selectedTo={selectedTo}
                hoverDate={hoverDate}
                availableDateSet={availableDateSet}
                onDateClick={handleDateClick}
                onDateHover={setHoverDate}
              />
            </div>

            {/* Selected range display */}
            <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
              {selectedFrom && (
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-md bg-secondary font-data font-medium text-foreground">
                    {formatShort(selectedFrom)}
                  </span>
                  <span>—</span>
                  <span className="px-2.5 py-1 rounded-md bg-secondary font-data font-medium text-foreground">
                    {selectedTo ? formatShort(selectedTo) : 'Select end date'}
                  </span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-4 flex items-center justify-end gap-2 pt-3 border-t border-border">
              <button
                onClick={handleCancel}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:bg-secondary transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                disabled={!selectedFrom}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
