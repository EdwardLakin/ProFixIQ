"use client";

import { useEffect, useMemo, useState } from "react";
import { readPersistedActivationContext } from "@/features/integrations/shopBoost/activationContext";
import {
  defaultShopTimezone,
  getSupportedShopTimezones,
  isSupportedShopTimezone,
  shopCountryForTimezone,
  type ShopCountryCode,
} from "@/features/shared/lib/timezones/shopTimezones";

const COUNTRIES = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
] as const;

type BootstrapResponse = {
  ok?: boolean;
  error?: string;
  destination?: string;
};

export default function OwnerOnboardingForm() {
  const [country, setCountry] = useState<ShopCountryCode>("US");
  const [timezone, setTimezone] = useState<string>(defaultShopTimezone("US"));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const timezoneOptions = useMemo(
    () => getSupportedShopTimezones(country),
    [country],
  );

  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const detectedCountry = shopCountryForTimezone(detected);
    if (!detectedCountry) return;
    setCountry(detectedCountry);
    setTimezone(detected);
  }, []);

  function changeCountry(nextCountry: ShopCountryCode) {
    setCountry(nextCountry);
    if (!isSupportedShopTimezone(nextCountry, timezone)) {
      setTimezone(defaultShopTimezone(nextCountry));
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const pin = String(form.get("pin") ?? "").trim();
    const pinConfirmation = String(form.get("pinConfirmation") ?? "").trim();

    if (!/^\d{4,8}$/.test(pin)) {
      setError("Owner PIN must be 4 to 8 digits.");
      return;
    }
    if (pin !== pinConfirmation) {
      setError("Owner PINs do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/onboarding/bootstrap-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: String(form.get("businessName") ?? ""),
          shopName: String(form.get("shopName") ?? ""),
          street: String(form.get("street") ?? ""),
          city: String(form.get("city") ?? ""),
          province: String(form.get("province") ?? ""),
          postalCode: String(form.get("postalCode") ?? ""),
          country,
          timezone,
          pin,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as BootstrapResponse;

      if (!response.ok || !payload.ok) {
        setError(payload.error || "We could not create your shop. Please try again.");
        return;
      }

      // Shop Boost is an explicit acquisition handoff, not something middleware
      // should infer from a missing intake row. Only a browser that actually
      // carries a valid persisted analysis context enters the activation path.
      const activationContext = readPersistedActivationContext(
        new URLSearchParams(window.location.search),
      );
      window.location.assign(
        activationContext
          ? "/onboarding/shop-boost"
          : payload.destination || "/dashboard/onboarding-v2",
      );
    } catch {
      setError("We could not create your shop. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const fieldClassName =
    "w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-2.5 text-sm text-[color:var(--theme-text-primary)] outline-none transition focus:border-[var(--accent-copper)] focus:ring-2 focus:ring-[color:var(--accent-copper)]/20";

  return (
    <main className="min-h-screen bg-[color:var(--theme-surface-page)] px-4 py-8 text-[color:var(--theme-text-primary)] sm:px-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">
            ProFixIQ shop setup
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Create your shop workspace</h1>
          <p className="mt-2 max-w-2xl text-sm text-[color:var(--theme-text-secondary)]">
            Add the shop details your team and customers will see. You can change these settings later.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-5 shadow-[var(--theme-shadow-medium)] sm:p-7"
        >
          <section aria-labelledby="shop-details-heading">
            <h2 id="shop-details-heading" className="text-lg font-semibold">
              Shop details
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-medium">
                <span>Business name</span>
                <input
                  name="businessName"
                  type="text"
                  autoComplete="organization"
                  required
                  maxLength={120}
                  className={fieldClassName}
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                <span>Shop name</span>
                <input
                  name="shopName"
                  type="text"
                  maxLength={120}
                  placeholder="Defaults to business name"
                  className={fieldClassName}
                />
              </label>
            </div>
          </section>

          <section aria-labelledby="location-heading">
            <h2 id="location-heading" className="text-lg font-semibold">
              Primary location
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
                <span>Street address</span>
                <input
                  name="street"
                  type="text"
                  autoComplete="street-address"
                  required
                  maxLength={200}
                  className={fieldClassName}
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                <span>City</span>
                <input
                  name="city"
                  type="text"
                  autoComplete="address-level2"
                  required
                  maxLength={100}
                  className={fieldClassName}
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                <span>{country === "CA" ? "Province" : "State"}</span>
                <input
                  name="province"
                  type="text"
                  autoComplete="address-level1"
                  required
                  maxLength={80}
                  className={fieldClassName}
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                <span>{country === "CA" ? "Postal code" : "ZIP code"}</span>
                <input
                  name="postalCode"
                  type="text"
                  autoComplete="postal-code"
                  required
                  maxLength={16}
                  className={fieldClassName}
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                <span>Country</span>
                <select
                  value={country}
                  onChange={(event) =>
                    changeCountry(event.target.value as ShopCountryCode)
                  }
                  className={fieldClassName}
                >
                  {COUNTRIES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
                <span>Timezone</span>
                <select
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                  className={fieldClassName}
                >
                  {timezoneOptions.map((item) => (
                    <option key={item} value={item}>
                      {item.replace("America/", "").replace("Pacific/", "").replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section aria-labelledby="owner-pin-heading">
            <h2 id="owner-pin-heading" className="text-lg font-semibold">
              Owner PIN
            </h2>
            <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
              Use 4 to 8 digits. This protects sensitive owner actions inside the shop.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-medium">
                <span>Owner PIN</span>
                <input
                  name="pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  pattern="[0-9]{4,8}"
                  required
                  className={fieldClassName}
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                <span>Confirm owner PIN</span>
                <input
                  name="pinConfirmation"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  pattern="[0-9]{4,8}"
                  required
                  className={fieldClassName}
                />
              </label>
            </div>
          </section>

          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[var(--accent-copper)] px-5 py-3 text-sm font-semibold text-[color:var(--theme-text-on-accent)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {submitting ? "Creating shop…" : "Create shop and continue"}
          </button>
        </form>
      </div>
    </main>
  );
}
