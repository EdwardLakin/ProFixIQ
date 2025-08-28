// features/auth/app/signup/SignUpClient.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
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
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  // Where Supabase should send the user after they click the magic link
  const emailRedirectTo = useMemo(() => {
    const base =
      (typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_SITE_URL) || "https://profixiq.com";
    return `${base.replace(/\/$/, "")}/confirm`;
  }, []);

  // Prefill email from Stripe session (optional)
  useEffect(() => {
    const sid = searchParams.get("session_id");
    if (!sid) return;

    (async () => {
      try {
        const res = await fetch(`/api/stripe/session?session_id=${encodeURIComponent(sid)}`);
        const data = await res.json();
        if (data?.email) setEmail(data.email);
      } catch (e) {
        // non-blocking
        // eslint-disable-next-line no-console
        console.error("[signup] prefill error", e);
      }
    })();
  }, [searchParams]);

  // If already signed in (maybe via magic link in another tab), push to /confirm
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) router.replace("/confirm");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);

    // Safety: if account already exists, redirect to sign-in instead of failing hard
    // We try signUp first; if Supabase says "already registered", send the user to sign-in.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo },
    });

    if (signUpError) {
      const msg = signUpError.message || "";
      const normalized = msg.toLowerCase();

      // common Supabase messages:
      // - "User already registered"
      // - "Email rate limit exceeded" (show nicer text)
      if (normalized.includes("already") && normalized.includes("registered")) {
        setNotice("Looks like you already have an account. Please sign in.");
        // give the user a moment to see the message, then go to sign-in with email prefilled
        setTimeout(() => {
          router.replace(`/sign-in?email=${encodeURIComponent(email)}`);
        }, 800);
        setLoading(false);
        return;
      }

      if (normalized.includes("rate") && normalized.includes("limit")) {
        setError("We’re sending too many emails right now. Please try again in a couple minutes.");
      } else {
        setError(msg || "Sign up failed. Please try again.");
      }
      setLoading(false);
      return;
    }

    // If email confirmation is required, there won't be a session yet.
    if (!data.session) {
      setNotice(
        "Check your email to confirm your account. After confirming, we’ll take you to onboarding."
      );
      // Optionally take them to /confirm so it can poll/exchange auth code when they return
      setTimeout(() => router.replace("/confirm"), 600);
      setLoading(false);
      return;
    }

    // If confirmation is disabled (session exists immediately), proceed straight to onboarding.
    setLoading(false);
    router.replace("/onboarding");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-4 font-blackops">
      <h1 className="text-3xl mb-6 text-orange-500">Create Account</h1>
      <form onSubmit={handleSignUp} className="w-full max-w-md space-y-4">
        <input
          type="email"
          placeholder="Email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-2 rounded bg-gray-900 border border-orange-500"
          autoComplete="email"
        />
        <input
          type="password"
          placeholder="Password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-2 rounded bg-gray-900 border border-orange-500"
          autoComplete="new-password"
          minLength={6}
        />

        {error && <p className="text-red-500 text-sm">{error}</p>}
        {notice && <p className="text-green-400 text-sm">{notice}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-2 px-4 rounded"
        >
          {loading ? "Creating Account..." : "Sign Up"}
        </button>

        {/* Optional: show the session id for debugging */}
        {searchParams.get("session_id") && (
          <p className="text-xs text-neutral-400 mt-2">
            Checkout session: <span className="font-mono">{searchParams.get("session_id")}</span>
          </p>
        )}
      </form>
    </div>
  );
}