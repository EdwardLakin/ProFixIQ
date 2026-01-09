"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import ModalShell from "@/features/shared/components/ModalShell";

interface CauseCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  onSubmit: (cause: string, correction: string) => Promise<void>;
  onSaveDraft?: (cause: string, correction: string) => Promise<void>;
  initialCause?: string;
  initialCorrection?: string;
}

export default function CauseCorrectionModal({
  isOpen,
  onClose,
  jobId,
  onSubmit,
  onSaveDraft,
  initialCause = "",
  initialCorrection = "",
}: CauseCorrectionModalProps) {
  const [cause, setCause] = useState(initialCause);
  const [correction, setCorrection] = useState(initialCorrection);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const causeRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCause(initialCause);
      setCorrection(initialCorrection);
      setError(null);
      setTimeout(() => causeRef.current?.focus(), 50);
    }
  }, [isOpen, initialCause, initialCorrection]);

  const trimmedCause = useMemo(() => cause.trim(), [cause]);
  const trimmedCorrection = useMemo(() => correction.trim(), [correction]);
  const canComplete = trimmedCause.length > 0 && trimmedCorrection.length > 0;

  const handleSubmit = async () => {
    if (submitting || savingDraft) return;

    // ✅ hard gate: must have both
    if (!canComplete) {
      setError("Cause and correction are required to complete this job.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(trimmedCause, trimmedCorrection);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to complete job.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!onSaveDraft || submitting || savingDraft) return;
    setSavingDraft(true);
    setError(null);
    try {
      await onSaveDraft(trimmedCause, trimmedCorrection);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save draft.");
    } finally {
      setSavingDraft(false);
    }
  };

  const busy = submitting || savingDraft;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="COMPLETE JOB"
      size="md"
      hideFooter
    >
      <div
        className="max-h-[70vh] space-y-4 overflow-y-auto pr-1"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="flex items-center justify-between text-[0.7rem] text-neutral-400">
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold uppercase tracking-[0.18em]">
              Job ID
            </span>
            <span className="font-mono text-[0.7rem] text-neutral-200">
              {jobId}
            </span>
          </div>
          <span className="rounded-full border border-[var(--metal-border-soft)] bg-black/60 px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-neutral-300">
            Cause / Correction
          </span>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-950/35 px-3 py-2 text-xs text-red-100">
            {error}
          </div>
        )}

        {!canComplete && (
          <div className="rounded-lg border border-amber-500/35 bg-black/35 px-3 py-2 text-[0.75rem] text-amber-200">
            <span className="font-semibold">Required:</span> enter both a{" "}
            <span className="font-semibold">cause</span> and{" "}
            <span className="font-semibold">correction</span> to complete the job.
          </div>
        )}

        <div className="space-y-1">
          <label className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-neutral-300">
            Cause
          </label>
          <textarea
            ref={causeRef}
            rows={3}
            className="w-full rounded-lg border border-[var(--metal-border-soft)] bg-black/75 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none transition focus:border-[var(--accent-copper-soft)] focus:ring-2 focus:ring-[var(--accent-copper-soft)]/60"
            value={cause}
            onChange={(e) => {
              setCause(e.target.value);
              if (error) setError(null);
            }}
            placeholder="What caused the issue?"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-neutral-300">
            Correction
          </label>
          <textarea
            rows={3}
            className="w-full rounded-lg border border-[var(--metal-border-soft)] bg-black/75 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none transition focus:border-[var(--accent-copper-soft)] focus:ring-2 focus:ring-[var(--accent-copper-soft)]/60"
            value={correction}
            onChange={(e) => {
              setCorrection(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Describe what was done to correct the issue…"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void handleSubmit();
              }
            }}
          />
          <p className="mt-1 text-[0.7rem] text-neutral-500">
            Press{" "}
            <kbd className="rounded border border-neutral-700 bg-black/60 px-1 text-[0.65rem]">
              Ctrl
            </kbd>{" "}
            /{" "}
            <kbd className="rounded border border-neutral-700 bg-black/60 px-1 text-[0.65rem]">
              ⌘
            </kbd>{" "}
            +{" "}
            <kbd className="rounded border border-neutral-700 bg-black/60 px-1 text-[0.65rem]">
              Enter
            </kbd>{" "}
            to complete.
          </p>
        </div>

        <div className="mt-2 flex flex-col gap-2 border-t border-[var(--metal-border-soft)] pt-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex items-center justify-center rounded-full border border-[var(--metal-border-soft)] bg-black/60 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-neutral-200 hover:bg-white/5 disabled:opacity-60"
          >
            Cancel
          </button>

          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:justify-end">
            {onSaveDraft && (
              <button
                type="button"
                onClick={() => void handleSaveDraft()}
                disabled={busy}
                className="inline-flex flex-1 items-center justify-center rounded-full border border-[var(--accent-copper-soft)]/70 bg-black/50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-copper-soft)] shadow-[0_0_12px_rgba(212,118,49,0.35)] hover:bg-[var(--accent-copper-faint)] disabled:opacity-60 sm:flex-none sm:px-5"
              >
                {savingDraft ? "Saving…" : "Save story only"}
              </button>
            )}

            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={busy || !canComplete}
              className={[
                "inline-flex flex-1 items-center justify-center rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] shadow-[0_0_20px_rgba(212,118,49,0.7)] sm:flex-none sm:px-6",
                canComplete
                  ? "bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] text-black hover:brightness-110"
                  : "border border-amber-500/40 bg-amber-500/10 text-amber-200 opacity-70",
              ].join(" ")}
              title={
                canComplete
                  ? "Complete job"
                  : "Cause and correction are required to complete this job"
              }
            >
              {submitting ? "Completing…" : "Complete job"}
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}