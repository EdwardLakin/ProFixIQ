"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, LockKeyhole, MailCheck, QrCode } from "lucide-react";
import AuthShell from "@/features/auth/components/AuthShell";
import AuthStatus from "@/features/auth/components/AuthStatus";

type Enrollment = {
  campaign: { name: string; allowBooking: boolean };
  shop: { name: string; logoUrl: string | null; primaryColor: string | null };
};

export default function PortalJoinPage() {
  const params = useParams<{ slug: string }>();
  const slug = String(params.slug ?? "");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/portal/enrollment/${encodeURIComponent(slug)}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as Enrollment | null;
      if (!cancelled) {
        if (response.ok && payload) setEnrollment(payload);
        else setError("This enrollment code is unavailable. Ask the shop for a new code.");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/portal/qr/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignSlug: slug, email }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!response.ok) setError(payload?.error || "Portal activation is temporarily unavailable.");
      else setMessage(payload?.message || "Check your email for the activation link.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      productLabel="Customer portal enrollment"
      heroTitle="Your service history. One scan away."
      heroDescription="Create secure portal access connected directly to the shop that services your vehicle."
      highlights={["Email verified", "Shop connected", "Private records"]}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">Customer portal</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[color:var(--theme-text-primary)]">
            {enrollment?.shop.name || "Activate portal access"}
          </h1>
        </div>
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[color:color-mix(in_srgb,var(--accent-copper)_13%,transparent)] text-[var(--accent-copper)]">
          <QrCode className="h-5 w-5" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-[color:var(--theme-text-secondary)]"><Loader2 className="h-4 w-4 animate-spin" /> Verifying this shop code…</div>
      ) : error ? (
        <AuthStatus tone="error">{error}</AuthStatus>
      ) : message ? (
        <div className="space-y-4">
          <AuthStatus tone="success">{message}</AuthStatus>
          <div className="flex gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
            <MailCheck className="h-5 w-5 shrink-0 text-[var(--accent-copper)]" />
            Open the one-time email, verify your account, and create your password. Your shop records will be linked automatically.
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm leading-6 text-[color:var(--theme-text-secondary)]">
            Enter the email you want to use. We’ll send a one-time activation link before any records are shown.
          </p>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="join-email" className="mb-1.5 block text-xs font-semibold text-[color:var(--theme-text-secondary)]">Email address</label>
              <input id="join-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3.5 py-3 text-sm text-[color:var(--theme-input-text)] outline-none focus:border-[var(--accent-copper)] focus:ring-4 focus:ring-[color:color-mix(in_srgb,var(--accent-copper)_16%,transparent)]" />
            </div>
            <button type="submit" disabled={submitting} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-copper)] px-4 py-3 text-sm font-bold text-[color:var(--theme-text-on-accent)] disabled:opacity-60">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />}
              {submitting ? "Sending activation…" : "Send secure activation"}
            </button>
          </form>
          <div className="mt-5 flex items-start gap-2 text-xs leading-5 text-[color:var(--theme-text-muted)]">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
            For privacy, the response is the same whether this email is new or already known to the shop.
          </div>
        </>
      )}
    </AuthShell>
  );
}
