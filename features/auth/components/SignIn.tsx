"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type Mode = "sign-in" | "sign-up";

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

  // are we in "mobile companion" sign-in mode?
  const isMobileMode =
    (sp.get("mode") || "").toLowerCase() === "mobile" ||
    (sp.get("redirect") || "") === "/mobile";

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

  // where to go *after* auth, based on profile + mode
  const routeAfterAuth = async (
    profile: { completed_onboarding?: boolean | null; shop_id?: string | null } | null,
  ) => {
    const redirectParam = sp.get("redirect");
    const hasShop = !!profile?.shop_id;
    const isOnboarded = !!profile?.completed_onboarding || hasShop;

    // special case: mobile mode always wins if user is allowed in
    if (isMobileMode && isOnboarded) {
      router.replace("/mobile");
      return;
    }

    if (redirectParam && isOnboarded) {
      router.replace(redirectParam);
      return;
    }

    if (isOnboarded) {
      router.replace("/dashboard");
    } else {
      router.replace("/onboarding");
    }
  };

  // already signed in → kick out of sign-in
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

    await supabase.auth.refreshSession();

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

    const hasShop = !!profile?.shop_id;
    const isOnboarded = !!profile?.completed_onboarding || hasShop;

    // explicit handling for mobile mode
    if (isMobileMode && isOnboarded) {
      await go("/mobile");
    } else if (isOnboarded) {
      const redirectParam = sp.get("redirect");
      await go(redirectParam || "/dashboard");
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
    <div className="min-h-screen bg-gradient-to-b from-black via-neutral-950 to-black px-4 text-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center">
        <div className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/90 p-6 shadow-xl shadow-black/40 sm:p-8">
          {/* Brand / title */}
          <div className="mb-6 space-y-2 text-center">
            <div className="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-neutral-400">
              ProFixIQ Portal{isMobileMode ? " • Mobile" : ""}
            </div>
            <h1 className="mt-2 text-3xl font-blackops text-orange-500 sm:text-4xl">
              {isSignIn ? "Sign in" : "Create your account"}
            </h1>
            <p className="text-xs text-neutral-400 sm:text-sm">
              {isSignIn
                ? "Use your shop username or email to access your dashboard."
                : "Create an account with your email to get started."}
            </p>
          </div>

          {/* Mode switch */}
          <div className="mb-4 flex items-center justify-center">
            <div className="inline-flex rounded-full border border-neutral-800 bg-neutral-900 p-1 text-xs">
              <button
                type="button"
                className={`px-3 py-1 rounded-full transition ${
                  isSignIn
                    ? "bg-orange-500 text-black shadow-sm"
                    : "text-neutral-300 hover:text-white"
                }`}
                onClick={() => setMode("sign-in")}
                disabled={loading}
              >
                Sign in
              </button>
              <button
                type="button"
                className={`px-3 py-1 rounded-full transition ${
                  !isSignIn
                    ? "bg-orange-500 text-black shadow-sm"
                    : "text-neutral-300 hover:text-white"
                }`}
                onClick={() => setMode("sign-up")}
                disabled={loading}
              >
                Sign up
              </button>
            </div>
          </div>

          {/* Error / notice */}
          {error && (
            <div className="mb-3 rounded-lg border border-red-500/60 bg-red-950/60 px-3 py-2 text-xs text-red-100">
              {error}
            </div>
          )}
          {notice && (
            <div className="mb-3 rounded-lg border border-emerald-500/60 bg-emerald-950/60 px-3 py-2 text-xs text-emerald-100">
              {notice}
            </div>
          )}

          {/* Form */}
          <form
            onSubmit={isSignIn ? handleSignIn : handleSignUp}
            className="space-y-4"
          >
            <div className="space-y-1 text-sm">
              <label className="block text-xs font-medium text-neutral-300">
                {isSignIn ? "Email or username" : "Email"}
              </label>
              <input
                type={isSignIn ? "text" : "email"}
                placeholder={
                  isSignIn ? "jane@shop.com or shop username" : "you@example.com"
                }
                autoComplete={isSignIn ? "username" : "email"}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-0"
                required
              />
              {isSignIn && (
                <p className="text-[11px] text-neutral-500">
                  Shop accounts can sign in using the username provided by your admin.
                </p>
              )}
            </div>

            <div className="space-y-1 text-sm">
              <label className="block text-xs font-medium text-neutral-300">
                Password
              </label>
              <input
                type="password"
                placeholder="••••••••"
                autoComplete={isSignIn ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-0"
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              className="mt-2 w-full rounded-md bg-orange-500 py-2.5 text-center text-sm font-blackops text-black tracking-wide transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading}
            >
              {loading
                ? isSignIn
                  ? "Signing in…"
                  : "Creating account…"
                : isSignIn
                ? "Sign in"
                : "Sign up"}
            </button>
          </form>

          {/* Mobile companion link – just sets mode=mobile */}
          {isSignIn && !isMobileMode && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => router.push("/sign-in?mode=mobile")}
                className="text-[11px] font-medium text-orange-400 hover:text-orange-300 hover:underline underline-offset-2"
                disabled={loading}
              >
                Sign in to mobile companion
              </button>
              <p className="mt-1 text-[10px] text-neutral-500">
                Opens the tech-friendly mobile layout for phones and tablets.
              </p>
            </div>
          )}

          <div className="mt-6 text-center text-[11px] text-neutral-500">
            <p>
              By continuing you agree to our{" "}
              <a
                href="/terms"
                className="font-medium text-orange-400 hover:text-orange-300 hover:underline"
              >
                Terms
              </a>{" "}
              and{" "}
              <a
                href="/privacy"
                className="font-medium text-orange-400 hover:text-orange-300 hover:underline"
              >
                Privacy Policy
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}