"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { safeInternalRedirect } from "@/features/auth/lib/safeRedirect";

const COPPER = "#C57A4A";

function operationKey(inviteId: string, userId: string): string {
  return `portal-confirm:${inviteId}:${userId}`;
}

export default function PortalConfirmPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const safeNext = safeInternalRedirect(searchParams.get("next"), "/portal", [
      "/portal",
      "/auth/set-password",
    ]);
    const inviteId = searchParams.get("invite")?.trim() ?? "";

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
          router.replace(
            "/portal/auth/sign-in?portal=customer&activation=invalid",
          );
          return;
        }
        if (!inviteId) {
          throw new Error("This portal access link is missing its invite identity.");
        }

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
          }),
        });
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        if (!response.ok) {
          throw new Error(payload?.error ?? "Unable to accept portal invite.");
        }

        if (!cancelled) router.replace(safeNext);
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
  }, [router, searchParams, supabase]);

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
              : "One moment… we’re securely linking your portal account."}
          </p>

          {error ? (
            <div className="mt-4 rounded-lg border border-red-500/60 bg-red-950/70 px-3 py-2 text-xs text-red-100 shadow-[0_0_18px_rgba(127,29,29,0.5)]">
              {error}
            </div>
          ) : null}

          <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]">
            <div
              className="h-full w-1/2 animate-pulse rounded-full"
              style={{ backgroundColor: COPPER }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
