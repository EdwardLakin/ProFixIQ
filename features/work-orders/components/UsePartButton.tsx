// features/work-orders/components/UsePartButton.tsx
"use client";

import { useState } from "react";
import { consumePart } from "@/features/work-orders/lib/parts/consumePart";
import {
  PartPicker,
  type PickedPart,
} from "@/features/parts/components/PartPicker";

function asPositiveNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function asFiniteNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function UsePartButton({
  workOrderLineId,
  onApplied,
  label = "Use Part",
}: {
  workOrderLineId: string;
  onApplied?: () => void | Promise<void>;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  const handlePick = async (sel: PickedPart): Promise<void> => {
    const partId =
      typeof sel.part_id === "string" && sel.part_id.length
        ? sel.part_id
        : null;
    const qty = asPositiveNumber(sel.qty);
    const locationId =
      typeof sel.location_id === "string" && sel.location_id.length
        ? sel.location_id
        : null;
    const unitCostRaw = asFiniteNumber(sel.unit_cost);
    const unitCost = typeof unitCostRaw === "number" ? unitCostRaw : undefined;

    if (!partId || !qty) {
      throw new Error("Pick a part and quantity first.");
    }
    if (!locationId) {
      throw new Error("Pick an inventory location first.");
    }
    if (!sel.idempotency_key) {
      throw new Error("A stable operation key is required.");
    }

    const result = await consumePart({
      work_order_line_id: workOrderLineId,
      part_id: partId,
      qty,
      location_id: locationId,
      ...(typeof unitCost === "number" ? { unit_cost: unitCost } : {}),
      idempotency_key: sel.idempotency_key,
    });
    if (!result.ok) {
      throw new Error(result.error);
    }

    await onApplied?.();
  };

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="rounded-xl bg-[color:var(--theme-surface-panel)] px-3 py-2 text-[color:var(--theme-text-primary)] disabled:opacity-60"
        title="Use/consume a part on this job line"
        type="button"
      >
        {label}
      </button>

      <PartPicker
        open={open}
        onClose={() => setOpen(false)}
        onPick={handlePick}
        requireLocation
      />
    </>
  );
}
