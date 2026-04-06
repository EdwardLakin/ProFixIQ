"use client";

import { Input } from "@shared/components/ui/input";
import { Button } from "@shared/components/ui/Button";

type HourRow = {
  weekday: number;
  open_time: string;
  close_time: string;
  closed?: boolean;
};

type TimeOffRow = {
  id: string;
  start_date: string;
  end_date: string;
  label: string | null;
  notes?: string | null;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function SectionShell({
  id,
  title,
  description,
  action,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="space-y-3 rounded-2xl border border-white/10 bg-black/25 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.18)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-50">{title}</h2>
          {description ? (
            <p className="text-[11px] text-neutral-400">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

type Props = {
  isUnlocked: boolean;
  hours: HourRow[];
  timeOff: TimeOffRow[];
  newOffStart: string;
  newOffEnd: string;
  newOffReason: string;
  onHoursChange: (updater: (prev: HourRow[]) => HourRow[]) => void;
  onNewOffStartChange: (value: string) => void;
  onNewOffEndChange: (value: string) => void;
  onNewOffReasonChange: (value: string) => void;
  onSaveHours: () => void;
  onAddTimeOff: () => void;
  onDeleteTimeOff: (id: string) => void;
};

export default function OwnerSettingsSchedulingSection({
  isUnlocked,
  hours,
  timeOff,
  newOffStart,
  newOffEnd,
  newOffReason,
  onHoursChange,
  onNewOffStartChange,
  onNewOffEndChange,
  onNewOffReasonChange,
  onSaveHours,
  onAddTimeOff,
  onDeleteTimeOff,
}: Props) {
  return (
    <div className="space-y-5">
      <SectionShell
        id="hours-settings"
        title="Hours"
        description="Controls public booking availability for each day."
        action={
          <Button onClick={onSaveHours} disabled={!isUnlocked} size="sm">
            Save hours
          </Button>
        }
      >
        <div className="grid gap-3 md:grid-cols-7">
          {hours.map((row, idx) => {
            const closed = !!row.closed;
            return (
              <div
                key={row.weekday}
                className="rounded border border-neutral-800 bg-neutral-900 p-2 text-xs"
              >
                <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-orange-300">
                  <span>{WEEKDAYS[row.weekday]}</span>
                  <label className="flex items-center gap-1 text-[10px] text-neutral-300">
                    <input
                      type="checkbox"
                      checked={closed}
                      onChange={(e) => {
                        const isClosed = e.target.checked;
                        onHoursChange((prev) => {
                          const copy = [...prev];
                          copy[idx] = { ...copy[idx], closed: isClosed };
                          return copy;
                        });
                      }}
                      disabled={!isUnlocked}
                    />
                    Closed
                  </label>
                </div>
                <label className="mb-1 block text-[10px] text-neutral-400">Open</label>
                <input
                  type="time"
                  className="mb-2 w-full rounded bg-neutral-950 px-2 py-1 text-xs text-neutral-100 disabled:opacity-40"
                  value={row.open_time}
                  onChange={(e) => {
                    const v = e.target.value;
                    onHoursChange((prev) => {
                      const copy = [...prev];
                      copy[idx] = { ...copy[idx], open_time: v };
                      return copy;
                    });
                  }}
                  disabled={!isUnlocked || closed}
                />
                <label className="mb-1 block text-[10px] text-neutral-400">Close</label>
                <input
                  type="time"
                  className="w-full rounded bg-neutral-950 px-2 py-1 text-xs text-neutral-100 disabled:opacity-40"
                  value={row.close_time}
                  onChange={(e) => {
                    const v = e.target.value;
                    onHoursChange((prev) => {
                      const copy = [...prev];
                      copy[idx] = { ...copy[idx], close_time: v };
                      return copy;
                    });
                  }}
                  disabled={!isUnlocked || closed}
                />
              </div>
            );
          })}
        </div>
      </SectionShell>

      <SectionShell
        id="timeoff-settings"
        title="Time off / blackouts"
        description="Block public availability for closures, holidays, and special events."
      >
        <div className="grid gap-3 md:grid-cols-4">
          <input
            type="datetime-local"
            className="rounded bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
            value={newOffStart}
            onChange={(e) => onNewOffStartChange(e.target.value)}
            disabled={!isUnlocked}
          />
          <input
            type="datetime-local"
            className="rounded bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
            value={newOffEnd}
            onChange={(e) => onNewOffEndChange(e.target.value)}
            disabled={!isUnlocked}
          />
          <Input
            placeholder="Reason (optional)"
            value={newOffReason}
            onChange={(e) => onNewOffReasonChange(e.target.value)}
            disabled={!isUnlocked}
          />
          <Button onClick={onAddTimeOff} disabled={!isUnlocked}>
            Add
          </Button>
        </div>

        {timeOff.length === 0 ? (
          <p className="text-xs text-neutral-500">No time-off entries.</p>
        ) : (
          <ul className="space-y-2">
            {timeOff.map((t) => {
              const start = new Date(t.start_date);
              const end = new Date(t.end_date);
              return (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm"
                >
                  <div>
                    <div className="text-neutral-100">
                      {start.toLocaleString()} → {end.toLocaleString()}
                    </div>
                    {t.label ? (
                      <div className="text-xs text-neutral-400">Reason: {t.label}</div>
                    ) : null}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onDeleteTimeOff(t.id)}
                    disabled={!isUnlocked}
                  >
                    Remove
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </SectionShell>
    </div>
  );
}
