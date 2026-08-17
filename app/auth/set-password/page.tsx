"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import {
  acquisitionHomeHref,
  acquisitionOnboardingHref,
} from "@/features/auth/lib/acquisitionSurfaceRouting";
import { resolvePostAuthDestination } from "@/features/auth/lib/postAuthRouting";
import { activatePasswordProfile } from "@/features/auth/lib/passwordActivation";
import { claimStripeAcquisitionAfterAuth } from "@/features/stripe/lib/client/claim-acquisition";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/input";

type StatusTone = "neutral" | "error" | "success";

function getReturnPath(role: string | null | undefined): string {
  const normalized = String(role ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) return "/dashboard";
  if (normalized === "customer") return "/portal";
  if (normalized === "fleet_manager") return "/fleet";
  return "/dashboard";
}

export default function SetPasswordPage() {
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const isPortalActivation = searchParams.get("mode") === "portal";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [passwordCommitted, setPasswordCommitted] = useState(false);
  const [activationUserId, setActivationUserId] = useState<string | null>(null);
  const [activationRole, setActivationRole] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<StatusTone>("neutral");
  const [statusMessage, setStatusMessage] = useState(
    isPortalActivation
      ? "Checking your portal activation..."
      : "Checking your reset session...",
  );

  useEffect(() => {
    let cancelled = false;
    async function checkSession() {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (error) {
        setHasSession(false);
        setStatusTone("error");
        setStatusMessage(
          "Unable to validate your session. Request a new link and try again.",
        );
        setCheckingSession(false);
        return;
      }
      if (!session) {
        setHasSession(false);
        setStatusTone("error");
        setStatusMessage(
          isPortalActivation
            ? "This portal activation is no longer valid. Ask your shop to resend the invitation."
            : "No active reset session found. Request a new password reset link and try again.",
        );
        setCheckingSession(false);
        return;
      }
      setHasSession(true);
      setStatusTone("neutral");
      setStatusMessage("Enter your new password.");
      setCheckingSession(false);
    }
    void checkSession();
    return () => {
      cancelled = true;
    };
  }, [isPortalActivation, supabase]);

  async function finishActivation(userId: string, role: string | null) {
    const activation = await activatePasswordProfile();
    if (!activation.ok) {
      console.error("[set-password] profile activation failed", {
        userId,
        detail: activation.detail,
      });
      setStatusTone("error");
      setStatusMessage(activation.userMessage);
      return false;
    }

    const claim = await claimStripeAcquisitionAfterAuth(searchParams);
    if (!claim.linked) {
      setStatusTone("error");
      setStatusMessage(
        "Your password was updated, but the trial could not be linked. Retry account activation from the checkout confirmation link.",
      );
      return false;
    }

    setStatusTone("success");
    setStatusMessage(
      isPortalActivation
        ? "Portal password created. Opening your portal..."
        : claim.required
          ? "Password updated. Opening your product setup..."
          : "Password updated. Redirecting...",
    );
    const redirect = await resolvePostAuthDestination({
      supabase,
      searchParams,
      defaultDashboardHref: claim.surface
        ? acquisitionHomeHref(claim.surface)
        : getReturnPath(role),
      ...(claim.surface
        ? {
            unassignedAccountHref: acquisitionOnboardingHref(claim.surface),
          }
        : {}),
    });
    window.setTimeout(() => window.location.replace(redirect), 700);
    return true;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!hasSession) {
      setStatusTone("error");
      setStatusMessage("No active reset session found.");
      return;
    }

    try {
      setSubmitting(true);
      setStatusTone("neutral");

      if (passwordCommitted && activationUserId) {
        setStatusMessage("Retrying account activation...");
        await finishActivation(activationUserId, activationRole);
        return;
      }

      const trimmedPassword = password.trim();
      const trimmedConfirm = confirmPassword.trim();
      if (!trimmedPassword) {
        setStatusTone("error");
        setStatusMessage("Password is required.");
        return;
      }
      if (trimmedPassword.length < 12) {
        setStatusTone("error");
        setStatusMessage("Password must be at least 12 characters.");
        return;
      }
      if (trimmedPassword !== trimmedConfirm) {
        setStatusTone("error");
        setStatusMessage("Passwords do not match.");
        return;
      }

      setStatusMessage("Saving your new password...");
      const { data, error } = await supabase.auth.updateUser({
        password: trimmedPassword,
      });
      if (error) {
        setStatusTone("error");
        setStatusMessage(error.message || "Failed to update password.");
        return;
      }

      const userId = data.user?.id ?? null;
      const role =
        (data.user?.user_metadata?.role as string | undefined) ?? null;
      if (!userId) {
        setStatusTone("error");
        setStatusMessage(
          "Password updated, but the account could not be identified. Contact support.",
        );
        return;
      }

      setPasswordCommitted(true);
      setActivationUserId(userId);
      setActivationRole(role);
      setPassword("");
      setConfirmPassword("");
      setStatusMessage("Password updated. Activating your account...");
      await finishActivation(userId, role);
    } catch (error) {
      console.error("[set-password] unexpected activation error", error);
      setStatusTone("error");
      setStatusMessage(
        "Unable to finish account setup. Retry activation or contact support.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const statusClass =
    statusTone === "error"
      ? "text-red-300"
      : statusTone === "success"
        ? "text-emerald-300"
        : "text-[color:var(--theme-text-secondary)]";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[color:var(--theme-surface-page)] px-6 py-10 text-[color:var(--theme-text-primary)]">
      <div className="w-full max-w-md rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-6 shadow-2xl">
        <h1 className="text-2xl font-semibold text-[color:var(--theme-text-primary)]">
          {isPortalActivation
            ? "Create your portal password"
            : "Set new password"}
        </h1>
        <p className={`mt-3 text-sm ${statusClass}`}>{statusMessage}</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-xs text-[color:var(--theme-text-secondary)]">
              New password
            </label>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={
                passwordCommitted
                  ? "Password already updated"
                  : "Enter new password"
              }
              disabled={
                checkingSession ||
                submitting ||
                !hasSession ||
                passwordCommitted
              }
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-[color:var(--theme-text-secondary)]">
              Confirm password
            </label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder={
                passwordCommitted
                  ? "Password already updated"
                  : "Confirm new password"
              }
              disabled={
                checkingSession ||
                submitting ||
                !hasSession ||
                passwordCommitted
              }
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={checkingSession || submitting || !hasSession}
          >
            {submitting
              ? passwordCommitted
                ? "Activating..."
                : "Saving..."
              : passwordCommitted
                ? "Retry account activation"
                : isPortalActivation
                  ? "Create password"
                  : "Update password"}
          </Button>
        </form>
      </div>
    </main>
  );
}
