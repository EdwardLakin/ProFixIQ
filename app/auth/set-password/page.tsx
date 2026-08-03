"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { safeInternalRedirect } from "@/features/auth/lib/safeRedirect";

import type { Database } from "@shared/types/types/supabase";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/input";

type StatusTone = "neutral" | "error" | "success";

function getReturnPath(role: string | null | undefined): string {
  const normalized = String(role ?? "").trim().toLowerCase();

  if (!normalized) return "/dashboard";

  if (normalized === "customer") return "/portal";
  if (normalized === "fleet_manager") return "/fleet";

  return "/dashboard";
}

export default function SetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const isPortalActivation = searchParams.get("mode") === "portal";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);

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
        setStatusMessage(error.message || "Unable to validate your session.");
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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!hasSession) {
      setStatusTone("error");
      setStatusMessage("No active reset session found.");
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

    try {
      setSubmitting(true);
      setStatusTone("neutral");
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
      const nextRole = data.user?.user_metadata?.role as string | undefined;

      if (userId) {
        await supabase
          .from("profiles")
          .update({
            must_change_password: false,
            updated_at: new Date().toISOString(),
          } as Database["public"]["Tables"]["profiles"]["Update"])
          .eq("id", userId);
      }

      setStatusTone("success");
      setStatusMessage(
        isPortalActivation
          ? "Portal password created. Opening your portal..."
          : "Password updated. Redirecting...",
      );

      const redirect = safeInternalRedirect(
        searchParams.get("redirect"),
        getReturnPath(nextRole),
        ["/dashboard", "/onboarding", "/portal", "/fleet", "/mobile"],
      );

      window.setTimeout(() => {
        router.replace(redirect);
      }, 700);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update password.";

      setStatusTone("error");
      setStatusMessage(message);
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
          {isPortalActivation ? "Create your portal password" : "Set new password"}
        </h1>
        <p className={`mt-3 text-sm ${statusClass}`}>{statusMessage}</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-xs text-[color:var(--theme-text-secondary)]">New password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password"
              disabled={checkingSession || submitting || !hasSession}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-[color:var(--theme-text-secondary)]">Confirm password</label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              disabled={checkingSession || submitting || !hasSession}
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={checkingSession || submitting || !hasSession}
          >
            {submitting
              ? "Saving..."
              : isPortalActivation
                ? "Create password"
                : "Update password"}
          </Button>
        </form>
      </div>
    </main>
  );
}
