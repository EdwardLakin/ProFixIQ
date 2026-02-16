// features/work-orders/components/UsePartButton.tsx
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

function asPositiveNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function asFiniteNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
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
        const partId =
          typeof sel.part_id === "string" && sel.part_id.length ? sel.part_id : null;

        const qty = asPositiveNumber(sel.qty);

        const locationId =
          typeof sel.location_id === "string" && sel.location_id.length
            ? sel.location_id
            : undefined;

        const unitCostRaw = asFiniteNumber(sel.unit_cost);
        const unitCost = typeof unitCostRaw === "number" ? unitCostRaw : undefined;

        const availability =
          typeof sel.availability === "string" ? sel.availability : null;

        if (!partId || !qty) {
          setErr("Pick a part and quantity first.");
          return;
        }

        await consumePart({
          work_order_line_id: workOrderLineId,
          part_id: partId,
          qty,
          location_id: locationId,
          ...(typeof unitCost === "number" ? { unit_cost: unitCost } : {}),
          availability,
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
        className="rounded-xl bg-neutral-900 px-3 py-2 text-white disabled:opacity-60"
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