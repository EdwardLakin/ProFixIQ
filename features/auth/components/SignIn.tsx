"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

type Mode = "sign-in" | "sign-up";

const STAFF_HOME: Record<string, string> = {
  owner: "/dashboard/owner",
  admin: "/dashboard/admin",
  manager: "/dashboard/manager",
  advisor: "/dashboard/advisor",
  parts: "/dashboard/parts",
  mechanic: "/dashboard/tech",
  tech: "/dashboard/tech",
};

export default function AuthPage() {
  const router = useRouter();
  const params = useSearchParams();

  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState(params.get("email") || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  // Optional redirect (used for customers only after sign-in)
  const redirectParam = params.get("redirect") || "/portal";

  useEffect(() => {
    // If the user is already signed in (e.g., returning from Stripe), route immediately
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();

      const role = profile?.role ?? "customer";
      if (role in STAFF_HOME) router.replace(STAFF_HOME[role]);
      else router.replace(redirectParam || "/portal");
    })();
  }, [router, redirectParam]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Route by role
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("No user in session.");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = profile?.role ?? "customer";
    if (role in STAFF_HOME) router.replace(STAFF_HOME[role]);
    else router.replace(redirectParam || "/portal");

    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    const emailRedirectTo = `${window.location.origin}/auth/callback`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // If email confirm is required, there will be no session here.
    if (!data.session) {
      setNotice("Check your email to confirm your account. After confirming, we'll take you to onboarding.");
      setLoading(false);
      return;
    }

    // If confirmation is disabled and session exists immediately, we still want onboarding
    router.replace("/onboarding/profile");
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-background">
      <div className="max-w-md w-full space-y-6 border border-orange-500 p-8 rounded-xl backdrop-blur-md bg-black/30">
        <h1 className="text-4xl text-center font-blackops text-orange-500">
          {mode === "sign-in" ? "Sign In" : "Create your Portal Account"}
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
            className="input"
            required
          />
          <input
            type="password"
            placeholder="Password"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
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
                ? "Signing In..."
                : "Creating Account..."
              : mode === "sign-in"
                ? "Sign In"
                : "Sign Up"}
          </button>
        </form>

        <div className="text-center text-xs text-neutral-400">
          <p>
            By continuing you agree to our{" "}
            <a href="/terms" className="text-orange-400 hover:underline">Terms</a>{" "}
            and{" "}
            <a href="/privacy" className="text-orange-400 hover:underline">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  );
}