"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, CarFront, Eye, EyeOff, Loader2 } from "lucide-react";
import AuthShell from "@/features/auth/components/AuthShell";
import AuthStatus from "@/features/auth/components/AuthStatus";
import { safeInternalRedirect } from "@/features/auth/lib/safeRedirect";
import { signInWithIdentifier } from "@/features/auth/lib/signInClient";

type PortalType = "customer" | "fleet";

const inputClass =
  "w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3.5 py-3 text-sm text-[color:var(--theme-input-text)] outline-none transition placeholder:text-[color:var(--theme-text-muted)] focus:border-[var(--accent-copper)] focus:ring-4 focus:ring-[color:color-mix(in_srgb,var(--accent-copper)_16%,transparent)]";

export default function PortalSignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [portalType, setPortalType] = useState<PortalType>("customer");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const requested = searchParams.get("portal");
    if (requested === "fleet" || requested === "customer") setPortalType(requested);
    if (searchParams.get("activation") === "invalid") {
      setError(
        "This activation link is invalid or has expired. Ask your shop to resend your customer portal invitation.",
      );
    }
  }, [searchParams]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const result = await signInWithIdentifier({
        identifier,
        password,
        surface: portalType,
      });
      if (!result.ok) {
        setError(
          portalType === "fleet"
            ? "We couldn't verify an invited fleet account with those details."
            : "We couldn't verify an activated customer portal account with those details.",
        );
        return;
      }
      const allowedPrefixes = portalType === "fleet" ? ["/portal/fleet"] : ["/portal"];
      const destination = safeInternalRedirect(
        searchParams.get("redirect"),
        result.destination,
        allowedPrefixes,
      );
      router.replace(destination);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const isFleet = portalType === "fleet";

  return (
    <AuthShell
      productLabel={isFleet ? "Fleet portal" : "Customer portal"}
      heroTitle={isFleet ? "Keep every unit moving." : "Your service, all in one place."}
      heroDescription={
        isFleet
          ? "Approvals, pre-trips, service requests, and shop visibility in one secure portal."
          : "Approve work, follow progress, and keep every service record connected to your vehicle."
      }
      highlights={
        isFleet
          ? ["Invite-only access", "Fleet-scoped records", "Service visibility"]
          : ["Secure approvals", "Live progress", "Service history"]
      }
    >
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">
          {isFleet ? "Fleet portal" : "Customer portal"}
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[color:var(--theme-text-primary)] sm:text-4xl">
          Sign in
        </h1>
        <p className="mt-2 text-sm leading-6 text-[color:var(--theme-text-secondary)]">
          {isFleet
            ? "Use the account activated from your fleet invitation."
            : "Use the password created from your shop invitation or QR enrollment."}
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-2">
        {(["customer", "fleet"] as const).map((value) => {
          const Icon = value === "customer" ? CarFront : Building2;
          const active = portalType === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => {
                setPortalType(value);
                setError("");
              }}
              aria-pressed={active}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-semibold transition ${
                active
                  ? "border-[var(--accent-copper)] bg-[color:color-mix(in_srgb,var(--accent-copper)_12%,transparent)] text-[color:var(--theme-text-primary)]"
                  : "border-[color:var(--theme-border-soft)] text-[color:var(--theme-text-muted)] hover:text-[color:var(--theme-text-primary)]"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {value === "customer" ? "Customer" : "Fleet"}
            </button>
          );
        })}
      </div>

      {error ? <AuthStatus tone="error">{error}</AuthStatus> : null}

      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="portal-identifier" className="mb-1.5 block text-xs font-semibold text-[color:var(--theme-text-secondary)]">
            {isFleet ? "Email or fleet username" : "Email"}
          </label>
          <input
            id="portal-identifier"
            className={inputClass}
            type={isFleet ? "text" : "email"}
            autoComplete="username"
            placeholder={isFleet ? "dispatch@fleet.com or username" : "you@example.com"}
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            required
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="portal-password" className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
              Password
            </label>
            <Link href="/forgot-password" className="text-xs font-semibold text-[var(--accent-copper)] hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="portal-password"
              className={`${inputClass} pr-11`}
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
              className="absolute inset-y-0 right-0 grid w-11 place-items-center text-[color:var(--theme-text-muted)]"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-copper)] px-4 py-3 text-sm font-bold text-[color:var(--theme-text-on-accent)] transition hover:brightness-105 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? "Verifying access…" : `Sign in to ${isFleet ? "fleet" : "customer"} portal`}
        </button>
      </form>

      <div className="mt-5 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3.5 py-3 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
        {isFleet ? (
          <>Fleet access is invitation-only. Contact your shop or fleet administrator if you need an invitation.</>
        ) : (
          <>
            Portal access is created from your shop invitation. There is no separate account sign-up. If you need access, ask your shop to resend the invitation or{" "}
            <Link href="/portal/auth/sign-up" className="font-semibold text-[var(--accent-copper)] hover:underline">
              view activation help
            </Link>
            .
          </>
        )}
      </div>
    </AuthShell>
  );
}
