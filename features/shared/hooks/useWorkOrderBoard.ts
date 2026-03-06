"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import type { WorkOrderBoardRow, WorkOrderBoardVariant } from "../lib/workboard/types";

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
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);
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

    setRows((data ?? []) as WorkOrderBoardRow[]);
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
