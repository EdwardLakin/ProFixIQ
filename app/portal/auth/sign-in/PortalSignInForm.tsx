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
    <div className="mx-auto flex max-w-md flex-col gap-6 rounded-2xl border border-neutral-800 bg-neutral-950/80 p-6 shadow-xl shadow-black/40">
      <header className="space-y-1 text-center">
        <h1 className="text-2xl font-blackops text-orange-400">
          Sign in to your portal
        </h1>
        <p className="text-sm text-neutral-400">
          Use the email and password you created when you signed up.
        </p>
      </header>

      <form onSubmit={handleSignIn} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-[0.14em] text-neutral-400">
            Email
          </label>
          <input
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input w-full"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-[0.14em] text-neutral-400">
            Password
          </label>
          <input
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input w-full"
            required
          />
        </div>

        {error && (
          <p className="rounded border border-red-600/50 bg-red-900/30 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn mt-2 w-full justify-center bg-orange-600 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </form>

      <div className="flex items-center justify-between text-xs text-neutral-400">
        <span>Need an account?</span>
        <Link
          href="/portal/signup"
          className="font-medium text-orange-400 hover:text-orange-300"
        >
          Sign up
        </Link>
      </div>
    </div>
  );
}