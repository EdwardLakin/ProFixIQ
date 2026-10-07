"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  BadgePercent,
  Building2,
  CheckCircle2,
  Layers3,
  ShieldAlert,
  Truck,
  Wrench,
} from "lucide-react";
import { ProFixIQMark, ProFixIQWordmark } from "@shared/components/brand/ProFixIQBrand";

const PRODUCT_PACKAGES = [
  {
    value: "shop_operations",
    label: "Shop Operations",
    shortLabel: "Shop",
    description: "Core shop workflow, Shop Mobile, customer approvals, parts, and repair operations.",
    icon: Wrench,
    surfaces: ["shop", "shop_mobile", "customer_portal"],
  },
  {
    value: "complete_operations",
    label: "Complete Operations",
    shortLabel: "Complete",
    description: "Shop + Field Service + Fleet in one connected operating system.",
    icon: Layers3,
    surfaces: ["shop", "fleet", "field_service", "shop_mobile", "customer_portal"],
  },
  {
    value: "field_service",
    label: "Field Service",
    shortLabel: "Field",
    description: "Service-truck dispatch and off-site repair workflows for mobile operations.",
    icon: Truck,
    surfaces: ["field_service"],
  },
  {
    value: "fleet_maintenance",
    label: "Fleet Maintenance",
    shortLabel: "Fleet",
    description: "Fleet control, assets, PM, inspections, defects, approvals, and maintenance history.",
    icon: Building2,
    surfaces: ["fleet"],
  },
] as const;

type ProductPackageValue = (typeof PRODUCT_PACKAGES)[number]["value"];

const SURFACES = [
  { value: "shop", label: "Shop" },
  { value: "fleet", label: "Fleet" },
  { value: "field_service", label: "Field Service" },
  { value: "shop_mobile", label: "Shop Mobile" },
  { value: "customer_portal", label: "Customer Portal" },
] as const;

const inputClass =
  "mt-1.5 w-full rounded-xl border border-[color:var(--marketing-border)] bg-white px-3.5 py-2.5 text-sm text-[color:var(--marketing-ink)] outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10";

function isProductPackage(value: string | null): value is ProductPackageValue {
  return PRODUCT_PACKAGES.some((product) => product.value === value);
}

