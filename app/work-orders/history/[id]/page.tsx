import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { format } from "date-fns";
import type { Database } from "@shared/types/types/supabase";
import { formatMoneyLike, historyShortId, parseHistoryNotes } from "../historyDisplay";

type DB = Database;
type HistoryDetail = Pick<DB["public"]["Tables"]["history"]["Row"], "id" | "work_order_id" | "service_date" | "description" | "notes" | "created_at" | "work_order_number" | "invoice_number" | "opened_at" | "closed_at" | "historical_status" | "advisor_name" | "assigned_tech_name" | "priority" | "odometer" | "symptom" | "cause" | "correction" | "labor_hours" | "labor_sale" | "parts_sale" | "shop_supplies" | "sublet_sale" | "discount" | "tax" | "total" | "approval_state" | "payment_state" | "tags" | "source_system" | "source_external_id" | "source_row_id" | "imported_from_session_id"> & { customers: Pick<DB["public"]["Tables"]["customers"]["Row"], "first_name" | "last_name" | "email" | "phone" | "shop_id"> | null; vehicles: Pick<DB["public"]["Tables"]["vehicles"]["Row"], "year" | "make" | "model" | "unit_number" | "license_plate" | "vin" | "shop_id"> | null };

export default async function HistoryDetailPage({ params }: { params: Promise<{ id: string }> }): Promise<JSX.Element> {
  const { id } = await params;
  const supabase = createServerSupabaseRSC();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();
  const { data: profile } = await supabase.from("profiles").select("shop_id").eq("id", user.id).maybeSingle();
  if (!profile?.shop_id) notFound();

  const { data } = await supabase.from("history").select("id,work_order_id,service_date,description,notes,created_at,work_order_number,invoice_number,opened_at,closed_at,historical_status,advisor_name,assigned_tech_name,priority,odometer,symptom,cause,correction,labor_hours,labor_sale,parts_sale,shop_supplies,sublet_sale,discount,tax,total,approval_state,payment_state,tags,source_system,source_external_id,source_row_id,imported_from_session_id,customers:customers(first_name,last_name,email,phone,shop_id),vehicles:vehicles(year,make,model,unit_number,license_plate,vin,shop_id)").eq("id", id).maybeSingle();
  const row = data as HistoryDetail | null;
  if (!row) notFound();
  if ((row.customers?.shop_id && row.customers.shop_id !== profile.shop_id) || (row.vehicles?.shop_id && row.vehicles.shop_id !== profile.shop_id)) notFound();

  const p = parseHistoryNotes(row.notes);
  const serviceDate = row.service_date ? format(new Date(row.service_date), "PPpp") : "—";

  return <div className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.08),transparent_34%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.06),transparent_32%),#050914] px-4 py-6 text-white"><div className="mx-auto max-w-5xl space-y-4"><Link href="/work-orders/history" className="inline-flex items-center gap-2 rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-neutral-200">← Back to History</Link><section className="rounded-2xl border border-slate-700/60 bg-slate-950/70 p-4"><h1 className="font-mono text-xl text-sky-200">History #{historyShortId(row.id)}</h1></section><section className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-3 text-sm"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"><div>Work Order: {row.work_order_number ?? p.workOrderLabel ?? "—"}</div><div>Invoice: {row.invoice_number ?? p.invoiceLabel ?? "—"}</div><div>Status: {row.historical_status ?? "—"}</div><div>Opened: {row.opened_at ? format(new Date(row.opened_at), "PPpp") : serviceDate}</div><div>Closed: {row.closed_at ? format(new Date(row.closed_at), "PPpp") : "—"}</div><div>Priority: {row.priority ?? "—"}</div><div>Advisor: {row.advisor_name ?? "—"}</div><div>Tech: {row.assigned_tech_name ?? "—"}</div><div>Odometer: {row.odometer ?? "—"}</div><div>Labor Hours: {row.labor_hours ?? "—"}</div><div>Labor: {formatMoneyLike(String(row.labor_sale ?? "")) ?? "—"}</div><div>Parts: {formatMoneyLike(String(row.parts_sale ?? "")) ?? "—"}</div><div>Tax: {formatMoneyLike(String(row.tax ?? "")) ?? "—"}</div><div>Total: {formatMoneyLike(String(row.total ?? "")) ?? formatMoneyLike(p.totalLabel) ?? "—"}</div><div>Approval: {row.approval_state ?? "—"}</div><div>Payment: {row.payment_state ?? "—"}</div></div></section></div></div>;
}
