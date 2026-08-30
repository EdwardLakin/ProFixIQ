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
import { normalizeWorkOrderOperationalStage } from "@/features/work-orders/lib/operational-stage";

type ViewName =
  | "v_work_order_board_cards_shop"
  | "v_work_order_board_cards_fleet"
  | "v_work_order_board_cards_portal";

type WorkOrderVisibilityState = {
  id: string;
  payment_status: string | null;
  archived_at?: string | null;
};

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

    const requestedLimit = opts?.limit ?? null;

    const readBoardPage = async (
      range: { from: number; to: number } | null,
    ) => {
      let query = supabase
        .from(viewForVariant(variant))
        .select("*")
        .order("activity_at", { ascending: false });

      if (variant === "fleet" && opts?.fleetId) {
        query = query.eq("fleet_id", opts.fleetId);
      }

      if (range) {
        query = query.range(range.from, range.to);
      } else if (requestedLimit) {
        query = query.limit(requestedLimit);
      }

      const { data, error: queryError } = await query;
      if (queryError) return { error: queryError.message, rows: [] };

      return {
        error: null,
        rows: ((data ?? []) as WorkOrderBoardRow[]).map((row) => ({
          ...row,
          overall_stage: normalizeWorkOrderOperationalStage(row.overall_stage),
        })),
      };
    };

    // Shop cards are only visible once `work_orders` confirms they are neither
    // paid nor archived, and that state does not live on the board view. A plain
    // `.limit()` would therefore spend a compact 5/10-row budget on rows that are
    // filtered out immediately afterwards, leaving the widget short or empty.
    // Page through candidates instead, so the request stays bounded (never the
    // Data API's 1000-row ceiling) while still filling the requested count.
    const selectVisibleShopRows = async (candidates: WorkOrderBoardRow[]) => {
      if (candidates.length === 0) return { error: null, rows: [] };

      const stateResult = await supabase
        .from("work_orders")
        .select("id,payment_status,archived_at")
        .in(
          "id",
          candidates.map((row) => row.work_order_id),
        );

      if (stateResult.error) return { error: stateResult.error.message, rows: [] };

      const visibilityRows = (stateResult.data ??
        []) as unknown as WorkOrderVisibilityState[];
      const hiddenWorkOrderIds = new Set(
        visibilityRows
          .filter(
            (workOrder) =>
              workOrder.payment_status === "paid" || Boolean(workOrder.archived_at),
          )
          .map((workOrder) => workOrder.id),
      );

      return {
        error: null,
        rows: candidates.filter(
          (row) => !hiddenWorkOrderIds.has(row.work_order_id),
        ),
      };
    };

    let activeBoardRows: WorkOrderBoardRow[] = [];

    if (variant !== "shop") {
      const page = await readBoardPage(null);
      if (page.error) {
        setError(page.error);
        setRows([]);
        setLoading(false);
        return;
      }
      setRows(page.rows);
      setLoading(false);
      return;
    }

    if (!requestedLimit) {
      const page = await readBoardPage(null);
      if (page.error) {
        setError(page.error);
        setRows([]);
        setLoading(false);
        return;
      }
      const visible = await selectVisibleShopRows(page.rows);
      if (visible.error) {
        setError(visible.error);
        setRows([]);
        setLoading(false);
        return;
      }
      activeBoardRows = visible.rows;
    } else {
      const pageSize = Math.min(Math.max(requestedLimit * 4, 40), 200);
      const maxPages = 5;
      const collected: WorkOrderBoardRow[] = [];

      for (let page = 0; page < maxPages; page += 1) {
        const from = page * pageSize;
        const candidatePage = await readBoardPage({
          from,
          to: from + pageSize - 1,
        });
        if (candidatePage.error) {
          setError(candidatePage.error);
          setRows([]);
          setLoading(false);
          return;
        }

        const visible = await selectVisibleShopRows(candidatePage.rows);
        if (visible.error) {
          setError(visible.error);
          setRows([]);
          setLoading(false);
          return;
        }

        collected.push(...visible.rows);

        const exhausted = candidatePage.rows.length < pageSize;
        if (collected.length >= requestedLimit || exhausted) break;
      }

      activeBoardRows = collected.slice(0, requestedLimit);
    }

    const workOrderIds = activeBoardRows.map((row) => row.work_order_id);

    if (workOrderIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const [activeSegmentsResult, assignedLinesResult, requestResults] =
      await Promise.all([
        supabase
          .from("work_order_line_labor_segments")
          .select("work_order_id")
          .in("work_order_id", workOrderIds)
          .is("ended_at", null),
        supabase
          .from("work_order_lines")
          .select("work_order_id,assigned_tech_id,assigned_to")
          .in("work_order_id", workOrderIds)
          .is("voided_at", null),
        Promise.all(
          Array.from(
            { length: Math.ceil(workOrderIds.length / 200) },
            (_, index) =>
              supabase
                .from("part_requests")
                .select("id,work_order_id,status")
                .in(
                  "work_order_id",
                  workOrderIds.slice(index * 200, index * 200 + 200),
                ),
          ),
        ),
      ]);

    const activeWorkOrderIds = new Set(
      (activeSegmentsResult.data ?? [])
        .map((segment) => segment.work_order_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    );

    const assignedTechIdsByWorkOrder = new Map<string, Set<string>>();
    for (const line of assignedLinesResult.data ?? []) {
      const technicianId = line.assigned_tech_id ?? line.assigned_to;
      if (!technicianId) continue;
      const ids =
        assignedTechIdsByWorkOrder.get(line.work_order_id) ?? new Set<string>();
      ids.add(technicianId);
      assignedTechIdsByWorkOrder.set(line.work_order_id, ids);
    }
    const assignedTechIds = Array.from(
      new Set(
        Array.from(assignedTechIdsByWorkOrder.values()).flatMap((ids) =>
          Array.from(ids),
        ),
      ),
    );
    const profileNamesById = new Map<string, string>();
    if (assignedTechIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,full_name")
        .in("id", assignedTechIds);
      for (const profile of profiles ?? []) {
        profileNamesById.set(
          profile.id,
          profile.full_name?.trim() || "Assigned",
        );
      }
    }

    const rowsWithDirectTechnicians = activeBoardRows.map((row) => {
      const directNames = Array.from(
        assignedTechIdsByWorkOrder.get(row.work_order_id) ?? [],
      ).map((id) => profileNamesById.get(id) ?? "Assigned");
      const techNames = Array.from(
        new Set([...(row.tech_names ?? []), ...directNames].filter(Boolean)),
      );
      if (techNames.length === 0) return row;
      return {
        ...row,
        assigned_tech_count: techNames.length,
        first_tech_name: techNames[0] ?? null,
        tech_names: techNames,
        assigned_summary:
          techNames.length === 1
            ? techNames[0]
            : `${techNames[0]} +${techNames.length - 1}`,
      };
    });

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
        rowsWithDirectTechnicians,
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
