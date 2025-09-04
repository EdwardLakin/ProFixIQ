"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default function PortalSignUpPage() {
  const router = useRouter();
  const supabase = createClientComponentClient<Database>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const emailRedirectTo = useMemo(() => {
    const base =
      (typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL) ||
      "https://profixiq.com";
    return `${base.replace(/\/$/, "")}/portal/confirm`;
  }, []);

  // If already signed in, go to profile
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) router.replace("/portal/profile");
    })();
  }, [router, supabase]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);

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

    if (!data.session) {
      setNotice("Check your email for a confirmation link to finish creating your account.");
      setLoading(false);
      return;
    }

    router.replace("/portal/profile");
  };

  return (
    <main className="min-h-screen grid place-items-center bg-black text-white px-4">
      <div className="w-full max-w-md space-y-4 border border-white/10 rounded-xl p-6 bg-white/5">
        <h1 className="text-2xl font-semibold text-center">Customer Portal – Sign Up</h1>
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
            autoComplete="new-password"
            minLength={6}
            required
            className="w-full rounded bg-black/40 border border-white/10 p-2"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {notice && <p className="text-green-400 text-sm">{notice}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-orange-500 hover:bg-orange-600 text-black font-semibold py-2 disabled:opacity-60"
          >
            {loading ? "Creating account…" : "Sign Up"}
          </button>
        </form>

        <p className="text-center text-sm text-white/70">
          Already have an account?{" "}
          <a href="/portal/auth/sign-in" className="text-orange-400 hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </main>
  );
}
