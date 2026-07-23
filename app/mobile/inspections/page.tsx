"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { resolveCurrentActor } from "@/features/shared/lib/currentActor";
import { canonicalizeRole } from "@/features/shared/lib/rbac";

type InspectionRow = {
  id: string;
  work_order_id: string | null;
  work_order_line_id: string | null;
  custom_id: string | null;
  status: string | null;
  created_at: string | null;
  customer_name: string | null;
  vehicle_label: string | null;
};

type CanonicalInspectionRow = {
  id: string;
  work_order_id: string | null;
  work_order_line_id: string | null;
  status: string | null;
  created_at: string | null;
  summary: {
    templateName?: string | null;
    templateitem?: string | null;
    customer?: { first_name?: string | null; last_name?: string | null } | null;
    vehicle?: {
      year?: string | number | null;
      make?: string | null;
      model?: string | null;
    } | null;
  } | null;
};

function displayName(row: CanonicalInspectionRow): string | null {
  const customer = row.summary?.customer;
  const value = `${customer?.first_name ?? ""} ${customer?.last_name ?? ""}`.trim();
  return value || null;
}

function vehicleLabel(row: CanonicalInspectionRow): string | null {
  const vehicle = row.summary?.vehicle;
  const value = `${vehicle?.year ?? ""} ${vehicle?.make ?? ""} ${vehicle?.model ?? ""}`.trim();
  return value || null;
}

const BADGE_BASE =
  "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em]";

const STATUS_CLASS: Record<string, string> = {
  open: "border-sky-500/70 bg-sky-500/10 text-sky-100",
  in_progress: "border-orange-500/70 bg-orange-500/10 text-orange-100",
  completed: "border-emerald-500/70 bg-emerald-500/10 text-emerald-100",
  archived:
    "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] text-[color:var(--theme-text-primary)]",
};

function statusChip(status: string | null | undefined): string {
  const key = (status ?? "open").toLowerCase().replace(/\s+/g, "_");
  const extra = STATUS_CLASS[key] ?? STATUS_CLASS.open;
  return `${BADGE_BASE} ${extra}`;
}

export default function MobileInspectionsListPage() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [rows, setRows] = useState<InspectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canImportForms, setCanImportForms] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const actor = await resolveCurrentActor(supabase);
        const role = canonicalizeRole(actor.profile?.role);
        if (active) {
          setCanImportForms(
            role === "owner" ||
              role === "admin" ||
              role === "manager" ||
              role === "advisor" ||
              role === "service",
          );
        }
        const { data, error: queryError } = await supabase
          .from("inspections")
          .select(
            "id, work_order_id, work_order_line_id, status, created_at, summary",
          )
          .eq("is_canonical", true)
          .order("created_at", { ascending: false })
          .limit(50);

        if (queryError) throw queryError;
        if (!active) return;

        setRows(
          ((data ?? []) as unknown as CanonicalInspectionRow[]).map((row) => ({
            id: row.id,
            work_order_id: row.work_order_id ?? null,
            work_order_line_id: row.work_order_line_id ?? null,
            custom_id:
              row.summary?.templateName ?? row.summary?.templateitem ?? null,
            status: row.status ?? null,
            created_at: row.created_at ?? null,
            customer_name: displayName(row),
            vehicle_label: vehicleLabel(row),
          })),
        );
      } catch (caught) {
        if (!active) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Failed to load inspections.",
        );
        setRows([]);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [supabase]);

  return (
    <div className="min-h-screen space-y-4 bg-[color:var(--theme-surface-page)] px-4 py-4 text-foreground">
      <header>
        <div className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">
          Vehicle checks
        </div>
        <h1 className="mt-2 font-blackops text-lg uppercase tracking-[0.18em] text-[color:var(--theme-text-primary)]">
          Inspections
        </h1>
        <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
          Open a recent inspection or return to a work order to start the correct
          checklist for that job.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2">
        {canImportForms ? (
          <Link
            href="/mobile/inspections/import"
            className="col-span-2 rounded-2xl border border-[var(--accent-copper)] bg-[color:var(--theme-surface-subtle)] p-4 text-sm font-semibold text-[color:var(--theme-text-primary)]"
          >
            Import customer form
            <div className="mt-1 text-xs font-normal text-[color:var(--theme-text-secondary)]">
              Photograph a paper checklist and process it in the background
            </div>
          </Link>
        ) : null}
        <Link
          href="/mobile/tech/queue"
          className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3 text-sm font-semibold text-[color:var(--theme-text-primary)]"
        >
          My jobs
          <div className="mt-1 text-xs font-normal text-[color:var(--theme-text-secondary)]">
            Open the assigned line first
          </div>
        </Link>
        <Link
          href="/mobile/work-orders"
          className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3 text-sm font-semibold text-[color:var(--theme-text-primary)]"
        >
          Work orders
          <div className="mt-1 text-xs font-normal text-[color:var(--theme-text-secondary)]">
            Find another vehicle or job
          </div>
        </Link>
      </div>

      {error ? (
        <div className="rounded-md border border-red-500/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-4 text-sm text-[color:var(--theme-text-secondary)]">
          Loading inspections…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-6 text-sm text-[color:var(--theme-text-secondary)]">
          No inspections found yet.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const created = row.created_at
              ? format(new Date(row.created_at), "PP p")
              : "—";

            const canonicalHref =
              row.work_order_id && row.work_order_line_id
                ? `/mobile/work-orders/${row.work_order_id}?focus=${encodeURIComponent(row.work_order_line_id)}`
                : "/mobile/work-orders";

            return (
              <Link
                key={row.id}
                href={canonicalHref}
                className="block rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-3 text-sm text-[color:var(--theme-text-primary)] shadow-sm shadow-[var(--theme-shadow-medium)] active:scale-[0.99]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-[color:var(--theme-text-primary)]">
                        {row.custom_id ?? `Inspect ${row.id.slice(0, 6)}`}
                      </span>
                      <span className={statusChip(row.status)}>
                        {(row.status ?? "open").replaceAll("_", " ")}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-[0.75rem] text-[color:var(--theme-text-secondary)]">
                      {row.customer_name ?? "No customer"}
                      <span className="mx-1 text-[color:var(--theme-text-muted)]">
                        •
                      </span>
                      {row.vehicle_label ?? "No vehicle"}
                    </div>
                  </div>
                  <div className="ml-2 shrink-0 text-right">
                    <div className="text-[0.7rem] text-[color:var(--theme-text-secondary)]">
                      {created}
                    </div>
                    <div className="mt-1 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-[var(--accent-copper)]">
                      Open canonical job
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
