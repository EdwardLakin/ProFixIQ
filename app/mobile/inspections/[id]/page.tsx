"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { MobileShell } from "components/layout/MobileShell";

type DB = Database;

type InspectionDetail = {
  id: string;
  custom_id?: string | null;
  status?: string | null;
  created_at?: string | null;
  form_name?: string | null;
  customer_name?: string | null;
  vehicle_label?: string | null;
  notes_summary?: string | null;
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

export default function MobileInspectionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [inspection, setInspection] = useState<InspectionDetail | null>(null);
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
            "id, custom_id, status, created_at, form_name, customer_name, vehicle_label, notes_summary"
          )
          .eq("id", id)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          setErr("Inspection not found.");
          setInspection(null);
        } else {
          setInspection((data as unknown) as InspectionDetail);
        }
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Failed to load inspection.";
        setErr(msg);
        setInspection(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, supabase]);

  const created =
    inspection?.created_at != null
      ? format(new Date(inspection.created_at), "PP p")
      : null;

  return (
    <MobileShell>
      <div className="px-4 py-4 space-y-4 text-foreground">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-900"
          >
            ← Back
          </button>
          <Link
            href={`/inspections/${id}`}
            className="rounded-full border border-orange-500/70 bg-orange-500 px-3 py-1 text-xs font-semibold text-black hover:bg-orange-400"
          >
            Open full view
          </Link>
        </div>

        {/* Heading */}
        <div className="space-y-1">
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-200">
            Inspection
          </h1>
          {inspection?.custom_id && (
            <p className="text-xs text-neutral-400">
              ID:{" "}
              <span className="font-mono text-neutral-100">
                {inspection.custom_id}
              </span>
            </p>
          )}
          {inspection && (
            <div className="mt-1 inline-flex items-center gap-2">
              <span className={statusChip(inspection.status ?? "open")}>
                {(inspection.status ?? "open").replaceAll("_", " ")}
              </span>
              {created && (
                <span className="text-[0.7rem] text-neutral-400">
                  {created}
                </span>
              )}
            </div>
          )}
        </div>

        {err && (
          <div className="rounded-md border border-red-500/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
            {err}
          </div>
        )}

        {loading ? (
          <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-4 text-sm text-neutral-300">
            Loading inspection…
          </div>
        ) : !inspection ? (
          <div className="rounded-lg border border-dashed border-white/15 bg-black/40 px-3 py-6 text-sm text-neutral-400">
            Inspection not found.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Basic context */}
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/80 px-3 py-3 text-sm">
              <div className="mb-1 text-[0.7rem] uppercase tracking-[0.16em] text-neutral-500">
                Context
              </div>
              <div className="space-y-1 text-xs text-neutral-200">
                <div>
                  <span className="text-neutral-500">Form:</span>{" "}
                  {inspection.form_name ?? "—"}
                </div>
                <div>
                  <span className="text-neutral-500">Customer:</span>{" "}
                  {inspection.customer_name ?? "—"}
                </div>
                <div>
                  <span className="text-neutral-500">Vehicle:</span>{" "}
                  {inspection.vehicle_label ?? "—"}
                </div>
              </div>
            </div>

            {/* Summary / notes */}
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/80 px-3 py-3 text-sm">
              <div className="mb-1 text-[0.7rem] uppercase tracking-[0.16em] text-neutral-500">
                Summary
              </div>
              <p className="text-xs text-neutral-200 whitespace-pre-line">
                {inspection.notes_summary ??
                  "Mobile inspection editing is coming soon. Use the desktop view to complete this inspection."}
              </p>
            </div>
          </div>
        )}
      </div>
    </MobileShell>
  );
}
