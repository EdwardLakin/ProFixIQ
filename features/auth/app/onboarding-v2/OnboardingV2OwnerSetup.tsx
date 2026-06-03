"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

type Props = {
  email: string;
  fullName: string;
  phone: string;
  role: string;
};

const NA_COUNTRIES = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
] as const;

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
] as const;

export function OnboardingV2OwnerSetup({ email, fullName, phone, role }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [name, setName] = useState(fullName);
  const [phoneNumber, setPhoneNumber] = useState(phone);
  const [country, setCountry] = useState<"US" | "CA">("US");
  const [timezone, setTimezone] = useState<string>("America/New_York");
  const [businessName, setBusinessName] = useState("");
  const [shopName, setShopName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [ownerPin, setOwnerPin] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const fieldClassName =
    "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none transition placeholder:text-neutral-500 focus:border-[var(--accent-copper)]";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/sign-in");
        return;
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ full_name: name, phone: phoneNumber, email: user.email ?? email })
        .eq("id", user.id);

      if (profileError) throw new Error(profileError.message);

      const response = await fetch("/api/onboarding/bootstrap-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          shopName: shopName || businessName,
          address,
          city,
          province,
          postal_code: postalCode,
          country,
          timezone,
          pin: ownerPin,
          stripe_checkout_session_id: searchParams.get("session_id"),
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { msg?: string } | null;
        throw new Error(body?.msg ?? "Failed to create shop. Please try again.");
      }

      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to finish onboarding.");
      setSaving(false);
    }
  }

  const provinceLabel = country === "CA" ? "Province" : "State";
  const postalLabel = country === "CA" ? "Postal code" : "ZIP code";

  return (
    <main className="min-h-screen px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="rounded-3xl border border-white/10 bg-black/35 p-6 shadow-card backdrop-blur-xl sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--accent-copper-light)]">
            Onboarding V2
          </p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
            Create your first shop workspace
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-neutral-300">
            We found your {role || "owner"} account. Finish the owner/admin
            setup by creating the first shop and setting it as your current shop
            context. Staff accounts are routed to shop assignment instead of this flow.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-6">
            <section className="rounded-3xl border border-white/10 bg-black/30 p-5 shadow-card backdrop-blur-xl">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-copper)] text-sm font-bold text-black">
                  1
                </span>
                <div>
                  <h2 className="text-lg font-semibold">Confirm identity</h2>
                  <p className="text-xs text-neutral-400">Keep your profile details current before shop setup.</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-neutral-300">
                  Full name
                  <input value={name} onChange={(e) => setName(e.target.value)} className={fieldClassName} required />
                </label>
                <label className="space-y-1 text-xs text-neutral-300">
                  Phone
                  <input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className={fieldClassName} />
                </label>
                <label className="space-y-1 text-xs text-neutral-300 sm:col-span-2">
                  Email
                  <input value={email} className={fieldClassName} disabled />
                </label>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-black/30 p-5 shadow-card backdrop-blur-xl">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-copper)] text-sm font-bold text-black">
                  2
                </span>
                <div>
                  <h2 className="text-lg font-semibold">Create shop</h2>
                  <p className="text-xs text-neutral-400">This creates the first tenant boundary for your account.</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs text-neutral-300">
                    Business name
                    <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} className={fieldClassName} required />
                  </label>
                  <label className="space-y-1 text-xs text-neutral-300">
                    Shop display name
                    <input value={shopName} onChange={(e) => setShopName(e.target.value)} className={fieldClassName} placeholder="Defaults to business name" />
                  </label>
                </div>
                <label className="space-y-1 text-xs text-neutral-300">
                  Shop address
                  <input value={address} onChange={(e) => setAddress(e.target.value)} className={fieldClassName} required />
                </label>
                <div className="grid gap-3 sm:grid-cols-3">
                  <input value={city} onChange={(e) => setCity(e.target.value)} className={fieldClassName} placeholder="City" required />
                  <input value={province} onChange={(e) => setProvince(e.target.value)} className={fieldClassName} placeholder={provinceLabel} required />
                  <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className={fieldClassName} placeholder={postalLabel} required />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <select value={country} onChange={(e) => setCountry(e.target.value as "US" | "CA")} className={fieldClassName}>
                    {NA_COUNTRIES.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={fieldClassName}>
                    {TIMEZONES.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-black/30 p-5 shadow-card backdrop-blur-xl">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-copper)] text-sm font-bold text-black">
                  3
                </span>
                <div>
                  <h2 className="text-lg font-semibold">Set default shop context</h2>
                  <p className="text-xs text-neutral-400">Your owner PIN secures privileged shop operations.</p>
                </div>
              </div>
              <label className="space-y-1 text-xs text-neutral-300">
                Owner PIN <span className="text-neutral-500">(4-8 digits)</span>
                <input
                  value={ownerPin}
                  onChange={(e) => setOwnerPin(e.target.value.replace(/\D/g, ""))}
                  className={fieldClassName}
                  inputMode="numeric"
                  maxLength={8}
                  pattern="[0-9]*"
                  type="password"
                  required
                />
              </label>
            </section>
          </div>

          <aside className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-black/35 p-5 shadow-card backdrop-blur-xl">
              <h2 className="text-lg font-semibold">Step 4: launch</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-300">
                After creation, your profile receives a current shop and you will
                land on the dashboard. Subscription and Shop Boost workflows can
                run only after this shop context exists.
              </p>
              <button
                type="submit"
                disabled={saving}
                className="mt-5 w-full rounded-full border border-[rgba(193,102,59,0.35)] bg-[var(--accent-copper)] px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Creating shop…" : "Complete onboarding"}
              </button>
              {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
            </div>
          </aside>
        </form>
      </div>
    </main>
  );
}
