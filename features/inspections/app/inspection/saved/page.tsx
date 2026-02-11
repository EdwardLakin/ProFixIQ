// app/inspection/saved/page.tsx  ✅ FULL FILE REPLACEMENT
// Compliance View: shop-scoped inspection history w/ vehicle + WO + customer + PDF links (no `any`)

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { format } from "date-fns";

import type { Database } from "@shared/types/types/supabase";
import PreviousPageButton from "@shared/components/ui/PreviousPageButton";

type DB = Database;

type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];
type InspectionRow = DB["public"]["Tables"]["inspections"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type TemplateRow = DB["public"]["Tables"]["inspection_templates"]["Row"];

type InspectionComplianceRow = Pick<
  InspectionRow,
  | "id"
  | "shop_id"
  | "vehicle_id"
  | "work_order_id"
  | "status"
  | "summary"
  | "created_at"
  | "updated_at"
  | "pdf_url"
  | "pdf_storage_path"
> & {
  vehicles: Pick<
    VehicleRow,
    "year" | "make" | "model" | "vin" | "license_plate" | "unit_number"
  > | null;
  work_orders:
    | (Pick<WorkOrderRow, "id" | "custom_id" | "status" | "customer_id"> & {
        customers: Pick<
          CustomerRow,
          "first_name" | "last_name" | "business_name"
        > | null;
      })
    | null;
  // ✅ DB columns are: template_name, description
  inspection_templates: Pick<TemplateRow, "template_name" | "description"> | null;
};

type StatusFilter = "all" | "in_progress" | "completed" | "archived";

function safeStr(x: unknown): string {
  return typeof x === "string" ? x : "";
}

function joinName(first?: string | null, last?: string | null): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  return [f, l].filter(Boolean).join(" ").trim();
}

function normalizeStatus(raw: unknown): string {
  return safeStr(raw).trim().toLowerCase();
}

function isCompletedInspection(
  row: Pick<InspectionComplianceRow, "status" | "pdf_url" | "pdf_storage_path">,
): boolean {
  const st = normalizeStatus(row.status);
  if (st.includes("complete") || st.includes("final") || st.includes("done"))
    return true;

  // If it has a PDF, it’s effectively “finalized” for compliance purposes
  if (safeStr(row.pdf_url).trim().length > 0) return true;
  if (safeStr(row.pdf_storage_path).trim().length > 0) return true;
  return false;
}

function deriveDisplayStatus(row: InspectionComplianceRow): string {
  const st = normalizeStatus(row.status);
  if (st) return st.replaceAll("_", " ");
  return isCompletedInspection(row) ? "completed" : "in progress";
}

function pickPdfHref(row: InspectionComplianceRow): string | null {
  const direct = safeStr(row.pdf_url).trim();
  if (direct) return direct;
  return null;
}

