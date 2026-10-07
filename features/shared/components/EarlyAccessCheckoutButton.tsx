"use client";

import { useState } from "react";
import { ArrowRight, ShieldAlert } from "lucide-react";

export default function EarlyAccessCheckoutButton({ token }: { token: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/public/early-access/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        setError(data.error ?? "Early Access checkout is unavailable.");
        setSubmitting(false);
        return;
      }
      window.location.assign(data.url);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Early Access checkout is unavailable.");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={submitting}
        onClick={startCheckout}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-5 py-3 text-sm font-black text-white transition hover:bg-sky-400 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
      >
        {submitting ? "Opening secure checkout…" : "Start my 7-day free trial"}
        {!submitting ? <ArrowRight className="h-4 w-4" /> : null}
      </button>
      {error ? (
        <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-red-300">
          <ShieldAlert className="h-3.5 w-3.5" /> {error}
        </p>
      ) : null}
    </div>
  );
}
