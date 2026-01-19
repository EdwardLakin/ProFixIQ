// features/work-orders/components/UsepartButton.tsx
"use client";

import { useState, useTransition } from "react";
import { consumePart } from "@work-orders/lib/parts/consumePart";
import { PartPicker, type PickedPart } from "@parts/components/PartPicker";

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return "Failed to use part";
  }
}

export function UsePartButton({
  workOrderLineId,
  onApplied,
  label = "Use Part",
}: {
  workOrderLineId: string;
  onApplied?: () => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const handlePick = (sel: PickedPart) => {
    setErr(null);
    start(async () => {
      try {
        await consumePart({
          work_order_line_id: workOrderLineId,
          part_id: sel.part_id,
          qty: sel.qty,
          location_id: sel.location_id,
          unit_cost: sel.unit_cost ?? null,
          availability: sel.availability ?? null,
        });
        onApplied?.();
      } catch (e: unknown) {
        const m = errorMessage(e) || "Failed to use part";
        setErr(m.replace(/^.*error:\s*/i, ""));
      }
    });
  };

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="px-3 py-2 rounded-xl bg-neutral-900 text-white disabled:opacity-60"
        disabled={pending}
        title="Use/consume a part on this job line"
        type="button"
      >
        {pending ? "Applying…" : label}
      </button>

      {err && <span className="ml-2 text-xs text-red-500">{err}</span>}

      <PartPicker open={open} onClose={() => setOpen(false)} onPick={handlePick} />
    </>
  );
}