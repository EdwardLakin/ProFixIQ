"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

// ✅ You said you have this component (works on strings)
import CustomerVehicleForm from "@/features/inspections/components/inspection/CustomerVehicleForm";

// Optional helpers you already use elsewhere
import { MenuQuickAdd } from "@work-orders/components/MenuQuickAdd";
import { NewWorkOrderLineForm } from "@work-orders/components/NewWorkOrderLineForm";

type DB = Database;
type WorkOrder   = DB["public"]["Tables"]["work_orders"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type VehicleRow  = DB["public"]["Tables"]["vehicles"]["Row"];
type LineRow     = DB["public"]["Tables"]["work_order_lines"]["Row"];

interface Props {
  woId: string;
}

/* Lightweight shapes to drive CustomerVehicleForm (it only needs these keys) */
type CustForm = {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
};

type VehForm = {
  year?: number | string | null;
  make?: string | null;
  model?: string | null;
  vin?: string | null;
  license_plate?: string | null;
  mileage?: number | string | null;
  color?: string | null;
};

export default function WorkOrderClient({ woId }: Props) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  // Core data
  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [, setCustomer] = useState<CustomerRow | null>(null);
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [lines, setLines] = useState<LineRow[]>([]);

  // Editable form state that matches CustomerVehicleForm’s props
  const [custForm, setCustForm] = useState<CustForm>({});
  const [vehForm, setVehForm] = useState<VehForm>({});

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  /* ------------------------------- Fetching ------------------------------- */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Work order
      const { data: w, error: wErr } = await supabase
        .from("work_orders")
        .select("*")
        .eq("id", woId)
        .maybeSingle();
      if (wErr) throw wErr;
      if (!w) throw new Error("Work order not found.");
      setWo(w);

      // Related records (nullable)
      const [cRes, vRes, lRes] = await Promise.all([
        w.customer_id
          ? supabase.from("customers").select("*").eq("id", w.customer_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        w.vehicle_id
          ? supabase.from("vehicles").select("*").eq("id", w.vehicle_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from("work_order_lines")
          .select("*")
          .eq("work_order_id", w.id)
          .order("created_at", { ascending: true }),
      ]);

      if (cRes.error) throw cRes.error;
      if (vRes.error) throw vRes.error;
      if (lRes.error) throw lRes.error;

      const c = (cRes.data as CustomerRow | null) ?? null;
      const v = (vRes.data as VehicleRow | null) ?? null;
      setCustomer(c);
      setVehicle(v);
      setLines((lRes.data ?? []) as LineRow[]);

      // Seed form state to drive CustomerVehicleForm
      setCustForm({
        first_name: c?.first_name ?? "",
        last_name: c?.last_name ?? "",
        phone: c?.phone ?? "",
        email: c?.email ?? "",
        address: c?.address ?? "",
        city: c?.city ?? "",
        province: c?.province ?? "",
        postal_code: c?.postal_code ?? "",
      });

      setVehForm({
        year: v?.year ?? "",
        make: v?.make ?? "",
        model: v?.model ?? "",
        vin: v?.vin ?? "",
        license_plate: v?.license_plate ?? "",
        mileage: v?.mileage ?? "",
        color: v?.color ?? "",
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to load work order.");
    } finally {
      setLoading(false);
    }
  }, [supabase, woId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  // Realtime refresh (lines + wo record)
  useEffect(() => {
    const ch = supabase
      .channel(`wo:${woId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_orders", filter: `id=eq.${woId}` },
        fetchAll
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_order_lines", filter: `work_order_id=eq.${woId}` },
        fetchAll
      )
      .subscribe();

    return () => {
      try { supabase.removeChannel(ch); } catch {}
    };
  }, [supabase, woId, fetchAll]);

  /* ---------------------------- Save handlers ----------------------------- */
  const onCustomerChange = (field: keyof CustForm, value: string) => {
    setCustForm((prev) => ({ ...prev, [field]: value }));
    setSaveMsg(null);
  };
  const onVehicleChange = (field: keyof VehForm, value: string) => {
    setVehForm((prev) => ({ ...prev, [field]: value }));
    setSaveMsg(null);
  };

  const saveCustomerVehicle = async () => {
    if (!wo) return;
    setSaving(true);
    setError(null);
    try {
      // Upsert customer if missing
      let custId = wo.customer_id;
      if (!custId) {
        const { data: inserted, error: insErr } = await supabase
          .from("customers")
          .insert({
            first_name: custForm.first_name || null,
            last_name: custForm.last_name || null,
            phone: custForm.phone || null,
            email: custForm.email || null,
            address: custForm.address || null,
            city: custForm.city || null,
            province: custForm.province || null,
            postal_code: custForm.postal_code || null,
            shop_id: wo.shop_id ?? null,
          })
          .select("*")
          .single();
        if (insErr) throw insErr;
        custId = inserted.id;
        await supabase.from("work_orders").update({ customer_id: custId }).eq("id", wo.id);
      } else {
        const { error: updCustErr } = await supabase
          .from("customers")
          .update({
            first_name: custForm.first_name || null,
            last_name: custForm.last_name || null,
            phone: custForm.phone || null,
            email: custForm.email || null,
            address: custForm.address || null,
            city: custForm.city || null,
            province: custForm.province || null,
            postal_code: custForm.postal_code || null,
          })
          .eq("id", custId);
        if (updCustErr) throw updCustErr;
      }

      // Upsert vehicle if missing
      let vehId = wo.vehicle_id;
      if (!vehId) {
        const { data: inserted, error: insErr } = await supabase
          .from("vehicles")
          .insert({
            customer_id: custId!,
            vin: (vehForm.vin || "") || null,
            year: vehForm.year ? Number(vehForm.year) : null,
            make: vehForm.make || null,
            model: vehForm.model || null,
            license_plate: vehForm.license_plate || null,
            mileage: vehForm.mileage ? String(vehForm.mileage) : null,
            color: vehForm.color || null,
            shop_id: wo.shop_id ?? null,
          })
          .select("*")
          .single();
        if (insErr) throw insErr;
        vehId = inserted.id;
        await supabase.from("work_orders").update({ vehicle_id: vehId }).eq("id", wo.id);
      } else {
        const { error: updVehErr } = await supabase
          .from("vehicles")
          .update({
            vin: (vehForm.vin || "") || null,
            year: vehForm.year ? Number(vehForm.year) : null,
            make: vehForm.make || null,
            model: vehForm.model || null,
            license_plate: vehForm.license_plate || null,
            mileage: vehForm.mileage ? String(vehForm.mileage) : null,
            color: vehForm.color || null,
          })
          .eq("id", vehId);
        if (updVehErr) throw updVehErr;
      }

      setSaveMsg("Saved ✔");
      await fetchAll();
    } catch (e: any) {
      setError(e?.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  /* ----------------------------- Line helpers ----------------------------- */
  const deleteLine = async (lineId: string) => {
    if (!confirm("Delete this line?")) return;
    const { error: delErr } = await supabase.from("work_order_lines").delete().eq("id", lineId);
    if (delErr) {
      setError(delErr.message || "Delete failed");
      return;
    }
    await fetchAll();
  };

  /* --------------------------------- UI ---------------------------------- */
  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-6 text-white">
        <div className="animate-pulse h-24 rounded bg-neutral-800/60" />
        <div className="mt-4 animate-pulse h-56 rounded bg-neutral-800/60" />
      </div>
    );
  }

  if (!wo) {
    return <div className="mx-auto max-w-3xl p-6 text-red-400">Work order not found.</div>;
  }

  return (
    <div className="mx-auto max-w-5xl p-6 text-white font-roboto">
      <h1 className="mb-2 text-2xl font-bold font-blackops">
        Work Order {wo.custom_id || `#${wo.id.slice(0, 8)}`}
      </h1>

      {error && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 p-3 text-red-300">
          {error}
        </div>
      )}

      {/* Customer + Vehicle (editable via your CustomerVehicleForm) */}
      <div className="rounded border border-neutral-800 bg-neutral-900 p-4 mb-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold font-blackops">Customer & Vehicle</h2>
          <div className="flex items-center gap-3">
            {saveMsg && <span className="text-sm text-green-300">{saveMsg}</span>}
            <button
              className="rounded bg-orange-500 px-3 py-1.5 text-black font-semibold hover:bg-orange-600 disabled:opacity-60"
              onClick={saveCustomerVehicle}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        <div className="mt-3">
          <CustomerVehicleForm
            customer={custForm as any}
            vehicle={vehForm as any}
            onCustomerChange={onCustomerChange as any}
            onVehicleChange={onVehicleChange as any}
          />
        </div>
      </div>

      {/* Quick add from menu (only once we have wo.id) */}
      <div className="rounded border border-neutral-800 bg-neutral-900 p-4 mb-6">
        <h2 className="mb-2 text-lg font-semibold text-orange-400 font-blackops">Quick add from menu</h2>
        <MenuQuickAdd workOrderId={wo.id} />
      </div>

      {/* Manual add line */}
      <div className="rounded border border-neutral-800 bg-neutral-900 p-4 mb-6">
        <h2 className="mb-2 text-lg font-semibold font-blackops">Add Job Line</h2>
        <NewWorkOrderLineForm
  workOrderId={wo.id}
  vehicleId={vehicle?.id ?? null}
  defaultJobType={null}          // ← add this line
  onCreated={fetchAll}
/>
      </div>

      {/* Current lines */}
      <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="mb-2 text-lg font-semibold font-blackops">Current Lines</h2>
        {lines.length === 0 ? (
          <p className="text-sm text-neutral-400">No lines yet.</p>
        ) : (
          <div className="space-y-2">
            {lines.map((ln) => (
              <div
                key={ln.id}
                className="flex items-start justify-between gap-3 rounded border border-neutral-800 bg-neutral-950 p-3"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {ln.description || ln.complaint || "Untitled job"}
                  </div>
                  <div className="text-xs text-neutral-400">
                    {String(ln.job_type ?? "job").replaceAll("_", " ")} •{" "}
                    {typeof ln.labor_time === "number" ? `${ln.labor_time}h` : "—"} •{" "}
                    {(ln.status ?? "awaiting").replaceAll("_", " ")}
                  </div>
                  {(ln.complaint || ln.cause || ln.correction) && (
                    <div className="text-xs text-neutral-400 mt-1">
                      {ln.complaint ? `Cmpl: ${ln.complaint}  ` : ""}
                      {ln.cause ? `| Cause: ${ln.cause}  ` : ""}
                      {ln.correction ? `| Corr: ${ln.correction}` : ""}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => deleteLine(ln.id)}
                  className="rounded border border-red-600 px-2 py-1 text-xs text-red-300 hover:bg-red-900/20"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}