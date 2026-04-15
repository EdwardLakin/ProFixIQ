// features/auth/components/SignUpClient.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default function SignUpClient() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();
  const sp = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const demoId = sp.get("demoId");
  const intakeId = sp.get("intakeId");

  const origin = useMemo(() => {
    if (typeof window !== "undefined") return window.location.origin;
    if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return "http://localhost:3000";
  }, []);

  const emailRedirectTo = useMemo(() => {
    const params = new URLSearchParams();

    const redirect = sp.get("redirect");
    const priceId = sp.get("priceId");
    const interval = sp.get("interval");
    const trial = sp.get("trial");
    const founding = sp.get("founding");
    const demoId = sp.get("demoId");
    const intakeId = sp.get("intakeId");

    if (redirect) params.set("redirect", redirect);
    if (priceId) params.set("priceId", priceId);
    if (interval) params.set("interval", interval);
    if (trial) params.set("trial", trial);
    if (founding) params.set("founding", founding);
    if (demoId) params.set("demoId", demoId);
    if (intakeId) params.set("intakeId", intakeId);

    const tail = params.toString();
    return `${origin}/confirm${tail ? `?${tail}` : ""}`;
  }, [origin, sp]);

  useEffect(() => {
    const sid = sp.get("session_id");
    if (!sid) return;
    void (async () => {
      try {
        const res = await fetch(`/api/stripe/session?session_id=${sid}`);
        const data = await res.json();
        if (data?.email) setEmail(data.email);
      } catch {
        // ignore
      }
    })();
  }, [sp]);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        const redirect = sp.get("redirect");
        const params = new URLSearchParams();

        const priceId = sp.get("priceId");
        const interval = sp.get("interval");
        const trial = sp.get("trial");
        const founding = sp.get("founding");
        const demoId = sp.get("demoId");
        const intakeId = sp.get("intakeId");

        if (priceId) params.set("priceId", priceId);
        if (interval) params.set("interval", interval);
        if (trial) params.set("trial", trial);
        if (founding) params.set("founding", founding);
        if (demoId) params.set("demoId", demoId);
        if (intakeId) params.set("intakeId", intakeId);

        const onboardingTarget = `/onboarding${params.toString() ? `?${params.toString()}` : ""}`;
        router.replace(redirect || onboardingTarget);
      }
    })();
  }, [router, sp, supabase]);

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

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo },
    });

    if (signUpError) {
      setError(signUpError.message || "Sign up failed.");
      setLoading(false);
      return;
    }

    if (!data.session) {
      setNotice(
        "Check your email to confirm your account. After confirmation, we’ll continue your selected plan and bring you straight into setup."
      );
      setLoading(false);
      return;
    }

    const redirect = sp.get("redirect");
    const params = new URLSearchParams();

    const priceId = sp.get("priceId");
    const interval = sp.get("interval");
    const trial = sp.get("trial");
    const founding = sp.get("founding");
    const demoId = sp.get("demoId");
    const intakeId = sp.get("intakeId");

    if (priceId) params.set("priceId", priceId);
    if (interval) params.set("interval", interval);
    if (trial) params.set("trial", trial);
    if (founding) params.set("founding", founding);
    if (demoId) params.set("demoId", demoId);
    if (intakeId) params.set("intakeId", intakeId);

    const onboardingTarget = `/onboarding${params.toString() ? `?${params.toString()}` : ""}`;

    await go(redirect || onboardingTarget);
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/30 p-6 shadow-card backdrop-blur-xl">
        <h1 className="mb-6 text-3xl font-blackops tracking-[0.08em] text-[var(--accent-copper-light)]">
          Create Account
        </h1>
        {demoId ? (
          <div className="mb-4 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[11px] text-cyan-100">
            Your preview analysis is ready to carry forward.
            {intakeId ? ` Intake: ${intakeId}` : ""}
          </div>
        ) : null}
        <form onSubmit={handleSignUp} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            autoComplete="new-password"
            minLength={6}
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full border border-[rgba(193,102,59,0.35)] bg-[var(--accent-copper)] px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
          >
            {loading ? "Creating Account..." : "Sign Up"}
          </button>
          {error && <p className="text-sm text-red-500">{error}</p>}
          {notice && <p className="text-sm text-green-400">{notice}</p>}
        </form>
      </div>
    </div>
  );
}
