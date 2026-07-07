"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { format } from "date-fns";
import type { Database } from "@shared/types/types/supabase";
import {
  fmtCustomerName,
  fmtVehicle,
  parseHistoryNotes,
} from "./historyDisplay";
import GuidedPageStepPanel from "@/features/onboarding-v2/components/GuidedPageStepPanel";
import { VehicleHistoryCsvImportCard } from "@/features/work-orders/components/VehicleHistoryCsvImportCard";
import { ImportedHistoryRecordCard } from "@/features/work-orders/components/ImportedHistoryRecordCard";
import { usePersistentGuidedOnboardingQuery } from "@/features/onboarding-v2/guided/persistence";

type DB = Database;
type HistoryRow = DB["public"]["Tables"]["history"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];

type Row = Pick<
  HistoryRow,
  | "id"
  | "customer_id"
  | "vehicle_id"
  | "work_order_id"
  | "service_date"
  | "description"
  | "notes"
  | "created_at"
  | "work_order_number"
  | "invoice_number"
  | "historical_status"
  | "payment_state"
  | "approval_state"
  | "odometer"
  | "advisor_name"
  | "assigned_tech_name"
  | "labor_sale"
  | "parts_sale"
  | "tax"
  | "total"
  | "symptom"
  | "cause"
  | "correction"
  | "source_external_id"
  | "source_row_id"
  | "imported_from_session_id"
> & {
  customers: Pick<
    CustomerRow,
    "first_name" | "last_name" | "email" | "phone"
  > | null;
  vehicles: Pick<
    VehicleRow,
    "year" | "make" | "model" | "license_plate" | "vin" | "unit_number"
  > | null;
};

function fmtDate(iso: string | null | undefined, pattern = "PPpp"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, pattern);
}