function toIsoStartOfDay(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00.000Z`).toISOString();
}

function toIsoEndOfDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}

export default function SavedInspectionsPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [shopId, setShopId] = useState<string | null>(null);

  const [rows, setRows] = useState<InspectionComplianceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // ---- Load current user's shop ----
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr(null);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (userErr || !user) {
        setErr("You must be signed in to view inspection history.");
        setShopId(null);
        setLoading(false);
        return;
      }

      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", user.id)
        .maybeSingle<Pick<ProfileRow, "shop_id">>();

      if (cancelled) return;

      if (profErr) {
        setErr(profErr.message);
        setShopId(null);
        setLoading(false);
        return;
      }

      const sid = profile?.shop_id ?? null;
      if (!sid) {
        setErr("No shop is linked to your profile yet.");
        setShopId(null);
        setLoading(false);
        return;
      }

      setShopId(sid);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const load = useCallback(async () => {
    if (!shopId) return;

    setLoading(true);
    setErr(null);

    // NOTE:
    // - This is intentionally shop-scoped for compliance.
    // - We join vehicle + work order + customer + template for a single “audit log” row.
    let query = supabase
      .from("inspections")
      .select(
        `
          id,
          shop_id,
          vehicle_id,
          work_order_id,
          status,
          summary,
          created_at,
          updated_at,
          pdf_url,
          pdf_storage_path,
          vehicles:vehicles(year,make,model,vin,license_plate,unit_number),
          work_orders:work_orders(
            id,
            custom_id,
            status,
            customer_id,
            customers:customers(first_name,last_name,business_name)
          ),
          inspection_templates:inspection_templates(template_name,description)
        `,
      )
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(400);

    // ✅ IMPORTANT: do NOT call .returns() before gte/lte — it changes the builder type
    if (from) query = query.gte("created_at", toIsoStartOfDay(from));
    if (to) query = query.lte("created_at", toIsoEndOfDay(to));

    const { data, error } = await query;

    if (error) {
      setErr(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const list: InspectionComplianceRow[] = Array.isArray(data)
      ? (data as unknown as InspectionComplianceRow[])
      : [];

    // Status filter (client-side to be resilient across status enum changes)
    const statusFiltered =
      statusFilter === "all"
        ? list
        : list.filter((r) => {
            const completed = isCompletedInspection(r);
            if (statusFilter === "completed") return completed;
            if (statusFilter === "in_progress") return !completed;
            if (statusFilter === "archived") {
              const st = normalizeStatus(r.status);
              return st.includes("archiv");
            }
            return true;
          });

    // Search filter
    const qlc = q.trim().toLowerCase();
    const filtered = qlc
      ? statusFiltered.filter((r) => {
          const inspId = safeStr(r.id).toLowerCase();
          const summary = safeStr(r.summary).toLowerCase();
          const st = normalizeStatus(r.status);

          const v = r.vehicles;
          const plate = safeStr(v?.license_plate).toLowerCase();
          const vin = safeStr(v?.vin).toLowerCase();
          const unit = safeStr(v?.unit_number).toLowerCase();
          const ymm = [v?.year ?? "", v?.make ?? "", v?.model ?? ""]
            .join(" ")
            .toLowerCase();

          const wo = r.work_orders;
          const woId = safeStr(wo?.id).toLowerCase();
          const woCustom = safeStr(wo?.custom_id).toLowerCase();
          const woStatus = normalizeStatus(wo?.status);

          const cust = wo?.customers;
          const custName = joinName(
            cust?.first_name ?? null,
            cust?.last_name ?? null,
          ).toLowerCase();
          const biz = safeStr(cust?.business_name).toLowerCase();

          const tpl = r.inspection_templates;
          const tplName = safeStr(tpl?.template_name).toLowerCase();
          const tplDesc = safeStr(tpl?.description).toLowerCase();

          return (
            inspId.includes(qlc) ||
            summary.includes(qlc) ||
            st.includes(qlc) ||
            plate.includes(qlc) ||
            vin.includes(qlc) ||
            unit.includes(qlc) ||
            ymm.includes(qlc) ||
            woId.includes(qlc) ||
            woCustom.includes(qlc) ||
            woStatus.includes(qlc) ||
            custName.includes(qlc) ||
            biz.includes(qlc) ||
            tplName.includes(qlc) ||
            tplDesc.includes(qlc)
          );
        })
      : statusFiltered;

    setRows(filtered);
    setLoading(false);
  }, [supabase, shopId, from, to, q, statusFilter]);

  useEffect(() => {
    if (!shopId) return;
    void load();
  }, [shopId, load]);

  function exportCSV() {
    const header = [
      "Inspection ID",
      "Created",
      "Status",
      "Template",
      "Vehicle",
      "Plate",
      "Unit",
      "VIN",
      "Work Order",
      "WO Status",
      "Customer",
      "Business",
      "PDF URL",
      "Summary",
    ];

    const lines = rows.map((r) => {
      const created = r.created_at
        ? format(new Date(r.created_at), "yyyy-MM-dd HH:mm")
        : "";
      const status = deriveDisplayStatus(r);

      const tpl = r.inspection_templates;
      const tplName = safeStr(tpl?.template_name).trim();

      const v = r.vehicles;
      const vehicle = v
        ? `${v.year ?? ""} ${v.make ?? ""} ${v.model ?? ""}`.trim()
        : "";

      const wo = r.work_orders;
      const woLabel = wo?.custom_id
        ? `#${wo.custom_id}`
        : wo?.id
          ? `#${wo.id.slice(0, 8)}`
          : "";

      const cust = wo?.customers;
      const custName = joinName(cust?.first_name ?? null, cust?.last_name ?? null);
      const biz = safeStr(cust?.business_name).trim();

      const pdf = pickPdfHref(r) ?? "";

      return [
        r.id,
        created,
        status,
        tplName,
        vehicle,
        v?.license_plate ?? "",
        v?.unit_number ?? "",
        v?.vin ?? "",
        woLabel,
        safeStr(wo?.status),
        custName,
        biz,
        pdf,
        safeStr(r.summary),
      ]
        .map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`)
        .join(",");
    });

    const blob = new Blob([header.join(",") + "\n" + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inspection-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const completedCount = useMemo(
    () => rows.filter((r) => isCompletedInspection(r)).length,
    [rows],
  );
  const inProgressCount = rows.length - completedCount;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),#020617_82%)] px-4 py-6 text-white">
      <div className="mx-auto max-w-6xl rounded-2xl border border-[var(--metal-border-soft)] bg-[radial-gradient(circle_at_top,_#050910,_#020308_65%,_#000)] px-4 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.95)] sm:px-6 sm:py-6">
        {/* Top nav */}
        <div className="mb-4">
          <PreviousPageButton to="/inspection" />
        </div>

        {/* Header */}
        <div className="mb-5 flex flex-wrap items-start gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/70 px-3 py-1">
              <span className="text-[0.7rem] font-blackops uppercase tracking-[0.22em] text-neutral-200">
                Inspection History
              </span>
              <span className="text-[0.7rem] uppercase tracking-[0.18em] text-[color:var(--accent-copper-light,#f6d2b3)]">
                Compliance
              </span>
            </div>
            <p className="text-xs text-neutral-400">
              Shop-scoped audit log of inspections. Filter, search, export, and open
              PDFs for compliance records.
            </p>
          </div>

          <div className="ml-auto text-right text-xs text-neutral-400">
            <div className="font-mono text-[11px] text-neutral-500">
              {rows.length} loaded • {completedCount} completed • {inProgressCount} in progress
            </div>
            {from || to ? (
              <div className="mt-0.5 font-mono text-[11px] text-neutral-500">
                Range: {from || "…"} → {to || "…"}
              </div>
            ) : null}
          </div>
        </div>

        {/* Filters */}
        <div className="mb-5 rounded-2xl border border-[var(--metal-border-soft)] bg-black/60 p-3 shadow-[0_18px_45px_rgba(0,0,0,0.9)] sm:p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-400">
                Search
              </label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void load()}
                placeholder="Plate, VIN, unit, customer, template, WO, status…"
                className="w-full rounded-lg border border-neutral-800 bg-black/70 px-3 py-1.5 text-sm text-neutral-100 outline-none ring-0 transition-colors focus:border-orange-400 focus:ring-1 focus:ring-orange-500/70"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="rounded-lg border border-neutral-800 bg-black/70 px-3 py-1.5 text-sm text-neutral-100 outline-none ring-0 focus:border-orange-400 focus:ring-1 focus:ring-orange-500/70"
              >
                <option value="all">All</option>
                <option value="completed">Completed</option>
                <option value="in_progress">In progress</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                From
              </label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg border border-neutral-800 bg-black/70 px-3 py-1.5 text-sm text-neutral-100 outline-none ring-0 focus:border-orange-400 focus:ring-1 focus:ring-orange-500/70"
                aria-label="From date"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                To
              </label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-lg border border-neutral-800 bg-black/70 px-3 py-1.5 text-sm text-neutral-100 outline-none ring-0 focus:border-orange-400 focus:ring-1 focus:ring-orange-500/70"
                aria-label="To date"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-full border border-[var(--metal-border-soft)] bg-black/70 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.16em] text-neutral-100 hover:border-orange-400 hover:bg-black/80"
              >
                Apply
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-full border border-neutral-700 bg-black/70 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.16em] text-neutral-200 hover:bg-neutral-900"
              >
                Print
              </button>

              <button
                type="button"
                onClick={exportCSV}
                className="rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-black shadow-[0_0_18px_rgba(212,118,49,0.7)] hover:brightness-110"
              >
                Export CSV
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {err ? (
          <div className="mb-4 rounded-xl border border-red-500/60 bg-red-950/80 px-4 py-2 text-sm text-red-100">
            {err}
          </div>
        ) : null}

        {/* Content */}
        {loading ? (
          <div className="rounded-2xl border border-dashed border-[var(--metal-border-soft)] bg-black/60 p-6 text-sm text-neutral-400">
            Loading inspection history…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--metal-border-soft)] bg-black/60 p-6 text-sm text-neutral-400">
            No inspections found for this shop and filters.
          </div>
        ) : (
          <div className="grid gap-2">
            {rows.map((r) => {
              const created = r.created_at
                ? format(new Date(r.created_at), "PPpp")
                : "—";
              const status = deriveDisplayStatus(r);
              const completed = isCompletedInspection(r);

              const tpl = r.inspection_templates;
              const tplName = safeStr(tpl?.template_name).trim();

              const v = r.vehicles;
              const vehicle = v
                ? `${v.year ?? ""} ${v.make ?? ""} ${v.model ?? ""}`.trim()
                : "—";
              const plate = v?.license_plate ? `(${v.license_plate})` : "";
              const unit = v?.unit_number ? `Unit: ${v.unit_number}` : "";
              const vin = v?.vin ? `VIN: ${v.vin}` : "";

              const wo = r.work_orders;
              const woLabel = wo?.custom_id
                ? `#${wo.custom_id}`
                : wo?.id
                  ? `#${wo.id.slice(0, 8)}`
                  : null;

              const cust = wo?.customers;
              const custName = joinName(
                cust?.first_name ?? null,
                cust?.last_name ?? null,
              );
              const biz = safeStr(cust?.business_name).trim();

              const pdfHref = pickPdfHref(r);

              return (
                <div
                  key={r.id}
                  className="flex flex-col gap-2 rounded-2xl border border-[var(--metal-border-soft)] bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.24),_#020617_75%)]/90 p-3 shadow-[0_14px_38px_rgba(0,0,0,0.9)] sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/inspection/${r.id}`}
                        className="font-mono text-sm text-orange-300 underline decoration-transparent underline-offset-2 hover:decoration-orange-400"
                        title="Open inspection"
                      >
                        {tplName ? tplName : `Inspection #${r.id.slice(0, 8)}`}
                      </Link>

                      <span
                        className={
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] " +
                          (completed
                            ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-300"
                            : "border-amber-400/60 bg-amber-500/10 text-amber-200")
                        }
                        title="Inspection status"
                      >
                        {status}
                      </span>

                      <span className="text-[11px] text-neutral-400">
                        {created}
                      </span>

                      {woLabel ? (
                        <span className="rounded-full border border-white/10 bg-black/60 px-2 py-0.5 text-[10px] font-mono text-neutral-400">
                          WO {woLabel}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 truncate text-sm text-neutral-300">
                      {vehicle} {plate} {unit ? `• ${unit}` : ""}{" "}
                      {vin ? `• ${vin}` : ""}
                    </div>

                    {custName || biz ? (
                      <div className="mt-0.5 text-[11px] text-neutral-400">
                        Customer:{" "}
                        {biz
                          ? `${biz}${custName ? ` • ${custName}` : ""}`
                          : custName}
                      </div>
                    ) : null}

                    {safeStr(r.summary).trim() ? (
                      <div className="mt-1 line-clamp-2 text-[11px] text-white/55">
                        {safeStr(r.summary).trim()}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {wo?.id ? (
                      <Link
                        href={`/work-orders/${wo.id}`}
                        className="rounded-full border border-[var(--metal-border-soft)] bg-black/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-100 hover:border-orange-400 hover:bg-black/80"
                        title="Open related work order"
                      >
                        Open WO
                      </Link>
                    ) : null}

                    {pdfHref ? (
                      <a
                        href={pdfHref}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-black shadow-[0_0_14px_rgba(212,118,49,0.6)] hover:brightness-110"
                        title="Open finalized PDF (compliance record)"
                      >
                        PDF
                      </a>
                    ) : (
                      <span className="rounded-full border border-white/10 bg-black/50 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                        No PDF
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}