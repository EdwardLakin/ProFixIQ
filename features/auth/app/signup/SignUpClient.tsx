"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default function SignUpClient() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Where should the magic link redirect?
  const emailRedirectTo = useMemo(() => {
    const base =
      process.env.NEXT_PUBLIC_SITE_URL ??
      (typeof window !== "undefined" ? window.location.origin : "");
    return `${base.replace(/\/$/, "")}/confirm`;
  }, []);

  // Prefill email if we came from Stripe or a redirect
  useEffect(() => {
    const fromQuery = searchParams.get("email");
    if (fromQuery) setEmail(fromQuery);

    const sid = searchParams.get("session_id");
    if (!sid) return;
    (async () => {
      try {
        const res = await fetch(`/api/stripe/session?session_id=${sid}`);
        const data = await res.json();
        if (data?.email) setEmail(data.email);
      } catch (e) {
        console.error("[signup] prefill from stripe failed", e);
      }
    })();
  }, [searchParams]);

  // If already signed in, go to onboarding
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) router.replace("/onboarding");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    // Normal sign up
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo },
    });

    if (!signUpError) {
      // Success → let confirm page handle the magic-link callback / role routing
      setSubmitting(false);
      router.replace("/confirm");
      return;
    }

    // ── SAFETY: user may have already signed up ───────────────────────────────
    const msg = (signUpError.message || "").toLowerCase();
    const looksLikeAlreadyExists =
      msg.includes("already registered") ||
      msg.includes("already exists") ||
      signUpError.status === 422;

    if (looksLikeAlreadyExists) {
      // Try to resend the signup confirmation (non-blocking)
      try {
        // supabase-js v2: resend a confirmation email
        // @ts-ignore - some versions don't expose type on the client package
        await supabase.auth.resend({
          type: "signup",
          email,
          options: { emailRedirectTo },
        });
      } catch (err) {
        console.warn("[signup] resend failed:", err);
      }

      // Then push to sign-in with a hint so the user can finish
      setSubmitting(false);
      const params = new URLSearchParams({
        email,
        notice:
          "We found an existing signup. Check your inbox for a new confirmation link, or sign in if you already confirmed.",
      });
      router.replace(`/sign-in?${params.toString()}`);
      return;
    }

    // Any other error
    setSubmitting(false);
    setError(signUpError.message);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-4 font-blackops">
      <h1 className="text-3xl mb-6 text-orange-500">Create Account</h1>
      <form onSubmit={handleSignUp} className="w-full max-w-md space-y-4">
        <input
          type="email"
          placeholder="Email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-2 rounded bg-gray-900 border border-orange-500"
        />
        <input
          type="password"
          placeholder="Password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-2 rounded bg-gray-900 border border-orange-500"
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-2 px-4 rounded"
        >
          {submitting ? "Creating Account..." : "Sign Up"}
        </button>
        {error && <p className="text-red-500 text-sm">{error}</p>}
      </form>
    </div>
  );
}