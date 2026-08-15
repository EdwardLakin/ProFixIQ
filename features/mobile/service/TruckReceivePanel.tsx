"use client";

import { PackageCheck } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

import type {
  FieldOpenReceipt,
  FieldTruckInventorySnapshot,
} from "./truckInventoryContracts";
import { numeric } from "./truckInventoryContracts";
import { primaryClass, quantityLabel } from "./truckInventoryUi";

type Props = {
  snapshot: FieldTruckInventorySnapshot;
  online: boolean;
  busy: boolean;
  selectedReceiptId: string;
  setSelectedReceiptId: Dispatch<SetStateAction<string>>;
  selectedReceipt: FieldOpenReceipt | null;
  quantity: number;
  setQuantity: Dispatch<SetStateAction<number>>;
  receiveToTruck: () => Promise<void>;
};

export default function TruckReceivePanel({
  snapshot,
  online,
  busy,
  selectedReceiptId,
  setSelectedReceiptId,
  selectedReceipt,
  quantity,
  setQuantity,
  receiveToTruck,
}: Props) {
  return (
    <section className="space-y-4 rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4">
      <div>
        <h2 className="text-lg font-bold">Receive PO directly to truck</h2>
        <p className="text-sm text-[color:var(--theme-text-secondary)]">
          Receipt, request, work-order part, and inventory ledger retain the same part ID. Free-text PO lines are canonicalized here automatically.
        </p>
      </div>
      {!snapshot.canManageParts ? (
        <p className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-amber-100">
          Parts receiving permission is required.
        </p>
      ) : (
        <>
          <select
            value={selectedReceiptId}
            onChange={(event) => {
              setSelectedReceiptId(event.target.value);
              const receipt = snapshot.openReceipts.find(
                (item) => item.purchaseOrderLineId === event.target.value,
              );
              if (receipt) setQuantity(Math.min(1, numeric(receipt.remainingQuantity)) || 1);
            }}
            className="min-h-11 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3"
          >
            <option value="">Select open PO line</option>
            {snapshot.openReceipts.map((receipt) => (
              <option key={receipt.purchaseOrderLineId} value={receipt.purchaseOrderLineId}>
                {receipt.purchaseOrderNumber} · {receipt.description} · {quantityLabel(receipt.remainingQuantity)} remaining
              </option>
            ))}
          </select>
          <input
            type="number"
            min="0.01"
            step="0.01"
            max={selectedReceipt?.remainingQuantity ?? undefined}
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value || 0))}
            className="min-h-11 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3"
          />
          <button
            className={`${primaryClass} w-full`}
            disabled={!online || busy || !selectedReceipt || quantity <= 0}
            onClick={() => void receiveToTruck()}
          >
            <PackageCheck className="h-4 w-4" /> Receive to {snapshot.truck?.name}
          </button>
          {snapshot.openReceipts.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[color:var(--theme-border-soft)] p-6 text-center text-sm text-[color:var(--theme-text-muted)]">
              No purchase-order lines are waiting to be received.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
