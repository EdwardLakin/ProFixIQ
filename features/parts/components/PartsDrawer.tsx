"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import PartPicker, { PickedPart } from "@/features/parts/components/PartPicker";
import PartsRequestModal from "@/features/work-orders/components/workorders/PartsRequestModal";
import { toast } from "sonner";

type DB = Database;

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
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [tab, setTab] = useState<"use" | "request">("use");

  const emitClose = useCallback(() => {
    window.dispatchEvent(new CustomEvent(closeEventName));
  }, [closeEventName]);

  const handleUsePart = useCallback(
    async ({ part_id, location_id, qty }: PickedPart) => {
      try {
        let locId = location_id ?? null;

        if (!locId) {
          const { data: locs } = await supabase
            .from("stock_locations")
            .select("id, code")
            .order("code")
            .limit(50);

          const main = (locs ?? []).find(
            (l) => (l.code ?? "").toUpperCase() === "MAIN"
          );
          if (main?.id) locId = main.id as string;
        }

        const { error } = await supabase.from("work_order_part_allocations").insert({
          work_order_line_id: workOrderLineId,
          work_order_id: workOrderId,
          part_id,
          location_id: locId,
          qty,
        });

        if (error) throw error;
        toast.success("Part allocated to job.");
        window.dispatchEvent(new CustomEvent("wo:parts-used"));
        emitClose();
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to allocate part.");
      }
    },
    [emitClose, supabase, workOrderId, workOrderLineId]
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
        // keep clicks inside here, don't trigger parent rows
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