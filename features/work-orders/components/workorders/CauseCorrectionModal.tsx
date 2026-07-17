// /features/work-orders/components/workorders/CauseCorrectionModal.tsx (FULL FILE REPLACEMENT)
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ModalShell from "@/features/shared/components/ModalShell";
import VoiceDictationButton from "@/features/shared/voice/VoiceDictationButton";

interface CauseCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;

  /** still required for submits + parent logic */
  jobId: string;

  /** ✅ NEW: shown in header instead of jobId (use line complaint/description) */
  lineLabel: string;

  onSubmit: (cause: string, correction: string) => Promise<void>;

  /** ✅ Draft save (cause/correction can be partial) */
  onSaveDraft?: (cause: string, correction: string) => Promise<void>;
  onDraftChange?: (cause: string, correction: string) => void;

  initialCause?: string;
  initialCorrection?: string;
}

export default function CauseCorrectionModal({
  isOpen,
  onClose,
  jobId,
  lineLabel,
  onSubmit,
  onSaveDraft,
  onDraftChange,
  initialCause = "",
  initialCorrection = "",
}: CauseCorrectionModalProps) {
  const [cause, setCause] = useState(initialCause);
  const [correction, setCorrection] = useState(initialCorrection);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [dictatedStory, setDictatedStory] = useState("");
  const [rewriting, setRewriting] = useState(false);
  const [rewritePreview, setRewritePreview] = useState<{
    cause: string;
    correction: string;
  } | null>(null);

  const causeRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCause(initialCause);
      setCorrection(initialCorrection);
      setError(null);
      setOk(null);
      setDictatedStory("");
      setRewritePreview(null);
      setRewriting(false);
      setTimeout(() => causeRef.current?.focus(), 50);
    }
  }, [isOpen, initialCause, initialCorrection]);

  const trimmedCause = useMemo(() => cause.trim(), [cause]);
  const trimmedCorrection = useMemo(() => correction.trim(), [correction]);

  const canComplete = trimmedCause.length > 0 && trimmedCorrection.length > 0;

  // ✅ allow draft save if user typed anything at all
  const canSaveDraft =
    Boolean(onSaveDraft) &&
    (trimmedCause.length > 0 || trimmedCorrection.length > 0);

  const handleSubmit = async () => {
    if (submitting || savingDraft) return;

    // hard gate: must have both
    if (!canComplete) {
      setError("Cause and correction are required to complete this job.");
      setOk(null);
      return;
    }

    setSubmitting(true);
    setError(null);
    setOk(null);
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
    if (!canSaveDraft) return;

    setSavingDraft(true);
    setError(null);
    setOk(null);
    try {
      await onSaveDraft(trimmedCause, trimmedCorrection);
      setOk("Saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSavingDraft(false);
    }
  };

  const handleRewrite = async (): Promise<void> => {
    const transcript = dictatedStory.trim();
    if (!transcript || rewriting) return;

    setRewriting(true);
    setError(null);
    setOk(null);
    try {
      const response = await fetch("/api/work-orders/documentation/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          transcript,
          existingCause: cause,
          existingCorrection: correction,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { cause?: string; correction?: string; error?: string }
        | null;

      if (
        !response.ok ||
        typeof body?.cause !== "string" ||
        typeof body?.correction !== "string"
      ) {
        throw new Error(body?.error || "Could not rewrite the job story.");
      }

      setRewritePreview({
        cause: body.cause,
        correction: body.correction,
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not rewrite the job story.",
      );
    } finally {
      setRewriting(false);
    }
  };

  const applyRewrite = (): void => {
    if (!rewritePreview) return;
    setCause(rewritePreview.cause);
    setCorrection(rewritePreview.correction);
    onDraftChange?.(rewritePreview.cause, rewritePreview.correction);
    setRewritePreview(null);
    setOk("AI rewrite applied to the editable draft.");
  };

  const busy = submitting || savingDraft || rewriting;

  const headerLabel =
    (lineLabel ?? "").trim().length > 0 ? lineLabel.trim() : jobId;

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
        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[var(--accent-copper-light)]">
            Job completion story
          </div>
          <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            Capture what failed and exactly what was done so this line is
            complete, searchable, and useful later.
          </div>
        </div>

        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper-light)]">
                Voice story
              </div>
              <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                Describe what you verified and what you did. The original
                dictation stays visible until you choose to apply the rewrite.
              </p>
            </div>
            <VoiceDictationButton
              disabled={busy}
              idleLabel="Dictate story"
              listeningLabel="Stop"
              onTranscript={(transcript) => {
                if (!transcript) return;
                setDictatedStory((current) => {
                  const existing = current.trim();
                  return existing ? `${existing} ${transcript}` : transcript;
                });
                setRewritePreview(null);
              }}
            />
          </div>

          <textarea
            rows={4}
            value={dictatedStory}
            onChange={(event) => {
              setDictatedStory(event.target.value);
              setRewritePreview(null);
            }}
            className="mt-3 w-full rounded-lg border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] outline-none transition focus:border-[var(--accent-copper-soft)] focus:ring-2 focus:ring-[var(--accent-copper-soft)]/60"
            placeholder="Raw technician dictation appears here…"
          />

          <div className="mt-2 flex justify-end">
            <button
              type="button"
              disabled={rewriting || dictatedStory.trim().length < 3}
              onClick={() => void handleRewrite()}
              className="rounded-full border border-[var(--accent-copper-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-copper-light)] transition hover:bg-[color:var(--theme-surface-subtle)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {rewriting ? "Rewriting…" : "Rewrite cause & correction"}
            </button>
          </div>

          {rewritePreview ? (
            <div className="mt-3 space-y-3 rounded-xl border border-emerald-400/25 bg-emerald-500/5 p-3">
              <div>
                <div className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                  Proposed cause
                </div>
                <p className="mt-1 text-sm leading-5 text-[color:var(--theme-text-primary)]">
                  {rewritePreview.cause}
                </p>
              </div>
              <div>
                <div className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                  Proposed correction
                </div>
                <p className="mt-1 text-sm leading-5 text-[color:var(--theme-text-primary)]">
                  {rewritePreview.correction}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRewritePreview(null)}
                  className="rounded-full border border-[color:var(--theme-border-soft)] px-3 py-1.5 text-xs text-[color:var(--theme-text-secondary)]"
                >
                  Keep current draft
                </button>
                <button
                  type="button"
                  onClick={applyRewrite}
                  className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-emerald-950"
                >
                  Apply rewrite
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between text-[0.7rem] text-[color:var(--theme-text-secondary)]">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="font-semibold uppercase tracking-[0.18em]">
              Complaint
            </span>
            <span className="truncate text-[0.8rem] font-medium text-[color:var(--theme-text-primary)]">
              {headerLabel}
            </span>
            {/* keep id around but de-emphasized (helps debugging) */}
            <span className="font-mono text-[0.65rem] text-[color:var(--theme-text-muted)]">
              {jobId}
            </span>
          </div>

          <span className="shrink-0 rounded-full border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
            Cause / Correction
          </span>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-950/35 px-3 py-2 text-xs text-red-100">
            {error}
          </div>
        )}

        {ok && !error && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/25 px-3 py-2 text-xs text-emerald-100">
            {ok}
          </div>
        )}

        {!canComplete && (
          <div className="rounded-lg border border-amber-500/35 bg-[color:var(--theme-surface-inset)] px-3 py-2 text-[0.75rem] text-amber-200">
            <span className="font-semibold">Required:</span> enter both a{" "}
            <span className="font-semibold">cause</span> and{" "}
            <span className="font-semibold">correction</span> to complete the
            job.
          </div>
        )}

        <div className="space-y-1">
          <label className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
            Cause
          </label>
          <textarea
            ref={causeRef}
            rows={3}
            className="w-full rounded-lg border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] outline-none transition focus:border-[var(--accent-copper-soft)] focus:ring-2 focus:ring-[var(--accent-copper-soft)]/60"
            value={cause}
            onChange={(e) => {
              const next = e.target.value;
              setCause(next);
              onDraftChange?.(next, correction);
              if (error) setError(null);
              if (ok) setOk(null);
            }}
            placeholder="What caused the issue?"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
            Correction
          </label>
          <textarea
            rows={3}
            className="w-full rounded-lg border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] outline-none transition focus:border-[var(--accent-copper-soft)] focus:ring-2 focus:ring-[var(--accent-copper-soft)]/60"
            value={correction}
            onChange={(e) => {
              const next = e.target.value;
              setCorrection(next);
              onDraftChange?.(cause, next);
              if (error) setError(null);
              if (ok) setOk(null);
            }}
            placeholder="Describe what was done to correct the issue…"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void handleSubmit();
              }
            }}
          />
          <p className="mt-1 text-[0.7rem] text-[color:var(--theme-text-muted)]">
            Press{" "}
            <kbd className="rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-1 text-[0.65rem]">
              Ctrl
            </kbd>{" "}
            /{" "}
            <kbd className="rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-1 text-[0.65rem]">
              ⌘
            </kbd>{" "}
            +{" "}
            <kbd className="rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-1 text-[0.65rem]">
              Enter
            </kbd>{" "}
            to complete.
          </p>
        </div>

        {/* footer */}
        <div className="mt-2 flex flex-col gap-2 border-t border-[var(--metal-border-soft)] pt-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex items-center justify-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)] disabled:opacity-60"
          >
            Cancel
          </button>

          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:justify-end">
            {/* ✅ NEW: bottom “Save” button (arrow area) */}
            {onSaveDraft && (
              <button
                type="button"
                onClick={() => void handleSaveDraft()}
                disabled={busy || !canSaveDraft}
                className={[
                  "inline-flex flex-1 items-center justify-center rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] sm:flex-none sm:px-5",
                  canSaveDraft
                    ? "border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)]"
                    : "border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-muted)] opacity-70",
                ].join(" ")}
                title={
                  canSaveDraft
                    ? "Save cause/correction without completing"
                    : "Type a cause or correction to enable saving"
                }
              >
                {savingDraft ? "Saving…" : "Save"}
              </button>
            )}

            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={busy || !canComplete}
              className={[
                "inline-flex flex-1 items-center justify-center rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] shadow-[0_0_20px_rgba(212,118,49,0.7)] sm:flex-none sm:px-6",
                canComplete
                  ? "bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] text-[color:var(--theme-text-on-accent)] hover:brightness-110"
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
