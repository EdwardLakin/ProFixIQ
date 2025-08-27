"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

// If we don't yet know a role, go to onboarding instead of /dashboard
const rolePath = (role?: string | null) =>
  role === "owner"    ? "/dashboard/owner"   :
  role === "admin"    ? "/dashboard/admin"   :
  role === "advisor"  ? "/dashboard/advisor" :
  role === "manager"  ? "/dashboard/manager" :
  role === "parts"    ? "/dashboard/parts"   :
  role === "mechanic" || role === "tech" ? "/dashboard/tech" :
  "/onboarding";

// tiny log helper (goes to Vercel logs through our diag route)
async function log(message: string, extra?: Record<string, unknown>) {
  try {
    console.log("[diag]", message, extra ?? "");
    await fetch("/api/diag/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ message, extra }),
    });
  } catch {/* ignore */}
}

export default function ConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClientComponentClient<Database>();

  // prevent multiple navigations
  const navigated = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const goToRoleHome = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) await log("supabase.getSession error", { error: error.message });

      const user = session?.user;
      await log("session check", { hasSession: !!user });

      if (!user || cancelled) return false;

      // try to fetch role; if none, send them to onboarding
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profErr) await log("profiles fetch error", { error: profErr.message });

      const path = rolePath(prof?.role ?? null);
      await log("routing to role home", { role: prof?.role ?? null, path });

      if (!cancelled && !navigated.current) {
        navigated.current = true;
        router.replace(path);
      }
      return true;
    };

    (async () => {
      const code = searchParams.get("code");
      const sessionId = searchParams.get("session_id");

      // 1) Exchange magic-link / OAuth code if present
      if (code) {
        try {
          await log("found auth code, exchanging");
          await supabase.auth.exchangeCodeForSession(code);
          await log("auth code exchanged OK");
        } catch (e) {
          await log("exchangeCodeForSession failed", { error: e instanceof Error ? e.message : String(e) });
        }
      }

      // 2) If a session already exists → route by role (or onboarding)
      const routed = await goToRoleHome();
      if (routed) return;

      // 3) If no session yet but we came from Stripe, send to signup for password+confirm
      if (sessionId && !navigated.current) {
        const dest = `/signup?session_id=${encodeURIComponent(sessionId)}`;
        await log("no session; redirecting to signup with session_id", { dest });
        navigated.current = true;
        router.replace(dest);
        return;
      }

      // 4) Fallback → sign in
      await log("no session and no session_id; redirecting to sign-in");
      if (!navigated.current) {
        navigated.current = true;
        router.replace("/sign-in");
      }
    })();

    // 5) Safety: if nothing has happened after 4s, try again with the same logic
    const safety = setTimeout(async () => {
      if (navigated.current || cancelled) return;
      await log("safety timeout: still here on /confirm; re-checking session");
      const routed = await (async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) return await goToRoleHome();
        return false;
      })();
      if (!routed && !navigated.current) {
        const sid = searchParams.get("session_id");
        navigated.current = true;
        router.replace(sid ? `/signup?session_id=${encodeURIComponent(sid)}` : "/sign-in");
      }
    }, 4000);

    // Also listen for a late session (e.g., code arrives)
    const { data: listener } = supabase.auth.onAuthStateChange(async (ev) => {
      await log("auth state change", { event: ev });
      if (!navigated.current) await goToRoleHome();
    });

    return () => {
      cancelled = true;
      clearTimeout(safety);
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