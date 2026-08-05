"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import AuthShell from "@/features/auth/components/AuthShell";
import AuthStatus from "@/features/auth/components/AuthStatus";
import {
  PORTAL_SIGN_IN,
  resolvePortalSurfaceRedirect,
  type PortalSurface,
} from "@/features/auth/lib/portalSurfaceRouting";
import {
  toFleetInternalHref,
  toFleetPublicHref,
} from "@/features/fleet/lib/fleetProductRouting";
import { signInWithIdentifier } from "@/features/auth/lib/signInClient";

type PortalSignInFormProps = {
  portalType: PortalSurface;
  productHost?: boolean;
};

const inputClass =
  "w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3.5 py-3 text-sm text-[color:var(--theme-input-text)] outline-none transition placeholder:text-[color:var(--theme-text-muted)] focus:border-[var(--accent-copper)] focus:ring-4 focus:ring-[color:color-mix(in_srgb,var(--accent-copper)_16%,transparent)]";

export default function PortalSignInForm({
  portalType,
  productHost = false,
}: PortalSignInFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isFleet = portalType === "fleet";

  useEffect(() => {
    if (searchParams.get("activation") === "invalid") {
      setError(
        isFleet
          ? "This activation link is invalid or has expired. Ask your shop or fleet administrator to resend the fleet invitation."
          : "This activation link is invalid or has expired. Ask your shop to resend your customer portal invitation.",
      );
      return;
    }

    if (isFleet && searchParams.get("access") === "required") {
      setError(
        "This account does not have access to a Fleet workspace. Sign in with an invited Fleet account or ask a fleet administrator for access.",
      );
    }
  }, [isFleet, searchParams]);

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
          isFleet
            ? "We couldn't verify an invited fleet account with those details."
            : "We couldn't verify an activated customer portal account with those details.",
        );
        return;
      }

      const requestedRedirect = searchParams.get("redirect");
      const internalRedirect =
        isFleet && productHost
          ? toFleetInternalHref(requestedRedirect) ?? requestedRedirect
          : requestedRedirect;
      const internalDestination = resolvePortalSurfaceRedirect(
        internalRedirect,
        result.destination,
        portalType,
      );
      const destination =
        isFleet && productHost
          ? toFleetPublicHref(internalDestination) ?? "/"
          : internalDestination;
      router.replace(destination);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      productLabel={isFleet ? "ProFixIQ Fleet" : "Customer portal"}
      heroTitle={isFleet ? "Keep every unit moving." : "Your service, all in one place."}
      heroDescription={
        isFleet
          ? "Asset readiness, preventive maintenance, service decisions, and repair history in one dedicated Fleet workspace."
          : "Approve work, follow progress, and keep every service record connected to your vehicle."
      }
      highlights={
        isFleet
          ? ["Fleet control tower", "Maintenance planning", "Connected repair history"]
          : ["Secure approvals", "Live progress", "Service history"]
      }
    >
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">
          {isFleet ? "ProFixIQ Fleet" : "Customer portal"}
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

      {error ? <AuthStatus tone="error">{error}</AuthStatus> : null}

      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        <div>
          <label
            htmlFor="portal-identifier"
            className="mb-1.5 block text-xs font-semibold text-[color:var(--theme-text-secondary)]"
          >
            {isFleet ? "Email or fleet username" : "Email or username"}
          </label>
          <input
            id="portal-identifier"
            className={inputClass}
            type="text"
            autoComplete="username"
            placeholder={
              isFleet ? "dispatch@fleet.com or username" : "you@example.com or username"
            }
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            required
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label
              htmlFor="portal-password"
              className="text-xs font-semibold text-[color:var(--theme-text-secondary)]"
            >
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-semibold text-[var(--accent-copper)] hover:underline"
            >
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
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-copper)] px-4 py-3 text-sm font-bold text-[color:var(--theme-text-on-accent)] transition hover:brightness-105 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading
            ? "Verifying access…"
            : isFleet
              ? "Sign in to ProFixIQ Fleet"
              : "Sign in to customer portal"}
        </button>
      </form>

      <div className="mt-5 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3.5 py-3 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
        {isFleet ? (
          <>
            Fleet access is invitation-only. Contact your fleet administrator if you
            need access to this workspace.
          </>
        ) : (
          <>
            Portal access is created from your shop invitation. There is no separate
            account sign-up. If you need access, ask your shop to resend the invitation
            or{" "}
            <Link
              href="/portal/auth/sign-up"
              className="font-semibold text-[var(--accent-copper)] hover:underline"
            >
              view activation help
            </Link>
            .
          </>
        )}
      </div>

      <div className="mt-4 text-center text-xs text-[color:var(--theme-text-muted)]">
        {isFleet ? "Looking for a customer service record?" : "Managing a fleet?"}{" "}
        <Link
          href={
            isFleet && productHost
              ? `${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://profixiq.com"}${PORTAL_SIGN_IN.customer}`
              : isFleet
                ? PORTAL_SIGN_IN.customer
                : PORTAL_SIGN_IN.fleet
          }
          className="font-semibold text-[var(--accent-copper)] hover:underline"
        >
          Sign in to the {isFleet ? "customer" : "fleet"} portal
        </Link>
      </div>
    </AuthShell>
  );
}
