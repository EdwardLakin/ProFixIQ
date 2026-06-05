"use client";

import { useCallback, useEffect, useState } from "react";
import type { WorkOrderBoardRow, WorkOrderBoardVariant } from "../lib/workboard/types";

export function useWorkOrderBoard(
  variant: WorkOrderBoardVariant,
  opts?: {
    limit?: number;
    fleetId?: string | null;
  },
) {
  const [rows, setRows] = useState<WorkOrderBoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ variant });
    if (opts?.fleetId) params.set("fleetId", opts.fleetId);
    if (opts?.limit) params.set("limit", String(opts.limit));

    const res = await fetch(`/api/work-order-board?${params.toString()}`, { cache: "no-store" });
    const payload = (await res.json().catch(() => null)) as { rows?: WorkOrderBoardRow[]; error?: string } | null;

    if (!res.ok || !payload) {
      setError(payload?.error ?? "Unable to load work order board.");
      setRows([]);
      setLoading(false);
      return;
    }

    setRows(payload.rows ?? []);
    setLoading(false);
  }, [opts?.fleetId, opts?.limit, variant]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  return { rows, loading, error, refetch: fetchRows };
}
