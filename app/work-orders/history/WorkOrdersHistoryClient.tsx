"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { format } from "date-fns";
import type { Database } from "@shared/types/types/supabase";
import { fmtCustomerName, fmtVehicle, formatMoneyLike, historyTitle, parseHistoryNotes } from "./historyDisplay";
import { ServiceHistoryOnboardingSetupCard } from "@/features/work-orders/components/history/ServiceHistoryOnboardingSetupCard";

type DB = Database;
type HistoryRow = DB["public"]["Tables"]["history"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];

type Row = Pick<
  HistoryRow,
  "id" | "customer_id" | "vehicle_id" | "work_order_id" | "service_date" | "description" | "notes" | "created_at" | "work_order_number" | "invoice_number" | "historical_status" | "payment_state" | "approval_state" | "odometer" | "advisor_name" | "assigned_tech_name" | "labor_sale" | "parts_sale" | "tax" | "total" | "symptom" | "cause" | "correction" | "source_external_id" | "source_row_id" | "imported_from_session_id"
> & {
  customers: Pick<CustomerRow, "first_name" | "last_name" | "email" | "phone"> | null;
  vehicles: Pick<VehicleRow, "year" | "make" | "model" | "license_plate" | "vin" | "unit_number"> | null;
};

function fmtDate(iso: string | null | undefined, pattern = "PPpp"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, pattern);
}

