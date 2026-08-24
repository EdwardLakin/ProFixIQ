"use client";

import { format } from "date-fns";
import {
  BriefcaseBusiness,
  Camera,
  ChevronRight,
  ClipboardCheck,
  FileScan,
  ListChecks,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { normalizeFieldWorkspaceCapabilities } from "@/features/mobile/service/fieldWorkspaceCapabilities";
import { resolveCurrentActor } from "@/features/shared/lib/currentActor";
import { canonicalizeRole } from "@/features/shared/lib/rbac";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

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
    customer?: {
      first_name?: string | null;
      last_name?: string | null;
    } | null;
    vehicle?: {
      year?: string | number | null;
      make?: string | null;
      model?: string | null;
    } | null;
  } | null;
};

function displayName(row: CanonicalInspectionRow): string | null {
  const customer = row.summary?.customer;
  const value =
    `${customer?.first_name ?? ""} ${customer?.last_name ?? ""}`.trim();
  return value || null;
}

function vehicleLabel(row: CanonicalInspectionRow): string | null {
  const vehicle = row.summary?.vehicle;
  const value =
    `${vehicle?.year ?? ""} ${vehicle?.make ?? ""} ${vehicle?.model ?? ""}`.trim();
  return value || null;
}

function normalizedStatus(status: string | null | undefined): string {
  return String(status ?? "open")
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function statusLabel(status: string | null | undefined): string {
  const key = normalizedStatus(status);
  if (key === "in_progress") return "In progress";
  if (key === "completed") return "Completed";
  if (key === "archived") return "Archived";
  return "Ready";
}

function statusTone(status: string | null | undefined): string {
  const key = normalizedStatus(status);
  if (key === "in_progress") {
    return "border-cyan-500/35 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200";
  }
  if (key === "completed") {
    return "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200";
  }
  if (key === "archived") {
    return "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-secondary)]";
  }
  return "border-blue-500/35 bg-blue-500/10 text-blue-700 dark:text-blue-200";
}

function statusRail(status: string | null | undefined): string {
  const key = normalizedStatus(status);
  if (key === "in_progress") return "bg-cyan-500";
  if (key === "completed") return "bg-emerald-500";
  if (key === "archived") return "bg-slate-400";
  return "bg-blue-500";
}

export default function MobileInspectionsListPage() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [rows, setRows] = useState<InspectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canImportForms, setCanImportForms] = useState(false);
  const [canManageInspectionTemplates, setCanManageInspectionTemplates] =
    useState(false);

  useEffect(() => {
    let active = true;

    void fetch("/api/mobile/field-service/access", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as {
          canAccessFieldService?: boolean;
          workspaceCapabilities?: unknown;
        } | null;
        if (!active || !response.ok || !body?.canAccessFieldService) return;

        setCanManageInspectionTemplates(
          normalizeFieldWorkspaceCapabilities(body.workspaceCapabilities)
            .canManageInspectionTemplates,
        );
      })
      .catch(() => {
        // Keep the management action hidden when access cannot be verified.
      });

    return () => {
      active = false;
    };
  }, []);

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

  const activeCount = rows.filter((row) => {
    const status = normalizedStatus(row.status);
    return status === "open" || status === "in_progress";
  }).length;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-3 px-3 py-3 sm:px-4">
      <section className="mobile-dashboard-hero">
        <div className="flex items-start gap-3">
          <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10 text-[#8ed4ff]">
            <ClipboardCheck aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="mobile-dashboard-hero__eyebrow">Vehicle checks</div>
            <h1 className="mobile-dashboard-hero__title">Inspections</h1>
            <p className="mobile-dashboard-hero__subtitle">
              {activeCount > 0
                ? `${activeCount} inspection${activeCount === 1 ? " is" : "s are"} ready to continue.`
                : "Start from the correct job or review recently completed vehicle checks."}
            </p>
          </div>
        </div>
      </section>

      <section
        className={`grid gap-2 ${canImportForms ? "grid-cols-2" : "grid-cols-2"}`}
      >
        {canManageInspectionTemplates ? (
          <Link
            href="/mobile/service/inspection-builder/new"
            className="mobile-command-row col-span-2 flex min-h-[5.6rem] items-center gap-3 border p-3"
          >
            <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
              <ListChecks aria-hidden className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-[color:var(--theme-text-primary)]">
                Build inspection
              </span>
              <span className="mt-1 block text-xs leading-4 text-[color:var(--theme-text-secondary)]">
                Create and manage reusable inspection templates.
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-[color:var(--accent-copper)]" />
          </Link>
        ) : null}
        {canImportForms ? (
          <Link
            href="/mobile/inspections/import"
            className="mobile-command-row col-span-2 flex min-h-[5.6rem] items-center gap-3 border p-3"
          >
            <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-300">
              <FileScan aria-hidden className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-[color:var(--theme-text-primary)]">
                Import customer form
              </span>
              <span className="mt-1 block text-xs leading-4 text-[color:var(--theme-text-secondary)]">
                Photograph a paper checklist and build a reusable inspection.
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-[color:var(--accent-copper)]" />
          </Link>
        ) : null}
        <Link
          href="/mobile/tech/queue"
          className="mobile-command-row flex min-h-[5.5rem] items-center gap-3 border p-3"
        >
          <span className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
            <BriefcaseBusiness aria-hidden className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-[color:var(--theme-text-primary)]">
              My jobs
            </span>
            <span className="mt-1 block text-xs text-[color:var(--theme-text-secondary)]">
              Assigned work
            </span>
          </span>
        </Link>
        <Link
          href="/mobile/work-orders"
          className="mobile-command-row flex min-h-[5.5rem] items-center gap-3 border p-3"
        >
          <span className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-300">
            <Camera aria-hidden className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-[color:var(--theme-text-primary)]">
              Work orders
            </span>
            <span className="mt-1 block text-xs text-[color:var(--theme-text-secondary)]">
              Find a vehicle
            </span>
          </span>
        </Link>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <section className="space-y-2.5">
        <div className="flex items-end justify-between gap-3 px-1">
          <div>
            <h2 className="text-[0.66rem] font-extrabold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
              Recent inspections
            </h2>
            <p className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
              Open the canonical job and continue from its work order.
            </p>
          </div>
          <span className="text-xs font-bold text-[color:var(--theme-text-secondary)]">
            {rows.length}
          </span>
        </div>

        {loading ? (
          [0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-28 animate-pulse rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)]"
            />
          ))
        ) : rows.length === 0 ? (
          <div className="mobile-command-panel border p-6 text-center text-sm text-[color:var(--theme-text-secondary)]">
            No inspections found yet.
          </div>
        ) : (
          rows.map((row) => {
            const created = row.created_at
              ? format(new Date(row.created_at), "MMM d · p")
              : "—";
            const canonicalHref =
              row.work_order_id && row.work_order_line_id
                ? `/mobile/work-orders/${row.work_order_id}?focus=${encodeURIComponent(row.work_order_line_id)}`
                : "/mobile/work-orders";

            return (
              <Link
                key={row.id}
                href={canonicalHref}
                className="mobile-command-row relative flex min-h-[6.5rem] items-center gap-3 overflow-hidden border p-4 pl-5 active:scale-[0.992]"
              >
                <span
                  aria-hidden
                  className={`absolute inset-y-0 left-0 w-1.5 ${statusRail(row.status)}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-extrabold text-[color:var(--theme-text-primary)]">
                      {row.custom_id ?? `Inspection ${row.id.slice(0, 6)}`}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[0.62rem] font-bold ${statusTone(row.status)}`}
                    >
                      {statusLabel(row.status)}
                    </span>
                  </span>
                  <span className="mt-1.5 block truncate text-xs text-[color:var(--theme-text-secondary)]">
                    {row.vehicle_label ?? "No vehicle"}
                  </span>
                  <span className="mt-1 block truncate text-xs text-[color:var(--theme-text-muted)]">
                    {row.customer_name ?? "No customer"} · {created}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-[color:var(--accent-copper)]" />
              </Link>
            );
          })
        )}
      </section>
    </main>
  );
}