export default function EarlyAccessApplication() {
  const [productPackage, setProductPackage] = useState<ProductPackageValue | "">("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [location, setLocation] = useState("");
  const [operationType, setOperationType] = useState("");
  const [locationCount, setLocationCount] = useState("1");
  const [technicianCount, setTechnicianCount] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [fleetAssetCount, setFleetAssetCount] = useState("");
  const [currentSoftware, setCurrentSoftware] = useState("");
  const [primaryChallenge, setPrimaryChallenge] = useState("");
  const [interestedSurfaces, setInterestedSurfaces] = useState<string[]>([]);
  const [purchaseTimeline, setPurchaseTimeline] = useState("");
  const [feedbackCommitment, setFeedbackCommitment] = useState(false);
  const [offerTermsAccepted, setOfferTermsAccepted] = useState(false);
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("product");
    if (!isProductPackage(requested)) return;
    const selected = PRODUCT_PACKAGES.find((product) => product.value === requested);
    setProductPackage(requested);
    setInterestedSurfaces(selected ? [...selected.surfaces] : []);
  }, []);

  function selectProduct(value: ProductPackageValue) {
    const selected = PRODUCT_PACKAGES.find((product) => product.value === value);
    setProductPackage(value);
    setInterestedSurfaces(selected ? [...selected.surfaces] : []);
    setError(null);
  }

  function toggleSurface(surface: string) {
    setInterestedSurfaces((current) =>
      current.includes(surface) ? current.filter((value) => value !== surface) : [...current, surface],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!productPackage) {
      setError("Choose the ProFixIQ product you want the Early Access offer applied to.");
      return;
    }
    if (interestedSurfaces.length === 0) {
      setError("Choose at least one ProFixIQ surface.");
      return;
    }

    setSubmitting(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const response = await fetch("/api/public/early-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productPackage,
          fullName,
          email,
          phone,
          companyName,
          location,
          operationType,
          locationCount: Number(locationCount),
          technicianCount: technicianCount ? Number(technicianCount) : null,
          teamSize: teamSize ? Number(teamSize) : null,
          fleetAssetCount: fleetAssetCount ? Number(fleetAssetCount) : null,
          currentSoftware,
          primaryChallenge,
          interestedSurfaces,
          purchaseTimeline,
          feedbackCommitment,
          offerTermsAccepted,
          source: document.referrer || "direct",
          utmSource: params.get("utm_source") ?? "",
          utmMedium: params.get("utm_medium") ?? "",
          utmCampaign: params.get("utm_campaign") ?? "",
          website,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
      setSubmitted(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedProduct = PRODUCT_PACKAGES.find((product) => product.value === productPackage);

  return (
    <div className="pfq-marketing min-h-screen bg-[color:var(--marketing-bg)] text-[color:var(--marketing-ink)]">
      <header className="border-b border-[color:var(--marketing-border)] bg-[rgba(247,249,252,0.92)] backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1400px] items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="ProFixIQ home">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#07111f] shadow-sm">
              <ProFixIQMark className="h-8 w-8" />
            </span>
            <ProFixIQWordmark className="block text-xl text-[color:var(--marketing-ink)]" />
          </Link>
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--marketing-muted)] transition hover:text-[color:var(--marketing-ink)]">
            <ArrowLeft size={15} /> Back home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-5 py-14 sm:px-8 sm:py-20">
        <section className="mx-auto max-w-4xl text-center">
          <div className="marketing-eyebrow">Limited Early Access</div>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
            Choose your ProFixIQ product. Save 30% for 6 months.
          </h1>
          <p className="mx-auto mt-5 max-w-3xl text-base leading-7 text-[color:var(--marketing-muted)] sm:text-lg">
            Apply the Early Access offer to the product that matches your operation. If accepted, you&apos;ll receive
            a dedicated signup path for that product: 7 days free, then 30% off the base subscription for 6 paid months.
          </p>
        </section>

        <section className="mt-10" aria-labelledby="choose-product-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 id="choose-product-heading" className="text-2xl font-bold tracking-[-0.025em]">Choose where you want Early Access</h2>
              <p className="mt-2 text-sm text-[color:var(--marketing-muted)]">Your selection is stored with the application so the discount can be tied to the correct subscription product.</p>
            </div>
            <Link href="/compare-plans" className="hidden text-sm font-bold text-blue-700 hover:text-blue-600 sm:inline">Compare plans</Link>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PRODUCT_PACKAGES.map((product) => {
              const Icon = product.icon;
              const selected = productPackage === product.value;
              return (
                <Link
                  key={product.value}
                  href={`/early-access?product=${product.value}#apply`}
                  onClick={() => selectProduct(product.value)}
                  className={`rounded-2xl border p-5 text-left transition ${selected ? "border-blue-500 bg-blue-50 shadow-[0_12px_35px_rgba(37,99,235,0.12)]" : "border-[color:var(--marketing-border)] bg-white hover:border-blue-300 hover:shadow-sm"}`}
                  aria-current={selected ? "true" : undefined}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-cyan-300"><Icon className="h-5 w-5" /></span>
                    {selected ? <CheckCircle2 className="h-5 w-5 text-blue-600" /> : null}
                  </div>
                  <div className="mt-5 text-lg font-bold">{product.label}</div>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--marketing-muted)]">{product.description}</p>
                  <div className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-blue-700">Apply 30% offer →</div>
                </Link>
              );
            })}
          </div>
        </section>

        <section id="apply" className="mt-12 grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-2xl border border-blue-500/20 bg-blue-50/70 p-5">
              <div className="flex items-center gap-2 font-bold text-blue-950">
                <BadgePercent className="h-5 w-5 text-blue-600" /> Early Access offer
              </div>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-blue-950/80">
                <li>• 7-day free trial first.</li>
                <li>• 30% off the selected product&apos;s base subscription for the next 6 paid months.</li>
                <li>• Direct product feedback channel and earlier access to selected workflows.</li>
                <li>• Standard pricing begins automatically after the 6 discounted paid months.</li>
              </ul>
              <p className="mt-4 text-xs leading-5 text-blue-950/60">
                Early Access is application-based and limited. Premium add-ons and separately metered usage are not included in the base-subscription discount.
              </p>
            </div>

            {selectedProduct ? (
              <div className="mt-5 rounded-2xl border border-emerald-500/25 bg-emerald-50 p-5">
                <div className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">Selected product</div>
                <div className="mt-2 text-xl font-bold text-emerald-950">{selectedProduct.label}</div>
                <p className="mt-2 text-sm leading-6 text-emerald-900/70">The approved discount will be tied to this product, not a public reusable coupon.</p>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
                Choose Shop, Complete, Field, or Fleet above before submitting the application.
              </div>
            )}

            <div className="mt-6 grid gap-3 text-sm text-[color:var(--marketing-muted)] sm:grid-cols-2 lg:grid-cols-1">
              {["Automotive repair shops", "Heavy-duty / diesel operations", "Fleet maintenance teams", "Mobile / field-service operations"].map((label) => (
                <div key={label} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> {label}</div>
              ))}
            </div>
          </div>

          <div>
            {submitted ? (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-50 p-7 shadow-[0_24px_60px_rgba(23,32,42,0.06)]">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                <h2 className="mt-4 text-2xl font-bold text-emerald-950">Application received</h2>
                <p className="mt-2 leading-7 text-emerald-900/80">
                  Thanks, {fullName.split(" ")[0] || "there"}. We&apos;ll review your {selectedProduct?.label ?? "ProFixIQ"} application and contact you at <strong>{email}</strong> if there&apos;s a fit for this Early Access group.
                </p>
                <p className="mt-3 text-sm leading-6 text-emerald-900/70">
                  Applying does not create a subscription or charge anything. If accepted, you&apos;ll receive the product-specific Early Access signup path before billing begins.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-[color:var(--marketing-border)] bg-white p-6 shadow-[0_24px_60px_rgba(23,32,42,0.08)] sm:p-8">
                <div>
                  <h2 className="text-2xl font-bold tracking-[-0.025em]">Apply for Early Access</h2>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--marketing-muted)]">A few practical questions help us choose operations that can give useful real-world feedback.</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-[color:var(--marketing-muted)]">Your name<input required value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} autoComplete="name" /></label>
                  <label className="text-xs font-semibold text-[color:var(--marketing-muted)]">Work email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} autoComplete="email" /></label>
                  <label className="text-xs font-semibold text-[color:var(--marketing-muted)]">Phone (optional)<input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} autoComplete="tel" /></label>
                  <label className="text-xs font-semibold text-[color:var(--marketing-muted)]">Shop / company name<input required value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={inputClass} autoComplete="organization" /></label>
                  <label className="text-xs font-semibold text-[color:var(--marketing-muted)] sm:col-span-2">City / region<input value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} placeholder="Calgary, Alberta" /></label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-[color:var(--marketing-muted)]">
                    Primary operation
                    <select required value={operationType} onChange={(e) => setOperationType(e.target.value)} className={inputClass}>
                      <option value="">Choose one…</option>
                      <option value="automotive">Automotive repair</option>
                      <option value="heavy_duty">Heavy-duty / diesel</option>
                      <option value="fleet">Fleet maintenance</option>
                      <option value="field_service">Field service / mobile repair</option>
                      <option value="mixed">Mixed operation</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-[color:var(--marketing-muted)]">Number of locations<input required type="number" min={1} max={500} value={locationCount} onChange={(e) => setLocationCount(e.target.value)} className={inputClass} /></label>
                  <label className="text-xs font-semibold text-[color:var(--marketing-muted)]">Technicians / mechanics<input type="number" min={0} value={technicianCount} onChange={(e) => setTechnicianCount(e.target.value)} className={inputClass} /></label>
                  <label className="text-xs font-semibold text-[color:var(--marketing-muted)]">Total expected users<input type="number" min={1} value={teamSize} onChange={(e) => setTeamSize(e.target.value)} className={inputClass} /></label>
                  {(operationType === "fleet" || operationType === "mixed" || productPackage === "fleet_maintenance" || productPackage === "complete_operations") ? (
                    <label className="text-xs font-semibold text-[color:var(--marketing-muted)] sm:col-span-2">Approximate fleet assets<input type="number" min={0} value={fleetAssetCount} onChange={(e) => setFleetAssetCount(e.target.value)} className={inputClass} /></label>
                  ) : null}
                </div>

                <label className="block text-xs font-semibold text-[color:var(--marketing-muted)]">What software do you use today? (optional)<input value={currentSoftware} onChange={(e) => setCurrentSoftware(e.target.value)} className={inputClass} placeholder="Fullbay, Shopmonkey, PBS, spreadsheets, paper…" /></label>

                <label className="block text-xs font-semibold text-[color:var(--marketing-muted)]">What is the biggest workflow problem you want ProFixIQ to solve?<textarea required rows={4} value={primaryChallenge} onChange={(e) => setPrimaryChallenge(e.target.value)} className={inputClass} placeholder="Tell us where time, communication, approvals, inspections, parts, or fleet workflow breaks down today." /></label>

                <fieldset>
                  <legend className="text-xs font-semibold text-[color:var(--marketing-muted)]">Which ProFixIQ surfaces matter to you?</legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {SURFACES.map((surface) => (
                      <label key={surface.value} className="flex cursor-pointer items-center gap-3 rounded-xl border border-[color:var(--marketing-border)] px-3.5 py-3 text-sm font-semibold">
                        <input type="checkbox" checked={interestedSurfaces.includes(surface.value)} onChange={() => toggleSurface(surface.value)} className="h-4 w-4" />
                        {surface.label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="block text-xs font-semibold text-[color:var(--marketing-muted)]">
                  When are you realistically looking to change or add software?
                  <select value={purchaseTimeline} onChange={(e) => setPurchaseTimeline(e.target.value)} className={inputClass}>
                    <option value="">Choose one…</option>
                    <option value="now">Now / as soon as possible</option>
                    <option value="30_days">Within 30 days</option>
                    <option value="90_days">Within 90 days</option>
                    <option value="6_months">Within 6 months</option>
                    <option value="researching">Researching / no fixed timeline</option>
                  </select>
                </label>

                <div className="space-y-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
                  <label className="flex items-start gap-3"><input required type="checkbox" checked={feedbackCommitment} onChange={(e) => setFeedbackCommitment(e.target.checked)} className="mt-1 h-4 w-4" /><span>I&apos;m willing to actively use ProFixIQ and provide practical product feedback during Early Access.</span></label>
                  <label className="flex items-start gap-3"><input required type="checkbox" checked={offerTermsAccepted} onChange={(e) => setOfferTermsAccepted(e.target.checked)} className="mt-1 h-4 w-4" /><span>I understand acceptance is not guaranteed; if accepted, the offer is 7 days free followed by 30% off the selected product&apos;s base subscription for 6 paid months, then standard pricing.</span></label>
                </div>

                <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden"><label>Website<input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label></div>

                {error ? <p className="flex items-center gap-2 text-xs font-semibold text-red-600"><ShieldAlert className="h-3.5 w-3.5" />{error}</p> : null}

                <button type="submit" disabled={submitting || !productPackage} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">
                  {submitting ? "Submitting…" : productPackage ? `Apply for ${selectedProduct?.shortLabel ?? "Early Access"}` : "Choose a product above"}
                </button>
                <p className="text-center text-xs leading-5 text-[color:var(--marketing-muted)]">No payment is collected by this application.</p>
              </form>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-[color:var(--marketing-border)] bg-white">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-4 px-5 py-8 text-sm text-[color:var(--marketing-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>© ProFixIQ. Early Access applications are reviewed before any subscription path is offered.</div>
          <div className="flex flex-wrap gap-4 font-semibold">
            <Link href="/">Home</Link>
            <Link href="/compare-plans">Pricing</Link>
            <Link href="/field-service">Field Service</Link>
            <Link href="/fleet-maintenance">Fleet Maintenance</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
