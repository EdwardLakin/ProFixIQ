// features/work-orders/components/workorders/PartsDrawer.tsx (FULL FILE REPLACEMENT)
// Shared modal with tabs: Use from Inventory vs Request to Purchase.

"use client";

import { useCallback, useEffect, useState } from "react";
import PartPicker, {
  type PickedPart,
} from "@/features/parts/components/PartPicker";
import PartsRequestModal from "@/features/work-orders/components/workorders/PartsRequestModal";
import ModalShell from "@/features/shared/components/ModalShell";
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

function asFiniteNumberOrUndefined(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
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
  const [usePartPending, setUsePartPending] = useState(false);

  const emitClose = useCallback(() => {
    window.dispatchEvent(new CustomEvent(closeEventName));
  }, [closeEventName]);

  const handleUsePart = useCallback(
    async (picked: PickedPart) => {
      const qty = Number(picked.qty);
      if (!picked.part_id || !Number.isFinite(qty) || qty <= 0) {
        throw new Error("Pick a part and quantity first.");
      }
      if (!picked.location_id) {
        throw new Error("Pick an inventory location first.");
      }
      if (!picked.idempotency_key) {
        throw new Error("A stable operation key is required.");
      }

      const unitCost = asFiniteNumberOrUndefined(picked.unit_cost);
      const result = await consumePart({
        work_order_line_id: workOrderLineId,
        part_id: picked.part_id,
        qty,
        location_id: picked.location_id,
        ...(typeof unitCost === "number" ? { unit_cost: unitCost } : {}),
        idempotency_key: picked.idempotency_key,
      });
      if (!result.ok) {
        throw new Error(result.error);
      }

      toast.success("Part used on job (inventory updated).");
    },
    [workOrderLineId],
  );

  useEffect(() => {
    if (!open || tab !== "request") return;

    const onCloseReq = () => {
      if (!usePartPending) emitClose();
    };
    const onSubmitted = () => {
      if (usePartPending) return;
      toast.success("Parts request submitted");
      emitClose();
    };

    window.addEventListener("parts-request:close", onCloseReq);
    window.addEventListener("parts-request:submitted", onSubmitted);
    return () => {
      window.removeEventListener("parts-request:close", onCloseReq);
      window.removeEventListener("parts-request:submitted", onSubmitted);
    };
  }, [open, tab, usePartPending, emitClose]);

  if (!open) return null;

  const tabBtn = (active: boolean) =>
    active
      ? "rounded-full border border-[color:var(--accent-copper,#f97316)]/80 bg-gradient-to-r from-[color:var(--theme-surface-page)] via-[color:var(--accent-copper,#f97316)]/15 to-[color:var(--theme-surface-page)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)] shadow-[var(--theme-shadow-medium)] backdrop-blur-md"
      : "rounded-full border border-transparent px-4 py-2 text-sm text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]";

  return (
    <ModalShell
      isOpen={open}
      onClose={emitClose}
      title="Parts Drawer"
      size="xl"
      hideFooter
      bodyScrollable={false}
      busy={usePartPending}
    >
      <div className="flex max-h-[calc(100vh-9rem)] min-h-0 flex-col">
        <div
          role="tablist"
          aria-label="Parts workflow"
          className="flex flex-wrap items-center gap-2 border-b border-[color:var(--theme-border-soft)] pb-3"
        >
          <button
            className={tabBtn(tab === "use")}
            disabled={usePartPending}
            role="tab"
            aria-selected={tab === "use"}
            onClick={() => {
              if (!usePartPending) setTab("use");
            }}
            type="button"
          >
            Use from Inventory
          </button>
          <button
            className={tabBtn(tab === "request")}
            disabled={usePartPending}
            role="tab"
            aria-selected={tab === "request"}
            onClick={() => {
              if (!usePartPending) setTab("request");
            }}
            type="button"
          >
            Request to Purchase
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto pt-4">
          {tab === "use" ? (
            <div role="tabpanel">
              <PartPicker
                open={true}
                variant="inline"
                onClose={emitClose}
                onPick={handleUsePart}
                onSubmittingChange={setUsePartPending}
                requireLocation
                initialSearch=""
                workOrderId={workOrderId}
                workOrderLineId={workOrderLineId}
                jobDescription={jobDescription}
                jobNotes={jobNotes}
                vehicleSummary={vehicleSummary}
              />
            </div>
          ) : (
            <div role="tabpanel">
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
    </ModalShell>
  );
}
