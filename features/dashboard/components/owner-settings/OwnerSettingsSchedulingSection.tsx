"use client";

import { Input } from "@shared/components/ui/input";
import { Button } from "@shared/components/ui/Button";
import { OwnerSettingsPanel } from "@/features/dashboard/components/owner-settings/OwnerSettingsPanels";

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

type Props = {
  isUnlocked: boolean;
  hours: HourRow[];
  timeOff: TimeOffRow[];
  newOffStart: string;
  newOffEnd: string;
  newOffReason: string;
  onHoursChange: (updater: (prev: HourRow[]) => HourRow[]) => HourRow[] | void;
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
      <OwnerSettingsPanel
        id="hours-settings"
        tone="secondary"
        title="Hours"
        description="Controls public booking availability for each day."
        action={
          <Button onClick={onSaveHours} disabled={!isUnlocked} size="sm">
            Save hours
          </Button>
        }
      >
        <div className="overflow-hidden rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]">
          <div className="hidden grid-cols-[90px_110px_1fr_1fr] gap-3 border-b border-[color:var(--theme-border-soft)] px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--theme-text-secondary)] md:grid">
            <div>Day</div>
            <div>Closed</div>
            <div>Open</div>
            <div>Close</div>
          </div>

          <div className="divide-y divide-[color:var(--theme-border-soft)]">
            {hours.map((row, idx) => {
              const closed = !!row.closed;

              return (
                <div key={row.weekday} className="grid gap-3 px-4 py-3 md:grid-cols-[90px_110px_1fr_1fr] md:items-center">
                  <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">{WEEKDAYS[row.weekday]}</div>

                  <label className="flex items-center gap-2 text-sm text-[color:var(--theme-text-secondary)]">
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
                    <span>{closed ? "Closed" : "Open"}</span>
                  </label>

                  <div className="space-y-1">
                    <div className="text-[11px] text-[color:var(--theme-text-muted)] md:hidden">Open</div>
                    <input
                      type="time"
                      className="w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] disabled:opacity-40"
                      value={row.open_time}
                      onChange={(e) => {
                        const value = e.target.value;
                        onHoursChange((prev) => {
                          const copy = [...prev];
                          copy[idx] = { ...copy[idx], open_time: value };
                          return copy;
                        });
                      }}
                      disabled={!isUnlocked || closed}
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="text-[11px] text-[color:var(--theme-text-muted)] md:hidden">Close</div>
                    <input
                      type="time"
                      className="w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] disabled:opacity-40"
                      value={row.close_time}
                      onChange={(e) => {
                        const value = e.target.value;
                        onHoursChange((prev) => {
                          const copy = [...prev];
                          copy[idx] = { ...copy[idx], close_time: value };
                          return copy;
                        });
                      }}
                      disabled={!isUnlocked || closed}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </OwnerSettingsPanel>

      <OwnerSettingsPanel
        id="timeoff-settings"
        tone="passive"
        title="Time off / blackouts"
        description="Block public availability for closures, holidays, and special events."
      >
        <div className="grid gap-3 md:grid-cols-4">
          <input type="datetime-local" className="rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]" value={newOffStart} onChange={(e) => onNewOffStartChange(e.target.value)} disabled={!isUnlocked} />
          <input type="datetime-local" className="rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]" value={newOffEnd} onChange={(e) => onNewOffEndChange(e.target.value)} disabled={!isUnlocked} />
          <Input placeholder="Reason (optional)" value={newOffReason} onChange={(e) => onNewOffReasonChange(e.target.value)} disabled={!isUnlocked} />
          <Button onClick={onAddTimeOff} disabled={!isUnlocked}>Add</Button>
        </div>

        {timeOff.length === 0 ? (
          <p className="text-xs text-[color:var(--theme-text-muted)]">No time-off entries.</p>
        ) : (
          <ul className="space-y-2">
            {timeOff.map((t) => {
              const start = new Date(t.start_date);
              const end = new Date(t.end_date);

              return (
                <li key={t.id} className="flex items-center justify-between rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm">
                  <div>
                    <div className="text-[color:var(--theme-text-primary)]">
                      {start.toLocaleString()} → {end.toLocaleString()}
                    </div>
                    {t.label ? <div className="text-xs text-[color:var(--theme-text-secondary)]">Reason: {t.label}</div> : null}
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => onDeleteTimeOff(t.id)} disabled={!isUnlocked}>
                    Remove
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </OwnerSettingsPanel>
    </div>
  );
}
