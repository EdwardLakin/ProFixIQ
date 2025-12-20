// app/portal/settings/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Toaster, toast } from "sonner";

import type { Database } from "@shared/types/types/supabase";
import LinkButton from "@shared/components/ui/LinkButton";

type Customer = Database["public"]["Tables"]["customers"]["Row"];
type SettingsRow = Database["public"]["Tables"]["customer_settings"]["Row"];
type SettingsInsert = Database["public"]["Tables"]["customer_settings"]["Insert"];

const COPPER = "#C57A4A";

function cardClass() {
  return "rounded-3xl border border-white/10 bg-black/30 p-4 backdrop-blur-md shadow-card";
}

function inputWrapClass() {
  return "w-full rounded-xl border border-white/10 bg-black/35 p-2 text-sm text-white outline-none focus:border-white/20 focus:ring-1 focus:ring-white/10";
}

function copperButtonStyle(): React.CSSProperties {
  return {
    borderColor: "rgba(197,122,74,0.55)",
    color: "rgba(245,225,205,0.95)",
    background: "rgba(197,122,74,0.10)",
  };
}

export default function PortalSettingsPage() {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);

  const [form, setForm] = useState<SettingsRow>({
    customer_id: "",
    comm_email_enabled: true,
    comm_sms_enabled: false,
    marketing_opt_in: false,
    preferred_contact: "email",
    units: "imperial",
    language: "en",
    timezone: "UTC",
    updated_at: new Date().toISOString(),
  });

  const tzOptions = useMemo(
    () => [
      "UTC",
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Phoenix",
      "Europe/London",
      "Europe/Paris",
      "Asia/Tokyo",
      "Australia/Sydney",
    ],
    [],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (userErr || !user) {
        setError("You must be signed in to view settings.");
        setLoading(false);
        return;
      }

      const { data: cust, error: custErr } = await supabase
        .from("customers")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (cancelled) return;

      if (custErr || !cust) {
        setError(
          "We couldn't find your customer profile. Please complete your profile first.",
        );
        setLoading(false);
        return;
      }

      setCustomer(cust);

      const { data: existing, error: settingsErr } = await supabase
        .from("customer_settings")
        .select("*")
        .eq("customer_id", cust.id)
        .maybeSingle();

      if (cancelled) return;

      if (settingsErr) {
        setError(settingsErr.message);
        setLoading(false);
        return;
      }

      if (existing) {
        setForm(existing);
      } else {
        const defaults: SettingsInsert = {
          customer_id: cust.id,
          comm_email_enabled: true,
          comm_sms_enabled: false,
          marketing_opt_in: false,
          preferred_contact: "email",
          units: "imperial",
          language: "en",
          timezone: "UTC",
        };

        const { error: seedErr } = await supabase
          .from("customer_settings")
          .upsert(defaults, { onConflict: "customer_id" });

        if (seedErr) {
          setError(seedErr.message);
          setLoading(false);
          return;
        }

        setForm({
          ...(defaults as SettingsRow),
          updated_at: new Date().toISOString(),
        });
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const update = <K extends keyof SettingsRow>(key: K, value: SettingsRow[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const onSave = async () => {
    if (!customer) {
      toast.error("Customer profile not loaded yet.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: SettingsInsert = {
        customer_id: customer.id,
        comm_email_enabled: form.comm_email_enabled,
        comm_sms_enabled: form.comm_sms_enabled,
        marketing_opt_in: form.marketing_opt_in,
        preferred_contact: form.preferred_contact ?? "email",
        units: form.units ?? "imperial",
        language: form.language ?? "en",
        timezone: form.timezone ?? "UTC",
      };

      const { error: upsertErr } = await supabase
        .from("customer_settings")
        .upsert(payload, { onConflict: "customer_id" });

      if (upsertErr) {
        setError(upsertErr.message);
        toast.error(upsertErr.message || "Failed to save settings");
        return;
      }

      update("updated_at", new Date().toISOString() as SettingsRow["updated_at"]);
      toast.success("Settings saved");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to save settings";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl">
        <Toaster position="top-center" />
        <div className={cardClass() + " text-sm text-neutral-200"}>
          Loading your settings…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 text-white">
        <Toaster position="top-center" />
        <header className="space-y-1">
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-200">
            Settings
          </h1>
        </header>

        <div className="space-y-3 rounded-3xl border border-red-500/35 bg-red-900/20 p-4 text-sm backdrop-blur-md shadow-card">
          <p className="text-red-100">{error}</p>
          <LinkButton href="/portal" variant="outline" size="sm">
            Go to profile
          </LinkButton>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 text-white">
      <Toaster position="top-center" />

      <header className="space-y-1">
        <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-200">
          Settings
        </h1>
        <p className="text-xs text-neutral-400">
          Choose how we contact you and how information is displayed.
        </p>

        <div
          className="mt-3 h-px w-full"
          style={{
            background:
              "linear-gradient(90deg, rgba(197,122,74,0.0), rgba(197,122,74,0.35), rgba(197,122,74,0.0))",
          }}
        />
      </header>

      <section className={cardClass() + " space-y-3 sm:p-5"}>
        <h2 className="text-sm font-semibold text-neutral-50">Communication</h2>

        <label className="flex items-center gap-3 text-sm text-neutral-100">
          <input
            type="checkbox"
            className="h-4 w-4"
            style={{ accentColor: COPPER }}
            checked={!!form.comm_email_enabled}
            onChange={(e) => update("comm_email_enabled", e.target.checked)}
          />
          <span>Email notifications</span>
        </label>

        <label className="flex items-center gap-3 text-sm text-neutral-100">
          <input
            type="checkbox"
            className="h-4 w-4"
            style={{ accentColor: COPPER }}
            checked={!!form.comm_sms_enabled}
            onChange={(e) => update("comm_sms_enabled", e.target.checked)}
          />
          <span>SMS notifications</span>
        </label>

        <label className="flex items-center gap-3 text-sm text-neutral-100">
          <input
            type="checkbox"
            className="h-4 w-4"
            style={{ accentColor: COPPER }}
            checked={!!form.marketing_opt_in}
            onChange={(e) => update("marketing_opt_in", e.target.checked)}
          />
          <span>Receive service tips &amp; updates</span>
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-neutral-400">
              Preferred contact
            </label>
            <select
              className={inputWrapClass()}
              value={form.preferred_contact ?? "email"}
              onChange={(e) =>
                update(
                  "preferred_contact",
                  e.target.value as SettingsRow["preferred_contact"],
                )
              }
            >
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="phone">Phone</option>
            </select>
          </div>
        </div>
      </section>

      <section className={cardClass() + " space-y-3 sm:p-5"}>
        <h2 className="text-sm font-semibold text-neutral-50">Display</h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Units</label>
            <select
              className={inputWrapClass()}
              value={form.units ?? "imperial"}
              onChange={(e) => update("units", e.target.value as SettingsRow["units"])}
            >
              <option value="imperial">Imperial (mi, °F)</option>
              <option value="metric">Metric (km, °C)</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-neutral-400">
              Language
            </label>
            <select
              className={inputWrapClass()}
              value={form.language ?? "en"}
              onChange={(e) => update("language", e.target.value)}
            >
              <option value="en">English</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-neutral-400">
              Timezone
            </label>
            <select
              className={inputWrapClass()}
              value={form.timezone ?? "UTC"}
              onChange={(e) => update("timezone", e.target.value)}
            >
              {tzOptions.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:opacity-60 active:scale-[0.99]"
          style={copperButtonStyle()}
        >
          {saving ? "Saving…" : "Save settings"}
        </button>

        <span className="text-xs text-neutral-400">
          Last updated:{" "}
          {form.updated_at ? new Date(form.updated_at).toLocaleString() : "—"}
        </span>
      </div>
    </div>
  );
}