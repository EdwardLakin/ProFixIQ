"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];

type AllocationRow =
  DB["public"]["Tables"]["work_order_part_allocations"]["Row"] & {
    parts?: { name: string | null; sku?: string | null; part_number?: string | null } | null;
  };

function chipClass(status: string | null | undefined): string {
  const s = (status ?? "").toLowerCase();
  if (s.includes("paid") || s.includes("completed")) return "border-emerald-400/60 bg-emerald-500/10 text-emerald-200";
  if (s.includes("invoice")) return "border-orange-400/60 bg-orange-500/10 text-orange-200";
  if (s.includes("approval")) return "border-blue-400/60 bg-blue-500/10 text-blue-200";
  if (s.includes("hold")) return "border-amber-400/60 bg-amber-500/10 text-amber-200";
  return "border-white/15 bg-white/5 text-neutral-200";
}

export default function WorkOrderReadOnlyViewPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const workOrderId = (params?.id ?? "").toString();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);

  const [lines, setLines] = useState<WorkOrderLine[]>([]);
  const [allocs, setAllocs] = useState<AllocationRow[]>([]);

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

        // pull lines
        const { data: wol, error: wolErr } = await supabase
          .from("work_order_lines")
          .select("*")
          .eq("work_order_id", woRow.id)
          .order("line_no", { ascending: true });

        if (wolErr) throw wolErr;
        if (!cancelled) setLines((Array.isArray(wol) ? wol : []) as WorkOrderLine[]);

        // allocations joined to parts (for read-only parts usage)
        const { data: aRows, error: aErr } = await supabase
          .from("work_order_part_allocations")
          .select("*, parts(name, sku, part_number)")
          .eq("work_order_id", woRow.id)
          .order("created_at", { ascending: true });

        if (aErr) {
          // allocations are optional; don't hard fail the whole page
          // eslint-disable-next-line no-console
          console.warn("[wo view] allocations query failed:", aErr.message);
          if (!cancelled) setAllocs([]);
        } else {
          if (!cancelled) setAllocs((Array.isArray(aRows) ? aRows : []) as AllocationRow[]);
        }

        // vehicle
        if (woRow.vehicle_id) {
          const { data: v, error: ve } = await supabase
            .from("vehicles")
            .select("*")
            .eq("id", woRow.vehicle_id)
            .maybeSingle<Vehicle>();
          if (ve) throw ve;
          if (!cancelled) setVehicle(v ?? null);
        } else {
          if (!cancelled) setVehicle(null);
        }

        // customer
        if (woRow.customer_id) {
          const { data: c, error: ce } = await supabase
            .from("customers")
            .select("*")
            .eq("id", woRow.customer_id)
            .maybeSingle<Customer>();
          if (ce) throw ce;
          if (!cancelled) setCustomer(c ?? null);
        } else {
          if (!cancelled) setCustomer(null);
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

  const title = wo?.custom_id?.trim()
    ? `WO ${wo.custom_id.trim()}`
    : wo?.id
      ? `WO ${wo.id.slice(0, 8)}…`
      : "Work Order";

  const vehicleLabel = vehicle
    ? `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim().replace(/\s+/g, " ") || "Vehicle"
    : "Vehicle";

  const custLabel = customer
    ? [customer.first_name ?? "", customer.last_name ?? ""].filter(Boolean).join(" ").trim() || "Customer"
    : "Customer";

  const updatedAt = wo?.updated_at ? format(new Date(wo.updated_at), "PPpp") : "—";

  // group allocations by line
  const allocsByLine = useMemo(() => {
    const m = new Map<string, AllocationRow[]>();
    for (const a of allocs) {
      const lid = (a.work_order_line_id ?? "").toString().trim();
      if (!lid) continue;
      const arr = m.get(lid) ?? [];
      arr.push(a);
      m.set(lid, arr);
    }
    return m;
  }, [allocs]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.14),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)] px-4 py-6 text-white">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-neutral-200 hover:bg-black/70"
          >
            <span aria-hidden className="text-base leading-none">←</span>
            Back
          </button>

          <Link
            href="/work-orders/history"
            className="rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-neutral-200 hover:bg-black/70"
          >
            History list
          </Link>
        </div>

        <div className="rounded-3xl border border-white/10 bg-black/35 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.9)]">
          {loading ? (
            <div className="text-sm text-neutral-300">Loading…</div>
          ) : err ? (
            <div className="space-y-2">
              <div className="text-sm text-red-200">{err}</div>
              <div className="text-[11px] text-neutral-500">If this is a permissions issue, confirm your RLS / shop scope is set for staff.</div>
            </div>
          ) : !wo ? (
            <div className="text-sm text-neutral-300">Work order not found.</div>
          ) : (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="text-xl font-semibold text-white" style={{ fontFamily: "var(--font-blackops), system-ui" }}>
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
                  <span className={"rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] " + chipClass(wo.status)}>
                    {String(wo.status ?? "—").replaceAll("_", " ")}
                  </span>
                  <span className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[10px] font-mono text-neutral-400">
                    {wo.id.slice(0, 8)}
                  </span>
                </div>
              </div>

              <div className="mt-5 grid gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">Line items</div>

                  {lines.length === 0 ? (
                    <div className="text-sm text-neutral-300">No line items.</div>
                  ) : (
                    <div className="space-y-2">
                      {lines.map((l) => {
                        const label =
                          (l.description ?? "").trim() ||
                          (l.complaint ?? "").trim() ||
                          `Line ${l.line_no ?? ""}`.trim() ||
                          "Line item";

                        const lp = allocsByLine.get(l.id) ?? [];

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
                                {String(l.status ?? "").trim() ? `Status: ${String(l.status).replaceAll("_", " ")}` : ""}
                              </div>
                            </div>

                            {(l.cause ?? "").trim() || (l.correction ?? "").trim() ? (
                              <div className="mt-2 space-y-1 text-[12px] text-neutral-300">
                                {(l.cause ?? "").trim() ? (
                                  <div>
                                    <span className="text-neutral-500">Cause:</span>{" "}
                                    <span className="text-neutral-200">{String(l.cause)}</span>
                                  </div>
                                ) : null}
                                {(l.correction ?? "").trim() ? (
                                  <div>
                                    <span className="text-neutral-500">Correction:</span>{" "}
                                    <span className="text-neutral-200">{String(l.correction)}</span>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}

                            {lp.length > 0 ? (
                              <div className="mt-3 rounded-lg border border-white/10 bg-black/35 p-3">
                                <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">Parts used</div>
                                <div className="mt-2 space-y-1">
                                  {lp.map((a) => (
                                    <div key={a.id} className="flex items-baseline justify-between gap-2 text-sm">
                                      <div className="min-w-0 text-neutral-200">
                                        <span className="text-neutral-500">x{a.qty}</span>{" "}
                                        {a.parts?.name ?? "Part"}
                                        {a.parts?.part_number ? (
                                          <span className="text-neutral-500"> ({a.parts.part_number})</span>
                                        ) : null}
                                      </div>
                                      <div className="whitespace-nowrap text-[12px] text-neutral-400">
                                        {a.location_id ? `loc ${String(a.location_id).slice(0, 6)}…` : "—"}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">Parts (overall)</div>

                  {allocs.length === 0 ? (
                    <div className="text-sm text-neutral-300">No part allocations for this work order.</div>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
                      <div className="grid grid-cols-12 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-neutral-400">
                        <div className="col-span-7">Part</div>
                        <div className="col-span-3">Line</div>
                        <div className="col-span-2 text-right">Qty</div>
                      </div>
                      <ul className="max-h-72 overflow-auto divide-y divide-white/5">
                        {allocs.map((a) => (
                          <li key={a.id} className="grid grid-cols-12 items-center px-3 py-2 text-sm">
                            <div className="col-span-7 truncate text-neutral-100">
                              {a.parts?.name ?? "Part"}
                            </div>
                            <div className="col-span-3 truncate text-neutral-400">
                              {a.work_order_line_id ? String(a.work_order_line_id).slice(0, 8) + "…" : "—"}
                            </div>
                            <div className="col-span-2 text-right font-semibold text-neutral-100">{a.qty}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
