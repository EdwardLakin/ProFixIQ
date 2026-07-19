"use client";

import { Eye, EyeOff, Loader2, Smartphone, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import AuthShell from "@/features/auth/components/AuthShell";
import AuthStatus from "@/features/auth/components/AuthStatus";
import { safeInternalRedirect } from "@/features/auth/lib/safeRedirect";
import { signInWithIdentifier } from "@/features/auth/lib/signInClient";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

const inputClass =
  "w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3.5 py-3 text-base text-[color:var(--theme-input-text)] outline-none transition placeholder:text-[color:var(--theme-text-muted)] focus:border-[var(--accent-copper)] focus:ring-4 focus:ring-[color:color-mix(in_srgb,var(--accent-copper)_16%,transparent)]";

export default function MobileSignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!cancelled && data.user) router.replace("/mobile");
    })();
    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const result = await signInWithIdentifier({
        identifier,
        password,
        surface: "mobile",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const destination = safeInternalRedirect(
        searchParams.get("redirect"),
        result.destination,
        ["/mobile"],
      );
      router.replace(destination);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      productLabel="Mobile companion"
      heroTitle="The shop floor, in your pocket."
      heroDescription="Capture inspections, evidence, time, and service progress from the bay without losing the thread of the work order."
      highlights={["Touch-ready", "Role protected", "Offline resilient"]}
    >
      <div className="mb-6">
        <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[color:color-mix(in_srgb,var(--accent-copper)_14%,transparent)] text-[var(--accent-copper)]">
          <Smartphone className="h-5 w-5" aria-hidden />
        </div>
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">
          Mobile companion
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[color:var(--theme-text-primary)]">
          Sign in for the shop floor
        </h1>
        <p className="mt-2 text-sm leading-6 text-[color:var(--theme-text-secondary)]">
          For authorized shop roles using a phone or tablet in the bay.
        </p>
      </div>

      {error ? <AuthStatus tone="error">{error}</AuthStatus> : null}

      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        <div>
          <label
            htmlFor="mobile-identifier"
            className="mb-1.5 block text-xs font-semibold text-[color:var(--theme-text-secondary)]"
          >
            Email or shop username
          </label>
          <input
            id="mobile-identifier"
            className={inputClass}
            autoComplete="username"
            placeholder="name@shop.com or username"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            required
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label
              htmlFor="mobile-password"
              className="text-xs font-semibold text-[color:var(--theme-text-secondary)]"
            >
              Password
            </label>
            <Link
              href="/forgot-password?redirect=%2Fmobile"
              className="text-xs font-semibold text-[var(--accent-copper)] hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="mobile-password"
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
          {loading ? "Signing in…" : "Open mobile companion"}
        </button>
      </form>

      <div className="mt-5 flex items-start gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-3 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
        <WifiOff
          className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-copper)]"
          aria-hidden
        />
        Once signed in, supported inspection work can continue through brief
        connection drops.
      </div>

      <p className="mt-5 text-center text-xs leading-5 text-[color:var(--theme-text-muted)]">
        Signing in here always returns you to the role-specific mobile workspace.
      </p>
    </AuthShell>
  );
}
