"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

// Role → path (fallback to onboarding if no role yet)
const rolePath = (role?: string | null) =>
  role === "owner" ? "/dashboard/owner" :
  role === "admin" ? "/dashboard/admin" :
  role === "advisor" ? "/dashboard/advisor" :
  role === "manager" ? "/dashboard/manager" :
  role === "parts" ? "/dashboard/parts" :
  role === "mechanic" || role === "tech" ? "/dashboard/tech" :
  "/onboarding";

// tiny log helper to Vercel
async function log(message: string, extra?: Record<string, unknown>) {
  try {
    // eslint-disable-next-line no-console
    console.log("[diag]", message, extra ?? "");
    await fetch("/api/diag/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ message, extra }),
    });
  } catch {
    /* ignore */
  }
}

export default function ConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClientComponentClient<Database>();

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
      // next tick to avoid hydration races
      setTimeout(() => {
        try {
          router.replace(url);
          router.refresh();
        } catch {
          hardGoto(url);
        }
      }, 0);
    };

    // Ensure a profiles row exists; return {role|null}
    const ensureProfile = async (userId: string) => {
      // Try to read first
      const { data: prof, error } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", userId)
        .maybeSingle();

      if (error) await log("profiles read error", { error: error.message });

      if (!prof) {
        // create minimal row (many nullable columns per your schema)
        const { data: userData } = await supabase.auth.getUser();
        const { error: Err } = await supabase.from("profiles").insert({
          id: userId,
          email: userData?.user?.email ?? null,
          full_name: null,
          plan: "free",
          created_at: new Date().toISOString(),
          shop_id: null,
          business_name: null,
          phone: null,
          street: null,
          city: null,
          province: null,
          postal_code: null,
          role: null,
          shop_name: null,
        } as Database["public"]["Tables"]["profiles"]["Insert"]);

        if (Err) await log("profiles insert error", { error: Err.message });

        // re-read to get role (likely null)
        const reread = await supabase
          .from("profiles")
          .select("id, role")
          .eq("id", userId)
          .maybeSingle();

        return { role: reread.data?.role ?? null as string | null };
      }

      return { role: prof.role ?? null as string | null };
    };

    const routeBySession = async () => {
      const { data: sessionData, error } = await supabase.auth.getSession();
      if (error) await log("supabase.getSession error", { error: error.message });

      const user = sessionData?.session?.user;
      await log("session check", { hasSession: !!user });

      if (!user) return false; // caller will decide what to do

      // make sure there’s a profile row—if none, insert it
      const { role } = await ensureProfile(user.id);
      const dest = rolePath(role);
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
          await log("exchangeCodeForSession failed", {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      // 2) If we already have a session → ensure profile & go to onboarding/role
      const routed = await routeBySession();
      if (routed) return;

      // 3) No session yet:
      //    If we came from Stripe, send them to /signup to start email verification
      if (sessionId) {
        const dest = `/signup?session_id=${encodeURIComponent(sessionId)}`;
        await log("no session; redirecting to signup with session_id", { dest });
        softReplace(dest);
        return;
      }

      // 4) Fallback to sign-in (handles direct visits to /confirm)
      await log("no session and no session_id; redirecting to sign-in");
      softReplace("/sign-in");
    })();

    // 5) Safety re-check after 4s: if still here, try again / hard redirect
    const safety = setTimeout(async () => {
      if (navigated.current || cancelled) return;
      await log("safety timeout: still here on /confirm; re-checking session");

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;

      if (user) {
        const reread = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        const role = reread.data?.role ?? null;
        hardGoto(rolePath(role));
      } else {
        const sid = searchParams.get("session_id");
        hardGoto(sid ? `/signup?session_id=${encodeURIComponent(sid)}` : "/sign-in");
      }
    }, 4000);

    // Also respond to late-arriving session events
    const { data: listener } = supabase.auth.onAuthStateChange(async (ev) => {
      await log("auth state change", { event: ev });
      if (!navigated.current) await routeBySession();
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