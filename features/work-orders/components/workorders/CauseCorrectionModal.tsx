"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@headlessui/react";

interface CauseCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  onSubmit: (cause: string, correction: string) => Promise<void>;
}

export default function CauseCorrectionModal(props: any) {
  const { isOpen, onClose, jobId, onSubmit } =
    props as CauseCorrectionModalProps;

  const [cause, setCause] = useState("");
  const [correction, setCorrection] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const causeRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCause("");
      setCorrection("");
      setTimeout(() => causeRef.current?.focus(), 50);
    }
  }, [isOpen]);

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
      className="fixed inset-0 z-[320] flex items-center justify-center"
    >
      {/* Backdrop (above FocusedJobModal, below panel) */}
      <div
        className="fixed inset-0 z-[320] bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-[330] mx-4 w-full max-w-md rounded-lg border border-orange-400 bg-neutral-950 p-5 text-white shadow-xl">
        <Dialog.Title className="mb-4 text-lg font-header font-semibold tracking-wide">
          Complete Job
        </Dialog.Title>

        <div className="mb-3">
          <label className="mb-1 block text-sm font-sans text-neutral-300">
            Cause
          </label>
          <textarea
            ref={causeRef}
            rows={3}
            className="font-sans w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm text-white placeholder-neutral-400"
            value={cause}
            onChange={(e) => setCause(e.target.value)}
            placeholder="What caused the issue?"
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-sans text-neutral-300">
            Correction
          </label>
          <textarea
            rows={3}
            className="font-sans w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm text-white placeholder-neutral-400"
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            placeholder="Describe what was done to correct the issue…"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSubmit();
            }}
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            className="font-header rounded border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className="font-header rounded border border-orange-500 px-4 py-2 text-sm hover:bg-orange-500/10 disabled:opacity-60"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "Saving…" : "Submit"}
          </button>
        </div>

        <div className="mt-2 text-xs text-neutral-500">Job ID: {jobId}</div>
      </div>
    </Dialog>
  );
}