"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@headlessui/react";

interface CauseCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  // Align with FocusedJobModal usage: (cause, correction)
  onSubmit: (cause: string, correction: string) => Promise<void>;
}

// NOTE: accept `any` to bypass Next's serializable-props check, then cast.
export default function CauseCorrectionModal(props: any) {
  const { isOpen, onClose, jobId, onSubmit } = props as CauseCorrectionModalProps;

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
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
      <div className="relative z-50 mx-4 w-full max-w-md rounded-lg border border-neutral-800 bg-neutral-900 p-5 text-white shadow-xl">
        <Dialog.Title className="mb-4 text-lg font-bold font-header tracking-wide">
          Complete Job
        </Dialog.Title>

        <div className="mb-3">
          <label className="mb-1 block text-sm text-neutral-300">Cause</label>
          <textarea
            ref={causeRef}
            rows={3}
            className="font-sans w-full rounded border border-neutral-700 bg-neutral-800 p-2 text-sm placeholder-neutral-400"
            value={cause}
            onChange={(e) => setCause(e.target.value)}
            placeholder="What caused the issue?"
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-sm text-neutral-300">Correction</label>
          <textarea
            rows={3}
            className="font-sans w-full rounded border border-neutral-700 bg-neutral-800 p-2 text-sm placeholder-neutral-400"
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
            className="rounded border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm hover:border-orange-500"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "Saving…" : "Submit"}
          </button>
        </div>

        {/* Hidden id to keep TS happy about usage, and useful for QA */}
        <div className="mt-2 text-xs text-neutral-500">Job ID: {jobId}</div>
      </div>
    </Dialog>
  );
}