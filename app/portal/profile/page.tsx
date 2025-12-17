// app/portal/profile/page.tsx (or wherever your PortalProfilePage lives)
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];

type CustomerForm = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string; // auth-owned (read-only)
  street: string;
  city: string;
  province: string;
  postal_code: string;
};

const emptyForm: CustomerForm = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  street: "",
  city: "",
  province: "",
  postal_code: "",
};

function cardClass() {
  return "rounded-3xl border border-white/10 bg-black/30 p-4 backdrop-blur-md shadow-card";
}

function inputClass() {
  return "w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-white/20 focus:ring-1 focus:ring-white/10";
}

function readOnlyClass() {
  return "w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-neutral-300 outline-none placeholder:text-neutral-600";
}

function subtleButtonClass() {
  return "inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:opacity-60 active:scale-[0.99]";
}

export default function PortalProfilePage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setSaved(false);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (userErr) {
        setError(userErr.message);
        setLoading(false);
        return;
      }
      if (!user) {
        setError("You must be signed in.");
        setLoading(false);
        return;
      }

      const authEmail = user.email ?? "";

      const { data: customer, error: fetchErr } = await supabase
        .from("customers")
        .select("first_name,last_name,phone,street,city,province,postal_code")
        .eq("user_id", user.id)
        .maybeSingle<CustomerRow>();

      if (cancelled) return;

      if (fetchErr) {
        setError(fetchErr.message);
        setLoading(false);
        return;
      }

      setForm({
        first_name: (customer?.first_name as string | null) ?? "",
        last_name: (customer?.last_name as string | null) ?? "",
        phone: (customer?.phone as string | null) ?? "",
        email: authEmail,
        street: (customer?.street as string | null) ?? "",
        city: (customer?.city as string | null) ?? "",
        province: (customer?.province as string | null) ?? "",
        postal_code: (customer?.postal_code as string | null) ?? "",
      });

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const onSave = async () => {
    if (saving) return;

    setSaving(true);
    setError(null);
    setSaved(false);

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      setError(userErr?.message || "You must be signed in.");
      setSaving(false);
      return;
    }

    const toNull = (s: string) => (s.trim() === "" ? null : s.trim());

    const { error: upsertErr } = await supabase
      .from("customers")
      .upsert(
        {
          user_id: user.id,
          first_name: toNull(form.first_name),
          last_name: toNull(form.last_name),
          phone: toNull(form.phone),
          street: toNull(form.street),
          city: toNull(form.city),
          province: toNull(form.province),
          postal_code: toNull(form.postal_code),
        },
        { onConflict: "user_id" },
      );

    if (upsertErr) setError(upsertErr.message);
    else setSaved(true);

    setSaving(false);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-xl">
        <div className={cardClass() + " text-sm text-neutral-200"}>
          Loading your profile…
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-5 text-white">
      <header className="space-y-1">
        <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-200">
          My profile
        </h1>
        <p className="text-xs text-neutral-400">
          Keep your contact details up to date so your shop can reach you easily.
        </p>

        <div
          className="mt-3 h-px w-full"
          style={{
            background:
              "linear-gradient(90deg, rgba(197,122,74,0.0), rgba(197,122,74,0.35), rgba(197,122,74,0.0))",
          }}
        />
      </header>

      <div className={cardClass() + " space-y-4 sm:p-6"}>
        {error ? (
          <div className="rounded-2xl border border-red-500/35 bg-red-900/20 px-3 py-2 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {saved ? (
          <div className="rounded-2xl border border-emerald-500/35 bg-emerald-900/15 px-3 py-2 text-sm text-emerald-100">
            Saved!
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            className={inputClass()}
            placeholder="First name"
            value={form.first_name}
            onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))}
          />
          <input
            className={inputClass()}
            placeholder="Last name"
            value={form.last_name}
            onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            className={inputClass()}
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
          />

          <div className="space-y-1">
            <input readOnly className={readOnlyClass()} placeholder="Email" value={form.email} />
            <p className="text-[11px] text-neutral-500">Email is tied to your sign-in.</p>
          </div>
        </div>

        <div className="space-y-3">
          <input
            className={inputClass()}
            placeholder="Street address"
            value={form.street}
            onChange={(e) => setForm((p) => ({ ...p, street: e.target.value }))}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              className={inputClass()}
              placeholder="City"
              value={form.city}
              onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
            />
            <input
              className={inputClass()}
              placeholder="Province/State"
              value={form.province}
              onChange={(e) => setForm((p) => ({ ...p, province: e.target.value }))}
            />
            <input
              className={inputClass()}
              placeholder="Postal/ZIP code"
              value={form.postal_code}
              onChange={(e) => setForm((p) => ({ ...p, postal_code: e.target.value }))}
            />
          </div>
        </div>

        <button
          className={subtleButtonClass() + " mt-1"}
          style={{
            borderColor: "rgba(197,122,74,0.55)",
            color: "rgba(245,225,205,0.95)",
            background: "rgba(197,122,74,0.10)",
          }}
          onClick={onSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}