"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import AuthShell from "@/features/auth/components/AuthShell";
import AuthStatus from "@/features/auth/components/AuthStatus";
import { resolvePostAuthDestination } from "@/features/auth/lib/postAuthRouting";
import { safeInternalRedirect } from "@/features/auth/lib/safeRedirect";
import { signInWithIdentifier } from "@/features/auth/lib/signInClient";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { claimStripeAcquisitionAfterAuth } from "@/features/stripe/lib/client/claim-acquisition";

type Mode = "sign-in" | "sign-up";
type AcquisitionContextStatus = "idle" | "loading" | "ready" | "error";

type AuthPageProps = {
  initialMode?: Mode;
};

const inputClass =
  "w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3.5 py-3 text-sm text-[color:var(--theme-input-text)] outline-none transition placeholder:text-[color:var(--theme-text-muted)] focus:border-[var(--accent-copper)] focus:ring-4 focus:ring-[color:color-mix(in_srgb,var(--accent-copper)_16%,transparent)]";

export default function AuthPage({ initialMode = "sign-in" }: AuthPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const isAcquisitionFlow = searchParams.get("flow")?.trim() === "acquisition";
  const acquisitionSessionId = useMemo(() => {
    const value = searchParams.get("session_id")?.trim() ?? "";
    return isAcquisitionFlow && /^cs_[A-Za-z0-9_]+$/.test(value) ? value : null;
  }, [isAcquisitionFlow, searchParams]);
  const [mode, setMode] = useState<Mode>(() => (isAcquisitionFlow ? "sign-up" : initialMode));
  const [identifier, setIdentifier] = useState(() => searchParams.get("email")?.trim().toLowerCase() ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(() => (searchParams.get("billing_link_error") === "1" ? "We couldn't securely link that checkout. Retry from the same checkout confirmation link." : ""));
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState<string | null>(null);
  const [acquisitionContextStatus, setAcquisitionContextStatus] = useState<AcquisitionContextStatus>(isAcquisitionFlow ? "loading" : "idle");

  const origin = useMemo(() => (typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://profixiq.com"), []);

  const emailRedirectTo = useMemo(() => {
    const params = new URLSearchParams();
    const redirect = safeInternalRedirect(searchParams.get("redirect"), "");
    const sessionId = searchParams.get("session_id")?.trim();
    const flow = searchParams.get("flow")?.trim();
    const demoId = searchParams.get("demoId")?.trim();
    const intakeId = searchParams.get("intakeId")?.trim();
    const activationContext = searchParams.get("activationContext")?.trim();
    if (redirect) params.set("redirect", redirect);
    if (sessionId) params.set("session_id", sessionId);
    if (flow) params.set("flow", flow);
    if (demoId) params.set("demoId", demoId);
    if (intakeId) params.set("intakeId", intakeId);
    if (activationContext) params.set("activationContext", activationContext);
    return `${origin}/auth/callback${params.size ? `?${params.toString()}` : ""}`;
  }, [origin, searchParams]);

  const forgotPasswordHref = useMemo(() => {
    const params = new URLSearchParams();
    const email = identifier.trim().toLowerCase();
    const redirect = safeInternalRedirect(searchParams.get("redirect"), "");
    const sessionId = searchParams.get("session_id")?.trim();
    const flow = searchParams.get("flow")?.trim();
    const demoId = searchParams.get("demoId")?.trim();
    const intakeId = searchParams.get("intakeId")?.trim();
    const activationContext = searchParams.get("activationContext")?.trim();

    if (email.includes("@")) params.set("email", email);
    if (redirect) params.set("redirect", redirect);
    if (sessionId) params.set("session_id", sessionId);
    if (flow) params.set("flow", flow);
    if (demoId) params.set("demoId", demoId);
    if (intakeId) params.set("intakeId", intakeId);
    if (activationContext) params.set("activationContext", activationContext);

    return `/forgot-password${params.size ? `?${params.toString()}` : ""}`;
  }, [identifier, searchParams]);

  const isOpsSignIn = useMemo(() => safeInternalRedirect(searchParams.get("redirect"), "") === "/ops", [searchParams]);

  useEffect(() => {
    if (!isAcquisitionFlow) return;
    if (!acquisitionSessionId) {
      setAcquisitionContextStatus("error");
      setError("This trial checkout link is invalid. Return to pricing and start a new trial.");
      return;
    }

    const controller = new AbortController();
    setAcquisitionContextStatus("loading");
    void fetch(`/api/stripe/checkout/acquisition-context?session_id=${encodeURIComponent(acquisitionSessionId)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as {
          email?: unknown;
        } | null;
        const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
        if (!response.ok || !email.includes("@")) {
          throw new Error("checkout_not_eligible");
        }
        setIdentifier(email);
        setAcquisitionContextStatus("ready");
      })
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) return;
        console.warn("stripe acquisition context unavailable", {
          name: fetchError instanceof Error ? fetchError.name : "UnknownError",
        });
        setAcquisitionContextStatus("error");
        setError("We couldn't verify this trial checkout. Return to the checkout confirmation page and try again.");
      });

    return () => controller.abort();
  }, [acquisitionSessionId, isAcquisitionFlow]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled || !data.user) return;
      const claim = await claimStripeAcquisitionAfterAuth(searchParams);
      if (cancelled) return;
      if (!claim.linked) {
        setError("We couldn't securely link that checkout to this account. Retry from the checkout confirmation link.");
        return;
      }
      const destination = await resolvePostAuthDestination({
        supabase,
        searchParams,
      });
      router.replace(destination);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams, supabase]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    setNotice("");

    try {
      if (isAcquisitionFlow && acquisitionContextStatus !== "ready") {
        setError("Wait for us to verify your trial checkout before continuing.");
        return;
      }

      if (mode === "sign-in") {
        const result = await signInWithIdentifier({
          identifier,
          password,
          surface: "shop",
          acquisitionSessionId: acquisitionSessionId ?? undefined,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const claim = await claimStripeAcquisitionAfterAuth(searchParams);
        if (!claim.linked) {
          setError("We couldn't securely link that checkout to this account. Retry from the checkout confirmation link.");
          return;
        }
        const requested = safeInternalRedirect(searchParams.get("redirect"), result.destination);
        router.replace(requested);
        router.refresh();
        return;
      }

      const email = identifier.trim().toLowerCase();
      if (!email.includes("@")) {
        setError("Use a valid email address to create a shop account.");
        return;
      }
      if (password.length < 12) {
        setError("Use at least 12 characters for your password.");
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo },
      });
      if (signUpError) {
        setError("We couldn't create the account. Check your details and try again.");
        return;
      }
      if (!data.session) {
        setPassword("");
        setPendingConfirmationEmail(email);
        setNotice("Check your inbox for the verification link. If it doesn't arrive, resend it below or choose Sign in if this account already exists.");
        return;
      }
      const claim = await claimStripeAcquisitionAfterAuth(searchParams);
      if (!claim.linked) {
        setError("Your account was created, but checkout could not be securely linked. Retry from the checkout confirmation link.");
        return;
      }
      const destination = await resolvePostAuthDestination({
        supabase,
        searchParams,
        defaultDashboardHref: "/onboarding",
      });
      router.replace(destination);
    } finally {
      setLoading(false);
    }
  }

  async function handleResendConfirmation() {
    if (!pendingConfirmationEmail || resendLoading) return;
    setResendLoading(true);
    setError("");
    setNotice("");

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: pendingConfirmationEmail,
        options: { emailRedirectTo },
      });
      if (resendError) {
        setError("We couldn't resend the verification email. Wait a minute and try again, or choose Sign in if this account is already verified.");
        return;
      }
      setNotice("Verification email resent. Check your inbox and spam folder for the newest link.");
    } finally {
      setResendLoading(false);
    }
  }

  async function handleOpsOAuthSignIn() {
    if (loading) return;
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: emailRedirectTo },
      });
      if (oauthError) {
        setError("Google sign-in is not available yet. Use email and password for now.");
      }
    } finally {
      setLoading(false);
    }
  }

  const isSignIn = mode === "sign-in";

  return (
    <AuthShell
      productLabel="Shop dashboard"
      heroTitle="The operating system for modern repair shops."
      heroDescription="Move from intake to invoice with every role, approval, and service record connected to the right shop."
      highlights={["Role-aware access", "Live work visibility", "Secure approvals"]}
    >
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">Shop dashboard</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[color:var(--theme-text-primary)] sm:text-4xl">{isSignIn ? "Welcome back" : "Create your shop account"}</h1>
        <p className="mt-2 text-sm leading-6 text-[color:var(--theme-text-secondary)]">
          {isSignIn ? "Use your shop username or account email." : "Start with the owner account; invite the rest of your team after setup."}
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-1">
        {(["sign-in", "sign-up"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setMode(value);
              setError("");
              setNotice("");
            }}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
              mode === value
                ? "bg-[color:var(--theme-surface-overlay)] text-[color:var(--theme-text-primary)] shadow-sm"
                : "text-[color:var(--theme-text-muted)] hover:text-[color:var(--theme-text-primary)]"
            }`}
          >
            {value === "sign-in" ? "Sign in" : "Create owner account"}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {error ? <AuthStatus tone="error">{error}</AuthStatus> : null}
        {notice ? <AuthStatus tone="success">{notice}</AuthStatus> : null}
      </div>

      {isOpsSignIn && isSignIn ? (
        <button
          type="button"
          disabled={loading}
          onClick={handleOpsOAuthSignIn}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-4 py-3 text-sm font-bold text-[color:var(--theme-text-primary)] transition hover:border-[var(--accent-copper)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Continue with Google
        </button>
      ) : null}

      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="shop-identifier" className="mb-1.5 block text-xs font-semibold text-[color:var(--theme-text-secondary)]">
            {isSignIn ? "Email or username" : "Owner email"}
          </label>
          <input
            id="shop-identifier"
            className={inputClass}
            type={isSignIn ? "text" : "email"}
            autoComplete={isSignIn ? "username" : "email"}
            placeholder={isSignIn ? "name@shop.com or username" : "owner@shop.com"}
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            readOnly={isAcquisitionFlow && acquisitionContextStatus === "ready"}
            aria-describedby={isAcquisitionFlow ? "acquisition-email-help" : undefined}
            required
          />
          {isAcquisitionFlow ? (
            <p id="acquisition-email-help" className="mt-1.5 text-xs text-[color:var(--theme-text-muted)]">
              {acquisitionContextStatus === "loading"
                ? "Verifying the email used for your trial checkout…"
                : acquisitionContextStatus === "ready"
                  ? "This email is locked to the completed trial checkout."
                  : "The completed trial checkout must be verified before account setup."}
            </p>
          ) : null}
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="shop-password" className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
              Password
            </label>
            {isSignIn ? (
              <Link href={forgotPasswordHref} className="text-xs font-semibold text-[var(--accent-copper)] hover:underline">
                Forgot password?
              </Link>
            ) : null}
          </div>
          <div className="relative">
            <input
              id="shop-password"
              className={`${inputClass} pr-11`}
              type={showPassword ? "text" : "password"}
              autoComplete={isSignIn ? "current-password" : "new-password"}
              placeholder={isSignIn ? "Enter your password" : "At least 12 characters"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={isSignIn ? 6 : 12}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute inset-y-0 right-0 grid w-11 place-items-center text-[color:var(--theme-text-muted)] hover:text-[color:var(--theme-text-primary)]"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || (isAcquisitionFlow && acquisitionContextStatus !== "ready")}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-copper)] px-4 py-3 text-sm font-bold text-[color:var(--theme-text-on-accent)] shadow-[0_14px_32px_color-mix(in_srgb,var(--accent-copper)_25%,transparent)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? "Please wait…" : isSignIn ? "Sign in to ProFixIQ" : "Create owner account"}
        </button>
      </form>

      {!isSignIn && pendingConfirmationEmail ? (
        <button
          type="button"
          disabled={resendLoading}
          onClick={handleResendConfirmation}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-4 py-3 text-sm font-bold text-[color:var(--theme-text-primary)] transition hover:border-[var(--accent-copper)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {resendLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {resendLoading ? "Resending…" : "Resend verification email"}
        </button>
      ) : null}

      <div className="mt-6 grid gap-2 border-t border-[color:var(--theme-border-soft)] pt-5 sm:grid-cols-3">
        <Link
          href="/mobile/sign-in"
          className="rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-2.5 text-center text-xs font-semibold text-[color:var(--theme-text-secondary)] transition hover:border-[var(--accent-copper)] hover:text-[color:var(--theme-text-primary)]"
        >
          Mobile companion
        </Link>
        <Link
          href="/portal/auth/sign-in"
          className="rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-2.5 text-center text-xs font-semibold text-[color:var(--theme-text-secondary)] transition hover:border-[var(--accent-copper)] hover:text-[color:var(--theme-text-primary)]"
        >
          Customer portal
        </Link>
        <Link
          href="/portal/auth/fleet-sign-in"
          className="rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-2.5 text-center text-xs font-semibold text-[color:var(--theme-text-secondary)] transition hover:border-[var(--accent-copper)] hover:text-[color:var(--theme-text-primary)]"
        >
          Fleet portal
        </Link>
      </div>
    </AuthShell>
  );
}
