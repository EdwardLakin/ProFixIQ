// app/mobile/sign-in/page.tsx (FULL FILE REPLACEMENT)
// ✅ Adds "Forgot password?" that routes to /forgot-password (preserves ?redirect=...)
// ❗ No other behavior changes

"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { getAuthIdentifierStrategy } from "@/features/users/lib/username";
import { resolvePostAuthDestination } from "@/features/auth/lib/postAuthRouting";

export default function MobileSignInPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = createBrowserSupabase();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const goForgotPassword = () => {
    const redirect = sp.get("redirect");
    const tail = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
    router.push(`/forgot-password${tail}`);
  };

  // If already signed in, gate by onboarding before letting them into mobile
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session?.user) return;

      const destination = await resolvePostAuthDestination({
        supabase,
        searchParams: sp,
        isMobileMode: true,
      });
      router.replace(destination);
    })();
  }, [router, supabase]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const initialAuthIdentifier = getAuthIdentifierStrategy(identifier);
    let authEmail = initialAuthIdentifier.authEmail;

    try {
      const resolveRes = await fetch("/api/auth/resolve-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const resolvePayload = (await resolveRes.json().catch(() => null)) as
        | { authEmail?: string }
        | null;
      if (resolveRes.ok && resolvePayload?.authEmail) authEmail = resolvePayload.authEmail;
    } catch {
      // Fall back to local username/email normalization.
    }

    console.info("[auth/sign-in]", {
      inputKind: initialAuthIdentifier.inputKind,
      normalizedAuthEmail: authEmail,
    });

    const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password,
    });

    console.info("[auth/sign-in-result]", {
      inputKind: initialAuthIdentifier.inputKind,
      normalizedAuthEmail: authEmail,
      userId: signInData.user?.id ?? null,
      hasAccessToken: Boolean(signInData.session?.access_token),
      errorCode: signInErr?.status ?? null,
      errorMessage: signInErr?.message ?? null,
    });

    if (signInErr) {
      setError(signInErr.message || "Sign in failed.");
      setLoading(false);
      return;
    }

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setError("Signed in, but no session is visible yet. Try again.");
      setLoading(false);
      return;
    }

    const destination = await resolvePostAuthDestination({
      supabase,
      searchParams: sp,
      isMobileMode: true,
    });
    router.replace(destination);

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

            {/* Forgot password */}
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={goForgotPassword}
                disabled={loading}
                className="text-[11px] font-medium text-orange-400 hover:text-orange-300 hover:underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Forgot password?
              </button>
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