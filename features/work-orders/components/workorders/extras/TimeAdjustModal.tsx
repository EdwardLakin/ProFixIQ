"use client";

import { useState } from "react";
import { format } from "date-fns";
import ModalShell from "@/features/shared/components/ModalShell";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  punchedInAt?: string | null;
  punchedOutAt?: string | null;
  onApply: (punchedInAt: string | null, punchedOutAt: string | null) => void | Promise<void>;
}

export default function TimeAdjustModal(props: any) {
  const { isOpen, onClose, punchedInAt, punchedOutAt, onApply } = props as Props;
  const [inAt, setInAt] = useState<string | "">(
    punchedInAt ? format(new Date(punchedInAt), "yyyy-MM-dd'T'HH:mm") : ""
  );
  const [outAt, setOutAt] = useState<string | "">(
    punchedOutAt ? format(new Date(punchedOutAt), "yyyy-MM-dd'T'HH:mm") : ""
  );

  const submit = async () => {
    const inVal = inAt ? new Date(inAt).toISOString() : null;
    const outVal = outAt ? new Date(outAt).toISOString() : null;
    await onApply(inVal, outVal);
    onClose();
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={submit}
      title="Adjust Time"
      submitText="Save"
      size="sm"
    >
      <div className="grid gap-3">
        <label className="block text-sm">
          <span className="mb-1 block text-neutral-400">Punch In</span>
          <input
            type="datetime-local"
            value={inAt}
            onChange={(e) => setInAt(e.target.value)}
            className="w-full rounded border border-neutral-300 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-neutral-400">Punch Out</span>
          <input
            type="datetime-local"
            value={outAt}
            onChange={(e) => setOutAt(e.target.value)}
            className="w-full rounded border border-neutral-300 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>
      </div>
    </ModalShell>
  );
}