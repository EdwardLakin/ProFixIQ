"use client";

import { useState, useTransition } from "react";
import { consumePart } from "@work-orders/lib/parts/consumePart";

export function UsePartButton({ workOrderLineId }: { workOrderLineId: string }) {
  const [open, setOpen] = useState(false);
  const [partId, setPartId] = useState("");
  const [qty, setQty] = useState<number>(1);
  const [locationId, setLocationId] = useState<string>("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="inline-flex">
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-2 rounded-xl bg-neutral-900 text-white"
      >
        Use Part
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-4 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-lg">Use Part</h3>
              <button onClick={() => setOpen(false)} className="text-neutral-500">✕</button>
            </div>

            {err && <div className="text-sm text-red-600">{err}</div>}

            <label className="block">
              <div className="text-sm font-medium mb-1">Part ID</div>
              <input
                className="border rounded w-full px-3 py-2"
                value={partId}
                onChange={(e) => setPartId(e.target.value)}
                placeholder="UUID of the part"
              />
              <div className="text-xs text-neutral-500 mt-1">
                (We’ll add a proper picker later)
              </div>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <div className="text-sm font-medium mb-1">Qty</div>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="border rounded w-full px-3 py-2"
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value || 0))}
                />
              </label>

              <label className="block">
                <div className="text-sm font-medium mb-1">Location ID</div>
                <input
                  className="border rounded w-full px-3 py-2"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  placeholder="optional (defaults to MAIN)"
                />
              </label>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                className="px-3 py-2 rounded-xl border"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-2 rounded-xl bg-neutral-900 text-white disabled:opacity-60"
                disabled={pending || !partId || qty <= 0}
                onClick={() => {
                  setErr(null);
                  start(async () => {
                    try {
                      await consumePart({
                        work_order_line_id: workOrderLineId,
                        part_id: partId,
                        qty,
                        location_id: locationId || undefined,
                      });
                      setOpen(false);
                      // reload to show updated allocations/stock on the page (if needed)
                      window.location.reload();
                    } catch (e: any) {
                      setErr(e?.message ?? "Failed to use part");
                    }
                  });
                }}
              >
                {pending ? "Applying…" : "Use Part"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
