// features/work-orders/components/workorders/PartsDrawer.tsx (FULL FILE REPLACEMENT)
// Themed to match Menu page (metal-card / copper accent / glass look)
// NOTE: PartPicker itself renders a modal; here we render it inline with a "forcedOpen" flag so it
// can reuse the same component without nesting backdrops.

"use client";

import { useCallback, useEffect, useState } from "react";
import PartPicker, { type PickedPart } from "@/features/parts/components/PartPicker";
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

  const tabBtn = (active: boolean) =>
    active
      ? "rounded-full border border-[color:var(--accent-copper,#f97316)]/80 bg-gradient-to-r from-black/80 via-[color:var(--accent-copper,#f97316)]/15 to-black/80 px-4 py-2 text-sm font-semibold text-neutral-50 shadow-[0_12px_30px_rgba(0,0,0,0.9)] backdrop-blur-md"
      : "rounded-full border border-transparent px-4 py-2 text-sm text-neutral-300 hover:text-white";

  return (
    <div
      className="fixed inset-0 z-[510]"
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={emitClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="absolute inset-x-0 bottom-0 z-[520] w-full overflow-hidden rounded-t-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 text-white shadow-[0_22px_45px_rgba(0,0,0,0.9)] backdrop-blur-xl md:inset-auto md:top-1/2 md:left-1/2 md:h-[85vh] md:w-[960px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* subtle radial like menu page */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.16),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.95),#020617_70%)]"
        />

        {/* Header */}
        <div className="metal-card flex items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-black/80 via-slate-950/80 to-black/80 px-4 py-3 md:px-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-400">
              Parts
            </div>
            <div
              className="text-lg font-semibold text-white"
              style={{ fontFamily: "var(--font-blackops), system-ui" }}
            >
              Parts Drawer
            </div>
          </div>

          <button
            onClick={emitClose}
            className="rounded-full border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 px-4 py-2 text-sm text-neutral-100 hover:border-[color:var(--accent-copper,#f97316)]/70 hover:bg-black/70"
          >
            Close
          </button>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3 md:px-5">
          <button className={tabBtn(tab === "use")} onClick={() => setTab("use")} type="button">
            Use from Inventory
          </button>
          <button
            className={tabBtn(tab === "request")}
            onClick={() => setTab("request")}
            type="button"
          >
            Request to Purchase
          </button>

          <div className="ml-auto hidden rounded-full border border-white/10 bg-black/50 px-3 py-1 text-[11px] text-neutral-300 md:block">
            Copper / glass theme
          </div>
        </div>

        {/* Body */}
        <div className="h-[70vh] overflow-auto p-4 md:h-[calc(85vh-120px)] md:p-5">
          {tab === "use" ? (
            // IMPORTANT: PartPicker itself is a modal component; if your PartPicker renders its own
            // backdrop/panel, you’ll want the *inline* variant (no fixed inset). If you already updated
            // PartPicker to match the menu theme, it likely still uses fixed positioning.
            // If so, use channel + open true but DO NOT wrap it in another modal elsewhere.
            <div className="metal-card rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.95)] backdrop-blur-xl md:p-4">
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
            </div>
          ) : (
            <div className="metal-card rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.95)] backdrop-blur-xl md:p-4">
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