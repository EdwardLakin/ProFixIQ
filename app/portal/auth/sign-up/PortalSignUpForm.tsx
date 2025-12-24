// app/portal/auth/sign-up/page.tsx
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

const COPPER = "#C57A4A";

export default function PortalSignUpForm() {
  const router = useRouter();
  const supabase = createClientComponentClient<Database>();

  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");

  const [error, setError] = useState<string>("");
  const [notice, setNotice] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const goLanding = () => {
    const href = "/";
    router.replace(href);
    setTimeout(() => {
      if (typeof window !== "undefined" && window.location.pathname !== href) {
        window.location.assign(href);
      }
    }, 60);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);

    try {
      const origin =
        typeof window !== "undefined"
          ? window.location.origin
          : process.env.NEXT_PUBLIC_SITE_URL;

      const safeOrigin = (origin ?? "").replace(/\/$/, "");
      const emailRedirectTo = `${safeOrigin}/portal/auth/confirm`;

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { emailRedirectTo },
      });

      if (signUpError) {
        setError(signUpError.message);
      } else if (!data.session) {
        setNotice(
          "Check your email to confirm your account. After confirming, you’ll be signed in automatically.",
        );
      } else {
        router.replace("/portal");
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to create your account right now.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="
        min-h-screen px-4 text-foreground
        bg-background
        bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.14),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]
      "
    >
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center py-8">
        <div
          className="
            w-full rounded-3xl border
            border-[color:var(--metal-border-soft,#1f2937)]
            bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_60%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.98),#020617_82%)]
            shadow-[0_32px_80px_rgba(0,0,0,0.95)]
            px-6 py-7 sm:px-8 sm:py-9
          "
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

            <div className="text-[10px] text-neutral-500">Customer portal</div>
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
              style={{ color: COPPER }}
            >
              Customer Portal
            </div>

            <h1
              className="mt-2 text-3xl sm:text-4xl font-semibold text-white"
              style={{ fontFamily: "var(--font-blackops), system-ui" }}
            >
              Sign up
            </h1>

            <p className="text-xs text-muted-foreground sm:text-sm">
              Create your portal account to view service history and documents.
            </p>
          </div>

          {/* Error / Notice */}
          {error ? (
            <div className="mb-3 rounded-lg border border-red-500/60 bg-red-950/70 px-3 py-2 text-xs text-red-100 shadow-[0_0_18px_rgba(127,29,29,0.5)]">
              {error}
            </div>
          ) : null}

          {notice ? (
            <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-950/25 px-3 py-2 text-xs text-emerald-100 shadow-[0_0_18px_rgba(6,78,59,0.35)]">
              {notice}
            </div>
          ) : null}

          {/* Form */}
          <form onSubmit={handleSignUp} className="space-y-4">
            <div className="space-y-1 text-sm">
              <label className="block text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-neutral-300">
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
            </div>

            <div className="space-y-1 text-sm">
              <label className="block text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-neutral-300">
                Password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                placeholder="At least 6 characters"
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

            <button
              type="submit"
              disabled={loading}
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
            >
              {loading ? "Creating account…" : "Sign up"}
            </button>
          </form>

          <div className="mt-5 flex items-center justify-between text-sm text-neutral-400">
            <span>Already have an account?</span>
            <Link
              href="/portal/auth/sign-in"
              className="text-[11px] font-medium text-[var(--accent-copper-light)] hover:text-[var(--accent-copper)] hover:underline underline-offset-2"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}