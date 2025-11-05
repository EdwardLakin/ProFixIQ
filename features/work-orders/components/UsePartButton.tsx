"use client";

import { useState, useTransition } from "react";
import { consumePart } from "@work-orders/lib/parts/consumePart";
import { PartPicker, type PickedPart } from "@parts/components/PartPicker";

export function UsePartButton({
  workOrderLineId,
  onApplied,
  label = "Use Part", // 👈 new
}: {
  workOrderLineId: string;
  onApplied?: () => void;
  label?: string; // 👈 new
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
        });
        onApplied?.();
      } catch (e: any) {
        const m = e?.message || String(e) || "Failed to use part";
        setErr(m.replace(/^.*error:\s*/i, ""));
      }
    });
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-2 rounded-xl bg-neutral-900 text-white disabled:opacity-60"
        disabled={pending}
        title="Use/consume a part on this job line"
      >
        {pending ? "Applying…" : label}
      </button>
      {err && <span className="ml-2 text-xs text-red-500">{err}</span>}
      <PartPicker open={open} onClose={() => setOpen(false)} onPick={handlePick} />
    </>
  );
}