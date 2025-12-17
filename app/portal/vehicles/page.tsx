// app/portal/vehicles/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

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


function cardClass() {
  return "rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-md shadow-card";
}

function inputClass() {
  return "w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-white/20 focus:ring-1 focus:ring-white/10";
}

function copperButtonStyle(): React.CSSProperties {
  return {
    borderColor: "rgba(197,122,74,0.55)",
    color: "rgba(255,255,255,0.92)",
    background: "rgba(197,122,74,0.10)",
    boxShadow: "inset 0 0 0 1px rgba(197,122,74,0.20)",
  };
}

function copperButtonHoverStyle(): React.CSSProperties {
  return {
    background: "rgba(197,122,74,0.18)",
  };
}

function neutralButtonStyle(): React.CSSProperties {
  return {
    borderColor: "rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.35)",
    color: "rgba(255,255,255,0.85)",
  };
}

function dangerButtonStyle(): React.CSSProperties {
  return {
    borderColor: "rgba(248,113,113,0.55)",
    background: "rgba(127,29,29,0.20)",
    color: "rgba(254,226,226,0.92)",
  };
}

export default function PortalVehiclesPage() {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);

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
    let mounted = true;

    (async () => {
      setLoading(true);
      setError(null);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (userErr || !user) {
        setError("You must be signed in.");
        setLoading(false);
        return;
      }

      const { data: cust, error: custErr } = await supabase
        .from("customers")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (custErr) setError(custErr.message);

      if (cust) {
        const typed = cust as unknown as CustomerRow;
        setCustomer(typed);

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

    return () => {
      mounted = false;
    };
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
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const toNull = (s: string): string | null => (s.trim() === "" ? null : s.trim());

  const toYear = (s: string): number | null => {
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    const i = Math.trunc(n);
    return i > 0 ? i : null;
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
    if (typeof window !== "undefined" && !window.confirm("Delete this vehicle?")) return;

    const { error: delErr } = await supabase.from("vehicles").delete().eq("id", id);

    if (delErr) {
      setError(delErr.message);
    } else {
      setVehicles((prev) => prev.filter((v) => v.id !== id));
      if (editingId === id) resetForm();
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className={cardClass() + " text-sm text-neutral-200"}>
          Loading your vehicles…
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 text-white">
      <header className="space-y-1">
        <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-300">
          My vehicles
        </h1>
        <p className="text-xs text-neutral-400">
          Save your vehicles so booking and service history stays organized.
        </p>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-500/35 bg-red-900/20 px-3 py-2 text-sm text-red-100 backdrop-blur-md shadow-card">
          {error}
        </div>
      )}

      <section className={cardClass() + " space-y-4 sm:p-6"}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-50">
            {isEdit ? "Edit vehicle" : "Add vehicle"}
          </h2>
          {isEdit && (
            <span className="text-xs text-neutral-500">
              Editing <span className="font-mono">{editingId?.slice(0, 8)}…</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            className={inputClass()}
            placeholder="Year"
            value={form.year}
            onChange={(e) => setForm({ ...form, year: e.target.value })}
          />
          <input
            className={inputClass()}
            placeholder="Make *"
            value={form.make}
            onChange={(e) => setForm({ ...form, make: e.target.value })}
          />
          <input
            className={inputClass()}
            placeholder="Model *"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            className={inputClass()}
            placeholder="VIN"
            value={form.vin}
            onChange={(e) => setForm({ ...form, vin: e.target.value })}
          />
          <input
            className={inputClass()}
            placeholder="License plate"
            value={form.license_plate}
            onChange={(e) => setForm({ ...form, license_plate: e.target.value })}
          />
          <input
            className={inputClass()}
            placeholder="Mileage"
            value={form.mileage}
            onChange={(e) => setForm({ ...form, mileage: e.target.value })}
          />
        </div>

        <input
          className={inputClass()}
          placeholder="Color"
          value={form.color}
          onChange={(e) => setForm({ ...form, color: e.target.value })}
        />

        <div className="flex flex-wrap gap-3">
          <button
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold transition disabled:opacity-60"
            style={copperButtonStyle()}
            onMouseEnter={(e) => Object.assign(e.currentTarget.style, copperButtonHoverStyle())}
            onMouseLeave={(e) => Object.assign(e.currentTarget.style, copperButtonStyle())}
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add vehicle"}
          </button>

          {isEdit && (
            <button
              onClick={resetForm}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold transition hover:bg-white/5 disabled:opacity-60"
              style={neutralButtonStyle()}
            >
              Cancel
            </button>
          )}
        </div>

        <p className="text-xs text-neutral-500">Fields marked with * are required.</p>
      </section>

      <section className="space-y-3">
        {vehicles.length === 0 ? (
          <div className={cardClass() + " border-dashed text-sm text-neutral-400"}>
            No vehicles yet. Add your first vehicle above so you can book appointments faster and
            see service history.
          </div>
        ) : (
          vehicles.map((v) => {
            const title =
              [v.year ?? "", v.make ?? "", v.model ?? ""].filter(Boolean).join(" ").trim() ||
              "Vehicle";

            return (
              <div
                key={v.id}
                className="flex flex-col justify-between gap-3 rounded-2xl border border-white/10 bg-black/30 p-3 backdrop-blur-md shadow-card sm:flex-row sm:items-center"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-neutral-50">{title}</div>
                  <div className="mt-0.5 text-xs text-neutral-400">
                    VIN <span className="font-mono">{v.vin || "—"}</span> • Plate{" "}
                    <span className="font-mono">{v.license_plate || "—"}</span> • Mileage{" "}
                    <span className="font-mono">{v.mileage || "—"}</span>
                    {v.color && (
                      <>
                        {" "}
                        • Color <span className="font-mono">{v.color}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    className="inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold transition hover:bg-white/5"
                    style={neutralButtonStyle()}
                    onClick={() => startEdit(v)}
                  >
                    Edit
                  </button>
                  <button
                    className="inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold transition hover:bg-red-900/30"
                    style={dangerButtonStyle()}
                    onClick={() => onDelete(v.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>

      <p className="text-[0.75rem] text-neutral-500">
        Tip: keep VIN and plate saved so your shop can match records faster.
      </p>
    </div>
  );
}