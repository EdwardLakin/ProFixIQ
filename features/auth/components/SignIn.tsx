"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import AuthShell from "@/features/auth/components/AuthShell";
import { resolvePostAuthDestination } from "@/features/auth/lib/postAuthRouting";
import { normalizeAuthIdentifier } from "@/features/users/lib/username";

type Mode = "sign-in" | "sign-up";


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
  const [resendLoading, setResendLoading] = useState(false);

  // Are we in "mobile companion" sign-in mode?
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
    const params = new URLSearchParams();
    const redirect = sp.get("redirect");
    const sessionId = sp.get("session_id");
    const flow = sp.get("flow");
    if (redirect) params.set("redirect", redirect);
    if (sessionId) params.set("session_id", sessionId);
    if (flow) params.set("flow", flow);
    const tail = params.toString();
    return `${origin}/auth/callback${tail ? `?${tail}` : ""}`;
  }, [origin, sp]);

  const goLanding = () => {
    const href = "/";
    router.replace(href);
    setTimeout(() => {
      if (typeof window !== "undefined" && window.location.pathname !== href) {
        window.location.assign(href);
      }
    }, 60);
  };

  // shared helper to push a route after auth
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

  // If already signed in, route through canonical post-auth recovery logic.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session?.user) return;

      const destination = await resolvePostAuthDestination({
        supabase,
        searchParams: sp,
        isMobileMode,
      });
      await go(destination);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    const emailToUse = normalizeAuthIdentifier(identifier);

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

    const destination = await resolvePostAuthDestination({
      supabase,
      searchParams: sp,
      isMobileMode,
    });
    await go(destination);

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
      setNotice(
        "Check your inbox to confirm your email. We’ll continue after that.",
      );
      setLoading(false);
      return;
    }

    const destination = await resolvePostAuthDestination({
      supabase,
      searchParams: sp,
      isMobileMode,
    });
    await go(destination);
    setLoading(false);
  };

  const handleResendVerification = async () => {
    setError("");
    setNotice("");
    const email = identifier.trim().toLowerCase();
    if (!email.includes("@")) {
      setError("Enter your full email address to resend verification.");
      return;
    }

    setResendLoading(true);
    const { error: resendErr } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo },
    });

    if (resendErr) {
      setError(resendErr.message || "Failed to resend verification email.");
      setResendLoading(false);
      return;
    }

    setNotice("Verification email sent. Check your inbox and spam folder.");
    setResendLoading(false);
  };

  const isSignIn = mode === "sign-in";

  const goForgotPassword = () => {
    const redirect = sp.get("redirect");
    const tail = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
    router.push(`/forgot-password${tail}`);
  };

  return (
    <AuthShell
      viewportClassName="bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.16),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]"
      cardClassName="bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.2),transparent_60%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.98),#020617_82%)]"
    >
      {/* Back to landing */}
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={goLanding}
          disabled={loading}
          className="
                inline-flex items-center gap-2 rounded-full border
                border-[color:var(--metal-border-soft,#1f2937)]
                bg-black/60 px-3 py-1.5 text-[11px]
                uppercase tracking-[0.2em] text-neutral-200
                hover:bg-black/70 hover:text-white
                disabled:cursor-not-allowed disabled:opacity-60
              "
        >
          <span aria-hidden className="text-base leading-none">
            ←
          </span>
          Back
        </button>

        <div className="text-[10px] text-neutral-500">
          {isMobileMode ? "Mobile companion" : "Shop access"}
        </div>
      </div>

      {/* Brand / title */}
      <div className="mb-6 space-y-2 text-center">
        <div
          className="
                inline-flex items-center gap-1 rounded-full border
                border-[color:var(--metal-border-soft,#1f2937)]
                bg-black/70
                px-3 py-1 text-[11px]
                uppercase tracking-[0.22em]
                text-neutral-300
              "
        >
          <span
            className="text-[10px] font-semibold text-[var(--accent-copper-light)]"
            style={{ fontFamily: "var(--font-blackops), system-ui" }}
          >
            ProFixIQ
          </span>
          <span className="h-1 w-1 rounded-full bg-[var(--accent-copper-light)]" />
          <span>{isMobileMode ? "Shop • Mobile" : "Shop Dashboard"}</span>
        </div>

        <h1
          className="mt-2 text-3xl sm:text-4xl font-semibold text-white"
          style={{ fontFamily: "var(--font-blackops), system-ui" }}
        >
          {isSignIn ? "Sign in" : "Create your account"}
        </h1>

        <p className="text-xs text-muted-foreground sm:text-sm">
          {isSignIn
            ? "Use your shop username or email to access the ProFixIQ dashboard."
            : "Create a shop account with your email to get started."}
        </p>
      </div>

      {/* Mode switch */}
      <div className="mb-5 flex items-center justify-center">
        <div
          className="
                inline-flex rounded-full border
                border-[color:var(--metal-border-soft,#1f2937)]
                bg-black/70 p-1 text-xs
                shadow-[0_0_18px_rgba(15,23,42,0.8)]
              "
        >
          <button
            type="button"
            className={`px-3 py-1 rounded-full transition-all ${
              isSignIn
                ? "bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] text-black font-semibold shadow-[0_0_18px_rgba(212,118,49,0.7)]"
                : "text-neutral-300 hover:text-white"
            }`}
            onClick={() => setMode("sign-in")}
            disabled={loading}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`px-3 py-1 rounded-full transition-all ${
              !isSignIn
                ? "bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] text-black font-semibold shadow-[0_0_18px_rgba(212,118,49,0.7)]"
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
        <div className="mb-3 rounded-lg border border-red-500/60 bg-red-950/70 px-3 py-2 text-xs text-red-100 shadow-[0_0_18px_rgba(127,29,29,0.5)]">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-3 rounded-lg border border-emerald-500/60 bg-emerald-950/70 px-3 py-2 text-xs text-emerald-100 shadow-[0_0_18px_rgba(6,95,70,0.5)]">
          {notice}
        </div>
      )}

      {/* Form */}
      <form
        onSubmit={isSignIn ? handleSignIn : handleSignUp}
        className="space-y-4"
      >
        <div className="space-y-1 text-sm">
          <label className="block text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-neutral-300">
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
            className="
                  w-full rounded-lg border
                  border-[color:var(--metal-border-soft,#1f2937)]
                  bg-black/70 px-3 py-2 text-sm text-white
                  placeholder:text-neutral-500
                  focus:outline-none focus:ring-2
                  focus:ring-[var(--accent-copper-soft)]
                  focus:border-[var(--accent-copper-soft)]
                "
            required
          />
          {isSignIn && (
            <p className="text-[11px] text-muted-foreground">
              Shop accounts can sign in using the username provided by your
              admin.
            </p>
          )}
        </div>

        <div className="space-y-1 text-sm">
          <label className="block text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-neutral-300">
            Password
          </label>
          <input
            type="password"
            placeholder="••••••••"
            autoComplete={isSignIn ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="
                  w-full rounded-lg border
                  border-[color:var(--metal-border-soft,#1f2937)]
                  bg-black/70 px-3 py-2 text-sm text-white
                  placeholder:text-neutral-500
                  focus:outline-none focus:ring-2
                  focus:ring-[var(--accent-copper-soft)]
                  focus:border-[var(--accent-copper-soft)]
                "
            required
            minLength={6}
          />
        </div>

        {/* Forgot password */}
        {isSignIn && (
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={goForgotPassword}
              disabled={loading}
              className="
                    text-[11px] font-medium
                    text-[var(--accent-copper-light)]
                    hover:text-[var(--accent-copper)]
                    hover:underline underline-offset-2
                    disabled:cursor-not-allowed disabled:opacity-60
                  "
            >
              Forgot password?
            </button>
          </div>
        )}

        <button
          type="submit"
          className="
                mt-3 w-full rounded-full
                bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))]
                py-2.5 text-center text-sm
                font-semibold uppercase tracking-[0.22em] text-black
                shadow-[0_0_26px_rgba(212,118,49,0.9)]
                hover:brightness-110
                disabled:cursor-not-allowed disabled:opacity-60
              "
          style={{ fontFamily: "var(--font-blackops), system-ui" }}
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

        {!isSignIn ? (
          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-neutral-300">
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={loading || resendLoading}
              className="underline underline-offset-2 disabled:opacity-60"
            >
              {resendLoading ? "Resending..." : "Resend verification"}
            </button>
            <button
              type="button"
              onClick={() => setMode("sign-in")}
              disabled={loading || resendLoading}
              className="underline underline-offset-2 disabled:opacity-60"
            >
              Already confirmed? Continue to sign in
            </button>
          </div>
        ) : null}
      </form>

      {/* Mobile companion deep link */}
      {isSignIn && !isMobileMode && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => router.push("/sign-in?mode=mobile")}
            className="
                  text-[11px] font-medium
                  text-[var(--accent-copper-light)]
                  hover:text-[var(--accent-copper)]
                  hover:underline underline-offset-2
                "
            disabled={loading}
          >
            Sign in to mobile companion
          </button>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Opens the tech-friendly mobile layout for phones and tablets.
          </p>
        </div>
      )}

      <div className="mt-6 text-center text-[11px] text-muted-foreground">
        <p>
          By continuing you agree to our{" "}
          <a
            href="/terms"
            className="font-medium text-[var(--accent-copper-light)] hover:text-[var(--accent-copper)] hover:underline"
          >
            Terms
          </a>{" "}
          and{" "}
          <a
            href="/privacy"
            className="font-medium text-[var(--accent-copper-light)] hover:text-[var(--accent-copper)] hover:underline"
          >
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </AuthShell>
  );
}
