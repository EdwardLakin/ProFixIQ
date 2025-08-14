"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import LinkButton from "@shared/components/ui/LinkButton";

type Customer = Database["public"]["Tables"]["customers"]["Row"];
type SettingsRow = Database["public"]["Tables"]["customer_settings"]["Row"];
type SettingsInsert = Database["public"]["Tables"]["customer_settings"]["Insert"];

export default function PortalSettingsPage() {
    const supabase = createClientComponentClient<Database>();


  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);

  // Form state mirrors customer_settings columns
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

  // timezone options (small curated list; expand as needed)
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
    (async () => {
      setLoading(true);
      setError(null);

      // Who's logged in?
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr || !user) {
        setError("You must be signed in to view settings.");
        setLoading(false);
        return;
      }

      // Get their customer row
      const { data: cust, error: custErr } = await supabase
        .from("customers")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (custErr || !cust) {
        setError(
          "We couldn't find your customer profile. Please complete your profile first.",
        );
        setLoading(false);
        return;
      }

      setCustomer(cust);

      // Fetch settings (or create defaults if missing)
      const { data: existing, error: settingsErr } = await supabase
        .from("customer_settings")
        .select("*")
        .eq("customer_id", cust.id)
        .maybeSingle();

      if (settingsErr) {
        setError(settingsErr.message);
        setLoading(false);
        return;
      }

      if (existing) {
        setForm(existing);
      } else {
        // Create a default row (allowed for service_role usually; if not, user can save to create)
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
        // Try to insert optimistically; if RLS blocks, user Save will upsert later
        await supabase.from("customer_settings").upsert(defaults).select().single();
        setForm({ ...(defaults as SettingsRow), updated_at: new Date().toISOString() });
      }

      setLoading(false);
    })();
  }, [supabase]);

  const update = <K extends keyof SettingsRow>(key: K, value: SettingsRow[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const onSave = async () => {
    if (!customer) return;
    setSaving(true);
    setError(null);

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
    } else {
      update("updated_at", new Date().toISOString() as SettingsRow["updated_at"]);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="text-sm text-gray-400">Loading your settings…</div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-red-400">{error}</p>
        <LinkButton href="/portal/profile" variant="outline" size="sm">
          Go to Profile
        </LinkButton>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-gray-400">
          Choose how we contact you and how information is displayed.
        </p>
      </header>

      {/* Communication Preferences */}
      <section className="border border-neutral-800 rounded-lg p-4 space-y-3 bg-neutral-900/40">
        <h2 className="font-semibold text-lg">Communication</h2>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={!!form.comm_email_enabled}
            onChange={(e) => update("comm_email_enabled", e.target.checked)}
          />
          <span>Email notifications</span>
        </label>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={!!form.comm_sms_enabled}
            onChange={(e) => update("comm_sms_enabled", e.target.checked)}
          />
          <span>SMS notifications</span>
        </label>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={!!form.marketing_opt_in}
            onChange={(e) => update("marketing_opt_in", e.target.checked)}
          />
          <span>Receive service tips & updates</span>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Preferred contact
            </label>
            <select
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
              value={form.preferred_contact ?? "email"}
              onChange={(e) =>
                update("preferred_contact", e.target.value as SettingsRow["preferred_contact"])
              }
            >
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="phone">Phone</option>
            </select>
          </div>
        </div>
      </section>

      {/* Display */}
      <section className="border border-neutral-800 rounded-lg p-4 space-y-3 bg-neutral-900/40">
        <h2 className="font-semibold text-lg">Display</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Units</label>
            <select
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
              value={form.units ?? "imperial"}
              onChange={(e) => update("units", e.target.value as SettingsRow["units"])}
            >
              <option value="imperial">Imperial (mi, °F)</option>
              <option value="metric">Metric (km, °C)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Language</label>
            <select
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
              value={form.language ?? "en"}
              onChange={(e) => update("language", e.target.value)}
            >
              <option value="en">English</option>
              {/* Add more locales as supported */}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm text-gray-400 mb-1">Timezone</label>
            <select
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
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

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-2 rounded bg-orange-600 hover:bg-orange-700 text-white font-semibold disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
        <span className="text-xs text-gray-500">
          Last updated:{" "}
          {form.updated_at ? new Date(form.updated_at).toLocaleString() : "—"}
        </span>
      </div>
    </div>
  );
}