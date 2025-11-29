// features/work-orders/components/workorders/CostEstimateModal.tsx
"use client";

import { useState } from "react";
import ModalShell from "@/features/shared/components/ModalShell";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultLaborHours?: number | null;
  defaultPrice?: number | null;
  onApply: (laborHours: number | null, price: number | null) => void | Promise<void>;
}

export default function CostEstimateModal({
  isOpen,
  onClose,
  defaultLaborHours = null,
  defaultPrice = null,
  onApply,
}: Props) {
  const [labor, setLabor] = useState<string>(
    typeof defaultLaborHours === "number" ? String(defaultLaborHours) : "",
  );
  const [price, setPrice] = useState<string>(
    typeof defaultPrice === "number" ? String(defaultPrice) : "",
  );
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const lh = labor.trim() ? Number(labor) : null;
      const pr = price.trim() ? Number(price) : null;
      await onApply(lh, pr);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={submit}
      title="Cost / Estimate"
      submitText={submitting ? "Saving…" : "Save"}
      size="sm"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Labor (hrs)
          </span>
          <input
            type="number"
            step="0.1"
            min="0"
            value={labor}
            onChange={(e) => setLabor(e.target.value)}
            className="w-full rounded border border-border/60 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
            placeholder="e.g. 1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Price ($)
          </span>
          <input
            type="number"
            step="1"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full rounded border border-border/60 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
            placeholder="e.g. 250"
          />
        </label>
      </div>
    </ModalShell>
  );
}