"use client";

import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

const rolePath = (role?: string | null) =>
  role === "owner"    ? "/dashboard/owner"   :
  role === "admin"    ? "/dashboard/admin"   :
  role === "advisor"  ? "/dashboard/advisor" :
  role === "manager"  ? "/dashboard/manager" :
  role === "parts"    ? "/dashboard/parts"   :
  role === "mechanic" || role === "tech" ? "/dashboard/tech" :
  "/onboarding"; // <-- default to onboarding if no role

async function log(message: string, extra?: Record<string, unknown>) {
  try {
    console.log("[confirm]", message, extra ?? "");
    await fetch("/api/diag/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ message, extra }),
    });
  } catch {}
}

export default function ConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClientComponentClient<Database>();

  const sessionId = useMemo(
    () => searchParams.get("session_id"),
    [searchParams]
  );

  useEffect(() => {
    let cancelled = false;

    const routeByState = async () => {
      // 1) Exchange auth code (magic link / OAuth)
      const code = searchParams.get("code");
      if (code) {
        try {
          await log("found auth code, exchanging");
          await supabase.auth.exchangeCodeForSession(code);
          await log("auth code exchanged OK");
        } catch (e) {
          await log("exchangeCodeForSession failed", { error: String(e) });
        }
      }

      // 2) Read current session
      const { data: { session }, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) await log("getSession error", { error: sessErr.message });

      // 2a) Came from Stripe, no Supabase session yet → go to signup to create account
      if (!session) {
        if (sessionId) {
          const dest = `/signup?session_id=${encodeURIComponent(sessionId)}`;
          await log("no session; redirecting to signup", { dest });
          if (!cancelled) router.replace(dest);
          return;
        }
        // 2b) No session and no Stripe context → sign-in
        await log("no session and no session_id; redirecting to sign-in");
        if (!cancelled) router.replace("/sign-in");
        return;
      }

      // 3) We have a session; check for a profile
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();                 // <-- important: avoid throwing when not found

      if (profErr) await log("profiles fetch error", { error: profErr.message });

      // 3a) No profile row yet → onboarding
      if (!prof) {
        const dest = sessionId
          ? `/onboarding?session_id=${encodeURIComponent(sessionId)}`
          : "/onboarding";
        await log("no profile; redirecting to onboarding", { dest });
        if (!cancelled) router.replace(dest);
        return;
      }

      // 3b) Have role → send to correct dashboard
      const path = rolePath(prof.role ?? null);
      await log("routing to role home", { role: prof.role ?? null, path });
      if (!cancelled) router.replace(path);
    };

    routeByState();

    // Also react to a late SIGNED_IN event
    const { data: listener } = supabase.auth.onAuthStateChange(async (ev) => {
      await log("auth state change", { event: ev });
      if (ev === "SIGNED_IN") routeByState();
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [router, searchParams, sessionId, supabase]);

  return (
    <div className="min-h-[60vh] grid place-items-center text-white">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Confirming your account…</h1>
        <p className="text-sm text-neutral-400">You’ll be redirected automatically.</p>
      </div>
    </div>
  );
}