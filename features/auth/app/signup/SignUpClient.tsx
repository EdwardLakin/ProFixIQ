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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");
  const [info, setInfo] = useState<string>("");

  // Where should the Supabase magic link land after email confirmation?
  const emailRedirectTo = useMemo(() => {
    // Prefer a configured origin; fall back to current
    const base =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      (typeof window !== "undefined" ? window.location.origin : "");
    return `${base}/confirm`;
  }, []);

  // Prefill from Stripe Checkout session (if present)
  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (!sessionId) return;

    (async () => {
      try {
        const res = await fetch(`/api/stripe/session?session_id=${sessionId}`);
        const data = await res.json();
        if (data?.email) setEmail(data.email as string);
      } catch (e) {
        console.error("[signup] stripe prefill failed:", e);
      }
    })();
  }, [searchParams]);

  // If already signed in, go to onboarding
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        router.replace("/onboarding");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setSubmitting(true);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo },
      });

      if (signUpError) {
        // Helpful copy for common cases
        if (
          signUpError.message.toLowerCase().includes("already registered") ||
          signUpError.message.toLowerCase().includes("user already exists")
        ) {
          setError(
            "That email is already registered. Try signing in, or use the magic link from your inbox."
          );
        } else {
          setError(signUpError.message);
        }
        return;
      }

      // If email confirmations are ON (recommended), Supabase returns no session.
      // Tell the user to check their inbox.
      if (!data.session) {
        setInfo(
          "We’ve sent a confirmation email. Open it and click the link to finish setting up your account."
        );
        return;
      }

      // If confirmations are OFF, we already have a session → continue.
      router.replace("/onboarding");
    } catch (err) {
      console.error("[signup] unexpected error:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
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
        />

        <input
          type="password"
          placeholder="Password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-2 rounded bg-gray-900 border border-orange-500"
        />

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-2 px-4 rounded disabled:opacity-60"
        >
          {submitting ? "Creating Account…" : "Sign Up"}
        </button>

        {!!error && <p className="text-red-500 text-sm">{error}</p>}
        {!!info && <p className="text-green-400 text-sm">{info}</p>}
      </form>

      {/* Simple link for users who actually had an account */}
      <p className="mt-4 text-neutral-400 text-sm">
        Already have an account?{" "}
        <a href="/sign-in" className="text-orange-400 underline">
          Sign in
        </a>
      </p>
    </div>
  );
}