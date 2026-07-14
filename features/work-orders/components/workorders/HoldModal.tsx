"use client";

import { useEffect, useState } from "react";
import ModalShell from "@/features/shared/components/ModalShell";

const HOLD_REASONS = [
  "Awaiting customer authorization",
  "Awaiting parts",
  "Need additional info",
  "Hold for assistance",
  "Foreman hold",
  "Lead hand hold",
] as const;

type HoldReason = (typeof HOLD_REASONS)[number];

interface HoldModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (
    reason: string,
    notes?: string,
    holdUntil?: string | null,
  ) => Promise<void> | void;
  onRelease?: () => Promise<void> | void;
  canRelease?: boolean;
  defaultReason?: string;
  defaultNotes?: string;
  defaultHoldUntil?: string | null;
}

export default function HoldModal({
  isOpen,
  onClose,
  onApply,
  onRelease,
  canRelease = false,
  defaultReason = "Awaiting parts",
  defaultNotes = "",
  defaultHoldUntil = null,
}: HoldModalProps) {
  const [reason, setReason] = useState<string>(defaultReason);
  const [notes, setNotes] = useState<string>(defaultNotes);

  const [autoRelease, setAutoRelease] = useState<boolean>(false);
  const [releaseAfterMinutes, setReleaseAfterMinutes] = useState<number>(60);
  const [releaseAt, setReleaseAt] = useState<string>("");

  const [holdPlacedAt, setHoldPlacedAt] = useState<string>("");

  useEffect(() => {
    if (!isOpen) return;

    setReason(defaultReason);
    setNotes(defaultNotes);
    setHoldPlacedAt(new Date().toLocaleString());

    if (defaultHoldUntil) {
      setAutoRelease(true);
      const dt = new Date(defaultHoldUntil);
      if (!Number.isNaN(dt.getTime())) {
        setReleaseAt(toLocalDatetime(dt));
      } else {
        setReleaseAt("");
      }
    } else {
      setAutoRelease(false);
      setReleaseAfterMinutes(60);
      setReleaseAt("");
    }
  }, [isOpen, defaultReason, defaultNotes, defaultHoldUntil]);

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="PLACE / UPDATE HOLD"
      size="sm"
      footerLeft={
        canRelease ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-red-500/80 bg-red-500/10 px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-red-100 hover:bg-red-500/20"
            onClick={() => Promise.resolve(onRelease?.()).then(onClose)}
          >
            <span>●</span>
            <span>Release hold</span>
          </button>
        ) : null
      }
      onSubmit={async () => {
        let holdUntil: string | null = null;

        if (autoRelease) {
          if (releaseAt) {
            const d = new Date(releaseAt);
            if (!Number.isNaN(d.getTime())) {
              holdUntil = d.toISOString();
            }
          } else if (releaseAfterMinutes > 0) {
            const d = new Date();
            d.setMinutes(d.getMinutes() + releaseAfterMinutes);
            holdUntil = d.toISOString();
          }
        }

        await onApply(reason, notes, holdUntil);
        onClose();
      }}
      submitText="Apply Hold"
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[var(--accent-copper-light)]">
            Operational hold
          </div>
          <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            Pause the line with a clear reason so advisors, parts, and technicians all see the same state.
          </div>
        </div>

        <p className="text-[0.8rem] text-[color:var(--theme-text-secondary)]">
          Park this job with a clear reason so advisors and techs know why it&apos;s
          on hold.
        </p>

        {/* Reason */}
        <div className="space-y-1">
          <label className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
            Reason
          </label>
          <div className="relative">
            <select
              className="w-full rounded-lg border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none transition focus:border-[var(--accent-copper-soft)] focus:ring-2 focus:ring-[var(--accent-copper-soft)]/60"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              {HOLD_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              {!HOLD_REASONS.includes(reason as HoldReason) && (
                <option value={reason}>{reason}</option>
              )}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-[color:var(--theme-text-muted)]">
              ▼
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1">
          <label className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
            Notes
          </label>
          <textarea
            rows={3}
            className="w-full rounded-lg border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] outline-none transition focus:border-[var(--accent-copper-soft)] focus:ring-2 focus:ring-[var(--accent-copper-soft)]/60"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes for this hold…"
          />
        </div>

        {/* Auto-release card */}
        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3 shadow-[var(--theme-shadow-medium)]">
          <div className="mb-2 flex items-center justify-between text-[0.7rem] text-[color:var(--theme-text-secondary)]">
            <span>
              Hold placed at:{" "}
              <span className="text-[color:var(--theme-text-primary)]">{holdPlacedAt || "—"}</span>
            </span>
          </div>

          <label className="inline-flex items-center gap-2 text-[0.7rem] text-[color:var(--theme-text-primary)]">
            <input
              type="checkbox"
              checked={autoRelease}
              onChange={(e) => setAutoRelease(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-page)] text-[var(--accent-copper-soft)] focus:ring-[var(--accent-copper-soft)]"
            />
            Auto-release this hold
          </label>

          {autoRelease && (
            <div className="mt-3 space-y-3 text-[0.75rem]">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-[color:var(--theme-text-secondary)]">
                  After (minutes)
                </label>
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={releaseAfterMinutes}
                  onChange={(e) =>
                    setReleaseAfterMinutes(Number(e.target.value) || 0)
                  }
                  className="w-24 rounded-md border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-2 py-1 text-sm text-[color:var(--theme-text-primary)] outline-none focus:border-[var(--accent-copper-soft)] focus:ring-1 focus:ring-[var(--accent-copper-soft)]/70"
                  disabled={releaseAt !== ""}
                />
                <span className="text-[0.65rem] text-[color:var(--theme-text-muted)]">
                  Leave empty if using a specific date/time.
                </span>
              </div>

              <div>
                <label className="mb-1 block text-[0.7rem] text-[color:var(--theme-text-secondary)]">
                  Or release at date / time
                </label>
                <input
                  type="datetime-local"
                  value={releaseAt}
                  onChange={(e) => setReleaseAt(e.target.value)}
                  className="w-full rounded-md border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-2 py-1 text-sm text-[color:var(--theme-text-primary)] outline-none focus:border-[var(--accent-copper-soft)] focus:ring-1 focus:ring-[var(--accent-copper-soft)]/70"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

function toLocalDatetime(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hour = pad(d.getHours());
  const minute = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hour}:${minute}`;
}