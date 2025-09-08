// features/auth/components/Signin.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type Mode = "sign-in" | "sign-up";

export default function AuthPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = createClientComponentClient<Database>();

  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>("");
  const [notice, setNotice] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // Where magic links land
  const emailRedirectTo = useMemo(() => {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
    return `${origin || "https://profixiq.com"}/onboarding`;
  }, []);

  // If already signed in, send away from /sign-in immediately
  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("completed_onboarding")
        .eq("id", session.user.id)
        .maybeSingle();

      router.replace(profile?.completed_onboarding ? "/dashboard" : "/onboarding");
    })();
  }, [router, supabase]);

  const goHome = async () => {
    // Give middleware a chance to see the new cookie/session
    await router.replace("/dashboard");
    router.refresh();
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInErr) {
      console.error("[signIn] error:", signInErr);
      setError(signInErr.message || "Sign in failed.");
      setLoading(false);
      return;
    }

    // Confirm session exists on the client
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Signed in, but no session is visible yet. Try again.");
      setLoading(false);
      return;
    }

    // Optional: look up onboarding state here (middleware also guards this)
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("completed_onboarding")
      .eq("id", user.id)
      .maybeSingle();

    if (profErr) {
      console.warn("[profile lookup] warning:", profErr);
    }

    // Respect ?redirect=/foo if present and user finished onboarding
    const redirect = sp.get("redirect");
    if (redirect && profile?.completed_onboarding) {
      await router.replace(redirect);
      router.refresh();
    } else {
      await goHome();
    }

    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    const { data, error: signUpErr } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo },
    });

    if (signUpErr) {
      console.error("[signUp] error:", signUpErr);
      setError(signUpErr.message || "Sign up failed.");
      setLoading(false);
      return;
    }

    // If email confirmation is required, there won’t be a session yet
    if (!data.session) {
      setNotice("Check your inbox to confirm your email. We’ll take you to onboarding after that.");
      setLoading(false);
      return;
    }

    await router.replace("/onboarding");
    router.refresh();
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-black text-white">
      <div className="max-w-md w-full space-y-6 border border-orange-500 p-8 rounded-xl bg-black/30 backdrop-blur">
        <h1 className="text-4xl text-center font-blackops text-orange-500">
          {mode === "sign-in" ? "Sign In" : "Create your Account"}
        </h1>

        <div className="flex justify-center gap-4 text-sm">
          <button
            className={`px-3 py-1 rounded ${mode === "sign-in" ? "bg-orange-500 text-black" : "bg-neutral-800 text-neutral-300"}`}
            onClick={() => setMode("sign-in")}
            disabled={loading}
          >
            Sign In
          </button>
          <button
            className={`px-3 py-1 rounded ${mode === "sign-up" ? "bg-orange-500 text-black" : "bg-neutral-800 text-neutral-300"}`}
            onClick={() => setMode("sign-up")}
            disabled={loading}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={mode === "sign-in" ? handleSignIn : handleSignUp} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-2 rounded bg-gray-900 border border-orange-500"
            required
          />
          <input
            type="password"
            placeholder="Password"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2 rounded bg-gray-900 border border-orange-500"
            required
            minLength={6}
          />

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          {notice && <p className="text-green-400 text-sm text-center">{notice}</p>}

          <button
            type="submit"
            className="w-full py-2 rounded bg-orange-500 hover:bg-orange-600 font-blackops text-lg transition-all disabled:opacity-60"
            disabled={loading}
          >
            {loading
              ? mode === "sign-in"
                ? "Signing in…"
                : "Creating account…"
              : mode === "sign-in"
              ? "Sign In"
              : "Sign Up"}
          </button>
        </form>

        <div className="text-center text-xs text-neutral-400">
          <p>
            By continuing you agree to our{" "}
            <a href="/terms" className="text-orange-400 hover:underline">Terms</a> and{" "}
            <a href="/privacy" className="text-orange-400 hover:underline">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  );
}