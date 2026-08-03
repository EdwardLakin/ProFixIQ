// app/portal/vehicles/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { checkVehicleDuplicates } from "@/features/shared/lib/vehicles/duplicateCheck";

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
  shop_id: string | null;
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
  return "rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-card backdrop-blur-xl";
}

function inputClass() {
  return "w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none placeholder:text-[color:var(--theme-text-muted)]";
}

function copperButtonStyle(): React.CSSProperties {
  return {
    borderColor: "rgba(197,122,74,0.45)",
    color: "rgba(255,255,255,0.92)",
    background: "rgba(197,122,74,0.10)",
    boxShadow: "inset 0 0 0 1px rgba(197,122,74,0.16)",
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
    background: "var(--theme-surface-inset)",
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
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteRequired, setInviteRequired] = useState(false);

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

      const normalizedEmail = (user.email ?? "").trim().toLowerCase();

      if (cust) {
        const { data: inviteRows, error: inviteErr } = await supabase
          .from("customer_portal_invites")
          .select(
            "id,customer_id,email,accepted_at,accepted_by_user_id,revoked_at",
          )
          .eq("customer_id", cust.id)
          .eq("accepted_by_user_id", user.id)
          .not("accepted_at", "is", null)
          .is("revoked_at", null)
          .limit(20);

        const hasInviteEvidence =
          !inviteErr &&
          Array.isArray(inviteRows) &&
          inviteRows.some((row) => {
            const inviteEmail = String(
              (row as { email?: string | null }).email ?? "",
            )
              .trim()
              .toLowerCase();
            return (
              normalizedEmail.length > 0 &&
              inviteEmail === normalizedEmail &&
              row.accepted_by_user_id === user.id &&
              Boolean(row.accepted_at) &&
              !row.revoked_at
            );
          });

        if (!hasInviteEvidence) {
          setInviteRequired(true);
          setCustomer(null);
          setVehicles([]);
          setLoading(false);
          return;
        }

        setInviteRequired(false);
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

  const toNull = (s: string): string | null =>
    s.trim() === "" ? null : s.trim();

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

    if (!customer.shop_id) {
      setError("Contact shop/admin to move vehicle.");
      setSaving(false);
      return;
    }

    const duplicateCheck = await checkVehicleDuplicates({
      vin: form.vin,
      licensePlate: form.license_plate,
      customerId: customer.id,
      vehicleId: editingId,
    });

    const differentCustomerVin = duplicateCheck.matches.find(
      (match) => match.match_type === "vin" && match.same_customer === false,
    );
    if (differentCustomerVin) {
      setError(
        "This VIN is already assigned to another customer. Contact shop/admin to move vehicle.",
      );
      setSaving(false);
      return;
    }

    const sameCustomerMatch = duplicateCheck.matches.find(
      (match) => match.same_customer === true,
    );
    if (sameCustomerMatch) {
      setError(
        "Vehicle already exists. Use existing vehicle or contact shop to update it.",
      );
      setSaving(false);
      return;
    }

    const payload = {
      customer_id: customer.id,
      shop_id: customer.shop_id,
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
    if (
      typeof window !== "undefined" &&
      !window.confirm("Delete this vehicle?")
    )
      return;

    const { error: delErr } = await supabase
      .from("vehicles")
      .delete()
      .eq("id", id);

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
        <div
          className={
            cardClass() + " text-sm text-[color:var(--theme-text-primary)]"
          }
        >
          Loading your vehicles…
        </div>
      </div>
    );
  }

  if (inviteRequired) {
    return (
      <div className="mx-auto max-w-3xl">
        <div
          className={
            cardClass() + " text-sm text-[color:var(--theme-text-primary)]"
          }
        >
          <div className="font-semibold">Portal invite required</div>
          <div className="mt-1">
            Open the invite link sent by the shop, or ask the shop to resend
            your portal invite.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 text-[color:var(--theme-text-primary)]">
      <header className="space-y-1">
        <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-[var(--accent-copper-light)]">
          My vehicles
        </h1>
        <p className="text-xs text-[color:var(--theme-text-secondary)]">
          Save your vehicles so booking and service history stays organized.
        </p>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-500/35 bg-red-900/20 px-3 py-2 text-sm text-red-100 shadow-card backdrop-blur-xl">
          {error}
        </div>
      )}

      <section className={cardClass() + " space-y-4 sm:p-6"}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
            {isEdit ? "Edit vehicle" : "Add vehicle"}
          </h2>
          {isEdit && (
            <span className="text-xs text-[color:var(--theme-text-muted)]">
              Editing{" "}
              <span className="font-mono">{editingId?.slice(0, 8)}…</span>
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
            onChange={(e) =>
              setForm({ ...form, license_plate: e.target.value })
            }
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
            onMouseEnter={(e) =>
              Object.assign(e.currentTarget.style, copperButtonHoverStyle())
            }
            onMouseLeave={(e) =>
              Object.assign(e.currentTarget.style, copperButtonStyle())
            }
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add vehicle"}
          </button>

          {isEdit && (
            <button
              onClick={resetForm}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold transition hover:bg-[color:var(--theme-surface-subtle)] disabled:opacity-60"
              style={neutralButtonStyle()}
            >
              Cancel
            </button>
          )}
        </div>

        <p className="text-xs text-[color:var(--theme-text-muted)]">
          Fields marked with * are required.
        </p>
      </section>

      <section className="space-y-3">
        {vehicles.length === 0 ? (
          <div
            className={
              cardClass() +
              " border-dashed text-sm text-[color:var(--theme-text-secondary)]"
            }
          >
            No vehicles yet. Add your first vehicle above so you can book
            appointments faster and see service history.
          </div>
        ) : (
          vehicles.map((v) => {
            const title =
              [v.year ?? "", v.make ?? "", v.model ?? ""]
                .filter(Boolean)
                .join(" ")
                .trim() || "Vehicle";

            if (inviteRequired) {
              return (
                <div key={v.id} className="mx-auto max-w-3xl">
                  <div
                    className={
                      cardClass() +
                      " text-sm text-[color:var(--theme-text-primary)]"
                    }
                  >
                    <div className="font-semibold">Portal invite required</div>
                    <div className="mt-1">
                      Open the invite link sent by the shop, or ask the shop to
                      resend your portal invite.
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={v.id}
                className="flex flex-col justify-between gap-3 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 backdrop-blur-md shadow-card sm:flex-row sm:items-center"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                    {title}
                  </div>
                  <div className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
                    VIN <span className="font-mono">{v.vin || "—"}</span> •
                    Plate{" "}
                    <span className="font-mono">{v.license_plate || "—"}</span>{" "}
                    • Mileage{" "}
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
                    className="inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold transition hover:bg-[color:var(--theme-surface-subtle)]"
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

      <p className="text-[0.75rem] text-[color:var(--theme-text-muted)]">
        Tip: keep VIN and plate saved so your shop can match records faster.
      </p>
    </div>
  );
}
