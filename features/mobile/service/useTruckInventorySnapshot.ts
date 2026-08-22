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
import { isActionableFieldWorkOrderLine } from "./truckInventoryContracts";
import {
  asRouteLoadFailure,
  runBoundedRouteLoad,
  type RouteLoadFailure,
} from "@/features/shared/lib/route-load";

export function useTruckInventorySnapshot() {
  const [snapshot, setSnapshot] = useState<FieldTruckInventorySnapshot | null>(
    null,
  );
  const [scope, setScope] = useState<OfflineMutationScope | null>(null);
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadFailure, setLoadFailure] = useState<RouteLoadFailure | null>(null);
  const [query, setQuery] = useState("");
  const selectedTruckIdRef = useRef("");
  const [selectedTruckId, setSelectedTruckId] = useState("");
  const [selectedLineId, setSelectedLineId] = useState("");

  const load = useCallback(
    async (search = "", serviceVehicleId = selectedTruckIdRef.current) => {
      setLoading(true);
      setError(null);
      setLoadFailure(null);
      try {
        if (!online) throw new Error("offline");
        const next = await runBoundedRouteLoad(
          {
            route: "/mobile/service/truck-inventory",
            operation: "load truck inventory",
          },
          ({ signal }) =>
            fetchTruckInventorySnapshot({ search, serviceVehicleId, signal }),
        );
        setSnapshot(next);
        const resolvedTruckId = next.truck?.id ?? serviceVehicleId ?? "";
        selectedTruckIdRef.current = resolvedTruckId;
        setSelectedTruckId(resolvedTruckId);
        setSelectedLineId((current) => {
          const actionable = next.workOrderLines.filter(
            isActionableFieldWorkOrderLine,
          );
          return actionable.some((line) => line.id === current)
            ? current
            : actionable[0]?.id || "";
        });
        const resolvedScope =
          scope ??
          getOfflineMutationScope() ??
          (await resolveOfflineMutationScope({}));
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
          ? await loadCachedFieldTruckInventorySnapshot({
              scope: resolvedScope,
            })
          : null;
        if (cached) {
          setSnapshot(cached);
          const cachedTruckId = cached.truck?.id ?? serviceVehicleId ?? "";
          selectedTruckIdRef.current = cachedTruckId;
          setSelectedTruckId(cachedTruckId);
          setSelectedLineId((current) => {
            const actionable = cached.workOrderLines.filter(
              isActionableFieldWorkOrderLine,
            );
            return actionable.some((line) => line.id === current)
              ? current
              : actionable[0]?.id || "";
          });
          setError(
            online
              ? "Live truck inventory could not load. Showing the last cached snapshot."
              : "Offline — showing the last cached truck snapshot.",
          );
        } else {
          if (loadError instanceof Error && loadError.message === "offline") {
            setError("This device has no cached truck inventory yet.");
          } else {
            setLoadFailure(
              asRouteLoadFailure(
                loadError,
                "Live truck inventory could not be loaded.",
              ),
            );
          }
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
    loadFailure,
    query,
    setQuery,
    selectedTruckId,
    selectedLineId,
    setSelectedLineId,
    load,
    handleTruckChange,
  };
}