export default function WorkOrdersHistoryClient(): JSX.Element {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [shopId, setShopId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  useEffect(() => { void (async () => {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr || !user) return setErr("You must be signed in to view service history."), setLoading(false);
      const { data: profile, error: profileErr } = await supabase.from("profiles").select("shop_id").eq("id", user.id).maybeSingle<Pick<ProfileRow, "shop_id">>();
      if (profileErr) return setErr(profileErr.message), setLoading(false);
      if (!profile?.shop_id) return setErr("No shop is linked to your profile yet."), setLoading(false);
      setShopId(profile.shop_id); setLoading(false);
  })(); }, [supabase]);

  const load = useCallback(async () => {
    if (!shopId) return;
    setLoading(true); setErr(null);
    let query = supabase.from("history").select("id, customer_id, vehicle_id, work_order_id, service_date, description, notes, created_at, work_order_number, invoice_number, historical_status, payment_state, approval_state, odometer, advisor_name, assigned_tech_name, labor_sale, parts_sale, tax, total, symptom, cause, correction, source_external_id, source_row_id, imported_from_session_id, customers:customers(first_name,last_name,email,phone), vehicles:vehicles(year,make,model,license_plate,vin,unit_number)").order("service_date", { ascending: false }).limit(300);
    if (from) query = query.gte("service_date", new Date(`${from}T00:00:00Z`).toISOString());
    if (to) { const toEnd = new Date(`${to}T00:00:00Z`); toEnd.setHours(23, 59, 59, 999); query = query.lte("service_date", toEnd.toISOString()); }
    const { data, error } = await query;
    if (error) return setErr(error.message), setRows([]), setLoading(false);
    const list = (data ?? []) as unknown as Row[];
    const qlc = q.trim().toLowerCase();
    const filtered = qlc ? list.filter((r) => {
      const p = parseHistoryNotes(r.notes);
      const haystack = [
        r.id, fmtCustomerName(r.customers), fmtVehicle(r.vehicles), r.vehicles?.vin ?? "", r.description ?? "", r.notes ?? "",
        p.workOrderLabel ?? "", p.invoiceLabel ?? "", p.totalLabel ?? "", p.laborLabel ?? "", p.sourceExternalId ?? "", p.sourceRowId ?? "", p.onboardingSessionId ?? "", p.liveWorkOrderId ?? "", ...p.extraLines, ...p.importLines, fmtDate(r.service_date, "yyyy-MM-dd"),
      ].join(" ").toLowerCase();
      return haystack.includes(qlc);
    }) : list;
    setRows(filtered); setLoading(false);
  }, [from, q, shopId, supabase, to]);

  useEffect(() => { if (shopId) void load(); }, [load, shopId]);

  function exportCSV() {
    const header = ["History ID","Service Date","Customer","Email","Phone","Vehicle","Plate","VIN","Work Order","Invoice","Total","Labor","Description","Details","Source External ID","Source Row ID","Onboarding Session","Live Work Order ID"];
    const lines = rows.map((r) => {
      const p = parseHistoryNotes(r.notes);
      return [r.id, fmtDate(r.service_date, "yyyy-MM-dd HH:mm"), fmtCustomerName(r.customers), r.customers?.email ?? "", r.customers?.phone ?? "", fmtVehicle(r.vehicles), r.vehicles?.license_plate ?? "", r.vehicles?.vin ?? "", p.workOrderLabel ?? "", p.invoiceLabel ?? "", p.totalLabel ?? "", p.laborLabel ?? "", r.description ?? "", p.extraLines.join(" | "), p.sourceExternalId ?? "", p.sourceRowId ?? "", p.onboardingSessionId ?? "", p.liveWorkOrderId ?? ""].map((x)=>`"${String(x ?? "").replace(/"/g,'""')}"`).join(",");
    });
    const blob = new Blob([header.join(",") + "\n" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `service-history-${Date.now()}.csv`; a.click();
  }

  return <div className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.08),transparent_34%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.06),transparent_32%),#050914] px-4 py-6 text-white"><div className="mx-auto max-w-6xl space-y-4"><ServiceHistoryOnboardingSetupCard />{/* existing controls kept */}
    <section className="rounded-[26px] border border-slate-700/60 bg-slate-950/70 px-4 py-5 shadow-[0_18px_48px_rgba(2,6,23,0.58)] sm:px-6 sm:py-6">
      <div className="mb-3 flex flex-wrap items-end gap-3"><input value={q} onChange={(e)=>setQ(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&load()} placeholder="Customer, VIN, WO, invoice, total, notes…" className="min-w-[220px] flex-1 rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 py-1.5 text-sm"/><input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} className="rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 py-1.5 text-sm"/><input type="date" value={to} onChange={(e)=>setTo(e.target.value)} className="rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 py-1.5 text-sm"/><button onClick={load} className="rounded-full border border-slate-700/70 px-3 py-1.5 text-xs">Apply</button><button onClick={exportCSV} className="rounded-full border border-sky-400/35 bg-sky-500/10 px-3 py-1.5 text-xs">Export CSV</button></div>
      {err ? <div className="mb-4 rounded-xl border border-red-500/60 bg-red-950/80 px-4 py-2 text-sm text-red-100">{err}</div> : null}
      {loading ? <div>Loading service history…</div> : rows.length===0 ? <div>No service history found.</div> : <div className="grid gap-2">{rows.map((r)=>{const p=parseHistoryNotes(r.notes); const title=historyTitle({id:r.id,workOrderLabel:p.workOrderLabel,invoiceLabel:p.invoiceLabel});
        return <article key={r.id} className="rounded-2xl border border-slate-700/60 bg-slate-950/70 p-3 shadow-[0_14px_38px_rgba(2,6,23,0.82)]"><div className="flex items-start justify-between gap-3"><div><h3 className="font-mono text-sm text-sky-200">{title}</h3><div className="text-sm text-neutral-200">{fmtCustomerName(r.customers)}</div><div className="text-xs text-neutral-400">{fmtVehicle(r.vehicles)}</div>{r.vehicles?.vin ? <div className="text-[11px] text-neutral-500">VIN: {r.vehicles.vin}</div> : null}</div><div className="text-right"><div className="font-mono text-xs text-sky-200">{fmtDate(r.service_date ?? r.created_at)}</div><span className="mt-1 inline-flex rounded-full border border-sky-400/35 bg-sky-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-sky-100">Read only</span></div></div>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.12em]">{r.historical_status ? <span className="rounded-full border border-slate-600 px-2 py-0.5">{r.historical_status}</span> : null}{r.payment_state ? <span className="rounded-full border border-cyan-700/60 px-2 py-0.5">{r.payment_state}</span> : null}{r.approval_state ? <span className="rounded-full border border-sky-700/60 px-2 py-0.5">{r.approval_state}</span> : null}</div>
          <div className="mt-3 grid gap-2 text-xs text-neutral-300 sm:grid-cols-2 lg:grid-cols-4"><div>Work order: <span className="text-neutral-100">{r.work_order_number ?? p.workOrderLabel ?? "—"}</span></div><div>Invoice: <span className="text-neutral-100">{r.invoice_number ?? p.invoiceLabel ?? "—"}</span></div><div>Total: <span className="text-neutral-100">{formatMoneyLike(String(r.total ?? "")) ?? formatMoneyLike(p.totalLabel) ?? "—"}</span></div><div>Labor: <span className="text-neutral-100">{formatMoneyLike(String(r.labor_sale ?? "")) ?? formatMoneyLike(p.laborLabel) ?? "—"}</span></div></div>
          <div className="mt-2 text-xs text-neutral-300">Advisor: <span className="text-neutral-100">{r.advisor_name ?? "—"}</span> · Tech: <span className="text-neutral-100">{r.assigned_tech_name ?? "—"}</span> · Odometer: <span className="text-neutral-100">{r.odometer ?? "—"}</span></div>
          <div className="mt-2 rounded-xl border border-slate-700/55 bg-slate-900/60 px-3 py-2 text-sm text-neutral-200"><div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-neutral-400">Service summary</div>{r.description?.trim() || p.invoiceLabel || p.workOrderLabel || "Imported historical service record"}</div>
          {p.extraLines.length>0 ? <div className="mt-2 rounded-xl border border-slate-700/55 bg-slate-900/50 px-3 py-2 text-[11px] text-neutral-400"><div className="mb-1 uppercase tracking-[0.14em] text-neutral-500">Details</div>{p.extraLines.map((line,idx)=><div key={`${r.id}-line-${idx}`}>{line}</div>)}</div>:null}
          <div className="mt-2 rounded-xl border border-cyan-900/40 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-400"><div className="mb-1 uppercase tracking-[0.14em] text-cyan-300/80">Import trace</div><div>Source external ID: {p.sourceExternalId ?? "—"}</div><div>Source row ID: {p.sourceRowId ?? "—"}</div><div>Onboarding session: {p.onboardingSessionId ?? "—"}</div><div>Live work order ID: {p.liveWorkOrderId ?? r.work_order_id ?? "—"}</div></div>
          <div className="mt-3 flex flex-wrap items-center gap-3"><Link href={`/work-orders/history/${r.id}`} className="text-xs uppercase tracking-[0.16em] text-sky-200 hover:text-sky-100">View history details</Link>{r.work_order_id ? <Link href={`/work-orders/view/${r.work_order_id}`} className="text-xs text-cyan-300/85 hover:text-cyan-200">Open linked work order</Link> : null}</div>
        </article>;})}</div>}
    </section></div></div>;
}
