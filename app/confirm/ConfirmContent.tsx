"use client";

import { useEffect } from "react";
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
  // 👇 default for new users with no role yet
  "/onboarding";

// tiny server logger so we can see flow in Vercel logs (optional)
async function log(message: string, extra?: Record<string, unknown>) {
  try {
    console.log("[confirm]", message, extra ?? "");
    await fetch("/api/diag/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ message, extra }),
    });
  } catch { /* ignore */ }
}

export default function ConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClientComponentClient<Database>();

  useEffect(() => {
    let cancelled = false;

    const goToRoleHome = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) await log("supabase.getSession error", { error: error.message });

      const user = session?.user;
      await log("session check", { hasSession: !!user });
      if (!user || cancelled) return false;

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profErr) await log("profiles fetch error", { error: profErr.message });

      const path = rolePath(prof?.role ?? null);
      await log("routing to role home", { role: prof?.role ?? null, path });
      if (!cancelled) router.replace(path);
      return true;
    };

    (async () => {
      // 1) If we have an auth `code` (magic link / OAuth), exchange it
      const code = searchParams.get("code");
      if (code) {
        try {
          await log("found auth code, exchanging");
          await supabase.auth.exchangeCodeForSession(code);
          await log("auth code exchanged OK");
        } catch (e) {
          await log("exchangeCodeForSession failed", { error: e instanceof Error ? e.message : String(e) });
        }
      }

      // 2) If we already have a session, route by role (falls back to /onboarding)
      const routed = await goToRoleHome();
      if (routed) return;

      // 3) If no session yet but we have Stripe session_id → go to /signup
      const sessionId = searchParams.get("session_id");
      if (sessionId) {
        const dest = `/signup?session_id=${encodeURIComponent(sessionId)}`;
        await log("no session; redirecting to signup with session_id", { dest });
        router.replace(dest);
        return;
      }

      // 4) Otherwise: sign in
      await log("no session and no session_id; redirecting to sign-in");
      router.replace("/sign-in");
    })();

    // Watch for a late session and route as soon as it exists
    const { data: listener } = supabase.auth.onAuthStateChange(async (ev) => {
      await log("auth state change", { event: ev });
      await goToRoleHome();
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [router, searchParams, supabase]);

  return (
    <div className="min-h-[60vh] grid place-items-center text-white">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Confirming your account…</h1>
        <p className="text-sm text-neutral-400">You’ll be redirected automatically.</p>
      </div>
    </div>
  );
}