"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database, Tables } from "@shared/types/types/supabase";

type Props = { woId: string | null };

type WO = Pick<
  Tables<"work_orders">,
  | "id" | "status" | "type" | "created_at" | "updated_at" | "notes"
  | "customer_id" | "vehicle_id"
  | "invoice_total" | "labor_total" | "parts_total"
  | "quote_url" | "invoice_url"
>;

type Customer = Pick<Tables<"customers">, "name" | "email" | "phone" | "first_name" | "last_name">;
type Vehicle  = Pick<Tables<"vehicles">, "year" | "make" | "model" | "license_plate" | "vin" | "color" | "mileage" | "unit_number">;

type WOLine = Pick<
  Tables<"work_order_lines">,
  | "id" | "description" | "job_type" | "labor_time" | "notes"
  | "complaint" | "cause" | "correction" | "status"
  | "created_at" | "updated_at"
>;

export function WorkOrderPreview({ woId }: Props) {
  const supabase = createClientComponentClient<Database>();
  const [wo, setWO] = useState<WO | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [lines, setLines] = useState<WOLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!woId) {
        setWO(null);
        setCustomer(null);
        setVehicle(null);
        setLines([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const { data: woData, error: woErr } = await supabase
          .from("work_orders")
          .select("id,status,type,created_at,updated_at,notes,customer_id,vehicle_id,invoice_total,labor_total,parts_total,quote_url,invoice_url")
          .eq("id", woId)
          .single<WO>();
        if (woErr || !woData) throw new Error(woErr?.message || "Work order not found");
        if (!active) return;
        setWO(woData);

        if (woData.customer_id) {
          const { data: c } = await supabase
            .from("customers")
            .select("name,email,phone,first_name,last_name")
            .eq("id", woData.customer_id)
            .single<Customer>();
          if (!active) return;
          setCustomer(c ?? null);
        } else {
          setCustomer(null);
        }

        if (woData.vehicle_id) {
          const { data: v } = await supabase
            .from("vehicles")
            .select("year,make,model,license_plate,vin,color,mileage,unit_number")
            .eq("id", woData.vehicle_id)
            .single<Vehicle>();
          if (!active) return;
          setVehicle(v ?? null);
        } else {
          setVehicle(null);
        }

        const { data: linesRaw } = await supabase
          .from("work_order_lines")
          .select("id,description,job_type,labor_time,notes,complaint,cause,correction,status,created_at,updated_at")
          .eq("work_order_id", woId)
          .order("created_at", { ascending: true })
          .returns<WOLine[]>();

        if (!active) return;
        setLines(linesRaw ?? []);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [supabase, woId]);

  if (!woId) {
    return <div className="text-neutral-400 text-sm">No work order id provided yet.</div>;
  }

  if (loading) {
    return (
      <div className="rounded-lg border bg-neutral-950 p-5 text-neutral-300" style={{ borderColor: "#f97316" }}>
        Loading work order…
      </div>
    );
  }

  if (error || !wo) {
    return (
      <div className="text-red-400 text-sm">
        Failed to load work order{error ? `: ${error}` : ""}.
      </div>
    );
  }

  const customerName =
    customer?.name ??
    ([customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || "—");

  const vehicleLabel = [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ");
  const plateOrVin = vehicle?.license_plate ?? vehicle?.vin ?? "—";

  return (
    <div className="rounded-lg border bg-neutral-950 p-5 shadow-xl" style={{ borderColor: "#f97316" }}>
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-xl text-orange-400" style={{ fontFamily: "'Black Ops One', system-ui, sans-serif" }}>
          Work Order #{String(wo.id).slice(0, 8)}
        </h3>
        <span className="text-[11px] px-2 py-1 rounded bg-neutral-900 text-neutral-300 border border-neutral-800">
          {wo.status ?? "unknown"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm" style={{ fontFamily: "'Roboto', system-ui, sans-serif" }}>
        <section className="space-y-1">
          <div className="text-neutral-400">Customer</div>
          <div className="text-neutral-100">{customerName}</div>
          <div className="text-neutral-300">{customer?.email || "—"}</div>
          <div className="text-neutral-300">{customer?.phone || "—"}</div>
        </section>

        <section className="space-y-1">
          <div className="text-neutral-400">Vehicle</div>
          <div className="text-neutral-100">{vehicleLabel || "—"}</div>
          <div className="text-neutral-300">Plate/VIN: {plateOrVin}</div>
          <div className="text-neutral-300">
            Color: {vehicle?.color || "—"} · Mileage: {vehicle?.mileage ?? "—"} · Unit: {vehicle?.unit_number || "—"}
          </div>
        </section>
      </div>

      <div className="mt-5 border-t border-neutral-800 pt-4">
        <div className="text-sm text-neutral-400 mb-2" style={{ fontFamily: "'Roboto', system-ui, sans-serif" }}>
          Lines
        </div>
        {lines.length === 0 ? (
          <div className="text-neutral-500 text-sm">No lines yet.</div>
        ) : (
          <ul className="space-y-3">
            {lines.map((l) => (
              <li key={l.id} className="rounded border border-neutral-800 bg-neutral-900 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-neutral-100">{l.description || "(no description)"}</div>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-neutral-950 text-neutral-300 border border-neutral-800">
                    {l.job_type || "—"}
                  </span>
                </div>
                <div className="mt-1 text-xs text-neutral-400">
                  Labor time: {l.labor_time ?? 0} · Status: {l.status || "—"}
                </div>
                {(l.complaint || l.cause || l.correction) && (
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                    <div className="bg-neutral-950/60 rounded p-2 border border-neutral-800">
                      <div className="text-neutral-400 mb-1">Complaint</div>
                      <div className="text-neutral-200">{l.complaint || "—"}</div>
                    </div>
                    <div className="bg-neutral-950/60 rounded p-2 border border-neutral-800">
                      <div className="text-neutral-400 mb-1">Cause</div>
                      <div className="text-neutral-200">{l.cause || "—"}</div>
                    </div>
                    <div className="bg-neutral-950/60 rounded p-2 border border-neutral-800">
                      <div className="text-neutral-400 mb-1">Correction</div>
                      <div className="text-neutral-200">{l.correction || "—"}</div>
                    </div>
                  </div>
                )}
                {l.notes && <div className="mt-2 text-xs text-neutral-300">Notes: {l.notes}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-5 border-t border-neutral-800 pt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3">
          <div className="text-neutral-400">Parts Total</div>
          <div className="text-neutral-100">${(wo.parts_total ?? 0).toFixed(2)}</div>
        </div>
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3">
          <div className="text-neutral-400">Labor Total</div>
          <div className="text-neutral-100">${(wo.labor_total ?? 0).toFixed(2)}</div>
        </div>
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3">
          <div className="text-neutral-400">Invoice Total</div>
          <div className="text-neutral-100">${(wo.invoice_total ?? 0).toFixed(2)}</div>
        </div>
      </div>

      {(wo.quote_url || wo.invoice_url) && (
        <div className="mt-4 flex gap-2">
          {wo.quote_url && (
            <a href={wo.quote_url} target="_blank" rel="noreferrer" className="text-xs underline text-orange-400 hover:text-orange-300">
              Open Quote
            </a>
          )}
          {wo.invoice_url && (
            <a href={wo.invoice_url} target="_blank" rel="noreferrer" className="text-xs underline text-orange-400 hover:text-orange-300">
              Open Invoice
            </a>
          )}
        </div>
      )}

      {wo.notes && (
        <div className="mt-4 text-sm text-neutral-200">
          <div className="text-neutral-400 mb-1">Notes</div>
          <p className="whitespace-pre-wrap">{wo.notes}</p>
        </div>
      )}
    </div>
  );
}