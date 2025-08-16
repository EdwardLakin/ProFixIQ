"use client";

import { useState } from "react";
import { Dialog } from "@headlessui/react";

interface CauseCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  onSubmit: (jobId: string, cause: string, correction: string) => Promise<void>;
}

export default function CauseCorrectionModal({
  isOpen,
  onClose,
  jobId,
  onSubmit,
}: CauseCorrectionModalProps) {
  const [cause, setCause] = useState("");
  const [correction, setCorrection] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    await onSubmit(jobId, cause, correction); // ✅ pass jobId
    setSubmitting(false);
    setCause("");
    setCorrection("");
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
      <div className="relative bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md z-50 mx-4">
        <Dialog.Title className="text-lg font-bold mb-4">
          Enter Cause and Correction
        </Dialog.Title>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Cause</label>
          <textarea
            rows={3}
            className="w-full border rounded p-2 text-sm"
            value={cause}
            onChange={(e) => setCause(e.target.value)}
            placeholder="Enter the root cause..."
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Correction</label>
          <textarea
            rows={3}
            className="w-full border rounded p-2 text-sm"
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            placeholder="Describe what was done to correct the issue..."
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 rounded"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "Saving..." : "Submit"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}