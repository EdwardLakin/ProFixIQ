"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@headlessui/react";

interface CauseCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  onSubmit: (cause: string, correction: string) => Promise<void>;
  initialCause?: string;
  initialCorrection?: string;
}

export default function CauseCorrectionModal({
  isOpen,
  onClose,
  jobId,
  onSubmit,
  initialCause = "",
  initialCorrection = "",
}: CauseCorrectionModalProps) {
  const [cause, setCause] = useState(initialCause);
  const [correction, setCorrection] = useState(initialCorrection);
  const [submitting, setSubmitting] = useState(false);
  const causeRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCause(initialCause);
      setCorrection(initialCorrection);
      setTimeout(() => causeRef.current?.focus(), 50);
    }
  }, [isOpen, initialCause, initialCorrection]);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(cause.trim(), correction.trim());
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      className="fixed inset-0 z-[500] flex items-center justify-center p-4 sm:p-6"
    >
      <div
        className="fixed inset-0 z-[500] bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
      />

      <div className="relative z-[510] w-full max-w-md">
        <Dialog.Panel className="rounded-lg border border-border bg-background text-foreground shadow-xl dark:border-orange-400/90 dark:bg-neutral-950">
          <Dialog.Title className="border-b border-border/60 px-6 py-4 text-lg font-header font-semibold tracking-wide dark:border-neutral-800">
            Complete Job
          </Dialog.Title>

          <div className="px-6 py-5">
            <div className="mb-3">
              <label className="mb-1 block text-sm text-foreground/80 dark:text-neutral-300">
                Cause
              </label>
              <textarea
                ref={causeRef}
                rows={3}
                className="w-full rounded border border-border/60 bg-background px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                value={cause}
                onChange={(e) => setCause(e.target.value)}
                placeholder="What caused the issue?"
              />
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-sm text-foreground/80 dark:text-neutral-300">
                Correction
              </label>
              <textarea
                rows={3}
                className="w-full rounded border border-border/60 bg-background px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                value={correction}
                onChange={(e) => setCorrection(e.target.value)}
                placeholder="Describe what was done to correct the issue…"
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSubmit();
                }}
              />
            </div>

            <div className="text-xs text-muted-foreground dark:text-neutral-500">
              Job ID: {jobId}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border/60 px-6 py-4 dark:border-neutral-800">
            <button
              className="font-header rounded border border-border/70 bg-background px-4 py-2 text-sm hover:bg-muted dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              className="font-header rounded bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-60"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "Saving…" : "Submit"}
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}