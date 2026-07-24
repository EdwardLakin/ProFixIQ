"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { WorkOrderBoardRow, WorkOrderBoardVariant } from "../lib/workboard/types";
import {
  countOpenPartsObligationsByWorkOrder,
  reconcileBoardPartsState,
  type OpenPartsItem,
  type OpenPartsRequest,
} from "@/features/parts/lib/open-parts-obligations";

type ViewName =
  | "v_work_order_board_cards_shop"
  | "v_work_order_board_cards_fleet"
  | "v_work_order_board_cards_portal";

function viewForVariant(variant: WorkOrderBoardVariant): ViewName {
  if (variant === "fleet") return "v_work_order_board_cards_fleet";
  if (variant === "portal") return "v_work_order_board_cards_portal";
  return "v_work_order_board_cards_shop";
}

export function useWorkOrderBoard(
  variant: WorkOrderBoardVariant,
  opts?: {
    limit?: number;
    fleetId?: string | null;
  },
) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [rows, setRows] = useState<WorkOrderBoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);

    let query = supabase
      .from(viewForVariant(variant))
      .select("*")
      .order("activity_at", { ascending: false });

    if (variant === "fleet" && opts?.fleetId) {
      query = query.eq("fleet_id", opts.fleetId);
    }

    if (opts?.limit) {
      query = query.limit(opts.limit);
    }

    const { data, error: queryError } = await query;
    if (queryError) {
      setError(queryError.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const boardRows = (data ?? []) as WorkOrderBoardRow[];

    if (variant !== "shop" || boardRows.length === 0) {
      setRows(boardRows);
      setLoading(false);
      return;
    }

    const workOrderIds = boardRows.map((row) => row.work_order_id);
    const [activeSegmentsResult, requestResults] = await Promise.all([
      supabase
        .from("work_order_line_labor_segments")
        .select("work_order_id")
        .in("work_order_id", workOrderIds)
        .is("ended_at", null),
      Promise.all(
        Array.from(
          { length: Math.ceil(workOrderIds.length / 200) },
          (_, index) =>
            supabase
              .from("part_requests")
              .select("id,work_order_id,status")
              .in("work_order_id", workOrderIds.slice(index * 200, index * 200 + 200)),
        ),
      ),
    ]);

    const activeWorkOrderIds = new Set(
      (activeSegmentsResult.data ?? [])
        .map((segment) => segment.work_order_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    );

    const requests = requestResults.flatMap((result) =>
      result.error ? [] : ((result.data ?? []) as OpenPartsRequest[]),
    );
    const requestIds = requests.map((request) => request.id);
    const itemResults = await Promise.all(
      Array.from(
        { length: Math.ceil(requestIds.length / 200) },
        (_, index) =>
          supabase
            .from("part_request_items")
            .select(
              "request_id,status,po_id,qty,qty_requested,qty_approved,qty_ordered,qty_received,qty_reserved,qty_consumed,qty_returned",
            )
            .in("request_id", requestIds.slice(index * 200, index * 200 + 200)),
      ),
    );
    const items = itemResults.flatMap((result) =>
      result.error ? [] : ((result.data ?? []) as OpenPartsItem[]),
    );

    setRows(
      reconcileBoardPartsState(
        boardRows,
        countOpenPartsObligationsByWorkOrder(requests, items),
        activeWorkOrderIds,
      ),
    );
    setLoading(false);
  }, [opts?.fleetId, opts?.limit, supabase, variant]);

  useEffect(() => {
    fetchRows();

    const channel = supabase
      .channel(`work-order-board:${variant}:${opts?.fleetId ?? "all"}:${opts?.limit ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_orders" },
        () => fetchRows(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_order_lines" },
        () => fetchRows(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_line_labor_segments",
        },
        () => fetchRows(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "part_request_items" },
        () => fetchRows(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "part_requests" },
        () => fetchRows(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fleet_vehicles" },
        () => fetchRows(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchRows, supabase, variant, opts?.fleetId, opts?.limit]);

  return { rows, loading, error, refetch: fetchRows };
}
