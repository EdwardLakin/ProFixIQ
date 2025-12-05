"use client";

import { useEffect, useRef, useState } from "react";
import ModalShell from "@/features/shared/components/ModalShell";

interface CauseCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  /** Complete job – usually updates cause, correction, status, punched_out_at, etc. */
  onSubmit: (cause: string, correction: string) => Promise<void>;
  /** Optional: save cause/correction without completing the job */
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
  const causeRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCause(initialCause);
      setCorrection(initialCorrection);
      setTimeout(() => causeRef.current?.focus(), 50);
    }
  }, [isOpen, initialCause, initialCorrection]);

  const handleSubmit = async () => {
    if (submitting || savingDraft) return;
    setSubmitting(true);
    try {
      await onSubmit(cause.trim(), correction.trim());
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!onSaveDraft || submitting || savingDraft) return;
    setSavingDraft(true);
    try {
      await onSaveDraft(cause.trim(), correction.trim());
      // keep modal open so they can continue / complete later
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
      {/* 🔹 Make inner content scrollable, not the whole screen */}
      <div
        className="max-h-[70vh] space-y-4 overflow-y-auto pr-1"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {/* Job meta */}
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

        {/* Cause */}
        <div className="space-y-1">
          <label className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-neutral-300">
            Cause
          </label>
          <textarea
            ref={causeRef}
            rows={3}
            className="w-full rounded-lg border border-[var(--metal-border-soft)] bg-black/75 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none transition focus:border-[var(--accent-copper-soft)] focus:ring-2 focus:ring-[var(--accent-copper-soft)]/60"
            value={cause}
            onChange={(e) => setCause(e.target.value)}
            placeholder="What caused the issue?"
          />
        </div>

        {/* Correction */}
        <div className="space-y-1">
          <label className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-neutral-300">
            Correction
          </label>
          <textarea
            rows={3}
            className="w-full rounded-lg border border-[var(--metal-border-soft)] bg-black/75 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none transition focus:border-[var(--accent-copper-soft)] focus:ring-2 focus:ring-[var(--accent-copper-soft)]/60"
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
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
            to complete the job.
          </p>
        </div>

        {/* Footer actions (custom, since we need two primary actions) */}
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
              disabled={busy}
              className="inline-flex flex-1 items-center justify-center rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-black shadow-[0_0_20px_rgba(212,118,49,0.7)] hover:brightness-110 disabled:opacity-60 sm:flex-none sm:px-6"
            >
              {submitting ? "Completing…" : "Complete job"}
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}