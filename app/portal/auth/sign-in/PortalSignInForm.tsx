// app/portal/auth/sign-in/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

// ✅ you said you added this already
import {
  resolvePortalMode,
  type PortalMode,
} from "@/features/portal/lib/resolvePortalMode";

const COPPER = "#C57A4A";

type PortalType = "customer" | "fleet";

function safeRedirectPath(v: string | null): string | null {
  // only allow internal redirects
  if (!v) return null;
  if (!v.startsWith("/")) return null;
  if (v.startsWith("//")) return null;
  return v;
}

function isAllowedRedirectForMode(path: string, mode: PortalMode) {
  if (mode === "fleet") return path.startsWith("/portal/fleet");
  // customer portal: allow /portal/* BUT NOT /portal/fleet/*
  return path.startsWith("/portal") && !path.startsWith("/portal/fleet");
}

export default function PortalSignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);

  const [portalType, setPortalType] = useState<PortalType>("customer");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  // Detect ?portal=fleet or ?portal=customer to pre-select mode
  useEffect(() => {
    const portalParam = searchParams.get("portal");
    if (portalParam === "fleet" || portalParam === "customer") {
      setPortalType(portalParam);
    }
  }, [searchParams]);

  const goLanding = () => {
    const href = "/";
    router.replace(href);
    setTimeout(() => {
      if (typeof window !== "undefined" && window.location.pathname !== href) {
        window.location.assign(href);
      }
    }, 60);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setError("");

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(signInError.message || "Sign in failed.");
      setLoading(false);
      return;
    }

    // ✅ Determine actual portal mode for this account (source of truth = DB)
    let mode: PortalMode = "customer";

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("No authenticated user after sign-in");

      mode = await resolvePortalMode(supabase, user.id);
    } catch {
      mode = "customer";
    }

    // If user selected Fleet but their account isn't fleet-enabled, block + sign out
    if (portalType === "fleet" && mode !== "fleet") {
      await supabase.auth.signOut().catch(() => null);
      setError(
        "This account doesn't have Fleet Portal access. Switch to Customer, or contact your shop/dispatch to enable fleet access.",
      );
      setLoading(false);
      return;
    }

    // Respect middleware redirect param if it matches the resolved mode
    const redirectParam = safeRedirectPath(searchParams.get("redirect"));
    const fallback = mode === "fleet" ? "/portal/fleet" : "/portal";

    const to =
      redirectParam && isAllowedRedirectForMode(redirectParam, mode)
        ? redirectParam
        : fallback;

    router.replace(to);
  };

  const portalLabel = portalType === "fleet" ? "Fleet Portal" : "Customer Portal";

  const helperCopy =
    portalType === "fleet"
      ? "Use your fleet login from the shop or dispatch to see assigned units, pre-trips, and service requests."
      : "Use the email and password you created when you signed up.";

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

            <div className="text-[10px] text-neutral-500">
              {portalType === "fleet" ? "Fleet access" : "Customer access"}
            </div>
          </div>

          {/* Portal switcher */}
          <div className="mb-4 flex items-center justify-center gap-2 rounded-full border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 p-1 text-[11px]">
            <button
              type="button"
              onClick={() => setPortalType("customer")}
              className={`flex-1 rounded-full px-3 py-1 uppercase tracking-[0.18em] transition ${
                portalType === "customer"
                  ? "bg-[color:var(--accent-copper)] text-black font-semibold shadow-[0_0_18px_rgba(197,122,74,0.85)]"
                  : "text-neutral-300 hover:bg-black/60"
              }`}
            >
              Customer
            </button>
            <button
              type="button"
              onClick={() => setPortalType("fleet")}
              className={`flex-1 rounded-full px-3 py-1 uppercase tracking-[0.18em] transition ${
                portalType === "fleet"
                  ? "bg-[color:var(--accent-copper)] text-black font-semibold shadow-[0_0_18px_rgba(197,122,74,0.85)]"
                  : "text-neutral-300 hover:bg-black/60"
              }`}
            >
              Fleet
            </button>
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
              {portalLabel}
            </div>

            <h1
              className="mt-2 text-3xl sm:text-4xl font-semibold text-white"
              style={{ fontFamily: "var(--font-blackops), system-ui" }}
            >
              Sign in
            </h1>

            <p className="text-xs text-muted-foreground sm:text-sm">{helperCopy}</p>
          </div>

          {/* Error */}
          {error ? (
            <div className="mb-3 rounded-lg border border-red-500/60 bg-red-950/70 px-3 py-2 text-xs text-red-100 shadow-[0_0_18px_rgba(127,29,29,0.5)]">
              {error}
            </div>
          ) : null}

          {/* Form */}
          <form onSubmit={handleSignIn} className="space-y-4">
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
                autoComplete="current-password"
                placeholder="••••••••"
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
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {/* Footer copy differs by portal type */}
          <div className="mt-5 flex items-center justify-between text-sm text-neutral-400">
            {portalType === "customer" ? (
              <>
                <span>Need an account?</span>
                <Link
                  href="/portal/auth/sign-up"
                  className="text-[11px] font-medium text-[var(--accent-copper-light)] hover:text-[var(--accent-copper)] hover:underline underline-offset-2"
                >
                  Sign up
                </Link>
              </>
            ) : (
              <p className="text-[11px] text-neutral-400">
                Fleet logins are created by your shop or dispatch. If you need access,
                contact your shop administrator.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}