export default function WorkOrdersHistoryClient(): JSX.Element {
  const vehicleHistoryGuidedQuery = usePersistentGuidedOnboardingQuery("vehicle_history");
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [shopId, setShopId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [showImport, setShowImport] = useState(false);
  const shouldShowImport = Boolean(vehicleHistoryGuidedQuery || showImport);

  useEffect(() => {
    void (async () => {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr || !user)
        return (
          setErr("You must be signed in to view service history."),
          setLoading(false)
        );
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", user.id)
        .maybeSingle<Pick<ProfileRow, "shop_id">>();
      if (profileErr) return (setErr(profileErr.message), setLoading(false));
      if (!profile?.shop_id)
        return (
          setErr("No shop is linked to your profile yet."),
          setLoading(false)
        );
      setShopId(profile.shop_id);
      setLoading(false);
    })();
  }, [supabase]);

  const load = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    setErr(null);
    let query = supabase
      .from("history")
      .select(
        "id, customer_id, vehicle_id, work_order_id, service_date, description, notes, created_at, work_order_number, invoice_number, historical_status, payment_state, approval_state, odometer, advisor_name, assigned_tech_name, labor_sale, parts_sale, tax, total, symptom, cause, correction, source_external_id, source_row_id, imported_from_session_id, customers:customers(first_name,last_name,email,phone), vehicles:vehicles(year,make,model,license_plate,vin,unit_number)",
      )
      .order("service_date", { ascending: false })
      .limit(300);
    if (from)
      query = query.gte(
        "service_date",
        new Date(`${from}T00:00:00Z`).toISOString(),
      );
    if (to) {
      const toEnd = new Date(`${to}T00:00:00Z`);
      toEnd.setHours(23, 59, 59, 999);
      query = query.lte("service_date", toEnd.toISOString());
    }
    const { data, error } = await query;
    if (error) return (setErr(error.message), setRows([]), setLoading(false));
    const list = (data ?? []) as unknown as Row[];
    const qlc = q.trim().toLowerCase();
    const filtered = qlc
      ? list.filter((r) => {
          const p = parseHistoryNotes(r.notes);
          const haystack = [
            r.id,
            fmtCustomerName(r.customers),
            fmtVehicle(r.vehicles),
            r.vehicles?.vin ?? "",
            r.description ?? "",
            r.notes ?? "",
            p.workOrderLabel ?? "",
            p.invoiceLabel ?? "",
            p.totalLabel ?? "",
            p.laborLabel ?? "",
            p.sourceExternalId ?? "",
            p.sourceRowId ?? "",
            p.onboardingSessionId ?? "",
            p.liveWorkOrderId ?? "",
            ...p.extraLines,
            ...p.importLines,
            fmtDate(r.service_date, "yyyy-MM-dd"),
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(qlc);
        })
      : list;
    setRows(filtered);
    setLoading(false);
  }, [from, q, shopId, supabase, to]);

  useEffect(() => {
    if (shopId) void load();
  }, [load, shopId]);

  function exportCSV() {
    const header = [
      "History ID",
      "Service Date",
      "Customer",
      "Email",
      "Phone",
      "Vehicle",
      "Plate",
      "VIN",
      "Work Order",
      "Invoice",
      "Total",
      "Labor",
      "Description",
      "Details",
      "Source External ID",
      "Source Row ID",
      "Onboarding Session",
      "Live Work Order ID",
    ];
    const lines = rows.map((r) => {
      const p = parseHistoryNotes(r.notes);
      return [
        r.id,
        fmtDate(r.service_date, "yyyy-MM-dd HH:mm"),
        fmtCustomerName(r.customers),
        r.customers?.email ?? "",
        r.customers?.phone ?? "",
        fmtVehicle(r.vehicles),
        r.vehicles?.license_plate ?? "",
        r.vehicles?.vin ?? "",
        p.workOrderLabel ?? "",
        p.invoiceLabel ?? "",
        p.totalLabel ?? "",
        p.laborLabel ?? "",
        r.description ?? "",
        p.extraLines.join(" | "),
        p.sourceExternalId ?? "",
        p.sourceRowId ?? "",
        p.onboardingSessionId ?? "",
        p.liveWorkOrderId ?? "",
      ]
        .map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`)
        .join(",");
    });
    const blob = new Blob([header.join(",") + "\n" + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `service-history-${Date.now()}.csv`;
    a.click();
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.08),transparent_34%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.06),transparent_32%),#050914] px-4 py-6 text-white">
      <div className="mx-auto max-w-6xl space-y-4">
        <GuidedPageStepPanel />
        {shouldShowImport ? (
          <VehicleHistoryCsvImportCard
            guidedQuery={vehicleHistoryGuidedQuery}
            onImported={() => void load()}
          />
        ) : null}
        {/* existing controls kept */}
        <section className="rounded-[26px] border border-slate-700/60 bg-slate-950/70 px-4 py-5 shadow-[0_18px_48px_rgba(2,6,23,0.58)] sm:px-6 sm:py-6">
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="Customer, VIN, WO, invoice, total, notes…"
              className="min-w-[220px] flex-1 rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 py-1.5 text-sm"
            />
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 py-1.5 text-sm"
            />
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 py-1.5 text-sm"
            />
            <button
              onClick={load}
              className="rounded-full border border-slate-700/70 px-3 py-1.5 text-xs"
            >
              Apply
            </button>
            <button
              onClick={() => setShowImport((current) => !current)}
              className="rounded-full border border-[var(--accent-copper-soft)]/45 bg-[var(--accent-copper)]/10 px-3 py-1.5 text-xs text-orange-100"
            >
              {showImport ? "Hide import" : "Import CSV"}
            </button>
            <button
              onClick={exportCSV}
              className="rounded-full border border-sky-400/35 bg-sky-500/10 px-3 py-1.5 text-xs"
            >
              Export CSV
            </button>
          </div>
          {err ? (
            <div className="mb-4 rounded-xl border border-red-500/60 bg-red-950/80 px-4 py-2 text-sm text-red-100">
              {err}
            </div>
          ) : null}
          {loading ? (
            <div>Loading service history…</div>
          ) : rows.length === 0 ? (
            <div>No service history found.</div>
          ) : (
            <div className="grid gap-2">
              {rows.map((r) => {
                const p = parseHistoryNotes(r.notes);
                return (
                  <ImportedHistoryRecordCard
                    key={r.id}
                    row={r}
                    serviceDateLabel={fmtDate(r.service_date ?? r.created_at)}
                    vehicleLabel={fmtVehicle(r.vehicles)}
                    vehicleIdentifiers={
                      r.vehicles?.vin ? `VIN ${r.vehicles.vin}` : null
                    }
                    summary={
                      r.description?.trim() ||
                      p.extraLines.join(" • ") ||
                      "Imported historical service record"
                    }
                    action={
                      <div className="flex flex-wrap items-center gap-3">
                        <Link
                          href={`/work-orders/history/${r.id}`}
                          className="text-xs uppercase tracking-[0.16em] text-sky-200 hover:text-sky-100"
                        >
                          View history details
                        </Link>
                        {r.work_order_id ? (
                          <Link
                            href={`/work-orders/view/${r.work_order_id}`}
                            className="text-xs text-cyan-300/85 hover:text-cyan-200"
                          >
                            Open linked work order
                          </Link>
                        ) : null}
                      </div>
                    }
                    className="shadow-[0_14px_38px_rgba(2,6,23,0.82)]"
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
