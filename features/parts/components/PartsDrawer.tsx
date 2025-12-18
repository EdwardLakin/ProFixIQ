"use client";

import { useCallback, useEffect, useState } from "react";
import PartPicker, { PickedPart } from "@/features/parts/components/PartPicker";
import PartsRequestModal from "@/features/work-orders/components/workorders/PartsRequestModal";
import { toast } from "sonner";
import { consumePart } from "@/features/work-orders/lib/parts/consumePart";

type SerializableVehicle = {
  year?: number | string | null;
  make?: string | null;
  model?: string | null;
} | null;

type Props = {
  open: boolean;
  workOrderId: string;
  workOrderLineId: string;
  vehicleSummary?: SerializableVehicle;
  jobDescription?: string | null;
  jobNotes?: string | null;
  closeEventName?: string;
};

export default function PartsDrawer({
  open,
  workOrderId,
  workOrderLineId,
  vehicleSummary: _vehicleSummary = null,
  jobDescription: _jobDescription = null,
  jobNotes: _jobNotes = null,
  closeEventName = "parts-drawer:closed",
}: Props) {
  const [tab, setTab] = useState<"use" | "request">("use");

  const emitClose = useCallback(() => {
    window.dispatchEvent(new CustomEvent(closeEventName));
  }, [closeEventName]);

  const handleUsePart = useCallback(
    async (picked: PickedPart) => {
      try {
        const qty = Number(picked.qty);
        if (!picked.part_id || !Number.isFinite(qty) || qty <= 0) {
          toast.error("Pick a part and quantity first.");
          return;
        }

        await consumePart({
          work_order_line_id: workOrderLineId,
          part_id: picked.part_id,
          qty,
          location_id: picked.location_id ?? undefined,
          unit_cost: picked.unit_cost ?? null,
          availability: picked.availability ?? null,
        });

        toast.success("Part used on job (inventory updated).");
        window.dispatchEvent(new CustomEvent("wo:parts-used"));
        emitClose();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to use part.";
        toast.error(msg);
      }
    },
    [emitClose, workOrderLineId],
  );

  useEffect(() => {
    if (!open) return;

    const onCloseReq = () => emitClose();
    const onSubmitted = () => {
      toast.success("Parts request submitted");
      emitClose();
    };

    window.addEventListener("parts-request:close", onCloseReq);
    window.addEventListener("parts-request:submitted", onSubmitted);
    return () => {
      window.removeEventListener("parts-request:close", onCloseReq);
      window.removeEventListener("parts-request:submitted", onSubmitted);
    };
  }, [open, emitClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[510]"
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={emitClose}
      />

      <div
        className="absolute inset-x-0 bottom-0 z-[520] w-full rounded-t-xl border border-orange-400 bg-neutral-950 p-0 text-white shadow-xl md:inset-auto md:top-1/2 md:left-1/2 md:h-[85vh] md:w-[960px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 p-3">
          <div className="flex items-center gap-2">
            <button
              className={`rounded px-3 py-1.5 text-sm ${
                tab === "use"
                  ? "border border-orange-500 text-orange-300"
                  : "border border-transparent text-neutral-300 hover:text-white"
              }`}
              onClick={() => setTab("use")}
            >
              Use from Inventory
            </button>
            <button
              className={`rounded px-3 py-1.5 text-sm ${
                tab === "request"
                  ? "border border-orange-500 text-orange-300"
                  : "border border-transparent text-neutral-300 hover:text-white"
              }`}
              onClick={() => setTab("request")}
            >
              Request to Purchase
            </button>
          </div>
          <button
            onClick={emitClose}
            className="rounded border border-neutral-700 px-2 py-1 text-sm text-neutral-200 hover:bg-neutral-800"
          >
            Close
          </button>
        </div>

        <div className="p-3">
          {tab === "use" ? (
            <PartPicker
              open={true}
              onClose={emitClose}
              onPick={handleUsePart}
              initialSearch=""
              workOrderId={workOrderId}
              workOrderLineId={workOrderLineId}
              jobDescription={_jobDescription}
              jobNotes={_jobNotes}
              vehicleSummary={_vehicleSummary}
            />
          ) : (
            <div className="relative">
              <PartsRequestModal
                isOpen={true}
                workOrderId={workOrderId}
                jobId={workOrderLineId}
                closeEventName="parts-request:close"
                submittedEventName="parts-request:submitted"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
