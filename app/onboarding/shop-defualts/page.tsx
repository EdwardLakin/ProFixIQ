"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Edmonton",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Vancouver",
  "America/Toronto",
  "America/Halifax",
] as const;

export default function ShopDefaultsStep2Page() {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [shopId, setShopId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Defaults
  const [country, setCountry] = useState<"US" | "CA">("US");
  const [province, setProvince] = useState("");
  const [timezone, setTimezone] = useState<string>("America/New_York");

  const [laborRate, setLaborRate] = useState("150");
  const [taxRate, setTaxRate] = useState("5"); // percent in UI
  const [diagnosticFee, setDiagnosticFee] = useState("");
  const [suppliesPercent, setSuppliesPercent] = useState("");

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/sign-in");
        return;
      }

      const { data: prof } = await supabase
        .from("profiles")
        .select("role, shop_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!prof?.shop_id) {
        router.replace("/onboarding");
        return;
      }

      setShopId(prof.shop_id);

      // Prefill from shops if available
      const { data: shop } = await supabase
        .from("shops")
        .select("country, province, timezone, labor_rate, tax_rate, diagnostic_fee, supplies_percent")
        .eq("id", prof.shop_id)
        .maybeSingle();

      if (shop) {
        if (shop.country === "US" || shop.country === "CA") setCountry(shop.country);
        setProvince(shop.province ?? "");
        setTimezone(shop.timezone ?? "America/New_York");
        if (typeof shop.labor_rate === "number") setLaborRate(String(shop.labor_rate));
        if (typeof shop.tax_rate === "number") setTaxRate(String(shop.tax_rate));
        if (typeof shop.diagnostic_fee === "number") setDiagnosticFee(String(shop.diagnostic_fee));
        if (typeof shop.supplies_percent === "number") setSuppliesPercent(String(shop.supplies_percent));
      }

      setLoading(false);
    })();
  }, [router, supabase]);

  const provinceLabel = country === "CA" ? "Province" : "State";
  const taxLabel = country === "CA" ? "Tax rate (GST/PST/HST %)": "Tax rate (Sales tax %)";
  const currency = country === "CA" ? "CAD" : "USD";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!province.trim()) {
      setError(`Please enter a ${provinceLabel}.`);
      return;
    }

    const res = await fetch("/api/onboarding/shop-defaults", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        country,
        province,
        timezone,
        labor_rate: Number(laborRate),
        tax_rate: Number(taxRate),
        diagnostic_fee: diagnosticFee ? Number(diagnosticFee) : null,
        supplies_percent: suppliesPercent ? Number(suppliesPercent) : null,
      }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j?.error || "Failed to save defaults.");
      return;
    }

    router.replace("/dashboard/owner");
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-black text-white">
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-3 text-xs text-neutral-300">
          Loading step 2…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-neutral-900 bg-neutral-950/70 px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
            ProFixIQ • Onboarding
          </p>
          <h1 className="text-xl font-blackops text-orange-400">
            Shop defaults (Step 2 of 2)
          </h1>
          <p className="text-xs text-neutral-400">
            This makes invoices, quotes, totals, and taxes correct from day one.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <form onSubmit={onSubmit} className="space-y-6">
          <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-neutral-100">
              Location + formatting
            </h2>
            <p className="mt-1 text-[11px] text-neutral-500">
              Country controls labels, currency display ({currency}), and tax wording.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-neutral-300">Country</label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value as "US" | "CA")}
                  className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
                >
                  <option value="US">United States</option>
                  <option value="CA">Canada</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-neutral-300">Timezone</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="text-xs text-neutral-300">{provinceLabel}</label>
                <input
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
                  placeholder={provinceLabel}
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-neutral-100">
              Money defaults
            </h2>
            <p className="mt-1 text-[11px] text-neutral-500">
              These become your shop-wide defaults (can be changed later).
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-neutral-300">
                  Labor rate ({currency}/hr)
                </label>
                <input
                  value={laborRate}
                  onChange={(e) => setLaborRate(e.target.value)}
                  className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
                  inputMode="decimal"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-neutral-300">{taxLabel}</label>
                <input
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
                  inputMode="decimal"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-neutral-300">
                  Diagnostic fee ({currency})
                </label>
                <input
                  value={diagnosticFee}
                  onChange={(e) => setDiagnosticFee(e.target.value)}
                  className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
                  inputMode="decimal"
                  placeholder="Optional"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-neutral-300">
                  Supplies percent (%)
                </label>
                <input
                  value={suppliesPercent}
                  onChange={(e) => setSuppliesPercent(e.target.value)}
                  className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
                  inputMode="decimal"
                  placeholder="Optional"
                />
              </div>
            </div>
          </section>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-black shadow-sm transition hover:bg-orange-400"
            >
              Finish setup
            </button>
            {shopId ? (
              <span className="text-[11px] text-neutral-500">
                Shop ID: {shopId}
              </span>
            ) : null}
          </div>
        </form>
      </main>
    </div>
  );
}