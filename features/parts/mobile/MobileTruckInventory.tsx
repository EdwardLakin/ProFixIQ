"use client";

import { Boxes, RefreshCw, Search, Truck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type TruckInventoryItem = {
  partId: string;
  sku: string | null;
  partNumber: string | null;
  name: string;
  description: string | null;
  category: string | null;
  qtyOnHand: number;
  qtyReserved: number;
  qtyAvailable: number;
};

type TruckInventorySnapshot = {
  serverNow: string;
  visit: {
    id: string;
    workOrderId: string | null;
    workOrderNumber: string | null;
    status: string;
    kind: "active" | "next";
  } | null;
  truck: {
    id: string;
    name: string;
    unitNumber: string | null;
    stockLocationId: string | null;
  } | null;
  items: TruckInventoryItem[];
  error?: string;
};

function formatQty(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3">
      <div className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
        {label}
      </div>
      <div className="mt-1 text-xl font-extrabold text-[color:var(--theme-text-primary)]">
        {value}
      </div>
    </div>
  );
}

export default function MobileTruckInventory() {
  const [snapshot, setSnapshot] = useState<TruckInventorySnapshot | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/mobile/service-visits/truck-inventory", {
        credentials: "include",
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as
        | TruckInventorySnapshot
        | null;
      if (!response.ok || !body || body.error) {
        throw new Error(body?.error || "Unable to load assigned truck inventory.");
      }
      setSnapshot(body);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load assigned truck inventory.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return snapshot?.items ?? [];
    return (snapshot?.items ?? []).filter((item) =>
      [
        item.name,
        item.sku,
        item.partNumber,
        item.description,
        item.category,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [query, snapshot?.items]);

  const totals = useMemo(() => {
    const items = snapshot?.items ?? [];
    return {
      skuCount: items.length,
      onHand: items.reduce((sum, item) => sum + item.qtyOnHand, 0),
      available: items.reduce((sum, item) => sum + item.qtyAvailable, 0),
    };
  }, [snapshot?.items]);

  if (loading && !snapshot) {
    return (
      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-5 text-sm text-[color:var(--theme-text-secondary)]">
        Loading assigned truck inventory…
      </section>
    );
  }

  if (error && !snapshot) {
    return (
      <section className="rounded-3xl border border-red-500/35 bg-red-500/10 p-5">
        <p className="text-sm font-semibold text-red-700 dark:text-red-200">{error}</p>
        <button
          type="button"
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-4 text-sm font-bold text-[color:var(--theme-text-primary)]"
          onClick={() => void load()}
        >
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </section>
    );
  }

  if (!snapshot?.visit) {
    return (
      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-5">
        <div className="flex items-start gap-3">
          <Boxes className="mt-0.5 h-5 w-5 text-[color:var(--accent-copper)]" />
          <div>
            <h2 className="font-bold text-[color:var(--theme-text-primary)]">No assigned service call</h2>
            <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
              Truck inventory appears here when you have an active or next Field Service visit.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (!snapshot.truck?.stockLocationId) {
    return (
      <section className="rounded-3xl border border-amber-500/35 bg-amber-500/10 p-5">
        <div className="flex items-start gap-3">
          <Truck className="mt-0.5 h-5 w-5 text-amber-700 dark:text-amber-200" />
          <div>
            <h2 className="font-bold text-amber-800 dark:text-amber-100">No truck stock location assigned</h2>
            <p className="mt-1 text-sm text-amber-800/80 dark:text-amber-100/80">
              This service call needs a service vehicle with a linked stock location before truck inventory can be shown.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-medium)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[color:var(--accent-copper)]">
              {snapshot.visit.kind === "active" ? "Active service call" : "Next service call"}
            </div>
            <h2 className="mt-1 flex items-center gap-2 text-xl font-extrabold text-[color:var(--theme-text-primary)]">
              <Truck className="h-5 w-5 shrink-0" />
              <span className="truncate">{snapshot.truck.name}</span>
            </h2>
            <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
              {snapshot.truck.unitNumber ? `Unit ${snapshot.truck.unitNumber} · ` : ""}
              {snapshot.visit.workOrderNumber || "Service visit"}
            </p>
          </div>
          <button
            type="button"
            aria-label="Refresh truck inventory"
            disabled={loading}
            onClick={() => void load()}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 text-sm font-bold text-[color:var(--theme-text-primary)] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Metric label="SKUs" value={String(totals.skuCount)} />
          <Metric label="On hand" value={formatQty(totals.onHand)} />
          <Metric label="Available" value={formatQty(totals.available)} />
        </div>
      </section>

      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-medium)]">
        <label htmlFor="truck-inventory-search" className="text-sm font-bold text-[color:var(--theme-text-primary)]">
          Search truck stock
        </label>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--theme-text-muted)]" />
          <input
            id="truck-inventory-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Part, SKU, number or category"
            className="min-h-12 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] pl-10 pr-3 text-base text-[color:var(--theme-text-primary)]"
          />
        </div>

        {error ? (
          <p className="mt-3 text-sm text-red-700 dark:text-red-200">{error}</p>
        ) : null}

        {!loading && snapshot.items.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-5 text-sm text-[color:var(--theme-text-secondary)]">
            This truck has no physical stock or reserved parts in the canonical inventory ledger.
          </div>
        ) : null}

        {!loading && snapshot.items.length > 0 && filteredItems.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-5 text-sm text-[color:var(--theme-text-secondary)]">
            No truck-stock items match that search.
          </div>
        ) : null}

        <div className="mt-4 grid gap-2">
          {filteredItems.map((item) => (
            <article
              key={item.partId}
              className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-extrabold text-[color:var(--theme-text-primary)]">
                    {item.name}
                  </h3>
                  <p className="mt-0.5 truncate text-xs text-[color:var(--theme-text-secondary)]">
                    {[item.sku || item.partNumber, item.category].filter(Boolean).join(" · ") || "Inventory part"}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-2.5 py-1 text-xs font-bold text-[color:var(--theme-text-primary)]">
                  {formatQty(item.qtyAvailable)} available
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-[10px] text-[color:var(--theme-text-secondary)]">
                {[
                  ["On hand", item.qtyOnHand],
                  ["Reserved", item.qtyReserved],
                  ["Available", item.qtyAvailable],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-2"
                  >
                    <span className="block">{label}</span>
                    <strong className="mt-0.5 block text-sm text-[color:var(--theme-text-primary)]">
                      {formatQty(Number(value))}
                    </strong>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
