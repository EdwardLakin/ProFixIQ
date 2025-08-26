// app/confirm/ConfirmContent.tsx
"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

const rolePath = (role?: string | null) =>
  role === "owner"    ? "/dashboard/owner"    :
  role === "admin"    ? "/dashboard/admin"    :
  role === "advisor"  ? "/dashboard/advisor"  :
  role === "manager"  ? "/dashboard/manager"  :
  role === "parts"    ? "/dashboard/parts"    :
  role === "mechanic" || role === "tech" ? "/dashboard/tech" :
  "/dashboard";

export default function ConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClientComponentClient<Database>();

  useEffect(() => {
    let cancelled = false;

    const log = (...args: unknown[]) =>
      console.log("[/confirm]", ...args);

    const goToRoleHome = async (): Promise<boolean> => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) log("supabase.auth.getSession error:", error.message);

      const user = session?.user;
      log("session user:", user?.id ?? null);

      if (!user || cancelled) return false;

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profErr) {
        log("profiles fetch error:", profErr.message);
        return false;
      }

      const dest = rolePath(prof?.role ?? null);
      log("profile role:", prof?.role ?? null, "→ redirect:", dest);
      if (!cancelled) router.replace(dest);
      return true;
    };

    (async () => {
      // ---- 0) Log inbound params ----
      const code = searchParams.get("code");
      const sessionId = searchParams.get("session_id");
      log("mounted with params:", { code, session_id: sessionId });

      // ---- 1) Handle magic link / OAuth code (if any) ----
      if (code) {
        try {
          log("exchanging code for session…");
          await supabase.auth.exchangeCodeForSession(code);
          log("exchangeCodeForSession: success");
        } catch (e) {
          log("exchangeCodeForSession: error", e);
        }
      }

      // ---- 2) If a session already exists, route by role ----
      const routed = await goToRoleHome();
      if (routed) {
        log("already had session → routed by role");
        return;
      }

      // ---- 3) No session yet: if coming from Stripe, send to signup ----
      if (sessionId) {
        const nextUrl = `/signup?session_id=${encodeURIComponent(sessionId)}`;
        log("no session; session_id present → redirecting to", nextUrl);
        router.replace(nextUrl);
        return;
      }

      // ---- 4) Fallback: ask user to sign in ----
      log("no session; no session_id → redirecting to /sign-in");
      router.replace("/sign-in");
    })();

    // Also listen for late-arriving sessions (e.g., after exchange)
    const { data: listener } = supabase.auth.onAuthStateChange(async (evt) => {
      log("auth state changed:", evt);
      await goToRoleHome();
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
      log("unmounted");
    };
  }, [router, searchParams, supabase]);

  return (
    <div className="min-h-[60vh] grid place-items-center text-white">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Confirming your account…</h1>
        <p className="text-sm text-neutral-400">
          You’ll be redirected automatically.
        </p>
      </div>
    </div>
  );
}