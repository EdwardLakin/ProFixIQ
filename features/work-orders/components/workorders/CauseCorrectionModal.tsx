// features/work-orders/components/workorders/CauseCorrectionModal.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@headlessui/react";

interface CauseCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  onSubmit: (jobId: string, cause: string, correction: string) => Promise<void>;
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
      await onSubmit(jobId, cause.trim(), correction.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
      <div className="relative bg-white dark:bg-neutral-900 rounded-lg p-5 w-full max-w-md z-50 mx-4 shadow-xl border border-neutral-800">
        <Dialog.Title className="text-lg font-bold mb-4 text-neutral-900 dark:text-neutral-100">
          Complete Job
        </Dialog.Title>

        <div className="mb-3">
          <label className="block text-sm mb-1 text-neutral-700 dark:text-neutral-300">Cause</label>
          <textarea
            ref={causeRef}
            rows={3}
            className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400"
            value={cause}
            onChange={(e) => setCause(e.target.value)}
            placeholder="What caused the issue?"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm mb-1 text-neutral-700 dark:text-neutral-300">Correction</label>
          <textarea
            rows={3}
            className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400"
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            placeholder="Describe what was done to correct the issue..."
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSubmit();
            }}
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            className="px-4 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "Saving…" : "Submit"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}