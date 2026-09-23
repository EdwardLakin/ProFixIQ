"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ShieldAlert } from "lucide-react";
import Footer from "@shared/components/ui/Footer";
import { ProFixIQMark, ProFixIQWordmark } from "@shared/components/brand/ProFixIQBrand";

export default function RequestDemoAccess() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [message, setMessage] = useState("");
  // Honeypot: kept off-screen and out of the tab order. A human never sees
  // or fills this in; a bot filling every field will trip it.
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/public/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, companyName, message, website }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Something went wrong. Please try again.");
      }
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
            <span>
              <ProFixIQWordmark className="block text-xl text-[color:var(--marketing-ink)]" />
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--marketing-muted)] transition hover:text-[color:var(--marketing-ink)]"
          >
            <ArrowLeft size={15} /> Back home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[720px] px-5 py-16 sm:px-8 sm:py-24">
        <div className="marketing-eyebrow">Demo Shop</div>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Request demo access</h1>
        <p className="mt-4 text-base leading-7 text-[color:var(--marketing-muted)]">
          Tell us a bit about your shop and we&apos;ll set you up with a temporary owner login to a fully
          seeded demo shop — real work orders, inspections, parts, and approvals, ready to explore. We review
          every request personally, so it&apos;s not instant, but we&apos;ll follow up quickly.
        </p>

        {submitted ? (
          <div className="mt-10 flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-50 p-6">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-bold text-emerald-900">Request received</p>
              <p className="mt-1 text-sm leading-6 text-emerald-800">
                Thanks, {fullName.split(" ")[0] || "there"} — we&apos;ll review your request and email your
                login details soon.
              </p>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-10 space-y-4 rounded-2xl border border-[color:var(--marketing-border)] bg-white p-6 shadow-[0_24px_60px_rgba(23,32,42,0.08)] sm:p-8"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-[color:var(--marketing-muted)]">
                Your name
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[color:var(--marketing-border)] bg-white px-3.5 py-2.5 text-sm text-[color:var(--marketing-ink)]"
                  placeholder="Jordan Ramirez"
                  autoComplete="name"
                />
              </label>
              <label className="text-xs font-semibold text-[color:var(--marketing-muted)]">
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[color:var(--marketing-border)] bg-white px-3.5 py-2.5 text-sm text-[color:var(--marketing-ink)]"
                  placeholder="jordan@example.com"
                  autoComplete="email"
                />
              </label>
            </div>
            <label className="block text-xs font-semibold text-[color:var(--marketing-muted)]">
              Shop or company name
              <input
                type="text"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[color:var(--marketing-border)] bg-white px-3.5 py-2.5 text-sm text-[color:var(--marketing-ink)]"
                placeholder="Ramirez Diesel & Fleet"
                autoComplete="organization"
              />
            </label>
            <label className="block text-xs font-semibold text-[color:var(--marketing-muted)]">
              What are you hoping to see? (optional)
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={3}
                className="mt-1.5 w-full rounded-xl border border-[color:var(--marketing-border)] bg-white px-3.5 py-2.5 text-sm text-[color:var(--marketing-ink)]"
                placeholder="e.g. inspections, parts workflow, fleet portal…"
              />
            </label>

            {/* Honeypot field -- visually and semantically hidden from real visitors. */}
            <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden">
              <label>
                Website
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                />
              </label>
            </div>

            {error ? (
              <p className="flex items-center gap-2 text-xs font-semibold text-red-600">
                <ShieldAlert className="h-3.5 w-3.5" />
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-[color:var(--marketing-copper)] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[color:var(--marketing-copper-dark)] disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Request demo access"}
            </button>
          </form>
        )}
      </main>

      <Footer />
    </div>
  );
}
