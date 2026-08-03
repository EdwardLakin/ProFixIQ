// app/portal/profile/page.tsx (or wherever your PortalProfilePage lives)
"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
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
  return "rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-card backdrop-blur-xl";
}

function inputClass() {
  return "w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none placeholder:text-[color:var(--theme-text-muted)]";
}

function readOnlyClass() {
  return "w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-secondary)] outline-none placeholder:text-[color:var(--theme-text-muted)]";
}

function subtleButtonClass() {
  return "inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:opacity-60 active:scale-[0.99]";
}

export default function PortalProfilePage() {
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteRequired, setInviteRequired] = useState(false);
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

      const normalizedEmail = authEmail.trim().toLowerCase();

      const { data: customer, error: fetchErr } = await supabase
        .from("customers")
        .select(
          "id,shop_id,first_name,last_name,phone,street,city,province,postal_code",
        )
        .eq("user_id", user.id)
        .maybeSingle<CustomerRow>();

      if (cancelled) return;

      if (fetchErr) {
        setError(fetchErr.message);
        setLoading(false);
        return;
      }

      const customerId = customer?.id;
      if (!customerId) {
        setInviteRequired(true);
        setLoading(false);
        return;
      }

      const { data: inviteRows, error: inviteErr } = await supabase
        .from("customer_portal_invites")
        .select(
          "id,customer_id,email,accepted_at,accepted_by_user_id,revoked_at",
        )
        .eq("customer_id", customerId)
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
        setLoading(false);
        return;
      }

      setInviteRequired(false);

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

    if (inviteRequired) {
      setSaving(false);
      return;
    }

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

    const { error: upsertErr } = await supabase.from("customers").upsert(
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
        <div
          className={
            cardClass() + " text-sm text-[color:var(--theme-text-primary)]"
          }
        >
          Loading your profile…
        </div>
      </div>
    );
  }

  if (inviteRequired) {
    return (
      <div className="mx-auto max-w-xl">
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
    <div className="mx-auto max-w-xl space-y-5 text-[color:var(--theme-text-primary)]">
      <header className="space-y-1">
        <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-[var(--accent-copper-light)]">
          My profile
        </h1>
        <p className="text-xs text-[color:var(--theme-text-secondary)]">
          Keep your contact details up to date so your shop can reach you
          easily.
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
            onChange={(e) =>
              setForm((p) => ({ ...p, first_name: e.target.value }))
            }
          />
          <input
            className={inputClass()}
            placeholder="Last name"
            value={form.last_name}
            onChange={(e) =>
              setForm((p) => ({ ...p, last_name: e.target.value }))
            }
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
            <input
              readOnly
              className={readOnlyClass()}
              placeholder="Email"
              value={form.email}
            />
            <p className="text-[11px] text-[color:var(--theme-text-muted)]">
              Email is tied to your sign-in.
            </p>
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
              onChange={(e) =>
                setForm((p) => ({ ...p, province: e.target.value }))
              }
            />
            <input
              className={inputClass()}
              placeholder="Postal/ZIP code"
              value={form.postal_code}
              onChange={(e) =>
                setForm((p) => ({ ...p, postal_code: e.target.value }))
              }
            />
          </div>
        </div>

        <button
          className={
            subtleButtonClass() +
            " mt-1 border-[rgba(197,122,74,0.45)] bg-[rgba(197,122,74,0.10)] text-[color:var(--theme-text-primary)] hover:bg-[rgba(197,122,74,0.16)]"
          }
          onClick={onSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
