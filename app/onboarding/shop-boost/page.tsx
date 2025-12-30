"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type YesNo = "yes" | "no";

export default function ShopBoostOnboardingPage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [shopId, setShopId] = useState<string | null>(null);
  const [shopName, setShopName] = useState<string | null>(null);

  // questionnaire
  const [hasCustomers, setHasCustomers] = useState<YesNo>("yes");
  const [hasRepairHistory, setHasRepairHistory] = useState<YesNo>("yes");
  const [hasPartsInventory, setHasPartsInventory] = useState<YesNo>("yes");
  const [hasFleets, setHasFleets] = useState<YesNo>("no");
  const [specialty, setSpecialty] = useState<
    "general" | "diesel" | "hd" | "mixed"
  >("general");
  const [techCount, setTechCount] = useState<string>("");
  const [bayCount, setBayCount] = useState<string>("");
  const [avgMonthlyRos, setAvgMonthlyRos] = useState<string>("");

  // uploads
  const [customersFile, setCustomersFile] = useState<File | null>(null);
  const [vehiclesFile, setVehiclesFile] = useState<File | null>(null);
  const [partsFile, setPartsFile] = useState<File | null>(null);

  // basic guard: ensure user + shop exist
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/sign-in");
          return;
        }

        const { data: profile, error } = await supabase
          .from("profiles")
          .select("shop_id, shops(name)")
          .eq("id", user.id)
          .maybeSingle();

        if (error) {
          console.error(error);
        }

        if (!profile?.shop_id) {
          router.replace("/onboarding");
          return;
        }

        setShopId(profile.shop_id);
        const name = (profile as any)?.shops?.name ?? null;
        if (name) setShopName(name);
      } finally {
        setLoading(false);
      }
    })();
  }, [router, supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (!shopId) {
        setError("We couldn't find your shop. Please go back and try again.");
        setSubmitting(false);
        return;
      }

      const form = new FormData();

      form.append("shopId", shopId);
      form.append(
        "questionnaire",
        JSON.stringify({
          hasCustomers,
          hasRepairHistory,
          hasPartsInventory,
          hasFleets,
          specialty,
          techCount: techCount ? Number(techCount) : null,
          bayCount: bayCount ? Number(bayCount) : null,
          avgMonthlyRos: avgMonthlyRos ? Number(avgMonthlyRos) : null,
        }),
      );

      if (customersFile) form.append("customersFile", customersFile);
      if (vehiclesFile) form.append("vehiclesFile", vehiclesFile);
      if (partsFile) form.append("partsFile", partsFile);

      const res = await fetch("/api/onboarding/shop-boost", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(
          j?.error ||
            j?.msg ||
            "We couldn’t start the AI setup yet. Please try again.",
        );
        setSubmitting(false);
        return;
      }

      // After this, your AI pipeline runs off the intake table.
      // Owners continue to shop-defaults to set tax, labor, etc.
      router.replace("/onboarding/shop-defaults");
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-black text-white">
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-3 text-xs text-neutral-300">
          Loading your shop…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-neutral-900 bg-neutral-950/70 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
            ProFixIQ • Shop Boost Setup
          </p>
          <h1 className="text-xl font-blackops text-orange-400">
            Let the AI learn your shop
          </h1>
          <p className="text-xs text-neutral-400">
            Step 2 of 3 — quick questions and data uploads so we can build your
            shop blueprint and menus.
          </p>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        <div className="flex-1 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Questionnaire */}
            <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-neutral-100">
                    Quick yes/no questions
                  </h2>
                  <p className="text-[11px] text-neutral-500">
                    This lets us tune menus, inspections, and fleet tools for{" "}
                    {shopName ? (
                      <span className="font-medium">{shopName}</span>
                    ) : (
                      "your shop"
                    )}
                    .
                  </p>
                </div>
                <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-400">
                  Takes about a minute
                </span>
              </div>

              <div className="space-y-4 text-sm">
                <YesNoRow
                  label="Do you already have a customer base?"
                  value={hasCustomers}
                  onChange={setHasCustomers}
                  helper="If yes, you can upload them below so we can connect vehicles and history."
                />

                <YesNoRow
                  label="Do you have repair history from another system or spreadsheets?"
                  value={hasRepairHistory}
                  onChange={setHasRepairHistory}
                  helper="This is what we use to find your most common jobs and missed opportunities."
                />

                <YesNoRow
                  label="Do you have a parts inventory list you want to bring in?"
                  value={hasPartsInventory}
                  onChange={setHasPartsInventory}
                  helper="Even a rough list helps build packages and menu pricing."
                />

                <YesNoRow
                  label="Do you work with fleets today?"
                  value={hasFleets}
                  onChange={setHasFleets}
                  helper="If yes, we’ll emphasize pre-trips, approvals, and downtime metrics."
                />

                {/* specialty */}
                <div className="space-y-1">
                  <label className="text-xs text-neutral-300">
                    What best describes your work?
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      { key: "general", label: "General repair / tires" },
                      { key: "diesel", label: "Diesel-focused" },
                      { key: "hd", label: "Heavy-duty / commercial" },
                      { key: "mixed", label: "Mixed shop + fleet" },
                    ].map((opt) => (
                      <button
                        type="button"
                        key={opt.key}
                        onClick={() =>
                          setSpecialty(opt.key as typeof specialty)
                        }
                        className={`rounded-md border px-3 py-2 text-left text-xs ${
                          specialty === opt.key
                            ? "border-orange-500 bg-orange-500/10 text-orange-100"
                            : "border-neutral-700 bg-neutral-900 text-neutral-200 hover:border-neutral-500"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* numeric quick facts */}
                <div className="grid gap-3 sm:grid-cols-3">
                  <NumberInput
                    label="How many technicians?"
                    value={techCount}
                    onChange={setTechCount}
                  />
                  <NumberInput
                    label="How many bays?"
                    value={bayCount}
                    onChange={setBayCount}
                  />
                  <NumberInput
                    label="Approx. repair orders per month?"
                    value={avgMonthlyRos}
                    onChange={setAvgMonthlyRos}
                  />
                </div>
              </div>
            </section>

            {/* Uploads */}
            <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-neutral-100">
                    Upload what you already have
                  </h2>
                  <p className="text-[11px] text-neutral-500">
                    CSV exports from your current system are perfect. You can
                    skip any of these and add them later.
                  </p>
                </div>
                <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-400">
                  Recommended, not required
                </span>
              </div>

              <div className="space-y-4 text-sm">
                <UploadRow
                  label="Customers"
                  description="Names, phones, emails — we’ll attach vehicles and history where possible."
                  onFileChange={setCustomersFile}
                  currentFile={customersFile}
                  id="customers-upload"
                />

                <UploadRow
                  label="Vehicles & repair history"
                  description="VIN/plate, mileage, RO dates, complaint/cause/correction, line items."
                  onFileChange={setVehiclesFile}
                  currentFile={vehiclesFile}
                  id="vehicles-upload"
                />

                <UploadRow
                  label="Parts inventory"
                  description="Part numbers, descriptions, cost and sell prices, preferred vendors."
                  onFileChange={setPartsFile}
                  currentFile={partsFile}
                  id="parts-upload"
                />

                <p className="text-[11px] text-neutral-500">
                  Don&apos;t worry about perfect formatting — we use AI to
                  interpret the columns and map them into ProFixIQ. You&apos;ll
                  get a chance to review everything before it goes live.
                </p>
              </div>
            </section>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-black shadow-sm transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Starting AI setup…" : "Start AI Shop Boost"}
              </button>
              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>
          </form>
        </div>

        {/* Sidebar explainer */}
        <aside className="w-full space-y-4 lg:w-72">
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
            <h3 className="mb-2 text-sm font-semibold text-neutral-100">
              What happens next?
            </h3>
            <p className="text-xs text-neutral-400">
              We create import jobs for your files and feed them into the AI
              engine. It looks for your most common repairs, missed upsell
              opportunities, and packages that should be on your menu.
            </p>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
            <h3 className="mb-2 text-sm font-semibold text-neutral-100">
              You stay in control
            </h3>
            <p className="text-xs text-neutral-400">
              Nothing is pushed live without your review. You&apos;ll see a draft
              &quot;Shop Health&quot; report and proposed menus that you can tweak or
              reject before going live.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}

type YesNoRowProps = {
  label: string;
  helper?: string;
  value: YesNo;
  onChange: (v: YesNo) => void;
};

function YesNoRow({ label, helper, value, onChange }: YesNoRowProps) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-xs text-neutral-300">{label}</label>
        <div className="inline-flex gap-1 rounded-full bg-neutral-900 p-1 text-[11px]">
          <button
            type="button"
            onClick={() => onChange("yes")}
            className={`rounded-full px-2 py-0.5 ${
              value === "yes"
                ? "bg-orange-500 text-black"
                : "text-neutral-300 hover:text-white"
            }`}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => onChange("no")}
            className={`rounded-full px-2 py-0.5 ${
              value === "no"
                ? "bg-neutral-800 text-neutral-100"
                : "text-neutral-300 hover:text-white"
            }`}
          >
            No
          </button>
        </div>
      </div>
      {helper && (
        <p className="text-[11px] text-neutral-500">
          {helper}
        </p>
      )}
    </div>
  );
}

type NumberInputProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
};

function NumberInput({ label, value, onChange }: NumberInputProps) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-neutral-300">{label}</label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
      />
    </div>
  );
}

type UploadRowProps = {
  id: string;
  label: string;
  description: string;
  currentFile: File | null;
  onFileChange: (f: File | null) => void;
};

function UploadRow({
  id,
  label,
  description,
  currentFile,
  onFileChange,
}: UploadRowProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div>
          <label className="text-xs text-neutral-300">{label}</label>
          <p className="text-[11px] text-neutral-500">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <label
          htmlFor={id}
          className="inline-flex cursor-pointer items-center rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-[11px] font-semibold text-neutral-200 hover:border-neutral-500"
        >
          Choose CSV
        </label>
        <input
          id={id}
          type="file"
          accept=".csv, text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            onFileChange(file);
          }}
        />
        <span className="text-[11px] text-neutral-400">
          {currentFile ? currentFile.name : "No file selected"}
        </span>
      </div>
    </div>
  );
}