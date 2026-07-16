"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { safeInternalRedirect } from "@/features/auth/lib/safeRedirect";
import { LEGAL_DOCUMENTS, legalHref } from "@/features/legal/lib/config";

const COPPER = "#C57A4A";

function operationKey(inviteId: string, userId: string): string {
  return `portal-confirm:${inviteId}:${userId}`;
}

export default function PortalConfirmPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const inviteId = searchParams.get("invite")?.trim() ?? "";
  const safeNext = safeInternalRedirect(searchParams.get("next"), "/portal", [
    "/portal",
    "/auth/set-password",
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const code = searchParams.get("code");
        if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw new Error(exchangeError.message);
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!session?.user) {
          router.replace("/portal/auth/sign-in");
          return;
        }
        if (!inviteId) {
          throw new Error(
            "This portal access link is missing its invite identity.",
          );
        }
        if (!cancelled) setReady(true);
      } catch (value: unknown) {
        if (cancelled) return;
        setError(
          value instanceof Error ? value.message : "Unable to confirm sign-in.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [inviteId, router, searchParams, supabase]);

  async function activatePortal() {
    if (!accepted || submitting || !ready) return;
    setSubmitting(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user)
        throw new Error("Sign in again to activate portal access.");

      const key = operationKey(inviteId, session.user.id);
      const response = await fetch("/api/portal/invites/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body: JSON.stringify({
          inviteId,
          operationKey: key,
          idempotencyKey: key,
          legalAccepted: true,
          portalTermsVersion: LEGAL_DOCUMENTS.portalTerms.version,
          privacyVersion: LEGAL_DOCUMENTS.privacy.version,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok)
        throw new Error(payload?.error ?? "Unable to accept portal invite.");
      router.replace(safeNext);
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "Unable to activate portal access.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background bg-[var(--theme-gradient-panel)] px-4 text-foreground">
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center py-8">
        <div className="w-full rounded-3xl border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[var(--theme-gradient-panel)] px-6 py-7 shadow-[var(--theme-shadow-medium)] sm:px-8 sm:py-9">
          <div className="mb-4 flex items-center justify-center">
            <div
              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-overlay)] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[color:var(--theme-text-secondary)]"
              style={{ color: COPPER }}
            >
              Customer Portal
            </div>
          </div>

          <h1
            className="text-center text-2xl font-semibold text-[color:var(--theme-text-primary)] sm:text-3xl"
            style={{ fontFamily: "var(--font-blackops), system-ui" }}
          >
            Completing sign-in
          </h1>

          <p className="mt-2 text-center text-xs text-[color:var(--theme-text-secondary)] sm:text-sm">
            {error
              ? "We could not complete portal access."
              : ready
                ? "Review the portal terms before linking your account."
                : "One moment… we’re securely verifying your invitation."}
          </p>

          {error ? (
            <div className="mt-4 rounded-lg border border-red-500/60 bg-red-950/70 px-3 py-2 text-xs text-red-100 shadow-[0_0_18px_rgba(127,29,29,0.5)]">
              {error}
            </div>
          ) : null}

          {ready ? (
            <div className="mt-6 space-y-4">
              <label className="flex items-start gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3.5 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(event) => setAccepted(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded"
                />
                <span>
                  I agree to the{" "}
                  <Link
                    className="font-semibold text-[var(--accent-copper)] hover:underline"
                    href={legalHref(LEGAL_DOCUMENTS.portalTerms)}
                    target="_blank"
                  >
                    Portal Terms
                  </Link>{" "}
                  and acknowledge the{" "}
                  <Link
                    className="font-semibold text-[var(--accent-copper)] hover:underline"
                    href={legalHref(LEGAL_DOCUMENTS.privacy)}
                    target="_blank"
                  >
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>
              <button
                type="button"
                onClick={() => void activatePortal()}
                disabled={!accepted || submitting}
                className="w-full rounded-xl bg-[var(--accent-copper)] px-4 py-3 text-sm font-bold text-[color:var(--theme-text-on-accent)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Activating…" : "Accept and activate portal"}
              </button>
            </div>
          ) : (
            <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]">
              <div
                className="h-full w-1/2 animate-pulse rounded-full"
                style={{ backgroundColor: COPPER }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
