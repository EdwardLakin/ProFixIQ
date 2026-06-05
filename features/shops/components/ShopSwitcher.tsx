"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/features/shared/utils/cn";

type AvailableShop = {
  id: string;
  name: string;
  current: boolean;
  membershipRole: string | null;
};

type AvailableShopsResponse = {
  currentShop: AvailableShop | null;
  shops: AvailableShop[];
  canSwitch: boolean;
  error?: string;
};

export default function ShopSwitcher({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [currentShop, setCurrentShop] = useState<AvailableShop | null>(null);
  const [shops, setShops] = useState<AvailableShop[]>([]);
  const [canSwitch, setCanSwitch] = useState(false);
  const [selectedShopId, setSelectedShopId] = useState("");
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadAvailableShops() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/shops/available", { cache: "no-store" });
        const payload = (await response.json()) as AvailableShopsResponse;

        if (!active) return;

        if (!response.ok) {
          setError(payload.error ?? "Unable to load shop context");
          return;
        }

        setCurrentShop(payload.currentShop ?? null);
        setShops(payload.shops ?? []);
        setCanSwitch(Boolean(payload.canSwitch));
        setSelectedShopId(payload.currentShop?.id ?? "");
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load shop context");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadAvailableShops();

    return () => {
      active = false;
    };
  }, []);

  const sortedShops = useMemo(() => {
    return [...shops].sort((a, b) => {
      if (a.current) return -1;
      if (b.current) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [shops]);

  async function handleSwitch() {
    if (!selectedShopId || selectedShopId === currentShop?.id) return;

    setSwitching(true);
    setError(null);

    try {
      const response = await fetch("/api/shops/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop_id: selectedShopId }),
      });
      const payload = (await response.json()) as AvailableShopsResponse;

      if (!response.ok) {
        const message = payload.error ?? "Unable to switch shops";
        setError(message);
        toast.error(message);
        return;
      }

      setCurrentShop(payload.currentShop ?? null);
      setShops(payload.shops ?? []);
      setCanSwitch((payload.shops ?? []).length > 1);
      setSelectedShopId(payload.currentShop?.id ?? selectedShopId);
      toast.success(`Switched to ${payload.currentShop?.name ?? "selected shop"}`);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to switch shops";
      setError(message);
      toast.error(message);
    } finally {
      setSwitching(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-neutral-400">
        Loading shop…
      </div>
    );
  }

  if (error && !currentShop) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-950/20 px-3 py-2 text-xs text-red-100">
        Shop context unavailable
      </div>
    );
  }

  if (!currentShop) return null;

  return (
    <div
      className={cn(
        "rounded-lg border backdrop-blur-md",
        compact ? "px-2.5 py-1.5" : "px-3 py-2",
      )}
      style={{
        borderColor: "color-mix(in srgb, var(--brand-primary,#C1663B) 28%, rgba(148,163,184,0.22))",
        background:
          "linear-gradient(135deg, rgba(0,0,0,0.58), color-mix(in srgb, var(--brand-secondary,#0F172A) 64%, black))",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Current shop
          </div>
          <div className="truncate text-xs font-semibold text-neutral-100" title={currentShop.name}>
            {currentShop.name}
          </div>
        </div>
        {!canSwitch ? (
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-neutral-400">
            Active
          </span>
        ) : null}
      </div>

      {canSwitch ? (
        <div className="mt-2 flex gap-1.5">
          <select
            aria-label="Switch active shop"
            value={selectedShopId}
            disabled={switching}
            onChange={(event) => setSelectedShopId(event.target.value)}
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/70 px-2 py-1 text-xs text-neutral-100 outline-none transition focus:border-[var(--brand-primary,#C1663B)]"
          >
            {sortedShops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name}{shop.current ? " (current)" : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={switching || selectedShopId === currentShop.id}
            onClick={handleSwitch}
            className="rounded-md border border-white/10 px-2 py-1 text-xs font-semibold text-neutral-100 transition hover:border-[var(--brand-primary,#C1663B)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {switching ? "Switching…" : "Switch"}
          </button>
        </div>
      ) : null}

      {error ? <div className="mt-1 text-[0.68rem] text-red-200">{error}</div> : null}
    </div>
  );
}
