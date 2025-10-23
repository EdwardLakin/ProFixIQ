"use client";

import { useState, useTransition } from "react";
import { PartPicker, type PickedPart } from "@parts/components/PartPicker";

export function UsePartButton({
  workOrderLineId,
  onApplied,
}: {
  workOrderLineId: string;
  onApplied?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const handlePick = (sel: PickedPart) => {
    setErr(null);
    start(async () => {
      try {
        const res = await fetch("/api/parts/consume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            work_order_line_id: workOrderLineId,
            part_id: sel.part_id,
            qty: sel.qty,
            location_id: sel.location_id,
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || "Failed to use part");

        onApplied?.();
        setOpen(false);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to use part");
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
        {pending ? "Applying…" : "Use Part"}
      </button>
      {err && <span className="ml-2 text-xs text-red-600">{err}</span>}

      <PartPicker open={open} onClose={() => setOpen(false)} onPick={handlePick} />
    </>
  );
}

