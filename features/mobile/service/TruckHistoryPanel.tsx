"use client";

import { RotateCcw } from "lucide-react";

import type {
  FieldRecentPartUse,
  FieldTruckInventoryMovement,
  FieldTruckInventorySnapshot,
} from "./truckInventoryContracts";
import { aggregateRecentPartUses, numeric } from "./truckInventoryContracts";
import { actionClass, quantityLabel } from "./truckInventoryUi";

type Props = {
  snapshot: FieldTruckInventorySnapshot;
  busy: boolean;
  handleReturn: (use: FieldRecentPartUse) => Promise<void>;
};

const MOVEMENT_LABELS: Record<string, string> = {
  receive: "Received to truck",
  transfer_in: "Loaded onto truck",
  consume: "Used on call",
  return: "Returned to truck",
  adjust: "Inventory adjusted",
  wo_allocate: "Reserved for work",
  wo_release: "Reservation released",
  seed: "Opening inventory",
};

function movementLabel(movement: FieldTruckInventoryMovement): string {
  return (
    MOVEMENT_LABELS[movement.reason] ??
    (movement.direction === "in" ? "Added to truck" : "Removed from truck")
  );
}

function movementContext(movement: FieldTruckInventoryMovement): string[] {
  const context: string[] = [];
  if (movement.sourceLocationName && movement.destinationLocationName) {
    context.push(
      `${movement.sourceLocationName} → ${movement.destinationLocationName}`,
    );
  } else if (movement.destinationLocationName) {
    context.push(movement.destinationLocationName);
  }
  if (movement.purchaseOrderNumber) {
    context.push(`PO ${movement.purchaseOrderNumber}`);
  }
  if (movement.workOrderNumber) {
    context.push(`WO ${movement.workOrderNumber}`);
  }
  if (movement.actorName) context.push(movement.actorName);
  return context;
}

export default function TruckHistoryPanel({
  snapshot,
  busy,
  handleReturn,
}: Props) {
  const recentUses = aggregateRecentPartUses(snapshot.recentUses);
  const movements = snapshot.movements ?? [];
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold">Return parts from this call</h2>
          <p className="text-sm text-[color:var(--theme-text-secondary)]">
            Returns restore the same truck location and work-order part ledger.
          </p>
        </div>
        {recentUses.map((use) => {
          const returnable = Math.max(
            0,
            numeric(use.quantity) - numeric(use.returnedQuantity),
          );
          return (
            <article
              key={use.stockMoveId}
              className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold">{use.name}</h3>
                  <p className="text-xs text-[color:var(--theme-text-secondary)]">
                    {use.partNumber || use.partId}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <strong>{quantityLabel(use.quantity)} used</strong>
                  <div className="text-xs text-[color:var(--theme-text-muted)]">
                    {new Date(use.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className={`${actionClass} mt-3 w-full`}
                disabled={busy || returnable <= 0}
                onClick={() => void handleReturn(use)}
              >
                <RotateCcw className="h-4 w-4" />
                {returnable > 0
                  ? `Return ${quantityLabel(returnable)} to truck`
                  : "Fully returned"}
              </button>
            </article>
          );
        })}
        {recentUses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[color:var(--theme-border-soft)] p-6 text-center text-sm text-[color:var(--theme-text-muted)]">
            No truck parts have been used on this call yet.
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold">Truck movement history</h2>
          <p className="text-sm text-[color:var(--theme-text-secondary)]">
            Receive, transfer, use, return, and reservation entries from the
            canonical stock ledger.
          </p>
        </div>
        {movements.map((movement) => {
          const context = movementContext(movement);
          return (
            <article
              key={movement.id}
              className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
                    {movementLabel(movement)}
                  </p>
                  <h3 className="mt-1 truncate font-bold">
                    {movement.partName}
                  </h3>
                  <p className="text-xs text-[color:var(--theme-text-secondary)]">
                    {movement.partNumber || movement.partId}
                  </p>
                  {context.length > 0 ? (
                    <p className="mt-2 text-xs text-[color:var(--theme-text-muted)]">
                      {context.join(" · ")}
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <strong
                    className={
                      movement.direction === "in"
                        ? "text-emerald-500"
                        : "text-amber-500"
                    }
                  >
                    {movement.direction === "in" ? "+" : "−"}
                    {quantityLabel(movement.quantity)}
                  </strong>
                  <div className="text-xs text-[color:var(--theme-text-muted)]">
                    {new Date(movement.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
        {movements.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[color:var(--theme-border-soft)] p-6 text-center text-sm text-[color:var(--theme-text-muted)]">
            No inventory movement has been recorded for this truck yet.
          </div>
        ) : null}
      </section>
    </div>
  );
}
