"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2, Truck, WifiOff } from "lucide-react";

import AuthShell from "@/features/auth/components/AuthShell";
import AuthStatus from "@/features/auth/components/AuthStatus";
import { resolveFieldPostSignInHref } from "@/features/auth/lib/accessSurfaceRouting";
import { safeInternalRedirect } from "@/features/auth/lib/safeRedirect";
import { signInWithIdentifier } from "@/features/auth/lib/signInClient";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

const FIELD_HOME = "/mobile/service";
const FIELD_SETUP = "/mobile/service/setup";

const inputClass =
  "w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3.5 py-3 text-base text-[color:var(--theme-input-text)] outline-none transition placeholder:text-[color:var(--theme-text-muted)] focus:border-[var(--accent-copper)] focus:ring-4 focus:ring-[color:color-mix(in_srgb,var(--accent-copper)_16%,transparent)]";

type FieldAccessResponse = {
  canAccessFieldService?: boolean;
  canConfigure?: boolean;
};

export default function FieldSignIn() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [identifier, setIdentifier] = useState(
    () => searchParams.get("email")?.trim().toLowerCase() ?? "",
  );
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const requestedDestination = useMemo(
    () =>
      safeInternalRedirect(searchParams.get("redirect"), FIELD_HOME, [
        FIELD_HOME,
      ]),
    [searchParams],
  );

  const forgotPasswordHref = useMemo(() => {
    const params = new URLSearchParams({
      surface: "field",
      redirect: requestedDestination,
    });
    const email = identifier.trim().toLowerCase();
    if (email.includes("@")) params.set("email", email);
    return `/forgot-password?${params.toString()}`;
  }, [identifier, requestedDestination]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (cancelled || !data.user) return;

        const response = await fetch("/api/mobile/field-service/access", {
          cache: "no-store",
        });
        const access = (await response.json().catch(() => null)) as
          | FieldAccessResponse
          | null;
        if (cancelled) return;

        if (response.ok && access?.canAccessFieldService) {
          router.replace(requestedDestination);
          return;
        }
        if (response.ok && access?.canConfigure) {
          router.replace(FIELD_SETUP);
          return;
        }

        setError(
          "This signed-in account does not have a Field workspace. Choose another ProFixIQ app or ask an owner to enable Field access.",
        );
      } catch {
        if (!cancelled) {
          setError("We couldn't verify Field access right now. Try again in a moment.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [requestedDestination, router, supabase]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");

    try {
      const result = await signInWithIdentifier({
        identifier,
        password,
        surface: "field",
      });
      if (!result.ok) {
        setError(
          "We couldn't open a Field workspace with those details. Check your sign-in or ask an owner to enable Field access.",
        );
        return;
      }

      const destination = resolveFieldPostSignInHref(
        result.destination,
        requestedDestination,
      );
      router.replace(destination);
      router.refresh();
    } catch {
      setError(
        "We couldn't reach ProFixIQ. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      productLabel="ProFixIQ Field"
      heroTitle="Your mobile service business, fully operational."
      heroDescription="Run the day from a tablet or laptop, then carry the same customers, work, parts, approvals, and invoices into the field on your phone."
      highlights={["Field Hub ready", "Multi-device workflow", "Offline-resilient work"]}
      backHref="/sign-in"
    >
      <div className="mb-6">
        <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[color:color-mix(in_srgb,var(--accent-copper)_14%,transparent)] text-[var(--accent-copper)]">
          <Truck className="h-5 w-5" aria-hidden />
        </div>
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">
          ProFixIQ Field
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[color:var(--theme-text-primary)] sm:text-4xl">
          Welcome back
        </h1>
        <p className="mt-2 text-sm leading-6 text-[color:var(--theme-text-secondary)]">
          Use your Field owner, operator, or team account.
        </p>
      </div>

      {error ? <AuthStatus tone="error">{error}</AuthStatus> : null}

      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        <div>
          <label
            htmlFor="field-identifier"
            className="mb-1.5 block text-xs font-semibold text-[color:var(--theme-text-secondary)]"
          >
            Email or username
          </label>
          <input
            id="field-identifier"
            className={inputClass}
            autoComplete="username"
            placeholder="owner@fieldbusiness.com or username"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            required
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label
              htmlFor="field-password"
              className="text-xs font-semibold text-[color:var(--theme-text-secondary)]"
            >
              Password
            </label>
            <Link
              href={forgotPasswordHref}
              className="text-xs font-semibold text-[var(--accent-copper)] hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="field-password"
              className={`${inputClass} pr-12`}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 grid w-12 place-items-center text-[color:var(--theme-text-muted)]"
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-copper)] px-4 py-3.5 text-sm font-bold text-[color:var(--theme-text-on-accent)] transition hover:brightness-105 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? "Opening Field…" : "Sign in to ProFixIQ Field"}
        </button>
      </form>

      <div className="mt-5 flex items-start gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-3 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
        <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-copper)]" aria-hidden />
        Supported job work can continue through brief connection drops after you sign in.
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs">
        <Link href="/compare-plans" className="font-semibold text-[var(--accent-copper)] hover:underline">
          Start a Field trial
        </Link>
        <Link href="/sign-in" className="font-semibold text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)] hover:underline">
          Choose another app
        </Link>
      </div>
    </AuthShell>
  );
}
