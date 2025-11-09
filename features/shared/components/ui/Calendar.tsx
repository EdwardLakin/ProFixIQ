// shared/components/ui/Calendar.tsx
"use client";

import { useMemo } from "react";
import clsx from "clsx";

type CalendarProps = {
  value?: Date | null;
  onChange?: (d: Date) => void;
  month: Date;
  onMonthChange: (d: Date) => void;
  disabled?: (d: Date) => boolean;
  className?: string;
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function isSameDay(a?: Date | null, b?: Date | null) {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function isToday(d: Date) {
  const t = new Date();
  return isSameDay(d, t);
}

export default function Calendar({
  value,
  onChange,
  month,
  onMonthChange,
  disabled,
  className,
}: CalendarProps) {
  const grid = useMemo(() => {
    const first = startOfMonth(month);
    const startWeekday = (first.getDay() + 7) % 7;
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells: { date: Date; inMonth: boolean }[] = [];

    for (let i = 0; i < startWeekday; i++) {
      const d = new Date(first);
      d.setDate(d.getDate() - (startWeekday - i));
      cells.push({ date: d, inMonth: false });
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(month.getFullYear(), month.getMonth(), i);
      cells.push({ date: d, inMonth: true });
    }

    while (cells.length % 7 !== 0) {
      const last = cells[cells.length - 1].date;
      const d = new Date(last);
      d.setDate(d.getDate() + 1);
      cells.push({ date: d, inMonth: false });
    }
    while (cells.length < 42) {
      const last = cells[cells.length - 1].date;
      const d = new Date(last);
      d.setDate(d.getDate() + 1);
      cells.push({ date: d, inMonth: false });
    }

    return cells;
  }, [month]);

  const monthFmt = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className={clsx("rounded-xl border border-white/5 bg-background/40 text-foreground", className)}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <button
          onClick={() => onMonthChange(addMonths(month, -1))}
          className="h-7 w-7 rounded-md border border-white/5 text-sm hover:bg-white/5"
        >
          ‹
        </button>
        <div className="text-xs font-medium text-muted-foreground/90">{monthFmt.format(month)}</div>
        <button
          onClick={() => onMonthChange(addMonths(month, 1))}
          className="h-7 w-7 rounded-md border border-white/5 text-sm hover:bg-white/5"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 text-[0.6rem] uppercase tracking-wide text-muted-foreground px-3 pt-3">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 p-3">
        {grid.map(({ date, inMonth }, i) => {
          const isDisabled = disabled?.(date) ?? false;
          const selected = isSameDay(date, value ?? null);
          const today = isToday(date);

          return (
            <button
              key={i}
              disabled={isDisabled}
              onClick={() => onChange?.(date)}
              className={clsx(
                "aspect-square rounded-lg text-sm transition border border-transparent",
                inMonth ? "text-foreground" : "text-muted-foreground/40",
                !isDisabled && "hover:bg-white/5",
                isDisabled && "opacity-40 cursor-not-allowed",
                selected && "bg-white/10 border-white/10",
                !selected && today && "ring-1 ring-white/15"
              )}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}