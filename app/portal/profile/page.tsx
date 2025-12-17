"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];

// Local form shape = all strings so inputs are happy
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

export default function PortalProfilePage() {
  // ✅ memoize to avoid recreating the client and re-running effects
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

      // ✅ do NOT fetch customers.email anymore (auth owns email)
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

    // convert "" → null for nullable DB columns
    const toNull = (s: string) => (s.trim() === "" ? null : s.trim());

    // ✅ upsert ensures row exists, and with unique(user_id) prevents duplicates
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
          // ❌ do NOT write email here (avoids shop_email unique issues)
        },
        { onConflict: "user_id" },
      );

    if (upsertErr) {
      setError(upsertErr.message);
    } else {
      setSaved(true);
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-neutral-200 backdrop-blur-md shadow-card">
        Loading your profile…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-5 text-white">
      <header className="space-y-1">
        <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-300">
          My profile
        </h1>
        <p className="text-xs text-neutral-400">
          Keep your contact details up to date so your shop can reach you easily.
        </p>
      </header>

      <div className="space-y-4 rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-md shadow-card sm:p-6">
        {error ? (
          <div className="rounded-xl border border-red-500/35 bg-red-900/20 px-3 py-2 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {saved ? (
          <div className="rounded-xl border border-emerald-500/35 bg-emerald-900/15 px-3 py-2 text-sm text-emerald-100">
            Saved!
          </div>
        ) : null}

        {/* Contact */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            placeholder="First name"
            value={form.first_name}
            onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))}
          />
          <input
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            placeholder="Last name"
            value={form.last_name}
            onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
          />

          <div className="space-y-1">
            <input
              readOnly
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-neutral-300 outline-none placeholder:text-neutral-600"
              placeholder="Email"
              value={form.email}
            />
            <p className="text-[11px] text-neutral-500">
              Email is tied to your sign-in.
            </p>
          </div>
        </div>

        {/* Address */}
        <div className="space-y-3">
          <input
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            placeholder="Street address"
            value={form.street}
            onChange={(e) => setForm((p) => ({ ...p, street: e.target.value }))}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              placeholder="City"
              value={form.city}
              onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
            />
            <input
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              placeholder="Province/State"
              value={form.province}
              onChange={(e) => setForm((p) => ({ ...p, province: e.target.value }))}
            />
            <input
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              placeholder="Postal/ZIP code"
              value={form.postal_code}
              onChange={(e) => setForm((p) => ({ ...p, postal_code: e.target.value }))}
            />
          </div>
        </div>

        <button
          className="mt-2 inline-flex items-center justify-center rounded-lg border border-orange-600 px-4 py-2 text-sm font-semibold text-orange-300 transition hover:bg-orange-600 hover:text-black disabled:opacity-60"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}