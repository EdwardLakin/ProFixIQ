"use client";

import { RotateCcw } from "lucide-react";

import type {
  FieldRecentPartUse,
  FieldTruckInventorySnapshot,
} from "./truckInventoryContracts";
import { numeric } from "./truckInventoryContracts";
import { actionClass, quantityLabel } from "./truckInventoryUi";

type Props = {
  snapshot: FieldTruckInventorySnapshot;
  busy: boolean;
  handleReturn: (use: FieldRecentPartUse) => Promise<void>;
};

export default function TruckHistoryPanel({ snapshot, busy, handleReturn }: Props) {
  return (
    <section className="space-y-3">
      {snapshot.recentUses.map((use) => {
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
      {snapshot.recentUses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[color:var(--theme-border-soft)] p-8 text-center text-sm text-[color:var(--theme-text-muted)]">
          No truck parts have been used on this call yet.
        </div>
      ) : null}
    </section>
  );
}
