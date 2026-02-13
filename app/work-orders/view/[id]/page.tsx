// /app/work-orders/view/[id]/page.tsx
"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];

function chipClass(status: string | null | undefined): string {
  const s = (status ?? "").toLowerCase();
  if (s.includes("paid") || s.includes("completed"))
    return "border-emerald-400/60 bg-emerald-500/10 text-emerald-200";
  if (s.includes("invoice"))
    return "border-orange-400/60 bg-orange-500/10 text-orange-200";
  if (s.includes("approval"))
    return "border-blue-400/60 bg-blue-500/10 text-blue-200";
  if (s.includes("hold"))
    return "border-amber-400/60 bg-amber-500/10 text-amber-200";
  return "border-white/15 bg-white/5 text-neutral-200";
}

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export default function WorkOrderReadOnlyStoryPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const workOrderId = (params?.id ?? "").toString();
  const returnUrl = searchParams.get("return");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [lines, setLines] = useState<WorkOrderLine[]>([]);

  useEffect(() => {
    if (!workOrderId) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr(null);

      try {
        const { data: woRow, error: woErr } = await supabase
          .from("work_orders")
          .select("*")
          .eq("id", workOrderId)
          .maybeSingle<WorkOrder>();

        if (woErr) throw woErr;
        if (!woRow) throw new Error("Work order not found.");

        if (cancelled) return;
        setWo(woRow);

        const { data: wol, error: wolErr } = await supabase
          .from("work_order_lines")
          .select("id, line_no, description, complaint, cause, correction, status, labor_time")
          .eq("work_order_id", woRow.id)
          .order("line_no", { ascending: true });

        if (wolErr) throw wolErr;
        if (!cancelled) setLines((Array.isArray(wol) ? wol : []) as WorkOrderLine[]);

        if (woRow.vehicle_id) {
          const { data: v, error: ve } = await supabase
            .from("vehicles")
            .select("*")
            .eq("id", woRow.vehicle_id)
            .maybeSingle<Vehicle>();
          if (ve) throw ve;
          if (!cancelled) setVehicle(v ?? null);
        } else if (!cancelled) {
          setVehicle(null);
        }

        if (woRow.customer_id) {
          const { data: c, error: ce } = await supabase
            .from("customers")
            .select("*")
            .eq("id", woRow.customer_id)
            .maybeSingle<Customer>();
          if (ce) throw ce;
          if (!cancelled) setCustomer(c ?? null);
        } else if (!cancelled) {
          setCustomer(null);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load work order.";
        if (!cancelled) setErr(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, workOrderId]);

  const title = safeTrim(wo?.custom_id)
    ? `WO ${safeTrim(wo?.custom_id)}`
    : wo?.id
      ? `WO ${wo.id.slice(0, 8)}…`
      : "Work Order";

  const vehicleLabel = vehicle
    ? `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`
        .trim()
        .replace(/\s+/g, " ") || "Vehicle"
    : "Vehicle";

  const custLabel = customer
    ? [customer.first_name ?? "", customer.last_name ?? ""].filter(Boolean).join(" ").trim() || "Customer"
    : "Customer";

  const updatedAt = wo?.updated_at ? format(new Date(wo.updated_at), "PPpp") : "—";

  const goBack = () => {
    const r = safeTrim(returnUrl);
    if (r) router.push(r);
    else router.back();
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.14),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)] px-4 py-6 text-white">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-neutral-200 hover:bg-black/70"
          >
            <span aria-hidden className="text-base leading-none">←</span>
            Back
          </button>

          <div className="text-[11px] text-neutral-500">
            View: <span className="font-mono text-neutral-300">WO story</span>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-black/35 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.9)]">
          {loading ? (
            <div className="text-sm text-neutral-300">Loading…</div>
          ) : err ? (
            <div className="space-y-2">
              <div className="text-sm text-red-200">{err}</div>
              <div className="text-[11px] text-neutral-500">
                If this is a permissions issue, confirm your RLS / shop scope is set for staff.
              </div>
            </div>
          ) : !wo ? (
            <div className="text-sm text-neutral-300">Work order not found.</div>
          ) : (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div
                    className="text-xl font-semibold text-white"
                    style={{ fontFamily: "var(--font-blackops), system-ui" }}
                  >
                    {title}
                  </div>
                  <div className="mt-1 text-[12px] text-neutral-400">
                    {custLabel} • {vehicleLabel}
                  </div>
                  <div className="mt-1 text-[11px] text-neutral-500">
                    Updated: <span className="text-neutral-300">{updatedAt}</span>
                  </div>
                </div>

                <div className="inline-flex items-center gap-2">
                  <span
                    className={
                      "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] " +
                      chipClass(wo.status)
                    }
                  >
                    {String(wo.status ?? "—").replaceAll("_", " ")}
                  </span>
                  <span className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[10px] font-mono text-neutral-400">
                    {wo.id.slice(0, 8)}
                  </span>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-black/35 p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">
                  Complaint • Cause • Correction
                </div>

                {lines.length === 0 ? (
                  <div className="text-sm text-neutral-300">No line items.</div>
                ) : (
                  <div className="space-y-2">
                    {lines.map((l) => {
                      const label =
                        safeTrim(l.description) ||
                        safeTrim(l.complaint) ||
                        (l.line_no != null ? `Line ${l.line_no}` : "") ||
                        "Line item";

                      const complaint = safeTrim(l.complaint);
                      const cause = safeTrim(l.cause);
                      const correction = safeTrim(l.correction);

                      return (
                        <div key={l.id} className="rounded-xl border border-white/10 bg-black/40 p-3">
                          <div className="flex items-baseline justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-neutral-100">{label}</div>
                              <div className="mt-0.5 text-[11px] text-neutral-500">
                                Line #{l.line_no ?? "—"}
                                {typeof l.labor_time === "number" ? ` • ${l.labor_time} hr` : ""}
                              </div>
                            </div>
                            <div className="text-[11px] text-neutral-500">
                              {safeTrim(l.status) ? `Status: ${String(l.status).replaceAll("_", " ")}` : ""}
                            </div>
                          </div>

                          <div className="mt-2 space-y-1 text-[12px] text-neutral-300">
                            <div>
                              <span className="text-neutral-500">Complaint:</span>{" "}
                              <span className="text-neutral-200">{complaint || "—"}</span>
                            </div>
                            <div>
                              <span className="text-neutral-500">Cause:</span>{" "}
                              <span className="text-neutral-200">{cause || "—"}</span>
                            </div>
                            <div>
                              <span className="text-neutral-500">Correction:</span>{" "}
                              <span className="text-neutral-200">{correction || "—"}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}