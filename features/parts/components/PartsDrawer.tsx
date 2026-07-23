// features/work-orders/components/workorders/PartsDrawer.tsx (FULL FILE REPLACEMENT)
// Drawer modal with tabs: Use from Inventory vs Request to Purchase
// IMPORTANT: PartPicker must be rendered inline (no fixed inset/backdrop) to avoid nested modals.
// This file assumes PartPicker supports `variant="inline"`.

"use client";

import { useCallback, useEffect, useState } from "react";
import PartPicker, {
  type PickedPart,
} from "@/features/parts/components/PartPicker";
import PartsRequestModal from "@/features/work-orders/components/workorders/PartsRequestModal";
import { toast } from "sonner";
import { consumePart } from "@/features/work-orders/lib/parts/consumePart";

type SerializableVehicle =
  | {
      year?: number | string | null;
      make?: string | null;
      model?: string | null;
    }
  | null;

type Props = {
  open: boolean;
  workOrderId: string;
  workOrderLineId: string;
  vehicleSummary?: SerializableVehicle;
  jobDescription?: string | null;
  jobNotes?: string | null;
  closeEventName?: string;
};

function asFiniteNumberOrUndefined(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export default function PartsDrawer({
  open,
  workOrderId,
  workOrderLineId,
  vehicleSummary = null,
  jobDescription = null,
  jobNotes = null,
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

        const unitCost = asFiniteNumberOrUndefined(picked.unit_cost);

        await consumePart({
          work_order_line_id: workOrderLineId,
          part_id: picked.part_id,
          qty,
          location_id: picked.location_id ?? undefined,
          ...(typeof unitCost === "number" ? { unit_cost: unitCost } : {}),
          availability: picked.availability ?? null,
        });

        toast.success("Part used on job (inventory updated).");
        window.dispatchEvent(new CustomEvent("wo:parts-used"));
        emitClose();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to use part.";
        toast.error(msg);
        throw e;
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
      ? "rounded-full border border-[color:var(--accent-copper,#f97316)]/80 bg-gradient-to-r from-[color:var(--theme-surface-page)] via-[color:var(--accent-copper,#f97316)]/15 to-[color:var(--theme-surface-page)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)] shadow-[var(--theme-shadow-medium)] backdrop-blur-md"
      : "rounded-full border border-transparent px-4 py-2 text-sm text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]";

  return (
    <div className="fixed inset-0 z-[510]" onClick={(e) => e.stopPropagation()}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[color:var(--theme-surface-overlay)] backdrop-blur-sm"
        onClick={emitClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="absolute inset-x-0 bottom-0 z-[520] w-full overflow-hidden rounded-t-2xl border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-overlay)] text-[color:var(--theme-text-primary)] shadow-[var(--theme-shadow-medium)] backdrop-blur-xl md:inset-auto md:top-1/2 md:left-1/2 md:h-[85vh] md:w-[960px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* subtle radial like menu page */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[var(--theme-gradient-panel)]"
        />

        {/* Header */}
        <div className="metal-card flex items-center justify-between gap-3 border-b border-[color:var(--theme-border-soft)] bg-gradient-to-r from-[color:var(--theme-surface-page)] via-[color:var(--theme-surface-panel)] to-[color:var(--theme-surface-page)] px-4 py-3 md:px-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--theme-text-secondary)]">
              Parts
            </div>
            <div
              className="text-lg font-semibold text-[color:var(--theme-text-primary)]"
              style={{ fontFamily: "var(--font-blackops), system-ui" }}
            >
              Parts Drawer
            </div>
          </div>

          <button
            onClick={emitClose}
            className="rounded-full border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-overlay)] px-4 py-2 text-sm text-[color:var(--theme-text-primary)] hover:border-[color:var(--accent-copper,#f97316)]/70 hover:bg-[color:var(--theme-surface-overlay)]"
          >
            Close
          </button>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--theme-border-soft)] px-4 py-3 md:px-5">
          <button
            className={tabBtn(tab === "use")}
            onClick={() => setTab("use")}
            type="button"
          >
            Use from Inventory
          </button>
          <button
            className={tabBtn(tab === "request")}
            onClick={() => setTab("request")}
            type="button"
          >
            Request to Purchase
          </button>

          <div className="ml-auto hidden rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1 text-[11px] text-[color:var(--theme-text-secondary)] md:block">
            Copper / glass theme
          </div>
        </div>

        {/* Body */}
        <div className="h-[70vh] overflow-auto p-4 md:h-[calc(85vh-120px)] md:p-5">
          {tab === "use" ? (
            <div className="metal-card rounded-2xl border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-overlay)] p-3 shadow-[var(--theme-shadow-medium)] backdrop-blur-xl md:p-4">
              <PartPicker
                open={true}
                variant="inline"
                onClose={emitClose}
                onPick={handleUsePart}
                initialSearch=""
                workOrderId={workOrderId}
                workOrderLineId={workOrderLineId}
                jobDescription={jobDescription}
                jobNotes={jobNotes}
                vehicleSummary={vehicleSummary}
              />
            </div>
          ) : (
            <div className="metal-card rounded-2xl border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-overlay)] p-3 shadow-[var(--theme-shadow-medium)] backdrop-blur-xl md:p-4">
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
