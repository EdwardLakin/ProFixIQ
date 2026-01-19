// features/work-orders/components/workorders/LinePartsSummary.tsx (FULL FILE REPLACEMENT)
// No unused vars. No `any`. Reads part_request_items for a given work_order_line_id.

"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type PartRequestItemRow = DB["public"]["Tables"]["part_request_items"]["Row"];

type Props = {
  workOrderLineId: string;
};

type Summary = {
  requested: number;
  approved: number;
  reserved: number;
  received: number;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function LinePartsSummary({ workOrderLineId }: Props) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [s, setS] = useState<Summary>({
    requested: 0,
    approved: 0,
    reserved: 0,
    received: 0,
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!workOrderLineId) return;

      const { data, error } = await supabase
        .from("part_request_items")
        .select(
          "id, qty, qty_requested, qty_approved, qty_reserved, qty_received, work_order_line_id",
        )
        .eq("work_order_line_id", workOrderLineId);

      if (error) return;
      if (cancelled) return;

      const rows = (data ?? []) as Array<
        PartRequestItemRow & {
          qty_requested?: number | null;
          qty_approved?: number | null;
          qty_reserved?: number | null;
          qty_received?: number | null;
        }
      >;

      const next: Summary = rows.reduce(
        (acc, r) => {
          acc.requested += num(r.qty_requested ?? r.qty);
          acc.approved += num(r.qty_approved);
          acc.reserved += num(r.qty_reserved);
          acc.received += num(r.qty_received);
          return acc;
        },
        { requested: 0, approved: 0, reserved: 0, received: 0 },
      );

      setS(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, workOrderLineId]);

  const pill = (k: "req" | "app" | "res" | "rcv") =>
    ({
      req: "rounded-full border border-white/10 bg-black/50 px-3 py-1 text-xs text-neutral-200",
      app: "rounded-full border border-white/10 bg-black/50 px-3 py-1 text-xs text-neutral-200",
      res: "rounded-full border border-white/10 bg-black/50 px-3 py-1 text-xs text-neutral-200",
      rcv: "rounded-full border border-white/10 bg-black/50 px-3 py-1 text-xs text-neutral-200",
    })[k];

  const isReady =
    s.approved > 0 && s.reserved >= s.approved && s.received >= s.approved;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className={pill("req")}>Req {s.requested}</span>
      <span className={pill("app")}>App {s.approved}</span>
      <span className={pill("res")}>Res {s.reserved}</span>
      <span className={pill("rcv")}>Rcv {s.received}</span>

      {isReady ? (
        <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
          Ready
        </span>
      ) : null}
    </div>
  );
}