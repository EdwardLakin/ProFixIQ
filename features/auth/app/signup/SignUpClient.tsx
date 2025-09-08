// features/auth/components/SignUpClient.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default function SignUpClient() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();
  const sp = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  // ✅ Magic link goes to /confirm (then middleware/confirm page can route further)
  const emailRedirectTo = useMemo(() => {
    const base =
      (typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_SITE_URL) || "https://profixiq.com";
    return `${base.replace(/\/$/, "")}/confirm`;
  }, []);

  // Prefill from Stripe if present
  useEffect(() => {
    const sid = sp.get("session_id");
    if (!sid) return;
    (async () => {
      try {
        const res = await fetch(`/api/stripe/session?session_id=${sid}`);
        const data = await res.json();
        if (data?.email) setEmail(data.email);
      } catch {
        /* ignore */
      }
    })();
  }, [sp]);

  // Already signed in? go to /dashboard (middleware handles onboarding)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) router.replace("/dashboard");
    })();
  }, [router, supabase]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // If email confirmation is required, there won't be a session yet
    if (!data.session) {
      setNotice(
        "Check your email to confirm your account. After confirming, we’ll take you to your dashboard."
      );
      setLoading(false);
      return;
    }

    // Session exists (e.g., email confirm disabled) → go to dashboard
    router.refresh();
    router.replace("/dashboard");
    setLoading(false);
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
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-2 px-4 rounded"
        >
          {loading ? "Creating Account..." : "Sign Up"}
        </button>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        {notice && <p className="text-green-400 text-sm">{notice}</p>}
      </form>
    </div>
  );
}