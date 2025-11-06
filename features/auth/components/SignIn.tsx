"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type Mode = "sign-in" | "sign-up";

// domain used by /api/admin/create-user
const SHOP_USER_DOMAIN = "local.profix-internal";

export default function AuthPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = createClientComponentClient<Database>();

  const [mode, setMode] = useState<Mode>("sign-in");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>("");
  const [notice, setNotice] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const origin = useMemo(() => {
    if (typeof window !== "undefined") return window.location.origin;
    if (process.env.NEXT_PUBLIC_SITE_URL)
      return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return "http://localhost:3000";
  }, []);

  const emailRedirectTo = useMemo(() => {
    const redirect = sp.get("redirect");
    const tail = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
    return `${origin}/auth/callback${tail}`;
  }, [origin, sp]);

  // helper: decide where to go based on profile
  const routeAfterAuth = async (
    profile: { completed_onboarding?: boolean | null; shop_id?: string | null } | null,
  ) => {
    const redirect = sp.get("redirect");
    const hasShop = !!profile?.shop_id;
    const isOnboarded = !!profile?.completed_onboarding || hasShop;

    if (redirect && isOnboarded) {
      router.replace(redirect);
      return;
    }

    if (isOnboarded) {
      router.replace("/dashboard");
    } else {
      router.replace("/onboarding");
    }
  };

  // If user is already signed in and visits /sign-in, kick them out
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session?.user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("completed_onboarding, shop_id")
        .eq("id", session.user.id)
        .maybeSingle();

      await routeAfterAuth(profile ?? null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = async (href: string) => {
    await supabase.auth.getSession();
    router.refresh();
    router.replace(href);
    setTimeout(() => {
      if (
        typeof window !== "undefined" &&
        window.location.pathname + window.location.search !== href
      ) {
        window.location.assign(href);
      }
    }, 60);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    const raw = identifier.trim();
    let emailToUse = raw;

    // shop-created username → synthetic email
    if (!raw.includes("@")) {
      emailToUse = `${raw.toLowerCase()}@${SHOP_USER_DOMAIN}`;
    }

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: emailToUse,
      password,
    });

    if (signInErr) {
      setError(signInErr.message || "Sign in failed.");
      setLoading(false);
      return;
    }

    // 🔴 important: refresh session so next profile read is up to date
    await supabase.auth.refreshSession();

    // fetch profile to decide where to go
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setError("Signed in, but no session is visible yet. Try again.");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("completed_onboarding, shop_id")
      .eq("id", u.user.id)
      .maybeSingle();

    const redirect = sp.get("redirect");
    const hasShop = !!profile?.shop_id;
    const isOnboarded = !!profile?.completed_onboarding || hasShop;

    if (redirect && isOnboarded) {
      await go(redirect);
    } else if (isOnboarded) {
      await go("/dashboard");
    } else {
      await go("/onboarding");
    }

    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    // normal email-based self-signup
    const { data, error: signUpErr } = await supabase.auth.signUp({
      email: identifier,
      password,
      options: { emailRedirectTo },
    });

    if (signUpErr) {
      setError(signUpErr.message || "Sign up failed.");
      setLoading(false);
      return;
    }

    if (!data.session) {
      setNotice("Check your inbox to confirm your email. We’ll continue after that.");
      setLoading(false);
      return;
    }

    await go("/onboarding");
    setLoading(false);
  };

  const isSignIn = mode === "sign-in";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-black text-white">
      <div className="max-w-md w-full space-y-6 border border-orange-500 p-8 rounded-xl bg-black/30 backdrop-blur">
        <h1 className="text-4xl text-center font-blackops text-orange-500">
          {isSignIn ? "Sign In" : "Create your Account"}
        </h1>

        <div className="flex justify-center gap-4 text-sm">
          <button
            className={`px-3 py-1 rounded ${
              isSignIn ? "bg-orange-500 text-black" : "bg-neutral-800 text-neutral-300"
            }`}
            onClick={() => setMode("sign-in")}
            disabled={loading}
          >
            Sign In
          </button>
          <button
            className={`px-3 py-1 rounded ${
              !isSignIn ? "bg-orange-500 text-black" : "bg-neutral-800 text-neutral-300"
            }`}
            onClick={() => setMode("sign-up")}
            disabled={loading}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={isSignIn ? handleSignIn : handleSignUp} className="space-y-4">
          <input
            type={isSignIn ? "text" : "email"}
            placeholder={isSignIn ? "Email or Username" : "Email"}
            autoComplete={isSignIn ? "username" : "email"}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="w-full p-2 rounded bg-gray-900 border border-orange-500"
            required
          />
          <input
            type="password"
            placeholder="Password"
            autoComplete={isSignIn ? "current-password" : "new-password"}
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
              ? isSignIn
                ? "Signing in…"
                : "Creating account…"
              : isSignIn
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