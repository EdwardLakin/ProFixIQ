"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { MobileShell } from "components/layout/MobileShell";

type DB = Database;

/**
 * Narrow local type so we don't depend on the full DB row shape.
 * We only select the fields we actually render.
 */
type InspectionRow = {
  id: string;
  custom_id?: string | null;
  status?: string | null;
  created_at?: string | null;
  customer_name?: string | null;
  vehicle_label?: string | null;
};

const BADGE_BASE =
  "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em]";

const STATUS_CLASS: Record<string, string> = {
  open: "border-sky-500/70 bg-sky-500/10 text-sky-100",
  in_progress: "border-orange-500/70 bg-orange-500/10 text-orange-100",
  completed: "border-emerald-500/70 bg-emerald-500/10 text-emerald-100",
  archived: "border-neutral-500/70 bg-neutral-800/80 text-neutral-200",
};

function statusChip(status: string | null | undefined): string {
  const key = (status ?? "open").toLowerCase().replace(/\s+/g, "_");
  const extra = STATUS_CLASS[key] ?? STATUS_CLASS.open;
  return `${BADGE_BASE} ${extra}`;
}

export default function MobileInspectionsListPage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [rows, setRows] = useState<InspectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const { data, error } = await supabase
          .from("inspection_sessions")
          .select(
            "id, custom_id, status, created_at, customer_name, vehicle_label"
          )
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) throw error;
        setRows(((data ?? []) as unknown[]) as InspectionRow[]);
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Failed to load inspections.";
        setErr(msg);
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase]);

  return (
    <MobileShell>
      <div className="px-4 py-4 space-y-4 text-foreground">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-200">
              Inspections
            </h1>
            <p className="mt-1 text-xs text-neutral-400">
              Quick mobile view of recent inspections for this shop.
            </p>
          </div>
          <Link
            href="/inspections"
            className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-[0.7rem] text-neutral-200 hover:border-orange-400 hover:bg-neutral-800"
          >
            Desktop view
          </Link>
        </div>

        {err && (
          <div className="rounded-md border border-red-500/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
            {err}
          </div>
        )}

        {loading ? (
          <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-4 text-sm text-neutral-300">
            Loading inspections…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/15 bg-black/40 px-3 py-6 text-sm text-neutral-400">
            No inspections found yet.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const href = `/mobile/inspections/${r.id}`;
              const created =
                r.created_at != null
                  ? format(new Date(r.created_at), "PP p")
                  : "—";
              return (
                <Link
                  key={r.id}
                  href={href}
                  className="block rounded-xl border border-neutral-800 bg-neutral-950/80 px-3 py-3 text-sm text-neutral-100 shadow-sm shadow-black/30 hover:border-orange-500/70 hover:bg-neutral-900/80"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-neutral-50">
                          {r.custom_id ?? `Inspect ${r.id.slice(0, 6)}`}
                        </span>
                        <span className={statusChip(r.status ?? "open")}>
                          {(r.status ?? "open").replaceAll("_", " ")}
                        </span>
                      </div>
                      <div className="mt-1 text-[0.75rem] text-neutral-300 truncate">
                        {r.customer_name ?? "No customer"}{" "}
                        <span className="mx-1 text-neutral-600">•</span>
                        {r.vehicle_label ?? "No vehicle"}
                      </div>
                    </div>
                    <span className="ml-2 shrink-0 text-[0.7rem] text-neutral-400">
                      {created}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </MobileShell>
  );
}
