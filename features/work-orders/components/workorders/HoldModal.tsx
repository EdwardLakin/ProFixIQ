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
    holdUntil?: string | null
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
      title="Place / Update Hold"
      size="sm"
      footerLeft={
        canRelease ? (
          <button
            className="rounded border border-red-500 px-3 py-2 text-sm text-white hover:border-orange-400"
            onClick={() => Promise.resolve(onRelease?.()).then(onClose)}
            type="button"
          >
            Release Hold
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
      <p className="mb-3 text-sm text-neutral-300">
        Choose a reason and add optional notes
      </p>

      <label className="mb-1 block text-xs text-neutral-400">Reason</label>
      <select
        className="mb-3 w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm text-white focus:border-orange-400 focus:outline-none"
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

      <label className="mb-1 block text-xs text-neutral-400">Notes</label>
      <textarea
        rows={3}
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-400 focus:outline-none"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional notes for the hold…"
      />

      <div className="mt-4 rounded border border-neutral-700 bg-neutral-900/50 p-3">
        <div className="mb-2 text-xs text-neutral-400">
          Hold placed at:{" "}
          <span className="text-white">{holdPlacedAt || "—"}</span>
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-white">
          <input
            type="checkbox"
            checked={autoRelease}
            onChange={(e) => setAutoRelease(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-orange-400"
          />
          Auto-release this hold
        </label>

        {autoRelease && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-neutral-400">
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
                className="w-24 rounded border border-neutral-700 bg-neutral-900 p-1 text-sm text-white focus:border-orange-400 focus:outline-none"
                disabled={releaseAt !== ""}
              />
              <span className="text-[10px] text-neutral-500">
                leave empty if using date/time
              </span>
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-400">
                Or release at date/time
              </label>
              <input
                type="datetime-local"
                value={releaseAt}
                onChange={(e) => setReleaseAt(e.target.value)}
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-1 text-sm text-white focus:border-orange-400 focus:outline-none"
              />
            </div>
          </div>
        )}
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