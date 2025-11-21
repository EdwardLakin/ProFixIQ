"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default function PortalSignInPage() {
  const router = useRouter();
  const supabase = createClientComponentClient<Database>();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // If already signed in, bounce to profile
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) router.replace("/portal/profile");
    })();
  }, [router, supabase]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.replace("/portal/profile");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-neutral-950 to-black px-4 text-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center">
        <div className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/90 p-6 shadow-xl shadow-black/40 sm:p-8">
          {/* Header */}
          <header className="mb-6 space-y-2 text-center">
            <div className="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-neutral-400">
              Customer Portal
            </div>
            <h1 className="mt-2 text-3xl font-blackops text-orange-400 sm:text-4xl">
              Portal sign in
            </h1>
            <p className="text-xs text-neutral-400 sm:text-sm">
              Use the email and password you created when you signed up.
            </p>
          </header>

          {/* Error */}
          {error && (
            <p className="mb-3 rounded-lg border border-red-500/60 bg-red-950/60 px-3 py-2 text-xs text-red-100">
              {error}
            </p>
          )}

          {/* Form */}
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-1 text-sm">
              <label className="block text-xs font-medium text-neutral-300">
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-0"
                required
              />
            </div>

            <div className="space-y-1 text-sm">
              <label className="block text-xs font-medium text-neutral-300">
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-0"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-md bg-orange-500 py-2.5 text-center text-sm font-blackops text-black tracking-wide transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between text-[11px] text-neutral-500">
            <span>Need an account?</span>
            <Link
              href="/portal/signup"
              className="font-medium text-orange-400 hover:text-orange-300 hover:underline"
            >
              Sign up
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}