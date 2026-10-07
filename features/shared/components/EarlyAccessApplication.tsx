"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowLeft, BadgePercent, CheckCircle2, ShieldAlert } from "lucide-react";
import Footer from "@shared/components/ui/Footer";
import { ProFixIQMark, ProFixIQWordmark } from "@shared/components/brand/ProFixIQBrand";

const SURFACES = [
  { value: "shop", label: "Shop" },
  { value: "fleet", label: "Fleet" },
  { value: "field_service", label: "Field Service" },
  { value: "shop_mobile", label: "Shop Mobile" },
  { value: "customer_portal", label: "Customer Portal" },
] as const;

const inputClass =
  "mt-1.5 w-full rounded-xl border border-[color:var(--marketing-border)] bg-white px-3.5 py-2.5 text-sm text-[color:var(--marketing-ink)] outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10";

export default function EarlyAccessApplication() {
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
  const [interestedSurfaces, setInterestedSurfaces] = useState<string[]>(["shop"]);
  const [purchaseTimeline, setPurchaseTimeline] = useState("");
  const [feedbackCommitment, setFeedbackCommitment] = useState(false);
  const [offerTermsAccepted, setOfferTermsAccepted] = useState(false);
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleSurface(surface: string) {
    setInterestedSurfaces((current) =>
      current.includes(surface) ? current.filter((value) => value !== surface) : [...current, surface],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

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
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--marketing-muted)] transition hover:text-[color:var(--marketing-ink)]"
          >
            <ArrowLeft size={15} /> Back home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1120px] px-5 py-14 sm:px-8 sm:py-20">
        <section className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <div className="marketing-eyebrow">Limited Early Access</div>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
              Help shape ProFixIQ — and save 30% for 6 months.
            </h1>
            <p className="mt-5 text-base leading-7 text-[color:var(--marketing-muted)] sm:text-lg">
              We&apos;re opening ProFixIQ to a limited group of automotive, heavy-duty, fleet, and field-service
              operations before the wider launch. Early Access is for shops willing to use the product in real
              workflows and tell us what works, what doesn&apos;t, and what should improve.
            </p>

            <div className="mt-8 rounded-2xl border border-blue-500/20 bg-blue-50/70 p-5">
              <div className="flex items-center gap-2 font-bold text-blue-950">
                <BadgePercent className="h-5 w-5 text-blue-600" /> Early Access offer
              </div>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-blue-950/80">
                <li>• 7-day free trial first.</li>
                <li>• 30% off the ProFixIQ base subscription for the next 6 paid months.</li>
                <li>• Direct product feedback channel and earlier access to selected workflows.</li>
                <li>• Standard pricing begins automatically after the 6 discounted paid months.</li>
              </ul>
              <p className="mt-4 text-xs leading-5 text-blue-950/60">
                Early Access is application-based and limited. Premium add-ons and separately metered usage are not
                included in the 30% base-subscription discount.
              </p>
            </div>

            <div className="mt-6 grid gap-3 text-sm text-[color:var(--marketing-muted)] sm:grid-cols-2 lg:grid-cols-1">
              {[
                "Automotive repair shops",
                "Heavy-duty / diesel operations",
                "Fleet maintenance teams",
                "Mobile / field-service operations",
              ].map((label) => (
                <div key={label} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {label}
                </div>
              ))}
            </div>
          </div>

          <div>
            {submitted ? (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-50 p-7 shadow-[0_24px_60px_rgba(23,32,42,0.06)]">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                <h2 className="mt-4 text-2xl font-bold text-emerald-950">Application received</h2>
                <p className="mt-2 leading-7 text-emerald-900/80">
                  Thanks, {fullName.split(" ")[0] || "there"}. We&apos;ll review your operation and contact you at
                  {" "}<strong>{email}</strong> if there&apos;s a fit for this Early Access group.
                </p>
                <p className="mt-3 text-sm leading-6 text-emerald-900/70">
                  Applying does not create a subscription or charge anything. If accepted, you&apos;ll receive the
                  Early Access signup path before billing begins.
                </p>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="space-y-6 rounded-2xl border border-[color:var(--marketing-border)] bg-white p-6 shadow-[0_24px_60px_rgba(23,32,42,0.08)] sm:p-8"
              >
                <div>
                  <h2 className="text-2xl font-bold tracking-[-0.025em]">Apply for Early Access</h2>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--marketing-muted)]">
                    A few practical questions help us choose operations that can give useful real-world feedback.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-[color:var(--marketing-muted)]">
                    Your name
                    <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} autoComplete="name" />
                  </label>
                  <label className="text-xs font-semibold text-[color:var(--marketing-muted)]">
                    Work email
                    <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} autoComplete="email" />
                  </label>
                  <label className="text-xs font-semibold text-[color:var(--marketing-muted)]">
                    Phone (optional)
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} autoComplete="tel" />
                  </label>
                  <label className="text-xs font-semibold text-[color:var(--marketing-muted)]">
                    Shop / company name
                    <input required value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={inputClass} autoComplete="organization" />
                  </label>
                  <label className="text-xs font-semibold text-[color:var(--marketing-muted)] sm:col-span-2">
                    City / region
                    <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} placeholder="Calgary, Alberta" />
                  </label>
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
                  <label className="text-xs font-semibold text-[color:var(--marketing-muted)]">
                    Number of locations
                    <input required type="number" min={1} max={500} value={locationCount} onChange={(e) => setLocationCount(e.target.value)} className={inputClass} />
                  </label>
                  <label className="text-xs font-semibold text-[color:var(--marketing-muted)]">
                    Technicians / mechanics
                    <input type="number" min={0} value={technicianCount} onChange={(e) => setTechnicianCount(e.target.value)} className={inputClass} />
                  </label>
                  <label className="text-xs font-semibold text-[color:var(--marketing-muted)]">
                    Total expected users
                    <input type="number" min={1} value={teamSize} onChange={(e) => setTeamSize(e.target.value)} className={inputClass} />
                  </label>
                  {(operationType === "fleet" || operationType === "mixed") && (
                    <label className="text-xs font-semibold text-[color:var(--marketing-muted)] sm:col-span-2">
                      Approximate fleet assets
                      <input type="number" min={0} value={fleetAssetCount} onChange={(e) => setFleetAssetCount(e.target.value)} className={inputClass} />
                    </label>
                  )}
                </div>

                <label className="block text-xs font-semibold text-[color:var(--marketing-muted)]">
                  What software do you use today? (optional)
                  <input value={currentSoftware} onChange={(e) => setCurrentSoftware(e.target.value)} className={inputClass} placeholder="Fullbay, Shopmonkey, PBS, spreadsheets, paper…" />
                </label>

                <label className="block text-xs font-semibold text-[color:var(--marketing-muted)]">
                  What is the biggest workflow problem you want ProFixIQ to solve?
                  <textarea required rows={4} value={primaryChallenge} onChange={(e) => setPrimaryChallenge(e.target.value)} className={inputClass} placeholder="Tell us where time, communication, approvals, inspections, parts, or fleet workflow breaks down today." />
                </label>

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
                  <label className="flex items-start gap-3">
                    <input required type="checkbox" checked={feedbackCommitment} onChange={(e) => setFeedbackCommitment(e.target.checked)} className="mt-1 h-4 w-4" />
                    <span>I&apos;m willing to actively use ProFixIQ and provide practical product feedback during Early Access.</span>
                  </label>
                  <label className="flex items-start gap-3">
                    <input required type="checkbox" checked={offerTermsAccepted} onChange={(e) => setOfferTermsAccepted(e.target.checked)} className="mt-1 h-4 w-4" />
                    <span>I understand acceptance is not guaranteed; if accepted, the offer is 7 days free followed by 30% off the base subscription for 6 paid months, then standard pricing.</span>
                  </label>
                </div>

                <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden">
                  <label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
                </div>

                {error ? (
                  <p className="flex items-center gap-2 text-xs font-semibold text-red-600">
                    <ShieldAlert className="h-3.5 w-3.5" /> {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-xl bg-[color:var(--marketing-copper)] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[color:var(--marketing-copper-dark)] disabled:opacity-60"
                >
                  {submitting ? "Submitting…" : "Apply for Early Access"}
                </button>
                <p className="text-center text-xs leading-5 text-[color:var(--marketing-muted)]">
                  No payment is collected by this application.
                </p>
              </form>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
