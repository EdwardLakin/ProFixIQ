// app/signup/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default function SignUpPage() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();
  const sp = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sessionId = sp.get("session_id");

  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://profixiq.com";

  // Prefill email if we arrived from Stripe Checkout
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!sessionId) return;

      try {
        const res = await fetch(`/api/stripe/session?session_id=${encodeURIComponent(sessionId)}`);
        const data = await res.json();
        if (!cancelled && data?.email && !email) {
          setEmail(data.email);
        }
      } catch (e) {
        // optional, remove if you don't have this route
        fetch("/api/diag/log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ where: "signup prefill", error: String(e) }),
        }).catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // If already signed in, bounce to /confirm so role router can take over
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) router.replace("/confirm");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSubmit = useMemo(() => {
    return !!email && !!password && !submitting;
  }, [email, password, submitting]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);

    try {
      const { error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    emailRedirectTo: `${origin}/confirm`, // or your computed emailRedirectTo
  },
});

      if (error) {
        setErr(error.message);
        return;
      }

      // Optional: log for debugging
      fetch("/api/diag/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          where: "signup submit",
          note: "signup success, redirecting to /confirm to await magic link",
        }),
      }).catch(() => {});

      // Take the user to the confirm page where we do code exchange / role routing
      router.replace("/confirm");
    } catch (e: any) {
      setErr(e?.message ?? "Unexpected error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white grid place-items-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-4 bg-zinc-900/70 border border-zinc-800 rounded-lg p-6"
      >
        <h1 className="text-2xl font-semibold text-orange-500">Create your account</h1>

        <label className="block">
          <span className="text-sm text-zinc-300">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded bg-zinc-950 border border-zinc-700 p-2 outline-none focus:border-orange-500"
            placeholder="you@company.com"
          />
        </label>

        <label className="block">
          <span className="text-sm text-zinc-300">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded bg-zinc-950 border border-zinc-700 p-2 outline-none focus:border-orange-500"
            placeholder="••••••••"
          />
        </label>

        {err && <p className="text-sm text-red-400">{err}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold py-2"
        >
          {submitting ? "Creating account…" : "Sign Up"}
        </button>

        {sessionId && (
          <p className="text-xs text-zinc-400">
            Prefilled from checkout session: <span className="font-mono">{sessionId}</span>
          </p>
        )}
      </form>
    </main>
  );
}