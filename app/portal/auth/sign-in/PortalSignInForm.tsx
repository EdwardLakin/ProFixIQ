// app/portal/auth/sign-in/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

const COPPER = "#C57A4A";

export default function PortalSignInPage() {
  const router = useRouter();
  const supabase = createClientComponentClient<Database>();

  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (data?.user) router.replace("/portal/profile");
    })();

    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.replace("/portal/profile");
  };

  return (
    <div className="mx-auto max-w-lg">
      <div className="rounded-2xl border border-white/10 bg-black/25 p-5 backdrop-blur-md sm:p-6">
        <header className="space-y-2">
          <div
            className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em]"
            style={{ color: COPPER }}
          >
            Customer Portal
          </div>
          <h1 className="text-2xl font-blackops" style={{ color: COPPER }}>
            Sign in
          </h1>
          <p className="text-sm text-neutral-400">
            Use the email and password you created when you signed up.
          </p>
        </header>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-100">
            {error}
          </p>
        ) : null}

        <form onSubmit={handleSignIn} className="mt-5 space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-neutral-300">
              Email
            </label>
            <input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-neutral-500 outline-none focus:ring-2"
              style={{ boxShadow: "none" }}
              required
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-neutral-300">
              Password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-neutral-500 outline-none focus:ring-2"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-60"
          >
            <span style={{ color: COPPER }}>
              {loading ? "Signing in…" : "Sign in"}
            </span>
          </button>
        </form>

        <div className="mt-5 flex items-center justify-between text-sm text-neutral-400">
          <span>Need an account?</span>
          <Link href="/portal/auth/sign-up" className="font-semibold hover:underline" style={{ color: COPPER }}>
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}