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
      className="fixed inset-0 z-[500] flex items-center justify-center px-3 py-6 sm:px-4"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[500] bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-[510] w-full max-w-lg">
        <Dialog.Panel className="overflow-hidden rounded-lg border border-orange-400 bg-neutral-950 text-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-neutral-800 px-5 py-3">
            <div>
              <Dialog.Title className="text-sm font-blackops tracking-wide text-orange-400 sm:text-base">
                Complete Job
              </Dialog.Title>
              <p className="mt-0.5 text-[11px] text-neutral-400">
                Job ID:{" "}
                <span className="font-mono text-neutral-200">{jobId}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-300">
                Cause
              </label>
              <textarea
                ref={causeRef}
                rows={3}
                className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
                value={cause}
                onChange={(e) => setCause(e.target.value)}
                placeholder="What caused the issue?"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-300">
                Correction
              </label>
              <textarea
                rows={3}
                className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
                value={correction}
                onChange={(e) => setCorrection(e.target.value)}
                placeholder="Describe what was done to correct the issue…"
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
              <p className="mt-1 text-[11px] text-neutral-500">
                Press <kbd className="rounded border border-neutral-700 bg-neutral-900 px-1 text-[10px]">Ctrl</kbd>/
                <kbd className="rounded border border-neutral-700 bg-neutral-900 px-1 text-[10px]">⌘</kbd>+
                <kbd className="rounded border border-neutral-700 bg-neutral-900 px-1 text-[10px]">Enter</kbd> to submit.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-neutral-800 px-5 py-3">
            <button
              className="rounded border border-neutral-700 bg-neutral-900 px-4 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              className="rounded bg-orange-500 px-4 py-1.5 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-60"
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