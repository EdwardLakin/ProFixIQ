// features/auth/components/Signin.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

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
  const supabase = createClientComponentClient<Database>();

  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  // For sign-up: where magic link should land
  const emailRedirectTo = useMemo(() => {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
    return `${origin || "https://profixiq.com"}/confirm`;
  }, []);

  // If already signed in, route by role/completed_onboarding
  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, completed_onboarding")
        .eq("id", session.user.id)
        .maybeSingle();

      const role = profile?.role ?? null;
      if (role && profile?.completed_onboarding) {
        router.replace(STAFF_HOME[role] ?? "/onboarding");
      } else {
        router.replace("/onboarding");
      }
    })();
  }, [router, supabase]);

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

    // Make sure middleware/server sees the new auth cookie
    router.refresh();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("No user in session.");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, completed_onboarding")
      .eq("id", user.id)
      .maybeSingle();

    const role = profile?.role ?? null;
    router.replace(
      role && profile?.completed_onboarding ? (STAFF_HOME[role] ?? "/onboarding") : "/onboarding",
    );
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

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

    // If email confirmation required, there won't be a session yet
    if (!data.session) {
      setNotice(
        "Check your inbox for a confirmation link. After confirming, we’ll take you to onboarding.",
      );
      setLoading(false);
      return;
    }

    router.refresh();
    router.replace("/onboarding");
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-black text-white">
      <div className="max-w-md w-full space-y-6 border border-orange-500 p-8 rounded-xl backdrop-blur-md bg-black/30">
        <h1 className="text-4xl text-center font-blackops text-orange-500">
          {mode === "sign-in" ? "Sign In" : "Create your Account"}
        </h1>

        <div className="flex justify-center gap-4 text-sm">
          <button
            className={`px-3 py-1 rounded ${
              mode === "sign-in" ? "bg-orange-500 text-black" : "bg-neutral-800 text-neutral-300"
            }`}
            onClick={() => setMode("sign-in")}
            disabled={loading}
          >
            Sign In
          </button>
          <button
            className={`px-3 py-1 rounded ${
              mode === "sign-up" ? "bg-orange-500 text-black" : "bg-neutral-800 text-neutral-300"
            }`}
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
            <a href="/terms" className="text-orange-400 hover:underline">
              Terms
            </a>{" "}
            and{" "}
            <a href="/privacy" className="text-orange-400 hover:underline">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}