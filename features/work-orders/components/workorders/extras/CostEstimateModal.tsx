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

export default function CostEstimateModal(props: any) {
  const {
    isOpen,
    onClose,
    defaultLaborHours = null,
    defaultPrice = null,
    onApply,
  } = props as Props;

  const [labor, setLabor] = useState<string>(
    typeof defaultLaborHours === "number" ? String(defaultLaborHours) : ""
  );
  const [price, setPrice] = useState<string>(
    typeof defaultPrice === "number" ? String(defaultPrice) : ""
  );

  const submit = async () => {
    const lh = labor.trim() ? Number(labor) : null;
    const pr = price.trim() ? Number(price) : null;
    await onApply(lh, pr);
    onClose();
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={submit}
      title="Cost / Estimate"
      submitText="Save"
      size="sm"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-neutral-400">Labor (hrs)</span>
          <input
            type="number"
            step="0.1"
            min="0"
            value={labor}
            onChange={(e) => setLabor(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white placeholder:text-neutral-400"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-neutral-400">Price ($)</span>
          <input
            type="number"
            step="1"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white placeholder:text-neutral-400"
          />
        </label>
      </div>
    </ModalShell>
  );
}