"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

// same synthetic-username domain as portal sign-in
const SHOP_USER_DOMAIN = "local.profix-internal";

export default function MobileSignInPage() {
  const router = useRouter();
  const supabase = createClientComponentClient<DB>();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // If already signed in, gate by onboarding before letting them into mobile
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

      const hasShop = !!profile?.shop_id;
      const isOnboarded = !!profile?.completed_onboarding || hasShop;

      if (!isOnboarded) {
        router.replace("/onboarding");
        return;
      }

      router.replace("/mobile/dashboard");
    })();
  }, [router, supabase]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const raw = identifier.trim();
    let emailToUse = raw;

    // username → synthetic email (same behavior as main sign-in)
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

    if (!isOnboarded) {
      // must finish setup in the full portal first
      router.replace("/onboarding");
    } else {
      // ✅ fully onboarded → go straight to mobile companion
      router.replace("/mobile/dashboard");
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-neutral-950 to-black px-4 text-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center">
        <div className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/90 p-6 shadow-xl shadow-black/40 sm:p-8">
          {/* Brand / title */}
          <div className="mb-6 space-y-2 text-center">
            <div className="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-neutral-400">
              ProFixIQ Mobile Companion
            </div>
            <h1 className="mt-2 text-3xl font-blackops text-orange-500 sm:text-4xl">
              Sign in
            </h1>
            <p className="text-xs text-neutral-400 sm:text-sm">
              Use your shop username or email. Only onboarded users can use the
              mobile companion.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-3 rounded-lg border border-red-500/60 bg-red-950/60 px-3 py-2 text-xs text-red-100">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-1 text-sm">
              <label className="block text-xs font-medium text-neutral-300">
                Email or username
              </label>
              <input
                type="text"
                placeholder="jane@shop.com or shop username"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-0"
                required
              />
              <p className="text-[11px] text-neutral-500">
                Shop accounts can sign in using the username provided by your
                admin.
              </p>
            </div>

            <div className="space-y-1 text-sm">
              <label className="block text-xs font-medium text-neutral-300">
                Password
              </label>
              <input
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
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
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {/* Link back to full portal sign-in */}
          <div className="mt-4 text-center text-[11px] text-neutral-500">
            Need the full desktop portal?{" "}
            <button
              type="button"
              onClick={() => router.push("/sign-in")}
              className="font-medium text-orange-400 hover:text-orange-300 hover:underline"
            >
              Open portal sign in
            </button>
          </div>

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