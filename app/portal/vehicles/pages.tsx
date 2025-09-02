// app/portal/vehicles/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

/** Minimal shapes (keep lint happy, no `any`, no big supabase types) */
type VehicleRow = {
  id: string;
  customer_id: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  license_plate: string | null;
  mileage: string | null;
  color: string | null;
  created_at?: string | null;
};

type CustomerRow = {
  id: string;
  user_id: string;
  first_name?: string | null;
  last_name?: string | null;
};

type VehicleForm = {
  year: string; // keep as string in UI
  make: string;
  model: string;
  vin: string;
  license_plate: string;
  mileage: string;
  color: string;
};

export default function PortalVehiclesPage() {
  const supabase = createClientComponentClient();

  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VehicleForm>({
    year: "",
    make: "",
    model: "",
    vin: "",
    license_plate: "",
    mileage: "",
    color: "",
  });

  const isEdit = useMemo(() => Boolean(editingId), [editingId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr || !user) {
        setError("You must be signed in.");
        setLoading(false);
        return;
      }

      // Load customer by user_id
      const { data: cust, error: custErr } = await supabase
        .from("customers")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (custErr) setError(custErr.message);
      if (cust) {
        const typed = cust as unknown as CustomerRow;
        setCustomer(typed);

        // Load vehicles for this customer
        const { data: v, error: vehErr } = await supabase
          .from("vehicles")
          .select("*")
          .eq("customer_id", typed.id)
          .order("created_at", { ascending: false });

        if (vehErr) setError(vehErr.message);
        setVehicles((v as unknown as VehicleRow[]) ?? []);
      } else {
        setCustomer(null);
        setVehicles([]);
      }

      setLoading(false);
    })();
  }, [supabase]);

  const resetForm = () => {
    setEditingId(null);
    setForm({
      year: "",
      make: "",
      model: "",
      vin: "",
      license_plate: "",
      mileage: "",
      color: "",
    });
  };

  const startEdit = (v: VehicleRow) => {
    setEditingId(v.id);
    setForm({
      year: v.year != null ? String(v.year) : "",
      make: v.make ?? "",
      model: v.model ?? "",
      vin: v.vin ?? "",
      license_plate: v.license_plate ?? "",
      mileage: v.mileage ?? "",
      color: v.color ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // helpers: convert UI strings -> DB values
  const toNull = (s: string): string | null => (s.trim() === "" ? null : s.trim());
  const toYear = (s: string): number | null => {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  const onSave = async () => {
    if (!customer?.id) {
      setError("Create your profile first.");
      return;
    }
    setSaving(true);
    setError(null);

    if (!form.make.trim() || !form.model.trim()) {
      setError("Make and model are required.");
      setSaving(false);
      return;
    }

    const payload = {
      customer_id: customer.id,
      year: toYear(form.year),
      make: form.make.trim(),
      model: form.model.trim(),
      vin: toNull(form.vin),
      license_plate: toNull(form.license_plate),
      mileage: toNull(form.mileage),
      color: toNull(form.color),
    };

    if (isEdit && editingId) {
      const { data: updated, error: upErr } = await supabase
        .from("vehicles")
        .update(payload)
        .eq("id", editingId)
        .select()
        .maybeSingle();

      if (upErr) setError(upErr.message);
      if (updated) {
        const u = updated as unknown as VehicleRow;
        setVehicles((prev) => prev.map((x) => (x.id === u.id ? u : x)));
        resetForm();
      }
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("vehicles")
        .insert(payload)
        .select()
        .maybeSingle();

      if (insErr) setError(insErr.message);
      if (inserted) {
        const i = inserted as unknown as VehicleRow;
        setVehicles((prev) => [i, ...prev]);
        resetForm();
      }
    }

    setSaving(false);
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this vehicle?")) return;
    const { error: delErr } = await supabase.from("vehicles").delete().eq("id", id);
    if (delErr) {
      setError(delErr.message);
    } else {
      setVehicles((prev) => prev.filter((v) => v.id !== id));
      if (editingId === id) resetForm();
    }
  };

  if (loading) return <div className="text-white">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">My Vehicles</h1>

      {error && (
        <div className="rounded border border-red-600 bg-red-950/40 text-red-200 px-3 py-2">
          {error}
        </div>
      )}

      {/* Add / Edit form */}
      <div className="rounded border border-neutral-700 p-4 bg-neutral-900 space-y-3">
        <h2 className="font-medium mb-1">{isEdit ? "Edit Vehicle" : "Add Vehicle"}</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            className="input"
            placeholder="Year"
            value={form.year}
            onChange={(e) => setForm({ ...form, year: e.target.value })}
          />
          <input
            className="input"
            placeholder="Make *"
            value={form.make}
            onChange={(e) => setForm({ ...form, make: e.target.value })}
          />
          <input
            className="input"
            placeholder="Model *"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            className="input"
            placeholder="VIN"
            value={form.vin}
            onChange={(e) => setForm({ ...form, vin: e.target.value })}
          />
          <input
            className="input"
            placeholder="License Plate"
            value={form.license_plate}
            onChange={(e) => setForm({ ...form, license_plate: e.target.value })}
          />
          <input
            className="input"
            placeholder="Mileage"
            value={form.mileage}
            onChange={(e) => setForm({ ...form, mileage: e.target.value })}
          />
        </div>

        <input
          className="input"
          placeholder="Color"
          value={form.color}
          onChange={(e) => setForm({ ...form, color: e.target.value })}
        />

        <div className="flex gap-3">
          <button className="btn" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Vehicle"}
          </button>
          {isEdit && (
            <button className="btn-secondary" onClick={resetForm} disabled={saving}>
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {vehicles.length === 0 ? (
          <p className="text-sm text-gray-400">No vehicles yet.</p>
        ) : (
          vehicles.map((v) => (
            <div
              key={v.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-neutral-800 bg-neutral-900 rounded p-3"
            >
              <div>
                <div className="font-medium">
                  {[v.year ?? "", v.make ?? "", v.model ?? ""].filter(Boolean).join(" ")}
                </div>
                <div className="text-sm text-gray-400">
                  VIN {v.vin || "—"} • Plate {v.license_plate || "—"} • Mileage {v.mileage || "—"}
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => startEdit(v)}>
                  Edit
                </button>
                <button className="btn-danger" onClick={() => onDelete(v.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}