// app/portal/auth/confirm/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

const COPPER = "#C57A4A";

type CustomersRow = Database["public"]["Tables"]["customers"]["Row"];
type CustomersInsert = Database["public"]["Tables"]["customers"]["Insert"];

/**
 * Portal Confirm
 * -----------------------------------------------------------------------------
 * Handles magic-link / email confirmation:
 *  - Reads ?code from Supabase PKCE magic link
 *  - exchangeCodeForSession(code)
 *  - Ensures a `customers` row is linked to this user (portal profile)
 *  - If session -> redirect to safe `next` or /portal
 *  - If no session -> redirect to /portal/auth/sign-in
 */
export default function PortalConfirmPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const supabase = useMemo(() => createClientComponentClient<Database>(), []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const safeNext = (() => {
      const n = searchParams.get("next") || "";
      if (!n.startsWith("/")) return "/portal";
      if (n.startsWith("//")) return "/portal";
      if (n.includes("\n") || n.includes("\r")) return "/portal";
      return n;
    })();

    (async () => {
      try {
        // Supabase magic link (PKCE) returns ?code=...
        const code = searchParams.get("code");
        if (code) {
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(
            code,
          );
          if (exErr) throw new Error(exErr.message);
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (cancelled) return;

        if (!session?.user) {
          router.replace("/portal/auth/sign-in");
          return;
        }

        // -------------------------------------------------------------------
        // Ensure this authed user has a portal customer profile.
        // Try to attach to an existing customer row by email first (so we
        // keep the shop_id + history from the work order), otherwise create.
        // -------------------------------------------------------------------
        try {
          const email = session.user.email ?? null;
          if (email) {
            const { data: existing, error: findErr } = await supabase
              .from("customers")
              .select("id, shop_id, user_id")
              .eq("email", email.toLowerCase())
              .limit(1);

            if (!findErr && existing && existing.length > 0) {
              const row = existing[0] as CustomersRow;
              if (!row.user_id) {
                await supabase
                  .from("customers")
                  .update({ user_id: session.user.id })
                  .eq("id", row.id);
              }
            } else {
              const insertPayload: CustomersInsert = {
                user_id: session.user.id,
                email: email.toLowerCase(),
              };
              await supabase
                .from("customers")
                .upsert(insertPayload, { onConflict: "user_id" });
            }
          }
        } catch {
          // If this fails, we still let them in; they just might not see WOs yet.
        }

        // ✅ Land on safe `next` or /portal
        router.replace(safeNext || "/portal");
      } catch (e: unknown) {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Unable to confirm sign-in.",
        );
        router.replace("/portal/auth/sign-in");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams, supabase]);

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
          <div className="mb-4 flex items-center justify-center">
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
              Customer Portal
            </div>
          </div>

          <h1
            className="text-center text-2xl sm:text-3xl font-semibold text-white"
            style={{ fontFamily: "var(--font-blackops), system-ui" }}
          >
            Completing sign-in
          </h1>

          <p className="mt-2 text-center text-xs text-neutral-400 sm:text-sm">
            {error
              ? "Sign-in failed — redirecting…"
              : "One moment… we’re completing your sign-in."}
          </p>

          {error ? (
            <div className="mt-4 rounded-lg border border-red-500/60 bg-red-950/70 px-3 py-2 text-xs text-red-100 shadow-[0_0_18px_rgba(127,29,29,0.5)]">
              {error}
            </div>
          ) : null}

          <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full border border-white/10 bg-white/5">
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