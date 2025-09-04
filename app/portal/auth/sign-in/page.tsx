"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default function PortalSignInPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = createClientComponentClient<Database>();

  const [email, setEmail] = useState(sp.get("email") || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Already signed in? go to profile
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) router.replace("/portal/profile");
    })();
  }, [router, supabase]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.refresh();
    router.replace("/portal/profile");
  };

  return (
    <main className="min-h-screen grid place-items-center bg-black text-white px-4">
      <div className="w-full max-w-md space-y-4 border border-white/10 rounded-xl p-6 bg-white/5">
        <h1 className="text-2xl font-semibold text-center">Customer Portal – Sign In</h1>
        <form onSubmit={onSubmit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            required
            className="w-full rounded bg-black/40 border border-white/10 p-2"
          />
          <input
            type="password"
            value={password}
            onChange={(e)=>setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            required
            className="w-full rounded bg-black/40 border border-white/10 p-2"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-orange-500 hover:bg-orange-600 text-black font-semibold py-2 disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="text-center text-sm text-white/70">
          New here?{" "}
          <a href="/portal/auth/sign-up" className="text-orange-400 hover:underline">
            Create an account
          </a>
        </p>
      </div>
    </main>
  );
}
