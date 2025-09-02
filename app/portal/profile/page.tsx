// app/portal/profile/page.tsx
"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];

// Local form shape = all strings so inputs are happy
type CustomerForm = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
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
  const supabase = createClientComponentClient<Database>();

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

      if (userErr) {
        if (!cancelled) setError(userErr.message);
        setLoading(false);
        return;
      }
      if (!user) {
        if (!cancelled) setError("You must be signed in.");
        setLoading(false);
        return;
      }

      const { data: customer, error: fetchErr } = await supabase
        .from("customers")
        .select(
          "first_name,last_name,phone,email,street,city,province,postal_code"
        )
        .eq("user_id", user.id)
        // 👇 Tell TS exactly which row type this is (your schema)
        .maybeSingle<CustomerRow>();

      if (fetchErr) {
        if (!cancelled) setError(fetchErr.message);
        setLoading(false);
        return;
      }

      if (!cancelled) {
        setForm({
          first_name: customer?.first_name ?? "",
          last_name: customer?.last_name ?? "",
          phone: customer?.phone ?? "",
          email: customer?.email ?? "",
          street: customer?.street ?? "",
          city: customer?.city ?? "",
          province: customer?.province ?? "",
          postal_code: customer?.postal_code ?? "",
        });
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const onSave = async () => {
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

    const { error: updateErr } = await supabase
      .from("customers")
      .update({
        first_name: toNull(form.first_name),
        last_name: toNull(form.last_name),
        phone: toNull(form.phone),
        email: toNull(form.email),
        street: toNull(form.street),
        city: toNull(form.city),
        province: toNull(form.province),
        postal_code: toNull(form.postal_code),
      })
      .eq("user_id", user.id);

    if (updateErr) {
      setError(updateErr.message);
    } else {
      setSaved(true);
    }
    setSaving(false);
  };

  if (loading) return <div>Loading…</div>;

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="mb-2 text-2xl font-semibold">My Profile</h1>

      {error ? (
        <div className="rounded border border-red-700 bg-red-900/40 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : null}
      {saved ? (
        <div className="rounded border border-emerald-700 bg-emerald-900/30 px-3 py-2 text-sm text-emerald-200">
          Saved!
        </div>
      ) : null}

      {/* Contact */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          className="input"
          placeholder="First name"
          value={form.first_name}
          onChange={(e) => setForm({ ...form, first_name: e.target.value })}
        />
        <input
          className="input"
          placeholder="Last name"
          value={form.last_name}
          onChange={(e) => setForm({ ...form, last_name: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          className="input"
          placeholder="Phone"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <input
          className="input"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </div>

      {/* Address */}
      <div className="space-y-3">
        <input
          className="input"
          placeholder="Street address"
          value={form.street}
          onChange={(e) => setForm({ ...form, street: e.target.value })}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            className="input"
            placeholder="City"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
          <input
            className="input"
            placeholder="Province/State"
            value={form.province}
            onChange={(e) => setForm({ ...form, province: e.target.value })}
          />
          <input
            className="input"
            placeholder="Postal/ZIP code"
            value={form.postal_code}
            onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
          />
        </div>
      </div>

      <button className="btn" onClick={onSave} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}