"use client";

import { CheckCircle2, Link2, PackageSearch, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  PartPicker,
  type PickedPart,
} from "@/features/parts/components/PartPicker";
import { isMenuIntakeItemReviewed } from "@/features/parts/lib/status-display";

export type MenuIntakeQueueItem = {
  id: string;
  description: string;
  partId: string | null;
  quantity: number;
  unitCost: number | null;
  unitPrice: number | null;
  quotedPrice: number | null;
};

type Props = {
  open: boolean;
  menuItemName: string;
  items: MenuIntakeQueueItem[];
  onClose: () => void;
  onChanged: () => Promise<void>;
};

type ReviewResponse = {
  ok?: boolean;
  error?: string;
  complete?: boolean;
  remainingItems?: number;
};

function asMoney(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? "Cost not reviewed"
    : `$${value.toFixed(2)} each`;
}

function isReviewed(item: MenuIntakeQueueItem): boolean {
  return isMenuIntakeItemReviewed({
    partId: item.partId,
    unitPrice: item.unitPrice,
    quotedPrice: item.quotedPrice,
    qtyRequested: item.quantity,
  });
}

export default function MenuItemPartsIntakeModal({
  open,
  menuItemName,
  items,
  onClose,
  onChanged,
}: Props) {
  const [localItems, setLocalItems] = useState(items);
  const [selectedItem, setSelectedItem] =
    useState<MenuIntakeQueueItem | null>(null);

  useEffect(() => {
    if (!open) return;
    setLocalItems(items);
  }, [items, open]);

  const reviewedCount = useMemo(
    () => localItems.filter(isReviewed).length,
    [localItems],
  );

  if (!open) return null;

  const reviewPart = async (selection: PickedPart) => {
    if (!selectedItem) throw new Error("Choose an intake row first.");
    if (
      selection.unit_cost === null ||
      !Number.isFinite(selection.unit_cost) ||
      selection.unit_cost < 0
    ) {
      throw new Error("Confirm a non-negative unit cost before using this part.");
    }

    const response = await fetch(
      `/api/parts/requests/items/${selectedItem.id}/menu-intake`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partId: selection.part_id,
          quantity: selection.qty,
          unitCost: selection.unit_cost,
          operationKey: selection.idempotency_key,
        }),
      },
    );
    const body = (await response.json().catch(() => null)) as
      | ReviewResponse
      | null;
    if (!response.ok || !body?.ok) {
      throw new Error(body?.error || "Unable to review this menu part.");
    }

    setLocalItems((current) =>
      current.map((item) =>
        item.id === selectedItem.id
          ? {
              ...item,
              partId: selection.part_id,
              quantity: selection.qty,
              unitCost: selection.unit_cost,
              unitPrice: selection.unit_cost,
              quotedPrice: selection.unit_cost,
            }
          : item,
      ),
    );
    setSelectedItem(null);
    await onChanged();

    if (body.complete) {
      toast.success("Menu recipe parts are catalog-linked and priced.");
      onClose();
      return;
    }

    toast.success(
      `${Number(body.remainingItems ?? 0)} menu ${Number(body.remainingItems ?? 0) === 1 ? "part remains" : "parts remain"} to review.`,
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-[400] flex items-center justify-center p-3 sm:p-6">
        <button
          type="button"
          aria-label="Close menu parts intake"
          className="absolute inset-0 bg-black/65 backdrop-blur-sm"
          onClick={onClose}
        />
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="menu-parts-intake-title"
          className="relative z-[410] flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] shadow-2xl"
        >
          <header className="flex items-start justify-between gap-4 border-b border-[color:var(--theme-border-soft)] px-4 py-4 sm:px-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-accent-text)]">
                Internal menu intake
              </p>
              <h2
                id="menu-parts-intake-title"
                className="mt-1 text-xl font-semibold text-[color:var(--theme-text-primary)]"
              >
                {menuItemName || "Service menu item"}
              </h2>
              <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
                Match every recipe row to the catalog and confirm its reusable
                quantity and unit cost.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="rounded-lg border border-[color:var(--theme-border-soft)] p-2 text-[color:var(--theme-text-secondary)] transition hover:bg-[color:var(--theme-surface-overlay)]"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="flex items-center justify-between border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 text-sm sm:px-6">
            <span className="text-[color:var(--theme-text-secondary)]">
              {reviewedCount} of {localItems.length} reviewed
            </span>
            <span className="font-medium text-[color:var(--theme-text-primary)]">
              {localItems.length - reviewedCount} remaining
            </span>
          </div>

          <div className="space-y-3 overflow-y-auto p-4 sm:p-6">
            {localItems.map((item) => {
              const reviewed = isReviewed(item);
              const cost =
                item.unitPrice ?? item.quotedPrice ?? item.unitCost ?? null;
              return (
                <article
                  key={item.id}
                  className="flex flex-col gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                        reviewed
                          ? "border-emerald-400/40 bg-emerald-500/10 text-[color:var(--theme-success-text)]"
                          : "border-orange-400/40 bg-orange-500/10 text-[color:var(--theme-accent-text)]"
                      }`}
                    >
                      {reviewed ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <PackageSearch className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-[color:var(--theme-text-primary)]">
                        {item.description || "Unnamed menu part"}
                      </h3>
                      <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                        Qty {item.quantity} · {asMoney(cost)}
                      </p>
                      <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                        {reviewed
                          ? "Catalog linked and cost confirmed"
                          : "Needs a catalog match and reviewed cost"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedItem(item)}
                    className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-orange-400/45 bg-orange-500/10 px-3 text-xs font-semibold text-[color:var(--theme-accent-text)] transition hover:bg-orange-500/20"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    {reviewed ? "Change match" : "Link and price"}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <PartPicker
        open={selectedItem !== null}
        channel="menu-parts-intake"
        initialSearch={selectedItem?.description ?? ""}
        initialQty={selectedItem?.quantity ?? 1}
        requireLocation={false}
        onClose={() => setSelectedItem(null)}
        onPick={reviewPart}
      />
    </>
  );
}
