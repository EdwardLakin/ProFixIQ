// features/auth/app/signup/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default function SignUpPage() {
  const supabase = createClientComponentClient<Database>();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill email from Stripe Checkout session if present
  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (!sessionId) return;

    const fetchEmail = async () => {
      try {
        const res = await fetch(`/api/stripe/session?session_id=${sessionId}`);
        const data = await res.json();
        if (data?.email) setEmail(data.email);
      } catch (e) {
        console.error("Failed to prefill email from Stripe:", e);
      }
    };

    void fetchEmail();
  }, [searchParams]);

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSent(false);
    setSending(true);

    try {
      const emailRedirectTo =
        (typeof window !== "undefined" ? window.location.origin : "") +
        "/confirm";

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          // This is where the magic-link will land
          emailRedirectTo,
        },
      });

      if (otpError) {
        setError(otpError.message);
        setSending(false);
        return;
      }

      setSent(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <form
        onSubmit={handleSendMagicLink}
        className="w-full max-w-md rounded-xl border border-white/10 bg-neutral-900/60 backdrop-blur p-6 shadow-md"
      >
        <h1
          className="text-3xl mb-2"
          style={{ fontFamily: "var(--font-blackops)" }}
        >
          Create Your Account
        </h1>
        <p className="text-sm text-neutral-300 mb-6">
          Enter your email and we’ll send you a sign-in link. After confirming,
          we’ll take you to onboarding.
        </p>

        <label className="block text-sm text-neutral-300 mb-1">Email</label>
        <input
          type="email"
          required
          value={email}
          placeholder="you@example.com"
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded bg-neutral-800 border border-neutral-700 px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-orange-500"
        />

        <button
          type="submit"
          disabled={sending || !email}
          className="w-full bg-orange-500 hover:bg-orange-600 text-black font-semibold rounded px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? "Sending magic link…" : "Send magic link"}
        </button>

        {sent && (
          <p className="mt-3 text-green-400 text-sm">
            Magic link sent! Check your email to continue.
          </p>
        )}
        {error && (
          <p className="mt-3 text-red-400 text-sm">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}