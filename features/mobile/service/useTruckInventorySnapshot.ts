"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  getOfflineMutationScope,
  resolveOfflineMutationScope,
  type OfflineMutationScope,
} from "@/features/shared/lib/offline/mutations";
import {
  cacheFieldTruckInventorySnapshot,
  loadCachedFieldTruckInventorySnapshot,
} from "./truckInventoryOffline";
import { fetchTruckInventorySnapshot } from "./truckInventoryClient";
import type { FieldTruckInventorySnapshot } from "./truckInventoryContracts";

export function useTruckInventorySnapshot() {
  const [snapshot, setSnapshot] = useState<FieldTruckInventorySnapshot | null>(null);
  const [scope, setScope] = useState<OfflineMutationScope | null>(null);
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const selectedTruckIdRef = useRef("");
  const [selectedTruckId, setSelectedTruckId] = useState("");
  const [selectedLineId, setSelectedLineId] = useState("");

  const load = useCallback(
    async (search = "", serviceVehicleId = selectedTruckIdRef.current) => {
      setLoading(true);
      setError(null);
      try {
        if (!online) throw new Error("offline");
        const next = await fetchTruckInventorySnapshot({ search, serviceVehicleId });
        setSnapshot(next);
        const resolvedTruckId = next.truck?.id ?? serviceVehicleId ?? "";
        selectedTruckIdRef.current = resolvedTruckId;
        setSelectedTruckId(resolvedTruckId);
        setSelectedLineId((current) => current || next.workOrderLines[0]?.id || "");
        const resolvedScope =
          scope ?? getOfflineMutationScope() ?? (await resolveOfflineMutationScope({}));
        if (resolvedScope) {
          setScope(resolvedScope);
          await cacheFieldTruckInventorySnapshot({
            scope: resolvedScope,
            snapshot: next,
          });
        }
      } catch (loadError) {
        const resolvedScope = scope ?? getOfflineMutationScope();
        const cached = resolvedScope
          ? await loadCachedFieldTruckInventorySnapshot({ scope: resolvedScope })
          : null;
        if (cached) {
          setSnapshot(cached);
          const cachedTruckId = cached.truck?.id ?? serviceVehicleId ?? "";
          selectedTruckIdRef.current = cachedTruckId;
          setSelectedTruckId(cachedTruckId);
          setSelectedLineId(
            (current) => current || cached.workOrderLines[0]?.id || "",
          );
          setError(
            online
              ? "Live truck inventory could not load. Showing the last cached snapshot."
              : "Offline — showing the last cached truck snapshot.",
          );
        } else {
          setError(
            loadError instanceof Error && loadError.message !== "offline"
              ? loadError.message
              : "This device has no cached truck inventory yet.",
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [online, scope],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      void load();
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [load]);

  const handleTruckChange = useCallback(
    (truckId: string) => {
      selectedTruckIdRef.current = truckId;
      setSelectedTruckId(truckId);
      setSelectedLineId("");
      void load(query, truckId);
    },
    [load, query],
  );

  return {
    snapshot,
    setSnapshot,
    scope,
    online,
    loading,
    error,
    query,
    setQuery,
    selectedTruckId,
    selectedLineId,
    setSelectedLineId,
    load,
    handleTruckChange,
  };
}
