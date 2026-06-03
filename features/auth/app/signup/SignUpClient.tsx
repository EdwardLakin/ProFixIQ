// features/auth/components/SignUpClient.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import {
  appendActivationContextToHref,
  parseActivationContextFromSearchParams,
  persistActivationContext,
} from "@/features/integrations/shopBoost/activationContext";
import { trackShopBoostEvent } from "@/features/analytics/shopBoostEvents";
import { resolvePostAuthDestination } from "@/features/auth/lib/postAuthRouting";

export default function SignUpClient() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();
  const sp = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const demoId = sp.get("demoId");
  const intakeId = sp.get("intakeId");
  const activationContext = parseActivationContextFromSearchParams(sp);

  const origin = useMemo(() => {
    if (typeof window !== "undefined") return window.location.origin;
    if (process.env.NEXT_PUBLIC_SITE_URL) {
      return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
    }
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return "http://localhost:3000";
  }, []);

  const emailRedirectTo = useMemo(() => {
    const params = new URLSearchParams();

    const redirect = sp.get("redirect");
    const sessionId = sp.get("session_id");
    const flow = sp.get("flow");
    const demoIdParam = sp.get("demoId");
    const intakeIdParam = sp.get("intakeId");
    const activationContextRaw = sp.get("activationContext");

    if (redirect) params.set("redirect", redirect);
    if (sessionId) params.set("session_id", sessionId);
    if (flow) params.set("flow", flow);
    if (demoIdParam) params.set("demoId", demoIdParam);
    if (intakeIdParam) params.set("intakeId", intakeIdParam);
    if (activationContextRaw) {
      params.set("activationContext", activationContextRaw);
    }

    const tail = params.toString();
    return `${origin}/auth/callback${tail ? `?${tail}` : ""}`;
  }, [origin, sp]);

  useEffect(() => {
    if (!activationContext) return;
    persistActivationContext(activationContext);
  }, [activationContext]);

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
      if (!data?.user) return;

      const redirect = sp.get("redirect");
      const destination = redirect
        ? activationContext
          ? appendActivationContextToHref(redirect, activationContext)
          : redirect
        : await resolvePostAuthDestination({
            supabase,
            searchParams: sp,
          });

      router.replace(destination);
    })();
  }, [activationContext, router, sp, supabase]);

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
        "Check your email to confirm your account. After confirmation, we’ll continue your selected plan and bring you straight into setup.",
      );
      setLoading(false);
      return;
    }

    const redirect = sp.get("redirect");
    const params = new URLSearchParams();

    const demoIdParam = sp.get("demoId");
    const intakeIdParam = sp.get("intakeId");
    const sessionIdParam = sp.get("session_id");
    const flowParam = sp.get("flow");

    if (demoIdParam) params.set("demoId", demoIdParam);
    if (intakeIdParam) params.set("intakeId", intakeIdParam);
    if (sessionIdParam) params.set("session_id", sessionIdParam);
    if (flowParam) params.set("flow", flowParam);

    const onboardingTarget = `/onboarding/v2${
      params.toString() ? `?${params.toString()}` : ""
    }`;

    const destination = activationContext
      ? appendActivationContextToHref(
          redirect || onboardingTarget,
          activationContext,
        )
      : redirect || onboardingTarget;

    trackShopBoostEvent("signup_completed", {
      demoId: demoId ?? "unknown",
      intakeId: intakeId ?? undefined,
      source: "signup_form",
    });

    await go(destination);
    setLoading(false);
  };

  const handleResendVerification = async () => {
    setError("");
    setNotice("");
    const resendEmail = email.trim().toLowerCase();
    if (!resendEmail) {
      setError("Enter your email first, then resend verification.");
      return;
    }

    setResendLoading(true);
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: resendEmail,
      options: { emailRedirectTo },
    });

    if (resendError) {
      setError(resendError.message || "Failed to resend verification email.");
      setResendLoading(false);
      return;
    }

    setNotice("Verification email sent. Check your inbox and spam folder.");
    setResendLoading(false);
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

          <div className="flex flex-wrap gap-3 pt-1 text-xs">
            <button
              type="button"
              disabled={resendLoading || loading}
              onClick={handleResendVerification}
              className="text-[var(--accent-copper-light)] underline underline-offset-2 disabled:opacity-60"
            >
              {resendLoading ? "Resending..." : "Resend verification"}
            </button>
            <a href="/sign-in" className="text-neutral-300 underline underline-offset-2">
              Already confirmed? Continue to sign in
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
