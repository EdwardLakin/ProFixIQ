"use client";
import { useState, useTransition } from "react";
import { adjustStock } from "@/features/parts/actions";

export function AdjustStockForm({ partId }: { partId: string }) {
  const [locationId, setLocationId] = useState("");
  const [qty, setQty] = useState<number>(0);
  const [pending, start] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          await adjustStock({
            part_id: partId,
            location_id: locationId,
            qty_change: qty,
            reason: qty >= 0 ? "receive" : "adjust",
          });
        });
      }}
      className="space-y-2"
    >
      <input
        className="border rounded px-3 py-2 w-full"
        placeholder="Location ID"
        value={locationId}
        onChange={(e) => setLocationId(e.target.value)}
      />
      <input
        className="border rounded px-3 py-2 w-full"
        placeholder="Qty (+/-)"
        type="number"
        step="0.01"
        value={qty}
        onChange={(e) =>
          setQty(parseFloat(e.target.value || "0"))
        }
      />
      <button
        disabled={pending}
        className="px-3 py-2 rounded-xl bg-neutral-900 text-white"
      >
        {pending ? "Saving…" : "Apply"}
      </button>
    </form>
  );
}
