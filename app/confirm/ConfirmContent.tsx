"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

// Role → path (fallback to onboarding if no role yet)
const rolePath = (role?: string | null) =>
  role === "owner"    ? "/dashboard/owner"   :
  role === "admin"    ? "/dashboard/admin"   :
  role === "advisor"  ? "/dashboard/advisor" :
  role === "manager"  ? "/dashboard/manager" :
  role === "parts"    ? "/dashboard/parts"   :
  role === "mechanic" || role === "tech" ? "/dashboard/tech" :
  "/onboarding";

// Tiny logger to Vercel logs (via our diag route)
async function log(message: string, extra?: Record<string, unknown>) {
  try {
    // keep console noise minimal in production but helpful in dev
    if (process.env.NODE_ENV !== "production") console.log("[diag]", message, extra ?? "");
    await fetch("/api/diag/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ message, ...extra }),
    });
  } catch {
    /* ignore */
  }
}

export default function ConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClientComponentClient<Database>();

  // prevent duplicate navigations/races
  const navigated = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const hardGoto = (url: string) => {
      if (cancelled || navigated.current) return;
      navigated.current = true;
      try {
        window.location.assign(url);
      } catch {
        router.replace(url);
      }
    };

    const softReplace = (url: string) => {
      if (cancelled || navigated.current) return;
      navigated.current = true;
      // Defer one tick to avoid racing hydration, then refresh
      setTimeout(() => {
        try {
          router.replace(url);
          router.refresh();
        } catch {
          hardGoto(url);
        }
      }, 0);
    };

    // Read role (do NOT auto-insert a profile here; signup handles creation)
    const readRole = async (userId: string) => {
      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

      if (error) await log("profiles read error", { error: error.message });

      return data?.role ?? null;
    };

    const routeBySession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) await log("supabase.getSession error", { error: error.message });

      const user = data.session?.user;
      await log("session check", { hasSession: !!user });

      if (!user) return false;

      const role = await readRole(user.id);
      const dest = rolePath(role); // role → dashboard, null → onboarding
      await log("routing by role", { role, dest });
      softReplace(dest);
      return true;
    };

    (async () => {
      const code = searchParams.get("code");
      const sessionId = searchParams.get("session_id");

      // 1) If magic-link code present → exchange for a session
      if (code) {
        try {
          await log("found auth code, exchanging");
          await supabase.auth.exchangeCodeForSession(code);
          await log("auth code exchanged OK");
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await log("exchangeCodeForSession failed", { error: msg });
        }
      }

      // 2) If we already have a session → go to role dashboard or onboarding
      const routed = await routeBySession();
      if (routed) return;

      // 3) No session yet:
      //    If we came from Stripe checkout, require signup (email + magic link) first.
      if (sessionId) {
        const dest = `/signup?session_id=${encodeURIComponent(sessionId)}`;
        await log("new user from stripe; redirecting to signup", { dest });
        softReplace(dest);
        return;
      }

      // 4) Fallback to sign-in (handles direct visits or expired links)
      await log("no session and no session_id; redirecting to sign-in");
      softReplace("/sign-in");
    })();

    // 5) Safety re-check after 4s: if still here, try again and hard-redirect
    const safety = setTimeout(async () => {
      if (navigated.current || cancelled) return;
      await log("safety timeout: still here on /confirm; re-checking");
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (session?.user) {
        const role = await (async () => {
          const { data: prof } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", session.user.id)
            .maybeSingle();
          return prof?.role ?? null;
        })();
        hardGoto(rolePath(role));
        return;
      }

      const sid = searchParams.get("session_id");
      hardGoto(sid ? `/signup?session_id=${encodeURIComponent(sid)}` : "/sign-in");
    }, 4000);

    // Also respond to late-arriving session events
    const { data: listener } = supabase.auth.onAuthStateChange(async (ev) => {
      await log("auth state change", { event: ev });
      if (!navigated.current) {
        await routeBySession();
      }
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